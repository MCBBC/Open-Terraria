// BJ418 一次性探针：鹿角怪(668)"一闪一闪"实机取证
//  A) 近距战斗（<450px）：60 拍 body alpha 恒定锁（期待恒 ≈1）
//  B) 远距爬升（≥450px park 1200px）：60 拍 body alpha 序列（修复后=不透明紫影剪影恒 ≥0.95;
//     病灶式=衰减到 0.31）
//  C) 阈值锯齿（440px↔465px 每 10 拍交替）：60 拍序列（修复后无翻转;病灶式=闪烁）
// 采样=拦截 drawDeerclopsGrid 内 drawImage 的 ctx.globalAlpha（实体层唯一 draw=body,
// 红/雾层已移 drawDeerclopsGlow 不经此路;ai0∈{7,8} 才有紫重影前置 draw,本探针 ai0=0/1 域）。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5540';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&bj418=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

await page.evaluate(() => {
  const g = window.__swGame;
  // BJ418 主采样=globalAlpha setter 钩子：drawDeerclopsGrid 每层绘制前同步
  // `ctx.globalAlpha = alpha`（属性赋值,与 GPU 批量回放无关,恒可观测）。
  // ctx 实例按调用时 r.ctx 惰性挂钩（实例属性遮蔽原型 accessor）。
  const w = window.__bj418 = { trace: false, frames: [], hooked: new WeakSet(), allSets: 0, ctxIds: new Map(), diag: {} };
  const r = g.renderer;
  let nextCtxId = 1;
  const hook = (ctx) => {
    if (!ctx || w.hooked.has(ctx)) return;
    w.hooked.add(ctx);
    const id = nextCtxId++;
    if (!w.ctxIds.has(id)) w.ctxIds.set(id, 0);
    w.diag.hookedCount = nextCtxId - 1;
    const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'globalAlpha');
    Object.defineProperty(ctx, 'globalAlpha', {
      get() { return desc.get.call(this); },
      set(v) {
        w.allSets++;
        if (w.trace) {
          w.ctxIds.set(id, (w.ctxIds.get(id) ?? 0) + 1);
          const f = w.frames[w.frames.length - 1];
          if (f) f.sets.push(Math.round(v * 10000) / 10000);
        }
        desc.set.call(this, v);
      },
      configurable: true,
    });
  };
  const origGrid = r.drawDeerclopsGrid.bind(r);
  r.drawDeerclopsGrid = function (e) {
    hook(r.ctx);
    if (!w.diag.firstCtx) w.diag.firstCtx = nextCtxId;   // 首调挂钩序号
    w.diag.lastHookedBefore = w.hooked.has(r.ctx);
    const st = { lai3: e.lai3, ai0: e.ai0, ai1: e.ai1, dist: -1, sets: [], err: null };
    if (g.player) st.dist = Math.round(Math.hypot(g.player.cx - e.cx, g.player.cy - e.cy));
    w.frames.push(st);
    if (w.frames.length > 4000) w.frames.shift();
    w.trace = true;
    try { return origGrid(e); } catch (err) { st.err = String(err); } finally { w.trace = false; }
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
const bossOf = () => page.evaluate(() => {
  const e = [...window.__swGame.entities.enemies].find((n) => n.vanillaId === 668);
  return e ? { x: e.x, y: e.y, w: e.w, h: e.h, cx: e.cx, cy: e.cy } : null;
});
/** 玩家钉位：置于 boss 左侧 dist px 处（同地面高度） */
const parkPlayer = async (dist) => {
  const b = await bossOf();
  await page.evaluate((d, b) => {
    const p = window.__swGame.player;
    p.x = b.cx - d; p.y = b.y + b.h - 60; p.vx = 0; p.vy = 0;
  }, dist, b);
};
const readRec = async () => {
  const out = await page.evaluate(() => {
    const w = window.__bj418;
    const frames = w.frames.splice(0, w.frames.length);
    // 本体 alpha = 本次调用内 globalAlpha 赋值的 max（本体≥紫重影×0.5/红雾环≤0.502/
    // 雾≤0.065——原版本体恒为最不透明层;ai0∈{7,8} 峰值本体→0 时重影同衰减,不误判）
    return frames.map((f) => ({
      lai3: f.lai3, ai0: f.ai0, ai1: f.ai1, dist: f.dist, err: f.err,
      n: f.sets.length,
      a: f.sets.length ? Math.max(...f.sets) : null,
      all: f.sets,
    }));
  });
  if (!out || !Array.isArray(out)) { console.error('readRec bad:', JSON.stringify(out)?.slice(0, 200)); return []; }
  return out;
};
const stats = (arr) => {
  const as = arr.filter((s) => s.a != null).map((s) => s.a);
  return as.length ? {
    n: as.length,
    min: Math.min(...as), max: Math.max(...as),
    lai3min: Math.min(...arr.map((s) => s.lai3)), lai3max: Math.max(...arr.map((s) => s.lai3)),
    distMin: Math.min(...arr.map((s) => s.dist)), distMax: Math.max(...arr.map((s) => s.dist)),
  } : { n: 0 };
};
const shotBoss = async (name) => {
  const b = await bossOf();
  if (!b) return;
  const cvMeta = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return { w: c.width, h: c.height, dpr: c.width / c.getBoundingClientRect().width };
  });
  const cam = await page.evaluate(() => {
    const g = window.__swGame;
    const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
    return { sx, sy };
  });
  const half = 300 / cvMeta.dpr;
  const vw = cvMeta.w / cvMeta.dpr, vh = cvMeta.h / cvMeta.dpr;
  const cx = Math.min(vw - 1, Math.max(0, cam.sx / cvMeta.dpr));
  const cy = Math.min(vh - 1, Math.max(0, cam.sy / cvMeta.dpr));
  const clip = {
    x: Math.max(0, Math.min(vw - 50, cx - half)),
    y: Math.max(0, Math.min(vh - 50, cy - half)),
    width: Math.min(600, vw), height: Math.min(600, vh),
  };
  clip.width = Math.min(clip.width, vw - clip.x);
  clip.height = Math.min(clip.height, vh - clip.y);
  try {
    await page.screenshot({ path: `/tmp/bj418-${name}.png`, clip });
  } catch (e) {
    console.error('shot fail', name, e.message);
  }
};

