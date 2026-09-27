// ★BJ368 宝石法珠拖尾条复现——item 739(翡翠法珠→bolt 121) SM2 strip trail
//  扫条带矩形底(白/亮长直线) + 截图;shim 链 + GL trail pass
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
  await new Promise((r) => setTimeout(r, 400));
  await g.newWorld('bj368gem', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  g.world.clock.timeOfDay = 0.5;   // 白天(用户 img2=白天雪原)
  const c0 = Math.trunc(p.x / 16);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  if (groundY > 0) { p.x = c0 * 16; p.y = groundY * 16 - p.h; }
  p.vx = 0; p.vy = 0;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  const key739 = Object.keys(items).find((k) => /^vi_739_/.test(k));
  if (!key739) return { fail: 'item-739-missing', keys: Object.keys(items).slice(0, 20) };
  p.statMana = p.statManaMax2 = 200; p.statManaMax = 200;
  p.inv.slots[0] = { id: items[key739], stack: 999 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 400));

  const canvas = g.renderer.canvas;
  const scale = canvas.width / canvas.getBoundingClientRect().width;
  const work = document.createElement('canvas');
  work.width = canvas.width; work.height = canvas.height;
  const wctx = work.getContext('2d', { willReadFrequently: true });

  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  };

  // 连发 60 拍×3 轮;逐帧扫全屏长直线(条带矩形底)
  const samples = [];
  const shots = [];
  let frame = 0;
  const t0 = performance.now();
  while (frame < 540 && performance.now() - t0 < 540 * 20) {
    await new Promise((r) => requestAnimationFrame(r));
    frame++;
    const cyc = frame % 70;
    if (cyc === 1) { aim(p.cx + (Math.random() * 500 - 250), p.cy - 80 - Math.random() * 120); g.input.mouseDown = true; }
    if (cyc === 40) g.input.mouseDown = false;
    if (frame % 3 === 0) {
      const head = g.entities.projectiles.find((q) => q.gemTrail?.length >= 4);
      if (!head) { samples.push({ frame, skip: true }); continue; }
      wctx.drawImage(canvas, 0, 0);
      const d = wctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let maxRowRun = 0, maxColRun = 0, maxAt = null;
      for (let yy = 0; yy < canvas.height; yy += 2) {
        let run = 0, best = 0, bx = 0;
        for (let xx = 0; xx < canvas.width; xx++) {
          const i = (yy * canvas.width + xx) * 4;
          const r = d[i], gg = d[i + 1], b = d[i + 2];
          const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
          if (mx - mn < 30 && mn > 150) { run++; if (run > best) { best = run; bx = xx - run; } }
          else { if (run > best) { best = run; bx = xx - run; } run = 0; }
        }
        if (run > best) best = run;
        if (best > maxRowRun) { maxRowRun = best; maxAt = { y: yy, x: bx }; }
      }
      for (let xx = 0; xx < canvas.width; xx += 2) {
        let run = 0, best = 0;
        for (let yy = 0; yy < canvas.height; yy++) {
          const i = (yy * canvas.width + xx) * 4;
          const r = d[i], gg = d[i + 1], b = d[i + 2];
          const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
          if (mx - mn < 30 && mn > 150) run++; else { if (run > best) best = run; run = 0; }
        }
        if (run > best) best = run;
        if (best > maxColRun) maxColRun = best;
      }
      // bolt 盒内白底统计
      let base = 0;
      if (head) {
        const [hxs, hys] = g.camera.worldToScreen(head.x, head.y);
        const hb = { x: Math.max(0, Math.round(hxs * scale) - 90), y: Math.max(0, Math.round(hys * scale) - 90) };
        for (let yy = 0; yy < 180; yy++) for (let xx = 0; xx < 180; xx++) {
          const i = ((hb.y + yy) * canvas.width + (hb.x + xx)) * 4;
          const r = d[i], gg = d[i + 1], b = d[i + 2];
          const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
          if (mx - mn < 40 && mn > 165 && mn < 250) base++;
        }
      }
      samples.push({ frame, maxRowRun, maxColRun, base });
      if (frame === 210 || frame === 420) {
        const sc = document.createElement('canvas'); sc.width = canvas.width; sc.height = canvas.height;
        sc.getContext('2d').drawImage(canvas, 0, 0);
        shots.push({ frame, dataURL: sc.toDataURL('image/png'), maxRowRun, maxColRun });
      }
      if (maxRowRun > 300 || maxColRun > 240) {
        const sc = document.createElement('canvas'); sc.width = canvas.width; sc.height = canvas.height;
        sc.getContext('2d').drawImage(canvas, 0, 0);
        shots.push({ frame, dataURL: sc.toDataURL('image/png'), maxRowRun, maxColRun });
      }
    }
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  O.projs = g.entities.projectiles.filter((q) => q && !q.dead).slice(0, 8).map((q) => ({ id: q.projId ?? q.id, cls: q.constructor?.name, trail: q.gemTrail?.length ?? q.stripTrailPts?.length ?? 0 }));
  O.itemKey = key739;
  O.itemDef = (() => { try { const d = p.inv.slots[0]; return d ? { id: d.id } : null; } catch (e) { return String(e); } })();
  O.frames = frame;
  const valid = samples.filter((s) => !s.skip);
  O.validSamples = valid.length;
  O.maxRowRun = Math.max(...valid.map((s) => s.maxRowRun));
  O.maxColRun = Math.max(...valid.map((s) => s.maxColRun));
  O.maxBase = Math.max(...valid.map((s) => s.base ?? 0));
  O.hits = samples.filter((s) => s.maxRowRun > 300 || s.maxColRun > 240).length;
  O.path = g.renderer.bglPathUsed;
  O.shots = shots.slice(0, 6);
  return O;
});

if (out && out.shots && out.shots.length) {
  const fs = await import('node:fs');
  for (const s of out.shots) fs.writeFileSync(`/tmp/bj368-gem-f${s.frame}.png`, Buffer.from(s.dataURL.split(',')[1], 'base64'));
}
const { shots, ...slim } = out ?? {};
console.log('BJ368_GEM=' + JSON.stringify(slim, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors.slice(0, 8)));
await browser.close();
