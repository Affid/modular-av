"""For the free room under the cameras, when there is most of it: a buckler, hung by its strap from a hook through
the mail. Dished, dented, cut and rusted: a veteran's. Its picture has its shadow on the mail in its transparency."""
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

from forms import cord, rivet
from measures import UNIT_PX
from shapes import lathe
from stage import finish, half_size, start
from steel import steel
from stuff import leather

R = 3.0  # scene units: 150 CSS pixels across
# A buckler is no flat disc: its face is dished outward like a shallow bowl turned over, the boss stands high in
# the middle for the fist behind it, and the rim is rolled over a wire.
RISE, BOSS, BOSS_R = 0.62, 0.8, 0.86
# It hangs by its top: the strap holds the top off the mail, the bottom rests on it, and it has swung a little.
LEAN, SWING = math.radians(5), math.radians(-3)
# Cuts from edges it turned: where, which way, how long, how wide, and how fresh (a fresh one is bare steel, an
# old one has gone dark).
CUTS = [(-1.45, 1.05, 0.5, 1.3, 0.03, 1.0), (1.25, -0.35, -1.05, 1.0, 0.024, 0.75), (0.3, -1.95, 0.25, 0.8, 0.02, 0.35), (-1.0, -1.25, 2.1, 0.6, 0.018, 0.5), (1.95, 1.25, 1.3, 0.55, 0.018, 0.9), (-2.1, -0.2, 1.75, 0.45, 0.016, 0.3), (0.9, 2.1, -0.3, 0.5, 0.016, 0.6)]
# The picture the cuts are drawn into, in pixels each way.
DRAWN = 1536


def face(r):
    """The dished face's height at a radius."""
    return 0.12 + RISE * (1 - (min(r, 2.8) / 2.8) ** 2)


def profile():
    """From the boss's top out to the rolled rim and down its edge: (radius, height), fine enough along its way
    for blows to be struck into it."""
    coarse = [(BOSS_R * k / 14, face(BOSS_R) + BOSS * math.cos(math.pi / 2 * k / 14) ** 0.7) for k in range(14)]
    coarse += [(BOSS_R, face(BOSS_R) + 0.03), (0.93, face(0.93))]
    coarse += [(r / 100, face(r / 100)) for r in range(100, 131, 10)]
    coarse += [(1.32, face(1.32) + 0.025), (1.35, face(1.35))]
    coarse += [(r / 100, face(r / 100)) for r in range(145, 281, 15)]
    coarse += [(2.8 + 0.2 * k / 8, 0.12 + 0.13 * math.sin(math.pi * k / 8)) for k in range(1, 8)]
    coarse += [(3.0, 0.1), (3.0, 0.0)]
    fine = []
    for (r0, z0), (r1, z1) in zip(coarse, coarse[1:]):
        fine += [(r0 + (r1 - r0) * k / 3, z0 + (z1 - z0) * k / 3) for k in range(3)]
    return fine + [coarse[-1]]


def draw_cuts():
    """The cuts as a picture for the steel (steel.py): red is how deep, green how bare. Only on the face."""
    axis = (np.arange(DRAWN, dtype=np.float32) + 0.5) / DRAWN * 2 * R - R
    gx, gy = np.meshgrid(axis, axis)
    depth = np.zeros((DRAWN, DRAWN), dtype=np.float32)
    bare = np.zeros((DRAWN, DRAWN), dtype=np.float32)
    for cx, cy, turn, long, wide, fresh in CUTS:
        dx, dy = gx - cx, gy - cy
        along = dx * math.cos(turn) + dy * math.sin(turn)
        # A blade's cut is not straight: it wanders a little along its length.
        across = -dx * math.sin(turn) + dy * math.cos(turn) + 0.012 * np.sin(along * 9.0 + cx)
        taper = np.clip(1 - (np.abs(along) / (long / 2)) ** 2, 0, 1) ** 0.7
        depth = np.maximum(depth, taper * np.exp(-(across / wide) ** 2))
        bare = np.maximum(bare, fresh * taper * np.exp(-(across / (wide * 1.5)) ** 2))
    radius = np.hypot(gx, gy)
    on_face = ((radius > 0.95) & (radius < 2.8)).astype(np.float32)
    drawn = np.zeros((DRAWN, DRAWN, 4), dtype=np.float32)
    drawn[..., 0], drawn[..., 1], drawn[..., 3] = depth * on_face, bare * on_face, 1.0
    marks = bpy.data.images.new("cuts", DRAWN, DRAWN, alpha=True, float_buffer=True, is_data=True)
    marks.pixels.foreach_set(drawn.ravel())
    return marks


