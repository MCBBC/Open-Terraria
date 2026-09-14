// FX24b 一次性探针：双体定性 + 真行走帧 + 直驱攻击态帧序
//  B 阶段截图见双鹿重叠 → 先数实体(668)（自然雨中生成链 Game.ts:10348 可能有第二只）
//  WALK：玩家 250px 左右横跳 → ai0=0 行走帧 2..11 alpha 期待 [1]
//  ATK 直驱：e.ai0=2/1/3 强设 → 逐 t 帧号对照原版表 + 截图
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&fx24b=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
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

await page.evaluate(() => {
  const g = window.__swGame;
  const w = window.__fx24b = { log: [], cur: null };
  const r = g.renderer;
  const origGrid = r.drawDeerclopsGrid.bind(r);
  r.drawDeerclopsGrid = function (e) {
    const rec = { who: e.whoAmI ?? -1, ai0: e.ai0, ai1: Math.round(e.ai1), lai3: Math.round(e.lai3), frameIdx: null, alphas: [] };
    w.log.push(rec);
    w.cur = rec;
    const proto = CanvasRenderingContext2D.prototype;
    const origDraw = proto.drawImage;
    proto.drawImage = function (src, ...rest) {
      if (w.cur) w.cur.alphas.push(Math.round((this.globalAlpha ?? 1) * 1000) / 1000);
      return origDraw.call(this, src, ...rest);
    };
    try { return origGrid(e); } finally {
      proto.drawImage = origDraw;
      rec.frameIdx = e.vanillaGridFrameIdx;
      w.cur = null;
    }
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
const forceSnow = () => page.evaluate(() => { if (window.__swGame.scene) window.__swGame.scene.zoneSnow = true; });
// 停雨 + downed 标记 → 断自然雨鹿生成链(Game.ts:10348)
const stopRainSpawn = () => page.evaluate(() => {
  const g = window.__swGame;
  if (g.world) {
    if (g.world.rain) g.world.rain = false;
    if (g.world.raining != null) g.world.raining = false;
    if (g.world.flags) g.world.flags['downed_668'] = true;
  }
  if (g.scene && 'raining' in g.scene) g.scene.raining = false;
});
const bossCount = () => page.evaluate(() => {
  const g = window.__swGame;
  const bs = [...g.entities.enemies].filter((n) => n.vanillaId === 668);
  return bs.map((e) => ({ x: Math.round(e.x), y: Math.round(e.y), ai0: e.ai0, ai1: Math.round(e.ai1), facing: e.facing, lai3: e.lai3 }));
});
const cvMeta = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')];
  const c = cs.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
  return { w: c.width, h: c.height, dpr: c.width / c.getBoundingClientRect().width };
});
const shot = async (name, cx, cy) => {
  const dpr = Number(cvMeta.dpr) || 1;
  const half = 300 / dpr;
  const clip = {
    x: Math.max(0, Math.min(cvMeta.w - 100, Math.round(Number(cx) / dpr - half))),
    y: Math.max(0, Math.min(cvMeta.h - 100, Math.round(Number(cy) / dpr - half))),
    width: Math.round(Math.min(600, cvMeta.w)), height: Math.round(Math.min(600, cvMeta.h)),
  };
  await page.screenshot({ path: `/tmp/fx24b-${name}.png`, clip });
};

const R = {};

await forceSnow(); await stopRainSpawn();
await summon668();
await healPlayer();
await wait(500);
// 收掉多余 668（若自然生成链抢跑）+ 固定单实体
R.afterSummon = await bossCount();
await page.evaluate(() => {
  const g = window.__swGame;
  const bs = [...g.entities.enemies].filter((n) => n.vanillaId === 668);
  for (const extra of bs.slice(1)) extra.dead = true;
});

// ---- WALK: 玩家 250px 横跳，逼 boss 追击行走 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  g.player.x = e.x - 250; g.player.y = e.y + e.h - 60; g.player.vx = 0; g.player.vy = 0;
  window.__fx24b.log.length = 0;
});
let walkSamples = [];
for (let i = 0; i < 7; i++) {
  const side = i % 2 === 0 ? -250 : 250;
  await page.evaluate((side) => {
    const g = window.__swGame;
    const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
    const p = g.player;
    p.x = e.x + side - p.w / 2;
    p.y = e.y + e.h - p.h - 2; p.vx = 0; p.vy = 0;
    window.__fx24b.log.length = 0;
  }, side);
  await healPlayer(); await forceSnow();
  await wait(450);
  const s = await page.evaluate(() => window.__fx24b.log.slice(-12).map((r) => ({ f: r.frameIdx, ai0: r.ai0, ai1: r.ai1, lai3: r.lai3, a: r.alphas })));
  walkSamples.push(...s.flat());
}
R.walk = walkSamples;
R.walkBoss = await bossCount();
{
  const e1 = await page.evaluate(() => {
    const g = window.__swGame;
    const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
    const cam = g.camera;
    const [sx, sy] = cam.worldToScreen(e.cx, e.cy);
    return { sx, sy };
  });
  await shot('W-walk', e1.sx, e1.sy);
}

// ---- ATK1 直驱（前向尖刺表）----
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  e.ai0 = 1; e.ai1 = 0; e.vx = 0;
  window.__fx24b.log.length = 0;
});
await wait(700);
R.atk1 = await page.evaluate(() => window.__fx24b.log.map((r) => ({ f: r.frameIdx, ai1: r.ai1 })));
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  const cam = g.camera;
  const [sx, sy] = cam.worldToScreen(e.cx, e.cy);
  window.__fx24b._scr = { sx, sy };
});
await shot('A1-atk1', (await page.evaluate(() => window.__fx24b._scr)).sx, (await page.evaluate(() => window.__fx24b._scr)).sy);

// ---- ATK2 直驱（碎石表）----
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  e.ai0 = 2; e.ai1 = 0; e.vx = 0;
  window.__fx24b.log.length = 0;
});
await wait(700);
R.atk2 = await page.evaluate(() => window.__fx24b.log.map((r) => ({ f: r.frameIdx, ai1: r.ai1 })));
{
  const s0 = await page.evaluate(() => window.__fx24b._scr);
  await shot('A2-atk2', s0.sx, s0.sy);
}

// ---- ATK3 直驱（咆哮表）----
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  e.ai0 = 3; e.ai1 = 0; e.vx = 0;
  window.__fx24b.log.length = 0;
});
await wait(700);
R.atk3 = await page.evaluate(() => window.__fx24b.log.map((r) => ({ f: r.frameIdx, ai1: r.ai1 })));

// ---- 双体长期监控（自然雨鹿链是否抢跑）----
await wait(2000);
R.laterBoss = await bossCount();

console.log(JSON.stringify(R, null, 1));
if (errors.length) console.error('PAGEERRORS:', errors.slice(0, 5));
await browser.close();
