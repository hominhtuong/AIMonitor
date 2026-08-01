/* Bối cảnh Nông trại: mỗi agent là một người làm ruộng trên thửa của mình.
 *
 * Khác Văn phòng ở chỗ nào - và vì sao khác:
 *
 * - **Vai diễn theo việc đang làm.** Ở Văn phòng ai cũng ngồi gõ phím, chỉ màu màn hình nói
 *   lên đang làm gì. Ở đây `Bash` thành tiều phu bổ củi, `Edit` thành nông dân dắt trâu đi
 *   cày, `Read` thành người cầm liềm đi gặt. Nghề đổi CHẬM (`ROLE_HOLD` ở office.js) chứ
 *   không đổi theo từng tool, nếu không cả cánh đồng co giật mỗi giây mấy lần.
 *
 * - **Không có gì vẽ SAU nhân vật.** Văn phòng có tựa ghế đè lên hông người ngồi, và chính nó
 *   bắt lối đi phải luồn qua khe cạnh bàn. Ở đây không có lớp đó, nên người đi thẳng từ bờ
 *   ruộng lên thửa của mình mà không sợ chui xuyên qua cái gì.
 *
 * - **Hình học DÙNG CHUNG với Văn phòng** (hai dãy, năm thửa, cùng toạ độ lối đi). Chủ ý: đó
 *   là bộ toạ độ đã chạy đúng qua nhiều đợt sửa lỗi đường đi, mượn lại thì bối cảnh mới không
 *   phải trả giá lần nữa cho những lỗi đã biết.
 *
 * - **`snap: true`.** Nhân vật vẽ bằng drawImage nên toạ độ lẻ vẫn mượt, còn đạo cụ (cái rìu,
 *   con trâu) vẽ bằng fillRect thì bị làm tròn - hai bên lệch nhau tới một pixel và cái rìu
 *   rung bần bật quanh bàn tay. Cùng lấy một gốc đã làm tròn thì chúng dính chặt vào nhau.
 */

const FARM_ROW_Y = [46, 104];         // mép trên hai dãy thửa - y hệt Văn phòng
const FARM_AISLE_Y = [78, 148];       // bờ ruộng ngang
const FARM_CORRIDOR_X = [1, 243];     // hai bờ dọc sát mép, không cắt qua thửa nào
const FARM_PLOT_X = [16, 64, 112, 160, 208];
const FARM_PLOT_W = 34;
const FARM_PLOT_H = 11;

/* Hai chỗ đứng làm việc trong CHÍNH thửa của mình, lệch nhau 10 pixel. Cả hai nằm gọn trong
 * thửa nên đi từ chỗ này sang chỗ kia là một bước thẳng, không bao giờ đụng thửa hàng xóm và
 * không cần đi vòng qua bờ. */
const FARM_SPOT_FIELD = 3;            // lệch so với mép trái thửa - chỗ cày, gặt, cuốc
const FARM_SPOT_WOOD = 13;            // chỗ bổ củi, ngay cạnh đống gỗ

const FARM_LANE = ROOM_H - 12;        // dải của gà và chó, sát mép dưới

/* Nghề nào đứng ở chỗ nào. Mọi nghề còn lại làm ở giữa thửa. */
const FARM_WOOD_ROLES = { run: 1 };

/* Bảng màu riêng, suy hết từ bảng màu chung nên tự đúng ở cả nền sáng lẫn nền tối. Tính một
 * lần rồi nhớ lại: `darken`/`lighten` gọi mỗi khung cho mỗi nét là phí, mà màu chỉ đổi khi
 * người dùng bấm sáng/tối. */
let FARM_PAL = null;
let FARM_PAL_KEY = '';

/** Nền sáng hay nền tối? Suy từ độ sáng của màu SÀN trong bảng màu chung, chứ không đọc
 *  `data-theme`: sàn là màu duy nhất chắc chắn đổi giữa hai theme, mà đọc nó thì hàm này vẫn
 *  thuần tuý và ô xem trước cũng dùng lại được.
 *
 *  Cần con số này vì cỏ và đất của Nông trại tự suy ra từ `--of-plant` và `--of-desk`, mà hai
 *  biến đó gần như không đổi giữa hai theme. Không có nhánh này thì bấm sang nền sáng xong cả
 *  cánh đồng vẫn tối om y hệt, trong khi mọi tab khác đã sáng lên. */
function farmLight(p) {
  const c = toRgb(p.floor || '#243247');
  return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255 > 0.5;
}

