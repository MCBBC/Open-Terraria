#!/usr/bin/env node
// RB30b 红队探针：FX44/44b 魂族+realLife 归属门 & FX45 腐化者三尘站 同类攻击面复查。
//   [A] FX44b 归属门逐族：毁灭者(134 段杀/头杀)、飞龙(87 头杀/段杀)、吞噬怪(7 段杀)、
//       水蛭(117 WoF 路径,无 sharedLife)——四消费点(掉落/旗/图鉴/lastCreatureHit)归属核对
//   [B] 双重死亡：头+段同拍归零
//   [C] FX44 悬停分流：dropVelocity 分布、16 项悬停物理、岩浆销毁、磁吸拉取
//   [D] FX45：112/666 尾迹频数、爆裂 20×d18、666 伤害档(CappedAtMaster(32))
// 用法(game/): SW_ORIGIN=http://localhost:5246 node tools/run-diag.mjs --timeout=420000 scripts/_rb30b-drops.mjs
import { writeFileSync } from 'node:fs';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5246';
const OUT = process.env.OUT || '/tmp/rb30b-drops.json';
const log = (...a) => console.log('[rb30b]', ...a);

const browser = await launchBrowser();
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
    const { ITEM_NO_GRAVITY_VIDS } = await import('/src/data/items.ts');
    const { vanillaIdOfItem } = await import('/src/stats/Shimmer.ts');
    const { dropVelocity } = await import('/src/drops/NpcDrops.ts');
    const { RNG } = await import('/src/core/rng');
    const out = {};

    const vidOf = (d) => vanillaIdOfItem(d.itemId);
    const addE = (e) => { e.id = g.entities.nextId++; g.entities.add(e, 'enemies'); return e; };
    const dropsSnapshot = () => g.entities.drops.filter((d) => !d.dead).map((d) => ({ vid: vidOf(d), n: d.stack }));
    const clearDrops = () => { for (const d of g.entities.drops) d.dead = true; };

    // 建链助手。style: 'natural'=spawnWormChain(sharedLife=true)（Game.ts:32495 同款,
    //   头无自指 host）; 'destroyer'=bossAI.ts:2042-2044 同款(头自指 host);
    // 'leech'=bossAI_wof.ts:224 同款(RB30b-F2 修后 spawnWormChainFor→sharedLife=true)
    const buildChain = (headVid, style, segIds) => {
      const head = Enemy.fromVanilla(headVid, g.player.cx + 60, g.player.cy - 8);
      if (!head) return null;
      addE(head);
      let segs = [];
      if (style === 'destroyer') {
        segs = Enemy.spawnWormChain(head, (g.world.seedFlags?.getGoodWorld ? 100 : 80) + 1);
        head.realLifeHost = head;
        for (const s of segs) { s.realLifeHost = head; addE(s); }
      } else if (style === 'natural') {
        segs = Enemy.spawnWormChain(head, segIds ? segIds.count : 8, segIds?.segIds, true);
        for (const s of segs) addE(s);
      } else if (style === 'leech') {
        segs = Enemy.spawnWormChain(head, 5, undefined, true);   // spawnWormChainFor 同参（RB30b-F2 修后 sharedLife=true）
        for (const s of segs) addE(s);
      }
      return { head, segs };
    };

    const FLAGS = () => {
      const w = g.world;
      return {
        lastCreatureHit: g.player.lastCreatureHit,
        bannerKills: JSON.parse(JSON.stringify(w.bannerKills ?? {})),
      };
    };

    // 每节独立 try/catch（递归雷区隔离——A6 首跑已实证 RangeError 会贯穿整个 evaluate）
    const SEC = (name, fn) => {
      try { fn(); } catch (e) {
        const st = e && e.stack ? String(e.stack).split('\n').slice(0, 6).join(' | ') : String(e);
        out[name] = { threw: true, err: st.slice(0, 400) };
        g.entities.enemies.length = 0;
        clearDrops();
      }
    };
    const WYV = { count: 14, segIds: [89, 88, 89, 89, 89, 89, 89, 89, 88, 89, 89, 90, 91, 92] };

    // ---- [A1] 飞龙头杀（对照：FX44b 门不触发,头自身死亡管线）----
    SEC('wyvernHeadKill', () => {
      const { head, segs } = buildChain(87, 'natural', WYV);
      const b0 = FLAGS();
      head.hurt(1e9, 0, 0, g);
      out.wyvernHeadKill = {
        headDead: !!head.dead, segsDead: segs.every((s) => s.dead),
        drops: dropsSnapshot(), flagsAfter: FLAGS(), flagsBefore: b0,
      };
      clearDrops(); g.entities.enemies.length = 0;
    });

    // ---- [A2] 飞龙段杀（FX44b 门：段 hp≤0 → 头.die()）----
    SEC('wyvernSegKill', () => {
      const { head, segs } = buildChain(87, 'natural', WYV);
      const seg88 = segs.find((s) => s.vanillaId === 88) ?? segs[0];
      seg88.hurt(1e9, 0, 0, g);
      out.wyvernSegKill = {
        killerVid: seg88.vanillaId, headDead: !!head.dead, headHp: head.hp,
        segsDead: segs.every((s) => s.dead), drops: dropsSnapshot(), flagsAfter: FLAGS(),
      };
      clearDrops(); g.entities.enemies.length = 0;
    });

    // ---- [A3] 吞噬怪 7 段杀（经典蠕虫,自然生成 sharedLife=true）----
    SEC('devourerTailKill', () => {
      const { head, segs } = buildChain(7, 'natural', { count: 9 });
      const tail = segs[segs.length - 1];
      const b0 = FLAGS();
      tail.hurt(1e9, 0, 0, g);
      out.devourerTailKill = {
        killerVid: tail.vanillaId, headDead: !!head.dead,
        segsDead: segs.every((s) => s.dead), drops: dropsSnapshot(), flagsAfter: FLAGS(), flagsBefore: b0,
      };
      clearDrops(); g.entities.enemies.length = 0;
    });

    // ---- [A4] 水蛭 117 段杀（WoF 路径：spawnWormChainFor,无 sharedLife）----
    SEC('leechTailKill', () => {
      const { head, segs } = buildChain(117, 'leech');
      const tail = segs[segs.length - 1];
      const b0 = FLAGS();
      tail.hurt(1e9, 0, 0, g);
      out.leechTailKill = {
        killerVid: tail.vanillaId, headDead: !!head.dead, headHp: head.hp,
        segsDead: segs.every((s) => s.dead), drops: dropsSnapshot(), flagsAfter: FLAGS(), flagsBefore: b0,
      };
      clearDrops(); g.entities.enemies.length = 0;
    });

    // ---- [A5] 水蛭 117 头杀（对照）----
    SEC('leechHeadKill', () => {
      const { head, segs } = buildChain(117, 'leech');
      const b0 = FLAGS();
      head.hurt(1e9, 0, 0, g);
      out.leechHeadKill = {
        headDead: !!head.dead, segsDead: segs.every((s) => s.dead),
        drops: dropsSnapshot(), flagsAfter: FLAGS(), flagsBefore: b0,
      };
      clearDrops(); g.entities.enemies.length = 0;
    });

    // ---- [A6] 毁灭者段杀（bossAI 建链：头自指 host + 全段 host=头）----
    SEC('destroyerSegKill', () => {
      const { head, segs } = buildChain(134, 'destroyer');
      const mid = segs[Math.floor(segs.length / 2)];
      const b0 = FLAGS();
      mid.hurt(1e9, 0, 0, g);
      out.destroyerSegKill = {
        killerVid: mid.vanillaId, headDead: !!head.dead,
        segsDead: segs.every((s) => s.dead), drops: dropsSnapshot(), flagsAfter: FLAGS(), flagsBefore: b0,
      };
      clearDrops(); g.entities.enemies.length = 0;
    });

    // ---- [A7] 毁灭者头杀（头 realLifeHost=自指 → FX44b 门自指环风险）----
    SEC('destroyerHeadKill', () => {
      const { head, segs } = buildChain(134, 'destroyer');
      let err = null;
      try {
        head.hurt(1e9, 0, 0, g);
      } catch (e) {
        err = String(e && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : e).slice(0, 400);
      }
      out.destroyerHeadKill = {
        threw: !!err, err, headDead: !!head.dead, headHp: head.hp,
        drops: dropsSnapshot(),
      };
      clearDrops(); g.entities.enemies.length = 0;
    });

    // ---- [A8] 千足蜈蚣 412 同款自指建链（bossAI_lunar_misc:1979）段杀 ----
    SEC('crawltipedeSegKill', () => {
      const head = Enemy.fromVanilla(412, g.player.cx + 60, g.player.cy - 8);
      addE(head);
      const segs = Enemy.spawnWormChain(head, 30);
      head.realLifeHost = head;
      for (const s of segs) { s.realLifeHost = head; addE(s); }
      const mid = segs[15];
      let err = null;
      try { mid.hurt(1e9, 0, 0, g); } catch (e) {
        err = String(e && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : e).slice(0, 400);
      }
      out.crawltipedeSegKill = { threw: !!err, err: err ?? null, headDead: !!head.dead, drops: dropsSnapshot() };
      clearDrops(); g.entities.enemies.length = 0;
    });

    // ---- [A9] 双重死亡：头 hp=1 + 段 hp=1,同拍先杀头再杀段（及反向）----
    SEC('doubleKillHeadFirst', () => {
      const { head, segs } = buildChain(87, 'natural', WYV);
      head.hp = 1;
      const seg88 = segs.find((s) => s.vanillaId === 88) ?? segs[0];
      seg88.hp = 1;
      const r1 = head.hurt(10, 0, 0, g);   // 头先归零（自身死亡管线+级联）
      const r2 = seg88.hurt(10, 0, 0, g);  // 同拍段再被打（应被 dead 门拦）
      out.doubleKillHeadFirst = { r1, r2, headDead: !!head.dead, segDead: !!seg88.dead, drops: dropsSnapshot() };
      clearDrops(); g.entities.enemies.length = 0;
    });
    SEC('doubleKillSegFirst', () => {
      const { head, segs } = buildChain(87, 'natural', WYV);
      head.hp = 1;
      const seg88 = segs.find((s) => s.vanillaId === 88) ?? segs[0];
      seg88.hp = 1;
      const r1 = seg88.hurt(10, 0, 0, g);  // 段先归零 → 门触发头.die()
      const r2 = head.hurt(10, 0, 0, g);   // 同拍头再被打（头已 dead?）
      out.doubleKillSegFirst = { r1, r2, headDead: !!head.dead, segDead: !!seg88.dead, drops: dropsSnapshot() };
      clearDrops(); g.entities.enemies.length = 0;
    });

    // ---- [C1] dropVelocity 分布（ItemNoGravity 双向 vs 默认 vy 上界）----
    {
      const rng = new RNG(12345);
      const soul = { vxs: [], vys: [] };
      const norm = { vxs: [], vys: [] };
      for (let i = 0; i < 600; i++) {
        const a = dropVelocity(rng, 575);
        soul.vxs.push(a.vx); soul.vys.push(a.vy);
        const b = dropVelocity(rng, 23);
        norm.vxs.push(b.vx); norm.vys.push(b.vy);
      }
      const rng2 = new RNG(999);
      const vySamples = [];
      for (let i = 0; i < 400; i++) vySamples.push(dropVelocity(rng2, 23).vy);
      out.dropVelocity = {
        soulVyMin: Math.min(...soul.vys), soulVyMax: Math.max(...soul.vys),
        soulVxMin: Math.min(...soul.vxs), soulVxMax: Math.max(...soul.vxs),
        normVyMin: Math.min(...norm.vys), normVyMax: Math.max(...norm.vys),
        normVyHasNeg15: norm.vys.some((v) => v === -1.5),
        normVyNeg15Count: norm.vys.filter((v) => v === -1.5).length,
      };
    }

    // ---- [C2] 16 项悬停物理：575 空中悬停 vs 23(凝胶)下坠 ----
    {
      const solidAt = (tx, ty) => !!(g.world.store.flags[g.world.store.idx(tx, ty)] && g.world.store.isSolid(tx, ty));
      const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
      let gy = pty;
      for (let dy = 0; dy < 400; dy++) { if (solidAt(ptx, pty + dy)) { gy = pty + dy; break; } }
      const dropY = (gy - 8) * 16;
      const trace = {};
      for (const [name, vid] of [['soul575', 575], ['gel23', 23]]) {
        const d = g.spawnDrop(ptx * 16 + 8, dropY, VANILLA_ITEM_KEY_BY_ID[vid], 1, 0, 0);
        const tr = [];
        for (let t = 0; t < 10; t++) {
          tr.push({ y: Math.round(d.y), vy: +d.vy.toFixed(2) });
          for (let k = 0; k < 20; k++) g.fixedUpdate(1 / 60);
        }
        trace[name] = { vid, tr, dead: d.dead };
        d.dead = true;
      }
      out.hover = { groundTileY: gy, dropY, trace };
    }

    // ---- [C3] 岩浆销毁：575 放进岩浆格 ----
    {
      const st = g.world.store;
      const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
      let ly = pty + 40;
      for (let dy = 0; dy < 300; dy++) { if (!st.isSolid(ptx, pty + dy)) { ly = pty + dy; break; } }
      // 找空腔:向上找连续 3 格空气
      let ay = -1;
      for (let dy = 300; dy >= 0; dy--) {
        const y = pty + dy;
        if (y < pty) break;
        if (!st.isSolid(ptx, y) && !st.isSolid(ptx, y - 1) && !st.isSolid(ptx, y - 2) && y > pty + 4) { ay = y - 1; break; }
      }
      if (ay > 0) {
        for (let y = ay; y < ay + 2; y++) { const i = st.idx(ptx, y); st.liquid[i] = 255; st.liquidType[i] = 2; }
        const d = g.spawnDrop(ptx * 16 + 8, ay * 16, VANILLA_ITEM_KEY_BY_ID[575], 1, 0, 0);
        let ticks = 0;
        while (!d.dead && ticks < 300) { g.fixedUpdate(1 / 60); ticks++; }
        out.lava = { soul575DeadInLava: d.dead, ticks };
        for (let y = ay; y < ay + 2; y++) { const i = st.idx(ptx, y); st.liquid[i] = 0; st.liquidType[i] = 0; }
      } else out.lava = { skip: 'no air pocket' };
    }

    // ---- [C4] 磁吸拉取：575 在玩家旁 60px（无重力件被拉取面吸住）----
    {
      const px = g.player.cx, py = g.player.cy;
      const d = g.spawnDrop(px + 60, py, VANILLA_ITEM_KEY_BY_ID[575], 1, 0, 0);
      const d0 = { x: d.x, y: d.y };
      for (let k = 0; k < 40 && !d.dead; k++) g.fixedUpdate(1 / 60);
      out.magnet = {
        start: d0, end: { x: Math.round(d.x), y: Math.round(d.y) },
        moved: Math.hypot(d.x - d0.x, d.y - d0.y), picked: d.dead,
      };
      d.dead = true;
    }

    // ---- [D1] FX45：112/666 尾迹/爆裂/伤害档 ----
    {
      const dustCalls = [];
      const origDust = g.spawnDust ? g.spawnDust.bind(g) : null;
      g.spawnDust = (...a) => { dustCalls.push({ t: a[4], x: a[0], y: a[1] }); return origDust ? origDust(...a) : null; };
      const sounds = [];
      const origSfx = g.playSfxFiles?.bind(g);
      g.playSfxFiles = (files, v, x, y) => { sounds.push(files); return origSfx ? origSfx(files, v, x, y) : undefined; };
      const info = {};
      for (const vid of [112, 666]) {
        dustCalls.length = 0; sounds.length = 0;
        const e = Enemy.fromVanilla(vid, g.player.cx + 120, g.player.cy - 40);
        if (!e) { info['v' + vid] = { err: 'fromVanilla null' }; continue; }
        addE(e);
        e.vx = 2; e.vy = 1;                 // 强制飞行相（尾迹采样）
        const perTick = [];
        for (let t = 0; t < 12; t++) {
          dustCalls.length = 0;
          e.fixedUpdate(1 / 60, g);
          perTick.push(dustCalls.filter((c) => c.t === 18).length);
          if (e.dead) break;
        }
        info['v' + vid] = {
          ai0: e.ai0, damage: e.def.damage, dead: !!e.dead,
          d18PerTick: perTick, burstSound: sounds.slice(0, 3),
        };
        e.dead = true;
      }
      g.entities.enemies.length = 0;
      g.spawnDust = origDust; g.playSfxFiles = origSfx;
      out.fx45 = info;
    }

    // ---- [E] ItemNoGravity 表对账（本地 vs 原版 16 项）----
    out.noGravitySet = [...ITEM_NO_GRAVITY_VIDS].sort((a, b) => a - b);

    return out;
  });

  log(JSON.stringify(res, null, 1).slice(0, 9000));
  writeFileSync(OUT, JSON.stringify(res, null, 2));
  log('json →', OUT);
} finally {
  await closeAllBrowsers();
}
