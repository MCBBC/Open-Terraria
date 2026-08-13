// 一次性探针:EoC 冲刺速度单积分验证(用户报"二阶段冲刺速度差距大")
//  根因 = eocAI 尾部自己积分 + 通用物理段 noTileCollide 分支再积分 = 双倍速。
//  断言:P2 冲刺期每 tick 位移 ≈ 6.8px(经典单冲),而非 13.6(双积分)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&eocspd=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));

const r = await page.evaluate(() => {
  const g = window.__swGame;
  // 召唤一只克眼(夜间),取实体后直接置 P2 冲刺态量位移
  g.world.clock.timeOfDay = 0.3;            // 夜间
  g.summonBoss('eye_of_cthulhu');
  const e = g.entities.enemies.find((n) => n.vanillaId === 4);
  if (!e) return { err: '召唤失败/无克眼' };
  e.ai0 = 3; e.state = 1; e.ai2 = 0; e.chargesLeft = 0;
  e.hp = e.maxHp * 0.9;               // 非 flag2/3 档
  e.buffs = e.buffs;                   // 保持原引用
  const p = g.player;
  p.dead = false;
  const w = g.world;
  w.clock.timeOfDay = 0.3;            // 夜间
  // state 1 首帧赋初速 → 下帧起 state 2 冲刺
  const tickE = () => e.fixedUpdate(1, g);
  tickE();                            // state1 → 赋速 6.8 朝向玩家, state=2
  const x0 = e.x, y0 = e.y;
  tickE();
  const dx = Math.hypot(e.x - x0, e.y - y0);   // 第一冲刺 tick 位移
  // 再量 5 tick 平均(前 40t 无摩擦)
  const x1 = e.x, y1 = e.y;
  for (let i = 0; i < 5; i++) tickE();
  const avg5 = Math.hypot(e.x - x1, e.y - y1) / 5;
  return { first: Math.round(dx * 100) / 100, avg5: Math.round(avg5 * 100) / 100, spd: Math.round(Math.hypot(e.vx, e.vy) * 100) / 100 };
});
const A = [];
const ok = (n, c, x) => A.push({ name: n, pass: !!c, ...x });
ok('eoc-found', !r.err, r);
if (!r.err) {
  // 经典档单冲初速 6.8,前 40t 无摩擦 → 每 tick ≈6.8±0.3;双积分 ≈13.6
  ok('dash-speed-single-integral', r.first > 6.3 && r.first < 7.5 && r.avg5 > 6.0 && r.avg5 < 7.5, r);
}
const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts: A, failed: failed.length, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
