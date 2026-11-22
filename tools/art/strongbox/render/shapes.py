"""Solid shapes the scenes are built of: flat outlines given thickness, forged plates, domes, rods and tubes, a
section swept round a rounded rectangle (a strap), and seeded unevenness."""
import math

import bmesh
import bpy
from mathutils import Vector, noise

from measures import place
from stage import link


def outline_solid(name, points, z0, z1, mat, bevel=0.03, segments=3):
    """A flat shape (scene points, y up) given thickness between z0 and z1, its edges rounded."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, z0)) for x, y in points]
    face = bm.faces.new(verts)
    if face.normal.z < 0:
        face.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in ext["geom"]:
        if isinstance(v, bmesh.types.BMVert):
            v.co.z = z1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh))
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.harden_normals = False
    obj.data.materials.append(mat)
    smooth_by_angle(obj)
    return obj


def smooth_by_angle(obj, degrees=40):
    """Smooth where the surface curves, sharp where it turns a corner: a big flat face with a hole in it shaded
    smooth all over showed creases."""
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(degrees))


def cut(target, cutter):
    mod = target.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    cutter.hide_render = True
    cutter.hide_viewport = True
    # The boolean before the bevel, so the cut's edge is rounded too.
    target.modifiers.move(len(target.modifiers) - 1, 0)
    return target


def dome(name, at, radius, height, mat, z=0.0, squash=1.0):
    """A domed rivet head or a ball cut low: a sphere flattened to `height`, its foot at `z`."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=1.0, location=(at[0], at[1], z))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (radius, radius * squash, height)
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def ball(name, at, radius, mat, z):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=radius, location=(at[0], at[1], z))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def rod(name, a, b, radius, mat):
    """A cylinder from point a to point b (3D)."""
    va, vb = Vector(a), Vector(b)
    mid = (va + vb) / 2
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=(vb - va).length, location=mid)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (vb - va).to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = radius * 0.4
    mod.segments = 3
    return obj


def plate(name, outline, section, mat, z0=0.0, wobble=None):
    """A plate cut to a convex outline (scene points, y up, anticlockwise or not): `section` (distance in, height)
    swept inward from the edge, each loop the outline drawn in toward its middle by that distance, the middle
    closed by a fan. A forged plate's face is never flat: the section swells a little toward the middle."""
    cx = sum(p[0] for p in outline) / len(outline)
    cy = sum(p[1] for p in outline) / len(outline)
    verts, faces, loops = [], [], []
    n = len(outline)
    for d, h in section:
        start = len(verts)
        for x, y in outline:
            r = math.hypot(x - cx, y - cy)
            k = max(0.0, 1.0 - d / max(r, 1e-6))
            px, py = cx + (x - cx) * k, cy + (y - cy) * k
            verts.append((px, py, z0 + h + (wobble(px, py) if wobble else 0.0)))
        loops.append(start)
    for a, b in zip(loops, loops[1:]):
        for k in range(n):
            faces.append((a + k, a + (k + 1) % n, b + (k + 1) % n, b + k))
    centre = len(verts)
    verts.append((cx, cy, z0 + section[-1][1] + (wobble(cx, cy) if wobble else 0.0)))
    last = loops[-1]
    for k in range(n):
        faces.append((last + k, last + (k + 1) % n, centre))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    if sum(p.normal.z for p in mesh.polygons) < 0:
        mesh.flip_normals()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = link(bpy.data.objects.new(name, mesh))
    obj.data.materials.append(mat)
    return obj


def loft(name, front, back, z_front, z_back):
    """A solid between two outlines of the same number of points (a cutter that narrows and leans as it goes
    in: a keyhole whose inner wall shows from in front)."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y, z_front)) for x, y in front]
    b = [bm.verts.new((x, y, z_back)) for x, y in back]
    n = len(front)
    for k in range(n):
        bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return link(bpy.data.objects.new(name, mesh))


def tube_along(name, points, radius, mat, resolution=24):
    """A round bar along a polyline of 3D points (a bent rod, a wire)."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 6
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, (x, y, z) in zip(spline.points, points):
        p.co = (x, y, z, 1)
    obj = link(bpy.data.objects.new(name, curve))
    obj.data.materials.append(mat)
    return obj


def hull(points):
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def circle_points(cx, cy, r, n=48, a0=0.0, a1=2 * math.pi):
    return [(cx + r * math.cos(a0 + (a1 - a0) * k / n), cy + r * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]


def keyhole_points(cx, cy, r, slot_top, slot_bottom, length):
    """A keyhole (scene units): a round hole of radius r at (cx, cy) and a slot widening below it."""
    half = math.asin(min(0.99, slot_top / r))
    a0 = -math.pi / 2 + half
    a1 = 3 * math.pi / 2 - half
    pts = circle_points(cx, cy, r, 40, a0, a1)
    sy = cy - r * math.cos(half)
    pts += [(cx - slot_top, sy), (cx - slot_bottom, cy - length), (cx + slot_bottom, cy - length), (cx + slot_top, sy)]
    return pts


def wobble_fn(seed, amount, freq):
    """A smooth seeded unevenness (scene units)."""
    off = Vector((seed * 13.37, seed * 7.11, seed * 3.3))

    def f(x, y):
        return amount * noise.noise(Vector((x * freq, y * freq, 0.0)) + off)

    return f


def _rounded_loop(cx, cy, hw, hh, r, per_side, per_corner):
    """Points round a rounded rectangle (scene units, y up), the same count whatever the size."""
    pts = []
    r = max(r, 1e-4)
    corners = ((cx + hw - r, cy + hh - r, 0.0), (cx - hw + r, cy + hh - r, math.pi / 2),
               (cx - hw + r, cy - hh + r, math.pi), (cx + hw - r, cy - hh + r, 1.5 * math.pi))
    for k, (ox, oy, a0) in enumerate(corners):
        for j in range(per_corner):
            a = a0 + (math.pi / 2) * j / per_corner
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
        nx, ny, _ = corners[(k + 1) % 4]
        ex, ey = ox + r * math.cos(a0 + math.pi / 2), oy + r * math.sin(a0 + math.pi / 2)
        sx, sy = nx + r * math.cos(a0 + math.pi / 2), ny + r * math.sin(a0 + math.pi / 2)
        for j in range(per_side):
            t = j / per_side
            pts.append((ex + (sx - ex) * t, ey + (sy - ey) * t))
    return pts


def ring(name, cx, cy, hw, hh, radius, section, per_side=24, per_corner=10, wobble=None):
    """The molding: `hw`, `hh` the outer half sizes, `radius` the outer corner's; `section` from `profile`.
    `wobble(x, y)` adds to the height (dents, wear)."""
    verts, faces = [], []
    loops = []
    for d, h in section:
        loop = _rounded_loop(cx, cy, hw - d, hh - d, max(radius - d, 0.0), per_side, per_corner)
        start = len(verts)
        for x, y in loop:
            verts.append((x, y, h + (wobble(x, y) if wobble else 0.0)))
        loops.append((start, len(loop)))
    for (a, n), (b, _) in zip(loops, loops[1:]):
        for k in range(n):
            faces.append((a + k, a + (k + 1) % n, b + (k + 1) % n, b + k))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for p in mesh.polygons:
        p.use_smooth = True
    if sum(p.normal.z for p in mesh.polygons) < 0:
        mesh.flip_normals()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj
