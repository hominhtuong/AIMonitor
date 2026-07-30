"""Đọc tiến trình trên macOS / Linux bằng `ps`, RAM hệ thống bằng vm_stat / /proc."""

from __future__ import annotations

import os
import re
import subprocess

PS_ARGS = ["ps", "-axo", "pid=,ppid=,rss=,etime=,time=,stat=,uid=,command="]

_MEM_TOTAL: int | None = None


def _parse_duration(text: str) -> float:
    """'[[dd-]hh:]mm:ss[.ss]' => số giây."""
    text = (text or "").strip()
    if not text:
        return 0.0
    days = 0
    if "-" in text:
        d, text = text.split("-", 1)
        try:
            days = int(d)
        except ValueError:
            days = 0
    try:
        nums = [float(p) for p in text.split(":")]
    except ValueError:
        return 0.0
    secs = 0.0
    for n in nums:
        secs = secs * 60 + n
    return secs + days * 86400


def list_processes() -> list[dict]:
    try:
        out = subprocess.run(PS_ARGS, capture_output=True, text=True, timeout=20).stdout
    except Exception:
        return []
    my_uid = os.getuid()
    rows: list[dict] = []
    for line in out.splitlines():
        parts = line.strip().split(None, 7)
        if len(parts) < 8:
            continue
        pid_s, ppid_s, rss_s, etime_s, time_s, stat, uid_s, cmd = parts
        try:
            pid, ppid, rss, uid = int(pid_s), int(ppid_s), int(rss_s), int(uid_s)
        except ValueError:
            continue
        rows.append(
            {
                "pid": pid,
                "ppid": ppid,
                "rss_kb": rss,
                "uptime": _parse_duration(etime_s),
                "cpu_time": _parse_duration(time_s),
                "paused": stat.startswith("T"),
                "mine": uid == my_uid,
                "cmd": cmd,
            }
        )
    return rows


def mem_total_kb() -> int:
    global _MEM_TOTAL
    if _MEM_TOTAL is not None:
        return _MEM_TOTAL
    _MEM_TOTAL = 0
    try:
        if os.path.exists("/proc/meminfo"):  # Linux
            with open("/proc/meminfo", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        _MEM_TOTAL = int(line.split()[1])
                        break
        else:  # macOS
            out = subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, timeout=5).stdout
            _MEM_TOTAL = int(out.strip()) // 1024
    except Exception:
        _MEM_TOTAL = 0
    return _MEM_TOTAL


def mem_used_kb() -> int:
    if os.path.exists("/proc/meminfo"):  # Linux
        try:
            vals = {}
            with open("/proc/meminfo", encoding="utf-8") as f:
                for line in f:
                    k, _, v = line.partition(":")
                    vals[k.strip()] = int(v.split()[0])
            return max(0, vals.get("MemTotal", 0) - vals.get("MemAvailable", 0))
        except Exception:
            return 0
    try:  # macOS: active + wired + compressed
        out = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return 0
    page = 4096
    m = re.search(r"page size of (\d+) bytes", out)
    if m:
        page = int(m.group(1))
    vals = {}
    for line in out.splitlines()[1:]:
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        try:
            vals[k.strip()] = int(v.strip().rstrip("."))
        except ValueError:
            pass
    pages = (
        vals.get("Pages active", 0)
        + vals.get("Pages wired down", 0)
        + vals.get("Pages occupied by compressor", 0)
    )
    return pages * page // 1024
