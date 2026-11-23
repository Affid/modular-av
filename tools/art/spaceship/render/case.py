"""A camera's monitor case: a deep case of yellow painted steel round the tube, its front sloping in to a rubber
seal round the glass, and below the picture a chin with the microphone's grille (left), the TX lamp (right) and
the readout the name shows in between. Its right side is a flat strip: on the viewer's own monitor the level's
window is set in it (`slot`), on everyone else's it is plain. Four screws hold the front on.

All places are tile units (x right, y down, the camera's picture 0..1000 by 0..562.5); depths are scene units,
toward the viewer positive, the case's front face at 0.
"""
import math

import bpy

import stage
import wear
from measures import METER, READOUT, REACH, TILE_W, place, units
from monitor_bracket import FOOT_WEAR
from paint import glass, painted, plain

# The case's outline, its front face (where it gives way to the bezel's slope) and the bezel's inner lip over
# the picture's edge: (x0, y0, x1, y1, corner radius). The case reaches 9 units short of the frame layer's right.
RIGHT = TILE_W + REACH["right"] * TILE_W - 9
OUTER = (-60, -56, RIGHT, 720, 34)
FACE = (-31, -30, 1006, 594, 46)
LIP = (10, 10, 990, 552.5, 56)
STRIP = (1009, RIGHT - 13)  # the flat strip on the right, across
BACK_Z = -0.25
CHIN_Y = (594 + 720) / 2  # the chin's middle line
LAMP = (944, CHIN_Y)
GRILLE = (56, CHIN_Y)
SCREWS = ((-34, 700), (RIGHT - 22, 700), (-34, -34), (RIGHT - 22, -34))
# The readout in the chin: its black bezel, and inside it the window the name shows in. The stylesheet puts the
# name's box exactly on the window.
WINDOW_OUT = (*(READOUT["outer"][k] for k in ("left", "top", "right", "bottom")), 9)
WINDOW_IN = (*(READOUT["window"][k] for k in ("left", "top", "right", "bottom")), 4)
# The level's window in the right strip of the viewer's own monitor: the strip less 5 units each side, at most 30
# wide, from the meter's top to its bottom (the stylesheet lays the meter's segments in it).
SLOT_HALF = min(15.0, (STRIP[1] - STRIP[0]) / 2 - 5)
SLOT_Y = (METER["top"], METER["bottom"])
SLOT_X = METER["x"]

# Safety yellow gone dull with years in a hold (linear RGB, before the photograph's light).
YELLOW = (0.5, 0.29, 0.008)
# The TX lamp's jewel: green, not red: the dock's buttons are red when muted, and red light could read as muted.
JEWEL_TINT = (0.25, 0.9, 0.35)  # unlit
JEWEL_GLOW = (0.06, 0.55, 0.12)  # lit
LAMP_LIGHT = (0.22, 1.0, 0.38)  # the light it throws: on yellow paint a greener green reads lime, not olive
LAMP_THROW = (0.35, 1.0, 0.5)  # its gleam on the readout's glass
LAMP_ENERGY = 20.0


def ring(box, inset, z, k=10):
    """A rounded rectangle `inset` units inside `box`, at depth z, as stage.loft takes it."""
    x0, y0, x1, y1, r = box
    return (stage.rrect(x0 + inset, y0 + inset, x1 - inset, y1 - inset, max(r - inset, 2), k), z)


def blend_box(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(5))


def _cut(obj, name, x0, y0, x1, y1):
    """An opening through the case's front (tile box), cut after smoothing so its edge stays sharp."""
    ax, ay = place(x0, y0)
    bx, by = place(x1, y1)
    bpy.ops.mesh.primitive_cube_add(size=1, location=((ax + bx) / 2, (ay + by) / 2, 0))
    cutter = bpy.context.active_object
    cutter.scale = (bx - ax, ay - by, 0.2)
    cutter.hide_render = True
    cut = obj.modifiers.new(name, "BOOLEAN")
    cut.operation, cut.solver, cut.object = "DIFFERENCE", "EXACT", cutter


def case_mesh(mat, slot):
    """The case: its back, its rounded rim, the flat front, the bezel sloping in to the lip and on back into the
    case as the tube's funnel. Openings for the readout and, on the viewer's own (`slot`), the level's window."""
    rings = [
        ring(OUTER, 0, BACK_Z),
        ring(OUTER, 0, -0.1),
        ring(OUTER, 3.0, -0.035),
        ring(OUTER, 8.0, -0.008),
        ring(OUTER, 13.0, 0.0),
        ring(FACE, -4.0, 0.0),
        ring(FACE, 0.0, -0.012),
        ring(blend_box(FACE, LIP, 0.25), 0, -0.1),
        ring(blend_box(FACE, LIP, 0.75), 0, -0.27),
        ring(LIP, -2.0, -0.33),
        ring(LIP, -2.0, -1.6),
    ]
    obj = stage.loft("case", rings)
    obj.data.materials.append(mat)
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = sub.render_levels = 2
    x0, y0, x1, y1, _ = WINDOW_OUT
    _cut(obj, "opening", x0 + 1, y0 + 1, x1 - 1, y1 - 1)
    if slot:
        _cut(obj, "slot", SLOT_X - SLOT_HALF - 4, SLOT_Y[0] - 4, SLOT_X + SLOT_HALF + 4, SLOT_Y[1] + 4)
    return obj


