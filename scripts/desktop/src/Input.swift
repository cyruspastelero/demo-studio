// prep / find / move / click / scroll / type / key: Accessibility and synthetic input.
import AppKit
import ApplicationServices
import Foundation

let accessibilityHelp = "Accessibility permission is missing. Turn it on for your terminal in System Settings > Privacy & Security > Accessibility, then restart the terminal."

func requireAccessibility() throws { guard AXIsProcessTrusted() else { throw fail(accessibilityHelp) } }

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}

func axFrame(_ element: AXUIElement) -> CGRect? {
    guard let position = attribute(element, kAXPositionAttribute), CFGetTypeID(position) == AXValueGetTypeID(),
          let size = attribute(element, kAXSizeAttribute), CFGetTypeID(size) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero, extent = CGSize.zero
    guard AXValueGetValue(position as! AXValue, .cgPoint, &point), AXValueGetValue(size as! AXValue, .cgSize, &extent) else { return nil }
    return CGRect(origin: point, size: extent)
}

/// The AX window that is the same window as `target` (matched by frame, then title), not just the app's first one.
func axWindow(for target: WindowInfo) throws -> AXUIElement {
    let app = AXUIElementCreateApplication(target.pid)
    AXUIElementSetMessagingTimeout(app, 1)
    guard let windows = attribute(app, kAXWindowsAttribute) as? [AXUIElement], !windows.isEmpty else {
        throw fail("cannot read the windows of \(target.app) through Accessibility (for Electron apps, start them with --force-renderer-accessibility)")
    }
    if let match = windows.first(where: { axFrame($0).map { abs($0.minX - target.bounds.minX) < 2 && abs($0.minY - target.bounds.minY) < 2
        && abs($0.width - target.bounds.width) < 2 && abs($0.height - target.bounds.height) < 2 } ?? false }) { return match }
    if !target.title.isEmpty, let match = windows.first(where: { (attribute($0, kAXTitleAttribute) as? String) == target.title }) { return match }
    throw fail("cannot match window \(target.id) of \(target.app) to its Accessibility window; pass --title")
}

func isFrontmost(_ pid: pid_t) -> Bool { NSWorkspace.shared.frontmostApplication?.processIdentifier == pid }

func prep(_ args: Args) throws {
    let size = CGSize(width: try args.number("w", 1440, in: 200...8000), height: try args.number("h", 810, in: 200...8000))
    var origin = CGPoint(x: try args.number("x", 80, in: -8000...8000), y: try args.number("y", 60, in: -8000...8000))
    try requireAccessibility()
    let target = try findWindow(args)
    let window = try axWindow(for: target)
    let app = AXUIElementCreateApplication(target.pid)
    NSRunningApplication(processIdentifier: target.pid)?.activate()
    AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
    var sizeValue = size
    let moved = AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, AXValueCreate(.cgPoint, &origin)!)
    let sized = AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, AXValueCreate(.cgSize, &sizeValue)!)
    AXUIElementPerformAction(window, kAXRaiseAction as CFString)
    Thread.sleep(forTimeInterval: 0.5)
    let after = listWindows().first { $0.id == target.id } ?? target
    var warnings: [String] = []
    if moved != .success || sized != .success { warnings.append("the app refused the move or resize (AXError \(moved.rawValue)/\(sized.rawValue))") }
    if abs(after.bounds.width - size.width) > 1 || abs(after.bounds.height - size.height) > 1 {
        warnings.append("the window is \(Int(after.bounds.width))x\(Int(after.bounds.height)), not \(Int(size.width))x\(Int(size.height)); the take is letterboxed to 16:9 (blur boxes and scout rects still line up)")
    }
    if !isFrontmost(target.pid) { warnings.append("\(target.app) is not frontmost; click its window once before typing") }
    var result = after.json
    result["warnings"] = warnings
    printJSON(result)
}

