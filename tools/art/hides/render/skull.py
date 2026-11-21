"""A trophy for the wall where the cameras leave room: the skull of a horned beast, hung by a thong from a peg.

The bone is real: the Smithsonian's scan of its cast of a white-tailed deer's skull (CC0; see ../textures.ts). A
deer carries antlers, and this skull has only the two stumps they grew from. The horns set on them are made
here, so the beast is invented."""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bpy
import numpy as np
from mathutils import Vector

from forms import cord, peg, ring
from materials import _math, _mix, material
from measures import out, picture, span, texture
from pixels import clean, load_rgba, save_rgba
from stage import start
from studio import render
from stuff import surface

SCAN = texture("deer-skull.glb")
# The skull's length on the wall, and how far below the picture's middle its middle hangs.
LENGTH, DOWN = 4.6, 0.75
# Where the antlers stood, from the middle of the scan's box, in its own millimetres.
STUMP = (39.0, 60.0)


def horn_stuff(name):
    """Horn: dark, a little glossy, ringed along its length."""
    mat, nodes, links = material(name)
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.6
    bsdf.inputs["Specular IOR Level"].default_value = 0.3
    coords = nodes.new("ShaderNodeTexCoord")
    rings = nodes.new("ShaderNodeTexWave")
    rings.wave_type, rings.bands_direction = "BANDS", "X"
    rings.inputs["Scale"].default_value = 14.0
    rings.inputs["Distortion"].default_value = 6.0
    rings.inputs["Detail"].default_value = 3.0
    links.new(coords.outputs["UV"], rings.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color, ramp.color_ramp.elements[1].color = (0.014, 0.009, 0.006, 1), (0.06, 0.04, 0.025, 1)
    links.new(rings.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    bump.inputs["Distance"].default_value = 0.03
    links.new(rings.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat



def horn(side, base, mat):
    """Out from its stump, then up and forward to a point."""
    data = bpy.data.curves.new("horn", "CURVE")
    data.dimensions = "3D"
    spline = data.splines.new("BEZIER")
    x, y, z = base
    # It leaves the side of its stump, its foot buried in the bone, so no cut end shows.
    path = [((x + 0.0, y, z - 0.28), 0.15), ((x + 0.35, y + 0.04, z - 0.2), 0.155), ((x + 1.0, y + 0.3, z - 0.06), 0.14), ((x + 1.8, y + 0.9, z + 0.08), 0.095), ((x + 2.05, y + 1.8, z + 0.3), 0.01)]
    spline.bezier_points.add(len(path) - 1)
    for point, ((px, py, pz), radius) in zip(spline.bezier_points, path):
        point.co = (side * px, py, pz)
        point.radius = radius
        point.handle_left_type = point.handle_right_type = "AUTO"
    data.bevel_depth, data.bevel_resolution, data.resolution_u = 1.0, 8, 24
    data.use_fill_caps = True
    obj = bpy.data.objects.new("horn", data)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def aged(mat):
    """The scan's own colours, hung for years: yellowed in patches, dark where dirt gathers."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    colour = bsdf.inputs["Base Color"]
    source = colour.links[0].from_socket if colour.links else tuple(colour.default_value)
    coords = nodes.new("ShaderNodeTexCoord")
    patches = nodes.new("ShaderNodeTexNoise")
    patches.inputs["Scale"].default_value = 1.4
    patches.inputs["Detail"].default_value = 7.0
    patches.inputs["Roughness"].default_value = 0.7
    links.new(coords.outputs["Object"], patches.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[1].position = 0.28, 0.75
    ramp.color_ramp.elements[0].color, ramp.color_ramp.elements[1].color = (0.15, 0.09, 0.04, 1), (0.66, 0.53, 0.33, 1)
    links.new(patches.outputs["Fac"], ramp.inputs["Fac"])
    stained = _mix(nodes, links, "MULTIPLY", source, ramp.outputs["Color"], 1.0)
    dirt = nodes.new("ShaderNodeAmbientOcclusion")
    dirt.inputs["Distance"].default_value = 0.5
    dirt.samples = 16
    shade = nodes.new("ShaderNodeMapRange")
    shade.inputs["From Min"].default_value, shade.inputs["From Max"].default_value = 0.42, 0.96
    shade.inputs["To Min"].default_value, shade.inputs["To Max"].default_value = 1.0, 0.0
    links.new(dirt.outputs["AO"], shade.inputs["Value"])
    links.new(_mix(nodes, links, "MULTIPLY", stained, (0.13, 0.08, 0.04, 1), shade.outputs["Result"]), colour)
    bsdf.inputs["Roughness"].default_value = 0.75
    bsdf.inputs["Specular IOR Level"].default_value = 0.25
    if bsdf.inputs["Roughness"].links:
        links.remove(bsdf.inputs["Roughness"].links[0])
    if bsdf.inputs["Metallic"].links:
        links.remove(bsdf.inputs["Metallic"].links[0])
    bsdf.inputs["Metallic"].default_value = 0.0


def skull():
    """The scan as it comes: its forehead toward us, its nose down. Returns where its two stumps are."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SCAN)
    parts = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    if len(parts) > 1:
        bpy.ops.object.join()
    head = bpy.context.object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    corners = [Vector(c) for c in head.bound_box]
    low = Vector([min(c[i] for c in corners) for i in range(3)])
    high = Vector([max(c[i] for c in corners) for i in range(3)])
    centre, scale = (low + high) / 2, LENGTH / (high.y - low.y)
    print("SCAN box", [round(v, 1) for v in (high - low)], "faces", len(head.data.polygons))
    for vertex in head.data.vertices:
        vertex.co = (vertex.co - Vector((centre.x, centre.y, low.z))) * scale
    head.location = (0, -DOWN, 0.06)
    for polygon in head.data.polygons:
        polygon.use_smooth = True
    for mat in head.data.materials:
        aged(mat)
    # The top of the skull at a stump: the highest point near it.
    sx, sy = STUMP[0] * scale, STUMP[1] * scale
    near = [v.co.z for v in head.data.vertices if abs(abs(v.co.x) - sx) < 0.12 and abs(v.co.y - sy) < 0.12]
    top = max(near) if near else (high.z - low.z) * scale
    print("STUMP", round(sx, 2), round(sy - DOWN, 2), round(top + 0.06, 2))
    return (sx, sy - DOWN, top + 0.06)


scene, _ = start(*picture("skull"), span("skull"), ceiling=250, lamps=20)
stump = skull()
stuff = horn_stuff("horn")
for side in (-1, 1):
    horn(side, stump, stuff)
thong = surface("thong", "fabric_leather_01", 3.0, tint=(0.42, 0.36, 0.3, 1))
wood = surface("peg", "rough_wood", 1.6, tint=(0.9, 0.74, 0.56, 1), strength=1.5)
x, y, z = stump
peg("peg", 0.0, y + 2.05, 0.14, 0.9, wood)
# The thong: two turns round the foot of each horn, and over the peg.
for side in (-1, 1):
    for k in range(2):
        ring("tie", (side * (x + 0.24 + k * 0.1), y + 0.03, z - 0.21), 0.175, 0.045, "x", thong, tilt=0.12 * side * (k - 0.5))
cord("hang", [(-x - 0.29, y + 0.2, z - 0.1), (-x * 0.6, y + 1.0, z - 0.15), (0.0, y + 2.2, 0.75), (x * 0.6, y + 1.0, z - 0.15), (x + 0.29, y + 0.2, z - 0.1)], 0.05, thong)
path = out("skull")
render(scene, path)
pixels = clean(load_rgba(path), floor=0.08, shadow_fade=14)
# Away from the things themselves only their shadow is kept, and a shadow is black: the catcher's pale veil
# would lie on a dark wall as a light patch.
for obj in scene.objects:
    if obj.type == "MESH" and obj.is_shadow_catcher:
        obj.hide_render = True
scene.cycles.samples = 24
alone_path = out("skull-alone")
render(scene, alone_path)
alone = load_rgba(alone_path)[..., 3]
shadow = alone < 0.5
pixels[..., :3][shadow] = 0.0
pixels[..., 3] = np.where(shadow, np.clip((pixels[..., 3] - 0.12) * 1.15, 0.0, 1.0), pixels[..., 3])
save_rgba(pixels, path)
os.remove(alone_path)
