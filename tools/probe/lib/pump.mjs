/**
 * IIII236 统一探针框架 —— fixedUpdate 泵。
 *
 * 坑史锚:
 *  - memory: desert-style4 —— headless 下世界生成应用要手动 g.fixedUpdate(1/60) 泵;
 *  - memory: spikeball… —— headless rAF ~27fps = 0.44× 时间膨胀,一切周期计量
 *    用游戏 tick;探针玩家死亡会冻结射击族 AI(pump 侧默认可选清敌);
 *  - _iii219 泵纪律:zenith 含 constant 黑暗 250 伤会污染饥饿断言 → 分段泵
 *    (≤30t)+每段 g.dontStarveDarkness.reset()+清敌怪;
 *  - memory: guide-elevator —— 30t 采样对 ~10t 极限环=相位漂移伪影:
 *    采样周期须与被测环周期互质;pumpUntil 用"逐段可调步长+终态谓词"替代盲采。
 */
import { front } from './browser.mjs';

/**
 * 泵 ticks 个固定步。分段执行(默认 30t/段):
 *   clearEnemies=true → 每段清 enemies/projectiles(防刷怪相位污染断言);
 *   resetDarkness=true → 每段 dontStarveDarkness.reset()(constant 黑暗必死污染)。
 * 返回 { ticks, ms }。
 */
export async function pump(page, ticks, { step = 30, clearEnemies = false, resetDarkness = false } = {}) {
  await front(page);
  return page.evaluate(async ({ ticks, step, clearEnemies, resetDarkness }) => {
    const g = window.__swGame;
    if (!g) return { ticks: 0, ms: 0, why: 'no-game' };
    const t0 = performance.now();
    let done = 0;
    while (done < ticks) {
      const n = Math.min(step, ticks - done);
      if (resetDarkness) g.dontStarveDarkness?.reset?.();
      if (clearEnemies) { g.entities.enemies.length = 0; g.entities.projectiles.length = 0; }
      for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60);
      done += n;
      // 分段间让路事件循环:evaluate 内 await 0ms,防单次 evaluate 超时撕协议
      await new Promise((r) => setTimeout(r, 0));
    }
    return { ticks: done, ms: Math.round(performance.now() - t0) };
  }, { ticks, step, clearEnemies, resetDarkness });
}

/**
 * 泵到谓词真(或预算耗尽)。predFn 是页内函数(串行化执行,每段尾判一次);
 * 返回 { ok, ticks, final }。step 建议与被测环周期互质(相位漂移坑)。
 */
export async function pumpUntil(page, predFn, { maxTicks = 600, step = 17, clearEnemies = false, resetDarkness = false } = {}) {
  await front(page);
  return page.evaluate(async ({ predSrc, maxTicks, step, clearEnemies, resetDarkness }) => {
    const g = window.__swGame;
    if (!g) return { ok: false, ticks: 0, final: null, why: 'no-game' };
    const pred = new Function('g', 'window', `return (${predSrc})(g, window);`);
    let done = 0, fin = null;
    while (done < maxTicks) {
      const n = Math.min(step, maxTicks - done);
      if (resetDarkness) g.dontStarveDarkness?.reset?.();
      if (clearEnemies) { g.entities.enemies.length = 0; g.entities.projectiles.length = 0; }
      for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60);
      done += n;
      fin = pred(g, window);
      if (fin) return { ok: true, ticks: done, final: fin === true ? { ticks: done } : fin };
      await new Promise((r) => setTimeout(r, 0));
    }
    return { ok: false, ticks: done, final: fin };
  }, { predSrc: predFn.toString(), maxTicks, step, clearEnemies, resetDarkness });
}

/** 页内直接泵(evaluate 快路径,≤300t 用;长泵用 pump 分段防协议超时)。 */
export async function pumpInline(page, ticks) {
  return page.evaluate((ticks) => {
    const g = window.__swGame;
    for (let i = 0; i < ticks; i++) g.fixedUpdate(1 / 60);
    return ticks;
  }, ticks);
}