/// Controls in the window whose title, description, value, identifier or help contains TEXT.
func find(_ args: Args) throws {
    let text = try args.position(1, "TEXT")
    let role = args.options["role"]
    try requireAccessibility()
    let target = try findWindow(args)
    let layout = Layout(window: target.bounds.size)
    let root = try axWindow(for: target)
    let deadline = Date().addingTimeInterval(5)
    var matches: [[String: Any]] = []
    var stack: [(AXUIElement, Int)] = [(root, 0)]
    var visited = 0
    var truncated = false
    while let (element, depth) = stack.popLast() {
        if visited >= 5000 || matches.count >= 20 || Date() > deadline { truncated = true; break }
        visited += 1
        let elementRole = attribute(element, kAXRoleAttribute) as? String ?? ""
        let labels = [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute, kAXIdentifierAttribute, kAXHelpAttribute]
            .compactMap { attribute(element, $0) as? String }
        if let label = labels.first(where: { $0.localizedCaseInsensitiveContains(text) }), role.map({ $0 == elementRole }) ?? true,
           let frame = axFrame(element), frame.width > 0, frame.height > 0 {
            let local = CGRect(x: frame.minX - target.bounds.minX, y: frame.minY - target.bounds.minY, width: frame.width, height: frame.height)
            if layout.windowRect.intersects(local) {
                let center = CGRect(x: local.midX, y: local.midY, width: 0, height: 0)
                matches.append(["role": elementRole, "label": String(label.prefix(80)),
                                "x": local.minX, "y": local.minY, "w": local.width, "h": local.height,
                                "cx": local.midX.rounded(), "cy": local.midY.rounded(),
                                "rect": layout.sourceRect(local), "focus": Array(layout.sourceRect(center).prefix(2))])
            }
        }
        if depth < 30, let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] {
            stack.append(contentsOf: children.reversed().map { ($0, depth + 1) })
        }
    }
    guard !matches.isEmpty else {
        throw fail("no control in \(target.app) has a label containing \"\(text)\"\(truncated ? " (search stopped early: the window has too many elements)" : ""); take a `deskcap shot` and use coordinates")
    }
    printJSON(matches)
}

// MARK: - pointer

func pointerLocation() -> CGPoint { CGEvent(source: nil)?.location ?? .zero }

func postMouse(_ type: CGEventType, at point: CGPoint, button: CGMouseButton = .left, clickCount: Int64 = 1) {
    let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button)
    event?.setIntegerValueField(.mouseEventClickState, value: clickCount)
    event?.post(tap: .cghidEventTap)
}

/// Same curve as lib.js moveHuman: slow-fast-slow along a gentle arc.
func easedPath(from: CGPoint, to: CGPoint, steps: Int, bendSign: Double) -> [CGPoint] {
    let easeInOut = { (t: Double) in t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2 }
    let dx = to.x - from.x, dy = to.y - from.y
    let distance = hypot(dx, dy), safe = distance == 0 ? 1 : distance
    let count = max(8, Int((Double(steps) * min(1.4, 0.6 + distance / 900)).rounded()))
    let bend = min(60, distance * 0.08) * bendSign
    return (1...count).map { index in
        let t = easeInOut(Double(index) / Double(count)), arc = sin(Double.pi * t) * bend
        return CGPoint(x: from.x + dx * t - dy / safe * arc, y: from.y + dy * t + dx / safe * arc)
    }
}

func move(_ args: Args) throws {
    let x = try args.positionNumber(1, "X"), y = try args.positionNumber(2, "Y")
    let steps = Int(try args.number("steps", 30, in: 1...200))
    try requireAccessibility()
    let window = try findWindow(args)
    guard (0...window.bounds.width).contains(x), (0...window.bounds.height).contains(y) else {
        throw fail("\(x.clean),\(y.clean) is outside the \(Int(window.bounds.width))x\(Int(window.bounds.height)) window (window points from its top-left corner)")
    }
    let target = CGPoint(x: window.bounds.minX + x, y: window.bounds.minY + y)
    for point in easedPath(from: pointerLocation(), to: target, steps: steps, bendSign: Bool.random() ? 1 : -1) {
        postMouse(.mouseMoved, at: point)
        sleepMilliseconds(14)
    }
}

