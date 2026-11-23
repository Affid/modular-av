"""The voice panel's keys: square rubber keycaps poking up through holes in the steel plate, the way a rubber keypad
sits under a panel. Each picture is the hole, its key and the plate round the hole (2 CSS px round a square key,
1 px round an arrow; the plate's paint fades out there while its wear and grime stay: fingers rub the paint off
round a key), cut in nine by the stylesheet and drawn that far outside the button's box.

The hole: its top edge chamfered steeply (the paint worn off the lip to bare steel, so it catches the lamp), then
straight walls down into the dark. The key: a skirt in the hole with a dark gap round it, a shoulder rounded on a
quarter circle (lit at the upper left, shaded at the lower right) and a face that swells a little; the rubber matte
and grained, polished smooth and darker in the middle where fingers land, grey with dust in its corners. A key is
seen from a close eye, not straight on: straight on, a sunk key's walls could not show.

  key-rest          standing about 2 px proud of the plate
  key-led-red       the same with its LED on the face's top edge, unlit, red glass (mute and deafen); only the
                    keys that latch carry an LED, since the others never stay down
  key-led-green     the same, green glass (camera)
  key-led-amber     the same, amber glass (screen share)
  key-down-red      latched down: its face sunk about 2.5 px under the plate's, its shoulder down in the hole's
                    shade, its LED lit red (muted, deafened)
  key-down-green    the same, lit green (camera on)
  key-down-amber    the same, lit amber (sharing the screen)
  key-leave         a red rubber key standing proud: hang up (in the dock's meaning, leave is always red)
  arrow             the narrow key that opens the microphone's or the camera's menu (20 by 32 CSS px): a narrow
                    version of the square key, the same rubber in the same family of hole, its face crowned and lit
                    from the upper left; its picture reaches 1 px outside the box, so the row of nine keys still
                    fits the panel
  arrow-down        the same held down (or its menu open): sunk in its hole, the walls showing on every side

Every picture also has a "-hover" one: the same render with the key's own pixels lifted (a mask of the key alone),
so the pointer lights the key and not the plate's ring round it. The arrows' lit, held and held-lit pictures have
their face's highlight compressed (luminance over 0.5 kept at 35%), so the chevron drawn over the face keeps its
contrast and its clear space.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402,F401  (first: the paths)

import numpy as np  # noqa: E402

from paint import _math, _mix, _range, material, painted, plain  # noqa: E402
from parts import (PLATE, c, glow_light, mask_of, pillow, ring_mesh, rounded, rrect_mask, setup, slab,  # noqa: E402
                   wanted)
from pixels import load_rgba, save_rgba, soften  # noqa: E402
from stage import out, render  # noqa: E402

H = 32.0           # every key's height, CSS px
# The square key and the narrow arrow (CSS px): how far the picture reaches outside the box; in from the box, where
# the plate's flat top starts to roll over, its lip and the chamfer's foot; the chamfer's depth; the dark gap round
# the skirt; the shoulder's radius and what a pressed key's shoulder adds; the top's height at rest and down; the
# skirt's corner; the face's swell; the hover's lift and its added light.
SQUARE = dict(W=32.0, out=2.0, flat=0.55, lip=0.9, chamfer=2.1, ch_depth=1.7, gap=0.9, shoulder=2.5,
              pressed_shoulder=0.9, top=1.5, top_down=-3.9, corner=2.4, swell=0.55, lift=0.42, light=0.025)
# the arrow: the square key made narrow, in a shallower hole, so its face stays about 14 px wide for the chevron;
# lifted less on hover (its flatter face catches more of the room)
ARROW = dict(W=20.0, out=1.0, flat=0.15, lip=0.45, chamfer=1.1, ch_depth=1.2, gap=0.45, shoulder=1.3,
             pressed_shoulder=0.4, top=1.1, top_down=-2.4, corner=1.8, swell=0.5, lift=0.42 * 0.75, light=0.02)
RUBBER = (0.024, 0.024, 0.023)
RED_RUBBER = (0.16, 0.014, 0.010)
DOWN_SHADE = 0.55   # a key down in the hole's shade takes less of the lamp: its rubber darkened (a liberty)
LED_COLOURS = {"red": (1.0, 0.035, 0.015), "green": (0.06, 1.0, 0.16), "amber": (1.0, 0.36, 0.01)}
# the lit lens's colour in the picture (sRGB), saturated: AgX turns a bright saturated emission pale
LED_SRGB = {"red": (1.0, 0.13, 0.07), "green": (0.22, 1.0, 0.30), "amber": (1.0, 0.62, 0.08)}
EYE = 28.0          # the eye's distance from the plate, CSS px: close, so a key down in its hole shows the walls
KNEE, KNEE_KEEP = 0.5, 0.35


def spec(name):
    """What a picture's key is: its shape, whether it is down, its LED and whether that is lit, its rubber."""
    narrow = name.startswith("arrow")
    pressed = "-down" in name
    led = next((colour for colour in LED_COLOURS if name.endswith(f"-{colour}")), None)
    rubber = RED_RUBBER if name == "key-leave" else RUBBER
    if pressed:
        rubber = tuple(v * DOWN_SHADE for v in rubber)
    shape = ARROW if narrow else SQUARE
    return dict(shape, name=name, narrow=narrow, pressed=pressed, led=led, lit=pressed and led is not None,
                rubber=rubber, top=shape["top_down"] if pressed else shape["top"],
                shoulder=shape["shoulder"] + (shape["pressed_shoulder"] if pressed else 0.0))


