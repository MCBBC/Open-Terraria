#!/usr/bin/env node
// ★BJ432 实机探针：还没救发型师就自动入住（用户实报）——到达门误并 178 蒸汽朋克人
//  门 ((tenth&&!getGood)||downedMechBossAny) 修复后的实机双向验证。
//  S1 未救不入住（用户实报路径）：世界 flags.downed_134=true（杀过机械 Boss）、
//     savedStylist 恒假、蛛网龛内置被缚 354 —— 入驻轮×2 后：零 353 到达、
//     被缚者仍 bound/无家/旗未置。（旧码在本场景会直接放行 353 流浪到达=实报复现）
//  S2 解救链：右键 talk 交互端点（talkToNearbyNpc,smartInteractNpcId 候选驱动）
//     → freeBoundNpc → bound=false + flags.savedStylist=true。
//  S3 解救后入住：入驻轮 ① QuickFindHome → 被救者 home=蛛网龛口邻房。
//  截图留档 game/docs/evidence/bj432/。
// 用法(game/ 下): SW_PORT=5781 起私有实例后
//   SW_ORIGIN=http://localhost:5781 node tools/run-diag.mjs scripts/_bj432-stylist-arrival-gate-probe.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, teleport, godMode } from '../tools/probe/lib/game.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'evidence', 'bj432');
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5781';
const SEED = 'sw432normal';   // 普通种子（非十周年——门修正与该 flag 无涉的对照面）
const log = (...a) => console.log('[bj432]', ...a);

