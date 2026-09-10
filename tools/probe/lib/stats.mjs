/**
 * IIII236 统一探针框架 —— 多次重复 A/B 统计。
 *
 * 坑史锚(memory: slime-water-pocket…、guide-elevator、spikeball…):
 *  - 敌怪 AI 走 Math.random(非种子流):单次 A/B 差异=方差冒充信号;
 *    6×(默认)重复,两臂逐位一致才算数;跳变归因要做"机制指纹"勿凭 px 幅度猜。
 *  - 探针脏态:多段复用同一页面的序列化 probe 会累积 useTime/swing/inventory
 *    脏态 → 整段哑火假红;每段之间 cleanUpToIdle(松手+等弹死光+useTime 归 0)。
 *  - 玩家侧命中/计数读数会被弹寿命稀释成负数:清桶+单调 max 采样。
 */
import { front } from './browser.mjs';

export const DEFAULT_RUNS = 6;

/**
 * 页内场景跑 N 次。runFn(g, runIndex) 页内函数,每跑一段之间调 idleFn 复位脏态
 * (缺省=松手+清弹+useTime 归零)。返回 runs 数组。
 */
export async function runReplicates(page, runFn, {
  runs = DEFAULT_RUNS, args = {}, idle = true, betweenMs = 120, settle = 30,
} = {}) {
  await front(page);
  const out = [];
  for (let i = 0; i < runs; i++) {
    if (idle) await cleanUpToIdle(page, settle);
    const r = await page.evaluate(async ({ src, index, args }) => {
      const g = window.__swGame;
      const fn = new Function('g', 'index', 'args', `return (${src})(g, index, args);`);
      const res = await fn(g, index, args);
      return res;
    }, { src: runFn.toString(), index: i, args });
    out.push(r);
    if (betweenMs) await new Promise((r2) => setTimeout(r2, betweenMs));
  }
  return out;
}

/** 段间复位:松手+清弹/掉落+useTime 归 0(防"改了没效果"的脏态假红)。 */
export async function cleanUpToIdle(page, settleTicks = 30) {
  await page.evaluate((settleTicks) => {
    const g = window.__swGame;
    if (!g) return;
    g.input.mouseDown = false; g.input.mouseHeld = false; g.input.rightDown = false;
    g.entities.projectiles.length = 0;
    g.entities.enemies.length = 0;
    if (g.player) { g.player.useTime = 0; g.player.vx = 0; g.player.vy = 0; }
    for (let i = 0; i < settleTicks; i++) g.fixedUpdate(1 / 60);
  }, settleTicks);
  await new Promise((r) => setTimeout(r, 50));
}

/** 全一致判定:所有 run 都过 pred → { all, passes, n, fails }。 */
export function allRuns(runs, pred) {
  const bools = runs.map(pred);
  const fails = runs.filter((r, i) => !bools[i]);
  return { all: fails.length === 0, passes: bools.filter(Boolean).length, n: runs.length, fails };
}

/**
 * 两臂统计 A/B:两臂各 N 跑,全部满足各自谓词才算绿(6/6 vs 0/6 逐位一致)。
 * 返回 { a, b, verdict }。
 */
export function compareAB(aRuns, bRuns, predA = () => true, predB = () => true) {
  const a = allRuns(aRuns, predA);
  const b = allRuns(bRuns, predB);
  return { a, b, verdict: a.all && b.all };
}
