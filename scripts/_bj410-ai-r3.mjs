// BJ410-R3 陆龟 AI 邻接四刀实机探针（2026-09-30,R3 清债的实机验证面）。
// 四刀=#1 态 0 每 tick 属性复位非 417 支（:29453-29462）/ #2 态 3/4 wet 段
// （:29693/:29701 wet∧dirY<0 → vy-=0.3）+ 态 3 弹射单式两支 / #3 态 5 rotation=0+
// TargetClosest+转态门序（:29838/:29850）/ #4 num606 顶对心距离基准+flag46 纯几何。
// 实机两景（#3/#4 判别面在单测域已全覆盖,实机景以 R1 属性面与 R2 wet 弹跳链承重）：
//   R1 属性复位:毒 154 def.damage/defense=999+kb 哨兵 0.5 → 数拍读回复原+kb=0.3 档;
//     496 对照 kb=0.75 档。
//   R2 wet 弹跳:水池龟强制进态 3 → 弹射+wet 上浮助推（minVy 深于 −10.5=助推面,
//     旧缺助推时 minVy≥−10.2）→ 出水（cy 越过水面）。
// 运行:SW_ORIGIN=http://localhost:5560 node tools/run-diag.mjs --timeout=300000 scripts/_bj410-ai-r3.mjs
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
await freezeClock(page, { tod: 0.5 });
await godMode(page, true);
await pump(page, 30);

// ---- 场地:出生点邻域 ±50 列整平;水池 [sx+34..sx+44] 深 2（同 Q2 探针布局） ----
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
  for (let x = sx + 34; x <= sx + 44; x++) {          // R2 水池(深 2)
    for (let dy = 0; dy <= 1; dy++) st.setTileSilent(x, surf + dy, 0);
    st.setLiquid(x, surf + 1, 255, 0);
  }
  return { ok: true, sx, surf };
});
L.chk('build spawn arena', arena.ok, JSON.stringify(arena));
const SX = arena.sx, SURF = arena.surf;
const surfTop = SURF * 16;

await page.evaluate(() => {
  window.__r3snap = () => {
    const g = window.__swGame;
    const t = (g.entities.enemies ?? []).find((e) => e.__r3 && !e.dead);
    if (!t) return { ok: false, why: 'no-tagged-enemy' };
    const p = g.player;
    return {
      ok: true, id: t.id, vid: t.vanillaId, facing: t.facing, ai0: t.ai0,
      ai1: Math.round(t.ai1 * 10) / 10, vx: +t.vx.toFixed(3), vy: +t.vy.toFixed(3),
      cx: +t.cx.toFixed(1), cy: +t.cy.toFixed(1), onGround: !!t.onGround, wet: !!t.wet,
      dirY: t.dirY, dmg: t.def?.damage, dfn: t.def?.defense, kbo: t.kbResistOverride,
      pdy: Math.round(p.cy - t.cy),
    };
  };
  window.__removeTagged = () => {
    const arr = window.__swGame.entities.enemies ?? [];
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i].__r3) arr.splice(i, 1);
    return true;
  };
});
const tagEnemy = () => page.evaluate(() => {
  let n = 0;
  for (const e of (window.__swGame.entities.enemies ?? [])) if (e.vanillaId === 154 || e.vanillaId === 496) { e.__r3 = true; n++; }
  return n;
});

// ================= R1 态 0 属性复位实机面（:29453-29462 非 417 支） =================
const P1X = (SX + 12) * 16;
await teleport(page, P1X, surfTop - 43, { snapCamera: true, zeroVel: true });
await pump(page, 10);
const sp1 = await spawnEnemy(page, 154, (SX + 20) * 16, surfTop - 16 - 8);
L.chk('R1 spawn 154', sp1.ok, JSON.stringify(sp1));
await tagEnemy();
await pump(page, 5);
const R1base = await page.evaluate(() => window.__r3snap());
L.chk('R1 基准读数(damage/defense 非 999,kb=0.3 档)', R1base.ok && R1base.dmg < 900 && R1base.dfn < 900
  && R1base.kbo != null && Math.abs(R1base.kbo - 0.3) < 0.01, JSON.stringify(R1base));
