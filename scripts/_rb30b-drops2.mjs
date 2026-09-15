#!/usr/bin/env node
// RB30b 探针②：磁吸拉取(修正距离) + 真实召唤路径毁灭者击杀(P0 复现去伪) + 水蛭四消费点归属。
// 用法(game/): SW_ORIGIN=http://localhost:5246 node tools/run-diag.mjs --timeout=420000 scripts/_rb30b-drops2.mjs
import { writeFileSync } from 'node:fs';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5246';
const OUT = process.env.OUT || '/tmp/rb30b-drops2.json';
const log = (...a) => console.log('[rb30b2]', ...a);

const browser = await launchBrowser();
try {
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 800 });
  if (!gen.ok) throw new Error('createGame: ' + gen.why);

  const res = await page.evaluate(async () => {
    const g = window.__swGame;
    g.enemySpawnEnabled = false;
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
    const out = {};

    // ---- [C4b] 磁吸拉取：575 在玩家 30px（默认 42px 拉取域内）----
    {
      const px = g.player.cx, py = g.player.cy;
      const d = g.spawnDrop(px + 30, py, VANILLA_ITEM_KEY_BY_ID[575], 1, 0, 0);
      const d0 = { x: d.x, y: d.y };
      for (let k = 0; k < 60 && !d.dead; k++) g.fixedUpdate(1 / 60);
      out.magnet30 = {
        start: d0, end: { x: Math.round(d.x), y: Math.round(d.y) },
        moved: Math.round(Math.hypot(d.x - d0.x, d.y - d0.y)), picked: d.dead,
      };
      d.dead = true;
    }

    // ---- [A10] 真实召唤路径毁灭者（summonBossAtTx('destroyer') → destroyerAI bInit 建链）----
    // 最后一击落头 hitbox（现实主路径：头冲在最前）→ 池空 → FX44b 门。
    {
      let summonErr = null;
      try {
        const tx = Math.floor(g.player.cx / 16);
        const r = g.summonBossAtTx ? g.summonBossAtTx('destroyer', tx, false) : 'no-api';
        if (typeof r === 'string') summonErr = r;
      } catch (e) { summonErr = String(e).slice(0, 200); }
      // 跑 tick 让 destroyerAI bInit 建链
      for (let k = 0; k < 30; k++) g.fixedUpdate(1 / 60);
      const enemies = g.entities.enemies;
      const head = enemies.find((e) => e.vanillaId === 134 && !e.dead);
      if (!head) {
        out.destroyerRealSummon = { summonErr, note: 'no 134 head found (spawn may need night/conditions)' };
      } else {
        const segCount = enemies.filter((e) => e.vanillaId === 135 || e.vanillaId === 136).length;
        const host = head.realLifeHost;
        let killErr = null;
        try {
          head.hurt(1e9, 0, 0, g);   // 末击落头
        } catch (e) {
          killErr = String(e && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : e).slice(0, 300);
        }
        out.destroyerRealSummon = {
          summonErr, segCount, headSelfHost: host === head,
          threw: !!killErr, err: killErr,
          headDead: !!head.dead,
        };
      }
      g.entities.enemies.length = 0;
    }

    // ---- [A11] 水蛭段杀四消费点：图鉴杀数归属（119 vs 117）----
    {
      const bestiary = g.world.bestiary;
      const before = JSON.stringify(bestiary?.kills ?? bestiary?.state ?? {});
      const head = Enemy.fromVanilla(117, g.player.cx + 40, g.player.cy - 8);
      head.id = g.entities.nextId++; g.entities.add(head, 'enemies');
      const segs = Enemy.spawnWormChain(head, 5, undefined, true);       // spawnWormChainFor 同款（RB30b-F2 修后 sharedLife=true）
      for (const s of segs) { s.id = g.entities.nextId++; g.entities.add(s, 'enemies'); }
      const tail = segs[segs.length - 1];
      tail.playerInteracted = true;
      tail.hurt(1e9, 0, 0, g);
      const after = JSON.stringify(bestiary?.kills ?? bestiary?.state ?? {});
      out.leechBestiary = {
        killerVid: tail.vanillaId, headDead: !!head.dead,
        bestiaryChanged: before !== after,
        bestiaryBefore: before.slice(0, 300), bestiaryAfter: after.slice(0, 300),
        achLastKill: (g.achievements && (g.achievements)._lastKillNetId) ?? null,
      };
      g.entities.enemies.length = 0;
    }

    // ---- [A12] 头杀管线归属对照：飞龙段杀时 onEnemyKilled 归属（recLog 死亡账）----
    {
      const rec = [];
      const orig = g.recLog?.bind(g);
      g.recLog = (kind, e2) => { rec.push({ kind, vid: e2.vid }); return orig ? orig(kind, e2) : undefined; };
      const head = Enemy.fromVanilla(87, g.player.cx + 40, g.player.cy - 8);
      head.id = g.entities.nextId++; g.entities.add(head, 'enemies');
      const spec = Enemy.wormChainSpec(87, () => 0.5);
      const segs = Enemy.spawnWormChain(head, spec.count, spec.segIds, true);
      for (const s of segs) { s.id = g.entities.nextId++; g.entities.add(s, 'enemies'); }
      const seg88 = segs.find((s) => s.vanillaId === 88) ?? segs[0];
      seg88.hurt(1e9, 0, 0, g);
      g.recLog = orig;
      out.wyvernSegKillLog = {
        deaths: rec.filter((r) => r.kind === 'death').map((r) => r.vid),
      };
      g.entities.enemies.length = 0;
    }

    return out;
  });

  log(JSON.stringify(res, null, 1));
  writeFileSync(OUT, JSON.stringify(res, null, 2));
  log('json →', OUT);
} finally {
  await closeAllBrowsers();
}
