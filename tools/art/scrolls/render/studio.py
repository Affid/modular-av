"""The room every picture of the theme is rendered in, the camera over the desk, and rendering."""
import math
import os

import bpy
import numpy as np
from mathutils import Vector

# Tried in this order; the first kind the machine has renders. Without any, the CPU does.
GPU_KINDS = ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI")


def _use_gpu(scene):
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in GPU_KINDS:
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            found = [device for device in prefs.devices if device.type == kind]
        except Exception as error:  # this build of Blender has no such kind
            print(f"{kind} unavailable:", error)
            continue
        if found:
            for device in prefs.devices:
                device.use = device.type == kind
            scene.cycles.device = "GPU"
            return
    print("No GPU found: rendering on the CPU")


def reset():
    """An empty scene, set up for Cycles."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    _use_gpu(scene)
    scene.cycles.samples = 384
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 24
    scene.cycles.transmission_bounces = 24
    scene.cycles.glossy_bounces = 12
    scene.cycles.caustics_refractive = True
    scene.cycles.caustics_reflective = True
    scene.cycles.blur_glossy = 0.0
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    return scene


def _studio_lights():
    """Blender's own studio lights: the room's soft surroundings. Wherever this Blender keeps its data files."""
    return bpy.utils.system_resource("DATAFILES", path=os.path.join("studiolights", "world"))


def _world(scene, name, strength):
    world = bpy.data.worlds.new("world")
    scene.world = world
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    env = nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.join(_studio_lights(), name))
    background = nodes["Background"]
    background.inputs["Strength"].default_value = strength
    links.new(env.outputs["Color"], background.inputs["Color"])


def camera(scene, width, height, span):
    """Straight down, as the desk is seen: `span` scene units across the picture."""
    data = bpy.data.cameras.new("camera")
    data.type = "ORTHO"
    # Across, whatever the picture's shape: by itself Blender measures the longer side.
    data.sensor_fit = "HORIZONTAL"
    data.ortho_scale = span
    cam = bpy.data.objects.new("camera", data)
    cam.location = (0, 0, 10)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = width, height
    return cam


def _area_light(scene, name, energy, size, at):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.size = energy, size
    light = bpy.data.objects.new(name, data)
    light.location = at
    light.rotation_euler = Vector(at).to_track_quat("Z", "Y").to_euler()
    scene.collection.objects.link(light)
    return light


def _sparkle_lights(scene, energy):
    """Small bright lamps round the desk, out of the picture: what a cut stone's facets flash back."""
    spots = [(5, 2, 4, 0.5), (-5, -1, 3, 0.4), (2, 6, 5, 0.6), (-2, -6, 4, 0.5), (6, -4, 6, 0.4), (-6, 5, 2.5, 0.35), (0.5, -1, 9, 0.8)]
    for i, (x, y, z, size) in enumerate(spots):
        lamp = _area_light(scene, f"lamp{i}", energy, size, (x, y, z))
        lamp.visible_diffuse = False  # they light the stones' facets, not the sheet


def room(scene, exposure=0.5, sun=1.9, ceiling=900, lamps=90):
    """One room for every picture of the theme: a sun from the upper left (the same light and the same shadows
    everywhere on the desk), a soft bright ceiling and small lamps for what glass and stone flash back."""
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Base Contrast"
    scene.view_settings.exposure = exposure
    _world(scene, "studio.exr", 0.6)
    data = bpy.data.lights.new("sun", "SUN")
    data.energy, data.angle = sun, math.radians(4)
    data.cycles.is_caustics_light = True
    light = bpy.data.objects.new("sun", data)
    light.rotation_euler = Vector((-1.0, 1.0, 2.6)).to_track_quat("Z", "Y").to_euler()
    scene.collection.objects.link(light)
    top = _area_light(scene, "ceiling", ceiling, 9.0, (-1.5, 1.5, 9.0))
    top.visible_diffuse = False
    _sparkle_lights(scene, lamps)
    return light


def render(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)


def render_linear(scene, path):
    """A render as the light fell, unshaped by the view: for sums done on it afterwards."""
    view = scene.view_settings
    keep = (view.view_transform, view.look, view.exposure)
    view.view_transform, view.look, view.exposure = "Raw", "None", 0.0
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    render(scene, path)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    view.view_transform, view.look, view.exposure = keep
    image = bpy.data.images.load(path)
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    bpy.data.images.remove(image)
    return pixels
