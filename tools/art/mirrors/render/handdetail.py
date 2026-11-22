"""Round 3 detail for the MakeHuman hand: fingers reshaped round their own bones (tapering, a gaunt waist between
the joints, knobbed joints, a flattened pad at the tip), creases over the back of each joint, tendons, hollows and
veins on the back of the hand, and nail plates set into the finger with skin folded over their sides."""
import math
import random

import bpy
import numpy as np


def subdivided(hand, levels=3, name="hand"):
    """The rest mesh in hand space, subdivided, with the rig's weights carried along. Returns the object and the
    subdivided vertices, normals and weights."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(p) for p in hand.verts], [], hand.faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for b, bone in enumerate(hand.names):
        group = obj.vertex_groups.new(name=bone)
        for v in np.nonzero(hand.weights[:, b] > 0)[0]:
            group.add([int(v)], float(hand.weights[v, b]), "REPLACE")
    sub = obj.modifiers.new("subdivide", "SUBSURF")
    sub.levels = levels
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=sub.name)
    mesh.shade_smooth()
    count = len(mesh.vertices)
    verts = np.zeros(count * 3)
    mesh.vertices.foreach_get("co", verts)
    normals = np.zeros(count * 3)
    mesh.vertices.foreach_get("normal", normals)
    weights = np.zeros((count, len(hand.names)))
    for v in mesh.vertices:
        for g in v.groups:
            weights[v.index, g.group] = g.weight
    weights /= np.maximum(weights.sum(1, keepdims=True), 1e-9)
    return obj, verts.reshape(-1, 3), normals.reshape(-1, 3), weights


def _smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def _segment_distance(p, a, b):
    """Distance in the hand's plane (x, y) from points `p` to the segment a-b."""
    ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1), t


def _wiggle(points, rng, amount=0.025, steps=6):
    """A drawn path broken into short segments with a little lateral wander: veins are never straight."""
    out = [np.array(points[0], float)]
    for a, b in zip(points[:-1], points[1:]):
        a, b = np.array(a, float), np.array(b, float)
        side = np.array([-(b - a)[1], (b - a)[0]])
        side /= np.linalg.norm(side)
        phase = rng.uniform(0, 6.28)
        for k in range(1, steps + 1):
            t = k / steps
            out.append(a + (b - a) * t + side * amount * math.sin(phase + t * 3.1) * (0.3 if k == steps else 1.0))
    return out


# Veins over the back of a left hand and the forearm (hand space x, y): two up the forearm's sides, one between,
# an arch across the back of the hand and branches to the webs between the fingers.
VEINS = (
    ((0.30, -1.2), (0.30, -0.6), (0.24, -0.1), (0.18, 0.30), (0.14, 0.58), (0.27, 0.74)),
    ((-0.34, -1.2), (-0.33, -0.55), (-0.27, 0.05), (-0.24, 0.38), (-0.20, 0.60)),
    ((0.02, -1.0), (0.06, -0.5), (0.0, -0.05), (-0.05, 0.30), (-0.09, 0.55)),
    ((-0.33, 0.66), (-0.12, 0.55), (0.13, 0.58)),
    ((0.12, 0.60), (0.14, 0.86)),
    ((-0.08, 0.56), (-0.10, 0.84)),
    ((-0.25, 0.61), (-0.29, 0.78)),
)


def set_attribute(mesh, name, values):
    values = np.asarray(values, dtype=np.float32)
    if values.ndim == 1:
        attr = mesh.attributes.new(name, "FLOAT", "POINT")
        attr.data.foreach_set("value", values)
    else:
        attr = mesh.attributes.new(name, "FLOAT_VECTOR", "POINT")
        attr.data.foreach_set("vector", values.ravel())


def _finger_frame(hand, f):
    """The finger's polyline (MCP head, PIP, DIP, tip) and an up (back of the finger) direction per bone."""
    bones = [hand.bone(f"finger{f}-{j}") for j in (1, 2, 3)]
    pts = [hand.heads[bones[0]]] + [hand.tails[b] for b in bones]
    ups = []
    for b in bones:
        d = hand.tails[b] - hand.heads[b]
        d = d / np.linalg.norm(d)
        up = np.array([0, 0, 1.0]) - d * d[2]
        ups.append(up / np.linalg.norm(up))
    return bones, np.array(pts), ups


