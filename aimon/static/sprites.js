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
 * Toạ độ trong file này là pixel gốc (16x20 mỗi nhân vật) - đó là đơn vị office.js đo phòng
 * theo, và đổi nó là phải đổi cả bố cục bàn ghế. Nhưng atlas được vẽ ở độ phân giải gấp
 * `SPRITE_SS` lần (xem ngay dưới), nên toạ độ lẻ 1/3 pixel là hợp lệ và đó chính là chỗ có
 * được nét cong, viền mảnh và mảng sáng tối.
 *
 * TỶ LỆ CHIBI, cố ý: đầu chiếm gần nửa chiều cao (9/20), mắt to 2x2 có chấm sáng, có má
 * hồng. Bản đầu theo tỷ lệ người thật - ở bậc phóng nhỏ mặt chỉ còn hai chấm 1x1, nhìn vô
 * hồn và người dùng phản hồi thẳng là "xấu, không cute". Đầu to là thứ tạo ra cảm giác dễ
 * thương ở kích thước này, không phải thêm chi tiết: 16x20 pixel không đủ chỗ cho chi tiết.
 *
 * Bố cục dọc, giữ nguyên khi thêm skin mới:
 *
 *     y 0..9    đầu (tóc phủ từ 0, mặt lộ ra từ 5)
 *     y 10..15  thân
 *     y 16..19  chân + giày
 */

const SPRITE_W = 16;
const SPRITE_H = 20;

/* LƯỚI CON. Một pixel gốc được vẽ bằng SPRITE_SS x SPRITE_SS pixel thật trong atlas.
 *
 * Đây là thứ tạo ra khác biệt giữa "khối vuông xếp lại" và "hình có nét": đỉnh đầu bo được
 * theo đường tròn thật thay vì vát một pixel, tròng mắt có con ngươi lẫn chấm loá, viền chỉ
 * dày 1/3 pixel thay vì một pixel đặc - viền dày bằng cả một mảng màu là lý do bản trước
 * nhìn như hình dán chứ không như nhân vật.
 *
 * Chọn 3, không phải 2 hay 4: hơn trăm nhân vật x 13 khung hình nên atlas nặng theo bình
 * phương hệ số (4 là gấp 16 lần), còn 2 thì không đủ chỗ cho vừa nét cong vừa viền mảnh.
 * Đổi số này không phải sửa gì khác trong file - mọi nét đều đi qua px(). */
const SPRITE_SS = 3;

/* Màu dùng chung cho mọi nhân vật. Tách riêng vì chúng là đặc điểm của phong cách vẽ, không
 * phải của từng người: đổi ở đây là cả bộ đổi theo. */
const INK = '#2b2233';        // viền và mắt
const EYE_LIGHT = '#ffffff';  // chấm sáng trong mắt - thiếu nó là ánh nhìn chết hẳn
const BLUSH = '#f2919b';

/* Mười nhân vật. Mỗi người khác nhau ở CẢ kiểu tóc lẫn bộ màu, không chỉ đổi màu: đổi mỗi
 * màu thì ở bậc phóng nhỏ trông vẫn là một người mặc áo khác.
 *
 * `name` là tên hiển thị trong bảng chọn - không dịch, cùng lý do với tên sản phẩm.
 *
 * Màu phải đọc được trên CẢ nền sáng lẫn nền tối: nhân vật không đổi theo theme (chỉ căn
 * phòng đổi), nên tông trung bình, tránh cực sáng và cực tối. */
const OFFICE_CHARS = [
  { id: 'mochi', name: 'Mochi', hair: 'bob', outfit: 'plain',
    skin: '#ffd9b8', skinDark: '#e8b892', hairC: '#4a3b52', hairDark: '#332839',
    shirt: '#7aa5f7', shirtDark: '#5680d6', pants: '#4a5670', shoes: '#2f3849' },

  { id: 'coco', name: 'Coco', hair: 'afro', outfit: 'plain',
    skin: '#a9663f', skinDark: '#8a5030', hairC: '#2e2228', hairDark: '#1d151a',
    shirt: '#ff8a5b', shirtDark: '#d96a3f', pants: '#4b4358', shoes: '#2e2838' },

  { id: 'peach', name: 'Peach', hair: 'bun', outfit: 'apron',
    skin: '#ffe0c4', skinDark: '#eabf9e', hairC: '#d98650', hairDark: '#b3663a',
    shirt: '#ffb3c7', shirtDark: '#e08aa4', pants: '#5b6478', shoes: '#39404f' },

  { id: 'kiwi', name: 'Kiwi', hair: 'ponytail', outfit: 'plain',
    skin: '#f6cfa6', skinDark: '#dbae84', hairC: '#3f6b4a', hairDark: '#2c4c34',
    shirt: '#6fd6a4', shirtDark: '#4bab7f', pants: '#41506a', shoes: '#28323f' },

  { id: 'pepper', name: 'Pepper', hair: 'cap', outfit: 'plain',
    skin: '#c98d63', skinDark: '#a86f4c', hairC: '#241c1a', hairDark: '#150f0e',
    shirt: '#f2c14e', shirtDark: '#c99a2f', pants: '#3d4a63', shoes: '#252f3e' },

  { id: 'nimbus', name: 'Nimbus', hair: 'hood', outfit: 'plain',
    skin: '#ffd4b0', skinDark: '#e3b28c', hairC: '#8e7bd6', hairDark: '#6d5cb0',
    shirt: '#8e7bd6', shirtDark: '#6d5cb0', pants: '#454063', shoes: '#2b283f' },

  { id: 'marshmallow', name: 'Marshmallow', hair: 'beanie', outfit: 'scarf',
    skin: '#f0c49a', skinDark: '#d4a077', hairC: '#e86f8f', hairDark: '#c04f6d',
    shirt: '#f7f2e8', shirtDark: '#d8d0c2', pants: '#4a5568', shoes: '#2e3644' },

  { id: 'sesame', name: 'Sesame', hair: 'catears', outfit: 'plain',
    skin: '#8d5a3b', skinDark: '#71462c', hairC: '#3a2f3d', hairDark: '#241d26',
    shirt: '#b28ce0', shirtDark: '#8e69bd', pants: '#3f3b57', shoes: '#272338' },

  { id: 'ginger', name: 'Ginger', hair: 'spiky', outfit: 'overalls',
    skin: '#ffd9b8', skinDark: '#e8b892', hairC: '#e0873c', hairDark: '#b96828',
    shirt: '#5ec2d9', shirtDark: '#3f9db3', pants: '#4a6a8c', shoes: '#2c3d52' },

  { id: 'lavender', name: 'Lavender', hair: 'long', outfit: 'plain',
    skin: '#f7d7b8', skinDark: '#dcb593', hairC: '#7e6bb5', hairDark: '#5f4f91',
    shirt: '#f28fc4', shirtDark: '#c96b9e', pants: '#43506b', shoes: '#28323f' },
];

/* Thứ tự khung hình trong atlas. Mỗi nhân vật là một hàng, mỗi khoá dưới đây là một cột. */
const FRAMES = [
  'd0', 'd1', 'd2',   // đi xuống (nhìn thẳng): đứng yên, bước trái, bước phải
  'u0', 'u1', 'u2',   // đi lên (quay lưng)
  's0', 's1', 's2',   // đi ngang, hướng phải; hướng trái vẽ bằng cách lật
  'k0',               // ngồi, tay buông
  'k1', 'k2',         // ngồi, hai nhịp gõ phím
  'k3',               // ngồi gục xuống (tạm dừng / ngủ)
  'kf',               // ngồi QUAY MẶT RA - ngoái lại nhìn khi có người rê chuột vào
];
const FRAME_INDEX = {};
FRAMES.forEach((k, i) => { FRAME_INDEX[k] = i; });

/* ------------------------------------------------------------- nét cơ bản */

/** Hình chữ nhật đặc, toạ độ tính bằng pixel GỐC rồi quy về lưới con. Mọi nét trong file này
 *  đi qua đây, nên chỉ mình nó biết tới SPRITE_SS.
 *
 *  Bo hai MÉP chứ không bo gốc rồi nhân bề rộng: `round(x)+round(w)` lệch với `round(x+w)` ở
 *  toạ độ lẻ, và chỗ lệch đó thành một khe hở giữa hai mảng lẽ ra phải liền nhau - ở nền tối
 *  nó hiện thành đường kẻ sáng chạy dọc thân người. */
function px(g, x, y, w, h, color) {
  const x0 = Math.round(x * SPRITE_SS), x1 = Math.round((x + w) * SPRITE_SS);
  const y0 = Math.round(y * SPRITE_SS), y1 = Math.round((y + h) * SPRITE_SS);
  if (x1 <= x0 || y1 <= y0) return;
  g.fillStyle = color;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
}

/* Pha màu. Nhờ có mấy hàm này mà bóng đổ và mảng sáng dựng được từ chính màu của nhân vật,
 * không phải khai thêm màu cho từng người - hơn trăm nhân vật thì khai tay là không xong. */
const RGB_CACHE = new Map();

