# Poodle asset prompt pack

This is the copy-ready English prompt set for the electronic-pet interaction project. Keep the identity, technical and negative blocks unchanged. Only replace the `CAMERA`, `EXPRESSION` or `PART` block for a new asset.

## 1. Reference images to provide

Use these references in the image tool's **reference image / image prompt** slots:

| Purpose | Reference image | Use |
|---|---|---|
| Identity anchor | `poodle_image_half_body/front_view.png` | Always include for a new generation batch. This is the canonical dog. |
| Horizontal angle | The closest existing view in `poodle_image_half_body/` | `30_left.png`, `30_right.png`, `60_left.png`, `90_left.png`, `90_right.png`, `15_right.png` |
| Camera height | `45_above.png` or `45_upward.png` | Use only for `pA45` or `pB45`; do not mix their meanings. |
| Final style reference | `assets/characters/poodle/pose/poodle_pose_yC00_pC00.png` | Use for layers, expressions, blink and mouth edits after the pose is approved. |

Do not use `above.png` as the identity reference: it is a different close-up crop. For every batch, lock one model/version, seed and reference-image strength, then change only the variable prompt block.

## 2. Shared prompt constants

### BASE

```text
a chibi-realistic 3D rendered chocolate-brown toy poodle, bust portrait from mid-chest up, dense tightly-curled dark chocolate fur, long wavy floppy ears framing the face, oversized round eyes with amber-orange irises and large glossy black pupils, small rounded brown nose, short soft muzzle, Pixar-style stylized character design, subtle subsurface scattering on the fur
```

### TECH (whole-pose images)

```text
even soft studio key light from the front-left at 45 degrees, gentle ambient fill, no rim light, no backlight, no vignette, flat pure white seamless background, subject centered horizontally, head occupying the upper 45% of the frame, sharp focus, 1024x1024
```

### NEGATIVE

```text
vignette, dark background, gradient background, colored background, rim lighting, backlight, dramatic lighting, harsh shadows, watermark, text, signature, multiple dogs, full body, legs, paws, collar, leash, blurry, out of focus, extra eyes, asymmetric eyes, distorted anatomy, cropped ears, human features
```

For a whole pose, assemble: `BASE + CAMERA + EXPRESSION + TECH`. Generate on white, then run the project's cutout tool; do not ask the model for alpha.

## 3. Pose prompts

Use this shared ending for all rows:

```text
calm neutral expression, mouth closed, wide innocent stare, [TECH]
```

| Output | CAMERA block | Give the tool these references |
|---|---|---|
| `yC00_pC00` | `head facing the camera straight on, symmetrical frontal view, both eyes equally visible, camera at the dog's eye level` | `front_view.png` |
| `yL15_pC00` | `head turned slightly 15 degrees toward the viewer's left, near-frontal view, camera at the dog's eye level` | `front_view.png` + `15_right.png` |
| `yR15_pC00` | `head turned slightly 15 degrees toward the viewer's right, near-frontal view, camera at the dog's eye level` | `front_view.png` + `15_right.png` |
| `yL30_pC00` | `head turned 30 degrees toward the viewer's left, three-quarter view, far eye slightly foreshortened, camera at the dog's eye level` | `front_view.png` + `30_left.png` |
| `yR30_pC00` | `head turned 30 degrees toward the viewer's right, three-quarter view, far eye slightly foreshortened, camera at the dog's eye level` | `front_view.png` + `30_right.png` |
| `yL60_pC00` | `head turned 60 degrees toward the viewer's left, strong three-quarter view, muzzle pointing left, far eye partially hidden behind the muzzle, camera at the dog's eye level` | `front_view.png` + `60_left.png` |
| `yR60_pC00` | `head turned 60 degrees toward the viewer's right, strong three-quarter view, muzzle pointing right, far eye partially hidden behind the muzzle, camera at the dog's eye level` | `front_view.png` + `60_left.png` |
| `yL90_pC00` | `full profile view, head turned 90 degrees to the viewer's left, only one eye visible, clean side silhouette of the muzzle, camera at the dog's eye level` | `front_view.png` + `90_left.png` |
| `yR90_pC00` | `full profile view, head turned 90 degrees to the viewer's right, only one eye visible, clean side silhouette of the muzzle, camera at the dog's eye level` | `front_view.png` + `90_right.png` |
| `yC00_pA45` | `head facing the camera straight on, camera positioned 45 degrees above looking down at the dog, top of the curly head prominent, eyes looking up into the lens` | `front_view.png` + `45_above.png` |
| `yC00_pB45` | `head facing the camera straight on, camera positioned 45 degrees below looking up at the dog, underside of the muzzle and chin visible, low angle` | `front_view.png` + `45_upward.png` |

Example complete prompt:

```text
BASE, head turned 60 degrees toward the viewer's left, strong three-quarter view, muzzle pointing left, far eye partially hidden behind the muzzle, camera at the dog's eye level, calm neutral expression, mouth closed, wide innocent stare, TECH
```

Replace the literal `BASE` and `TECH` tokens with the full constant blocks above before submitting.

## 4. Expressions

Use the approved neutral pose as the structural reference and replace only the expression clause. Generate these three camera angles first: `yC00_pC00`, `yL30_pC00`, `yR30_pC00`.

