"""Parametric island kit shared by every island model.

make_island(seed, sx, sy, ...) returns the list of part objects: a faceted
cliff landmass with a grassy plateau, sand apron, shore boulders, trees, and
optionally a lighthouse, cottages and a dock. 1 unit = 1 cell, waterline z = 0."""

from ww import *  # noqa: F403
from mathutils.bvhtree import BVHTree


def make_island(seed, sx=1.75, sy=1.3, height=0.62, plateau=0.52, lighthouse=False, cottages=True,
                dock=False, trees=30, boulders=30):
    R = rng(seed)
    rock = mat("rock", "#6f675d", rough=0.92)
    rock_dark = mat("rock_dark", "#4a4640", rough=0.95)
    grass = mat("grass", "#567133", rough=0.9)
    grass_dark = mat("grass_dark", "#3d5629", rough=0.92)
    dirt = mat("dirt", "#6d5c45", rough=0.95)
    sand = mat("sand", "#b8a27c", rough=0.95)
    white = mat("paint_white", "#ebe6da", rough=0.6)
    red = mat("paint_red", "#b52a20", rough=0.5)
    iron = mat("iron", "#2c2f33", rough=0.45, metal=0.7)
    glass = mat("lantern", "#ffe2a0", rough=0.15, emit="#ffc35a", emit_strength=8.0)
    window = mat("window", "#ffd58a", rough=0.3, emit="#ffb85a", emit_strength=2.5)
    wood = mat("wood", "#6b4a2f", rough=0.85)
    wood_dark = mat("wood_dark", "#3d2a1b", rough=0.9)
    roof = mat("roof", "#7d2f25", rough=0.7)
    leaf = mat("leaf", "#3f5f2a", rough=0.85)
    leaf_light = mat("leaf_light", "#5d7d33", rough=0.85)
    pine = mat("pine", "#2f4a2a", rough=0.85)
    bark = mat("bark", "#4a3424", rough=0.9)

    parts = []

    # --- Landmass ---------------------------------------------------------------
    land = icosphere("land", 1.0, subdiv=6, scale=(sx, sy, height), loc=(0, 0, 0.08))
    land.data.materials.append(rock)
    displace(land, scale=0.55, strength=0.45, offset=(3.1 + seed * 7.3, 1.7 + seed * 2.9, 0.4))
    displace(land, scale=0.18, strength=0.12, offset=(-2.0 + seed * 3.7, 5.0, 1.0))
    displace(land, scale=0.06, strength=0.035, offset=(seed * 1.3, -4.0, 2.0))
    apply_all([land])

    bm = bmesh.new()
    bm.from_mesh(land.data)
    for v in bm.verts:
        if v.co.z > plateau:
            v.co.z = plateau + (v.co.z - plateau) * 0.18
        elif v.co.z > -0.05:
            # Cliff strata: horizontal ledges pushed in and out along the face.
            r = math.hypot(v.co.x, v.co.y) or 1.0
            ledge = 0.022 * math.sin(v.co.z * 46 + seed) + 0.012 * math.sin(v.co.z * 113)
            v.co.x += v.co.x / r * ledge
            v.co.y += v.co.y / r * ledge
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, -0.28),
                           plane_no=(0, 0, 1), clear_inner=True)
    bm.to_mesh(land.data)
    bm.free()
    decimate(land, 0.35)
    apply_all([land])
    paint_by_slope(land, grass, min_dot=0.7, min_z=0.32)
    # Break the grass into darker patches and bare dirt.
    from mathutils import noise
    for m in (grass_dark, dirt):
        land.data.materials.append(m)
    names = [m.name for m in land.data.materials]
    gi, di, ti = names.index("grass"), names.index("grass_dark"), names.index("dirt")
    for poly in land.data.polygons:
        if poly.material_index != gi:
            continue
        n = noise.noise(poly.center * 2.6 + Vector((seed, seed * 0.5, 0)))
        if n > 0.32:
            poly.material_index = ti
        elif n > 0.02:
            poly.material_index = di
    parts.append(land)

    # Ground-height lookup for placing props on the plateau.
    deps = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(land, deps)


    def ground(x, y):
        hit = bvh.ray_cast(Vector((x, y, 5)), Vector((0, 0, -1)))
        return hit[0].z if hit[0] else None


    # Sand apron at the waterline.
    apron = icosphere("apron", 1.0, subdiv=3, scale=(sx * 1.11, sy * 1.14, 0.08), loc=(0.05, 0.02, -0.03), material=sand)
    displace(apron, scale=0.4, strength=0.12, offset=(9, 2, 0))
    decimate(apron, 0.5)
    parts.append(apron)

    # Shore boulders.
    for i in range(boulders):
        a = R.uniform(0, 2 * math.pi)
        rr = R.uniform(0.9, 1.12)
        x, y = sx * rr * math.cos(a), sy * rr * math.sin(a)
        s = R.uniform(0.1, 0.3) * (1.25 if rr < 1.0 else 1.0)
        b = icosphere(f"boulder{i}", s, subdiv=3, loc=(x, y, R.uniform(-0.05, 0.12) if rr < 1.0 else R.uniform(-0.06, 0.02)),
                      scale=(1.0, R.uniform(0.7, 1.0), R.uniform(0.55, 0.8)),
                      material=rock_dark if i % 3 else rock)
        displace(b, scale=0.15, strength=s * 0.6, offset=(i * 3.1, i * 1.7, 0))
        decimate(b, 0.45)
        parts.append(b)

    lx, ly = -0.55 * sx / 1.75, 0.15
    if lighthouse:
        # --- Lighthouse ---------------------------------------------------------------
        lz = ground(lx, ly) - 0.02
        tower_h = 1.25
        bands = 5
        for i in range(bands):
            z0 = lz + tower_h * i / bands
            z1 = lz + tower_h * (i + 1) / bands
            r0 = 0.17 - 0.055 * (i / bands)
            r1 = 0.17 - 0.055 * ((i + 1) / bands)
            parts.append(lathe(f"tower{i}", [(r0, z0), (r1, z1)], red if i % 2 else white, segments=28,
                               cap_bottom=(i == 0), cap_top=False, loc=(lx, ly, 0)))
        top = lz + tower_h
        parts.append(cyl("gallery", 0.17, 0.035, loc=(lx, ly, top + 0.017), material=iron, verts=28, bevel=0.006))
        parts.append(torus("rail", 0.165, 0.006, loc=(lx, ly, top + 0.09), material=iron, major_segs=28, minor_segs=5))
        for i in range(10):
            a = 2 * math.pi * i / 10
            parts.append(strut(f"post{i}", (lx + 0.165 * math.cos(a), ly + 0.165 * math.sin(a), top + 0.035),
                               (lx + 0.165 * math.cos(a), ly + 0.165 * math.sin(a), top + 0.09), 0.005, iron, verts=5))
        parts.append(cyl("lantern", 0.09, 0.15, loc=(lx, ly, top + 0.11), material=glass, verts=16))
        for i in range(6):
            a = 2 * math.pi * i / 6
            parts.append(strut(f"mullion{i}", (lx + 0.093 * math.cos(a), ly + 0.093 * math.sin(a), top + 0.035),
                               (lx + 0.093 * math.cos(a), ly + 0.093 * math.sin(a), top + 0.185), 0.007, iron, verts=4))
        parts.append(cyl("dome", 0.115, 0.1, loc=(lx, ly, top + 0.235), material=red, verts=24, r2=0.02))
        parts.append(strut("finial", (lx, ly, top + 0.28), (lx, ly, top + 0.34), 0.008, iron))
        parts.append(sphere("finial_ball", 0.016, loc=(lx, ly, top + 0.345), material=iron, segs=10, rings=6))
        # Door and two small windows on the tower.
        parts.append(box("door", (0.02, 0.08, 0.13), loc=(lx + 0.165, ly, lz + 0.065), material=wood_dark))
        for z in (0.45, 0.8):
            parts.append(box(f"twin{z}", (0.02, 0.045, 0.07), loc=(lx + 0.165 - 0.05 * z, ly, lz + z), material=window))

    # --- Keeper's cottage -----------------------------------------------------------
    def cottage(name, x, y, w, d, h, rot):
        gz = ground(x, y)
        if gz is None:
            return
        body = box(f"{name}_body", (w, d, h), loc=(x, y, gz + h / 2 - 0.02), material=white, bevel=0.008)
        body.rotation_euler.z = rot
        parts.append(body)
        parts.append(gable_roof(f"{name}_roof", w, d, h * 0.6, (x, y, gz + h - 0.02), roof, rot_z=rot))
        c, s = math.cos(rot), math.sin(rot)
        for k in (-0.25, 0.25):
            wx, wy = x + c * w * k - s * (d / 2 + 0.004), y + s * w * k + c * (d / 2 + 0.004)
            win = box(f"{name}_win{k}", (0.05, 0.01, 0.05), loc=(wx, wy, gz + h * 0.55), material=window)
            win.rotation_euler.z = rot
            parts.append(win)
        chim = box(f"{name}_chimney", (0.04, 0.04, 0.12), loc=(x + c * w * 0.3, y + s * w * 0.3, gz + h + 0.05),
                   material=rock_dark)
        parts.append(chim)


    if cottages:
        cottage("cottage", -0.05, -0.38, 0.4, 0.26, 0.2, 0.25)
        cottage("shed", 0.45, -0.05, 0.24, 0.2, 0.15, -0.4)

    # --- Trees ---------------------------------------------------------------------
    def conifer(i, x, y, h):
        gz = ground(x, y)
        parts.append(cyl(f"trunk{i}", 0.018, h * 0.3, loc=(x, y, gz + h * 0.15), material=bark, verts=6))
        for k in range(4):
            rr = h * (0.3 - k * 0.055)
            cz = gz + h * (0.26 + k * 0.17)
            cone = cyl(f"pine{i}_{k}", rr, h * 0.38, loc=(x, y, cz), material=pine, verts=9, r2=0.0)
            cone.rotation_euler.z = R.uniform(0, 1)
            parts.append(cone)


    def broadleaf(i, x, y, h):
        gz = ground(x, y)
        parts.append(cyl(f"btrunk{i}", 0.022, h * 0.45, loc=(x, y, gz + h * 0.22), material=bark, verts=6))
        for k in range(6):
            ox, oy = R.uniform(-0.08, 0.08), R.uniform(-0.08, 0.08)
            blob = icosphere(f"leaf{i}_{k}", h * R.uniform(0.16, 0.25), subdiv=2,
                             loc=(x + ox, y + oy, gz + h * R.uniform(0.55, 0.8)),
                             material=leaf if k % 2 else leaf_light)
            displace(blob, scale=0.08, strength=0.03, offset=(i, k, 0))
            parts.append(blob)


    placed = 0
    tries = 0
    while placed < trees and tries < 800:
        tries += 1
        x, y = R.uniform(-sx * 0.78, sx * 0.78), R.uniform(-sy * 0.78, sy * 0.78)
        if (lighthouse and (x - lx) ** 2 + (y - ly) ** 2 < 0.12) or (cottages and ((x + 0.05) ** 2 + (y + 0.38) ** 2 < 0.12 or (x - 0.45) ** 2 + (y + 0.05) ** 2 < 0.06)):
            continue
        gz = ground(x, y)
        if gz is None or gz < plateau - 0.1:
            continue
        h = R.uniform(0.34, 0.55)
        (conifer if placed % 3 else broadleaf)(placed, x, y, h)
        placed += 1

    if dock:
        # --- Dock ----------------------------------------------------------------------
        dock_y = -0.9
        for i in range(9):
            x = 0.35 + i * 0.11
            parts.append(box(f"plank{i}", (0.095, 0.26, 0.02), loc=(x, dock_y - 0.4, 0.1), material=wood, bevel=0.004))
        for x in (0.38, 0.62, 0.86, 1.1, 1.3):
            for y in (dock_y - 0.52, dock_y - 0.28):
                parts.append(cyl(f"pile{x}{y}", 0.022, 0.32, loc=(x, y, -0.02), material=wood_dark, verts=8))
        parts.append(box("bollard", (0.04, 0.04, 0.05), loc=(1.3, dock_y - 0.4, 0.135), material=iron, bevel=0.006))
    return parts