function toRgb(c) {
  let v = RGB_CACHE.get(c);
  if (v) return v;
  const s = String(c).replace('#', '');
  const n = s.length === 3
    ? parseInt(s[0] + s[0] + s[1] + s[1] + s[2] + s[2], 16)
    : parseInt(s.slice(0, 6), 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  RGB_CACHE.set(c, v);
  return v;
}

function mixC(a, b, t) {
  const x = toRgb(a), y = toRgb(b);
  const r = Math.round(x[0] + (y[0] - x[0]) * t);
  const g = Math.round(x[1] + (y[1] - x[1]) * t);
  const bl = Math.round(x[2] + (y[2] - x[2]) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

const lighten = (c, t) => mixC(c, '#ffffff', t);
const darken = (c, t) => mixC(c, '#191320', t);   // ngả tím chứ không ngả đen: bóng thuần đen
                                                  // làm màu chết, đây là mẹo cũ của pixel art

/** Hình chữ nhật BO GÓC thật, vẽ từng hàng của lưới con theo cung tròn bán kính `r`.
 *
 *  Ở lưới thô thì "bo góc" chỉ là vát đúng một pixel, và mọi thứ trong phòng - đầu người,
 *  thân thú, giọt slime - đều hoá ra cái hộp. Có lưới con thì bo được theo đường tròn, và
 *  đó là thứ đọc ra ngay cả khi nhìn lướt cả phòng. */
function roundBox(g, x, y, w, h, r, color) {
  const S = SPRITE_SS;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const y0 = Math.round(y * S), y1 = Math.round((y + h) * S);
  g.fillStyle = color;
  for (let iy = y0; iy < y1; iy++) {
    const cy = (iy + 0.5) / S - y;                       // vị trí trong khối, đơn vị pixel gốc
    let d = 0;
    if (cy < rr) d = rr - cy;
    else if (cy > h - rr) d = cy - (h - rr);
    const inset = d > 0 ? rr - Math.sqrt(Math.max(0, rr * rr - d * d)) : 0;
    const x0 = Math.round((x + inset) * S), x1 = Math.round((x + w - inset) * S);
    if (x1 > x0) g.fillRect(x0, iy, x1 - x0, 1);
  }
}

/** Chóp nhọn: rộng ở đáy, thu dần về đỉnh. Tai mèo, chỏm tóc dựng, sừng, ngọn lửa - trước
 *  đây tất cả đều là hình chữ nhật, nên "tai nhọn" thật ra là hai cái cột vuông. */
function spike(g, x, y, w, h, color) {
  const S = SPRITE_SS;
  const y0 = Math.round(y * S), y1 = Math.round((y + h) * S);
  const cx = x + w / 2;
  g.fillStyle = color;
  for (let iy = y0; iy < y1; iy++) {
    const t = (iy + 0.5 - y0) / Math.max(1, y1 - y0);   // 0 ở đỉnh, 1 ở đáy
    const ww = w * (0.3 + 0.7 * t);
    const a = Math.round((cx - ww / 2) * S), b = Math.round((cx + ww / 2) * S);
    if (b > a) g.fillRect(a, iy, b - a, 1);
  }
}

/** Khối đầu bo góc - dùng chung cho người, thú và cả bộ Hải trình / Nhẫn giả. */
function headBlock(g, y0, h, color) {
  roundBox(g, 3, y0, 10, h, 1.7, color);
}

/** Con mắt: tròng bo góc, con ngươi, chấm loá góc trên trái và một vệt phản chiếu ở đáy.
 *
 *  Bản trước mắt là một ô vuông đặc 2x2 cộng một chấm trắng 1x1 - đúng một nửa con mắt là
 *  chấm loá, nên ánh nhìn trông như hai hạt đậu. Cùng diện tích ấy, lưới con chứa được cả
 *  bốn thành phần và khuôn mặt lập tức có thần. */
function eye(g, x, y, w, h, ink) {
  const c = ink || INK;
  roundBox(g, x, y, w, h, Math.min(w, h) * 0.4, c);
  px(g, x + w * 0.28, y + h * 0.52, w * 0.5, h * 0.36, lighten(c, 0.22));  // phản chiếu đáy
  px(g, x + w * 0.1, y + h * 0.12, w * 0.36, h * 0.3, EYE_LIGHT);          // chấm loá
}

/** Mặt nhìn thẳng: mắt to có chấm sáng, má hồng, miệng nhỏ. Đây là toàn bộ phần "cute". */
function faceFront(g, p, dy) {
  eye(g, 4, 5 + dy, 2, 2);
  eye(g, 10, 5 + dy, 2, 2);
  px(g, 3, 6.9 + dy, 1.1, 0.9, BLUSH);          // má
  px(g, 11.9, 6.9 + dy, 1.1, 0.9, BLUSH);
  px(g, 7.7, 6.6 + dy, 0.7, 0.4, p.skinDark);   // sống mũi
  px(g, 7, 7.5 + dy, 2, 0.34, p.skinDark);      // miệng, cong bằng hai nét lệch nhau 1/3 pixel
  px(g, 7.3, 7.84 + dy, 1.4, 0.33, p.skinDark);
}

/** Mặt nhìn ngang: chỉ một mắt, thêm cái mũi nhỏ nhô ra. */
function faceSide(g, p) {
  eye(g, 9, 5, 2, 2);
  px(g, 12, 5.9, 1, 0.9, p.skin);               // mũi
  px(g, 12, 6.6, 1, 0.34, p.skinDark);          // gờ dưới mũi cho khỏi bẹt
  px(g, 10.8, 7, 1.1, 0.9, BLUSH);
  px(g, 9.4, 7.6, 1.6, 0.34, p.skinDark);       // miệng
}

/* ------------------------------------------------------------- kiểu tóc
 *
 * Mỗi kiểu có 3 mặt: `front` (thấy mặt), `back` (quay lưng, tóc phủ kín), `side` (nhìn
 * ngang). Tư thế ngồi dùng lại `back` vì bàn quay vào tường.
 *
 * `dy` để tư thế ngồi gục xuống hạ cả khối đầu xuống mà không phải viết lại kiểu tóc.
 * Kiểu tóc nào cũng phải phủ kín mép trên của khối đầu, hở ra một hàng pixel màu da là
 * nhân vật trông như bị hói một mảng. */
const HAIR = {
  bob: {
    front(g, p, dy) {
      headBlock(g, dy, 5, p.hairC);
      px(g, 3, 4 + dy, 1, 4, p.hairC);        // hai lọn ôm má
      px(g, 12, 4 + dy, 1, 4, p.hairC);
      px(g, 4, 4 + dy, 8, 1, p.hairDark);     // mái
    },
    back(g, p, dy) {
      headBlock(g, dy, 8, p.hairC);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      headBlock(g, 0, 5, p.hairC);
      px(g, 3, 4, 4, 4, p.hairC);
      px(g, 4, 4, 6, 1, p.hairDark);
    },
  },

  afro: {
    front(g, p, dy) {
      // Khối tròn to hơn đầu, tràn ra hai bên - đây là kiểu dễ nhận ra nhất từ xa
      px(g, 3, dy, 10, 1, p.hairDark);
      px(g, 2, 1 + dy, 12, 4, p.hairC);
      px(g, 1, 2 + dy, 1, 3, p.hairC);
      px(g, 14, 2 + dy, 1, 3, p.hairC);
      px(g, 4, 4 + dy, 8, 1, p.hairDark);
    },
    back(g, p, dy) {
      px(g, 3, dy, 10, 1, p.hairDark);
      px(g, 2, 1 + dy, 12, 7, p.hairC);
      px(g, 1, 2 + dy, 1, 5, p.hairC);
      px(g, 14, 2 + dy, 1, 5, p.hairC);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      px(g, 3, 0, 10, 1, p.hairDark);
      px(g, 2, 1, 11, 4, p.hairC);
      px(g, 1, 2, 1, 4, p.hairC);
      px(g, 3, 4, 4, 3, p.hairC);
    },
  },

  bun: {
    front(g, p, dy) {
      px(g, 6, dy - 1 < 0 ? 0 : dy - 1, 4, 2, p.hairC);   // búi trên đỉnh
      headBlock(g, dy, 5, p.hairC);
      px(g, 3, 4 + dy, 1, 3, p.hairC);
      px(g, 12, 4 + dy, 1, 3, p.hairC);
      px(g, 4, 4 + dy, 8, 1, p.hairDark);
    },
    back(g, p, dy) {
      px(g, 6, dy - 1 < 0 ? 0 : dy - 1, 4, 2, p.hairC);
      headBlock(g, dy, 8, p.hairC);
      px(g, 6, 1 + dy, 4, 1, p.hairDark);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      px(g, 6, 0, 4, 2, p.hairC);
      headBlock(g, 0, 5, p.hairC);
      px(g, 3, 4, 4, 3, p.hairC);
    },
  },

  ponytail: {
    front(g, p, dy) {
      headBlock(g, dy, 5, p.hairC);
      px(g, 2, 3 + dy, 1, 5, p.hairC);        // đuôi ló ra bên trái
      px(g, 12, 4 + dy, 1, 3, p.hairC);
      px(g, 4, 4 + dy, 8, 1, p.hairDark);
    },
    back(g, p, dy) {
      headBlock(g, dy, 8, p.hairC);
      px(g, 6, 8 + dy, 4, 4, p.hairC);        // đuôi ngựa xoã sau lưng
      px(g, 6, 8 + dy, 4, 1, p.hairDark);
    },
    side(g, p) {
      headBlock(g, 0, 5, p.hairC);
      px(g, 3, 4, 4, 3, p.hairC);
      px(g, 1, 4, 2, 6, p.hairC);
      px(g, 4, 4, 6, 1, p.hairDark);
    },
  },

  cap: {
    front(g, p, dy) {
      headBlock(g, dy, 4, p.shirt);           // mũ ăn màu áo cho ra một bộ
      px(g, 3, 3 + dy, 11, 1, p.shirtDark);   // lưỡi trai chìa sang phải
      px(g, 3, 4 + dy, 1, 3, p.hairC);        // tóc lòi ra hai bên
      px(g, 12, 4 + dy, 1, 3, p.hairC);
    },
    back(g, p, dy) {
      headBlock(g, dy, 4, p.shirt);
      px(g, 7, 1 + dy, 2, 1, p.shirtDark);    // cúc trên chóp
      px(g, 3, 4 + dy, 10, 4, p.hairC);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      headBlock(g, 0, 4, p.shirt);
      px(g, 8, 3, 7, 1, p.shirtDark);
      px(g, 3, 4, 4, 3, p.hairC);
    },
  },

  hood: {
    front(g, p, dy) {
      px(g, 2, dy, 12, 5, p.hairC);           // mũ trùm rộng hơn đầu
      px(g, 3, dy, 10, 1, p.hairDark);
      px(g, 2, 4 + dy, 2, 5, p.hairC);        // hai vạt rủ xuống
      px(g, 12, 4 + dy, 2, 5, p.hairC);
    },
    back(g, p, dy) {
      px(g, 2, dy, 12, 9, p.hairC);
      px(g, 3, dy, 10, 1, p.hairDark);
      px(g, 5, 4 + dy, 6, 1, p.hairDark);     // đường xếp của mũ
    },
    side(g, p) {
      px(g, 2, 0, 12, 5, p.hairC);
      px(g, 3, 0, 10, 1, p.hairDark);
      px(g, 2, 4, 4, 5, p.hairC);
    },
  },

  beanie: {
    front(g, p, dy) {
      px(g, 7, dy - 1 < 0 ? 0 : dy - 1, 2, 1, p.hairDark);  // cục bông
      headBlock(g, dy, 4, p.hairC);
      px(g, 3, 3 + dy, 10, 1, p.hairDark);    // viền mũ len
      px(g, 3, 4 + dy, 1, 3, p.hairDark);
      px(g, 12, 4 + dy, 1, 3, p.hairDark);
    },
    back(g, p, dy) {
      px(g, 7, dy - 1 < 0 ? 0 : dy - 1, 2, 1, p.hairDark);
      headBlock(g, dy, 4, p.hairC);
      px(g, 3, 3 + dy, 10, 1, p.hairDark);
      px(g, 3, 4 + dy, 10, 4, p.hairDark);
    },
    side(g, p) {
      px(g, 7, 0, 2, 1, p.hairDark);
      headBlock(g, 0, 4, p.hairC);
      px(g, 3, 3, 10, 1, p.hairDark);
      px(g, 3, 4, 4, 3, p.hairDark);
    },
  },

  catears: {
    front(g, p, dy) {
      spike(g, 3, dy - 0.6, 2.2, 2.6, p.hairC);   // hai tai nhọn
      spike(g, 10.8, dy - 0.6, 2.2, 2.6, p.hairC);
      spike(g, 3.5, dy, 1.2, 1.8, BLUSH);         // lòng tai
      spike(g, 11.3, dy, 1.2, 1.8, BLUSH);
      headBlock(g, 1 + dy, 4, p.hairC);
      px(g, 3, 4 + dy, 1, 3, p.hairC);
      px(g, 12, 4 + dy, 1, 3, p.hairC);
      px(g, 4, 4 + dy, 8, 1, p.hairDark);
    },
    back(g, p, dy) {
      spike(g, 3, dy - 0.6, 2.2, 2.6, p.hairC);
      spike(g, 10.8, dy - 0.6, 2.2, 2.6, p.hairC);
      headBlock(g, 1 + dy, 7, p.hairC);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      spike(g, 4, -0.6, 2.2, 2.6, p.hairC);
      spike(g, 8.8, -0.6, 2.2, 2.6, p.hairC);
      headBlock(g, 1, 4, p.hairC);
      px(g, 3, 4, 4, 3, p.hairC);
    },
  },

  spiky: {
    front(g, p, dy) {
      spike(g, 3.6, dy - 0.8, 2.4, 2.4, p.hairC);   // ba chóp dựng
      spike(g, 6.8, dy - 1, 2.4, 2.6, p.hairC);
      spike(g, 10, dy - 0.8, 2.4, 2.4, p.hairC);
      headBlock(g, 1 + dy, 4, p.hairC);
      px(g, 3, 4 + dy, 1, 2, p.hairC);
      px(g, 12, 4 + dy, 1, 2, p.hairC);
      px(g, 4, 4 + dy, 8, 1, p.hairDark);
    },
    back(g, p, dy) {
      spike(g, 3.6, dy - 0.8, 2.4, 2.4, p.hairC);
      spike(g, 6.8, dy - 1, 2.4, 2.6, p.hairC);
      spike(g, 10, dy - 0.8, 2.4, 2.4, p.hairC);
      headBlock(g, 1 + dy, 7, p.hairC);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      spike(g, 3.6, -0.8, 2.4, 2.4, p.hairC);
      spike(g, 6.8, -1, 2.4, 2.6, p.hairC);
      spike(g, 10, -0.8, 2.4, 2.4, p.hairC);
      headBlock(g, 1, 4, p.hairC);
      px(g, 3, 4, 4, 3, p.hairC);
    },
  },

  long: {
    front(g, p, dy) {
      headBlock(g, dy, 5, p.hairC);
      px(g, 2, 3 + dy, 2, 7, p.hairC);        // hai dải tóc dài quá vai
      px(g, 12, 3 + dy, 2, 7, p.hairC);
      px(g, 4, 4 + dy, 8, 1, p.hairDark);
    },
    back(g, p, dy) {
      headBlock(g, dy, 8, p.hairC);
      px(g, 2, 3 + dy, 12, 9, p.hairC);       // xoã kín lưng
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      headBlock(g, 0, 5, p.hairC);
      px(g, 2, 3, 5, 8, p.hairC);
      px(g, 4, 4, 6, 1, p.hairDark);
    },
  },
};

/* ------------------------------------------------------------- trang phục */

/** Hoạ tiết trên thân, vẽ ĐÈ lên áo. Giữ ít chi tiết: 8 pixel ngang không chứa nổi nhiều. */
function outfitFront(g, p, y0) {
  if (p.outfit === 'overalls') {
    px(g, 5, y0, 1, 6, p.pants);              // hai quai yếm
    px(g, 10, y0, 1, 6, p.pants);
    px(g, 5, y0 + 3, 6, 3, p.pants);
  } else if (p.outfit === 'scarf') {
    px(g, 4, y0, 8, 2, BLUSH);                // khăn quàng
    px(g, 6, y0 + 2, 2, 2, BLUSH);
  } else if (p.outfit === 'apron') {
    px(g, 6, y0 + 1, 4, 5, '#f7f2e8');        // tạp dề
    px(g, 5, y0 + 1, 6, 1, '#f7f2e8');
  }
}

/* ------------------------------------------------------------- các tư thế */

/** Khối vải: một vệt sáng chạy dọc mép trái và một mảng tối ở gấu.
 *
 *  Hậu kỳ ở cuối file chỉ lo được đường VIỀN ngoài silhouette, tức chiều dày. Cái này lo
 *  KHỐI: không có nó thì thân người là một mảng màu phẳng lì, có nó thì đọc ra được cái áo
 *  có bề dày và nguồn sáng đến từ trên trái - cùng hướng với mọi bộ. */
function clothShade(g, x, y, w, h, color) {
  px(g, x, y + h - h * 0.26, w, h * 0.26, darken(color, 0.14));
  px(g, x, y, w * 0.22, h * 0.72, lighten(color, 0.09));
}

/** Đôi chân + giày. `step` 0 đứng yên, 1 và 2 là hai nhịp bước. */
function legs(g, p, step) {
  const off = step === 1 ? 1 : step === 2 ? -1 : 0;
  px(g, 5, 16, 2, 3, p.pants);
  px(g, 9, 16, 2, 3, p.pants);
  px(g, 5, 16, 0.5, 3, lighten(p.pants, 0.1));      // mặt ngoài ống quần hứng sáng
  px(g, 10.5, 16, 0.5, 3, darken(p.pants, 0.12));
  // Bước đi: một bàn chân đưa ra trước, bàn kia lùi lại. Chỉ xê dịch giày chứ không xê dịch
  // cả ống chân - dịch cả chân ở kích thước này thì nhân vật trông như bị gãy.
  roundBox(g, 5 - Math.max(0, off), 18.85, 2, 1.15, 0.45, p.shoes);
  roundBox(g, 9 + Math.max(0, -off), 18.85, 2, 1.15, 0.45, p.shoes);
}

function torso(g, p) {
  roundBox(g, 4, 10, 8, 6, 0.8, p.shirt);
  clothShade(g, 4, 10, 8, 6, p.shirt);
  px(g, 4, 10, 8, 1, p.shirtDark);            // cổ áo
  px(g, 6.4, 10, 3.2, 0.5, darken(p.shirtDark, 0.2));   // hõm cổ
  outfitFront(g, p, 10);
  px(g, 3, 11, 1, 4, p.shirt);                // hai tay
  px(g, 12, 11, 1, 4, p.shirt);
  px(g, 3, 11, 1, 4, lighten(p.shirt, 0.06));
  px(g, 12, 11, 1, 4, darken(p.shirt, 0.1));
  roundBox(g, 3, 14.9, 1, 1.1, 0.4, p.skin);  // bàn tay
  roundBox(g, 12, 14.9, 1, 1.1, 0.4, p.skin);
}

/** Nhìn thẳng: thấy mặt. */
function drawDown(g, p, step) {
  headBlock(g, 1, 9, p.skin);
  HAIR[p.hair].front(g, p, 0);
  faceFront(g, p, 0);
  torso(g, p);
  legs(g, p, step);
}

/** Quay lưng: không có mặt, tóc phủ kín. */
function drawUp(g, p, step) {
  headBlock(g, 1, 9, p.skin);
  HAIR[p.hair].back(g, p, 0);
  torso(g, p);
  legs(g, p, step);
}

/** Nhìn ngang (hướng phải). Hướng trái do office.js lật ngang khi vẽ. */
function drawSide(g, p, step) {
  headBlock(g, 1, 9, p.skin);
  HAIR[p.hair].side(g, p);
  faceSide(g, p);
  roundBox(g, 4, 10, 8, 6, 0.8, p.shirt);
  clothShade(g, 4, 10, 8, 6, p.shirt);
  px(g, 4, 10, 8, 1, p.shirtDark);
  outfitFront(g, p, 10);
  // Chỉ thấy một tay, và nó đánh theo nhịp chân
  const ax = step === 1 ? 10 : step === 2 ? 4 : 7;
  roundBox(g, ax, 11, 2, 4, 0.6, p.shirtDark);
  roundBox(g, ax, 14.9, 2, 1.1, 0.45, p.skin);
  legs(g, p, step);
}

/* Ngồi: nhìn từ sau lưng vì bàn quay mặt vào tường, người ngồi quay lưng ra phía người xem.
 * Đây là góc duy nhất cho thấy được cả người lẫn màn hình cùng lúc. Chân khuất sau ghế nên
 * không vẽ - vẽ chân thò ra dưới ghế trông như đang lơ lửng.
 *
 * `arms === 'turn'` là tư thế NGOÁI LẠI NHÌN: vẫn nguyên cái thân ngồi ấy, chỉ đổi đầu sang
 * mặt trước. Người ta rê chuột vào một người đang làm việc thì muốn thấy người đó ngước lên
 * đáp lại, chứ không phải thấy họ đứng dậy rời ghế - xem ghi chú ở office.js/setHover. */
function drawSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0;      // gục xuống thì cả đầu lẫn vai thấp hơn
  const turn = arms === 'turn';
  headBlock(g, 1 + drop, 9, p.skin);
  if (turn) { HAIR[p.hair].front(g, p, drop); faceFront(g, p, drop); }
  else HAIR[p.hair].back(g, p, drop);

  // Bắt đầu ở y=10, ĐÚNG hàng kết thúc của khối đầu. Để lệch một hàng là hở một vệt sàn
  // ngang cổ, và ở bậc phóng 5 nhìn như cái đầu rời ra khỏi thân.
  roundBox(g, 3, 10 + drop, 10, 7, 1, p.shirt);   // lưng rộng hơn vì đang ngồi hơi khom
  clothShade(g, 3, 10 + drop, 10, 7, p.shirt);
  px(g, 3, 10 + drop, 10, 1, p.shirtDark);
  // Ngoái lại thì thấy NGỰC chứ không thấy lưng: bỏ rãnh sống lưng, thay bằng hoạ tiết áo.
  if (turn) outfitFront(g, p, 10 + drop);
  else px(g, 7.4, 10.6 + drop, 1.2, 5.4, darken(p.shirt, 0.1));   // rãnh sống lưng

  if (arms === 'sleep') {
    px(g, 2, 12 + drop, 2, 3, p.shirtDark);   // hai tay buông thõng
    px(g, 12, 12 + drop, 2, 3, p.shirtDark);
    roundBox(g, 2, 14.9 + drop, 2, 1.1, 0.45, p.skin);
    roundBox(g, 12, 14.9 + drop, 2, 1.1, 0.45, p.skin);
    return;
  }
  if (arms === 'rest' || turn) {              // ngoái lại thì rời tay khỏi bàn phím
    px(g, 2, 12, 2, 4, p.shirtDark);
    px(g, 12, 12, 2, 4, p.shirtDark);
    roundBox(g, 2, 15.9, 2, 1.1, 0.45, p.skin);
    roundBox(g, 12, 15.9, 2, 1.1, 0.45, p.skin);
    return;
  }
  // Gõ phím: hai cẳng tay vươn ra trước, hai bàn tay so le nhau một pixel theo nhịp.
  const up = arms === 'typeA';
  px(g, 1, 11, 3, 4, p.shirtDark);
  px(g, 12, 11, 3, 4, p.shirtDark);
  px(g, 1, up ? 14 : 15, 3, 1, p.skin);
  px(g, 12, up ? 15 : 14, 3, 1, p.skin);
}

function drawPersonFrame(g, p, key) {
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
    case 'kf': return drawSit(g, p, 'turn');
    default: return drawDown(g, p, 0);
  }
}


/* ============================================================ BỘ 2: THÚ CƯNG
 *
 * Cùng khung 16x20 với người, nhưng tỷ lệ khác: đầu to tròn chiếm nửa trên, thân thấp và
 * bè, bốn chân ngắn. Khác biệt giữa các con nằm ở TAI và MÕM chứ không ở màu - nhìn từ xa
 * cái tai là thứ duy nhất còn đọc được.
 */

const PET_CHARS = [
  { id: 'mimi', name: 'Mimi', ear: 'cat', tail: 'up',
    body: '#f0a05a', bodyDark: '#cc7f3c', belly: '#ffe0bd', nose: '#e0708a' },
  { id: 'bunbun', name: 'Bun Bun', ear: 'long', tail: 'puff',
    body: '#f3e3d0', bodyDark: '#d6c3ac', belly: '#fff6ec', nose: '#e0708a' },
  { id: 'gaugau', name: 'Gau Gau', ear: 'flop', tail: 'wag',
    body: '#c08a55', bodyDark: '#9c6b3d', belly: '#f0dcc0', nose: '#3a2f2a' },
  { id: 'meomun', name: 'Meo Mun', ear: 'cat', tail: 'up',
    body: '#4a4550', bodyDark: '#332f39', belly: '#6d6675', nose: '#e0708a' },
  { id: 'cuu', name: 'Cuu', ear: 'flop', tail: 'none',
    body: '#f2efe6', bodyDark: '#cfc9ba', belly: '#f7f5ef', nose: '#3a3038', wool: true },
  { id: 'bosua', name: 'Bo Sua', ear: 'horn', tail: 'wag',
    body: '#f5f0e8', bodyDark: '#3a3038', belly: '#ffd9d0', nose: '#e8a0a8', spots: true },
  { id: 'heo', name: 'Heo', ear: 'flop', tail: 'curl',
    body: '#f2a3b0', bodyDark: '#d07e8d', belly: '#ffc9d2', nose: '#e0708a' },
  { id: 'gacon', name: 'Ga Con', ear: 'comb', tail: 'up',
    body: '#f5d76e', bodyDark: '#d4b246', belly: '#fff0b8', nose: '#f0913a', beak: true },
  { id: 'vitcon', name: 'Vit Con', ear: 'none', tail: 'up',
    body: '#8fbf6a', bodyDark: '#6d9a4c', belly: '#e8dfb8', nose: '#f0b13a', beak: true },
  { id: 'ech', name: 'Ech', ear: 'frog', tail: 'none',
    body: '#6ec27b', bodyDark: '#4f9a5c', belly: '#d6efc0', nose: '#3a5030' },
];

/** Tai - thứ phân biệt các con vật ở kích thước này. `y0` là đỉnh khối đầu. */
function petEars(g, p, y0) {
  const k = p.ear;
  if (k === 'cat') {
    spike(g, 3, y0 - 2, 2.2, 3, p.body);  // hai tai nhọn dựng
    spike(g, 10.8, y0 - 2, 2.2, 3, p.body);
    spike(g, 3.5, y0 - 1.4, 1.2, 2, p.nose);   // lòng tai
    spike(g, 11.3, y0 - 1.4, 1.2, 2, p.nose);
  } else if (k === 'long') {
    roundBox(g, 4, y0 - 5, 2, 6, 0.9, p.body);   // tai thỏ dài
    roundBox(g, 10, y0 - 5, 2, 6, 0.9, p.body);
    roundBox(g, 4.2, y0 - 4.2, 1.4, 4, 0.6, p.nose);
    roundBox(g, 10.4, y0 - 4.2, 1.4, 4, 0.6, p.nose);
  } else if (k === 'flop') {
    roundBox(g, 2, y0 - 0.3, 2, 4.3, 0.9, p.bodyDark);   // tai cụp rủ hai bên
    roundBox(g, 12, y0 - 0.3, 2, 4.3, 0.9, p.bodyDark);
  } else if (k === 'horn') {
    roundBox(g, 2, y0, 2, 2, 0.8, p.bodyDark);   // tai bò
    roundBox(g, 12, y0, 2, 2, 0.8, p.bodyDark);
    spike(g, 4, y0 - 2.2, 2, 2.4, '#e8d9a8');    // hai cái sừng
    spike(g, 10, y0 - 2.2, 2, 2.4, '#e8d9a8');
  } else if (k === 'comb') {
    roundBox(g, 6, y0 - 3, 4, 2.2, 0.9, '#e05050');   // mào gà
    spike(g, 6.6, y0 - 4, 1.4, 1.4, '#e05050');
    spike(g, 8.2, y0 - 4.2, 1.4, 1.6, '#e05050');
  } else if (k === 'frog') {
    roundBox(g, 3, y0 - 2, 3, 3, 1.4, p.body);   // hai mắt lồi
    roundBox(g, 10, y0 - 2, 3, 3, 1.4, p.body);
    eye(g, 3.9, y0 - 1.4, 1.3, 1.5);
    eye(g, 10.8, y0 - 1.4, 1.3, 1.5);
  }
}

function petFaceFront(g, p) {
  eye(g, 5, 7, 2, 2);
  eye(g, 9, 7, 2, 2);
  if (p.beak) {
    roundBox(g, 7, 9, 2, 2, 0.7, p.nose);      // mỏ
    px(g, 7, 9.9, 2, 0.34, darken(p.nose, 0.25));
  } else {
    roundBox(g, 6, 8.9, 4, 2.1, 0.9, p.belly); // mõm
    roundBox(g, 7, 8.9, 2, 1, 0.4, p.nose);    // mũi
    px(g, 7.7, 10, 0.6, 0.9, darken(p.belly, 0.2));   // rãnh giữa mõm
  }
  px(g, 3, 8.9, 1.1, 0.9, BLUSH);
  px(g, 11.9, 8.9, 1.1, 0.9, BLUSH);
}

/** Thân + bốn chân. `step` cho nhịp đi. */
function petBody(g, p, step, y0) {
  roundBox(g, 4, y0, 8, 5, 1.4, p.body);
  roundBox(g, 5, y0 + 1, 6, 3, 1.2, p.belly);        // bụng sáng hơn
  px(g, 4, y0 + 3.6, 8, 1.4, darken(p.body, 0.12));  // bụng dưới nằm trong bóng
  if (p.spots) {                          // đốm bò
    roundBox(g, 4, y0, 3, 2, 0.8, p.bodyDark);
    roundBox(g, 10, y0 + 2, 2, 2, 0.8, p.bodyDark);
  }
  if (p.wool) {                           // lông cừu lởm chởm
    for (let i = 0; i < 4; i++) {
      roundBox(g, 3.2, y0 + i, 1.3, 1.2, 0.6, p.body);
      roundBox(g, 11.5, y0 + i, 1.3, 1.2, 0.6, p.body);
    }
  }
  const off = step === 1 ? 1 : step === 2 ? -1 : 0;
  roundBox(g, 4 - Math.max(0, off), y0 + 5, 2, 2, 0.7, p.bodyDark);
  roundBox(g, 10 + Math.max(0, -off), y0 + 5, 2, 2, 0.7, p.bodyDark);
}

function petTail(g, p, x, y) {
  if (p.tail === 'up') px(g, x, y - 4, 2, 5, p.bodyDark);
  else if (p.tail === 'puff') px(g, x, y, 3, 3, p.belly);
  else if (p.tail === 'wag') px(g, x, y - 2, 2, 4, p.bodyDark);
  else if (p.tail === 'curl') { px(g, x, y, 2, 2, p.bodyDark); px(g, x + 1, y - 1, 1, 1, p.bodyDark); }
}

function petDown(g, p, step) {
  petEars(g, p, 3);
  headBlock(g, 3, 9, p.body);
  petFaceFront(g, p);
  petBody(g, p, step, 12);
}

function petUp(g, p, step) {
  petEars(g, p, 3);
  headBlock(g, 3, 9, p.body);
  px(g, 5, 5, 6, 3, p.bodyDark);          // gáy
  petBody(g, p, step, 12);
  petTail(g, p, 7, 13);
}

function petSide(g, p, step) {
  petEars(g, p, 3);
  headBlock(g, 3, 8, p.body);
  eye(g, 9, 7, 2, 2);                     // một mắt
  if (p.beak) roundBox(g, 13, 8, 2, 2, 0.7, p.nose);
  else { roundBox(g, 12, 8, 2, 2, 0.8, p.belly); roundBox(g, 13, 8.9, 1, 1, 0.4, p.nose); }
  roundBox(g, 3, 11, 10, 5, 1.5, p.body);
  roundBox(g, 4, 12, 8, 3, 1.2, p.belly);
  px(g, 3, 14.6, 10, 1.4, darken(p.body, 0.12));
  const off = step === 1 ? 1 : step === 2 ? -1 : 0;
  roundBox(g, 4 - Math.max(0, off), 16, 2, 3, 0.7, p.bodyDark);
  roundBox(g, 10 + Math.max(0, -off), 16, 2, 3, 0.7, p.bodyDark);
  petTail(g, p, 1, 12);
}

/* Ngồi ở bàn: nhìn từ sau lưng, chỉ thấy tai + đầu + lưng nhô lên khỏi mặt bàn. */
function petSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0;
  const turn = arms === 'turn';
  petEars(g, p, 3 + drop);
  headBlock(g, 3 + drop, 8, p.body);
  if (turn) petFaceFront(g, p);
  else px(g, 5, 9 + drop, 6, 2, p.bodyDark);   // gáy
  roundBox(g, 3, 11 + drop, 10, 6, 1.4, p.body);     // lưng
  roundBox(g, 4, 12 + drop, 8, 4, 1.2, p.belly);
  if (arms === 'sleep' || arms === 'rest' || turn) {
    px(g, 2, 13 + drop, 2, 3, p.bodyDark);
    px(g, 12, 13 + drop, 2, 3, p.bodyDark);
    return;
  }
  const up = arms === 'typeA';
  px(g, 1, 12, 3, 3, p.bodyDark);         // hai chân trước đặt lên bàn phím
  px(g, 12, 12, 3, 3, p.bodyDark);
  px(g, 1, up ? 15 : 16, 3, 1, p.belly);
  px(g, 12, up ? 16 : 15, 3, 1, p.belly);
}

