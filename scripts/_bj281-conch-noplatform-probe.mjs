// ★BJ281 实机探针：海螺「两洋不落平台」落刀验证（用户图 /tmp/bj275-user-map.wld
// = behavior-log-天真的钴最高点-2026-09-22 同图,md5 e304e13a）。
// 用户实报场景（behavior-log 时间线）：玩家在右洋水线岸 (6127,412) fire 海螺 →
//   t=3165 落 (650,4971)=左洋浸水甲板 (40,311)=病灶相（BJ275 残留①,本刀关闭）。
// 检查面：
//   ①OFF（回滚口关闭=原版逐字）：leftTry=甲板 (40,311)（病灶相仅存于原版相）
//   ②ON：leftTry=(171,311)=甲板内端自然承位（物证 (171,312)=T128 贝壳堆,非平台）
//   ③ON：右洋回归 (6127,413)=BJ275 水线岸不变
//   ④fire 面（用户实际使用路径,右半场）：首选左洋→落自然承位,单脚直达
//   ⑤落点现场截图
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5206';
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

const buf = readFileSync(process.env.BJ281_MAP ?? '/tmp/bj275-user-map.wld');
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

// ── ① 几何 dump：左洋甲板带 [30..180] × 行 [305..320] 关键列 RLE ──
const geo = await page.evaluate(() => {
  const st = window.__swGame.world.store;
  const colDesc = (x) => {
    const parts = [];
    let run = null;
    for (let y = 305; y <= 320; y++) {
      const i = st.idx(x, y);
      let kind = null;
      if (st.flags[i]) kind = `T${st.type[i]}`;
      else if (st.liquid[i] > 0) kind = st.liquidType[i] === 2 ? 'LAVA' : 'W';
      if (run && run.kind === kind && run.y1 === y - 1) { run.y1 = y; continue; }
      if (run) parts.push(run.kind ? `${run.kind}@${run.y0}${run.y1 !== run.y0 ? '-' + run.y1 : ''}` : null);
      run = { kind, y0: y, y1: y };
    }
    if (run) parts.push(run.kind ? `${run.kind}@${run.y0}${run.y1 !== run.y0 ? '-' + run.y1 : ''}` : null);
    return parts.filter(Boolean).join(',') || 'air';
  };
  const cols = {};
  for (const x of [38, 40, 60, 100, 169, 170, 171, 172, 175, 180]) cols[x] = colDesc(x);
  return { w: st.w, cols };
});
console.log('GEO(left-ocean):', JSON.stringify(geo));

// ── ②③④ 落点取证 ──
const res = await page.evaluate(() => {
  const g = window.__swGame;
  const GameCtor = g.constructor;
  const st = g.world.store;
  const real = g.requestMagicConchTeleportPosition.bind(g);
  const supportAt = (hit) => {
    if (!hit) return null;
    const px = Math.round((hit.x + 10 - 8) / 16);
    const py = Math.round((hit.y + 42 - 16) / 16);
    const i = st.idx(px, py + 1);
    const d = st.flags[i] ? st.type[i] : -1;
    return { px, py, type: d, liq: st.liquid[i], plat: st.isPlatform(px, py + 1) };
  };
  // ① OFF（原版逐字）：左洋尝试=甲板承位（病灶相）
  const prev = GameCtor.CONCH_RIGHT_OCEAN_COMPENSATION;
  GameCtor.CONCH_RIGHT_OCEAN_COMPENSATION = false;
  let offLeft, offRight;
  try { offLeft = real(false); offRight = real(true); } finally { GameCtor.CONCH_RIGHT_OCEAN_COMPENSATION = prev; }
  // ②③ ON：左洋新相 + 右洋回归
  const calls = [];
  g.requestMagicConchTeleportPosition = (ro, inward) => { calls.push([ro, inward === true]); return real(ro, inward); };
  const onLeft = real(false);
  calls.length = 0;
  const onRight = real(true);
  const rightCalls = calls.slice();
  return {
    gate: GameCtor.CONCH_RIGHT_OCEAN_COMPENSATION,
    w: st.w,
    offLeft, offRight,
    offLeftSupport: supportAt(offLeft),
    onLeft, onLeftSupport: supportAt(onLeft),
    onRight, onRightSupport: supportAt(onRight),
    rightCalls,
  };
});
console.log('RESULT:', JSON.stringify(res));
check('闸缺省=true', res.gate === true);
check('物证图 6400 宽', res.w === 6400, String(res.w));

