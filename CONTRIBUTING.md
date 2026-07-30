# Contributing

[English](#english) · [Tiếng Việt](#tiếng-việt)

---

## English

Thanks for wanting to help. This is a small tool with strict constraints, so please read the
two sections below before writing code - most rejected changes fail on those, not on style.

### `main` is protected

You cannot push to `main`, and neither can the maintainer without review. Everything goes
through a Pull Request:

```bash
git checkout -b feat/short-description     # feat/ fix/ docs/ refactor/ chore/
# ... your changes ...
git push -u origin HEAD
```

Then open a PR against `main`. Only the maintainer merges. If you are not a collaborator, fork
the repo first and open the PR from your fork - the flow is otherwise identical.

Branch names: `feat/`, `fix/`, `docs/`, `refactor/`, `chore/`.

### Two hard rules

**1. Python standard library only, 3.9 minimum.** No dependencies, ever. The macOS app runs on
`/usr/bin/python3` (3.9.6) because that is the only interpreter guaranteed to exist when the
app is launched from Finder. Any 3.10+ syntax (`match`, runtime `X | Y`) breaks there.
`from __future__ import annotations` is already imported, so `int | None` in annotations is
fine.

**2. Every user-visible string must be translatable.** The dashboard ships in English and
Vietnamese. Never hardcode text in `app.js` or `index.html`:

- HTML: use `data-i18n="key"` (also `data-i18n-title`, `data-i18n-placeholder`, `data-i18n-html`)
- JS: use `t('key', { param: value })`
- Backend: return `note_key` / `error_key` plus arguments, not a finished sentence

Add the key to **both** `en` and `vi` in `aimon/static/i18n.js`. A missing key renders as the
raw key, which is intentional so it shows up immediately in testing.

### Before you push

```bash
python3 -m compileall -q aimon windows       # syntax
/usr/bin/python3 -c "import sys; sys.path.insert(0,'.'); import aimon.server"   # 3.9 compat
node --check aimon/static/app.js
node --check aimon/static/i18n.js
./scripts/install_macos.sh                   # end-to-end check of the macOS app
```

Check both languages in the browser before opening the PR. CI runs the macOS and Windows
builds on every push, including a smoke test that actually starts the packaged binary.

### Where things live

Technical documentation - architecture, the usage-limit maths, macOS packaging traps, the
release and signing pipeline - is in [CLAUDE.md](CLAUDE.md). Read it before touching
`usage.py` or the packaging scripts; several non-obvious decisions there are deliberate and
documented with the measurements that justify them.

### Reporting bugs

Open a [GitHub Issue](https://github.com/hominhtuong/AIMonitor/issues) with your OS, the
version from the page footer, and what you expected. Screenshots help.

Please do not paste transcripts or session titles that contain private information - AI
Monitor reads your local files, so its screenshots often contain project names and prompts.

---

## Tiếng Việt

Cảm ơn bạn muốn đóng góp. Đây là tool nhỏ nhưng ràng buộc chặt, nên đọc hai mục dưới trước khi
viết code - phần lớn thay đổi bị từ chối là vì hai chỗ đó chứ không phải vì style.

### Nhánh `main` được bảo vệ

Bạn không push thẳng lên `main` được, kể cả người bảo trì cũng phải qua review. Mọi thứ đi qua
Pull Request:

```bash
git checkout -b feat/mo-ta-ngan            # feat/ fix/ docs/ refactor/ chore/
# ... sửa code ...
git push -u origin HEAD
```

Rồi mở PR vào `main`. Chỉ người bảo trì mới merge. Nếu bạn không phải collaborator thì fork
repo về rồi mở PR từ bản fork - quy trình còn lại y hệt.

Tên nhánh: `feat/`, `fix/`, `docs/`, `refactor/`, `chore/`.

### Hai luật cứng

**1. Chỉ dùng thư viện chuẩn của Python, tối thiểu 3.9.** Không thêm dependency, không bao giờ.
App macOS chạy bằng `/usr/bin/python3` (3.9.6) vì đó là interpreter duy nhất chắc chắn có mặt
khi mở app từ Finder. Mọi cú pháp 3.10+ (`match`, `X | Y` lúc runtime) đều hỏng ở đó. File đã
`from __future__ import annotations` nên annotation kiểu `int | None` thì an toàn.

**2. Mọi chữ người dùng nhìn thấy đều phải dịch được.** Dashboard có tiếng Anh và tiếng Việt.
Đừng viết chữ thẳng vào `app.js` hay `index.html`:

- HTML: dùng `data-i18n="khoá"` (còn có `data-i18n-title`, `data-i18n-placeholder`, `data-i18n-html`)
- JS: dùng `t('khoá', { tham_so: gia_tri })`
- Backend: trả `note_key` / `error_key` kèm tham số, đừng trả câu hoàn chỉnh

Thêm khoá vào **cả hai** phần `en` và `vi` trong `aimon/static/i18n.js`. Thiếu khoá thì màn
hình hiện ra chính tên khoá - cố ý như vậy để lộ ngay lúc test.

### Chạy trước khi push

```bash
python3 -m compileall -q aimon windows       # cú pháp
/usr/bin/python3 -c "import sys; sys.path.insert(0,'.'); import aimon.server"   # tương thích 3.9
node --check aimon/static/app.js
node --check aimon/static/i18n.js
./scripts/install_macos.sh                   # tự kiểm tra app macOS đầu-cuối
```

Xem qua giao diện ở cả hai ngôn ngữ trước khi mở PR. CI tự dựng bản macOS và Windows mỗi lần
push, kèm smoke test chạy thật file đã đóng gói.

### Tài liệu nằm ở đâu

Đặc tả kỹ thuật - kiến trúc, cách tính hạn mức, các bẫy khi đóng gói macOS, quy trình phát
hành và ký - nằm ở [CLAUDE.md](CLAUDE.md). Đọc trước khi động vào `usage.py` hay các script
đóng gói; nhiều quyết định trông lạ ở đó là cố ý và đã ghi kèm số liệu đo được.

### Báo lỗi

Mở [GitHub Issue](https://github.com/hominhtuong/AIMonitor/issues), ghi rõ hệ điều hành,
version ở chân trang và bạn mong đợi điều gì. Có ảnh chụp thì càng tốt.

Đừng dán transcript hay tên phiên có thông tin riêng tư - AI Monitor đọc file trên máy bạn nên
ảnh chụp của nó thường dính tên project và nội dung prompt.
