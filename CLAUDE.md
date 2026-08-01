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
- **Mọi lệnh ngoài phải đi qua `aimon/proc_util.py`, đừng gọi thẳng `subprocess`.** Trên
  Windows, gọi một chương trình console (powershell, netstat, taskkill) từ tiến trình KHÔNG có
  console - bản `.exe` dựng `--noconsole`, hoặc server do extension spawn - sẽ khiến hệ điều
  hành bật một cửa sổ console mới. Collector chạy theo nhịp `/api/snapshot` tức mỗi 3 giây,
  nên người dùng thấy cửa sổ đen nháy liên tục không dứt. `proc_util` thêm `CREATE_NO_WINDOW`
  (getattr, vì hằng số này không tồn tại trên POSIX).
- **Đừng tin stdout là UTF-8.** Thông báo của tool đều là tiếng Việt có dấu, mà stdout bị pipe
  đi (extension spawn) hoặc console đang ở code page cũ thì Python mã hoá bằng cp1252/cp1258
  và `print` một chữ 'Đ' là `UnicodeEncodeError` - server chết trước khi phục vụ request nào.
  `server.main()` gọi `_force_utf8_stdio()` ngay dòng đầu. Tái hiện lỗi bằng
  `PYTHONIOENCODING=cp1252 python3 -m aimon.server --new --port 0`.

## Bố cục

