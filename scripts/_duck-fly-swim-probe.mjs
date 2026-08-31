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
  // ---- 高空人工台址:不依赖地表扫描(v2 教训:丛林树冠位采到高位假地面把池子封顶) ----
  let baseX = (p.cx / T | 0) + 20;
  // 找一段地表相对平坦区间的列作为 x 锚即可,x 锚仅决定水平位置
  let anchorTried = 0;
  while (anchorTried++ < 50) { baseX += 8; }
  const surfGuess = Math.round(p.y / T);
  const ALT = surfGuess - 30;                       // 台面基准行(空中)
  // 挖出干净的空域:横向 baseX..baseX+92,纵向 ALT-46..ALT+2 全部置空气
  for (let x = baseX - 4; x <= baseX + 96; x++) {
    for (let y = ALT - 46; y <= ALT + 2; y++) {
      if (st.inBounds(x, y) && st.isActive(x, y)) st.setTile(x, y, 0);
    }
  }
  // 砌墙材质:取玩家正下方深处任意实心块 id
  let wallType = 0;
  outer: for (let y = surfGuess; y < st.h - 40; y++) {
    for (const dx of [0, 1, 2]) {
      const tx = (p.x / T | 0) + dx;
      if (st.inBounds(tx, y) && st.isActive(tx, y) && st.isSolid(tx, y)) { wallType = st.type[st.idx(tx, y)]; break outer; }
    }
  }
  if (!wallType) return { fail: '找不到砌墙材质' };

  function buildPool(bx, innerW, depthRows, fillMode /* 'full'|'partial' */) {
    const left = bx, right = bx + innerW - 1;
    const floorY = ALT;                    // 底壁行
    for (let x = left - 1; x <= right + 1; x++) {
      for (let d = 0; d < 2; d++) st.setTile(x, floorY + 1 + d, wallType);     // 双层底
    }
    // 左右柱:水面带(floorY-depthRows..floorY-1)整段 + 上沿超高 3 行防起跳出墙
    for (let y = floorY - depthRows - 3; y <= floorY; y++) {
      st.setTile(left - 1, y, wallType);
      st.setTile(right + 1, y, wallType);
    }
    // 水腔行区间:[floorY-depthRows .. floorY-1],floorY 行为底壁
    let n = 0;
    if (fillMode === 'full') {
      for (let x = left; x <= right; x++) for (let y = floorY - depthRows; y < floorY; y++) { st.setLiquid(x, y, 255, 1); n += 255; }
    } else {
      for (let x = left; x <= right; x++) { st.setLiquid(x, floorY - 1, 100, 1); n += 100; }
    }
    const audit = () => {
      let sum = 0, cnt = 0;
      for (let x = left; x <= right; x++) for (let y = floorY - depthRows; y < floorY; y++) {
        const l = st.liquid[st.idx(x, y)]; sum += l; if (l > 0) cnt++;
      }
      return { sum, cnt };
    };
    return { left, right, topY: floorY - depthRows, botY: floorY - 1,
      cxPx: ((left + right + 1) / 2) * T, floorTopPx: floorY * T, audit,
      solidOk: st.isSolid(left - 1, floorY) && st.isSolid(right + 1, floorY)
        && st.isSolid((left + right) >> 1, floorY + 1) && !st.isSolid(left, floorY - 1) };
  }

  const poolDeep = buildPool(baseX + 4, 6, 4, 'full');
  const poolShallow = buildPool(baseX + 60, 6, 2, 'partial');
  if (!poolDeep || !poolShallow || !poolDeep.solidOk || !poolShallow.solidOk) {
    return { fail: '池体构建失败', wallType };
  }
  const auditsAtBuild = { deep: poolDeep.audit(), shal: poolShallow.audit() };

  await waitMs(4000);                                        // 液体 sim 稳定
  const auditsAfterSettle = { deep: poolDeep.audit(), shal: poolShallow.audit() };

  // ---- 钩子:按实体 id 分流 ----
  const { Enemy } = await import('/src/entities/Enemy.ts');
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
        const liq = (x, y) => (st.inBounds(x, y) ? st.liquid[st.idx(x, y)] : 0);
        rec.rows.push({ t: game.tickCount, ai0: this.ai0, ai1: +this.ai1.toFixed(0), wet: this.wet ? 1 : 0,
          cx: +this.cx.toFixed(1), cy: +this.cy.toFixed(1), vy: +this.vy.toFixed(2), og: this.onGround ? 1 : 0,
          lmid: liq(mcx, mcy), lup: liq(mcx, mcy - 1), ldn: liq(mcx, mcy + 1), lft: liq(mcx, (this.y + this.h - 1) / T | 0),
          vid: this.vanillaId, hp: this.hp, f: this.facing, vx: +this.vx.toFixed(2) });
        rec.last = { ai0: this.ai0, wet: this.wet ? 1 : 0, vy: +this.vy.toFixed(2) };
      }
    };
  }
  function putDuck(vid, pool) {
    const d = Enemy.fromVanilla(vid, pool.cxPx, pool.floorTopPx - 44);  // 生在水里(中心近底)
    if (!d) return null;
    d.id = g.entities.nextId++;
    g.entities.add(d, 'enemies');
    g.__duckLogs[d.id] = { rows: [], last: null };
    return d;
  }
  const duckDeep = putDuck(365, poolDeep);
  const duckShal = putDuck(365, poolShallow);
  if (!duckDeep || !duckShal) return { fail: '放鸭失败' };

  // ---- 四阶段:深/浅 × 远/近,每相 18s ----
  const phases = [];
  async function phase(name, fn, ms) {
    const mark = { name, startT: g.tickCount }; phases.push(mark); fn(); await waitMs(ms);
    mark.endT = g.tickCount;
  }
  await phase('deepFar', () => { p.x = poolDeep.cxPx - 480 - p.w / 2; p.y = poolDeep.floorTopPx - 120 - p.h; }, 18000);
  await phase('deepNear', () => { p.x = poolDeep.cxPx + 100 - p.w / 2; p.y = poolDeep.floorTopPx - 120 - p.h; }, 18000);
  await phase('shalFar', () => { p.x = poolShallow.cxPx - 480 - p.w / 2; p.y = poolShallow.floorTopPx - 120 - p.h; }, 18000);
  await phase('shalNear', () => { p.x = poolShallow.cxPx + 100 - p.w / 2; p.y = poolShallow.floorTopPx - 120 - p.h; }, 18000);

  const timelineAudits = [{ t: g.tickCount, deep: poolDeep.audit(), shal: poolShallow.audit() }];
  const stateEnd = {
    deep: { alive: !duckDeep.dead, vid: duckDeep.vanillaId, cx: +duckDeep.cx.toFixed(0), cy: +duckDeep.cy.toFixed(0), wet: duckDeep.wet ? 1 : 0, hp: duckDeep.hp },
    shal: { alive: !duckShal.dead, vid: duckShal.vanillaId, cx: +duckShal.cx.toFixed(0), cy: +duckShal.cy.toFixed(0), wet: duckShal.wet ? 1 : 0, hp: duckShal.hp },
    player: { cx: +p.cx.toFixed(0), cy: +p.cy.toFixed(0) },
  };
  return {
    wallType, auditsAtBuild, auditsAfterSettle, timelineAudits, phases,
    poolBox: { deep: { l: poolDeep.left, r: poolDeep.right, tp: poolDeep.topY, bt: poolDeep.botY },
               shal: { l: poolShallow.left, r: poolShallow.right, tp: poolShallow.topY, bt: poolShallow.botY } },
    logs: { deep: g.__duckLogs[duckDeep.id].rows, shal: g.__duckLogs[duckShal.id].rows },
    stateEnd,
  };
});

