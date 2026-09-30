// BJ410-Q2 邻接六刀实机探针（2026-09-30,C5 红蓝定性的实机验证面）。
// 六刀=#1 朝向源 sign(vx)+速度反转折返 / #2 wet→1000 仅非 496/497 / #5 justHit 无
// ai0 门（旋冲受击即断）/ #6 加速三臂（#3/#4 判别面在单测域已全覆盖,实机景以
// S1 走位链与 S2 旋冲链间接覆盖）。
// 实机三景（★场地=出生点邻域:远端天空搭建的浮空平台上【玩家】碰撞失效（敌怪
// 正常、玩家穿台直落,根因未究,见 ledger 备注）→ 场地改出生点天然地表平整带,
// 玩家落位/站立经 readback 验证）：
//   S1 崖边对峙走位:龟走到坑沿 → 折返(vx=0.1×dir) → 下一拍 sign(vx) 定向 →
//      全速离崖(|vx| 增长到 dist<400 档 1.0、cx 持续远离折返点)。旧 sign(dx) 病灶
//      = 折返后下一拍转回玩家侧贴崖爬行。
//   S2 旋冲受击打断:远距蓄力 → 态 3 旋冲(visAngle 旋转) → hurt 一发 → ai0=0
//      (旧 ai0!==3 门=旋冲不断)。
//   S3 496/497 wet 行为:入水 wet=true 而 ai1 不跳 1000(只吃无条件 +1/t);153
//      对照同池 wet→1000 → 快速转态 1。
// 运行:SW_ORIGIN=http://localhost:5470 node tools/run-diag.mjs --timeout=300000 scripts/_bj410-ai-q2.mjs
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, openPage, bootstrap, createGame, pump, pumpUntil, ledger } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { saveCanvasShot } from '../tools/probe/lib/shot.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'evidence', 'bj410-ai');
mkdirSync(OUT, { recursive: true });
const L = ledger();

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260930 });
L.chk('createGame', gen.ok, gen.why ?? '');
await freezeClock(page, { tod: 0.5 });   // 正午(防夜怪干扰)
await godMode(page, true);
await pump(page, 30);

// ---- 场地:出生点邻域 ±50 列整平(surf 行 solid/上 6 行空/下 2 行实) ----
// S1 坑 [sx-20..sx-14] 深 6;S2 平段 [sx+10..sx+33];S3 水池 [sx+34..sx+44] 深 2
const arena = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const sx = Math.round(g.player.x / 16);
  let surf = 0;
  for (let y = 0; y < st.h; y++) if (st.isSolid(sx, y)) { surf = y; break; }
  for (let x = sx - 50; x <= sx + 50; x++) {
    st.setTileSilent(x, surf, 2);
    for (let dy = 1; dy <= 6; dy++) st.setTileSilent(x, surf - dy, 0);
    st.setTileSilent(x, surf + 1, 2);
    st.setTileSilent(x, surf + 2, 2);
  }
  for (let x = sx - 20; x <= sx - 14; x++) {          // S1 坑
    for (let dy = 0; dy <= 5; dy++) st.setTileSilent(x, surf + dy, 0);
    st.setTileSilent(x, surf + 6, 2);
  }
  for (let x = sx + 34; x <= sx + 44; x++) {          // S3 水池(深 2)
    for (let dy = 0; dy <= 1; dy++) st.setTileSilent(x, surf + dy, 0);
    st.setLiquid(x, surf + 1, 255, 0);
  }
  return { ok: true, sx, surf };
});
L.chk('build spawn arena', arena.ok, JSON.stringify(arena));
const SX = arena.sx, SURF = arena.surf;
const surfTop = SURF * 16;

