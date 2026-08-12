/* AI Monitor - frontend, không phụ thuộc thư viện ngoài.
 *
 * Điểm quan trọng: KHÔNG bao giờ gán innerHTML cho vùng đang xem. Mỗi lần làm mới,
 * HTML mới được so sánh với DOM hiện tại (hàm morph) và chỉ phần thay đổi được sửa.
 * Nhờ vậy trang không nháy, không mất vị trí cuộn, không mất trạng thái mở/đóng.
 */

const S = {
  snap: null,
  tab: 'ai',
  interval: 3000,
  timer: null,
  openKids: new Set(),
  openEvents: new Set(),
  openInfo: new Set(),   // PID đang bung khối danh thiếp phiên
  events: {},
  busy: false,
  modalOpen: false,
  // Vỏ nhúng (extension VSCode) báo xuống là panel đang bị giấu. Xem pageVisible().
  embedHidden: false,
  // `?view=office`: cả trang chỉ còn căn phòng, dùng cho cửa sổ nổi (PIP) của extension.
  // Xem applyEmbedOptions().
  pip: false,
  // Nút "Chỉ hiện sân khấu": cùng bố cục với cửa sổ nổi nhưng vẫn là trang thật, tắt bằng
  // cách bấm vào một nhân vật. Xem setSolo().
  solo: false,
  caps: { pause: true, os: 'macos' },
  // Phiên bản của vỏ đang nhúng trang (`?ext=`). Xem versionLine().
  extVersion: '',
  // Số vừa đổi thì chữ sáng lên rồi mờ dần về màu cũ trong 1.1s. Chỉ đổi màu chữ,
  // không đụng nền và không đổi kích thước nên không gây giật. Không còn công tắc.
  fx: true,
  hist: null,        // kết quả /api/sessions - nạp lười, không nằm trong vòng 3 giây
  histBusy: false,
  // Loại agent đang được hiện. Mặc định chỉ Claude Code: máy nào cũng có sẵn một mớ tiến
  // trình bị phân loại là AI mà người dùng không hề chạy (Copilot của VSCode, Codex đi kèm
  // editor), bày hết ra thì che mất thứ thật sự cần theo dõi.
  kinds: new Set(['claude-code']),
};

/* ------------------------------------------------------- lọc theo loại agent */
const KINDS_KEY = 'aimon.kinds';

/** Nhãn của một loại. Nhãn chung (Other, Browser) thì dịch, tên sản phẩm thì giữ nguyên -
 *  bảng tên lấy từ server nên không phải giữ bản sao thứ hai của KIND_LABELS ở đây. */
function kindName(kind) {
  const key = 'kind.' + kind;
  const v = t(key);
  if (v !== key) return v;
  const known = (window.AIMON_CONFIG || {}).known_kinds || {};
  return known[kind] || kind;
}

function knownKinds() {
  return Object.keys((window.AIMON_CONFIG || {}).known_kinds || {});
}

/** Chuỗi "a,b" hoặc "*" => tập loại. `*` nghĩa là tất cả những loại server biết. */
function parseKinds(str) {
  const parts = String(str == null ? '' : str).split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.includes('*')) return new Set(knownKinds());
  return new Set(parts);
}

/** Tham số gửi cho /api/pulse. Chuỗi rỗng là hợp lệ và có nghĩa "không chọn loại nào" -
 *  server phân biệt được với việc không gửi tham số. */
function kindsParam() {
  return Array.from(S.kinds).sort().join(',');
}

function saveKinds() {
  try { localStorage.setItem(KINDS_KEY, kindsParam()); } catch (e) { /* chế độ riêng tư */ }
}

/** Chỉ giữ những agent thuộc loại đang chọn. */
function visibleAi() {
  return ((S.snap && S.snap.ai) || []).filter((r) => S.kinds.has(r.kind));
}

/* ------------------------------------------------------------- tiện ích */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtKB(kb) {
  if (!kb) return '0';
  if (kb < 1024) return kb + ' KB';
  const mb = kb / 1024;
  if (mb < 1024) return mb.toFixed(mb < 10 ? 1 : 0) + ' MB';
  return (mb / 1024).toFixed(2) + ' GB';
}
function fmtTok(n) {
  if (!n) return '0';
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 1e4 ? 1 : 0) + 'K';
  return (n / 1e6).toFixed(2) + 'M';
}
function fmtDur(sec) {
  if (sec == null) return '-';
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return m + 'm ' + String(s).padStart(2, '0') + 's';
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return h + 'h ' + String(mm).padStart(2, '0') + 'm';
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
}
const money = (v) => '$' + (v || 0).toFixed(Math.abs(v) < 10 ? 3 : 2);
function clockOf(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toTimeString().slice(0, 8);
}
function dayOf(ts) {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}
function barClass(pct) { return pct >= 85 ? 'r' : pct >= 60 ? 'a' : 'g'; }

/* Nhãn loại tiến trình: tên sản phẩm (Claude Code, MCP server...) giữ nguyên, chỉ dịch
 * mấy nhãn chung như Other/Browser/Editor. Backend gửi `kind`, `label` là bản tiếng Anh. */
function kindLabel(o) {
  const key = 'kind.' + (o.kind || 'other');
  const v = t(key);
  return v === key ? (o.label || o.kind || '') : v;
}

/* Chuỗi do backend sinh: ưu tiên mã + tham số, không có thì lấy bản tiếng Anh nó gửi kèm. */
function noteText(w) {
  return w.note_key ? t(w.note_key, fmtArgs(w.note_args)) : (w.note || '');
}
function errText(d) {
  if (d.error_key) return t(d.error_key, fmtArgs(d.error_args));
  return d.error || t('common.unknown_error');
}
/** Tham số `age` từ backend là giây - đổi sang chuỗi thời lượng theo ngôn ngữ đang dùng. */
function fmtArgs(args) {
  const out = Object.assign({}, args || {});
  if (out.age != null) out.age = fmtDur(out.age);
  if (out.pct != null) out.pct = Math.round(out.pct);
  if (out.drift != null) out.drift = Math.round(out.drift);
  return out;
}

/* ------------------------------------------------------------- morph DOM */
function frag(html) {
  // đặt tên tpl chứ không phải t: t() là hàm dịch, che nó ở đây rất dễ sinh lỗi ngầm
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return tpl.content;
}
const sameType = (a, b) =>
  a.nodeType === b.nodeType && (a.nodeType !== 1 || a.tagName === b.tagName);

/* Dấu hiệu "vừa đổi": chỉ làm sáng màu chữ 1 nhịp rồi để CSS transition mờ về.
 * MẶC ĐỊNH TẮT - chỉ thay text, không đổi màu gì, để xem lâu không mỏi mắt.
 * Không bao giờ dùng animation nền: hàng chục ô đổi cùng lúc sẽ thành nháy cả trang. */
function flash(el) {
  if (!S.fx) return;
  const host = el.closest && el.closest('[data-flash="1"]');
  if (!host) return;
  host.classList.add('upd');
  requestAnimationFrame(() => requestAnimationFrame(() => host.classList.remove('upd')));
}

function patch(oldNode, newNode) {
  if (oldNode.nodeType === 3) {            // text
    if (oldNode.nodeValue !== newNode.nodeValue) {
      oldNode.nodeValue = newNode.nodeValue;
      if (oldNode.parentElement) flash(oldNode.parentElement);
    }
    return;
  }
  if (oldNode.nodeType !== 1) return;

  // đồng bộ thuộc tính
  const oldAttrs = oldNode.attributes, newAttrs = newNode.attributes;
  for (let i = oldAttrs.length - 1; i >= 0; i--) {
    const name = oldAttrs[i].name;
    if (!newNode.hasAttribute(name)) oldNode.removeAttribute(name);
  }
  for (let i = 0; i < newAttrs.length; i++) {
    const { name, value } = newAttrs[i];
    if (oldNode.getAttribute(name) !== value) oldNode.setAttribute(name, value);
  }
  morph(oldNode, newNode);
}

