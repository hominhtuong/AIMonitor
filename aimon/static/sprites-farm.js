/* Hệ nhân vật pixel 16x16 RIÊNG cho bối cảnh farm-v2. Fork từ sprites.js — mọi hằng số có
 * hậu tố _FARM để không xung đột với hệ 16x20 của sprites.js. Tái dùng các hàm toàn cục
 * px2 / lighten / darken / toRgb / mixC / finishCell (đã có từ sprites.js, KHÔNG định nghĩa
 * lại — script tag chia sẻ scope).
 *
 * LƯU Ý PHÂN BIỆT HAI HÀM CHẤM PIXEL:
 *  - `px`  (sprites.js:124) NHÂN với SPRITE_SS — chỉ dùng để vẽ trong ATLAS.
 *  - `px2` (office.js:1215) vẽ raw 1:1 — chỉ dùng để vẽ nền/nhân vật ở độ phân giải gốc.
 *  Nông dân đi vào atlas nên dùng bản nhân hệ số RIÊNG của farm (`pxF`), vì `px` khoá cứng
 *  vào hằng số SPRITE_SS của hệ 16x20. Bốn con vật nền vẽ thẳng lên canvas gốc nên dùng px2. */

const SPRITE_W_FARM = 16;
const SPRITE_H_FARM = 16;
const SPRITE_SS_FARM = 3;            // lưới con giữ nguyên: 1 pixel gốc = 3 pixel atlas

/* Chấm pixel có nhân hệ số, bản sao của `px` nhưng đọc SPRITE_SS_FARM. Bo HAI MÉP chứ không
 * bo gốc rồi nhân bề rộng — giống hệt px, để mảng liền nhau không hở khe ở toạ độ lẻ. */
function pxF(g, x, y, w, h, color) {
  const x0 = Math.round(x * SPRITE_SS_FARM), x1 = Math.round((x + w) * SPRITE_SS_FARM);
  const y0 = Math.round(y * SPRITE_SS_FARM), y1 = Math.round((y + h) * SPRITE_SS_FARM);
  if (x1 <= x0 || y1 <= y0) return;
  g.fillStyle = color;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
}

/* Trật tự cột khung hình trong atlas farm. Mỗi đạo cụ có 2 tư thế A (nhấc/cầm cao) và
 * B (giáng/cúi) để hoạt ảnh 2 nhịp; `blink` là tư thế ngồi yên mắt nhắm. KHÔNG trùng khoá
 * với sprites.js (hệ 16x20 có d0..d2/u0..u2/s0..s2/k0..k3/kf — khác tập khoá). */
const FRAME_INDEX_FARM = {
  d0: 0, d1: 1, d2: 2,          // đi xuống / idle
  u0: 3, u1: 4, u2: 5,          // đi lên
  s0: 6, s1: 7, s2: 8,          // đi ngang
  hoeA: 9, hoeB: 10, plantA: 11, plantB: 12,
  harvestA: 13, harvestB: 14, axeA: 15, axeB: 16,
  waterA: 17, waterB: 18, fishA: 19, fishB: 20,
  interactA: 21, interactB: 22, carryA: 23, carryB: 24,
  blink: 25,
};
const FARM_FRAME_KEYS = Object.keys(FRAME_INDEX_FARM);

/* Mười nông dân. Khác nhau ba màu (nón, áo, quần) + một `acc` (phụ kiện) để phân biệt. Màu
 * ghi theo giá trị hex thật để `toRgb`/`lighten`/`darken` tính được viền và đổ bóng tự động
 * như sprites.js. */
