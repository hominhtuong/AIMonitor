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
    water: '#4a90d9', waterDark: '#3d6f9e', crop: '#4caf50', cropRipe: '#e0c050', dark: '#1f2a1c',
    hillFar: '#8fbf56', hillLine: '#7db04a', hillTree: '#6a9e3f',
    path: '#b08a5a', pathDark: '#8a6a45',
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
        // Chỗ đứng của sub-agent: cạnh luống, ngang chỗ nông dân đứng (feet ở y+21).
        helpers: [
          { x: x - 15, y: y + 16 },
          { x: x + F2_PLOT_W + 1, y: y + 16 },
        ],
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

const F2_SWING = 4;           // đảo tư thế mỗi giây (2 chu kỳ/giây) — e.anim là giây
const F2_BLINK_PERIOD = 4;    // giây giữa hai lần nháy
const F2_BLINK_DUR = 0.2;     // giây mỗi lần nháy

/* Tư thế nông dân. Đạo cụ xoay 2 nhịp A/B; `rest` thì cầm bình yên và nháy mắt. `blink` là
 * khung mắt nhắm. `frameFor(e)` trong frameSig() đã chứa kết quả hàm này nên tư thế đổi là
 * lõi tự vẽ lại — không cần thêm móc. Phải RẺ và xác định trong một tick (gọi cả khi tính
 * chữ ký lẫn khi vẽ). */
function f2FrameFor(e) {
  if (e.cheer > 0) return Math.floor(e.anim * 9) % 2 ? 'd1' : 'd2';
  if (e.path.length) return null;                       // đi bộ: để lõi chọn d*, u*, s*
  if (e.mode !== 'sit') return 'd0';
  const act = currentAction(e);
  const base = f2IsWrite(e) ? 'plant' : (F2_ROLE_MAP[act] || 'water');
  if (act === 'rest') {
    const p = e.anim % F2_BLINK_PERIOD;
    return p < F2_BLINK_DUR ? 'blink' : base + 'A';
  }
  return base + (Math.floor(e.anim * F2_SWING) % 2 ? 'B' : 'A');
}

/* Nền nướng 260x176 cắt từ ảnh FARM SCENE: nhà gỗ mái xanh (trái), chuồng đỏ + tháp đá
 * (phải), cây + giếng trang trí, 2 luống lớn, hàng rào gỗ trên/dưới. Luống vẽ đất ở đây,
 * cây trồng vẽ ở f2DrawStation (để ở trước người). */
