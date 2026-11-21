"""The desk's top: dark wood, its grain running across. A picture that repeats down and across the dock.

One whole repeat of the wood each way, so its edges meet. Rendered with a margin that is cut off afterwards:
at a picture's very edge the denoiser has nothing to go by, and the edges would not meet as well.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths

from materials import DESK_REPEAT, desk_wood
from measures import out, picture, span
from pixels import load_rgba, save_rgba
from shapes import ground
from studio import camera, render, reset, room

# Pixels rendered past each edge, and cut off.
MARGIN = 60

width, height = picture("desk")
across = span("desk")
if across != DESK_REPEAT or width != height:
    raise SystemExit(f"The desk's picture must be one repeat of its wood each way: {DESK_REPEAT} units, square")
scene = reset()
room(scene)
camera(scene, width + 2 * MARGIN, height + 2 * MARGIN, across * (width + 2 * MARGIN) / width)
ground(scene, desk_wood())
scene.render.image_settings.color_mode = "RGB"
path = out("desk")
render(scene, path)
save_rgba(load_rgba(path)[MARGIN:-MARGIN, MARGIN:-MARGIN], path)
