# Hiệu năng AI Monitor - đo thật, không ước lượng

Tài liệu trả lời ba câu: máy cấu hình thế nào thì dùng được, bật liên tục thì tốn bao nhiêu
RAM/CPU, và còn tối ưu được chỗ nào.

Mọi con số dưới đây đo trên máy thật, không lấy từ tài liệu hay suy đoán. Chỗ nào không đo
được thì ghi rõ là suy từ code.

> **Bản này đo lại sau đợt tối ưu 08/2026.** Số của bản trước còn ở cột "trước" trong mục
> [Đã làm gì trong đợt tối ưu](#đã-làm-gì-trong-đợt-tối-ưu). Hai chỗ bản trước ghi sai đã sửa,
> xem [Hai chỗ bản trước đo sai](#hai-chỗ-bản-trước-đo-sai).

## Máy đo và điều kiện đo

| Hạng mục | Giá trị |
| --- | --- |
| Máy | Apple M2, 8 nhân, 16 GB RAM, macOS 25.5 |
| Python | 3.12.1 (bản `.exe`/app macOS dùng 3.9.6, chậm hơn chút) |
| Tải nền lúc đo | 498-565 tiến trình đang chạy - máy làm việc thật, không phải máy sạch |
| Dữ liệu Claude | 870 MB transcript, 396 file `.jsonl`, `~/.claude.json` 0.13 MB |
| Trình duyệt | Chrome for Testing 149 headless (xấp xỉ webview của VSCode) |

Hai con số phụ thuộc mạnh vào máy: **số tiến trình** (quyết định chi phí `ps`) và **khối
lượng transcript** (quyết định lần đọc đầu). Máy 498 tiến trình là mức khá cao, nên số CPU
dưới đây thiên về phía xấu chứ không phải phía đẹp.

## Tóm tắt trước, chi tiết sau

| Trạng thái | CPU (1 nhân) | CPU (máy 8 nhân) | RAM server | RAM trang web |
| --- | --- | --- | --- | --- |
| Panel đóng | 0% | 0% | 0 (không có tiến trình) | 0 |
| Chỉ thanh trạng thái | **0.09%** | 0.01% | 30 MB | 0 |
| Panel mở nhưng đang bị giấu | **0%** | 0% | 30 MB | đứng im |
| Dashboard mở (tab AI & Agent) | 2.94% + 1.7% | ~0.6% | 26-33 MB | ~40 MB |
| Thêm tab Văn phòng, phòng đứng yên | 5.56% + 0.2% | ~0.7% | 26-33 MB | ~47 MB |
| Thêm tab Văn phòng, có người đi lại | 5.56% + 4.4% | ~1.2% | 26-33 MB | ~47 MB |
| 20 giây đầu sau khi bật | tăng vọt 1 lần | | đỉnh 93 MB | |

Cột CPU ghi hai số: **server Python + trang web**. Chúng chạy ở hai tiến trình khác nhau.
Số CPU của server tính cả tiến trình con (`ps`, `lsof`) - xem mục dưới về chỗ này.

**Kết luận ngắn: không đáng kể trên macOS/Linux.** Bật cả ngày tốn dưới 1% CPU của một máy
8 nhân và khoảng 30 MB RAM cho server. Chỉ để thanh trạng thái thì gần như bằng 0.

**Windows thì khác hẳn, xem mục riêng cuối bài.**

## Chi phí một lần làm mới

Đo bằng `resource.getrusage`, tách riêng CPU của tiến trình Python và CPU của tiến trình con.
Đây là chỗ bản trước đo thiếu: `ps` và `lsof` là **tiến trình con**, nên `ps -o time=` trên
tiến trình server không thấy chúng, và số CPU của bản trước hụt hơn một nửa.

| Việc | Wall | CPU Python | CPU tiến trình con | Tổng CPU |
| --- | --- | --- | --- | --- |
| `snapshot.build()` có cổng | 87.4 ms | 34.4 ms | 51.8 ms | **86.2 ms** |
| `snapshot.build()` không cổng | 64.0 ms | 34.0 ms | 27.6 ms | **61.6 ms** |
| `snapshot.usage_only()` | 3.5 ms | 3.5 ms | **0** | **3.5 ms** |

`usage_only()` không đẻ tiến trình con nào - đó mới là điểm chính, không phải chuyện nó nhanh
hơn 25 lần. Mỗi lần `build()` là hai lần fork/exec (`ps` và có thể cả `lsof`), và trên
Windows thì mỗi lần fork ấy là một tiến trình PowerShell.

Chi tiết từng collector (p50 của 5 lần, cache đã nóng):

| Việc | p50 | Ghi chú |
| --- | --- | --- |
| `procs.snapshot()` | 54.5 ms | phần đắt nhất, `ps` chiếm khoảng nửa |
| `ports.collect(force=True)` | 28.3 ms | `lsof`, cache 5 giây |
| `claude.scan()` | 2.3 ms | đọc tăng dần, lần đầu ~300 ms |
| `usage.collect()` | 1.2 ms | đọc file có cache theo `(mtime, size)` |
| `claude.windows()` | 0.4 ms | |
| `docker ps` | không đo được | máy đo không cài Docker |

Đo qua HTTP, tính cả tuần tự hoá JSON, nén và truyền qua loopback:

| Endpoint | Nhịp gọi | p50 | Thô | Nén gzip |
| --- | --- | --- | --- | --- |
| `/api/snapshot` | 3 giây | 64 ms | 197 KB | **35.4 KB** |
| `/api/usage` | 6 giây (thanh trạng thái) | **5 ms** | 2.4 KB | **0.8 KB** |
| `/api/pulse` | 1 giây (chỉ tab Văn phòng) | 4 ms | 6.8 KB | 2.6 KB |
| `/api/version` | khi probe | 1 ms | 152 B | không nén (dưới ngưỡng) |

## CPU khi chạy liên tục

Mô phỏng đúng nhịp thật của trang web, đo bằng `getrusage` nên **tính cả tiến trình con**.

| Kịch bản | CPU / thời gian | % một nhân | % máy 8 nhân |
| --- | --- | --- | --- |
| Chỉ thanh trạng thái (`/api/usage` mỗi 6 giây) | 0.02 s / 24 s | **0.09%** | 0.01% |
| Dashboard tab AI (snapshot 3 giây, không cổng) | 0.55 s / 19 s | **2.94%** | 0.37% |
| Dashboard tab Cổng (snapshot 3 giây, có cổng) | 0.61 s / 19 s | **3.27%** | 0.41% |
| Dashboard + Văn phòng (pulse 1 giây + snapshot 3 giây) | 1.01 s / 18 s | **5.56%** | 0.70% |

Phía trang web, đếm số lần `draw()` thật sự chạy trong một khoảng và đo thời gian JS của
từng khung:

| Trạng thái căn phòng | Khung vẽ / giây | ms mỗi khung | CPU JS |
| --- | --- | --- | --- |
| Mọi người ngồi gõ phím | **5.0** | 0.40 ms | **0.2%** |
| Có người đi lại trong phòng | 53-60 | 0.35 ms | 2.1% |

Phòng đứng yên thì vòng vẽ gần như tắt hẳn; có chuyển động thì vẫn vẽ đủ 60 fps, đúng như
phải thế. Xem mục [Bỏ khung vẽ trùng](#2-bỏ-khung-vẽ-trùng-60-fps-xuống-5-fps-khi-phòng-đứng-yên).

`JSON.parse` payload 197 KB chỉ mất **0.3 ms** - không phải nút thắt, đừng tối ưu chỗ này.

## RAM

### Server Python - có một cú vọt lúc khởi động

Đo RSS mỗi 10 giây, server sạch, **không có request nào**:

```text
t=10s   93 MB     <- warmup đọc transcript 7 ngày
t=20s   93 MB
t=30s   43 MB
t=40s   37 MB
t=70s   33 MB
t=90s   11 MB     <- macOS đã thu hồi hết vùng nhớ đã giải phóng
t=120s  11 MB
```

Cú vọt 93 MB là do `_warmup()` chạy nền lúc khởi động: nó đọc 870 MB transcript để cửa sổ
5h/7d có số ngay từ lần load đầu. Đo riêng bằng `resource.getrusage`: peak RSS tăng từ
12.9 MB lên 78.9 MB trong một lần `snapshot.build()` lạnh, và không tăng thêm ở hai lần sau.

**Đây là đỉnh nhất thời, không phải mức chiếm dụng.** Máy 8 GB trở lên không cảm nhận được.
Máy 4 GB đang gần đầy thì 20 giây đầu có thể thấy hơi khựng.

Chạy liên tục với đủ hai vòng poll: **ổn định 26-33 MB, không tăng dần** (đo 7 phút liên tục
ở bản trước, và 30.4 MB sau 5 phút ở lần đo này). Không có rò rỉ bộ nhớ trong khung thời gian
này.

Hai cấu trúc trong `claude.py` về lý thuyết có thể phình theo thời gian: `seen_msgs` (6768
phần tử sau khi parse hết transcript) và `hourly` (152 bucket). Với tốc độ đo được, một tuần
chạy liên tục cộng thêm cỡ vài MB. **Đã cân nhắc cắt và quyết định KHÔNG cắt** - xem mục
[Những chỗ KHÔNG nên tối ưu](#những-chỗ-không-nên-tối-ưu).

### Trang web

Phần nặng nhất là **atlas nhân vật** của khung nhìn Văn phòng, và nó chỉ dựng khi người dùng
mở tab đó lần đầu. Ai không dùng khung nhìn Văn phòng thì không trả cái giá này.

Atlas nay chỉ nướng bộ đang chọn thay vì cả tám bộ:

| Nướng | Số nhân vật | Thời gian | Canvas | Vùng nhớ ảnh |
| --- | --- | --- | --- | --- |
| Cả 8 bộ (cách cũ) | 127 | 193 ms | 2268 x 4092 | **35.4 MB** |
| Bộ Hải trình (mặc định) | 36 | 60 ms | 756 x 2442 | **7.0 MB** |
| Bộ 10 nhân vật (Danh thủ, Văn phòng, Thú cưng...) | 10 | 19 ms | 756 x 726 | **2.1 MB** |
| Bộ Năm anh em | 5 | 8 ms | 756 x 396 | **1.1 MB** |

`finishCell()` còn giữ một bản `ImageData` tạm bằng đúng kích thước atlas trong lúc hậu kỳ,
nên đỉnh nhất thời là gấp đôi cột cuối: **14 MB** với bộ mặc định, thay vì 71 MB như trước.

Renderer của trình duyệt: bản trước đo được trang cộng thêm **~75 MB** so với một renderer
trắng. Đợt này không đo lại được con số đó một cách đáng tin (máy đo có sẵn nhiều cửa sổ
Chrome, RSS trên macOS lại tính trùng vùng nhớ dùng chung giữa các tiến trình), nên **suy ra**:
75 MB trừ đi phần atlas tiết kiệm được là khoảng **47 MB** với bộ mặc định. Đây là con số suy,
không phải con số đo - đo lại tử tế thì cần một máy sạch.

### Tài nguyên tĩnh của trang

Server nén gzip theo `Accept-Encoding`. Trang nạp lại toàn bộ tài nguyên này mỗi lần webview
dựng lại - tức mỗi lần đổi settings, đổi theme, hoặc khởi động lại server.

| File | Thô | Nén |
| --- | --- | --- |
| sprites.js | 114.7 KB | **33.3 KB** |
| office.js | 72.2 KB | **26.3 KB** |
| app.js | 44.5 KB | **15.0 KB** |
| i18n.js | 30.8 KB | **9.3 KB** |
| style.css | 27.9 KB | **8.5 KB** |
| packimport.js | 12.6 KB | **5.2 KB** |
| **Tổng** | **~290 KB** | **~99 KB** |

DOMContentLoaded: **94 ms** (trước khi nén là 116 ms).

## Đã làm gì trong đợt tối ưu

Sáu thay đổi, xếp theo mức ăn tiền. Cả sáu đều giữ nguyên dữ liệu hiển thị và chất lượng nét
vẽ - phần "đúng đắn" được kiểm bằng cách đối chiếu từng khoá của payload trước và sau.

### 1. Thanh trạng thái không còn kéo cả snapshot

`statusBar.ts` gọi `/api/snapshot` mỗi `refreshSeconds * 2` giây, nhưng `usage.ts` chỉ đọc
`usage` và `totals.today.cost` - tức **2.3 KB trong 197 KB, đúng 1.2%**. Mà mỗi cửa sổ VSCode
lại có một thanh trạng thái riêng, nên bốn cửa sổ là bốn lần quét `ps` toàn máy mỗi 6 giây,
chỉ để in ra hai con số phần trăm.

Nay có `/api/usage`: chỉ `claude.scan()` + `claude.windows()` + `usage.collect()`, không dựng
cây tiến trình, không gọi `lsof`, không đẻ tiến trình con nào.

| | Trước | Sau |
| --- | --- | --- |
| CPU liên tục (1 cửa sổ) | 1.66% một nhân | **0.09%** |
| Payload mỗi lần | 197 KB | **2.4 KB** (0.8 KB đã nén) |
| Tiến trình con mỗi lần | 1-2 (`ps`, `lsof`) | **0** |

Đã đối chiếu: `five_hour.pct`, `seven_day.pct`, `five_hour.source`, `resets_in`,
`totals.today.cost` giống hệt giá trị mà `/api/snapshot` trả về.

### 2. Bỏ khung vẽ trùng: 60 fps xuống 5 fps khi phòng đứng yên

Vòng `tick()` gọi `draw()` đủ 60 lần mỗi giây vô điều kiện, kể cả khi không có gì chuyển động.

Nay `tick()` dựng một **chữ ký** của mọi thứ quyết định ra khung hình (vị trí quy về pixel
thiết bị, khung hình đang chọn của từng người, trạng thái con mèo, hover, chọn, bậc phóng,
kiểu phòng) và bỏ qua `draw()` nếu chữ ký trùng khung trước.

Chọn chữ ký chứ không chọn cờ "bẩn" do từng hàm `step*` tự khai: cờ bẩn đòi mọi nhánh đổi
trạng thái đều phải nhớ bật cờ, sót một nhánh là màn hình đứng hình mà không ai biết vì sao.
Chữ ký suy thẳng từ những gì `draw()` đọc.

| Trạng thái | Trước | Sau |
| --- | --- | --- |
| Mọi người ngồi gõ phím | 60 fps | **5 fps** |
| Có người đi lại | 60 fps | 53-60 fps (không đổi, đúng như phải thế) |

Kèm theo một lỗi hình được sửa: `stepCat()` cộng `anim` vô điều kiện nên **con mèo nằm chờ
vẫn đảo qua lại hai khung đi bộ**, nhìn như nó giậm chân tại chỗ. Và vì nó đảo 5 lần mỗi
giây nên cả căn phòng đứng yên vẫn phải vẽ lại 5 lần mỗi giây chỉ vì con mèo. Nay nhịp chân
chỉ chạy khi nó thật sự đi.

### 3. Panel bị giấu thì ngừng hẳn

Đây là chỗ tốn nhất mà bản trước không thấy, vì nó chỉ lộ ra bên trong VSCode.

`retainContextWhenHidden: true` là bắt buộc (không có nó thì server bị giết rồi spawn lại
liên tục), nhưng nó khiến webview vẫn sống khi user thu gọn panel. Mà VSCode giấu webview
bằng `display:none`, và **Page Visibility API không tính chuyện đó**. Đo thật bằng một iframe
bị `display:none`:

| | Trước khi giấu | Sau khi `display:none` |
| --- | --- | --- |
| `document.hidden` | false | **false** |
| `setInterval` 100 ms | chạy | **vẫn chạy đủ nhịp** (15 tick / 1.5 giây) |
| `requestAnimationFrame` | chạy | **vẫn quay ~60 fps** (90 lần / 1.5 giây) |

Nên `if (!document.hidden)` trong `app.js` không hề bảo vệ được ca này: thu gọn panel xong
server vẫn bị hỏi 197 KB mỗi 3 giây cộng vòng vẽ 60 fps, mãi mãi, cho một cái panel không ai
nhìn.

Nay `onDidChangeVisibility` của `WebviewView` (và `onDidChangeViewState` của tab) báo xuống
trang qua `postMessage`, đi hai chặng vì dashboard nằm trong iframe khác origin. Kiểm chứng
bằng cách đếm `fetch` trong 5 giây:

| Trạng thái | Số `fetch` / 5 giây | `requestAnimationFrame` | Timer |
| --- | --- | --- | --- |
| Đang hiện | 6 | đang chạy | có |
| Bị giấu | **0** | **đã dừng** | **không** |
| Hiện lại | 6 | đang chạy | có |

### 4. Atlas chỉ nướng bộ đang dùng

Xem bảng ở mục RAM: **35.4 MB xuống 7.0 MB** với bộ mặc định, thời gian dựng **193 ms xuống
60 ms**. Và 193 ms đó rơi đúng lúc người dùng vừa bấm sang tab Văn phòng, chỗ dễ nhận ra nhất.

Chỉ số nhân vật vẫn là **chỉ số phẳng vào `ALL_CHARS`** như cũ, không đánh số lại - `office.js`
và `localStorage` đều giữ số đó, đánh lại là mọi lựa chọn ép riêng của người dùng trỏ sai
người. Bảng `rowOf` lo phần ánh xạ chỉ số phẳng sang hàng trong atlas.

Hai cái bẫy phải né, đã né:

- Nướng **cả bộ đang chọn** chứ không chỉ mấy người đang có mặt trong phòng: agent vào ra
  liên tục và mỗi người mới lại là một nhân vật khác trong bộ, lấy đúng người đang có thì cứ
  ai vào phòng là nướng lại một lần.
- Bảng phẳng đổi khi người dùng nhập thêm hoặc xoá bộ, lúc đó **chỉ số cũ trỏ sang nhân vật
  khác**. Vì vậy có `CHAR_GEN`: atlas ghi lại số thế hệ lúc nướng và tự coi mình hết hạn khi
  lệch, không thì xoá một bộ nhập tay là cả phòng đổi mặt lung tung.

### 5. Nén gzip theo `Accept-Encoding`

290 KB tài nguyên tĩnh xuống **99 KB**, `/api/snapshot` 197 KB xuống **35.4 KB**.

Trên loopback thì băng thông không phải vấn đề, nhưng `extensionKind` để `["workspace", "ui"]`
nên qua Remote-SSH iframe đi qua đường port forwarding của VSCode: lúc đó là 197 KB mỗi 3 giây
= **236 MB mỗi giờ** chạy qua SSH, nay còn **42 MB/giờ**.

Mức nén khác nhau theo loại, chọn theo số đo: JSON gọi mỗi 3 giây lấy mức 3 (1.06 ms, ra
37.7 KB) thay vì mức 6 (2.21 ms, ra 32.4 KB); file tĩnh chỉ nạp lại khi webview dựng lại nên
lấy mức 6. Dưới 1 KB thì không nén - header gzip ăn hết phần tiết kiệm.

### 6. Không gọi `lsof` khi không ai xem tab Cổng

`ports.collect()` chạy trong mọi `snapshot.build()`, tốn **28.3 ms** và đẻ thêm một tiến trình
con, trong khi bốn tab còn lại không đọc tới dữ liệu cổng. Nay trang gửi `?ports=0` khi đang ở
tab khác, và gọi lại ngay một lần khi người dùng bấm sang tab Cổng.

Payload giữ nguyên hình dạng (`ports.cached()` trả nguyên cache thay vì bỏ hẳn ba khoá ra) -
thiếu khoá thì frontend phải đi kiểm `undefined` ở mọi chỗ đọc tới, mà chỉ cần sót một chỗ là
tab Cổng vỡ. Đã kiểm: 13 khoá của snapshot còn nguyên, bảng cổng vẫn đủ 14 dòng.

Tiết kiệm: **86.2 ms xuống 61.6 ms** tổng CPU mỗi lần build có `lsof` chạy thật.

## Hai chỗ bản trước đo sai

Ghi lại để lần sau đo không dính nữa.

1. **CPU của server hụt hơn một nửa.** Bản trước đo bằng `ps -o time=` trên tiến trình
   server, mà `ps` và `lsof` là **tiến trình con** nên không nằm trong đó. Số đúng phải lấy
   `resource.getrusage(RUSAGE_CHILDREN)` cộng vào: một lần `build()` là 86.2 ms chứ không
   phải 34.4 ms.
2. **"Cả hai vòng đều dừng hẳn khi tab bị ẩn" là kết luận đọc code, không phải kết luận đo.**
   Đúng với tab trình duyệt, sai với panel VSCode - xem mục 3 ở trên. Bài học: câu nào nói về
   hành vi runtime thì phải có phép đo đi kèm, đọc code không thay thế được.

## Cấu hình máy tối thiểu và khuyến nghị

| Mức | Cấu hình | Trải nghiệm |
| --- | --- | --- |
| Tối thiểu | 2 nhân, 4 GB RAM | Chạy được. Nên để nhịp làm mới 5-10 giây. Cú vọt 93 MB lúc khởi động có thể thấy được nếu RAM đang gần đầy. |
| Khuyến nghị | 4 nhân, 8 GB RAM | Mượt ở mọi khung nhìn với cấu hình mặc định. Đây là mức mọi máy chạy VSCode + Claude Code đều có. |
| Thoải mái | 8 nhân, 16 GB RAM trở lên | Mở cả hai khung nhìn cả ngày cũng không nhận ra tool đang chạy. |

Thực tế: **nếu máy chạy được VSCode và Claude Code thì chạy được AI Monitor.** Bản thân
Claude Code tốn nhiều RAM hơn AI Monitor một bậc.

Ba yếu tố làm số trên xấu đi, xếp theo mức ảnh hưởng:

1. **Windows** - xem mục dưới, đây là yếu tố lớn nhất.
2. **Số tiến trình trên máy.** Chi phí `ps` và phần phân loại đều tỷ lệ tuyến tính với nó.
   Máy 1000+ tiến trình thì nhân đôi con số CPU ở trên.
3. **Có Docker.** `docker ps` được gọi cùng nhịp với `lsof`. Không đo được trên máy này, nhưng
   Docker Desktop thường trả lời trong 30-80 ms. Từ đợt này nó chỉ chạy khi người dùng đang
   xem tab Cổng & Docker.

## Windows - chỗ duy nhất chi phí đáng kể

**Không đo được trên máy này, phần dưới suy từ code trong `procs_windows.py`.**

macOS/Linux gọi `ps`, một binary C khởi động trong ~5 ms rồi in ra text. Windows không có
tương đương nên `procs_windows.py` spawn **một tiến trình `powershell.exe` mới** cho mỗi lần
đọc, chạy `Get-CimInstance Win32_Process` rồi `ConvertTo-Json`.

Riêng việc khởi động PowerShell 5.1 với `-NoProfile` đã tốn 300-700 ms trên máy phổ thông;
`Get-CimInstance Win32_Process` cộng thêm 100-400 ms nữa tuỳ số tiến trình. Nhịp gọi là mỗi
3 giây (hoặc mỗi 2 giây khi mở tab Văn phòng, do `PROC_MAX_AGE = 2.0`).

Ước tính thô: **10-35% một nhân**, thay vì 3% như macOS. Trên máy 4 nhân là 3-9% tổng CPU -
đủ để quạt chạy và pin tụt nhanh hơn.

Ba thay đổi của đợt này giúp Windows nhiều hơn macOS, vì trên Windows mỗi tiến trình con đắt
gấp trăm lần: thanh trạng thái không còn đẻ tiến trình con nào, tab thường không gọi `lsof`
nữa, và panel bị giấu thì ngừng hẳn. Nhưng **vẫn cần đo thật trên Windows trước khi khuyến
nghị cho máy yếu**, và `procs_windows.py` vẫn là ứng viên tối ưu số một cho nền tảng đó.
Hướng khả dĩ: giữ một tiến trình PowerShell sống và bơm lệnh qua stdin thay vì spawn lại mỗi
lần, hoặc gọi thẳng `CreateToolhelp32Snapshot` qua `ctypes` (vẫn là stdlib, không phá ràng
buộc "chỉ Python stdlib").

## Còn tối ưu được chỗ nào

### 1. Cắt bớt payload theo tab đang xem

Ba trường chiếm gần hết 197 KB:

| Trường | Kích thước | Ai dùng |
| --- | --- | --- |
| `processes` | 85.0 KB | chỉ tab Tài nguyên |
| `orphan_sessions` | 65.4 KB | chỉ tab Lịch sử phiên |
| `ai` | 50.6 KB | tab AI & Agent |
| còn lại | ~5 KB | usage, ports, totals, groups... |

Tức **72% payload phục vụ hai tab hiếm khi mở**. Cùng một đường với `?ports=0` đã làm:
`/api/snapshot?parts=ai,usage,totals` cắt payload tab mặc định xuống còn khoảng 55 KB thô.

Chưa làm vì rủi ro cao hơn hẳn `?ports=0`: `morph()` so DOM với HTML mới, mà thiếu dữ liệu là
vùng DOM của tab kia bị xoá sạch chứ không phải giữ nguyên. Phải sửa cả phần render cho biết
"không có dữ liệu" khác với "dữ liệu rỗng". Sau khi đã nén thì lợi ích còn lại chủ yếu là CPU
phía server, không phải băng thông.

### 2. Windows: đừng spawn PowerShell mỗi lần đọc

Xem mục Windows ở trên. Đây là chỗ đáng làm nhất còn lại, nhưng phải có máy Windows để đo
trước và sau.

### 3. Nạp `sprites.js` + `office.js` theo yêu cầu

`index.html` nạp 6 script không điều kiện, trong đó 200 KB thô (99 KB đã nén) chỉ phục vụ tab
Văn phòng. Nạp động lúc mở tab đó lần đầu thì trang nhẹ hơn cho người không dùng khung nhìn
này. Vướng: `office.js` và `app.js` gọi thẳng hàm toàn cục của nhau, phải gỡ trước.

### Những chỗ KHÔNG nên tối ưu

- **`JSON.parse` payload** - 0.3 ms, không phải nút thắt dù payload 197 KB.
- **`drawRoom()`** - 0.04 ms mỗi khung. Cache nền phòng ra canvas ngoài màn hình nghe hợp lý
  nhưng chỉ tiết kiệm 0.04 ms, trong khi thêm một canvas 520x352 phải dựng lại mỗi lần đổi
  theme, đổi kiểu phòng và mỗi lần `resize()`. Sau khi có chữ ký khung thì phòng đứng yên
  không vẽ lại nữa, nên phần này càng không đáng.
- **Hạ nhịp `/api/pulse`** - nó chỉ tốn 4 ms mỗi lần và chính nhịp 1 giây là thứ làm hoạt cảnh
  ra hồn.
- **Giảm `SPRITE_SS`** - hạ xuống 2 thì atlas còn 3.1 MB thay vì 7.0 MB, nhưng vứt đúng phần
  chất lượng nét vẽ mà `docs/tao-bo-nhan-vat.md` đã đánh đổi để có. Nướng lười đã lấy được
  phần lớn lợi ích mà không mất gì.
- **Cắt `seen_msgs` / `hourly` trong `claude.py`** - đã cân nhắc kỹ và quyết định không làm.
  Lợi ích là vài MB, còn mọi cách cắt đều đụng vào thứ không được sai: cắt `seen_msgs` là mở
  đường cho `--include-partial-messages` đếm trùng, thứ từng làm token và chi phí phồng gần
  gấp đôi; cắt `hourly` thì `_history_row()` cộng `msgs` trên toàn bộ bucket nên số message
  của phiên dài sẽ tụt, và `history_start()` mất mốc bắt đầu của cả lịch sử. Vài MB không đáng
  đổi lấy một con số sai.

## Cách đo lại

```bash
# 1. Bật server riêng để không đụng instance đang chạy
python3 -m aimon.server --new --port 8931 --strict-port &

# 2. Chi phí một lần làm mới, TÍNH CẢ tiến trình con - đây là chỗ dễ đo thiếu nhất
python3 -c "
import sys, time, resource; sys.path.insert(0,'.')
from aimon import snapshot as S
from aimon.collectors import ports as PO
S.build()
def cpu():
    a=resource.getrusage(resource.RUSAGE_SELF); b=resource.getrusage(resource.RUSAGE_CHILDREN)
    return a.ru_utime+a.ru_stime+b.ru_utime+b.ru_stime
for name, fn in [('build co ports', lambda: S.build(True)),
                 ('build khong ports', lambda: S.build(False)),
                 ('usage_only', S.usage_only)]:
    PO._cache['ts'] = 0.0
    t, c = time.perf_counter(), cpu()
    fn()
    print(f'{name:20} wall {(time.perf_counter()-t)*1000:6.1f} ms  CPU {(cpu()-c)*1000:6.1f} ms')"

# 3. CPU khi chạy liên tục - mô phỏng đúng nhịp trang web, vẫn tính tiến trình con
#    (xem scripts trong lịch sử commit, hoặc lặp lại mẫu ở bước 2 trong vòng while)

# 4. Kích thước và nén của từng endpoint
for u in /api/usage /api/snapshot "/api/snapshot?ports=0" /api/pulse; do
  echo -n "$u thô=$(curl -s "http://127.0.0.1:8931$u" | wc -c) "
  curl -s -D- -o /dev/null -H 'Accept-Encoding: gzip' "http://127.0.0.1:8931$u" \
    | grep -i 'content-length\|content-encoding' | tr -d '\r' | tr '\n' ' '
  echo
done

# 5. Dọn
curl -s -X POST http://127.0.0.1:8931/api/quit
```

Phía trình duyệt, đo trong console của chính trang:

```js
// atlas: kích thước và thời gian nướng của bộ đang chọn
const t = performance.now(), a = buildSpriteAtlas(neededChars());
console.log(Math.round(performance.now() - t), 'ms',
            a.canvas.width + 'x' + a.canvas.height,
            (a.canvas.width * a.canvas.height * 4 / 1048576).toFixed(1), 'MB');

// số khung THẬT SỰ vẽ trong 5 giây - khác hẳn số lần requestAnimationFrame chạy
const orig = window.draw; let n = 0;
window.draw = function () { n++; return orig.apply(this, arguments); };
setTimeout(() => { window.draw = orig; console.log(n / 5, 'fps'); }, 5000);

// kiểm chứng panel bị giấu thì ngừng hẳn
window.postMessage({ command: 'aimon.visibility', visible: false }, '*');
```
