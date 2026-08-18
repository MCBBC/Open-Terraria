// spawnDrop 插桩溯源：肉山死亡时谁掉了什么（含调用栈首两帧）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const mod = await import('/src/entities/bossAI_wof.ts');
  // 岩浆格
  let lx = -1, ly = -1;
  outer: for (let y = st.h - 30; y > st.h - 120; y--) {
    for (let x = Math.floor(st.w / 2) - 100; x < Math.floor(st.w / 2) + 100; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i] && st.liquid[i] > 0) { lx = x; ly = y; break outer; }
    }
  }
  if (lx < 0) return { error: 'no lava' };
  const dollKey = Object.keys(window.__swItems).find(k => /^vi_267_/.test(k));
  const { ItemDrop } = await import('/src/entities/ItemDrop.ts');
  const drop = new ItemDrop(lx * 16 + 8, ly * 16 + 8, window.__swItems[dollKey], 1);
  g.entities.add(drop, 'drops');
  await new Promise(r => setTimeout(r, 2500));
  const wof = g.entities.enemies.find(e => !e.dead && e.vanillaId === 113);
  if (!wof) return { error: 'no wof' };
  // 插桩 spawnDrop
  const log = [];
  const orig = g.spawnDrop.bind(g);
  g.spawnDrop = function (x, y, key, n, vx, vy, style) {
    const stack = (new Error().stack || '').split('\n').slice(1, 4).map(s => s.trim().replace(/^at /, '').slice(0, 90));
    log.push({ key, n, stack });
    return orig(x, y, key, n, vx, vy, style);
  };
  wof.hurt(9999999, 10, 0, g);
  await new Promise(r => setTimeout(r, 400));
  g.spawnDrop = orig;
  return { log: log.slice(0, 30) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
