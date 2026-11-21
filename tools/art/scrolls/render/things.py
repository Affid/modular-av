"""What lies on the desk in the free room, seen from above as the desk is: glass, stone and metal only.

A granite mortar with crushed blue crystal and its pestle, a corked vial of a green draught, violet crystals,
gold coins, a brass key, loose stones. Only the things and their shadows are kept.
"""
import math
import random
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths

import bmesh
import bpy

from materials import desk_wood, gem_glass, granite, material, metal, plain
from measures import out, picture, span
from pixels import clean, load_rgba, save_rgba
from shapes import brilliant, ground, lathe, lay_down
from studio import camera, render, reset, room

# Seeds the crushed crystal: where each shard lies, and how it is turned.
SEED = 8
MORTAR = (-3.3, -0.3)
HEAP = (-3.22, -0.38)
# Shards that jumped out under the pestle: on the rim, and on the desk beside it.
SPILLED = [(-2.52, -0.66, 0.74), (-2.6, -0.8, 0.72), (-2.2, -0.9, 0.03), (-2.05, -1.12, 0.03), (-2.32, -1.22, 0.03), (-3.9, 0.42, 0.74), (-2.0, -0.62, 0.03)]


def bumpy(name, colour, roughness, scale, strength):
    """A plain surface with a fine grain in it."""
    mat = plain(name, colour, roughness)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 6.0
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], nodes["Principled BSDF"].inputs["Normal"])
    return mat


def crushed_crystal(rng):
    """In the mortar: a low dark heap, and over it a few hundred shards, each a chip of glass catching the light.
    (A glowing powder would look painted: emission flattens a material.)"""
    x0, y0 = HEAP
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=(x0, y0, 0.2), segments=64, ring_count=32)
    powder = bpy.context.object
    powder.scale = (1, 0.9, 0.26)
    heap = powder.modifiers.new("heap", "DISPLACE")
    heap.texture = bpy.data.textures.new("heap", "CLOUDS")
    heap.texture.noise_scale = 0.1
    heap.strength = 0.08
    powder.data.materials.append(bumpy("dust", (0.01, 0.03, 0.2, 1), 1.0, 120.0, 1.0))
    bpy.ops.object.shade_smooth()
    chip = gem_glass("chip", (0.12, 0.3, 0.95), 14.0, 1.7)
    pale = gem_glass("palechip", (0.3, 0.55, 1.0), 6.0, 1.7)

    def shard(x, y, z, size):
        bpy.ops.mesh.primitive_ico_sphere_add(radius=size, subdivisions=1, location=(x, y, z))
        one = bpy.context.object
        one.scale = (rng.uniform(0.6, 1.3), rng.uniform(0.6, 1.3), rng.uniform(0.4, 0.9))
        one.rotation_euler = (rng.uniform(0, 3.1), rng.uniform(0, 3.1), rng.uniform(0, 3.1))
        one.data.materials.append(chip if rng.random() < 0.7 else pale)

    for _ in range(260):
        a, d = rng.uniform(0, math.tau), 0.47 * math.sqrt(rng.random())
        # Higher in the middle of the heap, as it was poured.
        shard(x0 + math.cos(a) * d, y0 + math.sin(a) * d * 0.9, 0.23 + 0.12 * (1 - (d / 0.47) ** 2) + rng.uniform(0, 0.03), rng.uniform(0.022, 0.05))
    for x, y, z in SPILLED:
        shard(x, y, z, rng.uniform(0.035, 0.055))


def mortar(rng):
    """A mortar of grey stone, a deep blue crystal ground in it, and its stone pestle lying across the rim."""
    bowl = lathe("mortar", [(0.0, 0.0), (0.5, 0.0), (0.74, 0.14), (0.9, 0.42), (0.94, 0.62), (0.92, 0.7), (0.86, 0.73), (0.8, 0.7), (0.72, 0.5), (0.56, 0.3), (0.3, 0.2), (0.0, 0.18)], 96)
    bowl.location = (*MORTAR, 0)
    bowl.data.materials.append(granite("granite"))
    crushed_crystal(rng)
    pestle = lathe("pestle", [(0.0, 0.0), (0.12, 0.01), (0.19, 0.1), (0.2, 0.24), (0.14, 0.5), (0.105, 1.2), (0.1, 1.7), (0.07, 1.78), (0.0, 1.8)], 48)
    pestle.data.materials.append(granite("pestlestone", light=(0.36, 0.35, 0.33, 1)))
    pestle.location = (-3.55, -0.55, 0.36)
    pestle.rotation_euler = (0, math.radians(72), math.radians(32))


