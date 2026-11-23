"""The bracket a deafened player's headset hangs on: a zinc-plated foot plate screwed to the bezel's flat strip
beside the tube, low on the right (below the dock's top-right controls: the menu button reaches y 252 at a 127 px
camera, one badge 170), and from it a bent steel rod with a J the band sits in. At the same place on every
monitor; on the viewer's own, left of the level's window.

Places are tile units (x right, y down); depths scene units, toward the viewer positive.
"""
import math

import bpy
from mathutils import Vector

from measures import place, units
from monitor_shapes import poly_curve
from paint import plain

FOOT_X = 998.0  # the foot plate's middle, across
ARM_Y = 356.0  # where the rod leaves the plate, down: low enough for the cups to clear the middle box's corner
HANG_X = 936.0  # where the band hangs on the rod
YAW = 25.0  # the rod's forward run turned this many degrees to the left, so its run shows seen straight on
ROD_R = 4.0  # the rod's radius (2 px at a 258 px camera, 1 px at 127)
J_TIP = 14.0  # the J's upturn above its bend: long enough that its end reads
# Where the paint round the foot is worn (cx, cy, rx, ry): the band and the right cup knock the bezel there,
# hung up every shift (wear.py).
FOOT_WEAR = (FOOT_X, ARM_Y + 14, 16.0, 40.0)


def _foot(heights):
    """The foot: a small plate laid on the bezel's slope (fitted to it), one screw through its lower half. Returns
    the plate's face depth at its middle (tile units, as the rod is worked)."""
    zinc = plain("hk-zinc", (0.36, 0.37, 0.36), rough=0.42, metallic=1.0)
    py0, py1, t = ARM_Y - 7.0, ARM_Y + 34.0, 2.2
    xa, xb = FOOT_X - 6.5, FOOT_X + 6.5
    za = sum(heights.at(xa + 1.0, y) for y in (py0, ARM_Y + 14, py1)) / 3
    zb = sum(heights.at(xb - 1.0, y) for y in (py0, ARM_Y + 14, py1)) / 3
    slope = math.atan2((zb - za) * 100.0, (xb - xa) - 2.0)
    width = (xb - xa) / math.cos(slope)
    zc = (za + zb) / 2 + units(t / 2 + 0.6)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(*place(FOOT_X, (py0 + py1) / 2), zc))
    plate = bpy.context.active_object
    plate.name = "hk-plate"
    plate.scale = (units(width), units(py1 - py0), units(t))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    plate.rotation_euler.y = -slope
    bev = plate.modifiers.new("bevel", "BEVEL")
    bev.width, bev.segments, bev.limit_method = units(1.0), 3, "NONE"
    plate.data.materials.append(zinc)
    for p in plate.data.polygons:
        p.use_smooth = True
    _screw(plate, ARM_Y + 22.0 - (py0 + py1) / 2, t)
    print("BRACKET plate face z", round((zc + units(t / 2)) * 100.0, 1), "slope", round(math.degrees(slope)))
    return (zc + units(t / 2)) * 100.0


def _screw(plate, below, t):
    """A domed screw head with its slot, `below` tile units under the plate's middle."""
    head = plain("hk-screw", (0.3, 0.3, 0.29), rough=0.35, metallic=1.0)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=units(4.4), segments=32, ring_count=16)
    sc = bpy.context.active_object
    sc.name = "hk-screwhead"
    sc.scale = (1, 1, 0.4)
    sc.data.materials.append(head)
    for p in sc.data.polygons:
        p.use_smooth = True
    sc.parent = plate
    sc.location = (0.0, -units(below), units(t / 2))
    slot = plain("hk-slot", (0.02, 0.02, 0.02), rough=0.8)
    bpy.ops.mesh.primitive_cube_add(size=1)
    sl = bpy.context.active_object
    sl.name = "hk-screwslot"
    sl.scale = (units(6.5), units(1.3), units(1.2))
    sl.rotation_euler.z = 0.5
    sl.data.materials.append(slot)
    sl.parent = plate
    sl.location = (0.0, -units(below), units(t / 2 + 1.5))


def bracket(z_hang, z_front, heights, z_arm=-0.08):
    """The bracket: its foot, and the rod from the foot's top left along the tube's margin behind where the band
    hangs (`z_arm`, scene units), then forward through the band's arch and up into a J in front of the band.
    `z_hang`: where the band's middle plane crosses the run, `z_front`: where the run turns up (scene z).
    Returns the J's tip (tile x, y)."""
    # the rod in a dull zinc grey like the plate, not mirror-like, so its run inside the band's arch doesn't take
    # the yellow case's colour (it rendered beige)
    steel = plain("hk-steel", (0.25, 0.255, 0.25), rough=0.5, metallic=0.55)
    r = ROD_R
    yaw = math.radians(YAW)
    z_plate = _foot(heights)
    # the rod, worked in tile units for x, y and z alike (z converted at the end)
    za_t = z_arm * 100.0
    rb, rj = 7.0, 6.0  # the bends' radii
    th1 = math.pi / 2 - yaw  # the forward bend turns the heading from -x to (-sin yaw, +cos yaw)
    ez = za_t + rb * (1 - math.cos(th1))
    t_h = (z_hang * 100.0 - ez) / math.cos(yaw)
    xb = HANG_X + t_h * math.sin(yaw) + rb * math.sin(th1)
    ex = xb - rb * math.sin(th1)
    pts = [(FOOT_X + 1.0, ARM_Y, z_plate + r - 2.0), (FOOT_X - 2.0, ARM_Y, (z_plate + r + za_t) / 2)]
    x = FOOT_X - 5.0
    while x > xb:  # along the margin, standing off the tube's glass, behind the band
        pts.append((x, ARM_Y, max(za_t, heights.at(x, ARM_Y) * 100.0 + r + 1.0)))
        x -= 3.0
    for k in range(13):
        a = th1 * k / 12
        pts.append((xb - rb * math.sin(a), ARM_Y, za_t + rb * (1 - math.cos(a))))
    t_end = (z_front * 100.0 - ez) / math.cos(yaw)
    for k in range(1, 11):
        tt = t_end * k / 10
        pts.append((ex - tt * math.sin(yaw), ARM_Y, ez + tt * math.cos(yaw)))
    jx, jz = ex - t_end * math.sin(yaw), ez + t_end * math.cos(yaw)
    for k in range(1, 13):  # up into the J
        a = (math.pi / 2) * k / 12
        f = rj * math.sin(a)
        pts.append((jx - f * math.sin(yaw), ARM_Y - rj * (1 - math.cos(a)), jz + f * math.cos(yaw)))
    tip_x, tip_z = jx - rj * math.sin(yaw), jz + rj * math.cos(yaw)
    pts.append((tip_x, ARM_Y - rj - J_TIP, tip_z))
    rod = poly_curve("hk-hook", [Vector((*place(x, y), z / 100.0)) for x, y, z in pts], units(r), steel)
    rod.data.bevel_resolution = 4
    return tip_x, ARM_Y - rj - J_TIP - r
