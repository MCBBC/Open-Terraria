// IIII220 探针F:修复后实机验证 — 火焰花 style5 收获门 昼/夜 双态
//   SW_ORIGIN=http://localhost:5277 node tools/run-diag.mjs --timeout=280000 scripts/_iii220-verify-fix.mjs
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5277';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 200000 });
await new Promise((r) => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const sheetOf = (t) => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  const m83 = TILE_BY_KEY['v_83_herbs_mature'];
  // 找 ash 平台
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
  const px = garden.x, py = garden.y;
  for (let xx = px - 1; xx <= px + 2; xx++) for (let yy = py - 3; yy < py; yy++) { const i = st.idx(xx, yy); st.liquid[i] = 0; st.liquidType[i] = 0; if (st.flags[i]) st.setTile(xx, yy, 0); }
  st.setTile(px, py, m83, 90, 0);
  // 直接驱动门:改时钟时间,调私有 isAlchemyPlantHarvestable
  const gate = (tod) => {
    g.world.clock.timeOfDay = tod;
    return g.isAlchemyPlantHarvestableForProbe?.(5, py) ?? null;
  };
  // isAlchemyPlantHarvestable 是 private → 经 prototype 调
  const proto = Object.getPrototypeOf(g);
  const fn = Object.getOwnPropertyNames(proto).includes('isAlchemyPlantHarvestable')
    ? proto.isAlchemyPlantHarvestable : null;
  const call = (tod) => fn ? fn.call(g, 5, py) : (g.world.clock.timeOfDay = tod, null);
  const res = {};
  // 设定 y:py 深度在 hell(>worldSurface) → flag=true;无雨
  g.world.weather.raining = false;
  for (const [k, tod] of Object.entries({ day_16_48: 0.7, day_14_24: 0.6, dusk_19_12: 0.8, night_19_55: 0.83, night_21_36: 0.9, dawn_05_00: 5 / 24 })) {
    g.world.clock.timeOfDay = tod;
    res[k] = fn ? !!fn.call(g, 5, py) : null;
  }
  return { garden, gateResults: res, hasFn: !!fn };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
