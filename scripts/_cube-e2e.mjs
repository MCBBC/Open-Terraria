// 一次性 E2E:同伴方块 653——使用链(buff 191+生成)+黑暗捅人(stabbed 死因)
// SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=300000 scripts/_cube-e2e.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const mods = await import('/src/stats/Buffs.ts');
  const mp = await import('/src/entities/MinionProj.ts');
  const p = g.player;
  // 地下暗室(rockLevel 之下,无光源→光照 0)
  const st = g.world.store;
  const px = Math.floor(p.cx / 16), py = Math.floor(g.world.rockLevel) + 60;
  for (let dx = -4; dx <= 4; dx++) for (let dy = -3; dy <= 1; dy++) {
    const tx = px + dx, ty = py + dy, i = st.idx(tx, ty);
    if (dy === 1) { if (!st.flags[i]) st.setTileSilent(tx, ty, 1, 0, 0); }
    else if (st.flags[i]) st.setTileSilent(tx, ty, 0, 0, 0);
    st.liquid[i] = 0;
  }
  p.x = px * 16; p.y = (py - 2) * 16; p.vx = 0; p.vy = 0;
  const hp0 = p.hp;
  // 走物品使用链等价:buff + 无存活投影时生成(与 case 3628 同构)
  p.buffs.apply(mods.BuffType.CompanionCube, 60);
  const owner = p;
  const cube = new mp.MinionProj(owner.cx, owner.cy, 653, 0, 0, false, 0, true,
    () => (owner.dead ? null : owner));
  cube.noSlot = true;
  g.entities.add(cube, 'projectiles');
  // 玩家静置 8s(黑暗计数 ≥31 后按阈值概率捅人)
  const trace = [];
  for (let t = 0; t < 16; t++) {
    await new Promise((r) => setTimeout(r, 500));
    p.vx = 0; p.vy = 0; // 保持 velocity==0
    trace.push(t + ':hp=' + p.hp + ' cubeDead=' + !!cube.dead);
  }
  return {
    hp0, hpEnd: p.hp, cause: JSON.stringify(p.lastDamageCause),
    buffShown: !!document.querySelector('.sw-buff img[src*="Buff_191"]'),
    cubeFollowed: Math.round(Math.hypot(cube.cx - p.cx, cube.cy - p.cy)),
    trace: trace.filter((s) => !s.endsWith('hp=' + hp0 + ' ')).slice(0, 6) || trace.slice(-3),
  };
});
console.log(JSON.stringify(out));
console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
