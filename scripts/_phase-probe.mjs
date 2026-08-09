// 穿墙复现:生成噬魂怪(v_6)/猩红噬魂怪(v_173)/恶魔眼(ai2)/蝙蝠(ai14),
// 放在厚墙旁追击玩家,600 tick 后统计"中心点位于实心格内"的怪
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('input', { timeout: 30000 });
await page.type('input', 'phase1');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, { timeout: 300000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player;
  // 找玩家附近一片开阔地:玩家左右 10 格内放怪
  const px = Math.floor(p.cx / 16), py = Math.floor((p.y + p.h) / 16);
  // 玩家脚下铺平 40 格 + 上方 10 格清空,左右两端立 8 格厚墙
  for (let x = px - 20; x <= px + 20; x++) {
    st.setTile(x, py + 1, st.type[st.idx(px, py + 1)] || 1, 0, 0);
    for (let y = py - 12; y <= py; y++) st.setTile(x, y, 0);
  }
  for (let y = py - 12; y <= py + 1; y++) {
    for (let x = px - 24; x <= px - 21; x++) st.setTile(x, y, 1);
    for (let x = px + 21; x <= px + 24; x++) st.setTile(x, y, 1);
  }
  const ids = [6, 173, 191, 194, 158, 49, 93];
  const spawned = [];
  for (let k = 0; k < ids.length; k++) {
    const x = (px - 15 + k * 5) * 16;
    const e = g.spawnEnemy('v_' + ids[k], x, (py - 6) * 16);
    if (e) spawned.push({ id: ids[k], x0: Math.floor(e.cx / 16), key: e.key, ai: e.vanilla?.aiStyle });
  }
  g.enemySpawnEnabled = false;
  // 跑 600 tick(约 10 秒)
  for (let s = 0; s < 20; s++) { await sleep(500); }
  const report = g.entities.enemies.map(e => {
    const tx = Math.floor(e.cx / 16), ty = Math.floor(e.cy / 16);
    const inside = st.inBounds(tx, ty) && st.flags[st.idx(tx, ty)] && st.type[st.idx(tx, ty)] === 1;
    return { key: e.key, id: e.vanillaId, x: tx, y: ty, insideWall: inside, dead: e.dead };
  });
  return { spawned, report };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