function f2DrawStatic(g, p, roomId) {
  const f = f2pal();
  px2(g, 0, 0, 260, 176, f.grass);                      // nền cỏ
  drawF2Hills(g, f);                                    // đồi xa — sau cỏ, trước mọi thứ
  drawF2House(g, f, 14, 30);                            // nhà gỗ mái xanh (trái)
  drawF2Coop(g, f, 196, 34);                            // chuồng đỏ
  drawF2Tower(g, f, 236, 26);                           // tháp đá (phải cùng)
  drawF2FruitTree(g, f, 58, 26);  drawF2Tree(g, f, 88, 20);   // vườn cây (2 mới + 2 cũ)
  drawF2FruitTree(g, f, 150, 26); drawF2Tree(g, f, 176, 22);
  drawF2Well(g, f, 128, 30);                            // giếng giữa trang trí trên
  drawF2Hay(g, f);                                      // bó rơm cạnh chuồng
  drawF2Pond(g, f);                                     // ao góc phải dưới
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
  drawF2Path(g, f);         // đường đất — sau lối đi/rào để liên tục
  drawF2Flowers(g, f);      // hoa cỏ — trên cùng, không bị gì che
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

/* Đồi xa — vẽ TRƯỚC mọi thứ khác sau nền cỏ nên nằm sau nhà/cây. Dải lượn sóng + đường chân
 * trời + mấy chỏm cây xa mờ giữa hàng rào trên (y=0..8) và dãy nhà (bắt đầu y≈20). */
function drawF2Hills(g, f) {
  for (let x = 0; x < 260; x += 8) {
    const h = 4 + ((x / 8) % 3);
    px2(g, x, 22 - h, 8, h, f.hillFar);
  }
  px2(g, 0, 22, 260, 1, f.hillLine);
  px2(g, 40, 11, 7, 5, f.hillTree);
  px2(g, 130, 10, 8, 6, f.hillTree);
  px2(g, 212, 11, 6, 5, f.hillTree);
}

/* Đường đất — từ cửa nhà uốn sang lối đi TÂY rồi chạy dọc xuống. KHÔNG cắt qua dải luống
 * (x28..232, y66..82); hai lối đi ngang (y96..104, y142..150) thì cắt qua và VẼ ĐÈ LÊN
 * (vẽ sau cùng nên liên tục). */
function drawF2Path(g, f) {
  px2(g, 22, 44, 18, 5, f.path);
  px2(g, 12, 50, 20, 5, f.path);
  px2(g, 6, 56, 18, 5, f.path);
  px2(g, 4, 61, 6, 80, f.path);
  px2(g, 4, 141, 6, 9, f.path);
  px2(g, 26, 46, 2, 1, f.pathDark);
  px2(g, 16, 52, 1, 2, f.pathDark);
  px2(g, 7, 70, 2, 2, f.pathDark);
  px2(g, 7, 95, 1, 1, f.pathDark);
  px2(g, 7, 120, 2, 1, f.pathDark);
}

/* Hoa + cỏ điểm xuyết — nằm trong dải cỏ (y>150 giữa lối và rào dưới, hay góc trên) nên
 * không đè luống/lối. */
function drawF2Flowers(g, f) {
  const FL = ['#e05a4e', '#f5f5f5', '#f0b830', '#e8a0c8'];
  const spots = [[8, 160], [30, 168], [60, 168], [150, 168], [120, 168], [20, 20], [250, 160], [100, 24]];
  spots.forEach(([sx, sy], i) => {
    px2(g, sx, sy - 2, 1, 2, f.grassDark);
    px2(g, sx - 1, sy - 3, 3, 2, FL[i % FL.length]);
  });
  const tufts = [[14, 164], [46, 166], [240, 162], [80, 169], [250, 90]];
  tufts.forEach(([tx, ty]) => {
    px2(g, tx, ty - 3, 1, 3, f.grassDark);
    px2(g, tx + 1, ty - 4, 1, 4, f.grass);
  });
}

/* Ao nước góc phải dưới (y150..168, dưới lối y142..150, trên rào y168). Gợn sáng lấp lánh
 * vẽ ở f2DrawAnimated (không nướng — phải nhúc nhích). */
function drawF2Pond(g, f) {
  px2(g, 188, 150, 40, 18, f.waterDark);
  px2(g, 190, 152, 36, 14, f.water);
  px2(g, 194, 154, 28, 4, lighten(f.water, 0.12));
  px2(g, 186, 148, 44, 2, f.grassDark);
  px2(g, 186, 148, 2, 22, f.grassDark);
  px2(g, 228, 148, 2, 22, f.grassDark);
  px2(g, 186, 168, 44, 2, f.grassDark);
}

/* Bó rơm cạnh chuồng (chuồng ở x196..226, y34..56) — x160..190, y52..62 là đất trống. */
function drawF2Hay(g, f) {
  px2(g, 160, 52, 14, 10, f.hay);
  px2(g, 160, 52, 14, 2, lighten(f.hay, 0.15));
  px2(g, 160, 60, 14, 2, darken(f.hay, 0.2));
  px2(g, 178, 54, 12, 8, f.hay);
  px2(g, 178, 54, 12, 2, lighten(f.hay, 0.15));
  px2(g, 178, 60, 12, 2, darken(f.hay, 0.2));
}

/* Cây ăn quả — tái dùng drawF2Tree rồi thêm quả đỏ/cam vào tán. */
function drawF2FruitTree(g, f, x, y) {
  drawF2Tree(g, f, x, y);
  px2(g, x + 2, y + 2, 2, 2, '#e05a4e');
  px2(g, x + 6, y + 4, 2, 2, '#e05a4e');
  px2(g, x + 4, y + 1, 2, 2, '#f0b830');
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

/* Nhịp thở: ngồi thì cả thân dịch xuống 1px một khoảnh khắc mỗi ~2 giây. Dùng `bobFor` (hook
 * nhún của lõi, xem scene-delivery bobFor) nên KHÔNG cần sửa office.js. Pha phải trùng đúng
 * `f2SceneSig` để frameSig thấy thay đổi mà vẽ lại. */
const F2_BREATH = () => Math.floor(OF.clock * 4) % 8 === 0 ? 1 : 0;

function f2BobFor(e) {
  return (e.mode === 'sit' && e.kind === 'agent' ? F2_BREATH() : 0);
}

/* Chữ ký riêng của bối cảnh — chỉ những thứ nhúc nhích KHÔNG nằm trong frameSig lõi: pha
 * gợn sáng ao + pha thở. Đổi là lõi vẽ lại. */
function f2SceneSig() {
  return 'p' + (Math.floor(OF.clock * 2) % 4) + ',b' + F2_BREATH();
}

/* Gợn sáng ao — 4 vị trí lấp lánh quay vòng ~2 lần/giây. Vẽ sau mọi thứ nên nằm trên mặt nước. */
function f2DrawAnimated(g, p) {
  const SP = [[196, 156], [210, 160], [220, 154], [202, 163]];
  const s = SP[Math.floor(OF.clock * 2) % 4];
  px2(g, s[0], s[1], 2, 1, '#dceefc');
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
      pick: () => {
        const bot = a.y === F2_AISLE_Y[1];
        const x = bot ? 12 + Math.random() * 160 : 12 + Math.random() * (ROOM_W - 40);
        return { x, y: a.y + Math.random() * 4 };
      },
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
  bobFor: f2BobFor,             // thở khi ngồi
  sceneSig: f2SceneSig,         // ao lấp lánh + pha thở kích vẽ lại
  drawAnimated: f2DrawAnimated, // gợn sáng mặt ao
  charIndexFor: (id) => slotFor(id) % FARMER_CHARS.length,   // index theo chỗ vào FARMER_CHARS
  drawStatic: f2DrawStatic,
  drawStation: f2DrawStation,
  ambient: f2Ambient,
});
