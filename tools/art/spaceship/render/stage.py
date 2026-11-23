"""What every spaceship scene stands in: the scrolls theme's room and sun (here the hold's caged work lamp, far
enough to light every monitor alike), a camera seen straight on, a shadow catcher kept off the middle of a camera's
picture, shadows kept close to what casts them, the middle box checked empty, and the shapes most parts are made
of (rounded rectangles lofted into one another).

A scene imports this module first: it puts the scene's own folder and the scrolls theme's studio on the path.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from measures import DENSITY, MIDDLE, SCALE, TILE_H, TILE_W, VIEW, frame_pixels, option, out, place, texture, units  # noqa: E402,F401
from pixels import clean, load_rgba, save_rgba, soften  # noqa: E402,F401
from studio import reset, room  # noqa: E402


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def stage(samples=160, lamps=False, ceiling=False, exposure=0.5):
    """The room every rendered theme used: one sun from the upper left (here: the hold's caged work lamp, far
    enough to light every monitor alike) and the studio's soft surroundings; no small lamps, no ceiling (big
    flat painted faces reflect it as a pale sheet)."""
    scene = reset()
    room(scene, exposure=exposure)
    scene.view_settings.look = "AgX - Medium High Contrast"
    for obj in list(scene.objects):
        if obj.type == "LIGHT":
            obj.visible_camera = False
            if obj.name.startswith("lamp") and not lamps:
                obj.hide_render = True
            if obj.name.startswith("ceiling") and not ceiling:
                obj.hide_render = True
    scene.cycles.samples = samples
    scene.render.film_transparent = True
    return scene


def front_camera(scene, width_px, height_px, span):
    data = bpy.data.cameras.new("camera")
    data.type = "ORTHO"
    data.sensor_fit = "HORIZONTAL"
    data.ortho_scale = span
    data.clip_end = 100
    cam = bpy.data.objects.new("camera", data)
    cam.location = (0, 0, 20)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = width_px, height_px
    return cam


def frame_camera(scene):
    w, h = frame_pixels()
    return front_camera(scene, w, h, VIEW["w"] / SCALE)


def render(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)


def catcher(z, band=30.0):
    """A shadow catcher at depth `z` behind the frame, open over the picture inside a band of `band` units."""
    x0, y0, x1, y1 = VIEW["x"] - 60, VIEW["y"] - 60, VIEW["x"] + VIEW["w"] + 60, VIEW["y"] + VIEW["h"] + 60
    mx0, my0, mx1, my1 = band, band, TILE_W - band, TILE_H - band
    outer = [place(x0, y0), place(x1, y0), place(x1, y1), place(x0, y1)]
    inner = [place(mx0, my0), place(mx1, my0), place(mx1, my1), place(mx0, my1)]
    verts = [(x, y, z) for x, y in outer + inner]
    faces = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    mesh = bpy.data.meshes.new("catcher")
    mesh.from_pydata(verts, [], faces)
    if sum(p.normal.z for p in mesh.polygons) < 0:
        mesh.flip_normals()
    obj = link(bpy.data.objects.new("catcher", mesh))
    obj.is_shadow_catcher = True
    return obj


def grid(shape):
    """Tile units of every pixel's centre: xs (w,), ys (h,), rows running up as Blender stores them."""
    h, w = shape[:2]
    xs = VIEW["x"] + (np.arange(w) + 0.5) / DENSITY
    ys = VIEW["y"] + (h - np.arange(h) - 0.5) / DENSITY
    return xs, ys


def middle_count(pixels, threshold=0.1):
    xs, ys = grid(pixels.shape)
    inside = ((xs >= MIDDLE[0]) & (xs <= MIDDLE[2]))[None, :] & ((ys >= MIDDLE[1]) & (ys <= MIDDLE[3]))[:, None]
    return int((pixels[..., 3][inside] > threshold).sum())


def away_from_middle(shape, over):
    xs, ys = grid(shape)
    dx = np.maximum(np.maximum(MIDDLE[0] - xs, xs - MIDDLE[2]), 0.0)[None, :]
    dy = np.maximum(np.maximum(MIDDLE[1] - ys, ys - MIDDLE[3]), 0.0)[:, None]
    t = np.clip(np.sqrt(dx * dx + dy * dy) / over, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def keep_close(scene, catcher_obj, path, near, samples=24):
    whole = clean(load_rgba(path), floor=0.03)
    catcher_obj.hide_render = True
    keep = scene.cycles.samples
    scene.cycles.samples = samples
    render(scene, path)
    own = load_rgba(path)[..., 3]
    own = np.where(own < 0.03, 0.0, own)
    scene.cycles.samples = keep
    catcher_obj.hide_render = False
    close = np.clip(soften(own, near) * 3.0, 0.0, 1.0)
    whole[..., 3] = np.maximum(own, whole[..., 3] * close)
    return whole, own


def check_middle(pixels, name):
    count = middle_count(pixels, 0.1)
    print("PIXELS IN THE MIDDLE BOX:", name, count)
    if count:
        raise SystemExit(f"{name}: {count} pixels drawn in the middle 70% of the picture")


def rrect(x0, y0, x1, y1, r, k=10):
    """A rounded rectangle in tile units (y down) as 4k points, clockwise on screen, the same count for any size:
    rings made by it can be lofted into one another."""
    pts = []
    corners = [(x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)]
    for cx, cy, start in corners:
        for i in range(k):
            a = math.radians(start + 90 * i / (k - 1))
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def loft(name, rings, cap_back=False):
    """A surface through rings of points [(points, z)], each ring as rrect makes it (tile units, z in scene
    units, toward the viewer positive)."""
    import bmesh

    bm = bmesh.new()
    loops = []
    for pts, z in rings:
        loops.append([bm.verts.new((*place(x, y), z)) for x, y in pts])
    n = len(loops[0])
    for a, b in zip(loops, loops[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_back:
        bm.faces.new(list(reversed(loops[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = link(bpy.data.objects.new(name, mesh))
    return obj
