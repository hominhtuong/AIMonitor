/* Bối cảnh Shipper: mỗi agent là một người giao hàng, có địa chỉ riêng và một chiếc xe.
 *
 * Đây là bối cảnh đầu tiên phá giả định "chỗ làm việc là chỗ đứng yên" - agent đang bận thì
 * KHÔNG ngồi một chỗ mà chạy xe từ kho về địa chỉ của mình rồi quay lại. Vì thế nó cũng là
 * bài kiểm tra thật cho lớp SCENE: chỗ nào tách chưa sạch sẽ lộ ra ở đây chứ không phải ở
 * Nông trại.
 *
 * Bố cục: hai tầng, mỗi tầng một hàng nhà và một con đường ngay dưới hàng nhà đó.
 *
 *     0..22    trời, đường chân trời
 *    22..50    HÀNG NHÀ TRÊN (5 địa chỉ)
 *    50..58    vỉa hè trên
 *    58..86    ĐƯỜNG TRÊN, làn cơ sở y=62
 *    86..114   HÀNG NHÀ DƯỚI (5 địa chỉ)
 *   114..122   vỉa hè dưới
 *   122..150   ĐƯỜNG DƯỚI, làn cơ sở y=126
 *   150..176   sân trước, dải sinh vật nền
 *
 * Vì sao HAI con đường chứ không phải một: chiều sâu trong khung hình này là trục y, ai ở
 * dưới thì gần người xem hơn và phải được vẽ đè lên. Nếu chỉ có một con đường ở giữa thì
 * shipper của hàng nhà dưới phải đứng DƯỚI nhà mình (mới được vẽ đè lên nhà) nhưng lại chạy
 * xe ở con đường PHÍA TRÊN nhà - tức là mỗi chuyến phải xuyên qua chính ngôi nhà của mình.
 * Cho mỗi hàng nhà một con đường riêng ngay dưới nó thì thứ tự vẽ đúng ở mọi chặng.
 *
 * Ba chỗ dễ sai đã xử lý sẵn:
 *
 * 1. **Xe và người phải dùng CHUNG một gốc toạ độ đã làm tròn** (`snap: true`) và chung một
 *    nhịp nhún (`bobFor`). Lệch một pixel là cái xe rung dưới mông người ngồi.
 * 2. **Chặng rẽ từ nhà xuống đường phải là đường CHÉO ngả ngang**, không phải đi thẳng xuống.
 *    `dir` suy từ thành phần lớn hơn của véc-tơ, đi thẳng xuống thì `dir` thành 'down' và
 *    khung hình chuyển sang tư thế nhìn từ sau lưng - một chiếc xe máy quay lưng lại.
 * 3. **Xe đỗ vẫn phải giữ hướng đang quay.** `flip` mặc định của lõi tắt khi hết đường đi,
 *    nên xe dừng đèn đỏ là quay ngoắt sang phải. `flipFor` giữ hướng theo `dir`.
 */

const DLV_HOUSE_X = [40, 82, 124, 166, 208];
const DLV_HOUSE_W = 34;
const DLV_HOUSE_H = 28;
const DLV_HOUSE_Y = [22, 86];         // mép trên hai hàng nhà
/* Làn cơ sở của hai con đường. Chọn sao cho nhân vật (cao 20) CỘNG bóng đổ dưới gầm xe
 * (thêm ~1) nằm trọn trong mặt đường 28 pixel: 60 + 20 + 1 = 81 < 86 là mép trên hàng nhà
 * dưới. Đặt thấp hơn thì bánh xe của người chạy trên đường TRÊN thò xuống đè lên mái hàng
 * nhà DƯỚI - mà nhà nằm trong nền đã nướng nên vẽ trước, tức là cái xe đè lên ngôi nhà lẽ ra
 * phải che nó. Đúng kiểu lỗi thứ tự vẽ đã trả giá với cái ghế ở Văn phòng. */
const DLV_LANE_Y = [60, 124];
const DLV_ROAD_Y = [58, 122];         // mép trên mặt đường
const DLV_ROAD_H = 28;
const DLV_SEAT_DY = 14;               // chỗ đứng trước nhà, tính từ mép trên nhà
const DLV_DEPOT_X = 34;               // mép phải của kho - điểm quay đầu của mọi chuyến
/* Lệch làn giữa các địa chỉ, để xe không chồng khít nhau. Ba mức x 2 pixel là trần, và cái
 * chặn không phải thân nhân vật mà là BÓNG ĐỔ dưới gầm xe: nó là hình bầu dục tâm ở y+19.4
 * bán trục 1.8, tức chạm tới y+21.2. Làn thấp nhất 64 + 21.2 = 85.2, vừa lọt mép trên hàng
 * nhà dưới ở 86. Lệch 3 pixel là bóng tràn sang mái nhà, mà bóng thì mờ nên lỗi đó chỉ lộ ra
 * khi soi kỹ - đúng loại lỗi ở lại lâu nhất. */
