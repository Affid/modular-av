"""The theme's measures (../measures.json, shared with the stylesheet's tests), and where a scene reads and writes.

A scene is run by Blender, headless:
    blender --background --factory-startup --python <scene>.py -- --out <folder> --textures <folder>
`pnpm art:spaceship:render` does that for every scene, in the order rendered.ts lists them, into one folder: a
later scene may read what an earlier one left there (screens.py reads the frames' masks).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(HERE, "..", "measures.json"), encoding="utf-8") as source:
    MEASURES = json.load(source)

TILE_W, TILE_H = MEASURES["tile"]["width"], MEASURES["tile"]["height"]
REACH = MEASURES["reach"]
# The frame layer of a camera, in the tile's units (1000 to the picture's width, y down).
VIEW = dict(
    x=-REACH["left"] * TILE_W,
    y=-REACH["top"] * TILE_W,
    w=(1 + REACH["left"] + REACH["right"]) * TILE_W,
    h=TILE_H + (REACH["top"] + REACH["bottom"]) * TILE_W,
)
# Tile units to a scene unit; a frame picture's pixels to a tile unit.
SCALE = MEASURES["unitsPerMetre"]
DENSITY = MEASURES["frameDensity"]
# The dock's rule: nothing drawn in the middle 70% of a picture (left, top, right, bottom in tile units).
MIDDLE = (0.15 * TILE_W, 0.15 * TILE_H, 0.85 * TILE_W, 0.85 * TILE_H)
STATES = MEASURES["states"]
READOUT = MEASURES["readout"]
METER = MEASURES["meter"]


def box(b):
    """A box of the measures as (x0, y0, x1, y1), tile units."""
    return (b["left"], b["top"], b["right"], b["bottom"])


def place(x, y):
    """A point of the tile (tile units, y down) in the scene (x right, y up, the frame layer's middle at 0)."""
    return ((x - (VIEW["x"] + VIEW["w"] / 2)) / SCALE, -(y - (VIEW["y"] + VIEW["h"] / 2)) / SCALE)


def units(v):
    """Tile units as scene units."""
    return v / SCALE


def frame_pixels():
    """The size in pixels of a picture over the frame layer's box."""
    return int(round(VIEW["w"] * DENSITY)), int(round(VIEW["h"] * DENSITY))


def spec(name):
    """A picture with a size of its own on screen (CSS px), as the measures give it."""
    return MEASURES["pictures"][name]


def picture(name):
    """Its width and height in its own pixels."""
    own = spec(name)
    return round(own["width"] * own["density"]), round(own["height"] * own["density"])


def _own():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def _argument(name):
    own = _own()
    if name not in own or own.index(name) + 1 >= len(own):
        raise SystemExit(f"{os.path.basename(sys.argv[0])}: {name} <folder> is needed after --")
    return own[own.index(name) + 1]


def option(name, default=""):
    """An optional setting after --, for rendering only some pictures while working on them."""
    own = _own()
    return own[own.index(name) + 1] if name in own and own.index(name) + 1 < len(own) else default


def out(name, ext="png"):
    """The file a scene writes a picture to (or a working file another scene reads)."""
    return os.path.join(_argument("--out"), f"{name}.{ext}")


def texture(name):
    """A fetched file (CC0; see ../textures.ts)."""
    return os.path.join(_argument("--textures"), name)
