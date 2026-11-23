"""The plates' lights.

  lamp-off, lamp-green, lamp-amber   the call's status lamp on the header plate: a pilot lamp with a blackened,
          knurled steel bezel (worn to bare steel on the ridges a thumb turns) round a dome of tinted glass; one lamp
          with a lens lit in two colours, so one lamp shows both states. Green in the call (as the TX lamp and the
          readouts), amber while joining or reconnecting, dark when idle or ended (red is kept for muted and
          leave). Lit, a bulb deep in the glass makes a hot core and the dome glows its colour, a little of the
          light spilling on the plate round it; dark, it is tinted glass that shows the room's glint. 26 by 26 CSS
          px: the lamp 14 across, the rest room for its shadow and its spill.
  annunciator-amber, annunciator-red   the voice panel's warning as an annunciator: a blackened steel bezel round
          a lens lit from behind, amber for a warning and red for a fault (the dock's own split of its colours).
          The lens is a low dome of moulded glass with a faint grid of fresnel cells: bright in the middle, falling
          off toward its rim, the room's lamp glinting on its upper left. The glass, the bezel and the glint are
          rendered (the lens dark, so the lamp's glint and the room's reflections show on it); its light is laid in
          under them in the picture's pixels, since AgX turns a bright saturated emission pale. Modelled 24 by 24
          CSS px, 2 px of it its shadow.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402,F401  (first: the paths)

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from paint import material, plain  # noqa: E402
from parts import c, coords, dome, mask_of, pillow, ring_mesh, rounded, setup, shadow, wanted  # noqa: E402
from pixels import load_rgba, save_rgba, soften  # noqa: E402
from stage import out, render  # noqa: E402

# ---- the status lamp ----

LAMP = 26.0
LENS = {"green": (0.01, 0.4, 0.035), "amber": (0.9, 0.3, 0.01), "off": (0.010, 0.022, 0.014)}
CORE = {"green": ((0.55, 1.0, 0.4), 1.3), "amber": ((1.0, 0.65, 0.25), 1.3)}


def bezel():
    """The knurled ring: 48 ridges round its rim, the hole for the lens cut through it."""
    steel = plain("bezel", (0.07, 0.068, 0.065), rough=0.45, metallic=1.0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=c(7.0), depth=c(1.8), location=(0, 0, c(0.9)))
    ring = bpy.context.active_object
    for v in ring.data.vertices:
        a = math.atan2(v.co.y, v.co.x)
        if math.hypot(v.co.x, v.co.y) > c(6.4):
            k = 1.0 + 0.03 * math.cos(a * 48)
            v.co.x, v.co.y = v.co.x * k, v.co.y * k
    mod = ring.modifiers.new("hole", "BOOLEAN")
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=c(4.6), depth=c(4), location=(0, 0, c(1)))
    cutter = bpy.context.active_object
    mod.object, mod.operation = cutter, "DIFFERENCE"
    cutter.hide_render = True
    bev = ring.modifiers.new("bevel", "BEVEL")
    bev.width, bev.segments, bev.limit_method = c(0.45), 3, "ANGLE"
    ring.data.materials.append(steel)
    # the ridges' tops worn bright: a second, bare-steel material on the outermost faces
    ring.data.materials.append(plain("bare", (0.42, 0.41, 0.39), rough=0.35, metallic=1.0))
    for p in ring.data.polygons:
        p.use_smooth = True
        x, y, _ = p.center
        if math.hypot(x, y) > c(7.15) and abs(p.normal.z) < 0.5:
            p.material_index = 1


def lens(state):
    tint = LENS[state]
    mat = plain("lens", tint, rough=0.12)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Coat Weight"].default_value = 1.0
    bsdf.inputs["Coat Roughness"].default_value = 0.04
    if state in CORE:
        bsdf.inputs["Emission Color"].default_value = (*tint, 1)
        bsdf.inputs["Base Color"].default_value = tuple(v * 0.3 for v in tint) + (1,)
        bsdf.inputs["Emission Strength"].default_value = 0.16
        core, strength = CORE[state]
        dome("core", (0.3, -0.3), 1.6, 1.0, 1.6, plain("core", core, rough=0.5, emission=core, strength=strength),
             segs=24)
    dome("lens", (0, 0), 4.7, 3.0, 0.8, mat, segs=48)


def lamp(state):
    name = f"lamp-{state}"
    scene, density = setup(name, LAMP, LAMP, samples=320)
    bezel()
    lens(state)
    path = out(name)
    render(scene, path)
    px = load_rgba(path)
    body = px[..., 3]
    drop = shadow(body, 2.4, 0.8, density) * 0.65 * (1 - body)
    a = body + drop
    rgb = px[..., :3] * (body / np.maximum(a, 1e-4))[..., None]
    if state in CORE:
        rgb, a = lit_lamp(px.shape, rgb, a, state)
    save_rgba(np.dstack([rgb, a]), path)


def lit_lamp(shape, rgb, a, state):
    """The bulb's filament seen through the glass (a hot core a little below and right of the middle), and its
    light on the plate round the bezel: a faint ring of its colour, fading over 5 px."""
    xs, ys = coords(shape, LAMP, LAMP)
    r = np.hypot(xs[None, :], ys[:, None])
    spill = np.clip(1 - (r - 7.0) / 5.5, 0, 1) ** 2 * (r > 6.8) * 0.32
    colour = (np.array(LENS[state]) / max(LENS[state])) ** (1 / 2.2)
    core = np.array(CORE[state][0]) ** (1 / 2.2)
    hot = np.exp(-(((xs[None, :] - 0.4) ** 2 + (ys[:, None] + 0.4) ** 2) / (2 * 1.5 ** 2))) * 0.55
    rgb = rgb * (1 - hot[..., None]) + core[None, None, :] * hot[..., None]
    sa = spill * (1 - a)
    total = a + sa
    rgb = (rgb * a[..., None] + colour[None, None, :] * sa[..., None]) / np.maximum(total, 1e-4)[..., None]
    return rgb, total


# ---- the annunciator ----

ANNUN = 24.0
ANNUN_HW = 10.0                   # the bezel's half size
LENS_HW = ANNUN_HW - 2.6          # the lens's
LIT = {"amber": (1.0, 0.60, 0.10), "red": (0.96, 0.16, 0.10)}   # sRGB, the lens's light at its middle


def dark_glass():
    """The lens as moulded glass, unlit: near black, a clear coat, the fresnel cells as a faint bump grid."""
    mat, nodes, links = material("lens")
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.012, 0.010, 0.008, 1)
    bsdf.inputs["Roughness"].default_value = 0.35
    bsdf.inputs["Coat Weight"].default_value = 1.0
    bsdf.inputs["Coat Roughness"].default_value = 0.06
    tc = nodes.new("ShaderNodeTexCoord")
    mp = nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / c(2.0),) * 3
    links.new(tc.outputs["Object"], mp.inputs["Vector"])
    chk = nodes.new("ShaderNodeTexChecker")
    chk.inputs["Scale"].default_value = 1.0
    links.new(mp.outputs["Vector"], chk.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    bump.inputs["Distance"].default_value = 0.002
    links.new(chk.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    return mat


def annunciator(colour_name):
    name = f"annunciator-{colour_name}"
    scene, density = setup(name, ANNUN, ANNUN, samples=256)
    hw = ANNUN_HW
    outer = rounded(hw, hw, 2.2)
    rings = [(outer, -1.0, 0.0), (outer, 0.6, 0.0), (rounded(hw - 0.6, hw - 0.6, 1.8), 1.3, 0.0),
             (rounded(hw - 2.0, hw - 2.0, 1.2), 1.3, 0.0), (rounded(LENS_HW, LENS_HW, 1.0), 0.4, 0.0),
             (rounded(LENS_HW, LENS_HW, 1.0), -0.6, 0.0)]
    ring_mesh("bezel", rings, plain("bezel", (0.05, 0.048, 0.046), rough=0.4, metallic=1.0))
    glass = pillow("lens", LENS_HW, LENS_HW, -0.3, 0.7, dark_glass(), r=1.0, n=24)
    path = out(name)
    render(scene, path)
    px = load_rgba(path)
    m = mask_of(scene, [glass], out(f"{name}-lens"))
    px[..., :3] = px[..., :3] * (1 - m[..., None]) + lens_light(px, colour_name) * m[..., None]
    body = px[..., 3]
    drop = shadow(body, 2.0, 0.7, density) * 0.6 * (1 - body)
    a = body + drop
    px[..., :3] *= (body / np.maximum(a, 1e-4))[..., None]
    px[..., 3] = a
    save_rgba(px, path)


def lens_light(px, colour_name):
    """The light behind the lens: bright in the middle, falling off to the rim, the fresnel cells' faint 2 px grid
    and a frosting; the rendered glass over it (its glint and the room's reflections) added as light on light."""
    xs, ys = coords(px.shape, ANNUN, ANNUN)
    lh = LENS_HW
    rad = np.clip(np.maximum(np.abs(xs)[None, :], np.abs(ys)[:, None]) / lh, 0, 1)
    rad2 = np.clip(np.hypot(xs[None, :], ys[:, None]) / (lh * 1.25), 0, 1)
    fall = 1.0 - 0.42 * rad2 ** 1.6 - 0.18 * np.clip((rad - 0.82) / 0.18, 0, 1)
    cell = 2.0
    gx = np.abs(((xs + lh) % cell) - cell / 2)[None, :] / (cell / 2)
    gy = np.abs(((ys + lh) % cell) - cell / 2)[:, None] / (cell / 2)
    grid = 1.0 - 0.07 * np.clip((np.maximum(gx, gy) - 0.8) / 0.2, 0, 1)
    rng = np.random.default_rng(3)
    frost = 1.0 + 0.05 * (soften(rng.random(px.shape[:2]).astype(np.float32), 1) - 0.5) * 4
    light = np.array(LIT[colour_name], dtype=np.float32)[None, None, :] * (fall * grid * frost)[..., None]
    return 1 - (1 - np.clip(light, 0, 1)) * (1 - np.clip(px[..., :3] * 1.4, 0, 1))


MAKERS = {"lamp-off": lambda: lamp("off"), "lamp-green": lambda: lamp("green"), "lamp-amber": lambda: lamp("amber"),
          "annunciator-amber": lambda: annunciator("amber"), "annunciator-red": lambda: annunciator("red")}

for picture_name in wanted(list(MAKERS)):
    MAKERS[picture_name]()
