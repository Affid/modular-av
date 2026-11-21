"""The shapes of the hides theme: a hide's pulled outline, poles, cords, pegs, and the hair past a hide's edge."""
import math

import bmesh
import bpy
from mathutils import Vector


def pulled_outline(rng, x0, y0, x1, y1, across, down, sag=0.17, most=17.0, loose=()):
    """A hide pulled tight by its ties, in tile units, clockwise from the top left: a tip at each tie, and between
    two ties the edge drawn inward. Returns the outline and the ties (each: tip, the way out of the hide)."""
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    counts = [across, down, across, down]
    outward = [(0, -1), (1, 0), (0, 1), (-1, 0)]
    ties = []
    for side in range(4):
        (ax, ay), (bx, by) = corners[side], corners[(side + 1) % 4]
        nx, ny = outward[side]
        cx, cy = outward[side - 1]
        # The corner is pulled both ways, a little further than the rest.
        ties.append(((ax + (nx + cx) * 4 + rng.uniform(-2, 2), ay + (ny + cy) * 4 + rng.uniform(-2, 2)), ((nx + cx) / math.sqrt(2), (ny + cy) / math.sqrt(2))))
        for i in range(1, counts[side] + 1):
            t = (i + rng.uniform(-0.12, 0.12)) / (counts[side] + 1)
            off = rng.uniform(-4, 3)
            ties.append(((ax + (bx - ax) * t + nx * off, ay + (by - ay) * t + ny * off), (nx, ny)))
    # A tie that has been cut pulls no more: there the edge falls back, and hangs a little.
    middle = ((x0 + x1) / 2, (y0 + y1) / 2)
    for i in loose:
        (tx, ty), (nx, ny) = ties[i]
        back = most * rng.uniform(0.75, 1.1) + (9 if abs(nx) + abs(ny) > 1.2 else 0)
        ties[i] = ((tx - nx * back + rng.uniform(-2, 2), ty - ny * back + rng.uniform(1, 5)), (nx, ny))
    outline = []
    for i, ((ax, ay), _) in enumerate(ties):
        (bx, by), _ = ties[(i + 1) % len(ties)]
        length = math.hypot(bx - ax, by - ay)
        # Inward is to the right of the way round, clockwise with y down.
        ix, iy = -(by - ay) / length, (bx - ax) / length
        depth = min(most, length * sag) * rng.uniform(0.8, 1.15)
        if i in loose and (i + 1) % len(ties) in loose:
            depth = rng.uniform(-3.5, 2.5)
        elif i in loose or (i + 1) % len(ties) in loose:
            depth *= 0.5
        steps = max(6, round(length / 9))
        for k in range(steps):
            t = k / steps
            bow = depth * (4 * t * (1 - t)) ** 0.7 + (rng.uniform(-0.7, 0.7) if k else 0)
            outline.append((ax + (bx - ax) * t + ix * bow, ay + (by - ay) * t + iy * bow))
    return outline, ties


