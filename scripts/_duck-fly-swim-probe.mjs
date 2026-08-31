// 绿头鸭(365)飞↔游状态机跳切 v2 探针(2026-08-31)。
// 修复 v1 教训:v1 双鸭混流一条日志且没验证水体存续(wetFlips=0 全程未沾水)。
// 本版:① 分实体 id 记录;② 建/中期/末期三时点池水对账;③ 墙体改用深挖实心块并断言;
//      ④ 玩家不动(出生点),双池 ≥420px 外无惊扰;⑤ 每实体每帧记录 ai0/ai1/wet/cy/vy/hp。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 60000 });
for (let i = 0; i < 40 && !(await page.evaluate(() => !!document.querySelector('[data-act=sp]'))); i++) await sleep(500);
await sleep(2500);
await page.evaluate(() => document.querySelector('[data-act=sp]')?.click());
await page.waitForSelector('.sw-vsel-panel', { timeout: 10000 });
await sleep(800);
{
  const hasChar = await page.evaluate(() => !!document.querySelector('.sw-vsel-list .sw-vitem'));
  if (!hasChar) {
    await page.evaluate(() => document.querySelector('.sw-vsel-footer [data-act=new]')?.click());
    await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
    await sleep(500);
    await page.evaluate(() => document.querySelector('.sw-char-panel input[type=text]')?.focus());
    await page.keyboard.type('鸭探针');
    await sleep(200);
    await page.evaluate(() => document.querySelector('.sw-char-footer [data-act=create]')?.click());
    await page.waitForSelector('.sw-vsel-list .sw-vitem', { timeout: 10000 });
    await sleep(600);
  }
  const idx = await page.evaluate(() => Math.max(0,
    [...document.querySelectorAll('.sw-vsel-list .sw-vitem')].findIndex(e => e.textContent.includes('鸭探针'))));
  await page.evaluate((i) => document.querySelectorAll('.sw-vsel-list .sw-vitem')[i]?.click(), idx);
}
await page.waitForFunction(() =>
  /世界|World/i.test(document.querySelector('.sw-vsel-title')?.textContent ?? ''), { timeout: 10000 });