function fpal(p) {
  const key = p.plant + '|' + p.desk + '|' + p.floor;
  if (FARM_PAL && FARM_PAL_KEY === key) return FARM_PAL;
  FARM_PAL_KEY = key;
  const day = farmLight(p);
  // Ban ngày thì cánh đồng phải sáng lên thật, không chỉ nhích một chút: chênh 0.30 giữa hai
  // theme mới đủ để nhìn ra là cùng một cảnh dưới hai thứ ánh sáng khác nhau.
  const gDark = day ? 0.12 : 0.42;
  FARM_PAL = {
    day,
    grass: darken(p.plant, gDark),
    grass2: darken(p.plant, gDark + 0.1),
    // Đất phải TỐI và bớt đỏ hơn gỗ hẳn một bậc. Lấy sát màu gỗ thì cái luống đọc ra là một
    // tấm ván nằm trên cỏ, nhất là khi có gờ chạy ngang.
    soil: darken(p.desk, day ? 0.24 : 0.46),
    soilDark: darken(p.desk, day ? 0.42 : 0.62),
    furrow: darken(p.desk, day ? 0.5 : 0.7),
    crop: p.plant,
    cropDark: darken(p.plant, 0.25),
    ripe: lighten('#c9a227', 0.05),
    ripeDark: darken('#c9a227', 0.25),
    wood: p.desk,
    woodDark: p.deskDark,
    water: p.sky,
    waterDark: darken(p.sky, 0.3),
    tree: darken(p.plant, 0.3),
    treeDark: darken(p.plant, 0.55),
    fence: lighten(p.desk, 0.12),
    fenceDark: darken(p.desk, 0.3),
    ox: '#4a4048',
    oxDark: '#332c38',
    metal: p.metal,
    hen: '#f2ede4',
    henDark: '#cdc3b4',
    comb: '#d9534f',
    beak: '#e8a33d',
    dog: '#b98149',
    dogDark: '#8a5c33',
  };
  return FARM_PAL;
}

/* ------------------------------------------------------------- bố cục */

function farmStations() {
  const out = [];
  FARM_ROW_Y.forEach((y, row) => {
    FARM_PLOT_X.forEach((x) => {
      out.push({
        id: 'f' + row + '.' + x,
        x, y, row,
        // Chỗ đứng mặc định: giữa thửa. `seatOf()` đổi sang chỗ bổ củi khi nghề đòi vậy.
        seatX: x + FARM_SPOT_FIELD,
        seatY: y + 5,
        helpers: [
          { x: x - 15, y: y + 16 },
          { x: x + FARM_PLOT_W + 1, y: y + 16 },
        ],
        box: { x: x - 2, y: y - 12, w: FARM_PLOT_W + 4, h: FARM_PLOT_H + 36 },
        labelX: x + FARM_PLOT_W / 2,
        // Ngay trên đầu người (người đứng ở y + 5), không phải trên luống: giữa luống và đầu
        // là khoảng trống, bong bóng đặt ở đó thì trôi lơ lửng không dính vào ai.
        bubbleY: y + 4,
        nameY: y + FARM_PLOT_H + 26,
        // Tiến độ cây trồng 0..1. Đây là bản nông trại của cái màn hình sáng ở Văn phòng:
        // liếc qua cả cánh đồng là biết ai đang làm lâu, ai vừa vào.
        grow: 0,
      });
    });
  });
  return out;
}

/** Chỗ đứng ứng với nghề đang làm. Chỉ có hai chỗ, cả hai đều nằm trong thửa của mình. */
function farmSeatOf(e, st) {
  const wood = FARM_WOOD_ROLES[e.role || ''] ? FARM_SPOT_WOOD : FARM_SPOT_FIELD;
  return { x: st.x + wood, y: st.y + 5 };
}

/** Đường đi. Giống Văn phòng trừ hai điểm:
 *
 *  1. Không có tựa ghế vẽ đè lên người, nên bỏ được cú luồn qua khe cạnh bàn - đi thẳng từ bờ
 *     ruộng lên thửa là đúng động tác của người ra đồng.
 *  2. Đi trong CHÍNH thửa của mình (đổi nghề nên đổi chỗ đứng) thì bước thẳng một nhịp, không
 *     xuống bờ rồi vòng lên lại - nhìn như người quên đồ phải chạy về lấy.
 */
function farmRoute(e, tx, ty, seat) {
  // Đang đứng trong thửa và đích cũng ở trong thửa đó: bước ngang, hết.
  if (seat && e.station === seat && e.mode === 'sit'
      && e.x >= seat.x - 2 && e.x <= seat.x + FARM_PLOT_W) {
    e.path = [{ x: tx, y: ty }];
    return;
  }
  const path = [];
  const curAisle = e.y < FARM_ROW_Y[1] ? FARM_AISLE_Y[0] : FARM_AISLE_Y[1];
  const dstAisle = ty < FARM_ROW_Y[1] ? FARM_AISLE_Y[0] : FARM_AISLE_Y[1];

  if (e.mode === 'sit') path.push({ x: e.x, y: curAisle });   // xuống bờ ruộng trước
  if (curAisle !== dstAisle) {
    // Đổi dãy thì vòng qua bờ dọc sát mép, đi thẳng là giẫm qua dãy thửa ở giữa
    const cx = Math.abs(e.x - FARM_CORRIDOR_X[0]) < Math.abs(e.x - FARM_CORRIDOR_X[1])
      ? FARM_CORRIDOR_X[0] : FARM_CORRIDOR_X[1];
    path.push({ x: cx, y: curAisle });
    path.push({ x: cx, y: dstAisle });
  }
  path.push({ x: tx, y: dstAisle });
  path.push({ x: tx, y: ty });
  e.path = path;
}

