"""Steel that has been oiled and carried for years: the one metal of the plates theme. A photographed sheet (CC0,
Poly Haven rusty_metal_sheet) gives its patches, pitting and rust; the rest is said by each thing that is made of
it: how light, how dull, how rusty, where it is rubbed, hammered, cut, or left black."""
from materials import _math, _mix, material
from wiring import blend, image, mapped, noise, ramp, value

STEEL = "rusty_metal_sheet"
# Bare steel where a scratch or a cut has gone through the dark.
BARE = (0.5, 0.52, 0.55, 1)
# Scratches of use, a few to each way: the way they run, how many, how long, how rare.
SCRATCHES = ((0.5, 2.6, 24.0, 0.66), (1.15, 2.1, 30.0, 0.67), (2.2, 3.1, 20.0, 0.68), (2.75, 1.7, 34.0, 0.67), (1.7, 2.4, 26.0, 0.69))


def _bare_metal(nodes, links, grey, tone, tint, own_tone):
    """The metal's colour: the photograph's light and dark about `tone`, a little blue as oiled steel is."""
    light = ramp(nodes, links, grey, 0.15, 0.6, tone * 0.7, tone * 1.3)
    if own_tone is not None:
        light = _math(nodes, links, "MULTIPLY", light, ramp(nodes, links, own_tone, 0.0, 1.0, 0.55, 1.45))
    comb = nodes.new("ShaderNodeCombineColor")
    for k, channel in enumerate(("Red", "Green", "Blue")):
        links.new(_math(nodes, links, "MULTIPLY", light, tint[k]), comb.inputs[channel])
    return comb.outputs["Color"]


def _toward_corners(nodes, links, place, box):
    """0 in the middle of a side of `box`, 1 at a corner: the product of how far along each way."""
    x0, y0, x1, y1 = box
    split = nodes.new("ShaderNodeSeparateXYZ")
    links.new(place, split.inputs["Vector"])
    ax = _math(nodes, links, "ABSOLUTE", _math(nodes, links, "SUBTRACT", split.outputs["X"], (x0 + x1) / 2), 0.0)
    ay = _math(nodes, links, "ABSOLUTE", _math(nodes, links, "SUBTRACT", split.outputs["Y"], (y0 + y1) / 2), 0.0)
    fx = ramp(nodes, links, ax, (x1 - x0) * 0.2, (x1 - x0) / 2, 0.0, 1.0)
    fy = ramp(nodes, links, ay, (y1 - y0) * 0.05, (y1 - y0) / 2, 0.0, 1.0)
    return _math(nodes, links, "MULTIPLY", fx, fy)


def _rust(nodes, links, diff, where, amount, periodic):
    """Where the steel has rusted, 0 to 1: where the photograph is rusty (its red well above its blue), behind a
    patchy threshold that more rust asked for lowers. A ground that repeats takes nothing from a noise that does
    not: the photograph alone."""
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(diff, sep.inputs["Color"])
    redness = _math(nodes, links, "SUBTRACT", sep.outputs["Red"], sep.outputs["Blue"])
    patches = 0.45 if periodic else _math(nodes, links, "MULTIPLY", noise(nodes, links, where, 0.9, 5.0), 0.9)
    level = _math(nodes, links, "ADD", _math(nodes, links, "MULTIPLY", redness, 2.2), patches)
    edge = _math(nodes, links, "SUBTRACT", 1.25, _math(nodes, links, "MULTIPLY", amount, 1.1))
    return ramp(nodes, links, _math(nodes, links, "SUBTRACT", level, edge), 0.0, 0.22)


def _rust_colour(nodes, links, diff):
    """The photograph's own rust, deeper and darker."""
    hsv = nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Saturation"].default_value = 1.25
    hsv.inputs["Value"].default_value = 0.55
    links.new(diff, hsv.inputs["Color"])
    return _mix(nodes, links, "MULTIPLY", hsv.outputs["Color"], (1.0, 0.62, 0.42, 1), 1.0)


