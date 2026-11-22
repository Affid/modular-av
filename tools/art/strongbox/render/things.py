"""What comes onto the bare boards under the cameras, each piece rendered on its own in the room every picture of
the theme shares (the sun from the upper left and the studio's surroundings; no lamps, as the boards), on a shadow
catcher standing for the boards, so a piece and its shadow lie on the dock's own ground wherever the stylesheet
puts it.

  knife    a throwing knife stuck in the boards: the cut a dark slot with depth (its lower wall lit), the grain
           split along the boards from both ends of it, pale where the fibres tore, splinters lifted at its lips
  picks    a ring of lockpicks and a tension wrench on a nail, drawn bold enough to read at true size
  keys     a ring of old keys hung on a nail
  grapnel  a coil of laid hemp rope on an iron spike, its end seized to a small grappling hook

A piece's scene is `span` scene units across (measures.json), and its picture has `density` pixels to a CSS pixel.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402  (first: the paths)

import bpy  # noqa: E402
from mathutils import Matrix, Vector, noise  # noqa: E402

import materials  # noqa: E402
import shapes  # noqa: E402
from measures import option, out, picture, spec  # noqa: E402
from pixels import save_rgba  # noqa: E402

SEED = 41


# ---------------------------------------------------------------- the stage for a piece

def piece_stage(name, samples=256):
    """The room, a front camera over the piece's picture and a shadow catcher for the boards. Returns (scene,
    catcher, to_scene), where to_scene(x, y) takes the scene's hundredths from the picture's top left."""
    own = spec(name)
    w, h = picture(name)
    span = own["span"]
    tall = span * own["height"] / own["width"]
    scene = stage.stage(samples=samples, lamps=False, ceiling=False)
    stage.front_camera(scene, w, h, span)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    catcher = bpy.context.object
    catcher.scale = (span + 1, tall + 1, 1)
    catcher.is_shadow_catcher = True

    def to_scene(x, y):
        return ((x - span * 50) / 100.0, (tall * 50 - y) / 100.0)

    return scene, catcher, to_scene


def finish(scene, catcher, name, near=10):
    """The piece and its shadow, the shadow kept within `near` pixels of the piece."""
    path = out(name)
    stage.render(scene, path)
    whole, _ = stage.keep_close(scene, catcher, path, int(round(near * 1.3)), samples=32)
    save_rgba(whole, path)


# ---------------------------------------------------------------- materials and shapes

def steel(name="steel", tone=0.13, offset=(0, 0, 0)):
    """A blade's steel: grey, oiled, dulled by use (a mirror-smooth blade shows only the dark room), polished
    along its edges."""
    return materials.iron(name, tone=tone, scale=0.8, hammer=0.06, metallic=0.85, dull=0.0, rub=0.3, rub_bright=0.35,
                      edge_width=0.008, grime=0.3, offset=offset)


def old_iron(name, tone=0.045, offset=(0, 0, 0), dull=0.12):
    return materials.iron(name, tone=tone, scale=1.2, hammer=0.3, facet_scale=8.0, rub=0.18, rub_bright=0.26,
                      edge_width=0.01, offset=offset, dull=dull)


# ---------------------------------------------------------------- shapes

def frame_at(origin, u, w):
    """A matrix whose x is u (along a piece), y is w (across it), z their normal, placed at origin."""
    u = Vector(u).normalized()
    w = (Vector(w) - u * Vector(w).dot(u)).normalized()
    n = u.cross(w)
    m = Matrix((
        (u.x, w.x, n.x, origin[0]),
        (u.y, w.y, n.y, origin[1]),
        (u.z, w.z, n.z, origin[2]),
        (0, 0, 0, 1)))
    return m


def flat_piece(name, outline, thick, mat, matrix, bevel=0.004):
    """A flat piece cut to an outline in its own plane (x along, y across), `thick` through, then placed."""
    obj = shapes.outline_solid(name, outline, -thick / 2, thick / 2, mat, bevel=bevel, segments=2)
    obj.matrix_world = matrix
    return obj


def torus(name, at, major, minor, mat, rotation=(0, 0, 0), flat=1.0):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=64, minor_segments=16,
                                     location=at, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (1, 1, flat)
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def nail(name, at, mat, head_r=0.032, stand=0.0, square=False):
    """A nail driven into the boards: its head domed (or a square forged head), `stand` scene units of shank
    left out of the wood under the head for something to hang on."""
    x, y = at
    if stand > 0:
        shapes.rod(name + "-shank", (x, y, -0.01), (x, y, stand + 0.005), 0.011, mat)
    if square:
        pts = [(x - head_r, y - head_r), (x + head_r, y - head_r * 0.9), (x + head_r * 0.92, y + head_r),
               (x - head_r * 0.95, y + head_r * 0.95)]
        shapes.plate(name, pts, [(0.0, 0.0), (0.008, 0.012), (head_r * 0.6, 0.02), (head_r * 1.2, 0.024)], mat,
                    z0=stand)
    else:
        shapes.dome(name, (x, y), head_r, 0.022, mat, z=stand)


def raw_wood(name="raw-wood"):
    """The board's wood where fibres tore: the same planks, unoiled and paler, as fresh splits are."""
    return materials.wood(name, tint=(0.62, 0.48, 0.36), coords="Object", scale=1.0, photo="dark_wooden_planks")


