"""The plates the dock's header and voice panel are, and the dock's edge: a sheet of gunmetal-grey painted steel,
2.5 CSS px thick, riveted over the bulkhead, darker than the bulkhead's green and a different tone (blue-grey, not
green), so it stands apart as a separate sheet.

  plate            the plate's face: its paint, 600 by 600 CSS px at one device pixel to a CSS px (its big scratches
                   don't come round often), lit by the sun and the sky alone (a ground that repeats takes only light
                   that is the same everywhere)
  plate-rim        its edge, cut in nine: a chamfered lip, lit at the top and left and dark at the bottom and right;
                   its rivets; its shadow on the bulkhead. Corner slices 16 CSS px (4 of them shadow outside the
                   plate's edge); the top and bottom middle slices 60 px long with a rivet in each (so `round` puts a
                   rivet every 60 px or so along the long edges); the left and right middle slices 24 px and plain.
                   Inside the lip the picture is clear but for the rivets, their grime and the corners' knocks: the
                   face's paint shows there
  plate-rim-plain  the same without the middle rivets (the narrow rail at a side, where a 60 px slice would squash)
  grime            600 by 16 CSS px along the plates' foot: dirt settled on the lower edge, darker toward it,
                   broken and streaked a little (its colour the plate's own darkest paint)
  trim             the dock's outer edge: angle steel round the bulkhead, its flat leg 6 CSS px wide lying on the
                   sheets, the other leg turned back along the dock's edge; mitred at the corners, a round-headed
                   bolt every 48 CSS px. Cut in nine: corner slices 9 CSS px (the leg and 3 px of the bulkhead inside
                   it, where the leg's shadow falls); the middle of each edge one bolt long, its paint one repeat of
                   the photograph long and aligned to its ends, so `round` repeats it without a seam. The middle of
                   the picture is clear (the dock's own ground)
  legend           the header's stencilled "COMMS-2" (parts_stencil.py), 76 by 16 CSS px: a crisp edge (the stencil
                   lay flat), a thin overspray mist just outside it, and the plate's own paint rubbed a little paler
                   round the marking where hands wipe it
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402,F401  (first: the paths)

import numpy as np  # noqa: E402

import parts_stencil  # noqa: E402
from measures import picture  # noqa: E402
from paint import painted  # noqa: E402
from parts import (PLATE, TRIM, c, catcher, coords, dome, drop_veil, ring_mesh, rrect_mask, setup, shadow,  # noqa: E402
                   slab, solid, wanted)
from pixels import load_rgba, save_rgba, soften  # noqa: E402
from stage import out, render  # noqa: E402

THICK = 2.5      # the plate's thickness
# the rim's picture
OUTSET = 4.0     # the shadow's band outside the plate's edge
CORNER = 16.0
MID_X, MID_Y = 60.0, 24.0
RIM_W, RIM_H = 2 * CORNER + MID_X, 2 * CORNER + MID_Y
HW, HH = RIM_W / 2 - OUTSET, RIM_H / 2 - OUTSET   # the plate's half size
LIP = 1.1        # the chamfer's width
RIVET_IN = 5.4   # in from the plate's edge, clear of the keys
EDGE = 2.6       # the band kept from the rendered plate; inside it the face's own paint shows


def ground():
    scene, _ = setup("plate", 600, 600, samples=128)
    scene.render.film_transparent = False
    steel = painted("plate", PLATE, span=c(600), chip=1.0, edge=c(0.6), grime=0.6, gloss=0.4, rust=0.8, detail=1.6)
    slab("face", 400, 400, 1, -THICK, 0.0, steel, bevel=0.1)
    render(scene, out("plate"))


# ---- the rim ----


def outline(hw, hh, r, nx=24, ny=10, k=6):
    """A rounded rectangle with points along its straight sides too (a fixed count, any size), so wear given per
    vertex can change along an edge."""
    pts = []
    corners = ((hw - r, hh - r, 0), (-hw + r, hh - r, 90), (-hw + r, -hh + r, 180), (hw - r, -hh + r, 270))
    sides = (ny, nx, ny, nx)
    for (cx, cy, start), (ncx, ncy, _), n in zip(corners, corners[1:] + corners[:1], sides):
        for i in range(k):
            a = math.radians(start + 90 * i / (k - 1))
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        a = math.radians(start + 90)
        x0, y0 = cx + r * math.cos(a), cy + r * math.sin(a)
        x1, y1 = ncx + r * math.cos(a), ncy + r * math.sin(a)
        for i in range(1, n):
            t = i / n
            pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    return pts


def knocked(x, y):
    """Wear from knocks, where the plate gets knocked: a clean knock to bare steel on the lip alone, within 3 px of
    a corner (short of the corner rivet's head, 5.4 px in)."""
    d = min(math.hypot(abs(x) - HW, abs(y) - HH), 99.0)
    return float(np.clip(1.35 - d / 3.0, 0.0, 1.0))


def steel_paint(name, chip):
    """The plate's paint, the photograph stretched to one repeat over each middle slice."""
    mat = painted(name, PLATE, span=c(MID_X), chip=chip, edge=c(0.9), grime=0.9, gloss=0.4, rust=0.25, detail=0.9)
    for n in mat.node_tree.nodes:
        if n.type == "MAPPING":
            n.inputs["Scale"].default_value = (1 / c(MID_X), 1 / c(MID_Y), 1 / c(MID_X))
            n.inputs["Location"].default_value = (0.5, 0.5, 0)
    return mat


def rim_plate(worn):
    mat = steel_paint("plate", 1.4)
    rings = [(outline(HW, HH, 3.0), -THICK, worn), (outline(HW, HH, 3.0), -LIP * 0.9, worn),
             (outline(HW - LIP * 0.45, HH - LIP * 0.45, 2.7), -LIP * 0.25, worn),
             (outline(HW - LIP, HH - LIP, 2.4), 0.0, worn), (outline(HW - 6, HH - 6, 1.5), 0.0, 0.0),
             (outline(HW - 10, HH - 10, 0.5), 0.0, 0.0)]
    return ring_mesh("plate", rings, mat, cap_last=0.0)


def rivet_spots(mids):
    k = (HW - RIVET_IN, HH - RIVET_IN)
    spots = [(-k[0], k[1]), (k[0], k[1]), (-k[0], -k[1]), (k[0], -k[1])]
    return spots + ([(0, k[1]), (0, -k[1])] if mids else [])


def rim(name, mids):
    """The rim rendered three times: knocked with its rivets, the same plate unknocked (where the two differ are
    the corners' knocks; the rivets on both, so their long shadows in the room's light don't come through as
    streaks), and the rivets alone."""
    scene, density = setup(name, RIM_W, RIM_H, samples=256)
    obj = rim_plate(knocked)
    rivet = painted("rivet", PLATE, span=c(MID_X), chip=2.6, edge=c(0.8), grime=1.0, gloss=0.5, rust=0.3)
    spots = rivet_spots(mids)
    for i, s in enumerate(spots):
        dome(f"rivet{i}", s, 1.9, 1.1, 0.0, rivet)
    path = out(name)
    render(scene, path)
    whole = load_rgba(path)
    obj.hide_render = True
    rim_plate(0.0)
    render(scene, out(f"{name}-clean"))
    clean = load_rgba(out(f"{name}-clean"))
    for o in scene.objects:
        if o.name.startswith("plate"):
            o.hide_render = True
    render(scene, out(f"{name}-rivets"))
    rivets = load_rgba(out(f"{name}-rivets"))[..., 3]
    save_rgba(rim_picture(whole, clean, rivets, spots, density), path)


def rim_picture(whole, clean, rv, spots, density):
    """The rim's picture: the rendered lip and rivets; inside the lip only the knocks, the rivets, their shadows
    and grime; outside the plate its shadow on the bulkhead, a close one (1 px down and right) and a softer one
    (2.5 px), so the 2.5 px plate stands proud of the sheets."""
    xs, ys = coords(whole.shape, RIM_W, RIM_H)
    lum = whole[..., :3].mean(axis=2)
    chips = np.clip(np.abs(lum - clean[..., :3].mean(axis=2)) / 0.05, 0, 1)
    chips = soften(chips, 1) * 1.2
    # grime round each rivet: a dark ring where dirt lodges against its head, broken by the paint's own grain
    grime = np.zeros_like(lum)
    grain = np.clip((lum - lum.mean()) * 6 + 0.5, 0, 1)
    for sx, sy in spots:
        r = np.hypot(xs[None, :] - sx, ys[:, None] - sy)
        grime = np.maximum(grime, np.clip(1 - np.abs(r - 2.4) / 1.3, 0, 1) * (0.55 + 0.45 * grain))
    inner = rrect_mask(whole.shape, RIM_W, RIM_H, HW - EDGE, HH - EDGE, 1.5)
    body = whole[..., 3]
    sh = shadow(rv, 1.2, 0.5, density) * 0.6
    face_a = np.clip(np.maximum.reduce([rv, sh, grime * 0.6, chips]), 0, 1)
    dirt = np.array([0.035, 0.03, 0.025])
    face_rgb = whole[..., :3] * rv[..., None] + (1 - rv[..., None]) * (
        np.where((chips > grime * 0.6)[..., None], whole[..., :3], dirt[None, None, :] * (1 - sh[..., None])))
    face_rgb = np.where((sh > np.maximum(chips, grime * 0.6))[..., None] & (rv < 0.5)[..., None],
                        np.zeros(3)[None, None, :], face_rgb)
    drop = np.maximum(shadow(body, THICK, 0.5, density) * 0.78,
                      shadow(body, THICK * 2.6, 1.4, density) * 0.55) * (1 - body)
    a = np.where(inner > 0, inner * face_a + (1 - inner) * body, body + drop)
    rgb = np.where((inner > 0)[..., None], face_rgb * inner[..., None] + whole[..., :3] * (1 - inner[..., None]),
                   whole[..., :3] * (body / np.maximum(a, 1e-4))[..., None])
    return np.dstack([rgb, a])


# ---- the plates' foot ----


def grime():
    """Computed: two noises and a streak, darker toward the foot; the plate's darkest paint as its colour."""
    if not os.path.exists(out("plate")):
        raise SystemExit("grime: plate.png is needed first (its colour is the plate's darkest paint)")
    ground_px = load_rgba(out("plate"))
    width, height = picture("grime")
    shape = (height, width)
    density = height / 16.0
    rng = np.random.default_rng(11)
    n1 = soften(rng.random(shape).astype(np.float32), 6)
    n2 = soften(rng.random(shape).astype(np.float32), 2)
    streak = soften(rng.random((1, shape[1])).astype(np.float32), 3).repeat(shape[0], axis=0)
    ys = (np.arange(shape[0]) + 0.5) / density          # rows run up: y up from the foot
    fall = np.clip(1.0 - ys / 16.0, 0, 1) ** 1.8
    n = (n1 - n1.mean()) / (n1.std() + 1e-6) * 0.5 + (n2 - n2.mean()) / (n2.std() + 1e-6) * 0.25
    s = (streak - streak.mean()) / (streak.std() + 1e-6)
    a = np.clip(fall[:, None] * (0.55 + 0.25 * n + 0.18 * s), 0, 0.62)
    dirt = np.percentile(ground_px[..., :3].reshape(-1, 3), 3, axis=0) * 0.7
    save_rgba(np.dstack([np.broadcast_to(dirt, shape + (3,)), a]).astype(np.float32), out("grime"))


# ---- the dock's edge ----

LEG, BAND, STEP = 6.0, 3.0, 48.0
TRIM_HALF = LEG + BAND + STEP / 2     # 33: the trim picture's half size
TRIM_THICK = 1.8
MITRE = 0.14                          # the mitre's seam


def leg(name, side, mat):
    """One leg, a trapezoid from the picture's edge in to the leg's inner edge, mitred at both ends."""
    o, i = TRIM_HALF + 2.0, TRIM_HALF - LEG
    pts = [(-o + MITRE, o), (o - MITRE, o), (i - MITRE, i), (-i + MITRE, i)]
    rot = {"top": lambda x, y: (x, y), "right": lambda x, y: (y, -x), "bottom": lambda x, y: (-x, -y),
           "left": lambda x, y: (-y, x)}[side]
    pts = [rot(x, y) for x, y in pts]
    return solid(name, [(pts, 0.0), (pts, TRIM_THICK)], mat, 0.5)


def trim():
    size = 2 * TRIM_HALF
    scene, _ = setup("trim", size, size, samples=256)
    # its chips kept rare, so none is cut off at the slices' joins
    steel = painted("trim", TRIM, span=c(STEP), offset=(0.5, 0.5), chip=0.55, edge=c(0.9), grime=0.9, gloss=0.35,
                    rust=0.4)
    bolt = painted("bolt", TRIM, span=c(STEP), chip=2.4, edge=c(0.7), grime=0.9, gloss=0.5, rust=0.6)
    for side in ("top", "right", "bottom", "left"):
        leg(f"leg-{side}", side, steel)
    m = TRIM_HALF - LEG / 2
    for i, (x, y) in enumerate(((0, m), (m, 0), (0, -m), (-m, 0))):
        dome(f"bolt{i}", (x, y), 1.7, 1.0, TRIM_THICK, bolt)
    catcher(TRIM_HALF + 4, TRIM_HALF + 4, 0.0)
    path = out("trim")
    render(scene, path)
    save_rgba(drop_veil(load_rgba(path)), path)


# ---- the stencilled marking ----

LEGEND_W, LEGEND_H = 76.0, 16.0
BASELINE = 2.6    # up from the picture's foot


def legend():
    """Rendered: the worn paint's light over the whole picture; computed: where the letters are."""
    scene, density = setup("legend", LEGEND_W, LEGEND_H, samples=96)
    sheet = slab("sheet", LEGEND_W, LEGEND_H, 0.5, -0.2, 0.0, parts_stencil.stencil_paint(), bevel=0.05)
    render(scene, out("legend-wear"))
    wear = load_rgba(out("legend-wear"))
    sheet.hide_render = True
    xs, ys = coords(wear.shape, LEGEND_W, LEGEND_H)       # y up from the middle
    d = parts_stencil.distance(xs[None, :] + LEGEND_W / 2, ys[:, None] + LEGEND_H / 2 - BASELINE, "COMMS-2",
                               LEGEND_W)
    core = np.clip(0.5 - d * density, 0.0, 1.0)
    rng = np.random.default_rng(7)
    mist = np.clip(1.0 - d / 0.9, 0.0, 1.0) * (d > 0) * (rng.random(d.shape) < 0.35) * 0.35
    paint_a = np.maximum(core, mist) * wear[..., 3] * 0.94
    # the plate's own paint rubbed paler round the marking: a faint, broken patch
    ell = np.clip(1.0 - np.hypot(xs[None, :] / (LEGEND_W * 0.5), ys[:, None] / (LEGEND_H * 0.62)), 0.0, 1.0)
    rub_noise = soften(rng.random(d.shape).astype(np.float32), int(1.2 * density))
    rub = np.clip(ell * 1.6, 0, 1) * np.clip((rub_noise - 0.47) * 9, 0, 1) * 0.10
    rub_rgb = np.array([0.36, 0.38, 0.37])
    rgb = wear[..., :3] * paint_a[..., None] + rub_rgb[None, None, :] * (rub * (1 - paint_a))[..., None]
    a = paint_a + rub * (1 - paint_a)
    rgb = rgb / np.maximum(a, 1e-4)[..., None]
    save_rgba(np.dstack([np.clip(rgb, 0, 1), a]).astype(np.float32), out("legend"))


MAKERS = {"plate": ground, "plate-rim": lambda: rim("plate-rim", True),
          "plate-rim-plain": lambda: rim("plate-rim-plain", False), "grime": grime, "trim": trim, "legend": legend}

for picture_name in wanted(list(MAKERS)):
    MAKERS[picture_name]()
