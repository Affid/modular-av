"""Old silver, the frame's and every bezel's: tarnished black in its hollows, rubbed bright only on what stands proud
and only in places, worn and patchy. Its patches come from a photographed steel sheet (Poly Haven, CC0).

Metal under this studio goes pale as zinc unless its base tone is low, and smooth it goes chrome: `old_silver` keeps
its base tone low (0.17) so it reads as tarnished silver.
"""
import bpy

from measures import texture


def _n(nodes, kind, **inputs):
    node = nodes.new(kind)
    for key, value in inputs.items():
        node.inputs[key].default_value = value
    return node


def _math(nodes, links, op, a, b):
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


def old_silver(name="oldsilver", scale=1.0, base=0.2, rubbed=0.62, tarnish=(0.02, 0.02, 0.024)):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    photo = nodes.new("ShaderNodeTexImage")
    photo.image = bpy.data.images.load(texture("rusty_metal_sheet_diff.jpg"))
    photo.projection = "BOX"
    photo.projection_blend = 0.3
    links.new(mapping.outputs["Vector"], photo.inputs["Vector"])
    grey = nodes.new("ShaderNodeRGBToBW")
    links.new(photo.outputs["Color"], grey.inputs["Color"])
    # Hollows: where the cloth never reached; black there.
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 16
    ao.inputs["Distance"].default_value = 0.06
    hollow = _ramp(nodes, links, ao.outputs["AO"], 0.55, 0.92, 1.0, 0.0)
    # Proud: what a hand rubs, but not everywhere along it (the photograph's patches decide where).
    geo = nodes.new("ShaderNodeNewGeometry")
    proud = _ramp(nodes, links, geo.outputs["Pointiness"], 0.5, 0.545, 0.0, 1.0)
    patchy = _ramp(nodes, links, grey.outputs["Val"], 0.25, 0.5, 0.0, 1.0)
    rub = _math(nodes, links, "MULTIPLY", proud, patchy)
    blot = _ramp(nodes, links, grey.outputs["Val"], 0.12, 0.42, 0.85, 0.0)
    dark = _math(nodes, links, "MAXIMUM", hollow, blot)
    base_col = nodes.new("ShaderNodeMix")
    base_col.data_type = "RGBA"
    base_col.inputs["A"].default_value = (base, base, base * 1.02, 1)
    base_col.inputs["B"].default_value = (*tarnish, 1)
    links.new(dark, base_col.inputs["Factor"])
    bright = nodes.new("ShaderNodeMix")
    bright.data_type = "RGBA"
    links.new(base_col.outputs["Result"], bright.inputs["A"])
    bright.inputs["B"].default_value = (rubbed, rubbed * 0.99, rubbed * 0.96, 1)
    links.new(rub, bright.inputs["Factor"])
    links.new(bright.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 1.0
    rough = _ramp(nodes, links, dark, 0.0, 1.0, 0.36, 0.78)
    rough = _math(nodes, links, "SUBTRACT", rough, _math(nodes, links, "MULTIPLY", rub, 0.14))
    links.new(rough, bsdf.inputs["Roughness"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22
    links.new(grey.outputs["Val"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat
