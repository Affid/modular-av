"""What the scenes of the dock's own parts share (plates.py, lamps.py, keys.py): the plates' header and voice panel,
their lamps and their keys. A part is modelled in CSS pixels (a scene unit is 10 of them) and rendered at the size
the measures give its picture. One light, as for the monitors and the bulkhead: the hold's work lamp as the studio's
sun from the upper left, and the studio's soft surroundings; no small lamps (a part is small and its picture is cut
and repeated, so only even light).

Small shadows (a rivet's, a plate's, a lamp's) are computed from the thing's own outline moved along the sun, not
caught on a catcher: in the room's light a catcher throws long streaks the wrong way.
"""
import math

import stage  # (first: the paths)

import bmesh
import bpy
import numpy as np

from measures import picture
from pixels import load_rgba, soften
from stage import front_camera, link, render

CSS = 0.1  # scene units to a CSS pixel
# The paints, linear RGB: the plates a dark gunmetal grey apart from the green bulkhead, so they read as separate
# sheets bolted on and keep the cream text over 5:1 even on their lightest scratches; the trim the bulkhead's own
# green gone darker with handling.
PLATE = (0.02, 0.023, 0.022)
TRIM = (0.03, 0.038, 0.028)


def c(v):
    """CSS pixels as scene units."""
    return v * CSS


def setup(name, w_css, h_css, samples=160):
    """The stage and a camera straight on over a part w by h CSS px, at the size of the picture called `name`.
    Returns the scene and the picture's density (its pixels to a CSS px of the model)."""
    width, height = picture(name)
    density = width / w_css
    if abs(h_css * density - height) > 0.5:
        raise SystemExit(f"{name}: the model's {w_css} by {h_css} CSS px does not fit its {width} by {height} picture")
    scene = stage.stage(samples=samples, exposure=0.9)
    front_camera(scene, width, height, c(w_css))
    if h_css > w_css:
        scene.camera.data.sensor_fit = "VERTICAL"
        scene.camera.data.ortho_scale = c(h_css)
    return scene, density


def rounded(hw, hh, r, k=8):
    """A rounded rectangle about the origin, CSS px, 4k points counter-clockwise (the same count for any size, so
    outlines made by it can be joined ring to ring)."""
    pts = []
    for cx, cy, start in ((hw - r, hh - r, 0), (-hw + r, hh - r, 90), (-hw + r, -hh + r, 180), (hw - r, -hh + r, 270)):
        for i in range(k):
            a = math.radians(start + 90 * i / (k - 1))
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def _join(bm, loops):
    n = len(loops[0])
    for a, b in zip(loops, loops[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))


def slab(name, hw, hh, r, z0, z1, mat, bevel=0.6):
    """A plate of rounded outline, CSS px, from z0 up to z1, its edges rounded by `bevel`."""
    outer = rounded(hw, hh, r)
    return solid(name, [(outer, z0), (outer, z1)], mat, bevel)


