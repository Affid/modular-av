"""What every strongbox scene stands in: the scrolls theme's room and sun, a camera seen straight on, a shadow
catcher kept off the middle of a camera's picture, and the finish of a frame picture (shadows kept close to what
casts them, the middle box checked empty).

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

from measures import DENSITY, MIDDLE, SCALE, TILE_H, TILE_W, VIEW, frame_pixels, out, place  # noqa: E402
from pixels import clean, load_rgba, save_rgba, soften  # noqa: E402
from studio import reset, room  # noqa: E402


def stage(samples=200, lamps=True, ceiling=True):
    """An empty scene in the room every earlier rendered theme used: one sun from the upper left, the studio's
    soft surroundings. The small lamps and the ceiling are left out of what repeats, and out of big flat iron
    (it reflected the ceiling as pale zinc)."""
    scene = reset()
    room(scene, exposure=0.5)
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


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def front_camera(scene, width_px, height_px, span, fit="HORIZONTAL"):
    """Straight at the boards: `span` scene units across (or down, with fit VERTICAL)."""
    data = bpy.data.cameras.new("camera")
    data.type = "ORTHO"
    data.sensor_fit = fit
    data.ortho_scale = span
    data.clip_end = 100
    cam = bpy.data.objects.new("camera", data)
    cam.location = (0, 0, 20)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = width_px, height_px
    return cam


def frame_camera(scene):
    """The frame layer's box, at the frame's density."""
    w, h = frame_pixels()
    return front_camera(scene, w, h, VIEW["w"] / SCALE)


def render(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)


def catcher_round_middle(band=20.0):
    """A shadow catcher under the frame layer except the picture inside a band of `band` units from its edge:
    shadows fall on the dock round the picture and on that band, never further in."""
    x0, y0, x1, y1 = VIEW["x"] - 40, VIEW["y"] - 40, VIEW["x"] + VIEW["w"] + 40, VIEW["y"] + VIEW["h"] + 40
    mx0, my0, mx1, my1 = band, band, TILE_W - band, TILE_H - band
    outer = [place(x0, y0), place(x1, y0), place(x1, y1), place(x0, y1)]
    inner = [place(mx0, my0), place(mx1, my0), place(mx1, my1), place(mx0, my1)]
    verts = [(x, y, 0.0) for x, y in outer + inner]
    faces = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    mesh = bpy.data.meshes.new("catcher")
    mesh.from_pydata(verts, [], faces)
    if sum(p.normal.z for p in mesh.polygons) < 0:
        mesh.flip_normals()
    obj = link(bpy.data.objects.new("catcher", mesh))
    obj.is_shadow_catcher = True
    return obj


def middle_count(pixels, threshold=0.1):
    """Pixels with alpha over `threshold` in the middle box of a frame picture (rows of `pixels` run up)."""
    h = pixels.shape[0]
    x0 = int(math.floor((MIDDLE[0] - VIEW["x"]) * DENSITY))
    x1 = int(math.ceil((MIDDLE[2] - VIEW["x"]) * DENSITY))
    yt = int(math.floor((MIDDLE[1] - VIEW["y"]) * DENSITY))
    yb = int(math.ceil((MIDDLE[3] - VIEW["y"]) * DENSITY))
    return int((pixels[h - yb:h - yt, x0:x1, 3] > threshold).sum())


def away_from_middle(shape, over):
    """1 far from the middle box, falling smoothly to 0 at its edge over `over` tile units: a shadow reaching
    toward the middle fades out instead of ending square on the box's edge."""
    h, w = shape[:2]
    xs = VIEW["x"] + (np.arange(w) + 0.5) / DENSITY
    ys = VIEW["y"] + (h - np.arange(h) - 0.5) / DENSITY  # rows run up
    dx = np.maximum(np.maximum(MIDDLE[0] - xs, xs - MIDDLE[2]), 0.0)[None, :]
    dy = np.maximum(np.maximum(MIDDLE[1] - ys, ys - MIDDLE[3]), 0.0)[:, None]
    t = np.clip(np.sqrt(dx * dx + dy * dy) / over, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def keep_close(scene, catcher, path, near, samples=24):
    """The picture at `path` with its shadows kept within `near` pixels of what casts them (a catcher's pale
    veil reaches far): rendered again without the catcher, at fewer samples, for what casts. Returns it."""
    whole = clean(load_rgba(path), floor=0.03)
    catcher.hide_render = True
    keep = scene.cycles.samples
    scene.cycles.samples = samples
    render(scene, path)
    own = load_rgba(path)[..., 3]
    own = np.where(own < 0.03, 0.0, own)  # the denoiser's faint haze
    scene.cycles.samples = keep
    catcher.hide_render = False
    close = np.clip(soften(own, near) * 3.0, 0.0, 1.0)
    whole[..., 3] = np.maximum(own, whole[..., 3] * close)
    return whole, own


def finish_frame(scene, catcher, name, near=8, fade_over=70.0):
    """Renders the frame picture `name`, its shadows close and faded before the middle box; fails the scene when
    anything is left in the middle 70% (the dock's rule)."""
    path = out(name)
    render(scene, path)
    whole, own = keep_close(scene, catcher, path, near)
    whole[..., 3] = np.maximum(own, whole[..., 3] * away_from_middle(whole.shape, fade_over))
    save_rgba(whole, path)
    count = middle_count(whole, 0.1)  # the contract counts what is more than a tenth opaque
    print("PIXELS IN THE MIDDLE BOX:", name, count)
    if count:
        raise SystemExit(f"{name}: {count} pixels drawn in the middle 70% of the picture")
    return whole