function morph(parent, source) {
  const newNodes = Array.from(source.childNodes);
  const keyed = new Map();
  for (const n of parent.childNodes) {
    const k = n.nodeType === 1 ? n.getAttribute('data-key') : null;
    if (k) keyed.set(k, n);
  }
  const kept = new Set();

  newNodes.forEach((nn, i) => {
    const key = nn.nodeType === 1 ? nn.getAttribute('data-key') : null;
    let target = null;
    if (key && keyed.has(key)) {
      const cand = keyed.get(key);
      if (sameType(cand, nn)) target = cand;
    } else {
      const cand = parent.childNodes[i];
      if (cand && !kept.has(cand) && sameType(cand, nn) &&
          !(cand.nodeType === 1 && cand.getAttribute('data-key'))) {
        target = cand;
      }
    }
    if (target) {
      patch(target, nn);
      if (parent.childNodes[i] !== target) parent.insertBefore(target, parent.childNodes[i] || null);
      kept.add(target);
    } else {
      parent.insertBefore(nn, parent.childNodes[i] || null);
      kept.add(nn);
    }
  });

  for (const n of Array.from(parent.childNodes)) {
    if (!kept.has(n)) n.remove();
  }
}

/** Cập nhật 1 vùng bằng HTML mới, chỉ sửa phần khác nhau. */
function render(sel, html) {
  const host = typeof sel === 'string' ? $(sel) : sel;
  if (!host) return;
  morph(host, frag(html));
}
function setText(sel, text) {
  const el = $(sel);
  if (el && el.textContent !== text) el.textContent = text;
}

/** Nhãn trạng thái: bình thường ẩn hẳn, chỉ bật lên khi mất kết nối hoặc đã dừng. */
function setStatus(text) {
  const el = $('#stamp');
  if (!el) return;
  if (text) { setText('#stamp', text); el.hidden = false; } else { el.hidden = true; }
}

/* ------------------------------------------------------------- modal + toast */
function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), 4600);
}

/* --------------------------------------------- danh thiếp phiên (copy sang phiên khác)
 *
 * Claude Code từ 2.1.224 cho hai phiên nhắn tin cho nhau qua `SendMessage`, địa chỉ là TÊN
 * phiên (`~/.claude/sessions/<pid>.json` -> `name`). Nhưng người ngồi ở phiên A không có cách
 * nào biết phiên B tên gì: tên do Claude Code tự sinh từ tên thư mục và chỉ hiện trong chính
 * phiên đó. Khối chữ dưới đây là để dán thẳng sang phiên A - dán xong là phiên đó biết bên
 * kia tên gì, đang ở dự án nào và gọi sang bằng cách nào.
 *
 * Vì vậy khối chữ phải TỰ ĐỨNG VỮNG: phiên nhận không thấy màn hình này, không thấy repo bên
 * kia. Thiếu đường dẫn tuyệt đối hay thiếu câu chỉ cách gọi thì nó chỉ là một mớ chữ.
 */

/** Tên dự án suy từ đường dẫn. Người dùng nhớ "AIMonitor" chứ không nhớ cả đường dẫn. */
function projOf(cwd) {
  if (!cwd) return '';
  const parts = String(cwd).replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

/** Đường dẫn cho khối copy. Lấy `session_cwd` (state file) TRƯỚC `session.cwd` (transcript) vì
 *  hai lý do, cả hai đều làm hỏng khối chữ nếu lấy ngược:
 *  - `session.cwd` đã bị rút gọn `HOME` thành `~` để hiện cho đẹp, mà khối này dán sang phiên
 *    khác thì cần đường dẫn tuyệt đối dùng được ngay.
 *  - transcript ghi thư mục HIỆN TẠI, đổi theo `cd` giữa phiên; tên nhắn tin lại suy từ thư mục
 *    LÚC MỞ trong state file. Lấy transcript thì gặp cảnh tên `qabutler-b0` mà dự án ghi
 *    `handover` - người đọc không nối được hai thứ vào nhau. */
function sessCwd(r) {
  return r.session_cwd || (r.session && r.session.cwd) || '';
}

/** Khối thông tin một phiên. `t()` lo phần ngôn ngữ, nội dung là chữ thuần để dán đi đâu cũng được. */
function sessionInfoText(r) {
  const s = r.session || {};
  const name = r.session_name || '';
  const cwd = sessCwd(r);
  const proj = projOf(cwd);
  const lines = [];

  lines.push(t('copy.head', { name: name || t('copy.no_name') }));
  if (name) lines.push('- ' + t('copy.target', { name }));
  lines.push('- ' + t('copy.project', { proj: proj || '?', cwd: cwd || '?' }));
  if (r.session_id) lines.push('- ' + t('copy.sid', { id: r.session_id }));

  const meta = ['PID ' + r.pid];
  if (r.cc_version) meta.push('Claude Code ' + r.cc_version);
  if (r.entrypoint) meta.push(r.entrypoint);
  lines.push('- ' + meta.join(' · '));

  const extra = [];
  if (s.git_branch) extra.push(t('copy.branch', { b: s.git_branch }));
  if ((s.models || []).length) extra.push(t('copy.model', { m: s.models.join(', ') }));
  if (extra.length) lines.push('- ' + extra.join(' · '));

  lines.push('');
  lines.push(name && r.peer_ready ? t('copy.howto', { name }) : t('copy.no_peer'));
  return lines.join('\n');
}

/** Khối bung ra dưới tiêu đề thẻ: bày ĐÚNG chữ sẽ được copy, kèm nút copy.
 *
 *  Bày ra chứ không copy thẳng vì hai lẽ: người dùng thấy trước mình sắp dán cái gì sang phiên
 *  khác, và khi clipboard bị chặn (webview, trang không secure context) thì vẫn còn đường bôi
 *  đen copy tay - nút bấm không có gì để nhìn thì hỏng là mất trắng. */
function infoBlock(r) {
  return `<div class="sessinfo">
    <div class="row">
      <span class="cap">${t('copy.title')}</span>
      <button class="mini" data-act="copyinfo" data-pid="${r.pid}">${t('copy.one')}</button>
    </div>
    <pre>${esc(sessionInfoText(r))}</pre>
  </div>`;
}

/** Copy có đường lui. Trong webview VSCode trang nằm trong iframe khác origin, đã gặp ca
 *  `navigator.clipboard` bị từ chối vì document không được coi là đang focus. */
async function copyText(str) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(str);
      return true;
    }
  } catch (e) { /* rơi xuống nhánh dưới */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

/** Phiên có danh thiếp để copy hay không. Copilot/Codex không đăng ký tên nên không có gì để dán. */
function hasCard(r) {
  return !!(r.session_name || r.session_id);
}

let _modalResolve = null;
function askConfirm(title, body, warn) {
  S.modalOpen = true;
  $('#m-title').textContent = title;
  $('#m-body').textContent = body || '';
  const w = $('#m-warn');
  if (warn) { w.textContent = warn; w.hidden = false; } else { w.hidden = true; }
  $('#modal').hidden = false;
  $('#m-ok').focus();
  return new Promise((res) => { _modalResolve = res; });
}
function closeModal(value) {
  $('#modal').hidden = true;
  S.modalOpen = false;
  if (_modalResolve) { _modalResolve(value); _modalResolve = null; }
}
$('#m-ok').addEventListener('click', () => closeModal(true));
$('#m-cancel').addEventListener('click', () => closeModal(false));
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(false); });
document.addEventListener('keydown', (e) => {
  if (!S.modalOpen) return;
  if (e.key === 'Escape') closeModal(false);
  if (e.key === 'Enter') closeModal(true);
});

/* ------------------------------------------------------------- API */
async function loadSnapshot() {
  if (S.busy || S.modalOpen) return;
  S.busy = true;
  try {
    // Chỉ xin dữ liệu cổng khi đang thật sự xem tab Cổng & Docker: `lsof` chiếm 28 ms
    // trong 63 ms của một lần build, mà bốn tab kia không đọc tới nó. Vừa bấm sang tab đó
    // thì handler bên dưới gọi loadSnapshot() ngay, nên không phải chờ hết một nhịp.
    const q = S.tab === 'net' ? '' : '?ports=0';
    const r = await fetch('/api/snapshot' + q, { cache: 'no-store' });
    const data = await r.json();
    if (data.error) { toast(t('err.snapshot', { msg: data.error }), 'err'); return; }
    S.snap = data;
    S.caps = data.capabilities || S.caps;
    renderAll();
  } catch (e) {
    setStatus(t('err.disconnected'));
  } finally {
    S.busy = false;
  }
}

