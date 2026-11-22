"""Spirit hands out of the black glass, holding a camera's picture by its sides: `hands-1` and `hands-2`, one frame
picture for each of the two poses (neighbours in the dock differ).

The MakeHuman base mesh's (CC0) left forearm and hand, posed with its own rig's weights, the fingers reshaped as old
gaunt ones (handdetail) with nail plates set in, the skin of flesh.py. Each hand rises out of the glass beside the
picture with the back of the hand to the viewer, the knuckle row over the picture's edge, the fingers bent down onto
its face. One hand of each pose grips (level, fingers converging); the other claws (fanned, turned diagonally, the
index lifted, ring and little fingers curled up like talons). Where the measures say (measures.json, hands).

Lit from the glass: a cold violet-white light behind and below each hand's side of the picture (the key, a rim along
the silhouettes), a weak cold fill from the front, a faint narrow light from under the fingers, and the picture's own
light under the fingers on the skin alone (so the nails stay dark). Each finger's pad that presses on the picture
leaves a small dark contact shadow round it, and the skin near the face a soft one (contact.py).
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from common import DENSITY, TILE_H, TILE_W, VIEW, area_light, dark_world, frame_camera, holdout, keep_middle_clear, \
    place, render, reset  # noqa: E402
from contact import contact_shadow  # noqa: E402
from flesh import flesh  # noqa: E402
from handdetail import creases, details, nail_sheets, reshape_fingers, set_attribute, subdivided  # noqa: E402
from measures import HANDS, out  # noqa: E402
from pixels import load_rgba, save_rgba  # noqa: E402
from realhand import Hand, pose_bones, rotation, skin  # noqa: E402

SEED = HANDS["seed"]
SIZE = 1.85  # scene units to a decimetre of hand
PITCH = 58  # how steeply the back of the hand rises out of the glass
LEVELS = 3
KNUCKLE_X = 8  # the middle knuckle, tile units over the picture's edge
FACE = 0.03  # the picture's front face (world z)
PRESS = 0.012  # how far a pressing pad would sink: flattened back to the face
GAP = 0.002
# Finger lengths (index, middle, ring, little): the middle clearly the longest, all of them a little too long;
# the middle and end phalanges stretched more than the first (gaunt, not stretched-looking).
LONG = (1.16, 1.12, 1.08, 1.22)
OUTER = 1.06  # extra on the middle and end phalanges
STRETCH = {"metacarpal": (1.04, 1.0), "lowerarm": (1.0, 0.84)}
THUMB = (85, 40, 60, 40)

# Per finger (index, middle, ring, little): middle and end joint bends, spread (positive: toward the thumb), lift
# off the face. The knuckle bend is solved to reach the face.
GRIP = dict(curl=((72, 22), (78, 24), (74, 28), (58, 30)), spread=(3, 0, -4, -9), lift=(0, 0.02, 0, 0.03))
GRIP_KX, GRIP_H, GRIP_TILT = 22, 0.45, -16
CLAW = dict(curl=((22, 34), (36, 52), (44, 48), (50, 44)), spread=(20, 5, -13, -30), lift=(0.10, 0, 0, 0.01))
CLAW_TILT = 22

HAND = Hand()


def stretches():
    out_ = {}
    for b, name in enumerate(HAND.names):
        for key, value in STRETCH.items():
            if name.startswith(key):
                out_[b] = value
        if name.startswith("finger") and not name.startswith("finger1"):
            f, j = int(name[6]), int(name[8])
            along = LONG[f - 2] * (OUTER if j > 1 else 1.0) / (1 + (OUTER - 1) * 2 / 3)
            out_[b] = (along, 1.12)
    return out_


def rest_spread(f):
    b = HAND.bone(f"finger{f}-1")
    d = HAND.tails[b] - HAND.heads[b]
    return math.degrees(math.atan2(d[0], d[1]))


def flex(b, angle, splay=0.0):
    d = HAND.tails[b] - HAND.heads[b]
    r = rotation(np.cross(d, [0.0, 0.0, -1.0]), angle)
    return r @ rotation([0.0, 0.0, 1.0], splay) if splay else r


def turns(knuckles, action):
    rot = {}
    for k, f in enumerate(range(2, 6)):
        splay = rest_spread(f) - action["spread"][k]
        bends = (knuckles[k], *action["curl"][k])
        for j, angle in zip((1, 2, 3), bends):
            b = HAND.bone(f"finger{f}-{j}")
            rot[b] = flex(b, angle, splay if j == 1 else 0.0)
    rot[HAND.bone("finger1-1")] = rotation([0.0, 1.0, 0.0], THUMB[0]) @ flex(HAND.bone("finger1-1"), THUMB[1])
    for j, angle in zip((2, 3), THUMB[2:]):
        rot[HAND.bone(f"finger1-{j}")] = flex(HAND.bone(f"finger1-{j}"), angle)
    return rot


def basis(pitch, tilt, roll, chirality):
    a = math.radians(pitch)
    fingers = np.array([math.cos(a), 0.0, math.sin(a)])
    back = np.array([-math.sin(a), 0.0, math.cos(a)])
    side = np.cross(fingers, back)
    start = np.stack([side, fingers, back], axis=1)
    b = rotation([0, 0, 1], tilt) @ rotation(fingers, roll) @ start
    return b @ np.diag([chirality, 1.0, 1.0])


def placed(along, knuckle_x, height, tilt, roll, chirality):
    m = SIZE * basis(PITCH, tilt, roll, chirality)
    rest = pose_bones(HAND, {}, stretches())
    middle = rest[HAND.bone("finger3-1")][0]
    kx, ky = place(knuckle_x, along)
    target = np.array([kx, ky, FACE + height])
    return m, target - m @ middle


def nail_points(sheets, deforms):
    return [deforms[s["bone"]][0] + (s["verts"] - deforms[s["bone"]][2]) @ deforms[s["bone"]][1].T for s in sheets]


def solve_knuckles(m, offset, edge_x, action, sheets, verts, weights):
    """Bend each finger at its knuckle until its lowest point (nail tips included) sinks PRESS into the face (or
    hovers `lift` over it)."""
    stretch = stretches()
    knuckles = [30.0] * 4
    for k, f in enumerate(range(2, 6)):
        bones = [HAND.bone(f"finger{f}-{j}") for j in (1, 2, 3)]
        mine = weights[:, bones].sum(1) > 0.5
        target = action["lift"][k] - PRESS

        def lowest(angle):
            trial = list(knuckles)
            trial[k] = angle
            d = pose_bones(HAND, turns(trial, action), stretch)
            pts = skin(verts[mine], weights[mine], d)
            pts = np.vstack([pts, nail_points([sheets[k]], d)[0]]) @ m.T + offset
            beyond = pts[:, 0] > edge_x + 0.01
            return pts[beyond, 2].min() - FACE if beyond.any() else 9.0

        lo = -40.0
        while lo < 120.0 and lowest(lo + 5.0) > target:
            lo += 5.0
        hi = lo + 5.0
        for _ in range(14):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if lowest(mid) > target else (lo, mid)
        knuckles[k] = hi
    return knuckles


def pressed(points, edge_x, soft=0.005):
    floor = FACE + GAP
    z = points[:, 2]
    lifted = floor + soft * np.logaddexp(0.0, (z - floor) / soft)
    beyond = np.clip((points[:, 0] - edge_x) / 0.03, 0.0, 1.0)
    out_ = points.copy()
    out_[:, 2] = np.where(z < floor + 6 * soft, z + (lifted - z) * beyond, z)
    return out_


def crease_field(parts, knuckles, action):
    """Joint creases, deep where the joint is straight (the skin bunches) and smoothed out where it is bent (the
    skin is pulled tight over the knuckle)."""
    total = None
    for k, f in enumerate(range(2, 6)):
        bends = (knuckles[k], *action["curl"][k])
        for j in range(3):
            depth = float(np.clip(1.15 - abs(bends[j]) / 80.0, 0.2, 1.0))
            part = parts[(f, j)] * depth
            total = part if total is None else np.minimum(total, part)
    return total


class Holding:
    """What one pose's hands leave for its shadows: the skin and nails near the face, and the fingertips' pads."""

    def __init__(self, skin_only, material):
        self.skin_only, self.material = skin_only, material
        self.near, self.tips = [], []


def holding_hand(held, edge, along, chirality, tilt, action, seed, knuckle_x=KNUCKLE_X, height=0.95, roll=0.0):
    m, offset = placed(along, knuckle_x, height, tilt, roll, chirality)
    edge_x = place(0, 0)[0]
    obj, verts, normals, weights = subdivided(HAND, LEVELS, f"hand-{edge}")
    verts = reshape_fingers(HAND, verts, weights, seed=seed)
    det = details(HAND, verts, normals, weights, seed=seed)
    sheets = nail_sheets(HAND, verts, normals, weights)
    knuckles = solve_knuckles(m, offset, edge_x, action, sheets, verts, weights)
    print(edge, "knuckle bends", [round(a) for a in knuckles])
    rest = verts + normals * det["disp"][:, None]
    deforms = pose_bones(HAND, turns(knuckles, action), stretches())
    world = pressed(skin(rest, weights, deforms) @ m.T + offset, edge_x)
    flips = chirality < 0
    if edge == "right":
        world[:, 0] *= -1
        flips = not flips
    obj.data.vertices.foreach_set("co", world.ravel())
    if flips:
        obj.data.flip_normals()
    obj.data.update()
    thumb = weights[:, [HAND.bone(n) for n in ("finger1-1", "finger1-2", "finger1-3", "metacarpal1")]].sum(1)
    held.near.append(world[thumb < 0.3])  # the thumb is hidden under the hand: its shadow read as a hole
    pads = weights[:, [HAND.bone(f"finger{f}-3") for f in range(2, 6)]].sum(1) > 0.5
    held.tips.append(world[pads])
    held.skin_only.objects.link(obj)
    set_attribute(obj.data, "rest", verts)
    for key in ("veins", "tip", "tendon", "stretch", "nailbed"):
        set_attribute(obj.data, key, det[key])
    set_attribute(obj.data, "crease", crease_field(creases(HAND, verts, normals, weights, seed=seed + 50),
                                                   knuckles, action))
    obj.data.materials.append(held.material)
    for k, (sheet, w) in enumerate(zip(sheets, nail_points(sheets, deforms))):
        w = pressed(w @ m.T + offset, edge_x)
        if edge == "right":
            w[:, 0] *= -1
        held.near.append(w)
        mesh = bpy.data.meshes.new(f"nail-{edge}-{k}")
        mesh.from_pydata([tuple(p) for p in w], [], sheet["faces"])
        if flips:
            mesh.flip_normals()
        mesh.shade_smooth()
        set_attribute(mesh, "rest", sheet["verts"])
        set_attribute(mesh, "nail", np.ones(len(w)))
        set_attribute(mesh, "free", sheet["free"])
        set_attribute(mesh, "along", sheet["along"])
        nail = bpy.data.objects.new(mesh.name, mesh)
        bpy.context.scene.collection.objects.link(nail)
        solid = nail.modifiers.new("thick", "SOLIDIFY")
        solid.thickness = 0.009 * SIZE
        solid.offset = -1.0
        mesh.materials.append(held.material)
    return obj


def lights(scene, x0, x1, y0, y1):
    """The glass's light above the picture raking down across the hands, a weak room, a light from under, and the
    picture's own light on the skin alone. Returns the collection the skin goes in."""
    edge_x = (x1 - x0) / 2
    ky, kz, ko = 7.0, 2.5, 0.2
    for sign in (-1, 1):
        at = (sign * (edge_x + ko), ky, kz)
        area_light(scene, f"key{sign}", at, (0.86, 0.84, 1.0), 200, 1.6, 0.6,
                   aim=(-sign * (ko + 0.4), -ky, FACE - kz + 0.6))
    area_light(scene, "room", (0.0, 3.0, 12.0), (0.84, 0.87, 1.0), 100, 7.0, aim=(0.0, -3.0, -12.0))
    area_light(scene, "under", (0.0, -9.0, 4.0), (0.7, 0.64, 1.0), 110, 8.0, aim=(0.0, 9.0, -4.0))
    skin_only = bpy.data.collections.new("skin-only")
    screen = area_light(scene, "screen", ((x0 + x1) / 2, (y0 + y1) / 2, FACE + 0.004), (0.8, 0.9, 0.82), 30,
                        x1 - x0, y1 - y0, aim=(0, 0, 1))
    screen.visible_camera = False
    screen.light_linking.receiver_collection = skin_only
    return skin_only


