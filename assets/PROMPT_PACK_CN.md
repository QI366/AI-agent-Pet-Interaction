# 泰迪电子养宠素材生成中文说明

本文件是英文提示词包的中文使用说明。实际提交给生图工具的提示词仍建议使用英文；中文部分用于确认参考图、生成目标和文件落盘位置。

配套英文提示词：[PROMPT_PACK.md](PROMPT_PACK.md)

## 一、统一原则

1. 所有狗狗素材必须保持同一只泰迪：毛色、眼睛、耳朵长度、鼻子形状和脸部比例不能漂移。
2. 每一批生成都固定同一个模型版本、seed、LoRA / 参考图强度、尺寸和采样参数，只修改角度或表情描述。
3. 整图姿态先生成白底 PNG，再使用 `process_image/image_masking.py` 抠成真实透明背景。
4. 分层、动画、道具、特效和 UI 素材直接输出透明 RGBA PNG。
5. 所有角色画布统一为 1024×1024；两眼中点应对齐到 `(512, 430)`。

## 二、应该提供哪些示例图

| 生成目标 | 必须提供的示例图 | 说明 |
|---|---|---|
| 所有新狗狗姿态 | `poodle_image_half_body/front_view.png` | 这是角色身份基准图，每一批都建议提供。 |
| 左右转头 | 对应方向的 `30_left.png`、`30_right.png`、`60_left.png`、`90_left.png`、`90_right.png`、`15_right.png` | 用最接近目标角度的图片辅助控制脸型和耳朵。 |
| 俯视角 `pA45` | `poodle_image_half_body/45_above.png` | 表示相机从狗狗上方俯视。 |
| 仰视角 `pB45` | `poodle_image_half_body/45_upward.png` | 表示相机从狗狗下方仰视。 |
| 表情、分层、眨眼、口型 | `assets/characters/poodle/pose/poodle_pose_yC00_pC00.png` | 使用已经确认过的中性姿态作为结构和光照基准。 |
| 道具、FX、UI | 通常不需要狗狗示例图；可额外提供 `front_view.png` 作为色彩风格参考。 | 不能让道具生成出狗狗或文字。 |
| 场景 | 不提供狗狗图 | 场景中央留空，狗狗由程序叠加。 |
| 音频 | 不需要图片 | 根据下方音频规格生成。 |

注意：`poodle_image_half_body/above.png` 是不同取景的头部特写，不要把它当作角色身份基准图。

## 三、固定英文提示词块

### 1. 角色基准 BASE

```text
a chibi-realistic 3D rendered chocolate-brown toy poodle, bust portrait from mid-chest up, dense tightly-curled dark chocolate fur, long wavy floppy ears framing the face, oversized round eyes with amber-orange irises and large glossy black pupils, small rounded brown nose, short soft muzzle, Pixar-style stylized character design, subtle subsurface scattering on the fur
```

### 2. 整图技术块 TECH

```text
even soft studio key light from the front-left at 45 degrees, gentle ambient fill, no rim light, no backlight, no vignette, flat pure white seamless background, subject centered horizontally, head occupying the upper 45% of the frame, sharp focus, 1024x1024
```

### 3. 负面提示词 NEGATIVE

```text
vignette, dark background, gradient background, colored background, rim lighting, backlight, dramatic lighting, harsh shadows, watermark, text, signature, multiple dogs, full body, legs, paws, collar, leash, blurry, out of focus, extra eyes, asymmetric eyes, distorted anatomy, cropped ears, human features
```

整图的组装方式：

```text
BASE + CAMERA + EXPRESSION + TECH
```

不要把 `BASE`、`CAMERA`、`EXPRESSION`、`TECH` 这些占位符原样提交，必须替换成完整英文内容。

## 四、姿态生成提示词

每个姿态都使用：`BASE + 对应 CAMERA + 中性表情 + TECH`。

中性表情英文块：

```text
calm neutral expression, mouth closed, wide innocent stare
```

