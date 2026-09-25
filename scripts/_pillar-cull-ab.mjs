// ★四柱掉帧定谳批（2026-09-25）主犯② 像素 AB 探针：NPC 视域剔除
// （Renderer.npcOffscreen=Main.cs:22534/:22653 移植）红线三面：
//   ① AB 逐字节：同一定格世界（pause+freezeClock+确定性降噪）,剔除 ON vs
//      ?npccull=0（npcCullSetForTest(false)）两臂整帧 canvas 逐字节相等
//      （剔除物本不在屏 → AB 应全等;任何差异=误剔屏内内容）。
//   ② 剔除生效：全离屏 4 塔 drawEnemy 计数 ON=0 / OFF=4×N 帧。
//   ③ MustAlwaysDraw{113-116,125,126} 白名单族全离屏仍画（计数>0）。
//   ④ 副作用巡检面：drawEnemy 侧唯一回写 spriteBottomWorld——剔除臂陈旧值
//      只喂屏外血条=不可见（批档案表）;本探针 AB 逐字节已覆盖其视觉面。
// 运行: SW_ORIGIN=http://localhost:5219 node tools/run-diag.mjs --timeout=600000 scripts/_pillar-cull-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, front } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = process.env.PILLAR_OUT || '/tmp/probe-out/pillar-cull-ab';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');

const browser = await launchBrowser({});
const errors = [];
const page = await openPage(browser, { errors });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await bootstrap(page, `${ORIGIN}/?cloudcache=0`);            // 缺省链,npccull 缺省开
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

await front(page);
// ---- 确定性降噪（_pillar-fps-probe 同款:云停/天气关/钟冻结/风摆关/刷怪关） ----
await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer, sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  sky.maintainClouds = () => {}; sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 60; w.lightning = 0; }
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* */ }
  g.enemySpawnEnabled = false;
  // drawEnemy 按实体计数（剔除生效面/白名单面/副作用面的统一读数）
  const RP = Object.getPrototypeOf(r);
  const orig = RP.drawEnemy;
  window.__deCounts = {};
  window.__deTotal = 0;
  RP.drawEnemy = function (e, ...rest) {
    const k = e.vanillaId ?? 'maples';
    window.__deCounts[k] = (window.__deCounts[k] || 0) + 1;
    window.__deTotal++;
    return orig.call(this, e, ...rest);
  };
});
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; }).catch(() => {}));

// ---- 造混合种群：屏内小怪 ×4 / fluff 内小怪 ×2 / 全离屏 4 塔 / 白名单 113 全离屏 ----
const spawned = await page.evaluate(async () => {
  const g = window.__swGame;
  const flow = window.__swFlow;
  const px = g.player.x, gy = g.world.groundLevel * 16;
  const out = {};
  const put = async (id, dx) => {
    const m = await flow.spawnVanillaEnemy(id, px + dx, gy - 320);
    if (m?.id != null) out[id + '@' + dx] = m.id;
    return m;
  };
  await put(1, -300); await put(1, -120); await put(1, 180); await put(1, 420);   // 屏内
  await put(1, 1100); await put(1, 1300);                                          // 屏外但 ±800 fluff 内=两臂都画
  for (let i = 0; i < 4; i++) await put([422, 517, 507, 493][i], 4200 + i * 700);  // 全离屏塔
  await put(113, 9000);                                                            // Prime 头（MustAlwaysDraw）
  // 手工钉位（pause 后 AI 停跑,零漂移）+ 盾 100
  const le = g.world.lunarEvent;
  le.active = true;
  le.towerActive = { solar: true, vortex: true, nebula: true, stardust: true };
  le.shield = { solar: 100, vortex: 100, nebula: 100, stardust: 100 };
  return out;
});
chk('spawnVanillaEnemies', Object.keys(spawned).length >= 11, JSON.stringify(spawned));

// ---- 落位 + 定格（render-only 帧,sim 零漂移） ----
await front(page);
await page.evaluate(() => { window.__swGame.start(); });
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => { window.__swGame.running = false; });
await page.evaluate(() => {
  const g = window.__swGame;
  // 实体钉位：归零速度（pause 后恒静止）
  for (const e of g.entities.enemies) { e.vx = 0; e.vy = 0; }
  window.__vnow = performance.now();
});
await new Promise((r) => setTimeout(r, 300));

/** 定格采帧 N 帧（paused render-only）+ canvas 字节 md5 + drawEnemy 计数快照 */
async function armSnap(n) {
  return page.evaluate((nn) => {
    const g = window.__swGame;
    const prev = g.paused;
    g.paused = true;
    window.__deCounts = {}; window.__deTotal = 0;
    for (let i = 0; i < nn; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); }
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    g.paused = prev;
    return { b64: btoa(bin), w: c.width, h: c.height, counts: { ...window.__deCounts }, total: window.__deTotal };
  }, n);
}

// ---- Arm A：剔除 ON（缺省） ----
await page.evaluate(() => { window.__swGame.renderer.constructor.npcCullSetForTest(true); });
const A = await armSnap(20);
// ---- Arm B：剔除 OFF（逃生门=旧行为） ----
await page.evaluate(() => { window.__swGame.renderer.constructor.npcCullSetForTest(false); });
const B = await armSnap(20);
await page.evaluate(() => { window.__swGame.renderer.constructor.npcCullSetForTest(true); });

const towersOff = ['422', '517', '507', '493'].reduce((s, k) => s + (B.counts[k] || 0), 0);
const towersOn = ['422', '517', '507', '493'].reduce((s, k) => s + (A.counts[k] || 0), 0);
chk('AB-逐字节全等（剔除物本不在屏）', md5(A.b64) === md5(B.b64),
  `A=${md5(A.b64)} B=${md5(B.b64)} ${A.w}x${A.h}`);
chk('剔除生效:全离屏 4 塔 ON=0（OFF=4塔×20帧）', towersOn === 0 && towersOff === 80,
  `on=${towersOn} off=${towersOff}`);
chk('屏内小怪两臂都画（同计数）', (A.counts['1'] || 0) > 0 && A.counts['1'] === B.counts['1'],
  `on=${A.counts['1']} off=${B.counts['1']}`);
chk('MustAlwaysDraw 113 全离屏仍画（ON 臂计数>0）', (A.counts['113'] || 0) === 20,
  `on=${A.counts['113']} off=${B.counts['113']}`);

// ---- SM2 计数面（主犯①缓存联动:定格时间同桶 → 双臂零新增冷跑） ----
const sm2 = await page.evaluate(async () => {
  const m = await import('/src/fx/ForceFieldBubble.ts');
  const before = { ...m.__forceFieldBubbleStats };
  const g = window.__swGame;
  g.paused = true;
  for (let i = 0; i < 20; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); }
  return { before, after: { ...m.__forceFieldBubbleStats } };
});
chk('盾泡缓存联动:定格时间同桶 20 帧零冷跑', sm2.after.sm2Runs === sm2.before.sm2Runs,
  `runs ${sm2.before.sm2Runs}→${sm2.after.sm2Runs} hits ${sm2.before.cacheHits}→${sm2.after.cacheHits}`);

if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 6));
try { writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, errors, A: { md5: md5(A.b64), counts: A.counts }, B: { md5: md5(B.b64), counts: B.counts }, sm2 }, null, 1)); } catch { /* 目录缺 */ }
await browser.close().catch(() => {});
console.log('DONE');