func click(_ args: Args) throws {
    try requireAccessibility()
    try requireFrontmost(args)
    let point = pointerLocation()
    let right = args.flags.contains("right")
    let (down, up): (CGEventType, CGEventType) = right ? (.rightMouseDown, .rightMouseUp) : (.leftMouseDown, .leftMouseUp)
    for clickCount in 1...(args.flags.contains("double") ? 2 : 1) {
        postMouse(down, at: point, button: right ? .right : .left, clickCount: Int64(clickCount))
        sleepMilliseconds(70)
        postMouse(up, at: point, button: right ? .right : .left, clickCount: Int64(clickCount))
        sleepMilliseconds(90)
    }
}

func scroll(_ args: Args) throws {
    let total = try args.positionNumber(1, "DY")
    let steps = Int(try args.number("steps", 25, in: 1...200))
    try requireAccessibility()
    var sent = 0.0
    for step in 1...steps {
        let target = (-total * Double(step) / Double(steps)).rounded()
        let delta = Int32(target - sent)
        sent = target
        if delta != 0 { CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: delta, wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap) }
        sleepMilliseconds(16)
    }
}

// MARK: - keyboard

/// With --app, refuses to send input unless that app is frontmost (so keys never land in the terminal).
func requireFrontmost(_ args: Args) throws {
    guard args.options["app"] != nil else { return }
    let window = try findWindow(args)
    guard isFrontmost(window.pid) else {
        throw fail("\(window.app) is not the frontmost app (\(NSWorkspace.shared.frontmostApplication?.localizedName ?? "unknown") is); run `deskcap prep --app \(window.app)`")
    }
}

// US ANSI virtual key codes.
let keyCodes: [String: CGKeyCode] = [
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12,
    "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23,
    "=": 24, "9": 25, "7": 26, "-": 27, "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34,
    "p": 35, "return": 36, "enter": 36, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42, ",": 43,
    "/": 44, "n": 45, "m": 46, ".": 47, "tab": 48, "space": 49, "`": 50, "delete": 51, "backspace": 51,
    "escape": 53, "esc": 53, "left": 123, "right": 124, "down": 125, "up": 126,
]
let modifierFlags: [String: CGEventFlags] = [
    "cmd": .maskCommand, "command": .maskCommand, "shift": .maskShift, "alt": .maskAlternate,
    "option": .maskAlternate, "ctrl": .maskControl, "control": .maskControl,
]

func pressKey(_ code: CGKeyCode, flags: CGEventFlags = []) {
    for isDown in [true, false] {
        let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: isDown)
        event?.flags = flags
        event?.post(tap: .cghidEventTap)
        sleepMilliseconds(isDown ? 30 : 10)
    }
}

func key(_ args: Args) throws {
    let parts = try args.position(1, "COMBO").lowercased().split(separator: "+").map(String.init)
    var flags: CGEventFlags = []
    for modifier in parts.dropLast() {
        guard let flag = modifierFlags[modifier] else { throw fail("unknown modifier \(modifier)") }
        flags.insert(flag)
    }
    guard let name = parts.last, let code = keyCodes[name] else { throw fail("unknown key in \(parts.joined(separator: "+"))") }
    try requireAccessibility()
    try requireFrontmost(args)
    pressKey(code, flags: flags)
}

func typeText(_ args: Args) throws {
    let text = try args.position(1, "TEXT").replacingOccurrences(of: "\\n", with: "\n")
    let delay = try args.number("delay", 55, in: 0...1000)
    try requireAccessibility()
    try requireFrontmost(args)
    for character in text {
        if character == "\n" { pressKey(36) } else {
            let units = Array(String(character).utf16)
            for isDown in [true, false] {
                let event = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: isDown)
                event?.keyboardSetUnicodeString(stringLength: units.count, unicodeString: units)
                event?.post(tap: .cghidEventTap)
            }
        }
        sleepMilliseconds(delay)
    }
}
