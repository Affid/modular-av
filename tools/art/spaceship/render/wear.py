"""The wear of use on a monitor's case: where hands, tools and knocks have taken the paint, laid into the case's
paint (paint.py's painted()) as shader nodes, so it tells how the set is handled.

  - The paint's own chipping is fed where use wears it (in place of its "worn" attribute): the case's corners (it
    is carried and knocked by them), the chin's lower edge where the fingers go under it to pull the set out (a
    third and two thirds across), a ring round each screw (the driver slips), and round the headset bracket's foot
    (the band and the right cup knock the bezel there, hung up every shift). Broken up by a fine noise; the
    paint's chips made smaller, as paint chips.
  - Scuffs: short streaks along the rim's flat bands (top and sides), where the set was shoved along a shelf,
    rubber and grime rubbed into the paint.
  - The thumbs' rub on the chin's two ends, where the thumbs take the set, drawn as paint worn through by a thumb
    (thumb_rub).

Places are tile units (x right, y down), worked out in the shader from the object's coordinates.
"""
import math

from measures import SCALE, VIEW
from paint import _math, _mix, _range

# The fingers' patches under the chin's lower edge: centre and half-axes.
FINGERS = ((262.0, 724.0, 50.0, 11.0), (742.0, 724.0, 50.0, 11.0))
# The thumbs' rub: centre and half-axes; the outline is this ellipse broken by noise. The right patch sits at the
# corner, right of the headset's coil and lead, so the corner is not a tangle of cord over bright steel.
THUMBS = ((0.0, 688.0, 31.0, 17.0), (1016.0, 694.0, 25.0, 16.0))
# Flakes breaking off just past a thumb patch's outline, along the thumb's path (a sliver of paint between):
# patch, angle on the ellipse (degrees), how far out (times the ellipse), half-length and half-width.
FLAKES = ((0, 12, 1.22, 5.5, 2.8), (0, -150, 1.15, 4.2, 2.4), (1, 195, 1.22, 5.0, 2.7), (1, 60, 1.2, 3.8, 2.3))
# The thumb's path: across the chin, a little downhill toward the corner; offsets as a fraction of the patch's ry.
STREAKS = ((-0.48, 0.07), (0.12, 0.04))
# The rub's colours: the paint's crumbling lip, the warm-grey primer, the steel from dull to polished.
LIP_DARK = (0.018, 0.014, 0.008, 1)
PRIMER = (0.1, 0.087, 0.062, 1)


def tile_vector(nodes, links):
    """The shaded point in tile units (x right, y down): x, y and the vector (x, y, 0)."""
    tc = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(tc.outputs["Object"], sep.inputs[0])
    cx, cy = VIEW["x"] + VIEW["w"] / 2, VIEW["y"] + VIEW["h"] / 2
    tx = _math(nodes, links, "ADD", _math(nodes, links, "MULTIPLY", sep.outputs["X"], SCALE), cx)
    ty = _math(nodes, links, "SUBTRACT", cy, _math(nodes, links, "MULTIPLY", sep.outputs["Y"], SCALE))
    comb = nodes.new("ShaderNodeCombineXYZ")
    links.new(tx, comb.inputs[0])
    links.new(ty, comb.inputs[1])
    return tx, ty, comb.outputs[0]


def _noise(nodes, links, vec, scale, detail, rough=None):
    n = nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    if rough is not None:
        n.inputs["Roughness"].default_value = rough
    links.new(vec, n.inputs["Vector"])
    return n.outputs["Fac"]


def _ellipse(nodes, links, tx, ty, cx, cy, rx, ry):
    """How far a point is from (cx, cy) in the ellipse's own measure: 1 on the ellipse."""
    ex = _math(nodes, links, "DIVIDE", _math(nodes, links, "SUBTRACT", tx, cx), rx)
    ey = _math(nodes, links, "DIVIDE", _math(nodes, links, "SUBTRACT", ty, cy), ry)
    return _math(nodes, links, "SQRT", _math(nodes, links, "ADD", _math(nodes, links, "MULTIPLY", ex, ex),
                                             _math(nodes, links, "MULTIPLY", ey, ey)))


