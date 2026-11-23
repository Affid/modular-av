"""The stage of the things hung on the bulkhead, and what every one of them is put together with.

A thing is seen straight on at 2 picture pixels per CSS pixel. The wall is the plane z = 0, a shadow catcher; the
viewer is on +z and screen up is +y. The sun is the one the wall and the monitors have (the hold's work lamp, from
the upper left, in front), so a thing's shadow falls on the dock's own wall the way the wall's rivets' do.

Scale, in metres: 550 CSS px to the metre (a 47 cm monitor case is the dock's 258 px camera), so 1100 picture px.

Everything hangs from a tool rail: a painted flat bar riveted to the sheet, 9 CSS px tall and 6 mm proud of it. A
peg welded to the rail's face takes the tape's core, the wrench's ring or the clipboard's hanging hole; the
extinguisher's saddle sits on it. The rail is its own picture; in a thing's scene it is part of the shadow catcher,
so the thing's shadow lands on the rail's face where the rail is.

The models are Poly Haven's CC0 glTFs (../textures.ts), read as data only: no code in them runs.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from measures import out, picture, texture
from pixels import save_rgba
from stage import keep_close, link, render, stage

PX_PER_M = 1100.0
CSS_PER_M = PX_PER_M / 2
FEATHER_PX = 14  # picture px over which a kept shadow fades to nothing at the picture's edge
MARGIN_M = 16 / PX_PER_M  # room round a thing in its picture
SHADOW_M = 0.03  # room for the shadow, which falls down and to the right
SAMPLES, EXPOSURE = 256, 0.85
NEAR_PX = 14  # how far a shadow is kept from what casts it

RAIL_T, RAIL_H = 0.006, 0.0165  # the tool rail: a painted flat bar riveted to the sheet, 9 CSS px tall
BACK = RAIL_T + 0.0005  # a hung thing's back: resting on the rail's face


def thing_stage():
    """The room every rendered picture of the theme shares, its film clear round the thing."""
    scene = stage(samples=SAMPLES, exposure=EXPOSURE)
    scene.render.film_transparent = True
    return scene


def import_model(asset, scale=1.0, rot=(0.0, 0.0, 0.0)):
    """A fetched Poly Haven glTF, joined into one object, scaled and turned, its transforms applied. glTF's +Y up
    arrives as Blender's +Z; `rot` (degrees, XYZ) turns it after that."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=texture(f"{asset}/{asset}_2k.gltf"))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    for o in new:
        if o is not obj and o.name in bpy.data.objects:
            bpy.data.objects.remove(o)
    obj.rotation_mode = "XYZ"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.scale = (scale, scale, scale)
    obj.rotation_euler = tuple(math.radians(a) for a in rot)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = asset
    return obj


def bounds(obj):
    """The lowest and highest corner of an object's mesh, in the world."""
    vs = np.array([v.co[:] for v in obj.data.vertices])
    m = np.array(obj.matrix_world)
    vs = vs @ m[:3, :3].T + m[:3, 3]
    return vs.min(axis=0), vs.max(axis=0)


def move(obj, d):
    obj.location = (obj.location[0] + d[0], obj.location[1] + d[1], obj.location[2] + d[2])
    bpy.context.view_layer.update()


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def rod(name, points, radius, mat, bevel_res=6):
    """A bent steel rod through points (metres)."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = bevel_res
    curve.use_fill_caps = True
    sp = curve.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p, c in zip(sp.points, points):
        p.co = (*c, 1)
    obj = link(bpy.data.objects.new(name, curve))
    obj.data.materials.append(mat)
    return obj


def box(name, at, size, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = obj.modifiers.new("bevel", "BEVEL")
        b.width, b.segments = bevel, 3
        b.limit_method = "ANGLE"
    obj.data.materials.append(mat)
    return obj


def bolt_head(name, x, y, mat, radius=0.0055):
    """A dome-headed bolt (or rivet) through the sheet."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=24, ring_count=12, location=(x, y, 0))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (1, 1, 0.45)
    smooth(obj)
    obj.data.materials.append(mat)
    return obj


def stud(x, y, reach, r, mat, head=1.9):
    """A steel peg welded to the tool rail's face at (x, y), out `reach` from the wall, ending in a domed head
    `head` times its radius that keeps what hangs on it from sliding off; a weld bead at its root. Painted over
    with the rail."""
    rod("stud", [(x, y, RAIL_T), (x, y, reach)], r, mat, bevel_res=5)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r * head, segments=32, ring_count=16, location=(x, y, reach))
    dome = bpy.context.active_object
    dome.name = "stud-head"
    dome.scale = (1, 1, 0.42)
    dome.data.materials.append(mat)
    bpy.ops.mesh.primitive_torus_add(major_radius=r + 0.0007, minor_radius=0.0013, location=(x, y, RAIL_T + 0.0006))
    weld = bpy.context.active_object
    weld.name = "weld"
    weld.data.materials.append(mat)
    smooth(dome)
    smooth(weld)