def plate(s):
    """The plate round the hole: worn bare toward the lip, a chamfer, straight walls, a dark floor far down."""
    hw, hh = s["W"] / 2, H / 2
    steel = painted("plate", PLATE, span=c(300), chip=2.2, edge=c(0.55), grime=0.9, gloss=0.45, rust=0.4)

    def ring(inset, r):
        return rounded(hw - inset, hh - inset, max(r, 0.4))

    lip, ch, chd = s["lip"], s["chamfer"], s["ch_depth"]
    rings = [(ring(-s["out"] - 0.5, 5.0), 0.0, 0.0), (ring(-min(1.2, s["out"]), 4.6), 0.0, 0.04),
             (ring(0.0, 4.2), 0.0, 0.14), (ring(s["flat"], 3.8), 0.0, 0.36), (ring(lip, 3.6), -0.12, 0.5),
             (ring(ch - 0.25, 2.9), -chd + 0.15, 0.36), (ring(ch, 2.8), -chd - 0.3, 0.15),
             (ring(ch, 2.8), -12.0, 0.0)]
    ring_mesh("plate", rings, steel)
    slab("floor", hw + 2, hh + 2, 2, -13.0, -12.0, plain("floor", (0.012, 0.011, 0.010), rough=0.95), bevel=0.1)


