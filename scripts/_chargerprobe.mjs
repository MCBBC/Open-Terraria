// 冲锋族（AI_026 独角兽核）验证：高速追击（~6 档）+ 卡墙折返 + 翻墙
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
  window.__swSetPool?.([86]); // 确定性：独角兽（aiStyle 26, hp 400）
  const st = g.world.store;
  // 地表平地观测台（独角兽是地表怪）+ 2 格墙
  const ty = Math.floor(g.world.groundLevel) + 8;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = ty;
  while (gy < st.h - 20 && !st.isSolid(px0, gy)) gy++;
  const py0 = gy - 6;
  for (let dy = -14; dy <= 0; dy++) for (let dx = -40; dx <= 40; dx++) {
    st.setTile(px0 + dx, py0 + dy, 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  for (let dx = -40; dx <= 40; dx++) st.setTile(px0 + dx, py0 + 1, 2);
  // 右侧远处 3 格高死墙（测卡墙折返）
  for (let dy = 0; dy <= 2; dy++) st.setTile(px0 + 25, py0 - dy, 2);
  g.player.x = (px0 + 10) * 16; g.player.y = (py0 - 3) * 16;
  for (let i = 0; i < 2000; i++) g.fixedUpdate(1 / 60);
  const e = g.entities.enemies.find((x) => x.vanilla?.aiStyle === 26 && !x.dead);
  if (!e) return { e: 0 };
  e.x = (px0 - 20) * 16; e.y = py0 * 16 - e.h; e.vx = 0; e.vy = 0;
  const t0 = { x: e.x };
  let maxVx = 0, flips = 0, lastFacing = e.facing;
  for (let i = 0; i < 1200; i++) {
    g.fixedUpdate(1 / 60);
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
    maxVx = Math.max(maxVx, Math.abs(e.vx));
    if (e.facing !== lastFacing) { flips++; lastFacing = e.facing; }
  }
  return {
    e: 1, name: e.vanilla.name,
    moved: (e.x - t0.x) | 0, maxVx: +maxVx.toFixed(2), flips,
    ex: (e.x / 16 - px0) | 0, dead: e.dead,
  };
});
console.log(JSON.stringify(out));
if (!out.e) {
  check('生成出冲锋族', false);
} else {
  check('生成出冲锋族', true, out.name);
  check('高速冲锋位移（|moved|>400px）', Math.abs(out.moved) > 400, `moved=${out.moved}px`);
  check('冲锋速度档 ≈6', out.maxVx > 3 && out.maxVx <= 6.2, `maxVx=${out.maxVx}`);
  check('卡墙折返（撞死墙后掉头）', out.flips > 0, `flips=${out.flips}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
