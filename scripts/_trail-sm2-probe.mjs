// obj55 "MagicMissile" pass SM2 拖尾像素面实机探针（2026-09-03）。
// 验证链：真实 PNG（vanilla/Extra_191/189/190）→ atlas 解码 → extraData 像素域 →
// SM2 字节码（codegen/VM）→ 覆盖格光栅 → 'lighter' 画布。
// A. drawStripTrail 直调：FlameLash 水平带（玩家上方纯天空）→ 带窗像素统计
//    （非零数/头亮/尾黑[edge 包络]/彩色分布）+ MagicMissile 同带（uSaturation
//    钉值差异 → 两 buffer 输出不同）。
// B. MissileProj 集成面：MagicMissileProj 实例（projId=34）填 strip → draw(g.renderer)
//    →（r.atlas 透传链活）带窗出现着色像素。
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
  const g = window.__swGame, p = g.player;
  const res = {};
  const { drawStripTrail, prewarmTrailTextures } = await import('/src/fx/TrailShader.ts');
  prewarmTrailTextures(g.renderer.atlas);
  await new Promise(r => setTimeout(r, 800));   // raw Image onload 异步落地
  // 离屏画布：世界坐标直画（原点=离屏原点），排除主画布背景/渲染循环干扰
  const off = document.createElement('canvas');
  off.width = 640; off.height = 200;
  const octx = off.getContext('2d', { willReadFrequently: true });
  const bandY = 100;
  const mkPts = () => Array.from({ length: 12 }, (_, i) => ({
    x: 60 + i * 46, y: bandY, hw: 10,
    r: 1, g: 0.3, b: 0.1, a: 0.5,
  }));
  const stats = () => {
    const img = octx.getImageData(0, 0, 640, 200).data;
    let lit = 0, warm = 0;
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i], gg = img[i + 1], b = img[i + 2];
      if (r + gg + b > 30) { lit++; if (r >= gg && gg >= b && r > 60) warm++; }
    }
    // 头/尾 1/4 窗差分（edge 包络：头亮尾黑）
    let head = 0, tail = 0;
    for (let py = 0; py < 200; py++) for (let px = 0; px < 160; px++) {
      const o = (py * 640 + px) * 4;
      if (img[o] + img[o + 1] + img[o + 2] > 30) head++;
      const o2 = (py * 640 + 480 + px) * 4;
      if (img[o2] + img[o2 + 1] + img[o2 + 2] > 30) tail++;
    }
    return { lit, warm, head, tail };
  };
  // A1: FlameLash
  const op = 4;
  drawStripTrail(octx, g.renderer, { set: 'FlameLash', pts: mkPts(), opacity: op, time: 1.25 });
  const a1 = stats();
  const flameR = Array.from(octx.getImageData(0, 0, 640, 200).data.filter((_, i) => i % 4 === 0));
  res.A = a1;
  res.A.headTailRatio = a1.head > 0 ? +(a1.head / Math.max(1, a1.tail)).toFixed(2) : 0;
  // A2: MagicMissile 清屏重画（uSaturation -2.8 vs -2 同 time）
  octx.clearRect(0, 0, 640, 200);
  drawStripTrail(octx, g.renderer, { set: 'MagicMissile', pts: mkPts(), opacity: 2, time: 1.25 });
  const mmR = Array.from(octx.getImageData(0, 0, 640, 200).data.filter((_, i) => i % 4 === 0));
  let pxDiff = 0;
  for (let i = 0; i < Math.min(flameR.length, mmR.length); i++) if (Math.abs(flameR[i] - mmR[i]) > 0) pxDiff++;
  res.A.setDiffPx = pxDiff;
  // A3: uTime 活性。★单位定谳：phase=uSat×uTime 的单位=UV 全幅（wrap 寻址）——
  //  ΔUV=整数⇒wrap 同相位逐字节同（首版 40s→ΔUV=−80 整数即此翻车）。原版滚动
  //  周期=0.5s/UV（FlameLash sat=-2: ΔUV=1 每 0.5s）。Δtime=0.25 → ΔUV=0.5 半幅
  octx.clearRect(0, 0, 640, 200);
  drawStripTrail(octx, g.renderer, { set: 'FlameLash', pts: mkPts(), opacity: op, time: 0 });
  const t0 = Array.from(octx.getImageData(0, 0, 640, 200).data.filter((_, i) => i % 4 === 0));
  octx.clearRect(0, 0, 640, 200);
  drawStripTrail(octx, g.renderer, { set: 'FlameLash', pts: mkPts(), opacity: op, time: 0.25 });
  const t1 = Array.from(octx.getImageData(0, 0, 640, 200).data.filter((_, i) => i % 4 === 0));
  let tDiff = 0;
  for (let i = 0; i < Math.min(t0.length, t1.length); i++) if (Math.abs(t0[i] - t1[i]) > 0) tDiff++;
  res.A.timeDiffPx = tDiff;
  // B: MissileProj 集成面（projId=34）——draw(r) 鸭子传离屏 ctx+真 atlas
  octx.clearRect(0, 0, 640, 200);
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const m = new MagicMissileProj(60, bandY - 16, 3, 0, {
    projId: 34, damage: 25, knockback: 4, useTime: 20,
  });
  m.stripCap = 30;
  // strip 语义=[0]=最新（unshift 压栈）——整表直赋保持 mkPts 顺序（x 小=新端），
  // 逐个 unshift 会把最后点顶到 [0] = 新旧翻转（首版 head<tail 即此）
  m.strip = mkPts().map((q) => ({ x: q.x, y: q.y }));
  m.redT = 0;
  m.dead = true;
  m.draw({ canvas: off, ctx: octx, atlas: g.renderer.atlas });
  res.B = { ...stats(), drawOk: true };
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
