// BJ-chest-sparkle 探针 v4：目视取证终版——金箱/木箱并排,火把照明,关欢迎模态,
// 等 43 尘活跃时截图;再截 __SW_SHINE_OFF 对照帧。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = '/tmp/chest-sparkle';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1024, height: 640 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5256') + '/?play=small&tp=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));
try {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, .btn, [class*="button"]')];
    const b = btns.find((x) => /我已知晓|知道了|OK|确定/.test(x.textContent ?? ''));
    b?.click();
  });
} catch {}
await new Promise((r) => setTimeout(r, 600));
const setup = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const TBK = g.tileByKey;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  let gy = py;
  for (; gy < py + 80; gy++) { if (TILE_DEFS[st.type[st.idx(px, gy)]]?.solid) break; }
  const groundY = gy, baseY = groundY - 1;
  for (let x = px - 20; x <= px + 20; x++) for (let y = baseY - 10; y <= baseY; y++) st.setTile(x, y, 0);
  for (let x = px - 20; x <= px + 20; x++) st.setTile(x, groundY, TBK['dirt'] ?? 1, 0, 0);
  const put = (x, y, id, fx, fy) => st.setTile(x, y, id, fx, fy);
  const chest = TBK['chest'], torch = TBK['torch'];
  const ax = px - 5, bx = px + 4;   // 金箱(36) / 木箱(0) 并排
  put(ax, baseY - 1, chest, 36, 0); put(ax + 1, baseY - 1, chest, 54, 0);
  put(ax, baseY, chest, 36, 18); put(ax + 1, baseY, chest, 54, 18);
  put(bx, baseY - 1, chest, 0, 0); put(bx + 1, baseY - 1, chest, 18, 0);
  put(bx, baseY, chest, 0, 18); put(bx + 1, baseY, chest, 18, 18);
  put(ax - 2, baseY, torch, 0, 0); put(bx + 3, baseY, torch, 0, 0);
  g.player.x = (px) * 16; g.player.y = (groundY - 4) * 16; g.player.vy = 0;
  g.camera.x = px * 16; g.camera.y = (baseY - 2) * 16;
  window.__shot = { ax, bx, baseY };
  return { ax, bx, baseY, lightGold: g.lighting.lightAt(ax, baseY - 1), lightWood: g.lighting.lightAt(bx, baseY - 1) };
});
console.log('SETUP', JSON.stringify(setup));
fs.mkdirSync(OUT, { recursive: true });
// 等金箱 bbox 内出现活跃 43 尘 → 截"on"帧×4
await page.evaluate(async () => {
  const g = window.__swGame;
  const S = window.__shot;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 600; i++) {
    let hit = false;
    for (const d of g.vanillaDust.pool) {
      if (d.active && d.type === 43 && Math.abs(d.x - (S.ax * 16 + 16)) < 18 && Math.abs(d.y - (S.baseY * 16)) < 20) { hit = true; break; }
    }
    if (hit) break;
    await wait(50);
  }
});
for (let i = 0; i < 4; i++) {
  await page.screenshot({ path: `${OUT}/duel-on-${i}.png` });
  await new Promise((r) => setTimeout(r, 250));
}
// 43 尘活跃清单（归属）
const live = await page.evaluate(() => {
  const g = window.__swGame;
  const S = window.__shot;
  const out = [];
  for (const d of g.vanillaDust.pool) if (d.active && d.type === 43) {
    const inGold = Math.abs(d.x - (S.ax * 16 + 16)) < 24, inWood = Math.abs(d.x - (S.bx * 16 + 16)) < 24;
    out.push({ x: Math.round(d.x), y: Math.round(d.y), scale: +d.scale.toFixed(2), inGold, inWood });
  }
  return out;
});
console.log('LIVE43', JSON.stringify(live));
await page.evaluate(() => { globalThis.__SW_SHINE_OFF = true; });
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/duel-shineoff.png` });
await page.evaluate(() => { globalThis.__SW_SHINE_OFF = false; });
console.log('ERRORS', JSON.stringify(errors.slice(0, 3)));
await browser.close();
