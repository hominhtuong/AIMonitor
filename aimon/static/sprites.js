/* Nhân vật pixel cho khung nhìn Văn phòng - vẽ hoàn toàn bằng code.
 *
 * KHÔNG có file ảnh nào, và đó là chủ ý chứ không phải tiết kiệm:
 *
 * - Thêm một file .png là thêm nó vào cả ba đường đóng gói (Contents/Resources của app
 *   macOS, sys._MEIPASS của bản .exe, copy-aimon.js của extension) và vào bước soát danh
 *   sách file trong CI. Quên một chỗ thì tool vẫn chạy, chỉ có nhân vật biến mất - đúng
 *   kiểu hỏng lặng lẽ mà pricing.json đã dính một lần.
 * - Sprite pack có sẵn ngoài kia gần như luôn kèm giấy phép riêng của phần asset, khác
 *   giấy phép của phần code. Vẽ lấy thì không phải đọc điều khoản của ai.
 *
 * Mỗi khung hình được vẽ một lần vào một canvas ngoài màn hình (atlas) lúc khởi động, sau
 * đó cảnh chỉ `drawImage` từ atlas ra. Vẽ lại từng hình chữ nhật mỗi khung hình cho hơn
 * chục nhân vật ở 30fps là hàng nghìn lệnh fill - đủ để quạt máy chạy.
 *
 * Toạ độ trong file này là pixel gốc (16x20 mỗi nhân vật). Việc phóng to là của office.js
 * và luôn phóng theo BỘI SỐ NGUYÊN, nếu không pixel bị nội suy thành một đám mờ.
 */

const SPRITE_W = 16;
const SPRITE_H = 20;

/* Sáu bộ màu nhân vật. Chọn theo hash của id phiên nên cùng một phiên luôn ra cùng một
 * người - nhân vật đổi mặt mỗi lần làm mới thì không ai theo dõi được ai.
 *
 * Màu phải đọc được trên CẢ nền sáng lẫn nền tối: nhân vật không đổi theo theme (chỉ căn
 * phòng đổi), nên tông trung bình, tránh cực sáng và cực tối. */
const CHAR_PALETTES = [
  { skin: '#f0c49a', skinDark: '#d4a077', hair: '#3f3247', hairDark: '#2b2130',
    shirt: '#4f7cf5', shirtDark: '#3a5fc4', pants: '#3b4a63', shoes: '#242f41' },
  { skin: '#c98d63', skinDark: '#a86f4c', hair: '#1f1a17', hairDark: '#120f0d',
    shirt: '#e5615f', shirtDark: '#b8464a', pants: '#4a4258', shoes: '#2a2436' },
  { skin: '#f7d7b8', skinDark: '#dcb593', hair: '#c86a2c', hairDark: '#a04f1d',
    shirt: '#2fae86', shirtDark: '#238a6a', pants: '#37485c', shoes: '#22303e' },
  { skin: '#8d5a3b', skinDark: '#71462c', hair: '#2a2028', hairDark: '#191219',
    shirt: '#f0a534', shirtDark: '#c47f1e', pants: '#42506b', shoes: '#28323f' },
  { skin: '#eec39c', skinDark: '#cfa17b', hair: '#7b5ea8', hairDark: '#5e468a',
    shirt: '#d95fa8', shirtDark: '#ac4483', pants: '#3d3f56', shoes: '#252739' },
  { skin: '#dda87d', skinDark: '#bb8760', hair: '#5b6b7d', hairDark: '#42505f',
    shirt: '#5ec2d9', shirtDark: '#3f9db3', pants: '#39485e', shoes: '#232f3d' },
];

/* Thứ tự khung hình trong atlas. Mỗi nhân vật là một hàng, mỗi khoá dưới đây là một cột. */
const FRAMES = [
  'd0', 'd1', 'd2',   // đi xuống (nhìn thẳng): đứng yên, bước trái, bước phải
  'u0', 'u1', 'u2',   // đi lên (quay lưng)
  's0', 's1', 's2',   // đi ngang, hướng phải; hướng trái vẽ bằng cách lật
  'k0',               // ngồi, tay buông
  'k1', 'k2',         // ngồi, hai nhịp gõ phím
  'k3',               // ngồi gục xuống (tạm dừng / ngủ)
];
const FRAME_INDEX = {};
FRAMES.forEach((k, i) => { FRAME_INDEX[k] = i; });

/* ------------------------------------------------------------- vẽ một nhân vật */

/** Hình chữ nhật đặc, bo về pixel nguyên. Mọi nét trong file này đi qua đây. */
function px(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x | 0, y | 0, w | 0, h | 0);
}

