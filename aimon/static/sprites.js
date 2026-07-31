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
];
const FRAME_INDEX = {};
FRAMES.forEach((k, i) => { FRAME_INDEX[k] = i; });

/* ------------------------------------------------------------- nét cơ bản */

/** Hình chữ nhật đặc, bo về pixel nguyên. Mọi nét trong file này đi qua đây. */
function px(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x | 0, y | 0, w | 0, h | 0);
}

/** Khối đầu bo góc. Vuông vức thì nhìn như cái hộp, bo 1 pixel bốn góc là đủ mềm. */
function headBlock(g, y0, h, color) {
  px(g, 4, y0, 8, 1, color);
  px(g, 3, y0 + 1, 10, h - 2, color);
  px(g, 4, y0 + h - 1, 8, 1, color);
}

/** Mặt nhìn thẳng: mắt to có chấm sáng, má hồng, miệng nhỏ. Đây là toàn bộ phần "cute". */
function faceFront(g, p, dy) {
  px(g, 4, 5 + dy, 2, 2, INK);          // mắt trái
  px(g, 10, 5 + dy, 2, 2, INK);         // mắt phải
  px(g, 4, 5 + dy, 1, 1, EYE_LIGHT);    // chấm sáng - bỏ đi là ánh nhìn chết hẳn
  px(g, 10, 5 + dy, 1, 1, EYE_LIGHT);
  px(g, 3, 7 + dy, 1, 1, BLUSH);        // má
  px(g, 12, 7 + dy, 1, 1, BLUSH);
  px(g, 7, 7 + dy, 2, 1, p.skinDark);   // miệng
}

