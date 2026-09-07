import AppKit
import ApplicationServices
import Foundation

// Metadata only: never capture pixels or change another process's windows.
func respond(_ value: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8)!)
}
let args = CommandLine.arguments
guard args.count == 7, let pid = Int32(args[2]), pid > 0, let parent = Int32(args[3]), parent > 0,
      ["probe", "show"].contains(args[1]) else {
    respond(["visible": false, "message": "Invalid window helper arguments"]); exit(1)
}
let app = NSRunningApplication(processIdentifier: pid)
let executable = URL(fileURLWithPath: args[4]).resolvingSymlinksInPath().path
let check = Process(), pipe = Pipe()
check.executableURL = URL(fileURLWithPath: "/bin/ps")
check.arguments = ["-p", String(pid), "-o", "ppid=,lstart="]
check.standardOutput = pipe
do { try check.run() } catch { respond(["visible": false, "message": "Cannot verify window owner"]); exit(1) }
let identity = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
check.waitUntilExit()
guard check.terminationStatus == 0, identity.split(separator: " ").first == Substring(String(parent)),
      app?.executableURL?.resolvingSymlinksInPath().path == executable,
      args[5].isEmpty || args[5] == identity else {
    respond(["visible": false, "message": "Window process identity mismatch"]); exit(0)
}
if args[1] == "show" {
    guard AXIsProcessTrusted() else {
        respond(["visible": false, "identity": identity, "message": "Accessibility permission is required to show the OpenGUI window"]); exit(0)
    }
    let element = AXUIElementCreateApplication(pid)
    var raw: CFTypeRef?
    if AXUIElementCopyAttributeValue(element, kAXWindowsAttribute as CFString, &raw) == .success,
       let windows = raw as? [AXUIElement] {
        for window in windows {
            var title: CFTypeRef?
            AXUIElementCopyAttributeValue(window, kAXTitleAttribute as CFString, &title)
            guard (title as? String)?.hasPrefix("OpenGUI · WorkBuddy · ") == true else { continue }
            if let slot = Int(args[6]), slot >= 0, let screen = NSScreen.main {
                let frame = screen.visibleFrame
                let screenTop = NSScreen.screens.first?.frame.maxY ?? frame.maxY
                var point = CGPoint(x: frame.minX + min(CGFloat(slot) * 36 + 24, max(0, frame.width - 400)),
                                    y: screenTop - frame.maxY + min(CGFloat(slot) * 28 + 24, max(0, frame.height - 400)))
                if let position = AXValueCreate(.cgPoint, &point) {
                    AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, position)
                }
            }
            AXUIElementSetAttributeValue(window, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
            AXUIElementPerformAction(window, kAXRaiseAction as CFString)
        }
    }
    app?.activate(options: [.activateIgnoringOtherApps])
}
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let visible = windows.contains { window in
    guard window[kCGWindowOwnerPID as String] as? Int32 == pid,
          window[kCGWindowLayer as String] as? Int == 0,
          let bounds = window[kCGWindowBounds as String] as? [String: Any],
          (bounds["Width"] as? Double ?? 0) > 1, (bounds["Height"] as? Double ?? 0) > 1 else { return false }
    return window[kCGWindowIsOnscreen as String] as? Bool == true
}
respond(["visible": visible, "identity": identity, "message": visible ? "" : "OpenGUI window is not visible on the current desktop"])
