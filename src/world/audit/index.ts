// 世界不变量扫描器入口:auditWorld 聚合规则 + formatViolations 人读输出。
// 用法:tests/world-invariants.test.ts(合成+集成);二期 DebugReport 相机窗段。
import type { TileStore } from '../TileStore';
import type { AuditOptions, AuditReport, AuditRule, AuditContext, Violation } from './types';
import { ALL_RULES } from './rules';

export { ALL_RULES } from './rules';
export { collectMultiDefs } from './rules';
export { MULTITILE_EXEMPT } from './exemptions';
export type { AuditOptions, AuditReport, AuditRule, AuditContext, Violation, Severity } from './types';

export function auditWorld(store: TileStore, opts: AuditOptions = {}): AuditReport {
  const t0 = Date.now();
  const b = opts.bounds ?? { x0: 0, y0: 0, x1: store.w - 1, y1: store.h - 1 };
  const x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0);
  const x1 = Math.min(store.w - 1, b.x1), y1 = Math.min(store.h - 1, b.y1);
  const rules: AuditRule[] = opts.rules ?? ALL_RULES;
  const maxPerRule = opts.maxPerRule ?? 50;
  const budget = opts.timeBudgetMs ?? 0;
  const ctx: AuditContext = {
    store, x0, y0, x1, y1,
    violations: [],
    stats: {},
  };
  let partial = false;
  for (const rule of rules) {
    const before = ctx.violations.length;
    rule.run(ctx);
    const count = ctx.violations.length - before;
    if (count > maxPerRule) {
      // 截断防爆(保留前 maxPerRule,stats 保留全量命中数)
      ctx.violations.length = before + maxPerRule;
    }
    if (budget > 0 && Date.now() - t0 > budget) { partial = true; break; }
  }
  // 汇总(stats 为每规则全量命中;violations 为截断后)
  const summary = rules.map((r) => ({
    rule: r.id,
    severity: r.severity,
    count: ctx.stats[r.id] ?? ctx.violations.filter((v) => v.rule === r.id).length,
  }));
  return {
    elapsedMs: Date.now() - t0,
    partial,
    scannedCells: (x1 - x0 + 1) * (y1 - y0 + 1),
    violations: ctx.violations,
    summary,
  };
}

/** 人读格式(逐条一行;severity 前缀) */
export function formatViolations(rep: AuditReport, limit = 20): string {
  const lines = [`audit: ${rep.scannedCells} 格 ${rep.elapsedMs}ms${rep.partial ? ' [partial]' : ''}`];
  for (const s of rep.summary) lines.push(`  ${s.rule} ${s.severity}: ${s.count}`);
  for (const v of rep.violations.slice(0, limit)) {
    lines.push(`  [${v.severity}] ${v.rule} ${v.typeKey}(${v.sheet}) @(${v.x},${v.y}) ${v.detail}`);
  }
  if (rep.violations.length > limit) lines.push(`  …另 ${rep.violations.length - limit} 条`);
  return lines.join('\n');
}
