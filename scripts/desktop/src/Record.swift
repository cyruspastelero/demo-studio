// record / stop / blur / shot / selftest: everything that writes a take folder or a still.
import AppKit
import CoreImage
import Foundation
import ScreenCaptureKit
import UniformTypeIdentifiers

let screenRecordingHelp = "Screen Recording permission is missing. Turn it on for your terminal in System Settings > Privacy & Security > Screen Recording, then restart the terminal."

func requireScreenRecording() throws {
    guard CGPreflightScreenCaptureAccess() else {
        CGRequestScreenCaptureAccess()
        throw fail(screenRecordingHelp)
    }
}

/// State shared by the capture queue, the compositor thread, signal handlers and the main loop.
final class RecordState: @unchecked Sendable {
    private let lock = NSLock()
    private var stopRequested = false
    private var streamError: String?
    private var latest: CGImage?
    private var version = 0
    private var compositorDone = false

    var shouldStop: Bool { lock.withLock { stopRequested } }
    var error: String? { lock.withLock { streamError } }
    func requestStop() { lock.withLock { stopRequested = true } }
    func fail(_ message: String) { lock.withLock { streamError = streamError ?? message; stopRequested = true } }
    func setLatest(_ image: CGImage) { lock.withLock { latest = image; version += 1 } }
    func current() -> (CGImage, Int)? { lock.withLock { latest.map { ($0, version) } } }
    var isCompositorDone: Bool { lock.withLock { compositorDone } }
    func markCompositorDone() { lock.withLock { compositorDone = true } }
}

final class StreamOutput: NSObject, SCStreamOutput, SCStreamDelegate {
    let state: RecordState
    private let images = CIContext()

    init(state: RecordState) { self.state = state }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let rawStatus = attachments.first?[.status] as? Int, SCFrameStatus(rawValue: rawStatus) == .complete,
              let buffer = sampleBuffer.imageBuffer else { return }
        let image = CIImage(cvPixelBuffer: buffer)
        if let frame = images.createCGImage(image, from: image.extent) { state.setLatest(frame) }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) { state.fail("capture stopped: \(error.localizedDescription)") }
}

func shareableWindow(_ target: WindowInfo) async throws -> SCWindow {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    guard let window = content.windows.first(where: { $0.windowID == target.id }) else {
        throw fail("ScreenCaptureKit cannot see window \(target.id) of \(target.app)")
    }
    return window
}

func cursorStyle(_ args: Args) throws -> CursorArt.Style? {
    let name = args.options["cursor"] ?? "hand"
    if name == "none" { return nil }
    guard let style = CursorArt.Style(rawValue: name) else { throw fail("--cursor must be hand, arrow or none, got \(name)") }
    return style
}

/// Draws a frame whenever the window changed, the pointer moved or a button changed, at most `fps` a second.
func runCompositor(state: RecordState, writer: FrameWriter, compositor: Compositor, bounds: CGRect, fps: Double) {
    let interval = 1 / fps
    var next = ProcessInfo.processInfo.systemUptime
    var last: (version: Int, pointer: CGPoint?, pressed: Bool)?
    while !state.shouldStop {
        next += interval
        let wait = next - ProcessInfo.processInfo.systemUptime
        if wait > 0 { Thread.sleep(forTimeInterval: wait) } else if wait < -interval { next = ProcessInfo.processInfo.systemUptime }
        guard let (image, version) = state.current() else { continue }
        let global = CGEvent(source: nil)?.location ?? .zero
        let local = CGPoint(x: global.x - bounds.minX, y: global.y - bounds.minY)
        let pointer = compositor.layout.windowRect.contains(local) ? local : nil
        let pressed = CGEventSource.buttonState(.combinedSessionState, button: .left)
            || CGEventSource.buttonState(.combinedSessionState, button: .right)
        if let last, last.version == version, last.pointer == pointer, last.pressed == pressed { continue }
        last = (version, pointer, pressed)
        if let frame = compositor.compose(window: image, pointer: pointer, pressed: pressed) { writer.submit(frame, at: Clock.now()) }
    }
}

