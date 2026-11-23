"""Every camera's monitor, one picture over the frame layer for each state, for the other players' monitors
(monitor-*: the right strip plain) and the viewer's own (own-*: the level's window in the strip):

  rest    the TX lamp's jewel dark
  speak   the TX lamp lit: green through the jewel, on the paint round it, a gleam on the readout's glass
  muted   two strips of gaffer tape crossed over the microphone's grille
  deaf    the headset taken off and hung on its bracket low on the right bezel, its cord down to the jack
  mdeaf   muted and deafened

Also the readout's window cut out of the other players' resting and speaking frames (readout-rest,
readout-speak: the name bar's background), and the player's colour layer (colour-tape: a vinyl tab over the
case's top-left corner, white, laid over every frame and tinted by the stylesheet).

    blender --background --python frames.py -- --out <folder> --textures <folder> [--only monitor-rest,own-deaf]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stage  # noqa: E402  (first: the paths)

import case  # noqa: E402
import gaffer  # noqa: E402
import headset  # noqa: E402
import monitor_finish as finish  # noqa: E402
import readout  # noqa: E402
import tube  # noqa: E402
from measures import STATES, option  # noqa: E402

SAMPLES = 200
EXPOSURE = 0.7
SIDES = (("monitor", False), ("own", True))  # the picture's prefix; the level's window in the strip


def build(own, state):
    """The scene of one monitor in one state; returns it."""
    scene = stage.stage(samples=SAMPLES, exposure=EXPOSURE)
    scene.cycles.film_transparent_glass = True  # the camera's picture shows through the tube's glass
    stage.frame_camera(scene)
    lit = state == "speak"
    paint = case.case_material()
    case.case_mesh(paint, slot=own)
    case.gasket()
    tube.tube_glass()
    tube.work_lamp_reflection()
    case.lamp(lit)
    case.grille(paint)
    readout.readout(lit)
    if own:
        readout.level_window()
    case.screws()
    if state in ("deaf", "mdeaf"):
        headset.hang(case.RIGHT)
    if state in ("muted", "mdeaf"):
        gaffer.muted_tape(case.GRILLE)
    return scene


def wanted(names):
    only = option("--only")
    return not only or any(name in only.split(",") for name in names)


def main():
    for prefix, own in SIDES:
        for state in STATES:
            name = f"{prefix}-{state}"
            window = f"readout-{state}" if prefix == "monitor" and state in ("rest", "speak") else None
            if not wanted([name, window]):
                continue
            scene = build(own, state)
            catcher = stage.catcher(case.BACK_Z - 0.01, band=30)
            whole = finish.finish(scene, catcher, name)
            if window:
                finish.window(whole, window)
    if wanted(["colour-tape"]):
        scene = build(False, "rest")
        gaffer.colour_tab()
        finish.colour_layer(scene, "colour-tape")


main()
