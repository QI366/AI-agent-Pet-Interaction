# 泰迪的假 3D 交互 Demo

这是一个零依赖的浏览器 Demo：使用 `assets/manifest.json` 作为素材索引，加载现有泰迪多角度 PNG，并提供摸头、喂食、喝水、玩玩具和状态记录等交互。

## 运行

浏览器不能在 `file://` 页面中读取 manifest，需从项目根目录启动一个静态服务器：

```powershell
python -m http.server 8000
```

然后打开 <http://localhost:8000/>。不需要安装 npm 或构建工具。

## 目录

- `index.html` / `styles.css` / `app.js`：可运行的交互界面
- `assets/manifest.json`：唯一素材索引，姿态选择会优先读取其中已登记的文件
- `assets/PROMPT_PACK.md`：生图工具可直接使用的英文提示词
- `assets/PROMPT_PACK_CN.md`：中文生成说明、示例图选择与素材验收流程
- `process_image/image_masking.py`：素材抠图、镜像补全、对位和验收脚本
- `process_image/import_examples.py`：把外部生成示例图统一缩放、抠图并导入 `assets/imported/db/`
- `assets/CHECKLIST.md`：后续分层、表情、音频素材的生产清单

## 素材处理

```powershell
python process_image/image_masking.py mask --json process_image/mask-report.json
python process_image/image_masking.py align --dry-run
python process_image/image_masking.py report
```

当前 Demo 对缺少的分层素材使用整图姿态作为安全回退；补齐 `manifest.json` 中的 layers / expression 后，可继续把渲染器替换为分层动画。

## 导入外部示例图

默认从 `C:\Users\zhuoz\Desktop\示例图\db` 导入：

```powershell
python process_image/import_examples.py --keep-source
```

脚本会保留原始文件到 `assets/imported/db/source/`，并输出统一为 1024×1024 RGBA 的处理版本。当前页面已经接入姿态、表情、爱心特效、球/骨头/食盆和分层预览按钮；分层按钮用于验收，不代表这些分层已经达到最终交付标准。
