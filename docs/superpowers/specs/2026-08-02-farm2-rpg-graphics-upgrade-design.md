# Thiết kế: Nâng cấp đồ họa Nông trại v2 theo chuẩn farming RPG (đợt 2)

Ngày: 2026-08-02
Trạng thái: đã duyệt (brainstorming)
Phạm vi: tiếp nối spec đợt 1 (2026-08-02-farm2-graphics-upgrade-design.md)

## Bối cảnh

Đợt 1 đã xong: cảnh quan 6 yếu tố (đồi, đường đất, hoa cỏ, ao, bó rơm, vườn cây), nông dân 16x16
26 khung (8 đạo cụ × A/B + đi lại + blink), phụ kiện 10 người, nháy mắt + thở, ao lấp lánh. Người
dùng muốn nâng cấp tiếp theo **ảnh mẫu farming RPG** gửi kèm: bản vẽ hiện tại đẹp nhưng chưa đủ
mật độ và chưa đủ "nông trại thật". Đã chốt ba quyết định:

1. **Phạm vi = cả 3 nhóm** (scene + farmer + animals/object), nâng cân bằng, không nhóm nào quá sâu.
2. **Cách làm = layered upgrade**, làm từng đợt nhỏ, **KHÔNG merge** — giữ trên branch
   `feat/vscode-extension` tới khi người dùng thấy ổn.
3. **Giữ sân khấu `260x176`**, không mở rộng bản đồ, không thêm file PNG, không đụng
   `office.py`/`server.py`/core.

## Mục tiêu

Biến farm2 thành **mini farming RPG 16x16**: người xem nhận ra "nông trại" ngay cả khi không có
agent — tileset giàu, crop stages rõ, nhà/chuồng/silo/giếng chi tiết, động vật + decor phân lớp.

## Ranh giới kỹ thuật (bất biến)

- **Chỉ sửa 2 file**: `aimon/static/scene-farm-v2.js`, `aimon/static/sprites-farm.js`. Không file mới.
- **Không PNG/asset ngoài** — mọi hình vẽ bằng code (`pxF` cho atlas, `px2` cho nền gốc).
- **Không sửa `office.js`, `sprites.js`, `scene-farm.js`, `scene-delivery.js`, `aimon/office.py`,
  `aimon/server.py`, CI, package.json.**
- `ROOM_W`/`ROOM_H` (`260x176`) giữ nguyên; `F2_*` hằng số bố cục giữ nguyên (luống, lối, rào,
  chỗ đứng) — chỉ thêm chi tiết **không chặn đường** agent.
- Mọi action key giữ nguyên (8 key từ `office.py`); atlas chỉ thêm khung hình mới, không thêm key
  backend. `f2FrameFor` phải rẻ, xác định, trả key có trong `FRAME_INDEX_FARM`.
- Không nét pixel nào vượt ra ngoài ô atlas (0..15) hay nền (0..175).
- `CI` hiện tại phải xanh (stationCount, MIN_STATIONS, scene registry, i18n).

## Cách thức chia đợt

Ba đợt nhỏ, mỗi đợt một commit (hoặc nhóm commit), mỗi đợt có QA riêng. Không merge. Thứ tự:

| Đợt | Nội dung | File chính |
| --- | --- | --- |
| 1 | Tileset + scene density | `scene-farm-v2.js` |
| 2 | Farmer sheet 4 hướng + pose | `sprites-farm.js` (+ `f2FrameFor`) |
| 3 | Động vật + decor/object | `scene-farm-v2.js` + `sprites-farm.js` |

## Đợt 1 — Tileset + scene density

Mục tiêu: farm RPG rõ ngay khi phòng trống. Nâng cấp `f2DrawStatic`:

1. **Cỏ có kết cấu** — thay một màu phẳng `grass` bằng lớp chấm/tuft đan xen `grass2`/
   `grassDark` (pattern chấm 2-3px rải ngẫu nhiên theo toạ độ cố định — xác định, không `Math.random`).
2. **Ruộng chia ô rõ** — mỗi luống (5 luống/dãy × 2 dãy) vẽ viền luống nổi (`soilLight`/`soilDark`),
   gờ luống, vài vết cuốc chéo nhỏ. Cây trồng (`f2DrawStation`) thêm **2-3 giai đoạn**:
   mầm xanh nhỏ / cây con / lúa vàng chín — chọn theo `st.id` (xác định, không theo thời gian,
   vẫn YAGNI "cây không lớn dần").
3. **Nhà gỗ mái xanh chi tiết hơn** — thêm ống khói, khung cửa sổ trắng, bậc thềm, móng đá.
4. **Chuồng đỏ** — thêm vách gỗ đan (ngang dọc), mái đỏ có gờ, khe thông hơi.
5. **Tháp đá + silo** — tháp giữ, thêm silo kim loại cạnh chuồng (thân bạc + nắp).
6. **Giếng** — thêm mái che giếng (2 cột + xà + mái nhỏ) hoặc vòi nước + thùng gỗ.
7. **Hàng rào** — giữ hình học cũ (không cột ở `x=0/258`, rào trên/dưới), nhưng đẹp hơn:
   ván có đường vân, chấm đinh, đầu cọc nhọn.
8. **Ao** — thêm bèo nền `#4d8438` mảng nhỏ, sỏi trắng viền bờ, giữ gợn sáng động.
9. **Decor rải khắp** — đá tảng, bụi cây, ụ rơm, cây nấm, dưa hấu, thùng gỗ, rương, biển gỗ,
   đèn lồng (tĩnh, nướng trong `f2DrawStatic`, **không** chặn lối đi/luống/chỗ đứng).

