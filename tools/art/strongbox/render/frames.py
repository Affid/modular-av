"""Every camera's window: each of the three locks in each of five states, one picture over the frame layer each.

  rest    the keyhole's cover pushed aside, the keyhole dark
  speak   the box's lamp lit: amber through the keyhole, warm on the strap's inner bevel and the lock's chamfer
  muted   the cover down, the iron shutter slid down to the picture's margin, the hasp folded over the lock and a
          padlock hung on its staple
  deaf    a rag of grey wool stuffed into the keyhole, a torn corner hanging over the plate
  out     the lock forced: the plate prised off its lower fixing and hanging askew, the strap's own keyhole bare,
          bright gouges in the strap where the bar went in (the slide lock's slide sprung and a guide bent too)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402  (first: the paths)

import bpy  # noqa: E402

import materials  # noqa: E402
import states  # noqa: E402
import window  # noqa: E402
from measures import KEYHOLE, LOCKS, STATES, option, out, place  # noqa: E402

SEED = 7


def iron_for(lock, state):
    """The strap's iron, and the plate's: scratched round the keyhole where picks slipped; out of the call, the
    strap gouged bright where a bar went in."""
    strap_marks = None
    if state == "out":
        gx, gy = place(*states.GOUGES[lock])
        path = window.pry_marks(out(f"marks-pry-{lock}"), SEED + 3)
        strap_marks = (path, gx - 0.75, gy - 0.75, 1.5)
    metal = materials.iron("iron", tone=0.032, scale=0.32, hammer=0.5, facet_scale=5.5, rub=0.12, rub_bright=0.18,
                           marks=strap_marks, mark_bright=0.5)
    kx, ky = place(*KEYHOLE)
    picks = window.pick_marks(out("marks-pick"), SEED)
    plate = materials.iron("plate-iron", tone=0.034, scale=0.32, hammer=0.35, offset=(0.3, 0.1, 0), rub=0.12,
                           rub_bright=0.2, edge_width=0.025, marks=(picks, kx - 0.8, ky - 0.8, 1.6))
    return metal, plate


def build(lock, state):
    """The scene of one window; returns it and its shadow catcher."""
    scene = stage.stage(samples=220, ceiling=False)
    stage.frame_camera(scene)
    catcher = stage.catcher_round_middle(band=20.0)
    metal, plate_iron = iron_for(lock, state)
    lit = state == "speak"
    band = window.strap(metal, SEED)
    window.rivets(metal, SEED)
    before = set(bpy.data.objects)
    plate = window.escutcheon(lock, band, window.lamp_glow() if lit else materials.black(), lit, plate_iron)
    pieces = states.cover(lock, metal, state == "muted")
    if state == "out":
        if lock == "slide":
            states.spring_slide(pieces)
        group = [o for o in bpy.data.objects if o not in before and o.name not in ("keycut", "lock-dark")]
        states.force_lock(lock, group, plate)
    if state == "deaf":
        states.rag_plug(SEED + 11)
    if state == "muted":
        sheet = materials.iron("sheet", tone=0.075, scale=0.32, hammer=0.25, metallic=0.65, dull=0.05, rub=0.16,
                               rub_bright=0.22, facet_scale=4.0)
        lip = materials.iron("lip", tone=0.08, scale=0.5, hammer=0.1, rub=0.4, rub_bright=0.5, edge_width=0.06)
        states.shutter(sheet, lip)
        states.hasp_and_padlock(metal, lip)
    if lit:
        window.speak_light(scene)
    return scene, catcher


def main():
    only = option("--only")
    for lock in LOCKS:
        for state in STATES:
            name = f"frame-{lock}-{state}"
            if only and name not in only.split(","):
                continue
            scene, catcher = build(lock, state)
            stage.finish_frame(scene, catcher, name)


main()
