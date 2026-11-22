"""Old, bloodless skin for the real hands, round 3.

Colour: cold grey, mottled at three sizes (fine, mid, broad, the broad one gentle), yellowed and livid patches, livid
blue-grey fingertips, veins under it; hollows tinted a dead yellow-grey. Relief: pores, crepe, the joint creases (an
attribute made from the mesh, deeper where a joint is straight) and the tendons. Sheen: a real specular broken up
by the pores, sharper on knuckles and tendons where the skin is stretched. Nails: horn plates, yellow-grey at the
root going dark at the long free edge, with ridges along them and a wet streak of light.

It goes clear before the picture's outside edge: whole up to the picture's side, gone 45 tile units outside it, and
sinking toward the glass's violet (not black) on the way, so the wrist melts into the glow instead of ending."""
import bpy


def _n(nodes, kind, x=0, **inputs):
    node = nodes.new(kind)
    for key, value in inputs.items():
        node.inputs[key].default_value = value
    return node


def _attr(nodes, name, vector=False):
    node = nodes.new("ShaderNodeAttribute")
    node.attribute_name = name
    return node.outputs["Vector" if vector else "Fac"]


def _math(nodes, links, op, a, b=None, clamp=False):
    node = nodes.new("ShaderNodeMath")
    node.operation = op
    node.use_clamp = clamp
    for k, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            node.inputs[k].default_value = v
        else:
            links.new(v, node.inputs[k])
    return node.outputs[0]


def _mix(nodes, links, fac, a, b, blend="MIX"):
    node = nodes.new("ShaderNodeMix")
    node.data_type = "RGBA"
    node.blend_type = blend
    for socket, v in (("Factor", fac), ("A", a), ("B", b)):
        if isinstance(v, tuple):
            node.inputs[socket].default_value = (*v, 1) if len(v) == 3 else v
        elif isinstance(v, (int, float)):
            node.inputs[socket].default_value = v
        else:
            links.new(v, node.inputs[socket])
    return node.outputs["Result"]


def _noise(nodes, links, vector, scale, detail=4.0, rough=0.55, distortion=0.0):
    node = _n(nodes, "ShaderNodeTexNoise", Scale=scale, Detail=detail, Roughness=rough, Distortion=distortion)
    links.new(vector, node.inputs["Vector"])
    return node.outputs["Fac"]


def _ramp(nodes, links, value, a, b, c, d, smooth=False):
    node = nodes.new("ShaderNodeMapRange")
    if smooth:
        node.interpolation_type = "SMOOTHSTEP"
    node.inputs["From Min"].default_value, node.inputs["From Max"].default_value = a, b
    node.inputs["To Min"].default_value, node.inputs["To Max"].default_value = c, d
    links.new(value, node.inputs["Value"])
    return node.outputs["Result"]


def _grey(nodes, links, value):
    node = nodes.new("ShaderNodeCombineColor")
    for ch in ("Red", "Green", "Blue"):
        links.new(value, node.inputs[ch])
    return node.outputs["Color"]


def _octaves(nodes, links, rest):
    """Uneven tone in three sizes: about 0.02, 0.1 and 0.4 dm across."""
    fine = _ramp(nodes, links, _noise(nodes, links, rest, 48.0, detail=2, rough=0.5), 0.3, 0.7, 0.93, 1.06)
    mid = _ramp(nodes, links, _noise(nodes, links, rest, 10.0, detail=2, rough=0.5), 0.35, 0.65, 0.86, 1.1)
    broad = _ramp(nodes, links, _noise(nodes, links, rest, 2.5, detail=1, rough=0.4), 0.35, 0.65, 0.92, 1.06)
    return _math(nodes, links, "MULTIPLY", _math(nodes, links, "MULTIPLY", fine, mid), broad)


def _skin_colour(nodes, links, rest, pallor, tip_tint):
    veins, tip = _attr(nodes, "veins"), _attr(nodes, "tip")
    base = _mix(nodes, links, 1.0, pallor, _grey(nodes, links, _octaves(nodes, links, rest)), "MULTIPLY")
    tint = _ramp(nodes, links, _noise(nodes, links, rest, 6.0, detail=2), 0.45, 0.62, 0.0, 1.0, smooth=True)
    base = _mix(nodes, links, _math(nodes, links, "MULTIPLY", tint, 0.35), base, (0.44, 0.41, 0.30))
    livid_patch = _ramp(nodes, links, _noise(nodes, links, rest, 7.0, detail=2), 0.52, 0.66, 0.0, 0.55, smooth=True)
    livid = _math(nodes, links, "MAXIMUM", _math(nodes, links, "MULTIPLY", tip, 0.8), livid_patch)
    base = _mix(nodes, links, livid, base, tip_tint)
    return _mix(nodes, links, _math(nodes, links, "MULTIPLY", veins, 0.5), base, (0.17, 0.22, 0.28))