function drawPetFrame(g, p, key) {
  switch (key) {
    case 'd0': return petDown(g, p, 0);
    case 'd1': return petDown(g, p, 1);
    case 'd2': return petDown(g, p, 2);
    case 'u0': return petUp(g, p, 0);
    case 'u1': return petUp(g, p, 1);
    case 'u2': return petUp(g, p, 2);
    case 's0': return petSide(g, p, 0);
    case 's1': return petSide(g, p, 1);
    case 's2': return petSide(g, p, 2);
    case 'k0': return petSit(g, p, 'rest');
    case 'k1': return petSit(g, p, 'typeA');
    case 'k2': return petSit(g, p, 'typeB');
    case 'k3': return petSit(g, p, 'sleep');
    case 'kf': return petSit(g, p, 'turn');
    default: return petDown(g, p, 0);
  }
}

/* ============================================================ BỘ 3: SLIME
 *
 * Kiểu dễ nhất để đọc ở kích thước nhỏ: một khối tròn, hai mắt to, không có tay chân nên
 * không cần lo tư thế. Đi lại thì nhún theo nhịp - thân co lại thì bè ra, đúng kiểu chất
 * lỏng. Phân biệt nhau bằng màu và một món trên đỉnh đầu.
 */

const SLIME_CHARS = [
  { id: 'lam', name: 'Lam', body: '#5aa9e6', bodyDark: '#3d82ba', hat: 'none' },
  { id: 'hong', name: 'Hong', body: '#f08fb0', bodyDark: '#c96a8c', hat: 'bow' },
  { id: 'la', name: 'La', body: '#6ec27b', bodyDark: '#4f9a5c', hat: 'leaf' },
  { id: 'cam', name: 'Cam', body: '#f0a04a', bodyDark: '#c97d2c', hat: 'none' },
  { id: 'tim', name: 'Tim', body: '#a07ad6', bodyDark: '#7d59b0', hat: 'crown' },
  { id: 'do', name: 'Do', body: '#e2606a', bodyDark: '#b8434d', hat: 'fire' },
  { id: 'vang', name: 'Vang', body: '#f0d05a', bodyDark: '#cba832', hat: 'none' },
  { id: 'xanhngoc', name: 'Xanh Ngoc', body: '#4fc3b0', bodyDark: '#329c8b', hat: 'bubble' },
  { id: 'than', name: 'Than', body: '#5a5566', bodyDark: '#3d3947', hat: 'horn' },
  { id: 'kem', name: 'Kem', body: '#f2e3cc', bodyDark: '#d0bfa4', hat: 'cherry' },
];

/** Vòm slime. `w` rộng, `h` cao - nhún bằng cách đổi hai số này.
 *
 *  Phải THÓT DẦN về đỉnh. Vẽ thành một khối chữ nhật bo góc thì nhìn ra cái hộp chứ không
 *  ra giọt - đúng lỗi của bản đầu, cả bộ trông như mấy cái TV cũ. */
function slimeDome(g, p, cx, baseY, w, h) {
  const S = SPRITE_SS;
  const top = baseY - h;
  const y0 = Math.round(top * S), y1 = Math.round(baseY * S);
  const hi = lighten(p.body, 0.16);
  for (let iy = y0; iy < y1; iy++) {
    const cy = (iy + 0.5) / S - top;                 // 0 ở đỉnh, h ở đáy
    // Nửa trên là cung tròn (đỉnh thót lại), nửa dưới nở ra chạm sàn - đúng dáng một giọt
    // chất lỏng. Bản trước thu theo bốn nấc số nguyên nên đỉnh gãy thành bậc thang.
    const t = Math.min(1, cy / (h * 0.72));
    const ww = w * (0.34 + 0.66 * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))));
    const a = Math.round((cx - ww / 2) * S), b = Math.round((cx + ww / 2) * S);
    if (b <= a) continue;
    g.fillStyle = cy > h - 1.6 ? p.bodyDark : p.body;
    g.fillRect(a, iy, b - a, 1);
    // Mảng sáng lệch về trái: khối trong suốt phải có chỗ hắt sáng, không thì nó là mảng màu
    // phẳng chứ không ra chất lỏng.
    if (cy > 0.6 && cy < h * 0.55) {
      g.fillStyle = hi;
      g.fillRect(a + Math.round(ww * S * 0.14), iy, Math.max(1, Math.round(ww * S * 0.2)), 1);
    }
  }
}

function slimeHat(g, p, topY) {
  const k = p.hat;
  if (k === 'leaf') { px(g, 7, topY - 3, 3, 2, '#5aa03c'); px(g, 8, topY - 4, 1, 1, '#5aa03c'); }
  else if (k === 'bow') { px(g, 5, topY - 3, 2, 3, '#f26a8d'); px(g, 9, topY - 3, 2, 3, '#f26a8d'); px(g, 7, topY - 2, 2, 1, '#d14a6d'); }
  else if (k === 'crown') { px(g, 5, topY - 3, 6, 2, '#f0c94a'); px(g, 5, topY - 4, 1, 1, '#f0c94a'); px(g, 8, topY - 5, 1, 2, '#f0c94a'); px(g, 10, topY - 4, 1, 1, '#f0c94a'); }
  else if (k === 'fire') { px(g, 7, topY - 4, 2, 4, '#f27a3a'); px(g, 8, topY - 5, 1, 1, '#f0c94a'); }
  else if (k === 'bubble') { px(g, 4, topY - 3, 2, 2, '#cdeef0'); px(g, 10, topY - 4, 2, 2, '#cdeef0'); }
  else if (k === 'horn') { px(g, 4, topY - 3, 2, 3, '#e8dcc0'); px(g, 10, topY - 3, 2, 3, '#e8dcc0'); }
  else if (k === 'cherry') { px(g, 8, topY - 4, 2, 2, '#e2505a'); px(g, 9, topY - 5, 1, 2, '#5aa03c'); }
}

function slimeFace(g, p, eyeY) {
  eye(g, 5, eyeY, 2, 3);
  eye(g, 9, eyeY, 2, 3);
  px(g, 7, eyeY + 3, 2, 0.4, INK);             // miệng cong
  px(g, 6.6, eyeY + 2.7, 0.4, 0.4, INK);
  px(g, 9, eyeY + 2.7, 0.4, 0.4, INK);
}

/** step 0 đứng yên, 1 nhún xuống (bè ra), 2 vươn lên (thon lại). */
function slimeShape(step) {
  if (step === 1) return { w: 14, h: 9 };
  if (step === 2) return { w: 11, h: 13 };
  return { w: 12, h: 11 };
}

function slimeDown(g, p, step) {
  const s = slimeShape(step);
  slimeDome(g, p, 8, 19, s.w, s.h);
  slimeHat(g, p, 19 - s.h);
  slimeFace(g, p, 19 - s.h + 3);
}

function slimeUp(g, p, step) {
  const s = slimeShape(step);
  slimeDome(g, p, 8, 19, s.w, s.h);
  slimeHat(g, p, 19 - s.h);                    // quay lưng thì không có mặt
}

function slimeSide(g, p, step) {
  const s = slimeShape(step);
  slimeDome(g, p, 8, 19, s.w, s.h);
  slimeHat(g, p, 19 - s.h);
  eye(g, 9, 19 - s.h + 3, 2, 3);
}

/* Ngồi ở bàn: nhô lên khỏi mặt bàn, quay lưng. Slime không có tay nên "gõ phím" diễn bằng
 * cách rung nhẹ sang hai bên - vẫn đọc ra là đang làm việc. */
function slimeSit(g, p, arms) {
  const drop = arms === 'sleep' ? 3 : 0;
  const shift = arms === 'typeA' ? -1 : arms === 'typeB' ? 1 : 0;
  slimeDome(g, p, 8 + shift, 19, 13, 12 - drop);
  slimeHat(g, p, 19 - (12 - drop));
  // Slime không có đầu riêng để ngoái, nên "quay lại" chính là hiện khuôn mặt ra.
  if (arms === 'turn') slimeFace(g, p, 19 - 12 + 3);
}

function drawSlimeFrame(g, p, key) {
  switch (key) {
    case 'd0': return slimeDown(g, p, 0);
    case 'd1': return slimeDown(g, p, 1);
    case 'd2': return slimeDown(g, p, 2);
    case 'u0': return slimeUp(g, p, 0);
    case 'u1': return slimeUp(g, p, 1);
    case 'u2': return slimeUp(g, p, 2);
    case 's0': return slimeSide(g, p, 0);
    case 's1': return slimeSide(g, p, 1);
    case 's2': return slimeSide(g, p, 2);
    case 'k0': return slimeSit(g, p, 'rest');
    case 'k1': return slimeSit(g, p, 'typeA');
    case 'k2': return slimeSit(g, p, 'typeB');
    case 'k3': return slimeSit(g, p, 'sleep');
    case 'kf': return slimeSit(g, p, 'turn');
    default: return slimeDown(g, p, 0);
  }
}

/* ============================================================ BỘ 4: MASCOT
 *
 * Bé tròn màu trắng, khác nhau ở cái đội trên đầu. Thân giữ nguyên cho cả bộ nên nhìn ra
 * ngay là cùng một họ, và cái mũ thành thứ duy nhất phải đọc - hợp với kích thước này.
 */

const MASCOT_CHARS = [
  { id: 'tron', name: 'Tron', hat: 'none', tint: '#f7f4ee' },
  { id: 'mucap', name: 'Mu Cap', hat: 'cap', tint: '#f7f4ee', c1: '#e2606a', c2: '#b8434d' },
  { id: 'nonla', name: 'Non La', hat: 'straw', tint: '#f7f4ee', c1: '#e8c87a', c2: '#c0a052' },
  { id: 'namrom', name: 'Nam Rom', hat: 'mushroom', tint: '#f7f4ee', c1: '#e2705a', c2: '#f7f4ee' },
  { id: 'bidao', name: 'Bi Dao', hat: 'pumpkin', tint: '#f7f4ee', c1: '#f0913a', c2: '#c46c1e' },
  { id: 'trumdau', name: 'Trum Dau', hat: 'hood', tint: '#f7f4ee', c1: '#3a3644', c2: '#26232e' },
  { id: 'nguoituyet', name: 'Nguoi Tuyet', hat: 'snow', tint: '#f7f4ee', c1: '#f0913a', c2: '#e2606a' },
  { id: 'huou', name: 'Huou', hat: 'antler', tint: '#f7f4ee', c1: '#8a5f3a', c2: '#6d4a2c' },
  { id: 'ong', name: 'Ong', hat: 'bee', tint: '#f5d76e', c1: '#3a3644', c2: '#cdeef0' },
  { id: 'hoa', name: 'Hoa', hat: 'flower', tint: '#f7f4ee', c1: '#f0c94a', c2: '#f2a3b0' },
];

function mascotHat(g, p, topY) {
  const k = p.hat;
  if (k === 'cap') { px(g, 4, topY - 3, 8, 3, p.c1); px(g, 4, topY - 1, 11, 1, p.c2); }
  else if (k === 'straw') { px(g, 3, topY - 2, 10, 2, p.c1); px(g, 2, topY, 12, 1, p.c2); }
  else if (k === 'mushroom') { px(g, 3, topY - 4, 10, 4, p.c1); px(g, 5, topY - 3, 2, 2, p.c2); px(g, 9, topY - 2, 2, 1, p.c2); }
  else if (k === 'pumpkin') { px(g, 3, topY - 5, 10, 5, p.c1); px(g, 5, topY - 4, 2, 2, p.c2); px(g, 9, topY - 4, 2, 2, p.c2); px(g, 7, topY - 6, 2, 1, '#5aa03c'); }
  else if (k === 'hood') { px(g, 2, topY - 4, 12, 6, p.c1); px(g, 4, topY, 8, 3, p.c2); }
  else if (k === 'snow') { px(g, 4, topY - 3, 8, 3, '#e8eef2'); px(g, 12, topY - 1, 2, 1, p.c1); px(g, 4, topY, 8, 1, p.c2); }
  else if (k === 'antler') { px(g, 4, topY - 4, 2, 4, p.c1); px(g, 10, topY - 4, 2, 4, p.c1); px(g, 2, topY - 3, 2, 1, p.c2); px(g, 12, topY - 3, 2, 1, p.c2); }
  else if (k === 'bee') { px(g, 5, topY - 4, 1, 4, p.c1); px(g, 10, topY - 4, 1, 4, p.c1); px(g, 4, topY - 6, 2, 2, p.c2); px(g, 10, topY - 6, 2, 2, p.c2); }
  else if (k === 'flower') { px(g, 6, topY - 3, 4, 3, p.c2); px(g, 7, topY - 2, 2, 1, p.c1); }
}

/** Thân bo tròn, hai chân bé tí. `dy` để nhún khi đi. */
function mascotBody(g, p, dy) {
  roundBox(g, 4, 6 + dy, 8, 11, 2.6, p.tint);
  px(g, 4, 14.4 + dy, 8, 2.6, darken(p.tint, 0.1));   // nửa dưới nằm trong bóng
  px(g, 4.6, 7 + dy, 1.4, 6, lighten(p.tint, 0.14));  // vệt sáng dọc mép trái
  roundBox(g, 5, 16.9 + dy, 2, 2.1, 0.8, darken(p.tint, 0.16));   // hai chân
  roundBox(g, 9, 16.9 + dy, 2, 2.1, 0.8, darken(p.tint, 0.16));
}

function mascotFace(g, dy) {
  eye(g, 5, 10 + dy, 2, 3);
  eye(g, 9, 10 + dy, 2, 3);
  px(g, 7.3, 13.1 + dy, 1.4, 0.34, INK);              // miệng
  px(g, 3, 12.9 + dy, 1.1, 0.9, BLUSH);
  px(g, 11.9, 12.9 + dy, 1.1, 0.9, BLUSH);
}

function mascotDown(g, p, step) {
  const dy = step === 1 ? 1 : 0;
  mascotBody(g, p, dy);
  mascotHat(g, p, 6 + dy);
  mascotFace(g, dy);
}

function mascotUp(g, p, step) {
  const dy = step === 1 ? 1 : 0;
  mascotBody(g, p, dy);
  mascotHat(g, p, 6 + dy);
}

function mascotSide(g, p, step) {
  const dy = step === 1 ? 1 : 0;
  mascotBody(g, p, dy);
  mascotHat(g, p, 6 + dy);
  eye(g, 9, 10 + dy, 2, 3);
  px(g, 11.9, 12.9 + dy, 1.1, 0.9, BLUSH);
}

function mascotSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0;
  roundBox(g, 4, 6 + drop, 8, 11, 2.6, p.tint);
  px(g, 4, 14.4 + drop, 8, 2.6, darken(p.tint, 0.1));
  px(g, 4.6, 7 + drop, 1.4, 6, lighten(p.tint, 0.14));
  mascotHat(g, p, 6 + drop);
  if (arms === 'turn') mascotFace(g, drop);
  if (arms === 'typeA' || arms === 'typeB') {
    const up = arms === 'typeA';
    px(g, 2, 12, 2, 3, p.tint);               // hai tay ngắn vươn ra bàn phím
    px(g, 12, 12, 2, 3, p.tint);
    px(g, 2, up ? 15 : 16, 2, 1, p.tint);
    px(g, 12, up ? 16 : 15, 2, 1, p.tint);
  } else {
    px(g, 2, 13 + drop, 2, 3, p.tint);
    px(g, 12, 13 + drop, 2, 3, p.tint);
  }
}

function drawMascotFrame(g, p, key) {
  switch (key) {
    case 'd0': return mascotDown(g, p, 0);
    case 'd1': return mascotDown(g, p, 1);
    case 'd2': return mascotDown(g, p, 2);
    case 'u0': return mascotUp(g, p, 0);
    case 'u1': return mascotUp(g, p, 1);
    case 'u2': return mascotUp(g, p, 2);
    case 's0': return mascotSide(g, p, 0);
    case 's1': return mascotSide(g, p, 1);
    case 's2': return mascotSide(g, p, 2);
    case 'k0': return mascotSit(g, p, 'rest');
    case 'k1': return mascotSit(g, p, 'typeA');
    case 'k2': return mascotSit(g, p, 'typeB');
    case 'k3': return mascotSit(g, p, 'sleep');
    case 'kf': return mascotSit(g, p, 'turn');
    default: return mascotDown(g, p, 0);
  }
}

/** Con mèo đi lang thang trong phòng. 10x8, hai nhịp chân. */
function drawCat(g, step) {
  const body = '#e0a94a', dark = '#b8842f';
  roundBox(g, 1, 3, 7, 4, 1.5, body);       // thân
  px(g, 1, 5.6, 7, 1.4, darken(body, 0.12));
  roundBox(g, 6.8, 1, 3.2, 3.2, 1.2, body); // đầu
  spike(g, 6.9, 0.6, 1.2, 1.4, dark);       // tai
  spike(g, 8.7, 0.6, 1.2, 1.4, dark);
  px(g, 9, 2.2, 0.7, 0.7, INK);             // mắt
  px(g, 9.6, 3, 0.6, 0.34, darken(body, 0.3));  // mũi
  roundBox(g, 0.2, 0.8, 0.9, 3.2, 0.45, dark);  // đuôi dựng
  roundBox(g, 1, 6.8, 2, 1.2, 0.5, step ? dark : body);
  roundBox(g, 5, 6.8, 2, 1.2, 0.5, step ? body : dark);
}

/* ============================================================ BỘ 5: HẢI TRÌNH
 *
 * 36 nhân vật lấy cảm hứng trực tiếp từ tấm mẫu người dùng cung cấp. Ở khuôn 16x20 không
 * thể giữ mọi chi tiết của tranh lớn, nên mỗi người được khoá bằng ba dấu hiệu đọc tốt nhất:
 * silhouette tóc/mũ, màu áo chính và một phụ kiện (sừng, kính, khăn, râu...). Khác với bộ
 * nhập ảnh, bộ này có đủ mặt trước, sau, ngang và bốn tư thế ngồi.
 */

