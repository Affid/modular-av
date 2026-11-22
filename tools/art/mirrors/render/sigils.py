"""Your own level: nine marks cut into the black glass above your picture, which light from inside as far as your
voice goes. Three pictures of the level's box (measures.json, level):

  sigil-cut    the cuts as they are, unlit: frosted V grooves with a lip that catches the room
  sigil-mask   where the meter may show: in the grooves, most in their depth, and a faint breath round them
  sigil-shade  the groove's near wall, in shadow, laid over the meter's light: light inside a cut, not a glyph

A chisel cut: each stroke a V groove whose depth wanders along it (a hand cut it) and runs out at its ends. No mark
has a stem with side ticks (they read as runes), each is uneven and has a curve or a drilled pit; none crosses
itself into a letter (the fifth read as an X, the eighth as a k: now a crescent with a pit, and a claw's two
scratches). The light sits in the grooves' depth and fades up their walls, and the breath round them is faint, so a
lit mark is light held in a cut, never a glowing line.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from common import _world, agx, front_camera, luminance, render, reset, sun  # noqa: E402
from measures import LEVEL, out, picture  # noqa: E402
from pixels import load_rgba, save_rgba, soften  # noqa: E402

W, H = picture("sigil-cut")
N = LEVEL["marks"]
PITCH = W / N
SCALE = 0.74
HALF = 5.0  # the groove's half width, in pixels of this picture
DEEP = 5.0  # its deepest, in pixels
HALO_R, HALO = 13.0, 0.12
SHADE = 0.6
rng = random.Random(23)


def line(a, b):
    return [a, b]


def quad(a, c, b, n=16):
    return [((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
             (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]) for t in (k / n for k in range(n + 1))]


def arc(cx, cy, r, a0, a1, n=28):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def dot(x, y):
    """A drilled pit."""
    return [(x, y), (x + 0.6, y + 0.4)]


# Nine marks in a box 64 wide and 84 high, its middle at 0, 0, y down: a sweep and a pit; a slash run into a hook;
# a cup over a slash; a zigzag ending in a curl; a crescent with a pit and a nick; a long S; a knee with a pit; a
# claw's two scratches and a pit; a spiral fragment with a tick.
MARKS = [
    [quad((-20, 32), (-26, -30), (16, -34)), dot(12, 12)],
    [line((-18, -36), (4, 8)), quad((4, 8), (28, 18), (8, 38)), dot(-16, 24)],
    [arc(0, -12, 20, 190, 350), line((-18, 12), (20, 36))],
    [[(-24, -6), (-10, -24), (4, -4), (20, -22)], quad((20, -22), (30, 10), (6, 24)), dot(-14, 26)],
    [arc(2, 4, 22, 150, 330), dot(4, 2), line((21, -8), (27, -26))],
    [quad((-24, -8), (-8, -34), (4, -6)), quad((4, -6), (16, 20), (24, -12)), line((-6, 10), (-14, 36))],
    [line((-14, -38), (8, 14)), quad((8, 14), (4, 40), (-20, 30)), dot(16, -20)],
    [quad((-22, -26), (-6, 0), (-16, 30)), quad((-4, -30), (12, -4), (2, 26)), dot(18, 20)],
    [arc(2, 2, 24, 200, 470), arc(2, 2, 13, 110, 280), line((-20, -30), (-10, -38))],
]


def samples(points, step=1.0):
    """Points every `step` pixels along a polyline, with a depth that wanders and runs out at both ends."""
    pts = []
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / step))
        pts += [(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n) for k in range(n)]
    pts.append(points[-1])
    n = len(pts)
    phase, rate = rng.uniform(0, 6.28), rng.uniform(0.05, 0.11)
    out_ = []
    for k, (x, y) in enumerate(pts):
        ends = min(1.0, k / 6.0, (n - 1 - k) / 6.0) if n > 12 else 0.8
        wander = 0.72 + 0.28 * math.sin(phase + k * rate) + rng.uniform(-0.05, 0.05)
        out_.append((x, y, max(0.25, ends) * wander))
    return out_


def carve():
    """The grooves' depth (0 to 1) and a round halo round them, as pixels (rows top down)."""
    depth = np.zeros((H, W), dtype=np.float32)
    near = np.zeros((H, W), dtype=np.float32)
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    for i, mark in enumerate(MARKS):
        cx, cy = PITCH * (i + 0.5), H / 2
        x0, x1 = int(cx - PITCH / 2), int(cx + PITCH / 2)
        sub_x, sub_y = xs[:, x0:x1], ys[:, x0:x1]
        for stroke in mark:
            pts = samples([(cx + x * SCALE, cy + y * SCALE) for x, y in stroke], step=0.8)
            best = np.zeros_like(sub_x)
            glow = np.zeros_like(sub_x)
            for px_, py_, d in pts:
                r = np.hypot(sub_x - px_, sub_y - py_)
                np.maximum(best, d * np.clip(1 - r / HALF, 0, 1), out=best)
                np.maximum(glow, np.exp(-((r / HALO_R) ** 2)), out=glow)
            np.maximum(depth[:, x0:x1], best, out=depth[:, x0:x1])
            np.maximum(near[:, x0:x1], glow, out=near[:, x0:x1])
    return depth, near


