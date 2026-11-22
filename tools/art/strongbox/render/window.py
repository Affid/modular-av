"""One camera's window in the box's boards: a forged iron strap round the picture with domed rivets, and over its
top edge one of three locks, its keyhole cut through the plate and the strap, and the box's dark or its lamp
behind the hole. Pictures of scratches (where picks slipped, where a bar went in) are computed from seeds."""
import math
import random

import bpy
import numpy as np
from mathutils import Vector, noise

import materials
import shapes
from measures import KEYHOLE, STRAP, TILE_H, TILE_W, place

CX, CY = place(TILE_W / 2, TILE_H / 2)
BAND_OUT = float(STRAP["out"])  # how far the strap reaches out past the picture's edge (tile units)
BAND_IN = float(STRAP["in"])  # how far it lies over the picture's edge
BAND_H = 0.2  # its thickness, scene units
U = 100.0  # tile units to a scene unit
AMBER = (1.0, 0.42, 0.11)


def strap_profile(width, height, steps=36):
    """A forged flat bar, outer edge to inner: a rounded shoulder, a face, and a broad bevel (the inner 40%) down
    to the picture, which the lamp inside lights."""
    pts = [(0.0, 0.0)]
    for k in range(steps + 1):
        t = k / steps
        s = min(1.0, t / 0.12, (1.0 - t) / 0.42)
        pts.append((t * width, height * math.sin(max(0.0, s) * math.pi / 2) ** 0.7))
    pts.append((width, 0.0))
    return pts


