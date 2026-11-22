"""The strongbox's materials: black forged iron, the box's oiled boards, wool cloth, and the lamp's light, all
made from CC0 photographs (../textures.ts) and Blender's own noise. Small helpers build their node trees."""
import bpy

from measures import texture


def _n(nodes, kind, **inputs):
    node = nodes.new(kind)
    for key, value in inputs.items():
        node.inputs[key].default_value = value
    return node


def _math(nodes, links, op, a, b=0.0):
    m = nodes.new("ShaderNodeMath")
    m.operation = op
    for k, v in enumerate((a, b)):
        if isinstance(v, (int, float)):
            m.inputs[k].default_value = v
        else:
            links.new(v, m.inputs[k])
    return m.outputs["Value"]


def _ramp(nodes, links, v, lo, hi, to_lo=0.0, to_hi=1.0):
    r = nodes.new("ShaderNodeMapRange")
    r.inputs["From Min"].default_value, r.inputs["From Max"].default_value = lo, hi
    r.inputs["To Min"].default_value, r.inputs["To Max"].default_value = to_lo, to_hi
    links.new(v, r.inputs["Value"])
    return r.outputs["Result"]


def _mix(nodes, links, a, b, factor):
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    for key, v in (("A", a), ("B", b)):
        if isinstance(v, tuple):
            mix.inputs[key].default_value = v
        else:
            links.new(v, mix.inputs[key])
    if isinstance(factor, (int, float)):
        mix.inputs["Factor"].default_value = factor
    else:
        links.new(factor, mix.inputs["Factor"])
    return mix.outputs["Result"]


def _photo(nodes, links, vector, name, colour=True, projection="FLAT"):
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(texture(name))
    if not colour:
        tex.image.colorspace_settings.name = "Non-Color"
    tex.projection = projection
    if projection == "BOX":
        tex.projection_blend = 0.3
    links.new(vector, tex.inputs["Vector"])
    return tex.outputs["Color"]


def _coords(nodes, links, scale, offset=(0, 0, 0), kind="Object"):
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    mapping.inputs["Location"].default_value = offset
    links.new(coord.outputs[kind], mapping.inputs["Vector"])
    return mapping.outputs["Vector"]


