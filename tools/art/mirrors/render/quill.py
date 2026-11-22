"""The empty glass under the cameras, from 240 pixels of room (`quill`): a second hand joins the contract's, a fist
coming straight out of the glass toward the viewer, holding a quill across, its feather to the left, offering it.
The scene is fill.py's offer2 part with the settings the look was settled with, and one mend: the key light is
smaller, so the quill's shaft casts a shadow on the fingers round it.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common  # noqa: E402

common.SETTINGS.update({
    "--part": "offer2", "--name": "quill", "--samples": "160", "--q-scale": "1.3", "--side-fade": "0.12",
    "--side": "right", "--vane-col": "0.30,0.27,0.27", "--vane-w": "0.32", "--barb-w": "0.008", "--fade": "0.06",
    "--f-yaw": "0", "--f-roll": "-8", "--f-up": "30", "--f-knuckles": "50,55,60,66",
    "--f-curl": "60,34,64,36,66,38,68,40", "--f-thumb-x": "0.26", "--f-thumb-dz": "0.06", "--o-at": "2.05,-2.4,0.2",
    "--f-feather-out": "1.6",
    # The mend: a smaller key light, so the shaft's shadow falls on the fingers round it.
    "--key-size": "0.45", "--key-at": "-4.6,3.0,2.2",
})

import fill  # noqa: E402

fill.picture()