def hole_top(start, direction=(0, 1, 0)):
    """Where a ray from inside a hole meets its edge: the point the thing rests on."""
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    hit, loc, *_ = bpy.context.scene.ray_cast(deps, Vector(start), Vector(direction))
    if not hit:
        raise SystemExit(f"no edge found from {start}")
    return loc


def revolve(name, profile, steps=160):
    """A solid of revolution round the z axis from a closed (radius, z) profile."""
    bm = bmesh.new()
    verts = [bm.verts.new((rad, 0.0, z)) for rad, z in profile]
    edges = [bm.edges.new((verts[i], verts[(i + 1) % len(verts)])) for i in range(len(verts))]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.radians(360), steps=steps,
                   use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return smooth(obj)


def camera_over(scene, x0, y0, x1, y1):
    """An orthographic camera straight at the wall over the box (metres), rounded out to whole pixels."""
    w = int(math.ceil((x1 - x0) * PX_PER_M / 2)) * 2
    h = int(math.ceil((y1 - y0) * PX_PER_M / 2)) * 2
    data = bpy.data.cameras.new("camera")
    data.type = "ORTHO"
    data.sensor_fit = "HORIZONTAL"
    data.ortho_scale = w / PX_PER_M
    data.clip_end = 50
    cam = bpy.data.objects.new("camera", data)
    cam.location = (x0 + w / PX_PER_M / 2, y1 - h / PX_PER_M / 2, 10)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = w, h
    return (x0, y1 - h / PX_PER_M, x0 + w / PX_PER_M, y1), (w, h)


def to_px(box_m, x, y):
    """A point (metres) as picture pixels from the picture's top left."""
    x0, _, _, y1 = box_m
    return (x - x0) * PX_PER_M, (y1 - y) * PX_PER_M


def wall_catcher(rail_boxes, size=4.0):
    """The wall as a shadow catcher, with the rail behind a hung thing as part of it (boxes x0, x1, y0, y1 in
    metres), so the thing's shadow falls on the rail's face where the rail is. The rail itself casts nothing
    here: its own picture carries its shadow."""
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    catch = bpy.context.active_object
    catch.name = "wall"
    catch.is_shadow_catcher = True
    for x0, x1, y0, y1 in rail_boxes:
        bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, RAIL_T / 2))
        part = bpy.context.active_object
        part.scale = (x1 - x0, y1 - y0, RAIL_T)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bpy.ops.object.select_all(action="DESELECT")
        part.select_set(True)
        catch.select_set(True)
        bpy.context.view_layer.objects.active = catch
        bpy.ops.object.join()
    catch.is_shadow_catcher = True
    catch.visible_shadow = False
    return catch


def frame(scene, name, extent, hang, rail_y, rail_boxes, shadow=SHADOW_M):
    """The camera over a thing's extent (x0, y0, x1, y1 metres) with room for its shadow, and the wall behind
    it. Says where its hanging point and its rail are in the picture, in CSS px, for the stylesheet. The
    picture has to be the size the measures give it: the stylesheet places it by those numbers."""
    x0, y0, x1, y1 = extent
    box_m, size = camera_over(scene, x0 - MARGIN_M, y0 - MARGIN_M - shadow, x1 + MARGIN_M + shadow, y1 + MARGIN_M)
    if size != picture(name):
        raise SystemExit(f"{name}: the picture is {size}, the measures say {picture(name)}")
    catch = wall_catcher(rail_boxes)
    rx, ry = to_px(box_m, hang[0], rail_y)
    sx, sy = to_px(box_m, *hang)
    print(f"RAIL {name}: centre at {rx / 2:.1f},{ry / 2:.1f} css")
    print(f"STUD {name}: at {sx / 2:.1f},{sy / 2:.1f} css in a {size[0] / 2:.0f}x{size[1] / 2:.0f} css picture")
    return catch


def finish(scene, catch, name):
    """Render, keep the shadow close to the thing, fade what the catcher keeps out before the picture's edge (no
    box shows round a picture on the wall), and save."""
    path = out(name)
    render(scene, path)
    whole, own = keep_close(scene, catch, path, near=NEAR_PX)
    h, w = whole.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    edge = np.minimum(np.minimum(xs, w - 1 - xs), np.minimum(ys, h - 1 - ys)).astype(np.float32)
    ramp = np.clip(edge / FEATHER_PX, 0.0, 1.0) ** 1.5
    whole[..., 3] = np.maximum(own, whole[..., 3] * ramp)
    save_rgba(whole, path)
    print(f"PICTURE {name}: {w}x{h} px = {w / 2:.1f}x{h / 2:.1f} css")
