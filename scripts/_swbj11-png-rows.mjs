// SW-BJ11: 对实机截图做逐行 alpha 占据分析(玩家精灵区 320×380 @zoom6 → 精灵 240×336)
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';
for (const tag of ['live-bare', 'live-copper']) {
  const png = PNG.sync.read(readFileSync(`/tmp/swbj11/${tag}.png`));
  console.log(`== ${tag} (${png.width}x${png.height})`);
  // 背景 = 游戏场景(非纯色),改用"与相邻行差异"不可靠;直接打印每行非天空像素? 太噪。
  // 改:打印每行最左/最右非透明?截图无 alpha。→ 用色块检测:头/甲色已知?
  // 替代:打印每行像素养色 12 列缩略(取 24 列降采样),供人工判读断层
  const cols = 24, stepX = png.width / cols;
  for (let y = 0; y < png.height; y += 2) {
    let s = '';
    for (let c = 0; c < cols; c++) {
      const x = Math.floor(c * stepX);
      const i = (y * png.width + x) * 4;
      const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
      // 粗分类:肤色/发色/甲铜色/衣红/裤蓝/鞋棕/天空/绿草/其他
      if (r > 200 && g > 170 && b > 140) s += 'S';        // 肤
      else if (r > 90 && r < 160 && g > 55 && g < 110 && b < 70) s += 'H'; // 发/铜棕
      else if (r > 170 && g < 130 && b < 110) s += 'C';   // 铜/红
      else if (b > 120 && r < 110) s += 'P';              // 蓝裤
      else if (g > 130 && r < 120) s += 'G';              // 草绿
      else if (b > 150 && g > 170) s += 'K';              // 天空
      else if (r < 60 && g < 60 && b < 60) s += 'D';      // 暗
      else s += '.';
    }
    console.log(String(y).padStart(3), s);
  }
}
