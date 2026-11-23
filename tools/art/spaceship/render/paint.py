"""Materials of the hold: painted steel (a CC0 photograph of painted ship steel, recoloured, its rust spots kept,
chipped to bare steel where edges stand proud and where hands wear it), plain surfaces (bare steel, rubber, black
paint, a lamp's glow) and glass."""
import os

import bpy
import numpy as np

from stage import out, texture

PHOTO = "green_metal_rust"


def material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.node_tree.nodes.clear()
    return mat, mat.node_tree.nodes, mat.node_tree.links


def _image(nodes, file, colour):
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(file, check_existing=True)
    if not colour:
        node.image.colorspace_settings.name = "Non-Color"
    return node


_STATS = {}


def photo_stats():
    """The photograph's mean light and a mask of its rust spots (where red outweighs green: the paint is green),
    written once beside the renders."""
    if _STATS:
        return _STATS
    path = out("paint-rust-mask")
    img = bpy.data.images.load(texture(f"{PHOTO}_diff.jpg"), check_existing=True)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    # a byte image's pixels come as stored (sRGB); the shader reads it linear: measure it as the shader sees it
    px[..., :3] = np.where(px[..., :3] <= 0.04045, px[..., :3] / 12.92, ((px[..., :3] + 0.055) / 1.055) ** 2.4)
    lum = px[..., 0] * 0.2126 + px[..., 1] * 0.7152 + px[..., 2] * 0.0722
    d = (px[..., 0] - px[..., 1]) / np.maximum(lum, 1e-3)
    t0, t1 = np.percentile(d, 97.5), np.percentile(d, 99.8)
    m = np.clip((d - t0) / max(t1 - t0, 1e-4), 0, 1)
    m = m * m * (3 - 2 * m)
    if not os.path.exists(path):
        mask = bpy.data.images.new("rustmask", w, h, alpha=False, float_buffer=False)
        rgba = np.ones((h, w, 4), dtype=np.float32)
        rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = m
        mask.pixels.foreach_set(rgba.ravel())
        mask.filepath_raw = path
        mask.file_format = "PNG"
        mask.colorspace_settings.name = "Non-Color"
        mask.save()
    paint_only = m < 0.05
    _STATS.update(mean=float(lum[paint_only].mean()), mask=path,
                  dark=(float(np.percentile(lum, 4)), float(np.percentile(lum, 14))))
    print("PHOTO mean light", _STATS["mean"], "rust share", float((m > 0.5).mean()))
    return _STATS


def _math(nodes, links, op, a, b=None, clamp=False):
    n = nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            links.new(v, n.inputs[i])
    return n.outputs[0]


def _sock(sockets, name):
    """The socket called `name` that the node's current type shows (a Mix node has one per type)."""
    for sock in sockets:
        if sock.name == name and sock.enabled:
            return sock
    raise KeyError(name)


def _mix(nodes, links, fac, a, b, blend="MIX"):
    """A mix of colours, or of numbers when both ends are numbers or float sockets."""
    floaty = all(isinstance(v, (int, float)) or (hasattr(v, "type") and v.type == "VALUE") for v in (a, b))
    n = nodes.new("ShaderNodeMix")
    n.data_type = "FLOAT" if floaty else "RGBA"
    n.blend_type = blend
    for key, v in (("Factor", fac), ("A", a), ("B", b)):
        sock = _sock(n.inputs, key)
        if isinstance(v, (int, float)) and sock.type == "RGBA":
            sock.default_value = (v, v, v, 1)
        elif isinstance(v, (int, float, tuple)):
            sock.default_value = v
        else:
            links.new(v, sock)
    return _sock(n.outputs, "Result")


def _range(nodes, links, v, a, b, c=0.0, d=1.0):
    n = nodes.new("ShaderNodeMapRange")
    n.clamp = True
    links.new(v, n.inputs["Value"])
    n.inputs["From Min"].default_value, n.inputs["From Max"].default_value = a, b
    n.inputs["To Min"].default_value, n.inputs["To Max"].default_value = c, d
    return n.outputs["Result"]