```text
aimon/
  server.py             HTTP server, routing, thao tác kill/pause, chọn cổng
  instance.py           state file ~/.aimon/instance.json (host/port/pid instance đang chạy)
  snapshot.py           gộp mọi collector thành 1 JSON cho /api/snapshot
  office.py             payload nhẹ cho khung nhìn Văn phòng (/api/pulse)
  proc_util.py          gọi lệnh ngoài không nháy cửa sổ console trên Windows
  config_file.py        đọc ~/.aimon/config.json - cấu hình dùng chung cho cả ba vỏ
  collectors/
    procs.py            phân loại AI, dựng cây cha-con, %CPU theo delta, rollup RAM
    procs_posix.py      ps / vm_stat
    procs_windows.py    PowerShell + Win32_Process
    claude.py           parse transcript: token theo bucket giờ, tool đang chạy, sub-agent
    usage.py            hạn mức Session 5h / Weekly 7d, hiệu chỉnh % ước lượng
    ports.py            lsof / netstat + docker ps
  static/               index.html, style.css, app.js, i18n.js, favicon.svg
                        office.js (khung nhìn Văn phòng), sprites.js (nhân vật pixel)
mac/AIMonitor.swift     vỏ app macOS (WKWebView)
windows/app_win.py      điểm vào bản .exe Windows
vscode-extension/       vỏ extension VSCode (TypeScript)
  src/extension.ts      activate/deactivate, đăng ký webview view
  src/dashboardViewProvider.ts  bật server rồi nhúng dashboard vào iframe
  src/serverManager.ts  spawn python, probe /api/version, chờ instance.json, SIGTERM
  src/pythonFinder.ts   dò Python thật trên máy rồi kiểm tra phiên bản bằng cách chạy thử
  src/serverSession.ts  một server dùng chung cho panel, tab và thanh trạng thái
  src/statusBar.ts      nút ở thanh trạng thái, hiện % hạn mức
  src/dashboardPanel.ts dashboard mở thành tab trong editor
  src/config.ts         đọc settings; src/usage.ts các hàm thuần (test được, không cần vscode)
  src/instanceFile.ts   đọc + kiểm tra ~/.aimon/instance.json
  scripts/copy-aimon.js copy aimon/ + pricing.json + icon vào gói lúc build
scripts/
  build_macos_app.sh    đóng gói AIMonitor.app (local + CI dùng chung)
  install_macos.sh      cài vào /Applications rồi tự kiểm tra
  release_macos.sh      ký Developer ID + notarize + staple
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

Ba kênh phát hành, ba workflow, cùng một quy tắc: **luôn chạy server từ chính bản đã đóng gói**
chứ đừng chạy từ cây source, vì lỗi đóng gói chỉ lộ ra ở đó.

| Workflow | Ra cái gì | Chạy trên |
| --- | --- | --- |
| `build-macos.yml` | `AIMonitor-macos.zip` | macos-latest |
| `build-windows.yml` | `AIMonitor.exe` | windows-latest |
| `build-vscode.yml` | `aimonitor-*.vsix` + publish lên Marketplace | ubuntu + windows + macOS, Python 3.9 (đúng sàn của repo) |

`build-vscode.yml` có năm job:

| Job | Làm gì |
| --- | --- |
| `build` | tsc, unit test, đóng gói, soát danh sách file trong gói, chạy server trên Linux |
| `check-pat` | `vsce verify-pat mituultra` - biết token hỏng **trước** khi đẩy tag |
| `windows-check` | tải đúng file `.vsix` đó về windows-latest, chạy lại server bằng `python` thật |
| `macos-check` | như trên nhưng trên macos-14, bằng `/usr/bin/python3` |
| `release` | chỉ khi đẩy tag: đính kèm `.vsix` vào Release rồi publish |

Thiếu `pricing.json` / `static/` hay lọt `__pycache__`, `.ts` là fail ngay ở `build`.

Cả ba job chạy thử server đều đặt `PYTHONIOENCODING=cp1252` và **chuyển hướng stdout đi chỗ
khác**. Không có hai thứ đó thì runner chạy sẵn console UTF-8, và CI bỏ lọt nguyên một lớp
lỗi - bản 1.2.3 lên tới Marketplace với server chết ngay ở `print` tiếng Việt đầu tiên trong
khi cả năm job đều xanh. Job chạy thử phải mô phỏng **đúng điều kiện extension tạo ra**, không
phải điều kiện dễ chịu của runner.

`macos-check` **không** dùng `setup-python`: bản Python quan trọng với repo này là
`/usr/bin/python3` (3.9.6), thứ duy nhất chắc chắn có trên máy người dùng macOS.
`setup-python` sẽ cài một Python khác rồi kiểm tra nhầm sang nó. Cũng vì thế không đặt được
`python-version: 3.9` cho macos-14 - runner Apple Silicon không có bản 3.9 arm64 dựng sẵn.

Đừng viết `[ -f "$state" ] && { echo ...; exit 1; }` trong các bước bash: dưới `bash -e` của
GitHub, nhánh AND-list này dễ làm bước fail nhầm khi điều kiện sai. Dùng `if ... fi`.

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

## Extension VSCode (vscode-extension/)

Vỏ thứ ba, song song với app macOS và `.exe` Windows. Nó **không viết lại gì của `aimon/`**:
chỉ spawn `python3 -m aimon.server --port 0` khi user mở panel lần đầu (lazy, không bật lúc
VSCode khởi động), đợi `~/.aimon/instance.json`, probe `/api/version`, rồi nhúng dashboard
vào `<iframe>` trong webview. Sửa gì trong `aimon/` là extension hưởng theo, không cần đụng
tới TypeScript.

`npm run package` copy `aimon/` vào `vscode-extension/aimon/` rồi mới đóng gói - giống cách
app macOS copy code vào `Contents/Resources`. Đổi lại: sửa `aimon/` xong phải đóng gói lại
mới thấy thay đổi trong extension đã cài.

Bốn chỗ đã trả giá:

1. **`pricing.json` nằm ở gốc repo, không nằm trong `aimon/`.** `claude.py` tìm nó ở thư mục
   **cha** của `aimon/`, dưới extension chính là `vscode-extension/`. Quên copy thì tool vẫn
   chạy, chỉ có mọi con số chi phí về 0 - hỏng lặng lẽ. CI vì thế đọc `/api/snapshot` và bắt
   buộc có `totals`, không chỉ gọi `/api/version`.
2. **Icon activity bar phải đơn sắc, không nền tô đầy.** VSCode mask icon đó theo kênh alpha:
   bỏ hết màu, vùng nào không trong suốt thì thành silhouette. `favicon.svg` gốc có nền bo góc
   tô đầy gần kín khung nên mask ra chỉ còn một khối vuông đặc. `copy-aimon.js` vẽ lại đường
   nhịp + chấm tròn, bỏ nền. Icon marketplace (`package.json` -> `icon`) thì ngược lại: PNG
   vuông, giữ nguyên màu.
3. **`retainContextWhenHidden` là bắt buộc.** VSCode dispose webview view ngay khi user thu
   gọn panel hoặc đổi container, mà `onDidDispose` lại bắn SIGTERM. Không giữ context thì
   server bị giết và spawn lại liên tục, lần đọc đầu sau mỗi lần spawn còn cho %CPU sai vì
   mất snapshot mồi.
4. **`stdio` của stderr phải được đọc.** Để `'pipe'` mà không ai đọc thì buffer OS đầy là
   server Python block khi ghi, treo vĩnh viễn. `serverManager.ts` đọc và giữ 2000 ký tự cuối
   để hiện trong webview khi khởi động lỗi.

Không khai `activationEvents`: từ VSCode 1.74 nó tự sinh `onView:` từ phần `views` trong
`contributes`, khai thêm chỉ tổ bị cảnh báo. Nhờ vậy extension chỉ thức dậy khi user mở panel
chứ không phải mọi cửa sổ VSCode.

`extensionKind` để `["workspace", "ui"]`: qua Remote-SSH thì tiến trình AI chạy ở máy remote,
nên extension phải chạy bên đó mới thấy đúng. `asExternalUri` lo phần port forwarding.

### Windows - hai chỗ phải làm riêng

**Đừng đoán tên binary Python - đi dò.** `pythonFinder.ts` quét `py -0p` (launcher liệt kê
mọi bản đã đăng ký, kèm đường dẫn thật), `where`/`which -a`, rồi các thư mục cài mặc định
(`%LOCALAPPDATA%\Programs\Python\Python3*`, `/opt/homebrew`, pyenv shims...). Máy Windows cài
Python từ python.org mà quên tick "Add to PATH" là chuyện rất thường - chỉ tra PATH là hỏng.

Mỗi ứng viên phải **tự khai phiên bản bằng cách chạy thật** (`-c "import sys;print(...)"`),
không suy đoán từ tên file. Dưới 3.9 thì loại. Nhờ vậy alias Store cũng tự rụng mà không cần
luật riêng.

**`python` trên Windows thường không phải Python.** Windows 10/11 cài sẵn App Execution Alias
`python.exe` trỏ về Microsoft Store. Máy chưa cài Python thật thì alias đó vẫn nằm trên PATH,
nên `spawn` **không** báo ENOENT: nó chạy được, mở trang Store rồi thoát ngay với mã 9009.
Đáng nói hơn: **chạy nó sẽ mở trang Store**, nên khi dò phải loại từ trước chứ không phải chạy
rồi mới biết. Dấu hiệu: file 0 byte nằm trong `\WindowsApps\` (bản Python cài thật từ Store
cũng ở đó nhưng có kích thước thật, và dùng được - đừng loại theo đường dẫn).

`waitForServer()` bỏ chờ ngay khi tiến trình con thoát, và `startWithDiscoveredPython()`
chuyển sang interpreter kế tiếp thay vì bỏ cuộc. Không tìm thấy Python nào thì ném
`PythonNotFoundError` - panel hiện nút "Tải Python" + "Thử lại", chứ không đổ ra một traceback
mà người dùng không hiểu.

**Không SIGTERM để tắt server.** Node trên Windows dịch SIGTERM thành `TerminateProcess`:
Python chết ngay, khối `finally` trong `server.py` không chạy, `~/.aimon/instance.json` ở lại
làm rác. `shutdownAimonServer()` gọi `POST /api/quit` trước - endpoint đó chạy
`server.shutdown()` nên `serve_forever()` thoát êm và state được dọn - hết hạn 1.5 giây mới
SIGTERM. Cùng một đường trên cả ba hệ điều hành. Job `windows-check` trong CI kiểm tra đúng
điều này: gọi `/api/quit` rồi khẳng định `instance.json` biến mất.

### Phát hành lên VSCode Marketplace

Danh tính extension là `<publisher>.<name>` = **`mituultra.aimonitor`**. VSCode không có
"bundle id" kiểu `com.mitu.aimonitor` như JetBrains: `name` chỉ được dùng chữ thường, số và
gạch nối, còn `publisher` phải là publisher ID đã đăng ký ở
[Marketplace manage](https://marketplace.visualstudio.com/manage). **Đổi được trước lần
publish đầu, sau đó thì không** - muốn đổi là phải đăng extension mới, mất hết lượt cài và
đánh giá.

- CI publish **chính file `.vsix`** đã qua job `build` và `windows-check`, bằng
  `vsce publish --packagePath`. Đừng đổi thành `vsce publish` không tham số: nó build lại và
  phát hành thứ chưa ai chạy thử.
- Số phiên bản lấy từ `vscode-extension/package.json`, **không** lấy từ tag git. Quên bump nó
  là Marketplace từ chối vì version đã tồn tại. Để khỏi quên, ba số được giữ **bằng nhau**:
  `aimon/server.py` -> `VERSION`, `vscode-extension/package.json` -> `version`, và tag `v*`.
  Phát hành thì sửa cả hai file rồi mới tag.
- Thiếu secret `VSCE_PAT` thì workflow không fail, chỉ ghi cảnh báo vào job summary và
  Release vẫn có `.vsix`.
- `OVSX_PAT` là tuỳ chọn, để đăng thêm lên Open VSX (store của VSCodium, Cursor, Windsurf).

| Secret | Lấy ở đâu |
| --- | --- |
| `VSCE_PAT` | Azure DevOps => User settings => Personal Access Tokens, Organization = **All accessible organizations**, scope **Marketplace => Manage** |
| `OVSX_PAT` | open-vsx.org, đăng nhập rồi vào Settings => Access Tokens |

PAT của Azure DevOps hết hạn tối đa 1 năm, hết hạn thì bước publish fail với 401 - lúc đó tạo
token mới rồi cập nhật secret, không phải lỗi code.

### Settings, thanh trạng thái và hai khung nhìn

Settings khai ở `contributes.configuration`, VSCode tự vẽ bảng - không phải viết giao diện.
`config.ts` là chỗ DUY NHẤT đọc settings; rải `getConfiguration` khắp nơi thì giá trị mặc định
thành hai nguồn sự thật với `package.json`.

Ba nơi cùng cần server nên có `AimonServerSession` **đếm người giữ**: panel, tab và thanh
trạng thái đều `acquire`/`release`, server chỉ tắt khi không còn ai. Trước đây provider của
sidebar tự giữ tiến trình, thêm tab vào là ai đóng trước cũng giết nó.

**Thanh trạng thái không bao giờ tự bật server.** Nó gọi `peek()` - chỉ đọc instance.json rồi
probe - nên mở VSCode lên không phát sinh tiến trình Python nào. Có server sẵn (app macOS,
.exe, hay cửa sổ VSCode khác) thì hiện số, chưa có thì nằm im; bấm vào mới bật.

Hai khung nhìn khác nhau ở đúng một tham số: panel hẹp chạy `?compact=1`, tab rộng thì không.
Đừng nhân đôi frontend - `body.compact` trong `style.css` lo phần bố cục hẹp.

Cấu hình truyền cho trang web qua **query param** (`?theme=&refresh=&compact=`), không qua
file. Lý do: hai khung nhìn trong cùng một cửa sổ phải khác nhau được, và settings của VSCode
không được đè lên cấu hình của app macOS / .exe đang dùng chung server.

Hàm thuần (đọc snapshot, dựng chuỗi, ghép URL) nằm ở `usage.ts` và **không import `vscode`** -
nhờ vậy unit test nạp được bằng node. File nào import `vscode` là file đó không test được,
nên đừng để logic vào đấy.

Đường dẫn dữ liệu truyền qua biến môi trường `AIMON_CLAUDE_DIR` / `AIMON_PRICING` chứ không
qua tham số dòng lệnh: cả ba vỏ đều spawn server nên đặt env là xong.

### Tự dò và tự điền ba ô đường dẫn (autoConfig.ts + settingsPlan.ts)

`pythonPath`, `claudeDataDir`, `pricingFile` để trống nghĩa là "tự dò", nhưng người mở bảng
Settings nhìn thấy ba ô trắng thì hiểu là tool chưa lấy được dữ liệu. Vì vậy `activate()` bắn
`syncDetectedSettings()` chạy nền (**không** `await` - dò Python phải chạy thử từng bản, chặn
`activate` ở đó là cả cửa sổ VSCode đứng hình) để điền sẵn giá trị đang thật sự dùng.

Đổi lại thì phải chịu chuyện đường dẫn tuyệt đối chết dần. Ba tình huống bắt buộc phân biệt,
và đó là toàn bộ lý do `settingsPlan.ts` tồn tại:

| Tình huống | Làm gì |
| --- | --- |
| Ô trống, chưa bao giờ điền | điền vào |
| Ô trống vì người dùng tự xoá | **để yên** - xoá là ý muốn quay về tự dò |
| Giá trị mình từng điền mà nay chết | lặng lẽ thay bằng bản mới dò được |
| Giá trị người dùng tự gõ mà nay chết | chỉ cảnh báo một lần, không sửa đồ của người ta |

Ca "người dùng tự xoá" là ca dễ làm sai nhất: không nhớ mình đã điền gì thì mỗi lần mở VSCode
giá trị lại mọc ra, xoá mãi không được. Vì vậy `globalState['aimon.autoFilled']` giữ đúng cái
mình đã ghi, và `planSettings()` so với nó chứ không so với "ô có trống hay không".

`pricing.json` nằm trong thư mục cài extension, mà thư mục đó **đổi tên sau mỗi lần cập nhật
extension** - nên đường dẫn cũ chết là chuyện chắc chắn xảy ra, không phải ngoại lệ hiếm. Ca
`heal` chính là để lo việc đó; bỏ nó đi thì mọi con số chi phí về 0 sau lần update đầu tiên.

Quyết định nằm ở `settingsPlan.ts` (**không** import `vscode`, có unit test); phần chạy lệnh
dò, sờ ổ đĩa, ghi settings, hiện QuickPick nằm ở `autoConfig.ts`.

Trong bảng Settings, mỗi ô có một dòng `[$(search) Detect again](command:aimon.selectXxx)` ở
`markdownDescription` - VSCode render `command:` link thành nút bấm được ngay tại chỗ, không
phải mở Command Palette.

## Cấu hình dùng chung (~/.aimon/config.json)

Settings của VSCode chỉ tồn tại trong VSCode. Người dùng app macOS và bản `.exe` không có chỗ
nào đổi nhịp làm mới hay trỏ dữ liệu Claude sang thư mục khác - file này là chỗ đó, server đọc
nên cả ba vỏ đều hưởng. Khoá: `theme`, `refresh_seconds`, `claude_dir`, `pricing_file`, `port`,
`ai_kinds`.

Thứ tự ưu tiên, mạnh trước:

```text
tham số dòng lệnh  >  biến môi trường  >  config.json  >  mặc định trong code
```

Riêng theme và nhịp làm mới có thêm một tầng ở phía trang web: `?theme=` do extension VSCode
truyền vào **đè lên tất cả** (mỗi khung nhìn trong editor tự quyết), rồi tới lựa chọn người
dùng bấm trên trang (localStorage), rồi mới tới file này. File này cho *mặc định*, không phải
*ép buộc* - đó là lý do settings VSCode không ghi vào đây, tránh đổi cấu hình của một cửa sổ
lại làm đổi luôn app macOS đang chạy chung server.

**File hỏng không được làm server chết.** JSON sai cú pháp, thiếu khoá, hay giá trị ngoài
khoảng đều bị bỏ qua và chạy bằng mặc định. Đã kiểm tra cả ba ca.

Trang web nhận cấu hình qua `/api/config.js` - server sinh ra `window.AIMON_CONFIG = {...}`,
`index.html` nạp nó **trước** `app.js`. Dùng JS chứ không dùng `fetch('/api/config')` để trang
biết theme ngay lúc dựng, không vẽ nền tối rồi mới nháy sang nền sáng.

## Lọc theo loại agent (`ai_kinds`)

Mặc định **chỉ hiện Claude Code**. Máy nào cũng sẵn một mớ tiến trình bị `classify()` xếp vào
AI mà người dùng không hề chạy - Copilot đi kèm VSCode, Codex đi kèm editor - bày hết ra thì
che mất thứ cần theo dõi. Máy thật lúc viết phần này: 16 agent gốc, trong đó 9 là Copilot.

Một bộ lọc, hai khung nhìn: thanh chip `#kindbar` dùng chung cho tab AI & Agent và tab Văn
phòng. Tách làm hai giá trị riêng thì đổi ở tab này xong sang tab kia thấy số khác, không ai
hiểu vì sao - vẫn là cùng một danh sách agent nhìn hai kiểu.