/** Đôi chân + giày. `step` 0 đứng yên, 1 và 2 là hai nhịp bước. */
function legs(g, p, step, x0) {
  const lx = x0 + 1, rx = x0 + 5;              // hai ống chân, mỗi ống rộng 2px
  const off = step === 1 ? 1 : step === 2 ? -1 : 0;
  px(g, lx, 15, 2, 4, p.pants);
  px(g, rx, 15, 2, 4, p.pants);
  // Bước đi: một bàn chân đưa ra trước, bàn kia lùi lại. Chỉ xê dịch giày chứ không xê
  // dịch cả ống chân - dịch cả chân ở kích thước 16px thì nhân vật trông như bị gãy.
  px(g, lx - Math.max(0, off), 19, 2, 1, p.shoes);
  px(g, rx + Math.max(0, -off), 19, 2, 1, p.shoes);
}

function bodyFront(g, p) {
  px(g, 4, 9, 8, 5, p.shirt);          // thân
  px(g, 4, 9, 8, 1, p.shirtDark);      // cổ áo
  px(g, 4, 14, 8, 1, p.pants);         // cạp quần
}

/** Nhìn thẳng: thấy mặt. */
function drawDown(g, p, step) {
  px(g, 5, 0, 6, 1, p.hairDark);
  px(g, 4, 1, 8, 4, p.hair);
  px(g, 5, 5, 6, 3, p.skin);           // mặt
  px(g, 4, 5, 1, 2, p.hair);           // tóc mai trái
  px(g, 11, 5, 1, 2, p.hair);          // tóc mai phải
  px(g, 6, 6, 1, 1, p.hairDark);       // mắt
  px(g, 9, 6, 1, 1, p.hairDark);
  px(g, 7, 8, 2, 1, p.skinDark);       // cổ
  bodyFront(g, p);
  px(g, 3, 9, 1, 5, p.shirt);          // tay
  px(g, 12, 9, 1, 5, p.shirt);
  px(g, 3, 14, 1, 1, p.skin);          // bàn tay
  px(g, 12, 14, 1, 1, p.skin);
  legs(g, p, step, 4);
}

/** Quay lưng: không có mặt, tóc phủ kín. */
function drawUp(g, p, step) {
  px(g, 5, 0, 6, 1, p.hairDark);
  px(g, 4, 1, 8, 7, p.hair);
  px(g, 5, 7, 6, 1, p.hairDark);       // gáy
  px(g, 7, 8, 2, 1, p.skinDark);
  bodyFront(g, p);
  px(g, 3, 9, 1, 5, p.shirt);
  px(g, 12, 9, 1, 5, p.shirt);
  px(g, 3, 14, 1, 1, p.skin);
  px(g, 12, 14, 1, 1, p.skin);
  legs(g, p, step, 4);
}

/** Nhìn ngang (hướng phải). Hướng trái do office.js lật ngang khi vẽ. */
function drawSide(g, p, step) {
  px(g, 5, 0, 6, 1, p.hairDark);
  px(g, 5, 1, 6, 4, p.hair);
  px(g, 7, 5, 4, 3, p.skin);           // phần mặt lộ ra ở nửa phải
  px(g, 5, 5, 2, 3, p.hair);           // gáy
  px(g, 9, 6, 1, 1, p.hairDark);       // mắt
  px(g, 11, 6, 1, 1, p.skin);          // mũi
  px(g, 7, 8, 2, 1, p.skinDark);
  px(g, 5, 9, 6, 5, p.shirt);
  px(g, 5, 9, 6, 1, p.shirtDark);
  px(g, 5, 14, 6, 1, p.pants);
  // Chỉ thấy một tay, và nó đánh theo nhịp chân
  const ax = step === 1 ? 10 : step === 2 ? 4 : 7;
  px(g, ax, 10, 2, 4, p.shirtDark);
  px(g, ax, 14, 2, 1, p.skin);
  legs(g, p, step, 4);
}

/* Ngồi: nhìn từ sau lưng vì bàn quay mặt vào tường, người ngồi quay lưng ra phía người xem.
 * Đây là góc duy nhất cho thấy được cả người lẫn màn hình cùng lúc. Chân khuất sau ghế nên
 * không vẽ - vẽ chân thò ra dưới ghế trông như đang lơ lửng. */
function drawSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0;       // gục xuống thì cả đầu lẫn vai thấp hơn
  px(g, 5, 1 + drop, 6, 1, p.hairDark);
  px(g, 4, 2 + drop, 8, 7, p.hair);
  px(g, 5, 8 + drop, 6, 1, p.hairDark);
  px(g, 7, 9 + drop, 2, 1, p.skinDark);
  px(g, 3, 10 + drop, 10, 6, p.shirt);         // lưng rộng hơn vì đang ngồi hơi khom
  px(g, 3, 10 + drop, 10, 1, p.shirtDark);

  if (arms === 'sleep') {
    px(g, 2, 13 + drop, 2, 3, p.shirtDark);    // hai tay buông thõng
    px(g, 12, 13 + drop, 2, 3, p.shirtDark);
    px(g, 2, 16 + drop, 2, 1, p.skin);
    px(g, 12, 16 + drop, 2, 1, p.skin);
    return;
  }
  if (arms === 'rest') {
    px(g, 2, 12, 2, 4, p.shirtDark);
    px(g, 12, 12, 2, 4, p.shirtDark);
    px(g, 2, 16, 2, 1, p.skin);
    px(g, 12, 16, 2, 1, p.skin);
    return;
  }
  // Gõ phím: hai cẳng tay vươn ra trước, hai bàn tay so le nhau một pixel theo nhịp.
  const up = arms === 'typeA';
  px(g, 1, 11, 3, 4, p.shirtDark);
  px(g, 12, 11, 3, 4, p.shirtDark);
  px(g, 1, up ? 14 : 15, 3, 1, p.skin);
  px(g, 12, up ? 15 : 14, 3, 1, p.skin);
}

function drawFrame(g, p, key) {
  switch (key) {
    case 'd0': return drawDown(g, p, 0);
    case 'd1': return drawDown(g, p, 1);
    case 'd2': return drawDown(g, p, 2);
    case 'u0': return drawUp(g, p, 0);
    case 'u1': return drawUp(g, p, 1);
    case 'u2': return drawUp(g, p, 2);
    case 's0': return drawSide(g, p, 0);
    case 's1': return drawSide(g, p, 1);
    case 's2': return drawSide(g, p, 2);
    case 'k0': return drawSit(g, p, 'rest');
    case 'k1': return drawSit(g, p, 'typeA');
    case 'k2': return drawSit(g, p, 'typeB');
    case 'k3': return drawSit(g, p, 'sleep');
    default: return drawDown(g, p, 0);
  }
}

/* ------------------------------------------------------------- atlas + con mèo */

/** Con mèo đi lang thang trong phòng. 10x8, hai nhịp chân. */
function drawCat(g, step) {
  const body = '#c9a227', dark = '#8f7016', eye = '#1c2331';
  px(g, 1, 3, 7, 4, body);            // thân
  px(g, 7, 1, 3, 3, body);            // đầu
  px(g, 7, 1, 1, 1, dark);            // tai
  px(g, 9, 1, 1, 1, dark);
  px(g, 9, 2, 1, 1, eye);             // mắt
  px(g, 0, 1, 1, 3, dark);            // đuôi dựng
  px(g, 1, 7, 2, 1, step ? dark : body);
  px(g, 5, 7, 2, 1, step ? body : dark);
}

const CAT_W = 10;
const CAT_H = 8;

/** Atlas: mỗi nhân vật một hàng, mỗi khung hình một cột; con mèo nằm ở hàng cuối. */
function buildSpriteAtlas() {
  const cols = FRAMES.length;
  const rows = CHAR_PALETTES.length;
  const cv = document.createElement('canvas');
  cv.width = cols * SPRITE_W;
  cv.height = rows * SPRITE_H + SPRITE_H;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;

  CHAR_PALETTES.forEach((p, r) => {
    FRAMES.forEach((key, c) => {
      g.save();
      g.translate(c * SPRITE_W, r * SPRITE_H);
      drawFrame(g, p, key);
      g.restore();
    });
  });

  const catRow = rows * SPRITE_H;
  for (let i = 0; i < 2; i++) {
    g.save();
    g.translate(i * SPRITE_W, catRow);
    drawCat(g, i);
    g.restore();
  }

  return {
    canvas: cv,
    cols,
    rows,
    catY: catRow,
    /** Ô của một khung hình trong atlas => tham số cho drawImage. */
    cell(charIndex, frameKey) {
      const c = FRAME_INDEX[frameKey] == null ? 0 : FRAME_INDEX[frameKey];
      return [c * SPRITE_W, (charIndex % rows) * SPRITE_H, SPRITE_W, SPRITE_H];
    },
    catCell(step) {
      return [(step ? 1 : 0) * SPRITE_W, catRow, CAT_W, CAT_H];
    },
  };
}

/** Hash chuỗi -> chỉ số nhân vật. Phải ổn định: cùng phiên thì luôn cùng một người. */
function charIndexOf(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % CHAR_PALETTES.length;
}
