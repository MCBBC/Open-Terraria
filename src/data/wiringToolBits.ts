/** 导线工具位掩码（Wiring.cs 工具位：红/绿/蓝/黄 + 致动器）。
 *  ★2026-09-03 自 world/Wiring.ts 抽出为叶子数据模块：items.ts 顶层 WIRED_TOOLS
 *  表读本组常量,而 Wiring.ts 的 import 子树（Mounts→Renderer→items）回流 items——
 *  DFS 序 Wiring 先于 items 时,items 顶层面读即 TDZ 炸 boot（冷启动实锤）。
 *  纯数值无依赖,叶子化断 items→Wiring 边（Wiring 侧 re-export 兼容）。 */
export const TOOL_RED = 1;
export const TOOL_GREEN = 2;
export const TOOL_BLUE = 4;
export const TOOL_YELLOW = 8;
export const TOOL_ACTUATOR = 16;
