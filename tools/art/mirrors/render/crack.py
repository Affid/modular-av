"""Out of the call: a blow struck the black glass just past the picture's upper right corner (`crack`). Glass breaks
in straight runs with angular turns, out from where it was struck: here four breaks leave the blow at clearly
different angles (one down into the glass, one across the picture's corner, one along under the top at a slant, one
short out into the frame's side), none following the frame's edge, and one short arc of the spider's web joins two
of them near the blow; a few shell-shaped chips are knocked out at the blow itself. Each straight run is a facet
tilted its own way, so one catches the light and the next is dark, and every break has a narrow dark edge. A glint
is never the brightest thing on the camera: the facets are kept well under the names' white. Nothing in the middle
70% of the picture, above the level's marks, or below the name's line.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from common import GLOW, DENSITY, frame_camera, glow_room, keep_middle_clear, luminance, middle_box, place, \
    point_light, render, reset  # noqa: E402
from measures import CRACK, MIDDLE, VIEW, out  # noqa: E402
from pixels import load_rgba, save_rgba, soften  # noqa: E402

SEED = 11
SAFE = 12  # tile units kept clear round the middle box (antialiasing, a facet's width)
GLINT = 0.62  # the brightest a facet may be (sRGB-coded luminance); a name's white is about 0.9
BLOW = (CRACK["blow"]["x"], CRACK["blow"]["y"])
# The breaks: heading (degrees, 0 right, 90 down), length, width at the blow and at the end (tile units).
BREAKS = [
    (104, 470, 14.0, 4.0),  # down into the glass beside the picture, slanting away from the frame
    (143, 260, 11.0, 3.0),  # across the picture's corner, toward its middle, stopping short of it
    (171, 330, 9.0, 2.5),  # along under the top, at a slant, crossing the top band
    (38, 60, 8.0, 3.0),  # short, out into the frame's side
]
ARC = (54, 60, 165)  # the web's one arc: its radius round the blow, and from which angle to which (below the blow)
rng = random.Random(SEED)


def blocked(x, y, pad=SAFE):
    beyond = y < CRACK["top"] or y > CRACK["bottom"] or x > CRACK["right"]
    return beyond or (MIDDLE[0] - pad < x < MIDDLE[2] + pad and MIDDLE[1] - pad < y < MIDDLE[3] + pad)


def walk(start, heading, length, step=(35, 95)):
    """A break's path: straight runs, a small angular turn at each kink, cut short where it would cross a limit."""
    pts, h, run = [start], heading, 0.0
    while run < length:
        if len(pts) > 1:
            h += rng.choice((-1, 1)) * rng.uniform(5, 14)
            h += (heading - h) * 0.5  # a break keeps its way
        s = min(rng.uniform(*step), length - run)
        x, y = pts[-1]
        for cut in (1.0, 0.7, 0.45, 0.25):
            nx, ny = x + s * cut * math.cos(math.radians(h)), y + s * cut * math.sin(math.radians(h))
            if not blocked(nx, ny):
                break
        else:
            break
        pts.append((nx, ny))
        run += s * cut
        if cut < 1.0:
            break
    return pts


