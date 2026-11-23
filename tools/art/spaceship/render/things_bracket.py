"""The extinguisher's wall bracket: black-painted steel bolted to the sheet. A back plate rising behind the valve, a
saddle under the valve's collar (what carries the weight), a crossbar behind the body's upper third with a bolted
ear either side, and a webbing strap from ear to ear round the body, closed by a steel cam buckle.

The strap runs round the upper third, clear of the hose clip's band (the hose's nozzle stays seated in it). Its left
end goes back into a slot in the gap between the body and the hose, and the crossbar runs on behind the hose to its
ear, so both ears show.
"""
import math

import bmesh
import bpy
from mathutils import Vector

from kit import bolt_head, box, link, rod
from paint import _math, _mix, _range, material, plain
from things_paint import black_steel, lamp_falloff, steel, times, turned_away

Y_STRAP = 0.392  # the strap round the upper third, clear of the hose clip's band (metres)
STRAP_W = 0.025
T = 0.003  # the bracket's sheet steel


def noise(nodes, links, scale, detail=6.0, stretch=(1, 1, 1), seed_w=0.0):
    """Noise over the world position, stretched, its own `seed_w`."""
    geo = nodes.new("ShaderNodeNewGeometry")
    mp = nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = stretch
    links.new(geo.outputs["Position"], mp.inputs["Vector"])
    n = nodes.new("ShaderNodeTexNoise")
    n.noise_dimensions = "4D"
    n.inputs["W"].default_value = seed_w
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    links.new(mp.outputs["Vector"], n.inputs["Vector"])
    return n.outputs["Fac"]


