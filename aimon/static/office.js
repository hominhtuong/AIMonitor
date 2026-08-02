/* Khung nhìn Văn phòng: mỗi agent AI là một nhân vật trong một BỐI CẢNH pixel.
 *
 * Đang làm việc thì về chỗ của mình và diễn đúng việc đang làm (gõ phím khi sửa file, đọc tài
 * liệu khi tìm kiếm, quay sang terminal khi chạy lệnh). Rảnh lâu thì đứng dậy đi vòng vòng.
 * Bấm vào chỗ của ai thì mở ra toàn bộ cây tiến trình và chi tiết phiên của người đó.
 *
 * File này gồm HAI phần tách bạch:
 *
 *   1. LÕI - mọi thứ không phụ thuộc bối cảnh: atlas, thực thể, vòng vẽ, hover, bảng chi
 *      tiết, bảng chọn. Chừng 60% file.
 *   2. BỐI CẢNH VĂN PHÒNG - nằm ở cuối file, đăng ký vào `SCENES` như mọi bối cảnh khác.
 *      Bối cảnh khác (Nông trại, Shipper) ở `scene-*.js`, nạp sau file này.
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
 *    Chính vì bậc phóng luôn nguyên mà nền tĩnh nướng được ở PIXEL GỐC rồi phóng lên mà
 *    không mất một chút nét nào - xem `bakeBackground()`.
 *
 * 3. **Không tự bật vòng vẽ khi tab đang ẩn.** requestAnimationFrame ở tab ẩn bị trình duyệt
 *    treo, nhưng setInterval thì không - để nguyên là vẫn gọi /api/pulse mỗi giây trong khi
 *    không ai nhìn.
 */

/* Kích thước khung hình tính bằng pixel gốc. DÙNG CHUNG cho mọi bối cảnh, và đó là chủ ý:
 * giữ chung thì resize(), bậc phóng, spriteSmooth, ô xem trước và hit test không phải biết
 * bối cảnh nào đang chạy, mà nền tĩnh cũng nướng được ở pixel gốc. */
const ROOM_W = 260;
const ROOM_H = 176;
const WALL_H = 26;

const WALK_SPEED = 26;              // pixel gốc / giây
const BURST_SEC = 0.55;             // một sự kiện đã trôi qua được diễn trong ngần này giây
const PULSE_MS = 1000;
// Rời khung hình lâu hơn ngần này giây thì xoá thẳng, không hỏi lý do. Đường ra dài nhất là
// ăn mừng 2 giây rồi đi hết chiều ngang (260 / 26 = 10 giây), nên 20 là rộng gấp đôi: không
// cắt ngang màn ra cửa nào, mà cũng không để nhân vật ma nào ở lại quá vài giây.
const LEAVE_TIMEOUT = 20;

/* Vai diễn chỉ đổi khi mã hoạt cảnh mới giữ được ngần này giây. Agent đổi tool mấy lần một
 * giây, đổi vai theo từng tool là cả khung hình co giật. 2.5 giây = 2-3 nhịp /api/pulse.
 *
 * Phân vai với hoạt cảnh tức thời là HAI thứ khác nhau, đừng gộp:
 *   - `e.role`          nghề đang làm  => quyết định đứng ở đâu, cầm cái gì
 *   - `currentAction(e)` việc tức thời => quyết định màu màn hình, bong bóng, nhịp tay
 * Nhờ tách vậy mà một cú `Read` chớp nhoáng làm nhân vật liếc sang tài liệu chứ không bắt
 * họ bỏ cái rìu xuống rồi chạy sang thửa ruộng. */
const ROLE_HOLD = 2.5;

/* Rời tab bao lâu thì trả lại vùng nhớ ảnh. Không thả ngay vì bấm nhầm sang tab khác rồi bấm
 * lại là chuyện thường, mà nướng lại tốn 60 ms đứng hình đúng lúc người dùng vừa bấm vào.
 * Trước đây KHÔNG thả gì cả: mở tab một lần rồi thôi là 7 MB nằm đó tới lúc đóng cửa sổ, mà
 * trong VSCode có retainContextWhenHidden nên webview sống rất lâu. */
const ATLAS_IDLE_MS = 60000;

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
  atlasFarm: null,       // atlas 16x16 riêng cho bối cảnh farm-v2 (xem sprites-farm.js)
  bg: null,              // nền tĩnh đã nướng, ở PIXEL GỐC (260x176)
  bgKey: '',             // chữ ký của nền đã nướng: bối cảnh + kiểu nền + bảng màu
  freeTimer: null,       // hẹn giờ trả lại vùng nhớ ảnh sau khi rời tab
  scale: 3,
  dpr: 1,
  spriteSmooth: false,   // nội suy khi phóng nhân vật? resize() chốt theo bậc phóng
  timer: null,
  raf: null,
  since: 0,
  hidden: 0,
  err: '',
  ents: new Map(),
  stations: [],          // chỗ làm việc do bối cảnh cấp; luôn >= MAX_AGENTS chỗ
  amb: [],               // sinh vật nền (mèo, gà, chó...) - xem stepAmbient
  sel: null,
  hover: null,
  confetti: [],          // bông giấy của màn ăn mừng lúc một phiên xong việc
  sig: null,             // chữ ký khung vừa vẽ; trùng thì bỏ qua khung này (xem frameSig)
  last: 0,
  clock: 0,
  pal: {},
  scene: 'office',       // bối cảnh đang chạy
  // Bộ nhân vật đang áp cho cả khung hình. Mỗi agent nhận một nhân vật KHÁC nhau trong bộ;
  // hết nhân vật thì quay vòng dùng lại.
  pack: 'voyage',
  room: 'classic',       // kiểu nền đang dùng; hình học không đổi, chỉ đổi sàn/tường/trang trí
  slots: new Map(),      // id agent -> chỗ thứ mấy trong bộ
  overrides: new Map(),  // id agent -> khoá "bộ:nhân-vật" do người dùng tự chọn cho riêng người đó
};

/* ------------------------------------------------- bối cảnh
 *
 * Một bối cảnh gom đúng những thứ mà kiểu nền KHÔNG được đụng vào: hình học, luật đi, hành
 * vi, đạo cụ, sinh vật nền. Kiểu nền chỉ đổi sàn/tường/trang trí và nằm BÊN TRONG bối cảnh.
 *
 * Sáu bất biến mọi bối cảnh phải giữ - mỗi dòng là một lỗi đã trả giá ở bản Văn phòng:
 *
 * 1. ROOM_W / ROOM_H dùng chung, không bối cảnh nào được đổi.
 * 2. `stations()` phải trả >= MAX_AGENTS (10) chỗ, nếu không có agent đứng mãi ngoài cửa.
 * 3. Mỗi agent sở hữu đúng MỘT chỗ, ổn định suốt phiên - đó là thứ cho phép nhìn ra ai là ai.
 * 4. Chỗ chỉ được nhả khi agent đã ra khỏi khung hình (người đang ăn mừng vẫn giữ chỗ).
 * 5. `behave()` KHÔNG được đụng vào path/goal/mode của người đang `leaving`.
 * 6. Mọi trạng thái ảnh hưởng tới hình phải có mặt trong frameSig(), qua `sceneSig()`.
 *
 * Lối đi hợp lệ còn một luật hình học nữa, và nó là gốc của lỗi "ghế che người":
 *
 *   **Lối đi không được cắt qua bất cứ thứ gì vẽ SAU nhân vật.**
 *
 * Ở Văn phòng, tựa ghế vẽ sau nhân vật để người trông như lọt vào lòng ghế; vì thế lối lên
 * chỗ ngồi phải luồn qua KHE cạnh bàn chứ không đi thẳng từ dưới lên. Bối cảnh mới nào không
 * có lớp vẽ sau thì khỏi lo, nhưng có thì phải tự kiểm lại đúng chỗ này.
 */
const SCENES = [];

/* Thứ tự bày ra trong bảng chọn. Khai riêng chứ không lấy theo thứ tự đăng ký: bối cảnh nạp
 * theo yêu cầu nên thứ tự đăng ký phụ thuộc người dùng chọn gì trước, và bảng chọn sẽ đảo chỗ
 * mỗi lần mở máy. */
const SCENE_ORDER = ['office', 'farm', 'delivery', 'farm2'];

/* Bối cảnh nạp theo yêu cầu. Văn phòng nằm ngay trong file này vì nó là bối cảnh mặc định và
 * phải có mặt ngay; ba bối cảnh còn lại là file riêng, chỉ tải khi người dùng thật sự cần.
 *
 * Cộng lại chúng chừng 34 KB thô, và người chỉ dùng Văn phòng thì không tải một byte nào.
 * Đây là đường DUY NHẤT khả thi cho việc nạp lười ở repo này: `office.js` và `app.js` gọi
 * thẳng hàm toàn cục của nhau nên không tách được, còn file bối cảnh thì phụ thuộc một chiều -
 * nó chỉ cần gọi `registerScene()` cùng mấy hàm vẽ dùng chung. */
const SCENE_LAZY = [
  { id: 'farm', src: '/static/scene-farm.js' },
  { id: 'delivery', src: '/static/scene-delivery.js' },
  { id: 'farm2', src: '/static/scene-farm-v2.js' },
];
const SCENE_LOADS = new Map();      // id -> Promise, để hai lời gọi cùng lúc không tải hai lần

function sceneRank(id) {
  const i = SCENE_ORDER.indexOf(id);
  return i < 0 ? SCENE_ORDER.length : i;
}

function registerScene(sc) {
  SCENES.push(sc);
  SCENES.sort((a, b) => sceneRank(a.id) - sceneRank(b.id));
}

function sceneLoaded(id) {
  return SCENES.some((s) => s.id === id);
}

/** Nạp file của một bối cảnh. Trả về Promise<boolean>: false nghĩa là không có file nào cho
 *  id đó, hoặc tải hỏng - lúc đó phía gọi phải ở lại bối cảnh cũ chứ đừng chuyển sang một
 *  bối cảnh không tồn tại. */
function loadScene(id) {
  if (sceneLoaded(id)) return Promise.resolve(true);
  const stub = SCENE_LAZY.find((x) => x.id === id);
  if (!stub) return Promise.resolve(false);
  if (!SCENE_LOADS.has(id)) {
    SCENE_LOADS.set(id, new Promise((res) => {
      const el = document.createElement('script');
      el.src = stub.src;
      el.onload = () => res(sceneLoaded(id));
      // Xoá khỏi bảng khi hỏng: mạng chập chờn thì lần bấm sau phải thử lại được, chứ không
      // ghi nhớ vĩnh viễn một lời hứa đã thất bại.
      el.onerror = () => { SCENE_LOADS.delete(id); res(false); };
      document.head.appendChild(el);
    }));
  }
  return SCENE_LOADS.get(id);
}

/** Nạp hết. Gọi khi người dùng mở bảng chọn bối cảnh - lúc đó cần ô xem trước của cả ba. */
function loadAllScenes() {
  return Promise.all(SCENE_LAZY.map((x) => loadScene(x.id)));
}

function sceneById(id) {
  return SCENES.find((s) => s.id === id) || SCENES[0];
}

/** Bối cảnh đang chạy. Gọi rất nhiều nên giữ tên ngắn. */
function CS() {
  return sceneById(OF.scene);
}

const SCENE_KEY = 'aimon.scene';
const ROOMS_KEY = 'aimon.rooms';       // { <scene>: <room> } - kiểu nền nhớ RIÊNG từng bối cảnh
const ROOM_KEY_OLD = 'aimon.room';     // bản trước lưu phẳng một chuỗi, vẫn đọc để khỏi mất lựa chọn

/** Bối cảnh người dùng MUỐN, kể cả khi file của nó chưa nạp. Tách riêng để phần nạp trước ở
 *  cuối file dùng lại đúng thứ tự ưu tiên này thay vì chép lại. */
function wantedSceneId() {
  let saved = null;
  try { saved = localStorage.getItem(SCENE_KEY); } catch (e) { /* bỏ qua */ }
  // Cùng thứ tự ưu tiên với bộ nhân vật và bộ lọc loại agent: lựa chọn bấm trên trang thắng
  // tham số của extension, vì đây là sở thích cá nhân chứ không phải ràng buộc của khung nhìn.
  const q = new URLSearchParams(location.search).get('scene');
  const cfg = (window.AIMON_CONFIG || {}).office_scene;
  const pick = saved != null ? saved : (q != null ? q : (cfg || ''));
  return SCENE_ORDER.indexOf(pick) >= 0 ? pick : SCENES[0].id;
}

function initScene() {
  const want = wantedSceneId();
  // Rơi về bối cảnh ĐẦU TIÊN chứ không viết cứng tên: đổi thứ tự đăng ký là mặc định đổi theo.
  // File chưa nạp xong thì cũng rơi về đây, rồi `officeInit` chuyển sang khi nó về tới.
  OF.scene = sceneLoaded(want) ? want : SCENES[0].id;
}

/** Kiểu nền của bối cảnh đang chạy. Nhớ riêng từng bối cảnh: một id nền của Nông trại không
 *  tồn tại ở Shipper, dùng chung một khoá thì đổi bối cảnh xong nền rơi về mặc định lặng lẽ. */
function initRoom() {
  let map = {};
  try { map = JSON.parse(localStorage.getItem(ROOMS_KEY) || '{}') || {}; } catch (e) { map = {}; }
  let pick = map[OF.scene];
  if (pick == null && OF.scene === SCENES[0].id) {
    // Người dùng bản trước có lựa chọn phòng cất ở khoá phẳng, đừng bắt họ chọn lại.
    try { pick = localStorage.getItem(ROOM_KEY_OLD); } catch (e) { /* bỏ qua */ }
  }
  const rooms = CS().rooms;
  OF.room = rooms.some((r) => r.id === pick) ? pick : (CS().defaultRoom || rooms[0].id);
}

function saveRoom() {
  try {
    let map = {};
    try { map = JSON.parse(localStorage.getItem(ROOMS_KEY) || '{}') || {}; } catch (e) { map = {}; }
    map[OF.scene] = OF.room;
    localStorage.setItem(ROOMS_KEY, JSON.stringify(map));
  } catch (e) { /* riêng tư */ }
}

/** Đổi bối cảnh. Dọn sạch nhân vật đang có: chỗ ngồi, đường đi và vai diễn đều thuộc về hình
 *  học cũ, mang sang bối cảnh mới là có người đứng giữa con đường hoặc ngồi trên luống cày.
 *  Nhịp /api/pulse tới sẽ dựng lại đủ người trong chưa tới một giây. */
