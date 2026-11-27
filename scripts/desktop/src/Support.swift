// Shared pieces: errors, argument parsing, JSON output, the take layout, safe file writes, window lookup.
import AppKit
import Foundation

struct Failure: Error, CustomStringConvertible { let description: String }

func fail(_ message: String) -> Failure { Failure(description: message) }

// MARK: - arguments

struct Args {
    private(set) var positional: [String] = []
    private(set) var options: [String: String] = [:]
    private(set) var flags: Set<String> = []
    static let flagNames: Set<String> = ["double", "right", "no-open"]
    static let optionNames: Set<String> = [
        "app", "title", "x", "y", "w", "h", "out", "fps", "max-seconds", "steps", "delay", "for", "frames",
        "role", "cursor", "window", "pointer",
    ]

    init(_ raw: [String]) throws {
        var index = 0
        var onlyPositional = false
        while index < raw.count {
            let item = raw[index]
            if !onlyPositional, item == "--" {
                onlyPositional = true
            } else if !onlyPositional, item.hasPrefix("--") {
                let name = String(item.dropFirst(2))
                if Args.flagNames.contains(name) {
                    flags.insert(name)
                } else if Args.optionNames.contains(name) {
                    guard index + 1 < raw.count else { throw fail("--\(name) needs a value") }
                    options[name] = raw[index + 1]
                    index += 1
                } else {
                    throw fail("unknown option --\(name)")
                }
            } else {
                positional.append(item)
            }
            index += 1
        }
    }

    func number(_ name: String, _ fallback: Double, in range: ClosedRange<Double>) throws -> Double {
        guard let text = options[name] else { return fallback }
        guard let value = Double(text), value.isFinite, range.contains(value) else {
            throw fail("--\(name) must be a number from \(range.lowerBound.clean) to \(range.upperBound.clean), got \(text)")
        }
        return value
    }

    func position(_ index: Int, _ label: String) throws -> String {
        guard index < positional.count else { throw fail("missing \(label)\n\(usage)") }
        return positional[index]
    }

    func positionNumber(_ index: Int, _ label: String) throws -> Double {
        let text = try position(index, label)
        guard let value = Double(text), value.isFinite, abs(value) < 100_000 else { throw fail("\(label) must be a number, got \(text)") }
        return value
    }

    func required(_ name: String) throws -> String {
        guard let value = options[name], !value.isEmpty else { throw fail("--\(name) is required") }
        return value
    }
}

extension Double {
    var clean: String { self == rounded() ? String(Int(self)) : String(self) }
    func rounded(places: Int) -> Double { let factor = pow(10, Double(places)); return (self * factor).rounded() / factor }
}

func jsonString(_ value: Any) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
          let text = String(data: data, encoding: .utf8) else { return "{}" }
    return text
}

func printJSON(_ value: Any) { print(jsonString(value)) }

func warn(_ message: String) { FileHandle.standardError.write(Data("deskcap: \(message)\n".utf8)) }

func sleepMilliseconds(_ ms: Double) { Thread.sleep(forTimeInterval: max(0, ms) / 1000) }

/// Epoch seconds that never step backwards during a run (wall clock at start + monotonic uptime).
enum Clock {
    private static let wallAtStart = Date().timeIntervalSince1970
    private static let uptimeAtStart = ProcessInfo.processInfo.systemUptime
    static func now() -> Double { wallAtStart + (ProcessInfo.processInfo.systemUptime - uptimeAtStart) }
}

// MARK: - take layout

/// How a window sits in the 2880x1620 frame. Blur boxes and scout rects are converted with it, so
/// they stay right when the window is not 16:9 (the frame is then letterboxed).
struct Layout: Codable {
    static let frameWidth = 2880.0
    static let frameHeight = 1620.0
    static let canonicalWidth = 1440.0  // the space blur-filter.py reads (CSS_WIDTH default)
    static let sourceScale = 1920.0 / 2880.0  // frame px -> px of the 1080p take

    let windowWidth: Double
    let windowHeight: Double
    let scale: Double  // frame px per window point
    let offsetX: Double  // frame px
    let offsetY: Double

    init(window: CGSize) {
        windowWidth = window.width
        windowHeight = window.height
        scale = min(Layout.frameWidth / window.width, Layout.frameHeight / window.height)
        offsetX = ((Layout.frameWidth - window.width * scale) / 2).rounded()
        offsetY = ((Layout.frameHeight - window.height * scale) / 2).rounded()
    }

    /// Window points -> frame px.
    func frameRect(_ rect: CGRect) -> CGRect {
        CGRect(x: offsetX + rect.minX * scale, y: offsetY + rect.minY * scale, width: rect.width * scale, height: rect.height * scale)
    }

    func framePoint(_ point: CGPoint) -> CGPoint { CGPoint(x: offsetX + point.x * scale, y: offsetY + point.y * scale) }

    /// Window points -> the 1440-wide space of blur.jsonl.
    func canonicalRect(_ rect: CGRect) -> CGRect {
        let frame = frameRect(rect), factor = Layout.canonicalWidth / Layout.frameWidth
        return CGRect(x: frame.minX * factor, y: frame.minY * factor, width: frame.width * factor, height: frame.height * factor)
    }

