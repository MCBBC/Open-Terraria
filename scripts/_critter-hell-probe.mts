// 小动物错误地点回归探针：传送到地狱跑 30s → 不应有小动物；
// 回地表跑 30s → 应有小动物且全在地表高度
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));

const out = await page.evaluate(async () => {
  const sel = document.querySelector('select');
  if (sel) { sel.selectedIndex = 0; (sel.parentElement!.querySelector('button') as HTMLButtonElement).click(); }
  const t0 = Date.now();
  while (!(window as any).__swGame?.world && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  const game = (window as any).__swGame;
  if (!game?.world) return { err: 'world not ready' };
  const w = game.world;
  const TILE = 16;
  const snapshot = () => game.entities.critters.map((c: any) => ({
    key: c.key ?? c.constructor.name,
    ty: Math.floor(c.cy / TILE),
    deep: Math.floor(c.cy / TILE) > w.rockLevel,
  }));
  // ---- 地狱 ----
  game.teleportNear(w.w >> 1, w.h - 120);
  game.entities.critters.length = 0;
  await new Promise((r) => setTimeout(r, 30000));
  const inHell = snapshot();
  // ---- 地表 ----
  game.teleportNear(w.spawnX, w.spawnY);
  game.entities.critters.length = 0;
  await new Promise((r) => setTimeout(r, 30000));
  const atSurface = snapshot();
  return {
    groundLevel: w.groundLevel, rockLevel: w.rockLevel, worldH: w.h,
    hellCritters: inHell,
    hellCount: inHell.length,
    surfaceCount: atSurface.length,
    surfaceAllShallow: atSurface.every((c: any) => c.ty <= w.groundLevel + 20),
    surfaceDeep: atSurface.filter((c: any) => c.deep),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
