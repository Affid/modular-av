"""The knife under the name, on the viewer's own plate: a by-knife carried in two staples, ready to hand. Two
pictures:
    knife  fills the frame layer: the knife and its shadow on the plate
    blade  the blade alone, cut to the level's box: the meter's mask, so the level shines along the blade
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bpy
import numpy as np

from forms import cord, rivet
from measures import DENSITY, KNIFE, LEVEL, SCALE, VIEW, frame_pixels, out, pixel, place
from pixels import load_rgba, save_rgba
from stage import close_shadow
from studio import camera, render, reset, room
from steel import steel
from stuff import leather

THICK = 0.11  # the plate's top above the mail, in scene units
Y = KNIFE["y"]
GUARD, TIP = KNIFE["guard"], KNIFE["tip"]


def forge_blade(scene):
    """The blade: a ridge down its middle, two flat faces, a taper to the point."""
    verts, faces = [], []
    stations = 40
    for i in range(stations + 1):
        t = i / stations
        px, py = place(GUARD + (TIP - GUARD) * t, Y)
        w = KNIFE["half"] * (1 - t ** 2.6) * (1 - 0.25 * t) / SCALE
        z = THICK + 0.012
        verts += [(px, py + w, z), (px, py, z + 0.05 * (1 - 0.6 * t)), (px, py - w, z)]
    for i in range(stations):
        a, b = i * 3, (i + 1) * 3
        faces += [(a, b, b + 1, a + 1), (a + 1, b + 1, b + 2, a + 2)]
    mesh = bpy.data.meshes.new("blade")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    if sum(p.normal.z for p in mesh.polygons) < 0:
        mesh.flip_normals()
    blade = bpy.data.objects.new("blade", mesh)
    scene.collection.objects.link(blade)
    mesh.materials.append(steel("blade", span=5.0, tone=0.11, rough=0.34, rust=0.05, scratches=0.3, relief=0.7))
    return blade


def hilt(iron):
    """The guard, a grip wound with a leather thong, and the pommel."""
    gx, gy = place(GUARD - 4, Y)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(gx, gy, THICK + 0.05))
    guard = bpy.context.object
    guard.scale = (0.09, 0.46, 0.09)
    bevel = guard.modifiers.new("soft", "BEVEL")
    bevel.width, bevel.segments = 0.02, 3
    guard.data.materials.append(iron)
    g0, g1 = place(KNIFE["gripFrom"], Y), place(KNIFE["gripTo"], Y)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.085, depth=g1[0] - g0[0], location=((g0[0] + g1[0]) / 2, g0[1], THICK + 0.06), rotation=(0, math.pi / 2, 0))
    grip = bpy.context.object
    bpy.ops.object.shade_smooth()
    grip.scale = (0.7, 1.0, 1.0)
    thong = leather("grip", tint=(0.3, 0.22, 0.16, 1))
    grip.data.materials.append(thong)
    turns = 9
    for k in range(turns):
        x = g0[0] + (g1[0] - g0[0]) * (k + 0.5) / turns
        cord("wrap", [(x - 0.02, g0[1] - 0.09, THICK + 0.02), (x - 0.01, g0[1] - 0.05, THICK + 0.135), (x + 0.01, g0[1] + 0.05, THICK + 0.135), (x + 0.02, g0[1] + 0.09, THICK + 0.02)], 0.022, thong)
    rivet("pommel", (*place(KNIFE["pommel"], Y), THICK + 0.06), 0.12, iron, squash=0.6)


def staples(iron):
    """Two staples hold it: over the blade near the guard, and near the point."""
    for x, reach in ((GUARD + 70.0, 21.0), (TIP - 95.0, 12.0)):
        sx, sy = place(x, Y)
        r = reach / SCALE
        cord("staple", [(sx, sy - r, THICK - 0.01), (sx, sy - r, THICK + 0.07), (sx, sy, THICK + 0.1), (sx, sy + r, THICK + 0.07), (sx, sy + r, THICK - 0.01)], 0.022, iron)


scene = reset()
room(scene, exposure=0.5)
scene.view_settings.look = "AgX - Medium High Contrast"
scene.cycles.samples = 200
camera(scene, *frame_pixels(), VIEW["w"] / SCALE)
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, THICK))
plate = bpy.context.object
plate.is_shadow_catcher = True
scene.render.film_transparent = True
blade = forge_blade(scene)
iron = steel("fittings", span=2.0, tone=0.13, rough=0.4, rust=0.2, relief=1.0)
hilt(iron)
staples(iron)
path = out("knife")
save_rgba(close_shadow(scene, plate, path, round(9 * DENSITY)), path)

# The blade alone, cut to the level's box: what is in the way of it (the staples) is cut out of it.
plate.hide_render = True
for obj in scene.objects:
    if obj.type in ("MESH", "CURVE") and obj is not blade and obj is not plate:
        obj.is_holdout = True
scene.cycles.samples = 32
alone = out("blade")
render(scene, alone)
pixels = load_rgba(alone)
x0, y0 = pixel(LEVEL["left"], LEVEL["top"])
x1, y1 = pixel(LEVEL["right"], LEVEL["bottom"])
rows = pixels.shape[0]
cut = np.ones((y1 - y0, x1 - x0, 4), dtype=np.float32)
cut[..., 3] = pixels[rows - y1:rows - y0, x0:x1, 3]
save_rgba(cut, alone)