async function loadEvents(sid) {
  try {
    const r = await fetch('/api/events?session=' + encodeURIComponent(sid));
    const d = await r.json();
    S.events[sid] = d.events || [];
    renderLive();
  } catch (e) { /* bỏ qua */ }
}

async function act(action, pid, label, supervisor) {
  const destructive = action === 'kill' || action === 'force_kill' || action === 'kill_tree';
  if (destructive) {
    const ok = await askConfirm(
      t('confirm.title', { action: t('act.' + action), pid }),
      label || '',
      supervisor ? t('ai.supervised_hint', { name: supervisor }) : ''
    );
    if (!ok) return;
  }
  try {
    const r = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, pid }),
    });
    const d = await r.json();
    if (d.ok) {
      const n = d.killed ? d.killed.length : d.affected ? d.affected.length : 0;
      toast(t('toast.done', {
        action: t('act.' + action), pid,
        extra: n > 1 ? t('toast.done_n', { n }) : '',
      }), 'ok');
    } else {
      toast(t('toast.fail', {
        action: t('act.' + action), pid, msg: errText(d),
      }), 'err');
    }
    if (d.failed && d.failed.length) toast(t('toast.children_failed', { n: d.failed.length }), 'err');
  } catch (e) {
    toast(t('toast.api_failed', { msg: e.message }), 'err');
  }
  setTimeout(loadSnapshot, 350);
}

/* ------------------------------------------------------------- render */
function renderAll() {
  renderHeader();
  renderUsage();
  renderKpis();
  renderChips();
  renderKindBar();
  renderLive();
  renderClosed();
  renderRes();
  renderNet();
  setStatus('');   // chạy bình thường thì không cần nhãn nào
  // giờ cập nhật chuyển thành tooltip của nút Làm mới, không chiếm chỗ trên thanh đầu
  $('#refresh').title = t('hdr.updated', { time: clockOf(S.snap.ts) });
  setText('#ver', versionLine() + (S.caps.pause ? '' : t('hdr.no_pause')));
}

/** Dòng cuối trang: phiên bản đang chạy THẬT + hệ điều hành.
 *
 * `version` lấy từ `/api/config.js`, tức của SERVER đang phục vụ trang - không phải của vỏ
 * đang nhúng nó. Extension mặc định dùng lại server có sẵn (app macOS, .exe, hay cửa sổ VSCode
 * khác), nên cài extension bản mới mà server cũ còn sống thì trang vẫn là trang cũ. Lệch nhau
 * thì bày cả hai số, vì đó chính là lúc người dùng cần biết. */
function versionLine() {
  const cfg = window.AIMON_CONFIG || {};
  const parts = [];
  if (cfg.version) parts.push('v' + cfg.version);
  if (S.extVersion && S.extVersion !== cfg.version) {
    parts.push(t('foot.ext', { v: S.extVersion }));
  }
  if (S.caps.os) parts.push(S.caps.os);
  return parts.join(' · ');
}

function renderHeader() {
  const sys = S.snap.system;
  const pct = sys.mem_total_kb ? (sys.mem_used_kb / sys.mem_total_kb * 100) : 0;
  setText('#mem-txt', `${fmtKB(sys.mem_used_kb)} / ${fmtKB(sys.mem_total_kb)} (${pct.toFixed(0)}%)`);
  const mb = $('#mem-bar');
  mb.className = 'bar ' + barClass(pct);
  mb.firstElementChild.style.width = Math.min(100, pct) + '%';

  const aiPct = sys.mem_total_kb ? (sys.ai_rss_kb / sys.mem_total_kb * 100) : 0;
  setText('#ai-txt', `${fmtKB(sys.ai_rss_kb)} (${aiPct.toFixed(0)}%)`);
  const ab = $('#ai-bar');
  ab.className = 'bar ' + barClass(aiPct * 2);
  ab.firstElementChild.style.width = Math.min(100, aiPct) + '%';

  // Nhãn chỉ còn số tiến trình cho gọn; load average và số lõi đẩy vào tooltip.
  setText('#load', t('hdr.procs', { procs: sys.proc_count }));
  $('#load').title = sys.load && sys.load.length
    ? t('hdr.load_hint', { cores: sys.cpu_count, load: sys.load.join(' / ') })
    : t('hdr.cores_hint', { cores: sys.cpu_count });
}

/* Nhãn ngắn cho từng nguồn số. Luôn nói rõ số đến từ đâu thay vì lặng lẽ đổi ý nghĩa
 * con số to - người dùng nhìn ô này để quyết định còn chạy tiếp được bao lâu. */
const SRC_BADGE = {
  official: '',
  projected: 'src.projected',
  official_stale: 'src.official_stale',
  estimate: 'src.estimate',
  none: 'src.none',
};

/** 1 ô hạn mức. Số to luôn là %; backend đã chốt sẵn lấy % từ nguồn nào. */
function gauge(key, title, w) {
  w = w || {};
  const pct = w.pct;
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const big = pct == null ? '--' : (w.source === 'official' ? '' : '≈') + Math.round(pct) + '%';
  const badgeKey = SRC_BADGE[w.source] || '';
  const badge = badgeKey ? t(badgeKey) : '';

  const bits = [];
  bits.push(w.resets_in > 0 ? t('usage.resets_in', { dur: fmtDur(w.resets_in) }) : t('usage.no_reset'));
  // Nói rõ số to gồm những gì, để không ai tưởng đó là số chính thức tuyệt đối
  if (w.source === 'projected') {
    bits.push(t('usage.breakdown', {
      pct: Math.round(w.official_pct), age: fmtDur(w.official_age_sec), drift: Math.round(w.drift_pct),
    }));
  } else if (w.source === 'official_stale' && w.official_age_sec) {
    bits.push(t('usage.read_ago', { age: fmtDur(w.official_age_sec) }));
  }

  return `<div class="ubox" data-key="u-${key}" title="${esc(noteText(w))}">
    <div class="hdr"><b>${esc(title)}</b>
      ${badge ? `<span class="src">${esc(badge)}</span>` : ''}
      <span class="pct${pct == null ? ' off' : ''}" data-flash="1">${esc(big)}</span></div>
    <div class="bar lg ${pct == null ? '' : barClass(p)}"><i style="width:${p}%"></i></div>
    <div class="sub">${esc(bits.join(' · '))}</div>
    <div class="loc" data-flash="1">${fmtTok(w.tokens)} ${t('common.tokens')} · ${money(w.cost)} · ${w.msgs || 0} ${t('common.calls')}</div>
  </div>`;
}

/** Row trên: thống kê Claude (hạn mức + token + chi phí hôm nay). */
function renderUsage() {
  const s = S.snap, tot = s.totals;
  const u = s.usage || {};
  const loc = u.local || {};
  const d7 = loc.d7 || { total: 0, cost: 0, msgs: 0 };

  render('#usage',
    gauge('h5', t('usage.session'), u.five_hour) +
    gauge('d7', t('usage.weekly'), u.seven_day) +
    `<div class="ubox" data-key="u-tok">
      <div class="hdr"><b>${t('usage.tokens_today')}</b><span class="pct" data-flash="1">${fmtTok(tot.today.total)}</span></div>
      <div class="sub">${esc(t('usage.calls_since', { n: tot.today.msgs }))}</div>
      <div class="loc" data-flash="1">${esc(t('usage.out_cache', {
        out: fmtTok(tot.today.output), cache: fmtTok(tot.today.cache_read) }))}</div>
    </div>
    <div class="ubox" data-key="u-cost">
      <div class="hdr"><b>${t('usage.cost_today')}</b><span class="pct" data-flash="1">${money(tot.today.cost)}</span></div>
      <div class="sub">${esc(t('usage.sessions_priced', { n: tot.sessions_today }))}</div>
      <div class="loc" data-flash="1">${esc(t('usage.last_7d', { cost: money(d7.cost) }))}</div>
    </div>`);
}

