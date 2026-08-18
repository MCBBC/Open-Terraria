// _waveprobe:水面波动系统(Water Waves)+ 浪质量四档 浏览器探针。
// 流程:?play=small 生成世界 → 找地表水潭 → 钉时钟/清风 → 逐档位(q0-3)验证:
//   B/C/D) waterWaves 模块态:q0 步进 0+中性、q≥2 步进 1、玩家入水涟漪入队+传播
//   E) 视觉:风=0 时水贴图动画帧率恒 6fps → 等待同 animFrame 抓两帧,水线带像素差
//      q3 > 0(波动在动)、q0 == 0(同帧唯一差异源只剩波动) —— 波动存在的铁证
// 页面零 pageerror 为硬门。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const errors = [];
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1024, height: 640 } });
const p = await b.newPage();
p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
// 等 __swGame 就绪(?play 自动开随机世界——忽略之),再固定种子重建(确定性水潭)
for (let i = 0; i < 90; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break;
}
const gen = await p.evaluate(async () => {
  await window.__swGame.newWorld('12345', 4200, 1200, () => {});
  return 'ok';
}).catch(e => String(e));
console.log('worldgen:', gen);
for (let i = 0; i < 240; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => window.__swGame?.world?.store?.liquid?.length > 0
    && window.__swGame?.world?.spawnX > 0).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 3000));

// 找水潭 + 钉态(时钟正午/风 0/雨 0) + 玩家压入水中
const pool = await p.evaluate(() => {
  const g = window.__swGame, w = g.world, st = w.store;
  g.world.clock.timeOfDay = 0.5;
  if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
  const sx = w.spawnX, sy = w.spawnY;
  for (let dx = -220; dx <= 220; dx++) {
    const x = sx + dx;
    if (x < 20 || x >= st.w - 20) continue;
    for (let y = Math.max(10, sy - 60); y < Math.min(st.h - 40, sy + 120); y++) {
      const i = st.idx(x, y);
      // 顶格空气 + 3 格连水(≥160 液位) = 水潭表面
      if (st.liquid[st.idx(x, y - 1)] === 0 && st.liquid[i] > 200 && !st.isSolid(x, y)
        && st.liquid[st.idx(x + 1, y)] > 200 && st.liquid[st.idx(x - 1, y)] > 200
        && st.liquid[st.idx(x, y + 1)] > 200 && st.liquid[st.idx(x, y + 2)] > 200) {
        const pl = g.player;
        pl.x = x * 16 + 2; pl.y = (y + 1) * 16 - 6; pl.vx = 0; pl.vy = 0;
        return { x, y, w: st.w, h: st.h, ground: w.groundLevel, rock: w.rockLevel };
      }
    }
  }
  return null;
});
console.log('pool:', JSON.stringify(pool));
if (!pool) { console.log('FAIL: 未找到水潭'); await b.close(); process.exit(1); }
await new Promise(r => setTimeout(r, 2500));

// 玩家持续搅水(踢 vy → wet 洗掠+涟漪)
await p.evaluate(() => {
  window.__waveKick = setInterval(() => {
    const pl = window.__swGame.player;
    pl.vy = -2.5; pl.vx = 1.2;
  }, 250);
});

const mod = await p.evaluate(async () => {
  const m = await import('/src/render/WaterWaves.ts');
  const liq = await import('/src/render/VanillaLiquidRenderer.ts');
  window.__ww = m; window.__liq = liq;
  // 种子 progress:原版 _progress 自游戏启动持续累积(玩家见到水时早已 >30),
  // 探针世界刚生成 prog≈2 → 两噪声采样点尚在同一 2×2 块内(梯度恒 0——原版同款
  // 数学)。种子 30 → 漂移 1.2 texel,环境波立刻成形。
  m.waterWaves.progress = 30;
  return 'ok';
});
console.log('modules:', mod, 'texReady:', await p.evaluate(() => window.__ww.waveTexReady()));

async function setQ(q) {
  await p.evaluate(async (qq) => {
    const o = await import('/src/core/Options.ts');
    o.options.data.waveQuality = qq;   // Renderer 每帧同步(不走持久化,探针专用)
    return window.__ww.waterWaves.quality;
  }, q);
  await new Promise(r => setTimeout(r, 1200));
}

