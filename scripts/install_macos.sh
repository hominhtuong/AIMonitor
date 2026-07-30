#!/usr/bin/env bash
# Cài AI Monitor vào /Applications rồi tự kiểm tra xem app có chạy thật không.
#
# Việc đóng gói nằm ở scripts/build_macos_app.sh (script này chỉ cài + kiểm tra), để
# GitHub Actions dùng chung đúng một đường build với máy local.
#
# Chạy lại script này mỗi khi cập nhật code để app dùng bản mới - code được copy vào trong
# bundle nên app không tự thấy thay đổi trong repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="AIMonitor"
VERSION="$(grep -m1 '^VERSION' "$ROOT/aimon/server.py" | cut -d'"' -f2)"
ICNS="$ROOT/assets/$NAME.icns"

# Đích cài: /Applications nếu ghi được, không thì ~/Applications
DEST="/Applications"
[[ -w "$DEST" ]] || DEST="$HOME/Applications"
mkdir -p "$DEST"
APP="$DEST/$NAME.app"

echo "Cài $NAME $VERSION vào $DEST"

if [[ ! -f "$ICNS" ]]; then
  echo "Chưa có icon, đang tạo..."
  python3 "$ROOT/scripts/make_icons.py" >/dev/null
fi

# ---------------------------------------------------------------- dựng bundle
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
"$ROOT/scripts/build_macos_app.sh" "$TMP"
BUILD="$TMP/$NAME.app"

# ---------------------------------------------------------------- cài đặt
if [[ -d "$APP" ]]; then
  echo "Gỡ bản cũ ở $APP"
  rm -rf "$APP"
fi
mv "$BUILD" "$APP"
xattr -cr "$APP" 2>/dev/null || true   # app tự build, chưa ký - bỏ cờ quarantine
touch "$APP"

# ---------------------------------------------------------------- tự kiểm tra
echo "Đang chạy thử app..."
pkill -f 'aimon.server' 2>/dev/null || true
sleep 1
rm -f "$HOME/.aimon/instance.json"
open "$APP"

URL=""
VER_JSON=""
for _ in $(seq 1 25); do
  sleep 0.6
  [[ -f "$HOME/.aimon/instance.json" ]] || continue
  URL="$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.aimon/instance.json')))['url'])" 2>/dev/null || true)"
  [[ -n "$URL" ]] || continue
  VER_JSON="$(curl -fsS -m 2 "$URL/api/version" 2>/dev/null || true)"
  [[ -n "$VER_JSON" ]] && break
  URL=""
done

if [[ -z "$URL" || -z "$VER_JSON" ]]; then
  echo
  echo "LỖI: app đã cài nhưng không tự chạy được." >&2
  echo "Xem log: log show --last 2m --predicate 'process == \"$NAME\"'" >&2
  exit 1
fi

# Server tự khai báo kiến trúc nó đang chạy (macOS không có `ps -o arch`).
ARCH="$(printf '%s' "$VER_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin).get('arch',''))" 2>/dev/null || true)"
echo
echo "OK - app chạy được. Dashboard: $URL"
if [[ "$ARCH" == "arm64" || "$ARCH" == "x86_64" && "$(uname -m)" == "x86_64" ]]; then
  echo "Kiến trúc: $ARCH - chạy native, không qua Rosetta."
elif [[ -n "$ARCH" ]]; then
  echo "CẢNH BÁO: app đang chạy kiến trúc $ARCH trên máy $(uname -m) - tức là qua Rosetta." >&2
fi
echo
echo "Từ giờ mở AI Monitor bằng Spotlight (Cmd+Space, gõ 'AI Monitor') hoặc từ Launchpad."
echo "Đóng bằng Cmd+Q như mọi app - server tắt theo."