const FARMER_CHARS = [
  { id: 'farmer0', name: 'Farmhand',  hat: '#d9b26a', shirt: '#4a90d9', pants: '#2f4a6b',
    acc: { kind: 'bandana', color: '#e05a4e' } },
  { id: 'farmer1', name: 'Farmer',    hat: '#c9a052', shirt: '#e05a4e', pants: '#3d3a50',
    acc: { kind: 'bun', color: '#4a2f1a' } },
  { id: 'farmer2', name: 'Plowman',   hat: '#e0c080', shirt: '#6aa84f', pants: '#4a3d2b',
    acc: { kind: 'ponytail', color: '#4a2f1a' } },
  { id: 'farmer3', name: 'Tender',    hat: '#b8904a', shirt: '#f0a84f', pants: '#37474f',
    acc: { kind: 'stripe', color: '#fdf3e3' } },
  { id: 'farmer4', name: 'Reaper',    hat: '#d9b26a', shirt: '#9b59b6', pants: '#2c3e50',
    acc: { kind: 'overalls', color: '#5d6b7a' } },
  { id: 'farmer5', name: 'Waterer',   hat: '#c9a052', shirt: '#4fb3c7', pants: '#4e342e',
    acc: { kind: 'satchel', color: '#7a5230' } },
  { id: 'farmer6', name: 'Logger',    hat: '#e0c080', shirt: '#8d6e63', pants: '#263238',
    acc: { kind: 'rim', color: '#5d3a1c' } },
  { id: 'farmer7', name: 'Angler',    hat: '#b8904a', shirt: '#e8c547', pants: '#455a64',
    acc: { kind: 'scarf', color: '#e05a4e' } },
  { id: 'farmer8', name: 'Grower',    hat: '#d9b26a', shirt: '#7cb342', pants: '#5d4037',
    acc: { kind: 'coat', color: '#5a6b3f' } },
  { id: 'farmer9', name: 'Harvester', hat: '#c9a052', shirt: '#ec407a', pants: '#3e2723',
    acc: { kind: 'waist', color: '#e8d8a0' } },
];

/* Toạ độ là pixel gốc 16x16 (đáy sprite chạm y=15 là giày, vành nón ở y=0). Đi qua `pxF` nên
 * mọi nét tự nằm trên lưới con. KHÔNG nét nào vượt quá y=15 hay x=15: 1 pixel gốc quanh ô là
 * viền để finishCell kẻ viền, vượt qua là tràn sang ô hàng xóm trong atlas. */

/* Thân dưới (chân + giày) chung cho mọi hướng. `step` = 0/1/2 (nhịp đi bộ). */
function farmLegs(g, c, step) {
  const P = c.pants, D = darken(P, 0.25), B = darken(P, 0.45);
  const l = step === 2 ? -1 : 0, r = step === 1 ? 1 : 0;   // hai chân so le
  pxF(g, 5 + l, 11, 3, 3, P);                              // chân trái
  pxF(g, 5 + l, 14, 3, 1, B);                              // ống quần
  pxF(g, 8 + r, 11, 3, 3, P);                              // chân phải
  pxF(g, 8 + r, 14, 3, 1, B);
  pxF(g, 4 + l, 15, 3, 1, darken(B, 0.2));                 // giày
  pxF(g, 9 + r, 15, 3, 1, darken(B, 0.2));
  pxF(g, 5 + l, 10, 3, 1, D);                              // đũng quần
  pxF(g, 8 + r, 10, 3, 1, D);
}

/* Đầu + nón rơm. Nhìn xuống (`turn=false`) hoặc quay ra (`turn=true`). Mặt rộng 6 pixel
 * giữa thân; nón rơm rộng 12. `closed=true` = tư thế blink (mắt nhắm) — bỏ hẳn pixel mắt tối. */
function farmHead(g, c, turn, closed) {
  const F = '#eab28b', E = '#222222', CH = '#8c5a35';      // da, mắt, tóc mai
  const hx = 5;
  pxF(g, hx - 1, 1, 8, 1, darken(c.hat, 0.15));            // vành nón (hàng trên)
  pxF(g, hx, 2, 6, 1, darken(c.hat, 0.1));
  pxF(g, hx, 3, 6, 1, c.hat);                              // chóp nón
  pxF(g, hx, 4, 6, 1, darken(c.hat, 0.05));
  pxF(g, hx, 5, 1, 1, CH); pxF(g, hx + 5, 5, 1, 1, CH);    // tóc mai hai bên
  pxF(g, hx, 5, 6, 1, F);                                  // trán
  if (turn) {
    pxF(g, hx + 1, 6, 4, 2, F);
    if (!closed) { pxF(g, hx + 2, 6, 1, 1, E); pxF(g, hx + 4, 6, 1, 1, E); }
    else pxF(g, hx + 2, 6, 2, 1, '#c98a55');
    pxF(g, hx + 2, 8, 2, 1, '#d08a5a');                    // miệng
  } else {
    pxF(g, hx + 1, 6, 4, 2, F);
    if (!closed) pxF(g, hx + 3, 6, 1, 1, E);               // gáy (một mắt nheo)
    else pxF(g, hx + 2, 6, 2, 1, '#c98a55');
    pxF(g, hx + 1, 8, 4, 1, F);
  }
}

