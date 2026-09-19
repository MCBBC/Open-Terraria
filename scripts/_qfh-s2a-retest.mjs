#!/usr/bin/env node
// ★QFH-M2 端到端复测（修后）：Gemspark 房近链 relo + 快路径缓存判据。
// 修前本底（scripts/_qfh-distribution.mjs S2a）：merchantHome=null、lastFoundHouse=null。
// 用法: SW_ORIGIN=http://localhost:5250 node tools/run-diag.mjs scripts/_qfh-s2a-retest.mjs
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, teleport, godMode } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5250';
const log = (...a) => console.log('[qfh-m2]', ...a);

try {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await godMode(page, true);
    await freezeClock(page, { tod: 0.3 });

    const scene = await page.evaluate(async () => {
      const g = window.__swGame;
      const st = g.world.store;
      const setT = (x, y, t, fx = 0, fy = 0) => st.setTileSilent(x, y, t, fx, fy);
      const findFloor = (x) => {
        let y = Math.max(4, g.world.spawnY - 40);
        while (y < st.h - 6 && !st.isSolid(x, y)) y++;
        return y;
      };
      const f = findFloor(g.world.spawnX + 300);
      const ox = g.world.spawnX + 296, oy = f;
      const top = oy - 5;
      for (let x = ox; x <= ox + 10; x++) { setT(x, oy, 10); setT(x, top, 10); }
      for (let y = top + 1; y <= oy - 1; y++) {
        setT(ox, y, 10); setT(ox + 10, y, 10);
        for (let x = ox + 1; x <= ox + 9; x++) { setT(x, y, 0); st.wall[st.idx(x, y)] = 153; }
      }
      for (const dx of [ox, ox + 10]) for (let y = top + 2; y <= top + 4; y++) setT(dx, y, 17, 0, (y - top - 2) * 18);
      setT(ox + 1, top + 1, 12, 22, 0);
      setT(ox + 9, top + 1, 12, 44, 0);
      setT(ox + 4, oy - 2, 62, 0, 0);
      setT(ox + 4, oy - 1, 62, 0, 18);
      for (let dx = 0; dx <= 2; dx++) { setT(ox + 5 + dx, oy - 2, 61, dx * 18, 0); setT(ox + 5 + dx, oy - 1, 61, dx * 18, 18); }
      // party_girl 退场（排除抢房/复核转无家干扰,merchant 独占 homeless 位;近链不查锚池）
      const pg = g.entities.npcs.find((n) => n.npcKey === 'party_girl');
      if (pg) pg.dead = true;
      const { TownNPC } = await import('/src/entities/TownNPC.ts');
      const { TILE } = await import('/src/core/Constants.ts');
      const m = new TownNPC('merchant', (ox + 3) * TILE + 8, (oy - 1) * TILE);
      m.anchorTile = { x: ox + 3, y: oy };
      g.entities.add(m, 'npcs');
      return { standX: ox + 3, standY: oy - 1, merchantHome: m.home, anchorKey: 'merchant', pgHome: pg?.home ?? null };
    });
    log('scene:', JSON.stringify(scene));

    await teleport(page, scene.standX * 16 + 8, scene.standY * 16 - 40);
    await pump(page, 240, { step: 40 });
    const R = await page.evaluate(() => {
      const g = window.__swGame;
      const m = g.entities.npcs.find((n) => n.npcKey === 'merchant');
      return {
        merchantHome: m?.home ?? null,
        lastFoundHouse: g.lastFoundHouse ? { ...g.lastFoundHouse } : null,
      };
    });
    // 分层诊断：页内直接跑近链纯函数面,定位失明层级（采样→受理→胶水）
    R.diag = await page.evaluate(async (scene) => {
      const g = window.__swGame;
      const { checkHousesNearAPlayer, sampleHouseSeed, nearHouseViewRect, acceptTownNPCAtHouse } =
        await import('/src/world/Housing.ts');
      const st = g.world.store;
      const p = g.player;
      const ptx = Math.floor((p.x + p.w / 2) / 16), pty = Math.floor((p.y + p.h / 2) / 16);
      const rect = nearHouseViewRect(st, ptx, pty);
      const hit = sampleHouseSeed(st, rect, Math.random);
      const views = g.entities.npcs.filter((n) => n.npcKey && !n.dead).map((n) => ({
        key: n.npcKey, npcId: n.vanillaId, bound: n.bound, home: n.home, ref: n.npcKey,
      }));
      const occupied = views.filter((v) => v.home).map((v) => ({ x: v.home.x, y: v.home.y, npcId: v.npcId }));
      const lock = g.prioritizedTownNPCType;
      const near = checkHousesNearAPlayer(st, [{ x: ptx, y: pty }], 0, views, occupied, lock, Math.random);
      const acc = hit ? acceptTownNPCAtHouse(st, occupied, hit[0], hit[1], 17) : null;
      return {
        playerTile: { ptx, pty }, rect,
        sampleHit: hit, lock,
        pureChain: { seedHit: near.seedHit, relocated: near.relocated?.ref ?? null, home: near.home, cache: near.foundHouseNoSpawn },
        acceptAtHit: acc ? { ok: acc.ok, home: acc.home } : null,
        wallAtStand: st.wall[st.idx(scene.standX, scene.standY)],
        wallAtStandM1: st.wall[st.idx(scene.standX - 1, scene.standY)],
        gameViews: views.map((v) => ({ key: v.key, vid: v.npcId, home: v.home ? { ...v.home } : null, bound: v.bound })),
      };
    }, scene);
    const pass = !!(R.merchantHome && R.merchantHome.x >= scene.standX - 6 && R.merchantHome.x <= scene.standX + 6);
    log('M2 RESULT', pass ? 'PASS' : 'FAIL', JSON.stringify({ ...R, scene }));
    if (!pass) process.exitCode = 1;
  } finally {
    await closeAllBrowsers();
  }
} catch (e) {
  console.error('[qfh-m2] FAIL', e?.stack ?? e);
  process.exit(1);
}
