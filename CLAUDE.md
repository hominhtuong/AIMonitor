# CLAUDE.md - đặc tả kỹ thuật AI Monitor

Tài liệu cho người sửa code (và cho AI agent). README.md chỉ dành cho người dùng cuối:
họ cần biết tool làm được gì và mở lên thế nào, không cần biết những thứ dưới đây.

## Ràng buộc nền tảng

- **Chỉ Python stdlib**, tối thiểu 3.9. Không thêm dependency. Lý do: app macOS chạy bằng
  `/usr/bin/python3` (3.9.6) - đó là Python duy nhất chắc chắn có mặt khi mở từ Finder.
  Mọi cú pháp 3.10+ (`match`, `X | Y` lúc runtime) đều hỏng ở đó. Dùng
  `from __future__ import annotations` nên annotation kiểu `int | None` thì an toàn.
- Server bind `127.0.0.1`, không gửi dữ liệu ra ngoài, không gọi API Anthropic.
- Frontend không dùng thư viện ngoài, không build step.

## Bố cục

```text
aimon/
  server.py             HTTP server, routing, thao tác kill/pause, chọn cổng
  instance.py           state file ~/.aimon/instance.json (host/port/pid instance đang chạy)
  snapshot.py           gộp mọi collector thành 1 JSON cho /api/snapshot
  collectors/
    procs.py            phân loại AI, dựng cây cha-con, %CPU theo delta, rollup RAM
    procs_posix.py      ps / vm_stat
    procs_windows.py    PowerShell + Win32_Process
    claude.py           parse transcript: token theo bucket giờ, tool đang chạy, sub-agent
    usage.py            hạn mức Session 5h / Weekly 7d, hiệu chỉnh % ước lượng
    ports.py            lsof / netstat + docker ps
  static/               index.html, style.css, app.js, favicon.svg
scripts/
  install_macos.sh      dựng + cài AIMonitor.app rồi tự kiểm tra
  build_windows.ps1     tạo shortcut Windows
  make_icons.py         vẽ logo bằng Python thuần
```

## Chọn cổng (server.py)

Thứ tự: cổng mong muốn (`--port` / `AIMON_PORT`, mặc định 8899) => lùi dần tối đa
`PORT_SCAN_TRIES` cổng => cổng ngẫu nhiên do OS cấp (`bind` cổng 0).

Trước khi bind, `_running_instance()` thăm dò `GET /api/version` ở cổng mong muốn rồi ở cổng
trong state file. Gặp AI Monitor đang chạy thì **không bật instance thứ hai**, chỉ mở lại tab
cũ. `--new` bỏ qua bước này, `--strict-port` bắt buộc đúng cổng.

`~/.aimon/instance.json` được ghi khi bind xong và xoá ở `finally`. SIGTERM có handler riêng
để `serve_forever()` thoát êm - nếu không, `kill <pid>` sẽ bỏ lại state rác. State cũ không
gây hại: mọi chỗ dùng nó đều đối chiếu lại (probe HTTP, hoặc khớp cặp port+pid với cổng đang
LISTEN thật ở `ports.py`).

## Hạn mức tài khoản (usage.py) - phần dễ sai nhất

**Nguồn chính: `~/.claude.json` => `cachedUsageUtilization`.** Đúng số mà bảng "Account & Usage"
của Claude Code hiển thị:

```text
cachedUsageUtilization.fetchedAtMs                        thời điểm Claude Code làm mới
cachedUsageUtilization.utilization.five_hour.utilization  % Session, kèm .resets_at (ISO8601)
cachedUsageUtilization.utilization.seven_day.utilization  % Weekly
cachedUsageUtilization.utilization.limits[]               kind = session | weekly_all | weekly_scoped
```

File ~140 KB mà `/api/snapshot` chạy mỗi 3 giây nên `_claude_json_usage()` cache theo
`(mtime, size)`. `resets_at` là ISO8601 có offset - Python 3.9 không nuốt hậu tố `Z` nên phải
thay bằng `+00:00`. Hai lần đọc liên tiếp có `resets_at` lệch nhau vài phần trăm giây dù cùng
một cửa sổ, nên so mốc reset phải có dung sai (`WINDOW_MATCH_TOL`), so bằng `==` là hỏng.

**`cachedUsageUtilization` là cache, không phải số sống.** Đo từ các bản
`~/.claude/backups/.claude.json.backup.*`: trễ tới 9.6 phút, khoảng cách giữa hai lần fetch
từ 15 phút tới 110 phút. Trong khi đó giá trị chạy rất nhanh - đo thật: 4% lúc 13:36 lên 15%
lúc 13:51 (11 điểm / 15 phút). Hiển thị thẳng số trong cache là thiếu cả chục điểm, đó chính
là lỗi "dashboard 15% trong khi CLI đã 18%".

