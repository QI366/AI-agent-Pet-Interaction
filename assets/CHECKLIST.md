# 待补素材 Checklist + 生成提示词模板

配套：[NAMING.md](NAMING.md)（命名与技术规格）、[manifest.json](manifest.json)（索引）

---

## §0 开工前必须锁定（P0，阻塞一切）

> **不做这一步，后面每一张图都是一只不同的狗。**

- [ ] 用 [front_view.png](../poodle_image_half_body/front_view.png) 作参考图，反推 / 重建出能稳定复现这只狗的方案：
  - [ ] 确定生成工具与模型版本
  - [ ] 固定 **seed**（或训练一个角色 LoRA / 用 reference-image 模式）
  - [ ] 逐字确定下方 `BASE` 提示词，此后**永不修改**
- [ ] 试出 3 张 `yC00_pC00`，肉眼确认是同一只狗 → 回填 `manifest.json` 的 `characters.poodle.generation`
- [ ] 确认 pitch 语义：`pA45/pB45` 指**相机高度**还是**狗头俯仰**（见 NAMING.md §1 的 ⚠️）

---

## §1 Prompt 组装公式

```
BASE + ", " + CAMERA + ", " + EXPRESSION + ", " + TECH
Negative: NEGATIVE
Seed: <锁定值>   （只改 CAMERA / EXPRESSION 子句，其余原样）
```

---

## §2 常量块（锁定后逐字复制）

### BASE

```
a chibi-realistic 3D rendered chocolate-brown toy poodle, bust portrait from
mid-chest up, dense tightly-curled dark chocolate fur, long wavy floppy ears
framing the face, oversized round eyes with amber-orange irises and large
glossy black pupils, small rounded brown nose, short soft muzzle, Pixar-style
stylized character design, subtle subsurface scattering on the fur
```

### TECH

```
even soft studio key light from the front-left at 45 degrees, gentle ambient
fill, no rim light, no backlight, no vignette, flat pure white seamless
background, subject centered horizontally, head occupying the upper 45% of the
frame, sharp focus, 1024x1024
```

### NEGATIVE

```
vignette, dark background, gradient background, colored background, rim
lighting, backlight, dramatic lighting, harsh shadows, watermark, text,
signature, multiple dogs, full body, legs, paws, collar, leash, blurry, out of
focus, extra eyes, asymmetric eyes, distorted anatomy, cropped ears, human
features
```

> 白底是刻意的 —— 出图后**统一用同一个抠图工具**去背，比让模型直接出透明背景稳定得多。

---

## §3 CAMERA 子句

### yaw（水平）

| pose id | CAMERA 子句 |
|---|---|
| `yC00` | `head facing the camera straight on, symmetrical frontal view, both eyes equally visible` |
| `yL15` | `head turned slightly 15 degrees toward the viewer's left, near-frontal view` |
| `yL30` | `head turned 30 degrees toward the viewer's left, three-quarter view, far eye slightly foreshortened` |
| `yL60` | `head turned 60 degrees toward the viewer's left, strong three-quarter view, muzzle pointing left, far eye partially hidden behind the muzzle` |
| `yL90` | `full profile view, head turned 90 degrees to the viewer's left, only one eye visible, clean side silhouette of the muzzle` |
| `yR15` / `yR30` / `yR60` / `yR90` | 同上，把 `left` 换成 `right` |

### pitch（相机高度）

| pose id | 追加子句 |
|---|---|
| `pC00` | `camera at the dog's eye level` |
| `pA45` | `camera positioned 45 degrees above looking down at the dog, top of the curly head prominent, eyes looking up into the lens` |
| `pB45` | `camera positioned 45 degrees below looking up at the dog, underside of the muzzle and chin visible, low angle` |

---

## §4 EXPRESSION 子句

