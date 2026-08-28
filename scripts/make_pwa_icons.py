#!/usr/bin/env python3
"""一次性 PWA 图标产出:由 public/favicon.png(128×128 像素树)生成
public/icons/{icon-192,icon-512,icon-maskable-192,icon-maskable-512}.png。

- 放大一律 NEAREST(像素风无损整数倍优先);
- maskable 变体 = 黑底 + 内容缩至 78%(safe zone 直径 ≥80% 规范);
- 192 档自 512 合成稿 LANCZOS 下采(像素间距 1.5 非整数,轻平滑优于不均);
- 依赖:python3 -m pip install pillow(macOS 自带 python3 即可复现)。
"""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "favicon.png"
OUT = ROOT / "public" / "icons"

BLACK = (10, 12, 16, 255)      # 近黑深蓝黑,比纯 #000 略带色温
SAFE = 0.78                    # maskable 内容占比(safe zone ≥80% 规范留裕量)


def compose(base: int, scale_pct: float) -> Image.Image:
    """生成 base×base 黑底图,scale_pct 控制树内容占边长比例,居中 NEAREST 放置。"""
    canvas = Image.new("RGBA", (base, base), BLACK)
    inner = round(base * scale_pct)
    # 树先放到 inner 尺寸:若为 128 整数倍走 NEAREST,否则经 8x NEAREST 再下采
    if inner % 128 == 0:
        tree = SRC_IMG.resize((inner, inner), Image.NEAREST)
    else:
        big = SRC_IMG.resize((inner * 8, inner * 8), Image.NEAREST)
        tree = big.resize((inner, inner), Image.LANCZOS)
    off = (base - inner) // 2
    canvas.alpha_composite(tree, (off, off))
    return canvas


def main() -> None:
    global SRC_IMG
    OUT.mkdir(parents=True, exist_ok=True)
    SRC_IMG = Image.open(SRC).convert("RGBA")
    assert SRC_IMG.size == (128, 128), f"favicon 形状变化,{SRC_IMG.size} ≠ 128²,须复核脚本"

    full_512 = compose(512, 0.94)        # any 版尽量满幅(留 6% 防边缘贴切)
    mask_512 = compose(512, SAFE)
    for size in (512, 192):
        img = full_512 if size == 512 else full_512.resize((size, size), Image.LANCZOS)
        msk = mask_512 if size == 512 else mask_512.resize((size, size), Image.LANCZOS)
        img.save(OUT / f"icon-{size}.png", optimize=True)
        msk.save(OUT / f"icon-maskable-{size}.png", optimize=True)
    print("icons ->", OUT)


if __name__ == "__main__":
    main()
