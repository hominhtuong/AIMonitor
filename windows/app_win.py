"""Điểm vào cho bản AIMonitor.exe trên Windows.

Khác `python -m aimon.server` ở hai chỗ:

  - Mở giao diện trong **cửa sổ riêng** chứ không phải tab browser. Dùng chế độ `--app=` của
    Edge (máy Windows 10/11 nào cũng có sẵn) hoặc Chrome: cửa sổ không thanh địa chỉ, không
    tab, có icon riêng trên taskbar - nhìn như app thật. Đây là cách đạt được kết quả gần
    nhất với bản macOS mà không phải nhúng WebView2 và kéo theo .NET.
  - Đóng cửa sổ thì server tắt theo, đúng như bấm Cmd+Q ở bản macOS.

Người dùng bản .exe **không cần cài Python**: PyInstaller đã gói sẵn runtime.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aimon import instance as INST  # noqa: E402
from aimon import server  # noqa: E402

PROFILE = os.path.join(tempfile.gettempdir(), "aimon-window")


def find_browser() -> str | None:
    """Tìm Edge rồi tới Chrome. Ưu tiên Edge vì Windows 10/11 luôn có sẵn."""
    roots = [
        os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"),
        os.environ.get("PROGRAMFILES", r"C:\Program Files"),
        os.environ.get("LOCALAPPDATA", ""),
    ]
    rels = [
        r"Microsoft\Edge\Application\msedge.exe",
        r"Google\Chrome\Application\chrome.exe",
    ]
    for rel in rels:
        for root in roots:
            if not root:
                continue
            path = os.path.join(root, rel)
            if os.path.isfile(path):
                return path
    return None


def open_window(url: str) -> subprocess.Popen | None:
    """Mở cửa sổ app. Không có Edge/Chrome thì đành mở browser mặc định."""
    browser = find_browser()
    if not browser:
        import webbrowser

        webbrowser.open(url)
        return None
    # user-data-dir riêng để cửa sổ này độc lập với phiên duyệt web của người dùng:
    # không dùng chung cookie, và đóng nó không đụng tới các cửa sổ browser đang mở.
    return subprocess.Popen(
        [browser, f"--app={url}", f"--user-data-dir={PROFILE}", "--window-size=1440,920"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def watch() -> None:
    """Chờ server bind xong => mở cửa sổ => cửa sổ đóng thì tắt luôn server."""
    for _ in range(150):  # tối đa 30 giây
        time.sleep(0.2)
        info = INST.read()
        url = (info or {}).get("url")
        if not url:
            continue
        proc = open_window(url)
        if proc is not None:
            proc.wait()
            INST.clear()   # dọn state trước khi thoát, không để lại rác như khi bị kill
            os._exit(0)
        return


class _Null:
    """Bản .exe dựng với --noconsole không có stdout: `print()` sẽ nổ AttributeError.

    Server in URL ra stdout ở nhiều chỗ, nên phải có chỗ cho nó đổ vào.
    """

    def write(self, *_a):
        return 0

    def flush(self):
        pass


def main() -> int:
    if sys.stdout is None:
        sys.stdout = _Null()
    if sys.stderr is None:
        sys.stderr = _Null()

    argv = [a for a in sys.argv[1:] if a != "--no-window"]
    # --no-window: chỉ chạy server, không mở cửa sổ (dùng khi CI kiểm tra tự động)
    if "--no-window" not in sys.argv[1:]:
        # server.main() chặn luồng chính, nên việc mở/theo dõi cửa sổ chạy ở luồng nền.
        threading.Thread(target=watch, daemon=True).start()
    return server.main(argv)


def _run() -> int:
    """Bọc main() để lỗi lúc khởi động còn để lại dấu vết.

    Bản --noconsole không có cửa sổ nào hiện traceback: app cứ thế tắt ngóm, người dùng
    lẫn CI đều không biết vì sao. Ghi ra file để còn đọc được.
    """
    try:
        return main()
    except BaseException:
        import traceback

        try:
            log = os.path.join(tempfile.gettempdir(), "aimon-startup-error.log")
            with open(log, "w", encoding="utf-8") as f:
                traceback.print_exc(file=f)
        except OSError:
            pass
        raise


if __name__ == "__main__":
    raise SystemExit(_run())