def solid(name, rings, mat, bevel):
    """A closed solid through rings [(points css, z css)], its sharp edges rounded by `bevel` CSS px."""
    bm = bmesh.new()
    loops = [[bm.verts.new((c(x), c(y), c(z))) for x, y in pts] for pts, z in rings]
    _join(bm, loops)
    bm.faces.new(loops[-1])
    bm.faces.new(list(reversed(loops[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh))
    obj.data.materials.append(mat)
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width, mod.segments, mod.limit_method = c(bevel), 4, "ANGLE"
    mod.angle_limit = math.radians(50)
    obj.modifiers.new("wn", "WEIGHTED_NORMAL")
    for p in mesh.polygons:
        p.use_smooth = True
    return obj


def ring_mesh(name, rings, mat, cap_last=None):
    """A surface through rings [(points css, z css, worn 0..1 or worn(x, y))], each ring the same point count; the
    float attribute "worn" per vertex (painted() chips the paint there). `cap_last` closes the last ring by a fan at
    that z."""
    bm = bmesh.new()
    worn_layer = bm.verts.layers.float.new("worn")
    loops = []
    for pts, z, worn in rings:
        loop = []
        for x, y in pts:
            v = bm.verts.new((c(x), c(y), c(z)))
            v[worn_layer] = worn(x, y) if callable(worn) else worn
            loop.append(v)
        loops.append(loop)
    _join(bm, loops)
    if cap_last is not None:
        worn = rings[-1][2]
        mid = bm.verts.new((0, 0, c(cap_last)))
        mid[worn_layer] = worn(0, 0) if callable(worn) else worn
        last = loops[-1]
        for i in range(len(last)):
            bm.faces.new((last[i], last[(i + 1) % len(last)], mid))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth_object(name, bm, mat)


def smooth_object(name, bm, mat):
    """The bmesh as a smooth-shaded object of its own, in `mat`."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = link(bpy.data.objects.new(name, mesh))
    obj.data.materials.append(mat)
    return obj


def pillow(name, hw, hh, z0, swell, mat, r=1.2, n=28):
    """A face over a rounded outline (CSS px), swelling smoothly to its middle by `swell`: a grid whose height is a
    smooth function of x and y, so no creases run along the diagonals."""
    bm = bmesh.new()
    verts = {}
    for i in range(n + 1):
        for j in range(n + 1):
            x, y = -hw + 2 * hw * i / n, -hh + 2 * hh * j / n
            # the grid's corners pulled onto the rounded outline
            qx, qy = abs(x) - (hw - r), abs(y) - (hh - r)
            if qx > 0 and qy > 0:
                d = math.hypot(qx, qy)
                k = r / d if d > r else 1.0
                x, y = math.copysign(hw - r + qx * k, x), math.copysign(hh - r + qy * k, y)
            u, v = x / hw, y / hh
            verts[i, j] = bm.verts.new((c(x), c(y), c(z0 + swell * (1 - u * u) * (1 - v * v))))
    for i in range(n):
        for j in range(n):
            bm.faces.new((verts[i, j], verts[i + 1, j], verts[i + 1, j + 1], verts[i, j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth_object(name, bm, mat)


def dome(name, at, radius, height, z, mat, segs=32):
    """A dome (a squashed sphere) `radius` across and `height` high, its middle at `at` and z (CSS px)."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=c(radius), segments=segs, ring_count=16,
                                         location=(c(at[0]), c(at[1]), c(z)))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (1, 1, height / radius)
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def catcher(hw, hh, z):
    """A shadow catcher hw by hh CSS px (half sizes) at depth z."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, c(z)))
    obj = bpy.context.active_object
    obj.scale = (c(hw * 2), c(hh * 2), 1)
    obj.is_shadow_catcher = True
    return obj


def glow_light(name, at, z, colour, energy, radius=0.05):
    """A small point light, unseen by the camera: what a lit LED throws on the rubber round it."""
    data = bpy.data.lights.new(name, "POINT")
    data.energy, data.color, data.shadow_soft_size = energy, colour, radius
    light = link(bpy.data.objects.new(name, data))
    light.location = (c(at[0]), c(at[1]), c(z))
    light.visible_camera = False
    return light


def coords(shape, w_css, h_css):
    """CSS px of every pixel's centre about the picture's middle: xs (w,), ys (h,) with rows running up as Blender
    stores them (y up)."""
    h, w = shape[:2]
    xs = (np.arange(w) + 0.5) / w * w_css - w_css / 2
    ys = (np.arange(h) + 0.5) / h * h_css - h_css / 2
    return xs, ys


def rrect_mask(shape, w_css, h_css, hw, hh, r):
    """1 inside a rounded rectangle about the middle (CSS px), antialiased over a pixel."""
    xs, ys = coords(shape, w_css, h_css)
    qx = np.abs(xs)[None, :] - (hw - r)
    qy = np.abs(ys)[:, None] - (hh - r)
    d = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
    return np.clip(0.5 - d * (shape[1] / w_css), 0.0, 1.0)


def drop_veil(px, floor=0.03):
    """The catcher's faint veil off: alpha under `floor` on dark pixels is nothing."""
    dark = px[..., :3].max(axis=2) < 0.05
    px[..., 3] = np.where(dark & (px[..., 3] < floor), 0.0, px[..., 3])
    return px


def shadow(alpha, height, soft, density):
    """A thing's shadow on a face under it, computed from its silhouette: the sun from the upper left at the
    stage's height (its direction (-1, 1, 2.6)) moves it down and right by height / 2.6 each way, softened
    (`height` and `soft` in CSS px)."""
    shift = int(round(height / 2.6 * density))
    moved = np.zeros_like(alpha)
    moved[:-shift or None, shift:] = alpha[shift:, :-shift or None]  # rows run up: down on screen is a lower row
    return np.clip(soften(moved, max(1, int(round(soft * density)))), 0.0, 1.0)


def mask_of(scene, keep, path):
    """The alpha of the objects in `keep` alone (every other object hidden), rendered quickly: a mask in the
    picture's pixels."""
    hidden = [o for o in scene.objects if o.type == "MESH" and o not in keep and not o.hide_render]
    for o in hidden:
        o.hide_render = True
    samples = scene.cycles.samples
    scene.cycles.samples = 16
    render(scene, path)
    scene.cycles.samples = samples
    for o in hidden:
        o.hide_render = False
    return load_rgba(path)[..., 3]


def wanted(names):
    """The pictures of `names` to render now: all, or those `--only` names (while working on some)."""
    from measures import option

    only = option("--only")
    return [n for n in names if not only or n in only.split(",")]
