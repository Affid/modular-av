"""Scattered over the map, each camera carries its own piece of the mirror (`pane`): a pane of the black glass in a
rim of the dock frame's molding and silver, exactly the frame layer's box (the reach the theme registers), so
nothing is drawn past it. The rim is 34 tile units wide (4 px on a camera 121 wide), a mirror frame's corner, not a
device's.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from common import GLOW, ROOM, emitter, frame_camera, glow_room, render, reset, sun  # noqa: E402
from measures import PANE_DENSITY, SCALE, VIEW, out  # noqa: E402
from metal import old_silver  # noqa: E402
from molding import profile, ring  # noqa: E402
from pixels import load_rgba, save_rgba  # noqa: E402

BAND = 0.34  # 34 tile units of silver
CORNER = 0.14
scene = reset()
scene.cycles.samples = 160
scene.render.film_transparent = True
frame_camera(scene, PANE_DENSITY)
glow_room(scene)
hw, hh = VIEW["w"] / SCALE / 2, VIEW["h"] / SCALE / 2
sun(scene, "room", (-1.0, 1.0, 1.3), ROOM, 10.0, angle=24)
emitter("deep", (2 * (hw - BAND) - 0.04, 2 * (hh - BAND) - 0.04), (0, 0, -0.12), GLOW, 3.0)

rim = ring("rim", 0, 0, hw, hh, CORNER, profile(BAND, BAND * 0.7), per_side=60, per_corner=12)
rim.data.materials.append(old_silver(scale=1.2, base=0.17, rubbed=0.72, tarnish=(0.012, 0.012, 0.013)))

# The glass: a slab inside the rim, black, polished, a little uneven (old glass), reflecting the room.
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0.012))
glass = bpy.context.object
glass.scale = (2 * (hw - BAND) + 0.04, 2 * (hh - BAND) + 0.04, 1)
bpy.ops.object.modifier_add(type="SUBSURF")
glass.modifiers[0].levels = 3
glass.modifiers[0].subdivision_type = "SIMPLE"
m = bpy.data.materials.new("black glass")
m.use_nodes = True
nt = m.node_tree
b = nt.nodes["Principled BSDF"]
b.inputs["Base Color"].default_value = (0.006, 0.006, 0.008, 1)
b.inputs["Roughness"].default_value = 0.06
b.inputs["Specular IOR Level"].default_value = 0.6
wave = nt.nodes.new("ShaderNodeTexNoise")
wave.inputs["Scale"].default_value = 1.4
bump = nt.nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.06
nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
glass.data.materials.append(m)
render(scene, out("pane"))

# The slab's square corners cleared beyond the rim's rounded outer line.
px = load_rgba(out("pane"))
h, w, _ = px.shape
rows, cols = np.mgrid[0:h, 0:w]
sx, sy = (cols + 0.5) / w * 2 * hw - hw, (rows + 0.5) / h * 2 * hh - hh
cx, cy = np.clip(np.abs(sx), 0, hw - CORNER), np.clip(np.abs(sy), 0, hh - CORNER)
outside = np.hypot(np.abs(sx) - cx, np.abs(sy) - cy) > CORNER
corner = (np.abs(sx) > hw - CORNER) & (np.abs(sy) > hh - CORNER) & outside
px[corner, 3] = 0
save_rgba(px, out("pane"))