const expDeck = { x: 40 * 16 + 8 - 10, y: 311 * 16 + 16 - 42 };
check('①OFF leftTry=左洋甲板 (40,311)（原版逐字=实报病灶相仅存于回滚态）',
  res.offLeft && near(res.offLeft.x, expDeck.x) && near(res.offLeft.y, expDeck.y), JSON.stringify({ got: res.offLeft, exp: expDeck }));
check('①OFF 左落点支撑=平台甲板（type11,isPlatform）',
  res.offLeftSupport && res.offLeftSupport.px === 40 && res.offLeftSupport.type === 11 && res.offLeftSupport.plat === true, JSON.stringify(res.offLeftSupport));

const expShore = { x: 171 * 16 + 8 - 10, y: 311 * 16 + 16 - 42 };
check('②ON leftTry=(171,311)=甲板内端自然承位（离海最近自然物块,用户预期）',
  res.onLeft && near(res.onLeft.x, expShore.x) && near(res.onLeft.y, expShore.y), JSON.stringify({ got: res.onLeft, exp: expShore }));
check('②ON 左落点支撑=自然贝壳堆 T128@312（非平台、离水线）',
  res.onLeftSupport && res.onLeftSupport.px === 171 && res.onLeftSupport.type === 128 && res.onLeftSupport.plat === false, JSON.stringify(res.onLeftSupport));

const expRight = { x: 6127 * 16 + 8 - 10, y: 413 * 16 + 16 - 42 };
check('③ON rightTry=(6127,413)=右洋水线岸（BJ275 回归不变）',
  res.onRight && near(res.onRight.x, expRight.x) && near(res.onRight.y, expRight.y), JSON.stringify({ got: res.onRight, exp: expRight }));
check('③ON 右落点支撑=非平台实心（岸线自然地形）',
  res.onRightSupport && res.onRightSupport.type >= 0 && res.onRightSupport.type !== 11 && res.onRightSupport.plat === false, JSON.stringify(res.onRightSupport));

// ── ④ fire 面（用户实际使用路径）：右半场玩家 → 首选左洋 → 落自然承位 ──
const fireRes = await page.evaluate(() => {
  const g = window.__swGame;
  const calls = [];
  const real = g.requestMagicConchTeleportPosition.bind(g);
  g.requestMagicConchTeleportPosition = (ro, inward) => { calls.push([ro, inward === true]); return real(ro, inward); };
  const p = g.player;
  p.x = 6127 * 16; p.y = 412 * 16; p.vx = 0; p.vy = 0;   // =behavior-log t=3105 玩家位
  g.fireRecallTeleport({ vid: 4263, kind: 'ocean', triggerAt: 45, consume: false });
  return { x: p.x, y: p.y, vy: p.vy, calls: calls.slice() };
});
console.log('FIRE:', JSON.stringify(fireRes));
check('④fire 右半场→落左洋自然承位 (171,311),单脚直达,velocity=Zero',
  fireRes.vy === 0 && near(fireRes.x, expShore.x) && near(fireRes.y, expShore.y)
  && fireRes.calls.length === 1 && fireRes.calls[0][0] === false && fireRes.calls[0][1] === false,
  JSON.stringify({ fire: fireRes, exp: expShore }));

// ── ⑤ 落点现场截图（玩家置落点,ack 横幅）──
await page.evaluate((hit) => {
  const g = window.__swGame;
  const p = g.player;
  if (hit) { p.x = hit.x; p.y = hit.y; p.vx = 0; p.vy = 0; }
  const ack = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'));
  if (ack) ack.click();
}, res.onLeft);
await new Promise((r) => setTimeout(r, 10000));
await page.screenshot({ path: '/tmp/bj281-post-left-shore-landing.png' });
console.log('SCREENSHOT /tmp/bj281-post-left-shore-landing.png');

await browser.close();
console.log(fails === 0 ? 'BJ281 PROBE: ALL PASS' : `BJ281 PROBE: ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
