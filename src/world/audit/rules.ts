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

/** 残片查找(R1 同判定,供清扫 pass 复用——单一事实源防两处漂移):
 *  返回所有"不属于任何完整 w×h 同类矩形"的多格 framed 活跃格。
 *  onlyKeys 限定类型(清扫只处理可清除的破损物体,原版保留形态不在此列) */
export function findFragments(st: TileStore, onlyKeys?: ReadonlySet<string>): Array<{ x: number; y: number; key: string; type: number }> {
  const out: Array<{ x: number; y: number; key: string; type: number }> = [];
  const multi = collectMultiDefs().filter((m) => !onlyKeys || onlyKeys.has(m.key));
  const byType = new Map(multi.map((m) => [m.type, m]));
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const i0 = st.idx(x, y);
      const t = st.type[i0];
      const m = byType.get(t);
      if (!m) continue;
      // ★幽灵保域（2026-09-02）：候选门=本函数文档口径「每【活跃】格」——幽灵格
      //  （flags=0,type≠0）不是活跃格，不作为残片判定起点（保域后 finalize 净化
      //  已删,幽灵型若恰为多格 framed 型曾会被误判残片→清扫清掉=x86 幽灵债）。
      //  缺角检查（下 inner 循环）维持原样：幽灵同型格仍算"在"（type 相等短路）。
      if (!st.flags[i0]) continue;
      let ok = false;
      for (let ay = y; ay > y - m.h && !ok; ay--) {
        for (let ax = x; ax > x - m.w; ax--) {
          let full = true;
          for (let dy = 0; dy < m.h && full; dy++) {
            for (let dx = 0; dx < m.w; dx++) {
              const nx = ax + dx, ny = ay + dy;
              if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) { full = false; break; }
              const qi = st.idx(nx, ny);
              if (st.type[qi] === t) continue;
              // ★TTTTTTT：缺格被其他活性物覆写=vanilla 孤儿形态（FinalCleanup 落体柱
              //   tileCut 直写覆写罐列,邻列残罐无 TileFrame 重访即存活——const/s22222
              //   #105 (1800,343)/(1800,344) x86 实证）,不计缺角;空格/非活性缺格仍=真残片。
              if (st.flags[qi]) continue;
              full = false; break;
            }
          }
          if (full) { ok = true; break; }
        }
      }
      if (!ok) out.push({ x, y, key: m.key, type: t });
    }
  }
  return out;
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
        const iC = st.idx(x, y);
        const t = st.type[iC];
        const m = byType.get(t);
        if (!m) continue;
        // ★幽灵保域（2026-09-02）：候选门=本规则文档口径「每【活跃】格」——幽灵格
        //  （flags=0,type≠0,x86 DEACT 残型,净化删除后存活到出口）不是活跃格，
        //  不作为 R1 判定起点（与 findFragments 清扫侧同门；缺角检查仍按 type
        //  相等短路=幽灵同型格算"在"）。曾无此门时幽灵坛/罐/蛋格被误记残片。
        if (!st.flags[iC]) continue;
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
          let dup = false, allZero = true, allExplicit = true;
          for (let dy = 0; dy < m.h; dy++) {
            for (let dx = 0; dx < m.w; dx++) {
              const i = st.idx(x + dx, y + dy);
              if (st.frameX[i] !== 0 || st.frameY[i] !== 0) allZero = false;
              else allExplicit = false;
              const k = `${st.frameX[i]},${st.frameY[i]}`;
              if (seen.has(k)) { dup = true; }
              seen.add(k);
            }
          }
          // ★零帧参与=渲染扫描路径接管(VanillaTiler:808 向左/上连续延伸重算,
          //   全 0 或"0+分片混合"形态均由此重建,重复判定不可靠)——仅当矩形内
          //   【全非零且重复】才是确定的重复画锚点帧(2026-08-13 R2 悬案裁决:
          //   31 处误报=全 0 物体;2 处真浮出=仙人掌/织布机混合零帧,均扫描可重建)
          if (!dup || allZero || !allExplicit) continue;
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