def _photo_coords(nodes, links, span, offset, coords):
    """The photograph's coordinates: `span` scene units to one repeat, shifted by `offset`."""
    tc = nodes.new("ShaderNodeTexCoord")
    mp = nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / span, 1 / span, 1 / span)
    mp.inputs["Location"].default_value = (offset[0], offset[1], 0)
    links.new(tc.outputs[coords], mp.inputs["Vector"])
    return mp.outputs["Vector"]


def _photo(nodes, links, vec, stats):
    """The photograph's colour, normal and roughness maps, and the mask of its rust spots, all at `vec`."""
    maps = (_image(nodes, texture(f"{PHOTO}_diff.jpg"), True), _image(nodes, texture(f"{PHOTO}_nor.jpg"), False),
            _image(nodes, texture(f"{PHOTO}_rough.jpg"), False), _image(nodes, stats["mask"], False))
    for n in maps:
        links.new(vec, n.inputs["Vector"])
    return maps


def _paint_colour(nodes, links, colour, diff, rmask, stats, detail, rust):
    """Fresh paint lit and darkened as the photograph is (`detail` scales its contrast), its rust spots in their
    own colour; also how much of it is rust."""
    bw = nodes.new("ShaderNodeRGBToBW")
    links.new(diff.outputs["Color"], bw.inputs["Color"])
    light = _math(nodes, links, "DIVIDE", bw.outputs[0], stats["mean"])
    # light ** detail: 1 keeps the photograph's own contrast
    light = _math(nodes, links, "POWER", light, detail)
    light = _math(nodes, links, "MINIMUM", light, 1.6)
    paint_col = _mix(nodes, links, 1.0, (*colour, 1), light, "MULTIPLY")
    rust_f = _math(nodes, links, "MULTIPLY", rmask.outputs["Color"], rust)
    return _mix(nodes, links, rust_f, paint_col, diff.outputs["Color"]), rust_f


def _chips(nodes, links, vec, span, edge, chip):
    """Where the paint is chipped off and where its primer shows: on edges standing proud (the bevel's normal
    leaves the face's own there) and where the mesh is marked "worn", where the wear is strong and the noise high;
    the lower the wear, the higher the noise must be. Returns the chips, the primer round them and the raw measure."""
    geo = nodes.new("ShaderNodeNewGeometry")
    bev = nodes.new("ShaderNodeBevel")
    bev.samples = 8
    bev.inputs["Radius"].default_value = edge
    dot = nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    links.new(bev.outputs["Normal"], dot.inputs[0])
    links.new(geo.outputs["Normal"], dot.inputs[1])
    edge_f = _range(nodes, links, _math(nodes, links, "SUBTRACT", 1.0, dot.outputs["Value"]), 0.01, 0.12)
    attr = nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "worn"
    wear = _math(nodes, links, "ADD", edge_f, attr.outputs["Fac"], clamp=True)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9.0 / span * 4
    noise.inputs["Detail"].default_value = 12.0
    noise.inputs["Roughness"].default_value = 0.7
    links.new(vec, noise.inputs["Vector"])
    need = _math(nodes, links, "SUBTRACT", 1.0, _math(nodes, links, "MULTIPLY", wear, 0.62 * chip))
    chip_raw = _math(nodes, links, "SUBTRACT", noise.outputs["Fac"], _math(nodes, links, "MULTIPLY", need, 0.75))
    return _range(nodes, links, chip_raw, 0.0, 0.03), _range(nodes, links, chip_raw, -0.03, 0.0), chip_raw


def _flaked(nodes, links, base, chips, steel, broken):
    """The paint with its primer showing round each chip, the chips bare steel, and (with `broken`) a dark broken
    rim of paint just outside the primer: grime packed into the flaking edge."""
    chip_f, primer_f, chip_raw = chips
    base = _mix(nodes, links, primer_f, base, (0.16, 0.16, 0.15, 1))
    if broken:
        rim_f = _range(nodes, links, chip_raw, -0.06, -0.02)
        rim_f = _math(nodes, links, "MULTIPLY", _math(nodes, links, "SUBTRACT", rim_f, primer_f), broken)
        base = _mix(nodes, links, _math(nodes, links, "MAXIMUM", rim_f, 0.0), base, (0.035, 0.03, 0.022, 1))
    return _mix(nodes, links, chip_f, base, (steel, steel * 0.98, steel * 0.95, 1))


