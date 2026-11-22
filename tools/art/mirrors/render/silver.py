"""The mirror's old silver: its frame, the transoms that part the header's and the panel's panes from the cameras',
and the bezels of the buttons and the chips. Neutral: the room's light is a grey from up to the left (as the hands
have it); the glass's light comes from a plane sunk well below each piece, so only a slope that faces the glass sees
it; the tarnish in the hollows is near black and the proud beads are rubbed bright in places. Peaks stay under the
names' white.

  dockframe  the mirror's own frame, a band to cut in nine (border-image)
  transom-h  a bar of the same molding across the mirror; transom-v the same bar upright (docked at the top or bottom)
  btn        a button's bezel; btn-l and btn-r a button and its menu arrow, one bezel parted by a silver bar
  chip       the small bezel of the states' and the tile's chips
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from common import GLOW, ROOM, emitter, front_camera, glow_room, luminance, render, reset, sun  # noqa: E402
from measures import out, picture, spec  # noqa: E402
from metal import old_silver  # noqa: E402
from molding import profile, ring  # noqa: E402
from pixels import load_rgba, save_rgba  # noqa: E402

UNIT = 100.0  # pixels to a scene unit


def stage(w_px, h_px, inner=None, inner_strength=3.0):
    scene = reset()
    scene.cycles.samples = 192
    scene.render.film_transparent = True
    front_camera(scene, w_px, h_px, w_px / UNIT)
    glow_room(scene)
    sun(scene, "room", (-1.0, 1.0, 1.3), ROOM, 2.6, angle=24)
    if inner is not None:
        # Sunk below the frame: only a slope that faces the glass, low down, can see it.
        emitter("deep", inner[:2], (0, 0, -0.12), GLOW, inner_strength)
    return scene


def report(name):
    px = load_rgba(out(name))
    seen = px[..., 3] > 0.5
    lum = luminance(px)
    print(name, "LUM max", round(float(lum[seen].max()), 3))
    return px


def silver_mat(scale):
    return old_silver(scale=scale, base=0.17, rubbed=0.72, tarnish=(0.012, 0.012, 0.013))


def framed(name, w_px, h_px, band, corner, scale, inner_strength, per_side=40, bar_at=None):
    w, h = w_px / UNIT, h_px / UNIT
    scene = stage(w_px, h_px, inner=(w - 2 * band - 0.04, h - 2 * band - 0.04), inner_strength=inner_strength)
    mat = silver_mat(scale)
    frame = ring(name, 0, 0, w / 2, h / 2, corner, profile(band, band * 0.7), per_side=per_side, per_corner=8)
    frame.data.materials.append(mat)
    if bar_at is not None:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=h - band, vertices=24,
                                            location=(bar_at / UNIT - w / 2, 0, 0.0))
        rod = bpy.context.object
        rod.rotation_euler = (math.pi / 2, 0, 0)
        rod.scale = (1.0, 0.75, 1.0)
        rod.data.materials.append(mat)
        bpy.ops.object.shade_smooth()
    render(scene, out(name))
    return report(name)


def bar_profile(width, height, steps=48):
    """A transom's section, one side of the glass to the other: a bevel up out of the glass, a cove, a round bead
    in the middle, and the same back down. Symmetric: it parts two panes."""
    pts = []
    for k in range(steps + 1):
        u = k / steps
        v = abs(u - 0.5) * 2  # 0 at the middle, 1 at either glass
        if v < 0.34:  # the bead
            hgt = 0.62 + 0.38 * math.sqrt(max(0.0, 1 - (v / 0.34) ** 2))
        elif v < 0.56:  # the cove
            t = (v - 0.34) / 0.22
            hgt = 0.62 - 0.16 * math.sin(t * math.pi)
        elif v < 0.8:  # the flat
            hgt = 0.62 - 0.04 * (v - 0.56) / 0.24
        else:  # the bevel down into the glass
            t = (v - 0.8) / 0.2
            hgt = 0.58 * (1 - t) + 0.02 * t
        pts.append((u * width, hgt * height))
    return pts


def bar(name, upright, scale, inner_strength):
    w_px, h_px = picture(name)
    length, band = (h_px, w_px) if upright else (w_px, h_px)
    length, band = length / UNIT, band / UNIT
    scene = stage(w_px, h_px)
    # The glass's light on both sides of the bar, sunk below it.
    for side in (-1, 1):
        at = (side * (band / 2 + 0.3), 0, -0.12) if upright else (0, side * (band / 2 + 0.3), -0.12)
        size = (0.6, length + 0.4) if upright else (length + 0.4, 0.6)
        emitter(f"deep{side}", size, at, GLOW, inner_strength)
    sec = bar_profile(band, band * 0.7)
    verts, faces = [], []
    n_along = int(length * UNIT / 4)
    for i in range(n_along + 1):
        s = -length / 2 - 0.1 + (length + 0.2) * i / n_along
        for d, z in sec:
            across = d - band / 2
            verts.append((across, s, z) if upright else (s, -across, z))
    m = len(sec)
    for i in range(n_along):
        for j in range(m - 1):
            a = i * m + j
            faces.append((a, a + 1, a + m + 1, a + m))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for p in mesh.polygons:
        p.use_smooth = True
    if sum(p.normal.z for p in mesh.polygons) < 0:
        mesh.flip_normals()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(silver_mat(scale))
    render(scene, out(name))
    return report(name)


frame_px, _ = picture("dockframe")
band = spec("dockframe")["edge"] * spec("dockframe")["density"] / UNIT
framed("dockframe", frame_px, frame_px, band, 0.02, 0.6, 3.0, per_side=60)
bar("transom-h", False, 0.6, 3.0)
bar("transom-v", True, 0.6, 3.0)
btn_w, btn_h = picture("btn")
arrow_w, _ = picture("btn-r")
framed("btn", btn_w, btn_h, 0.07, 0.08, 3.0, 1.0)
pair = framed("pair", btn_w + arrow_w, btn_h, 0.07, 0.08, 3.0, 1.0, bar_at=btn_w)
save_rgba(pair[:, :btn_w].copy(), out("btn-l"))
save_rgba(pair[:, btn_w:].copy(), out("btn-r"))
chip_px, _ = picture("chip")
framed("chip", chip_px, chip_px, 0.06, 0.07, 4.0, 1.0)
