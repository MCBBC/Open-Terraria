// 玩家落水涟漪诊断（2026-08-25 用户报：正上方落入水塘无涟漪、边缘走入正常、
// 怪物入水正常）：对比三种入水方式的 wetCount/涟漪队列/水花尘触发。
//   A 垂直落入（模拟"正上方落入"）
//   B 水平走入（模拟"边缘走入"）
//   C 僵尸同点位垂直落入（对照组）
// 采样：每 tick inWater/wetCount/vy + waterWaves.debug().rippleQueueUsed（该帧入队数）
// 运行:SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs scripts/_water-entry-probe.mjs
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
  // 造水塘：出生点附近平地挖 6 宽 × 4 深，灌水
  const px = Math.floor(g.player.x / 16) + 10;
  const gy = Math.floor(g.player.y / 16) + 2;
  for (let x = px - 3; x <= px + 3; x++) {
    for (let y = gy; y <= gy + 3; y++) st.setTile(x, y, 0);
    for (let y = gy + 1; y <= gy + 3; y++) {
      const i = st.idx(x, y);
      st.liquid[i] = 255;
      st.liquidType[i] = 1;   // 水
    }
  }
  // 池底封住防漏
  for (let x = px - 3; x <= px + 3; x++) st.setTile(x, gy + 4, 1);
  // 池壁
  st.setTile(px - 4, gy, 1); st.setTile(px + 4, gy, 1);
  for (let y = gy + 1; y <= gy + 4; y++) { st.setTile(px - 4, y, 1); st.setTile(px + 4, y, 1); }
  window.__pond = { px, gy };
  return { px, gy, surfaceY: (gy + 1) * 16 };
});
console.log('pond:', JSON.stringify(setup));

const runCase = async (name, mode) => {
  const out = await page.evaluate(async ({ mode, pond }) => {
    const g = window.__swGame;
    const WW = await import('/src/render/WaterWaves.ts');
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const { px, gy } = pond;
    const surfY = (gy + 1) * 16;      // 水面
    const rows = [];
    let target = null;
    if (mode === 'npc') {
      target = Enemy.fromVanilla(3, px * 16, surfY - 200);
      if (target) { target.x = px * 16 - target.w / 2 + 8; target.y = surfY - 200 - target.h; g.entities.add(target, 'enemies'); }
    } else {
      target = g.player;
    }
    if (!target) return ['no target'];
    // 复位：玩家放池塘正上方
    if (mode !== 'npc') {
      target.x = px * 16 - target.w / 2 + 8;
      target.y = surfY - (mode === 'fall' ? 200 : 0) - target.h - 1;
      if (mode === 'walk') {
        target.y = surfY - target.h + 2;   // 站在池边地面高度（水面齐脚）
        target.x = (px - 4) * 16 - target.w; // 池壁左侧
        target.vx = 2.2;                     // 向右走入
      } else {
        target.vy = 0;
      }
      target.vx = mode === 'walk' ? 2.2 : 0;
      target.vy = mode === 'fall' ? 0 : target.vy;
      target.fallStartY = null;
    }
    let prevWet = mode === 'npc' ? target.wet : target.inWater;
    let prevCnt = target.wetCount;
    for (let t = 0; t < 40; t++) {
      g.fixedUpdate(1 / 60);
      const wet = mode === 'npc' ? target.wet : target.inWater;
      const cnt = target.wetCount;
      const dbg = WW.waterWaves.debug();
      if (t < 24 || wet !== prevWet || cnt !== prevCnt || (mode === 'npc' && cnt !== 0)) {
        rows.push(`t${String(t).padStart(2)} wet=${wet ? 1 : 0} cnt=${cnt} vy=${target.vy.toFixed(1)} y=${Math.round(target.y)} rq=${dbg.rippleQueueUsed} q=${WW.waterWaves.quality}`);
      }
      prevWet = wet; prevCnt = cnt;
    }
    if (mode === 'npc') target.dead = true;
    return rows;
  }, { mode, pond: setup });
  console.log(`\n=== ${name} ===`);
  for (const r of out) console.log(r);
};

await runCase('A 垂直落入（正上方 200px）', 'fall');
await runCase('B 水平走入（边缘 vx=2.2）', 'walk');
await runCase('C 僵尸垂直落入（对照）', 'npc');
if (errors.length) console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