def webbing(y_mid, width):
    """Dark olive nylon webbing, dirty, its weave a fine rib along it, fraying a little at both edges; dark as it
    turns round the body."""
    mat, nodes, links = material("webbing")
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    geo = nodes.new("ShaderNodeNewGeometry")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geo.outputs["Position"], sep.inputs[0])
    off = _math(nodes, links, "ABSOLUTE", _math(nodes, links, "SUBTRACT", sep.outputs["Y"], y_mid))
    fuzz = noise(nodes, links, 1.0, 3.0, stretch=(2500, 300, 2500), seed_w=23.0)
    edge = _range(nodes, links, _math(nodes, links, "ADD", off, _math(nodes, links, "MULTIPLY", fuzz, 0.0012)),
                  width / 2 - 0.0012, width / 2 + 0.0002)
    dirt = _range(nodes, links, noise(nodes, links, 70.0, 6.0, seed_w=29.0), 0.3, 0.7, 0.7, 1.15)
    rib = nodes.new("ShaderNodeTexWave")
    rib.bands_direction = "Y"
    rib.inputs["Scale"].default_value = 1100.0
    links.new(geo.outputs["Position"], rib.inputs["Vector"])
    col = _mix(nodes, links, edge, (0.05, 0.052, 0.034, 1), (0.10, 0.098, 0.08, 1))
    col = times(nodes, links, col, dirt, _range(nodes, links, rib.outputs["Fac"], 0.0, 1.0, 0.85, 1.05),
                lamp_falloff(nodes, links), turned_away(nodes, links, 0.3, 1.4))
    links.new(col, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.55
    bsdf.inputs["Specular IOR Level"].default_value = 0.35
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    links.new(rib.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def buckle_steel():
    """Zinc-plated steel gone dull and grubby: a soft sheen that still catches the lamp on its bevels."""
    mat, nodes, links = material("buckle-steel")
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    n = noise(nodes, links, 300.0, 8.0, seed_w=31.0)
    col = _mix(nodes, links, _range(nodes, links, n, 0.4, 0.7), (0.34, 0.33, 0.31, 1), (0.13, 0.125, 0.11, 1))
    links.new(col, bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.9
    links.new(_range(nodes, links, n, 0.3, 0.7, 0.3, 0.55), bsdf.inputs["Roughness"])
    return mat


def ribbon(name, pts, y, width, mat, thick=0.0021):
    """A strip of webbing along a path of (x, z) points at height y."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y - width / 2, z)) for x, z in pts]
    hi = [bm.verts.new((x, y + width / 2, z)) for x, z in pts]
    for i in range(len(pts) - 1):
        bm.faces.new((lo[i], lo[i + 1], hi[i + 1], hi[i]))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = link(bpy.data.objects.new(name, mesh))
    obj.data.materials.append(mat)
    sol = obj.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = thick
    sol.offset = 1.0
    return obj


def hose_at(y, x_from, x_to, step=0.0004):
    """The hose's section at height y, found by rays from the front: centre x, front z, radius."""
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    hits = []
    x = x_from
    while x < x_to:
        hit, loc, *_ = bpy.context.scene.ray_cast(deps, Vector((x, y, 1)), Vector((0, 0, -1)))
        if hit and loc.z > 0.006:
            hits.append((x, loc.z))
        x += step
    if not hits:
        raise SystemExit(f"no hose found at y {y}")
    xa, xb = hits[0][0], hits[-1][0]
    front = max(z for _, z in hits)
    hr = (xb - xa) / 2
    return (xa + xb) / 2, front - hr, hr


def arc(cx, cz, rad, a0, a1, n):
    """Points round the body's axis from angle a0 to a1 (degrees from the front), as (x, z)."""
    return [(cx + rad * math.sin(math.radians(a0 + (a1 - a0) * i / n)),
             cz + rad * math.cos(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def strap(cx, cz, r, hose):
    """Webbing from the right ear round the front of the body back to the crossbar's left slot, in the gap between
    the body and the hose; the buckle a little left of the front, catching the lamp; the tail tucked over it.
    Returns the left ear's x, the right ear's x and the left slot's x."""
    mat = webbing(Y_STRAP, STRAP_W)
    rr = r + 0.0006
    hx, _, hr = hose
    ear_r = cx + r + 0.012
    slot_l = (cx - r + (hx + hr)) / 2  # half way between the body and the hose
    pts = [(ear_r, 2 * T + 0.0012), (cx + rr + 0.0025, cz - 0.03)]
    pts += arc(cx, cz, rr, 100, -100, 80)
    pts += [(slot_l, 2 * T + 0.0012)]
    ribbon("strap", pts, Y_STRAP, STRAP_W, mat)
    a = -16.0
    buckle(cx, cz, rr + 0.0016, a)
    tail = arc(cx, cz, rr + 0.0019, a - 8, a - 30, 10)
    ribbon("strap-tail", tail, Y_STRAP + 0.0004, STRAP_W - 0.0016, mat, thick=0.0014)
    return hx - hr - 0.012, ear_r, slot_l


def lever_arc(cx, cz, rad, a0, a1, width, mat, thick=0.0015):
    obj = ribbon("buckle-lever", arc(cx, cz, rad, a0, a1, 12), Y_STRAP, width, mat, thick=thick)
    bev = obj.modifiers.new("bevel", "BEVEL")
    bev.width, bev.segments = 0.0005, 2
    return obj


def buckle(cx, cz, rad, a):
    """A cam buckle on the strap at angle a (degrees from the front): a bent steel frame round the webbing and a
    stamped lever over it with a raised rib down its middle, its outer end curled."""
    steel_m = buckle_steel()
    w = STRAP_W
    half = 9.0
    for s in (-1, 1):  # the frame's side rails, along the strap's edges
        rail = [(x, Y_STRAP + s * (w / 2 + 0.0024), z) for x, z in arc(cx, cz, rad + 0.0012, a - half, a + half, 10)]
        rod("buckle-rail", rail, 0.0014, steel_m, bevel_res=4)
    for da in (-half, half):  # cross bars at each end
        x, z = arc(cx, cz, rad + 0.0012, a + da, a + da, 1)[0]
        rod("buckle-bar", [(x, Y_STRAP - w / 2 - 0.0024, z), (x, Y_STRAP + w / 2 + 0.0024, z)], 0.0014, steel_m,
            bevel_res=4)
    lever_arc(cx, cz, rad + 0.0040, a - half + 2.5, a + half + 1.0, w + 0.001, steel_m)
    lever_arc(cx, cz, rad + 0.0054, a - half + 4.0, a + half - 0.5, 0.005, steel_m, thick=0.0008)
    ex, ez = arc(cx, cz, rad + 0.0058, a + half + 1.5, a + half + 1.5, 1)[0]
    rod("buckle-curl", [(ex, Y_STRAP - w / 2 - 0.0002, ez), (ex, Y_STRAP + w / 2 + 0.0002, ez)], 0.0017, steel_m,
        bevel_res=4)


def bracket(cx, cz, r, y_low, y_neck, y_top, neck_r, hose):
    """The back plate from below the strap up past the valve, the saddle round the back of the neck under the
    valve's collar, the strap, and the crossbar with its bolted ears and the slots the strap's ends pass through
    (dark openings in its face, a lip over each)."""
    blk = black_steel()
    bolt = steel("bolt", 0.3, 0.45)
    plate_w = 0.05
    box("back-plate", (cx, (y_low + y_top) / 2, T / 2), (plate_w, y_top - y_low, T), blk, bevel=0.001)
    for y in (y_top - 0.012, y_low + 0.012):
        bolt_head("plate-bolt", cx, y, bolt).location.z = T
    sad_w = 2 * neck_r + 0.022
    box("saddle", (cx, y_neck - 0.003, (T + cz) / 2 + 0.002), (sad_w, 0.006, cz - T + 0.004), blk, bevel=0.0012)
    ear_l, ear_r, slot_l = strap(cx, cz, r, hose)
    x0, x1 = ear_l - 0.010, ear_r + 0.010
    box("crossbar", ((x0 + x1) / 2, Y_STRAP, T + 0.0015), (x1 - x0, 0.034, T), blk, bevel=0.0006)
    for x in (ear_l - 0.0045, ear_r + 0.0045):
        bolt_head("ear-bolt", x, Y_STRAP, bolt, radius=0.0045).location.z = 2 * T
    hole = plain("slot", (0.004, 0.004, 0.004), rough=0.9)
    for x in (slot_l, ear_r):
        box("slot", (x, Y_STRAP, 2 * T + 0.0001), (0.0035, STRAP_W + 0.003, 0.0004), hole)
        box("slot-lip", (x + (0.0028 if x < cx else -0.0028), Y_STRAP, 2 * T + 0.0004),
            (0.0018, STRAP_W + 0.005, 0.0012), blk, bevel=0.0004)
