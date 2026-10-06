// BJ532 鸟妖间歇性透明探针 v2：A 资产帧行 / B+C 实机时间线（rAF 让路渲染）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(ORIGIN, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  const _s = document.querySelector('select');
  _s.selectedIndex = 0;
  _s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

// ---- A. 静态资产行测量 ----
const asset = await page.evaluate(async () => {
  const res = await fetch('sprites/vanilla/NPC_48.png');
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const H = bmp.height, W = bmp.width;
  const scan = (y0, y1) => {
    const d = g.getImageData(0, y0, W, y1 - y0).data;
    let opaque = 0, total = 0;
    for (let j = 0; j < d.length; j += 4) { total++; if (d[j + 3] > 128) opaque++; }
    return { opaque, total, pct: +(100 * opaque / total).toFixed(1) };
  };
  const rows = [];
  for (let k = 0; k < 6; k++) rows.push({ frame: k, y0: k * 86, ...scan(k * 86, Math.min(H, k * 86 + 86)) });
  return { W, H, rows };
});
console.log('== A. NPC_48.png 资产帧行测量（frames=6 → 86px/行） ==');
console.log(`sheet ${asset.W}x${asset.H}`);
for (const r of asset.rows) console.log(`  frame ${r.frame}: opaque ${r.opaque}/${r.total} (${r.pct}%)`);

