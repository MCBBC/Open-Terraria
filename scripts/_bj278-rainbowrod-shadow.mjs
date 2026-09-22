// BJ278 实报探针 v3：彩虹魔杖(79) 引导期光芒黑影取证。
// v3 修正：清无关实体（堕星=掉落桶）/相机随玩家稳定不手钉/console 捕获/glfx 双路读回/
//         hover+cruise 双相位/差分世界区与小地图区分账。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TAG = process.env.TAG ?? 'gl';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
page.on('console', (m) => {
  const t = m.type();
  if (t === 'warning' || t === 'error') console.log(`CONSOLE-${t}:`, String(m.text()).slice(0, 300));
});

const url = TAG === 'cpu' ? `${ORIGIN}/?trailgl=0&traildbg` : `${ORIGIN}/?traildbg`;
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ278探针');
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
  await page.keyboard.type('bj278probe');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// 走廊清空+落稳+冻结；清无关实体（堕星/敌怪/小动物）；弹出生点记录
const prep = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 44;
  for (let dx = -420; dx <= 420; dx++) {
    for (let dy = -36; dy <= 2; dy++) st.setTile(px0 + dx, gy + dy, 0);
    st.setTile(px0 + dx, gy + 3, 2);
  }
  g.player.x = px0 * 16; g.player.y = (gy - 2) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.entities.drops.length = 0;
  g.entities.enemies.length = 0;
  g.entities.critters.length = 0;
  g.entities.projectiles.length = 0;
  g.world.clock.timeOfDay = 0.5;   // 正午（亮场景,压暗才可见）
  g.paused = false;
  for (let k = 0; k < 30; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  window.__bj278 = { stripCalls: 0, readbacks: [] };
  // hook：trailStripMM 后双路读回（readPixels + drawImage）——解"GL 画布空"矛盾
  const gx = g.renderer?.glfx;
  if (gx && gx.trailStripMM) {
    const orig = gx.trailStripMM.bind(gx);
    gx.trailStripMM = function (t0, t1, t2, verts, idx) {
      orig(t0, t1, t2, verts, idx);
      try {
        if (window.__bj278.stripCalls < 1) {
          // 顶点带 bbox（世界 px）→ 画布像素位
          const v = verts;
          let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          for (let i = 0; i < v.length; i += 9) {
            x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]);
            y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1]);
          }
          const cam = { x: g.renderer.glCamX, y: g.renderer.glCamY, z: g.renderer.glZoom ?? 1, w: gx.canvas.width, h: gx.canvas.height };
          const sx = (wx) => Math.round((wx - cam.x) * cam.z + cam.w / 2);
          const sy = (wy) => Math.round((wy - cam.y) * cam.z + cam.h / 2);
          const px = Math.max(0, Math.min(cam.w - 1, sx((x0 + x1) / 2)));
          const py = Math.max(0, Math.min(cam.h - 1, sy((y0 + y1) / 2)));
          // readPixels 直读（GL y 翻转）
          const rp = gx.readPixel(px, cam.h - 1 - py);
          // drawImage 读回（3×3 均值）
          const sc = document.createElement('canvas');
          sc.width = 3; sc.height = 3;
          const c2 = sc.getContext('2d', { willReadFrequently: true });
          c2.drawImage(gx.canvas, px - 1, cam.h - 1 - py - 1, 3, 3, 0, 0, 3, 3);
          const d = c2.getImageData(0, 0, 3, 3).data;
          const avg = [0, 0, 0, 0];
          for (let i = 0; i < d.length; i += 4) { avg[0] += d[i]; avg[1] += d[i + 1]; avg[2] += d[i + 2]; avg[3] += d[i + 3]; }
          window.__bj278.readbacks.push({
            worldBBox: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)],
            canvasPx: [px, py], readPixels: rp ? [...rp] : null,
            drawImageAvg: avg.map((a) => Math.round(a / 9)),
          });
        }
      } catch (e) { window.__bj278.readbacks.push({ err: String(e).slice(0, 120) }); }
      window.__bj278.stripCalls++;
    };
  }
  return { px0, gy, pcy: Math.round(g.player.cy), hooked: !!gx?.trailStripMM, spawn: [g.player.cx + 30, g.player.cy - 60] };
});
console.log('prep', JSON.stringify(prep));

