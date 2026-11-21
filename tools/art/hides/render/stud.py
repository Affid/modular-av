"""A button: the head of a hand-forged iron nail, hammered into a few faces, pitted and scaled. Rendered grey, as
light and shade alone: the stylesheet lays it over the button's own colour. Three whole heads, and the two parts
of a longer one (a button and the arrow beside it)."""
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

from materials import _math, material
from measures import out, picture, span
from pixels import load_rgba, save_rgba
from studio import camera, render, reset, room
from stuff import _image

# The photographed metal, how many scene units one repeat of it covers, and a seed for each of the three heads.
SOURCE = "rusty_metal_04"
GRAIN = 5.5
HEADS = (3, 11, 29)


def forged(name, shift):
    """Iron as the smith left it and the years found it: photographed rusted metal (CC0, Poly Haven
    rusty_metal_04), without its colour, for the scale and the pitting. The hammer's dents are in the shape."""
    mat, nodes, links = material(name)
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Specular IOR Level"].default_value = 0.6
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / GRAIN, 1 / GRAIN, 1 / GRAIN)
    mapping.inputs["Location"].default_value = (shift[0], shift[1], 0)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    vector = mapping.outputs["Vector"]
    grey = nodes.new("ShaderNodeRGBToBW")
    links.new(_image(nodes, links, vector, SOURCE, "diff", True), grey.inputs["Color"])
    # About a middle grey: of the photograph's light and dark patches only a little is kept, or they read as
    # flaking paint. The pitting comes from its relief.
    tone = nodes.new("ShaderNodeMapRange")
    tone.inputs["From Min"].default_value, tone.inputs["From Max"].default_value = 0.0, 0.5
    tone.inputs["To Min"].default_value, tone.inputs["To Max"].default_value = 0.4, 0.58
    links.new(grey.outputs["Val"], tone.inputs["Value"])
    links.new(tone.outputs["Result"], bsdf.inputs["Base Color"])
    links.new(_math(nodes, links, "MULTIPLY", _image(nodes, links, vector, SOURCE, "rough", False), 0.8), bsdf.inputs["Roughness"])
    normal = nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = 2.2
    links.new(_image(nodes, links, vector, SOURCE, "nor", False), normal.inputs["Color"])
    links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def head(rng, half_width):
    """A rose head: faces struck from a low top down to an edge that lies outside the picture (no outline, only
    faces), each dented a little by the hammer."""
    points = []
    count = 6 if half_width > 1.2 else 5
    turn = rng.uniform(0, math.tau)
    for k in range(count):
        angle = turn + math.tau * k / count + rng.uniform(-0.2, 0.2)
        points.append((math.cos(angle) * 1.9 * half_width, math.sin(angle) * 1.9, 0.0))
    for k in range(count):
        angle = turn + math.tau * (k + 0.5) / count + rng.uniform(-0.3, 0.3)
        points.append((math.cos(angle) * 0.3 * half_width + rng.uniform(-0.08, 0.08), math.sin(angle) * 0.26 + rng.uniform(-0.08, 0.08), 0.8 + rng.uniform(-0.12, 0.12)))
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
    bevel.width, bevel.segments = 0.07, 4
    fine = obj.modifiers.new("fine", "SUBSURF")
    fine.subdivision_type, fine.levels, fine.render_levels = "SIMPLE", 5, 5
    dents = bpy.data.textures.new("dents", "CLOUDS")
    dents.noise_scale, dents.noise_depth = 0.55, 1
    dent = obj.modifiers.new("dents", "DISPLACE")
    dent.texture, dent.strength, dent.mid_level, dent.texture_coords = dents, 0.1, 0.5, "OBJECT"
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj.data.materials.append(forged("iron", (rng.uniform(0, 1), rng.uniform(0, 1))))
    return obj


def shoot(name, seed, wide):
    scene = reset()
    room(scene, exposure=-0.35, sun=3.2, ceiling=0, lamps=0)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    scene.view_settings.look = "AgX - High Contrast"
    left, right = picture("stud-left"), picture("stud-right")
    width, height = (left[0] + right[0], left[1]) if wide else picture("stud-1")
    camera(scene, width, height, span("stud-left") + span("stud-right") if wide else span("stud-1"))
    head(random.Random(seed), 1.5 if wide else 1.0)
    scene.render.film_transparent = False
    path = out(name)
    render(scene, path)
    return path


def shade(pixels):
    """Light and shade about a middle grey, stronger than the render left them: laid over a colour by hard light,
    middle grey changes nothing."""
    grey = pixels[..., 0] * 0.2126 + pixels[..., 1] * 0.7152 + pixels[..., 2] * 0.0722
    stretched = np.clip(0.47 + (grey - np.median(grey)) * 2.4, 0.07, 0.95)
    result = np.ones_like(pixels)
    for channel in range(3):
        result[..., channel] = stretched
    return result


# Three heads, so that buttons side by side differ.
for number, seed in enumerate(HEADS, start=1):
    path = shoot(f"stud-{number}", seed, False)
    save_rgba(shade(load_rgba(path)), path)
# The longer head, cut where the arrow's part begins.
wide_path = shoot("stud-wide", 8, True)
whole = shade(load_rgba(wide_path))
os.remove(wide_path)
cut = picture("stud-left")[0]
save_rgba(whole[:, :cut].copy(), out("stud-left"))
save_rgba(whole[:, cut:].copy(), out("stud-right"))
