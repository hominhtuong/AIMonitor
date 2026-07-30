"""Đọc dữ liệu phiên Claude Code từ `~/.claude`.

Nguồn:
  - `~/.claude/sessions/<pid>.json`                  => map PID <-> sessionId, cwd, entrypoint
  - `~/.claude/projects/<slug>/<sessionId>.jsonl`    => transcript: token, model, tool đang chạy,
                                                        sub-agent, số lượt, thời điểm hoạt động cuối

Token được gom vào **bucket theo từng giờ** nên tính được:
  - hôm nay (từ 00:00 giờ máy)
  - cửa sổ trượt 5 giờ (đối chiếu giới hạn Session của Claude)
  - cửa sổ trượt 7 ngày (đối chiếu giới hạn Weekly)

Transcript đọc **tăng dần** (nhớ offset + inode). File của ngày cũ chỉ parse ở chế độ
nhẹ (chỉ dòng có `usage`) để không tốn thời gian.
"""

from __future__ import annotations

import glob
import json
import os
import time
from datetime import datetime

HOME = os.path.expanduser("~")
CLAUDE_DIR = os.path.join(HOME, ".claude")
PROJECTS_DIR = os.path.join(CLAUDE_DIR, "projects")
SESSIONS_DIR = os.path.join(CLAUDE_DIR, "sessions")

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

MAX_EVENTS = 60
AGENT_TOOLS = {"Agent", "Task"}

_PRICING: dict | None = None
_STATE: dict[str, dict] = {}          # path -> state
_HOUR = 3600


# ---------------------------------------------------------------- giá & model


def pricing() -> dict:
    global _PRICING
    if _PRICING is None:
        try:
            with open(os.path.join(BASE, "pricing.json"), encoding="utf-8") as f:
                _PRICING = json.load(f)
        except Exception:
            _PRICING = {"models": {}, "default": {"input": 5, "output": 25, "context": 1000000}}
    return _PRICING


def model_info(model: str) -> dict:
    p = pricing()
    models = p.get("models", {})
    default = p.get("default", {"input": 5, "output": 25, "context": 1000000})
    info = models.get(model)
    if info is None:
        for key, val in models.items():  # 'claude-opus-5[1m]' => 'claude-opus-5'
            if model.startswith(key):
                info = val
                break
    merged = dict(default)
    merged.update(info or {})
    return merged


def _msg_cost(model: str, inp: int, outp: int, cread: int, w5: int, w1h: int) -> float:
    i = model_info(model)
    pin, pout = float(i.get("input", 5)), float(i.get("output", 25))
    return (
        inp * pin
        + outp * pout
        + w5 * pin * float(i.get("cache_write_5m_mult", 1.25))
        + w1h * pin * float(i.get("cache_write_1h_mult", 2.0))
        + cread * pin * float(i.get("cache_read_mult", 0.1))
    ) / 1_000_000


# ---------------------------------------------------------------- mốc thời gian


def today_start() -> float:
    now = datetime.now()
    return datetime(now.year, now.month, now.day).timestamp()


def _ts(value) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def _empty_bucket() -> dict:
    return {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "cost": 0.0, "msgs": 0}


# ---------------------------------------------------------------- parse


def _new_state(path: str, st: os.stat_result) -> dict:
    return {
        "path": path,
        "ino": st.st_ino,
        "offset": 0,
        "light": False,
        "session_id": os.path.basename(path)[:-6],
        "project": os.path.basename(os.path.dirname(path)),
        "cwd": None,
        "git_branch": None,
        "version": None,
        "title": None,
        "mode": None,
        "last_prompt": None,
        "models": {},
        "side_tokens": {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0},
        "hourly": {},          # epoch_hour -> bucket
        "context": 0,
        "context_model": None,
        "assistant_msgs": 0,
        "user_turns": 0,
        "tools": {},
        "pending": {},
        "agents": {},
        "events": [],
        "seen_msgs": set(),   # (message.id, requestId) - chống đếm trùng partial message
        "last_ts": 0.0,
        "first_ts": 0.0,
    }


