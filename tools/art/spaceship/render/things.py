"""What hangs on the bare bulkhead under the cameras, one picture each, lit like the wall (kit.py has the stage):

  extinguisher  in its strapped wall bracket, its saddle on the rail (things_extinguisher.py, things_bracket.py)
  clipboard     on a peg through its hanging hole, a cargo manifest under its clip (manifest.py)
  wrench        a 13 mm combination wrench on a peg through its ring
  tape          a roll of the grey gaffer tape that crosses a muted monitor's grille, on a peg (things_tape.py)
  rail          the tool rail they all hang from: the stylesheet lays one under each column of things

The stylesheet shows more of them as more room is left under the cameras (measures.json `fill`). Each picture's
hanging point is printed (STUD, in CSS px): it is where the stylesheet puts the rail's middle. The models are Poly
Haven's CC0 glTFs, fetched with the textures (../textures.ts).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402,F401  (first: the paths)

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from kit import (BACK, CSS_PER_M, RAIL_H, RAIL_T, bolt_head, bounds, box, finish, frame,  # noqa: E402
                 hole_top, import_model, move, stud, thing_stage)
from manifest import manifest  # noqa: E402
from measures import option  # noqa: E402
from things_extinguisher import extinguisher  # noqa: E402
from things_label import make_label  # noqa: E402
from things_paint import clip_steel, rail_paint, tame  # noqa: E402
from things_tape import tape  # noqa: E402

RAIL_LENGTH = 124 / CSS_PER_M  # a rail's bar: wide enough for a column's things, clear of the wall's seams
PEG_BOX = (-0.044, 0.044, -RAIL_H / 2, RAIL_H / 2)  # the rail behind a thing hung on a peg (x0, x1, y0, y1)
CLIP_SCALE = 0.95
RAIL_SHADOW_M = 0.012  # a bar 6 mm proud casts a short shadow


def wrench():
    """Poly Haven's combination wrench, cut down to a 13 mm's 22 cm, hung by its ring end."""
    obj = import_model("combination_wrench", scale=0.65, rot=(0, 0, 180))
    tame(obj.data.materials[0], sat=0.9, val=0.95, rough_min=0.26)
    lo, hi = bounds(obj)
    move(obj, (0, 0, BACK - lo[2]))
    lo, hi = bounds(obj)
    top = hole_top((0.0, hi[1] - 0.019 * 0.65, (lo[2] + hi[2]) / 2))
    pin_r = 0.003
    move(obj, (-top.x, pin_r - top.y, 0))
    lo, hi = bounds(obj)
    stud(0, 0, hi[2] + 0.003, pin_r, rail_paint(), head=1.7)
    print("RING TOP", tuple(round(v, 4) for v in top))
    return (min(lo[0], -0.01), lo[1], max(hi[0], 0.01), max(hi[1], 0.01)), (0.0, 0.0)


def _empty_patches(empty, nx, ny):
    """The connected patches of empty points, each with whether it touches the search box's edge."""
    seen = set()
    for j in range(ny):
        for i in range(nx):
            if not empty[j][i] or (i, j) in seen:
                continue
            stack, comp, edge = [(i, j)], [], False
            seen.add((i, j))
            while stack:
                a, b = stack.pop()
                comp.append((a, b))
                edge |= a in (0, nx - 1) or b in (0, ny - 1)
                for c, d in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                    if 0 <= c < nx and 0 <= d < ny and empty[d][c] and (c, d) not in seen:
                        seen.add((c, d))
                        stack.append((c, d))
            yield comp, edge


