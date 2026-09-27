// ★BJ368 水面扭曲带复现——球入水(q=3 projDistort)+波场激活,逐帧扫球盒矩形异常
//  用户截图共性:img1=雨,img2=水池,球近水 → 扭曲带=球周矩形
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=metal'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5202', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  const O = { env: {} };
  const { options } = await import('/src/core/Options.ts');
  options.set('renderMode', 'gpu');
  options.set('waveQuality', 3);
  await new Promise((r) => setTimeout(r, 400));
  await g.newWorld('bj368ww', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  g.world.clock.timeOfDay = 0.5;
  // 找水池:液面列
  let waterCol = -1, waterTop = -1, waterDepth = 0;
  outer: for (let x = 200; x < st.w - 200; x += 23) {
    for (let y = 30; y < st.h - 60; y += 2) {
      if (st.liquid[st.idx(x, y)] > 0.5) {
        // 检查深度≥4格
        let d = 0;
        for (let yy = y; yy < st.h - 20 && st.liquid[st.idx(x, yy)] > 0.5; yy++) d++;
        if (d >= 4) { waterCol = x; waterTop = y; waterDepth = d; break outer; }
      }
    }
  }
  O.env.water = { col: waterCol, top: waterTop, depth: waterDepth };
  if (waterCol < 0) return { fail: 'no-water' };
  // 玩家站水池边
  p.x = waterCol * 16 - 40; p.y = (waterTop - 4) * 16;
  p.vx = 0; p.vy = 0;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  if (!key2611) return { fail: 'item-key-2611-missing' };
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 500));

  const canvas = g.renderer.canvas;
  const scale = canvas.width / canvas.getBoundingClientRect().width;
  const work = document.createElement('canvas');
  work.width = canvas.width; work.height = canvas.height;
  const wctx = work.getContext('2d', { willReadFrequently: true });

  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  };

  // 出球,瞄准水面下,反复;逐帧扫球盒 + 水面带
  const samples = [];
  const shots = [];
  g.input.mouseHeld = true;
  const t0 = performance.now();
  let frame = 0;
  while (frame < 400 && performance.now() - t0 < 400 * 22) {
    await new Promise((r) => requestAnimationFrame(r));
    frame++;
    const cyc = frame % 40;
    if (cyc === 1) { aim(waterCol * 16 + (Math.random() * 200 - 100), (waterTop + 3 + Math.random() * 4) * 16); g.input.mouseDown = true; }
    if (cyc === 26) g.input.mouseDown = false;
    if (frame % 2 === 0) {
      const head = g.entities.projectiles.find((q) => q.projId === 404 && !q.dead);
      const [sx, sy] = g.camera.worldToScreen(head ? head.x : p.x, head ? head.y : p.y);
      const bx = Math.max(0, Math.round(sx * scale) - 100), by = Math.max(0, Math.round(sy * scale) - 100);
      wctx.drawImage(canvas, 0, 0);
      const d = wctx.getImageData(bx, by, 200, 200).data;
      // 矩形异常检测:行/列长直线(>70% 宽的近白行/列 = 矩形边)
      let maxRowRun = 0, maxColRun = 0;
      for (let yy = 0; yy < 200; yy++) {
        let run = 0, best = 0;
        for (let xx = 0; xx < 200; xx++) {
          const i = (yy * 200 + xx) * 4;
          const r = d[i], gg = d[i + 1], b = d[i + 2];
          const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
          if (mx - mn < 35 && mn > 165) run++; else { if (run > best) best = run; run = 0; }
        }
        if (run > best) best = run;
        if (best > maxRowRun) maxRowRun = best;
      }
      for (let xx = 0; xx < 200; xx++) {
        let run = 0, best = 0;
        for (let yy = 0; yy < 200; yy++) {
          const i = (yy * 200 + xx) * 4;
          const r = d[i], gg = d[i + 1], b = d[i + 2];
          const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
          if (mx - mn < 35 && mn > 165) run++; else { if (run > best) best = run; run = 0; }
        }
        if (run > best) best = run;
        if (best > maxColRun) maxColRun = best;
      }
      samples.push({ frame, maxRowRun, maxColRun, path: g.renderer.bglPathUsed });
      if (maxRowRun > 140 || maxColRun > 140) {
        const sc = document.createElement('canvas'); sc.width = 200; sc.height = 200;
        sc.getContext('2d').drawImage(canvas, bx, by, 200, 200, 0, 0, 200, 200);
        shots.push({ frame, dataURL: sc.toDataURL('image/png'), maxRowRun, maxColRun });
      }
    }
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  O.frames = frame;
  O.maxRowRun = Math.max(...samples.map((s) => s.maxRowRun));
  O.maxColRun = Math.max(...samples.map((s) => s.maxColRun));
  O.hits = samples.filter((s) => s.maxRowRun > 140 || s.maxColRun > 140).length;
  O.shots = shots.slice(0, 5);
  O.path = g.renderer.bglPathUsed;
  return O;
});

if (out && out.shots && out.shots.length) {
  const fs = await import('node:fs');
  for (const s of out.shots) fs.writeFileSync(`/tmp/bj368-ww-f${s.frame}.png`, Buffer.from(s.dataURL.split(',')[1], 'base64'));
}
const { shots, ...slim } = out ?? {};
console.log('BJ368_WW=' + JSON.stringify(slim, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors.slice(0, 8)));
await browser.close();
