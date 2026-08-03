# Bối cảnh Nhà bếp — bối cảnh plugin kiểu mới (design)

Ngày: 2026-08-03
Nhánh: `feat/vscode-extension`

## Tóm tắt

Thêm bối cảnh thứ tư "Nhà bếp" cho tab Sân khấu. Chọn từ bảng chọn bối cảnh như ba nơi
còn lại, dùng bộ nhân vật mặc định (Hải trình / voyage), giữ nguyên tương tác (bấm agent →
cây tiến trình + chi tiết phiên, đổi nhân vật, header đếm người). Điểm khác biệt cốt lõi:
**code hoàn toàn khác** — không đăng ký qua interface `SCENE` cũ, tổ chức theo class plugin
kiểu mới, render và mô phỏng vận hành tự chứa, môi trường "sống" liên tục (lửa, hơi, bánh
quay), hành vi agent đa bước và động tác nhiều khung hình.

## Kiến trúc: cơ chế plugin hai tầng (scene cổ + scene-plugin)

### Scene cũ (không đổi)

- `registerScene(sc)` → mảng `SCENES`, bộ field phẳng cố định (`stations`, `behave`,
  `frameFor`, `route`, ...). Farm / Delivery / Office giữ nguyên.

### Scene-plugin mới (kitchen)

- Đăng ký qua hàm **mới** `registerKitchenKind(kind)`, **không** qua `registerScene`.
- Lõi `office.js` giữ bảng `SCENE_KINDS = { id -> { boot, tick, draw, hitTest, dispose } }`.
- Lõi nhận diện theo `scene.kind === 'kitchen'`. Mọi hook gọi qua một cổng — lõi không biết
  bên trong làm gì, chỉ bắn 5 sự kiện: `boot`, `tick`, `draw`, `hitTest`, `dispose`.
- Không tái dùng hàm vẽ lõi của farm/delivery. Kitchen có system riêng.

### Đổi trong `office.js`

- `SCENE_ORDER` = `['office', 'farm', 'delivery', 'kitchen']`.
- `SCENE_LAZY` thêm `{ id: 'kitchen', src: '/static/scene-kitchen.js' }`.
- `setScene()`, vòng `tick()`, `drawFrame()`, xử lý hover kiểm nhánh "kitchen" và chuyển cho
  plugin.
- Tương tác bấm → detail panel giữ nguyên: khi bấm router lấy agent từ snapshot, không đụng
  tới vẽ.

### Tổ chức file

- `aimon/static/scene-kitchen.js` — plugin (class + draw + logic), nạp lười như farm/delivery.
- `office.js` — cơ chế plugin + nhánh đăng ký id mới.
- `config_file.py` → `OFFICE_SCENES` thêm `'kitchen'`.
- `vscode-extension/package.json` → enum `aimon.officeScene` thêm `'kitchen'`.
- i18n cả hai ngôn ngữ: nhãn scene, nhãn trạm, chú giải động tác.

## Vòng vận hành & 10 trạm

- Mỗi agent (tiến trình AI thật) = 1 đầu bếp, sở hữu **đúng 1 trạm**, ổn định suốt phiên.
- Rảnh quá `WANDER_AFTER` (90s) đi vòng giữa bếp; tắt → ra cửa; xong việc ăn mừng ngay tại
  trạm mình.
- `stationCount = 10`, bằng `MAX_AGENTS`.

| # | Trạm | Việc chính |
|---|------|-----------|
| 1 | Bếp ga | xào, lật, chảo bay lửa |
| 2 | Bàn cắt | thái, băm (dao đa khung) |
| 3 | Chậu rửa | rửa rau, vò |
| 4 | Lò nướng | mở lò, lấy khay, nóng đỏ |
| 5 | Nồi hấp | hấp, xả hơi |
| 6 | Bàn bày đĩa | cầm đĩa, đặt món |
| 7 | Kệ gia vị | rắc, nếm, cầm chai |
| 8 | Bàn bột | nhồi, lăn, cán |
| 9 | Quầy giao | chuyển món ra cửa |
| 10 | Kho lạnh | lấy, kiểm, đóng tủ |