**Nguồn dự phòng: `~/.claude/rate-cache.json`**, do statusline ghi. Chỉ dùng khi
`~/.claude.json` không đọc được. File này cũ rất nhanh nếu statusline không render - đã gặp ca
cũ 69 giờ, và chính nó là lý do bản trước hiển thị sai (`--` và `≈3%` trong khi thực tế là
15% / 54%). Đừng đảo lại thứ tự ưu tiên.

Cửa sổ hạn mức của Claude **neo theo mốc reset**, không phải cửa sổ trượt. Cửa sổ kế tiếp bắt
đầu ở **lần gọi API đầu tiên sau khi cửa sổ trước hết hạn**. `_rebuild_window()` dựng lại mốc
này bằng cách đi tới theo hoạt động thật trong transcript (`claude.activity_hours()`), sai số
tối đa 1 giờ do gom theo bucket giờ. Đừng thay bằng cửa sổ trượt `now - 5h`: nó vắt qua hai
cửa sổ thật và cho số cao gấp đôi.

Vì vậy số hiển thị = **% chính thức + phần bù đã dùng thêm kể từ `fetchedAtMs`**
(`source = "projected"`). `_resolve()` chốt theo thứ tự: official + bù => official còn mới =>
ước lượng tuyệt đối => official cũ (chỉ khi cửa sổ chưa reset, lúc đó % là cận dưới) => không
có số. **Không bao giờ đổi số to từ % sang token**: người dùng nhìn ô đó để biết còn chạy được
bao lâu, đổi đơn vị ngầm là mất nghĩa.

Hiệu chỉnh trần dùng **chênh lệch giữa hai lần đọc liên tiếp**, không dùng giá trị tuyệt đối:
`trần = C.tokens_since(t1, t2) / (Δ% / 100)`. Các lần đọc lưu ở `~/.aimon/calib.json`, lần đầu
nạp mồi từ `~/.claude/backups/.claude.json.backup.*` (Claude Code tự giữ vài bản cũ) để có
ngay vài cặp thay vì chờ nhiều giờ.

> **Đừng quay lại cách hiệu chỉnh tuyệt đối** (`trần = token cả cửa sổ / pct`). Nó đòi biết
> cửa sổ bắt đầu từ đâu - thứ ta không biết chắc - và đo thật cho ra 141-191% ở những cửa sổ
> tài khoản rõ ràng không bị chặn. Cách lấy chênh lệch triệt tiêu hoàn toàn ẩn số đó: hai cặp
> đo được trên máy thật cho trần 295M và 269M, lệch nhau 10%.

Sai số một cặp gần như chỉ do % bị làm tròn về số nguyên: chênh 3 điểm là ±17%, chênh 11 điểm
chỉ ±4.5%. Nên `_limit_from()` bỏ cặp chênh dưới `MIN_DELTA_PCT`; nếu chỉ có đúng một cặp thì
cặp đó phải chênh >= `SOLO_DELTA_PCT`. Phần bù còn bị chặn bởi `MAX_DRIFT_PCT` và chỉ áp dụng
khi số chính thức chưa quá `PROJECT_MAX_AGE`.

`claude.tokens_since()` đọc `state["recent"]` - danh sách `(ts, token)` từng message trong
`RECENT_KEEP` giờ gần nhất. Bucket giờ của `window_between()` quá thô cho việc này: không trả
lời được "đã dùng thêm bao nhiêu từ 13:51:44 tới giờ".

## Đếm token (claude.py)

- Token gom vào **bucket từng giờ** (`state["hourly"]`) nên tính được hôm nay / 5h / 7 ngày
  mà không đọc lại file.
- **Chống đếm trùng**: `--include-partial-messages` ghi cùng một message nhiều lần với
  `message.id` + `requestId` giống hệt. Chỉ tính bản ghi đầu (`state["seen_msgs"]`). Bỏ chống
  trùng thì token và chi phí phồng gần gấp đôi. Số đã đối chiếu khớp `npx ccusage`.
- Transcript đọc **tăng dần** (nhớ offset + inode); file ngày cũ parse ở chế độ nhẹ.
- Chi phí = token × giá trong `pricing.json`; cache write `1.25×` (TTL 5 phút) hoặc `2×`
  (TTL 1 giờ), cache read `0.1×`. Sửa giá trong JSON, không sửa code.

## App macOS

Chia đôi việc: `scripts/build_macos_app.sh` đóng gói (máy local và GitHub Actions dùng chung),
`scripts/install_macos.sh` cài vào `/Applications` rồi tự kiểm tra.

