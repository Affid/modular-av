"""Shapes the hung things on a monitor are made of (the headset, its bracket, its cord): round wires through
points, smooth paths, short cylinders and squashed balls, and the case's surface heights sampled once, so what
hangs can be laid against the case without its own rays getting in the way."""
import math

import bpy
from mathutils import Vector

import stage
from measures import place


def surface_z(x, y, miss=-0.3):
    """The height of whatever the scene has under a point of the tile (tile units), or `miss` past its edge."""
    deps = bpy.context.evaluated_depsgraph_get()
    px, py = place(x, y)
    hit, loc, *_ = bpy.context.scene.ray_cast(deps, Vector((px, py, 5.0)), Vector((0, 0, -1)))
    return loc.z if hit else miss


class Heights:
    """The case's surface heights (scene z) over a patch of the tile (tile units), sampled every `step` units."""

    def __init__(self, x0, y0, x1, y1, step=3.0):
        self.x0, self.y0, self.step = x0, y0, step
        self.nx, self.ny = int((x1 - x0) / step) + 2, int((y1 - y0) / step) + 2
        self.z = [[surface_z(x0 + i * step, y0 + j * step, miss=-1.0) for i in range(self.nx)]
                  for j in range(self.ny)]

    def at(self, x, y):
        """The height under a point, between the samples."""
        fi = min(max((x - self.x0) / self.step, 0.0), self.nx - 1.001)
        fj = min(max((y - self.y0) / self.step, 0.0), self.ny - 1.001)
        i, j = int(fi), int(fj)
        a, b = fi - i, fj - j
        z = self.z
        return ((z[j][i] * (1 - a) + z[j][i + 1] * a) * (1 - b) + (z[j + 1][i] * (1 - a) + z[j + 1][i + 1] * a) * b)


def poly_curve(name, pts, radius, mat):
    """A round wire or cord through 3D points (scene units), its ends capped."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(pts) - 1)
    for p, co in zip(spline.points, pts):
        p.co = (co[0], co[1], co[2], 1.0)
    obj = stage.link(bpy.data.objects.new(name, curve))
    obj.data.materials.append(mat)
    return obj


def smooth_path(ctrl, n=80):
    """A Catmull-Rom path through control points [(x, y, z)], `n` points per span."""
    pts = []
    c = [ctrl[0]] + list(ctrl) + [ctrl[-1]]
    for i in range(1, len(c) - 2):
        p0, p1, p2, p3 = (Vector(c[i - 1]), Vector(c[i]), Vector(c[i + 1]), Vector(c[i + 2]))
        for k in range(n):
            t = k / n
            pts.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    pts.append(Vector(ctrl[-1]))
    return pts


def cyl(name, at, radius, depth, mat, verts=32, bevel=0.3):
    """A short cylinder along z at `at` (scene units), its edges bevelled by `bevel` of its smaller measure."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=at)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    if bevel:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width, mod.segments = min(radius, depth) * bevel, 3
    return o


def ball(name, at, radius, scale, mat):
    """A sphere squashed by `scale` (x, y, z)."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=48, ring_count=24, location=at)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def local(x, y, z=0.0):
    """A point of a hung thing's own frame (tile units: x right, y down, z toward the viewer) in Blender's local
    axes (scene units)."""
    return Vector((x / 100.0, -y / 100.0, z / 100.0))


def child(obj, root, at, rot=(0.0, 0.0, 0.0)):
    obj.parent = root
    obj.location = at
    obj.rotation_euler = rot
    return obj


def coil(name, pts, radius, wire, pitch_top, pitch_bottom, mat):
    """A coiled cord round the centre line `pts` (scene Vectors), its pitch easing from `pitch_top` at the start
    to `pitch_bottom` at the end (a hanging coil is stretched by what hangs below it). Frames are carried along
    the line so the turns don't twist."""
    fine = [pts[0]]
    for a, b in zip(pts, pts[1:]):  # enough points along the centre line for every turn to be round
        steps = max(1, int((b - a).length / (pitch_bottom / 28)))
        fine += [a.lerp(b, k / steps) for k in range(1, steps + 1)]
    pts = fine
    total = sum((b - a).length for a, b in zip(pts, pts[1:]))
    out = []
    t0 = (pts[1] - pts[0]).normalized()
    n1 = t0.cross(Vector((0, 0, 1)))
    if n1.length < 1e-4:
        n1 = t0.cross(Vector((1, 0, 0)))
    n1.normalize()
    s, phase, prev = 0.0, 0.0, pts[0]
    for i, p in enumerate(pts):
        if i:
            ds = (p - prev).length
            s += ds
            t = (p - prev).normalized()
            n1 = (n1 - t * n1.dot(t)).normalized()
            f = s / total
            pitch = pitch_top + (pitch_bottom - pitch_top) * min(1.0, f * 1.25)
            phase += 2 * math.pi * ds / pitch
            prev = p
        else:
            t = t0
        n2 = t.cross(n1)
        out.append(p + n1 * (radius * math.cos(phase)) + n2 * (radius * math.sin(phase)))
    return poly_curve(name, out, wire, mat)
