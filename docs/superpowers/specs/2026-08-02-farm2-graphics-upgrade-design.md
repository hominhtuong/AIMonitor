# Thiết kế: Nâng cấp đồ họa Nông trại v2 (farm2)

Ngày: 2026-08-02
Trạng thái: đã duyệt (brainstorming)

## Bối cảnh

Bối cảnh `farm2` (`scene-farm-v2.js` + `sprites-farm.js`) đã hoàn tất ở vòng trước: nông dân
16x16 (10 người × 17 khung), nền nướng 260x176 (nhà gỗ, giếng, 2 cây, chuồng đỏ, tháp đá,
2 luống, hàng rào), 4 con vật ambient. Người dùng muốn **nâng cấp đồ họa** theo hai hướng đã
chốt:

- **A — Cảnh quan phong phú hơn**: thêm cả 6 yếu tố (đồi xa, đường đất, hoa cỏ, ao nước, bó
  rơm, vườn cây) — giữ nguyên phong cách pixel 16x16 và bố cục phòng.
- **B — Nông dân chi tiết hơn**: giữ **16x16** (đã chốt, không lên 20/24), thêm hoạt ảnh
  2 nhịp cho đạo cụ, nháy mắt + thở, đạo cụ to/rõ hơn + biến thể, phụ kiện phân biệt 10 người.

## Các quyết định đã duyệt

| Chủ đề | Quyết định |
| --- | --- |
| Kích thước nhân vật | Giữ 16x16, SS=3, **không** đổi bố cục phòng (không lên 20x20/24x24) |
| Cách làm hoạt ảnh | Atlas hoàn chỉnh (Cách 1): vẽ tư thế mới nướng vào atlas, `f2FrameFor` đảo nhịp bằng `e.anim` |
| Hoạt ảnh đạo cụ | 8 đạo cụ × 2 tư thế A/B (nhấc/cầm cao → giáng/cúi), ~2-3 nhịp/giây, mỗi người một pha |
| Nháy mắt | Khung riêng; cửa sổ ~4s một lần, 0.2s/nháy; CHỈ ở tư thế bình tĩnh (rest/water/d0) — không cắt ngang cú giáng |
| Thở | Dịch trục y 1px theo nhịp chậm khi ngồi — sửa nhỏ trong nhánh farm của `drawEntity` |
| Đạo cụ | Vẽ lại to/rõ hơn + biến thể mới (liềm, túi hạt, bình tưới vòi, sọt lúa...) — **vẫn bám 8 action key có sẵn**, không thêm action, không đụng `office.py` |
| Phụ kiện | 10 nông dân, thiết kế nhìn từ SAU (tư thế làm việc chính nhìn xuống) |
| Cảnh quan | Cả 6 yếu tố, đều nướng một lần trong `f2DrawStatic` (miễn phí lúc chạy) |
| Ao lấp lánh | Vẽ ở `drawAnimated`, pha gợn sáng cho vào `sceneSig` để kích vẽ lại (pattern kim đồng hồ Văn phòng) |
| Phạm vi | Không sửa `sprites.js`, `scene-farm.js`, `scene-delivery.js`, `office.py`, `server.py`; không file mới → CI không phải sửa |

## B — Nông dân

### Khung hình (atlas 17 → 26)

```
d0,d1,d2,u0,u1,u2,s0,s1,s2          (9 khung đi lại — giữ nguyên)
hoeA,hoeB, plantA,plantB,
harvestA,harvestB, axeA,axeB,
waterA,waterB, fishA,fishB,
interactA,interactB, carryA,carryB  (8 đạo cụ × 2 tư thế)
blink                               (ngồi yên, mắt nhắm)
```

`FRAME_INDEX_FARM` thêm 17 khoá; `FARM_FRAME_KEYS` sinh động nên `buildAtlas_farm` không phải
đổi. Atlas: 10 nông dân × 26 khung, ô 18x18 gốc × SS=3 = 54px, rộng 26×54 = 1404px — vẫn 1 cụm
(cao 10 hàng × 54 = 540px < 4096).

