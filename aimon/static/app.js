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
  events: {},
  busy: false,
  modalOpen: false,
  caps: { pause: true, os: 'macos' },
  fx: false,   // hiệu ứng sáng chữ khi số đổi - mặc định tắt
};

try { S.fx = localStorage.getItem('aimon.fx') === '1'; } catch (e) { /* chế độ riêng tư */ }

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

/* ------------------------------------------------------------- morph DOM */
function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
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

/* ------------------------------------------------------------- modal + toast */
function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), 4600);
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
    const r = await fetch('/api/snapshot', { cache: 'no-store' });
    const data = await r.json();
    if (data.error) { toast('Lỗi snapshot: ' + data.error, 'err'); return; }
    S.snap = data;
    S.caps = data.capabilities || S.caps;
    renderAll();
  } catch (e) {
    setText('#stamp', 'mất kết nối server');
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

const ACT_NAME = {
  pause: 'tạm dừng', resume: 'tiếp tục', kill: 'kill', force_kill: 'kill cứng',
  kill_tree: 'kill cây', pause_tree: 'tạm dừng cây', resume_tree: 'tiếp tục cây',
};

async function act(action, pid, label, supervisor) {
  const destructive = action === 'kill' || action === 'force_kill' || action === 'kill_tree';
  if (destructive) {
    const ok = await askConfirm(
      `${ACT_NAME[action]} PID ${pid}?`,
      label || '',
      supervisor ? `Tiến trình này do ${supervisor} quản lý - nó có thể tự khởi động lại sau khi kill.` : ''
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
      toast(`Đã ${ACT_NAME[action]} PID ${pid}${n > 1 ? ` (${n} tiến trình)` : ''}`, 'ok');
    } else {
      toast(`Không ${ACT_NAME[action]} được PID ${pid}: ${d.error || 'lỗi không rõ'}`, 'err');
    }
    if (d.failed && d.failed.length) toast(`${d.failed.length} tiến trình con không xử lý được`, 'err');
  } catch (e) {
    toast('Gọi API thất bại: ' + e.message, 'err');
  }
  setTimeout(loadSnapshot, 350);
}

/* ------------------------------------------------------------- render */
function renderAll() {
  renderHeader();
  renderUsage();
  renderKpis();
  renderChips();
  renderLive();
  renderClosed();
  renderRes();
  renderNet();
  setText('#stamp', 'cập nhật ' + clockOf(S.snap.ts));
  setText('#ver', (S.caps.os || '') + (S.caps.pause ? '' : ' · không hỗ trợ tạm dừng'));
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

  const loadTxt = sys.load && sys.load.length ? `load ${sys.load[0]} · ` : '';
  setText('#load', `${loadTxt}${sys.cpu_count} lõi · ${sys.proc_count} tiến trình`);
  const el = $('#load');
  if (sys.load && sys.load.length) el.title = `Load average 1/5/15 phút: ${sys.load.join(' / ')}`;
}

const OFFICIAL_HINT =
  'Phần trăm hạn mức do Claude Code báo ra, đọc từ ~/.claude/rate-cache.json. ' +
  'File này chỉ được ghi khi statusline của Claude Code chạy, nên có lúc không có số mới. ' +
  'Khi đó ô này hiển thị lượng token thực tế đã dùng, đọc trực tiếp từ transcript.';

/** 1 ô hạn mức. Có % chính thức còn mới => hiện %; không có/đã cũ => chỉ hiện số local. */
function gauge(key, title, pct, resetIn, local, localLabel) {
  const fresh = pct != null && !S.snap.usage.official.stale;
  const p = fresh ? Math.max(0, Math.min(100, pct)) : 0;
  const big = fresh ? p.toFixed(0) + '%' : fmtTok(local.total);
  const sub = fresh
    ? (resetIn > 0 ? 'Reset sau ' + fmtDur(resetIn) : 'Chờ mốc reset mới')
    : `${localLabel} · ${local.msgs || 0} lượt gọi`;
  return `<div class="ubox" data-key="u-${key}" title="${esc(OFFICIAL_HINT)}">
    <div class="hdr"><b>${esc(title)}</b><span class="pct" data-flash="1">${esc(big)}</span></div>
    ${fresh
      ? `<div class="bar lg ${barClass(p)}"><i style="width:${p}%"></i></div>`
      : '<div class="bar lg"><i style="width:0"></i></div>'}
    <div class="sub">${esc(sub)}</div>
    <div class="loc" data-flash="1">${fresh
      ? `${esc(localLabel)}: ${fmtTok(local.total)} token · ${money(local.cost)}`
      : `${money(local.cost)} · token đã dùng theo transcript`}</div>
  </div>`;
}

/** Row trên: thống kê Claude (hạn mức + token + chi phí hôm nay). */
function renderUsage() {
  const s = S.snap, t = s.totals;
  const off = (s.usage || {}).official || {};
  const loc = (s.usage || {}).local || {};
  const h5 = loc.h5 || { total: 0, cost: 0, msgs: 0 };
  const d7 = loc.d7 || { total: 0, cost: 0, msgs: 0 };

  render('#usage',
    gauge('h5', 'Session (5 giờ)', off.five_hour_pct, off.five_hour_in, h5, '5 giờ qua') +
    gauge('d7', 'Weekly (7 ngày)', off.seven_day_pct, off.seven_day_in, d7, '7 ngày qua') +
    `<div class="ubox" data-key="u-tok">
      <div class="hdr"><b>Token API hôm nay</b><span class="pct" data-flash="1">${fmtTok(t.today.total)}</span></div>
      <div class="sub">${t.today.msgs} lượt gọi · tính từ 00:00</div>
      <div class="loc" data-flash="1">Ra ${fmtTok(t.today.output)} · cache read ${fmtTok(t.today.cache_read)}</div>
    </div>
    <div class="ubox" data-key="u-cost">
      <div class="hdr"><b>Chi phí hôm nay</b><span class="pct" data-flash="1">${money(t.today.cost)}</span></div>
      <div class="sub">${t.sessions_today} phiên · quy đổi theo pricing.json</div>
      <div class="loc" data-flash="1">7 ngày qua: ${money(d7.cost)}</div>
    </div>`);
}

/** Row dưới: tiến trình - phiên Claude, MCP server, RAM, CPU. */
function renderKpis() {
  const s = S.snap, t = s.totals, sys = s.system;
  const mcp = s.groups.find((g) => g.kind === 'mcp') || { count: 0, rss_kb: 0 };
  const running = s.ai.filter((r) => r.session && r.session.pending.length).length;
  const cards = [
    { k: 'live', n: t.live, l: 'Phiên Claude Code sống',
      s: running ? `${running} phiên đang thao tác` : 'tất cả đang rảnh' },
    { k: 'mcp', n: mcp.count, l: 'MCP server', s: fmtKB(mcp.rss_kb) + ' RAM' },
    { k: 'ram', n: fmtKB(sys.ai_rss_kb), l: 'RAM do AI chiếm',
      s: `${sys.mem_total_kb ? (sys.ai_rss_kb / sys.mem_total_kb * 100).toFixed(0) : 0}% RAM máy`,
      hot: sys.ai_rss_kb > sys.mem_total_kb * 0.35 },
    { k: 'cpu', n: (sys.ai_cpu_pct || 0).toFixed(1) + '%', l: 'CPU do AI chiếm',
      s: `${sys.cpu_count} lõi · ${s.ai.length} tiến trình AI gốc`,
      hot: (sys.ai_cpu_pct || 0) > 100 },
  ];
  render('#kpis', cards.map((c) =>
    `<div class="kpi${c.hot ? ' hot' : ''}" data-key="k-${c.k}">
      <div class="n" data-flash="1">${esc(c.n)}</div>
      <div class="l">${esc(c.l)}</div><div class="s">${esc(c.s)}</div>
    </div>`).join(''));
}

function renderChips() {
  render('#chips', S.snap.groups.map((g) =>
    `<span class="chip" data-kind="${esc(g.kind)}" data-key="c-${esc(g.kind)}"><i class="dot"></i>${esc(g.label)} <b>${g.count}</b> · ${fmtKB(g.rss_kb)}${g.cpu_pct > 0.5 ? ' · ' + g.cpu_pct + '% CPU' : ''}</span>`
  ).join('') || '<span class="chip" data-key="c-none">Không thấy tiến trình AI nào</span>');
}

function pauseBtn(pid, paused, tree) {
  if (!S.caps.pause) return '';
  const a = (paused ? 'resume' : 'pause') + (tree ? '_tree' : '');
  const label = paused ? (tree ? 'Tiếp tục cây' : 'Tiếp tục') : (tree ? 'Tạm dừng cây' : 'Dừng');
  return `<button class="mini${paused ? '' : ' warn'}" data-act="${a}" data-pid="${pid}">${label}</button>`;
}

function kidRow(node, depth) {
  const heavy = node.rss_tree_kb > 400 * 1024;
  return `<div class="kid${heavy ? ' heavy' : ''}" data-key="kid-${node.pid}">
      <span class="ind">${'   '.repeat(depth)}</span>
      <span class="badge${node.kind === 'mcp' ? '' : ' dim'}">${esc(node.label)}</span>
      <span class="nm">${esc(node.name)}</span>
      <span class="cmd">${esc(node.cmd.slice(0, 170))}</span>
      <span class="num" data-flash="1">PID ${node.pid} · ${fmtKB(node.rss_tree_kb)}${node.cpu_pct > 0.5 ? ' · ' + node.cpu_pct + '%' : ''}${node.paused ? ' · tạm dừng' : ''}</span>
      <span class="acts">${pauseBtn(node.pid, node.paused, false)}
        <button class="mini danger" data-act="kill_tree" data-pid="${node.pid}" data-label="${esc(node.label + ' - ' + node.name)}">Kill</button>
      </span>
    </div>` + (node.children || []).map((c) => kidRow(c, depth + 1)).join('');
}

function sessionCard(r) {
  const s = r.session;
  const doing = s && s.pending.length ? s.pending[0] : null;
  const active = !!doing && !r.paused;
  const cls = r.paused ? 'paused' : active ? 'active' : '';
  const title = s ? (s.title || r.session_name || 'Phiên không tên') : (r.session_name || r.label);
  const path = s ? (s.cwd || '') : '';
  const kidsOpen = S.openKids.has(r.pid);
  const evOpen = !!(s && S.openEvents.has(s.session_id));

  const badges = [];
  if (s) (s.models || []).forEach((m) => badges.push(`<span class="badge model">${esc(m)}</span>`));
  if (s && s.git_branch) badges.push(`<span class="badge branch">${esc(s.git_branch)}</span>`);
  if (s && s.mode && s.mode !== 'default') badges.push(`<span class="badge warn">${esc(s.mode)}</span>`);
  if (r.entrypoint) badges.push(`<span class="badge dim">${esc(r.entrypoint)}</span>`);
  if (r.supervisor) badges.push(`<span class="badge warn" title="Tiến trình do ${esc(r.supervisor)} quản lý, kill xong có thể tự bật lại">${esc(r.supervisor)} quản lý</span>`);
  if (r.paused) badges.push('<span class="badge warn">đã tạm dừng</span>');

  let stats;
  if (s) {
    const tk = s.tokens, td = s.today || { total: 0, cost: 0 };
    stats = `<div class="grid">
      <div class="cell"><div class="v" data-flash="1">${fmtTok(td.total)}</div><div class="k">token hôm nay (${money(td.cost)})</div></div>
      <div class="cell"><div class="v" data-flash="1">${fmtTok(s.api_total)}</div><div class="k">token cả phiên (vào ${fmtTok(tk.input)} · ra ${fmtTok(tk.output)})</div></div>
      <div class="cell"><div class="v" data-flash="1">${money(s.cost_usd)}</div><div class="k">chi phí cả phiên</div></div>
      <div class="cell"><div class="v" data-flash="1">${s.user_turns} / ${s.assistant_msgs}</div><div class="k">lượt hỏi / lượt trả lời</div></div>
      <div class="cell"><div class="v" data-flash="1">${s.agents_total}</div><div class="k">sub-agent đã gọi${s.agents_running.length ? ' · ' + s.agents_running.length + ' đang chạy' : ''}</div></div>
      <div class="cell"><div class="v" data-flash="1">${fmtKB(r.rss_tree_kb)}</div><div class="k">RAM cả cây (${r.children.length} con)</div></div>
      <div class="cell"><div class="v" data-flash="1">${r.cpu_tree_pct}%</div><div class="k">CPU cả cây</div></div>
      <div class="cell"><div class="v">${fmtDur(r.uptime)}</div><div class="k">thời gian chạy</div></div>
    </div>
    <div class="ctx">
      <div class="lbl"><span>Context phiên hiện tại</span><span>${fmtTok(s.context)} / ${fmtTok(s.context_window)} (${s.context_pct}%)</span></div>
      <div class="bar ${barClass(s.context_pct)}"><i style="width:${Math.min(100, s.context_pct)}%"></i></div>
    </div>`;
  } else {
    stats = `<div class="grid">
      <div class="cell"><div class="v" data-flash="1">${fmtKB(r.rss_tree_kb)}</div><div class="k">RAM cả cây</div></div>
      <div class="cell"><div class="v" data-flash="1">${r.cpu_tree_pct}%</div><div class="k">CPU cả cây</div></div>
      <div class="cell"><div class="v">${fmtDur(r.uptime)}</div><div class="k">thời gian chạy</div></div>
      <div class="cell"><div class="v">${r.children.length}</div><div class="k">tiến trình con</div></div>
    </div>
    <div class="doing"><span class="idle">Loại này không có transcript token để đọc - chỉ theo dõi tài nguyên.</span></div>`;
  }

  let doingBlock = '';
  if (s) {
    if (doing) {
      const more = s.pending.length > 1 ? ` <span class="el">+${s.pending.length - 1} tool khác đang chờ</span>` : '';
      doingBlock = `<div class="doing run">Đang chạy: <code>${esc(doing.brief)}</code> <span class="el">${fmtDur(doing.elapsed)}${doing.side ? ' · trong sub-agent' : ''}</span>${more}</div>`;
    } else {
      doingBlock = `<div class="doing"><span class="idle">Rảnh${s.idle != null ? ' ' + fmtDur(s.idle) : ''}${s.last_prompt ? ' · lệnh cuối: ' + esc(s.last_prompt.slice(0, 90)) : ''}</span></div>`;
    }
    if (s.agents_running.length) {
      doingBlock += '<div class="doing run">' + s.agents_running.map((a) =>
        `Sub-agent <code>${esc(a.type)}</code> ${esc(a.desc)} <span class="el">${fmtDur(a.elapsed)}</span>`
      ).join('<br>') + '</div>';
    }
    if (s.top_tools.length) {
      doingBlock += `<div class="doing"><span class="idle">Tool dùng nhiều: ${s.top_tools.map((t) => esc(t.name) + ' ×' + t.count).join(' · ')}</span></div>`;
    }
  }

  const kidsBlock = kidsOpen && r.children.length
    ? `<div class="kids">${r.children.map((c) => kidRow(c, 0)).join('')}</div>` : '';

  let evBlock = '';
  if (evOpen) {
    const list = S.events[s.session_id];
    evBlock = '<div class="events">' + (list && list.length
      ? list.map((e, i) => `<div class="ev ${esc(e.kind)}" data-key="ev-${i}"><span class="t">${clockOf(e.ts)}</span><span class="x">${esc(e.text)}</span></div>`).join('')
      : '<div class="ev"><span class="x">Chưa có dữ liệu dòng thời gian.</span></div>') + '</div>';
  }

  return `<div class="sess ${cls}" data-key="sess-${r.pid}">
    <div class="top">
      <span class="st"></span>
      <span class="ttl">${esc(title)}</span>
      <span class="path">${esc(path)}</span>
      ${badges.join(' ')}
      <span class="badge dim">PID ${r.pid}</span>
      <span class="acts">
        ${s ? `<button class="mini" data-act="events" data-sid="${esc(s.session_id)}">${evOpen ? 'Ẩn' : 'Dòng thời gian'}</button>` : ''}
        ${r.children.length ? `<button class="mini" data-act="kids" data-pid="${r.pid}">${kidsOpen ? 'Ẩn cây' : 'Cây con (' + r.children.length + ')'}</button>` : ''}
        ${pauseBtn(r.pid, r.paused, true)}
        <button class="mini danger" data-act="kill_tree" data-pid="${r.pid}" data-label="${esc(title)}"${r.supervisor ? ` data-sup="${esc(r.supervisor)}"` : ''}>Kill cây</button>
      </span>
    </div>
    ${stats}${doingBlock}${kidsBlock}${evBlock}
  </div>`;
}

function renderLive() {
  const list = S.snap.ai;
  render('#live', list.length
    ? list.map(sessionCard).join('')
    : '<div class="empty" data-key="live-empty">Không có tiến trình AI nào đang chạy.</div>');
}

function renderClosed() {
  const range = $('#closed-range').value;
  const since = range === 'today' ? (S.snap.today_start || 0) : (S.snap.ts - 7 * 86400);
  const rows = (S.snap.orphan_sessions || []).filter((s) => (s.last_ts || 0) >= since);
  if (!rows.length) {
    render('#closed', `<div class="empty" data-key="closed-empty">Không có phiên đã đóng ${range === 'today' ? 'trong hôm nay (tính từ 00:00)' : 'trong 7 ngày qua'}.</div>`);
    return;
  }
  render('#closed', `<div class="tbl-wrap" data-key="closed-tbl"><table>
    <thead><tr>
      <th>Phiên</th><th>Thư mục</th><th>Model</th>
      <th class="num">Token API</th><th class="num">Context cuối</th><th class="num">Chi phí</th><th class="num">Hoạt động cuối</th>
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
  setText('#res-count', `${rows.length} tiến trình · ${fmtKB(rows.reduce((a, p) => a + p.rss_kb, 0))}`);
  render('#res-body', rows.map((p) => `<tr class="${p.rss_kb > 400 * 1024 ? 'heavy ' : ''}${p.is_ai || p.in_ai_tree ? 'ai' : ''}" data-key="p-${p.pid}">
    <td class="num">${p.pid}</td>
    <td class="nm">${esc(p.name)}${p.paused ? ' <span class="badge warn">tạm dừng</span>' : ''}<span class="cmd">${esc(p.cmd.slice(0, 200))}</span></td>
    <td>${esc(p.label)}${p.in_ai_tree && !p.is_ai ? ' <span class="badge dim">trong cây AI</span>' : ''}</td>
    <td class="num rss" data-flash="1">${fmtKB(p.rss_kb)}</td>
    <td class="num" data-flash="1">${p.cpu_pct < 0 ? '-' : p.cpu_pct + '%'}</td>
    <td class="num">${fmtDur(p.uptime)}</td>
    <td>${p.mine ? `${pauseBtn(p.pid, p.paused, false)}
      <button class="mini danger" data-act="kill" data-pid="${p.pid}" data-label="${esc(p.name)}">Kill</button>
      <button class="mini danger" data-act="kill_tree" data-pid="${p.pid}" data-label="${esc(p.name)}">Kill cây</button>`
    : '<span class="badge dim">không phải của tôi</span>'}</td>
  </tr>`).join('') || '<tr data-key="p-none"><td colspan="7">Không có dòng nào khớp bộ lọc.</td></tr>');
}

function renderNet() {
  const s = S.snap;
  render('#port-body', (s.ports || []).map((p) => `<tr data-key="port-${p.port}-${p.addr}">
    <td class="num">${p.port}</td><td>${esc(p.addr)}</td><td class="num">${p.pid}</td>
    <td class="nm">${esc(p.command)}</td>
    <td>${esc(p.note || '')}</td>
    <td><button class="mini danger" data-act="kill" data-pid="${p.pid}" data-label="cổng ${p.port} - ${esc(p.command)}">Kill</button></td>
  </tr>`).join('') || '<tr data-key="port-none"><td colspan="6">Không đọc được cổng nào (macOS/Linux cần lsof, Windows dùng netstat).</td></tr>');

  if (!s.docker_available) {
    render('#docker', '<div class="empty" data-key="dk-none">Máy này chưa có Docker CLI - bỏ qua phần container.</div>');
    return;
  }
  render('#docker', (s.docker || []).length
    ? `<div class="tbl-wrap" data-key="dk-tbl"><table><thead><tr><th>Tên</th><th>Image</th><th>Trạng thái</th><th>Cổng</th></tr></thead><tbody>
      ${s.docker.map((c) => `<tr data-key="dk-${esc(c.id)}"><td class="nm">${esc(c.name)}</td><td>${esc(c.image)}</td><td>${esc(c.status)}</td><td>${esc(c.ports || '')}</td></tr>`).join('')}
      </tbody></table></div>`
    : '<div class="empty" data-key="dk-empty">Không có container nào đang chạy.</div>');
}

/* ------------------------------------------------------------- sự kiện */
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
  act(a, +btn.dataset.pid, btn.dataset.label, btn.dataset.sup);
});

document.querySelectorAll('.tabs button').forEach((b) => {
  b.addEventListener('click', () => {
    S.tab = b.dataset.tab;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === 'pane-' + S.tab));
  });
});

['#filter', '#mine', '#aionly'].forEach((sel) =>
  $(sel).addEventListener('input', () => { if (S.snap) renderRes(); }));
$('#closed-range').addEventListener('change', () => { if (S.snap) renderClosed(); });

$('#fx').checked = S.fx;
$('#fx').addEventListener('change', () => {
  S.fx = $('#fx').checked;
  try { localStorage.setItem('aimon.fx', S.fx ? '1' : '0'); } catch (e) { /* bỏ qua */ }
  if (!S.fx) document.querySelectorAll('.upd').forEach((e) => e.classList.remove('upd'));
});

$('#refresh').addEventListener('click', loadSnapshot);
$('#interval').addEventListener('change', () => { S.interval = +$('#interval').value; schedule(); });
document.addEventListener('visibilitychange', schedule);

function schedule() {
  if (S.timer) { clearInterval(S.timer); S.timer = null; }
  if (S.interval > 0) {
    S.timer = setInterval(() => { if (!document.hidden) loadSnapshot(); }, S.interval);
  }
}

loadSnapshot();
schedule();
