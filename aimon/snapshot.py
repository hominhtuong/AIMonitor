"""Gom dữ liệu từ các collector thành 1 snapshot JSON cho dashboard."""

from __future__ import annotations

import os
import threading
import time

from .collectors import claude as C
from .collectors import ports as PO
from .collectors import procs as P
from .collectors import usage as U

TOP_PROCESS_LIMIT = 80
_lock = threading.Lock()


def _session_id_of(pid: int, proc: dict, pid_map: dict) -> str | None:
    meta = pid_map.get(pid)
    if meta and meta.get("sessionId"):
        return meta["sessionId"]
    cmd = proc["cmd"]
    for token in ("--resume=", "--session-id="):
        if token in cmd:
            tail = cmd.split(token, 1)[1].split()[0].strip()
            if tail:
                return tail
    return None


def _ancestors(pid: int, procs: dict) -> set[int]:
    out, cur, guard = set(), pid, 0
    while cur in procs and guard < 60:
        out.add(cur)
        cur = procs[cur]["ppid"]
        guard += 1
    return out


def protected_pids(procs: dict) -> set[int]:
    """PID không bao giờ được kill: init, chính AI Monitor và tổ tiên của nó."""
    prot = {0, 1}
    prot |= _ancestors(os.getpid(), procs)
    for pid, p in procs.items():
        if "aimon" in p["cmd"] and ("server.py" in p["cmd"] or "aimon.server" in p["cmd"]):
            prot.add(pid)
    return prot


def collect_roots(procs: dict, kids: dict, pid_map: dict) -> tuple[list[dict], set[str]]:
    """Các tiến trình AI gốc + tập session_id đang sống.

    Tách riêng vì `/api/pulse` (khung nhìn Văn phòng) cần đúng danh sách này. Để hai chỗ tự
    dò lấy thì sớm muộn cũng lệch nhau: dashboard thấy 3 agent còn văn phòng thấy 4.
    """
    roots: list[dict] = []
    live_sessions: set[str] = set()
    for pid, p in procs.items():
        if p["kind"] not in P.AI_ROOT_KINDS:
            continue
        parent = procs.get(p["ppid"])
        if parent and parent["kind"] == p["kind"]:
            continue  # chỉ lấy đỉnh của mỗi nhánh cùng loại
        sid = _session_id_of(pid, p, pid_map) if p["kind"] == "claude-code" else None
        if sid:
            live_sessions.add(sid)
        meta = pid_map.get(pid) or {}
        node = P.build_tree(pid, procs, kids) or {}
        supervisor = None
        if parent and parent["kind"] in P.SUPERVISOR_KINDS:
            supervisor = parent["name"]
        roots.append(
            {
                "pid": pid,
                "kind": p["kind"],
                "label": p["label"],
                "name": p["name"],
                "cmd": p["cmd"],
                "uptime": p["uptime"],
                "paused": p["paused"],
                "rss_kb": p["rss_kb"],
                "cpu_pct": p["cpu_pct"],
                "rss_tree_kb": node.get("rss_tree_kb", p["rss_kb"]),
                "cpu_tree_pct": node.get("cpu_tree_pct", p["cpu_pct"]),
                "session_id": sid,
                "session_name": meta.get("name"),
                "entrypoint": meta.get("entrypoint"),
                # Ba trường dưới chỉ phục vụ khối "thông tin phiên" người dùng copy sang phiên
                # khác. `cwd` lấy từ state file chứ không từ transcript: phiên vừa mở chưa có
                # transcript nào mà vẫn phải nói được nó đang đứng ở dự án nào.
                "session_cwd": meta.get("cwd"),
                "cc_version": meta.get("version"),
                # Có socket + peerProtocol nghĩa là phiên này nhận được SendMessage. Thiếu là
                # bản cũ hoặc nền tảng không hỗ trợ - phải nói thẳng thay vì để người dùng gửi
                # vào hư không.
                "peer_ready": bool(meta.get("messagingSocketPath") and meta.get("peerProtocol")),
                "supervisor": supervisor,
                "children": node.get("children", []),
            }
        )
    return roots, live_sessions


