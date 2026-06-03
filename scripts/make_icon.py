#!/usr/bin/env python3
"""Generate GhostPin.icns from scratch using Pillow."""
import math
import os
import shutil
import subprocess
from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
OUT_DIR = os.path.dirname(os.path.abspath(__file__)) + "/../GhostPin.app/Contents/Resources"
ICONSET = "/tmp/GhostPin.iconset"


def draw_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 1024  # scale factor

    # — Background: deep blue rounded square —
    r = int(220 * s)
    bg_box = [0, 0, size, size]
    # Gradient approximation: draw concentric rects from dark to slightly lighter
    for i in range(int(size // 2)):
        t = i / (size / 2)
        c1 = (26, 26, 46)   # #1a1a2e
        c2 = (15, 52, 96)   # #0f3460
        rgb = tuple(int(c1[j] + (c2[j] - c1[j]) * t) for j in range(3))
        d.rounded_rectangle(
            [i, i, size - i, size - i],
            radius=max(1, r - i),
            fill=rgb + (255,)
        )

    # — Ghost body —
    # Ghost sits in upper ~70% of icon, centered horizontally
    gw = int(640 * s)   # ghost width
    gh = int(620 * s)   # ghost height
    gx = (size - gw) // 2
    gy = int(60 * s)

    # Build ghost polygon
    pts = ghost_points(gx, gy, gw, gh, s)
    d.polygon(pts, fill=(230, 235, 255, 255))

    # Eyes
    eye_y = gy + int(220 * s)
    eye_r = int(70 * s)
    leye_x = gx + int(185 * s)
    reye_x = gx + int(455 * s)

    for ex in (leye_x, reye_x):
        # white sclera
        d.ellipse([ex - eye_r, eye_y - eye_r, ex + eye_r, eye_y + eye_r],
                  fill=(26, 26, 46, 255))
        # shine
        shine_r = int(22 * s)
        d.ellipse([ex - eye_r + shine_r, eye_y - eye_r + shine_r // 2,
                   ex - eye_r + shine_r * 3, eye_y - eye_r + shine_r * 2],
                  fill=(255, 255, 255, 160))

    # — PIN text —
    text = "PIN"
    font_size = int(170 * s)
    # Try system fonts in order
    for font_path in [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSDisplay.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]:
        if os.path.exists(font_path):
            try:
                font = ImageFont.truetype(font_path, font_size)
                break
            except Exception:
                continue
    else:
        font = ImageFont.load_default()

    bbox = d.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = int(750 * s) - bbox[1]

    # letter spacing via per-char render
    spacing = int(18 * s)
    total_w = tw + spacing * (len(text) - 1)
    cx = (size - total_w) // 2
    for ch in text:
        cb = d.textbbox((0, 0), ch, font=font)
        cw = cb[2] - cb[0]
        d.text((cx - cb[0], ty), ch, font=font, fill=(255, 255, 255, 255))
        cx += cw + spacing

    return img


def ghost_points(gx, gy, gw, gh, s):
    """Approximate ghost shape as polygon: round top, wavy bottom."""
    pts = []
    # Top arc (semicircle)
    cx = gx + gw / 2
    cy = gy + gw / 2  # center of the circular top
    radius = gw / 2
    for i in range(181):
        angle = math.radians(180 + i)
        x = cx + radius * math.cos(angle)
        y = cy + radius * math.sin(angle)
        pts.append((x, y))

    # Right side straight down
    body_bottom = gy + gh
    pts.append((gx + gw, body_bottom))

    # Wavy bottom: 3 scallops going left
    num_scallops = 3
    scallop_w = gw / num_scallops
    scallop_h = int(60 * s)
    for i in range(num_scallops):
        sx = gx + gw - i * scallop_w
        mid_x = sx - scallop_w / 2
        pts.append((mid_x, body_bottom - scallop_h))
        pts.append((sx - scallop_w, body_bottom))

    # Left side back up (already at gx, body_bottom from last scallop)
    pts.append((gx, gy + int(ww := gw / 2)))

    return pts


def make_iconset():
    os.makedirs(ICONSET, exist_ok=True)
    specs = [
        ("icon_16x16.png", 16),
        ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32),
        ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128),
        ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256),
        ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512),
        ("icon_512x512@2x.png", 1024),
    ]
    base = draw_icon(1024)
    for fname, sz in specs:
        img = base.resize((sz, sz), Image.LANCZOS)
        img.save(os.path.join(ICONSET, fname))
        print(f"  {fname}")


def build_icns():
    icns_path = os.path.join(OUT_DIR, "AppIcon.icns")
    subprocess.run(["iconutil", "-c", "icns", ICONSET, "-o", icns_path], check=True)
    print(f"Created: {icns_path}")
    shutil.rmtree(ICONSET)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Generating iconset...")
    make_iconset()
    print("Building .icns...")
    build_icns()
    print("Done.")