/* Phụ kiện phân biệt 10 nông dân. Nhìn từ SAU (dir 'down'/'up' — tư thế làm việc chính) là
 * nơi người xem thấy nhiều nhất; vài loại cũng lộ ở nhìn ngang ('side'). Tất cả phải BÁM
 * vào thân/đầu (x=5..11, y=5..12), không nét nào bay ra ngoài silhouette. */
function farmAcc(g, c, dir) {
  if (!c.acc) return;
  const k = c.acc.kind, col = c.acc.color;
  if (dir === 'side') {
    if (k === 'bandana') { pxF(g, 4, 5, 2, 2, col); }
    if (k === 'scarf')   { pxF(g, 5, 7, 4, 1, col); pxF(g, 5, 8, 1, 1, darken(col, 0.25)); }
    if (k === 'satchel') { pxF(g, 4, 8, 2, 1, col); pxF(g, 5, 9, 2, 2, col); }
    if (k === 'coat')    { pxF(g, 4, 11, 8, 2, col); }
    if (k === 'overalls'){ pxF(g, 4, 7, 1, 4, col); pxF(g, 11, 7, 1, 4, col); }
    return;
  }
  // down / up — nhìn từ sau lưng
  if (k === 'bandana') { pxF(g, 5, 5, 6, 1, col); pxF(g, 4, 6, 2, 1, col); pxF(g, 10, 6, 2, 1, col); }
  if (k === 'bun')     { pxF(g, 6, 5, 3, 1, col); pxF(g, 7, 6, 1, 1, col); }
  if (k === 'ponytail'){ pxF(g, 7, 6, 2, 2, col); pxF(g, 7, 8, 1, 3, col); }
  if (k === 'scarf')   { pxF(g, 5, 7, 6, 1, col); pxF(g, 7, 8, 2, 1, darken(col, 0.25)); }
  if (k === 'satchel') { pxF(g, 5, 8, 2, 1, col); pxF(g, 6, 9, 1, 2, col); pxF(g, 9, 9, 2, 2, col); }
  if (k === 'coat')    { pxF(g, 4, 11, 8, 2, col); }
  if (k === 'overalls'){ pxF(g, 5, 7, 1, 4, col); pxF(g, 10, 7, 1, 4, col); }
  if (k === 'waist')   { pxF(g, 5, 10, 6, 1, col); }
  if (k === 'stripe')  { pxF(g, 7, 7, 2, 4, col); }
  if (k === 'rim')     { pxF(g, 5, 4, 6, 1, col); }
}

/* Thân áo nhìn xuống / lên / ngang. */
function farmBody(g, c, dir) {
  const S = c.shirt, D = darken(S, 0.2), L = lighten(S, 0.15);
  if (dir === 'up') {
    pxF(g, 5, 7, 6, 4, D);                                 // lưng tối
    pxF(g, 5, 7, 6, 1, L);                                 // viền vai sáng
    pxF(g, 5, 11, 6, 1, D);
  } else if (dir === 'side') {
    pxF(g, 4, 7, 8, 4, S);
    pxF(g, 4, 7, 8, 1, L);
    pxF(g, 10, 8, 1, 3, D);                                // cạnh tay
    pxF(g, 4, 11, 8, 1, D);
  } else {
    pxF(g, 4, 7, 8, 4, S);
    pxF(g, 4, 7, 8, 1, L);
    pxF(g, 4, 8, 1, 3, D);                                 // nách hai bên
    pxF(g, 11, 8, 1, 3, D);
    pxF(g, 4, 10, 8, 1, D);
  }
}

/* Cánh tay theo hướng. `gripX/gripY` là toạ độ bàn tay — chỗ đạo cụ nối vào. */
function farmArm(g, c, dir, gripX, gripY) {
  const F = '#eab28b', D = darken(c.shirt, 0.25);
  if (dir === 'side') {
    pxF(g, 11, 8, 2, 2, c.shirt);                          // tay phải chìa ra
    pxF(g, 13, 10, 1, 1, F);                               // bàn tay
  } else {
    pxF(g, gripX - 1, gripY - 2, 2, 1, c.shirt);
    pxF(g, gripX - 1, gripY - 1, 2, 1, F);
  }
  if (dir === 'down') pxF(g, 3, 8, 1, 2, D);               // tay trái giấu
}