def _nail_colour(nodes, links, rest):
    """The plate is clear horn over a livid bed (dark blue-grey); past the fingertip it is yellow-brown horn going
    dark at the long free edge, with grime packed under it where it leaves the finger."""
    free = _attr(nodes, "free")
    streaks = _n(nodes, "ShaderNodeTexWave", Scale=70.0, Distortion=2.0, Detail=2.0)
    streaks.bands_direction = "Y"
    links.new(rest, streaks.inputs["Vector"])
    bed = _mix(nodes, links, _math(nodes, links, "MULTIPLY", streaks.outputs["Fac"], 0.45), (0.25, 0.23, 0.27),
               (0.17, 0.155, 0.19))
    # The plate's root, over the half-moon, is paler; it darkens toward where the plate leaves the flesh.
    root = _ramp(nodes, links, _attr(nodes, "along"), 0.0, 0.3, 1.0, 0.0, smooth=True)
    bed = _mix(nodes, links, _math(nodes, links, "MULTIPLY", root, 0.5), bed, (0.34, 0.33, 0.33))
    horn = _mix(nodes, links, _ramp(nodes, links, free, 0.0, 0.25, 0.0, 1.0, smooth=True), bed, (0.24, 0.20, 0.12))
    horn = _mix(nodes, links, _ramp(nodes, links, free, 0.3, 0.9, 0.0, 1.0, smooth=True), horn, (0.05, 0.042, 0.032))
    grime = _math(nodes, links, "MULTIPLY", _ramp(nodes, links, free, 0.0, 0.06, 0.0, 1.0, smooth=True),
                  _ramp(nodes, links, free, 0.2, 0.08, 0.0, 1.0, smooth=True))
    return _mix(nodes, links, _math(nodes, links, "MULTIPLY", grime, 0.8), horn, (0.035, 0.03, 0.025))


def _relief(nodes, links, rest, skin_f, nail_f):
    pores = _n(nodes, "ShaderNodeTexVoronoi", Scale=300.0)
    links.new(rest, pores.inputs["Vector"])
    crepe = _noise(nodes, links, rest, 110.0, detail=6, rough=0.65, distortion=0.5)
    height = _math(nodes, links, "ADD", _math(nodes, links, "MULTIPLY", pores.outputs["Distance"], 0.22),
                   _math(nodes, links, "MULTIPLY", crepe, 0.18))
    height = _math(nodes, links, "ADD", height, _math(nodes, links, "MULTIPLY", _attr(nodes, "crease"), 1.6))
    height = _math(nodes, links, "MULTIPLY", height, skin_f)
    ridges = _n(nodes, "ShaderNodeTexWave", Scale=70.0, Distortion=2.0, Detail=2.0)
    ridges.bands_direction = "Y"
    links.new(rest, ridges.inputs["Vector"])
    height = _math(nodes, links, "ADD", height, _math(nodes, links, "MULTIPLY", ridges.outputs["Fac"],
                                                       _math(nodes, links, "MULTIPLY", nail_f, 0.3)))
    bump = _n(nodes, "ShaderNodeBump", Strength=0.55, Distance=0.004)
    links.new(height, bump.inputs["Height"])
    return bump.outputs["Normal"], pores.outputs["Distance"]


def _fade(nodes, links, edge_x, out_to, near, far, sink_from, sink_to):
    """(seen, lit): seen 1 up to the picture's side and 0 `out_to` scene units outside it, and by depth; lit sinks
    toward the glass colour a little earlier."""
    geo = nodes.new("ShaderNodeNewGeometry")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geo.outputs["Position"], sep.inputs["Vector"])
    side_x = _math(nodes, links, "ABSOLUTE", sep.outputs["X"])
    by_x = _ramp(nodes, links, side_x, edge_x + out_to, edge_x + 0.2, 0.0, 1.0, smooth=True)
    by_z = _ramp(nodes, links, sep.outputs["Z"], far, near, 0.0, 1.0, smooth=True)
    seen = _math(nodes, links, "MULTIPLY", by_x, by_z)
    lit = _math(nodes, links, "MULTIPLY", _ramp(nodes, links, side_x, edge_x + sink_to, edge_x - sink_from, 0.0,
                                                1.0, smooth=True), by_z)
    return seen, lit


