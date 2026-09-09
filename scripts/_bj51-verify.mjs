// SW-BJ51 验证探针 v2：修复后层序/几何/截图复核
//  E) Extra_245 vs NPC_668 像素指纹（防误提取=同图拷贝）
//  F) fog 预载后单次调用层日志：期望序 red×2 → body×1 → fog×2（ai0=0,lai3>0）
//     ai0=7: ghost×5 → body×1（重影在本体之下=修复后序）
//  G) 屏内三态截图（近距/远距红雾态/消散态）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&bj51v2=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

await page.evaluate(() => {
  const g = window.__swGame;
  const w = window.__bj51 = { special: 0, traceArm: false, tracing: false, trace: null, traceDone: null };
  const r = g.renderer;
  const origGrid = r.drawDeerclopsGrid.bind(r);
  r.drawDeerclopsGrid = function (e) {
    w.special++;
    if (w.traceArm) { w.traceArm = false; w.tracing = true; w.trace = []; }
    try { return origGrid(e); } finally {
      if (w.tracing) { w.tracing = false; w.traceDone = w.trace; w.trace = null; }
    }
  };
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  proto.drawImage = function (src, ...rest) {
    if (w.tracing) w.trace.push({ dx: Math.round(rest[4] ?? -9), dy: Math.round(rest[5] ?? -9), a: Math.round((this.globalAlpha ?? 1) * 100) / 100, sx: rest[0] ?? -1, sy: rest[1] ?? -1, sw: rest[2] ?? -1, sh: rest[3] ?? -1 });
    return origDraw.call(this, src, ...rest);
  };
});

const summon668 = () => page.evaluate(() => {
  const g = window.__swGame;
  g.debugClearEnemies();
  g.summonPanel?.close();
  g.toggleSummonPanel();
  const q = document.querySelector('[data-role=q]');
  q.value = '668';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  const row = document.querySelector('[data-role=list] > div');
  if (!row) return { err: 'no row' };
  row.click();
  g.summonPanel?.close();
  return {};
});
const healPlayer = () => page.evaluate(() => {
  const p = window.__swGame.player;
  if (!p) return;
  p.dead = false; p.hp = p.maxHp ?? 500; p.iframes = 120;
  if ('statLife' in p) p.statLife = p.statLifeMax ?? 500;
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const armTrace = async (ms) => {
  await page.evaluate(() => { window.__bj51.traceArm = true; });
  await wait(ms);
  return page.evaluate(() => window.__bj51.traceDone);
};
const cvMeta = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  return { w: c.width, h: c.height, dpr: c.width / r.width, left: r.left + window.scrollX, top: r.top + window.scrollY };
});
const bossScreen = () => page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  if (!e) return null;
  const [sx, sy] = g.camera.worldToScreen(e.cx, e.cy);
  return { x: Math.round(sx), y: Math.round(sy) };
});
const shot = async (name, _cx, _cy) => {
  const h = await page.evaluateHandle(() => window.__swGame.renderer.canvas);
  const el = h.asElement();
  await el.screenshot({ path: `/tmp/bj51v2-${name}.png` });
};

const R = {};
// 关欢迎浮层（挡视野）
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes('我已知晓'));
  b?.click();
});
await summon668();
await healPlayer();
await wait(300);
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  g.player.x = e.x - 220; g.player.y = e.y + e.h - 60; g.player.vx = 0; g.player.vy = 0;
});
for (let i = 0; i < 3; i++) { await healPlayer(); await wait(400); }
for (let i = 0; i < 3; i++) { await healPlayer(); await wait(500); }
const sA = await bossScreen();
console.error('A screen:', JSON.stringify(sA));
await shot('A-close', sA.x, sA.y);

// ---- E: Extra_245 指纹 ----
R.fingerprint = await page.evaluate(async () => {
  const g = window.__swGame;
  const a = g.renderer.atlas;
  const fog = await a.ensureVImage('vanilla/Extra_245.png');
  const npc = await a.ensureVImage('vanilla/NPC_668.png');
  if (!fog || !npc) return { err: 'img missing', fog: !!fog, npc: !!npc };
  const W = 1090, H = 1200;
  const mk = (img) => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    return cx.getImageData(0, 0, W, H).data;
  };
  const A = mk(fog), B = mk(npc);
  let same = 0, diff = 0, fogOpaque = 0;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let i = 0; i < A.length; i += 16) {   // 每 4 像素抽样
    const aA = A[i + 3], aB = B[i + 3];
    if (aA > 0) {
      fogOpaque++;
      const px = (i / 4) % W, py = Math.floor(i / 4 / W);
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
      const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
      if (aA > 8 && aB > 8 && d < 6) same++; else diff++;
    }
  }
  return { fogDims: [fog.width, fog.height], sampledOpaque: fogOpaque, sameVsNpc: same, diffVsNpc: diff, bbox: [minX, minY, maxX, maxY] };
});

// ---- F: fog 预载后层日志（ai0=0, lai3=25 注入）----
R.traceFog = await (async () => {
  await page.evaluate(async () => {
    const g = window.__swGame;
    await g.renderer.atlas.ensureVImage('vanilla/Extra_245.png');
    const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
    g.player.x = e.x - 200; g.player.y = e.y + e.h - 60;
    e.lai3 = 25; e.ai0 = 0;
  });
  await wait(80);
  return armTrace(400);
})();

// ---- F2: ai0=7 层日志（重影应在 body 之前）----
R.traceDissolve = await (async () => {
  await page.evaluate(() => {
    const g = window.__swGame;
    const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
    e.ai0 = 7; e.ai1 = 30; e.lai1 = 0; e.lai3 = 0;
  });
  await wait(60);
  return armTrace(400);
})();

// ---- G: 远距红雾态 + 消散态屏内截图（boss 挪到玩家旁=屏幕中心）----
const centerShot = async (name, mutate) => {
  await page.evaluate((fn) => {
    const g = window.__swGame;
    const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
    e.x = g.player.x - 160; e.y = g.player.y + g.player.h - e.h; e.vx = 0; e.vy = 0;
    g.player.vx = 0; g.player.vy = 0; g.player.dead = false; g.player.hp = g.player.maxHp ?? 500;
    eval(fn);
  }, mutate);
  await wait(60);
  const h = await page.evaluateHandle(() => window.__swGame.renderer.canvas);
  const el = h.asElement();
  await el.screenshot({ path: `/tmp/bj51v2-${name}-full.png` });
};
await centerShot('B-far-fog', 'e.lai3 = 28; e.ai0 = 0; e.ai1 = 0;');
await centerShot('C-dissolve', 'e.ai0 = 7; e.ai1 = 32; e.lai1 = 0; e.lai3 = 0;');

console.log(JSON.stringify(R, null, 1));
if (errors.length) console.error('PAGEERRORS:', errors.slice(0, 5));
await browser.close();
