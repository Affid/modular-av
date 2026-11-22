"""What a window's lock shows of its player, beyond the lamp: the keyhole's cover open or shut; muted, the iron
shutter slid down and the hasp folded over with a padlock on it; deafened, a rag stuffed into the keyhole; out of
the call, the lock forced off its fixing."""
import math
import random

import bpy
from mathutils import Matrix, Vector, noise

import materials
import shapes
from measures import KEYHOLE, place
from stage import link


# ---------------------------------------------------------------- the keyhole's cover

def drop_cover(mat, angle_deg, pin=(500, -44), scale=1.0):
    """The keyhole's cover, a teardrop of thin iron hung on a pin over the keyhole, turned by `angle_deg`."""
    px, py = place(*pin)
    local = shapes.circle_points(0, 0, 0.08 * scale, 24) + shapes.circle_points(0, -0.66 * scale, 0.24 * scale, 40)
    a = math.radians(angle_deg)
    pts = [(px + x * math.cos(a) - y * math.sin(a), py + x * math.sin(a) + y * math.cos(a))
           for x, y in shapes.hull(local)]
    cover = shapes.outline_solid("cover", pts, 0.31, 0.35, mat, bevel=0.014, segments=2)
    pin_head = shapes.dome("pin", (px, py), 0.055, 0.04, mat, z=0.345)
    return {"cover": [cover, pin_head]}


def slide_cover(mat, closed):
    """A slide of thin iron in two guides, a thumb nib on its face; open, it stands mostly to the right of the
    hole, its edge just clear of the keyhole's round."""
    sheet = materials.iron("slide-iron", tone=0.07, scale=0.6, hammer=0.15, metallic=0.7, rub=0.3, rub_bright=0.35,
                           edge_width=0.02, offset=(0.5, 0.3, 0))
    left = 470.0 if closed else 521.0
    x0, y0 = place(left, -40)
    x1, y1 = place(left + 60, 44)
    slide = shapes.outline_solid("slide", [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], 0.28, 0.305, sheet, bevel=0.01,
                                 segments=2)
    nib = shapes.dome("slide-nib", place(left + 30, 2), 0.06, 0.035, sheet, z=0.3)
    guides = []
    for k, (ya, yb) in enumerate(((-48, -36), (40, 52))):
        a0, a1 = place(420, ya)
        b0, b1 = place(598, yb)
        bar = shapes.outline_solid(f"guide{k}", [(a0, a1), (b0, a1), (b0, b1), (a0, b1)], 0.27, 0.33, mat,
                                   bevel=0.012, segments=2)
        heads = [shapes.dome(f"guide-rivet{k}{j}", place(x, (ya + yb) / 2), 0.035, 0.02, mat, z=0.325)
                 for j, x in enumerate((428, 590))]
        guides.append([bar, *heads])
    return {"slide": [slide, nib], "guides": guides}


def cover(lock, mat, closed):
    """The keyhole's cover for each kind: the shield's teardrop on a pin swung right; the rose's smaller one on a
    pin at its top swung left; the lock case's slide pushed right along its guides, or across the hole."""
    if lock == "shield":
        return drop_cover(mat, 0 if closed else 122)
    if lock == "round":
        return drop_cover(mat, 0 if closed else -118, pin=(500, -40), scale=0.8)
    return slide_cover(mat, closed)


# ---------------------------------------------------------------- muted

def shutter(sheet, lip_mat):
    """The window's iron shutter, slid down out of a slot under the top strap to the limit the picture allows
    (its rolled lip ends at y 84): a dark slot where it leaves the strap, two pressed ribs, a face lighter than the
    strap, and a rolled lip along its lower edge, rubbed bright by the hand that pulls it."""
    x0, y0 = place(14, 6)
    x1, y1 = place(986, 76)
    shapes.outline_solid("shutter", [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], 0.05, 0.12, sheet, bevel=0.02)
    for k, y in enumerate((34, 56)):
        a, b = place(36, y), place(964, y)
        shapes.rod(f"rib{k}", (a[0], a[1], 0.12), (b[0], b[1], 0.12), 0.034, sheet)
    a, b = place(12, 76), place(988, 76)
    shapes.rod("lip", (a[0], a[1], 0.1), (b[0], b[1], 0.1), 0.072, lip_mat)
    s0, s1 = place(14, 17), place(986, 27)
    slot = shapes.outline_solid("slot", [(s0[0], s0[1]), (s1[0], s0[1]), (s1[0], s1[1]), (s0[0], s1[1])], 0.121,
                                0.125, materials.black("slot-dark"), bevel=0)
    slot.location.z = 0.01


