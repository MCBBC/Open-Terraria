// 单个挖洞 runner 的形状目检:实心石世界挖一条,ASCII dump
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
const out = await page.evaluate(async () => {
  const { TileStore } = await import('/src/world/TileStore.ts');
  const { RNG } = await import('/src/core/rng.ts');
  const { digTunnel } = await import('/src/world/gen/vanilla/TileRunner.ts');
  const { newGenState } = await import('/src/world/gen/vanilla/GenState.ts');
  const st = new TileStore(120, 60);
  st.type.fill(2); st.flags.fill(1);
  const gs = newGenState(120, 60);
  gs.worldSurface = 20; gs.rockLevel = 25; gs.waterLine = 40; gs.lavaLine = 50;
  const rng = new RNG(11);
  // 岩层洞穴参数:strength 12, steps 150,随机方向
  digTunnel(st, rng, 8, 30, 1, 0.1, 80, 6);
  const rows = [];
  for (let y = 0; y < 60; y++) {
    let row = '';
    for (let x = 0; x < 120; x++) {
      row += st.flags[st.idx(x, y)] ? '#' : '.';
    }
    rows.push(row);
  }
  return rows;
});
console.log(out.join('\n'));
await browser.close();
