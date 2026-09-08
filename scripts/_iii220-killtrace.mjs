// IIII220 探针D:谁杀了岩浆格里的火焰花 — killTile/setTile 全程追踪
//   SW_ORIGIN=http://localhost:5277 node tools/run-diag.mjs --timeout=300000 scripts/_iii220-killtrace.mjs
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5277';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 200000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const sheetOf = (t) => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  const m83 = TILE_BY_KEY['v_83_herbs_mature'];
  let garden = null;
  for (let y = st.h - 12; y > st.h - 160 && !garden; y--) {
    let run = 0, best = 0, bx = 0;
    for (let x = 20; x < st.w - 20; x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && sheetOf(st.type[i]) === 57) { run++; if (run > best) { best = run; bx = x - run + 1; } }
      else run = 0;
    }
    if (best >= 20) garden = { x: bx + 2, y: y - 1, floorY: y };
  }
  if (!garden) return { noGarden: true };
  const { x: gx, y: gy } = garden;
  // 清场
  for (let xx = gx - 3; xx <= gx + 3; xx++) for (let yy = gy - 4; yy < gy; yy++) {
    const i = st.idx(xx, yy); st.liquid[i] = 0; st.liquidType[i] = 0;
    if (st.flags[i]) st.setTile(xx, yy, 0);
  }
  const px = gx, py = gy;
  st.setTile(px, py, m83, 90, 0);
  const log = [];
  // 追踪:killTile sink + 株格 setTile
  const origKill = g.liquid.killTile?.bind(g.liquid);
  if (g.liquid) g.liquid.killTile = (x, y) => { log.push(['killTile', x, y, st.type[st.idx(x, y)]]); return origKill ? origKill(x, y) : undefined; };
  const origSet = st.setTile.bind(st);
  st.setTile = (x, y, t, fx, fy) => { if (x === px && y === py) log.push(['setTile', x, y, t]); return origSet(x, y, t, fx, fy); };
  // 追踪株格 checkAlch 裁决:挂 WorldEvolution/LiquidSim 不可行 → 改挂 Game 的私有钩不可达;
  // 直接观察状态转移即可
  const pi = st.idx(px, py);
  const states = [];
  states.push({ t: 'init', sheet: sheetOf(st.type[pi]), liquid: st.liquid[pi], lt: st.liquidType[pi] });
  // 岩浆 10 入株格,正规入列
  st.liquidType[pi] = 2; st.liquid[pi] = 10;
  g.liquid?.addWater?.(px, py);
  states.push({ t: 'poured', sheet: sheetOf(st.type[pi]), liquid: st.liquid[pi] });
  // 手动单步 sim(最多 300 拍),株亡即停
  let steps = 0;
  for (; steps < 300; steps++) {
    if (g.liquid?.updateLiquid) g.liquid.updateLiquid();
    else if (g.liquid?.step) g.liquid.step();
    const alive = sheetOf(st.type[pi]) === 83 || sheetOf(st.type[pi]) === 84;
    if (steps < 6 || !alive) states.push({ t: 'step' + steps, sheet: sheetOf(st.type[pi]), liquid: st.liquid[pi], type0: st.type[pi] });
    if (!alive) { steps++; break; }
  }
  states.push({ t: 'final', sheet: sheetOf(st.type[pi]), liquid: st.liquid[pi], rawType: st.type[pi], fx: st.frameX[pi] });
  st.setTile = origSet;
  return { garden, states: states.slice(0, 20), log: log.slice(0, 20), steps };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
