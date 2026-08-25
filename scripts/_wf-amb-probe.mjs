// 瀑布环境音探针:造瀑布→跑帧→断言 ambWf.strength>0 + 循环轨起振
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  // 造瀑布:高台水+落差
  for (let x = 30; x <= 50; x++) st.setTileSilent(x, 60, 1);
  for (let x = 32; x <= 48; x++) { st.liquid[st.idx(x, 59)] = 255; st.liquidType[st.idx(x, 59)] = 1; }
  for (let x = 30; x <= 50; x++) st.setTileSilent(x, 75, 1);
  g.player.x = 40 * 16; g.player.y = 55 * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  g.liquid.addWater(40, 59);
  return { falls: g.renderer.waterfalls.count };
});
// 跑 240 帧(瀑布发现+绘制累积+15t 环境音消费)
await page.evaluate(() => {
  const g = window.__swGame;
  let n = 0;
  const step = () => {
    g.input.mouseDown = false;
    g.fixedUpdate(1 / 60);
    if (++n < 240) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
await new Promise((r) => setTimeout(r, 4500));
const out2 = await page.evaluate(() => {
  const g = window.__swGame;
  const amb = g.renderer.waterfalls.ambienceState();
  return {
    falls: g.renderer.waterfalls.count,
    ambWf: amb.wf, ambLava: amb.lava,
    wfLoopPlaying: g.wfAmbLoops?.wf?.playing ?? null,
    lavaLoopPlaying: g.wfAmbLoops?.lava?.playing ?? null,
  };
});
console.log(JSON.stringify(out2, null, 1));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
check('瀑布被发现', out2.falls > 0, `count=${out2.falls}`);
check('环境强度累积>0', out2.ambWf.strength > 0, `strength=${out2.ambWf.strength?.toFixed(2)}`);
check('瀑布循环轨起振', out2.wfLoopPlaying === true);
check('岩浆轨未起振（无岩浆瀑布）', out2.lavaLoopPlaying === false || out2.lavaLoopPlaying === null);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
