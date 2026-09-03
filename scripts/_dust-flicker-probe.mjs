// 尘"时有时无"闪烁探针（2026-09-03 用户实报：尾焰/叶尘/叶刃尘时有时无+疑光照相关）。
// 定点 spawn d6(烟,有光链)/d31(火,无光链) 各一粒 → 60 帧时间线：
//   每帧记 {active, scale, alpha, 屏幕亮度}——
//   active 翻转=update 杀（光照门/老化/池覆盖）；active 稳而亮度闪=渲染/合成面。
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
  const g = window.__swGame, p = g.player, cam = g.camera, cv = g.renderer.canvas;
  const vd = g.vanillaDust;
  if (!vd) return { err: 'no vanillaDust' };
  // 定点尘：玩家上方天空（不动+noGravity+perfect 钉位）
  const wx = p.cx, wy = p.cy - 220;
  const d6 = vd.spawn(wx, wy, 0, 0, 6, 0, 0, 100, null, 1.5, { perfect: true });
  const d31 = vd.spawn(wx + 30, wy, 0, 0, 31, 0, 0, 100, null, 1.5, { perfect: true });
  if (d6) { d6.noGravity = true; }
  if (d31) { d31.noGravity = true; }
  const [sx, sy] = [Math.round((wx - cam.x) * cam.zoom + cv.width / 2), Math.round((wy - cam.y) * cam.zoom + cv.height / 2)];
  const [sx2, sy2] = [Math.round((wx + 30 - cam.x) * cam.zoom + cv.width / 2), sy];
  const tl = [];
  await new Promise((resolve) => {
    let n = 0;
    const tick = () => {
      const lum = (x, y) => {
        try {
          const img = g.renderer.ctx.getImageData(x - 6, y - 6, 12, 12).data;
          let s = 0; for (let i = 0; i < img.length; i += 4) s += img[i] + img[i + 1] + img[i + 2];
          return s / (img.length / 4);
        } catch { return -1; }
      };
      tl.push({
        f: n,
        a6: d6 ? d6.active : null, s6: d6 ? +d6.scale.toFixed(3) : null,
        a31: d31 ? d31.active : null, s31: d31 ? +d31.scale.toFixed(3) : null,
        l6: Math.round(lum(sx, sy)), l31: Math.round(lum(sx2, sy2)),
      });
      if (++n >= 60) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const flick = (key) => {
    const vals = tl.map((t) => t[key]).filter((v) => v !== null && v >= 0);
    const uniq = [...new Set(vals)];
    return { uniqCount: uniq.length, min: Math.min(...vals), max: Math.max(...vals) };
  };
  return {
    active6: [...new Set(tl.map((t) => t.a6))],
    active31: [...new Set(tl.map((t) => t.a31))],
    scale6: flick('s6'), scale31: flick('s31'),
    lum6: flick('l6'), lum31: flick('l31'),
    head: tl.slice(0, 8), tail: tl.slice(-4),
  };
});
console.log(JSON.stringify(out));
await browser.close();