    /// Window points -> source px of the 1080p take (scout rects, demo.json crops and highlights).
    func sourceRect(_ rect: CGRect) -> [Double] {
        let frame = frameRect(rect)
        return [frame.minX, frame.minY, frame.width, frame.height].map { ($0 * Layout.sourceScale).rounded(places: 1) }
    }

    var windowRect: CGRect { CGRect(x: 0, y: 0, width: windowWidth, height: windowHeight) }

    static func load(from directory: URL) throws -> Layout {
        let url = directory.appendingPathComponent("layout.json")
        guard let data = try? readNoFollow(url) else { throw fail("\(directory.path) has no layout.json; start `deskcap record` for this take first") }
        do { return try JSONDecoder().decode(Layout.self, from: data) } catch { throw fail("bad layout.json in \(directory.path): \(error)") }
    }
}

// MARK: - files (never follow a symlink planted in a take folder)

func openNoFollow(_ url: URL, flags: Int32) throws -> FileHandle {
    let descriptor = open(url.path, flags | O_NOFOLLOW | O_CLOEXEC, 0o644)
    guard descriptor >= 0 else { throw fail("cannot open \(url.path): \(String(cString: strerror(errno)))") }
    return FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
}

func writeNoFollow(_ url: URL, _ data: Data, exclusive: Bool = false) throws {
    let handle = try openNoFollow(url, flags: O_WRONLY | O_CREAT | (exclusive ? O_EXCL : O_TRUNC))
    try handle.write(contentsOf: data)
}

func appendNoFollow(_ url: URL, _ line: String) throws {
    let handle = try openNoFollow(url, flags: O_WRONLY | O_CREAT | O_APPEND)
    try handle.write(contentsOf: Data(line.utf8))
}

func readNoFollow(_ url: URL) throws -> Data {
    let handle = try openNoFollow(url, flags: O_RDONLY)
    return try handle.readToEnd() ?? Data()
}

/// The folder must be a real directory (not a symlink) and empty, or not exist yet.
func prepareTakeFolder(_ directory: URL) throws {
    var info = stat()
    if lstat(directory.path, &info) == 0 {
        guard info.st_mode & S_IFMT == S_IFDIR else { throw fail("\(directory.path) is not a plain folder (symlink or file)") }
        let entries = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        guard entries.filter({ $0 != ".DS_Store" }).isEmpty else {
            throw fail("\(directory.path) is not empty (an earlier take?); pick a new folder such as frames/_tmpNN")
        }
    } else {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
}

func requireFolder(_ directory: URL) throws {
    var info = stat()
    guard lstat(directory.path, &info) == 0 else { throw fail("\(directory.path) does not exist; start the take first") }
    guard info.st_mode & S_IFMT == S_IFDIR else { throw fail("\(directory.path) is not a plain folder (symlink or file)") }
}

func freeBytes(at directory: URL) throws -> Int64 {
    guard let free = try? directory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        .volumeAvailableCapacityForImportantUsage else { throw fail("cannot read the free space at \(directory.path)") }
    return free
}

let minimumFreeBytes = Int64((Double(ProcessInfo.processInfo.environment["DEMO_MIN_FREE_GB"] ?? "4") ?? 4) * 1_073_741_824)

// MARK: - windows

struct WindowInfo {
    let id: CGWindowID
    let pid: pid_t
    let app: String
    let title: String
    let bounds: CGRect  // global points, top-left origin (same space as CGEvent and AX positions)

    var json: [String: Any] {
        ["id": Int(id), "pid": Int(pid), "app": app, "title": title,
         "x": bounds.minX, "y": bounds.minY, "w": bounds.width, "h": bounds.height]
    }
}

func listWindows(app: String? = nil, title: String? = nil) -> [WindowInfo] {
    let raw = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    return raw.compactMap { entry in
        guard (entry[kCGWindowLayer as String] as? Int) == 0,
              let id = entry[kCGWindowNumber as String] as? CGWindowID,
              let pid = entry[kCGWindowOwnerPID as String] as? pid_t,
              let owner = entry[kCGWindowOwnerName as String] as? String,
              let boundsDict = entry[kCGWindowBounds as String] as? NSDictionary,
              let bounds = CGRect(dictionaryRepresentation: boundsDict),
              bounds.width > 50, bounds.height > 50 else { return nil }
        let name = entry[kCGWindowName as String] as? String ?? ""
        if let app, owner.caseInsensitiveCompare(app) != .orderedSame { return nil }
        if let title, !name.localizedCaseInsensitiveContains(title) { return nil }
        return WindowInfo(id: id, pid: pid, app: owner, title: name, bounds: bounds)
    }
}

/// The app's largest on-screen window (its main window rather than a palette), or the one whose title matches.
func findWindow(_ args: Args) throws -> WindowInfo {
    let app = try args.required("app")
    let title = args.options["title"]
    let matches = listWindows(app: app, title: title)
    guard let window = matches.max(by: { $0.bounds.width * $0.bounds.height < $1.bounds.width * $1.bounds.height }) else {
        let names = Set(listWindows().map(\.app)).sorted().joined(separator: ", ")
        var message = "no on-screen window for app \"\(app)\""
        if let title {
            message += " with title \"\(title)\""
            if !CGPreflightScreenCaptureAccess() { message += " (window titles need Screen Recording permission)" }
        }
        throw fail("\(message). Apps with windows: \(names)")
    }
    return window
}
