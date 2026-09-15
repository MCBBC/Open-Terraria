#!/usr/bin/env node
// RB30b 探针③：真实召唤路径毁灭者（带诊断）
import { writeFileSync } from 'node:fs';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5246';
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
    const out = {};
    const tx = Math.floor(g.player.cx / 16);
    let r1 = null;
    try { r1 = g.summonBossAtTx('destroyer', tx, false); } catch (e) { r1 = 'throw:' + String(e).slice(0, 150); }
    for (let k = 0; k < 60; k++) g.fixedUpdate(1 / 60);
    out.afterSummon = {
      r1, boss: g.boss ? { vid: g.boss.vanillaId, dead: g.boss.dead, id: g.boss.id } : null,
      enemies: g.entities.enemies.filter((e) => !e.dead).map((e) => e.vanillaId).slice(0, 12),
      enemyCount: g.entities.enemies.length,
    };
    // 池空模拟：头 + 全段逐个打到 hp<=0 前，头 self-host 验证
    const head = g.entities.enemies.find((e) => e.vanillaId === 134 && !e.dead);
    if (head) {
      out.headHost = head.realLifeHost === head;
      out.headHp = head.hp;
      let err = null;
      try { head.hurt(1e9, 0, 0, g); } catch (e) {
        err = String(e && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : e).slice(0, 300);
      }
      out.realKill = { threw: !!err, err, headDead: !!head.dead };
    }
    return out;
  });
  console.log('[rb30b3]', JSON.stringify(res, null, 1));
  writeFileSync('/tmp/rb30b-drops3.json', JSON.stringify(res, null, 2));
} finally { await closeAllBrowsers(); }
