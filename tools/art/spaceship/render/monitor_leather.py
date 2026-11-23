"""What the hung headset is covered in: the band's leatherette over foam, the cups' cushions of worn leatherette,
and their shells of matte black moulded plastic."""
from paint import _math, _range, material


def _mix_rgba(nodes, links, fac, a, b):
    """Colour `a` (a socket) mixed toward the constant `b` by `fac`."""
    m = nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    links.new(fac, m.inputs["Factor"])
    if isinstance(a, tuple):
        m.inputs["A"].default_value = a
    else:
        links.new(a, m.inputs["A"])
    m.inputs["B"].default_value = b
    return m.outputs["Result"]


def _stitches(nodes, links):
    """The band's stitch lines on its side faces, a little in from its outer and inner edges (seam), dashed
    (stitch), and where hands grab it (the attribute 'grab')."""
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = "seam"
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(uv.outputs["UV"], sep.inputs[0])
    uv2 = nodes.new("ShaderNodeUVMap")
    uv2.uv_map = "side"
    sep2 = nodes.new("ShaderNodeSeparateXYZ")
    links.new(uv2.outputs["UV"], sep2.inputs[0])
    along, rad, side = sep.outputs["X"], sep.outputs["Y"], sep2.outputs["X"]
    grab = nodes.new("ShaderNodeAttribute")
    grab.attribute_name = "grab"
    g = grab.outputs["Fac"]
    # stitch lines on the band's side faces, a little in from its outer and inner edges
    off = _math(nodes, links, "ABSOLUTE", _math(nodes, links, "SUBTRACT", _math(nodes, links, "ABSOLUTE", rad), 0.6))
    line = _range(nodes, links, off, 0.07, 0.14, 1.0, 0.0)
    face = _range(nodes, links, _math(nodes, links, "ABSOLUTE", side), 0.8, 0.92, 0.0, 1.0)
    dash = _range(nodes, links, _math(nodes, links, "FRACT", _math(nodes, links, "DIVIDE", along, 8.0)),
                  0.55, 0.68, 1.0, 0.0)
    seam = _math(nodes, links, "MULTIPLY", line, face)
    stitch = _math(nodes, links, "MULTIPLY", seam, dash)
    return seam, stitch, g


