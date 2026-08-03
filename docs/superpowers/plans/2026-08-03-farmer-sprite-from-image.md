# Farmer Sprite from Image - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace code-drawn farmer sprites (pxF) with image-based sprite sheets (PNG) for all 10 farm characters.

**Architecture:** Each farmer gets a 192x192 PNG sprite sheet (12 columns x 4 rows of 16x16 frames). A recolor script generates 10 variants from the reference screenshot. `sprites-farm.js` loads PNGs into ImageBitmap and builds atlas from them instead of drawing with pxF(). Scene-farm-v2.js maps legacy frame keys to the new v2 keys.

**Tech Stack:** JavaScript (browser), Node.js (recolor script), canvas API, ImageBitmap

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `scripts/recolor-farmer.js` | Create | Recolor screenshot into 10 farmer PNGs |
| `aimon/static/farm-sprites/farmer0.png` .. `farmer9.png` | Create | 10 sprite sheets |
| `aimon/static/sprites-farm.js` | Modify | Replace pxF drawing with PNG loading |
| `aimon/static/office.js:435-440` | Modify | `ensureAtlasFarm()` call async load |
| `aimon/static/scene-farm-v2.js:131-146` | Modify | Map frame keys to v2 format |

---

## Task 1: Create recolor script

**Files:**
- Create: `scripts/recolor-farmer.js`

- [ ] **Step 1: Create the recolor script**

