// 法师族（AI_008）验证：传送跳位 + 三连弹幕（确定性池 [32] 黑暗法师）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  window.__swSetPool?.([32]); // 确定性：只出黑暗法师（aiStyle 8）
  const st = g.world.store;
  // 地下平地观测台
  const ty = Math.floor(g.world.rockLevel) + 30;
  const cx0 = Math.floor(g.player.cx / 16);
  let gy = ty;
  while (gy < st.h - 20 && !st.isSolid(cx0, gy)) gy++;
  for (let dy = -10; dy <= 6; dy++) for (let dx = -30; dx <= 30; dx++) {
    st.setTile(cx0 + dx, gy + dy, 0);
    st.liquid[st.idx(cx0 + dx, gy + dy)] = 0;
  }
  for (let dx = -30; dx <= 30; dx++) { st.setTile(cx0 + dx, gy + 6, 2); st.setTile(cx0 + dx, gy + 7, 2); }
  g.player.x = cx0 * 16; g.player.y = (gy - 3) * 16;
  for (let i = 0; i < 3000; i++) g.fixedUpdate(1 / 60);
  const casters = g.entities.enemies.filter((e) => e.vanilla?.aiStyle === 8);
  if (!casters.length) return { casters: 0 };
  const e = casters.find((c) => !c.dead) ?? casters[0];
  const before = { x: e.x, y: e.y };
  let teleports = 0, maxJump = 0;
  let projs = 0;
  const projCount = () => g.entities.projectiles.length;
  for (let i = 0; i < 700; i++) {
    if (g.player.hp < 60) g.player.hp = g.player.maxHp; // 防集火致死导致法师挂机
    g.fixedUpdate(1 / 60);
    const jump = Math.hypot(e.x - before.x, e.y - before.y);
    if (jump > 64) { teleports++; maxJump = Math.max(maxJump, jump | 0); before.x = e.x; before.y = e.y; }
    projs = Math.max(projs, projCount());
  }
  return { casters: casters.length, name: e.vanilla.name, teleports, maxJump, projsSeen: projs };
});
console.log(JSON.stringify(out));
if (out.casters === 0) {
  check('生成出法师族', false);
} else {
  check('生成出法师族', true, out.name);
  check('发生传送（>64px 跳位）', out.teleports > 0, `teleports=${out.teleports} maxJump=${out.maxJump}px`);
  check('发射弹幕（projectiles 出现）', out.projsSeen > 0, `projs=${out.projsSeen}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
