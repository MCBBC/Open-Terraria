// 灯泡再生机制实机探针(2026-09-01 用户质询「有确保肉后生成了吗」):
//  ① 三王 burst 首灯泡在场(链探针已证,此处复验)
//  ② 远距挖掉(不召王场景:setTile 静默破坏,玩家 >50 格)
//  ③ 强制随机(恒 0)驱动真实演化 tick → UpdateWorld_GrassGrowth case 60
//     1/25 × hardMode+三王 ×1/60 再生分支(WE:784-794 ↔ cs:74480-74558)落新灯泡
//  ④ 新灯泡底承=双列丛林草(fitJunglePairFlat 放置门实证)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1000, height: 700 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
await p.goto('http://localhost:5210/?nosw', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swFlow === 'object', { timeout: 180000 });
await p.evaluate((t) => window.__swFlow.loadJson(t), fs.readFileSync('/tmp/chain-save-stage3.json', 'utf8'));
await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

const R = [];
const ok = (n, c, i = '') => { R.push(`${c ? 'PASS' : 'FAIL'} ${n}${i ? ' | ' + i : ''}`); console.log(R[R.length - 1]); };

// 注入页面内工具
await p.evaluate(async () => {
  const T = await import('/src/data/tiles.ts');
  window.__BULB = T.TILE_BY_KEY['v_238_plantera_s_bulb'];
  window.__GRASS = T.TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 60);   // 丛林草内部 id
  const g = window.__swGame, st = g.world.store;
  const yTop = Math.floor(g.world.groundLevel ?? 330);
  // 灯泡=2×2 整件:只统计【锚点格】(frameX%36==0 && frameY%36==0),防孤儿格假阳
  window.__findBulbs = () => {
    const out = [];
    for (let y = yTop; y < st.h - 200; y++) for (let x = 2; x < st.w - 2; x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] === window.__BULB
        && st.frameX[i] % 36 === 0 && st.frameY[i] % 36 === 0) out.push([x, y]);
    }
    return out;
  };
  window.__T = {
    ticks(n) { for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); },
  };
});

const r1 = await p.evaluate(() => {
  const g = window.__swGame;
  const bulbs = window.__findBulbs();
  return {
    burstBulb: bulbs[0] ?? null, count: bulbs.length,
    hard: !!g.world.flags.hardMode,
    mechs: !!(g.world.flags['downed_134'] && g.world.flags['downed_125'] && g.world.flags['downed_127']),
  };
});
ok('① 三王首杀 burst 灯泡在场', !!r1.burstBulb, `pos=${JSON.stringify(r1.burstBulb)} hard=${r1.hard} mechs=${r1.mechs}`);

const r3 = await p.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const bulbs = window.__findBulbs();
  if (!bulbs.length) return { ok: false };
  const [bx, by] = bulbs[0];
  g.player.x = 1640 * 16; g.player.y = 300 * 16;   // 远离(>50 格召王门不触发)
  g.player.hp = g.player.maxHp; g.player.dead = false;
  // 2×2 整件挖除(真实挖掘走 breakTile 锚点整清;此处等价四格)
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) st.setTile(bx + dx, by + dy, 0);
  return { ok: true, removed: [bx, by], leftover: window.__findBulbs().length };
});
ok('② 远距挖除首灯泡(不召王场景,2×2 整件)', !!r3.ok && (r3.leftover ?? 1) === 0, `removed=${JSON.stringify(r3.removed ?? '')} leftover=${r3.leftover}`);

const r4 = await p.evaluate(() => {
  const g = window.__swGame;
  const orig = Math.random;
  // ★序列化随机:恒 0 会让 1/10 顶植物先手必中占住 minJ → 灯泡门 !active(minJ) 永假
  //   (vanilla 同序:植物 9/10 失败才轮到灯泡掷)。模式=每第 7 次掷给 0.001(命中
  //   1/25 与 1/60),其余 0.9(>1/3 全部植物/藤蔓/蜂巢掷失败,染料 1/2500 亦败)
  let call = 0;
  Math.random = () => (++call % 7 === 0) ? 0.001 : 0.9;
  try {
    for (let i = 0; i < 6000; i++) {
      g.fixedUpdate(1 / 60);
      if (window.__findBulbs().length > 0) break;
    }
  } finally {
    Math.random = orig;
  }
  const bulbs = window.__findBulbs();
  return { regenerated: bulbs.length > 0, bulbs: bulbs.slice(0, 3) };
});
ok('③ 再生分支实机落灯泡(cs:74480-74558 移植)', r4.regenerated, `new=${JSON.stringify(r4.bulbs)}`);

const r5 = await p.evaluate(() => {
  const st = window.__swGame.world.store;
  const bulbs = window.__findBulbs();   // 已是锚点级
  const onGrass = bulbs.filter(([x, y]) => {
    const a = st.idx(x, y + 2), b2 = st.idx(x + 1, y + 2);
    return st.flags[a] && st.type[a] === window.__GRASS && st.flags[b2] && st.type[b2] === window.__GRASS;
  });
  return { n: bulbs.length, onGrass: onGrass.length };
});
ok('④ 新灯泡底承=双列丛林草(fitJunglePairFlat)', r5.n > 0 && r5.onGrass === r5.n, ` bulbs=${r5.n} onGrass=${r5.onGrass}`);

console.log('==== SUMMARY ====');
console.log(R.join('\n'));
await b.close();
