const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const aimonSrc = path.join(repoRoot, 'aimon');
const aimonDest = path.join(__dirname, '..', 'aimon');

fs.rmSync(aimonDest, { recursive: true, force: true });
fs.cpSync(aimonSrc, aimonDest, { recursive: true });
console.log(`copied ${aimonSrc} -> ${aimonDest}`);

const iconSrc = path.join(repoRoot, 'aimon', 'static', 'favicon.svg');
const mediaDir = path.join(__dirname, '..', 'media');
fs.mkdirSync(mediaDir, { recursive: true });
fs.copyFileSync(iconSrc, path.join(mediaDir, 'icon.svg'));
console.log(`copied ${iconSrc} -> ${path.join(mediaDir, 'icon.svg')}`);

// pricing.json nằm ở ROOT repo, không nằm trong aimon/. aimon/collectors/claude.py tìm nó
// ở thư mục CHA của aimon/ (dirname(dirname(dirname(__file__)))) - dưới extension, đó là
// vscode-extension/, nên phải copy sang đó (ngang hàng với vscode-extension/aimon/).
const pricingSrc = path.join(repoRoot, 'pricing.json');
const pricingDest = path.join(__dirname, '..', 'pricing.json');
fs.copyFileSync(pricingSrc, pricingDest);
console.log(`copied ${pricingSrc} -> ${pricingDest}`);
