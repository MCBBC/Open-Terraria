// 地牢机关电路验证：placeTrap(x,y,0) 1:1 后——压板(135)+飞镖(137)+红线连通
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0', timeout: 180000 });

const out = await page.evaluate(async () => {
  const gen = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const world = await gen.generateWorld({ width: 4200, height: 1200, seedText: 'dtrap-test', name: 'dtrap' });
  const st = world.store;
  const TRAP = tiles.TILE_BY_KEY['v_137_traps'];
  const PLATE = tiles.TILE_BY_KEY['v_135_pressure_plates'];
  const WIRE_RED = 1; // TileStore.WIRE_RED

  const traps = [], plates = [];
  // 只统计地牢区域（world.dungeonX ±350；神庙在丛林侧远离地牢，排除其压板/陷阱）
  const dx0 = Math.max(0, world.dungeonX - 350), dx1 = Math.min(st.w - 1, world.dungeonX + 350);
  for (let y = 0; y < st.h; y++) {
    for (let x = dx0; x <= dx1; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      if (st.type[i] === TRAP) traps.push([x, y]);
      else if (st.type[i] === PLATE) plates.push([x, y]);
    }
  }

  // 每个陷阱：3×3 内须有红线（嵌墙格自身或邻格在 L 路径上）
  const wired = ([x, y]) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (st.inBounds(x + dx, y + dy) && (st.wire[st.idx(x + dx, y + dy)] & WIRE_RED)) return true;
    }
    return false;
  };

  // 红线 BFS：压板出发能否到某个陷阱（电路连通性）
  const trapSet = new Set(traps.map(([x, y]) => x + ',' + y));
  const connectedPlates = plates.filter(([sx, sy]) => {
    const seen = new Set([sx + ',' + sy]);
    const q = [[sx, sy]];
    let steps = 0;
    while (q.length && steps < 5000) {
      const [x, y] = q.shift(); steps++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (!st.inBounds(nx, ny) || seen.has(k)) continue;
        if (!(st.wire[st.idx(nx, ny)] & WIRE_RED)) continue;
        if (trapSet.has(k)) return true;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return false;
  });

  // 陷阱朝向分布（frameX 0 朝左 / 18 朝右）
  const facing = { left: 0, right: 0 };
  for (const [x, y] of traps) {
    const fx = st.frameX[st.idx(x, y)];
    if (fx === 18) facing.right++; else facing.left++;
  }

  return {
    traps: traps.length, plates: plates.length,
    expected: Math.floor(st.w / 500),
    trapsWired: traps.filter(wired).length,
    platesConnected: connectedPlates.length,
    facing,
    sample: traps.slice(0, 3).map(([x, y]) => `(${x},${y},f${st.frameX[st.idx(x, y)]})`),
  };
});
console.log(JSON.stringify(out, null, 1));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('地牢内出现飞镖陷阱', out.traps > 0, `traps=${out.traps} (期望尝试 ${out.expected})`);
check('压板 135 同步放置', out.plates > 0, `plates=${out.plates}`);
check('每个陷阱邻接红线', out.trapsWired === out.traps, `${out.trapsWired}/${out.traps}`);
check('至少一个压板经红线连通到陷阱（电路闭环）', out.platesConnected > 0, `${out.platesConnected}/${out.plates}`);
if (errs.length) console.log('页面异常:', errs.slice(0, 3));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