/** Mặt nhìn ngang: chỉ một mắt, thêm cái mũi nhỏ nhô ra. */
function faceSide(g, p) {
  px(g, 9, 5, 2, 2, INK);
  px(g, 9, 5, 1, 1, EYE_LIGHT);
  px(g, 12, 6, 1, 1, p.skin);           // mũi
  px(g, 11, 7, 1, 1, BLUSH);
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
      px(g, 3, dy, 2, 2, p.hairC);            // hai tai nhọn
      px(g, 11, dy, 2, 2, p.hairC);
      px(g, 4, dy, 1, 1, BLUSH);              // lòng tai
      px(g, 11, dy, 1, 1, BLUSH);
      headBlock(g, 1 + dy, 4, p.hairC);
      px(g, 3, 4 + dy, 1, 3, p.hairC);
      px(g, 12, 4 + dy, 1, 3, p.hairC);
      px(g, 4, 4 + dy, 8, 1, p.hairDark);
    },
    back(g, p, dy) {
      px(g, 3, dy, 2, 2, p.hairC);
      px(g, 11, dy, 2, 2, p.hairC);
      headBlock(g, 1 + dy, 7, p.hairC);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      px(g, 4, 0, 2, 2, p.hairC);
      px(g, 9, 0, 2, 2, p.hairC);
      headBlock(g, 1, 4, p.hairC);
      px(g, 3, 4, 4, 3, p.hairC);
    },
  },

  spiky: {
    front(g, p, dy) {
      px(g, 4, dy, 2, 1, p.hairC);            // ba chóp dựng
      px(g, 7, dy, 2, 1, p.hairC);
      px(g, 10, dy, 2, 1, p.hairC);
      headBlock(g, 1 + dy, 4, p.hairC);
      px(g, 3, 4 + dy, 1, 2, p.hairC);
      px(g, 12, 4 + dy, 1, 2, p.hairC);
      px(g, 4, 4 + dy, 8, 1, p.hairDark);
    },
    back(g, p, dy) {
      px(g, 4, dy, 2, 1, p.hairC);
      px(g, 7, dy, 2, 1, p.hairC);
      px(g, 10, dy, 2, 1, p.hairC);
      headBlock(g, 1 + dy, 7, p.hairC);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      px(g, 4, 0, 2, 1, p.hairC);
      px(g, 7, 0, 2, 1, p.hairC);
      px(g, 10, 0, 2, 1, p.hairC);
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

/** Đôi chân + giày. `step` 0 đứng yên, 1 và 2 là hai nhịp bước. */
function legs(g, p, step) {
  const off = step === 1 ? 1 : step === 2 ? -1 : 0;
  px(g, 5, 16, 2, 3, p.pants);
  px(g, 9, 16, 2, 3, p.pants);
  // Bước đi: một bàn chân đưa ra trước, bàn kia lùi lại. Chỉ xê dịch giày chứ không xê dịch
  // cả ống chân - dịch cả chân ở kích thước này thì nhân vật trông như bị gãy.
  px(g, 5 - Math.max(0, off), 19, 2, 1, p.shoes);
  px(g, 9 + Math.max(0, -off), 19, 2, 1, p.shoes);
}

function torso(g, p) {
  px(g, 4, 10, 8, 6, p.shirt);
  px(g, 4, 10, 8, 1, p.shirtDark);            // cổ áo
  outfitFront(g, p, 10);
  px(g, 3, 11, 1, 4, p.shirt);                // hai tay
  px(g, 12, 11, 1, 4, p.shirt);
  px(g, 3, 15, 1, 1, p.skin);                 // bàn tay
  px(g, 12, 15, 1, 1, p.skin);
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
  px(g, 4, 10, 8, 6, p.shirt);
  px(g, 4, 10, 8, 1, p.shirtDark);
  outfitFront(g, p, 10);
  // Chỉ thấy một tay, và nó đánh theo nhịp chân
  const ax = step === 1 ? 10 : step === 2 ? 4 : 7;
  px(g, ax, 11, 2, 4, p.shirtDark);
  px(g, ax, 15, 2, 1, p.skin);
  legs(g, p, step);
}

/* Ngồi: nhìn từ sau lưng vì bàn quay mặt vào tường, người ngồi quay lưng ra phía người xem.
 * Đây là góc duy nhất cho thấy được cả người lẫn màn hình cùng lúc. Chân khuất sau ghế nên
 * không vẽ - vẽ chân thò ra dưới ghế trông như đang lơ lửng. */
function drawSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0;      // gục xuống thì cả đầu lẫn vai thấp hơn
  headBlock(g, 1 + drop, 9, p.skin);
  HAIR[p.hair].back(g, p, drop);

  // Bắt đầu ở y=10, ĐÚNG hàng kết thúc của khối đầu. Để lệch một hàng là hở một vệt sàn
  // ngang cổ, và ở bậc phóng 5 nhìn như cái đầu rời ra khỏi thân.
  px(g, 3, 10 + drop, 10, 7, p.shirt);        // lưng rộng hơn vì đang ngồi hơi khom
  px(g, 3, 10 + drop, 10, 1, p.shirtDark);

  if (arms === 'sleep') {
    px(g, 2, 12 + drop, 2, 3, p.shirtDark);   // hai tay buông thõng
    px(g, 12, 12 + drop, 2, 3, p.shirtDark);
    px(g, 2, 15 + drop, 2, 1, p.skin);
    px(g, 12, 15 + drop, 2, 1, p.skin);
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
    px(g, 3, y0 - 2, 2, 3, p.body);       // hai tai nhọn dựng
    px(g, 11, y0 - 2, 2, 3, p.body);
    px(g, 4, y0 - 1, 1, 1, p.nose);       // lòng tai
    px(g, 11, y0 - 1, 1, 1, p.nose);
  } else if (k === 'long') {
    px(g, 4, y0 - 5, 2, 6, p.body);       // tai thỏ dài
    px(g, 10, y0 - 5, 2, 6, p.body);
    px(g, 4, y0 - 4, 1, 3, p.nose);
    px(g, 11, y0 - 4, 1, 3, p.nose);
  } else if (k === 'flop') {
    px(g, 2, y0, 2, 4, p.bodyDark);       // tai cụp rủ hai bên
    px(g, 12, y0, 2, 4, p.bodyDark);
  } else if (k === 'horn') {
    px(g, 2, y0, 2, 2, p.bodyDark);       // tai bò
    px(g, 12, y0, 2, 2, p.bodyDark);
    px(g, 4, y0 - 2, 2, 2, '#e8d9a8');    // hai cái sừng
    px(g, 10, y0 - 2, 2, 2, '#e8d9a8');
  } else if (k === 'comb') {
    px(g, 6, y0 - 3, 4, 2, '#e05050');    // mào gà
    px(g, 7, y0 - 4, 2, 1, '#e05050');
  } else if (k === 'frog') {
    px(g, 3, y0 - 2, 3, 3, p.body);       // hai mắt lồi
    px(g, 10, y0 - 2, 3, 3, p.body);
    px(g, 4, y0 - 1, 1, 1, INK);
    px(g, 11, y0 - 1, 1, 1, INK);
  }
}

function petFaceFront(g, p) {
  px(g, 5, 7, 2, 2, INK);                 // mắt
  px(g, 9, 7, 2, 2, INK);
  px(g, 5, 7, 1, 1, EYE_LIGHT);
  px(g, 9, 7, 1, 1, EYE_LIGHT);
  if (p.beak) {
    px(g, 7, 9, 2, 2, p.nose);            // mỏ
  } else {
    px(g, 6, 9, 4, 2, p.belly);           // mõm
    px(g, 7, 9, 2, 1, p.nose);            // mũi
  }
  px(g, 3, 9, 1, 1, BLUSH);
  px(g, 12, 9, 1, 1, BLUSH);
}

/** Thân + bốn chân. `step` cho nhịp đi. */
function petBody(g, p, step, y0) {
  px(g, 4, y0, 8, 5, p.body);
  px(g, 5, y0 + 1, 6, 3, p.belly);        // bụng sáng hơn
  if (p.spots) {                          // đốm bò
    px(g, 4, y0, 3, 2, p.bodyDark);
    px(g, 10, y0 + 2, 2, 2, p.bodyDark);
  }
  if (p.wool) {                           // lông cừu lởm chởm
    px(g, 3, y0, 1, 4, p.body);
    px(g, 12, y0, 1, 4, p.body);
  }
  const off = step === 1 ? 1 : step === 2 ? -1 : 0;
  px(g, 4 - Math.max(0, off), y0 + 5, 2, 2, p.bodyDark);
  px(g, 10 + Math.max(0, -off), y0 + 5, 2, 2, p.bodyDark);
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
  px(g, 9, 7, 2, 2, INK);                 // một mắt
  px(g, 9, 7, 1, 1, EYE_LIGHT);
  if (p.beak) px(g, 13, 8, 2, 2, p.nose);
  else { px(g, 12, 8, 2, 2, p.belly); px(g, 13, 9, 1, 1, p.nose); }
  px(g, 3, 11, 10, 5, p.body);
  px(g, 4, 12, 8, 3, p.belly);
  const off = step === 1 ? 1 : step === 2 ? -1 : 0;
  px(g, 4 - Math.max(0, off), 16, 2, 3, p.bodyDark);
  px(g, 10 + Math.max(0, -off), 16, 2, 3, p.bodyDark);
  petTail(g, p, 1, 12);
}

/* Ngồi ở bàn: nhìn từ sau lưng, chỉ thấy tai + đầu + lưng nhô lên khỏi mặt bàn. */
function petSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0;
  petEars(g, p, 3 + drop);
  headBlock(g, 3 + drop, 8, p.body);
  px(g, 5, 9 + drop, 6, 2, p.bodyDark);
  px(g, 3, 11 + drop, 10, 6, p.body);     // lưng
  px(g, 4, 12 + drop, 8, 4, p.belly);
  if (arms === 'sleep' || arms === 'rest') {
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
  for (let i = 0; i < h; i++) {
    const y = baseY - h + i;
    const shrink = i === 0 ? 4 : i === 1 ? 2 : i === 2 ? 1 : 0;
    const ww = w - shrink * 2;
    px(g, cx - ww / 2, y, ww, 1, y >= baseY - 2 ? p.bodyDark : p.body);
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
  px(g, 5, eyeY, 2, 3, INK);
  px(g, 9, eyeY, 2, 3, INK);
  px(g, 5, eyeY, 1, 1, EYE_LIGHT);
  px(g, 9, eyeY, 1, 1, EYE_LIGHT);
  px(g, 7, eyeY + 3, 2, 1, INK);               // miệng
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
  const eyeY = 19 - s.h + 3;
  px(g, 9, eyeY, 2, 3, INK);
  px(g, 9, eyeY, 1, 1, EYE_LIGHT);
}

/* Ngồi ở bàn: nhô lên khỏi mặt bàn, quay lưng. Slime không có tay nên "gõ phím" diễn bằng
 * cách rung nhẹ sang hai bên - vẫn đọc ra là đang làm việc. */
function slimeSit(g, p, arms) {
  const drop = arms === 'sleep' ? 3 : 0;
  const shift = arms === 'typeA' ? -1 : arms === 'typeB' ? 1 : 0;
  slimeDome(g, p, 8 + shift, 19, 13, 12 - drop);
  slimeHat(g, p, 19 - (12 - drop));
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
  px(g, 5, 6 + dy, 6, 1, p.tint);
  px(g, 4, 7 + dy, 8, 9, p.tint);
  px(g, 5, 16 + dy, 6, 1, p.tint);
  px(g, 5, 17 + dy, 2, 2, p.tint);            // hai chân
  px(g, 9, 17 + dy, 2, 2, p.tint);
}

function mascotFace(g, dy) {
  px(g, 5, 10 + dy, 2, 3, INK);
  px(g, 9, 10 + dy, 2, 3, INK);
  px(g, 5, 10 + dy, 1, 1, EYE_LIGHT);
  px(g, 9, 10 + dy, 1, 1, EYE_LIGHT);
  px(g, 3, 13 + dy, 1, 1, BLUSH);
  px(g, 12, 13 + dy, 1, 1, BLUSH);
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
  px(g, 9, 10 + dy, 2, 3, INK);
  px(g, 9, 10 + dy, 1, 1, EYE_LIGHT);
  px(g, 12, 13 + dy, 1, 1, BLUSH);
}

function mascotSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0;
  px(g, 5, 6 + drop, 6, 1, p.tint);
  px(g, 4, 7 + drop, 8, 10, p.tint);
  mascotHat(g, p, 6 + drop);
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
    default: return mascotDown(g, p, 0);
  }
}