const DLV_LANE_STAGGER = 2;
const DLV_TURN_DX = 40;               // chặng rẽ chéo dài bao nhiêu theo trục ngang

const DLV_RIDE_SPEED = 46;            // pixel gốc / giây - xe nhanh hơn người đi bộ
const DLV_DROP_SEC = 1.1;             // đứng giao hàng trước cửa bao lâu rồi mới đi chuyến mới
const DLV_LOAD_SEC = 0.7;             // dừng ở kho lấy hàng
const DLV_LANE = ROOM_H - 10;         // dải của chó và chim, sát mép dưới

let DLV_PAL = null;
let DLV_PAL_KEY = '';

function dpal(p) {
  const key = p.wall + '|' + p.desk + '|' + p.floor;
  if (DLV_PAL && DLV_PAL_KEY === key) return DLV_PAL;
  DLV_PAL_KEY = key;
  DLV_PAL = {
    road: darken(p.floor, 0.25),
    roadDark: darken(p.floor, 0.42),
    line: lighten(p.floor, 0.45),
    walk: lighten(p.floor, 0.16),
    walkDark: darken(p.floor, 0.08),
    wall: p.wall,
    wallDark: p.wallDark,
    roof: darken(p.desk, 0.12),
    roofDark: darken(p.desk, 0.34),
    door: p.deskDark,
    win: p.sky,
    winOff: darken(p.sky, 0.55),
    winLit: '#f2d06b',
    metal: p.metal,
    bike: '#d9534f',
    bikeDark: '#8f342f',
    tyre: '#242a33',
    box: p.desk,
    boxDark: p.deskDark,
    tape: lighten(p.desk, 0.3),
    green: p.plant,
    greenDark: darken(p.plant, 0.3),
    lampPost: darken(p.metal, 0.2),
    dog: '#b98149',
    dogDark: '#8a5c33',
    bird: '#5b6b82',
  };
  return DLV_PAL;
}

/* ------------------------------------------------------------- bố cục */

function dlvStations() {
  const out = [];
  DLV_HOUSE_Y.forEach((hy, row) => {
    DLV_HOUSE_X.forEach((x, col) => {
      const seatY = hy + DLV_SEAT_DY;
      out.push({
        id: 'h' + row + '.' + col,
        x, y: hy, row, col,
        seatX: x + (DLV_HOUSE_W - SPRITE_W) / 2,
        seatY,
        // Lệch làn theo cột: ba mức so le, đủ để hai xe chạy ngược chiều không chồng khít
        lane: DLV_LANE_Y[row] + (col % 3) * DLV_LANE_STAGGER,
        helpers: [
          { x: x - 15, y: seatY + 2 },
          { x: x + DLV_HOUSE_W + 1, y: seatY + 2 },
        ],
        box: { x: x - 2, y: hy - 2, w: DLV_HOUSE_W + 4, h: DLV_HOUSE_H + 26 },
        labelX: x + DLV_HOUSE_W / 2,
        // Bong bóng treo ngay trên ĐẦU người, không phải trên nóc nhà. Ở Văn phòng nó neo vào
        // mép trên màn hình máy tính nên tuy cách đầu 18 pixel vẫn đọc ra là "của cái bàn
        // này"; ở đây khoảng đó là bức tường trống, và bong bóng trôi lơ lửng trên mái, nhìn
        // không biết của ai.
        bubbleY: seatY - 1,
        nameY: seatY + 26,
      });
    });
  });
  return out;
}

/** Đường đi khi ĐI BỘ (lúc rảnh đi vòng vòng, lúc vào ra khung hình). Chuyến giao hàng có
 *  đường riêng ở `dlvStartRide` vì nó chạy trên làn xe chứ không men theo vỉa hè. */
function dlvRoute(e, tx, ty, seat) {
  const path = [];
  // Lệch làn đi bộ theo địa chỉ. Không có nó thì lúc mở khung hình cả mười người cùng sinh ra
  // ở cửa, cùng một đích trung gian, và đi chồng khít lên nhau thành MỘT bóng người suốt mười
  // giây đầu - nhìn như khung hình chỉ có một agent.
  const off = seat ? (seat.col % 3) * 3 : 0;
  const curWalk = (e.y < DLV_HOUSE_Y[1] ? DLV_ROAD_Y[0] - 4 : DLV_ROAD_Y[1] - 4) + off;
  const dstWalk = (ty < DLV_HOUSE_Y[1] ? DLV_ROAD_Y[0] - 4 : DLV_ROAD_Y[1] - 4) + off;
  if (curWalk !== dstWalk) {
    // Đổi tầng thì men mép PHẢI. Mép trái là kho, mà kho chiếm nguyên dải ngang của con
    // đường nên đi qua đó là chui xuyên qua nhà kho; giữa hai hàng nhà thì khe chỉ rộng 8
    // pixel, không lọt nổi một nhân vật rộng 16.
    path.push({ x: ROOM_W - 20 + off, y: curWalk });
    path.push({ x: ROOM_W - 20 + off, y: dstWalk });
  } else if (e.mode === 'ride' || e.mode === 'sit') {
    path.push({ x: e.x, y: curWalk });
  }
  path.push({ x: tx, y: dstWalk });
  path.push({ x: tx, y: ty });
  e.path = path;
}

