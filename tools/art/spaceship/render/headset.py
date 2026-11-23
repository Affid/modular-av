"""Deafened: the player has taken the headset off and hung it by its band on the bracket low on the case's right
bezel (monitor_bracket.py), so it is seen as people know a headset: a padded band arching over two cups seen
from the side. Its clamp pulls the cups close together when it hangs. The cord's lead pulls the right cup back
against the case, which turns the whole headset a little (yaw) and shows the left cup's shell and the right cup's
cushion. From the right cup a coiled cord hangs down the bezel; from its lowest turn the lead droops to a jack
plugged into the chin under the TX lamp.

The headset is designed in tile units in its own frame (origin on the band's inner apex, where it rests on the
bracket's rod), and scaled up as a whole: at a 127 px camera a smaller one read as a smudge. Everything is named
hs-*, the bracket hk-*, so the frame's finish can find them.
"""
import math

import bpy
from mathutils import Vector

import stage
import monitor_bracket as bracket
from measures import place, units
from monitor_leather import band_leather, leatherette, shell_matte
from monitor_shapes import Heights, ball, child, coil, cyl, local, poly_curve, smooth_path
from paint import plain

HANG = ("hs-", "hk-")  # what hangs in front of the glass: the headset and its bracket
SCALE = 1.2  # the whole headset, against its design
YAW = 10.0  # degrees: the right cup pulled back against the case by its lead
JACK = (949.0, 701.0)  # the jack's socket on the chin, under the TX lamp
COIL_BOTTOM = 640.0  # where the coil's lowest turn hangs, down
COIL_PITCH = (9.0, 6.0)  # the coil's pitch at its top and bottom: a coiled cord, not a ribbed boot
LEAD_SAG = 12.0  # how far the lead droops below the straight line, under its weight
JACK_TILT = 38.0  # degrees the plug stands tilted from straight out, toward the coil
JACK_SIDE = 0.8  # and how much of that tilt goes right (toward the coil) against up