/** Con mèo đi lang thang trong phòng. 10x8, hai nhịp chân. */
function drawCat(g, step) {
  const body = '#e0a94a', dark = '#b8842f', eye = '#2b2233';
  px(g, 1, 3, 7, 4, body);            // thân
  px(g, 7, 1, 3, 3, body);            // đầu
  px(g, 7, 1, 1, 1, dark);            // tai
  px(g, 9, 1, 1, 1, dark);
  px(g, 9, 2, 1, 1, eye);             // mắt
  px(g, 0, 1, 1, 3, dark);            // đuôi dựng
  px(g, 1, 7, 2, 1, step ? dark : body);
  px(g, 5, 7, 2, 1, step ? body : dark);
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
    px(g, 3, 1 + dy, 10, 4, p.hair); px(g, 3, dy, 2, 2, p.hair); px(g, 7, dy, 2, 2, p.hair); px(g, 11, dy, 2, 2, p.hair);
  } else {
    px(g, 3, 1 + dy, 10, 4, p.hair);
    if (t === 'long') { px(g, 2, 4 + dy, 2, 8, p.hair); px(g, 12, 4 + dy, 2, 8, p.hair); }
    if (t === 'sweep') px(g, 8, 4 + dy, 5, 2, p.hair);
  }
  voyageHat(g, p, view, dy);
}

