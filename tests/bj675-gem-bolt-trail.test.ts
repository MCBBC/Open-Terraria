// ★BJ675（2026-10-14 用户实报「紫晶法杖的弹幕效果也不对」）判别锁：
// 宝石法珠弹 121-126/597/1120 的 GemStaffShotDrawer 拖尾三面 1:1
// （Terarria1457/Terraria.Graphics/GemStaffShotDrawer.cs:16-39 +
//  ProjectileID.cs:387 TrailCacheLength + Main.cs:28623-28663 三色表）。
// 定谳（反编译亲读锚）：
//  · SetDefaults alpha=255（Projectile.cs:2107-2114）→ AI_029 全链无 alpha 写
//    （:38515-38692）→ GetAlpha 缺省式 (255−α)/255=0（:81507-81520）→ 弹本体
//    贴图恒隐（1456:1832-1841 同值=1.4.4 本有面）——本仓 draw 早退支（不画本体
//    +四层灰芯脉冲）已 1:1,不在本锁范围。
//  · 可见视觉=拖尾+尘+点光。拖尾旧实装四处反/偏（观感「短暗尾」vs 原版「长白
//    紫光带」）：①记录 6 点 vs TrailCacheLength 30（ProjectileID.cs:387:
//    121-126/597=30、1120=20）②半宽 9 vs StripWidth 16 ③色序 Lerp(c2,c0) 反
//    （尾=亮紫;原版尾=trailColor2 深紫）④a=min(1,v*1.7) 包络反（头透明尾恒亮;
//    原版头满亮白心、尾 ×(1−GetLerpValue(0,0.98,v)) 线性熄灭）。
//  · 121 c1 主色 Violet=(238,130,238)（XNA KnownColor;旧值 (0.58,0,0.83) 误写）。
//  · 123 蓝晶三色 A/=2（Main.cs:28637-28645）→ 顶点 alpha ×0.5。
import { describe, it, expect } from 'vitest';
import { Arrow } from '../src/entities/Arrow';
import { gemTrailPts, GEM_TRAIL_COLORS } from '../src/entities/Arrow';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

function makeHooks(): GameHooks {
  return {
    world: { store: new TileStore(200, 120) } as never,
    player: { equipStats: {}, cx: 800, cy: 1440, x: 790, y: 1419, w: 20, h: 42, dead: false } as never,
    enemies: () => [],
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  } as unknown as GameHooks;
}

/** GemStaffShotDrawer.StripColors 的独立复算式（GemStaffShotDrawer.cs:30-39） */
function vanillaStripColor(cols: readonly (readonly number[])[], v: number): { r: number; g: number; b: number; a: number } {
  const [c1, c2, c3] = cols;
  const val = [c1[0] + (c2[0] - c1[0]) * v, c1[1] + (c2[1] - c1[1]) * v, c1[2] + (c2[2] - c1[2]) * v];
  const gate = Math.max(0, Math.min(1, (v + 0.2) / 0.7));      // Utils.GetLerpValue(-0.2f, 0.5f, v)
  const fade = 1 - Math.max(0, Math.min(1, v / 0.98));         // 1 - GetLerpValue(0f, 0.98f, v)
  return {
    r: (c3[0] + (val[0] - c3[0]) * gate) * fade,
    g: (c3[1] + (val[1] - c3[1]) * gate) * fade,
    b: (c3[2] + (val[2] - c3[2]) * gate) * fade,
    a: fade,
  };
}

describe('BJ675 宝石法珠拖尾：记录容量 = TrailCacheLength（ProjectileID.cs:387）', () => {
  it('121 紫晶：35 tick 后 gemTrail=60 numbers（30 点，速度 6 → ~180px 光带）', () => {
    const a = new Arrow(500, 800, 6, 0, 15, 3.25, 121, { grav: 0, life: 300, pierce: 1 });
    const g = makeHooks();
    for (let i = 0; i < 35; i++) a.fixedUpdate(1 / 60, g);
    const trail = (a as unknown as { gemTrail: number[] }).gemTrail;
    expect(trail.length).toBe(60);            // 旧值 12（6 点）= 截短 80% 的病根
  });
  it('1120 琥珀弹：TrailCacheLength=20（40 numbers），非宝石七弹的 30', () => {
    const a = new Arrow(500, 800, 6, 0, 15, 3.25, 1120, { grav: 0, life: 75, pierce: 1 });
    const g = makeHooks();
    for (let i = 0; i < 25; i++) a.fixedUpdate(1 / 60, g);
    const trail = (a as unknown as { gemTrail: number[] }).gemTrail;
    expect(trail.length).toBe(40);
  });
});

