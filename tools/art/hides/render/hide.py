"""A camera's hide: flesh side out, laced into a frame of four lashed poles, its hair showing past its edge.

Four pictures for each of two hides, so that neighbours differ. All fill the frame layer:
    hide-N      the hide in its frame, clear where the camera shows, its shadow on the wall in its transparency
    hide-cut-N  the same with the thongs of one corner cut and hanging: its player has left the call
    light-N     the hide alone, as a mask: where firelight shows through it while its player speaks
    paint-N     the same hide painted white, kept only where the war paint's daubs are (drawn by ../paint.ts and
                turned into pixels before this scene runs): the stylesheet gives it the player's colour
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

from forms import cord, fur, pole, pulled_outline, ring
from measures import DENSITY, HIDE, SCALE, TILE, VIEW, frame_pixels, out, pixel, place
from pixels import clean, load_rgba, save_rgba
from shapes import sheet
from stage import start
from studio import render
from stuff import hide, pelt, surface

# Each hide: the seed of its ties and poles, and which part of the photographed leather it is cut from.
HIDES = [dict(seed=7, shift=0.3), dict(seed=23, shift=0.62)]
# The ties of the lower right corner, counted clockwise from the top left: the ones cut when a player leaves.
CUT = (10, 11, 12, 13, 14, 15, 16)
# Ties along the top and the bottom, and down each side.
ACROSS, DOWN = 7, 3
# In scene units: a thong's radius, a pole's, how far above the wall the hide hangs, and a tie's hole from its tip.
THONG = 0.04
POLE = HIDE["poleRadius"] / SCALE
Z_HIDE = 0.3
HOLE_IN = 10.0
# The poles across lie on the wall and the uprights over them.
Z_ACROSS, Z_UPRIGHT = POLE, POLE * 2.5
# How far a pole runs on past the one it crosses, in tile units.
OVER = 20.0


def hanging(rng, start_at, length, sway):
    """A cut end: it leaves the way it was pulled, then falls down the wall, and its tip curls."""
    x, y, z = start_at
    curl = rng.uniform(0.5, 1.5) * rng.choice((-1, 1))
    points = []
    for k in range(15):
        t = k / 14
        dx = sway * math.sin(t * math.pi * 0.85) + 0.05 * curl * t ** 3 * math.sin(t * 4.5)
        dy = -length * t ** 1.2 + 0.05 * abs(curl) * max(0.0, t - 0.7) ** 2 * 6
        points.append((x + dx, y + dy, z - 0.03 * min(1.0, t * 3)))
    return points


def frame(rng):
    """The four poles. Returns where each side's pole lies: its axis, its place across it, and its height."""
    left, right = -HIDE["poleOut"], TILE["w"] + HIDE["poleOut"]
    top = -HIDE["poleOut"]
    bottom = TILE["h"] + HIDE["below"] + HIDE["poleUnder"]
    upright = surface("pole-v", "rough_wood", 4.0, tint=(0.8, 0.66, 0.52, 1), strength=1.5)
    across = surface("pole-h", "rough_wood", 4.0, turn=math.pi / 2, tint=(0.8, 0.66, 0.52, 1), strength=1.5)
    for y in (top, bottom):
        pole("across", (*place(left - OVER, y), Z_ACROSS), (*place(right + OVER, y), Z_ACROSS), POLE, rng, across)
    for x in (left, right):
        pole("upright", (*place(x, top - OVER), Z_UPRIGHT), (*place(x, bottom + OVER - 3), Z_UPRIGHT), POLE, rng, upright)
    sides = [("x", top, Z_ACROSS), ("y", right, Z_UPRIGHT), ("x", bottom, Z_ACROSS), ("y", left, Z_UPRIGHT)]
    return sides, [(x, y) for x in (left, right) for y in (top, bottom)]


def wrap(rng, thong, axis, at, z_pole):
    """Two turns of thong round a pole, where the lacing goes over it."""
    wx, wy = at
    for shift in (-0.045, 0.045):
        where = (wx + shift, wy, z_pole) if axis == "x" else (wx, wy + shift, z_pole)
        ring("wrap", where, POLE * 1.06 + THONG * 0.6, THONG, axis, thong, tilt=rng.uniform(-0.08, 0.08))


def lace_side(rng, thong, holes, index, side, loose):
    """One side's thong: from a hole out round the pole and back to the next hole. Where a tie is cut the run ends,
    what is still tied keeps its half, and the cut ends hang."""
    axis, where, z_pole = side
    line = []
    for a, b in zip(index, index[1:]):
        (ax, ay), (bx, by) = holes[a], holes[b]
        wx, wy = place(*(((ax + bx) / 2, where) if axis == "x" else (where, (ay + by) / 2)))
        over = (wx, wy, z_pole + POLE * 0.95)
        wrap(rng, thong, axis, (wx, wy), z_pole)
        if a not in loose and b not in loose:
            line += [(*place(ax, ay), Z_HIDE + 0.05), over]
            continue
        if a not in loose:
            line += [(*place(ax, ay), Z_HIDE + 0.05), over]
        if len(line) > 1:
            cord("lace", line, THONG, thong)
        if axis == "y":
            cord("end", hanging(rng, (wx - POLE * 0.5, wy, z_pole + POLE * 0.9), rng.uniform(0.55, 1.3), rng.uniform(-0.16, 0.16)), THONG, thong)
        for hole in (a, b):
            if hole in loose and rng.random() < 0.75:
                cord("end", hanging(rng, (*place(*holes[hole]), Z_HIDE + 0.05), rng.uniform(0.3, 0.75), rng.uniform(-0.14, 0.14)), THONG, thong)
        line = [] if b in loose else [over]
    if index[-1] not in loose:
        line.append((*place(*holes[index[-1]]), Z_HIDE + 0.05))
        if len(line) > 1:
            cord("lace", line, THONG, thong)


