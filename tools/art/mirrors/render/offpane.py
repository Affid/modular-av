"""A camera that is off (`offpane`): polished black glass with nothing in it, held all the same. It reflects the
room's window, a broad soft light up to the left, and shows what polishing leaves: short fine curved swirls, only
where the window is reflected, so they catch light only there and never read as a break (long straight breaks are
for out of the call alone). The swirls are a height map drawn here (a scratch is a line by nature), fed to the
glass as a bump; the shading is Cycles'. Laid behind the avatar, covering the tile.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from common import front_camera, glow_room, render, reset, sun  # noqa: E402
from measures import out, picture  # noqa: E402
from pixels import save_rgba  # noqa: E402

W, H = picture("offpane")
rng = random.Random(3)

# Polishing swirls: short arcs, a cloth's circling, in the upper left where the window is reflected.
height = np.zeros((H, W), dtype=np.float32)
ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
for k in range(16):
    # Mostly in the upper left half (the window's reflection), a few a little beyond.
    while True:
        cx, cy = rng.uniform(0, W), rng.uniform(0, H)
        if (cx / W) + (cy / H) < rng.uniform(0.6, 1.05):
            break
    r = rng.uniform(18, 55)
    a0 = rng.uniform(0, 2 * math.pi)
    sweep = rng.uniform(0.5, 1.4)
    ang = np.arctan2(ys - cy, xs - cx)
    rel = np.mod(ang - a0, 2 * math.pi)
    on = rel < sweep
    d = np.abs(np.hypot(xs - cx, ys - cy) - r)
    fade = np.clip(np.sin(np.clip(rel / sweep, 0, 1) * math.pi), 0, 1) ** 0.7
    depth = rng.uniform(0.2, 0.5)
    window = np.clip(1.2 - 1.3 * ((xs / W) + (ys / H)) / 1.4, 0, 1)
    height = np.maximum(height, (on * depth * fade * window * np.clip(1.0 - d / 0.7, 0, 1)).astype(np.float32))

scene = reset()

rgba = np.ones((H, W, 4), dtype=np.float32)
rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = 1 - height[::-1]
save_rgba(rgba, out("offpane-height"))
image = bpy.data.images.load(out("offpane-height"))
image.colorspace_settings.name = "Non-Color"

scene.cycles.samples = 128
UNIT = 100.0
front_camera(scene, W, H, W / UNIT)
glow_room(scene)
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
glass = bpy.context.object
glass.scale = (W / UNIT, H / UNIT, 1)
m = bpy.data.materials.new("black glass")
m.use_nodes = True
nt = m.node_tree
b = nt.nodes["Principled BSDF"]
b.inputs["Base Color"].default_value = (0.006, 0.006, 0.008, 1)
b.inputs["Roughness"].default_value = 0.08
b.inputs["Specular IOR Level"].default_value = 0.6
coord = nt.nodes.new("ShaderNodeTexCoord")
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = image
tex.interpolation = "Cubic"
nt.links.new(coord.outputs["UV"], tex.inputs["Vector"])
wave = nt.nodes.new("ShaderNodeTexNoise")
wave.inputs["Scale"].default_value = 1.2
add = nt.nodes.new("ShaderNodeMath")
add.operation = "MULTIPLY_ADD"
nt.links.new(wave.outputs["Fac"], add.inputs[0])
add.inputs[1].default_value = 0.6
nt.links.new(tex.outputs["Color"], add.inputs[2])
bump = nt.nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 1.0
bump.inputs["Distance"].default_value = 0.02
nt.links.new(add.outputs["Value"], bump.inputs["Height"])
nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
# A scratch's floor is ground glass: pale and rough, it scatters the light that falls on it.
inv = nt.nodes.new("ShaderNodeMath")
inv.operation = "SUBTRACT"
inv.inputs[0].default_value = 1.0
nt.links.new(tex.outputs["Color"], inv.inputs[1])
col = nt.nodes.new("ShaderNodeMix")
col.data_type = "RGBA"
col.inputs["A"].default_value = (0.006, 0.006, 0.008, 1)
col.inputs["B"].default_value = (0.03, 0.03, 0.032, 1)
nt.links.new(inv.outputs["Value"], col.inputs["Factor"])
nt.links.new(col.outputs["Result"], b.inputs["Base Color"])
rough = nt.nodes.new("ShaderNodeMapRange")
rough.inputs["To Min"].default_value, rough.inputs["To Max"].default_value = 0.08, 0.7
nt.links.new(inv.outputs["Value"], rough.inputs["Value"])
nt.links.new(rough.outputs["Result"], b.inputs["Roughness"])
glass.data.materials.append(m)

# The room in the glass: a soft window up to the left, reflected; and the light that the scratches catch.
tint, sun_c = (0.72, 0.66, 1.0), (0.8, 0.74, 1.0)
# Seen straight on, the pane gives back what is straight above it: an emitting plane there, unseen by the camera,
# bright up to the left and gone toward the lower right (the room's window, out of focus).
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 4.0))
window = bpy.context.object
window.scale = (W / UNIT * 1.3, H / UNIT * 1.3, 1)
window.visible_camera = False
wm = bpy.data.materials.new("window")
wm.use_nodes = True
wn = wm.node_tree.nodes
wn.clear()
wo = wn.new("ShaderNodeOutputMaterial")
we = wn.new("ShaderNodeEmission")
we.inputs["Color"].default_value = (*tint, 1)
wc = wn.new("ShaderNodeTexCoord")
wsep = wn.new("ShaderNodeSeparateXYZ")
wm.node_tree.links.new(wc.outputs["Generated"], wsep.inputs["Vector"])
diag = wn.new("ShaderNodeMath")
diag.operation = "SUBTRACT"
wm.node_tree.links.new(wsep.outputs["Y"], diag.inputs[0])
wm.node_tree.links.new(wsep.outputs["X"], diag.inputs[1])
ramp = wn.new("ShaderNodeMapRange")
ramp.inputs["From Min"].default_value, ramp.inputs["From Max"].default_value = -0.1, 0.9
ramp.inputs["To Min"].default_value, ramp.inputs["To Max"].default_value = 0.0, 1.6
wm.node_tree.links.new(diag.outputs["Value"], ramp.inputs["Value"])
wm.node_tree.links.new(ramp.outputs["Result"], we.inputs["Strength"])
wm.node_tree.links.new(we.outputs["Emission"], wo.inputs["Surface"])
window.data.materials.append(wm)
sun(scene, "graze", (-1.0, 0.9, 0.35), sun_c, 7, angle=6)
render(scene, out("offpane"))

