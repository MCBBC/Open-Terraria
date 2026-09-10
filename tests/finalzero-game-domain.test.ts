// 终零波·Game.ts 域 回归锁（2026-09-01）——批内九簇实装项各至少一条断言：
//   A. 床设出生点共享解析核（resolveSpawnPoint 纯函数）
//   B. AFK 计数链（stepAfkCounter 纯函数 + VanillaSpawner noGroundWorms 消费面）
//   C. 护士经济簇（NurseCannotRemoveDebuff 排除表消费 + Dazed/OgreSpit 入档 +
//      折扣卡生产链；nurseHealCost 经 Game 原型桩直算）
//   D. GRAB_RANGE 逐 vid 化（dropScanCtx.grabRangeBonusFor ≡ getItemGrabRangeBonus）
//   E. pendingItemReuse / UsingOrReusingItem（Game 原型桩读面三态）
//   F. 开关 UI 最小可行版（builderAccStatus[2]/[3] options 面 + 语义方向）
//   G. 十周年世界门（buildTravelStock 同种子对拍：tenthAnniversary → +1/+2）
//   H. 快速堆叠 HasLockedInventory 演示窗（Game 静态常量与字段门语义）
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveSpawnPoint } from '../src/core/Game';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import { Player, stepAfkCounter, AFK_TIME_NEEDED_FOR_NO_WORM_SPAWNS } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import {
  BuffType, BuffState, BUFF_DEFS,
  vanillaIdOfBuff, isNurseLockedBuff, NURSE_CANNOT_REMOVE_VANILLA,
} from '../src/stats/Buffs';
import { beginDropScanCtx, getDropScanCtx, grabRangeBonusFor } from '../src/entities/dropScanCtx';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { accFxOfInternal } from '../src/data/vanillaAccFx';
import { TILE_BY_KEY } from '../src/data/tiles';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

/** 与 consumable-remainder.test.ts 同款 LCG（同种子确定性双跑） */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
describe('终零波 A：床设出生点共享解析核（Player.Spawn failover）', () => {
  const revalidate = (fail: boolean) => (x: number, y: number): null | '' | string =>
    (fail ? 'Game.BedObstructed' : null);
  it('未设床（当前==初始）→ 直接初始，无复验掷', () => {
    expect(resolveSpawnPoint(42, 60, 42, 60, revalidate(true))).toEqual([42, 60]);
  });
  it('设床且 CheckSpawn 通过 → 保持床点', () => {
    expect(resolveSpawnPoint(30, 50, 42, 60, revalidate(false))).toEqual([30, 50]);
  });
  it('床被拆/房间破坏 → 床点失效回世界出生点（存档旗保留=入参不动）', () => {
    // ''（静默档）与文案键档同走失败臂 —— P.cs :37853-37856 SpawnX=-1 支
    expect(resolveSpawnPoint(30, 50, 42, 60, () => '')).toEqual([42, 60]);
    expect(resolveSpawnPoint(30, 50, 42, 60, revalidate(true))).toEqual([42, 60]);
  });
});

// ===========================================================================
describe('终零波 B1：AFK 计数步进核（Player.cs:25692-25701 1:1）', () => {
  const base = { vx: 0, vy: 0, itemAnimTicks: 0, heldIsKite: false,
    inputX: 0, inputUp: false, inputDown: false, inputJump: false,
    inputTorch: false, afkCounter: 9 };
  it('站立+动画空闲+六输入皆空 → ++（9 → 10）', () => {
    expect(stepAfkCounter(base)).toBe(10);
  });
  it('阈值常量 = 300（AFKTimeNeededForNoWormSpawns,Player.cs:971）', () => {
    expect(AFK_TIME_NEEDED_FOR_NO_WORM_SPAWNS).toBe(300);
  });
  it.each([
    ['移速超阈 |vx|≥0.05', { ...base, vx: 0.05 }],
    ['垂直速度 |vy|≥0.05', { ...base, vy: 0.1 }],
    ['水平输入 controlLeft/Right', { ...base, inputX: -1 }],
    ['跳跃 controlJump', { ...base, inputJump: true }],
    ['上键 controlUp', { ...base, inputUp: true }],
    ['下键 controlDown', { ...base, inputDown: true }],
    ['火把键 controlTorch', { ...base, inputTorch: true }],
    ['使用中 itemAnimation>0 且非风筝', { ...base, itemAnimTicks: 5 }],
  ])('%s → 清零', (_n, s) => {
    expect(stepAfkCounter(s)).toBe(0);
  });
  it('持械风筝（IsAKite 豁免支 ：25692 `|| IsAKite[HeldItem]`）→ 使用中也计数', () => {
    expect(stepAfkCounter({ ...base, itemAnimTicks: 5, heldIsKite: true })).toBe(10);
  });
});

