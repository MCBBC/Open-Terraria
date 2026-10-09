// BJ582 藤壶法杖(5463→哨站 1025)实拍探针。
// 场景：天控竞技场（石板 floor），藤堡悬停于场中，僵尸 5 档距离（曼哈顿 200/700/
// 1150/1250/1500px 自炮口），步进 600 拍记录 1026 出弹 → 实测索敌距离。
// 另拍形态截图（悬浮态 = 原版应有三气球；吸附态对照）。
// 产物：/tmp/bj582-log.json + /tmp/bj582-*.png
import { writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump,
  godMode, clearEnemies, Ledger, tileIdBySheet, freezeClock,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: 'bj582', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await clearEnemies(page);
  // 夜间钉钟（僵尸昼行驱散会毁靶阵）
  const ck = await freezeClock(page, { tod: 0 });
  L.chk('freezeClock', ck.ok, JSON.stringify(ck).slice(0, 80));
  const stone = await tileIdBySheet(page, 1);
  L.chk('stone-id', stone.ok, JSON.stringify(stone));
  await pump(page, 20);

  // ---- 天控竞技场 + 藤堡 + 僵尸阵 ----
  const setup = await page.evaluate(async (stoneId) => {
    const g = window.__swGame;
    const st = g.world.store;
    const M = await import('/src/entities/MinionProj.ts');
    const p = g.player;
    // 关自然刷怪（朱ourney 滑杆 0 = shouldDisableSpawns）
    if (g.world.journeyPowers) g.world.journeyPowers.spawnRateSlider = 0;
    const tx0 = Math.floor(p.cx / 16);
    // 地表
    let surfRow = 0;
    for (let y = 1; y < st.h; y++) { if (st.isSolid(tx0, y)) { surfRow = y; break; } }
    const arenaRow = surfRow - 90;                  // 高空
    const ax0 = tx0 - 110, ax1 = tx0 + 110;
    for (let x = ax0; x <= ax1; x++) {
      st.setTile(x, arenaRow, stoneId);             // 石板地
      for (let dy = 1; dy <= 8; dy++) st.setTile(x, arenaRow - dy, 0);   // 上方清空
    }
    const floorTop = arenaRow * 16;
    const bx = p.cx;
    // 玩家提到竞技场（防僵尸离屏消亡;godMode 保护）
    p.x = bx - p.w / 2; p.y = floorTop - 200 - p.h; p.vx = 0; p.vy = 0;
    // 藤堡：floor 上方 16 格悬停（Top 起 15 格内无实心 → flag2=false 原地悬停）
    const by = floorTop - 16 * 16 - 19;
    const barn = new M.MinionProj(bx - 21, by, 1025, 33, 7.5, true, 0, false, () => g.player);
    g.entities.add(barn, 'projectiles');
    // 僵尸 5 档
    const dists = [200, 700, 1150, 1250, 1500];
    const flow = window.__swFlow;
    const zs = [];
    for (const d of dists) {
      const zx = bx + d;
      const meta = await flow.spawnVanillaEnemy(3, zx, floorTop - 40);
      zs.push(meta);
    }
    return { surfRow, arenaRow, bx, by, floorTop, dists, zs, barnRef: true, stoneId };
  }, stone.id);
  L.say('setup=' + JSON.stringify(setup));

  // ---- 步进 600 拍，记录 1026 出弹 ----
  const log = { shots: [], barn: null, zs: [], trials: [] };
  for (let b = 0; b < 20; b++) {
    await pump(page, 30);
    const snap = await page.evaluate((bb) => {
      const g = window.__swGame;
      const projs = (g.entities?.projectiles ?? []).filter((e) => e.projId === 1026 && !e.dead);
      const barn = (g.entities?.projectiles ?? []).find((e) => e.projId === 1025);
      const zs = (g.entities?.enemies ?? []).filter((e) => e.vanillaId === 3 && !e.dead)
        .map((e) => ({ id: e.id, cx: Math.round(e.cx), cy: Math.round(e.cy) }));
      return {
        tick: bb,
        shots: projs.map((e) => ({ x: Math.round(e.x), y: Math.round(e.y), vx: Math.round(e.vx * 100) / 100, vy: Math.round(e.vy * 100) / 100, age: e.age })),
        barn: barn ? { cx: Math.round(barn.cx), cy: Math.round(barn.cy), sAttach: barn.sAttach, sFrame: barn.sFrame, sCool: barn.sCool, w: barn.w, h: barn.h, facing: barn.facing } : null,
        zs,
      };
    }, b);
    log.shots.push(...snap.shots.map((s) => ({ batch: b, ...s })));
    if (b === 0 || b === 19) log.zs.push({ batch: b, zs: snap.zs });
    if (snap.barn) log.barn = snap.barn;
  }
  // 出弹时的瞄准对象判定：按出弹点+方向与僵尸方位匹配
  const zsNow = log.zs.length ? log.zs[log.zs.length - 1].zs : [];
  log.analysis = {
    shotCount: log.shots.length,
    zsNow,
    barn: log.barn,
  };
  L.say('shots=' + log.shots.length + ' barn=' + JSON.stringify(log.barn));

  // ---- 距离响应试验：单靶逐档（每档独立清场,横/纵两向;Node 泵真帧步进）----
  const barnGeo = await page.evaluate(() => {
    const barn = (window.__swGame.entities?.projectiles ?? []).find((e) => e.projId === 1025);
    return barn ? { cx: barn.cx, cy: barn.cy, floorTop: (Math.floor(barn.cy / 16) + 16) * 16 } : null;
  });
  const trialSpecs = [
    { d: 200, vertical: false }, { d: 600, vertical: false }, { d: 1000, vertical: false },
    { d: 1150, vertical: false }, { d: 1230, vertical: false }, { d: 1400, vertical: false },
    { d: 1600, vertical: false },
    { d: 600, vertical: true }, { d: 1150, vertical: true },
  ];
  const trials = { ok: !!barnGeo, res: [] };
  for (const spec of trialSpecs) {
    const d = spec.d, vertical = spec.vertical;
    const zx = vertical ? barnGeo.cx : barnGeo.cx + d;
    const zy = vertical ? barnGeo.cy - d : barnGeo.floorTop - 40;
    await page.evaluate(({ zx, zy }) => {
      const g = window.__swGame;
      g.paused = false;
      g.entities.enemies.length = 0;
      const keep = g.entities.projectiles.filter((e) => e.projId === 1025);
      g.entities.projectiles.length = 0;
      for (const k of keep) g.entities.projectiles.push(k);
      void window.__swFlow.spawnVanillaEnemy(3, zx, zy);
    }, { zx, zy });
    await pump(page, 2);
    let fired = 0, firstDir = null, zsFinal = [], shotDirs = [];
    const seenIds = new Set();
    for (let b = 0; b < 8; b++) {
      await pump(page, 10);
      const snap = await page.evaluate(({ zx, zy, vertical, floorTop, barnCx, barnCy }) => {
        const g = window.__swGame;
        const zs = (g.entities?.enemies ?? []).filter((e) => e.vanillaId === 3 && !e.dead);
        for (const z of zs) {
          z.hp = 9999999; z.maxHp = 9999999; z.vx = 0;
          z.x = (vertical ? barnCx - z.w / 2 : zx - z.w / 2);
          z.y = (vertical ? zy - z.h / 2 : floorTop - 40 - z.h / 2);
        }
        return {
          zs: zs.map((e) => ({ id: e.id, cx: Math.round(e.cx), cy: Math.round(e.cy), hp: e.hp, dead: !!e.dead })),
          shots: (g.entities?.projectiles ?? []).filter((e) => e.projId === 1026)
            .map((e) => ({ id: e.id ?? -1, vx: Math.round(e.vx * 100) / 100, vy: Math.round(e.vy * 100) / 100, dead: !!e.dead, x: Math.round(e.x), y: Math.round(e.y) })),
        };
      }, { zx, zy, vertical, floorTop: barnGeo.floorTop, barnCx: barnGeo.cx, barnCy: barnGeo.cy });
      for (const s of snap.shots) {
        const key = s.id + '|' + s.vx + '|' + s.vy + '|' + s.x + '|' + s.y;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          shotDirs.push(s);
          if (firstDir === null) firstDir = { vx: s.vx, vy: s.vy };
        }
      }
      fired = seenIds.size;
      zsFinal = snap.zs;
    }
    const manh = zsFinal.length
      ? Math.abs(barnGeo.cx - zsFinal[0].cx) + Math.abs(barnGeo.cy + 10 - zsFinal[0].cy)
      : null;
    trials.res.push({ d, vertical, fired, firstDir, manh, alive: zsFinal.length > 0 });
  }
  L.say('trials=' + JSON.stringify(trials.res));
  log.trials = trials;

  // ---- 形态截图（悬浮态;先冻结）----
  await page.evaluate(() => { window.__swGame.paused = true; });
  await new Promise((r) => setTimeout(r, 500));
  const geom = await page.evaluate(() => {
    const g = window.__swGame;
    const barn = (g.entities?.projectiles ?? []).find((e) => e.projId === 1025);
    const cv = [...document.querySelectorAll('#game-root canvas')].sort((a, b2) => b2.width * b2.height - a.width * a.height)[0];
    const r = g.renderer;
    const z = r.glZoom ?? 1;
    const toScr = (wx, wy) => ({ x: (wx - r.glCamX) * z + cv.width / 2, y: (wy - r.glCamY) * z + cv.height / 2 });
    return barn ? { scr: toScr(barn.cx, barn.cy - 40), W: cv.width, H: cv.height } : null;
  });
  if (geom) {
    const x = Math.max(0, geom.scr.x - 160), y = Math.max(0, geom.scr.y - 160);
    await page.screenshot({ path: '/tmp/bj582-hover.png', clip: { x, y, width: 320, height: 320 } });
  }
  // 附着态：给藤堡顶上加天花板让它吸附（解冻,再冻结拍照）
  await page.evaluate((stoneId) => {
    const g = window.__swGame;
    g.paused = false;
    const barn = (g.entities?.projectiles ?? []).find((e) => e.projId === 1025);
    const st = g.world.store;
    if (barn) {
      const ty = Math.floor(barn.y / 16) - 3;
      for (let dx = -3; dx <= 3; dx++) st.setTile(Math.floor(barn.cx / 16) + dx, ty, stoneId);
      barn.sAttach = 0;
      barn.vy = -2;
    }
  }, stone.id);
  await pump(page, 120);
  await page.evaluate(() => { window.__swGame.paused = true; });
  await new Promise((r) => setTimeout(r, 500));
  const geom2 = await page.evaluate(() => {
    const g = window.__swGame;
    const barn = (g.entities?.projectiles ?? []).find((e) => e.projId === 1025);
    const cv = [...document.querySelectorAll('#game-root canvas')].sort((a, b2) => b2.width * b2.height - a.width * a.height)[0];
    const r = g.renderer;
    const z = r.glZoom ?? 1;
    const toScr = (wx, wy) => ({ x: (wx - r.glCamX) * z + cv.width / 2, y: (wy - r.glCamY) * z + cv.height / 2 });
    return barn ? { scr: toScr(barn.cx, barn.cy - 40), st: { sAttach: barn.sAttach, sFrame: barn.sFrame } } : null;
  });
  if (geom2) {
    const x = Math.max(0, geom2.scr.x - 160), y = Math.max(0, geom2.scr.y - 160);
    await page.screenshot({ path: '/tmp/bj582-attached.png', clip: { x, y, width: 320, height: 320 } });
    L.say('attached=' + JSON.stringify(geom2.st));
  }
  // ---- 全景（含僵尸阵+出弹线）----
  await page.screenshot({ path: '/tmp/bj582-full.png' });

  // ---- 帧数据自证 ----
  const frames = await page.evaluate(async () => {
    const A = await import('/src/entities/Arrow.ts');
    const spr = A.projSprite(1025);
    const spr594 = await fetch('sprites/vanilla/NPC_594.png').then((r) => r.ok).catch(() => false);
    return { frames1025: A.projFrameCount(1025), sprite: spr ? { w: spr.width, h: spr.height } : null, npc594ok: spr594 };
  });
  L.say('frames=' + JSON.stringify(frames));
  log.frames = frames;
  writeFileSync('/tmp/bj582-log.json', JSON.stringify(log, null, 2));
  console.log('LOG ' + JSON.stringify(log.analysis));
} finally {
  await browser.close().catch(() => {});
}
L.print();