func record(_ args: Args) async throws {
    let out = try args.required("out")
    _ = try args.required("app")
    let fps = try args.number("fps", 30, in: 1...30)
    let maxSeconds = try args.number("max-seconds", 180, in: 1...600)
    let style = try cursorStyle(args)
    try requireScreenRecording()
    let target = try findWindow(args)
    let layout = Layout(window: target.bounds.size)
    let window = try await shareableWindow(target)

    let config = SCStreamConfiguration()
    config.width = Int(target.bounds.width * 2)
    config.height = Int(target.bounds.height * 2)
    config.showsCursor = false  // the house cursor is drawn into each frame instead
    config.ignoreShadowsSingleWindow = true
    config.capturesAudio = false
    config.queueDepth = 6
    config.pixelFormat = kCVPixelFormatType_32BGRA
    config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps.rounded()))

    let directory = URL(fileURLWithPath: out)
    let compositor = try Compositor(layout: layout, cursor: try style.map { try CursorArt(style: $0, scale: layout.scale) })
    let writer = try FrameWriter(directory: directory, layout: layout)
    let marker = directory.appendingPathComponent(".recording")
    let stopFile = directory.appendingPathComponent(".stop")
    try writeNoFollow(marker, Data(String(getpid()).utf8), exclusive: true)
    defer { unlink(marker.path); unlink(stopFile.path) }

    let state = RecordState()
    let output = StreamOutput(state: state)
    let stream = SCStream(filter: SCContentFilter(desktopIndependentWindow: window), configuration: config, delegate: output)
    try stream.addStreamOutput(output, type: .screen, sampleHandlerQueue: DispatchQueue(label: "deskcap.capture"))
    let signals = DispatchQueue(label: "deskcap.signals")
    let sources = [SIGINT, SIGTERM, SIGHUP].map { number -> DispatchSourceSignal in
        signal(number, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: number, queue: signals)
        source.setEventHandler { state.requestStop() }
        source.resume()
        return source
    }
    try await stream.startCapture()
    let started = Clock.now()
    warn("recording \(target.app) window \(target.id) (\(Int(target.bounds.width))x\(Int(target.bounds.height)) pt) into \(out)")

    Thread {
        runCompositor(state: state, writer: writer, compositor: compositor, bounds: target.bounds, fps: fps)
        state.markCompositorDone()
    }.start()
    while !state.shouldStop {
        if FileManager.default.fileExists(atPath: stopFile.path) || Clock.now() - started >= maxSeconds || writer.isFull { state.requestStop() }
        if let problem = writer.failure { state.fail(problem) }
        try await Task.sleep(nanoseconds: 50_000_000)
    }
    while !state.isCompositorDone { try await Task.sleep(nanoseconds: 10_000_000) }
    let end = Clock.now()
    try? await stream.stopCapture()
    sources.forEach { $0.cancel() }

    var warnings: [String] = []
    if writer.isFull { warnings.append("stopped at the \(FrameWriter.maxFrames)-frame limit") }
    if Clock.now() - started >= maxSeconds { warnings.append("stopped at --max-seconds \(maxSeconds.clean)") }
    if writer.droppedCount > 0 { warnings.append("\(writer.droppedCount) frames dropped because encoding fell behind") }
    if let moved = listWindows().first(where: { $0.id == target.id }), moved.bounds != target.bounds {
        warnings.append("the window moved or resized during the take; the cursor and blur boxes assume its starting place")
    }
    let problem = state.error ?? writer.failure
    try writer.finish(end: end)  // keep every saved frame, even after an error
    let seconds = end - started
    printJSON(["frames": writer.count, "seconds": seconds.rounded(places: 2), "fps": (Double(writer.count) / max(seconds, 0.001)).rounded(places: 1),
               "dropped": writer.droppedCount, "dir": out, "window": target.json, "warnings": warnings,
               "layout": ["scale": layout.scale, "offsetX": layout.offsetX, "offsetY": layout.offsetY]])
    if let problem { throw fail("\(problem). The frames saved before it are kept in \(out)") }
}

func stop(_ args: Args) throws {
    let directory = URL(fileURLWithPath: try args.position(1, "DIR"))
    try requireFolder(directory)
    let finished = directory.appendingPathComponent("ts.txt")
    if FileManager.default.fileExists(atPath: finished.path) { printJSON(["stopped": true, "dir": directory.path]); return }
    guard FileManager.default.fileExists(atPath: directory.appendingPathComponent(".recording").path) else {
        throw fail("no take is recording in \(directory.path)")
    }
    let stopFile = directory.appendingPathComponent(".stop")
    if !FileManager.default.fileExists(atPath: stopFile.path) { try writeNoFollow(stopFile, Data(), exclusive: true) }
    let deadline = Date().addingTimeInterval(30)
    while Date() < deadline {
        if FileManager.default.fileExists(atPath: finished.path) { printJSON(["stopped": true, "dir": directory.path]); return }
        if !FileManager.default.fileExists(atPath: directory.appendingPathComponent(".recording").path) {
            throw fail("the recorder ended without finishing the take; see its output")
        }
        sleepMilliseconds(50)
    }
    throw fail("the recorder did not finish within 30 s")
}