// ---- B+C. 实机时间线（页面自身 rAF 渲染,手动泵+让路） ----
await page.evaluate(() => { const g = window.__swGame; if (g?.player) g.player.debugGod = true; });
const live = await page.evaluate(async () => {
  const g = window.__swGame;
  const flow = window.__swFlow;
  if (!g || typeof flow?.spawnVanillaEnemy !== 'function') return { error: 'no-bridge' };
  // 玩家钉地表
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 8;
  while (gy < st.h - 20 && !st.isSolid(px0, gy)) gy++;
  g.player.x = (px0 + 10) * 16; g.player.y = (gy - 6) * 16;
  g.player.hp = g.player.maxHp;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;   // 直写钉位（0.15 缓动旁路）
  // 生成 6 只鸟妖（中心世界像素）
  const anchors = [];
  for (let i = 0; i < 6; i++) {
    const ax = g.player.cx + (i - 2.5) * 90;
    const ay = g.player.cy - 200;
    const meta = await flow.spawnVanillaEnemy(48, ax, ay);
    if (!meta) continue;
    const e = (g.entities.enemies ?? []).find((en) => en.id === meta.id);
    if (e) anchors.push({ e, ax, ay });
  }
  if (anchors.length < 3) return { error: `spawn 不足:${anchors.length}` };
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  // 热身 60t（热身中持续钉锚防飞散）
  for (let i = 0; i < 60; i++) {
    g.fixedUpdate(1 / 60);
    anchors.forEach(({ e, ax, ay }) => { e.x = ax; e.y = ay; e.vx *= 0.9; e.vy *= 0.9; });
  }
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  await raf(); await raf();
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const cam = g.camera;
  // 背景基线:记录移开前中心 → 全部移开 → 渲染一帧 → 按原中心采样
  const saved = anchors.map(({ e }) => ({ x: e.x, y: e.y, cx: e.cx, cy: e.cy }));
  for (const { e } of anchors) { e.x += 1e6; e.y += 1e6; }
  await raf(); await raf();
  const baseAt = saved.map(({ cx, cy }) => {
    const [sx, sy] = cam.worldToScreen(cx, cy);
    return {
      sx: Math.max(0, Math.min(canvas.width - 16, Math.round(sx) - 8)),
      sy: Math.max(0, Math.min(canvas.height - 16, Math.round(sy) - 8)),
    };
  });
  const bases = baseAt.map(({ sx, sy }) => {
    if (sx < 0 || sy < 0 || sx + 16 > canvas.width || sy + 16 > canvas.height) return null;
    return Array.from(ctx.getImageData(sx, sy, 16, 16).data);
  });
  anchors.forEach(({ e }, i) => { e.x = saved[i].x; e.y = saved[i].y; });
  // 保存中心供主循环使用（基线同位采样）
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  await raf(); await raf();
  // 主循环:420t,每 3t 采样;0 号个体每 30t 受击（鞭击模拟）
  const TICKS = 420, HURT_EVERY = 30;
  const pts = [];   // {t,i,frame,alpha,ifr,flash,diff}
  let dbg0 = null;
  for (let t = 0; t < TICKS; t++) {
    g.fixedUpdate(1 / 60);
    g.player.hp = g.player.maxHp;
    if (t % 30 === 0) { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }
    anchors.forEach(({ e, ax, ay }, i) => {
      e.x = ax; e.y = ay; e.vx *= 0.9; e.vy *= 0.9;
      if (i === 0 && t > 0 && t % HURT_EVERY === 0) e.hurt(10, 0, 0, g, 0, false, 0, true);
    });
    if (t % 3 !== 0) continue;
    await raf(); await raf();
    if (t === 0) {
      const [sx, sy] = cam.worldToScreen(anchors[0].e.cx, anchors[0].e.cy);
      dbg0 = { sx: Math.round(sx), sy: Math.round(sy), cw: canvas.width, ch: canvas.height, camx: cam.x, camy: cam.y, cx: anchors[0].e.cx, cy: anchors[0].e.cy };
    }
    anchors.forEach(({ e }, i) => {
      const frame = Math.floor(e.animT / 6) % 6;
      const [sx, sy] = cam.worldToScreen(e.cx, e.cy);
      const x = Math.max(0, Math.min(canvas.width - 16, Math.round(sx) - 8));
      const y = Math.max(0, Math.min(canvas.height - 16, Math.round(sy) - 8));
      let diff = -1;
      const b = bases[i];
      if (b) {
        const d = ctx.getImageData(x, y, 16, 16).data;
        let acc = 0;
        for (let j = 0; j < d.length; j += 4) acc += Math.abs(d[j] - b[j]) + Math.abs(d[j + 1] - b[j + 1]) + Math.abs(d[j + 2] - b[j + 2]);
        diff = Math.round(acc / 256);
      }
      pts.push({ t, i, frame, alpha: e.spawnAlpha, ifr: e.iframes, flash: e.iframes > 0 && e.iframes % 4 < 2 ? 1 : 0, diff });
    });
  }
  // 汇总
  const per = anchors.map((_, i) => {
    const own = pts.filter((p) => p.i === i && p.diff >= 0);
    const byFrame = {}, byFlash = { 0: { n: 0, sum: 0, min: 1e9, max: 0 }, 1: { n: 0, sum: 0, min: 1e9, max: 0 } };
    const alphaVals = new Set();
    for (const p of own) {
      const bf = byFrame[p.frame] = byFrame[p.frame] || { n: 0, sum: 0, min: 1e9, max: 0 };
      bf.n++; bf.sum += p.diff; bf.min = Math.min(bf.min, p.diff); bf.max = Math.max(bf.max, p.diff);
      const bs = byFlash[p.flash]; bs.n++; bs.sum += p.diff; bs.min = Math.min(bs.min, p.diff); bs.max = Math.max(bs.max, p.diff);
      alphaVals.add(p.alpha);
    }
    const fstat = {};
    for (const k of Object.keys(byFrame)) fstat[k] = { n: byFrame[k].n, mean: Math.round(byFrame[k].sum / byFrame[k].n), min: byFrame[k].min, max: byFrame[k].max };
    const flstat = {};
    for (const k of Object.keys(byFlash)) flstat[k] = { n: byFlash[k].n, mean: Math.round(byFlash[k].sum / byFlash[k].n), min: byFlash[k].min, max: byFlash[k].max };
    return { i, samples: own.length, alphaVals: [...alphaVals], byFrame: fstat, byFlash: flstat, timeline: own.map((p) => `${p.t}:f${p.frame}a${p.alpha}i${p.ifr}${p.flash ? 'F' : ''}d${p.diff}`).join(' ') };
  });
  return { spawned: anchors.length, dbg0, per };
});
console.log('\n== B+C. 实机鸟妖时间线 ==');
if (live.error) console.log('ERROR:', live.error);
if (live.dbg0) console.log('屏幕映射自查:', JSON.stringify(live.dbg0));
for (const p of live.per ?? []) {
  console.log(`\n-- 个体 ${p.i}（采样 ${p.samples}; spawnAlpha 取值集 ${JSON.stringify(p.alphaVals)}）`);
  console.log('   按帧分组 diff:', JSON.stringify(p.byFrame));
  console.log('   按flash分组 diff:', JSON.stringify(p.byFlash));
  console.log('   时序:', p.timeline);
}
if (errors.length) console.log('\n页面异常:', errors.slice(0, 3));
await browser.close();
