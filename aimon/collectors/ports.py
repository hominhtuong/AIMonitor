"""Cổng local đang LISTEN + container Docker.

macOS/Linux: `lsof -nP -iTCP -sTCP:LISTEN`
Windows:     `netstat -ano -p TCP` (lọc dòng LISTENING) + `tasklist` để lấy tên tiến trình

Kết quả cache vài giây vì lsof/netstat khá chậm.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess  # noqa: F401  (giữ cho type hint)
import sys

from .. import instance as INST
from .. import proc_util as PU

IS_WINDOWS = sys.platform.startswith("win")
TTL = 5.0

_cache: dict = {"ts": 0.0, "ports": [], "docker": [], "docker_available": None}

INTERESTING = {
    4723: "Appium server",
    9222: "Chrome DevTools",
    3000: "Dev server",
    5173: "Vite",
    8000: "HTTP dev",
    8080: "HTTP dev",
    8899: "AI Monitor (default port)",
}


def _note(port: int, pid: int, me: tuple[int, int]) -> str:
    """Cổng của AI Monitor là động nên phải tra từ state file, không hardcode được."""
    if me[0] and (port, pid) == me:
        return "AI Monitor (this page)"
    return INTERESTING.get(port, "")


def _note_key(port: int, pid: int, me: tuple[int, int]) -> str:
    """Mã để UI dịch. Tên sản phẩm (Vite, Appium...) giữ nguyên nên không cần mã."""
    if me[0] and (port, pid) == me:
        return "port.self"
    if port == 8899:
        return "port.default"
    return ""


def _listening_posix(me: tuple[int, int] = (0, 0)) -> list[dict]:
    if not shutil.which("lsof"):
        return []
    try:
        out = PU.run(
            ["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"], capture_output=True, text=True, timeout=15
        ).stdout
    except Exception:
        return []
    rows: dict[tuple[int, str], dict] = {}
    for line in out.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 9:
            continue
        cmd, pid_s, user = parts[0], parts[1], parts[2]
        # NAME là field cuối, nhưng lsof nối thêm "(LISTEN)" phía sau
        name = parts[-2] if parts[-1].startswith("(") else parts[-1]
        if "->" in name or ":" not in name:
            continue
        addr, _, port_s = name.rpartition(":")
        try:
            pid, port = int(pid_s), int(port_s)
        except ValueError:
            continue
        rows.setdefault(
            (port, addr),
            {
                "port": port,
                "addr": addr,
                "pid": pid,
                "command": cmd.replace("\\x20", " "),
                "user": user,
                "note": _note(port, pid, me),
                "note_key": _note_key(port, pid, me),
            },
        )
    return sorted(rows.values(), key=lambda r: r["port"])


def _tasklist_names() -> dict[int, str]:
    try:
        out = PU.run(
            ["tasklist", "/FO", "CSV", "/NH"], capture_output=True, text=True, timeout=15
        ).stdout
    except Exception:
        return {}
    names: dict[int, str] = {}
    for line in out.splitlines():
        cols = [c.strip('"') for c in line.split('","')]
        if len(cols) < 2:
            continue
        try:
            names[int(cols[1])] = cols[0].strip('"')
        except ValueError:
            continue
    return names


def _listening_windows(me: tuple[int, int] = (0, 0)) -> list[dict]:
    try:
        out = PU.run(
            ["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True, timeout=20
        ).stdout
    except Exception:
        return []
    names = _tasklist_names()
    rows: dict[tuple[int, str], dict] = {}
    for line in out.splitlines():
        if "LISTENING" not in line:
            continue
        parts = line.split()
        if len(parts) < 4:
            continue
        local, pid_s = parts[1], parts[-1]
        addr, _, port_s = local.rpartition(":")
        try:
            pid, port = int(pid_s), int(port_s)
        except ValueError:
            continue
        rows.setdefault(
            (port, addr),
            {
                "port": port,
                "addr": addr.strip("[]"),
                "pid": pid,
                "command": names.get(pid, "?"),
                "user": "",
                "note": _note(port, pid, me),
                "note_key": _note_key(port, pid, me),
            },
        )
    return sorted(rows.values(), key=lambda r: r["port"])


def _docker() -> tuple[list[dict], bool]:
    if not shutil.which("docker"):
        return [], False
    try:
        res = PU.run(
            ["docker", "ps", "--format", "{{json .}}"], capture_output=True, text=True, timeout=15
        )
    except Exception:
        return [], False
    if res.returncode != 0:
        return [], False
    items = []
    for line in res.stdout.splitlines():
        try:
            d = json.loads(line)
        except Exception:
            continue
        items.append(
            {
                "id": d.get("ID"),
                "name": d.get("Names"),
                "image": d.get("Image"),
                "status": d.get("Status"),
                "ports": d.get("Ports"),
            }
        )
    return items, True


def cached() -> dict:
    """Trả nguyên cache, KHÔNG bao giờ chạy `lsof`/`docker ps`.

    Dùng khi trang đang xem tab không đụng tới dữ liệu cổng. Giữ nguyên hình dạng payload
    thay vì bỏ hẳn ba khoá này ra: thiếu khoá thì frontend phải đi kiểm `undefined` ở mọi
    chỗ đọc tới, mà chỉ cần sót một chỗ là tab Cổng vỡ. Số hơi cũ vài giây thì không ai
    thấy, vì cái tab đang xem có hiện nó ra đâu - và lúc bấm sang tab Cổng thì trang xin
    lại bản mới ngay.
    """
    return {
        "ports": _cache["ports"],
        "docker": _cache["docker"],
        "docker_available": _cache["docker_available"],
    }


def collect(force: bool = False) -> dict:
    import time

    now = time.time()
    if force or now - _cache["ts"] > TTL:
        docker, available = _docker()
        me = INST.self_ident()
        ports = _listening_windows(me) if IS_WINDOWS else _listening_posix(me)
        _cache.update({"ts": now, "ports": ports, "docker": docker, "docker_available": available})
    return {
        "ports": _cache["ports"],
        "docker": _cache["docker"],
        "docker_available": _cache["docker_available"],
    }
