"""What the things on the bulkhead are made of: the rail's paint (the bulkhead's own, a shade darker), the bracket's
black-painted steel, grey cloth gaffer tape on a kraft core, ink, the clip's worn zinc, and the imported models'
materials calmed to the hold. Also the light's falloff over a thing, which the wall's own picture has, as factors
to multiply a colour by.
"""
from paint import _math, _mix, _range, material, painted, plain

WALL = (0.14, 0.18, 0.13)  # the bulkhead's paint (wall.py's grey-green)


def wall_paint(name, shade):
    """The bulkhead's paint at `shade`: where a thing's picture shows the wall itself (through the tape's core)."""
    return painted(name, tuple(c * shade for c in WALL), span=0.45, chip=2.2, edge=0.0015, gloss=0.25,
                   offset=(0.3, 0.2))


def rail_paint(name="railpaint", shade=0.27):
    """The tool rail and the pegs welded to it, painted over together a shade darker than the sheet, worn to
    steel along the edges where things are hung on and taken off."""
    return painted(name, tuple(c * shade for c in WALL), span=0.45, chip=2.6, edge=0.0016, gloss=0.25,
                   offset=(0.3, 0.2), grime=0.75)


def black_steel(name="bracket"):
    return painted(name, (0.022, 0.022, 0.021), span=0.4, chip=0.7, edge=0.0004, gloss=0.5, rust=0.4,
                   offset=(0.6, 0.1))


def steel(name="steel", c=0.42, rough=0.38):
    return plain(name, (c, c * 0.99, c * 0.96), rough=rough, metallic=1.0)


def ink(name="ink", colour=(0.025, 0.025, 0.03), rough=0.7):
    return plain(name, colour, rough=rough)


def lamp_falloff(nodes, links, top_left=(-0.10, 0.60), per_m=(0.6, 0.25), lo=0.8):
    """The work lamp's light falling off from the upper left to the lower right over a thing (world metres, screen
    up = +y), as on the wall's own picture: a factor to multiply a colour by."""
    geo = nodes.new("ShaderNodeNewGeometry")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geo.outputs["Position"], sep.inputs[0])
    dx = _math(nodes, links, "MULTIPLY", _math(nodes, links, "SUBTRACT", sep.outputs["X"], top_left[0]), per_m[0])
    dy = _math(nodes, links, "MULTIPLY", _math(nodes, links, "SUBTRACT", top_left[1], sep.outputs["Y"]), per_m[1])
    f = _math(nodes, links, "SUBTRACT", 1.04, _math(nodes, links, "ADD", dx, dy))
    return _math(nodes, links, "MAXIMUM", f, lo)


def turned_away(nodes, links, dark=0.55, power=2.0):
    """Darker where a round surface turns away from the viewer (the room's soft light grazing it): a factor."""
    lw = nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.5
    f = _math(nodes, links, "POWER", lw.outputs["Facing"], power)
    return _range(nodes, links, f, 0.0, 1.0, 1.0, dark)


def times(nodes, links, colour, *factors):
    """A colour socket multiplied by factor sockets."""
    for f in factors:
        colour = _mix(nodes, links, 1.0, colour, f, "MULTIPLY")
    return colour


