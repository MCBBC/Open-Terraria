// _presnap-storm-probe:preSnap 画布出生风暴哨兵（2026-09-28 灾难链定谳刃）
// 载入存档→玩家周身灌 A=0 加性族尘（183/258=GetAlpha rgbv 彩色档——逐尘
// dustTint 烘焙,乘数与光照无关=全天候烘焙域;182/206/230 恒等档走快路径
// 不烘焙,勿用）→15s 计量:document.createElement('canvas') 出生数/秒
// +webglcontextlost 次数+rAF fps+JS 堆+shim stats。
// 旧码判据:出生率≈烘焙数/秒（每 bake 一张新画布;实测 2441.7/s,用户实报
// 531-2376/s 同域）;新码（P0 去画布化:快照=ImageData 字节）:≈0（实测 0.4/s
// 残差=-boot 期无关来源）。存活钉扎:500fps 无头钟下收缩链 0.04s 内缩没,
// 每 300ms scale 归位+屏内重排维持活量。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5244';
const MEASURE_MS = 15000;

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
  args: ['--no-first-run'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));

// 计数器必须在任何游戏代码前注入
await page.evaluateOnNewDocument(() => {
  window.__swCanvasBorn = 0;
  window.__swCtxLost = 0;
  const orig = document.createElement.bind(document);
  document.createElement = (tag, ...a) => {
    if (String(tag).toLowerCase() === 'canvas') window.__swCanvasBorn++;
    return orig(tag, ...a);
  };
  window.addEventListener('webglcontextlost', () => { window.__swCtxLost++; }, true);
  window.__swFrames = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { window.__swFrames++; cb(t); });
});

await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 4000));
const load = await page.evaluate(async () => {
  const res = await fetch('/debug-save.sbw.json');
  if (!res.ok) return `fetch ${res.status}`;
  await window.__swFlow.loadJson(await res.text());
  return 'ok';
}).catch((e) => String(e));
if (load !== 'ok') { console.log('[loadJson 失败]', load); await browser.close(); process.exit(1); }
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  if (await page.evaluate(() => !!window.__swGame).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 5000));

// 场景:debugGod+玩家周身灌 A=0 族尘（183/258=GetAlpha 恒 0 型+rgbv 彩色乘数
// ——逐尘 tint 烘焙与光照无关;timeOfDay 仅作场景氛围）
const prep = await page.evaluate(() => {
  const g = window.__swGame;
  g.player.debugGod = true;
  const c = g.world.clock; if (c) c.timeOfDay = 0.15;
  const px = g.player.x, py = g.player.y;
  let n = 0;
  for (let i = 0; i < 2600; i++) {
    const ok = g.spawnDust(
      px + (Math.random() * 560 - 280), py + (Math.random() * 360 - 240), 8, 8,
      [183, 258][i % 2],
      Math.random() * 1.2 - 0.6, Math.random() * 0.8 - 0.4, 0, null,
      1 + Math.random(), true,
    );
    if (ok) n++;
  }
  return { spawned: n, bgl: !!g.renderer.bgl };
});
console.log('[前置]', JSON.stringify(prep));

// 15s 计量窗:每 500ms 补灌 400 粒（池活量维持）,每秒采样出生数/堆/fps
const t0 = Date.now();
const born0 = await page.evaluate(() => window.__swCanvasBorn);
const lost0 = await page.evaluate(() => window.__swCtxLost);
const shimStats = () => page.evaluate(() => {
  const s = window.__swGame?.renderer?.bglEntShim?.stats;
  return s ? { uploads: s.uploads, replays: s.replays, fallback: s.fallback, draws: s.draws } : null;
}).catch(() => null);
const shim0 = await shimStats();
const samples = [];
while (Date.now() - t0 < MEASURE_MS) {
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    const g = window.__swGame;
    const px = g.player.x, py = g.player.y;
    // 存活钉扎:收缩链（fadeIn==0 → scale−0.04/t）在 500fps 无头钟下 0.04s 内
    // 缩没——每轮把 A=0 族尘 scale 归位+屏内重排,维持活量
    const pool = g.vanillaDust;
    const arr = pool?.pool;
    if (arr) {
      for (const d of arr) {
        if (d?.active && (d.type === 183 || d.type === 258)) {
          d.scale = 1 + Math.random() * 0.3;
          d.y = py + (Math.random() * 360 - 240);
          d.x = Math.max(px - 280, Math.min(px + 280, d.x));
        }
      }
    }
    for (let i = 0; i < 600; i++) {
      g.spawnDust(
        px + (Math.random() * 560 - 280), py + (Math.random() * 360 - 240), 8, 8,
        [183, 258][i % 2],
        0, 0, 0, null,
        1 + Math.random(), true,
      );
    }
  }).catch(() => {});
  if ((Date.now() - t0) % 3000 < 320) {
    const s = await page.evaluate(() => ({
      born: window.__swCanvasBorn, lost: window.__swCtxLost, fps: window.__swFrames,
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
    })).catch(() => null);
    if (s) samples.push({ t: Math.round((Date.now() - t0) / 1000), ...s });
  }
}
const fin = await page.evaluate(() => ({
  born: window.__swCanvasBorn, lost: window.__swCtxLost, fps: window.__swFrames,
  heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
})).catch((e) => ({ err: String(e) }));
const shim1 = await shimStats();
const dt = (Date.now() - t0) / 1000;
const rate = (fin.born - born0) / dt;
console.log('[采样序列]', JSON.stringify(samples));
console.log('[结果]', JSON.stringify({
  measureSec: Math.round(dt),
  canvasBornTotal: fin.born - born0,
  canvasBornPerSec: Math.round(rate * 10) / 10,
  ctxLost: fin.lost - lost0,
  fps: Math.round(fin.fps / dt),
  heapMB: fin.heap,
  shim0, shim1,
  bakePerSec: shim0 && shim1 ? Math.round((shim1.uploads - shim0.uploads) / dt) : null,
}));
await browser.close();