/** Hành vi. Ngoài phần chung (rảnh thì đi vòng vòng, có việc thì về thửa) còn thêm đúng một
 *  việc: đổi nghề thì bước sang chỗ làm việc tương ứng NGAY TRONG thửa của mình. */
function farmBehave(e, dt, d) {
  if (d.state === 'wander') {
    if (e.goal === 'station' || e.goal === 'spot') {
      sendWandering(e);
    } else if (e.mode === 'idle' && Math.random() < dt * 0.35) {
      const w = CS().wanderTarget(e);
      e.mode = 'walk';
      e.path = [{ x: w.x, y: w.y }];
    }
    return;
  }
  if (!e.station) return;
  if (e.goal !== 'station') { sendToStation(e, e.station); return; }
  // Đã ở thửa của mình rồi: chỗ đứng có còn khớp với nghề đang làm không?
  if (e.mode !== 'sit') return;
  const want = farmSeatOf(e, e.station);
  if (Math.abs(e.x - want.x) > 0.5) sendToStation(e, e.station);
}

/** Cây lớn dần theo thời gian NGƯỜI THẬT SỰ ĐANG LÀM trên thửa đó. Đứng không thì cây đứng
 *  yên - nếu cứ để nó lớn theo đồng hồ thì cả cánh đồng chín rộ dù chẳng ai làm gì, và cái
 *  tín hiệu "ai đang bận" mất sạch ý nghĩa. */
function farmStep(dt) {
  const busyAt = new Map();
  OF.ents.forEach((e) => {
    if (e.kind !== 'agent' || !e.station || e.mode !== 'sit') return;
    if (currentAction(e) === 'rest') return;
    busyAt.set(e.station, true);
  });
  OF.stations.forEach((st) => {
    if (busyAt.has(st)) st.grow = Math.min(1, st.grow + dt / 45);
  });
}

/** Giai đoạn cây, dùng cho cả lúc vẽ lẫn lúc dựng chữ ký. Bốn bậc là vừa đủ để nhìn ra tiến
 *  độ mà không làm chữ ký đổi liên tục - đưa `grow` thô vào chữ ký là vẽ lại 60 lần mỗi giây
 *  cho một cây lúa cao thêm 1/45 pixel. */
function farmStage(st) {
  return Math.min(3, Math.floor(st.grow * 4));
}

/* ------------------------------------------------------------- vẽ nền */

/** Đám cỏ rải rác. Bản đầu vẽ vạch ngang chạy suốt chiều rộng cứ 9 pixel một, và cả cánh
 *  đồng trông như sàn kẻ sọc chứ không như cỏ. Từng đám ngắn, so le, mật độ thưa mới ra mặt
 *  cỏ. Vị trí suy từ toạ độ chứ không random - nền nướng lại mỗi lần đổi theme. */
function farmTufts(g, f) {
  for (let y = WALL_H + 8; y < ROOM_H; y += 6) {
    for (let x = (y * 7) % 11; x < ROOM_W; x += 13) {
      const w = 2 + ((x + y) % 3);
      px2(g, x, y + ((x + y) % 3), w, 1, f.grass2);
    }
  }
}

function farmHorizon(g, p, f, treeColor) {
  px2(g, 0, 0, ROOM_W, WALL_H, p.sky);
  // Dãy đồi mờ phía xa: hai lớp cao thấp so le cho có chiều sâu
  for (let x = 0; x < ROOM_W; x += 4) {
    const h = 6 + ((Math.sin(x * 0.11) + 1) * 3 | 0);
    px2(g, x, WALL_H - 6 - h, 4, h + 6, f.treeDark);
  }
  for (let x = -2; x < ROOM_W; x += 7) {
    const h = 4 + ((x * 5) % 5);
    px2(g, x + 2, WALL_H - 4 - h, 3, h, treeColor || f.tree);
  }
  px2(g, 0, WALL_H - 4, ROOM_W, 4, f.grass2);
}

/** Hàng rào gỗ chạy ngang ngay dưới đường chân trời. Cột dày, hai thanh ngang mỏng - ba nét
 *  là đủ để đọc ra "hàng rào", vẽ chi tiết hơn ở cỡ này chỉ thành một vệt lấm tấm. */
function farmFence(g, f, y) {
  px2(g, 0, y + 1, ROOM_W, 1, f.fence);
  px2(g, 0, y + 4, ROOM_W, 1, f.fence);
  for (let x = 3; x < ROOM_W; x += 16) {
    px2(g, x, y, 2, 7, f.fenceDark);
    px2(g, x, y, 1, 7, f.fence);
  }
}

