// BJ434 仙灵指路瞬移实机探针：small 世界玩家旁放金宝箱 + 手植 583 仙灵（ai2=2 野生引导态），
// 逐帧采样 900 帧：①引导链状态迁移 ②逐帧位移（瞬移判别——病灶形状态 3 首帧差值可达
// ~1200px；修复后引导态逐帧位移 ≤6px）③三时刻截图留档 docs/evidence/bj434/。
// 运行:SW_ORIGIN=http://localhost:5801 node tools/run-diag.mjs scripts/_bj434-fairy-probe.mjs
import puppeteer from 'puppeteer-core';

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
await new Promise(r => setTimeout(r, 2500));

const res = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILE = 16;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const out = {};

  g.enemySpawnEnabled = false;
  g.world.clock.timeOfDay = 0.5;   // 夜（仙灵钉活窗,ai2=0 才续命;引导态不依赖）

  // 清场：移除既有仙灵
  for (const e of g.entities.enemies) if (e.vanillaId >= 583 && e.vanillaId <= 585) e.dead = true;

  // 玩家旁地面放金宝箱（sheet 21,引导目标）
  const ptx = Math.floor(g.player.cx / TILE);
  let gy = Math.floor(g.player.cy / TILE);
  while (gy < st.h - 2 && !st.isSolid(ptx, gy)) gy++;
  const chestTx = ptx + 6, chestTy = gy - 2;
  st.setTileSilent(chestTx, chestTy, TILE_BY_KEY['chest'], 0, 0);
  out.chest = { tx: chestTx, ty: chestTy, groundY: gy };

  // 手植 583 粉仙灵（玩家头顶 3 格,野生引导态 ai2=2）
  const fx = g.player.cx, fy = (gy - 6) * TILE;
  const fairy = Enemy.fromVanilla(583, fx - 9, fy);
  if (!fairy) { out.error = 'fairy spawn failed'; return out; }
  fairy.ai2 = 2; fairy.ai3 = 0;
  g.entities.enemies.push(fairy);
  out.fairySpawn = { x: fairy.x, y: fairy.y };

  // 逐帧采样 900 帧（rAF 在游戏 update 之后注册,采到的是本 tick 末位置）
  await sleep(300);
  const samples = [];
  await new Promise((resolve) => {
    let n = 0;
    const step = () => {
      const f = g.entities.enemies.find(e => e.vanillaId >= 583 && e.vanillaId <= 585 && !e.dead);
      samples.push(f ? { x: f.x, y: f.y, ai2: f.ai2, ai3: f.ai3, dead: false }
        : { x: NaN, y: NaN, ai2: -1, ai3: -1, dead: true });
      if (++n >= 900) resolve(); else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // 引导链状态迁移表
  out.transitions = [];
  let prevAi2 = -1;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].ai2 !== prevAi2) {
      out.transitions.push({ frame: i, ai2: samples[i].ai2 });
      prevAi2 = samples[i].ai2;
    }
  }
  // 逐帧位移（存活段,按状态分桶）
  const maxStep = { s2: 0, s3: 0, s4: 0, s5: 0, other: 0 };
  let bigJumps = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], c = samples[i];
    if (c.dead || a.dead || isNaN(c.x) || isNaN(a.x)) continue;
    const d = Math.hypot(c.x - a.x, c.y - a.y);
    const k = c.ai2 === 2 ? 's2' : c.ai2 === 3 ? 's3' : c.ai2 === 4 ? 's4' : c.ai2 === 5 ? 's5' : 'other';
    if (d > maxStep[k]) maxStep[k] = d;
    if (d > 8) bigJumps.push({ frame: i, ai2: c.ai2, d: +d.toFixed(1) });
  }
  out.maxStep = maxStep;
  out.bigJumps = bigJumps.slice(0, 12);
  out.bigJumpCount = bigJumps.length;
  out.finalState = samples[samples.length - 1];
  return out;
});
console.log(JSON.stringify(res, null, 1));

// 截图三时刻：起舞段（ai2=3 中段）→ 带路段（ai2=4）→ 终演前（ai2=5）
const shot = async (name) => p.screenshot({ path: EV + name });
const st2 = await p.evaluate(() => {
  const f = window.__swGame.entities.enemies.find(e => e.vanillaId >= 583 && e.vanillaId <= 585 && !e.dead);
  return f ? { ai2: f.ai2, x: f.x, y: f.y } : null;
});
console.log('post-sample fairy:', JSON.stringify(st2));
await shot('bj434-final-frame.png');

await b.close();
console.log('PROBE-DONE');
