// 战士族 AI（AI_003）验证：夜间生成 aiStyle 3 怪 → 追击位移 + 朝向
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
  window.__swSetPool?.([3]); // 确定性：只出僵尸（aiStyle 3）
  g.world.clock.timeOfDay = 0.9; // 夜（isDay = 0.25<tod<0.75 之外）
  for (let i = 0; i < 1500; i++) g.fixedUpdate(1 / 60);
  const fighters = g.entities.enemies.filter((e) => e.vanilla?.aiStyle === 3);
  const all = g.entities.enemies.map((e) => ({ k: e.key, ai: e.vanilla?.aiStyle }));
  if (!fighters.length) return { fighters: 0, isDay: g.world.clock.isDay, all };
  const e = fighters[0];
  // 清出平地观测台（防生成位贴墙伪影）：石地板 + 净空，玩家右端怪左端
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16), py0 = Math.floor(g.player.cy / 16) + 6;
  for (let dy = -8; dy <= 2; dy++) for (let dx = -25; dx <= 25; dx++) {
    const x = px0 + dx, y = py0 + dy;
    st.setTile(x, y, dy === 2 ? 2 : 0);
  }
  // 中间立一堵 1 格墙：战士必须翻墙才能到玩家身边
  st.setTile(px0, py0 + 1, 2);
  g.player.x = (px0 + 15) * 16;
  g.player.y = py0 * 16 - 40;
  e.x = (px0 - 15) * 16;
  e.y = py0 * 16 - e.h;
  e.vx = 0; e.vy = 0;
  const t0 = { x: e.x, y: e.y };
  for (let i = 0; i < 900; i++) g.fixedUpdate(1 / 60);
  const p = g.player;
  // 翻墙判定：墙右侧 (px0+1)*16 之后算通过
  const crossed = e.x > (px0 + 1) * 16;
  return {
    name: e.vanilla.name, fighters: fighters.length,
    moved: Math.hypot(e.x - t0.x, e.y - t0.y) | 0,
    dx: (e.x - t0.x) | 0, crossed,
    ex: (e.x / 16 - px0) | 0, ey: ((e.y + e.h) / 16 - py0) | 0, dead: e.dead,
    wallCol: px0,
    tiles: (() => { const rows = []; for (let dy = 2; dy >= -2; dy--) { let r = ''; for (let dx = -3; dx <= 1; dx++) r += st.isSolid(px0 + dx, py0 + dy) ? '#' : '.'; rows.push(r); } return rows; })(),
    playerSide: p.cx > e.cx ? 'right' : 'left', facing: e.facing > 0 ? 'right' : 'left',
    vx: +e.vx.toFixed(2), onG: e.onGround,
  };
});
if (out.all) console.log("all enemies:", JSON.stringify(out.all));
else console.log(JSON.stringify(out));
if (out.fighters === 0) {
  check('夜间生成出 aiStyle 3 战士族', false, `isDay=${out.isDay}`);
} else {
  check('夜间生成出 aiStyle 3 战士族', true, `${out.fighters} 只(${out.name})`);
  check('战士有追击位移', out.moved > 20, `moved=${out.moved}px`);
  check('战士朝向玩家', out.facing === out.playerSide, `facing=${out.facing} player=${out.playerSide}`);
  check('战士翻越 1 格墙', !!out.crossed, `crossed=${out.crossed} dx=${out.dx}px`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
