"""Navigation buoy: red-and-white float, lattice tower, lamp, radar reflector.
About half a cell tall; the waterline is z = 0."""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ww import *  # noqa: E402,F403

reset()

red = mat("buoy_red", "#c8231b", rough=0.45)
white = mat("buoy_white", "#e9e4d8", rough=0.5)
steel = mat("buoy_steel", "#3b3f44", rough=0.4, metal=0.8)
rubber = mat("buoy_rubber", "#1b1c1e", rough=0.85)
lamp = mat("buoy_lamp", "#ffd27a", rough=0.2, emit="#ffb347", emit_strength=6.0)

parts = []

# Float: a revolved profile split into colour bands.
parts.append(lathe("hull_low", [(0.07, -0.16), (0.12, -0.10), (0.155, -0.03), (0.165, 0.0)], red))
parts.append(lathe("hull_band", [(0.165, 0.0), (0.168, 0.03), (0.168, 0.05)], white, cap_bottom=False, cap_top=False))
parts.append(lathe("hull_top", [(0.168, 0.05), (0.165, 0.065), (0.14, 0.08), (0.0, 0.08)], red, cap_bottom=False))
parts.append(torus("fender", 0.168, 0.016, loc=(0, 0, 0.012), material=rubber, major_segs=40, minor_segs=8))

# Lattice tower: four legs, two rings, diagonal braces.
legs = 4
top_z = 0.36
for i in range(legs):
    a = 2 * math.pi * i / legs + math.pi / 4
    base = (0.10 * math.cos(a), 0.10 * math.sin(a), 0.08)
    top = (0.045 * math.cos(a), 0.045 * math.sin(a), top_z)
    parts.append(strut(f"leg{i}", base, top, 0.008, steel))
    b = 2 * math.pi * (i + 1) / legs + math.pi / 4
    mid_a = (0.075 * math.cos(a), 0.075 * math.sin(a), 0.21)
    base_b = (0.10 * math.cos(b), 0.10 * math.sin(b), 0.08)
    parts.append(strut(f"brace{i}", base_b, mid_a, 0.005, steel))
parts.append(torus("ring_mid", 0.075, 0.007, loc=(0, 0, 0.21), material=steel, major_segs=24, minor_segs=6))
parts.append(torus("ring_top", 0.047, 0.007, loc=(0, 0, top_z), material=red, major_segs=24, minor_segs=6))

# Lamp housing.
parts.append(cyl("lamp_base", 0.04, 0.02, loc=(0, 0, top_z + 0.01), material=steel, verts=20, bevel=0.004))
parts.append(cyl("lamp_lens", 0.026, 0.05, loc=(0, 0, top_z + 0.045), material=lamp, verts=20))
parts.append(cyl("lamp_cap", 0.032, 0.012, loc=(0, 0, top_z + 0.076), material=steel, verts=20, r2=0.012))

# Radar reflector: an octahedron of plates on a short mast.
parts.append(strut("mast", (0, 0, top_z + 0.08), (0, 0, top_z + 0.12), 0.004, steel))
refl = sphere("reflector", 0.03, loc=(0, 0, top_z + 0.14), material=steel, segs=4, rings=2)
parts.append(refl)

build(parts, "buoy", ao_distance=0.12)
