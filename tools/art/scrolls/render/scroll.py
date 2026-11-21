"""A camera's scroll: a worn sheet of vellum with a roll at each side, on turned wooden rods.

The frame layer's picture: clear where the camera shows through, with the scroll's shadow on the desk in its
transparency. Two scrolls, so that neighbours differ.
"""
import math
import random
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths

import bpy

from materials import photographed, vellum
from measures import SCALE, TILE, VIEW, frame_pixels, out, place
from pixels import clean, load_rgba, save_rgba
from shapes import ground, lathe, sheet, worn_outline
from studio import camera, render, reset, room

# Each scroll's seed: the wear of its edges.
SEEDS = (11, 23)
# How far past the picture the sheet runs, in tile units: under its rolls at the sides, above and below.
SHEET = dict(side=40, top=26, bottom=134)
# Where the rolls lie: their middle past the picture's sides, and how far they run past its top and bottom.
ROLL = dict(side=38, top=19, bottom=137)
# How far the vellum covers the picture's edge before it fades: the picture is in the paper, not on it.
COVER = 15
# The turns of a roll, from the outside in: each radius, and how much shorter than the rod's length.
TURNS = ((0.33, 0.26), (0.285, 0.1), (0.235, 0.0))
KNOB = [(0.0, 0.0), (0.09, 0.0), (0.09, 0.1), (0.15, 0.14), (0.17, 0.2), (0.13, 0.27), (0.06, 0.3), (0.0, 0.31)]


def roll(x, paper, wood):
    """The sheet wound up on a rod: each turn a little shorter than the one inside it, a knob at each end."""
    top, bottom = place(0, -ROLL["top"])[1], place(0, TILE["h"] + ROLL["bottom"])[1]
    middle, length = (top + bottom) / 2, top - bottom
    for radius, shorter in TURNS:
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=length - shorter, location=(x, middle, 0.33), rotation=(math.pi / 2, 0, 0))
        turn = bpy.context.object
        turn.data.materials.append(paper)
        bpy.ops.object.shade_smooth()
        bevel = turn.modifiers.new("edge", "BEVEL")
        bevel.width, bevel.segments = 0.02, 2
    # The sheet's loose edge along the roll: a thin lip that catches the light and throws a line of shade.
    inward = 1 if x < 0 else -1
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x + 0.2 * inward, middle, 0.6), rotation=(0, math.radians(38 * inward), 0))
    lip = bpy.context.object
    lip.scale = (0.012, length - 0.3, 0.2)
    lip.data.materials.append(paper)
    for end, way in ((top, 1), (bottom, -1)):
        knob = lathe("knob", KNOB, 32)
        knob.location = (x, end, 0.33)
        knob.rotation_euler = (-way * math.pi / 2, 0, 0)
        knob.data.materials.append(wood)


def scroll(seed, path):
    rng = random.Random(seed)
    scene = reset()
    room(scene, exposure=0.6)
    scene.view_settings.look = "AgX - Medium High Contrast"
    width, height = frame_pixels()
    camera(scene, width, height, VIEW["w"] / SCALE)
    ground(scene, catcher=True)
    scene.render.film_transparent = True
    (x0, y1), (x1, y0) = place(-SHEET["side"], -SHEET["top"]), place(TILE["w"] + SHEET["side"], TILE["h"] + SHEET["bottom"])
    page = sheet("sheet", worn_outline(rng, x0, y0, x1, y1), z=0.012)
    page.data.materials.append(vellum("vellum", box=(x0 - 0.5, y0, x1 + 0.5, y1)))
    wood = photographed("rod", "smoked_walnut_veneer", 3.0, tint=(0.5, 0.36, 0.26, 1))
    rolled = vellum("rolled", span=5.0)
    for x_tile in (-ROLL["side"], TILE["w"] + ROLL["side"]):
        roll(place(x_tile, 0)[0], rolled, wood)
    render(scene, path)
    # Open the sheet where the picture is, a little inside its edge, so the picture fades into the vellum.
    hole = (
        round(COVER - VIEW["x"]),
        round(COVER - VIEW["y"]),
        round(TILE["w"] - COVER - VIEW["x"]),
        round(TILE["h"] - COVER - VIEW["y"]),
    )
    save_rgba(clean(load_rgba(path), hole=hole, floor=0.06, feather=2, shadow_fade=18), path)


for number, seed in enumerate(SEEDS, start=1):
    scroll(seed, out(f"scroll-{number}"))
