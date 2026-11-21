"""Sums done on rendered pictures: opening the scroll where the camera shows, shadows as pictures, glows."""
import os

import bpy
import numpy as np

from studio import render_linear


def load_rgba(path):
    image = bpy.data.images.load(path)
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    bpy.data.images.remove(image)
    return pixels


def save_rgba(pixels, path):
    height, width, _ = pixels.shape
    image = bpy.data.images.new("out", width, height, alpha=True)
    image.alpha_mode = "STRAIGHT"
    image.pixels.foreach_set(np.clip(pixels, 0, 1).astype(np.float32).ravel())
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)
    print("SAVED", path)


def soften(alpha, radius, passes=3):
    """A blur by repeated averaging over a box: near enough to a Gaussian for a glow."""
    out = alpha.astype(np.float32)
    for _ in range(passes):
        for axis in (0, 1):
            padded = np.pad(out, [(radius + 1, radius) if a == axis else (0, 0) for a in (0, 1)], mode="constant")
            total = np.cumsum(padded, axis=axis)
            size = out.shape[axis]
            upper = np.take(total, range(2 * radius + 1, 2 * radius + 1 + size), axis=axis)
            lower = np.take(total, range(0, size), axis=axis)
            out = (upper - lower) / (2 * radius + 1)
    return out


def luminance(pixels):
    return pixels[..., 0] * 0.2126 + pixels[..., 1] * 0.7152 + pixels[..., 2] * 0.0722


def _fade_shadows(pixels, margin):
    """Shadows that reach the picture's edge fade out before it, over `margin` pixels: cut off square they would
    show as a box on a light ground. A shadow is what the shadow catcher left: black, and partly clear."""
    height, width, _ = pixels.shape
    down = np.minimum(np.arange(height), np.arange(height)[::-1])[:, None]
    across = np.minimum(np.arange(width), np.arange(width)[::-1])[None, :]
    ramp = np.clip(np.minimum(down, across) / margin, 0.0, 1.0)
    shadow = (pixels[..., :3].max(axis=2) < 0.04) & (pixels[..., 3] < 0.98)
    return np.where(shadow, pixels[..., 3] * ramp, pixels[..., 3])


def clean(pixels, hole=None, floor=0.1, feather=5, shadow_fade=0):
    """A render's edges put right: the shadow catcher's faint veil dropped, shadows faded out before the picture's
    edge, and a hole opened with a soft edge where the camera's picture shows through (in pixels: x0, y0, x1, y1
    from the top left)."""
    height, width, _ = pixels.shape
    alpha = _fade_shadows(pixels, shadow_fade) if shadow_fade else pixels[..., 3]
    alpha = np.where(alpha < floor, 0.0, alpha)
    if hole:
        x0, y0, x1, y1 = hole
        opening = np.zeros((height, width), dtype=np.float32)
        opening[height - y1:height - y0, x0:x1] = 1.0  # rows run from the bottom up
        alpha = alpha * (1.0 - soften(opening, feather))
    pixels[..., 3] = alpha
    return pixels


def shadow_only(scene, casters, plane, path):
    """The casters' shadow on what they lie on, as a picture to lay over it: black, as strong as the shadow is deep."""
    for obj in casters:
        obj.visible_camera = False
    plane.visible_camera, plane.is_shadow_catcher = True, False
    scene.render.film_transparent = False
    lit = render_linear(scene, path + ".with.exr")
    for obj in casters:
        obj.hide_render = True
    bare = render_linear(scene, path + ".bare.exr")
    for obj in casters:
        obj.hide_render, obj.visible_camera = False, True
    ratio = luminance(lit) / np.maximum(luminance(bare), 1e-4)
    shadow = np.zeros((*ratio.shape, 4), dtype=np.float32)
    # Soft and light: a stone is small and the light is far, and a heavy shadow would say otherwise.
    shadow[..., 3] = np.clip(((1.0 - ratio) - 0.03) * 0.55, 0, 1)
    save_rgba(shadow, path)
    for leftover in (".with.exr", ".bare.exr"):
        os.remove(path + leftover)