/** Row dưới: tiến trình - phiên Claude, MCP server, RAM, CPU. */
function renderKpis() {
  const s = S.snap, tot = s.totals, sys = s.system;
  const mcp = s.groups.find((g) => g.kind === 'mcp') || { count: 0, rss_kb: 0 };
  const running = s.ai.filter((r) => r.session && r.session.pending.length).length;
  const cards = [
    { k: 'live', n: tot.live, l: t('kpi.live'),
      s: running ? t('kpi.live_busy', { n: running }) : t('kpi.live_idle') },
    { k: 'mcp', n: mcp.count, l: t('kpi.mcp'), s: t('kpi.ram_of', { ram: fmtKB(mcp.rss_kb) }) },
    { k: 'ram', n: fmtKB(sys.ai_rss_kb), l: t('kpi.ram'),
      s: t('kpi.ram_sub', { pct: sys.mem_total_kb ? (sys.ai_rss_kb / sys.mem_total_kb * 100).toFixed(0) : 0 }),
      hot: sys.ai_rss_kb > sys.mem_total_kb * 0.35 },
    { k: 'cpu', n: (sys.ai_cpu_pct || 0).toFixed(1) + '%', l: t('kpi.cpu'),
      s: t('kpi.cpu_sub', { cores: sys.cpu_count, n: s.ai.length }),
      hot: (sys.ai_cpu_pct || 0) > 100 },
  ];
  render('#kpis', cards.map((c) =>
    `<div class="kpi${c.hot ? ' hot' : ''}" data-key="k-${c.k}">
      <div class="n" data-flash="1">${esc(c.n)}</div>
      <div class="l">${esc(c.l)}</div><div class="s">${esc(c.s)}</div>
    </div>`).join(''));
}

/** Thanh lọc loại agent. Dùng chung cho tab AI & Agent và tab Văn phòng - một bộ lọc, hai
 *  khung nhìn, để không ai phải chỉnh hai lần.
 *
 *  Chỉ liệt kê loại ĐANG có mặt cộng với loại đang chọn. Bày cả bảy loại server biết thì
 *  thanh này dài gấp ba mà sáu cái trong đó không bao giờ có ai. */
