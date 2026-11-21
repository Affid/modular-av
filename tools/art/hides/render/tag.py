"""The name's tag: a strip of pale rawhide with its corners cut off, held by a crossed stitch of thong at each end.
The stylesheet cuts it in three, so a long name stretches only its middle."""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bpy

from forms import cord
from measures import out, picture, span
from pixels import clean, load_rgba, save_rgba
from shapes import sheet
from stage import start
from stuff import hide, surface
from studio import render


def hole(x, y, z, radius=0.035):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=0.008, location=(x, y, z))
    bpy.context.object.data.materials.append(surface("hole", "fabric_leather_01", 3.0, tint=(0.06, 0.05, 0.04, 1)))


def tag():
    """A strip of pale rawhide, its corners cut off, held by a crossed stitch of thong at each end."""
    rng = random.Random(5)
    scene, _ = start(*picture("tag"), span("tag"))
    x0, x1, y0, y1, cut = -1.8, 1.8, -0.30, 0.54, 0.13
    corners = [(x0 + cut, y1), (x1 - cut, y1), (x1, y1 - cut), (x1, y0 + cut), (x1 - cut, y0), (x0 + cut, y0), (x0, y0 + cut), (x0, y1 - cut)]
    outline = []
    for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
        steps = max(2, round(math.hypot(bx - ax, by - ay) / 0.2))
        for k in range(steps):
            t = k / steps
            outline.append((ax + (bx - ax) * t + rng.uniform(-0.008, 0.008), ay + (by - ay) * t + rng.uniform(-0.008, 0.008)))
    strip = sheet("tag", outline[::-1], thick=0.035, z=0.0)
    strip.data.materials.append(hide("rawhide", box=(x0, y0, x1, y1), span=7.0, shift=(0.7, 0.2), sat=0.4, value=2.0, edge=0.09, tone=(1.0, 0.9, 0.72, 1)))
    thong = surface("thong", "fabric_leather_01", 3.0, tint=(0.42, 0.36, 0.3, 1))
    middle = (y0 + y1) / 2
    for x in (-1.5, 1.5):
        for sign in (-1, 1):
            a, b = (x - 0.12, middle - sign * 0.17), (x + 0.12, middle + sign * 0.17)
            cord("stitch", [(*a, 0.03), ((a[0] * 2 + b[0]) / 3, (a[1] * 2 + b[1]) / 3, 0.07), ((a[0] + b[0] * 2) / 3, (a[1] + b[1] * 2) / 3, 0.07), (*b, 0.03)], 0.03, thong)
            hole(*a, 0.036)
            hole(*b, 0.036)
    path = out("tag")
    render(scene, path)
    save_rgba(clean(load_rgba(path), floor=0.12), path)


tag()