def _over(nodes, links, bsdf, name, fac, value):
    """Lay `value` over what feeds the BSDF's input `name`, by `fac`."""
    feed = next(lk for lk in links if lk.to_socket == bsdf.inputs[name])
    links.new(_mix(nodes, links, fac, feed.from_socket, value), bsdf.inputs[name])


def _maximum(nodes, links, parts):
    w = parts[0]
    for p in parts[1:]:
        w = _math(nodes, links, "MAXIMUM", w, p)
    return w


def wear_of_use(mat, outer, screws, foot):
    """Feed the paint's chipping where use wears it. `outer`: the case's outline (x0, y0, x1, y1, r); `screws`:
    their centres; `foot`: the bracket foot's worn patch (cx, cy, rx, ry)."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    attr = next(n for n in nodes if n.type == "ATTRIBUTE" and n.attribute_name == "worn")
    targets = [lk.to_socket for lk in links if lk.from_node == attr]
    for n in nodes:  # the paint's chipping noise (detail 12) finer: paint flakes off in small chips
        if n.type == "TEX_NOISE" and abs(n.inputs["Detail"].default_value - 12.0) < 1e-3:
            n.inputs["Scale"].default_value *= 2.6
    tx, ty, vec = tile_vector(nodes, links)

    def dist(px, py):
        v = nodes.new("ShaderNodeVectorMath")
        v.operation = "DISTANCE"
        links.new(vec, v.inputs[0])
        v.inputs[1].default_value = (px, py, 0)
        return v.outputs["Value"]

    x0, y0, x1, y1, _ = outer
    parts = [_range(nodes, links, dist(cx, cy), 18, 100, 0.3, 0.0) for cx, cy in ((x0, y0), (x1, y0), (x1, y1),
                                                                                  (x0, y1))]
    # the chin's lower edge, most where the two hands take it
    hands = _math(nodes, links, "MAXIMUM",
                  _range(nodes, links, _math(nodes, links, "ABSOLUTE", _math(nodes, links, "SUBTRACT", tx, 260.0)),
                         40.0, 230.0, 1.0, 0.3),
                  _range(nodes, links, _math(nodes, links, "ABSOLUTE", _math(nodes, links, "SUBTRACT", tx, 760.0)),
                         40.0, 230.0, 1.0, 0.3))
    parts.append(_math(nodes, links, "MULTIPLY", _range(nodes, links, ty, 690, 716, 0.0, 0.12), hands))
    parts += _fingers(nodes, links, tx, ty)
    parts += _scuffs(nodes, links, tx, ty)
    for at in screws:
        off = _math(nodes, links, "ABSOLUTE", _math(nodes, links, "SUBTRACT", dist(*at), 11.0))
        parts.append(_range(nodes, links, off, 0.0, 8.0, 0.38, 0.0))
    parts.append(_range(nodes, links, _ellipse(nodes, links, tx, ty, *foot), 0.35, 1.0, 0.36, 0.0))
    w = _maximum(nodes, links, parts)
    fine = _noise(nodes, links, vec, 0.045, 8.0, 0.65)
    w = _math(nodes, links, "MULTIPLY", w, _range(nodes, links, fine, 0.3, 0.7, 0.5, 1.4))
    for sock in targets:
        links.new(w, sock)


def _fingers(nodes, links, tx, ty):
    """Patches worn under the chin's lower edge where the fingers pull the set out: clusters of wear (a noise
    breaks each up), not cut-out shapes."""
    vec = nodes.new("ShaderNodeCombineXYZ")
    links.new(tx, vec.inputs[0])
    links.new(ty, vec.inputs[1])
    cluster = _range(nodes, links, _noise(nodes, links, vec.outputs[0], 0.075, 5.0), 0.38, 0.62, 0.45, 1.2)
    return [_math(nodes, links, "MULTIPLY", _range(nodes, links, _ellipse(nodes, links, tx, ty, *f), 0.15, 1.3,
                                                   0.78, 0.0), cluster) for f in FINGERS]


def _scuffs(nodes, links, tx, ty):
    """Short streaks along the rim (stretched noise), only on the flat bands round the front: they wear the paint
    a little and darken it (rubber and grime rubbed in where the set was shoved along)."""
    vec = nodes.new("ShaderNodeCombineXYZ")
    links.new(_math(nodes, links, "MULTIPLY", tx, 0.012), vec.inputs[0])
    links.new(_math(nodes, links, "MULTIPLY", ty, 0.012), vec.inputs[1])
    parts, scuffs = [], None
    for along in ("top", "side"):
        sc = nodes.new("ShaderNodeVectorMath")
        sc.operation = "MULTIPLY"
        links.new(vec.outputs[0], sc.inputs[0])
        sc.inputs[1].default_value = (0.09, 1.0, 1.0) if along == "top" else (1.0, 0.09, 1.0)
        streak = _range(nodes, links, _noise(nodes, links, sc.outputs[0], 3.0, 4.0), 0.56, 0.66, 0.0, 1.0)
        band = (_range(nodes, links, ty, -26.0, -40.0) if along == "top" else
                _math(nodes, links, "MAXIMUM", _range(nodes, links, tx, -28.0, -44.0),
                      _range(nodes, links, tx, 1012.0, 1026.0)))
        mark = _math(nodes, links, "MULTIPLY", streak, band)
        parts.append(_math(nodes, links, "MULTIPLY", mark, 0.4))
        scuffs = mark if scuffs is None else _math(nodes, links, "MAXIMUM", scuffs, mark)
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    col = next(lk for lk in links if lk.to_socket == bsdf.inputs["Base Color"])
    dark = nodes.new("ShaderNodeMix")
    dark.data_type = "RGBA"
    dark.blend_type = "MULTIPLY"
    links.new(_math(nodes, links, "MULTIPLY", scuffs, 0.7), dark.inputs["Factor"])
    links.new(col.from_socket, dark.inputs["A"])
    dark.inputs["B"].default_value = (0.25, 0.22, 0.18, 1)
    links.new(dark.outputs["Result"], bsdf.inputs["Base Color"])
    return parts


def _thumb_outline(nodes, links, tx, ty, vec):
    """The thumb patches' distance field: 1 on the ragged outline, < 1 inside, the flakes merged into the outline.
    Noise at three scales breaks the outline: lobes and bays, then a ragged edge."""
    coarse = _range(nodes, links, _noise(nodes, links, vec, 0.06, 3.0, 0.5), 0.3, 0.7, 0.7, 1.3)
    medium = _range(nodes, links, _noise(nodes, links, vec, 0.18, 4.0, 0.6), 0.3, 0.7, 0.88, 1.12)
    fine = _range(nodes, links, _noise(nodes, links, vec, 0.55, 4.0, 0.6), 0.3, 0.7, 0.95, 1.05)
    wob = _math(nodes, links, "MULTIPLY", _math(nodes, links, "MULTIPLY", coarse, medium), fine)
    e = None
    for cx, cy, rx, ry in THUMBS:
        d = _ellipse(nodes, links, tx, ty, cx, cy, rx, ry)
        e = d if e is None else _math(nodes, links, "MINIMUM", e, d)
    jag = _range(nodes, links, _noise(nodes, links, vec, 0.7, 5.0, 0.75), 0.3, 0.7, 0.55, 1.55)  # flakes: jagged
    for k, deg, out, half_l, half_w in FLAKES:
        cx, cy, rx, ry = THUMBS[k]
        a = math.radians(deg)
        fx, fy = cx + rx * out * math.cos(a), cy + ry * out * math.sin(a)
        d = _ellipse(nodes, links, tx, ty, fx, fy, half_l, half_w)
        e = _math(nodes, links, "MINIMUM", e, _math(nodes, links, "MULTIPLY", d, jag))
    return _math(nodes, links, "MULTIPLY", e, wob)


def _thumb_streaks(nodes, links, tx, ty, vec):
    """Fine lines along the thumb's path, each about 1.2 tile units wide, tapering out past the patch."""
    gap = _range(nodes, links, _noise(nodes, links, vec, 0.35, 2.0, 0.6), 0.35, 0.6, 0.0, 1.0)  # each one broken
    out = None
    for cx, cy, rx, ry in THUMBS:
        along = _math(nodes, links, "ABSOLUTE",
                      _math(nodes, links, "DIVIDE", _math(nodes, links, "SUBTRACT", tx, cx), rx))
        reach = _range(nodes, links, along, 1.35, 0.7)
        for off, slope in STREAKS:
            line_y = _math(nodes, links, "ADD", cy + off * ry,
                           _math(nodes, links, "MULTIPLY", _math(nodes, links, "SUBTRACT", tx, cx), slope))
            dist = _math(nodes, links, "ABSOLUTE", _math(nodes, links, "SUBTRACT", ty, line_y))
            s = _math(nodes, links, "MULTIPLY", _range(nodes, links, dist, 1.5, 0.45), reach)
            out = s if out is None else _math(nodes, links, "MAXIMUM", out, s)
    return _math(nodes, links, "MULTIPLY", out, gap)