def material(name, emit):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    b = nodes["Principled BSDF"]
    pale = rng.uniform(0.05, 0.18)
    b.inputs["Base Color"].default_value = (pale, pale, pale * 1.04, 1)
    b.inputs["Roughness"].default_value = rng.uniform(0.18, 0.4)
    b.inputs["Specular IOR Level"].default_value = 0.8
    if emit > 0:
        # The inner light leaks out in places along the break, not all along it.
        coord = nodes.new("ShaderNodeTexCoord")
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 3.0
        noise.inputs["Detail"].default_value = 3.0
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Location"].default_value = (rng.uniform(0, 50), rng.uniform(0, 50), 0)
        links.new(coord.outputs["Object"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
        r = nodes.new("ShaderNodeMapRange")
        r.inputs["From Min"].default_value, r.inputs["From Max"].default_value = 0.5, 0.68
        r.inputs["To Min"].default_value, r.inputs["To Max"].default_value = 0.0, emit
        links.new(noise.outputs["Fac"], r.inputs["Value"])
        b.inputs["Emission Color"].default_value = (*GLOW, 1)
        links.new(r.outputs["Result"], b.inputs["Emission Strength"])
    return m


class Facets:
    def __init__(self, count):
        self.mats = [material(f"facet{k}", rng.choice((0.0, 0.4, 0.8, 1.2))) for k in range(count)]
        self.verts, self.faces, self.which = [], [], []

    def run(self, a, b, w0, w1):
        """One straight run of a break: a flat strip tilted its own way, with its own glass."""
        tilt = math.radians(rng.uniform(-50, 50))
        mat = rng.randrange(len(self.mats))
        dx, dy = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        start = len(self.verts)
        for (px, py), w in ((a, w0), (b, w1)):
            for side in (1, -1):
                sx, sy = place(px + nx * side * w / 2 * math.cos(tilt), py + ny * side * w / 2 * math.cos(tilt))
                self.verts.append((sx, sy, side * w / 2 * math.sin(tilt) / 100.0 + 0.02))
        self.faces.append((start, start + 2, start + 3, start + 1))
        self.which.append(mat)

    def path(self, pts, w0, w1):
        n = len(pts) - 1
        for k in range(n):
            self.run(pts[k], pts[k + 1], w0 + (w1 - w0) * k / n, w0 + (w1 - w0) * (k + 1) / n)

    def chip(self, cx, cy, size, facing):
        """A shell-shaped flake knocked out at the blow: a curved scoop, so the light runs round its rim."""
        mat = rng.randrange(len(self.mats))
        centre = len(self.verts)
        sx, sy = place(cx, cy)
        self.verts.append((sx, sy, 0.02 - size / 100.0 * 0.35))
        rim = []
        for j in range(9):
            a = facing - 1.4 + 2.8 * j / 8
            rr = size * (0.75 + 0.25 * math.sin(math.pi * j / 8))
            sx, sy = place(cx + rr * math.cos(a), cy + rr * math.sin(a))
            rim.append(len(self.verts))
            self.verts.append((sx, sy, 0.02 + rng.uniform(-0.004, 0.004)))
        for j in range(8):
            self.faces.append((centre, rim[j], rim[j + 1]))
            self.which.append(mat)

    def build(self, scene):
        mesh = bpy.data.meshes.new("crack")
        mesh.from_pydata(self.verts, [], self.faces)
        for m in self.mats:
            mesh.materials.append(m)
        for poly, k in zip(mesh.polygons, self.which):
            poly.material_index = k
        mesh.update()
        for poly in mesh.polygons:
            if poly.normal.z < 0:
                poly.flip()
            poly.use_smooth = True
        scene.collection.objects.link(bpy.data.objects.new("crack", mesh))


scene = reset()
scene.cycles.samples = 160
scene.render.film_transparent = True
frame_camera(scene)
glow_room(scene)
point_light(scene, "fill", (0, 0, 6), (0.6, 0.5, 1.0), 260, radius=2.0)
facets = Facets(8)
for heading, length, w0, w1 in BREAKS:
    path = walk(BLOW, heading, length)
    print("break", heading, "runs", len(path) - 1, "to", [round(v) for v in path[-1]])
    facets.path(path, w0, w1)
radius, a0, a1 = ARC
steps = 4
arc = [(BLOW[0] + radius * math.cos(math.radians(a0 + (a1 - a0) * k / steps)),
        BLOW[1] + radius * math.sin(math.radians(a0 + (a1 - a0) * k / steps))) for k in range(steps + 1)]
facets.path([p for p in arc if not blocked(*p)], 6.0, 4.0)
for _ in range(6):
    ang = rng.uniform(0, math.tau)
    r = rng.uniform(4, 14)
    facets.chip(BLOW[0] + r * math.cos(ang), BLOW[1] + r * math.sin(ang), rng.uniform(5, 10),
                ang + rng.uniform(-0.5, 0.5))
facets.build(scene)
render(scene, out("crack"))

px = load_rgba(out("crack"))
rows, cols = middle_box(px.shape)
px[rows, cols, 3] = 0
# A glint is never the brightest thing: the facets' light is scaled down to GLINT where it is more.
lum = luminance(px)
scale = np.where(lum > GLINT, GLINT / np.maximum(lum, 1e-6), 1.0)[..., None]
px[..., :3] *= scale
# A dark edge round every break: the broken faces' shadow, a pixel or two wide.
a = px[..., 3].copy()
rim = np.clip(soften(a, 1, 2) * 1.8 - a, 0, 1) * 0.75
rim[rows, cols] = 0
na = a + rim * (1 - a)
keep = (a / np.maximum(na, 1e-6))[..., None]
px[..., :3] = np.where(na[..., None] > 0, px[..., :3] * keep + 0.008 * (1 - keep), px[..., :3])
px[..., 3] = na
keep_middle_clear(px, "crack")
seen = px[..., 3] > 0.5
print("crack BRIGHTEST", round(float(luminance(px)[seen].max()), 3), "density", DENSITY, "view", VIEW["w"])
save_rgba(px, out("crack"))