def tame(mat, sat=0.8, val=0.92, rough_min=0.3, drop_normal=False):
    """An imported (glTF) material calmed to the hold: its colour less saturated and a little darker, its metal
    never a mirror. Returns the hue/saturation node when there is one, for a change of hue."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    base = bsdf.inputs["Base Color"]
    hsv = None
    if base.links:
        src = base.links[0].from_socket
        hsv = nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Saturation"].default_value = sat
        hsv.inputs["Value"].default_value = val
        links.new(src, hsv.inputs["Color"])
        links.new(hsv.outputs["Color"], base)
    if drop_normal:  # the model's embossed maker's mark goes with it
        for link in list(bsdf.inputs["Normal"].links):
            links.remove(link)
    rough = bsdf.inputs["Roughness"]
    if rough.links:
        src = rough.links[0].from_socket
        links.new(_math(nodes, links, "MAXIMUM", src, rough_min), rough)
    else:
        rough.default_value = max(rough.default_value, rough_min)
    return hsv


def _noise_4d(nodes, links, vector, scale, detail, w, stretch=None):
    n = nodes.new("ShaderNodeTexNoise")
    n.noise_dimensions = "4D"
    n.inputs["W"].default_value = w
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    if stretch:
        mp = nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = stretch
        links.new(vector, mp.inputs["Vector"])
        vector = mp.outputs["Vector"]
    links.new(vector, n.inputs["Vector"])
    return n.outputs["Fac"]


def _weave(nodes, links, vector, scale, distortion):
    """A cross weave: waves along x and along y, added."""
    total = None
    for axis in ("X", "Y"):
        wave = nodes.new("ShaderNodeTexWave")
        wave.bands_direction = axis
        wave.inputs["Scale"].default_value = scale
        wave.inputs["Distortion"].default_value = distortion
        links.new(vector, wave.inputs["Vector"])
        total = wave.outputs["Fac"] if total is None else _math(nodes, links, "ADD", total, wave.outputs["Fac"])
    return total


def gaffer_cloth(core_r, cloth=0.05):
    """Grey cloth gaffer tape, matte, close to the bulkhead's value (a silver roll would outshine the readouts):
    its wound layers fine rings on the side faces, the weave a relief, lint and dust caught on the outer wrap and
    the faces; the kraft core inside `core_r` (metres from the roll's axis, the object's z axis), scuffed and
    grubby at its lip."""
    mat, nodes, links = material("gaffer-cloth")
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    tc = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(tc.outputs["Object"], sep.inputs[0])
    r = _math(nodes, links, "SQRT", _math(nodes, links, "ADD",
                                          _math(nodes, links, "MULTIPLY", sep.outputs["X"], sep.outputs["X"]),
                                          _math(nodes, links, "MULTIPLY", sep.outputs["Y"], sep.outputs["Y"])))
    core = _range(nodes, links, r, core_r + 0.0003, core_r - 0.0003)
    obj = tc.outputs["Object"]

    rings = nodes.new("ShaderNodeTexWave")
    rings.wave_type = "RINGS"
    rings.inputs["Scale"].default_value = 300.0
    rings.inputs["Distortion"].default_value = 1.5
    rings.inputs["Detail"].default_value = 3.0
    links.new(obj, rings.inputs["Vector"])
    layer = _range(nodes, links, rings.outputs["Fac"], 0.0, 1.0, 0.86, 1.08)
    mott = _range(nodes, links, _noise_4d(nodes, links, obj, 60.0, 6.0, 1.0), 0.3, 0.7, 0.8, 1.12)
    col = _mix(nodes, links, 1.0, (cloth, cloth, cloth * 0.97, 1), layer, "MULTIPLY")
    col = _mix(nodes, links, 1.0, col, mott, "MULTIPLY")
    lint = _range(nodes, links, _noise_4d(nodes, links, obj, 900.0, 2.0, 3.0), 0.68, 0.74)
    lint = _math(nodes, links, "MULTIPLY", lint,
                 _range(nodes, links, _noise_4d(nodes, links, obj, 30.0, 3.0, 4.0), 0.4, 0.7))
    col = _mix(nodes, links, _math(nodes, links, "MULTIPLY", lint, 0.8), col, (0.16, 0.155, 0.145, 1))
    dust = _range(nodes, links, _noise_4d(nodes, links, obj, 120.0, 8.0, 5.0), 0.45, 0.75, 0.0, 0.35)
    col = _mix(nodes, links, dust, col, (0.11, 0.105, 0.095, 1))
    kraft = _mix(nodes, links, _range(nodes, links, _noise_4d(nodes, links, obj, 220.0, 8.0, 6.0), 0.35, 0.7),
                 (0.12, 0.085, 0.048, 1), (0.075, 0.054, 0.032, 1))
    scuff = _range(nodes, links, _noise_4d(nodes, links, obj, 260.0, 6.0, 7.0, stretch=(1, 1, 4)), 0.6, 0.72)
    kraft = _mix(nodes, links, scuff, kraft, (0.05, 0.04, 0.03, 1))
    col = _mix(nodes, links, core, col, kraft)
    links.new(col, bsdf.inputs["Base Color"])
    links.new(_mix(nodes, links, core, 0.62, 0.92), bsdf.inputs["Roughness"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.4
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.0002  # a larger distance scattered the normals: the cloth read silver
    total = _weave(nodes, links, obj, 650.0, 1.2)
    links.new(_math(nodes, links, "ADD", total, _math(nodes, links, "MULTIPLY", lint, 1.5)), bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _clip_mask(nodes, links, base, sep, z_min, y_min, metal_from):
    """What of the clipboard is the clip: what is metal in the texture's map, anything standing off the board's
    face past `z_min`, and the pressure plate lying low on the board (above `y_min` and not brown)."""
    mask = _range(nodes, links, sep.outputs["Z"], z_min, z_min + 0.0006)
    hsv_in = nodes.new("ShaderNodeSeparateColor")
    hsv_in.mode = "HSV"
    links.new(base, hsv_in.inputs[0])
    grey = _range(nodes, links, hsv_in.outputs[1], 0.3, 0.15)
    plate = _math(nodes, links, "MULTIPLY", _range(nodes, links, sep.outputs["Y"], y_min, y_min + 0.001), grey)
    mask = _math(nodes, links, "MAXIMUM", mask, plate)
    if metal_from is not None:
        mask = _math(nodes, links, "MAXIMUM", mask, _range(nodes, links, metal_from, 0.2, 0.8))
    return mask


def _plate_shade(nodes, links, geo, sep, lip):
    """The pressure plate's flare bending down to a rolled lip at world y `lip` (its edge): darker into the bend,
    a sheen on the lip and its underside dark, grime packed into the bend where the stem meets the flare, and
    lighter to the left (the lamp is upper left). Returns the shade factor and the lip's sheen."""
    y = sep.outputs["Y"]
    flare = _range(nodes, links, y, lip + 0.003, lip + 0.016, 0.62, 1.0)
    lip_sheen = _range(nodes, links, _math(nodes, links, "ABSOLUTE", _math(nodes, links, "SUBTRACT", y,
                                                                            lip + 0.0028)), 0.0, 0.002, 1.0, 0.0)
    under = _range(nodes, links, y, lip, lip + 0.0014, 0.4, 1.0)
    gn = nodes.new("ShaderNodeTexNoise")
    gn.inputs["Scale"].default_value = 500.0
    gn.inputs["Detail"].default_value = 6.0
    links.new(geo.outputs["Position"], gn.inputs["Vector"])
    bend = _range(nodes, links, _math(nodes, links, "ABSOLUTE", _math(nodes, links, "SUBTRACT", y, lip + 0.0165)),
                  0.0, 0.0025, 1.0, 0.0)
    bend = _math(nodes, links, "MULTIPLY", bend, _range(nodes, links, gn.outputs["Fac"], 0.35, 0.6, 0.3, 1.0))
    dirt = _math(nodes, links, "SUBTRACT", 1.0, _math(nodes, links, "MULTIPLY", bend, 0.45))
    side = _range(nodes, links, sep.outputs["X"], -0.03, 0.03, 1.1, 0.85)
    shade = _math(nodes, links, "MULTIPLY", _math(nodes, links, "MULTIPLY", flare, under),
                  _math(nodes, links, "ADD", 1.0, _math(nodes, links, "MULTIPLY", lip_sheen, 1.5)))
    return _math(nodes, links, "MULTIPLY", shade, _math(nodes, links, "MULTIPLY", dirt, side)), lip_sheen


