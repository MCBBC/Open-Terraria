// FX24d 一次性探针：紫色半透明重影定性——
//  直驱 ai0=1 攻击态+lai3=0 → 1.5s 内 3 连拍（500ms 间隔）：
//  重影若随时间/姿态变化=实时第二绘制;若完全静止=烤进某层(terrain chunk)的陈旧印
//  另：dump drawDeerclopsGrid 与 drawDeerclopsGlow 各自的 drawImage 全参数
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&fx24d=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
  }
});
await new Promise((r) => setTimeout(r, 800));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.evaluate(() => {
  const g = window.__swGame;
  const w = window.__fx24d = { grid: [], glow: [], cur: null, curGlow: null };
  const r = g.renderer;
  const origGrid = r.drawDeerclopsGrid.bind(r);
  r.drawDeerclopsGrid = function (e) {
    w.cur = { tag: 'grid', lai3: Math.round(e.lai3), ai0: e.ai0, frameIdx: e.vanillaGridFrameIdx, draws: [] };
    const proto = CanvasRenderingContext2D.prototype;
    const origDraw = proto.drawImage;
    const self = w;
    proto.drawImage = function (src, ...rest) {
      if (self.cur) self.cur.draws.push({ a: Math.round((this.globalAlpha ?? 1) * 1000) / 1000, sx: rest[0], sy: rest[1], sw: rest[2], sh: rest[3], dx: Math.round(rest[4]), dy: Math.round(rest[5]) });
      return origDraw.call(this, src, ...rest);
    };
    try { return origGrid(e); } finally { proto.drawImage = origDraw; w.grid.push(w.cur); w.cur = null; }
  };
  const origGlow = r.drawDeerclopsGlow.bind(r);
  r.drawDeerclopsGlow = function (e) {
    w.curGlow = { tag: 'glow', lai3: Math.round(e.lai3), draws: [] };
    const proto = CanvasRenderingContext2D.prototype;
    const origDraw = proto.drawImage;
    const self = w;
    proto.drawImage = function (src, ...rest) {
      if (self.curGlow) self.curGlow.draws.push({ a: Math.round((this.globalAlpha ?? 1) * 1000) / 1000, sx: rest[0], sy: rest[1], sw: rest[2], sh: rest[3], dx: Math.round(rest[4]), dy: Math.round(rest[5]) });
      return origDraw.call(this, src, ...rest);
    };
    try { return origGlow(e); } finally { proto.drawImage = origDraw; w.glow.push(w.curGlow); w.curGlow = null; }
  };
});

const summon668 = () => page.evaluate(() => {
  const g = window.__swGame;
  g.debugClearEnemies?.();
  g.summonPanel?.close();
  g.toggleSummonPanel();
  const q = document.querySelector('[data-role=q]');
  q.value = '668';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-role=list] > div').click();
  g.summonPanel?.close();
});
const healPlayer = () => page.evaluate(() => {
  const p = window.__swGame.player;
  p.dead = false; p.hp = p.maxHp ?? 500; p.iframes = 120;
  if ('statLife' in p) p.statLife = p.statLifeMax ?? 500;
});
const R = {};
await summon668();
await healPlayer();
await wait(600);
// 玩家贴近 + 直驱攻击态 + lai3=0
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  const p = g.player;
  p.x = e.x + e.w / 2 - p.w / 2 + 60;
  p.y = e.y + e.h - p.h - 2; p.vx = 0; p.vy = 0;
  e.ai0 = 1; e.ai1 = 0; e.vx = 0; e.lai3 = 0;
  if (g.scene) g.scene.zoneSnow = true;
  window.__fx24d.grid.length = 0; window.__fx24d.glow.length = 0;
});
for (let i = 0; i < 5; i++) { await healPlayer(); await wait(120); }
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  e.ai0 = 1; e.ai1 = 10; e.vx = 0; e.lai3 = 0;   // 钉在攻击中段（帧 13/14 姿态）
  window.__fx24d.grid.length = 0; window.__fx24d.glow.length = 0;
});
const camPos = await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  const cam = g.camera;
  const [sx, sy] = cam.worldToScreen(e.cx, e.cy);
  return { sx: Math.round(sx), sy: Math.round(sy), dpr: 1 };
});
for (let k = 0; k < 3; k++) {
  const clip = { x: Math.max(0, camPos.sx - 320), y: Math.max(0, camPos.sy - 300), width: 640, height: 600 };
  await page.screenshot({ path: `/tmp/fx24d-seq${k}.png`, clip });
  await wait(500);
}
R.gridSample = await page.evaluate(() => window.__fx24d.grid.slice(-4).map((r0) => ({ lai3: r0.lai3, ai0: r0.ai0, f: r0.frameIdx, d: r0.draws })));
R.glowSample = await page.evaluate(() => window.__fx24d.glow.slice(-4).map((r0) => ({ lai3: r0.lai3, d: r0.draws })));
// 像素差分：seq0 vs seq2 同区域差异数（重影若静止=差异少且只在背景;若随姿态变=重影是实时绘制）
R.pixdiff = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')];
  const cv = cs.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
  const c2 = document.createElement('canvas');
  c2.width = 320; c2.height = 300;
  const cx2 = c2.getContext('2d', { willReadFrequently: true });
  return { note: 'manual compare via screenshots', cvw: cv.width, cvh: cv.height };
});
console.log(JSON.stringify(R, null, 1));
if (errors.length) console.error('PAGEERRORS:', errors.slice(0, 5));
await browser.close();
