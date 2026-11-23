"""A roll of grey cloth gaffer tape hung on a peg: the same tape that crosses a muted monitor's grille, kept to hand.

The roll is made here, not imported: a 76 mm kraft core, 50 mm wide, 115 mm across. It hangs by its core on a bare
steel peg welded to the rail and tilted up (so a roll pulled at can't slide off): the core's top lip rests on the
peg, the roll leans out at the top with its bottom against the sheet, so its wound top band and the inside of the
core show. Its free end lies on the outer face, the last few mm lifted, a tab to find it by.

What the core's hole looks onto is drawn in the picture (the rail's bar and, round it, the wall in the roll's
shadow): an opaque backing, so whatever seam lies behind the roll on the real wall never shows through the hole.
"""
import math

import bmesh
import bpy
from mathutils import Vector

from kit import RAIL_H, RAIL_T, bounds, box, move, revolve, rod, smooth
from paint import _mix, plain
from things_paint import gaffer_cloth, rail_paint, wall_paint

W, CORE_IN, CORE_OUT, R, EDGE = 0.050, 0.038, 0.0445, 0.0575, 0.0012  # width, core's radii, roll's radius, its edge
TAPE_BACK = 0.0008  # the roll leans out from its bottom, which rests on the sheet under the rail
PITCH, YAW = 13.0, 7.0  # degrees: the roll leans out at the top and turns, so its top band shows
TAB_AT = 128.0  # degrees round the roll where the free end stops (upper left)
PEG_R, PEG_TILT = 0.0034, 15.0  # the peg's radius, and how far it rises from the rail to its tip (degrees)
HOLE_SHADE = 0.75  # the wall seen through the core, against the bulkhead's paint
HOLE_SOFT, HOLE_SUN, HOLE_FILL = 16.0, 0.8, 0.45  # the light inside the hole: see hole_light


