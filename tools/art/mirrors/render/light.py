"""The light in the glass round a picture, at rest and while its player speaks, for each pose of the hands:
`light-rest-<pose>`, `light-speak-<pose>`. Both cover the frame layer's box exactly (the reach the theme registers),
so a light never passes it and two neighbours' lights stay apart.

The light is where the hands come out of the glass: it pools round each hand's wrist, long along the picture's side
and short across it, and spreads a little way along the edge from there, unevenly, then dies away. Away from the
hands the picture's edge has no light of its own, so nothing traces the picture's sides (a lit box read as neon).
Faint wisps rise off the top near a hand. Under the picture, across the name, there is none. Its core is a cold
lavender grey, its colour only in the falloff; its peak stays under the frame's silver. At rest the same shapes are
far fainter and more saturated, so the glass reads as one deep pane with light in it.

No render: a light in glass has no shape to light, only a density and a colour, so it is written as pixels.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

from common import smoothstep  # noqa: E402
from measures import HANDS, LIGHT_DENSITY, TILE_H, TILE_W, VIEW, out, over  # noqa: E402
from pixels import save_rgba  # noqa: E402

SEED = 11
W, H = over(LIGHT_DENSITY)
L, T = -VIEW["x"], -VIEW["y"]
# How far out of the glass a wrist's pool starts, its size along the side and across it, how far the light spreads
# along the edge from a hand, and where it is gone (inside the reach of 70 units).
POOL_OUT, POOL_ALONG, POOL_ACROSS = 22.0, 115.0, 46.0
SPREAD = 260.0
GONE = 62.0  # at the most

rows, cols = np.mgrid[0:H, 0:W].astype(np.float32)
tx = (cols + 0.5) / LIGHT_DENSITY - L
ty = (rows + 0.5) / LIGHT_DENSITY - T
ox = np.maximum(-tx, tx - TILE_W)
oy = np.maximum(-ty, ty - TILE_H)
d = np.hypot(np.maximum(ox, 0), np.maximum(oy, 0))  # out from the picture's edge; 0 inside


def value_noise(rng, cx, cy):
    """Smooth value noise, one value per cx units across and cy down, smoothstepped between."""
    gx, gy = int(VIEW["w"] / cx) + 3, int(VIEW["h"] / cy) + 3
    grid = rng.rand(gy, gx)
    fx, fy = (tx + L) / cx, (ty + T) / cy
    ix, iy = np.floor(fx).astype(int), np.floor(fy).astype(int)
    sx, sy = smoothstep(fx - ix), smoothstep(fy - iy)
    a, b = grid[iy, ix], grid[iy, ix + 1]
    c, e = grid[iy + 1, ix], grid[iy + 1, ix + 1]
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + e * sx) * sy


def wrists(pose):
    """Where each hand comes out of the glass: just outside the picture's side, at the hand's height."""
    hands = HANDS["poses"][pose]
    return [(-POOL_OUT, hands["left"]["y"]), (TILE_W + POOL_OUT, hands["right"]["y"])]


def intensity(pose):
    rng = np.random.RandomState(SEED + int(pose))
    pool = np.zeros_like(d)
    near = np.zeros_like(d)
    for px_, py_ in wrists(pose):
        # A cloud, not a bar: its size wanders round it.
        size = 0.75 + 0.5 * value_noise(rng, 70, 70)
        pool = np.maximum(pool, np.exp(-(((tx - px_) / (POOL_ACROSS * size)) ** 2)
                                       - ((ty - py_) / (POOL_ALONG * size)) ** 2))
        # How near a hand a point of the edge is, walking round the picture's corner.
        along = np.abs(ty - py_) + np.maximum(np.abs(tx - px_) - POOL_OUT, 0)
        near = np.maximum(near, np.exp(-((along / SPREAD) ** 2)))
    # From the wrist the light seeps a little way along the edge, unevenly, never as a band round the picture.
    uneven = smoothstep((0.65 * value_noise(rng, 120, 120) + 0.35 * value_noise(rng, 45, 45) - 0.3) / 0.45)
    seep = np.where(d < 24, 0.55 + 0.45 * smoothstep(d / 12.0), np.exp(-(d - 24) / 14.0))
    seep = seep * near * (0.2 + 0.8 * uneven) * 0.45
    # Wisps rising off the top, near a hand only.
    wisp = smoothstep((value_noise(rng, 90, 14) - 0.55) / 0.25) * np.exp(-np.maximum(-ty, 0) / 26.0) * (ty < 8)
    wisp *= smoothstep((-ty) / 6.0) * near * 0.6
    light = np.maximum.reduce([pool, seep, wisp]) * (d > 0)
    # Never under the picture across the name: feathered 30 down, 90 across.
    name = smoothstep((ty - TILE_H) / 30.0) * smoothstep((440 - np.abs(tx - TILE_W / 2)) / 90.0)
    light *= 1 - name
    # Gone well inside the box, at a distance that wanders, so its outer edge never runs parallel to the picture's.
    reach = GONE - 18.0 * value_noise(rng, 80, 80)
    light *= smoothstep((reach - d) / 20.0)
    return np.clip(light, 0, 1)


# (core, falloff) as colours 0..1, the core where the light is strong; and each state's peak opacity.
COLOURS = {"speak": ((0.62, 0.58, 0.80), (0.50, 0.28, 0.98)), "rest": ((0.42, 0.30, 0.80), (0.40, 0.22, 0.92))}
PEAK = {"speak": 0.5, "rest": 0.2}

for pose in HANDS["poses"]:
    i = intensity(pose)
    # Along the top edge, 10 units out: the light far from both hands, against its brightest there.
    edge_row = int((T - 10) * LIGHT_DENSITY)
    top = i[edge_row, int((L + 300) * LIGHT_DENSITY):int((L + 700) * LIGHT_DENSITY)]
    print(f"pose {pose}: light along the top's middle, mean", round(float(top.mean()), 3), "max",
          round(float(top.max()), 3), "(1 at a wrist)")
    for state, (core, fall) in COLOURS.items():
        core, fall = np.array(core, np.float32), np.array(fall, np.float32)
        mix = (i ** 1.6)[..., None]
        px = np.zeros((H, W, 4), dtype=np.float32)
        px[..., :3] = fall * (1 - mix) + core * mix
        px[..., 3] = i * PEAK[state]
        edge = max(float(px[0, :, 3].max()), float(px[-1, :, 3].max()), float(px[:, 0, 3].max()),
                   float(px[:, -1, 3].max()))
        if edge > 0.002:
            raise SystemExit(f"light-{state}-{pose}: the light reaches the box's edge ({edge:.4f})")
        save_rgba(px[::-1].copy(), out(f"light-{state}-{pose}"))
