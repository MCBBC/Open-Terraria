import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/?play=small&torch=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2500));
const res = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const T = g.tileByKey ? 12 : 12; // T.TORCH=12
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  // 展示台：清一块区域 + 石板，摆四种锚定火把
  const x0 = px + 8;
  for (let x = x0; x < x0 + 8; x++) for (let y = py - 4; y <= py; y++) { st.setTile(x, y, 0); st.setWall(x, y, 0); }
  for (let x = x0; x < x0 + 8; x++) st.setTile(x, py, 2); // 石地板
  // 1 底锚
  st.setTile(x0 + 1, py - 1, T, 0, 0);
  // 2 左锚（火把右侧无支撑，仅左邻实心块）
  st.setTile(x0 + 3, py - 2, 2);
  st.setTile(x0 + 4, py - 2, T, 22, 0);
  // 3 右锚
  st.setTile(x0 + 6, py - 3, 2);
  st.setTile(x0 + 5, py - 3, T, 44, 0);
  // 4 墙锚（上方空气 + 背景墙）
  st.setWall(x0 + 1, py - 3, 1);
  st.setTile(x0 + 1, py - 2, T, 0, 0);
  return { x0, py };
});
await new Promise((r) => setTimeout(r, 1200));
// 相机对准展示区
await page.evaluate((o) => {
  const g = window.__swGame;
  g.camera.x = (o.x0 + 3) * 16; g.camera.y = (o.py - 1) * 16;
}, res);
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: 'shots/torch-anchors.png' });
// 支撑破坏：挖掉左锚火把的左块 → 火把应消失
const after = await page.evaluate((o) => {
  const g = window.__swGame;
  const st = g.world.store;
  st.setTile(o.x0 + 3, o.py - 2, 0); // 挖掉左锚支撑
  return new Promise((resolve) => setTimeout(() => {
    resolve({ torchGone: st.get(o.x0 + 4, o.py - 2) !== 12, drops: g.entities.drops.length });
  }, 300));
}, res);
console.log(JSON.stringify({ after, errors: errors.slice(0, 3) }, null, 2));
await browser.close();
