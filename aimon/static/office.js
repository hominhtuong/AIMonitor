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
// Rời phòng lâu hơn ngần này giây thì xoá thẳng, không hỏi lý do. Đường ra dài nhất là ăn
// mừng 2 giây rồi đi hết chiều ngang phòng (260 / 26 = 10 giây), nên 20 là rộng gấp đôi:
// không cắt ngang màn ra cửa nào, mà cũng không để nhân vật ma nào ở lại quá vài giây.
const LEAVE_TIMEOUT = 20;

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
  spriteSmooth: false,   // nội suy khi phóng nhân vật? resize() chốt theo bậc phóng
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
  confetti: [],          // bông giấy của màn ăn mừng lúc một phiên xong việc
  last: 0,
  clock: 0,
  pal: {},
  // Bộ nhân vật đang áp cho cả phòng. Mỗi agent nhận một nhân vật KHÁC nhau trong bộ;
  // hết nhân vật thì quay vòng dùng lại.
  pack: 'voyage',
  room: 'classic',       // kiểu phòng đang dùng; hình học không đổi, chỉ đổi sàn/tường/trang trí
  slots: new Map(),      // id agent -> chỗ thứ mấy trong bộ
  overrides: new Map(),  // id agent -> khoá "bộ:nhân-vật" do người dùng tự chọn cho riêng người đó
};

/* ------------------------------------------------- chọn bộ nhân vật cho phòng */

const PACK_KEY = 'aimon.pack';
const ROOM_KEY = 'aimon.room';
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

/** Áp lại nhân vật cho mọi người đang có trong phòng. */
function reskinAll() {
  OF.ents.forEach((e) => { e.charIndex = charIndexFor(e.id); });
}

function saveOverrides() {
  const obj = {};
  OF.overrides.forEach((v, k) => { obj[k] = v; });
  try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(obj)); } catch (e) { /* riêng tư */ }
}

/** Đổi bộ cho cả phòng. Bỏ mọi lựa chọn ép riêng: chúng thuộc về bộ cũ, giữ lại thì đổi bộ
 *  xong vẫn còn vài người mang hình bộ trước, nhìn như lỗi. */
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
  renderDetail();
}

function initPack() {
  let saved = null;
  try { saved = localStorage.getItem(PACK_KEY); } catch (e) { /* bỏ qua */ }
  // Cùng thứ tự ưu tiên với bộ lọc loại agent: lựa chọn bấm trên trang thắng tham số của
  // extension, vì đây là sở thích cá nhân chứ không phải ràng buộc của khung nhìn.
  const q = new URLSearchParams(location.search).get('pack');
  const cfg = (window.AIMON_CONFIG || {}).office_pack;
  const pick = saved != null ? saved : (q != null ? q : (cfg || ''));
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
  OF.room = roomById(id).id;
  try { localStorage.setItem(ROOM_KEY, OF.room); } catch (e) { /* riêng tư */ }
  renderRooms();
  if (OF.on) draw();
}

function initRoom() {
  let saved = null;
  try { saved = localStorage.getItem(ROOM_KEY); } catch (e) { /* bỏ qua */ }
  OF.room = ROOMS.some((r) => r.id === saved) ? saved : ROOMS[0].id;
}

/** Bảng chọn kiểu phòng. Mỗi ô là một canvas vẽ THU NHỎ chính căn phòng đó - xem trước phải
 *  là thứ sẽ nhận, không phải một ô màu tượng trưng. */
function renderRooms() {
  const host = document.getElementById('office-rooms');
  if (!host) return;
  if (host.childElementCount !== ROOMS.length) {
    host.textContent = '';
    ROOMS.forEach((r) => {
      const b = document.createElement('button');
      b.className = 'skin room';
      b.dataset.room = r.id;
      b.appendChild(document.createElement('canvas'));
      const nm = document.createElement('span');
      nm.className = 'nm';
      b.appendChild(nm);
      host.appendChild(b);
    });
  }
  Array.from(host.children).forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.room === OF.room));
    const nm = b.querySelector('.nm');
    if (nm) nm.textContent = t('office.room_' + b.dataset.room);
    paintRoomPreview(b.querySelector('canvas'), b.dataset.room);
  });
  const sum = document.querySelector('#office-roombox summary');
  if (sum) sum.textContent = t('office.room_pick');
}

