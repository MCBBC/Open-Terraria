// 一次性探针:BJ109-B 四柱弹幕光照/glow 面 A/B 采样。
//   ① 世界光 A/B:夜晚地表,基线 lightAt vs 生成弹后 lightAt(同格)——
//      575(AI AddLight 0.5,0.1,0.3)/580(AI AddLight 0.3,0.45,0.5)应显著抬升;
//      539(原版本体无 AddLight,尘光另计)近零=与原版同相。
//   ② 绘制 glow A/B:主画布弹心像素亮度 vs 48px 偏移点——539 GlowMask[140] 加色
//      pass 使弹心显著亮于邻点;对照 577(无 glow 面,环境光弹)差异应小。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const { LunarOrb, VortexPortalProj } = await import('/src/entities/bossAI_lunar_misc.ts');
  const { LightningBoltProj } = await import('/src/entities/LightningBoltProj.ts');

  // ---- 场地:高空平台 4 站,间距 14 格(光半径互不沾) ----
  const px = Math.floor(g.player.cx / 16);
  const baseY = Math.max(20, Math.floor(g.world.groundLevel) - 30);
  const spots = [0, 14, 28, 42].map((dx) => ({ x: px + dx, y: baseY }));
  for (const s of spots) {
    for (let dy = -8; dy <= 3; dy++) for (let dx = -6; dx <= 6; dx++) {
      st.setTile(s.x + dx, s.y + dy, 0);
      st.liquid[st.idx(s.x + dx, s.y + dy)] = 0;
    }
    for (let dx = -6; dx <= 6; dx++) st.setTile(s.x + dx, s.y + 3, 2);   // 泥地板
  }
  // ---- 拨夜钟:扫 0..1 找最暗档 ----
  let darkest = 0, darkestV = 999;
  for (let t = 0; t <= 100; t += 5) {
    g.world.clock.timeOfDay = t / 100;
    g.lighting?.compute?.(0);
    const [r] = g.lighting.lightAt(spots[0].x, spots[0].y);
    if (r < darkestV) { darkestV = r; darkest = t / 100; }
  }
  g.world.clock.timeOfDay = darkest;

  g.player.x = spots[1].x * 16 + 8 - g.player.w / 2; g.player.y = (spots[1].y) * 16 + 8;
  g.player.vx = 0; g.player.vy = 0;
  const lightAt = (s) => g.lighting.lightAt(s.x, s.y);
  await new Promise((r) => setTimeout(r, 300));            // 让光照 settle 数拍
  const baseline = spots.map(lightAt);

  // ---- 生成四弹(各占一站) ----
  const wpx = (s) => [s.x * 16 + 8, s.y * 16 + 8];
  const made = {};
  {
    const [x, y] = wpx(spots[0]);
    const a = new Arrow(x, y, -2, 0, 50, 0, 575, { grav: 0, life: 600, pierce: 1, hostile: true });
    g.entities.add(a, 'projectiles'); made.p575 = a;
  }
  {
    const [x, y] = wpx(spots[2]);
    const b = new LightningBoltProj(x, y, 2, 0, 580, 0, 42);
    g.entities.add(b, 'projectiles'); made.p580 = b;
  }
  {
    const [x, y] = wpx(spots[3]);
    const v = new VortexPortalProj(x, y, 578);
    g.entities.add(v, 'projectiles'); made.p578 = v;
  }

  // ---- 等 ~30 拍(光照 settle;575 每拍 lightRGB;578 进显形段) ----
  await new Promise((r) => setTimeout(r, 700));
  const after = spots.map(lightAt);

  // ---- 弹心像素亮度采样(主画布 2D) ----
  let canvas = null;
  for (const c of document.querySelectorAll('canvas')) {
    if (c.width >= canvas?.width || !canvas) { try { c.getContext('2d'); canvas = c; } catch {} }
  }
  const cctx = canvas.getContext('2d');
  const cam = g.camera;
  const brightAt = (wx, wy) => {
    const [sx, sy] = cam.worldToScreen(wx, wy);
    const d = cctx.getImageData(Math.max(0, sx | 0), Math.max(0, sy | 0), 1, 1).data;
    return (d[0] + d[1] + d[2]) / 3;
  };
  // 539 于采样前一拍生成(父空 AI=立即 16 速冲玩家,久置必死——1 拍内=活体采样)
  {
    const [x, y] = wpx({ x: spots[1].x, y: spots[1].y - 10 });
    const o = new LunarOrb(null, 539, 0, 0, 60, x, y);
    o.x = x - o.w / 2; o.y = y - o.h / 2; o.vx = 0; o.vy = 0;
    g.entities.add(o, 'projectiles'); made.p539 = o;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const drawSamples = {};
  for (const [k, e] of Object.entries(made)) {
    const cx = e.cx, cy = e.cy;
    drawSamples[k] = { center: brightAt(cx, cy), off: brightAt(cx + 48, cy + 48), alive: !e.dead, pos: [cx | 0, cy | 0] };
  }
  // 对照:577 环境光弹(无 glow 面)也画一颗采同组数据
  {
    const [x, y] = wpx({ x: spots[3].x + 14, y: spots[3].y - 6 });
    const l = new Arrow(x, y, 0.01, 0, 30, 0, 577, { grav: 0, life: 600, pierce: 1, hostile: true });
    g.entities.add(l, 'projectiles');
    await new Promise((r) => setTimeout(r, 350));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    drawSamples.p577 = { center: brightAt(l.cx, l.cy), off: brightAt(l.cx + 48, l.cy + 48), alive: !l.dead };
  }

  const fmt = (a) => a.map(([r, gg, b]) => `[${r},${gg},${b}]`).join(' ');
  return {
    night: darkest, baseline: fmt(baseline), after: fmt(after),
    delta: after.map((v, i) => `[${v[0] - baseline[i][0]},${v[1] - baseline[i][1]},${v[2] - baseline[i][2]}]`).join(' '),
    alive: Object.fromEntries(Object.entries(made).map(([k, e]) => [k, !e.dead])),
    drawSamples,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
