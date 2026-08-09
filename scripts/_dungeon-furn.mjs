// 地牢陈设验证:统计地牢区内各类家具/灯具/墙饰/宝箱数量
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
const out = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const results = [];
  for (const seed of ['furn1', 'furn2']) {
    const w = await mod.generateWorld({ width: 4200, height: 1200, seedText: seed, name: 't' });
    const st = w.store;
    const K = tiles.TILE_BY_KEY;
    const counts = {};
    const keys = ['table', 'chair', 'workbench', 'candle', 'water_candle', 'chandelier', 'lantern', 'v_91_banners',
      'v_240_wall_hangings_3x3', 'v_241_catacombs', 'v_242_paintings_6x4', 'bookcase', 'grandfather_clock',
      'piano', 'dresser', 'bench', 'bathtub', 'bed', 'v_93_lamps', 'candelabra', 'v_50_books', 'v_103_bowls',
      'v_105_statue', 'v_355_alchemy_table', 'v_354_bewitching_table', 'v_136_switch', 'v_137_traps', 'platform'];
    const ids = new Map(keys.map(k => [K[k], k]));
    let wired = 0;
    for (let i = 0; i < st.type.length; i += 2) {
      const name = ids.get(st.type[i]);
      if (name && st.flags[i]) counts[name] = (counts[name] || 0) + 2;
      if ((st.wire[i] & 1) !== 0) wired += 2;
    }
    results.push({
      seed,
      counts,
      wiredTiles: wired,
      chests: w.chests.length,
      lockedChests: w.chests.filter(c => c.locked).length,
      chestsInDungeon: w.chests.filter(c => c.items.some(it => it)).length,
    });
  }
  return results;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