### Đánh nhịp (f2FrameFor)

- Tư thế A/B: `Math.floor(e.anim * SWING_RATE) % 2`, `SWING_RATE` ≈ 4 (2 nhịp/giây). Mỗi
  entity có `e.anim` riêng (office.js:1047) nên các nông dân tự lệch pha.
- `frameFor(e)` đã nằm trong `frameSig()` (office.js:1216) → tư thế đổi là tự vẽ lại, không
  cần thêm móc ở lõi.
- Nháy mắt: `blinkOf(e)` — cửa sổ `Math.floor(e.anim / BLINK_PERIOD)` đổi; nháy kéo dài
  `BLINK_DUR` (≈0.2s); chỉ áp dụng khi tư thế cơ sở thuộc `{water, d0}` (bình tĩnh).
- `f2FrameFor` phải **rẻ và xác định trong một tick** (được gọi cả khi tính chữ ký lẫn khi
  vẽ) — chỉ vài phép so sánh + đọc bảng, không gọi ngẫu nhiên.

### Đạo cụ (8 loại × 2 tư thế)

| Hành động | Đạo cụ cũ | Mới |
| --- | --- | --- |
| `type` (Edit) | cuốc mảnh | cuốc có lưỡi rộng |
| `read` | gậy vàng | **liềm cong** (gặt lúa) |
| `run` | rìu nhỏ | rìu lưỡi to |
| `web`/`mcp` | cần câu | cần câu có dây + phao |
| `plan`/`work`/`rest` | bình tưới | bình tưới có vòi + 2 giọt nước |
| Write (f2IsWrite) | mầm cây | cây con + **túi hạt** cầm tay còn lại |
| `delegate` | cờ vàng | **bảng ghi + bút** (giao việc) |
| (carry — dự trữ) | hộp | sọt lúa đeo lưng |

Đạo cụ ở tư thế B (giáng/cúi) vẽ thấp hơn A một chút và/hoặc có hiệu ứng nhỏ (giọt nước,
tia cắt). Vẫn không nét nào vượt quá y=15 (viền ô atlas).

### Phụ kiện nhận diện (nhìn từ SAU)

`FARMER_CHARS` thêm trường `acc`; `drawFarmerFarm` vẽ theo từng loại:

| # | Phụ kiện |
| --- | --- |
| 0 | khăn đỏ buộc gáy (hai dải đuôi sau gáy) |
| 1 | búi tóc (nút tối dưới vành nón) |
| 2 | tóc đuôi ngựa (dài xuống lưng) |
| 3 | áo sọc dọc (vệt sáng/tối dọc thân) |
| 4 | yếm overall (hai dây qua vai từ phía sau) |
| 5 | túi hạt đeo chéo (dây chéo lưng + túi hông) |
| 6 | vành nón viền tối |
| 7 | khăn quàng cổ (nút sau gáy) |
| 8 | áo khoác dài (tà sau phủ quá hông) |
| 9 | quần cạp cao sáng màu |

Áp dụng bài học sprites.js: phụ kiện phải **bám vào thân** (không lơ lửng ngoài silhouette);
viền/đổ bóng do `finishCell` tự xử lý từ màu có sẵn; không vẽ vệt sáng lên đỉnh đầu (chỗ hậu
kỳ `RIM_LIGHT`).

## A — Cảnh quan

Thứ tự vẽ trong `f2DrawStatic`: **đồi xa → nền cỏ → các yếu tố cũ (nhà/chuồng/tháp/giếng/cây)
→ yếu tố mới theo lớp** (ao, đường, hoa, rơm, cây mới nằm sau những gì vẽ sau chúng).

