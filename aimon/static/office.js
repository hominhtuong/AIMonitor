/* Khung nhìn Văn phòng: mỗi agent AI là một nhân vật trong một căn phòng pixel.
 *
 * Đang làm việc thì ngồi vào bàn và diễn đúng việc đang làm (gõ phím khi sửa file, đọc tài
 * liệu khi tìm kiếm, quay sang terminal khi chạy lệnh). Rảnh lâu thì đứng dậy đi vòng vòng.
 * Bấm vào máy tính của ai thì mở ra toàn bộ cây tiến trình và chi tiết phiên của người đó.
 *
 * Ba điều bắt buộc phải giữ:
 *
 * 1. **Canvas nằm ngoài tầm với của morph().** app.js so DOM mỗi lần làm mới và thay phần
 *    khác nhau. Để canvas vào một vùng do render() quản lý thì cứ 3 giây nó bị thay bằng
 *    canvas mới: mất context, mất toàn bộ vị trí nhân vật, hoạt cảnh giật về đầu. Trong
 *    index.html canvas nằm riêng, chỉ có #office-detail là vùng động.
 *
 * 2. **Phóng to theo bội số nguyên.** Pixel art phóng theo số lẻ là nhoè. Kích thước canvas
 *    luôn là ROOM_W * scale, không phải bề rộng của khung chứa; phần thừa để CSS căn giữa.
 *
 * 3. **Không tự bật vòng vẽ khi tab đang ẩn.** requestAnimationFrame ở tab ẩn bị trình duyệt
 *    treo, nhưng setInterval thì không - để nguyên là vẫn gọi /api/pulse mỗi giây trong khi
 *    không ai nhìn.
 */

/* Kích thước phòng tính bằng pixel gốc. Mọi toạ độ trong file này đều là pixel gốc. */
const ROOM_W = 260;
const ROOM_H = 176;
const WALL_H = 26;

const DESK_W = 34;
const DESK_H = 11;
const MON_W = 18;
const MON_H = 13;

const ROW_Y = [46, 104];            // mép trên hai dãy bàn
// Lối đi phải nằm THẤP HƠN dòng tên của dãy bàn ngay trên nó (tên ở ROW_Y + 42), nếu không
// người đi vòng vòng cứ đứng chồng lên tên đồng nghiệp đang ngồi.
const AISLE_Y = [78, 148];
const CORRIDOR_X = [1, 243];        // hai lối dọc sát tường, không cắt qua bàn nào
// 5 bàn mỗi dãy chứ không phải 6: khe giữa hai bàn phải đủ rộng cho sub-agent đứng cạnh
// người gọi nó (14 pixel, vừa một nhân vật vẽ ở tỷ lệ 0.8). Nhồi 6 bàn thì khe còn 4 pixel
// và sub-agent đứng đè sang bàn hàng xóm, nhìn không biết nó của ai.
const DESK_X = [16, 64, 112, 160, 208];

const WALK_SPEED = 26;              // pixel gốc / giây
const BURST_SEC = 0.55;             // một sự kiện đã trôi qua được diễn trong ngần này giây
const PULSE_MS = 1000;

/* Màu theo hoạt cảnh - dùng cho màn hình máy tính, chấm trạng thái và bong bóng thoại.
 * Khoá `action` do backend chốt ở aimon/office.py, đừng tự thêm khoá mới ở đây. */
const ACTION_COLOR = {
  type: '#4f8ef7',
  read: '#2fae86',
  run: '#f0a534',
  web: '#8b5cf6',
  delegate: '#e5615f',
  plan: '#5ec2d9',
  mcp: '#d95fa8',
  work: '#94a3b8',
  rest: '#64748b',
};

const OF = {
  ready: false,
  on: false,
  canvas: null,
  ctx: null,
  atlas: null,
  scale: 3,
  dpr: 1,
  timer: null,
  raf: null,
  since: 0,
  hidden: 0,
  err: '',
  ents: new Map(),
  desks: [],
  sel: null,
  hover: null,
  cat: null,
  last: 0,
  clock: 0,
  pal: {},
};

/* ------------------------------------------------------------- bố cục phòng */

function buildDesks() {
  const out = [];
  ROW_Y.forEach((y, row) => {
    DESK_X.forEach((x) => {
      out.push({
        x, y, row,
        seatX: x + (DESK_W - SPRITE_W) / 2,
        seatY: y + 5,                       // đầu nhô lên che mép dưới của bàn
        monX: x + (DESK_W - MON_W) / 2,
        monY: y - MON_H,
        // Chỗ đứng cho sub-agent: ngay cạnh bàn của người gọi nó, để nhìn là biết của ai
        helpers: [
          { x: x - 15, y: y + 16 },
          { x: x + DESK_W + 1, y: y + 16 },
        ],
      });
    });
  });
  return out;
}

