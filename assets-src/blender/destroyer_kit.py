"""Destroyer kit: builds every part of the enemy destroyer and returns them.

Shared by `destroyer.py` (the intact ship, joined into one mesh) and
`destroyer_wreck.py` (the same ship broken in two with loose fittings).
Length 4.2 cells along +X (bow at +X). Waterline z = 0."""

from ww import *  # noqa: F403


def make_destroyer():
    hull_grey = mat("hull", "#46525a", rough=0.55, metal=0.3)
    super_grey = mat("superstructure", "#5c676f", rough=0.5, metal=0.25)
    deck = mat("deck", "#2e3337", rough=0.8)
    antifoul = mat("antifouling", "#6a2620", rough=0.7)
    boot = mat("boot_top", "#17191c", rough=0.6)
    black = mat("black", "#15171a", rough=0.5, metal=0.3)
    glass = mat("bridge_glass", "#0d1720", rough=0.08, metal=0.6)
    white = mat("white", "#e3e5e2", rough=0.45)
    steel = mat("steel", "#9aa2a8", rough=0.35, metal=0.85)
    lamp_red = mat("nav_red", "#ff3b2f", rough=0.3, emit="#ff2a1a", emit_strength=4.0)
    lamp_green = mat("nav_green", "#3bff7a", rough=0.3, emit="#2aff6a", emit_strength=4.0)

    L = 4.2
    X0, X1 = -L / 2, L / 2
    parts = []

    # --- Hull ----------------------------------------------------------------------
    def beam(t):
        """Half-beam along the hull, t ∈ [0, 1] stern → bow."""
        mid = 0.29
        if t < 0.08:
            return mid * (0.82 + 0.18 * t / 0.08)
        if t < 0.55:
            return mid
        u = (t - 0.55) / 0.45
        return max(0.004, mid * math.sqrt(max(0.0, 1 - u ** 1.8)))


    def deck_z(t):
        return 0.15 + 0.07 * max(0.0, (t - 0.55) / 0.45) ** 2


    def keel_z(t):
        k = -0.12
        if t > 0.82:
            k = k + (deck_z(t) * 0.75 - k) * ((t - 0.82) / 0.18) ** 1.6
        if t < 0.06:
            k = k + 0.05 * (1 - t / 0.06)
        return k


    # Half-profile as (fraction of beam, z or None for keel-relative) from deck down.
    PROFILE = [(1.0, "deck"), (1.0, 0.06), (0.99, 0.015), (0.97, -0.01), (0.86, -0.055), (0.58, "k0.75"),
               (0.22, "k0.95"), (0.0, "k1")]


    def section(t):
        x = X0 + L * t
        b, d, k = beam(t), deck_z(t), keel_z(t)
        half = []
        for f, z in PROFILE:
            if z == "deck":
                zz = d
            elif isinstance(z, str):
                zz = k * float(z[1:])
            else:
                zz = min(z, d - 0.005)
                zz = max(zz, k * 0.6)
            half.append((x, -b * f, zz))
        port = half
        stbd = [(x, -y, z) for (x, y, z) in reversed(half[:-1])]
        crown = [(x, 0.0, d + 0.012)]
        return port + stbd[:-0] + crown if False else port + stbd + crown


    ts = [i / 40 for i in range(41)]
    hull = loft("hull", [section(t) for t in ts], hull_grey)
    for m in (antifoul, boot, deck):
        hull.data.materials.append(m)
    names = [m.name for m in hull.data.materials]
    for p in hull.data.polygons:
        cz = p.center.z
        if p.normal.z > 0.8 and cz > 0.1:
            p.material_index = names.index("deck")
        elif cz < -0.012:
            p.material_index = names.index("antifouling")
        elif cz < 0.016:
            p.material_index = names.index("boot_top")
    parts.append(hull)

    # Hull knuckle strake + bow anchor.
    parts.append(box("anchor_p", (0.06, 0.01, 0.05), loc=(X1 - 0.55, -beam(0.87) - 0.002, 0.11), material=black))
    parts.append(box("anchor_s", (0.06, 0.01, 0.05), loc=(X1 - 0.55, beam(0.87) + 0.002, 0.11), material=black))

    # --- Forward weapons -----------------------------------------------------------
    gx = 1.25
    parts.append(cyl("gun_ring", 0.11, 0.03, loc=(gx, 0, deck_z(0.8) + 0.015), material=super_grey, verts=24))
    parts.append(tapered_block("gun_house", gx - 0.12, gx + 0.1, 0.16, 0.08, deck_z(0.8) + 0.03, super_grey,
                               taper=0.3, rake_front=0.06, bevel=0.006))
    parts.append(cyl("gun_barrel", 0.012, 0.42, loc=(gx + 0.3, 0, deck_z(0.8) + 0.07), material=super_grey,
                     verts=10, rot=(0, math.pi / 2, 0)))
    parts.append(cyl("gun_muzzle", 0.016, 0.03, loc=(gx + 0.5, 0, deck_z(0.8) + 0.07), material=black,
                     verts=10, rot=(0, math.pi / 2, 0)))

    vx0, vx1 = 0.68, 0.98
    parts.append(box("vls", (vx1 - vx0, 0.3, 0.03), loc=((vx0 + vx1) / 2, 0, deck_z(0.72) + 0.012), material=deck))
    for i in range(4):
        for j in range(4):
            parts.append(box(f"cell{i}{j}", (0.058, 0.058, 0.006),
                             loc=(vx0 + 0.04 + i * 0.073, -0.11 + j * 0.073, deck_z(0.72) + 0.03), material=black))

    # --- Bridge superstructure ---------------------------------------------------------
    bz = deck_z(0.5)
    parts.append(tapered_block("super1", -0.35, 0.62, 0.5, 0.16, bz, super_grey, taper=0.14, rake_front=0.08,
                               bevel=0.006))
    parts.append(tapered_block("super2", -0.15, 0.52, 0.4, 0.13, bz + 0.16, super_grey, taper=0.16,
                               rake_front=0.1, bevel=0.006))
    parts.append(tapered_block("bridge", 0.08, 0.46, 0.36, 0.09, bz + 0.29, super_grey, taper=0.12,
                               rake_front=0.05, bevel=0.005))
    # Bridge windows: a dark band wrapping the front.
    parts.append(tapered_block("bridge_glass", 0.36, 0.425, 0.33, 0.035, bz + 0.33, glass, taper=0.1,
                               rake_front=0.015))
    for side in (-1, 1):
        parts.append(box(f"wing{side}", (0.1, 0.06, 0.015), loc=(0.36, side * 0.22, bz + 0.3), material=super_grey))
    # Phased-array panels on the angled faces.
    for side in (-1, 1):
        pnl = box(f"spy{side}", (0.12, 0.008, 0.1), loc=(0.3, side * 0.175, bz + 0.21), material=black)
        pnl.rotation_euler.x = side * math.radians(-12)
        parts.append(pnl)

    # --- Mast -----------------------------------------------------------------------------
    mx = 0.12
    mz = bz + 0.38
    parts.append(tapered_block("mast_base", mx - 0.07, mx + 0.07, 0.12, 0.12, mz - 0.01, super_grey, taper=0.3))
    parts.append(strut("mast", (mx, 0, mz + 0.1), (mx - 0.03, 0, mz + 0.55), 0.012, super_grey))
    for z, w in ((0.3, 0.32), (0.44, 0.2)):
        parts.append(box(f"yard{z}", (0.02, w, 0.012), loc=(mx - 0.02, 0, mz + z), material=super_grey))
    parts.append(cyl("radar", 0.07, 0.025, loc=(mx - 0.025, 0, mz + 0.5), material=white, verts=20))
    parts.append(box("radar_bar", (0.03, 0.22, 0.02), loc=(mx - 0.02, 0, mz + 0.22), material=black))
    parts.append(sphere("nav_red", 0.012, loc=(mx - 0.02, -0.16, mz + 0.3), material=lamp_red, segs=8, rings=4))
    parts.append(sphere("nav_green", 0.012, loc=(mx - 0.02, 0.16, mz + 0.3), material=lamp_green, segs=8, rings=4))

    # --- Funnels -------------------------------------------------------------------------
    for i, fx in enumerate((-0.42, -0.86)):
        parts.append(tapered_block(f"funnel{i}", fx - 0.12, fx + 0.12, 0.2, 0.26, bz + 0.1, super_grey,
                                   taper=0.25, rake_front=0.05, rake_back=0.05, bevel=0.006))
        parts.append(tapered_block(f"funnel_cap{i}", fx - 0.08, fx + 0.08, 0.14, 0.03, bz + 0.36, black, taper=0.1))
    parts.append(tapered_block("mid_deckhouse", -1.0, -0.3, 0.44, 0.1, bz, super_grey, taper=0.1, bevel=0.005))

    # Lifeboat canisters.
    for side in (-1, 1):
        for k in range(3):
            parts.append(cyl(f"raft{side}{k}", 0.022, 0.07, loc=(-0.55 - k * 0.09, side * 0.25, bz + 0.12),
                             material=white, verts=10, rot=(0, math.pi / 2, 0)))

    # --- Hangar + aft CIWS + helideck --------------------------------------------------------
    parts.append(tapered_block("hangar", -1.55, -1.0, 0.48, 0.17, deck_z(0.2), super_grey, taper=0.08,
                               rake_back=0.0, bevel=0.006))
    parts.append(box("hangar_door", (0.006, 0.3, 0.12), loc=(-1.553, 0, deck_z(0.2) + 0.065), material=black))
    for x, z in ((-1.2, deck_z(0.2) + 0.17), (0.5, bz + 0.29)):
        parts.append(cyl(f"ciws_base{x}", 0.035, 0.03, loc=(x, 0, z + 0.015), material=super_grey, verts=14))
        parts.append(sphere(f"ciws_dome{x}", 0.034, loc=(x, 0, z + 0.06), material=white, segs=14, rings=8,
                            scale=(1, 1, 1.3)))
        parts.append(cyl(f"ciws_gun{x}", 0.007, 0.08, loc=(x + 0.05, 0, z + 0.035), material=black, verts=6,
                         rot=(0, math.pi / 2, 0)))

    # Helideck markings.
    hz = deck_z(0.08) + 0.013
    parts.append(torus("heli_circle", 0.15, 0.008, loc=(-1.82, 0, hz), material=white, major_segs=36, minor_segs=4,
                       rot=(0, 0, 0)))
    parts[-1].scale.z = 0.15
    parts.append(box("heli_line", (0.42, 0.012, 0.003), loc=(-1.82, 0, hz), material=white))

    # Bollards and bow jack staff.
    for x in (1.6, 1.0, -0.2, -1.4, -1.9):
        for side in (-1, 1):
            t = (x - X0) / L
            parts.append(cyl(f"bollard{x}{side}", 0.012, 0.03, loc=(x, side * (beam(t) - 0.04), deck_z(t) + 0.015),
                             material=black, verts=8))
    parts.append(strut("jack", (X1 - 0.08, 0, deck_z(0.98)), (X1 - 0.08, 0, deck_z(0.98) + 0.14), 0.004, steel))

    return parts
