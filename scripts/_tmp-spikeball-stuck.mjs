// 一次性诊断:刺球(vid 72)在种子 12345 世界 (3221,678) 卡死复现(审完即删)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  const ready = await page.evaluate(() => ({
    menu: !!document.querySelector('.sw-title-menu'),
    splashUp: !!document.querySelector('#sw-splash'),
  }));
  if (ready.menu && !ready.splashUp) break;
  await new Promise((r) => setTimeout(r, 100));
}
// 同种子生成世界(用户世界:种子 12345, 4200×1200)
await page.evaluate(() => window.__swFlow.newWorld('12345', 4200, 1200));
for (let i = 0; i < 90 && !(await page.evaluate(() => !!window.__swGame?.world?.store?.w)); i++) {
  await new Promise((r) => setTimeout(r, 1000));
}
const inWorld = await page.evaluate(() => !!window.__swGame?.world?.store?.w);
console.log('inWorld:', inWorld);
if (!inWorld) { await browser.close(); process.exit(1); }

const r = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const T = (x, y) => (x >= 0 && y >= 0 && x < st.w && y < st.h) ? (st.isActive(x, y) ? st.type(x, y) : -1) : -9;
  // 校验地牢位置
  const dungeon = { x: g.world.dungeonX, y: g.world.dungeonY };
  // 在报告卡点生成刺球(报告实体 x=51543,y=10848 → tile (3221.4,678))
  const e = await window.__swFlow.spawnVanillaEnemy(72, 51543, 10848);
  if (!e) return { bail: 'spawn failed' };
  // 采样 240 tick(4s)位置/速度/ai
  const trace = [];
  for (let t = 0; t < 240; t++) {
    await new Promise((r2) => setTimeout(r2, 16));
    if (t % 20 === 0) trace.push({ t, x: Math.round(e.x), y: Math.round(e.y), vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2), ai0: e.ai0, ai1: e.ai1, facing: e.facing, dirY: e.dirY });
  }
  // 地形 ASCII(卡点周边 26×22;#=实块 . =空)
  let map = '';
  for (let y = 668; y <= 690; y++) {
    let line = '';
    for (let x = 3208; x <= 3236; x++) {
      const t = T(x, y);
      line += t === -9 ? '?' : t === -1 ? '.' : (t >= 41 && t <= 44) ? 'D' : '#';
    }
    map += line + '\n';
  }
  // 球最终位置标记
  const bx = Math.round(e.x / 16), by = Math.round(e.y / 16);
  return { dungeon, trace, map, ballTile: { bx, by }, active: e.hp > 0, despawnTimer: e.despawnTimer };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