class Headset:
    """The hung headset's measures and its build."""

    R = 50.0  # the cups' radius
    A, B = 39.0, 58.0  # the band's horseshoe: half width (pulled narrow by the clamp), height
    END = math.radians(110)  # where the band's arc ends, from its apex
    T0, T1, W = 15.0, 11.5, 30.0  # the band's thickness at the apex and at its ends; its width (depth)
    DROP = (0.0, 10.0)  # how far each cup's slider is pulled out beyond the shortest (left, right)

    def __init__(self, heights):
        self.hx, self.arm_y, self.yaw = bracket.HANG_X, bracket.ARM_Y, math.radians(YAW)
        self.s, self.rod_r = SCALE, bracket.ROD_R
        self.h = heights
        self.yc = self.B - self.T0 / 2
        ex = self.A * math.sin(self.END)
        self.end_y = self.yc - self.B * math.cos(self.END)
        self.cups = []
        for s, d in ((-1, self.DROP[0]), (1, self.DROP[1])):
            top = self.end_y + 14 + 12 + 8 + d  # end cap, visible slider, swivel block
            self.cups.append(dict(s=s, x=s * ex, y=top + self.R, cap_y=self.end_y + 14, swivel_y=top - 8))
        self.z_root = max(self.solve_depth(), 0.0)  # never behind the case's front

    def world(self, x, y, z, z_root=None):
        """A point of the headset's frame (tile units) in the tile (x, y) and scene z."""
        c, s = math.cos(self.yaw), math.sin(self.yaw)
        x, y, z = x * self.s, y * self.s, z * self.s
        wx, wz = x * c + z * s, -x * s + z * c
        zr = self.z_root if z_root is None else z_root
        return self.hx + wx, self.arm_y - self.rod_r + y, zr + wz / 100.0

    def solve_depth(self, clear=0.004):
        """How far out the band must hang for the cups to just touch the case (the right one rests on it)."""
        need = -1.0
        for cup in self.cups:
            for u in (-20.0, -8.0, 4.0, 14.0, 24.0):  # points on the cup's outside: its cylinder and cushion
                for k in range(36):
                    ph = 2 * math.pi * k / 36
                    tx, ty, wz = self.world(cup["x"] + cup["s"] * u, cup["y"] - self.R * math.sin(ph),
                                            self.R * math.cos(ph), z_root=0.0)
                    need = max(need, self.h.at(tx, ty) + clear - wz)
        return need

    def build(self):
        root = stage.link(bpy.data.objects.new("hs-root", None))
        x, y, z = self.world(0, 0, 0)
        root.location = (*place(x, y), z)
        root.rotation_euler = (0.0, self.yaw, 0.0)
        root.scale = (self.s, self.s, self.s)
        self.root = root
        self.mats = dict(band=band_leather(), shell=shell_matte(), cushion=leatherette(),
                         black=plain("hs-black", (0.02, 0.02, 0.019), rough=0.5),
                         plug=plain("hs-plug", (0.045, 0.045, 0.043), rough=0.35),
                         steel=plain("hs-steel", (0.5, 0.5, 0.48), rough=0.3, metallic=1.0),
                         dark=plain("hs-dark-steel", (0.1, 0.1, 0.1), rough=0.4, metallic=1.0),
                         cloth=plain("hs-cloth", (0.04, 0.038, 0.035), rough=0.95))
        self.band()
        for cup in self.cups:
            self.cup(cup)
        bpy.context.view_layer.update()

    def band(self):
        """The padded band, thickest at its apex, with a moulded end cap each side the sliders come out of."""
        mats = self.mats
        n = 90
        pts, ts, gs = [], [], []
        for i in range(n + 1):
            th = -self.END + 2 * self.END * i / n
            pts.append((self.A * math.sin(th), self.yc - self.B * math.cos(th)))
            f = abs(th) / self.END
            ts.append(self.T1 + (self.T0 - self.T1) * math.cos(f * math.pi / 2))
            gs.append(max(0.0, 1 - abs(th) / math.radians(38)) ** 1.5)  # the grip at the apex
        child(band_mesh("hs-band", pts, ts, self.W, mats["band"], gs), self.root, (0, 0, 0))
        for cup in self.cups:
            s, cx = cup["s"], cup["x"]
            bpy.ops.mesh.primitive_cube_add(size=1)
            cap = bpy.context.active_object
            cap.name = "hs-endcap"
            cap.scale = (units(16), units(18), units(self.W + 3))
            bev = cap.modifiers.new("bevel", "BEVEL")
            bev.width, bev.segments = units(5), 4
            cap.data.materials.append(mats["black"])
            for p in cap.data.polygons:
                p.use_smooth = True
            child(cap, self.root, local(cx, self.end_y + 5), (0, 0, -s * 0.18))
            for dz in (-7.0, 7.0):  # two steel slider rods down to the yoke's swivel
                a, b = local(cx, cup["cap_y"] - 2, dz), local(cx, cup["swivel_y"] + 2, dz)
                child(poly_curve("hs-rod", [a, b], units(2.3), mats["steel"]), self.root, (0, 0, 0))

    def cup(self, cup):
        """A cup in two forms, as it reads from the side: one rounded cushion (a fat leatherette torus) and one
        domed shell (a single moulding, its edge rounded into a deep dome); a blackened steel yoke round it,
        pivots front and back at mid-depth, and a swivel up to the slider."""
        mats = self.mats
        s, cx, cy, R = cup["s"], cup["x"], cup["y"], self.R
        axis = (0.0, s * math.pi / 2, 0.0)  # a primitive's z axis turned to point out of the cup (+-x)

        def along(u):
            return local(cx + s * u, cy)

        bpy.ops.mesh.primitive_torus_add(major_radius=units(R - 15), minor_radius=units(14.5), major_segments=64,
                                         minor_segments=24)
        t = bpy.context.active_object
        t.name = "hs-cushion"
        t.scale = (1, 1, 0.78)
        t.data.materials.append(mats["cushion"])
        for p in t.data.polygons:
            p.use_smooth = True
        child(t, self.root, along(-10.0), axis)
        child(cyl("hs-cloth", (0, 0, 0), units(R - 22), units(3), mats["cloth"], verts=48, bevel=0), self.root,
              along(-12.0), axis)
        child(cyl("hs-baffle", (0, 0, 0), units(R - 6), units(6), mats["black"], verts=64, bevel=0.4), self.root,
              along(-1.5), axis)
        child(ball("hs-shell", (0, 0, 0), units(R), (1, 1, 0.36), mats["shell"]), self.root, along(1.0), axis)
        yr = R + 4.0
        ring = [local(cx + s * 5.0, cy - yr * math.sin(ph), yr * math.cos(ph))
                for ph in (math.pi * k / 48 for k in range(49))]
        child(poly_curve("hs-yoke", ring, units(2.6), mats["dark"]), self.root, (0, 0, 0))
        for zz in (yr, -yr):
            child(cyl("hs-pivot", (0, 0, 0), units(4.2), units(5), mats["dark"], verts=24), self.root,
                  local(cx + s * 5.0, cy, zz))
        child(cyl("hs-swivel", (0, 0, 0), units(6.5), units(9), mats["black"], verts=24), self.root,
              local(cx + s * 5.0 * 0.5, cy - yr - 4.0), (math.pi / 2, 0, 0))
        cup["exit"] = (cx + s * 9.0, cy + R * 0.93, 0.0)
        if s > 0:  # the cord leaves the right cup's shell at its bottom, through a rubber strain relief
            bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=units(5.5), radius2=units(3.2), depth=units(18))
            rl = bpy.context.active_object
            rl.name = "hs-relief"
            rl.data.materials.append(mats["black"])
            for p in rl.data.polygons:
                p.use_smooth = True
            child(rl, self.root, local(cx + s * 9.0, cy + R * 0.93 + 6), (-math.pi / 2, 0, 0))
            cup["exit"] = (cx + s * 9.0, cy + R * 0.93 + 15, 0.0)

    def cord(self):
        """The coiled cord: from the right cup it hangs straight down, its turns pulled apart at the top by the
        weight below and closed at the bottom; from its lowest turn the lead droops to the jack."""
        ex, ey, ez = self.world(*self.cups[1]["exit"])
        r_coil, wire = 6.0 * self.s, 1.9 * self.s
        bottom = COIL_BOTTOM
        z_bot = self.h.at(ex, bottom) + units(r_coil + wire) + 0.004
        ctrl = [Vector((*place(ex, ey + 6), ez)),
                Vector((*place(ex, ey + 40), ez * 0.8 + z_bot * 0.2)),
                Vector((*place(ex + 1.0, (ey + bottom) / 2), ez * 0.45 + z_bot * 0.55)),
                Vector((*place(ex + 2.0, bottom - 22), z_bot + 0.01)),
                Vector((*place(ex + 9.0, bottom), z_bot))]
        coil("hs-coil", smooth_path(ctrl, n=60), units(r_coil), units(wire), units(COIL_PITCH[0]),
             units(COIL_PITCH[1]), self.mats["black"])
        poly_curve("hs-tail", [Vector((*place(ex, ey - 4), ez)), Vector((*place(ex, ey + 7), ez))], units(wire),
                   self.mats["black"])
        self.jack_lead((ex + 9.0, bottom + r_coil / self.s * 0.6, z_bot), wire)

    def jack_lead(self, start, wire):
        """The lead from under the coil's last turn, sagging under its weight and kept off the case, to the plug in
        the jack: a larger blackened hex nut (its flat facets each catching the lamp its own way) on a dark
        washer, and the socket's bright thread ring round the plug's foot, so the socket reads apart from the
        plug; the plug's black moulded body tilted up toward the coil, and its strain relief."""
        jx, jy = JACK
        mats = self.mats
        z0 = self.h.at(jx, jy)
        black = plain("hs-nut-black", (0.03, 0.03, 0.029), rough=0.3, metallic=1.0)
        cyl("hs-jack-washer", (*place(jx, jy), z0 + units(0.7)), units(15), units(1.4), black, verts=48, bevel=0.3)
        nut = cyl("hs-jack-nut", (*place(jx, jy), z0 + units(2.6)), units(11.5), units(4.4), black, verts=6,
                  bevel=0.25)
        for p in nut.data.polygons:
            p.use_smooth = False
        bright = plain("hs-thread", (0.55, 0.54, 0.5), rough=0.3, metallic=1.0)
        cyl("hs-jack-thread", (*place(jx, jy), z0 + units(5.2)), units(8.2), units(1.6), bright, verts=40, bevel=0.5)
        cyl("hs-jack-bore", (*place(jx, jy), z0 + units(5.9)), units(6.4), units(1.2),
            plain("hs-bore", (0.004, 0.004, 0.004), rough=0.8), verts=40, bevel=0.2)
        tilt = math.radians(JACK_TILT)
        body_len, body_r = 30.0, 6.8
        dirv = Vector((math.sin(tilt) * JACK_SIDE, math.sin(tilt), math.cos(tilt))).normalized()  # x, y up, z out
        base = Vector((*place(jx, jy), z0 + units(6.5)))
        tip = base + dirv * units(body_len)
        poly_curve("hs-jack-body", [base, base + dirv * units(body_len * 0.75)], units(body_r), mats["plug"])
        poly_curve("hs-jack-relief", [base + dirv * units(body_len * 0.7), tip], units(body_r * 0.62), mats["black"])
        a = Vector((*place(*start[:2]), start[2]))
        x0, y0 = place(0.0, 0.0)
        pts = []
        n = 24
        for k in range(n + 1):
            t = k / n
            p = a.lerp(tip, t)
            p.y -= units(LEAD_SAG * 0.8) * 4 * t * (1 - t)
            tx, ty = (p.x - x0) * 100.0, -(p.y - y0) * 100.0
            p.z = max(p.z, self.h.at(tx, ty) + units(wire) + 0.002)
            pts.append(p)
        poly_curve("hs-lead", pts, units(wire), mats["black"])


