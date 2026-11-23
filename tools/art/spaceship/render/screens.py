"""What the tube itself shows, computed from the frames' geometry (no render), each over the frame layer's box:

  scan          where the tube's scan lines show (alpha), for the stylesheet to fill with lines a fixed number of
                pixels apart: from the lip inward, fading, never in the middle box
  snow          the snow of a weak signal in the same margin, with a tear where the picture's lines lose their
                hold (the stylesheet flickers it by opacity); its alpha in 8 steps, which looks the same and
                halves its weight (random noise is costly: WebP keeps alpha losslessly). If the measures give
                it a size of its own ("snow" in pictures), it is made at that size and drawn larger
  scan-deaf     the scan lines' mask with the hung headset cut out (it hangs in front of the glass: no lines on
  scan-deaf-own it), for the other players' monitors and the viewer's own
  snow-deaf     a plain mask for the snow, the headset cut out and the snow thinned under its shadow, so the
  snow-deaf-own shadow still lies on the tube when it snows

The deafened masks read the working files frames.py leaves beside its pictures (monitor-deaf-hsmask,
monitor-deaf-hsshade and the own-deaf ones): run frames.py first, into the same folder.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402  (first: the paths)

import numpy as np  # noqa: E402

import tube  # noqa: E402
from measures import MEASURES, frame_pixels, option, out, picture  # noqa: E402
from pixels import load_rgba, save_rgba  # noqa: E402

SEED = 17
TEAR = (0.62, 0.66)  # the tear's band of rows, as fractions of the picture's height from its foot
SMEAR = 7  # how many specks the tear smears together along a line
ALPHA_STEPS = 8  # the snow's alpha levels: fewer showed steps in the margin's fade
DEAF = (("monitor-deaf", ""), ("own-deaf", "-own"))  # the deafened frame, and the masks' suffix


def snow(mask):
    """Speckle along the lines, in the scan lines' margin. In the tear the specks are smeared along their lines
    and brighter, and stay on the tube (rolling the band sideways left a clean notch of picture at one end and
    spilled snow onto the bezel at the other)."""
    rng = np.random.default_rng(SEED)
    h, w = mask.shape
    grain = rng.random((h, w)).astype(np.float32)
    grain = (grain + np.roll(grain, 1, axis=1) + np.roll(grain, -1, axis=1)) / 3  # each speck a little wide
    px = np.zeros((h, w, 4), dtype=np.float32)
    px[..., :3] = grain[..., None] * 0.95
    a = np.clip((grain - 0.35) * 1.6, 0, 1) * np.clip(mask * 1.4, 0, 1)
    band = slice(int(h * TEAR[0]), int(h * TEAR[1]))  # rows run up
    smear = grain[band].copy()
    for k in range(1, SMEAR):
        smear += np.roll(grain[band], k, axis=1)
    smear /= SMEAR
    px[band, :, :3] = np.clip(smear[..., None] * 1.3, 0, 1)
    a[band] = np.clip((smear - 0.3) * 2.2, 0, 1) * np.clip(mask[band] * 1.4, 0, 1)
    px[band, :, :3] = np.clip(px[band, :, :3] * 1.25, 0, 1)
    px[..., 3] = np.round(np.clip(a, 0, 0.85) * (ALPHA_STEPS - 1)) / (ALPHA_STEPS - 1)
    return px


def resample(alpha, h, w):
    """A smooth mask at another size (bilinear, pixel centres kept)."""
    big_h, big_w = alpha.shape
    ys = np.clip((np.arange(h) + 0.5) * big_h / h - 0.5, 0, big_h - 1)
    xs = np.clip((np.arange(w) + 0.5) * big_w / w - 0.5, 0, big_w - 1)
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    y1, x1 = np.minimum(y0 + 1, big_h - 1), np.minimum(x0 + 1, big_w - 1)
    fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
    top = alpha[y0][:, x0] * (1 - fx) + alpha[y0][:, x1] * fx
    foot = alpha[y1][:, x0] * (1 - fx) + alpha[y1][:, x1] * fx
    return top * (1 - fy) + foot * fy


def snow_size():
    """The snow's own size if the measures give one, else the frame's."""
    return picture("snow") if "snow" in MEASURES["pictures"] else frame_pixels()


def holes(scan, frame, suffix):
    """The scan lines' mask and a plain mask for the snow with the headset of a deafened `frame` cut out (grown a
    pixel each way), the snow thinned under the headset's shadow."""
    hs = load_rgba(out(frame + "-hsmask"))[..., 3]
    shade = load_rgba(out(frame + "-hsshade"))[..., 3]
    grown = hs.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        grown = np.maximum(grown, np.roll(np.roll(hs, dy, axis=0), dx, axis=1))
    keep = 1.0 - np.clip(grown * 1.25, 0, 1)
    mask = scan.copy()
    mask[..., 3] *= keep
    save_rgba(mask, out("scan-deaf" + suffix))
    plain = np.ones_like(mask)
    plain[..., 3] = keep * (1.0 - np.clip(shade * 1.3, 0, 1) * 0.85)
    save_rgba(plain, out("snow-deaf" + suffix))


def wanted(name):
    only = option("--only")
    return not only or name in only.split(",")


def main():
    w, h = frame_pixels()
    save_rgba(tube.scan_mask((h, w)), out("scan"))
    scan = load_rgba(out("scan"))  # the others are made from the mask as shipped, in 8 bits
    if wanted("snow"):
        sw, sh = snow_size()
        mask = scan[..., 3] if (sw, sh) == (w, h) else resample(scan[..., 3], sh, sw)
        save_rgba(snow(mask), out("snow"))
    for frame, suffix in DEAF:
        if wanted("scan-deaf" + suffix) or wanted("snow-deaf" + suffix):
            holes(scan, frame, suffix)


main()
