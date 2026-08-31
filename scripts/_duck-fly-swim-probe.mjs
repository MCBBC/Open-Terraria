// 绿头鸭(365/364)飞↔游状态机跳切实机探针(2026-08-31,用户录像报障)。
// 受控双池:深池(满格水)/浅池(单行 liquid=100 部分深度)×玩家远/近,
// 每帧钩 duckFlyAI 前后态(ai0/ai1/wet/cy/vy),统计跳变腿长分布。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
// 单人按钮可能随 splash/音频门延迟挂载(菜单启动链已知坑)——轮询等待至多 60s
const hasSp = () => page.waitForFunction(
  () => !!document.querySelector('[data-act=sp]'),
  { timeout: 60000, polling: 500 },
).then(() => true).catch(() => false);
if (!(await hasSp())) {
  const dom = await page.evaluate(() => ({
    btns: [...document.querySelectorAll('[data-act]')].map(e => e.getAttribute('data-act')),
    classes: document.body.className,
    html: document.body.innerHTML.slice(0, 600),
  }));
  fs.writeFileSync('/tmp/sw-duck-fail.png', await page.screenshot({ type: 'png' }).catch(() => ''));
  console.error('menu sp never mounted:', JSON.stringify(dom));
  process.exit(2);
}
let opened = false;
for (let i = 0; i < 3 && !opened; i++) {
  await page.click('[data-act=sp]').catch(() => {});
  opened = await page.waitForSelector('.sw-list-panel', { timeout: 8000 }).then(() => true).catch(() => false);
}
if (!opened) {
  fs.writeFileSync('/tmp/sw-duck-fail.png', await page.screenshot({ type: 'png' }));
  console.error('menu sp click failed'); process.exit(2);
}
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('鸭探针');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
// 选名为 Starter World 的存档(与用户报障世界一致),没有则第一个
{
  const idx = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.sw-list-panel .sw-item')];
    return Math.max(0, items.findIndex(el => el.textContent.includes('Starter World')));
  });
  await page.evaluate((i) => document.querySelectorAll('.sw-list-panel .sw-item')[i].click(), idx);
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 240000 });
await new Promise(r => setTimeout(r, 2500));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const T = 16;
  const out = {};
  const waitMs = (ms) => new Promise(r => setTimeout(r, ms));
  // 等 LiquidSim 空转稳定
  await waitMs(500);

  // ---- 选址:玩家出生地表右侧两块平地 ----
  const p = g.player;
  const surfYOf = (tx) => {           // 第一格实心顶部行号
    for (let y = Math.max(0, (p.cy / T | 0) - 60); y < st.h; y++) {
      if (st.isActive(tx, y)) return y;
    }
    return null;
  };
  const groundType = st.type[st.idx(p.cx / T | 0, surfYOf(p.cx / T | 0))];
  // 池体 = 全封闭石壁盒(carve 后手动砌墙),保证水体不被 sim 排走
  function buildPool(bx, innerW, depthRows, fillMode /* 'full'|'partial' */) {
    const sy = surfYOf(bx);
    if (sy == null) return null;
    const left = bx, right = bx + innerW - 1;
    const topY = sy + 1, botY = sy + depthRows;      // 内腔行区间
    // 清内腔
    for (let x = left; x <= right; x++) {
      for (let y = topY; y <= botY; y++) {
        if (st.isActive(x, y)) st.setTile(x, y, 0);
        st.setWall(x, y, st.wall[st.idx(x, y)] || 0);
      }
    }
    // 砌四周护墙(+2 行超高防溢流):左右列与底行用本地地面材质
    for (let y = topY; y <= botY + 1; y++) {
      st.setTile(left - 1, y, groundType);
      st.setTile(right + 1, y, groundType);
    }
    for (let x = left - 1; x <= right + 1; x++) st.setTile(x, botY + 1, groundType);
    // 注水
    const full = [];
    if (fillMode === 'full') {
      for (let x = left; x <= right; x++) for (let y = topY; y <= botY; y++) { st.setLiquid(x, y, 255, 1); full.push([x, y]); }
    } else {
      // 单行部分深度(~6px):底行 liquid=100,上一行空气
      for (let x = left; x <= right; x++) st.setLiquid(x, botY, 100, 1);
      full.push([left, botY]);
    }
    return { left, right, topY, botY, cxPx: ((left + right + 1) / 2) * T, floorTopPx: (botY + 1) * T };
  }

  const poolDeep = buildPool((p.cx / T | 0) + 28, 6, 4, 'full');
  const poolShallow = buildPool((p.cx / T | 0) + 70, 6, 2, 'partial');
  out.pools = { poolDeep, poolShallow, groundType };
  if (!poolDeep || !poolShallow) return { fail: '选址失败', out };

  // ---- 注水后让液体 sim 与贴图缓存稳定 ----
  await waitMs(3000);

  // ---- 挂钩 duckFlyAI(原型方法,探针实例化即可拦)----
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { wetCollision } = await import('/src/entities/npcLiquid.ts');
  const proto = Enemy.prototype;
  const origFly = proto.duckFlyAI;
  if (typeof origFly !== 'function') return { fail: 'duckFlyAI 不在 Enemy.prototype(esbuild 重命名?)' };
  proto.duckFlyAI = function (game, player) {
    const pre = {
      t: game.tickCount, ai0: this.ai0, ai1: this.ai1, wet: this.wet,
      cx: +this.cx.toFixed(1), cy: +this.cy.toFixed(1),
      vx: +this.vx.toFixed(2), vy: +this.vy.toFixed(2), f: this.facing,
      vid: this.vanillaId, og: this.onGround ? 1 : 0, hw: this.hitWall ? 1 : 0,
    };
    origFly.call(this, game, player);
    const post = { ai0: this.ai0, ai1: this.ai1, wet: this.wet, vy: +this.vy.toFixed(2) };
    if (pre.ai0 !== post.ai0 || pre.wet !== post.wet || pre.vy !== post.vy
      || Math.abs(pre.cy - this.cy) >= 0.5 || (game.tickCount % 30) === 0) {
      // 跳变帧加测液面环境:中心行上/中/下三行 liquid + 脚部是否浸水
      const mcx = this.cx / T | 0, mcy = this.cy / T | 0;
      const footY = (this.y + this.h - 1) / T | 0;
      const liq = (x, y) => (st.inBounds(x, y) ? st.liquid[st.idx(x, y)] : 0);
      const wb = wetCollision(st, this.x, this.y, this.w, this.h);
      game.__duckLog.push({
        ...pre, post,
        cy_: +this.cy.toFixed(1),
        lup: liq(mcx, mcy - 1), lmid: liq(mcx, mcy), ldn: liq(mcx, mcy + 1), lft: liq(mcx, footY),
        wc: wb.wet ? 1 : 0,
      });
    } else {
      game.__duckLog.push({ t: game.tickCount, ai0: post.ai0, wet: post.wet ? 1 : 0 });
    }
  };
  g.__duckLog = [];

  // ---- 放鸭:各自池上方半空掉落(vanillaId 365=绿头鸭飞行形) ----
  function putDuck(vid, px, py) {
    const d = Enemy.fromVanilla(vid, px, py);
    if (!d) return null;
    d.id = g.entities.nextId++;
    g.entities.add(d, 'enemies');
    return d;
  }
  const duckDeep = putDuck(365, poolDeep.cxPx, (poolDeep.topY) * T - 60);
  const duckShal = putDuck(365, poolShallow.cxPx, (poolShallow.topY) * T - 60);
  out.spawned = { deep: !!duckDeep, shal: !!duckShal };
  if (!duckDeep || !duckShal) return { fail: '放鸭失败', out };
  // 打标记:t 时刻起算哪个阶段由外部时间轴换算

  // ---- 阶段脚本:各池 远置(480px)→ 近身(scare 盒内) 各 12s ----
  // 记录阶段边界 tick,最终按 t 切片
  const phases = [];
  const mark = (name) => phases.push({ name, t: g.tickCount });

  async function phase(name, fn, ms) {
    mark(name + ':start');
    fn();
    await waitMs(ms);
    mark(name + ':end');
  }

  // 远置:玩家水平拉离但仍保持同屏(camera 自动跟随,600px 差可容于 1360 视口边缘)
  await phase('deepFar', () => {
    p.x = poolDeep.cxPx - 480 - p.w / 2; p.y = poolDeep.floorTopPx - 80 - p.h;
  }, 12000);
  await phase('deepNear', () => {
    p.x = poolDeep.cxPx + 96 - p.w / 2; p.y = poolDeep.floorTopPx - 80 - p.h;
  }, 12000);
  await phase('shalFar', () => {
    p.x = poolShallow.cxPx - 480 - p.w / 2; p.y = poolShallow.floorTopPx - 80 - p.h;
  }, 12000);
  await phase('shalNear', () => {
    p.x = poolShallow.cxPx + 96 - p.w / 2; p.y = poolShallow.floorTopPx - 80 - p.h;
  }, 12000);

  // ---- 统计:分 duck 分段的 ai0 腿长/湿位翻转 ----
  const log = g.__duckLog;
  function sliceStats(t0, t1, which /* 'deep'|'shal' by cx? */ ) {
    // 用出生点归属:记录两鸭 id 对应 log?__duckLog 未带 id —— 改用每条已有 vid 同型无法分。
    // 兜底:此处只做全量混合统计,分段池区分交给外层二阶段时间窗(四相中每相同刻只有一段池在近场,
    // 但两只鸭都在记录)。真正需要分池时以外层重跑。
    return null;
  }
  // 简化:直接输出原始压缩日志 + 相边界,离线分析
  out.phases = phases;
  out.tickEnd = g.tickCount;
  out.logLen = log.length;
  out.ducksAlive = { deep: !duckDeep.dead, shal: !duckShal.dead };
  out.vidNow = { deep: duckDeep.vanillaId, shal: duckShal.vanillaId };
  fs_copy_log: {
    // 大数组 → 控制台返回太肥,写全局窗口变量供二次 evaluate 提取尾部
    window.__duckLogCompact = log.slice(-2400);
  }
  return { out };
});

