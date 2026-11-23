"""The finish of a monitor's frame picture, after its render: shadows kept close to what casts them, the tube's dark
border laid under the glass's reflections, the reflections faded toward the middle box (nothing may be drawn in
the middle 70%), and, when the headset hangs on its bracket, its own coverage kept solid, its soft shadow laid on
the paint and on the lit tube. Also the readout's window cut out of a frame, and the player's colour layer.

The deafened frames leave working files beside them for screens.py: `<name>-hsmask` (the headset's coverage)
and `<name>-hsshade` (its shadow on the tube), so the scan lines and the snow are cut and thinned there.
"""
import math

import bpy
import numpy as np

import stage
from case import WINDOW_IN
from headset import HANG
from measures import DENSITY, VIEW, out
from paint import plain
from pixels import load_rgba, save_rgba, soften
from tube import dark_border, tube_border

TUBE_SHADOW = 0.55  # how dark the headset's shadow lies on the lit tube (it glows: never fully)
CASE_SHADOW = 0.62  # how dark the headset's soft shadow lies on the paint
SOFT_SUN = 11.0  # degrees: the shadow of a thing hung a finger's width off the case is soft


def holdout_all_but(keep):
    """Every object but those named `keep` (or starting so) cut out of the picture (alpha 0 where it is)."""
    hold = bpy.data.materials.new("holdout")
    hold.use_nodes = True
    nt = hold.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    h = nt.nodes.new("ShaderNodeHoldout")
    nt.links.new(h.outputs[0], o.inputs["Surface"])
    for obj in bpy.context.scene.objects:
        if obj.type not in ("MESH", "CURVE") or obj.name in keep or obj.name.startswith(tuple(keep)):
            continue
        for i in range(len(obj.data.materials)):
            obj.data.materials[i] = hold
        if not obj.data.materials:
            obj.data.materials.append(hold)


def sun_ignores_hung(scene):
    """The work lamp casts no crisp shadow of the headset and its bracket (shadow linking: everything else blocks
    it); their soft shadow is laid on afterwards from headset_shadow's pass."""
    block = bpy.data.collections.new("sun-blockers")
    scene.collection.children.link(block)
    for obj in scene.objects:
        if obj.type in ("MESH", "CURVE") and not obj.name.startswith(HANG):
            block.objects.link(obj)
    scene.objects["sun"].light_linking.blocker_collection = block


def headset_mask(scene, catch, name, samples=16):
    """The headset's own coverage: everything else held out. It may come nearer the middle box than the glass's
    reflections, which the finish fades toward it; the headset is solid and is not faded."""
    catch.hide_render = True
    holdout_all_but(list(HANG))
    scene.cycles.samples = samples
    path = out(name + "-hsmask")
    stage.render(scene, path)
    m = load_rgba(path)[..., 3]
    m = np.where(m < 0.03, 0.0, m)
    keep = np.zeros(m.shape + (4,), dtype=np.float32)
    keep[..., 3] = m
    save_rgba(keep, path)
    return m


