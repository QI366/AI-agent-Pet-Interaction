# 素材命名规范

本规范服务于「假 3D」多角度切帧 + 分层驱动。所有文件名 **全小写、仅用 `_` 分隔、不含空格/中文/加号**。

---

## 1. 坐标系与角度定义（先统一，否则后面全乱）

### yaw（水平转头）

以 **观众视角** 为准 —— 狗的鼻子朝向画面哪一侧。

| 档位 ID | 含义 | 角度 |
|---|---|---|
| `yL90` | 狗完全侧向画面**左**（正侧脸） | -90° |
| `yL60` | | -60° |
| `yL30` | | -30° |
| `yL15` | 微转头 | -15° |
| `yC00` | 正脸对镜头 | 0° |
| `yR15` / `yR30` / `yR60` / `yR90` | 朝画面**右**，同上镜像 | +15…+90° |

> `L` = 鼻子指向画面左侧。现有 `30_left.png` / `90_right.png` 与此一致，可直接沿用语义。

### pitch（垂直，描述**相机高度**，不是狗头角度）

| 档位 ID | 含义 |
|---|---|
| `pA45` | Above，相机在上方俯视（看得到头顶） |
| `pC00` | Center，与狗视线平齐 |
| `pB45` | Below，相机在下方仰视（看得到下巴底） |

> ⚠️ 现有 `45_above.png` → `pA45`、`45_upward.png` → `pB45`（仰视，能看到下颌）。
> 如果原意是「狗抬头/低头」而非相机高度，需要在开工前改掉这个定义，两者不能混用。

**pose id** = `{yaw}_{pitch}`，例：`yL30_pC00`、`yC00_pA45`。

---

## 2. 文件名模板

```
{角色}_{类别}_{pose}[_{变体}][_f{帧号}].png
```

| 类别 | 说明 | 示例 |
|---|---|---|
| `pose` | 基础角度整图（兜底 / 无分层时用） | `poodle_pose_yL30_pC00.png` |
| `layer` | 分层素材，变体 = 部位名 | `poodle_layer_yC00_pC00_iris_l.png` |
| `expr` | 表情整图，变体 = 表情名 | `poodle_expr_yC00_pC00_happy.png` |
| `blink` | 眨眼帧 | `poodle_blink_yC00_pC00_f01.png` |
| `mouth` | 口型，变体 = viseme | `poodle_mouth_yC00_pC00_wide.png` |
| `ear` | 耳朵动作帧 | `poodle_ear_yC00_pC00_f02.png` |
| `shadow` | 地面投影（只随 yaw 变，无 pitch） | `poodle_shadow_yL30.png` |

**部位名**（`layer` 变体）：
`body` `head` `ear_l` `ear_r` `eye_l_white` `eye_r_white` `iris_l` `iris_r` `lid_l` `lid_r` `brow_l` `brow_r` `mouth` `tongue` `nose`

**表情名**（`expr` 变体）：
`neutral` `happy` `excited` `sad` `angry` `sleepy` `surprised` `curious`

**口型 viseme**（5 档，够用）：
`closed`（闭嘴）`slight`（微张）`mid`（半张）`wide`（大张）`tongue`（吐舌）

**帧号**：`f00` 起，两位补零。`f00` 恒等于该 pose 的中性静止帧。

---

## 3. 非角色素材

```
prop_{名称}[_{状态}].png       prop_ball.png / prop_bowl_empty.png
scene_{名称}[_{层}].png        scene_livingroom_bg.png / scene_livingroom_fg.png
fx_{名称}_f{帧号}.png          fx_heart_f00.png
ui_{名称}[_{状态}].png         ui_btn_feed_hover.png
sfx_{名称}.wav                 sfx_click.wav
voice_{情绪}_{序号}.wav        voice_happy_01.wav
bgm_{名称}.ogg                 bgm_daytime.ogg
```

---

## 4. 技术规格（硬性）

| 项 | 要求 |
|---|---|
| 尺寸 | 1024×1024，正方形画布，**所有角度共用同一画布** |
| 通道 | **RGBA，真实 alpha 抠图**，背景完全透明（`A=0`）。禁止白底烤死 |
| 边缘 | 无光晕、无描边残留；抠图边缘保留 1px 羽化 |
| 光照 | **统一**：柔和主光来自正前偏左，无边缘光、无 vignette、无戏剧打光 |
| 锚点 | 以 **两眼中点** 对齐到画布 `(512, 430)`，全套素材误差 ≤ ±4px |
| 取景 | 半身（胸口以上），头部占画面上 45% |
| 分层 | 每层单独输出为整张 1024×1024 透明 PNG，**不裁剪**，直接叠放即对位 |
| 交付格式 | 源 `.png` + 压缩 `.webp`（q80）；另出 `@0.5x` 用于低端设备 |
| 命名 | 一律走本规范；`manifest.json` 是唯一索引，代码不得硬编码路径 |

> 锚点对齐是假 3D 不跳帧的关键。现有 7 张主体中心 X 在 502~532 漂移（±30px），**必须重新对位**。

---

## 5. 目录结构

```
assets/
  manifest.json                    # 唯一索引，代码只读这个
  NAMING.md                        # 本文件
  CHECKLIST.md                     # 待补素材清单 + 生成提示词
  characters/poodle/
    pose/        layers/       expression/
    anim/{blink,mouth,ear}/        shadow/
  props/  scenes/  fx/  ui/
  audio/{voice,sfx,bgm}/
```