// 水线带采样:玩家左侧 4-20 格的纯水横带(避开玩家 idle 眨眼动画)
async function grabStrip() {
  return p.evaluate(() => {
    const g = window.__swGame, c = g.renderer.canvas;
    const ctx = c.getContext('2d');
    const pl = g.player;
    const cam = g.camera;
    const zoom = cam.zoom;
    const screenY = (pl.y + pl.h / 2 - cam.y) * zoom + c.height / 2;
    // 水线以下采样(避开线上方天空/云背景漂移污染 q0 静止对照;q3 的水线 bob
    // 仍会改变最上几行 = 水vs背景像素互换)
    const y0 = Math.max(0, Math.round(screenY) + 2);
    const y1 = Math.min(c.height, Math.round(screenY) + 22);
    const cx = Math.round(c.width / 2);
    const x0 = Math.max(0, cx - Math.round(20 * 16 * zoom));
    const x1 = Math.max(0, cx - Math.round(4 * 16 * zoom));
    const out = [];
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 4) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        out.push(d[0], d[1], d[2]);
      }
    }
    return out;
  });
}
// 同帧抓取:wind=0 → animFrame 6fps(周期 2.667s)、waterfallFrame 0.5fps(周期 32s)
// → 精确等 32000ms(两周期公倍)后帧号严格相同(setTimeout 抖动 ±5ms 远小于 166ms/2s 窗口)
async function grabAtSameFrame() {
  const a = await grabStrip();
  await new Promise(r => setTimeout(r, 32000));
  const b = await grabStrip();
  return [a, b];
}

const results = {};
// ---- B) q0:不步进、中性、位移 0 ----
await setQ(0);
results.q0 = await p.evaluate(() => {
  const ww = window.__ww.waterWaves;
  const d = ww.debug();
  const out = [0, 0];
  ww.sampleDisplace(window.__swGame.player.cx, window.__swGame.player.cy, out);
  return { steps: d.stepsLastFrame, active: d.activeTexels, disp: out[1] !== 0 };
});
// ---- C) q1:无源步进 0 但噪声环境波位移非 0 ----
await setQ(1);
results.q1 = await p.evaluate(() => {
  const ww = window.__ww.waterWaves;
  const d = ww.debug();
  const out = [0, 0];
  ww.sampleDisplace(window.__swGame.player.cx, window.__swGame.player.cy, out);
  return { steps: d.stepsLastFrame, active: d.activeTexels, disp: Math.abs(out[1]) };
});
// ---- D) q3:玩家湿身涟漪入队 → 传播 activeTexels>0 ----
await setQ(3);
results.q3 = await p.evaluate(() => {
  const ww = window.__ww.waterWaves;
  const d = ww.debug();
  const pl = window.__swGame.player;
  return { steps: d.stepsLastFrame, active: d.activeTexels, queue: d.rippleQueueUsed,
    wet: pl.inWater, wetCount: pl.wetCount, intensity: d.intensity, grid: `${d.gridW}x${d.gridH}` };
});
// ---- E) 视觉同帧对比:q3 波动 / q0 静止 ----
// 停踢水+钉玩家(相机不动) → 同帧抓取(32s 周期);q3 波场仍有驻波能量(衰减慢,
// 见 WaterWaves 双重量化动力学注释),q0 全静态
await p.evaluate(() => {
  clearInterval(window.__waveKick);
  const pl = window.__swGame.player;
  pl.vx = 0; pl.vy = 0;
  // 冻结液体模拟(世界生成后水仍在流动沉降——水线自身移动会污染 q0 静止对照)
  window.__swGame.liquid.updateLiquid = () => {};
});
await new Promise(r => setTimeout(r, 3000));
await setQ(3);
const [a3, b3] = await grabAtSameFrame();
await setQ(0);
const [a0, b0] = await grabAtSameFrame();
function diffCount(A, B) {
  if (!A || !B) return -1;
  let n = 0;
  for (let i = 0; i < A.length; i++) if (Math.abs(A[i] - B[i]) > 8) n++;
  return n;
}
results.visual = { q3diff: diffCount(a3, b3), q0diff: diffCount(a0, b0), samples: a3?.length ?? 0 };
console.log(JSON.stringify(results, null, 2));

// 断言汇总(q0 视觉 = 液体沉降/粒子残差;q3 须 >8× 显著大于之——波动的相对性证明)
const pass = []
  .concat(errors.length === 0 ? [] : ['pageerror'])
  .concat(results.q0.steps === 0 && results.q0.active === 0 && !results.q0.disp ? [] : ['q0态'])
  .concat(results.q1.steps === 0 && results.q1.disp > 0 ? [] : ['q1环境波'])
  .concat(results.q3.steps >= 1 && results.q3.active > 0 ? [] : ['q3传播'])
  .concat(results.visual.q3diff > 200 ? [] : ['q3视觉'])
  .concat(results.visual.q3diff > results.visual.q0diff * 8 ? [] : ['q0视觉']);
if (pass.length) console.log('PROBE FAIL:', pass.join(','), ' errors:', errors);
else console.log('PROBE PASS: 全绿 (q0 死/中性、q1 环境波、q3 涟漪传播+视觉波动、零 pageerror)');
await b.close();
process.exit(pass.length ? 1 : 0);
