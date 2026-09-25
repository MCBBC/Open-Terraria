// ★同族普查:敌怪/NPC 完全浸没在 shim 开/关下的可见性（filter 水下染色族 9499/9536 同病验证）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = process.env.SW_OUT ?? '/tmp/swimmer-probe3';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR=' + String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE=' + m.text().slice(0, 300)); });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { } });
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.world && g.player && g.renderer; }, { timeout: 300000, polling: 1500 });
await new Promise(r => setTimeout(r, 2500));

const pool = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const T = 16;
  const px = Math.floor((g.player.x + g.player.w / 2) / T);
  let surf = -1;
  for (let y = 10; y < 500; y++) { const i = st.idx(px, y); if ((st.flags[i] & 1) && st.type[i]) { surf = y; break; } }
  for (let x = px - 4; x <= px + 4; x++) for (let y = surf; y < surf + 12; y++) {
    const i = st.idx(x, y);
    st.flags[i] = 0; st.type[i] = 0; st.half[i] = 0; st.slope[i] = 0;
    st.liquid[i] = 255; st.liquidType[i] = 1;
  }
  // 玩家站坑边（让位）,抓一只敌怪按进池里
  g.player.x = (px + 6.5) * T - g.player.w / 2; g.player.y = (surf - 4) * T; g.player.vy = 0;
  const all = g.entities.all();
  const foe = all.find((e) => e && e !== g.player && !e.dead && (e.h ?? 0) >= 40) ?? null;
  let moved = null;
  if (foe) {
    foe.__dunked = true;
    foe.x = (px + 0.5) * T - (foe.w ?? 20) / 2;
    foe.y = (surf + 1) * T + 40 - (foe.h ?? 42);
    foe.vx = 0; foe.vy = 0;
    moved = { kind: foe.constructor?.name, x: foe.x, y: foe.y, w: foe.w, h: foe.h, wet: foe.wet, hp: foe.hp };
  }
  window.__poolPx = px; window.__poolTop = surf;
  return { surf, px, n: all.length, moved };
});
console.log('POOL=' + JSON.stringify(pool));
await new Promise(r => setTimeout(r, 1500));

// 逐帧钉位强制浸没（TownNPC AI 会走离水面）
const pin = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__swGame;
  const foe = g.entities.all().find((e) => e && e.__dunked);
  if (!foe) { resolve({ err: 'no foe' }); return; }
  const st = g.world.store;
  const T = 16;
  let frames = 0, wetSeen = false;
  const iv = setInterval(() => {
    frames++;
    foe.x = (window.__poolPx + 0.5) * T - foe.w / 2;
    foe.y = (window.__poolTop + 2) * T;
    foe.vx = 0; foe.vy = 0;
    const idx = st.idx(Math.floor(foe.x / T), Math.floor((foe.y + foe.h / 2) / T));
    if (st.liquid[idx] > 100 && st.liquidType[idx] === 1) wetSeen = true;
    if (frames > 90) { clearInterval(iv); resolve({ frames, wetSeen, wet: foe.wet }); }
  }, 16);
}));
console.log('PIN=' + JSON.stringify(pin));

const clip = await page.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera;
  const cv = document.querySelector('canvas');
  const r = cv.getBoundingClientRect();
  const all = g.entities.all();
  const foe = all.find((e) => e && e.__dunked) ?? null;
  const tx = foe ? foe.x + foe.w / 2 : g.player.cx, ty = foe ? foe.y + foe.h / 2 : g.player.cy;
  const [sx, sy] = cam.worldToScreen(tx, ty);
  return {
    x: r.left + sx - 80, y: r.top + sy - 96, width: 160, height: 192,
    foeWet: foe ? { wet: foe.wet, head: foe.headUnderwater ?? null } : null,
    dbg: { sx: Math.round(sx), sy: Math.round(sy), cam: { x: Math.round(cam.x), y: Math.round(cam.y), zoom: cam.zoom }, player: { x: Math.round(g.player.x), y: Math.round(g.player.y) }, docHidden: document.hidden },
  };
});
console.log('FOE=' + JSON.stringify(clip.foeWet) + ' DBG=' + JSON.stringify(clip.dbg));
await page.screenshot({ path: OUT + '/NPC-shim.png', clip });
await page.evaluate(() => { window.__swGame.renderer.constructor.bglShimSetForTest(false); });
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: OUT + '/NPC-2d.png', clip });
console.log('DONE → ' + OUT);
await browser.close();
