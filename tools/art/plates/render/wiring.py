"""Small pieces of a material's node graph that the plates theme's materials share."""
import bpy

from measures import texture


def image(nodes, links, vector, source, kind, colour):
    """One map of a photographed texture, read at `vector`: its colour output."""
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(texture(f"{source}_{kind}.jpg"), check_existing=True)
    if not colour:
        node.image.colorspace_settings.name = "Non-Color"
    links.new(vector, node.inputs["Vector"])
    return node.outputs["Color"]


def value(nodes, number):
    """A plain number as a socket."""
    node = nodes.new("ShaderNodeValue")
    node.outputs[0].default_value = number
    return node.outputs[0]


def ramp(nodes, links, source, lo, hi, out_lo=0.0, out_hi=1.0):
    """`source` from lo..hi stretched onto out_lo..out_hi, and held there outside."""
    node = nodes.new("ShaderNodeMapRange")
    node.inputs["From Min"].default_value, node.inputs["From Max"].default_value = lo, hi
    node.inputs["To Min"].default_value, node.inputs["To Max"].default_value = out_lo, out_hi
    links.new(source, node.inputs["Value"])
    return node.outputs["Result"]


def noise(nodes, links, vector, scale, detail, roughness=None):
    """A noise read at `vector`: its value output."""
    node = nodes.new("ShaderNodeTexNoise")
    node.inputs["Scale"].default_value = scale
    node.inputs["Detail"].default_value = detail
    if roughness is not None:
        node.inputs["Roughness"].default_value = roughness
    links.new(vector, node.inputs["Vector"])
    return node.outputs["Fac"]


def mapped(nodes, links, vector, location=(0, 0, 0), scale=(1, 1, 1), turn=0.0):
    """`vector` moved, turned about Z and scaled."""
    node = nodes.new("ShaderNodeMapping")
    node.inputs["Location"].default_value = location
    node.inputs["Rotation"].default_value = (0, 0, turn)
    node.inputs["Scale"].default_value = scale
    links.new(vector, node.inputs["Vector"])
    return node


def blend(nodes, links, factor, a, b):
    """Colour `a` toward colour `b` by `factor`; `b` may be a plain colour."""
    node = nodes.new("ShaderNodeMix")
    node.data_type = "RGBA"
    links.new(factor, node.inputs["Factor"])
    links.new(a, node.inputs["A"])
    if hasattr(b, "links"):
        links.new(b, node.inputs["B"])
    else:
        node.inputs["B"].default_value = b
    return node.outputs["Result"]
