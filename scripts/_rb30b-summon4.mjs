#!/usr/bin/env node
// RB30b 探针④：真实 destroyerAI bInit 建链 → 段杀（消除"手工建链伪影"）
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
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const out = {};
    // 头裸生（真实 AI 首帧 bInit 建链——bossAI.ts destroyerAI :2040-2044 原代码）
    const head = Enemy.fromVanilla(134, g.player.cx, g.player.cy - 60);
    head.id = g.entities.nextId++;
    g.entities.add(head, 'enemies');
    g.boss = head;
    for (let k = 0; k < 5 && !head.wormNext; k++) g.fixedUpdate(1 / 60);
    const segs = [];
    for (let s = head.wormNext; s; s = s.wormNext) segs.push(s);
    out.chain = {
      segCount: segs.length,
      headSelfHost: head.realLifeHost === head,
      segsHostHead: segs.every((s) => s.realLifeHost === head),
    };
    // 真实段杀（hurt 管线 = 弹幕结算同函数）
    const mid = segs[Math.floor(segs.length / 2)];
    let err = null;
    try { mid.hurt(1e9, 0, 0, g); } catch (e) {
      err = String(e && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : e).slice(0, 300);
    }
    out.segKill = { threw: !!err, err, headDead: !!head.dead };
    // 头杀（第二条链）
    g.entities.enemies.length = 0;
    const head2 = Enemy.fromVanilla(134, g.player.cx, g.player.cy - 60);
    head2.id = g.entities.nextId++;
    g.entities.add(head2, 'enemies');
    for (let k = 0; k < 5 && !head2.wormNext; k++) g.fixedUpdate(1 / 60);
    let err2 = null;
    try { head2.hurt(1e9, 0, 0, g); } catch (e) {
      err2 = String(e && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : e).slice(0, 300);
    }
    out.headKill = { threw: !!err2, err: err2, headDead: !!head2.dead };
    g.entities.enemies.length = 0;
    return out;
  });
  console.log('[rb30b4]', JSON.stringify(res, null, 1));
  writeFileSync('/tmp/rb30b-drops4.json', JSON.stringify(res, null, 2));
} finally { await closeAllBrowsers(); }
