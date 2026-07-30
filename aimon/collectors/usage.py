"""Hạn mức tài khoản Claude: Session (5 giờ) và Weekly (7 ngày) - hiển thị theo %.

**Nguồn chính: `~/.claude.json` => `cachedUsageUtilization`.** Đây chính là số mà bảng
"Account & Usage" của Claude Code hiển thị: `utilization.five_hour.utilization`,
`.seven_day.utilization`, kèm `resets_at` và `fetchedAtMs`. Claude Code tự làm mới nó
trong lúc chạy nên số bám sát thực tế (đã đối chiếu khớp 15% / 54% với bảng của nó).

**Nguồn dự phòng: `~/.claude/rate-cache.json`** do *statusline* ghi ra. Chỉ mới khi
statusline có chạy - dùng Claude Code trong IDE mà statusline không render thì file nằm
im (đã gặp ca cũ 69 giờ). Chỉ dùng khi `~/.claude.json` không đọc được.

Cả hai đều là file local. Tool tuyệt đối không tự gọi API Anthropic bằng credential của
người dùng. Luôn trả kèm `age_sec` + `stale` để UI nói thật thay vì đoán.

Phần **ước lượng local** (token đã dùng trong 5 giờ / 7 ngày, đọc từ transcript) luôn
mới và dùng để đối chiếu khi số chính thức đã cũ.

**Bù phần trôi.** `cachedUsageUtilization` là *cache*, Claude Code chỉ làm mới nó thỉnh
thoảng - đo trên máy thật: trễ tới 9.6 phút, mà 15 phút chạy Opus đã đi 11 điểm phần trăm.
Lấy nguyên số trong cache là hiển thị thiếu. Nên số hiển thị = `% chính thức` + phần ước
lượng đã dùng thêm kể từ `fetchedAtMs`.

Muốn đổi token ra % thì cần trần. Trần suy ra từ **chênh lệch giữa hai lần đọc liên tiếp**:
`trần = token dùng giữa 2 lần đọc / (Δ% / 100)`. Dùng chênh lệch chứ không dùng giá trị
tuyệt đối vì ta không biết cửa sổ bắt đầu từ đâu - cách tuyệt đối từng cho ra 141-191% ở
những cửa sổ tài khoản rõ ràng không bị chặn. Các lần đọc lưu ở `~/.aimon/calib.json`.

Sai số của một cặp gần như chỉ do % bị làm tròn về số nguyên, nên `_limit_from()` đòi cặp
phải chênh đủ nhiều (`MIN_DELTA_PCT`, hoặc `SOLO_DELTA_PCT` nếu chỉ có một cặp) và các cặp
phải đồng thuận. Không đạt thì không bù, thà hiện số cache còn hơn hiện số bịa.
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime

from . import claude as C

HOME = os.path.expanduser("~")
CLAUDE_JSON = os.path.join(HOME, ".claude.json")
RATE_CACHE = os.path.join(HOME, ".claude", "rate-cache.json")
CALIB_FILE = os.path.join(HOME, ".aimon", "calib.json")

STALE_AFTER = 30 * 60  # quá 30 phút coi là cũ

SPANS = {"five_hour": 5 * 3600, "seven_day": 7 * 86400}
MAX_CALIB_POINTS = 40    # số lần đọc chính thức giữ lại mỗi cửa sổ
MIN_DELTA_PCT = 5.0      # % là số nguyên, chênh nhỏ hơn thì sai số làm tròn nuốt hết tín hiệu
SOLO_DELTA_PCT = 10.0    # chỉ có 1 cặp thì cặp đó phải chênh nhiều mới đủ tin
MAX_CALIB_SPREAD = 2.0   # cặp cao nhất / thấp nhất; lệch hơn nghĩa là chưa bám sát
WINDOW_MATCH_TOL = 120   # giây; resets_at giữa 2 lần đọc lệch vài phần trăm giây là bình thường
PROJECT_MAX_AGE = 45 * 60  # số chính thức cũ hơn mức này thì bù cũng hết đáng tin
MAX_DRIFT_PCT = 30.0     # chặn trên phần bù, tránh sai số trần bị khuếch đại vô hạn
MIN_SHOW_DRIFT = 0.5     # bù nhỏ hơn nửa điểm thì coi như không có, khỏi gắn nhãn thừa


def _num(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _iso(value) -> float | None:
    """'2026-07-30T11:29:59.573398+00:00' => epoch. Python 3.9 không nuốt hậu tố 'Z'."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):
        return None