Toạ độ decor phải kiểm tra đối chiếu với lưới chuyển động (lối ngang `F2_AISLE_Y`, bờ dọc
`F2_CORRIDOR_X`, chỗ đứng `f2Stations`) — không đặt ở nơi agent/phân ambient đi qua.

## Đợt 2 — Farmer sheet

Mục tiêu: nông dân 16x16 nhìn rõ hướng + hành động hơn. Nâng cấp `sprites-farm.js`:

1. **4 hướng rõ hơn** — hiện tại mới có down/up/side (side là 1 chiều, flip khi sang trái). Thêm:
   - Khung **up** đầy đủ (đầu nhìn lên: không thấy mặt, chỉ vành nón + gáy).
   - Khung **side phải / side trái** rõ: tay trái/tay phải riêng, đạo cụ cầm đúng tay.
   `drawFarmerFarm` hiện vẽ side 1 kiểu; tách thành sideR/sideL bằng flip của tool (giống bài học
   `dfx()` ở scene-delivery).
2. **Idle/walk/run** — giữ d0..d2/u0..u2/s0..s2 nhưng chỉnh dáng: run có thân ngả tới + tay vung,
   walk thường. Không thêm khung nếu không đủ chỗ 16x16.
3. **Tool pose sắc hơn** — sửa `prop*` cho giống sheet mẫu: cuốc cán dài chéo, rìu lưỡi to rõ,
   bình tưới có vòi + giọt ở cả A lẫn B, liềm cong, cần câu có dây + phao rõ, bảng ghi + bút.
   Đạo cụ ở B (giáng) vẽ sâu xuống hơn, A (nhấc) cao hơn — tăng biên độ để 2 nhịp dễ thấy.
4. **Atlas** — nếu thêm khung up/sideR/sideL phải thêm khoá `FRAME_INDEX_FARM`; `f2FrameFor`
   (scene-farm-v2.js) đổi tương ứng. Giữ atlas < 8192 texture ngang (hiện 26 cột × 54px = 1404px;
   thêm ~6 khung ≈ 1728px vẫn an toàn).
5. **`f2FrameFor`** — đi lại vẫn để lõi chọn; chỉ thêm nhánh chọn hướng khi ngồi (hiện mặc định
   down). Ngồi làm việc giữ nhìn xuống (tư thế chính), không đổi.

## Đợt 3 — Động vật + decor/object

Mục tiêu: động vật ambient đẹp + nhiều trạng thái, phòng thêm đồ vật sống động.

1. **Bốn con vật redraw** (`drawChickenFarm/drawCowFarm/drawPigFarm/drawSheepFarm`):
   - Thân to hơn, viền rõ, màu theo ảnh mẫu.
   - **Trạng thái**: đi (chân bước), đứng yên (chân chụm), ăn (cúi đầu xuống đất), ngủ (mắt nhắm,
     thân hạ). Chọn theo `c.wait` (đứng) / `c.anim` (đi) — pattern có sẵn của core ambient.
   - Giữ chữ ký hàm `(g, pal, c, x, y)` — core `drawAmbient` gọi đúng thế.
2. **Nhiều con hơn** — `f2Ambient` thêm vài con (gà bồ câu, bê con) nếu không phá layout; vẫn kẹp
   x không chạm ao (bài học đợt 1: `12 + Math.random()*160`).
3. **Object động nhỏ** — cờ đuôi chuồng trên chuồng (2 pha, thêm vào `f2SceneSig`), khói ống khói
   nhà (2-3 vòng trắng, pha theo `OF.clock`), bọ chấm bay quanh đèn (nếu đủ đơn giản). Mỗi thứ
   đều phải nằm trong `sceneSig` để kích vẽ lại — nhớ invariant "chỉ vẽ lại khi có gì đổi".

## Đợt nào cũng phải giữ

- `f2FrameFor` rẻ + xác định; `f2SceneSig` bao hết thứ nhúc nhích không nằm trong `frameSig` lõi.
- Ambient `pick()` kẹp x không chạm ao / không vào luống.
- Không đổi `f2Stations`, `f2Route`, `f2Behave`, `bands`, `entry`/`exit`, `wanderTarget`.
- Không nét ngoài 16x16 / 260x176; không lỗi `*/` trong comment (bài học đợt 1).
- `node --check` cả 2 file; server 3.9 + CI xanh.

## Kiểm thử (mỗi đợt)

- `node --check aimon/static/sprites-farm.js && node --check aimon/static/scene-farm-v2.js`.
- `python3 -m compileall -q aimon && /usr/bin/python3 -c "import sys; sys.path.insert(0,'.'); import aimon.server"`.
- `find aimon/static -name "*.js" -exec node --check {} \;`.
- QA live (server + Playwright): pixel probe từng yếu tố mới (crop stage, silo, mái giếng, decor,
  object động), 0 lỗi console, atlas contract đủ key `f2FrameFor` phát ra.
- CI scene check vẫn đủ 4 bối cảnh + `stationCount >= MIN_STATIONS`.

## Ngoài phạm vi (YAGNI)

- Mở rộng bản đồ 260x176 (user chốt giữ).
- Ngày/đêm, thời tiết, mây động, bướm/đom đóm bay tự do (spec đợt 1 đã gác; đợt 3 chỉ làm cờ/
  khói/đom đóm tĩnh-gọn nếu rẻ).
- Cây trồng lớn dần theo thời gian (vẫn YAGNI; chỉ tĩnh theo chỗ).
- Nâng sprite lên 20x20/24x24 (user chốt giữ 16x16).
- Sửa core `office.js`/`sprites.js`/backend/CI.
- Merge — làm xong 3 đợt, user xem trước rồi mới quyết định merge.