await sleep(700);
{
  const hasW = await page.evaluate(() => document.querySelectorAll('.sw-vsel-list .sw-vitem').length > 0);
  if (!hasW) {
    await page.evaluate(() => document.querySelector('.sw-vsel-footer [data-act=new]')?.click());
    await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
    await sleep(400);
    await page.evaluate(() => (document.querySelector('.sw-wc-panel input[data-f=name]')).focus());
    await page.keyboard.type('DuckLab');
    await sleep(150);
    await page.evaluate(() => document.querySelector('[data-g=size] .sw-wc-opt')?.click());
    await sleep(150);
    await page.evaluate(() => document.querySelector('.sw-wc-footer [data-act=create]')?.click());
  } else {
    const idx = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.sw-vsel-list .sw-vitem')];
      return Math.max(0, items.findIndex(el => el.textContent.includes('DuckLab')));
    });
    await page.evaluate((i) => document.querySelectorAll('.sw-vsel-list .sw-vitem')[i]?.click(), idx);
  }
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 240000 });
await sleep(2500);

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const T = 16;
  const waitMs = (ms) => new Promise(r => setTimeout(r, ms));
  await waitMs(400);

  const p = g.player;
  const liq = (x, y) => (st.inBounds(x, y) ? st.liquid[st.idx(x, y)] : 0);

  // ---- 找天然地表水塘:表面暴露(上方 3 行无实心)、≥4 列连片、底有实心 ----
  function findPonds(maxN = 4) {
    const found = [];
    const startY = Math.max(1, (p.cy / T | 0) - 140);
    const endY = Math.min(st.h - 60, (p.cy / T | 0) + 160);
    for (let sx = Math.max(4, (p.cx / T | 0) - 320); sx < Math.min(st.w - 4, (p.cx / T | 0) + 500) && found.length < maxN; sx += 3) {
      for (let sy = startY; sy < endY; sy++) {
        if (!(liq(sx, sy) > 120)) continue;
        if (liq(sx, sy - 1) > 0) continue;                        // 已是该列水下,跳过非表层
        // 表层要求:上邻无液体且上方两行无实心遮挡
        if (st.isActive(sx, sy - 1) && st.isSolid(sx, sy - 1)) continue;
        if (st.isActive(sx, sy - 2) && st.isSolid(sx, sy - 2)) continue;
        // 连片宽度
        let L = sx, R = sx;
        while (L > sx - 24 && liq(L - 1, sy) > 120 && !(st.isActive(L - 1, sy - 1) && st.isSolid(L - 1, sy - 1))) L--;
        while (R < sx + 24 && liq(R + 1, sy) > 120 && !(st.isActive(R + 1, sy - 1) && st.isSolid(R + 1, sy - 1))) R++;
        const width = R - L + 1;
        if (width < 5) continue;
        // 底部有实心托底(沿中间列向下找 ≤4 行)
        let okFloor = false;
        for (let d = 1; d <= 4; d++) if (st.isActive(sx, sy + d) && st.isSolid(sx, sy + d)) { okFloor = true; break; }
        if (!okFloor) continue;
        // 深度轮廓:统计每列最上部液面到托底的格数
        let depthSum = 0;
        for (let x = L; x <= R; x++) {
          for (let d = 1; d <= 5; d++) { if (st.isActive(x, sy + d) && st.isSolid(x, sy + d)) { depthSum += d; break; } }
        }
        found.push({ left: L, right: R, top: sy, width, avgDepth: +(depthSum / width).toFixed(2),
          cxPx: ((L + R + 1) / 2) * T });
        sx += width + 4;
        break;                                                    // 本列只取一处,推进 sx
      }
    }
    return found.slice(0, maxN);
  }

  const ponds = findPonds(4);
  if (ponds.length < 2) return { fail: '找不到足够天然水塘', pondsFound: ponds };

  // ---- 钩子:按实体 id 分流(含每帧原始液三行+脚盒) ----
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { wetCollision } = await import('/src/entities/npcLiquid.ts');
  const proto = Enemy.prototype;
  const origFly = proto.duckFlyAI;
  if (typeof origFly !== 'function') return { fail: '无 duckFlyAI 可钩' };
  if (!g.__duckLogs) {
    g.__duckLogs = {};
    proto.duckFlyAI = function (game, player) {
      const rec = game.__duckLogs[this.id];
      if (!rec) { origFly.call(this, game, player); return; }
      origFly.call(this, game, player);
      if ((game.tickCount % 30) === 0 || rec.last?.ai0 !== this.ai0 || rec.last?.wet !== (this.wet ? 1 : 0)
        || rec.last?.vy !== +this.vy.toFixed(2)) {
        const mcx = this.cx / T | 0, mcy = this.cy / T | 0;
        const wb = wetCollision(st, this.x, this.y, this.w, this.h);
        rec.rows.push({ t: game.tickCount, ai0: this.ai0, ai1: +this.ai1.toFixed(0), wet: this.wet ? 1 : 0,
          cx: +this.cx.toFixed(1), cy: +this.cy.toFixed(1), vy: +this.vy.toFixed(2), og: this.onGround ? 1 : 0,
          lup: liq(mcx, mcy - 1), lmid: liq(mcx, mcy), ldn: liq(mcx, mcy + 1),
          lft: liq(mcx, (this.y + this.h - 1) / T | 0), wc: wb.wet ? 1 : 0,
          vid: this.vanillaId, hp: this.hp, f: this.facing, vx: +this.vx.toFixed(2) });
        rec.last = { ai0: this.ai0, wet: this.wet ? 1 : 0, vy: +this.vy.toFixed(2) };
      }
    };
  }
  function putDuck(vid, pond) {
    // 表液面线下方一点:水面(row*16+liquidOffset) 下潜 ~10px
    const d = Enemy.fromVanilla(vid, pond.cxPx, pond.top * T + 10);
    if (!d) return null;
    d.id = g.entities.nextId++;
    g.entities.add(d, 'enemies');
    g.__duckLogs[d.id] = { rows: [], last: null, pond };
    return d;
  }

  // 深塘优先放一号(平均深度大者),浅塘放二号
  const sorted = [...ponds].sort((a, b) => b.avgDepth - a.avgDepth);
  const duckA = putDuck(365, sorted[0]);
  const duckB = putDuck(365, sorted[Math.min(1, sorted.length - 1)]);
  if (!duckA || !duckB) return { fail: '放鸭失败', ponds };

  // ---- 四阶段:A 远/A 近/B 远/B 近,每相 16s。玩家同屏跟随但按远近贴边 ----
  const phases = [];
  async function runPhase(name, teleport) {
    const mark = { name, startT: g.tickCount }; phases.push(mark);
    teleport(); await waitMs(16000);
    mark.endT = g.tickCount;
  }
  const pondA = sorted[0], pondB = sorted[Math.min(1, sorted.length - 1)];
  await runPhase('pondA-far', () => { p.x = pondA.cxPx - 480 - p.w / 2; p.y = (pondA.top * T) - 140 - p.h; });
  await runPhase('pondA-near', () => { p.x = pondA.cxPx + 100 - p.w / 2; p.y = (pondA.top * T) - 140 - p.h; });
  await runPhase('pondB-far', () => { p.x = pondB.cxPx - 480 - p.w / 2; p.y = (pondB.top * T) - 140 - p.h; });
  await runPhase('pondB-near', () => { p.x = pondB.cxPx + 100 - p.w / 2; p.y = (pondB.top * T) - 140 - p.h; });

  const stateEnd = {
    A: { alive: !duckA.dead, vid: duckA.vanillaId, cx: +duckA.cx.toFixed(0), cy: +duckA.cy.toFixed(0), wet: duckA.wet ? 1 : 0 },
    B: { alive: !duckB.dead, vid: duckB.vanillaId, cx: +duckB.cx.toFixed(0), cy: +duckB.cy.toFixed(0), wet: duckB.wet ? 1 : 0 },
    player: { cx: +p.cx.toFixed(0), cy: +p.cy.toFixed(0) },
  };
  return {
    pondsFound: ponds.map(q => ({ l: q.left, r: q.right, top: q.top, width: q.width, avgDepth: q.avgDepth })),
    phases,
    logs: { A: g.__duckLogs[duckA.id].rows, B: g.__duckLogs[duckB.id].rows },
    stateEnd,
  };
});

