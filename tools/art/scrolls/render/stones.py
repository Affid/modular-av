"""The four stones that hold a camera's scroll open, rendered where they lie in the frame layer.

Without colour: the stylesheet gives each player's. Four pictures for each of the two scrolls: the stones, their
shadow, their flashes, and a glow for a voice.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths

import numpy as np

from materials import gem_glass, glass, plain
from measures import SCALE, STONES, VIEW, frame_pixels, out, place
from pixels import load_rgba, luminance, save_rgba, shadow_only, soften
from shapes import brilliant, ground, lay_down
from studio import camera, render, reset, room


# How far from a stone's middle its shadow may show, in the stone's radii, and over how much of that it fades.
SHADOW_REACH = 2.0
SHADOW_FADE = 0.4


def near_stones(shape, specs):
    """1 near a stone and 0 away from all of them: a pixel is a tile unit, and rows run from the bottom up."""
    height, width = shape
    rows, columns = np.mgrid[0:height, 0:width]
    near = np.zeros(shape, dtype=np.float32)
    for spec in specs:
        x, y = spec["x"] - VIEW["x"], height - (spec["y"] - VIEW["y"])
        away = np.hypot(columns - x, rows - y) / spec["radius"]
        near = np.maximum(near, np.clip((SHADOW_REACH - away) / SHADOW_FADE, 0.0, 1.0))
    return near


def stones(number, specs):
    scene = reset()
    room(scene)
    width, height = frame_pixels()
    camera(scene, width, height, VIEW["w"] / SCALE)
    # Under the stones, the sheet they lie on: it is what one sees through them.
    under = ground(scene, plain("sheet", (0.66, 0.5, 0.2, 1), 0.9))
    clear = gem_glass("clear", (1, 1, 1), 0.0, 2.0)
    made = []
    for spec in specs:
        stone = brilliant("stone", spec["radius"] / SCALE)
        x, y = place(spec["x"], spec["y"])
        stone.location = (x, y, 0)
        stone.data.materials.append(clear)
        # Each lies on a facet of its own, turned its own way.
        lay_down(stone, spec["spin"], spec["facet"])
        made.append(stone)
    under.visible_camera = False
    scene.render.film_transparent = True
    path = out(f"stones-{number}")
    render(scene, path)
    # Their shadow, as if they let no light through: the stylesheet lays their colour into it.
    solid = glass("solid", (1, 1, 1, 1), 2.0)
    for stone in made:
        stone.data.materials[0] = solid
    under.data.materials[0] = plain("white", (0.8, 0.8, 0.8, 1), 1.0)
    scene.cycles.samples = 256
    shadow_path = out(f"shadow-{number}")
    shadow_only(scene, made, under, shadow_path)
    # Only by the stones: elsewhere the two renders differ by their noise alone, and that would lie on faces.
    shadow = load_rgba(shadow_path)
    shadow[..., 3] *= near_stones(shadow.shape[:2], specs)
    save_rgba(shadow, shadow_path)
    pixels = load_rgba(path)
    # Their flashes: where a facet is brightest. They stay white over the player's colour.
    spark = np.ones_like(pixels)
    spark[..., 3] = np.clip((luminance(pixels) - 0.68) / 0.3, 0, 1) * pixels[..., 3] * 0.85
    save_rgba(spark, out(f"spark-{number}"))
    glow = np.ones_like(pixels)
    glow[..., 3] = np.clip(soften(pixels[..., 3], 10) * 1.5, 0, 1)
    save_rgba(glow, out(f"glow-{number}"))


for number, specs in enumerate(STONES, start=1):
    stones(number, specs)
