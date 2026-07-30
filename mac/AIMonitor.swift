// Vỏ app macOS cho AI Monitor: một cửa sổ WKWebView, không dính gì tới browser.
//
// App tự bật server Python nằm trong Contents/Resources, chờ nó ghi
// ~/.aimon/instance.json rồi nạp URL đó vào webview. Đóng app thì server tắt theo.
//
// Vì sao phải là binary biên dịch chứ không phải script: bundle không có Mach-O thì macOS
// không xác định được kiến trúc và chạy nó dưới Rosetta (hiện hộp thoại đòi cài Rosetta).
// Có binary rồi thì hết chuyện đó, lại thêm được icon Dock, menu và Cmd+Q tử tế.

import AppKit
import WebKit

let appName = "AI Monitor"

// Mở từ Finder thì PATH rất hẹp, dò theo đường dẫn tuyệt đối trước.
func findPython() -> String? {
    let candidates = ["/usr/bin/python3", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"]
    for path in candidates where FileManager.default.isExecutableFile(atPath: path) {
        return path
    }
    return nil
}

func instanceURL() -> URL? {
    let path = NSHomeDirectory() + "/.aimon/instance.json"
    guard let data = FileManager.default.contents(atPath: path),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let str = obj["url"] as? String
    else { return nil }
    return URL(string: str)
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var server: Process?
    var deadline = Date()

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        buildWindow()
        startServer()
        deadline = Date().addingTimeInterval(30)
        poll()
    }

    // MARK: cửa sổ

    func buildWindow() {
        let frame = NSRect(x: 0, y: 0, width: 1440, height: 920)
        // Không dùng .fullSizeContentView: nội dung web sẽ tràn lên vùng titlebar và ba nút
        // đỏ/vàng/xanh đè lên logo. Để titlebar là dải riêng, chỉ tô cùng màu nền trang cho liền.
        window = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = appName
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden          // tiêu đề đã có sẵn trong trang, khỏi lặp
        window.backgroundColor = NSColor(srgbRed: 0.059, green: 0.090, blue: 0.165, alpha: 1)  // #0f172a
        window.minSize = NSSize(width: 900, height: 600)
        window.setFrameAutosaveName("AIMonitorWindow")   // nhớ vị trí + kích thước

        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: frame, configuration: config)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        window.contentView = webView

        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Về \(appName)", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Ẩn \(appName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Thoát \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: "Hiển thị")
        viewMenu.addItem(withTitle: "Tải lại", action: #selector(reload), keyEquivalent: "r")
        viewMenu.addItem(withTitle: "Toàn màn hình", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        viewItem.submenu = viewMenu
        main.addItem(viewItem)

        NSApp.mainMenu = main
    }

    @objc func reload() { webView.reload() }

    @objc func about() {
        let alert = NSAlert()
        alert.messageText = appName
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        alert.informativeText = """
        Phiên bản \(version)

        Dashboard theo dõi tiến trình và agent AI trên máy.
        Chạy hoàn toàn local, không gửi dữ liệu ra ngoài.
        """
        alert.runModal()
    }

    // MARK: server

    func startServer() {
        guard let python = findPython() else {
            fail("Máy chưa có Python 3.\n\nCài Python từ python.org rồi mở lại \(appName).")
            return
        }
        guard let resources = Bundle.main.resourcePath else { return }

        let task = Process()
        task.executableURL = URL(fileURLWithPath: python)
        task.arguments = ["-m", "aimon.server"]
        task.currentDirectoryURL = URL(fileURLWithPath: resources)
        // Không kế thừa stdout của Finder; server in URL ra đây, ta đọc instance.json thay vì parse chữ.
        task.standardOutput = FileHandle.nullDevice
        task.standardError = FileHandle.nullDevice
        do {
            try task.run()
            server = task
        } catch {
            fail("Không chạy được server: \(error.localizedDescription)")
        }
    }

    /// Chờ server sẵn sàng rồi nạp. Server đã chạy sẵn (bật từ run.sh) thì tiến trình con
    /// tự thoát và ta dùng luôn URL của instance đang có.
    func poll() {
        if let url = instanceURL() {
            probe(url) { ok in
                if ok {
                    self.webView.load(URLRequest(url: url))
                } else {
                    self.retry()
                }
            }
            return
        }
        retry()
    }

    func retry() {
        if Date() > deadline {
            fail("Server không khởi động được sau 30 giây.\n\nThử chạy ./run.sh trong terminal để xem lỗi.")
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.poll() }
    }

    func probe(_ url: URL, done: @escaping (Bool) -> Void) {
        var request = URLRequest(url: url.appendingPathComponent("api/version"))
        request.timeoutInterval = 2
        URLSession.shared.dataTask(with: request) { data, _, _ in
            DispatchQueue.main.async { done(data != nil) }
        }.resume()
    }

    func fail(_ message: String) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = appName
        alert.informativeText = message
        alert.runModal()
        NSApp.terminate(nil)
    }

    // MARK: vòng đời

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ note: Notification) {
        // SIGTERM để server dọn ~/.aimon/instance.json như khi Ctrl+C
        if let task = server, task.isRunning {
            task.terminate()
            task.waitUntilExit()
        }
    }

    // Link ra ngoài thì mở bằng browser mặc định, đừng lôi vào cửa sổ app.
    func webView(_ webView: WKWebView,
                 decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, let host = url.host,
           host != "127.0.0.1", host != "localhost" {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
