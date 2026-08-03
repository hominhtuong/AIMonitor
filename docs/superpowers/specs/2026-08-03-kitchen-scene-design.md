# Bối cảnh Nhà bếp — kiểu phòng thứ 5, hình học/logic độc lập (design)

Ngày: 2026-08-03
Nhánh: `feat/vscode-extension`

## Tóm tắt

Thêm "Nhà bếp" làm kiểu phòng thứ 5, cạnh tranh trực tiếp với 4 nút Cổ điển/Thư viện/Gác
xép/Sân vườn hiện có (`ROOMS[]`, chọn qua `localStorage`). Khác với 4 kiểu kia — vốn chỉ đổi
màu tường/sàn/decor trên CÙNG một hình học bàn văn phòng — Nhà bếp có **hình học và logic
hoàn toàn riêng**: 10 trạm bếp thay cho 10 bàn văn phòng, môi trường sống động (lửa, hơi,
bánh quay), hành vi agent đa bước, và một bộ nhân vật Đầu bếp riêng ép cứng chỉ trong phòng
này.

Bối cảnh trước (`scene-farm.js`, `scene-delivery.js`, hệ multi-scene `SCENE_ORDER`/
`registerScene`) đã bị gỡ khỏi codebase. Thiết kế này **không** hồi sinh hệ plugin nhiều
scene cũ — chỉ mở rộng đúng 1 điểm rẽ nhánh (`OF.room === 'kitchen'`) tại những chỗ code hiện
tại đang hardcode hình học bàn văn phòng.

## Vì sao không nhét vào `ROOMS[]` như 4 kiểu kia

Đã đọc `office.js`: `ROOMS[].draw(g,p)` chỉ vẽ nền tĩnh (sàn/tường/decor). Bàn/ghế/hit-test/
routing dùng chung CỐ ĐỊNH cho mọi room — `DESK_X/ROW_Y/DESK_W/DESK_H`, `deskAt()`,
`drawDesk/drawChairBase/drawChairBack`, nhánh "seat" trong `routeTo()`/`deskSideX()` — không
đọc `OF.room` ở đâu cả. Đổi kiểu phòng hiện tại chỉ đổi màu quanh cùng một bộ bàn ghế.

Nhà bếp cần trạm hình dạng khác, cách vào/ra ghế khác, hoạt cảnh khác → không thể biểu diễn
bằng một hàm `draw(g,p)` đơn thuần. Cần rẽ nhánh tại đúng những điểm đang hardcode hình học
bàn, không phải thêm 1 phần tử vào `ROOMS[]`.

## Kiến trúc tích hợp

- Rẽ nhánh `if (OF.room === 'kitchen')` tại các điểm: `buildDesks`-tương-đương (dựng danh
  sách 10 trạm), `deskAt` (hit-test), `drawDesk`/`drawChairBase`/`drawChairBack` (vẽ trạm),
  nhánh "seat" của `routeTo`/`deskSideX` (vào/ra trạm qua khe cạnh, tương tự bàn văn phòng
  nhưng offset khác vì hình trạm khác).
- Phần tổng quát giữ nguyên, KHÔNG sửa: state machine `step()` (mode `sit/idle/wander/
  leaving/cheer`), `frameFor()`, `drawEntity()`, `entAt()`, di chuyển theo `path` — đã xác
  nhận các hàm này không đọc `e.desk`/toạ độ bàn cứng, dùng được cho trạm bếp nguyên trạng.
- Gán agent → trạm: **tái dùng đúng thuật toán `syncAgents` hiện có** cho bàn (ổn định suốt
  phiên, không đổi giữa các tick), chỉ đổi nguồn danh sách vị trí sang `KITCHEN_STATIONS`
  khi đang ở phòng bếp. Không viết lại thuật toán gán.