Thanh nằm **dưới** thanh tab và `syncKindBar()` ẩn nó ở ba tab còn lại. Đặt phía trên thanh
tab thì trông như nó lọc cả trang, kể cả Lịch sử phiên và Cổng & Docker - hai chỗ nó không hề
đụng tới. `.kindbar` có `display:flex` nên thuộc tính `hidden` của HTML không tự ăn, phải khai
`.kindbar[hidden] { display: none; }`.

Thanh chỉ liệt kê loại **đang có mặt** cộng loại đang chọn, không bày cả bảy loại server biết -
sáu cái trong đó không bao giờ có ai.

Hai khung nhìn lọc ở hai chỗ khác nhau, và đó là chủ ý:

- **Tab AI & Agent lọc ở trang** (`visibleAi()`). `/api/snapshot` trả toàn bộ, không cắt bớt.
- **Tab Văn phòng lọc ở server** (`/api/pulse?kinds=`). Bắt buộc, vì phòng chỉ có `MAX_AGENTS`
  chỗ: cắt trước rồi mới lọc thì agent bị ẩn vẫn chiếm suất và người dùng lọc còn mỗi Claude
  Code lại thấy phòng trống một nửa.

Ba cái bẫy đã dính:

1. **`parse_qs` mặc định vứt tham số rỗng.** `?kinds=` (người dùng bỏ chọn hết) trở thành y
   hệt "không gửi `kinds`", và server trả về **tất cả** - đúng ngược ý người dùng. Phải
   `parse_qs(query, keep_blank_values=True)`, rồi phân biệt ba ca: vắng mặt và `*` là không
   lọc, chuỗi rỗng là không khớp ai.
2. **Thứ tự ưu tiên KHÁC theme, cố ý.** Với bộ lọc thì `localStorage > ?kinds= > config.json`:
   bấm tắt Codex xong tải lại trang mà nó hiện lại thì cái nút coi như hỏng. Theme phải để
   `?theme=` thắng vì dashboard buộc bám màu editor; bộ lọc không có ràng buộc đó, nên settings
   VSCode chỉ đóng vai giá trị **khởi đầu**.
3. **Phải nói rõ đang ẩn bao nhiêu.** Không có dòng "Bộ lọc đang ẩn N agent" thì người chỉ
   dùng Gemini mở lên thấy trang trống và tưởng tool hỏng, chứ không nghĩ tới bộ lọc mặc định.
   Vì lý do đó dòng này kèm luôn nút bật lại tất cả.

Dòng đếm người trong phòng bỏ qua ai đang `leaving`: họ còn trên màn hình thêm vài giây cho
hết đường ra cửa, đếm cả họ thì tắt một loại xong con số vẫn y nguyên, nhìn như lọc không ăn.

**Bật/tắt phải nhìn ra từ xa.** Bản đầu chip tắt chỉ khác chip bật ở `opacity: .5` và một cái
chấm rỗng - trên nền tối gần như không thấy gì. Giờ đổi cùng lúc ba thứ: nền, kiểu viền và màu
chữ, và bám vào `[aria-pressed]` chứ không phải một class riêng. Đừng viết rule `.chip.pick
.dot { background: ... }` - nó cùng độ đặc hiệu với `.chip[data-kind="..."] .dot` nhưng đứng
sau nên sẽ xoá sạch màu riêng của từng loại.

KPI ở đầu trang **không** lọc - nó mô tả cái máy, không mô tả danh sách đang xem.

## Đa ngôn ngữ (static/i18n.js)

Giao diện có tiếng Anh và tiếng Việt, đổi bằng dropdown `#lang`, lựa chọn lưu ở
`localStorage`. Lần đầu vào thì đoán theo `navigator.language`, không phải tiếng Việt thì mặc
định tiếng Anh. Tên ngôn ngữ trong dropdown **không dịch** - luôn viết bằng chính ngôn ngữ đó
để người đang xem tiếng Anh vẫn nhận ra dòng "Tiếng Việt".

**Không viết chữ thẳng vào `app.js` hay `index.html`.** Ba đường:

- HTML: `data-i18n="key"`, ngoài ra có `data-i18n-title`, `data-i18n-placeholder`,
  `data-i18n-html` (dùng cho chuỗi có thẻ `<code>`).
- JS: `t('key', { param: value })`.
- Backend: trả `note_key` / `error_key` + tham số, **không** trả câu hoàn chỉnh. Trường
  `note` / `error` vẫn giữ bản tiếng Anh cho ai gọi API bằng curl.

Thiếu khoá thì `t()` trả về chính tên khoá - cố ý, để lộ ngay trên màn hình lúc test thay vì
im lặng hiện tiếng Anh.

Tham số `age` từ backend là **giây**; `fmtArgs()` đổi sang chuỗi thời lượng theo ngôn ngữ đang
chọn trước khi ghép câu. Đừng format sẵn ở backend, làm thế là khoá cứng ngôn ngữ.

Đổi ngôn ngữ gọi `onLangChange()` => vẽ lại vùng động từ `S.snap` đang có, không gọi lại
server. Vì vậy dữ liệu backend phải luôn ở dạng mã, nếu không đổi cờ xong nửa màn hình vẫn
ngôn ngữ cũ cho tới lần refresh sau.

Nhãn loại tiến trình: `KIND_LABELS` ở `procs.py` để tiếng Anh, UI dịch qua `kindLabel()` theo
`kind`. Tên sản phẩm (Claude Code, MCP server, Codex...) giữ nguyên ở cả hai ngôn ngữ, chỉ
dịch mấy nhãn chung như Other/Browser/Editor.

Cẩn thận đặt biến tên `t` trong `app.js` - nó che mất hàm dịch. `frag()` từng dính, nay đổi
thành `tpl`; `renderUsage`/`renderKpis` dùng `tot` cho `snap.totals`.

## Giao diện sáng / tối (static/style.css)

Nền tối là mặc định, nền sáng bật bằng `data-theme="light"` trên `<html>`. `app.js` chọn theo
thứ tự: `?theme=` do vỏ nhúng truyền => lựa chọn đã lưu ở localStorage => `prefers-color-scheme`.

**Mọi màu phải đi qua biến trong hai khối `:root`.** Viết thẳng mã màu vào rule là chỗ đó sẽ
sai ở một trong hai nền - đó đúng là lý do trước kia không làm được nền sáng: 35 mã màu nằm
rải rác trong file. Thêm biến thì phải thêm ở CẢ HAI bảng, thiếu một bên là màu rơi về giá trị
kế thừa và hỏng lặng lẽ.

Có `?theme=` thì nút đổi sáng/tối tự ẩn: dashboard phải bám theo theme của editor, để hai
nguồn quyết định không đá nhau.

## Frontend (static/app.js)