function renderKindBar() {
  const counts = {};
  ((S.snap && S.snap.ai) || []).forEach((r) => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
  const all = new Set(Object.keys(counts));
  S.kinds.forEach((k) => all.add(k));
  const list = Array.from(all).sort();
  if (!list.length) { render('#kindbar', ''); return; }

  const everything = knownKinds();
  const isAll = everything.length > 0 && everything.every((k) => S.kinds.has(k));

  render('#kindbar',
    `<span class="lbl" data-key="kb-lbl">${t('filter.title')}</span>` +
    list.map((k) => {
      const on = S.kinds.has(k);
      // Trạng thái bật/tắt đi qua aria-pressed, CSS bám vào đó - vừa đúng cho trình đọc màn
      // hình vừa khỏi phải giữ thêm một class chỉ để đổi màu.
      return `<button class="chip pick" data-key="kb-${esc(k)}"
        data-kind="${esc(k)}" aria-pressed="${on}"
        title="${esc(t(on ? 'filter.click_hide' : 'filter.click_show', { name: kindName(k) }))}"
        ><i class="dot"></i>${esc(kindName(k))}${counts[k] ? ' <b>' + counts[k] + '</b>' : ''}</button>`;
    }).join('') +
    (isAll ? '' : `<button class="chip ghost" data-key="kb-all" data-kind="*">${t('filter.all')}</button>`));
}

function renderChips() {
  render('#chips', S.snap.groups.map((g) =>
    `<span class="chip" data-kind="${esc(g.kind)}" data-key="c-${esc(g.kind)}"><i class="dot"></i>${esc(kindLabel(g))} <b>${g.count}</b> · ${fmtKB(g.rss_kb)}${g.cpu_pct > 0.5 ? ' · ' + g.cpu_pct + '% CPU' : ''}</span>`
  ).join('') || `<span class="chip" data-key="c-none">${t('chips.none')}</span>`);
}

function pauseBtn(pid, paused, tree) {
  if (!S.caps.pause) return '';
  const a = (paused ? 'resume' : 'pause') + (tree ? '_tree' : '');
  const label = t('btn.' + (paused ? 'resume' : 'pause') + (tree ? '_tree' : ''));
  return `<button class="mini${paused ? '' : ' warn'}" data-act="${a}" data-pid="${pid}">${label}</button>`;
}

function kidRow(node, depth) {
  const heavy = node.rss_tree_kb > 400 * 1024;
  return `<div class="kid${heavy ? ' heavy' : ''}" data-key="kid-${node.pid}">
      <span class="ind">${'   '.repeat(depth)}</span>
      <span class="badge${node.kind === 'mcp' ? '' : ' dim'}">${esc(kindLabel(node))}</span>
      <span class="nm">${esc(node.name)}</span>
      <span class="cmd">${esc(node.cmd.slice(0, 170))}</span>
      <span class="num" data-flash="1">PID ${node.pid} · ${fmtKB(node.rss_tree_kb)}${node.cpu_pct > 0.5 ? ' · ' + node.cpu_pct + '%' : ''}${node.paused ? ' · ' + t('ai.paused_badge') : ''}</span>
      <span class="acts">${pauseBtn(node.pid, node.paused, false)}
        <button class="mini danger" data-act="kill_tree" data-pid="${node.pid}" data-label="${esc(kindLabel(node) + ' - ' + node.name)}">${t('btn.kill')}</button>
      </span>
    </div>` + (node.children || []).map((c) => kidRow(c, depth + 1)).join('');
}

function sessionCard(r) {
  const s = r.session;
  const doing = s && s.pending.length ? s.pending[0] : null;
  const active = !!doing && !r.paused;
  const cls = r.paused ? 'paused' : active ? 'active' : '';
  const title = s ? (s.title || r.session_name || t('ai.untitled')) : (r.session_name || kindLabel(r));
  const path = s ? (s.cwd || '') : '';
  const kidsOpen = S.openKids.has(r.pid);
  const evOpen = !!(s && S.openEvents.has(s.session_id));
  const infoOpen = S.openInfo.has(r.pid);

  const badges = [];
  // Tên phiên đứng TRƯỚC mọi badge khác: đó là thứ người dùng cần lấy để nhắn sang phiên này,
  // chôn nó sau model với nhánh git thì phải đi tìm mới thấy.
  if (r.session_name) {
    badges.push(`<span class="badge peer" title="${esc(t(r.peer_ready ? 'copy.badge_hint' : 'copy.badge_hint_off', { name: r.session_name }))}">@${esc(r.session_name)}</span>`);
  }
  if (s) (s.models || []).forEach((m) => badges.push(`<span class="badge model">${esc(m)}</span>`));
  if (s && s.git_branch) badges.push(`<span class="badge branch">${esc(s.git_branch)}</span>`);
  if (s && s.mode && s.mode !== 'default') badges.push(`<span class="badge warn">${esc(s.mode)}</span>`);
  if (r.entrypoint) badges.push(`<span class="badge dim">${esc(r.entrypoint)}</span>`);
  if (r.supervisor) badges.push(`<span class="badge warn" title="${esc(t('ai.supervised_hint', { name: r.supervisor }))}">${esc(t('ai.supervised', { name: r.supervisor }))}</span>`);
  if (r.paused) badges.push(`<span class="badge warn">${t('ai.paused_badge')}</span>`);

  let stats;
  if (s) {
    const tk = s.tokens, td = s.today || { total: 0, cost: 0 };
    stats = `<div class="grid">
      <div class="cell"><div class="v" data-flash="1">${fmtTok(td.total)}</div><div class="k">${esc(t('ai.tok_today', { cost: money(td.cost) }))}</div></div>
      <div class="cell"><div class="v" data-flash="1">${fmtTok(s.api_total)}</div><div class="k">${esc(t('ai.tok_session', { in: fmtTok(tk.input), out: fmtTok(tk.output) }))}</div></div>
      <div class="cell"><div class="v" data-flash="1">${money(s.cost_usd)}</div><div class="k">${t('ai.cost_session')}</div></div>
      <div class="cell"><div class="v" data-flash="1">${s.user_turns} / ${s.assistant_msgs}</div><div class="k">${t('ai.turns')}</div></div>
      <div class="cell"><div class="v" data-flash="1">${s.agents_total}</div><div class="k">${t('ai.subagents')}${s.agents_running.length ? esc(t('ai.subagents_running', { n: s.agents_running.length })) : ''}</div></div>
      <div class="cell"><div class="v" data-flash="1">${fmtKB(r.rss_tree_kb)}</div><div class="k">${esc(t('ai.ram_tree', { n: r.children.length }))}</div></div>
      <div class="cell"><div class="v" data-flash="1">${r.cpu_tree_pct}%</div><div class="k">${t('ai.cpu_tree')}</div></div>
      <div class="cell"><div class="v">${fmtDur(r.uptime)}</div><div class="k">${t('ai.runtime')}</div></div>
    </div>
    <div class="ctx">
      <div class="lbl"><span>${t('ai.context')}</span><span>${fmtTok(s.context)} / ${fmtTok(s.context_window)} (${s.context_pct}%)</span></div>
      <div class="bar ${barClass(s.context_pct)}"><i style="width:${Math.min(100, s.context_pct)}%"></i></div>
    </div>`;
  } else {
    stats = `<div class="grid">
      <div class="cell"><div class="v" data-flash="1">${fmtKB(r.rss_tree_kb)}</div><div class="k">${t('ai.ram_tree_plain')}</div></div>
      <div class="cell"><div class="v" data-flash="1">${r.cpu_tree_pct}%</div><div class="k">${t('ai.cpu_tree')}</div></div>
      <div class="cell"><div class="v">${fmtDur(r.uptime)}</div><div class="k">${t('ai.runtime')}</div></div>
      <div class="cell"><div class="v">${r.children.length}</div><div class="k">${t('ai.children')}</div></div>
    </div>
    <div class="doing"><span class="idle">${t('ai.no_transcript')}</span></div>`;
  }

  let doingBlock = '';
  if (s) {
    if (doing) {
      const more = s.pending.length > 1 ? ` <span class="el">${esc(t('ai.more_pending', { n: s.pending.length - 1 }))}</span>` : '';
      doingBlock = `<div class="doing run">${t('ai.doing')}<code>${esc(doing.brief)}</code> <span class="el">${fmtDur(doing.elapsed)}${doing.side ? t('ai.in_subagent') : ''}</span>${more}</div>`;
    } else {
      doingBlock = `<div class="doing"><span class="idle">${t('ai.idle')}${s.idle != null ? ' ' + fmtDur(s.idle) : ''}${s.last_prompt ? t('ai.last_prompt') + esc(s.last_prompt.slice(0, 90)) : ''}</span></div>`;
    }
    if (s.agents_running.length) {
      doingBlock += '<div class="doing run">' + s.agents_running.map((a) =>
        `${t('ai.subagent')} <code>${esc(a.type)}</code> ${esc(a.desc)} <span class="el">${fmtDur(a.elapsed)}</span>`
      ).join('<br>') + '</div>';
    }
    if (s.top_tools.length) {
      doingBlock += `<div class="doing"><span class="idle">${t('ai.top_tools')}${s.top_tools.map((x) => esc(x.name) + ' ×' + x.count).join(' · ')}</span></div>`;
    }
  }

  const kidsBlock = kidsOpen && r.children.length
    ? `<div class="kids">${r.children.map((c) => kidRow(c, 0)).join('')}</div>` : '';

  let evBlock = '';
  if (evOpen) {
    const list = S.events[s.session_id];
    evBlock = '<div class="events">' + (list && list.length
      ? list.map((e, i) => `<div class="ev ${esc(e.kind)}" data-key="ev-${i}"><span class="t">${clockOf(e.ts)}</span><span class="x">${esc(e.text)}</span></div>`).join('')
      : `<div class="ev"><span class="x">${t('ai.no_events')}</span></div>`) + '</div>';
  }

  return `<div class="sess ${cls}" data-key="sess-${r.pid}">
    <div class="top">
      <span class="st"></span>
      <span class="ttl">${esc(title)}</span>
      <span class="path">${esc(path)}</span>
      ${badges.join(' ')}
      <span class="badge dim">PID ${r.pid}</span>
      <span class="acts">
        ${hasCard(r) ? `<button class="mini info${infoOpen ? ' on' : ''}" data-act="info" data-pid="${r.pid}" title="${esc(t('copy.one_hint'))}" aria-expanded="${infoOpen}">${infoOpen ? '−' : 'i'}</button>` : ''}
        ${s ? `<button class="mini" data-act="events" data-sid="${esc(s.session_id)}">${evOpen ? t('ai.hide') : t('ai.timeline')}</button>` : ''}
        ${r.children.length ? `<button class="mini" data-act="kids" data-pid="${r.pid}">${kidsOpen ? t('ai.hide_tree') : t('ai.show_tree', { n: r.children.length })}</button>` : ''}
        ${pauseBtn(r.pid, r.paused, true)}
        <button class="mini danger" data-act="kill_tree" data-pid="${r.pid}" data-label="${esc(title)}"${r.supervisor ? ` data-sup="${esc(r.supervisor)}"` : ''}>${t('btn.kill_tree')}</button>
      </span>
    </div>
    ${infoOpen && hasCard(r) ? infoBlock(r) : ''}
    ${stats}${doingBlock}${kidsBlock}${evBlock}
  </div>`;
}

function renderLive() {
  const list = visibleAi();
  const hidden = ((S.snap && S.snap.ai) || []).length - list.length;
  // Nói rõ có bao nhiêu agent bị bộ lọc giấu đi. Không có dòng này thì người chỉ dùng Gemini
  // mở lên thấy trang trống và tưởng tool hỏng, chứ không nghĩ tới bộ lọc mặc định.
  const note = hidden > 0
    ? `<div class="hint filtered" data-key="live-hidden">${esc(t('filter.hidden', { n: hidden }))}
        <button class="mini" data-kind="*">${t('filter.all')}</button></div>`
    : '';
  render('#live', (list.length
    ? list.map(sessionCard).join('')
    : `<div class="empty" data-key="live-empty">${t(hidden > 0 ? 'filter.all_hidden' : 'ai.none')}</div>`
  ) + note);
}

function renderClosed() {
  const range = $('#closed-range').value;
  const since = range === 'today' ? (S.snap.today_start || 0) : (S.snap.ts - 7 * 86400);
  const rows = (S.snap.orphan_sessions || []).filter((s) => (s.last_ts || 0) >= since);
  if (!rows.length) {
    render('#closed', `<div class="empty" data-key="closed-empty">${t(range === 'today' ? 'closed.none_today' : 'closed.none_7d')}</div>`);
    return;
  }
  render('#closed', `<div class="tbl-wrap" data-key="closed-tbl"><table>
    <thead><tr>
      <th>${t('col.session')}</th><th>${t('col.folder')}</th><th>${t('col.model')}</th>
      <th class="num">${t('col.api_tokens')}</th><th class="num">${t('col.last_context')}</th><th class="num">${t('col.cost')}</th><th class="num">${t('col.last_active')}</th>
    </tr></thead><tbody>
    ${rows.map((s) => `<tr data-key="cs-${esc(s.session_id)}">
      <td class="nm">${esc((s.title || s.session_id).slice(0, 46))}</td>
      <td>${esc(s.cwd || '-')}${s.git_branch ? ' <span class="badge branch">' + esc(s.git_branch) + '</span>' : ''}</td>
      <td>${esc((s.models || []).join(', '))}</td>
      <td class="num">${fmtTok(s.api_total)}</td>
      <td class="num">${fmtTok(s.context)} (${s.context_pct}%)</td>
      <td class="num">${money(s.cost_usd)}</td>
      <td class="num">${dayOf(s.last_ts)} ${clockOf(s.last_ts)}</td>
    </tr>`).join('')}
  </tbody></table></div>`);
}

/* ------------------------------------------------------- tab Lịch sử phiên */

/** Quét toàn bộ transcript - nặng nên nạp lười, chỉ khi mở tab hoặc bấm quét lại. */
async function loadHistory(force) {
  const range = $('#hist-range').value;
  if (S.histBusy) return;
  if (S.hist && S.hist.range === range && !force) return renderHist();
  S.histBusy = true;
  setText('#hist-meta', t('hist.scanning'));
  try {
    const r = await fetch('/api/sessions?days=' + encodeURIComponent(range), { cache: 'no-store' });
    const d = await r.json();
    if (d.error) {
      toast(t('hist.load_error', { msg: d.error }), 'err');
      setText('#hist-meta', t('hist.scan_error'));
      return;
    }
    d.range = range;
    S.hist = d;
    renderHist();
  } catch (e) {
    setText('#hist-meta', t('err.disconnected'));
  } finally {
    S.histBusy = false;
  }
}

function histRows() {
  const q = ($('#hist-filter').value || '').toLowerCase().trim();
  let rows = S.hist.sessions;
  if (q) {
    rows = rows.filter((r) =>
      (r.title || '').toLowerCase().includes(q) ||
      (r.last_prompt || '').toLowerCase().includes(q) ||
      (r.cwd || '').toLowerCase().includes(q) ||
      r.models.join(' ').toLowerCase().includes(q));
  }
  const by = $('#hist-sort').value;
  const rank = by === 'token' ? (r) => -r.api_total
    : by === 'msgs' ? (r) => -r.msgs
    : by === 'recent' ? (r) => -r.last_ts
    : (r) => -r.cost_usd;
  return rows.slice().sort((a, b) => rank(a) - rank(b));
}

/** Thanh tỷ trọng: dài theo mức cao nhất đang hiển thị, để hàng nhỏ vẫn nhìn thấy. */
function shareCell(pct, max) {
  const w = max > 0 ? Math.max(2, (pct / max) * 100) : 0;
  return `<div class="share"><div class="bar"><i style="width:${w}%"></i></div><span>${pct.toFixed(2)}%</span></div>`;
}

function renderHist() {
  const h = S.hist;
  if (!h) return;
  const T = h.totals;
  setText('#hist-meta',
    t('hist.meta', { files: h.scanned_files, sec: h.scan_sec, day: dayOf(T.first_ts) }));

  render('#hist-kpis', [
    { k: 'ses', n: T.sessions, l: t('hist.kpi_sessions'),
      s: t('hist.kpi_sessions_sub', { n: T.msgs.toLocaleString() }) },
    { k: 'cost', n: money(T.cost_usd), l: t('hist.kpi_cost'), s: t('hist.kpi_cost_sub') },
    { k: 'tok', n: fmtTok(T.api_total), l: t('hist.kpi_tokens'),
      s: t('hist.kpi_tokens_sub', { out: fmtTok(T.output), cache: fmtTok(T.cache_read) }) },
    { k: 'proj', n: h.projects.length, l: t('hist.kpi_projects'),
      s: h.projects.length ? t('hist.kpi_projects_sub', { name: h.projects[0].name }) : '-' },
  ].map((c) => `<div class="kpi" data-key="h-${c.k}">
      <div class="n">${esc(c.n)}</div><div class="l">${esc(c.l)}</div><div class="s">${esc(c.s)}</div>
    </div>`).join(''));

  const maxP = h.projects.reduce((m, p) => Math.max(m, p.cost_pct), 0);
  render('#hist-proj', h.projects.length
    ? `<div class="tbl-wrap" data-key="hp-tbl"><table>
      <thead><tr>
        <th>${t('col.project')}</th><th class="num">${t('col.sessions')}</th><th class="num">${t('col.calls')}</th>
        <th class="num">${t('col.api_tokens')}</th><th class="num">${t('col.cost')}</th><th class="num">${t('col.share')}</th><th class="num">${t('col.latest')}</th>
      </tr></thead><tbody>
      ${h.projects.map((p) => `<tr data-key="hp-${esc(p.name)}">
        <td class="nm">${esc(p.name)}</td>
        <td class="num">${p.sessions}</td>
        <td class="num">${p.msgs}</td>
        <td class="num">${fmtTok(p.api_total)}</td>
        <td class="num">${money(p.cost_usd)}</td>
        <td class="num">${shareCell(p.cost_pct, maxP)}</td>
        <td class="num">${dayOf(p.last_ts)}</td>
      </tr>`).join('')}
      </tbody></table></div>`
    : `<div class="empty" data-key="hp-none">${t('hist.none_range')}</div>`);

  const rows = histRows();
  const maxS = rows.reduce((m, r) => Math.max(m, r.cost_pct), 0);
  setText('#hist-count', t('hist.count', { shown: rows.length, total: T.sessions }));
  render('#hist-sess', rows.length
    ? `<div class="tbl-wrap" data-key="hs-tbl"><table>
      <thead><tr>
        <th>${t('col.task')}</th><th>${t('col.folder')}</th><th>${t('col.model')}</th>
        <th class="num">${t('col.calls')}</th><th class="num">${t('col.api_tokens')}</th><th class="num">${t('col.cost')}</th>
        <th class="num">${t('col.share')}</th><th class="num">${t('col.last_active')}</th>
      </tr></thead><tbody>
      ${rows.map((r) => `<tr data-key="hs-${esc(r.session_id)}">
        <td class="nm">${esc((r.title || r.last_prompt || r.session_id).slice(0, 60))}</td>
        <td>${esc(r.cwd.split('/').pop() || r.project)}${r.git_branch ? ' <span class="badge branch">' + esc(r.git_branch) + '</span>' : ''}</td>
        <td>${esc(r.models.map((m) => m.replace('claude-', '')).join(', '))}</td>
        <td class="num">${r.msgs}</td>
        <td class="num">${fmtTok(r.api_total)}</td>
        <td class="num">${money(r.cost_usd)}</td>
        <td class="num">${shareCell(r.cost_pct, maxS)}</td>
        <td class="num">${dayOf(r.last_ts)} ${clockOf(r.last_ts)}</td>
      </tr>`).join('')}
      </tbody></table></div>`
    : `<div class="empty" data-key="hs-none">${t('hist.none_filter')}</div>`);
}

function renderRes() {
  const q = ($('#filter').value || '').toLowerCase().trim();
  const mineOnly = $('#mine').checked;
  const aiOnly = $('#aionly').checked;
  let rows = S.snap.processes;
  if (mineOnly) rows = rows.filter((p) => p.mine);
  if (aiOnly) rows = rows.filter((p) => p.is_ai || p.in_ai_tree);
  if (q) {
    rows = rows.filter((p) => String(p.pid) === q || p.name.toLowerCase().includes(q) ||
      p.cmd.toLowerCase().includes(q) || p.label.toLowerCase().includes(q));
  }
  setText('#res-count', t('res.count', { n: rows.length, ram: fmtKB(rows.reduce((a, p) => a + p.rss_kb, 0)) }));
  render('#res-body', rows.map((p) => `<tr class="${p.rss_kb > 400 * 1024 ? 'heavy ' : ''}${p.is_ai || p.in_ai_tree ? 'ai' : ''}" data-key="p-${p.pid}">
    <td class="num">${p.pid}</td>
    <td class="nm">${esc(p.name)}${p.paused ? ` <span class="badge warn">${t('ai.paused_badge')}</span>` : ''}<span class="cmd">${esc(p.cmd.slice(0, 200))}</span></td>
    <td>${esc(kindLabel(p))}${p.in_ai_tree && !p.is_ai ? ` <span class="badge dim">${t('res.in_ai_tree')}</span>` : ''}</td>
    <td class="num rss" data-flash="1">${fmtKB(p.rss_kb)}</td>
    <td class="num" data-flash="1">${p.cpu_pct < 0 ? '-' : p.cpu_pct + '%'}</td>
    <td class="num">${fmtDur(p.uptime)}</td>
    <td>${p.mine ? `${pauseBtn(p.pid, p.paused, false)}
      <button class="mini danger" data-act="kill" data-pid="${p.pid}" data-label="${esc(p.name)}">${t('btn.kill')}</button>
      <button class="mini danger" data-act="kill_tree" data-pid="${p.pid}" data-label="${esc(p.name)}">${t('btn.kill_tree')}</button>`
    : `<span class="badge dim">${t('res.not_mine')}</span>`}</td>
  </tr>`).join('') || `<tr data-key="p-none"><td colspan="7">${t('res.none')}</td></tr>`);
}

function renderNet() {
  const s = S.snap;
  render('#port-body', (s.ports || []).map((p) => `<tr data-key="port-${p.port}-${p.addr}">
    <td class="num">${p.port}</td><td>${esc(p.addr)}</td><td class="num">${p.pid}</td>
    <td class="nm">${esc(p.command)}</td>
    <td>${esc(p.note_key ? t(p.note_key) : (p.note || ''))}</td>
    <td><button class="mini danger" data-act="kill" data-pid="${p.pid}" data-label="${esc(t('net.port_label', { port: p.port, cmd: p.command }))}">${t('btn.kill')}</button></td>
  </tr>`).join('') || `<tr data-key="port-none"><td colspan="6">${t('net.no_ports')}</td></tr>`);

  if (!s.docker_available) {
    render('#docker', `<div class="empty" data-key="dk-none">${t('net.no_docker')}</div>`);
    return;
  }
  render('#docker', (s.docker || []).length
    ? `<div class="tbl-wrap" data-key="dk-tbl"><table><thead><tr><th>${t('col.name')}</th><th>${t('col.image')}</th><th>${t('col.status')}</th><th>${t('col.ports')}</th></tr></thead><tbody>
      ${s.docker.map((c) => `<tr data-key="dk-${esc(c.id)}"><td class="nm">${esc(c.name)}</td><td>${esc(c.image)}</td><td>${esc(c.status)}</td><td>${esc(c.ports || '')}</td></tr>`).join('')}
      </tbody></table></div>`
    : `<div class="empty" data-key="dk-empty">${t('net.no_containers')}</div>`);
}

/* ------------------------------------------------------------- sự kiện */
/* Bấm chip loại agent: bật/tắt loại đó. `*` là bật hết. */
document.addEventListener('click', (ev) => {
  const chip = ev.target.closest('button[data-kind]');
  if (!chip) return;
  const k = chip.dataset.kind;
  if (k === '*') knownKinds().forEach((x) => S.kinds.add(x));
  else if (S.kinds.has(k)) S.kinds.delete(k);
  else S.kinds.add(k);
  saveKinds();
  if (S.snap) { renderKindBar(); renderLive(); renderKpis(); }
  // Văn phòng lọc ở phía server (phải lọc trước khi cắt còn 10 chỗ), nên phải gọi lại
  if (typeof officeKindsChanged === 'function') officeKindsChanged();
});

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const a = btn.dataset.act;
  if (a === 'kids') {
    const pid = +btn.dataset.pid;
    S.openKids.has(pid) ? S.openKids.delete(pid) : S.openKids.add(pid);
    renderLive();
    return;
  }
  if (a === 'events') {
    const sid = btn.dataset.sid;
    if (S.openEvents.has(sid)) { S.openEvents.delete(sid); renderLive(); }
    else { S.openEvents.add(sid); loadEvents(sid); renderLive(); }
    return;
  }
  if (a === 'info') {
    const pid = +btn.dataset.pid;
    S.openInfo.has(pid) ? S.openInfo.delete(pid) : S.openInfo.add(pid);
    renderLive();
    // Bảng chi tiết của tab Sân khấu bày cùng khối này, nên phải vẽ lại theo - không thì bấm
    // ở đó xong chẳng thấy gì mở ra.
    if (typeof renderDetail === 'function') renderDetail();
    return;
  }
  // Nội dung dựng lại từ S.snap theo PID chứ không nhét sẵn vào thuộc tính data-*: khối chữ
  // dài và có xuống dòng, mà `patch()` lại xoá mọi thuộc tính không có trong HTML mới.
  if (a === 'copyinfo') {
    const row = ((S.snap && S.snap.ai) || []).filter(hasCard).find((r) => r.pid === +btn.dataset.pid);
    if (!row) { toast(t('copy.gone'), 'err'); return; }
    copyText(sessionInfoText(row)).then((ok) =>
      toast(ok ? t('copy.ok_one', { name: row.session_name || ('PID ' + row.pid) }) : t('copy.fail'), ok ? '' : 'err'));
    return;
  }
  act(a, +btn.dataset.pid, btn.dataset.label, btn.dataset.sup);
});

