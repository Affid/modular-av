"""The contract the hand holds against the glass: the sheet (creased paper, invented script, singed edges), the quill,
the seal. Scene units: 40 CSS pixels each; the glass's back face is z = 0, the hand pressed to it, the sheet just
behind the thumb (the thumb holds it from the glass's side, the fingers are off its edge)."""
import math

import numpy as np

import bpy

from common import arg
from measures import out, texture
from pixels import save_rgba

SHEET_W, SHEET_H = float(arg("--sheet-w", "2.45")), float(arg("--sheet-h", "3.15"))
SHEET_Z = -0.035  # set from the thumb in add_sheet: just behind its pad
ROLL = float(arg("--sheet-roll", "7"))  # degrees, about the view
INK_W, INK_H = 1024, int(1024 * SHEET_H / SHEET_W)
rng = np.random.RandomState(int(arg("--ink-seed", "31")))


def thumb_tip(hand, world, weights):
    b = hand.bone("finger1-3")
    tipverts = world[weights[:, b] > 0.5]
    base = world[weights[:, hand.bone("finger1-1")] > 0.5].mean(0)
    far = np.argmax(((tipverts - base) ** 2).sum(1))
    return tipverts[far]


def _rot(x, y, deg):
    a = math.radians(deg)
    return x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)


def _place(tip):
    """The sheet's middle: its right edge passes a little past the thumb's tip, so the thumb lies across it."""
    over = float(arg("--sheet-over", "0.38"))
    dy = float(arg("--sheet-dy", "0.25"))
    return tip[0] + over - SHEET_W / 2, tip[1] + dy


# ---- the ink: an invented script, a seal's place, the empty line ----

def _segment(canvas, a, b, width, value):
    x0, x1 = int(max(0, min(a[0], b[0]) - width - 2)), int(min(INK_W, max(a[0], b[0]) + width + 3))
    y0, y1 = int(max(0, min(a[1], b[1]) - width - 2)), int(min(INK_H, max(a[1], b[1]) + width + 3))
    if x0 >= x1 or y0 >= y1:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32) + 0.5
    d = np.array(b, np.float32) - np.array(a, np.float32)
    t = np.clip(((xx - a[0]) * d[0] + (yy - a[1]) * d[1]) / max(float(d @ d), 1e-6), 0, 1)
    dist = np.hypot(xx - (a[0] + t * d[0]), yy - (a[1] + t * d[1]))
    cover = np.clip(width / 2 + 0.6 - dist, 0, 1) * value
    np.maximum(canvas[y0:y1, x0:x1], cover, out=canvas[y0:y1, x0:x1])


def _glyph(canvas, x, y, size, width):
    """2-3 strokes: hooks, bars and loops on a slant, no letter of any alphabet on purpose (seeded)."""
    for _ in range(rng.randint(2, 4)):
        kind = rng.randint(3)
        px, py = x + rng.rand() * size * 0.6, y + rng.rand() * size * 0.7
        if kind == 0:  # a hook
            pts = [(px + size * 0.5 * math.sin(k / 4 * math.pi * rng.uniform(0.6, 1.2)), py + size * 0.22 * k)
                   for k in range(5)]
        elif kind == 1:  # a bar with a tick
            pts = [(px, py), (px + size * rng.uniform(0.4, 0.8), py + size * rng.uniform(-0.15, 0.15)),
                   (px + size * rng.uniform(0.5, 0.9), py + size * rng.uniform(0.2, 0.4))]
        else:  # a small loop
            r = size * rng.uniform(0.14, 0.24)
            a0 = rng.rand() * 6.28
            pts = [(px + r * math.cos(a0 + k * 0.9), py + r * math.sin(a0 + k * 0.9)) for k in range(8)]
        fade = rng.uniform(0.55, 1.0)
        for a, b in zip(pts, pts[1:]):
            _segment(canvas, a, b, width, fade)


def _ink():
    ink = np.zeros((INK_H, INK_W), np.float32)
    glow = np.zeros_like(ink)
    margin, lead, size = 92, 58, 30
    y = 120.0
    # A heading: fewer, larger marks.
    x = INK_W * 0.3
    while x < INK_W * 0.68:
        _glyph(ink, x, y, size * 1.5, 6.0)
        x += size * 1.5
    y += lead * 1.6
    lines = int((INK_H * 0.70 - y) / lead)
    for line in range(lines):
        x = margin + (40 if line == 0 else 0)
        end = INK_W - margin - rng.randint(0, 80) - (260 if line == lines - 1 else 0)
        while x < end:
            for _ in range(rng.randint(2, 7)):
                if x > end:
                    break
                _glyph(ink, x, y + rng.uniform(-3, 3), size, 4.2)
                x += size * rng.uniform(0.7, 1.0)
            x += size * 0.9
        y += lead
    # The empty line to sign on, and a faint mark where to sign.
    sy = INK_H - 150
    _segment(ink, (INK_W * 0.42, sy), (INK_W - margin, sy + 4), 4.0, 0.9)
    for k in range(3):
        _segment(glow, (INK_W * 0.40 - 34 + k * 8, sy - 40 + k * 4), (INK_W * 0.40 + 10, sy - 2), 7.0, 0.8)
    return ink, glow


