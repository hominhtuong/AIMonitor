# AI Monitor for VSCode

Xem dashboard [AI Monitor](https://github.com/hominhtuong/AIMonitor) ngay trong VSCode: tiến
trình AI đang chạy (Claude Code, Codex, Copilot, Gemini CLI, Ollama...), token đã dùng, hạn
mức tài khoản còn lại, port đang mở.

## Cách hoạt động

Extension tự khởi động server Python có sẵn của AI Monitor (`python3 -m aimon.server`) khi
bạn mở panel lần đầu, và nhúng dashboard vào bằng webview. Mọi thứ chạy trên `127.0.0.1` —
không gửi dữ liệu ra ngoài, không gọi API bên thứ ba.

## Yêu cầu

- `python3` có sẵn trên PATH (macOS/Linux thường có sẵn; Windows cần cài Python từ
  [python.org](https://www.python.org/) và tick "Add to PATH" lúc cài).
- Không cần cài thêm gì khác — server chỉ dùng thư viện chuẩn Python, không có dependency
  ngoài.

## Cài đặt

Extension chưa lên VSCode Marketplace, cài từ file `.vsix`:

```bash
code --install-extension aimon-vscode-0.1.0.vsix
```

Hoặc trong VSCode: mở Extensions panel → nút `...` → **Install from VSIX...** → chọn file.

Sau khi cài, icon AI Monitor xuất hiện ở activity bar (thanh biểu tượng bên trái). Bấm vào để
mở dashboard.

## Trạng thái

Bản 0.1.0, dùng thử nội bộ. Xem repo chính
[hominhtuong/AIMonitor](https://github.com/hominhtuong/AIMonitor) để biết thêm về app macOS/
Windows độc lập, hoặc báo lỗi.
