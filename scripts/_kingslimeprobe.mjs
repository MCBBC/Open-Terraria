// 史莱姆王白天召唤验证：正午召唤 → Boss 存活不被日出剔除剔除 → 移动/AI 活动
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5; // 强制正午
  // 地表清观测台
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const py = gy - 1;
  for (let dx = -90; dx <= 90; dx++) for (let dy = -8; dy <= 0; dy++) st.setTile(px0 + dx, py + dy, 0);
  for (let dx = -90; dx <= 90; dx++) st.setTile(px0 + dx, py + 1, 2);
  g.player.x = px0 * 16; g.player.y = (py - 3) * 16;
  // 召唤
  g.summonBoss('king_slime');
  if (!g.boss) return { boss: false };
  const ks = g.boss;
  const spawnPos = { x: ks.x, y: ks.y };
  // 步进 30 秒游戏时间（正午持续），期间保命
  for (let i = 0; i < 60 * 30; i++) {
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
    g.fixedUpdate(1 / 60);
  }
  const stillAlive = !ks.dead && g.boss === ks;
  const moved = Math.hypot(ks.x - spawnPos.x, ks.y - spawnPos.y);
  return {
    boss: true, id: ks.vanillaId, name: ks.vanilla?.name,
    stillAlive, moved: Math.round(moved),
    isDay: g.world.clock.isDay,
  };
});
console.log(JSON.stringify(out, null, 1));
if (!out.boss) {
  check('召唤出史莱姆王', false);
} else {
  check('召唤出史莱姆王（NPC 50）', out.id === 50, `${out.name}`);
  check('白天存活（不被日出剔除）', out.stillAlive, `isDay=${out.isDay}`);
  check('AI 活动（位移>0）', out.moved > 20, `moved=${out.moved}px`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