| 姿态 ID | CAMERA 英文提示词 | 输出文件 |
|---|---|---|
| `yC00_pC00` | `head facing the camera straight on, symmetrical frontal view, both eyes equally visible, camera at the dog's eye level` | `poodle_pose_yC00_pC00.png` |
| `yL15_pC00` | `head turned slightly 15 degrees toward the viewer's left, near-frontal view, camera at the dog's eye level` | `poodle_pose_yL15_pC00.png` |
| `yR15_pC00` | `head turned slightly 15 degrees toward the viewer's right, near-frontal view, camera at the dog's eye level` | `poodle_pose_yR15_pC00.png` |
| `yL30_pC00` | `head turned 30 degrees toward the viewer's left, three-quarter view, far eye slightly foreshortened, camera at the dog's eye level` | `poodle_pose_yL30_pC00.png` |
| `yR30_pC00` | `head turned 30 degrees toward the viewer's right, three-quarter view, far eye slightly foreshortened, camera at the dog's eye level` | `poodle_pose_yR30_pC00.png` |
| `yL60_pC00` | `head turned 60 degrees toward the viewer's left, strong three-quarter view, muzzle pointing left, far eye partially hidden behind the muzzle, camera at the dog's eye level` | `poodle_pose_yL60_pC00.png` |
| `yR60_pC00` | `head turned 60 degrees toward the viewer's right, strong three-quarter view, muzzle pointing right, far eye partially hidden behind the muzzle, camera at the dog's eye level` | `poodle_pose_yR60_pC00.png` |
| `yL90_pC00` | `full profile view, head turned 90 degrees to the viewer's left, only one eye visible, clean side silhouette of the muzzle, camera at the dog's eye level` | `poodle_pose_yL90_pC00.png` |
| `yR90_pC00` | `full profile view, head turned 90 degrees to the viewer's right, only one eye visible, clean side silhouette of the muzzle, camera at the dog's eye level` | `poodle_pose_yR90_pC00.png` |
| `yC00_pA45` | `head facing the camera straight on, camera positioned 45 degrees above looking down at the dog, top of the curly head prominent, eyes looking up into the lens` | `poodle_pose_yC00_pA45.png` |
| `yC00_pB45` | `head facing the camera straight on, camera positioned 45 degrees below looking up at the dog, underside of the muzzle and chin visible, low angle` | `poodle_pose_yC00_pB45.png` |

生成左右角度时，建议同时提供 `front_view.png` 和最近的已有角度图。例如生成 `yL60_pC00`，提供 `front_view.png + 60_left.png`。

## 五、表情提示词

优先生成以下三个姿态：`yC00_pC00`、`yL30_pC00`、`yR30_pC00`。每张图都使用对应的中性姿态作为参考，只替换表情描述。

```text
happy expression, mouth open in a soft smile, tongue tip slightly out, eyes softly narrowed into gentle arcs
```

```text
excited expression, mouth wide open, tongue out, eyes wide and bright, ears lifted
```

```text
sad expression, inner brows tilted up, eyes glossy and downcast, mouth closed in a small frown, ears drooping lower
```

```text
angry expression, brows lowered and drawn together, muzzle slightly wrinkled, ears pinned back
```

```text
sleepy expression, eyes half-closed with heavy lids, mouth in a small yawn, head slightly drooping
```

```text
surprised expression, eyes opened extremely wide, pupils dilated, mouth open in a small round shape, ears perked straight up
```

```text
curious expression, head tilted to one side, one ear raised higher than the other, eyes wide and attentive, mouth closed
```

文件位置：

```text
assets/characters/poodle/expression/poodle_expr_{pose}_{emotion}.png
```

例如：

```text
assets/characters/poodle/expression/poodle_expr_yC00_pC00_happy.png
```

## 六、分层与动画素材

这些任务应使用图像编辑 / 局部重绘，不要重新生成一只狗。示例图使用：

```text
assets/characters/poodle/pose/poodle_pose_yC00_pC00.png
```

通用英文提示词：

```text
Edit the supplied approved toy poodle composite. Reconstruct hidden pixels where necessary so the part can move without holes. Keep the exact original camera, canvas alignment, fur color, lighting and proportions. Output one 1024x1024 RGBA PNG with only the requested PART visible and every other pixel fully transparent. No crop, no white background, no shadow, no text.
```

把 `PART` 替换为以下部位之一：

```text
body, head, ear_l, ear_r, eye_l_white, eye_r_white, iris_l, iris_r, lid_l, lid_r, brow_l, brow_r, nose, mouth, tongue
```

分层输出位置：

```text
assets/characters/poodle/layers/yC00_pC00/
```

文件名示例：

```text
poodle_layer_yC00_pC00_iris_l.png
poodle_layer_yC00_pC00_iris_r.png
poodle_layer_yC00_pC00_lid_l.png
```

### 眨眼

```text
Edit only the requested eyelid on the approved composite. Preserve the exact eye position and fur. PART = eyes half closed, upper eyelids covering the top half of the eyes / eyes fully closed with smooth curved closed eyelids. Output a full-canvas 1024x1024 RGBA PNG; only the eyelid layer is visible, all other pixels transparent.
```

输出位置：

```text
assets/characters/poodle/anim/blink/poodle_blink_yC00_pC00_f01.png
assets/characters/poodle/anim/blink/poodle_blink_yC00_pC00_f02.png
```

### 口型

五个口型：`closed`、`slight`、`mid`、`wide`、`tongue`。