- Code bếp để trong file mới `aimon/static/office-kitchen.js` — nạp bằng `<script>` tĩnh
  thêm vào `index.html`, sau `office.js` (đúng thứ tự phụ thuộc `t()/render()` từ `app.js`,
  atlas nhân vật từ `sprites.js`). Không có cơ chế lazy-load module trong repo và dự án chủ
  trương không build step, nên không bịa cơ chế mới — file luôn được nạp, chỉ hoạt động khi
  `OF.room === 'kitchen'`.
- **Không đổi backend.** Đã xác nhận `office.py`/`/api/pulse` không biết khái niệm "room" —
  room chọn thuần frontend qua `localStorage`. Nhà bếp không cần sửa `config_file.py`,
  không cần cờ mới trong `~/.aimon/config.json`.

## Bố cục 10 trạm

`MAX_AGENTS = 10` (office.py:39) — khớp đúng 10 trạm, không đổi hằng số backend.

| # | Trạm | Việc chính |
|---|------|-----------|
| 1 | Bếp ga | xào, lật, chảo bay lửa |
| 2 | Bàn cắt | thái, băm (dao đa khung) |
| 3 | Chậu rửa | rửa rau, vò |
| 4 | Lò nướng | mở lò, lấy khay, cửa kính đỏ khi nóng, bánh quay |
| 5 | Nồi hấp | hấp, xả hơi |
| 6 | Bàn bày đĩa | cầm đĩa, đặt món |
| 7 | Kệ gia vị | rắc, nếm, cầm chai |
| 8 | Bàn bột | nhồi, lăn, cán |
| 9 | Quầy giao | chuyển món ra cửa |
| 10 | Kho lạnh | lấy, kiểm, đóng tủ |

Hai khu: chế biến (trạm 1-5) + phụ & giao (trạm 6-10), lối đi ở giữa, cửa vào/ra qua lối
trung tâm — không cắt qua khu nóng (bếp ga/lò nướng).

Trạm không gắn với tool/action thật agent đang chạy — thuần hoạt cảnh tô điểm, giống cách 4
phòng kia không tie bàn với loại việc cụ thể. Bấm vào một đầu bếp vẫn mở đúng bảng chi tiết
agent (state/action/tool thật) như mọi phòng khác — phần đó dùng chung, không đổi.

## Hành vi & môi trường sống

- **Ngồi/rảnh/rời phòng**: dùng nguyên `step()` hiện có. Chỉ khác điểm vào/ra: thay
  `deskSideX` (giả định bàn văn phòng, offset theo `DESK_W`) bằng hàm side-offset riêng cho
  hình trạm bếp, truyền vào `routeTo`. Không đổi `mode`/`goal` trước khi gọi `routeTo` — giữ
  đúng quy tắc đã có (đổi sớm là mất bước ngang khỏi ghế, nhân vật chui xuyên trạm).
- **Hành vi đa bước**: rảnh→bận thì chèn 1 chặng "ghé Kho lạnh/Kệ gia vị lấy đồ" trước khi
  vào trạm chính. Cờ trạng thái riêng trong `office-kitchen.js` (đặt `goal` trung gian trước
  khi set `goal='desk'` như bình thường) — không sửa `step()` lõi.
- **Môi trường sống** (lửa bếp ga dao động, hơi nồi hấp theo nhịp, cửa lò đỏ + bánh quay
  chậm, khói ống khói): vẽ lại **mỗi frame**, không nướng 1 lần như nền tường/sàn 4 phòng
  kia. Hệ quả: khi phòng bếp đang mở, **tắt tối ưu throttle `frameSig` 5fps** đang dùng
  chung — bếp vẽ liên tục ~60fps, tốn CPU hơn phòng khác. Đánh đổi đã biết trước và chấp
  nhận, vì mục tiêu là "sống động" chứ không phải hiệu năng tối đa.
- **Đạo cụ nhiều khung hình** theo từng trạm (dao, chảo, thìa khuấy, tay nhồi bột): 2-3 khung
  mỗi loại, lệch pha theo `e.anim` có sẵn trên entity — cùng cơ chế bập bùng đã dùng cho
  farm2 trước đây.