def padlock_body(at, z0, metal):
    """A heavy rounded padlock body with its own keyhole, its top at `at`."""
    bx, by = at
    body = shapes.circle_points(bx, by + 0.02, 0.36, 40, math.pi, 2 * math.pi)
    body += [(bx + 0.36, by + 0.2), (bx - 0.36, by + 0.2)]
    body_iron = materials.iron("lock-iron", tone=0.055, scale=0.9, hammer=0.3, facet_scale=7.0, rub=0.2,
                               rub_bright=0.3, edge_width=0.02, offset=(0.4, 0.7, 0))
    lock = shapes.plate("lock-body", body, [(0.0, 0.0), (0.035, 0.07), (0.12, 0.1), (0.3, 0.11)], body_iron,
                        z0=z0 - 0.03)
    kh = shapes.keyhole_points(bx, by + 0.02, 0.05, 0.022, 0.035, 0.15)
    shapes.cut(lock, shapes.outline_solid("lock-kh", kh, z0 - 0.1, z0 + 0.3, metal, bevel=0))
    bpy.ops.mesh.primitive_circle_add(vertices=24, radius=0.14, fill_type="NGON", location=(bx, by - 0.02, z0 - 0.02))
    bpy.context.object.data.materials.append(materials.black("lock-dark"))


def hasp_and_padlock(metal, bright):
    """Muted, the lock is locked: the hasp hinged on the boards above the window is folded down across the plate,
    the staple comes through its slot, and a small padlock hangs from the staple over the shutter. The plate's
    outline changes, so the state shows in the silhouette on a small camera."""
    z0 = 0.40
    a, b = place(462, -60), place(538, -60)
    shapes.rod("hinge", (a[0], a[1], z0 + 0.02), (b[0], b[1], z0 + 0.02), 0.055, metal)
    outline = [place(472, -60), place(528, -60), place(530, 14), place(518, 30), place(482, 30), place(470, 14)]
    hasp = shapes.outline_solid("hasp", outline, z0 - 0.02, z0 + 0.025, metal, bevel=0.012, segments=2)
    sx0, sy0 = place(489, -6)
    sx1, sy1 = place(511, 20)
    cutter = shapes.outline_solid("hasp-slot", [(sx0, sy0), (sx1, sy0), (sx1, sy1), (sx0, sy1)], z0 - 0.2, z0 + 0.2,
                                  metal, bevel=0)
    shapes.cut(hasp, cutter)
    shapes.dome("hasp-rivet", place(500, -42), 0.06, 0.03, metal, z=z0 + 0.02)
    s = [place(493, 4), place(507, 4)]
    shapes.tube_along("staple", [(s[0][0], s[0][1] + 0.06, 0.28), (s[0][0], s[0][1] + 0.06, z0 + 0.07),
                                 (s[1][0], s[1][1] + 0.06, z0 + 0.07), (s[1][0], s[1][1] + 0.06, 0.28)], 0.022, metal)
    leg_top = -6.0
    shackle = [(*place(484, 36), z0 + 0.04), (*place(484, leg_top), z0 + 0.09)]
    for k in range(1, 16):
        ang = math.pi - math.pi * k / 16
        shackle.append((*place(500 + 16 * math.cos(ang), leg_top - 12 * math.sin(ang)), z0 + 0.09))
    shackle += [(*place(516, leg_top), z0 + 0.09), (*place(516, 36), z0 + 0.04)]
    shapes.tube_along("shackle", shackle, 0.032, bright)
    padlock_body(place(500, 44), z0, metal)