def _burn(u, v):
    """Singed edges: brown-black near the edge, eaten away in places (alpha), uneven along the edge."""
    edge = np.minimum.reduce([u, 1 - u, (v) * SHEET_H / SHEET_W, (1 - v) * SHEET_H / SHEET_W])
    wob = np.zeros_like(u)
    for L, amp in ((0.21, 0.012), (0.09, 0.008), (0.035, 0.004), (0.014, 0.002)):
        wob += amp * np.sin(u / L * 6.28 + rng.rand() * 6) * np.cos(v / (L * 1.3) * 6.28 + rng.rand() * 6)
    # Two bites where the flame took more: the lower right corner and a notch on the left edge.
    bite = 0.07 * np.exp(-(((1 - u) / 0.16) ** 2 + (v / 0.10) ** 2)) + 0.035 * np.exp(-((u / 0.05) ** 2 + ((v - 0.62) / 0.06) ** 2))
    e = edge + wob - bite
    alpha = np.clip((e - 0.004) / 0.006, 0, 1)
    char = np.clip(1 - (e - 0.008) / 0.05, 0, 1) ** 1.6
    return alpha, char


def _ink_image(name):
    ink, glow = _ink()
    v, u = np.mgrid[0:INK_H, 0:INK_W].astype(np.float32)
    u, v = (u + 0.5) / INK_W, (v + 0.5) / INK_H
    alpha, char = _burn(u, v)
    px = np.zeros((INK_H, INK_W, 4), np.float32)
    px[..., 0] = ink
    px[..., 1] = char
    px[..., 2] = glow
    px[..., 3] = alpha
    px = px[::-1]  # Blender's row 0 is the bottom; the canvas was drawn top down
    path = out(f"{name}-ink")
    save_rgba(px, path)
    return path


# ---- materials ----

def _n(nodes, kind, **inputs):
    node = nodes.new(kind)
    for key, value in inputs.items():
        node.inputs[key].default_value = value
    return node


def _image(nodes, path, colour=True):
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(path)
    node.image.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    node.interpolation = "Cubic"
    return node