_cj_cache: dict = {"key": None, "data": None}


def _claude_json_usage() -> dict | None:
    """Đọc `cachedUsageUtilization` trong ~/.claude.json - đúng số bảng Account & Usage.

    File này ~140 KB và /api/snapshot chạy mỗi 3 giây, nên cache theo (mtime, size).
    """
    try:
        st = os.stat(CLAUDE_JSON)
    except OSError:
        return None
    key = (st.st_mtime, st.st_size)
    if _cj_cache["key"] == key:
        return _cj_cache["data"]

    data = None
    try:
        with open(CLAUDE_JSON, encoding="utf-8") as f:
            raw = json.load(f)
        cu = raw.get("cachedUsageUtilization") or {}
        util = cu.get("utilization") or {}
        fetched = _num(cu.get("fetchedAtMs"))
        five, seven = util.get("five_hour") or {}, util.get("seven_day") or {}
        if fetched and (five.get("utilization") is not None or seven.get("utilization") is not None):
            data = {
                "ts": fetched / 1000.0,
                "five_hour_pct": _num(five.get("utilization")),
                "seven_day_pct": _num(seven.get("utilization")),
                "five_hour_resets_at": _iso(five.get("resets_at")),
                "seven_day_resets_at": _iso(seven.get("resets_at")),
                # các hạn mức phụ (ví dụ "Weekly Fable") - giữ nguyên để UI dùng sau
                "extra": [
                    {
                        "kind": x.get("kind"),
                        "percent": _num(x.get("percent")),
                        "resets_at": _iso(x.get("resets_at")),
                        "label": ((x.get("scope") or {}).get("model") or {}).get("display_name"),
                    }
                    for x in (util.get("limits") or [])
                    if isinstance(x, dict) and x.get("kind") == "weekly_scoped"
                ],
            }
    except (OSError, ValueError, AttributeError):
        data = None

    _cj_cache.update({"key": key, "data": data})
    return data


def official() -> dict:
    """% hạn mức Session (5h) / Weekly (7 ngày). Ưu tiên ~/.claude.json, dự phòng rate-cache.json."""
    out = {
        "available": False,
        "path": None,
        "source": None,
        "five_hour_pct": None,
        "seven_day_pct": None,
        "five_hour_resets_at": None,
        "seven_day_resets_at": None,
        "extra": [],
        "context_pct": None,
        "model": None,
        "cwd": None,
        "ts": None,
        "age_sec": None,
        "stale": True,
        "note": "Chưa đọc được hạn mức từ ~/.claude.json hay ~/.claude/rate-cache.json.",
    }

    cj = _claude_json_usage()
    if cj:
        age = max(0.0, time.time() - cj["ts"])
        out.update(cj)
        out.update(
            {
                "available": True,
                "source": "claude.json",
                "path": "~/.claude.json",
                "age_sec": round(age),
                "stale": age > STALE_AFTER,
                "note": "Số chính thức từ Claude Code (bảng Account & Usage)."
                if age <= STALE_AFTER
                else f"Số chính thức đọc cách đây {_age_txt(age)} - Claude Code chỉ làm mới khi đang chạy.",
            }
        )
        return out

    # dự phòng: file do statusline ghi, thường cũ hơn nhiều
    try:
        with open(RATE_CACHE, encoding="utf-8") as f:
            d = json.load(f)
    except Exception:
        return out

    out["path"] = RATE_CACHE.replace(HOME, "~")
    out["source"] = "statusline"
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


# ------------------------------------------------------------ hiệu chỉnh trần


