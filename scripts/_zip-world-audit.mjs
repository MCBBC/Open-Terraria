// zip 缓存下进世界自证:?play=small 进世界 → 贴图失败计数/弹幕与持械像素
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A: 清缓存全新 warm → 等完成
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5311') + '/?sw=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
await sleep(3000);
await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5311') + '/?sw=1&play=small', { waitUntil: 'domcontentloaded', timeout: 180000 });
let st = null;
for (let i = 0; i < 90; i++) {
  await sleep(3000);
  st = await page.evaluate(() => window.__swAssetCache?.state?.() ?? null).catch(() => null);
  if (st && st.done >= st.total && !st.warming) break;
}
console.log('warm:', JSON.stringify(st));
// B: 等世界就绪
let world = null;
for (let i = 0; i < 80; i++) {
  await sleep(3000);
  world = await page.evaluate(() => {
    const g = window.__swGame;
    return g && g.world && g.player ? { ready: true, px: Math.round(g.player.x) } : null;
  }).catch(() => null);
  if (world?.ready) break;
}
console.log('world:', JSON.stringify(world), 'pageerrors:', errs.slice(0, 3));
// C: 贴图健康(懒加载失败计数) + 持械铜短剑 + 一发弹幕像素
const audit = await page.evaluate(async () => {
  const g = window.__swGame;
  const atlas = window.__swAtlas;
  await new Promise((r) => setTimeout(r, 4000));   // 预载/首帧稳定
  // 铜短剑进快捷栏 + 挥击(与床探针同款注入)
  const items = window.__swItems;
  const sword = Object.keys(items).find((k) => /shortsword/.test(k));
  if (sword) g.player.inv.slots[0] = { id: items[sword], stack: 1 };
  // 发一枚箭(右键不行→直接给玩家弹幕桶塞一发朝右的 Arrow)
  try {
    const { Arrow } = await import('/src/entities/Arrow.ts');
    const a = new Arrow(g.player.cx + 20, g.player.cy, 8, 0, 9, 1, 1, 1);
    a.id = g.entities.nextId++;
    g.entities.projectiles.push(a);
  } catch (e) { void e; }
  await new Promise((r) => setTimeout(r, 2000));
  const shot = document.createElement('canvas');
  shot.width = 1280; shot.height = 800;
  shot.getContext('2d').drawImage(g.renderer.canvas, 0, 0);
  const cx = 640, cy = 400;
  const px = shot.getContext('2d').getImageData(cx - 60, cy - 60, 120, 120).data;
  let nonBg = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 10 && (px[i] + px[i + 1] + px[i + 2]) < 720) nonBg++;
  }
  return {
    failedVImages: atlas?.failedVImages?.size ?? (atlas ? -1 : 'no-handle'),
    vimages: atlas?.vimages?.size ?? -1,
    swordKey: sword ?? null,
    centerNonBgPx: nonBg,   // 中心 120² 非背景像素(玩家/持械/弹幕应有相当量)
  };
}).catch((e) => ({ err: String(e) }));
console.log('audit:', JSON.stringify(audit));
await browser.close();