Không bao giờ gán `innerHTML` cho vùng đang xem. Mỗi lần làm mới, HTML mới được so với DOM
hiện tại (hàm `morph`) và chỉ phần thay đổi được sửa - nhờ vậy không nháy, không mất vị trí
cuộn, không mất trạng thái mở/đóng cây.

Xác nhận thao tác dùng hộp thoại trong trang, **không dùng `confirm()`** - Chrome chặn dialog
gốc sau vài lần và làm nút kill trông như hỏng.

**Đừng bao giờ dùng `data-*` làm cờ "đã gắn listener rồi".** `patch()` xoá mọi thuộc tính
không có trong HTML mới, mà HTML mới thì không bao giờ mang cái cờ đó - nên cứ mỗi lần vẽ lại
cờ bay mất trong khi phần tử vẫn là ĐÚNG phần tử cũ (morph giữ nó lại theo `data-key`).
Listener cộng dồn theo nhịp làm mới, và `disabled = true` trong handler không cứu được vì mọi
listener của cùng một sự kiện vẫn chạy hết. Đã trả giá đúng chỗ này: nút Gửi của ô giao việc
cũ gắn thêm một listener mỗi giây, mở bảng 3 phút rồi bấm là mở ~180 cửa sổ Terminal, treo
máy. Listener của vùng động phải **uỷ quyền trên `document`, đăng ký một lần** - như nút đóng
và dãy đổi nhân vật ở cuối `office.js`. Cần nhớ trạng thái thì để trong đối tượng state của
JS, đừng để trên DOM.

## Khung nhìn Văn phòng (office.py + static/office.js + static/sprites.js)

Mỗi agent đang chạy là một nhân vật pixel trong một căn phòng: có việc thì ngồi vào bàn và
diễn đúng việc đang làm, rảnh quá `WANDER_AFTER` (90 giây) thì đứng dậy đi vòng vòng, tắt thì
đi ra cửa. Bấm vào máy tính của ai thì mở ra cây tiến trình và chi tiết phiên của người đó.

**Endpoint riêng `/api/pulse`, nhịp 1 giây**, không nhét vào `/api/snapshot`. Dashboard 3 giây
là vừa, còn hoạt cảnh chậm hơn thế thì agent gõ xong từ lâu nhân vật mới nhúc nhích; ngược
lại kéo cả bảng tiến trình + cổng + Docker + hạn mức mỗi giây chỉ để vẽ hoạt hình là phí.

Phần đắt duy nhất dùng chung là danh sách tiến trình, và `procs.cached()` lo việc đó: vòng nào
gặp cache còn hạn thì dùng lại. Bỏ nó đi là mỗi giây có hai lần `ps` toàn máy, và `_prev_cpu`
bị ghi đè hai lần nên %CPU của dashboard vỡ theo.

**Poll thì bỏ lọt tool ngắn.** Một `Read` chạy 0.4 giây sinh ra rồi biến mất gọn trong khoảng
giữa hai lần đọc, không bao giờ lọt vào `pending` - nhìn vào chỉ thấy nhân vật ngồi im trong
khi agent thật đang làm liên tục. Vì vậy `claude.py` gắn thêm `tool` vào từng sự kiện và
`events_since()` trả về mọi sự kiện sau một mốc; trang web xếp hàng rồi diễn lại từng nhịp
`BURST_SEC`. Đây là lý do `_add_event` có tham số `tool` - đừng gỡ.

Năm chỗ đã trả giá:

1. **Canvas phải nằm ngoài tầm với của `morph()`.** app.js so DOM mỗi lần làm mới và thay
   phần khác nhau. Để canvas vào vùng do `render()` quản lý thì cứ 3 giây nó bị thay bằng
   canvas mới: mất context, nhân vật nhảy về vị trí đầu. Trong `index.html` canvas đứng
   riêng, chỉ `#office-detail` là vùng động.
2. **Trạng thái "đang ở đâu" phải theo ĐÍCH vừa tới, không theo việc có sở hữu bàn hay không.**
   Người rời bàn đi vòng vòng vẫn giữ chỗ, nên `e.desk` khác null không có nghĩa là đang ngồi
   ở bàn. Bản đầu lấy `e.desk` làm căn cứ nên đi vòng vòng xong là chuyển sang tư thế ngồi
   ngay giữa lối đi, rồi kẹt luôn ở đó vì nhánh "quay về bàn" chỉ chạy khi chưa ngồi. Đó là
   lý do có `e.goal`.
3. **Chữ là toạ độ màn hình, phòng là toạ độ pixel gốc.** Hai hệ này co giãn khác nhau: ở bậc
   phóng 1 (panel hẹp của VSCode) một cái tên rộng gấp đôi cái bàn. `drawBubbles()` vì thế
   thoát sớm khi `scale < 2` - màu màn hình đã đủ nói ai đang làm gì.
4. **Số bàn trong `office.js` phải khớp `MAX_AGENTS` trong `office.py`** (2 dãy x 5 = 10).
   Lệch thì có agent không bao giờ được chia bàn, đứng mãi ngoài cửa.
5. **Nền màn hình máy tính là thứ nói "bàn này có người" - không phải cái nhân vật.** Nhân vật
   ngồi quay lưng nên chỉ nhô lên khỏi mặt bàn một mẩu nhỏ, lẫn vào màu gỗ. Bản đầu bàn có
   người mà đang rảnh chỉ vẽ thêm đúng một chấm 4x1 pixel lên nền tối, nên nhìn lướt qua cả
   phòng trông như không có ai - đúng phản hồi nhận được từ người dùng. Giờ có
   `--of-screen-on`: 10 cái màn hình rải khắp phòng, cái nào sáng là cái đó có chủ đang ngồi.

   Điều kiện là `ent.mode === 'sit'` chứ **không phải** `ent` khác null - cùng cái bẫy số 2:
   người đi vòng vòng vẫn giữ bàn, lấy `ent` làm căn cứ thì có cảnh bàn sáng đèn trong khi chủ
   nhân đang đứng giữa phòng.

**Không có file ảnh nào.** Nhân vật vẽ bằng code trong `sprites.js`, bake một lần vào canvas
ngoài màn hình lúc khởi động. Chủ ý chứ không phải tiết kiệm: thêm một file .png là thêm nó
vào cả ba đường đóng gói lẫn bước soát danh sách file trong CI, quên một chỗ thì nhân vật
biến mất mà tool vẫn chạy - đúng kiểu hỏng lặng lẽ `pricing.json` đã dính. Sprite pack có sẵn
ngoài kia gần như luôn kèm giấy phép riêng cho phần asset, khác giấy phép phần code.

### Bộ nhân vật (sprites.js)

**Tám bộ**: Hải trình và Nhẫn giả mỗi bộ 36 nhân vật, Văn phòng (người), Thú cưng, Slime,
Mascot, Danh thủ mỗi bộ 10, Năm anh em 5. Bộ ĐẦU TIÊN trong `BUILTIN_PACKS` là mặc định - `initPack()` rơi về
`PACKS[0].id` chứ không viết cứng tên, nên đổi thứ tự là đổi luôn mặc định. Chọn một bộ thì CẢ PHÒNG theo bộ đó, và mỗi agent nhận một nhân vật KHÁC nhau trong
bộ; hết nhân vật thì quay vòng dùng lại. Bấm vào một người trong phòng rồi chọn ở dãy dưới
bảng chi tiết thì đổi riêng người đó.

`PACKS` khai bộ, `ALL_CHARS` là bảng phẳng mọi nhân vật của mọi bộ theo đúng thứ tự hàng trong
atlas - `office.js` chỉ giữ một số nguyên `charIndex` trỏ vào đây, không cần biết bộ nào.

**Không dùng file ảnh tải về.** Ảnh tham khảo để ở `assets/characters/` và đã bị `.gitignore`
chặn: repo này public, mà trong đó có fan art của IP có chủ (Naruto, One Piece, Shaun the
Sheep, Mario) và bản xem trước của pack có giấy phép riêng. "Tải trên trang free download"
không cấp quyền cho nhân vật gốc - trang chỉ cấp được quyền cho phần người upload tự vẽ.

Bộ **Năm anh em** dựng từ một tấm ảnh chụp chung của người dùng, và đó là bộ duy nhất mô tả
người thật - nhưng vẫn **không có file ảnh nào đi vào repo**, vẫn vẽ bằng code như sáu bộ kia.
Ở 16x20 pixel thì chép khuôn mặt là vô nghĩa (8 pixel ngang cho cả khuôn mặt, hai con mắt đã
chiếm 4), nên mỗi người được khoá bằng ĐÚNG BA dấu hiệu tách bạch: tóc, thân, chân. Ba chứ
không phải một, vì mỗi tư thế giấu đi một thứ khác nhau - ngồi thì mất giày và mất luôn ngực
(quay lưng), đi ngang thì mất kính. Bảng chi tiết nằm ở đầu `CREW_CHARS`.

Hai cái bẫy riêng của bộ này, cùng một gốc là **cả năm người đều tóc đen còn mắt cũng vẽ bằng
mực đen**:

- Mặt trước của tóc phải dừng ở hàng 3, **chừa hàng 4 làm trán**. Để mái tóc chạm thẳng vào
  hàng mắt thì hai thứ dính làm một, khuôn mặt mất hẳn đôi mắt, chỉ còn một vệt đen với hai
  chấm sáng. Hàng trán đó cũng đúng là chỗ đặt thanh ngang của gọng kính.