/** Điểm rẽ chéo giữa cửa nhà và làn xe.
 *
 *  Chặng chéo phải NGẢ NGANG nhiều hơn ngả dọc - đó là điều kiện để `dir` ra 'left'/'right'
 *  chứ không ra 'up'/'down', và nhờ vậy khung hình giữ tư thế nhìn ngang. Đi thẳng lên xuống
 *  thì thành một chiếc xe máy quay lưng về phía người xem, đúng kiểu "nhìn giả trân".
 *
 *  Mặc định rẽ về bên TRÁI (phía kho). Nhà đầu dãy nằm sát kho quá, không đủ 40 pixel để rẽ,
 *  thì rẽ sang phải rồi vòng lại - vẫn ngả ngang, và trông như người chạy quá cửa một đoạn
 *  rồi quay đầu, đúng cái người giao hàng hay làm. */
function dlvTurnX(st) {
  const left = st.seatX - DLV_TURN_DX;
  return left >= DLV_DEPOT_X + 4 ? left : st.seatX + DLV_TURN_DX;
}

/** Bắt đầu một chuyến: rẽ chéo từ trước cửa xuống làn xe, rồi chạy về kho lấy hàng. */
function dlvStartRide(e) {
  const st = e.station;
  if (!st) return;
  e.mode = 'ride';
  e.goal = 'ride';
  e.sub.leg = 0;
  e.sub.wait = 0;
  e.path = [{ x: dlvTurnX(st), y: st.lane }, { x: DLV_DEPOT_X, y: st.lane }];
}