describe('BJ675 宝石法珠拖尾：gemTrailPts = StripColors/StripWidth 1:1', () => {
  const raw = Array.from({ length: 30 }, (_, i) => [i * 6, 0]).flat();   // 30 点直飞采样（60 numbers）

  it('121：头（v=0）满亮 a=1、白门 Lerp(White,Violet,0.2/0.7)——头部不透明（旧实装头 a=0 反包络）', () => {
    const pts = gemTrailPts(raw, 121);
    expect(pts).toHaveLength(30);
    const head = pts[0];
    expect(head.a).toBeCloseTo(1, 6);                       // 旧 a=min(1,0*1.7)=0 恰红
    const vs = vanillaStripColor(GEM_TRAIL_COLORS[121], 0);
    expect(head.r).toBeCloseTo(vs.r, 6);
    expect(head.g).toBeCloseTo(vs.g, 6);
    expect(head.b).toBeCloseTo(vs.b, 6);
  });
  it('121：尾（v=1）a=0 线性熄灭 + 色序 Lerp(Violet,Purple,v)（旧实装尾=Violet 恒亮恰红）', () => {
    const pts = gemTrailPts(raw, 121);
    const tail = pts[29];
    expect(tail.a).toBeCloseTo(0, 6);
    expect(tail.r).toBeCloseTo(0, 6);                       // rgb 同乘淡出（XNA Color*float 四通道）
    // 尾前一点（v=28/29≈0.966）：主色应已过渡向 Purple=(0.502,0,0.502) 而非 Violet
    const nearTail = pts[28];
    const vs28 = vanillaStripColor(GEM_TRAIL_COLORS[121], 28 / 29);
    expect(nearTail.r).toBeCloseTo(vs28.r, 6);
    // 独立断言方向：Lerp(Violet,Purple) 尾段 r < 头段 r（0.502 < 0.933）
    expect(nearTail.r / Math.max(1e-9, nearTail.a)).toBeLessThan(0.75);
  });
  it('中段全点对拍 vanilla 复算式（124 翡翠 LimeGreen→Green 方向）', () => {
    const pts = gemTrailPts(raw, 124);
    for (const i of [0, 1, 5, 10, 15, 20, 25, 29]) {
      const vs = vanillaStripColor(GEM_TRAIL_COLORS[124], i / 29);
      expect(pts[i].r).toBeCloseTo(vs.r, 6);
      expect(pts[i].g).toBeCloseTo(vs.g, 6);
      expect(pts[i].b).toBeCloseTo(vs.b, 6);
      expect(pts[i].a).toBeCloseTo(vs.a, 6);
    }
  });
  it('带宽：全点 hw=16（GemStaffShotDrawer.cs:36-39 StripWidth 恒 16;旧值 9）', () => {
    for (const p of gemTrailPts(raw, 121)) expect(p.hw).toBe(16);
  });
  it('123 蓝晶：三色 A/=2（Main.cs:28637-28645,byte 截断 127/255）→ 顶点 alpha ×127/255', () => {
    const pts = gemTrailPts(raw, 123);
    expect(pts[0].a).toBeCloseTo(127 / 255, 6);             // 头 fade=1 × 127/255
    const mid = vanillaStripColor(GEM_TRAIL_COLORS[123], 10 / 29);
    expect(pts[10].a).toBeCloseTo(mid.a * (127 / 255), 6);
  });
  it('色表钉值：121 c1=XNA Violet=(238,130,238)/255（旧 (0.58,0,0.83) 误写恰红）', () => {
    const c1 = GEM_TRAIL_COLORS[121][0];
    expect(c1[0]).toBeCloseTo(238 / 255, 6);
    expect(c1[1]).toBeCloseTo(130 / 255, 6);
    expect(c1[2]).toBeCloseTo(238 / 255, 6);
    const c2 = GEM_TRAIL_COLORS[121][1];                    // Purple=(128,0,128)
    expect(c2[0]).toBeCloseTo(128 / 255, 6);
    expect(c2[1]).toBe(0);
    expect(c2[2]).toBeCloseTo(128 / 255, 6);
  });
});