/** Màu phòng lấy từ biến CSS nên nền sáng / nền tối dùng chung một đoạn code vẽ. */
function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const g = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  return {
    floor: g('--of-floor', '#243247'),
    floor2: g('--of-floor2', '#1f2c3f'),
    wall: g('--of-wall', '#2f3f57'),
    wallDark: g('--of-wall2', '#26344a'),
    sky: g('--of-sky', '#7fb2e5'),
    desk: g('--of-desk', '#8a6144'),
    deskDark: g('--of-desk2', '#6b4a34'),
    screen: g('--of-screen', '#0d1626'),
    screenOn: g('--of-screen-on', '#1c3352'),
    metal: g('--of-metal', '#4a5769'),
    rug: g('--of-rug', '#334a63'),
    plant: g('--of-plant', '#2f8f5b'),
    shadow: g('--of-shadow', 'rgba(0,0,0,.22)'),
    bubble: g('--of-bubble', '#0f172a'),
    bubbleFg: g('--of-bubble-fg', '#e2e8f0'),
    // Tên bàn viết thẳng lên sàn nên phải tương phản với SÀN, không dùng chung màu với
    // chữ trong bong bóng (bong bóng có nền tối riêng ở cả hai theme).
    label: g('--of-label', '#e2e8f0'),
    outline: g('--of-outline', '#16202f'),
  };
}

/* ------------------------------------------------------------- thực thể */

function newEntity(id, kind, charIndex) {
  return {
    id, kind,                    // kind: 'agent' | 'sub'
    charIndex,
    x: -20, y: AISLE_Y[1],       // sinh ra ngoài cửa, đi vào sau
    dir: 'right',
    mode: 'enter',
    // Vừa được cử đi ĐÂU. Bắt buộc phải có, không suy ra được từ `desk`: người rời bàn đi
    // vòng vòng vẫn giữ chỗ, nên "có bàn" không có nghĩa là "đang ngồi ở bàn".
    goal: 'enter',
    path: [],
    desk: null,
    spot: null,
    anim: Math.random() * 10,    // lệch pha nhau, nếu không cả phòng gõ phím cùng nhịp
    burst: null,
    queue: [],
    data: null,
    leaving: false,
  };
}

/** Đường đi từ vị trí hiện tại tới đích, luôn men theo lối đi thay vì xuyên qua bàn. */
function routeTo(e, tx, ty) {
  const path = [];
  const curAisle = e.y < ROW_Y[1] ? AISLE_Y[0] : AISLE_Y[1];
  const dstAisle = ty < ROW_Y[1] ? AISLE_Y[0] : AISLE_Y[1];

  if (e.mode === 'sit') path.push({ x: e.x, y: curAisle });   // lùi ghế ra lối đi trước
  if (curAisle !== dstAisle) {
    // Đổi dãy thì phải vòng qua lối dọc sát tường, đi thẳng là xuyên qua dãy bàn ở giữa
    const cx = Math.abs(e.x - CORRIDOR_X[0]) < Math.abs(e.x - CORRIDOR_X[1])
      ? CORRIDOR_X[0] : CORRIDOR_X[1];
    path.push({ x: cx, y: curAisle });
    path.push({ x: cx, y: dstAisle });
  }
  path.push({ x: tx, y: dstAisle });
  path.push({ x: tx, y: ty });
  e.path = path;
}

function sendToDesk(e, desk) {
  e.desk = desk;
  e.goal = 'desk';
  e.mode = 'walk';
  routeTo(e, desk.seatX, desk.seatY);
}

function sendToSpot(e, spot) {
  e.spot = spot;
  e.goal = 'spot';
  e.mode = 'walk';
  routeTo(e, spot.x, spot.y);
}

function sendWandering(e) {
  const w = wanderTarget();
  e.goal = 'wander';
  e.mode = 'walk';
  routeTo(e, w.x, w.y);
}

function wanderTarget() {
  return {
    x: 14 + Math.random() * (ROOM_W - 44),
    y: AISLE_Y[1] + Math.random() * 8,
  };
}

/* ------------------------------------------------------------- đồng bộ dữ liệu */

/** Gắn agent từ /api/pulse vào các thực thể đang có trong phòng. */
function syncAgents(payload) {
  const seen = new Set();
  const used = new Set();

  // Giữ nguyên bàn cũ trước, rồi mới chia bàn trống cho người mới: đảo bàn mỗi lần làm
  // mới thì cả phòng đứng dậy đổi chỗ liên tục, không ai theo dõi nổi.
  OF.ents.forEach((e) => { if (e.desk && !e.leaving) used.add(e.desk); });

  payload.agents.forEach((a) => {
    seen.add(a.id);
    let e = OF.ents.get(a.id);
    if (!e) {
      e = newEntity(a.id, 'agent', charIndexOf(a.id));
      OF.ents.set(a.id, e);
    }
    e.data = a;
    e.leaving = false;
    if (!e.desk) {
      const free = OF.desks.find((d) => !used.has(d));
      if (free) { used.add(free); sendToDesk(e, free); }
    }

    // Sub-agent: mỗi cái một chỗ đứng cạnh bàn của người gọi nó
    (a.subagents || []).slice(0, 2).forEach((sub, i) => {
      seen.add(sub.id);
      let se = OF.ents.get(sub.id);
      if (!se) {
        se = newEntity(sub.id, 'sub', charIndexOf(sub.id));
        OF.ents.set(sub.id, se);
      }
      se.data = { ...sub, state: 'busy', action: 'work', parent: a.id };
      se.leaving = false;
      if (!se.spot && e.desk) sendToSpot(se, e.desk.helpers[i]);
    });
  });

  // Ai không còn trong danh sách thì đi ra cửa rồi biến mất
  OF.ents.forEach((e, id) => {
    if (seen.has(id) || e.leaving) return;
    e.leaving = true;
    e.desk = null;
    e.spot = null;
    e.goal = 'exit';
    e.mode = 'walk';
    routeTo(e, -22, AISLE_Y[1]);
  });
}

