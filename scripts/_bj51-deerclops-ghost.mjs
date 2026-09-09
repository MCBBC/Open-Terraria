// SW-BJ51 一次性探针：鹿角怪(668)贴图"重影"取证
//  A) 近距战斗态：drawDeerclopsGrid 每帧调用数 + 层数（期待=1 次调用、lai3=0 时仅 1 层本体）
//  B) 远距(lai3 爬升)：追踪期采样抓 lai3>0 窗口 + lai3 注入单次调用层日志
//     （原版本相=本体淡出+2 红余像+Extra_245 红雾,Main.cs:26735-26253）
//  C) ai0=7 消散：5 紫余像（:26764-26787）
//  D) 贴图帧切片 bleed：NPC_668 5×5 每格 2px padding 环应全透明
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&bj51=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

// ---- 插桩：累计计数 + 单次 drawDeerclopsGrid 调用的 drawImage 层日志（捕获臂）----
await page.evaluate(() => {
  const g = window.__swGame;
  const w = window.__bj51 = { special: 0, layers: 0, generic: 0, traceArm: false, tracing: false, trace: null, traceDone: null };
  const r = g.renderer;
  const origGrid = r.drawDeerclopsGrid.bind(r);
  r.drawDeerclopsGrid = function (e) {
    w.special++;
    if (w.traceArm) { w.traceArm = false; w.tracing = true; w.trace = []; }
    try { return origGrid(e); } finally {
      if (w.tracing) { w.tracing = false; w.traceDone = w.trace; w.trace = null; }
    }
  };
  const origEnemy = r.drawEnemy.bind(r);
  r.drawEnemy = function (e, ...rest) {
    if (e && e.vanillaId === 668) w.generic++;
    return origEnemy(e, ...rest);
  };
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  proto.drawImage = function (src, ...rest) {
    if (w.tracing) w.trace.push({ dx: Math.round(rest[4] ?? -9), dy: Math.round(rest[5] ?? -9), a: Math.round((this.globalAlpha ?? 1) * 100) / 100, dw: rest[6] ?? -1, dh: rest[7] ?? -1 });
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
const sample = (label) => page.evaluate((lb) => {
  const g = window.__swGame;
  const w = window.__bj51;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  const cam = g.camera;
  let scr = null;
  if (e && cam) {
    const [sx, sy] = cam.worldToScreen(e.cx, e.cy);
    scr = { x: Math.round(sx), y: Math.round(sy) };
  }
  return {
    label: lb,
    boss: e ? { x: Math.round(e.x), y: Math.round(e.y), cx: Math.round(e.cx), cy: Math.round(e.cy), ai0: e.ai0, ai1: e.ai1, lai3: e.lai3, facing: e.facing, frameIdx: e.vanillaGridFrameIdx, dead: e.dead } : null,
    player: g.player ? { dead: g.player.dead, distToBoss: e ? Math.round(Math.hypot(g.player.cx - e.cx, g.player.cy - e.cy)) : -1 } : null,
    cum: { special: w.special, layers: w.layers, generic: w.generic },
    screen: scr,
  };
}, label);
const sampleN = async (label, n, gap) => {
  const out = [];
  for (let i = 0; i < n; i++) { out.push(await sample(`${label}#${i}`)); await wait(gap ?? 120); }
  return out;
};
const deltas = (arr) => arr.map((s, i) => {
  if (i === 0) return null;
  const p = arr[i - 1];
  return {
    label: s.label,
    ai0: s.boss?.ai0, lai3: s.boss?.lai3, fIdx: s.boss?.frameIdx, dist: s.player?.distToBoss,
    special: s.cum.special - p.cum.special, layers: s.cum.layers - p.cum.layers, generic: s.cum.generic - p.cum.generic,
  };
}).filter(Boolean);
const armTrace = async (ms) => {
  await page.evaluate(() => { window.__bj51.traceArm = true; });
  await wait(ms);
  return page.evaluate(() => window.__bj51.traceDone);
};
const cvMeta = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return { w: c.width, h: c.height, dpr: c.width / c.getBoundingClientRect().width };
});
const shot = async (name, cx, cy) => {
  const half = 280 / cvMeta.dpr;
  const clip = {
    x: Math.max(0, cx / cvMeta.dpr - half), y: Math.max(0, cy / cvMeta.dpr - half),
    width: Math.min(560, cvMeta.w / cvMeta.dpr), height: Math.min(560, cvMeta.h / cvMeta.dpr),
  };
  await page.screenshot({ path: `/tmp/bj51-${name}.png`, clip });
};
const onScreen = (s) => s && s.screen && s.screen.x > 340 && s.screen.x < cvMeta.w - 340 && s.screen.y > 340 && s.screen.y < cvMeta.h - 340;
const firstOn = (arr) => arr.find(onScreen) ?? arr[0];

const R = { deltasA: [], deltasB: [], deltasC: [], traceB2: null, traceC: null, bleed: null };

// ---- A: 近距战斗 ----
await summon668();
await healPlayer();
await wait(300);
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  g.player.x = e.x - 220; g.player.y = e.y + e.h - 60; g.player.vx = 0; g.player.vy = 0;
});
for (let i = 0; i < 3; i++) { await healPlayer(); await wait(500); }
const A = await sampleN('A', 4, 100);
R.deltasA = deltas(A);
const sA = firstOn(A);
await shot('A-close', sA.screen.x, sA.screen.y);

// ---- B1: 远距追踪期采样（boss 追近过程中 lai3>0 窗口）----
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  g.player.x = e.x - 1200; g.player.y = e.y + e.h - 60; g.player.vx = 0; g.player.vy = 0;
});
const B = await sampleN('B1', 8, 150);
R.deltasB = deltas(B);
const sB = firstOn(B.filter((s) => (s.boss?.lai3 ?? 0) > 5)) ?? firstOn(B);
await shot('B-far', sB.screen.x, sB.screen.y);

// ---- B2: lai3 注入 + 单次调用层日志 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  g.player.x = e.x - 200; g.player.y = e.y + e.h - 60;
  e.lai3 = 25;
});
R.traceB2 = await armTrace(250);

// ---- C: ai0=7 消散 + 层日志 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  e.ai0 = 7; e.ai1 = 30; e.lai1 = 0;
});
const C = await sampleN('C', 4, 100);
R.deltasC = deltas(C);
R.traceC = await armTrace(250);
const sC = firstOn(C);
await shot('C-ai07', sC.screen.x, sC.screen.y);

// ---- D: 贴图帧切片 bleed ----
R.bleed = await page.evaluate(async () => {
  const g = window.__swGame;
  const img = await g.renderer.atlas.ensureVImage('vanilla/NPC_668.png');
  if (!img) return { err: 'no img' };
  const cv = document.createElement('canvas');
  cv.width = 218; cv.height = 240;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const padBad = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      cx.clearRect(0, 0, 218, 240);
      cx.drawImage(img, col * 218, row * 240, 218, 240, 0, 0, 218, 240);
      const d = cx.getImageData(0, 0, 218, 240).data;
      let padOpaque = 0;
      for (let y = 0; y < 240; y++) {
        for (let x = 0; x < 218; x++) {
          const a = d[(y * 218 + x) * 4 + 3];
          if (a === 0) continue;
          if (x < 2 || x >= 216 || y < 2 || y >= 238) padOpaque++;
        }
      }
      if (padOpaque > 0) padBad.push({ row, col, padOpaque });
    }
  }
  return { padBad };
});

console.log(JSON.stringify(R, null, 1));
if (errors.length) console.error('PAGEERRORS:', errors.slice(0, 5));
await browser.close();