def thumb_rub(mat):
    """The thumbs' rub on the chin's two ends, as paint worn through by a thumb. From the outside in, every
    boundary hard and ragged: the paint round the patch polished a little glossier by handling, with grime worked
    into it; a dark broken lip where the paint's edge crumbles (as on the case's knocks); a narrow warm-grey
    primer ring (1-2 CSS px at a 258 px camera); the polished steel heart, brightest where the thumb presses; two
    or three fine streaks along the thumb's path, across the heart and a little past it into the paint."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tx, ty, vec = tile_vector(nodes, links)
    e = _thumb_outline(nodes, links, tx, ty, vec)
    bare = _range(nodes, links, e, 1.0, 0.975)  # everything inside the outline: the paint is gone
    heart = _range(nodes, links, e, 0.76, 0.73)  # the steel inside the primer ring (the ring: e 0.76..1)
    shine = _range(nodes, links, e, 0.72, 0.15)  # brightest where the thumb presses
    breakup = _range(nodes, links, _noise(nodes, links, vec, 0.9, 3.0, 0.6), 0.35, 0.6, 0.0, 1.0)
    lip = _math(nodes, links, "MULTIPLY", _math(nodes, links, "SUBTRACT", _range(nodes, links, e, 1.16, 1.0), bare),
                _math(nodes, links, "ADD", 0.7, _math(nodes, links, "MULTIPLY", breakup, 0.3)))
    handled = _range(nodes, links, e, 1.6, 1.05)  # paint polished and greyed by handling round it
    streak = _thumb_streaks(nodes, links, tx, ty, vec)
    streak_paint = _math(nodes, links, "MULTIPLY", streak, _math(nodes, links, "SUBTRACT", 1.0, bare))
    streak_steel = _math(nodes, links, "MULTIPLY", streak, heart)
    _over(nodes, links, bsdf, "Base Color", _math(nodes, links, "MULTIPLY", handled, 0.28), (0.16, 0.13, 0.07, 1))
    _over(nodes, links, bsdf, "Base Color", _math(nodes, links, "MULTIPLY", streak_paint, 0.75),
          (0.2, 0.185, 0.15, 1))
    _over(nodes, links, bsdf, "Base Color", _math(nodes, links, "POWER", lip, 0.5), LIP_DARK)
    _over(nodes, links, bsdf, "Base Color", bare, PRIMER)
    steel = _mix(nodes, links, _math(nodes, links, "POWER", shine, 1.3), (0.4, 0.398, 0.385, 1),
                 (0.78, 0.775, 0.75, 1))
    steel = _mix(nodes, links, _math(nodes, links, "MULTIPLY", streak_steel, 0.95), steel, (0.13, 0.128, 0.122, 1))
    _over(nodes, links, bsdf, "Base Color", heart, steel)
    feed = next(lk for lk in links if lk.to_socket == bsdf.inputs["Metallic"])
    links.new(_math(nodes, links, "MAXIMUM", feed.from_socket, _math(nodes, links, "MULTIPLY", heart, 0.7)),
              bsdf.inputs["Metallic"])
    _over(nodes, links, bsdf, "Roughness", _math(nodes, links, "MULTIPLY", handled, 0.7), 0.3)
    _over(nodes, links, bsdf, "Roughness", bare, 0.62)  # the primer: chalky
    _over(nodes, links, bsdf, "Roughness", heart, _range(nodes, links, shine, 0.0, 1.0, 0.36, 0.2))
    _over(nodes, links, bsdf, "Roughness", streak_steel, 0.5)