- Gọng kính đen phải là kiểu **browline** (một thanh ngang trên, gọng chỉ khép ở mép ngoài và
  đáy) kèm một chấm loá trong tròng. Bản đầu vẽ khung vuông KÍN bốn cạnh cho hai mắt: cộng
  với tóc đen phía trên, cả cái đầu thành một khối đen đặc, không còn mặt mũi gì.

### Bộ Danh thủ - nhận ra người bằng thứ khán giả thật dùng

Mười cầu thủ, cùng bài toán của bộ Năm anh em nhưng lời giải khác: khán giả trên sân không
nhận ra cầu thủ bằng khuôn mặt, họ nhận bằng **màu áo + kiểu tóc + số áo**. Ba dấu hiệu đó
phải khác nhau giữa mọi người, bảng đối chiếu nằm ở đầu `FOOTBALL_CHARS`. Hai người tóc ngắn
thường thì màu tóc phải cách nhau hẳn (nâu sẫm với đỏ), hai bộ đồ trắng thì khác cả màu viền,
màu quần lẫn số.

Số áo vẽ bằng font 3x5 khai trong file, **không dùng `fillText`**: font hệ thống mỗi máy một
khác, và ở cỡ này chữ do font sinh ra bị khử răng cưa thành vệt xám. Ô font luôn là bội của
1/3 pixel gốc (một chữ số dùng ô 1 pixel, hai chữ số nén còn 2/3) - lấy cỡ lẻ thì nét chữ chỗ
dày 2 chỗ dày 3 pixel lưới con, con số nhìn như bị mọt ăn. Số chỉ vẽ ở **lưng**: đó vừa là
chỗ số thật nằm, vừa là mặt người xem nhìn nhiều nhất vì ngồi ở bàn là quay lưng ra. Nhớ cộng
`dy` vào toạ độ số, không thì tư thế gục xuống hạ thân 2 pixel mà số đứng nguyên chỗ cũ.

Chân phải đủ **bốn mảng chồng lên nhau trong 4 pixel dọc**: quần đùi, một quãng da trần, tất
cao, rồi giày. Đó là silhouette nói "cầu thủ" từ xa, và là lý do bộ này không dùng lại
`legs()` của bộ Văn phòng.

Ba cái bẫy đã dính:

- **Râu phải là một mảng bo tròn rồi KHOÉT chỗ miệng ra**, không phải ghép quai hàm, ria mép
  và cằm thành bốn thanh thẳng: bốn thanh khép kín thành cái khung chữ nhật đen quanh miệng,
  nhìn như đeo rọ mõm. Cùng đúng cái bẫy gọng kính kín ở bộ Năm anh em. Mảng râu cũng phải
  cách mai tóc một quãng da, nếu không râu nối liền tóc thành hai thanh dọc chạy suốt mặt.
- **Đừng vẽ vệt sáng lên đỉnh đầu.** Tóc gần đen mà nâng sáng đủ để thấy thì ra màu ghi, lại
  nằm đúng chỗ hậu kỳ `RIM_LIGHT` nâng sáng thêm lần nữa - thành một thanh xám trắng vắt
  ngang đầu, nhìn hệt cái băng đô. Đỉnh khối đã tự sáng sẵn.
- **Cánh tay ở tư thế nhìn ngang phải có vạch tối dọc mép.** Tay đè lên thân nên cùng nằm
  trong silhouette, hậu kỳ không viền cho nó được; thiếu vạch thì khúc cẳng tay màu da giữa
  cái áo trông như một lỗ thủng.

Kit chỉ có **màu áo, không có huy hiệu hay logo CLB nào** - huy hiệu là nhãn hiệu có chủ,
cùng lý do đã ghi cho phần asset, mà ở 3 pixel nó cũng chỉ là một vệt bẩn trên ngực áo.

### Lưới con `SPRITE_SS` - chỗ nét vẽ đến từ

Toạ độ trong `sprites.js` vẫn là pixel gốc 16x20 (office.js đo phòng theo đơn vị đó), nhưng
atlas được vẽ ở độ phân giải **gấp `SPRITE_SS` = 3 lần**. Mọi nét đi qua `px()`, và chỉ mình
`px()` biết tới hệ số này - nên toạ độ lẻ 1/3 pixel là hợp lệ ở mọi chỗ khác trong file.

Đó là thứ đổi hẳn chất lượng hình: đỉnh đầu bo theo cung tròn thật (`roundBox`) thay vì vát
một pixel, tai và chỏm tóc thu nhọn dần (`spike`) thay vì là cái cột vuông, con mắt có đủ
tròng - con ngươi - chấm loá - phản chiếu đáy (`eye`) thay vì một ô 2x2 đặc, và viền chỉ dày
1/3 pixel gốc.

Ba hệ quả bắt buộc nhớ:

- `px()` phải bo **hai MÉP** (`round(x*SS)` và `round((x+w)*SS)`), không phải bo gốc rồi nhân
  bề rộng. Bo kiểu sau thì ở toạ độ lẻ hai mảng liền nhau hở ra một khe, trên nền tối hiện
  thành đường kẻ sáng chạy dọc thân người.
- Không nét nào được vượt quá **1 pixel gốc** ra ngoài khung 16x20 - đó đúng bằng phần đệm
  của ô. Vẽ chỏm tóc ở `y = -1.1` là 0.3 pixel của nó rơi sang ô hàng trên, và ô đó đã vẽ
  xong rồi.
- Atlas nặng gấp 9 lần (khoảng 1400x4100, dựng mất ~165ms). Vì thế hàng được xếp thành
  **nhiều cột khối**, mỗi cột cao dưới 4096: hơn trăm nhân vật xếp thành một dải dọc duy nhất
  là canvas vượt ngưỡng texture 8192 của kha khá GPU, vượt qua thì trình duyệt lặng lẽ bỏ
  tăng tốc phần cứng và cả khung nhìn giật.

### Hậu kỳ: khối và viền, một lượt quét

`finishCell()` làm hai việc trên bản đồ alpha của ô, và cả hai đều chạy cho MỌI bộ mà không
phải khai thêm màu cho ai - sáng và tối đều suy ra từ chính màu đang có (`lighten`/`darken`):

1. **Đổ bóng theo mép**: mép trên-trái được nâng sáng, mép dưới-phải bị hạ tối, cộng một
   chênh sáng rất nhẹ theo đường chéo. Đây là thứ biến mảng màu phẳng thành khối có chiều.
   Phần KHỐI bên trong thân (vệt sáng dọc mép áo, mảng tối ở gấu) thì hậu kỳ không biết được,
   nên có `clothShade()` gọi tay trong từng hàm thân.
2. **Viền**: dày đúng **một pixel của lưới con**, và màu lấy từ chính màu nó đang chạm vào
   rồi hạ tối - không phải một màu tím than dùng chung. Viền đồng màu làm cái áo đỏ và mái
   tóc vàng cùng đóng khung một màu, nhìn như hình dán; viền theo màu thì tóc có viền tóc,
   áo có viền áo.

Làm bằng **một** lần `getImageData` cho cả atlas rồi quét từng ô. Gọi `getImageData` 1500 lần
(mỗi ô một lần) chậm hơn hẳn mà kết quả y hệt.

Ô trong atlas vì thế **rộng hơn nhân vật 1 pixel gốc mỗi bên**. `drawEntity` phải vẽ lệch
`-1`, nếu không viền của hàng xóm dính sang và thân bị lệch nửa pixel.

### Phóng to: khi nào nội suy

Đồ đạc trong phòng vẫn vẽ ở pixel gốc và vẫn tắt nội suy. Riêng nhân vật thì `resize()` chốt
`OF.spriteSmooth`: một pixel atlas ra đúng `scale * dpr / SPRITE_SS` pixel màn hình, **chia
hết thì tắt nội suy** (phóng nguyên lần, nét đanh), **không chia hết thì bật**. Lấy mẫu gần
nhất ở tỷ lệ lẻ sẽ bỏ rơi hàng thì hàng không, và những nét mảnh 1/3 pixel - viền, chấm loá
trong mắt - biến mất chỗ có chỗ không, nhìn như hình bị rách. Sub-agent luôn bật vì nó bị thu
0.8 lần, tỷ lệ lẻ ở mọi bậc phóng.

Cũng vì vậy ô xem trước trong bảng chọn **không** để `image-rendering: pixelated` nữa:
`renderCharPreview()` vẽ ở độ phân giải màn hình thật rồi thu lại bằng CSS, ép lấy mẫu gần
nhất là vứt đúng phần chi tiết vừa vẽ ra. Ô xem trước KIỂU PHÒNG thì ngược lại - nó vẽ ở
pixel gốc nên vẫn giữ `pixelated`.

**Tỷ lệ chibi là thứ tạo ra cảm giác dễ thương, không phải thêm chi tiết** - 16x20 pixel không
đủ chỗ cho chi tiết. Đầu chiếm 9/20 chiều cao, mắt 2x2 có chấm sáng trắng, má hồng. Bản đầu vẽ
theo tỷ lệ người thật, mặt chỉ còn hai chấm 1x1 và phản hồi nhận được là "xấu, không cute".

