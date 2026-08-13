// 不变量规则实现(纯函数、零掷骰;结构仿 BrokenTrapCleanupPass 的全图扫描先例)。
import { TILE_DEFS } from '../../data/tiles';
import type { TileStore } from '../TileStore';
import type { AuditRule, AuditContext, Violation } from './types';
import { MULTITILE_EXEMPT } from './exemptions';

/** 多格 framed def 的尺寸:vanilla.fw/fh 优先(TEdit frameSize 口径),fallback def.w/h */
interface MultiDef { type: number; key: string; sheet: number; w: number; h: number }

export function collectMultiDefs(): MultiDef[] {
  const out: MultiDef[] = [];
  for (let type = 0; type < TILE_DEFS.length; type++) {
    const d = TILE_DEFS[type];
    if (!d || !d.framed || MULTITILE_EXEMPT.has(d.key)) continue;
    const v = d.vanilla;
    if (!v || v.frame !== 'style') continue; // auto/blend=块族
    if (d.key === 'pixel_block') continue; // 自研 RGB 编码帧(drawVanillaCell 特判)
    const w = v.fw ?? d.w ?? 1;
    const h = v.fh ?? d.h ?? 1;
    if (w <= 1 && h <= 1) continue; // 单格物体
    out.push({ type, key: d.key, sheet: v.sheet, w, h });
  }
  return out;
}

/** R1:多格 framed 每活跃格必须属于一个 w×h 全同类矩形(锚点无关)。
 *  依据:PlaceTile 按 TileObjectData 写满 fw×fh 格;BrokenTrapCleanup 对缺角巨石
 *  整块回滚石块(WorldGen.cs:27075-27092)。孤锚定格必然无候选锚 → 违规
 *  (2026-08-13 巨石陷阱孤格=此形态)。出界视为缺。 */
function rectIntact(st: TileStore, type: number, ax: number, ay: number, w: number, h: number,
  x0: number, y0: number, x1: number, y1: number): boolean {
  // 扫描窗内判定:仅要求窗内部分完整(窗缘截断不算缺——相机窗消费用)
  for (let dy = 0; dy < h; dy++) {
    const y = ay + dy;
    if (y < y0 || y > y1) return false;
    for (let dx = 0; dx < w; dx++) {
      const x = ax + dx;
      if (x < x0 || x > x1) return false;
      if (st.type[st.idx(x, y)] !== type) return false;
    }
  }
  return true;
}

export const RULE_R1_MULTITILE: AuditRule = {
  id: 'R1',
  title: 'framed-multitile-incomplete',
  rationale: 'PlaceTile 按 TileObjectData 写满 fw×fh;WorldGen.cs:27075-27092 缺角巨石整块回滚',
  severity: 'error',
  run(ctx: AuditContext): void {
    const { store: st, x0, y0, x1, y1, violations } = ctx;
    let hits = 0;
    const multi = collectMultiDefs();
    const byType = new Map(multi.map((m) => [m.type, m]));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = st.type[st.idx(x, y)];
        const m = byType.get(t);
        if (!m) continue;
        // 枚举候选锚点 ∈ [x-w+1..x]×[y-h+1..y]:任一使 w×h 全同即合法
        let ok = false;
        let bestAx = x, bestAy = y, missDx = -1, missDy = -1;
        for (let ay = y; ay > y - m.h && !ok; ay--) {
          for (let ax = x; ax > x - m.w; ax--) {
            if (rectIntact(st, t, ax, ay, m.w, m.h, x0, y0, x1, y1)) { ok = true; bestAx = ax; bestAy = ay; break; }
          }
        }
        if (ok) continue;
        // 记录违规:取最近候选(锚定在本格)的首个缺失偏移供人读
        bestAx = x; bestAy = y;
        outer: for (let dy = 0; dy < m.h; dy++) {
          for (let dx = 0; dx < m.w; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || st.type[st.idx(nx, ny)] !== t) {
              missDx = dx; missDy = dy; break outer;
            }
          }
        }
        hits++;
        const v: Violation = {
          rule: 'R1', severity: 'error', type: t, typeKey: m.key, sheet: m.sheet,
          x, y,
          detail: `${m.w}×${m.h} 缺角:以 (${x},${y}) 为左上缺 (+${missDx},+${missDy}) 格`,
        };
        violations.push(v);
      }
    }
    ctx.stats['R1'] = hits;
  },
};

/** R2:帧分片类型的 w×h 矩形内帧值互异(全 0 合法——VanillaTiler:808 扫描可重算;
 *  两两相同且非全 0 = 多格重复画锚点帧/重影)。仅对该类型在世界中存在任一非零帧
 *  才启用(经验检测,免维护"哪些类型带帧"清单)。severity=warn。 */
export const RULE_R2_FRAME_OFFSET: AuditRule = {
  id: 'R2',
  title: 'framed-frame-offset',
  rationale: '内部不变量:VanillaTiler.ts:808 帧全 0 可重算;帧重复=重影',
  severity: 'warn',
  run(ctx: AuditContext): void {
    const { store: st, x0, y0, x1, y1, violations } = ctx;
    const multi = collectMultiDefs();
    // 第一遍:每多格类型是否存在非零帧(帧分片类型检测)
    const hasNonZero = new Map<number, boolean>();
    for (const m of multi) hasNonZero.set(m.type, false);
    const byType = new Map(multi.map((m) => [m.type, m]));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = st.type[st.idx(x, y)];
        if (!byType.has(t) || hasNonZero.get(t)) continue;
        const i = st.idx(x, y);
        if (st.frameX[i] !== 0 || st.frameY[i] !== 0) hasNonZero.set(t, true);
      }
    }
    // 第二遍:帧分片类型的完整矩形检查帧值互异
    let hits = 0;
    for (const m of multi) {
      if (!hasNonZero.get(m.type)) continue;
      for (let y = y0; y + m.h - 1 <= y1; y++) {
        for (let x = x0; x + m.w - 1 <= x1; x++) {
          if (!rectIntact(st, m.type, x, y, m.w, m.h, x0, y0, x1, y1)) continue;
          const seen = new Set<string>();
          let dup = false;
          for (let dy = 0; dy < m.h; dy++) {
            for (let dx = 0; dx < m.w; dx++) {
              const i = st.idx(x + dx, y + dy);
              const k = `${st.frameX[i]},${st.frameY[i]}`;
              if (seen.has(k)) { dup = true; break; }
              seen.add(k);
            }
            if (dup) break;
          }
          if (!dup) continue;
          hits++;
          violations.push({
            rule: 'R2', severity: 'warn', type: m.type, typeKey: m.key, sheet: m.sheet,
            x, y, detail: `${m.w}×${m.h} 矩形内帧值重复(重复画锚点帧): ${[...seen].join(' | ')}`,
          });
        }
      }
    }
    ctx.stats['R2'] = hits;
  },
};

export const ALL_RULES: AuditRule[] = [RULE_R1_MULTITILE, RULE_R2_FRAME_OFFSET];
