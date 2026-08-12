// 噬魂怪族（AI_005 蜂群核）验证：追击 + 速度档(≤4) + 摆动盘旋
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  window.__swSetPool?.([6]); // 确定性：只出噬魂怪（aiStyle 5）
  g.world.clock.timeOfDay = 0.9;
  const st = g.world.store;
  const ty = Math.floor(g.world.rockLevel) + 30;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = ty;
  while (gy < st.h - 20 && !st.isSolid(px0, gy)) gy++;
  const py0 = gy - 4;
  for (let dy = -12; dy <= 2; dy++) for (let dx = -30; dx <= 30; dx++) {
    st.setTile(px0 + dx, py0 + dy, dy === 2 ? 2 : 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  g.player.x = (px0 + 10) * 16; g.player.y = (py0 - 4) * 16;
  for (let i = 0; i < 2000; i++) g.fixedUpdate(1 / 60);
  const e = g.entities.enemies.find((x) => x.vanilla?.aiStyle === 5 && !x.dead);
  if (!e) return { e: 0 };
  e.x = (px0 - 14) * 16; e.y = (py0 - 5) * 16; e.vx = 0; e.vy = 0;
  const t0 = { x: e.x, y: e.y };
  let maxSpd = 0, minVy = 0, maxVy = 0;
  for (let i = 0; i < 300; i++) {
    g.fixedUpdate(1 / 60);
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
    maxSpd = Math.max(maxSpd, Math.hypot(e.vx, e.vy));
    minVy = Math.min(minVy, e.vy);
    maxVy = Math.max(maxVy, e.vy);
  }
  return {
    e: 1, name: e.vanilla.name,
    moved: Math.hypot(e.x - t0.x, e.y - t0.y) | 0,
    maxSpd: +maxSpd.toFixed(2),
    vySwing: +(maxVy - minVy).toFixed(2), // 摆动项会让 vy 上下起伏
    dead: e.dead,
  };
});
console.log(JSON.stringify(out));
if (!out.e) {
  check('生成出噬魂怪', false);
} else {
  check('生成出噬魂怪', true, out.name);
  check('追击位移', out.moved > 100, `moved=${out.moved}px`);
  check('速度档 ≤4.5（eater 4/0.02）', out.maxSpd <= 4.5, `maxSpd=${out.maxSpd}`);
  check('摆动盘旋（vy 有起伏）', out.vySwing > 1.5, `vySwing=${out.vySwing}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