def render_pose(pose):
    scene = reset()
    scene.cycles.samples = 192
    scene.render.film_transparent = True
    frame_camera(scene)
    x0, y1 = place(0, 0)
    x1, y0 = place(TILE_W, TILE_H)
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, 0.0))
    pane = bpy.context.object
    pane.scale = (x1 - x0, y1 - y0, 2 * FACE)
    pane.data.materials.append(holdout())
    dark_world(scene, (0.002, 0.002, 0.004))
    held = Holding(lights(scene, x0, x1, y0, y1), flesh("flesh", pallor=(0.40, 0.42, 0.42)))
    rng = random.Random(SEED)
    # The seeds and the small turns are the mock's, pose by pose, so the hands are the ones the user chose.
    seeds = {"1": (SEED, SEED + 1), "2": (SEED + 2, SEED + 3)}[pose]
    for (edge, hand), seed in zip(sorted(HANDS["poses"][pose].items()), seeds):
        if hand["hold"] == "grip":
            holding_hand(held, edge, hand["y"], 1, GRIP_TILT + rng.uniform(-2, 2), GRIP, seed, roll=-8,
                         knuckle_x=GRIP_KX, height=GRIP_H)
        else:
            holding_hand(held, edge, hand["y"], -1, CLAW_TILT + rng.uniform(-2, 2), CLAW, seed, roll=6,
                         knuckle_x=KNUCKLE_X - 4)
    name = f"hands-{pose}"
    path = out(name)
    render(scene, path)
    pixels = contact_shadow(load_rgba(path), np.vstack(held.near), FACE, tips=np.vstack(held.tips))
    keep_middle_clear(pixels, name)
    ys, xs = np.nonzero(pixels[::-1, :, 3] > 0.02)
    tile_x = xs / DENSITY + VIEW["x"]
    print(name, "REACH OUTSIDE: left", round(float(max(0.0, -tile_x.min())), 1),
          "right", round(float(max(0.0, tile_x.max() - TILE_W)), 1))
    save_rgba(pixels, path)


for pose in HANDS["poses"]:
    render_pose(pose)
