import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/?play=small&dummy=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));
const res = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const TBK = g.tileByKey;
  const DUMMY = TBK['v_378_target_dummy'];
  const px = Math.floor(g.player.cx / 16) + 8, py = Math.floor(g.player.cy / 16);
  // 放置假人 tile（2x3）+ 生成 NPC
  st.setTile(px, py, DUMMY, 0, 0); st.setTile(px + 1, py, DUMMY, 18, 0);
  st.setTile(px, py + 1, DUMMY, 0, 18); st.setTile(px + 1, py + 1, DUMMY, 18, 18);
  st.setTile(px, py + 2, DUMMY, 0, 36); st.setTile(px + 1, py + 2, DUMMY, 18, 36);
  return { px, py };
});
await new Promise((r) => setTimeout(r, 500));
const before = await page.evaluate(() => {
  const g = window.__swGame;
  return g.entities.enemies.filter((e) => e.vanillaId === 488).map((e) => ({ hp: e.hp, dead: e.dead }));
});
// 直接调 hurt 模拟攻击
const hit = await page.evaluate((o) => {
  const g = window.__swGame;
  const d = g.entities.enemies.find((e) => e.vanillaId === 488);
  if (!d) return { err: 'no dummy' };
  const ok = d.hurt(45, -1, 0, g);
  return { ok, hp: d.hp, shake: d.dummyShake, dir: d.dummyHitDir, dead: d.dead, dmgNums: g.dmgNumbers.length };
}, res);
await new Promise((r) => setTimeout(r, 700));
const after = await page.evaluate(() => {
  const g = window.__swGame;
  const d = g.entities.enemies.find((e) => e.vanillaId === 488);
  return d ? { hp: d.hp, dead: d.dead, alive: true } : { alive: false };
});
// 破坏锚 tile → 假人应消亡
const tileBreak = await page.evaluate((o) => {
  const g = window.__swGame;
  const st = g.world.store;
  const d = g.entities.enemies.find((e) => e.vanillaId === 488);
  if (!d) return { alive: false };
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) st.setTile(o.px + dx, o.py + dy, 0);
  return { alive: true };
}, res);
await new Promise((r) => setTimeout(r, 300));
const gone = await page.evaluate(() => {
  const g = window.__swGame;
  const d = g.entities.enemies.find((e) => e.vanillaId === 488);
  return { stillThere: !!d && !d.dead, markedDead: !!d && d.dead };
});
console.log(JSON.stringify({ before, hit, after, gone, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
