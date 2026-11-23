"""The fire extinguisher in its strapped wall bracket (things_bracket.py): Poly Haven's korean_fire_extinguisher_01,
its stand, inspection tag and printed label taken off (they carry real names and another language's words), with a
small worn label of invented marks wrapped round its front (things_label.py draws it). The body's paint is scratched
where the strap and hands rub, dusty on what faces up, grimy low down; the lamp falls off over it as over the wall,
and its sides turn dark.
"""
import math

import bmesh
import bpy
from mathutils import Vector

from kit import bounds, import_model, link
from measures import out
from paint import _math, _mix, _range, material
from things_bracket import Y_STRAP, bracket, hose_at, noise
from things_label import FLAP, H_MM, LABEL, PEEL_MM, W_MM
from things_paint import black_steel, lamp_falloff, tame, times, turned_away

SCALE = 0.85
AXIS_Y = -0.03  # the body's axis in the model's own frame (x 0, y -0.03)
BODY_R = 0.092
NECK_R = 0.044  # the valve's neck, in the model's own frame
STAND_TOP = 0.14  # every loose part ending below this is the stand
LABEL_UV = (0.178, 0.312, 0.437, 0.428)  # the printed label in the body's texture (u0, v0, u1, v1), with margin
LABEL_SHIFT = 0.13  # read instead from the plain red above it (below it, a ring of the body's relief would show)
Y_LABEL = (0.257, 0.322)  # between the body's two lower rings (metres, after scaling)
LABEL_ANGLE = 40  # degrees either side of the front the label wraps round
LABEL_LIFT = 0.0009  # off the paint
LABEL_GAIN = 0.9  # the label's top 1% stays under the resting readout's light


def _parts(faces):
    """The faces in connected parts."""
    seen, parts = set(), []
    for f in faces:
        if f.index in seen:
            continue
        stack, part = [f], []
        seen.add(f.index)
        while stack:
            a = stack.pop()
            part.append(a)
            for e in a.edges:
                for b in e.link_faces:
                    if b.index not in seen:
                        seen.add(b.index)
                        stack.append(b)
        parts.append(part)
    return parts


def strip(obj):
    """Take off the stand (every loose part ending below its top) and the paper tag; the hose clip's band round
    the body goes from the model's tan to the bracket's black steel."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    paper_index = next(i for i, m in enumerate(obj.data.materials) if m.name.endswith("paper"))
    gone = set()
    for part in _parts(bm.faces):
        if max(v.co.z for g in part for v in g.verts) < STAND_TOP:
            gone.update(part)
    gone.update(f for f in bm.faces if f.material_index == paper_index)
    band_index = next(i for i, m in enumerate(obj.data.materials) if m.name.startswith("hose-band"))
    for part in _parts([f for f in bm.faces if f not in gone]):
        zs = [v.co.z for g in part for v in g.verts]
        xs = [v.co.x for g in part for v in g.verts]
        if 0.20 < min(zs) and max(zs) < 0.225 and max(xs) - min(xs) > 0.18:
            for g in part:
                g.material_index = band_index
            print("HOSE BAND", len(part), "faces")
    bmesh.ops.delete(bm, geom=list(gone), context="FACES")
    bm.to_mesh(obj.data)
    bm.free()


def band_steel():
    """The hose clip's band: spring steel painted black, rubbed to dull steel on its edges and where the hose is
    pulled out, with the cylinder's light falling over it."""
    mat = black_steel("hose-band")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    base = bsdf.inputs["Base Color"].links[0].from_socket
    links.new(times(nodes, links, base, lamp_falloff(nodes, links), turned_away(nodes, links, 0.5, 1.6)),
              bsdf.inputs["Base Color"])
    return mat


