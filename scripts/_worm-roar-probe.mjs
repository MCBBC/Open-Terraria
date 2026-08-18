// 骨蛇接近咆哮探针:地狱生成骨蛇头(39),断言周期性 roar 播放(间隔10-20t)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  // 传送地狱
  const hx = Math.floor(g.player.cx / 16);
  for (let y = st.h - 60; y > 10; y--) if (st.flags[st.idx(hx, y)]) {
    // 清 5x5 空腔
    for (let dx = -2; dx <= 2; dx++) for (let dy = -4; dy <= 0; dy++) st.setTile(hx + dx, y + dy, 0, 0, 0);
    g.player.x = hx * 16 + 8; g.player.y = (y - 3) * 16;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    return { x: hx, y: y - 3 };
  }
  return null;
});
console.log('地狱就位:', JSON.stringify(setup));
const out = await page.evaluate((pos) => {
  const g = window.__swGame;
  // 包装 sfx 记录
  const audio = g.audio ?? g.sfx;
  const rec = [];
  const orig = g.playSfx.bind(g);
  let patched = false;
  if (typeof orig === 'function') {
    g.playSfx = (name, vol, x, y) => { rec.push({ name, t: performance.now() }); return orig(name, vol, x, y); };
    patched = true;
  }
  // 直接生成骨蛇头(F6 面板同源 debugSpawnNpc)
  g.debugSpawnNpc(39, 1, false);
  return new Promise((resolve) => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      if (performance.now() - t0 > 4000) {
        clearInterval(iv);
        g.playSfx = orig;
        const serpents = g.entities.enemies.filter((e) => !e.dead && (e.vanillaId === 39 || e.vanillaId === 40 || e.vanillaId === 41));
        resolve({ patched, n39: serpents.length, sounds: rec.slice(0, 12), serp: serpents.slice(0, 2).map((e) => ({ id: e.vanillaId, x: Math.round(e.x), d: Math.round(e.digSndDelay ?? -1) })) });
      }
    }, 200);
  });
}, setup);
console.log(JSON.stringify(out, null, 1));
console.log('errors:', errors.length ? errors.slice(0, 2).join('|').slice(0, 150) : 0);
await browser.close();
