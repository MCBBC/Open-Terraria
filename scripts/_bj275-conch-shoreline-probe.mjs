// ★BJ275 实机探针：魔法海螺右洋「落到甲板远端 vs 离海最近承位」三落点对照。
// 物证地图 /tmp/bj240-evidence.wld（BJ240/242 同款,右缘甲板 [6354..6364]@414 盖起点列 6360）。
// PHASE=pre（动刀前取证）：
//   ①几何 dump（甲板行/水面行/岸线列）②OFF rightTry=null（原版 quirk）③ON rightTry=甲板 (6359,413)
//     ——即用户实报「海上最远的平台」=BJ242 补偿臂落点。
// PHASE=post（BJ275 落刀后验证）：
//   ④ON rightTry=岸线承位（离开甲板、落在甲板以左自然地形、支撑非平台）⑤calls 全景 ⑥截图。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const PHASE = process.env.BJ275_PHASE ?? 'post';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5205';
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

const buf = readFileSync(process.env.BJ275_MAP ?? '/tmp/bj275-user-map.wld');
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
const GX0 = Number(process.env.BJ275_X0 ?? 6320);
const GX1 = Number(process.env.BJ275_X1 ?? 6368);
const GY0 = Number(process.env.BJ275_Y0 ?? 395);
const GY1 = Number(process.env.BJ275_Y1 ?? 435);
// ── ① 几何 dump：甲板带 [GX0..GX1] × 行 [GY0..GY1] 逐列 RLE ──
const geo = await page.evaluate((gx0, gx1, gy0, gy1) => {
  const st = window.__swGame.world.store;
  const w = st.w;
  const colDesc = (x) => {
    const parts = [];
    let run = null;
    for (let y = gy0; y <= gy1; y++) {
      const i = st.idx(x, y);
      let kind = null;
      if (st.flags[i]) {
        kind = `T${st.type[i]}`;
      } else if (st.liquid[i] > 0) {
        kind = st.liquidType[i] === 2 ? 'LAVA' : 'W';
      }
      if (run && run.kind === kind && run.y1 === y - 1) { run.y1 = y; continue; }
      if (run) parts.push(run.kind ? `${run.kind}@${run.y0}${run.y1 !== run.y0 ? '-' + run.y1 : ''}` : null);
      run = { kind, y0: y, y1: y };
    }
    if (run) parts.push(run.kind ? `${run.kind}@${run.y0}${run.y1 !== run.y0 ? '-' + run.y1 : ''}` : null);
    return parts.filter(Boolean).join(',') || 'air';
  };
  const cols = {};
  for (let x = gx0; x <= Math.min(gx1, w - 1); x++) cols[x] = colDesc(x);
  return { w, h: st.h, cols };
}, GX0, GX1, GY0, GY1);
console.log('GEO(6320..6368):', JSON.stringify(geo));

// ── ②③ 落点取证 ──
const res = await page.evaluate(() => {
  const g = window.__swGame;
  const GameCtor = g.constructor;
  const calls = [];
  const real = g.requestMagicConchTeleportPosition.bind(g);
  g.requestMagicConchTeleportPosition = (ro, inward, extra) => { calls.push([ro, inward === true, extra ?? null]); return real(ro, inward, extra); };
  const offTry = (() => {
    const prev = GameCtor.CONCH_RIGHT_OCEAN_COMPENSATION;
    GameCtor.CONCH_RIGHT_OCEAN_COMPENSATION = false;
    try { return real(true); } finally { GameCtor.CONCH_RIGHT_OCEAN_COMPENSATION = prev; }
  })();
  calls.length = 0;
  const onTry = real(true);
  const st = g.world.store;
  // 落点支撑判读：(px,py+1) tile type
  const supportAt = (hit) => {
    if (!hit) return null;
    const px = Math.round((hit.x + 10 - 8) / 16);
    const py = Math.round((hit.y + 42 - 16) / 16);
    const i = st.idx(px, py + 1);
    return { px, py, type: st.flags[i] ? st.type[i] : -1, liq: st.liquid[i], actuated: !!(st.wire[i] & 8) };
  };
  return {
    gate: GameCtor.CONCH_RIGHT_OCEAN_COMPENSATION,
    w: st.w,
    offTry, onTry, onSupport: supportAt(onTry),
    calls: calls.slice(),
  };
});
console.log('RESULT:', JSON.stringify(res));
check('闸缺省=true', res.gate === true);
check('物证图 6400 宽', res.w === 6400, String(res.w));
check('①OFF rightTry=null（原版右缘 quirk,BJ240）', res.offTry === null, JSON.stringify(res.offTry));

