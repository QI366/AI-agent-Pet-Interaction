"""Import generated example assets into the project.

The generator output is kept under assets/imported/db/source. Processed files are
written under the project's asset namespaces and are referenced by manifest.json.
White-background RGB images are cut out with the same algorithm as image_masking.py;
existing RGBA images keep their alpha channel.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

from image_masking import cutout, save_rgba

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = Path(r"C:\Users\zhuoz\Desktop\示例图\db")
CANVAS = (1024, 1024)


def destination(name: str) -> Path:
    if name.startswith("poodle_pose_"):
        return ROOT / "assets" / "imported" / "db" / "poses" / name
    if name.startswith("poodle_expr_"):
        return ROOT / "assets" / "imported" / "db" / "expressions" / name
    if name.startswith("poodle_layer_"):
        pose = "yC00_pC00"
        return ROOT / "assets" / "imported" / "db" / "layers" / pose / name
    if name.startswith("fx_"):
        return ROOT / "assets" / "imported" / "db" / "fx" / name
    if name.startswith("prop_"):
        return ROOT / "assets" / "imported" / "db" / "props" / name
    if name.startswith("ui_"):
        return ROOT / "assets" / "imported" / "db" / "ui" / name
    raise ValueError(f"unsupported asset name: {name}")


def process(src: Path, dst: Path) -> dict:
    image = Image.open(src).convert("RGBA")
    if image.size != CANVAS:
        image = image.resize(CANVAS, Image.Resampling.LANCZOS)
    arr = np.asarray(image, dtype=np.float32) / 255.0
    rgb = arr[..., :3].copy()
    alpha_in = arr[..., 3].copy()
    # RGB generator output has a fully opaque alpha channel and needs cutout.
    if "A" not in Image.open(src).getbands():
        rgb, alpha, info = cutout(rgb, np.ones(CANVAS, dtype=np.float32), tau_bg=0.05, band=3, choke=0, feather=1)
    else:
        alpha = alpha_in
        info = {"bgKind": "source-alpha", "preCut": True}
    save_rgba(rgb, alpha, dst)
    return info


def main() -> int:
    ap = argparse.ArgumentParser(description="Import and normalize generated pet assets")
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC)
    ap.add_argument("--keep-source", action="store_true", help="also copy original files into assets/imported/db/source")
    args = ap.parse_args()
    if not args.src.is_dir():
        ap.error(f"source directory does not exist: {args.src}")

    source_copy = ROOT / "assets" / "imported" / "db" / "source"
    count = 0
    for src in sorted(args.src.glob("*.png")):
        dst = destination(src.name)
        dst.parent.mkdir(parents=True, exist_ok=True)
        info = process(src, dst)
        if args.keep_source:
            source_copy.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, source_copy / src.name)
        print(f"{src.name:46s} -> {dst.relative_to(ROOT)}  {info.get('bgKind')}")
        count += 1
    print(f"\nImported {count} PNG files into {ROOT / 'assets' / 'imported' / 'db'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
