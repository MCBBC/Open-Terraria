// BJ-chest-sparkle 探针 v3：
// ① 真实生成世界全宝箱 frameX 普查（worldgen 金箱是否 frameX 36+ → sparkle 资格）
// ② tileShine2 ×1.6 静态提亮 A/B（__SW_SHINE_OFF）——金箱区域像素差
// ③ 模态关屏后 sparkle 截图（目视）
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
// 关欢迎模态
try {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => /我已知晓|知道了|OK|确定/.test(x.textContent ?? ''));
    b?.click();
  });
} catch {}
await new Promise((r) => setTimeout(r, 800));

// ① 全世界宝箱 frameX 普查（sheet 21/441/467/468）
const census = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const dist = { s21: {}, s441: {}, s467: {}, s468: {} };
  const key = (o, v) => { o[v] = (o[v] ?? 0) + 1; };
  for (let y = 0; y < st.h; y += 1) {
    for (let x = 0; x < st.w; x += 1) {
      const i = st.idx(x, y);
      if (!st.hasTile(x, y)) continue;
      const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
      if (sheet === 21) key(dist.s21, st.frameX[i]);
      else if (sheet === 441) key(dist.s441, st.frameX[i]);
      else if (sheet === 467) key(dist.s467, st.frameX[i]);
      else if (sheet === 468) key(dist.s468, st.frameX[i]);
    }
  }
  return { s21: dist.s21, s441: dist.s441, s467: dist.s467, s468: dist.s468,
    s21styles: Object.fromEntries(Object.entries(dist.s21).map(([k, v]) => [Math.floor(Number(k) / 36), v])),
    s467styles: Object.fromEntries(Object.entries(dist.s467).map(([k, v]) => [Math.floor(Number(k) / 36), v])) };
});
console.log('CENSUS', JSON.stringify(census));

// ② tileShine2 A/B：找世界第一个金箱（21 style1, frameX36），挪玩家过去，截 A/B
const ab = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  // 找第一个 frameX===36 的 21 箱
  let found = null;
  outer: for (let y = 40; y < st.h - 40; y++) {
    for (let x = 40; x < st.w - 40; x++) {
      const i = st.idx(x, y);
      if (st.hasTile(x, y) && (TILE_DEFS[st.type[i]]?.vanilla?.sheet === 21) && st.frameX[i] === 36) { found = { x, y }; break outer; }
    }
  }
  if (!found) return { fail: 'no-gold-chest' };
  // 火把照明
  const TBK = g.tileByKey;
  st.setTile(found.x + 3, found.y + 1, TBK['torch'] ?? 4, 0, 0);
  st.setTile(found.x - 2, found.y + 1, TBK['torch'] ?? 4, 0, 0);
  g.player.x = (found.x + 1) * 16; g.player.y = (found.y - 2) * 16;
  g.player.vy = 0;
  g.camera.x = (found.x + 1) * 16; g.camera.y = found.y * 16;
  g.paused = false;
  await wait(1500);   // 等光照/底图/shine 重烘
  window.__chestAB = found;
  return { found, light: g.lighting.lightAt(found.x, found.y) };
});
console.log('AB-SETUP', JSON.stringify(ab));
if (ab.found) {
  fs.mkdirSync(OUT, { recursive: true });
  // 等待一枚 43 尘出现在箱附近再截"闪光"帧
  await page.evaluate(async () => {
    const g = window.__swGame;
    const S = window.__chestAB;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 400; i++) {
      let hit = false;
      for (const d of g.vanillaDust.pool) {
        if (d.active && d.type === 43 && Math.abs(d.x - (S.x * 16 + 16)) < 20 && Math.abs(d.y - (S.y * 16 + 8)) < 20) { hit = true; break; }
      }
      if (hit) break;
      await wait(50);
    }
    await wait(120);   // 等尘长到可见 scale
  });
  await page.screenshot({ path: `${OUT}/gold-chest-sparkle.png` });
  // A/B：shine off/on 各 3 帧取均值像素差（箱体区域）
  const region = await page.evaluate(() => {
    const g = window.__swGame;
    const S = window.__chestAB;
    const [sx, sy] = g.camera.worldToScreen(S.x * 16, S.y * 16);
    return { sx: Math.round(sx), sy: Math.round(sy) };
  });
  const grab = async (tag) => {
    const vals = [];
    for (let i = 0; i < 3; i++) {
      const shot = `${OUT}/ab-${tag}-${i}.png`;
      await page.screenshot({ path: shot });
      vals.push(shot);
      await new Promise((r) => setTimeout(r, 120));
    }
    return vals;
  };
  await page.evaluate(() => { globalThis.__SW_SHINE_OFF = true; });
  await new Promise((r) => setTimeout(r, 300));
  const offShots = await grab('off');
  await page.evaluate(() => { globalThis.__SW_SHINE_OFF = false; });
  await new Promise((r) => setTimeout(r, 300));
  const onShots = await grab('on');
  console.log('AB-SHOTS', JSON.stringify({ region, offShots, onShots }));
}
console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
await browser.close();