/* Bộ lọc loại agent chỉ tác động tới hai tab này, nên chỉ hiện ở đó. Bày nó ra lúc đang xem
 * Lịch sử phiên hay Cổng & Docker là hứa một điều không có thật. */
const KIND_TABS = new Set(['ai', 'office']);

function syncKindBar() {
  const el = $('#kindbar');
  if (el) el.hidden = !KIND_TABS.has(S.tab);
}

/** Bật một tab. Tách riêng khỏi handler của nút vì chế độ cửa sổ nổi (`?view=office`) phải
 *  bật thẳng tab Văn phòng lúc dựng trang, không qua cú bấm nào. */
function showTab(name) {
  S.tab = name;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === name));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === 'pane-' + name));
  syncKindBar();
  if (name === 'hist') loadHistory();
  // Tab Cổng dùng dữ liệu mà bốn tab kia không xin, nên vừa sang là phải nạp lại ngay -
  // không thì người dùng nhìn số cũ tới hết một nhịp làm mới.
  if (name === 'net') loadSnapshot();
}

document.querySelectorAll('.tabs button').forEach((b) => {
  b.addEventListener('click', () => showTab(b.dataset.tab));
});

$('#hist-range').addEventListener('change', () => loadHistory());
$('#hist-reload').addEventListener('click', () => loadHistory(true));
['#hist-sort', '#hist-filter'].forEach((sel) =>
  $(sel).addEventListener('input', () => { if (S.hist) renderHist(); }));

