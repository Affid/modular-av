"""What the plates theme's things are made of besides steel (steel.py): cloth to be dyed, and leather."""
from materials import _math, _mix, material, photographed
from wiring import image, ramp


def cloth(name, span=3.0, colour=(1, 1, 1, 1), turn=0.0, source="rough_linen", lift=(0.0, 1.0)):
    """Woven cloth (CC0, Poly Haven rough_linen), without its own colour: `colour` instead, and its weave as light
    and shade. White, the stylesheet dyes it."""
    mat, nodes, links = material(name)
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Specular IOR Level"].default_value = 0.1
    bsdf.inputs["Sheen Weight"].default_value = 0.3
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / span, 1 / span, 1 / span)
    mapping.inputs["Rotation"].default_value = (0, 0, turn)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    vector = mapping.outputs["Vector"]
    grey = nodes.new("ShaderNodeRGBToBW")
    links.new(image(nodes, links, vector, source, "diff", True), grey.inputs["Color"])
    shade = ramp(nodes, links, grey.outputs["Val"], 0.1, 0.5, lift[0] + 0.55 * (lift[1] - lift[0]), lift[1])
    links.new(_mix(nodes, links, "MULTIPLY", shade, colour, 1.0), bsdf.inputs["Base Color"])
    links.new(_math(nodes, links, "MAXIMUM", image(nodes, links, vector, source, "rough", False), 0.7), bsdf.inputs["Roughness"])
    normal = nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = 1.5
    links.new(image(nodes, links, vector, source, "nor", False), normal.inputs["Color"])
    links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def leather(name, tint=(0.27, 0.19, 0.13, 1)):
    """Straps, thongs and grips: photographed leather (CC0, Poly Haven fabric_leather_01), darkened."""
    return photographed(name, "fabric_leather_01", 1.6, tint=tint, specular=0.25)
