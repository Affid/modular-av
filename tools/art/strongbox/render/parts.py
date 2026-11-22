"""The box's small parts, each a picture of a size of its own on screen:

  button, button-pressed    a small forged iron plate with four rivets, cut in nine for every button and state
                            icon; pressed, the plate sunk in its rim and the lamp catching the rim's lower lip
  padlock                   a hasp hanging from the dock's top strap, a small iron padlock through its staple
  bracket-tl, -tr, -bl, -br the box's corner brackets, folded iron angles, rendered together in one light
  wear                      where stencilled paint has worn off a board, a mask that repeats, taken from the wood
                            photograph's own grain (white keeps the paint)
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402  (first: the paths)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

import materials  # noqa: E402
import shapes  # noqa: E402
from measures import out, picture, texture  # noqa: E402
from pixels import load_rgba, save_rgba, soften  # noqa: E402

SEED = 23


def square(half, corner):
    pts = [(half - corner, -half), (half, -half + corner), (half, half - corner), (half - corner, half),
           (-half + corner, half), (-half, half - corner), (-half, -half + corner), (-half + corner, -half)]
    dense = []
    for p, q in zip(pts, pts[1:] + pts[:1]):
        n = max(1, int(math.hypot(q[0] - p[0], q[1] - p[1]) / 0.02))
        dense += [(p[0] + (q[0] - p[0]) * j / n, p[1] + (q[1] - p[1]) * j / n) for j in range(n)]
    return dense


def chamfer_section(depth, height, chamfer=0.035, steps=12):
    pts = [(0.0, 0.0), (chamfer, height * 0.8)]
    for k in range(1, steps + 1):
        t = k / steps
        pts.append((chamfer + t * (depth - chamfer), height * (0.8 + 0.2 * math.sin(t * math.pi / 2))))
    return pts


def warm_from_below(scene, colour, energy):
    """The lamp low under a pressed button: it grazes the sunk face and lights the rim's lower lip."""
    data = bpy.data.lights.new("warm", "AREA")
    data.shape, data.size, data.size_y = "RECTANGLE", 0.8, 0.2
    data.energy, data.color = energy, colour
    light = bpy.data.objects.new("warm", data)
    light.location = (0, -0.5, 0.08)
    light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat("-Z", "Y").to_euler()
    light.visible_camera = False
    scene.collection.objects.link(light)


def button(pressed):
    """A button's plate; at rest it swells a little, pressed it is sunk below a raised rim."""
    name = "button-pressed" if pressed else "button"
    px, _ = picture(name)
    span = px / 100.0
    scene = stage.stage(samples=200, lamps=True, ceiling=False)
    stage.front_camera(scene, px, px, span)
    half = span / 2 - 0.01
    metal = materials.iron("btn-iron", tone=0.026 if pressed else 0.036, scale=1.2, hammer=0.3, facet_scale=4.0,
                           rub=0.14, rub_bright=0.22, edge_width=0.012, offset=(0.3 if pressed else 0.0, 0, 0))
    section = ([(0.0, 0.0), (0.03, 0.05), (0.06, 0.055), (0.085, 0.022), (0.2, 0.018)] if pressed
               else chamfer_section(0.2, 0.05, chamfer=0.03))
    shapes.plate("btn", square(half, 0.06), section, metal, z0=0.0,
                 wobble=shapes.wobble_fn(SEED + (3 if pressed else 0), 0.003, 9.0))
    c = half - 0.045
    for k, (x, y) in enumerate(((-c, -c), (c, -c), (-c, c), (c, c))):
        shapes.dome(f"r{k}", (x, y), 0.026, 0.016, metal, z=0.048)
    if pressed:
        warm_from_below(scene, (1.0, 0.55, 0.25), 18.0)
    stage.render(scene, out(name))