# ---------------------------------------------------------------- deafened: a rag in the keyhole

# The rag's outline round the keyhole: a wad about RAG_R across, and one corner of the cloth hanging down and a
# little left of the hole, RAG_TAIL long, lying on the plate.
RAG_R = 0.31
RAG_TAIL = 0.8
RAG_TAIL_AT = math.radians(-104)


def rag_radius(theta):
    """How far the cloth reaches from the keyhole's middle at an angle: the wad's frayed, uneven rim, and the
    hanging corner, a tongue that narrows to a point."""
    rim = RAG_R * (1 + 0.16 * noise.noise(Vector((math.cos(theta) * 2.3, math.sin(theta) * 2.3, 1.7))))
    d = math.atan2(math.sin(theta - RAG_TAIL_AT), math.cos(theta - RAG_TAIL_AT))
    tongue = (RAG_TAIL - RAG_R) * max(0.0, 1 - abs(d) / 0.5) ** 1.5
    return rim + tongue


def rag_height(r, theta, reach):
    """The cloth's height over the plate: the wad bunched up round the hole in folds that run out from it (sharp
    creases where the noise crosses zero), sunk into the hole in its middle; the corner lying on the plate with a
    fold along it."""
    t = r / reach
    in_tail = reach > RAG_R * 1.4 and r > RAG_R * 0.8
    wander = noise.noise(Vector((math.cos(theta) * 1.6, math.sin(theta) * 1.6, 2.0)))
    folds = (0.055 * math.sin(5 * theta + 3.0 * wander) + 0.035 * math.sin(3 * theta + 1.0)) * min(1.0, t * 1.6)
    crease = -0.03 * (1 - abs(noise.noise(Vector((math.cos(theta) * 3, math.sin(theta) * 3, r * 9))))) ** 4
    if in_tail:
        across = math.atan2(math.sin(theta - RAG_TAIL_AT), math.cos(theta - RAG_TAIL_AT)) / 0.5
        along = (r - RAG_R * 0.8) / (reach - RAG_R * 0.8)
        return 0.33 - 0.03 * along + 0.018 * math.cos(across * math.pi) + 0.01 * math.sin(along * 9)
    sunk = 0.06 * math.exp(-((r / 0.07) ** 2))
    lean = 0.05 * math.cos(theta - 0.9) * t  # bunched higher on one side, where it was pushed in
    return 0.34 + 0.13 * max(0.0, 1 - t * t) ** 0.7 + folds + crease + lean - sunk


def rag_sheet(cloth, rings=26, sectors=144):
    """The rag: one sheet of cloth on a polar grid round the keyhole, its edge on `rag_radius`, its height from
    `rag_height`."""
    kx, ky = place(*KEYHOLE)
    verts, faces = [(kx, ky, 0.28)], []
    for i in range(1, rings + 1):
        for j in range(sectors):
            theta = 2 * math.pi * j / sectors
            reach = rag_radius(theta)
            r = reach * i / rings
            verts.append((kx + r * math.cos(theta), ky + r * math.sin(theta), rag_height(r, theta, reach)))
    for j in range(sectors):
        faces.append((0, 1 + j, 1 + (j + 1) % sectors))
    for i in range(rings - 1):
        a, b = 1 + i * sectors, 1 + (i + 1) * sectors
        for j in range(sectors):
            faces.append((a + j, b + j, b + (j + 1) % sectors, a + (j + 1) % sectors))
    mesh = bpy.data.meshes.new("rag")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    if sum(p.normal.z for p in mesh.polygons) < 0:
        mesh.flip_normals()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = link(bpy.data.objects.new("rag", mesh))
    solid = obj.modifiers.new("cloth", "SOLIDIFY")
    solid.thickness = 0.018
    obj.data.materials.append(cloth)
    return obj


