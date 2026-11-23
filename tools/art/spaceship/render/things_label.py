"""The extinguisher's label as a flat picture, to be wrapped round its body (things_extinguisher.py). The model's own
printed label carries another language's words and a maker's marks, so it is covered with this one.

A small printed sheet, 110 x 65 mm at 10 px per mm: a faded brick-red band with a stencilled code, a row of three
pictograms (pull the pin, aim, a flame), a block of small print and an inspection punch strip. Every word and code
is invented. Typed in DejaVu Sans Condensed Bold and DejaVu Sans Mono (fetched: ../textures.ts). Then worn the way a
label on a hold's wall wears: yellowed, dirt settled low and where hands grab, scratched through the ink, its edges
scuffed, the top right corner peeled back (adhesive left on the paint) and one month punched out of the strip.

Writes two working files beside the pictures: the worn label, and its peeled corner as a separate sheet (sRGB,
straight alpha).
"""
import math

import bpy
import numpy as np

from measures import out, texture
from pixels import load_rgba, save_rgba
from stage import link, render
from studio import reset

W_MM, H_MM, PX = 110.0, 65.0, 10
PEEL_MM = 26.0  # the peeled corner: (W - x) + 1.15 * y_from_top < PEEL_MM (mm); things_extinguisher curls it
GROUND = (0.60, 0.56, 0.455)  # sRGB: cream gone to old ivory
BRICK = (0.55, 0.20, 0.15)
INK = (0.17, 0.16, 0.15)
CREAM = (0.68, 0.63, 0.52)
LABEL, FLAP = "extinguisher-label", "extinguisher-label-flap"  # the working files


def lin(c):
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def flat(name, srgb):
    """Printed ink: a flat colour, lit by nothing (the label is shaded once it is on the body)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    em = nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*lin(srgb), 1)
    o = nodes.new("ShaderNodeOutputMaterial")
    links.new(em.outputs[0], o.inputs["Surface"])
    return mat


def mm(x, y):
    """Label millimetres from the top left to scene metres (y up)."""
    return x / 1000.0, (H_MM - y) / 1000.0


def rect(x0, y0, x1, y1, mat, z):
    (a, b), (c, d) = mm(x0, y1), mm(x1, y0)
    mesh = bpy.data.meshes.new("rect")
    mesh.from_pydata([(a, b, z), (c, b, z), (c, d, z), (a, d, z)], [], [(0, 1, 2, 3)])
    obj = link(bpy.data.objects.new("rect", mesh))
    obj.data.materials.append(mat)
    return obj


def poly(points, mat, z):
    verts = [(*mm(x, y), z) for x, y in points]
    mesh = bpy.data.meshes.new("poly")
    mesh.from_pydata(verts, [], [tuple(range(len(verts)))])
    obj = link(bpy.data.objects.new("poly", mesh))
    obj.data.materials.append(mat)
    return obj


def line(points, width_mm, mat, z, cyclic=False):
    curve = bpy.data.curves.new("line", "CURVE")
    curve.dimensions = "2D"
    curve.bevel_depth = 0.0
    curve.extrude = 0.0
    sp = curve.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p, (x, y) in zip(sp.points, points):
        p.co = (*mm(x, y), z, 1)
    sp.use_cyclic_u = cyclic
    curve.offset = 0.0
    obj = link(bpy.data.objects.new("line", curve))
    obj.data.materials.append(mat)
    curve.dimensions = "3D"
    curve.bevel_depth = width_mm / 2000.0
    curve.bevel_resolution = 2
    obj.scale = (1, 1, 0.01)
    return obj


def circle(cx, cy, r, n=48):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def text(body, x, y, size_mm, mat, font, z, align="LEFT", space=1.0):
    cu = bpy.data.curves.new("t", "FONT")
    cu.body = body
    cu.size = size_mm / 1000.0
    cu.align_x = align
    cu.space_character = space
    cu.font = font
    obj = link(bpy.data.objects.new("text", cu))
    px, py = mm(x, y)
    obj.location = (px, py, z)
    obj.data.materials.append(mat)
    return obj


def _pictograms(ink, brick):
    """Three pictograms in ruled boxes: the pin's ring, an arrow to aim, a flame."""
    for k in range(3):
        x0 = 4 + k * 17
        line([(x0, 16), (x0 + 15, 16), (x0 + 15, 31), (x0, 31)], 0.7, ink, 0.0002, cyclic=True)
    line(circle(11.5, 22, 3.4), 1.1, ink, 0.0002, cyclic=True)
    line([(11.5, 25.4), (11.5, 29.5)], 1.1, ink, 0.0002)
    poly([(25, 21.6), (33, 21.6), (33, 19.4), (36.5, 23.5), (33, 27.6), (33, 25.4), (25, 25.4)], ink, 0.0002)
    poly([(45.5, 29.5), (42, 26), (43.5, 21.5), (45.5, 23.5), (46.5, 17.8), (49.5, 23), (50.5, 21.2),
          (52, 25.5), (49, 29.5)], brick, 0.0002)


