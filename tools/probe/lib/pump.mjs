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

/**
 * G8(IIIRS241 缺口矩阵)等一帧真实渲染——页内 rAF 帧边界等待。
 *
 * ★与 perf 互斥(perf.mjs:216 互斥纪律的反向同理):perf 用真 rAF 连续渲染做
 * 计量,startSegment..endSegment 窗内确定性泵(pump/pumpInline)与等帧工具
 * (nextFrame)皆禁——确定性断言走 pump,渲染链路/UI 过渡/动画推进断言走
 * nextFrame,两者勿混用(perf 窗内两者皆罪)。
 *
 * 双 rAF 语义:单 rAF 回调在下一帧绘制【前】触发,双发才保证至少一次完整
 * 渲染周期已过(_swfx12-paint/_rb10e-verify 同款手写判例)。多帧=循环调用。
 */
export function __nextFrameInPage() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
  });
}

/** 等一帧真实渲染(先置前——后台页 rAF 节流,memory: 无头后台探针五坑)。 */
export async function nextFrame(page) {
  await front(page);
  return page.evaluate(__nextFrameInPage);
}