Vỏ app là `mac/AIMonitor.swift` - một cửa sổ `WKWebView`, tự bật server Python trong
`Contents/Resources`, chờ `~/.aimon/instance.json` rồi nạp URL. `applicationWillTerminate`
gửi SIGTERM cho tiến trình con nên Cmd+Q dọn sạch state.

Ba cái bẫy đã trả giá - **đừng quay lại kiểu đóng gói cũ** (app chỉ là script gọi python
trong repo):

1. **Rosetta.** Bundle không có Mach-O thật thì macOS không xác định được kiến trúc, chạy nó
   dưới Rosetta và hiện hộp thoại đòi cài Rosetta. Có binary biên dịch là hết; vẫn giữ
   `LSRequiresNativeExecution` + `LSArchitecturePriority` cho nhánh dự phòng.
2. **TCC.** App mở từ Finder không được đọc `~/Documents`, `~/Desktop`, `~/Downloads` =>
   repo nằm trong `~/Documents` thì app chết với `PermissionError` / `No module named aimon`.
   Vì vậy code được **copy vào `Contents/Resources`**; app chỉ đọc chính nó. Đổi lại: sửa code
   xong phải chạy lại script cài.
3. **Cross-compile Swift phải chỉ `-sdk`.** Thiếu nó thì `swiftc -target x86_64-apple-macos11.0`
   báo `unable to load standard library`, script lặng lẽ rơi về nhánh browser. Lấy bằng
   `xcrun --show-sdk-path --sdk macosx`, build 2 lát rồi `lipo -create`.

Không có `swiftc` (máy chưa cài Xcode CLT) thì build rơi về launcher script mở browser, và
chỉ nhánh đó mới đặt `LSUIElement = true` (không cửa sổ thì không cần icon Dock, nhưng cũng
không Cmd+Q được - đó là lý do vẫn giữ `POST /api/quit` + nút "Tắt").

Script cài tự kiểm tra: mở app, chờ `~/.aimon/instance.json`, gọi `/api/version`, đọc `arch`
để xác nhận native. macOS **không có** `ps -o arch=` (in ra danh sách keyword rồi thoát
non-zero, dưới `set -e` là chết script) - đó là lý do server tự khai báo `arch`.

## Phát hành (.github/workflows/build-macos.yml)

Push `main` => có artifact tải trong tab Actions. Đẩy tag `v*` => tạo Release kèm
`AIMonitor-macos.zip`.

- Đóng gói bằng `ditto -c -k --sequesterRsrc --keepParent`, không dùng `zip`: `zip` làm mất
  cờ thực thi và resource fork của bundle. Workflow giải nén lại để kiểm tra đúng hai thứ đó.
- Không `open` app để smoke test trên runner: chạy headless nên bật app GUI hỏng vì lý do
  không liên quan tới code. Thay bằng chạy server thẳng từ `Contents/Resources` - đó mới là
  thứ vỡ khi đóng gói sai.

## Ký app

**Bắt buộc ký, kể cả ad-hoc.** `lipo -create` xoá chữ ký của từng lát, để nguyên thì bundle
không seal resources, Info.plist không bind, `spctl` báo `no usable signature` và macOS có thể
kêu app "bị hỏng". `build_macos_app.sh` luôn chạy `codesign` ở cuối rồi `--verify --strict`.

Hardened runtime (`--options runtime`) bật sẵn vì notarize đòi. Đã kiểm tra: app vẫn spawn
được `/usr/bin/python3` dưới hardened runtime, không cần entitlement nào.

Ba mức, đã đo `spctl` thật ở từng mức:

| Mức | Bản tự build | `spctl` trên bản tải về |
| --- | --- | --- |
| Ad-hoc | chạy thẳng | `rejected` - `no usable signature` |
| Developer ID, chưa notarize | chạy thẳng | `rejected` - `Unnotarized Developer ID` |
| Developer ID + notarize + staple | chạy thẳng | `accepted` - `Notarized Developer ID` |

Chỉ **notarize** mới bỏ được cảnh báo, ký không thôi là chưa đủ. Bản phát hành hiện tại đã
notarize (submission Accepted) và đã kiểm tra vòng tròn đầy đủ: gắn cờ quarantine lên .zip,
giải nén, `spctl` trả `accepted`, `stapler validate` còn nguyên, mở app lên server chạy ngay
mà không hộp thoại nào hiện ra.

`scripts/release_macos.sh` làm cả chuỗi đó và **tự chặn** nếu bước cuối không `accepted` -
đừng bỏ bước kiểm tra này, nó là thứ duy nhất phân biệt "đã ký" với "user mở được".

Cờ quarantine chỉ do browser gắn vào file tải từ mạng, nên **bản build tại máy không bao giờ
vướng Gatekeeper**. Đó là lý do `./scripts/install_macos.sh` xưa nay chạy ngon mà chẳng ký gì.

