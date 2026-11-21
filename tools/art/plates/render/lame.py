"""The header and the voice panel: larger plates of the same steel. Two pictures:
    lame   the plate's edge all round, rolled, a rivet in each corner, clear in the middle: the stylesheet cuts it
           in nine
    steel  its steel as a ground that repeats, one whole repeat of the photograph, with hammer marks that meet
           themselves across the seam
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bpy
import numpy as np

from forms import band, facing_up, rivet, rounded, uneven
from measures import UNIT_PX, out, picture, span, spec
from pixels import clean, load_rgba, save_rgba
from shapes import ground
from studio import camera, render, reset, room
from steel import steel

W, H = spec("lame")["width"], spec("lame")["height"]  # the edge's picture, in CSS pixels
EDGE = spec("lame")["edge"]  # the slice the stylesheet cuts
MARGIN = 6.0  # round the plate, for its shadow
THICK = 0.11  # the plate's top above the mail, in scene units
BEAD = 3.2  # the rolled edge's radius, CSS pixels

rng = random.Random(5)


def start(name, repeating):
    """A scene for the picture called `name`. One that repeats has only lights that are everywhere the same, the
    sun and the sky: a lamp would light its middle more than its edges, and its seam would show."""
    scene = reset()
    if repeating:
        room(scene, exposure=0.5, ceiling=0, lamps=0)
        scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 2.1
    else:
        room(scene, exposure=0.5)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.cycles.samples = 200
    camera(scene, *picture(name), span(name))
    scene.render.film_transparent = not repeating
    return scene


def place(x, y):
    """A point of the edge's picture, in CSS pixels from its top left corner, in the scene."""
    return ((x - W / 2) / UNIT_PX, -(y - H / 2) / UNIT_PX)


def height(d_out, x, y):
    z = THICK
    if d_out < 2 * BEAD:
        z += math.sqrt(max(0.0, BEAD ** 2 - (d_out - BEAD) ** 2)) / UNIT_PX * 0.85
    return z


def worn(d_out, x, y):
    return max(0.0, 1.0 - abs(d_out - BEAD) / (BEAD * 0.75))


def edge():
    """The plate's edge, and nothing of its middle: the ground shows there."""
    scene = start("lame", False)
    ground(scene, catcher=True)
    outline = uneven(rounded(MARGIN, MARGIN, W - MARGIN, H - MARGIN, 5.0, step=1.0), rng, 0.5)
    inside = MARGIN + EDGE + 2
    plate = facing_up(band("lame", outline, (inside, inside, W - inside, H - inside), place, height, rings=40, worn=worn))
    plate.data.materials.append(steel("lame", span=7.0, tone=0.085, rough=0.42, rust=0.1, wear=0.8, scratches=0.4, relief=1.2, hammered=0.5, wear_tone=0.38, wear_patchy=0.75, periodic=True))
    head = steel("rivet", span=2.0, tone=0.13, rough=0.34, rust=0.1, relief=0.8)
    corner = MARGIN + 11
    for sx, sy in ((corner, corner), (W - corner, corner), (corner, H - corner), (W - corner, H - corner)):
        rivet("rivet", (*place(sx, sy), THICK + 0.004), 0.085, head)
    path = out("lame")
    render(scene, path)
    pixels = clean(load_rgba(path), floor=0.05)
    # Opaque for most of the slice, then fading out before the slice ends.
    density = spec("lame")["density"]
    rows, cols = pixels.shape[:2]
    down = np.minimum(np.arange(rows), np.arange(rows)[::-1])[:, None] / density
    across = np.minimum(np.arange(cols), np.arange(cols)[::-1])[None, :] / density
    inward = np.minimum(down, across)
    pixels[..., 3] *= np.clip((EDGE - 2 - inward) / 9.0, 0.0, 1.0)
    save_rgba(pixels, path)


def repeat():
    """The steel: a sheet three repeats wide, so that the one in the picture is lit as its neighbours are."""
    scene = start("steel", True)
    across = span("steel")
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=220, y_subdivisions=220, size=across * 3, location=(0, 0, 0))
    sheet = bpy.context.object
    marks = [(rng.uniform(0, across), rng.uniform(0, across), rng.uniform(0.004, 0.011), rng.uniform(0.18, 0.42)) for _ in range(150)]
    co = np.empty(len(sheet.data.vertices) * 3, dtype=np.float32)
    sheet.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    u, v = np.mod(co[:, 0], across), np.mod(co[:, 1], across)
    z = np.zeros(len(co), dtype=np.float32)
    for mx, my, depth, size in marks:
        dx = np.minimum(np.abs(u - mx), across - np.abs(u - mx))
        dy = np.minimum(np.abs(v - my), across - np.abs(v - my))
        z -= depth * np.exp(-(dx * dx + dy * dy) / (size * size))
    co[:, 2] = z
    sheet.data.vertices.foreach_set("co", co.ravel())
    bpy.ops.object.shade_smooth()
    sheet.data.materials.append(steel("ground", span=across, tone=0.085, rough=0.42, relief=1.2, periodic=True))
    render(scene, out("steel"))


edge()
repeat()
