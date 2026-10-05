// ★功能 worker 治理——boot 闸（2026-10-03;x-ray 定谳后的防线固化刀）
//
// ═══ 定谳背景（被测构建 index-DEEBwe68,10/3）═══
// 该构建的三个功能 worker 各自 boot 了完整游戏实例：LightWorker 跑 Game.loop
// （27.97s 100% 烧满）、WaveWorker 跑 draw 循环（26.9s）、BakeWorker 卡死
// equipStatsKey（99.4%）。当前 src/dist 快照已无此形态（静态追图判谳:
// tests/worker-graph-isolation.test.ts + scripts/_worker-graph-audit.mjs——六个
// worker 入口的传递 import 图均无 main.ts/mainFlow.ts/core/Game.ts 回连）,
// 判定为当日构建的瞬态装配回归。本闸=运行时防线,图闸=构建期防线,两刀互补。
//
// ═══ 结构位（procShim 同款判例）═══
// 每个 worker 入口把本文件作为【第一个 import】（ESM 深度优先求值序:零依赖的
// 首导入模块先于入口图其余全部模块求值）,模块顶层立即做主线程 tripwire——
// 「守卫靠人记忆,兜底靠结构」（procShim.ts 判例原文）。
//
// ═══ 检测能力账（诚实边界,不夸口）═══
// ① 拦「worker 入口图在主线程求值」:主线程有 document/window,worker 全局恒无
//    ——tripwire 在依赖图求值【前】抛明文。此向风险实存:worker 入口被页面图误
//    import 时,self 在 window 上也 Defined,onmessage 注册不炸——引擎/表全量
//    静默重建在主线程（fork bomb 家族,wl-guards 判例）。
// ② 拦「boot 残留」:入口体调用 assertWorkerBootGate(名) 落图后一拍扫残——
//    __swRenderLog 只能由 Game.attachRenderLogHandle 写（Game.ts:6938）,
//    worker 内出现=页面 Game 代码曾在本域执行。条件 canary:缺席≠清白。
// ③ 不拦「页面模块被静态 import 进 worker 图」:图求值先于任何运行时检测,运行时
//    层无法前插——该向由构建期断言 tests/worker-graph-isolation.test.ts 拦
//    （禁入模块:main.ts/mainFlow.ts/core/Game.ts;反向:页面图禁 import worker
//    入口——worker 装配只许走 new Worker(new URL) 单通道,WorldGenClient 头注判例）。
// ④ rAF 现状账:Game 自驱循环由 requestAnimationFrame 调度（Game.ts:8700-8747）,
//    worker 全局无 rAF=boot 循环在 worker 内天然起不来;但 OffscreenCanvas 渲染
//    提案可能给 worker 带 rAF——届时环境漂移,console.warn 提示（不 throw,防
//    未来环境演化误伤）。
// 抛错落点:setTimeout 回调内 throw=worker 未捕获异常→宿主 onerror→客户端既有
// 回落链（LightWorkerLink/WaterWaves/BakeClient 全有 onerror 回落）+控制台明文。
export function assertWorkerBootGate(entry: string): void {
  const g = globalThis as unknown as {
    document?: unknown;
    window?: unknown;
    __swRenderLog?: unknown;
    __SW_WORKER_GOV?: string;
  };
  // 双保险:入口体调用点再查一次环境（理论上顶层 tripwire 已拦,此处兜模块重排）
  if (typeof document !== 'undefined' || typeof window !== 'undefined') {
    throw new Error(
      `[worker-governance] ${entry}: worker 入口图正在主线程求值(document/window 可用)——`
      + '功能 worker 禁止并入页面图;worker 装配只许走 new Worker(new URL(...)) 单通道。'
      + '查 tests/worker-graph-isolation.test.ts 与 import 链。',
    );
  }
  g.__SW_WORKER_GOV = entry;   // 诊断面:F5 报告/探针可读哪个 worker 图在此域求值
  setTimeout(() => {
    try {
      if (typeof document !== 'undefined' || typeof window !== 'undefined') {
        throw new Error(
          `[worker-governance] ${entry}: 图求值后 worker 域出现 document/window——装配回归`,
        );
      }
      // boot 残留 canary（条件判据:缺席≠清白,在场=实锤）
      if (g.__swRenderLog !== undefined) {
        throw new Error(
          `[worker-governance] ${entry}: worker 域检测到 __swRenderLog——页面 Game 代码`
          + '曾在本 worker 内执行(boot 残留)。功能 worker 禁止 boot 游戏,查 import 链。',
        );
      }
      // ★rAF 探针退役（2026-10-05,用户实报菜单/世界期告警刷屏）:Chrome 153 已原生
      //   在 dedicated worker 提供 requestAnimationFrame——「未来 worker-rAF 提案」
      //   落地,本探针恒真=每次 boot 刷屏。boot 防御本体=上方 __swRenderLog canary
      //   （Game 代码残留实锤）+构建期图闸（tests/worker-graph-isolation.test.ts）,
      //   两者均在位;rAF 缺席不再是防线组成（Chrome 153+ 永真）。
    } catch (err) {
      // fail-loud:控制台明文 + 重抛为 worker 未捕获异常(宿主 onerror→回落链)
      console.error(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, 0);
}

// 顶层 tripwire:本模块被任何 worker 入口首导入时,立即(先于入口图其余模块)判定域。
// 主线程误 import worker 入口在此爆红——此时 onmessage 注册等副作用尚未发生。
if (typeof document !== 'undefined' || typeof window !== 'undefined') {
  throw new Error(
    '[worker-governance] workerBootGate: worker 入口模块图正在主线程求值——'
    + '功能 worker 禁止并入页面图(检查是否有人把 worker 入口当普通模块 import 了)。',
  );
}