```text
happy expression, mouth open in a soft smile, tongue tip slightly out, eyes softly narrowed into gentle arcs
excited expression, mouth wide open, tongue out, eyes wide and bright, ears lifted
sad expression, inner brows tilted up, eyes glossy and downcast, mouth closed in a small frown, ears drooping lower
angry expression, brows lowered and drawn together, muzzle slightly wrinkled, ears pinned back
sleepy expression, eyes half-closed with heavy lids, mouth in a small yawn, head slightly drooping
surprised expression, eyes opened extremely wide, pupils dilated, mouth open in a small round shape, ears perked straight up
curious expression, head tilted to one side, one ear raised higher than the other, eyes wide and attentive, mouth closed
```

Append `TECH` after the expression clause. Use the neutral final pose plus `front_view.png` as references; do not use a different dog image for each emotion.

## 5. Layers and animation frames

These are image-editing / inpainting jobs, not fresh character generations. Give the tool the full final composite `assets/characters/poodle/pose/poodle_pose_yC00_pC00.png` and ask for a full 1024x1024 transparent canvas.

Shared layer prompt:

```text
Edit the supplied approved toy poodle composite. Reconstruct hidden pixels where necessary so the part can move without holes. Keep the exact original camera, canvas alignment, fur color, lighting and proportions. Output one 1024x1024 RGBA PNG with only the requested PART visible and every other pixel fully transparent. No crop, no white background, no shadow, no text.
```

Replace `PART` with one of: `body`, `head`, `ear_l`, `ear_r`, `eye_l_white`, `eye_r_white`, `iris_l`, `iris_r`, `lid_l`, `lid_r`, `brow_l`, `brow_r`, `nose`, `mouth`, `tongue`. For `head`, paint the hidden area behind the ears as well.

Blink prompt:

```text
Edit only the requested eyelid on the approved composite. Preserve the exact eye position and fur. PART = eyes half closed, upper eyelids covering the top half of the eyes / eyes fully closed with smooth curved closed eyelids. Output a full-canvas 1024x1024 RGBA PNG; only the eyelid layer is visible, all other pixels transparent.
```

Mouth prompt:

```text
Edit only the mouth and tongue on the approved composite. Keep the muzzle, nose, eyes and fur unchanged. PART = mouth completely closed, lips relaxed / mouth barely parted, thin dark gap / mouth half open, tongue tip visible, no teeth showing / mouth wide open in a rounded shape, tongue clearly visible / mouth open with tongue hanging out to one side, panting. Output a full-canvas transparent RGBA PNG with only mouth and tongue visible.
```

## 6. Non-character image prompts

All of these use a transparent background, clean edges, no text and no watermark.

| Asset | Prompt |
|---|---|
| Shadow | `soft elliptical contact shadow for a small toy poodle standing on a floor, warm brown-gray, very subtle opacity, feathered edges, top-down neutral view, transparent background, 1024x1024` |
| Ball | `single small red and cream rubber dog ball, cute 3D game asset, soft studio light, centered, isolated, transparent background, no text, 512x512` |
| Bone | `single small cream-colored dog bone toy with rounded ends, cute 3D game asset, centered, isolated, transparent background, no text, 512x512` |
| Empty bowl | `single small pastel ceramic dog bowl, empty, rounded friendly 3D game asset, centered, isolated, transparent background, no text, 512x512` |
| Full bowl | `same pastel ceramic dog bowl, filled with appetizing kibble, identical camera and scale to the empty bowl, centered, isolated, transparent background, no text, 512x512` |
| Heart FX | `four-frame sequence of small warm pink hearts floating upward, soft rounded 3D game UI effect, transparent background, no text` |
| Star FX | `four-frame sequence of small golden stars popping outward, soft rounded 3D game UI effect, transparent background, no text` |
| Zzz FX | `three-frame sequence of lavender Z symbols drifting upward, soft rounded 3D game UI effect, transparent background, no text` |
| Speech bubble | `rounded cream speech bubble UI panel with a small tail on the lower left, subtle warm shadow, empty interior for runtime text, transparent background, no text, 1024x512` |
| Living-room background | `cozy warm minimal living room for a cute pet game, soft cream walls, wooden floor, empty center stage, no characters, no text, 16:9` |

For UI bars and buttons, use the speech-bubble palette as the style reference and export normal, hover and pressed states separately. UI text should be rendered by code, not baked into the image.

## 7. Exact output locations

| Asset type | Directory and filename pattern |
|---|---|
| Whole pose | `assets/characters/poodle/pose/poodle_pose_{pose}.png` |
| Expression | `assets/characters/poodle/expression/poodle_expr_{pose}_{emotion}.png` |
| Layer | `assets/characters/poodle/layers/{pose}/poodle_layer_{pose}_{part}.png` |
| Blink | `assets/characters/poodle/anim/blink/poodle_blink_{pose}_f01.png` |
| Mouth | `assets/characters/poodle/anim/mouth/poodle_mouth_{pose}_{viseme}.png` |
| Ear | `assets/characters/poodle/anim/ear/poodle_ear_{pose}_f02.png` |
| Shadow | `assets/characters/poodle/shadow/poodle_shadow_{yaw}.png` |
| Props | `assets/props/prop_{name}[_{state}].png` |
| Scenes | `assets/scenes/scene_{name}_{layer}.png` |
| FX | `assets/fx/fx_{name}_f00.png` (and the other frame numbers) |
| UI | `assets/ui/ui_{name}[_{state}].png` |
| Voice | `assets/audio/voice/voice_{emotion}_{number}.wav` |
| SFX | `assets/audio/sfx/sfx_{name}.wav` |
| BGM | `assets/audio/bgm/bgm_daytime.ogg` |

After generation, run `python process_image/image_masking.py report`, keep only 1024x1024 RGBA PNGs with transparent corners, then update the corresponding `file` and `status` fields in `assets/manifest.json`. Do not hard-code new asset paths in `app.js`.