# ---------------------------------------------------------------- the knife

def lens(centre, along, half_len, half_width, n=24):
    """A lens round a line (scene units): the shape of a cut a blade leaves in wood."""
    ex, ey = centre
    ax, ay = along
    top, bottom = [], []
    for k in range(n + 1):
        t = -1 + 2 * k / n
        bulge = half_width * (1 - t * t) ** 0.8
        x, y = ex + ax * half_len * t, ey + ay * half_len * t
        top.append((x - ay * bulge, y + ax * bulge))
        bottom.append((x + ay * bulge, y - ax * bulge))
    return top + bottom[::-1]


def cut_with_depth(entry, along, half_len, rng):
    """The slot the blade went in by: black at its bottom, its lower wall (facing the light from the upper left)
    showing as a pale crescent of crushed wood, so it reads as a hole with depth, and a darker bruise of crushed
    fibres round it."""
    ex, ey = entry
    ax, ay = along
    bruise = materials.black("bruise")
    bruise.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.45
    shapes.outline_solid("bruise", lens(entry, along, half_len * 1.5, 0.03), 0.0002, 0.0004, bruise, bevel=0)
    wall = raw_wood("cut-wall")
    shapes.outline_solid("cut-wall", lens((ex + 0.002, ey - 0.003), along, half_len * 1.12, 0.022), 0.0006, 0.0009, wall, bevel=0)
    # The hole itself, a little up and left of the wall, so only the wall's lower lip shows.
    hole = lens((ex - 0.003, ey + 0.004), along, half_len * 0.98, 0.01)
    depth = materials.black("cut-dark")
    depth.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.014, 0.009, 0.006, 1)
    shapes.outline_solid("cut", hole, 0.001, 0.0014, depth, bevel=0)


