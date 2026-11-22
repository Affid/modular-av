"""The black mirror's glass, as a ground that repeats (`glass`): old black glass with faint flow in it, fine
scratches and smudges. Black glass seen straight on is just black; only its scratches catch a low sun. So: the
photographs each once across (the picture meets itself), and only lights that are the same everywhere (the room and
a sun), or the repeat shows a seam in a wide dock. The room's reflection is a gradient in the stylesheet.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from common import _world, agx, front_camera, luminance, render, reset, sun  # noqa: E402
from measures import out, picture, texture  # noqa: E402
from pixels import load_rgba, save_rgba  # noqa: E402

W, H = picture("glass")
SPAN = 6.0  # scene units across the repeat
# Rendered a sixth larger on every side and cut back to the one repeat: the denoiser and the pixel filter treat an
# image's border apart from its inside, which left the repeat's first and last rows unlike each other (a faint line
# every 300 pixels down a dock). Cut from the inside, the picture's edges are the glass's own and meet.
MARGIN = W // 6
scene = reset()
scene.cycles.samples = 128
agx(scene)
front_camera(scene, W + 2 * MARGIN, H + 2 * MARGIN, SPAN * (W + 2 * MARGIN) / W)
_world(scene, "studio.exr", 0.7)
sun(scene, "low", (-1.0, 1.0, 1.0), (0.95, 0.9, 0.85), 8.0, angle=25)

# Three repeats each way, the camera on the middle one: the picture's edges see glass, never the room behind it
# (a plane cut at the picture's edge left its border pixels lighter, a seam in the dock).
bpy.ops.mesh.primitive_plane_add(size=3 * SPAN)
plane = bpy.context.object
m = bpy.data.materials.new("glass")
m.use_nodes = True
nodes, links = m.node_tree.nodes, m.node_tree.links
bsdf = nodes["Principled BSDF"]


repeat = nodes.new("ShaderNodeMapping")
repeat.inputs["Scale"].default_value = (3.0, 3.0, 1.0)
links.new(nodes.new("ShaderNodeTexCoord").outputs["UV"], repeat.inputs["Vector"])


def img(name, colour=False):
    t = nodes.new("ShaderNodeTexImage")
    links.new(repeat.outputs["Vector"], t.inputs["Vector"])
    t.image = bpy.data.images.load(texture(name))
    if not colour:
        t.image.colorspace_settings.name = "Non-Color"
    return t


def ramp(v, lo, hi, a, b):
    r = nodes.new("ShaderNodeMapRange")
    r.inputs["From Min"].default_value, r.inputs["From Max"].default_value = lo, hi
    r.inputs["To Min"].default_value, r.inputs["To Max"].default_value = a, b
    links.new(v, r.inputs["Value"])
    return r.outputs["Result"]


grain = img("rusty_metal_sheet_diff.jpg", colour=True)
bw = nodes.new("ShaderNodeRGBToBW")
links.new(grain.outputs["Color"], bw.inputs["Color"])
# Flow in the glass: the sheet's patches, all but gone, a touch cold.
flow = ramp(bw.outputs["Val"], 0.05, 0.6, 0.003, 0.018)
col = nodes.new("ShaderNodeCombineColor")
for ch, k in (("Red", 1.0), ("Green", 1.0), ("Blue", 1.12)):
    mm = nodes.new("ShaderNodeMath")
    mm.operation = "MULTIPLY"
    links.new(flow, mm.inputs[0])
    mm.inputs[1].default_value = k
    links.new(mm.outputs["Value"], col.inputs[ch])
links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
# Scratches and wear: a lacquer's own, and smudges from the steel sheet's patches.
scr = img("lacquered_cherry_wood_rough.jpg")
smudge = img("rusty_metal_sheet_rough.jpg")
both = nodes.new("ShaderNodeMath")
both.operation = "MAXIMUM"
links.new(ramp(scr.outputs["Color"], 0.7, 0.95, 0.02, 0.6), both.inputs[0])
links.new(ramp(smudge.outputs["Color"], 0.7, 1.0, 0.02, 0.25), both.inputs[1])
links.new(both.outputs["Value"], bsdf.inputs["Roughness"])
bsdf.inputs["Specular IOR Level"].default_value = 0.6
plane.data.materials.append(m)
render(scene, out("glass"))

px = load_rgba(out("glass"))[MARGIN:MARGIN + H, MARGIN:MARGIN + W].copy()
save_rgba(px, out("glass"))
lum = luminance(px)
# Where the repeat meets itself: the step from its last row (column) to its first, against the step inside it.
wrap_rows = float(np.abs(lum[-1] - lum[0]).mean())
wrap_cols = float(np.abs(lum[:, -1] - lum[:, 0]).mean())
inside = float(np.abs(np.diff(lum, axis=0)).mean())
print("glass MEAN", round(float(lum.mean()), 4), "WRAP rows", round(wrap_rows, 5), "cols", round(wrap_cols, 5),
      "STEP inside", round(inside, 5))
