/* Bối cảnh Nông trại v2 — 16x16, nghề nông làm việc trên luống, động vật ambient. Bố cục
 * cắt từ ảnh mẫu FARM SCENE của người dùng (xem spec mục "Bố cục").
 *
 * KHÁC scene-farm (16x20 dùng chung pack): scene này có `fixedChars: true` — nhân vật là
 * nông dân 16x16 trong sprites-farm.js, không dùng pack nào, nên bảng chọn bộ, dãy đổi nhân
 * vật và bảng chọn kiểu nền đều ẩn đi. Một "kiểu nền" duy nhất có id trùng với scene để CI
 * lọc nó khỏi danh sách kiểu nền. */

const F2_ROW_Y = [70, 116];          // y của dãy LUỐNG (mặt đất cày), 2 dãy x 5
const F2_PLOT_X = [40, 70, 100, 130, 160];
const F2_PLOT_W = 26, F2_PLOT_H = 12;
const F2_AISLE_Y = [96, 142];        // lối ngang, mỗi dãy một lối NẰM DƯỚI dãy đó (y hệt bản
                                     // cũ của scene-farm: chỗ đứng y+5, lối ở y+26)
const F2_CORRIDOR_X = [2, 244];       // bờ dọc sát mép (KHÔNG vẽ cột rào ở đây, agent đi qua)
const F2_FENCE_Y = 168;              // hàng rào dưới

/* Bảng màu nền. KHÔNG phụ thuộc theme: trang trại tối/sáng như bản cũ của scene-farm và bám
 * đúng màu trong ảnh mẫu của người dùng. Vì thế `labelColor` phải tính theo độ sáng của
 * chính bảng màu này, không phải theo `--of-label` hay theme. */
function f2pal() {
  return {
    grass: '#6fae4f', grass2: '#5d9a42', grassDark: '#4d8438',
    soil: '#8a6a45', soilDark: '#6f5232', soilLight: '#a07b52',
    wood: '#8a5a2b', woodDark: '#5d3a1c', woodLight: '#b07b4a',
    roof: '#4a90d9', roofDark: '#3d5a80', coopRed: '#c4553f', coopRedDark: '#8f3327',
    stone: '#9aa5b1', stoneDark: '#6f7a85', straw: '#e0c050', hay: '#d9b26a',
    water: '#4a90d9', crop: '#4caf50', cropRipe: '#e0c050', dark: '#1f2a1c',
    fence: '#b07b4a', fenceDark: '#5d3a1c',
  };
}
const F2_LIGHT = (p) => (toRgb(p.grass)[0] * 0.3 + toRgb(p.grass)[1] * 0.6 + toRgb(p.grass)[2] * 0.1) > 130;

/* Hình dạng chỗ PHẢI theo khuôn scene-farm (`farmStations`): có `id`, `row` (bands lọc theo
 * row), `seatX/seatY` (chỗ đứng), `box` (kẻ viền lúc hover/chọn), labelX/bubbleY/nameY. */
function f2Stations() {
  const out = [];
  F2_ROW_Y.forEach((y, row) => {
    F2_PLOT_X.forEach((x) => {
      out.push({
        id: 'f2.' + row + '.' + x,
        x, y, row,
        seatX: x + F2_PLOT_W / 2 - 1,
        seatY: y + 5,
        box: { x: x - 2, y: y - 12, w: F2_PLOT_W + 4, h: F2_PLOT_H + 24 },
        labelX: x + F2_PLOT_W / 2,
        bubbleY: y + 2,
        nameY: y + F2_PLOT_H + 21,   // 12 pixel dưới chân (chân ở seatY+16 = y+21), y hệt scene-farm
      });
    });
  });
  return out;
}

function f2SeatOf(e, st) {
  return { x: st.seatX, y: st.seatY };
}

