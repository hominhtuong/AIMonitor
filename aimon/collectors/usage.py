"""Hạn mức tài khoản Claude: Session (5 giờ) và Weekly (7 ngày).

**Con số chính thức** nằm ở `~/.claude/rate-cache.json`. File này do *statusline* của
Claude Code ghi ra: Claude Code truyền payload (có `rate_limits.five_hour` /
`.seven_day`) vào statusline command, script ghi lại thành JSON. Nghĩa là số chỉ mới
khi statusline có chạy - nếu chỉ dùng Claude Code trong IDE mà statusline không render
thì file sẽ cũ. Vì vậy luôn trả kèm `age_sec` + `stale` để UI nói thật với người dùng.

Không có API/CLI nào khác đọc được hạn mức này (không có `claude usage`), và tool này
tuyệt đối không tự gọi API Anthropic bằng credential của người dùng.

Phần **ước lượng local** (token đã dùng trong 5 giờ / 7 ngày, đọc từ transcript) luôn
mới và dùng để đối chiếu khi số chính thức đã cũ.
"""

from __future__ import annotations

import json
import os
import time

HOME = os.path.expanduser("~")
RATE_CACHE = os.path.join(HOME, ".claude", "rate-cache.json")

STALE_AFTER = 30 * 60  # quá 30 phút coi là cũ


def _num(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def official() -> dict:
    """Đọc rate-cache.json => % đã dùng của Session (5h) và Weekly (7 ngày)."""
    out = {
        "available": False,
        "path": RATE_CACHE.replace(HOME, "~"),
        "five_hour_pct": None,
        "seven_day_pct": None,
        "five_hour_resets_at": None,
        "seven_day_resets_at": None,
        "context_pct": None,
        "model": None,
        "cwd": None,
        "ts": None,
        "age_sec": None,
        "stale": True,
        "note": "Chưa có dữ liệu - statusline của Claude Code chưa ghi rate-cache.json.",
    }
    try:
        with open(RATE_CACHE, encoding="utf-8") as f:
            d = json.load(f)
    except Exception:
        return out

    ts = _num(d.get("ts"), 0) or 0
    age = max(0.0, time.time() - ts) if ts else None
    out.update(
        {
            "available": True,
            "five_hour_pct": _num(d.get("r5")),
            "seven_day_pct": _num(d.get("r7")),
            "five_hour_resets_at": _num(d.get("r5_resets_at")),
            "seven_day_resets_at": _num(d.get("r7_resets_at")),
            "context_pct": _num(d.get("context_pct")),
            "model": d.get("model"),
            "cwd": (d.get("cwd") or "").replace(HOME, "~") or None,
            "ts": ts or None,
            "age_sec": round(age, 0) if age is not None else None,
            "stale": age is None or age > STALE_AFTER,
        }
    )
    if out["stale"]:
        out["note"] = (
            "Số chính thức đang cũ. Nó chỉ được cập nhật khi statusline của Claude Code chạy "
            "(mở phiên Claude Code ở terminal, hoặc bật extension statusline). Trong lúc đó "
            "dùng cột ước lượng local bên cạnh."
        )
    else:
        out["note"] = "Số chính thức từ Claude Code (statusline)."
    return out


def collect(local_windows: dict | None = None) -> dict:
    """Gộp số chính thức + ước lượng local (từ claude.windows())."""
    data = {"official": official(), "local": local_windows or {}}
    off = data["official"]
    for key, field in (("five_hour_resets_at", "five_hour_in"), ("seven_day_resets_at", "seven_day_in")):
        reset = off.get(key)
        off[field] = round(reset - time.time()) if reset else None
    return data
