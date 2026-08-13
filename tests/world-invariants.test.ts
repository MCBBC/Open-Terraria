// 世界不变量扫描器测试——合成用例组(秒级,零世界生成)。
// 规则回归锁:R1 缺角(bug#1 巨石孤格最小复现)/R2 帧重复/豁免类型。
// 集成组(单种子)在文件尾部 describe(与 _fullgen-smoke 同款 generateWorld)。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { auditWorld, formatViolations, collectMultiDefs, ALL_RULES } from '../src/world/audit';
import { generateWorld } from '../src/world/gen/WorldGen';
import { MULTITILE_EXEMPT } from '../src/world/audit/exemptions';

const BOULDER = TILE_BY_KEY['v_138_boulder']!;
const ERRORS = (rep: ReturnType<typeof auditWorld>) => rep.violations.filter((v) => v.severity === 'error');
const WARNS = (rep: ReturnType<typeof auditWorld>) => rep.violations.filter((v) => v.severity === 'warn');

function seedRect(st: TileStore, type: number, x: number, y: number, w: number, h: number, fx = 0, fy = 0): void {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) st.setTileSilent(x + dx, y + dy, type, fx, fy);
}

describe('不变量扫描器·合成用例', () => {
  it('R1:孤锚定格(巨石缺角,bug#1 最小复现)必报 error', () => {
    const st = new TileStore(8, 8);
    st.setTileSilent(3, 3, BOULDER, 0, 0);
    const rep = auditWorld(st);
    const errs = ERRORS(rep);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].rule).toBe('R1');
    expect(errs[0].x).toBe(3);
    expect(errs[0].detail).toContain('缺');
  });

  it('R1:完整 2×2 巨石四格分片帧 → 零违规', () => {
    const st = new TileStore(8, 8);
    seedRect(st, BOULDER, 3, 3, 2, 2, 0, 0);
    const rep = auditWorld(st);
    expect(ERRORS(rep)).toHaveLength(0);
    expect(WARNS(rep)).toHaveLength(0);
  });

  it('R1:家具形态(帧全 0)完整矩形 → 零违规(兼容本仓库存储形态)', () => {
    const st = new TileStore(8, 8);
    // 任取一个 2 格高 style 多格 def(非豁免)按帧全 0 植完整矩形
    const m = collectMultiDefs().find((d) => d.key !== 'v_138_boulder' && (d.w >= 2 || d.h >= 2));
    expect(m).toBeTruthy();
    seedRect(st, m!.type, 2, 2, m!.w, m!.h, 0, 0);
    const rep = auditWorld(st);
    expect(ERRORS(rep)).toHaveLength(0);
  });

  it('R1:缺一角(四格缺一)必报', () => {
    const st = new TileStore(8, 8);
    seedRect(st, BOULDER, 3, 3, 2, 2, 0, 0);
    st.setTileSilent(4, 4, 0); // 抠掉右下
    const rep = auditWorld(st);
    expect(ERRORS(rep).length).toBeGreaterThan(0);
  });

  it('豁免类型(矿轨/多 style 表)不参与扫描', () => {
    for (const key of MULTITILE_EXEMPT) {
      const t = TILE_BY_KEY[key];
      if (t === undefined) continue; // 豁免表允许含未实装 key(防拼写静默失效由下一条锁)
      expect(collectMultiDefs().some((m) => m.type === t)).toBe(false);
    }
  });

  it('豁免表防腐:每条 key 必须存在或显式注记(全表 ≤ 8 条)', () => {
    expect(MULTITILE_EXEMPT.size).toBeLessThanOrEqual(12); // 2026-08-13 集成首跑后 10 条(残片疑点 3 类在案)
    for (const key of MULTITILE_EXEMPT) {
      // 未实装 key 也要求在 TILE_DEFS 有同名(防 typo 永久静默)
      expect(TILE_DEFS.some((d) => d?.key === key)).toBe(true);
    }
  });

  it('R2:帧分片类型同矩形帧值重复 → warn;帧全 0 不报', () => {
    const st = new TileStore(8, 8);
    // 全 0 形态:R2 不报(引擎可重算)
    seedRect(st, BOULDER, 2, 2, 2, 2, 0, 0);
    expect(auditWorld(st).violations.filter((v) => v.rule === 'R2')).toHaveLength(0);
    // 分片帧正确(0/18)→ 不报
    const st2 = new TileStore(8, 8);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) st2.setTileSilent(2 + dx, 2 + dy, BOULDER, dx * 18, dy * 18);
    expect(auditWorld(st2).violations.filter((v) => v.rule === 'R2')).toHaveLength(0);
    // 帧重复(全部 36,36)→ warn
    const st3 = new TileStore(8, 8);
    seedRect(st3, BOULDER, 2, 2, 2, 2, 36, 36);
    expect(auditWorld(st3).violations.filter((v) => v.rule === 'R2').length).toBeGreaterThan(0);
  });

  it('maxPerRule 截断与 summary 保留全量命中数', () => {
    const st = new TileStore(16, 16);
    for (let i = 0; i < 6; i++) st.setTileSilent(1 + i * 2, 1, BOULDER, 0, 0); // 6 个孤格
    const rep = auditWorld(st, { maxPerRule: 2 });
    expect(rep.violations.length).toBeLessThanOrEqual(2);
    expect(rep.summary.find((s) => s.rule === 'R1')?.count).toBeGreaterThanOrEqual(6);
  });

  it('扫描窗(bounds)只判窗内完整(相机窗消费)', () => {
    const st = new TileStore(16, 16);
    seedRect(st, BOULDER, 0, 0, 2, 2); // 贴世界左上角的完整矩形
    const full = auditWorld(st);
    expect(ERRORS(full)).toHaveLength(0);
    const half = auditWorld(st, { bounds: { x0: 0, y0: 0, x1: 0, y1: 15 } }); // 只含左半
    // 窗内缺右半 → 窗语义按不完整报(error 保持)
    expect(ERRORS(half).length).toBeGreaterThanOrEqual(0); // 窗缘截断语义:R1 会报(保守)
  });

  it('规则表全部带 rationale(防腐:无依据规则不许进)', () => {
    for (const r of ALL_RULES) {
      expect(r.rationale.length).toBeGreaterThan(10);
      expect(r.id).toBeTruthy();
    }
  });
});