```js
#!/usr/bin/env node
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const FARMERS = [
  { id: 0, hat: [0xd9,0xb2,0x6a], shirt: [0x4a,0x90,0xd9], pants: [0x2f,0x4a,0x6b] },
  { id: 1, hat: [0xc9,0xa0,0x52], shirt: [0xe0,0x5a,0x4e], pants: [0x3d,0x3a,0x50] },
  { id: 2, hat: [0xe0,0xc0,0x80], shirt: [0x6a,0xa8,0x4f], pants: [0x4a,0x3d,0x2b] },
  { id: 3, hat: [0xb8,0x90,0x4a], shirt: [0xf0,0xa8,0x4f], pants: [0x37,0x47,0x4f] },
  { id: 4, hat: [0xd9,0xb2,0x6a], shirt: [0x9b,0x59,0xb6], pants: [0x2c,0x3e,0x50] },
  { id: 5, hat: [0xc9,0xa0,0x52], shirt: [0x4f,0xb3,0xc7], pants: [0x4e,0x34,0x2e] },
  { id: 6, hat: [0xe0,0xc0,0x80], shirt: [0x8d,0x6e,0x63], pants: [0x26,0x32,0x38] },
  { id: 7, hat: [0xb8,0x90,0x4a], shirt: [0xe8,0xc5,0x47], pants: [0x45,0x5a,0x64] },
  { id: 8, hat: [0xd9,0xb2,0x6a], shirt: [0x7c,0xb3,0x42], pants: [0x5d,0x40,0x37] },
  { id: 9, hat: [0xc9,0xa0,0x52], shirt: [0xec,0x40,0x7a], pants: [0x3e,0x27,0x23] },
];

const SRC_HAT  = [0xd9, 0xb2, 0x6a];
const SRC_SHIRT = [0xe0, 0x5a, 0x4e];
const SRC_PANTS = [0x2f, 0x4a, 0x6b];
const FRAME_W = 16, FRAME_H = 16, COLS = 12, ROWS = 4;
const TOLERANCE = 40;

function colorMatch(a, b, tol) {
  return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]) < tol;
}

function recolorPixel(r, g, b, target, src) {
  if (colorMatch([r, g, b], src, TOLERANCE)) {
    const lum = (r + g + b) / 3;
    const tLum = (target[0] + target[1] + target[2]) / 3;
    const scale = tLum > 0 ? lum / tLum : 1;
    return [
      Math.min(255, Math.round(target[0] * scale)),
      Math.min(255, Math.round(target[1] * scale)),
      Math.min(255, Math.round(target[2] * scale)),
    ];
  }
  return [r, g, b];
}

async function main() {
  const [,, input, outDir] = process.argv;
  if (!input || !outDir) {
    console.error('Usage: node recolor-farmer.js <input.png> <output-dir>');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const img = await loadImage(input);
  const tmpCanvas = createCanvas(img.width, img.height);
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(img, 0, 0);
  const srcData = tmpCtx.getImageData(0, 0, img.width, img.height).data;

  let offsetX = 0, offsetY = 0;
  for (let x = 0; x < img.width; x++) {
    for (let y = 0; y < img.height; y++) {
      const i = (y * img.width + x) * 4;
      if (srcData[i] < 240 || srcData[i+1] < 240 || srcData[i+2] < 240) { offsetX = x; break; }
    }
    if (offsetX) break;
  }
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (srcData[i] < 240 || srcData[i+1] < 240 || srcData[i+2] < 240) { offsetY = y; break; }
    }
    if (offsetY) break;
  }
  console.log(`Grid offset: (${offsetX}, ${offsetY})`);

  for (const farmer of FARMERS) {
    const outCanvas = createCanvas(COLS * FRAME_W, ROWS * FRAME_H);
    const outCtx = outCanvas.getContext('2d');
    const outData = outCtx.getImageData(0, 0, COLS * FRAME_W, ROWS * FRAME_H);
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        for (let py = 0; py < FRAME_H; py++) {
          for (let px = 0; px < FRAME_W; px++) {
            const srcX = offsetX + col * FRAME_W + px;
            const srcY = offsetY + row * FRAME_H + py;
            const si = (srcY * img.width + srcX) * 4;
            const di = (row * FRAME_H + py) * COLS * FRAME_W + (col * FRAME_W + px);
            let [r, g, b] = [srcData[si], srcData[si+1], srcData[si+2]];
            [r, g, b] = recolorPixel(r, g, b, farmer.hat, SRC_HAT);
            [r, g, b] = recolorPixel(r, g, b, farmer.shirt, SRC_SHIRT);
            [r, g, b] = recolorPixel(r, g, b, farmer.pants, SRC_PANTS);
            outData.data[di*4] = r; outData.data[di*4+1] = g;
            outData.data[di*4+2] = b; outData.data[di*4+3] = srcData[si+3];
          }
        }
      }
    }
    outCtx.putImageData(outData, 0, 0);
    const buf = outCanvas.toBuffer('image/png');
    const outFile = path.join(outDir, `farmer${farmer.id}.png`);
    fs.writeFileSync(outFile, buf);
    console.log(`Wrote ${outFile} (${buf.length} bytes)`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Install canvas dependency and test**

```bash
npm install canvas --no-save
node scripts/recolor-farmer.js "/Users/phamhuuphuoc/Desktop/Ảnh màn hình 2026-08-03 lúc 10.23.38.png" /tmp/test-farm-sprites
```
Expected: 10 PNG files in `/tmp/test-farm-sprites/`

- [ ] **Step 3: Commit**

```bash
git add scripts/recolor-farmer.js
git commit -m "feat: add farmer sprite recolor script"
```

---

## Task 2: Generate sprite sheets

**Files:**
- Create: `aimon/static/farm-sprites/farmer0.png` .. `farmer9.png`

- [ ] **Step 1: Run recolor script**

```bash
node scripts/recolor-farmer.js "/Users/phamhuuphuoc/Desktop/Ảnh màn hình 2026-08-03 lúc 10.23.38.png" aimon/static/farm-sprites/
```

- [ ] **Step 2: Verify files exist**

```bash
ls -la aimon/static/farm-sprites/
```

- [ ] **Step 3: Commit**

```bash
git add aimon/static/farm-sprites/
git commit -m "feat: add 10 farmer sprite sheets (PNG)"
```

---

## Task 3: Add PNG loading to sprites-farm.js

**Files:**
- Modify: `aimon/static/sprites-farm.js` (add after FARMER_CHARS array ~line 108)

- [ ] **Step 1: Add FARM_SPRITE_SHEETS cache and loadFarmSprites**

```js
const FARM_SPRITE_SHEETS = new Map();

