/**
 * IIII236 统一探针框架 —— 看门狗。
 *
 * 坑史锚(memory: diag-script-orphan-prevention、lavaslope 五坑#5):
 *  - run-diag 的双层看门狗只兜"导入即完成"的脚本;异步长流程探针必须自备
 *    每步超时——probe.mjs CLI 已有总看门狗,本模块补"步级"超时与预算;
 *  - 超时强杀是 SIGKILL(TERM 对忙循环无效);步超时要先于总看门狗触发,
 *    才能留下"哪一步卡死"的现场而不是一坨无上下文的 exit 2。
 */

/** 单个 Promise 挂超时。超时抛 Error(带 label),不 abort 底层操作。 */
export function withTimeout(promise, ms, label = 'step') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`[probe:watchdog] ${label} 超时 ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * 步进器:step(label, fn, {timeout}) 逐步计时;总预算耗尽即抛(留现场)。
 * 用法:
 *   const sw = stepWatchdog({ budgetMs: 300_000 });
 *   await sw.step('建世界', () => createGame(page, ...));
 */
export function stepWatchdog({ budgetMs = 600_000, defaultStepMs = 120_000 } = {}) {
  const t0 = Date.now();
  const log = [];
  let left = budgetMs;
  return {
    log,
    budgetMs,
    elapsed() { return Date.now() - t0; },
    remaining() { return Math.max(0, budgetMs - (Date.now() - t0)); },
    async step(label, fn, { timeout = defaultStepMs } = {}) {
      const ms = Math.min(timeout, Math.max(1000, this.remaining()));
      const s0 = Date.now();
      try {
        const v = await withTimeout(Promise.resolve().then(fn), ms, label);
        log.push({ label, ms: Date.now() - s0, ok: true });
        return v;
      } catch (e) {
        log.push({ label, ms: Date.now() - s0, ok: false, error: String(e?.message ?? e) });
        throw e;
      }
    },
  };
}
