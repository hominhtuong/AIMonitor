"""Trạng thái instance AI Monitor đang chạy (host / port / pid).

Vì cổng giờ được cấp động (8899 bận thì lùi sang cổng khác), cần một chỗ ghi lại
cổng thật để:

  - chạy `run.sh` lần nữa khi app đang mở => mở lại đúng tab cũ, không báo lỗi cổng bận
  - tab "Cổng" biết cổng nào là của chính AI Monitor mà không cần hardcode 8899

File state nằm ở `~/.aimon/instance.json`, chỉ đọc/ghi local, không chứa gì bí mật.
Mọi lỗi I/O đều bỏ qua: state chỉ để tiện dùng, thiếu nó server vẫn chạy bình thường.
"""

from __future__ import annotations

import json
import os
import time

STATE_DIR = os.path.join(os.path.expanduser("~"), ".aimon")
STATE_FILE = os.path.join(STATE_DIR, "instance.json")

# host bind không kết nối tới được thì quay về loopback
_DIAL_FALLBACK = {"0.0.0.0": "127.0.0.1", "::": "::1", "": "127.0.0.1"}


def dial_host(host: str) -> str:
    """Địa chỉ dùng để gọi vào server (0.0.0.0 chỉ là địa chỉ bind, không gọi được)."""
    return _DIAL_FALLBACK.get(host, host)


def url_of(host: str, port: int) -> str:
    h = dial_host(host)
    return f"http://[{h}]:{port}" if ":" in h else f"http://{h}:{port}"


def write(host: str, port: int, version: str) -> None:
    data = {
        "pid": os.getpid(),
        "host": host,
        "port": port,
        "url": url_of(host, port),
        "version": version,
        "started": time.time(),
    }
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        tmp = f"{STATE_FILE}.{os.getpid()}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, STATE_FILE)  # thay nguyên tử, tránh đọc được file nửa vời
    except OSError:
        pass


def read() -> dict | None:
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or not data.get("port"):
        return None
    return data


def clear() -> None:
    """Xoá state khi thoát - chỉ xoá nếu file đang trỏ về chính tiến trình này."""
    cur = read()
    if cur and cur.get("pid") != os.getpid():
        return  # instance khác đã ghi lên, để nguyên
    try:
        os.remove(STATE_FILE)
    except OSError:
        pass


def probe(host: str, port: int, timeout: float = 0.7) -> dict | None:
    """Gọi `GET /api/version`. Trả dict nếu đầu bên kia đúng là AI Monitor, ngược lại None."""
    import http.client

    if not port:
        return None
    try:
        conn = http.client.HTTPConnection(dial_host(host), port, timeout=timeout)
        try:
            conn.request("GET", "/api/version")
            res = conn.getresponse()
            if res.status != 200:
                return None
            body = json.loads(res.read(64 * 1024) or b"{}")
        finally:
            conn.close()
    except Exception:
        return None
    if not isinstance(body, dict) or "version" not in body:
        return None  # cổng bận nhưng là service khác
    return body


def self_ident() -> tuple[int, int]:
    """(port, pid) của instance ghi trong state, để tab Cổng nhận ra cổng của chính nó.

    Trả cả pid để bên gọi đối chiếu port + pid với cổng đang LISTEN thật: state có thể
    cũ (bị SIGKILL nên không kịp dọn), khi đó không khớp pid và sẽ bị bỏ qua.
    """
    st = read() or {}
    try:
        return int(st["port"]), int(st["pid"])
    except (KeyError, TypeError, ValueError):
        return 0, 0
