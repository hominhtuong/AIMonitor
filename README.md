# AI Monitor

![logo](assets/icon_128.png)

Bảng theo dõi các công cụ AI đang chạy trên máy bạn: **Claude Code, Codex, Copilot, Gemini CLI, Ollama**.

Activity Monitor chỉ cho bạn thấy "Python đang ăn 2 GB RAM". AI Monitor cho bạn thấy *Python nào*:
phiên Claude Code nào, đang mở thư mục nào, đang chạy lệnh gì, đã tốn bao nhiêu token, còn bao lâu
nữa thì đụng hạn mức - và tắt được cái nào.

Chạy hoàn toàn trên máy bạn. Không gửi dữ liệu đi đâu, không cần đăng nhập, không cài thêm gì
ngoài Python (macOS và Linux có sẵn).

![Giao diện AI Monitor](assets/screenshot.png)

---

## Mục lục

1. [Mở lên trong 30 giây](#1-mở-lên-trong-30-giây)
2. [Cài app](#2-cài-app)
3. [Màn hình có gì](#3-màn-hình-có-gì)
4. [Tắt bớt tiến trình AI](#4-tắt-bớt-tiến-trình-ai)
5. [Hạn mức Session và Weekly](#5-hạn-mức-session-và-weekly)
6. [Số token và chi phí nghĩa là gì](#6-số-token-và-chi-phí-nghĩa-là-gì)
7. [Hỏi đáp nhanh](#7-hỏi-đáp-nhanh)

---

## 1. Mở lên trong 30 giây

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

Browser tự mở. Dừng bằng `Ctrl+C` ở cửa sổ terminal, hoặc bấm nút **Tắt** trên trang.

Không cần lo trùng cổng: mặc định dùng `8899`, bận thì tự nhảy sang cổng trống và in địa chỉ
thật ra màn hình. Nếu AI Monitor đã chạy sẵn thì nó mở lại đúng tab cũ chứ không bật thêm cái nữa.

---

## 2. Cài app

Trên macOS, AI Monitor là **app thật sự**: có cửa sổ riêng, icon dưới Dock, đóng bằng Cmd+Q.
Không mở tab browser, không cần terminal.

### Cách 1: tải bản dựng sẵn (không cần clone repo)

1. Vào tab **Releases** của repo, tải `AIMonitor-macos.zip`.
2. Giải nén, kéo `AIMonitor.app` vào thư mục **Applications**.
3. Mở lên dùng.

Hết. App đã được ký và Apple chứng thực (notarize) nên macOS không cảnh báo gì, không phải
chuột phải, không phải vào System Settings mở khoá.

Máy chỉ cần có Python 3.9 trở lên - macOS có sẵn.

### Cách 2: tự build từ code

```bash
./scripts/install_macos.sh
```

Cài vào `/Applications`, chạy thử ngay và báo lại kết quả. App không lên được thì script
báo lỗi chứ không im lặng. Sau mỗi lần `git pull`, chạy lại lệnh này để app dùng bản mới.

### Windows

Vào tab **Releases**, tải `AIMonitor.exe` về chạy thẳng. **Không cần cài Python.** Giao diện
cũng mở trong cửa sổ riêng, đóng cửa sổ là tắt hẳn.

Lần đầu chạy, Windows SmartScreen hiện cảnh báo vì file chưa mua chứng chỉ ký:
bấm **More info => Run anyway**.

Muốn chạy từ source thay vì tải .exe thì clone repo rồi tạo shortcut:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_windows.ps1
```

---

## 3. Màn hình có gì

**Đầu trang** - RAM toàn máy, RAM riêng phần AI đang chiếm, chu kỳ tự làm mới, nút Làm mới và Tắt.

**Hai ô hạn mức** - Session (5 giờ) và Weekly (7 ngày), xem [mục 5](#5-hạn-mức-session-và-weekly).

**Tab "AI & Agent"** - mỗi thẻ là một phiên AI đang chạy:

- tên tác vụ, thư mục làm việc, git branch, model đang dùng
- token và chi phí của phiên
- thanh context còn trống bao nhiêu
- việc đang chạy ngay lúc này, ví dụ `Bash(npm test) 3.2s`
- sub-agent đang chạy song song
- cây con bên dưới: MCP server, trình duyệt do automation mở, RAM từng nhánh
- dòng thời gian 60 thao tác gần nhất

Bên dưới là các phiên đã đóng, xem theo hôm nay hoặc 7 ngày.

**Tab "Lịch sử phiên"** - trả lời "tác vụ nào ngốn nhiều nhất". Gộp theo project và theo từng
phiên, có cột tỷ trọng, lọc và sắp xếp được. Tab này chỉ quét khi bạn mở nó.

**Tab "Tài nguyên"** - 80 tiến trình ngốn RAM nhất, lọc được theo tên hoặc chỉ xem phần liên
quan AI. Tiến trình trên 400 MB tô đỏ.

**Tab "Cổng & Docker"** - cổng nào đang bị chiếm (hay dùng khi Appium hoặc Playwright treo cổng)
và các container Docker đang chạy.

> Số liệu chỉ của **riêng máy này**. Nếu bạn dùng chung tài khoản trên nhiều máy, mỗi máy chỉ
> thấy phần của nó.

---

## 4. Tắt bớt tiến trình AI

Mỗi thẻ có nút để **tạm dừng** (đóng băng, giữ nguyên RAM, chạy tiếp được sau) hoặc **kill**
(tắt hẳn). Kill cây sẽ tắt luôn toàn bộ tiến trình con bên dưới.

Mọi thao tác đều hỏi xác nhận. Bản thân AI Monitor và các tiến trình cha của nó không bao giờ
bị tắt nhầm.

Tạm dừng không có trên Windows (hệ điều hành không hỗ trợ), nút sẽ tự ẩn.

Nếu thẻ có nhãn *"... quản lý"* thì tiến trình đó do IDE trông coi: tắt xong IDE sẽ tự bật lại.
Muốn dứt điểm thì tắt extension tương ứng trong IDE.

---

## 5. Hạn mức Session và Weekly

Hai ô đầu trang trả lời câu hỏi "còn dùng được bao lâu nữa". Số to luôn là **phần trăm**, kèm
một nhãn nhỏ cho biết số đó lấy từ đâu:

| Nhãn | Nghĩa là |
| --- | --- |
| *(không có nhãn)* | Số chính thức của Claude Code, còn mới. Tin được. |
| `số cũ` | Số chính thức nhưng đọc đã lâu. Cửa sổ chưa reset nên thực tế chỉ cao hơn, không thấp hơn. |
| `ước lượng` | AI Monitor tự suy ra từ lượng token đã dùng. Là số xấp xỉ. |
| `chưa có số` | Chưa đủ dữ liệu để đưa ra con số đáng tin. |

Dòng dưới luôn cho biết **còn bao lâu nữa tới mốc reset** và lượng token đã dùng trong cửa sổ
hiện tại.

Con số này lấy đúng từ chỗ Claude Code lưu lại phần trăm của chính nó, nên khớp với bảng
*Account & Usage* trong Claude Code. Khi Claude Code không chạy một thời gian dài thì số sẽ
đứng yên và nhãn chuyển thành `số cũ` - mở lại Claude Code là tự cập nhật.

AI Monitor chỉ đọc file trên máy, không bao giờ tự gọi API Anthropic bằng tài khoản của bạn.

---

## 6. Số token và chi phí nghĩa là gì

- **Token API** đếm cả phần cache đọc lại, nên con số rất lớn là bình thường với phiên dài
  (hàng chục triệu). Đây là lượng token đi qua API, không phải độ dài cuộc trò chuyện.
- **Chi phí** là quy đổi theo bảng giá API để bạn so sánh giữa các phiên. Nếu bạn dùng gói
  thuê tháng thì đây **không phải** số tiền bị trừ. Muốn đổi giá thì sửa `pricing.json`.
- "Hôm nay" tính từ 00:00 giờ máy.

---

## 7. Hỏi đáp nhanh

**Tắt Copilot rồi nó lại chạy?** Đó là VS Code tự bật lại, không phải lỗi tool. Muốn dứt điểm
thì disable extension.

**Số Session hoặc Weekly có nhãn `số cũ`?** Claude Code chưa chạy lại nên chưa làm mới phần
trăm. Mở Claude Code lên là số tự cập nhật, xem [mục 5](#5-hạn-mức-session-và-weekly).

**Không thấy phiên AI nào?** Với Claude Code, kiểm tra thư mục `~/.claude/projects/` đã có dữ
liệu chưa. Với Codex hay Copilot, tool chỉ theo dõi được RAM và CPU vì chúng không ghi lịch sử
theo dạng đọc được.

**Mở app trên macOS thì bị đòi cài Rosetta?** Đó là lỗi của bản cũ, đã sửa. Chạy lại
`./scripts/install_macos.sh` để cài đè bản mới.

**Cổng 8899 đang bận?** Không cần làm gì, tool tự chuyển cổng. Muốn ép đúng một cổng thì
`./run.sh --port 9001 --strict-port`.

**Trang có nhấp nháy khi tự làm mới?** Không. Mỗi lần làm mới chỉ sửa đúng con số thay đổi,
giữ nguyên vị trí cuộn và các nhánh đang mở.

---

## Góp code

Đặc tả kỹ thuật, các bẫy đã gặp và quy ước code nằm ở [CLAUDE.md](CLAUDE.md).

Repo có sẵn 2 skill dùng với Claude Code: `/push-code` (commit và push an toàn) và `/merge-code`
(merge qua nhánh tạm rồi mở Pull Request). Không dùng Claude Code thì cứ commit như bình thường.
