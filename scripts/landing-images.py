#!/usr/bin/env python3
"""Builds the optimised landing photos (public/landing/*.webp) from the approved originals in public/slider/.

Originals stay untouched (they are ~2 MB PNGs). Each output is a crop of one original, resized and saved as WebP.
Crop boxes are in source pixels: (left, top, right, bottom). Run again after changing a box or a source:

    python3 scripts/landing-images.py        (needs Pillow)
"""
from pathlib import Path
from PIL import Image

SRC = Path(__file__).resolve().parent.parent / 'public' / 'slider'
OUT = Path(__file__).resolve().parent.parent / 'public' / 'landing'

# name: (source file, crop box, output size, webp quality)
JOBS = {
    # hero: the speaker with the microphone and her slide, wide band for desktop / 16:10 for phones
    'hero-wide':       ('SheSpeaks_Tech_Talk_Cybersecurite.png', (268, 120, 1268, 423), (1600, 484), 80),
    'hero-tall':       ('SheSpeaks_Tech_Talk_Cybersecurite.png', (420, 95, 1120, 532), (1000, 625), 80),
    # the three formats (3:2)
    'format-talk':     ('AI Conference Keynote in Africa.png', (520, 100, 1100, 487), (600, 400), 78),
    'format-workshop': ('Collaborative Coding Hackathon in a Bright Workspace.png', (480, 120, 1350, 700), (600, 400), 78),
    'format-demo':     ('API Security Webinar in a Cozy Home Office.png', (120, 40, 1020, 640), (600, 400), 78),
    # decorative strips: quote band (left) and final call to action (right)
    'quote':           ('Collaborative DevOps Workshop in Action.png', (0, 300, 1536, 590), (1400, 264), 76),
    'cta':             ('Collaborative Finance App Workshop.png', (0, 380, 1672, 603), (1400, 187), 76),
}

OUT.mkdir(parents=True, exist_ok=True)
for name, (src, box, size, q) in JOBS.items():
    im = Image.open(SRC / src).convert('RGB').crop(box).resize(size, Image.LANCZOS)
    path = OUT / f'{name}.webp'
    im.save(path, 'WEBP', quality=q, method=6)
    print(f'{name:16s} {size[0]}x{size[1]}  {path.stat().st_size // 1024:>4} KB  <- {src}')