function voyageFace(g, p, view, dy) {
  if (view === 'back') return;
  if (p.face === 'skull') { px(g, 4, 5 + dy, 3, 3, INK); px(g, 9, 5 + dy, 3, 3, INK); px(g, 6, 8 + dy, 4, 1, INK); return; }
  const ex = view === 'side' ? 9 : 4;
  px(g, ex, 5 + dy, 2, 2, INK); px(g, ex, 5 + dy, 1, 1, EYE_LIGHT);
  if (view !== 'side') { px(g, 10, 5 + dy, 2, 2, INK); px(g, 10, 5 + dy, 1, 1, EYE_LIGHT); }
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
  px(g, sitting ? 3 : 4, y, sitting ? 10 : 8, sitting ? 6 : 6, p.shirt);
  px(g, sitting ? 3 : 4, y, sitting ? 10 : 8, 1, p.shade);
  px(g, 7, y + 1, 2, 4, p.accent);
  if (sitting) return;
  const arm = view === 'side' ? (step === 1 ? 10 : step === 2 ? 4 : 7) : 3;
  px(g, arm, 11, view === 'side' ? 2 : 1, 4, p.shade); px(g, arm, 15, view === 'side' ? 2 : 1, 1, p.skin);
  if (view !== 'side') { px(g, 12, 11, 1, 4, p.shade); px(g, 12, 15, 1, 1, p.skin); }
  px(g, 5, 16, 2, 3, p.pants); px(g, 9, 16, 2, 3, p.pants);
  const off = step === 1 ? 1 : step === 2 ? -1 : 0;
  px(g, 5 - Math.max(0, off), 19, 2, 1, p.dark); px(g, 9 + Math.max(0, -off), 19, 2, 1, p.dark);
}

