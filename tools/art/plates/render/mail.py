"""The ground: mail, four rings through each, over cloth dyed a deep blue. One whole repeat, so it runs on under a
dock of any size: every ring's chance comes from its place within the repeat, and the only lights are those that
are the same everywhere."""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bpy

from measures import out, picture, span, spec
from studio import camera, render, reset, room
from steel import steel
from stuff import cloth

SPAN = span("mail")
ACROSS = spec("mail")["across"]  # rings across one repeat
PITCH = SPAN / ACROSS  # between ring centres in a row
R = PITCH / 2.4  # to the wire's middle
WIRE = R * 0.2
TILT = math.radians(28)
# Rows: two to a repeat down, as near the natural spacing as gives a whole number.
ROWS = 2 * round(SPAN / (2 * R * 0.9))
ROW = SPAN / ROWS
AROUND = 0.35  # how much of a repeat is built round the one in the picture
# Woad blue, as the light finds it between the rings.
DYE = (0.02, 0.05, 0.24, 1)


def slow(u, v, seed):
    """A slow unevenness that repeats with the picture: a few whole waves each way. About -1 to 1."""
    rng = random.Random(seed)
    total = 0.0
    for _ in range(5):
        a, b = rng.randint(1, 3), rng.randint(1, 3)
        total += math.sin(math.tau * (a * u + rng.random())) * math.sin(math.tau * (b * v + rng.random()))
    return total / 2.2


def hang(scene, mesh, i, j):
    """One ring in its place. The same ring in every repeat: its chance comes from where it is within one."""
    rng = random.Random((i % ACROSS) * 7919 + (j % ROWS) * 104729 + 17)
    obj = bpy.data.objects.new("ring", mesh)
    x = (i + (0.5 if j % 2 else 0.0)) * PITCH - SPAN / 2 + PITCH / 4
    y = SPAN / 2 - (j + 0.5) * ROW
    u, v = (i % ACROSS) / ACROSS, (j % ROWS) / ROWS
    # Mail never hangs flat: slow waves in how the rows lie, and patches that are dirtier or rustier.
    tilt = (TILT if j % 2 else -TILT) + rng.uniform(-0.07, 0.07) + 0.16 * slow(u, v, 3)
    obj.location = (x + rng.uniform(-0.04, 0.04) * R, y + rng.uniform(-0.04, 0.04) * R, rng.uniform(-0.03, 0.03) * R + 0.25 * R * slow(u, v, 5))
    obj.rotation_euler = (tilt, rng.uniform(-0.06, 0.06), rng.uniform(0, math.tau))
    patch = max(0.0, slow(u, v, 9) - 0.45)
    rust = 0.3 * patch + (0.3 if rng.random() < 0.015 else 0.0)
    # Red and green shift the photograph, blue is the ring's own rust, alpha its own tone (stuff.steel).
    obj.color = (rng.random(), rng.random(), rust, min(1.0, max(0.0, 0.5 + 0.3 * slow(u, v, 11) + rng.uniform(-0.3, 0.3))))
    scene.collection.objects.link(obj)


scene = reset()
# Only lights that are everywhere the same: the sun and the sky. A lamp near the mail would light the middle of
# the picture more than its edges, and the repeat would show.
room(scene, exposure=0.5, ceiling=0, lamps=0)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.45
scene.cycles.samples = 200
camera(scene, *picture("mail"), SPAN)

bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=WIRE, major_segments=40, minor_segments=10)
ring = bpy.context.object
bpy.ops.object.shade_smooth()
mesh = ring.data
bpy.data.objects.remove(ring)
mesh.materials.append(steel("ring", span=1.7, tone=0.095, rough=0.32, per_object=True, relief=0.6))
extra_x, extra_y = math.ceil(ACROSS * AROUND), math.ceil(ROWS * AROUND)
for j in range(-extra_y, ROWS + extra_y):
    for i in range(-extra_x, ACROSS + extra_x):
        hang(scene, mesh, i, j)

bpy.ops.mesh.primitive_plane_add(size=SPAN * 3, location=(0, 0, -R * 0.75))
bpy.context.object.data.materials.append(cloth("under", span=SPAN / 4, colour=DYE))
scene.render.film_transparent = False
render(scene, out("mail"))
