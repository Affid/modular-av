"""What the mirrors scenes share: the path to the scrolls theme's studio, a scene's settings, a camera seen from in
front, lights, the glass's own light, and the check that keeps the middle of a picture clear.

Every scene runs alone in a fresh Blender, so `SETTINGS` is filled by the scene before it imports a module that
reads it (the contract and the quill share one module with two sets of settings).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths
sys.path.insert(0, os.path.join(HERE, "..", "..", "scrolls", "render"))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

from measures import DENSITY, MIDDLE, SCALE, TILE_H, TILE_W, VIEW, over, place  # noqa: E402,F401
from studio import _world, reset  # noqa: E402,F401

SETTINGS = {}
# The glass's own light, a cold violet, as linear RGB.
GLOW = (0.62, 0.42, 1.0)
# The room's light on the silver: a neutral grey from up to the left, never the glass's colour.
ROOM = (0.86, 0.86, 0.88)


def arg(name, default=None):
    """One of the scene's settings, by the name it had as an option while the look was being found."""
    return SETTINGS.get(name, default)


def front_camera(scene, width_px, height_px, span):
    """Straight at the glass: `span` scene units across a picture `width_px` by `height_px`."""
    data = bpy.data.cameras.new("camera")
    data.type = "ORTHO"
    data.sensor_fit = "HORIZONTAL"
    data.ortho_scale = span
    data.clip_end = 100
    cam = bpy.data.objects.new("camera", data)
    cam.location = (0, 0, 20)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = width_px, height_px
    return cam


def frame_camera(scene, density=DENSITY):
    """The frame layer's box, at `density` pixels to a tile unit."""
    w, h = over(density)
    return front_camera(scene, w, h, VIEW["w"] / SCALE)


def dark_world(scene, colour=(0.004, 0.004, 0.006), strength=1.0):
    world = bpy.data.worlds.new("world")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*colour, 1)
    bg.inputs["Strength"].default_value = strength
    agx(scene)
    return world


def agx(scene):
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"


def point_light(scene, name, at, colour, energy, radius=0.05):
    data = bpy.data.lights.new(name, "POINT")
    data.energy, data.color, data.shadow_soft_size = energy, colour, radius
    light = bpy.data.objects.new(name, data)
    light.location = at
    scene.collection.objects.link(light)
    return light


def area_light(scene, name, at, colour, energy, size, size_y=None, aim=(0, 0, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.color = energy, colour
    if size_y:
        data.shape, data.size, data.size_y = "RECTANGLE", size, size_y
    else:
        data.size = size
    light = bpy.data.objects.new(name, data)
    light.location = at
    light.rotation_euler = Vector(aim).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(light)
    return light


def sun(scene, name, direction, colour, energy, angle=4.0):
    data = bpy.data.lights.new(name, "SUN")
    data.energy, data.color, data.angle = energy, colour, math.radians(angle)
    light = bpy.data.objects.new(name, data)
    light.rotation_euler = Vector(direction).to_track_quat("Z", "Y").to_euler()
    scene.collection.objects.link(light)
    return light


def emitter(name, size, at, colour, strength):
    """A plane that gives light and is not seen: the glass's inner light, under a piece."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=at)
    plane = bpy.context.object
    plane.name = name
    plane.scale = (size[0], size[1], 1)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    nodes.clear()
    o = nodes.new("ShaderNodeOutputMaterial")
    e = nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*colour, 1)
    e.inputs["Strength"].default_value = strength
    m.node_tree.links.new(e.outputs["Emission"], o.inputs["Surface"])
    plane.data.materials.append(m)
    plane.visible_camera = False
    return plane


def glow_room(scene):
    """The room nearly dark: Blender's studio light, faint. The light comes up out of the glass."""
    agx(scene)
    _world(scene, "studio.exr", 0.16)


def holdout(name="video"):
    """A material that cuts what it covers out of the picture: the camera's own picture stands in for it."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    o = nodes.new("ShaderNodeOutputMaterial")
    hold = nodes.new("ShaderNodeHoldout")
    mat.node_tree.links.new(hold.outputs["Holdout"], o.inputs["Surface"])
    return mat


def render(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)


def middle_box(shape, density=DENSITY):
    """The rows and columns of a frame picture (rows bottom up, as Blender writes) within the middle 70%."""
    h, _ = shape[:2]
    x0 = round((MIDDLE[0] - VIEW["x"]) * density)
    x1 = round((MIDDLE[2] - VIEW["x"]) * density)
    y0 = h - round((MIDDLE[3] - VIEW["y"]) * density)
    y1 = h - round((MIDDLE[1] - VIEW["y"]) * density)
    return slice(y0, y1), slice(x0, x1)


def keep_middle_clear(pixels, name, density=DENSITY):
    """Fails the scene when anything is drawn in the middle 70% of the picture (the dock's rule)."""
    rows, cols = middle_box(pixels.shape, density)
    count = int((pixels[rows, cols, 3] > 0.0).sum())
    print(name, "PIXELS IN THE MIDDLE BOX:", count)
    if count:
        raise SystemExit(f"{name}: {count} pixels drawn in the middle 70% of the picture")


def luminance(pixels):
    return 0.2126 * pixels[..., 0] + 0.7152 * pixels[..., 1] + 0.0722 * pixels[..., 2]


def smoothstep(v):
    v = np.clip(v, 0, 1)
    return v * v * (3 - 2 * v)
