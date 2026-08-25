// 视觉实证：召唤捣蛋猫 → 截取其实际渲染画面 → 与贴图帧对比定色
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 1500));
const prep = await page.evaluate(() => {
  const g = window.__swGame;
  g.setupDevMode();
  const items = window.__swItems;
  const staffKey = Object.keys(items).find((k) => /^vi_6148_/.test(k));
  if (!staffKey) return { fail: 'no staff key' };
  const inv = g.player.inv;
  inv.slots[10] = { id: items[staffKey], stack: 1 };
  inv.selected = 10;
  // 传送到地表开阔处（白天光照）
  g.player.x = g.world.spawnX * 16;
  g.player.y = (g.world.spawnY - 4) * 16;
  return { ok: true, spawnX: g.world.spawnX, spawnY: g.world.spawnY };
});
console.log(JSON.stringify(prep));
// 按住左键召唤
await page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const r = cv.getBoundingClientRect();
  cv.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1000));
// 找捣蛋猫屏幕位置并截其周边
const loc = await page.evaluate(() => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((p2) => p2.projId === 1112 && !p2.dead);
  if (!m) return null;
  const [sx, sy] = g.camera.worldToScreen(m.cx, m.cy);
  return { sx: Math.round(sx), sy: Math.round(sy), palFrame: m.palFrame };
});
console.log(JSON.stringify(loc));
if (loc) {
  const clip = { x: Math.max(0, loc.sx - 80), y: Math.max(0, loc.sy - 80), width: 160, height: 160 };
  await page.screenshot({ path: '/tmp/cattiva-live.png', clip });
  // 全屏也截一张对照
  await page.screenshot({ path: '/tmp/cattiva-live-full.png' });
}
await browser.close();
console.log('done');
