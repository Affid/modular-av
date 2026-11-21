"""For the free room under the cameras, when there is little of it: a flanged mace, all steel but its grip, lying
across in two staples as the knife does on a plate. Its picture has its shadow on the mail in its transparency."""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bpy

from forms import cord
from shapes import lathe
from stage import finish, start
from steel import steel
from stuff import leather

Z = 0.55  # the haft's middle above the mail, in scene units
BUTT, NECK = -4.6, 2.9  # the haft along the picture: from its butt to where the head begins
# A flange's outline: how far along the head, how far out from the haft.
FLANGE = [(0.0, 0.12), (0.1, 0.42), (0.34, 0.66), (0.52, 0.74), (0.68, 0.66), (0.98, 0.4), (1.1, 0.12)]
FLANGES = 7
# The whole lies a little right of and under the picture's middle: its shadow falls down and to the right.
NUDGE = (0.1, -0.1)


def haft(iron, thong):
    """Turned about its own length: a butt knob, the grip's collars, a long plain run, and the head's core with a
    point. The grip is wound with a leather thong."""
    profile = [(0.0, BUTT - 0.22), (0.16, BUTT - 0.2), (0.24, BUTT - 0.08), (0.24, BUTT + 0.02), (0.15, BUTT + 0.1), (0.15, BUTT + 1.5), (0.2, BUTT + 1.55), (0.2, BUTT + 1.68), (0.13, BUTT + 1.74), (0.125, NECK - 0.1), (0.2, NECK - 0.04), (0.2, NECK + 0.1), (0.15, NECK + 0.16), (0.15, NECK + 1.2), (0.2, NECK + 1.24), (0.2, NECK + 1.34), (0.1, NECK + 1.44), (0.0, NECK + 1.62)]
    turned = lathe("haft", profile, steps=32)
    turned.rotation_euler = (0, math.pi / 2, 0)
    turned.location = (0, 0, Z)
    turned.data.materials.append(iron)
    for k in range(13):
        x = BUTT + 0.16 + 1.3 * (k + 0.5) / 13
        cord("wrap", [(x - 0.02, -0.17, Z - 0.02), (x - 0.01, -0.1, Z + 0.17), (x + 0.01, 0.1, Z + 0.17), (x + 0.02, 0.17, Z - 0.02)], 0.035, thong)


def flange(scene, turn, bright):
    """One plate of the head, standing out from the haft at `turn` about it: thick at the haft, thin at its edge,
    and rubbed bright there."""
    verts = [(NECK + 0.12 + along, out, side * 0.055 * (1.25 - out)) for side in (-1, 1) for along, out in FLANGE]
    count = len(FLANGE)
    faces = [tuple(range(count)), tuple(range(2 * count - 1, count - 1, -1))]
    faces += [(i, i + 1, count + i + 1, count + i) for i in range(count - 1)]
    mesh = bpy.data.meshes.new("flange")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    layer = mesh.attributes.new("worn", "FLOAT", "POINT")
    layer.data.foreach_set("value", [min(1.0, max(0.0, (v[1] - 0.45) / 0.25)) for v in verts])
    plate = bpy.data.objects.new("flange", mesh)
    scene.collection.objects.link(plate)
    plate.rotation_euler = (turn, 0, 0)
    plate.location = (0, 0, Z)
    mesh.materials.append(bright)


scene, floor = start("mace")
iron = steel("mace", span=5.0, tone=0.085, rough=0.38, rust=0.22, scratches=0.4, relief=1.1, hammered=0.35, shift=(1.0, 3.0))
bright = steel("flange", span=3.0, tone=0.1, rough=0.34, rust=0.3, wear=0.9, scratches=0.4, relief=1.1, wear_tone=0.42, wear_patchy=0.5, shift=(4.0, 1.0))
haft(iron, leather("grip", tint=(0.26, 0.18, 0.12, 1)))
for k in range(FLANGES):
    flange(scene, math.tau * k / FLANGES + 0.2, bright)
# Two staples hold it to the mail.
for x in (BUTT + 2.3, NECK - 0.7):
    cord("staple", [(x, -0.3, 0.05), (x, -0.3, Z + 0.1), (x, 0.0, Z + 0.26), (x, 0.3, Z + 0.1), (x, 0.3, 0.05)], 0.04, iron)
for obj in list(scene.objects):
    if obj.type in ("MESH", "CURVE") and obj is not floor:
        obj.location.x += NUDGE[0]
        obj.location.y += NUDGE[1]
finish(scene, floor, "mace", near=16)