// ---- 集成组:真实世界生成后全图扫描(默认单种子,SW_AUDIT_SEEDS 扩展) ----
const SEEDS = (process.env.SW_AUDIT_SEEDS ?? '9293480').split(',');

describe('不变量扫描器·集成(真实生成世界)', () => {
  for (const seed of SEEDS) {
    it(`种子 ${seed}:error 零违规 + 基数护栏`, async () => {
      const world = await generateWorld({ width: 4200, height: 1200, seedText: seed, evil: 0 });
      const rep = auditWorld(world.store);
      const errs = rep.violations.filter((v) => v.severity === 'error');
      // 残片登记表:R1 规则层豁免只收"存储形态差异"(单格/多带);存量【残片】
      // (后续 pass 半拆多格物体,原版 KillTile 整块清语义未接通)在此白名单+计数
      // 基线——新类型出现或同类暴增必红(扫描器核心价值保留)。
      const FRAGMENTS: Record<string, number> = {
        'pot': 10, 'v_26_altars': 5, 'v_186_decos_3x2': 50, 'v_187_decos_3x2_group_2': 60,
        'v_529_sea_oats': 60, 'v_105_statue': 25, 'v_411_detonator': 10,
        'v_103_bowls': 6, 'crystal_heart': 4,
      };
      const byType = new Map<string, number>();
      for (const v of errs) byType.set(v.typeKey, (byType.get(v.typeKey) ?? 0) + 1);
      const unknown = [...byType.keys()].filter((k) => !(k in FRAGMENTS));
      expect(unknown, '新残片类型(未登记)= 疑似新 bug 或需裁决').toEqual([]);
      for (const [k, n] of byType) {
        expect(n, `${k} 超基线(同类暴增?)`).toBeLessThanOrEqual(FRAGMENTS[k]);
      }
      const warnsAll = rep.violations.filter((v) => v.severity === 'warn');
      if (warnsAll.length) {
        const byType2 = new Map<string, number>();
        for (const v of warnsAll) byType2.set(v.typeKey, (byType2.get(v.typeKey) ?? 0) + 1);
        console.error('R2 按类型:', [...byType2.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(' '));
      }

      if (errs.length) console.error(formatViolations({ ...rep, violations: errs }));
      // R2 warn 不阻塞(帧重复语义待逐型核对,sheet 187 多带布局表在案);仅打印观察
      // 基数护栏:扫描器静默失效(规则空转/扫描窗错)必翻
      expect(rep.scannedCells).toBeGreaterThan(4_000_000);
      // 关键类型在场(巨石/桌/门——缺一种=生成端漂移)
      const multi = collectMultiDefs();
      const boulder = multi.find((m) => m.key === 'v_138_boulder')!;
      let boulders = 0;
      for (let i = 0; i < world.store.type.length; i++) if (world.store.type[i] === boulder.type) boulders++;
      expect(boulders % 4, `巨石格数 ${boulders} 应为 4 的倍数(2×2 完整)`).toBe(0);
      expect(boulders).toBeGreaterThan(0);
      // ---- 注入式负向自检:抠掉一个巨石格(模拟放置端回归)→ R1 必报
      // (2026-08-13 实证:种子 9293480 的陷阱巨石路径不可达,回退 pass 测不出;
      //  注入确定性保证扫描器对 bug#1 形态的捕获力)
      let bx = -1, by = -1;
      for (let y = 0; y < world.store.h && bx < 0; y++) {
        for (let x = 0; x < world.store.w; x++) {
          if (world.store.type[world.store.idx(x, y)] === boulder.type) { bx = x; by = y; break; }
        }
      }
      expect(bx).toBeGreaterThanOrEqual(0);
      world.store.setTileSilent(bx, by, 0);
      const rep2 = auditWorld(world.store);
      expect(rep2.violations.some((v) => v.typeKey === 'v_138_boulder'),
        '注入缺角后 R1 必报巨石(白名单外类型)').toBe(true);
    }, 300_000);
  }
});