/* Đạo cụ — hai tư thế A (nhấc/cầm cao) và B (giáng/cúi xuống). Tay ở (12-13, y≈10-11).
 * Gỗ #8a5a2b, kim loại #b0bec5. KHÔNG nét nào vượt y=15 / x=15. */
function propHoe(g, y, pose) {
  if (pose === 'A') {
    pxF(g, 13, 7, 1, 4, '#8a5a2b');
    pxF(g, 11, 6, 3, 2, '#b0bec5');
  } else {
    pxF(g, 13, 10, 1, 4, '#8a5a2b');
    pxF(g, 11, 14, 3, 2, '#b0bec5');
  }
}
function propPlant(g, y, pose) {
  pxF(g, 9, 9, 2, 3, '#7a5230');                       // túi hạt (tay trái) — cả hai tư thế
  pxF(g, 9, 8, 3, 1, '#a07030');
  if (pose === 'A') {
    pxF(g, 13, 9, 1, 3, '#6d4c41');
    pxF(g, 12, 8, 3, 2, '#4caf50');
  } else {
    pxF(g, 13, 12, 1, 3, '#6d4c41');
    pxF(g, 12, 14, 3, 2, '#4caf50');
  }
}
function propHarvest(g, y, pose) {
  if (pose === 'A') {
    pxF(g, 13, 8, 1, 4, '#8a5a2b');
    pxF(g, 12, 6, 3, 3, '#b0bec5');
  } else {
    pxF(g, 13, 10, 1, 4, '#8a5a2b');
    pxF(g, 11, 14, 4, 2, '#b0bec5');
  }
}
function propAxe(g, y, pose) {
  if (pose === 'A') {
    pxF(g, 13, 5, 1, 6, '#8a5a2b');
    pxF(g, 11, 4, 5, 2, '#b0bec5');
  } else {
    pxF(g, 13, 10, 1, 4, '#8a5a2b');
    pxF(g, 11, 14, 5, 2, '#b0bec5');
  }
}
function propWater(g, y, pose) {
  if (pose === 'A') {
    pxF(g, 11, 9, 4, 4, '#4a90d9');
    pxF(g, 11, 9, 4, 1, '#9cc9ef');
    pxF(g, 10, 7, 1, 3, '#3d5a80');
  } else {
    pxF(g, 10, 10, 4, 3, '#4a90d9');
    pxF(g, 9, 7, 1, 4, '#3d5a80');                     // vòi nghiêng
    pxF(g, 9, 11, 1, 1, '#9cc9ef');                    // giọt
    pxF(g, 8, 13, 1, 1, '#9cc9ef');
  }
}
function propFish(g, y, pose) {
  if (pose === 'A') {
    pxF(g, 13, 5, 1, 7, '#8a5a2b');
    pxF(g, 13, 12, 1, 2, '#e8e6e0');
  } else {
    pxF(g, 13, 9, 1, 6, '#8a5a2b');
    pxF(g, 13, 15, 1, 1, '#b0bec5');                   // phao
    pxF(g, 13, 11, 1, 3, '#e8e6e0');
  }
}
function propInteract(g, y, pose) {
  if (pose === 'A') {
    pxF(g, 11, 8, 4, 4, '#e8c547');
    pxF(g, 12, 9, 2, 2, '#6d4c41');
    pxF(g, 13, 12, 1, 2, '#8a5a2b');
  } else {
    pxF(g, 11, 10, 4, 4, '#e8c547');
    pxF(g, 12, 11, 2, 2, '#6d4c41');
    pxF(g, 13, 14, 1, 1, '#8a5a2b');
  }
}
function propCarry(g, y, pose) {
  if (pose === 'A') {
    pxF(g, 4, 8, 3, 4, '#d9b26a');                     // sọt đeo sau lưng
    pxF(g, 4, 8, 3, 1, '#e8c86a');
  } else {
    pxF(g, 12, 9, 4, 4, '#d9b26a');                    // sọt xách tay
    pxF(g, 12, 13, 4, 1, '#8a5a2b');
  }
}

/* Khung đạo cụ → tên đạo cụ và tư thế A/B. `carry` chưa hành động nào dùng (dự trữ) nhưng
 * vẫn có A/B cho đủ cột. */