function voyageWalk(g, p, view, step) { voyageHead(g, p, view, 0); voyageBody(g, p, view, step, false); }

function voyageSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0;
  voyageHead(g, p, 'back', drop); voyageBody(g, p, 'back', 0, true);
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
  else if (p.hairType === 'spike') { px(g, 3, 1 + dy, 10, 4, p.hair); px(g, 3, dy, 2, 2, p.hair); px(g, 7, dy, 2, 2, p.hair); px(g, 11, dy, 2, 2, p.hair); }
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
  if (p.oneEye && view !== 'side') px(g, 3, 5 + dy, 5, 2, p.dark);
  else { px(g, ex, 6 + dy, 2, 2, INK); px(g, ex, 6 + dy, 1, 1, EYE_LIGHT); }
  if (view !== 'side') { px(g, 10, 6 + dy, 2, 2, INK); px(g, 10, 6 + dy, 1, 1, EYE_LIGHT); }
  if (p.mask) px(g, 4, 8 + dy, 8, 2, p.shade); else px(g, 7, 8 + dy, 2, 1, p.dark);
  if (p.marks) { px(g, 2, 7 + dy, 2, 1, p.accent); px(g, 12, 7 + dy, 2, 1, p.accent); }
}

function ninjaHead(g, p, view, dy) {
  headBlock(g, 1 + dy, 9, p.skin); ninjaHair(g, p, view, dy); ninjaBand(g, p, view, dy); ninjaFace(g, p, view, dy);
}