// 页内采样器
await page.evaluate(() => {
  window.__tortSnap = () => {
    const g = window.__swGame;
    const t = (g.entities.enemies ?? []).find((e) => e.__q2 && !e.dead);
    if (!t) return { ok: false, why: 'no-tagged-enemy' };
    const p = g.player;
    return {
      ok: true, id: t.id, vid: t.vanillaId, facing: t.facing, ai0: t.ai0,
      ai1: Math.round(t.ai1 * 10) / 10, ai2: t.ai2, vx: +t.vx.toFixed(3), vy: +t.vy.toFixed(3),
      cx: +t.cx.toFixed(1), cy: +t.cy.toFixed(1), onGround: !!t.onGround,
      wet: !!t.wet, visAngle: +(((t.visAngle ?? 0) % (Math.PI * 2)) + Math.PI * 2 % (Math.PI * 2)).toFixed(3),
      pdx: Math.round(p.cx - t.cx), pdy: Math.round(p.cy - t.cy), py: Math.round(p.y),
    };
  };
  window.__removeTagged = () => {
    const arr = window.__swGame.entities.enemies ?? [];
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i].__q2) arr.splice(i, 1);
    return true;
  };
});
const tagEnemy = () => page.evaluate(() => {
  let n = 0;
  for (const e of (window.__swGame.entities.enemies ?? [])) if (e.vanillaId === 154 || e.vanillaId === 496 || e.vanillaId === 153) { e.__q2 = true; n++; }
  return n;
});

// ================= S1 崖边对峙:走到坑沿 → 折返 → 全速离崖 =================
// ★玩家钉坑左近旁:全程 dist<200 → 无蓄力周期劫持走行
const P1X = (SX - 24) * 16;
await teleport(page, P1X, surfTop - 43, { snapCamera: true, zeroVel: true });
await pump(page, 10);
const pchk = await page.evaluate(() => { const p = window.__swGame.player; return { x: Math.round(p.x), y: Math.round(p.y), og: p.onGround }; });
L.chk('S1 玩家落位(坑左 64px,站立)', Math.abs(pchk.x - P1X) < 40 && pchk.og, JSON.stringify(pchk));
const sp1 = await spawnEnemy(page, 154, (SX - 30) * 16, surfTop - 16 - 8);
L.chk('S1 spawn 154', sp1.ok, JSON.stringify(sp1));
await tagEnemy();
// 走向坑沿:轮询快照直到折返;存全程迹便于诊断
const s1trace = [];
let S1flip = null;
let s1last = null;
for (let k = 0; k < 30 && !S1flip; k++) {
  await pump(page, 20);
  const s = await page.evaluate(() => window.__tortSnap());
  s1last = s;
  if (s.ok) {
    s1trace.push({ cx: s.cx, cy: s.cy, vy: s.vy, facing: s.facing, vx: s.vx, ai0: s.ai0 });
    if (s.facing === -1 && s.vx < 0) S1flip = s;
  }
}
L.chk('S1 折返发生(facing=-1,vx<0)', !!S1flip,
  `last=${JSON.stringify(s1last)} trace0=${JSON.stringify(s1trace.slice(0, 2))} traceN=${JSON.stringify(s1trace.slice(-2))}`);
let S1away = { ok: false };
if (S1flip) {
  const cxFlip = S1flip.cx;
  const hist = [S1flip];
  for (let k = 0; k < 6; k++) {
    await pump(page, 20);
    const s = await page.evaluate(() => window.__tortSnap());
    if (s.ok) hist.push(s); else break;
  }
  const last = hist[hist.length - 1];
  const awayPx = +(cxFlip - last.cx).toFixed(1);
  S1away = { ok: awayPx > 20 && last.vx <= -0.95, awayPx, vxLast: last.vx, cxLast: last.cx, reflip: hist.some((r) => r.facing === 1) };
  L.chk('S1 折返后全速离崖(awayPx>20,|vx|≥0.95,无回翻)', S1away.ok, JSON.stringify(S1away));
}
await saveCanvasShot(page, join(OUT, 'q2-S1-cliff-away.png'));
await page.evaluate(() => window.__removeTagged());

