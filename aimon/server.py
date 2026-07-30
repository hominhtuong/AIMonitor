#!/usr/bin/env python3
"""AI Monitor - dashboard local theo dõi tiến trình / agent AI.

Chạy:
    python3 -m aimon.server            # macOS / Linux
    py -m aimon.server                 # Windows
    ./run.sh  |  run.cmd               # có mở browser luôn

Chỉ dùng Python stdlib (>= 3.9). Server bind 127.0.0.1, không mở ra LAN,
không gửi dữ liệu đi đâu.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

if __package__ in (None, ""):  # cho phép chạy `python3 aimon/server.py`
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    __package__ = "aimon"

from .collectors import claude as C  # noqa: E402
from .collectors import ports as PO  # noqa: E402
from .collectors import procs as P  # noqa: E402
from . import snapshot as SNAP  # noqa: E402

BASE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE, "static")
IS_WINDOWS = sys.platform.startswith("win")

VERSION = "1.1.0"


# ---------------------------------------------------------------- thao tác

def _kill_posix(pid: int, force: bool = False) -> None:
    import signal

    os.kill(pid, signal.SIGKILL if force else signal.SIGTERM)


def _kill_windows(pid: int, tree: bool = False, force: bool = True) -> None:
    args = ["taskkill", "/PID", str(pid)]
    if tree:
        args.append("/T")
    if force:
        args.append("/F")
    res = subprocess.run(args, capture_output=True, text=True, timeout=20)
    if res.returncode != 0:
        raise OSError((res.stderr or res.stdout or "taskkill thất bại").strip())


def _signal_posix(pid: int, name: str) -> None:
    import signal

    sig = {"pause": signal.SIGSTOP, "resume": signal.SIGCONT}[name]
    os.kill(pid, sig)


ACTION_NAMES = {
    "pause": "tạm dừng",
    "resume": "tiếp tục",
    "kill": "kill",
    "force_kill": "kill cứng",
    "kill_tree": "kill cây",
    "pause_tree": "tạm dừng cây",
    "resume_tree": "tiếp tục cây",
}


def do_action(action: str, pid: int) -> dict:
    if action not in ACTION_NAMES:
        return {"ok": False, "error": f"Hành động không hợp lệ: {action}"}
    if IS_WINDOWS and action in ("pause", "resume", "pause_tree", "resume_tree"):
        return {"ok": False, "error": "Windows không hỗ trợ tạm dừng tiến trình (không có SIGSTOP)."}

    procs = P.snapshot()
    if pid not in procs:
        return {"ok": False, "error": f"PID {pid} không còn tồn tại"}
    protected = SNAP.protected_pids(procs)
    if pid in protected:
        return {
            "ok": False,
            "error": f"PID {pid} được bảo vệ (là chính AI Monitor hoặc tiến trình cha của nó)",
        }

    kids = P.children_map(procs)

    if action == "kill_tree":
        if IS_WINDOWS:
            try:
                _kill_windows(pid, tree=True)
            except OSError as e:
                return {"ok": False, "error": str(e)}
            return {"ok": True, "killed": [pid], "failed": [], "tree": True}
        targets = P.descendants(pid, kids) + [pid]
        killed, failed = [], []
        for t in targets:
            if t in protected:
                failed.append({"pid": t, "error": "được bảo vệ"})
                continue
            try:
                _kill_posix(t)
                killed.append(t)
            except OSError as e:
                failed.append({"pid": t, "error": str(e)})
        return {"ok": bool(killed), "killed": killed, "failed": failed}

    if action in ("pause_tree", "resume_tree"):
        base = "pause" if action == "pause_tree" else "resume"
        targets = [pid] + P.descendants(pid, kids)
        done, failed = [], []
        for t in targets:
            if t in protected:
                continue
            try:
                _signal_posix(t, base)
                done.append(t)
            except OSError as e:
                failed.append({"pid": t, "error": str(e)})
        return {"ok": bool(done), "affected": done, "failed": failed}

    try:
        if action in ("kill", "force_kill"):
            if IS_WINDOWS:
                _kill_windows(pid, tree=False, force=(action == "force_kill"))
            else:
                _kill_posix(pid, force=(action == "force_kill"))
        else:
            _signal_posix(pid, action)
    except OSError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "pid": pid, "action": action}


# ---------------------------------------------------------------- HTTP


class Handler(BaseHTTPRequestHandler):
    server_version = f"AIMonitor/{VERSION}"

    def log_message(self, fmt, *args):
        if os.environ.get("AIMON_VERBOSE"):
            super().log_message(fmt, *args)

    def _json(self, payload, code: int = 200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path: str):
        real = os.path.realpath(path)
        if not real.startswith(os.path.realpath(STATIC_DIR)) or not os.path.isfile(real):
            return self._json({"error": "not found"}, 404)
        ctype = mimetypes.guess_type(real)[0] or "application/octet-stream"
        if ctype.startswith("text") or "javascript" in ctype or "json" in ctype or "svg" in ctype:
            ctype += "; charset=utf-8"
        with open(real, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        route = u.path
        if route in ("/", "/index.html"):
            return self._file(os.path.join(STATIC_DIR, "index.html"))
        if route.startswith("/static/"):
            return self._file(os.path.join(STATIC_DIR, os.path.basename(route)))
        if route == "/favicon.svg":
            return self._file(os.path.join(STATIC_DIR, "favicon.svg"))
        if route == "/api/snapshot":
            try:
                return self._json(SNAP.build())
            except Exception as e:
                return self._json({"error": f"{type(e).__name__}: {e}"}, 500)
        if route == "/api/events":
            sid = (parse_qs(u.query).get("session") or [""])[0]
            return self._json({"session_id": sid, "events": C.events(sid)})
        if route == "/api/ports":
            return self._json(PO.collect(force=True))
        if route == "/api/version":
            return self._json({"version": VERSION, **P.capabilities()})
        return self._json({"error": "not found"}, 404)

    def do_POST(self):
        if urlparse(self.path).path != "/api/action":
            return self._json({"error": "not found"}, 404)
        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._json({"ok": False, "error": "JSON không hợp lệ"}, 400)
        try:
            pid = int(payload.get("pid"))
        except (TypeError, ValueError):
            return self._json({"ok": False, "error": "Thiếu PID"}, 400)
        return self._json(do_action(str(payload.get("action") or ""), pid))


def _warmup() -> None:
    """Đọc trước transcript 7 ngày để cửa sổ 5h/7d có số ngay từ lần load đầu."""
    try:
        C.scan()
    except Exception:
        pass


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="AI Monitor - dashboard tiến trình AI local")
    ap.add_argument("--port", type=int, default=int(os.environ.get("AIMON_PORT", 8899)))
    ap.add_argument("--host", default=os.environ.get("AIMON_HOST", "127.0.0.1"))
    ap.add_argument("--open", action="store_true", help="mở browser sau khi server chạy")
    args = ap.parse_args(argv)

    P.snapshot()  # snapshot mồi để lần gọi đầu có %CPU
    threading.Thread(target=_warmup, daemon=True).start()

    try:
        httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as e:
        print(f"Không mở được cổng {args.port}: {e}", file=sys.stderr)
        print("Có thể AI Monitor đang chạy rồi, hoặc dùng --port khác.", file=sys.stderr)
        return 1

    url = f"http://{args.host}:{args.port}"
    print(f"AI Monitor {VERSION} đang chạy: {url}   (Ctrl+C để dừng)")
    if args.open:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã dừng AI Monitor.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