function ninjaBody(g, p, view, step, sitting) {
  const y = sitting ? 11 : 10;
  px(g, sitting ? 3 : 4, y, sitting ? 10 : 8, 6, p.shirt); px(g, sitting ? 3 : 4, y, sitting ? 10 : 8, 1, p.shade);
  if (p.cloak) { px(g, 5, y + 2, 3, 2, p.accent); px(g, 10, y + 4, 2, 2, p.accent); }
  else { px(g, 7, y + 1, 2, 4, p.accent); }
  if (sitting) return;
  const ax = view === 'side' ? (step === 1 ? 10 : step === 2 ? 4 : 7) : 3;
  px(g, ax, 11, view === 'side' ? 2 : 1, 4, p.shade); px(g, ax, 15, view === 'side' ? 2 : 1, 1, p.skin);
  if (view !== 'side') { px(g, 12, 11, 1, 4, p.shade); px(g, 12, 15, 1, 1, p.skin); }
  px(g, 5, 16, 2, 3, p.pants); px(g, 9, 16, 2, 3, p.pants);
  const off = step === 1 ? 1 : step === 2 ? -1 : 0; px(g, 5 - Math.max(0, off), 19, 2, 1, p.dark); px(g, 9 + Math.max(0, -off), 19, 2, 1, p.dark);
}

function ninjaWalk(g, p, view, step) { ninjaHead(g, p, view, 0); ninjaBody(g, p, view, step, false); }
function ninjaSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0; ninjaHead(g, p, 'back', drop); ninjaBody(g, p, 'back', 0, true);
  if (arms === 'typeA' || arms === 'typeB') { const up = arms === 'typeA'; px(g,1,12,3,3,p.shade); px(g,12,12,3,3,p.shade); px(g,1,up?14:15,3,1,p.skin); px(g,12,up?15:14,3,1,p.skin); }
  else { px(g,2,13+drop,2,3,p.shade); px(g,12,13+drop,2,3,p.shade); }
}