if (!res || res.fail) {
  console.log(JSON.stringify({ res, errs: errs.slice(0, 8) }, null, 2));
  fs.writeFileSync('/tmp/sw-duck-fail.png', await page.screenshot({ type: 'png' }));
  await browser.close();
  process.exit(3);
}

// ---- 分析:每鸭腿长分布 + 跳变样本(含跳变时 wet/液列/姿态) ----
function analyze(rows) {
  const legs = []; let cur = null;
  const flips = [];
  let prevAi0 = null;
  for (const e of rows) {
    if (prevAi0 !== null && e.ai0 !== prevAi0) flips.push(e);
    prevAi0 = e.ai0;
    if (cur && cur.a === e.ai0) cur.n++; else { cur = { a: e.ai0, n: 1, t0: e.t }; legs.push(cur); }
  }
  const dist = {};
  for (const l of legs) {
    const key = `${l.a}:${l.n <= 15 ? '<=15' : l.n <= 59 ? '16-59' : l.n <= 149 ? '60-149' : l.n <= 299 ? '150-299' : l.n <= 449 ? '300-449' : '>450'}`;
    dist[key] = (dist[key] ?? 0) + 1;
  }
  const wetTicks = rows.filter(e => e.wet === 1).length;
  // 极短飞行腿(鬼畜指纹):飞行段 <45t
  const shortFlight = legs.filter(l => l.a === 1 && l.n <= 45);
  return { total: rows.length, legCount: legs.length, dist, wetTicks,
    shortFlightCount: shortFlight.length,
    flips: flips.slice(0, 30), shortFlights: shortFlight.map(l => ({ n: l.n, t0: l.t0 })).slice(0, 20),
    tail: rows.slice(-14) };
}
const A = analyze(res.logs.A), B = analyze(res.logs.B);
console.log(JSON.stringify({
  ponds: res.pondsFound, phases: res.phases, stateEnd: res.stateEnd,
  duckA: { ...A, tail: undefined, flips: A.flips.slice(0, 18) },
  duckB: { ...B, tail: undefined, flips: B.flips.slice(0, 18) },
}, null, 2));
fs.writeFileSync('/tmp/sw-duck-result.json', JSON.stringify({ res, A, B }, null, 2));
fs.writeFileSync('/tmp/sw-duck-stage.png', Buffer.from(await page.screenshot({ type: 'png' })));
await browser.close();
