"""The dock's own edge: the box's iron binding strap, a picture cut in nine (border-image, its corners `edge` CSS
pixels, the middles repeating), a domed rivet at each corner and in the middle of each side."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402  (first: the paths)

import materials  # noqa: E402
import shapes  # noqa: E402
from measures import out, picture, spec  # noqa: E402


def flat(width, height, steps=20):
    """A flat bar's section, its shoulders rounded."""
    pts = [(0.0, 0.0)]
    for k in range(steps + 1):
        t = k / steps
        s = min(1.0, t / 0.18, (1.0 - t) / 0.18)
        pts.append((t * width, height * math.sin(max(0.0, s) * math.pi / 2) ** 0.5))
    pts.append((width, 0.0))
    return pts


def main():
    own = spec("strap")
    px, _ = picture("strap")
    span = px / 100.0
    edge = own["edge"] * own["density"] / 100.0  # the strap's width, scene units
    scene = stage.stage(samples=200, lamps=False, ceiling=False)
    stage.front_camera(scene, px, px, span)
    half = span / 2
    metal = materials.iron("iron", tone=0.034, scale=0.8, hammer=0.12, facet_scale=2.5, rub=0.12, rub_bright=0.22,
                           edge_width=0.012)
    band = shapes.ring("strap", 0, 0, half, half, 0.02, flat(edge, 0.05), per_side=60, per_corner=4,
                       wobble=shapes.wobble_fn(3, 0.004, 6.0))
    band.data.materials.append(metal)
    c = half - edge / 2
    for k, (x, y) in enumerate([(-c, -c), (c, -c), (-c, c), (c, c), (0, -c), (0, c), (-c, 0), (c, 0)]):
        shapes.dome(f"rivet{k}", (x, y), 0.042, 0.03, metal, z=0.045)
    stage.render(scene, out("strap"))


main()
