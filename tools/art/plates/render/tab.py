"""A button: a small plate of steel, a little domed, hammered, its edge turned down. Rendered grey, as light and
shade alone: the stylesheet lays it over the button's own colour. Two whole plates, so that neighbours differ, and
the two parts of a longer one (a button and the arrow beside it)."""
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bpy
import numpy as np

from measures import out, picture, span
from pixels import load_rgba, save_rgba
from studio import camera, render, reset, room
from steel import steel

HIGH = span("tab-1")  # a button's height, in scene units
PLATES = {"tab-1": 3, "tab-2": 11}  # a seed for each


def tab(rng, width, height):
    """A plate `width` by `height` scene units: flat on top with hammer marks, falling away to its edge, which
    lies just outside the picture."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=96, y_subdivisions=96, size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.scale = (width * 1.08, height * 1.08, 1)
    bpy.ops.object.transform_apply(scale=True)
    co = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    # How far in from the edge, and the turned edge's fall.
    inside = np.minimum(width * 0.54 - np.abs(co[:, 0]), height * 0.54 - np.abs(co[:, 1]))
    z = 0.12 * np.clip(inside / 0.2, 0.0, 1.0) ** 0.5
    # A slight dome, and the hammer.
    z += 0.035 * (1 - (co[:, 0] / (width / 2)) ** 2) * (1 - (co[:, 1] / (height / 2)) ** 2)
    for _ in range(round(14 * width)):
        mx, my = rng.uniform(-width / 2, width / 2), rng.uniform(-height / 2, height / 2)
        depth, size = rng.uniform(0.006, 0.018), rng.uniform(0.12, 0.3)
        z -= depth * np.exp(-((co[:, 0] - mx) ** 2 + (co[:, 1] - my) ** 2) / (size * size))
    co[:, 2] = z
    obj.data.vertices.foreach_set("co", co.ravel())
    bpy.ops.object.shade_smooth()
    obj.data.materials.append(steel("tab", span=9.0, tone=0.3, rough=0.42, scratches=0.25, relief=0.7, periodic=True, shift=(rng.uniform(0, 5), rng.uniform(0, 5))))
    return obj


def shoot(name, seed, pixels, across):
    """One plate `across` scene units wide, as a picture of `pixels` (width, height)."""
    scene = reset()
    room(scene, exposure=-0.35, sun=3.2, ceiling=0, lamps=0)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    scene.view_settings.look = "AgX - High Contrast"
    scene.cycles.samples = 128
    camera(scene, *pixels, across)
    tab(random.Random(seed), across, HIGH)
    scene.render.film_transparent = False
    path = out(name)
    render(scene, path)
    return path


def shade(pixels):
    """Light and shade about a middle grey: laid over a colour by hard light, middle grey changes nothing."""
    grey = pixels[..., 0] * 0.2126 + pixels[..., 1] * 0.7152 + pixels[..., 2] * 0.0722
    stretched = np.clip(0.47 + (grey - np.median(grey)) * 1.9, 0.07, 0.95)
    result = np.ones_like(pixels)
    for channel in range(3):
        result[..., channel] = stretched
    return result


for name, seed in PLATES.items():
    path = shoot(name, seed, picture(name), span(name))
    save_rgba(shade(load_rgba(path)), path)
# The longer plate, cut where the arrow's part begins.
left, right = picture("tab-left"), picture("tab-right")
wide = shoot("tab-wide", 8, (left[0] + right[0], left[1]), span("tab-left") + span("tab-right"))
whole = shade(load_rgba(wide))
os.remove(wide)
save_rgba(whole[:, :left[0]].copy(), out("tab-left"))
save_rgba(whole[:, left[0]:].copy(), out("tab-right"))
