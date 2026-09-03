// 尘/premul 黑方块哨兵（2026-09-03 防复发）。
// 背景：dustPremulBake add.A 曾恒 255（a382dfdf 09-02 15:31）——rgb=0 texel（帧透明
// 角/叶尘黑晕圈）被 'lighter' 抬成 worldLayer 不透明黑 → 合成替换天空=黑色实心方块
// （用户实报叶尘/尾焰尘方块化）。铁律：**加算/预乘写入面 rgb=0 的 texel 不得有 alpha**
// （与 TrailShader premul 陷阱同根）。
// 扫描面：真实 Dust.png 全帧 × alpha 档 {0,100,175,255} × smoke 族 scale 特例，
// 走游戏真 bake（dustPremulPair/dustPremulBake 同源）→ 违例=rgb 全 0 且 a>0。
// 用法：SW_ORIGIN=http://localhost:5199 node tools/run-diag.mjs scripts/_dust-blackblock-sentinel.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, R = g.renderer;
  const { VanillaDust, dustPremulBake, dustFrameOf } = await import('/src/fx/VanillaDust.ts');
  const img = R.atlas.ensureVImage('vanilla/Dust.png');
  if (!img) return { err: 'no Dust.png' };
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const full = cx.getImageData(0, 0, img.width, img.height).data;
  // 帧定位（与渲染侧 dustFrameOf 同式,三变体全扫）
  const viol = [];
  let checked = 0;
  const ALPHAS = [0, 100, 175, 255];
  for (let type = 0; type <= 340; type++) {
    for (const fvi of [0, 1, 2]) {
      const f = dustFrameOf(type);
      const fy = fvi * 10;
      if (fy + 8 > img.height || f.fx + 8 > img.width) continue;
      const tex = new Uint8ClampedArray(8 * 8 * 4);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const si = ((fy + y) * img.width + f.fx + x) * 4;
          const di = (y * 8 + x) * 4;
          tex[di] = full[si]; tex[di + 1] = full[si + 1]; tex[di + 2] = full[si + 2]; tex[di + 3] = full[si + 3];
        }
      }
      for (const alpha of ALPHAS) {
        const m = (255 - alpha) / 255;
        const { add } = dustPremulBake(tex, m, m, m, m);
        checked++;
        for (let i = 0; i < add.length; i += 4) {
          if (add[i + 3] > 0 && add[i] + add[i + 1] + add[i + 2] === 0) {
            viol.push({ type, fvi, alpha, texel: [i / 4 % 8, Math.floor(i / 4 / 8)] });
            break;   // 每帧×档报一次即可
          }
        }
      }
    }
  }
  return { checked, violations: viol.length, sample: viol.slice(0, 8) };
});
console.log(JSON.stringify(out));
await browser.close();
