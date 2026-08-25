// 玩家落水涟漪诊断 v2：activeTexels（波形缓冲非中性 texel 数,跨帧持久）为判据。
// rq 队列逐帧清空不可作采样点；缓冲 texel 由渲染帧写入——探针泵 tick 后等一帧
// 渲染再采样。三案例：A 垂直落入 / B 水平走入 / C 僵尸垂直落入。
// 运行:SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs scripts/_water-entry-probe2.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5232', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  g.paused = true;
  const px = Math.floor(g.player.x / 16) + 10;
  const gy = Math.floor(g.player.y / 16) + 2;
  for (let x = px - 3; x <= px + 3; x++) {
    for (let y = gy; y <= gy + 3; y++) st.setTile(x, y, 0);
    for (let y = gy + 1; y <= gy + 3; y++) {
      const i = st.idx(x, y);
      st.liquid[i] = 255;
      st.liquidType[i] = 1;
    }
  }
  for (let x = px - 3; x <= px + 3; x++) st.setTile(x, gy + 4, 1);
  for (let y = gy; y <= gy + 4; y++) { st.setTile(px - 4, y, 1); st.setTile(px + 4, y, 1); }
  // 左岸平台（走入案例的立脚点）：池壁顶
  return { px, gy };
});
console.log('pond:', JSON.stringify(setup));

const runCase = async (name, mode) => {
  const out = await page.evaluate(async ({ mode, pond }) => {
    const g = window.__swGame;
    const WW = await import('/src/render/WaterWaves.ts');
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const { px, gy } = pond;
    const surfY = (gy + 1) * 16;
    // 波形缓冲清零基线
    const rows = [];
    let target = null;
    if (mode === 'npc') {
      target = Enemy.fromVanilla(3, px * 16, surfY - 260);
      if (target) { target.x = px * 16 - target.w / 2 + 8; target.y = surfY - 260 - target.h; g.entities.add(target, 'enemies'); }
    } else {
      target = g.player;
    }
    if (!target) return ['no target'];
    if (mode !== 'npc') {
      target.x = px * 16 - target.w / 2 + 8;
      target.y = surfY - 260 - target.h - 1;
      target.vx = 0; target.vy = 0;
      target.fallStartY = null;
    }
    let prevWet = false, prevCnt = 0;
    let maxTexels = 0, texelsAtEntry = -1, entryTick = -1;
    for (let t = 0; t < 46; t++) {
      g.fixedUpdate(1 / 60);
      const wet = mode === 'npc' ? target.wet : target.inWater;
      const cnt = target.wetCount;
      // 泵一帧渲染让波形缓冲更新（paused 下渲染循环仍在跑；等 rAF 一次）
      await new Promise((r) => requestAnimationFrame(() => r()));
      const dbg = WW.waterWaves.debug();
      if (dbg.activeTexels > maxTexels) maxTexels = dbg.activeTexels;
      if (wet && !prevWet) { entryTick = t; texelsAtEntry = dbg.activeTexels; }
      if (wet && !prevWet) rows.push(`-- 入水翻转 @t${t} vy=${target.vy.toFixed(1)}`);
      if ((wet && cnt !== prevCnt) || (!wet && cnt !== prevCnt)) {
        rows.push(`t${String(t).padStart(2)} wet=${wet ? 1 : 0} cnt=${cnt} texels=${dbg.activeTexels} rq=${dbg.rippleQueueUsed}`);
      }
      prevWet = wet; prevCnt = cnt;
    }
    rows.push(`RESULT maxTexels=${maxTexels} entryTick=${entryTick} texelsAtEntry=${texelsAtEntry}`);
    if (mode === 'npc') target.dead = true;
    return rows;
  }, { mode, pond: setup });
  console.log(`\n=== ${name} ===`);
  for (const r of out) console.log(r);
};

await runCase('A 垂直落入（正上方 260px）', 'fall');
await runCase('B 垂直落入（低高度 40px，慢速对照）', 'lowfall');
await runCase('C 僵尸垂直落入（对照）', 'npc');
if (errors.length) console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