function dlvBehave(e, dt, d) {
  if (!e.sub) e.sub = { leg: 0, wait: 0 };
  const s = e.sub;

  if (d.state === 'wander') {
    // Rảnh lâu thì bỏ xe đấy, đi bộ lòng vòng. Chỗ vẫn giữ nguyên để lát nữa quay lại.
    if (e.mode === 'ride') { e.mode = 'idle'; e.path = []; e.goal = null; }
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

  if (e.role === 'run' || e.role === 'work') {
    // Đang chạy trên đường: để `path` lo, trừ lúc dừng ở kho lấy hàng.
    if (e.mode === 'ride') {
      if (e.path.length) return;
      s.wait -= dt;
      if (s.wait > 0) return;
      // Lấy hàng xong: chạy về ngang nhà mình, dừng ở ĐIỂM RẼ chứ không dừng ngay dưới cửa -
      // chặng cuối phải là một đường chéo ngả ngang thì xe mới giữ được tư thế nhìn ngang.
      e.goal = 'ride';
      e.path = [{ x: dlvTurnX(e.station), y: e.station.lane }];
      s.leg = 1;
      return;
    }
    if (e.mode === 'sit') {
      s.wait -= dt;                       // đứng giao hàng trước cửa một nhịp
      if (s.wait <= 0) dlvStartRide(e);
      return;
    }
    if (e.goal !== 'station') sendToStation(e, e.station);
    return;
  }

  // Mọi nghề còn lại làm việc ngay trước cửa nhà mình.
  if (e.mode === 'ride') { e.mode = 'idle'; e.path = []; e.goal = null; }
  if (e.goal !== 'station') sendToStation(e, e.station);
}

/** Vừa tới đích. Chuyến giao hàng nối chặng ở đây; mọi goal khác thì lõi đã lo xong. */
function dlvArrive(e) {
  if (!e.sub) e.sub = { leg: 0, wait: 0 };
  const s = e.sub;
  if (e.goal === 'station') { s.wait = DLV_DROP_SEC; return; }
  if (e.goal !== 'ride' || !e.station) return;
  if (s.leg === 0) {
    // Tới kho: đứng lại lấy hàng. Giữ mode 'ride' để vẫn ngồi trên xe.
    s.wait = DLV_LOAD_SEC;
    e.mode = 'ride';
    return;
  }
  // Về tới ngang nhà mình: rẽ chéo lên trước cửa. Đặt goal 'station' để lõi tự chuyển sang
  // 'sit' khi tới nơi - đó cũng là chỗ `dlvArrive` được gọi lại để đặt nhịp giao hàng.
  e.goal = 'station';
  e.mode = 'ride';
  e.path = [{ x: e.station.seatX, y: e.station.seatY }];
}

/** Trục x của một đạo cụ, đã lo phần lật hình. Vẽ đạo cụ bằng px2 nên chúng nằm ngoài phép
 *  lật của drawImage - không mirror bằng tay thì xe chạy sang trái mà ghi đông vẫn chìa sang
 *  phải, thùng hàng thì đi trước đầu xe. */
function dfx(info, dx, w) {
  return info.flip ? info.x + SPRITE_W - dx - w : info.x + dx;
}

/* ------------------------------------------------------------- xe và hàng */

/** Phần xe nằm DƯỚI người: bánh, thân, sàn để chân. Vẽ trước nhân vật nên người ngồi lên nó.
 *
 *  Chân người bị cắt đi (`cutFor` trả 5) chứ không phải bị che bằng một mảng màu: che thì cái
 *  đè phải khớp đúng màu nền, mà nền lại đổi theo theme và theo kiểu nền. */
function dlvBikeUnder(g, p, e, info) {
  const c = dpal(p);
  const y = info.ey;
  // Bóng đổ dưới gầm xe - hình bầu dục dẹt, dài hơn bóng người đứng
  g.save();
  g.fillStyle = p.shadow;
  g.beginPath();
  g.ellipse(info.x + SPRITE_W / 2, y + 19.4, 8, 1.8, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  px2(g, dfx(info, 1, 4), y + 15, 4, 4, c.tyre);          // bánh sau
  px2(g, dfx(info, 2, 2), y + 16, 2, 2, c.metal);
  px2(g, dfx(info, 11, 4), y + 15, 4, 4, c.tyre);         // bánh trước
  px2(g, dfx(info, 12, 2), y + 16, 2, 2, c.metal);
  px2(g, dfx(info, 2, 12), y + 12, 12, 4, c.bike);        // thân xe
  px2(g, dfx(info, 2, 12), y + 12, 12, 1, lighten(c.bike, 0.22));
  px2(g, dfx(info, 2, 12), y + 15, 12, 1, c.bikeDark);
  px2(g, dfx(info, 4, 6), y + 16, 6, 1, c.bikeDark);      // sàn để chân
}

/** Phần xe nằm TRÊN người: ghi đông, đèn, và chồng thùng hàng sau lưng.
 *
 *  Số thùng = số tool đang chạy (`pending_more` + 1). Dữ liệu có sẵn trong payload, mà một
 *  chồng thùng cao dần nói "đang bận tới đâu" rõ hơn hẳn một con số. */
function dlvBikeOver(g, p, e, info) {
  const c = dpal(p);
  const y = info.ey;
  px2(g, dfx(info, 13, 3), y + 9, 3, 1, c.metal);         // ghi đông
  px2(g, dfx(info, 14, 1), y + 9, 1, 4, c.metal);
  px2(g, dfx(info, 15, 1), y + 11, 1, 2, c.winLit);       // đèn pha

  // Chồng thùng = số tool đang chạy. Trần là BA chứ không phải bốn, và đặt lùi hẳn ra sau
  // lưng (dx = -6) chứ không sát người: bốn thùng thì chồng cao quá đỉnh đầu và tràn khỏi ô
  // sprite, còn đặt sát thì thùng trên cùng che mất nửa khuôn mặt - mà nhận ra ai là ai lại
  // đúng là việc của khung nhìn này. Xếp từ giá chở hàng (y+12) trở lên.
  const d = e.data || {};
  const n = Math.max(1, Math.min(3, (d.pending_more || 0) + 1));
  for (let i = 0; i < n; i++) {
    const by = y + 12 - i * 4;
    px2(g, dfx(info, -6, 7), by, 7, 4, c.box);
    px2(g, dfx(info, -6, 7), by, 7, 1, lighten(c.box, 0.2));
    px2(g, dfx(info, -6, 7), by + 3, 7, 1, c.boxDark);
    px2(g, dfx(info, -3, 1), by, 1, 4, c.tape);           // băng keo dán dọc
  }
}

/** Xe đỗ cạnh người đang đứng làm việc trước cửa. Không có nó thì nghỉ xong xe biến mất, lát
 *  sau lại có xe - nhìn như xe mọc ra từ dưới đất. */
function dlvBikeParked(g, p, info) {
  const c = dpal(p);
  const y = info.ey;
  const bx = 17;
  px2(g, dfx(info, bx + 1, 3), y + 15, 3, 3, c.tyre);
  px2(g, dfx(info, bx + 8, 3), y + 15, 3, 3, c.tyre);
  px2(g, dfx(info, bx + 2, 9), y + 12, 9, 3, c.bike);
  px2(g, dfx(info, bx + 2, 9), y + 12, 9, 1, lighten(c.bike, 0.22));
  px2(g, dfx(info, bx + 9, 1), y + 9, 1, 3, c.metal);
}

/* ------------------------------------------------------------- đạo cụ theo nghề */

function dlvPhone(g, c, e, info) {
  const y = info.ey;
  px2(g, dfx(info, 11, 3), y + 9, 3, 5, c.tyre);
  px2(g, dfx(info, 12, 1), y + 10, 1, 3, c.win);
}

function dlvTapeBox(g, c, e, info) {
  const y = info.ey;
  const beat = Math.floor(e.anim * 6) % 2;
  px2(g, dfx(info, 10, 8), y + 10, 8, 6, c.box);
  px2(g, dfx(info, 10, 8), y + 10, 8, 1, lighten(c.box, 0.2));
  px2(g, dfx(info, 13, 2), y + 10, 2, 6, c.tape);
  px2(g, dfx(info, 9, 2), y + (beat ? 8 : 9), 2, 2, c.metal);   // cuộn băng keo trên tay
}

function dlvStack(g, c, info, n) {
  const y = info.ey;
  for (let i = 0; i < n; i++) {
    px2(g, dfx(info, 16, 8), y + 15 - i * 4, 8, 4, c.box);
    px2(g, dfx(info, 16, 8), y + 15 - i * 4, 8, 1, lighten(c.box, 0.2));
    px2(g, dfx(info, 19, 1), y + 15 - i * 4, 1, 4, c.tape);
  }
}

function dlvClipboard(g, c, info) {
  const y = info.ey;
  px2(g, dfx(info, 10, 7), y + 10, 7, 8, c.boxDark);
  px2(g, dfx(info, 11, 5), y + 11, 5, 6, '#e8e0cc');
  for (let i = 0; i < 3; i++) px2(g, dfx(info, 12, 3), y + 12 + i * 2, 3, 1, c.roadDark);
}

/* ------------------------------------------------------------- nền */

function dlvSkyline(g, p, c, lit) {
  px2(g, 0, 0, ROOM_W, 22, p.sky);
  // Dãy nhà cao tầng phía xa. Chiều cao đổi theo một dãy số cố định chứ không random: nền
  // được nướng lại mỗi lần đổi theme, random thì thành phố đổi hình mỗi lần bấm sáng/tối.
  const hs = [10, 16, 7, 13, 9, 18, 11, 6, 14, 8, 12, 15, 9, 17, 7, 11, 13, 8];
  for (let i = 0, x = -4; x < ROOM_W; i++, x += 15) {
    const h = hs[i % hs.length];
    px2(g, x, 22 - h, 14, h, c.wallDark);
    px2(g, x, 22 - h, 14, 1, c.wall);
    for (let wy = 22 - h + 2; wy < 20; wy += 3) {
      for (let wx = x + 2; wx < x + 12; wx += 4) {
        px2(g, wx, wy, 2, 1, lit && (wx + wy) % 3 === 0 ? c.winLit : c.winOff);
      }
    }
  }
}

/** Một con đường: mặt nhựa, vạch kẻ đứt ở giữa, hai mép vỉa hè. */
function dlvRoad(g, c, y) {
  px2(g, 0, y, ROOM_W, DLV_ROAD_H, c.road);
  px2(g, 0, y, ROOM_W, 1, c.roadDark);
  px2(g, 0, y + DLV_ROAD_H - 1, ROOM_W, 1, c.roadDark);
  for (let x = 4; x < ROOM_W; x += 16) px2(g, x, y + DLV_ROAD_H / 2 - 1, 8, 1, c.line);
}

function dlvWalk(g, c, y) {
  px2(g, 0, y, ROOM_W, 8, c.walk);
  px2(g, 0, y + 7, ROOM_W, 1, c.walkDark);
  for (let x = 0; x < ROOM_W; x += 11) px2(g, x, y, 1, 7, c.walkDark);
}

/** Kho hàng ở mép trái mỗi con đường - điểm quay đầu của mọi chuyến. Cửa cuốn mở, thấy mấy
 *  thùng bên trong: đó là thứ giải thích vì sao ai cũng chạy về góc này. */
function dlvDepot(g, c, y) {
  px2(g, 0, y - 6, DLV_DEPOT_X, DLV_ROAD_H + 6, c.wallDark);
  px2(g, 0, y - 8, DLV_DEPOT_X + 2, 3, c.roofDark);
  px2(g, 2, y - 2, DLV_DEPOT_X - 6, DLV_ROAD_H - 4, c.roadDark);   // khoang cửa
  px2(g, 2, y - 2, DLV_DEPOT_X - 6, 2, c.metal);                   // cửa cuốn kéo lên
  for (let i = 0; i < 3; i++) {
    px2(g, 4 + i * 9, y + DLV_ROAD_H - 12, 7, 6, c.box);
    px2(g, 4 + i * 9, y + DLV_ROAD_H - 12, 7, 1, lighten(c.box, 0.2));
  }
}

/** Một ngôi nhà. Mái, thân, cửa, hai cửa sổ, và số nhà bằng một chấm màu - đủ để năm cái nhà
 *  cạnh nhau không lẫn vào nhau ở cỡ 34 pixel. */
function dlvHouse(g, c, st, tint, lit) {
  const x = st.x;
  const y = st.y;
  px2(g, x, y + 6, DLV_HOUSE_W, DLV_HOUSE_H - 6, tint);
  px2(g, x, y + 6, DLV_HOUSE_W, 1, lighten(tint, 0.18));
  px2(g, x, y + DLV_HOUSE_H - 2, DLV_HOUSE_W, 2, darken(tint, 0.25));
  // Mái: hai bậc thu vào cho ra dáng dốc, chìa ra hai bên 2 pixel
  px2(g, x - 2, y + 3, DLV_HOUSE_W + 4, 4, c.roof);
  px2(g, x + 2, y, DLV_HOUSE_W - 4, 4, c.roofDark);
  // Cửa chính, đúng giữa nhà - đó là chỗ shipper đứng giao hàng
  px2(g, x + 14, y + 16, 7, 12, c.door);
  px2(g, x + 19, y + 21, 1, 1, c.metal);
  [4, 24].forEach((dx) => {
    px2(g, x + dx, y + 12, 6, 6, darken(tint, 0.35));
    px2(g, x + dx + 1, y + 13, 4, 4, lit ? c.winLit : c.win);
  });
}

const DLV_ROOMS = [
  {
    /* Phố thị ban ngày: nhà sơn màu lạnh, đường nhựa xám, cột đèn dọc vỉa hè. */
    id: 'city',
    tints: ['#6b7f9e', '#7d7091', '#5f8a86', '#8a7566', '#6f7f6a'],
    lit: false,
    ground(g, p, c) {
      px2(g, 0, 150, ROOM_W, ROOM_H - 150, c.walk);
      for (let x = 6; x < ROOM_W; x += 24) px2(g, x, 152, 2, 3, c.walkDark);
    },
  },
  {
    /* Ngoại ô: nhiều cây, sân cỏ, nhà màu ấm. */
    id: 'suburb',
    tints: ['#a8896b', '#9c7f8e', '#7fa07a', '#b09161', '#8093a8'],
    lit: false,
    ground(g, p, c) {
      px2(g, 0, 150, ROOM_W, ROOM_H - 150, c.green);
      for (let x = 3; x < ROOM_W; x += 9) px2(g, x, 153 + (x % 3), 2, 1, c.greenDark);
      for (let x = 14; x < ROOM_W; x += 46) {
        px2(g, x + 3, 158, 2, 8, darken(c.roof, 0.2));
        px2(g, x, 150, 8, 8, c.green);
        px2(g, x + 1, 149, 6, 2, c.greenDark);
      }
    },
  },
  {
    /* Ban đêm: trời sẫm, cửa sổ sáng đèn, cột đèn đường có quầng vàng. */
    id: 'night',
    tints: ['#3d4a63', '#453d5c', '#374f4d', '#523f3a', '#3f4a3c'],
    lit: true,
    ground(g, p, c) {
      px2(g, 0, 150, ROOM_W, ROOM_H - 150, darken(c.walk, 0.35));
      for (let x = 18; x < ROOM_W; x += 52) {
        px2(g, x, 148, 1, 12, c.lampPost);
        px2(g, x - 1, 146, 3, 2, c.winLit);
      }
    },
  },
  {
    /* Hoàng hôn: trời cam, bóng đổ dài, cửa sổ mới lác đác lên đèn. */
    id: 'sunset',
    tints: ['#8a6a7a', '#96725e', '#6e7a8c', '#9a8055', '#77697f'],
    lit: true,
    ground(g, p, c) {
      px2(g, 0, 150, ROOM_W, ROOM_H - 150, c.walk);
      for (let x = 0; x < ROOM_W; x += 7) px2(g, x, 150, 4, 1, darken(c.walk, 0.2));
    },
  },
];

function dlvRoomById(id) {
  return DLV_ROOMS.find((r) => r.id === id) || DLV_ROOMS[0];
}

/* ------------------------------------------------------------- sinh vật nền */

function dlvDog(g, p, c, x, y) {
  const q = dpal(p);
  const moving = c.wait <= 0;
  const step = moving && Math.floor(c.anim * 7) % 2;
  const wag = !moving && Math.floor(OF.clock * 3) % 2;
  const hx = x + (c.flip ? 0 : 6);
  px2(g, x + 1, y + 2, 8, 4, q.dog);
  px2(g, x + 1, y + 5, 8, 1, q.dogDark);
  px2(g, hx, y, 4, 4, q.dog);
  px2(g, hx + (c.flip ? 3 : 0), y, 1, 2, q.dogDark);
  px2(g, hx + (c.flip ? 0 : 3), y + 2, 1, 1, INK);
  px2(g, hx + (c.flip ? 2 : 1), y + 1, 1, 1, INK);
  px2(g, x + (c.flip ? 8 : 0), y + (wag ? 0 : 1), 1, 3, q.dogDark);
  px2(g, x + 2, y + 6, 1, step ? 2 : 1, q.dogDark);
  px2(g, x + 7, y + 6, 1, step ? 1 : 2, q.dogDark);
}

/** Con chim nhảy lò cò trên vỉa hè. Nhỏ hơn con chó hẳn một bậc, nếu không ở cỡ này hai con
 *  chỉ là hai vệt màu giống nhau. */
function dlvBird(g, p, c, x, y) {
  const q = dpal(p);
  const moving = c.wait <= 0;
  const hop = moving && Math.floor(c.anim * 8) % 2 ? -1 : 0;
  const hx = x + (c.flip ? 0 : 3);
  px2(g, x + 1, y + 2 + hop, 4, 3, q.bird);
  px2(g, hx, y + hop, 2, 2, q.bird);
  px2(g, hx + (c.flip ? -1 : 2), y + 1 + hop, 1, 1, '#e8a33d');
  px2(g, x + (c.flip ? 4 : 0), y + 2 + hop, 1, 2, darken(q.bird, 0.3));
  px2(g, x + 2, y + 5 + hop, 1, 1, '#e8a33d');
}

/* ------------------------------------------------------------- đăng ký */

registerScene({
  id: 'delivery',
  stationCount: 10,          // 2 hàng x 5 địa chỉ - xem MIN_STATIONS
  defaultPack: 'office',
  defaultRoom: 'city',
  rooms: DLV_ROOMS,
  snap: true,
  legendSuffix: 'delivery',
  cheerColors: ['#d9534f', '#f2d06b', '#5ec2d9', '#e8e0cc', '#7bd88f'],

  stations: dlvStations,
  route: dlvRoute,
  behave: dlvBehave,
  onArrive: dlvArrive,
  entry: () => ({ x: -20, y: DLV_ROAD_Y[1] - 4 }),
  exit: () => ({ x: -22, y: DLV_ROAD_Y[1] - 4 }),
  wanderTarget: () => ({
    x: 40 + Math.random() * (ROOM_W - 80),
    y: DLV_ROAD_Y[1] - 6 + Math.random() * 6,
  }),
  bands: () => [
    { row: 0, lo: -Infinity, hi: DLV_HOUSE_Y[1] },
    { row: 1, lo: DLV_HOUSE_Y[1], hi: Infinity },
  ],

  // Ngồi trên xe thì xe đã có bóng riêng, vẽ thêm bóng người là hai vệt chồng nhau.
  shadowFor: (e) => e.mode !== 'ride',
  // Cắt bốn hàng chân: chân khuất sau thân xe. Cắt ở nguồn chứ không che bằng mảng màu.
  cutFor: (e) => (e.mode === 'ride' ? 5 : 0),
  // Xe ĐỖ vẫn giữ hướng đang quay. Lõi tắt `flip` khi hết đường đi, nên xe dừng ở kho sẽ
  // quay ngoắt sang phải nếu không có chỗ này.
  flipFor: (e) => e.dir === 'left' && (e.mode === 'ride' || e.path.length > 0),
  // Nhún theo mặt đường. Người và xe cùng đọc `info.ey` nên chúng nhún CÙNG nhau; tách ra là
  // thấy ngay người nảy lên khỏi yên.
  bobFor: (e) => (e.mode === 'ride' && e.path.length && Math.floor(e.anim * 9) % 2 ? -1 : 0),
  // Xe chạy nhanh hơn người đi bộ; lúc xuống xe đi bộ thì về lại tốc độ chung.
  speedFor: (e) => (e.mode === 'ride' ? DLV_RIDE_SPEED : WALK_SPEED),

  frameFor(e) {
    if (e.cheer > 0) return Math.floor(e.anim * 9) % 2 ? 'd1' : 'd2';
    if (e.mode === 'ride') return 's0';        // luôn nhìn ngang: đó là tư thế ngồi trên xe
    if (e.path.length) return null;            // đi bộ thì để lõi lo
    if (e.mode !== 'sit') return 'd0';
    if (e.glance > 0) return 'd0';
    const d = e.data || {};
    if (d.state === 'paused') return 'k3';
    const act = currentAction(e);
    if (act === 'rest') return 'd0';
    if (act === 'type') return Math.floor(e.anim * 6) % 2 ? 'u1' : 'u2';   // dán thùng
    return 'd0';                               // còn lại: đứng quay mặt ra, tay cầm đồ
  },

  drawStatic(g, p, roomId) {
    const c = dpal(p);
    const room = dlvRoomById(roomId);
    dlvSkyline(g, p, c, room.lit);
    // Nền chung của hai tầng, luôn ở đúng một chỗ cho mọi kiểu nền
    px2(g, 0, 22, ROOM_W, ROOM_H - 22, c.walk);
    [0, 1].forEach((row) => {
      dlvWalk(g, c, DLV_ROAD_Y[row] - 8);
      dlvRoad(g, c, DLV_ROAD_Y[row]);
      dlvDepot(g, c, DLV_ROAD_Y[row]);
    });
    room.ground(g, p, c);
    // Nhà nướng thẳng vào nền: chúng không đổi theo nhịp nào cả, chỉ có người đứng trước cửa
    // mới đổi. Nướng sẵn thì mỗi khung tiết kiệm chừng 130 lệnh vẽ.
    dlvStations().forEach((st) => dlvHouse(g, c, st, room.tints[st.col], room.lit));
  },

  drawPreviewExtras() { /* nhà đã nằm sẵn trong nền tĩnh */ },

  /** Nhà nướng sẵn vào nền, mỗi khung chỉ vẽ thêm cái đèn trên cửa.
   *
   *  Đèn này là bản shipper của "màn hình sáng" ở Văn phòng: mười ngôi nhà giống nhau, không
   *  có gì nói địa chỉ nào đang có người nhận. Sáng đèn = có chủ, kể cả lúc chủ đang chạy ngoài
   *  đường - khác cái màn hình ở Văn phòng, vì ở đây "đang đi giao" mới là lúc bận nhất. */
  drawStation(g, st, ent) {
    const c = dpal(OF.pal);
    px2(g, st.x + 15, st.y + 14, 5, 2, ent ? c.winLit : c.roadDark);
    px2(g, st.x + 16, st.y + 16, 3, 1, ent ? darken(c.winLit, 0.25) : c.roadDark);
  },

  drawUnder(g, e, info) {
    if (e.kind !== 'agent') return;
    if (e.mode === 'ride') dlvBikeUnder(g, OF.pal, e, info);
  },

  drawOver(g, e, info) {
    if (e.kind !== 'agent' || e.cheer > 0) return;
    const c = dpal(OF.pal);
    if (e.mode === 'ride') { dlvBikeOver(g, OF.pal, e, info); return; }
    if (e.mode !== 'sit') return;
    switch (e.role) {
      case 'type': dlvTapeBox(g, c, e, info); break;
      case 'plan': dlvStack(g, c, info, 3); break;
      case 'mcp': dlvStack(g, c, info, 1); break;
      case 'read': case 'web': dlvPhone(g, c, e, info); break;
      case 'delegate': dlvClipboard(g, c, info); break;
      case 'rest': dlvBikeParked(g, OF.pal, info); break;
      default: dlvStack(g, c, info, 1); break;
    }
  },

  /** Đèn giao thông ở mép phải mỗi con đường. Đây là thứ duy nhất trong nền có nhúc nhích,
   *  nên nó phải nằm ngoài nền đã nướng - và phải khai vào `sceneSig`, nếu không đèn đứng
   *  im mỗi khi cả khu phố vắng xe. */
  drawAnimated(g, p) {
    const c = dpal(p);
    const phase = Math.floor(OF.clock / 2.5) % 3;
    [0, 1].forEach((row) => {
      const x = ROOM_W - 9;
      const y = DLV_ROAD_Y[row] - 16;
      px2(g, x + 2, y + 8, 1, 10, c.lampPost);
      px2(g, x, y, 5, 9, c.roadDark);
      ['#d9534f', '#e8a33d', '#7bd88f'].forEach((col, i) => {
        px2(g, x + 1, y + 1 + i * 3, 3, 2, phase === i ? col : darken(col, 0.62));
      });
    });
  },

  ambient() {
    return [
      {
        x: 150, y: DLV_LANE - 2, tx: 150, ty: DLV_LANE - 2, wait: 2,
        speed: 20, restMin: 2, restVar: 5, draw: dlvDog,
        pick: () => ({ x: 40 + Math.random() * (ROOM_W - 80), y: DLV_LANE - 3 + Math.random() * 3 }),
      },
      {
        x: 70, y: DLV_LANE, tx: 70, ty: DLV_LANE, wait: 1,
        speed: 13, restMin: 1.5, restVar: 3.5, draw: dlvBird,
        pick: () => ({ x: 40 + Math.random() * (ROOM_W - 80), y: DLV_LANE + Math.random() * 4 }),
      },
      {
        x: 200, y: DLV_LANE + 2, tx: 200, ty: DLV_LANE + 2, wait: 3,
        speed: 12, restMin: 2, restVar: 4, draw: dlvBird,
        pick: () => ({ x: 40 + Math.random() * (ROOM_W - 80), y: DLV_LANE + 1 + Math.random() * 3 }),
      },
    ];
  },

  /** Đèn giao thông và số thùng hàng nằm ngoài mọi thứ lõi biết. Quên khai là đèn đứng im và
   *  chồng thùng không đổi khi agent bận thêm việc. */
  sceneSig() {
    let s = String(Math.floor(OF.clock / 2.5) % 3);
    OF.ents.forEach((e) => {
      if (e.mode === 'ride') s += ',' + ((e.data || {}).pending_more || 0);
    });
    return s;
  },
});