def _bucket(state: dict, model: str) -> dict:
    return state["models"].setdefault(
        model,
        {"input": 0, "output": 0, "cache_read": 0, "cache_write_5m": 0, "cache_write_1h": 0},
    )


def _brief(name: str, inp) -> str:
    if not isinstance(inp, dict):
        return name
    for key in ("command", "file_path", "pattern", "query", "url", "description", "prompt", "path"):
        val = inp.get(key)
        if isinstance(val, str) and val.strip():
            val = " ".join(val.split())
            if key in ("file_path", "path"):
                val = val.replace(HOME, "~")
            return f"{name}({val[:90]})"
    return name


def _add_event(state: dict, ts: float, kind: str, text: str) -> None:
    state["events"].append({"ts": ts, "kind": kind, "text": text[:160]})
    if len(state["events"]) > MAX_EVENTS:
        del state["events"][: len(state["events"]) - MAX_EVENTS]


def _process(state: dict, d: dict, light: bool) -> None:
    typ = d.get("type")
    ts = _ts(d.get("timestamp"))
    if ts:
        state["last_ts"] = max(state["last_ts"], ts)
        if not state["first_ts"]:
            state["first_ts"] = ts

    if not light:
        for key, field in (("cwd", "cwd"), ("gitBranch", "git_branch"), ("version", "version")):
            if d.get(key):
                state[field] = d[key]
        if typ == "ai-title":
            state["title"] = d.get("aiTitle")
            return
        if typ == "last-prompt":
            prompt = d.get("lastPrompt")
            if isinstance(prompt, str):
                state["last_prompt"] = " ".join(prompt.split())[:200]
            return
        if typ == "mode":
            state["mode"] = d.get("mode")
            return

    msg = d.get("message")
    if not isinstance(msg, dict):
        return
    side = bool(d.get("isSidechain"))
    content = msg.get("content")

    if typ == "assistant":
        model = msg.get("model") or "unknown"
        if model.startswith("<"):
            return  # '<synthetic>': CLI tự sinh, không gọi API

        # Claude Code chạy với --include-partial-messages ghi CÙNG một message
        # nhiều lần (cùng message.id + requestId, usage y hệt nhau). Nếu cộng hết
        # thì token và chi phí phồng lên gấp ~2 lần so với thực tế (đối chiếu
        # `npx ccusage`). Chỉ tính bản ghi đầu tiên của mỗi message.
        msg_id = msg.get("id")
        if msg_id:
            key = (msg_id, d.get("requestId"))
            if key in state["seen_msgs"]:
                return
            state["seen_msgs"].add(key)

        usage = msg.get("usage") or {}
        inp = int(usage.get("input_tokens") or 0)
        outp = int(usage.get("output_tokens") or 0)
        cread = int(usage.get("cache_read_input_tokens") or 0)
        cwrite = int(usage.get("cache_creation_input_tokens") or 0)
        cc = usage.get("cache_creation") or {}
        w1h = int(cc.get("ephemeral_1h_input_tokens") or 0)
        w5m = int(cc.get("ephemeral_5m_input_tokens") or 0)
        if w1h + w5m == 0:
            w5m = cwrite

        b = _bucket(state, model)
        b["input"] += inp
        b["output"] += outp
        b["cache_read"] += cread
        b["cache_write_5m"] += w5m
        b["cache_write_1h"] += w1h

        hb = state["hourly"].setdefault(int((ts or time.time()) // _HOUR), _empty_bucket())
        hb["input"] += inp
        hb["output"] += outp
        hb["cache_read"] += cread
        hb["cache_write"] += w5m + w1h
        hb["cost"] += _msg_cost(model, inp, outp, cread, w5m, w1h)
        hb["msgs"] += 1

        if side:
            s = state["side_tokens"]
            s["input"] += inp
            s["output"] += outp
            s["cache_read"] += cread
            s["cache_write"] += w5m + w1h
        else:
            state["assistant_msgs"] += 1
            state["context"] = inp + cread + cwrite
            state["context_model"] = model

        if light or not isinstance(content, list):
            return
        for blk in content:
            if not isinstance(blk, dict) or blk.get("type") != "tool_use":
                continue
            name = blk.get("name") or "?"
            state["tools"][name] = state["tools"].get(name, 0) + 1
            brief = _brief(name, blk.get("input"))
            state["pending"][blk.get("id")] = {
                "name": name,
                "brief": brief,
                "ts": ts or time.time(),
                "side": side,
            }
            if name in AGENT_TOOLS:
                inp_obj = blk.get("input") or {}
                state["agents"][blk.get("id")] = {
                    "type": inp_obj.get("subagent_type") or "claude",
                    "desc": str(inp_obj.get("description") or "")[:80],
                    "ts": ts or time.time(),
                    "done_ts": None,
                }
            _add_event(state, ts, "tool", brief)
        return

    if typ == "user" and not light:
        if isinstance(content, list):
            texts, had_result = [], False
            for blk in content:
                if not isinstance(blk, dict):
                    continue
                if blk.get("type") == "tool_result":
                    had_result = True
                    tid = blk.get("tool_use_id")
                    pend = state["pending"].pop(tid, None)
                    if tid in state["agents"] and state["agents"][tid]["done_ts"] is None:
                        state["agents"][tid]["done_ts"] = ts or time.time()
                    if pend:
                        dur = max(0.0, (ts or time.time()) - pend["ts"])
                        _add_event(state, ts, "result", f"{pend['name']} xong ({dur:.1f}s)")
                elif blk.get("type") == "text" and isinstance(blk.get("text"), str):
                    texts.append(blk["text"])
            if texts and not had_result and not side:
                joined = " ".join(" ".join(texts).split())
                state["user_turns"] += 1
                state["last_prompt"] = joined[:200]
                _add_event(state, ts, "prompt", joined[:160])
        elif isinstance(content, str) and not side:
            state["user_turns"] += 1
            state["last_prompt"] = " ".join(content.split())[:200]
            _add_event(state, ts, "prompt", content[:160])


def _read_incremental(path: str, light: bool) -> dict | None:
    try:
        st = os.stat(path)
    except OSError:
        return None
    state = _STATE.get(path)
    # Nếu file từng đọc ở chế độ nhẹ mà giờ cần đầy đủ => đọc lại từ đầu
    if state is None or state["ino"] != st.st_ino or st.st_size < state["offset"] or (state["light"] and not light):
        state = _new_state(path, st)
        state["light"] = light
        _STATE[path] = state
    if st.st_size > state["offset"]:
        try:
            with open(path, "rb") as f:
                f.seek(state["offset"])
                data = f.read()
        except OSError:
            return state
        cut = data.rfind(b"\n")
        if cut >= 0:
            state["offset"] += cut + 1
            for raw in data[: cut + 1].splitlines():
                if not raw.strip():
                    continue
                if light and b'"usage"' not in raw:
                    continue
                try:
                    d = json.loads(raw)
                except Exception:
                    continue
                if isinstance(d, dict):
                    _process(state, d, light)
    return state


# ---------------------------------------------------------------- tổng hợp


def pid_sessions() -> dict[int, dict]:
    out: dict[int, dict] = {}
    for path in glob.glob(os.path.join(SESSIONS_DIR, "*.json")):
        try:
            with open(path, encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            continue
        pid = meta.get("pid")
        if isinstance(pid, int):
            out[pid] = meta
    return out


def _session_cost(models: dict) -> float:
    total = 0.0
    for model, b in models.items():
        total += _msg_cost(
            model, b["input"], b["output"], b["cache_read"], b["cache_write_5m"], b["cache_write_1h"]
        )
    return round(total, 4)


def _window(state: dict, since: float) -> dict:
    agg = _empty_bucket()
    start_hour = int(since // _HOUR)
    for hour, b in state["hourly"].items():
        if hour < start_hour:
            continue
        for k in ("input", "output", "cache_read", "cache_write", "msgs"):
            agg[k] += b[k]
        agg["cost"] += b["cost"]
    agg["cost"] = round(agg["cost"], 4)
    agg["total"] = agg["input"] + agg["output"] + agg["cache_read"] + agg["cache_write"]
    return agg


def _summary(state: dict) -> dict:
    tot = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0}
    for b in state["models"].values():
        tot["input"] += b["input"]
        tot["output"] += b["output"]
        tot["cache_read"] += b["cache_read"]
        tot["cache_write"] += b["cache_write_5m"] + b["cache_write_1h"]
    api_total = sum(tot.values())

    now = time.time()
    pending = [
        {"name": p["name"], "brief": p["brief"], "elapsed": round(now - p["ts"], 1), "side": p["side"]}
        for p in sorted(state["pending"].values(), key=lambda x: x["ts"])
    ]
    agents_running = [
        {"type": a["type"], "desc": a["desc"], "elapsed": round(now - a["ts"], 1)}
        for a in state["agents"].values()
        if a["done_ts"] is None
    ]
    ctx_model = state["context_model"] or (next(iter(state["models"]), "") or "")
    window = int(model_info(ctx_model).get("context", 1_000_000)) if ctx_model else 1_000_000
    top_tools = sorted(state["tools"].items(), key=lambda kv: -kv[1])[:6]

    return {
        "session_id": state["session_id"],
        "project": state["project"],
        "cwd": (state["cwd"] or "").replace(HOME, "~"),
        "git_branch": state["git_branch"],
        "version": state["version"],
        "title": state["title"],
        "mode": state["mode"],
        "last_prompt": state["last_prompt"],
        "models": sorted(state["models"].keys()),
        "tokens": tot,
        "api_total": api_total,
        "cost_usd": _session_cost(state["models"]),
        "today": _window(state, today_start()),
        "context": state["context"],
        "context_window": window,
        "context_pct": round(state["context"] / window * 100, 1) if window else 0,
        "assistant_msgs": state["assistant_msgs"],
        "user_turns": state["user_turns"],
        "sidechain_tokens": state["side_tokens"],
        "pending": pending,
        "agents_running": agents_running,
        "agents_total": len(state["agents"]),
        "top_tools": [{"name": n, "count": c} for n, c in top_tools],
        "last_ts": state["last_ts"],
        "first_ts": state["first_ts"],
        "idle": round(now - state["last_ts"], 1) if state["last_ts"] else None,
    }


def scan(live_ids: set[str] | None = None, parse_days: float = 7.0) -> dict[str, dict]:
    """Parse transcript trong `parse_days` ngày gần nhất và trả summary từng phiên.

    Đọc tăng dần nên lần đầu ~0.3s cho 7 ngày (75 MB), các lần sau gần như 0.
    """
    cutoff = time.time() - parse_days * 86400
    result: dict[str, dict] = {}
    for path in glob.glob(os.path.join(PROJECTS_DIR, "*", "*.jsonl")):
        sid = os.path.basename(path)[:-6]
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            continue
        if mtime < cutoff:
            continue
        state = _read_incremental(path, light=False)
        if state:
            result[sid] = _summary(state)
    return result


def windows() -> dict:
    """Tổng hợp toàn máy: hôm nay / 5 giờ / 7 ngày."""
    now = time.time()
    marks = {"today": today_start(), "h5": now - 5 * 3600, "d7": now - 7 * 86400}
    out: dict[str, dict] = {k: _empty_bucket() for k in marks}
    for k in out:
        out[k]["total"] = 0
    for state in _STATE.values():
        for key, since in marks.items():
            w = _window(state, since)
            for f in ("input", "output", "cache_read", "cache_write", "msgs", "total"):
                out[key][f] += w[f]
            out[key]["cost"] += w["cost"]
    for k in out:
        out[k]["cost"] = round(out[k]["cost"], 4)
    return out


def events(session_id: str) -> list[dict]:
    for state in _STATE.values():
        if state["session_id"] == session_id:
            return list(reversed(state["events"]))
    return []