/** Luống đất của một thửa - phần KHÔNG đổi, nướng thẳng vào nền tĩnh. Cây trồng thì đổi theo
 *  tiến độ nên vẽ riêng ở `drawStation`.
 *
 *  Gờ chạy NGANG, không phải vạch dọc. Bản đầu vẽ mấy vạch dọc đều tăm tắp và cả năm thửa
 *  trông hệt năm cái thùng gỗ xếp trên cỏ - vạch dọc trên một khối chữ nhật là nan thùng, còn
 *  gờ ngang sáng-tối xen kẽ mới ra luống đất đã cày. Hai mép trái phải vát vào một pixel để
 *  luống không phải là hình chữ nhật cứng đơ. */
function farmBed(g, f, st) {
  const w = FARM_PLOT_W;
  px2(g, st.x + 1, st.y, w - 2, 1, f.soilDark);
  px2(g, st.x, st.y + 1, w, FARM_PLOT_H - 2, f.soil);
  px2(g, st.x + 1, st.y + FARM_PLOT_H - 1, w - 2, 1, f.soilDark);
  // Gờ cày, vẽ thành từng đoạn ĐỨT chứ không phải vạch chạy suốt: vạch liền từ mép này sang
  // mép kia là thớ ván, đoạn đứt so le mới ra rãnh đất.
  for (let i = 1; i < FARM_PLOT_H - 1; i += 3) {
    for (let x = 1 + (i % 2) * 3; x < w - 2; x += 7) {
      const seg = Math.min(5, w - 2 - x);
      px2(g, st.x + x, st.y + i, seg, 1, lighten(f.soil, 0.09));
      px2(g, st.x + x, st.y + i + 1, seg, 1, f.furrow);
    }
  }
  // Vài cục đất lổn nhổn cho khỏi phẳng lì. Vị trí suy từ toạ độ thửa chứ không random: nền
  // được nướng lại mỗi lần đổi theme, random thì cả cánh đồng xáo lại hình mỗi lần bấm.
  for (let i = 3; i < w - 4; i += 7) {
    px2(g, st.x + i + ((st.x + i) % 3), st.y + 2 + ((st.x + i) % 4), 1, 1, f.soilDark);
  }
}

/** Đống củi cạnh thửa - vừa là đồ trang trí, vừa là thứ nói cho người xem biết ông tiều phu
 *  đang bổ củi ở đâu. */
function farmWoodpile(g, f, st) {
  const x = st.x + 26;
  const y = st.y + 1;
  // Ba đầu khúc gỗ xếp hình tháp, mỗi đầu là một ô 3x3 có lõi sáng - nhìn từ đầu khúc thì
  // thấy mặt cắt, đó là thứ nói "đống củi" chứ không phải "cái hộp". Bản đầu vẽ một khối chữ
  // nhật có hai chấm, và nó lẫn hẳn vào cái luống đất ngay cạnh.
  [[0, 6], [4, 6], [2, 3]].forEach(([dx, dy]) => {
    px2(g, x + dx, y + dy, 4, 3, f.woodDark);
    px2(g, x + dx + 1, y + dy + 1, 2, 1, lighten(f.wood, 0.15));
  });
}

