"""A paper for the header and the voice panel: a worn sheet of the same vellum, cut in nine by the stylesheet."""
import random
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True  # no __pycache__ beside the scenes: its files carry this machine's paths

from materials import vellum
from measures import out, picture, span
from pixels import clean, load_rgba, save_rgba
from shapes import ground, sheet, worn_outline
from studio import camera, render, reset, room

SEED = 31
# How far in from each side of the picture the sheet's edge is, in scene units: room for its shadow.
MARGIN = 0.24

scene = reset()
room(scene, exposure=0.6)
scene.view_settings.look = "AgX - Medium High Contrast"
width, height = picture("paper")
across = span("paper")
camera(scene, width, height, across)
ground(scene, catcher=True)
scene.render.film_transparent = True
half = across / 2 - MARGIN
page = sheet("paper", worn_outline(random.Random(SEED), -half, -half, half, half, step=0.28, wave=0.022, nick=0.07), z=0.012)
page.data.materials.append(vellum("vellum", span=5.0, box=(-half, -half, half, half), edge=0.22))
path = out("paper")
render(scene, path)
save_rgba(clean(load_rgba(path), floor=0.08, shadow_fade=12), path)
