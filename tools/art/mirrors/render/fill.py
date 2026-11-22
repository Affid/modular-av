"""The empty glass under the cameras: a hand from the deep holds up a contract by its top edge, and a second hand
offers the quill. One module, two pictures (contract.py and quill.py each give it their settings and run it):

top2: the hand comes from the depth behind the sheet and hooks its fingers over the sheet's top edge, the back of the
hand up and toward you, the fingers bent down over the edge onto the paper's face with the dark claws on the front,
the thumb behind the paper; the top edge rolled a little toward you and dented under the fingers; the sheet hanging
from the grip. A left hand (its thumb on your left, behind the paper).
offer2: the fist comes straight out of the glass toward you, the back of the hand and the knuckles up and toward you,
the fingers curled round the shaft, the thumb along it on top; the quill lies across, its feather out to the left,
its nib end just past the little finger.
The sheet: ambientCG Paper003 (CC0), folded in three and opened, singed; an invented script, a red seal, the empty
line with a faint violet mark (contract_parts). 40 CSS px to a scene unit, 2 image px to a CSS px.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

from common import arg, area_light, dark_world, front_camera, reset  # noqa: E402
import contract_parts as cp  # noqa: E402
from fillhand import HAND, bone_points, finish, posed, prepare, tip_of  # noqa: E402
from flesh import flesh  # noqa: E402
from measures import out, spec  # noqa: E402
from pixels import load_rgba, save_rgba  # noqa: E402
from realhand import rotation  # noqa: E402

import bpy  # noqa: E402

PART = arg("--part")
NAME = arg("--name")
W_CSS, H_CSS = spec(NAME)["width"], spec(NAME)["height"]
PX = 40.0
SIZE = float(arg("--size", "1.3"))
LIGHT = float(arg("--light", "1.0"))


def floats(name, default):
    return tuple(float(v) for v in arg(name, default).split(","))


scene = reset()
scene.cycles.samples = int(arg("--samples", "160"))
scene.render.film_transparent = True
front_camera(scene, int(W_CSS * 2), int(H_CSS * 2), W_CSS / PX)
HW, HH = W_CSS / PX / 2, H_CSS / PX / 2
dark_world(scene, (0.002, 0.002, 0.004))

# ---- the sheet's place (both parts need it) ----
SW, SH = cp.SHEET_W, cp.SHEET_H
EX, SY0 = floats("--sheet-at", "-1.25,-1.1")  # its left edge's x, its bottom's y (before the roll)
FACE = -0.2  # the sheet's front face (world z), a little behind the glass
ROLL = float(arg("--roll", "-6"))  # the whole held sheet (and the hand on it), degrees about the view
PV = float(arg("--pivot-v", "0.3"))
PIVOT = np.array([EX, SY0 + SH * PV, 0.0])


def rolled(p):
    r = rotation([0, 0, 1], ROLL)
    return (np.asarray(p) - PIVOT) @ r.T + PIVOT


def sheet_point(u, v):
    return rolled(np.array([EX + u * SW, SY0 + v * SH, FACE]))


# ---- lights: the glass's own light, from deep behind and from above; a faint cold room ----
for sign in (-1, 1):
    area_light(scene, f"deep{sign}", (sign * 2.6, 1.0, -3.4), (0.62, 0.46, 1.0), 240 * LIGHT, 2.4,
               aim=(-sign * 2.6, -0.6, 3.4))
KEY = float(arg("--key", "320"))
kx, ky, kz = floats("--key-at", "-2.5,6.0,2.6")
area_light(scene, "key", (kx, ky, kz), tuple(floats("--key-col", "0.98,0.9,0.82")), KEY * LIGHT,
           float(arg("--key-size", "1.6")), float(arg("--key-size", "1.6")) / 2, aim=(-kx + 0.6, -ky - 0.5, FACE - kz))
area_light(scene, "room", (0.0, 1.0, 12.0), (0.84, 0.84, 0.92), float(arg("--room", "90")) * LIGHT, 8.0,
           aim=(0.0, -1.0, -12.0))

NEAR, FAR = float(arg("--near", "-0.6")), float(arg("--far", "-2.6"))


def skin_material(name, dim=1.0):
    return flesh(name, pallor=tuple(c * dim for c in (0.40, 0.42, 0.44)), edge_x=99.0, out_to=1.0, near=NEAR,
                 far=FAR, sink_from=0.0, sink_to=0.42)


def fade_bottom(px, frac, side=0.0, side_at=None):
    rows = np.arange(px.shape[0], dtype=np.float32)[:, None]
    seen = np.nonzero(px[..., 3].max(1) > 0.05)[0]
    low = float(seen.min()) if len(seen) else 0.0
    f = np.clip((rows - low) / (px.shape[0] * frac), 0, 1)
    px[..., 3] *= f * f * (3 - 2 * f)
    if side > 0:  # the forearm sinks away toward one side: gone by the art's far edge on that side
        cols = np.arange(px.shape[1], dtype=np.float32)[None, :]
        seen_c = np.nonzero(px[..., 3].max(0) > 0.05)[0]
        if side_at == "right":
            edge = float(seen_c.max()) if len(seen_c) else px.shape[1]
            g = np.clip((edge - cols) / (px.shape[1] * side), 0, 1)
        else:
            edge = float(seen_c.min()) if len(seen_c) else 0.0
            g = np.clip((cols - edge) / (px.shape[1] * side), 0, 1)
        px[..., 3] *= g * g * (3 - 2 * g)


PRESS, GAP = 0.012, 0.003


def add_quill3d(nib, end, vane_from):
    """A black feather quill from `nib` to `end` (3D): a shaft, a cut nib, and a vane of separate barbs laid in the
    plane that faces you, two sides of unequal width, a few splits."""
    from contract_parts import _plain
    nib, end = np.asarray(nib, float), np.asarray(end, float)
    dvec = (nib - end) / np.linalg.norm(nib - end)  # toward the nib
    length = float(np.linalg.norm(nib - end))
    mid = (nib + end) / 2
    shaft_r = float(arg("--o-shaft", "0.022")) * SIZE
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=shaft_r * 0.7, radius2=shaft_r, depth=length * 0.9)
    shaft = bpy.context.object
    up = np.array([0.0, 0.0, 1.0])
    q = _look(dvec)
    shaft.rotation_mode = "QUATERNION"
    shaft.rotation_quaternion = q
    shaft.location = tuple(mid + dvec * length * 0.03)
    shaft.data.materials.append(_plain("quill-shaft", (0.34, 0.30, 0.24), 0.3))
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=shaft_r * 0.8, radius2=0.0, depth=0.16 * SIZE)
    point = bpy.context.object
    point.rotation_mode = "QUATERNION"
    point.rotation_quaternion = _look(dvec)
    point.location = tuple(nib - dvec * 0.05 * SIZE)
    point.data.materials.append(_plain("nib", (0.03, 0.02, 0.025), 0.15))
    rng = np.random.RandomState(5)
    view = np.array([0.0, 0.0, 1.0])
    side_n = np.cross(dvec, view)
    side_n /= np.linalg.norm(side_n)
    vs, fs = [], []
    count = int(arg("--barbs", "170"))
    splits = sorted(rng.uniform(0.1, 0.9, 5))
    vw = float(arg("--vane-w", "0.26")) * SIZE
    for side, wmax, slant in ((1, vw, 0.6), (-1, vw * 0.62, 0.5)):
        for kk in range(count):
            s = vane_from + (0.99 - vane_from) * kk / (count - 1)
            tpos = (s - vane_from) / (0.99 - vane_from)
            prof = math.sin(math.pi * min(1.0, tpos * 1.08)) ** 0.7 * (1 - 0.35 * tpos)
            w = wmax * prof * (1 + rng.uniform(-0.08, 0.08))
            if w < 0.01:
                continue
            base = nib - dvec * (length * s)
            splay = slant + rng.uniform(-0.05, 0.05)
            for sp in splits:
                if abs(tpos - sp) < 0.025:
                    splay += 0.25 * (1 if tpos > sp else -1)
            dirb = side * side_n * math.cos(splay) - dvec * math.sin(splay)
            dirb /= np.linalg.norm(dirb)
            tipb = base + dirb * w - dvec * 0.04 * w
            wid = float(arg("--barb-w", "0.009")) * SIZE
            perp = np.cross(dirb, view)
            perp = perp / (np.linalg.norm(perp) + 1e-9) * wid
            n0 = len(vs)
            jit = rng.uniform(-0.003, 0.003)
            for p_ in (base - perp, base + perp, tipb + perp * 0.3, tipb - perp * 0.3):
                vs.append((float(p_[0]), float(p_[1]), float(p_[2]) + jit))
            fs.append((n0, n0 + 1, n0 + 2, n0 + 3))
    mesh = bpy.data.meshes.new("vane")
    mesh.from_pydata(vs, [], fs)
    vane = bpy.data.objects.new("vane", mesh)
    bpy.context.scene.collection.objects.link(vane)
    vm = _plain("vane", tuple(floats("--vane-col", "0.11,0.10,0.10")), 0.45, 0.6)
    vm.node_tree.nodes["Principled BSDF"].inputs["Sheen Weight"].default_value = 0.6
    mesh.materials.append(vm)


def _look(d):
    """The quaternion turning +z (a cone's axis) onto d."""
    from mathutils import Vector
    return Vector((0.0, 0.0, 1.0)).rotation_difference(Vector(tuple(float(v) for v in d)))

# ========================================================================================================= offer2
# The second hand holds the quill out to you the way the user's reference shows a pen offered: the fist comes
# straight out of the glass toward you, the back of the hand and the knuckles up and toward you, the fingers curled
# loosely round the shaft, the thumb laid along it on top pressing it to the index; the quill lies across, its feather
# out to the left past the thumb, its nib end just past the little finger. A left hand (its thumb on your left).
O2POSE = dict(knuckles=floats("--f-knuckles", "62,68,74,80"),
              curl=tuple(zip(*[iter(floats("--f-curl", "72,40,78,44,80,46,82,48"))] * 2)),
              spread=floats("--f-spread", "2,0,-3,-7"), thumb=floats("--f-thumb", "30,20,10,10"))


def thumb_tip_solve(b, pose, target, start):
    """Swing and bend the thumb (hand space) until its tip is nearest `target`."""
    from fillhand import deforms_of
    from realhand import skin
    cols = [HAND.bone(n) for n in ("finger1-2", "finger1-3")]
    pick = b.weights[:, cols].sum(1) > 0.5
    sub_rest, sub_w = b.rest[pick], b.weights[pick]
    is3 = b.weights[pick][:, cols[1]] > 0.5

    def tip(th):
        p_ = skin(sub_rest, sub_w, deforms_of(dict(pose, thumb=th)))
        base = p_[~is3].mean(0)
        t3 = p_[is3]
        return t3[np.argmax(((t3 - base) ** 2).sum(1))]

    def gap(th):
        return float(np.linalg.norm(tip(th) - target))

    best = (9.0, start)
    for sw in range(-60, 131, 15):
        for bd in range(-45, 91, 15):
            for md in range(-30, 61, 15):
                for en in (-10, 20, 50, 80):
                    th = (sw, bd, md, en)
                    g = gap(th)
                    if g < best[0]:
                        best = (g, th)
    g, th = best
    for step in (5, 2.5, 1.25):
        for _ in range(6):
            for kk in range(4):
                for sgn in (-1, 1):
                    trial = list(th)
                    trial[kk] += sgn * step
                    gt = gap(tuple(trial))
                    if gt < g:
                        g, th = gt, tuple(trial)
    return th, g, tip(th)


def offer2_part():
    mat = skin_material("flesh", dim=float(arg("--q-dim", "0.95")))
    b = prepare(int(arg("--seed", "17")), name="offer2-hand")
    pose = O2POSE
    loc, _ = posed(b, pose, np.eye(3), np.zeros(3))
    curled = [f"finger{f}-{j}" for f in range(2, 6) for j in (1, 2, 3)]
    ring = bone_points(loc, b.weights, curled)
    cy, cz = float(ring[:, 1].mean()), float(ring[:, 2].mean())
    cy += float(arg("--f-hole-dy", "0.0"))
    cz += float(arg("--f-hole-dz", "0.0"))
    idx = bone_points(loc, b.weights, ["finger2-1", "finger2-2"])
    lit = bone_points(loc, b.weights, ["finger5-1", "finger5-2"])
    thumb_side = 1.0 if float(tip_of(loc, b.weights, 1)[0]) > float(loc[:, 0].mean()) else -1.0
    x_index = float(idx[:, 0].max() if thumb_side > 0 else idx[:, 0].min())
    x_little = float(lit[:, 0].min() if thumb_side > 0 else lit[:, 0].max())
    print("HAND SPACE: thumb side", thumb_side, "hole y,z", round(cy, 2), round(cz, 2), "index x", round(x_index, 2),
          "little x", round(x_little, 2), "ring y", round(float(ring[:, 1].min()), 2), round(float(ring[:, 1].max()), 2),
          "ring z", round(float(ring[:, 2].min()), 2), round(float(ring[:, 2].max()), 2))
    R = float(arg("--o-shaft", "0.022")) * SIZE / (SIZE * float(arg("--q-scale", "1.0")))
    # The thumb's tip on the shaft just past the index, on its back side (toward +z, the side you see).
    tx = x_index + thumb_side * float(arg("--f-thumb-x", "0.10"))
    target = np.array([tx, cy + float(arg("--f-thumb-dy", "0.0")), cz + R + float(arg("--f-thumb-dz", "0.07"))])
    if arg("--f-thumb-solve", "1") == "1":
        th, g, t = thumb_tip_solve(b, pose, target, pose["thumb"])
        print("THUMB TARGET", np.round(target, 2), "TIP", np.round(t, 2), "gap", round(g, 3), "thumb", [round(v, 1) for v in th])
        pose = dict(pose, thumb=th)
    # The quill's ends in hand space: the nib end a little past the little finger, the feather out past the thumb.
    nib_h = np.array([x_little - thumb_side * float(arg("--f-nib-out", "0.12")), cy, cz])
    end_h = np.array([x_index + thumb_side * float(arg("--f-feather-out", "1.9")), cy + float(arg("--f-rise", "0.0")), cz])
    # Place the hand: fingers toward you and a little up, the back of the hand up; turned about the view's up axis
    # so the fingers point a little left (the forearm goes back to the right), and rolled about the view.
    up = math.radians(float(arg("--f-up", "22")))
    F0 = np.array([0.0, math.sin(up), math.cos(up)])
    B0 = np.array([0.0, math.cos(up), -math.sin(up)])
    X0 = np.cross(F0, B0)
    basis0 = np.stack([X0, F0, B0], axis=1)
    basis = rotation([0, 0, 1], float(arg("--f-roll", "8"))) @ rotation([0, 1, 0], float(arg("--f-yaw", "-28"))) \
        @ rotation([1, 0, 0], float(arg("--f-pitch", "0"))) @ basis0
    m = SIZE * float(arg("--q-scale", "1.0")) * basis
    centre_h = np.array([(x_index + x_little) / 2, cy, cz])
    target_w = np.array(floats("--o-at", "2.4,-1.9,0.2"))
    offset = target_w - m @ centre_h
    world, nails = posed(b, pose, m, offset)
    finish(b, world, nails, mat, flips=(np.linalg.det(basis) < 0))
    nib_w, end_w = m @ nib_h + offset, m @ end_h + offset
    print("NIB", np.round(nib_w, 2), "END", np.round(end_w, 2), "HAND z range", round(float(world[:, 2].min()), 2),
          round(float(world[:, 2].max()), 2))
    add_quill3d(nib_w, end_w, float(arg("--o-vane-from", "0.42")))
    return world


# =========================================================================================================== top2
# The user's second reference: the hand comes from the depth behind the sheet and hooks its fingers over the sheet's
# TOP edge, the back of the hand up and toward you, the fingers bent down over the edge onto the paper's face with
# the dark claws on the front, the thumb behind the paper; the top edge rolled a little toward you and dented under
# the fingers; the sheet hanging from the grip. A left hand (its thumb on your left, behind the paper).
T2POSE = dict(curl=tuple(zip(*[iter(floats("--g-curl", "34,22,38,24,40,26,40,28"))] * 2)),
              spread=floats("--g-spread", "5,0,-4,-10"), thumb=floats("--g-thumb", "20,20,20,20"))


def top2_part():
    from fillhand import deforms_of
    from realhand import skin
    mat = skin_material("flesh")
    b = prepare(int(arg("--seed", "11")), name="top2")
    tb = math.radians(float(arg("--g-back", "40")))  # how far the back of the hand turns from up toward you
    F = np.array([0.0, -math.sin(tb), math.cos(tb)])
    B = np.array([0.0, math.cos(tb), math.sin(tb)])
    basis = rotation([0, 0, 1], float(arg("--g-roll", "4"))) @ np.stack([np.cross(F, B), F, B], axis=1)
    m = SIZE * float(arg("--g-scale", "1.0")) * basis
    gu, dy, dz = floats("--g-at", "0.5,0.06,0.10")  # the middle knuckle: across the sheet, over its top, before it
    TOP = SY0 + SH
    gx = EX + gu * SW
    middle = deforms_of(dict(T2POSE, knuckles=(0, 0, 0, 0)))[HAND.bone("finger3-1")][0]
    offset = np.array([gx, TOP + dy, FACE + dz]) - m @ middle
    # The thumb behind the paper, just under the top edge, under the index.
    if arg("--g-thumb-solve", "1") == "1":
        idx_w = (m @ deforms_of(dict(T2POSE, knuckles=(0, 0, 0, 0)))[HAND.bone("finger2-1")][0]) + offset
        tw = np.array([idx_w[0] + float(arg("--g-thumb-dx", "0.05")), TOP - float(arg("--g-thumb-down", "0.22")),
                       FACE - float(arg("--g-thumb-back", "0.10"))])
        th_target = np.linalg.solve(m, tw - offset)
        th, g, _ = thumb_tip_solve(b, dict(T2POSE, knuckles=(40, 40, 40, 40)), th_target, T2POSE["thumb"])
        print("THUMB BEHIND", [round(v, 1) for v in th], "gap", round(g, 3))
        pose0 = dict(T2POSE, thumb=th)
    else:
        pose0 = T2POSE
    # Each finger bends at its knuckle until it lies on the paper's face below the edge.
    knuckles = [0.0] * 4
    for k, f in enumerate(range(2, 6)):
        mine = b.weights[:, [HAND.bone(f"finger{f}-{j}") for j in (1, 2, 3)]].sum(1) > 0.5
        sub_rest, sub_w = b.rest[mine], b.weights[mine]

        def front_min(angle):
            trial = list(knuckles)
            trial[k] = angle
            d = deforms_of(dict(pose0, knuckles=tuple(trial)))
            pts = skin(sub_rest, sub_w, d) @ m.T + offset
            nail = (d[b.sheets[k]["bone"]][0] + (b.sheets[k]["verts"] - d[b.sheets[k]["bone"]][2])
                    @ d[b.sheets[k]["bone"]][1].T) @ m.T + offset
            pts = np.vstack([pts, nail])
            below = pts[:, 1] < TOP - 0.02
            return pts[below, 2].min() - FACE if below.any() else 9.0

        best = 0.0
        for angle in np.arange(0.0, 110.0, 1.0):
            if front_min(angle) < PRESS * 0.5:
                break
            best = angle
        knuckles[k] = best + float(arg("--g-extra", "1.0"))
    print("KNUCKLES", [round(v) for v in knuckles])
    pose = dict(pose0, knuckles=tuple(knuckles))
    world, nails = posed(b, pose, m, offset)

    def lift(points, soft=0.005):
        floor = FACE + GAP
        z = points[:, 2]
        lifted = floor + soft * np.logaddexp(0.0, (z - floor) / soft)
        over = np.clip((TOP - points[:, 1]) / 0.03, 0.0, 1.0) * ((points[:, 0] > EX) & (points[:, 0] < EX + SW))
        front = z > FACE - 0.08
        out_ = points.copy()
        out_[:, 2] = np.where(front & (z < floor + 6 * soft), z + (lifted - z) * over, z)
        return out_

    fing = b.weights[:, [HAND.bone(f"finger{f}-{j}") for f in range(2, 6) for j in (1, 2, 3)]].sum(1) > 0.3
    world = np.where(fing[:, None], lift(world), world)
    nails = [lift(n) for n in nails]
    touch = world[fing & (np.abs(world[:, 2] - (FACE + GAP)) < 0.015) & (world[:, 1] < TOP - 0.01)]
    print("TOUCH POINTS", len(touch), "HAND y range", round(float(world[:, 1].min()), 2), round(float(world[:, 1].max()), 2))
    finish(b, rolled(world), [rolled(n) for n in nails], mat, flips=(np.linalg.det(basis) < 0))
    add_top_sheet(touch, gx)
    cp.add_seal_at(sheet_point(*floats("--seal-at", "0.27,0.17")), FACE)


def add_top_sheet(touch, gx):
    """The sheet hung from a grip at its top edge: the top edge rolled a little toward you, the corners away from the
    grip sagging, the foot swinging back; dents under the pads and short folds fanning out below the grip."""
    nx, ny = 72, int(72 * SH / SW)
    verts, uvs, faces = [], [], []
    sag, swing = float(arg("--sag", "0.08")), float(arg("--swing", "0.14"))
    dent, dent_r = float(arg("--dent", "0.03")), float(arg("--dent-r", "0.07"))
    fold = float(arg("--fold", "0.08"))
    roll_h, roll_r = float(arg("--roll-h", "0.07")), float(arg("--roll-r", "0.09"))  # fraction of height, radius
    gu = (gx - EX) / SW
    for j in range(ny + 1):
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            x, y = EX + u * SW, SY0 + v * SH
            z = 0.012 * math.sin(u * 7.1 + v * 3.3) + 0.01 * math.sin(v * 11.0)
            z -= fold * max(0.0, 0.09 - abs(v - (0.345 + 0.02 * u))) / 0.09
            z += fold * 0.8 * max(0.0, 0.09 - abs(v - (0.665 - 0.015 * u))) / 0.09
            z += fold * 0.5 * max(0.0, 0.07 - abs(u - 0.5 - 0.02 * v)) / 0.07
            off = abs(u - gu) / max(gu, 1 - gu)
            y -= sag * off ** 2 * v ** 3
            z -= sag * 0.5 * off ** 2 * v ** 2
            z -= swing * (1 - v) ** 1.6
            # The top edge rolls toward you round a small radius, less under the grip (the fingers flatten it).
            s_ = (v - (1 - roll_h)) * SH
            if s_ > 0:
                flat = 1 - 0.6 * math.exp(-((u - gu) * SW / 0.35) ** 2)
                ang = s_ / roll_r * flat
                y = SY0 + (1 - roll_h) * SH + roll_r / flat * math.sin(min(ang, 2.6)) - (sag * off ** 2 * v ** 3)
                z += roll_r / flat * (1 - math.cos(min(ang, 2.6)))
            r = math.hypot((u - gu) * SW, (1 - v) * SH)
            a = math.atan2((1 - v) * SH, (u - gu) * SW)
            z += float(arg("--pull", "0.022")) * math.sin(a * 7) * math.exp(-r / 0.45) * min(1.0, r / 0.15)
            verts.append([x, y, FACE + z])
            uvs.append((u, v))
    verts = np.array(verts)
    pick = touch[:: max(1, len(touch) // 300)]
    for p in pick:
        d2 = (verts[:, 0] - p[0]) ** 2 + (verts[:, 1] - p[1]) ** 2
        verts[:, 2] -= dent * np.exp(-d2 / dent_r ** 2) / max(1.0, len(pick) / 30)
    verts = rolled(verts)
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    mesh = bpy.data.meshes.new("sheet")
    mesh.from_pydata([tuple(p) for p in verts], [], faces)
    layer = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[mesh.loops[li].vertex_index]
    mesh.shade_smooth()
    obj = bpy.data.objects.new("sheet", mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(cp._paper_material(cp._ink_image(NAME)))
    return obj



def picture():
    """Renders the part, fades what reaches the box's foot (and, for the quill, its far side) into the glass, and
    sinks what reaches up toward the box's top into the dark: the forearm goes back into the deep, not into a pale
    column."""
    {"offer2": offer2_part, "top2": top2_part}[PART]()
    path = out(NAME)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    px = load_rgba(path)
    fade_bottom(px, float(arg("--fade", "0.2")), float(arg("--side-fade", "0")), arg("--side", "left"))
    if float(arg("--top-fade", "0")) > 0:
        rows_t = np.arange(px.shape[0], dtype=np.float32)[:, None]
        ft = np.clip((px.shape[0] - 1 - rows_t) / (px.shape[0] * float(arg("--top-fade"))), 0, 1)
        ft = ft * ft * (3 - 2 * ft)
        px[..., 3] *= ft
        px[..., :3] *= (ft ** float(arg("--top-sink", "0")))[..., None]
    px[..., :3] = np.where(px[..., 3:4] > 0.002, px[..., :3], 0)
    save_rgba(px, path)
    a = px[..., 3]
    lum = 0.2126 * px[..., 0] + 0.7152 * px[..., 1] + 0.0722 * px[..., 2]
    top = int(np.nonzero(a.max(1) > 0.05)[0].max()) if (a > 0.05).any() else 0
    print(NAME, "TOP OF ART (css px over the bottom)", round((top + 1) / 2, 1),
          "BRIGHTEST", round(float(lum[a > 0.5].max()) if (a > 0.5).any() else 0, 3))
