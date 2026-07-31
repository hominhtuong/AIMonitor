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

from .collectors.procs import AI_ROOT_KINDS, KIND_LABELS

CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".aimon")
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")

# Mặc định CHỈ hiện Claude Code. Máy nào cũng có sẵn một mớ tiến trình bị phân loại là AI mà
# người dùng không hề chạy (Copilot của VSCode, Codex đi kèm editor...), bày hết ra thì rối
# mắt và che mất thứ thật sự cần theo dõi. Muốn thêm thì bật ngay trên trang, không phải sửa
# file - danh sách này chỉ là điểm khởi đầu.
DEFAULT_AI_KINDS = ["claude-code"]

DEFAULTS = {
    "theme": "auto",          # auto | dark | light
    "refresh_seconds": 3,
    "claude_dir": "",         # rỗng = ~/.claude
    "pricing_file": "",       # rỗng = pricing.json đi kèm
    "port": 0,                # 0 = dùng mặc định của server (8899 rồi lùi dần)
    "ai_kinds": DEFAULT_AI_KINDS,   # loại agent hiện trên dashboard; ["*"] = tất cả
    "office_pack": "",              # bộ nhân vật cho khung nhìn Văn phòng; "" = bộ mặc định
}

# Các bộ nhân vật nằm ở static/sprites.js (nơi vẽ ra chúng). Ở đây chỉ cần biết chuỗi nào
# hợp lệ để không ghi rác vào cấu hình; trang web vẫn tự kiểm lại lần nữa.
OFFICE_PACKS = ("voyage", "ninja", "office", "pets", "slime", "mascot", "crew")

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

    pack = raw.get("office_pack")
    if isinstance(pack, str) and pack.strip() in OFFICE_PACKS:
        out["office_pack"] = pack.strip()

    kinds = raw.get("ai_kinds")
    if isinstance(kinds, list):
        # Bỏ qua mục lạ thay vì báo lỗi: gõ nhầm một dòng không được làm hỏng cả file.
        # Danh sách rỗng cũng bỏ qua - ẩn sạch mọi agent thì dashboard thành trang trắng và
        # người dùng không hiểu vì sao, trong khi ý họ gần như chắc chắn là "chưa chọn gì".
        clean = [k for k in kinds if isinstance(k, str) and (k == "*" or k in AI_ROOT_KINDS)]
        if clean:
            out["ai_kinds"] = ["*"] if "*" in clean else sorted(set(clean))

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
    return {
        "theme": cfg["theme"],
        "refresh_seconds": cfg["refresh_seconds"],
        "ai_kinds": cfg["ai_kinds"],
        "office_pack": cfg["office_pack"],
        # Kèm nhãn luôn để trang web khỏi phải giữ bản sao thứ hai của KIND_LABELS. Tên sản
        # phẩm (Claude Code, Codex...) không dịch, nên gửi thẳng bản tiếng Anh là đủ.
        "known_kinds": {k: KIND_LABELS.get(k, k) for k in sorted(AI_ROOT_KINDS)},
    }
