"""A camera's plate: dark steel round the picture, riveted on, laced round with a cord of dyed cloth.

Five pictures for each of two plates, so that neighbours differ. All fill the frame layer:
    plate-N           the plate at rest, clear where the camera shows, its shadow on the mail in its transparency
    plate-polished-N  the same plate while its player speaks: rib, rolled edge and the steel round the picture bright
    plate-out-N       the same plate out of the call: rust from the corners, a rivet gone, the cord lost down a side
    cord-N            the cord alone, white, under the same light: the stylesheet dyes it the player's colour
    cord-out-N        what is left of the cord out of the call
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bpy
import numpy as np

from forms import band, cord, dents, facing_up, rivet, rounded, uneven
from measures import DENSITY, PLATE, SCALE, TILE, VIEW, frame_pixels, out, pixel, place
from pixels import clean, load_rgba, save_rgba
from shapes import ground
from studio import camera, render, reset, room
from steel import steel
from stuff import cloth

OUT, BELOW, BEAD = PLATE["out"], PLATE["below"], PLATE["bead"]
RIB_AT, RIB_HALF, RIB_HIGH = PLATE["ribAt"], PLATE["ribHalf"], 0.028
# In scene units: the plate's top above the mail, and how far up the rolled edge stands.
THICK = 0.11
LIP = BEAD / SCALE * 0.85
# Every ninth point of the outline has a hole and a stitch; out of the call this share of the way round has none.
EVERY = 9
LOST = (0.3, 0.47)
# The steel in each state: how light, how dull, how rusty, how rubbed.
STATES = {
    "plate": dict(tone=0.085, rough=0.42, rust=0.12, wear=0.8, scratches=0.4, corners=True, wear_tone=0.38, wear_patchy=0.75),
    "plate-polished": dict(tone=0.1, rough=0.36, rust=0.0, wear=1.0, scratches=0.3, corners=False, wear_tone=0.85, wear_patchy=0.15, wear_smooth=0.22),
    "plate-out": dict(tone=0.1, rough=0.55, rust=0.5, wear=0.15, scratches=0.2, corners=True),
}
# The band under the picture is left this much darker than the rest: the name is cut into it.
BLACK = 0.55
X0, Y0, X1, Y1 = -OUT, -OUT, TILE["w"] + OUT, TILE["h"] + BELOW


def outside(x, y):
    """How far outside the picture a point is, in tile units; inside it, how far in, below zero."""
    dx = max(-x, x - TILE["w"], 0.0)
    dy = max(-y, y - TILE["h"], 0.0)
    if dx > 0 or dy > 0:
        return math.hypot(dx, dy)
    return -min(x, TILE["w"] - x, y, TILE["h"] - y)


def shape(hollows):
    """The plate's surface: a rolled edge, a rib round the picture, the steel sunk a little inside it, and dents."""

    def height(d_out, x, y):
        z = THICK + hollows(x, y)
        if d_out < 2 * BEAD:
            z += math.sqrt(max(0.0, BEAD ** 2 - (d_out - BEAD) ** 2)) / SCALE * 0.85
        d_in = outside(x, y)
        if abs(d_in - RIB_AT) < RIB_HALF:
            z += RIB_HIGH * math.cos(math.pi / 2 * (d_in - RIB_AT) / RIB_HALF) ** 2
        if d_in < 4.0:
            t = min(1.0, (4.0 - d_in) / 10.0)
            z -= 0.03 * t * t * (3 - 2 * t)
        return z

    return height


def worn(d_out, x, y):
    """Where the plate is rubbed: the top of its rolled edge, and of the rib round the picture."""
    edge = max(0.0, 1.0 - abs(d_out - BEAD) / (BEAD * 0.75))
    d_in = outside(x, y)
    rib = max(0.0, 1.0 - abs(d_in - RIB_AT) / (RIB_HALF * 0.7)) if d_in > 0 else 0.0
    return min(1.0, max(edge, rib))


def black(d_out, x, y):
    """The band under the picture, between the rib and the rolled edge: left black from the forge."""
    below = min(1.0, max(0.0, (y - TILE["h"] - RIB_AT - RIB_HALF) / 5.0))
    inside = min(1.0, max(0.0, (d_out - 2 * BEAD - 1.0) / 4.0))
    return below * inside


def rivets(rng, kind, lost):
    """Rivets hold the plate to what is under it: one in each corner, one in the middle of the long sides."""
    head = steel("rivet", span=2.0, tone=kind["tone"] * 1.5, rough=kind["rough"] * 0.8, rust=kind["rust"] * 0.8, relief=0.8)
    mid = OUT / 2 + 2
    low = TILE["h"] + BELOW - mid
    spots = [(-mid, -mid), (TILE["w"] + mid, -mid), (TILE["w"] / 2, -mid), (-mid, low), (TILE["w"] + mid, low), (TILE["w"] / 2, low + 4)]
    for k, (sx, sy) in enumerate(spots):
        at = (*place(sx + rng.uniform(-2, 2), sy + rng.uniform(-1.5, 1.5)), THICK + 0.004)
        if not (lost and k == 1):  # out of the call one has gone
            rivet(f"rivet{k}", at, 0.058, head)


