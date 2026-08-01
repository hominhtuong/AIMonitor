# Thiết kế: Bối cảnh Nông trại v2 — hệ nhân vật 16x16 độc lập

Ngày: 2026-08-02
Trạng thái: đã duyệt (brainstorming)

## Bối cảnh

AI Monitor có khung nhìn Văn phòng (`office.js`) với ba bối cảnh (scene): Văn phòng,
Nông trại (`scene-farm.js`), Shipper (`scene-delivery.js`). Mọi bối cảnh hiện tại dùng
chung **một** hệ nhân vật pixel **16x20** (`sprites.js`), cùng một atlas duy nhất do
`office.js` quản lý.

Người dùng đã tự thiết kế một **bộ pixel art nông trại 16x16** hoàn chỉnh: nhân vật nông
dân (12 trạng thái), tileset địa hình, nhà/chuồng/tháp/giếng, động vật (gà/bò/lợn/cừu),
cây trồng 7 giai đoạn, đạo cụ, UI icons, và một ảnh mẫu "FARM SCENE". Yêu cầu: đưa art này
vào làm một **bối cảnh mới hoàn toàn độc lập**, **giữ nguyên 16x16**, **không sửa code cũ**
(`sprites.js`, `scene-farm.js`, `scene-delivery.js`).

**Giải thích rõ phạm vi "không sửa code cũ":** nghĩa là không đụng vào `sprites.js` và ba
file bối cảnh hiện có. `office.js` (lõi dùng chung) **bắt buộc phải đụng tối thiểu** vì hệ
scene, atlas và vòng vẽ đều nằm ở đó — bối cảnh mới không thể đăng ký vào hệ mà không sửa
hệ. Mọi thay đổi ở `office.js` là thêm (không viết đè nhánh cũ), và được liệt kê đầy đủ ở
mục "Tích hợp vào office.js".

## Mục tiêu

- Thêm bối cảnh "Nông trại v2" (`scene-farm-v2.js`) chạy trên **hệ nhân vật 16x16 riêng**
  (`sprites-farm.js`), fork từ `sprites.js`.

> **ID scene là `farm2`, không phải `farm-v2`.** CI (build-vscode.yml) bắt id bối cảnh bằng
> regex `\w+`, không nhận gạch ngang. `farm-v2` sẽ lặng lẽ biến mất khỏi mọi bảng kiểm.
> Tên hiển thị ("Nông trại v2") qua i18n thì có gạch ngang thoải mái.
- Bối cảnh mới vẽ **đúng art 16x16 của người dùng** (bố cục cắt từ ảnh mẫu FARM SCENE).
- Không thay đổi hành vi của ba bối cảnh cũ.
- Không sửa `sprites.js`, `scene-farm.js`, `scene-delivery.js`, `aimon/office.py`,
  `aimon/server.py`.

## Các quyết định đã duyệt

| Chủ đề | Quyết định |
| --- | --- |
| Kích thước | Giữ nguyên 16x16, không scale lên 16x20 |
| Phạm vi | Chỉ nông dân làm việc (mỗi agent = 1 nông dân); động vật chỉ là ambient đi lại ngẫu nhiên, KHÔNG gắn với agent |
| Cây trồng | Không phát triển theo thời gian (để sau) |
| Kiến trúc | Fork `sprites.js` → `sprites-farm.js` (hệ 16x16 tách bạch), scene mới ở `scene-farm-v2.js` |
| Ánh xạ tool → vai | Edit→HOE, Write→PLANT, Read/Grep→HARVEST, Bash→AXE, Task→INTERACT, MCP/Browser→FISHING, Rảnh/khác→WATER |
| Bố cục | Cắt vùng trung tâm của ảnh mẫu FARM SCENE (nhà gỗ mái xanh + chuồng đỏ + tháp + 2 luống lớn), vừa 260x176, đủ 10 chỗ |

## Kiến trúc

### File mới

```
aimon/static/sprites-farm.js     hệ vẽ nhân vật/động vật 16x16, fork từ sprites.js
aimon/static/scene-farm-v2.js    bối cảnh Nông trại v2, đăng ký qua registerScene()
```

Cả hai load sau `office.js` (thêm `<script>` trong `index.html`). `scene-farm-v2.js` phụ
thuộc một chiều: gọi `registerScene()` và các hàm vẽ dùng chung của `office.js`.

### sprites-farm.js — tránh xung đột tên

Mọi hằng số/hàm có hậu tố hoặc tên riêng, không trùng với `sprites.js`:

```javascript
const SPRITE_W_FARM = 16;
const SPRITE_H_FARM = 16;
const SPRITE_SS_FARM = 3;        // giữ lưới con như sprites.js

const FARMER_CHARS = [ ... ];    // 10 nông dân, mỗi người khác màu mũ/áo/quần
const AMBIENT_FARM_CHARS = { chicken, cow, pig, sheep };
const FRAME_INDEX_FARM = { d0,d1,d2, u0,u1,u2, s0,s1,s2, hoe,plant,harvest,axe,water,fish,interact,carry };

function px_farm(g, x, y, w, h, color) { ... }
function roundBox_farm(...) { ... }
function buildAtlas_farm(...) { ... }        // atlas 16x16 riêng
```