```text
Edit only the mouth and tongue on the approved composite. Keep the muzzle, nose, eyes and fur unchanged. PART = mouth completely closed, lips relaxed / mouth barely parted, thin dark gap / mouth half open, tongue tip visible, no teeth showing / mouth wide open in a rounded shape, tongue clearly visible / mouth open with tongue hanging out to one side, panting. Output a full-canvas transparent RGBA PNG with only mouth and tongue visible.
```

输出位置：

```text
assets/characters/poodle/anim/mouth/poodle_mouth_yC00_pC00_{viseme}.png
```

## 七、道具、场景、特效和 UI

### 道具

所有道具都要求：单个物体、透明背景、无文字、无水印、柔和 3D 游戏风格。

```text
single small red and cream rubber dog ball, cute 3D game asset, soft studio light, centered, isolated, transparent background, no text, 512x512
```

```text
single small cream-colored dog bone toy with rounded ends, cute 3D game asset, centered, isolated, transparent background, no text, 512x512
```

```text
single small pastel ceramic dog bowl, empty, rounded friendly 3D game asset, centered, isolated, transparent background, no text, 512x512
```

满食物碗需要保持和空碗完全相同的角度与大小：

```text
same pastel ceramic dog bowl, filled with appetizing kibble, identical camera and scale to the empty bowl, centered, isolated, transparent background, no text, 512x512
```

输出位置：

```text
assets/props/prop_ball.png
assets/props/prop_bone.png
assets/props/prop_bowl_empty.png
assets/props/prop_bowl_full.png
```

### 地面投影

```text
soft elliptical contact shadow for a small toy poodle standing on a floor, warm brown-gray, very subtle opacity, feathered edges, top-down neutral view, transparent background, 1024x1024
```

输出：

```text
assets/characters/poodle/shadow/poodle_shadow_yC00.png
```

### 特效

```text
four-frame sequence of small warm pink hearts floating upward, soft rounded 3D game UI effect, transparent background, no text
```

```text
four-frame sequence of small golden stars popping outward, soft rounded 3D game UI effect, transparent background, no text
```

```text
three-frame sequence of lavender Z symbols drifting upward, soft rounded 3D game UI effect, transparent background, no text
```

输出示例：

```text
assets/fx/fx_heart_f00.png
assets/fx/fx_heart_f01.png
assets/fx/fx_heart_f02.png
assets/fx/fx_heart_f03.png
```

### 对话气泡

```text
rounded cream speech bubble UI panel with a small tail on the lower left, subtle warm shadow, empty interior for runtime text, transparent background, no text, 1024x512
```

输出：

```text
assets/ui/ui_bubble_speech.png
```

UI 文本由程序绘制，不要烤死在图片里。按钮需要分别生成 `normal`、`hover`、`pressed` 三种状态。

## 八、音频素材

音频不需要示例图，直接按以下规格生成或录制：

| 类型 | 建议规格 | 输出目录 |
|---|---|---|
| 开心叫声 | 轻快、短促、亲近，不要刺耳 | `assets/audio/voice/voice_happy_01.wav` |
| 兴奋叫声 | 更高能量的短叫声 | `assets/audio/voice/voice_excited_01.wav` |
| 呜咽 | 轻微撒娇，不要痛苦感 | `assets/audio/voice/voice_whine_01.wav` |
| 吠叫 / 小叫 | 短促、卡通化 | `assets/audio/voice/voice_bark_01.wav`、`voice_yip_01.wav` |
| 喘气循环 | 无明显爆音，可循环衔接 | `assets/audio/voice/voice_pant_loop.wav` |
| 交互音效 | 点击、抚摸、进食，短于 1 秒 | `assets/audio/sfx/` |
| 背景音乐 | 白天、温暖、低存在感，可循环 | `assets/audio/bgm/bgm_daytime.ogg` |

## 九、生成后的验收和登记

每次生成后执行：

```powershell
python process_image/image_masking.py report
```

整图姿态如果来自白底图，执行：

```powershell
python process_image/image_masking.py mask
python process_image/image_masking.py align --dry-run
```

验收要求：

- 尺寸必须是 1024×1024；
- PNG 必须是 RGBA；
- 四角 alpha 必须为 0；
- 透明边缘要有约 1px 羽化；
- 角色不能有白边、光晕或背景残留；
- 两眼中点尽量位于 `(512, 430)`，误差不超过 4px；
- 通过后再输出 WebP q80 和 `@0.5x` 版本；
- 最后更新 `assets/manifest.json` 的 `file`、`status`、`measured` 字段。

模型、seed、LoRA、CFG、steps 等生成信息填写在：

```text
assets/manifest.json
→ characters.poodle.generation
```