def draught_glass():
    """A green draught: glass to the eye, and clear green to the light's own rays, so its shadow is green."""
    mat, nodes, links = material("green")
    surface = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfGlass")
    shader.inputs["Color"].default_value = (0.2, 0.85, 0.45, 1)
    shader.inputs["IOR"].default_value = 1.34
    path = nodes.new("ShaderNodeLightPath")
    clear = nodes.new("ShaderNodeBsdfTransparent")
    clear.inputs["Color"].default_value = (0.25, 0.8, 0.45, 1)
    mix = nodes.new("ShaderNodeMixShader")
    links.new(path.outputs["Is Shadow Ray"], mix.inputs["Fac"])
    links.new(shader.outputs["BSDF"], mix.inputs[1])
    links.new(clear.outputs["BSDF"], mix.inputs[2])
    links.new(mix.outputs["Shader"], surface.inputs["Surface"])
    return mat


def vial():
    """A corked vial of a green draught, lying on its side."""
    outer = [(0.0, 0.0), (0.4, 0.0), (0.5, 0.1), (0.5, 1.55), (0.44, 1.75), (0.2, 1.92), (0.2, 2.2), (0.27, 2.24), (0.27, 2.34), (0.2, 2.36)]
    inner = [(0.15, 2.36), (0.15, 1.95), (0.39, 1.77), (0.45, 1.55), (0.45, 0.12), (0.36, 0.05), (0.0, 0.05)]
    glass = lathe("vial", outer + inner)
    glass.data.materials.append(gem_glass("vialglass", (0.8, 0.95, 0.88), 0.2, 1.5))
    draught = lathe("draught", [(0.0, 0.055), (0.355, 0.055), (0.445, 0.125), (0.445, 1.55), (0.385, 1.765), (0.0, 1.765)])
    draught.data.materials.append(draught_glass())
    cork = lathe("cork", [(0.0, 2.02), (0.145, 2.02), (0.2, 2.5), (0.19, 2.56), (0.0, 2.56)], 32)
    cork.data.materials.append(bumpy("corkmat", (0.5, 0.33, 0.17, 1), 0.85, 30.0, 0.5))
    for part in (glass, draught, cork):
        part.rotation_euler = (math.radians(-90), 0, math.radians(-72))
        part.location = (-0.9, 1.05, 0.5)
    bpy.context.view_layer.update()
    # The draught's level, lying down: everything above it is cut away.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.5 + 0.12 - 5))
    cutter = bpy.context.object
    cutter.scale = (20, 20, 10)
    cut = draught.modifiers.new("level", "BOOLEAN")
    cut.operation, cut.object = "INTERSECT", cutter
    cutter.hide_render = True


def loose_stones():
    """Loose stones, each lying on a facet."""
    stones = [(-1.5, -1.5, 0.44, (0.9, 0.08, 0.12), 0.4), (3.9, 1.5, 0.36, (0.5, 0.2, 0.95), 2.3), (2.3, 1.2, 0.3, (0.1, 0.3, 0.95), 4.1)]
    for i, (x, y, r, colour, spin) in enumerate(stones):
        stone = brilliant("loose", r)
        stone.location = (x, y, 0)
        stone.data.materials.append(gem_glass("loose", colour, 1.5 / r))
        lay_down(stone, spin, i)