const R1poison = await page.evaluate(() => {
  const t = (window.__swGame.entities.enemies ?? []).find((e) => e.__r3 && !e.dead);
  if (!t) return { ok: false };
  t.def = { ...t.def, damage: 999, defense: 999 };
  t.kbResistOverride = 0.5;
  return { ok: true, poisoned: { dmg: t.def.damage, dfn: t.def.defense, kbo: t.kbResistOverride } };
});
L.chk('R1 投毒落位', R1poison.ok && R1poison.poisoned.dmg === 999, JSON.stringify(R1poison));
await pump(page, 3);
const R1after = await page.evaluate(() => window.__r3snap());
L.chk('R1 一拍复原(damage/defense 归基准+kb 归 0.3 档)', R1after.ok
  && R1after.dmg === R1base.dmg && R1after.dfn === R1base.dfn
  && R1after.kbo != null && Math.abs(R1after.kbo - 0.3) < 0.01,
  `base=${JSON.stringify({ dmg: R1base.dmg, dfn: R1base.dfn })} after=${JSON.stringify(R1after)}`);
await saveCanvasShot(page, join(OUT, 'r3-R1-def-reset.png'));
await page.evaluate(() => window.__removeTagged());

// 496 对照:kbResist=0.75 档
const sp2 = await spawnEnemy(page, 496, (SX + 20) * 16, surfTop - 16 - 8);
L.chk('R1 spawn 496', sp2.ok, JSON.stringify(sp2));
await tagEnemy();
await pump(page, 3);
const R1b = await page.evaluate(() => window.__r3snap());
L.chk('R1 496 kbResist=0.75 档', R1b.ok && R1b.kbo != null && Math.abs(R1b.kbo - 0.75) < 0.01, JSON.stringify(R1b));
await page.evaluate(() => window.__removeTagged());

// ================= R2 wet 弹跳（:29693 wet 段:水中旋冲上浮助推出水） =================
// ★从入池第 0 拍起连续采样（自然链 wet→ai1=1000→态 1→态 3 弹射全程 ~35t,预置
//   长 pump 会整段错过——首跑定谳:kick 前龟已自弹至水面上 85px）
const P2X = (SX + 31) * 16;
await teleport(page, P2X, surfTop - 43, { snapCamera: true, zeroVel: true });
await pump(page, 10);
const sp3 = await spawnEnemy(page, 154, (SX + 39) * 16, surfTop + 8);
L.chk('R2 spawn 154 入池', sp3.ok, JSON.stringify(sp3));
await tagEnemy();
let minVy = 99, minCy = 1e9, wetSeen = false, exited = false, ai4 = false, state3 = false, last = null;
const trace = [];
for (let k = 0; k < 150; k++) {
  await pump(page, 1);                                   // 逐拍采样:湿窗仅 ~10t,粗采样会漏 minVy
  const s = await page.evaluate(() => window.__r3snap());
  if (!s.ok) break;
  last = s;
  if (s.wet) wetSeen = true;
  if (s.ai0 === 3) state3 = true;
  if (s.vy < minVy) minVy = s.vy;
  if (s.cy < minCy) minCy = s.cy;
  if (s.cy < surfTop - 8) exited = true;
  if (s.ai0 === 4) ai4 = true;
  if (k % 6 === 0) trace.push({ cy: s.cy, vy: s.vy, ai0: s.ai0, wet: s.wet });
  if (exited && k > 20 && minVy < -10.1) break;
}
L.chk('R2 链路(wet 见证+态 3 弹射发生)', wetSeen && state3, `trace0=${JSON.stringify(trace.slice(0, 5))}`);
L.chk('R2 wet 助推(minVy<-10.1=弹射后湿窗净上浮;旧缺助推 minVy≈-9.5 红)',
  wetSeen && minVy < -10.1, `wetSeen=${wetSeen} minVy=${minVy} last=${JSON.stringify(last)}`);
L.chk('R2 弹跳出水面(cy 越过水面 surfTop-8)或入下落态 4',
  exited || ai4, `minCy=${minCy} surfTop=${surfTop} exited=${exited} ai4=${ai4}`);
await saveCanvasShot(page, join(OUT, 'r3-R2-wet-bounce.png'));

console.log('[bj410-r3] R1base=', JSON.stringify(R1base), 'R1after=', JSON.stringify(R1after), 'R1b496=', JSON.stringify(R1b));
console.log('[bj410-r3] R2 minVy=', minVy, 'minCy=', minCy, 'exited=', exited, 'ai4=', ai4, 'last=', JSON.stringify(last));
console.log('[bj410-r3] OUT=', OUT);
L.dump(join(OUT, 'ledger-r3.json'));
if (L.fails.length) { console.error('[bj410-r3] FAILS=', L.fails); process.exitCode = 2; }
browser.close();
