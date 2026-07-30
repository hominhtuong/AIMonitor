#!/usr/bin/env bash
# Dựng bản phát hành cho macOS: ký bằng Developer ID => gửi Apple notarize => đóng dấu.
#
#   ./scripts/release_macos.sh
#
# Sau bước này người dùng tải .zip về, kéo vào Applications và mở bằng double-click, KHÔNG
# gặp cảnh báo nào. Chỉ notarize mới đạt được điều đó - ký không thôi vẫn bị Gatekeeper chặn
# với lý do "Unnotarized Developer ID".
#
# Chuẩn bị một lần (mật khẩu nằm trong Keychain, script không bao giờ thấy nó):
#
#   xcrun notarytool store-credentials aimon \
#     --apple-id "email-apple-developer" --team-id N4PUG34AC8
#
# Mật khẩu nó hỏi là app-specific password tạo ở appleid.apple.com, không phải mật khẩu
# Apple ID thường.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist"
APP="$OUT/AIMonitor.app"
ZIP="$OUT/AIMonitor-macos.zip"
PROFILE="${AIMON_NOTARY_PROFILE:-aimon}"

# Tự tìm chứng chỉ Developer ID trong keychain nếu chưa chỉ định
if [[ -z "${AIMON_SIGN_ID:-}" ]]; then
  AIMON_SIGN_ID="$(security find-identity -v -p codesigning 2>/dev/null \
    | grep -m1 'Developer ID Application' | sed -E 's/.*"(.*)"/\1/')" || true
fi
if [[ -z "$AIMON_SIGN_ID" ]]; then
  echo "Không tìm thấy chứng chỉ 'Developer ID Application' trong keychain." >&2
  echo "Kiểm tra bằng: security find-identity -v -p codesigning" >&2
  exit 1
fi
export AIMON_SIGN_ID

echo "== 1/4 Dựng và ký =="
"$ROOT/scripts/build_macos_app.sh" "$OUT"

echo
echo "== 2/4 Gửi Apple notarize (vài phút) =="
if ! xcrun notarytool store-credentials --help >/dev/null 2>&1; then
  echo "Máy chưa có notarytool - cần Xcode 13 trở lên." >&2
  exit 1
fi
ditto -c -k --keepParent "$APP" "$OUT/notarize.zip"
if ! xcrun notarytool submit "$OUT/notarize.zip" --keychain-profile "$PROFILE" --wait; then
  echo >&2
  echo "Notarize thất bại. Nếu lỗi là không tìm thấy profile '$PROFILE', chạy trước:" >&2
  echo "  xcrun notarytool store-credentials $PROFILE --apple-id \"<email>\" --team-id N4PUG34AC8" >&2
  echo "Xem chi tiết vì sao bị từ chối:" >&2
  echo "  xcrun notarytool log <submission-id> --keychain-profile $PROFILE" >&2
  exit 1
fi
rm -f "$OUT/notarize.zip"

echo
echo "== 3/4 Đóng dấu vào bundle =="
# Staple để máy offline cũng xác minh được, không phải hỏi server Apple mỗi lần mở
xcrun stapler staple "$APP"

echo
echo "== 4/4 Kiểm tra như máy người dùng =="
# Gắn cờ quarantine y như file tải từ browser rồi hỏi Gatekeeper
xattr -w com.apple.quarantine "0083;00000000;Safari;" "$APP"
if spctl -a -vv "$APP" 2>&1 | tee /dev/stderr | grep -q "accepted"; then
  echo
  echo "ĐẠT - máy người dùng mở thẳng, không cảnh báo."
else
  echo >&2
  echo "CHƯA ĐẠT - Gatekeeper vẫn chặn, đừng phát hành bản này." >&2
  exit 1
fi
xattr -d com.apple.quarantine "$APP" 2>/dev/null || true

ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
echo
echo "File phát hành: $ZIP"
