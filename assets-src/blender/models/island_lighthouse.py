"""Lighthouse island: cliff rock with a grassy plateau, red-and-white
lighthouse, keeper's cottage, trees, shore boulders and a timber dock.
About 3.6 × 2.8 cells."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ww import *  # noqa: E402,F403
from island_kit import make_island  # noqa: E402

reset()
build(make_island(7, lighthouse=True, cottages=True, dock=True), "island_lighthouse", ao_distance=0.35)
