"""For the free room under the cameras, when there is some of it: a pair of mitten gauntlets hung by a thong through
their cuffs from a hook, fingers down, backs outward. Its picture has its shadow on the mail in its transparency."""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bpy

from forms import cord, rivet
from stage import finish, half_size, start
from steel import steel
from stuff import leather

scene, floor = start("gauntlets")
_, HALF_HIGH = half_size("gauntlets")
plate_steel = steel("gauntlet", span=5.0, tone=0.06, rough=0.42, rust=0.3, wear=0.85, scratches=0.4, relief=1.1, hammered=0.5, wear_tone=0.4, wear_patchy=0.55, shift=(3.0, 2.0))
head = steel("rivet", span=2.0, tone=0.13, rough=0.34, rust=0.1, relief=0.8)

def lame(parent, y0, y1, w0, w1, h0, h1, z0, round_end=False, lip=0.0, at=(0.0, 0.0), turn=0.0):
    """One plate of a gauntlet: curved across the hand, from y0 down to y1, its width and its height changing
    along it. `lip` turns its upper edge outward (a cuff's flare); a rounded end closes the fingertips."""
    rows, cols = 14, 28
    verts, faces, rubbed = [], [], []
    for i in range(rows + 1):
        t = i / rows
        y = y0 + (y1 - y0) * t
        half = w0 + (w1 - w0) * t
        if round_end:
            half *= math.sqrt(max(0.02, 1 - max(0.0, (t - 0.45) / 0.55) ** 2))
        high = h0 + (h1 - h0) * t
        for j in range(cols + 1):
            v = -1 + 2 * j / cols
            zz = z0 + high * (1 - abs(v) ** 2.4) ** 0.6 + lip * max(0.0, 1 - t * 5) ** 2
            verts.append((half * v, y, zz))
            # Rubbed along its lower edge and down its middle.
            rubbed.append(min(1.0, max(max(0.0, 1 - (1 - t) * 9), 0.22 * max(0.0, 1 - abs(v) * 3))))
    for i in range(rows):
        for j in range(cols):
            a = i * (cols + 1) + j
            faces.append((a, a + 1, a + cols + 2, a + cols + 1))
    mesh = bpy.data.meshes.new("lame")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    if sum(p.normal.z for p in mesh.polygons) < 0:
        mesh.flip_normals()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    layer = mesh.attributes.new("worn", "FLOAT", "POINT")
    layer.data.foreach_set("value", rubbed)
    obj = bpy.data.objects.new("lame", mesh)
    scene.collection.objects.link(obj)
    solid = obj.modifiers.new("thick", "SOLIDIFY")
    solid.thickness, solid.offset = 0.035, -1.0
    obj.location = (at[0], at[1], 0)
    obj.rotation_euler = (0, 0, turn)
    obj.parent = parent
    mesh.materials.append(plate_steel)
    return obj

def gauntlet(where, turn, mirror, lift):
    hand = bpy.data.objects.new("gauntlet", None)
    scene.collection.objects.link(hand)
    # The cuff, flaring to its top; two wrist lames; the back of the hand; four lames over the fingers.
    lame(hand, 2.3, 1.0, 1.42, 0.98, 0.6, 0.5, 0.0, lip=0.1)
    lame(hand, 1.1, 0.72, 1.0, 0.98, 0.56, 0.56, 0.05)
    lame(hand, 0.82, 0.42, 1.0, 1.04, 0.6, 0.6, 0.09)
    lame(hand, 0.52, -1.0, 1.05, 1.18, 0.64, 0.6, 0.12)
    for k in range(4):
        last = k == 3
        lame(hand, -0.9 - 0.47 * k, -1.47 - 0.47 * k - (0.3 if last else 0.0), 1.18 - 0.07 * k, 1.1 - 0.07 * k, 0.56 - 0.05 * k, 0.5 - 0.05 * k, 0.1 - 0.025 * k, round_end=last)
    # The knuckles: a raised stud over each.
    for k in range(4):
        rivet("knuckle", (-0.78 + 0.52 * k, -0.86, 0.68), 0.15, head, squash=0.7).parent = hand
    # The thumb: three lames off the side of the hand, pointing down and a little out. The other hand's is
    # this one's in a mirror.
    for k in range(3):
        piece = lame(hand, 0.0, -0.6 - (0.16 if k == 2 else 0.0), 0.4 - 0.05 * k, 0.36 - 0.05 * k, 0.36, 0.32, 0.03 - 0.01 * k, round_end=k == 2)
        piece.location = (1.3 + 0.5 * k * math.sin(0.42), 0.2 - 0.5 * k * math.cos(0.42), 0)
        piece.rotation_euler = (0, 0, 0.42)
    for side in (-1, 1):
        rivet("rivet", (side * 0.85, 0.6, 0.42), 0.07, head).parent = hand
    hand.location = (where[0], where[1], lift)
    hand.rotation_euler = (0, 0, turn)
    hand.scale = (mirror * 0.82, 0.82, 0.82)
    return hand

top = HALF_HIGH - 0.55
gauntlet((-1.02, top - 2.75), 0.1, -1, 0.12)
gauntlet((1.08, top - 2.95), -0.15, 1, 0.3)
hide = leather("thong")
iron = steel("hook", span=2.0, tone=0.12, rough=0.4, rust=0.25, relief=1.0)
for x, y, z in ((-0.8, top - 1.0, 0.55), (0.8, top - 1.2, 0.7)):
    cord("thong", [(x, y - 0.25, z), (x * 0.9, y + 0.1, z + 0.08), (x * 0.4, y + 0.55, 0.4), (0.0, top + 0.02, 0.42)], 0.045, hide, flat=0.6)
cord("hook", [(0.0, top + 0.42, 0.1), (0.0, top + 0.38, 0.32), (0.0, top + 0.05, 0.5), (0.0, top - 0.14, 0.42), (0.0, top - 0.08, 0.26)], 0.05, iron)
finish(scene, floor, "gauntlets", near=20)