function drawNinjaFrame(g, p, key) {
  switch (key) {
    case 'd0': return ninjaWalk(g,p,'front',0); case 'd1': return ninjaWalk(g,p,'front',1); case 'd2': return ninjaWalk(g,p,'front',2);
    case 'u0': return ninjaWalk(g,p,'back',0); case 'u1': return ninjaWalk(g,p,'back',1); case 'u2': return ninjaWalk(g,p,'back',2);
    case 's0': return ninjaWalk(g,p,'side',0); case 's1': return ninjaWalk(g,p,'side',1); case 's2': return ninjaWalk(g,p,'side',2);
    case 'k0': return ninjaSit(g,p,'rest'); case 'k1': return ninjaSit(g,p,'typeA'); case 'k2': return ninjaSit(g,p,'typeB'); case 'k3': return ninjaSit(g,p,'sleep');
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
      px(g, 4, dy, 2, 1, p.hairC);
      px(g, 7, dy, 2, 1, p.hairC);
      px(g, 10, dy, 2, 1, p.hairC);
      headBlock(g, 1 + dy, 3, p.hairC);
      px(g, 4, 3 + dy, 8, 1, p.hairDark);
      px(g, 3, 4 + dy, 1, 3, p.hairC);
      px(g, 12, 4 + dy, 1, 3, p.hairC);
    },
    back(g, p, dy) {
      px(g, 4, dy, 2, 1, p.hairC);
      px(g, 7, dy, 2, 1, p.hairC);
      px(g, 10, dy, 2, 1, p.hairC);
      headBlock(g, 1 + dy, 7, p.hairC);
      px(g, 4, 8 + dy, 8, 1, p.hairDark);
    },
    side(g, p) {
      px(g, 4, 0, 2, 1, p.hairC);
      px(g, 8, 0, 2, 1, p.hairC);
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
  if (p.shorts) {
    px(g, 5, 18, 2, 1, p.skin);
    px(g, 9, 18, 2, 1, p.skin);
  }
  px(g, 5 - Math.max(0, off), 19, 2, 1, p.shoes);
  px(g, 9 + Math.max(0, -off), 19, 2, 1, p.shoes);
}

/** Thân người. `broad` nới ra 1 pixel mỗi bên - dấu hiệu duy nhất còn lại khi hai người
 *  cùng mặc áo đen và đang ngồi quay lưng. */
function crewTorso(g, p) {
  const b = p.broad ? 1 : 0;
  const x0 = 4 - b, w = 8 + b * 2;
  px(g, x0, 10, w, 6, p.shirt);
  px(g, x0, 10, w, 1, p.shirtDark);
  crewChest(g, p, x0, w, 10);
  px(g, x0 - 1, 11, 1, 4, p.shirt);
  px(g, x0 + w, 11, 1, 4, p.shirt);
  px(g, x0 - 1, 15, 1, 1, p.skin);
  px(g, x0 + w, 15, 1, 1, p.skin);
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
  px(g, 4 - b, 10, 8 + b * 2, 6, p.shirt);
  px(g, 4 - b, 10, 8 + b * 2, 1, p.shirtDark);
  const ax = step === 1 ? 10 : step === 2 ? 4 : 7;
  px(g, ax, 11, 2, 4, p.shirtDark);
  px(g, ax, 15, 2, 1, p.skin);
  crewLegs(g, p, step);
}

/* Ngồi quay lưng. Lưng thì không có hoạ tiết ngực, nên ở đây chỉ còn TÓC, MÀU ÁO và BỀ
 * NGANG làm dấu hiệu - riêng áo sơ mi kẻ sọc thì sọc chạy vòng ra sau lưng thật, giữ lại
 * được. */
function crewSit(g, p, arms) {
  const drop = arms === 'sleep' ? 2 : 0;
  const b = p.broad ? 1 : 0;
  const x0 = 3 - b, w = 10 + b * 2;
  headBlock(g, 1 + drop, 9, p.skin);
  CREW_HAIR[p.hair].back(g, p, drop);

  px(g, x0, 10 + drop, w, 7, p.shirt);
  px(g, x0, 10 + drop, w, 1, p.shirtDark);
  if (p.chest === 'stripes') {
    px(g, x0 + 2, 11 + drop, 1, 6, p.shirtDark);
    px(g, x0 + (w >> 1), 11 + drop, 1, 6, p.shirtDark);
    px(g, x0 + w - 3, 11 + drop, 1, 6, p.shirtDark);
  }
  if (p.chest === 'jacket') {                     // khoác trắng hở lưng áo đen bên trong
    px(g, x0 + (w >> 1) - 1, 10 + drop, 2, 7, p.inner);
  }

  if (arms === 'sleep') {
    px(g, x0 - 1, 12 + drop, 2, 3, p.shirtDark);
    px(g, x0 + w - 1, 12 + drop, 2, 3, p.shirtDark);
    px(g, x0 - 1, 15 + drop, 2, 1, p.skin);
    px(g, x0 + w - 1, 15 + drop, 2, 1, p.skin);
    return;
  }
  if (arms === 'rest') {
    px(g, x0 - 1, 12, 2, 4, p.shirtDark);
    px(g, x0 + w - 1, 12, 2, 4, p.shirtDark);
    px(g, x0 - 1, 16, 2, 1, p.skin);
    px(g, x0 + w - 1, 16, 2, 1, p.skin);
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
    default: return crewDown(g, p, 0);
  }
}

/* ============================================================ khung dùng chung */

/* Bảy bộ. Chọn một bộ thì CẢ PHÒNG theo bộ đó, và mỗi agent nhận một nhân vật khác nhau
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
];

/* `let` chứ không `const`: người dùng nhập thêm bộ từ ảnh của họ lúc đang chạy (xem
 * packimport.js), nên danh sách này thay đổi được. Bộ nhập vào chỉ nằm ở máy người dùng. */
let PACKS = BUILTIN_PACKS.slice();

/* Bảng phẳng mọi nhân vật của mọi bộ, theo đúng thứ tự hàng trong atlas. office.js chỉ giữ
 * một số nguyên `charIndex` trỏ vào đây, không cần biết bộ nào. */
let ALL_CHARS = [];

function rebuildCharTable() {
  ALL_CHARS = [];
  PACKS.forEach((pack) => {
    pack.start = ALL_CHARS.length;
    pack.chars.forEach((c) => ALL_CHARS.push({ pack, char: c }));
  });
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
  g.drawImage(c.canvas, dx, dy);
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

/* ------------------------------------------------------------- viền
 *
 * Sprite trong mọi bộ pixel art tử tế đều có viền tối 1 pixel quanh silhouette - đó là thứ
 * tách nhân vật khỏi nền và làm hình "chắc" hẳn lên. Vẽ tay từng nét viền thì mỗi lần chỉnh
 * một hình chữ nhật lại phải chỉnh viền theo, nên làm hậu kỳ: quét alpha, chỗ nào trong
 * suốt mà chạm vào chỗ đặc thì tô. Một lần lúc dựng atlas, không tốn gì lúc chạy.
 */
const OUTLINE = '#2b2233';

function outlineCell(g, ox, oy, w, h) {
  const img = g.getImageData(ox, oy, w, h);
  const a = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 128;
  const mark = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) mark.push([x, y]);
    }
  }
  g.fillStyle = OUTLINE;
  mark.forEach(([x, y]) => g.fillRect(ox + x, oy + y, 1, 1));
}

