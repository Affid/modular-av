"""The tube: its curved glass inside the bezel's lip, what the glass shows in a dim hold (the work lamp, a little
of the room, dust in its corners), and the tube's own border: unlit dark glass just inside the lip, and how far
in its scan lines show (the scan mask, for the stylesheet to fill with lines a fixed number of pixels apart).

The picture's middle is the camera's: the glass's reflections are faded toward it by the frame's finish, and the
scan lines never reach it.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

import stage
from case import LIP
from measures import TILE_H, TILE_W, place, units
from paint import _math, _range, material, plain

GLASS_R = 14.0  # the face's sphere radius, scene units: old tubes bulge
WORK_LAMP_AT = (215, 36)  # where the work lamp shows in the glass: high on the left, out of the middle
BORDER = 26.0  # how far in from the lip the tube's border is dark, tile units
SCAN_REACH = 120.0  # how far in from the lip the scan lines show


def glass_z(d2):
    """The tube face's depth at a squared distance d2 (scene units) from its middle: the sphere's top stands proud
    of the case, its edge meets the lip's top and bottom just behind the rubber seal (its sides and corners,
    further out, fall further behind)."""
    hh = units(TILE_H / 2 - LIP[1])
    return -0.345 + math.sqrt(GLASS_R ** 2 - d2) - math.sqrt(GLASS_R ** 2 - hh * hh)


def inside_lip(x, y, grow=4.0):
    x0, y0, x1, y1, r = LIP
    x0, y0, x1, y1, r = x0 - grow, y0 - grow, x1 + grow, y1 + grow, r + grow
    qx = max(x0 + r - x, x - (x1 - r), 0)
    qy = max(y0 + r - y, y - (y1 - r), 0)
    return math.hypot(qx, qy) <= r if (qx > 0 and qy > 0) else (x0 <= x <= x1 and y0 <= y <= y1)


def glass_mesh(mat):
    """The tube's face: a spherical cap cut to the bezel's lip, its edge behind the rubber seal."""
    bm = bmesh.new()
    nx, ny = 320, 184
    cx, cy = place(TILE_W / 2, TILE_H / 2)
    verts = {}
    for i in range(nx + 1):
        for j in range(ny + 1):
            tx, ty = -5 + i * (TILE_W + 10) / nx, -5 + j * (TILE_H + 10) / ny
            x, y = place(tx, ty)
            verts[i, j] = bm.verts.new((x, y, glass_z((x - cx) ** 2 + (y - cy) ** 2)))
            verts[i, j].tag = inside_lip(tx, ty, grow=-2.0)
    for i in range(nx):
        for j in range(ny):
            q = [verts[i, j], verts[i + 1, j], verts[i + 1, j + 1], verts[i, j + 1]]
            if any(v.tag for v in q):
                bm.faces.new(q)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("glass")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    if sum(p.normal.z for p in mesh.polygons) < 0:
        mesh.flip_normals()
    obj = stage.link(bpy.data.objects.new("glass", mesh))
    obj.data.materials.append(mat)
    return obj


def dusty_glass():
    """The glass as what it shows in a dim hold: mostly the dark room, the lamp bright in it. A plain glass shader
    reflected the studio's bright sky as a grey veil over the picture's edges; this reflects a third of it, by
    Fresnel, and lets the rest through. Dust settled in its corners, where two edges meet and a cloth never
    reached."""
    mat, nodes, links = material("tube")
    outn = nodes.new("ShaderNodeOutputMaterial")
    dust = nodes.new("ShaderNodeBsdfDiffuse")
    dust.inputs["Color"].default_value = (0.3, 0.29, 0.27, 1)
    mix = nodes.new("ShaderNodeMixShader")
    tc = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(tc.outputs["Generated"], sep.inputs[0])
    # how close to an edge: 1 at the glass's edge, 0 a sixth in
    ex, ey = (_range(nodes, links, _math(nodes, links, "PINGPONG", sep.outputs[axis], 0.5), 0.0, 0.16, 1.0, 0.0)
              for axis in (0, 1))
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9.0
    noise.inputs["Detail"].default_value = 10.0
    links.new(tc.outputs["Generated"], noise.inputs["Vector"])
    corners = _math(nodes, links, "MULTIPLY", ex, ey)
    amount = _math(nodes, links, "MULTIPLY", corners, _range(nodes, links, noise.outputs["Fac"], 0.3, 0.7))
    links.new(_math(nodes, links, "MULTIPLY", amount, 0.4), mix.inputs["Fac"])
    links.new(dust.outputs[0], mix.inputs[2])
    clear = nodes.new("ShaderNodeBsdfTransparent")
    gloss = nodes.new("ShaderNodeBsdfGlossy")
    gloss.inputs["Color"].default_value = (0.22, 0.23, 0.23, 1)
    gloss.inputs["Roughness"].default_value = 0.03
    fres = nodes.new("ShaderNodeFresnel")
    fres.inputs["IOR"].default_value = 1.52
    veil = nodes.new("ShaderNodeMixShader")
    links.new(fres.outputs[0], veil.inputs["Fac"])
    links.new(clear.outputs[0], veil.inputs[1])
    links.new(gloss.outputs[0], veil.inputs[2])
    links.new(veil.outputs[0], mix.inputs[1])
    links.new(mix.outputs[0], outn.inputs["Surface"])
    return mat


def tube_glass():
    return glass_mesh(dusty_glass())


def glass_point(x, y):
    """The tube's face at a point of the tile: where it is and which way it faces (scene units)."""
    cx, cy = place(TILE_W / 2, TILE_H / 2)
    px, py = place(x, y)
    dx, dy = px - cx, py - cy
    n = Vector((dx, dy, math.sqrt(GLASS_R ** 2 - dx * dx - dy * dy))).normalized()
    return Vector((px, py, glass_z(dx * dx + dy * dy))), n