def _new(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    return mat, mat.node_tree.nodes, mat.node_tree.links, mat.node_tree.nodes["Principled BSDF"]


def _rubbed_edges(nodes, links, v, ao, edge_width):
    """Where hands and keys rub the iron: its convex edges, found by a bevel mask (1 - the true normal . a rounded
    one is high only on an edge), in patches. Returns the mask and the bevel node, whose normal is set later."""
    geo = nodes.new("ShaderNodeNewGeometry")
    bevel = nodes.new("ShaderNodeBevel")
    bevel.samples = 8
    bevel.inputs["Radius"].default_value = edge_width
    dot = nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    links.new(geo.outputs["Normal"], dot.inputs[0])
    links.new(bevel.outputs["Normal"], dot.inputs[1])
    edge = _ramp(nodes, links, _math(nodes, links, "SUBTRACT", 1.0, dot.outputs["Value"]), 0.004, 0.05, 0.0, 1.0)
    convex = _ramp(nodes, links, ao.outputs["AO"], 0.82, 0.98, 0.0, 1.0)
    wear = _n(nodes, "ShaderNodeTexNoise", Scale=6.0, Detail=6.0)
    links.new(v, wear.inputs["Vector"])
    patchy = _ramp(nodes, links, wear.outputs["Fac"], 0.35, 0.6, 0.25, 1.0)
    return _math(nodes, links, "MULTIPLY", _math(nodes, links, "MULTIPLY", edge, convex), patchy), bevel


def _scratches(nodes, links, marks):
    """Scratches cut bright through the black where picks slipped or a bar went in: a seeded picture, `marks` =
    (path, x0, y0, size) in scene units, the square it covers. Returns how bright, 0 to 1."""
    path, mx, my, size = marks
    mc = nodes.new("ShaderNodeTexCoord")
    mm = nodes.new("ShaderNodeMapping")
    mm.inputs["Location"].default_value = (-mx / size, -my / size, 0)
    mm.inputs["Scale"].default_value = (1 / size, 1 / size, 1)
    links.new(mc.outputs["Object"], mm.inputs["Vector"])
    img = nodes.new("ShaderNodeTexImage")
    img.image = bpy.data.images.load(path)
    img.image.colorspace_settings.name = "Non-Color"
    img.extension = "CLIP"
    links.new(mm.outputs["Vector"], img.inputs["Vector"])
    bw = nodes.new("ShaderNodeRGBToBW")
    links.new(img.outputs["Color"], bw.inputs["Color"])
    return bw.outputs["Val"]


def _iron_colour(nodes, links, light, ao, grey):
    """The iron's light as a near-neutral colour, with a dark umber bloom of old rust in its hollows."""
    comb = nodes.new("ShaderNodeCombineColor")
    for k, ch in enumerate(("Red", "Green", "Blue")):
        links.new(_math(nodes, links, "MULTIPLY", light, (1.0, 0.97, 0.93)[k]), comb.inputs[ch])
    bloom = _ramp(nodes, links, ao.outputs["AO"], 0.55, 0.85, 1.0, 0.0)
    bloom = _math(nodes, links, "MULTIPLY", bloom, _ramp(nodes, links, grey.outputs["Val"], 0.15, 0.45, 1.0, 0.2))
    return _mix(nodes, links, comb.outputs["Color"], (0.030, 0.020, 0.013, 1), _math(nodes, links, "MULTIPLY", bloom, 0.7))


def _hammered(nodes, links, v, hammer, facet_scale):
    """The rust photograph's relief, hammered over in shallow facets."""
    nor = _n(nodes, "ShaderNodeNormalMap", Strength=0.8)
    links.new(_photo(nodes, links, v, "rust_coarse_01_nor.jpg", False, "BOX"), nor.inputs["Color"])
    facets = nodes.new("ShaderNodeTexVoronoi")
    facets.feature = "SMOOTH_F1"
    facets.inputs["Scale"].default_value = facet_scale
    facets.inputs["Randomness"].default_value = 1.0
    links.new(v, facets.inputs["Vector"])
    bump = _n(nodes, "ShaderNodeBump", Strength=hammer, Distance=0.04)
    links.new(facets.outputs["Distance"], bump.inputs["Height"])
    links.new(nor.outputs["Normal"], bump.inputs["Normal"])
    return bump.outputs["Normal"]


def iron(name="iron", tone=0.075, scale=0.35, offset=(0, 0, 0), hammer=0.25, metallic=0.8, dull=0.0, rub=0.1,
         edge_width=0.03, rub_bright=0.16, grime=0.6, facet_scale=9.0, marks=None, mark_bright=0.22):
    """Black forged iron: dark (the studio turns a lighter metal to zinc), dull, hammered in shallow facets,
    patched where the photograph of coarse rust is dark. Only convex edges are rubbed bright; the hollows where
    iron meets wood or a rivet's foot take grime and a dark bloom of rust (umber, never red)."""
    mat, nodes, links, bsdf = _new(name)
    v = _coords(nodes, links, scale, offset)
    grey = nodes.new("ShaderNodeRGBToBW")
    links.new(_photo(nodes, links, v, "rust_coarse_01_diff.jpg", projection="BOX"), grey.inputs["Color"])
    light = _ramp(nodes, links, grey.outputs["Val"], 0.1, 0.55, tone * 0.35, tone * 2.0)
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 16
    ao.inputs["Distance"].default_value = 0.08
    light = _math(nodes, links, "MULTIPLY", light, _ramp(nodes, links, ao.outputs["AO"], 0.5, 0.97, 1.0 - grime, 1.0))
    rubbed, bevel = _rubbed_edges(nodes, links, v, ao, edge_width)
    light = _math(nodes, links, "ADD", light, _math(nodes, links, "MULTIPLY", rubbed, rub_bright * (rub / 0.1 if rub else 0.0)))
    scratched = _scratches(nodes, links, marks) if marks else None
    if scratched is not None:
        light = _math(nodes, links, "ADD", light, _math(nodes, links, "MULTIPLY", scratched, mark_bright))
    links.new(_iron_colour(nodes, links, light, ao, grey), bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = metallic
    rough = _ramp(nodes, links, grey.outputs["Val"], 0.1, 0.5, 0.5 + dull, min(1.0, 0.86 + dull))
    rough = _math(nodes, links, "SUBTRACT", rough, _math(nodes, links, "MULTIPLY", rubbed, 0.2))
    if scratched is not None:
        rough = _math(nodes, links, "SUBTRACT", rough, _math(nodes, links, "MULTIPLY", scratched, 0.35))
    links.new(rough, bsdf.inputs["Roughness"])
    normal = _hammered(nodes, links, v, hammer, facet_scale)
    links.new(normal, bevel.inputs["Normal"])
    links.new(normal, bsdf.inputs["Normal"])
    return mat


def wool(name="wool", scale=0.6, tone=0.16, sheen=0.7, offset=(0, 0, 0), relief=1.4, fuzz=0.0, sheen_rough=0.45):
    """Wool cloth: the herringbone photograph toned down (its weave stays in the normal map and in the cloth's
    sheen, which is what makes cloth read as cloth), a broad pale sheen (wool, not a hotspot), and with `fuzz`
    a fine noise of loose fibres."""
    mat, nodes, links, bsdf = _new(name)
    v = _coords(nodes, links, scale, offset)
    mul = nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    links.new(_photo(nodes, links, v, "poly_wool_herringbone_diff.jpg"), mul.inputs["A"])
    mul.inputs["B"].default_value = (tone * 1.04, tone * 1.0, tone * 0.95, 1)
    links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
    rough = _ramp(nodes, links, _photo(nodes, links, v, "poly_wool_herringbone_rough.jpg", False), 0.0, 1.0, 0.8, 1.0)
    links.new(rough, bsdf.inputs["Roughness"])
    bsdf.inputs["Sheen Weight"].default_value = sheen
    bsdf.inputs["Sheen Roughness"].default_value = sheen_rough
    bsdf.inputs["Sheen Tint"].default_value = (0.36, 0.35, 0.34, 1)
    bsdf.inputs["Specular IOR Level"].default_value = 0.25
    nor = _n(nodes, "ShaderNodeNormalMap", Strength=relief)
    links.new(_photo(nodes, links, v, "poly_wool_herringbone_nor.jpg", False), nor.inputs["Color"])
    normal = nor.outputs["Normal"]
    if fuzz:
        grain = _n(nodes, "ShaderNodeTexNoise", Scale=fuzz, Detail=10.0, Roughness=0.7)
        links.new(_coords(nodes, links, 1.0), grain.inputs["Vector"])
        bump = _n(nodes, "ShaderNodeBump", Strength=0.55, Distance=0.01)
        links.new(grain.outputs["Fac"], bump.inputs["Height"])
        links.new(normal, bump.inputs["Normal"])
        normal = bump.outputs["Normal"]
    links.new(normal, bsdf.inputs["Normal"])
    return mat


def wood(name="wood", tint=(0.42, 0.33, 0.26), coords="UV", scale=1.0, photo="medieval_wood", oil=0.0, offset=(0, 0, 0)):
    """The strongbox's boards: a photograph of old planks darkened toward a smoked brown. `oil` gives the
    boards a thin coat of old oil (a clear coat with a soft sheen), unlike the hides theme's raw timber."""
    mat, nodes, links, bsdf = _new(name)
    v = _coords(nodes, links, scale, offset, coords)
    diff = _photo(nodes, links, v, f"{photo}_diff.jpg")
    mul = nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    links.new(diff, mul.inputs["A"])
    mul.inputs["B"].default_value = (*tint, 1)
    links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
    rough = _photo(nodes, links, v, f"{photo}_rough.jpg", False)
    links.new(_ramp(nodes, links, rough, 0.0, 1.0, 0.45 if oil else 0.0, 0.85 if oil else 1.0), bsdf.inputs["Roughness"])
    nor = _n(nodes, "ShaderNodeNormalMap", Strength=1.2)
    links.new(_photo(nodes, links, v, f"{photo}_nor.jpg", False), nor.inputs["Color"])
    links.new(nor.outputs["Normal"], bsdf.inputs["Normal"])
    if oil:
        bsdf.inputs["Coat Weight"].default_value = oil
        bsdf.inputs["Coat Roughness"].default_value = 0.38
        bsdf.inputs["Coat Tint"].default_value = (0.9, 0.8, 0.65, 1)
        links.new(nor.outputs["Normal"], bsdf.inputs["Coat Normal"])
    return mat


def black(name="hole"):
    mat, nodes, links, bsdf = _new(name)
    bsdf.inputs["Base Color"].default_value = (0.004, 0.003, 0.003, 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    return mat


def glow(name="glow", colour=(1.0, 0.55, 0.22), strength=12.0):
    """Light from inside the box."""
    mat, nodes, links, bsdf = _new(name)
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    bsdf.inputs["Emission Color"].default_value = (*colour, 1)
    bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def thread(name="thread", colour=(0.018, 0.017, 0.019)):
    mat, nodes, links, bsdf = _new(name)
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Specular IOR Level"].default_value = 0.15
    return mat