// ---------- 基线（无弹） ----------
await new Promise((r) => setTimeout(r, 900));   // 相机收敛
await page.screenshot({ path: `/tmp/bj278-${TAG}-base.png` });
const baseStored = await page.evaluate(() => {
  const cvs = [...document.querySelectorAll('#game-root canvas')].filter((c) => c.width >= 1280 && c.height >= 800);
  window.__bj278Base = {};
  cvs.forEach((cv, ci) => {
    const sc = document.createElement('canvas');
    sc.width = cv.width; sc.height = cv.height;
    const c2 = sc.getContext('2d', { willReadFrequently: true });
    c2.drawImage(cv, 0, 0);
    window.__bj278Base[`c${ci}`] = c2.getImageData(0, 0, sc.width, sc.height).data.slice();
  });
  return { stored: Object.keys(window.__bj278Base), cam: [Math.round(window.__swGame.camera.x), Math.round(window.__swGame.camera.y)] };
});
console.log('base-stored', JSON.stringify(baseStored));

// ---------- hover 悬停引导相 ----------
const hover = await page.evaluate(async () => {
  const g = window.__swGame;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const cx0 = g.player.cx + 30, cy0 = g.player.cy - 60;
  const m = new MagicMissileProj(cx0, cy0, 0.01, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => true,
    aimCb: () => ({ x: m0.cx, y: m0.cy }),
    payMana: () => true,
  });
  const m0 = m;
  m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
  g.entities.add(m, 'projectiles');
  g.paused = false;
  for (let k = 0; k < 40; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => setTimeout(r, 700));
  g.paused = false;
  for (let k = 0; k < 2; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  const z = g.renderer?.zoom ?? g.camera?.zoom ?? 1.25;
  return { x: Math.round(m.cx), y: Math.round(m.cy), dead: m.dead, strip: m.strip.length,
    cam: [Math.round(g.camera.x), Math.round(g.camera.y)], zoom: z };
});
console.log('hover', JSON.stringify(hover));
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `/tmp/bj278-${TAG}-hover.png` });
const hoverDiff = await page.evaluate(() => {
  const cvs = [...document.querySelectorAll('#game-root canvas')].filter((c) => c.width >= 1280 && c.height >= 800);
  const out = [];
  cvs.forEach((cv, ci) => {
    const base = window.__bj278Base?.[`c${ci}`];
    if (!base) return;
    const sc = document.createElement('canvas');
    sc.width = cv.width; sc.height = cv.height;
    const c2 = sc.getContext('2d', { willReadFrequently: true });
    c2.drawImage(cv, 0, 0);
    const now = c2.getImageData(0, 0, sc.width, sc.height).data;
    let negW = 0, negBigW = 0, wMinX = 1e9, wMinY = 1e9, wMaxX = -1, wMaxY = -1, worstW = 0, worstPxW = null;
    let negUI = 0, negBigUI = 0;
    for (let y = 0; y < sc.height; y++) {
      for (let x = 0; x < sc.width; x++) {
        const i = (y * sc.width + x) * 4;
        const dr = Math.max(base[i] - now[i], base[i + 1] - now[i + 1], base[i + 2] - now[i + 2]);
        if (dr > 2) {
          const inUI = x > 980 && y < 340;   // 小地图区（右上）
          if (inUI) { negUI++; if (dr > 30) negBigUI++; continue; }
          negW++;
          if (dr > 30) {
            negBigW++;
            if (x < wMinX) wMinX = x; if (y < wMinY) wMinY = y;
            if (x > wMaxX) wMaxX = x; if (y > wMaxY) wMaxY = y;
            if (dr > worstW) { worstW = dr; worstPxW = { x, y, base: [base[i], base[i + 1], base[i + 2]], now: [now[i], now[i + 1], now[i + 2]] }; }
          }
        }
      }
    }
    out.push({ canvas: `c${ci}`, negWorld: negW, negBigWorld: negBigW, worldBBox: negBigW ? [wMinX, wMinY, wMaxX, wMaxY] : null, worstWorld: worstW, worstPxWorld: worstPxW, negUI, negBigUI });
  });
  return out;
});
console.log('hover-diff', JSON.stringify(hoverDiff));
console.log('hooks', JSON.stringify(await page.evaluate(() => ({
  stripCalls: window.__bj278.stripCalls, readbacks: window.__bj278.readbacks,
  traildbg: window.__swGame?.renderer?.__trailDbg ?? null,
}))));

