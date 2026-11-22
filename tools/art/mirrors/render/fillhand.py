"""Round 3's hand (MakeHuman CC0 left forearm and hand, gaunt fingers, nail plates, skin4) as a mesh in the scene,
posed from joint angles, for the hands in the empty glass that hold things (the contract, the quill).

Hand space: x across the palm, y along the fingers, z out of the back of the hand (the palm is -z); a positive bend
turns a finger toward the palm. `make_hand` takes the pose and a 3x3 `m` (hand space -> scene, scale included) and an
`offset`, and an optional `adjust(world, weights)` that moves the skinned points (pressing pads on a sheet)."""
import math

import numpy as np

import bpy

from handdetail import creases, details, nail_sheets, reshape_fingers, set_attribute, subdivided
from realhand import Hand, pose_bones, rotation, skin

HAND = Hand()
LONG = (1.16, 1.12, 1.08, 1.22)
OUTER = 1.06
STRETCH = {"metacarpal": (1.04, 1.0), "lowerarm": (1.0, 0.84)}


def stretches():
    out_ = {}
    for b, name in enumerate(HAND.names):
        for key, value in STRETCH.items():
            if name.startswith(key):
                out_[b] = value
        if name.startswith("finger") and not name.startswith("finger1"):
            f, j = int(name[6]), int(name[8])
            out_[b] = (LONG[f - 2] * (OUTER if j > 1 else 1.0) / (1 + (OUTER - 1) * 2 / 3), 1.12)
    return out_


def rest_spread(f):
    b = HAND.bone(f"finger{f}-1")
    d = HAND.tails[b] - HAND.heads[b]
    return math.degrees(math.atan2(d[0], d[1]))


def flex(b, angle, splay=0.0):
    d = HAND.tails[b] - HAND.heads[b]
    r = rotation(np.cross(d, [0.0, 0.0, -1.0]), angle)
    return r @ rotation([0.0, 0.0, 1.0], splay) if splay else r


def turns(pose):
    """pose: knuckles (4), curls ((mid, end) x 4), spread (4, positive toward the thumb), thumb (swing about y,
    bend, mid, end), wrist (bend toward the palm, side) optional."""
    rot = {}
    for k, f in enumerate(range(2, 6)):
        splay = rest_spread(f) - pose["spread"][k]
        for j, angle in zip((1, 2, 3), (pose["knuckles"][k], *pose["curl"][k])):
            b = HAND.bone(f"finger{f}-{j}")
            rot[b] = flex(b, angle, splay if j == 1 else 0.0)
    th = pose["thumb"]
    rot[HAND.bone("finger1-1")] = rotation([0.0, 1.0, 0.0], th[0]) @ flex(HAND.bone("finger1-1"), th[1])
    for j, angle in zip((2, 3), th[2:]):
        rot[HAND.bone(f"finger1-{j}")] = flex(HAND.bone(f"finger1-{j}"), angle)
    return rot


def deforms_of(pose):
    return pose_bones(HAND, turns(pose), stretches())


def bone_points(world, weights, names, limit=0.5):
    cols = [HAND.bone(n) for n in names]
    return world[weights[:, cols].sum(1) > limit]


def tip_of(world, weights, finger):
    """The far end of a finger's last bone (the pad's end), in the posed points."""
    end = bone_points(world, weights, [f"finger{finger}-3"])
    base = bone_points(world, weights, [f"finger{finger}-2"]).mean(0)
    return end[np.argmax(((end - base) ** 2).sum(1))]


class Built:
    pass


def prepare(seed, levels=3, name="hand"):
    b = Built()
    b.obj, b.verts, b.normals, b.weights = subdivided(HAND, levels, name)
    b.verts = reshape_fingers(HAND, b.verts, b.weights, seed=seed)
    b.det = details(HAND, b.verts, b.normals, b.weights, seed=seed)
    b.sheets = nail_sheets(HAND, b.verts, b.normals, b.weights)
    b.rest = b.verts + b.normals * b.det["disp"][:, None]
    b.seed, b.name = seed, name
    return b


def posed(b, pose, m, offset):
    d = deforms_of(pose)
    world = skin(b.rest, b.weights, d) @ m.T + offset
    nails = [(d[s["bone"]][0] + (s["verts"] - d[s["bone"]][2]) @ d[s["bone"]][1].T) @ m.T + offset for s in b.sheets]
    return world, nails


def finish(b, world, nails, material, flips=False, extra=None, size=1.3):
    """Write the posed points to the mesh, its attributes, the nails as thin plates."""
    b.obj.data.vertices.foreach_set("co", world.ravel())
    if flips:
        b.obj.data.flip_normals()
    b.obj.data.update()
    set_attribute(b.obj.data, "rest", b.verts)
    for key in ("veins", "tip", "tendon", "stretch", "nailbed"):
        set_attribute(b.obj.data, key, b.det[key])
    set_attribute(b.obj.data, "crease", 0.7 * np.minimum.reduce(list(
        creases(HAND, b.verts, b.normals, b.weights, seed=b.seed + 50).values())))
    for key, value in (extra or {}).items():
        set_attribute(b.obj.data, key, value)
    b.obj.data.materials.append(material)
    for k, (sheet, w) in enumerate(zip(b.sheets, nails)):
        mesh = bpy.data.meshes.new(f"{b.name}-nail-{k}")
        mesh.from_pydata([tuple(p) for p in w], [], sheet["faces"])
        if flips:
            mesh.flip_normals()
        mesh.shade_smooth()
        set_attribute(mesh, "rest", sheet["verts"])
        set_attribute(mesh, "nail", np.ones(len(w)))
        set_attribute(mesh, "free", sheet["free"])
        set_attribute(mesh, "along", sheet["along"])
        for key in (extra or {}):
            set_attribute(mesh, key, np.zeros(len(w)))
        nail = bpy.data.objects.new(mesh.name, mesh)
        bpy.context.scene.collection.objects.link(nail)
        solid = nail.modifiers.new("thick", "SOLIDIFY")
        solid.thickness = 0.009 * size
        solid.offset = -1.0 if not flips else 1.0
        mesh.materials.append(material)
    return b.obj
