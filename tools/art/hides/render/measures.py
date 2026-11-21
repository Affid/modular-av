"""The theme's measures (../measures.json, shared with the drawn pictures), and where a scene reads and writes.

A scene is run by Blender, headless:
    blender --background --factory-startup --python <scene>.py -- --out <folder> --textures <folder>
`pnpm art:hides:render` does that for every scene.

The scenes stand in the scrolls theme's studio (../../scrolls/render: studio, pixels, shapes, materials). Those
modules ask for `measures` by name and find this one, because a scene puts its own folder first on the path.
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
# Tile units to a scene unit, and a frame picture's pixels to a tile unit.
SCALE = MEASURES["unitsPerMetre"]
DENSITY = MEASURES["frameDensity"]
# The hide and its poles, and the paint on it, in tile units.
HIDE = MEASURES["hide"]
PAINT = MEASURES["paint"]


def place(x, y):
    """A point of the tile, in the scene: the frame layer's middle is the scene's."""
    return ((x - (VIEW["x"] + VIEW["w"] / 2)) / SCALE, -(y - (VIEW["y"] + VIEW["h"] / 2)) / SCALE)


def frame_pixels():
    """The size of a picture that fills the frame layer."""
    return int(VIEW["w"] * DENSITY), int(VIEW["h"] * DENSITY)


def pixel(x, y):
    """A point of the tile, in such a picture's pixels."""
    return round((x - VIEW["x"]) * DENSITY), round((y - VIEW["y"]) * DENSITY)


def picture(name):
    """A picture with a size of its own on screen: its width and height in its own pixels."""
    spec = MEASURES["pictures"][name]
    return round(spec["width"] * spec["density"]), round(spec["height"] * spec["density"])


def span(name):
    """How many scene units across such a picture is."""
    return MEASURES["pictures"][name]["span"]


def _argument(name):
    own = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if name not in own or own.index(name) + 1 >= len(own):
        raise SystemExit(f"{os.path.basename(sys.argv[0])}: {name} <folder> is needed after --")
    return own[own.index(name) + 1]


def out(name):
    """The file a scene writes a picture to. The war paint's daubs are there too, drawn before the scenes run."""
    return os.path.join(_argument("--out"), name + ".png")


def texture(name):
    """A file fetched for the scenes (CC0; see ../textures.ts): a photographed texture, or the scanned skull."""
    return os.path.join(_argument("--textures"), name)
