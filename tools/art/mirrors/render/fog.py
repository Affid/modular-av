"""Muted: breath on the mirror (`fog`), one soft milky veil, no droplets (which read as sand). Breath on cold glass
is droplets far too small to see: what shows is a milky veil, thickest where the breath landed, thinning to a soft
edge that wanders. It lies on the glass in front of the picture, so it runs on across the picture's edge without a
break and fades out in the glass round it.

- Each side of the picture has its own depth of fog (the sides about 110 tile units in, the top and bottom about 52,
  which keeps it out of the middle 70%), wandering slowly along the side; the sides join softly, so the corners are
  thickest.
- A broad, faint mottling keeps it from reading as a gradient; nothing is grain-sized.
- Its colour is the glass's own light scattered in it: a pale, cold lavender grey.

No render: the veil has no shape to light, only a density, so it is written as pixels.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

from common import keep_middle_clear, smoothstep  # noqa: E402
from measures import DENSITY, MIDDLE, TILE_H, TILE_W, VIEW, out, over  # noqa: E402
from pixels import save_rgba  # noqa: E402

SEED, PEAK = 5, 0.55
SOFT = 85.0
SIDES = (110.0, 110.0, 52.0, 54.0)  # left, right, top, bottom
OUTER = 0.45  # how thick it is on the black glass round the picture, against its thickness at the edge
W, H = over(DENSITY)
rng = np.random.RandomState(SEED)

r_, c_ = np.mgrid[0:H, 0:W].astype(np.float32)
x = (c_ + 0.5) / DENSITY + VIEW["x"]
y = (H - 1 - r_ + 0.5) / DENSITY + VIEW["y"]  # row 0 is the picture's bottom, as Blender writes images


def waves(t, lengths, amp):
    """A slow wander along a side: a few sines of the given wavelengths, random phases."""
    return sum(amp / len(lengths) * np.sin(2 * math.pi * t / length + rng.rand() * 6.283) for length in lengths)


def noise2(lengths, amp):
    v = np.zeros_like(x)
    for length in lengths:
        a = rng.rand() * math.pi
        u = x * math.cos(a) + y * math.sin(a)
        w = -x * math.sin(a) + y * math.cos(a)
        v += np.sin(2 * math.pi * u / length + rng.rand() * 6.283) * \
            np.sin(2 * math.pi * w / (length * 1.3) + rng.rand() * 6.283)
    return amp * v / len(lengths)


left, right, top, bottom = SIDES
sides = (
    (x, left + waves(y, (420, 260), 18)),
    (TILE_W - x, right + waves(y, (400, 280), 18)),
    (y, top + waves(x, (520, 330), 8)),
    (TILE_H - y, bottom + waves(x, (480, 310), 8)),
)
clear = np.ones_like(x)
for distance, depth in sides:
    clear *= 1 - smoothstep((depth - distance) / SOFT)
density = 1 - clear

# Out in the glass: the breath goes on past the picture's edge, thinner on the black, and fades within the reach.
ox = np.maximum(np.maximum(-x, x - TILE_W), 0)
oy = np.maximum(np.maximum(-y, y - TILE_H), 0)
out_d = np.hypot(ox, oy)
density = np.where(out_d > 0, np.clip(density, 0, 1) * OUTER *
                   smoothstep((40 + waves(x - y, (300, 170), 14) - out_d) / 40), density)
border = np.minimum.reduce([x - VIEW["x"], VIEW["x"] + VIEW["w"] - x, y - VIEW["y"], VIEW["y"] + VIEW["h"] - y])
density *= smoothstep(border / 14)

mottle = 1 + noise2((320, 210, 150), 0.16)
density = np.clip(density * mottle, 0, 1)

dx = np.maximum(np.maximum(MIDDLE[0] - x, x - MIDDLE[2]), 0)
dy = np.maximum(np.maximum(MIDDLE[1] - y, y - MIDDLE[3]), 0)
inside_mid = (x > MIDDLE[0]) & (x < MIDDLE[2]) & (y > MIDDLE[1]) & (y < MIDDLE[3])
density *= smoothstep((np.hypot(dx, dy) - 4) / 56) * (~inside_mid)

tone = np.array((0.75, 0.73, 0.83), dtype=np.float32)
shade = (0.94 + 0.1 * (mottle - 1))[..., None]
px = np.zeros((H, W, 4), dtype=np.float32)
px[..., :3] = np.clip(tone * shade, 0, 1)
px[..., 3] = density * PEAK
px[..., :3] = np.where(px[..., 3:4] > 0.002, px[..., :3], 0)
keep_middle_clear(px, "fog")
save_rgba(px, out("fog"))
