"""Player submarine, surfaced: revolved pressure hull, streamlined sail with
planes and masts, cruciform stern fins, seven-blade propeller.
Length 2.5 cells along +X (bow at +X). Waterline z = 0."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ww import *  # noqa: E402,F403

reset()

hull_mat = mat("sub_hull", "#22272b", rough=0.55, metal=0.2)
casing = mat("sub_casing", "#2c3237", rough=0.7, metal=0.1)
dark = mat("sub_dark", "#121417", rough=0.5, metal=0.4)
bronze = mat("sub_prop", "#8a6a3a", rough=0.35, metal=0.9)
mark = mat("sub_mark", "#d9d6cc", rough=0.6)
lamp = mat("sub_lamp", "#fff1c9", rough=0.2, emit="#ffe2a0", emit_strength=5.0)

ZC = -0.1  # hull axis below the waterline: surfaced, only the upper hull and sail show
parts = []

profile = [(0.012, -1.25), (0.05, -1.15), (0.1, -0.95), (0.145, -0.65), (0.17, -0.35), (0.172, 0.0),
           (0.172, 0.6), (0.165, 0.82), (0.148, 0.98), (0.118, 1.1), (0.075, 1.19), (0.03, 1.235), (0.006, 1.25)]
hull = lathe("hull", profile, hull_mat, segments=40, cap_bottom=True, cap_top=True)
hull.rotation_euler = (0, math.pi / 2, 0)
hull.location = (0, 0, ZC)
parts.append(hull)

# Flat deck casing along the top.
parts.append(tapered_block("casing", -0.7, 0.9, 0.12, 0.03, ZC + 0.155, casing, taper=0.25, rake_front=0.15,
                           rake_back=0.2))

# Sail.
sx0, sx1 = 0.18, 0.58
parts.append(tapered_block("sail", sx0, sx1, 0.1, 0.25, ZC + 0.15, hull_mat, taper=0.3, rake_front=0.09,
                           rake_back=0.03, bevel=0.025))
parts.append(box("sail_cap", (0.22, 0.06, 0.01), loc=(0.39, 0, ZC + 0.405), material=dark))
for side in (-1, 1):
    plane = tapered_block(f"sail_plane{side}", 0.38, 0.5, 0.012, 0.012, 0, hull_mat, taper=0.0)
    plane.location = (0, side * 0.1, ZC + 0.31)
    plane.scale = (1, 8.0, 1)
    parts.append(plane)
# Masts: periscopes and a snorkel, partly raised.
for x, h, r in ((0.43, 0.16, 0.012), (0.36, 0.11, 0.01), (0.3, 0.07, 0.016)):
    parts.append(strut(f"mast{x}", (x, 0, ZC + 0.4), (x, 0, ZC + 0.4 + h), r, dark, verts=8))
parts.append(sphere("mast_lamp", 0.01, loc=(0.43, 0, ZC + 0.565), material=lamp, segs=8, rings=4))

# Stern fins (cruciform) and propeller.
fx = -1.0
for k, (dy, dz) in enumerate(((0, 1), (0, -1), (1, 0), (-1, 0))):
    fin = tapered_block(f"fin{k}", fx - 0.14, fx + 0.06, 0.012, 0.16, 0, hull_mat, taper=0.0,
                        rake_front=0.08, rake_back=0.0)
    if dz:
        fin.location = (0, 0, ZC + (0.06 if dz > 0 else -0.06))
        fin.scale.z = dz
    else:
        fin.rotation_euler.x = -dy * math.pi / 2
        fin.location = (0, dy * 0.06, ZC)
    parts.append(fin)
parts.append(cyl("prop_hub", 0.022, 0.05, loc=(-1.27, 0, ZC), material=bronze, verts=12, rot=(0, math.pi / 2, 0)))
for i in range(7):
    a = 2 * math.pi * i / 7
    blade = box(f"blade{i}", (0.012, 0.03, 0.09), loc=(-1.27, 0.05 * math.sin(a), ZC + 0.05 * math.cos(a)),
                material=bronze)
    blade.rotation_euler = (-a, math.radians(25), 0)
    parts.append(blade)

# Hull number and hatches.
for side in (-1, 1):
    parts.append(box(f"num{side}", (0.09, 0.004, 0.035), loc=(0.39, side * 0.051, ZC + 0.33), material=mark))
for x in (-0.45, 0.75):
    parts.append(cyl(f"hatch{x}", 0.03, 0.01, loc=(x, 0, ZC + 0.19), material=dark, verts=14))

build(parts, "submarine", ao_distance=0.15)