const FARM_FRAME_TOOL = {
  hoeA: 'hoe', hoeB: 'hoe', plantA: 'plant', plantB: 'plant',
  harvestA: 'harvest', harvestB: 'harvest', axeA: 'axe', axeB: 'axe',
  waterA: 'water', waterB: 'water', fishA: 'fish', fishB: 'fish',
  interactA: 'interact', interactB: 'interact', carryA: 'carry', carryB: 'carry',
};
const propDraw = { hoe: propHoe, plant: propPlant, harvest: propHarvest, axe: propAxe,
  water: propWater, fish: propFish, interact: propInteract, carry: propCarry };

/* Vẽ một khung hình nông dân. `buildAtlas_farm` đã translate vào góc ô + chừa viền 1 pixel
 * gốc, nên hàm này vẽ thẳng ở toạ độ gốc 0..15. Key mới có dạng `<tool>A|B` (đạo cụ 2 nhịp),
 * `blink` (mắt nhắm), hoặc d*, u*, s* (đi lại). */
function drawFarmerFarm(g, c, key) {
  const tool = FARM_FRAME_TOOL[key];
  const pose = /[AB]$/.test(key) ? key[key.length - 1] : 'A';
  const closed = key === 'blink';
  const dir = closed ? 'd' : tool ? 's' : key[0];
  const step = (tool || closed) ? 0
    : key === 'd1' || key === 'u1' || key === 's1' ? 1
    : key === 'd2' || key === 'u2' || key === 's2' ? 2 : 0;
  if (dir === 'd') {
    farmLegs(g, c, step);
    farmBody(g, c, 'down');
    farmAcc(g, c, 'down');
    farmHead(g, c, false, closed);
  } else if (dir === 'u') {
    farmLegs(g, c, step);
    farmBody(g, c, 'up');
    farmAcc(g, c, 'up');
    farmHead(g, c, false, closed);
  } else {
    farmLegs(g, c, step);
    farmBody(g, c, 'side');
    farmAcc(g, c, 'side');
    farmHead(g, c, true, closed);
    if (tool) {
      farmArm(g, c, 'side');
      propDraw[tool](g, 11, pose);
    }
  }
}

/* Atlas nướng cả 10 nông dân x 17 frame. `want` = danh sách chỉ số nông dân (0..9) cần;
 * bỏ trống = nướng tất. Chỉ số trỏ vào FARMER_CHARS. Cùng API với buildSpriteAtlas để
 * office.js gọi `atlas.cell(charIndex, frame)` và `atlas.canvas` mà không biết bối cảnh nào. */
function buildAtlas_farm(want) {
  const S = SPRITE_SS_FARM;
  const cols = FARM_FRAME_KEYS.length;
  const n = FARMER_CHARS.length || 1;
  const norm = (i) => ((Math.round(i) % n) + n) % n;
  const list = want && want.length
    ? Array.from(new Set(Array.from(want, norm))).sort((a, b) => a - b)
    : FARMER_CHARS.map((_, i) => i);
  const rowOf = new Map(list.map((idx, r) => [idx, r]));
  const rows = list.length;
  const cw = (SPRITE_W_FARM + 2) * S;
  const ch = (SPRITE_H_FARM + 2) * S;
  const perCol = Math.max(1, Math.floor(4096 / ch));
  const groups = Math.ceil(rows / perCol);

  const cv = document.createElement('canvas');
  cv.width = cols * cw * groups;
  cv.height = Math.min(rows, perCol) * ch;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  const originOf = (r, c) => [Math.floor(r / perCol) * cols * cw + c * cw, (r % perCol) * ch];

  const cells = [];
  list.forEach((idx, r) => {
    const c = FARMER_CHARS[idx];
    if (!c) return;
    FARM_FRAME_KEYS.forEach((key, col) => {
      const [ox, oy] = originOf(r, col);
      g.save();
      g.translate(ox + S, oy + S);
      drawFarmerFarm(g, c, key);
      g.restore();
      cells.push([ox, oy, true]);
    });
  });

  const img = g.getImageData(0, 0, cv.width, cv.height);
  cells.forEach(([ox, oy, outline]) => finishCell(img.data, cv.width, ox, oy, cw, ch, outline));
  g.putImageData(img, 0, 0);

  return {
    canvas: cv,
    cols,
    rows: list.length,
    covers(indices) {
      for (const i of indices) if (!rowOf.has(norm(i))) return false;
      return true;
    },
    cell(charIndex, frameKey) {
      const c = FRAME_INDEX_FARM[frameKey] == null ? 0 : FRAME_INDEX_FARM[frameKey];
      const r = rowOf.has(norm(charIndex)) ? rowOf.get(norm(charIndex)) : 0;
      const [ox, oy] = originOf(r, c);
      return [ox, oy, cw, ch];
    },
  };
}

