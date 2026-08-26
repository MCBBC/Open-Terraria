// 修齐批①探针：四柱护盾泡（5240）。
// (a) 生成星云柱 507+置盾 → 强制渲染 → 泡域像素非零且含柱色沿
// (b) 盾清零 → 破盾波（膨胀淡出）像素仍在且随 tick 衰减
// (c) SM2 直连/回退二择：断言至少一路生效（泡域 lit>阈值）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5240';
const browser = await puppeteer.launch({
  protocolTimeout: 400000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('FF');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const R = { checks: [], dbg: {} };
  const ck = (n, ok, d) => R.checks.push({ n, ok, d });
  const p = g.player;
  const st0 = g.world.store;
  const px = Math.floor(p.x / TILE);
  let sy = Math.max(5, Math.floor(g.world.groundLevel));
  p.x = px * TILE;
  for (let t = 0; t < 40; t++) {
    p.y = sy * TILE - p.h - 2;
    if (!st0.isSolid(Math.floor(p.cx / 16), Math.floor((p.y + p.h / 2) / 16))) break;
    sy -= 1;
  }
  p.vx = 0; p.vy = 0;
  for (let i = 0; i < 120; i++) g.fixedUpdate(1 / 60);
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;
  g.world.clock.timeOfDay = 0.5; g.world.clock.dayTime = true;

  // 生成星云柱 507 于玩家右上开阔处
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const tower = Enemy.fromVanilla(507, (px + 12) * TILE, (sy - 8) * TILE);
  g.entities.add(tower, 'enemies');
  // 盾置满（R23b LunarEvent 状态）
  const le = g.world.lunarEvent;
  if (le) { le.shield = le.shield || {}; le.shield.nebula = 100; le.towerActive = le.towerActive || {}; le.towerActive.nebula = true; }
  const dpr = g.renderer.dpr || 1;
  const cv = g.renderer.canvas;
  function sampleBox(wx, wy, half) {
    try {
      const w2s = g.camera.worldToScreen ? g.camera.worldToScreen(wx, wy) : null;
      if (!w2s) return { err: 'w2s-missing camera=' + typeof g.camera };
      const sxw = w2s[0], syw = w2s[1];
      const cx2 = cv.getContext('2d');
      if (!cx2) return { err: 'no-2d-ctx ctxType=' + (cv.constructor && cv.constructor.name) };
      const x0 = Math.max(0, Math.round(sxw * dpr) - half), y0 = Math.max(0, Math.round(syw * dpr) - half);
      const im = cx2.getImageData(x0, y0, half * 2, half * 2);
      if (!im || !im.data) return { err: 'no-imagedata' };
      let lit = 0, sum = 0;
      for (let i = 0; i < im.data.length; i += 4) {
        const lum = 0.2126 * im.data[i] + 0.7152 * im.data[i + 1] + 0.0722 * im.data[i + 2];
        if (lum > 60) lit++;
        sum += lum;
      }
      return { lit, avg: Math.round(sum / (im.data.length / 4)) };
    } catch (e) {
      return { err: String(e.message).slice(0, 60), at: String(e.stack || '').split('\n')[1]?.trim().slice(0, 80) };
    }
  }
  // 强制渲染 40 帧后采样泡域（柱中心 ±40px）
  for (let i = 0; i < 40; i++) { g.fixedUpdate(1 / 60); g.frame(performance.now()); }
  const towerNow = g.entities.enemies.find((e2) => e2.vanillaId === 507 && !e2.dead);
  if (!towerNow) { ck('(a0) 柱 507 在场', false, 'spawn-failed'); return R; }
  const sUp = sampleBox(towerNow.cx, towerNow.cy, 40);
  ck('(a) 盾在:泡域着色(lit>120)', (sUp.lit ?? 0) > 120, JSON.stringify(sUp));
  const sRim = sampleBox(towerNow.cx + 55, towerNow.cy, 12);
  ck('(a2) 泡沿环着色(lit>10)', (sRim.lit ?? 0) > 10, JSON.stringify(sRim));

  // (b) 盾清零 → 破盾波
  if (le) le.shield.nebula = 0;
  const seq = [];
  for (let i = 0; i < 60; i++) {
    g.fixedUpdate(1 / 60); g.frame(performance.now());
    if (i % 12 === 0) {
      const t2 = towerNow.dead ? null : towerNow;
      if (t2) seq.push({ i, ...sampleBox(t2.cx, t2.cy, 40) });
    }
  }
  R.dbg.breakSeq = seq;
  const anyBreak = seq.some((s2) => (s2.lit ?? 0) > 40);
  ck('(b) 破盾波可见(过渡窗内 lit>40)', anyBreak, JSON.stringify(seq));
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
const bad = out.checks.filter((c) => !c.ok);
console.log(`\n== FF PROBE: ${out.checks.length - bad.length}/${out.checks.length} passed ==`);
process.exit(bad.length ? 1 : 0);