const FARM_ROOMS = [
  {
    /* Ruộng lúa nước: mương dẫn nước chạy dọc hai bên, sàn xanh mạ. */
    id: 'paddy',
    draw(g, p) {
      const f = fpal(p);
      px2(g, 0, WALL_H, ROOM_W, ROOM_H - WALL_H, f.grass);
      farmTufts(g, f);
      farmHorizon(g, p, f);
      farmFence(g, f, WALL_H - 1);
      // Mương nước NGANG, chạy ngay dưới hàng rào. Bản đầu là hai mương DỌC sát hai mép, mà
      // hai mép đó đúng là lối đi dọc của nhân vật - người đi qua trông như đang lội trên mặt
      // nước, còn cái mương thì đọc ra là hai cây cột xanh dựng đứng.
      px2(g, 0, WALL_H + 1, ROOM_W, 5, f.waterDark);
      px2(g, 0, WALL_H + 2, ROOM_W, 3, f.water);
      for (let x = 3; x < ROOM_W; x += 17) px2(g, x, WALL_H + 2, 2, 1, lighten(f.water, 0.3));
    },
  },
  {
    /* Vườn rau: đất nâu, luống ngắn, mấy khóm rau rải rác ngoài thửa. */
    id: 'veggie',
    draw(g, p) {
      const f = fpal(p);
      px2(g, 0, WALL_H, ROOM_W, ROOM_H - WALL_H, darken(f.soil, 0.18));
      for (let y = WALL_H + 3; y < ROOM_H; y += 7) {
        for (let x = ((y % 2) * 6); x < ROOM_W; x += 12) px2(g, x, y, 6, 1, f.soilDark);
      }
      farmHorizon(g, p, f);
      farmFence(g, f, WALL_H - 1);
      for (let x = 6; x < ROOM_W; x += 31) {
        px2(g, x, ROOM_H - 9, 5, 3, f.crop);
        px2(g, x + 1, ROOM_H - 11, 3, 2, f.cropDark);
      }
    },
  },
  {
    /* Vườn cây ăn quả: cỏ dày, hàng cây có tán tròn dọc mép trên. */
    id: 'orchard',
    draw(g, p) {
      const f = fpal(p);
      px2(g, 0, WALL_H, ROOM_W, ROOM_H - WALL_H, f.grass);
      farmTufts(g, f);
      farmHorizon(g, p, f, f.tree);
      // Bốn cây ăn quả: thân, tán, mấy quả đỏ. Đặt ở khoảng trống giữa hai dãy thửa.
      [30, 96, 162, 228].forEach((x, i) => {
        const y = WALL_H + 2;
        px2(g, x + 4, y + 8, 2, 6, f.woodDark);
        px2(g, x, y + 1, 10, 8, f.tree);
        px2(g, x + 1, y, 8, 2, darken(f.tree, 0.15));
        px2(g, x + 2, y + 3, 1, 1, '#d9534f');
        px2(g, x + 7, y + 5, 1, 1, '#d9534f');
        if (i % 2) px2(g, x + 4, y + 6, 1, 1, '#d9534f');
      });
    },
  },
  {
    /* Vụ đông: sương giá, cỏ nhạt màu, cây trơ cành. */
    id: 'winter',
    draw(g, p) {
      const f = fpal(p);
      const pale = lighten(f.grass, 0.34);
      px2(g, 0, WALL_H, ROOM_W, ROOM_H - WALL_H, pale);
      for (let y = WALL_H + 4; y < ROOM_H; y += 8) {
        for (let x = ((y % 2) * 7); x < ROOM_W; x += 14) px2(g, x, y, 5, 1, lighten(pale, 0.3));
      }
      px2(g, 0, 0, ROOM_W, WALL_H, lighten(p.sky, 0.22));
      for (let x = 0; x < ROOM_W; x += 4) {
        const h = 5 + ((Math.sin(x * 0.11) + 1) * 3 | 0);
        px2(g, x, WALL_H - 5 - h, 4, h + 5, lighten(f.treeDark, 0.28));
      }
      // Cây trơ cành: một thân, hai nhánh chìa ra
      for (let x = 12; x < ROOM_W; x += 37) {
        px2(g, x, WALL_H - 12, 1, 12, f.woodDark);
        px2(g, x - 2, WALL_H - 10, 2, 1, f.woodDark);
        px2(g, x + 1, WALL_H - 12, 2, 1, f.woodDark);
      }
      px2(g, 0, WALL_H - 3, ROOM_W, 3, lighten(pale, 0.12));
      farmFence(g, f, WALL_H - 1);
    },
  },
];

/** Cây trên một thửa, vẽ theo tiến độ. Vẽ ở NỬA TRÊN của luống thôi: nửa dưới là chỗ người
 *  đứng, mà người vẽ sau nên sẽ che mất - trồng kín luống chỉ tốn nét cho phần không ai thấy. */
function farmCrop(g, f, st) {
  const stage = farmStage(st);
  if (!stage) return;
  const rows = [st.y + 2, st.y + 5];
  const tall = stage >= 2;
  const ripe = stage >= 3;
  const head = ripe ? f.ripe : f.crop;
  const stem = ripe ? f.ripeDark : f.cropDark;
  rows.forEach((y, ri) => {
    for (let i = 2; i < FARM_PLOT_W - 2; i += 4) {
      const x = st.x + i + (ri % 2);
      if (tall) {
        px2(g, x, y - 2, 1, 3, stem);
        px2(g, x, y - 3, 2, 2, head);
      } else {
        px2(g, x, y, 1, 2, stem);
        px2(g, x, y - 1, 1, 1, head);
      }
    }
  });
}

/* ------------------------------------------------------------- đạo cụ
 *
 * Mọi đạo cụ vẽ từ MỘT gốc `info.x` đã làm tròn (scene khai `snap: true`), nên chúng dính
 * chặt vào bàn tay thay vì rung quanh nó. Toạ độ dưới đây tính theo mép trái sprite 16x20:
 * đầu ở hàng 0-9, thân 10-15, chân 16-19.
 */

/** Nhịp vung tay, dùng chung cho rìu, cuốc và liềm. Trả 0 hoặc 1 khớp ĐÚNG với khung hình mà
 *  `farmFrame` đang trả về - lệch nhịp thì cái rìu bổ xuống trong khi người vừa nhấc tay lên. */
function farmSwing(e) {
  return Math.floor(e.anim * 6) % 2;
}

function farmAxe(g, f, e, x, y) {
  const up = farmSwing(e);
  const hx = x + 13;
  if (up) {
    px2(g, hx, y + 4, 1, 7, f.wood);          // cán chống lên trời
    px2(g, hx - 1, y + 2, 4, 3, f.metal);     // lưỡi rìu
    px2(g, hx - 1, y + 2, 4, 1, lighten(f.metal, 0.3));
  } else {
    px2(g, hx - 1, y + 11, 5, 1, f.wood);     // cán nằm ngang, đã bổ xuống
    px2(g, hx + 4, y + 10, 3, 3, f.metal);
    px2(g, hx + 4, y + 10, 3, 1, lighten(f.metal, 0.3));
  }
}

