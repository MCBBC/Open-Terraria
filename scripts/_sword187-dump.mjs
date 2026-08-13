// 诊断:核对 186/187 内部 id 与剑冢剑帧分布(冒烟计数自相矛盾的根因排查)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
const out = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const world = await mod.generateWorld({ width: 4200, height: 1200, seedText: 'sw-smoke-b', name: 'probe' });
  const st = world.store;
  const id187 = tiles.TILE_BY_KEY['v_187_decos_3x2_group_2'];
  const id186 = tiles.TILE_BY_KEY['v_186_decos_3x2'];
  const fx187 = {}, fx186 = {};
  let n187 = 0, n186 = 0;
  for (let i = 0; i < st.type.length; i++) {
    if (st.type[i] === id187) { n187++; fx187[st.frameX[i]] = (fx187[st.frameX[i]] ?? 0) + 1; }
    if (st.type[i] === id186) { n186++; fx186[st.frameX[i]] = (fx186[st.frameX[i]] ?? 0) + 1; }
  }
  return { id187, id186, n187, n186, fx187, fx186At810: fx186[810] ?? 0, fx186At918: fx186[918] ?? 0 };
});
console.log(JSON.stringify(out, null, 1));
console.log('PAGE_ERRORS:', errs.length ? errs : 'none');
await browser.close();