def flesh(name, pallor=(0.40, 0.42, 0.42), tip_tint=(0.22, 0.24, 0.32), edge_x=5.0, out_to=0.66, near=-0.25,
          far=-0.85, sink_from=0.0, sink_to=0.42, sink=(0.022, 0.013, 0.045), sss=0.03):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    rest = _attr(nodes, "rest", vector=True)
    nail_f = _ramp(nodes, links, _attr(nodes, "nail"), 0.35, 0.65, 0.0, 1.0)
    skin_f = _math(nodes, links, "SUBTRACT", 1.0, nail_f)
    stretch, tendon = _attr(nodes, "stretch"), _attr(nodes, "tendon")

    geo = nodes.new("ShaderNodeNewGeometry")
    ridge = _ramp(nodes, links, geo.outputs["Pointiness"], 0.5, 0.56, 0.0, 1.0, smooth=True)
    hollow = _ramp(nodes, links, geo.outputs["Pointiness"], 0.5, 0.44, 0.0, 1.0, smooth=True)
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 0.2
    crevice = _math(nodes, links, "MAXIMUM", _math(nodes, links, "MULTIPLY", hollow, 0.3),
                    _math(nodes, links, "MULTIPLY", _math(nodes, links, "SUBTRACT", 1.0, ao.outputs["AO"]), 0.5))
    crevice = _math(nodes, links, "MINIMUM", crevice, 0.55)

    colour = _skin_colour(nodes, links, rest, pallor, tip_tint)
    # Dead skin goes yellow-grey in its folds rather than blue; ridges and stretched skin a little paler.
    colour = _mix(nodes, links, _math(nodes, links, "MULTIPLY", crevice, 0.8), colour, (0.20, 0.18, 0.13))
    pale = _math(nodes, links, "ADD", _math(nodes, links, "MULTIPLY", ridge, 0.05),
                 _math(nodes, links, "MULTIPLY", _math(nodes, links, "MAXIMUM", stretch, tendon), 0.1))
    colour = _mix(nodes, links, 1.0, colour, _grey(nodes, links, _math(nodes, links, "ADD", 1.0, pale)), "MULTIPLY")
    waxy = _math(nodes, links, "MULTIPLY", _math(nodes, links, "MAXIMUM", stretch, ridge), 0.22)
    colour = _mix(nodes, links, waxy, colour, (0.50, 0.47, 0.38))
    folds = _math(nodes, links, "MULTIPLY", _ramp(nodes, links, _attr(nodes, "crease"), -0.1, -0.6, 0.0, 1.0), 0.5)
    colour = _mix(nodes, links, folds, colour, (0.20, 0.17, 0.24))
    colour = _mix(nodes, links, 1.0, colour,
                  _grey(nodes, links, _math(nodes, links, "SUBTRACT", 1.0,
                                            _math(nodes, links, "MULTIPLY", crevice, 0.6))), "MULTIPLY")
    colour = _mix(nodes, links, nail_f, colour, _nail_colour(nodes, links, rest))

    normal, pores = _relief(nodes, links, rest, skin_f, nail_f)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(colour, bsdf.inputs["Base Color"])
    links.new(normal, bsdf.inputs["Normal"])
    # Roughness: 0.5 on skin, down to about 0.36 where it is stretched over bone, broken up by the pores (oily
    # skin shines in specks, not in one smooth sheet like latex); the nails smoother.
    tight = _math(nodes, links, "MAXIMUM", _math(nodes, links, "MAXIMUM", stretch, tendon), ridge)
    rough = _math(nodes, links, "SUBTRACT", 0.44, _math(nodes, links, "MULTIPLY", tight, 0.14))
    rough = _math(nodes, links, "ADD", rough, _math(nodes, links, "MULTIPLY", hollow, 0.1))
    speck = _ramp(nodes, links, _noise(nodes, links, rest, 140.0, detail=2), 0.35, 0.65, -0.07, 0.07)
    rough = _math(nodes, links, "ADD", rough, _math(nodes, links, "ADD", speck,
                                                    _math(nodes, links, "MULTIPLY", pores, 0.12)))
    rough = _mix(nodes, links, nail_f, _grey(nodes, links, rough), (0.2, 0.2, 0.2))
    links.new(rough, bsdf.inputs["Roughness"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.5
    links.new(_math(nodes, links, "MULTIPLY", nail_f, 0.7), bsdf.inputs["Coat Weight"])
    bsdf.inputs["Coat Roughness"].default_value = 0.12
    bsdf.inputs["Subsurface Radius"].default_value = (0.8, 0.66, 0.62)
    bsdf.inputs["Subsurface Scale"].default_value = sss
    links.new(_math(nodes, links, "MULTIPLY", skin_f, 0.65), bsdf.inputs["Subsurface Weight"])

    seen, lit = _fade(nodes, links, edge_x, out_to, near, far, sink_from, sink_to)
    dark = _n(nodes, "ShaderNodeEmission", Color=(*sink, 1.0), Strength=1.0)
    sunk = nodes.new("ShaderNodeMixShader")
    links.new(lit, sunk.inputs["Fac"])
    links.new(dark.outputs["Emission"], sunk.inputs[1])
    links.new(bsdf.outputs["BSDF"], sunk.inputs[2])
    clear = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    links.new(seen, mix.inputs["Fac"])
    links.new(clear.outputs["BSDF"], mix.inputs[1])
    links.new(sunk.outputs["Shader"], mix.inputs[2])
    links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return mat