| id | 子句 |
|---|---|
| `neutral` | `calm neutral expression, mouth closed, wide innocent stare` |
| `happy` | `happy expression, mouth open in a soft smile, tongue tip slightly out, eyes softly narrowed into gentle arcs` |
| `excited` | `excited expression, mouth wide open, tongue out, eyes wide and bright, ears lifted` |
| `sad` | `sad expression, inner brows tilted up, eyes glossy and downcast, mouth closed in a small frown, ears drooping lower` |
| `angry` | `annoyed expression, brows lowered and drawn together, muzzle slightly wrinkled, ears pinned back` |
| `sleepy` | `sleepy expression, eyes half-closed with heavy lids, mouth in a small yawn, head slightly drooping` |
| `surprised` | `surprised expression, eyes opened extremely wide, pupils dilated, mouth open in a small round shape, ears perked straight up` |
| `curious` | `curious expression, head tilted to one side, one ear raised higher than the other, eyes wide and attentive, mouth closed` |

## §5 动画帧子句

**眨眼**（替换 EXPRESSION 位置）

| 帧 | 子句 |
|---|---|
| `f00` | 即该 pose 的中性图，不用重出 |
| `f01` | `eyes half closed, upper eyelids covering the top half of the eyes` |
| `f02` | `eyes fully closed, smooth curved closed eyelids` |

**口型 viseme**

| id | 子句 |
|---|---|
| `closed` | `mouth completely closed, lips relaxed` |
| `slight` | `mouth barely parted, thin dark gap` |
| `mid` | `mouth half open, tongue tip visible, no teeth showing` |
| `wide` | `mouth wide open in a rounded shape, tongue clearly visible` |
| `tongue` | `mouth open with tongue hanging out to one side, panting` |

---

## §6 完整示例

出 `poodle_pose_yL60_pC00.png`：

```
a chibi-realistic 3D rendered chocolate-brown toy poodle, bust portrait from mid-chest up,
dense tightly-curled dark chocolate fur, long wavy floppy ears framing the face, oversized
round eyes with amber-orange irises and large glossy black pupils, small rounded brown nose,
short soft muzzle, Pixar-style stylized character design, subtle subsurface scattering on the
fur, head turned 60 degrees toward the viewer's left, strong three-quarter view, muzzle
pointing left, far eye partially hidden behind the muzzle, camera at the dog's eye level,
calm neutral expression, mouth closed, wide innocent stare, even soft studio key light from
the front-left at 45 degrees, gentle ambient fill, no rim light, no backlight, no vignette,
flat pure white seamless background, subject centered horizontally, head occupying the upper
45% of the frame, sharp focus, 1024x1024
```

---

# 生产批次

## 批次 1 — 返修现有 7 张（P0，12 张次）

现状：6 张白底烤死无 alpha，1 张暗调 vignette，主体中心 X 漂移 ±30px。

- [ ] **`front_view.png` 重出**，不要返修 —— 暗调 vignette + 边缘光改不回统一光照
- [ ] 其余 6 张统一抠图（同一工具、同一参数），输出真实 alpha
- [ ] 全部按**两眼中点 → (512, 430)** 重新对位，误差 ≤ ±4px
- [ ] `45_above.png` 取景偏远（主体高 908 vs 其余 980），需重出或补缩放对齐
- [ ] 重命名并落到 `assets/characters/poodle/pose/`，回填 manifest 的 `file` 与 `status: ready`

## 批次 2 — 补齐 yaw 网格（P0，4 张）

- [ ] `yL60_pC00`
- [ ] `yR60_pC00`
- [ ] `yL15_pC00`
- [ ] `yR15_pC00`

> 30°→90° 直接切必然跳帧，60° 是必需的中间档；±15° 决定"视线跟随"细不细腻。

## 批次 3 — 分层拆解（P0，1 套 ≈ 15 层）

拆 `yC00_pC00`，按 manifest 的 `layers.order` 输出 15 张全画布透明 PNG：