## Bộ nhân vật Đầu bếp

10 đầu bếp, vẽ đúng khuôn `sprites.js`: atlas, lưới con `SPRITE_SS = 3`, hậu kỳ `finishCell`
(rim-light/viền theo màu), tỷ lệ chibi 16x20 (đầu 9/20 chiều cao, mắt 2x2 có chấm sáng, má
hồng) — nhất quán 7 bộ hiện có, không tự chế khuôn riêng.

Khai trong `sprites.js` như một mảng riêng (VD `CHEF_CHARS`), **không đưa vào `PACKS`** —
không lọt vào bảng chọn "đổi bộ nhân vật" người dùng thấy ở phòng khác, không đăng ký
`OFFICE_PACKS` (`config_file.py`) hay enum `aimon.officePack` (`package.json`). Không cần
sửa 3 chỗ CI đang kiểm cho pack thường vì bộ này không phải pack người dùng tự chọn.

`office-kitchen.js` trỏ thẳng vào `CHEF_CHARS` khi vẽ nhân vật trong phòng bếp, ép cứng bất
kể `OF.pack` đang là gì. Rời bếp sang phòng khác thì nhân vật hiện lại đúng bộ user đã chọn
trước đó (`e.charIndex` không bị đổi bởi việc vào bếp — bếp chỉ đổi chỉ số sprite dùng lúc
VẼ, không ghi đè state đã lưu).

## Tích hợp UI + i18n

- **Nút chọn phòng**: thêm nút "Nhà bếp" cạnh 4 nút hiện có (`renderRooms()`), cùng cơ chế
  `localStorage` (`aimon.room`) — không đổi backend/config.
- **`index.html`**: thêm `<script src="/static/office-kitchen.js"></script>` ngay sau
  `office.js`.
- **i18n** (`i18n.js`, cả `en` và `vi`): nhãn phòng "Nhà bếp"/"Kitchen", tên 10 trạm, chú
  giải hành động (đang xào/thái/rửa...) — theo đúng dạng khoá đã dùng cho 4 phòng hiện có.
  Không viết chữ thẳng vào `office-kitchen.js`/`index.html`.

## Phạm vi KHÔNG làm

- Không đổi `office.py`/`/api/pulse` — room thuần frontend.
- Không đổi `config_file.py`/`OFFICE_PACKS`/enum `officePack` — bộ Đầu bếp không phải pack
  chọn được.
- Không hồi sinh hệ multi-scene (`SCENE_ORDER`, `registerScene`, `SCENE_LAZY`) — chỉ 1 điểm
  rẽ nhánh `OF.room === 'kitchen'`.
- Không tie trạm bếp với loại tool/action thật của agent — thuần hoạt cảnh.

## Kiểm tra

```bash
python3 -m compileall -q aimon
for f in aimon/static/*.js; do node --check "$f"; done
```

Thủ công trên dashboard đã bật:

- Chọn phòng Nhà bếp: đủ 10 trạm, agent ngồi đúng bộ Đầu bếp (không phải bộ đang chọn ở nơi
  khác).
- Đổi sang phòng khác rồi quay lại: bộ nhân vật ở phòng kia không bị đổi bởi việc từng vào
  bếp.
- Bấm vào 1 đầu bếp: mở đúng bảng chi tiết agent (state/action/tool thật).
- Hover vào người đang rời phòng / đang ngồi làm việc: không sinh nhân vật ma, không nhảy
  khỏi ghế giữa chừng (3 cái bẫy đã ghi trong CLAUDE.md, áp dụng nguyên vẹn cho phòng bếp vì
  dùng chung `step()`).
- Theo dõi CPU khi mở phòng bếp lâu (do tắt throttle `frameSig`) — xác nhận mức tăng chấp
  nhận được, không cần tối ưu thêm ở vòng thiết kế này.