// ================= S2 旋冲受击打断 =================
const P2X = (SX + 12) * 16;
await teleport(page, P2X, surfTop - 43, { snapCamera: true, zeroVel: true });
await pump(page, 10);
const sp2 = await spawnEnemy(page, 154, (SX + 25) * 16, surfTop - 16 - 8);   // ~208px>200 蓄力
L.chk('S2 spawn 154', sp2.ok, JSON.stringify(sp2));
await tagEnemy();
const pu = await pumpUntil(page, (g) => {
  const t = (g.entities.enemies ?? []).find((e) => e.__q2);
  return !!t && (t.dead ? 'dead' : t.ai0 === 3);
}, { maxTicks: 600 });
const S2pre = await page.evaluate(() => window.__tortSnap());
L.chk('S2 进旋冲态 ai0=3', pu.ok === true && S2pre.ok && S2pre.ai0 === 3, `pumpUntil=${JSON.stringify(pu)} snap=${JSON.stringify(S2pre)}`);
await saveCanvasShot(page, join(OUT, 'q2-S2-spin-before-hit.png'));
const S2hit = await page.evaluate(() => {
  const g = window.__swGame;
  const t = (g.entities.enemies ?? []).find((e) => e.__q2 && !e.dead);
  if (!t) return { ok: false, why: 'gone' };
  const pre = { ai0: t.ai0, vx: +t.vx.toFixed(2), visAngle: +((t.visAngle ?? 0) % 6.283).toFixed(2) };
  t.hurt(10, 0, 0, g);          // justHitT=2 → 下拍 AI 消费
  return { ok: true, pre };
});
await pump(page, 2);
const S2post = await page.evaluate(() => window.__tortSnap());
L.chk('S2 受击即断(旋冲→态0)', S2hit.ok && S2post.ok && S2post.ai0 === 0,
  `pre=${JSON.stringify(S2hit)} post=${JSON.stringify(S2post)}`);
await saveCanvasShot(page, join(OUT, 'q2-S2-after-hit.png'));
await page.evaluate(() => window.__removeTagged());

// ================= S3 496/497 wet 行为 + 153 对照 =================
const P3X = (SX + 31) * 16;
await teleport(page, P3X, surfTop - 43, { snapCamera: true, zeroVel: true });
await pump(page, 10);
const sp3 = await spawnEnemy(page, 496, (SX + 39) * 16, surfTop + 8);
L.chk('S3 spawn 496', sp3.ok, JSON.stringify(sp3));
await tagEnemy();
await pump(page, 45);
const S3 = await page.evaluate(() => window.__tortSnap());
L.chk('S3 496 入水湿而不满蓄(ai0=0,ai1<400)', S3.ok && S3.wet && S3.ai0 === 0 && S3.ai1 < 400, JSON.stringify(S3));
await saveCanvasShot(page, join(OUT, 'q2-S3-496-in-water.png'));
await page.evaluate(() => window.__removeTagged());

const sp4 = await spawnEnemy(page, 153, (SX + 39) * 16, surfTop + 8);
L.chk('S3 spawn 153 对照', sp4.ok, JSON.stringify(sp4));
await tagEnemy();
let S3c = { ok: false };
for (let k = 0; k < 12; k++) {
  await pump(page, 4);
  const s = await page.evaluate(() => window.__tortSnap());
  S3c = s;
  if (s.ok && s.ai0 === 1) break;
}
L.chk('S3 153 对照 wet→1000 快速转态 1', S3c.ok && S3c.wet && S3c.ai0 === 1, JSON.stringify(S3c));
await saveCanvasShot(page, join(OUT, 'q2-S3-153-control.png'));

console.log('[bj410-q2] S1flip=', JSON.stringify(S1flip), 'S1away=', JSON.stringify(S1away));
console.log('[bj410-q2] S2pre=', JSON.stringify(S2pre), 'S2hit=', JSON.stringify(S2hit), 'S2post=', JSON.stringify(S2post));
console.log('[bj410-q2] S3=', JSON.stringify(S3), 'S3ctrl=', JSON.stringify(S3c));
console.log('[bj410-q2] OUT=', OUT);
L.dump(join(OUT, 'ledger.json'));
if (L.fails.length) { console.error('[bj410-q2] FAILS=', L.fails); process.exitCode = 2; }
browser.close();