async function loadFarmSprites() {
  if (FARM_SPRITE_SHEETS.size >= FARMER_CHARS.length) return;
  const loads = FARMER_CHARS.map(async (_, i) => {
    if (FARM_SPRITE_SHEETS.has(i)) return;
    try {
      const url = `static/farm-sprites/farmer${i}.png?t=${Date.now()}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      FARM_SPRITE_SHEETS.set(i, await createImageBitmap(blob));
    } catch (e) { console.warn(`Failed to load farm sprite ${i}:`, e); }
  });
  await Promise.all(loads);
}
```

- [ ] **Step 2: Add LEGACY_TO_V2 frame key mapping**

```js
const LEGACY_TO_V2 = {
  d0: 'd_idle', d1: 'd_walk1', d2: 'd_walk2',
  u0: 'u_idle', u1: 'u_walk1', u2: 'u_walk2',
  s0: 'r_idle', s1: 'r_walk1', s2: 'r_walk2',
  hoeA: 'r_hoe', hoeB: 'r_hoe', plantA: 'r_plant', plantB: 'r_plant',
  harvestA: 'r_harvest', harvestB: 'r_harvest', axeA: 'r_axe', axeB: 'r_axe',
  waterA: 'r_water', waterB: 'r_water', fishA: 'r_fish', fishB: 'r_fish',
  interactA: 'r_interact', interactB: 'r_interact',
  carryA: 'r_carry', carryB: 'r_carry',
  blink: 'd_idle', kUp: 'u_idle',
};

const FARM_FRAME_KEYS_V2 = [
  'd_idle','d_walk1','d_walk2','d_hoe','d_water','d_plant',
  'd_harvest','d_axe','d_pickaxe','d_fish','d_interact','d_carry',
  'l_idle','l_walk1','l_walk2','l_hoe','l_water','l_plant',
  'l_harvest','l_axe','l_pickaxe','l_fish','l_interact','l_carry',
  'r_idle','r_walk1','r_walk2','r_hoe','r_water','r_plant',
  'r_harvest','r_axe','r_pickaxe','r_fish','r_interact','r_carry',
  'u_idle','u_walk1','u_walk2','u_hoe','u_water','u_plant',
  'u_harvest','u_axe','u_pickaxe','u_fish','u_interact','u_carry',
];
const FARM_FRAME_INDEX_V2 = {};
FARM_FRAME_KEYS_V2.forEach((k, i) => { FARM_FRAME_INDEX_V2[k] = i; });
```

- [ ] **Step 3: Add buildAtlas_farm_v2 function**

```js
function buildAtlas_farm_v2(want) {
  const S = SPRITE_SS_FARM;
  const COLS_V2 = 12;
  const farmerRows = FARMER_CHARS.length;
  const animalRows = ANIMAL_SPECIES.length;
  const rows = farmerRows + animalRows;
  const cols = Math.max(COLS_V2, 35);
  const cw = (SPRITE_W_FARM + 2) * S;
  const ch = (SPRITE_H_FARM + 2) * S;
  const perCol = Math.max(1, Math.floor(4096 / ch));
  const groups = Math.ceil(rows / perCol);
  const cv = document.createElement('canvas');
  cv.width = cols * cw * groups;
  cv.height = Math.min(rows, perCol) * ch;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  const originOf = (r, c) => [Math.floor(r / perCol) * cols * cw + c * cw, (r % perCol) * ch];
  const cells = [];

  for (let idx = 0; idx < farmerRows; idx++) {
    const bmp = FARM_SPRITE_SHEETS.get(idx);
    if (!bmp) continue;
    const r = idx;
    for (let col = 0; col < COLS_V2; col++) {
      const [ox, oy] = originOf(r, col);
      g.save();
      g.translate(ox + S, oy + S);
      g.drawImage(bmp, col * FRAME_W, 2 * FRAME_H, FRAME_W, FRAME_H, -1, -1, FRAME_W, FRAME_H);
      g.restore();
      cells.push([ox, oy, true]);
    }
  }

  ANIMAL_SPECIES.forEach((sp, idx) => {
    const r = farmerRows + idx;
    const tone = ANIMAL_TONES[sp];
    const drawFn = FARM_ANIMAL_CELL[sp];
    if (!drawFn) return;
    [0, 1].forEach((step) => {
      const col = FRAME_ANIMAL_FARM[sp + (step ? 'W1' : 'W0')];
      const [ox, oy] = originOf(r, col);
      g.save();
      g.translate(ox + S, oy + S);
      drawFn(g, tone, step);
      g.restore();
      cells.push([ox, oy, true]);
    });
  });

  const img = g.getImageData(0, 0, cv.width, cv.height);
  cells.forEach(([ox, oy, outline]) => finishCell(img.data, cv.width, ox, oy, cw, ch, outline));
  g.putImageData(img, 0, 0);

  return {
    canvas: cv, cols, rows,
    covers() { return true; },
    cell(charIndex, frameKey) {
      const v2Key = LEGACY_TO_V2[frameKey] || 'd_idle';
      const c = FARM_FRAME_INDEX_V2[v2Key] == null ? 0 : FARM_FRAME_INDEX_V2[v2Key];
      const r = ((Math.round(charIndex) % farmerRows) + farmerRows) % farmerRows;
      const [ox, oy] = originOf(r, c);
      return [ox, oy, cw, ch];
    },
    animalCell(species, frameKey) {
      const idx = ANIMAL_SPECIES.indexOf(species);
      if (idx < 0) return [0, 0, cw, ch];
      const r = farmerRows + idx;
      const c = FRAME_ANIMAL_FARM[frameKey] == null ? 0 : FRAME_ANIMAL_FARM[frameKey];
      const [ox, oy] = originOf(r, c);
      return [ox, oy, cw, ch];
    },
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add aimon/static/sprites-farm.js
git commit -m "feat: add PNG-based atlas builder for farmer sprites"
```

---

## Task 4: Update office.js to use async loading

**Files:**
- Modify: `aimon/static/office.js:435-440` (ensureAtlasFarm)

- [ ] **Step 1: Update ensureAtlasFarm to load PNGs first**

Change `ensureAtlasFarm()` from:
```js
function ensureAtlasFarm() {
  if (CS().id !== 'farm2') return;
  if (OF.atlasFarm) return;
  if (typeof buildAtlas_farm !== 'function') return;
  OF.atlasFarm = buildAtlas_farm(null);
  invalidate();
}
```

To:
```js
async function ensureAtlasFarm() {
  if (CS().id !== 'farm2') return;
  if (OF.atlasFarm) return;
  if (typeof buildAtlas_farm_v2 !== 'function') return;
  await loadFarmSprites();
  OF.atlasFarm = buildAtlas_farm_v2(null);
  invalidate();
}
```

- [ ] **Step 2: Commit**

```bash
git add aimon/static/office.js
git commit -m "feat: use PNG-based atlas for farm-v2 scene"
```

---

## Task 5: Update scene-farm-v2.js frame keys

**Files:**
- Modify: `aimon/static/scene-farm-v2.js:131-146` (f2FrameFor)

- [ ] **Step 1: Update f2FrameFor to use v2 frame keys**

The current `f2FrameFor` returns keys like `d0`, `d1`, `d2`, `kUp`, `blink`, `plantA`, etc. These are mapped through `LEGACY_TO_V2` in `cell()`. No change needed in `f2FrameFor` itself — the mapping happens in `buildAtlas_farm_v2.cell()`.

Verify by checking that `cell()` in `buildAtlas_farm_v2` correctly maps legacy keys via `LEGACY_TO_V2`.

- [ ] **Step 2: Commit (no-op if no changes needed)**

```bash
git status  # check if scene-farm-v2.js was modified
```

---

## Task 6: Update packaging

**Files:**
- Modify: `scripts/build_macos_app.sh` (if needed)
- Modify: `.github/workflows/build-vscode.yml` CI check

- [ ] **Step 1: Verify copy-aimon.js copies farm-sprites automatically**

`copy-aimon.js` copies `aimon/` recursively, so `aimon/static/farm-sprites/` is included. No change needed.

- [ ] **Step 2: Add CI check for farm-sprites**

Add to `build-vscode.yml` build job (after existing static checks):
```bash
test -d aimon/static/farm-sprites || { echo "farm-sprites missing"; exit 1; }
ls aimon/static/farm-sprites/farmer*.png | wc -l | grep -q 10 || { echo "need 10 farmer PNGs"; exit 1; }
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-vscode.yml
git commit -m "ci: verify farm-sprites directory in package"
```

---

## Task 7: Test end-to-end

**Files:** None (verification only)

- [ ] **Step 1: Run syntax checks**

```bash
python3 -m compileall -q aimon
find aimon/static -name "*.js" -exec node --check {} \;
```

- [ ] **Step 2: Manual test**

Open the app, switch to farm-v2 scene, verify:
- 10 farmers render with new sprite style
- Walking animations work (d_walk1/d_walk2)
- Tool animations work (hoe, water, plant, etc.)
- Animals still render correctly
- Theme switching works

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: farmer sprites from PNG image sheets"
```