def _along(verts, pts):
    """Each vertex's distance along the finger polyline (from the MCP head), the axis point, segment index."""
    best_d = np.full(len(verts), np.inf)
    t_all = np.zeros(len(verts))
    seg = np.zeros(len(verts), dtype=int)
    axis = np.zeros_like(verts)
    start = 0.0
    for k in range(3):
        a, b = pts[k], pts[k + 1]
        ab = b - a
        length = np.linalg.norm(ab)
        t = np.clip(((verts - a) @ ab) / (length * length), -0.6 if k == 0 else 0.0, 1.0 if k < 2 else 1.6)
        p = a + t[:, None] * ab
        d = np.linalg.norm(verts - p, axis=1)
        better = d < best_d
        best_d = np.where(better, d, best_d)
        t_all = np.where(better, start + t * length, t_all)
        seg = np.where(better, k, seg)
        axis = np.where(better[:, None], p, axis)
        start += length
    return t_all, axis, seg


def reshape_fingers(hand, verts, weights, seed=5):
    """Old, gaunt fingers: taper, waists between the joints, knobs at the joints (varied per finger), a pad flattened
    like a spatula at the tip. Radial scaling round each finger's bones, blended out where the finger meets the palm."""
    rng = random.Random(seed)
    out = verts.copy()
    for f in range(2, 6):
        bones, pts, ups = _finger_frame(hand, f)
        lengths = [np.linalg.norm(pts[k + 1] - pts[k]) for k in range(3)]
        total = sum(lengths)
        pip, dip = lengths[0], lengths[0] + lengths[1]
        mine = _smooth(weights[:, bones].sum(1), 0.35, 0.9)
        sel = mine > 0
        v = verts[sel]
        t, axis, seg = _along(v, pts)
        up = np.array(ups)[seg]
        d = np.array([(pts[k + 1] - pts[k]) / lengths[k] for k in range(3)])[seg]
        side = np.cross(d, up)
        r = v - axis
        r_up, r_side = (r * up).sum(1), (r * side).sum(1)
        dorsal = _smooth(r_up / np.maximum(np.hypot(r_up, r_side), 1e-6), -0.4, 0.5)
        knob_pip = rng.uniform(0.75, 1.25)
        knob_dip = rng.uniform(0.75, 1.25)
        waist = (np.exp(-((t - 0.52 * pip) / (0.24 * pip)) ** 2) +
                 np.exp(-((t - pip - 0.5 * lengths[1]) / (0.26 * lengths[1])) ** 2))
        waist *= 0.6 + 0.4 * dorsal  # the pads underneath stay fuller
        knobs = (0.07 * knob_pip * np.exp(-((t - pip) / 0.04) ** 2) +
                 0.055 * knob_dip * np.exp(-((t - dip) / 0.032) ** 2))
        taper = 1.0 - 0.10 * np.clip(t / total, 0, 1)
        start = _smooth(t, 0.02, 0.12)  # nothing changes at the knuckle itself
        s_side = 1 + start * (taper * (1 - 0.09 * waist) * (1 + knobs) - 1)
        s_up = 1 + start * (taper * (1 - 0.08 * waist) * (1 + knobs * (0.4 + 0.6 * dorsal)) - 1)
        pad = _smooth(t, dip + 0.3 * lengths[2], dip + 0.6 * lengths[2])
        s_up *= 1 - 0.13 * pad
        s_side *= 1 + 0.07 * pad
        new = axis + up * (r_up * s_up)[:, None] + side * (r_side * s_side)[:, None] + d * ((r * d).sum(1))[:, None]
        m = mine[sel][:, None]
        out[sel] = v + (new - v) * m
    # The wrist thinner than the knuckle row: the forearm narrows as it goes into the glass.
    wrist = 1 - 0.2 * _smooth(-out[:, 1], -0.35, 0.15)
    out[:, 0] *= wrist
    out[:, 2] = (out[:, 2] + 0.03) * wrist - 0.03
    return out


