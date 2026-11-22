"""The viewer's level: an iron plate on the bottom strap of their own window, a slot cut through it, and the box's
lamp seen through the slot as far as the voice goes.

  level       the plate, dark, over the frame layer's box (laid over the viewer's frame)
  level-mask  white where the meter may show: the slot, a little grown, over the meter's box
  level-fill  the same plate with the lamp lit behind the slot (its flame, and the light it throws on the slot's
              lips), cut to the meter's box: what the meter shows, as far as the voice goes

The lit picture is a scene built afresh: a second render of one scene, its shadow catcher hidden and shown again,
came out black.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402  (first: the paths)

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import materials as m  # noqa: E402
import shapes  # noqa: E402
from measures import DENSITY, LEVEL, VIEW, box, out, place  # noqa: E402
from pixels import load_rgba, save_rgba  # noqa: E402

SEED = 23
PLATE, SLOT, FILL = box("plate"), box("slot"), box("fill")


def rect_points(b, corner=0.0):
    x0, y0, x1, y1 = b
    c = corner
    pts = [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c),
           (x0, y0 + c)]
    dense = []
    for p, q in zip(pts, pts[1:] + pts[:1]):
        n = max(1, int(math.hypot(q[0] - p[0], q[1] - p[1]) / 6.0))
        dense += [(p[0] + (q[0] - p[0]) * j / n, p[1] + (q[1] - p[1]) * j / n) for j in range(n)]
    return [place(x, y) for x, y in dense]


def chamfer_section(depth, height, chamfer=0.035, steps=12):
    pts = [(0.0, 0.0), (chamfer, height * 0.8)]
    for k in range(1, steps + 1):
        t = k / steps
        pts.append((chamfer + t * (depth - chamfer), height * (0.8 + 0.2 * math.sin(t * math.pi / 2))))
    return pts


def ember():
    """What the slot shows when the lamp is lit: a flame seen through a slit, brightest along its middle line,
    uneven along its length (seeded noise), deep amber at its edges, never white."""
    mat, nodes, links, bsdf = m._new("ember")
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    coord = nodes.new("ShaderNodeNewGeometry")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["Position"], sep.inputs["Vector"])
    cy = place(0, (SLOT[1] + SLOT[3]) / 2)[1]
    half = (SLOT[3] - SLOT[1]) / 2 / 100.0
    off_middle = m._math(nodes, links, "ABSOLUTE", m._math(nodes, links, "SUBTRACT", sep.outputs["Y"], cy))
    across = m._math(nodes, links, "POWER", m._ramp(nodes, links, off_middle, 0.0, half * 1.3, 1.0, 0.0), 1.6)
    flick = m._n(nodes, "ShaderNodeTexNoise", Scale=2.2, Detail=4.0, Roughness=0.55)
    links.new(coord.outputs["Position"], flick.inputs["Vector"])
    heat = m._math(nodes, links, "MULTIPLY", across, m._ramp(nodes, links, flick.outputs["Fac"], 0.3, 0.7, 0.55, 1.15))
    colour = m._mix(nodes, links, (0.40, 0.07, 0.01, 1), (1.0, 0.40, 0.07, 1), m._ramp(nodes, links, heat, 0.15, 0.95))
    links.new(colour, bsdf.inputs["Emission Color"])
    links.new(m._ramp(nodes, links, heat, 0.0, 1.0, 0.12, 0.85), bsdf.inputs["Emission Strength"])
    return mat


def build(lit):
    """The plate and its slot, the slot's back dark or the lamp lit behind it."""
    scene = stage.stage(samples=200, ceiling=False)
    stage.frame_camera(scene)
    catcher = stage.catcher_round_middle(band=20.0)
    metal = m.iron("slot-iron", tone=0.04, scale=0.4, hammer=0.35, facet_scale=5.0, rub=0.16, rub_bright=0.24,
                   edge_width=0.02, offset=(0.7, 0.2, 0))
    plate = shapes.plate("slot-plate", rect_points(PLATE, 14), chamfer_section(0.22, 0.07), metal, z0=0.19,
                         wobble=shapes.wobble_fn(SEED, 0.004, 4.0))
    x0, y0 = place(SLOT[0], SLOT[1])
    x1, y1 = place(SLOT[2], SLOT[3])
    shapes.cut(plate, shapes.outline_solid("slot-cut", [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], 0.0, 0.5, metal,
                                           bevel=0))
    bpy.ops.mesh.primitive_plane_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, 0.195))
    back = bpy.context.object
    back.scale = ((x1 - x0) * 1.1, (y0 - y1) * 1.6, 1)
    back.data.materials.append(ember() if lit else m.black("slot-back"))
    for k, x in enumerate((304, 696)):
        shapes.dome(f"slot-rivet{k}", place(x, (SLOT[1] + SLOT[3]) / 2), 0.08, 0.04, metal, z=0.255)
    if lit:
        data = bpy.data.lights.new("slot-lamp", "AREA")
        data.shape, data.size, data.size_y = "RECTANGLE", (x1 - x0) * 1.05, (y0 - y1) * 1.3
        data.energy, data.color = 90.0, (1.0, 0.5, 0.2)
        lamp = bpy.data.objects.new("slot-lamp", data)
        lamp.location = ((x0 + x1) / 2, (y0 + y1) / 2, 0.205)
        lamp.rotation_euler = (math.pi, 0, 0)
        lamp.visible_camera = False
        scene.collection.objects.link(lamp)
    return scene, catcher


def mask(path, grow=5.0, radius=8.0, soft=6.0):
    """White where the level may show (the slot grown by `grow`, its corners rounded), over the meter's box."""
    x0, y0, x1, y1 = FILL
    k = LEVEL["maskDensity"]
    w, h = int(round((x1 - x0) * k)), int(round((y1 - y0) * k))
    ys, xs = np.mgrid[0:h, 0:w]
    tx, ty = x0 + (xs + 0.5) / k, y0 + (ys + 0.5) / k
    sx0, sy0, sx1, sy1 = SLOT[0] - grow, SLOT[1] - grow, SLOT[2] + grow, SLOT[3] + grow
    cx = np.clip(tx, sx0 + radius, sx1 - radius)
    cy = np.clip(ty, sy0 + radius, sy1 - radius)
    d = np.sqrt((tx - cx) ** 2 + (ty - cy) ** 2) - radius
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., 3] = np.clip(0.5 - d / soft, 0.0, 1.0)
    save_rgba(rgba[::-1], path)  # rows run up in Blender's pictures


def crop_fill(pixels):
    """The part of a frame-sized render (rows run up) over the meter's box, rows still running up."""
    h = pixels.shape[0]
    x0 = int(round((FILL[0] - VIEW["x"]) * DENSITY))
    x1 = int(round((FILL[2] - VIEW["x"]) * DENSITY))
    yt = int(round((FILL[1] - VIEW["y"]) * DENSITY))
    yb = int(round((FILL[3] - VIEW["y"]) * DENSITY))
    return pixels[h - yb:h - yt, x0:x1].copy()


def main():
    scene, catcher = build(lit=False)
    stage.finish_frame(scene, catcher, "level")
    mask(out("level-mask"))
    scene, _ = build(lit=True)
    path = out("level-fill")
    stage.render(scene, path)
    save_rgba(crop_fill(load_rgba(path)), path)


main()