def forge(obj, loops_count, seed, edge_amount=0.05, thick=0.22):
    """Hand-forged: the outer and inner edges wander in and out on their own, and the bar is thicker in places."""
    mesh = obj.data
    n = len(mesh.vertices) // loops_count
    off_out = Vector((seed * 3.1, seed * 1.7, 0.0))
    off_in = Vector((seed * 5.3, seed * 2.9, 4.0))
    off_t = Vector((seed * 7.7, seed * 0.3, 9.0))
    for i, v in enumerate(mesh.vertices):
        t = (i // n) / max(1, loops_count - 1)
        p = Vector((v.co.x * 0.9, v.co.y * 0.9, 0.0))
        dx, dy = v.co.x - CX, v.co.y - CY
        # Outward, roughly: along x on the sides, along y on top and bottom.
        side = abs(dx) / 5.36 > abs(dy) / 3.17
        out_dir = Vector((math.copysign(1, dx), 0, 0)) if side else Vector((0, math.copysign(1, dy), 0))
        wander = (1 - t) * noise.noise(p + off_out) + t * noise.noise(p * 1.3 + off_in)
        v.co += out_dir * wander * edge_amount
        v.co.z *= 1.0 + thick * noise.noise(p * 0.7 + off_t)
    mesh.update()


def strap(mat, seed):
    """The strap round the picture, swept from its section and forged."""
    hw = (TILE_W / 2 + BAND_OUT) / U
    hh = (TILE_H / 2 + BAND_OUT) / U
    section = strap_profile((BAND_OUT + BAND_IN) / U, BAND_H)
    obj = shapes.ring("strap", CX, CY, hw, hh, 0.06, section, per_side=140, per_corner=8,
                      wobble=shapes.wobble_fn(seed, 0.02, 2.2))
    forge(obj, len(section), seed)
    obj.data.materials.append(mat)
    return obj


def rivets(mat, seed):
    """Eleven domed rivets along the strap's middle line, each a little off its place and size."""
    mid = (BAND_IN - BAND_OUT) / 2  # the strap's middle line, tile units from the picture's edge
    right, bottom = TILE_W - mid, TILE_H - mid
    spots = [(mid, mid), (right, mid), (mid, bottom), (right, bottom), (250, mid), (750, mid), (250, bottom),
             (500, bottom), (750, bottom), (mid, TILE_H / 2), (right, TILE_H / 2)]
    rng = random.Random(seed)
    for k, (x, y) in enumerate(spots):
        r = (16.5 + rng.uniform(-1.5, 1.5)) / U
        at = place(x + rng.uniform(-3, 3), y + rng.uniform(-2, 2))
        shapes.dome(f"rivet{k}", at, r, 0.075 + rng.uniform(-0.01, 0.01), mat, z=BAND_H - 0.03,
                    squash=rng.uniform(0.92, 1.05))


def densify(pts, step):
    """More points along a closed outline's straight runs, so a section swept from it stays even."""
    dense = []
    for p, q in zip(pts, pts[1:] + pts[:1]):
        n = max(1, int(math.hypot(q[0] - p[0], q[1] - p[1]) / step))
        dense += [(p[0] + (q[0] - p[0]) * j / n, p[1] + (q[1] - p[1]) * j / n) for j in range(n)]
    return dense


def shield_outline(cx, top, mid, bottom, hw, corner=0.1, count=30):
    """The escutcheon's outline (scene units, y up): a heater shield, a straight top with its corners cut off,
    straight sides, and two curves meeting in a blunt point below."""
    pts = [(cx + hw - corner, top), (cx - hw + corner, top), (cx - hw, top - corner)]
    for k in range(count + 1):
        t = k / count
        pts.append((cx - hw * (1 - t ** 1.8), mid - (mid - bottom) * t))
    for k in range(count - 1, -1, -1):
        t = k / count
        pts.append((cx + hw * (1 - t ** 1.8), mid - (mid - bottom) * t))
    pts.append((cx + hw, top - corner))
    return densify(pts, 0.05)


def chamfered(depth, height, chamfer=0.05, steps=24):
    """A forged plate's section: a straight chamfer at the edge, then a face that swells a little."""
    pts = [(0.0, 0.0), (chamfer, height * 0.78)]
    for k in range(1, steps + 1):
        t = k / steps
        pts.append((chamfer + t * (depth - chamfer), height * (0.78 + 0.22 * math.sin(t * math.pi / 2))))
    return pts


def keyhole(cx, cy, r, slot_w0, slot_w1, length, count=56):
    """A keyhole outline (scene units, y up), the same number of points at any size: a round and a slot."""
    half = math.asin(min(0.95, slot_w0 / r))
    a0, a1 = -math.pi / 2 + half, 3 * math.pi / 2 - half
    pts = [(cx + r * math.cos(a0 + (a1 - a0) * k / (count - 5)), cy + r * math.sin(a0 + (a1 - a0) * k / (count - 5)))
           for k in range(count - 4)]
    sy = cy - r * math.cos(half)
    pts += [(cx - slot_w0, sy - 0.01), (cx - slot_w1, cy - length), (cx + slot_w1, cy - length),
            (cx + slot_w0, sy - 0.01)]
    return pts


def _stroke(img, x0, y0, x1, y1, w, v, taper=0.6, soft=0.35):
    """A bright stroke into a picture of scratches, fading at both ends."""
    size = img.shape[0]
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
    for k in range(n):
        t = k / max(1, n - 1)
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        fade = math.sin(t * math.pi) ** taper
        xi, yi = int(x), int(y)
        for dy in range(-w, w + 1):
            for dx in range(-w, w + 1):
                if 0 <= xi + dx < size and 0 <= yi + dy < size:
                    value = v * fade * (1 - soft * (abs(dx) + abs(dy)) / (w + 1))
                    img[yi + dy, xi + dx] = max(img[yi + dy, xi + dx], value)


def _save_marks(img, path):
    from pixels import save_rgba

    size = img.shape[0]
    rgba = np.zeros((size, size, 4), dtype=np.float32)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = img[::-1]
    rgba[..., 3] = 1
    save_rgba(rgba, path)
    return path


def pick_marks(path, seed, size_px=512):
    """Scratches round a keyhole: short bright strokes, most running out from the hole's edge where a pick
    slipped, a few across. White is bare metal."""
    rng = random.Random(seed)
    img = np.zeros((size_px, size_px), dtype=np.float32)
    c = size_px / 2
    for _ in range(11):
        # Mostly below and beside the slot, where a pick's handle swings; a few above the round.
        a = rng.gauss(math.pi / 2, 0.9) if rng.random() < 0.75 else rng.uniform(0, 2 * math.pi)
        start = rng.uniform(0.07, 0.16) * size_px
        length = rng.uniform(0.09, 0.2) * size_px
        bend = rng.uniform(-0.6, 0.6)
        x0, y0 = c + math.cos(a) * start, c + math.sin(a) * start * 1.15
        _stroke(img, x0, y0, x0 + math.cos(a + bend) * length, y0 + math.sin(a + bend) * length, 1,
                rng.uniform(0.7, 1.0))
    for _ in range(2):
        x0, y0 = rng.uniform(0.3, 0.7) * size_px, rng.uniform(0.25, 0.75) * size_px
        a = rng.uniform(0, math.pi)
        length = rng.uniform(0.05, 0.12) * size_px
        _stroke(img, x0, y0, x0 + math.cos(a) * length, y0 + math.sin(a) * length, 1, rng.uniform(0.5, 0.8))
    return _save_marks(img, path)


def pry_marks(path, seed, size_px=512):
    """Where a bar was driven under an edge and levered: short wide gouges fanning in from one spot on the edge
    (the top of the square), and a few skids along it where the bar slipped."""
    rng = random.Random(seed)
    img = np.zeros((size_px, size_px), dtype=np.float32)
    c = size_px / 2
    edge = c - 0.02 * size_px
    root_x = c + rng.uniform(-0.03, 0.03) * size_px
    for _ in range(9):
        a = math.pi / 2 + rng.uniform(-0.9, 0.9)
        x0 = root_x + rng.uniform(-0.08, 0.08) * size_px
        y0 = edge + rng.uniform(-0.01, 0.02) * size_px
        length = rng.uniform(0.04, 0.12) * size_px
        _stroke(img, x0, y0, x0 + math.cos(a) * length, y0 + math.sin(a) * length, rng.choice((3, 4, 5)),
                rng.uniform(0.6, 1.0), taper=0.5, soft=0.0)
    for _ in range(4):
        x0 = c + rng.uniform(-0.25, 0.1) * size_px
        y0 = edge + rng.uniform(0.0, 0.03) * size_px
        _stroke(img, x0, y0, x0 + rng.uniform(0.06, 0.18) * size_px, y0 + rng.uniform(-0.015, 0.015) * size_px, 2,
                rng.uniform(0.5, 0.8), taper=0.5, soft=0.0)
    return _save_marks(img, path)


def lock_plate(lock, ex, ey, metal, seed):
    """The lock's plate over the window's top edge, the keyhole in the same place in each kind, so the lamp shows
    through all three alike: a forged heater shield, chamfered; a domed rose with a turned bead round its rim; or
    a wide lock case with clipped corners, which carries a slide in two guides."""
    if lock == "round":
        outline = shapes.circle_points(ex, ey - 0.02, 0.6, 96)[:-1]
        section = [(0.0, 0.0), (0.02, 0.06), (0.045, 0.095), (0.07, 0.1), (0.095, 0.085), (0.12, 0.08),
                   (0.2, 0.1), (0.3, 0.125), (0.45, 0.14), (0.6, 0.145)]
        return shapes.plate("rose", outline, section, metal, z0=0.15, wobble=shapes.wobble_fn(seed + 1, 0.006, 3.0))
    if lock == "slide":
        x0, y0 = place(390, -50)
        x1, y1 = place(610, 54)
        c = 0.08
        outline = [(x1 - c, y0), (x0 + c, y0), (x0, y0 - c), (x0, y1 + c), (x0 + c, y1), (x1 - c, y1),
                   (x1, y1 + c), (x1, y0 - c)]
        return shapes.plate("case", densify(outline, 0.04), chamfered(0.5, 0.1, chamfer=0.04), metal, z0=0.17,
                            wobble=shapes.wobble_fn(seed + 1, 0.006, 3.0))
    outline = shield_outline(ex, ey + 0.62, ey - 0.3, ey - 0.8, 0.56)
    return shapes.plate("escutcheon", outline, chamfered(0.6, 0.12), metal, z0=0.17,
                        wobble=shapes.wobble_fn(seed + 1, 0.008, 3.0))


def plate_fixings(lock, ex, ey, metal):
    """What fixes each plate: the shield's two rivets, the rose's four nails, the case's four corner rivets."""
    if lock == "shield":
        for k, y in enumerate((-52, 58)):
            shapes.dome(f"esc-rivet{k}", place(500 + (k * 2 - 1) * 1.5, y), 0.07, 0.04, metal, z=0.28)
    elif lock == "round":
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            shapes.dome(f"rose-nail{k}", (ex + 0.5 * math.cos(a), ey - 0.02 + 0.5 * math.sin(a)), 0.05, 0.03, metal,
                        z=0.25)
    else:
        for k, (x, y) in enumerate(((404, -36), (596, -36), (404, 40), (596, 40))):
            shapes.dome(f"case-rivet{k}", place(x, y), 0.06, 0.035, metal, z=0.26)


def escutcheon(lock, under, inside, lit, metal):
    """The lock's plate with its keyhole cut through it and through the strap under it: a cutter that narrows and
    rises as it goes in, so the hole's lower wall shows (the plate's thickness), and behind it the lock's dark or
    the box's lamp. Returns the plate."""
    ex, ey = place(500, 0)
    kx, ky = place(*KEYHOLE)
    plate = lock_plate(lock, ex, ey, metal, 7)
    front = keyhole(kx, ky, 0.17, 0.075, 0.12, 0.5)
    back = [(kx + (x - kx) * 0.82, ky + (y - ky) * 0.82 + 0.07) for x, y in front]
    cutter = shapes.loft("keycut", front, back, 0.45, -0.05)
    for target in (plate, under):
        mod = target.modifiers.new("cut", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.use_hole_tolerant = True
        mod.object = cutter
    cutter.hide_render = True
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=0.5, fill_type="NGON", location=(kx, ky - 0.15, 0.012))
    bpy.context.object.name = "lock-dark"
    bpy.context.object.data.materials.append(inside)
    if lit:
        data = bpy.data.lights.new("in-lock", "POINT")
        data.energy, data.color, data.shadow_soft_size = 6.0, AMBER, 0.05
        light = bpy.data.objects.new("in-lock", data)
        light.location = (kx, ky + 0.02, 0.05)
        light.visible_camera = False
        bpy.context.scene.collection.objects.link(light)
    plate_fixings(lock, ex, ey, metal)
    return plate


def lamp_glow():
    """The keyhole's back when the lamp is lit: amber, from a deep core to a darker edge, never white."""
    mat, nodes, links, bsdf = materials._new("lamp")
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    coord = nodes.new("ShaderNodeTexCoord")
    grad = nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    mapping = nodes.new("ShaderNodeMapping")
    kx, ky = place(*KEYHOLE)
    mapping.inputs["Location"].default_value = (-kx / 0.45, -(ky - 0.1) / 0.45, 0)
    mapping.inputs["Scale"].default_value = (1 / 0.45, 1 / 0.45, 1)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], grad.inputs["Vector"])
    strength = materials._ramp(nodes, links, grad.outputs["Fac"], 0.0, 0.8, 0.35, 2.0)
    colour = materials._mix(nodes, links, (0.6, 0.16, 0.03, 1), (1.0, 0.42, 0.1, 1),
                            materials._ramp(nodes, links, grad.outputs["Fac"], 0.2, 0.8, 0.0, 1.0))
    links.new(colour, bsdf.inputs["Emission Color"])
    links.new(strength, bsdf.inputs["Emission Strength"])
    return mat


def _up_light(scene, name, at, size, energy, colour):
    data = bpy.data.lights.new(name, "AREA")
    data.shape, data.size, data.size_y = "RECTANGLE", size[0], size[1]
    data.energy, data.color = energy, colour
    light = bpy.data.objects.new(name, data)
    light.location = (*at, 0.02)
    light.rotation_euler = (math.pi, 0, 0)  # facing up, out of the box
    light.visible_camera = False
    scene.collection.objects.link(light)


def speak_light(scene):
    """The box's lamp, inside just behind the lock: seen only as light coming out round the window, brightest on
    the lock's lower chamfer and the top of the strap's inner bevel. Iron seen straight on shows a light only from
    many directions at once, so the lamp is a small warm sheet lying in the picture under the lock, and a faint
    glow from the whole window keeps a trace on the far corners."""
    _up_light(scene, "lamp-near", place(500, 80), (4.6, 0.9), 1000.0, (1.0, 0.53, 0.25))
    _up_light(scene, "inside", (CX, CY), (9.6, 5.2), 300.0, (1.0, 0.52, 0.24))