def lash(rng, thong, corner):
    """Where two poles cross they are lashed: turns of thong round each, and two across."""
    cx, cy = place(*corner)
    for k in range(3):
        d = POLE + 0.05 + k * 0.075
        for sign in (-1, 1):
            ring("lash", (cx, cy + sign * d, Z_UPRIGHT), POLE * 1.06 + THONG * 0.6, THONG, "y", thong, tilt=rng.uniform(-0.1, 0.1))
            ring("lash", (cx + sign * d, cy, Z_ACROSS), POLE * 1.06 + THONG * 0.6, THONG, "x", thong, tilt=rng.uniform(-0.1, 0.1))
    for sign in (-1, 1):
        cord("cross", [(cx - POLE, cy - sign * POLE, Z_UPRIGHT + POLE * 0.75), (cx, cy, Z_UPRIGHT + POLE * 1.02), (cx + POLE, cy + sign * POLE, Z_UPRIGHT + POLE * 0.75)], THONG, thong)


def build(rng, spec, loose):
    """The hide, its hair, its holes, the poles and the lacing. Returns the hide's own sheet and where it lies."""
    x0, y0 = -HIDE["tip"], -HIDE["tip"]
    x1, y1 = TILE["w"] + HIDE["tip"], TILE["h"] + HIDE["below"]
    outline, ties = pulled_outline(rng, x0, y0, x1, y1, across=ACROSS, down=DOWN, loose=loose)
    placed = [place(x, y) for x, y in outline]
    page = sheet("hide", placed, thick=0.03, z=Z_HIDE)
    box = (*place(x0, y1), *place(x1, y0))
    page.data.materials.append(hide("hide", box=box, shift=(0.9, spec["shift"])))
    fur("fur", placed, rng, pelt("pelt"), Z_HIDE)
    thong = surface("thong", "fabric_leather_01", 3.0, tint=(0.42, 0.36, 0.3, 1))
    dark = surface("hole", "fabric_leather_01", 3.0, tint=(0.08, 0.06, 0.05, 1))
    holes = [(tx - nx * HOLE_IN, ty - ny * HOLE_IN) for (tx, ty), (nx, ny) in ties]
    for hx, hy in holes:
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.035, depth=0.01, location=(*place(hx, hy), Z_HIDE + 0.031))
        bpy.context.object.data.materials.append(dark)
    sides, corners = frame(rng)
    start_at = 0
    # Ties from one corner up to the next, the first corner included.
    for side, count in zip(sides, (ACROSS + 1, DOWN + 1, ACROSS + 1, DOWN + 1)):
        index = [(start_at + k) % len(holes) for k in range(count + 1)]
        lace_side(rng, thong, holes, index, side, loose)
        start_at += count
    for corner in corners:
        lash(rng, thong, corner)
    return page, box


def cleaned(path, shadow_fade=0):
    """A render with the camera's place cleared: the hide covers the picture's edge, and fades over it."""
    cover = HIDE["cover"]
    hole = (*pixel(cover, cover), *pixel(TILE["w"] - cover, TILE["h"] - cover))
    return clean(load_rgba(path), hole=hole, floor=0.06, feather=3, shadow_fade=shadow_fade)


def shoot(number, spec, cut):
    """One hide in its frame. Whole, it is shot twice more: alone as a mask, and painted."""
    rng = random.Random(spec["seed"])
    scene, wall = start(*frame_pixels(), VIEW["w"] / SCALE)
    page, box = build(rng, spec, CUT if cut else ())
    path = out(f"hide-cut-{number}" if cut else f"hide-{number}")
    render(scene, path)
    save_rgba(cleaned(path, shadow_fade=round(18 * DENSITY)), path)
    if cut:
        return
    wall.hide_render = True
    for obj in scene.objects:
        if obj.type in ("MESH", "CURVE", "CURVES") and obj is not page and obj is not wall:
            obj.is_holdout = True
    scene.cycles.samples = 24
    light = out(f"light-{number}")
    render(scene, light)
    mask = np.ones_like(load_rgba(light))
    mask[..., 3] = cleaned(light)[..., 3]
    save_rgba(mask, light)
    # The paint: the same hide under the same light, white all over; only the daubs are kept.
    page.data.materials[0] = hide("paint", box=box, shift=(0.9, spec["shift"]), paint=True)
    scene.cycles.samples = 128
    paint = out(f"paint-{number}")
    render(scene, paint)
    painted = load_rgba(paint)
    daubs = load_rgba(out(f"daubs-{number}"))
    painted[..., 3] = daubs[..., 3] * 0.94
    save_rgba(painted, paint)


for number, spec in enumerate(HIDES, start=1):
    shoot(number, spec, cut=False)
    shoot(number, spec, cut=True)
