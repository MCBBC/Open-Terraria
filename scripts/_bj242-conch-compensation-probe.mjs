// ★BJ242 实机探针：物证地图 /tmp/bj240-evidence.wld 导入 → 右洋补偿重试分歧验证。
// 断言（分歧 ON=缺省）：
//   ①右洋尝试 request(true) 经内移起点 w-41 重试命中 → 落右洋甲板 (6359,413)
//   ②左半场 fire ocean → 直达右洋（calls=[[true,false],[true,true]]:原版败→补偿重试命中,无左洋脚）
//   ③右半场 fire ocean → 首选即左洋（原版对侧优先序保持,落左洋 (40,311)）
// 断言（回滚口 OFF=原版逐字）：
//   ④rightTry=null ⑤左半场 fire → 回退左洋 (40,311)
// 断言（自然图 newWorld 回归）：⑥左半场 fire → 右洋直达（单次调用无重试）⑦右半场 fire → 左洋。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
let fails = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ' :: ' + detail}`);
  if (!cond) fails++;
};
const near = (a, b, tol = 2) => Math.abs(a - b) < tol;

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(ORIGIN, { waitUntil: 'networkidle0' });

const buf = readFileSync('/tmp/bj240-evidence.wld');
const b64 = buf.toString('base64');
const boot = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const flow = window.__swFlow;
  if (!flow) return { ok: false, why: 'no __swFlow' };
  await flow.importWld(arr);
  return { ok: true };
}, b64);
console.log('IMPORT:', JSON.stringify(boot));
if (!boot.ok) { await browser.close(); process.exit(1); }
await page.waitForFunction(() => window.__swGame?.player && window.__swGame?.world, { timeout: 120000 });
await page.evaluate(() => {
  const btns = document.querySelectorAll('.sw-panel button');
  if (btns.length) btns[btns.length - 1].click();
});

const TILE = 16;
const st0 = await page.evaluate(() => {
  const st = window.__swGame.world.store;
  return { w: st.w, h: st.h, deckAtStart: st.flags[st.idx(st.w - 40, 414)], leftDeck: st.flags[st.idx(40, 312)] };
});
console.log('EVIDENCE WORLD:', JSON.stringify(st0));
check('物证图尺寸 6400×1800', st0.w === 6400 && st0.h === 1800, JSON.stringify(st0));
check('右缘甲板盖起点列 w-40', st0.deckAtStart === 1);
check('左缘浸水甲板在位', st0.leftDeck === 1);

// ── A) 分歧 ON（缺省）──
const a = await page.evaluate(() => {
  const g = window.__swGame;
  const GameCtor = g.constructor;
  const calls = [];
  const real = g.requestMagicConchTeleportPosition.bind(g);
  g.requestMagicConchTeleportPosition = (ro, inward) => { calls.push([ro, inward === true]); return real(ro, inward); };
  const rightTry = real(true);
  // ★rightTry 的内层补偿重试走 this.requestMagicConchTeleportPosition=spy → 已记 [true,true];
  //   清空后 fire 面单独取证（右洋原版败 [true,false] → 内移重试命中 [true,true]）。
  calls.length = 0;
  const fireFrom = (x, y) => { const p = g.player; p.x = x; p.y = y; p.vx = 0; p.vy = 0; g.fireRecallTeleport({ vid: 4263, kind: 'ocean', triggerAt: 45, consume: false }); return { x: p.x, y: p.y, vy: p.vy }; };
  const fireLeft = fireFrom(40 * 16, 310 * 16);           // 左半场（左洋甲板）
  const callsAfterLeft = calls.slice();
  const fireRight = fireFrom(3900 * 16, 300 * 16);        // 右半场
  return {
    gate: GameCtor.CONCH_RIGHT_OCEAN_COMPENSATION,
    rightTry, fireLeft, fireRight,
    callsAfterLeft, callsAfterRight: calls.slice(),
  };
});
console.log('A(ON):', JSON.stringify(a));
check('缺省闸=true', a.gate === true);
const expRight = { x: 6359 * TILE + 8 - 10, y: 413 * TILE + 16 - 42 };   // 内移起点 6359 落右洋甲板 (6359,413)
check('①rightTry 经补偿重试命中右洋甲板', a.rightTry && near(a.rightTry.x, expRight.x) && near(a.rightTry.y, expRight.y), JSON.stringify({ got: a.rightTry, exp: expRight }));
check('②左半场 fire 直达右洋', near(a.fireLeft.x, expRight.x) && near(a.fireLeft.y, expRight.y) && a.fireLeft.vy === 0, JSON.stringify(a.fireLeft));
check('②calls=[右洋原版败,右洋内移重试命中] 无左洋脚', JSON.stringify(a.callsAfterLeft) === '[[true,false],[true,true]]', JSON.stringify(a.callsAfterLeft));
const expLeft = { x: 40 * TILE + 8 - 10, y: 311 * TILE + 16 - 42 };
check('③右半场 fire=原版对侧优先落左洋', near(a.fireRight.x, expLeft.x) && near(a.fireRight.y, expLeft.y), JSON.stringify(a.fireRight));

// 落位右洋现场截图（ack WelcomeAnnounce（BJ144 探针坑）→ 等黑幕淡出）
await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  p.x = 6359 * 16; p.y = 412 * 16;
  const ack = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'));
  if (ack) ack.click();
});
await new Promise((r) => setTimeout(r, 10000));   // ★远距传送黑幕（BJ103）淡出 >3.5s,跨半场 10 万 px 级
await page.screenshot({ path: '/tmp/bj242-right-ocean-landing.png' });
console.log('SCREENSHOT /tmp/bj242-right-ocean-landing.png');

// ── B) 回滚口 OFF=原版逐字 ──
const b = await page.evaluate(() => {
  const g = window.__swGame;
  const GameCtor = g.constructor;
  GameCtor.CONCH_RIGHT_OCEAN_COMPENSATION = false;
  const real = g.requestMagicConchTeleportPosition.bind(g);
  const rightTry = real(true);
  const p = g.player;
  p.x = 40 * 16; p.y = 310 * 16; p.vx = 0; p.vy = 0;
  g.fireRecallTeleport({ vid: 4263, kind: 'ocean', triggerAt: 45, consume: false });
  const fireLeft = { x: p.x, y: p.y };
  GameCtor.CONCH_RIGHT_OCEAN_COMPENSATION = true;   // 还原
  return { rightTry, fireLeft, gateRestored: GameCtor.CONCH_RIGHT_OCEAN_COMPENSATION };
});
console.log('B(OFF):', JSON.stringify(b));
check('④OFF:rightTry=null（右洋恒败=原版）', b.rightTry === null, JSON.stringify(b.rightTry));
check('⑤OFF:左半场 fire 回退左洋 (40,311)', near(b.fireLeft.x, expLeft.x) && near(b.fireLeft.y, expLeft.y), JSON.stringify(b.fireLeft));
check('闸已还原 true', b.gateRestored === true);

// ── C) 自然图回归（两洋不变,重试臂不触发）──
await page.evaluate(() => window.__swFlow.newWorld('bj242nat', 4200, 1200));
await page.waitForFunction(() => {
  const g = window.__swGame;
  return g?.player && g?.world && g.world.store?.w === 4200 && !g.world.genInProgress;
}, { timeout: 180000 });
const c = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const real = g.requestMagicConchTeleportPosition.bind(g);
  const calls = [];
  g.requestMagicConchTeleportPosition = (ro, inward) => { calls.push([ro, inward === true]); return real(ro, inward); };
  const rightTry = real(true);
  const fireFrom = (x, y) => { const p = g.player; p.x = x; p.y = y; p.vx = 0; p.vy = 0; g.fireRecallTeleport({ vid: 4263, kind: 'ocean', triggerAt: 45, consume: false }); return { x: p.x, y: p.y }; };
  const fireLeft = fireFrom(st.w / 4 * 16, g.world.groundLevel * 16);
  const callsAfterLeft = calls.slice();
  const fireRight = fireFrom(st.w * 3 / 4 * 16, g.world.groundLevel * 16);
  return { w: st.w, groundLevel: g.world.groundLevel, rightTry, fireLeft, fireRight, callsAfterLeft, callsAfterRight: calls.slice() };
});
console.log('C(NATURAL):', JSON.stringify(c));
check('⑥自然图:右洋原版直达（非空且落右半场）', c.rightTry && c.rightTry.x > (c.w / 2) * TILE, JSON.stringify(c.rightTry));
check('⑥自然图:左半场 fire 落右洋且单次调用无重试', c.fireLeft.x > (c.w / 2) * TILE && JSON.stringify(c.callsAfterLeft) === '[[true,false]]', JSON.stringify({ fire: c.fireLeft, calls: c.callsAfterLeft }));
check('⑦自然图:右半场 fire 落左洋（原版对侧优先）', c.fireRight.x < (c.w / 2) * TILE, JSON.stringify(c.fireRight));

await browser.close();
console.log(fails === 0 ? 'BJ242 PROBE: ALL PASS' : `BJ242 PROBE: ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