Bố cục dọc phải giữ nguyên khi thêm nhân vật: `y 0..9` đầu, `y 10..15` thân, `y 16..19` chân.
Lệch một hàng giữa đầu và thân là hở một vệt sàn ngang cổ - ở bậc phóng 5 nhìn như cái đầu rời
khỏi thân, và đó là lỗi đã dính khi dựng tư thế ngồi.

Người ngồi **không vẽ chân** (chân khuất sau ghế) nên `drawEntity` cũng không vẽ bóng cho họ:
bóng nằm ở đáy sprite, mà đáy sprite lúc đó là khoảng trống, thành ra một vệt lơ lửng.

Bóng của người đứng là hình **bầu dục**, và là nét duy nhất trong phòng dùng đường cong -
canvas khử răng cưa cho path bất kể `imageSmoothing`, nên nó mượt ở mọi bậc phóng. Một thanh
chữ nhật dưới chân trông như tấm ván nhân vật đang đứng lên. Đừng nhân thêm `globalAlpha`:
`OF.pal.shadow` đã là màu có alpha (.16), nhân lần nữa là bóng mờ tới mức không còn thấy.

Hai cái bẫy khi vẽ bộ mới:

- **Hình khối phải thót dần về đỉnh.** Slime bản đầu vẽ bằng một hình chữ nhật bo góc nên cả
  bộ trông như mấy cái TV cũ. `slimeDome()` giờ thu hẹp 3 hàng trên cùng.
- **Phụ kiện phải BÁM vào thân.** Sừng hươu và râu ong bản đầu vẽ ở `x=3` và `x=13`, ngoài
  silhouette (thân chỉ rộng `x=4..11`), nên chúng bay lơ lửng giữa không khí.

Danh sách bộ nằm ở **ba chỗ** và phải khớp: `PACKS` trong `sprites.js` (nơi vẽ), `OFFICE_PACKS`
trong `config_file.py` (chặn giá trị rác), `enum` của `aimon.officePack` trong `package.json`
(dựng dropdown). Mỗi bộ còn phải có nhãn ở CẢ hai ngôn ngữ, nếu không bảng chọn hiện ra chữ
`office.pack_pets`. CI kiểm cả bốn điều kiện này.

Chỗ ngồi (`OF.slots`) giữ nguyên khi đổi bộ, nên đổi bộ xong ai vẫn ở đúng vị trí cũ, chỉ đổi
hình. Nhưng lựa chọn ép riêng thì bị xoá: chúng thuộc về bộ cũ, giữ lại thì đổi bộ xong vẫn
còn vài người mang hình bộ trước, nhìn như lỗi. Phải dọn `OF.slots` của ai rời phòng, nếu
không `slotFor()` thấy chỗ nào cũng bận và người mới vào toàn phải quay vòng.

### Kiểu phòng và ghế

Bốn kiểu: Cổ điển, Thư viện, Gác xép, Sân vườn. Mỗi kiểu CHỈ đổi sàn, tường và đồ trang trí -
hình học của phòng (vị trí bàn, ghế, lối đi, lối dọc, cửa) nằm ở hằng số đầu file và không
kiểu nào được đụng vào. Nhờ vậy đổi kiểu phòng thì **không có gì lệch được**, và ô xem trước
gọi thẳng `ROOMS[].draw` nên cũng không bao giờ lệch khỏi phòng thật.

Màu lấy từ đúng bảng màu chung, chỉ dùng lại theo vai trò khác (tường gạch mượn màu bàn). Nhờ
vậy không phải thêm biến CSS cho từng kiểu, và kiểu nào cũng tự đúng ở cả hai theme.

Con mèo bị nhốt trong dải sát mép dưới phòng (`CAT_LANE`) vì nó được vẽ SAU tất cả mọi người
nên luôn nằm trên cùng. Dải cũ trùng đúng lối đi của người, và nó đi ngang qua che mất mặt ai
đang đi bộ - nhìn như con mèo lơ lửng trước mặt người ta. Ở dải này nó chỉ còn cắt qua bàn
chân, đúng chỗ một con mèo nên ở.

**Ghế vẽ làm HAI phần ở hai thời điểm khác nhau.** `drawChairBase` (cột + đế) vẽ trong
`drawDesk`, tức trước nhân vật; `drawChairBack` (tựa lưng + tay vịn) vẽ SAU nhân vật của dãy
đó, nên tựa lưng che phần hông và người trông như lọt vào lòng ghế.

Bản đầu vẽ cả cái ghế trước nhân vật bằng một hình chữ nhật 20x9 đặc: tựa lưng nằm dưới thân
người rồi thò ra thành một tấm ván to phía sau, nhìn hệt như người đang **úp mặt vào ghế**
chứ không phải ngồi lên nó. Tựa lưng chỉ đè ba hàng cuối của thân chứ không kín lưng như ghế
văn phòng thật - cả app xoay quanh việc nhận ra ai là ai qua màu áo, che hết áo thì mọi bộ
nhân vật thành một màu ghế.

**Vào và ra khỏi chỗ ngồi đều phải đi VÒNG QUA KHE cạnh bàn** (`deskSideX`). Chỗ ngồi nằm
phía trên ghế, nên đi thẳng từ lối đi lên là chui xuyên qua ghế từ dưới - nhìn như người mọc
ra từ gầm ghế. `routeTo(e, x, y, seat)` chèn thêm hai chặng: lên trong khe giữa hai bàn, rồi
bước ngang vào ghế; lúc rời bàn thì chèn cú bước ngang ra khe trước khi đi xuống. Đừng đổi
`e.mode` khỏi `'sit'` TRƯỚC khi gọi `routeTo` - chính cờ đó bật nhánh bước ngang.

### Bấm và rê chuột trong phòng

`deskAt()` bắt theo cụm bàn, `entAt()` bắt theo THÂN nhân vật ở vị trí hiện tại. Phải có cả
hai: người đi vòng vòng vẫn giữ bàn, nên nếu chỉ có `deskAt` thì rê chuột vào chính họ giữa
phòng không ăn gì.

**Bấm xong phải cuộn tới.** Không cuộn thì bảng chi tiết mở tận dưới màn hình, người dùng bấm
xong không thấy gì đổi và tưởng nút hỏng - đúng phản hồi nhận được. Đang làm việc thì cuộn tới
cây tiến trình, đang rảnh thì cuộn tới dãy đổi nhân vật.

**Đáp lại chuột thế nào là tuỳ họ ĐANG LÀM GÌ**, và `setHover()` là chỗ duy nhất quyết định:

| Đang | Rê chuột vào | Bỏ chuột ra |
| --- | --- | --- |
| Ngồi làm việc | ngoái lại nhìn `GLANCE_SEC` (1 giây) rồi làm tiếp, **không rời ghế** | không đổi gì |
| Rảnh, đi vòng vòng | `e.greet = true`, dừng lại quay mặt ra chờ | đi tiếp |
| Đang rời phòng | không đáp lại gì | - |

**Người đang ngồi thì tuyệt đối không đụng vào `path` / `goal` / `mode`.** Bản trước xoá cả ba
cho mọi người, nên rê chuột vào một người đang gõ phím là `goal` mất, vòng sau `step()` thấy
"có việc mà chưa về bàn" nên cho họ đứng dậy đi vòng qua hông bàn rồi ngồi lại - nhìn như
nhân vật giật mình nhảy khỏi ghế. Cú ngoái lại chỉ là `e.glance` đếm ngược, `frameFor()` đọc
nó rồi trả khung `kf`; nó tự hết, không cần gỡ lúc bỏ chuột ra.

Khung `kf` (ngồi quay mặt ra) phải có ở CẢ TÁM bộ - `sit(..., 'turn')` giữ nguyên cái thân
ngồi, chỉ đổi đầu sang mặt trước và hoạ tiết lưng sang hoạ tiết ngực. Riêng bộ Năm anh em thì
đây là lúc DUY NHẤT thấy được gọng kính của người đang ngồi, mà ba trong năm người chỉ khác
nhau ở chỗ đó.

**Gỡ `greet` phải đi qua `setHover()`, và luôn kèm gỡ `e.goal`.** Ba lỗi đã dính:

1. `mouseleave` chỉ xoá `OF.hover` mà không gỡ `greet` của người đang được chào - họ đứng
   chôn chân giữa phòng vĩnh viễn, bỏ chuột ra rồi vẫn không đi tiếp.
2. Lúc bắt đầu chào ta xoá `e.path` cho họ dừng ngay giữa đường. Nếu vẫn để `goal = 'desk'`
   thì nhánh "có việc thì về bàn" trong `step()` không bao giờ chạy lại - nó chỉ chạy khi
   `goal !== 'desk'` - và người đó kẹt luôn kể cả khi đã thôi chào.
3. Cú xoá `path` + `goal` ấy giáng vào người đang **rời phòng** thì sinh nhân vật ma - xem
   mục dưới.

Bấm chọn một người cũng gỡ `greet`, nhưng **chỉ khi họ đang thật sự chào** (`if (e.greet)`):
bảng chi tiết đã mở rồi, giữ họ đứng chờ nữa thì cả phòng đứng hình trong khi người dùng đang
đọc bảng bên dưới. Xoá `goal` của người đang ngồi làm việc là họ nhảy khỏi ghế, của người đang
ra cửa là họ kẹt lại.

