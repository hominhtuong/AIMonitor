"""Cấu hình dùng chung cho cả ba vỏ: `~/.aimon/config.json`.

Vì sao cần: settings của VSCode chỉ tồn tại trong VSCode. Người dùng app macOS và bản `.exe`
không có chỗ nào để đổi nhịp làm mới hay trỏ dữ liệu Claude sang thư mục khác. File này là
chỗ đó - server đọc, nên cả ba vỏ đều hưởng.

Thứ tự ưu tiên, từ mạnh tới yếu:

    tham số dòng lệnh  >  biến môi trường  >  config.json  >  mặc định trong code

Riêng theme và nhịp làm mới còn một tầng nữa ở phía trang web: `?theme=` do extension VSCode
truyền vào **đè lên tất cả** (mỗi khung nhìn trong editor tự quyết), rồi tới lựa chọn người
dùng bấm trên trang (localStorage), rồi mới tới file này. Nghĩa là file này cho *mặc định*,
không phải *ép buộc*.

File hỏng, thiếu, hay sai kiểu đều không được làm server chết: cấu hình sai thì bỏ qua và
chạy bằng mặc định.
"""

from __future__ import annotations

import json
import os

CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".aimon")
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")

DEFAULTS = {
    "theme": "auto",          # auto | dark | light
    "refresh_seconds": 3,
    "claude_dir": "",         # rỗng = ~/.claude
    "pricing_file": "",       # rỗng = pricing.json đi kèm
    "port": 0,                # 0 = dùng mặc định của server (8899 rồi lùi dần)
}

_THEMES = ("auto", "dark", "light")

# Cache theo (mtime, size) giống cách usage.py đọc ~/.claude.json: /api/snapshot chạy mỗi
# 3 giây, đọc lại file mỗi lần là phí.
_cache: tuple | None = None
_cached_value: dict | None = None


def _clean(raw: dict) -> dict:
    out = dict(DEFAULTS)
    if not isinstance(raw, dict):
        return out

    theme = raw.get("theme")
    if isinstance(theme, str) and theme in _THEMES:
        out["theme"] = theme

    refresh = raw.get("refresh_seconds")
    if isinstance(refresh, (int, float)) and 1 <= refresh <= 60:
        out["refresh_seconds"] = int(refresh)

    for key in ("claude_dir", "pricing_file"):
        val = raw.get(key)
        if isinstance(val, str) and val.strip():
            out[key] = os.path.expanduser(val.strip())

    port = raw.get("port")
    if isinstance(port, int) and 0 <= port <= 65535:
        out["port"] = port

    return out


def load() -> dict:
    """Đọc config, luôn trả về đủ khoá. Không có file thì trả mặc định."""
    global _cache, _cached_value
    try:
        st = os.stat(CONFIG_PATH)
        key = (st.st_mtime, st.st_size)
    except OSError:
        _cache, _cached_value = None, None
        return dict(DEFAULTS)

    if _cache == key and _cached_value is not None:
        return dict(_cached_value)

    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, ValueError):
        # JSON hỏng: chạy bằng mặc định chứ không chết. Người dùng sửa tay file này.
        raw = {}

    _cached_value = _clean(raw)
    _cache = key
    return dict(_cached_value)


def frontend() -> dict:
    """Phần trang web cần biết. Không trả đường dẫn ra ngoài - trang web không dùng tới,
    mà lộ đường dẫn tuyệt đối lên giao diện thì thừa."""
    cfg = load()
    return {"theme": cfg["theme"], "refresh_seconds": cfg["refresh_seconds"]}