if (!res || res.fail) {
  console.log(JSON.stringify({ res, errs: errs.slice(0, 8) }, null, 2));
  fs.writeFileSync('/tmp/sw-duck-fail.png', await page.screenshot({ type: 'png' }));
  await browser.close();
  process.exit(3);
}

// ---- 分析:每鸭腿长分布 + 跳变样本 ----
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
  return { total: rows.length, dist, wetTicks, flips: flips.slice(0, 30), tail: rows.slice(-14) };
}
const summary = {
  deep: analyze(res.logs.deep), shal: analyze(res.logs.shal),
};
console.log(JSON.stringify({
  meta: { wallType: res.wallType, poolBox: res.poolBox, stateEnd: res.stateEnd },
  audits: { atBuild: res.auditsAtBuild, afterSettle: res.auditsAfterSettle, timeline: res.timelineAudits.slice(-4) },
  deep: { ...summary.deep, tail: undefined, flips: summary.deep.flips.slice(0, 18) },
  shal: { ...summary.shal, tail: undefined, flips: summary.shal.flips.slice(0, 18) },
}, null, 2));
fs.writeFileSync('/tmp/sw-duck-result.json', JSON.stringify({ res, summary }, null, 2));
fs.writeFileSync('/tmp/sw-duck-stage.png', Buffer.from(await page.screenshot({ type: 'png' })));
await browser.close();