/** Vẽ cả căn phòng vào một canvas nhỏ. Dùng chính `ROOMS[].draw` nên xem trước không bao giờ
 *  lệch khỏi phòng thật, kể cả sau này sửa hình. */
function paintRoomPreview(cv, id) {
  if (!cv || cv.dataset.painted === id + ':' + (OF.pal.floor || '')) return;
  const sc = 0.32;
  cv.width = Math.round(ROOM_W * sc);
  cv.height = Math.round(ROOM_H * sc);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.setTransform(sc, 0, 0, sc, 0, 0);
  g.clearRect(0, 0, ROOM_W, ROOM_H);
  roomById(id).draw(g, OF.pal);
  // vài cái bàn cho ra dáng văn phòng chứ không phải một mảng màu trống
  OF.desks.forEach((d) => {
    px2(g, d.x + 7, d.y + DESK_H + 2, 20, 9, OF.pal.chair);
    px2(g, d.x, d.y, DESK_W, DESK_H, OF.pal.desk);
    px2(g, d.monX, d.monY, MON_W, MON_H, OF.pal.metal);
  });
  cv.dataset.painted = id + ':' + (OF.pal.floor || '');
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

      OF.atlas = buildSpriteAtlas();     // atlas có thêm hàng mới, phải dựng lại
      setPack(id);
      toast(t(note || 'import.done', { n: cells.length, found: found || cells.length }), note ? '' : 'ok');
    })
    .catch(() => toast(t('import.err_read'), 'err'));
}

function deleteCustomPack(id) {
  writeStoredPacks(readStoredPacks().filter((p) => p.id !== id));
  removeCustomPack(id);
  OF.atlas = buildSpriteAtlas();
  if (OF.pack === id) setPack(PACKS[0].id);
  else { reskinAll(); renderPacks(); }
}