// ---- 像素级采样（BJ418 主判据）：boss 屏幕矩形内「紫影剪影签名」像素计数
// （本体 lai3≥20 → tPurple≈1 → 纯 (50,0,160)×光照;签名 = B−R>60 ∧ B−G>60。
// 病灶式 lai3=30 → 本体 α=0.306 与雪原背景混色 → 签名计数≈0）
const pxSeries = async (beats, parkDist, gapMs) => {
  const out = [];
  for (let i = 0; i < beats; i++) {
    const s = await page.evaluate((pd) => {
      const g = window.__swGame;
      const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
      if (!e || !g.renderer?.ctx) return null;
      // 逐拍重钉玩家距离（boss 追击会缩距;钉在阈上/阈下保 lai3 相位）
      if (g.player && pd > 0) {
        g.player.x = e.cx - pd; g.player.y = e.y + e.h - 60;
        g.player.vx = 0; g.player.vy = 0; g.player.iframes = 120;
      }
      const cv = g.renderer.ctx.canvas;
      const [sx, sy] = g.camera.worldToScreen(e.cx, e.y + e.h);
      const x0 = Math.max(0, Math.round(sx) - 130), y0 = Math.max(0, Math.round(sy) - 260);
      const w = Math.min(260, cv.width - x0), h = Math.min(260, cv.height - y0);
      if (w <= 10 || h <= 10) return { lai3: e.lai3, ai0: e.ai0, purple: -1 };
      const d = g.renderer.ctx.getImageData(x0, y0, w, h).data;
      let purple = 0, opaque = 0;
      for (let p = 0; p < d.length; p += 16) {   // 1/4 步进采样
        if (d[p + 3] < 200) continue;
        opaque++;
        if (d[p + 2] - d[p] > 60 && d[p + 2] - d[p + 1] > 60) purple++;
      }
      return { lai3: e.lai3, ai0: e.ai0, dist: g.player ? Math.round(Math.hypot(g.player.cx - e.cx, g.player.cy - e.cy)) : -1, purple, opaque };
    }, parkDist);
    if (s) out.push(s);
    await wait(gapMs ?? 40);
  }
  return out;
};

const R = { A: null, B: null, C: null, raw: {}, px: {}, meta: {} };

// ---- A: 近距（220px）60 拍 ----
await summon668();
for (let i = 0; i < 3; i++) { await healPlayer(); await wait(400); }
await parkPlayer(220);
await wait(200);
await readRec();
await wait(1200);
R.raw.A = await readRec();
R.A = stats(R.raw.A);
await shotBoss('A-close');

// ---- B: 远距 park 1200px → lai3 爬到 30 后 hold,60 拍 ----
await page.evaluate(() => { const p = window.__swGame.player; p.iframes = 600; });
await parkPlayer(1200);
await wait(400);
await readRec();
await wait(1100);
R.raw.B = await readRec();
R.B = stats(R.raw.B);
await shotBoss('B-far');

// ---- C: 阈值锯齿（440px↔465px 每 10 拍交替）60 拍 ----
await healPlayer();
await readRec();
const b0 = await bossOf();
for (let k = 0; k < 6; k++) {
  const d = k % 2 === 0 ? 465 : 440;
  await page.evaluate((d, b) => {
    const p = window.__swGame.player;
    p.x = b.cx - d; p.y = b.y + b.h - 60; p.vx = 0; p.vy = 0;
    p.iframes = 120;
  }, d, b0);
  await wait(180);
}
await wait(120);
R.raw.C = await readRec();
R.C = stats(R.raw.C);

// ---- D: 像素级序列（主判据）：远距 560px（≥450 阈上,在屏内）60 拍 + 近距 220px 对照 ----
await wait(400);
R.px.far = await pxSeries(60, 560, 40);
R.px.near = await pxSeries(30, 220, 40);

R.meta = await page.evaluate(() => ({ errors: [], diag: window.__bj418.diag, ctxIds: [...window.__bj418.ctxIds.entries()], allSets: window.__bj418.allSets }));
R.meta.errors = errors.slice(0, 5);
console.log(JSON.stringify(R, null, 1));
await browser.close();
