#!/usr/bin/env python3
"""Sinh logo AI Monitor ra PNG / ICO / ICNS - chỉ dùng Python stdlib.

Logo: khung bo góc gradient tím-indigo + đường nhịp (pulse) trắng + điểm xanh
"đang sống". Vẽ bằng signed distance function nên viền mượt, không cần thư viện.

Dùng:
    python3 scripts/make_icons.py            # sinh đủ assets/icon_*.png + icon.ico (+ .icns nếu ở macOS)
    python3 scripts/make_icons.py --sizes 64 # chỉ 1 cỡ, để thử nhanh
"""

from __future__ import annotations

import argparse
import math
import os
import shutil
import struct
import subprocess
import sys
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

SIZES = [16, 32, 64, 128, 256, 512, 1024]
ICO_SIZES = [16, 32, 48, 64, 128, 256]

BG_TOP = (99, 102, 241)      # #6366f1
BG_BOTTOM = (67, 56, 202)    # #4338ca
WHITE = (255, 255, 255)
GREEN = (16, 185, 129)       # #10b981

# Toạ độ thiết kế trên khung 64x64 (khớp favicon.svg)
PULSE = [(9, 40), (18, 40), (24, 21), (31, 46), (37, 32), (43, 32)]
DOT = (50, 32, 5.5)
STROKE = 4.5
RADIUS = 15


def _clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def _sd_round_rect(px, py, w, h, r):
    """Khoảng cách có dấu tới hình chữ nhật bo góc (âm = bên trong)."""
    cx, cy = w / 2, h / 2
    qx, qy = abs(px - cx) - (cx - r), abs(py - cy) - (cy - r)
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    inside = min(max(qx, qy), 0.0)
    return outside + inside - r


def _sd_segment(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    den = vx * vx + vy * vy
    t = 0.0 if den == 0 else _clamp((wx * vx + wy * vy) / den)
    return math.hypot(wx - t * vx, wy - t * vy)


def _blend(dst: bytearray, idx: int, color, alpha: float):
    if alpha <= 0:
        return
    a = _clamp(alpha)
    sr, sg, sb = color
    dr, dg, db, da = dst[idx], dst[idx + 1], dst[idx + 2], dst[idx + 3] / 255
    out_a = a + da * (1 - a)
    if out_a <= 0:
        return
    dst[idx] = int(round((sr * a + dr * da * (1 - a)) / out_a))
    dst[idx + 1] = int(round((sg * a + dg * da * (1 - a)) / out_a))
    dst[idx + 2] = int(round((sb * a + db * da * (1 - a)) / out_a))
    dst[idx + 3] = int(round(out_a * 255))


def render(size: int) -> bytearray:
    k = size / 64.0
    buf = bytearray(size * size * 4)

    # 1. khung bo góc + gradient dọc
    r = RADIUS * k
    for y in range(size):
        t = y / max(1, size - 1)
        col = (
            round(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t),
            round(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t),
            round(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t),
        )
        for x in range(size):
            d = _sd_round_rect(x + 0.5, y + 0.5, size, size, r)
            a = _clamp(0.5 - d)
            if a > 0:
                _blend(buf, (y * size + x) * 4, col, a)

    # 2. đường nhịp trắng (chỉ quét trong bounding box từng đoạn => nhanh)
    half = STROKE * k / 2
    pts = [(x * k, y * k) for x, y in PULSE]
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        x0 = max(0, int(min(ax, bx) - half - 2))
        x1 = min(size, int(max(ax, bx) + half + 2))
        y0 = max(0, int(min(ay, by) - half - 2))
        y1 = min(size, int(max(ay, by) + half + 2))
        for y in range(y0, y1):
            for x in range(x0, x1):
                d = _sd_segment(x + 0.5, y + 0.5, ax, ay, bx, by) - half
                a = _clamp(0.5 - d)
                if a > 0:
                    _blend(buf, (y * size + x) * 4, WHITE, a)

    # 3. điểm xanh
    cx, cy, rad = DOT[0] * k, DOT[1] * k, DOT[2] * k
    x0, x1 = max(0, int(cx - rad - 2)), min(size, int(cx + rad + 2))
    y0, y1 = max(0, int(cy - rad - 2)), min(size, int(cy + rad + 2))
    for y in range(y0, y1):
        for x in range(x0, x1):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy) - rad
            a = _clamp(0.5 - d)
            if a > 0:
                _blend(buf, (y * size + x) * 4, GREEN, a)
    return buf


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def png_bytes(size: int, buf: bytearray) -> bytes:
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)  # filter type 0
        raw += buf[y * stride:(y + 1) * stride]
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + _chunk(b"IEND", b"")
    )


def ico_bytes(pngs: dict[int, bytes]) -> bytes:
    sizes = sorted(pngs)
    header = struct.pack("<HHH", 0, 1, len(sizes))
    entries, blobs, offset = b"", b"", 6 + 16 * len(sizes)
    for s in sizes:
        data = pngs[s]
        entries += struct.pack(
            "<BBBBHHII", 0 if s >= 256 else s, 0 if s >= 256 else s, 0, 0, 1, 32, len(data), offset
        )
        blobs += data
        offset += len(data)
    return header + entries + blobs


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Sinh logo AI Monitor")
    ap.add_argument("--sizes", type=int, nargs="*", default=SIZES)
    args = ap.parse_args(argv)

    os.makedirs(ASSETS, exist_ok=True)
    pngs: dict[int, bytes] = {}
    for size in args.sizes:
        data = png_bytes(size, render(size))
        pngs[size] = data
        path = os.path.join(ASSETS, f"icon_{size}.png")
        with open(path, "wb") as f:
            f.write(data)
        print(f"  {os.path.relpath(path, ROOT)}  ({len(data) / 1024:.1f} KB)")

    if 512 in pngs:
        with open(os.path.join(ASSETS, "icon.png"), "wb") as f:
            f.write(pngs[512])
        print("  assets/icon.png (512)")

    ico = {s: pngs[s] for s in ICO_SIZES if s in pngs}
    if ico:
        with open(os.path.join(ASSETS, "icon.ico"), "wb") as f:
            f.write(ico_bytes(ico))
        print(f"  assets/icon.ico ({len(ico)} cỡ)")

    # ICNS chỉ tạo được trên macOS (cần iconutil)
    if sys.platform == "darwin" and shutil.which("iconutil"):
        iconset = os.path.join(ASSETS, "AIMonitor.iconset")
        shutil.rmtree(iconset, ignore_errors=True)
        os.makedirs(iconset)
        mapping = [
            (16, "icon_16x16.png"), (32, "icon_16x16@2x.png"), (32, "icon_32x32.png"),
            (64, "icon_32x32@2x.png"), (128, "icon_128x128.png"), (256, "icon_128x128@2x.png"),
            (256, "icon_256x256.png"), (512, "icon_256x256@2x.png"), (512, "icon_512x512.png"),
            (1024, "icon_512x512@2x.png"),
        ]
        for size, name in mapping:
            if size in pngs:
                with open(os.path.join(iconset, name), "wb") as f:
                    f.write(pngs[size])
        out = os.path.join(ASSETS, "AIMonitor.icns")
        res = subprocess.run(["iconutil", "-c", "icns", iconset, "-o", out], capture_output=True, text=True)
        shutil.rmtree(iconset, ignore_errors=True)
        if res.returncode == 0:
            print("  assets/AIMonitor.icns")
        else:
            print("  (bỏ qua .icns:", (res.stderr or "").strip(), ")")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