const VOYAGE_CHARS = [
  { id: 'voyage01', name: 'Voyage 01', skin: '#f3bf91', hair: '#211b20', dark: '#171217', shirt: '#d84b35', shade: '#a8322a', pants: '#2676b8', accent: '#efbd3e', hat: 'straw' },
  { id: 'voyage02', name: 'Voyage 02', skin: '#e7b786', hair: '#3f9b69', dark: '#236449', shirt: '#23845c', shade: '#175a43', pants: '#263f40', accent: '#9f3138', hairType: 'spike' },
  { id: 'voyage03', name: 'Voyage 03', skin: '#f4c39b', hair: '#d66a32', dark: '#a74428', shirt: '#f1dfb2', shade: '#d0b778', pants: '#347fb1', accent: '#3f8db2', hairType: 'long' },
  { id: 'voyage04', name: 'Voyage 04', skin: '#f3c49b', hair: '#e3b32f', dark: '#b17b22', shirt: '#303944', shade: '#1f2730', pants: '#29313a', accent: '#d5a736', hairType: 'sweep' },
  { id: 'voyage05', name: 'Voyage 05', skin: '#efbd94', hair: '#24282e', dark: '#16191e', shirt: '#9b405b', shade: '#703046', pants: '#8c315d', accent: '#e2bd41', hairType: 'long' },
  { id: 'voyage06', name: 'Voyage 06', skin: '#eab282', hair: '#222027', dark: '#131217', shirt: '#c84633', shade: '#943228', pants: '#2873aa', accent: '#e88224', hat: 'goggles' },
  { id: 'voyage07', name: 'Voyage 07', skin: '#f1f0e6', hair: '#171b1e', dark: '#0d0f12', shirt: '#343b40', shade: '#20272b', pants: '#26353a', accent: '#e59235', face: 'skull', hairType: 'afro' },
  { id: 'voyage08', name: 'Voyage 08', skin: '#df986d', hair: '#227e96', dark: '#165362', shirt: '#e3a853', shade: '#a96d32', pants: '#52684f', accent: '#43aeca', face: 'mask', hairType: 'long' },
  { id: 'voyage09', name: 'Voyage 09', skin: '#e8b487', hair: '#2c2627', dark: '#171416', shirt: '#d79c28', shade: '#9b6820', pants: '#397eaf', accent: '#e0b44a', hat: 'wide' },
  { id: 'voyage10', name: 'Voyage 10', skin: '#e9b889', hair: '#25252a', dark: '#141419', shirt: '#237c9d', shade: '#17566d', pants: '#263b4d', accent: '#d9a62d', hat: 'goggles' },
  { id: 'voyage11', name: 'Voyage 11', skin: '#c9885d', hair: '#252426', dark: '#151416', shirt: '#3a8547', shade: '#285e35', pants: '#39483c', accent: '#6baf44', hairType: 'spike' },
  { id: 'voyage12', name: 'Voyage 12', skin: '#efbd99', hair: '#29252a', dark: '#161419', shirt: '#3a417f', shade: '#292e5b', pants: '#303b63', accent: '#b08db5', hairType: 'long' },
  { id: 'voyage13', name: 'Voyage 13', skin: '#e6ad7e', hair: '#332323', dark: '#1c1515', shirt: '#aa3e34', shade: '#782b27', pants: '#304052', accent: '#9d252d', hat: 'redwide' },
  { id: 'voyage14', name: 'Voyage 14', skin: '#e2ae7d', hair: '#e2c26c', dark: '#9e7842', shirt: '#e5d8bc', shade: '#bfa978', pants: '#7a7444', accent: '#d79c2c', hat: 'straw', face: 'beard' },
  { id: 'voyage15', name: 'Voyage 15', skin: '#c28a63', hair: '#2b2a29', dark: '#171716', shirt: '#386b43', shade: '#284a31', pants: '#5a4032', accent: '#bd6a2c', hat: 'wide', face: 'beard' },
  { id: 'voyage16', name: 'Voyage 16', skin: '#c78d64', hair: '#252629', dark: '#141517', shirt: '#315e3b', shade: '#21422a', pants: '#303b36', accent: '#d3ac35', hairType: 'long' },
  { id: 'voyage17', name: 'Voyage 17', skin: '#4d9db0', hair: '#24333b', dark: '#142027', shirt: '#dd7329', shade: '#a34f20', pants: '#24648a', accent: '#d8c253', face: 'mask', hairType: 'long' },
  { id: 'voyage18', name: 'Voyage 18', skin: '#e0a77a', hair: '#5cc0cb', dark: '#33818c', shirt: '#e8edf0', shade: '#aebfc8', pants: '#436174', accent: '#477da6', hairType: 'crop' },
  { id: 'voyage19', name: 'Voyage 19', skin: '#d9976f', hair: '#513432', dark: '#2e2020', shirt: '#e48b93', shade: '#b6606b', pants: '#985353', accent: '#d14963', hat: 'pinkhorn', face: 'snout' },
  { id: 'voyage20', name: 'Voyage 20', skin: '#e2ad7d', hair: '#d8a52d', dark: '#9a6c21', shirt: '#2b744e', shade: '#1d5038', pants: '#3f6d65', accent: '#a94750', hat: 'goggles', hairType: 'long' },
  { id: 'voyage21', name: 'Voyage 21', skin: '#d9a77d', hair: '#c3ccd0', dark: '#7e8b91', shirt: '#a85d2e', shade: '#754122', pants: '#344e50', accent: '#d5dadd', hairType: 'long', face: 'beard' },
  { id: 'voyage22', name: 'Voyage 22', skin: '#df9a68', hair: '#4b2a27', dark: '#2b1918', shirt: '#a84a2e', shade: '#71311f', pants: '#5b392a', accent: '#d47827', hat: 'goggles' },
  { id: 'voyage23', name: 'Voyage 23', skin: '#deb08a', hair: '#d8d7d2', dark: '#858783', shirt: '#bd4b33', shade: '#853427', pants: '#86472d', accent: '#71394f', hat: 'horns', hairType: 'long' },
  { id: 'voyage24', name: 'Voyage 24', skin: '#efbd94', hair: '#e3ae3d', dark: '#a97829', shirt: '#242a31', shade: '#181d22', pants: '#913e45', accent: '#d29b36', hairType: 'long' },
  { id: 'voyage25', name: 'Voyage 25', skin: '#dca27d', hair: '#dc7898', dark: '#9b4f69', shirt: '#d789a1', shade: '#a85873', pants: '#9c405f', accent: '#eeeeea', hat: 'top', hairType: 'long' },
  { id: 'voyage26', name: 'Voyage 26', skin: '#e6b084', hair: '#d06b2e', dark: '#93451f', shirt: '#2476a0', shade: '#18546f', pants: '#51442e', accent: '#da9e2e', hairType: 'crop' },
  { id: 'voyage27', name: 'Voyage 27', skin: '#e5b68e', hair: '#e4c34a', dark: '#a4852f', shirt: '#72a43f', shade: '#4e762d', pants: '#38483a', accent: '#c7d4d9', hairType: 'sweep' },
  { id: 'voyage28', name: 'Voyage 28', skin: '#7b76a8', hair: '#3f385e', dark: '#262239', shirt: '#8b667c', shade: '#614555', pants: '#2e617d', accent: '#c76a3d', face: 'mask', hairType: 'afro' },
  { id: 'voyage29', name: 'Voyage 29', skin: '#e6b187', hair: '#dfd7bc', dark: '#938a70', shirt: '#b55838', shade: '#803d2a', pants: '#4c5061', accent: '#82462c', hat: 'horns', hairType: 'long' },
  { id: 'voyage30', name: 'Voyage 30', skin: '#b77c55', hair: '#28282c', dark: '#151518', shirt: '#4b3c35', shade: '#302824', pants: '#423a31', accent: '#c48a2e', hat: 'cap', face: 'beard' },
  { id: 'voyage31', name: 'Voyage 31', skin: '#e4a77b', hair: '#76559a', dark: '#4f376c', shirt: '#4b4380', shade: '#322d5a', pants: '#344558', accent: '#c05b72', hat: 'wide', hairType: 'long' },
  { id: 'voyage32', name: 'Voyage 32', skin: '#d7a779', hair: '#dab34a', dark: '#9b782e', shirt: '#315b79', shade: '#203e54', pants: '#28445a', accent: '#b7c1c7', hairType: 'crop' },
  { id: 'voyage33', name: 'Voyage 33', skin: '#dfaa82', hair: '#76549d', dark: '#4e376c', shirt: '#30343c', shade: '#1f232a', pants: '#313844', accent: '#d25e31', hairType: 'crop' },
  { id: 'voyage34', name: 'Voyage 34', skin: '#769081', hair: '#263c3c', dark: '#172526', shirt: '#55765e', shade: '#3b5543', pants: '#304944', accent: '#d4ad32', face: 'fang', hairType: 'long' },
  { id: 'voyage35', name: 'Voyage 35', skin: '#efb887', hair: '#e1ae35', dark: '#a77926', shirt: '#a8323c', shade: '#76252e', pants: '#59323d', accent: '#d82c31', hat: 'horns', hairType: 'long' },
  { id: 'voyage36', name: 'Voyage 36', skin: '#c28a62', hair: '#c2b08a', dark: '#7a6a51', shirt: '#3d4241', shade: '#292d2d', pants: '#4a4032', accent: '#3585a6', hat: 'cap', face: 'glasses' },
];

function voyageHat(g, p, view, dy) {
  const h = p.hat;
  if (!h) return;
  if (h === 'straw') { px(g, 3, dy, 10, 2, '#d7a52e'); px(g, 2, 2 + dy, 12, 1, p.accent); }
  else if (h === 'wide' || h === 'redwide') { px(g, 3, dy, 10, 3, h === 'redwide' ? '#9d252d' : p.dark); px(g, 1, 3 + dy, 14, 1, p.accent); }
  else if (h === 'goggles') { px(g, 3, dy, 10, 3, p.hair); px(g, 4, 1 + dy, 3, 2, '#5db6d0'); px(g, 9, 1 + dy, 3, 2, '#5db6d0'); }
  else if (h === 'horns' || h === 'pinkhorn') { px(g, 2, dy, 2, 4, h === 'pinkhorn' ? '#cb6f93' : '#754151'); px(g, 12, dy, 2, 4, h === 'pinkhorn' ? '#cb6f93' : '#754151'); px(g, 1, dy, 1, 2, p.accent); px(g, 14, dy, 1, 2, p.accent); }
  else if (h === 'top') { px(g, 4, dy, 8, 4, p.dark); px(g, 2, 4 + dy, 12, 1, p.accent); }
  else if (h === 'cap') { px(g, 4, dy, 8, 3, p.accent); px(g, view === 'side' ? 7 : 3, 3 + dy, view === 'side' ? 8 : 10, 1, p.dark); }
}

function voyageHair(g, p, view, dy) {
  const t = p.hairType || 'crop';
  if (view === 'back') {
    px(g, 3, 1 + dy, 10, t === 'long' || t === 'afro' ? 11 : 8, p.hair);
    if (t === 'long') { px(g, 2, 5 + dy, 2, 7, p.hair); px(g, 12, 5 + dy, 2, 7, p.hair); }
  } else if (view === 'side') {
    px(g, 3, 1 + dy, 9, 5, p.hair); px(g, 3, 5 + dy, t === 'long' ? 5 : 3, t === 'long' ? 7 : 3, p.hair);
  } else if (t === 'afro') {
    px(g, 2, dy, 12, 5, p.hair); px(g, 1, 2 + dy, 2, 6, p.hair); px(g, 13, 2 + dy, 2, 6, p.hair);
  } else if (t === 'spike') {
    px(g, 3, 1 + dy, 10, 4, p.hair);
    spike(g, 2.9, dy - 0.9, 2.4, 2.6, p.hair); spike(g, 6.8, dy - 1, 2.4, 2.7, p.hair); spike(g, 10.7, dy - 0.9, 2.4, 2.6, p.hair);
  } else {
    px(g, 3, 1 + dy, 10, 4, p.hair);
    if (t === 'long') { px(g, 2, 4 + dy, 2, 8, p.hair); px(g, 12, 4 + dy, 2, 8, p.hair); }
    if (t === 'sweep') px(g, 8, 4 + dy, 5, 2, p.hair);
  }
  voyageHat(g, p, view, dy);
}

function voyageFace(g, p, view, dy) {
  if (view === 'back') return;
  if (p.face === 'skull') {
    roundBox(g, 4, 5 + dy, 3, 3, 1.2, INK); roundBox(g, 9, 5 + dy, 3, 3, 1.2, INK);
    px(g, 6, 8 + dy, 4, 0.5, INK); px(g, 6.6, 8.5 + dy, 0.5, 0.5, INK); px(g, 8.9, 8.5 + dy, 0.5, 0.5, INK);
    return;
  }
  const ex = view === 'side' ? 9 : 4;
  eye(g, ex, 5 + dy, 2, 2);
  if (view !== 'side') eye(g, 10, 5 + dy, 2, 2);
  if (p.face === 'mask') px(g, 4, 7 + dy, 8, 2, p.accent);
  else if (p.face === 'beard') { px(g, 5, 8 + dy, 6, 2, p.hair); px(g, 6, 7 + dy, 4, 1, p.hair); }
  else if (p.face === 'snout') { px(g, 6, 7 + dy, 4, 2, '#e9aaae'); px(g, 7, 7 + dy, 2, 1, INK); }
  else if (p.face === 'glasses') { px(g, 3, 4 + dy, 4, 3, p.accent); px(g, 9, 4 + dy, 4, 3, p.accent); }
  else if (p.face === 'fang') { px(g, 7, 8 + dy, 3, 1, EYE_LIGHT); }
  else px(g, 7, 8 + dy, 2, 1, p.dark);
}

function voyageHead(g, p, view, dy) {
  headBlock(g, 1 + dy, 9, p.skin);
  voyageHair(g, p, view, dy);
  voyageFace(g, p, view, dy);
}

function voyageBody(g, p, view, step, sitting) {
  const y = sitting ? 11 : 10;
  const x0 = sitting ? 3 : 4, w = sitting ? 10 : 8;
  roundBox(g, x0, y, w, 6, sitting ? 1 : 0.8, p.shirt);
  clothShade(g, x0, y, w, 6, p.shirt);
  px(g, x0, y, w, 1, p.shade);
  px(g, 7, y + 1, 2, 4, p.accent);            // dải áo giữa ngực
  px(g, 8.6, y + 1, 0.4, 4, darken(p.accent, 0.2));
  if (sitting) return;
  const arm = view === 'side' ? (step === 1 ? 10 : step === 2 ? 4 : 7) : 3;
  const aw = view === 'side' ? 2 : 1;
  roundBox(g, arm, 11, aw, 4, 0.4, p.shade); roundBox(g, arm, 14.9, aw, 1.1, 0.4, p.skin);
  if (view !== 'side') { roundBox(g, 12, 11, 1, 4, 0.4, p.shade); roundBox(g, 12, 14.9, 1, 1.1, 0.4, p.skin); }
  px(g, 5, 16, 2, 3, p.pants); px(g, 9, 16, 2, 3, p.pants);
  px(g, 5, 16, 0.5, 3, lighten(p.pants, 0.1)); px(g, 10.5, 16, 0.5, 3, darken(p.pants, 0.12));
  const off = step === 1 ? 1 : step === 2 ? -1 : 0;
  roundBox(g, 5 - Math.max(0, off), 18.85, 2, 1.15, 0.45, p.dark);
  roundBox(g, 9 + Math.max(0, -off), 18.85, 2, 1.15, 0.45, p.dark);
}

function voyageWalk(g, p, view, step) { voyageHead(g, p, view, 0); voyageBody(g, p, view, step, false); }

function voyageSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0;
  voyageHead(g, p, arms === 'turn' ? 'front' : 'back', drop); voyageBody(g, p, 'back', 0, true);
  if (arms === 'typeA' || arms === 'typeB') {
    const up = arms === 'typeA'; px(g, 1, 12, 3, 3, p.shade); px(g, 12, 12, 3, 3, p.shade);
    px(g, 1, up ? 14 : 15, 3, 1, p.skin); px(g, 12, up ? 15 : 14, 3, 1, p.skin);
  } else { px(g, 2, 13 + drop, 2, 3, p.shade); px(g, 12, 13 + drop, 2, 3, p.shade); }
}

function drawVoyageFrame(g, p, key) {
  switch (key) {
    case 'd0': return voyageWalk(g, p, 'front', 0); case 'd1': return voyageWalk(g, p, 'front', 1); case 'd2': return voyageWalk(g, p, 'front', 2);
    case 'u0': return voyageWalk(g, p, 'back', 0); case 'u1': return voyageWalk(g, p, 'back', 1); case 'u2': return voyageWalk(g, p, 'back', 2);
    case 's0': return voyageWalk(g, p, 'side', 0); case 's1': return voyageWalk(g, p, 'side', 1); case 's2': return voyageWalk(g, p, 'side', 2);
    case 'k0': return voyageSit(g, p, 'rest'); case 'k1': return voyageSit(g, p, 'typeA'); case 'k2': return voyageSit(g, p, 'typeB'); case 'k3': return voyageSit(g, p, 'sleep');
    case 'kf': return voyageSit(g, p, 'turn');
    default: return voyageWalk(g, p, 'front', 0);
  }
}

/* ============================================================ BỘ 6: NHẪN GIẢ
 *
 * 36 nhân vật theo tấm mẫu thứ hai. Bộ này có renderer riêng để băng trán, mặt nạ, áo
 * choàng mây đỏ và tóc nhọn vẫn đọc được ở 16x20. Mỗi nhân vật vẫn đủ 13 frame như các bộ
 * dựng sẵn khác; không dùng lại ảnh đứng yên.
 */

const NINJA_CHARS = [
  { id:'ninja01', name:'Ninja 01', skin:'#efb37f', hair:'#e7a321', dark:'#8b5c19', shirt:'#263c48', shade:'#192a34', pants:'#25343a', accent:'#e66d24', headband:true, hairType:'spike', marks:true },
  { id:'ninja02', name:'Ninja 02', skin:'#f0b18e', hair:'#db7771', dark:'#994b4c', shirt:'#a33f3c', shade:'#722c2c', pants:'#4a3031', accent:'#e6c7bc', hairType:'long' },
  { id:'ninja03', name:'Ninja 03', skin:'#dca57d', hair:'#8996aa', dark:'#4e596b', shirt:'#52687d', shade:'#354758', pants:'#273746', accent:'#bdc6c8', headband:true, mask:true, oneEye:true, hairType:'spike' },
  { id:'ninja04', name:'Ninja 04', skin:'#dca273', hair:'#5d422b', dark:'#37271d', shirt:'#45524f', shade:'#2d3937', pants:'#283431', accent:'#c5c7bd', headband:true, hairType:'sweep' },
  { id:'ninja05', name:'Ninja 05', skin:'#edb18d', hair:'#273347', dark:'#182130', shirt:'#566477', shade:'#394657', pants:'#263243', accent:'#bdc5ca', hairType:'long' },
  { id:'ninja06', name:'Ninja 06', skin:'#dda379', hair:'#1f242d', dark:'#11151c', shirt:'#514b4a', shade:'#342f30', pants:'#2b2b31', accent:'#b9c2c4', headband:true, hairType:'crop' },
  { id:'ninja07', name:'Ninja 07', skin:'#dfa477', hair:'#202830', dark:'#11171d', shirt:'#4b843d', shade:'#315c2b', pants:'#263943', accent:'#c0c6c3', headband:true, hairType:'spike' },
  { id:'ninja08', name:'Ninja 08', skin:'#e7ad87', hair:'#e5aa27', dark:'#9c6c1d', shirt:'#55546c', shade:'#38384c', pants:'#343345', accent:'#b8c2c5', headband:true, hairType:'long', pony:true },
  { id:'ninja09', name:'Ninja 09', skin:'#dca27c', hair:'#713832', dark:'#43211f', shirt:'#477846', shade:'#2f5231', pants:'#31423a', accent:'#c0c5c1', headband:true, hairType:'spike' },
  { id:'ninja10', name:'Ninja 10', skin:'#e1a783', hair:'#263147', dark:'#171f30', shirt:'#536274', shade:'#354354', pants:'#303746', accent:'#bbc4c7', hairType:'long' },
  { id:'ninja11', name:'Ninja 11', skin:'#d89f75', hair:'#27323b', dark:'#161e25', shirt:'#546873', shade:'#354952', pants:'#28353c', accent:'#c0c4bf', headband:true, hairType:'crop' },
  { id:'ninja12', name:'Ninja 12', skin:'#daa078', hair:'#253043', dark:'#151d2b', shirt:'#4f6378', shade:'#33465b', pants:'#29394a', accent:'#bdc4c8', headband:true, hairType:'long' },
  { id:'ninja13', name:'Ninja 13', skin:'#edb080', hair:'#dba329', dark:'#95691d', shirt:'#45734d', shade:'#2d5037', pants:'#344438', accent:'#b9c4c3', hairType:'long', pony:true },
  { id:'ninja14', name:'Ninja 14', skin:'#d8a178', hair:'#4d5434', dark:'#2e3522', shirt:'#497348', shade:'#315132', pants:'#304039', accent:'#bbc5c1', headband:true, mask:true, hairType:'crop' },
  { id:'ninja15', name:'Ninja 15', skin:'#dfa276', hair:'#70402b', dark:'#41271d', shirt:'#445467', shade:'#2c3a4b', pants:'#34424b', accent:'#b9c1c2', hairType:'spike' },
  { id:'ninja16', name:'Ninja 16', skin:'#dda179', hair:'#9a3e31', dark:'#61251f', shirt:'#3d4754', shade:'#292f3a', pants:'#313a43', accent:'#a83d2e', hairType:'spike' },
  { id:'ninja17', name:'Ninja 17', skin:'#d9a17a', hair:'#202a35', dark:'#121922', shirt:'#20252d', shade:'#14191f', pants:'#232833', accent:'#b5282c', headband:true, cloak:true, hairType:'long' },
  { id:'ninja18', name:'Ninja 18', skin:'#c99169', hair:'#1f2b38', dark:'#111922', shirt:'#20252d', shade:'#14191f', pants:'#232833', accent:'#b5282c', headband:true, cloak:true, mask:true, hairType:'long' },
  { id:'ninja19', name:'Ninja 19', skin:'#dda57c', hair:'#1e2b3b', dark:'#101923', shirt:'#52765d', shade:'#36523f', pants:'#343f4b', accent:'#bdc5c4', hairType:'spike' },
  { id:'ninja20', name:'Ninja 20', skin:'#d9a179', hair:'#26323a', dark:'#151e25', shirt:'#59676f', shade:'#3a4951', pants:'#343d48', accent:'#bbc3c3', headband:true, hairType:'long' },
  { id:'ninja21', name:'Ninja 21', skin:'#db9f75', hair:'#1f2a34', dark:'#11181f', shirt:'#405e4b', shade:'#2a4235', pants:'#303d3a', accent:'#c0c4bd', headband:true, hairType:'crop' },
  { id:'ninja22', name:'Ninja 22', skin:'#d7a080', hair:'#d1d0c9', dark:'#777a79', shirt:'#3e6648', shade:'#294832', pants:'#34423d', accent:'#b9c2c1', helmet:true, mask:true, hairType:'crop' },
  { id:'ninja23', name:'Ninja 23', skin:'#c68b68', hair:'#442526', dark:'#281718', shirt:'#20252d', shade:'#14191f', pants:'#232833', accent:'#b5282c', hood:true, cloak:true, mask:true, hairType:'crop' },
  { id:'ninja24', name:'Ninja 24', skin:'#d59a73', hair:'#26313f', dark:'#151d28', shirt:'#20252d', shade:'#14191f', pants:'#232833', accent:'#b5282c', headband:true, cloak:true, hairType:'crop' },
  { id:'ninja25', name:'Ninja 25', skin:'#d09872', hair:'#c16624', dark:'#7d3d19', shirt:'#20252d', shade:'#14191f', pants:'#232833', accent:'#b5282c', cloak:true, mask:true, hairType:'long' },
  { id:'ninja26', name:'Ninja 26', skin:'#d69e77', hair:'#24303d', dark:'#141c27', shirt:'#414c63', shade:'#2a3448', pants:'#2c384b', accent:'#b9c2c4', headband:true, mask:true, hairType:'crop' },
  { id:'ninja27', name:'Ninja 27', skin:'#dca176', hair:'#d65a25', dark:'#8f341c', shirt:'#20252d', shade:'#14191f', pants:'#232833', accent:'#b5282c', headband:true, cloak:true, marks:true, hairType:'spike' },
  { id:'ninja28', name:'Ninja 28', skin:'#dda177', hair:'#27333e', dark:'#151e28', shirt:'#20252d', shade:'#14191f', pants:'#232833', accent:'#b5282c', headband:true, cloak:true, mask:true, hairType:'crop' },
  { id:'ninja29', name:'Ninja 29', skin:'#dca079', hair:'#2d4661', dark:'#1a2c3f', shirt:'#4d6175', shade:'#31455a', pants:'#303d4a', accent:'#bdc5c6', headband:true, hairType:'spike' },
  { id:'ninja30', name:'Ninja 30', skin:'#b98361', hair:'#677054', dark:'#3e4634', shirt:'#4d754d', shade:'#335334', pants:'#34453a', accent:'#bfc4bb', helmet:true, mask:true, hairType:'crop' },
  { id:'ninja31', name:'Ninja 31', skin:'#ecae7b', hair:'#dc9820', dark:'#8d5c17', shirt:'#f1e9df', shade:'#bfafa0', pants:'#d44e46', accent:'#c1c5c3', headband:true, marks:true, hairType:'spike' },
  { id:'ninja32', name:'Ninja 32', skin:'#e4a882', hair:'#be583f', dark:'#79352b', shirt:'#537555', shade:'#37533b', pants:'#34443e', accent:'#e1c5b6', hairType:'long' },
  { id:'ninja33', name:'Ninja 33', skin:'#d7a079', hair:'#2f3c38', dark:'#1c2523', shirt:'#4d784c', shade:'#335434', pants:'#34463b', accent:'#bec4bc', headband:true, hairType:'sweep' },
  { id:'ninja34', name:'Ninja 34', skin:'#d99f77', hair:'#26333d', dark:'#151e27', shirt:'#41733f', shade:'#2b502d', pants:'#303f39', accent:'#bdc5c2', headband:true, hairType:'crop' },
  { id:'ninja35', name:'Ninja 35', skin:'#dba077', hair:'#28384e', dark:'#172438', shirt:'#3d5570', shade:'#283b53', pants:'#303b4c', accent:'#bdc5c7', headband:true, mask:true, hairType:'crop' },
  { id:'ninja36', name:'Ninja 36', skin:'#d79b72', hair:'#4b382c', dark:'#2d211b', shirt:'#3f4c61', shade:'#293548', pants:'#303a49', accent:'#b9c2c3', headband:true, mask:true, hairType:'crop' },
];

