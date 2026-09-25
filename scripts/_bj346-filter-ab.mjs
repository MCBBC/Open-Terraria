// BJ346 探针 v2：FilterTower 滤镜 A/B 干净采样。
//  修正 v1 两坑：WelcomeAnnounce 弹窗未 ack（预种 localStorage）、玩家被柱小怪打死
//  （巨 defense）+ 时相漂移（freezeClock 正午）。采样带=天窗 x[420,860] y[10,90]
//  （避开热栏 x<420 / 心 x>1000 / 中央弹窗 y>115）。
// 用法：SW_ORIGIN=... node tools/run-diag.mjs scripts/_bj346-filter-ab.mjs [--tag PRE|POST]
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5202';
const tagIdx = process.argv.indexOf('--tag');
const TAG = tagIdx >= 0 ? process.argv[tagIdx + 1] : 'X';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* noop */ }
});
await page.goto(ORIGIN + '/?play=small&bj346ab' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) { console.error('未进游戏'); process.exit(1); }

// 正午冻结 + 巨防御防死
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.defense = 1000000;
  // 滤镜链 pass 捕获
  const r = g.renderer;
  window.__fxPasses = [];
  const snap = (passes) => {
    try { window.__fxPasses.push(JSON.parse(JSON.stringify(passes.filter((p) => p.kind === 'FilterTower')))); } catch { /* noop */ }
  };
  const fx = r.screenFx;
  if (fx) {
    if (fx.drawChainPipe) {
      const o = fx.drawChainPipe.bind(fx);
      fx.drawChainPipe = function (pipe, src, passes, tint) { snap(passes); return o(pipe, src, passes, tint); };
    }
    if (fx.drawChain) {
      const o2 = fx.drawChain.bind(fx);
      fx.drawChain = function (src, passes, tint) { snap(passes); return o2(src, passes, tint); };
    }
  }
});

const { freezeClock } = await import('../tools/probe/lib/clock.mjs');
console.log('freeze:', JSON.stringify(await freezeClock(page, { tod: 0.5 })));
const CONTROL = process.argv.includes('--control');
if (CONTROL) {
  await page.evaluate(() => { window.__bj346Control = true; });
}

// 场景：玩家地表中部，星云塔 +500px，日耀塔 +2200px（同 Zone 参照）
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const wx = Math.floor(st.w / 2);
  let placed = false;
  for (let x = wx - 30; x < wx + 30 && !placed; x++) {
    for (let y = 60; y < st.h - 60; y++) {
      if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)) {
        g.player.x = x * 16 + 8 - g.player.w / 2;
        g.player.y = (y - 3) * 16 - g.player.h;
        g.player.vx = 0; g.player.vy = 0;
        placed = true;
        break;
      }
    }
  }
  if (!placed) return { placed: false };
  if (window.__bj346Control) return { placed: true, control: true };
  const le = g.world.lunarEvent;
  le.active = true;
  le.towerActive.nebula = true;
  le.towerActive.solar = true;
  le.shield.nebula = 100;
  le.shield.solar = 100;
  g.debugSpawnNpc(507, 1, false);
  const t = [...g.entities.enemies].reverse().find((e) => !e.dead && e.vanillaId === 507);
  if (t) { t.x = g.player.cx + 500 - t.w / 2; t.y = g.player.cy - 500 - t.h / 2; }
  g.debugSpawnNpc(517, 1, false);
  const s = [...g.entities.enemies].reverse().find((e) => !e.dead && e.vanillaId === 517);
  if (s) { s.x = g.player.cx + 2200 - s.w / 2; s.y = g.player.cy - 500 - s.h / 2; }
  return { placed: true };
});
console.log('setup:', JSON.stringify(setup));

// 等 Filter.Opacity 斜坡（1/s）到 1 + 小怪清场不是目标——等 3.5s
await new Promise((r) => setTimeout(r, 3500));
// 保活（防小怪磨死）
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.defense = 1000000;
  if (g.player.hp < g.player.maxHp) g.player.hp = g.player.maxHp;
});
await page.evaluate(() => { window.__fxPasses.length = 0; });
await new Promise((r) => setTimeout(r, 300));
const shot = await page.screenshot({ type: 'png' });
writeFileSync(`/tmp/bj346-ab-${TAG}.png`, shot);

const fxData = await page.evaluate(() => ({
  passes: window.__fxPasses.slice(-3),
  sfxPath: window.__swGame.renderer.sfxPathUsed,
  hp: window.__swGame.player.hp,
  dead: !!window.__swGame.player.dead,
}));
const png = PNG.sync.read(shot);
// 采样带（天窗）+ 全帧统计
function stats(x0, x1, y0, y1) {
  let n = 0, r = 0, g = 0, b = 0, lean = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const R = png.data[i], G = png.data[i + 1], B = png.data[i + 2];
      r += R; g += G; b += B;
      if (R - G > 25) lean++;
      n++;
    }
  }
  return { mean: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], rSubGFrac: +(lean / n).toFixed(4) };
}
const out = {
  tag: TAG,
  sky: stats(420, 860, 10, 90),
  skyFar: stats(60, 360, 120, 300),   // 远离塔环的左上纯净天域（POST 环伪影判读区）
  full: stats(0, png.width, 0, png.height),
  fx: fxData,
  errors,
};
writeFileSync(`/tmp/bj346-ab-${TAG}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ tag: TAG, sky: out.sky, full: out.full, sfxPath: fxData.sfxPath, dead: fxData.dead, errors: errors.length }, null, 1));
await browser.close();
console.log(`DONE ${TAG}`);