def find_hole(x0, x1, y0, y1, z_min, step=0.0004):
    """The clip's hanging hole: points over the tab whose ray from the front meets nothing of it (or only the
    board behind), in one patch not touching the search box's edge. Returns its centre, half its width and the y
    of its top edge, which rests on the peg."""
    deps = bpy.context.evaluated_depsgraph_get()
    nx, ny = int((x1 - x0) / step), int((y1 - y0) / step)
    empty = [[False] * nx for _ in range(ny)]
    for j in range(ny):
        for i in range(nx):
            x, y = x0 + (i + 0.5) * step, y0 + (j + 0.5) * step
            hit, loc, *_ = bpy.context.scene.ray_cast(deps, Vector((x, y, 1)), Vector((0, 0, -1)))
            empty[j][i] = (not hit) or loc.z < z_min
    best = None
    for comp, edge in _empty_patches(empty, nx, ny):
        if not edge and (best is None or len(comp) > len(best)):
            best = comp
    if not best:
        raise SystemExit("no hanging hole found in the clip")
    xs = [x0 + (a + 0.5) * step for a, _ in best]
    ys = [y0 + (b + 0.5) * step for _, b in best]
    return (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (max(xs) - min(xs) + step) / 2, max(ys) + step / 2


def clipboard():
    """Poly Haven's clipboard: the board a dull brown hardboard (its own pink-brown turned toward yellow, less
    saturated), its normal map dropped (it embosses the model's mock brand), the clip in its own dark steel; hung
    by its hanging hole, the hole's top edge on the peg; the manifest under the clip."""
    s = CLIP_SCALE
    obj = import_model("clipboard", scale=s)
    mat = obj.data.materials[0]
    hue = tame(mat, sat=0.55, val=0.7, rough_min=0.34, drop_normal=True)
    hue.inputs["Hue"].default_value = 0.5 + 0.025
    lo, hi = bounds(obj)
    move(obj, (0, 0, BACK - lo[2]))
    lo, hi = bounds(obj)
    hx, hy, hr, htop = find_hole(-0.017 * s, 0.017 * s, 0.140 * s, hi[1] + 0.001, lo[2] + 0.0052)
    print("HOLE", round(hx, 4), round(hy, 4), "r", round(hr, 4), "top", round(htop, 4))
    pin_r = min(0.0022, hr * 0.7)
    dy = pin_r - htop
    move(obj, (-hx, dy, 0))
    board_top = BACK + 0.005 * s
    clip_steel(mat, board_top + 0.0001, y_min=0.130 * s + dy - 0.016, lip=-0.0582)
    lo, hi = bounds(obj)
    manifest(-0.100, 0.100, 0.130 * s + dy, lo[1] + 0.012, board_top)
    stud(0, 0, board_top + 0.004, pin_r, rail_paint(), head=1.8)
    return (lo[0], lo[1], hi[0], max(hi[1], 0.008)), (0.0, 0.0)


def rail():
    """The tool rail: a flat bar painted a shade darker than the sheet, riveted at both ends. Pegs are welded on
    where things hang; they come with each thing's picture."""
    mat = rail_paint()
    box("rail", (0, 0, RAIL_T / 2), (RAIL_LENGTH, RAIL_H, RAIL_T), mat, bevel=0.0016)
    for x in (-RAIL_LENGTH / 2 + 0.0085, RAIL_LENGTH / 2 - 0.0085):
        bolt_head("rivet", x, 0.0, mat, radius=0.0043).location.z = RAIL_T - 0.0004
    return (-RAIL_LENGTH / 2, -RAIL_H / 2, RAIL_LENGTH / 2, RAIL_H / 2), (0.0, 0.0)


def render_extinguisher():
    make_label()
    scene = thing_stage()
    extent, hang = extinguisher()
    rail_y = hang[1] - 0.003  # the rail runs behind the saddle, beside the back plate
    rail_boxes = [(-0.075, -0.0265, rail_y - RAIL_H / 2, rail_y + RAIL_H / 2),
                  (0.0265, 0.075, rail_y - RAIL_H / 2, rail_y + RAIL_H / 2)]
    finish(scene, frame(scene, "extinguisher", extent, hang, rail_y, rail_boxes), "extinguisher")


def render_hung(name, make, rail_boxes):
    scene = thing_stage()
    extent, hang = make()
    finish(scene, frame(scene, name, extent, hang, 0.0, rail_boxes), name)


def render_rail():
    scene = thing_stage()
    extent, hang = rail()
    finish(scene, frame(scene, "rail", extent, hang, 0.0, [], shadow=RAIL_SHADOW_M), "rail")


def main():
    only = option("--only")
    pictures = (
        ("extinguisher", render_extinguisher),
        ("clipboard", lambda: render_hung("clipboard", clipboard, [PEG_BOX])),
        ("wrench", lambda: render_hung("wrench", wrench, [PEG_BOX])),
        ("tape", lambda: render_hung("tape", tape, [])),  # the tape draws the rail inside its hole itself
        ("rail", render_rail),
    )
    for name, make in pictures:
        if not only or name in only.split(","):
            make()


main()
