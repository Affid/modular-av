"""The dock's ground: the front of the box, wide horizontal boards (Poly Haven's dark_wooden_planks), smoked dark
and oiled, nailed to the box's end battens: two nails to a board in a column near each end of the repeat, none in
the middle, where the names are. One whole repeat of the photograph each way, seen straight on under the sun and
the studio's surroundings alone (a ground that repeats takes only lights that are the same everywhere); the scene
is three repeats tall, so the picture meets itself.

Then the boards are evened where a name or a gap between cameras can land: a lighter board or a pale patch of
scratches ran as a light band behind a row of names. Every band of rows as tall as a name (16 CSS pixels), then
every area seen over about 40 CSS pixels, is brought to the median, and thin strokes lighter than their neighbourhood keep only a quarter of the
excess: the grain, the seams and the nails stay, as marks, and the picture still meets itself.
"""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402  (first: the paths)

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import materials  # noqa: E402
import shapes  # noqa: E402
from measures import out, picture, spec  # noqa: E402
from pixels import load_rgba, save_rgba  # noqa: E402

SEED = 5
# The board seams in the photograph, as fractions from its top (measured on its diffuse map's row means).
SEAMS = (0.055, 0.16, 0.268, 0.379, 0.498, 0.613, 0.721, 0.83, 0.943)
# Where the nails' columns are across the repeat, CSS pixels from its left.
NAIL_COLUMNS = (8.0, 292.0)


def nails(span, css, metal):
    """Two nails to a board in each column; a few gone (only a dark hole left), every one a little off its line.
    Each is placed in all three repeats up and down."""
    rng = random.Random(SEED)
    seams = list(SEAMS) + [SEAMS[0] + 1.0]
    hole = materials.black("nail-hole")
    unit = span / css  # scene units to a CSS pixel
    k = 0
    for css_x in NAIL_COLUMNS:
        for a, b in zip(seams, seams[1:]):
            for f in (0.3, 0.7):
                y_frac = a + (b - a) * f + rng.uniform(-0.02, 0.02) * (b - a) * 3
                x = -span / 2 + (css_x + rng.uniform(-2.5, 2.5)) * unit
                y = span / 2 - y_frac * span
                gone = rng.random() < 0.08
                r = (2.6 + rng.uniform(-0.4, 0.4)) * unit
                squash = rng.uniform(0.9, 1.08)
                for rep in (-1, 0, 1):
                    if gone:
                        bpy.ops.mesh.primitive_circle_add(vertices=16, radius=r * 0.45, fill_type="NGON",
                                                          location=(x, y + rep * span, 0.001))
                        bpy.context.object.data.materials.append(hole)
                    else:
                        shapes.dome(f"nail{k}", (x, y + rep * span), r, r * 0.45, metal, z=0.0, squash=squash)
                    k += 1


def blur_wrap(a, radius, passes=3, across=None):
    """A box blur repeated, wrapping round the picture's edges (it repeats); `across` a radius of its own along
    the rows."""
    h, w = a.shape
    big = np.tile(a, (3, 3)).astype(np.float32)
    for _ in range(passes):
        for axis in (0, 1):
            radius_here = across if axis == 1 and across is not None else radius
            total = np.cumsum(np.pad(big, [(1, 0) if k == axis else (0, 0) for k in (0, 1)]), axis=axis)
            n = big.shape[axis]
            hi = np.clip(np.arange(n) + radius_here + 1, 0, n)
            lo = np.clip(np.arange(n) - radius_here, 0, n)
            shape = [-1 if k == axis else 1 for k in (0, 1)]
            big = (np.take(total, hi, axis=axis) - np.take(total, lo, axis=axis)) / (hi - lo).reshape(shape)
    return big[h:2 * h, w:2 * w]


def even_rows(lum, band_px):
    """Each band of rows `band_px` tall brought to the median of all bands: what a row of names sees behind it.
    Lighter bands come down to it, darker ones up a little (wrapping, so the repeat still meets itself)."""
    rows = lum.mean(axis=1)
    k = band_px // 2
    wrapped = np.concatenate([rows[-k:], rows, rows[:k]])
    smooth = np.convolve(wrapped, np.ones(2 * k + 1) / (2 * k + 1), mode="same")[k:-k]
    return np.clip(float(np.median(smooth)) / smooth, 0.7, 1.15).astype(np.float32)[:, None]


def even(path, band_px, wide_px, near_px, knee=1.06):
    """The boards evened: bands of rows, then patches, brought to the median, light strokes damped (see the
    module's note)."""
    px = load_rgba(path)
    lum0 = np.maximum(px[..., :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32), 1e-4)
    lum = lum0 * even_rows(lum0, band_px)
    wide = blur_wrap(lum, wide_px)
    gain = np.clip(float(np.median(wide)) / wide, 0.7, 1.4)
    evened = lum * gain
    # Then a name-sized look: wherever the boards are lighter than the median over a stretch as long as a name
    # and as tall as its letters, they come down to it (darker stretches stay: the seams between boards).
    long = blur_wrap(evened, band_px // 2, across=wide_px)
    evened = evened * np.minimum(1.0, float(np.median(long)) / long)
    near = blur_wrap(evened, near_px)
    ratio = evened / near
    damped = near * np.where(ratio > knee, knee + (ratio - knee) * 0.25, ratio)
    px[..., :3] *= (damped / lum0)[..., None]
    save_rgba(px, path)
    print("GAIN min/max:", round(float(gain.min()), 3), round(float(gain.max()), 3))


def main():
    own = spec("ground")
    size, _ = picture("ground")
    span = 6.0
    scene = stage.stage(samples=160, lamps=False, ceiling=False)
    scene.render.film_transparent = False
    # A margin round the repeat, cropped off after: the denoiser treats a picture's edge pixels apart, and the
    # repeat's seam showed as a step at every edge.
    margin = 32
    stage.front_camera(scene, size + 2 * margin, size + 2 * margin, span * (size + 2 * margin) / size)
    wood = materials.wood("wood", tint=(0.30, 0.235, 0.185), coords="Object", scale=1 / span,
                          photo="dark_wooden_planks", oil=0.35, offset=(0.5, 0.5, 0))
    bpy.ops.mesh.primitive_plane_add(size=span * 3, location=(0, 0, 0))
    bpy.context.object.data.materials.append(wood)
    nails(span, own["width"], materials.iron("nail-iron", tone=0.04, scale=3.0, hammer=0.2, rub=0.15,
                                             rub_bright=0.2, edge_width=0.004))
    path = out("ground")
    stage.render(scene, path)
    save_rgba(load_rgba(path)[margin:-margin, margin:-margin].copy(), path)
    k = own["density"]
    even(path, band_px=round(16 * k), wide_px=round(40 * k), near_px=round(5 * k))


main()
