# Farmer Sprite từ ảnh PNG

**Ngày:** 2026-08-03
**Trạng thái:** Approved
**Phạm vi:** Nâng cấp sprite nông dân farm-v2 từ code vẽ (pxF) sang ảnh PNG sprite sheet

## Background

Hệ sprites-farm.js hiện tại vẽ 10 nông dân × 27 frame bằng code `pxF()` (hàm chấm pixel có nhân hệ số SPRITE_SS_FARM=4). Mỗi nhân vật được programme bằng các hàm `farmLegs()`, `farmBody()`, `farmHead()`, `farmArm()`, `farmAcc()` và các `propXxx()` cho đạo cụ.

Người dùng muốn nâng cấp đồ họa theo style Stardew Valley, dùng ảnh sprite sheet PNG thật thay vì code vẽ. Mỗi nông dân sẽ có 1 file PNG 192×192 (12 cột × 4 hàng, mỗi ô 16×16) chứa sẵn 48 frame.

## Quyết định

- **10 sprite sheet riêng** — mỗi nông dân 1 file PNG, màu sắc tô sẵn theo `FARMER_CHARS`
- **Cắt từ screenshot tham khảo** — dùng ảnh người dùng gửi làm template, recolor cho10 nhân vật
- **Giữ nguyên API** — `cell(charIndex, frameKey)` giữ nguyên, chỉ đổi lookup table

## Cấu trúc file mới

```
static/farm-sprites/
  farmer0.png   Farmhand  (hat: #d9b26a, shirt: #4a90d9, pants: #2f4a6b)
  farmer1.png   Farmer    (hat: #c9a052, shirt: #e05a4e, pants: #3d3a50)
  farmer2.png   Plowman   (hat: #e0c080, shirt: #6aa84f, pants: #4a3d2b)
  farmer3.png   Tender    (hat: #b8904a, shirt: #f0a84f, pants: #37474f)
  farmer4.png   Reaper    (hat: #d9b26a, shirt: #9b59b6, pants: #2c3e50)
  farmer5.png   Waterer   (hat: #c9a052, shirt: #4fb3c7, pants: #4e342e)
  farmer6.png   Logger    (hat: #e0c080, shirt: #8d6e63, pants: #263238)
  farmer7.png   Angler    (hat: #b8904a, shirt: #e8c547, pants: #455a64)
  farmer8.png   Grower    (hat: #d9b26a, shirt: #7cb342, pants: #5d4037)
  farmer9.png   Harvester (hat: #c9a052, shirt: #ec407a, pants: #3e2723)
```

## Layout sprite sheet

192×192 pixel, 12 cột × 4 hàng:

| | IDLE | WALK1 | WALK2 | HOE | WATER | PLANT | HARVEST | AXE | PICKAXE | FISH | INTERACT | CARRY |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DOWN | [0,0] | [1,0] | [2,0] | [3,0] | [4,0] | [5,0] | [6,0] | [7,0] | [8,0] | [9,0] | [10,0] | [11,0] |
| LEFT | [0,1] | [1,1] | [2,1] | [3,1] | [4,1] | [5,1] | [6,1] | [7,1] | [8,1] | [9,1] | [10,1] | [11,1] |
| RIGHT | [0,2] | [1,2] | [2,2] | [3,2] | [4,2] | [5,2] | [6,2] | [7,2] | [8,2] | [9,2] | [10,2] | [11,2] |
| UP | [0,3] | [1,3] | [2,3] | [3,3] | [4,3] | [5,3] | [6,3] | [7,3] | [8,3] | [9,3] | [10,3] | [11,3] |

## Frame key mapping

Frame key mới thay thế hệ `d0/d1/d2/u0..s2/hoeA..carryB`:

```js
const FARM_FRAME_KEYS_V2 = [
  // DOWN (row 0)
  'd_idle', 'd_walk1', 'd_walk2', 'd_hoe', 'd_water', 'd_plant',
  'd_harvest', 'd_axe', 'd_pickaxe', 'd_fish', 'd_interact', 'd_carry',
  // LEFT (row 1)
  'l_idle', 'l_walk1', 'l_walk2', 'l_hoe', 'l_water', 'l_plant',
  'l_harvest', 'l_axe', 'l_pickaxe', 'l_fish', 'l_interact', 'l_carry',
  // RIGHT (row 2)
  'r_idle', 'r_walk1', 'r_walk2', 'r_hoe', 'r_water', 'r_plant',
  'r_harvest', 'r_axe', 'r_pickaxe', 'r_fish', 'r_interact', 'r_carry',
  // UP (row 3)
  'u_idle', 'u_walk1', 'u_walk2', 'u_hoe', 'u_water', 'u_plant',
  'u_harvest', 'u_axe', 'u_pickaxe', 'u_fish', 'u_interact', 'u_carry',
];
```

Lookup table cho scene-farm-v2.js:

```js
const LEGACY_TO_V2 = {
  d0: 'd_idle', d1: 'd_walk1', d2: 'd_walk2',
  u0: 'u_idle', u1: 'u_walk1', u2: 'u_walk2',
  s0: 'r_idle', s1: 'r_walk1', s2: 'r_walk2',  // side = right
  hoeA: 'r_hoe', hoeB: 'r_hoe',      //道具 dùng pose A hoặc B
  plantA: 'r_plant', plantB: 'r_plant',
  harvestA: 'r_harvest', harvestB: 'r_harvest',
  axeA: 'r_axe', axeB: 'r_axe',
  waterA: 'r_water', waterB: 'r_water',
  fishA: 'r_fish', fishB: 'r_fish',
  interactA: 'r_interact', interactB: 'r_interact',
  carryA: 'r_carry', carryB: 'r_carry',
  blink: 'd_idle',  // blink = mắt nhắm, dùng frame d_idle với overlay mắt đóng
  kUp: 'u_idle',    // kUp = ngồi nhìn lên, dùng frame u_idle + overlay ngồi
};
```

