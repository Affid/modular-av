"""A wizard's wand lying on the desk, for when the cameras leave a lot of room: turned dark wood, a grip cut
with rings, two brass bands, a long taper. Only the wand and its shadow are kept."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths

import bpy

from materials import desk_wood, metal, photographed
from measures import out, picture, span
from pixels import clean, load_rgba, save_rgba
from shapes import ground, lathe
from studio import camera, render, reset, room

scene = reset()
room(scene)
width, height = picture("wand")
camera(scene, width, height, span("wand"))
ground(scene, desk_wood(), catcher=True)
scene.render.film_transparent = True
scene.cycles.samples = 512

# Turned on a lathe, from the pommel (height 0) to the tip.
profile = [(0.0, 0.0), (0.07, 0.01), (0.115, 0.08), (0.12, 0.16), (0.085, 0.26), (0.075, 0.3)]
for i in range(6):  # the grip's rings
    z = 0.34 + i * 0.2
    profile += [(0.098, z), (0.106, z + 0.07), (0.098, z + 0.14), (0.082, z + 0.17)]
profile += [(0.09, 1.56), (0.125, 1.62), (0.13, 1.7), (0.1, 1.78), (0.078, 1.86)]
for step in range(1, 13):  # the taper, a little swollen in its first third as turned wands are
    t = step / 12
    profile.append((0.078 - 0.05 * t + 0.008 * math.sin(t * math.pi), 1.86 + t * 5.3))
profile += [(0.012, 7.2), (0.0, 7.22)]
# How much thicker and longer than the profile above: it nearly spans the dock.
THICK, LONG = 1.7, 1.4
wand = lathe("wand", [(r * THICK, z * LONG) for r, z in profile], 64)
wand.data.materials.append(photographed("wandwood", "dark_wood", 2.4, tint=(0.62, 0.42, 0.3, 1), roughness_gain=0.5))
bands = metal("brass", (0.78, 0.55, 0.2, 1), 0.3)
for z in (0.28, 1.86):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.084 * THICK, minor_radius=0.022 * THICK, location=(0, 0, z * LONG))
    band = bpy.context.object
    band.data.materials.append(bands)
    band.parent = wand
    bpy.ops.object.shade_smooth()
# Lying on the desk, at a slant across the picture: resting on its thickest ring, its tip barely off the wood.
wand.rotation_euler = (0, math.radians(90.7), math.radians(8))
wand.location = (-5.0, -0.72, 0.135 * THICK)
path = out("wand")
render(scene, path)
save_rgba(clean(load_rgba(path), floor=0.2, shadow_fade=18), path)