def _unseen(obj):
    """Seen only in reflections: the sun does the lighting."""
    obj.visible_camera = obj.visible_diffuse = obj.visible_shadow = False
    obj.visible_transmission = False
    return obj


def work_lamp_reflection(distance=5.0):
    """The hold's one light, a caged bulb, seen in the glass at WORK_LAMP_AT: placed where the tube's face there
    reflects the viewer's line of sight."""
    p, n = glass_point(*WORK_LAMP_AT)
    view = Vector((0, 0, -1))
    r = view - 2 * view.dot(n) * n
    centre = p + r * distance
    face = (-r).to_track_quat("Z", "Y")
    bulb = plain("lamp-bulb", (1, 1, 1), emission=(1.0, 0.86, 0.66), strength=22.0)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=centre)
    b = _unseen(bpy.context.active_object)
    b.name = "work-bulb"
    b.scale = (1, 1.35, 1)
    b.data.materials.append(bulb)
    cage = plain("lamp-cage", (0.02, 0.02, 0.02), rough=0.5)
    for i in range(-2, 3):  # the cage's wires
        bpy.ops.mesh.primitive_cylinder_add(radius=0.018, depth=0.9, location=(0, 0, 0))
        w = _unseen(bpy.context.active_object)
        w.name = "work-cage"
        w.rotation_euler = face.to_euler()
        w.rotation_euler.rotate_axis("X", math.pi / 2)
        w.location = centre + face @ Vector((i * 0.11, 0, 0.3))
        w.data.materials.append(cage)
    for i in (-1, 1):  # and its two rings
        bpy.ops.mesh.primitive_torus_add(major_radius=0.32, minor_radius=0.016, location=(0, 0, 0))
        t = _unseen(bpy.context.active_object)
        t.name = "work-cage"
        t.rotation_euler = face.to_euler()
        t.rotation_euler.rotate_axis("X", math.pi / 2)
        t.location = centre + face @ Vector((0, i * 0.2, 0.3))
        t.data.materials.append(cage)


def tube_border(shape):
    """The distance inward from the lip's rounded outline (tile units) of every pixel of a frame picture: negative
    outside it."""
    xs, ys = stage.grid(shape)
    x0, y0, x1, y1, r = LIP
    X, Y = xs[None, :], ys[:, None]
    qx = np.maximum(np.maximum(x0 + r - X, X - (x1 - r)), 0)
    qy = np.maximum(np.maximum(y0 + r - Y, Y - (y1 - r)), 0)
    outside = np.hypot(qx, qy) - r  # signed: negative inside the rounded box near its corners
    inner = np.minimum(np.minimum(X - x0, x1 - X), np.minimum(Y - y0, y1 - Y))
    return np.where((qx > 0) & (qy > 0), -outside, inner)


def dark_border(whole, dist):
    """The unlit border of the tube: dark glass for a few units inside the lip, under the reflections."""
    border = np.clip(1 - dist / BORDER, 0, 1) ** 1.6 * 0.82 * (dist > -2)
    a = whole[..., 3:4]
    comp_a = a[..., 0] + border * (1 - a[..., 0])
    dark = np.float32(0.012) * border[..., None] * (1 - a)
    comp_rgb = (whole[..., :3] * a + dark) / np.maximum(comp_a[..., None], 1e-5)
    return np.dstack([comp_rgb, comp_a])


def scan_mask(shape):
    """Where the tube's scan lines show (alpha): from the lip inward, fading out, never in the middle box."""
    dist = tube_border(shape)
    lines = np.zeros(shape[:2] + (4,), dtype=np.float32)
    reach = np.clip(1 - dist / SCAN_REACH, 0, 1) ** 1.3 * (dist > 0)
    lines[..., 3] = reach * stage.away_from_middle(shape, 40.0)
    return lines
