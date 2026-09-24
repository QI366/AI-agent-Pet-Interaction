# 对于poodle_image_half_body实现抠图
# 1024×1024 透明 PNG，背景完全透明（`A=0`）。禁止白底烤死 。边缘 无光晕、无描边残留；抠图边缘保留 1px 羽化
# 图像镜像 补全15_left 60right
"""
狗狗假3D素材预处理：抠图 / 镜像补全 / 验收测量。

依赖：numpy, Pillow（见 requirements.txt）

用法：
    python image_masking.py mask                 # 批量抠图，输出到 assets/characters/poodle/pose/
    python image_masking.py mirror --auto        # 扫描已抠图目录，镜像补全缺失的左右对应角度
    python image_masking.py mirror --src a.png --dst b.png
    python image_masking.py report --json out.json

为什么不用 rembg：U2Net 的 mask 是 320×320 上采样回来的，卷毛边缘会糊成一团。
本图是干净白底 + 深色主体，走颜色抠像能保住每一根卷毛的边缘。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

if sys.platform == "win32":                      # Windows 控制台默认 GBK，中文/符号会炸
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "poodle_image_half_body"
OUT_DIR = ROOT / "assets" / "characters" / "poodle" / "pose"

# 旧文件名 → NAMING.md 规范名（与 assets/manifest.json 的 sourceFile 字段一致）
RENAME_MAP = {
    "front_view.png": "poodle_pose_yC00_pC00.png",
    "15_right.png": "poodle_pose_yR15_pC00.png",
    "30_left.png": "poodle_pose_yL30_pC00.png",
    "30_right.png": "poodle_pose_yR30_pC00.png",
    "60_left.png": "poodle_pose_yL60_pC00.png",
    "90_left.png": "poodle_pose_yL90_pC00.png",
    "90_right.png": "poodle_pose_yR90_pC00.png",
    "45_above.png": "poodle_pose_yC00_pA45.png",
    "45_upward.png": "poodle_pose_yC00_pB45.png",
    # above.png 是纯头部特写、取景与其余张完全不同，归哪个 pose 待定，暂不改名
}

CANVAS = 1024


# ---------------------------------------------------------------- 基础工具

def load_rgba(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """读成 float32 的 (rgb, alpha)，值域 0..1。"""
    im = Image.open(path).convert("RGBA")
    if im.size != (CANVAS, CANVAS):
        raise ValueError(f"{path.name} 尺寸 {im.size} != {CANVAS}x{CANVAS}")
    arr = np.asarray(im, dtype=np.float32) / 255.0
    return arr[..., :3].copy(), arr[..., 3].copy()


def save_rgba(rgb: np.ndarray, alpha: np.ndarray, path: Path) -> None:
    """写直通 alpha（straight / unpremultiplied）PNG。"""
    out = np.concatenate([rgb, alpha[..., None]], axis=-1)
    out = np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out, mode="RGBA").save(path, optimize=True)


def _shift(a: np.ndarray, dy: int, dx: int) -> np.ndarray:
    """按 (dy, dx) 平移，空出来的位置填 0。"""
    out = np.zeros_like(a)
    h, w = a.shape[:2]
    ys_src = slice(max(0, -dy), h - max(0, dy))
    ys_dst = slice(max(0, dy), h - max(0, -dy))
    xs_src = slice(max(0, -dx), w - max(0, dx))
    xs_dst = slice(max(0, dx), w - max(0, -dx))
    out[ys_dst, xs_dst] = a[ys_src, xs_src]
    return out


def dilate(mask: np.ndarray, r: int = 1) -> np.ndarray:
    out = mask.copy()
    for _ in range(r):
        d = out.copy()
        d[1:] |= out[:-1]
        d[:-1] |= out[1:]
        d[:, 1:] |= out[:, :-1]
        d[:, :-1] |= out[:, 1:]
        out = d
    return out


def _minmax_filter(a: np.ndarray, r: int, op) -> np.ndarray:
    out = a.copy()
    for _ in range(r):
        m = out
        c = out.copy()
        c[1:] = op(c[1:], m[:-1])
        c[:-1] = op(c[:-1], m[1:])
        c[:, 1:] = op(c[:, 1:], m[:, :-1])
        c[:, :-1] = op(c[:, :-1], m[:, 1:])
        out = c
    return out


def max_filter(a: np.ndarray, r: int) -> np.ndarray:
    return _minmax_filter(a, r, np.maximum)


def min_filter(a: np.ndarray, r: int) -> np.ndarray:
    return _minmax_filter(a, r, np.minimum)


def blur121(a: np.ndarray, passes: int = 1) -> np.ndarray:
    """可分离 [1,2,1]/4 卷积，一遍 ≈ 1px 羽化。"""
    for _ in range(passes):
        p = np.pad(a, 1, mode="edge")
        a = (p[:-2, 1:-1] + 2.0 * p[1:-1, 1:-1] + p[2:, 1:-1]) * 0.25
        p = np.pad(a, 1, mode="edge")
        a = (p[1:-1, :-2] + 2.0 * p[1:-1, 1:-1] + p[1:-1, 2:]) * 0.25
    return a


# ------------------------------------------------------- 连通域（保护眼睛高光）

def _fill_runs(seed: np.ndarray, cand: np.ndarray) -> np.ndarray:
    """行方向传播：每一段连续的 cand 里只要有一个 seed，整段置 True。"""
    h, w = cand.shape
    pad_c = np.zeros((h, w + 1), dtype=bool)   # 末尾补一列 False，防止段跨行
    pad_s = np.zeros((h, w + 1), dtype=bool)
    pad_c[:, :w] = cand
    pad_s[:, :w] = seed
    fc = pad_c.ravel()
    fs = pad_s.ravel()

    starts = fc & ~np.concatenate(([False], fc[:-1]))
    n_runs = int(starts.sum())
    if n_runs == 0:
        return np.zeros_like(cand)

    run_id = np.cumsum(starts) - 1
    hit = np.bincount(run_id[fc], weights=fs[fc].astype(np.float32), minlength=n_runs) > 0

    out = np.zeros_like(fc)
    out[fc] = hit[run_id[fc]]
    return out.reshape(h, w + 1)[:, :w]


def flood_from_border(cand: np.ndarray, max_passes: int = 64) -> np.ndarray:
    """从画布四边种子出发的连通域填充。

    这一步是抠图的关键：眼睛里的白色高光虽然颜色接近背景，但它不与画布边缘连通，
    因此不会被判成背景 —— 纯颜色抠像会在这里punch出两个洞。
    """
    seed = np.zeros_like(cand)
    seed[0] |= cand[0]
    seed[-1] |= cand[-1]
    seed[:, 0] |= cand[:, 0]
    seed[:, -1] |= cand[:, -1]

    for _ in range(max_passes):
        prev = int(seed.sum())
        seed = _fill_runs(seed, cand)                                   # 横向
        seed = _fill_runs(np.ascontiguousarray(seed.T),
                          np.ascontiguousarray(cand.T)).T               # 纵向
        if int(seed.sum()) == prev:
            break
    return np.ascontiguousarray(seed)


# ---------------------------------------------------------------- 抠图主流程

def _corner_blocks(rgb: np.ndarray, k: int = 96):
    """四个角的方块 + 它们在全图里的偏移。角落几乎不会有主体，比整圈边更干净。"""
    h, w = rgb.shape[:2]
    return [
        (rgb[:k, :k], 0, 0),
        (rgb[:k, w - k:], 0, w - k),
        (rgb[h - k:, :k], h - k, 0),
        (rgb[h - k:, w - k:], h - k, w - k),
    ]


def detect_checker(rgb: np.ndarray, k: int = 96):
    """检测「抠图网站预览图」——棋盘格被烤进 RGB、alpha 全 255 的情况。

    返回两种背景灰阶 (dark, light)，不是棋盘则返回 None。

    这里刻意不去拟合格子的边长和相位：网站预览图往往被缩放过，格子边长是小数
    （本项目实测 ≈26.3px），按整数网格拟合会一路错位，匹配率掉到 0.88 根本认不出来。
    只取两种灰的颜色，格子长什么样、怎么对齐都无所谓。
    """
    dark_px, light_px = [], []
    for blk, _y0, _x0 in _corner_blocks(rgb, k):
        if float(np.mean(blk.max(axis=-1) - blk.min(axis=-1))) > 0.02:
            continue                                   # 有彩色 → 混进主体了
        lum = blk.mean(axis=-1)
        lo, hi = np.percentile(lum, [5, 95])
        if hi - lo < 0.12:
            continue                                   # 单色，不是棋盘
        near = (np.abs(lum - lo) < 0.05) | (np.abs(lum - hi) < 0.05)
        if float(near.mean()) < 0.90:
            continue                                   # 不是干净的双色
        mid = (lo + hi) / 2
        dark_px.append(blk[lum < mid].reshape(-1, 3))
        light_px.append(blk[lum >= mid].reshape(-1, 3))

    if len(dark_px) < 2:
        return None
    return (np.median(np.concatenate(dark_px), axis=0).astype(np.float32),
            np.median(np.concatenate(light_px), axis=0).astype(np.float32))


def project_to_segment(rgb: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """把每个像素投影到 RGB 空间中 a→b 的线段上，取最近点。"""
    d = b - a
    denom = float(d @ d)
    if denom < 1e-8:
        return np.broadcast_to(a, rgb.shape).copy()
    t = np.clip(((rgb - a) @ d) / denom, 0.0, 1.0)
    return a + t[..., None] * d


def build_background(rgb: np.ndarray) -> tuple[np.ndarray, str, dict]:
    """构造逐像素的背景图。返回 (bg_map HxWx3, kind, info)。"""
    h, w = rgb.shape[:2]
    checker = detect_checker(rgb)

    if checker is not None:
        dark, light = checker
        # 背景像素本身就落在这条线段上（含格子交界的抗锯齿过渡色），投影后距离≈0；
        # 深棕色的狗离这段灰很远，照样被判成前景。
        bg = project_to_segment(rgb, dark, light)
        info = {
            "bgKind": "checkerboard",
            "checkerColors": [[round(float(c) * 255, 1) for c in dark],
                              [round(float(c) * 255, 1) for c in light]],
        }
        return bg, "checkerboard", info

    flat = np.median(np.concatenate([b.reshape(-1, 3) for b, _, _ in _corner_blocks(rgb)]), axis=0)
    bg = np.broadcast_to(flat.astype(np.float32), (h, w, 3)).copy()
    return bg, "flat", {"bgKind": "flat", "bgColor": [round(float(c) * 255, 1) for c in flat]}


def extend_edge_color(rgb: np.ndarray, known: np.ndarray, iters: int) -> np.ndarray:
    """把已知前景色向透明区外扩 iters 圈。

    透明像素的 RGB 不是"随便什么颜色都行"：GPU 双线性采样会把它和边缘像素混在一起。
    留白底 → 渲染出白边；填黑 → 渲染出黑边。填成邻近前景色才没有描边。
    """
    rgb = rgb.copy()
    known = known.copy()
    neighbors = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
    for _ in range(iters):
        if known.all():
            break
        w = known.astype(np.float32)
        acc = np.zeros_like(rgb)
        cnt = np.zeros_like(w)
        for dy, dx in neighbors:
            acc += _shift(rgb * w[..., None], dy, dx)
            cnt += _shift(w, dy, dx)
        new = (~known) & (cnt > 0)
        if not new.any():
            break
        rgb[new] = acc[new] / cnt[new][:, None]
        known |= new
    return rgb


def cutout(
    rgb: np.ndarray,
    alpha_in: np.ndarray,
    *,
    tau_bg: float = 0.05,
    band: int = 3,
    choke: int = 0,
    feather: int = 1,
) -> tuple[np.ndarray, np.ndarray, dict]:
    """白底抠图 + 去污 + 羽化。返回 (rgb, alpha, info)。"""
    info: dict = {}
    bg, _kind, bg_info = build_background(rgb)
    info.update(bg_info)
    # 输入本身就带真实 alpha（front_view.png 是这种）：沿用它，不做颜色抠像
    pre_cut = bool(alpha_in[0].min() < 0.98 and alpha_in[-1].min() < 0.98)
    info["preCut"] = pre_cut

    if pre_cut:
        alpha = alpha_in.copy()
        is_bg = alpha < 0.02
        solid_core = alpha > 0.98
    else:
        # 到背景色的欧氏距离，归一化到 0..1
        dist = np.linalg.norm(rgb - bg, axis=-1) / np.sqrt(3.0)
        is_bg = flood_from_border(dist < tau_bg)
        solid = ~is_bg

        edge_band = dilate(is_bg, band) & solid       # 贴着背景的过渡带
        solid_core = solid & ~edge_band

        # 过渡带里的局部前景色对比度：从实心区往外做 max 扩散
        dist_f = max_filter(np.where(solid_core, dist, 0.0).astype(np.float32), band + 1)

        alpha = solid_core.astype(np.float32)
        eps = 1e-4
        ratio = np.clip(dist / np.maximum(dist_f, eps), 0.0, 1.0)
        alpha[edge_band] = ratio[edge_band]
        alpha[is_bg] = 0.0

    if choke > 0:
        alpha = min_filter(alpha, choke)
        solid_core &= alpha > 0.98

    # 颜色去污：观测色 C = a*F + (1-a)*B  →  反解出真正的前景色 F
    # 不做这步，半透明边缘会一直混着白底 → 就是所谓"白边 / 光晕"
    if not pre_cut:
        mix = (alpha > 0.15) & (alpha < 0.995)
        a = alpha[mix][:, None]
        b = bg[mix]
        f = b + (rgb[mix] - b) / a
        rgb = rgb.copy()
        rgb[mix] = np.clip(f, 0.0, 1.0)
        info["decontaminatedPx"] = int(mix.sum())

    # 透明区填邻近前景色（羽化会把 alpha 推出去 1px，那里必须已经有正确的颜色）
    rgb = extend_edge_color(rgb, alpha > 0.02, iters=feather + choke + 2)

    if feather > 0:
        alpha = blur121(alpha, passes=feather)

    # 收尾：远离主体的背景强制全透明，边缘 1px 一定为 0
    far_bg = is_bg & ~dilate(alpha > 0.02, feather + 1)
    alpha[far_bg] = 0.0
    alpha[alpha < 1.5 / 255.0] = 0.0
    alpha[0, :] = alpha[-1, :] = alpha[:, 0] = alpha[:, -1] = 0.0

    return rgb, np.clip(alpha, 0.0, 1.0), info


# -------------------------------------------------------------- 眼睛检测与对位

def connected_components(mask: np.ndarray) -> tuple[np.ndarray, list[dict]]:
    """行程编码 + 并查集的连通域标记。返回 (labels, [{label,area,bbox}])。"""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    parent = [0]

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    prev_runs: list[tuple[int, int, int]] = []
    for y in range(h):
        d = np.diff(np.concatenate(([0], mask[y].view(np.int8), [0])).astype(np.int8))
        starts = np.nonzero(d == 1)[0]
        ends = np.nonzero(d == -1)[0]
        cur: list[tuple[int, int, int]] = []
        for s, e in zip(starts, ends):
            lab = 0
            for ps, pe, pl in prev_runs:
                if ps < e and s < pe:                  # 与上一行的行程有重叠 → 同一连通域
                    if lab == 0:
                        lab = pl
                    else:
                        union(lab, pl)
            if lab == 0:
                parent.append(len(parent))
                lab = len(parent) - 1
            labels[y, s:e] = lab
            cur.append((s, e, lab))
        prev_runs = cur

    remap = np.array([find(i) for i in range(len(parent))], dtype=np.int32)
    labels = remap[labels]

    stats = []
    for lab in np.unique(labels):
        if lab == 0:
            continue
        ys, xs = np.nonzero(labels == lab)
        stats.append({
            "label": int(lab), "area": int(len(xs)),
            "bbox": (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())),
        })
    stats.sort(key=lambda s: -s["area"])
    return labels, stats


def _blob_center(blob: np.ndarray) -> tuple[float, float]:
    """虹膜是个环，先把环围住的瞳孔补上，再取质心 —— 比直接取环的质心稳。"""
    ys, xs = np.nonzero(blob)
    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    sub = blob[y0:y1 + 1, x0:x1 + 1]
    filled = ~flood_from_border(~sub)
    fy, fx = np.nonzero(filled)
    return float(x0 + fx.mean()), float(y0 + fy.mean())


MIN_EYE_SEP = 100.0        # 双眼最小水平间距；小于这个就是同一只眼裂成了两块
MAX_EYE_DY = 40.0          # 双眼最大高度差
MIN_AREA_RATIO = 0.25      # 远端眼相对近端眼的最小面积比


def detect_eyes(rgb: np.ndarray, alpha: np.ndarray, *,
                sat_min: float = 0.62, val_min: float = 0.35,
                min_area: int = 150) -> list[tuple[float, float, int]]:
    """靠琥珀色虹膜环定位眼睛，返回 [(x, y, area), ...]，按面积从大到小。

    为什么不用瞳孔高光：侧脸时高光会偏到瞳孔边缘，鼻头和毛发反光也会产生高光。
    虹膜那圈高饱和暖色在全身深棕毛里是独一份。注意阈值不能再往下调 ——
    实测 sat>0.45 时鼻梁的暖色毛会大面积误检。
    """
    core = alpha > 0.95                                # 避开边缘去污产生的杂点
    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    mask = core & (sat > sat_min) & (mx > val_min)
    if mask.sum() < min_area:
        return []

    labels, stats = connected_components(mask)
    out = []
    for st in stats:
        if st["area"] < min_area:
            break                                      # stats 已按面积降序
        x0, y0, x1, y1 = st["bbox"]
        bw, bh = x1 - x0 + 1, y1 - y0 + 1
        if not (0.35 <= bw / bh <= 3.0) or max(bw, bh) > 300:
            continue                                   # 眼睛大致是圆的，且不会太大
        cx, cy = _blob_center(labels == st["label"])
        out.append((cx, cy, st["area"]))
        if len(out) >= 4:
            break
    return out


def pick_eye_pair(blobs: list[tuple[float, float, int]]):
    """从候选里挑出合法的双眼，挑不出就返回 None。

    必须卡这三个条件：pB45 上有一只眼的虹膜环被裂成 644 和 604 两块，
    间距仅 40px，不校验就会被当成双眼，把瞳距标定彻底带偏。
    """
    if len(blobs) < 2:
        return None
    near = blobs[0]
    for far in blobs[1:]:
        if (abs(near[0] - far[0]) >= MIN_EYE_SEP
                and abs(near[1] - far[1]) <= MAX_EYE_DY
                and far[2] >= near[2] * MIN_AREA_RATIO):
            return near, far
    return None


_YAW_RE = re.compile(r"_y([LRC])(\d{2})_")


def yaw_of(name: str) -> float | None:
    m = _YAW_RE.search(name)
    if not m:
        return None
    side, deg = m.group(1), float(m.group(2))
    return {"L": -deg, "R": deg, "C": 0.0}[side]


# ------------------------------------------------------------------ 验收测量

def measure(rgb: np.ndarray, alpha: np.ndarray) -> dict:
    """对应 CHECKLIST.md 的验收标准。"""
    solid = alpha > 0.5
    ys, xs = np.nonzero(solid)
    if len(xs) == 0:
        return {"error": "空图，没有不透明像素"}
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    corners = [float(alpha[0, 0]), float(alpha[0, -1]), float(alpha[-1, 0]), float(alpha[-1, -1])]
    return {
        "size": [int(alpha.shape[1]), int(alpha.shape[0])],
        "bbox": [x0, y0, x1, y1],
        "centerX": (x0 + x1) // 2,
        "alphaCoverage": round(float((alpha < 0.98).mean()), 4),
        "hasRealAlpha": bool(alpha.min() < 0.98),
        "cornerAlphaMax": round(max(corners) * 255, 2),
        "softEdgePx": int(((alpha > 0.02) & (alpha < 0.98)).sum()),
    }


# ---------------------------------------------------------------------- 命令

def cmd_mask(args: argparse.Namespace) -> int:
    src_dir = Path(args.src)
    out_dir = Path(args.out)
    files = sorted(p for p in src_dir.glob("*.png"))
    if not files:
        print(f"没有找到 png：{src_dir}", file=sys.stderr)
        return 1

    results = {}
    for p in files:
        name = RENAME_MAP.get(p.name, p.name) if args.rename else p.name
        rgb, a_in = load_rgba(p)
        rgb, alpha, info = cutout(
            rgb, a_in,
            tau_bg=args.tau_bg, band=args.band, choke=args.choke, feather=args.feather,
        )
        dst = out_dir / name
        save_rgba(rgb, alpha, dst)

        m = measure(rgb, alpha)
        results[name] = {**m, **info}
        flag = "  [已带 alpha，仅做边缘清理]" if info.get("preCut") else ""
        print(f"{p.name:18s} → {name:32s} "
              f"透明 {m['alphaCoverage']:.1%}  软边 {m['softEdgePx']:>6d}px  "
              f"bbox={m['bbox']}  中心X={m['centerX']}{flag}")

    if args.json:
        Path(args.json).write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\n测量结果 → {args.json}")

    # 改了源文件名或 RENAME_MAP 后，输出目录会留下上一轮的旧文件；
    # mirror --auto 会把它们当源用，必须提醒。
    stale = sorted(p.name for p in out_dir.glob("*.png") if p.name not in results)
    if stale:
        if args.clean:
            for n in stale:
                (out_dir / n).unlink()
            print(f"\n已清理 {len(stale)} 个陈旧文件：{', '.join(stale)}")
        else:
            print(f"\n⚠️  输出目录有 {len(stale)} 个不是本轮生成的文件："
                  f"{', '.join(stale)}\n   确认无用的话加 --clean 删掉，否则 mirror --auto 可能拿它们当源。")

    pre = [n for n, r in results.items() if r.get("preCut")]
    if pre:
        print(f"\n⚠️  {', '.join(pre)} 原图已带 alpha 且为暗调 vignette 风格，"
              f"抠图救不回光照差异，仍需按 CHECKLIST.md 批次1 重出。")
    return 0


# yL30 <-> yR30，30_left <-> 30_right
_FLIP_PATTERNS = (
    (re.compile(r"(?<=y)L(\d{2})"), lambda m: "R" + m.group(1)),
    (re.compile(r"(?<=y)R(\d{2})"), lambda m: "L" + m.group(1)),
    (re.compile(r"(\d+)_left"), lambda m: m.group(1) + "_right"),
    (re.compile(r"(\d+)_right"), lambda m: m.group(1) + "_left"),
)


def flip_name(name: str) -> str | None:
    """把文件名里的左右标记翻过来；没有左右标记（正脸、俯仰）返回 None。"""
    for pat, rep in _FLIP_PATTERNS:
        new, n = pat.subn(rep, name)
        if n:
            return new
    return None


def mirror_file(src: Path, dst: Path, recenter: bool = False) -> dict:
    rgb, alpha = load_rgba(src)
    rgb = rgb[:, ::-1].copy()
    alpha = alpha[:, ::-1].copy()

    if recenter:
        ys, xs = np.nonzero(alpha > 0.5)
        if len(xs):
            shift_x = alpha.shape[1] // 2 - (int(xs.min()) + int(xs.max())) // 2
            rgb = _shift(rgb, 0, shift_x)
            alpha = _shift(alpha, 0, shift_x)

    save_rgba(rgb, alpha, dst)
    return measure(rgb, alpha)


def cmd_mirror(args: argparse.Namespace) -> int:
    if args.src and args.dst:
        jobs = [(Path(args.src), Path(args.dst))]
    elif args.auto:
        d = Path(args.out)
        jobs = []
        for p in sorted(d.glob("*.png")):
            flipped = flip_name(p.name)
            if flipped is None:
                continue                       # 正脸 / 俯仰图没有镜像对应
            target = d / flipped
            if target.exists() and not args.force:
                continue
            jobs.append((p, target))
    else:
        print("需要 --auto，或同时给 --src / --dst", file=sys.stderr)
        return 1

    if not jobs:
        print("没有需要镜像补全的文件（左右角度都齐了）。")
        print("提示：15_left / 60_right 要等 yR15 / yL60 出图后才能镜像出来。")
        return 0

    for src, dst in jobs:
        if not src.exists():
            print(f"跳过：源文件不存在 {src}", file=sys.stderr)
            continue
        m = mirror_file(src, dst, recenter=args.recenter)
        print(f"{src.name:34s} ⇄ {dst.name:34s} bbox={m['bbox']} 中心X={m['centerX']}")

    print("\n⚠️  镜像会把光照一起翻过去（主光 front-left → front-right）。"
          "\n   本组是柔和均匀布光，肉眼基本看不出；若后续改成强侧光，镜像图必须重出。")
    return 0


def _debug_overlay(rgb, alpha, eyes, mid, target, path: Path) -> None:
    """把检出的眼心、中点、目标点画出来，方便人眼复核。"""
    vis = np.clip(rgb * alpha[..., None] + 0.55 * (1 - alpha[..., None]), 0, 1)

    def mark(cx, cy, color, r=9, ring=False):
        y, x = int(round(cy)), int(round(cx))
        yy, xx = np.mgrid[max(0, y - r):min(CANVAS, y + r + 1), max(0, x - r):min(CANVAS, x + r + 1)]
        d = np.hypot(yy - y, xx - x)
        sel = (d <= r) & (d >= r - 2) if ring else (d <= 2)
        blk = vis[max(0, y - r):min(CANVAS, y + r + 1), max(0, x - r):min(CANVAS, x + r + 1)]
        blk[sel] = color

    mark(*target, [0.1, 0.4, 1.0], r=14, ring=True)         # 蓝圈 = 目标锚点
    for ex, ey in eyes:
        mark(ex, ey, [1.0, 0.1, 0.1], r=11, ring=True)      # 红圈 = 检出的眼心
    mark(*mid, [0.1, 1.0, 0.2])                             # 绿点 = 两眼中点
    Image.fromarray((vis * 255).astype(np.uint8)).save(path)


def cmd_align(args: argparse.Namespace) -> int:
    d = Path(args.out)
    tx, ty = args.target_x, args.target_y
    files = sorted(d.glob("*.png"))
    if not files:
        print(f"没有找到 png：{d}", file=sys.stderr)
        return 1

    # 第一遍：检测眼睛，用合法双眼图标定正脸瞳距 D（投影瞳距 = D·cos(yaw)）
    found = {}
    d_samples = []
    for p in files:
        rgb, alpha = load_rgba(p)
        blobs = detect_eyes(rgb, alpha)
        pair = pick_eye_pair(blobs)
        yaw = yaw_of(p.name)
        found[p] = (rgb, alpha, blobs, pair, yaw)
        if pair and yaw is not None:
            c = abs(np.cos(np.radians(yaw)))
            if c > 0.3:
                d_samples.append(abs(pair[0][0] - pair[1][0]) / c)
    d_front = float(np.median(d_samples)) if d_samples else None
    if d_front:
        print(f"标定正脸瞳距 D = {d_front:.1f}px"
              f"（{len(d_samples)} 张合法双眼图，离散度 ±{np.std(d_samples):.1f}px）\n")

    print(f"{'文件':34s} {'眼':>2s} {'两眼中点':>14s} {'位移':>13s} {'依据':>6s}  备注")
    results = {}
    for p in files:
        rgb, alpha, blobs, pair, yaw = found[p]
        note = []
        sep = implied = None

        if pair:
            # 双眼直测最准，优先用
            mx = (pair[0][0] + pair[1][0]) / 2
            my = (pair[0][1] + pair[1][1]) / 2
            sep = abs(pair[0][0] - pair[1][0])
            if yaw is not None and abs(np.cos(np.radians(yaw))) > 0.3:
                implied = sep / abs(np.cos(np.radians(yaw)))
            method = "双眼"
        elif blobs:
            ex, ey, _ = blobs[0]                       # 面积最大的一定是近端眼
            my = ey
            method = "单眼"
            if yaw is None or d_front is None:
                mx = ex
                note.append("⚠️ 无 yaw，只能拿这只眼当中点，务必人工复核")
            else:
                # 两眼各在头中轴 ±D/2，投影后水平偏移 (D/2)·cos(yaw)。
                # 近端眼在鼻子朝向的反侧（由 yR30 双眼实测定出），故 s = -sign(yaw)。
                # |yaw|=90 时 cos=0，修正量为 0，可见眼的 x 就是中点。
                c = abs(np.cos(np.radians(yaw)))
                if yaw == 0:
                    xs = np.nonzero((alpha > 0.5).any(axis=0))[0]
                    s = 1.0 if ex > (int(xs.min()) + int(xs.max())) / 2 else -1.0
                else:
                    s = -1.0 if yaw > 0 else 1.0
                mx = ex - s * (d_front / 2) * c
                note.append(f"另一只眼被遮挡，按 yaw={yaw:+.0f}° 推算 {-s * (d_front / 2) * c:+.0f}px")
        else:
            print(f"{p.name:34s} {'0':>2s} {'—':>14s} {'跳过':>13s} {'—':>6s}  ⚠️ 没检出虹膜")
            results[p.name] = {"eyes": 0}
            continue

        dx, dy = int(round(tx - mx)), int(round(ty - my))
        clipped = 0
        if not args.dry_run and (dx or dy):
            solid_before = int((alpha > 0.5).sum())
            rgb2 = _shift(rgb, dy, dx)
            alpha2 = _shift(alpha, dy, dx)
            clipped = solid_before - int((alpha2 > 0.5).sum())
            save_rgba(rgb2, alpha2, p)
            if clipped > 0:
                note.append(f"平移后有 {clipped}px 主体被画布切掉")

        if args.debug_dir:
            dbg = Path(args.debug_dir)
            dbg.mkdir(parents=True, exist_ok=True)
            shown = [(b[0], b[1]) for b in (pair if pair else blobs[:1])]
            _debug_overlay(rgb, alpha, shown, (mx, my), (tx, ty), dbg / p.name)

        n_eyes = 2 if pair else 1
        results[p.name] = {
            "eyes": n_eyes, "method": method,
            "eyeMidpoint": [round(mx, 1), round(my, 1)], "shift": [dx, dy],
            "interocularProjected": round(sep, 1) if sep else None,
            "interocularImplied": round(implied, 1) if implied else None,
            "clippedPx": clipped,
        }
        print(f"{p.name:34s} {n_eyes:>2d} {f'({mx:.0f}, {my:.0f})':>14s} "
              f"{f'{dx:+d}, {dy:+d}':>13s} {method:>6s}  {'; '.join(note)}")

    if args.dry_run:
        print("\n（--dry-run，没有写文件）")
    if args.json:
        Path(args.json).write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\n→ {args.json}")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    d = Path(args.out)
    files = sorted(d.glob("*.png"))
    if not files:
        print(f"没有找到 png：{d}", file=sys.stderr)
        return 1

    results = {}
    print(f"{'文件':34s} {'尺寸':11s} {'角落A':>6s} {'透明占比':>8s} {'软边px':>8s} {'中心X':>6s}  判定")
    for p in files:
        rgb, alpha = load_rgba(p)
        m = measure(rgb, alpha)
        results[p.name] = m
        bad = []
        if m["size"] != [CANVAS, CANVAS]:
            bad.append("尺寸")
        if m["cornerAlphaMax"] > 0:
            bad.append("角落未透明")
        if m["softEdgePx"] < 1000:
            bad.append("边缘过硬")
        verdict = "PASS" if not bad else "FAIL: " + "/".join(bad)
        # bbox 中心只是锚点的粗略代理（真正基准是两眼中点），偏差大就单独提示
        drift = m["centerX"] - CANVAS // 2
        if abs(drift) > 20:
            verdict += f"  ⚠️中心偏移{drift:+d}px"
        print(f"{p.name:34s} {str(m['size']):11s} {m['cornerAlphaMax']:>6.1f} "
              f"{m['alphaCoverage']:>8.1%} {m['softEdgePx']:>8d} {m['centerX']:>6d}  {verdict}")

    if args.json:
        Path(args.json).write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\n→ {args.json}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="狗狗假3D素材预处理：抠图 / 镜像 / 验收")
    sub = ap.add_subparsers(dest="cmd", required=True)

    m = sub.add_parser("mask", help="批量抠图")
    m.add_argument("--src", default=str(SRC_DIR))
    m.add_argument("--out", default=str(OUT_DIR))
    m.add_argument("--tau-bg", type=float, default=0.05, help="背景色容差(0-1)，越大吃掉的边缘越多")
    m.add_argument("--band", type=int, default=3, help="边缘过渡带宽度(px)")
    m.add_argument("--choke", type=int, default=0, help="向内收缩 alpha(px)，残留白边时调到 1")
    m.add_argument("--feather", type=int, default=1, help="羽化遍数，1 遍 ≈ 1px")
    m.add_argument("--no-rename", dest="rename", action="store_false", help="保留原文件名")
    m.add_argument("--clean", action="store_true", help="删掉输出目录里不是本轮生成的陈旧文件")
    m.add_argument("--json", help="把测量结果写到 json")
    m.set_defaults(func=cmd_mask, rename=True)

    r = sub.add_parser("mirror", help="镜像补全左右角度")
    r.add_argument("--auto", action="store_true", help="扫描 --out 目录，补全缺失的左右对应图")
    r.add_argument("--src")
    r.add_argument("--dst")
    r.add_argument("--out", default=str(OUT_DIR))
    r.add_argument("--recenter", action="store_true", help="镜像后把主体 bbox 水平居中")
    r.add_argument("--force", action="store_true", help="目标已存在也覆盖")
    r.set_defaults(func=cmd_mirror)

    g = sub.add_parser("align", help="按两眼中点对位")
    g.add_argument("--out", default=str(OUT_DIR))
    g.add_argument("--target-x", type=int, default=512)
    g.add_argument("--target-y", type=int, default=430)
    g.add_argument("--dry-run", action="store_true", help="只报告，不改文件")
    g.add_argument("--debug-dir", help="输出标注了眼心/中点/目标的复核图")
    g.add_argument("--json")
    g.set_defaults(func=cmd_align)

    q = sub.add_parser("report", help="验收测量")
    q.add_argument("--out", default=str(OUT_DIR))
    q.add_argument("--json")
    q.set_defaults(func=cmd_report)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
