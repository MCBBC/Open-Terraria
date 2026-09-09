// SW-BJ47 杀怪计数器（Tally Counter vid 3095）法证探针：
//   实报"现在计的是带上配饰后击杀的数量"——裁决 a显示源/b递增被门/c持久化/d lastCreatureHit语义。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=420000 scripts/_bj47-tally-counter.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], protocolTimeout: 600000,
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- E1-S6：击杀序列（不装备→装备→卸下）----
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { bannerOfNpc, bannerToNpcOf } = await import('/src/world/Banners.ts');
  const { buildInfoAccRows } = await import('/src/stats/InfoAccs.ts');
  const { VI_ID } = await import('/src/data/itemKeys.ts');
  const res = { pageErrors: [] };
  const w = g.world, pl = g.player;
  g.enemySpawnEnabled = false;
  w.clock.timeOfDay = 0.5; g._lastClockT = 0.5;

  const ZOMBIE = 3, SLIME_VARIANT = 297;   // 297 = 蓝史莱姆变体（同旗 8,规范代表 74）
  const zb = bannerOfNpc(ZOMBIE);
  res.s0 = {
    zombieBanner: zb, bannerCanonicalNpc: bannerToNpcOf(zb),
    bannerKillsInitial: JSON.stringify(w.bannerKills),
    lastCreatureHit0: pl.lastCreatureHit,
    counterItemKey: VI_ID(3095),
  };

  const readRow = () => {
    g.tickInfoAccs();                       // 强制刷新 ctx（无头 rAF 节流兜底）
    const ctx = g.renderer.infoAccCtx;
    const rows = buildInfoAccRows(ctx, pl.hideInfo ?? [], false);
    const row = rows.find(r => r.icon === 6);
    return { ctxKill: ctx.killText, rowText: row ? row.text : null, gate: !!ctx.gates.accJarOfSouls };
  };
  const killBatch = (vid, n, fromPlayer) => {
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      const e = Enemy.fromVanilla(vid, pl.x + 200 + i * 40, pl.y - 100);
      if (!e) continue;
      e.id = g.entities.nextId++;
      g.entities.add(e, 'enemies');
      spawned++;
      e.hurt(99999, 0, 0, g, 0, false, 0, !!fromPlayer);
    }
    return spawned;
  };

  res.s1 = (() => {
    const n1 = killBatch(ZOMBIE, 7, true);
    return {
      spawned: n1,
      bannerKills: JSON.stringify(w.bannerKills),
      zombieCount: w.bannerKills[zb] ?? 0,
      lastCreatureHit: pl.lastCreatureHit,
      displayUnequipped: readRow(),
    };
  })();

  pl.inv.armor[3] = { id: VI_ID(3095), stack: 1 };
  await sleep(400);
  res.s2_equipDisplay = readRow();

  killBatch(ZOMBIE, 3, true);
  await sleep(400);
  res.s3_afterMore = readRow();
  res.s3_count = w.bannerKills[zb] ?? 0;

  const c4 = w.bannerKills[zb] ?? 0;
  killBatch(ZOMBIE, 2, false);
  await sleep(400);
  res.s4_noInteraction = { before: c4, after: w.bannerKills[zb] ?? 0 };

  killBatch(SLIME_VARIANT, 1, true);
  await sleep(400);
  res.s5_variant = {
    lastCreatureHit: pl.lastCreatureHit,
    bannerOf297: bannerOfNpc(297),
    display: readRow(),
  };

  pl.inv.armor[3] = null;
  await sleep(300);
  const c6 = w.bannerKills[zb] ?? 0;
  killBatch(ZOMBIE, 2, true);
  await sleep(400);
  res.s6_unequippedKill = { before: c6, after: w.bannerKills[zb] ?? 0 };
  pl.inv.armor[3] = { id: VI_ID(3095), stack: 1 };
  await sleep(300);
  res.s6_reDisplay = readRow();

  const m = await import('/src/save/SaveFile.ts');
  const text = m.saveGame(w, pl, 1000, g.townNpcsForSave(), g.eventsForSave());
  const saved = JSON.parse(text);
  res.s7_savedField = {
    bannerKillsInSave: saved.bannerKills ?? null,
    zombieInSave: saved.bannerKills ? (saved.bannerKills[String(zb)] ?? 0) : null,
    playerArmor3: saved.player?.armor?.[3] ?? null,
  };
  res.__saveTextLen = text.length;
  res.__saveText = text;
  return res;
});
const { __saveText, ...evidence } = out;
console.log('[E1-S7]', JSON.stringify(evidence));

// ---- S8：loadJson 重载世界 → 读回计数 + 再杀 1 ----
const s8kick = await p.evaluate(async (t) => {
  try { await window.__swFlow.loadJson(t); return 'loadJson-ok'; }
  catch (e) { return 'loadJson-err: ' + String(e).slice(0, 200); }
}, __saveText);
console.log('[S8-kick]', s8kick, 'href=', p.url());
await sleep(3000);
await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 180000, polling: 500 });
await sleep(1500);
const s8 = await p.evaluate(async () => {
  const g = window.__swGame;
  const { bannerOfNpc } = await import('/src/world/Banners.ts');
  const { buildInfoAccRows } = await import('/src/stats/InfoAccs.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const pl = g.player, w = g.world;
  const zb = bannerOfNpc(3);
  const counter = pl.inv.armor[3];
  const e = Enemy.fromVanilla(3, pl.x + 200, pl.y - 100);
  e.id = g.entities.nextId++;
  g.entities.add(e, 'enemies');
  e.hurt(99999, 0, 0, g, 0, false, 0, true);
  await new Promise(r => setTimeout(r, 400));
  g.tickInfoAccs();
  const ctx = g.renderer.infoAccCtx;
  const rows = buildInfoAccRows(ctx, pl.hideInfo ?? [], false);
  const row = rows.find(r => r.icon === 6);
  return {
    armor3AfterLoad: counter ? counter.id : null,
    lastCreatureHitAfterLoad: pl.lastCreatureHit,
    bannerKillsLoaded: JSON.stringify(w.bannerKills),
    zombieAfterKill: w.bannerKills[zb] ?? 0,
    displayAfterReloadKill: { ctxKill: ctx.killText, rowText: row ? row.text : null },
  };
});
console.log('[S8]', JSON.stringify(s8));
console.log('[pageErrors]', JSON.stringify(errs));
await b.close();