def split(name, start, side, length, rng, dark, pale):
    """A split along the grain from one end of the cut: a dark crack tapering away, a pale torn edge along its
    upper side, and a hair crack branching off it."""
    sx, sy = start
    core, edge = [], []
    n = 36
    for k in range(n + 1):
        t = k / n
        x = sx + side * length * t
        y = sy + 0.012 * noise.noise(Vector((x * 9.0, sy * 3.0 + side, 0.3))) + side * 0.004 * t
        width = 0.011 * (1 - t) ** 1.1 + 0.0007
        core.append((x, y, width))
    top = [(x, y + w) for x, y, w in core]
    bottom = [(x, y - w) for x, y, w in core]
    shapes.outline_solid(name, top + bottom[::-1], 0.0012, 0.0016, dark, bevel=0)
    lip = [(x, y + w) for x, y, w in core[: n * 3 // 4]]
    lip_out = [(x, y + w + 0.006 * (1 - k / n) + 0.001) for k, (x, y, w) in enumerate(core[: n * 3 // 4])]
    shapes.outline_solid(name + "-torn", lip + lip_out[::-1], 0.0008, 0.0011, pale, bevel=0)
    k0 = rng.randint(n // 4, n // 2)
    bx, by, _ = core[k0]
    branch = [(bx + side * 0.06 * j / 8, by - 0.018 * (j / 8) ** 1.3) for j in range(9)]
    hair = [(x, y + 0.0018 * (1 - j / 8)) for j, (x, y) in enumerate(branch)]
    hair += [(x, y - 0.0018 * (1 - j / 8)) for j, (x, y) in reversed(list(enumerate(branch)))]
    shapes.outline_solid(name + "-hair", hair, 0.0012, 0.0016, dark, bevel=0)


def splinters(entry, along, half_len, rng, count=6):
    """Fibres lifted at the cut's lips: splinters of fresh wood pried up along the grain, their roots at the cut
    standing off the boards, so each casts a small shadow."""
    ex, ey = entry
    ax, ay = along
    wood = raw_wood("splinter")
    for k in range(count):
        t = rng.uniform(-0.85, 0.85)
        side = 1 if k % 2 else -1
        x0 = ex + ax * half_len * t
        y0 = ey + ay * half_len * t + side * 0.014
        length = rng.uniform(0.06, 0.12)
        direction = rng.choice((-1, 1))
        pts = [(x0, y0 - 0.007), (x0 + direction * length, y0 + side * 0.003), (x0, y0 + 0.007)]
        piece = shapes.outline_solid(f"fibre{k}", pts, 0.0, 0.006, wood, bevel=0.001, segments=1)
        for v in piece.data.vertices:
            d = math.hypot(v.co.x - x0, v.co.y - y0)
            v.co.z += max(0.0, 0.06 - d * 0.7)


def entry_in_wood(entry, along, half_len, rng):
    """Where the blade went into the boards (not a small black wedge): the slot with depth, the grain
    split from both ends of it with torn pale edges, and splinters lifted at its lips."""
    ax, ay = along
    cut_with_depth(entry, along, half_len, rng)
    dark, pale = materials.black("split-dark"), raw_wood("torn")
    ends = [(entry[0] + ax * half_len, entry[1] + ay * half_len), (entry[0] - ax * half_len, entry[1] - ay * half_len)]
    for side, end, reach in zip((1, -1), ends, (0.3, 0.22)):
        split(f"split{side}", end, side, reach * rng.uniform(0.9, 1.1), rng, dark, pale)
    splinters(entry, along, half_len, rng)


def knife():
    """A throwing knife of one piece of forged steel, a ring at its end, thrown into the boards: the point and a
    third of the blade in the wood, the rest standing out down and to the left at about 35 degrees from the
    boards, its flat facing the room, its edge up."""
    scene, catcher, P = piece_stage("knife")
    rng = random.Random(SEED)
    entry = P(104, 26)
    u = Vector((-0.6, -0.38, 0.62)).normalized()  # out of the wood, toward the room: thrown from the lower left
    across = Vector((0.9, -0.3, 0.0))  # the blade's width, near the grain's line (the edge up)
    m = frame_at((entry[0], entry[1], 0.0), u, across)
    blade_mat = steel("blade")
    blade_len, grip_len = 0.42, 0.36
    # Nothing below the boards: the shadow catcher doesn't hide what is under it, and a buried point showed black.
    outline = []
    for k in range(21):
        s = -0.008 + (blade_len + 0.008) * k / 20
        outline.append((s, 0.034 + 0.006 * (s / blade_len)))
    outline += [(blade_len + 0.02, 0.018), (blade_len + grip_len, 0.016)]
    outline += [(blade_len + grip_len, -0.016), (blade_len + 0.02, -0.018)]
    for k in range(20, -1, -1):
        s = -0.008 + (blade_len + 0.008) * k / 20
        outline.append((s, -(0.03 + 0.004 * (s / blade_len))))
    flat_piece("knife", outline, 0.014, blade_mat, m, bevel=0.003)
    grip = [(blade_len + 0.04, 0.02), (blade_len + grip_len - 0.04, 0.019), (blade_len + grip_len - 0.04, -0.019),
            (blade_len + 0.04, -0.02)]
    flat_piece("grip", grip, 0.026, old_iron("grip-iron", tone=0.03), m, bevel=0.006)
    for k, s in enumerate((blade_len + 0.11, blade_len + 0.25)):
        p = m @ Vector((s, 0, 0.013))
        shapes.dome(f"grip-rivet{k}", (p.x, p.y), 0.009, 0.004, steel("rivet"), z=p.z)
    ring = torus("ring", (0, 0, 0), 0.045, 0.011, blade_mat)
    ring.matrix_world = m @ Matrix.Translation((blade_len + grip_len + 0.045, 0, 0))
    a = across.normalized()
    entry_in_wood(entry, (a.x, a.y), 0.042, rng)
    finish(scene, catcher, "knife", near=16)


# ---------------------------------------------------------------- keys and picks

def key_shape(length, bit_w, bit_h, wards, rng):
    """A warded key's shank and bit in its own plane: x down the key from the bow's foot, y across, the bit on
    the +y side at the end. Returns the bit's outline (the shank is a rod)."""
    pts = [(length - bit_h, 0.0), (length - bit_h, bit_w)]
    # The wards: notches cut into the bit's far edge.
    step = bit_h / (wards * 2 + 1)
    x = length - bit_h
    for k in range(wards):
        x += step
        depth = bit_w * rng.uniform(0.25, 0.5)
        pts += [(x, bit_w), (x, bit_w - depth), (x + step, bit_w - depth), (x + step, bit_w)]
        x += step
    pts += [(length, bit_w), (length, 0.0)]
    return pts


def hung_on_ring(name, ring_c, ring_r, wire_z, angle_on_ring, turn_deg, length, mat, bow_r, kind, rng, bold=1.0):
    """One key (or pick) hung on the ring: its bow threaded on the ring's wire where the ring's angle is
    `angle_on_ring` (radians, -pi/2 the bottom), hanging straight down from there, turned `turn_deg` from facing
    the room about the vertical, its lower end resting against the boards."""
    cx, cy = ring_c
    wx = cx + ring_r * math.cos(angle_on_ring)
    wy = cy + ring_r * math.sin(angle_on_ring)
    turn = math.radians(turn_deg)
    # The key's own frame: x down (gravity), y across (turned), its plane leaning back so the far end touches
    # the boards.
    lean = math.atan2(wire_z - 0.012, length + bow_r * 2)
    down = Vector((0.0, -math.cos(lean), -math.sin(lean)))
    across = Vector((math.cos(turn), 0.0, math.sin(turn)))
    top = Vector((wx, wy, wire_z))
    # The bow: its hole round the wire, the wire through its upper part.
    bow_c = top + down * (bow_r * 0.62)
    m = frame_at(bow_c, down, across)
    torus(name + "-bow", (0, 0, 0), bow_r, bow_r * 0.26, mat, flat=0.55).matrix_world = m @ Matrix.Rotation(
        0, 4, "X")
    foot = bow_r * 1.0
    if kind == "key":
        key_body(name, m, foot, length, bow_r, mat, rng)
    else:
        pick_body(name, m, foot, length, kind, mat, bold)


def key_body(name, m, foot, length, bow_r, mat, rng):
    """A key's collar, round shank and warded bit, in the key's own frame `m`."""
    shapes.rod(name + "-collar", tuple(m @ Vector((foot, 0, 0))), tuple(m @ Vector((foot + 0.026, 0, 0))), 0.021, mat)
    shapes.rod(name + "-shank", tuple(m @ Vector((foot + 0.02, 0, 0))), tuple(m @ Vector((length, 0, 0))), 0.0145, mat)
    bit = key_shape(length, 0.06 + bow_r * 0.3, 0.075, rng.choice((1, 2, 2, 3)), rng)
    flat_piece(name + "-bit", bit, 0.013, mat, m, bevel=0.002)


def pick_tip(kind, L, b):
    """A pick's working end in its own plane, from the shaft's end at L: a hook, a rake, a half diamond, or the
    tension wrench's short leg bent across."""
    k2, w4 = 2.0 * b, 0.0045 * b
    if kind == "hook":
        return [(L - 0.004, w4), (L + 0.02 * k2, w4), (L + 0.026 * k2, 0.018 * k2), (L + 0.017 * k2, 0.02 * k2),
                (L + 0.013 * k2, 0.008 * k2), (L + 0.013 * k2, -w4), (L - 0.004, -w4)]
    if kind == "rake":
        tip = [(L - 0.004, w4)]
        for j in range(3):
            tip += [(L + 0.016 * j * k2 / 1.4, w4), (L + (0.016 * j + 0.008) * k2 / 1.4, 0.014 * k2)]
        return tip + [(L + 0.05 * k2 / 1.4, w4), (L + 0.05 * k2 / 1.4, -w4), (L - 0.004, -w4)]
    if kind == "diamond":
        return [(L - 0.004, w4), (L + 0.012 * k2, 0.015 * k2), (L + 0.026 * k2, w4), (L + 0.03 * k2, -w4),
                (L - 0.004, -w4)]
    e = 0.006 * b
    return [(L - 0.01, e), (L + 0.008 * b, e), (L + 0.008 * b, 0.07 * b), (L - 0.008 * b, 0.07 * b),
            (L - 0.008 * b, 0.014 * b), (L - 0.01, -e)]


def pick_body(name, m, foot, length, kind, mat, b):
    """A pick: a thin flat strip of steel, a wider handle under the eye, the shaft narrowing to the working end."""
    hl = foot + (length - foot) * 0.38
    strip = [(foot, 0.013 * b), (hl, 0.012 * b), (hl + 0.03, 0.0055 * b), (length, 0.0045 * b),
             (length, -0.0045 * b), (hl + 0.03, -0.0055 * b), (hl, -0.012 * b), (foot, -0.013 * b)]
    flat_piece(name + "-strip", strip, 0.005 * b, mat, m, bevel=0.001 * b)
    flat_piece(name + "-tip", pick_tip(kind, length, b), 0.005 * b, mat, m, bevel=0.001 * b)


def ring_on_nail(nail_at, ring_r, wire_r, mat, nail_mat, stand=0.05):
    """A ring hung on a nail's shank between its head and the boards: the shank in the ring's top, the ring
    parallel to the boards, its lower part resting against them (tilted a little), the head over its top."""
    nx, ny = nail_at
    nail("nail", nail_at, nail_mat, head_r=0.03, stand=stand, square=True)
    ring_c = (nx, ny - ring_r + wire_r + 0.011)
    tilt = math.atan2(stand * 0.55 - wire_r, ring_r * 2)
    ring = torus("ring", (ring_c[0], ring_c[1], stand * 0.55 - ring_r * math.sin(tilt)), ring_r, wire_r, mat,
                 rotation=(-tilt, 0, 0))
    return ring_c, stand * 0.55


def keys():
    """Four old keys of three sizes on a ring of iron wire, hung on a nail."""
    scene, catcher, P = piece_stage("keys")
    rng = random.Random(SEED + 1)
    wire = old_iron("ring-iron", tone=0.05)
    nail_mat = old_iron("nail-iron", tone=0.04, offset=(0.4, 0.1, 0))
    ring_c, wire_z = ring_on_nail(P(45, 10), 0.16, 0.012, wire, nail_mat)
    specs = [(-1.98, 30, 0.5, 0.058, 0.04), (-1.7, 55, 0.62, 0.07, 0.05), (-1.44, 15, 0.55, 0.062, 0.045),
             (-1.18, 45, 0.4, 0.05, 0.036)]
    for k, (a, turn, length, bow_r, tone) in enumerate(specs):
        mat = old_iron(f"key-iron{k}", tone=tone, offset=(0.3 * k, 0.17 * k, 0))
        hung_on_ring(f"key{k}", ring_c, 0.16, wire_z, a, turn, length, mat, bow_r, "key", rng)
    finish(scene, catcher, "keys", near=14)


def picks():
    """Three picks and a tension wrench on a ring of steel wire on a nail of their own, larger and bolder than
    life so the hook, the rake's teeth, the half diamond and the wrench's bent leg read at true size: the strips
    wide, the working ends large, the steel polished, each piece hung a little apart and turned near face on."""
    scene, catcher, P = piece_stage("picks")
    rng = random.Random(SEED + 2)
    wire = steel("pick-ring", tone=0.09)
    nail_mat = old_iron("nail-iron", tone=0.04, offset=(0.2, 0.5, 0))
    ring_r = 0.14
    ring_c, wire_z = ring_on_nail(P(38, 10), ring_r, 0.0095, wire, nail_mat, stand=0.045)
    specs = [(-2.25, 10, 0.5, "hook"), (-1.85, 6, 0.62, "rake"), (-1.45, 14, 0.56, "diamond"),
             (-1.02, 4, 0.4, "wrench")]
    for k, (a, turn, length, kind) in enumerate(specs):
        mat = steel(f"pick-steel{k}", tone=0.12 + 0.012 * k, offset=(0.2 * k, 0.1 * k, 0))
        hung_on_ring(f"pick{k}", ring_c, ring_r, wire_z, a, turn, length, mat, 0.034, kind, rng, bold=1.7)
    finish(scene, catcher, "picks", near=12)


# ---------------------------------------------------------------- the rope and the grappling hook

def hemp(name="hemp"):
    """Old hemp rope: a dull grey-brown, rough, a little lighter on its worn high points."""
    mat, nodes, links, bsdf = materials._new(name)
    coord = nodes.new("ShaderNodeTexCoord")
    tex = nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 90.0
    tex.inputs["Detail"].default_value = 6.0
    links.new(coord.outputs["Object"], tex.inputs["Vector"])
    colour = materials._mix(nodes, links, (0.075, 0.058, 0.04, 1), (0.13, 0.105, 0.075, 1),
                        materials._ramp(nodes, links, tex.outputs["Fac"], 0.35, 0.65, 0.0, 1.0))
    links.new(colour, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.95
    bsdf.inputs["Specular IOR Level"].default_value = 0.15
    bump = materials._n(nodes, "ShaderNodeBump", Strength=0.6, Distance=0.003)
    links.new(tex.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def laid_rope(name, path, mat, radius=0.017, pitch=0.07):
    """A three-strand rope along a path of 3D points: three strands wound round the path (offsets turned along
    it in a frame carried with the path), so the lay shows as real twist."""
    pts = [Vector(p) for p in path]
    tangents = []
    for k in range(len(pts)):
        a, b = pts[max(0, k - 1)], pts[min(len(pts) - 1, k + 1)]
        tangents.append((b - a).normalized())
    normal = tangents[0].orthogonal().normalized()
    frames = []
    for t in tangents:
        normal = (normal - t * normal.dot(t)).normalized()
        frames.append((normal, t.cross(normal)))
    s = 0.0
    strands = [[], [], []]
    for k, p in enumerate(pts):
        if k:
            s += (pts[k] - pts[k - 1]).length
        th = 2 * math.pi * s / pitch
        n, b = frames[k]
        for j in range(3):
            a = th + 2 * math.pi * j / 3
            q = p + (n * math.cos(a) + b * math.sin(a)) * radius * 0.5
            strands[j].append((q.x, q.y, q.z))
    for j in range(3):
        shapes.tube_along(f"{name}-strand{j}", strands[j], radius * 0.55, mat, resolution=8)


def coil_path(spike, top, loops=5):
    """The coil hung on the spike: loops of a little different size, each lying on the ones under it at its
    foot and up off the boards at the spike."""
    path = []
    for i in range(loops):
        wl = 0.36 + 0.05 * math.sin(i * 1.7)
        hl = 0.78 + 0.06 * math.cos(i * 2.3)
        z0 = 0.02 + 0.022 * i
        for k in range(160):
            a = 2 * math.pi * k / 160
            y = top - hl * (1 - math.cos(a)) / 2
            x = spike[0] + 0.012 * (i - 2) + wl / 2 * math.sin(a) * ((1 - math.cos(a)) / 2) ** 0.35
            path.append((x, y, z0 + 0.03 * (math.cos(a) + 1) / 2))
    return path


def free_end(path, stand_x, wire_y):
    """The rope's free end: down the coil's right side to the hook's ring, down through the ring's top from in
    front, round under its wire and back up in front of itself (a round turn, seized to the standing part)."""
    last = path[-1]
    end = []
    for k in range(1, 81):
        t = k / 80
        end.append((last[0] + (stand_x - last[0]) * t + 0.1 * math.sin(math.pi * t),
                    last[1] + (wire_y + 0.1 - last[1]) * t, last[2] * (1 - t) + 0.05 * t))
    turn = [(stand_x, wire_y + 0.06, 0.05), (stand_x, wire_y + 0.015, 0.04), (stand_x + 0.004, wire_y - 0.012, 0.012),
            (stand_x + 0.014, wire_y - 0.03, 0.03), (stand_x + 0.026, wire_y - 0.012, 0.068),
            (stand_x + 0.03, wire_y + 0.03, 0.075), (stand_x + 0.03, wire_y + 0.12, 0.07)]
    for k in range(1, len(turn)):
        a, b = Vector(turn[k - 1]), Vector(turn[k])
        end += [tuple(a.lerp(b, j / 10)) for j in range(1, 11)]
    return end


def hook(ring_at, ring_r, iron):
    """The grappling hook: a ring, the shank down, three flukes, two spread to the sides and one turned toward the
    room, each ending in a point."""
    torus("hook-ring", (ring_at[0], ring_at[1], 0.04), ring_r, 0.011, iron, rotation=(math.radians(25), 0, 0))
    sx, sy = ring_at[0], ring_at[1] - ring_r
    foot = (sx, sy - 0.42)
    shapes.rod("shank", (sx, sy, 0.035), (foot[0], foot[1], 0.035), 0.016, iron)
    for k, (dx, dz) in enumerate(((-1.0, 0.0), (1.0, 0.0), (0.0, 1.0))):
        pts = []
        for j in range(25):
            a = math.pi * 0.62 * j / 24
            lateral = 0.13 * math.sin(a)
            pts.append((foot[0] + dx * lateral, foot[1] + 0.13 * (1 - math.cos(a)) * 1.25, 0.035 + dz * lateral * 0.9))
        shapes.tube_along(f"fluke{k}", pts, 0.013, iron, resolution=8)
        tip, prev = Vector(pts[-1]), Vector(pts[-3])
        d = (tip - prev).normalized()
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.016, radius2=0.0, depth=0.05, location=tip + d * 0.02)
        cone = bpy.context.object
        cone.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
        cone.data.materials.append(iron)


def grapnel():
    """A coil of rope hung on an iron spike in the boards, its end tied to a small grappling hook that hangs
    under the coil against the boards."""
    scene, catcher, P = piece_stage("grapnel")
    spike = P(55, 14)
    top = spike[1] - 0.025
    ring_at, ring_r = (spike[0] + 0.06, top - 1.1), 0.042
    stand_x, wire_y = ring_at[0] - 0.012, ring_at[1] + ring_r
    path = coil_path(spike, top)
    laid_rope("rope", path + free_end(path, stand_x, wire_y), hemp())
    twine = materials.thread("twine", colour=(0.05, 0.04, 0.03))
    for k in range(3):
        torus(f"seizing{k}", (stand_x + 0.015, wire_y + 0.06 + 0.012 * k, 0.058), 0.03, 0.0045, twine,
              rotation=(math.pi / 2, 0, 0), flat=1.0)
    hook(ring_at, ring_r, old_iron("grapnel-iron", tone=0.05))
    finish(scene, catcher, "grapnel", near=14)


def main():
    only = option("--only")
    for name, make in (("knife", knife), ("picks", picks), ("keys", keys), ("grapnel", grapnel)):
        if not only or name in only.split(","):
            make()


main()
