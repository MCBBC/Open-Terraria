// 尘边缘暗晕定谳探针（2026-09-03 用户实报"尾焰/叶尘/叶刃尘边缘变黑"）。
// 方法：实机 dustPremulPair（真 bake）+ drawDustPremul 同式绘制到纯白底离屏 →
// 读边缘 texel 剖面 → 与 AlphaBlend 手算 final=dst×(1−texA×mA)+texP×mRGB 逐值对照。
// 一致=管线忠实、暗晕=预乘 AlphaBlend 本征（原版同观感）；不一致=管线有变暗 bug。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame, R = g.renderer;
  const img = R.atlas.ensureVImage('vanilla/Dust.png');
  if (!img) return { err: 'no Dust.png' };
  // 31 号火尘帧（dustFrameOf(31): fx=310? 帧 X=10×31−1000=?——直接用 fx/fy 与游戏同源）
  const { VanillaDust } = await import('/src/fx/VanillaDust.ts');
  const probe = { type: 31, alpha: 0, scale: 1, noLight: false, noGravity: true, color: null, fx: 0, fy: 0 };
  // dustFrameOf 是模块函数（导入面里导出）
  const { dustFrameOf } = await import('/src/fx/VanillaDust.ts');
  const f = dustFrameOf(31);
  probe.fx = f.fx; probe.fy = f.fy;
  const ga = VanillaDust.alphaOf(probe);   // {rgb, a}
  // 实机 bake（私有 dustPremulPair——真实现）
  const pair = R.dustPremulPair(img, probe.fx, probe.fy, ga.rgb, ga.rgb, ga.rgb, ga.a);
  // 8×8 白底离屏，同 drawDustPremul 语义绘制（add 'lighter' + erase 'destination-out'）
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, 8, 8);
  // add 面
  // pair.add/erase 是 canvas（dustPremulPair 返回 {add,erase} 双 canvas）——直绘
  cx.save();
  cx.globalCompositeOperation = 'destination-out';
  cx.drawImage(pair.erase, 0, 0);
  cx.globalCompositeOperation = 'lighter';
  cx.drawImage(pair.add, 0, 0);
  cx.restore();
  const got = cx.getImageData(0, 0, 8, 8).data;
  // 手算：读原帧 tex → final
  const tc = document.createElement('canvas'); tc.width = img.width; tc.height = img.height;
  const tcx = tc.getContext('2d', { willReadFrequently: true });
  tcx.drawImage(img, 0, 0);
  const full = tcx.getImageData(probe.fx, probe.fy, 8, 8).data;
  const mR = ga.rgb, mA = ga.a;
  const expect = new Array(8);
  for (let x = 0; x < 8; x++) {
    const i = (3 * 8 + x) * 4;   // 中行剖面
    const tA = full[i + 3] / 255, tR = full[i] / 255, tG = full[i + 1] / 255, tB = full[i + 2] / 255;
    // dustPremulBake: add.rgb=tex.rgb*texA*m/255²（×255→tex.rgb*texA*m/255）;erase.a=texA*mA
    const eA = tA * mA;
    const aR = tR * tA * mR, aG = tG * tA * mR, aB = tB * tA * mR;
    expect[x] = [
      Math.round(255 * (1 - eA) + aR * 255),
      Math.round(255 * (1 - eA) + aG * 255),
      Math.round(255 * (1 - eA) + aB * 255),
      Math.round(tA * 255), Math.round(eA * 255),
    ];
  }
  const gotRow = new Array(8);
  for (let x = 0; x < 8; x++) {
    const i = (3 * 8 + x) * 4;
    gotRow[x] = [got[i], got[i + 1], got[i + 2], got[i + 3]];
  }
  // 边缘暗晕量化：中行最亮 texel vs 邻近暗 texel
  return {
    ga, maxDiff: (() => {
      let d = 0;
      for (let x = 0; x < 8; x++) for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(gotRow[x][k] - expect[x][k]));
      return d;
    })(),
    profile: { got: gotRow, expect: expect.map((e) => e.slice(0, 3)) },
  };
});
console.log(JSON.stringify(out));
await browser.close();
