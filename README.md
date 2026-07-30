# AI Monitor

Dashboard chạy trên máy bạn để trả lời câu hỏi mà Activity Monitor / Task Manager không trả lời được:
**tiến trình này của AI nào, phiên nào đang gọi tool gì, tốn bao nhiêu token, MCP nào đang ngốn RAM, và cái nào xoá được.**

- Không cần cài thư viện: chỉ Python 3.9+ (có sẵn trên macOS/Linux; Windows tải ở python.org).
- Chạy hoàn toàn local, bind `127.0.0.1`, không gửi dữ liệu ra ngoài.
- Dùng được trên **macOS, Linux và Windows**.

![logo](assets/icon_128.png)

---

## Mục lục

1. [Chạy trong 30 giây](#1-chạy-trong-30-giây)
2. [Cài thành app có icon](#2-cài-thành-app-có-icon)
3. [Màn hình có gì](#3-màn-hình-có-gì)
4. [Dừng / kill tiến trình](#4-dừng--kill-tiến-trình)
5. [Hạn mức tài khoản: Session 5 giờ & Weekly 7 ngày](#5-hạn-mức-tài-khoản-session-5-giờ--weekly-7-ngày)
6. [Token và chi phí được tính thế nào](#6-token-và-chi-phí-được-tính-thế-nào)
7. [Hỗ trợ theo hệ điều hành](#7-hỗ-trợ-theo-hệ-điều-hành)
8. [Cấu trúc thư mục](#8-cấu-trúc-thư-mục)
9. [API](#9-api)
10. [Câu hỏi thường gặp](#10-câu-hỏi-thường-gặp)
11. [Góp code](#11-góp-code)

---

## 1. Chạy trong 30 giây

**macOS / Linux**

```bash
git clone https://github.com/hominhtuong/AIMonitor.git
cd AIMonitor
./run.sh
```

**Windows**

```cmd
git clone https://github.com/hominhtuong/AIMonitor.git
cd AIMonitor
run.cmd
```

Browser tự mở `http://127.0.0.1:8899`. Dừng bằng `Ctrl+C`.

Đổi cổng: `./run.sh --port 9000` hoặc đặt biến môi trường `AIMON_PORT=9000`.

---

## 2. Cài thành app có icon

**macOS** - tạo `AIMonitor.app` để mở bằng double-click hoặc gắn vào Dock:

```bash
./scripts/build_macos_app.sh
open build/AIMonitor.app          # chạy thử
cp -R build/AIMonitor.app /Applications/   # nếu muốn cài hẳn
```

**Windows** - tạo shortcut có icon ở Desktop + Start Menu (chạy không hiện cửa sổ console):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_windows.ps1
```

**Vẽ lại logo** (nếu sửa màu/hình trong `scripts/make_icons.py`):

```bash
python3 scripts/make_icons.py     # sinh assets/icon_*.png, icon.ico, AIMonitor.icns
```

---

## 3. Màn hình có gì

**Đầu trang** - RAM hệ thống, RAM do AI chiếm, chu kỳ tự làm mới (1-10 giây hoặc tắt),
công tắc *Hiệu ứng* (mặc định tắt: chỉ số liệu thay đổi, không nhấp nháy màu).

**Panel hạn mức** - Session (5 giờ) và Weekly (7 ngày), xem mục [5](#5-hạn-mức-tài-khoản-session-5-giờ--weekly-7-ngày).

**Tab "AI & Agent"** - mỗi thẻ là 1 tiến trình AI gốc (Claude Code, Codex, Copilot, Gemini CLI, Ollama)
kèm cây con:

| Thông tin | Lấy từ đâu |
| --- | --- |
| Tiêu đề phiên, thư mục, git branch, model, permission mode | transcript `~/.claude/projects/<slug>/<sessionId>.jsonl` |
| Token hôm nay / cả phiên (vào, ra, cache read, cache write) | field `usage` của từng message assistant |
| Chi phí ước tính | token × giá trong `pricing.json` |
| Thanh context + % so với cửa sổ của model | `input + cache_read + cache_creation` của request cuối |
| "Đang chạy: Bash(...) 3.2s" | tool_use chưa có tool_result tương ứng |
| Sub-agent đang chạy | tool `Agent` / `Task` chưa trả kết quả, kèm `subagent_type` |
| Cây con: MCP server, browser automation, RAM từng nhánh | danh sách tiến trình + quan hệ cha-con, RAM cộng dồn cả cây |
| Dòng thời gian | 60 event gần nhất (prompt / tool / kết quả) |

**Phiên đã đóng** - phiên không còn tiến trình, chọn xem *hôm nay* hoặc *7 ngày*, để đối chiếu token
và chi phí sau khi đã tắt cửa sổ.

**Tab "Tài nguyên"** - top 80 tiến trình theo RAM, lọc theo tên/PID/lệnh, tuỳ chọn *chỉ tiến trình của tôi*
và *chỉ liên quan AI*. Dòng > 400 MB tô đỏ. Badge `trong cây AI` cho tiến trình không phải AI nhưng do AI
sinh ra (ví dụ Chrome do Playwright MCP mở).

**Tab "Cổng & Docker"** - cổng local đang LISTEN (hữu ích khi Appium 4723 hay Playwright treo cổng) và
danh sách container nếu máy có Docker.

---

## 4. Dừng / kill tiến trình

| Nút | macOS / Linux | Windows |
| --- | --- | --- |
| Dừng / Tạm dừng cây | `SIGSTOP` (đóng băng, vẫn giữ RAM) | không hỗ trợ, nút tự ẩn |
| Tiếp tục | `SIGCONT` | không hỗ trợ |
| Kill | `SIGTERM` | `taskkill /PID` |
| Kill cây | `SIGTERM` cho toàn bộ con rồi tới gốc | `taskkill /PID /T /F` |

**Guard an toàn**: PID 0/1, chính tiến trình AI Monitor và toàn bộ tiến trình cha của nó không bao giờ
bị kill - API trả lỗi rõ ràng. Tiến trình của user khác sẽ báo lỗi quyền thay vì im lặng.

Mọi lệnh kill đều hỏi xác nhận bằng hộp thoại **trong trang** (không dùng `confirm()` của browser -
dialog gốc bị chặn sau vài lần và làm nút kill trông như không hoạt động).

Nếu tiến trình có badge *"... quản lý"* (ví dụ `Code Helper (Plugin) quản lý`) thì nó do IDE giám sát:
kill xong IDE sẽ bật lại. Muốn tắt hẳn thì disable extension tương ứng.

---

## 5. Hạn mức tài khoản: Session 5 giờ & Weekly 7 ngày

Có hai cột số, cố tình để cạnh nhau:

**Số chính thức (%)** đọc từ `~/.claude/rate-cache.json`. File này do *statusline* của Claude Code ghi:
Claude Code truyền payload chứa `rate_limits.five_hour` / `.seven_day` vào statusline command, script ghi
lại thành JSON. Nghĩa là **số chỉ mới khi statusline có chạy** - dùng Claude Code ở terminal hoặc bật
extension statusline. Nếu file cũ, panel ghi rõ "cập nhật N giờ trước (đã cũ)".

Không có API hay CLI nào khác đọc được hạn mức này (`claude` không có subcommand `usage`), và AI Monitor
**không bao giờ tự gọi API Anthropic** bằng credential của bạn.

**Ước lượng local** đọc trực tiếp từ transcript: tổng token và chi phí trong 5 giờ / 7 ngày trượt. Số này
luôn mới, dùng để đối chiếu khi % chính thức đã cũ.

---

## 6. Token và chi phí được tính thế nào

- "Token API hôm nay" và "Chi phí hôm nay" tính **từ 00:00 giờ máy**, không phải 24 giờ trượt.
- **Chống đếm trùng**: Claude Code chạy với `--include-partial-messages` ghi cùng một message nhiều lần
  (cùng `message.id` + `requestId`, usage y hệt). Chỉ bản ghi đầu tiên được tính - nếu cộng hết thì token
  và chi phí phồng gần gấp đôi. Số liệu đã đối chiếu khớp với `npx ccusage`.
- Token gom theo **bucket từng giờ** nên tính được hôm nay / 5 giờ / 7 ngày mà không phải đọc lại file.
- Cache write tính `1.25×` giá input (TTL 5 phút) hoặc `2×` (TTL 1 giờ), cache read `0.1×` - đọc chính xác
  từ `cache_creation.ephemeral_5m/1h_input_tokens` trong transcript.
- "Token API" cộng cả cache read nên số rất lớn (hàng chục triệu là bình thường với phiên dài) - đó là
  lượng token đi qua API, không phải kích thước context.
- Số tiền là **giá quy đổi theo API first-party**, KHÔNG phải hoá đơn thực tế. Nếu bạn dùng gói thuê tháng
  (Claude Code Pro/Max), con số này chỉ để so sánh mức tiêu thụ giữa các phiên.
- Giá thay đổi thì sửa `pricing.json`, không cần sửa code.

---

## 7. Hỗ trợ theo hệ điều hành

| Tính năng | macOS | Linux | Windows |
| --- | :---: | :---: | :---: |
| Danh sách tiến trình + cây cha-con | ✅ `ps` | ✅ `ps` | ✅ PowerShell + CIM |
| RAM / CPU / uptime từng nhánh | ✅ | ✅ | ✅ |
| Token, chi phí, sub-agent của Claude Code | ✅ | ✅ | ✅ |
| Kill / kill cây | ✅ | ✅ | ✅ `taskkill` |
| Tạm dừng / tiếp tục | ✅ | ✅ | ❌ (Windows không có SIGSTOP) |
| Cổng đang LISTEN | ✅ `lsof` | ✅ `lsof` | ✅ `netstat` |
| Docker container | ✅ | ✅ | ✅ |
| RAM hệ thống | ✅ `vm_stat` | ✅ `/proc/meminfo` | ✅ CIM |
| Load average | ✅ | ✅ | ❌ (không có khái niệm này) |
| Đóng gói app có icon | ✅ `.app` | dùng `run.sh` | ✅ shortcut `.lnk` |

Trên Windows, cột "của tôi" luôn hiển thị là của bạn (đọc chủ sở hữu tiến trình rất chậm); nếu không đủ
quyền thì `taskkill` sẽ báo lỗi rõ ràng.

---

## 8. Cấu trúc thư mục

```
AIMonitor/
├── run.sh / run.cmd / AIMonitor.vbs   # chạy nhanh (macOS-Linux / Windows / Windows không console)
├── pricing.json                       # giá + cửa sổ context theo model, sửa tay được
├── aimon/
│   ├── server.py                      # HTTP server, API, thao tác kill/pause (có guard)
│   ├── snapshot.py                    # gom dữ liệu các collector thành 1 JSON
│   ├── collectors/
│   │   ├── procs.py                   # phân loại AI, dựng cây, %CPU theo delta, rollup RAM
│   │   ├── procs_posix.py             # ps / vm_stat / proc
│   │   ├── procs_windows.py           # PowerShell + Win32_Process
│   │   ├── claude.py                  # transcript: token theo giờ, tool đang chạy, sub-agent
│   │   ├── usage.py                   # hạn mức Session 5h / Weekly 7d + cảnh báo số cũ
│   │   └── ports.py                   # lsof / netstat + docker ps
│   └── static/                        # index.html, style.css, app.js, favicon.svg
├── assets/                            # logo: PNG các cỡ, icon.ico, AIMonitor.icns
├── scripts/
│   ├── make_icons.py                  # vẽ logo bằng Python thuần (không cần thư viện ảnh)
│   ├── build_macos_app.sh             # đóng gói AIMonitor.app
│   └── build_windows.ps1              # tạo shortcut Windows
└── .claude/skills/                    # skill git dùng với Claude Code (push-code, merge-code)
```

---

## 9. API

| Endpoint | Mô tả |
| --- | --- |
| `GET /api/snapshot` | Toàn bộ dữ liệu 1 lần: system, usage, groups, ai (kèm session + cây con), orphan_sessions, totals, processes, ports, docker |
| `GET /api/events?session=<id>` | 60 event gần nhất của 1 phiên |
| `GET /api/ports` | Ép đọc lại cổng / Docker ngay |
| `GET /api/version` | Version + khả năng của OS hiện tại |
| `POST /api/action` | `{"action": "pause\|resume\|kill\|force_kill\|kill_tree\|pause_tree\|resume_tree", "pid": 123}` |

Dùng từ terminal:

```bash
curl -s localhost:8899/api/snapshot | python3 -m json.tool | head -40
curl -s -X POST localhost:8899/api/action \
     -H 'Content-Type: application/json' -d '{"action":"kill_tree","pid":12345}'
```

---

## 10. Câu hỏi thường gặp

**Kill Copilot rồi nó lại chạy?** Đó là hành vi của VS Code, không phải lỗi tool: extension host giám sát
và bật lại language server. Badge *"Code Helper (Plugin) quản lý"* trên thẻ là để báo trước điều đó.
Muốn tắt hẳn thì disable extension.

**Nút kill bấm không thấy gì?** Bản cũ dùng `confirm()` của browser; Chrome chặn dialog sau vài lần nên
click bị vô hiệu. Bản này dùng hộp thoại trong trang, không còn hiện tượng đó.

**Số Session/Weekly hiển thị cũ?** Xem mục [5](#5-hạn-mức-tài-khoản-session-5-giờ--weekly-7-ngày) - số chính
thức chỉ mới khi statusline của Claude Code chạy. Cột ước lượng local bên cạnh luôn mới.

**Trang có nhấp nháy khi tự làm mới?** Không - mỗi lần refresh chỉ sửa đúng đoạn text thay đổi (DOM morph),
giữ nguyên vị trí cuộn và trạng thái mở/đóng của cây. Hiệu ứng làm sáng số vừa đổi mặc định **tắt**.

**Không thấy phiên AI nào?** Kiểm tra `~/.claude/projects/` có transcript chưa; với các AI khác (Codex,
Copilot) tool chỉ theo dõi được RAM/CPU/uptime vì chúng không xuất transcript dạng tương tự.

**Cổng 8899 đang bận?** `./run.sh --port 9001`.

---

## 11. Góp code

Repo có kèm 2 skill dùng với Claude Code:

| Skill | Việc nó làm |
| --- | --- |
| `/push-code` | Xem diff, tự viết commit message theo chuẩn repo, tạo nhánh nếu đang ở `main`, rồi push |
| `/merge-code` | Merge an toàn qua nhánh tạm, chạy kiểm tra nhanh, mở Pull Request |

Chi tiết trong `.claude/skills/`. Nếu không dùng Claude Code thì cứ commit / push như bình thường.
