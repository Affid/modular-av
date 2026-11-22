"""The player's gem: a rose-cut stone seen front on, in a thin worn silver collet, set into the glass before the name.

At 9 px only three or four tones survive, so the cut is a few large facets: six star facets round a point and six
below them to the girdle. The room's light from up to the left, and the glass's own light coming up behind the stone
and glowing through its edge: one or two facets bright, the far ones dark, the point darkest. Rendered without
colour (the stylesheet lays the player's under the stone): three pictures of one box.

  gem-stone   the stone (its tones carry the colour by hard-light in the stylesheet)
  gem-spark   its one hard flash, laid over the colour so it stays white
  gem-collet  the collet alone
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from common import GLOW, _world, agx, emitter, front_camera, render, reset, sun  # noqa: E402
from measures import out, picture  # noqa: E402
from metal import old_silver  # noqa: E402
from pixels import load_rgba, save_rgba  # noqa: E402
from shapes import lathe  # noqa: E402

PX, _ = picture("gem-stone")
SPAN = 0.6
scene = reset()
scene.cycles.samples = 256
scene.render.film_transparent = True
agx(scene)
front_camera(scene, PX, PX, SPAN)

R = 0.24  # the girdle's radius
TURN = math.radians(45)


def ring(r, z, n, turn):
    return [(r * math.cos(turn + math.tau * k / n), r * math.sin(turn + math.tau * k / n), z) for k in range(n)]


# A rose cut: a point, six star facets to a ring of six, six kite facets to a girdle of twelve, a flat back.
apex = [(0.0, 0.0, 0.21)]
mid = ring(R * 0.55, 0.125, 6, TURN)
girdle = ring(R, 0.02, 12, TURN - math.pi / 12)
back = ring(R, 0.0, 12, TURN - math.pi / 12)
verts = apex + mid + girdle + back
faces = []
for k in range(6):
    faces.append((0, 1 + k, 1 + (k + 1) % 6))  # star facets
for k in range(6):
    a, b = 1 + k, 1 + (k + 1) % 6
    g0, g1, g2 = 7 + (2 * k) % 12, 7 + (2 * k + 1) % 12, 7 + (2 * k + 2) % 12
    faces.append((a, g0, g1))
    faces.append((a, g1, b))
    faces.append((b, g1, g2))
for k in range(12):
    faces.append((7 + k, 19 + k, 19 + (k + 1) % 12, 7 + (k + 1) % 12))
faces.append(tuple(19 + k for k in reversed(range(12))))
mesh = bpy.data.meshes.new("stone")
mesh.from_pydata(verts, [], faces)
mesh.update()
for p in mesh.polygons:
    p.use_smooth = False
stone = bpy.data.objects.new("stone", mesh)
scene.collection.objects.link(stone)
stone.location = (0, 0, 0.02)

m = bpy.data.materials.new("stone")
m.use_nodes = True
b = m.node_tree.nodes["Principled BSDF"]
b.inputs["Base Color"].default_value = (0.3, 0.3, 0.3, 1)
b.inputs["Roughness"].default_value = 0.03
b.inputs["Specular IOR Level"].default_value = 1.0
b.inputs["IOR"].default_value = 1.77
b.inputs["Subsurface Weight"].default_value = 0.0
b.inputs["Subsurface Radius"].default_value = (0.05, 0.05, 0.05)
# Its polish is old: each facet a little wavy, so the flash takes part of a facet, not all of it.
nt = m.node_tree
wave = nt.nodes.new("ShaderNodeTexNoise")
wave.inputs["Scale"].default_value = 14
wave.inputs["Detail"].default_value = 1.0
bump = nt.nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.12
bump.inputs["Distance"].default_value = 0.02
nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
stone.data.materials.append(m)

# The collet: a thin turned ring, its lip just over the girdle.
profile = [(0.232, 0.05), (0.238, 0.062), (0.248, 0.064), (0.257, 0.05), (0.262, 0.02), (0.262, 0.0)]
collet = lathe("collet", profile, steps=72)
collet.data.materials.append(old_silver(scale=5.0, base=0.3))

_world(scene, "studio.exr", 0.4)
sun(scene, "room", (-1.0, 1.0, 0.63), (0.85, 0.82, 1.0), 4.0, angle=18)
# The glass's light comes up round and behind the stone.
emitter("deep", (0.9, 0.9), (0, 0, -0.03), GLOW, 2.0)
collet.is_holdout = True
render(scene, out("gem-stone"))
collet.is_holdout = False
stone.is_holdout = True
render(scene, out("gem-collet"))

px = load_rgba(out("gem-stone"))
lum = px[..., :3].max(axis=2)
spark = np.zeros_like(px)
spark[..., :3] = 1.0
spark[..., 3] = np.clip((lum - 0.86) / 0.12, 0, 1) * px[..., 3]
save_rgba(spark, out("gem-spark"))