/** Bảng chọn bộ: mỗi bộ một ô, xem trước bằng ba nhân vật đầu của bộ đó. */
function renderPacks() {
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
        renderCharPreview(cv, charAt(p.id, i), 2);
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
  const box = document.getElementById('office-skinbox');
  const sum = box && box.querySelector('summary');
  if (sum) sum.textContent = t('office.pack_pick');
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

/** Vẽ nội dung cho mọi canvas xem trước vừa được morph() dựng ra. */
function paintCharPreviews() {
  document.querySelectorAll('canvas[data-char-preview]').forEach((cv) => {
    const gi = +cv.dataset.charPreview;
    if (cv.dataset.painted === String(gi)) return;   // morph giữ lại canvas cũ thì khỏi vẽ lại
    renderCharPreview(cv, gi, 2);
    cv.dataset.painted = String(gi);
  });
}

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
    chair: g('--of-chair', '#4a5570'),
    chairDark: g('--of-chair2', '#333c52'),
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
    leftAt: 0,                   // OF.clock lúc bị đánh dấu rời phòng - lưới an toàn ở step()
    cheer: 0,                    // giây còn lại của màn ăn mừng lúc xong việc
    glance: 0,                   // giây còn lại của cú ngoái lại nhìn khi bị rê chuột vào
  };
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
function routeTo(e, tx, ty, seat) {
  const path = [];
  const curAisle = e.y < ROW_Y[1] ? AISLE_Y[0] : AISLE_Y[1];
  const dstAisle = ty < ROW_Y[1] ? AISLE_Y[0] : AISLE_Y[1];

  if (e.mode === 'sit' && e.desk) {
    const sx = deskSideX(e.desk, e.x);
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

function sendToDesk(e, desk) {
  e.desk = desk;
  e.goal = 'desk';
  e.mode = 'walk';
  routeTo(e, desk.seatX, desk.seatY, desk);
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
  //
  // Tính CẢ người đang ăn mừng (`leaving` nhưng còn giữ `desk`). Bỏ họ ra thì bàn đó được
  // coi là trống ngay, người mới vào ngồi đè lên người đang nhún nhảy ở đó - hai nhân vật
  // chồng lên nhau trên cùng một cái ghế. Họ nhả bàn khi ăn mừng xong, chỉ 2 giây.
  OF.ents.forEach((e) => { if (e.desk) used.add(e.desk); });

  payload.agents.forEach((a) => {
    seen.add(a.id);
    let e = OF.ents.get(a.id);
    if (!e) {
      e = newEntity(a.id, 'agent', charIndexFor(a.id));
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
        se = newEntity(sub.id, 'sub', charIndexFor(sub.id));
        OF.ents.set(sub.id, se);
      }
      se.data = { ...sub, state: 'busy', action: 'work', parent: a.id };
      se.leaving = false;
      if (!se.spot && e.desk) sendToSpot(se, e.desk.helpers[i]);
    });
  });

  // Bỏ chỗ đã giữ của những ai không còn trong phòng: giữ lại thì slotFor() thấy chỗ nào
  // cũng bận và người mới vào toàn phải quay vòng, cả phòng trùng mặt nhau.
  OF.slots.forEach((_, id) => { if (!seen.has(id)) OF.slots.delete(id); });

  // Ai không còn trong danh sách thì xong việc: đứng dậy, ăn mừng một nhịp rồi mới ra cửa.
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
      e.desk = null;
      e.goal = 'exit';
      e.mode = 'walk';
      routeTo(e, -22, AISLE_Y[1]);
    } else if (e.desk && e.mode !== 'sit') {
      // Xong việc lúc đang đi vòng vòng hoặc đang trên đường về bàn: ĐI VỀ GHẾ CỦA MÌNH đã
      // rồi mới ăn mừng. Ăn mừng ngay tại chỗ đang đứng thì nhân vật nhún nhảy giữa lối đi
      // hoặc ngay trước ghế của người khác, nhìn như nhảy nhầm vào bàn thiên hạ.
      e.goal = 'cheer';
      e.mode = 'walk';
      routeTo(e, e.desk.seatX, e.desk.seatY, e.desk);
    } else {
      // Đang ngồi sẵn ở ghế mình: ăn mừng tại chỗ. `e.desk` phải giữ lại tới lúc ăn mừng
      // xong - nó là thứ cho biết bước ngang về phía nào để khỏi trèo qua ghế lúc đi ra.
      startCheer(e);
    }
  });
}

/* Ăn mừng xong việc. Cả hoạt cảnh này chỉ tồn tại vì lúc một phiên kết thúc, nhân vật cứ
 * thế biến mất ở cửa - không có gì đánh dấu "xong rồi". Một nhịp nhảy tại chỗ kèm confetti
 * là đủ để liếc qua cũng biết vừa có việc hoàn thành. */
const CHEER_SEC = 2;
const CONFETTI = ['#f2c14e', '#e8607a', '#5ec2d9', '#7bd88f', '#b28ce0', '#f0913a'];

/** Đang ngồi thì ăn mừng NGUYÊN TRÊN GHẾ - giữ `mode = 'sit'` để còn nhún trên ghế, và để
 *  lúc xong `routeTo` biết mà bước ngang khỏi ghế trước khi đi xuống. Chỉ ai đang đứng sẵn
 *  (đi vòng vòng) mới nhảy giữa sàn. */
function startCheer(e) {
  e.goal = 'cheer';
  if (e.mode !== 'sit') e.mode = 'cheer';
  e.path = [];
  e.cheer = CHEER_SEC;
  spawnConfetti(e.x + SPRITE_W / 2, e.y + 2);
}

/* Toả NGANG mạnh hơn bắn lên: bản đầu `vx` chỉ ±15 nên cả nắm bông bay thẳng đứng, chụm
 * lại ngay trên đỉnh đầu và trông như cặp sừng chứ không như pháo giấy. */
