// ★SW-FX14 2026-09-10 Boss 特化血条族 1457 对拍收尾测试（M7）。
// 金标 = Terarria1457/Terraria.GameContent.UI.BigProgressBar/ 全目录（1456↔1457
// diff 仅 BigProgressBarHelper.cs:66 `vector.Y += 1f`→`vector.Y++` 语义恒等；
// 1458 同目录逐字节相同——1456 锚定移植在 1457 基准下免数值改写）。
// 本文件覆盖既有 boss-bars.test.ts 未及的三面：
//   ① DrawFancyBar 头像落点【双路径】（Helper.cs:80-81 生命重载中心锚
//      vec+(17,34) vs :147-148 盾量重载净左上 vec+(4,20)——旧实现一刀切 (4,20)
//      使非 26×28 图标偏移，鹿角怪 50×48 达 (-12,+10)px）；
//   ② 15 条类 + NeverValid 的【形态签名】矩阵（盾槽有无 × 头像源动态/静态）；
//   ③ ShowText 数字开关接线（BigProgressBarSystem.cs:76/:74 + 设置行
//      IngameOptions.cs:806-812）结构锁。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  barIconOrigin, BOSS_BARS_BY_NPC_NET_ID, bossBarFor,
  COMMON_BAR, TWINS_BAR, EOW_BAR, BOC_BAR, GOLEM_BAR, MOONLORD_BAR,
  MARTIAN_SAUCER_BAR, PIRATE_SHIP_BAR, DEERCLOPS_BAR, NEVER_VALID_BAR,
  SOLAR_PILLAR_BAR, VORTEX_PILLAR_BAR, NEBULA_PILLAR_BAR, STARDUST_PILLAR_BAR,
  type BarNpc, type BarContext, type CollectInfo,
} from '../src/render/BossBars';

// ---------------------------------------------------------------- 仙品夹具
let nextId = 1;
function npc(p: Partial<BarNpc> & { type: number }): BarNpc {
  const x = p.x ?? 0, y = p.y ?? 0, w = p.w ?? 100, h = p.h ?? 100;
  return {
    id: nextId++, active: true, life: 60, lifeMax: 100,
    ai0: 0, ai1: 0, ai2: 0, ai3: 0, localAI3: 1,
    x, y, w, h, cx: x + w / 2, cy: y + h / 2, difficulty: 0,
    ...p,
  };
}
const REF: Record<number, number> = {
  14: 150, 267: 100, 245: 15000, 246: 25000, 398: 50000, 396: 45000, 397: 25000,
  395: 10000, 394: 3500, 393: 5000, 492: 2000,
};
function makeCtx(p: Partial<BarContext> & { npcs?: BarNpc[] } = {}): BarContext {
  return {
    npcs: p.npcs ?? [],
    playerCx: 0, playerCy: 0,
    screen: { x: -400, y: -300, w: 800, h: 600 },
    expertMode: false, getGoodWorld: false, shieldMax: 100,
    shieldOf: () => 40,
    refLifeMax: (t) => REF[t] ?? 0,
    ...p,
  };
}

