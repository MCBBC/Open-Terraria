// worker 内 process 兜底（2026-09-02）——必须作为首个导入(在任何依赖模块求值前)。
// 背景:pass 内的 A/B 探针开关(SW_FLTRACE/SW_102C_DRESSER 等)反复以裸 `process.env.X`
// 进场,浏览器 worker 无该全局即 ReferenceError 直接炸掉世界生成(三犯同型:
// HellFortPass:106 注记的 2026-08-23 首犯 + DungeonPass/StructuresPass 2026-09-02)。
// 单文件首导入兜底优于逐文件 typeof 守卫——守卫靠人记忆,兜底靠结构。
// Node 测试面已有真 process,零行为变化;浏览器面任何漏网引用读到 env 空表。
const _swProcess = (globalThis as unknown as { process?: unknown }).process;
if (!_swProcess) {
  (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
    .process = { env: {} };
}
export {};