// ---------- orbit 绕圈相（彩虹带全展,同基线相机） ----------
const orbit = await page.evaluate(async () => {
  const g = window.__swGame;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const cx0 = g.player.cx + 60, cy0 = g.player.cy - 110;
  let t = 0;
  const m = new MagicMissileProj(cx0, cy0, 0.01, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => true,
    aimCb: () => ({ x: cx0 + Math.cos(t * 0.09) * 120, y: cy0 + Math.sin(t * 0.09) * 70 }),
    payMana: () => true,
  });
  m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
  g.entities.add(m, 'projectiles');
  g.paused = false;
  for (t = 0; t < 90; t++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => setTimeout(r, 700));
  g.paused = false;
  for (let k = 0; k < 2; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  return { x: Math.round(m.cx), y: Math.round(m.cy), dead: m.dead, strip: m.strip.length };
});
console.log('orbit', JSON.stringify(orbit));
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `/tmp/bj278-${TAG}-orbit.png` });
const orbitDiff = await page.evaluate(() => {
  const cvs = [...document.querySelectorAll('#game-root canvas')].filter((c) => c.width >= 1280 && c.height >= 800);
  const out = [];
  cvs.forEach((cv, ci) => {
    const base = window.__bj278Base?.[`c${ci}`];
    if (!base) return;
    const sc = document.createElement('canvas');
    sc.width = cv.width; sc.height = cv.height;
    const c2 = sc.getContext('2d', { willReadFrequently: true });
    c2.drawImage(cv, 0, 0);
    const now = c2.getImageData(0, 0, sc.width, sc.height).data;
    let negW = 0, negBigW = 0, wMinX = 1e9, wMinY = 1e9, wMaxX = -1, wMaxY = -1, worstW = 0, worstPxW = null;
    for (let y = 0; y < sc.height; y++) {
      for (let x = 0; x < sc.width; x++) {
        if (x > 980 && y < 340) continue;
        const i = (y * sc.width + x) * 4;
        const dr = Math.max(base[i] - now[i], base[i + 1] - now[i + 1], base[i + 2] - now[i + 2]);
        if (dr > 2) {
          negW++;
          if (dr > 30) {
            negBigW++;
            if (x < wMinX) wMinX = x; if (y < wMinY) wMinY = y;
            if (x > wMaxX) wMaxX = x; if (y > wMaxY) wMaxY = y;
            if (dr > worstW) { worstW = dr; worstPxW = { x, y, base: [base[i], base[i + 1], base[i + 2]], now: [now[i], now[i + 1], now[i + 2]] }; }
          }
        }
      }
    }
    out.push({ canvas: `c${ci}`, negWorld: negW, negBigWorld: negBigW, worldBBox: negBigW ? [wMinX, wMinY, wMaxX, wMaxY] : null, worstWorld: worstW, worstPxWorld: worstPxW });
  });
  return out;
});
console.log('orbit-diff', JSON.stringify(orbitDiff));

// ---------- cruise 巡航相（带全展,水平直飞） ----------
const cruise = await page.evaluate(async () => {
  const g = window.__swGame;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const y0 = g.player.cy - 56;
  const m = new MagicMissileProj(g.player.cx - 160, y0, 20, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => false, aimCb: () => ({ x: g.player.cx + 8000, y: y0 }),
    payMana: () => true,
  });
  m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
  g.entities.add(m, 'projectiles');
  g.paused = false;
  for (let k = 0; k < 40; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => setTimeout(r, 700));
  g.paused = false;
  for (let k = 0; k < 2; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  return { x: Math.round(m.cx), y: Math.round(m.cy), dead: m.dead, strip: m.strip.length };
});
console.log('cruise', JSON.stringify(cruise));
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `/tmp/bj278-${TAG}-cruise.png` });

console.log(`shots: /tmp/bj278-${TAG}-base.png /tmp/bj278-${TAG}-hover.png /tmp/bj278-${TAG}-cruise.png`);
await browser.close();
process.exit(0);
