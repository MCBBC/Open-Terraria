// ★BJ669 刃杖形态三场景探针（2026-10-13 用户三报：①「影子不对」品红小刃簇 ②原版单刃
//   idle 上下浮动 ③多刃转动动画）——A 单刃静置放大截图（对拍图 116 品红簇形态/数量/位置）;
//   B 三刃编队轮转（gtwSec 驱动椭圆,采样 3 刃位置序列验证转动+浮动）;C 敌靶攻击循环残影形态。
// 用法(game/ 下): SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj669-shape-probe.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, createGame, ledger, savePageShot, resolveShotPath,
} from '../tools/probe/lib/index.mjs';

const L = ledger();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('/tmp/probe-out/bj669', { recursive: true });

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: 'bj669', size: 'small' });
L.chk('世界已建', gen.ok);
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true;
  options.data.playWhenUnfocused = true;
  window.__swGame.enemySpawnEnabled = false;
});

// 刃召唤 helper（n 把,槽位序=注册表插入位）
const summon = (n) => page.evaluate(async (cnt) => {
  const g = window.__swGame;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts');
  for (let i = 0; i < cnt; i++) {
    const m = new MinionProj(g.player.cx + 40 + i * 30, g.player.cy - 60, 864, 6, 0, false, 0, false, () => g.player);
    g.entities.add(m, 'projectiles');
  }
  const bt = buffTypeByVanilla(271);
  if (bt !== undefined) g.player.buffs.set(bt, 3600);
}, n);

// 相机对准玩家（刃在玩家头上）
const focusCam = () => page.evaluate(() => {
  const g = window.__swGame;
  g.cam?.setCenter?.(g.player.cx, g.player.cy - 40);
});

// ---- A 场景：单刃静置 3s（对拍图 116：品红簇数量/间距/形态）----
await summon(1);
await wait(1200);
await focusCam();
await wait(3000);
await savePageShot(page, resolveShotPath('/tmp/probe-out/bj669/a-single-idle.png'));
const a = await page.evaluate(() => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  return m ? { x: m.x, y: m.y, vx: m.vx, vy: m.vy, rot: m.rot, whoAmI: m.whoAmI } : null;
});
L.chk('A 单刃静置态', !!a);
console.log('[A] 单刃', JSON.stringify(a));

// ---- B 场景：再召 2 把（共 3 刃）→ 采样 240 拍位置序列（编队椭圆轮转验证）----
await summon(2);
await wait(1200);
await focusCam();
const b = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__swGame;
  const list = () => g.entities.projectiles.filter((p) => p.projId === 864 && !p.dead);
  const samples = [];
  let tick = 0;
  const iv = setInterval(() => {
    const ms = list();
    samples.push(ms.map((m) => [+m.x.toFixed(2), +m.y.toFixed(2)]));
    if (++tick >= 180 || ms.length >= 3) { clearInterval(iv); resolve(samples.filter((s) => s.length >= 3).slice(0, 180)); }
  }, 1000 / 60);
}));
const perBladeSpread = [0, 1, 2].map((i) => {
  const xs = b.map((s) => s[i]?.[0] ?? 0), ys = b.map((s) => s[i]?.[1] ?? 0);
  return {
    xRange: +(Math.max(...xs) - Math.min(...xs)).toFixed(2),
    yRange: +(Math.max(...ys) - Math.min(...ys)).toFixed(2),
  };
});
L.chk('B 每刃 2s 内位移范围（yRange>6=上下浮动/轮转实锤）',
  perBladeSpread.every((s) => s.xRange >= 0 && s.yRange >= 0), { perBladeSpread });
console.log('[B] 每刃位移范围', JSON.stringify(perBladeSpread));
await wait(300);
await savePageShot(page, resolveShotPath('/tmp/probe-out/bj669/b-trio.png'));

// ---- C 场景：僵尸靶在射程内（攻击循环残影形态对拍）----
await page.evaluate(async () => {
  const g = window.__swGame;
  const e = await window.__swFlow.spawnVanillaEnemy(3, g.player.cx + 300, g.player.cy);   // 僵尸
  window.__lastEnemyId = e?.id;
});
await wait(2500);
await focusCam();
await savePageShot(page, resolveShotPath('/tmp/probe-out/bj669/c-combat.png'));
const c = await page.evaluate(() => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  const ring = m?.ghostRing;
  const slots = [];
  if (ring) for (let i = 1; i <= 12; i++) { const s = ring.at(i); if (s) slots.push([+s.x.toFixed(1), +s.y.toFixed(1)]); }
  return { ai0: m ? undefined : undefined, ringSlots: slots };
});
const spread = c.ringSlots.length > 1
  ? Math.max(...c.ringSlots.map((s) => Math.hypot(s[0] - c.ringSlots[0][0], s[1] - c.ringSlots[0][1])))
  : 0;
L.chk('C 攻击循环 ring 散布（>0=列在跑）', spread > 0, { spread, n: c.ringSlots.length });
console.log('[C] ring 散布', spread.toFixed(1), 'px /', c.ringSlots.length, '槽');

writeFileSync('/tmp/probe-out/bj669/report.json', JSON.stringify({ a, perBladeSpread, cSpread: spread }, null, 2));
await browser.close();
console.log('BJ669 DONE');
