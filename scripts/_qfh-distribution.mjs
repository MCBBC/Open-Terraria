#!/usr/bin/env node
// ★QFH 分布探针：新 NPC 入住分布 + 近链（CheckForHousesNearAPlayer）行为实测。
// 场景：spawn 村房 A（已入住 guide）+ 远端木墙空房 B + 远端宝石火花墙空房 B2。
//  S2a 玩家在 B2 旁 → homeless merchant 是否迁入 B2（WALL_HOUSE 缺 153-166 判别）
//  S2b 玩家在 B 旁   → homeless merchant 是否迁入 B（近链 relo 主判据）
//  S1  玩家在 B 旁、无流浪者 → lastFoundHouse 缓存 + updateTownNpcArrival()
//      快路径新 NPC 是否入住 B（用户实报「新 NPC 只住世界生成点附近」直仿）
//  S1b 玩家回到 A 旁（lastFoundHouse 不被近链刷新）→ 新 NPC 到达落点分布
// 用法(game/ 下): SW_ORIGIN=http://localhost:5250 node tools/run-diag.mjs scripts/_qfh-distribution.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, teleport, godMode, callGame } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const OUT = '/tmp/qfh-probe-out';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5250';
const SEED = '05162020';
const log = (...a) => console.log('[qfh]', ...a);

// 页内：造一间合格房（town-npc-movein.buildHouse 同款;tile id: wood=10 torch=12
// chair=62 table=61 door_closed=17;wallId 默认 4=木墙）。
function buildHouseInPage(g, ox, oy, wallId = 4) {
  const st = g.world.store;
  const setT = (x, y, t, fx = 0, fy = 0) => st.setTileSilent(x, y, t, fx, fy);
  const ground = {};
  for (let x = ox; x <= ox + 10; x++) {   // 每列下探地基,取最深者为地板行
    let gy = Math.max(4, g.world.spawnY - 40);
    while (gy < st.h - 6 && !st.isSolid(x, gy)) gy++;
    ground[x] = gy;
  }
  const oy5 = Math.max(...Object.values(ground));      // 地板行
  const top = oy5 - 5;
  for (let x = ox; x <= ox + 10; x++) { setT(x, oy5, 10); setT(x, top, 10); }
  for (let y = top + 1; y <= oy5 - 1; y++) {
    setT(ox, y, 10); setT(ox + 10, y, 10);
    for (let x = ox + 1; x <= ox + 9; x++) { setT(x, y, 0); st.wall[st.idx(x, y)] = wallId; }
  }
  for (const dx of [ox, ox + 10]) for (let y = top + 2; y <= top + 4; y++) setT(dx, y, 17, 0, (y - top - 2) * 18);
  setT(ox + 1, top + 1, 12, 22, 0);
  setT(ox + 9, top + 1, 12, 44, 0);
  setT(ox + 4, oy5 - 2, 62, 0, 0);
  setT(ox + 4, oy5 - 1, 62, 0, 18);
  for (let dx = 0; dx <= 2; dx++) { setT(ox + 5 + dx, oy5 - 2, 61, dx * 18, 0); setT(ox + 5 + dx, oy5 - 1, 61, dx * 18, 18); }
  return { ox, top, oy5, standX: ox + 3, standY: oy5 - 1 };
}

const dumpNpcs = (g) => g.entities.npcs
  .filter((n) => n instanceof g.entities.npcs.constructor && n.npcKey)
  .map((n) => ({
    key: n.npcKey, vid: n.vanillaId, home: n.home ? { ...n.home } : null,
    x: Math.round(n.x / 16), y: Math.round(n.y / 16),
    hd: n.homelessDespawn, anchor: n.anchorTile ? { ...n.anchorTile } : null,
  }));