def _print(ink, mono):
    """The codes beside the pictograms and the block of small print under them."""
    rows = ("CL  A / B / C", "CHG 4.0 KG", "P  1.4 MPA", "T  -20 / +60")
    for i, row in enumerate(rows):
        text(row, 58, 19.5 + i * 3.7, 3.1, ink, mono, 0.0002)
    line([(4, 34), (W_MM - 4, 34)], 0.5, ink, 0.0002)
    small = ("PULL PIN  AIM AT BASE  SQUEEZE  SWEEP", "KEEP UPRIGHT  RECHARGE AFTER ANY USE",
             "UNIT H2-117  BAY C  FRAME 22", "RECORD MF-4471  LOT 0925-K", "SER 33-0718  TEST 2.5 MPA")
    for i, row in enumerate(small):
        text(row, 4, 38.6 + i * 3.6, 2.6, ink, mono, 0.0002)


def _strip(ink, mono):
    """The inspection strip: twelve months in boxes. Returns a box's pitch (mm)."""
    line([(4, 56.5), (W_MM - 4, 56.5)], 0.5, ink, 0.0002)
    step = (W_MM - 8) / 12
    for m in range(12):
        x0 = 4 + m * step
        line([(x0, 57.5), (x0 + step - 1, 57.5), (x0 + step - 1, 63), (x0, 63)], 0.4, ink, 0.0002, cyclic=True)
        text(f"{m + 1:02d}", x0 + (step - 1) / 2, 61.6, 3.0, ink, mono, 0.0002, align="CENTER")
    return step


def draw():
    """The label as printed. Returns the inspection strip's pitch (mm)."""
    bold = bpy.data.fonts.load(texture("DejaVuSansCondensed-Bold.ttf"))
    mono = bpy.data.fonts.load(texture("DejaVuSansMono.ttf"))
    ground, brick, ink, cream = flat("ground", GROUND), flat("brick", BRICK), flat("ink", INK), flat("cream", CREAM)
    rect(0, 0, W_MM, H_MM, ground, 0.0)
    # the band: a code stencilled in the cream, the agent and the charge
    rect(0, 0, W_MM, 13, brick, 0.0001)
    text("EXT-4", 4, 10.4, 9.0, cream, bold, 0.0002, space=1.15)
    text("DRY CHEM  4 KG", W_MM - 4, 9.8, 5.2, cream, bold, 0.0002, align="RIGHT")
    _pictograms(ink, brick)
    _print(ink, mono)
    return _strip(ink, mono)


def camera(scene):
    data = bpy.data.cameras.new("camera")
    data.type = "ORTHO"
    data.ortho_scale = W_MM / 1000.0
    cam = bpy.data.objects.new("camera", data)
    cam.location = (W_MM / 2000.0, H_MM / 2000.0, 1)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = int(W_MM * PX), int(H_MM * PX)


def noise(h, w, cell, seed):
    """Smooth value noise, one random value per `cell` pixels."""
    rnd = np.random.default_rng(seed)
    gh, gw = h // cell + 2, w // cell + 2
    g = rnd.random((gh, gw)).astype(np.float32)
    ys, xs = np.arange(h) / cell, np.arange(w) / cell
    y0, x0 = ys.astype(int), xs.astype(int)
    fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a, b = g[y0][:, x0], g[y0][:, x0 + 1]
    c, d = g[y0 + 1][:, x0], g[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(h, w, cell, seed, octaves=4):
    total, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        total = total + amp * noise(h, w, max(2, cell >> o), seed + o)
        norm += amp
        amp *= 0.5
    return total / norm


def _yellow_and_dirt(rgb, xx, yy):
    """Yellowing, stronger to the edges; dirt settled at the bottom and on the right where the lever hand grabs;
    specks."""
    h, w = xx.shape
    edge = np.clip(np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)) / (6 * PX), 0, 1)
    yellow = np.stack([np.ones_like(xx), 0.96 * np.ones_like(xx), 0.86 * np.ones_like(xx)], axis=2)
    rgb = rgb * (1 - 0.35 * (1 - edge[..., None])) + rgb * yellow * 0.35 * (1 - edge[..., None])
    dirt = fbm(h, w, 64, 3)
    low = np.clip((yy / h - 0.45) / 0.55, 0, 1) ** 1.5
    hand = np.exp(-(((xx - w * 0.92) / (w * 0.12)) ** 2 + ((yy - h * 0.55) / (h * 0.35)) ** 2))
    grime = np.clip(0.24 * low + 0.26 * hand + 0.18 * (dirt - 0.5) + 0.06, 0, 0.5)
    rgb = rgb * (1 - grime[..., None] * np.array([1.0, 1.04, 1.12]))
    specks = (noise(h, w, 3, 9) > 0.93) * (fbm(h, w, 40, 11) > 0.5)
    return rgb * (1 - 0.25 * specks[..., None])