def strike(shield, rng):
    """What years of use left in its shape: hollows where it was struck and hammered back. And where it is
    rubbed bright: the boss's top and the rim's top."""
    hollows = [(rng.uniform(-2.5, 2.5), rng.uniform(-2.5, 2.5), rng.uniform(0.012, 0.035), rng.uniform(0.25, 0.7)) for _ in range(22)]
    rubbed = []
    for vertex in shield.data.vertices:
        x, y = vertex.co.x, vertex.co.y
        r = math.hypot(x, y)
        if vertex.co.z > 0.03:
            vertex.co.z -= sum(d * math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (wide * wide)) for hx, hy, d, wide in hollows)
        rubbed.append(min(1.0, max(max(0.0, 1 - r / 0.5), max(0.0, 1 - abs(r - 2.93) / 0.09))))
    layer = shield.data.attributes.new("worn", "FLOAT", "POINT")
    layer.data.foreach_set("value", rubbed)


def hang(scene, shield, middle):
    """The shield and what is riveted to it, leaning off the mail from its top. Returns what holds them."""
    hung = bpy.data.objects.new("hung", None)
    scene.collection.objects.link(hung)
    hung.rotation_euler = (LEAN, SWING, 0)
    hung.location = (0, middle, 0.12 + R * math.sin(LEAN) + 0.02)
    shield.parent = hung
    head = steel("rivet", span=2.0, tone=0.13, rough=0.34, rust=0.1, relief=0.8)
    for k in range(8):
        a = math.tau * (k + 0.5) / 8
        rivet("rivet", (1.1 * math.cos(a), 1.1 * math.sin(a), face(1.1) + 0.01), 0.075, head).parent = hung
    for side in (-1, 1):
        rivet("stud", (side * 0.5, R - 0.5, face(2.5) + 0.02), 0.06, head).parent = hung


def strap(top):
    """Its strap: riveted inside the rim at the top, up to a hook through the mail."""
    hide = leather("strap")
    high = 0.12 + 2 * R * math.sin(LEAN)
    for side in (-1, 1):
        cord("strap", [(side * 0.5, top - 0.5, high + 0.12), (side * 0.42, top - 0.1, high + 0.2), (side * 0.25, top + 0.45, high + 0.05), (side * 0.06, top + 0.82, 0.36)], 0.07, hide, flat=0.45)
    iron = steel("hook", span=2.0, tone=0.12, rough=0.4, rust=0.25, relief=1.0)
    cord("hook", [(0.0, top + 1.2, 0.1), (0.0, top + 1.15, 0.3), (0.0, top + 0.82, 0.46), (0.0, top + 0.6, 0.4), (0.0, top + 0.66, 0.24)], 0.05, iron)


scene, floor = start("buckler")
_, half_high = half_size("buckler")
middle = -(half_high - 12 / UNIT_PX - R)  # below the picture's own: its rim 12 pixels off the foot
shield = lathe("buckler", profile(), steps=200)
strike(shield, random.Random(4))
shield.data.materials.append(steel("buckler", span=7.0, tone=0.08, rough=0.36, rust=0.42, wear=0.9, scratches=0.5, relief=1.3, hammered=0.6, wear_tone=0.42, wear_patchy=0.6, shift=(2.0, 5.0), marks=(draw_cuts(), (-R, -R, R, R))))
hang(scene, shield, middle)
strap(middle + R)
finish(scene, floor, "buckler", near=22)
