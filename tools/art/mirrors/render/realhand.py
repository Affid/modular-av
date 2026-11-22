"""A real hand: the MakeHuman base mesh's left forearm and hand (CC0), posed with its own rig's weights. The render
script cuts it out of the fetched base mesh (../handmesh.ts) and puts it beside the pictures as mhhand.json.

Hand space (the mesh's units, decimetres): the wrist at 0, the middle knuckle along +y, the back of the hand
facing +z, the index finger's side toward +x (a left hand; `mirror` makes a right one).
"""
import json
import math

import numpy as np

from measures import beside

FINGERS = ("finger1", "finger2", "finger3", "finger4", "finger5")  # thumb, index, middle, ring, little


def _unit(v):
    return v / np.linalg.norm(v)


def rotation(axis, degrees):
    a = _unit(np.asarray(axis, float))
    t = math.radians(degrees)
    k = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(t) * k + (1 - math.cos(t)) * k @ k


class Hand:
    """The rest mesh in hand space, its bones and weights."""

    def __init__(self, path=None):
        with open(path or beside("mhhand.json"), encoding="utf-8") as source:
            data = json.load(source)
        names = [b["name"] for b in data["bones"]]
        verts = np.array(data["verts"])
        heads = np.array([b["head"] for b in data["bones"]])
        tails = np.array([b["tail"] for b in data["bones"]])
        w = heads[names.index("wrist.L")]
        k = heads[names.index("finger3-1.L")]
        f = _unit(k - w)
        across = heads[names.index("finger2-1.L")] - heads[names.index("finger5-1.L")]
        t = _unit(across - f * across.dot(f))
        n = np.cross(t, f)
        thumb_tip = tails[names.index("finger1-3.L")]
        if (thumb_tip - w).dot(n) > 0:  # the thumb lies on the palm's side: the back faces away from it
            n, t = -n, -t
        self.frame = np.stack([t, f, n])  # rows: hand-space axes in the mesh's space
        to_hand = lambda p: (p - w) @ self.frame.T  # noqa: E731
        self.verts = to_hand(verts)
        self.heads, self.tails = to_hand(heads), to_hand(tails)
        self.names = names
        self.parent = [names.index(b["parent"]) if b["parent"] in names else -1 for b in data["bones"]]
        self.faces = data["faces"]
        self.weights = np.zeros((len(verts), len(names)))
        for v, pairs in enumerate(data["weights"]):
            for b, wt in pairs:
                self.weights[v, b] = wt
        self.weights /= np.maximum(self.weights.sum(1, keepdims=True), 1e-9)

    def bone(self, name):
        return self.names.index(name if name.endswith(".L") else name + ".L")


def pose_bones(hand, rot, scale):
    """Each bone's deformation x -> head' + R (S (x - head)), from local turns `rot` {index: 3x3, about the bone's
    head, in rest space} and stretches `scale` {index: (along, across)}. Children follow their parent's stretch."""
    count = len(hand.names)
    world_r = [None] * count
    head_p = [None] * count
    stretch = [None] * count
    for b in range(count):  # parents come before children in the list
        d = _unit(hand.tails[b] - hand.heads[b])
        along, across = scale.get(b, (1.0, 1.0))
        stretch[b] = across * np.eye(3) + (along - across) * np.outer(d, d)
        p = hand.parent[b]
        r = rot.get(b, np.eye(3))
        if p < 0:
            world_r[b], head_p[b] = r, hand.heads[b].copy()
        else:
            world_r[b] = world_r[p] @ r
            head_p[b] = head_p[p] + world_r[p] @ stretch[p] @ (hand.heads[b] - hand.heads[p])
    return [(head_p[b], world_r[b] @ stretch[b], hand.heads[b]) for b in range(count)]


def skin(points, weights, deforms):
    """Linear blend skinning of rest-space `points`."""
    out = np.zeros_like(points)
    for b, (head_p, m, head) in enumerate(deforms):
        wb = weights[:, b:b + 1]
        if not wb.any():
            continue
        out += wb * (head_p + (points - head) @ m.T)
    rest = 1.0 - weights.sum(1, keepdims=True)
    return out + rest * points