function ninjaHair(g, p, view, dy) {
  const long = p.hairType === 'long';
  if (p.hood) { px(g, 2, dy, 12, 10, p.shirt); px(g, 3, 2 + dy, 10, 7, p.dark); }
  else if (view === 'back') { px(g, 3, dy, 10, long ? 11 : 8, p.hair); if (long) { px(g, 2, 4 + dy, 2, 8, p.hair); px(g, 12, 4 + dy, 2, 8, p.hair); } }
  else if (view === 'side') { px(g, 3, dy, 9, 5, p.hair); px(g, 3, 4 + dy, long ? 5 : 3, long ? 7 : 3, p.hair); }
  else if (p.hairType === 'spike') {
    px(g, 3, 1 + dy, 10, 4, p.hair);
    spike(g, 2.9, dy - 0.9, 2.4, 2.6, p.hair); spike(g, 6.8, dy - 1, 2.4, 2.7, p.hair); spike(g, 10.7, dy - 0.9, 2.4, 2.6, p.hair);
  }
  else { px(g, 3, 1 + dy, 10, 4, p.hair); if (long) { px(g, 2, 4 + dy, 2, 8, p.hair); px(g, 12, 4 + dy, 2, 8, p.hair); } }
  if (p.ponytail) px(g, view === 'side' ? 1 : 12, 5 + dy, 3, 6, p.hair);
}

function ninjaBand(g, p, view, dy) {
  if (!p.headband && !p.helmet) return;
  const band = p.helmet ? '#9ba7ac' : '#26323d';
  px(g, 2, 3 + dy, view === 'side' ? 11 : 12, 3, band);
  px(g, view === 'side' ? 7 : 5, 3 + dy, 6, 2, '#b8c1c2');
  px(g, view === 'side' ? 9 : 7, 4 + dy, 2, 1, '#6f7c80');
}

function ninjaFace(g, p, view, dy) {
  if (view === 'back') return;
  const ex = view === 'side' ? 9 : 4;
  if (p.oneEye && view !== 'side') roundBox(g, 3, 5 + dy, 5, 2, 0.5, p.dark);
  else eye(g, ex, 6 + dy, 2, 2);
  if (view !== 'side') eye(g, 10, 6 + dy, 2, 2);
  if (p.mask) px(g, 4, 8 + dy, 8, 2, p.shade); else px(g, 7, 8 + dy, 2, 1, p.dark);
  if (p.marks) { px(g, 2, 7 + dy, 2, 1, p.accent); px(g, 12, 7 + dy, 2, 1, p.accent); }
}

function ninjaHead(g, p, view, dy) {
  headBlock(g, 1 + dy, 9, p.skin); ninjaHair(g, p, view, dy); ninjaBand(g, p, view, dy); ninjaFace(g, p, view, dy);
}

function ninjaBody(g, p, view, step, sitting) {
  const y = sitting ? 11 : 10;
  const x0 = sitting ? 3 : 4, w = sitting ? 10 : 8;
  roundBox(g, x0, y, w, 6, sitting ? 1 : 0.8, p.shirt);
  clothShade(g, x0, y, w, 6, p.shirt);
  px(g, x0, y, w, 1, p.shade);
  if (p.cloak) { roundBox(g, 5, y + 2, 3, 2, 0.8, p.accent); roundBox(g, 10, y + 4, 2, 2, 0.8, p.accent); }
  else { px(g, 7, y + 1, 2, 4, p.accent); px(g, 8.6, y + 1, 0.4, 4, darken(p.accent, 0.2)); }
  if (sitting) return;
  const ax = view === 'side' ? (step === 1 ? 10 : step === 2 ? 4 : 7) : 3;
  const aw = view === 'side' ? 2 : 1;
  roundBox(g, ax, 11, aw, 4, 0.4, p.shade); roundBox(g, ax, 14.9, aw, 1.1, 0.4, p.skin);
  if (view !== 'side') { roundBox(g, 12, 11, 1, 4, 0.4, p.shade); roundBox(g, 12, 14.9, 1, 1.1, 0.4, p.skin); }
  px(g, 5, 16, 2, 3, p.pants); px(g, 9, 16, 2, 3, p.pants);
  px(g, 5, 16, 0.5, 3, lighten(p.pants, 0.1)); px(g, 10.5, 16, 0.5, 3, darken(p.pants, 0.12));
  const off = step === 1 ? 1 : step === 2 ? -1 : 0;
  roundBox(g, 5 - Math.max(0, off), 18.85, 2, 1.15, 0.45, p.dark);
  roundBox(g, 9 + Math.max(0, -off), 18.85, 2, 1.15, 0.45, p.dark);
}

function ninjaWalk(g, p, view, step) { ninjaHead(g, p, view, 0); ninjaBody(g, p, view, step, false); }
function ninjaSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0;
  ninjaHead(g, p, arms === 'turn' ? 'front' : 'back', drop); ninjaBody(g, p, 'back', 0, true);
  if (arms === 'typeA' || arms === 'typeB') { const up = arms === 'typeA'; px(g,1,12,3,3,p.shade); px(g,12,12,3,3,p.shade); px(g,1,up?14:15,3,1,p.skin); px(g,12,up?15:14,3,1,p.skin); }
  else { px(g,2,13+drop,2,3,p.shade); px(g,12,13+drop,2,3,p.shade); }
}

function drawNinjaFrame(g, p, key) {
  switch (key) {
    case 'd0': return ninjaWalk(g,p,'front',0); case 'd1': return ninjaWalk(g,p,'front',1); case 'd2': return ninjaWalk(g,p,'front',2);
    case 'u0': return ninjaWalk(g,p,'back',0); case 'u1': return ninjaWalk(g,p,'back',1); case 'u2': return ninjaWalk(g,p,'back',2);
    case 's0': return ninjaWalk(g,p,'side',0); case 's1': return ninjaWalk(g,p,'side',1); case 's2': return ninjaWalk(g,p,'side',2);
    case 'k0': return ninjaSit(g,p,'rest'); case 'k1': return ninjaSit(g,p,'typeA'); case 'k2': return ninjaSit(g,p,'typeB'); case 'k3': return ninjaSit(g,p,'sleep');
    case 'kf': return ninjaSit(g,p,'turn');
    default: return ninjaWalk(g,p,'front',0);
  }
}

/* ============================================================ BỘ 7: NĂM ANH EM
 *
 * Năm người thật, dựng từ một tấm ảnh chụp chung. Ở 16x20 pixel thì **không chép được khuôn
 * mặt** - 8 pixel ngang cho cả khuôn mặt, hai con mắt đã chiếm 4. Thứ nhận ra được từ xa là
 * silhouette và mảng màu, nên mỗi người bị khoá bằng ĐÚNG BA dấu hiệu tách bạch nhau:
 *
 * | Ai | Tóc | Thân | Chân |
 * | --- | --- | --- | --- |
 * | Ngón Cái | ngắn, không kính (người DUY NHẤT không kính) | áo đen, chữ trắng ngang ngực | quần đùi, giày TRẮNG |
 * | Áo Polo | ngắn, kính gọng bạc mảnh | polo navy, nẹp khuy giữa ngực | quần jeans SÁNG (duy nhất) |
 * | Tóc Dài | dài xoã quá vai (duy nhất), kính đen to | khoác trắng mở, trong đen | váy đen, giày đế dày |
 * | Sơ Mi Sọc | phồng đỉnh, kính tròn | sơ mi TRẮNG kẻ sọc dọc | quần đen dài |
 * | Cánh Cụt | rối, kính đen to | áo đen, logo cánh cụt vàng-trắng, VAI RỘNG hơn 2 pixel | quần đùi, giày đen |
 *
 * Ba dấu hiệu chứ không phải một, vì mỗi tư thế giấu đi một thứ khác nhau: ngồi thì mất
 * giày và mất luôn ngực (quay lưng), đi ngang thì mất kính. Người ngồi - trạng thái hay gặp
 * nhất - chỉ còn tóc, màu áo và bề ngang, nên hai người mặc áo đen phải khác nhau ở bề
 * ngang, không được chỉ khác ở cái logo.
 */

const CREW_CHARS = [
  { id: 'crew1', name: 'Ngón Cái', hair: 'short', glasses: null, chest: 'text', shorts: true,
    skin: '#f0c49a', skinDark: '#d4a077', hairC: '#1b1720', hairDark: '#0d0a11',
    shirt: '#2a2a30', shirtDark: '#191920', pants: '#22222a', shoes: '#d9dde4' },

  { id: 'crew2', name: 'Áo Polo', hair: 'neat', glasses: 'thin', chest: 'polo',
    skin: '#eebe93', skinDark: '#d09a70', hairC: '#201b22', hairDark: '#100d12',
    shirt: '#1e2b45', shirtDark: '#131c2f', pants: '#7fa8d4', shoes: '#2b2f38' },

  // Tóc nhạt hơn hẳn hai người tóc đen kia: tóc dài phủ gần hết khung, để đen tuyền thì nó
  // dính liền với gọng kính đen và cả cái đầu ra một khối.
  { id: 'crew3', name: 'Tóc Dài', hair: 'long', glasses: 'bold', chest: 'jacket',
    skin: '#f7d7b8', skinDark: '#dcb593', hairC: '#3d2f38', hairDark: '#291f26',
    shirt: '#f4f1ea', shirtDark: '#d6d0c3', inner: '#201c22',
    pants: '#201c22', shoes: '#17141a' },

  { id: 'crew4', name: 'Sơ Mi Sọc', hair: 'puff', glasses: 'round', chest: 'stripes',
    skin: '#f2c9a0', skinDark: '#d5a87d', hairC: '#241d24', hairDark: '#120e12',
    shirt: '#f2efe6', shirtDark: '#d3cec0', pants: '#22222a', shoes: '#2a2a32' },

  { id: 'crew5', name: 'Cánh Cụt', hair: 'messy', glasses: 'bold', chest: 'penguin',
    shorts: true, broad: true,
    skin: '#e8b98d', skinDark: '#c9986c', hairC: '#1d1820', hairDark: '#0e0b12',
    shirt: '#2a2a30', shirtDark: '#191920', pants: '#22222a', shoes: '#1a1a20' },
];

const CREW_FRAME = '#20202a';        // gọng đen
const CREW_FRAME2 = '#cfd6de';       // gọng bạc

/* Tóc. Cùng ba mặt như bộ Văn phòng (front / back / side) để dùng lại được mọi tư thế.
 *
 * Khác một điểm quan trọng: mặt trước **dừng ở hàng 3, chừa hàng 4 làm trán**. Cả năm người
 * đều tóc đen, mà mắt cũng vẽ bằng mực đen - để mái tóc chạm thẳng vào hàng mắt thì hai thứ
 * dính làm một và khuôn mặt mất hẳn đôi mắt, chỉ còn một vệt đen với hai chấm sáng. Hàng
 * trán đó cũng đúng là chỗ đặt thanh ngang của gọng kính. */
const CREW_HAIR = {
  short: {
    front(g, p, dy) {
      headBlock(g, dy, 4, p.hairC);
      px(g, 4, 3 + dy, 8, 1, p.hairDark);
      px(g, 3, 4 + dy, 1, 2, p.hairC);
      px(g, 12, 4 + dy, 1, 2, p.hairC);
    },
    back(g, p, dy) {
      headBlock(g, dy, 8, p.hairC);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      headBlock(g, 0, 5, p.hairC);
      px(g, 3, 4, 4, 3, p.hairC);
      px(g, 4, 4, 6, 1, p.hairDark);
    },
  },

  // Rẽ ngôi: một vệt sáng lệch tâm, đủ để tóc không thành một khối đen đặc.
  neat: {
    front(g, p, dy) {
      headBlock(g, dy, 4, p.hairC);
      px(g, 4, 3 + dy, 8, 1, p.hairDark);
      px(g, 3, 4 + dy, 1, 2, p.hairC);
      px(g, 12, 4 + dy, 1, 2, p.hairC);
      px(g, 9, 1 + dy, 1, 2, p.hairDark);
    },
    back(g, p, dy) {
      headBlock(g, dy, 8, p.hairC);
      px(g, 9, 1 + dy, 1, 4, p.hairDark);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      headBlock(g, 0, 5, p.hairC);
      px(g, 3, 4, 4, 3, p.hairC);
      px(g, 6, 1, 1, 3, p.hairDark);
    },
  },

  // Phồng đỉnh: thêm hẳn một hàng cao hơn khối đầu, nhìn nghiêng vẫn thấy.
  puff: {
    front(g, p, dy) {
      px(g, 5, dy, 6, 1, p.hairC);
      headBlock(g, 1 + dy, 3, p.hairC);
      px(g, 4, 3 + dy, 8, 1, p.hairDark);
      px(g, 3, 4 + dy, 1, 2, p.hairC);
      px(g, 12, 4 + dy, 1, 2, p.hairC);
    },
    back(g, p, dy) {
      px(g, 5, dy, 6, 1, p.hairC);
      headBlock(g, 1 + dy, 7, p.hairC);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      px(g, 5, 0, 6, 1, p.hairC);
      headBlock(g, 1, 4, p.hairC);
      px(g, 3, 4, 4, 3, p.hairC);
    },
  },

  // Rối: ba chỏm lởm chởm trên đỉnh - đọc ra ngay cả khi quay lưng.
  messy: {
    front(g, p, dy) {
      spike(g, 3.7, dy - 0.7, 2.2, 2, p.hairC);
      spike(g, 6.9, dy - 0.9, 2.2, 2.2, p.hairC);
      spike(g, 10.1, dy - 0.7, 2.2, 2, p.hairC);
      headBlock(g, 1 + dy, 3, p.hairC);
      px(g, 4, 3 + dy, 8, 1, p.hairDark);
      px(g, 3, 4 + dy, 1, 3, p.hairC);
      px(g, 12, 4 + dy, 1, 3, p.hairC);
    },
    back(g, p, dy) {
      spike(g, 3.7, dy - 0.7, 2.2, 2, p.hairC);
      spike(g, 6.9, dy - 0.9, 2.2, 2.2, p.hairC);
      spike(g, 10.1, dy - 0.7, 2.2, 2, p.hairC);
      headBlock(g, 1 + dy, 7, p.hairC);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      spike(g, 3.7, -0.7, 2.2, 2, p.hairC);
      spike(g, 7.7, -0.9, 2.2, 2.2, p.hairC);
      headBlock(g, 1, 4, p.hairC);
      px(g, 3, 4, 4, 3, p.hairC);
    },
  },

  long: {
    front(g, p, dy) {
      headBlock(g, dy, 4, p.hairC);
      px(g, 4, 3 + dy, 8, 1, p.hairDark);
      px(g, 2, 3 + dy, 2, 8, p.hairC);
      px(g, 12, 3 + dy, 2, 8, p.hairC);
    },
    back(g, p, dy) {
      headBlock(g, dy, 8, p.hairC);
      px(g, 2, 3 + dy, 12, 10, p.hairC);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      headBlock(g, 0, 5, p.hairC);
      px(g, 2, 3, 5, 9, p.hairC);
      px(g, 4, 4, 6, 1, p.hairDark);
    },
  },
};

/* Kính vẽ SAU khuôn mặt và chỉ có ở mặt trước / mặt ngang - quay lưng thì không ai thấy
 * kính. Mắt nằm ở (4,5) và (10,5) cỡ 2x2, nên gọng phải chạy vòng ngoài chứ không đè lên;
 * đè lên là mất luôn chấm sáng trong mắt, thứ giữ toàn bộ thần thái của khuôn mặt. */