def gasket():
    """The rubber seal round the tube, where the bezel meets the glass: black, a little shiny where it bulges."""
    rubber = plain("rubber", (0.03, 0.03, 0.028), rough=0.6)
    rings = [ring(LIP, -2.5, -0.34), ring(LIP, -1.2, -0.315), ring(LIP, 1.2, -0.315), ring(LIP, 2.6, -0.35),
             ring(LIP, 3.0, -1.6)]
    obj = stage.loft("gasket", rings)
    obj.data.materials.append(rubber)
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = sub.render_levels = 2
    return obj


def disc(name, at, radius, z, depth, mat, segs=48):
    """A short round cylinder standing out of the front at `at` (radius in tile units), its edge bevelled."""
    x, y = place(*at)
    bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=units(radius), depth=depth, location=(x, y, z))
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width, mod.segments = min(depth * 0.3, units(radius) * 0.3), 3
    return obj


def lamp(lit):
    """The TX lamp: a bare-steel bezel with a domed green jewel. Lit, the bulb behind shines through the jewel,
    and its light comes out through the whole dome onto the paint round the bezel (the dome and the bulb let it
    pass; the source is the dome's size and sits in it)."""
    r_bezel, r_dome, r_bulb = 19, 13, 8
    steel = plain("bezel-steel", (0.5, 0.5, 0.48), rough=0.28, metallic=1.0)
    disc("lamp-bezel", LAMP, r_bezel, 0.03, 0.06, steel)
    if lit:
        dark = tuple(c * 0.08 for c in JEWEL_GLOW)
        jewel = plain("jewel-lit", dark, rough=0.12, emission=JEWEL_GLOW, strength=1.1)
    else:
        jewel = glass("jewel", tint=JEWEL_TINT, rough=0.05, ior=1.55)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=units(r_dome), segments=40, ring_count=20,
                                         location=(*place(*LAMP), 0.04))
    dome = bpy.context.active_object
    dome.name = "lamp-dome"
    dome.scale = (1, 1, 0.55)
    dome.data.materials.append(jewel)
    for p in dome.data.polygons:
        p.use_smooth = True
    bulb_mat = plain("bulb", (0.05, 0.03, 0.01), rough=0.6,
                     emission=JEWEL_GLOW if lit else None, strength=60.0 if lit else 0.0)
    bulb = disc("bulb", LAMP, r_bulb, 0.0, 0.03, bulb_mat)
    if lit:
        _lamp_light(r_dome, (dome, bulb))


def _lamp_light(r_dome, glowing):
    data = bpy.data.lights.new("tx", "POINT")
    data.energy = LAMP_ENERGY
    data.color, data.shadow_soft_size = LAMP_LIGHT, units(r_dome)
    light = stage.link(bpy.data.objects.new("tx", data))
    light.location = (*place(*LAMP), 0.09)
    for obj in glowing:
        obj.visible_shadow = False
    # the jewel stands proud of its bezel and glows all round: the bezel doesn't shade the paint from it (light
    # linking: only the case itself blocks this light)
    block = bpy.data.collections.new("tx-blockers")
    bpy.context.scene.collection.children.link(block)
    block.objects.link(bpy.data.objects["case"])
    light.light_linking.blocker_collection = block


def grille(case_mat):
    """The microphone behind a round grille: a recessed plate, a ring of holes round one in the middle."""
    dark = plain("hole", (0.01, 0.01, 0.01), rough=0.9)
    plate = disc("grille-plate", GRILLE, 22, -0.012, 0.02, case_mat)
    plate.location.z = -0.004
    pts = [(0, 0)]
    for ring_r, count in ((7.5, 6), (14.5, 12)):
        for i in range(count):
            a = 2 * math.pi * i / count + (0.26 if count == 12 else 0)
            pts.append((ring_r * math.cos(a), ring_r * math.sin(a)))
    for dx, dy in pts:
        disc("hole", (GRILLE[0] + dx, GRILLE[1] + dy), 2.3, 0.004, 0.012, dark, segs=16)


def screws():
    """The four screws holding the front on: steel heads, cross slots."""
    steel = plain("screw-steel", (0.45, 0.45, 0.44), rough=0.35, metallic=1.0)
    slot = plain("slot", (0.02, 0.02, 0.02), rough=0.8)
    for at in SCREWS:
        disc("screw", at, 6.5, 0.008, 0.02, steel, segs=32)
        x, y = place(*at)
        for turn in (0.35, 0.35 + math.pi / 2):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, 0.019))
            s = bpy.context.active_object
            s.scale = (units(9), units(1.6), 0.006)
            s.rotation_euler.z = turn
            s.data.materials.append(slot)


def case_material():
    """The case's paint: chipped at its standing edges to bare steel worn bright by hands (not rusted dull), a dark
    broken rim of grime round each chip; then the wear of use (wear.py)."""
    mat = painted("case", YELLOW, span=6.0, chip=1.55, edge=0.035, gloss=0.55, offset=(0.21, 0.4), steel=0.2,
                  steel_rough=0.5, broken=0.8)
    wear.wear_of_use(mat, OUTER, SCREWS, FOOT_WEAR)
    wear.thumb_rub(mat)
    return mat