def _scratched(nodes, links, where, amount):
    """Thin lines every way, 0 to `amount`: a little brighter and smoother than the steel round them."""
    both = None
    for turn, scale, long, edge in SCRATCHES:
        along = mapped(nodes, links, where, location=(turn * 3.1, turn * 1.7, 0), scale=(long, 0.45, 1.0), turn=turn)
        line = ramp(nodes, links, noise(nodes, links, along.outputs["Vector"], scale, 6.0, 0.7), edge, edge + 0.05)
        both = line if both is None else _math(nodes, links, "MAXIMUM", both, line)
    return _math(nodes, links, "MULTIPLY", both, amount)


def _rubbed(nodes, links, where, rusty, wear, patchy):
    """Where the shape stands proud and hands have rubbed it (the mesh says where, in its "worn" attribute),
    unevenly, and never where it has rusted."""
    proud = nodes.new("ShaderNodeAttribute")
    proud.attribute_name = "worn"
    uneven = ramp(nodes, links, noise(nodes, links, where, 2.6, 4.0), 0.3, 0.7, 1.0 - patchy, 1.0)
    worn = _math(nodes, links, "MULTIPLY", _math(nodes, links, "MULTIPLY", proud.outputs["Fac"], uneven), wear)
    return _math(nodes, links, "MULTIPLY", worn, _math(nodes, links, "SUBTRACT", 1.0, rusty))


def _cuts(nodes, links, place, marks, rusty):
    """Cuts drawn into a picture (`marks`: the image, and the box it covers in object units): red is how deep,
    green how bare the steel is there. Returns how bare, and the surface's height."""
    picture, (x0, y0, x1, y1) = marks
    over = mapped(nodes, links, place, location=(-x0 / (x1 - x0), -y0 / (y1 - y0), 0), scale=(1 / (x1 - x0), 1 / (y1 - y0), 1))
    drawn = nodes.new("ShaderNodeTexImage")
    drawn.image = picture
    drawn.extension = "CLIP"
    links.new(over.outputs["Vector"], drawn.inputs["Vector"])
    parts = nodes.new("ShaderNodeSeparateColor")
    links.new(drawn.outputs["Color"], parts.inputs["Color"])
    bare = _math(nodes, links, "MULTIPLY", parts.outputs["Green"], _math(nodes, links, "SUBTRACT", 1.0, rusty))
    return bare, _math(nodes, links, "SUBTRACT", 1.0, parts.outputs["Red"])


def _bumped(nodes, links, height, normal, strength, distance):
    """`normal` with a relief of `height` laid over it."""
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = distance
    links.new(height, bump.inputs["Height"])
    links.new(normal, bump.inputs["Normal"])
    return bump.outputs["Normal"]


def _relief(nodes, links, vector, where, relief, hammered, cut_height):
    """The surface's relief: the photograph's pitting, the hammer's marks (shallow facets a finger wide, each a
    little differently turned to the light), and the grooves of cuts."""
    photographed = nodes.new("ShaderNodeNormalMap")
    photographed.inputs["Strength"].default_value = relief
    links.new(image(nodes, links, vector, STEEL, "nor", False), photographed.inputs["Color"])
    normal = photographed.outputs["Normal"]
    if hammered:
        facets = nodes.new("ShaderNodeTexVoronoi")
        facets.feature = "SMOOTH_F1"
        facets.inputs["Scale"].default_value = 5.5
        facets.inputs["Smoothness"].default_value = 0.6
        facets.inputs["Randomness"].default_value = 1.0
        links.new(where, facets.inputs["Vector"])
        normal = _bumped(nodes, links, facets.outputs["Distance"], normal, hammered, 0.05)
    if cut_height is not None:
        normal = _bumped(nodes, links, cut_height, normal, 1.0, 0.035)
    return normal


def _rust_amount(nodes, links, place, info, rust, rust_edges, per_object):
    """How much rust is asked for at a point: the thing's own, its own share as one of many, and more in corners."""
    amount = value(nodes, rust)
    if per_object:
        own = nodes.new("ShaderNodeSeparateColor")
        links.new(info.outputs["Color"], own.inputs["Color"])
        amount = _math(nodes, links, "ADD", amount, own.outputs["Blue"])
    if rust_edges:
        corner = _toward_corners(nodes, links, place, rust_edges)
        amount = _math(nodes, links, "ADD", amount, _math(nodes, links, "MULTIPLY", corner, 0.75))
    return amount