def _scratches(h, w):
    """Thin bright strokes through the ink and the varnish, mostly across."""
    rnd = np.random.default_rng(21)
    scratch = np.zeros((h, w), np.float32)
    for _ in range(46):
        x0, y0 = rnd.uniform(0, w), rnd.uniform(0, h)
        ang = rnd.normal(0.15, 0.5)
        length = rnd.uniform(40, 260)
        for t in np.linspace(0, 1, int(length)):
            x, y = int(x0 + t * length * math.cos(ang)), int(y0 + t * length * math.sin(ang))
            if 0 <= x < w and 0 <= y < h:
                scratch[y, x] = max(scratch[y, x], 1 - abs(2 * t - 1) ** 3)
    return np.clip(scratch * 0.9 + np.roll(scratch, 1, 0) * 0.3, 0, 1)


def _peel(img, rgb, alpha, xx, yy):
    """The top right corner peeled back along a straight fold: the flap itself is cut out as its own sheet (curled
    by things_extinguisher); under it the paint keeps a grubby film of adhesive and torn paper fibres; dirt in
    the fold."""
    h, w = xx.shape
    tear = (w - xx) + yy * 1.15
    peeled = tear < PEEL_MM * PX
    flap = img.copy()
    flap[..., :3] = np.clip(rgb, 0, 1)
    flap[..., 3] = alpha * (tear < PEEL_MM * PX + 0.6 * PX)
    film = fbm(h, w, 18, 61)
    fibres = (noise(h, w, 2, 63) > 0.9) * (fbm(h, w, 30, 65) > 0.6)
    rgb[peeled] = np.array([0.42, 0.36, 0.27]) * (0.75 + 0.4 * film[peeled])[:, None]
    rgb[peeled & fibres] = np.array([0.55, 0.51, 0.42])
    alpha[peeled] = np.clip(0.22 + 0.35 * film[peeled] + 0.5 * fibres[peeled], 0, 0.9) * alpha[peeled]
    crease = (tear >= PEEL_MM * PX) & (tear < PEEL_MM * PX + 1.2 * PX)
    rgb[crease] = rgb[crease] * 0.72
    return flap


def wear(px, step):
    """The printed label worn; and its peeled corner. Rows of px run from the bottom up (Blender's order): flipped
    to the top first and back at the end."""
    img = px[::-1].copy()
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    rgb = img[..., :3]
    ink_mask = np.clip((0.55 - rgb.mean(axis=2)) / 0.3, 0, 1)
    rgb = _yellow_and_dirt(rgb, xx, yy)
    scratch = _scratches(h, w)
    rgb = rgb + (np.array(GROUND) * 0.92 - rgb) * (scratch * 0.75)[..., None] * np.maximum(ink_mask, 0.25)[..., None]
    fade = np.clip((fbm(h, w, 90, 5) - 0.45) * 2.2, 0, 1) * 0.35  # ink faded in patches
    rgb = rgb + (np.array(GROUND) * 0.9 - rgb) * (fade * ink_mask)[..., None]
    # the edges scuffed ragged
    alpha = np.ones((h, w), np.float32)
    ragged = (fbm(h, w, 10, 31) - 0.5) * 1.6 * PX
    alpha *= np.clip((np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)) - 2 + ragged) / 2.0, 0, 1)
    flap = _peel(img, rgb, alpha, xx, yy)
    # the bottom left corner torn off, and July punched out of the strip
    torn = ((xx + (h - yy) * 0.9) < 6 * PX + (fbm(h, w, 8, 51) - 0.5) * 3 * PX)
    alpha[torn] = 0.0
    hx, hy = 4 * PX + 6.5 * step * PX, 60.2 * PX
    alpha[((xx - hx) ** 2 + (yy - hy) ** 2) < (1.9 * PX) ** 2] = 0.0
    img[..., :3] = np.clip(rgb, 0, 1)
    img[..., 3] = alpha
    return img[::-1], flap[::-1]


def make_label():
    """Draws the label flat (flat colours, no light, no denoising), wears it, and writes the working files."""
    scene = reset()
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = False
    scene.render.film_transparent = False
    scene.render.filter_size = 0.8
    step = draw()
    camera(scene)
    path = out(f"{LABEL}-flat")
    render(scene, path)
    art, flap = wear(load_rgba(path), step)
    save_rgba(art, out(LABEL))
    save_rgba(flap, out(FLAP))