async function main() {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  const R = {};
  try {
    const { writeFileSync } = await import('node:fs');
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: SEED, size: 'small', pinRandom: 432, settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await godMode(page, true);
    await freezeClock(page, { tod: 0.3 });   // 白天上午（②③ 昼上午门）

    // ---- 场景：出生点右翼两间房（向导住一间、一间留给解救后入住）+ 地表下蛛网龛 ----
    const S = await page.evaluate(() => {
      const g = window.__swGame;
      const st = g.world.store;
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
      const hGuide = buildHouse(sx + 8);      // 向导房（锚池非空门）
      const hFree = buildHouse(sx + 26);      // 空房（解救后入住靶）

      // 向导安家（锚池）
      const guide = g.entities.npcs.find((n) => n.npcKey === 'guide' && !n.dead);
      if (guide) { guide.home = { x: hGuide.standX, y: hGuide.standY }; guide.leashHome = true; }

      // 蛛网裂隙（墙 62）：hFree 左侧开顶竖井（QuickFindHome 三步探房链
      // WorldGen.cs:5662-5682 双怪癖——①闭袋锚在 step1 即被泛洪成「无门房」短路
      // 全链；②step3 外层无 break,vanilla canSpawn 副作用语义=【终列 k=ax+10】
      // 的探测结果定生死（本仓 Housing.quickFindHome 注释同款 quirk）→ 锚须满足
      // ax+10 落在房内域列且 l 奇偶命中内域行。锚 (2123,297)→终列 2133∈[2127,2135]
      // 内域、l∈[286..306] 偶数行 288/290 命中。竖井开顶（step1 泛洪出天=非房）。
      const hx0 = hFree.standX - 9, hy0 = 288;                // 井域 6×9（cols 2120-2125）
      for (let y = hy0; y < hy0 + 9; y++)
        for (let x = hx0; x < hx0 + 6; x++) { st.setTileSilent(x, y, 0); st.wall[st.idx(x, y)] = 62; }
      for (let x = hx0; x < hx0 + 6; x++) st.setTileSilent(x, hy0 + 9, 1);    // 井底
      st.setTileSilent(hx0, hy0 + 8, 12, 22, 0);                              // 井内火把（取景照明）
      return { sx, hGuide, hFree,
        nook: { x: hx0, y: hy0, anchorX: hFree.standX - 6, anchorY: hy0 + 9 },
        ws: g.world.groundLevel };
    });
    log('scene', JSON.stringify(S));
    R.scene = S;

    // ---- 放被缚发型师（bound TownNPC,TOWN_NPC_IDS.stylist=353 携城镇 id;渲染走 354 姿态表）----
    const placed = await page.evaluate(async (S) => {
      const g = window.__swGame;
      const { TownNPC } = await import('/src/entities/TownNPC.ts');
      const { TILE } = await import('/src/core/Constants.ts');
      const e = new TownNPC('stylist', S.nook.anchorX * TILE, S.nook.anchorY * TILE);
      e.bound = true;
      g.entities.add(e, 'npcs');
      return { id: e.id, vanillaId: e.vanillaId, bound: e.bound };
    }, S);
    log('webbed placed', JSON.stringify(placed));
    await pump(page, 40);   // 落地 + anchorTile 首落地写

    // ---- S1 未救不入住（downed_134=true=用户路径;savedStylist 恒假）----
    R.s1 = await page.evaluate(async (S) => {
      const g = window.__swGame;
      g.world.flags['downed_134'] = true;              // 机械 Boss 已败（用户路径）
      g.world.flags['savedStylist'] = false;
      g.prioritizedTownNPCType = 0;
      g.homelessSpawnTimeout = 0;
      g.lastFoundHouse = null;
      const before = g.entities.npcs.filter((n) => n.npcKey === 'stylist' && !n.dead)
        .map((n) => ({ id: n.id, bound: n.bound, home: n.home }));
      g.updateTownNpcArrival();
      g.updateTownNpcArrival();
      const after = g.entities.npcs.filter((n) => n.npcKey === 'stylist' && !n.dead)
        .map((n) => ({ id: n.id, bound: n.bound, home: n.home, vd: n.vanillaId }));
      return {
        downed_134: !!g.world.flags['downed_134'],
        savedStylist: !!g.world.flags['savedStylist'],
        before, after,
        arrivalsSpawned: after.length - before.length,
        webbedUntouched: after.some((n) => n.bound && !n.home),
        verdict: (after.length === before.length && after.some((n) => n.bound && !n.home)
          && !g.world.flags['savedStylist']) ? 'PASS 未救不入住' : 'FAIL',
      };
    }, S);
    log('S1', JSON.stringify(R.s1));

    // ---- 截图①：蛛网裂隙被缚发型师（玩家悬井内）----
    await teleport(page, S.nook.anchorX * 16, (S.nook.y + 5) * 16);
    await pump(page, 25);
    await page.screenshot({ path: join(OUT, 's1-webbed-stylist-no-arrival.png') });

    // ---- S2 右键 talk 交互端点解救（smartInteractNpcId 候选驱动真入口）----
    R.s2 = await page.evaluate(async (S) => {
      const g = window.__swGame;
      const webbed = g.entities.npcs.find((n) => n.npcKey === 'stylist' && n.bound && !n.dead);
      if (!webbed) return { ok: false, why: 'webbed missing' };
      g.smartInteractNpcId = webbed.id;                 // 悬停/智能候选门（npcHoverHit 等价支）
      const talked = g.talkToNearbyNpc(0, 0);           // 真实右键入口（mx,my 走候选支）
      const freed = g.entities.npcs.find((n) => n.id === webbed.id);
      // 关对话（SetTalkNPC 等价态不残留）
      if (g.dialogNpc) g.dialogNpc = null;
      return {
        ok: talked, talkReturned: talked,
        bound: freed?.bound, savedStylist: !!g.world.flags['savedStylist'],
        home: freed?.home ?? null, anchorTile: freed?.anchorTile ?? null,
        x: Math.round(freed?.x ?? 0), y: Math.round(freed?.y ?? 0),
        verdict: (talked && freed && !freed.bound && g.world.flags['savedStylist']) ? 'PASS 解救转正' : 'FAIL',
      };
    }, S);
    log('S2', JSON.stringify(R.s2));
    await pump(page, 15);
    await page.screenshot({ path: join(OUT, 's2-rescued-freed.png') });

    // ---- S3 解救后入住：入驻轮 ① QuickFindHome → 龛口邻房 ----
    R.s3 = await page.evaluate(async (S) => {
      const g = window.__swGame;
      const st = g.world.store;
      const freed = g.entities.npcs.find((n) => n.npcKey === 'stylist' && !n.dead && !n.bound);
      if (!freed) return { ok: false, why: 'freed missing' };
      if (!freed.anchorTile) freed.anchorTile = { x: S.nook.anchorX, y: S.nook.anchorY };  // 保底锚（首落地已写为常态）
      // 清场：S1/S2 轮里 downed_134 门会让蒸汽朋克人（优先链在 stylist 之前）先到
      // 并入住 hFree=原版正轨——S3 需空房,先移出（dead+home 清,锚池随 live 集）
      for (const m of g.entities.npcs) {
        if (m !== freed && !m.dead && m.home && m.home.x === S.hFree.standX && m.home.y === S.hFree.standY) {
          m.home = null; m.dead = true;
        }
      }
      g.prioritizedTownNPCType = 0;
      g.homelessSpawnTimeout = 0;
      g.lastFoundHouse = null;
      g.updateTownNpcArrival();
      const near = g.entities.npcs.find((n) => n.npcKey === 'stylist' && !n.dead);
      const guide = g.entities.npcs.find((n) => n.npcKey === 'guide' && !n.dead);
      // 诊断：纯核直调（同入参）——区分「①胶水 skip」vs「纯核 fail」
      let diag = null;
      if (!near?.home) {
        const { quickFindHome } = await import('/src/world/Housing.ts');
        const others = g.entities.npcs
          .filter((m) => m !== near && !m.dead && !!m.home)
          .map((m) => ({ x: m.home.x, y: m.home.y, npcId: m.vanillaId }));
        const q = quickFindHome(st, others, near.anchorTile.x, near.anchorTile.y, near.vanillaId);
        diag = { q, others, isDay: g.world.clock.isDay, tod: g.world.clock.timeOfDay,
          kickedOut: near.kickedOut, npcCount: g.entities.npcs.length,
          npcList: g.entities.npcs.filter((m) => !m.dead).map((m) => `${m.npcKey}:${m.vanillaId}:h${m.home ? 1 : 0}:b${m.bound ? 1 : 0}`) };
      }
      return {
        ok: true, home: near?.home ?? null, hd: near?.homelessDespawn,
        anchor: near?.anchorTile ?? null, guideHome: guide?.home ?? null, diag,
        isFreeHouse: !!(near?.home && near.home.x === S.hFree.standX && near.home.y === S.hFree.standY),
        verdict: (near?.home) ? 'PASS 解救后入住' : 'FAIL',
      };
    }, S);
    log('S3', JSON.stringify(R.s3));

    // ---- 截图②：入住后龛口邻房取景 ----
    if (R.s3?.home) {
      await teleport(page, (R.s3.home.x) * 16, (R.s3.home.y - 6) * 16);
      await pump(page, 25);
      await page.screenshot({ path: join(OUT, 's3-rescued-moved-in.png') });
    }

    R.verdict = {
      S1: R.s1.verdict, S2: R.s2.verdict, S3: R.s3.verdict,
      allPass: [R.s1.verdict, R.s2.verdict, R.s3.verdict].every((v) => v.startsWith('PASS')),
    };
    log('VERDICT', JSON.stringify(R.verdict));
  } catch (e) {
    console.error('[bj432] FAIL', e);
    process.exitCode = 1;
  } finally {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(OUT, 'probe-result.json'), JSON.stringify(R, null, 2));
    await closeAllBrowsers();
  }
  if (!R.verdict?.allPass && process.exitCode !== 1) {
    console.error('[bj432] VERDICT FAIL', JSON.stringify(R.verdict));
    process.exitCode = 1;
  }
  console.log('[bj432] RESULT_JSON=' + JSON.stringify(R.verdict ?? null));
}

await main();
