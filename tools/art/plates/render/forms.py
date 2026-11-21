"""The shapes of the plates theme: a plate as a band of steel round a picture, rivets, cords, and a hammer's dents."""
import math

import bpy


def rounded(x0, y0, x1, y1, radius, step=3.0):
    """A rounded rectangle in tile units (y down), as points going round: top left, along the top, and on."""
    points = []

    def line(ax, ay, bx, by):
        count = max(1, round(math.hypot(bx - ax, by - ay) / step))
        for k in range(count):
            points.append((ax + (bx - ax) * k / count, ay + (by - ay) * k / count))

    def arc(cx, cy, a0):
        count = max(3, round(radius * math.pi / 2 / step))
        for k in range(count):
            a = a0 + math.pi / 2 * k / count
            points.append((cx + radius * math.cos(a), cy + radius * math.sin(a)))

    line(x0 + radius, y0, x1 - radius, y0)
    arc(x1 - radius, y0 + radius, -math.pi / 2)
    line(x1, y0 + radius, x1, y1 - radius)
    arc(x1 - radius, y1 - radius, 0)
    line(x1 - radius, y1, x0 + radius, y1)
    arc(x0 + radius, y1 - radius, math.pi / 2)
    line(x0, y1 - radius, x0, y0 + radius)
    arc(x0 + radius, y0 + radius, math.pi)
    return points


def uneven(points, rng, amount, waves=(5, 9, 17)):
    """An edge cut by hand: pushed in and out a little along its way round, smoothly."""
    count = len(points)
    cx = sum(p[0] for p in points) / count
    cy = sum(p[1] for p in points) / count
    phases = [(w, rng.uniform(0, math.tau), rng.uniform(0.5, 1.0)) for w in waves]
    result = []
    for k, (x, y) in enumerate(points):
        t = k / count
        off = sum(a * math.sin(w * math.tau * t + p) for w, p, a in phases) * amount / len(waves)
        d = math.hypot(x - cx, y - cy)
        result.append((x + (x - cx) / d * off, y + (y - cy) / d * off))
    return result


def band(name, outer, inner_box, place, height, wall=-0.05, rings=56, worn=None, dark=None):
    """A plate round the picture: from its outer edge (points in tile units) inward to `inner_box` (x0, y0, x1, y1
    in tile units). `height(d_out, x, y)` gives the surface's height in scene units, `d_out` being how far in from
    the edge a point is, in tile units. A wall goes down from the edge."""
    x0, y0, x1, y1 = inner_box
    verts, faces, rubbed, black = [], [], [], []
    count = len(outer)
    for (ox, oy) in outer:
        qx, qy = min(max(ox, x0), x1), min(max(oy, y0), y1)
        length = math.hypot(qx - ox, qy - oy)
        px, py = place(ox, oy)
        verts.append((px, py, wall))
        rubbed.append(0.0)
        black.append(0.0)
        for v in range(rings + 1):
            # Closer rings near the edge, where the shape turns.
            t = (v / rings) ** 1.35
            x, y = ox + (qx - ox) * t, oy + (qy - oy) * t
            px, py = place(x, y)
            verts.append((px, py, height(length * t, x, y)))
            rubbed.append(worn(length * t, x, y) if worn else 0.0)
            black.append(dark(length * t, x, y) if dark else 0.0)
    per = rings + 2
    for k in range(count):
        n = (k + 1) % count
        for v in range(per - 1):
            faces.append((k * per + v, n * per + v, n * per + v + 1, k * per + v + 1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    # Where hands, straps and other plates rub: the tops of the rolled edge and of the rib. 0 to 1 at each corner.
    layer = mesh.attributes.new("worn", "FLOAT", "POINT")
    layer.data.foreach_set("value", rubbed)
    # Where the steel is left black from the forge: a band that is never polished, for what is cut into it.
    layer = mesh.attributes.new("black", "FLOAT", "POINT")
    layer.data.foreach_set("value", black)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def facing_up(obj):
    """Turn a mesh's faces to look up, whichever way it was wound."""
    mesh = obj.data
    up = sum(p.normal.z for p in mesh.polygons)
    if up < 0:
        mesh.flip_normals()
    return obj


def rivet(name, at, radius, mat, squash=0.55):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=radius, location=at)
    head = bpy.context.object
    head.name = name
    head.scale = (1.0, 1.0, squash)
    bpy.ops.object.shade_smooth()
    head.data.materials.append(mat)
    return head


def cord(name, points, radius, mat, flat=1.0):
    """A cord along points (scene units), smoothed."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth, curve.bevel_resolution = radius, 4
    curve.resolution_u = 10
    spline = curve.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for point, (x, y, z) in zip(spline.points, points):
        point.co = (x, y, z, 1)
    spline.use_endpoint_u = True
    spline.order_u = 3
    curve.materials.append(mat)
    obj = bpy.data.objects.new(name, curve)
    obj.scale = (1, 1, flat)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def dents(rng, x0, y0, x1, y1, count, depth=(0.006, 0.02), size=(18.0, 55.0)):
    """Where the plate has been struck and hammered back: shallow hollows, in tile units and scene heights."""
    spots = [(rng.uniform(x0, x1), rng.uniform(y0, y1), rng.uniform(*depth), rng.uniform(*size)) for _ in range(count)]

    def at(x, y):
        return -sum(d * math.exp(-((x - sx) ** 2 + (y - sy) ** 2) / (r * r)) for sx, sy, d, r in spots)

    return at
