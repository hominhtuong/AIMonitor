"""Đọc tiến trình, phân loại theo AI, dựng cây cha-con.

Phần đọc dữ liệu thô tách theo hệ điều hành:
  - macOS / Linux  => procs_posix.py  (ps)
  - Windows        => procs_windows.py (PowerShell + CIM)

Phần phân loại / dựng cây / rollup RAM dùng chung cho cả hai.
"""

from __future__ import annotations

import os
import re
import sys
import time

IS_WINDOWS = sys.platform.startswith("win")

if IS_WINDOWS:  # pragma: no cover - phụ thuộc OS
    from . import procs_windows as raw
else:
    from . import procs_posix as raw

# pid -> (cpu_seconds, wall_clock) của lần snapshot trước, để tính %CPU tức thời
_prev_cpu: dict[int, tuple[float, float]] = {}

AI_ROOT_KINDS = {"claude-code", "codex", "copilot", "gemini", "cursor", "ollama", "local-llm"}

KIND_LABELS = {
    "claude-code": "Claude Code",
    "mcp": "MCP server",
    "codex": "Codex",
    "copilot": "GitHub Copilot",
    "gemini": "Gemini CLI",
    "cursor": "Cursor AI",
    "ollama": "Ollama",
    "local-llm": "Local LLM",
    "automation": "Automation driver",
    "browser": "Browser",
    "editor": "Editor",
    "node": "Node",
    "python": "Python",
    "java": "Java",
    "docker": "Docker",
    "other": "Other",
}

# Tiến trình do IDE/app quản lý: kill xong sẽ được supervisor bật lại
SUPERVISOR_KINDS = {"editor", "browser"}

_MCP_NAMES = [
    (r"lark-mcp", "Lark MCP"),
    (r"appium-mcp", "Appium MCP"),
    (r"playwright[/-]mcp|@playwright/mcp|mcp_playwright\.py", "Playwright MCP"),
    (r"context7", "Context7 MCP"),
    (r"figma", "Figma MCP"),
    (r"chrome-devtools-mcp", "Chrome DevTools MCP"),
    (r"jsts-upgrade-assistant.*--mcp", "Java Upgrade MCP"),
    (r"filesystem-mcp|mcp-server-filesystem", "Filesystem MCP"),
    (r"github-mcp|mcp-server-github", "GitHub MCP"),
]

_INTERPRETERS = {
    "node", "npm", "npx", "bun", "deno", "python", "python3", "python.exe", "python3.exe",
    "pythonw.exe", "Python", "sh", "bash", "zsh", "java", "java.exe", "ruby", "perl", "cmd.exe",
}
_SUBCMDS = {"exec", "run", "start", "-y", "--yes", "-m", "-u", "/c", "/k"}


def _plugin_of(cmd: str) -> str | None:
    m = re.search(r"plugins[/\\]cache[/\\]([^/\\]+)[/\\]", cmd)
    return m.group(1) if m else None


def _mcp_label(cmd: str) -> str:
    for pat, name in _MCP_NAMES:
        if re.search(pat, cmd, re.I):
            plugin = _plugin_of(cmd)
            return f"{name} ({plugin})" if plugin else name
    m = re.search(r"([\w.@/\\-]*mcp[\w.@/\\-]*)", cmd, re.I)
    if m:
        return os.path.basename(m.group(1).replace("\\", "/"))
    return "MCP server"


def _is_mcp(cmd: str) -> bool:
    if re.search(r"(^|[\s/\\@_-])mcp([\s/\\@_.-]|$)", cmd, re.I):
        return True
    return bool(re.search(r"mcp[-_]?(server|playwright|proxy)", cmd, re.I))


def _is_claude_session(cmd: str) -> bool:
    if "native-binary/claude" in cmd or "native-binary\\claude" in cmd:
        return True
    if re.search(r"[/\\]claude(\.exe)?(\s|$)", cmd) and (
        "--output-format" in cmd or "--input-format" in cmd or "--print" in cmd or "--resume" in cmd
    ):
        return True
    return bool(re.search(r"[/\\](bin|\.local[/\\]bin)[/\\]claude(\.exe)?(\s|$)", cmd))


def classify(cmd: str) -> tuple[str, str, bool]:
    """=> (kind, label, is_ai)."""
    if _is_claude_session(cmd):
        return "claude-code", "Claude Code", True
    # Browser xét TRƯỚC MCP: Chrome do Playwright MCP mở có chữ 'mcp' trong profile
    # path, nếu để MCP bắt trước thì renderer Chrome bị gán nhãn 'MCP server'.
    if re.search(r"Google Chrome|Chromium|chrome\.exe|msedge\.exe|headless_shell|firefox|Safari|Microsoft Edge", cmd, re.I):
        auto = re.search(r"--enable-automation|--remote-debugging|playwright|puppeteer|mcp", cmd, re.I)
        return ("automation", "Browser (automation)", False) if auto else ("browser", "Browser", False)
    if _is_mcp(cmd):
        return "mcp", _mcp_label(cmd), True
    if re.search(r"openai\.chatgpt.*[/\\\s]codex|[/\\\s]codex(\.exe)?(\s|$)", cmd):
        return "codex", "Codex", True
    if "copilot" in cmd.lower():
        return "copilot", "GitHub Copilot", True
    if re.search(r"gemini[-_]?cli|[/\\]gemini(\.exe)?(\s|$)", cmd):
        return "gemini", "Gemini CLI", True
    if re.search(r"\bollama\b", cmd, re.I):
        return "ollama", "Ollama", True
    if re.search(r"llama[.-]?cpp|lmstudio|LM Studio", cmd, re.I):
        return "local-llm", "Local LLM", True
    if re.search(r"cursor", cmd, re.I) and re.search(r"\bAI\b|copilot|chat", cmd):
        return "cursor", "Cursor AI", True
    if re.search(r"appium|chromedriver|geckodriver|msedgedriver", cmd, re.I):
        return "automation", "Automation driver", False
    if re.search(r"Visual Studio Code|Code Helper|Code\.exe|electron|Electron", cmd, re.I):
        return "editor", "Editor", False
    if re.search(r"(^|[/\\])(node|bun|deno)(\.exe)?(\s|$)", cmd):
        return "node", "Node", False
    if re.search(r"(^|[/\\])(python3?|pythonw?|Python)(\.exe)?(\s|$)", cmd):
        return "python", "Python", False
    if re.search(r"(^|[/\\])(java|mvn|gradle)(\.exe)?(\s|$)", cmd):
        return "java", "Java", False
    if re.search(r"docker|containerd", cmd, re.I):
        return "docker", "Docker", False
    return "other", "Other", False