function setScene(id) {
  if (!sceneLoaded(id)) {
    // Chưa có file: tải rồi thử lại. Tải hỏng thì ở nguyên bối cảnh cũ - chuyển sang một bối
    // cảnh không tồn tại là `CS()` rơi về Văn phòng trong khi bảng chọn lại tô sáng ô kia.
    loadScene(id).then((okScene) => { if (okScene) setScene(id); });
    return;
  }
  const next = sceneById(id).id;
  if (next === OF.scene) return;
  OF.scene = next;
  try { localStorage.setItem(SCENE_KEY, OF.scene); } catch (e) { /* riêng tư */ }

  OF.ents.clear();
  OF.slots.clear();
  OF.sel = null;
  OF.hover = null;
  OF.confetti.length = 0;
  initRoom();
  buildScene();

  // Bộ gợi ý của bối cảnh chỉ áp khi người dùng CHƯA từng tự chọn bộ nào. Đè lên lựa chọn của
  // họ thì đổi bối cảnh xong cả nhà mất hình đã chọn, nhìn như tool tự ý sửa đồ của mình.
  let picked = null;
  try { picked = localStorage.getItem(PACK_KEY); } catch (e) { /* bỏ qua */ }
  if (!CS().fixedChars && picked == null && CS().defaultPack
      && packById(CS().defaultPack).id === CS().defaultPack) {
    OF.pack = CS().defaultPack;
  }

  if (CS().fixedChars) ensureAtlasFarm();
  else ensureAtlas();
  renderScenes();
  renderRooms();
  renderPacks();
  renderDetail();
  renderStatus();
  // Chú giải dùng từ vựng RIÊNG của từng bối cảnh (`legendSuffix`), quên vẽ lại là đang xem
  // Nông trại mà dưới chân trang vẫn ghi "đóng gói", "chạy giao hàng".
  renderLegend();
  invalidate();
  if (OF.on) { draw(); loadPulse(); }
}

/* Số chỗ tối thiểu mọi bối cảnh phải có. PHẢI KHỚP `MAX_AGENTS` trong aimon/office.py - server
 * cắt danh sách agent theo con số đó, thiếu chỗ ở phía này thì có agent không bao giờ được
 * chia chỗ và đứng mãi ngoài cửa. CI đối chiếu hai con số này. */
const MIN_STATIONS = 10;

/** Dựng lại mọi thứ phụ thuộc hình học của bối cảnh. Gọi lúc khởi tạo và lúc đổi bối cảnh. */
function buildScene() {
  OF.stations = CS().stations();
  // Bối cảnh khai một đằng dựng một nẻo là lỗi lặng lẽ nhất trong cả khung nhìn này: agent
  // thứ 10 chỉ đơn giản không bao giờ xuất hiện, mà không có gì báo. CI kiểm con số KHAI,
  // còn đây kiểm con số THẬT - phải có cả hai thì mới bắt được ca khai đúng mà dựng sai.
  if (OF.stations.length < MIN_STATIONS || OF.stations.length !== CS().stationCount) {
    console.warn('[aimon] bối cảnh "' + OF.scene + '" dựng ' + OF.stations.length
      + ' chỗ, khai ' + CS().stationCount + ', tối thiểu ' + MIN_STATIONS);
  }
  OF.amb = (CS().ambient ? CS().ambient() : []).map((a) => Object.assign({
    x: 0, y: 0, tx: 0, ty: 0, wait: Math.random() * 3, anim: 0, flip: false, speed: 14,
  }, a));
  OF.bg = null;          // nền cũ thuộc bối cảnh cũ
  OF.bgKey = '';
}

/** Hàng nút chọn bối cảnh. Mỗi ô là một canvas vẽ THU NHỎ chính bối cảnh đó, dùng đúng hàm
 *  vẽ thật nên xem trước không bao giờ lệch khỏi cái sẽ nhận. */
function renderScenes() {
  const host = document.getElementById('office-scenes');
  if (!host) return;
  // Bày đủ MỌI bối cảnh, kể cả cái chưa nạp file: người dùng phải thấy có những gì để chọn
  // trước khi tải, không thì bảng chọn mọc thêm ô sau mỗi lần bấm.
  if (host.childElementCount !== SCENE_ORDER.length) {
    host.textContent = '';
    SCENE_ORDER.forEach((id) => {
      const b = document.createElement('button');
      b.className = 'skin room';
      b.dataset.scene = id;
      b.appendChild(document.createElement('canvas'));
      const nm = document.createElement('span');
      nm.className = 'nm';
      b.appendChild(nm);
      host.appendChild(b);
    });
  }
  Array.from(host.children).forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.scene === OF.scene));
    const nm = b.querySelector('.nm');
    if (nm) nm.textContent = t('office.scene_' + b.dataset.scene);
    paintScenePreview(b.querySelector('canvas'), b.dataset.scene);
  });
  const sum = document.querySelector('#office-scenebox summary');
  if (sum) sum.textContent = t('office.scene_pick');
}

/** Ô xem trước của một bối cảnh. Chưa nạp file thì để ô trống - `paintPreview` không vẽ gì
 *  được nếu không có `drawStatic`, mà mở bảng chọn sẽ kéo file về rồi vẽ lại ngay sau đó. */
function paintScenePreview(cv, id) {
  if (!cv || !sceneLoaded(id)) return;
  const sc = sceneById(id);
  const room = (sc.rooms.find((r) => r.id === (sc.defaultRoom || '')) || sc.rooms[0]).id;
  paintPreview(cv, sc, room, 'sc:' + id);
}

/* ------------------------------------------------- chọn bộ nhân vật */

const PACK_KEY = 'aimon.pack';
const OVERRIDE_KEY = 'aimon.charOverrides';
// Ép riêng cho từng agent là lựa chọn nhất thời (id phiên đổi liên tục), nên chỉ giữ vài
// chục cái gần nhất thay vì để localStorage phình mãi.
const MAX_OVERRIDES = 40;

/** Chỗ của một agent trong bộ. Ưu tiên chỗ còn trống để hai người cạnh nhau không trùng mặt;
 *  hết chỗ mới quay vòng. Giữ nguyên khi đổi bộ, nên đổi bộ xong ai vẫn ở đúng vị trí cũ. */
function slotFor(id) {
  if (OF.slots.has(id)) return OF.slots.get(id);
  const n = packById(OF.pack).chars.length;
  const used = new Set();
  OF.slots.forEach((v, k) => { if (k !== id && OF.ents.has(k)) used.add(v); });
  let s = 0;
  while (s < n && used.has(s)) s++;
  if (s >= n) s = OF.slots.size % n;
  OF.slots.set(id, s);
  return s;
}

/** Chỉ số nhân vật thật sự dùng cho một agent. */
function charIndexFor(id) {
  const key = OF.overrides.get(id);
  if (key) {
    const i = charIndexByKey(key);
    if (i >= 0) return i;
  }
  return charAt(OF.pack, slotFor(id));
}

/* Chỉ số nhân vật theo BỐI CẢNH: farm-v2 dùng index vào FARMER_CHARS (theo chỗ ngồi), còn ba
 * bối cảnh 16x20 dùng pack như trước. Mọi chỗ chọn nhân vật (reskinAll, syncAgents) phải đi
 * qua hàm này, đừng gọi thẳng charIndexFor. */
function sceneCharFor(id) {
  const sc = CS();
  if (sc.charIndexFor) return sc.charIndexFor(id);
  return charIndexFor(id);
}

/** Áp lại nhân vật cho mọi người đang có trong khung hình. */
function reskinAll() {
  OF.ents.forEach((e) => { e.charIndex = sceneCharFor(e.id); });
  ensureAtlas();
}

/** Nướng atlas cho vừa đủ những nhân vật sắp phải vẽ, và chỉ nướng lại khi thiếu.
 *
 *  Nướng cả tám bộ tốn 35.4 MB vùng nhớ ảnh và 175 ms đứng hình - mà 175 ms đó rơi đúng vào
 *  lúc người dùng vừa bấm sang tab Văn phòng, chỗ dễ nhận ra nhất. Trong khi khung hình chỉ
 *  có `MAX_AGENTS` chỗ và mỗi lúc chỉ hiện một bộ.
 *
 *  Nướng CẢ BỘ đang chọn chứ không chỉ mấy người đang có mặt: agent vào ra liên tục, mà mỗi
 *  người mới lại là một nhân vật khác trong bộ - lấy đúng người đang có thì cứ ai vào phòng
 *  là nướng lại một lần. Cả bộ thì chỉ nướng lại khi đổi bộ hoặc khi có lựa chọn ép riêng
 *  trỏ sang bộ khác. */
function neededChars() {
  const p = packById(OF.pack);
  const want = [];
  for (let i = 0; i < p.chars.length; i++) want.push(p.start + i);
  OF.ents.forEach((e) => { if (want.indexOf(e.charIndex) < 0) want.push(e.charIndex); });
  return want;
}

function ensureAtlas(force) {
  if (CS().fixedChars) return;   // farm-v2 vẽ bằng atlas riêng (ensureAtlasFarm), không cần atlas 16x20
  const want = neededChars();
  if (!force && OF.atlas && OF.atlas.covers(want)) return;
  OF.atlas = buildSpriteAtlas(want);
  invalidate();
}

/* Atlas 16x16 riêng cho bối cảnh farm-v2. Nướng MỘT LẦN (10 nông dân x 17 frame cố định) —
 * không đổi theo bộ hay theo lựa chọn ép riêng nên không cần `covers()`. Tự no-op khi không
 * phải farm-v2, nên gọi vô điều kiện trong officeInit cũng vô hại. */
function ensureAtlasFarm() {
  if (CS().id !== 'farm2') return;
  if (OF.atlasFarm) return;
  if (typeof buildAtlas_farm !== 'function') return;   // sprites-farm.js chưa nạp
  OF.atlasFarm = buildAtlas_farm(null);
  invalidate();
}

/** Trả lại vùng nhớ ảnh. Đặt kích thước về 0 TRƯỚC khi bỏ tham chiếu: đó là cách duy nhất
 *  bắt renderer nhả vùng nhớ ngay, chứ chờ bộ dọn rác thì có thể vài phút. */
function freeAtlas() {
  OF.freeTimer = null;
  if (OF.atlas) {
    OF.atlas.canvas.width = 0;
    OF.atlas.canvas.height = 0;
    OF.atlas = null;
  }
  if (OF.atlasFarm) {
    OF.atlasFarm.canvas.width = 0;
    OF.atlasFarm.canvas.height = 0;
    OF.atlasFarm = null;
  }
  if (OF.bg) {
    OF.bg.width = 0;
    OF.bg.height = 0;
    OF.bg = null;
    OF.bgKey = '';
  }
  invalidate();
}

function saveOverrides() {
  const obj = {};
  OF.overrides.forEach((v, k) => { obj[k] = v; });
  try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(obj)); } catch (e) { /* riêng tư */ }
}

/** Đổi bộ cho cả khung hình. Bỏ mọi lựa chọn ép riêng: chúng thuộc về bộ cũ, giữ lại thì đổi
 *  bộ xong vẫn còn vài người mang hình bộ trước, nhìn như lỗi. */
function setPack(id) {
  OF.pack = packById(id).id;
  OF.overrides.clear();
  saveOverrides();
  try { localStorage.setItem(PACK_KEY, OF.pack); } catch (e) { /* riêng tư */ }
  reskinAll();
  renderPacks();
  renderDetail();
}

/** Ép riêng một agent sang nhân vật khác. */
function setCharFor(id, charIndex) {
  OF.overrides.set(id, charKey(charIndex));
  while (OF.overrides.size > MAX_OVERRIDES) {
    OF.overrides.delete(OF.overrides.keys().next().value);
  }
  saveOverrides();
  const e = OF.ents.get(id);
  if (e) e.charIndex = charIndex;
  // Lựa chọn ép riêng trỏ được sang bộ KHÁC bộ đang chọn, mà atlas chỉ nướng bộ đang chọn.
  ensureAtlas();
  renderDetail();
}

function initPack() {
  let saved = null;
  try { saved = localStorage.getItem(PACK_KEY); } catch (e) { /* bỏ qua */ }
  // Cùng thứ tự ưu tiên với bộ lọc loại agent: lựa chọn bấm trên trang thắng tham số của
  // extension, vì đây là sở thích cá nhân chứ không phải ràng buộc của khung nhìn.
  const q = new URLSearchParams(location.search).get('pack');
  const cfg = (window.AIMON_CONFIG || {}).office_pack;
  const pick = saved != null ? saved : (q != null ? q : (cfg || CS().defaultPack || ''));
  // Rơi về bộ ĐẦU TIÊN trong danh sách chứ không viết cứng tên: đổi thứ tự ở sprites.js
  // là mặc định đổi theo, khỏi phải nhớ sửa hai chỗ.
  OF.pack = PACKS.some((p) => p.id === pick) ? pick : PACKS[0].id;

  try {
    const raw = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}');
    Object.keys(raw).forEach((k) => {
      if (typeof raw[k] === 'string' && charIndexByKey(raw[k]) >= 0) OF.overrides.set(k, raw[k]);
    });
  } catch (e) { /* dữ liệu cũ hỏng thì bỏ qua, không làm chết khung nhìn */ }
}

function setRoom(id) {
  const rooms = CS().rooms;
  OF.room = (rooms.find((r) => r.id === id) || rooms[0]).id;
  saveRoom();
  renderRooms();
  invalidate();
  if (OF.on) draw();
}

/** Bảng chọn kiểu nền. Mỗi ô là một canvas vẽ THU NHỎ chính kiểu nền đó - xem trước phải là
 *  thứ sẽ nhận, không phải một ô màu tượng trưng. */
