// 群系/水域/小动物生成验证：腐化出噬魂怪、水出鲨鱼水母、地表出原版小动物
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('select', { timeout: 30000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// 场景 A：把出生点地表改成腐化草地 → 应生成噬魂怪(ai5)/吞噬怪(ai6)
const corruption = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const keys = window.__swTiles;
  const cg = keys['v_23_corrupt_grass_block'];
  for (let dx = -110; dx <= 110; dx++) {
    st.setTile(px0 + dx, gy, cg);
    st.setTile(px0 + dx, gy + 1, keys['dirt']);
  }
  g.player.x = px0 * 16; g.player.y = (gy - 4) * 16;
  g.world.timeOfDay = 0.5; // 白天（排除夜间怪干扰）
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    g.fixedUpdate(1 / 60);
    for (const e of g.entities.enemies) {
      if (e.vanillaId === 6 || e.vanillaId === 7 || e.vanillaId === 32) seen.add(e.vanillaId);
    }
  }
  return [...seen];
});
check('腐化之地生成噬魂怪/吞噬怪', corruption.length > 0, JSON.stringify(corruption));

// 场景 B：水下 → 水母/鲨鱼
const water = await page.evaluate(() => {
  const g = window.__swGame;
  window.__swSetPool?.(null);
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  // 造一个深水池（40 宽 × 15 深）
  for (let dy = -15; dy <= 0; dy++) for (let dx = -100; dx <= 100; dx++) {
    const x = px0 + dx, y = gy + dy;
    st.setTile(x, y, dy === 0 ? 2 : 0);
    if (dy < 0) st.setLiquid(x, y, 255, 1);
  }
  g.player.x = px0 * 16; g.player.y = (gy - 16) * 16;
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    g.fixedUpdate(1 / 60);
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
    for (const e of g.entities.enemies) {
      if ([63, 64, 65, 58, 67, 102, 221].includes(e.vanillaId)) seen.add(e.vanillaId);
    }
  }
  return [...seen];
});
check('水域生成水母/鲨鱼等水生怪', water.length > 0, JSON.stringify(water));

// 场景 C：白天地表 → 原版小动物（兔/鸟/松鼠/鼠/蚱蜢）
const critters = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  for (let dx = -40; dx <= 40; dx++) { st.setTile(px0 + dx, gy, 1); st.setTile(px0 + dx, gy + 1, 1); }
  g.world.timeOfDay = 0.5;
  g.player.x = px0 * 16; g.player.y = (gy - 4) * 16;
  const seen = new Set();
  for (let i = 0; i < 6000; i++) {
    g.fixedUpdate(1 / 60);
    for (const c of g.entities.critters) {
      if (c.vanillaId) seen.add(c.vanillaId);
    }
  }
  const names = {};
  for (const id of seen) names[id] = window.__swGame.entities.critters.find((c) => c.vanillaId === id)?.vanilla?.name;
  return { ids: [...seen], names };
});
const vCritters = critters.ids.filter((id) => [46, 303, 74, 299, 300, 377, 357, 356].includes(id));
check('白天地表生成原版小动物', vCritters.length > 0, JSON.stringify(critters.names));

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
