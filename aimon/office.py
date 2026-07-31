"""Dữ liệu cho khung nhìn Văn phòng (`static/office.js`).

Mỗi agent đang chạy là một nhân vật: có việc thì ngồi vào bàn và diễn đúng việc đang làm,
rảnh lâu thì đứng dậy đi vòng vòng, tắt thì đi ra khỏi phòng.

Vì sao là endpoint riêng chứ không nhét vào `/api/snapshot`:

- Nhịp khác nhau. Dashboard 3 giây là vừa; hoạt cảnh cần khoảng 1 giây, chậm hơn thì agent
  gõ xong từ lâu nhân vật mới nhúc nhích.
- Tải khác nhau. `/api/snapshot` còn kèm bảng tiến trình, cổng, Docker, hạn mức - những thứ
  hoạt cảnh không dùng tới. Phần đắt duy nhất dùng chung là danh sách tiến trình, và
  `P.cached()` đã lo để hai vòng không cùng gọi `ps`.

Chỗ dễ sai nhất: **poll thì bỏ lọt tool ngắn**. Một `Read` chạy 0.4 giây sinh ra rồi biến mất
gọn trong khoảng giữa hai lần đọc, không bao giờ lọt vào `pending`. Nhìn vào chỉ thấy nhân
vật ngồi im trong khi agent thật đang làm liên tục. Vì vậy payload có thêm `events` (từ
`C.events_since`) để phía trang web phát lại đúng những nhịp đó.

Mã hoạt cảnh (`action`) chốt ở đây chứ không ở JS: cả ba vỏ dùng chung server, và bảng ánh
xạ tool là dữ liệu, không phải chuyện hiển thị. Riêng câu chữ thì vẫn theo luật của repo -
backend chỉ trả mã, `i18n.js` dựng câu.
"""

from __future__ import annotations

import time

from .collectors import claude as C
from .collectors import procs as P
from . import snapshot as SNAP

# Rảnh quá ngần này giây thì nhân vật rời bàn đi vòng vòng. Chọn 90 giây vì ngắn hơn thì
# agent đang chờ người dùng gõ prompt cũng bị cho là rảnh, cứ đứng lên ngồi xuống liên tục.
WANDER_AFTER = 90.0

# Trần số agent vẽ trong phòng - phải KHỚP với số bàn trong static/office.js (2 dãy x 5).
# Hơn nữa thì hoạt cảnh thành một đám đông không đọc được gì, mà dashboard mới là chỗ tra
# cứu đầy đủ; phần dôi ra được báo bằng `hidden` để không ai tưởng mình thấy hết.
MAX_AGENTS = 10

PROC_MAX_AGE = 2.0

# Tool -> hoạt cảnh. Tên tool là của Claude Code; tool lạ (MCP server tự đặt tên) rơi về
# "work" - nhân vật vẫn ngồi làm việc, chỉ không có động tác riêng.
ACTION_BY_TOOL = {
    "Edit": "type",
    "Write": "type",
    "MultiEdit": "type",
    "NotebookEdit": "type",
    "Read": "read",
    "Glob": "read",
    "Grep": "read",
    "LS": "read",
    "NotebookRead": "read",
    "Bash": "run",
    "BashOutput": "run",
    "KillBash": "run",
    "KillShell": "run",
    "WebFetch": "web",
    "WebSearch": "web",
    "Task": "delegate",
    "Agent": "delegate",
    "TodoWrite": "plan",
    "ExitPlanMode": "plan",
    "EnterPlanMode": "plan",
}


def action_of(tool: str) -> str:
    """Hoạt cảnh cho một tool. Tool của MCP server có dạng `mcp__<server>__<tên>`."""
    if not tool:
        return "work"
    if tool in ACTION_BY_TOOL:
        return ACTION_BY_TOOL[tool]
    low = tool.lower()
    if low.startswith("mcp__"):
        return "mcp"
    for name, act in ACTION_BY_TOOL.items():
        if low.startswith(name.lower()):
            return act
    return "work"


def _state_of(root: dict, sess: dict | None) -> str:
    if root["paused"]:
        return "paused"
    if sess is None:
        # Tiến trình AI không có transcript (Codex, Gemini CLI...). %CPU là thứ duy nhất
        # biết được nó đang làm gì, nên lấy tạm làm dấu hiệu bận.
        return "busy" if root["cpu_tree_pct"] >= 12 else "idle"
    if sess["pending"]:
        return "busy"
    idle = sess["idle"]
    if idle is None or idle >= WANDER_AFTER:
        return "wander"
    return "idle"