function f2Route(e, tx, ty, seat) {
  if (seat && e.station === seat && e.mode === 'sit'
      && e.x >= seat.x - 2 && e.x <= seat.x + F2_PLOT_W) {
    e.path = [{ x: tx, y: ty }];
    return;
  }
  const path = [];
  const curAisle = e.y < F2_ROW_Y[1] ? F2_AISLE_Y[0] : F2_AISLE_Y[1];
  const dstAisle = ty < F2_ROW_Y[1] ? F2_AISLE_Y[0] : F2_AISLE_Y[1];
  if (e.mode === 'sit') path.push({ x: e.x, y: curAisle });
  if (curAisle !== dstAisle) {
    const cx = Math.abs(e.x - F2_CORRIDOR_X[0]) < Math.abs(e.x - F2_CORRIDOR_X[1])
      ? F2_CORRIDOR_X[0] : F2_CORRIDOR_X[1];
    path.push({ x: cx, y: curAisle });
    path.push({ x: cx, y: dstAisle });
  }
  path.push({ x: tx, y: dstAisle });
  path.push({ x: tx, y: ty });
  e.path = path;
}

function f2Behave(e, dt, d) {
  if (d.state === 'wander') {
    if (e.goal === 'station' || e.goal === 'spot') sendWandering(e);
    else if (e.mode === 'idle' && Math.random() < dt * 0.35) {
      const w = CS().wanderTarget(e);
      e.mode = 'walk';
      e.path = [{ x: w.x, y: w.y }];
    }
    return;
  }
  if (!e.station) return;
  if (e.goal !== 'station') { sendToStation(e, e.station); return; }
  if (e.mode !== 'sit') return;
  const want = f2SeatOf(e, e.station);
  if (Math.abs(e.x - want.x) > 0.5) sendToStation(e, e.station);
}

/* Bảng ánh xạ công việc → frame 16x16. Khoá là ACTION key do backend chốt
 * (aimon/office.py:45-66): type/read/run/web/delegate/plan/mcp/work/rest — không có `write`
 * hay `grep`. Edit và Write cùng thành `type`; phân biệt Write→PLANT bằng tên tool thô. */
const F2_ROLE_MAP = {
  type: 'hoe',            // Edit → HOE (cuốc đất = sửa code)
  read: 'harvest',        // Read/Grep → HARVEST (gặt lúa = thu thập thông tin)
  run: 'axe',             // Bash → AXE (chặt cây = chạy lệnh mạnh)
  delegate: 'interact',   // Task/Agent → INTERACT (giao việc = tương tác)
  mcp: 'fish',            // MCP → FISHING (lấy dữ liệu từ xa)
  web: 'fish',            // Browser → FISHING
  plan: 'water', work: 'water', rest: 'water',   // Rảnh/khác → WATER
};

/* True khi việc đang chạy là tool viết file (Write/MultiEdit/NotebookEdit) — chúng cùng action
 * `type` với Edit, nên phải soi tên tool thô để cho đúng vai PLANT (gieo hạt = tạo mới). */
function f2IsWrite(e) {
  const tool = (e.data && e.data.tool) || '';
  return tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit';
}

function f2FrameFor(e) {
  if (e.cheer > 0) return Math.floor(e.anim * 9) % 2 ? 'd1' : 'd2';
  if (e.path.length) return null;                       // đi bộ: để lõi chọn d*/u*/s*
  if (e.mode !== 'sit') return 'd0';
  if (f2IsWrite(e)) return 'plant';
  const act = currentAction(e);
  return F2_ROLE_MAP[act] || 'water';
}

/* Nền nướng 260x176 cắt từ ảnh FARM SCENE: nhà gỗ mái xanh (trái), chuồng đỏ + tháp đá
 * (phải), cây + giếng trang trí, 2 luống lớn, hàng rào gỗ trên/dưới. Luống vẽ đất ở đây,
 * cây trồng vẽ ở f2DrawStation (để ở trước người). */
