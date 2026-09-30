#!/usr/bin/env node
// ★BJ425 实机探针：NPC 刷新到实体方块中——发型师嵌地牢入口长梯砖（用户实报）。
//  S1 长梯场景：在地牢入口旁手建「长梯竖井」（平台踏板+砖壁），以老人 home（地牢口）
//     为锚——旧 ±(30..80) 近似落位 300 掷嵌砖普查 vs 新 homelessWanderPlacement
//     300 掷结构有效性普查（地板行+3×3 净空+无液+≤worldSurface）。
//  S2 全链：savedStylist 置位 + 全员安家 → updateTownNpcArrival() 流浪生成链放行
//     造型师 → 落位结构有效 + 锚≠老人 home（37 排除）+ 不落竖井砖。
//  截图留档 game/docs/evidence/bj425/。
// 用法(game/ 下): SW_PORT=5640 起私有实例后
//   SW_ORIGIN=http://localhost:5640 node tools/run-diag.mjs scripts/_bj425-embed-probe.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, teleport, godMode } from '../tools/probe/lib/game.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'evidence', 'bj425');
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5640';
const SEED = '05162020';
const log = (...a) => console.log('[bj425]', ...a);

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
    await freezeClock(page, { tod: 0.3 });   // 白天上午（timeOfDay<0.5 门）

    // ---- 场景：地牢入口 + 长梯竖井 + 老人锚 ----
    const S = await page.evaluate(() => {
      const g = window.__swGame;
      const st = g.world.store;
      const DIRT = 0; void DIRT;
      const setT = (x, y, t, fx = 0, fy = 0) => st.setTileSilent(x, y, t, fx, fy);
      const dX = g.world.dungeonX, dY = g.world.dungeonY;
      const ws = g.world.groundLevel;
      // 地表行（dungeonX 处自 dY-80 下探）
      let gy = Math.max(10, dY - 80);
      while (gy < st.h - 10 && !st.isSolid(dX, gy)) gy++;
      // 长梯竖井：x∈[dX+30, dX+37]（旧近似锚 ±(30..80) 可达带），rows gy+1..gy+90
      const sx0 = dX + 30, sx1 = dX + 37, floorY = gy + 90;
      for (let y = gy + 1; y <= floorY + 12; y++) {
        for (let x = sx0; x <= sx1; x++) setT(x, y, 0);
        setT(sx0 - 1, y, 41);   // 蓝砖壁（sheet 41）
        setT(sx1 + 1, y, 41);
      }
      for (let y = floorY; y <= floorY + 12; y++) for (let x = sx0 - 2; x <= sx1 + 2; x++) setT(x, y, 41); // 井底
      for (let y = gy + 6; y < floorY; y += 6) for (let x = sx0; x <= sx1; x++) setT(x, y, 19);           // 平台踏板
      // 老人（应有——世界就绪即驻地牢口）：取其 home 为锚;缺则用门口点
      const om = g.entities.npcs.find((n) => n.npcKey === 'old_man' && !n.dead);
      return { dX, dY, ws, gy, sx0, sx1, floorY,
        omHome: om?.home ? { x: om.home.x, y: om.home.y } : null,
        omPos: om ? { x: Math.round(om.x / 16), y: Math.round(om.y / 16) } : null };
    });
    log('scene', JSON.stringify(S));
    R.scene = S;

    // 旧近似落位模拟（旧代码字面）：ax=锚±(30..80) 单列,ay 自 anchorY-20 下探 ±20 找首个
    // isSolid → feet=(ay+1)*TILE（地面格底边=恒嵌 16px）;命中竖井砖带 = 实报形态。
    const oldSim = await page.evaluate((S) => {
      const g = window.__swGame;
      const st = g.world.store;
      const anchor = S.omHome ?? { x: S.dX, y: S.gy - 1 };          // 本仓 home 口径=站立行
      let trials = 0, embed = 0, inShaft = 0, belowWs = 0, shaftBrick = 0, noSolid = 0;
      for (let k = 0; k < 300; k++) {
        const ax = anchor.x + (Math.random() < 0.5 ? -1 : 1) * (30 + Math.floor(Math.random() * 50));
        if (ax < 3 || ax > st.w - 4) continue;
        let ay = Math.max(4, anchor.y - 20);
        const limit = Math.min(st.h - 3, anchor.y + 20);
        while (ay < limit && !st.isSolid(ax, ay)) ay++;
        trials++;
        if (ay >= limit) { noSolid++; continue; }
        embed++;                                                     // feet=(ay+1)*16 → 行 ay 内恒嵌 16px
        if (ay > S.ws) belowWs++;
        if (ax >= S.sx0 - 1 && ax <= S.sx1 + 1) { inShaft++; if (st.type[st.idx(ax, ay)] === 41) shaftBrick++; }
      }
      return { trials, embed, inShaft, shaftBrick, belowWs, noSolid };
    }, S);
    log('OLD ±(30..80) sim:', JSON.stringify(oldSim));
    R.oldSim = oldSim;

    // 新落位核 300 掷普查（页内动态 import 内核 + BJ37 谓词）
    const newSim = await page.evaluate(async (S) => {
      const g = window.__swGame;
      const st = g.world.store;
      const { homelessWanderPlacement } = await import('/src/world/Housing.ts');
      const { spawnTileSolid, solidTilesCell } = await import('/src/world/spawn/VanillaSpawner.ts');
      const anchor = S.omHome ?? { x: S.dX, y: S.gy - 1 };
      const anchorFloorY = anchor.y + 1;                              // 站立行 → homeTile 地行
      let trials = 0, valid = 0, onPlatform = 0, inShaft = 0;
      let first = null;
      for (let k = 0; k < 300; k++) {
        const r = homelessWanderPlacement(st, anchor.x, anchorFloorY, S.ws, []);
        if (!r) continue;
        if (r.spawnX <= 3 || r.spawnX > st.w - 4 || r.spawnY <= 3 || r.spawnY > st.h - 4) continue; // 越界守卫
        trials++;
        let ok = spawnTileSolid(st, r.spawnX, r.spawnY);
        for (let dx = -1; dx <= 1 && ok; dx++)
          for (let dy = -3; dy <= -1 && ok; dy++)
            if (solidTilesCell(st, r.spawnX + dx, r.spawnY + dy)) ok = false;
        for (let dy = -3; dy <= -1 && ok; dy++)
          if (st.liquid[st.idx(r.spawnX, r.spawnY + dy)] !== 0) ok = false;
        if (r.spawnY > S.ws) ok = false;
        if (ok) valid++;
        if (st.type[st.idx(r.spawnX, r.spawnY)] === 19) onPlatform++;
        if (r.spawnX >= S.sx0 && r.spawnX <= S.sx1) inShaft++;
        if (!first && ok) first = r;
      }
      return { trials, valid, onPlatform, inShaft, first };
    }, S);
    log('NEW kernel:', JSON.stringify(newSim));
    R.newSim = newSim;
    R.newSimInvalid = newSim.trials - newSim.valid;

    // ---- 截图①：长梯竖井内景（玩家悬井内上部,可见砖壁+平台踏板）----
    await teleport(page, ((S.sx0 + S.sx1) / 2) * 16, (S.gy + 14) * 16);
    await pump(page, 30);
    await page.screenshot({ path: join(OUT, 's1-ladder-shaft.png') });

    // ---- 截图②：新落位标记（首格有效落点,泥块柱标记落位身体空间,拍后还原）----
    if (newSim.first) {
      const fx = newSim.first.spawnX, fy = newSim.first.spawnY;
      await page.evaluate(([fx, fy]) => {
        const st = window.__swGame.world.store;
        for (let dy = -3; dy <= -1; dy++) st.setTileSilent(fx, fy + dy, 1, 0, 0);   // dirt 标记柱(1×3)=落位身体空间
        st.setTileSilent(fx - 2, fy - 1, 12, 0, 0);                                  // 火把补光(拍后还原)
        st.setTileSilent(fx + 2, fy - 3, 12, 0, 0);
      }, [fx, fy]);
      await teleport(page, fx * 16, (fy - 26) * 16);
      await pump(page, 30);
      await page.screenshot({ path: join(OUT, 's1-new-landing-marker.png') });
      await page.evaluate(([fx, fy]) => {
        const st = window.__swGame.world.store;
        for (let dy = -3; dy <= -1; dy++) st.setTileSilent(fx, fy + dy, 0, 0, 0);
        st.setTileSilent(fx - 2, fy - 1, 0, 0, 0);
        st.setTileSilent(fx + 2, fy - 3, 0, 0, 0);
      }, [fx, fy]);
      log('landing marker at', fx, fy);
    }

    // ---- S2 全链：savedStylist 置位 + 全员安家 → 入驻轮放行造型师流浪生成 ----
    const s2 = await page.evaluate(async (S) => {
      const g = window.__swGame;
      const st = g.world.store;
      const { TownNPC } = await import('/src/entities/TownNPC.ts');
      const { TILE } = await import('/src/core/Constants.ts');
      const om = g.entities.npcs.find((n) => n.npcKey === 'old_man' && !n.dead);
      // spawn 邻域建真房带（每 NPC 一间——★①'' 房况复核会重跑 QuickFindHome,假 home
      // 会被收走转 homeless → R3-1 卡死 ③;真房才站得住）
      const sx = g.world.spawnX;
      const findFloor = (x) => {
        let y = Math.max(4, g.world.spawnY - 60);
        while (y < st.h - 10 && !st.isSolid(x, y)) y++;
        return y;
      };
      const buildHouse = (ox) => {
        const floor = findFloor(ox + 5);
        const top = floor - 5;
        for (let x = ox; x <= ox + 10; x++) { st.setTileSilent(x, floor, 10); st.setTileSilent(x, top, 10); }
        for (let y = top + 1; y <= floor - 1; y++) {
          st.setTileSilent(ox, y, 10); st.setTileSilent(ox + 10, y, 10);
          for (let x = ox + 1; x <= ox + 9; x++) { st.setTileSilent(x, y, 0); st.wall[st.idx(x, y)] = 4; }
        }
        for (const dx of [ox, ox + 10]) for (let y = top + 2; y <= top + 4; y++) st.setTileSilent(dx, y, 17, 0, (y - top - 2) * 18);
        st.setTileSilent(ox + 1, top + 1, 12, 22, 0);
        st.setTileSilent(ox + 9, top + 1, 12, 44, 0);
        st.setTileSilent(ox + 4, floor - 2, 62, 0, 0);
        st.setTileSilent(ox + 4, floor - 1, 62, 0, 18);
        for (let dx = 0; dx <= 2; dx++) { st.setTileSilent(ox + 5 + dx, floor - 2, 61, dx * 18, 0); st.setTileSilent(ox + 5 + dx, floor - 1, 61, dx * 18, 18); }
        return { standX: ox + 3, standY: floor - 1 };
      };
      const homeAll = [];
      const starters = g.entities.npcs.filter((n) => n.npcKey && n.npcKey !== 'old_man' && !n.dead && !n.bound);
      // 造型师门置位（解救臂）+ 被缚网住造型师清场（key='stylist' 会压住 has 门——本 seed 无,保底）
      g.world.flags.savedStylist = true;
      const boundSty = g.entities.npcs.filter((n) => n.npcKey === 'stylist' && n.bound && !n.dead);
      for (const b of boundSty) b.dead = true;
      const ahead = ['guide', 'merchant', 'nurse', 'arms_dealer', 'goblin_tinkerer', 'wizard',
        'dryad', 'demolitionist', 'witch_doctor', 'steampunker', 'mechanic', 'angler',
        'cyborg', 'pirate', 'clothier'];
      const made = [];
      let roomIdx = 0;
      const nextRoom = () => buildHouse(sx - 110 + (roomIdx++) * 14);
      for (const n of starters) {
        const r = nextRoom();
        n.home = { x: r.standX, y: r.standY };
        n.leashHome = true;
        n.anchorTile = { x: r.standX, y: r.standY + 1 };
        homeAll.push(n.npcKey);
      }
      for (const key of ahead) {
        if (g.entities.npcs.some((n) => n.npcKey === key && !n.dead)) continue;
        const r = nextRoom();
        const e = new TownNPC(key, r.standX * TILE, (r.standY + 1) * TILE);
        e.home = { x: r.standX, y: r.standY };
        e.leashHome = true;
        e.anchorTile = { x: r.standX, y: r.standY + 1 };
        g.entities.add(e, 'npcs');
        made.push(key);
      }
      g.prioritizedTownNPCType = 0;
      g.homelessSpawnTimeout = 0;
      g.lastFoundHouse = null;
      // 诊断：入驻轮各门状态快照
      const npcsNow = g.entities.npcs.filter((n) => n instanceof TownNPC && !n.dead);
      const diag = {
        isDay: g.world.clock.isDay, tod: g.world.clock.timeOfDay,
        ff: g.world.isFastForwardingTime(),
        homelessSpawnTimeout: g.homelessSpawnTimeout,
        invasion: !!(g.world.invasion || g.world.invasionType),
        homelessNonExempt: npcsNow.some((n) => !n.home && !n.bound && ![37, 453, 368, 160].includes(n.vanillaId)),
        homelessList: npcsNow.filter((n) => !n.home).map((n) => `${n.npcKey}:${n.vanillaId}:b${n.bound ? 1 : 0}`),
        n: npcsNow.length,
      };
      const before = g.entities.npcs.filter((n) => n.npcKey === 'stylist').length;
      g.updateTownNpcArrival();
      const sty = g.entities.npcs.filter((n) => n.npcKey === 'stylist' && !n.dead);
      const spawned = sty.length - before;
      const detail = sty.map((n) => {
        const fx = Math.floor((n.x + n.w / 2) / 16), fy = Math.floor((n.y + n.h) / 16);
        const floorRow = Math.round((n.y + n.h) / 16);              // 脚底行(像素换算)
        let bodyClear = true;
        const bx0 = Math.floor(n.x / 16), bx1 = Math.floor((n.x + n.w) / 16);
        const by0 = Math.floor(n.y / 16), by1 = Math.floor((n.y + n.h - 1) / 16);
        for (let x = bx0; x <= bx1 && bodyClear; x++)
          for (let y = by0; y <= by1 && bodyClear; y++)
            if (st.isActive(x, y) && st.isSolid(x, y)) bodyClear = false;   // 身体盒触实心=嵌
        return { x: Math.round(n.x), y: Math.round(n.y), anchor: n.anchorTile ? { ...n.anchorTile } : null,
          home: n.home ? { ...n.home } : null, hd: n.homelessDespawn, bodyClear, fx, fy };
      });
      return { spawned, detail, homeAll, made, boundStyCleared: boundSty.length, diag,
        omAnchorExcluded: detail.every((d) => !d.anchor || !(om && om.home && d.anchor.x === om.home.x && d.anchor.y === om.home.y + 1)),
        dX: S.dX, shaft: [S.sx0, S.sx1] };
    }, S);
    log('S2 full-chain:', JSON.stringify(s2));
    R.s2 = s2;

    // ---- 截图③：造型师落位实况（若有）----
    if (s2.spawned > 0 && s2.detail.length) {
      const d = s2.detail[0];
      await teleport(page, d.x, d.y - 320);
      await pump(page, 20);
      await page.screenshot({ path: join(OUT, 's2-stylist-arrival.png') });
    }

    R.verdict = {
      oldEmbedRate: oldSim.trials ? +(oldSim.embed / oldSim.trials).toFixed(3) : null,
      oldShaftBrick: oldSim.shaftBrick,
      newInvalid: R.newSimInvalid,
      newValidRate: newSim.trials ? +(newSim.valid / newSim.trials).toFixed(3) : null,
      stylistSpawned: s2.spawned,
      stylistBodyClear: s2.detail.every((d) => d.bodyClear),
      stylistNotAtDungeon: s2.detail.every((d) => !(d.fx >= S.sx0 - 2 && d.fx <= S.sx1 + 2)),
    };
    log('VERDICT', JSON.stringify(R.verdict));
    writeFileSync(join(OUT, 'probe-result.json'), JSON.stringify(R, null, 2));
    console.log('[bj425] RESULT_JSON=' + JSON.stringify(R.verdict));
  } catch (e) {
    console.error('[bj425] FAIL', e);
    process.exitCode = 1;
  } finally {
    await closeAllBrowsers();
  }
}
await main();