- Nông dân vẽ từ `y=0` (mũ) tới `y=15` (giày). Căn đáy: khi `drawEntity` vẽ, đáy khung
  chạm sàn như mọi bộ khác.
- Động vật ambient vẽ gọn trong 16x16, chỉ cần khung `idle/walk1/walk2` (không cần 6
  trạng thái sản xuất như trong art).

### scene-farm-v2.js — bối cảnh

Đăng ký vào `SCENES` qua `registerScene()` với đầy đủ khoá mà `office.js` yêu cầu (xem
mục "Sáu bất biến" trong `office.js` và cấu trúc `scene-farm.js`):

```javascript
registerScene({
  id: 'farm-v2',
  stationCount: 10,
  snap: true,              // có đạo cụ bám nhân vật
  legendSuffix: 'farm-v2',

  stations: farmV2Stations,      // 10 chỗ: 2 luống x 5
  seatOf: ...,
  route: farmV2Route,            // lối ngang, đi thẳng (không có ghế che)
  behave: farmV2Behave,
  stepScene: farmV2Step,
  entry: ...,
  exit: ...,
  wanderTarget: ...,
  bands: ...,
  labelColor: ...,
  shadowFor: () => true,
  frameFor: farmV2FrameFor,      // chọn frame 16x16 theo role
  drawStatic: drawFarmV2Background,
  drawPreviewExtras: ...,
  drawStation: ...,
  drawOver: farmV2Over,          // đạo cụ vẽ sau nhân vật (cuốc, rìu, liềm...)
  ambient: farmV2Ambient,        // gà/bò/lợn/cừu đi lại ngẫu nhiên
  sceneSig: ...,
});
```

#### Bố cục (toạ độ pixel gốc, ROOM_W=260, ROOM_H=176)

Cắt vùng trung tâm ảnh mẫu FARM SCENE:

```
y 0..55    vùng trang trí trên: nhà gỗ mái xanh (trái), chuồng đỏ + tháp (phải), cây, cột đèn
y ~55      lối ngang trên
y ~75      luống 1 (đất + cây trồng trang trí) — 5 chỗ, x 40..160
y ~108     lối ngang giữa
y ~115     luống 2 — 5 chỗ
y ~160     lối ngang dưới
viền       hàng rào gỗ bao quanh
```

10 chỗ = 2 luống × 5 người, mỗi agent đứng trước luống của mình, cách nhau ~30 pixel.

#### Ánh xạ tool → frame (máy nông dân)

```javascript
const FARM_V2_ROLE_MAP = {
  type: 'hoe', write: 'plant', read: 'harvest', grep: 'harvest',
  run: 'axe', delegate: 'interact', mcp: 'fish', web: 'fish',
  plan: 'water', work: 'water', rest: 'water',
};
```

`farmV2FrameFor(e)`:
- `e.cheer > 0` → đảo khung `d1/d2` (ăn mừng)
- đang đi (`e.path.length`) → trả `null` (lõi tự lo khung đi bộ `d*/u*/s*`)
- ngược lại → frame theo `FARM_V2_ROLE_MAP[currentAction(e)]` (mặc định `'water'`)

#### Động vật ambient

4 con (gà, bò, lợn, cừu) đi lại ngẫu nhiên trong khoảng giữa phòng, tránh đè lên luống
và agent — logic giống `scene-farm.js` hiện tại (`FARM_LANE`).

## Tích hợp vào office.js (bắt buộc, tối thiểu)

Bối cảnh mới dùng **atlas 16x16 riêng**. Hai chỗ trong `office.js` phải biết điều này:

1. **Dựng atlas**: `ensureAtlas()`/`buildSpriteAtlas` đang xây một atlas từ `sprites.js`.
   Thêm `OF.atlasFarm` (xây bằng `buildAtlas_farm`), chỉ khi `typeof buildAtlas_farm !==
   'undefined'`. Giữ nguyên atlas 16x20 cho ba bối cảnh cũ.
2. **`drawEntity`**: `info.ey` là đường CHÂN (baseline), sprite vươn lên từ đó — nông dân
   16x16 vẫn đứng chạm đất đúng chỗ. Nhưng hàm này dùng hằng số toàn cục `SPRITE_W/H/SS`
   ở **ba** chỗ (bóng `g.ellipse(..., SPRITE_W/2, SPRITE_H-0.6 ...)`, phép translate của
   `small`/`flip`, và `dw = sw / SPRITE_SS`). Vì vậy nhánh farm phải thay cả atlas lẫn ba
   hằng số:
   ```javascript
   const farm = (CS().id === 'farm-v2');
   const atlas = farm ? OF.atlasFarm : OF.atlas;
   const SW = farm ? SPRITE_W_FARM : SPRITE_W;
   const SH = farm ? SPRITE_H_FARM : SPRITE_H;
   const SS = farm ? SPRITE_SS_FARM : SPRITE_SS;
   const [sx, sy, sw, sh] = atlas.cell(e.charIndex, info.frame);
   const dw = sw / SS, dh = sh / SS;
   // ... thay SPRITE_W -> SW, SPRITE_H -> SH, SPRITE_SS -> SS trong thân hàm
   ```
   `charIndex` của agent trong scene farm-v2 trỏ vào `FARMER_CHARS` (index theo chỗ,
   station index % 10).