def _agent(root: dict) -> dict:
    sess = root.get("session")
    state = _state_of(root, sess)
    doing = sess["pending"][0] if (sess and sess["pending"]) else None

    out = {
        # Định danh phải ổn định qua các lần đọc, nếu không nhân vật sẽ nhảy chỗ mỗi giây.
        # Ưu tiên session_id vì nó sống lâu hơn pid (resume một phiên là pid mới).
        "id": (sess["session_id"] if sess else "") or "pid:%d" % root["pid"],
        "pid": root["pid"],
        "kind": root["kind"],
        "label": root["label"],
        "name": root["name"],
        "state": state,
        "action": action_of(doing["name"]) if doing else ("rest" if state != "busy" else "work"),
        "tool": doing["name"] if doing else "",
        "brief": doing["brief"] if doing else "",
        "elapsed": doing["elapsed"] if doing else 0.0,
        "in_subagent": bool(doing and doing["side"]),
        "pending_more": max(0, len(sess["pending"]) - 1) if sess else 0,
        "uptime": root["uptime"],
        "cpu_tree_pct": root["cpu_tree_pct"],
        "rss_tree_kb": root["rss_tree_kb"],
        "children": len(root["children"]),
        "supervisor": root["supervisor"],
        "subagents": [],
    }

    if sess:
        out.update(
            {
                "session_id": sess["session_id"],
                "title": sess["title"] or root["session_name"] or "",
                "cwd": sess["cwd"],
                "project": sess["project"],
                "branch": sess["git_branch"] or "",
                "model": (sess["models"] or [""])[0],
                "mode": sess["mode"] or "",
                "idle": sess["idle"],
                "context_pct": sess["context_pct"],
                "cost_usd": sess["cost_usd"],
                "tokens_today": sess["today"]["total"],
                "last_prompt": sess["last_prompt"] or "",
                "subagents": [
                    {
                        "id": "%s/sub%d" % (out["id"], i),
                        "type": a["type"],
                        "desc": a["desc"],
                        "elapsed": a["elapsed"],
                    }
                    for i, a in enumerate(sess["agents_running"])
                ],
            }
        )
    else:
        out.update(
            {
                "session_id": "",
                "title": root["session_name"] or root["name"],
                "cwd": "",
                "project": "",
                "branch": "",
                "model": "",
                "mode": "",
                "idle": None,
                "context_pct": 0,
                "cost_usd": 0.0,
                "tokens_today": 0,
                "last_prompt": "",
            }
        )
    return out


def build(since: float = 0.0, kinds: set | None = None) -> dict:
    """Trạng thái mọi agent + sự kiện mới kể từ `since` (giây epoch, 0 = lần đọc đầu).

    `kinds` là tập loại agent được hiện (None = tất cả). Việc lọc phải xảy ra TRƯỚC khi cắt
    theo `MAX_AGENTS`: cắt trước rồi mới lọc thì mấy agent bị ẩn vẫn chiếm suất trong 10 chỗ,
    và người dùng lọc chỉ còn Claude Code lại thấy phòng trống một nửa.
    """
    procs = P.cached(PROC_MAX_AGE)
    kids = P.children_map(procs)
    roots, live = SNAP.collect_roots(procs, kids, C.pid_sessions())
    sessions = C.scan(live_ids=live)
    for r in roots:
        r["session"] = sessions.get(r["session_id"]) if r["session_id"] else None

    # Loại nào ĐANG có mặt trên máy - tính trước khi lọc, để trang web dựng được thanh lọc
    # với đúng những loại bật lên là thấy ngay có người.
    present = sorted({r["kind"] for r in roots})
    if kinds is not None:
        roots = [r for r in roots if r["kind"] in kinds]

    # Bận trước, rồi tới hoạt động gần nhất: phòng chật thì kẻ đang làm việc phải là kẻ
    # được thấy, không phải kẻ vào trước.
    roots.sort(
        key=lambda r: (
            0 if (r["session"] and r["session"]["pending"]) else 1,
            -((r["session"] or {}).get("last_ts") or 0),
        )
    )
    agents = [_agent(r) for r in roots[:MAX_AGENTS]]

    return {
        "ts": time.time(),
        "agents": agents,
        "hidden": max(0, len(roots) - MAX_AGENTS),
        "kinds_present": present,
        "events": C.events_since(since),
        "wander_after": WANDER_AFTER,
    }
