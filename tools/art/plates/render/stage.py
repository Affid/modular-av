"""The stage for what has a size of its own on screen and lies or hangs on the mail: the scrolls theme's room and
light, a ground that only catches shadows where the mail's rings stand, and a shadow kept close to its thing."""
import numpy as np

from measures import UNIT_PX, out, picture, spec
from pixels import clean, load_rgba, save_rgba, soften
from shapes import ground
from studio import camera, render, reset, room

# The mail's rings stand about this high over the cloth, in scene units.
MAIL_TOP = 0.1


def start(name, samples=220):
    """An empty scene for the picture called `name`, seen from in front. Returns it and its ground."""
    scene = reset()
    room(scene, exposure=0.5)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.cycles.samples = samples
    camera(scene, *picture(name), spec(name)["width"] / UNIT_PX)
    floor = ground(scene, catcher=True)
    floor.location.z = MAIL_TOP
    scene.render.film_transparent = True
    return scene, floor


def close_shadow(scene, floor, path, near):
    """Renders the scene to `path`: the thing and its shadow, the shadow kept only within about `near` pixels of
    the thing. Further off the catcher's pale veil would lie on the ground as a stain."""
    render(scene, path)
    whole = clean(load_rgba(path), floor=0.03)
    floor.hide_render = True
    scene.cycles.samples = 32
    render(scene, path)
    own = load_rgba(path)[..., 3]
    close = np.clip(soften(own, near) * 3.0, 0.0, 1.0)
    whole[..., 3] = np.maximum(own, whole[..., 3] * close)
    floor.hide_render = False
    return whole


def finish(scene, floor, name, near):
    """Writes the picture called `name`; `near` is in CSS pixels."""
    path = out(name)
    save_rgba(close_shadow(scene, floor, path, round(near * spec(name)["density"])), path)


def half_size(name):
    """Half the picture's width and height, in scene units."""
    own = spec(name)
    return own["width"] / UNIT_PX / 2, own["height"] / UNIT_PX / 2