def rag_fray(seed):
    """Loose threads where the cloth was torn: along the hanging corner's edges and its point, and a few round the
    wad's rim, each a little curled, paler than the cloth."""
    kx, ky = place(*KEYHOLE)
    rng = random.Random(seed)
    thread = materials.thread("rag-thread", colour=(0.30, 0.285, 0.26))
    spots = [RAG_TAIL_AT + d for d in (-0.32, -0.2, -0.08, 0.0, 0.07, 0.18, 0.3)]
    spots += [rng.uniform(0, 2 * math.pi) for _ in range(7)]
    for k, theta in enumerate(spots):
        reach = rag_radius(theta)
        start = Vector((kx + reach * math.cos(theta), ky + reach * math.sin(theta), rag_height(reach, theta, reach)))
        direction = Vector((math.cos(theta), math.sin(theta), 0.0))
        length = rng.uniform(0.05, 0.1)
        side = Vector((-direction.y, direction.x, 0.0)) * rng.uniform(-0.6, 0.6)
        pts = [start + (direction + side * (j / 4) ** 2) * length * j / 4 - Vector((0, 0, 0.012 * j / 4))
               for j in range(5)]
        shapes.tube_along(f"rag-fray{k}", [tuple(p) for p in pts], 0.0045, thread, resolution=4)


def rag_plug(seed):
    """Deafened: a rag of grey wool stuffed into the keyhole (the hole a rogue listens at, plugged): a crumpled
    wad bunched round the hole in folds, one torn corner hanging down over the plate, frayed at its edge."""
    cloth = materials.wool("rag", scale=0.9, tone=0.6, sheen=0.45, relief=1.2, fuzz=260.0, offset=(0.3, 0.6, 0))
    rag_sheet(cloth)
    rag_fray(seed)


# ---------------------------------------------------------------- out of the call: the lock forced

# Where each plate turns about (its upper fixing, tile units), by how much (degrees, clockwise on the screen), and
# how far its free side lifts off the strap.
FORCED = {
    "shield": ((498.5, -52.0), 36.0, 0.05),
    "round": ((465.0, -37.0), 40.0, 0.05),
    "slide": ((404.0, -36.0), 7.0, 0.08),
}
# Where the bar went in under the plate's edge (tile units): its gouges in the strap, bright as fresh metal.
GOUGES = {"shield": (578.0, -30.0), "round": (578.0, -30.0), "slide": (652.0, -26.0)}


def about(pivot, degrees, axis="Z"):
    p = Vector((*pivot, 0.0))
    return Matrix.Translation(p) @ Matrix.Rotation(math.radians(degrees), 4, axis) @ Matrix.Translation(-p)


def force_lock(lock, group, plate_obj):
    """The lock plate and what is fixed to it turned about its upper fixing, its free side lifted off the strap as
    the bar left it. The plate's keyhole cutter is copied, so the plate's hole turns with it while the strap's
    stays where it was, bare and dark."""
    for mod in plate_obj.modifiers:
        if mod.type == "BOOLEAN" and mod.object is not None:
            twin = mod.object.copy()
            twin.data = mod.object.data.copy()
            bpy.context.scene.collection.objects.link(twin)
            twin.hide_render = True
            mod.object = twin
            group.append(twin)
    (px, py), deg, lift = FORCED[lock]
    pivot = place(px, py)
    turn = about(pivot, -deg)
    tilt = about(pivot, 6.0, "X")
    up = Matrix.Translation((0.0, 0.0, lift))
    for obj in group:
        obj.matrix_world = up @ turn @ tilt @ obj.matrix_world


def spring_slide(pieces):
    """The case's slide forced too: its upper guide bent up and out at its right end, the rivet there gone, and
    the slide sprung out of both guides, hanging askew off the case's right end by its lower corner."""
    bar, _left_rivet, right_rivet = pieces["guides"][0]
    right_rivet.hide_render = True
    bar.matrix_world = Matrix.Translation((0, 0, 0.03)) @ about(place(420, -42), 9.0) @ bar.matrix_world
    turn = Matrix.Translation((0.32, -0.06, 0.06)) @ about(place(581, 44), -32.0)
    for obj in pieces["slide"]:
        obj.matrix_world = turn @ obj.matrix_world
