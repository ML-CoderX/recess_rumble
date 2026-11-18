"""Author the shared chibi rig and editable character .blend files."""
import argparse
import math
import random
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "assets/models"
PALETTE = {
    "skin": "#ffa259", "skin_shadow": "#df7748", "ink": "#211a2b",
    "hair": "#432632", "hair_light": "#60363d", "red": "#ec203b",
    "red_light": "#ff3d50", "dark": "#30243e", "dark_light": "#51415e",
    "cream": "#f4dfcc", "white": "#fff5e6", "metal": "#9290a9",
    "metal_dark": "#474253", "chapati": "#ffe0a0", "toast": "#b8783f"
}
MATERIALS = {}
RIG = None


def material(key):
    if key in MATERIALS:
        return MATERIALS[key]
    color = PALETTE.get(key, key).lstrip("#")
    rgb = tuple(int(color[i:i + 2], 16) / 255 for i in (0, 2, 4))
    mat = bpy.data.materials.new(key)
    linear = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)
    mat.diffuse_color = (*linear, 1)
    MATERIALS[key] = mat
    return mat


def attach(obj, bone):
    if not bone:
        return obj
    obj.parent = RIG
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1, "REPLACE")
    modifier = obj.modifiers.new("Shared chibi skeleton", "ARMATURE")
    modifier.object = RIG
    return obj


def sphere(name, location, scale, color, bone=None, faceted=False):
    if faceted:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=location)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material(color))
    for polygon in obj.data.polygons:
        polygon.use_smooth = not faceted
    return attach(obj, bone)


def box(name, location, scale, color, bone=None, bevel=0.065):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material(color))
    if bevel:
        modifier = obj.modifiers.new("Soft cartoon corners", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return attach(obj, bone)


def rod(name, start, end, width, color, bone=None):
    center = (Vector(start) + Vector(end)) / 2
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=width, depth=(Vector(end) - Vector(start)).length, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (Vector(end) - Vector(start)).to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(material(color))
    return attach(obj, bone)


def setup():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_percentage = 100
    scene.render.resolution_x = scene.render.resolution_y = 256
    scene.render.fps = 12
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.studio_light = "paint.sl"
    shading.color_type = "TEXTURE"
    shading.show_specular_highlight = False
    shading.show_shadows = True
    shading.show_cavity = True
    shading.cavity_type = "BOTH"
    shading.curvature_ridge_factor = 0.32
    shading.curvature_valley_factor = 0.65
    shading.show_object_outline = True
    shading.object_outline_color = (0.055, 0.035, 0.075)
    scene.display.render_aa = "8"
    scene.view_settings.view_transform = "Standard"
    bpy.ops.object.camera_add(location=(0, -7, 7))
    camera = bpy.context.object
    camera.name = "GameCamera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.65
    camera.rotation_euler = (Vector((0, 0, 1.75)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera


def base():
    global RIG
    setup()
    skeleton = bpy.data.armatures.new("SharedChibiSkeleton")
    RIG = bpy.data.objects.new("ChibiRig", skeleton)
    bpy.context.collection.objects.link(RIG)
    bpy.context.view_layer.objects.active = RIG
    RIG.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    definitions = {
        "root": ((0, 0, 0), (0, 0, 0.45), None),
        "body": ((0, 0, 0.9), (0, 0, 2.0), "root"),
        "head": ((0, 0, 2.05), (0, 0, 3.3), "body"),
        "arm.L": ((-0.48, 0, 1.85), (-0.85, -0.1, 1.15), "body"),
        "arm.R": ((0.48, 0, 1.85), (0.85, -0.1, 1.15), "body"),
        "leg.L": ((-0.25, 0, 1.0), (-0.31, 0, 0.25), "root"),
        "leg.R": ((0.25, 0, 1.0), (0.31, 0, 0.25), "root"),
        "prop": ((0.77, -0.15, 1.25), (0.88, -0.15, 1.8), "arm.R"),
        "mechanical": ((0.36, 0.3, 1.5), (0.7, 0.2, 2.5), "body"),
        "sash": ((0.12, 0.13, 1.08), (0.85, 0.16, 0.8), "body")
    }
    for name, (head, tail, parent) in definitions.items():
        bone = skeleton.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = skeleton.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    RIG.show_in_front = True
    RIG["notes"] = "Shared skeleton. Meshes are independently editable and bound rigidly to named bones."
    sphere("Head", (0, -0.015, 2.65), (0.69, 0.53, 0.68), "skin", "head")
    sphere("Neck", (0, 0, 2.03), (0.2, 0.19, 0.22), "skin", "body")
    sphere("BaseBody.Torso", (0, 0, 1.58), (0.42, 0.27, 0.47), "skin", "body")
    sphere("BaseBody.Hips", (0, 0, 1.04), (0.34, 0.23, 0.20), "skin", "body")
    for sign, side in [(-1, "L"), (1, "R")]:
        sphere("BaseBody.Leg." + side, (sign * 0.30, 0, 0.72), (0.19, 0.21, 0.35), "skin", "leg." + side)
    for sign, side in [(-1, "L"), (1, "R")]:
        sphere("Ear." + side, (sign * 0.67, 0, 2.51), (0.13, 0.11, 0.18), "skin", "head")
        sphere("InnerEar." + side, (sign * 0.69, -0.085, 2.51), (0.06, 0.03, 0.1), "skin_shadow", "head")
    MODELS.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(MODELS / "base.blend"))


def decal(name, path, location, size, bone):
    bpy.ops.mesh.primitive_plane_add(size=1, location=location, rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0], size[1], 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    image = bpy.data.images.load(str(path), check_existing=True)
    image.pack()
    texture = mat.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    mat.node_tree.nodes.active = texture
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    mat.node_tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    mat.node_tree.links.new(texture.outputs["Alpha"], bsdf.inputs["Alpha"])
    mat.surface_render_method = "DITHERED"
    obj.data.materials.append(mat)
    attach(obj, bone)


def face(firas):
    # Thin mesh decals follow the reference's eye, brow and open-mouth shapes.
    sphere("Nose", (0, -0.557, 2.48), (0.065, 0.035, 0.049), "skin_shadow", "head")
    folder = MODELS / "textures" / ("firas" if firas else "muawiz")
    decal("Face.ReferenceEyes", folder / "eyes.png", (0, -0.558, 2.74), (1.0, 0.50), "head")
    if firas:
        sphere("Beard.Jaw", (0, -0.13, 2.27), (0.56, 0.47, 0.33), "ink", "head", True)
    decal("Face.ReferenceMouth", folder / "mouth.png", (0.015, -0.617 if firas else -0.526, 2.30),
          (0.45, 0.39), "head")


def customize(character):
    global RIG
    bpy.ops.wm.open_mainfile(filepath=str(MODELS / "base.blend"))
    MATERIALS.clear()
    RIG = bpy.data.objects["ChibiRig"]
    firas = character == "firas"
    spec = ROOT / "assets/reference" / character / "spec.md"
    text = bpy.data.texts.new("CHARACTER_SPEC.md")
    text.write(spec.read_text(encoding="utf8"))
    cloth = "cream" if firas else "dark"
    sphere("Outfit.Torso", (0, 0, 1.58), (0.5, 0.34, 0.56), cloth, "body")
    sphere("Outfit.Hips", (0, 0, 1.04), (0.42, 0.29, 0.27), cloth, "body")
    for sign, side in [(-1, "L"), (1, "R")]:
        bone = "leg." + side
        sphere("Outfit.Pants." + side, (sign * 0.30, 0, 0.72), (0.26, 0.28, 0.44), cloth, bone)
        rod("Outfit.PantStripe." + side, (sign * 0.49, -0.06, 0.39), (sign * 0.49, -0.06, 1.00), 0.046, "red", bone)
        arm = "arm." + side
        sphere("Outfit.Sleeve." + side, (sign * 0.53, 0, 1.76), (0.24, 0.24, 0.3), cloth, arm)
        sphere("Outfit.RedCuff." + side, (sign * 0.62, -0.025, 1.59), (0.23, 0.235, 0.075), "red", arm)
        sphere("Forearm." + side, (sign * 0.72, -0.12, 1.4), (0.2, 0.21, 0.3), "skin", arm)
        sphere("Glove." + side, (sign * 0.81, -0.20, 1.23), (0.25, 0.25, 0.25), "dark", arm)
        for i in range(3):
            sphere("Glove.Knuckle." + side, (sign * 0.81 + (i - 1) * 0.12, -0.42, 1.3), (0.06, 0.05, 0.07), "skin", arm)
        if firas:
            sphere("Foot." + side, (sign * 0.31, -0.10, 0.27), (0.245, 0.35, 0.16), "skin", bone)
            box("Sandal.Sole." + side, (sign * 0.31, -0.13, 0.13), (0.52, 0.72, 0.14), "dark", bone)
            box("Sandal.Strap." + side, (sign * 0.31, -0.1, 0.31), (0.51, 0.20, 0.11), "dark", bone)
            for toe in range(4):
                sphere("Foot.Toe." + side, (sign * 0.31 + (toe - 1.5) * 0.095, -0.405, 0.25),
                       (0.05, 0.055, 0.055), "skin", bone)
        else:
            sphere("Boot." + side, (sign * 0.31, -0.12, 0.28), (0.28, 0.39, 0.26), "dark", bone)
            box("Boot.Sole." + side, (sign * 0.31, -0.15, 0.12), (0.56, 0.77, 0.13), "white", bone)
            box("Boot.RedTrim." + side, (sign * 0.31, -0.37, 0.27), (0.48, 0.12, 0.16), "red", bone)
            box("Boot.Cuff." + side, (sign * 0.31, -0.28, 0.46), (0.47, 0.14, 0.16), "metal", bone)
    random.seed(17 if firas else 7)
    sphere("Hair.Cap", (0, 0.045, 2.99), (0.72, 0.54, 0.42), "ink" if firas else "hair", "head", True)
    for ring, count in [(0, 9), (1, 10), (2, 6)]:
        for i in range(count):
            a = math.tau * i / count
            r = [0.57, 0.40, 0.20][ring]
            z = [3.04, 3.30, 3.42][ring] + random.uniform(-0.06, 0.06)
            sphere("Hair.Curl.%02d.%02d" % (ring, i), (math.cos(a) * r, math.sin(a) * r * 0.80, z),
                   (0.25, 0.24, 0.24), ("dark_light" if i % 3 == 0 else "dark") if firas else ("hair_light" if i % 3 == 0 else "hair"),
                   "head", True)
    face(firas)
    box("Sash.Belt", (0, -0.015, 1.11), (0.95, 0.66, 0.13), "red", "body")
    sphere("Sash.Knot", (0.12, -0.37, 1.09), (0.16, 0.11, 0.13), "red_light", "body", True)
    for z, x in [(0.97, 0.70), (0.78, 0.70)]:
        sash = box("Sash.Tail", (x, 0.16, z), (1.05, 0.065, 0.20), "red", "sash")
        sash.rotation_euler.y = -0.32
    if firas:
        decal("Outfit.ReferenceLettering", MODELS / "textures/firas/shirt.png",
              (0, -0.352, 1.62), (0.69, 0.42), "body")
        box("Prop.Backpack", (0, 0.41, 1.64), (0.67, 0.32, 0.73), "dark", "body")
        joints = [(0.29, 0.52, 1.49), (0.61, 0.55, 2.0), (0.9, 0.36, 2.45), (0.92, -0.1, 2.67)]
        for i, (start, end) in enumerate(zip(joints, joints[1:])):
            rod("Prop.MechanicalArm.%d" % i, start, end, 0.092, "metal", "mechanical")
            sphere("Prop.Servo.%d" % i, start, (0.145, 0.135, 0.145), "dark", "mechanical", True)
            sphere("Prop.ServoBolt.%d" % i, (start[0], start[1] - 0.13, start[2]), (0.06, 0.025, 0.06), "metal", "mechanical")
        box("Prop.LaserClaw", joints[-1], (0.33, 0.3, 0.22), "dark", "mechanical")
        box("Prop.LaserLens", (0.92, -0.26, 2.67), (0.22, 0.04, 0.08), "red_light", "mechanical")
        box("Prop.Sticker", (-0.83, -0.46, 1.23), (0.25, 0.025, 0.25), "white", "arm.L")
        sphere("Prop.StickerStar", (-0.83, -0.48, 1.23), (0.08, 0.015, 0.08), "red", "arm.L", True)
        rod("Outfit.Collar", (-0.24, -0.26, 1.94), (0.24, -0.26, 1.94), 0.07, "red", "body")
    else:
        box("Outfit.SilverBuckle", (0, -0.371, 1.11), (0.25, 0.065, 0.17), "metal", "body", 0.025)
        box("Outfit.BuckleInset", (0, -0.411, 1.11), (0.13, 0.018, 0.08), "red", "body", 0.01)
        for x in [-0.2, 0.2]:
            rod("Outfit.WhiteZip", (x, -0.32, 1.18), (x * 0.9, -0.30, 1.96), 0.025, "white", "body")
        for sign in [-1, 1]:
            collar = box("Outfit.HighCollar", (sign * 0.21, -0.02, 2.0), (0.32, 0.23, 0.28), "dark_light", "body")
            collar.rotation_euler.y = sign * -0.32
            box("Outfit.ShoulderRed", (sign * 0.44, -0.12, 1.88), (0.23, 0.28, 0.12), "red", "body")
        box("Outfit.ChestEmblem", (0.32, -0.292, 1.68), (0.12, 0.035, 0.13), "white", "body")
        sphere("Prop.Chapati", (0.88, -0.48, 1.25), (0.36, 0.058, 0.36), "chapati", "prop")
        for i in range(16):
            a = i * 2.4
            r = 0.26 * math.sqrt((i + 1) / 16)
            sphere("Prop.ToastSpot.%02d" % i, (0.88 + math.cos(a) * r, -0.536, 1.25 + math.sin(a) * r),
                   (0.025 + i % 3 * 0.008, 0.009, 0.024 + i % 2 * 0.012), "toast", "prop", True)
    for obj in bpy.data.objects:
        obj.select_set(False)
    RIG.select_set(True)
    bpy.context.view_layer.objects.active = RIG
    animate(character)
    RIG["reference"] = "assets/reference/" + ("Nigamon_Firas.png" if firas else "Muawiz_the_Great.png")
    RIG["reference_status"] = "Side/back reconstructed with user approval; written spec is in CHARACTER_SPEC.md."
    bpy.ops.wm.save_as_mainfile(filepath=str(MODELS / (character + ".blend")))


def animate(character):
    states = {"idle": (6, True), "walk": (8, True), "attack": (6, False),
              "super": (8, False), "hurt": (4, False), "defeat": (6, False)}
    if character == "muawiz":
        states["nap"] = (6, True)
    scene = bpy.context.scene
    markers = []
    for state, (count, loop) in states.items():
        first = len(markers) * 20 + 1
        fps = {"idle": 10, "walk": 12, "attack": 24, "super": 16, "hurt": 18, "defeat": 12, "nap": 10}[state]
        markers.append({"name": state, "start": first, "frames": count, "fps": fps, "loop": loop})
        scene.timeline_markers.new(state, frame=first)
        for i in range(count):
            t = i / max(1, count - 1)
            phase = i / count * math.tau
            for bone in RIG.pose.bones:
                bone.rotation_mode = "XYZ"
                bone.location = (0, 0, 0)
                bone.rotation_euler = (0, 0, 0)
                bone.scale = (1, 1, 1)
            body, head, root = (RIG.pose.bones[key] for key in ["body", "head", "root"])
            RIG.pose.bones["arm.L"].rotation_euler.x = -0.40
            RIG.pose.bones["arm.R"].rotation_euler.x = -0.56
            body.location.y = math.sin(phase) * 0.025
            head.rotation_euler.y = math.sin(phase) * 0.025
            head.rotation_euler.x = -0.16
            if state == "walk":
                for sign, side in [(-1, "L"), (1, "R")]:
                    RIG.pose.bones["leg." + side].rotation_euler.x = sign * math.sin(phase) * 0.40
                    RIG.pose.bones["arm." + side].rotation_euler.x = -sign * math.sin(phase) * 0.22
                body.location.y = abs(math.sin(phase)) * 0.055
            elif state == "attack":
                swing = math.sin(t * math.pi)
                RIG.pose.bones["arm.R"].rotation_euler.x = -swing * 1.1
                body.rotation_euler.y = swing * 0.2
                RIG.pose.bones["mechanical"].rotation_euler.x = -swing * 0.42
            elif state == "super":
                swing = math.sin(t * math.pi)
                body.scale = (1 + swing * 0.08, 1 + swing * 0.08, 1 - swing * 0.06)
                RIG.pose.bones["arm.R"].rotation_euler.x = -swing * 1.7
                RIG.pose.bones["arm.L"].rotation_euler.x = -swing * 0.45
                RIG.pose.bones["mechanical"].rotation_euler.x = -swing * 0.7
                head.rotation_euler.x = -swing * 0.15
            elif state == "hurt":
                body.rotation_euler.x = -math.sin(t * math.pi) * 0.23
                head.rotation_euler.x = math.sin(t * math.pi) * 0.18
            elif state == "defeat":
                root.rotation_euler.x = -t * 1.2
                root.location.y = -t * 0.06
                RIG.pose.bones["arm.L"].rotation_euler.z = t * 0.6
                RIG.pose.bones["arm.R"].rotation_euler.z = -t * 0.6
            elif state == "nap":
                head.rotation_euler.x = 0.32 + math.sin(phase) * 0.045
                body.scale = (1 + math.sin(phase) * 0.025, 1 + math.sin(phase) * 0.025, 0.97)
                RIG.pose.bones["leg.L"].rotation_euler.x = -0.2
                RIG.pose.bones["leg.R"].rotation_euler.x = -0.2
            RIG.pose.bones["sash"].rotation_euler.x = math.sin(phase) * 0.13
            for bone in RIG.pose.bones:
                for channel in ["location", "rotation_euler", "scale"]:
                    bone.keyframe_insert(data_path=channel, frame=first + i)
    scene["sprite_animations"] = __import__("json").dumps(markers)
    scene.frame_end = markers[-1]["start"] + markers[-1]["frames"] - 1
    scene.frame_set(1)
    if RIG.animation_data and RIG.animation_data.action:
        RIG.animation_data.action.name = character + "_all_animations"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--character", choices=["muawiz", "firas", "all"], default="all")
    args = parser.parse_args(__import__("sys").argv[__import__("sys").argv.index("--") + 1:] if "--" in __import__("sys").argv else [])
    base()
    for character in (["muawiz", "firas"] if args.character == "all" else [args.character]):
        customize(character)