def cut_glass(depth):
    """The glass as a grid with a vertex at each pixel, sunk where cut; the cut faces ground, so frosted."""
    verts = [((x + 0.5 - W / 2) / 100.0, (H / 2 - y - 0.5) / 100.0, -float(depth[y, x]) * DEEP / 100.0)
             for y in range(H) for x in range(W)]
    faces = [(y * W + x, y * W + x + 1, (y + 1) * W + x + 1, (y + 1) * W + x) for y in range(H - 1) for x in range(W - 1)]
    mesh = bpy.data.meshes.new("glass")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    if sum(p.normal.z for p in mesh.polygons[:100]) < 0:
        mesh.flip_normals()
    for p in mesh.polygons:
        p.use_smooth = True
    glass = bpy.data.objects.new("glass", mesh)
    bpy.context.scene.collection.objects.link(glass)
    m = bpy.data.materials.new("black glass")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    cutness = mesh.color_attributes.new("cut", "FLOAT_COLOR", "POINT")
    cutness.data.foreach_set("color", np.repeat((depth > 0.02).astype(np.float32).ravel(), 4))
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "cut"
    col = nt.nodes.new("ShaderNodeMix")
    col.data_type = "RGBA"
    col.inputs["A"].default_value = (0.01, 0.01, 0.012, 1)
    col.inputs["B"].default_value = (0.06, 0.06, 0.06, 1)
    nt.links.new(attr.outputs["Fac"], col.inputs["Factor"])
    nt.links.new(col.outputs["Result"], b.inputs["Base Color"])
    rough = nt.nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value, rough.inputs["To Max"].default_value = 0.08, 0.75
    nt.links.new(attr.outputs["Fac"], rough.inputs["Value"])
    nt.links.new(rough.outputs["Result"], b.inputs["Roughness"])
    b.inputs["Specular IOR Level"].default_value = 0.8
    glass.data.materials.append(m)


depth, near = carve()
scene = reset()
scene.cycles.samples = 96
scene.render.film_transparent = True
agx(scene)
front_camera(scene, W, H, W / 100.0)
cut_glass(depth)
_world(scene, "studio.exr", 0.12)
sun(scene, "room", (-1.0, 1.0, 0.9), (0.84, 0.8, 1.0), 5.0, angle=8)
render(scene, out("sigil-cut"))

px = load_rgba(out("sigil-cut"))  # rows bottom up
cut = (depth > 0.02).astype(np.float32)
lip = soften(cut, 1, 1)  # one pixel round the cut: its lip
foot = np.clip(np.maximum(cut, lip * 2.0), 0, 1)
px[..., :3] *= 0.75
px[..., 3] = foot[::-1]
save_rgba(px, out("sigil-cut"))

# The light in a groove: most in its depth, less up its walls, a little on the lip; round it a faint round breath,
# gone before each mark's own box and the picture's edges.
held = np.where(cut > 0.5, 0.35 + 0.65 * np.clip(depth / 0.8, 0, 1) ** 0.7, 0.0)
rows_from_edge = np.minimum(np.arange(H), H - 1 - np.arange(H))[:, None]
halo = near * HALO * np.clip(rows_from_edge / 14.0, 0, 1)
mask = np.zeros((H, W, 4), dtype=np.float32)
mask[..., :3] = 1
mask[..., 3] = np.clip(np.maximum.reduce([held, lip * 0.3, halo]), 0, 1)[::-1]
save_rgba(mask, out("sigil-mask"))

# The near wall, in shadow from the room's light: how much darker each cut pixel is than the lit wall.
lum = luminance(px)[::-1]
lit = float(np.percentile(lum[cut > 0.5], 90))
shade = np.zeros((H, W, 4), dtype=np.float32)
shade[..., 3] = (np.clip(1 - lum / max(lit, 1e-4), 0, 1) * cut * SHADE)[::-1]
save_rgba(shade, out("sigil-shade"))
print("sigil HALO at the picture's edge", round(float(max(halo[0].max(), halo[-1].max())), 4))