function farmHoe(g, f, e, x, y) {
  const up = farmSwing(e);
  const hx = x + 13;
  px2(g, hx, y + (up ? 5 : 8), 1, 7, f.wood);
  px2(g, hx - 1, y + (up ? 4 : 15), 4, 2, f.metal);
}

function farmSickle(g, f, e, x, y) {
  const up = farmSwing(e);
  const hx = x + 13 + up;
  px2(g, hx, y + 11, 3, 1, f.wood);
  px2(g, hx + 3, y + 9, 1, 3, f.metal);
  px2(g, hx + 2, y + 8, 2, 1, f.metal);
  // Bó lúa đã gặt, kẹp bên hông
  px2(g, x + 1, y + 12, 3, 4, f.ripe);
  px2(g, x + 1, y + 13, 3, 1, f.ripeDark);
}

/** Đôi thùng nước gánh trên vai. Hai thùng phải CÂN nhau: lệch một bên thì nhìn như người
 *  vác một thùng và đang đổ, chứ không phải gánh nước. */
function farmBuckets(g, f, e, x, y) {
  const sway = Math.floor(e.anim * 4) % 2;
  px2(g, x - 1, y + 9, 18, 1, f.wood);                 // đòn gánh
  [-2, 14].forEach((dx) => {
    px2(g, x + dx, y + 10 + sway, 4, 4, f.metal);
    px2(g, x + dx, y + 10 + sway, 4, 1, f.water);
  });
}

function farmScroll(g, f, e, x, y) {
  px2(g, x + 3, y + 10, 10, 6, '#e8e0cc');
  px2(g, x + 3, y + 10, 10, 1, f.woodDark);
  px2(g, x + 3, y + 15, 10, 1, f.woodDark);
  for (let i = 0; i < 3; i++) px2(g, x + 5, y + 12 + i, 6 - i * 2, 1, f.soilDark);
}

function farmCrate(g, f, e, x, y) {
  px2(g, x + 3, y + 9, 10, 7, f.wood);
  px2(g, x + 3, y + 9, 10, 1, lighten(f.wood, 0.2));
  px2(g, x + 3, y + 12, 10, 1, f.woodDark);
  px2(g, x + 7, y + 9, 2, 7, f.woodDark);
}

/** Nón lá - đội lên đầu lúc nghỉ. Vẽ hình chóp bằng ba hàng thu dần chứ không phải một hình
 *  thang đặc: ba hàng thì ra cái chóp, một khối đặc thì ra cái mũ bảo hiểm. */
function farmHat(g, f, x, y) {
  px2(g, x + 2, y + 3, 12, 1, f.ripe);
  px2(g, x + 4, y + 1, 8, 2, f.ripe);
  px2(g, x + 6, y, 4, 1, f.ripeDark);
  px2(g, x + 2, y + 4, 12, 1, f.ripeDark);
}

/** Con trâu kéo cày. Đứng BÊN PHẢI người, trong lòng thửa, nên không bao giờ giẫm sang thửa
 *  hàng xóm - thửa rộng 34 pixel, người chiếm 3..19, con trâu 20..33.
 *
 *  Chân đi theo đúng nhịp tay người cày: hai thứ lệch nhịp thì nhìn như con trâu và ông chủ
 *  đang cãi nhau chứ không phải cùng kéo một cái cày. */
function farmOx(g, f, e, x, y) {
  const step = farmSwing(e);
  const ox = x + 17;
  const oy = y + 6;
  px2(g, ox + 1, oy + 2, 13, 6, f.ox);              // thân
  px2(g, ox + 1, oy + 2, 13, 1, lighten(f.ox, 0.16));
  px2(g, ox + 11, oy, 5, 4, f.ox);                  // đầu
  px2(g, ox + 15, oy + 2, 1, 2, f.oxDark);          // mõm
  px2(g, ox + 11, oy - 1, 1, 2, f.oxDark);          // hai sừng cong ra
  px2(g, ox + 15, oy - 1, 1, 2, f.oxDark);
  px2(g, ox + 2, oy + 8, 2, 3 - step, f.oxDark);    // chân trước / sau, so le theo nhịp
  px2(g, ox + 11, oy + 8, 2, 2 + step, f.oxDark);
  px2(g, ox, oy + 3, 1, 4, f.oxDark);               // đuôi
  // Cái cày nối từ tay người sang vai trâu - thiếu nó thì con trâu chỉ đang đứng cạnh
  px2(g, x + 13, y + 12, 6, 1, f.wood);
  px2(g, ox + 1, oy + 7, 2, 3, f.metal);
}

/* ------------------------------------------------------------- sinh vật nền */

/** Con gà. Mổ thóc khi đứng, chạy lạch bạch khi đi. Vẽ ở toạ độ đã làm tròn do lõi truyền
 *  xuống, nên nó bước đúng từng pixel một chứ không trôi dưới pixel. */
