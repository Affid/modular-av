"""What the hides theme's things are made of: hide, thong, weathered wood, and the hair of a pelt."""
import bpy

from materials import _aged, _browned_edges, _math, _mix, material
from measures import texture


def _image(nodes, links, vector, source, kind, colour):
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(texture(f"{source}_{kind}.jpg"))
    if not colour:
        node.image.colorspace_settings.name = "Non-Color"
    links.new(vector, node.inputs["Vector"])
    return node.outputs["Color"]


def hide(name, box, span=12.0, shift=(0.0, 0.0), turn=1.5708, tone=(1.0, 1.0, 1.0, 1), hue=0.53, sat=0.62, value=1.3, edge=0.45, fold=False, plain=False, paint=False):
    """A dressed hide, flesh side out: photographed leather (CC0, Poly Haven fabric_leather_02) made paler and
    matt, with slow darker patches, and darker and drier toward its edge."""
    mat, nodes, links = material(name)
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Specular IOR Level"].default_value = 0.12
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / span, 1 / span, 1 / span)
    mapping.inputs["Location"].default_value = (shift[0], shift[1], 0)
    mapping.inputs["Rotation"].default_value = (0, 0, turn)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    vector = mapping.outputs["Vector"]
    if fold:
        # The photograph has a seam down it: only the half clear of it is used, back and forth, and so it repeats.
        split = nodes.new("ShaderNodeSeparateXYZ")
        links.new(vector, split.inputs["Vector"])
        back = _math(nodes, links, "PINGPONG", split.outputs["X"], 0.5)
        join = nodes.new("ShaderNodeCombineXYZ")
        links.new(_math(nodes, links, "ADD", back, 0.46), join.inputs["X"])
        links.new(split.outputs["Y"], join.inputs["Y"])
        vector = join.outputs["Vector"]
    diff = _image(nodes, links, vector, "fabric_leather_02", "diff", True)
    hsv = nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Hue"].default_value = hue
    hsv.inputs["Saturation"].default_value = sat
    hsv.inputs["Value"].default_value = value
    links.new(diff, hsv.inputs["Color"])
    toned = _mix(nodes, links, "MULTIPLY", hsv.outputs["Color"], tone, 1.0)
    colour = toned if plain else _browned_edges(nodes, links, coords, _aged(nodes, links, coords, toned), box, edge)
    if paint:
        # White paint that has sunk into the hide: its grain shows through as light and shade, and the
        # stylesheet gives it the player's colour.
        grey = nodes.new("ShaderNodeRGBToBW")
        links.new(diff, grey.inputs["Color"])
        lift = nodes.new("ShaderNodeMapRange")
        lift.inputs["From Min"].default_value, lift.inputs["From Max"].default_value = 0.08, 0.5
        lift.inputs["To Min"].default_value, lift.inputs["To Max"].default_value = 0.5, 0.95
        links.new(grey.outputs["Val"], lift.inputs["Value"])
        colour = lift.outputs["Result"]
    links.new(colour, bsdf.inputs["Base Color"])
    rough = _math(nodes, links, "MAXIMUM", _image(nodes, links, vector, "fabric_leather_02", "rough", False), 0.62)
    links.new(rough, bsdf.inputs["Roughness"])
    normal = nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = 1.8
    links.new(_image(nodes, links, vector, "fabric_leather_02", "nor", False), normal.inputs["Color"])
    # The slow unevenness of a hide pulled tight: it is never quite flat.
    waves = nodes.new("ShaderNodeTexNoise")
    waves.inputs["Scale"].default_value = 0.7
    waves.inputs["Detail"].default_value = 3.0
    links.new(coords.outputs["Object"], waves.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.4
    bump.inputs["Distance"].default_value = 0.3
    links.new(waves.outputs["Fac"], bump.inputs["Height"])
    links.new(normal.outputs["Normal"], bump.inputs["Normal"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def surface(name, source, span, turn=0.0, tint=(1, 1, 1, 1), roughness_gain=1.0, specular=0.2, strength=1.0, coords_kind="Object"):
    """A photographed surface by its colour, roughness and relief maps."""
    mat, nodes, links = material(name)
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Specular IOR Level"].default_value = specular
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / span, 1 / span, 1 / span)
    mapping.inputs["Rotation"].default_value = (0, 0, turn)
    links.new(coords.outputs[coords_kind], mapping.inputs["Vector"])
    vector = mapping.outputs["Vector"]
    toned = _mix(nodes, links, "MULTIPLY", _image(nodes, links, vector, source, "diff", True), tint, 1.0)
    links.new(toned, bsdf.inputs["Base Color"])
    links.new(_math(nodes, links, "MULTIPLY", _image(nodes, links, vector, source, "rough", False), roughness_gain), bsdf.inputs["Roughness"])
    normal = nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = strength
    links.new(_image(nodes, links, vector, source, "nor", False), normal.inputs["Color"])
    links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def pelt(name, dark=0.98, light=0.72):
    """Hair, each one a little darker or lighter than the next: a dark brown animal, greyer at the tips."""
    mat, nodes, links = material(name)
    out = nodes.new("ShaderNodeOutputMaterial")
    hair = nodes.new("ShaderNodeBsdfHairPrincipled")
    hair.parametrization = "MELANIN"
    hair.inputs["Melanin Redness"].default_value = 0.3
    hair.inputs["Roughness"].default_value = 0.5
    hair.inputs["Radial Roughness"].default_value = 0.6
    info = nodes.new("ShaderNodeHairInfo")
    spread = nodes.new("ShaderNodeMapRange")
    spread.inputs["To Min"].default_value, spread.inputs["To Max"].default_value = light, dark
    links.new(info.outputs["Random"], spread.inputs["Value"])
    links.new(spread.outputs["Result"], hair.inputs["Melanin"])
    links.new(hair.outputs["BSDF"], out.inputs["Surface"])
    return mat