/** Sự kiện đã trôi qua giữa hai lần đọc: xếp hàng để diễn lại, không bỏ sót tool ngắn. */
function queueEvents(events) {
  events.forEach((ev) => {
    if (ev.kind !== 'tool' || !ev.tool) return;
    const e = OF.ents.get(ev.session);
    if (!e || e.leaving) return;
    if (e.queue.length < 6) e.queue.push(action_of_js(ev.tool));
  });
}

/** Bản JS của aimon/office.py:action_of, chỉ dùng cho sự kiện phát lại. */
function action_of_js(tool) {
  const map = {
    Edit: 'type', Write: 'type', MultiEdit: 'type', NotebookEdit: 'type',
    Read: 'read', Glob: 'read', Grep: 'read', LS: 'read', NotebookRead: 'read',
    Bash: 'run', BashOutput: 'run', KillBash: 'run', KillShell: 'run',
    WebFetch: 'web', WebSearch: 'web',
    Task: 'delegate', Agent: 'delegate',
    TodoWrite: 'plan', ExitPlanMode: 'plan', EnterPlanMode: 'plan',
  };
  if (map[tool]) return map[tool];
  if (String(tool).toLowerCase().startsWith('mcp__')) return 'mcp';
  return 'work';
}

/** Hoạt cảnh đang phải diễn: việc đang chạy > sự kiện phát lại > nghỉ. */
function currentAction(e) {
  const d = e.data || {};
  if (d.state === 'busy' && d.action && d.action !== 'rest') return d.action;
  if (e.burst) return e.burst.action;
  return 'rest';
}

/* ------------------------------------------------------------- cập nhật mỗi khung hình */

function step(e, dt) {
  e.anim += dt;

  if (e.burst) {
    e.burst.left -= dt;
    if (e.burst.left <= 0) e.burst = null;
  }
  if (!e.burst && e.queue.length) e.burst = { action: e.queue.shift(), left: BURST_SEC };

  if (e.path.length) {
    const wp = e.path[0];
    const dx = wp.x - e.x, dy = wp.y - e.y;
    const dist = Math.hypot(dx, dy);
    const move = WALK_SPEED * dt;
    if (dist <= move) {
      e.x = wp.x; e.y = wp.y;
      e.path.shift();
      if (!e.path.length) {
        if (e.leaving) { OF.ents.delete(e.id); return; }
        // Theo ĐÍCH vừa tới, không theo việc có sở hữu bàn hay không. Lấy `e.desk` làm căn
        // cứ thì người vừa đi vòng vòng xong sẽ chuyển sang tư thế ngồi ngay giữa lối đi,
        // và kẹt luôn ở đó vì nhánh "quay về bàn" chỉ chạy khi chưa ngồi.
        e.mode = (e.goal === 'desk' || e.goal === 'spot') ? 'sit' : 'idle';
      }
    } else {
      e.x += dx / dist * move;
      e.y += dy / dist * move;
      e.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    return;
  }

  const d = e.data || {};
  if (e.kind !== 'agent') return;

  if (d.state === 'wander') {
    // Rảnh lâu thì rời bàn đi vòng vòng, nhưng VẪN GIỮ CHỖ để lát nữa quay lại đúng bàn cũ
    if (e.goal === 'desk' || e.goal === 'spot') {
      sendWandering(e);
    } else if (e.mode === 'idle' && Math.random() < dt * 0.35) {
      // Đứng một lát rồi lại đi tiếp, không cần vòng qua lối dọc vì vẫn quanh quẩn khu này
      const w = wanderTarget();
      e.mode = 'walk';
      e.path = [{ x: w.x, y: w.y }];
    }
  } else if (e.desk && e.goal !== 'desk') {
    sendToDesk(e, e.desk);        // có việc trở lại thì về bàn
  }
}

function tick(now) {
  OF.raf = null;
  if (!OF.on) return;
  const dt = Math.min(0.1, OF.last ? (now - OF.last) / 1000 : 0.016);
  OF.last = now;
  OF.clock += dt;

  Array.from(OF.ents.values()).forEach((e) => step(e, dt));
  stepCat(dt);
  draw();
  OF.raf = requestAnimationFrame(tick);
}

/* ------------------------------------------------------------- con mèo */

function stepCat(dt) {
  const c = OF.cat;
  if (!c) return;
  c.anim += dt;
  c.wait -= dt;
  if (c.wait > 0) return;
  const dx = c.tx - c.x, dy = c.ty - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) {
    c.tx = 16 + Math.random() * (ROOM_W - 48);
    c.ty = AISLE_Y[1] + 4 + Math.random() * 10;
    c.wait = 1 + Math.random() * 4;
    return;
  }
  const move = 14 * dt;
  c.x += dx / dist * move;
  c.y += dy / dist * move;
  c.flip = dx < 0;
}