['#filter', '#mine', '#aionly'].forEach((sel) =>
  $(sel).addEventListener('input', () => { if (S.snap) renderRes(); }));
$('#closed-range').addEventListener('change', () => { if (S.snap) renderClosed(); });

$('#refresh').addEventListener('click', loadSnapshot);

/* Mở bằng icon app thì không có terminal để Ctrl+C, nên tắt hẳn từ đây. */
$('#quit').addEventListener('click', async () => {
  const ok = await askConfirm(t('quit.title'), t('quit.body'));
  if (!ok) return;
  if (S.timer) { clearInterval(S.timer); S.timer = null; }
  S.interval = 0;
  try { await fetch('/api/quit', { method: 'POST' }); } catch (e) { /* server tắt giữa chừng là bình thường */ }
  toast(t('quit.done'), 'ok');
  setStatus(t('hdr.stopped'));
});
$('#interval').addEventListener('change', () => { S.interval = +$('#interval').value; schedule(); });
document.addEventListener('visibilitychange', onVisibility);

/* Trang có đang được nhìn không.
 *
 * `document.hidden` KHÔNG đủ, và đây là chỗ đã đo thật: vỏ nhúng của VSCode giấu webview
 * bằng cách cho nó `display:none`, mà Page Visibility API không đếm chuyện đó - thử ra
 * `document.hidden === false`, `setInterval` vẫn chạy đủ nhịp và `requestAnimationFrame`
 * vẫn quay 60 fps trong một cái iframe không ai thấy. Tức là thu gọn panel AI Monitor xong
 * thì server vẫn bị hỏi 207 KB mỗi 3 giây, mãi mãi.
 *
 * Vì vậy vỏ nhúng tự báo xuống qua postMessage; `S.embedHidden` là cờ đó. Mở trang trong
 * browser thường thì không ai gửi gì, cờ nằm im ở false và mọi thứ như cũ. */
function pageVisible() {
  return !document.hidden && !S.embedHidden;
}

function onVisibility() {
  schedule();
  if (typeof officeSync === 'function') officeSync();
}

window.addEventListener('message', (ev) => {
  const m = ev.data;
  if (!m || m.command !== 'aimon.visibility') return;
  const hidden = !m.visible;
  if (hidden === S.embedHidden) return;
  S.embedHidden = hidden;
  onVisibility();
  // Hiện lại thì nạp ngay một nhịp: chờ hết chu kỳ mới có số là người dùng nhìn thấy dữ
  // liệu cũ của lúc trước khi ẩn, tưởng tool treo.
  if (!hidden) loadSnapshot();
});

function schedule() {
  if (S.timer) { clearInterval(S.timer); S.timer = null; }
  // Ẩn thì KHÔNG đặt timer nào cả, thay vì đặt rồi bỏ qua trong callback: chi phí một lần
  // đánh thức mỗi 3 giây thì nhỏ, nhưng nó giữ cả tiến trình renderer khỏi ngủ.
  if (S.interval > 0 && pageVisible()) {
    S.timer = setInterval(() => { if (pageVisible()) loadSnapshot(); }, S.interval);
  }
}

/* Đổi ngôn ngữ: vẽ lại toàn bộ vùng động, không cần gọi lại server. */
function onLangChange() {
  if (S.snap) renderAll();
  if (S.hist) renderHist();
  // office.js nạp sau file này nên hàm có thể chưa tồn tại lúc trang mới dựng
  if (typeof officeRefresh === 'function') officeRefresh();
}
$('#lang').addEventListener('change', (e) => setLang(e.target.value));

