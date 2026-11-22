"""The theme's measures (../measures.json, shared with the stylesheet's tests), and where a scene reads and writes.

A scene is run by Blender, headless:
    blender --background --factory-startup --python <scene>.py -- --out <folder> --textures <folder>
`pnpm art:mirrors:render` does that for every scene, after writing the hands' mesh (mhhand.json, cut out of
MakeHuman's base mesh by ../handmesh.ts) into the out folder.

The scenes stand in the scrolls theme's studio (../../scrolls/render: studio, pixels, shapes, materials). Those
modules ask for `measures` by name and find this one, because a scene puts its own folder first on the path.
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
# Tile units to a scene unit; a frame picture's pixels to a tile unit; the light's and the scattered pane's.
SCALE = MEASURES["unitsPerMetre"]
DENSITY = MEASURES["frameDensity"]
LIGHT_DENSITY = MEASURES["lightDensity"]
PANE_DENSITY = MEASURES["paneDensity"]
# The dock's rule: nothing drawn in the middle 70% of a picture (left, top, right, bottom in tile units).
MIDDLE = (0.15 * TILE_W, 0.15 * TILE_H, 0.85 * TILE_W, 0.85 * TILE_H)
HANDS = MEASURES["hands"]
LEVEL = MEASURES["level"]
CRACK = MEASURES["crack"]


def place(x, y):
    """A point of the tile (tile units, y down) in the scene (x right, y up, the frame layer's middle at 0)."""
    return ((x - (VIEW["x"] + VIEW["w"] / 2)) / SCALE, -(y - (VIEW["y"] + VIEW["h"] / 2)) / SCALE)


def over(density):
    """The size in pixels of a picture over the frame layer's box at `density` pixels to a tile unit."""
    return int(VIEW["w"] * density), int(VIEW["h"] * density)


def spec(name):
    """A picture with a size of its own on screen, as the measures give it."""
    return MEASURES["pictures"][name]


def picture(name):
    """Its width and height in its own pixels."""
    own = spec(name)
    return round(own["width"] * own["density"]), round(own["height"] * own["density"])


def _argument(name):
    own = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if name not in own or own.index(name) + 1 >= len(own):
        raise SystemExit(f"{os.path.basename(sys.argv[0])}: {name} <folder> is needed after --")
    return own[own.index(name) + 1]


def out(name):
    """The file a scene writes a picture to."""
    return os.path.join(_argument("--out"), name + ".png")


def beside(name):
    """A file the render script put beside the pictures before the scenes ran (the hands' mesh)."""
    return os.path.join(_argument("--out"), name)


def texture(name):
    """A fetched file (CC0; see ../textures.ts)."""
    return os.path.join(_argument("--textures"), name)
