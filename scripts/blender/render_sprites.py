"""Render animations already authored in a .blend. Never rebuild meshes here."""
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

parser = argparse.ArgumentParser()
parser.add_argument("--out", required=True)
parser.add_argument("--qa-only", action="store_true")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
rig = bpy.data.objects["ChibiRig"]
camera = scene.camera
scene.render.resolution_x = scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
animations = json.loads(scene["sprite_animations"])
scene.frame_set(animations[0]["start"])
root_rotation = rig.rotation_euler.copy()

# Orthographic fidelity views use the same material/outline settings as the sprites.
for name, position in [("front", (0, -8, 1.82)), ("side", (8, 0, 1.82)), ("back", (0, 8, 1.82))]:
    camera.location = position
    camera.rotation_euler = (Vector((0, 0, 1.82)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = 4.1
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.filepath = str(out / (name + ".png"))
    bpy.ops.render.render(write_still=True)
if args.qa_only:
    sys.exit(0)

scene.render.resolution_x = scene.render.resolution_y = 256
camera.location = (0, -8, 9.68)
camera.rotation_euler = (Vector((0, 0, 1.68)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.ortho_scale = 6.2
bpy.context.view_layer.update()
ground = world_to_camera_view(scene, camera, Vector((0, 0, 0.1)))
anchor = [ground.x, 1 - ground.y]
frames = []
for animation in animations:
    for direction in range(8):
        # Screen angle 0 faces right. Blender front faces -Y.
        rig.rotation_euler.z = math.pi / 2 - direction * math.pi / 4
        for index in range(animation["frames"]):
            scene.frame_set(animation["start"] + index)
            camera.data.ortho_scale = 6.2
            bpy.context.view_layer.update()
            graph = bpy.context.evaluated_depsgraph_get()
            extent = 0.47
            for obj in scene.objects:
                if obj.type != "MESH" or obj.hide_render:
                    continue
                evaluated = obj.evaluated_get(graph)
                for corner in evaluated.bound_box:
                    point = world_to_camera_view(scene, camera, evaluated.matrix_world @ Vector(corner))
                    extent = max(extent, abs(point.x - 0.5), abs(point.y - 0.5))
            scale = max(1, extent / 0.47)
            camera.data.ortho_scale = 6.2 * scale
            origin = world_to_camera_view(scene, camera, Vector((0, 0, 0.1)))
            filename = "%s_%d_%02d.png" % (animation["name"], direction, index)
            scene.render.filepath = str(out / filename)
            bpy.ops.render.render(write_still=True)
            frames.append({"state": animation["name"], "direction": direction, "index": index,
                           "file": filename, "anchor": [origin.x, 1 - origin.y], "scale": scale})
rig.rotation_euler = root_rotation
(out / "frames.json").write_text(json.dumps({"animations": animations, "frames": frames, "anchor": anchor}), encoding="utf8")
print("SPRITES_RENDERED", len(frames), flush=True)
