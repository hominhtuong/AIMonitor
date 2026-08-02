# Spec: Nông trại sống — môi trường thời gian + mưa

Spec A của nhóm "làm hết" (A → B → C). Chỉ sửa `aimon/static/scene-farm-v2.js`.
**Không đổi `office.js`** — mọi thứ nằm trong hook bối cảnh đã có
(`drawStatic`, `drawAnimated`, `sceneSig`, `ambient`).

## Bối cảnh

- Nông trại farm2 là nền nướng tĩnh (260x176), agent là nhân vật 16x16.
- Thứ tự vẽ của lõi: `nền nướng → drawAnimated → station/cây → agent → ambient → confetti`.
  Nên mọi thứ vẽ trong `f2DrawAnimated` nằm **dưới agent** → người luôn sáng rõ dù trời tối.
- Nền nướng cache theo key `scene|room|pal.floor|pal.wall` — KHÔNG đổi theo giờ.
  Vì vậy trời/đồi tối phải làm bằng **overlay** trong `drawAnimated`, không nướng lại.
- `OF.ents` truy cập được từ scene file. `currentAction(e)` (global trong office.js):
  trả `d.action` khi `d.state === 'busy'`, còn không là `'rest'`.

## Quyết định đã chốt (hỏi user)

| Câu hỏi | Chốt |
| --- | --- |
| Nguồn giờ | Giờ máy thật `new Date()` |
| Mùa / mưa | Mưa ngẫu nhiên, mỗi vài phút có thể mưa hoặc không, bất kể tháng |
| Đèn nhà | Bật khi có ≥1 agent đang `busy` (tool đang chạy), bất kể giờ |
| Mức tối | Tối vừa: trời+đồi tối hẳn + lớp màn tối mỏng phủ phòng, vẫn thấy người rõ |
| Mưa tương tác | Có: ao lấp lánh nhiều hơn, đom đóm tắt, cờ hết phất, khói ít hơn |
| Cửa chuồng | Cố định giờ: mở 6h, đóng 18h |
| Chim | Cả hai: đàn nhỏ bay ngang + bồ câu bay lên |
| Mây | Nhiều đám trôi liên tục, lặp vòng |

## Kiến trúc

### 1. Module thời gian + mưa (đầu file)

```js
const F2_HOUR = () => {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
};

/* 0..1 — 1 = ban ngày đầy đủ, 0 = đêm. Chuyển tiếp tuyến tính:
 * 6h→8h sáng dần, 17h→19h tối dần. Ngoài hai khoảng này đêm = 0, ngày = 1. */
function f2Bright() {
  const h = F2_HOUR();
  if (h >= 6 && h < 8) return (h - 6) / 2;
  if (h >= 17 && h < 19) return 1 - (h - 17) / 2;
  if (h >= 8 && h < 17) return 1;
  return 0;
}

/* Mưa ngẫu nhiên: mỗi F2_RAIN_ROLL giây roll một lần, 40% bắt mưa 20-45 giây.
 * Timer dùng OF.clock nên deterministic theo phiên. */
const F2_RAIN_ROLL = 90 + Math.floor(Math.random() * 90); // 90..180s
function f2Rain() {
  if (F2_WEATHER.raining) {
    if (OF.clock >= F2_WEATHER.until) { F2_WEATHER.raining = false; F2_WEATHER.nextRoll = OF.clock + F2_RAIN_ROLL; }
    return true;
  }
  if (OF.clock >= F2_WEATHER.nextRoll) {
    if (Math.random() < 0.4) { F2_WEATHER.raining = true; F2_WEATHER.until = OF.clock + 20 + Math.random() * 25; }
    else F2_WEATHER.nextRoll = OF.clock + F2_RAIN_ROLL;
  }
  return F2_WEATHER.raining;
}
const F2_WEATHER = { raining: false, until: 0, nextRoll: 0 };
```

### 2. Có agent đang làm việc?

```js
function f2AnyBusy() {
  for (const e of OF.ents.values()) {
    if (e.kind === 'agent' && !e.leaving && currentAction(e) !== 'rest') return true;
  }
  return false;
}
```

### 3. `f2DrawStatic` — chuồng nướng bản "cửa mở"

Sửa `drawF2Coop`: bỏ tấm cửa kín, thay bằng khung + lỗ tối (nhìn thấy bên trong):

```js
// Cửa mở (nướng): khung gỗ + lỗ tối bên trong. Tấm cửa đóng vẽ động ở f2DrawAnimated.
px2(g, x + 12, y + 14, 6, 12, f.woodDark);          // khung cửa
px2(g, x + 13, y + 15, 4, 10, f.dark);              // lỗ mở — bên trong chuồng tối
```

### 4. `f2DrawAnimated` — phần mới

Thứ tự vẽ trong hàm (sau các mảng ao/cờ/khói/đom đóm hiện có):

1. **Mây**: 3 đám trôi. Vị trí `x = (b + floor(OF.clock*0.5)) % (ROOM_W+40) - 20`, y 6/10/14.
   Vẽ sau nền (trên đồi), dưới agent. Hình: `px2` 2 dải trắng bo nhẹ, alpha thấp.

2. **Chim**:
   - Đàn 4 chấm nhỏ bay ngang: x trôi như mây, y dao động 8-20 theo phase, cánh đập = 2 khung.
   - Bồ câu: dùng `drawChickenFarm(g, bx, by, '#f5efe0', flip)` ở vị trí động — chu kỳ
     ~30s: bay từ chuồng (x~200,y~50) lên nóc nhà (x~35,y~18) rồi về. Vẽ sau mây.