/* Bốn con vật nền — vẽ TRỰC TIẾP lên canvas gốc bằng px2 (1:1, không phải atlas). drawAmbient
 * gọi `c.draw(g, OF.pal, c, cx, cy)` nên chữ ký BẮT BUỘC 5 tham số, `c` là con vật đang diễn. */
function drawChickenFarm(g, pal, c, x, y) {
  const t = c.tone || '#f5efe0';
  const moving = c.wait <= 0;
  const step = moving && Math.floor(c.anim * 6) % 2;
  const d = c.flip ? -1 : 1;
  const hx = x + (c.flip ? 1 : 4);
  px2(g, x + 1, y + 2, 5, 4, t);
  px2(g, x + 1, y + 5, 5, 1, darken(t, 0.25));
  px2(g, x + (c.flip ? 5 : 0), y + 3, 1, 2, darken(t, 0.3));
  px2(g, hx, y, 2, 3, t);
  px2(g, hx, y - 1, 1, 1, '#e05a4e');
  px2(g, hx + d, y + 1, 1, 1, '#f0b830');
  px2(g, hx + (c.flip ? 0 : 1), y + 1, 1, 1, INK);
  px2(g, x + 2, y + 6, 1, step ? 2 : 1, '#f0b830');
  px2(g, x + 4, y + 6, 1, step ? 1 : 2, '#f0b830');
}

function drawCowFarm(g, pal, c, x, y) {
  const t = c.tone || '#e8e0d0';
  const moving = c.wait <= 0;
  const step = moving && Math.floor(c.anim * 6) % 2;
  const d = c.flip ? -1 : 1;
  const hx = x + (c.flip ? 0 : 7);
  px2(g, x + 1, y + 3, 9, 4, t);
  px2(g, x + 1, y + 6, 9, 1, darken(t, 0.3));
  px2(g, x + 3, y + 2, 5, 1, darken(t, 0.35));          // yếm
  px2(g, hx, y + 1, 5, 4, t);
  px2(g, hx + (c.flip ? 4 : 0), y + 1, 1, 2, '#8a5a2b'); // sừng
  px2(g, hx + (c.flip ? 3 : 1), y + 2, 1, 1, '#6d4c41'); // mũi
  px2(g, x + 2, y + 7, 1, step ? 2 : 1, '#8a5a2b');
  px2(g, x + 7, y + 7, 1, step ? 2 : 1, '#8a5a2b');
}

function drawPigFarm(g, pal, c, x, y) {
  const t = c.tone || '#f0c8c0';
  const moving = c.wait <= 0;
  const step = moving && Math.floor(c.anim * 6) % 2;
  const d = c.flip ? -1 : 1;
  const hx = x + (c.flip ? 0 : 6);
  px2(g, x + 2, y + 3, 7, 4, t);
  px2(g, x + 2, y + 6, 7, 1, darken(t, 0.25));
  px2(g, hx, y + 1, 5, 4, t);
  px2(g, hx + 1, y + 4, 3, 1, darken(t, 0.3));          // mõm hồng
  px2(g, hx + (c.flip ? 3 : 1), y + 3, 1, 1, '#6d4c41');
  px2(g, x + 3, y + 7, 1, step ? 2 : 1, darken(t, 0.4));
  px2(g, x + 6, y + 7, 1, step ? 2 : 1, darken(t, 0.4));
}

function drawSheepFarm(g, pal, c, x, y) {
  const t = c.tone || '#f2f0ea';
  const moving = c.wait <= 0;
  const step = moving && Math.floor(c.anim * 6) % 2;
  const d = c.flip ? -1 : 1;
  const hx = x + (c.flip ? 0 : 5);
  px2(g, x + 1, y + 3, 9, 3, t);                        // bộ lông xù
  px2(g, x + 2, y + 2, 7, 1, t);
  px2(g, x + 3, y + 6, 5, 1, '#6d4c41');                // chân lộ ra
  px2(g, hx, y + 1, 4, 3, '#5d4037');                   // mặt tối
  px2(g, hx + (c.flip ? 3 : 0), y + 2, 1, 1, '#3e2723'); // tai
  px2(g, x + 3, y + 7, 1, step ? 2 : 1, '#6d4c41');
  px2(g, x + 6, y + 7, 1, step ? 2 : 1, '#6d4c41');
}
