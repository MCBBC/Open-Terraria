// 蠕虫族（AI_006 多段体）验证：段链生成/跟随/穿墙/链式死亡
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
  window.__swSetPool?.([10]); // 确定性：只出巨蠕虫（aiStyle 6 头）
  // 地下化：主角沉到 rockLevel 下，走 underground 池
  const st = g.world.store;
  const ty = Math.floor(g.world.rockLevel) + 30;
  let gy = ty;
  while (gy < st.h - 20 && !st.isSolid(Math.floor(g.player.cx / 16), gy)) gy++;
  g.player.x = g.player.cx;
  g.player.y = (gy - 6) * 16;
  // 清出大空腔 + 让怪自然生成（强制步进）
  for (let dy = -10; dy <= 6; dy++) for (let dx = -30; dx <= 30; dx++) {
    st.setTile(Math.floor(g.player.cx / 16) + dx, gy + dy, 0);
    st.liquid[st.idx(Math.floor(g.player.cx / 16) + dx, gy + dy)] = 0;
  }
  for (let dx = -30; dx <= 30; dx++) st.setTile(Math.floor(g.player.cx / 16) + dx, gy + 6, 2);
  for (let i = 0; i < 3000; i++) g.fixedUpdate(1 / 60);
  // 找蠕虫头
  let head = null;
  for (const e of g.entities.enemies) {
    if (e.vanilla?.aiStyle === 6 && !e.wormFollow) { head = e; break; }
  }
  if (!head) return { head: 0 };
  const segCount = (() => { let n = 0; for (let s = head.wormNext; s; s = s.wormNext) n++; return n; })();
  const t0 = { x: head.x, y: head.y };
  const seg0 = head.wormNext ? { x: head.wormNext.x, y: head.wormNext.y } : null;
  for (let i = 0; i < 300; i++) g.fixedUpdate(1 / 60);
  const headMoved = Math.hypot(head.x - t0.x, head.y - t0.y);
  const segMoved = head.wormNext ? Math.hypot(head.wormNext.x - seg0.x, head.wormNext.y - seg0.y) : 0;
  // 链式死亡：打死头
  const hpBefore = head.hp;
  head.hurt(9999, 0, 0, g);
  const allDead = (() => {
    for (let s = head; s; s = s.wormNext) if (!s.dead) return false;
    return true;
  })();
  return { head: 1, name: head.vanilla.name, segCount, headMoved: headMoved | 0, segMoved: segMoved | 0, hpBefore, allDead };
});
console.log(JSON.stringify(out));
if (out.head === 0) {
  check('生成出蠕虫头', false);
} else {
  check('生成出蠕虫头', true, out.name);
  check('段链生成（身+尾）', out.segCount >= 4, `segs=${out.segCount}`);
  check('头穿墙移动', out.headMoved > 40, `headMoved=${out.headMoved}px`);
  check('段跟随移动', out.segMoved > 30, `segMoved=${out.segMoved}px`);
  check('链式死亡（头死全链死）', out.allDead);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
