// BJ410-S3 陆龟 AI 强化债收刀实机探针（2026-09-30,S3 清债的实机验证面）。
// 三面 = #1 态 3 伤害/防御强化（NPC.cs:29624-29630:154 经典 ×2/defense×2,496 ×1.5）
//   + 出态卸载（态 0 复位机构 R3#1 同拍互验）/ #2 态 3 飞行重叠阻尼门 Y 门
//   （:29672-29680——玩家悬上方不阻尼直穿,重叠层阻尼 ×0.8+ai3 归零+vy 托升）/
//   #3 417 sroller TargetClosest seekDirX 面（:29781 弹射拍 aggro 门保向）。
//   #2/#3 判别面在单测域全穷举（tests/bj410-tortoise-s3-buff.test.ts）,实机以
//   #1 全链承重 + #2 单拍直驱复核（R3 探针同先例:单测穷举+实机承重景）。
// 运行:SW_ORIGIN=http://localhost:5580 node tools/run-diag.mjs --timeout=300000 scripts/_bj410-ai-s3.mjs
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger } from '../tools/probe/lib/index.mjs';
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
await freezeClock(page, { tod: 0.5 });
await godMode(page, true);
await pump(page, 30);

// ---- 场地:出生点邻域 ±60 列整平（同 Q2/R3 探针布局） ----
const arena = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const sx = Math.round(g.player.x / 16);
  let surf = 0;
  for (let y = 0; y < st.h; y++) if (st.isSolid(sx, y)) { surf = y; break; }
  for (let x = sx - 60; x <= sx + 60; x++) {
    st.setTileSilent(x, surf, 2);
    for (let dy = 1; dy <= 6; dy++) st.setTileSilent(x, surf - dy, 0);
    st.setTileSilent(x, surf + 1, 2);
    st.setTileSilent(x, surf + 2, 2);
  }
  return { ok: true, sx, surf };
});
L.chk('build spawn arena', arena.ok, JSON.stringify(arena));
const SX = arena.sx, SURF = arena.surf;
const surfTop = SURF * 16;

await page.evaluate(() => {
  window.__s3snap = () => {
    const g = window.__swGame;
    const t = (g.entities.enemies ?? []).find((e) => e.__s3 && !e.dead);
    if (!t) return { ok: false, why: 'no-tagged-enemy' };
    return {
      ok: true, vid: t.vanillaId, ai0: t.ai0, ai1: Math.round(t.ai1 * 10) / 10,
      vx: +t.vx.toFixed(3), vy: +t.vy.toFixed(3), cx: +t.cx.toFixed(1), cy: +t.cy.toFixed(1),
      dmg: t.def?.damage, dfn: t.def?.defense, base: t.tortoiseDefBase ?? null,
      pdx: Math.round(g.player.cx - t.cx),
    };
  };
  window.__removeTagged = () => {
    const arr = window.__swGame.entities.enemies ?? [];
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i].__s3) arr.splice(i, 1);
    return true;
  };
});
const tagEnemy = () => page.evaluate(() => {
  let n = 0;
  for (const e of (window.__swGame.entities.enemies ?? [])) if (e.vanillaId === 154 || e.vanillaId === 496 || e.vanillaId === 417) { e.__s3 = true; n++; }
  return n;
});
const forceState3 = () => page.evaluate(() => {
  const t = (window.__swGame.entities.enemies ?? []).find((e) => e.__s3 && !e.dead);
  if (!t) return { ok: false };
  t.ai0 = 3; t.ai1 = 0; t.ai2 = 0; t.ai3 = 0;   // ai1=0 → 下拍弹射（ai3=vx 定速）
  return { ok: true };
});
const forceState0 = () => page.evaluate(() => {
  const t = (window.__swGame.entities.enemies ?? []).find((e) => e.__s3 && !e.dead);
  if (!t) return { ok: false };
  t.ai0 = 0; t.ai1 = 0;
  return { ok: true };
});

