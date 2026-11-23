"""The bulkhead behind the cameras: grey-green painted steel sheets riveted to a frame, one repeat of the dock's
ground (600 by 600 CSS px, 6 by 6 scene units: two sheets each way) seen straight on.

Lit by the sun and the studio's surroundings only: a ground that repeats takes no lamp, which would light one
place of it and show the repeat. Sheets are laid well past the repeat so its edges see neighbours (their bevels,
their shadows); the seams fall inside it, never on its edges, so the picture meets itself.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402  (first: the paths)

import bpy  # noqa: E402

from measures import SCALE, out, picture, spec  # noqa: E402
from paint import painted  # noqa: E402

# The paint: a faded grey-green (linear RGB, before the photograph's light; dark, as a hold's bulkhead is beside
# the lit monitors). Yellow went to the cases: a yellow wall rendered mustard when dark and too light behind the
# names when bright.
COLOUR = (0.045, 0.058, 0.042)
REPEAT = spec("bulkhead")["width"] / SCALE  # scene units to one repeat
PANEL = REPEAT / 2  # two sheets to a repeat each way (300 CSS px)
BOW = 0.03  # how far a sheet bows out in its middle: rolled steel lies so; a flat face seen straight on reads drawn
SEAM = 0.02  # the gap between two sheets
THICK = 0.035
RIVET_R = 0.032
RIVET_STEP = 0.5  # one rivet to half a scene unit along each edge
RIVET_IN = 0.09  # how far in from a sheet's edge its rivets go
REACH = 3  # sheets laid this many each way round the middle: every edge of the repeat sees neighbours


def _taken(add, **kw):
    """The mesh a primitive operator makes, without the object it made: copies share one mesh."""
    add(**kw)
    obj = bpy.context.active_object
    data = obj.data
    bpy.data.objects.remove(obj)
    return data


def sheet_mesh():
    """One sheet, bowed in the middle between its edges, given its thickness and rounded edges here."""
    size = PANEL - SEAM
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=60, y_subdivisions=60, size=size)
    obj = bpy.context.active_object
    h = size / 2
    for v in obj.data.vertices:
        u, w = v.co.x / h, v.co.y / h
        v.co.z = BOW * (1 - u * u) * (1 - w * w)
    sol = obj.modifiers.new("thick", "SOLIDIFY")
    sol.thickness, sol.offset = THICK, -1
    bev = obj.modifiers.new("bevel", "BEVEL")
    bev.width, bev.segments, bev.limit_method = 0.012, 3, "ANGLE"
    bpy.ops.object.convert(target="MESH")
    for p in obj.data.polygons:
        p.use_smooth = True
    data = obj.data
    bpy.data.objects.remove(obj)
    return data


def rivet_mesh():
    """A round rivet head, half as high as it is wide."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=RIVET_R, segments=24, ring_count=12)
    obj = bpy.context.active_object
    obj.scale = (1, 1, 0.5)
    bpy.ops.object.transform_apply(scale=True)
    for p in obj.data.polygons:
        p.use_smooth = True
    data = obj.data
    bpy.data.objects.remove(obj)
    return data


def placed(name, data, at, mat):
    """A copy of a shared mesh at `at`, with its own material (on the object, so copies can differ)."""
    obj = stage.link(bpy.data.objects.new(name, data))
    obj.location = at
    if not data.materials:
        data.materials.append(None)
    obj.material_slots[0].link = "OBJECT"
    obj.material_slots[0].material = mat
    return obj


def sheet_materials():
    """Four sheets to a repeat, each painted a little apart (one replaced and painted later, one sun-faded), each
    taking the photograph from another place, so the repeat is not four copies of one sheet."""
    shades = [(1.0, 1.0, 1.0), (0.9, 0.93, 0.95), (1.07, 1.05, 0.98), (0.96, 0.96, 1.0)]
    offsets = [(0.0, 0.0), (0.37, 0.11), (0.61, 0.53), (0.18, 0.77)]
    return [painted(f"sheet{i}", (COLOUR[0] * a, COLOUR[1] * b, COLOUR[2] * c), span=PANEL, offset=off, chip=0.9,
                    edge=0.02, gloss=0.45) for i, ((a, b, c), off) in enumerate(zip(shades, offsets))]


def backing():
    """Black behind the seams: the frame the sheets are riveted to, in shadow."""
    mat = bpy.data.materials.new("backing")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.015, 0.015, 0.015, 1)
    placed("backing", _taken(bpy.ops.mesh.primitive_plane_add, size=REPEAT * 5), (0, 0, -THICK - 0.01), mat)


def build():
    mats = sheet_materials()
    # the rivets chip more than the sheets: their heads stand proud and take every knock
    rivet_mat = painted("rivets", COLOUR, span=PANEL, chip=1.5, edge=0.02, gloss=0.5)
    backing()
    sheet, rivet = sheet_mesh(), rivet_mesh()
    n = int(round(PANEL / RIVET_STEP))
    h = PANEL / 2
    for i in range(-REACH, REACH + 1):
        for j in range(-REACH, REACH + 1):
            cx, cy = i * PANEL, j * PANEL
            placed(f"sheet{i}{j}", sheet, (cx, cy, 0), mats[(i % 2) + 2 * (j % 2)])
            for k in range(n):
                t = -h + (k + 0.5) * PANEL / n
                for e in (-1, 1):
                    placed("rivet", rivet, (cx + e * (h - RIVET_IN), cy + t, 0), rivet_mat)
                    placed("rivet", rivet, (cx + t, cy + e * (h - RIVET_IN), 0), rivet_mat)


def main():
    scene = stage.stage(samples=160, exposure=0.9)
    scene.render.film_transparent = False  # the ground is opaque: nothing of the page shows through it
    build()
    width, height = picture("bulkhead")
    stage.front_camera(scene, width, height, REPEAT)
    stage.render(scene, out("bulkhead"))


main()
