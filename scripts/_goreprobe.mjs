// Gore 死亡碎块 E2E 探针：死亡钩→GorePiece 入 props 桶→物理推进→渲染层无异常。
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_goreprobe.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 1500));

const res = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { liveGorePieces, deathGoreFor } = await import('/src/entities/GorePiece.ts');
  const px = g.player.cx, py = g.player.cy;
  const out = {};

  const killOne = (id) => {
    const e = Enemy.fromVanilla(id, px + 30, py - 10);
    e.id = g.entities.nextId++;
    g.entities.add(e, 'enemies');
    e.hurt(1e9, 1, 0, g);
    return e;
  };

  // ① 僵尸（3）：5 块 = 头 3 + 臂 4×2 + 腿 5×2
  {
    const before = g.entities.props.length;
    killOne(3);
    const pieces = g.entities.props.slice(before).filter((x) => x.constructor?.name === 'GorePiece');
    out.zombie = {
      count: pieces.length, expect: 5,
      ids: pieces.map((x) => x.goreId).sort((a, c) => a - c).join(','),
      yOffsets: pieces.map((x) => Math.round(x.y)),
      inPool: liveGorePieces().length,
    };
  }

  // ② Boss：蜂后 222 → 6+ 块；克眼 4 → 8 块（2×4 循环）
  {
    const before = liveGorePieces().length;
    killOne(222);
    out.queenBee = { spawned: liveGorePieces().length - before, expectMin: 6 };
  }
  {
    const before = liveGorePieces().length;
    killOne(4);
    out.eoc = { spawned: liveGorePieces().length - before, expect: 8 };
  }

  // ③ 史莱姆（1/16）：无表项 → 不出块（原版只出尘）
  {
    const before = liveGorePieces().length;
    killOne(1);
    killOne(16);
    out.slime = { spawned: liveGorePieces().length - before, expect: 0, table1: deathGoreFor(1).length };
  }

  // ④ 物理推进：300 tick 后僵尸碎块应落地（vy=0）且仍在池中（timeLeft 600）
  {
    const z = liveGorePieces().slice(0, 5);
    const y0 = z.map((x) => x.y);
    for (let i = 0; i < 300; i++) g.entities.update(1 / 60, g);
    const z2 = liveGorePieces().slice(0, 5);
    out.physics = {
      landed: z2.filter((x) => x.vy === 0).length,
      moved: z2.some((x, i) => Math.abs(x.y - (y0[i] ?? x.y)) > 1),
      poolAfter300: liveGorePieces().length,
      anyDead: z2.some((x) => x.dead),
      timeLeftSample: z2[0] ? Math.round(z2[0].timeLeft) : null,
    };
  }

  // ⑤ 渲染层跑 60 帧无异常（drawGorePieces 逐帧调用）
  await new Promise((r) => setTimeout(r, 1200));
  out.renderFramesOk = true;
  out.poolFinal = liveGorePieces().length;
  return out;
});

console.log(JSON.stringify({ res, pageErrors: errs }, null, 1));

// 断言汇总
const a = res;
const fail = [];
if (a.zombie.count !== 5) fail.push(`僵尸碎块 ${a.zombie.count}≠5`);
if (a.zombie.ids !== '3,4,4,5,5') fail.push(`僵尸碎块 id ${a.zombie.ids}`);
if (a.eoc.spawned !== 8) fail.push(`克眼碎块 ${a.eoc.spawned}≠8`);
if (a.queenBee.spawned < 6) fail.push(`蜂后碎块 ${a.queenBee.spawned}<6`);
if (a.slime.spawned !== 0) fail.push(`史莱姆出块 ${a.slime.spawned}≠0`);
if (a.physics.landed < 3) fail.push(`落地碎块 ${a.physics.landed}<3`);
if (!a.physics.moved) fail.push('碎块未位移');
if (errs.length) fail.push(`页面异常 ${errs.length} 条`);
console.log(fail.length ? `FAIL: ${fail.join('; ')}` : 'ALL PROBE ASSERTS PASS');
await b.close();
process.exit(fail.length ? 1 : 0);
