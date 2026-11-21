"""The materials the theme is rendered in: photographed wood and vellum (CC0 textures), glass, stone, bone, metal."""
import bpy

from measures import texture


def material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.node_tree.nodes.clear()
    return mat, mat.node_tree.nodes, mat.node_tree.links


def glass(name, colour=(1, 1, 1, 1), ior=1.76, roughness=0.0):
    mat, nodes, links = material(name)
    out = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfGlass")
    shader.inputs["Color"].default_value = colour
    shader.inputs["IOR"].default_value = ior
    shader.inputs["Roughness"].default_value = roughness
    links.new(shader.outputs["BSDF"], out.inputs["Surface"])
    return mat


def plain(name, colour, roughness=0.8):
    mat, nodes, links = material(name)
    out = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Base Color"].default_value = colour
    shader.inputs["Roughness"].default_value = roughness
    links.new(shader.outputs["BSDF"], out.inputs["Surface"])
    return mat


def photographed(name, source, span, turn=0.0, roughness_gain=1.0, tint=(1, 1, 1, 1), specular=0.5):
    """A photographed surface (CC0, Poly Haven): its colour, its roughness and its relief, `span` units to a repeat."""
    mat, nodes, links = material(name)
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Specular IOR Level"].default_value = specular
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / span, 1 / span, 1 / span)
    mapping.inputs["Rotation"].default_value = (0, 0, turn)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    def image(kind, colour):
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(texture(f"{source}_{kind}.jpg"))
        if not colour:
            node.image.colorspace_settings.name = "Non-Color"
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node
    diff = image("diff", True)
    mix = nodes.new("ShaderNodeMix")
    mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = tint
    links.new(diff.outputs["Color"], mix.inputs["A"])
    links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    rough = image("rough", False)
    gain = nodes.new("ShaderNodeMath")
    gain.operation = "MULTIPLY"
    gain.inputs[1].default_value = roughness_gain
    links.new(rough.outputs["Color"], gain.inputs[0])
    links.new(gain.outputs["Value"], bsdf.inputs["Roughness"])
    normal = nodes.new("ShaderNodeNormalMap")
    links.new(image("nor", False).outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def gem_glass(name, colour=(1, 1, 1), density=0.0, ior=2.0):
    """Clear glass whose colour is in its depth: where the stone is thick it is deep, at its edges pale."""
    mat, nodes, links = material(name)
    out = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfGlass")
    shader.inputs["Color"].default_value = (1, 1, 1, 1)
    shader.inputs["IOR"].default_value = ior
    shader.inputs["Roughness"].default_value = 0.0
    # To the light's own rays the stone is clear, so its shadow is not black: it is the stone's colour,
    # deepest where the stone is thickest, as the light that has passed through it.
    path = nodes.new("ShaderNodeLightPath")
    clear = nodes.new("ShaderNodeBsdfTransparent")
    clear.inputs["Color"].default_value = (0.92, 0.92, 0.92, 1)
    mix = nodes.new("ShaderNodeMixShader")
    links.new(path.outputs["Is Shadow Ray"], mix.inputs["Fac"])
    links.new(shader.outputs["BSDF"], mix.inputs[1])
    links.new(clear.outputs["BSDF"], mix.inputs[2])
    links.new(mix.outputs["Shader"], out.inputs["Surface"])
    if density > 0:
        volume = nodes.new("ShaderNodeVolumeAbsorption")
        volume.inputs["Color"].default_value = (*colour, 1)
        volume.inputs["Density"].default_value = density
        links.new(volume.outputs["Volume"], out.inputs["Volume"])
    return mat


def _mix(nodes, links, kind, a, b, factor):
    """Two colours mixed; each of the three may be a node's output or a plain value."""
    node = nodes.new("ShaderNodeMix")
    node.data_type, node.blend_type = "RGBA", kind
    for socket, value in (("A", a), ("B", b), ("Factor", factor)):
        if hasattr(value, "links"):
            links.new(value, node.inputs[socket])
        else:
            node.inputs[socket].default_value = value
    return node.outputs["Result"]


def _math(nodes, links, operation, a, b):
    node = nodes.new("ShaderNodeMath")
    node.operation = operation
    for socket, value in ((0, a), (1, b)):
        if hasattr(value, "links"):
            links.new(value, node.inputs[socket])
        else:
            node.inputs[socket].default_value = value
    return node.outputs["Value"]


def _aged(nodes, links, coords, colour):
    """Slow patches of age: browner here and there, as old sheets are."""
    age = nodes.new("ShaderNodeTexNoise")
    age.inputs["Scale"].default_value = 0.55
    age.inputs["Detail"].default_value = 5.0
    age.inputs["Roughness"].default_value = 0.62
    links.new(coords.outputs["Object"], age.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[1].position = 0.42, 0.74
    ramp.color_ramp.elements[0].color, ramp.color_ramp.elements[1].color = (0, 0, 0, 1), (1, 1, 1, 1)
    links.new(age.outputs["Fac"], ramp.inputs["Fac"])
    return _mix(nodes, links, "MULTIPLY", colour, (0.78, 0.6, 0.36, 1), ramp.outputs["Color"])


def _browned_edges(nodes, links, coords, colour, box, edge):
    """Browner toward the edges of `box`: how near the edge is the smallest of the four distances, a little uneven."""
    split = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], split.inputs["Vector"])
    x0, y0, x1, y1 = box
    across = _math(nodes, links, "MINIMUM", _math(nodes, links, "SUBTRACT", split.outputs["X"], x0), _math(nodes, links, "SUBTRACT", x1, split.outputs["X"]))
    along = _math(nodes, links, "MINIMUM", _math(nodes, links, "SUBTRACT", split.outputs["Y"], y0), _math(nodes, links, "SUBTRACT", y1, split.outputs["Y"]))
    near = _math(nodes, links, "MINIMUM", across, along)
    rough = nodes.new("ShaderNodeTexNoise")
    rough.inputs["Scale"].default_value = 3.0
    links.new(coords.outputs["Object"], rough.inputs["Vector"])
    uneven = _math(nodes, links, "ADD", near, _math(nodes, links, "MULTIPLY", rough.outputs["Fac"], -edge * 0.9))
    fade = nodes.new("ShaderNodeMapRange")
    fade.inputs["From Min"].default_value, fade.inputs["From Max"].default_value = -edge * 0.5, edge * 0.7
    fade.inputs["To Min"].default_value, fade.inputs["To Max"].default_value = 1.0, 0.0
    links.new(uneven, fade.inputs["Value"])
    return _mix(nodes, links, "MULTIPLY", colour, (0.46, 0.28, 0.12, 1), fade.outputs["Result"])


