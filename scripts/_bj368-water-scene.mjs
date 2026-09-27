// ★BJ368 场景化复现——水中/洞穴/命中/缩放四场景扫描 404 球渲染
//  每场景跑 N 帧,对球邻域做白块/亮块/teal 统计+落图;shim 链缺省
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
  const O = { env: {}, scenes: {} };
  const { options } = await import('/src/core/Options.ts');
  if ((g.renderer.usingCpu ?? false) || options.data.renderMode === 'cpu') {
    options.set('renderMode', 'gpu');
    await new Promise((r) => setTimeout(r, 500));
  }
  await g.newWorld('bj368sc', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  if (!key2611) return { fail: 'item-key-2611-missing' };
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 400));

  const canvas = g.renderer.canvas;
  const scale = canvas.width / canvas.getBoundingClientRect().width;

  const canvas2 = document.createElement('canvas');
  canvas2.width = canvas.width; canvas2.height = canvas.height;
  const c2 = canvas2.getContext('2d', { willReadFrequently: true });

  const shotAround = (wx, wy, half = 90) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    const bx = Math.round(sx * scale) - half, by = Math.round(sy * scale) - half;
    c2.drawImage(canvas, 0, 0);
    const w = half * 2, h = half * 2;
    const d = c2.getImageData(Math.max(0, bx), Math.max(0, by), w, h).data;
    let white = 0, paleBright = 0, teal = 0, neutral = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r >= 245 && gg >= 245 && b >= 245) white++;
      if (r >= 190 && gg >= 190 && b >= 190) paleBright++;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      if (mx - mn < 22 && mn > 130) neutral++;
      if (Math.abs(r - 48) < 80 && Math.abs(gg - 248) < 80 && Math.abs(b - 171) < 80) teal++;
    }
    return { white, paleBright, neutral, teal };
  };

  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  };
  const groundYAt = (col) => {
    for (let y = 20; y < st.h - 40; y++) if (st.isSolid(col, y)) return y;
    return -1;
  };

  // 找水域:沿岸扫描 liquid>0 的列
  let waterCol = -1, waterY = -1;
  outer: for (let x = 100; x < st.w - 100; x += 37) {
    for (let y = 20; y < st.h - 40; y += 3) {
      if (st.liquid[st.idx(x, y)] > 0) { waterCol = x; waterY = y; break outer; }
    }
  }
  O.env.waterCol = waterCol; O.env.waterY = waterY;

  const runScene = async (tag, placePlayer, nFrames = 360) => {
    placePlayer();
    await new Promise((r) => setTimeout(r, 200));
    const samples = [];
    const shots = [];
    g.input.mouseHeld = true;
    const t0 = performance.now();
    let frame = 0;
    while (frame < nFrames && performance.now() - t0 < nFrames * 18) {
      await new Promise((r) => requestAnimationFrame(r));
      frame++;
      const cyc = frame % 50;
      if (cyc === 1) { aim(p.cx + (Math.random() * 360 - 180), p.cy - 40 - Math.random() * 140); g.input.mouseDown = true; }
      if (cyc === 34) g.input.mouseDown = false;
      if (frame % 4 === 0) {
        const head = g.entities.projectiles.find((q) => q.projId === 404);
        const s = shotAround(head ? head.cx : p.cx, head ? head.cy : p.cy);
        samples.push(s);
        const worst = samples.reduce((a, b) => (b.paleBright > a.paleBright ? b : a));
        if (worst.paleBright > 900 && shots.length < 3) {
          c2.drawImage(canvas, 0, 0);
          const [sx, sy] = g.camera.worldToScreen(head ? head.cx : p.cx, head ? head.cy : p.cy);
          const bx = Math.max(0, Math.round(sx * scale) - 90), by = Math.max(0, Math.round(sy * scale) - 90);
          const sc3 = document.createElement('canvas'); sc3.width = 180; sc3.height = 180;
          sc3.getContext('2d').drawImage(canvas2, bx, by, 180, 180, 0, 0, 180, 180);
          shots.push({ frame, dataURL: sc3.toDataURL('image/png') });
        }
      }
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    const agg = {
      n: samples.length,
      maxWhite: Math.max(...samples.map((s) => s.white)),
      maxPale: Math.max(...samples.map((s) => s.paleBright)),
      maxNeutral: Math.max(...samples.map((s) => s.neutral)),
      maxTeal: Math.max(...samples.map((s) => s.teal)),
      paleFrames: samples.filter((s) => s.paleBright > 900).length,
      path: g.renderer.bglPathUsed,
    };
    O.scenes[tag] = { agg, _shots: shots };
  };

  // 场景1:地表白天
  await runScene('surface_day', () => {
    g.world.clock.timeOfDay = 0.5;
    const c0 = Math.trunc(p.x / 16);
    const gy = groundYAt(c0);
    if (gy > 0) { p.x = c0 * 16; p.y = gy * 16 - p.h; }
    p.vx = 0; p.vy = 0; p.statLife = p.statLifeMax ?? 100;
  }, 240);

  // 场景2:水中（若找到水域）
  if (waterCol > 0) {
    await runScene('water', () => {
      g.world.clock.timeOfDay = 0.0;
      p.x = waterCol * 16; p.y = (waterY - 6) * 16;
      p.vx = 0; p.vy = 0; p.statLife = p.statLifeMax ?? 100;
    }, 300);
  }

  // 场景3:洞穴（地下岩层,黑+火把光）
  await runScene('cave', () => {
    g.world.clock.timeOfDay = 0.5;
    const c0 = Math.trunc(p.x / 16);
    let caveY = -1;
    for (let y = (st.h / 2) | 0; y < st.h - 60; y++) {
      if (st.isSolid(c0, y) && !st.isSolid(c0, y - 3) && !st.isSolid(c0, y - 6)) { caveY = y - 4; break; }
    }
    if (caveY > 0) { p.x = c0 * 16; p.y = caveY * 16 - p.h; }
    p.vx = 0; p.vy = 0; p.statLife = p.statLifeMax ?? 100;
  }, 300);

  // 场景4:zoom 1.3 地表夜
  await runScene('zoom_night', () => {
    g.world.clock.timeOfDay = 0.02;
    g.camera.setZoom?.(1.3);
    const c0 = Math.trunc(p.x / 16);
    const gy = groundYAt(c0);
    if (gy > 0) { p.x = c0 * 16; p.y = gy * 16 - p.h; }
    p.vx = 0; p.vy = 0; p.statLife = p.statLifeMax ?? 100;
  }, 300);

  const slim = {};
  for (const [k, v] of Object.entries(O.scenes)) slim[k] = v.agg;
  slim._allShots = {};
  for (const [k, v] of Object.entries(O.scenes)) if (v._shots?.length) slim._allShots[k] = v._shots;
  slim.env = O.env;
  return slim;
});

if (out && out._allShots) {
  const fs = await import('node:fs');
  for (const [scene, shots] of Object.entries(out._allShots)) {
    for (const s of shots) fs.writeFileSync(`/tmp/bj368-sc-${scene}-f${s.frame}.png`, Buffer.from(s.dataURL.split(',')[1], 'base64'));
  }
}
const { _allShots, ...slim2 } = out ?? {};
console.log('BJ368_SC=' + JSON.stringify(slim2, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors.slice(0, 8)));
await browser.close();