def short_name(cmd: str) -> str:
    """Tên gọn để hiển thị.

    Cắt tại flag đầu tiên (không phải dấu cách đầu tiên) để không làm hỏng
    đường dẫn có khoảng trắng như `/Applications/Google Chrome.app/...`.
    """
    head = re.split(r"\s+[-/]{1,2}[A-Za-z]", cmd, maxsplit=1)[0].strip().strip('"')
    if not head:
        head = cmd.strip()
    if head.startswith(("/", "~", ".")) or re.match(r"^[A-Za-z]:[\\/]", head):
        base = os.path.basename(head.replace("\\", "/"))
        return (base or head)[:60]

    tokens = head.split()
    if not tokens:
        return cmd[:60]
    base = os.path.basename(tokens[0].replace("\\", "/"))
    if base in _INTERPRETERS:
        for tok in tokens[1:]:
            if tok in _SUBCMDS or tok.startswith(("-", "/")):
                continue
            label = tok if ("@" in tok and "/" in tok) else os.path.basename(tok.replace("\\", "/"))
            return f"{base} {label}"[:60]
    return base[:60]


# ---------------------------------------------------------------- snapshot


def snapshot() -> dict[int, dict]:
    """{pid: info} kèm phân loại và %CPU tính theo delta giữa 2 lần gọi."""
    rows = raw.list_processes()
    now = time.monotonic()
    cur_cpu: dict[int, tuple[float, float]] = {}
    procs: dict[int, dict] = {}

    for r in rows:
        pid = r["pid"]
        cpu_time = r.get("cpu_time", 0.0)
        cpu_pct = -1.0
        prev = _prev_cpu.get(pid)
        if prev:
            d_cpu, d_wall = cpu_time - prev[0], now - prev[1]
            if d_wall > 0.2:
                cpu_pct = max(0.0, min(100.0 * (os.cpu_count() or 1), d_cpu / d_wall * 100))
        cur_cpu[pid] = (cpu_time, now)

        cmd = r.get("cmd") or ""
        kind, label, is_ai = classify(cmd)
        procs[pid] = {
            "pid": pid,
            "ppid": r.get("ppid", 0),
            "rss_kb": r.get("rss_kb", 0),
            "uptime": r.get("uptime", 0.0),
            "cpu_time": cpu_time,
            "cpu_pct": round(cpu_pct, 1),
            "paused": bool(r.get("paused")),
            "mine": bool(r.get("mine", True)),
            "kind": kind,
            "label": label,
            "is_ai": is_ai,
            "name": short_name(cmd),
            "cmd": cmd,
        }

    _prev_cpu.clear()
    _prev_cpu.update(cur_cpu)
    return procs


def children_map(procs: dict[int, dict]) -> dict[int, list[int]]:
    kids: dict[int, list[int]] = {}
    for pid, p in procs.items():
        if p["ppid"] != pid:
            kids.setdefault(p["ppid"], []).append(pid)
    return kids


def descendants(pid: int, kids: dict[int, list[int]], limit: int = 800) -> list[int]:
    out: list[int] = []
    seen = {pid}
    stack = list(kids.get(pid, []))
    while stack and len(out) < limit:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        out.append(cur)
        stack.extend(kids.get(cur, []))
    return out


def build_tree(pid: int, procs: dict, kids: dict, depth: int = 0) -> dict | None:
    p = procs.get(pid)
    if p is None:
        return None
    node = {k: p[k] for k in ("pid", "rss_kb", "cpu_pct", "uptime", "paused", "kind", "label", "name", "cmd")}
    node["children"] = []
    if depth < 6:
        for c in sorted(kids.get(pid, []), key=lambda x: -procs.get(x, {}).get("rss_kb", 0)):
            child = build_tree(c, procs, kids, depth + 1)
            if child:
                node["children"].append(child)
    node["rss_tree_kb"] = p["rss_kb"] + sum(c["rss_tree_kb"] for c in node["children"])
    node["cpu_tree_pct"] = round(
        max(p["cpu_pct"], 0) + sum(max(c["cpu_tree_pct"], 0) for c in node["children"]), 1
    )
    return node


# ---------------------------------------------------------------- hệ thống

mem_total_kb = raw.mem_total_kb
mem_used_kb = raw.mem_used_kb


def load_avg() -> list[float]:
    try:
        return [round(x, 2) for x in os.getloadavg()]
    except (OSError, AttributeError):  # Windows không có load average
        return []


def capabilities() -> dict:
    """Cho UI biết OS này hỗ trợ thao tác nào."""
    return {
        "os": "windows" if IS_WINDOWS else ("macos" if sys.platform == "darwin" else "linux"),
        "pause": not IS_WINDOWS,  # Windows không có SIGSTOP/SIGCONT
        "load_avg": not IS_WINDOWS,
    }
