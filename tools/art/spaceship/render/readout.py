"""The segment displays set into a monitor's case: the readout in the chin the name shows in, and on the viewer's
own monitor the level's window in the right strip. Each is a black moulded bezel sloping down to a window of
smoked glass over a black cell. The segments are the stylesheet's; this is the hardware they light in.

The smoked glass is mostly the black behind it, with a faint sheen of the room where its slight curve turns it
toward the work lamp (high, to the left), and, while the TX lamp is lit, a green gleam at the readout's end
nearest it.
"""
import bmesh
import bpy

import stage
from case import LAMP, LAMP_THROW, SLOT_HALF, SLOT_X, SLOT_Y, WINDOW_IN, WINDOW_OUT, ring
from measures import place, units
from paint import _math, _range, plain

SHEEN = 0.06  # how bright the room's sheen is on the smoked glass
GLOW = 0.014  # how bright the TX lamp's gleam is on the readout's glass while it is lit


def _cell(name, box, grow):
    """The black behind a window: a plane under it, `grow` units past its edges."""
    x0, y0, x1, y1 = box[:4]
    ax, ay = place(x0 - grow, y0 - grow)
    bx, by = place(x1 + grow, y1 + grow)
    bpy.ops.mesh.primitive_plane_add(size=1, location=((ax + bx) / 2, (ay + by) / 2, -0.07))
    floor = bpy.context.active_object
    floor.scale = (bx - ax, ay - by, 1)
    floor.data.materials.append(plain(name, (0.004, 0.006, 0.005), rough=0.9))


def readout(lit):
    """The readout in the chin: its bezel, its cell, and a pane bowed top to bottom over its window."""
    bezel = plain("readout-bezel", (0.022, 0.022, 0.021), rough=0.45)
    rings = [ring(WINDOW_OUT, -2.0, -0.004), ring(WINDOW_OUT, 0.0, 0.006), ring(WINDOW_OUT, 2.5, 0.006),
             ring(WINDOW_IN, -1.5, -0.035), ring(WINDOW_IN, 0.0, -0.05), ring(WINDOW_IN, 0.0, -0.3)]
    obj = stage.loft("readout", rings)
    obj.data.materials.append(bezel)
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = sub.render_levels = 2
    _cell("readout-cell", WINDOW_IN, 6)
    x0, y0, x1, y1, _ = WINDOW_IN
    curved_pane("readout-pane", (x0 - 2, y0 - 2, x1 + 2, y1 + 2), -0.045, 0.034, "y",
                smoked_glass("readout-smoke", glow=GLOW if lit else 0.0))


def level_window():
    """The level's window in the right strip: a narrow slot like the readout's, its pane bowed side to side."""
    in_box = (SLOT_X - SLOT_HALF, SLOT_Y[0], SLOT_X + SLOT_HALF, SLOT_Y[1], 3)
    out_box = (in_box[0] - 5, in_box[1] - 5, in_box[2] + 5, in_box[3] + 5, 6)
    bezel = plain("slot-bezel", (0.022, 0.022, 0.021), rough=0.45)
    rings = [ring(out_box, -1.5, -0.004), ring(out_box, 0.0, 0.005), ring(out_box, 2.0, 0.005),
             ring(in_box, -1.0, -0.035), ring(in_box, 0.0, -0.05), ring(in_box, 0.0, -0.3)]
    obj = stage.loft("slot", rings)
    obj.data.materials.append(bezel)
    _cell("slot-cell", in_box, 4)
    curved_pane("slot-pane", (in_box[0] - 1.5, in_box[1] - 1.5, in_box[2] + 1.5, in_box[3] + 1.5), -0.045, 0.012,
                "x", smoked_glass("slot-smoke", catch="left"))