def _bounds(resets_at: float | None, span: float, end: float) -> tuple[float, float]:
    """Khoảng thời gian của một cửa sổ hạn mức.

    Cửa sổ của Claude neo theo mốc reset chứ không trượt, nên khi biết `resets_at`
    thì lấy [resets_at - span, end] cho khớp; không biết thì đành trượt [end - span, end].
    """
    if resets_at and resets_at > end:
        return resets_at - span, end
    return end - span, end


def _rebuild_window(resets_at: float | None, span: float, now: float) -> tuple[float, float, bool]:
    """Dựng lại cửa sổ hạn mức đang chạy => (bắt đầu, kết thúc, có neo chắc chắn không).

    Mốc reset trong rate-cache có thể đã trôi qua từ lâu. Cửa sổ kế tiếp không bắt đầu
    ngay lúc reset mà ở **lần gọi API đầu tiên sau đó**, nên cứ đi tới theo hoạt động
    thật trong transcript: từ mốc reset cũ, tìm lần dùng đầu tiên => đó là đầu cửa sổ
    mới, cộng span ra mốc hết hạn, lặp lại cho tới khi chạm hiện tại.

    Không có mốc reset nào để bám thì trả về cửa sổ trượt và cờ neo = False, lúc đó
    con số chỉ mang tính tham khảo vì có thể vắt qua hai cửa sổ thật.
    """
    if resets_at and resets_at > now:
        return resets_at - span, resets_at, True
    if not resets_at:
        return now - span, now + span, False

    hours = C.activity_hours()
    start = resets_at
    for _ in range(500):  # chặn trên, tránh lặp vô hạn nếu dữ liệu lạ
        nxt = [h * 3600 for h in hours if h * 3600 >= start]
        if not nxt:
            return now - span, now + span, False
        begin = nxt[0]
        end = begin + span
        if end > now:
            return begin, end, True
        start = end
    return now - span, now + span, False


