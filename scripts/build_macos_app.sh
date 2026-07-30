#!/usr/bin/env bash
# Dựng AIMonitor.app - app macOS độc lập, không phụ thuộc browser.
#
#   ./scripts/build_macos_app.sh [thư-mục-đích]
#
# Mặc định xuất ra build/. scripts/install_macos.sh gọi script này rồi cài vào /Applications;
# GitHub Actions cũng gọi đúng script này để đóng gói bản tải về.
#
# Ba điều bắt buộc, đã trả giá để biết:
#
#   1. Phải có binary Mach-O thật. Bundle chỉ chứa script thì macOS không xác định được kiến
#      trúc, chạy nó dưới Rosetta và hiện hộp thoại đòi cài Rosetta.
#   2. Code phải nằm trong Contents/Resources. App mở từ Finder không được đọc ~/Documents
#      (TCC), nên nếu nó phải đọc repo trong ~/Documents thì chết với PermissionError.
#   3. Binary nên là universal (arm64 + x86_64) để máy Intel dùng được bản tải về.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/build}"
NAME="AIMonitor"
VERSION="$(grep -m1 '^VERSION' "$ROOT/aimon/server.py" | cut -d'"' -f2)"
APP="$OUT/$NAME.app"
ICNS="$ROOT/assets/$NAME.icns"

[[ -f "$ICNS" ]] || python3 "$ROOT/scripts/make_icons.py" >/dev/null

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# --- code chạy: copy vào bundle, app chỉ đọc chính nó ---------------------------
cp -R "$ROOT/aimon" "$APP/Contents/Resources/"
cp "$ROOT/pricing.json" "$APP/Contents/Resources/"
find "$APP/Contents/Resources" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
cp "$ICNS" "$APP/Contents/Resources/$NAME.icns"

# --- vỏ app: biên dịch WKWebView shell -----------------------------------------
SWIFTC="$(xcrun --find swiftc 2>/dev/null || command -v swiftc || true)"
# Cross-compile bắt buộc chỉ rõ SDK, không có thì swiftc báo "unable to load standard library"
SDK="$(xcrun --show-sdk-path --sdk macosx 2>/dev/null || true)"
NATIVE=0
if [[ -n "$SWIFTC" && -n "$SDK" ]]; then
  echo "Biên dịch vỏ app bằng swiftc..."
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  SLICES=()
  for arch in arm64 x86_64; do
    if "$SWIFTC" -O -sdk "$SDK" -target "${arch}-apple-macos11.0" \
         -o "$TMP/$NAME.$arch" "$ROOT/mac/$NAME.swift" 2>"$TMP/err.$arch"; then
      SLICES+=("$TMP/$NAME.$arch")
    else
      echo "  bỏ qua $arch: $(tail -1 "$TMP/err.$arch")"
    fi
  done
  if [[ ${#SLICES[@]} -gt 0 ]]; then
    lipo -create "${SLICES[@]}" -output "$APP/Contents/MacOS/$NAME"
    chmod +x "$APP/Contents/MacOS/$NAME"
    NATIVE=1
    echo "  kiến trúc: $(lipo -archs "$APP/Contents/MacOS/$NAME")"
  fi
fi

if [[ "$NATIVE" -eq 0 ]]; then
  # Không có swiftc (máy chưa cài Xcode Command Line Tools): lùi về launcher script,
  # dashboard mở bằng browser mặc định. Vẫn chạy được, chỉ là không có cửa sổ riêng.
  echo "Không tìm thấy swiftc => dùng bản mở bằng browser."
  cat > "$APP/Contents/MacOS/$NAME" <<'LAUNCHER'
#!/bin/sh
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
for p in /usr/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
  [ -x "$p" ] && PY="$p" && break
done
[ -z "${PY:-}" ] && PY="$(command -v python3 2>/dev/null)"
if [ -z "$PY" ]; then
  osascript -e 'display alert "AI Monitor" message "Máy chưa có Python 3. Cài từ python.org rồi mở lại app."'
  exit 1
fi
cd "$RES" || exit 1
exec "$PY" -m aimon.server --open
LAUNCHER
  chmod +x "$APP/Contents/MacOS/$NAME"
fi

# --- Info.plist ----------------------------------------------------------------
# LSUIElement chỉ bật ở bản script (server chạy nền, giao diện là tab browser nên không
# cần icon Dock). Bản native có cửa sổ thật => phải có icon Dock và Cmd+Q.
UIELEMENT=""
[[ "$NATIVE" -eq 0 ]] && UIELEMENT="  <key>LSUIElement</key><true/>"

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
  <key>CFBundleExecutable</key><string>${NAME}</string>
  <key>CFBundleIconFile</key><string>${NAME}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSRequiresNativeExecution</key><true/>
  <key>LSArchitecturePriority</key>
  <array><string>arm64</string><string>x86_64</string></array>
${UIELEMENT}
</dict>
</plist>
PLIST

xattr -cr "$APP" 2>/dev/null || true

# --- ký ---------------------------------------------------------------------
# Luôn phải ký, kể cả ad-hoc: `lipo -create` xoá chữ ký của từng lát, để nguyên thì bundle
# không seal resources, Info.plist không bind, và macOS có thể báo app "bị hỏng".
#
# AIMON_SIGN_ID="Developer ID Application: Tên (TEAMID)" => ký thật, qua được Gatekeeper
# sau khi notarize. Không đặt => ad-hoc: bundle toàn vẹn nhưng Gatekeeper vẫn chặn bản tải
# về (không có tổ chức nào bảo chứng), người dùng phải mở tay lần đầu.
SIGN_ID="${AIMON_SIGN_ID:-}"
if [[ -n "$SIGN_ID" ]]; then
  echo "Ký bằng: $SIGN_ID"
  codesign --force --deep --sign "$SIGN_ID" \
           --identifier io.aimonitor.app --options runtime --timestamp "$APP"
else
  echo "Chưa có AIMON_SIGN_ID => ký ad-hoc."
  codesign --force --deep --sign - \
           --identifier io.aimonitor.app --options runtime --timestamp=none "$APP"
fi
codesign --verify --strict "$APP" || { echo "Chữ ký không hợp lệ" >&2; exit 1; }

touch "$APP"

echo "Đã tạo: $APP"
[[ "$NATIVE" -eq 1 ]] && echo "Dạng: app native, có cửa sổ riêng" || echo "Dạng: mở bằng browser"
