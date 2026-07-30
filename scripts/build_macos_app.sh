#!/usr/bin/env bash
# Đóng gói AI Monitor thành AIMonitor.app (macOS) - có icon, mở bằng double-click.
# App chỉ là vỏ bọc gọi python3 trong repo, nên nhẹ và luôn chạy code mới nhất.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/build/AIMonitor.app"
ICNS="$ROOT/assets/AIMonitor.icns"
VERSION="$(grep -m1 '^VERSION' "$ROOT/aimon/server.py" | cut -d'"' -f2)"

if [[ ! -f "$ICNS" ]]; then
  echo "Chưa có $ICNS - đang sinh logo..."
  python3 "$ROOT/scripts/make_icons.py" >/dev/null
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$ICNS" "$APP/Contents/Resources/AIMonitor.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>AI Monitor</string>
  <key>CFBundleDisplayName</key><string>AI Monitor</string>
  <key>CFBundleIdentifier</key><string>io.aimonitor.app</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleExecutable</key><string>AIMonitor</string>
  <key>CFBundleIconFile</key><string>AIMonitor</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

cat > "$APP/Contents/MacOS/AIMonitor" <<'LAUNCHER'
#!/usr/bin/env bash
# build/AIMonitor.app/Contents/MacOS/AIMonitor => lùi 4 cấp là gốc repo
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
PY="$(command -v python3 || command -v python)"
if [[ -z "$PY" ]]; then
  osascript -e 'display alert "AI Monitor" message "Máy chưa có Python 3. Cài từ python.org rồi mở lại."'
  exit 1
fi
exec "$PY" -m aimon.server --open
LAUNCHER
chmod +x "$APP/Contents/MacOS/AIMonitor"

# Xoá cờ quarantine để mở không bị Gatekeeper hỏi (app tự build, chưa ký)
xattr -cr "$APP" 2>/dev/null || true
touch "$APP"

echo "Đã tạo: $APP"
echo "Mở thử:  open \"$APP\""
echo "Kéo vào /Applications hoặc Dock nếu muốn dùng thường xuyên."