def creases(hand, verts, normals, weights, seed=13):
    """Creases over the back of each finger joint as height (negative = groove), one array per (finger, joint),
    so they can be deepened or smoothed by how far that joint is bent. 2-4 arcs of uneven length and spacing,
    wrapping about 120 degrees round the back of the finger."""
    rng = random.Random(seed)
    parts = {}
    for f in range(2, 6):
        bones, pts, ups = _finger_frame(hand, f)
        mine = weights[:, bones].sum(1)
        for j in range(3):  # 0: MCP knuckle, 1: PIP, 2: DIP
            b = bones[j]
            d = pts[j + 1] - pts[j]
            d = d / np.linalg.norm(d)
            up = ups[j]
            side = np.cross(d, up)
            rel = verts - pts[j]
            u, s, h = rel @ d, rel @ side, rel @ up
            angle = np.degrees(np.arctan2(s, h))  # 0 on top of the finger
            near = (np.abs(u) < 0.08) & (h > -0.02) & ((mine > 0.3) if j else (weights[:, b] > 0.2))
            field = np.zeros(len(verts))
            count = rng.choice((2, 3, 3, 4)) + (1 if j == 1 else 0)
            offsets = sorted(rng.uniform(-0.02, 0.024) for _ in range(count))
            bow = rng.uniform(0.012, 0.024) * rng.choice((1, 1, -1))
            for k, off in enumerate(offsets):
                half = rng.uniform(32, 64)  # each arc's reach either side of the top, degrees
                centre = rng.uniform(-14, 14)
                depth = rng.uniform(0.5, 1.0) * (1.4 if j == 1 else 1.0)
                width = rng.uniform(0.0035, 0.0055)
                a = (angle[near] - centre) / half
                line = off + 0.35 * j * 0.0 + bow * a * a + 0.004 * math.sin(k * 2.3)
                groove = np.exp(-((u[near] - line) / width) ** 2) * np.clip(1 - a * a, 0, 1) ** 0.7
                field[near] = np.minimum(field[near], -depth * groove)
            parts[(f, j)] = field
    return parts


def details(hand, verts, normals, weights, seed=11, vein=1.0, gaunt=1.0):
    """Displacements along the normals (tendons, knuckle heads, hollows, veins on the back of the hand) and masks."""
    rng = random.Random(seed)
    xy = verts[:, :2]
    back = _smooth(normals[:, 2], 0.15, 0.6) * _smooth(verts[:, 2], -0.05, 0.05)
    heads = {f: hand.heads[hand.bone(f"finger{f}-1")] for f in range(2, 6)}
    on_back = back * _smooth(verts[:, 1], -1.6, -1.2) * (1 - _smooth(verts[:, 1], 0.95, 1.05))
    disp = np.zeros(len(verts))
    tendon_near = np.zeros(len(verts))
    tendon = np.zeros(len(verts))
    for f, head in heads.items():
        start = np.array([head[0] * 0.3, 0.12])
        d, t = _segment_distance(xy, start, head[:2])
        ridge = np.exp(-(d / 0.03) ** 2) * _smooth(t, 0.0, 0.25)
        tendon = np.maximum(tendon, ridge * on_back)
        tendon_near = np.maximum(tendon_near, np.exp(-(d / 0.07) ** 2))
        disp += 0.024 * gaunt * ridge * on_back
        knuckle = np.exp(-(np.linalg.norm(verts - (head + np.array([0, 0.02, 0.08])), axis=1) / 0.07) ** 2)
        disp += 0.022 * gaunt * knuckle * back
    hollow = on_back * (1 - tendon_near) * _smooth(verts[:, 1], 0.25, 0.4) * (1 - _smooth(verts[:, 1], 0.75, 0.9))
    disp -= 0.012 * gaunt * hollow
    veins = np.zeros(len(verts))
    for path in VEINS:
        pts = _wiggle(path, rng)
        for a, b in zip(pts[:-1], pts[1:]):
            d, _ = _segment_distance(xy, a, b)
            veins = np.maximum(veins, np.exp(-(d / 0.02) ** 2))
    come_go = 0.55 + 0.45 * np.sin(verts[:, 1] * 9.0 + verts[:, 0] * 5.0 + rng.uniform(0, 6))
    veins *= on_back * come_go
    disp += 0.014 * vein * veins

    nailbed = np.zeros(len(verts))
    tip = np.zeros(len(verts))
    stretch = np.zeros(len(verts))  # skin pulled over a joint (where a bend makes it shine)
    for f in range(2, 6):
        bones, pts, ups = _finger_frame(hand, f)
        for j in (1, 2):
            rel = verts - pts[j]
            d = pts[j + 1] - pts[j]
            d = d / np.linalg.norm(d)
            u = rel @ d
            facing = _smooth(normals @ ups[j], 0.3, 0.8)
            stretch = np.maximum(stretch, np.exp(-(u / 0.035) ** 2) * facing * _smooth(weights[:, bones].sum(1), 0.4, 0.8))
        b = bones[2]
        d = pts[3] - pts[2]
        length = np.linalg.norm(d)
        d = d / length
        rel = verts - pts[2]
        u = (rel @ d) / length
        on_distal = _smooth(weights[:, b], 0.5, 0.8)
        nailbed = np.maximum(nailbed, on_distal * _smooth(u, 0.36, 0.44) * _smooth(normals @ ups[2], 0.45, 0.62))
        tip = np.maximum(tip, on_distal * _smooth(u, 0.2, 0.9))
    for f in range(2, 6):  # the knuckle heads stretch the skin too
        stretch = np.maximum(stretch, np.exp(-(np.linalg.norm(verts - (heads[f] + np.array([0, 0.02, 0.07])), axis=1)
                                                / 0.06) ** 2) * back)
    return dict(disp=disp, veins=veins, back=back, nailbed=nailbed, tip=tip, tendon=tendon, stretch=stretch)


