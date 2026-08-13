// 一次性探针:EoC P2 冲刺全周期实测(用户报"二阶段冲刺速度差距大")
//  量:首冲每 tick 位移(期望 ≈6.8 经典)、40t 后摩擦衰减、130t 冲程总距离、
//  3 连冲节奏(state 1↔2)、回悬浮伺服,与原版 NPC.cs:20452-20534 对照。
//  ★必须夜间:timeOfDay=0.9(0.3 是白天 → 漂离分支 vx=0,上一版探针假 0 的根因)。
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
  g.world.clock.timeOfDay = 0.9;            // 夜间(DAWN=0.1875/DUSK=0.8125)
  g.summonBoss('eye_of_cthulhu');
  const e = g.entities.enemies.find((n) => n.vanillaId === 4);
  if (!e) return { err: '召唤失败/无克眼' };
  const p = g.player;
  p.dead = false;
  const expert = !!g.world.difficulty && g.world.difficulty >= 2;   // 档位快照
  // 直接置 P2 首冲预备态
  e.ai0 = 3; e.state = 1; e.ai2 = 0; e.chargesLeft = 0;
  e.hp = e.maxHp * 0.9;
  const tick = () => e.fixedUpdate(1, g);
  tick();                                   // state1 赋速 → state2
  const spd0 = Math.hypot(e.vx, e.vy);
  // 全冲程逐 tick 位移:前 5t(无摩擦窗)与 130t 总距离/末速
  let x0 = e.x, y0 = e.y;
  const per = [];
  for (let i = 0; i < 5; i++) { per.push(Math.hypot(e.x - x0, e.y - y0) || 0); [e.x, e.y] = [e.x, e.y]; tick(); per[per.length - 1] = Math.hypot(e.x - x0, e.y - y0); x0 = e.x; y0 = e.y; }
  for (let i = 5; i < 130; i++) tick();
  const after130 = { state: e.state, charges: e.chargesLeft, vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2) };
  // 继续冲完 3 连:回悬浮(state 0)为止
  let guard = 0;
  while (e.state !== 0 && guard++ < 500) tick();
  const hoverEnter = { t: guard, state: e.state };
  // 悬浮 200t 出冲
  for (let i = 0; i < 200; i++) tick();
  const afterHover = { state: e.state, spd: +Math.hypot(e.vx, e.vy).toFixed(2) };
  return {
    expert,
    zoom: +g.camera.zoom.toFixed(3),
    initSpeed: +spd0.toFixed(2),           // 期望 6.8(经典)
    firstTicks: per.map((v) => +v.toFixed(2)),
    after130, hoverEnter, afterHover,
  };
});
const A = [];
const ok = (n, c, x) => A.push({ name: n, pass: !!c, ...x });
ok('eoc-found', !r.err, r);
if (!r.err) {
  const f = r.firstTicks[0];
  ok('charge-init-6.8', r.initSpeed > 6.4 && r.initSpeed < 7.2, { initSpeed: r.initSpeed });
  ok('first-tick-single-integral', f > 6.3 && f < 7.5, { firstTick: f });
  ok('no-friction-first-40t', r.firstTicks.every((v) => v > 6.2 && v < 7.6), r.firstTicks);
  ok('charge-130t-cycle', r.after130.state === 1 && r.after130.charges === 1, r.after130);
  ok('three-charges-then-hover', r.hoverEnter.state === 0, r.hoverEnter);
  ok('hover-200t-recharge', r.afterHover.state === 1, r.afterHover);
}
const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts: A, failed: failed.length, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
