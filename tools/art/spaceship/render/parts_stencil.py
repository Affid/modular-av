"""The header plate's stencilled marking, "COMMS-2" (the station and its channel, invented): cream paint sprayed
through a cut stencil.

The letters are drawn here as a stencil cutter would cut them, as signed distances in CSS px (bold strokes 2.3 px
at an 11 px cap height, bowls as rounded rectangles). The bridges are where a cut stencil must hold its islands or
long arcs: through the bowls of the O (top and bottom) and of the S (its upper left and lower right), at the M's
vertices and where the 2's diagonal meets its foot; the C needs none. The paint is worn through where the paint
photograph's roughness is high (its scratches and rubbed patches).
"""
import numpy as np

from paint import _image, _range, material
from parts import c
from stage import texture

CAP, STROKE = 11.0, 2.3   # cap height and stroke (CSS px)
BRIDGE = 0.85             # a stencil bridge's width
ADVANCE = 1.8             # between letters
WIDTHS = {"C": 7.6, "O": 8.0, "M": 11.6, "S": 7.6, "-": 3.4, "2": 7.6}
PAINT = (0.78, 0.74, 0.64)


def stencil_paint():
    """Cream paint, worn: where the photograph's roughness is high (its scratches and rubbed patches) the paint is
    gone and the plate shows."""
    mat, nodes, links = material("stencil")
    outn = nodes.new("ShaderNodeOutputMaterial")
    # flat paint seen straight on under the one lamp: its light is even, so it is given as that light (the
    # thickened, cut letters' normals would otherwise shade the overlaps)
    bsdf = nodes.new("ShaderNodeEmission")
    bsdf.inputs["Color"].default_value = (*PAINT, 1)
    bsdf.inputs["Strength"].default_value = 0.78
    clear = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    tc = nodes.new("ShaderNodeTexCoord")
    mp = nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / c(90),) * 3
    mp.inputs["Location"].default_value = (0.37, 0.21, 0)
    links.new(tc.outputs["Object"], mp.inputs["Vector"])
    rough = _image(nodes, texture("green_metal_rust_rough.jpg"), False)
    links.new(mp.outputs["Vector"], rough.inputs["Vector"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 2.5 / c(10)
    noise.inputs["Detail"].default_value = 8
    links.new(tc.outputs["Object"], noise.inputs["Vector"])
    gone = _range(nodes, links, rough.outputs["Color"], 0.55, 0.62)
    mixn = nodes.new("ShaderNodeMath")
    mixn.operation = "MAXIMUM"
    links.new(gone, mixn.inputs[0])
    links.new(_range(nodes, links, noise.outputs["Fac"], 0.6, 0.64), mixn.inputs[1])
    links.new(mixn.outputs[0], mix.inputs["Fac"])
    links.new(bsdf.outputs[0], mix.inputs[1])
    links.new(clear.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], outn.inputs["Surface"])
    return mat


# ---- signed distances (CSS px, negative inside), on the picture's grid ----


def box(x, y, x0, y0, x1, y1, r=0.0):
    cx, cy, hw, hh = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 - r, (y1 - y0) / 2 - r
    qx, qy = np.abs(x - cx) - hw, np.abs(y - cy) - hh
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def ring(x, y, x0, y0, x1, y1, r):
    outer = box(x, y, x0, y0, x1, y1, r)
    inner = box(x, y, x0 + STROKE, y0 + STROKE, x1 - STROKE, y1 - STROKE, max(r - STROKE, 0.3))
    return np.maximum(outer, -inner)


def seg(x, y, ax, ay, bx, by, t):
    px, py, dx, dy = x - ax, y - ay, bx - ax, by - ay
    h = np.clip((px * dx + py * dy) / (dx * dx + dy * dy), 0, 1)
    return np.hypot(px - dx * h, py - dy * h) - t / 2


def cut(d, gap):
    """d with `gap` (a distance field of the bridge's bar) taken out."""
    return np.maximum(d, -gap)


def hbar(x, y, x0, x1, yc):
    return box(x, y, x0, yc - BRIDGE / 2, x1, yc + BRIDGE / 2)


def vbar(x, y, xc, y0, y1):
    return box(x, y, xc - BRIDGE / 2, y0, xc + BRIDGE / 2, y1)


def letter_o(x, y, w):
    d = ring(x, y, 0, 0, w, CAP, 3.4)
    return cut(cut(d, vbar(x, y, w / 2, CAP - STROKE - 0.5, CAP + 0.5)), vbar(x, y, w / 2, -0.5, STROKE + 0.5))


def letter_c(x, y, w):
    return np.maximum(ring(x, y, 0, 0, w, CAP, 3.4), -box(x, y, w / 2, 3.3, w + 1, CAP - 3.3))


def letter_m(x, y, w):
    t = STROKE
    legs = np.minimum(box(x, y, 0, 0, t, CAP), box(x, y, w - t, 0, w, CAP))
    mid = CAP * 0.28
    diag = np.minimum(seg(x, y, t * 0.3, CAP - t * 0.5, w / 2, mid, t * 0.9),
                      seg(x, y, w - t * 0.3, CAP - t * 0.5, w / 2, mid, t * 0.9))
    diag = np.maximum(diag, box(x, y, t + 0.7, -1, w - t - 0.7, CAP))         # broken from the legs
    diag = cut(diag, vbar(x, y, w / 2, -1, mid + 1.2))                           # and at the vertex
    return np.minimum(legs, diag)


def letter_s(x, y, w):
    upper = ring(x, y, 0, CAP / 2 - STROKE / 2, w, CAP, 2.9)
    lower = ring(x, y, 0, 0, w, CAP / 2 + STROKE / 2, 2.9)
    cu, cl = (CAP / 2 - STROKE / 2 + CAP) / 2, (CAP / 2 + STROKE / 2) / 2
    upper = np.maximum(upper, -box(x, y, w / 2, -1, w + 1, cu))
    lower = np.maximum(lower, -box(x, y, -1, cl, w / 2, CAP + 1))
    upper = cut(upper, hbar(x, y, -1, STROKE + 0.5, cu + 0.6))
    lower = cut(lower, hbar(x, y, w - STROKE - 0.5, w + 1, cl - 0.6))
    return np.minimum(upper, lower)


def letter_dash(x, y, w):
    return box(x, y, 0, CAP / 2 - 1.05, w, CAP / 2 + 1.05)


def letter_2(x, y, w):
    bowl = ring(x, y, 0, CAP * 0.42, w, CAP, 3.0)
    cy = (CAP * 0.42 + CAP) / 2
    bowl = np.maximum(bowl, -box(x, y, -1, -1, w / 2, cy - 0.4))                 # its left side open below
    bowl = np.maximum(bowl, -box(x, y, -1, -1, w + 1, CAP * 0.42 + STROKE * 0.6))
    diag = seg(x, y, w - STROKE * 0.55, cy, STROKE * 0.55, STROKE + BRIDGE + 0.2, STROKE * 1.05)
    diag = np.maximum(diag, box(x, y, 0, STROKE + BRIDGE, w, cy + 0.2))
    foot = box(x, y, 0, 0, w, STROKE)
    return np.minimum(np.minimum(bowl, diag), foot)


LETTERS = {"O": letter_o, "C": letter_c, "M": letter_m, "S": letter_s, "-": letter_dash, "2": letter_2}


def distance(x, y, text, width):
    """The text's distance field, centred across `width` CSS px; x right from the picture's left edge, y up from
    the baseline (arrays that broadcast)."""
    total = sum(WIDTHS[ch] for ch in text) + ADVANCE * (len(text) - 1)
    left = (width - total) / 2
    d = np.full(np.broadcast(x, y).shape, 99.0)
    for ch in text:
        d = np.minimum(d, LETTERS[ch](x - left, y, WIDTHS[ch]))
        left += WIDTHS[ch] + ADVANCE
    return d