### Nhân vật ma - phiên đã tắt mà người vẫn ngồi đó

Đã gặp thật: header ghi *"1 in the room"* trong khi có 5 nhân vật trên màn hình, 3 người còn
ngồi nguyên ở bàn kèm tên phiên. Dòng đếm bỏ qua ai đang `leaving`, nên con số ấy chính là
bằng chứng: 4 người kia bị kẹt ở trạng thái `leaving`, không bao giờ đi hết ra cửa.

Gốc rễ là `setHover()` xoá `path` và `goal` của người đang được rê chuột. Dính cú đó lúc đang
rời phòng thì mọi nhánh còn lại của `step()` đều không nhận họ (chúng chỉ dành cho người còn
đang làm việc), nên:

- kẹt giữa đường ra cửa => đứng chôn chân giữa phòng, `mode = 'idle'`, `goal = null`;
- kẹt lúc đang đi về ghế để ăn mừng => nhánh "có việc thì về bàn" tóm được, họ ngồi lại vào
  bàn và ở đó vĩnh viễn - đúng ba nhân vật ma trong ảnh chụp.

Hai lớp chặn, giữ cả hai:

1. **`step()` xử người `leaving` TRƯỚC mọi nhánh khác**, kể cả trước `kind !== 'agent'`: hết
   đường mà vẫn còn trong phòng thì dựng lại đường ra cửa. Người rời phòng chỉ có đúng một
   việc. Thứ tự trong nhánh này phải y hệt nhánh ăn mừng - `routeTo` chạy lúc `mode` còn là
   `'sit'` và `desk` còn đó, nếu không mất cú bước ngang khỏi ghế.
2. **Lưới an toàn `LEAVE_TIMEOUT` (20 giây)**: `leaving` lâu hơn ngần đó thì xoá thẳng, không
   cần biết vì sao kẹt. Đường ra dài nhất là ăn mừng 2 giây cộng đi hết chiều ngang phòng
   (260 / 26 ≈ 10 giây) nên nó không bao giờ cắt ngang một màn ra cửa tử tế. Đừng gỡ lớp này
   đi kể cả khi lớp 1 đã đủ: một nhân vật ma làm người dùng mất tin vào cả cái panel, còn
   xoá nhầm sớm vài giây thì không ai nhận ra.

`syncAgents` lúc đánh dấu `leaving` cũng phải gỡ `greet` và `glance`: phiên đã đóng thì không
còn gì để đáp lại người rê chuột, mà hai cờ đó lại chặn đúng nhánh cho họ đi ra.

### Ăn mừng lúc xong việc

Phiên kết thúc thì nhân vật **ăn mừng 2 giây (`CHEER_SEC`) ngay trên ghế CỦA CHÍNH MÌNH** -
bắn confetti, nhún theo nhịp bằng cách đảo hai khung ngồi có sẵn - rồi mới đứng dậy đi ra.
Trước đó họ chỉ lặng lẽ biến mất ở cửa, không có gì đánh dấu "xong rồi".

Ba chỗ dễ sai, đã sửa đúng theo phản hồi:

- **Phải ở ghế của chính mình.** Xong việc lúc đang đi vòng vòng thì cho đi về bàn mình đã
  (`goal = 'cheer'`), tới nơi mới ăn mừng. Ăn mừng tại chỗ đang đứng thì nhân vật nhún nhảy
  giữa lối đi hoặc ngay trước ghế người khác, nhìn như nhảy nhầm bàn thiên hạ.
- **Ngồi thì giữ nguyên `mode = 'sit'`.** Cờ này vừa quyết định dùng khung nhún kiểu ngồi,
  vừa bật nhánh bước ngang khỏi ghế trong `routeTo` lúc đi ra. Đổi `mode` trước khi gọi
  `routeTo` là mất cú bước ngang, nhân vật lại chui thẳng xuống xuyên qua ghế.
- **Người đang ăn mừng vẫn phải GIỮ CHỖ.** `used` trong `syncAgents` tính cả người `leaving`
  còn `desk`, nếu không bàn đó bị coi là trống ngay và người mới vào ngồi đè lên người đang
  nhún nhảy - hai nhân vật chồng nhau trên một cái ghế. Chỗ được nhả khi ăn mừng xong.

Confetti là hạt 1x2 pixel trong `OF.confetti`, vẽ SAU tất cả mọi thứ nên bông bay trước mặt
chứ không nấp sau bàn. `vx` phải toả ngang mạnh hơn lực bắn lên, nếu không cả nắm bông bay
thẳng đứng chụm trên đỉnh đầu và trông như cặp sừng.

### Giao việc - đã gỡ, đừng làm lại

Từng có ô nhập prompt + `POST /api/spawn` mở một phiên Claude MỚI trong cửa sổ Terminal. Đã
gỡ sạch (endpoint, `office.spawn_session`, `find_claude`, khoá i18n, CSS). Người dùng muốn
prompt đi vào phiên ĐANG chạy và hiện ngay trong CLI / plugin của họ, chứ không muốn một cửa
sổ terminal lạ bật ra bên ngoài - mà cái họ muốn thì không làm được, còn cái làm được thì họ
không muốn. Kết quả khảo sát trên bản Claude Code 2.1.220:

| Phiên chạy ở đâu | Bơm prompt vào phiên đang chạy | Bằng cách nào |
| --- | --- | --- |
| Plugin Claude Code trong VSCode | **Không** | không có đường nào, xem dưới |
| Terminal.app (macOS) | Được | AppleScript, ghép `tty` của tab với `ps -o tty=` |
| iTerm2 | Được | `write text`, session cũng có thuộc tính `tty` |
| tmux / screen | Được | `tmux send-keys` |
| Terminal tích hợp VSCode | Chỉ từ extension AIMonitor | `terminal.sendText`, cùng cửa sổ |
| Windows | Không | không có API bơm input vào tab |

Ca **plugin VSCode** bịt cả ba đường, và đó là ca phổ biến nhất:

1. Tiến trình không có TTY (`ps` cho `??`), stdin là pipe thuộc extension host. `TIOCSTI` -
   ioctl duy nhất nhét được ký tự vào input tiến trình khác - macOS gỡ từ 10.15, Linux tắt
   mặc định.
2. Extension Claude Code **có** deep link `vscode://anthropic.claude-code/open?session=<id>&prompt=<text>`,
   nhưng `createPanel` trong `extension.js` chủ động chặn: panel của phiên đó đang mở thì nó
   chỉ `reveal()` rồi báo *"Session is already open. Your prompt was not applied - enter it
   manually."* Prompt chỉ áp được khi mở LẠI một phiên đã đóng - mà phiên đã đóng thì không
   có tiến trình, không có mặt trong phòng.
3. Binary claude có sẵn hạ tầng nhắn tin giữa các phiên (`messagingSocketPath` trong
   `~/.claude/sessions/<pid>.json`, client uds gửi `{type:"user", priority:"next"}`), nhưng
   phiên interactive **không công bố socket**: trường đó luôn rỗng ở 2.1.220. Chỉ background
   agent mới có. Không có lệnh CLI công khai nào gửi được (`claude --help` không có `send`).

Đã kiểm chứng thực tế đường Terminal.app: `do script "..." in tab N of window id X` bơm đúng
ký tự vào tiến trình foreground đang ở raw mode, tiếng Việt nguyên vẹn, kèm `\r` cuối. Nên
nếu sau này có làm lại thì làm theo đường TTY chứ **đừng quay lại kiểu mở cửa sổ terminal
mới** - đó là thứ người dùng đã bác.

Phát hiện phụ còn dùng được: `claude agents --json` trả PID + `sessionId` + tên của mọi phiên
đang sống, không cần TTY. Đó là nguồn chính xác hơn hẳn việc đoán tên phiên từ transcript.

### Nhập bộ nhân vật từ ảnh (packimport.js)

Nút `+` ở bảng chọn cho người dùng đưa một tấm ảnh nhiều nhân vật vào, tool tự tách thành một
bộ. **Ảnh không rời khỏi máy**: đọc bằng `FileReader`, xử lý bằng canvas, cất PNG đã thu nhỏ ở
`localStorage`. File này không có một lời gọi mạng nào, và bộ nhập vào không bao giờ đi vào gói
phát hành - đó mới là điểm mấu chốt, vì ảnh nhân vật tải trên mạng thường có giấy phép riêng
hoặc là fan art của IP có chủ. Người dùng tự đưa ảnh của mình vào máy mình thì không phát tán
gì; đóng sẵn chúng vào bản phát hành thì có.

Bốn bước, mỗi bước một cái bẫy đã trả giá:

1. **Tách nền bằng flood fill từ MÉP vào**, không lọc theo màu trên toàn ảnh. Lọc toàn ảnh thì
   nhân vật áo trắng trên nền trắng bị thủng một lỗ giữa người.
2. **Cắt theo VÙNG LIÊN THÔNG**, không chiếu xuống hàng/cột. Bảng liên hoàn thật gần như không
   bao giờ xếp thành lưới đều: ảnh thú trại có hàng 4 con so le, chiếu xuống cột thì không cột
   nào trống hẳn nên cả 4 con gộp thành MỘT ô.