def pole(name, a, b, radius, rng, mat, rings=48, around=20):
    """A peeled pole from a to b: not quite straight, not quite round, a little thinner toward one end."""
    a, b = Vector(a), Vector(b)
    axis = b - a
    length = axis.length
    axis.normalize()
    side = axis.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(axis).normalized()
    phase = [rng.uniform(0, math.tau) for _ in range(5)]
    taper = rng.uniform(0.06, 0.14) * rng.choice((-1, 1))
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    loops = []
    for i in range(rings + 1):
        t = i / rings
        bend = radius * 0.5 * math.sin(t * math.pi * 1.3 + phase[0]) + radius * 0.2 * math.sin(t * 9 + phase[1])
        centre = a + axis * (length * t) + side * bend
        r = radius * (1 + taper * (t - 0.5)) * (1 + 0.07 * math.sin(t * 13 + phase[2]) + 0.05 * math.sin(t * 31 + phase[3]))
        ring = []
        for k in range(around):
            angle = math.tau * k / around
            lump = 1 + 0.05 * math.sin(3 * angle + phase[4] + t * 4)
            ring.append(bm.verts.new(centre + (side * math.cos(angle) + up * math.sin(angle)) * r * lump))
        loops.append(ring)
    for first, second in zip(loops, loops[1:]):
        for k in range(around):
            face = bm.faces.new((first[k], first[(k + 1) % around], second[(k + 1) % around], second[k]))
            face.smooth = True
    bm.faces.new(loops[0][::-1])
    bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def cord(name, points, radius, mat):
    """A thong along a line of points."""
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    spline = data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, (x, y, z) in zip(spline.points, points):
        point.co = (x, y, z, 1)
    data.bevel_depth = radius
    data.bevel_resolution = 3
    data.use_fill_caps = True
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def ring(name, at, major, minor, axis, mat, tilt=0.0):
    """A turn of thong round a pole (axis "x" or "y") or a peg ("z")."""
    rotation = {"x": (0, math.pi / 2, tilt), "y": (math.pi / 2, 0, tilt), "z": (tilt, 0, 0)}[axis]
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32, minor_segments=8, location=at, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def peg(name, x, y, radius, height, mat):
    """A wooden peg driven into the wall, seen end on."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=height, location=(x, y, height / 2))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("edge", "BEVEL")
    bevel.width, bevel.segments = radius * 0.3, 3
    bpy.ops.object.shade_smooth()
    return obj


def fur(name, outline, rng, mat, z, count=42000, long=(0.1, 0.3), inward=0.16):
    """The hair of a hide seen from its flesh side: all that shows is what stands out past its edge, lying the way
    the edge faces and falling down the wall. `outline` in scene units, counter-clockwise."""
    import numpy as np

    points = np.array(outline, dtype=np.float64)
    following = np.roll(points, -1, axis=0)
    edges = following - points
    lengths = np.hypot(edges[:, 0], edges[:, 1])
    chosen = np.searchsorted(np.cumsum(lengths) / lengths.sum(), [rng.random() for _ in range(count)])
    chosen = np.minimum(chosen, len(points) - 1)
    random = np.random.default_rng(rng.randrange(1 << 30))
    along = random.random(count)
    roots = points[chosen] + edges[chosen] * along[:, None]
    # Outward is to the right of the way round.
    out = np.stack([edges[chosen, 1], -edges[chosen, 0]], axis=1) / lengths[chosen, None]
    # Smoothed over the scallops, or the hair would bristle at every tip.
    centre = points.mean(axis=0)
    radial = roots - centre
    radial /= np.hypot(radial[:, 0], radial[:, 1])[:, None]
    out = out * 0.45 + radial * 0.55
    turn = random.normal(0.0, 0.35, count)
    cos, sin = np.cos(turn), np.sin(turn)
    way = np.stack([out[:, 0] * cos - out[:, 1] * sin, out[:, 0] * sin + out[:, 1] * cos], axis=1)
    way /= np.hypot(way[:, 0], way[:, 1])[:, None]
    roots = roots - out * random.uniform(0.0, inward, count)[:, None]
    reach = random.uniform(long[0], long[1], count) + inward * 0.6
    steps = 6
    data = bpy.data.hair_curves.new(name)
    data.add_curves([steps] * count)
    position = np.zeros((count, steps, 3), dtype=np.float32)
    radius = np.zeros((count, steps), dtype=np.float32)
    wave = random.normal(0.0, 0.02, (count, 2))
    for step in range(steps):
        t = step / (steps - 1)
        # Down the wall more and more toward the tip: hair hangs.
        position[:, step, 0] = roots[:, 0] + way[:, 0] * reach * t + wave[:, 0] * t * t
        position[:, step, 1] = roots[:, 1] + way[:, 1] * reach * t - 0.11 * t * t * (1.0 + 0.5 * way[:, 1]) + wave[:, 1] * t * t
        position[:, step, 2] = z - 0.035 * t
        radius[:, step] = 0.0045 * (1.0 - 0.8 * t)
    data.points.foreach_set("position", position.ravel())
    data.points.foreach_set("radius", radius.ravel())
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj
