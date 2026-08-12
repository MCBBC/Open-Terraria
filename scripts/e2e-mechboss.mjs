// E2E:机械三王召唤→部件/段链生成→移动采样(接线验证)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 420000 });
await new Promise((r) => setTimeout(r, 2500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  if (!g || !g.world) return { fatal: 'no game' };
  const out = {};
  g.world.flags.hardMode = true;
  g.world.clock.timeOfDay = 0; // 夜晚
  const run = async (key, id, sampleFn) => {
    g.entities.enemies.length = 0;
    g.boss = null;
    g.summonBoss.bind(g)(key);
    await new Promise((r2) => setTimeout(r2, 4000));
    const es = g.entities.enemies;
    out[key] = {
      total: es.length,
      ids: [...new Set(es.map((e) => e.vanillaId ?? e.key))].slice(0, 12),
      bossHp: g.boss ? g.boss.hp : null,
      moved: g.boss ? Math.round(Math.hypot(g.boss.cx - g.boss.x0, 0)) : null,
      ...(sampleFn ? sampleFn(es, g) : {}),
    };
  };
  await run('skeletron_prime', 127, (es) => ({
    parts: es.filter((e) => e.vanillaId >= 128 && e.vanillaId <= 131).length,
  }));
  await run('twins', 125, (es) => ({
    retinazer: es.filter((e) => e.vanillaId === 125).length,
    spazmatism: es.filter((e) => e.vanillaId === 126).length,
  }));
  await run('destroyer', 134, (es) => ({
    segs: es.filter((e) => e.vanillaId === 135 || e.vanillaId === 136).length,
  }));
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