| Yếu tố | Vị trí | Ghi chú |
| --- | --- | --- |
| Đồi xa + chân trời | dải y≈10..21 (giữa rào trên và dãy nhà), lượn sóng + 2-3 chỏm cây xa mờ | vẽ TRƯỚC mọi thứ khác → nằm sau nhà/cây |
| Đường đất | từ cửa nhà (x≈30, y≈42) uốn sang trái rồi chạy dọc **lối đi TÂY** (x≈2..12) xuống tới gần rào dưới | vài hòn sỏi tối; không cắt qua dải luống (đất x28..232, y66..82); nông dân đi trên đường là hợp lý |
| Hoa + cỏ | cụm nhỏ rải quanh rào dưới, góc phòng, gần nhà/chuồng | hoa đỏ/trắng/vàng 2-3px, cỏ cao |
| Ao nước | góc phải dưới (x≈200, y≈155) | nằm trong dải cỏ trống y=151..167; đổi `f2Ambient` nếu con vật trùng chỗ |
| Bó rơm | 2 bó cạnh chuồng (x≈170, y≈58) | |
| Vườn cây | thêm 2 cây ăn quả: (58,26) và (150,26) → tổng 4 cây | quả đỏ/cam |

### Ao lấp lánh

- `drawAnimated(g, p)`: vẽ 1-2 pixel trắng sáng đổi vị trí theo `OF.clock` (mặt nước).
- `sceneSig()`: trả `'pond' + Math.floor(OF.clock * SHIMMER_RATE) % N` — pha đổi là chữ ký đổi
  → vẽ lại ~1 nhịp/giây. Đúng invariant "chỉ vẽ lại khi có gì đổi".

## Tích hợp vào office.js (thêm, không đè nhánh cũ)

- `drawEntity` nhánh farm: thêm nhịp thở 1px (trục y) khi `e.mode === 'sit'` — nhỏ, riêng cho
  farm2.
- Không có thay đổi nào khác: `drawAnimated`/`sceneSig` là hook có sẵn, `f2FrameFor` đã được
  `frameFor(e)` gọi trước.

## Hiệu năng (bám 8 cơ chế của docs/hieu-nang.md)

- Cảnh quan: nướng một lần trong `f2DrawStatic` → 0 đồng lúc chạy.
- Xoay/nháy: chỉ vẽ lại khi `frameSig` đổi — ~2 nhịp/giây mỗi người, tối đa ~vài chục
  nhịp/giây cả phòng đông, mỗi lần là `drawImage` vài chục đối tượng (nhẹ hơn 60fps của Văn
  phòng).
- Ao: ~1 nhịp/giây. `f2FrameFor` giữ cực rẻ (đọc bảng, không tính nặng).
- Atlas 26×54px×10 người ≈ 1404×540 — dưới ngưỡng texture 8192, không rơi mất tăng tốc GPU.

## Kiểm thử

- `node --check` `sprites-farm.js`, `scene-farm-v2.js`, `office.js`.
- CI script hiện tại (bộ/bối cảnh/i18n/stationCount) — không đổi file nên vẫn phải xanh.
- QA live (server + Playwright):
  - nông dân ngồi làm việc đảo A/B đúng nhịp; nháy mắt xuất hiện ~mỗi 4s ở tư thế bình tĩnh;
  - 10 phụ kiện phân biệt được bằng điểm ảnh (so 10 ô atlas);
  - cả 6 yếu tố cảnh quan có mặt (so pixel tại toạ độ chốt); ao có 2 pha gợn sáng khác nhau;
  - không lỗi console.

## Ngoài phạm vi (YAGNI)

- Ngày/đêm, thời tiết, mây động, bướm/đom đóm (thuộc hướng C — user không chọn).
- Nâng sprite lên 20x20/24x24 (user đã chốt giữ 16x16).
- Cây trồng phát triển theo thời gian (đã loại ở spec gốc).
- Thêm action key mới hay sửa `office.py` / `server.py`.
