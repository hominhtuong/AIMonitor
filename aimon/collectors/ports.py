"""Cổng local đang LISTEN + container Docker.

macOS/Linux: `lsof -nP -iTCP -sTCP:LISTEN`
Windows:     `netstat -ano -p TCP` (lọc dòng LISTENING) + `tasklist` để lấy tên tiến trình

Kết quả cache vài giây vì lsof/netstat khá chậm.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys

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
    8899: "AI Monitor",
}


def _listening_posix() -> list[dict]:
    if not shutil.which("lsof"):
        return []
    try:
        out = subprocess.run(
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
                "note": INTERESTING.get(port, ""),
            },
        )
    return sorted(rows.values(), key=lambda r: r["port"])


def _tasklist_names() -> dict[int, str]:
    try:
        out = subprocess.run(
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


def _listening_windows() -> list[dict]:
    try:
        out = subprocess.run(
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
                "note": INTERESTING.get(port, ""),
            },
        )
    return sorted(rows.values(), key=lambda r: r["port"])


def _docker() -> tuple[list[dict], bool]:
    if not shutil.which("docker"):
        return [], False
    try:
        res = subprocess.run(
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


def collect(force: bool = False) -> dict:
    import time

    now = time.time()
    if force or now - _cache["ts"] > TTL:
        docker, available = _docker()
        ports = _listening_windows() if IS_WINDOWS else _listening_posix()
        _cache.update({"ts": now, "ports": ports, "docker": docker, "docker_available": available})
    return {
        "ports": _cache["ports"],
        "docker": _cache["docker"],
        "docker_available": _cache["docker_available"],
    }