def stitch(rng, outline, k, white):
    """One turn of the cord: up through its hole inside the rolled edge, over the edge, and under the plate again."""
    count = len(outline)
    (ax, ay), (bx, by) = outline[k - 2], outline[(k + 2) % count]
    norm = math.hypot(bx - ax, by - ay)
    tx, ty = (bx - ax) / norm, (by - ay) / norm
    nx, ny = -ty, tx  # inward, going round clockwise with y down
    x, y = outline[k]
    hole = (x + nx * 15.5, y + ny * 15.5)
    lean = 7.0 + rng.uniform(-1.5, 1.5)
    top = THICK + LIP
    points = [
        (*place(*hole), THICK - 0.03),
        (*place(*hole), THICK + 0.035),
        (*place(x + nx * 9 + tx * lean * 0.35, y + ny * 9 + ty * lean * 0.35), top + 0.035),
        (*place(x + nx * 3 + tx * lean * 0.7, y + ny * 3 + ty * lean * 0.7), top + 0.03),
        (*place(x - nx * 3.5 + tx * lean, y - ny * 3.5 + ty * lean), THICK * 0.5),
        (*place(x - nx * 2.5 + tx * lean, y - ny * 2.5 + ty * lean), -0.02),
    ]
    return hole, (cord("stitch", points, 0.042, white) if white else None)


def lace(rng, outline, lost):
    """The cord, laced round the plate through a row of holes. Where it is lost the holes stand empty."""
    white = cloth("cord", span=2.2, colour=(0.9, 0.9, 0.9, 1))
    dark = steel("hole", tone=0.01, rough=0.9)
    count = len(outline)
    gone = range(round(count * LOST[0]), round(count * LOST[1])) if lost else range(0)
    stitches = []
    for k in range(0, count - EVERY // 2, EVERY):
        hole, made = stitch(rng, outline, k, None if k in gone else white)
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.036, depth=0.01, location=(*place(*hole), THICK + 0.002))
        bpy.context.object.data.materials.append(dark)
        if made:
            stitches.append(made)
    return stitches


def build(seed, name):
    """One plate in one state, in a scene of its own. Returns the scene, the mail's stand-in, and the cord's parts."""
    kind = STATES[name]
    lost = name == "plate-out"
    rng = random.Random(seed)
    scene = reset()
    room(scene, exposure=0.5)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.cycles.samples = 200
    camera(scene, *frame_pixels(), VIEW["w"] / SCALE)
    floor = ground(scene, catcher=True)
    scene.render.film_transparent = True
    outline = uneven(rounded(X0, Y0, X1, Y1, 16.0), rng, 1.6)
    hollows = dents(rng, X0, Y0, X1, Y1, 16)
    box = (*place(X0, Y1), *place(X1, Y0))
    extra = {key: kind[key] for key in ("wear_tone", "wear_patchy", "wear_smooth") if key in kind}
    metal = steel("plate", span=7.0, tone=kind["tone"], rough=kind["rough"], rust=kind["rust"], rust_edges=box if kind["corners"] else None, wear=kind["wear"], scratches=kind["scratches"], relief=1.2, hammered=0.5, shift=(rng.uniform(0, 7), rng.uniform(0, 7)), black_tone=BLACK, **extra)
    plate = facing_up(band("plate", outline, (40.0, 40.0, TILE["w"] - 40.0, TILE["h"] - 40.0), place, shape(hollows), worn=worn, dark=black))
    plate.data.materials.append(metal)
    rivets(rng, kind, lost)
    return scene, floor, lace(rng, outline, lost)


def shoot_plate(scene, name):
    """The plate with the camera's place cleared: the steel covers the picture's edge, and fades over it."""
    path = out(name)
    render(scene, path)
    cover = PLATE["cover"]
    hole = (*pixel(cover, cover), *pixel(TILE["w"] - cover, TILE["h"] - cover))
    save_rgba(clean(load_rgba(path), hole=hole, floor=0.05, feather=round(4 * DENSITY), shadow_fade=round(14 * DENSITY)), path)


def shoot_cord(scene, floor, stitches, name):
    """The cord alone, under the same light, with everything else in the way of it."""
    floor.hide_render = True
    for obj in scene.objects:
        if obj.type in ("MESH", "CURVE") and obj not in stitches and obj is not floor:
            obj.is_holdout = True
    scene.cycles.samples = 128
    path = out(name)
    render(scene, path)
    pixels = load_rgba(path)
    pixels[..., 3] = np.where(pixels[..., 3] < 0.04, 0.0, pixels[..., 3])
    save_rgba(pixels, path)


for number, seed in enumerate(PLATE["seeds"], start=1):
    for name in STATES:
        scene, floor, stitches = build(seed, name)
        shoot_plate(scene, f"{name}-{number}")
        if name == "plate":
            shoot_cord(scene, floor, stitches, f"cord-{number}")
        if name == "plate-out":
            shoot_cord(scene, floor, stitches, f"cord-out-{number}")
