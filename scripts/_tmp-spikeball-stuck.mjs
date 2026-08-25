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
  const T = (x, y) => (x >= 0 && y >= 0 && x < st.w && y < st.h) ? (st.isActive(x, y) ? st.type[st.idx(x, y)] : -1) : -9;
  // 校验地牢位置
  const dungeon = { x: g.world.dungeonX, y: g.world.dungeonY };
  // 在报告卡点生成刺球(报告实体 x=51543,y=10848 → tile (3221.4,678))
  const e = await window.__swFlow.spawnVanillaEnemy(72, 51543, 10848);
  if (!e) return { bail: 'spawn failed' };
  const live = () => [...(g.enemies() ?? [])].find((x) => x.id === e.id);
  // 1200 tick 浸泡:每 10 tick 采样;统计连续零位移窗口(≥30 tick 视为楔死)
  const trace = [];
  let frozen = 0, maxFrozen = 0, lastX = 0, lastY = 0;
  for (let t = 0; t < 1200; t++) {
    await new Promise((r2) => setTimeout(r2, 16));
    const s = live();
    if (!s) continue;
    if (Math.abs(s.x - lastX) < 0.5 && Math.abs(s.y - lastY) < 0.5) frozen++;
    else { frozen = 0; maxFrozen = Math.max(maxFrozen, frozen); }
    lastX = s.x; lastY = s.y;
    if (t % 60 === 0) trace.push({ t, x: Math.round(s.x), y: Math.round(s.y) });
  }
  const s2 = live();
  // 地形 ASCII(最终卡点周边;#=实块 .=空)
  const cx = s2 ? Math.round(s2.x / 16) : -1, cy = s2 ? Math.round(s2.y / 16) : -1;
  let map = '';
  for (let y = cy - 11; y <= cy + 11; y++) {
    let line = '';
    for (let x = cx - 13; x <= cx + 13; x++) {
      const t = T(x, y);
      line += t === -9 ? '?' : t === -1 ? '.' : (t >= 41 && t <= 44) ? 'D' : '#';
    }
    map += line + '\n';
  }
  // 球最终位置标记
  const s2 = live();
  const bx = s2 ? Math.round(s2.x / 16) : -1, by = s2 ? Math.round(s2.y / 16) : -1;
  return { dungeon, trace, map, ballTile: { bx, by }, active: s2 ? s2.hp > 0 : false };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
