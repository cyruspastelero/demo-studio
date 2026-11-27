// setup: helps the user grant the two permissions deskcap needs, and says which app to grant them to.
import AppKit
import ApplicationServices
import Foundation

/// macOS gives permissions to the app that started us (the terminal), not to deskcap. Find that app by
/// walking up the parent processes to the first one that is a regular app with a window.
func responsibleApp() -> (name: String, bundle: String?) {
    var pid = getppid()
    for _ in 0..<12 where pid > 1 {
        if let app = NSRunningApplication(processIdentifier: pid), let name = app.localizedName, app.activationPolicy == .regular {
            return (name, app.bundleIdentifier)
        }
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
        guard sysctl(&mib, 4, &info, &size, nil, 0) == 0, size > 0 else { break }
        pid = info.kp_eproc.e_ppid
    }
    let fallback = ProcessInfo.processInfo.environment["TERM_PROGRAM"].map { $0 == "Apple_Terminal" ? "Terminal" : $0 }
    return (fallback ?? "your terminal app", nil)
}

let settingsPanes = [
    "screenRecording": "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    "accessibility": "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
]

/// Reports what is missing, adds the terminal to each missing list (macOS shows its own prompt the
/// first time) and opens those Settings pages. `--no-open` only reports.
func setup(_ args: Args) {
    let app = responsibleApp()
    var missing: [String] = []
    if !CGPreflightScreenCaptureAccess() { missing.append("screenRecording") }
    if !AXIsProcessTrusted() { missing.append("accessibility") }
    var opened: [String] = []
    if !args.flags.contains("no-open") {
        for permission in missing {
            if permission == "screenRecording" { CGRequestScreenCaptureAccess() }
            if permission == "accessibility" {
                AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
            }
            if let url = settingsPanes[permission].flatMap(URL.init(string:)), NSWorkspace.shared.open(url) { opened.append(permission) }
        }
    }
    let labels = ["screenRecording": "Screen Recording", "accessibility": "Accessibility"]
    let steps = missing.isEmpty ? [] : [
        "In System Settings > Privacy & Security, open \(missing.compactMap { labels[$0] }.joined(separator: " and then ")).",
        "Turn on \(app.name). If it is not in the list, click +, pick \(app.name) from Applications, and turn it on.",
        "Quit \(app.name) completely (Cmd-Q) and open it again; macOS only applies these permissions after a restart.",
        "In the same folder, run `claude --continue` to pick up this conversation, then ask to go on.",
    ]
    printJSON(["ready": missing.isEmpty, "app": app.name, "bundle": app.bundle ?? "", "missing": missing.compactMap { labels[$0] },
               "opened": opened.compactMap { labels[$0] }, "steps": steps])
}