def _paper_material(ink_path):
    mat = bpy.data.materials.new("paper")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    outn = nodes.new("ShaderNodeOutputMaterial")
    uv = nodes.new("ShaderNodeTexCoord")
    scale = nodes.new("ShaderNodeMapping")
    scale.inputs["Scale"].default_value = (0.62, 0.62 * SHEET_H / SHEET_W, 1)
    links.new(uv.outputs["UV"], scale.inputs["Vector"])
    photo = _image(nodes, texture("Paper003_Color.jpg"))
    links.new(scale.outputs["Vector"], photo.inputs["Vector"])
    nor = _image(nodes, texture("Paper003_NormalGL.jpg"), colour=False)
    links.new(scale.outputs["Vector"], nor.inputs["Vector"])
    nmap = _n(nodes, "ShaderNodeNormalMap", Strength=float(arg("--creases", "0.9")))
    links.new(nor.outputs["Color"], nmap.inputs["Color"])
    inkt = _image(nodes, ink_path, colour=False)
    links.new(uv.outputs["UV"], inkt.inputs["Vector"])
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(inkt.outputs["Color"], sep.inputs["Color"])
    # Old paper gone grey-ivory (not the scrolls' yellow vellum): the photograph, toned.
    tone = nodes.new("ShaderNodeMix")
    tone.data_type, tone.blend_type = "RGBA", "MULTIPLY"
    tone.inputs["Factor"].default_value = 1.0
    tone.inputs["B"].default_value = tuple(float(v) for v in arg("--paper", "0.50,0.46,0.40").split(",")) + (1,)
    links.new(photo.outputs["Color"], tone.inputs["A"])
    char = nodes.new("ShaderNodeMix")
    char.data_type = "RGBA"
    char.inputs["B"].default_value = (0.05, 0.03, 0.02, 1)
    links.new(sep.outputs["Green"], char.inputs["Factor"])
    links.new(tone.outputs["Result"], char.inputs["A"])
    ink = nodes.new("ShaderNodeMix")
    ink.data_type = "RGBA"
    ink.inputs["B"].default_value = (0.09, 0.06, 0.07, 1)
    fade = _n(nodes, "ShaderNodeMath", **{})
    fade.operation = "MULTIPLY"
    fade.inputs[1].default_value = float(arg("--ink", "0.82"))
    links.new(sep.outputs["Red"], fade.inputs[0])
    geo = nodes.new("ShaderNodeNewGeometry")
    front = _n(nodes, "ShaderNodeMath", **{})
    front.operation = "SUBTRACT"
    front.inputs[0].default_value = 1.0
    links.new(geo.outputs["Backfacing"], front.inputs[1])
    inkf = _n(nodes, "ShaderNodeMath", **{})
    inkf.operation = "MULTIPLY"
    links.new(fade.outputs["Value"], inkf.inputs[0])
    links.new(front.outputs["Value"], inkf.inputs[1])
    links.new(inkf.outputs["Value"], ink.inputs["Factor"])
    links.new(char.outputs["Result"], ink.inputs["A"])
    bsdf = _n(nodes, "ShaderNodeBsdfPrincipled", Roughness=0.86)
    links.new(ink.outputs["Result"], bsdf.inputs["Base Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Emission Color"].default_value = (0.55, 0.36, 1.0, 1)
    glow = _n(nodes, "ShaderNodeMath", **{})
    glow.operation = "MULTIPLY"
    glow.inputs[1].default_value = float(arg("--mark", "0.35"))
    links.new(sep.outputs["Blue"], glow.inputs[0])
    links.new(glow.outputs["Value"], bsdf.inputs["Emission Strength"])
    # The light in the glass behind comes through the leaf: the writing shows dark against it.
    trans = nodes.new("ShaderNodeBsdfTranslucent")
    links.new(ink.outputs["Result"], trans.inputs["Color"])
    links.new(nmap.outputs["Normal"], trans.inputs["Normal"])
    both = nodes.new("ShaderNodeMixShader")
    both.inputs["Fac"].default_value = float(arg("--through", "0.3"))
    links.new(bsdf.outputs["BSDF"], both.inputs[1])
    links.new(trans.outputs["BSDF"], both.inputs[2])
    clear = nodes.new("ShaderNodeBsdfTransparent")
    cut = nodes.new("ShaderNodeMixShader")
    links.new(inkt.outputs["Alpha"], cut.inputs["Fac"])
    links.new(clear.outputs["BSDF"], cut.inputs[1])
    links.new(both.outputs["Shader"], cut.inputs[2])
    links.new(cut.outputs["Shader"], outn.inputs["Surface"])
    inkt.image.alpha_mode = "STRAIGHT"
    return mat


# ---- the objects ----

def add_sheet(tip, name):
    global SHEET_Z
    SHEET_Z = float(tip[2]) - float(arg("--behind", "0.07"))
    cx, cy = _place(tip)
    nx, ny = 48, int(48 * SHEET_H / SHEET_W)
    verts, uvs, faces = [], [], []
    curl = float(arg("--corner", "0.42"))
    for j in range(ny + 1):
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            x, y = (u - 0.5) * SHEET_W, (v - 0.5) * SHEET_H
            z = 0.012 * math.sin(u * 7.1 + v * 3.3) + 0.01 * math.sin(v * 11.0)
            # Folded in three once, then opened: a valley and a ridge across, a little crooked.
            fold = float(arg("--fold", "0.06"))
            z -= fold * max(0.0, 0.09 - abs(v - (0.345 + 0.02 * u))) / 0.09
            z += fold * 0.8 * max(0.0, 0.09 - abs(v - (0.665 - 0.015 * u))) / 0.09
            z += fold * 0.5 * max(0.0, 0.07 - abs(u - 0.5 - 0.02 * v)) / 0.07
            # The upper left corner curls up off the leaf toward the glass, rolling over toward the sheet: its blank back shows.
            d = max(0.0, 1 - math.hypot(u / 0.42, (1 - v) / 0.32))
            if d > 0:
                ang = curl * math.pi * d * d
                r = 0.35
                x += (r * math.sin(ang) - r * ang) * -0.5
                y -= (r * math.sin(ang) - r * ang) * 0.5
                z += r * (1 - math.cos(ang)) * float(arg("--curl-z", "1.0"))
            x, y = _rot(x, y, ROLL)
            verts.append((cx + x, cy + y, SHEET_Z + z))
            uvs.append((u, v))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    mesh = bpy.data.meshes.new("sheet")
    mesh.from_pydata(verts, [], faces)
    layer = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[mesh.loops[li].vertex_index]
    mesh.shade_smooth()
    obj = bpy.data.objects.new("sheet", mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(_paper_material(_ink_image(name)))
    print("SHEET MIDDLE", round(cx, 2), round(cy, 2))
    return obj


def _plain(name, colour, rough, spec=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*colour, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    return mat


def add_quill(tip):
    """A black feather quill laid on the sheet under the thumb, its nib at the line to sign."""
    cx, cy = _place(tip)
    nu, nv = (float(v) for v in arg("--nib", "0.0,-0.36").split(","))  # on the sheet, in its widths/heights
    nib = np.array(_rot(SHEET_W * nu, SHEET_H * nv, ROLL)) + (cx, cy)
    if arg("--quill-up"):  # the quill's top end from its nib, scene units: laid free on the leaf
        top = nib + np.array([float(v) for v in arg("--quill-up").split(",")])
    else:  # its top end under the thumb
        top = np.array((tip[0] + float(arg("--quill-dx", "0.55")), tip[1] + float(arg("--quill-dy", "-0.25"))))
    d = top - nib
    length = float(np.hypot(*d))
    ang = math.atan2(d[1], d[0])
    z = SHEET_Z + 0.012
    # The shaft: a thin tapering tube.
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.035, radius2=0.012, depth=length)
    shaft = bpy.context.object
    shaft.rotation_euler = (0, math.pi / 2, ang)
    shaft.location = ((nib[0] + top[0]) / 2, (nib[1] + top[1]) / 2, z)
    shaft.data.materials.append(_plain("quill-shaft", (0.16, 0.14, 0.12), 0.35))
    # The vane: a flat leaf over the upper two thirds, its barbs ragged.
    n = 40
    vs, fs = [], []
    for k in range(n + 1):
        t = k / n
        s = 0.34 + 0.66 * t
        w = 0.17 * math.sin(math.pi * min(1, (t * 1.15))) ** 0.8 * (1 + 0.1 * math.sin(k * 1.3) + 0.05 * math.sin(k * 4.1))
        px, py = nib + d * s
        nx_, ny_ = -math.sin(ang), math.cos(ang)
        vs += [(px + nx_ * w, py + ny_ * w, z + 0.004), (px - nx_ * w * 0.55, py - ny_ * w * 0.55, z + 0.004)]
    for k in range(n):
        a = 2 * k
        fs.append((a, a + 2, a + 3, a + 1))
    mesh = bpy.data.meshes.new("vane")
    mesh.from_pydata(vs, [], fs)
    vane = bpy.data.objects.new("vane", mesh)
    bpy.context.scene.collection.objects.link(vane)
    mesh.materials.append(_plain("vane", (0.02, 0.018, 0.022), 0.5, 0.6))
    # The nib: a darker, wet point.
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.02, radius2=0.0, depth=0.12)
    point = bpy.context.object
    point.rotation_euler = (0, -math.pi / 2, ang)
    point.location = (nib[0] - math.cos(ang) * 0.04, nib[1] - math.sin(ang) * 0.04, z)
    point.data.materials.append(_plain("nib", (0.03, 0.02, 0.02), 0.2))


def add_seal(tip):
    cx, cy = _place(tip)
    sx, sy = np.array(_rot(-SHEET_W * 0.3, -SHEET_H * 0.34, ROLL)) + (cx, cy)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.2, depth=0.05, location=(sx, sy, SHEET_Z + 0.02))
    seal = bpy.context.object
    bpy.ops.object.shade_smooth()
    bev = seal.modifiers.new("bevel", "BEVEL")
    bev.width, bev.segments = 0.022, 4
    sub = seal.modifiers.new("sub", "SUBSURF")
    sub.levels = sub.render_levels = 2
    tex = bpy.data.textures.new("wax", "CLOUDS")
    tex.noise_scale = 0.08
    disp = seal.modifiers.new("disp", "DISPLACE")
    disp.texture, disp.strength = tex, 0.02
    seal.scale = (1.0, 0.92, 1.0)
    seal.data.materials.append(_plain("wax", (0.42, 0.02, 0.025), 0.22, 0.8))


def add_seal_at(p, face):
    """The red wax seal at scene point `p` on a sheet whose front face is near z = `face`."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.2, depth=0.05, location=(p[0], p[1], p[2] + 0.02))
    seal = bpy.context.object
    bpy.ops.object.shade_smooth()
    bev = seal.modifiers.new("bevel", "BEVEL")
    bev.width, bev.segments = 0.022, 4
    sub = seal.modifiers.new("sub", "SUBSURF")
    sub.levels = sub.render_levels = 2
    tex = bpy.data.textures.new("wax", "CLOUDS")
    tex.noise_scale = 0.08
    disp = seal.modifiers.new("disp", "DISPLACE")
    disp.texture, disp.strength = tex, 0.02
    seal.scale = (1.0, 0.92, 1.0)
    seal.data.materials.append(_plain("wax", (0.42, 0.02, 0.025), 0.22, 0.8))
