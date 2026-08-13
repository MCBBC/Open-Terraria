// 世界不变量扫描器类型(2026-08-13"巨石陷阱孤格"牵引):
// 规则化地自动发现结构性移植错误(PlaceTile 缺角/帧分片重复等),
// 消费方:tests/world-invariants.test.ts(合成+集成)/ 二期 DebugReport 段。
import type { TileStore } from '../TileStore';

export type Severity = 'error' | 'warn' | 'info';

export interface Violation {
  rule: string;
  severity: Severity;
  type: number;
  typeKey: string;
  sheet?: number;
  x: number;
  y: number;
  detail: string; // 人读:缺哪格/锚点候选/帧值
}

export interface AuditContext {
  store: TileStore;
  x0: number; y0: number; x1: number; y1: number; // 扫描窗(含边界,全图=0,0,w,h)
  violations: Violation[];
  stats: Record<string, number>; // 每规则命中数(基数护栏用)
}

export interface AuditRule {
  id: string;
  title: string;
  /** ★必须注明依据:原版 file:line 或内部不变量——无依据的规则不许进 */
  rationale: string;
  severity: Severity;
  run(ctx: AuditContext): void;
}

export interface AuditReport {
  elapsedMs: number;
  partial: boolean; // timeBudgetMs 超时
  scannedCells: number;
  violations: Violation[];
  summary: Array<{ rule: string; severity: Severity; count: number }>;
}

export interface AuditOptions {
  bounds?: { x0: number; y0: number; x1: number; y1: number };
  rules?: AuditRule[]; // 缺省全开
  maxPerRule?: number; // 每规则报告截断(防爆)
  timeBudgetMs?: number; // 超时标 partial
}