def _read_calib() -> dict:
    try:
        with open(CALIB_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _write_calib(data: dict) -> None:
    try:
        os.makedirs(os.path.dirname(CALIB_FILE), exist_ok=True)
        tmp = f"{CALIB_FILE}.{os.getpid()}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, CALIB_FILE)
    except OSError:
        pass


def _median(values: list[float]) -> float | None:
    vals = sorted(v for v in values if v > 0)
    if not vals:
        return None
    mid = len(vals) // 2
    return vals[mid] if len(vals) % 2 else (vals[mid - 1] + vals[mid]) / 2


def _calibrate(off: dict) -> dict:
    """Lưu lại từng lần đọc chính thức, suy ra "bao nhiêu token thì hết 1% hạn mức".

    Hiệu chỉnh theo **chênh lệch giữa hai lần đọc liên tiếp** chứ không theo giá trị tuyệt
    đối: `trần = token dùng giữa 2 lần đọc / (Δ% / 100)`. Cách này miễn nhiễm với việc
    không biết cửa sổ bắt đầu từ đâu - thứ từng làm ước lượng tuyệt đối sai vài lần.

    Chỉ nhận cặp có `Δ% >= MIN_DELTA_PCT`, vì % là số nguyên: chênh 3 điểm thì sai số làm
    tròn đã ±17%, chênh 11 điểm chỉ còn ±5%.
    """
    calib = _read_calib()
    if not calib.get("bootstrapped"):
        calib = _bootstrap(calib)

    ts = off.get("ts")
    if not ts:
        return {k: _limit_from(v) for k, v in calib.items() if k in SPANS}

    for key in SPANS:
        pct = off.get(f"{key}_pct")
        reads = [r for r in calib.get(key, []) if isinstance(r, dict) and r.get("ts")]
        if pct is not None and not any(abs(r["ts"] - ts) < 1 for r in reads):
            reads.append({"ts": ts, "pct": pct, "resets_at": off.get(f"{key}_resets_at")})
        reads.sort(key=lambda r: r["ts"])
        calib[key] = reads[-MAX_CALIB_POINTS:]

    _write_calib(calib)
    return {k: _limit_from(v) for k, v in calib.items() if k in SPANS}


def _bootstrap(calib: dict) -> dict:
    """Nạp các lần đọc cũ từ `~/.claude/backups/.claude.json.backup.*`.

    Claude Code tự giữ vài bản backup của ~/.claude.json, mỗi bản kèm một
    `cachedUsageUtilization` ở thời điểm khác nhau. Nhặt chúng vào để có ngay vài cặp hiệu
    chỉnh, thay vì phải chờ nhiều giờ gom đủ. Chỉ chạy một lần.
    """
    import glob

    found: dict[str, dict[float, dict]] = {k: {} for k in SPANS}
    for path in sorted(glob.glob(os.path.join(HOME, ".claude", "backups", ".claude.json.backup.*")))[-12:]:
        try:
            with open(path, encoding="utf-8") as f:
                cu = (json.load(f) or {}).get("cachedUsageUtilization") or {}
        except (OSError, ValueError):
            continue
        ts = _num(cu.get("fetchedAtMs"))
        util = cu.get("utilization") or {}
        if not ts:
            continue
        for key in SPANS:
            w = util.get(key) or {}
            pct = _num(w.get("utilization"))
            if pct is not None:
                found[key][ts / 1000.0] = {
                    "ts": ts / 1000.0,
                    "pct": pct,
                    "resets_at": _iso(w.get("resets_at")),
                }

    for key in SPANS:
        reads = [r for r in calib.get(key, []) if isinstance(r, dict) and r.get("ts")]
        known = {round(r["ts"]) for r in reads}
        reads += [r for t, r in found[key].items() if round(t) not in known]
        reads.sort(key=lambda r: r["ts"])
        calib[key] = reads[-MAX_CALIB_POINTS:]
    calib["bootstrapped"] = True
    return calib


def _limit_from(reads: list) -> float | None:
    """Trần ước lượng từ các cặp đọc liên tiếp; None nếu chưa đủ tin.

    Sai số của một cặp gần như chỉ do % được làm tròn về số nguyên: chênh 5 điểm là ±10%,
    chênh 11 điểm chỉ còn ±4.5%. Nên một cặp chênh nhiều đã đủ dùng, còn cặp chênh ít thì
    phải có nhiều cặp và chúng phải đồng thuận.
    """
    pairs = []
    for a, b in zip(reads, reads[1:]):
        if not isinstance(a, dict) or not isinstance(b, dict):
            continue
        delta = (b.get("pct") or 0) - (a.get("pct") or 0)
        if delta < MIN_DELTA_PCT:
            continue  # quá nhỏ, hoặc âm vì cửa sổ đã reset giữa chừng
        ra, rb = a.get("resets_at"), b.get("resets_at")
        # mốc reset từ API lệch nhau vài phần trăm giây giữa hai lần đọc => so có dung sai
        if ra and rb and abs(ra - rb) > WINDOW_MATCH_TOL:
            continue  # hai lần đọc thuộc hai cửa sổ khác nhau, không trừ được
        tokens = C.tokens_since(a["ts"], b["ts"])
        if tokens > 0:
            pairs.append((tokens / (delta / 100.0), delta))
    if not pairs:
        return None
    limits = [p[0] for p in pairs]
    if len(pairs) == 1:
        return limits[0] if pairs[0][1] >= SOLO_DELTA_PCT else None
    lo, hi = min(limits), max(limits)
    if lo <= 0 or hi / lo > MAX_CALIB_SPREAD:
        return None
    return _median(limits)


def _resolve(key: str, off: dict, limit: float | None, now: float) -> dict:
    """Chốt con số % để hiển thị cho 1 cửa sổ, kèm lý do lấy từ đâu."""
    span = SPANS[key]
    resets_at = off.get(f"{key}_resets_at")
    official_pct = off.get(f"{key}_pct")
    age = off.get("age_sec")
    # mốc reset đã trôi qua => con số chính thức thuộc về cửa sổ cũ, không còn nghĩa
    expired = bool(resets_at) and resets_at <= now

    start, end, anchored = _rebuild_window(resets_at, span, now)
    win = C.window_between(start, now)
    est_pct = round(win["total"] / limit * 100, 1) if limit and limit > 0 and anchored else None

    # Bù phần đã dùng thêm kể từ lúc Claude Code làm mới số. Cache của nó trễ tới ~10 phút,
    # mà 10 phút chạy Opus có thể ngốn gần 10 điểm phần trăm - để nguyên là hiển thị sai.
    drift = None
    ts = off.get("ts")
    covers = C.recent_span()
    if (
        official_pct is not None
        and not expired
        and limit
        and limit > 0
        and ts
        and age is not None
        and age <= PROJECT_MAX_AGE
        and covers is not None
        and covers <= ts
    ):
        used = C.tokens_since(ts, now)
        if used > 0:
            drift = round(min(used / limit * 100, MAX_DRIFT_PCT), 1)

    out = {
        "official_pct": official_pct,
        "official_age_sec": age,
        "expired": expired,
        "window_start": start if anchored else None,
        "resets_in": round(end - now) if anchored and end > now else None,
        "tokens": win["total"],
        "cost": win["cost"],
        "msgs": win["msgs"],
        "est_pct": est_pct,
        "drift_pct": drift,
        "limit_tokens": round(limit) if limit else None,
    }

    if official_pct is not None and not off.get("stale") and not expired and (drift or 0) >= MIN_SHOW_DRIFT:
        out.update(
            {
                "pct": round(min(100.0, official_pct + drift), 1),
                "source": "projected",
                "note": f"{official_pct:.0f}% là số chính thức lúc Claude Code làm mới "
                f"({_age_txt(age)} trước), cộng thêm ~{drift:.0f}% ước lượng theo token đã dùng "
                "từ đó tới giờ.",
            }
        )
    elif official_pct is not None and not off.get("stale") and not expired:
        out.update({"pct": official_pct, "source": "official", "note": "Số chính thức từ Claude Code."})
    elif est_pct is not None:
        why = "cửa sổ đã sang chu kỳ mới" if expired else f"số chính thức cũ {_age_txt(age)}"
        out.update(
            {
                "pct": est_pct,
                "source": "estimate",
                "note": f"Ước lượng theo token local ({why}), trần suy ra từ các lần đọc chính thức "
                "trước đó. Là số xấp xỉ, không phải số của Anthropic.",
            }
        )
    elif official_pct is not None and not expired:
        out.update(
            {
                "pct": official_pct,
                "source": "official_stale",
                "note": f"Số chính thức đọc cách đây {_age_txt(age)}, cửa sổ này chưa reset nên thực tế "
                "chỉ cao hơn chứ không thấp hơn.",
            }
        )
    else:
        out.update(
            {
                "pct": None,
                "source": "none",
                "note": "Chưa có % đáng tin: số chính thức đã cũ và cửa sổ cũng đã sang chu kỳ mới. "
                "Mở một phiên Claude Code ở terminal để statusline ghi lại hạn mức là có số ngay.",
            }
        )
    return out


def _age_txt(age: float | None) -> str:
    if not age:
        return "không rõ"
    if age < 3600:
        return f"{round(age / 60)} phút"
    if age < 86400:
        return f"{round(age / 3600)} giờ"
    return f"{round(age / 86400)} ngày"


def collect(local_windows: dict | None = None) -> dict:
    """Gộp số chính thức + ước lượng local (từ claude.windows())."""
    now = time.time()
    off = official()
    for key, field in (("five_hour_resets_at", "five_hour_in"), ("seven_day_resets_at", "seven_day_in")):
        reset = off.get(key)
        off[field] = round(reset - now) if reset else None

    limits = _calibrate(off) if off.get("available") else _read_limits_only()
    return {
        "official": off,
        "local": local_windows or {},
        "five_hour": _resolve("five_hour", off, limits.get("five_hour"), now),
        "seven_day": _resolve("seven_day", off, limits.get("seven_day"), now),
    }


def _read_limits_only() -> dict:
    """Trần đã hiệu chỉnh khi không đọc được số chính thức nào lúc này.

    Lọc theo SPANS vì calib.json còn chứa khoá phụ (`bootstrapped`) không phải danh sách.
    """
    calib = _read_calib()
    return {k: _limit_from(calib.get(k) or []) for k in SPANS}