def _rolled_relief(nodes, links, coords, grain):
    """Over the paper's own grain, the slow waves of a sheet that has been rolled."""
    normal = nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = 1.6
    links.new(grain, normal.inputs["Color"])
    waves = nodes.new("ShaderNodeTexNoise")
    waves.inputs["Scale"].default_value = 0.9
    waves.inputs["Detail"].default_value = 2.0
    links.new(coords.outputs["Object"], waves.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.25
    links.new(waves.outputs["Fac"], bump.inputs["Height"])
    links.new(normal.outputs["Normal"], bump.inputs["Normal"])
    return bump.outputs["Normal"]


def vellum(name, span=7.0, tone=(1.75, 1.78, 0.86, 1), box=None, edge=0.3):
    """Worn yellowish vellum from a photographed paper (CC0, ambientCG Paper006): lifted toward yellow,
    browner in slow patches, and browned toward the edges of `box` (x0, y0, x1, y1)."""
    mat, nodes, links = material(name)
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Specular IOR Level"].default_value = 0.15
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / span, 1 / span, 1 / span)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])

    def image(kind, colour):
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(texture(f"Paper006_{kind}.jpg"))
        if not colour:
            node.image.colorspace_settings.name = "Non-Color"
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node.outputs["Color"]

    lifted = _mix(nodes, links, "MULTIPLY", image("Color", True), tone, 1.0)
    colour = _aged(nodes, links, coords, lifted)
    if box:
        colour = _browned_edges(nodes, links, coords, colour, box, edge)
    links.new(colour, bsdf.inputs["Base Color"])
    links.new(image("Roughness", False), bsdf.inputs["Roughness"])
    links.new(_rolled_relief(nodes, links, coords, image("NormalGL", False)), bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


# Scene units to a repeat of the desk's wood.
DESK_REPEAT = 12.0


def desk_wood():
    """The desk's top, the same in every picture: photographed dark wood with no gloss (a sheen would lie
    differently in each picture, and the pictures have to meet)."""
    return photographed("desk", "dark_wood", DESK_REPEAT, tint=(0.3, 0.25, 0.22, 1), roughness_gain=1.4, specular=0.0)


def granite(name, dark=(0.045, 0.043, 0.042, 1), light=(0.3, 0.29, 0.27, 1), grain=38.0):
    """Grey stone: fine light and dark grains, a rough face."""
    mat, nodes, links = material(name)
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.72
    coords = nodes.new("ShaderNodeTexCoord")
    grains = nodes.new("ShaderNodeTexVoronoi")
    grains.inputs["Scale"].default_value = grain
    links.new(coords.outputs["Object"], grains.inputs["Vector"])
    slow = nodes.new("ShaderNodeTexNoise")
    slow.inputs["Scale"].default_value = 3.0
    slow.inputs["Detail"].default_value = 5.0
    links.new(coords.outputs["Object"], slow.inputs["Vector"])
    both = nodes.new("ShaderNodeMath")
    both.operation = "MULTIPLY_ADD"
    both.inputs[1].default_value = 0.55
    links.new(grains.outputs["Color"], both.inputs[0])
    half = nodes.new("ShaderNodeMath")
    half.operation = "MULTIPLY"
    half.inputs[1].default_value = 0.45
    links.new(slow.outputs["Fac"], half.inputs[0])
    links.new(half.outputs["Value"], both.inputs[2])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color, ramp.color_ramp.elements[1].color = dark, light
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[1].position = 0.25, 0.8
    links.new(both.outputs["Value"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.3
    bump.inputs["Distance"].default_value = 0.02
    links.new(grains.outputs["Distance"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def bone(name):
    """Old bone, polished by handling: ivory, a little light passing into it, fine lines along its length, darker in its pores."""
    mat, nodes, links = material(name)
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.32
    bsdf.inputs["Subsurface Weight"].default_value = 0.35
    bsdf.inputs["Subsurface Radius"].default_value = (0.12, 0.08, 0.05)
    bsdf.inputs["Subsurface Scale"].default_value = 0.3
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (0.5, 14.0, 14.0)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    lines = nodes.new("ShaderNodeTexNoise")
    lines.inputs["Scale"].default_value = 4.0
    lines.inputs["Detail"].default_value = 7.0
    lines.inputs["Roughness"].default_value = 0.7
    links.new(mapping.outputs["Vector"], lines.inputs["Vector"])
    stain = nodes.new("ShaderNodeTexNoise")
    stain.inputs["Scale"].default_value = 1.1
    stain.inputs["Detail"].default_value = 3.0
    links.new(coords.outputs["Object"], stain.inputs["Vector"])
    mixed = nodes.new("ShaderNodeMath")
    mixed.operation = "MULTIPLY_ADD"
    mixed.inputs[1].default_value = 0.6
    links.new(lines.outputs["Fac"], mixed.inputs[0])
    part = nodes.new("ShaderNodeMath")
    part.operation = "MULTIPLY"
    part.inputs[1].default_value = 0.4
    links.new(stain.outputs["Fac"], part.inputs[0])
    links.new(part.outputs["Value"], mixed.inputs[2])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color, ramp.color_ramp.elements[1].color = (0.42, 0.24, 0.08, 1), (1.0, 0.82, 0.5, 1)
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[1].position = 0.34, 0.6
    links.new(mixed.outputs["Value"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.3
    bump.inputs["Distance"].default_value = 0.02
    links.new(lines.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def metal(name, colour=(0.83, 0.6, 0.22, 1), roughness=0.3):
    mat = plain(name, colour, roughness)
    mat.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 1.0
    return mat
