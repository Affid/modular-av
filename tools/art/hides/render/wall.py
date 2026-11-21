"""The wall of the hall: dark timbers standing upright, one whole repeat of the photograph each way, so that it
runs on under a dock of any size."""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bpy
import numpy as np

from stuff import surface
from measures import out, picture, span, texture
from studio import camera, render, reset, room

# How many repeats are built round the one in the picture: their relief shades it, so the picture meets itself.
REPEAT = span("wall")
AROUND = 3
SOURCE = "wood_trunk_wall"
RELIEF = 0.22
TINT = (0.62, 0.55, 0.5, 1)

scene = reset()
room(scene, exposure=0.5)
camera(scene, *picture("wall"), REPEAT)
cuts = 420 * AROUND
bpy.ops.mesh.primitive_grid_add(x_subdivisions=cuts, y_subdivisions=cuts, size=REPEAT * AROUND, location=(0, 0, 0))
wall = bpy.context.object
uv = wall.data.uv_layers.active.data
flat = np.empty(len(uv) * 2, dtype=np.float32)
uv.foreach_get("uv", flat)
flat = flat.reshape(-1, 2) * AROUND
uv.foreach_set("uv", flat.ravel())
relief = bpy.data.textures.new("relief", "IMAGE")
relief.image = bpy.data.images.load(texture(f"{SOURCE}_disp.jpg"))
relief.image.colorspace_settings.name = "Non-Color"
relief.extension = "REPEAT"
push = wall.modifiers.new("relief", "DISPLACE")
push.texture, push.texture_coords, push.strength, push.mid_level = relief, "UV", RELIEF, 0.5
bpy.ops.object.shade_smooth()
# No gloss: a sheen would lie differently in each picture, and the pictures have to meet.
wall.data.materials.append(surface("wall", SOURCE, 1.0, tint=TINT, roughness_gain=1.5, specular=0.0, strength=1.2, coords_kind="UV"))
scene.render.film_transparent = False
render(scene, out("wall"))