def band_leather():
    """The headband's cover: black leatherette over foam, two rows of stitches along each side, worn to a shine
    and crazed where hands take it off and hang it up (the vertex attribute 'grab'). The stitches are spaced wide
    and in a thread barely lighter than the cover, so the band reads as smooth padding, not a braided hose."""
    mat, nodes, links = material("hs-band")
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    seam, stitch, g = _stitches(nodes, links)
    tc = nodes.new("ShaderNodeTexCoord")
    grain = nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 160.0
    grain.inputs["Detail"].default_value = 6.0
    links.new(tc.outputs["Object"], grain.inputs["Vector"])
    vor = nodes.new("ShaderNodeTexVoronoi")
    vor.feature = "DISTANCE_TO_EDGE"
    vor.inputs["Scale"].default_value = 140.0
    links.new(tc.outputs["Object"], vor.inputs["Vector"])
    crack = _math(nodes, links, "MULTIPLY", _range(nodes, links, vor.outputs["Distance"], 0.0, 0.05, 1.0, 0.0), g)
    base = _mix_rgba(nodes, links, _math(nodes, links, "MULTIPLY", g, 0.8), (0.02, 0.018, 0.016, 1),
                     (0.05, 0.042, 0.034, 1))
    cracked = _mix_rgba(nodes, links, _math(nodes, links, "MULTIPLY", crack, 0.7), base, (0.12, 0.1, 0.08, 1))
    links.new(_mix_rgba(nodes, links, stitch, cracked, (0.065, 0.06, 0.052, 1)), bsdf.inputs["Base Color"])
    rough = _range(nodes, links, g, 0.0, 1.0, 0.52, 0.24)
    rough = _math(nodes, links, "ADD", rough, _math(nodes, links, "MULTIPLY", crack, 0.4))
    links.new(rough, bsdf.inputs["Roughness"])
    bsdf.inputs["Sheen Weight"].default_value = 0.15
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.5
    h = _math(nodes, links, "SUBTRACT", _math(nodes, links, "MULTIPLY", grain.outputs["Fac"], 0.3),
              _math(nodes, links, "ADD", _math(nodes, links, "MULTIPLY", seam, 0.18),
                    _math(nodes, links, "MULTIPLY", crack, 0.3)))
    h = _math(nodes, links, "ADD", h, _math(nodes, links, "MULTIPLY", stitch, 0.1))
    links.new(h, bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def shell_matte():
    """The cups' shells: black moulded plastic, matte, scuffed grey on what stands out."""
    mat, nodes, links = material("hs-shell")
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    tc = nodes.new("ShaderNodeTexCoord")
    sc = nodes.new("ShaderNodeTexNoise")
    sc.inputs["Scale"].default_value = 22.0
    sc.inputs["Detail"].default_value = 10.0
    sc.inputs["Roughness"].default_value = 0.7
    links.new(tc.outputs["Object"], sc.inputs["Vector"])
    bev = nodes.new("ShaderNodeBevel")
    bev.inputs["Radius"].default_value = 0.04
    geo = nodes.new("ShaderNodeNewGeometry")
    dot = nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    links.new(bev.outputs["Normal"], dot.inputs[0])
    links.new(geo.outputs["Normal"], dot.inputs[1])
    edge = _range(nodes, links, _math(nodes, links, "SUBTRACT", 1.0, dot.outputs["Value"]), 0.01, 0.1)
    scuff = _math(nodes, links, "MULTIPLY", edge, _range(nodes, links, sc.outputs["Fac"], 0.45, 0.6))
    links.new(_mix_rgba(nodes, links, scuff, (0.018, 0.018, 0.017, 1), (0.09, 0.088, 0.083, 1)),
              bsdf.inputs["Base Color"])
    links.new(_range(nodes, links, sc.outputs["Fac"], 0.3, 0.7, 0.5, 0.68), bsdf.inputs["Roughness"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    links.new(sc.outputs["Fac"], bump.inputs["Height"])
    links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def leatherette():
    """Worn leatherette over the cushions: near-black brown, a soft sheen where it bulges, crazed into fine
    cracks, flaked off in patches to the grey-brown cloth it was laid on."""
    mat, nodes, links = material("hs-leatherette")
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    tc = nodes.new("ShaderNodeTexCoord")
    vor = nodes.new("ShaderNodeTexVoronoi")
    vor.feature = "DISTANCE_TO_EDGE"
    vor.inputs["Scale"].default_value = 260.0
    links.new(tc.outputs["Object"], vor.inputs["Vector"])
    crack = _range(nodes, links, vor.outputs["Distance"], 0.0, 0.06, 1.0, 0.0)
    flake = nodes.new("ShaderNodeTexNoise")
    flake.inputs["Scale"].default_value = 30.0
    flake.inputs["Detail"].default_value = 8.0
    flake.inputs["Roughness"].default_value = 0.65
    links.new(tc.outputs["Object"], flake.inputs["Vector"])
    bare = _math(nodes, links, "MAXIMUM", _range(nodes, links, flake.outputs["Fac"], 0.64, 0.67),
                 _math(nodes, links, "MULTIPLY", crack, 0.35))
    links.new(_mix_rgba(nodes, links, bare, (0.022, 0.016, 0.012, 1), (0.16, 0.135, 0.1, 1)),
              bsdf.inputs["Base Color"])
    links.new(_range(nodes, links, bare, 0.0, 1.0, 0.38, 0.95), bsdf.inputs["Roughness"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.4
    wr = nodes.new("ShaderNodeTexNoise")
    wr.inputs["Scale"].default_value = 90.0
    links.new(tc.outputs["Object"], wr.inputs["Vector"])
    links.new(_math(nodes, links, "SUBTRACT", wr.outputs["Fac"], bare), bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat
