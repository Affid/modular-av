"""Tape on a monitor's case, each strip laid by casting down onto the case, so it touches where it lies:

  - muted: two strips of cloth gaffer tape crossed over the microphone's grille, pressed into its recess, ends
    torn by hand, the upper strip's torn end come unstuck and lifted;
  - the player's colour: a tab of vinyl tape wrapped over the case's top-left corner, rendered white for the
    stylesheet to tint (frames.py's colour layer).
"""
import math
import random

import bmesh
import bpy

import stage
from measures import place, units
from monitor_shapes import surface_z
from paint import material, plain

CURL = 3.0  # how far round a peeled tape corner turns before it runs straight (folded back on itself), radians


def gaffer(colour=(0.052, 0.05, 0.046)):
    """Cloth gaffer tape after a shift: dark grey cloth (not black: at 127 px black read as a squashed bug), a satin
    sheen on its smooth runs and a dull weave in its creases, grey with dust and fingermarks where it is pressed
    down; its weave coarse and deep enough to read as cloth at a 258 px camera and as tape, not a smudge, at 127.
    The underside (material 1, seen only where an end has lifted) is the adhesive: lighter, glossier."""
    mat, nodes, links = material("gaffer")
    outn = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs[0], outn.inputs["Surface"])
    tc = nodes.new("ShaderNodeTexCoord")
    dust = nodes.new("ShaderNodeTexNoise")  # dust and fingermarks: a soft cloud, thresholded
    dust.inputs["Scale"].default_value = 7.0
    dust.inputs["Detail"].default_value = 6.0
    links.new(tc.outputs["Object"], dust.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[1].position = 0.5, 0.72
    ramp.color_ramp.elements[0].color = (*colour, 1)
    ramp.color_ramp.elements[1].color = (0.11, 0.105, 0.098, 1)
    links.new(dust.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    rough = nodes.new("ShaderNodeMapRange")
    links.new(dust.outputs["Fac"], rough.inputs["Value"])
    rough.inputs["From Min"].default_value, rough.inputs["From Max"].default_value = 0.35, 0.75
    rough.inputs["To Min"].default_value, rough.inputs["To Max"].default_value = 0.62, 0.9
    links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.3
    bsdf.inputs["Sheen Weight"].default_value = 0.25
    bsdf.inputs["Sheen Roughness"].default_value = 0.4
    bump = nodes.new("ShaderNodeBump")  # the weave: fine crossed waves, a little irregular
    bump.inputs["Strength"].default_value = 0.6
    total = None
    for axis in ("X", "Y"):
        wave = nodes.new("ShaderNodeTexWave")
        wave.bands_direction = axis
        wave.inputs["Scale"].default_value = 170.0
        wave.inputs["Distortion"].default_value = 1.2
        wave.inputs["Detail"].default_value = 1.0
        links.new(tc.outputs["Object"], wave.inputs["Vector"])
        if total is None:
            total = wave.outputs["Fac"]
        else:
            add = nodes.new("ShaderNodeMath")
            add.operation = "ADD"
            links.new(total, add.inputs[0])
            links.new(wave.outputs["Fac"], add.inputs[1])
            total = add.outputs[0]
    links.new(total, bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    under = plain("gaffer-glue", (0.08, 0.075, 0.066), rough=0.45)
    return mat, under


def _peeled(hinge, along, rho):
    """Where a point `hinge - along` units past an unstuck corner's hinge lies: curled up and back over itself
    (radius rho), then running straight. Returns how far back and how far up, tile units."""
    a = hinge - along
    if a / rho <= CURL:
        return rho * math.sin(a / rho), rho * (1 - math.cos(a / rho))
    rest = a - rho * CURL
    return rho * math.sin(CURL) + rest * math.cos(CURL), rho * (1 - math.cos(CURL)) + rest * math.sin(CURL)


def tape_strip(name, start, end, width, mats, lift=0.0025, seed=1, creases=4, peel=0.0, peel_len=16.0,
               rows=9, cols=90, roll=0.0):
    """A strip of gaffer tape from `start` to `end` (tile units), draped on what is under it, its ends torn ragged
    and at a slant, pressed down unevenly: a few creases across it where it was smoothed with a thumb; one corner
    of its start end come unstuck and curled back over itself (radius `peel`, reaching `peel_len` units in at
    that corner, little at the other), its glue side up; its long edges standing `roll` off the surface (tape never
    lies flat to its edge, and the upper edges catch the work lamp)."""
    rng = random.Random(seed)
    sx, sy = start
    ex, ey = end
    length = math.hypot(ex - sx, ey - sy)
    ux, uy = (ex - sx) / length, (ey - sy) / length
    nx, ny = -uy, ux
    rag = [[rng.uniform(-1, 1) * 4.0 for _ in range(rows + 1)] for _ in range(2)]
    slant = [rng.uniform(-0.25, 0.25) for _ in range(2)]
    folds = [(rng.uniform(0.15, 0.85) * length, rng.uniform(-0.5, 0.5), rng.uniform(0.0012, 0.0026),
              rng.uniform(1.6, 3.2)) for _ in range(creases)]
    bm = bmesh.new()
    grid = []
    for i in range(cols + 1):
        row = []
        for j in range(rows + 1):
            v = j / rows - 0.5
            s = v * width
            along = i / cols * length
            if i in (0, cols):
                end_k = 0 if i == 0 else 1
                along += rag[end_k][j] + slant[end_k] * s
            hinge = peel_len * (0.1 + 0.9 * (v + 0.5)) if peel else -1e9
            if along < hinge:
                x, y = sx + ux * hinge + nx * s, sy + uy * hinge + ny * s
                base = surface_z(x, y) + lift
                back, up = _peeled(hinge, along, peel)
                row.append(bm.verts.new((*place(x - ux * back, y - uy * back), base + units(up))))
                continue
            x, y = sx + ux * along + nx * s, sy + uy * along + ny * s
            z = surface_z(x, y) + lift
            for at, skew, height, half in folds:  # a crease: a low ridge across, a little askew
                d = along - (at + skew * s)
                z += height * math.exp(-(d / half) ** 2) * (0.6 + 0.4 * math.cos(v * 2.4))
            z += roll * max(0.0, (abs(v) * 2 - 0.55) / 0.45) ** 2
            row.append(bm.verts.new((*place(x, y), z)))
        grid.append(row)
    obj = _sheet(name, bm, grid, cols, rows)
    for m in mats:
        obj.data.materials.append(m)
    obj.modifiers["thick"].material_offset = 1
    return obj


def _sheet(name, bm, grid, cols, rows):
    """A grid of vertices as a mesh object facing the viewer, given a tape's thickness."""
    for i in range(cols):
        for j in range(rows):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if sum(p.normal.z for p in mesh.polygons) < 0:
        mesh.flip_normals()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = stage.link(bpy.data.objects.new(name, mesh))
    sol = obj.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = 0.003
    return obj


def muted_tape(grille_at):
    """Two strips 30 units wide and about 105 long (4 CSS px by 14 at a 127 px camera), crossed over the grille
    and clear of the readout's bezel (x 100). The upper strip's torn end (the lamp's side) has come unstuck and
    lifted, its glue side catching the light; the other strip's lower end lies flat over the thumbs' rub."""
    gx, gy = grille_at
    mats = gaffer()
    tape_strip("tape-a", (gx - 60, gy - 30), (gx + 32, gy + 24), 30, mats, seed=3, creases=3, roll=0.0032,
               peel=2.6, peel_len=30.0)
    tape_strip("tape-b", (gx - 58, gy + 30), (gx + 32, gy - 24), 30, mats, lift=0.0065, seed=7, creases=4,
               roll=0.0032)


def colour_tab(start=(-75, 52), end=(52, -72), width=26, rows=7, cols=90, lift=0.0025):
    """A tab of vinyl tape wrapped over the case's top-left corner, rendered white: the player's colour. Cut clean
    (vinyl tape is cut from a roll, not torn). Vertices past the case's edge drop behind it, as tape wrapped
    round."""
    vinyl = plain("vinyl", (0.85, 0.85, 0.85), rough=0.38)
    sx, sy = start
    ex, ey = end
    length = math.hypot(ex - sx, ey - sy)
    ux, uy = (ex - sx) / length, (ey - sy) / length
    nx, ny = -uy, ux
    bm = bmesh.new()
    grid = []
    for i in range(cols + 1):
        row = []
        for j in range(rows + 1):
            s = (j / rows - 0.5) * width
            along = i / cols * length
            x, y = sx + ux * along + nx * s, sy + uy * along + ny * s
            row.append(bm.verts.new((*place(x, y), surface_z(x, y) + lift)))
        grid.append(row)
    obj = _sheet("colour-tape", bm, grid, cols, rows)
    obj.data.materials.append(vinyl)
    return obj