def hide_label(mat):
    """Every texture of the body reads, inside the printed label's box, from the plain worn red above it."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    uv = nodes.new("ShaderNodeUVMap")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(uv.outputs["UV"], sep.inputs[0])
    u0, v0, u1, v1 = LABEL_UV
    inside = None
    for sock, lo, hi in ((sep.outputs["X"], u0, u1), (sep.outputs["Y"], v0, v1)):
        a = _math(nodes, links, "GREATER_THAN", sock, lo)
        b = _math(nodes, links, "LESS_THAN", sock, hi)
        both = _math(nodes, links, "MULTIPLY", a, b)
        inside = both if inside is None else _math(nodes, links, "MULTIPLY", inside, both)
    v = _math(nodes, links, "ADD", sep.outputs["Y"], _math(nodes, links, "MULTIPLY", inside, LABEL_SHIFT))
    comb = nodes.new("ShaderNodeCombineXYZ")
    links.new(sep.outputs["X"], comb.inputs["X"])
    links.new(v, comb.inputs["Y"])
    for n in nodes:
        if n.type == "TEX_IMAGE":
            links.new(comb.outputs[0], n.inputs["Vector"])


def _scratches(nodes, links, base, y):
    """Fine streaks running round the body, many near the strap and under the lever, only through the red paint."""
    streak = noise(nodes, links, 1.0, 2.0, stretch=(60, 900, 60), seed_w=3.0)
    near = _math(nodes, links, "MAXIMUM",
                 _range(nodes, links, _math(nodes, links, "ABSOLUTE", _math(nodes, links, "SUBTRACT", y, Y_STRAP)),
                        0.012, 0.05, 1.0, 0.0),
                 _range(nodes, links, y, 0.42, 0.47, 0.0, 0.8))
    need = _mix(nodes, links, near, 0.70, 0.60)
    scratch = _range(nodes, links, _math(nodes, links, "SUBTRACT", streak, need), 0.0, 0.03)
    patch = noise(nodes, links, 40.0, 4.0, seed_w=7.0)
    scratch = _math(nodes, links, "MULTIPLY", scratch, _range(nodes, links, patch, 0.35, 0.6))
    rgb = nodes.new("ShaderNodeSeparateColor")
    links.new(base, rgb.inputs[0])
    red = _range(nodes, links, _math(nodes, links, "SUBTRACT", rgb.outputs[0], rgb.outputs[1]), 0.04, 0.12)
    return _math(nodes, links, "MULTIPLY", scratch, red)


def wear_body(mat):
    """The body's satin red broken up: rougher in patches, scratched, dust on what faces up, grime low, the lamp's
    falloff over it and its sides turning dark."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    base_in, rough_in = bsdf.inputs["Base Color"], bsdf.inputs["Roughness"]
    base = base_in.links[0].from_socket
    rough = rough_in.links[0].from_socket if rough_in.links else rough_in.default_value
    geo = nodes.new("ShaderNodeNewGeometry")
    nsep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geo.outputs["Normal"], nsep.inputs[0])
    psep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geo.outputs["Position"], psep.inputs[0])
    y = psep.outputs["Y"]
    scratch = _scratches(nodes, links, base, y)
    base = _mix(nodes, links, _math(nodes, links, "MULTIPLY", scratch, 0.7), base, (0.24, 0.17, 0.15, 1))
    dust_f = _range(nodes, links, nsep.outputs["Y"], 0.3, 0.8)
    dust_n = noise(nodes, links, 150.0, 8.0, seed_w=11.0)
    dust_f = _math(nodes, links, "MULTIPLY", dust_f, _range(nodes, links, dust_n, 0.35, 0.65, 0.25, 0.75))
    base = _mix(nodes, links, dust_f, base, (0.13, 0.12, 0.105, 1))
    grime = _range(nodes, links, y, 0.08, 0.25, 0.78, 1.0)  # a darker film low on the body and in its rings
    base = times(nodes, links, base, grime, lamp_falloff(nodes, links), turned_away(nodes, links, 0.6, 2.2))
    links.new(base, base_in)
    var = _range(nodes, links, noise(nodes, links, 22.0, 5.0, seed_w=13.0), 0.3, 0.7, 0.85, 1.3)
    r = _math(nodes, links, "MULTIPLY", rough, var)
    r = _math(nodes, links, "ADD", r, _math(nodes, links, "MULTIPLY", _math(nodes, links, "ADD", scratch, dust_f), 0.3))
    links.new(_math(nodes, links, "MINIMUM", _math(nodes, links, "MAXIMUM", r, 0.55), 0.95), rough_in)