function farmHen(g, p, c, x, y) {
  const f = fpal(p);
  const moving = c.wait <= 0;
  // Mổ thóc: cúi đầu xuống theo một nhịp thưa. Nhịp thưa là cố ý - mỗi lần đổi tư thế là một
  // khung phải vẽ lại, bốn con gà mổ liên tục thì cả cánh đồng đứng yên vẫn ngốn 60 fps.
  const peck = !moving && Math.floor(c.wait * 1.4) % 3 === 0;
  const step = moving && Math.floor(c.anim * 6) % 2;
  const d = c.flip ? -1 : 1;
  const hx = x + (c.flip ? 1 : 4);
  px2(g, x + 1, y + 2, 5, 4, c.tone || f.hen);            // thân
  px2(g, x + 1, y + 5, 5, 1, f.henDark);
  px2(g, x + (c.flip ? 5 : 0), y + 3, 1, 2, f.henDark);   // đuôi
  if (peck) {
    px2(g, hx, y + 4, 2, 2, c.tone || f.hen);             // đầu cúi xuống đất
    px2(g, hx + d, y + 5, 1, 1, f.beak);
  } else {
    px2(g, hx, y, 2, 3, c.tone || f.hen);                 // đầu ngẩng
    px2(g, hx, y - 1, 1, 1, f.comb);                      // mào
    px2(g, hx + d, y + 1, 1, 1, f.beak);
    px2(g, hx + (c.flip ? 0 : 1), y + 1, 1, 1, INK);      // mắt
  }
  px2(g, x + 2, y + 6, 1, step ? 2 : 1, f.beak);          // hai chân so le
  px2(g, x + 4, y + 6, 1, step ? 1 : 2, f.beak);
}

/** Con chó. To hơn gà, chạy nhanh hơn, và đuôi vẫy khi đứng - đó là thứ duy nhất phân biệt
 *  nó với một con gà phóng to ở cỡ pixel này. */
function farmDog(g, p, c, x, y) {
  const f = fpal(p);
  const moving = c.wait <= 0;
  const step = moving && Math.floor(c.anim * 7) % 2;
  const wag = !moving && Math.floor(OF.clock * 3) % 2;
  const d = c.flip ? -1 : 1;
  const hx = x + (c.flip ? 0 : 6);
  px2(g, x + 1, y + 2, 8, 4, f.dog);                      // thân
  px2(g, x + 1, y + 5, 8, 1, f.dogDark);
  px2(g, hx, y, 4, 4, f.dog);                             // đầu
  px2(g, hx + (c.flip ? 3 : 0), y, 1, 2, f.dogDark);      // tai
  px2(g, hx + (c.flip ? 0 : 3), y + 2, 1, 1, INK);        // mũi
  px2(g, hx + (c.flip ? 2 : 1), y + 1, 1, 1, INK);        // mắt
  px2(g, x + (c.flip ? 8 : 0), y + (wag ? 0 : 1), 1, 3, f.dogDark);   // đuôi vẫy
  px2(g, x + 2, y + 6, 1, step ? 2 : 1, f.dogDark);
  px2(g, x + 7, y + 6, 1, step ? 1 : 2, f.dogDark);
  if (d) { /* hướng chỉ đổi chỗ vẽ đầu, không cần thêm gì */ }
}

/* ------------------------------------------------------------- đăng ký */

