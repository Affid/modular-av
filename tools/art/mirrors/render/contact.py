"""Round 4: plus a small darker shadow right round each pressing fingertip pad. A contact shadow for the hands on the picture's face, worked out from the posed mesh rather than a shadow
catcher (whose veil reaches far): the skin that lies close to the face darkens it right under and round it, and
the shadow fades out within a few tile units. It is kept on the picture and inside its side bands (x < 140 and
x > 860 tile units), so the middle box stays clear."""
import numpy as np

from common import DENSITY, TILE_H, TILE_W, VIEW
from pixels import soften

BAND = 140.0  # tile units from a side the shadow may reach
NEAR = 0.07  # scene units over the face where skin still darkens it hard (7 tile units)
FAR = 0.30  # where it stops darkening the face at all
DROP = 1.5  # tile units the shadow falls downward (the light is above)


def _splat(points, closeness, shape):
    """Each point's closeness into the pixel grid (rows top-down), keeping the largest per pixel."""
    h, w = shape
    tx = points[:, 0] * 100.0 + VIEW["w"] / 2.0  # tile units from the view's left edge
    ty = VIEW["h"] / 2.0 - points[:, 1] * 100.0 + DROP
    col = np.round(tx * DENSITY).astype(int)
    row = np.round(ty * DENSITY).astype(int)
    ok = (col >= 0) & (col < w) & (row >= 0) & (row < h) & (closeness > 0)
    grid = np.zeros(shape, dtype=np.float32)
    np.maximum.at(grid, (row[ok], col[ok]), closeness[ok].astype(np.float32))
    return grid


def _band_mask(shape):
    """1 on the picture within the side bands, falling to 0 before x 140 / 860."""
    h, w = shape
    tx = np.arange(w) / DENSITY + VIEW["x"]
    ty = np.arange(h) / DENSITY + VIEW["y"]
    side = np.minimum(tx, TILE_W - tx)
    across = np.clip((BAND - side) / 25.0, 0.0, 1.0) * (side > -1.0)
    down = ((ty > 0) & (ty < TILE_H)).astype(np.float32)
    return down[:, None] * across[None, :]


TIP_NEAR = 0.025  # scene units over the face where a fingertip darkens it hard (2.5 tile units)


def contact_shadow(pixels, points, face, strength=0.42, soft=0.12, tips=None, tip_strength=0.6):
    """`pixels` as loaded (rows bottom-up, straight alpha); `points` the hands' posed vertices in the scene."""
    h, w, _ = pixels.shape
    height = points[:, 2] - face
    points = points[height > -0.004]  # skin behind the picture (the thumb under it) casts nothing on its face
    height = height[height > -0.004]
    hard = np.clip(1.0 - height / NEAR, 0.0, 1.0) ** 2
    broad = np.clip(1.0 - height / FAR, 0.0, 1.0) ** 2
    r1 = max(1, round(2.0 * DENSITY))
    r2 = max(1, round(5.0 * DENSITY))
    tight = soften(_splat(points, hard, (h, w)), r1)
    wide = soften(_splat(points, broad, (h, w)), r2)
    shade = np.clip(1.6 * tight, 0.0, 1.0) * strength + np.clip(1.4 * wide, 0.0, 1.0) * soft
    limit = 0.5
    if tips is not None and len(tips):  # the pressing pads: a small, darker shadow right round them
        t_h = tips[:, 2] - face
        keep = t_h > -0.004
        press = np.clip(1.0 - t_h[keep] / TIP_NEAR, 0.0, 1.0) ** 2
        pads = soften(_splat(tips[keep], press, (h, w)), max(1, round(2.5 * DENSITY)))
        shade = np.maximum(shade, np.clip(2.2 * pads, 0.0, 1.0) * tip_strength)
        limit = tip_strength
    shade = np.clip(shade, 0.0, limit) * _band_mask((h, w))
    shade = shade[::-1]  # to the picture's rows (bottom-up)
    a = pixels[..., 3]
    out_a = a + shade * (1.0 - a)
    result = pixels.copy()
    result[..., :3] = pixels[..., :3] * (a / np.maximum(out_a, 1e-6))[..., None]
    result[..., 3] = out_a
    return result
