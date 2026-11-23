"""The cargo manifest under the clipboard's clip: three sheets, the top one handled for weeks in a hold. Invented
codes and marks only (no names of anyone or anything real), typed in DejaVu Sans Mono (the pinned 2.37 file the
extinguisher's label is set in, fetched: ../textures.ts), ruled, ticked in pencil, signed with a scribble and
stamped in blue. At true size only CARGO MANIFEST reads; the rest is the texture of a filled-in form.
"""
import math
import random

import bpy

from kit import box, link, rod
from measures import texture
from paint import _math, _mix, _range, material
from things_paint import ink, times

ROWS = [("KX-2207-A", 12, 340), ("TR-0915", 4, 88), ("VLV-33C", 30, 61), ("CRT-M12", 9, 117), ("HSE-0480", 2, 205),
        ("PNL-7Q", 16, 42), ("CEL-201", 48, 96), ("FLT-119", 6, 23), ("BRK-62", 20, 150), ("SEAL-4", 100, 12),
        ("GSK-090", 25, 8), ("DRM-15", 3, 612)]
UNTICKED = (5, 10, 11)  # rows not yet checked off


def paper(name, colour):
    """Copy paper gone a little grey and yellow with handling: thumbed darker near the bottom edge."""
    mat, nodes, links = material(name)
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    tc = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 30.0
    noise.inputs["Detail"].default_value = 10.0
    links.new(tc.outputs["Object"], noise.inputs["Vector"])
    mott = _range(nodes, links, noise.outputs["Fac"], 0.35, 0.65, 0.9, 1.04)
    col = _mix(nodes, links, 1.0, (*colour, 1), mott, "MULTIPLY")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(tc.outputs["Generated"], sep.inputs[0])
    thumb = _range(nodes, links, sep.outputs["Y"], 0.0, 0.25, 0.82, 1.0)
    col = _mix(nodes, links, 1.0, col, thumb, "MULTIPLY")
    links.new(col, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.88
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


class _Nodes:
    """Shader-node arithmetic over one material's world position."""

    def __init__(self, nodes, links):
        self.nodes, self.links = nodes, links
        self.geo = nodes.new("ShaderNodeNewGeometry")
        sep = nodes.new("ShaderNodeSeparateXYZ")
        links.new(self.geo.outputs["Position"], sep.inputs[0])
        self.x, self.y = sep.outputs["X"], sep.outputs["Y"]

    def m(self, op, a, b=None):
        return _math(self.nodes, self.links, op, a, b) if b is not None else _math(self.nodes, self.links, op, a)

    def r(self, v, a, b, c=0.0, d=1.0):
        return _range(self.nodes, self.links, v, a, b, c, d)

    def noise(self, scale, detail, w):
        n = self.nodes.new("ShaderNodeTexNoise")
        n.noise_dimensions = "4D"
        n.inputs["W"].default_value = w
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        self.links.new(self.geo.outputs["Position"], n.inputs["Vector"])
        return n.outputs["Fac"]

    def dist(self, cx, cy, sx=1.0, sy=1.0):
        dx = self.m("MULTIPLY", self.m("SUBTRACT", self.x, cx), 1 / sx)
        dy = self.m("MULTIPLY", self.m("SUBTRACT", self.y, cy), 1 / sy)
        return self.m("SQRT", self.m("ADD", self.m("MULTIPLY", dx, dx), self.m("MULTIPLY", dy, dy)))


def _coffee_ring(n, nodes, links, col, x0, yb):
    """A coffee cup's ring at the lower left: a broken brown rim, the inside faintly stained."""
    d = n.dist(x0 + 0.036, yb + 0.026)
    rim = n.r(n.m("ABSOLUTE", n.m("SUBTRACT", d, 0.0205)), 0.0002, 0.0016, 1.0, 0.0)
    rim = n.m("MULTIPLY", rim, n.r(n.noise(90.0, 4.0, 3.0), 0.38, 0.6))
    inside = n.r(d, 0.0205, 0.019, 0.0, 0.35)
    stain = n.m("ADD", n.m("MULTIPLY", rim, 0.8), n.m("MULTIPLY", inside, 0.3))
    return _mix(nodes, links, stain, col, _mix(nodes, links, 1.0, col, (0.55, 0.36, 0.2, 1), "MULTIPLY"))


def _thumb_and_smudges(n, x0, x1, yt, yb):
    """A greasy thumbprint at the lower right and smudges where the clip is opened: (thumb, dirt) factors."""
    thumb = n.r(n.dist(x1 - 0.028, yb + 0.022, 0.009, 0.0125), 0.6, 1.0, 1.0, 0.0)
    thumb = n.m("MULTIPLY", thumb, n.r(n.noise(400.0, 3.0, 4.0), 0.3, 0.7, 0.5, 1.0))
    smudge = n.m("MAXIMUM", n.r(n.dist(x0 + 0.03, yt - 0.03, 0.014, 0.01), 0.4, 1.0, 0.7, 0.0),
                 n.r(n.dist(x1 - 0.034, yt - 0.026, 0.012, 0.009), 0.4, 1.0, 0.6, 0.0))
    smudge = n.m("MULTIPLY", smudge, n.r(n.noise(120.0, 5.0, 5.0), 0.3, 0.7))
    return thumb, n.m("MAXIMUM", n.m("MULTIPLY", thumb, 0.5), n.m("MULTIPLY", smudge, 0.35))


def paper_worn(box_m, colour=(0.215, 0.203, 0.163)):
    """The manifest's top sheet: greyed and yellowed (so it stays under the readouts' light), grubby along the
    bottom and the right edge where it is held, a coffee ring, a greasy thumbprint, smudges under the clip, a
    slight wave in the sheet. `box_m` is the sheet's (x0, x1, y_top, y_bot) in metres."""
    x0, x1, yt, yb = box_m
    mat, nodes, links = material("paper-worn")
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    n = _Nodes(nodes, links)
    mott = n.r(n.noise(30.0, 10.0, 1.0), 0.35, 0.65, 0.9, 1.05)
    col = _mix(nodes, links, 1.0, (*colour, 1), mott, "MULTIPLY")
    low = n.r(n.y, yb, yb + 0.06, 0.8, 1.0)
    right = n.r(n.x, x1 - 0.035, x1, 1.0, 0.86)
    grub = n.r(n.noise(55.0, 6.0, 2.0), 0.3, 0.7, 0.88, 1.04)
    col = times(nodes, links, col, low, right, grub)
    col = _coffee_ring(n, nodes, links, col, x0, yb)
    thumb, dirt = _thumb_and_smudges(n, x0, x1, yt, yb)
    col = _mix(nodes, links, dirt, col, (0.12, 0.11, 0.09, 1))
    links.new(col, bsdf.inputs["Base Color"])
    links.new(_mix(nodes, links, thumb, 0.85, 0.5), bsdf.inputs["Roughness"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 1.0
    bump.inputs["Distance"].default_value = 0.004
    links.new(n.m("ADD", n.noise(12.0, 2.0, 6.0), n.m("MULTIPLY", n.noise(500.0, 6.0, 7.0), 0.03)),
              bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _font():
    """DejaVu Sans Mono, the pinned file (not Blender's own copy, which changes with its build). Missing, the load
    fails the render: no picture made in another font."""
    return bpy.data.fonts.load(texture("DejaVuSansMono.ttf"), check_existing=True)


def text(body, x, y, z, size, mat, font, align="LEFT", bold=0.0, rot=0.0):
    cu = bpy.data.curves.new("t", "FONT")
    cu.body = body
    cu.size = size
    cu.align_x = align
    cu.offset = bold
    if font:
        cu.font = font
    obj = link(bpy.data.objects.new("text", cu))
    obj.location = (x, y, z)
    obj.rotation_euler.z = math.radians(rot)
    obj.data.materials.append(mat)
    return obj


def tick(x, y, z, s, mat, seed):
    """A pencil tick, a little different each time."""
    rnd = random.Random(seed)

    def j():
        return rnd.uniform(-0.12, 0.12) * s

    pts = [(x - 0.45 * s + j(), y + 0.05 * s + j(), z), (x - 0.1 * s + j(), y - 0.35 * s, z),
           (x + 0.55 * s + j(), y + 0.55 * s + j(), z)]
    return rod("tick", pts, 0.00032, mat, bevel_res=1)


def scribble(x, y, z, w, mat, seed=7):
    """A signature: a pencil scribble, not a name."""
    rnd = random.Random(seed)
    pts = []
    for i in range(60):
        t = i / 59
        pts.append((x + w * t, y + 0.0035 * math.sin(t * 19 + rnd.uniform(-0.3, 0.3)) * (1 - 0.6 * t) +
                    0.002 * math.sin(t * 5.3), z))
    return rod("signature", pts, 0.00028, mat, bevel_res=1)


def stamp(cx, cy, z, mat, font, rot=-11.0):
    """A round blue CLEARED stamp, put on at a slant."""
    curve = bpy.data.curves.new("stamp", "CURVE")
    curve.bevel_depth = 0.00045
    curve.bevel_resolution = 1
    for r in (0.0175, 0.0145):
        sp = curve.splines.new("POLY")
        n = 64
        sp.points.add(n - 1)
        for i, p in enumerate(sp.points):
            a = 2 * math.pi * i / n
            p.co = (cx + r * math.cos(a), cy + r * math.sin(a), z, 1)
        sp.use_cyclic_u = True
    ring = link(bpy.data.objects.new("stamp", curve))
    ring.data.materials.append(mat)
    text("CLEARED", cx, cy - 0.0016, z, 0.0062, mat, font, align="CENTER", bold=0.00012, rot=rot)
    text("H2 - 117", cx, cy - 0.0085, z, 0.0034, mat, font, align="CENTER", rot=rot)
    return ring


def sheet(name, x0, x1, y_top, y_bot, z, mat, lift=0.0):
    """A sheet as a fine grid, flat under the clip, its lower right corner lifted off the board by `lift`
    (thumbed up where a hand turns the pages)."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=40, y_subdivisions=50, size=1)
    obj = bpy.context.active_object
    obj.name = name
    w, h = x1 - x0, y_top - y_bot
    for v in obj.data.vertices:
        u, t = v.co.x + 0.5, 0.5 - v.co.y  # u across, t down from the top edge
        corner = max(0.0, (u - 0.62) / 0.38 + (t - 0.7) / 0.3 - 1.0)
        v.co.x, v.co.y = x0 + u * w, y_top - t * h
        v.co.z = z + lift * corner ** 2
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.data.materials.append(mat)
    sol = obj.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = 0.0001
    return obj


def sheets(x0, x1, y_top, y_bot, z):
    """Three sheets, the lower two showing a little at the edges; returns the top sheet's face."""
    top = paper_worn((x0, x1, y_top, y_bot))
    under = paper("paper-under", (0.175, 0.167, 0.135))
    sheet("sheet0", x0 + 0.0025, x1 + 0.0025, y_top, y_bot - 0.003, z, under, lift=0.002)
    sheet("sheet1", x0 - 0.0018, x1 - 0.0018, y_top, y_bot - 0.0015, z + 0.00012, under, lift=0.004)
    sheet("sheet2", x0, x1, y_top, y_bot, z + 0.00024, top, lift=0.007)
    return z + 0.00024 + 0.00012


def _table(left, w, y, z, black, pencil, font):
    """The rows of cargo, ruled, each checked off in pencil but three; returns where the table ends."""
    cols = (left, left + 0.012, left + 0.083, left + 0.112, left + 0.150)
    for cx, head in zip(cols, ("NO", "CODE", "QTY", "KG", "OK")):
        text(head, cx, y, z, 0.0042, black, font, bold=0.00008)
    y -= 0.0035
    box("rule", (left + w / 2, y, z), (w, 0.0004, 0.00004), black)
    top_rule = y
    for i, (code, qty, kg) in enumerate(ROWS):
        y -= 0.0098
        for cx, cell in zip(cols, (f"{i + 1:02d}", code, f"{qty:>3d}", f"{kg:>3d}")):
            text(cell, cx, y + 0.0022, z, 0.0042, black, font, bold=0.00007)
        if i not in UNTICKED:
            tick(cols[4] + 0.007, y + 0.0045, z, 0.0062, pencil, seed=i)
        box("rule", (left + w / 2, y, z), (w, 0.00025, 0.00004), black)
    for cx in cols[1:]:
        box("col", (cx - 0.002, (top_rule + y) / 2, z), (0.00025, top_rule - y, 0.00004), black)
    return y


def manifest(x0, x1, y_top, y_bot, z_board):
    """Paper from x0 to x1, its top edge y_top (under the clip), its bottom y_bot; lying on the board's face."""
    z = sheets(x0, x1, y_top, y_bot, z_board) + 0.00004
    font = _font()
    black = ink()
    pencil = ink("pencil", (0.06, 0.06, 0.065), rough=0.45)
    blue = ink("stamp-ink", (0.03, 0.06, 0.2), rough=0.8)
    left = x0 + 0.010
    w = x1 - x0 - 0.020
    y = y_top - 0.050
    text("CARGO MANIFEST", left, y, z, 0.0105, black, font, bold=0.00022)
    y -= 0.011
    text("MF 4471-K   HOLD 2 / BAY C", left, y, z, 0.0046, black, font, bold=0.00007)
    y -= 0.006
    box("rule", (left + w / 2, y, z), (w, 0.0007, 0.00004), black)
    y -= 0.0075
    y = _table(left, w, y, z, black, pencil, font) - 0.012
    text("LOADED", left, y, z, 0.0042, black, font, bold=0.00007)
    scribble(left + 0.024, y + 0.0015, z, 0.045, pencil)
    stamp(x1 - 0.036, y - 0.004, z, blue, font)