function f2DrawStatic(g, p, roomId) {
  const f = f2pal();
  px2(g, 0, 0, 260, 176, f.grass);                      // nền cỏ
  drawF2House(g, f, 14, 30);                            // nhà gỗ mái xanh (trái)
  drawF2Coop(g, f, 196, 34);                            // chuồng đỏ
  drawF2Tower(g, f, 236, 26);                           // tháp đá (phải cùng)
  drawF2Tree(g, f, 176, 22);  drawF2Tree(g, f, 88, 20); // cây trang trí
  drawF2Well(g, f, 128, 30);                            // giếng giữa trang trí trên
  // Hai luống đất lớn (nền đất) — phần cây trồng vẽ ở f2DrawStation
  px2(g, 28, F2_ROW_Y[0] - 4, 204, F2_PLOT_H + 8, f.soil);
  px2(g, 28, F2_ROW_Y[1] - 4, 204, F2_PLOT_H + 8, f.soil);
  px2(g, 28, F2_ROW_Y[0] - 4, 204, 1, f.soilLight);
  px2(g, 28, F2_ROW_Y[1] - 4, 204, 1, f.soilLight);
  // Hai lối ngang (mỗi dãy một lối NẰM DƯỚI dãy đó — xem F2_AISLE_Y)
  F2_AISLE_Y.forEach((ay) => {
    px2(g, 0, ay, 260, 8, f.grass2);
    px2(g, 0, ay + 7, 260, 1, f.grassDark);
  });
  // Hàng rào gỗ BAO QUANH (ngang trên/dưới). KHÔNG có cột dọc ở x=0/258: bờ dọc (F2_CORRIDOR_X)
  // là chỗ agent đi khi đổi dãy, vẽ cột vào đó là người đi xuyên qua hàng rào.
  drawF2FenceRow(g, f, 0);   // trên
  drawF2FenceRow(g, f, F2_FENCE_Y);  // dưới
}

function drawF2FenceRow(g, f, y) {
  for (let x = 0; x < 260; x += 16) {
    px2(g, x, y + 1, 14, 2, f.woodLight);
    px2(g, x + 1, y + 4, 1, 4, f.woodDark);
    px2(g, x + 12, y + 4, 1, 4, f.woodDark);
  }
  px2(g, 0, y + 1, 260, 1, f.wood);
}

function drawF2House(g, f, x, y) {
  // Tường gỗ
  px2(g, x, y, 34, 24, f.wood);
  px2(g, x, y, 34, 2, f.woodLight);
  px2(g, x, y + 22, 34, 2, f.woodDark);
  // Mái xanh (hai nửa dốc)
  px2(g, x - 4, y - 8, 42, 4, f.roofDark);
  px2(g, x - 2, y - 6, 38, 6, f.roof);
  px2(g, x - 2, y - 6, 38, 1, lighten(f.roof, 0.15));
  // Cửa + cửa sổ
  px2(g, x + 12, y + 12, 8, 12, f.woodDark);
  px2(g, x + 14, y + 14, 4, 6, f.dark);
  px2(g, x + 3, y + 6, 6, 6, f.straw);
  px2(g, x + 24, y + 6, 6, 6, f.straw);
}

function drawF2Coop(g, f, x, y) {
  // Thân chuồng đỏ
  px2(g, x, y + 6, 30, 22, f.coopRed);
  px2(g, x, y + 6, 30, 2, lighten(f.coopRed, 0.15));
  px2(g, x, y + 26, 30, 2, f.coopRedDark);
  // Mái
  px2(g, x - 4, y, 38, 6, f.coopRedDark);
  px2(g, x - 2, y + 2, 34, 4, f.coopRed);
  // Cửa chuồng + cửa sổ
  px2(g, x + 12, y + 14, 6, 12, f.woodDark);
  px2(g, x + 4, y + 12, 4, 4, f.stoneDark);
  px2(g, x + 22, y + 12, 4, 4, f.stoneDark);
}

function drawF2Tower(g, f, x, y) {
  // Tháp đá
  px2(g, x, y + 4, 12, 26, f.stone);
  px2(g, x, y + 4, 2, 26, lighten(f.stone, 0.15));
  px2(g, x + 10, y + 4, 2, 26, f.stoneDark);
  px2(g, x - 2, y, 16, 5, f.stoneDark);
  px2(g, x, y + 2, 12, 3, f.stone);
  px2(g, x + 4, y + 16, 4, 5, f.stoneDark);           // cửa
}

function drawF2Well(g, f, x, y) {
  px2(g, x - 3, y + 2, 20, 8, f.stone);
  px2(g, x - 3, y + 2, 20, 2, lighten(f.stone, 0.15));
  px2(g, x - 1, y - 8, 2, 10, f.wood);
  px2(g, x + 13, y - 8, 2, 10, f.wood);
  px2(g, x - 1, y - 8, 16, 2, f.woodLight);           // xà ngang
}