- [ ] `body` `head` `ear_l` `ear_r`
- [ ] `eye_l_white` `eye_r_white` `iris_l` `iris_r`（**瞳孔必须独立**，否则做不了视线跟随）
- [ ] `lid_l` `lid_r`（独立眼皮 = 眨眼零额外出图）
- [ ] `brow_l` `brow_r` `nose` `mouth` `tongue`
- [ ] 被遮挡区域要补画（head 层要画出被耳朵盖住的部分），否则一动就露洞

> 拆完这一套，批次 4 和批次 5 的出图量直接砍掉 80%。**强烈建议先做这步再做表情。**

## 批次 4 — 眨眼 + 口型（P0）

- [ ] 眨眼 `f01` `f02` —— 分层后只需出 `lid` 层 2 张
- [ ] 口型 5 个 viseme —— 分层后只需出 `mouth` + `tongue` 层
- [ ] 未分层的退路：每个主 pose 各出 2+5 = 7 张整图 × 3 角度 = 21 张

## 批次 5 — 表情集（P1，7 表情 × 3 角度 = 21 张次）

角度取 `yC00_pC00` / `yL30_pC00` / `yR30_pC00`：

- [ ] `happy` × 3
- [ ] `excited` × 3
- [ ] `sad` × 3
- [ ] `sleepy` × 3
- [ ] `curious` × 3
- [ ] `angry` × 3
- [ ] `surprised` × 3

## 批次 6 — pitch 网格（P1，8 张）

- [ ] `yL90_pA45` `yL30_pA45` `yR30_pA45` `yR90_pA45`
- [ ] `yL90_pB45` `yL30_pB45` `yR30_pB45` `yR90_pB45`

## 批次 7 — 场景配套（P1~P2）

- [ ] 地面投影 `poodle_shadow_yC00`（假 3D 的落地感全靠它）
- [ ] 对话气泡 `ui_bubble_speech`（**AI 说话必需，P0**）
- [ ] FX：`fx_heart` `fx_star` `fx_zzz`（各 3~4 帧）
- [ ] FX：`fx_question` `fx_exclaim` `fx_teardrop`
- [ ] 场景：`scene_livingroom_bg` / `_fg`
- [ ] 道具：`prop_bowl_empty` / `prop_bowl_full` / `prop_ball` / `prop_bone`
- [ ] UI：状态条 ×3、按钮 ×2（各 3 态）

## 批次 8 — 音频（P1~P3，全空）

- [ ] 叫声：`voice_happy_01/02` `voice_excited_01` `voice_whine_01` `voice_bark_01` `voice_yip_01`
- [ ] `voice_pant_loop`（喘气循环，垫在 idle 下很提升"活着"的感觉）
- [ ] 音效：`sfx_click` `sfx_pet` `sfx_eat`
- [ ] BGM：`bgm_daytime`
- [ ] TTS 音色选型（如果宠物要说话）→ 回填 manifest `audio.tts`

## 批次 9 — AI 侧软素材（P0，非图）

- [ ] `prompts/poodle_system.md` —— 性格 / 说话风格 / 口头禅，回填 manifest `persona`
- [ ] 确认 `emotionMap` 的 9 个情绪标签，作为 LLM 结构化输出的枚举值
- [ ] 测量并回填 `hitZones` 的归一化坐标

---

# 验收标准（每批必过）

| 检查项 | 判定 |
|---|---|
| alpha | 角落像素 `A == 0`，透明像素占比 > 30% |
| 尺寸 | 恰好 1024×1024 |
| 锚点 | 两眼中点距 (512, 430) ≤ 4px |
| 光照 | 与 `yC00_pC00` 并排看不出光源差异，无 vignette / 边缘光 |
| 角色一致性 | 眼距比、毛色 HSV、耳朵长度与基准图偏差 < 5% |
| 命名 | 完全符合 NAMING.md |
| 索引 | 已回填 manifest，`status` 从 `todo` 改为 `ready` |

> 建议：出图时**每个角度一批 4 张挑 1 张**。挑的标准不是"哪张好看"，是"哪张最像基准那只狗"。
