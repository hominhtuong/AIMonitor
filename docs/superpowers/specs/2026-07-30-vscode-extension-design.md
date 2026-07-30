# AI Monitor VSCode Extension — Design

## Mục tiêu

Cho phép người dùng xem dashboard AI Monitor (tiến trình AI, token, hạn mức, port) ngay
trong VSCode, thay vì phải mở app macOS/Windows riêng hoặc browser tab. Không thay thế các
kênh phát hành hiện có (`mac/AIMonitor.swift`, `windows/app_win.py`) — extension là một lớp
vỏ mới, song song.

## Kiến trúc

Thư mục mới `vscode-extension/` (TypeScript), tách biệt hoàn toàn khỏi `aimon/` (Python).
Không sửa `aimon/server.py`, collectors, hay `static/` — extension chỉ nhúng và điều khiển
server hiện có, không viết lại logic của nó.

```text
vscode-extension/
  package.json           manifest: activity bar icon, webview view, activationEvents
  src/extension.ts       activate/deactivate, spawn server, WebviewViewProvider
  aimon/                 copy của thư mục aimon/ gốc (đóng gói vào VSIX lúc build)
  .vscodeignore           loại bỏ file build/script không cần (mac/, windows/, scripts/, docs/)
```

## Vòng đời

- **Kích hoạt:** `activationEvents: onStartupFinished` — icon activity bar luôn hiện khi
  VSCode mở. Extension **không** tự chạy server lúc này.
- **Spawn server:** lazy — chỉ khi user mở panel lần đầu (`resolveWebviewView` được gọi).
  Lệnh: `python3 -m aimon.server --port 0` (`--port 0` để OS tự cấp cổng trống, tránh đụng
  port giữa nhiều cửa sổ VSCode hoặc app macOS standalone chạy song song).
- **Xác định URL:** đợi `~/.aimon/instance.json` xuất hiện (cơ chế có sẵn ở `instance.py`),
  probe `GET /api/version` để xác nhận server sống, lấy host/port thật từ đó.
- **Hiển thị:** `webview.asExternalUri(loopbackUri)` bọc URL rồi gán vào `<iframe src=...>`
  trong webview. Bắt buộc dùng `asExternalUri` (không gán thẳng `http://127.0.0.1:port`) để
  chạy đúng trên VSCode Remote-SSH / Codespaces, nơi VSCode tự port-forward.
- **Dọn dẹp:** `deactivate()` gửi SIGTERM cho tiến trình con đã spawn, giống
  `applicationWillTerminate` bên `mac/AIMonitor.swift` — tránh để lại `instance.json` rác.

## Python interpreter

Dùng `python3` từ PATH hệ thống (không hard-code `/usr/bin/python3` như app macOS, vì
extension chạy đa hệ điều hành). Không phụ thuộc VSCode Python extension hay
`python.defaultInterpreterPath`.

## Platform

macOS + Windows + Linux. Collector `procs_posix.py` đã dùng chung được cho Linux (dựa
`ps`/`vm_stat`-tương-đương), `procs_windows.py` đã có sẵn cho Windows. Chỉ cần đảm bảo
`python3` có mặt trên PATH của từng hệ.

## Đóng gói

`aimon/` (toàn bộ collector + `static/` + `pricing.json`) được copy vào bundle lúc
`vsce package`, để VSIX tự đủ — người cài extension không cần có sẵn repo này trên máy.

## Xử lý lỗi

- Không tìm thấy `python3` trên PATH → `vscode.window.showErrorMessage` kèm hướng dẫn cài,
  đồng thời webview hiện placeholder lỗi (không để trắng trơn).
- Server bind lỗi (port bận dù đã `--port 0`, hoặc lỗi Python) → đọc stderr tiến trình con,
  hiện lỗi rõ ràng trong webview thay vì loading vô thời hạn.

## Ngoài phạm vi

- Publish lên VSCode Marketplace — làm sau, tách riêng.
- Auth cho `/api/action` / `/api/quit` — nợ kỹ thuật đã ghi ở `CLAUDE.md`, không phải việc
  của extension này.
- Sidebar rút gọn riêng cho VSCode — bản đầu dùng thẳng dashboard hiện có qua iframe.

## Kiểm tra

- `vsce package` xong, cài `.vsix` vào VSCode, mở panel, xác nhận danh sách tiến trình lên
  đúng, nút kill hoạt động.
- Đóng VSCode / disable extension → xác nhận tiến trình Python con bị kill, `instance.json`
  bị xoá (`finally` trong `server.py` xử lý phần này khi nhận SIGTERM đúng cách).
- Test trên ít nhất macOS + 1 hệ còn lại (Windows hoặc Linux) trước khi coi hoàn thành đa nền.