3. **Gộp mẩu lẻ theo kích thước NHÂN VẬT, không theo kích thước ảnh.** Bản đầu nới 1.2% cạnh
   ngắn, với tấm 1200px thành 14 pixel, và hai con đứng cạnh nhau dính làm một - 12 con còn 4.
   `attachOrphans()` phân loại trước: khung cỡ trung vị trở lên là nhân vật thật và không bao
   giờ nhập vào nhau; chỉ mẩu tí hon mới đi tìm chủ.
4. **Lọc rác theo tỷ lệ ngang/dọc và diện tích tương đối**, đo thật rồi mới chọn ngưỡng:

   | Ảnh | Nhân vật thật | Rác |
   | --- | --- | --- |
   | Thú trại (12 con) | tỷ lệ 0.99-1.47, nhỏ nhất 41% trung vị | không có |
   | Mascot (20 con) | tỷ lệ 0.69-0.99 | dấu chìm tỷ lệ **3.72**, hai mẩu 8x7 và 6x6 |

   Lọc theo độ ĐẶC thì không ăn: chữ "ShowHex" đặc 0.91, đặc hơn quá nửa số nhân vật.

Thu nhỏ phải **bật làm mượt** (lấy trung bình vùng) rồi mới cắt ngưỡng alpha. Nearest-neighbour
từ 180px xuống 20px thì mỗi pixel đích chỉ lấy đúng một pixel nguồn, mất gần hết chi tiết.

Và thu về khuôn của **lưới con** (48x60), không phải 16x20 rồi phóng lên: ảnh người dùng đưa
vào thường 100-200 pixel mỗi nhân vật, ép xuống 16 pixel là vứt đi gần hết chi tiết mà không
có cách nào lấy lại, rồi bộ nhập vào thành mảng màu lấm tấm giữa một căn phòng đã sắc nét.
Bộ nhập từ bản cũ vẫn nằm ở `localStorage` dưới dạng ảnh 16x20, nên `loadCustomPacks()` lấy
đúng kích thước ảnh đọc được chứ không ép về một cỡ, còn `drawImportedFrame` luôn kéo về
khuôn lưới con - cùng một đường cho cả hai đời.

Ảnh người dùng gần như luôn chỉ có một tư thế đứng, không đủ 13 khung hình. `drawImportedFrame`
dựng chuyển động bằng cách xê dịch 1 pixel theo nhịp - đủ để nhìn ra đang đi hay đang gõ, mà
không đòi người dùng phải có sprite sheet đầy đủ. Bộ nhập vào **không tô viền** (`outline:
false`): ảnh gốc đã có viền sẵn, tô thêm là viền đôi dày cộp.

Đo trên 10 tấm thật: 6-81ms mỗi tấm. Ảnh nào nền sát màu thân nhân vật (bầy cừu kem trên nền
kem) thì flood fill ăn lẹm vào thân và tách thiếu - giới hạn đã biết của việc tách nền tự động,
nên có `note_single` báo cho người dùng thay vì lặng lẽ đưa ra một bộ hỏng.

## Hiệu năng - năm cơ chế đừng gỡ

Số đo đầy đủ và cách đo lại: **`docs/hieu-nang.md`**. Ở đây chỉ ghi những chỗ dễ vô tình phá.

**Đo CPU của server phải tính cả tiến trình con.** `ps` và `lsof` là tiến trình con nên
`ps -o time=` trên chính server không thấy chúng - đo kiểu đó ra 34 ms một lần build trong khi
số thật là 86 ms. Dùng `resource.getrusage(RUSAGE_CHILDREN)`.

1. **`/api/usage` cho thanh trạng thái.** Nó chỉ đọc `usage` + `totals.today.cost`, tức 2.3 KB
   trong 197 KB, mà mỗi cửa sổ VSCode lại hỏi 6 giây một lần. Endpoint này không dựng cây tiến
   trình, không gọi `lsof`, **không đẻ tiến trình con nào** - 3.5 ms so với 86 ms. Vẫn phải gọi
   `C.scan()` chứ đừng đọc thẳng `C.windows()`: `windows()` chỉ cộng lại thứ `scan()` đã nạp,
   bỏ bước đó là số đứng im mãi ở lần đọc đầu.

2. **Vỏ nhúng phải tự báo xuống là panel đang bị giấu** (`dashboardFramePage` +
   `onDidChangeVisibility`). `retainContextWhenHidden` là bắt buộc, nhưng VSCode giấu webview
   bằng `display:none` mà **Page Visibility API không tính chuyện đó**: đã đo, `document.hidden`
   vẫn false, `setInterval` vẫn đủ nhịp, `requestAnimationFrame` vẫn 60 fps. Nên
   `if (!document.hidden)` trong `app.js` KHÔNG bảo vệ được ca này - thu gọn panel xong server
   vẫn bị hỏi 197 KB mỗi 3 giây, mãi mãi. Tin đi hai chặng vì iframe khác origin.

3. **`frameSig()` - bỏ khung vẽ trùng.** Phòng đứng yên thì 60 fps xuống 5 fps. So bằng CHỮ KÝ
   suy từ thứ `draw()` đọc, **không** bằng cờ bẩn do từng hàm `step*` tự khai: cờ bẩn sót một
   nhánh là màn hình đứng hình mà không ai biết vì sao. Thêm trạng thái ảnh hưởng tới hình thì
   phải thêm vào chữ ký; thứ không nằm trong chữ ký (bảng màu, kiểu phòng, atlas mới, resize)
   thì gọi `invalidate()`.

4. **Atlas nướng lười theo bộ** (`buildSpriteAtlas(want)` + `ensureAtlas()`). 35.4 MB xuống
   7.0 MB, 193 ms xuống 60 ms. Hai chỗ phải giữ: nướng **cả bộ đang chọn** chứ không chỉ mấy
   người đang có mặt (agent vào ra liên tục, lấy đúng người đang có thì ai vào cũng nướng lại),
   và `CHAR_GEN` - bảng phẳng đổi khi nhập/xoá bộ thì chỉ số cũ trỏ sang nhân vật khác, không
   có nó thì xoá một bộ là cả phòng đổi mặt lung tung.

5. **`?ports=0` và `ports.cached()`.** `lsof` tốn 28 ms cộng một tiến trình con, mà bốn tab
   không dùng tới dữ liệu cổng. `cached()` trả nguyên cache thay vì bỏ hẳn ba khoá ra khỏi
   payload: thiếu khoá thì frontend phải kiểm `undefined` ở mọi chỗ đọc tới, sót một chỗ là tab
   Cổng vỡ. Bấm sang tab Cổng thì `loadSnapshot()` chạy lại ngay, không chờ hết nhịp.

Gzip bật theo `Accept-Encoding`, mức 3 cho JSON (gọi mỗi 3 giây) và mức 6 cho file tĩnh (chỉ
nạp khi webview dựng lại); dưới 1 KB thì không nén.

**Đừng cắt `seen_msgs` / `hourly` trong `claude.py`** để tiết kiệm RAM. Lợi ích là vài MB, còn
cắt `seen_msgs` là mở đường cho `--include-partial-messages` đếm trùng (token phồng gần gấp
đôi), cắt `hourly` thì `_history_row()` cộng `msgs` trên toàn bộ bucket nên phiên dài bị tụt số,
và `history_start()` mất mốc đầu của cả lịch sử.

## Guard khi kill

`snapshot.protected_pids()` chặn PID 0/1, chính AI Monitor và toàn bộ tiến trình cha của nó.
API trả lỗi rõ ràng thay vì im lặng. Giữ nguyên guard này khi thêm thao tác mới.

## Việc đã biết là còn nợ

- **DNS rebinding**: server không kiểm tra header `Host`. Một trang web trỏ tên miền về
  127.0.0.1 sẽ được browser coi là same-origin và gọi được `/api/action` (kill tiến trình).
  Fix: chặn request có `Host` không thuộc `localhost` / `127.0.0.1` / `[::1]`.
- `/api/action` và `/api/quit` không có xác thực. Chấp nhận được khi chỉ bind loopback, nhưng
  phải thêm token trước khi mở ra LAN (`--host 0.0.0.0`).
- **Nhiều cửa sổ VSCode dùng chung một server.** Cửa sổ mở panel trước sẽ spawn server, cửa sổ
  sau probe thấy còn sống thì dùng lại (và không giữ `proc` nên không giết nhầm). Nhưng cửa sổ
  đầu đóng panel là server chết, iframe cửa sổ sau trắng cho tới lần mở lại.

## Kiểm tra trước khi commit

```bash
python3 -m compileall -q aimon        # cú pháp
/usr/bin/python3 -c "import sys; sys.path.insert(0,'.'); import aimon.server"   # 3.9 compat
for f in aimon/static/*.js; do node --check "$f"; done   # cú pháp JS, TẤT CẢ file
./scripts/install_macos.sh            # tự kiểm tra app macOS đầu-cuối

cd vscode-extension && npm ci && npx tsc --noEmit && npm test && npm run package
```

`compileall` sinh `__pycache__` trong `aimon/`; `copy-aimon.js` lọc bỏ nên gói vẫn sạch, đừng
gỡ cái filter đó.