function crewGlasses(g, p, dy) {
  const k = p.glasses;
  if (!k) return;
  const c = k === 'thin' ? CREW_FRAME2 : CREW_FRAME;
  if (k === 'thin') {
    px(g, 3, 4 + dy, 4, 1, c);
    px(g, 9, 4 + dy, 4, 1, c);
    px(g, 7, 5 + dy, 2, 1, c);
    return;
  }
  if (k === 'round') {
    px(g, 4, 4 + dy, 3, 1, c);          // bo góc: hàng trên hụt một pixel mỗi bên
    px(g, 9, 4 + dy, 3, 1, c);
    px(g, 3, 5 + dy, 1, 2, c);
    px(g, 7, 5 + dy, 1, 2, c);
    px(g, 8, 5 + dy, 1, 2, c);
    px(g, 12, 5 + dy, 1, 2, c);
    px(g, 4, 7 + dy, 3, 1, c);
    px(g, 9, 7 + dy, 3, 1, c);
    crewLensGlare(g, dy);
    return;
  }
  // bold: kiểu browline - một thanh ngang dày nối hai tròng, gọng chỉ khép ở mép ngoài và
  // đáy. Bản đầu vẽ khung vuông KÍN cả bốn cạnh cho hai mắt: cộng với tóc đen phía trên,
  // cả cái đầu thành một khối đen đặc, không còn mặt mũi gì. Ở 8 pixel ngang, gọng kín là
  // quá nhiều mực.
  px(g, 3, 4 + dy, 11, 1, c);           // thanh ngang trên, chạy suốt kể cả phần cầu
  px(g, 3, 5 + dy, 1, 2, c);            // hai gọng ngoài
  px(g, 13, 5 + dy, 1, 2, c);
  px(g, 7, 5 + dy, 2, 1, c);            // cầu nối
  px(g, 4, 7 + dy, 3, 1, c);            // đáy hai tròng
  px(g, 10, 7 + dy, 3, 1, c);
  crewLensGlare(g, dy);
}

/** Chấm loá trên tròng kính. Mắt vẽ bằng mực đen, gọng cũng đen, tóc phía trên cũng đen -
 *  thiếu chấm sáng này thì cả vùng mắt là một mảng tối và khuôn mặt trông như bị bôi đen.
 *  Đặt ở mép ngoài tròng (x6 / x12) nên không đụng vào con ngươi ở x4-5 và x10-11. */
function crewLensGlare(g, dy) {
  px(g, 6, 5 + dy, 1, 1, '#e9eff6');
  px(g, 12, 5 + dy, 1, 1, '#e9eff6');
}

/** Hoạ tiết ngực, vẽ đè lên áo. `x0`/`w` theo bề ngang thân (người đậm rộng hơn). */
function crewChest(g, p, x0, w, y0) {
  const mid = x0 + (w >> 1);
  if (p.chest === 'text') {
    px(g, x0 + 1, y0 + 2, w - 2, 1, '#e9e7e1');
    px(g, x0 + 2, y0 + 4, w - 4, 1, '#b6b3ad');
  } else if (p.chest === 'polo') {
    px(g, x0 + 1, y0 + 1, 2, 2, p.shirtDark);      // hai vạt cổ bẻ
    px(g, x0 + w - 3, y0 + 1, 2, 2, p.shirtDark);
    px(g, mid - 1, y0 + 1, 1, 4, p.shirtDark);     // nẹp khuy
    px(g, mid - 1, y0 + 2, 1, 1, CREW_FRAME2);
    px(g, mid - 1, y0 + 4, 1, 1, CREW_FRAME2);
  } else if (p.chest === 'jacket') {
    px(g, mid - 2, y0, 4, 6, p.inner);             // áo trong đen giữa hai vạt khoác
    px(g, mid - 3, y0, 1, 6, p.shirtDark);
    px(g, mid + 2, y0, 1, 6, p.shirtDark);
  } else if (p.chest === 'stripes') {
    px(g, x0 + 2, y0 + 1, 1, 5, p.shirtDark);
    px(g, mid, y0 + 1, 1, 5, p.shirtDark);
    px(g, x0 + w - 3, y0 + 1, 1, 5, p.shirtDark);
  } else if (p.chest === 'penguin') {
    px(g, x0 + w - 4, y0 + 2, 2, 3, '#f2efe6');    // bụng trắng
    px(g, x0 + w - 4, y0 + 2, 2, 1, '#15121a');    // đầu đen
    px(g, x0 + w - 3, y0 + 3, 1, 1, '#f0b13a');    // mỏ vàng
  }
}

/** Chân. Quần đùi thì hở một hàng da giữa ống quần và giày - đó là cách duy nhất ở cỡ này
 *  để đọc ra "mặc quần đùi" mà không cần thêm chi tiết. */
function crewLegs(g, p, step) {
  const off = step === 1 ? 1 : step === 2 ? -1 : 0;
  const h = p.shorts ? 2 : 3;
  px(g, 5, 16, 2, h, p.pants);
  px(g, 9, 16, 2, h, p.pants);
  px(g, 5, 16, 0.5, h, lighten(p.pants, 0.1));
  px(g, 10.5, 16, 0.5, h, darken(p.pants, 0.12));
  if (p.shorts) {
    px(g, 5, 18, 2, 1, p.skin);
    px(g, 9, 18, 2, 1, p.skin);
    px(g, 10.5, 18, 0.5, 1, p.skinDark);
  }
  roundBox(g, 5 - Math.max(0, off), 18.85, 2, 1.15, 0.45, p.shoes);
  roundBox(g, 9 + Math.max(0, -off), 18.85, 2, 1.15, 0.45, p.shoes);
}

/** Thân người. `broad` nới ra 1 pixel mỗi bên - dấu hiệu duy nhất còn lại khi hai người
 *  cùng mặc áo đen và đang ngồi quay lưng. */
function crewTorso(g, p) {
  const b = p.broad ? 1 : 0;
  const x0 = 4 - b, w = 8 + b * 2;
  roundBox(g, x0, 10, w, 6, 0.8, p.shirt);
  clothShade(g, x0, 10, w, 6, p.shirt);
  px(g, x0, 10, w, 1, p.shirtDark);
  crewChest(g, p, x0, w, 10);
  px(g, x0 - 1, 11, 1, 4, lighten(p.shirt, 0.06));
  px(g, x0 + w, 11, 1, 4, darken(p.shirt, 0.1));
  roundBox(g, x0 - 1, 14.9, 1, 1.1, 0.4, p.skin);
  roundBox(g, x0 + w, 14.9, 1, 1.1, 0.4, p.skin);
}

function crewDown(g, p, step) {
  headBlock(g, 1, 9, p.skin);
  CREW_HAIR[p.hair].front(g, p, 0);
  faceFront(g, p, 0);
  crewGlasses(g, p, 0);
  crewTorso(g, p);
  crewLegs(g, p, step);
}

function crewUp(g, p, step) {
  headBlock(g, 1, 9, p.skin);
  CREW_HAIR[p.hair].back(g, p, 0);
  crewTorso(g, p);
  crewLegs(g, p, step);
}

function crewSide(g, p, step) {
  const b = p.broad ? 1 : 0;
  headBlock(g, 1, 9, p.skin);
  CREW_HAIR[p.hair].side(g, p);
  faceSide(g, p);
  if (p.glasses) {
    const c = p.glasses === 'thin' ? CREW_FRAME2 : CREW_FRAME;
    px(g, 8, 4, 5, 1, c);
    px(g, 8, 5, 1, 2, c);
    px(g, 13, 5, 1, 2, c);
  }
  roundBox(g, 4 - b, 10, 8 + b * 2, 6, 0.8, p.shirt);
  clothShade(g, 4 - b, 10, 8 + b * 2, 6, p.shirt);
  px(g, 4 - b, 10, 8 + b * 2, 1, p.shirtDark);
  const ax = step === 1 ? 10 : step === 2 ? 4 : 7;
  roundBox(g, ax, 11, 2, 4, 0.6, p.shirtDark);
  roundBox(g, ax, 14.9, 2, 1.1, 0.45, p.skin);
  crewLegs(g, p, step);
}

/* Ngồi quay lưng. Lưng thì không có hoạ tiết ngực, nên ở đây chỉ còn TÓC, MÀU ÁO và BỀ
 * NGANG làm dấu hiệu - riêng áo sơ mi kẻ sọc thì sọc chạy vòng ra sau lưng thật, giữ lại
 * được. */
function crewSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0;
  const turn = arms === 'turn';
  const b = p.broad ? 1 : 0;
  const x0 = 3 - b, w = 10 + b * 2;
  headBlock(g, 1 + drop, 9, p.skin);
  if (turn) {
    // Ngoái lại là lúc DUY NHẤT thấy được kính của người đang ngồi - ba trong năm người
    // chỉ khác nhau ở gọng kính, nên đừng bỏ bước này đi.
    CREW_HAIR[p.hair].front(g, p, drop); faceFront(g, p, drop); crewGlasses(g, p, drop);
  } else CREW_HAIR[p.hair].back(g, p, drop);

  roundBox(g, x0, 10 + drop, w, 7, 1, p.shirt);
  clothShade(g, x0, 10 + drop, w, 7, p.shirt);
  px(g, x0, 10 + drop, w, 1, p.shirtDark);
  // Ngoái lại thì thấy ngực: hoạ tiết áo thay cho rãnh sống lưng.
  if (turn) crewChest(g, p, x0, w, 10 + drop);
  else px(g, x0 + w / 2 - 0.6, 10.6 + drop, 1.2, 5.4, darken(p.shirt, 0.09));
  if (!turn && p.chest === 'stripes') {
    px(g, x0 + 2, 11 + drop, 1, 6, p.shirtDark);
    px(g, x0 + (w >> 1), 11 + drop, 1, 6, p.shirtDark);
    px(g, x0 + w - 3, 11 + drop, 1, 6, p.shirtDark);
  }
  if (!turn && p.chest === 'jacket') {            // khoác trắng hở lưng áo đen bên trong
    px(g, x0 + (w >> 1) - 1, 10 + drop, 2, 7, p.inner);
  }

  if (arms === 'sleep') {
    px(g, x0 - 1, 12 + drop, 2, 3, p.shirtDark);
    px(g, x0 + w - 1, 12 + drop, 2, 3, p.shirtDark);
    px(g, x0 - 1, 15 + drop, 2, 1, p.skin);
    px(g, x0 + w - 1, 15 + drop, 2, 1, p.skin);
    return;
  }
  if (arms === 'rest' || turn) {
    px(g, x0 - 1, 12, 2, 4, p.shirtDark);
    px(g, x0 + w - 1, 12, 2, 4, p.shirtDark);
    roundBox(g, x0 - 1, 15.9, 2, 1.1, 0.45, p.skin);
    roundBox(g, x0 + w - 1, 15.9, 2, 1.1, 0.45, p.skin);
    return;
  }
  const up = arms === 'typeA';
  px(g, x0 - 2, 11, 3, 4, p.shirtDark);
  px(g, x0 + w - 1, 11, 3, 4, p.shirtDark);
  px(g, x0 - 2, up ? 14 : 15, 3, 1, p.skin);
  px(g, x0 + w - 1, up ? 15 : 14, 3, 1, p.skin);
}

function drawCrewFrame(g, p, key) {
  switch (key) {
    case 'd0': return crewDown(g, p, 0);
    case 'd1': return crewDown(g, p, 1);
    case 'd2': return crewDown(g, p, 2);
    case 'u0': return crewUp(g, p, 0);
    case 'u1': return crewUp(g, p, 1);
    case 'u2': return crewUp(g, p, 2);
    case 's0': return crewSide(g, p, 0);
    case 's1': return crewSide(g, p, 1);
    case 's2': return crewSide(g, p, 2);
    case 'k0': return crewSit(g, p, 'rest');
    case 'k1': return crewSit(g, p, 'typeA');
    case 'k2': return crewSit(g, p, 'typeB');
    case 'k3': return crewSit(g, p, 'sleep');
    case 'kf': return crewSit(g, p, 'turn');
    default: return crewDown(g, p, 0);
  }
}

/* ============================================================ BỘ 8: DANH THỦ
 *
 * Mười cầu thủ. Cùng bài học đã trả giá ở bộ Năm anh em: ở 16x20 pixel thì KHUÔN MẶT không
 * nói được ai là ai - 8 pixel ngang cho cả cái mặt, hai con mắt đã chiếm 4. Nên bộ này nhận
 * diện bằng đúng ba thứ khán giả thật dùng để nhận ra cầu thủ từ trên khán đài, và cả ba
 * phải khác nhau giữa mọi người:
 *
 * | Ai | Tóc | Bộ đồ | Số |
 * | --- | --- | --- | --- |
 * | Lionel Messi | nâu vừa, mái rẽ lệch, râu ngắn | sọc DỌC xanh nhạt - trắng (bộ duy nhất có sọc) | 10 |
 * | Cristiano Ronaldo | chỏm vuốt ngược, có vệt gel | đỏ, quần xanh lá | 7 |
 * | Erling Haaland | vàng buộc đuôi + băng đô | xanh da trời trơn, giày vàng chanh | 9 |
 * | Kylian Mbappé | cắt sát (fade), chân tóc thấp | navy, dải ngang trắng viền đỏ | 10 |
 * | Neymar Jr | mohawk vàng | vàng, cổ xanh lá, quần xanh dương | 10 |
 * | Mohamed Salah | xoăn bồng tràn ra hai bên, râu rậm | đỏ trơn từ đầu tới chân | 11 |
 * | Vinícius Júnior | bốn búi xoăn nhỏ trên đỉnh | trắng, viền dọc vàng kim | 7 |
 * | Jude Bellingham | xoăn ngắn gọn trên đỉnh | trắng, dải đỏ, quần navy | 5 |
 * | Kevin De Bruyne | ngắn, TÓC ĐỎ (người duy nhất) | đỏ, dải vàng viền đen | 17 |
 * | Son Heung-min | mái rẽ lệch phủ trán | đen, viền dọc vàng kim | 7 |
 *
 * Hai người tóc ngắn thường (Messi, De Bruyne) không lẫn được vì màu tóc cách nhau hẳn một
 * quãng, và hai bộ đồ trắng (Vinícius, Bellingham) khác nhau ở màu viền, màu quần lẫn số.
 *
 * **Không vẽ huy hiệu hay logo CLB nào**, chỉ màu áo. Huy hiệu là nhãn hiệu có chủ - cùng lý
 * do đã ghi ở đầu file cho phần asset - mà ở 3 pixel thì nó cũng chỉ là một vệt bẩn trên
 * ngực áo, không ai đọc ra.
 *
 * Số áo có ở CẢ hai mặt, nhưng KHÔNG cùng cỡ - đúng như áo thật: số lưng cao 5 pixel (kín
 * lưng), số ngực chỉ cao 1.67 pixel và đặt lệch sang một bên. Lấy nguyên cỡ số lưng đắp lên
 * ngực thì nó trùm kín áo, chồng lên sọc lẫn dải ngang và cả hai cùng không đọc được. Khung
 * nhìn ngang không có số: thân lúc đó chỉ còn vài pixel bề ngang, con số bị ép thành vệt bẩn.
 */

const FOOTBALL_CHARS = [
  // Tóc nâu vừa (không phải gần đen) và mái rối nhẹ: để nguyên 'crop' thì mảng tóc là một
  // cái mũ bơi kín đầu, cộng thêm râu là cả khuôn mặt bị hai mảng tối kẹp giữa. Quần ĐEN
  // theo đúng bộ đồ sân nhà Argentina, cũng là thứ tách chân ra khỏi áo sọc trắng.
  { id: 'messi', name: 'Lionel Messi', number: '10',
    skin: '#e8b083', skinDark: '#c78e62', hair: '#4b3728', hairDark: '#2c2018',
    hairType: 'tousle', beard: 'short',
    jersey: '#79bfe2', jerseyDark: '#4f95ba', trim: '#f3f1e8', kit: 'stripes',
    shorts: '#23252c', socks: '#f3f1e8', boots: '#2b2732', numC: '#1f2a3d' },

  { id: 'ronaldo', name: 'Cristiano Ronaldo', number: '7',
    skin: '#d29a6c', skinDark: '#b17a4e', hair: '#241d1b', hairDark: '#120e0d',
    hairType: 'quiff',
    jersey: '#b8253a', jerseyDark: '#8b1a2b', trim: '#1c7a4b', kit: 'plain',
    sleeve: '#1c7a4b', shorts: '#1c7a4b', socks: '#b8253a', boots: '#2a2630', numC: '#f2d75f' },

  { id: 'haaland', name: 'Erling Haaland', number: '9',
    skin: '#f2c39c', skinDark: '#d5a077', hair: '#e8c765', hairDark: '#a98c33',
    hairType: 'ponytail', band: '#f2f0e8',
    jersey: '#7ecbe8', jerseyDark: '#57a3c2', trim: '#f2f0e8', kit: 'plain',
    shorts: '#f2f0e8', socks: '#7ecbe8', boots: '#e4d63f', numC: '#1e2d3c' },

  { id: 'mbappe', name: 'Kylian Mbappé', number: '10',
    skin: '#8d5636', skinDark: '#6d4028', hair: '#241f1e', hairDark: '#131010',
    hairType: 'fade',
    jersey: '#26407c', jerseyDark: '#1a2d5b', trim: '#e9e8e2', trim2: '#d1433f', kit: 'band',
    shorts: '#26407c', socks: '#d1433f', boots: '#e8d63c', numC: '#f0ece0' },

  { id: 'neymar', name: 'Neymar Jr', number: '10',
    skin: '#b9764e', skinDark: '#94592f', hair: '#dcc272', hairDark: '#8e7433',
    hairType: 'mohawk',
    jersey: '#e8cb2c', jerseyDark: '#bda11e', trim: '#2b8a4f', kit: 'plain',
    sleeve: '#2b8a4f', shorts: '#2f5fa0', socks: '#f0efe6', boots: '#ec7333', numC: '#20603c' },

  { id: 'salah', name: 'Mohamed Salah', number: '11',
    skin: '#a4653f', skinDark: '#82492a', hair: '#2b201d', hairDark: '#171110',
    hairType: 'curly', beard: 'full',
    jersey: '#c02434', jerseyDark: '#8f1927', trim: '#e9dfc6', kit: 'plain',
    shorts: '#c02434', socks: '#c02434', boots: '#ece4cd', numC: '#f2eee2' },

  { id: 'vinicius', name: 'Vinícius Júnior', number: '7',
    skin: '#71412c', skinDark: '#542e1e', hair: '#231f20', hairDark: '#111011',
    hairType: 'twists',
    jersey: '#f2efe7', jerseyDark: '#cec9bb', trim: '#d8b24a', kit: 'trim',
    shorts: '#f2efe7', socks: '#f2efe7', boots: '#ea7c31', numC: '#2a3350' },

  { id: 'bellingham', name: 'Jude Bellingham', number: '5',
    skin: '#8a5738', skinDark: '#68402a', hair: '#2a2422', hairDark: '#171312',
    hairType: 'curltop',
    jersey: '#f1eee7', jerseyDark: '#cdc8ba', trim: '#c0303c', trim2: '#22315c', kit: 'band',
    shorts: '#22315c', socks: '#f1eee7', boots: '#2b2630', numC: '#22315c' },

  { id: 'debruyne', name: 'Kevin De Bruyne', number: '17',
    skin: '#f0b98f', skinDark: '#d09468', hair: '#c9853f', hairDark: '#8a5525',
    hairType: 'crop',
    jersey: '#b52630', jerseyDark: '#871c24', trim: '#efc94a', trim2: '#26262e', kit: 'band',
    shorts: '#26262e', socks: '#b52630', boots: '#e6d343', numC: '#f2e6c8' },

  { id: 'son', name: 'Son Heung-min', number: '7',
    skin: '#e6b189', skinDark: '#c68d63', hair: '#241f1f', hairDark: '#131010',
    hairType: 'sweep',
    jersey: '#2f2f39', jerseyDark: '#1f1f27', trim: '#d9b44a', kit: 'trim',
    sleeve: '#d9b44a', shorts: '#2f2f39', socks: '#2f2f39', boots: '#ece7d8', numC: '#e6c463' },
];

/* Font 3x5 tự khai cho số áo. Không dùng `fillText`: font hệ thống khác nhau ở mỗi máy nên
 * cùng một bản build ra hình khác nhau, và ở cỡ này chữ do font sinh ra bị khử răng cưa
 * thành một vệt xám nhoè - đúng thứ cả file này đang tránh. */
const DIGIT_3X5 = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
};

/** Số áo, canh giữa quanh (`cx`, `cy`).
 *
 *  Một chữ số thì mỗi ô font bằng đúng 1 pixel gốc (số cao 5, to hết cỡ lưng áo); hai chữ
 *  số thì nén còn 2/3 pixel để cả cụm vừa 4.3 pixel ngang. Cỡ ô luôn là bội của 1/3 pixel
 *  gốc - tức số nguyên pixel lưới con - nếu không nét chữ chỗ dày 2 chỗ dày 3 pixel lưới
 *  con và con số nhìn như bị mọt ăn.
 *
 *  `shadow` là bản sao lệch xuống-phải đúng một pixel lưới con. Nhờ nó số bật hẳn lên khỏi
 *  áo mà không phải chọn màu số riêng cho từng bộ đồ. Truyền `shadow` rỗng thì bỏ hẳn bước
 *  này - số ngực chỉ cao 5 pixel lưới con, thêm bản sao lệch một pixel nữa là nét dày gấp
 *  rưỡi và cả con số bết lại thành một cục.
 *
 *  `unit` ép cỡ ô, dùng cho số ngực. Vẫn phải là bội của 1/3 pixel gốc. */