/* ------------------------------------------------------------- vẽ */

function px2(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

function drawRoom(g) {
  const p = OF.pal;
  // sàn lát ô
  px2(g, 0, WALL_H, ROOM_W, ROOM_H - WALL_H, p.floor);
  for (let y = WALL_H; y < ROOM_H; y += 8) {
    for (let x = ((y / 8) % 2) * 8; x < ROOM_W; x += 16) {
      px2(g, x, y, 8, 8, p.floor2);
    }
  }
  // thảm ở khu đi lại: nền đặc + một đường viền lượn bên trong cho đỡ phẳng
  const rw = ROOM_W - 130;
  px2(g, 60, AISLE_Y[1] + 8, rw, 12, p.rug);
  px2(g, 63, AISLE_Y[1] + 11, rw - 6, 1, p.floor2);
  px2(g, 63, AISLE_Y[1] + 16, rw - 6, 1, p.floor2);

  // tường + cửa sổ + đồng hồ
  px2(g, 0, 0, ROOM_W, WALL_H, p.wall);
  px2(g, 0, WALL_H - 3, ROOM_W, 3, p.wallDark);
  [40, 150].forEach((wx) => {
    px2(g, wx, 5, 46, 15, p.outline);
    px2(g, wx + 1, 6, 44, 13, p.sky);
    px2(g, wx + 22, 6, 1, 13, p.outline);
    px2(g, wx + 1, 12, 44, 1, p.outline);
  });
  px2(g, 118, 6, 12, 12, p.outline);
  px2(g, 119, 7, 10, 10, '#f4f6fb');
  const hand = OF.clock * 0.6;
  px2(g, 124 + Math.round(Math.cos(hand) * 3), 12 + Math.round(Math.sin(hand) * 3), 1, 1, p.outline);

  // cửa ra vào ở mép trái
  px2(g, 0, AISLE_Y[1] - 12, 6, 30, p.deskDark);
  px2(g, 1, AISLE_Y[1] - 10, 4, 26, p.desk);

  // cây cảnh hai góc
  [{ x: 244, y: 32 }, { x: 8, y: 32 }].forEach((c) => {
    px2(g, c.x, c.y + 8, 8, 6, p.deskDark);
    px2(g, c.x + 1, c.y, 6, 9, p.plant);
    px2(g, c.x + 3, c.y - 3, 2, 4, p.plant);
  });
}

/** Một bàn: mặt bàn, chân bàn, màn hình. Màn hình sáng theo việc đang làm. */
function drawDesk(g, desk, ent) {
  const p = OF.pal;
  const act = ent ? currentAction(ent) : null;
  const busy = !!act && act !== 'rest';
  const color = ACTION_COLOR[act || 'rest'];
  // Người đi vòng vòng VẪN giữ bàn, nên `ent` khác null không có nghĩa là đang có người
  // ngồi đó. Màn hình phải theo việc thật sự ngồi vào máy hay không, nếu không sẽ có cảnh
  // bàn sáng đèn mà chủ nhân đang đứng giữa phòng.
  const seated = !!ent && ent.mode === 'sit';

  // Màn hình. Nền của nó là dấu hiệu "bàn này có người hay không" nhìn được từ xa nhất:
  // 10 cái màn hình rải khắp phòng, cái nào sáng là cái đó có chủ. Bản đầu bàn có người mà
  // đang rảnh chỉ vẽ đúng 1 chấm 4x1 pixel lên nền tối - nhìn lướt qua hệt bàn trống, cả
  // phòng trông như không có ai làm việc.
  px2(g, desk.monX, desk.monY, MON_W, MON_H, p.metal);
  px2(g, desk.monX + 1, desk.monY + 1, MON_W - 2, MON_H - 3, seated ? p.screenOn : p.screen);
  if (seated) {
    if (busy) {
      // vài dòng "chữ" chạy - đủ để thấy máy đang làm gì đó mà không cần đọc được
      for (let i = 0; i < 4; i++) {
        const w = 3 + ((Math.floor(OF.clock * 6) + i * 5 + ent.charIndex) % 9);
        px2(g, desk.monX + 2, desk.monY + 2 + i * 2, w, 1, color);
      }
    } else {
      // Rảnh: hai dòng đứng yên, mờ. Có người ngồi đó nhưng không gõ gì.
      px2(g, desk.monX + 3, desk.monY + 4, 7, 1, p.metal);
      px2(g, desk.monX + 3, desk.monY + 7, 4, 1, p.metal);
    }
  }
  px2(g, desk.monX + MON_W / 2 - 1, desk.monY + MON_H - 2, 2, 2, p.metal);

  // mặt bàn
  px2(g, desk.x, desk.y, DESK_W, DESK_H, p.desk);
  px2(g, desk.x, desk.y, DESK_W, 2, p.deskDark);
  px2(g, desk.x + 1, desk.y + DESK_H, 2, 4, p.deskDark);
  px2(g, desk.x + DESK_W - 3, desk.y + DESK_H, 2, 4, p.deskDark);
  // bàn phím
  px2(g, desk.x + 10, desk.y + 4, 14, 4, p.metal);
}

function frameFor(e) {
  const d = e.data || {};
  const walking = e.path.length > 0;
  if (walking) {
    const s = Math.floor(e.anim * 6) % 4;
    const step = s === 1 ? 1 : s === 3 ? 2 : 0;
    if (e.dir === 'up') return 'u' + step;
    if (e.dir === 'down') return 'd' + step;
    return 's' + step;
  }
  if (e.mode !== 'sit') return 'd0';
  if (d.state === 'paused') return 'k3';
  const act = currentAction(e);
  if (act === 'rest') return 'k0';
  if (act === 'read' || act === 'web') return 'k0';   // đọc thì ngồi yên, không gõ
  return Math.floor(e.anim * 7) % 2 ? 'k1' : 'k2';
}

function drawEntity(g, e) {
  const [sx, sy, sw, sh] = OF.atlas.cell(e.charIndex, frameFor(e));
  const flip = e.dir === 'left' && e.path.length;
  const small = e.kind === 'sub';

  px2(g, e.x + 3, e.y + SPRITE_H - 2, 10, 2, OF.pal.shadow);
  g.save();
  if (small) {
    // sub-agent vẽ nhỏ hơn một chút để phân biệt với người gọi nó mà không cần chú thích
    g.translate(e.x + SPRITE_W / 2, e.y + SPRITE_H);
    g.scale(0.8, 0.8);
    g.translate(-SPRITE_W / 2, -SPRITE_H);
    g.drawImage(OF.atlas.canvas, sx, sy, sw, sh, 0, 0, SPRITE_W, SPRITE_H);
  } else if (flip) {
    g.translate(e.x + SPRITE_W, e.y);
    g.scale(-1, 1);
    g.drawImage(OF.atlas.canvas, sx, sy, sw, sh, 0, 0, SPRITE_W, SPRITE_H);
  } else {
    g.drawImage(OF.atlas.canvas, sx, sy, sw, sh, e.x, e.y, SPRITE_W, SPRITE_H);
  }
  g.restore();
}

function drawCatEntity(g) {
  const c = OF.cat;
  if (!c) return;
  const [sx, sy, sw, sh] = OF.atlas.catCell(Math.floor(c.anim * 5) % 2);
  g.save();
  if (c.flip) {
    g.translate(c.x + sw, c.y);
    g.scale(-1, 1);
    g.drawImage(OF.atlas.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  } else {
    g.drawImage(OF.atlas.canvas, sx, sy, sw, sh, c.x, c.y, sw, sh);
  }
  g.restore();
}

/** Bong bóng thoại vẽ ở toạ độ MÀN HÌNH, không phải pixel gốc: chữ ở pixel gốc phóng lên
 *  là một đám răng cưa không đọc được. */
/** Bong bóng + tên bàn. Cả hai là chữ ở cỡ MÀN HÌNH cố định, còn căn phòng thì co theo bậc
 *  phóng - nên ở bậc 1 (panel hẹp của VSCode) một cái tên rộng gấp đôi cái bàn và cả phòng
 *  thành một đống chữ chồng nhau. Bậc đó bỏ chữ đi: màu màn hình đã nói đủ ai đang làm gì,
 *  còn cần biết tên thì bấm vào bàn. */
function drawBubbles(g) {
  if (OF.scale < 2) return;
  g.save();
  g.setTransform(OF.dpr, 0, 0, OF.dpr, 0, 0);
  g.textBaseline = 'middle';
  g.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';

  OF.ents.forEach((e) => {
    const d = e.data || {};
    const act = currentAction(e);
    if (act === 'rest' || e.path.length) return;
    const label = e.kind === 'sub' ? (d.type || 'agent') : (d.tool || '');
    if (!label) return;

    // Người đang ngồi thì treo bong bóng lên phía trên màn hình. Neo theo đầu nhân vật
    // như lúc đứng thì nó đúng vào vùng màn hình và che mất mấy dòng chữ đang chạy.
    const seated = e.mode === 'sit' && e.desk;
    const cx = (seated ? e.desk.x + DESK_W / 2 : e.x + SPRITE_W / 2) * OF.scale;
    const top = (seated ? e.desk.monY - 1 : e.y - 3) * OF.scale;
    const w = g.measureText(label).width + 10;
    const h = 15;
    const x = Math.max(2, Math.min(ROOM_W * OF.scale - w - 2, cx - w / 2));

    g.globalAlpha = 0.92;
    g.fillStyle = OF.pal.bubble;
    roundRect(g, x, top - h, w, h, 4);
    g.fill();
    g.fillStyle = ACTION_COLOR[act] || OF.pal.bubbleFg;
    g.fillRect(x + 3, top - h / 2 - 2, 3, 3);
    g.fillStyle = OF.pal.bubbleFg;
    g.globalAlpha = 1;
    g.fillText(label, x + 9, top - h / 2 + 1);
  });

  // Tên người ngồi ở mỗi bàn, đặt DƯỚI chân nhân vật. Để ngang thân thì chữ đè lên người,
  // mà tên bàn bên cạnh cũng chạm vào nhau - bề rộng một bàn chỉ có 34 pixel gốc.
  g.font = '600 9px system-ui, -apple-system, Segoe UI, sans-serif';
  g.textAlign = 'center';
  OF.ents.forEach((e) => {
    if (e.kind !== 'agent' || !e.desk || e.mode !== 'sit') return;
    const d = e.data || {};
    let name = d.title || d.name || '';
    if (name.length > 15) name = name.slice(0, 14) + '…';
    if (!name) return;
    g.fillStyle = OF.pal.label;
    g.globalAlpha = OF.sel === e.id ? 1 : 0.72;
    // +26 chứ không xa hơn: bong bóng của dãy bàn PHÍA DƯỚI treo ở monY-1, tức 15 pixel
    // màn hình phía trên mép trên màn hình dãy đó. Đẩy tên xuống thêm là hai thứ chồng nhau.
    g.fillText(name, (e.desk.x + DESK_W / 2) * OF.scale, (e.desk.y + DESK_H + 26) * OF.scale);
    g.globalAlpha = 1;
  });
  g.textAlign = 'left';
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Viền quanh bàn đang trỏ vào / đang mở chi tiết. */
function drawDeskMark(g, desk, color, dash) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = 1;
  if (dash) g.setLineDash([2, 2]);
  g.strokeRect(desk.x - 1.5, desk.monY - 1.5, DESK_W + 3, desk.y + DESK_H + 22 - desk.monY);
  g.restore();
}

function draw() {
  const g = OF.ctx;
  const k = OF.scale * OF.dpr;
  g.setTransform(k, 0, 0, k, 0, 0);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, ROOM_W, ROOM_H);

  drawRoom(g);

  const byDesk = new Map();
  OF.ents.forEach((e) => { if (e.desk && e.kind === 'agent') byDesk.set(e.desk, e); });
  const ents = Array.from(OF.ents.values()).sort((a, b) => a.y - b.y);

  [0, 1].forEach((row) => {
    OF.desks.filter((d) => d.row === row).forEach((d) => drawDesk(g, d, byDesk.get(d)));
    const lo = row === 0 ? -Infinity : ROW_Y[1];
    const hi = row === 0 ? ROW_Y[1] : Infinity;
    ents.filter((e) => e.y >= lo && e.y < hi).forEach((e) => drawEntity(g, e));
  });

  drawCatEntity(g);

  if (OF.hover && OF.hover !== OF.sel) {
    const e = OF.ents.get(OF.hover);
    if (e && e.desk) drawDeskMark(g, e.desk, OF.pal.bubbleFg, true);
  }
  if (OF.sel) {
    const e = OF.ents.get(OF.sel);
    if (e && e.desk) drawDeskMark(g, e.desk, ACTION_COLOR[currentAction(e)] || '#fff', false);
  }

  drawBubbles(g);
}

/* ------------------------------------------------------------- kích thước */

function resize() {
  if (!OF.canvas) return;
  const host = OF.canvas.parentElement;
  const avail = Math.max(120, host.clientWidth - 4);
  // Sàn dưới là 1 chứ không phải 2: panel ở activity bar của VSCode chỉ rộng ~300px, ép
  // tối thiểu 2 thì phòng rộng 520px và người dùng phải cuộn ngang mới thấy hết. Nhỏ mà
  // thấy trọn căn phòng vẫn hơn to mà mất một nửa - ai cần nhìn rõ thì mở tab trong editor.
  OF.scale = Math.max(1, Math.min(6, Math.floor(avail / ROOM_W)));
  OF.dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  OF.canvas.width = ROOM_W * OF.scale * OF.dpr;
  OF.canvas.height = ROOM_H * OF.scale * OF.dpr;
  OF.canvas.style.width = (ROOM_W * OF.scale) + 'px';
  OF.canvas.style.height = (ROOM_H * OF.scale) + 'px';
  if (OF.ctx) OF.ctx.imageSmoothingEnabled = false;
  if (OF.on) draw();
}

/* ------------------------------------------------------------- tương tác */

function deskAt(clientX, clientY) {
  const r = OF.canvas.getBoundingClientRect();
  const x = (clientX - r.left) / OF.scale;
  const y = (clientY - r.top) / OF.scale;
  for (const [id, e] of OF.ents) {
    if (e.kind !== 'agent' || !e.desk) continue;
    const d = e.desk;
    // Vùng bấm gộp cả màn hình, mặt bàn và chỗ ngồi - bấm vào đâu trong cụm đó cũng được
    if (x >= d.x - 2 && x <= d.x + DESK_W + 2 && y >= d.monY - 2 && y <= d.y + DESK_H + 22) {
      return id;
    }
  }
  return null;
}

function onMove(ev) {
  const id = deskAt(ev.clientX, ev.clientY);
  if (id !== OF.hover) {
    OF.hover = id;
    OF.canvas.style.cursor = id ? 'pointer' : 'default';
  }
}

function onClick(ev) {
  const id = deskAt(ev.clientX, ev.clientY);
  OF.sel = id === OF.sel ? null : id;   // bấm lại đúng bàn đang mở thì đóng chi tiết
  renderDetail();
}

/* ------------------------------------------------------------- bảng chi tiết */

/** Cây tiến trình + chi tiết phiên của agent đang chọn.
 *
 * Dữ liệu lấy từ S.snap (vòng /api/snapshot vẫn chạy song song) chứ không từ /api/pulse:
 * cây tiến trình đầy đủ là thứ chỉ cần khi người dùng bấm vào, kéo nó theo mỗi giây trong
 * payload hoạt cảnh là phí băng thông cho thứ gần như không ai xem. */
function renderDetail() {
  const host = document.getElementById('office-detail');
  if (!host) return;
  if (!OF.sel || !OF.ents.has(OF.sel)) {
    render('#office-detail', `<div class="empty" data-key="of-none">${t('office.pick_hint')}</div>`);
    return;
  }
  const e = OF.ents.get(OF.sel);
  const d = e.data || {};
  const root = ((S.snap && S.snap.ai) || []).find((r) => r.pid === d.pid);
  const act = currentAction(e);

  const badges = [];
  if (d.model) badges.push(`<span class="badge model">${esc(d.model)}</span>`);
  if (d.branch) badges.push(`<span class="badge branch">${esc(d.branch)}</span>`);
  if (d.mode && d.mode !== 'default') badges.push(`<span class="badge warn">${esc(d.mode)}</span>`);
  if (d.state === 'paused') badges.push(`<span class="badge warn">${t('ai.paused_badge')}</span>`);

  const cells = [
    { v: fmtTok(d.tokens_today || 0), k: t('office.tok_today') },
    { v: money(d.cost_usd || 0), k: t('ai.cost_session') },
    { v: (d.context_pct || 0) + '%', k: t('ai.context') },
    { v: fmtKB(d.rss_tree_kb || 0), k: t('ai.ram_tree_plain') },
    { v: (d.cpu_tree_pct || 0) + '%', k: t('ai.cpu_tree') },
    { v: fmtDur(d.uptime), k: t('ai.runtime') },
  ];

  const doing = d.state === 'busy' && d.brief
    ? `<div class="doing run">${t('ai.doing')}<code>${esc(d.brief)}</code> <span class="el">${fmtDur(d.elapsed)}${d.in_subagent ? t('ai.in_subagent') : ''}</span></div>`
    : `<div class="doing"><span class="idle">${t('office.state_' + (d.state || 'idle'))}${d.idle != null ? ' · ' + fmtDur(d.idle) : ''}</span></div>`;

  const subs = (d.subagents || []).length
    ? `<div class="doing run">${d.subagents.map((s) =>
        `${t('ai.subagent')} <code>${esc(s.type)}</code> ${esc(s.desc)} <span class="el">${fmtDur(s.elapsed)}</span>`).join('<br>')}</div>`
    : '';

  const tree = root && root.children.length
    ? `<div class="kids">${root.children.map((c) => kidRow(c, 0)).join('')}</div>`
    : `<div class="empty">${t('office.no_children')}</div>`;

  render('#office-detail', `<div class="sess ${d.state === 'busy' ? 'active' : ''}" data-key="of-${esc(OF.sel)}">
    <div class="top">
      <span class="st" style="background:${ACTION_COLOR[act] || '#64748b'}"></span>
      <span class="ttl">${esc(d.title || d.name || t('ai.untitled'))}</span>
      <span class="path">${esc(d.cwd || '')}</span>
      ${badges.join(' ')}
      <span class="badge dim">PID ${d.pid}</span>
      <span class="acts">
        <button class="mini" data-act="of-close">${t('office.close')}</button>
        <button class="mini danger" data-act="kill_tree" data-pid="${d.pid}" data-label="${esc(d.title || d.name || '')}"${d.supervisor ? ` data-sup="${esc(d.supervisor)}"` : ''}>${t('btn.kill_tree')}</button>
      </span>
    </div>
    <div class="grid">${cells.map((c) =>
      `<div class="cell"><div class="v" data-flash="1">${esc(c.v)}</div><div class="k">${esc(c.k)}</div></div>`).join('')}</div>
    ${doing}${subs}
    <div class="h2row"><h2>${t('office.tree_title', { n: root ? root.children.length : 0 })}</h2></div>
    ${tree}
  </div>`);
}

/* ------------------------------------------------------------- vòng dữ liệu */

async function loadPulse() {
  if (!OF.on) return;
  try {
    // `kinds` luôn được gửi, kể cả khi rỗng: server phân biệt "không gửi" (không lọc) với
    // "gửi chuỗi rỗng" (người dùng bỏ chọn hết). Lọc ở server chứ không ở đây vì phòng chỉ
    // có 10 chỗ - cắt trước rồi mới lọc thì agent bị ẩn vẫn chiếm suất.
    const r = await fetch('/api/pulse?since=' + encodeURIComponent(OF.since)
      + '&kinds=' + encodeURIComponent(kindsParam()), { cache: 'no-store' });
    const d = await r.json();
    if (d.error) { OF.err = d.error; return; }
    OF.err = '';
    queueEvents(d.events || []);
    syncAgents(d);
    OF.hidden = d.hidden || 0;
    OF.since = d.ts;
    renderStatus();
    if (OF.sel) renderDetail();
  } catch (err) {
    OF.err = err.message;
    renderStatus();
  }
}

/** Chú thích màu. Vẽ từ chính ACTION_COLOR nên thêm hoạt cảnh mới là chú thích tự có. */
function renderLegend() {
  render('#office-legend', `<span data-key="lg-h">${t('office.legend')}</span>` +
    Object.keys(ACTION_COLOR).filter((k) => k !== 'rest').map((k) =>
      `<span data-key="lg-${k}"><i style="background:${ACTION_COLOR[k]}"></i>${esc(t('office.act_' + k))}</span>`
    ).join(''));
}

function renderStatus() {
  // Bỏ người đang đi ra cửa: họ còn trên màn hình thêm vài giây nữa cho hết đường đi, nhưng
  // đếm họ vào thì tắt một loại ở thanh lọc xong con số vẫn y nguyên một lúc - nhìn như
  // bộ lọc không ăn.
  const here = Array.from(OF.ents.values()).filter((e) => e.kind === 'agent' && !e.leaving);
  const n = here.length;
  const busy = here.filter((e) => currentAction(e) !== 'rest').length;
  setText('#office-count', OF.err
    ? t('err.disconnected')
    : t('office.count', { n, busy }) + (OF.hidden ? ' · ' + t('office.hidden', { n: OF.hidden }) : ''));
}

/* ------------------------------------------------------------- bật / tắt */

function officeInit() {
  if (OF.ready) return;
  OF.canvas = document.getElementById('office-canvas');
  if (!OF.canvas) return;
  OF.ctx = OF.canvas.getContext('2d');
  OF.atlas = buildSpriteAtlas();
  OF.desks = buildDesks();
  OF.pal = readPalette();
  OF.cat = { x: 120, y: AISLE_Y[1] + 8, tx: 120, ty: AISLE_Y[1] + 8, wait: 2, anim: 0, flip: false };
  OF.canvas.addEventListener('mousemove', onMove);
  OF.canvas.addEventListener('mouseleave', () => { OF.hover = null; });
  OF.canvas.addEventListener('click', onClick);
  window.addEventListener('resize', resize);
  OF.ready = true;
  resize();
}

function officeStart() {
  officeInit();
  if (!OF.canvas || OF.on) return;
  OF.on = true;
  OF.pal = readPalette();       // theme có thể đã đổi từ lần mở trước
  OF.last = 0;
  resize();
  loadPulse();
  OF.timer = setInterval(loadPulse, PULSE_MS);
  OF.raf = requestAnimationFrame(tick);
  renderLegend();
  renderDetail();
}

function officeStop() {
  OF.on = false;
  if (OF.timer) { clearInterval(OF.timer); OF.timer = null; }
  if (OF.raf) { cancelAnimationFrame(OF.raf); OF.raf = null; }
}

/** Tab đang mở là Văn phòng thì chạy, không thì dừng hẳn - kể cả vòng gọi /api/pulse. */
function officeSync() {
  const pane = document.getElementById('pane-office');
  const visible = !!pane && pane.classList.contains('on') && !document.hidden;
  if (visible) officeStart(); else officeStop();
}

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-act="of-close"]');
  if (b) { OF.sel = null; renderDetail(); }
});
document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => setTimeout(officeSync, 0)));
document.addEventListener('visibilitychange', officeSync);

/** app.js gọi khi người dùng bấm thanh lọc loại agent. Không xoá sạch nhân vật đang có:
 *  `syncAgents` thấy ai không còn trong payload sẽ cho người đó đi ra cửa, nên tắt một loại
 *  là thấy đúng cảnh mấy người đó rời phòng. */
function officeKindsChanged() {
  if (OF.on) loadPulse();
}

/** app.js gọi khi đổi ngôn ngữ hoặc đổi theme, để phòng vẽ lại đúng bảng màu / câu chữ. */
function officeRefresh() {
  if (!OF.ready) return;
  OF.pal = readPalette();
  renderLegend();
  renderStatus();
  renderDetail();
  if (OF.on) draw();
}

officeSync();