Bật ký thật: đặt `AIMON_SIGN_ID="Developer ID Application: Tên (TEAMID)"` khi build. Trên CI
thì nạp secret, workflow tự phát hiện và bật thêm bước notarize:

| Secret | Là gì |
| --- | --- |
| `MACOS_CERT_P12` | file .p12 xuất từ Keychain, encode base64 |
| `MACOS_CERT_PASSWORD` | mật khẩu đặt lúc xuất .p12 |
| `MACOS_SIGN_ID` | tên đầy đủ của chứng chỉ |
| `APPLE_ID`, `APPLE_TEAM_ID` | tài khoản Apple Developer |
| `APPLE_APP_PASSWORD` | app-specific password, tạo ở appleid.apple.com |

Trong bước nạp keychain, `security set-key-partition-list` là bắt buộc - thiếu nó thì
`codesign` treo chờ nhập mật khẩu và job chạy tới hết timeout.

## Windows (.exe)

`windows/app_win.py` là điểm vào của bản đóng gói, `.github/workflows/build-windows.yml`
dựng nó bằng PyInstaller `--onefile --noconsole`.

- **PyInstaller là công cụ lúc build, không phải dependency của tool.** Code trong `aimon/`
  vẫn chỉ dùng stdlib. Người tải `.exe` không cần cài Python.
- Bản đóng gói giải nén tài nguyên ra `sys._MEIPASS`, nên `server.BASE` và `claude.BASE` phải
  nhìn `getattr(sys, "frozen", False)`. Sai chỗ này thì mất `static/` hoặc `pricing.json` mà
  chỉ lộ ra lúc chạy. CI vì thế gọi cả `/api/snapshot` lẫn `/static/app.js` chứ không chỉ
  `/api/version`.
- `--noconsole` khiến `sys.stdout` là `None`; server in URL ở nhiều chỗ nên `print()` sẽ nổ
  `AttributeError`. `main()` thay bằng đối tượng nuốt output trước khi làm gì khác.
- Cửa sổ riêng có được bằng cách gọi Edge (hoặc Chrome) với `--app=<url>` và
  `--user-data-dir` riêng - không thanh địa chỉ, không tab, không dùng chung cookie với
  browser của người dùng. Đóng cửa sổ thì `proc.wait()` trả về và tiến trình thoát. Cách này
  tránh phải nhúng WebView2 và kéo theo .NET.
- Cờ `--no-window` để CI chạy thử phần server mà không cần mở cửa sổ.

**Ký Windows khác hẳn macOS.** Từ 6/2023 khoá riêng bắt buộc nằm trong HSM hoặc token phần
cứng, nên ký trong CI phải qua dịch vụ ký đám mây (Azure Trusted Signing ~10 USD/tháng,
DigiCert KeyLocker, SSL.com eSigner). Chứng chỉ OV còn phải tích luỹ uy tín SmartScreen một
thời gian mới hết cảnh báo; EV hết ngay nhưng đắt hơn. Hiện `.exe` chưa ký - user bấm
**More info => Run anyway** một lần.

## Frontend (static/app.js)

Không bao giờ gán `innerHTML` cho vùng đang xem. Mỗi lần làm mới, HTML mới được so với DOM
hiện tại (hàm `morph`) và chỉ phần thay đổi được sửa - nhờ vậy không nháy, không mất vị trí
cuộn, không mất trạng thái mở/đóng cây.

Xác nhận thao tác dùng hộp thoại trong trang, **không dùng `confirm()`** - Chrome chặn dialog
gốc sau vài lần và làm nút kill trông như hỏng.

## Guard khi kill

`snapshot.protected_pids()` chặn PID 0/1, chính AI Monitor và toàn bộ tiến trình cha của nó.
API trả lỗi rõ ràng thay vì im lặng. Giữ nguyên guard này khi thêm thao tác mới.

## Việc đã biết là còn nợ

- **DNS rebinding**: server không kiểm tra header `Host`. Một trang web trỏ tên miền về
  127.0.0.1 sẽ được browser coi là same-origin và gọi được `/api/action` (kill tiến trình).
  Fix: chặn request có `Host` không thuộc `localhost` / `127.0.0.1` / `[::1]`.
- `/api/action` và `/api/quit` không có xác thực. Chấp nhận được khi chỉ bind loopback, nhưng
  phải thêm token trước khi mở ra LAN (`--host 0.0.0.0`).

## Kiểm tra trước khi commit

```bash
python3 -m compileall -q aimon        # cú pháp
/usr/bin/python3 -c "import sys; sys.path.insert(0,'.'); import aimon.server"   # 3.9 compat
node --check aimon/static/app.js      # cú pháp JS
./scripts/install_macos.sh            # tự kiểm tra app macOS đầu-cuối
```
