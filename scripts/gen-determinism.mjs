// 阶段2 验证:同 seed 二次生成逐 tile 一致(RNG 契约)+ 三种尺寸可生成
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'domcontentloaded', timeout:60000});
const out = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const hash = (st) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < st.type.length; i += 7) {
      h = Math.imul(h ^ st.type[i], 16777619);
      h = Math.imul(h ^ st.liquid[i], 16777619);
    }
    return h >>> 0;
  };
  const results = {};
  // 确定性
  const a = await mod.generateWorld({ width: 4200, height: 1200, seedText: 'det' });
  const b = await mod.generateWorld({ width: 4200, height: 1200, seedText: 'det' });
  results.deterministic = hash(a.store) === hash(b.store);
  // 三尺寸
  for (const [w, h] of [[4200, 1200], [6400, 1800], [8400, 2400]]) {
    const t0 = Date.now();
    try {
      const wld = await mod.generateWorld({ width: w, height: h, seedText: 'size' });
      const st = wld.store;
      let bad = 0, water = 0;
      for (let i = 0; i < st.type.length; i += 11) { if (st.liquid[i]) water++; }
      results[`${w}x${h}`] = { ms: Date.now() - t0, spawn: [wld.spawnX, wld.spawnY], waterSample: water, err: null };
    } catch (e) {
      results[`${w}x${h}`] = { ms: Date.now() - t0, err: String(e) };
    }
  }
  // 经典回退开关
  try {
    const c = await mod.generateWorld({ width: 4200, height: 1200, seedText: 'classic', lgcTerrain: false });
    results.classicFallback = { ok: c.store.type.length === 4200 * 1200 };
  } catch (e) { results.classicFallback = { err: String(e) }; }
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