function drawF2Tree(g, f, x, y) {
  px2(g, x + 3, y + 6, 4, 12, f.wood);
  px2(g, x, y, 10, 8, '#4caf50');
  px2(g, x + 1, y + 1, 8, 6, lighten('#4caf50', 0.12));
  px2(g, x + 3, y - 2, 4, 3, darken('#4caf50', 0.2));
}

/* Cây trồng không lớn dần (YAGNI — spec đã duyệt), vẽ tĩnh ở mỗi luống. Chú ý: `drawStation`
 * được lõi gọi với `(g, st, ent)` — tham số 3 là **entity** đang ngồi chỗ đó (hoặc undefined
 * khi trống), không phải chỉ số chỗ. Đừng dùng nó để tính toán, chỉ vẽ theo `st`. */
function f2DrawStation(g, st) {
  const f = f2pal();
  // Cây trồng trang trí ở giữa luống, so le theo cột để không trông như dán sẵn
  const px = st.x + 5 + ((st.x / 30) | 0) % 3;
  const py = st.y + 4;
  px2(g, px, py, 4, 6, f.crop);
  px2(g, px + 1, py - 1, 2, 1, lighten(f.crop, 0.15));
  px2(g, px, py + 5, 4, 1, f.soilDark);
}

function f2Ambient() {
  const out = [];
  const animals = [
    { draw: drawChickenFarm, tones: ['#f5efe0', '#e6d3ae', '#f0e6d2'], y: F2_AISLE_Y[1] },
    { draw: drawCowFarm, tones: ['#e8e0d0', '#d8cfc0'], y: F2_AISLE_Y[0] },
    { draw: drawPigFarm, tones: ['#f0c8c0', '#e6b8b0'], y: F2_AISLE_Y[1] },
    { draw: drawSheepFarm, tones: ['#f2f0ea', '#e6e0d8'], y: F2_AISLE_Y[0] },
  ];
  animals.forEach((a, ai) => {
    const x = 30 + ai * 62;
    out.push({
      x, y: a.y, tx: x, ty: a.y, wait: 1 + ai,
      speed: 11, restMin: 2.5, restVar: 4, tone: a.tones[ai % a.tones.length], draw: a.draw,
      pick: () => ({ x: 12 + Math.random() * (ROOM_W - 40), y: a.y + Math.random() * 4 }),
    });
  });
  return out;
}

/* Định dạng bắt buộc để CI đọc được: `registerScene({` rồi **dòng tiếp theo** `id: 'farm2',`
 * và `stationCount: 10,`. */
registerScene({
  id: 'farm2',
  stationCount: 10,          // 2 dãy x 5 luống - xem MIN_STATIONS
  fixedChars: true,          // hệ 16x16 riêng: bỏ bảng chọn bộ và dãy đổi nhân vật
  snap: true,                // nền nướng ở pixel gốc (px2), nông dân phải đứng đúng pixel
  legendSuffix: 'farm',      // dùng lại chú thích nông trại (cày, gặt, bổ củi...) của scene-farm
  rooms: [{ id: 'farm2', draw: () => {} }],   // một "kiểu nền" duy nhất; id trùng scene nên
                                              // CI lọc nó khỏi danh sách kiểu nền (xem build-vscode.yml)
  defaultRoom: 'farm2',

  stations: f2Stations,
  seatOf: f2SeatOf,
  route: f2Route,
  behave: f2Behave,
  entry: () => ({ x: -20, y: F2_AISLE_Y[1] }),
  exit: () => ({ x: -22, y: F2_AISLE_Y[1] }),
  wanderTarget: () => ({
    x: 14 + Math.random() * (ROOM_W - 44),
    y: F2_AISLE_Y[1] + Math.random() * 8,
  }),
  bands: () => [
    { row: 0, lo: -Infinity, hi: F2_ROW_Y[1] },
    { row: 1, lo: F2_ROW_Y[1], hi: Infinity },
  ],
  labelColor: () => (F2_LIGHT(f2pal()) ? '#1d2b1c' : '#f2f6ec'),
  shadowFor: () => true,
  frameFor: f2FrameFor,
  charIndexFor: (id) => slotFor(id) % FARMER_CHARS.length,   // index theo chỗ vào FARMER_CHARS
  drawStatic: f2DrawStatic,
  drawStation: f2DrawStation,
  ambient: f2Ambient,
});