def headset_shadow(scene, name, samples=64):
    """The headset's shadow on the tube's glass, which film-transparent glass doesn't keep, and on the case: a
    catcher the glass's shape just behind it and the case as a catcher, everything else hidden, the headset
    casting but not seen; under a softer sun alone (the room's soft light cast a second, stray shadow)."""
    glass = bpy.data.objects["glass"]
    sh = stage.link(bpy.data.objects.new("glass-catcher", glass.data.copy()))
    sh.location.z = -0.004
    sh.is_shadow_catcher = True
    white = plain("catch-white", (0.8, 0.8, 0.8), rough=0.9)
    sh.data.materials.clear()  # the glass's own is held out by now: a catcher needs a surface
    sh.data.materials.append(white)
    for obj in scene.objects:
        if obj.type not in ("MESH", "CURVE") or obj is sh:
            continue
        if obj.name.startswith(HANG):
            obj.visible_camera = False
        elif obj.name == "case":
            obj.hide_render = False
            obj.is_shadow_catcher = True
            for i in range(len(obj.data.materials)):
                obj.data.materials[i] = white
            obj.visible_shadow = False
        else:
            obj.hide_render = True
    sun = scene.objects["sun"]
    sun.data.angle = math.radians(SOFT_SUN)
    sun.light_linking.blocker_collection = None
    for obj in scene.objects:
        if obj.type == "LIGHT" and obj.name != "sun":
            obj.hide_render = True
    bg = next((n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND"), None)
    if bg is not None:
        bg.inputs["Strength"].default_value = 0.0
    scene.cycles.samples = samples
    path = out(name + "-hsshadow")
    stage.render(scene, path)
    return load_rgba(path)[..., 3]


def _over(whole, s):
    """A shadow of alpha `s` laid under the picture's own pixels (premultiplied over)."""
    a = whole[..., 3]
    na = a + s * (1 - a)
    whole[..., :3] = whole[..., :3] * (a / np.maximum(na, 1e-5))[..., None]
    whole[..., 3] = na


def finish(scene, catch, name):
    """Render a frame picture and finish it; returns it (RGBA, rows running up as Blender stores them)."""
    path = out(name)
    hung = any(o.name.startswith(HANG) for o in scene.objects)
    if hung:
        sun_ignores_hung(scene)
    stage.render(scene, path)
    whole, _ = stage.keep_close(scene, catch, path, near=6)
    dist = tube_border(whole.shape)
    whole = dark_border(whole, dist)
    fade = stage.away_from_middle(whole.shape, 45.0)
    if hung:
        cover = headset_mask(scene, catch, name)
        solid = np.clip(cover * 1.2, 0, 1)
        fade = np.maximum(fade, solid)
        raw = soften(headset_shadow(scene, name), 2)
    whole[..., 3] *= fade
    if hung:
        # on the paint the soft shadow darkens what is there, on every pixel the headset doesn't wholly cover (its
        # edge's pixels too: no lit fringe round it)
        on_case = np.clip(raw * (cover < 0.995) * CASE_SHADOW, 0, 1) * (dist <= 1.0)
        whole[..., :3] *= (1 - on_case * np.clip(whole[..., 3], 0, 1))[..., None]
        # on the tube, under the glass's own reflections, never toward the middle
        s = np.clip(raw * (1 - solid) * TUBE_SHADOW, 0, 1) * (dist > 1.0) * stage.away_from_middle(whole.shape, 45.0)
        shade = np.zeros_like(whole)
        shade[..., 3] = s
        save_rgba(shade, out(name + "-hsshade"))
        _over(whole, s)
    save_rgba(whole, path)
    stage.check_middle(whole, name)
    return whole


def window(whole, name):
    """The readout's window cut out of a finished frame, opaque: the name bar's background, so the name shows on
    the same smoked glass as the frame round it."""
    x0, y0, x1, y1, _ = WINDOW_IN
    h = whole.shape[0]
    c0, c1 = int(round((x0 - VIEW["x"]) * DENSITY)), int(round((x1 - VIEW["x"]) * DENSITY))
    r0, r1 = int(round((y0 - VIEW["y"]) * DENSITY)), int(round((y1 - VIEW["y"]) * DENSITY))
    inside = whole[h - r1:h - r0, c0:c1].copy()
    inside[..., 3] = 1.0
    save_rgba(inside, out(name))


def colour_layer(scene, name):
    """The player's colour: only the vinyl tab, white, lit as it lies (the case and all else held out), for the
    stylesheet to tint and lay over every frame."""
    holdout_all_but(["colour-tape"])
    path = out(name)
    stage.render(scene, path)
    px = load_rgba(path)
    px[..., 3] = np.where(px[..., 3] < 0.02, 0.0, px[..., 3])
    save_rgba(px, path)
    stage.check_middle(px, name)
