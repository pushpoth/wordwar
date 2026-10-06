"""The destroyer broken in two by a hit amidships: bow and stern halves with
torn, scorched ends, plus loose fittings (gun, mast, funnels, bridge roof,
CIWS mounts, life rafts) as separate pieces the game throws clear.
Only loaded when a ship is destroyed."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ww import *  # noqa: E402,F403
from destroyer_kit import make_destroyer  # noqa: E402

reset()
R = rng(11)
CUT = -0.12  # break line, just aft of the bridge
scorch = mat("scorched", "#17120f", rough=0.95)

parts = {p.name: p for p in make_destroyer()}

LOOSE = {
    "debris_turret": ("gun_house", "gun_barrel", "gun_muzzle"),
    "debris_mast": ("mast", "yard0.3", "yard0.44", "radar", "radar_bar", "nav_red", "nav_green"),
    "debris_bridge": ("bridge", "bridge_glass"),
    "debris_funnel0": ("funnel0", "funnel_cap0"),
    "debris_funnel1": ("funnel1", "funnel_cap1"),
    "debris_ciws_fwd": ("ciws_base0.5", "ciws_dome0.5", "ciws_gun0.5"),
    "debris_ciws_aft": ("ciws_base-1.2", "ciws_dome-1.2", "ciws_gun-1.2"),
    "debris_rafts_p": ("raft-10", "raft-11", "raft-12"),
    "debris_rafts_s": ("raft10", "raft11", "raft12"),
}
groups = {name: [parts.pop(n) for n in names if n in parts] for name, names in LOOSE.items()}


def torn_half(ob, keep_fore):
    """Cut ob at CUT, cap the hole with scorched metal and tear its edge."""
    apply_all([ob])
    if scorch.name not in [m.name for m in ob.data.materials]:
        ob.data.materials.append(scorch)
    si = [m.name for m in ob.data.materials].index(scorch.name)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(CUT, 0, 0),
                                 plane_no=(1, 0, 0), clear_inner=keep_fore, clear_outer=not keep_fore)
    cut_edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    filled = bmesh.ops.holes_fill(bm, edges=cut_edges, sides=0)
    for f in filled["faces"]:
        f.material_index = si
        poked = bmesh.ops.poke(bm, faces=[f])
        for v in poked["verts"]:
            v.co.x += -0.07 if keep_fore else 0.07
    # Tear: jitter the cut line so the break is ragged, not a clean slice.
    for v in bm.verts:
        if abs(v.co.x - CUT) < 1e-4:
            v.co.x += R.uniform(-0.05, 0.05) * (1 if keep_fore else -1) + (0.02 if keep_fore else -0.02)
            v.co.z += R.uniform(-0.015, 0.015)
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def split(ob):
    fore = ob.copy()
    fore.data = ob.data.copy()
    bpy.context.scene.collection.objects.link(fore)
    return torn_half(fore, True), torn_half(ob, False)


bow, stern = [], []
for name, ob in list(parts.items()):
    xs = [(ob.matrix_world @ Vector(c)).x for c in ob.bound_box]
    if min(xs) < CUT < max(xs):
        f, a = split(ob)
        bow.append(f)
        stern.append(a)
    elif min(xs) >= CUT:
        bow.append(ob)
    else:
        stern.append(ob)

groups = {"bow": bow, "stern": stern, **groups}
# Halves hinge at the keel on the break line, so they can fold into a V.
build_groups(groups, "destroyer_wreck", ao_distance=0.2,
             origins={"bow": (CUT, 0, -0.1), "stern": (CUT, 0, -0.1)})
