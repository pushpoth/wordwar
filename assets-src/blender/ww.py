"""Word War Blender helpers.

Every model script builds its asset from scratch with these helpers, then calls
`export(objects)`. Units: 1 Blender unit = 1 board cell. Z is up; ships face +X.
The glTF export converts to three.js Y-up.

Run through `npm run models`, which invokes:
    blender --background --factory-startup --python <model.py> -- <out.glb>
"""

import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# Scene + arguments
# ---------------------------------------------------------------------------


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world


def out_path():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if not argv:
        raise SystemExit("usage: blender --background --python model.py -- out.glb")
    return argv[0]


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _hex(h):
    h = h.lstrip("#")
    return tuple(_srgb_to_linear(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))


def mat(name, color, rough=0.6, metal=0.0, emit=None, emit_strength=0.0):
    """Principled material from an sRGB hex colour. Reused by name."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*_hex(color), 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*_hex(emit), 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    return m


# ---------------------------------------------------------------------------
# Object construction
# ---------------------------------------------------------------------------


def _obj_from_bmesh(name, bm, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if material:
        me.materials.append(material)
    return ob


def _place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = scale
    return ob


def box(name, size, loc=(0, 0, 0), material=None, bevel=0.0, rot=(0, 0, 0), segments=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    ob = _place(_obj_from_bmesh(name, bm, material), loc, rot)
    if bevel:
        add_bevel(ob, bevel, segments)
    return ob


def cyl(name, r, depth, loc=(0, 0, 0), material=None, verts=24, rot=(0, 0, 0), bevel=0.0, r2=None, segments=2):
    """Cylinder (or cone/frustum with r2) along local Z, centred on loc."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=verts,
        radius1=r, radius2=r if r2 is None else r2, depth=depth,
    )
    ob = _place(_obj_from_bmesh(name, bm, material), loc, rot)
    if bevel:
        add_bevel(ob, bevel, segments)
    return ob


def sphere(name, r, loc=(0, 0, 0), material=None, segs=24, rings=12, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    return _place(_obj_from_bmesh(name, bm, material), loc, (0, 0, 0), scale)


def torus(name, major, minor, loc=(0, 0, 0), material=None, major_segs=32, minor_segs=8, rot=(0, 0, 0)):
    bm = bmesh.new()
    verts = []
    for i in range(major_segs):
        a = 2 * math.pi * i / major_segs
        ring = []
        for j in range(minor_segs):
            b = 2 * math.pi * j / minor_segs
            rr = major + minor * math.cos(b)
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), minor * math.sin(b))))
        verts.append(ring)
    for i in range(major_segs):
        for j in range(minor_segs):
            a, b = verts[i], verts[(i + 1) % major_segs]
            bm.faces.new((a[j], b[j], b[(j + 1) % minor_segs], a[(j + 1) % minor_segs]))
    return _place(_obj_from_bmesh(name, bm, material), loc, rot)


def lathe(name, profile, material=None, segments=32, loc=(0, 0, 0), cap_bottom=True, cap_top=True):
    """Revolve a (radius, z) profile, bottom to top, around Z."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        lo, hi = rings[k], rings[k + 1]
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    if cap_bottom and profile[0][0] > 0:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top and profile[-1][0] > 0:
        bm.faces.new(rings[-1])
    return _place(_obj_from_bmesh(name, bm, material), loc)


def loft(name, sections, material=None, cap_start=True, cap_end=True):
    """Skin a list of closed cross-sections. Each section is a list of (x, y, z)
    points with the same count and winding. Used for hulls."""
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in sec] for sec in sections]
    n = len(sections[0])
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_start:
        bm.faces.new(list(reversed(rings[0])))
    if cap_end:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj_from_bmesh(name, bm, material)


def strut(name, a, b, r, material=None, verts=8):
    """Cylinder from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    ob = cyl(name, r, d.length, loc=(a + b) / 2, material=material, verts=verts)
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return ob


def array_copies(ob, offsets):
    """Linked-free duplicates of ob at extra offsets (relative to ob)."""
    out = [ob]
    for off in offsets:
        c = ob.copy()
        c.data = ob.data.copy()
        c.location = ob.location + Vector(off)
        bpy.context.scene.collection.objects.link(c)
        out.append(c)
    return out


def mirror_y(ob):
    c = ob.copy()
    c.data = ob.data.copy()
    c.location.y = -ob.location.y
    c.rotation_euler.z = -ob.rotation_euler.z
    bpy.context.scene.collection.objects.link(c)
    return c