describe('终零波 B2：spawner 消费面（NPC.cs:1052-1053 !skyMob && noGroundWorms → noWorms）', () => {
  // 不与类本体相交：pX/pY/skyMob/noWorms/setFlagsForChosenTile 是私有成员,
  // 交叉类型会把访问解析成 never（TS 私有域合并规则）
  type SpPriv = {
    pX: number; pY: number; skyMob?: boolean; noWorms?: boolean; noGroundWorms?: boolean;
    setFlagsForChosenTile(x: number, y: number, t: number, r: RNG): void;
  };
  function mkSpawner(): SpPriv {
    const w = new World(400, 600, 42, 'rate-test');
    const sp = new VanillaSpawner(w) as unknown as SpPriv;
    sp.pX = 200; sp.pY = 100;   // SetSpawnFlags 的玩家格注入位
    sp.noWorms = false;
    return sp;
  }
  const dirtVid = TILE_BY_KEY['dirt'];           // 仓内 tile id ≠ sheet,取普通土块内部 id
  it('AFK 达标（noGroundWorms=true）且非天空怪轮 → 选点轮置 noWorms', () => {
    const sp = mkSpawner();
    sp.noGroundWorms = true;
    sp.setFlagsForChosenTile(200, 120, dirtVid, new RNG(12345));
    expect(sp.noWorms).toBe(true);
  });
  it('未达 AFK（noGroundWorms=false）→ 不置', () => {
    const sp = mkSpawner();
    sp.setFlagsForChosenTile(200, 120, dirtVid, new RNG(12345));
    expect(sp.noWorms).toBe(false);
  });
  it('天空怪轮（skyMob=true）豁免——原版 :1052 !skyMob 门', () => {
    const sp = mkSpawner();
    sp.skyMob = true;
    sp.noGroundWorms = true;
    sp.setFlagsForChosenTile(200, 120, dirtVid, new RNG(12345));
    expect(sp.noWorms).toBe(false);
  });
});

// ===========================================================================
describe('终零波 C1：护士排除表（BuffID.Sets.NurseCannotRemoveDebuff BuffID.cs:32）', () => {
  it('结构不变量：DEBUFFS 任一成员的 vanilla id 不在排除表（原「零交集」论断长期有效）', () => {
    for (const bt of BuffState.DEBUFFS) {
      const vid = vanillaIdOfBuff(bt);
      expect(isNurseLockedBuff(vid),
        `DEBUFFS 成员 ${String(bt)} (vanilla ${vid}) 落进护士排除表`).toBe(false);
    }
  });
  it('全表 20 id 对拍（28,34,87,89,21,86,199,332,333,334,165,146,48,158,157,350,215,147,321,43）', () => {
    expect([...NURSE_CANNOT_REMOVE_VANILLA].sort((a, b) => a - b))
      .toEqual([21, 28, 34, 43, 48, 86, 87, 89, 146, 147, 157, 158, 165, 199, 215, 321, 332, 333, 334, 350]);
  });
});

describe('终零波 C2：Dazed(160)/OgreSpit(197) 玩家侧入档', () => {
  it('vanilla id 反查与 DEBUFFS 在册（均不在护士排除表 → 可计价可清除）', () => {
    expect(vanillaIdOfBuff(BuffType.Dazed)).toBe(160);
    expect(vanillaIdOfBuff(BuffType.OgreSpit)).toBe(197);
    expect(BuffState.DEBUFFS.has(BuffType.Dazed)).toBe(true);
    expect(BuffState.DEBUFFS.has(BuffType.OgreSpit)).toBe(true);
    expect(BUFF_DEFS[BuffType.Dazed].descKey).toBe('BuffDescription.Dazed');
    expect(BUFF_DEFS[BuffType.OgreSpit].descKey).toBe('BuffDescription.OgreSpit');
  });
  it('debuffCount>1s（=原版 buffTime>60t）门：Dazed/OgreSpit 计入、短残剂不计', () => {
    const p = new Player(0, 0, new Inventory());
    p.buffs.apply(BuffType.Dazed, 5);               // 5s = 300t > 60t ✓
    p.buffs.apply(BuffType.OgreSpit, 15);           // 900t ✓
    p.buffs.apply(BuffType.Wet, 0.5);               // 30t ≤ 60t ✗
    expect(p.buffs.debuffCount(1)).toBe(2);
  });
  it('clearDebuffs 双清；排除表成员保留路径可用（Hunger 333 入档但在 DEBUFFS 外）', () => {
    const p = new Player(0, 0, new Inventory());
    p.buffs.apply(BuffType.OgreSpit, 10);
    p.buffs.apply(BuffType.Wet, 10);                // DEBUFFS 可清除成员
    p.buffs.clearDebuffs();
    expect(p.buffs.has(BuffType.OgreSpit)).toBe(false);
    expect(p.buffs.has(BuffType.Wet)).toBe(false);
  });
  it('strongestMoveSpeedDebuff：两者 ×1/3 最强单取（P.cs:26129-26140）', () => {
    const p = new Player(0, 0, new Inventory());
    p.buffs.apply(BuffType.Dazed, 5);
    expect(p.buffs.strongestMoveSpeedDebuff).toBeCloseTo(1 / 3);
    p.buffs.clearDebuffs();
    p.buffs.apply(BuffType.OgreSpit, 5);
    expect(p.buffs.strongestMoveSpeedDebuff).toBeCloseTo(1 / 3);
    p.buffs.clearDebuffs();
    p.buffs.apply(BuffType.Burning, 5);             // 叠加场景取 min(0.5, 1/3)=1/3? Burning 单独 0.5
    expect(p.buffs.strongestMoveSpeedDebuff).toBe(0.5);
    p.buffs.apply(BuffType.OgreSpit, 5);
    expect(p.buffs.strongestMoveSpeedDebuff).toBeCloseTo(1 / 3);
  });
});

