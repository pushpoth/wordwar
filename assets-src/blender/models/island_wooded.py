"""Wooded island: a mid-sized cliff rock thick with trees. No buildings."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ww import *  # noqa: E402,F403
from island_kit import make_island  # noqa: E402

reset()
build(make_island(23, sx=1.3, sy=1.05, height=0.55, plateau=0.45, cottages=False, trees=26, boulders=22),
      "island_wooded", ao_distance=0.35)
