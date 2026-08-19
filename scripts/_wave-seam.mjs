// 水波缝检测:湖面中心列,表层格底边(整 y=242*16=3872)±3px 带内逐帧找
// "水感骤降行"(缝=整行无水色调,上下行都是水)。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/seam-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 },
});
const page = await browser.newPage();
page.setDefaultTimeout(300000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 390 * 16; g.player.y = 250 * 16;
  const c = g.world.clock; if (c) c.timeOfDay = 0.4;
});
await new Promise((r) => setTimeout(r, 5000));
// 强制大幅分数位移(复现用户场景:波动中每列 dWy 各不同且带小数)
await page.evaluate(async () => {
  const m = await import('/src/render/WaterWaves.ts');
  const w = m.waterWaves;
  let phase = 0;
  w.sampleDisplace = (x, y, out) => {
    phase += 0.13;
    out[0] = 0;
    out[1] = Math.sin(x / 32 + phase) * 4 + 1.37;   // ±4 世界px 摆动 + 恒定分数
  };
});
// 确认水浪开启
const cfg = await page.evaluate(async () => {
  const m = await import('/src/render/WaterWaves.ts');
  const w = m.waterWaves;
  // 波位移活性:同点采样两个时刻,值应不同
  const d1 = [0, 0]; w.sampleDisplace(390 * 16, 241 * 16 + 8, d1);
  await new Promise((r) => setTimeout(r, 200));
  const d2 = [0, 0]; w.sampleDisplace(390 * 16, 241 * 16 + 8, d2);
  return { quality: w.quality, forcedY: +d1[1].toFixed(2), forcedY2: +d2[1].toFixed(2) };
});
console.log('[水浪]', JSON.stringify(cfg));
// 25 帧采样:交界带 y=3872±3(x=390..400 多列),缝=某行蓝度远低于上下行
// 交界区像素真值:强制波下 dump 行 3864..3878 的 RGBA 均值(x=394 列)
const pix = await page.evaluate(async () => {
  const g = window.__swGame, r = g.renderer, ctx = r.ctx, cv = r.canvas;
  const cam = g.camera, z = cam.zoom;
  const w2s = (wx, wy) => [cv.width / 2 + (wx - cam.x) * z, cv.height / 2 + (wy - cam.y) * z];
  const out = [];
  for (let wy = 3864; wy <= 3878; wy++) {
    const [ax, ay] = w2s(394 * 16, wy);
    const d = ctx.getImageData(Math.round(ax), Math.round(ay), 6, 1).data;
    let R = 0, G = 0, B = 0, A = 0;
    for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; A += d[i + 3]; }
    const n = d.length / 4;
    out.push({ wy, r: Math.round(R / n), g: Math.round(G / n), b: Math.round(B / n), a: Math.round(A / n) });
  }
  return out;
});
console.log('[像素]', JSON.stringify(pix));
const res = await page.evaluate(async () => {
  const g = window.__swGame, r = g.renderer, ctx = r.ctx, cv = r.canvas;
  const cam = g.camera, z = cam.zoom;
  const w2s = (wx, wy) => [cv.width / 2 + (wx - cam.x) * z, cv.height / 2 + (wy - cam.y) * z];
  let seams = 0, frames = 0;
  const seamRows = {};
  let caught = false; const catches = [];
  const B = 242 * 16;   // 表层格底边(世界px)
  for (let f = 0; f < 25; f++) {
    await new Promise((res) => setTimeout(res, 120));
    for (let tx = 391; tx <= 399; tx += 2) {
      const [ax] = w2s(tx * 16 + 4, 0);
      const [, ay] = w2s(0, B - 5 * z);
      const W = 8, H = Math.round(10 * z);
      const d = ctx.getImageData(Math.round(ax), Math.round(ay), W, H).data;
      const blue = [];
      for (let y = 0; y < H; y++) {
        let b2 = 0;
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          b2 += (d[i + 2] - d[i]);   // 蓝-红
        }
        blue.push(b2 / W);
      }
      for (let k = 2; k < H - 2; k++) {
        if (blue[k] < blue[k - 2] - 25 && blue[k] < blue[k + 2] - 25 && blue[k + 2] > 10) {
          seams++;
          const worldY = B - 5 + k / z;
          seamRows[Math.round(worldY)] = (seamRows[Math.round(worldY)] ?? 0) + 1;
          if (!caught && catches.length < 3) {
            caught = true;
            for (let yy = 0; yy < H; yy++) catches.push({ wy: Math.round(B - 5 + yy / z), blue: Math.round(blue[yy]) });
          }
          break;
        }
      }
    }
    frames++;
  }
  return { frames, columns: frames * 5, seams, seamRows, catches: catches.slice(0, 30) };
}).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log('[缝检测]', JSON.stringify(res));
await browser.close();
