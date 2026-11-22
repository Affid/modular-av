"""The box's inside, seen through a window whose camera is off or whose player is out: its back lined with
bottle-green velvet (Poly Haven's velour_velvet, greyed and tinted green: red velvet beside iron reads as rust),
padded and buttoned in diamonds as a box for valuables is lined, lit only by the box's own lamp standing on its
floor under the window, so the light grazes the pile from below and fades upward. No sun and no studio: it is the
inside of a shut box."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402  (first: the paths)

import bpy  # noqa: E402
from mathutils import Vector, noise  # noqa: E402

import materials as m  # noqa: E402
import shapes  # noqa: E402
from measures import out, picture  # noqa: E402

W, H = 10.0, 5.625
DIAMOND = (2.5, 1.9)  # a padded diamond's width and height
ORIGIN = (0.3, 0.2)


def velvet():
    mat, nodes, links, bsdf = m._new("velvet")
    v = m._coords(nodes, links, 0.16, (0.2, 0.4, 0))
    grey = nodes.new("ShaderNodeRGBToBW")
    links.new(m._photo(nodes, links, v, "velour_velvet_diff.jpg"), grey.inputs["Color"])
    tone = m._ramp(nodes, links, grey.outputs["Val"], 0.1, 0.7, 0.35, 1.0)
    mul = nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    links.new(tone, mul.inputs["A"])
    mul.inputs["B"].default_value = (0.008, 0.055, 0.05, 1)
    links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Specular IOR Level"].default_value = 0.1
    bsdf.inputs["Sheen Weight"].default_value = 1.0
    bsdf.inputs["Sheen Roughness"].default_value = 0.35
    bsdf.inputs["Sheen Tint"].default_value = (0.55, 0.75, 0.6, 1)
    nor = m._n(nodes, "ShaderNodeNormalMap", Strength=1.0)
    links.new(m._photo(nodes, links, v, "velour_velvet_nor.jpg", False), nor.inputs["Color"])
    links.new(nor.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def padded_back(cloth):
    """The back, puffed between buttons on a diamond grid, each puff filled a little unevenly."""
    a, b = DIAMOND
    ox, oy = ORIGIN
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=300, y_subdivisions=180, size=1, location=(0, 0, 0))
    back = bpy.context.object
    for v in back.data.vertices:
        x, y = v.co.x * (W + 1), v.co.y * (H + 1)
        u, w = (x - ox) / a + (y - oy) / b, (x - ox) / a - (y - oy) / b
        puff = (math.sin(math.pi * (u - math.floor(u))) * math.sin(math.pi * (w - math.floor(w)))) ** 0.75
        lumpy = 1.0 + 0.18 * noise.noise(Vector((x * 0.9, y * 0.9, 2.0))) + 0.05 * noise.noise(Vector((x * 4, y * 4, 5.0)))
        v.co = (x, y, 0.22 * puff * lumpy)
    for poly in back.data.polygons:
        poly.use_smooth = True
    back.data.materials.append(cloth)
    for i in range(-4, 5):
        for j in range(-4, 5):
            x, y = ox + a * (i + j) / 2, oy + b * (i - j) / 2
            if abs(x) < W / 2 + 0.4 and abs(y) < H / 2 + 0.4:
                shapes.dome(f"button{i}{j}", (x, y), 0.09, 0.06, cloth, z=0.0)


def main():
    scene = stage.stage(samples=160, lamps=False, ceiling=False)
    for obj in scene.objects:
        if obj.type == "LIGHT":
            obj.hide_render = True
    for node in scene.world.node_tree.nodes:
        if node.type == "BACKGROUND":
            node.inputs["Strength"].default_value = 0.0
    scene.render.film_transparent = False
    w, h = picture("lining")
    stage.front_camera(scene, w, h, W)
    padded_back(velvet())
    lamp = bpy.data.lights.new("box-lamp", "AREA")
    lamp.shape, lamp.size, lamp.size_y = "RECTANGLE", 7.0, 0.5
    lamp.energy, lamp.color = 900.0, (1.0, 0.55, 0.26)
    obj = bpy.data.objects.new("box-lamp", lamp)
    obj.location = (0.4, -H / 2 - 0.9, 1.4)
    obj.rotation_euler = (math.radians(62), 0, 0)
    scene.collection.objects.link(obj)
    stage.render(scene, out("lining"))


main()