function spawnConfetti(x, y) {
  for (let i = 0; i < 22; i++) {
    OF.confetti.push({
      x: x + (Math.random() - 0.5) * 6,
      y,
      vx: (Math.random() - 0.5) * 54,
      vy: -13 - Math.random() * 20,
      c: CONFETTI[(Math.random() * CONFETTI.length) | 0],
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

/* ------------------------------------------------------------- cập nhật mỗi khung hình */

function step(e, dt) {
  e.anim += dt;
  if (e.glance > 0) e.glance -= dt;

  // LƯỚI AN TOÀN. Phiên tắt là nhân vật phải biến mất, chấm hết - người dùng nhìn vào phòng
  // để biết máy mình đang chạy gì, một nhân vật ma ngồi lại ở bàn là con số trên đầu trang
  // nói một đằng còn căn phòng nói một nẻo (đã gặp thật: header ghi "1 in the room" trong
  // khi có 5 người trên màn hình).
  //
  // Dưới đây có nhánh dựng lại đường ra cho mọi ca kẹt đã biết, nhưng vẫn giữ cái chốt này:
  // nó không cần biết vì sao kẹt. Ngưỡng rộng rãi so với đường đi dài nhất (ăn mừng 2 giây +
  // đi hết chiều ngang phòng ~10 giây) nên nó không bao giờ cắt ngang một màn ra cửa tử tế.
  if (e.leaving && OF.clock - e.leftAt > LEAVE_TIMEOUT) { OF.ents.delete(e.id); return; }

  if (e.burst) {
    e.burst.left -= dt;
    if (e.burst.left <= 0) e.burst = null;
  }
  if (!e.burst && e.queue.length) e.burst = { action: e.queue.shift(), left: BURST_SEC };

  // Ăn mừng cho hết nhịp rồi mới đứng dậy đi ra. `routeTo` chạy lúc mode vẫn còn là 'sit'
  // nên nó tự chèn cú bước ngang khỏi ghế; đổi mode trước khi gọi là mất bước đó và nhân
  // vật lại chui thẳng xuống qua ghế.
  if (e.cheer > 0) {
    e.cheer -= dt;
    if (e.cheer > 0) return;
    e.cheer = 0;
    e.goal = 'exit';
    routeTo(e, -22, AISLE_Y[1]);
    e.mode = 'walk';
    e.desk = null;
    return;
  }

  if (e.path.length) {
    const wp = e.path[0];
    const dx = wp.x - e.x, dy = wp.y - e.y;
    const dist = Math.hypot(dx, dy);
    const move = WALK_SPEED * dt;
    if (dist <= move) {
      e.x = wp.x; e.y = wp.y;
      e.path.shift();
      if (!e.path.length) {
        if (e.goal === 'exit') { OF.ents.delete(e.id); return; }
        // Vừa về tới ghế của mình để ăn mừng: phải đặt `sit` TRƯỚC startCheer, nếu không nó
        // tưởng đang đứng và cho nhún kiểu đứng ngay trên mặt ghế.
        if (e.goal === 'cheer') { e.mode = 'sit'; startCheer(e); return; }
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

  // Hết đường mà vẫn còn trong phòng: dựng lại đường ra. Đây là chỗ vá GỐC của lỗi nhân vật
  // ma - `setHover` xoá `path` và `goal` của người đang được rê chuột, người đang trên đường
  // ra cửa mà dính cú đó thì đứng chôn chân giữa phòng vĩnh viễn, vì mọi nhánh phía dưới đều
  // chỉ dành cho người còn đang làm việc. Người rời phòng chỉ có đúng một việc: ra tới cửa.
  if (e.leaving) {
    if (e.cheer <= 0) {
      // Thứ tự y như nhánh ăn mừng: `routeTo` phải chạy lúc mode còn là 'sit' và `desk` còn
      // đó, nếu không mất cú bước ngang khỏi ghế và nhân vật chui thẳng xuống xuyên qua ghế.
      e.goal = 'exit';
      routeTo(e, -22, AISLE_Y[1]);
      e.mode = 'walk';
      e.desk = null;
    }
    return;
  }

  const d = e.data || {};
  if (e.kind !== 'agent') return;
  // Đang được hover thì đứng lại chờ lệnh. Chỉ giữ khi họ đang rảnh - có việc trở lại thì
  // phải cho về bàn ngay, công việc quan trọng hơn phép lịch sự.
  if (e.greet && d.state === 'wander') return;

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
  stepConfetti(dt);
  draw();
  OF.raf = requestAnimationFrame(tick);
}

/* ------------------------------------------------------------- con mèo
 *
 * Con mèo được vẽ SAU tất cả mọi người nên nó luôn nằm trên cùng. Vì vậy nó phải bị nhốt
 * trong dải sát mép dưới phòng: dải cũ (`AISLE_Y[1] + 4`) trùng đúng lối đi của người, và nó
 * đi ngang qua che mất mặt người đang đi - nhìn như con mèo lơ lửng trước mặt ai đó. Ở dải
 * này nó chỉ còn cắt qua bàn chân, đúng chỗ một con mèo nên ở.
 */

const CAT_LANE = ROOM_H - 12;

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
    c.ty = CAT_LANE + Math.random() * 3;
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

/* ------------------------------------------------------------- các kiểu phòng
 *
 * Mỗi kiểu chỉ đổi SÀN, TƯỜNG và ĐỒ TRANG TRÍ. Hình học của phòng - vị trí bàn, ghế, lối đi,
 * lối dọc, cửa - dùng chung hằng số ở đầu file và KHÔNG kiểu nào được đụng vào. Nhờ vậy đổi
 * kiểu phòng thì không có gì lệch được: nhân vật vẫn ngồi đúng chỗ cũ, bàn vẫn đúng chỗ cũ.
 *
 * Màu cũng lấy từ đúng bảng màu chung (`readPalette`), chỉ dùng lại theo vai trò khác - ví
 * dụ tường gạch mượn màu bàn. Nhờ vậy không phải thêm biến CSS cho từng kiểu, và kiểu nào
 * cũng tự đúng ở cả nền sáng lẫn nền tối.
 */

/** Sàn lát ô cờ - kiểu chung của mọi phòng, chỉ khác kích thước ô. */
function floorTiles(g, p, size) {
  px2(g, 0, WALL_H, ROOM_W, ROOM_H - WALL_H, p.floor);
  for (let y = WALL_H; y < ROOM_H; y += size) {
    for (let x = (((y - WALL_H) / size) % 2) * size; x < ROOM_W; x += size * 2) {
      px2(g, x, y, size, size, p.floor2);
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

function clockOnWall(g, p, x) {
  px2(g, x, 6, 12, 12, p.outline);
  px2(g, x + 1, 7, 10, 10, '#f4f6fb');
  const hand = OF.clock * 0.6;
  px2(g, x + 6 + Math.round(Math.cos(hand) * 3), 12 + Math.round(Math.sin(hand) * 3), 1, 1, p.outline);
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

const ROOMS = [
  {
    id: 'classic',
    draw(g, p) {
      floorTiles(g, p, 8);
      px2(g, 0, 0, ROOM_W, WALL_H, p.wall);
      px2(g, 0, WALL_H - 3, ROOM_W, 3, p.wallDark);
      windowOnWall(g, p, 40, 46);
      windowOnWall(g, p, 150, 46);
      clockOnWall(g, p, 118);
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
      clockOnWall(g, p, 118);
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

function roomById(id) {
  return ROOMS.find((r) => r.id === id) || ROOMS[0];
}

function drawRoom(g) {
  const p = OF.pal;
  roomById(OF.room).draw(g, p);

  // Phần dùng chung cho MỌI kiểu phòng - đây là chỗ giữ cho không kiểu nào lệch khỏi kiểu
  // nào: thảm ở khu đi lại và cửa ra vào luôn ở đúng một chỗ.
  const rw = ROOM_W - 130;
  px2(g, 60, AISLE_Y[1] + 8, rw, 12, p.rug);
  px2(g, 63, AISLE_Y[1] + 11, rw - 6, 1, p.floor2);
  px2(g, 63, AISLE_Y[1] + 16, rw - 6, 1, p.floor2);

  px2(g, 0, AISLE_Y[1] - 12, 6, 30, p.deskDark);
  px2(g, 1, AISLE_Y[1] - 10, 4, 26, p.desk);

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

const CHAIR_X = 7;              // lệch so với desk.x; nhân vật ngồi ở desk.x + 9
const CHAIR_W = 20;

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

function drawEntity(g, e) {
  const [sx, sy, sw, sh] = OF.atlas.cell(e.charIndex, frameFor(e));
  // Atlas vẽ ở lưới con (gấp SPRITE_SS lần), còn cảnh đo bằng pixel gốc - nên đích luôn là
  // kích thước ô CHIA cho SPRITE_SS. Vẽ đúng sw/sh là nhân vật to gấp ba, tràn kín phòng.
  const dw = sw / SPRITE_SS, dh = sh / SPRITE_SS;
  const flip = e.dir === 'left' && e.path.length;
  const small = e.kind === 'sub';

  // Nhún nhảy lúc ăn mừng: cả người nhấc lên 1 pixel theo nhịp, nhưng CÁI BÓNG đứng yên -
  // bóng nhảy theo thì mất luôn cảm giác nhấc chân khỏi sàn.
  const hop = e.cheer > 0 && Math.floor(e.anim * 9) % 2 ? -1 : 0;
  const ey = e.y + hop;

  // Người ngồi không vẽ chân (chân khuất sau ghế), nên cái bóng ở đáy sprite hoá ra một
  // vệt tách rời lơ lửng dưới thân. Ngồi thì bóng cũng khuất sau ghế - bỏ luôn.
  //
  // Bóng là hình BẦU DỤC chứ không phải hình chữ nhật: một thanh chữ nhật dưới chân trông
  // như tấm ván nhân vật đang đứng lên, còn vệt bầu dục mờ dần ở mép mới ra bóng đổ. Đây là
  // nét duy nhất trong phòng dùng đường cong - canvas khử răng cưa cho path bất kể
  // imageSmoothing, nên nó mượt ở mọi bậc phóng.
  if (e.mode !== 'sit') {
    g.save();
    // Không hạ thêm globalAlpha: OF.pal.shadow ĐÃ là màu có alpha (.16), nhân thêm lần nữa
    // là cái bóng mờ tới mức không còn thấy trên nền sàn sáng.
    g.fillStyle = OF.pal.shadow;
    g.beginPath();
    g.ellipse(e.x + SPRITE_W / 2, e.y + SPRITE_H - 0.6, 5, 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.save();
  // Ô trong atlas rộng hơn nhân vật 1 pixel mỗi bên để chứa viền, nên vẽ lệch -1: phần thân
  // vẫn rơi đúng vào (e.x, e.y), còn viền tràn ra ngoài như nó phải thế.
  //
  // Sub-agent bị thu 0.8 lần - tỷ lệ lẻ, nên luôn phải nội suy dù bậc phóng có chia hết hay
  // không, nếu không những nét mảnh 1/3 pixel rơi rụng lỗ chỗ.
  g.imageSmoothingEnabled = OF.spriteSmooth || small;
  g.imageSmoothingQuality = 'high';
  if (small) {
    // sub-agent vẽ nhỏ hơn một chút để phân biệt với người gọi nó mà không cần chú thích
    g.translate(e.x + SPRITE_W / 2, ey + SPRITE_H);
    g.scale(0.8, 0.8);
    g.translate(-SPRITE_W / 2, -SPRITE_H);
    g.drawImage(OF.atlas.canvas, sx, sy, sw, sh, -1, -1, dw, dh);
  } else if (flip) {
    g.translate(e.x + SPRITE_W, ey);
    g.scale(-1, 1);
    g.drawImage(OF.atlas.canvas, sx, sy, sw, sh, -1, -1, dw, dh);
  } else {
    g.drawImage(OF.atlas.canvas, sx, sy, sw, sh, e.x - 1, ey - 1, dw, dh);
  }
  g.restore();
}

function drawCatEntity(g) {
  const c = OF.cat;
  if (!c) return;
  const [sx, sy, sw, sh] = OF.atlas.catCell(Math.floor(c.anim * 5) % 2);
  const dw = sw / SPRITE_SS, dh = sh / SPRITE_SS;
  g.save();
  g.imageSmoothingEnabled = OF.spriteSmooth;
  g.imageSmoothingQuality = 'high';
  if (c.flip) {
    g.translate(c.x + dw - 2, c.y);
    g.scale(-1, 1);
    g.drawImage(OF.atlas.canvas, sx, sy, sw, sh, -1, -1, dw, dh);
  } else {
    g.drawImage(OF.atlas.canvas, sx, sy, sw, sh, c.x - 1, c.y - 1, dw, dh);
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
  OF.ents.forEach((e) => { if (e.desk && e.kind === 'agent' && !e.leaving) byDesk.set(e.desk, e); });
  const ents = Array.from(OF.ents.values()).sort((a, b) => a.y - b.y);

  [0, 1].forEach((row) => {
    const desks = OF.desks.filter((d) => d.row === row);
    desks.forEach((d) => drawDesk(g, d, byDesk.get(d)));
    const lo = row === 0 ? -Infinity : ROW_Y[1];
    const hi = row === 0 ? ROW_Y[1] : Infinity;
    ents.filter((e) => e.y >= lo && e.y < hi).forEach((e) => drawEntity(g, e));
    desks.forEach((d) => drawChairBack(g, d));    // tựa lưng đè lên hông người ngồi
  });

  drawCatEntity(g);
  drawConfetti(g);          // trên cùng: bông bay trước mặt mọi người, không nấp sau bàn

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
  // Nhân vật vẽ ở lưới con, nên một pixel của atlas ra đúng (scale*dpr / SPRITE_SS) pixel màn
  // hình. Chia hết thì phóng nguyên lần, tắt nội suy cho nét đanh. Không chia hết thì BẬT nội
  // suy: lấy mẫu gần nhất ở tỷ lệ lẻ sẽ bỏ rơi hàng thì hàng không, và những nét mảnh 1/3
  // pixel - viền, chấm loá trong mắt - biến mất chỗ có chỗ không, nhìn như hình bị rách.
  // Đồ đạc trong phòng vẫn vẽ ở pixel gốc và vẫn tắt nội suy, chỉ nhân vật đi đường này.
  OF.spriteSmooth = (OF.scale * OF.dpr) % SPRITE_SS !== 0;
  if (OF.ctx) OF.ctx.imageSmoothingEnabled = false;
  if (OF.on) draw();
}

/* ------------------------------------------------------------- tương tác */

/** Toạ độ phòng (pixel gốc) từ toạ độ chuột. */
function roomPos(clientX, clientY) {
  const r = OF.canvas.getBoundingClientRect();
  return { x: (clientX - r.left) / OF.scale, y: (clientY - r.top) / OF.scale };
}

/** Bắt theo THÂN nhân vật ở vị trí hiện tại - khác deskAt (bắt theo cụm bàn). Người đi vòng
 *  vòng vẫn giữ bàn, nên nếu chỉ có deskAt thì hover vào chính họ giữa phòng không ăn gì. */
function entAt(clientX, clientY) {
  const { x, y } = roomPos(clientX, clientY);
  for (const [id, e] of OF.ents) {
    if (e.kind !== 'agent') continue;
    if (x >= e.x - 1 && x <= e.x + SPRITE_W + 1 && y >= e.y - 1 && y <= e.y + SPRITE_H + 1) return id;
  }
  return null;
}

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

/** Đặt người đang được rê chuột. Đáp lại thế nào thì tuỳ họ ĐANG LÀM GÌ - và đó là toàn bộ
 *  nội dung của hàm này:
 *
 * | Đang | Rê chuột vào | Bỏ chuột ra |
 * | --- | --- | --- |
 * | Ngồi làm việc | ngoái lại nhìn `GLANCE_SEC` giây rồi làm tiếp, **không rời ghế** | không đổi gì |
 * | Rảnh, đi vòng vòng | dừng lại, quay mặt ra chờ | đi tiếp |
 * | Đang rời phòng | không đáp lại gì | - |
 *
 * **Người đang ngồi thì tuyệt đối không đụng vào `path`/`goal`/`mode`.** Bản trước xoá cả ba
 * cho mọi người, nên rê chuột vào một người đang gõ phím là `goal` mất, vòng sau step() thấy
 * "có việc mà chưa về bàn" nên cho họ đứng dậy đi vòng qua hông bàn rồi ngồi lại - nhìn như
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
 *    giữa đường; nếu vẫn để `goal = 'desk'` thì nhánh "có việc thì về bàn" trong step() không
 *    bao giờ chạy lại (nó chỉ chạy khi `goal !== 'desk'`) và người đó kẹt luôn.
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
      now.glance = GLANCE_SEC;   // ngoái lại một nhịp, vẫn ngồi nguyên chỗ làm việc
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
  const id = entAt(ev.clientX, ev.clientY) || deskAt(ev.clientX, ev.clientY);
  setHover(id);
  OF.canvas.style.cursor = id ? 'pointer' : 'default';
}

/** Bấm vào ai thì mở chi tiết người đó VÀ cuộn tới đúng phần họ cần. Không cuộn thì bảng
 *  chi tiết mở tận dưới màn hình, bấm xong không thấy gì đổi và tưởng nút hỏng. */
function onClick(ev) {
  const id = entAt(ev.clientX, ev.clientY) || deskAt(ev.clientX, ev.clientY);
  if (!id) return;
  if (id === OF.sel) { OF.sel = null; renderDetail(); return; }   // bấm lại thì đóng

  OF.sel = id;
  renderDetail();
  const e = OF.ents.get(id);
  // Bấm xong là thôi chào: chi tiết đã mở ra rồi, giữ họ đứng chờ nữa thì cả phòng đứng hình
  // trong khi người dùng đang đọc bảng bên dưới. Chỉ đụng tới người ĐANG ĐỨNG chờ - xoá
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
    ${agentSkinRow(OF.sel, e.charIndex)}
    <div class="h2row"><h2>${t('office.tree_title', { n: root ? root.children.length : 0 })}</h2></div>
    ${tree}
  </div>`);
  // morph() vừa dựng lại DOM nên mấy canvas xem trước đang trống, phải tô ngay sau đó.
  paintCharPreviews();
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
  OF.cat = { x: 120, y: CAT_LANE, tx: 120, ty: CAT_LANE, wait: 2, anim: 0, flip: false };
  OF.canvas.addEventListener('mousemove', onMove);
  OF.canvas.addEventListener('mouseleave', () => setHover(null));
  OF.canvas.addEventListener('click', onClick);
  window.addEventListener('resize', resize);

  initPack();
  initRoom();
  renderPacks();
  renderRooms();
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

  OF.ready = true;
  resize();

  // Nạp bộ người dùng đã nhập trước đó. Chạy nền: dựng canvas từ PNG là bất đồng bộ, chờ nó
  // thì phòng đứng hình mất một nhịp mà chẳng được gì.
  loadCustomPacks().then((n) => {
    if (!n) return;
    OF.atlas = buildSpriteAtlas();
    initPack();          // bộ đã cất giờ mới tồn tại, chọn lại cho đúng
    reskinAll();
    renderPacks();
  });
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
  OF.confetti.length = 0;   // không giữ bông của lần trước, mở lại tab là thấy nó treo lơ lửng
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
  if (b) { OF.sel = null; renderDetail(); return; }
  // Bấm một nhân vật trong dãy => đổi riêng cho agent đang mở, không đụng ai khác.
  const pick = ev.target.closest('.agent-skins button[data-char]');
  if (pick && OF.sel) setCharFor(OF.sel, +pick.dataset.char);
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
  renderPacks();      // tên bộ phải đổi theo ngôn ngữ
  renderRooms();      // và xem trước phòng phải đổi theo bảng màu của theme
  if (OF.on) draw();
}

officeSync();
