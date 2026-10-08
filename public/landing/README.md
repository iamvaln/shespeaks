# Landing page photos

Optimised crops of the approved originals in `public/slider/` (the originals stay untouched, they are about 2 MB each).
Rebuild with `python3 scripts/landing-images.py` (needs Pillow). The source file and crop box of each image are listed in that script.

| File | Used for |
|---|---|
| `hero-wide.webp`, `hero-tall.webp` | Hero photo (wide band on desktop, 16:10 on phones) |
| `format-talk.webp`, `format-workshop.webp`, `format-demo.webp` | The three format cards |
| `quote.webp` | Left side of the quote band |
| `cta.webp` | Right side of the closing call to action |

To use another picture: change the source and crop box in the script, run it, commit the new `.webp`.
Use photos of people who agreed to appear on the website.