async function main() {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  const R = {};
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: SEED, size: 'small', pinRandom: 913, settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await godMode(page, true);
    await freezeClock(page, { tod: 0.3 });    // 白天上午（timeOfDay<0.5 门）

    // ---- 场景搭建 ----
    const setup = await page.evaluate(() => {
      const g = window.__swGame;
      return { spawnX: g.world.spawnX, spawnY: g.world.spawnY, w: g.world.store.w };
    });
    const sx = setup.spawnX;
    const A = await page.evaluate((sx) => {
      const g = window.__swGame;
      const build = (ox, oy, wallId) => {
        const st = g.world.store;
        const setT = (x, y, t, fx = 0, fy = 0) => st.setTileSilent(x, y, t, fx, fy);
        const top = oy - 5;
        for (let x = ox; x <= ox + 10; x++) { setT(x, oy, 10); setT(x, top, 10); }
        for (let y = top + 1; y <= oy - 1; y++) {
          setT(ox, y, 10); setT(ox + 10, y, 10);
          for (let x = ox + 1; x <= ox + 9; x++) { setT(x, y, 0); st.wall[st.idx(x, y)] = wallId; }
        }
        for (const dx of [ox, ox + 10]) for (let y = top + 2; y <= top + 4; y++) setT(dx, y, 17, 0, (y - top - 2) * 18);
        setT(ox + 1, top + 1, 12, 22, 0);
        setT(ox + 9, top + 1, 12, 44, 0);
        setT(ox + 4, oy - 2, 62, 0, 0);
        setT(ox + 4, oy - 1, 62, 0, 18);
        for (let dx = 0; dx <= 2; dx++) { setT(ox + 5 + dx, oy - 2, 61, dx * 18, 0); setT(ox + 5 + dx, oy - 1, 61, dx * 18, 18); }
        return { standX: ox + 3, standY: oy - 1, floorY: oy };
      };
      const findFloor = (x) => {
        const st = g.world.store;
        let y = Math.max(4, g.world.spawnY - 40);
        while (y < st.h - 6 && !st.isSolid(x, y)) y++;
        return y;
      };
      const fA = findFloor(sx + 24);
      const fB = findFloor(sx + 400);
      const fB2 = findFloor(sx + 300);
      const hA = build(sx + 20, fA, 4);       // spawn 村房（木墙）
      const hB = build(sx + 396, fB, 4);      // 远端木墙空房
      const hB2 = build(sx + 296, fB2, 153);  // 远端宝石火花墙空房（WallID 153 Gemspark）
      return { hA, hB, hB2, fA, fB, fB2 };
    }, sx);
    log('houses', JSON.stringify(A));

    // 首个非老人/非 bound 的在场 NPC 入住房 A（锚池非空;本 seed 初始=party_girl）
    const anchorKey = await page.evaluate((hA) => {
      const g = window.__swGame;
      const n0 = g.entities.npcs.find((n) => n.npcKey && n.npcKey !== 'old_man' && !n.bound);
      if (!n0) throw new Error('no anchorable npc');
      n0.home = { x: hA.standX, y: hA.standY };
      n0.leashHome = true;
      return n0.npcKey;
    }, A.hA);
    log('anchor npc:', anchorKey);

    // ---- S2: homeless merchant 在场,近链迁入判别 ----
    const s2 = await page.evaluate((A) => {
      const g = window.__swGame;
      const mod = g; // TownNPC 经 entities.add;此处用动态 import 不可行(evaluate 无模块),
      // 改用 callGame 侧注入:探针主流程经 page.evaluate import() 完成——见下方 s2b。
      void mod;
      return null;
    }, A);
    void s2;
    // 动态 import TownNPC 并造 homeless merchant
    const s2prep = await page.evaluate(async (A) => {
      const g = window.__swGame;
      const { TownNPC } = await import('/src/entities/TownNPC.ts');
      const { TILE } = await import('/src/core/Constants.ts');
      const m = new TownNPC('merchant', (A.hA.standX + 2) * TILE + 8, (A.hA.standY + 1) * TILE);
      m.anchorTile = { x: A.hA.standX, y: A.hA.standY + 1 };
      g.entities.add(m, 'npcs');
      return { merchantId: m.npcKey, home: m.home, anchor: m.anchorTile };
    }, A);
    log('S2 prep merchant:', JSON.stringify(s2prep));

    // S2a: 玩家在 B2（宝石火花墙房）旁
    await teleport(page, (A.hB2.standX) * 16 + 8, (A.hB2.standY) * 16 - 40);
    await pump(page, 240, { step: 40 });
    R.s2a = await page.evaluate((A) => {
      const g = window.__swGame;
      const m = g.entities.npcs.find((n) => n.npcKey === 'merchant');
      return {
        merchantHome: m?.home ?? null,
        lastFoundHouse: g.lastFoundHouse ? { ...g.lastFoundHouse } : null,
        B2: { x: A.hB2.standX, y: A.hB2.standY },
      };
    }, A);
    log('S2a gemspark-relo:', JSON.stringify(R.s2a));

    // S2b: 玩家在 B（木墙房）旁
    await teleport(page, (A.hB.standX) * 16 + 8, (A.hB.standY) * 16 - 40);
    await pump(page, 240, { step: 40 });
    R.s2b = await page.evaluate((A) => {
      const g = window.__swGame;
      const m = g.entities.npcs.find((n) => n.npcKey === 'merchant');
      return {
        merchantHome: m?.home ?? null,
        lastFoundHouse: g.lastFoundHouse ? { ...g.lastFoundHouse } : null,
        B: { x: A.hB.standX, y: A.hB.standY },
      };
    }, A);
    log('S2b wood-relo:', JSON.stringify(R.s2b));

    // ---- S1: 无流浪者,近链缓存→快路径新 NPC ----
    // 移除 merchant（直接 dead）
    await page.evaluate(() => {
      const g = window.__swGame;
      const m = g.entities.npcs.find((n) => n.npcKey === 'merchant');
      if (m) m.dead = true;
    });
    R.s1 = [];
    // 三轮到达:每轮把玩家放 B 旁泵 tick→记录 lastFoundHouse→手动跑入驻轮
    for (let round = 0; round < 3; round++) {
      await teleport(page, (A.hB.standX) * 16 + 8, (A.hB.standY) * 16 - 40);
      await pump(page, 180, { step: 40 });
      const lf = await page.evaluate(() => {
        const g = window.__swGame;
        return { lastFoundHouse: g.lastFoundHouse ? { ...g.lastFoundHouse } : null, lock: g.prioritizedTownNPCType };
      });
      await callGame(page, 'updateTownNpcArrival');
      const after = await page.evaluate(() => {
        const g = window.__swGame;
        return {
          npcs: g.entities.npcs.filter((n) => n.npcKey && !n.dead).map((n) => ({
            key: n.npcKey, home: n.home ? { x: n.home.x, y: n.home.y } : null,
            tx: Math.round(n.x / 16), hd: n.homelessDespawn, anchor: n.anchorTile ? { x: n.anchorTile.x, y: n.anchorTile.y } : null,
          })),
          lock: g.prioritizedTownNPCType,
          timeout: g.homelessSpawnTimeout,
        };
      });
      R.s1.push({ round, lf, after });
      log(`S1 round ${round}:`, JSON.stringify({ lf, after }));
    }

    // ---- S1b: 玩家回 spawn 村,继续到达分布 ----
    R.s1b = [];
    for (let round = 0; round < 2; round++) {
      await teleport(page, (A.hA.standX) * 16 + 8, (A.hA.standY) * 16 - 40);
      await pump(page, 180, { step: 40 });
      const lf = await page.evaluate(() => {
        const g = window.__swGame;
        return { lastFoundHouse: g.lastFoundHouse ? { ...g.lastFoundHouse } : null, lock: g.prioritizedTownNPCType };
      });
      await callGame(page, 'updateTownNpcArrival');
      const after = await page.evaluate(() => {
        const g = window.__swGame;
        return {
          npcs: g.entities.npcs.filter((n) => n.npcKey && !n.dead).map((n) => ({
            key: n.npcKey, home: n.home ? { x: n.home.x, y: n.home.y } : null,
            tx: Math.round(n.x / 16), hd: n.homelessDespawn, anchor: n.anchorTile ? { x: n.anchorTile.x, y: n.anchorTile.y } : null,
          })),
        };
      });
      R.s1b.push({ round, lf, after });
      log(`S1b round ${round}:`, JSON.stringify({ lf, after }));
    }

    R.npcsFinal = await page.evaluate(dumpNpcs);
    writeFileSync(join(OUT, 'qfh-distribution.json'), JSON.stringify(R, null, 2));
    log('WROTE', join(OUT, 'qfh-distribution.json'));
  } finally {
    await closeAllBrowsers();
  }
}

try {
  await main();
} catch (e) {
  console.error('[qfh] FAIL', e?.stack ?? e);
  process.exit(1);
}