function renderRooms() {
  const host = document.getElementById('office-rooms');
  if (!host) return;
  const rooms = CS().rooms;
  const box = host.closest('details');
  // Chỉ một kiểu nền (farm-v2) thì chọn làm gì - giấu cả bảng.
  if (rooms.length <= 1) { if (box) box.hidden = true; return; }
  if (box) box.hidden = false;
  // Số ô đổi khi đổi bối cảnh, mà id nền cũng khác nhau - so cả hai chứ đừng chỉ so số lượng.
  const want = rooms.map((r) => r.id).join(',');
  if (host.dataset.rooms !== want) {
    host.textContent = '';
    rooms.forEach((r) => {
      const b = document.createElement('button');
      b.className = 'skin room';
      b.dataset.room = r.id;
      b.appendChild(document.createElement('canvas'));
      const nm = document.createElement('span');
      nm.className = 'nm';
      b.appendChild(nm);
      host.appendChild(b);
    });
    host.dataset.rooms = want;
  }
  Array.from(host.children).forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.room === OF.room));
    const nm = b.querySelector('.nm');
    if (nm) nm.textContent = t('office.room_' + b.dataset.room);
    paintPreview(b.querySelector('canvas'), CS(), b.dataset.room, 'rm:' + b.dataset.room);
  });
  const sum = document.querySelector('#office-roombox summary');
  if (sum) sum.textContent = t('office.room_pick');
}

/** Vẽ thu nhỏ một bối cảnh + kiểu nền vào canvas xem trước. Dùng chính hàm vẽ thật nên xem
 *  trước không bao giờ lệch khỏi cái sẽ nhận, kể cả sau này sửa hình.
 *
 *  Vẽ ở PIXEL GỐC rồi để CSS thu lại: canvas 260x176 chỉ tốn 183 KB, mà thu bằng transform
 *  thì các nét 1 pixel biến mất lỗ chỗ. */
function paintPreview(cv, sc, roomId, tag) {
  if (!cv) return;
  const key = tag + ':' + (OF.pal.floor || '');
  if (cv.dataset.painted === key) return;
  const s = 0.32;
  cv.width = Math.round(ROOM_W * s);
  cv.height = Math.round(ROOM_H * s);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.setTransform(s, 0, 0, s, 0, 0);
  g.clearRect(0, 0, ROOM_W, ROOM_H);
  sc.drawStatic(g, OF.pal, roomId);
  // Vài chỗ làm việc cho ra dáng bối cảnh chứ không phải một mảng màu trống.
  if (sc.drawPreviewExtras) sc.drawPreviewExtras(g, OF.pal);
  cv.dataset.painted = key;
}

/* ------------------------------------------- bộ nhân vật nhập từ ảnh của người dùng
 *
 * Ảnh KHÔNG rời khỏi máy và bộ nhập vào KHÔNG bao giờ đi vào gói phát hành. Đó là chủ ý:
 * ảnh nhân vật tải trên mạng thường có giấy phép riêng, hoặc là fan art của nhân vật có
 * chủ. Người dùng tự đưa ảnh của mình vào máy mình thì không phát tán gì; đóng sẵn chúng
 * vào bản phát hành thì có.
 */

const CUSTOM_KEY = 'aimon.customPacks';
const CUSTOM_MAX = 6;

/** Canvas 16x20 -> chuỗi PNG để cất. Cất PNG chứ không cất ảnh gốc: ảnh gốc vài trăm KB,
 *  còn 40 nhân vật đã thu nhỏ chỉ tốn vài chục KB, vừa localStorage. */
function packToStore(pack) {
  return {
    id: pack.id,
    name: pack.name,
    chars: pack.chars.map((c) => ({ id: c.id, name: c.name, png: c.canvas.toDataURL('image/png') })),
  };
}

function readStoredPacks() {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];   // dữ liệu hỏng thì coi như chưa có bộ nào, đừng làm chết khung nhìn
  }
}

function writeStoredPacks(list) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); }
  catch (e) { toast(t('import.err_store'), 'err'); }
}

/** Dựng lại canvas từ PNG đã cất. Bất đồng bộ vì Image.onload, nên khung nhìn khởi động
 *  bằng bộ dựng sẵn trước rồi mới gắn bộ nhập vào sau - không bắt người dùng chờ. */
function loadCustomPacks() {
  const stored = readStoredPacks();
  if (!stored.length) return Promise.resolve(0);
  const jobs = stored.map((p) => Promise.all(p.chars.map((c) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      // Lấy đúng kích thước của ảnh đã cất, KHÔNG ép về 16x20: bộ nhập từ bản trước là ảnh
      // 16x20, bộ nhập từ bản này đã ở lưới con. Ép về một cỡ là một trong hai bị cắt cụt.
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth || SPRITE_W; cv.height = im.naturalHeight || SPRITE_H;
      cv.getContext('2d').drawImage(im, 0, 0);
      res({ id: c.id, name: c.name, canvas: cv });
    };
    im.onerror = () => res(null);
    im.src = c.png;
  }))).then((chars) => {
    const ok = chars.filter(Boolean);
    if (ok.length) addCustomPack(p.id, ok);
    return ok.length ? 1 : 0;
  }));
  return Promise.all(jobs).then((n) => n.reduce((a, b) => a + b, 0));
}

/** Người dùng vừa chọn một file ảnh. */
function importPackFile(file) {
  if (!file) return;
  readImageFile(file)
    .then((img) => {
      // Cắt thẳng về khuôn của LƯỚI CON chứ không về 16x20 rồi phóng lên: ảnh người dùng
      // đưa vào thường 100-200 pixel mỗi nhân vật, thu về 16 pixel là vứt đi gần hết chi
      // tiết, và không có cách nào lấy lại. Thu về 48x60 thì bộ nhập vào cũng nét ngang các
      // bộ vẽ tay thay vì là mảng màu lấm tấm giữa một căn phòng đã sắc nét.
      const { cells, note, found } = sliceSheet(img, SPRITE_W * SPRITE_SS, SPRITE_H * SPRITE_SS);
      if (!cells.length) { toast(t('import.err_empty'), 'err'); return; }

      const base = (file.name || 'pack').replace(/\.[^.]+$/, '').slice(0, 24) || 'pack';
      const id = 'custom:' + base + ':' + cells.length;
      const chars = cells.map((cv, i) => ({ id: 'c' + i, name: base + ' ' + (i + 1), canvas: cv }));
      addCustomPack(id, chars);

      const list = readStoredPacks().filter((p) => p.id !== id);
      list.push(packToStore({ id, name: base, chars }));
      while (list.length > CUSTOM_MAX) list.shift();
      writeStoredPacks(list);

      setPack(id);   // setPack => reskinAll => ensureAtlas, bộ mới được nướng ở đó
      toast(t(note || 'import.done', { n: cells.length, found: found || cells.length }), note ? '' : 'ok');
    })
    .catch(() => toast(t('import.err_read'), 'err'));
}

function deleteCustomPack(id) {
  writeStoredPacks(readStoredPacks().filter((p) => p.id !== id));
  removeCustomPack(id);
  if (OF.pack === id) setPack(PACKS[0].id);
  else { reskinAll(); renderPacks(); }
}

/** Bảng chọn bộ: mỗi bộ một ô, xem trước bằng ba nhân vật đầu của bộ đó.
 *
 *  Ô xem trước CHỈ vẽ khi bảng đang mở. Trước đây vẽ ngay lúc khởi tạo: 8 bộ x 3 ô = 24 lần
 *  renderCharPreview, mỗi lần một getImageData cộng một lượt hậu kỳ, cho những ô nằm trong
 *  một `<details>` đang đóng mà người dùng không nhìn thấy cái nào. */
function renderPacks() {
  const box = document.getElementById('office-skinbox');
  // Scene cố định (farm-v2) có nhân vật riêng, không dùng pack nào - giấu cả bảng chọn bộ.
  if (CS().fixedChars) { if (box) box.hidden = true; return; }
  if (box) box.hidden = false;
  const host = document.getElementById('office-skins');
  if (!host) return;

  // Dựng lại khi số bộ đổi (vừa nhập thêm hoặc vừa xoá). +1 cho ô "thêm bộ".
  if (host.childElementCount !== PACKS.length + 1) {
    host.textContent = '';
    PACKS.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'skin';
      b.dataset.pack = p.id;
      const strip = document.createElement('span');
      strip.className = 'strip';
      for (let i = 0; i < 3 && i < p.chars.length; i++) {
        const cv = document.createElement('canvas');
        cv.dataset.charPreview = String(charAt(p.id, i));
        strip.appendChild(cv);
      }
      b.appendChild(strip);
      const nm = document.createElement('span');
      nm.className = 'nm';
      b.appendChild(nm);
      if (p.custom) {
        // Nút xoá là <span role=button>, KHÔNG phải <button>: button lồng trong button là
        // HTML sai, Firefox tự tháo ra ngoài và cái nút rơi mất khỏi ô.
        const del = document.createElement('span');
        del.className = 'del';
        del.dataset.del = p.id;
        del.setAttribute('role', 'button');
        del.textContent = '×';
        b.appendChild(del);
      }
      host.appendChild(b);
    });

    const add = document.createElement('button');
    add.className = 'skin add';
    add.dataset.add = '1';
    add.innerHTML = '<span class="plus">+</span><span class="nm"></span>';
    host.appendChild(add);
  }

  Array.from(host.children).forEach((b) => {
    const nm = b.querySelector('.nm');
    if (b.dataset.add) {
      b.setAttribute('aria-pressed', 'false');
      b.title = t('import.hint');
      if (nm) nm.textContent = t('import.add');
      return;
    }
    b.setAttribute('aria-pressed', String(b.dataset.pack === OF.pack));
    const p = packById(b.dataset.pack);
    // Bộ nhập vào lấy tên từ tên file, không dịch; bộ dựng sẵn thì tra bảng dịch.
    if (nm) nm.textContent = p.custom ? p.id.split(':')[1] : t('office.pack_' + b.dataset.pack);
    const del = b.querySelector('.del');
    if (del) del.title = t('import.remove');
  });
  const sum = box && box.querySelector('summary');
  if (sum) sum.textContent = t('office.pack_pick');
  if (box && box.open) paintCharPreviews();
}

/** Dãy nhân vật của bộ đang chọn, để đổi riêng cho một agent. Dựng HTML thô vì nó nằm trong
 *  vùng do render()/morph() quản lý; canvas xem trước được vẽ ngay sau đó. */
function agentSkinRow(agentId, current) {
  const p = packById(OF.pack);
  return '<div class="agent-skins" data-key="askin">'
    + `<span class="lbl">${esc(t('office.change_char'))}</span>`
    + p.chars.map((c, i) => {
      const gi = charAt(OF.pack, i);
      return `<button class="mini pick" data-char="${gi}" aria-pressed="${gi === current}"
        title="${esc(c.name)}"><canvas data-char-preview="${gi}"></canvas></button>`;
    }).join('')
    + '</div>';
}

/** Vẽ nội dung cho mọi canvas xem trước đang thật sự hiện ra. */
function paintCharPreviews() {
  document.querySelectorAll('canvas[data-char-preview]').forEach((cv) => {
    const gi = +cv.dataset.charPreview;
    if (cv.dataset.painted === String(gi)) return;   // morph giữ lại canvas cũ thì khỏi vẽ lại
    // Nằm trong một <details> đang đóng thì offsetParent là null - hoãn lại tới lúc mở.
    if (!cv.offsetParent) return;
    renderCharPreview(cv, gi, 2);
    cv.dataset.painted = String(gi);
  });
}

/* ------------------------------------------------------------- bố cục */

/** Màu lấy từ biến CSS nên nền sáng / nền tối dùng chung một đoạn code vẽ. */
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
    chair: g('--of-chair', '#4a5570'),
    chairDark: g('--of-chair2', '#333c52'),
    plant: g('--of-plant', '#2f8f5b'),
    shadow: g('--of-shadow', 'rgba(0,0,0,.22)'),
    bubble: g('--of-bubble', '#0f172a'),
    bubbleFg: g('--of-bubble-fg', '#e2e8f0'),
    // Tên chỗ viết thẳng lên sàn nên phải tương phản với SÀN, không dùng chung màu với chữ
    // trong bong bóng (bong bóng có nền tối riêng ở cả hai theme).
    label: g('--of-label', '#e2e8f0'),
    outline: g('--of-outline', '#16202f'),
  };
}

/* ------------------------------------------------------------- thực thể */

function newEntity(id, kind, charIndex) {
  const en = CS().entry ? CS().entry() : { x: -20, y: ROOM_H - 28 };
  return {
    id, kind,                    // kind: 'agent' | 'sub'
    charIndex,
    x: en.x, y: en.y,            // sinh ra ngoài khung hình, đi vào sau
    dir: 'right',
    mode: 'enter',
    // Vừa được cử đi ĐÂU. Bắt buộc phải có, không suy ra được từ `station`: người rời chỗ đi
    // vòng vòng vẫn giữ chỗ, nên "có chỗ" không có nghĩa là "đang ở chỗ".
    goal: 'enter',
    path: [],
    station: null,
    spot: null,
    anim: Math.random() * 10,    // lệch pha nhau, nếu không cả phòng gõ phím cùng nhịp
    burst: null,
    queue: [],
    data: null,
    leaving: false,
    leftAt: 0,                   // OF.clock lúc bị đánh dấu rời khung hình - lưới an toàn ở step()
    cheer: 0,                    // giây còn lại của màn ăn mừng lúc xong việc
    glance: 0,                   // giây còn lại của cú ngoái lại nhìn khi bị rê chuột vào
    role: null,                  // nghề đang làm - đổi chậm, xem ROLE_HOLD
    roleWant: null,              // nghề đang chờ đủ thời gian để nhận
    roleAge: 0,
    sub: null,                   // bối cảnh muốn nhớ gì riêng cho thực thể này thì để đây
  };
}

/** Đường đi từ vị trí hiện tại tới đích. Bối cảnh lo phần tránh vật cản. */
function routeTo(e, tx, ty, station) {
  CS().route(e, tx, ty, station || null);
}

function sendToStation(e, st) {
  e.station = st;
  e.goal = 'station';
  e.mode = 'walk';
  routeTo(e, st.seatX, st.seatY, st);
}

function sendToSpot(e, spot) {
  e.spot = spot;
  e.goal = 'spot';
  e.mode = 'walk';
  routeTo(e, spot.x, spot.y);
}

function sendWandering(e) {
  const w = CS().wanderTarget(e);
  e.goal = 'wander';
  e.mode = 'walk';
  routeTo(e, w.x, w.y);
}

/* ------------------------------------------------------------- đồng bộ dữ liệu */