def _grimed(nodes, links, base, edge, grime):
    """Dirt in the crevices, as deep as the ambient occlusion within three bevels' reach finds them."""
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 8
    ao.inputs["Distance"].default_value = edge * 3
    dirt = _range(nodes, links, ao.outputs["AO"], 0.2, 1.0, 1.0 - grime, 1.0)
    return _mix(nodes, links, 1.0, base, dirt, "MULTIPLY")


def _surface(nodes, links, bsdf, maps, chip_f, rust_f, gloss, steel_rough, edge):
    """Metal where chipped; the paint's roughness from the photograph (lower with `gloss`), the bare steel's
    `steel_rough`, rust rough; the photograph's scratches as relief, the edges rounded."""
    _diff, nor, rough, _mask = maps
    links.new(chip_f, bsdf.inputs["Metallic"])
    paint_rough = _range(nodes, links, rough.outputs["Color"], 0.0, 1.0, 0.62 - gloss * 0.3, 0.95 - gloss * 0.3)
    r = _mix(nodes, links, chip_f, paint_rough, steel_rough)
    r = _mix(nodes, links, rust_f, r, 0.9)
    links.new(r, bsdf.inputs["Roughness"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.7
    links.new(nor.outputs["Color"], nmap.inputs["Color"])
    bev2 = nodes.new("ShaderNodeBevel")
    bev2.samples = 8
    bev2.inputs["Radius"].default_value = edge * 0.4
    links.new(nmap.outputs["Normal"], bev2.inputs["Normal"])
    links.new(bev2.outputs["Normal"], bsdf.inputs["Normal"])


def painted(name, colour, span=4.0, offset=(0.0, 0.0), chip=1.0, edge=0.06, rust=1.0, grime=0.6, detail=1.0,
            gloss=0.5, steel=0.32, coords="Object", steel_rough=0.38, broken=0.0):
    """Painted steel. `colour` linear RGB of fresh paint; the photograph gives its light and dark (scaled by
    `detail`), its scratches' relief and its rust spots (`rust`); edges standing proud (`edge`: the bevel's reach
    in scene units) and the mesh's float attribute "worn" are chipped to bare steel by `chip`; crevices dirtied
    by `grime`. `span` scene units to one repeat of the photograph. `steel_rough` is the bare steel's roughness;
    `broken` darkens the paint's broken edge round each chip (grime caught in the flaking rim), 0 to 1."""
    stats = photo_stats()
    mat, nodes, links = material(name)
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    vec = _photo_coords(nodes, links, span, offset, coords)
    maps = _photo(nodes, links, vec, stats)
    base, rust_f = _paint_colour(nodes, links, colour, maps[0], maps[3], stats, detail, rust)
    chips = _chips(nodes, links, vec, span, edge, chip)
    base = _grimed(nodes, links, _flaked(nodes, links, base, chips, steel, broken), edge, grime)
    links.new(base, bsdf.inputs["Base Color"])
    _surface(nodes, links, bsdf, maps, chips[0], rust_f, gloss, steel_rough, edge)
    return mat


def plain(name, colour, rough=0.6, metallic=0.0, emission=None, strength=0.0):
    mat, nodes, links = material(name)
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    return mat


def glass(name, tint=(0.9, 0.95, 0.92), rough=0.03, ior=1.52):
    mat, nodes, links = material(name)
    outn = nodes.new("ShaderNodeOutputMaterial")
    g = nodes.new("ShaderNodeBsdfGlass")
    g.inputs["Color"].default_value = (*tint, 1)
    g.inputs["Roughness"].default_value = rough
    g.inputs["IOR"].default_value = ior
    links.new(g.outputs[0], outn.inputs["Surface"])
    return mat
