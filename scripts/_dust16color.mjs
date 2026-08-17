// 尘16 渲染色裁决：正午平地裸装跑动 → 截图 + 画布像素直读 + lightAt + 尘池状态。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  // 平整泥土跑道（type 1=泥? 本仓泥土 tile——用 0 dirt 换算：T 里 dirt 常量未知，直接抄玩家脚下类型）
  const under = st.type[st.idx(Math.floor(p.x / 16), Math.floor(p.y / 16) + 3)];
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16) + 6;
  for (let dx = -90; dx <= 90; dx++) for (let dy = -14; dy <= 2; dy++)
    st.setTile(bx + dx, by + dy, dy === 2 ? under : 0);
  // 正午
  const clock = g.world.clock;
  clock.timeOfDay = 0.5; clock.dayCount = clock.dayCount || 1;
  if (g.lighting?.dirty !== undefined) g.lighting.dirty = true;
  await new Promise(r => setTimeout(r, 400));
  p.x = bx * 16 + 8; p.y = (by + 2) * 16 - p.h; p.vx = 0; p.vy = 0; p.onGround = false;
  await new Promise(r => setTimeout(r, 400));
  g.input.touchKeys.add('KeyD');
  await new Promise(r => setTimeout(r, 1800));
  // 采样窗口
  const cam = g.camera, cv = g.renderer.canvas;
  const sx = (p.x + p.w / 2 - cam.x) * cam.zoom + cv.width / 2;
  const sy = (p.y + p.h - cam.y) * cam.zoom + cv.height / 2;
  const X = Math.max(0, Math.round(sx) - 90), Y = Math.max(0, Math.round(sy) - 50);
  const W = 180, H = 70;
  const img = g.renderer.ctx.getImageData(X, Y, W, H).data;
  const hist = new Map();
  for (let i = 0; i < img.length; i += 4) {
    if (img[i + 3] < 60) continue;
    const key = `${img[i]},${img[i + 1]},${img[i + 2]}`;
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
    .map(([k, n]) => ({ c: k, n }));
  const dusts = g.vanillaDust.pool.filter(d => d.active && d.type === 16)
    .slice(0, 4).map(d => ({ fx: d.fx, fy: d.fy, scale: +d.scale.toFixed(2), alpha: d.alpha, color: d.color ? `${d.color.r},${d.color.g},${d.color.b},${d.color.a}` : null, dye: d.dyeVid, x: Math.round(d.x), y: Math.round(d.y) }));
  const ft = [Math.floor(p.cx / 16), Math.floor((p.y + p.h + 2) / 16)];
  const light = g.lighting ? g.lighting.lightAt(ft[0], ft[1]) : null;
  g.input.touchKeys.delete('KeyD');
  return {
    timeOfDay: +clock.timeOfDay.toFixed(4), vx: +p.vx.toFixed(2),
    feetTile: ft, lightAt: light, dusts, topColors: top,
    clip: { X, Y, W, H },
  };
});
console.log(JSON.stringify(out, null, 1));
if (out.clip) {
  const c = out.clip;
  await page.screenshot({ path: '/tmp/dust16_run.png', clip: { x: Math.round(c.X), y: Math.round(c.Y), width: Math.round(c.W), height: Math.round(c.H) } });
}
await browser.close();
