"""Enemy destroyer: lofted flared hull with sheer and raked bow, angled
superstructure, gun, VLS, mast with radar, twin funnels, hangar and helideck.
Length 4.2 cells along +X (bow at +X). Waterline z = 0."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ww import *  # noqa: E402,F403
from destroyer_kit import make_destroyer  # noqa: E402

reset()
build(make_destroyer(), "destroyer", ao_distance=0.2)
