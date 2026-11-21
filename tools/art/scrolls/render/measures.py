"""The theme's measures (../measures.json, shared with the drawn pictures), and where a scene reads and writes.

A scene is run by Blender, headless:
    blender --background --factory-startup --python <scene>.py -- --out <folder> --textures <folder>
`pnpm art:scrolls:render` does that for every scene.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(HERE, "..", "measures.json"), encoding="utf-8") as source:
    MEASURES = json.load(source)

# The frame layer of a camera, in the tile's units (1000 to the picture's width), and its place in a scene.
TILE = dict(w=MEASURES["tile"]["width"], h=MEASURES["tile"]["height"])
REACH = MEASURES["reach"]
VIEW = dict(
    x=-REACH["left"] * TILE["w"],
    y=-REACH["top"] * TILE["w"],
    w=(1 + REACH["left"] + REACH["right"]) * TILE["w"],
    h=TILE["h"] + (REACH["top"] + REACH["bottom"]) * TILE["w"],
)
# Tile units to a scene unit.
SCALE = MEASURES["unitsPerMetre"]
# The stones on each of the two scrolls: x, y and radius in tile units, their turn and the facet they rest on.
STONES = MEASURES["stones"]
def place(x, y):
    """A point of the tile, in the scene: the frame layer's middle is the scene's."""
    return ((x - (VIEW["x"] + VIEW["w"] / 2)) / SCALE, -(y - (VIEW["y"] + VIEW["h"] / 2)) / SCALE)


def frame_pixels():
    """The size of a picture that fills the frame layer: a pixel to a tile unit."""
    return int(VIEW["w"]), int(VIEW["h"])


def picture(name):
    """A picture with a size of its own on screen: its width and height in its own pixels."""
    spec = MEASURES["pictures"][name]
    return spec["width"] * spec["density"], spec["height"] * spec["density"]


def span(name):
    """How many scene units across such a picture is."""
    return MEASURES["pictures"][name]["span"]


def _argument(name):
    own = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if name not in own or own.index(name) + 1 >= len(own):
        raise SystemExit(f"{os.path.basename(sys.argv[0])}: {name} <folder> is needed after --")
    return own[own.index(name) + 1]


def out(name):
    """The file a scene writes a picture to."""
    return os.path.join(_argument("--out"), name + ".png")


def texture(name):
    """A photographed texture's file (CC0; fetched by the render script, see ../textures.ts)."""
    return os.path.join(_argument("--textures"), name)