Bố cục phòng: giữ `ROOM_W` / `ROOM_H` để nướng nền + hit-test. Hai khu: dãy chế biến (trạm
1-5) + dãy phụ & giao (trạm 6-10), lối đi ở giữa. Cổng vào/ra chỉ qua lối trung tâm, không
cắt qua khu nóng.

## Render & môi trường "sống"

- **Lớp nền nướng** (tĩnh, nướng 1 lần như các scene): tường bếp, sàn gạch, mặt bàn —
  vẫn 1 `drawImage`.
- **Lớp động** vẽ lại mỗi khung bằng đồ họa riêng của kitchen (không dùng sprite atlas
  thường cho đạo cụ): lửa, hơi, khói, bánh quay.
- **Môi trường "sống" liên tục:**
  - Bếp ga: lửa bập bùng (ngọn dao động, nhấp nháy cam/đỏ), người nấu thì lửa to.
  - Nồi hấp/luộc: hơi bốc theo nhịp.
  - Lò nướng: cửa kính đỏ khi nóng, bánh quay chậm, mở cửa xạ luồng hơi.
  - Indicator "món đang hoàn thiện" theo thời gian agent gõ.
- **Hành vi đa bước:** agent vào → rời bàn đi lấy nguyên liệu ở Kho lạnh / kệ gia vị → về
  trạm mình → chế biến → dọn. Không chỉ nhịp tại chỗ.
- **Động tác nhiều khung:** dao, chảo, thìa khuấy, tay nhồi bột có chuỗi khung riêng; agent
  xoay/cúi/giơ.
- **Hiệu năng:** có chuyển động liên tục nên khi kitchen chạy, **tắt tối ưu `frameSig` 5fps**
  — vẽ đều ~60fps. Nền vẫn là `bakeBackground` 1 lần; vùng lửa/hơi/bánh vẽ vật thể nhỏ, không
  nướng lại toàn phòng.

## Đăng ký hệ thống & i18n

- 6 chỗ phải khớp (như cấu trúc sẵn có): `SCENE_ORDER`, `SCENE_LAZY`,
  `registerKitchenKind` (không phải `registerScene`), `OFFICE_SCENES`, `enum`
  `aimon.officeScene`, i18n cả hai ngôn ngữ (scene + trạm + chú giải động tác).
- `labelColor` / bóng tự suy theo độ sáng nền gạch bếp (như farm làm với cỏ).
- `snap: true` vì đạo cụ bám tay (dao/chảo cùng toạ độ đã làm tròn).

## Testing

- Chạy trước commit: `python3 -m compileall -q aimon`;
  `find aimon/static -name "*.js" -exec node --check {} \;` (scene-kitchen.js phải lọt).
- CI: `station_count >= MIN_STATIONS (10)` và bằng `MAX_AGENTS`; mỗi `SCENE_LAZY` path trỏ
  file thật; enum `OFFICE_SCENES` + `package.json` + i18n cả 2 ngôn ngữ có `kitchen`.

### Smoke thủ công

1. Mở Sân khấu → bảng chọn thấy **Nhà bếp**; bấm vào thấy lửa/hơi/bánh quay.
2. Có agent chạy → ngồi đúng 1 trạm, đi lấy nguyên liệu ở Kho lạnh rồi về.
3. Bấm agent → detail panel mở cây tiến trình + chi tiết phiên; `?view=office` cửa sổ nổi vẫn
   bấm mở lại được.
4. Đổi nhân vật được; nền 1 kiểu duy nhất. Khi bối cảnh nằm im vẫn có động.
5. Kiểm hiệu năng: 60fps không rung, nền không nướng lại từng khung.

## Giới hạn (không làm)

- Không đụng DNS rebinding / auth của server.
- Không thêm dependency, chỉ stdlib (Python 3.9), frontend không thư viện ngoài, không build.