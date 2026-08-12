// 视觉验证:生成世界 → 全屏地图全景 + 表面/丛林特写截图
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1600,height:900}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
await page.type('input', 'visual-check');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 1; }); // 2100×700
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2000));
const info = await page.evaluate(() => {
  const g = window.__swGame;
  g.renderer.fullbright = true;
  // 全景
  const fm = g.renderer.fullMap;
  fm.open = true; fm.zoom = 0.12; fm.zoomTarget = 0.12; fm.panX = 0; fm.panY = 0;
  return { jungleX: g.world.jungleX, spawnX: g.world.spawnX, spawnY: g.world.spawnY, crimson: g.world.crimson };
});
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: '/tmp/world-fullmap.png' });
// 特写:出生点 + 丛林
await page.evaluate(([sx, sy, jx]) => {
  const g = window.__swGame;
  g.renderer.fullMap.open = false;
  g.setZoom(1.4);
  g.player.x = sx * 16; g.player.y = (sy - 4) * 16;
  g.camera?.snap?.();
}, [info.spawnX, info.spawnY, info.jungleX]);
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: '/tmp/world-spawn.png' });
await page.evaluate((jx) => {
  const g = window.__swGame;
  // 丛林地表:从 jungleX 向下找地表
  const st = g.world.store;
  let y = 0; while (y < st.h && !st.flags[st.idx(jx, y)]) y++;
  g.player.x = jx * 16; g.player.y = (y - 4) * 16;
}, info.jungleX);
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: '/tmp/world-jungle.png' });
console.log(JSON.stringify({ info, errs: errs.slice(0, 3) }));
await browser.close();