fs.writeFileSync('/tmp/sw-duck-stage.json', JSON.stringify({ res, phases: res?.out?.phases ?? [], errs: errs.slice(0, 6) }, null, 2));

// 二次提取压缩日志尾部 + 全程摘要
const extra = await page.evaluate(() => {
  const log = window.__swGame.__duckLog;
  // 腿长统计(全程,post 态):ai0 连续段长度分布,wet 翻转计数
  const legs = []; let cur = null; let wetFlips = 0; let prevWet = null;
  for (const e of log) {
    const a = e.post?.ai0 ?? e.ai0;
    const w = e.post?.wet ?? e.wet;
    if (cur && cur.a === a) cur.n++;
    else { cur = { a, n: 1, startT: e.t }; legs.push(cur); }
    if (prevWet !== null && w !== prevWet) wetFlips++;
    prevWet = w;
  }
  const dist = {};
  for (const l of legs) {
    const key = `${l.a}:${l.n < 15 ? '<15' : l.n < 60 ? '15-59' : l.n < 150 ? '60-149' : l.n < 300 ? '150-299' : l.n < 450 ? '300-449' : '>=450'}`;
    dist[key] = (dist[key] ?? 0) + 1;
  }
  // 最短飞行腿样本(鬼畜指纹:飞行腿极短)
  const shortFlight = legs.filter(l => l.a === 1 && l.n < 45).map(l => ({ n: l.n, startT: l.startT }));
  return { logLen: log.length, legCount: legs.length, dist, wetFlips, shortFlightCount: shortFlight.length, shortFlightSample: shortFlight.slice(0, 24), tail: log.slice(-400) };
});
fs.writeFileSync('/tmp/sw-duck-result.json', JSON.stringify({ res, extra, errs }, null, 2));
console.log(JSON.stringify({ res, summary: { ...extra, tail: undefined }, errs: errs.slice(0, 6) }, null, 2));
await browser.close();