def _picture(nodes, name):
    img = nodes.new("ShaderNodeTexImage")
    img.image = bpy.data.images.load(out(name))
    img.image.alpha_mode = "STRAIGHT"
    img.interpolation = "Cubic"
    return img


def _label_material():
    """The worn label, shaded as the body is (the lamp's falloff, darker as it turns away round the cylinder)."""
    mat, nodes, links = material("label")
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    img = _picture(nodes, LABEL)
    col = times(nodes, links, img.outputs["Color"], lamp_falloff(nodes, links), turned_away(nodes, links, 0.6, 2.2))
    col = _mix(nodes, links, 1.0, col, (LABEL_GAIN, LABEL_GAIN, LABEL_GAIN, 1), "MULTIPLY")
    links.new(col, bsdf.inputs["Base Color"])
    links.new(img.outputs["Alpha"], bsdf.inputs["Alpha"])
    rough = _range(nodes, links, noise(nodes, links, 60.0, 6.0, seed_w=17.0), 0.3, 0.7, 0.42, 0.75)
    links.new(rough, bsdf.inputs["Roughness"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    links.new(noise(nodes, links, 400.0, 8.0, seed_w=19.0), bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def label(cx, cz, r, y0, y1, half_angle):
    """The worn label wrapped round the body's front between y0 and y1, and its peeled corner."""
    n_a, n_y = 80, 8
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    rows = []
    for j in range(n_y + 1):
        y = y0 + (y1 - y0) * j / n_y
        rows.append([bm.verts.new((cx + r * math.sin(math.radians(-half_angle + 2 * half_angle * i / n_a)), y,
                                   cz + r * math.cos(math.radians(-half_angle + 2 * half_angle * i / n_a))))
                     for i in range(n_a + 1)])
    for j in range(n_y):
        for i in range(n_a):
            f = bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
            for loop, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[uv_layer].uv = (a / n_a, b / n_y)
    mesh = bpy.data.meshes.new("label")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = link(bpy.data.objects.new("label", mesh))
    obj.data.materials.append(_label_material())
    flap(cx, cz, r, y0, y1, half_angle)
    return obj


def _flap_mesh(cx, cz, r, y0, y1, half_angle, curl_r, fold):
    """The corner as a sheet still held along a straight fold, bent back round a small crease over the label and
    lifting off it toward its tip."""
    k = 1.0 / math.hypot(1.0, 1.15)
    ux, uy = k, 1.15 * k  # into the corner, in label mm (x right, y up)
    n_x, n_y = 40, 34
    xa, ya = W_MM - PEEL_MM - 1.0, H_MM - PEEL_MM / 1.15 - 1.0
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    grid = []
    for j in range(n_y + 1):
        row = []
        for i in range(n_x + 1):
            x = xa + (W_MM - xa) * i / n_x
            y = ya + (H_MM - ya) * j / n_y
            d = max(0.0, (PEEL_MM - ((W_MM - x) + 1.15 * (H_MM - y))) * k)  # mm past the fold
            fx, fy = x - d * ux, y - d * uy
            a = math.radians(-half_angle + 2 * half_angle * fx / W_MM)
            s_pt = Vector((cx + r * math.sin(a), y0 + (y1 - y0) * fy / H_MM, cz + r * math.cos(a)))
            nrm = Vector((math.sin(a), 0.0, math.cos(a)))
            tan = Vector((math.cos(a) * ux, uy, -math.sin(a) * ux)).normalized()
            dm = d / 1000.0
            phi = min(dm / curl_r, fold)
            p = s_pt + tan * curl_r * math.sin(phi) + nrm * (curl_r * (1 - math.cos(phi)) + 0.0002)
            if dm > curl_r * fold:  # past the crease: straight on, back over the label, rising off it
                p = p + (tan * math.cos(fold) + nrm * math.sin(fold)) * (dm - curl_r * fold)
            row.append((bm.verts.new(p), (x / W_MM, y / H_MM)))
        grid.append(row)
    for j in range(n_y):
        for i in range(n_x):
            quad = (grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])
            f = bm.faces.new([q[0] for q in quad])
            for loop, q in zip(f.loops, quad):
                loop[uv_layer].uv = q[1]
    mesh = bpy.data.meshes.new("label-flap")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    # the print faces out from the body where the flap still lies on it
    p0 = mesh.polygons[0]
    if p0.normal.dot(Vector((p0.center.x - cx, 0.0, p0.center.z - cz))) < 0:
        mesh.flip_normals()
    for p in mesh.polygons:
        p.use_smooth = True
    return mesh


def flap(cx, cz, r, y0, y1, half_angle, curl_r=0.0016, fold=math.radians(158)):
    """The label's peeled top right corner: its back shows (paper gone grey, adhesive grimed) and it shades the
    print under it; where it came from, the paint keeps a film of adhesive (in the label's picture). One-sided:
    Backfacing tells the print from the back."""
    obj = link(bpy.data.objects.new("label-flap", _flap_mesh(cx, cz, r, y0, y1, half_angle, curl_r, fold)))
    mat, nodes, links = material("label-flap")
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    img = _picture(nodes, FLAP)
    geo = nodes.new("ShaderNodeNewGeometry")
    back_n = _range(nodes, links, noise(nodes, links, 300.0, 6.0, seed_w=37.0), 0.3, 0.7, 0.7, 1.05)
    back = _mix(nodes, links, 1.0, (0.115, 0.102, 0.075, 1), back_n, "MULTIPLY")
    front = _mix(nodes, links, 1.0, img.outputs["Color"], (LABEL_GAIN, LABEL_GAIN, LABEL_GAIN, 1), "MULTIPLY")
    col = _mix(nodes, links, geo.outputs["Backfacing"], front, back)
    links.new(times(nodes, links, col, lamp_falloff(nodes, links)), bsdf.inputs["Base Color"])
    links.new(img.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Specular IOR Level"].default_value = 0.3
    obj.data.materials.append(mat)
    return obj


def extinguisher():
    """The extinguisher standing in its bracket, its back against the sheet. Returns the extent (x0, y0, x1, y1
    metres) and the hanging point: the saddle's top, under the valve's collar."""
    obj = import_model("korean_fire_extinguisher_01")
    obj.data.materials.append(band_steel())
    strip(obj)
    body = next(m for m in obj.data.materials if m.name.endswith("body"))
    hide_label(body)
    tame(body, sat=0.92, val=0.86, rough_min=0.5)
    obj.rotation_euler = (math.radians(-90), 0, 0)  # standing up
    bpy.ops.object.transform_apply(rotation=True)
    obj.scale = (SCALE,) * 3
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    r = BODY_R * SCALE
    cx, cz = 0.0, r + 0.003 + 0.0006  # the body's axis: its back just off the bracket's plate
    obj.location = (0, 0, cz + AXIS_Y * SCALE)
    bpy.context.view_layer.update()
    wear_body(body)
    y_neck = 0.556 * SCALE
    hose = hose_at(Y_STRAP, -r - 0.05, -r - 0.0015)
    print("HOSE AT STRAP", [round(v, 4) for v in hose])
    label(cx, cz, r + LABEL_LIFT, *Y_LABEL, LABEL_ANGLE)
    bracket(cx, cz, r, 0.20 * SCALE, y_neck, 0.63 * SCALE, NECK_R * SCALE, hose)
    lo, hi = bounds(obj)
    print("BOUNDS", [round(v, 3) for v in lo], [round(v, 3) for v in hi])
    return (min(lo[0], hose[0] - hose[2] - 0.03), lo[1], max(hi[0], r + 0.03), max(hi[1], 0.63 * SCALE + 0.002)), \
        (cx, y_neck)