func blur(_ args: Args) throws {
    let directory = URL(fileURLWithPath: try args.position(1, "DIR"))
    let values = try (2...5).map { try args.positionNumber($0, ["X", "Y", "W", "H"][$0 - 2]) }
    guard values[2] > 0, values[3] > 0 else { throw fail("blur box must have a positive size") }
    let until = try args.options["for"].map { _ in try args.number("for", 1, in: 0.01...600) }
    try requireFolder(directory)
    let layout = try Layout.load(from: directory)
    let box = CGRect(x: values[0], y: values[1], width: values[2], height: values[3]).intersection(layout.windowRect)
    guard !box.isNull, box.width > 0, box.height > 0 else {
        throw fail("blur box is outside the \(layout.windowWidth.clean)x\(layout.windowHeight.clean) window")
    }
    let mapped = layout.canonicalRect(box)
    let start = Clock.now()
    var entry: [String: Any] = ["x": Double(mapped.minX).rounded(places: 2), "y": Double(mapped.minY).rounded(places: 2),
                                "w": Double(mapped.width).rounded(places: 2), "h": Double(mapped.height).rounded(places: 2), "t": start]
    if let until { entry["until"] = start + until }
    try appendNoFollow(directory.appendingPathComponent("blur.jsonl"), jsonString(entry) + "\n")
}

func shot(_ args: Args) async throws {
    let out = URL(fileURLWithPath: try args.position(1, "OUT.png"))
    _ = try args.required("app")
    try requireScreenRecording()
    let target = try findWindow(args)
    let config = SCStreamConfiguration()
    config.width = Int(target.bounds.width * 2)
    config.height = Int(target.bounds.height * 2)
    config.showsCursor = false
    config.ignoreShadowsSingleWindow = true
    let filter = SCContentFilter(desktopIndependentWindow: try await shareableWindow(target))
    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else { throw fail("cannot encode a PNG") }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw fail("cannot encode a PNG") }
    try FileManager.default.createDirectory(at: out.deletingLastPathComponent(), withIntermediateDirectories: true)
    try writeNoFollow(out, data as Data)
    printJSON(["png": out.path, "pxPerPoint": 2, "window": target.json])
}

/// A synthetic take through the same layout, cursor, compositor and writer as `record`, with no permissions.
/// The window has sharp stripes across its top 250 points and a grey body; the cursor glides across the body.
func selftest(_ args: Args) throws {
    let directory = URL(fileURLWithPath: try args.position(1, "DIR"))
    let count = Int(try args.number("frames", 45, in: 1...600))
    let size = try parseSize(args.options["window"] ?? "1440x810")
    let fixedPointer = try args.options["pointer"].map(parsePoint)
    let layout = Layout(window: size)
    let compositor = try Compositor(layout: layout, cursor: try cursorStyle(args).map { try CursorArt(style: $0, scale: layout.scale) })
    let writer = try FrameWriter(directory: directory, layout: layout)
    let width = Int(size.width * 2), height = Int(size.height * 2)
    guard let canvas = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
        throw fail("cannot draw a test window")
    }
    let start = Clock.now()
    let began = ProcessInfo.processInfo.systemUptime
    for index in 0..<count {
        canvas.setFillColor(CGColor(red: 0.96, green: 0.96, blue: 0.97, alpha: 1))
        canvas.fill(CGRect(x: 0, y: 0, width: width, height: height))
        canvas.setFillColor(CGColor(red: 0.1, green: 0.1, blue: 0.1, alpha: 1))
        for stripe in stride(from: 0, to: width, by: 24) { canvas.fill(CGRect(x: stripe, y: height - 500, width: 8, height: 500)) }
        canvas.setFillColor(CGColor(red: 0.82, green: 0.26, blue: 0.05, alpha: 1))
        canvas.fill(CGRect(x: 200 + index * 20, y: 100, width: 300, height: 300))
        guard let window = canvas.makeImage() else { throw fail("cannot draw test frame \(index)") }
        let pointer = fixedPointer ?? CGPoint(x: size.width * (0.2 + 0.6 * Double(index) / Double(max(count - 1, 1))), y: size.height * 0.6)
        guard let frame = compositor.compose(window: window, pointer: pointer, pressed: false) else { throw fail("cannot compose frame \(index)") }
        writer.submit(frame, at: start + Double(index) / 30)
        writer.drain()
    }
    let elapsed = ProcessInfo.processInfo.systemUptime - began
    if let problem = writer.failure { throw fail(problem) }
    try writer.finish(end: start + Double(count) / 30)
    printJSON(["frames": writer.count, "dir": directory.path, "msPerFrame": (elapsed * 1000 / Double(count)).rounded(places: 1),
               "layout": ["scale": layout.scale, "offsetX": layout.offsetX, "offsetY": layout.offsetY]])
}

func parseSize(_ text: String) throws -> CGSize {
    let parts = text.split(separator: "x").compactMap { Double($0) }
    guard parts.count == 2, (100...8000).contains(parts[0]), (100...8000).contains(parts[1]) else { throw fail("--window must look like 1440x810, got \(text)") }
    return CGSize(width: parts[0], height: parts[1])
}

func parsePoint(_ text: String) throws -> CGPoint {
    let parts = text.split(separator: ",").compactMap { Double($0) }
    guard parts.count == 2 else { throw fail("--pointer must look like 700,400, got \(text)") }
    return CGPoint(x: parts[0], y: parts[1])
}
