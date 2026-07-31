const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const aimonSrc = path.join(repoRoot, 'aimon');
const aimonDest = path.join(__dirname, '..', 'aimon');

// Lọc __pycache__ / *.pyc: ai chạy `python3 -m compileall aimon` (bước kiểm tra trước khi
// commit trong CLAUDE.md) là thư mục gốc có bytecode, copy nguyên si thì VSIX phình gấp đôi
// và mang theo .pyc biên dịch cho đúng phiên bản Python của máy build - vô dụng ở máy người
// dùng vì Python đối chiếu magic number rồi bỏ qua.
function keep(src) {
  const name = path.basename(src);
  return name !== '__pycache__' && !name.endsWith('.pyc');
}

fs.rmSync(aimonDest, { recursive: true, force: true });
fs.cpSync(aimonSrc, aimonDest, { recursive: true, filter: keep });
console.log(`copied ${aimonSrc} -> ${aimonDest}`);

// Icon activity bar PHẢI đơn sắc, không nền tô đầy: VSCode render icon này bằng cách mask
// theo kênh alpha (bỏ màu, chỉ giữ vùng không-trong-suốt làm silhouette). favicon.svg gốc có
// nền hình chữ nhật bo góc tô đầy màu, gần kín khung 64x64 - mask ra sẽ chỉ còn 1 khối vuông
// đặc, không phải hình đường nhịp. Vẽ lại đúng path đường nhịp + chấm tròn từ favicon.svg,
// bỏ nền, để mask ra đúng hình.
const ACTIVITY_BAR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <path d="M9 40h9l6-19 7 25 6-14h6" fill="none" stroke="#000000" stroke-width="4.5"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="50" cy="32" r="5.5" fill="#000000"/>
</svg>
`;
const mediaDir = path.join(__dirname, '..', 'media');
fs.mkdirSync(mediaDir, { recursive: true });
fs.writeFileSync(path.join(mediaDir, 'icon.svg'), ACTIVITY_BAR_ICON);
console.log(`wrote monochrome activity-bar icon -> ${path.join(mediaDir, 'icon.svg')}`);

// Icon marketplace/Extensions panel (package.json "icon") PHẢI là PNG vuông, giữ nguyên màu.
// Marketplace đòi tối thiểu 128x128 nhưng trang chi tiết phóng to và màn hình retina nhân
// đôi, nên dùng thẳng assets/icon.png (512x512) - cùng logo với app macOS và .exe Windows.
const galleryIconSrc = path.join(repoRoot, 'assets', 'icon.png');
const imagesDir = path.join(__dirname, '..', 'images');
fs.mkdirSync(imagesDir, { recursive: true });
fs.copyFileSync(galleryIconSrc, path.join(imagesDir, 'icon.png'));
console.log(`copied ${galleryIconSrc} -> ${path.join(imagesDir, 'icon.png')}`);

// pricing.json nằm ở ROOT repo, không nằm trong aimon/. aimon/collectors/claude.py tìm nó
// ở thư mục CHA của aimon/ (dirname(dirname(dirname(__file__)))) - dưới extension, đó là
// vscode-extension/, nên phải copy sang đó (ngang hàng với vscode-extension/aimon/).
const pricingSrc = path.join(repoRoot, 'pricing.json');
const pricingDest = path.join(__dirname, '..', 'pricing.json');
fs.copyFileSync(pricingSrc, pricingDest);
console.log(`copied ${pricingSrc} -> ${pricingDest}`);

// Marketplace hiện tab "License" lấy từ file LICENSE trong gói. Không có thì vsce cảnh báo
// và trang extension ghi "No license" - dùng chung LICENSE (MIT) ở gốc repo.
const licenseSrc = path.join(repoRoot, 'LICENSE');
const licenseDest = path.join(__dirname, '..', 'LICENSE');
fs.copyFileSync(licenseSrc, licenseDest);
console.log(`copied ${licenseSrc} -> ${licenseDest}`);
