// 一次性 E2E:美杜莎蓄力→石化 buff→变身 20×难度伤(防御结算)整链
// SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=300000 scripts/_medusa-e2e.mjs
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
  g.world.clock.timeOfDay = 0.9; // 夜
  const p = g.player;
  // 找一块开阔平地(出生点地表,两侧无墙):直接清出一块 12x6 空腔+地面
  const st = g.world.store;
  const px = Math.floor(p.cx / 16), py = Math.floor(p.cy / 16);
  for (let dx = -8; dx <= 8; dx++) for (let dy = -5; dy <= 1; dy++) {
    const tx = px + dx, ty = py + dy;
    if (!st.inBounds(tx, ty)) continue;
    const i = st.idx(tx, ty);
    if (dy === 1) { if (!st.flags[i]) st.setTileSilent(tx, ty, 1, 0, 0); } // 地面行实心
    else if (st.flags[i]) st.setTileSilent(tx, ty, 0, 0, 0);               // 上方清空
    st.wall[i] = 0;
  }
  p.x = px * 16; p.y = (py - 2) * 16; p.vx = 0; p.vy = 0;
  await new Promise((r) => setTimeout(r, 1500));
  const hp0 = p.hp;
  g.debugSpawnNpc(480, 1, false);
  await new Promise((r) => setTimeout(r, 600));
  const med = g.entities.all().filter((e) => e.vanillaId === 480).pop();
  if (!med) return { err: 'no medusa' };
  // 玩家站她右侧,面朝左看她;她面朝右看玩家(mutualFacing)
  if (med.cx < p.cx) { /* 已在右 */ } else { med.x = p.cx - 200; }
  p.facing = -1; med.facing = 1;
  const trace = [];
  let stonedAt = -1, hpAfter = -1;
  for (let t = 0; t < 60 && stonedAt < 0; t++) {
    await new Promise((r) => setTimeout(r, 500));
    if (stonedAt < 0 && p.buffs.has(82)) { stonedAt = t; hpAfter = p.hp; }
    trace.push(t + ':ai2=' + med.ai2 + ' stoned=' + p.buffs.has(82) + ' hp=' + p.hp);
  }
  return {
    medusaHp: Math.round(med.hp), hp0, hpAfter, stonedAt,
    lastCause: JSON.stringify(p.lastDamageCause),
    trace: trace.filter((s) => s.includes('stoned=true') || s.endsWith('ai2=0 ')).slice(0, 4),
    buffBarShown: !!document.querySelector('.sw-buff img[src*="Buff_156"]'),
  };
});
console.log(JSON.stringify(out));
console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