def icosphere(name, r, subdiv=3, loc=(0, 0, 0), material=None, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    return _place(_obj_from_bmesh(name, bm, material), loc, (0, 0, 0), scale)


def gable_roof(name, w, d, h, loc, material=None, overhang=0.02, rot_z=0.0):
    """Triangular prism roof, ridge along local X."""
    w2, d2 = w / 2 + overhang, d / 2 + overhang
    bm = bmesh.new()
    v = [bm.verts.new(p) for p in (
        (-w2, -d2, 0), (w2, -d2, 0), (w2, d2, 0), (-w2, d2, 0), (-w2, 0, h), (w2, 0, h))]
    for f in ((0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (0, 3, 2, 1)):
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _place(_obj_from_bmesh(name, bm, material), loc, (0, 0, rot_z))


def tapered_block(name, x0, x1, w, h, z0, material=None, taper=0.12, rake_front=0.0, rake_back=0.0,
                  y=0.0, bevel=0.0):
    """Block from x0 to x1 (aft to fore), width w, height h, sitting on z0.
    Sides lean in by `taper` of the width; ends rake back by the given amount
    at the top. Gives the angled, low-signature superstructure look."""
    wt = w * (1 - taper)
    bot = [(x0, y - w / 2, z0), (x1, y - w / 2, z0), (x1, y + w / 2, z0), (x0, y + w / 2, z0)]
    top = [(x0 + rake_back, y - wt / 2, z0 + h), (x1 - rake_front, y - wt / 2, z0 + h),
           (x1 - rake_front, y + wt / 2, z0 + h), (x0 + rake_back, y + wt / 2, z0 + h)]
    bm = bmesh.new()
    vb = [bm.verts.new(p) for p in bot]
    vt = [bm.verts.new(p) for p in top]
    bm.faces.new(list(reversed(vb)))
    bm.faces.new(vt)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj_from_bmesh(name, bm, material)
    if bevel:
        add_bevel(ob, bevel, 1)
    return ob


# ---------------------------------------------------------------------------
# Sculpting: noise displacement, faceting, material by slope
# ---------------------------------------------------------------------------


def displace(ob, scale=0.5, strength=0.2, kind="CLOUDS", depth=2, offset=(0, 0, 0), direction="NORMAL"):
    tex = bpy.data.textures.new(f"{ob.name}_tex", kind)
    if kind == "CLOUDS":
        tex.noise_scale = scale
        tex.noise_depth = depth
        tex.noise_basis = "BLENDER_ORIGINAL"
    elif kind == "VORONOI":
        tex.noise_scale = scale
        tex.distance_metric = "DISTANCE"
    empty = bpy.data.objects.new(f"{ob.name}_texspace", None)
    empty.location = offset
    bpy.context.scene.collection.objects.link(empty)
    mod = ob.modifiers.new("Displace", "DISPLACE")
    mod.texture = tex
    mod.strength = strength
    mod.mid_level = 0.5
    mod.direction = direction
    mod.texture_coords = "OBJECT"
    mod.texture_coords_object = empty
    return mod


def decimate(ob, ratio=0.3):
    mod = ob.modifiers.new("Decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    return mod


def paint_by_slope(ob, top_material, min_dot=0.72, min_z=-1e9, side_material=None):
    """Faces pointing up (normal·Z ≥ min_dot) above min_z get top_material."""
    apply_all([ob])
    me = ob.data
    if top_material.name not in [m.name for m in me.materials if m]:
        me.materials.append(top_material)
    top_idx = [m.name for m in me.materials].index(top_material.name)
    mw = ob.matrix_world
    for p in me.polygons:
        n = (mw.to_3x3() @ p.normal).normalized()
        c = mw @ p.center
        if n.z >= min_dot and c.z >= min_z:
            p.material_index = top_idx


def rng(seed):
    import random
    return random.Random(seed)


# ---------------------------------------------------------------------------
# Modifiers + finishing
# ---------------------------------------------------------------------------


def add_bevel(ob, width, segments=2):
    mod = ob.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(35)
    return mod


def _activate(ob):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def apply_all(objects):
    for ob in objects:
        _activate(ob)
        if ob.rotation_mode == "QUATERNION" or ob.rotation_euler != (0, 0, 0) or ob.scale != (1, 1, 1):
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        for mod in list(ob.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)


def join(objects, name):
    apply_all(objects)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def smooth_by_angle(ob, degrees=35):
    """Smooth shading with sharp edges above the angle (exported as split normals)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    limit = math.radians(degrees)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle() < limit
        else:
            e.smooth = False
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(ob.data)
    bm.free()


def bake_ao(ob, distance=0.25, samples=48):
    """Bake ambient occlusion into a vertex colour attribute named 'AO'.
    three.js reads it as the material's ambient occlusion, not as albedo."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.world.light_settings.distance = distance
    attr = ob.data.color_attributes.new("AO", "BYTE_COLOR", "POINT")
    ob.data.color_attributes.active_color = attr
    _activate(ob)
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")


def export(ob, path, ao_distance=0.25):
    """Finish one asset object: smooth normals, bake AO, write a .glb."""
    smooth_by_angle(ob)
    bake_ao(ob, ao_distance)
    _activate(ob)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE",
        export_image_format="NONE",
    )
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print(f"[ww] wrote {path} · {len(ob.data.vertices)} verts · {tris} tris · {len(ob.data.materials)} materials")


def build(objects, name, ao_distance=0.25):
    """Join, finish and export: the last line of every model script."""
    ob = join(objects, name)
    export(ob, out_path(), ao_distance)


__all__ = [
    "reset", "out_path", "mat", "box", "cyl", "sphere", "torus", "lathe", "loft", "strut",
    "icosphere", "gable_roof", "tapered_block", "displace", "decimate", "paint_by_slope", "rng",
    "array_copies", "mirror_y", "add_bevel", "apply_all", "join", "smooth_by_angle",
    "bake_ao", "export", "build", "Matrix", "Vector", "math", "bpy", "bmesh",
]