describe('终零波 C3：折扣卡经济链（854/3035 → equipStats.discount → nurseHealCost×0.8）', () => {
  it('数据面：accfx "854"/"3035" 带 discount 旗（P.discountEquipped 生产源）', () => {
    expect(accFxOfInternal(_iid(854))?.discount).toBeTruthy();
    expect(accFxOfInternal(_iid(3035))?.discount).toBeTruthy();
  });
  it('聚合面：装折扣卡 → equipStats.discount=true；卸下回 false', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.equipStats.discount).toBe(false);
    p.inv.armor[3] = { id: _iid(854), stack: 1 };
    expect(p.equipStats.discount).toBe(true);
    p.inv.armor[3] = null;
    expect(p.equipStats.discount).toBe(false);
  });
  it('护士费用：缺 100 血无 debuff 普通世界 =100 铜；Dazed 计入 → 200；折后 floor(160)',
    () => {
      const g = Object.create(Game.prototype) as unknown as Record<string, unknown>
        & { nurseHealCost: () => number };
      const p = new Player(0, 0, new Inventory());
      p.baseMaxHp = 200; p.hp = 100;                // 缺血 100（baseMaxHp=statLifeMax 背书）
      const w = new World(100, 100, 7, 'nurse');
      g.player = p; g.world = w; g.shopHappinessMul = 1;
      expect(g.nurseHealCost()).toBe(100);
      p.buffs.apply(BuffType.Dazed, 5);             // +100（可移除族）
      expect(g.nurseHealCost()).toBe(200);
      p.inv.armor[3] = { id: _iid(854), stack: 1 }; // 折扣卡 floor(200*0.8)
      expect(g.nurseHealCost()).toBe(160);
    });
});

// ===========================================================================
describe('终零波 D：GRAB_RANGE 逐 vid 化（GetItemGrabRange 加成段全表）', () => {
  it('帧快照路径 grabRangeBonusFor(ctx,vid) ≡ 直读 getItemGrabRangeBonus(vid)（代表性 vid 全等）', () => {
    const p = new Player(0, 0, new Inventory());
    beginDropScanCtx(p);
    const ctx = getDropScanCtx(p)!;
    for (const vid of [1, 58, 71, 72, 74, 184, 1735, 1868, 4143, 3822, 3453, 3454, 3455]) {
      expect(grabRangeBonusFor(ctx, vid)).toBe(p.getItemGrabRangeBonus(vid));
    }
  });
  it('金戒指币族 +350 / 魔力磁石星族 +300 / 心药心族 +250（装备/buff 三旗翻起后仍全等）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(3033), stack: 1 };        // 金戒指 goldRing
    p.inv.armor[6] = { id: _iid(2219), stack: 1 };        // 天界磁石 manaMagnet
    p.buffs.apply(BuffType.Heartreach, 120);              // buff105
    beginDropScanCtx(p);
    const ctx = getDropScanCtx(p)!;
    for (const vid of [58, 71, 184, 4143, 3822]) {
      expect(grabRangeBonusFor(ctx, vid)).toBe(p.getItemGrabRangeBonus(vid));
    }
    expect(grabRangeBonusFor(ctx, 71)).toBe(350);
    expect(grabRangeBonusFor(ctx, 4143)).toBe(300);       // 恒真门不吃装备位
  });
  it('宝藏磁石全类 +150 与金戒指币族 +350 双源叠加（IsACoin=71..74 门内复合）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(3033), stack: 1 };   // 金戒指币族旗
    p.inv.armor[4] = { id: _iid(5010), stack: 1 };   // 宝藏磁石全类旗（双源叠加）
    beginDropScanCtx(p);
    const ctx = getDropScanCtx(p)!;
    expect(grabRangeBonusFor(ctx, 74)).toBe(150 + 350);   // 铂金币在 IsACoin 集
    expect(grabRangeBonusFor(ctx, 76)).toBe(150);         // 币族门外仅磁石立柱
    expect(grabRangeBonusFor(ctx, 3822)).toBe(150 + 50);
  });
});

