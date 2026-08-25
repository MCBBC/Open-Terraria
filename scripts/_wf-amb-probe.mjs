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
  // 造瀑布:半砖行载流→唇缘溢出（发现条件:唇缘格 halfBrick+同侧液>160+上格近干+对侧开）
  for (let x = 30; x <= 50; x++) {
    st.setTileSilent(x, 60, 1);
    st.setHalfBrick(x, 60, true);             // 半砖行（水载于半砖格内）
    st.liquid[st.idx(x, 60)] = 200; st.liquidType[st.idx(x, 60)] = 1;
  }
  for (let x = 32; x <= 45; x++) { st.liquid[st.idx(x, 59)] = 255; st.liquidType[st.idx(x, 59)] = 1; }  // 源池（远离唇缘）
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
  const ambBefore = JSON.parse(JSON.stringify(g.renderer.waterfalls.ambienceState()));
  const suppress = g.sfx.suppress, tick = g.tickCount;
  g.updateWaterfallAmbience();   // 手动消费一次
  const ambAfter = g.renderer.waterfalls.ambienceState();
  return {
    falls: g.renderer.waterfalls.count,
    suppress, tick, ambAfter,
    wfLoop: g.wfAmbLoops?.wf ? { playing: g.wfAmbLoops.wf.playing, dead: g.wfAmbLoops.wf.dead } : null,
    lavaLoop: g.wfAmbLoops?.lava ? { playing: g.wfAmbLoops.lava.playing, dead: g.wfAmbLoops.lava.dead } : null,
  };
});
console.log(JSON.stringify(out2, null, 1));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
check('瀑布被发现', out2.falls > 0, `count=${out2.falls}`);
check('环境强度累积>0', out2.ambAfter.wf.strength > 0, `strength=${out2.ambAfter.wf.strength?.toFixed(2)}`);
check('瀑布循环轨句柄存活（headless 解码异步,playing 随后翻真）', out2.wfLoop !== null && !out2.wfLoop.dead, JSON.stringify(out2.wfLoop));
check('岩浆轨未创建（无岩浆瀑布）', out2.lavaLoop === null);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
