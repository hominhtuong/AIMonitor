#!/usr/bin/env python3
"""AI Monitor - dashboard local theo dõi tiến trình / agent AI.

Chạy:
    python3 -m aimon.server            # macOS / Linux
    py -m aimon.server                 # Windows
    ./run.sh  |  run.cmd               # có mở browser luôn

Chỉ dùng Python stdlib (>= 3.9). Server bind 127.0.0.1, không mở ra LAN,
không gửi dữ liệu đi đâu.

Cổng: thích 8899, nếu bận thì tự lùi 8900, 8901... rồi cuối cùng xin cổng ngẫu nhiên
từ OS. Nếu cổng bận vì AI Monitor đã chạy sẵn thì không bật instance thứ hai, chỉ mở
lại tab cũ (dùng --new nếu thật sự muốn thêm instance, --strict-port nếu cần đúng cổng).
"""

from __future__ import annotations

import argparse
import errno
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
from . import instance as INST  # noqa: E402
from . import config_file as CFG  # noqa: E402
from . import office as OFF  # noqa: E402
from . import proc_util as PU  # noqa: E402
from . import snapshot as SNAP  # noqa: E402

# Bản .exe cho Windows (PyInstaller) giải nén tài nguyên ra thư mục tạm sys._MEIPASS,
# không nằm cạnh file .py nữa.
BASE = os.path.join(sys._MEIPASS, "aimon") if getattr(sys, "frozen", False) else os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE, "static")
IS_WINDOWS = sys.platform.startswith("win")

VERSION = "1.6.0"

DEFAULT_PORT = 8899
PORT_SCAN_TRIES = 20  # 8899..8919 rồi mới xin cổng ngẫu nhiên

# Điền trong main(), để /api/version báo lại cổng thật đang dùng
RUNTIME: dict = {"host": "", "port": 0, "url": ""}


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
    # PU.run thay cho subprocess.run: taskkill là chương trình console, gọi thẳng từ tiến
    # trình không có console (bản .exe, hoặc server do extension spawn) sẽ nháy cửa sổ đen.
    res = PU.run(args, capture_output=True, text=True, timeout=20)
    if res.returncode != 0:
        raise OSError((res.stderr or res.stdout or "taskkill thất bại").strip())


def _signal_posix(pid: int, name: str) -> None:
    import signal

    sig = {"pause": signal.SIGSTOP, "resume": signal.SIGCONT}[name]
    os.kill(pid, sig)


# Chỉ dùng để kiểm tra hành động hợp lệ. Tên hiển thị nằm ở bảng dịch của UI, không ở đây.
VALID_ACTIONS = (
    "pause", "resume", "kill", "force_kill", "kill_tree", "pause_tree", "resume_tree",
)


def _err(key: str, args: dict, english: str) -> dict:
    return {"ok": False, "error_key": key, "error_args": args, "error": english}