// ================= S1 态 3 强化+卸载全链（:29624-29630 + R3#1 复位机构） =================
const P1X = (SX + 10) * 16;
await teleport(page, P1X, surfTop - 43, { snapCamera: true, zeroVel: true });
await pump(page, 10);
const sp1 = await spawnEnemy(page, 154, (SX + 22) * 16, surfTop - 16 - 8);
L.chk('S1 spawn 154', sp1.ok, JSON.stringify(sp1));
await tagEnemy();
await pump(page, 5);
const S1base = await page.evaluate(() => window.__s3snap());
L.chk('S1 基准读数(态 0,base 快照=damage/defense)',
  S1base.ok && S1base.ai0 === 0 && S1base.base && S1base.dmg === S1base.base.dmg && S1base.dfn === S1base.base.def,
  JSON.stringify(S1base));
// 玩家拉远 600px(防阻尼门介入),强制进态 3 自然弹射
await teleport(page, P1X + 600, surfTop - 43, { zeroVel: true });
await pump(page, 2);
await forceState3();
await pump(page, 12);
const S1buff = await page.evaluate(() => window.__s3snap());
const expBuff = S1buff.ok && S1buff.base
  ? Math.trunc(S1buff.base.dmg * 2) : NaN;
L.chk('S1 态 3 强化(damage=trunc(base×2)/defense=base×2;旧:无强化写点=红)',
  S1buff.ok && S1buff.ai0 === 3 && S1buff.dmg === expBuff && S1buff.dfn === S1buff.base.def * 2,
  `expect dmg=${expBuff} dfn=${S1buff.base ? S1buff.base.def * 2 : NaN} got=${JSON.stringify(S1buff)}`);
await saveCanvasShot(page, join(OUT, 's3-S1-state3-buff.png'));
// 出态卸载:回态 0 一拍复位（R3#1 机构=逐拍解除点）
await forceState0();
await pump(page, 3);
const S1off = await page.evaluate(() => window.__s3snap());
L.chk('S1 回态 0 卸载(damage/defense 归 base;旧:强化残留=红)',
  S1off.ok && S1off.base && S1off.dmg === S1off.base.dmg && S1off.dfn === S1off.base.def,
  JSON.stringify(S1off));
await page.evaluate(() => window.__removeTagged());

// 496 系数面:×1.5（:29625-29628 亲读;非缺省 ×2）
const sp2 = await spawnEnemy(page, 496, (SX + 22) * 16, surfTop - 16 - 8);
L.chk('S1 spawn 496', sp2.ok, JSON.stringify(sp2));
await tagEnemy();
await pump(page, 5);
await forceState3();
await pump(page, 12);
const S1b = await page.evaluate(() => window.__s3snap());
const exp496 = S1b.ok && S1b.base ? Math.trunc(S1b.base.dmg * 1.5) : NaN;
L.chk('S1 496 态 3 强化 ×1.5 系数位(旧:×2 或无写点=红)',
  S1b.ok && S1b.ai0 === 3 && S1b.dmg === exp496 && S1b.dfn === S1b.base.def * 2,
  `expect dmg=${exp496} got=${JSON.stringify(S1b)}`);
await page.evaluate(() => window.__removeTagged());

// ================= S2 阻尼门 Y 门实机面（:29672-29680,单拍直驱复核） =================
const sp3 = await spawnEnemy(page, 154, (SX + 30) * 16, surfTop - 120);
L.chk('S2 spawn 154 半空', sp3.ok, JSON.stringify(sp3));
await tagEnemy();
await pump(page, 2);
// a) 玩家悬龟上方(盒底≤龟顶):Y 门假 → 不阻尼 vx=ai3 续航
const S2a = await page.evaluate(() => {
  const g = window.__swGame;
  const t = (g.entities.enemies ?? []).find((e) => e.__s3 && !e.dead);
  if (!t) return { ok: false };
  const p = g.player;
  p.x = t.cx - p.w / 2 + 4; p.y = t.y - p.h - 8; p.vx = 0; p.vy = 0;   // 玩家盒底 = 龟顶-8
  t.ai0 = 3; t.ai1 = 5; t.ai3 = 1.5; t.vx = 1.5; t.vy = -0.1;
  t.tortoiseAI(g, p);                                   // 单拍直驱（玩家不落体）
  return { ok: true, vx: +t.vx.toFixed(4), ai3: +t.ai3.toFixed(4), vy: +t.vy.toFixed(4),
    gateY: t.y < p.y + p.h, xOverlap: t.x + t.w > p.x && t.x < p.x + p.w };
});
L.chk('S2a Y 门假(玩家悬上)不阻尼:vx=1.5/ai3=1.5（旧:+8 容差阻尼 1.2=红）',
  S2a.ok && S2a.gateY === false && S2a.xOverlap === true
  && Math.abs(S2a.vx - 1.5) < 1e-3 && Math.abs(S2a.ai3 - 1.5) < 1e-3, JSON.stringify(S2a));