## Thay đổi sprites-farm.js

### BỎ
- `drawFarmerFarm()` — hàm vẽ nông dân từ code
- `farmLegs()` — vẽ chân
- `farmBody()` — vẽ thân áo
- `farmHead()` — vẽ đầu + nón
- `farmArm()` — vẽ cánh tay
- `farmAcc()` — vẽ phụ kiện phân biệt
- Tất cả `propXxx()` — vẽ đạo cụ (hoe, plant, harvest, axe, water, fish, interact, carry)

### GIỮ
- `pxF()`, `roundBoxF()`, `spikeF()`, `eyeF()` — dùng cho động vật nền
- `drawChickenCell()`, `drawCowCell()`, `drawPigCell()`, `drawSheepCell()` — giữ nguyên
- `FARMER_CHARS` — giữ nguyên định nghĩa 10 nhân vật
- `ANIMAL_SPECIES`, `ANIMAL_TONES`, `FARM_ANIMAL_CELL` — giữ nguyên

### THÊM
1. **`FARM_SPRITE_SHEETS`** — `Map<number, ImageBitmap>` cache đã load
2. **`loadFarmSprites()`** — load PNG vào ImageBitmap:
   ```js
   async function loadFarmSprites() {
     const loads = FARMER_CHARS.map(async (c, i) => {
       const url = `static/farm-sprites/farmer${i}.png?t=${Date.now()}`;
       const resp = await fetch(url);
       const blob = await resp.blob();
       FARM_SPRITE_SHEETS.set(i, await createImageBitmap(blob));
     });
     await Promise.all(loads);
   }
   ```
3. **`buildAtlas_farm_v2(want)`** — nướng atlas từ PNG:
   - Load sprites trước nếu chưa có
   - Với mỗi farmer trong `want`: cắt 48 ô 16×16 từ PNG, paste vào atlas
   - Áp `finishCell()` cho viền
   - Trả về object có `cell()`, `covers()`, `canvas` — API giống `buildAtlas_farm()`

## Thay đổi scene-farm-v2.js

- Map frame key cũ → mới qua `LEGACY_TO_V2`
- `charIndexFor(id)` giữ nguyên
- `cell(charIndex, frameKey)` — lookup qua bảng map mới
- `step()` gọi frame key mới: `'d_walk1'` thay vì `'d1'`

## Script recolor

`scripts/recolor-farmer.js` (Node.js + canvas):
1. Load screenshot tham khảo
2. Detect grid: tìm offset mép trên/trái, khoảng cách giữa các ô
3. Cắt 48 frame 16×16
4. Grid detection: screenshot có label text ở mép trên/trái, cần detect offset bằng cách tìm hàng pixel đầu tiên có màu khác nền (beige/white). Khoảng cách giữa các ô = 16px, có thể có gap nhỏ giữa các frame.
4. Với mỗi farmer, thay màu pixel:
   - Nón: `#d9b26a` → `c.hat`
   - Áo: `#e05a4e` → `c.shirt`
   - Quần: `#2f4a6b` → `c.pants`
   - Boots: giữ nâu tối
   - Da, tóc, đạo cụ kim loại/gỗ: giữ nguyên
5. Export PNG 192×192

## Packaging

| Kênh | Thay đổi |
|---|---|
| macOS app | Thêm `farm-sprites/` vào `Contents/Resources/aimon/static/` |
| Windows .exe | PyInstaller `--add-data static/farm-sprites;static/farm-sprites` |
| VSCode ext | `copy-aimon.js` thêm `farm-sprites/` vào danh sách copy |

## Hiệu năng

- 10 PNG × ~100KB = ~1MB total
- Atlas nướng 1 lần khi mở tab, cache ImageBitmap
- `frameSig()` cần thêm hash farm-sprites để invalidate khi đổi PNG
-动物 vẫn dùng code vẽ (pxF), không thay đổi

## Xử lý frame đặc biệt

**Blink (mắt nhắm):** Sprite sheet tham khảo không có frame blink. Giải pháp:
- Dùng frame `d_idle` làm base
- Overlay mắt đóng (2 nét ngang) lên vị trí mắt bằng code khi render
- Không cần thêm frame vào PNG, tiết kiệm không gian

**kUp (ngồi nhìn lên):** Sprite sheet tham khảo không có frame ngồi. Giải pháp:
- Dùng frame `u_idle` làm base
- Overlay hiệu ứng ngồi (thân hạ xuống, chân co lại) bằng code khi render
- Giữ nguyên logic `drawFarmerFarm` cho trường hợp kUp, chỉ bỏ các frame khác

**Hướng LEFT/RIGHT:** Sprite sheet có cả LEFT và RIGHT riêng, không cần flip.
- `s0/s1/s2` (side) map sang `r_idle/r_walk1/r_walk2`
- Khi nhân vật đi sang trái, dùng frame LEFT thay vì flip canvas

## Testing

1. Mở tab Nông trại → thấy 10 nông dân với sprite mới
2. Click nhân vật → thấy đủ 4 hướng, 12 hành động
3. Đổi phòng → sprite vẫn đúng
4. Đổi theme sáng/tối → sprite vẫn đọc được
5.动物 vẫn hoạt động bình thường
6. `compileall` pass, JS syntax check pass
7. CI: check `static/farm-sprites/` tồn tại trong package
