#!/usr/bin/env node
// FX44 魂族双缺陷探针：①飞龙(87)杀掉不掉飞翔之魂(575) ②魂掉落物理(落地 vs 原版 ItemNoGravity 飘浮)
// 用法(game/): SW_ORIGIN=http://localhost:5243 node tools/run-diag.mjs --timeout=420000 scripts/_fx44-souls.mjs
import { writeFileSync } from 'node:fs';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';
import { pumpInline } from '../tools/probe/lib/pump.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = process.env.OUT || '/tmp/fx44-souls.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser();
const log = (...a) => console.log('[fx44]', ...a);
try {
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 800 });
  if (!gen.ok) throw new Error('createGame: ' + gen.why);
  log('world up', gen.w, 'x', gen.h);

  const res = await page.evaluate(async () => {
    const g = window.__swGame;
    g.enemySpawnEnabled = false;
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
    const { vanillaIdOfItem } = await import('/src/stats/Shimmer.ts');
    const out = { keyMap: {}, wyvern: [], float: {} };

    // ---- 0) 键映射可用性（掉落 spawn 的门）----
    for (const vid of [575, 520, 521, 547, 548, 549]) {
      out.keyMap[vid] = VANILLA_ITEM_KEY_BY_ID[vid] ?? null;
    }

    // ---- 1) 飞龙掉魂 ×10 杀 ----
    const px = g.player.cx, py = g.player.cy;
    const vidOf = (d) => vanillaIdOfItem(d.itemId);
    for (let i = 0; i < 10; i++) {
      const before = g.entities.drops.length;
      const e = Enemy.fromVanilla(87, px + 40, py - 10);
      if (!e) { out.wyvern.push({ err: 'fromVanilla null' }); continue; }
      e.id = g.entities.nextId++;
      g.entities.add(e, 'enemies');
      e.hurt(1e9, 0, 0, g);
      const got = [];
      for (let k = before; k < g.entities.drops.length; k++) {
        const d = g.entities.drops[k];
        got.push({ vid: vidOf(d), stack: d.stack, x: Math.round(d.x), y: Math.round(d.y) });
      }
      out.wyvern.push(got);
      // 清掉本杀掉落，避免堆叠干扰下一杀计数
      for (let k = g.entities.drops.length - 1; k >= before; k--) g.entities.drops[k].dead = true;
      g.entities.enemies.length = 0;
    }

    // ---- 1b) 真实弹幕击杀（复现用户路径：末击落在【段】hitbox）----
    // 玩家弹幕（Arrow 真实体,projId 1）逐发瞄准第 9 段（vid 88,与 F5 日志 t=8378
    // 同款 hitbox）→ 池空末击必落段 → 头必须经自身死亡分支掉 575（FX44b 门）。
    const wyv2 = Enemy.fromVanilla(87, px + 200, py - 220);
    if (wyv2) {
      wyv2.id = g.entities.nextId++;
      g.entities.add(wyv2, 'enemies');
      const spec2 = Enemy.wormChainSpec(87, () => 0.5);
      const segs2 = Enemy.spawnWormChain(wyv2, spec2.count, spec2.segIds, true);
      for (const s of segs2) { s.id = g.entities.nextId++; g.entities.add(s, 'enemies'); }
      const { Arrow } = await import('/src/entities/Arrow.ts');
      const seg88 = segs2.find((s) => s.vanillaId === 88) ?? segs2[0];
      // 掉落收集按【对象身份】差集（drops 桶在长泵中会压实 dead 项,下标基线会漂移）
      const known = new Set(g.entities.drops);
      let shots = 0;
      for (let i = 0; i < 60 && !wyv2.dead; i++) {
        // 每发带速度预判重新瞄准段 hitbox（真实弹幕路径:Arrow 结算→hurt→池转发）
        const tx = seg88.cx + seg88.vx * 8, ty = seg88.cy + seg88.vy * 8;
        const dx = tx - wyv2.cx, dy = ty - wyv2.cy;
        const ax = tx + (dx ? -Math.sign(dx) * 16 : 16), ay = ty;
        const vx = tx - ax, vy = ty - ay;
        const L = Math.hypot(vx, vy) || 1;
        const a = new Arrow(ax, ay, vx / L * 20, vy / L * 20, 400, 0, 1);
        a.id = g.entities.nextId++;
        g.entities.add(a, 'projectiles');
        shots++;
        for (let k = 0; k < 20 && !wyv2.dead; k++) g.fixedUpdate(1 / 60);
        g.entities.projectiles.length = 0;
      }
      // 箭雨若未打完（虫体机动脱靶）:段 hitbox 补最后一击（真实 hurt 管线,末击必落段）
      const arrowOnly = wyv2.dead;
      if (!wyv2.dead) seg88.hurt(99999, 0, 0, g);
      const got2 = [];
      for (const d of g.entities.drops) {
        if (!known.has(d)) got2.push({ vid: vidOf(d), stack: d.stack });
      }
      out.wyvernArrow = {
        shots, arrowOnly, headDead: !!wyv2.dead, segsDead: segs2.every((s) => s.dead),
        headHp: wyv2.hp, drops: got2,
        headFlags: { boss: !!wyv2.killBossFlag, puppet: !!wyv2.netPuppet, statue: !!wyv2.spawnedFromStatue },
      };
      for (const d of g.entities.drops) { if (!known.has(d)) d.dead = true; }
      g.entities.enemies.length = 0;
      g.entities.projectiles.length = 0;
    }

    // ---- 2) 魂掉落物理：575 / 520 vs 对照（凝胶 23）----
    // 落点：玩家下方开阔地。找地表（向下扫首个实心格）
    const solidAt = (tx, ty) => g.world.store.solid?.[g.world.store.idx(tx, ty)]
      ?? (g.world.tileAt ? !!g.world.tileAt(tx, ty).solid() : false);
    const ptx = Math.floor(px / 16), pty = Math.floor(py / 16);
    let gy = pty;
    for (let dy = 0; dy < 400; dy++) {
      if (solidAt(ptx, pty + dy)) { gy = pty + dy; break; }
    }
    out.float.groundTileY = gy;
    const dropY = (gy - 6) * 16;    // 地表上方 ~96px
    const trials = { soul575: 575, soul520: 520, controlGel: 23 };
    for (const [name, vid] of Object.entries(trials)) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      const d = g.spawnDrop((ptx * 16) + 8, dropY, key, 1, 0, 0);
      if (!d) { out.float[name] = { err: 'spawnDrop null' }; continue; }
      const trace = [];
      for (let t = 0; t < 12; t++) {
        trace.push({ t: t * 20, y: Math.round(d.y), vy: +d.vy.toFixed(3) });
        g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);
        for (let k = 0; k < 17; k++) g.fixedUpdate(1 / 60);
      }
      out.float[name] = { vid, startDropY: dropY, trace, picked: d.dead };
      d.dead = true;
    }
    return out;
  });

  log('keyMap:', JSON.stringify(res.keyMap));
  if (res.wyvernArrow) log('wyvernArrow (real-projectile, final blow on vid-88 segment):', JSON.stringify(res.wyvernArrow));
  log('wyvern kills:');
  for (const [i, ks] of res.wyvern.entries()) log('  kill', i, JSON.stringify(ks));
  const withSoul = res.wyvern.filter((ks) => Array.isArray(ks) && ks.some((d) => d.vid === 575));
  log('wyvern soul575 drop rate:', withSoul.length, '/', res.wyvern.filter((k) => Array.isArray(k)).length);
  const stacks = withSoul.flatMap((ks) => ks.filter((d) => d.vid === 575).map((d) => d.stack));
  log('soul575 stacks:', JSON.stringify(stacks));
  for (const [k, v] of Object.entries(res.float)) {
    if (k === 'groundTileY') { log('groundTileY:', v); continue; }
    log('float', k, JSON.stringify(v.trace));
  }

  // ---- 3) 截图：几枚魂飘在半空 ----
  const shot = await page.evaluate(async () => {
    const g = window.__swGame;
    const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
    const px = g.player.cx, py = g.player.cy;
    g.entities.drops.length = 0;
    const vids = [575, 520, 521, 547, 548, 549];
    for (let i = 0; i < vids.length; i++) {
      g.spawnDrop(px - 90 + i * 36, py - 60, VANILLA_ITEM_KEY_BY_ID[vids[i]], 3, 0, 0);
    }
    for (let i = 0; i < 90; i++) g.fixedUpdate(1 / 60);
    return { drops: g.entities.drops.filter((d) => !d.dead).length };
  });
  log('screenshot scene drops alive:', shot.drops);
  await sleep(400);
  const png = await page.screenshot({ path: '/tmp/fx44-souls.png' });
  log('screenshot bytes:', png?.length ?? 'n/a');

  writeFileSync(OUT, JSON.stringify(res, null, 2));
  log('json →', OUT);
} finally {
  await closeAllBrowsers();
}
