// 诊断:M-P1/M-P2/P-P1/H-P1/B-P1 修复冒烟——全管线生成 + 剑冢/营地/堆落点计数。
// 用法:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_gen-swordshrine-smoke.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
const out = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => BK[d.key] = i);
  const seeds = ['sw-smoke-a', 'sw-smoke-b'];
  const results = [];
  for (const seed of seeds) {
    const t0 = Date.now();
    const world = await mod.generateWorld({ width: 4200, height: 1200, seedText: seed, name: 'probe' });
    const st = world.store;
    const c = (k) => { const id = BK[k] ?? -1; let n = 0; for (let i = 0; i < st.type.length; i++) if (st.type[i] === id) n++; return n; };
    // 剑冢:真剑(187 style17 → frameX=918)/假剑(186 style15 → frameX=810)锚点 + 花墙 68 + 花藤 382
    let realSwords = 0, fakeSwords = 0, flowerWall = 0;
    const S187 = BK['v_187_decos_3x2_group_2'], S186 = BK['v_186_decos_3x2'];
    for (let i = 0; i < st.type.length; i++) {
      if (st.type[i] === S187 && st.frameX[i] === 918 && st.frameY[i] === 0) realSwords++;
      if (st.type[i] === S186 && st.frameX[i] === 810 && st.frameY[i] === 0) fakeSwords++;
      if (st.wall[i] === 68) flowerWall++;
    }
    // 剑冢竖井沙硬化壳(397 在地表线以上且近墙 68 的抽样略,仅总量校验)
    results.push({
      seed, ms: Date.now() - t0,
      realSwords, fakeSwords, flowerWall, flowerVines: c('v_382_flower_vines'),
      campsites: Math.min(c('v_215_campfires') / 6 | 0, c('v_332_gold_coin_pile') / 3 | 0),
      campfires: c('v_215_campfires'), coinPiles: c('v_332_gold_coin_pile'),
      piles186: c('v_186_decos_3x2'), piles187: c('v_187_decos_3x2'),
      smallPiles185: c('v_185_small_decos'),
      chests: world.chests ? world.chests.length : -1,
    });
  }
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('PAGE_ERRORS:', errs.length ? errs : 'none');
await browser.close();
process.exit(errs.length ? 1 : 0);
