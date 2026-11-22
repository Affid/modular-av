"""A silver molding run round a shape: a profile (how high at each distance in from the outer edge) swept round a
rectangle with rounded corners, as loops of the same number of points joined by quads (mitred for free)."""
import math

import bpy


def profile(width, height, steps=40):
    """A mirror frame's section, outer edge to inner (sight) edge: a wall, a round bead, a cove, a flat with a
    fine bead, and a bevel down to the glass. Returns (distance in, height) pairs in scene units."""
    pts = [(0.0, 0.0)]
    for k in range(steps + 1):
        t = k / steps
        d = t * width
        u = t
        if u < 0.24:  # the outer bead, a half round
            c, r = 0.12, 0.12
            h = 0.55 + math.sqrt(max(0.0, r * r - (u - c) ** 2)) / r * 0.3
        elif u < 0.42:  # the cove
            v = (u - 0.24) / 0.18
            h = 0.55 - 0.22 * math.sin(v * math.pi) + 0.05 * v
        elif u < 0.78:  # the flat, with a fine bead in it
            h = 0.6 + 0.08 * math.exp(-(((u - 0.6) / 0.025) ** 2))
        else:  # the bevel down to the glass
            v = (u - 0.78) / 0.22
            h = 0.6 * (1 - v) + 0.06 * v - 0.08 * math.sin(v * math.pi)
        pts.append((d, h * height))
    pts.append((width, 0.0))
    return pts


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
