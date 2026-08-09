// 飘浮眼（AI_002 原版核）验证：夜间追击（X 收敛到 ±4 档）/ 白天向上逃离
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  window.__swSetPool?.([2]); // 确定性：只出恶魔眼（aiStyle 2）
  g.world.clock.timeOfDay = 0.9; // 夜
  const st = g.world.store;
  // 空中观测台
  const ty = Math.floor(g.world.rockLevel) + 30;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = ty;
  while (gy < st.h - 20 && !st.isSolid(px0, gy)) gy++;
  const py0 = gy - 4;
  for (let dy = -12; dy <= 2; dy++) for (let dx = -30; dx <= 30; dx++) {
    st.setTile(px0 + dx, py0 + dy, dy === 2 ? 2 : 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  g.player.x = (px0 + 12) * 16; g.player.y = (py0 - 4) * 16;
  for (let i = 0; i < 2000; i++) g.fixedUpdate(1 / 60);
  const eye = g.entities.enemies.find((e) => e.vanilla?.aiStyle === 2 && !e.dead);
  if (!eye) return { eye: 0 };
  // 传进观测台（生成环带距离方差会导致位移断言摆动）
  eye.x = (px0 - 12) * 16; eye.y = (py0 - 5) * 16; eye.vx = 0; eye.vy = 0;
  // 夜间追击：观测 240 tick，采样 vx 最大值与位移
  const t0 = { x: eye.x, y: eye.y };
  let maxVx = 0;
  for (let i = 0; i < 240; i++) {
    g.fixedUpdate(1 / 60);
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
    maxVx = Math.max(maxVx, Math.abs(eye.vx));
  }
  const chase = { moved: Math.hypot(eye.x - t0.x, eye.y - t0.y) | 0, maxVx: +maxVx.toFixed(2) };
  // 白天逃离：切昼，观测 vy 向上
  g.world.clock.timeOfDay = 0.5;
  const y0 = eye.y;
  let minVy = 0;
  for (let i = 0; i < 180; i++) {
    g.fixedUpdate(1 / 60);
    if (eye.dead) break;
    minVy = Math.min(minVy, eye.vy);
  }
  return { eye: 1, name: eye.vanilla.name, chase, dayFlee: { dy: (eye.y - y0) | 0, minVy: +minVy.toFixed(2), dead: eye.dead } };
});
console.log(JSON.stringify(out));
if (!out.eye) {
  check('生成出飘浮眼', false);
} else {
  check('生成出飘浮眼', true, out.name);
  check('夜间追击位移（抵达玩家附近）', out.chase.moved > 60, `moved=${out.chase.moved}px`);
  check('追击速度收敛到 ±4 档', out.chase.maxVx > 2 && out.chase.maxVx <= 4.1, `maxVx=${out.chase.maxVx}`);
  check('白天向上逃离', out.dayFlee.dy < -20 || out.dayFlee.dead, `dy=${out.dayFlee.dy}px minVy=${out.dayFlee.minVy}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
