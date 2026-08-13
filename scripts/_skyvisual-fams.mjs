// 天空视觉深化批运行时冒烟：涟漪/月塔天空层/月总死亡戏剧/稀有云/环境族（scripts/_skyvisual-probe.mjs）
// 经 tools/run-diag.mjs 运行；SW_ORIGIN 指向本会话私有静默实例。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('天空视觉');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
await page.click('[data-g=size] .sw-wc-opt');
await new Promise(r => setTimeout(r, 200));
await page.click('[data-act=create]');
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 240000 });
await new Promise(r => setTimeout(r, 2500));

const shots = {};
await page.exposeFunction('__skySnap', async (name) => {
  shots[name] = await page.screenshot({ type: 'png' });
});
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const sky = g.renderer.sky;
  const out = {};
  const st = g.world.store;
  let surfY = -1;
  for (let ty = 10; ty < g.world.h - 200; ty++) {
    if (st.inBounds(g.world.spawnX, ty) && !st.isSolid(g.world.spawnX, ty) && st.isSolid(g.world.spawnX, ty + 1)) { surfY = ty; break; }
  }
  g.player.x = g.world.spawnX * 16; g.player.y = (surfY - 3) * 16;
  g.world.clock.timeOfDay = 0.5;
  const camX = g.renderer.cam ? g.renderer.cam.x : g.player.cx;
  const camY = g.renderer.cam ? g.renderer.cam.y : g.player.cy;
  // 逐族直呼 spawn（绕过 10-120s 调度窗）：单体族 1 次、群体族 1 次
  const fams = ['birds','wyvern','airship','airballoon','eyeball','butterflies','lostkite','vulture',
    'bats','pixieposse','seagulls','slimeBalloons','gastropod','pegasus','eos','crimera','hellbats'];
  for (const f of fams) {
    sky.clearAmbience();
    try {
      sky.spawnAmbientFamily(f, camX, camY);
      out[f] = sky.ambEntities.length;
    } catch (e) { out[f] = 'ERR: ' + e.message; }
  }
  // 全族同时在场，真实渲染循环推进 2 秒（淡入/帧推进/磁吸/EOC 状态机）
  sky.clearAmbience();
  for (const f of fams) sky.spawnAmbientFamily(f, camX, camY);
  await wait(2000);
  out.totalAfter2s = sky.ambEntities.length;
  out.texKeys = [...new Set(sky.ambEntities.map(e => e.texKey))];
  out.badRows = sky.ambEntities.filter(e => !e.rows || e.rows < 1).length;
  return out;
});
console.log(JSON.stringify(res, null, 2));
console.log('PAGE_ERRORS:', JSON.stringify(errs.slice(0, 6), null, 2));
await browser.close();
process.exit(errs.length ? 1 : 0);
