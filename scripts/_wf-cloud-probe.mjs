// 雨云水幕环境音探针:放置雨云→水幕发现→强度累积→循环轨创建
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swTiles, { timeout: 300000 });
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const CLOUD = 30 * 16; // 按 tile key 找
  // 放雨云块 (38-42, 50)
  const tid = (window.__swTiles ?? {})['v_196_rain_cloud_block'];
  if (tid === undefined) return { err: 'rain cloud tile id undefined' };
  for (let x = 38; x <= 42; x++) st.setTileSilent(x, 50, tid);
  g.player.x = 40 * 16; g.player.y = 46 * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
});
await page.evaluate(() => {
  const g = window.__swGame;
  let n = 0;
  const step = () => { g.fixedUpdate(1 / 60); if (++n < 120) requestAnimationFrame(step); };
  requestAnimationFrame(step);
});
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  g.updateWaterfallAmbience();
  const amb = g.renderer.waterfalls.ambienceState();
  const st2 = g.world.store;
  return {
    placedTile: st2.type[st2.idx(40, 50)],
    falls: g.renderer.waterfalls.count,
    strength: amb.wf.strength,
    wfLoop: g.wfAmbLoops?.wf ? { playing: g.wfAmbLoops.wf.playing, dead: g.wfAmbLoops.wf.dead } : null,
  };
});
console.log(JSON.stringify(out));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
check('雨云水幕被发现', out.falls > 0, `count=${out.falls}`);
check('雨幕强度累积>0', out.strength > 0, `strength=${out.strength?.toFixed(2)}`);
check('循环轨句柄创建', out.wfLoop !== null && !out.wfLoop.dead, JSON.stringify(out.wfLoop));
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
