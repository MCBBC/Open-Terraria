// 移动性能基线仪表共享库(_ 前缀私件,经 tools/run-diag.mjs 运行)。
// 基线协议见 mobile/BASELINE.md:同 seed 内置存档、固定巡游点、串行采集。
// ★本库只做"加载世界+注入采集器",不改游戏源码;rAF/longtask 计量全部
//   evaluateOnNewDocument 打补丁,游戏无感知。★注入函数体会被序列化到页面
//   执行,必须保持纯 JS(禁 TS 语法/外作用域引用)。
import puppeteer from 'puppeteer-core';

export const CHROME = process.env.SW_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const origin = () => process.env.SW_ORIGIN ?? 'http://localhost:5201';
/** 内置确定性存档(seed=12345,4200×1200,spawn 2095,232)。 */
export const SAVE_URL = '/debug-save.sbw.json';

/** 统一启动页(桌面预演;iOS 无自动化=人工 Safari 谱样,Android 真机另接 SW_CDP ws)。 */
export async function launch({ width = 1280, height = 720 } = {}) {
  const b = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'],
    defaultViewport: { width, height },
  });
  return b;
}

/**
 * 注入 rAF/longtask/GC 三路计量器后打开页面。必须在 goto 之前调用。
 * 计量器挂 window.__swPerf:{ raf:[dt...], gaps:[...], longtasks:[...], heap:[...] }
 * gapThresholdMs 默认 25ms(present 缺席一整帧以上)。
 */
export async function armPerfMeter(page, { gapThresholdMs = 25 } = {}) {
  await page.evaluateOnNewDocument(function (gapMs) {
    const perf = {
      tLast: 0,
      raf: [],
      gaps: [],
      longtasks: [],
      heap: [],
      gapThresholdMs: gapMs,
      _raf: window.requestAnimationFrame.bind(window),
    };
    window.__swPerf = perf;
    window.requestAnimationFrame = function (cb) {
      return perf._raf(function (t) {
        if (perf.tLast) {
          const dt = t - perf.tLast;
          perf.raf.push(dt);
          if (dt > perf.gapThresholdMs) perf.gaps.push(dt);
        }
        perf.tLast = t;
        cb(t);
      });
    };
    try {
      new PerformanceObserver(function (list) {
        const es = list.getEntries();
        for (let i = 0; i < es.length; i++) perf.longtasks.push(es[i].duration);
      }).observe({ type: 'longtask', buffered: true });
    } catch (e) { /* longtask 不支持(如部分 iOS)→留空并在报告标注 */ }
    const mem = performance.memory;
    if (mem) setInterval(function () {
      if (perf.heap.length < 4000) perf.heap.push({ t: performance.now(), used: mem.usedJSHeapSize });
    }, 500);
  }, gapThresholdMs);
}

/** 等 __swLoadJson 就绪并载入内置存档,再等 __swGame.renderer&&player 出现。 */
export async function loadDefaultWorld(page, timeoutFull = 180000) {
  await page.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: timeoutFull });
  await page.evaluate(async (url) => {
    const res = await fetch(url);
    const text = await res.text();
    return window.__swLoadJson(text);
  }, SAVE_URL);
  for (let i = 0; i < 150; i++) {
    await sleep(1000);
    if (await page.evaluate(() => {
      const g = window.__swGame;
      return !!(g && g.renderer && g.player);
    })) break;
  }
  await sleep(4000); // 让首屏 chunk 烘焙平息后再计基准
}

/** 固定镜头巡游:瞬移玩家走中心点序列(tile 坐标),每点停留 dwellMs。 */
export async function teleportTour(page, points, dwellMs = 4000) {
  for (const pt of points) {
    await page.evaluate((p) => {
      const g = window.__swGame;
      if (!g || !g.player) return;
      g.player.x = p[0] * 16; g.player.y = p[1] * 16; g.player.vx = 0; g.player.vy = 0;
    }, [pt[0], pt[1]]);
    await sleep(dwellMs);
  }
}

/** 基线巡游路线(seed12345 存档):出生点→地表带→洞穴→丛林口→地牢沿→回城。 */
export const TOUR_POINTS = [
  [2095, 230], [2450, 320], [1800, 300], [1600, 480], [2100, 520],
  [2600, 560], [775, 340], [3413, 280], [1200, 700], [2095, 230],
];

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** 数组百分位(升序副本,p∈[0,1])。 */
export function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}