def _finish(nodes, links, base, roughness, rusty, normal):
    """The surface itself. Rust is no metal: it is dull and takes no reflection."""
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(base, bsdf.inputs["Base Color"])
    links.new(_math(nodes, links, "SUBTRACT", 1.0, rusty), bsdf.inputs["Metallic"])
    dull = nodes.new("ShaderNodeMix")
    dull.data_type = "FLOAT"
    links.new(rusty, dull.inputs["Factor"])
    links.new(roughness, dull.inputs["A"])
    dull.inputs["B"].default_value = 0.9
    links.new(dull.outputs["Result"], bsdf.inputs["Roughness"])
    links.new(normal, bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])


def steel(name, span=6.0, tone=0.2, rough=0.42, rust=0.0, rust_edges=None, per_object=False, wear=0.0, relief=1.0, scratches=0.0, tint=(0.92, 0.96, 1.0), hammered=0.0, wear_tone=0.5, wear_smooth=0.2, wear_patchy=0.7, periodic=False, shift=(0.0, 0.0), black_tone=0.4, marks=None):
    """`tone` is how light the bare metal is, `rough` how dull, `rust` how much of the photograph's rust is kept
    (0 to 1), `wear` how much what stands proud is rubbed bright. `rust_edges` (x0, y0, x1, y1 in object units)
    gathers the rust toward the corners of that box. `per_object` takes each thing's own share from its object's
    colour (red and green shift the photograph, blue is its rust, alpha its tone), so that many small things of
    one mesh differ. `shift` gives another thing of the same shape another part of the photograph and of every
    noise. `periodic` is for a ground that repeats. `marks` are cuts (see _cuts)."""
    mat, nodes, links = material(name)
    place = nodes.new("ShaderNodeTexCoord").outputs["Object"]
    info = nodes.new("ShaderNodeObjectInfo")
    where = mapped(nodes, links, place, location=(shift[0], shift[1], 0)).outputs["Vector"]
    photo = mapped(nodes, links, where, scale=(1 / span, 1 / span, 1 / span))
    if per_object:
        links.new(info.outputs["Color"], photo.inputs["Location"])
    vector = photo.outputs["Vector"]
    diff = image(nodes, links, vector, STEEL, "diff", True)
    grey = nodes.new("ShaderNodeRGBToBW")
    links.new(diff, grey.inputs["Color"])
    metal = _bare_metal(nodes, links, grey.outputs["Val"], tone, tint, info.outputs["Alpha"] if per_object else None)
    amount = _rust_amount(nodes, links, place, info, rust, rust_edges, per_object)
    rusty = _rust(nodes, links, diff, where, amount, periodic)
    base = blend(nodes, links, rusty, metal, _rust_colour(nodes, links, diff))
    roughness = _math(nodes, links, "MULTIPLY", image(nodes, links, vector, STEEL, "rough", False), rough / 0.5)
    roughness = _math(nodes, links, "MAXIMUM", roughness, rough * 0.55)
    cut_height = None
    # What is bare or rubbed is brighter and smoother: scratches, wear, cuts.
    brightened = []
    if scratches:
        brightened.append((_scratched(nodes, links, where, scratches), BARE, 0.15))
    if wear:
        brightened.append((_rubbed(nodes, links, where, rusty, wear, wear_patchy), (wear_tone, wear_tone * 1.02, wear_tone * 1.05, 1), wear_smooth))
    if marks:
        bare, cut_height = _cuts(nodes, links, place, marks, rusty)
        brightened.append((bare, BARE, 0.12))
    for share, colour, smoother in brightened:
        base = blend(nodes, links, share, base, colour)
        roughness = _math(nodes, links, "SUBTRACT", roughness, _math(nodes, links, "MULTIPLY", share, smoother))
    # Left black from the forge where the mesh says so (its "black" attribute): darker and duller, in every state.
    forge = nodes.new("ShaderNodeAttribute")
    forge.attribute_name = "black"
    base = _mix(nodes, links, "MULTIPLY", base, (black_tone, black_tone, black_tone, 1), forge.outputs["Fac"])
    roughness = _math(nodes, links, "ADD", roughness, _math(nodes, links, "MULTIPLY", forge.outputs["Fac"], 0.14))
    _finish(nodes, links, base, roughness, rusty, _relief(nodes, links, vector, where, relief, hammered, cut_height))
    return mat
