// 卡死凹槽现场重放（2026-08-25 用户报 debug-report-…04-00-25）：
//   从报告 areaCamera dump 逐格重建真实地形（sheet→内部 id），两只僵尸放报告
//   坐标 (33408,3808)，泵 1800 tick 观察：逃逸/循环/位置轨迹。
// 运行:SW_ORIGIN=http://localhost:5231 node tools/run-diag.mjs scripts/_stuck-notch-replay.mjs
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const report = JSON.parse(readFileSync('/Users/vinlic/Downloads/debug-report-氙奇葩-2026-08-25T04-00-25-182Z.json', 'utf8'));
const area = report.tiles.areaCamera;

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5231', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));

const setup = await page.evaluate(async (dump) => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  // sheet → 内部 id 表
  const bySheet = new Map();
  for (let id = 0; id < TILE_DEFS.length; id++) {
    const sh = TILE_DEFS[id]?.vanilla?.sheet;
    if (sh !== undefined && !bySheet.has(sh)) bySheet.set(sh, id);
  }
  const decodeRow = (s) => {
    const cells = [];
    for (const seg of s.split(';')) {
      if (seg.includes('*')) { const [v, n] = seg.split('*'); for (let i = 0; i < +n; i++) cells.push(v); }
      else cells.push(seg);
    }
    return cells;
  };
  // 重建区域（先清后写；wall 一并还原）
  for (let ty = dump.y0; ty < dump.y0 + dump.h; ty++) {
    const cells = decodeRow(dump.rows[ty - dump.y0]);
    for (let tx = dump.x0; tx < dump.x0 + dump.w; tx++) {
      const c = cells[tx - dump.x0];
      if (c === undefined) continue;
      const f = c.split(':').map(Number);
      const sheet = f[0], wall = f[3], liquid = f[4];
      const i = st.idx(tx, ty);
      st.flags[i] = 0; st.type[i] = 0; st.slope[i] = 0; st.half[i] = 0;
      st.wall[i] = wall || 0;
      st.liquid[i] = liquid || 0;
      if (sheet > 0) {
        const id = bySheet.get(sheet);
        if (id !== undefined) { st.flags[i] = 1; st.type[i] = id; }
      }
    }
  }
  // 玩家放报告位（2076*16, 231*16 附近），深夜
  g.player.x = 2076 * 16; g.player.y = 231 * 16 - 60; g.player.vx = 0; g.player.vy = 0;
  g.world.clock.timeOfDay = 0.0;
  // 两只僵尸（vid 3 + vid 132 各一，同报告）放报告坐标
  const zs = [];
  for (const vid of [3, 132]) {
    const e = Enemy.fromVanilla(vid, 33408, 3808);
    if (!e) continue;
    e.x = 33408; e.y = 3808;
    e.vx = 0; e.vy = 0;
    g.entities.add(e, 'enemies');
    zs.push(e.id);
  }
  window.__replay = { ids: zs, trace: [] };
  return { placed: zs.length, area: [dump.x0, dump.y0, dump.w, dump.h] };
}, area);
console.log('setup:', JSON.stringify(setup));

// 泵 1800 tick，每 30 tick 采样两只僵尸状态
for (let c = 0; c < 6; c++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    const rp = window.__replay;
    const sample = () => {
      for (const e of g.entities.enemies) {
        if (!rp.ids.includes(e.id) || e.dead) continue;
        rp.trace.push({ t: rp.t, id: e.id, x: Math.round(e.x), y: Math.round(e.y), vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2), onG: e.onGround, face: e.facing, ai3: Math.round(e.ai3), dead: e.dead });
      }
    };
    for (let t = 0; t < 300; t++) {
      rp.t = (rp.t ?? 0) + 1;
      g.fixedUpdate(1 / 60);
      if (rp.t % 30 === 0) sample();
    }
  });
}
const trace = await page.evaluate(() => window.__replay.trace);
// 压缩输出：每 60 tick 打一行
let last = '';
for (const s of trace) {
  const line = `t=${String(s.t).padStart(4)} id=${s.id} x=${s.x} y=${s.y} v=(${s.vx},${s.vy}) onG=${s.onG ? 1 : 0} face=${s.face} ai3=${s.ai3}${s.dead ? ' DEAD' : ''}`;
  if (line !== last) { console.log(line); last = line; }
}
if (errors.length) console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