/* ------------------------------------------------- giao diện sáng / tối */
const THEME_KEY = 'aimon.theme';

function systemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const b = $('#theme');
  if (b) b.textContent = theme === 'light' ? '☾' : '☀';
  // Khung nhìn Văn phòng vẽ lên canvas nên không tự đổi màu theo CSS như phần còn lại:
  // phải đọc lại bảng màu rồi vẽ lại, nếu không căn phòng vẫn giữ nguyên nền cũ.
  if (typeof officeRefresh === 'function') officeRefresh();
}

function setTheme(theme, remember) {
  if (remember) { try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* chế độ riêng tư */ } }
  applyTheme(theme);
}

$('#theme').addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
});

/* ------------------------------------------------- chỉ hiện sân khấu (chế độ solo)
 *
 * Dành cho người chỉ muốn nhìn căn phòng: ẩn header, hạn mức, KPI, thanh tab, bảng chọn và
 * bảng chi tiết, để lại đúng khung hình chiếm trọn cửa sổ. Bố cục dùng lại nguyên cách của
 * cửa sổ nổi (`body.pip`), khác ở chỗ đây vẫn là trang đầy đủ nên bật/tắt được tại chỗ.
 *
 * Ba lối ra, và phải có đủ ba: bấm vào một nhân vật (đường chính, xem onClick ở office.js),
 * nút nổi ở góc, phím Esc. Phòng trống là chuyện thường - còn lựa chọn này thì được nhớ lại
 * cho lần mở sau - nên nếu chỉ có đường "bấm nhân vật" thì người dùng kẹt lại vĩnh viễn.
 *
 * Tắt luôn vòng /api/snapshot trong lúc bật, cùng lý do với cửa sổ nổi: 197 KB mỗi 3 giây
 * cho những bảng biểu đang bị CSS giấu hết, trong khi khung hình sống bằng /api/pulse 2 KB
 * mỗi giây. Thoát ra thì nạp lại ngay một nhịp, không để người dùng nhìn số cũ. */
const SOLO_KEY = 'aimon.solo';

function setSolo(on, remember) {
  if (S.pip) return;               // cửa sổ nổi vốn đã chỉ có mỗi khung hình
  on = !!on;
  const changed = on !== S.solo;
  S.solo = on;
  document.body.classList.toggle('solo', on);
  const b = $('#office-solo');
  if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (remember) {
    try { localStorage.setItem(SOLO_KEY, on ? '1' : '0'); } catch (e) { /* chế độ riêng tư */ }
  }

  if (on) {
    if (S.tab !== 'office') showTab('office');
    S.interval = 0;
    schedule();
  } else if (changed) {
    S.interval = +$('#interval').value || 0;
    schedule();
    loadSnapshot();
  }
  // Bố cục vừa đổi nên khung hình phải đo lại chỗ trống. office.js nạp sau file này, lúc
  // dựng trang hàm này có thể chưa tồn tại - officeInit() tự gọi resize() sau đó.
  if (typeof officeSync === 'function') officeSync();
  if (typeof officeResize === 'function') officeResize();
}

$('#office-solo').addEventListener('click', () => setSolo(!S.solo, true));
$('#office-solo-exit').addEventListener('click', () => setSolo(false, true));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.solo && !S.modalOpen) setSolo(false, true);
});

/* Tham số do vỏ nhúng truyền vào (extension VSCode): ?theme=, ?refresh=, ?compact=1.
 *
 * Khi có ?theme= thì ẩn nút đổi giao diện: dashboard phải bám theo theme của editor, để hai
 * nguồn quyết định không đá nhau. Mở bằng app macOS / .exe thì không có tham số nào, lúc đó
 * lấy lựa chọn đã lưu, chưa có thì theo cài đặt sáng/tối của hệ điều hành. */
function applyEmbedOptions() {
  const q = new URLSearchParams(location.search);

  const theme = q.get('theme');
  if (theme === 'light' || theme === 'dark') {
    setTheme(theme, false);
    const b = $('#theme');
    if (b) b.hidden = true;
  } else {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* bỏ qua */ }
    const cfg = (window.AIMON_CONFIG || {}).theme;
    const fromCfg = cfg === 'light' || cfg === 'dark' ? cfg : null;
    setTheme(saved === 'light' || saved === 'dark' ? saved : (fromCfg || systemTheme()), false);
  }

  const refresh = Number(q.get('refresh') || (window.AIMON_CONFIG || {}).refresh_seconds || 0);
  if (Number.isFinite(refresh) && refresh > 0) {
    S.interval = Math.round(refresh * 1000);
    const sel = $('#interval');
    if (sel) {
      if (![...sel.options].some((o) => +o.value === S.interval)) {
        const o = document.createElement('option');
        o.value = String(S.interval);
        o.textContent = (S.interval / 1000) + 's';
        sel.appendChild(o);
      }
      sel.value = String(S.interval);
    }
  }

  if (q.get('compact') === '1') document.body.classList.add('compact');
  S.extVersion = q.get('ext') || '';

  /* Chế độ cửa sổ nổi: cả trang chỉ còn đúng căn phòng, không header, không tab, không bảng
   * chi tiết. Bấm vào một nhân vật thì báo lên vỏ nhúng để nó mở dashboard đầy đủ ra - ở đây
   * không có chỗ nào bày cây tiến trình cho tử tế.
   *
   * Tắt luôn vòng /api/snapshot: căn phòng chỉ sống bằng /api/pulse (2 KB mỗi giây), còn
   * snapshot là 197 KB mỗi 3 giây cho những bảng biểu mà cửa sổ này không hề vẽ. */
  if (q.get('view') === 'office') {
    S.pip = true;
    S.interval = 0;
    document.body.classList.add('pip');
    showTab('office');
  }

  /* Chỉ hiện sân khấu là lựa chọn của người dùng chứ không phải tham số của vỏ nhúng, nên
   * nhớ ở localStorage và không nhận từ query param: mỗi khung nhìn tự quyết. */
  if (!S.pip) {
    let solo = null;
    try { solo = localStorage.getItem(SOLO_KEY); } catch (e) { /* bỏ qua */ }
    if (solo === '1') setSolo(true, false);
  }

  /* Bộ lọc loại agent. Thứ tự KHÁC theme một chỗ, và cố ý: lựa chọn người dùng bấm trên
   * trang đứng TRƯỚC `?kinds=` của extension.
   *
   *   localStorage  >  ?kinds=  >  config.json ai_kinds  >  mặc định trong code
   *
   * Theme phải để `?theme=` thắng vì dashboard bắt buộc bám theo màu của editor. Bộ lọc thì
   * không có ràng buộc đó - bấm tắt Codex xong tải lại trang mà nó hiện lại thì cái nút coi
   * như hỏng. Settings của VSCode vì thế đóng vai giá trị KHỞI ĐẦU, không phải ép buộc. */
  let saved = null;
  try { saved = localStorage.getItem(KINDS_KEY); } catch (e) { /* bỏ qua */ }
  const cfgKinds = (window.AIMON_CONFIG || {}).ai_kinds;
  const source = saved != null ? saved
    : (q.get('kinds') != null ? q.get('kinds')
      : (Array.isArray(cfgKinds) ? cfgKinds.join(',') : 'claude-code'));
  const picked = parseKinds(source);
  // Chuỗi rỗng đã lưu là hợp lệ (người dùng bỏ chọn hết); chỉ nguồn HỎNG mới rơi về mặc định
  if (picked.size || saved != null) S.kinds = picked;
}

applyEmbedOptions();
applyStaticI18n();
syncKindBar();
// Số phiên bản không chờ snapshot: trang mở ra mà server hỏng thì đó đúng là lúc người ta
// cần đọc nó nhất.
setText('#ver', versionLine());
// Cửa sổ nổi và chế độ chỉ hiện sân khấu không vẽ gì lấy từ /api/snapshot, kể cả một lần đầu
// tiên: 197 KB cho những bảng biểu đang bị CSS giấu đi hết. Thoát chế độ solo thì setSolo()
// nạp ngay một nhịp.
if (!S.pip && !S.solo) loadSnapshot();
schedule();