def crystal(mat, x, y, long, wide, turn, lift):
    """One six-sided crystal with a point, lying down: its length along the desk, its point a little raised."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=wide, depth=long, location=(0, 0, 0))
    body = bpy.context.object
    bm = bmesh.new()
    bm.from_mesh(body.data)
    tip = bmesh.ops.extrude_face_region(bm, geom=[f for f in bm.faces if all(v.co.z > 0 for v in f.verts)])
    for v in (e for e in tip["geom"] if isinstance(e, bmesh.types.BMVert)):
        v.co.x, v.co.y, v.co.z = v.co.x * 0.12, v.co.y * 0.12, v.co.z + wide * 1.5
    bm.to_mesh(body.data)
    bm.free()
    body.data.materials.append(mat)
    body.rotation_euler = (0, math.radians(90 - lift), turn)
    reach = long / 2 * math.cos(math.radians(lift))
    body.location = (x + math.cos(turn) * reach, y + math.sin(turn) * reach, wide * 0.9 + long / 2 * math.sin(math.radians(lift)))
    body.cycles.is_caustics_caster = True


def crystals():
    """A cluster of violet crystals, lying on its side, grown from one root."""
    x, y = 2.6, -1.55
    amethyst = gem_glass("amethyst", (0.45, 0.12, 0.85), 1.6, 1.55)
    for long, wide, turn, lift in [(1.3, 0.2, 0.5, 6), (1.0, 0.16, 0.95, 14), (0.85, 0.15, 0.1, 10), (0.7, 0.12, 1.4, 22), (0.6, 0.13, -0.3, 8), (0.5, 0.1, 0.72, 30)]:
        crystal(amethyst, x, y, long, wide, turn, lift)
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.3, subdivisions=2, location=(x, y, 0.16))
    root = bpy.context.object
    root.scale = (1.1, 0.9, 0.55)
    root.data.materials.append(granite("root", dark=(0.05, 0.04, 0.06, 1), light=(0.3, 0.26, 0.34, 1), grain=20.0))


def coin(gold, x, y, z, tilt=0.0):
    """A struck coin: a raised rim, and a boss in the middle."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.27, depth=0.045, location=(x, y, z), rotation=(tilt, 0, 0))
    disc = bpy.context.object
    edge = disc.modifiers.new("edge", "BEVEL")
    edge.width, edge.segments = 0.012, 2
    disc.data.materials.append(gold)
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_torus_add(major_radius=0.225, minor_radius=0.016, location=(x, y, z + 0.022), rotation=(tilt, 0, 0))
    bpy.context.object.data.materials.append(gold)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, location=(x, y, z + 0.012), segments=24, ring_count=12)
    boss = bpy.context.object
    boss.scale = (1, 1, 0.22)
    boss.data.materials.append(gold)
    bpy.ops.object.shade_smooth()


def coins():
    """Gold coins: a few stacked askew, two lying by them."""
    gold = metal("gold", (0.55, 0.26, 0.02, 1), 0.42)
    for i, (dx, dy) in enumerate([(0, 0), (0.05, -0.04), (-0.03, 0.05), (0.07, 0.03)]):
        coin(gold, 0.15 + dx, -0.95 + dy, 0.023 + i * 0.047)
    coin(gold, 0.78, -1.3, 0.023)
    coin(gold, -0.38, -1.42, 0.03, 0.06)


def key(scene):
    """A brass key: a ring for a bow, a shank with a collar, two bits."""
    brass = metal("brass", (0.78, 0.55, 0.2, 1), 0.34)
    holder = bpy.data.objects.new("key", None)
    scene.collection.objects.link(holder)

    def part():
        bpy.context.object.data.materials.append(brass)
        bpy.context.object.parent = holder

    bpy.ops.mesh.primitive_torus_add(major_radius=0.2, minor_radius=0.045, location=(0, 0, 0.045))
    part()
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.04, depth=0.95, location=(0.68, 0, 0.045), rotation=(0, math.pi / 2, 0))
    part()
    for dx, tall in ((1.02, 0.2), (1.12, 0.14)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(dx, -tall / 2, 0.045))
        bpy.context.object.scale = (0.07, tall, 0.05)
        part()
    bpy.ops.mesh.primitive_torus_add(major_radius=0.065, minor_radius=0.025, location=(0.27, 0, 0.045), rotation=(0, math.pi / 2, 0))
    part()
    holder.location = (3.0, 0.15, 0)
    holder.rotation_euler = (0, 0, math.radians(-24))


scene = reset()
room(scene)
width, height = picture("things")
camera(scene, width, height, span("things"))
ground(scene, desk_wood(), catcher=True)
scene.render.film_transparent = True
mortar(random.Random(SEED))
vial()
loose_stones()
crystals()
coins()
key(scene)
scene.cycles.samples = 768
path = out("things")
render(scene, path)
save_rgba(clean(load_rgba(path), floor=0.08, shadow_fade=18), path)
