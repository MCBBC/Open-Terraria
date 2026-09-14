// FX24 一次性探针：鹿角怪(668)用户实报两症状取证——
//  ①「行走时动画帧透明」：近距(≤450px)行走态逐帧插桩 drawDeerclopsGrid——
//    期待=每帧 1 次调用、body 层 globalAlpha=1、lai3=0、帧序 2..11 循环;
//    远距(lai3 爬升)窗口采样 = 原版本相(本体 alpha×(1-r²) + 红雾/前雾)。
//  ②「攻击帧混乱」：ai0=1 前向尖刺态逐 t 采样 frameIdx 对照原版表
//    _deerclopsAttack1Frames[(int)ai[1]/4]（NPC.cs:6610-6626+FindFrame_FromSequence 钳末帧）,
//    并抓 drawImage 层数/alpha/源矩形（查重影/错格）。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&fx24=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));
// 关掉开局须知弹窗(遮 DOM 层,不关则截图/世界交互全被盖)
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
  }
});
await new Promise((r) => setTimeout(r, 800));

// ---- 插桩：drawDeerclopsGrid 每次调用记录(帧号/状态量/drawImage 层日志) ----
await page.evaluate(() => {
  const g = window.__swGame;
  const w = window.__fx24 = { log: [], tracing: false, cur: null, generic: 0 };
  const r = g.renderer;
  const origGrid = r.drawDeerclopsGrid.bind(r);
  r.drawDeerclopsGrid = function (e) {
    const rec = {
      ai0: e.ai0, ai1: Math.round(e.ai1), lai3: Math.round(e.lai3 * 10) / 10,
      spawnAlpha: e.spawnAlpha, vx: Math.round(e.vx * 100) / 100, vy: Math.round(e.vy * 100) / 100,
      facing: e.facing, frameIdx: null, draws: [],
    };
    w.log.push(rec);
    w.cur = rec;
    const proto = CanvasRenderingContext2D.prototype;
    const origDraw = proto.drawImage;
    const self = w;
    proto.drawImage = function (src, ...rest) {
      if (self.cur) self.cur.draws.push({ sx: rest[0], sy: rest[1], dx: Math.round(rest[4]), dy: Math.round(rest[5]), dw: rest[6], dh: rest[7], a: Math.round((this.globalAlpha ?? 1) * 1000) / 1000 });
      return origDraw.call(this, src, ...rest);
    };
    try { return origGrid(e); } finally {
      proto.drawImage = origDraw;
      rec.frameIdx = e.vanillaGridFrameIdx;
      self.cur = null;
    }
  };
  const origEnemy = r.drawEnemy.bind(r);
  r.drawEnemy = function (e, ...rest) {
    if (e && e.vanillaId === 668) w.generic++;
    return origEnemy(e, ...rest);
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
const bossCount = () => page.evaluate(() => {
  const g = window.__swGame;
  return [...g.entities.enemies].filter((n) => n.vanillaId === 668).map((e) => ({ id: e.id, x: Math.round(e.x), y: Math.round(e.y), ai0: e.ai0, lai3: Math.round(e.lai3), gameBoss: g.boss === e }));
});

// 强制雪原标记(免 shouldRunAway → ai0=6 干扰战斗态)
const forceSnow = () => page.evaluate(() => { if (window.__swGame.scene) window.__swGame.scene.zoneSnow = true; });

const cvMeta = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')];
  const meta = cs.map((c) => ({ id: c.id, cls: c.className, w: c.width, h: c.height, bw: c.getBoundingClientRect().width }));
  // 取最大面积画布 = 游戏主画布
  const c = cs.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
  return { w: c.width, h: c.height, dpr: c.width / c.getBoundingClientRect().width, meta };
});
const shot = async (name, cx, cy) => {
  try {
    const dpr = Number(cvMeta.dpr) || 1;
    const half = 300 / dpr;
    const clip = {
      x: Math.max(0, Math.round(Number(cx) / dpr - half)), y: Math.max(0, Math.round(Number(cy) / dpr - half)),
      width: Math.round(Math.min(600, (Number(cvMeta.w) || 1280) / dpr)), height: Math.round(Math.min(600, (Number(cvMeta.h) || 800) / dpr)),
    };
    console.error('[shot]', name, JSON.stringify(clip));
    await page.screenshot({ path: `/tmp/fx24-${name}.png`, clip });
  } catch (er) { console.error('[shot-fail]', name, String(er.message).slice(0, 120)); }
};

const R = { walk: null, walkPixels: null, attack: null, far: null, bleed: null };

// ---- A: 近距行走态（玩家贴身 → lai3→0,ai0=0 追击/行走）----
await forceSnow();
await summon668();
await healPlayer();
await wait(400);
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  g.player.x = e.x - 300; g.player.y = e.y + e.h - 60; g.player.vx = 0; g.player.vy = 0;
  window.__fx24.log.length = 0;
});
for (let i = 0; i < 3; i++) { await healPlayer(); await forceSnow(); await wait(400); }
const e0 = await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  return e ? { cx: e.cx, cy: e.cy, ai0: e.ai0, lai3: e.lai3, dist: Math.round(Math.hypot(g.player.cx - e.cx, g.player.cy - e.cy)) } : null;
});
R.walkState = e0;
R.countAfterA = await bossCount();
await page.evaluate(() => { window.__fx24.log.length = 0; });
await wait(700);
R.walk = await page.evaluate(() => window.__fx24.log.slice(-40).map((r) => ({ f: r.frameIdx, ai0: r.ai0, ai1: r.ai1, lai3: r.lai3, sa: r.spawnAlpha, vx: r.vx, vy: r.vy, n: r.draws.length, alphas: r.draws.map((d) => d.a) })));
{
  const e1 = await page.evaluate(() => {
    const g = window.__swGame;
    const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
    const cam = g.camera;
    const [sx, sy] = cam.worldToScreen(e.cx, e.cy);
    return { sx, sy, on: !!e && !e.dead };
  });
  if (e1.on) await shot('A-walk', e1.sx, e1.sy);
  // 采样本体中心像素列（查透明度：boss 盒内非背景像素占比）
  R.walkPixels = await page.evaluate(async () => {
    const g = window.__swGame;
    const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
    const cam = g.camera;
    const [sx, sy] = cam.worldToScreen(e.cx, e.cy);
    const cs = [...document.querySelectorAll('canvas')];
    const cv = cs.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    const c2 = document.createElement('canvas');
    c2.width = 240; c2.height = 300;
    const cx2 = c2.getContext('2d', { willReadFrequently: true });
    const dpr = cv.width / cv.getBoundingClientRect().width;
    cx2.drawImage(cv, Math.round(sx * dpr) - 120, Math.round(sy * dpr) - 280, 240, 300, 0, 0, 240, 300);
    const d = cx2.getImageData(0, 0, 240, 300).data;
    const tot = 240 * 300;
    const hist = new Map();
    for (let i = 0; i < tot; i++) {
      const r0 = d[i * 4], g0 = d[i * 4 + 1], b0 = d[i * 4 + 2];
      const key = `${r0 >> 4},${g0 >> 4},${b0 >> 4}`;
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
    const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ k, v }));
    return { top, distinct: hist.size };
  });
}