3. **Overlay tối** (SAU mây/chim — để mây/chim cũng tối theo trời):
   - Toàn phòng: `g.fillStyle` alpha `(1-bright)*0.35`, `fillRect(0,0,ROOM_W,ROOM_H)`
   - Vùng trời (y<40): alpha `(1-bright)*0.15` thêm

4. **Mưa** (SAU overlay — nét nước phải thấy rõ trên nền tối):
   - 8 nét `px2` chéo (x trôi theo phase, y rơi), màu `rgba(200,220,235,0.5)`.

5. **Cửa chuồng đóng** (SAU mưa):
   - `hour >= 18 || hour < 6`: vẽ `px2(g, 209, 49, 4, 10, f.woodDark)` đè lên lỗ cửa mở
     (cửa x208..213 y48..59, lỗ x209..212 y49..58).

6. **Đèn nhà** (vẽ cuối — sáng nhất, nằm trên overlay tối):
   - Ô sáng trong cửa sổ TRÁI (ô rơm x16..22 y36..41): `px2(g, 17, 38, 3, 3, '#ffd28a')` + `px2(g, 18, 37, 1, 1, '#fff3d0')`
   - Đèn lồng đã có sẵn, thêm chút sáng khi tối: `px2(g, 21, 61, 4, 5, '#ffd28a')` mờ

7. **Cảnh đổi khi mưa**:
   - Ao lấp lánh: thêm 2 điểm + đổi phase nhanh hơn (4 thay vì 2/giây)
   - Đom đóm: KHÔNG vẽ khi mưa
   - Cờ: không phất (bỏ nhánh `fl`)
   - Khói: 1 cột mảnh thay vì 2

8. **Khói dày khi busy**: `f2AnyBusy()` → 2 cột khói (đốm x2), rảnh → 1 cột như nay.

### 5. `f2SceneSig` mở rộng

```js
function f2SceneSig() {
  const rain = f2Rain();
  const busy = f2AnyBusy();
  const h = F2_HOUR();
  return 'p' + (Math.floor(OF.clock * 2) % 4)
    + ',b' + F2_BREATH()
    + ',f' + (rain ? 0 : (Math.floor(OF.clock * 2) % 2))
    + ',k' + (rain ? 0 : (Math.floor(OF.clock * 2) % 3))
    + ',m' + (rain ? 0 : (Math.floor(OF.clock * 1) % 2))
    + ',w' + (Math.floor(OF.clock * 0.5) % 3)          // mây
    + ',r' + (rain ? 1 + Math.floor(OF.clock * 4) % 3 : 0)  // mưa
    + ',g' + Math.floor(f2Bright() * 10)               // trời
    + ',d' + (h >= 18 || h < 6 ? 1 : 0)                // cửa chuồng
    + ',L' + (busy ? 1 : 0)                            // đèn + khói dày
    + ',c' + (Math.floor(OF.clock * 0.25) % 2);        // chim
}
```

`f2Rain()` gọi bên trong `sceneSig` nên roll đúng mỗi khi vẽ lại — xấp xỉ mỗi giây,
đủ cho timer ngẫu nhiên. Hiệu năng: không mưa ~4-5 lần/giây vẽ lại (như nay),
mưa ~8fps — chấp nhận.

## Vị trí chính xác

- Cửa sổ nhà: nhà x14..48 y30..53. Cửa sổ hiện có 2 ô rơm ở (16..22, 36..41) và (38..44, 36..41)
  (đó là "cửa sổ" vẽ bằng `straw`). Đèn đặt vào ô TRÁI: (17, 38) 3x3 sáng. — SỬA so với dự thảo
  ở trên (40 → 38, khớp ô rơm y36..41).
- Cửa chuồng: chuồng x196..225 y40..56 (gọi drawF2Coop(196,34) — thân y+6..y+28 = 40..62).
  Cửa cũ: `px2(x+12, y+14, 6, 12)` = x208..213, y48..59. Lỗ mở mới: x209..212 y49..58.
- Cờ chuồng cột x209 y31..34, lá x210..213 y31..32.
- Ống khói x41..44 y16..23.

## Tiêu chí hoàn thành

1. Trời tối dần sau 17h, sáng dần 6h, đêm khuya tối đậm — agent vẫn đọc được.
2. Mây trôi liên tục, đàn chim bay ngang, bồ câu bay chu kỳ.
3. Mưa ngẫu nhiên: nét mưa động + ao lấp lánh nhanh + đom đóm tắt + cờ không phất.
4. Cửa chuồng đóng 18h-6h, mở còn lại.
5. Đèn nhà sáng khi có agent busy (bất kể giờ).
6. Khói 2 cột khi busy, 1 cột khi rảnh.
7. `node --check`, `compileall`, `/usr/bin/python3` import pass.
8. Không sửa office.js / sprites-farm.js / file khác.

## Cách kiểm thử

- Live: server + Playwright (như đợt QA farm2). Probe pixel:
  - Giả giờ bằng override `F2_HOUR` (hoặc sửa lệnh trong console) để test tối/sáng.
  - Override `Math.random` tạm để ép mưa bật.
  - Probe màu overlay tối ở pixel nền đồi, probe tấm cửa đóng, probe đèn sáng.
- `node --check` + import 3.9.
