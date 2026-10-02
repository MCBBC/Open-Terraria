// BJ434 截图探针 v3：ack 欢迎覆层 → setup 仙灵+宝箱 → in-page rAF 采样状态时间轴 →
// Node 侧每 700ms 截一帧,事后按时间轴把三状态窗各归档一张。
// 运行:SW_ORIGIN=http://localhost:5801 node tools/run-diag.mjs scripts/_bj434-fairy-shots2.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const EV = new URL('../docs/evidence/bj434/', import.meta.url).pathname;
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800 });
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));

// ack 欢迎覆层（不关也不影响逻辑,只为截图干净）
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => /我已知晓/.test(x.textContent || ''));
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 600));

const setup = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILE = 16;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  g.enemySpawnEnabled = false;
  g.world.clock.timeOfDay = 0.5;
  for (const e of g.entities.enemies) if (e.vanillaId >= 583 && e.vanillaId <= 585) e.dead = true;
  const ptx = Math.floor(g.player.cx / TILE);
  let gy = Math.floor(g.player.cy / TILE);
  while (gy < st.h - 2 && !st.isSolid(ptx, gy)) gy++;
  st.setTileSilent(ptx + 6, gy - 2, TILE_BY_KEY['chest'], 0, 0);
  const fairy = Enemy.fromVanilla(583, g.player.cx - 9, (gy - 6) * TILE);
  fairy.ai2 = 2; fairy.ai3 = 0;
  g.entities.enemies.push(fairy);
  // in-page 时间轴采样（挂 rAF,900 帧后自停）
  window.__bj434tl = [];
  let n = 0;
  const step = () => {
    const f = g.entities.enemies.find(e => e.vanillaId >= 583 && e.vanillaId <= 585);
    window.__bj434tl.push({
      t: performance.now(), ai2: f ? f.ai2 : -1,
      x: f ? f.x : NaN, y: f ? f.y : NaN,
      px: Math.round(g.player.cx), py: Math.round(g.player.cy),
    });
    if (++n < 900) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return { chest: [ptx + 6, gy - 2], fairy: { x: fairy.x, y: fairy.y, dead: fairy.dead } };
});
console.log('setup:', JSON.stringify(setup));

// 每 700ms 截一帧,共 14 张（覆盖引导全程 ~15s）
const shots = [];
for (let i = 0; i < 14; i++) {
  const f = `bj434-t${String(i).padStart(2, '0')}.png`;
  await p.screenshot({ path: EV + f });
  shots.push({ f, t: performance.now() });
  await new Promise(r => setTimeout(r, 700));
}

const tl = await p.evaluate(() => window.__bj434tl);
fs.writeFileSync(EV + 'bj434-timeline.json', JSON.stringify(tl));
// 状态窗归档：每个 ai2 迁移点找时间上最近的截图
const trans = [];
let prev = -1;
for (const s of tl) if (s.ai2 !== prev) { trans.push({ ai2: s.ai2, t: s.t }); prev = s.ai2; }
const picks = {};
for (const want of [3, 4, 5]) {
  const tr = trans.find(x => x.ai2 === want);
  if (!tr) continue;
  let best = null, bd = 1e18;
  for (const s of shots) { const d = Math.abs(s.t - tr.t); if (d < bd) { bd = d; best = s; } }
  if (best) picks[want] = best.f;
}
console.log('transitions:', JSON.stringify(trans));
console.log('picks:', JSON.stringify(picks));
for (const [k, f] of Object.entries(picks)) {
  fs.copyFileSync(EV + f, EV + `bj434-s${k}-window.png`);
}
console.log('SHOTS-DONE');
await b.close();
