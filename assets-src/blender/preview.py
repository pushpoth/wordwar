"""Render a built .glb to a PNG for quick visual review.
    blender --background --factory-startup --python preview.py -- in.glb out.png
Shows the AO attribute multiplied in, roughly how three.js will shade it."""

import math
import sys

import bpy
from mathutils import Vector

src, dst = sys.argv[sys.argv.index("--") + 1 :][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]

# Multiply the AO colour attribute into base colour so occlusion is visible.
for m in {s.material for o in objs for s in o.material_slots if s.material}:
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    ao = nt.nodes.new("ShaderNodeVertexColor")
    ao.layer_name = "Color"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    base = bsdf.inputs["Base Color"]
    if base.links:
        nt.links.new(base.links[0].from_socket, mix.inputs[6])
    else:
        mix.inputs[6].default_value = base.default_value
    nt.links.new(ao.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], base)

# Frame the bounds.
lo = Vector((1e9,) * 3)
hi = Vector((-1e9,) * 3)
for o in objs:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w))
        hi = Vector(map(max, hi, w))
center = (lo + hi) / 2
radius = (hi - lo).length / 2

scene = bpy.context.scene
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
cam.data.lens = 60
d = radius * 3.4
cam.location = center + Vector((d * 0.75, -d * 0.85, d * 0.55))
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4.0
sun.data.color = (1.0, 0.85, 0.68)
sun.rotation_euler = (math.radians(55), 0, math.radians(35))
scene.collection.objects.link(sun)

world = bpy.data.worlds.new("w")
scene.world = world
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.09, 0.16, 0.24, 1)
bg.inputs["Strength"].default_value = 1.2

scene.render.engine = "CYCLES"
scene.cycles.samples = 64
scene.cycles.device = "CPU"
scene.render.resolution_x = 900
scene.render.resolution_y = 700
scene.view_settings.view_transform = "AgX"
scene.render.filepath = dst
bpy.ops.render.render(write_still=True)
print(f"[ww] preview {dst}")
