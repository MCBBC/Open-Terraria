// 花苞放置细粒度仪器：wrap store.setTile 记录 burst 期间每个写操作（含清零），
// 多次 burst 统计"写下 4 格 vs 最终存活格数"，定位是否中途被监听链啃格。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const txt = readFileSync(process.env.BULB_MAP, 'utf8');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await page.goto('' + ORIGIN + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 500));

const out = await page.evaluate(async (saveText) => {
  await window.__swLoadJson(saveText);
  await new Promise((r) => setTimeout(r, 1200));
  const g = window.__swGame;
  const w = g.world, st = w.store;
  const { TILE_INTERNAL_OF_STABLE } = await import('/src/data/tiles.ts');
  const ib = TILE_INTERNAL_OF_STABLE[238];
  // wrap setTile
  const origSet = st.setTile.bind(st);
  const opsLog = [];
  let recording = false;
  let sawBulbWrite = false;
  const zeroStacks = [];
  st.setTile = (x, y, t, fx, fy) => {
    if (recording) {
      opsLog.push([x, y, t]);
      if (t === ib) sawBulbWrite = true;
      else if (t === 0 && sawBulbWrite) {
        zeroStacks.push(new Error('zero-trace').stack?.split('\n').slice(1, 8).join(' | '));
        sawBulbWrite = false;
      }
    }
    return origSet(x, y, t, fx, fy);
  };
  const scan = () => {
    const pts = [];
    for (let k = 0; k < st.type.length; k++) if (st.type[k] === ib) pts.push([k % st.w, Math.floor(k / st.w)]);
    return pts;
  };
  const base = new Set(scan().map(([x, y]) => `${x},${y}`));
  w.flags.hardMode = true;
  w.flags['downed_134'] = true; w.flags['downed_125'] = true; w.flags['downed_127'] = true;
  const runs = [];
  for (let r = 0; r < 3; r++) {
    opsLog.length = 0; sawBulbWrite = false;
    recording = true;
    const ok = g.evolution.planteraBulbBurst();
    recording = false;
    const nowAll = scan();
    const added = nowAll.filter(([x, y]) => !base.has(`${x},${y}`));
    for (const [x, y] of added) base.add(`${x},${y}`);
    const written = opsLog.filter(([, , t]) => t === ib).length;
    const clearedInside = [];   // 写完花苞后 bbox 内出现 type=0 的写操作
    // 简化：逐条回放 opsLog 检查 ib 写入后是否有同坐标 0 写
    const posWritten = new Map();
    for (const [x, y, t] of opsLog) {
      if (t === ib) posWritten.set(`${x},${y}`, true);
      else if (t === 0 && posWritten.get(`${x},${y}`)) clearedInside.push(`${x},${y}`);
    }
    runs.push({
      returnedTrue: ok,
      cellsWrittenIb: written,
      cellsAliveNow: added.length,
      zeroAfterBulb: clearedInside,
      opsTotal: opsLog.length,
      xy: added.map((p2) => [...p2]),
    });
    if (r === 0 && zeroStacks.length) { runs[0].zeroStacks = zeroStacks.slice(); zeroStacks.length = 0; }
  }
  // 单组结构样例（含 frame/liquid）：取最后一次的位置 3×3 域
  const last = runs.find((r2) => r2.xy.length)?.xy[0];
  let gridSample = null;
  if (last) {
    const { TILE_STABLE_OF_INTERNAL } = await import('/src/data/tiles.ts');
    gridSample = [];
    for (let dy = -1; dy <= 3; dy++) {
      const row = [];
      for (let dx = -1; dx <= 2; dx++) {
        const i = (last[1] + dy) * st.w + (last[0] + dx);
        row.push(st.type[i] === ib ? 'BULB' : String(TILE_STABLE_OF_INTERNAL[st.type[i]] ?? st.type[i]));
      }
      gridSample.push(row);
    }
  }
  return {
    surfaceYForBox: w.groundLevel,     // 本仓 worldSurface=groundLevel(Game.ts:4100)
    dungeonX: w.dungeonX,
    runs,
    gridSample,
  };
}, txt);
console.log(JSON.stringify(out, null, 2));
if (errs.length) console.log('pageerrors:', errs.slice(0, 3));
await browser.close();