/** Gắn agent từ /api/pulse vào các thực thể đang có trong khung hình. */
function syncAgents(payload) {
  const seen = new Set();
  const used = new Set();

  // Giữ nguyên chỗ cũ trước, rồi mới chia chỗ trống cho người mới: đảo chỗ mỗi lần làm mới
  // thì cả khung hình đứng dậy đổi chỗ liên tục, không ai theo dõi nổi.
  //
  // Tính CẢ người đang ăn mừng (`leaving` nhưng còn giữ `station`). Bỏ họ ra thì chỗ đó được
  // coi là trống ngay, người mới vào ngồi đè lên người đang nhún nhảy ở đó - hai nhân vật
  // chồng lên nhau trên cùng một cái ghế. Họ nhả chỗ khi ăn mừng xong, chỉ 2 giây.
  OF.ents.forEach((e) => { if (e.station) used.add(e.station); });

  payload.agents.forEach((a) => {
    seen.add(a.id);
    let e = OF.ents.get(a.id);
    if (!e) {
      e = newEntity(a.id, 'agent', sceneCharFor(a.id));
      OF.ents.set(a.id, e);
    }
    e.data = a;
    e.leaving = false;
    if (!e.station) {
      const free = OF.stations.find((d) => !used.has(d));
      if (free) { used.add(free); sendToStation(e, free); }
    }

    // Sub-agent: mỗi cái một chỗ đứng cạnh chỗ của người gọi nó
    (a.subagents || []).slice(0, 2).forEach((sub, i) => {
      seen.add(sub.id);
      let se = OF.ents.get(sub.id);
      if (!se) {
        se = newEntity(sub.id, 'sub', sceneCharFor(sub.id));
        OF.ents.set(sub.id, se);
      }
      se.data = { ...sub, state: 'busy', action: 'work', parent: a.id };
      se.leaving = false;
      if (!se.spot && e.station) sendToSpot(se, e.station.helpers[i]);
    });
  });

  // Bỏ chỗ đã giữ của những ai không còn trong khung hình: giữ lại thì slotFor() thấy chỗ nào
  // cũng bận và người mới vào toàn phải quay vòng, cả phòng trùng mặt nhau.
  OF.slots.forEach((_, id) => { if (!seen.has(id)) OF.slots.delete(id); });

  // Ai không còn trong danh sách thì xong việc: đứng dậy, ăn mừng một nhịp rồi mới đi ra.
  OF.ents.forEach((e, id) => {
    if (seen.has(id) || e.leaving) return;
    e.leaving = true;
    e.leftAt = OF.clock;
    e.spot = null;
    // Thôi chào, thôi ngoái: phiên đã đóng thì không còn gì để đáp lại người rê chuột, mà
    // hai cờ này lại chặn đúng nhánh cho họ đi ra.
    e.greet = false;
    e.glance = 0;
    if (e.kind !== 'agent') {
      e.station = null;
      sendOut(e);
    } else if (e.station && e.mode !== 'sit') {
      // Xong việc lúc đang đi vòng vòng hoặc đang trên đường về chỗ: ĐI VỀ CHỖ CỦA MÌNH đã
      // rồi mới ăn mừng. Ăn mừng ngay tại chỗ đang đứng thì nhân vật nhún nhảy giữa lối đi
      // hoặc ngay trước ghế của người khác, nhìn như nhảy nhầm vào bàn thiên hạ.
      e.goal = 'cheer';
      e.mode = 'walk';
      routeTo(e, e.station.seatX, e.station.seatY, e.station);
    } else {
      // Đang ở sẵn chỗ mình: ăn mừng tại chỗ. `e.station` phải giữ lại tới lúc ăn mừng xong -
      // nó là thứ cho biết bước ngang về phía nào để khỏi trèo qua ghế lúc đi ra.
      startCheer(e);
    }
  });

  // Người mới vào có thể mang lựa chọn ép riêng trỏ sang bộ khác. Đây chỉ là phép kiểm tập
  // con trên chừng 10-36 số mỗi giây, không nướng lại gì nếu đã đủ.
  ensureAtlas();
}

/** Cho một người đi ra khỏi khung hình. `routeTo` phải chạy lúc mode còn là 'sit' và
 *  `station` còn đó, nếu không mất cú bước ngang khỏi ghế và nhân vật chui thẳng qua ghế. */
function sendOut(e) {
  const ex = CS().exit ? CS().exit(e) : { x: -22, y: ROOM_H - 28 };
  e.goal = 'exit';
  routeTo(e, ex.x, ex.y);
  e.mode = 'walk';
  e.station = null;
}

/* Ăn mừng xong việc. Cả hoạt cảnh này chỉ tồn tại vì lúc một phiên kết thúc, nhân vật cứ
 * thế biến mất ở cửa - không có gì đánh dấu "xong rồi". Một nhịp nhảy tại chỗ kèm confetti
 * là đủ để liếc qua cũng biết vừa có việc hoàn thành. */
const CHEER_SEC = 2;
const CONFETTI = ['#f2c14e', '#e8607a', '#5ec2d9', '#7bd88f', '#b28ce0', '#f0913a'];

/** Đang ở chỗ thì ăn mừng NGUYÊN TẠI CHỖ - giữ `mode = 'sit'` để còn nhún trên ghế, và để
 *  lúc xong `routeTo` biết mà bước ngang khỏi ghế trước khi đi xuống. Chỉ ai đang đứng sẵn
 *  (đi vòng vòng) mới nhảy giữa sàn. */
function startCheer(e) {
  e.goal = 'cheer';
  if (e.mode !== 'sit') e.mode = 'cheer';
  e.path = [];
  e.cheer = CHEER_SEC;
  spawnConfetti(e.x + SPRITE_W / 2, e.y + 2, CS().cheerColors || CONFETTI);
}

/* Toả NGANG mạnh hơn bắn lên: bản đầu `vx` chỉ ±15 nên cả nắm bông bay thẳng đứng, chụm
 * lại ngay trên đỉnh đầu và trông như cặp sừng chứ không như pháo giấy. */
function spawnConfetti(x, y, colors) {
  const cs = colors || CONFETTI;
  for (let i = 0; i < 22; i++) {
    OF.confetti.push({
      x: x + (Math.random() - 0.5) * 6,
      y,
      vx: (Math.random() - 0.5) * 54,
      vy: -13 - Math.random() * 20,
      c: cs[(Math.random() * cs.length) | 0],
      life: 1.2 + Math.random() * 0.8,
    });
  }
}

function stepConfetti(dt) {
  for (let i = OF.confetti.length - 1; i >= 0; i--) {
    const c = OF.confetti[i];
    c.life -= dt;
    if (c.life <= 0) { OF.confetti.splice(i, 1); continue; }
    c.vy += 40 * dt;                 // trọng lực, để bông rơi xuống chứ không bay thẳng
    c.x += c.vx * dt;
    c.y += c.vy * dt;
  }
}

