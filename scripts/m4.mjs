// M4 测试：液体流动 + 宝箱打开 + NPC 入住
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));

// ---- 1) 液体模拟：构造一个悬空水块，激活后应下落扩散 ----
const liquid = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16) + 12;
  // 先挖出 9×4 的空腔再放平台和水，保证可流动
  for (let dx = -4; dx <= 4; dx++) {
    for (let dy = -1; dy <= 2; dy++) st.setTile(px + dx, py + dy, 0);
    st.setTile(px + dx, py + 3, 2); // 石平台
  }
  st.setLiquid(px, py, 255, 1); // 平台上方一格满水
  g.liquid.activateRegion(px - 4, py - 1, px + 4, py + 4);
  const before = [];
  for (let y = py; y <= py + 4; y++) before.push(st.liquid[st.idx(px, y)]);
  for (let i = 0; i < 40; i++) g.liquid.step();
  const after = [];
  for (let y = py; y <= py + 4; y++) after.push(st.liquid[st.idx(px, y)]);
  const spread = [];
  for (let dx = -4; dx <= 4; dx++) spread.push(st.liquid[st.idx(px + dx, py + 2)]);
  return { before, after, spread };
});
console.log('LIQUID:', JSON.stringify(liquid)); // 期望 before[0]=255，after 源头减少、spread 有横向扩散

// ---- 2) 宝箱：传送到 chests[0]，右键打开 ----
const chest = await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.world.chests[0];
  if (!c) return null;
  g.player.x = (c.x - 2) * 16;
  g.player.y = (c.y - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
  return { x: c.x, y: c.y };
});
if (chest) {
  await new Promise((r) => setTimeout(r, 800));
  const aim = await page.evaluate((c) => {
    try {
      const g = window.__swGame;
      const [sx, sy] = g.camera.worldToScreen(c.x * 16 + 8, c.y * 16 + 8);
      return { sx: Math.round(sx), sy: Math.round(sy) };
    } catch (e) { return { err: String(e) }; }
  }, chest);
  if (aim.err || !Number.isFinite(aim.sx)) {
    console.log('CHEST AIM FAILED:', JSON.stringify(aim));
  } else {
    console.log('CHEST AIM:', JSON.stringify(aim));
  }
  if (!aim.err && Number.isFinite(aim.sx)) {
    await page.mouse.move(aim.sx, aim.sy);
    await page.mouse.down({ button: 'right' });
    await new Promise((r) => setTimeout(r, 50));
    await page.mouse.up({ button: 'right' });
    await new Promise((r) => setTimeout(r, 500));
    const chestUI = await page.evaluate(() => {
      const panels = Array.from(document.querySelectorAll('.sw-panel'));
      const chestPanel = panels.find((p) => p.textContent?.includes('宝箱'));
      return { open: !!chestPanel && chestPanel.style.display !== 'none', uiBlocking: window.__swGame.input.uiBlocking };
    });
    console.log('CHEST UI:', JSON.stringify(chestUI));
    // 关闭
    await page.keyboard.press('KeyE');
    await page.keyboard.press('KeyE');
  }
} else {
  console.log('CHEST: none in world');
}

// ---- 3) NPC 入住：世界自带小屋（门+火把），等 housing 检测 ----
await new Promise((r) => setTimeout(r, 7000));
const npc = await page.evaluate(() => {
  const g = window.__swGame;
  return { npcs: g.entities.npcs.length, guideSpawned: g.guideSpawned };
});
console.log('NPC:', JSON.stringify(npc));

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'NO ERRORS');
await browser.close();
