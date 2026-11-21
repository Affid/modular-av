"""The shapes the scenes are built from: the desk, cut stones, turned things, worn sheets."""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector


def ground(scene, mat=None, catcher=False, size=40):
    """The desk's top. As a shadow catcher it is not in the picture: only what falls on it is."""
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    plane = bpy.context.object
    if mat:
        plane.data.materials.append(mat)
    plane.is_shadow_catcher = catcher
    return plane


def _ring(radius, height, count, turn=0.0):
    return [(radius * math.cos(turn + math.tau * k / count), radius * math.sin(turn + math.tau * k / count), height) for k in range(count)]


def brilliant(name, radius=1.0):
    """A round stone in a single cut: a table, eight facets down to an eight-sided girdle, eight more to the point.
    Few facets, each large: at the size these are shown, a fuller cut is only noise."""
    points = _ring(0.6, 0.3, 8, math.pi / 8)  # the table
    points += _ring(1.0, 0.04, 8)  # the girdle's upper edge
    points += _ring(1.0, -0.04, 8)  # and its lower edge
    points += [(0, 0, -0.8)]  # the culet
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for point in points:
        bm.verts.new(point)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    stone = bpy.data.objects.new(name, mesh)
    stone.scale = (radius, radius, radius)
    bpy.context.scene.collection.objects.link(stone)
    return stone


def lay_down(stone, spin=0.0, facet=0):
    """Rest a cut stone as a loose one lies: tipped over on one of its lower facets, touching what it lies on."""
    mesh = stone.data
    below = sorted([p for p in mesh.polygons if p.normal.z < -0.3], key=lambda p: math.atan2(p.normal.y, p.normal.x))
    face = below[facet % len(below)]
    turn = face.normal.rotation_difference(Vector((0, 0, -1)))
    stone.rotation_mode = "QUATERNION"
    stone.rotation_quaternion = Matrix.Rotation(spin, 4, "Z").to_quaternion() @ turn
    bpy.context.view_layer.update()
    lowest = min((stone.matrix_world @ v.co).z for v in mesh.vertices)
    stone.location.z -= lowest
    stone.cycles.is_caustics_caster = True
    return stone


def lathe(name, profile, steps=64):
    """A shape turned about Z from a profile of (radius, height) points."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profile]
    edges = [bm.edges.new((a, b)) for a, b in zip(verts, verts[1:])]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for face in bm.faces:
        face.smooth = True
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def worn_outline(rng, x0, y0, x1, y1, step=0.34, wave=0.03, nick=0.1):
    """A sheet's edge, in scene units: small waves, and a nick here and there."""
    points = []

    def side(ax, ay, bx, by, nx, ny):
        # Four at least: a nick is never at a corner, and there must be a place for one.
        count = max(4, round(math.hypot(bx - ax, by - ay) / step))
        nicks = {rng.randrange(2, count - 1), rng.randrange(2, count - 1)}
        for i in range(count):
            t = i / count
            off = (0 if i == 0 else math.sin(t * 9 + ax) * wave + rng.uniform(-wave, wave) * 0.6) - (rng.uniform(0.6, 1.0) * nick if i in nicks else 0)
            points.append((ax + (bx - ax) * t + nx * off, ay + (by - ay) * t + ny * off))

    side(x0, y1, x1, y1, 0, 1)
    side(x1, y1, x1, y0, 1, 0)
    side(x1, y0, x0, y0, 0, -1)
    side(x0, y0, x0, y1, -1, 0)
    return points


def sheet(name, outline, thick=0.012, z=0.0):
    """A sheet lying flat, cut to an outline, with the thickness of vellum."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, z)) for x, y in outline]
    bm.faces.new(verts)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    solid = obj.modifiers.new("thick", "SOLIDIFY")
    solid.thickness, solid.offset = thick, 1.0
    return obj
