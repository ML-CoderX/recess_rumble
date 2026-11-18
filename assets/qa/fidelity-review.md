# Blender fidelity review

The user approved reconstructing unseen views from the two existing three-quarter
references. The new spec files record that reconstruction. No front/side/back
reference set was supplied. Comparison panels reuse the source image with an
explicit label, alongside actual front, side and back model renders.

## Pass 1

Visible differences in both models:

- Material values were too pale and the skin looked beige.
- Curl meshes had visible rectangular shading grids.
- Eyes and mouth were generic and did not reproduce the reference expression.
- Firas had a floating moustache instead of a continuous full beard.
- Firas's shirt lettering and visible toes were absent.
- Muawiz's buckle was absent and the nose was too prominent.
- Gloves hung down, and sash tails were too short to read in the front view.
- Props, eyes, and clothing were more simplified than the illustration.

Corrections:

- Converted reference palette values from sRGB to linear material values.
- Disabled specular glare and reduced cavity highlights.
- Changed curls to faceted icospheres.
- Extracted actual eye, mouth and shirt-lettering pixels into packed decals.
- Replaced separate beard tufts with a continuous jaw mesh.
- Added sandal toes, a silver/red buckle, and a smaller nose.
- Raised the default arms and lengthened separate sash meshes.

## Passes 2 and 3

Front, side, and back re-rendered after the corrections. The outfit palette,
large head, dark curls, face expression, red trim/sashes, gloves, footwear,
Muawiz's chapati, and Firas's backpack laser arm are readable in the new models.
The shirt lettering now comes from the source image. The shared anatomical body
and skeleton are present in base.blend and in both character files.

Remaining visible differences:

- The models have a more symmetrical standing pose and rounder body geometry.
- Curl clusters and cloth folds are simplified and faceted.
- The small white jacket emblem is simplified rather than an exact illustration.
- Firas's beard silhouette is more angular and compact.
- The reference's lighting and painted outlines are approximated with Workbench
  studio lighting, material colors, cavity shading and object outlines.
- Projected face decals flatten at steep side angles. Their expression matches
  the existing reference but is not a fully deformable facial rig.
- Firas's mechanical arm is above his shoulder as specified in the game brief.
  The source picture places a mechanical prop lower on the body.
- Side/back details remain inferred and cannot be verified against missing views.

The final comparison images document these remaining reconstruction differences.
They are not an assertion of exact orthographic fidelity.

## Gameplay-angle pass

The first eight-direction contact sheet showed too much hair over the face and
clipped sideways defeat poses. The final camera uses a 45-degree tilt, with a
small upward idle head tilt. The exporter measures each evaluated pose and
adjusts the camera padding to keep it in frame. Per-frame scale and foot anchors
in the atlas preserve the character's apparent game scale and ground position.