// ===========================================================================
describe('终零波 E：pendingItemReuse / UsingOrReusingItem 读面（P.cs:4052/:43148）', () => {
  function mkHost(): Game & {
    player: Player; swing: unknown; pendingProbe: () => boolean;
    usingOrReusingItem: () => boolean;
  } {
    const g = Object.create(Game.prototype) as never as ReturnType<typeof mkHost>;
    g.player = new Player(0, 0, new Inventory());
    return g;
  }
  it('swing/useTime 双空且无 reuse 旗 → false', () => {
    const g = mkHost();
    (g as unknown as { swing: unknown }).swing = null;
    g.player.useTime = 0;
    g.player.pendingItemReuse = false;
    expect(g.usingOrReusingItem()).toBe(false);
  });
  it('归零拍旗 pendingItemReuse=true → true（autoReuse 重施间隙短窗）', () => {
    const g = mkHost();
    (g as unknown as { swing: unknown }).swing = null;
    g.player.useTime = 0;
    g.player.pendingItemReuse = true;
    expect(g.usingOrReusingItem()).toBe(true);
  });
  it('itemAnimation/swing 在途或 itemTime>0 → true（含 reuseDelay 并窗语义）', () => {
    const g = mkHost();
    (g as unknown as { swing: unknown }).swing = { t: 3 };
    g.player.pendingItemReuse = false;
    expect(g.usingOrReusingItem()).toBe(true);
    (g as unknown as { swing: unknown }).swing = null;
    g.player.useTime = 4;
    expect(g.usingOrReusingItem()).toBe(true);
  });
});

// ===========================================================================
describe('终零波 F：建造饰品开关最小可行版（builderAccStatus[2]/[3]）', () => {
  it('options 缺省 = 启用（status==0 口径）；关断翻转持久化', async () => {
    const { options } = await import('../src/core/Options');
    expect(options.data.builderAutoActuatorDisabled).toBe(false);
    expect(options.data.builderAutoPaintDisabled).toBe(false);
    options.set('builderAutoActuatorDisabled', true);
    expect(options.data.builderAutoActuatorDisabled).toBe(true);
    expect(options.data.builderAutoPaintDisabled).toBe(false);
    options.set('builderAutoActuatorDisabled', false);
  });
  it('消费端在位（tryPlace gate 串读玩家 builderAccStatus 位面——★SW-FX19 迁移）', () => {
    const src = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    expect(src).toContain("equipStats.autoPaint && !this.builderAccOff(BACC.AutoPaint)");
    expect(src).toContain("equipStats.autoActuator && !this.builderAccOff(BACC.AutoActuate)");
  });
});

// ===========================================================================
describe('终零波 G：十周年世界门（Chest.SetupTravelShop :1301-1308）', () => {
  function runStock(tenthAnniversary: boolean, seed: number): number {
    const w = new World(60, 60, 30, 'tenth');
    if (tenthAnniversary) w.seedFlags.tenthAnniversary = true;
    const g = Object.create(Game.prototype) as unknown as
      & Record<string, unknown>
      & { buildTravelStock: () => Array<[number, number]> };
    g.world = w;
    g.player = { luck: 0 };
    const rand = lcg(seed);
    vi.spyOn(Math, 'random').mockImplementation(rand);
    return g.buildTravelStock().length;
  }
  it('同种子对拍：十周年门开 → 货架 +1/+2（!getGood 再 +1）', () => {
    const seeds = [20260901, 1458, 77];
    for (const seed of seeds) {
      const base = runStock(false, seed);
      expect(runStock(true, seed)).toBe(base + 2);
    }
  });
});

// ===========================================================================
describe('终零波 H：快速堆叠演示窗（HasLockedInventory 读取面）', () => {
  it('QUICK_STACK_LOCK_TICKS 常量在案且 hasLockedInventory 为纯读面', () => {
    expect(typeof Game.QUICK_STACK_LOCK_TICKS).toBe('number');
    expect(Game.QUICK_STACK_LOCK_TICKS).toBeGreaterThan(0);
    const g = Object.create(Game.prototype) as unknown as
      & { hasLockedInventory: () => boolean }
      & Record<string, unknown>;
    g.quickStackLockTicks = 5;
    expect(g.hasLockedInventory()).toBe(true);
    g.quickStackLockTicks = 0;
    expect(g.hasLockedInventory()).toBe(false);
  });
});
