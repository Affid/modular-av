"""The empty glass under the cameras, from 90 pixels of room (`contract`): a hand rises from the bottom of the glass
holding a contract by its top edge, its claws over the edge on the paper's front, the sheet hanging. The scene is
fill.py's top2 part with the settings the look was settled with, and these mends: the fingers clench (curled
further, the paper dented and pulled into creases under them), and the forearm sinks into the dark glass above the
hand instead of standing in it as a pale column.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common  # noqa: E402

common.SETTINGS.update({
    "--part": "top2", "--name": "contract", "--samples": "160", "--fade": "0.01",
    "--paper": "0.56,0.47,0.37", "--creases": "2.2", "--through": "0.1", "--mark": "0.15",
    "--top-fade": "0.22", "--sheet-at": "-1.25,-1.5", "--g-back": "30", "--g-at": "0.5,0.10,0.16",
    # The mends: fingers that clench, the paper dented and pulled under them, the forearm sunk into the dark.
    "--g-curl": "58,36,62,38,64,40,62,42", "--g-extra": "3", "--dent": "0.07", "--dent-r": "0.055",
    "--pull": "0.045", "--top-sink": "2.0",
})

import fill  # noqa: E402

fill.picture()
