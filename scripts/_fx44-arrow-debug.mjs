#!/usr/bin/env node
// FX44b 箭杀诊断：段 hitbox 末击 → 死亡归属调用序取证
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser();
const log = (...a) => console.log('[fx44dbg]', ...a);
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
    const { Arrow } = await import('/src/entities/Arrow.ts');
    const { vanillaIdOfItem } = await import('/src/stats/Shimmer.ts');
    const out = { calls: [], drops: [], gates: {} };
    const px = g.player.cx, py = g.player.cy;
    const head = Enemy.fromVanilla(87, px + 200, py - 220);
    head.id = g.entities.nextId++;
    g.entities.add(head, 'enemies');
    const spec = Enemy.wormChainSpec(87, () => 0.5);
    const segs = Enemy.spawnWormChain(head, spec.count, spec.segIds, true);
    for (const s of segs) { s.id = g.entities.nextId++; g.entities.add(s, 'enemies'); }
    const seg88 = segs.find((s) => s.vanillaId === 88) ?? segs[0];
    out.gates.chainWired = { headWormNext: !!head.wormNext, seg88Host: seg88.realLifeHost === head, seg88Idx: segs.indexOf(seg88), seg88Vid: seg88.vanillaId };
    // 模块新鲜度：vite 转换产物里应含 FX44b 门（realLifeHost.die）
    const src = await (await fetch('/src/entities/Enemy.ts')).text();
    out.gates.gateInBundle = src.includes('realLifeHost.die');
    out.gates.gateMark = src.includes('FX44b');
    // 调用序插桩
    const wrap = (obj, name) => {
      const orig = obj[name].bind(obj);
      obj[name] = (...a) => {
        out.calls.push([name, Math.round(a[0] ?? 0), 'hp=', Math.round(obj.hp), 'dead=', obj.dead]);
        const r = orig(...a);
        out.calls.push([name + '.ret', 'hp=', Math.round(obj.hp), 'dead=', obj.dead]);
        return r;
      };
    };
    wrap(head, 'hurt'); wrap(head, 'die'); wrap(seg88, 'hurt'); wrap(seg88, 'die');
    const before = g.entities.drops.length;
    for (let i = 0; i < 40 && !head.dead; i++) {
      // 追击预判：瞄准段当前位置 + 其速度×8 的提前量
      const tx = seg88.cx + seg88.vx * 8, ty = seg88.cy + seg88.vy * 8;
      const dx = tx - head.cx, dy = ty - head.cy;
      const ax = tx + (dx ? -Math.sign(dx) * 16 : 16), ay = ty;
      const vx = tx - ax, vy = ty - ay;
      const L = Math.hypot(vx, vy) || 1;
      const a = new Arrow(ax, ay, vx / L * 20, vy / L * 20, 400, 0, 1);
      a.id = g.entities.nextId++;
      g.entities.add(a, 'projectiles');
      for (let k = 0; k < 20 && !head.dead; k++) g.fixedUpdate(1 / 60);
      g.entities.projectiles.length = 0;
    }
    // 若箭杀未完成：段 hurt() 直接补刀（真实 hurt 管线,末击必落段 hitbox）
    if (!head.dead) {
      out.gates.arrowKillIncomplete = true;
      seg88.hurt(99999, 0, 0, g);
    }
    out.gates.afterKill = { headDead: head.dead, headHp: Math.round(head.hp), headMaxHp: head.maxHp, seg88Dead: seg88.dead, seg88Hp: Math.round(seg88.hp), seg88HostAlive: !!(seg88.realLifeHost && !seg88.realLifeHost.dead) };
    for (let k = before; k < g.entities.drops.length; k++) {
      const d = g.entities.drops[k];
      out.drops.push({ vid: vanillaIdOfItem(d.itemId), stack: d.stack });
    }
    out.dropsLen = g.entities.drops.length - before;
    return out;
  });
  log('gates:', JSON.stringify(res.gates));
  log('calls (first 30):');
  for (const c of res.calls.slice(0, 30)) log('  ', JSON.stringify(c));
  log('calls total:', res.calls.length, 'last 8:');
  for (const c of res.calls.slice(-8)) log('  ', JSON.stringify(c));
  log('drops:', JSON.stringify(res.drops), 'len', res.dropsLen);
} finally {
  await closeAllBrowsers();
}