Các thay đổi khác:
- `index.html`: thêm 2 thẻ `<script>` sau `office.js`:
  ```html
  <script src="/static/sprites-farm.js"></script>
  <script src="/static/scene-farm-v2.js"></script>
  ```
- `office.js`:
  - `SCENE_ORDER`: thêm `'farm-v2'`
  - `SCENE_LAZY`: thêm `{ id: 'farm-v2', src: '/static/scene-farm-v2.js' }`
  - `OF`: thêm `atlasFarm: null`
  - `drawEntity`: nhánh chọn atlas (trên)
- `i18n.js`: nhãn `office.scene_farm-v2` (vi/en), và 10 tên nông dân nếu hiện trong bảng
  chọn nhân vật (không bắt buộc ở phạm vi này).

### Ràng buộc CI (build-vscode.yml)

CI soát danh sách scene bằng regex trên `aimon/static/scene-*.js` và `office.js`. Phải
đồng bộ ở **bốn chỗ** (đúng như CLAUDE.md đã ghi cho danh sách scene):

| Nơi | Giá trị |
| --- | --- |
| `registerScene` trong `scene-farm-v2.js` | `id: 'farm-v2'`, `stationCount: 10` |
| `SCENE_ORDER` trong `office.js` | chứa `'farm-v2'` |
| `SCENE_LAZY` trong `office.js` | chứa `'farm-v2'` → file có thật |
| `OFFICE_SCENES` trong `aimon/config_file.py` | thêm `"farm-v2"` |
| enum `aimon.officeScene` trong `vscode-extension/package.json` | thêm `"farm-v2"` |
| i18n `office.scene_farm-v2` | có ở cả vi và en |

**Lưu ý:** `sprites-farm.js` KHÔNG khớp glob `scene-*.js` nên CI không nhầm nó thành một
bối cảnh. File này nằm trong `aimon/static/` nên `copy-aimon.js` tự đóng gói vào extension.

## Không làm (YAGNI)

- Không cho cây trồng phát triển theo thời gian.
- Không gắn động vật với agent (cho ăn, vắt sữa...).
- Không thêm bộ nhân vật 16x16 vào bảng chọn dùng chung cho các bối cảnh 16x20 — hệ mới
  chỉ sống trong `farm-v2`.
- Không xử lý tile động vật 6 trạng thái sản xuất; chỉ dùng idle/walk.

## Lỗi đã trả giá — phải giữ

Từ `office.js`/`scene-farm.js`/`sprites.js`:

- `stations()` trả đủ `>= MIN_STATIONS` (10) chỗ, và `stationCount` khai đúng 10.
- Mỗi agent sở hữu đúng MỘT chỗ, ổn định suốt phiên; chỗ chỉ nhả khi agent ra khỏi khung.
- `behave()` không đụng `path/goal/mode` của người đang `leaving`.
- Lối đi không cắt qua thứ vẽ SAU nhân vật. Nông trại v2 không có lớp vẽ sau (nhà/chuồng
  nằm trong nền đã nướng), nên đi thẳng là được — nhưng **đạo cụ vẽ sau nhân vật qua
  `drawOver`** phải bám `info.x`/`info.ey` đã làm tròn (`snap: true`).
- Mọi trạng thái ảnh hưởng tới hình phải có trong `sceneSig()` (vd tiến độ cây — hiện
  không dùng).
- Canvas nằm ngoài vùng `morph()` quản lý (đã đúng, không động tới).
- Trạng thái "đang ở đâu" theo ĐÍCH vừa tới (`e.goal`), không theo việc sở hữu chỗ.

## Kiểm tra

1. `python3 -m compileall -q aimon` (cú pháp Python — config_file.py có sửa)
2. `/usr/bin/python3 -c "import sys; sys.path.insert(0,'.'); import aimon.server"` (3.9 compat)
3. `find aimon/static -name "*.js" -exec node --check {} \;`
4. CI scene validation (chạy thủ công đoạn regex trong build-vscode.yml, hoặc chạy workflow)
5. Mở dashboard: chuyển sang scene `farm-v2` — nông dân 16x16 làm việc trên luống, động
   vật ambient đi lại; quay lại `office`/`farm`/`delivery` — mọi thứ y hệt trước.
6. Không có lỗi console khi chỉ mở `office` (sprites-farm.js load nhưng không dùng).

## Phạm vi triển khai

Bước đầu tiên làm đúng mục tiêu tối thiểu: scene mới chạy được, nông dân làm việc, động
vật ambient, không vỡ ba scene cũ. Các nâng cấp (cây trồng lớn dần, tương tác động vật)
nằm ngoài spec này.