def clip_steel(mat, z_min, y_min, lip, dark=0.3, rough_min=0.42, tint=(0.27, 0.30, 0.36)):
    """The clipboard's clip in its own steel: dark blued steel, never the texture's near-white chrome, never
    mauve or rust beside the green wall (a cool slate). Its light and dark come from the texture's own; grime in
    the corners and along the folds; the sheen broken up by handling."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    base = bsdf.inputs["Base Color"].links[0].from_socket
    geo = nodes.new("ShaderNodeNewGeometry")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geo.outputs["Position"], sep.inputs[0])
    metal = bsdf.inputs["Metallic"]
    metal_from = metal.links[0].from_socket if metal.links else None
    mask = _clip_mask(nodes, links, base, sep, z_min, y_min, metal_from)
    bw = nodes.new("ShaderNodeRGBToBW")
    links.new(base, bw.inputs["Color"])
    shade = _range(nodes, links, bw.outputs[0], 0.2, 0.9, 0.55, 1.05)
    col = _mix(nodes, links, 1.0, (tint[0] * dark, tint[1] * dark, tint[2] * dark, 1), shade, "MULTIPLY")
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 16
    ao.inputs["Distance"].default_value = 0.007
    col = _mix(nodes, links, 1.0, col, _range(nodes, links, ao.outputs["AO"], 0.3, 1.0, 0.35, 1.0), "MULTIPLY")
    n = nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = 260.0
    n.inputs["Detail"].default_value = 8.0
    links.new(geo.outputs["Position"], n.inputs["Vector"])
    col = _mix(nodes, links, 1.0, col, _range(nodes, links, n.outputs["Fac"], 0.4, 0.7, 0.8, 1.05), "MULTIPLY")
    plate_shade, lip_sheen = _plate_shade(nodes, links, geo, sep, lip)
    col = _mix(nodes, links, 1.0, col, plate_shade, "MULTIPLY")
    links.new(_mix(nodes, links, mask, base, col), bsdf.inputs["Base Color"])
    if metal_from is not None:
        links.new(_mix(nodes, links, mask, metal_from, 0.55), metal)
    else:
        metal.default_value = 0.55
    rough = bsdf.inputs["Roughness"]
    worn_r = _mix(nodes, links, lip_sheen, _range(nodes, links, n.outputs["Fac"], 0.3, 0.7, rough_min,
                                                  rough_min + 0.2), 0.28)
    if rough.links:
        links.new(_mix(nodes, links, mask, rough.links[0].from_socket, worn_r), rough)
    else:
        links.new(worn_r, rough)