function drawConfetti(g) {
  OF.confetti.forEach((c) => px2(g, Math.round(c.x), Math.round(c.y), 1, 2, c.c));
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

/** Nghề đang làm. Đổi CHẬM để nhân vật không co giật theo từng tool - xem ROLE_HOLD.
 *  Vai đầu tiên nhận ngay: người mới vào mà đứng ngây ra 2.5 giây thì nhìn như treo. */
function updateRole(e, dt) {
  const act = currentAction(e);
  if (act !== e.roleWant) { e.roleWant = act; e.roleAge = 0; }
  else e.roleAge += dt;
  if (e.role == null || (e.roleAge >= ROLE_HOLD && e.role !== act)) e.role = act;
}

/* ------------------------------------------------------------- cập nhật mỗi khung hình */

function step(e, dt) {
  e.anim += dt;
  if (e.glance > 0) e.glance -= dt;

  // LƯỚI AN TOÀN. Phiên tắt là nhân vật phải biến mất, chấm hết - người dùng nhìn vào khung
  // hình để biết máy mình đang chạy gì, một nhân vật ma ngồi lại ở chỗ là con số trên đầu
  // trang nói một đằng còn cảnh vật nói một nẻo (đã gặp thật: header ghi "1 in the room"
  // trong khi có 5 người trên màn hình).
  //
  // Dưới đây có nhánh dựng lại đường ra cho mọi ca kẹt đã biết, nhưng vẫn giữ cái chốt này:
  // nó không cần biết vì sao kẹt. Ngưỡng rộng rãi so với đường đi dài nhất (ăn mừng 2 giây +
  // đi hết chiều ngang ~10 giây) nên nó không bao giờ cắt ngang một màn ra cửa tử tế.
  if (e.leaving && OF.clock - e.leftAt > LEAVE_TIMEOUT) { OF.ents.delete(e.id); return; }

  if (e.burst) {
    e.burst.left -= dt;
    if (e.burst.left <= 0) e.burst = null;
  }
  if (!e.burst && e.queue.length) e.burst = { action: e.queue.shift(), left: BURST_SEC };

  // Cập nhật nghề TRƯỚC nhánh đi đường. Nhánh đó `return` sớm, nên để lời gọi này xuống dưới
  // thì người đang đi bộ không bao giờ tích được thời gian giữ vai: `role` kẹt ở null suốt
  // quãng đường, rồi nhảy phắt sang nghề mới đúng lúc vừa tới nơi. Ở Nông trại là người vừa
  // đến thửa đã phải bước ngang sang chỗ khác, ở Shipper là chuyến xe chậm mất mấy giây.
  if (e.kind === 'agent' && !e.leaving) updateRole(e, dt);

  // Ăn mừng cho hết nhịp rồi mới đứng dậy đi ra. `routeTo` chạy lúc mode vẫn còn là 'sit'
  // nên nó tự chèn cú bước ngang khỏi ghế; đổi mode trước khi gọi là mất bước đó và nhân
  // vật lại chui thẳng xuống qua ghế.
  if (e.cheer > 0) {
    e.cheer -= dt;
    if (e.cheer > 0) return;
    e.cheer = 0;
    sendOut(e);
    return;
  }

  if (e.path.length) {
    const wp = e.path[0];
    const dx = wp.x - e.x, dy = wp.y - e.y;
    const dist = Math.hypot(dx, dy);
    const move = (CS().speedFor ? CS().speedFor(e) : WALK_SPEED) * dt;
    if (dist <= move) {
      e.x = wp.x; e.y = wp.y;
      e.path.shift();
      if (!e.path.length) {
        if (e.goal === 'exit') { OF.ents.delete(e.id); return; }
        // Vừa về tới chỗ của mình để ăn mừng: phải đặt `sit` TRƯỚC startCheer, nếu không nó
        // tưởng đang đứng và cho nhún kiểu đứng ngay trên mặt ghế.
        if (e.goal === 'cheer') { e.mode = 'sit'; startCheer(e); return; }
        // Theo ĐÍCH vừa tới, không theo việc có sở hữu chỗ hay không. Lấy `e.station` làm căn
        // cứ thì người vừa đi vòng vòng xong sẽ chuyển sang tư thế ngồi ngay giữa lối đi,
        // và kẹt luôn ở đó vì nhánh "quay về chỗ" chỉ chạy khi chưa ngồi.
        e.mode = (e.goal === 'station' || e.goal === 'spot') ? 'sit' : 'idle';
        if (CS().onArrive) CS().onArrive(e);
      }
    } else {
      e.x += dx / dist * move;
      e.y += dy / dist * move;
      e.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    return;
  }

  // Hết đường mà vẫn còn trong khung hình: dựng lại đường ra. Đây là chỗ vá GỐC của lỗi nhân
  // vật ma - `setHover` xoá `path` và `goal` của người đang được rê chuột, người đang trên
  // đường ra cửa mà dính cú đó thì đứng chôn chân giữa phòng vĩnh viễn, vì mọi nhánh phía
  // dưới đều chỉ dành cho người còn đang làm việc. Người rời đi chỉ có đúng một việc: ra tới
  // cửa. Nhánh này phải đứng TRƯỚC mọi nhánh khác, kể cả trước `kind !== 'agent'`.
  if (e.leaving) {
    if (e.cheer <= 0) sendOut(e);
    return;
  }

  const d = e.data || {};
  if (e.kind !== 'agent') return;
  // Đang được hover thì đứng lại chờ lệnh. Chỉ giữ khi họ đang rảnh - có việc trở lại thì
  // phải cho về chỗ ngay, công việc quan trọng hơn phép lịch sự.
  if (e.greet && d.state === 'wander') return;

  CS().behave(e, dt, d);
}

/** Nhánh hành vi mặc định, dùng chung cho bối cảnh nào không cần gì đặc biệt. */
function behaveDefault(e, dt, d) {
  if (d.state === 'wander') {
    // Rảnh lâu thì rời chỗ đi vòng vòng, nhưng VẪN GIỮ CHỖ để lát nữa quay lại đúng chỗ cũ
    if (e.goal === 'station' || e.goal === 'spot') {
      sendWandering(e);
    } else if (e.mode === 'idle' && Math.random() < dt * 0.35) {
      // Đứng một lát rồi lại đi tiếp, không cần vòng qua lối dọc vì vẫn quanh quẩn khu này
      const w = CS().wanderTarget(e);
      e.mode = 'walk';
      e.path = [{ x: w.x, y: w.y }];
    }
  } else if (e.station && e.goal !== 'station') {
    sendToStation(e, e.station);        // có việc trở lại thì về chỗ
  }
}

/* ------------------------------------------------------------- sinh vật nền
 *
 * Con mèo (và sau này gà, chó, chim) được vẽ SAU tất cả mọi người nên luôn nằm trên cùng. Vì
 * vậy chúng phải bị nhốt trong một DẢI riêng sát mép dưới: dải cũ của con mèo trùng đúng lối
 * đi của người, và nó đi ngang qua che mất mặt người đang đi - nhìn như con mèo lơ lửng trước
 * mặt ai đó. Ở dải sát mép dưới nó chỉ còn cắt qua bàn chân, đúng chỗ một con vật nên ở.
 *
 * Hai luật về hiệu năng, cả hai đều là bài học từ chính con mèo:
 *
 * 1. **Nhịp chân chỉ chạy KHI ĐANG ĐI.** Trước đây `anim` cộng vô điều kiện nên con mèo nằm
 *    chờ vẫn đảo qua lại hai khung đi bộ - nhìn như nó giậm chân tại chỗ. Và vì nó đảo 5 lần
 *    mỗi giây nên cả căn phòng đứng yên vẫn phải vẽ lại 5 lần mỗi giây chỉ vì con mèo.
 * 2. **Con vật vẽ bằng px2 thì chữ ký chỉ lấy toạ độ ĐÃ LÀM TRÒN.** Nét vẽ của chúng nằm trên
 *    lưới pixel gốc, nên hai vị trí cùng làm tròn về một pixel cho ra ĐÚNG cùng một hình -
 *    đưa toạ độ thô vào chữ ký là bắt vẽ lại 60 lần mỗi giây cho một con gà nhích 14 pixel.
 *    Nhờ luật này, bốn con gà đi lại chỉ kéo khung hình lên chừng 14 fps thay vì 60.
 */

function stepAmbient(dt) {
  OF.amb.forEach((c) => {
    c.wait -= dt;
    if (c.wait > 0) return;
    c.anim += dt;
    const dx = c.tx - c.x, dy = c.ty - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      const p = c.pick ? c.pick() : { x: 16 + Math.random() * (ROOM_W - 48), y: c.y };
      c.tx = p.x;
      c.ty = p.y;
      c.wait = c.restMin + Math.random() * c.restVar;
      return;
    }
    const move = c.speed * dt;
    c.x += dx / dist * move;
    c.y += dy / dist * move;
    c.flip = dx < 0;
  });
}

/** Chữ ký của MỌI thứ quyết định ra khung hình đang thấy.
 *
 *  Vòng `tick()` chạy 60 lần mỗi giây, nhưng phần lớn thời gian không có gì chuyển động: mọi
 *  người ngồi yên cùng một khung, con mèo đang nằm chờ. Vẽ lại y hệt khung cũ 60 lần một giây
 *  là phần đắt nhất của tab Văn phòng - không phải vì JS (đo được 0.11 ms một khung) mà vì
 *  trình duyệt phải hợp thành và đẩy lên màn hình một canvas mới mỗi lần.
 *
 *  So bằng CHỮ KÝ chứ không bằng cờ "bẩn" do từng hàm `step*` tự khai: cờ bẩn đòi mọi nhánh
 *  đổi trạng thái đều phải nhớ bật cờ, sót một nhánh là màn hình đứng hình mà không ai biết
 *  vì sao. Chữ ký suy thẳng từ những gì `draw()` đọc, nên sót là sót cả hai phía và lộ ra
 *  ngay - còn thêm trạng thái mới thì chỉ việc thêm vào đây.
 *
 *  Vị trí nhân vật quy về **pixel thiết bị** (`OF.scale * OF.dpr`) rồi làm tròn nửa pixel:
 *  dịch chuyển nhỏ hơn thế thì màn hình không thể hiện ra khác được, mà nhân vật đi bộ thì
 *  mỗi khung nhích vài pixel thiết bị nên vẫn vẽ đủ 60 fps lúc có người di chuyển.
 *
 *  Bối cảnh góp thêm phần của mình qua `sceneSig()` - tiến độ luống lúa, số thùng hàng, vị
 *  trí xe. Thêm trạng thái ảnh hưởng tới hình mà quên khai ở đó là màn hình đứng hình. */
function frameSig() {
  const k = OF.scale * OF.dpr * 2;
  const q = (v) => Math.round(v * k);
  let s = OF.scale + '/' + OF.dpr + '/' + OF.scene + '/' + OF.room
    + '/' + (OF.hover || '') + '/' + (OF.sel || '');
  OF.amb.forEach((c) => {
    // Làm tròn về PIXEL GỐC, không về pixel thiết bị: xem luật 2 ở mục sinh vật nền.
    s += '|a' + Math.round(c.x) + ',' + Math.round(c.y) + ',' + (c.flip ? 1 : 0)
      + ',' + (Math.floor(c.anim * 5) % 2);
  });
  OF.ents.forEach((e) => {
    const d = e.data || {};
    s += '|' + e.charIndex + ',' + q(e.x) + ',' + q(e.y) + ',' + (e.dir === 'left' && e.path.length ? 1 : 0)
      + ',' + frameFor(e) + ',' + e.mode + ',' + e.kind + ',' + (e.cheer > 0 ? 1 : 0)
      + ',' + (e.station ? e.station.id : '-') + ',' + currentAction(e) + ',' + (e.role || '')
      + ',' + (e.kind === 'sub' ? (d.type || '') : (d.tool || ''));
  });
  if (CS().sceneSig) s += '#' + CS().sceneSig();
  return s;
}

/** Buộc vẽ lại khung tới. Gọi khi thứ KHÔNG nằm trong chữ ký đổi: bảng màu theo theme, kiểu
 *  nền, atlas vừa nướng lại, kích thước canvas. */
function invalidate() {
  OF.sig = null;
}

function tick(now) {
  OF.raf = null;
  if (!OF.on) return;
  const dt = Math.min(0.1, OF.last ? (now - OF.last) / 1000 : 0.016);
  OF.last = now;
  OF.clock += dt;

  Array.from(OF.ents.values()).forEach((e) => step(e, dt));
  stepAmbient(dt);
  stepConfetti(dt);
  if (CS().stepScene) CS().stepScene(dt);
  // Confetti đổi vị trí từng khung nên không đưa vào chữ ký, cứ có hạt là vẽ.
  const sig = frameSig();
  if (OF.confetti.length || sig !== OF.sig) {
    draw();
    OF.sig = sig;
  }
  OF.raf = requestAnimationFrame(tick);
}

/* ------------------------------------------------------------- vẽ */

function px2(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

/* Nét dùng chung cho nhiều bối cảnh. Bối cảnh nào cần nét riêng thì tự vẽ trong file của nó. */

/** Sàn lát ô cờ - kiểu chung của mọi nền, chỉ khác kích thước ô. */
function floorTiles(g, p, size, base, alt) {
  px2(g, 0, WALL_H, ROOM_W, ROOM_H - WALL_H, base || p.floor);
  for (let y = WALL_H; y < ROOM_H; y += size) {
    for (let x = (((y - WALL_H) / size) % 2) * size; x < ROOM_W; x += size * 2) {
      px2(g, x, y, size, size, alt || p.floor2);
    }
  }
}

/** Sàn gỗ: các thanh dọc dài, khe hở sẫm màu. */
function floorPlanks(g, p) {
  px2(g, 0, WALL_H, ROOM_W, ROOM_H - WALL_H, p.floor);
  for (let x = 0; x < ROOM_W; x += 13) {
    px2(g, x, WALL_H, 1, ROOM_H - WALL_H, p.floor2);
  }
  for (let y = WALL_H + 18; y < ROOM_H; y += 37) {
    for (let x = (y % 2) * 13; x < ROOM_W; x += 26) px2(g, x, y, 13, 1, p.floor2);
  }
}

function windowOnWall(g, p, x, w) {
  px2(g, x, 5, w, 15, p.outline);
  px2(g, x + 1, 6, w - 2, 13, p.sky);
  px2(g, x + (w >> 1) - 1, 6, 1, 13, p.outline);
  px2(g, x + 1, 12, w - 2, 1, p.outline);
}

function potPlant(g, p, x, y) {
  px2(g, x, y + 8, 8, 6, p.deskDark);
  px2(g, x + 1, y, 6, 9, p.plant);
  px2(g, x + 3, y - 3, 2, 4, p.plant);
}

/** Nền tĩnh, nướng MỘT LẦN vào canvas rời rồi dán bằng một lệnh drawImage.
 *
 *  Trước đây mỗi khung hình vẽ lại toàn bộ sàn, tường, cửa sổ, kệ sách - đếm từ code là
 *  khoảng 350 lệnh fillRect cho kiểu Cổ điển, mà nông trại còn nhiều hơn hẳn. Nướng sẵn thì
 *  còn đúng một lệnh.
 *
 *  Nướng ở PIXEL GỐC (260x176 = 183 KB) chứ không ở bậc phóng hiện tại, và điều đó KHÔNG mất
 *  một chút nét nào: bậc phóng luôn là số nguyên, dpr cũng đã làm tròn về số nguyên, còn nền
 *  thì toàn fillRect căn theo toạ độ nguyên - phóng gần nhất một ảnh nguyên lần cho ra đúng
 *  từng pixel giống như vẽ thẳng ở bậc đó. Nướng ở bậc phóng thì ở bậc 5 với dpr 2 sẽ tốn
 *  18.3 MB và phải nướng lại mỗi lần kéo cửa sổ.
 *
 *  Chữ ký gồm bối cảnh, kiểu nền và bảng màu (theme) - đủ để tự nướng lại đúng lúc mà không
 *  cần ai nhớ gọi. Phần có nhúc nhích (kim đồng hồ, đèn giao thông) nằm ở `drawAnimated`. */
function bakeBackground() {
  const key = OF.scene + '|' + OF.room + '|' + (OF.pal.floor || '') + '|' + (OF.pal.wall || '');
  if (OF.bg && OF.bgKey === key) return;
  const cv = OF.bg || document.createElement('canvas');
  cv.width = ROOM_W;
  cv.height = ROOM_H;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, ROOM_W, ROOM_H);
  CS().drawStatic(g, OF.pal, OF.room);
  OF.bg = cv;
  OF.bgKey = key;
}

/** Thông tin vẽ của một thực thể, tính MỘT LẦN rồi dùng cho cả nhân vật lẫn đạo cụ.
 *
 *  `ox` là gốc toạ độ dùng chung, và đó là chỗ chống lỗi "đạo cụ trôi lệch khỏi người": nhân
 *  vật vẽ bằng drawImage nên toạ độ lẻ vẫn mượt, còn đạo cụ vẽ bằng fillRect thì bị làm tròn -
 *  hai bên lệch nhau tới một pixel và cái rìu rung bần bật quanh bàn tay. Bối cảnh nào có đạo
 *  cụ thì khai `snap: true`, cả hai cùng lấy MỘT gốc đã làm tròn nên dính chặt vào nhau.
 *  Bối cảnh Văn phòng không có đạo cụ nên không snap, giữ nguyên chuyển động mượt như cũ. */
function entityInfo(e) {
  const sc = CS();
  const snap = !!sc.snap;
  const hop = e.cheer > 0 && Math.floor(e.anim * 9) % 2 ? -1 : 0;
  // Nhún theo mặt đường (xe máy) cộng vào CÙNG `ey` với cú nhảy ăn mừng, nên nhân vật và đạo
  // cụ đọc chung một con số - tách ra là thấy ngay người nảy lên khỏi yên xe.
  const bob = sc.bobFor ? sc.bobFor(e) : 0;
  const x = snap ? Math.round(e.x) : e.x;
  const y = snap ? Math.round(e.y) : e.y;
  return {
    x, y,
    ey: y + hop + bob,
    hop,
    flip: sc.flipFor ? sc.flipFor(e) : (e.dir === 'left' && e.path.length > 0),
    small: e.kind === 'sub',
    frame: frameFor(e),
    // Cắt mấy hàng cuối của sprite (chân khuất sau thân xe). Cắt ở NGUỒN chứ không che bằng
    // một mảng màu đè lên: che thì cái đè phải khớp đúng màu nền, mà nền đổi theo theme.
    cut: sc.cutFor ? sc.cutFor(e) : 0,
    // Ai đứng trên mặt đất thì có bóng. Ở Văn phòng người ngồi bị bỏ bóng vì bóng nằm ở đáy
    // sprite, mà đáy sprite lúc ngồi là khoảng trống sau lưng ghế - thành một vệt lơ lửng.
    shadow: sc.shadowFor ? sc.shadowFor(e) : e.mode !== 'sit',
  };
}

function drawEntity(g, e, info) {
  const farm = CS().id === 'farm2';
  const atlas = farm ? OF.atlasFarm : OF.atlas;
  const SW = farm ? SPRITE_W_FARM : SPRITE_W;
  const SH = farm ? SPRITE_H_FARM : SPRITE_H;
  const SS = farm ? SPRITE_SS_FARM : SPRITE_SS;
  const [sx, sy, sw, sh] = atlas.cell(e.charIndex, info.frame);
  // Atlas vẽ ở lưới con (gấp SPRITE_SS lần), còn cảnh đo bằng pixel gốc - nên đích luôn là
  // kích thước ô CHIA cho SPRITE_SS. Vẽ đúng sw/sh là nhân vật to gấp ba, tràn kín phòng.
  const dw = sw / SS, dh = sh / SS;

  // Người ngồi không vẽ chân (chân khuất sau ghế), nên cái bóng ở đáy sprite hoá ra một
  // vệt tách rời lơ lửng dưới thân. Ngồi thì bóng cũng khuất sau ghế - bỏ luôn.
  //
  // Bóng là hình BẦU DỤC chứ không phải hình chữ nhật: một thanh chữ nhật dưới chân trông
  // như tấm ván nhân vật đang đứng lên, còn vệt bầu dục mờ dần ở mép mới ra bóng đổ. Đây là
  // nét duy nhất trong phòng dùng đường cong - canvas khử răng cưa cho path bất kể
  // imageSmoothing, nên nó mượt ở mọi bậc phóng.
  if (info.shadow) {
    g.save();
    // Không hạ thêm globalAlpha: OF.pal.shadow ĐÃ là màu có alpha (.16), nhân thêm lần nữa
    // là cái bóng mờ tới mức không còn thấy trên nền sàn sáng.
    g.fillStyle = OF.pal.shadow;
    g.beginPath();
    g.ellipse(info.x + SW / 2, info.y + SH - 0.6, 5, 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.save();
  // Ô trong atlas rộng hơn nhân vật 1 pixel mỗi bên để chứa viền, nên vẽ lệch -1: phần thân
  // vẫn rơi đúng vào (e.x, e.y), còn viền tràn ra ngoài như nó phải thế.
  //
  // Sub-agent bị thu 0.8 lần - tỷ lệ lẻ, nên luôn phải nội suy dù bậc phóng có chia hết hay
  // không, nếu không những nét mảnh 1/3 pixel rơi rụng lỗ chỗ.
  g.imageSmoothingEnabled = OF.spriteSmooth || info.small;
  g.imageSmoothingQuality = 'high';
  // Cắt bớt phần dưới sprite khi bối cảnh yêu cầu (người ngồi trên xe: chân khuất sau thân
  // xe). Cắt ở NGUỒN chứ không che bằng một mảng màu đè lên: che thì cái đè phải khớp đúng
  // màu nền, mà nền lại đổi theo theme và theo kiểu nền.
  const cut = info.cut || 0;
  const ssh = sh - cut * SS;
  const ddh = dh - cut;
  if (info.small) {
    // sub-agent vẽ nhỏ hơn một chút để phân biệt với người gọi nó mà không cần chú thích
    g.translate(info.x + SW / 2, info.ey + SH);
    g.scale(0.8, 0.8);
    g.translate(-SW / 2, -SH);
    g.drawImage(atlas.canvas, sx, sy, sw, ssh, -1, -1, dw, ddh);
  } else if (info.flip) {
    g.translate(info.x + SW, info.ey);
    g.scale(-1, 1);
    g.drawImage(atlas.canvas, sx, sy, sw, ssh, -1, -1, dw, ddh);
  } else {
    g.drawImage(atlas.canvas, sx, sy, sw, ssh, info.x - 1, info.ey - 1, dw, ddh);
  }
  g.restore();
}

/** Con mèo và các sinh vật nền vẽ từ atlas (mèo) hoặc bằng hàm riêng của bối cảnh.
 *
 *  Vẽ ở toạ độ ĐÃ LÀM TRÒN, và đó là cặp đôi bắt buộc của luật 2 ở mục sinh vật nền: chữ ký
 *  chỉ đổi khi toạ độ làm tròn đổi, nên nếu vẽ ở toạ độ thô thì khung được vẽ ra rơi vào một
 *  lệch pha sub-pixel ngẫu nhiên - con vật đi giật cục không đều. Làm tròn cả hai phía thì nó
 *  bước đúng từng pixel một, đều đặn, và đó cũng là cách pixel art vốn di chuyển. */
function drawAmbient(g) {
  OF.amb.forEach((c) => {
    const cx = Math.round(c.x);
    const cy = Math.round(c.y);
    if (c.draw) { c.draw(g, OF.pal, c, cx, cy); return; }
    const [sx, sy, sw, sh] = OF.atlas.catCell(Math.floor(c.anim * 5) % 2);
    const dw = sw / SPRITE_SS, dh = sh / SPRITE_SS;
    g.save();
    g.imageSmoothingEnabled = OF.spriteSmooth;
    g.imageSmoothingQuality = 'high';
    if (c.flip) {
      g.translate(cx + dw - 2, cy);
      g.scale(-1, 1);
      g.drawImage(OF.atlas.canvas, sx, sy, sw, sh, -1, -1, dw, dh);
    } else {
      g.drawImage(OF.atlas.canvas, sx, sy, sw, sh, cx - 1, cy - 1, dw, dh);
    }
    g.restore();
  });
}

/** Bong bóng + tên chỗ. Cả hai là chữ ở cỡ MÀN HÌNH cố định, còn cảnh vật thì co theo bậc
 *  phóng - nên ở bậc 1 (panel hẹp của VSCode) một cái tên rộng gấp đôi cái bàn và cả khung
 *  hình thành một đống chữ chồng nhau. Bậc đó bỏ chữ đi: màu màn hình đã nói đủ ai đang làm
 *  gì, còn cần biết tên thì bấm vào. */
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

    // Người đang ở chỗ của mình thì treo bong bóng lên phía trên chỗ đó. Neo theo đầu nhân
    // vật như lúc đứng thì nó đúng vào vùng màn hình và che mất mấy dòng chữ đang chạy.
    const seated = e.mode === 'sit' && e.station;
    const cx = (seated ? e.station.labelX : e.x + SPRITE_W / 2) * OF.scale;
    const top = (seated ? e.station.bubbleY : e.y - 3) * OF.scale;
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

  // Tên người ở mỗi chỗ, đặt DƯỚI chân nhân vật. Để ngang thân thì chữ đè lên người, mà tên
  // chỗ bên cạnh cũng chạm vào nhau - bề rộng một chỗ chỉ có chừng 34 pixel gốc.
  g.font = '600 9px system-ui, -apple-system, Segoe UI, sans-serif';
  g.textAlign = 'center';
  OF.ents.forEach((e) => {
    if (e.kind !== 'agent' || !e.station || e.mode !== 'sit') return;
    const d = e.data || {};
    let name = d.title || d.name || '';
    if (name.length > 15) name = name.slice(0, 14) + '…';
    if (!name) return;
    // Tên viết thẳng lên nền nên phải tương phản với NỀN CỦA BỐI CẢNH, không phải với sàn văn
    // phòng. Cỏ của Nông trại tối ở cả hai theme, mà `--of-label` ở theme sáng lại là màu tối:
    // để nguyên thì tên agent thành chữ tối trên nền tối, gần như không đọc được.
    g.fillStyle = (CS().labelColor && CS().labelColor(OF.pal)) || OF.pal.label;
    g.globalAlpha = OF.sel === e.id ? 1 : 0.72;
    // nameY chứ không xa hơn: bong bóng của dãy PHÍA DƯỚI treo ở bubbleY, tức 15 pixel màn
    // hình phía trên mép trên màn hình dãy đó. Đẩy tên xuống thêm là hai thứ chồng nhau.
    g.fillText(name, e.station.labelX * OF.scale, e.station.nameY * OF.scale);
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

/** Viền quanh chỗ đang trỏ vào / đang mở chi tiết. */
function drawStationMark(g, st, color, dash) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = 1;
  if (dash) g.setLineDash([2, 2]);
  // `box` là vùng bấm, tính theo mép NGOÀI và bao gồm cả hai mép; nét vẽ thì nằm giữa pixel
  // nên phải lùi vào nửa pixel, còn chiều cao trừ 2 để mép dưới không đè lên tên viết ở dưới.
  g.strokeRect(st.box.x + 0.5, st.box.y + 0.5, st.box.w - 1, st.box.h - 2);
  g.restore();
}

function draw() {
  const g = OF.ctx;
  const k = OF.scale * OF.dpr;
  g.setTransform(k, 0, 0, k, 0, 0);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, ROOM_W, ROOM_H);

  bakeBackground();
  g.drawImage(OF.bg, 0, 0);
  if (CS().drawAnimated) CS().drawAnimated(g, OF.pal);

  const sc = CS();
  const byStation = new Map();
  OF.ents.forEach((e) => { if (e.station && e.kind === 'agent' && !e.leaving) byStation.set(e.station, e); });
  const ents = Array.from(OF.ents.values()).sort((a, b) => a.y - b.y);

  // Vẽ theo DẢI CHIỀU SÂU: mỗi dải vẽ chỗ làm việc trước, người trong dải đó, rồi phần chỗ
  // làm việc phải nằm ĐÈ lên người (tựa ghế). Đó là thứ làm người trông như lọt vào lòng ghế
  // thay vì đứng úp mặt vào nó - và cũng là lý do lối đi không được cắt qua vùng vẽ đè.
  sc.bands().forEach((band) => {
    const sts = OF.stations.filter((st) => st.row === band.row);
    if (sc.drawStation) sts.forEach((st) => sc.drawStation(g, st, byStation.get(st)));
    ents.filter((e) => e.y >= band.lo && e.y < band.hi).forEach((e) => {
      const info = entityInfo(e);
      if (sc.drawUnder) sc.drawUnder(g, e, info);
      drawEntity(g, e, info);
      if (sc.drawOver) sc.drawOver(g, e, info);
    });
    if (sc.drawAfter) sts.forEach((st) => sc.drawAfter(g, st, byStation.get(st)));
  });

  drawAmbient(g);
  drawConfetti(g);          // trên cùng: bông bay trước mặt mọi người, không nấp sau bàn

  if (OF.hover && OF.hover !== OF.sel) {
    const e = OF.ents.get(OF.hover);
    if (e && e.station) drawStationMark(g, e.station, OF.pal.bubbleFg, true);
  }
  if (OF.sel) {
    const e = OF.ents.get(OF.sel);
    if (e && e.station) drawStationMark(g, e.station, ACTION_COLOR[currentAction(e)] || '#fff', false);
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
  // Nhân vật vẽ ở lưới con, nên một pixel của atlas ra đúng (scale*dpr / SPRITE_SS) pixel màn
  // hình. Chia hết thì phóng nguyên lần, tắt nội suy cho nét đanh. Không chia hết thì BẬT nội
  // suy: lấy mẫu gần nhất ở tỷ lệ lẻ sẽ bỏ rơi hàng thì hàng không, và những nét mảnh 1/3
  // pixel - viền, chấm loá trong mắt - biến mất chỗ có chỗ không, nhìn như hình bị rách.
  // Đồ đạc và nền vẫn vẽ ở pixel gốc và vẫn tắt nội suy, chỉ nhân vật đi đường này.
  // Farm dùng SPRITE_SS_FARM=4, hệ 16x20 dùng SPRITE_SS=3. Chọn hệ theo scene hiện tại.
  const SS = CS().id === 'farm2' ? SPRITE_SS_FARM : SPRITE_SS;
  OF.spriteSmooth = (OF.scale * OF.dpr) % SS !== 0;
  if (OF.ctx) OF.ctx.imageSmoothingEnabled = false;
  invalidate();
  if (OF.on) draw();
}

/* ------------------------------------------------------------- tương tác */

/** Toạ độ khung hình (pixel gốc) từ toạ độ chuột. */
function roomPos(clientX, clientY) {
  const r = OF.canvas.getBoundingClientRect();
  return { x: (clientX - r.left) / OF.scale, y: (clientY - r.top) / OF.scale };
}

/** Bắt theo THÂN nhân vật ở vị trí hiện tại - khác stationAt (bắt theo cụm chỗ làm việc).
 *  Người đi vòng vòng vẫn giữ chỗ, nên nếu chỉ có stationAt thì hover vào chính họ giữa
 *  khung hình không ăn gì. */
function entAt(clientX, clientY) {
  const { x, y } = roomPos(clientX, clientY);
  const H = CS().id === 'farm2' ? SPRITE_H_FARM : SPRITE_H;
  for (const [id, e] of OF.ents) {
    if (e.kind !== 'agent') continue;
    if (x >= e.x - 1 && x <= e.x + SPRITE_W + 1 && y >= e.y - 1 && y <= e.y + H + 1) return id;
  }
  return null;
}

function stationAt(clientX, clientY) {
  const { x, y } = roomPos(clientX, clientY);
  for (const [id, e] of OF.ents) {
    if (e.kind !== 'agent' || !e.station) continue;
    const b = e.station.box;
    // Vùng bấm gộp cả chỗ ngồi lẫn đồ đạc quanh nó - bấm vào đâu trong cụm đó cũng được
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return id;
  }
  return null;
}

/** Đặt người đang được rê chuột. Đáp lại thế nào thì tuỳ họ ĐANG LÀM GÌ - và đó là toàn bộ
 *  nội dung của hàm này:
 *
 * | Đang | Rê chuột vào | Bỏ chuột ra |
 * | --- | --- | --- |
 * | Ở chỗ làm việc | ngoái lại nhìn `GLANCE_SEC` giây rồi làm tiếp, **không rời chỗ** | không đổi gì |
 * | Rảnh, đi vòng vòng | dừng lại, quay mặt ra chờ | đi tiếp |
 * | Đang rời đi | không đáp lại gì | - |
 *
 * **Người đang ở chỗ thì tuyệt đối không đụng vào `path`/`goal`/`mode`.** Bản trước xoá cả ba
 * cho mọi người, nên rê chuột vào một người đang gõ phím là `goal` mất, vòng sau step() thấy
 * "có việc mà chưa về chỗ" nên cho họ đứng dậy đi vòng qua hông bàn rồi ngồi lại - nhìn như
 * nhân vật giật mình nhảy khỏi ghế. Đó cũng chính là cú xoá đã làm người đang trên đường ra
 * cửa kẹt lại thành nhân vật ma.
 *
 * Cú ngoái lại TỰ HẾT sau `GLANCE_SEC`; rê chuột vào lần nữa thì diễn lại. Không cần gỡ lúc
 * bỏ chuột ra - để nguyên cho họ nhìn hết một nhịp trông tự nhiên hơn là quay ngoắt đi giữa
 * chừng.
 *
 * Ba chỗ bắt buộc phải qua hàm này chứ đừng sờ thẳng vào `OF.hover`:
 *
 * 1. **Rê chuột RA KHỎI canvas cũng phải gỡ `greet`.** Trước đây `mouseleave` chỉ xoá
 *    `OF.hover`, người được chào giữ `greet = true` vĩnh viễn và đứng chôn chân giữa phòng -
 *    đúng lỗi "bỏ chuột ra rồi mà nó không đi tiếp nữa".
 * 2. **Gỡ `greet` phải kèm gỡ `e.goal`.** Lúc bắt đầu chào ta xoá `e.path` để họ dừng ngay
 *    giữa đường; nếu vẫn để `goal = 'station'` thì nhánh "có việc thì về chỗ" trong step()
 *    không bao giờ chạy lại (nó chỉ chạy khi `goal !== 'station'`) và người đó kẹt luôn.
 * 3. **Người `leaving` thì bỏ qua hết.** Xem bảng trên: giữ chân họ lại là sinh nhân vật ma.
 */
const GLANCE_SEC = 1;

function setHover(id) {
  if (id === OF.hover) return;
  const prev = OF.ents.get(OF.hover);
  if (prev) prev.greet = false;
  const now = OF.ents.get(id);
  if (now && now.kind === 'agent' && !now.leaving) {
    if (now.mode === 'sit') {
      now.glance = GLANCE_SEC;   // ngoái lại một nhịp, vẫn ở nguyên chỗ làm việc
    } else {
      now.greet = true;
      now.path = [];          // dừng ngay giữa đường, không đi nốt tới đích
      now.goal = null;        // để step() cấp đích mới khi thôi chào
      now.dir = 'down';       // quay mặt về phía người xem
      now.mode = 'idle';
    }
  }
  OF.hover = id || null;
}

function onMove(ev) {
  const id = entAt(ev.clientX, ev.clientY) || stationAt(ev.clientX, ev.clientY);
  setHover(id);
  OF.canvas.style.cursor = id ? 'pointer' : 'default';
}

/** Bấm vào ai thì mở chi tiết người đó VÀ cuộn tới đúng phần họ cần. Không cuộn thì bảng
 *  chi tiết mở tận dưới màn hình, bấm xong không thấy gì đổi và tưởng nút hỏng. */
function onClick(ev) {
  const id = entAt(ev.clientX, ev.clientY) || stationAt(ev.clientX, ev.clientY);
  if (!id) return;

  // Cửa sổ nổi không có chỗ bày cây tiến trình, nên bấm vào ai thì báo lên vỏ nhúng để nó
  // mở dashboard đầy đủ ra. Trang bọc của extension nghe `message` này rồi chuyển tiếp
  // tiếp một chặng nữa lên extension host - iframe khác origin nên phải đi hai chặng.
  if (S.pip) {
    const e = OF.ents.get(id);
    const d = (e && e.data) || {};
    try {
      window.parent.postMessage({ command: 'aimon.openPanel', agent: id, pid: d.pid || null }, '*');
    } catch (err) { /* mở thẳng trong browser thì không có ai nghe, kệ */ }
    return;
  }

  if (id === OF.sel) { OF.sel = null; renderDetail(); return; }   // bấm lại thì đóng

  OF.sel = id;
  renderDetail();
  const e = OF.ents.get(id);
  // Bấm xong là thôi chào: chi tiết đã mở ra rồi, giữ họ đứng chờ nữa thì cả khung hình đứng
  // hình trong khi người dùng đang đọc bảng bên dưới. Chỉ đụng tới người ĐANG ĐỨNG chờ - xoá
  // `goal` của người đang ngồi làm việc là họ nhảy khỏi ghế, của người đang ra cửa là họ kẹt
  // lại (xem setHover).
  if (e && e.greet) { e.greet = false; e.goal = null; }
  const busy = e && (e.data || {}).state === 'busy';
  // Đang làm việc thì thứ người ta muốn xem là cây tiến trình; đang rảnh thì gần như chắc
  // chắn là muốn đổi nhân vật.
  requestAnimationFrame(() => {
    const sel = busy ? '#office-detail .kids, #office-detail .empty' : '#office-detail .agent-skins';
    (document.querySelector(sel) || document.getElementById('office-detail'))
      .scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
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
    ${CS().fixedChars ? '' : agentSkinRow(OF.sel, e.charIndex)}
    <div class="h2row"><h2>${t('office.tree_title', { n: root ? root.children.length : 0 })}</h2></div>
    ${tree}
  </div>`);
  // morph() vừa dựng lại DOM nên mấy canvas xem trước đang trống, phải tô ngay sau đó.
  if (!CS().fixedChars) paintCharPreviews();
}

/* ------------------------------------------------------------- vòng dữ liệu */

async function loadPulse() {
  if (!OF.on) return;
  try {
    // `kinds` luôn được gửi, kể cả khi rỗng: server phân biệt "không gửi" (không lọc) với
    // "gửi chuỗi rỗng" (người dùng bỏ chọn hết). Lọc ở server chứ không ở đây vì khung hình
    // chỉ có 10 chỗ - cắt trước rồi mới lọc thì agent bị ẩn vẫn chiếm suất.
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

/** Chú thích màu. Vẽ từ chính ACTION_COLOR nên thêm hoạt cảnh mới là chú thích tự có.
 *  Câu chữ đổi theo bối cảnh: cùng một mã `run`, ở Văn phòng là "chạy lệnh" còn ở Nông trại
 *  là "bổ củi". Khoá i18n vì thế có hậu tố bối cảnh, thiếu thì rơi về khoá chung. */
function renderLegend() {
  const suffix = CS().legendSuffix || '';
  const lbl = (k) => {
    const s = suffix ? t('office.act_' + k + '_' + suffix) : '';
    return s && s.indexOf('office.act_') !== 0 ? s : t('office.act_' + k);
  };
  render('#office-legend', `<span data-key="lg-h">${t('office.legend')}</span>` +
    Object.keys(ACTION_COLOR).filter((k) => k !== 'rest').map((k) =>
      `<span data-key="lg-${k}"><i style="background:${ACTION_COLOR[k]}"></i>${esc(lbl(k))}</span>`
    ).join(''));
}

function renderStatus() {
  // Bỏ người đang đi ra: họ còn trên màn hình thêm vài giây nữa cho hết đường đi, nhưng đếm
  // họ vào thì tắt một loại ở thanh lọc xong con số vẫn y nguyên một lúc - nhìn như bộ lọc
  // không ăn.
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
  OF.pal = readPalette();

  initScene();       // trước initRoom và initPack: cả hai đều hỏi bối cảnh đang chọn
  // File của bối cảnh đã chọn có thể chưa về (xem phần nạp trước ở cuối file). Chạy tạm bằng
  // Văn phòng rồi chuyển sang khi nó tới - `setScene` lo phần dựng lại chỗ và vẽ lại.
  const wantScene = wantedSceneId();
  if (wantScene !== OF.scene) loadScene(wantScene).then((okScene) => { if (okScene) setScene(wantScene); });
  initRoom();
  initPack();
  buildScene();
  ensureAtlas();     // sau initPack: phải biết bộ nào đang chọn thì mới biết nướng gì
  ensureAtlasFarm(); // vô hại nếu không phải farm-v2: hàm tự no-op theo bối cảnh

  OF.canvas.addEventListener('mousemove', onMove);
  OF.canvas.addEventListener('mouseleave', () => setHover(null));
  OF.canvas.addEventListener('click', onClick);
  window.addEventListener('resize', resize);

  renderScenes();
  renderRooms();
  renderPacks();
  const scenes = document.getElementById('office-scenes');
  if (scenes) {
    scenes.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-scene]');
      if (b) setScene(b.dataset.scene);
    });
  }
  const rooms = document.getElementById('office-rooms');
  if (rooms) {
    rooms.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-room]');
      if (b) setRoom(b.dataset.room);
    });
  }
  const skins = document.getElementById('office-skins');
  if (skins) {
    skins.addEventListener('click', (ev) => {
      const del = ev.target.closest('[data-del]');
      if (del) { ev.stopPropagation(); deleteCustomPack(del.dataset.del); return; }
      if (ev.target.closest('button[data-add]')) { document.getElementById('office-file').click(); return; }
      const b = ev.target.closest('button[data-pack]');
      if (b) setPack(b.dataset.pack);
    });
    const file = document.getElementById('office-file');
    if (file) {
      file.addEventListener('change', () => {
        importPackFile(file.files && file.files[0]);
        file.value = '';        // chọn lại đúng file đó lần nữa vẫn phải bắn sự kiện
      });
    }
  }
  // Ô xem trước chỉ vẽ khi bảng thật sự mở ra - xem chú thích ở renderPacks.
  ['office-scenebox', 'office-roombox', 'office-skinbox'].forEach((idb) => {
    const box = document.getElementById(idb);
    if (box) box.addEventListener('toggle', () => { if (box.open) paintCharPreviews(); });
  });
  // Mở bảng chọn bối cảnh là lúc DUY NHẤT cần hình của bối cảnh chưa dùng tới, nên kéo file
  // về đúng lúc đó rồi vẽ lại ô xem trước.
  const sceneBox = document.getElementById('office-scenebox');
  if (sceneBox) {
    sceneBox.addEventListener('toggle', () => {
      if (sceneBox.open) loadAllScenes().then(renderScenes);
    });
  }

  OF.ready = true;
  resize();

  // Nạp bộ người dùng đã nhập trước đó. Chạy nền: dựng canvas từ PNG là bất đồng bộ, chờ nó
  // thì khung hình đứng mất một nhịp mà chẳng được gì.
  loadCustomPacks().then((n) => {
    if (!n) return;
    initPack();          // bộ đã cất giờ mới tồn tại, chọn lại cho đúng
    reskinAll();
    renderPacks();
  });
}

function officeStart() {
  officeInit();
  if (!OF.canvas || OF.on) return;
  if (OF.freeTimer) { clearTimeout(OF.freeTimer); OF.freeTimer = null; }
  OF.on = true;
  OF.pal = readPalette();       // theme có thể đã đổi từ lần mở trước
  OF.last = 0;
  ensureAtlas();                // vùng nhớ ảnh có thể đã bị thả trong lúc rời tab
  ensureAtlasFarm();            // như trên, cho atlas 16x16 của farm-v2
  invalidate();                 // canvas vừa bị dọn lúc đóng tab, phải vẽ lại từ đầu
  resize();
  loadPulse();
  OF.timer = setInterval(loadPulse, PULSE_MS);
  OF.raf = requestAnimationFrame(tick);
  renderLegend();
  renderDetail();
}

function officeStop() {
  OF.on = false;
  OF.confetti.length = 0;   // không giữ bông của lần trước, mở lại tab là thấy nó treo lơ lửng
  if (OF.timer) { clearInterval(OF.timer); OF.timer = null; }
  if (OF.raf) { cancelAnimationFrame(OF.raf); OF.raf = null; }
  // Trả lại vùng nhớ ảnh nếu người dùng không quay lại. Hẹn giờ chứ không thả ngay: bấm nhầm
  // sang tab khác rồi bấm lại là chuyện thường.
  if (OF.freeTimer) clearTimeout(OF.freeTimer);
  OF.freeTimer = setTimeout(freeAtlas, ATLAS_IDLE_MS);
}

/** Tab đang mở là Văn phòng thì chạy, không thì dừng hẳn - kể cả vòng gọi /api/pulse. */
function officeSync() {
  const pane = document.getElementById('pane-office');
  // pageVisible() ở app.js: nó tính cả trường hợp vỏ nhúng giấu webview - thứ mà
  // document.hidden không bắt được. Vòng vẽ 60 fps chạy trong panel đã thu gọn là phần
  // tốn CPU nhất của cả tool mà không ai nhìn thấy.
  const visible = !!pane && pane.classList.contains('on') && pageVisible();
  if (visible) officeStart(); else officeStop();
}

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-act="of-close"]');
  if (b) { OF.sel = null; renderDetail(); return; }
  // Bấm một nhân vật trong dãy => đổi riêng cho agent đang mở, không đụng ai khác.
  const pick = ev.target.closest('.agent-skins button[data-char]');
  if (pick && OF.sel) setCharFor(OF.sel, +pick.dataset.char);
});
document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => setTimeout(officeSync, 0)));
document.addEventListener('visibilitychange', officeSync);

/** app.js gọi khi người dùng bấm thanh lọc loại agent. Không xoá sạch nhân vật đang có:
 *  `syncAgents` thấy ai không còn trong payload sẽ cho người đó đi ra, nên tắt một loại là
 *  thấy đúng cảnh mấy người đó rời khung hình. */
function officeKindsChanged() {
  if (OF.on) loadPulse();
}

/** app.js gọi khi đổi ngôn ngữ hoặc đổi theme, để khung hình vẽ lại đúng bảng màu / câu chữ. */
function officeRefresh() {
  if (!OF.ready) return;
  OF.pal = readPalette();
  invalidate();
  renderLegend();
  renderStatus();
  renderDetail();
  renderPacks();      // tên bộ phải đổi theo ngôn ngữ
  renderRooms();      // và xem trước phải đổi theo bảng màu của theme
  renderScenes();
  if (OF.on) draw();
}

/* =============================================================================
 * BỐI CẢNH VĂN PHÒNG
 *
 * Bối cảnh đầu tiên, và là bối cảnh mặc định. Mọi thứ dưới đây từng là hằng số toàn cục của
 * file - chuyển vào đây NGUYÊN KHỐI, không viết lại một dòng nào, để cái refactor tách lớp
 * không kéo theo lỗi hình.
 * ========================================================================== */

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

const CAT_LANE = ROOM_H - 12;

const CHAIR_X = 7;              // lệch so với desk.x; nhân vật ngồi ở desk.x + 9
const CHAIR_W = 20;

function officeStations() {
  const out = [];
  ROW_Y.forEach((y, row) => {
    DESK_X.forEach((x) => {
      const monY = y - MON_H;
      out.push({
        id: 'd' + row + '.' + x,
        x, y, row,
        seatX: x + (DESK_W - SPRITE_W) / 2,
        seatY: y + 5,                       // đầu nhô lên che mép dưới của bàn
        monX: x + (DESK_W - MON_W) / 2,
        monY,
        // Chỗ đứng cho sub-agent: ngay cạnh bàn của người gọi nó, để nhìn là biết của ai
        helpers: [
          { x: x - 15, y: y + 16 },
          { x: x + DESK_W + 1, y: y + 16 },
        ],
        // Vùng bấm gộp cả màn hình, mặt bàn và chỗ ngồi.
        box: { x: x - 2, y: monY - 2, w: DESK_W + 4, h: y + DESK_H + 24 - monY },
        labelX: x + DESK_W / 2,
        bubbleY: monY - 1,
        nameY: y + DESK_H + 26,
      });
    });
  });
  return out;
}

/** Khe trống cạnh bàn, tính theo mép TRÁI của sprite.
 *
 * Ghế choán từ `desk.x + 5` tới `desk.x + 29`, mà chỗ ngồi lại nằm phía trên ghế. Đi thẳng
 * từ lối đi lên chỗ ngồi là chui XUYÊN qua ghế từ dưới lên - nhìn như người mọc ra từ gầm
 * ghế. Phải vòng ra khe giữa hai bàn rồi mới bước NGANG vào ghế, và lúc rời bàn thì làm
 * ngược lại. Chọn khe gần chỗ đang đứng hơn để không phải đi vòng cả cái bàn.
 */
function deskSideX(desk, fromX) {
  const left = desk.x - 12;
  const right = desk.x + DESK_W - 4;
  return Math.abs(fromX - left) <= Math.abs(fromX - right) ? left : right;
}

/** Đường đi từ vị trí hiện tại tới đích, luôn men theo lối đi thay vì xuyên qua bàn.
 *  `seat` khác null nghĩa là đích là chỗ ngồi của cái bàn đó - phải tiếp cận từ bên hông. */
function officeRoute(e, tx, ty, seat) {
  const path = [];
  const curAisle = e.y < ROW_Y[1] ? AISLE_Y[0] : AISLE_Y[1];
  const dstAisle = ty < ROW_Y[1] ? AISLE_Y[0] : AISLE_Y[1];

  if (e.mode === 'sit' && e.station) {
    const sx = deskSideX(e.station, e.x);
    path.push({ x: sx, y: e.y });          // bước ngang khỏi ghế trước
    path.push({ x: sx, y: curAisle });     // rồi mới xuống lối đi
  } else if (e.mode === 'sit') {
    path.push({ x: e.x, y: curAisle });    // sub-agent đứng cạnh bàn, không có ghế để tránh
  }
  if (curAisle !== dstAisle) {
    // Đổi dãy thì phải vòng qua lối dọc sát tường, đi thẳng là xuyên qua dãy bàn ở giữa
    const cx = Math.abs(e.x - CORRIDOR_X[0]) < Math.abs(e.x - CORRIDOR_X[1])
      ? CORRIDOR_X[0] : CORRIDOR_X[1];
    path.push({ x: cx, y: curAisle });
    path.push({ x: cx, y: dstAisle });
  }
  if (seat) {
    const from = path.length ? path[path.length - 1].x : e.x;
    const sx = deskSideX(seat, from);
    path.push({ x: sx, y: dstAisle });     // tới ngang khe
    path.push({ x: sx, y: ty });           // lên ngang tầm ghế, đi trong khe nên không đụng ghế
    path.push({ x: tx, y: ty });           // bước ngang vào ngồi
  } else {
    path.push({ x: tx, y: dstAisle });
    path.push({ x: tx, y: ty });
  }
  e.path = path;
}

function clockOnWall(g, p, x) {
  px2(g, x, 6, 12, 12, p.outline);
  px2(g, x + 1, 7, 10, 10, '#f4f6fb');
  const hand = OF.clock * 0.6;
  px2(g, x + 6 + Math.round(Math.cos(hand) * 3), 12 + Math.round(Math.sin(hand) * 3), 1, 1, p.outline);
}

/* Mỗi kiểu nền chỉ đổi SÀN, TƯỜNG và ĐỒ TRANG TRÍ. Hình học của phòng - vị trí bàn, ghế, lối
 * đi, lối dọc, cửa - dùng chung hằng số ở trên và KHÔNG kiểu nào được đụng vào. Nhờ vậy đổi
 * kiểu nền thì không có gì lệch được: nhân vật vẫn ngồi đúng chỗ cũ, bàn vẫn đúng chỗ cũ.
 *
 * Màu cũng lấy từ đúng bảng màu chung (`readPalette`), chỉ dùng lại theo vai trò khác - ví
 * dụ tường gạch mượn màu bàn. Nhờ vậy không phải thêm biến CSS cho từng kiểu, và kiểu nào
 * cũng tự đúng ở cả nền sáng lẫn nền tối.
 */
const OFFICE_ROOMS = [
  {
    id: 'classic',
    draw(g, p) {
      floorTiles(g, p, 8);
      px2(g, 0, 0, ROOM_W, WALL_H, p.wall);
      px2(g, 0, WALL_H - 3, ROOM_W, 3, p.wallDark);
      windowOnWall(g, p, 40, 46);
      windowOnWall(g, p, 150, 46);
      potPlant(g, p, 244, 32);
      potPlant(g, p, 8, 32);
    },
  },
  {
    id: 'library',
    draw(g, p) {
      floorPlanks(g, p);
      px2(g, 0, 0, ROOM_W, WALL_H, p.wallDark);
      px2(g, 0, WALL_H - 3, ROOM_W, 3, p.deskDark);
      // Hai kệ sách: mỗi kệ hai tầng, gáy sách cao thấp so le cho khỏi phẳng
      [12, 150].forEach((sx) => {
        px2(g, sx, 3, 98, 19, p.desk);
        [4, 13].forEach((sy) => {
          px2(g, sx + 1, sy, 96, 8, p.deskDark);
          for (let i = 0; i < 24; i++) {
            const bx = sx + 2 + i * 4;
            if (bx > sx + 94) break;
            const hh = 4 + ((i * 7 + sy) % 4);
            const col = [p.plant, p.sky, p.rug, p.chair][(i + sy) % 4];
            px2(g, bx, sy + 8 - hh, 3, hh, col);
          }
        });
      });
    },
  },
  {
    id: 'loft',
    draw(g, p) {
      floorTiles(g, p, 13);
      // Tường gạch: mượn màu bàn, hàng lệch nhau nửa viên
      px2(g, 0, 0, ROOM_W, WALL_H, p.deskDark);
      for (let y = 0; y < WALL_H - 3; y += 5) {
        px2(g, 0, y, ROOM_W, 4, p.desk);
        for (let x = ((y / 5) % 2) * 9; x < ROOM_W; x += 18) px2(g, x, y, 1, 4, p.deskDark);
      }
      px2(g, 0, WALL_H - 3, ROOM_W, 3, p.deskDark);
      windowOnWall(g, p, 78, 104);   // một cửa sổ lớn giữa tường
      potPlant(g, p, 244, 32);
    },
  },
  {
    id: 'garden',
    draw(g, p) {
      floorTiles(g, p, 8);
      px2(g, 0, 0, ROOM_W, WALL_H, p.wall);
      px2(g, 0, WALL_H - 3, ROOM_W, 3, p.wallDark);
      windowOnWall(g, p, 96, 68);
      // Giàn cây leo rủ từ trần xuống, độ dài so le
      for (let x = 2; x < ROOM_W; x += 7) {
        const len = 4 + ((x * 3) % 9);
        px2(g, x, 0, 3, len, p.plant);
        px2(g, x + 1, len, 1, 2, p.plant);
      }
      potPlant(g, p, 244, 32);
      potPlant(g, p, 8, 32);
      potPlant(g, p, 26, 34);
    },
  },
];

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

  drawChairBase(g, desk);

  // mặt bàn
  px2(g, desk.x, desk.y, DESK_W, DESK_H, p.desk);
  px2(g, desk.x, desk.y, DESK_W, 2, p.deskDark);
  px2(g, desk.x + 1, desk.y + DESK_H, 2, 4, p.deskDark);
  px2(g, desk.x + DESK_W - 3, desk.y + DESK_H, 2, 4, p.deskDark);
  // bàn phím
  px2(g, desk.x + 10, desk.y + 4, 14, 4, p.metal);
}

/* Ghế chia làm HAI phần vẽ ở hai thời điểm khác nhau, và đó là toàn bộ mấu chốt:
 *
 * - `drawChairBase` vẽ TRƯỚC nhân vật - cột và chân đế nằm hẳn dưới, không đè ai.
 * - `drawChairBack` vẽ SAU nhân vật - tựa lưng che phần hông, nên người trông như lọt vào
 *   lòng ghế.
 *
 * Bản đầu vẽ cả cái ghế trước nhân vật bằng một hình chữ nhật 20x9 đặc. Kết quả: tựa lưng
 * nằm dưới thân người và thò ra thành một tấm ván to phía sau, nhìn hệt như người đang đứng
 * úp mặt vào cái ghế chứ không phải ngồi lên nó - đúng phản hồi nhận được.
 *
 * Tựa lưng chỉ cao tới ngang hông chứ không kín lưng như ghế văn phòng thật: cả app này xoay
 * quanh việc nhận ra ai là ai qua màu áo, che hết áo thì mọi bộ nhân vật thành một màu.
 */
function drawChairBase(g, desk) {
  const p = OF.pal;
  const cx = desk.x + CHAIR_X;
  const top = desk.y + DESK_H + 12;                       // ngay dưới đáy tựa lưng
  px2(g, cx + 8, top, 4, 2, p.chairDark);                 // cột giữa
  px2(g, cx + 3, top + 2, 14, 2, p.chairDark);            // đế nằm ngang
  px2(g, cx + 2, top + 3, 2, 1, p.chair);                 // hai bánh xe
  px2(g, cx + 16, top + 3, 2, 1, p.chair);
}

/* Tựa lưng đè lên ĐÚNG ba hàng cuối của thân (hàng 13-15 của sprite), chừa lại ba hàng vai
 * và áo phía trên. Đè sâu hơn thì mọi bộ nhân vật thành một màu ghế; đè nông hơn thì hở một
 * vệt thân dưới đáy ghế, nhìn như người bị cắt đôi. */
function drawChairBack(g, desk) {
  const p = OF.pal;
  const cx = desk.x + CHAIR_X;
  const cy = desk.y + DESK_H + 7;
  // Bo hai góc trên bằng cách chừa 1 pixel mỗi bên ở hàng đầu, đủ để không ra hình hộp diêm.
  px2(g, cx + 1, cy, CHAIR_W - 2, 1, p.chairDark);
  px2(g, cx, cy + 1, CHAIR_W, 3, p.chair);
  px2(g, cx, cy + 4, CHAIR_W, 1, p.chairDark);            // mép dưới, tách khỏi cột
  // Tay vịn: hai mẩu nhô ra hai bên, thứ làm nó đọc ra "ghế" chứ không phải một khối màu.
  px2(g, cx - 2, cy, 2, 4, p.chairDark);
  px2(g, cx + CHAIR_W, cy, 2, 4, p.chairDark);
}

function frameFor(e) {
  const sc = CS();
  if (sc.frameFor) {
    const f = sc.frameFor(e);
    if (f) return f;
  }
  const d = e.data || {};
  // Nhảy ăn mừng bằng cách đảo qua lại hai khung có sẵn thật nhanh, không phải vẽ thêm
  // khung nào. Ngồi thì đảo hai tư thế ngồi (nhún trên ghế), đứng thì đảo hai bước chân.
  if (e.cheer > 0) {
    const beat = Math.floor(e.anim * 9) % 2;
    return e.mode === 'sit' ? (beat ? 'k1' : 'k0') : (beat ? 'd1' : 'd2');
  }
  const walking = e.path.length > 0;
  if (walking) {
    const s = Math.floor(e.anim * 6) % 4;
    const step = s === 1 ? 1 : s === 3 ? 2 : 0;
    if (e.dir === 'up') return 'u' + step;
    if (e.dir === 'down') return 'd' + step;
    return 's' + step;
  }
  if (e.mode !== 'sit') return 'd0';
  // Ngoái lại nhìn người vừa rê chuột vào. Đặt TRƯỚC nhánh 'paused' và nhánh gõ phím: đang
  // gõ mà ngoái lại vẫn phải thấy mặt, nếu không cú đáp lại chỉ hiện ra với người đang rảnh -
  // tức gần như không bao giờ.
  if (e.glance > 0) return 'kf';
  if (d.state === 'paused') return 'k3';
  const act = currentAction(e);
  if (act === 'rest') return 'k0';
  if (act === 'read' || act === 'web') return 'k0';   // đọc thì ngồi yên, không gõ
  return Math.floor(e.anim * 7) % 2 ? 'k1' : 'k2';
}

registerScene({
  id: 'office',
  stationCount: 10,          // 2 dãy x 5 bàn - xem MIN_STATIONS
  defaultPack: 'voyage',
  defaultRoom: 'classic',
  rooms: OFFICE_ROOMS,
  // Không snap: bối cảnh này không có đạo cụ bám nhân vật, nên giữ nguyên chuyển động mượt
  // dưới pixel như bản trước.
  snap: false,

  stations: officeStations,
  route: officeRoute,
  behave: behaveDefault,
  entry: () => ({ x: -20, y: AISLE_Y[1] }),
  exit: () => ({ x: -22, y: AISLE_Y[1] }),
  wanderTarget: () => ({
    x: 14 + Math.random() * (ROOM_W - 44),
    y: AISLE_Y[1] + Math.random() * 8,
  }),
  bands: () => [
    { row: 0, lo: -Infinity, hi: ROW_Y[1] },
    { row: 1, lo: ROW_Y[1], hi: Infinity },
  ],

  drawStatic(g, p, roomId) {
    (OFFICE_ROOMS.find((r) => r.id === roomId) || OFFICE_ROOMS[0]).draw(g, p);
    // Phần dùng chung cho MỌI kiểu nền - đây là chỗ giữ cho không kiểu nào lệch khỏi kiểu
    // nào: thảm ở khu đi lại và cửa ra vào luôn ở đúng một chỗ.
    const rw = ROOM_W - 130;
    px2(g, 60, AISLE_Y[1] + 8, rw, 12, p.rug);
    px2(g, 63, AISLE_Y[1] + 11, rw - 6, 1, p.floor2);
    px2(g, 63, AISLE_Y[1] + 16, rw - 6, 1, p.floor2);

    px2(g, 0, AISLE_Y[1] - 12, 6, 30, p.deskDark);
    px2(g, 1, AISLE_Y[1] - 10, 4, 26, p.desk);
  },
  // Kim đồng hồ nhúc nhích nên không nướng được vào nền tĩnh.
  drawAnimated(g, p) { clockOnWall(g, p, 118); },
  /** Vị trí kim đồng hồ. Không khai ở đây thì chữ ký không đổi lúc phòng đứng yên, và cái
   *  đồng hồ ĐỨNG IM - lỗi này có sẵn từ trước khi tách lớp SCENE, chỉ là ít ai để ý vì phòng
   *  hiếm khi vắng chuyển động. Kim đi hết một vòng trong ~10 giây và chỉ có chừng mười mấy vị
   *  trí rời rạc, nên nó kéo khung hình lên chưa tới 2 fps. */
  sceneSig() {
    const h = OF.clock * 0.6;
    return Math.round(Math.cos(h) * 3) + ',' + Math.round(Math.sin(h) * 3);
  },
  drawPreviewExtras(g, p) {
    officeStations().forEach((d) => {
      px2(g, d.x + 7, d.y + DESK_H + 2, 20, 9, p.chair);
      px2(g, d.x, d.y, DESK_W, DESK_H, p.desk);
      px2(g, d.monX, d.monY, MON_W, MON_H, p.metal);
    });
  },
  drawStation: drawDesk,
  drawAfter: (g, st) => drawChairBack(g, st),

  ambient: () => [{
    x: 120, y: CAT_LANE, tx: 120, ty: CAT_LANE, wait: 2, speed: 14,
    restMin: 1, restVar: 4,
    pick: () => ({ x: 16 + Math.random() * (ROOM_W - 48), y: CAT_LANE + Math.random() * 3 }),
  }],
});

/* Nạp TRƯỚC file của bối cảnh đã chọn, ngay lúc trang dựng chứ không chờ tới lúc mở tab.
 *
 * Chờ tới lúc mở tab vẫn chạy đúng (`officeInit` có nhánh chuyển sang khi file về), nhưng
 * người dùng sẽ thấy Văn phòng nháy lên một nhịp rồi mới đổi sang Nông trại. Kéo về từ đầu
 * thì tới lúc bấm vào tab nó đã sẵn sàng, mà người không dùng bối cảnh nào khác vẫn không
 * tải gì thêm. */
if (wantedSceneId() !== SCENES[0].id) loadScene(wantedSceneId());

/* Bootstrap. Đặt ở DOMContentLoaded chứ không gọi thẳng: `officeSync` đọc `#pane-office`,
 * mà thẻ <script> này nằm trong <body> nên phần DOM phía sau nó chưa dựng xong. */
document.addEventListener('DOMContentLoaded', officeSync);