/** Atlas: mỗi nhân vật của mỗi bộ một hàng, mỗi khung hình một cột; con mèo ở hàng cuối. */
function buildSpriteAtlas() {
  const cols = FRAMES.length;
  const rows = ALL_CHARS.length;
  const cv = document.createElement('canvas');
  // Chừa 1 pixel quanh mỗi ô để viền không tràn sang ô bên cạnh - thiếu chỗ này thì nhân
  // vật nào cũng dính một vệt tối của hàng xóm.
  const cw = SPRITE_W + 2;
  const ch = SPRITE_H + 2;
  cv.width = cols * cw;
  cv.height = rows * ch + ch;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;

  ALL_CHARS.forEach((entry, r) => {
    FRAMES.forEach((key, c) => {
      g.save();
      g.translate(c * cw + 1, r * ch + 1);
      entry.pack.draw(g, entry.char, key);
      g.restore();
      // Bộ nhập từ ảnh đã có viền sẵn trong ảnh gốc; tô thêm là viền đôi, dày cộp.
      if (entry.pack.outline !== false) outlineCell(g, c * cw, r * ch, cw, ch);
    });
  });

  const catRow = rows * ch;
  for (let i = 0; i < 2; i++) {
    g.save();
    g.translate(i * cw + 1, catRow + 1);
    drawCat(g, i);
    g.restore();
    outlineCell(g, i * cw, catRow, cw, ch);
  }

  return {
    canvas: cv,
    cols,
    rows,
    /** Ô của một khung hình => tham số cho drawImage. Kèm luôn 1 pixel viền mỗi bên. */
    cell(charIndex, frameKey) {
      const c = FRAME_INDEX[frameKey] == null ? 0 : FRAME_INDEX[frameKey];
      const r = ((charIndex % rows) + rows) % rows;
      return [c * cw, r * ch, cw, ch];
    },
    catCell(step) {
      return [(step ? 1 : 0) * cw, catRow, CAT_W + 2, CAT_H + 2];
    },
  };
}

/** Vẽ một nhân vật ra canvas riêng, phóng `scale` lần - dùng cho ô xem mẫu ở bảng chọn.
 *  Vẽ thẳng chứ không cắt từ atlas: bảng chọn mở ra trước khi phòng kịp dựng atlas. */
function renderCharPreview(canvas, charIndex, scale) {
  const entry = ALL_CHARS[((charIndex % ALL_CHARS.length) + ALL_CHARS.length) % ALL_CHARS.length];
  const w = SPRITE_W + 2;
  const h = SPRITE_H + 2;
  canvas.width = w * scale;
  canvas.height = h * scale;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.clearRect(0, 0, w, h);
  g.save();
  g.translate(1, 1);
  entry.pack.draw(g, entry.char, 'd0');
  g.restore();
  if (entry.pack.outline !== false) outlineCell(g, 0, 0, w, h);
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
