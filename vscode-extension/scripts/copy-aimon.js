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
