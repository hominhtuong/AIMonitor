#!/usr/bin/env bash
# Chạy AI Monitor (macOS / Linux). Mặc định http://127.0.0.1:8899
# Cổng 8899 bận thì tự chuyển sang cổng trống kế tiếp; nếu AI Monitor đang chạy rồi
# thì chỉ mở lại tab cũ. URL thật luôn được in ra ở dòng cuối.
set -euo pipefail
cd "$(dirname "$0")"

PY="$(command -v python3 || command -v python || true)"
if [[ -z "$PY" ]]; then
  echo "Chưa có Python 3 trên máy. Cài từ https://www.python.org/downloads/ rồi chạy lại." >&2
  exit 1
fi

exec "$PY" -m aimon.server --open "$@"