function footballNumber(g, text, cx, cy, color, shadow, unit) {
  const s = String(text).slice(0, 2);
  const u = unit || (s.length > 1 ? 2 / SPRITE_SS : 1);
  const gap = 1 / SPRITE_SS;
  const dw = 3 * u;
  const snap = (v) => Math.round(v * SPRITE_SS) / SPRITE_SS;
  const x0 = snap(cx - (s.length * dw + (s.length - 1) * gap) / 2);
  const y0 = snap(cy - 2.5 * u);
  const paint = (d, c) => {
    for (let i = 0; i < s.length; i++) {
      const rows = DIGIT_3X5[s[i]] || DIGIT_3X5['0'];
      const gx = x0 + i * (dw + gap) + d;
      for (let ry = 0; ry < 5; ry++) {
        const row = rows[ry];
        let run = 0;
        // Gộp các ô liền nhau thành một nét: vẽ từng ô một thì ở toạ độ lẻ hai ô cạnh nhau
        // hở ra một khe sáng, đúng lỗi mà chú thích của px() nói tới.
        for (let rx = 0; rx <= 3; rx++) {
          if (rx < 3 && row[rx] === '1') { run++; continue; }
          if (run) px(g, gx + (rx - run) * u, y0 + ry * u + d, run * u, u, c);
          run = 0;
        }
      }
    }
  };
  if (shadow) paint(gap, shadow);
  paint(0, color);
}

/** Tóc. Mặt trước dừng ở hàng 3, CHỪA HÀNG 4 LÀM TRÁN - tóc chạm thẳng vào hàng mắt thì hai
 *  mảng tối dính làm một và khuôn mặt mất hẳn đôi mắt (bài học của bộ Năm anh em). Riêng
 *  'fade' cố tình để chân tóc thấp hơn nửa pixel, đó chính là dấu hiệu của kiểu này. */
function footballHair(g, p, view, dy) {
  const t = p.hairType, c = p.hair, d = p.hairDark;
  const back = view === 'back', side = view === 'side';
  const cap = t === 'fade' ? 3.4 : t === 'tousle' ? 3.7 : 4;

  if (back) {
    headBlock(g, dy, 8, c);
    px(g, 4, 7.4 + dy, 8, 0.6, d);              // gáy
  } else {
    headBlock(g, dy, cap, c);
    px(g, 4, cap - 0.55 + dy, 8, 0.55, d);      // chân tóc sẫm, tách tóc khỏi trán
    if (side) px(g, 3, cap - 0.5 + dy, 3.4, 3, c);   // gáy nhìn ngang
    else { px(g, 3, cap + dy, 1, 2, c); px(g, 12, cap + dy, 1, 2, c); }   // hai mai
  }

  if (t === 'quiff') {
    // Chỏm vuốt ngược ra sau, cao hơn khối đầu một pixel.
    //
    // Vệt sáng "gel bắt đèn" đã bỏ: tóc người này gần như đen, nâng sáng đủ để thấy là ra
    // màu ghi, mà nó lại nằm đúng đỉnh đầu nên hậu kỳ nâng sáng mép trên thêm lần nữa - kết
    // quả là một thanh xám trắng vắt ngang đầu, nhìn hệt cái băng đô của Haaland. Đỉnh chỏm
    // đã tự sáng sẵn nhờ RIM_LIGHT, không cần vẽ thêm.
    roundBox(g, side ? 3.4 : 4.2, dy - 1, 6.4, 2.2, 0.9, c);
  } else if (t === 'fade') {
    px(g, 3, 2.3 + dy, 10, 1.1, d);             // hai bên và gáy cạo mờ dần
  } else if (t === 'mohawk') {
    px(g, 3, 0.8 + dy, 10, (back ? 7 : cap) - 0.8, d);      // hai bên cạo sát
    px(g, side ? 5.4 : 6.3, dy - 0.2, 3.4, (back ? 7.6 : cap) + 0.2, c);
    spike(g, side ? 5.2 : 6.1, dy - 1, 3.8, 2, c);          // dải giữa dựng lên
  } else if (t === 'ponytail') {
    if (back) { roundBox(g, 6.2, 7.2 + dy, 3.6, 4.2, 1.4, c); px(g, 6.2, 7.2 + dy, 3.6, 0.6, d); }
    else roundBox(g, side ? 1.5 : 12.4, 3.4 + dy, side ? 2.2 : 1.5, 3.6, 0.7, c);
    px(g, 2.8, 2.5 + dy, 10.4, 0.9, p.band || '#f2f0e8');   // băng đô
  } else if (t === 'curly') {
    // Khối tóc tràn ra RỘNG HƠN đầu - đó là thứ đọc được từ xa, không phải mấy lọn xoăn.
    roundBox(g, 1.9, dy - 0.6, 12.2, back ? 8.8 : 5.4, 2.3, c);
    roundBox(g, 1.3, 1.4 + dy, 2.6, 2.6, 1.3, c);
    roundBox(g, 12.1, 1.4 + dy, 2.6, 2.6, 1.3, c);
    roundBox(g, 5.2, dy - 1, 2.8, 2.4, 1.2, c);
    roundBox(g, 8.4, dy - 0.9, 2.6, 2.3, 1.15, c);
    if (!back) px(g, 4, 4.1 + dy, 8, 0.5, d);
  } else if (t === 'curltop') {
    roundBox(g, 3.2, dy - 0.5, 9.6, back ? 8.5 : 4.5, 1.9, c);
    roundBox(g, 4.5, dy - 1, 2.5, 2.2, 1.1, c);
    roundBox(g, 8.1, dy - 1, 2.7, 2.3, 1.15, c);
    px(g, 3, 2.7 + dy, 10, 0.8, d);             // hai bên tỉa sát, chỉ chừa đỉnh
  } else if (t === 'twists') {
    const xs = side ? [4.3, 6.7, 9.1] : [3.9, 6.3, 8.7, 11.1];
    xs.forEach((bx) => roundBox(g, bx, dy - 0.9, 1.9, 2.1, 0.9, c));
  } else if (t === 'tousle') {
    // Mái dày rối nhẹ: hai lọn tròn nhô lên khỏi khối tóc, hai bên thái dương tỉa ngắn, và
    // một mảng mái phủ lệch xuống trán. Ba thứ đó cộng lại mới ra "kiểu đầu"; để nguyên
    // khối tóc phẳng thì nó là cái mũ bơi. Không vẽ vệt sáng trên đỉnh - xem chú thích của
    // 'quiff', hậu kỳ đã nâng sáng mép trên rồi.
    roundBox(g, side ? 4.2 : 4.4, dy - 0.55, 3.4, 1.9, 0.95, c);
    roundBox(g, side ? 7.8 : 8.2, dy - 0.7, 3.6, 2, 1, c);
    px(g, 3, 2.4 + dy, 1, 1.7, d);
    px(g, 12, 2.4 + dy, 1, 1.7, d);
    // Mái phủ lệch xuống trán: một lớp trùm hết chân tóc rồi một lớp nữa chỉ nửa bên phải,
    // cộng đường rẽ ngôi. Mái phải TRÙM HẾT vạch chân tóc sẫm của phần chung, đừng để nó
    // hở ra phía trên - hai vạch song song cách nhau một quãng tóc thì đọc thành cái gờ vắt
    // ngang trán, nhìn như đội mũ chứ không phải mái tóc.
    if (!back) {
      px(g, side ? 4.6 : 4.4, cap - 0.65 + dy, 7.6, 0.85, c);
      px(g, side ? 7 : 7.2, cap - 0.15 + dy, side ? 5.2 : 4.4, 0.7, c);
      px(g, side ? 6.8 : 5.4, cap - 0.65 + dy, 0.45, 1.1, d);          // đường rẽ ngôi
    }
  } else if (t === 'sweep') {
    // Mái rẽ lệch, phủ xuống hẳn nửa trán bên phải rồi hớt lên - silhouette LỆCH là dấu hiệu
    // duy nhất tách kiểu này khỏi 'crop', nên nó phải lệch đủ để thấy, không chỉ dày thêm.
    if (!back) {
      px(g, side ? 6.4 : 6.8, cap - 1.2 + dy, side ? 6.2 : 6, 1.8, c);
      px(g, side ? 9.6 : 9.8, cap + 0.6 + dy, side ? 3 : 3.2, 0.8, c);
      px(g, side ? 6.4 : 6.8, cap - 1.2 + dy, 0.5, 1.8, lighten(c, 0.18));   // đường rẽ ngôi
    } else px(g, 8.6, 1 + dy, 1, 6.4, d);
  }
}

/** Râu. Vẽ TRƯỚC tóc và trước mặt.
 *
 *  Mảng râu lấy đúng đường bo của khối đầu - tô lại cả khối đầu bằng màu râu rồi trả lại
 *  phần da phía trên - nên nó ôm sát mép cằm thay vì là một khối chữ nhật lửng lơ bên trong
 *  khuôn mặt. Vì tô đè cả đầu nên phải chạy TRƯỚC `footballHair`, và phần da trả lại chỉ bắt
 *  đầu từ y=3.2 (dưới chỗ khối đầu hết bo góc): trả từ hàng 1 thì hai góc vuông của mảng da
 *  thò ra ngoài silhouette, mà tóc thì bo tròn nên không che kín được.
 *
 *  Ba luật rút ra từ bản trước - bản đó bị phản hồi thẳng là "râu chảy lên tới mắt":
 *
 *  1. **Mép trên của mảng râu nằm DƯỚI miệng**, không bao giờ chạm hàng mắt. Mắt kết thúc ở
 *     y=7 mà bản trước đặt mép râu ở 7.1, lại còn hai vệt dọc rộng 1.2 nằm đúng dưới hai con
 *     mắt - hai mảng tối cách nhau 1/3 pixel thì mắt nhìn ra dính liền với râu.
 *  2. **Phần nối lên quai hàm là vệt PHA VỚI DA**, mảnh và mờ. Râu ngắn thì chân râu hở da,
 *     tô nguyên màu tóc là ra hai thanh đen kẻ dọc mặt.
 *  3. **Râu nhạt hơn tóc một chút** vì cùng lý do. Cùng một màu thì tóc, râu và mắt gộp thành
 *     một khối đen đặc - đúng cái bẫy gọng kính kín ở bộ Năm anh em. */
function footballBeard(g, p, view, dy) {
  if (!p.beard || view === 'back') return;
  const side = view === 'side';
  const full = p.beard === 'full';
  const top = full ? 7.85 : 8.4;              // mép trên mảng râu, luôn ở dưới miệng

  // Hai khối đầu chồng nhau, khối trên nhấc lên 0.4: phần lộ ra ở dưới là một vệt sẫm CHẠY
  // THEO ĐƯỜNG BO của cằm. Kẻ một thanh ngang thay cho nó thì cái cằm tròn bị chặn ngang bởi
  // một vạch thẳng, nhìn như đeo quai mũ.
  headBlock(g, 1 + dy, 9, p.hairDark);
  headBlock(g, 0.6 + dy, 9, mixC(p.hair, p.skin, 0.14));
  px(g, 3, 3.2 + dy, 10, top - 3.2, p.skin);
  // Chân râu thưa dần lên phía mai tóc, sát mép mặt chứ không nằm dưới con mắt.
  const jaw = mixC(p.hair, p.skin, 0.46), jy = full ? 6.7 : 7.3;
  px(g, 3, jy + dy, 0.85, top - jy, jaw);
  px(g, 12.15, jy + dy, 0.85, top - jy, jaw);
  // Râu rậm trùm qua cả miệng nên phải khoét chỗ cho miệng; râu ngắn thì miệng đã ở trên rồi.
  if (full) px(g, side ? 9.2 : 5.6, top + dy, side ? 3.6 : 4.8, 0.8, p.skin);
}

function footballFace(g, p, view, dy) {
  if (view === 'back') return;
  const side = view === 'side';
  // Có râu thì má hồng phải dâng lên: để nguyên chỗ cũ là chấm hồng đè lên đúng quai hàm.
  const by = p.beard ? 6.3 : 6.9;
  if (side) {
    eye(g, 9, 5 + dy, 2, 2);
    px(g, 12, 5.9 + dy, 1, 0.9, p.skin);        // mũi
    px(g, 12, 6.6 + dy, 1, 0.34, p.skinDark);
    px(g, 10.8, by + 0.1 + dy, 1.1, 0.9, BLUSH);
  } else {
    eye(g, 4, 5 + dy, 2, 2);
    eye(g, 10, 5 + dy, 2, 2);
    px(g, 7.7, 6.6 + dy, 0.7, 0.4, p.skinDark);
    px(g, 3, by + dy, 1.1, 0.9, BLUSH);
    px(g, 11.9, by + dy, 1.1, 0.9, BLUSH);
  }
  if (p.beard) {
    // Ria mép: hai nét ngắn CHỪA KHE NHÂN TRUNG ở giữa. Một thanh liền thì nó dài đúng bằng
    // cái miệng ngay dưới, và hai vạch song song đọc ra thành cái miệng kẻ bằng bút dạ. Nét
    // cũng hẹp hơn hẳn khoảng cách hai con mắt (mắt ở x 4..6 và 10..12) nên không dính mắt.
    const mc = mixC(p.hair, p.skin, 0.08);
    if (side) px(g, 10.5, 7.25 + dy, 2.3, 0.45, mc);
    else { px(g, 6.3, 7.25 + dy, 1.5, 0.45, mc); px(g, 8.2, 7.25 + dy, 1.5, 0.45, mc); }
    // Miệng phải sẫm hơn `skinDark`: nằm giữa hai mảng râu nên tương phản với da không đủ.
    px(g, side ? 9.7 : 7.2, 8 + dy, side ? 1.4 : 1.6, 0.32, mixC(p.skinDark, p.hair, 0.5));
    return;
  }
  px(g, side ? 9.4 : 7, 7.5 + dy, side ? 1.6 : 2, 0.34, p.skinDark);   // miệng
  if (!side) px(g, 7.3, 7.84 + dy, 1.4, 0.33, p.skinDark);
}

function footballHead(g, p, view, dy) {
  headBlock(g, 1 + dy, 9, p.skin);
  footballBeard(g, p, view, dy);
  footballHair(g, p, view, dy);
  footballFace(g, p, view, dy);
}

/** Áo đấu. `sitting` là dáng ngồi khom nên lưng rộng và dài hơn.
 *
 *  Thân bắt đầu ở y=10, ĐÚNG hàng kết thúc của khối đầu - lệch một hàng là hở một vệt sàn
 *  ngang cổ. */
function footballJersey(g, p, view, sitting, dy) {
  const y = 10 + dy;
  const x0 = sitting ? 3 : 4, w = sitting ? 10 : 8, h = sitting ? 7 : 6;
  roundBox(g, x0, y, w, h, sitting ? 1 : 0.8, p.jersey);
  clothShade(g, x0, y, w, h, p.jersey);

  if (p.kit === 'stripes') {
    // Dừng trước gấu áo một quãng để mảng tối của clothShade còn nhìn thấy, nếu không cái áo
    // sọc phẳng lì trong khi chín cái áo kia đều có chiều dày.
    for (let i = 0; i < 3; i++) px(g, x0 + 1 + i * (w - 3.2) / 2.5, y + 0.6, 1.2, h - 1.3, p.trim);
  } else if (p.kit === 'band') {
    px(g, x0, y + 2.2, w, 1.3, p.trim);
    if (p.trim2) px(g, x0, y + 3.5, w, 0.5, p.trim2);
  } else if (p.kit === 'trim') {
    px(g, x0, y + 0.6, 0.7, h - 1, p.trim);
    px(g, x0 + w - 0.7, y + 0.6, 0.7, h - 1, p.trim);
  }

  px(g, x0, y, w, 0.7, p.trim);                          // viền cổ chạy ngang vai
  px(g, x0 + w / 2 - 1.2, y, 2.4, view === 'back' ? 0.7 : 1.2, p.jerseyDark);   // hõm cổ
  if (view === 'back') {
    // `dy` phải cộng vào đây: tư thế gục xuống hạ cả thân 2 pixel, quên thì con số đứng
    // nguyên chỗ cũ và trôi lên khỏi lưng áo.
    footballNumber(g, p.number, x0 + w / 2, (sitting ? 14 : 13.5) + dy, p.numC, darken(p.jersey, 0.42));
  } else if (view === 'front') {
    // Số ngực. Ô font còn 1/3 pixel gốc, tức số cao 1.67 pixel - bằng đúng một phần ba số
    // lưng, và đó là tỷ lệ của áo thật. Lấy nguyên cỡ số lưng thì nó trùm kín ngực, chồng
    // lên sọc lẫn dải ngang và cả hai cùng không đọc được.
    //
    // Đặt LỆCH sang ngực trái (phía người xem là bên phải) như áo thật, cũng để tránh hõm cổ
    // ở giữa. Không vẽ ở khung nhìn ngang: ở đó thân chỉ còn vài pixel bề ngang, con số bị
    // ép lại thành một vệt bẩn.
    // Chỗ đặt phải tính theo LƯỚI CON, và kit 'band' phải khác. Ngực cao 18 hàng lưới con:
    // viền cổ chiếm 30..32, dải ngang chiếm 37..42, gấu áo sẫm bắt đầu ở 43. Số cao đúng 5
    // hàng nên khe trên (32..37) vừa khít KHÔNG CÒN LỀ - với kit trơn/sọc thì không sao vì
    // dưới nó vẫn là màu áo, còn kit 'band' thì hàng cuối của chữ số áp thẳng vào dải ngang.
    // Chữ số nào cũng có hàng đáy đặc nên nó dính luôn vào dải, và với bộ đồ mà `numC` cùng
    // tông với dải (Mbappé: số kem, dải trắng) thì mất hẳn chân chữ số.
    //
    // Vì vậy kit 'band' đẩy số xuống dưới dải, nằm trên nền gấu áo sẫm - vẫn là màu áo nên
    // tương phản với `numC` giữ nguyên như số lưng.
    const nx = x0 + w - (String(p.number).length > 1 ? 2.1 : 1.6);
    footballNumber(g, p.number, nx, y + (p.kit === 'band' ? 4.83 : 1.5), p.numC, null, 1 / SPRITE_SS);
  }
}

/** Tay áo NGẮN, cẳng tay để trần - đó là chi tiết nói "đây là cầu thủ" chứ không phải một
 *  nhân viên văn phòng mặc áo màu lạ. */
function footballArms(g, p, view, step) {
  const sl = p.sleeve || p.jersey;
  if (view === 'side') {
    const ax = step === 1 ? 10 : step === 2 ? 4 : 7;
    // Vạch tối dọc mép trái: cánh tay nằm ĐÈ lên thân, cùng nằm trong silhouette nên hậu kỳ
    // không viền được cho nó. Thiếu vạch này thì khúc cẳng tay màu da giữa cái áo trông như
    // một lỗ thủng chứ không phải cánh tay.
    px(g, ax - 0.34, 11, 0.34, 5, darken(p.jersey, 0.3));
    roundBox(g, ax, 11, 2, 1.7, 0.5, sl);
    roundBox(g, ax, 12.7, 2, 2.2, 0.5, p.skin);
    roundBox(g, ax, 14.9, 2, 1.1, 0.45, p.skinDark);
    return;
  }
  [3, 12].forEach((ax, i) => {
    px(g, ax, 11, 1, 1.7, i ? darken(sl, 0.1) : lighten(sl, 0.06));
    px(g, ax, 12.7, 1, 2.2, i ? darken(p.skin, 0.08) : p.skin);
    roundBox(g, ax, 14.9, 1, 1.1, 0.4, p.skin);
  });
}

/** Chân: quần đùi, một quãng da trần, tất cao rồi giày. Bốn mảng chồng lên nhau trong 4
 *  pixel dọc - đó là silhouette nhận ra ngay từ xa, và là lý do bộ này không dùng lại
 *  `legs()` của bộ Văn phòng. */
function footballLegs(g, p, step) {
  const off = step === 1 ? 1 : step === 2 ? -1 : 0;
  [5, 9].forEach((x) => {
    px(g, x, 16, 2, 1.5, p.shorts);
    px(g, x, 16, 0.5, 1.5, lighten(p.shorts, 0.1));
    px(g, x + 1.5, 16, 0.5, 1.5, darken(p.shorts, 0.12));
    px(g, x + 0.2, 17.5, 1.6, 0.4, p.skin);              // đầu gối để trần
    px(g, x + 0.2, 17.9, 1.6, 0.95, p.socks);            // tất cao
    px(g, x + 0.2, 17.9, 0.4, 0.95, lighten(p.socks, 0.12));
  });
  roundBox(g, 5 - Math.max(0, off), 18.85, 2, 1.15, 0.45, p.boots);
  roundBox(g, 9 + Math.max(0, -off), 18.85, 2, 1.15, 0.45, p.boots);
}