// ---- B: 攻击态（前向尖刺 ai0=1:玩家横向 <120px 站定）----
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  g.player.x = e.x + e.w / 2 - g.player.w / 2 + 60;   // 横向 60px,纵向贴地
  g.player.y = e.y + e.h - g.player.h - 2;
  g.player.vx = 0; g.player.vy = 0;
  window.__fx24.log.length = 0;
});
// 等进入攻击态
let atkSeen = false;
for (let i = 0; i < 30 && !atkSeen; i++) {
  atkSeen = await page.evaluate(() => {
    const g = window.__swGame;
    const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
    return e && (e.ai0 === 1 || e.ai0 === 4 || e.ai0 === 2 || e.ai0 === 3 || e.ai0 === 5);
  });
  await wait(120);
  await healPlayer();
}
await page.evaluate(() => { window.__fx24.log.length = 0; });
await wait(1600);
R.attack = await page.evaluate(() => window.__fx24.log.map((r) => ({ f: r.frameIdx, ai0: r.ai0, ai1: r.ai1, n: r.draws.length, alphas: r.draws.map((d) => d.a) })));
{
  const e1 = await page.evaluate(() => {
    const g = window.__swGame;
    const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
    const cam = g.camera;
    const [sx, sy] = cam.worldToScreen(e.cx, e.cy);
    return { sx, sy, ai0: e.ai0, on: !!e && !e.dead };
  });
  if (e1.on) await shot('B-attack', e1.sx, e1.sy);
  R.attackEndState = e1;
R.countAtB = await bossCount();
}

// ---- C: 远距 lai3 爬升窗（玩家拉远 → lai3 → 30 本体半透明=原版本相取证）----
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  g.player.x = e.x - 1200; g.player.y = e.y + e.h - 60; g.player.vx = 0; g.player.vy = 0;
  window.__fx24.log.length = 0;
});
await wait(2500);
R.far = await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  const cam = g.camera;
  const [sx, sy] = cam.worldToScreen(e.cx, e.cy);
  return {
    ai0: e.ai0, lai3: Math.round(e.lai3), dist: Math.round(Math.hypot(g.player.cx - e.cx, g.player.cy - e.cy)),
    dontTakeDamage: e.dontTakeDamage,
    last: window.__fx24.log.slice(-6).map((r) => ({ f: r.frameIdx, lai3: r.lai3, n: r.draws.length, alphas: r.draws.map((d) => d.a) })),
    sx, sy,
  };
});
await shot('C-far', R.far.sx, R.far.sy);
R.countAtC = await bossCount();

// ---- D: 贴图帧切片 bleed（5×5 每格 2px 环应全透明）----
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
      let padOpaque = 0, bodyOpaque = 0;
      for (let y = 0; y < 240; y++) {
        for (let x = 0; x < 218; x++) {
          const a = d[(y * 218 + x) * 4 + 3];
          if (a === 0) continue;
          if (x < 2 || x >= 216 || y < 2 || y >= 238) padOpaque++;
          else bodyOpaque++;
        }
      }
      padBad.push({ row, col, padOpaque, bodyOpaque });
    }
  }
  return padBad;
});

R.counts = await page.evaluate(() => ({ generic: window.__fx24.generic, grid: window.__fx24.log.length }));
R.cvMeta = cvMeta;
console.log(JSON.stringify(R, null, 1));
if (errors.length) console.error('PAGEERRORS:', errors.slice(0, 5));
await browser.close();