def padlock():
    """The hasp down from the dock's top edge, its staple through the hasp's slot, and a padlock on the staple:
    the shackle rubbed bright so it parts from the staple, the body a shade lighter than the hasp."""
    w, h = picture("padlock")
    scene = stage.stage(samples=220, ceiling=False)
    stage.front_camera(scene, w, h, 1.0, fit="VERTICAL")
    iron = materials.iron("lock-iron", tone=0.036, scale=1.6, hammer=0.35, facet_scale=6.0, rub=0.14,
                          rub_bright=0.24, edge_width=0.012)
    body_iron = materials.iron("body-iron", tone=0.06, scale=1.6, hammer=0.35, facet_scale=6.0, rub=0.2,
                               rub_bright=0.3, edge_width=0.015, offset=(0.3, 0.4, 0))
    bright = materials.iron("shackle-iron", tone=0.09, scale=2.0, hammer=0.1, rub=0.45, rub_bright=0.5,
                            edge_width=0.02)
    top = 0.5
    hasp = [(-0.1, top + 0.05), (0.1, top + 0.05), (0.1, top - 0.36), (0.0, top - 0.44), (-0.1, top - 0.36)]
    shapes.outline_solid("hasp", hasp, 0.0, 0.04, iron, bevel=0.01, segments=2)
    shapes.dome("hasp-rivet", (0, top - 0.06), 0.035, 0.02, iron, z=0.035)
    shapes.tube_along("staple", [(-0.045, top - 0.3, 0.02), (-0.045, top - 0.3, 0.09), (0.045, top - 0.3, 0.09),
                                 (0.045, top - 0.3, 0.02)], 0.016, iron)
    body_y = top - 0.72
    leg_top = top - 0.345
    shackle = [(-0.075, body_y + 0.1, 0.07), (-0.075, leg_top, 0.1)]
    for k in range(1, 16):
        a = math.pi - math.pi * k / 16
        shackle.append((0.075 * math.cos(a), leg_top + 0.075 * math.sin(a), 0.1))
    shackle += [(0.075, leg_top, 0.1), (0.075, body_y + 0.1, 0.07)]
    shapes.tube_along("shackle", shackle, 0.026, bright)
    body = shapes.circle_points(0.0, body_y - 0.02, 0.2, 40, math.pi, 2 * math.pi)
    body += [(0.2, body_y + 0.14), (-0.2, body_y + 0.14)]
    lock = shapes.plate("lock-body", body, [(0.0, 0.0), (0.03, 0.06), (0.1, 0.085), (0.22, 0.095)], body_iron)
    kh = shapes.keyhole_points(0.0, body_y, 0.035, 0.015, 0.025, 0.11)
    shapes.cut(lock, shapes.outline_solid("kh", kh, 0.05, 0.3, iron, bevel=0))
    bpy.ops.mesh.primitive_circle_add(vertices=24, radius=0.1, fill_type="NGON", location=(0.0, body_y - 0.04, 0.05))
    bpy.context.object.data.materials.append(materials.black("kh-dark"))
    stage.render(scene, out("padlock"))


def brackets():
    """Four L-shaped angles of folded iron, each leg ending in a rounded point, three rivets each: one picture
    in one light, saved as its four quarters."""
    side, _ = picture("bracket-tl")
    px = side * 2
    span = px / 100.0
    scene = stage.stage(samples=200, lamps=False, ceiling=False)
    stage.front_camera(scene, px, px, span)
    iron = materials.iron("bracket-iron", tone=0.055, scale=1.4, hammer=0.45, facet_scale=6.0, rub=0.22,
                          rub_bright=0.32, edge_width=0.014)
    half = span / 2
    leg, width = 0.5, 0.25
    local = [(0, 0), (leg, 0), (leg + 0.05, -width * 0.5), (leg, -width), (width, -width), (width, -leg),
             (width * 0.5, -leg - 0.05), (0, -leg)]
    heads = ((width * 0.5, -width * 0.5), (leg - 0.07, -width * 0.5), (width * 0.5, -leg + 0.07))
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * half, sy * half
            pts = [(cx - sx * x, cy + sy * y) for x, y in local]
            shapes.outline_solid(f"br{sx}{sy}", pts, 0.0, 0.07, iron, bevel=0.016, segments=2)
            for k, (x, y) in enumerate(heads):
                shapes.dome(f"brr{sx}{sy}{k}", (cx - sx * x, cy + sy * y), 0.04, 0.025, iron, z=0.065)
    path = out("bracket")
    stage.render(scene, path)
    whole = load_rgba(path)
    n = side
    # Rows run up: the top half of the picture is rows n.. of the array.
    for name, rows, cols in (("tl", slice(n, px), slice(0, n)), ("tr", slice(n, px), slice(n, px)),
                             ("bl", slice(0, n), slice(0, n)), ("br", slice(0, n), slice(n, px))):
        save_rgba(whole[rows, cols].copy(), out(f"bracket-{name}"))


def wear():
    """The stencil's wear: one board's grain from the photograph (its dark streaks, kept by a high pass), squeezed
    to the mask's size. Alpha is how much paint is left."""
    px = load_rgba(texture("dark_wooden_planks_diff.jpg"))
    grey = px[..., 0] * 0.3 + px[..., 1] * 0.59 + px[..., 2] * 0.11
    h = grey.shape[0]
    band = grey[int(h * 0.4):int(h * 0.4) + 256, :]
    detail = band - soften(band, 24)
    mw, mh = picture("wear")
    ys = (np.arange(mh) * band.shape[0] / mh).astype(int)
    xs = (np.arange(mw) * band.shape[1] / mw).astype(int)
    keep = np.clip((detail[np.ix_(ys, xs)] + 0.05) / 0.06, 0.0, 1.0)
    rgba = np.ones((mh, mw, 4), dtype=np.float32)
    rgba[..., 3] = 0.35 + 0.65 * keep
    save_rgba(rgba, out("wear"))
    print("WEAR KEPT (mean alpha):", float(rgba[..., 3].mean()))


button(False)
button(True)
padlock()
brackets()
wear()