def rubber(name, colour):
    """Moulded rubber: a matte grain; polished smoother and a shade darker in the middle of the face where
    fingers land, greyed with dust toward the corners."""
    mat, nodes, links = material(name)
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.4
    tc = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 22.0
    noise.inputs["Detail"].default_value = 6.0
    noise.inputs["Roughness"].default_value = 0.65
    links.new(tc.outputs["Object"], noise.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.004
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    # wear: 1 in the middle of the face, 0 at its rim (an ellipse fitted to the face)
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(tc.outputs["Object"], sep.inputs[0])
    rx = _math(nodes, links, "DIVIDE", sep.outputs["X"], c(7.0))
    ry = _math(nodes, links, "DIVIDE", sep.outputs["Y"], c(8.5))
    d = _math(nodes, links, "SQRT", _math(nodes, links, "ADD", _math(nodes, links, "MULTIPLY", rx, rx),
                                          _math(nodes, links, "MULTIPLY", ry, ry)))
    # the polish: its edge broken by a coarser noise, so it is a rubbed patch, not a drawn disc
    blot = nodes.new("ShaderNodeTexNoise")
    blot.inputs["Scale"].default_value = 4.0
    blot.inputs["Detail"].default_value = 3.0
    links.new(tc.outputs["Object"], blot.inputs["Vector"])
    d_broken = _math(nodes, links, "ADD", d, _math(nodes, links, "MULTIPLY", _math(nodes, links, "SUBTRACT",
                                                                                     blot.outputs["Fac"], 0.5), 0.7))
    worn = _range(nodes, links, d_broken, 0.25, 0.75, 1.0, 0.0)
    # the dust: in the corners, its edge broken by the grain
    corner = _math(nodes, links, "MAXIMUM", _math(nodes, links, "ABSOLUTE", rx), _math(nodes, links, "ABSOLUTE", ry))
    dust = _range(nodes, links, _math(nodes, links, "ADD", _math(nodes, links, "MULTIPLY", d, 0.75),
                                      _math(nodes, links, "MULTIPLY", noise.outputs["Fac"], 0.5)), 1.05, 1.35)
    dust = _math(nodes, links, "MULTIPLY", dust, _range(nodes, links, corner, 0.6, 1.0))
    dark = tuple(v * 0.97 for v in colour)
    dusty = (colour[0] + 0.05, colour[1] + 0.045, colour[2] + 0.036)
    base = _mix(nodes, links, worn, (*colour, 1), (*dark, 1))
    base = _mix(nodes, links, _math(nodes, links, "MULTIPLY", dust, 0.75), base, (*dusty, 1))
    links.new(base, bsdf.inputs["Base Color"])
    links.new(_mix(nodes, links, worn, 0.5, 0.4), bsdf.inputs["Roughness"])
    return mat


def key(s):
    """A skirt in the hole, a shoulder rounded on a quarter circle, a face that swells (a pillow, so the light runs
    across it from the upper left)."""
    hw, hh = s["W"] / 2, H / 2
    mat = rubber("key", s["rubber"])
    z, r0, shoulder = s["top"], s["corner"], s["shoulder"]
    base = s["chamfer"] + s["gap"]
    rings = [(rounded(hw - base, hh - base, r0), z - 9.0, 0.0), (rounded(hw - base, hh - base, r0), z - 2.6, 0.0)]
    for k in range(1, 9):
        a = math.radians(90 * k / 8)
        inset = base + shoulder * (1 - math.cos(a))
        rings.append((rounded(hw - inset, hh - inset, max(r0 - (inset - base) * 0.5, 1.2)),
                      z - 2.6 + shoulder * math.sin(a), 0.0))
    face = base + shoulder
    obj = ring_mesh("key", rings, mat)
    pillow("face", hw - face, hh - face, z - 2.6 + shoulder, s["swell"], mat)
    return obj


def led(s):
    """The LED on the face's top edge: a lens 6 by 3 px in a black moulded rim; glass that shows its colour unlit
    (a clear coat catching a glint of the room), lit with a hot middle and its light on the rubber round it."""
    colour = LED_COLOURS[s["led"]]
    y = H / 2 - (s["chamfer"] + s["gap"] + s["shoulder"]) - 1.4
    # on the face's edge: the face's height there (its swell is small at the edge)
    z = s["top"] - 2.6 + s["shoulder"] + 0.25
    rim = slab("led-rim", 3.7, 2.2, 1.1, z - 0.6, z + 0.25, plain("led-rim", (0.008, 0.008, 0.008), rough=0.5),
               bevel=0.3)
    rim.location = (0, c(y), 0)
    if s["lit"]:
        lens = plain("led", tuple(v * 0.25 for v in colour), rough=0.25, emission=colour, strength=0.9)
        core = plain("led-core", (1, 1, 1), rough=0.3, emission=tuple(min(1, v + 0.35) for v in colour), strength=2.2)
        slab("led-core", 1.4, 0.55, 0.5, z + 0.1, z + 0.5, core, bevel=0.2).location = (0, c(y), 0)
        glow_light("led-glow", (0, y), z + 2.0, colour, 0.35, radius=c(1.5))
    else:
        lens = plain("led", tuple(v * 0.06 + 0.004 for v in colour), rough=0.08)
        bsdf = lens.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Coat Weight"].default_value = 1.0
        bsdf.inputs["Coat Roughness"].default_value = 0.05
    slab("led", 3.0, 1.5, 0.8, z - 0.4, z + 0.45, lens, bevel=0.35).location = (0, c(y), 0)


def close_up(scene, pw, ph):
    """The key seen from in front of it, close: the plate's face fills the picture exactly as a straight-on view
    would, while what stands proud looks a little larger and what is sunk a little smaller, the hole's walls
    showing round a key that is down."""
    cam = scene.camera
    cam.data.type = "PERSP"
    span = ph if ph > pw else pw
    cam.data.sensor_fit = "VERTICAL" if ph > pw else "HORIZONTAL"
    cam.data.angle = 2 * math.atan((span / 2) / EYE)
    cam.data.clip_start = 0.01
    cam.location = (0, 0, c(EYE))


def led_colour(px, scene, s, density):
    """The lit lens coloured in the picture's pixels: its saturated colour by the rendered brightness, a small hot
    core near white, and its light on the rubber round it (1 px)."""
    lens = mask_of(scene, [o for o in scene.objects if o.name.startswith("led") and not o.name.startswith("led-rim")],
                   out(f"{s['name']}-lens"))
    col = np.array(LED_SRGB[s["led"]], dtype=np.float32)
    lum = px[..., 0] * 0.2126 + px[..., 1] * 0.7152 + px[..., 2] * 0.0722
    v = np.clip(lum * 1.5, 0.0, 1.0)
    core = np.clip((lum - 0.9) / 0.08, 0.0, 1.0) * 0.6
    lit = col[None, None, :] * v[..., None]
    lit = lit + (1 - lit) * core[..., None]
    px[..., :3] = px[..., :3] * (1 - lens[..., None]) + lit * lens[..., None]
    glow = np.clip(soften(lens, max(1, int(round(0.8 * density)))) * 1.6, 0, 1) * (1 - lens) * 0.55
    px[..., :3] = 1 - (1 - px[..., :3]) * (1 - col[None, None, :] * glow[..., None])
    return px


def fade_plate(px, s, pw, ph):
    """The plate's paint fades out over the picture's band outside the lip; its chips and grime stay a little
    longer (what differs from the plate's own paint round the hole)."""
    hw, hh, o = s["W"] / 2, H / 2, s["out"]
    near = rrect_mask(px.shape, pw, ph, hw - s["lip"] + 0.4, hh - s["lip"] + 0.4, 4.0)
    far = rrect_mask(px.shape, pw, ph, hw + o - 0.3, hh + o - 0.3, 5.5)
    lum = px[..., :3].mean(axis=2)
    band = (far > 0.5) & (near < 0.5) & (px[..., 3] > 0.5)
    ground = float(np.median(lum[band]))  # the plate's own paint round the hole, unworn mostly
    differs = np.clip(np.abs(lum - ground) / 0.08, 0.0, 1.0)
    fade = near + (1 - near) * far * (0.3 + 0.7 * differs) * 0.85
    px[..., 3] *= np.clip(fade, 0.0, 1.0)
    return px


def knee(path):
    """The picture at `path` with each pixel's luminance above KNEE compressed to KNEE_KEEP of itself, its hue kept
    (r, g, b scaled together), its alpha untouched: on the picture's own 8-bit values, as it is stored."""
    px = load_rgba(path).astype(np.float64)
    v = np.round(px[..., :3] * 255.0)
    lum = (v[..., 0] * 0.2126 + v[..., 1] * 0.7152 + v[..., 2] * 0.0722) / 255.0
    k = np.where(lum > KNEE, (KNEE + (lum - KNEE) * KNEE_KEEP) / np.maximum(lum, 1e-6), 1.0)
    px[..., :3] = np.clip(np.rint(v * k[..., None]), 0, 255) / 255.0
    save_rgba(px.astype(np.float32), path)


def make(name):
    s = spec(name)
    pw, ph = s["W"] + 2 * s["out"], H + 2 * s["out"]
    scene, density = setup("arrow" if s["narrow"] else "key", pw, ph, samples=300)
    close_up(scene, pw, ph)
    plate(s)
    cap = key(s)
    if s["led"]:
        led(s)
    path = out(name)
    render(scene, path)
    px = load_rgba(path)
    if s["lit"]:
        px = led_colour(px, scene, s, density)
    px = fade_plate(px, s, pw, ph)
    save_rgba(px, path)
    m = mask_of(scene, [cap] + [o for o in scene.objects if o.name.startswith(("led", "face"))], out(f"{name}-mask"))
    hover = px.copy()
    hover[..., :3] = np.clip(px[..., :3] * (1 + s["lift"] * m[..., None]) + s["light"] * m[..., None], 0, 1)
    save_rgba(hover, out(f"{name}-hover"))
    if s["narrow"]:  # the arrow's lit and held faces dimmed, so the chevron over them keeps its contrast
        knee(out(f"{name}-hover"))
        if s["pressed"]:
            knee(path)


KEYS = ["key-rest", "key-led-red", "key-led-green", "key-led-amber", "key-down-red", "key-down-green",
        "key-down-amber", "key-leave", "arrow", "arrow-down"]

for key_name in KEYS:
    if wanted([key_name, f"{key_name}-hover"]):
        make(key_name)