// ---------------------------------------------------------------- ① 头像落点双路径
describe('SW-FX14 ① DrawFancyBar 头像落点双路径（Helper.cs:80-81 vs :147-148）', () => {
  it('生命重载：中心锚 vec+(17,34)，净左上=(17-w/2, 34-h/2)——按实测图标尺寸', () => {
    // 实测 public/sprites/vanilla/NPC_Head_Boss_*.png（sips 核对）：
    //   [0]克眼 26×28 → (4,20)（与盾量路径重合=原版唯一重合点）
    expect(barIconOrigin(false, 26, 28)).toEqual({ x: 4, y: 20 });
    //   [2]世吞 24×30 → (5,19)
    expect(barIconOrigin(false, 24, 30)).toEqual({ x: 5, y: 19 });
    //   [5]石巨人 28×30 → (3,19)
    expect(barIconOrigin(false, 28, 30)).toEqual({ x: 3, y: 19 });
    //   [8]月总 34×36 → (0,16)
    expect(barIconOrigin(false, 34, 36)).toEqual({ x: 0, y: 16 });
    //   [9]火星碟 30×24 → (2,22)
    expect(barIconOrigin(false, 30, 24)).toEqual({ x: 2, y: 22 });
    //   [23]克脑 30×30 → (2,19)
    expect(barIconOrigin(false, 30, 30)).toEqual({ x: 2, y: 19 });
    //   [39]鹿角怪 50×48 → (-8,10)
    expect(barIconOrigin(false, 50, 48)).toEqual({ x: -8, y: 10 });
  });
  it('盾量重载：净左上恒 (4,20)（:147-148 size/2 自消）——四塔条专用', () => {
    expect(barIconOrigin(true, 26, 28)).toEqual({ x: 4, y: 20 });
    expect(barIconOrigin(true, 26, 30)).toEqual({ x: 4, y: 20 });   // [27-30]塔 26×30
    expect(barIconOrigin(true, 50, 48)).toEqual({ x: 4, y: 20 });
  });
  it('原版怪癖保留：两路径仅对 26×28 图标重合（(26,28)/2 硬编码推定）', () => {
    const onlyOverlap = (w: number, h: number) =>
      barIconOrigin(false, w, h).x === barIconOrigin(true, w, h).x
      && barIconOrigin(false, w, h).y === barIconOrigin(true, w, h).y;
    expect(onlyOverlap(26, 28)).toBe(true);
    expect(onlyOverlap(24, 30)).toBe(false);
    expect(onlyOverlap(34, 36)).toBe(false);
  });
  it('结构锁：drawBigProgressBar 头像落点必须经 barIconOrigin 双路径（防回退一刀切）', () => {
    const src = readFileSync(join(__dirname, '../src/render/BossBars.ts'), 'utf8');
    expect(src).toContain('barIconOrigin(info.shield != null, head.sw, head.sh)');
    // 旧一刀切写法不得回归（直量 vec.x + 4 的头像 drawImage 已退役）
    expect(src).not.toMatch(/drawImage\(head\.img[^;]*?vec\.x \+ 4,\s*vec\.y \+ 20/);
  });
});

// ---------------------------------------------------------------- ② 形态签名矩阵
// 19 类定谳矩阵（BigProgressBarSystem.cs 字典 :102-129 + 各条 .cs）：
//   条键 → [盾槽有无, 头像源]；盾槽 ⟺ LunarPillar 抽象族四子（:53 DrawFancyBar
//   六参重载），头像源「动态」= 走 GetBossHeadTextureIndex（NPC.cs:7584 动态覆写），
//   「静态」= 条 .cs 直取 NPCID.Sets.BossHeadTextures[x]。
describe('SW-FX14 ② 15 条类 + NeverValid 形态签名矩阵', () => {
  interface Case { bar: { key: string; validateAndCollect(t: BarNpc, c: BarContext): CollectInfo | null }; ids: number[]; shield: boolean }
  const CASES: Case[] = [
    { bar: SOLAR_PILLAR_BAR, ids: [517], shield: true },
    { bar: VORTEX_PILLAR_BAR, ids: [422], shield: true },
    { bar: NEBULA_PILLAR_BAR, ids: [507], shield: true },
    { bar: STARDUST_PILLAR_BAR, ids: [493], shield: true },
  ];
  it('四塔条：盾槽恒在（cur=max=40/100 桩）且 life 独立', () => {
    for (const c of CASES) {
      for (const id of c.ids) {
        const tracked = npc({ type: id });
        // 战区门 = SceneMetrics 玩家 4000px 内有该塔（ctx.npcs 必须含塔本体）
        const r = c.bar.validateAndCollect(tracked, makeCtx({ npcs: [tracked] }));
        expect(r, `tower ${id}`).not.toBeNull();
        expect(r!.shield).toEqual({ cur: 40, max: 100 });
        expect(r!.life).toBe(60);
      }
    }
  });
  it('非塔条：盾槽恒缺（生命重载 DrawFancyBar 四参 :26）', () => {
    const pairs: Array<[string, BarNpc]> = [
      ['common', npc({ type: 4 })],
      ['twins', npc({ type: 125, ai0: 2 })],
      ['eow', npc({ type: 13 })],
      ['boc', npc({ type: 266, ai0: 1 })],
      ['golem', npc({ type: 246 })],
      ['moonlord', npc({ type: 398, localAI3: 2 })],
      ['saucer', npc({ type: 395 })],
      ['pirate-ship', npc({ type: 491 })],
      ['deerclops', npc({ type: 668 })],
    ];
    const bars: Record<string, typeof COMMON_BAR> = {
      common: COMMON_BAR, twins: TWINS_BAR, eow: EOW_BAR, boc: BOC_BAR,
      golem: GOLEM_BAR, moonlord: MOONLORD_BAR, saucer: MARTIAN_SAUCER_BAR,
      'pirate-ship': PIRATE_SHIP_BAR, deerclops: DEERCLOPS_BAR,
    };
    for (const [key, t] of pairs) {
      const r = bars[key].validateAndCollect(t, makeCtx({ npcs: [t] }));
      expect(r, key).not.toBeNull();
      expect(r!.shield, `${key} 不得带盾槽`).toBeUndefined();
    }
  });
  it('双路径判定源 = CollectInfo.shield 有无（与原版重载选择逐位对应）', () => {
    // 传盾槽 → barIconOrigin 走 (4,20) 臂；缺省 → (17,34) 中心锚臂
    const tower = npc({ type: 517 });
    const pillar = SOLAR_PILLAR_BAR.validateAndCollect(tower, makeCtx({ npcs: [tower] }))!;
    expect(pillar.shield != null).toBe(true);
    const common = COMMON_BAR.validateAndCollect(npc({ type: 4 }), makeCtx())!;
    expect(common.shield == null).toBe(true);
  });
  it('分派表 26 键全量在位（:102-129 键集；JS 对象整数键不保插入序,按集合等价）', () => {
    const EXPECTED_KEYS = [
      125, 126, 13, 14, 15, 266, 245, 246, 249, 517, 422, 507, 493,
      398, 396, 397, 548, 549, 491, 492, 440, 395, 393, 394, 68, 668,
    ];
    const got = Object.keys(BOSS_BARS_BY_NPC_NET_ID).map(Number);
    expect(got.length).toBe(26);
    expect([...got].sort((a, b) => a - b)).toEqual([...EXPECTED_KEYS].sort((a, b) => a - b));
    // 19 类实体化：15 条类 + NeverValid 压制 + Common 兜底 + 分派字典 26 键
    expect(bossBarFor(4).key).toBe('common');
    expect(bossBarFor(249).key).toBe('never');
    expect(NEVER_VALID_BAR.validateAndCollect(npc({ type: 249 }), makeCtx())).toBeNull();
  });
});

// ---------------------------------------------------------------- ③ ShowText 接线
describe('SW-FX14 ③ Boss 血条数字开关（BigProgressBarSystem.ShowText）', () => {
  it('结构锁：Renderer.drawBossBar 灌 options.data.showBossBarHealthText', () => {
    const src = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
    expect(src).toContain('viewW, viewH, info, options.data.showBossBarHealthText');
  });
  it('结构锁：BossBars.drawBigProgressBar 默认显数字（showText = true，:76 缺省）', () => {
    const src = readFileSync(join(__dirname, '../src/render/BossBars.ts'), 'utf8');
    expect(src).toMatch(/showText = true/);
  });
  it('DrawHealthText 门语义：showText=false 时文本三段整段跳过（Helper.cs:57/:123）', async () => {
    // CombatTextFont 以 spy 桩替身（测试环境无字形贴图,真函数按 READY 门早退
    // 不可观测）——计数 border-string 画段次数：true=三段('/'、cur、max)，
    // false=零段（整门跳过,Helper.cs :57 `if (ShowText)`/:123 盾>0 分支同门）
    vi.resetModules();   // 击穿静态导入的模块缓存,doMock 才能注入动态导入链
    vi.doMock('../src/render/CombatTextFont', () => ({
      drawItemStackBorderString: vi.fn(),
      itemStackMeasure: () => ({ w: 10, h: 20 }),
    }));
    const { drawBigProgressBar: drawMocked } = await import('../src/render/BossBars');
    const ctx = {
      save: () => {}, restore: () => {}, drawImage: () => {},
      fillRect: () => {}, imageSmoothingEnabled: false,
    } as unknown as CanvasRenderingContext2D;
    const img = { img: { width: 8, height: 8 } } as never;
    const info: CollectInfo = { life: 50, lifeMax: 100, headIndex: 0 };
    const font = await import('../src/render/CombatTextFont');
    const spy = vi.mocked(font.drawItemStackBorderString);
    drawMocked(ctx, { bar: img, head: img }, 800, 600, info, true);
    expect(spy).toHaveBeenCalledTimes(3);   // '/' + cur + max（DrawHealthText :62-76）
    spy.mockClear();
    drawMocked(ctx, { bar: img, head: img }, 800, 600, info, false);
    expect(spy).toHaveBeenCalledTimes(0);   // 数字整段跳过
    vi.doUnmock('../src/render/CombatTextFont');
  });
});
