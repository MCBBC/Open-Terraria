// ★RB15b-F3（2026-09-14）remix 渲染乘区缺口清偿守卫。
// 病灶：remix 命中族（6-9/173/59/82/181，NPC.cs:8775/:8808/:8837/:8866/:9558/:9895/
// :11210/:11332 SetDefaults 主体块）盒已 ×1.3/×1.2/×1.1（iiiii228 已锁盒 39），
// 但 fromVanilla 渲染乘区写点只 `if (seedBox)` 写 vanillaScale → remix-only 世界
// 贴图按 def 基 scale 画 = 盒贴图不匹配。
// 修法：写点扩为 `seedBox || remixHit` 且除数改 def 基 scale（v.scale ?? 1）——
//   vScale 在 remix 块之后读取已含 ×1.3，remix-only 时 seedS.scale===vScale，
//   旧比值恒 1 修不动；终态/基态语义 = Game.ts:39129 -12 臂先例
//   box.scale/(v6.scale ?? 1)。消费面：Renderer drawEnemy :7092 等 11 处
//   `drawScale = (vanilla.scale ?? 1) × vanillaScale × expertRenderScale`，
//   vanilla 侧贴图 = npc.scale 终态（remix 乘在主体、先于 :17842 首盒）。
// 零漂移域：种子档-only 族与 remix 乘 scale 族零交集 ⇒ 未 remix 时
//   vScale===defBase ⇒ 既有 scale-stats 金标（245=0.5/266=1.1/113=0.65/39=1.32/
//   tenth 50=1）逐位不变。
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { bindScaleStatsWorld, scaleStatsWorldOf, f32 } from '../src/stats/ScaleStats';
import { vanillaNpc } from '../src/data/vanillaNpcs';

afterEach(() => { bindScaleStatsWorld(null); });

function withSeedFlags(flags: Record<string, boolean>, fn: (w: World) => void): void {
  const w = new World(100, 100, 7, 'rb15bf3');
  w.seedFlags = { ...w.seedFlags, ...flags };
  bindScaleStatsWorld(scaleStatsWorldOf(w, () => false));
  fn(w);
}

/** 渲染等价 drawScale（Renderer.ts :7092 消费式,expertRenderScale 经典档恒 1） */
function drawScaleOf(e: Enemy): number {
  return (e.vanilla?.scale ?? 1) * (e.vanillaScale ?? 1);
}

describe('RB15b-F3 remix 贴图乘区（drawScale = SetDefaults 终态 scale）', () => {
  it('remix-only 世界 6 号噬魂怪：贴图 ×1.3 与 trunc 盒 39 匹配（:8775/:17842）', () => {
    withSeedFlags({ remix: true }, () => {
      const e = Enemy.fromVanilla(6, 0, 0)!;
      const v = vanillaNpc(6)!;
      expect(drawScaleOf(e)).toBeCloseTo(Math.fround(1.3), 6);   // ×1.3f32
      expect(e.w).toBe(39);                                       // iiii228 盒锁
      expect(e.w).toBe(Math.trunc(f32(v.width * drawScaleOf(e)))); // 盒贴图一致
    });
  });

  it('82 幽灵 ×1.2 / 181 血肉之脸 ×1.1 / 173 克理米拉 ×1.3 贴图同步', () => {
    withSeedFlags({ remix: true }, () => {
      const cases: Array<[number, number]> = [[82, 1.2], [181, 1.1], [173, 1.3]];
      for (const [id, mul] of cases) {
        const e = Enemy.fromVanilla(id, 0, 0)!;
        const v = vanillaNpc(id)!;
        expect(drawScaleOf(e), `vid ${id}`).toBeCloseTo(Math.fround((v.scale ?? 1) * Math.fround(mul)), 6);
        expect(e.w, `vid ${id} 盒贴图一致`).toBe(Math.trunc(f32(v.width * drawScaleOf(e))));
      }
    });
  });

  it('59 岩浆史莱姆（remix 定值覆写、无 scale 乘）：贴图不误写（=def 基 scale）', () => {
    withSeedFlags({ remix: true }, () => {
      const e = Enemy.fromVanilla(59, 0, 0)!;
      expect(drawScaleOf(e)).toBe(vanillaNpc(59)!.scale ?? 1);
    });
  });

  it('经典世界零写：vanillaScale 缺省 1、盒=def 盒（零扰动负控）', () => {
    withSeedFlags({}, () => {
      const e = Enemy.fromVanilla(6, 0, 0)!;
      expect(e.vanillaScale).toBe(1);
      expect(e.w).toBe(vanillaNpc(6)!.width);
    });
  });

  it('种子档-only 族零漂移：FTW 245=0.5 / 39=1.1 贴图乘区与既有金标同值', () => {
    withSeedFlags({ getGoodWorld: true }, () => {
      expect(Enemy.fromVanilla(245, 0, 0)!.vanillaScale).toBeCloseTo(0.5, 6);
      expect(Enemy.fromVanilla(39, 0, 0)!.vanillaScale).toBeCloseTo(1.1, 6);
    });
    // FTW+remix 39-41：getGood 内 remix 子支 ×1.2 → 1.32（非本块路径,既有值不变）
    withSeedFlags({ getGoodWorld: true, remix: true }, () => {
      expect(Enemy.fromVanilla(39, 0, 0)!.vanillaScale).toBeCloseTo(1.32, 5);
    });
  });

  it('结构锁：写点须含 remixHit 支且除数为 def 基 scale（防回退 seedS.scale/vScale 恒 1）', () => {
    const src = readFileSync(new URL('../src/entities/Enemy.ts', import.meta.url), 'utf8');
    const m = src.match(/if \((seedBox[^;]*?)\) e\.vanillaScale = ([^;]+);/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('remixHit');
    expect(m![2]).toContain('(v.scale ?? 1)');
    expect(m![2]).not.toContain('/ vScale');   // 旧除数在 remix-only 支恒 1=静默失效
  });
});