function footballWalk(g, p, view, step) {
  footballHead(g, p, view, 0);
  footballJersey(g, p, view, false, 0);
  footballArms(g, p, view, step);
  footballLegs(g, p, step);
}

function footballSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0;
  const turn = arms === 'turn';
  footballHead(g, p, turn ? 'front' : 'back', drop);
  footballJersey(g, p, turn ? 'front' : 'back', true, drop);
  if (!turn) px(g, 7.4, 10.9 + drop, 1.2, 0.9, darken(p.jersey, 0.12));   // rãnh sống lưng
  const sl = p.sleeve || p.jersey;
  if (arms === 'sleep') {
    px(g, 2, 12 + drop, 2, 1.5, sl);
    px(g, 12, 12 + drop, 2, 1.5, sl);
    px(g, 2, 13.5 + drop, 2, 1.4, p.skin);
    px(g, 12, 13.5 + drop, 2, 1.4, p.skin);
    roundBox(g, 2, 14.9 + drop, 2, 1.1, 0.45, p.skin);
    roundBox(g, 12, 14.9 + drop, 2, 1.1, 0.45, p.skin);
    return;
  }
  if (arms === 'rest' || turn) {
    px(g, 2, 12, 2, 1.6, sl);
    px(g, 12, 12, 2, 1.6, sl);
    px(g, 2, 13.6, 2, 2.3, p.skin);
    px(g, 12, 13.6, 2, 2.3, p.skin);
    roundBox(g, 2, 15.9, 2, 1.1, 0.45, p.skin);
    roundBox(g, 12, 15.9, 2, 1.1, 0.45, p.skin);
    return;
  }
  const up = arms === 'typeA';
  px(g, 1, 11, 3, 1.7, sl);
  px(g, 12, 11, 3, 1.7, sl);
  px(g, 1, 12.7, 3, up ? 1.3 : 2.3, p.skin);
  px(g, 12, 12.7, 3, up ? 2.3 : 1.3, p.skin);
  px(g, 1, up ? 14 : 15, 3, 1, p.skin);
  px(g, 12, up ? 15 : 14, 3, 1, p.skin);
}

function drawFootballFrame(g, p, key) {
  switch (key) {
    case 'd0': return footballWalk(g, p, 'front', 0);
    case 'd1': return footballWalk(g, p, 'front', 1);
    case 'd2': return footballWalk(g, p, 'front', 2);
    case 'u0': return footballWalk(g, p, 'back', 0);
    case 'u1': return footballWalk(g, p, 'back', 1);
    case 'u2': return footballWalk(g, p, 'back', 2);
    case 's0': return footballWalk(g, p, 'side', 0);
    case 's1': return footballWalk(g, p, 'side', 1);
    case 's2': return footballWalk(g, p, 'side', 2);
    case 'k0': return footballSit(g, p, 'rest');
    case 'k1': return footballSit(g, p, 'typeA');
    case 'k2': return footballSit(g, p, 'typeB');
    case 'k3': return footballSit(g, p, 'sleep');
    case 'kf': return footballSit(g, p, 'turn');
    default: return footballWalk(g, p, 'front', 0);
  }
}

/* ============================================================ khung dùng chung */

/* Tám bộ. Chọn một bộ thì CẢ PHÒNG theo bộ đó, và mỗi agent nhận một nhân vật khác nhau
 * trong bộ; hết nhân vật thì quay vòng dùng lại.
 *
 * Tên nhân vật không dịch (giống tên sản phẩm), nhưng tên BỘ thì dịch qua khoá i18n
 * `office.pack_<id>` vì đó là chữ mô tả, không phải danh từ riêng. */
const BUILTIN_PACKS = [
  // Hải trình đứng đầu và là bộ MẶC ĐỊNH: 36 nhân vật nên phòng đông tới đâu cũng không
  // trùng mặt, còn mấy bộ 10 người thì quá 10 agent là bắt đầu lặp.
  { id: 'voyage', chars: VOYAGE_CHARS, draw: drawVoyageFrame },
  { id: 'ninja', chars: NINJA_CHARS, draw: drawNinjaFrame },
  { id: 'office', chars: OFFICE_CHARS, draw: drawPersonFrame },
  { id: 'pets', chars: PET_CHARS, draw: drawPetFrame },
  { id: 'slime', chars: SLIME_CHARS, draw: drawSlimeFrame },
  { id: 'mascot', chars: MASCOT_CHARS, draw: drawMascotFrame },
  { id: 'crew', chars: CREW_CHARS, draw: drawCrewFrame },
  { id: 'legends', chars: FOOTBALL_CHARS, draw: drawFootballFrame },
];

/* `let` chứ không `const`: người dùng nhập thêm bộ từ ảnh của họ lúc đang chạy (xem
 * packimport.js), nên danh sách này thay đổi được. Bộ nhập vào chỉ nằm ở máy người dùng. */
let PACKS = BUILTIN_PACKS.slice();

/* Bảng phẳng mọi nhân vật của mọi bộ, theo đúng thứ tự hàng trong atlas. office.js chỉ giữ
 * một số nguyên `charIndex` trỏ vào đây, không cần biết bộ nào. */
let ALL_CHARS = [];

/* Tăng mỗi lần bảng phẳng đổi (nhập thêm bộ, xoá bộ). Atlas đã nướng ghi lại số này và tự
 * coi mình là hết hạn khi lệch: chỉ số phẳng vẫn là mấy con số cũ nhưng nay trỏ sang nhân
 * vật khác, nên không có nó thì xoá một bộ nhập tay là cả phòng đổi mặt lung tung mà atlas
 * vẫn tưởng mình còn đúng. */
let CHAR_GEN = 0;

function rebuildCharTable() {
  ALL_CHARS = [];
  PACKS.forEach((pack) => {
    pack.start = ALL_CHARS.length;
    pack.chars.forEach((c) => ALL_CHARS.push({ pack, char: c }));
  });
  CHAR_GEN++;
}
rebuildCharTable();

/** Vẽ một nhân vật đã nhập từ ảnh: chỉ có đúng một hình, chuyển động dựng bằng cách xê dịch.
 *
 *  Ảnh người dùng đưa vào gần như luôn chỉ có một tư thế đứng, không có đủ 13 khung hình.
 *  Nhún người theo nhịp đi và rung nhẹ khi gõ phím là đủ để nhìn ra đang làm gì - hơn hẳn
 *  việc đứng chết một chỗ, mà không cần đòi người dùng phải có sprite sheet đầy đủ. */
function drawImportedFrame(g, c, key) {
  if (!c.canvas) return;
  let dx = 0, dy = 0;
  if (key === 'd1' || key === 'u1' || key === 's1') dy = -1;      // nhấc chân
  else if (key === 'd2' || key === 'u2' || key === 's2') dy = 1;  // hạ chân
  else if (key === 'k1') dx = -1;                                 // gõ phím
  else if (key === 'k2') dx = 1;
  else if (key === 'k3') dy = 2;                                  // gục xuống
  // Kéo về đúng khuôn của lưới con, KHÔNG vẽ 1:1: bộ nhập từ bản trước cất ở localStorage
  // vẫn là ảnh 16x20, phải phóng lên mới nằm đúng chỗ; bộ nhập mới đã sẵn ở lưới con nên
  // đây là phép sao chép nguyên si.
  const S = SPRITE_SS;
  g.drawImage(c.canvas, dx * S, dy * S, SPRITE_W * S, SPRITE_H * S);
}

/** Thêm một bộ do người dùng nhập. `chars` là [{id, name, canvas}]. */
function addCustomPack(id, chars) {
  PACKS = PACKS.filter((p) => p.id !== id);
  PACKS.push({ id, chars, draw: drawImportedFrame, custom: true, outline: false });
  rebuildCharTable();
}

function removeCustomPack(id) {
  PACKS = PACKS.filter((p) => p.id !== id);
  rebuildCharTable();
}

function packById(id) {
  return PACKS.find((p) => p.id === id) || PACKS[0];
}

/** Chỉ số phẳng của nhân vật thứ `i` trong một bộ. Quay vòng khi `i` vượt số nhân vật. */
function charAt(packId, i) {
  const p = packById(packId);
  return p.start + (((i % p.chars.length) + p.chars.length) % p.chars.length);
}

const CAT_W = 10;
const CAT_H = 8;

/* ------------------------------------------------------------- hậu kỳ: khối và viền
 *
 * Hai việc, làm trong CÙNG một lượt quét vì cả hai chỉ cần bản đồ alpha của ô:
 *
 * 1. ĐỔ BÓNG THEO MÉP. Mép trên-trái của silhouette được nâng sáng, mép dưới-phải bị hạ tối,
 *    cộng một chênh sáng rất nhẹ theo đường chéo cả người. Đây là thứ biến mảng màu phẳng
 *    thành khối có chiều, và nó chạy cho MỌI bộ mà không phải khai thêm màu cho ai: bóng và
 *    sáng đều suy ra từ chính màu đang có.
 * 2. VIỀN. Viền tối quanh silhouette là thứ tách nhân vật khỏi sàn. Hai điểm khác bản trước:
 *    dày đúng MỘT pixel của lưới con (1/3 pixel gốc) thay vì một pixel gốc đặc, và màu viền
 *    lấy từ chính màu nó đang chạm vào rồi hạ tối, chứ không phải một màu tím than dùng
 *    chung. Viền đồng màu làm cái áo đỏ và mái tóc vàng cùng đóng khung một màu, nhìn như
 *    hình dán; viền theo màu thì tóc có viền tóc, áo có viền áo.
 *
 * Làm bằng một lần getImageData cho CẢ atlas rồi quét từng ô: gọi getImageData 1500 lần
 * (mỗi ô một lần) tốn hơn hẳn, mà kết quả y hệt.
 */
const RIM_LIGHT = 0.17;           // nâng sáng mép trên-trái
const EDGE_SHADE = 0.20;          // hạ tối mép dưới-phải
const FORM_GRAD = 0.05;           // chênh sáng theo đường chéo, rất nhẹ
const OUTLINE_MIX = 0.52;         // viền = màu hàng xóm hạ tối chừng này

/** Hậu kỳ cho một ô trong bộ đệm pixel của atlas. `data` là mảng RGBA của cả atlas. */
function finishCell(data, W, ox, oy, w, h, outline) {
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = ((oy + y) * W + ox) * 4 + 3;
    for (let x = 0; x < w; x++) alpha[y * w + x] = data[row + x * 4] > 128 ? 1 : 0;
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : alpha[y * w + x]);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((oy + y) * W + ox + x) * 4;
      if (alpha[y * w + x]) {
        const up = at(x, y - 1), left = at(x - 1, y), down = at(x, y + 1), right = at(x + 1, y);
        let f = 1 + FORM_GRAD * (1 - x / w - y / h);
        if (!up || !left) f *= 1 + RIM_LIGHT;
        else if (!down || !right) f *= 1 - EDGE_SHADE;
        else if (!at(x, y + 2) || !at(x + 2, y)) f *= 1 - EDGE_SHADE * 0.35;
        if (f !== 1) {
          data[i] = Math.min(255, data[i] * f);
          data[i + 1] = Math.min(255, data[i + 1] * f);
          data[i + 2] = Math.min(255, data[i + 2] * f);
        }
        continue;
      }
      if (!outline) continue;
      // Màu viền lấy trung bình các ô đặc kề bên - đó là chỗ "viền theo màu" đến từ.
      let n = 0, r = 0, gg = 0, b = 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (!at(nx, ny)) continue;
        const j = ((oy + ny) * W + ox + nx) * 4;
        r += data[j]; gg += data[j + 1]; b += data[j + 2]; n++;
      }
      if (!n) continue;
      const k = 1 - OUTLINE_MIX;
      data[i] = (r / n) * k;
      data[i + 1] = (gg / n) * k;
      data[i + 2] = (b / n) * k;
      data[i + 3] = 255;
    }
  }
}

/** Atlas: mỗi nhân vật CẦN VẼ một hàng, mỗi khung hình một cột; con mèo ở hàng cuối.
 *
 *  Hàng được xếp thành nhiều CỘT KHỐI khi quá cao: ở lưới con, hơn trăm nhân vật xếp thành
 *  một dải dọc duy nhất là canvas cao hơn 8192 pixel - ngưỡng texture của kha khá GPU, vượt
 *  qua là trình duyệt lặng lẽ bỏ tăng tốc phần cứng và cả khung nhìn giật.
 *
 *  `want` là danh sách chỉ số phẳng cần nướng. **Chỉ nướng những nhân vật thật sự xuất hiện
 *  trong phòng**, không nướng cả tám bộ: đo được 127 nhân vật là 2268x4092 pixel, tức 35.4 MB
 *  vùng nhớ ảnh cộng thêm 35.4 MB nữa cho bản ImageData tạm trong `finishCell()` - đỉnh 71 MB
 *  ngay lúc người dùng vừa bấm vào tab Văn phòng. Mà phòng chỉ có 10 chỗ ngồi và mỗi lúc chỉ
 *  hiện MỘT bộ, nên gần 90% số hàng đó không bao giờ được vẽ ra.
 *
 *  Bỏ `want` đi thì nướng tất - vẫn giữ đường này cho ô xem trước và cho việc đo.
 *
 *  Chỉ số vẫn là **chỉ số phẳng vào `ALL_CHARS`** như cũ, không đánh số lại: `office.js` và
 *  `localStorage` đều giữ số đó, đánh lại là mọi lựa chọn ép riêng của người dùng trỏ sai
 *  người. Bảng `rowOf` lo phần ánh xạ chỉ số phẳng => hàng trong atlas. */
function buildSpriteAtlas(want) {
  const S = SPRITE_SS;
  const cols = FRAMES.length;
  const n = ALL_CHARS.length || 1;
  const norm = (i) => ((Math.round(i) % n) + n) % n;
  // Sắp xếp và bỏ trùng: nhờ vậy cùng một tập nhân vật luôn ra cùng một bố cục, và
  // `covers()` so được bằng phép kiểm tập con đơn giản.
  const list = want && want.length
    ? Array.from(new Set(Array.from(want, norm))).sort((a, b) => a - b)
    : ALL_CHARS.map((_, i) => i);
  const rowOf = new Map(list.map((idx, r) => [idx, r]));
  const gen = CHAR_GEN;
  const rows = list.length + 1;                    // +1 cho hàng con mèo
  // Chừa 1 pixel gốc quanh mỗi ô để viền không tràn sang ô bên cạnh - thiếu chỗ này thì nhân
  // vật nào cũng dính một vệt tối của hàng xóm.
  const cw = (SPRITE_W + 2) * S;
  const ch = (SPRITE_H + 2) * S;
  const perCol = Math.max(1, Math.floor(4096 / ch));
  const groups = Math.ceil(rows / perCol);

  const cv = document.createElement('canvas');
  cv.width = cols * cw * groups;
  cv.height = Math.min(rows, perCol) * ch;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;

  /** Góc trên trái của một ô trong atlas. */
  const originOf = (r, c) => [Math.floor(r / perCol) * cols * cw + c * cw, (r % perCol) * ch];

  const cells = [];
  list.forEach((idx, r) => {
    const entry = ALL_CHARS[idx];
    if (!entry) return;
    FRAMES.forEach((key, c) => {
      const [ox, oy] = originOf(r, c);
      g.save();
      g.translate(ox + S, oy + S);
      // Bộ nhập từ ảnh vẽ bằng drawImage nên cần nội suy; nét vẽ tay thì không.
      g.imageSmoothingEnabled = !!entry.pack.custom;
      g.imageSmoothingQuality = 'high';
      entry.pack.draw(g, entry.char, key);
      g.restore();
      // Bộ nhập từ ảnh đã có viền sẵn trong ảnh gốc; tô thêm là viền đôi, dày cộp.
      cells.push([ox, oy, entry.pack.outline !== false]);
    });
  });

  const catRow = list.length;
  for (let i = 0; i < 2; i++) {
    const [ox, oy] = originOf(catRow, i);
    g.save();
    g.translate(ox + S, oy + S);
    g.imageSmoothingEnabled = false;
    drawCat(g, i);
    g.restore();
    cells.push([ox, oy, true]);
  }

  const img = g.getImageData(0, 0, cv.width, cv.height);
  cells.forEach(([ox, oy, outline]) => finishCell(img.data, cv.width, ox, oy, cw, ch, outline));
  g.putImageData(img, 0, 0);

  return {
    canvas: cv,
    cols,
    rows: list.length,
    /** Đã nướng đủ những nhân vật này chưa. Đây là thứ `office.js` hỏi trước khi vẽ, thay
     *  cho việc nướng lại vô điều kiện: cùng một bộ thì lần nào cũng đủ, chỉ lúc đổi bộ hay
     *  ép riêng cho một agent mới phải dựng lại. */
    covers(indices) {
      if (gen !== CHAR_GEN) return false;
      for (const i of indices) if (!rowOf.has(norm(i))) return false;
      return true;
    },
    /** Ô của một khung hình => tham số cho drawImage. Kèm luôn 1 pixel gốc viền mỗi bên.
     *  Kích thước trả về tính bằng pixel THẬT của atlas, chia SPRITE_SS ra pixel gốc. */
    cell(charIndex, frameKey) {
      const c = FRAME_INDEX[frameKey] == null ? 0 : FRAME_INDEX[frameKey];
      // Chỉ số chưa nướng thì rơi về hàng đầu chứ không vẽ ra vùng trống của canvas: vùng
      // trống là trong suốt nên nhân vật sẽ BIẾN MẤT, mà mất người thì người dùng tưởng
      // tool hỏng. Đúng ra `covers()` phải chặn từ trước, đây chỉ là lưới an toàn.
      const r = rowOf.has(norm(charIndex)) ? rowOf.get(norm(charIndex)) : 0;
      const [ox, oy] = originOf(r, c);
      return [ox, oy, cw, ch];
    },
    catCell(step) {
      const [ox, oy] = originOf(catRow, step ? 1 : 0);
      return [ox, oy, (CAT_W + 2) * S, (CAT_H + 2) * S];
    },
  };
}

/** Vẽ một nhân vật ra canvas riêng, phóng `scale` lần - dùng cho ô xem mẫu ở bảng chọn.
 *  Vẽ thẳng chứ không cắt từ atlas: bảng chọn mở ra trước khi phòng kịp dựng atlas.
 *
 *  Ô xem mẫu vẽ ở độ phân giải màn hình thật (`devicePixelRatio`) rồi thu lại bằng CSS: đây
 *  là chỗ duy nhất trong tool có nhân vật đứng yên cho người ta soi, để nó răng cưa thì mọi
 *  công vẽ nét ở trên coi như đổ đi. */
function renderCharPreview(canvas, charIndex, scale) {
  const entry = ALL_CHARS[((charIndex % ALL_CHARS.length) + ALL_CHARS.length) % ALL_CHARS.length];
  const S = SPRITE_SS;
  const w = (SPRITE_W + 2) * S;
  const h = (SPRITE_H + 2) * S;

  const cell = document.createElement('canvas');
  cell.width = w;
  cell.height = h;
  const cg = cell.getContext('2d', { willReadFrequently: true });
  cg.imageSmoothingEnabled = !!entry.pack.custom;
  cg.imageSmoothingQuality = 'high';
  cg.save();
  cg.translate(S, S);
  entry.pack.draw(cg, entry.char, 'd0');
  cg.restore();
  const img = cg.getImageData(0, 0, w, h);
  finishCell(img.data, w, 0, 0, w, h, entry.pack.outline !== false);
  cg.putImageData(img, 0, 0);

  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const cssW = (SPRITE_W + 2) * scale;
  const cssH = (SPRITE_H + 2) * scale;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(cell, 0, 0, w, h, 0, 0, canvas.width, canvas.height);
}

/** Tên nhân vật để hiện trong bảng chọn. */
function charName(charIndex) {
  const e = ALL_CHARS[((charIndex % ALL_CHARS.length) + ALL_CHARS.length) % ALL_CHARS.length];
  return e.char.name;
}

/** Khoá bền của một nhân vật, dạng "bộ:nhân-vật". Dùng để lưu lựa chọn xuống localStorage:
 *  lưu chỉ số thì thêm một nhân vật vào giữa bộ là mọi lựa chọn cũ trỏ sai người. */
function charKey(charIndex) {
  const e = ALL_CHARS[((charIndex % ALL_CHARS.length) + ALL_CHARS.length) % ALL_CHARS.length];
  return e.pack.id + ':' + e.char.id;
}

/** Ngược lại của charKey. -1 nếu khoá không còn tồn tại (bộ cũ, nhân vật đã bỏ). */
function charIndexByKey(key) {
  const [packId, charId] = String(key || '').split(':');
  return ALL_CHARS.findIndex((e) => e.pack.id === packId && e.char.id === charId);
}