def _sheen(nodes, links, catch):
    """Where the pane's curve turns it toward the work lamp: the reflection vector's lean, times how near the
    lamp's end of the window a point is."""
    tc = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(tc.outputs["Reflection"], sep.inputs[0])
    oc = nodes.new("ShaderNodeTexCoord")
    osep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(oc.outputs["Object"], osep.inputs[0])
    if catch == "up":  # a wide window bowed top to bottom: its upper part turns up toward the lamp
        # only along its top edge, above the segments: a name dimmed out of the call keeps 4.5:1 over it
        up = _math(nodes, links, "POWER", _range(nodes, links, sep.outputs["Y"], 0.2, 0.3, 0.0, 1.0), 1.5)
        # the lamp is high and to the left, near: the sheen is brightest at the window's left end
        near = _range(nodes, links, osep.outputs["X"], place(WINDOW_IN[0], 0)[0], place(WINDOW_IN[2], 0)[0],
                      1.0, 0.3)
    else:  # a tall slot bowed side to side: its left part turns toward the lamp, more so near its top
        up = _range(nodes, links, sep.outputs["X"], -0.02, -0.14, 0.0, 1.0)
        near = _range(nodes, links, osep.outputs["Y"], place(0, SLOT_Y[1])[1], place(0, SLOT_Y[0])[1], 0.3, 1.0)
    return _math(nodes, links, "MULTIPLY", _math(nodes, links, "MULTIPLY", up, near), SHEEN)


def _added(nodes, links, shader, colour, strength):
    """`shader` with an emission of `colour` at `strength` (a socket) added."""
    em = nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = colour
    links.new(strength, em.inputs["Strength"])
    add = nodes.new("ShaderNodeAddShader")
    links.new(shader, add.inputs[0])
    links.new(em.outputs[0], add.inputs[1])
    return add.outputs[0]


def smoked_glass(name, glow=0.0, catch="up"):
    """Smoked glass: the room's reflection by Fresnel over a dark tint, the sheen (the reflection of a soft light
    seen in a given direction, so it follows the glass's curve and touches this glass only), and the TX lamp's
    gleam falling off from the lamp when `glow`."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    o = nodes.new("ShaderNodeOutputMaterial")
    gl = nodes.new("ShaderNodeBsdfGlossy")
    gl.inputs["Color"].default_value = (0.3, 0.32, 0.31, 1)
    gl.inputs["Roughness"].default_value = 0.1
    tr = nodes.new("ShaderNodeBsdfTransparent")
    tr.inputs["Color"].default_value = (0.35, 0.42, 0.38, 1)
    fr = nodes.new("ShaderNodeFresnel")
    fr.inputs["IOR"].default_value = 1.5
    mx = nodes.new("ShaderNodeMixShader")
    links.new(fr.outputs[0], mx.inputs["Fac"])
    links.new(tr.outputs[0], mx.inputs[1])
    links.new(gl.outputs[0], mx.inputs[2])
    last = _added(nodes, links, mx.outputs[0], (1.0, 0.88, 0.7, 1), _sheen(nodes, links, catch))
    if glow:
        obj = nodes.new("ShaderNodeTexCoord")
        d = nodes.new("ShaderNodeVectorMath")
        d.operation = "DISTANCE"
        links.new(obj.outputs["Object"], d.inputs[0])
        d.inputs[1].default_value = (*place(*LAMP), 0)
        fall = _range(nodes, links, d.outputs["Value"], units(52), units(130), 1.0, 0.0)
        fall = _math(nodes, links, "MULTIPLY", _math(nodes, links, "POWER", fall, 2.0), glow)
        last = _added(nodes, links, last, (*LAMP_THROW, 1), fall)
    links.new(last, o.inputs["Surface"])
    return mat


def curved_pane(name, box, z, bulge, across, mat):
    """A pane of glass over a window (tile box x0, y0, x1, y1), bowed out by `bulge` scene units along its short
    side (`across` 'y' or 'x'), so the room's light slides over it rather than lighting it all alike."""
    x0, y0, x1, y1 = box
    nx, ny = (60, 16) if across == "y" else (8, 60)
    bm = bmesh.new()
    vs = {}
    for i in range(nx + 1):
        for j in range(ny + 1):
            tx, ty = x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny
            v = (2 * j / ny - 1) if across == "y" else (2 * i / nx - 1)
            vs[i, j] = bm.verts.new((*place(tx, ty), z + bulge * (1 - v * v)))
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((vs[i, j], vs[i + 1, j], vs[i + 1, j + 1], vs[i, j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if sum(p.normal.z for p in mesh.polygons) < 0:
        mesh.flip_normals()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = stage.link(bpy.data.objects.new(name, mesh))
    obj.data.materials.append(mat)
    return obj