// b) 玩家落回同层重叠:Y 门真 → 阻尼 ×0.8+ai3 归零+vy<0 托升 +0.2
const S2b = await page.evaluate(() => {
  const g = window.__swGame;
  const t = (g.entities.enemies ?? []).find((e) => e.__s3 && !e.dead);
  if (!t) return { ok: false };
  const p = g.player;
  p.x = t.cx - p.w / 2; p.y = t.y + t.h - 10; p.vx = 0; p.vy = 0;   // 玩家顶 = 龟盒内,Y 门真
  t.ai0 = 3; t.ai1 = 5; t.ai3 = 1.5; t.vx = 1.5; t.vy = -0.1;
  t.tortoiseAI(g, p);
  return { ok: true, vx: +t.vx.toFixed(4), ai3: +t.ai3.toFixed(4), vy: +t.vy.toFixed(4),
    gateY: t.y < p.y + p.h, xOverlap: t.x + t.w > p.x && t.x < p.x + p.w };
});
L.chk('S2b Y 门真重叠阻尼:vx=1.2/ai3=0/vy=+0.4（托升+0.2+干重力+0.3;旧:缺托升=0.2 红）',
  S2b.ok && S2b.gateY === true && S2b.xOverlap === true
  && Math.abs(S2b.vx - 1.2) < 1e-3 && S2b.ai3 === 0 && Math.abs(S2b.vy - 0.4) < 1e-3, JSON.stringify(S2b));
await saveCanvasShot(page, join(OUT, 's3-S2-overlap-gate.png'));
await page.evaluate(() => window.__removeTagged());

// ================= S3 417 seekDirX 实机面（:29781 弹射拍 aggro 门保向） =================
const sp4 = await spawnEnemy(page, 417, (SX + 40) * 16, surfTop - 60);
L.chk('S3 spawn 417', sp4.ok, JSON.stringify(sp4));
await tagEnemy();
await pump(page, 2);
const S3r = await page.evaluate(() => {
  const g = window.__swGame;
  const t = (g.entities.enemies ?? []).find((e) => e.__s3 && !e.dead);
  if (!t) return { ok: false };
  const p = g.player;
  p.aggro = -100;            // 潜行面（:78552 num 臂）
  p.itemAnimTicks = 0; p.useTime = 0;
  t.hadTarget = true;        // oldTarget≥0（:78550 flag）
  t.ai0 = 6; t.ai1 = 0; t.facing = -1;   // 玩家在右、龟朝左
  t.tortoiseAI(g, p);        // 单拍直驱:ai1 0→1 弹射拍 TargetClosest
  return { ok: true, facing: t.facing, ai1: t.ai1, ai0: t.ai0 };
});
L.chk('S3 417 弹射拍 aggro 门保向 facing=-1（旧 raw sign→+1=红）',
  S3r.ok && S3r.ai1 === 1 && S3r.facing === -1, JSON.stringify(S3r));
await saveCanvasShot(page, join(OUT, 's3-S3-417-seekdir.png'));
await page.evaluate(() => window.__removeTagged());

console.log('[bj410-s3] S1base=', JSON.stringify(S1base), 'S1buff=', JSON.stringify(S1buff), 'S1off=', JSON.stringify(S1off));
console.log('[bj410-s3] S1b496=', JSON.stringify(S1b), 'S2a=', JSON.stringify(S2a), 'S2b=', JSON.stringify(S2b), 'S3r=', JSON.stringify(S3r));
console.log('[bj410-s3] OUT=', OUT);
L.dump(join(OUT, 'ledger-s3.json'));
if (L.fails.length) { console.error('[bj410-s3] FAILS=', L.fails); process.exitCode = 2; }
browser.close();
