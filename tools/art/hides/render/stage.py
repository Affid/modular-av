"""The stage the theme's things are shot on: the scrolls theme's room and light, a ground that only catches
shadows, and a stronger contrast, because these things hang on a dark wall."""
from shapes import ground
from studio import camera, reset, room


def start(width, height, across, exposure=0.6, **light):
    """An empty scene `across` units wide, seen from above, `width` by `height` pixels. Returns it and its ground."""
    scene = reset()
    room(scene, exposure=exposure, **light)
    scene.view_settings.look = "AgX - Medium High Contrast"
    camera(scene, width, height, across)
    floor = ground(scene, catcher=True)
    scene.render.film_transparent = True
    return scene, floor