def do_action(action: str, pid: int) -> dict:
    # Lỗi trả về kèm error_key + error_args để UI dựng câu theo ngôn ngữ đang chọn;
    # `error` giữ bản tiếng Anh cho ai gọi API bằng curl.
    if action not in VALID_ACTIONS:
        return _err("err.bad_action", {"action": action}, f"Invalid action: {action}")
    if IS_WINDOWS and action in ("pause", "resume", "pause_tree", "resume_tree"):
        return _err("err.no_pause_windows", {},
                    "Windows cannot suspend processes (no SIGSTOP).")

    procs = P.snapshot()
    if pid not in procs:
        return _err("err.pid_gone", {"pid": pid}, f"PID {pid} no longer exists")
    protected = SNAP.protected_pids(procs)
    if pid in protected:
        return _err("err.protected", {"pid": pid},
                    f"PID {pid} is protected (AI Monitor itself or one of its parents)")

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
                failed.append({"pid": t, "error_key": "err.protected_short", "error": "protected"})
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
        if route == "/api/pulse":
            # Khung nhìn Văn phòng, nhịp ~1 giây. Nhẹ hơn /api/snapshot nhiều: không bảng
            # tiến trình, không cổng, không Docker, không hạn mức.
            # keep_blank_values BẮT BUỘC: mặc định parse_qs vứt thẳng tham số có giá trị rỗng,
            # nên `?kinds=` (người dùng bỏ chọn hết) trở thành y hệt "không gửi kinds" và
            # server lại trả về tất cả - đúng ngược ý người dùng.
            q = parse_qs(u.query, keep_blank_values=True)
            try:
                since = float((q.get("since") or ["0"])[0])
            except ValueError:
                since = 0.0
            # KHÔNG có tham số = không lọc; `?kinds=*` cũng là không lọc; `?kinds=` (rỗng) là
            # người dùng bỏ chọn hết, phải trả về danh sách rỗng chứ không phải tất cả. Vì vậy
            # phải phân biệt "vắng mặt" với "rỗng", không dùng được `or [""]`.
            #
            # Bộ lọc do trang web quyết (nó mới biết người dùng vừa bấm gì), server chỉ áp
            # dụng - nhờ vậy hai cửa sổ VSCode lọc khác nhau được dù dùng chung một server.
            raw_kinds = q.get("kinds")
            kinds = None
            if raw_kinds is not None and raw_kinds[0] != "*":
                kinds = {k for k in raw_kinds[0].split(",") if k}
            try:
                return self._json(OFF.build(since, kinds))
            except Exception as e:
                return self._json({"error": f"{type(e).__name__}: {e}"}, 500)
        if route == "/api/events":
            sid = (parse_qs(u.query).get("session") or [""])[0]
            return self._json({"session_id": sid, "events": C.events(sid)})
        if route == "/api/sessions":
            # Quét toàn bộ transcript nên chỉ chạy khi người dùng mở tab Lịch sử,
            # không nằm trong vòng làm mới 3 giây của /api/snapshot.
            raw = (parse_qs(u.query).get("days") or ["all"])[0]
            try:
                days = None if raw == "all" else max(1.0, float(raw))
            except ValueError:
                days = None
            try:
                return self._json(C.history(days))
            except Exception as e:
                return self._json({"error": f"{type(e).__name__}: {e}"}, 500)
        if route == "/api/ports":
            return self._json(PO.collect(force=True))
        if route == "/api/version":
            return self._json({"version": VERSION, **RUNTIME, **P.capabilities()})
        if route == "/api/config":
            return self._json(CFG.frontend())
        if route == "/api/config.js":
            # Trả JS chứ không phải JSON, và index.html nạp nó TRƯỚC app.js: nhờ vậy trang
            # biết theme ngay từ lúc dựng, không vẽ nền tối rồi mới nháy sang nền sáng.
            body = ("window.AIMON_CONFIG=" + json.dumps(CFG.frontend()) + ";").encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return self.wfile.write(body)
        return self._json({"error": "not found"}, 404)

    def do_POST(self):
        route = urlparse(self.path).path
        if route == "/api/quit":
            # Mở bằng app icon thì không có terminal nào để Ctrl+C, nên phải tắt được từ trang.
            self._json({"ok": True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if route != "/api/action":
            return self._json({"error": "not found"}, 404)
        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._json(_err("err.bad_json", {}, "Invalid JSON"), 400)
        try:
            pid = int(payload.get("pid"))
        except (TypeError, ValueError):
            return self._json(_err("err.missing_pid", {}, "Missing PID"), 400)
        return self._json(do_action(str(payload.get("action") or ""), pid))


def _warmup() -> None:
    """Đọc trước transcript 7 ngày để cửa sổ 5h/7d có số ngay từ lần load đầu."""
    try:
        C.scan()
    except Exception:
        pass


# ---------------------------------------------------------------- chọn cổng


def _bind(host: str, port: int) -> ThreadingHTTPServer | None:
    """Thử mở cổng. None nếu cổng đang bận / không được phép; lỗi khác thì raise."""
    try:
        return ThreadingHTTPServer((host, port), Handler)
    except OSError as e:
        if e.errno in (errno.EADDRINUSE, errno.EACCES):
            return None
        raise


def _bind_auto(host: str, preferred: int) -> ThreadingHTTPServer | None:
    """Cổng mong muốn trước; bận thì lùi dần; hết thì để OS cấp cổng ngẫu nhiên."""
    httpd = _bind(host, preferred)
    if httpd is not None:
        return httpd
    for port in range(preferred + 1, min(preferred + 1 + PORT_SCAN_TRIES, 65536)):
        httpd = _bind(host, port)
        if httpd is not None:
            return httpd
    return _bind(host, 0)


def _on_sigterm(httpd: ThreadingHTTPServer) -> None:
    """Bắt SIGTERM để serve_forever() thoát êm, chạy nốt finally (dọn state file)."""
    import signal

    if IS_WINDOWS:
        return
    try:
        signal.signal(signal.SIGTERM, lambda *_: threading.Thread(target=httpd.shutdown).start())
    except (OSError, ValueError):
        pass  # không phải main thread thì thôi


def _running_instance(host: str, preferred: int) -> dict | None:
    """Đã có AI Monitor chạy sẵn? Kiểm tra cổng mong muốn rồi tới cổng trong state file."""
    seen: set[tuple[str, int]] = set()
    candidates = [(host, preferred)]
    st = INST.read() or {}
    if st.get("port"):
        try:
            candidates.append((st.get("host") or host, int(st["port"])))
        except (TypeError, ValueError):
            pass
    for h, p in candidates:
        if (h, p) in seen:
            continue
        seen.add((h, p))
        info = INST.probe(h, p)
        if info:
            return {"host": h, "port": p, "url": INST.url_of(h, p), "version": info.get("version")}
    return None


def _force_utf8_stdio() -> None:
    """Ép stdout/stderr sang UTF-8 trước khi in bất cứ thứ gì.

    Mọi thông báo của tool đều là tiếng Việt có dấu. Trên Windows, stdout KHÔNG phải console
    UTF-8 (bị pipe đi, hoặc console đang ở code page cũ như cp1252/cp1258) thì `print` một
    chữ 'Đ' là `UnicodeEncodeError` và server chết trước khi kịp phục vụ request nào - đúng
    lỗi extension VSCode gặp, vì nó spawn server với stdout đổ vào chỗ khác.

    Không phải lỗi thiếu Python: Python vẫn chạy, chỉ là không mã hoá nổi chuỗi ra byte.
    `errors="replace"` để dù có gặp ký tự lạ tới đâu cũng không bao giờ chết vì một dòng log.
    """
    for name in ("stdout", "stderr"):
        stream = getattr(sys, name, None)
        if stream is None:
            continue  # bản .exe dựng với --noconsole
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError, ValueError):
            pass  # đối tượng thay thế (vd _Null của app_win) hoặc stream không đổi được


def main(argv=None) -> int:
    _force_utf8_stdio()
    ap = argparse.ArgumentParser(description="AI Monitor - dashboard tiến trình AI local")
    ap.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("AIMON_PORT") or CFG.load()["port"] or DEFAULT_PORT),
        help=f"cổng mong muốn (mặc định {DEFAULT_PORT}); bận thì tự tìm cổng trống khác",
    )
    ap.add_argument("--host", default=os.environ.get("AIMON_HOST", "127.0.0.1"))
    ap.add_argument("--open", action="store_true", help="mở browser sau khi server chạy")
    ap.add_argument(
        "--strict-port",
        action="store_true",
        help="bắt buộc đúng cổng --port, đang bận thì báo lỗi thay vì đổi cổng",
    )
    ap.add_argument(
        "--new",
        action="store_true",
        help="luôn bật instance mới, kể cả khi AI Monitor đang chạy",
    )
    args = ap.parse_args(argv)

    # Đang chạy rồi thì mở lại tab cũ, không bật thêm instance thứ hai
    if not args.new:
        found = _running_instance(args.host, args.port)
        if found:
            ver = f" {found['version']}" if found.get("version") else ""
            print(f"AI Monitor{ver} đang chạy rồi: {found['url']}", flush=True)
            if args.open:
                webbrowser.open(found["url"])
            else:
                print("Dùng --new nếu muốn bật thêm một instance nữa.", flush=True)
            return 0

    P.snapshot()  # snapshot mồi để lần gọi đầu có %CPU
    threading.Thread(target=_warmup, daemon=True).start()

    if args.strict_port:
        httpd = _bind(args.host, args.port)
        if httpd is None:
            print(f"Cổng {args.port} đang bận (đang bật --strict-port).", file=sys.stderr)
            print("Bỏ --strict-port để tự đổi cổng, hoặc chọn --port khác.", file=sys.stderr)
            return 1
    else:
        httpd = _bind_auto(args.host, args.port)
        if httpd is None:
            print(f"Không mở được cổng nào quanh {args.port}.", file=sys.stderr)
            return 1

    port = httpd.server_address[1]
    if port != args.port:
        # args.port == 0 là cố ý xin OS cấp cổng bất kỳ (extension VSCode chạy kiểu này),
        # không phải cổng mong muốn bị chiếm - in "Cổng 0 đang bận" ở đó là sai.
        if args.port == 0:
            print(f"Đang dùng cổng {port} do hệ điều hành cấp.", flush=True)
        else:
            print(f"Cổng {args.port} đang bận => dùng cổng {port}.", flush=True)

    import platform

    url = INST.url_of(args.host, port)
    # arch để cài đặt trên macOS kiểm tra được app có bị chạy qua Rosetta hay không
    RUNTIME.update({"host": args.host, "port": port, "url": url, "arch": platform.machine()})
    INST.write(args.host, port, VERSION)

    # flush vì stdout có thể bị pipe (AIMonitor.app, nohup) - vẫn phải thấy URL ngay
    print(f"AI Monitor {VERSION} đang chạy: {url}   (Ctrl+C để dừng)", flush=True)
    if args.open:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    _on_sigterm(httpd)  # `kill <pid>` cũng phải dọn state như Ctrl+C
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã dừng AI Monitor.")
    finally:
        httpd.server_close()
        INST.clear()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