def usage_only() -> dict:
    """Chỉ hạn mức và tổng token - không `ps`, không `lsof`, không dựng cây tiến trình.

    Đo trên máy thật: 4 ms so với 63 ms của `build()`. Dùng cho thanh trạng thái VSCode,
    thứ hỏi mỗi 6 giây ở MỖI cửa sổ nhưng chỉ hiện hai con số phần trăm.

    Vẫn phải gọi `C.scan()` chứ không đọc thẳng `C.windows()`: `windows()` chỉ cộng lại
    những gì `scan()` đã nạp vào `_STATE`, nên bỏ bước đó thì số đứng im mãi ở lần đọc đầu
    tiên. `scan()` đọc tăng dần nên lần sau chỉ mất 2 ms.
    """
    with _lock:
        C.scan()
        win = C.windows()
        return {
            "ts": time.time(),
            "usage": U.collect(win),
            "totals": {"today": win["today"], "h5": win["h5"], "d7": win["d7"]},
        }


def build(want_ports: bool = True) -> dict:
    with _lock:
        procs = P.snapshot()
        kids = P.children_map(procs)
        pid_map = C.pid_sessions()

        roots, live_sessions = collect_roots(procs, kids, pid_map)
        sessions = C.scan(live_ids=live_sessions)
        for r in roots:
            r["session"] = sessions.get(r["session_id"]) if r["session_id"] else None

        # Phiên đã đóng trong 7 ngày; UI tự lọc theo khoảng (hôm nay / 7 ngày)
        orphans = [s for sid, s in sessions.items() if sid not in live_sessions and s["api_total"] > 0]
        orphans.sort(key=lambda s: -(s["last_ts"] or 0))

        # ---- dấu chân AI: mọi tiến trình trong cây AI + tiến trình tự nó là AI
        ai_pids: set[int] = set()
        for r in roots:
            ai_pids.add(r["pid"])
            ai_pids.update(P.descendants(r["pid"], kids))
        ai_pids.update(pid for pid, p in procs.items() if p["is_ai"])

        groups: dict[str, dict] = {}
        ai_rss = 0
        ai_cpu = 0.0
        for pid in ai_pids:
            p = procs.get(pid)
            if p is None:
                continue
            g = groups.setdefault(
                p["kind"],
                {
                    "kind": p["kind"],
                    "label": P.KIND_LABELS.get(p["kind"], p["label"]),
                    "count": 0,
                    "rss_kb": 0,
                    "cpu_pct": 0.0,
                },
            )
            g["count"] += 1
            g["rss_kb"] += p["rss_kb"]
            g["cpu_pct"] += max(p["cpu_pct"], 0)
            ai_rss += p["rss_kb"]
            ai_cpu += max(p["cpu_pct"], 0)
        for g in groups.values():
            g["cpu_pct"] = round(g["cpu_pct"], 1)

        top = sorted(procs.values(), key=lambda p: -p["rss_kb"])[:TOP_PROCESS_LIMIT]
        top_rows = []
        for p in top:
            row = {
                k: p[k]
                for k in (
                    "pid", "ppid", "rss_kb", "cpu_pct", "uptime", "paused",
                    "kind", "label", "name", "cmd", "mine", "is_ai",
                )
            }
            row["in_ai_tree"] = p["pid"] in ai_pids
            top_rows.append(row)

        roots.sort(key=lambda r: (r["session"] or {}).get("last_ts", 0), reverse=True)

        win = C.windows()
        totals = {
            "today": win["today"],
            "h5": win["h5"],
            "d7": win["d7"],
            "sessions_today": len(sessions),
            "live": len([r for r in roots if r["session"]]),
        }

        return {
            "ts": time.time(),
            "capabilities": P.capabilities(),
            "system": {
                "mem_total_kb": P.mem_total_kb(),
                "mem_used_kb": P.mem_used_kb(),
                "ai_rss_kb": ai_rss,
                "ai_cpu_pct": round(ai_cpu, 1),
                "cpu_count": os.cpu_count(),
                "load": P.load_avg(),
                "proc_count": len(procs),
            },
            "usage": U.collect(win),
            "groups": sorted(groups.values(), key=lambda g: -g["rss_kb"]),
            "ai": roots,
            "today_start": C.today_start(),
            "orphan_sessions": orphans[:60],
            "totals": totals,
            "processes": top_rows,
            **(PO.collect() if want_ports else PO.cached()),
        }
