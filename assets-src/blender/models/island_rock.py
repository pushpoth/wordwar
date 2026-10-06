"""Rock outcrop: a small, steep islet with a few wind-bent trees."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ww import *  # noqa: E402,F403
from island_kit import make_island  # noqa: E402

reset()
build(make_island(41, sx=0.8, sy=0.65, height=0.5, plateau=0.42, cottages=False, trees=6, boulders=14),
      "island_rock", ao_distance=0.3)
