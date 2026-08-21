// _waterjelly:水体"果冻效应"后处理管线(WaterWarpCompositor+GLWaterDistortion)探针。
// 三页对拍(同一浏览器、同一世界种子,世界生成并行):
//   A 默认(GL 路径)/ B ?wwarp=2d(2D 分块回退)/ C ?wwarp=0(旧直画+表层格 bob 路径)
// 每页测量:玩家入水/出水搅动后,【水体深处】(水线下 24-70px、避开玩家中央带)
// 同动画帧两帧差(32s 周期公倍消掉 6fps 水纹动画/0.5fps 瀑布帧):
//   A q3:深处差 > 阈值 = 整体形变(果冻);A q0:全关 → ≈0(静态对照)
//   B q3:2D 回退同样形变;C q3:旧路径深处 ≈0(只有表层 bob)= 改造前基线
// 断言:三页 warp 调试态(A:'gl'/B:'2d'/C:'off')+ 零 pageerror。
// 截图:A 页静水(入水前) vs 溅水(入水中) → tmp 目录(报告前后对比)。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = process.env.SW_OUT || '/Users/vinlic/.claude/jobs/8405c930/tmp';
const SEED = '12345';
const errors = { A: [], B: [], C: [] };

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1024, height: 640 },
});
const mkPage = async (tag, query) => {
  const p = await b.newPage();
  p.on('pageerror', e => errors[tag].push(String(e).slice(0, 200)));
  await p.goto(`${ORIGIN}/?play=small${query}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  return p;
};
const pageA = await mkPage('A', '');            // GL 默认
const pageB = await mkPage('B', '&wwarp=2d');   // 强制 2D 回退
const pageC = await mkPage('C', '&wwarp=0');    // 旧路径(直画+表层 bob)

// ---- 三页并行世界生成(同种子 → 同水潭) ----
const genAll = await Promise.all([pageA, pageB, pageC].map(p =>
  p.evaluate(async (seed) => {
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await window.__swGame?.constructor && window.__swGame) break;
    }
    await window.__swGame.newWorld(seed, 4200, 1200, () => {});
    return 'ok';
  }, SEED).catch(e => String(e))));
console.log('worldgen:', JSON.stringify(genAll));
await Promise.all([pageA, pageB, pageC].map(async (p) => {
  for (let i = 0; i < 240; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => window.__swGame?.world?.store?.liquid?.length > 0
      && window.__swGame?.world?.spawnX > 0).catch(() => false)) break;
  }
}));
await new Promise(r => setTimeout(r, 3000));

// ---- 找水潭 + 钉态(正午/无风无雨) + 种子 progress ----
const setup = async (p) => p.evaluate(() => {
  const g = window.__swGame, w = g.world, st = w.store;
  g.world.clock.timeOfDay = 0.5;
  if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
  const sx = w.spawnX, sy = w.spawnY;
  for (let dx = -220; dx <= 220; dx++) {
    const x = sx + dx;
    if (x < 20 || x >= st.w - 20) continue;
    for (let y = Math.max(10, sy - 60); y < Math.min(st.h - 40, sy + 120); y++) {
      const i = st.idx(x, y);
      if (st.liquid[st.idx(x, y - 1)] === 0 && st.liquid[i] > 200 && !st.isSolid(x, y)
        && st.liquid[st.idx(x + 1, y)] > 200 && st.liquid[st.idx(x - 1, y)] > 200
        && st.liquid[st.idx(x, y + 1)] > 200 && st.liquid[st.idx(x, y + 2)] > 200) {
        return { x, y };
      }
    }
  }
  return null;
});
const pools = {};
for (const [tag, p] of [['A', pageA], ['B', pageB], ['C', pageC]]) pools[tag] = await setup(p);
console.log('pools:', JSON.stringify(pools));
if (Object.values(pools).some(v => !v)) {
  console.log('FAIL: 未找到水潭', JSON.stringify(pools));
  await b.close(); process.exit(1);
}

// 模块注入 + progress 种子(原版 _progress 自启动累积;新世界 ≈0 → 噪声双采样同块梯度 0)
for (const p of [pageA, pageB, pageC]) {
  await p.evaluate(async () => {
    const m = await import('/src/render/WaterWaves.ts');
    const liq = await import('/src/render/VanillaLiquidRenderer.ts');
    window.__ww = m; window.__liq = liq;
    m.waterWaves.progress = 30;
  });
}
const setQ = async (p, q) => {
  await p.evaluate(async (qq) => {
    const o = await import('/src/core/Options.ts');
    o.options.data.waveQuality = qq;
  }, q);
  await new Promise(r => setTimeout(r, 1500));
};
// 玩家压入水潭中心(入水姿态)
const dive = (p, pool) => p.evaluate((pool) => {
  const pl = window.__swGame.player;
  pl.x = pool.x * 16 + 2; pl.y = (pool.y + 1) * 16 - 6; pl.vx = 0; pl.vy = 0;
}, pool);
for (const [tag, p] of [['A', pageA], ['B', pageB], ['C', pageC]]) await dive(p, pools[tag]);
await new Promise(r => setTimeout(r, 2500));

// ---- A 页截图:静水(入水前,玩家在潭边) + 溅水(入水搅动中) ----
await setQ(pageA, 3);
await pageA.evaluate((pool) => {
  const pl = window.__swGame.player;
  pl.x = (pool.x - 6) * 16; pl.y = (pool.y - 2) * 16; pl.vx = 0; pl.vy = 0;   // 潭边岸上
}, pools.A);
await new Promise(r => setTimeout(r, 3000));
await pageA.screenshot({ path: `${OUT}/waterjelly-calm.png` });
// 入水:玩家反复跳入(入水/出水循环 = wetCount 涟漪源)
await dive(pageA, pools.A);
await pageA.evaluate(() => {
  window.__kick = setInterval(() => {
    const pl = window.__swGame.player;
    pl.vy = -2.5; pl.vx = (Math.floor(Date.now() / 250) % 2 ? 1.2 : -1.2);
  }, 250);
});
await new Promise(r => setTimeout(r, 4000));
await pageA.screenshot({ path: `${OUT}/waterjelly-splash.png` });

// ---- 测量:停踢+钉玩家+冻结液体 → 同动画帧两帧差 ----
const freeze = (p) => p.evaluate(() => {
  clearInterval(window.__kick);
  const pl = window.__swGame.player;
  pl.vx = 0; pl.vy = 0;
  window.__swGame.liquid.updateLiquid = () => {};   // 水线静止(残留驻波仍在波场里传播)
});
// 深处带:水线下 24-70px;X 两侧各 4-16 格(避开玩家中央/眨眼)
const grabDeep = (p) => p.evaluate(() => {
  const g = window.__swGame, c = g.renderer.canvas;
  const ctx = c.getContext('2d');
  const pl = g.player, cam = g.camera, zoom = cam.zoom;
  const screenY = (pl.y + pl.h / 2 - cam.y) * zoom + c.height / 2;
  const cx = Math.round(c.width / 2);
  const y0 = Math.max(0, Math.round(screenY) + 24);
  const y1 = Math.min(c.height, Math.round(screenY) + 70);
  const out = [];
  for (const [xa, xb] of [[cx - Math.round(16 * 16 * zoom), cx - Math.round(4 * 16 * zoom)],
    [cx + Math.round(4 * 16 * zoom), cx + Math.round(16 * 16 * zoom)]]) {
    for (let y = y0; y < y1; y += 2) {
      for (let x = Math.max(0, xa); x < Math.min(c.width, xb); x += 4) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        out.push(d[0], d[1], d[2]);
      }
    }
  }
  return out;
});
const grabAtSameFrame = async (p) => {
  const a = await grabDeep(p);
  await new Promise(r => setTimeout(r, 32000));
  const b2 = await grabDeep(p);
  return [a, b2];
};
const diffCount = (A, B) => {
  if (!A || !B) return -1;
  let n = 0;
  for (let i = 0; i < A.length; i++) if (Math.abs(A[i] - B[i]) > 8) n++;
  return n;
};
const warpDebug = (p) => p.evaluate(() => window.__liq.liquidDebugState().warp);

// A 页:q3(管线开) → q0(全关) 对照
freeze(pageA);
await new Promise(r => setTimeout(r, 3000));
const [a3, a3b] = await grabAtSameFrame(pageA);
const warpA = await warpDebug(pageA);
await setQ(pageA, 0);
const [a0, a0b] = await grabAtSameFrame(pageA);
const warpA0 = await warpDebug(pageA);
await setQ(pageA, 3);

// B 页(2D 回退):q3 一窗
freeze(pageB);
await new Promise(r => setTimeout(r, 3000));
const [b3, b3b] = await grabAtSameFrame(pageB);
const warpB = await warpDebug(pageB);

// C 页(旧路径):q3 一窗
freeze(pageC);
await new Promise(r => setTimeout(r, 3000));
const [c3, c3b] = await grabAtSameFrame(pageC);
const warpC = await warpDebug(pageC);

const results = {
  A_gl: { deepDiff: diffCount(a3, a3b), samples: a3?.length ?? 0, warp: warpA },
  A_q0: { deepDiff: diffCount(a0, a0b), warp: warpA0 },
  B_2d: { deepDiff: diffCount(b3, b3b), samples: b3?.length ?? 0, warp: warpB },
  C_legacy: { deepDiff: diffCount(c3, c3b), samples: c3?.length ?? 0, warp: warpC },
  pageerrors: { A: errors.A.length, B: errors.B.length, C: errors.C.length },
};
console.log(JSON.stringify(results, null, 2));

// ---- 断言 ----
const fail = [];
if (errors.A.length || errors.B.length || errors.C.length) fail.push('pageerror');
if (warpA.active !== true || warpA.path !== 'gl') fail.push('A路径非gl');
if (warpA0.active !== false) fail.push('A q0未关');
if (warpB.active !== true || warpB.path !== '2d') fail.push('B路径非2d');
if (warpC.active !== false || warpC.path !== 'off') fail.push('C未走旧路径');
if (!(results.A_gl.deepDiff > 400)) fail.push('A整体形变不足');
if (!(results.A_gl.deepDiff > results.A_q0.deepDiff * 5)) fail.push('A静态对照失效');
if (!(results.B_2d.deepDiff > 400)) fail.push('B回退形变不足');
if (!(results.A_gl.deepDiff > results.C_legacy.deepDiff * 3)) fail.push('C旧路径基线异常(深处不应动)');
if (fail.length) console.log('PROBE FAIL:', fail.join(','), JSON.stringify(errors));
else console.log('PROBE PASS: GL/2D 双路径整体形变 + 旧路径/q0 双静态对照 + 零 pageerror');
await b.close();
process.exit(fail.length ? 1 : 0);