def nail_sheets(hand, verts, normals, weights, overhang=0.17, rows=14, cols=9):
    """Nail plates set into the finger: covering the end of the distal segment's back, a rounded cuticle edge, the
    sides tucked under the skin's folds, and a long thick free edge run past the fingertip, hooking down. Each sheet
    follows the finger's own surface (rest hand space) and carries the bone it belongs to."""
    sheets = []
    for f in range(2, 6):
        b = hand.bone(f"finger{f}-3")
        d = hand.tails[b] - hand.heads[b]
        length = np.linalg.norm(d)
        d = d / length
        up = np.array([0, 0, 1.0]) - d * d[2]
        up = up / np.linalg.norm(up)
        side = np.cross(d, up)
        on = (weights[:, b] > 0.5) & ((normals @ up) > 0.2)
        rel = verts[on] - hand.heads[b]
        u, s, h = rel @ d, rel @ side, rel @ up
        u_tip = (verts[weights[:, b] > 0.5] - hand.heads[b]) @ d
        u1 = u_tip.max() - 0.035  # where the plate leaves the flesh, a little short of the very tip
        u0 = 0.42 * length  # the cuticle's middle
        near_end = (u > u1 - 0.06) & (u < u1)
        half = 0.5 * (s[near_end].max() - s[near_end].min())
        mid_s = 0.5 * (s[near_end].max() + s[near_end].min())

        def surface(uu, ss):
            w = np.exp(-(((u - uu) / 0.012) ** 2 + ((s - ss) / 0.012) ** 2))
            return float((w * h).sum() / max(w.sum(), 1e-9))

        h_end = surface(u1 - 0.01, mid_s)
        slope = (h_end - surface(u1 - 0.05, mid_s)) / 0.04
        pts, free, along = [], [], []
        for i in range(rows + 1):
            t = i / rows
            for k in range(cols + 1):
                q = (k / cols) * 2 - 1
                start = u0 + 0.22 * (u1 - u0) * q * q  # the cuticle curves back at the sides
                uu = start + (u1 + overhang - start) * t
                past = max(0.0, uu - u1) / overhang
                width = half * 0.66 * (1 - 0.45 * past ** 1.3)
                ss = mid_s + q * width
                if uu <= u1:
                    hh = surface(uu, ss) + 0.004
                    tuck = (1 - _smooth(np.array(abs(q)), 0.7, 1.0)) * 1.0
                    hh -= 0.006 * (1 - float(tuck)) + 0.004 * max(0.0, 1 - t * 6)  # under the folds
                else:
                    hh = h_end + 0.004 + slope * 0.3 * (uu - u1) - 0.22 * (uu - u1) ** 2 / overhang - \
                        0.25 * half * q * q
                pts.append(hand.heads[b] + d * uu + side * ss + up * hh)
                free.append(past)
                along.append(min(1.0, max(0.0, (uu - start) / max(u1 - start, 1e-6))))
        faces = []
        for i in range(rows):
            for k in range(cols):
                a = i * (cols + 1) + k
                faces.append((a, a + 1, a + cols + 2, a + cols + 1))
        sheets.append(dict(bone=b, verts=np.array(pts), faces=faces, free=np.array(free), along=np.array(along)))
    return sheets
