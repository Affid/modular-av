"""A piece of the same hide, nailed to the wall with iron nails: the header and the voice panel. Two pictures: its
edges, which the stylesheet cuts in nine, and the hide itself, one repeat each way, which lies under them and
never stretches."""
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bpy
import numpy as np

from materials import metal
from measures import MEASURES, out, picture, span
from pixels import clean, load_rgba, save_rgba
from shapes import sheet, worn_outline
from stage import start
from stuff import hide
from studio import render


def piece():
    """A piece of the same hide, nailed to the wall at its corners with iron nails: the header and the panel."""
    rng = random.Random(31)
    # Wider than tall: its long edges repeat along a wide dock instead of stretching, and a stretch smears.
    width, height = picture("piece")
    across, margin = span("piece"), 0.24
    tall = across * height / width
    scene, _ = start(width, height, across)
    wide, half = across / 2 - margin, tall / 2 - margin
    page = sheet("piece", worn_outline(rng, -wide, -half, wide, half, step=0.3, wave=0.02, nick=0.05), thick=0.03, z=0.012)
    page.data.materials.append(hide("hide", box=(-wide, -half, wide, half), shift=(0.9, 0.3), edge=0.3))
    iron = metal("iron", (0.02, 0.019, 0.02, 1), 0.7)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (wide - 0.2) + rng.uniform(-0.02, 0.02), sy * (half - 0.2) + rng.uniform(-0.02, 0.02)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.1, location=(x, y, 0.045))
            head = bpy.context.object
            head.scale = (1, rng.uniform(0.85, 1.0), 0.45)
            head.rotation_euler = (rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), rng.uniform(0, 3))
            head.data.materials.append(iron)
    path = out("piece")
    render(scene, path)
    pixels = clean(load_rgba(path), floor=0.08, shadow_fade=3 * MEASURES["pictures"]["piece"]["density"])
    # Only its edge is kept: inward it fades into the hide the stylesheet lays under it, which never stretches.
    high, broad = pixels.shape[0], pixels.shape[1]
    rows, columns = np.mgrid[0:high, 0:broad]
    inward = np.minimum(np.minimum(rows, high - 1 - rows), np.minimum(columns, broad - 1 - columns))
    spec = MEASURES["pictures"]["piece"]
    density = spec["density"]
    pixels[..., 3] *= np.clip((spec["edge"] * density - density - inward) / (7.5 * density), 0.0, 1.0)
    save_rgba(pixels, path)


def leather():
    """The hide itself, one repeat each way: what lies under the header's and the panel's edges."""
    scene, _ = start(*picture("leather"), span("leather"))
    scene.render.film_transparent = False
    for obj in list(scene.objects):
        if obj.type == "MESH":
            bpy.data.objects.remove(obj)
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    bpy.context.object.data.materials.append(hide("hide", box=(-6, -6, 6, 6), fold=True, plain=True))
    render(scene, out("leather"))


piece()
leather()
