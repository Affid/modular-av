"""A button: the head of a hand-forged iron nail, hammered into a few flat faces. Rendered grey, as light and
shade alone: the stylesheet lays it over the button's own colour. Whole, and as the two parts of a longer head
(a button and the arrow beside it)."""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bmesh
import bpy
import numpy as np

from materials import material
from measures import out, picture, span
from pixels import load_rgba, save_rgba
from studio import camera, render, reset, room


def hammered(name):
    """Grey iron as the hammer left it: dull, pitted, a little uneven."""
    mat, nodes, links = material(name)
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.5, 0.5, 0.5, 1)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.5
    coords = nodes.new("ShaderNodeTexCoord")
    pits = nodes.new("ShaderNodeTexNoise")
    pits.inputs["Scale"].default_value = 9.0
    pits.inputs["Detail"].default_value = 6.0
    pits.inputs["Roughness"].default_value = 0.7
    links.new(coords.outputs["Object"], pits.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.8
    bump.inputs["Distance"].default_value = 0.05
    links.new(pits.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def head(rng, half_width):
    """Faces struck from a low top down to an edge that lies outside the picture: no outline, only faces."""
    points = []
    count = 6 if half_width > 1.2 else 5
    turn = rng.uniform(0, math.tau)
    for k in range(count):
        angle = turn + math.tau * k / count + rng.uniform(-0.2, 0.2)
        points.append((math.cos(angle) * 1.9 * half_width, math.sin(angle) * 1.9, 0.0))
    for k in range(count):
        angle = turn + math.tau * (k + 0.5) / count + rng.uniform(-0.3, 0.3)
        points.append((math.cos(angle) * 0.34 * half_width + rng.uniform(-0.06, 0.06), math.sin(angle) * 0.3 + rng.uniform(-0.06, 0.06), 1.0 + rng.uniform(-0.12, 0.12)))
    mesh = bpy.data.meshes.new("head")
    bm = bmesh.new()
    for point in points:
        bm.verts.new(point)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("head", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bevel = obj.modifiers.new("soft", "BEVEL")
    bevel.width, bevel.segments = 0.05, 3
    obj.data.materials.append(hammered("iron"))
    return obj


def shoot(name, seed, wide):
    scene = reset()
    room(scene, exposure=-0.35, sun=3.2, ceiling=0, lamps=0)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    scene.view_settings.look = "AgX - High Contrast"
    left, right = picture("stud-left"), picture("stud-right")
    width, height = (left[0] + right[0], left[1]) if wide else picture("stud")
    camera(scene, width, height, span("stud-left") + span("stud-right") if wide else span("stud"))
    head(random.Random(seed), 1.5 if wide else 1.0)
    scene.render.film_transparent = False
    path = out(name)
    render(scene, path)
    return path


def shade(pixels):
    """Light and shade about a middle grey, stronger than the render left them: laid over a colour by hard light,
    middle grey changes nothing."""
    grey = pixels[..., 0] * 0.2126 + pixels[..., 1] * 0.7152 + pixels[..., 2] * 0.0722
    stretched = np.clip(0.47 + (grey - np.median(grey)) * 2.6, 0.08, 0.95)
    result = np.ones_like(pixels)
    for channel in range(3):
        result[..., channel] = stretched
    return result


path = shoot("stud", 3, False)
save_rgba(shade(load_rgba(path)), path)
# The longer head, cut where the arrow's part begins.
wide_path = shoot("stud-wide", 8, True)
whole = shade(load_rgba(wide_path))
os.remove(wide_path)
cut = picture("stud-left")[0]
save_rgba(whole[:, :cut].copy(), out("stud-left"))
save_rgba(whole[:, cut:].copy(), out("stud-right"))