if (PHASE === 'pre') {
  const expDeck = { x: 6359 * TILE + 8 - 10, y: 413 * TILE + 16 - 42 };
  check('②ON rightTry=右洋甲板 (6359,413)（=用户实报「海上最远的平台」）',
    res.onTry && near(res.onTry.x, expDeck.x) && near(res.onTry.y, expDeck.y), JSON.stringify({ got: res.onTry, exp: expDeck }));
  check('②支撑=平台@414（甲板）', res.onSupport && res.onSupport.type === 11 && res.onSupport.px === 6359 && res.onSupport.py + 1 === 414, JSON.stringify(res.onSupport));
  // 落甲板现场截图
  await page.evaluate(() => {
    const g = window.__swGame;
    const p = g.player;
    p.x = 6359 * 16; p.y = 412 * 16;
    const ack = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'));
    if (ack) ack.click();
  });
  await new Promise((r) => setTimeout(r, 10000));
  await page.screenshot({ path: '/tmp/bj275-pre-deck-landing.png' });
  console.log('SCREENSHOT /tmp/bj275-pre-deck-landing.png');
} else {
  check('③ON rightTry 非空（补偿链保住右洋可达）', !!res.onTry, JSON.stringify(res.onTry));
  check('④落点离开甲板（px<6354=甲板左缘以左）', res.onSupport && res.onSupport.px < 6354, JSON.stringify(res.onSupport));
  check('④支撑=非平台实心（岸线自然地形）', res.onSupport && res.onSupport.type >= 0 && res.onSupport.type !== 11 && res.onSupport.liq === 0 && !res.onSupport.actuated, JSON.stringify(res.onSupport));
  check('⑤calls=恰一脚内移重试 [true,true]（外层经 real 直调不入 spy）', res.calls.length === 1 && res.calls[0][0] === true && res.calls[0][1] === true, JSON.stringify(res.calls));
  // ⑥fire 面（用户实际使用路径）：左半场 → 首选右洋（原版败）→ 补偿重试落岸线
  const fireRes = await page.evaluate(() => {
    const g = window.__swGame;
    const calls = [];
    const real = g.requestMagicConchTeleportPosition.bind(g);
    g.requestMagicConchTeleportPosition = (ro, inward, extra) => { calls.push([ro, inward === true]); return real(ro, inward, extra); };
    const p = g.player;
    p.x = 40 * 16; p.y = 310 * 16; p.vx = 0; p.vy = 0;
    g.fireRecallTeleport({ vid: 4263, kind: 'ocean', triggerAt: 45, consume: false });
    return { x: p.x, y: p.y, vy: p.vy, calls: calls.slice() };
  });
  console.log('FIRE:', JSON.stringify(fireRes));
  check('⑥fire 左半场→落右洋水线岸承位（同 onTry,velocity=Zero）',
    fireRes.vy === 0 && near(fireRes.x, res.onTry.x) && near(fireRes.y, res.onTry.y), JSON.stringify({ fire: fireRes, onTry: res.onTry }));
  // 落岸线现场截图（玩家置落点,ack 横幅,等远距传送黑幕淡出）
  await page.evaluate((hit) => {
    const g = window.__swGame;
    const p = g.player;
    if (hit) { p.x = hit.x; p.y = hit.y; p.vx = 0; p.vy = 0; }
    const ack = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'));
    if (ack) ack.click();
  }, res.onTry);
  await new Promise((r) => setTimeout(r, 10000));
  await page.screenshot({ path: '/tmp/bj275-post-shore-landing.png' });
  console.log('SCREENSHOT /tmp/bj275-post-shore-landing.png');
}

await browser.close();
console.log(fails === 0 ? `BJ275 PROBE(${PHASE}): ALL PASS` : `BJ275 PROBE(${PHASE}): ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
