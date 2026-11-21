"""The name's plate: a plain plate of old bone, laid on the scroll to hold it and to mark it.

The stylesheet cuts it in three: the ends keep their shape and the middle stretches with the name.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths

import bpy

from materials import bone
from measures import out, picture, span
from pixels import clean, load_rgba, save_rgba
from shapes import ground
from studio import camera, render, reset, room

scene = reset()
room(scene, exposure=0.55)
scene.view_settings.look = "AgX - Medium High Contrast"
width, height = picture("plate")
camera(scene, width, height, span("plate"))
ground(scene, catcher=True)
scene.render.film_transparent = True
# Thin: its shadow is a line, not a ledge. A little above the picture's middle, which leaves room for that shadow.
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.12, 0.035))
plate = bpy.context.object
plate.scale = (3.6, 0.84, 0.07)
bpy.ops.object.transform_apply(scale=True)
bevel = plate.modifiers.new("bevel", "BEVEL")
bevel.width, bevel.segments = 0.034, 5
bpy.ops.object.shade_smooth()
plate.data.materials.append(bone("bone"))
path = out("plate")
render(scene, path)
save_rgba(clean(load_rgba(path), floor=0.16), path)