registerScene({
  id: 'farm',
  stationCount: 10,          // 2 dãy x 5 thửa - xem MIN_STATIONS
  defaultPack: 'office',
  defaultRoom: 'paddy',
  rooms: FARM_ROOMS,
  // Có đạo cụ bám nhân vật => phải snap, nếu không cái rìu rung quanh bàn tay.
  snap: true,
  legendSuffix: 'farm',
  cheerColors: ['#e0b830', '#f2d06b', '#c9a227', '#8fbf5a', '#e8e0cc'],

  stations: farmStations,
  seatOf: farmSeatOf,
  route: farmRoute,
  behave: farmBehave,
  stepScene: farmStep,
  entry: () => ({ x: -20, y: FARM_AISLE_Y[1] }),
  exit: () => ({ x: -22, y: FARM_AISLE_Y[1] }),
  wanderTarget: () => ({
    x: 14 + Math.random() * (ROOM_W - 44),
    y: FARM_AISLE_Y[1] + Math.random() * 8,
  }),
  bands: () => [
    { row: 0, lo: -Infinity, hi: FARM_ROW_Y[1] },
    { row: 1, lo: FARM_ROW_Y[1], hi: Infinity },
  ],

  // Tên agent viết thẳng lên cỏ, nên màu chữ phải theo ĐỘ SÁNG CỦA CỎ chứ không theo
  // `--of-label` (biến đó tính cho sàn văn phòng). Cỏ tối thì chữ sáng, cỏ sáng thì chữ tối -
  // để nguyên `--of-label` là ở một trong hai theme tên chìm hẳn vào nền.
  labelColor: (p) => (farmLight(p) ? '#1d2b1c' : '#f2f6ec'),

  // Ai cũng đứng trên đất nên ai cũng có bóng. Ở Văn phòng người ngồi bị bỏ bóng vì bóng nằm
  // ở đáy sprite mà đáy sprite lúc ngồi là khoảng trống sau ghế.
  shadowFor: () => true,

  /** Khung hình. Đứng làm ruộng thì quay lưng lại (u*) chứ không dùng tư thế ngồi (k*) - ở
   *  đây không có cái ghế nào. Trả null nghĩa là "để lõi lo", dùng cho lúc đang đi bộ. */
  frameFor(e) {
    if (e.cheer > 0) return Math.floor(e.anim * 9) % 2 ? 'd1' : 'd2';
    if (e.path.length) return null;
    if (e.mode !== 'sit') return 'd0';
    if (e.glance > 0) return 'd0';       // ngoái ra nhìn người vừa rê chuột vào
    const d = e.data || {};
    if (d.state === 'paused') return 'k3';
    const act = currentAction(e);
    if (act === 'rest') return 'd0';
    // Mấy việc "tĩnh" thì đứng yên quay lưng, việc tay chân thì đảo hai khung cho ra nhịp
    if (act === 'read' || act === 'plan' || act === 'mcp') return 'u0';
    return farmSwing(e) ? 'u1' : 'u2';
  },

  drawStatic(g, p, roomId) {
    const f = fpal(p);
    (FARM_ROOMS.find((r) => r.id === roomId) || FARM_ROOMS[0]).draw(g, p);
    // Luống đất và đống củi không đổi nên nướng thẳng vào nền - phần đổi (cây, người) mới vẽ
    // lại mỗi khung.
    farmStations().forEach((st) => { farmBed(g, f, st); farmWoodpile(g, f, st); });
    // Lối mòn ngang chỗ đi lại và cổng ra vào, luôn ở đúng một chỗ cho mọi kiểu nền
    const rw = ROOM_W - 130;
    px2(g, 60, FARM_AISLE_Y[1] + 8, rw, 12, darken(f.soil, 0.1));
    px2(g, 63, FARM_AISLE_Y[1] + 11, rw - 6, 1, f.soilDark);
    px2(g, 0, FARM_AISLE_Y[1] - 12, 6, 30, f.fenceDark);
    px2(g, 1, FARM_AISLE_Y[1] - 10, 4, 26, f.fence);
  },

  drawPreviewExtras(g, p) {
    const f = fpal(p);
    farmStations().forEach((st, i) => { st.grow = 0.4 + (i % 3) * 0.25; farmCrop(g, f, st); });
  },

  drawStation(g, st) {
    farmCrop(g, fpal(OF.pal), st);
  },

  /** Đạo cụ vẽ SAU nhân vật: cái rìu, cái liềm, con trâu đều phải nằm trước mặt người cầm.
   *  Vẽ trước thì bàn tay che mất cán, nhìn như cái rìu mọc ra từ sau lưng. */
  drawOver(g, e, info) {
    if (e.kind !== 'agent' || e.mode !== 'sit' || e.cheer > 0) return;
    const f = fpal(OF.pal);
    const x = info.x;
    const y = info.ey;
    switch (e.role) {
      case 'type': farmOx(g, f, e, x, y); break;
      case 'read': farmSickle(g, f, e, x, y); break;
      case 'run': farmAxe(g, f, e, x, y); break;
      case 'web': farmBuckets(g, f, e, x, y); break;
      case 'plan': farmScroll(g, f, e, x, y); break;
      case 'mcp': farmCrate(g, f, e, x, y); break;
      case 'work': farmHoe(g, f, e, x, y); break;
      case 'rest': farmHat(g, f, x, y); break;
      default: break;
    }
  },

  ambient() {
    const out = [];
    const tones = ['#f2ede4', '#e6d3ae', '#d9c39c', '#f0e6d2'];
    for (let i = 0; i < 4; i++) {
      const x = 40 + i * 52;
      out.push({
        x, y: FARM_LANE + (i % 2), tx: x, ty: FARM_LANE, wait: 1 + i,
        speed: 11, restMin: 2.5, restVar: 4, tone: tones[i], draw: farmHen,
        pick: () => ({ x: 12 + Math.random() * (ROOM_W - 40), y: FARM_LANE + Math.random() * 4 }),
      });
    }
    out.push({
      x: 150, y: FARM_LANE - 2, tx: 150, ty: FARM_LANE - 2, wait: 2,
      speed: 21, restMin: 2, restVar: 5, draw: farmDog,
      pick: () => ({ x: 14 + Math.random() * (ROOM_W - 44), y: FARM_LANE - 3 + Math.random() * 4 }),
    });
    return out;
  },

  /** Tiến độ cây nằm ngoài mọi thứ lõi biết, nên phải tự khai vào chữ ký - quên là cả cánh
   *  đồng lớn lên mà màn hình đứng hình. Lấy BẬC chứ không lấy `grow` thô: grow đổi từng
   *  khung, đưa vào là vẽ lại 60 lần mỗi giây cho một cây cao thêm 1/45 pixel. */
  sceneSig() {
    let s = '';
    OF.stations.forEach((st) => { s += farmStage(st); });
    return s;
  },
});
