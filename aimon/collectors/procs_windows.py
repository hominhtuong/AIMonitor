"""Đọc tiến trình trên Windows bằng PowerShell + CIM (Win32_Process).

Không cần cài thêm gì: PowerShell 5.1 có sẵn từ Windows 10.
Lưu ý khác biệt so với macOS/Linux:
  - Windows không có SIGSTOP/SIGCONT => không hỗ trợ tạm dừng (UI tự ẩn nút).
  - Không đọc chủ sở hữu tiến trình (Win32_Process.GetOwner rất chậm) => coi như
    của user hiện tại; nếu không đủ quyền thì taskkill sẽ báo lỗi rõ ràng.
"""

from __future__ import annotations

import json
import subprocess

_PS_SCRIPT = r"""
$ErrorActionPreference = 'SilentlyContinue'
$now = Get-Date
Get-CimInstance Win32_Process | ForEach-Object {
  $cmd = if ($_.CommandLine) { $_.CommandLine } else { $_.Name }
  [pscustomobject]@{
    pid  = [int]$_.ProcessId
    ppid = [int]$_.ParentProcessId
    rss  = [int]($_.WorkingSetSize / 1024)
    up   = [int](($now - $_.CreationDate).TotalSeconds)
    cpu  = [double](($_.KernelModeTime + $_.UserModeTime) / 10000000)
    cmd  = $cmd
  }
} | ConvertTo-Json -Compress -Depth 2
"""

_MEM_SCRIPT = r"""
$ErrorActionPreference = 'SilentlyContinue'
$cs = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
[pscustomobject]@{
  total = [int]($cs.TotalPhysicalMemory / 1024)
  free  = [int]$os.FreePhysicalMemory
} | ConvertTo-Json -Compress
"""

_MEM_CACHE: dict = {"total": 0, "free": 0}


def _powershell(script: str, timeout: int = 25):
    for exe in ("powershell.exe", "pwsh.exe"):
        try:
            out = subprocess.run(
                [exe, "-NoProfile", "-NonInteractive", "-Command", script],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except Exception:
            continue
        if out.returncode == 0 and out.stdout.strip():
            try:
                return json.loads(out.stdout)
            except Exception:
                return None
    return None


def list_processes() -> list[dict]:
    data = _powershell(_PS_SCRIPT)
    if data is None:
        return []
    if isinstance(data, dict):  # 1 tiến trình => PowerShell trả object đơn
        data = [data]
    rows: list[dict] = []
    for d in data:
        try:
            pid = int(d.get("pid") or 0)
        except (TypeError, ValueError):
            continue
        if pid <= 0:
            continue
        rows.append(
            {
                "pid": pid,
                "ppid": int(d.get("ppid") or 0),
                "rss_kb": int(d.get("rss") or 0),
                "uptime": float(d.get("up") or 0),
                "cpu_time": float(d.get("cpu") or 0),
                "paused": False,
                "mine": True,
                "cmd": d.get("cmd") or "",
            }
        )
    return rows


def _refresh_mem() -> None:
    data = _powershell(_MEM_SCRIPT, timeout=15)
    if isinstance(data, dict):
        _MEM_CACHE["total"] = int(data.get("total") or 0)
        _MEM_CACHE["free"] = int(data.get("free") or 0)


def mem_total_kb() -> int:
    if not _MEM_CACHE["total"]:
        _refresh_mem()
    return _MEM_CACHE["total"]


def mem_used_kb() -> int:
    _refresh_mem()
    total, free = _MEM_CACHE["total"], _MEM_CACHE["free"]
    return max(0, total - free)