def _band_rings(bm, centre, thickness, width, grab, nsec):
    """The band's cross-section rings along its centre line, and how far along each one is."""
    grab_layer = bm.verts.layers.float.new("grab")
    rings, params, s_len = [], [], 0.0
    n = len(centre)
    for i, (x, y) in enumerate(centre):
        a, b = centre[max(i - 1, 0)], centre[min(i + 1, n - 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, ty)
        nx, ny = ty / ln, -tx / ln  # outward (away from the arch's middle), y down
        if i:
            s_len += math.hypot(x - centre[i - 1][0], y - centre[i - 1][1])
        t = thickness[i]
        ring = []
        for k in range(nsec):
            ph = 2 * math.pi * k / nsec
            c, s = math.cos(ph), math.sin(ph)
            r = (t / 2) * math.copysign(abs(c) ** 0.55, c)
            w = (width / 2) * math.copysign(abs(s) ** 0.55, s)
            v = bm.verts.new(local(x + nx * r, y + ny * r, w))
            v[grab_layer] = grab[i]
            ring.append((v, r / (t / 2), w / (width / 2)))
        rings.append(ring)
        params.append(s_len)
    return rings, params


def band_mesh(name, centre, thickness, width, mat, grab, nsec=28):
    """A padded strip swept along `centre` [(x, y)] in the headset's plane (tile units, y down): radial thickness
    `thickness[i]`, `width` across (z); a squarish, bulging section (foam under leatherette). UV maps: 'seam'
    (length in units, place across the thickness -1..1) and 'side' (place across the width -1..1); a float
    attribute 'grab' (where hands take it), `grab[i]`."""
    import bmesh
    bm = bmesh.new()
    seam = bm.loops.layers.uv.new("seam")
    side = bm.loops.layers.uv.new("side")
    rings, params = _band_rings(bm, centre, thickness, width, grab, nsec)
    n = len(centre)
    for i in range(n - 1):
        for k in range(nsec):
            k2 = (k + 1) % nsec
            q = (rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2])
            f = bm.faces.new([e[0] for e in q])
            for loop, e, s_at in zip(f.loops, q, (params[i], params[i + 1], params[i + 1], params[i])):
                loop[seam].uv = (s_at, e[1])
                loop[side].uv = (e[2], 0.0)
    for ring in (rings[0], rings[-1]):  # close the ends
        f = bm.faces.new([e[0] for e in ring])
        for loop in f.loops:
            loop[seam].uv = (0.0, 0.0)
            loop[side].uv = (0.0, 0.0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = stage.link(bpy.data.objects.new(name, mesh))
    obj.data.materials.append(mat)
    return obj


def hang(right):
    """The bracket and the headset on it, with its cord and lead; nothing of them mirrored in the tube's glass
    (it showed dark ghosts of them beside them). `right`: the case's right edge, tile units."""
    heights = Heights(800, bracket.ARM_Y - 40, right + 9, 720)  # sampled before anything is hung
    hs = Headset(heights)
    print("HEADSET hangs", round(hs.z_root, 3), "out")
    tip = bracket.bracket(hs.z_root, hs.z_root + units(hs.W * hs.s / 2 + 5), heights)
    print("HOOK tip at", [round(v) for v in tip])
    hs.build()
    hs.cord()
    for obj in bpy.context.scene.objects:
        if obj.name.startswith(HANG):
            obj.visible_glossy = False
