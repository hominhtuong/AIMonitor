"""Gọi tiến trình ngoài mà KHÔNG bật cửa sổ console trên Windows.

Vì sao phải có module này: AI Monitor chạy như một ứng dụng có giao diện - bản `.exe` dựng
với `--noconsole`, còn extension VSCode thì được editor spawn. Cả hai đều **không có console**.
Trên Windows, `subprocess` gọi một chương trình console (powershell, netstat, taskkill) từ
tiến trình không console sẽ khiến hệ điều hành **bật một cửa sổ console mới** cho nó.

Các collector lại chạy theo nhịp `/api/snapshot`, tức mỗi 3 giây một lần, nên người dùng thấy
cửa sổ đen nháy lên liên tục không dứt. Đây chính là lỗi "chạy command line liên tục, không
ngắt" mà người dùng bản .exe báo lại.

`CREATE_NO_WINDOW` chỉ có trên Windows nên phải lấy bằng getattr - trên macOS/Linux hằng số
này không tồn tại và truyền `creationflags` khác 0 sẽ nổ ValueError.
"""

from __future__ import annotations

import subprocess
import sys

IS_WINDOWS = sys.platform.startswith("win")

# 0 trên POSIX = "không có cờ nào", subprocess chấp nhận và bỏ qua.
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0) if IS_WINDOWS else 0


def run(args, **kwargs):
    """`subprocess.run` nhưng im lặng: không nháy cửa sổ console trên Windows.

    Dùng cho MỌI lệnh ngoài trong aimon/. Gọi thẳng `subprocess.run` là lỗi quay lại.
    """
    kwargs.setdefault("creationflags", _NO_WINDOW)
    return subprocess.run(args, **kwargs)


def popen(args, **kwargs):
    """`subprocess.Popen` bản im lặng, dùng cho tiến trình chạy dài (mở cửa sổ app)."""
    kwargs.setdefault("creationflags", _NO_WINDOW)
    return subprocess.Popen(args, **kwargs)
