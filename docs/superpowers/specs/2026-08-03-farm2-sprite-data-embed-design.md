# Farm2 Sprite Data-Embed Design

## Goal

Replace procedural farmer drawing in `sprites-farm.js` with pixel data from the user's ChatGPT-generated sprite sheet. Maintain 27-frame animation and 10-farmer color differentiation.

## Scope

- **In scope:** 48 player sprites (12 actions × 4 directions), data-embed format, atlas integration, 10-farmer recoloring
- **Out of scope:** Animals, tilesets, buildings (future work)

## Source Image

- File: `~/Downloads/ChatGPT Image 08_58_59 3 thg 8, 2026.png` (1536×1024, opaque PNG)
- Sprite size: 8×8 pixels per sprite (needs 2× scale to reach 16×16 game resolution)
- Grid positions verified:
  - 12 columns (x centers): [87, 158, 226, 296, 366, 436, 502, 566, 632, 691, 768, 838]
  - 4 rows (y centers): [110 (DOWN), 178 (LEFT), 245 (RIGHT), 313 (UP)]
  - Each sprite occupies 8×8 px centered in its cluster

## Action Mapping

| Sprite Index | Action    | Game Frames         | Animation Method           |
|-------------|-----------|---------------------|----------------------------|
| 0           | IDLE      | d0, blink           | blink = modify 2 eye pixels |
| 1           | WALK      | d0, d1, d2          | shift 0, +1, -1 px Y       |
| 2           | RUN       | (unused currently)  | —                          |
| 3           | HOE       | hoeA, hoeB          | A = original, B = shift +2 |
| 4           | WATER     | waterA, waterB      | A = original, B = shift +1 |
| 5           | PLANT     | plantA, plantB      | A = original, B = shift +1 |
| 6           | HARVEST   | harvestA, harvestB  | A = original, B = shift -1 |
| 7           | AXE       | axeA, axeB          | A = original, B = shift +2 |
| 8           | PICKAXE   | axeA, axeB (reuse)   | Same as AXE — sprite sheet pickaxe visually similar |
| 9           | FISHING   | fishA, fishB        | A = original, B = shift +1 |
| 10          | INTERACT  | interactA, interactB| A = original, B = shift +1 |
| 11          | CARRY     | carryA, carryB      | A = original, B = shift -1 |

UP direction frames (u0/u1/u2) use UP row sprites with same shift logic.
LEFT/RIGHT frames (s0/s1/s2) use LEFT/RIGHT row sprites with same shift logic.
kUp = UP IDLE sprite (back view, sitting).

## Data Format

```javascript
// Background color to treat as transparent
const FARM_BG_COLOR = [248, 242, 232];

// 4 directions × 12 actions × 8 rows × 8 cols × [r, g, b]
// Total: 48 sprites × 64 pixels × 3 bytes ≈ 9KB
const FARM_SPRITE_DATA = {
  down: [
    // [0] IDLE: 8 rows, each row = 8 [r,g,b] tuples
    [
      [[190,150,80],[185,145,75], ...], // row 0
      [[180,140,70], ...],              // row 1
      ...                                // rows 2-7
    ],
    // [1] WALK
    [...],
    // [2] RUN
    [...],
    // ... through [11] CARRY
  ],
  left:  [/* same structure */],
  right: [/* same structure */],
  up:    [/* same structure */],
};
```

## Background Handling

The sprite sheet has opaque beige background (248, 242, 232). When drawing to atlas:
- Skip pixels where `abs(r-248) < 5 && abs(g-242) < 5 && abs(b-232) < 5`
- This creates transparency without alpha channel

## 10-Farmer Recoloring

Each farmer has unique hat/shirt/pants colors (defined in existing `FARMER_CHARS`). Recolor by replacing color ranges in the sprite data:

### Color Detection Ranges

| Region | Source Color Range (RGB) | Replace With |
|--------|-------------------------|--------------|
| Hat    | R:150-210, G:120-180, B:50-110 | `farmer.hat` |
| Shirt  | Varies per sprite (blue/green/etc.) | `farmer.shirt` |
| Pants  | R:30-80, G:40-90, B:80-140 | `farmer.pants` |
| Skin   | R:170-210, G:120-160, B:80-130 | Keep original |
| Boots  | R:60-100, G:40-80, B:30-70 | Keep original |

### Recolor Algorithm

For each farmer × sprite:
1. Read original 8×8 pixel data
2. For each pixel, check color range membership
3. If in hat/shirt/pants range:
   - Compute brightness factor: `L = 0.299*R + 0.587*G + 0.114*B` of original pixel
   - Compute base brightness: `L0 = 0.299*R0 + 0.587*G0 + 0.114*B0` where `(R0,G0,B0)` is the midpoint of the source color range
   - Apply ratio: `final = palette_color × (L / L0)`, clamped to [0,255]
   - This preserves highlights/shadows from the original sprite while changing the base hue
4. Write recolored pixels to atlas cell

## Atlas Integration

### Layout (unchanged)
- Grid: 35 columns × 14 rows
- SPRITE_SS_FARM = 4 (4× subgrid)
- Atlas size: 1400 × 560 px (before scale)
- Farmer frames: columns 0-26 (27 frames × 10 farmers = 270 cells, wraps to row 2+)

### Modified `buildSpriteAtlas()`

```
For each farmer (0-9):
  For each frame key (d0, d1, ..., kUp):
    1. Look up frame → (direction, action_index, shift)
    2. Read FARM_SPRITE_DATA[direction][action_index]
    3. Apply shift (vertical pixel translation)
    4. Apply farmer recoloring
    5. Draw 8×8 pixels at 4× scale into atlas cell
```

### Removed Functions

The following procedural functions are replaced by data-embed and deleted:
- `farmHead()` — head drawing
- `farmBody()` — torso + arms
- `farmLegs()` — legs + boots
- `farmAcc()` — accessories (hat details)
- `pxF()` — replaced by direct atlas pixel writing
- `roundBoxF()` — no longer needed (sprite data has rounded shapes)
- `spikeF()` — no longer needed
- `eyeF()` — no longer needed

Kept: `FRAME_INDEX_FARM`, `FARMER_CHARS`, `FRAME_ANIMAL_FARM`, `ANIMAL_SPECIES`

## File Changes

| File | Change |
|------|--------|
| `aimon/static/sprites-farm.js` | Add `FARM_SPRITE_DATA` (~9KB), add `FARM_BG_COLOR`, modify `buildSpriteAtlas()`, remove procedural functions |
| No new files | — |
| No packaging changes | Data lives in JS, no external assets |

## Verification

1. `python3 -m compileall -q aimon` — Python syntax (no changes)
2. `find aimon/static -name "*.js" -exec node --check {} \;` — JS syntax
3. Open dashboard → Văn phòng tab → farm scene → verify:
   - 10 farmers visible with distinct colors
   - Walk animation smooth (3-frame cycle)
   - Tool animations (hoe, water, etc.) show 2-beat motion
   - Sprite style matches ChatGPT reference (straw hat, overalls, proportions)
4. `cd vscode-extension && npm test` — TypeScript still passes