def tab(name, theta_end, span, lift_span, lift, mat):
    """The tape's free end lying on the roll's outer face: the last turn's end, flush with the roll from
    `theta_end - span` (degrees round the roll's axis, from +x) and lifted off it over its last `lift_span`
    degrees by up to `lift` metres (a tab to find it by)."""
    bm = bmesh.new()
    n_a, n_w = 24, 6
    rows = []
    for i in range(n_a + 1):
        t = i / n_a
        th = math.radians(theta_end - span * (1 - t))
        past = max(0.0, (span * t - (span - lift_span)) / lift_span)
        rad = R + 0.00025 + lift * past * past
        rows.append([bm.verts.new((rad * math.cos(th), rad * math.sin(th), 0.0006 + (W - 0.0012) * k / n_w))
                     for k in range(n_w + 1)])
    for i in range(n_a):
        for k in range(n_w):
            bm.faces.new((rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    # outward normals: the cloth side faces out
    if sum(p.normal.x * p.center.x + p.normal.y * p.center.y for p in mesh.polygons) < 0:
        mesh.flip_normals()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    sol = obj.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = 0.00035
    sol.offset = 1.0
    return obj


def sticky_under(mat):
    """The cloth's colour, darker and greyer where the tab's sticky side faces the viewer."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    base = bsdf.inputs["Base Color"].links[0].from_socket
    geo = nodes.new("ShaderNodeNewGeometry")
    links.new(_mix(nodes, links, geo.outputs["Backfacing"], base, (0.035, 0.034, 0.032, 1)),
              bsdf.inputs["Base Color"])
    return mat


def _roll():
    """The core, the wound roll and the tab, leaned and turned as objects (not applied: the shader's radius stays
    the roll's own), the roll's bottom resting on the sheet."""
    core = revolve("core", [(CORE_IN, 0.0), (CORE_OUT, 0.0), (CORE_OUT, W), (CORE_IN, W)])
    roll = revolve("roll", [(CORE_OUT, 0.0003), (R - EDGE, 0.0003), (R, EDGE), (R, W - EDGE),
                            (R - EDGE, W - 0.0003), (CORE_OUT, W - 0.0003)])
    mat = gaffer_cloth(core_r=CORE_OUT)
    for o in (core, roll):
        o.data.materials.append(mat)
    end = tab("tab", TAB_AT, 38.0, 9.0, 0.0028, sticky_under(gaffer_cloth(core_r=CORE_OUT)))
    parts = (core, roll, end)
    for o in parts:
        o.rotation_mode = "XYZ"
        o.rotation_euler = (math.radians(PITCH), math.radians(YAW), 0)
    bpy.context.view_layer.update()
    lo = min(bounds(o)[0][2] for o in (core, roll))
    for o in parts:
        move(o, (0, 0, TAPE_BACK - lo))
    return parts


def _core_lip(core):
    """The lowest point of the core's top lip over the line x = 0, found by rays up from the core's own axis:
    where the roll rests on the peg."""
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    m = core.matrix_world.copy()
    best = None
    for k in range(101):
        c = m @ Vector((0, 0, W * k / 100))
        hit, loc, *_ = bpy.context.scene.ray_cast(deps, Vector((0, c.y, c.z)), Vector((0, 1, 0)))
        if hit and (best is None or loc.y < best.y):
            best = loc.copy()
    if best is None:
        raise SystemExit("the peg finds no core")
    return best


def peg(lip_z, lift, core_front):
    """Bare steel worn bright by rolls going on and off: grey, satin, never a mirror. It rises straight from its
    root on the rail's middle (the picture's hanging point) to past the core's front lip, where its domed tip
    stands in front of the roll; the tip satin mid-grey (a glossy dome facing the lamp renders a white speck)."""
    tilt = math.radians(PEG_TILT)
    steel = plain("peg-steel", (0.55, 0.55, 0.53), rough=0.32, metallic=1.0)
    tip_z = core_front + 0.004
    pts = [(0, 0, RAIL_T - 0.001), (0, lift + (tip_z - lip_z) * math.tan(tilt), tip_z)]
    rod("peg", pts, PEG_R, steel, bevel_res=6)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=PEG_R * 1.25, segments=32, ring_count=16, location=pts[-1])
    dome = bpy.context.active_object
    dome.name = "peg-tip"
    dome.scale = (1, 1, 0.55)
    dome.rotation_euler = (-tilt, 0, 0)
    dome.data.materials.append(plain("peg-tip", (0.17, 0.17, 0.165), rough=0.62, metallic=1.0))
    bpy.ops.mesh.primitive_torus_add(major_radius=PEG_R + 0.0008, minor_radius=0.0014,
                                     location=(0, 0, RAIL_T + 0.0006))
    weld = bpy.context.active_object
    weld.data.materials.append(steel)
    smooth(dome)
    smooth(weld)


def hole_backing(roll):
    """What the core's hole looks onto: the rail's bar, and the wall in the roll's shadow round it."""
    rail = box("rail-in-hole", (0, 0, RAIL_T / 2), (0.088, RAIL_H, RAIL_T), rail_paint(), bevel=0.0016)
    back = roll.matrix_world @ Vector((0, 0, 0))  # the roll's back face's centre, against the sheet
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=R - 0.009, fill_type="NGON", location=(back.x, back.y, 0.0002))
    disc = bpy.context.active_object
    disc.name = "wall-behind"
    disc.data.materials.append(wall_paint("hole-wall", HOLE_SHADE))
    hole_light([disc, rail])


def hole_light(receivers):
    """What the core's hole looks onto lit as the open wall's shadow is, not near black with a hard-edged
    crescent: the work lamp (a 4 degree sun) leaves them out (light linking); a soft sun from the same direction
    gives the lit crescent a soft edge, and a broad fill from the front lifts the shadowed side to about the
    depth of the roll's cast shadow on the open wall."""
    sun = next(o for o in bpy.context.scene.objects if o.type == "LIGHT" and o.data.type == "SUN"
               and not o.hide_render)
    left_out = bpy.data.collections.new("hole-out")
    for o in receivers:
        left_out.objects.link(o)
    sun.light_linking.receiver_collection = left_out
    for item in left_out.collection_objects:
        item.light_linking.link_state = "EXCLUDE"
    inside = bpy.data.collections.new("hole-in")
    for o in receivers:
        inside.objects.link(o)
    for name, direction, angle, k in (("hole-soft", None, HOLE_SOFT, HOLE_SUN),
                                      ("hole-fill", (0.15, -0.1, 1.0), 70.0, HOLE_FILL)):
        data = bpy.data.lights.new(name, "SUN")
        data.energy, data.color, data.angle = sun.data.energy * k, sun.data.color, math.radians(angle)
        light = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(light)
        light.visible_camera = False
        if direction is None:
            light.rotation_euler = sun.rotation_euler.copy()
        else:
            light.rotation_euler = Vector(direction).to_track_quat("Z", "Y").to_euler()
        light.light_linking.receiver_collection = inside


def tape():
    """The roll on its peg, and what its hole looks onto. Returns the extent (x0, y0, x1, y1 metres) and the
    hanging point: the peg's root on the rail's middle."""
    parts = _roll()
    core, roll, _ = parts
    lip = _core_lip(core)
    # the peg rises from its root to the lip: the roll sits higher by that rise, so the peg's shaft shows in the
    # hole as a stub
    lift = (lip.z - RAIL_T) * math.tan(math.radians(PEG_TILT))
    for o in parts:
        move(o, (0, PEG_R - lip.y + lift, 0))
    print("TAPE CONTACT", round(lip.z, 4), "pitch", PITCH, "yaw", YAW)
    peg(lip.z, lift, bounds(core)[1][2])
    hole_backing(roll)
    lo3 = [min(bounds(o)[0][i] for o in parts) for i in range(3)]
    hi3 = [max(bounds(o)[1][i] for o in parts) for i in range(3)]
    return (lo3[0], lo3[1], hi3[0], max(hi3[1], 0.010)), (0.0, 0.0)
