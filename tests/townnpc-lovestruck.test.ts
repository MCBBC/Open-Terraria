// 清偿刀 B（2026-09-29）：TownNPC buff 承载（Lovestruck 119 面）+ 幸福价 loveStruck
// ×0.9 门前乘区接线回归。
// 反编译标杆 Terarria1457（1458 增量面对本域零变更——ShopHelper.cs 1456/1457/1458
// 逐字节全等已由刀 H diff 定谳）：
//   施加  Item 2352 LovePotion → 弹 370（Item.cs:23667-23678）→ Kill 80px 圈
//         Projectile.cs:78947-78956：玩家 ApplyBuffTo(119,1800t) + NPC 循环
//         AddBuff(119,1800t)（【全体】NPC 非仅城镇——enemies/critters/npcs 三桶,
//         ThrowKillFx.applyAura 已接;TownNPC 侧此前无承载字段=写空,X4-债10）
//   承载  NPC.buffType/buffTime 数组（城镇/敌怪同数组,NPC.AddBuff :91035）；
//         UpdateNPC :91483-91488 FlagsReset(:93273,:93295 loveStruck=false) →
//         BuffSetFlags(:93087,lowerBuffTime :93099-93102 → :93181 loveStruck=true)
//   视觉  UpdateNPC_BuffApplyVFX :92455-92466：Next(5)==0 → gore 331
//         （位=左上+(Next(width+1),Next(height+1));速=单位向 X×0.66×Next(3,6)×0.33
//         → NewGore 内扰动 → ×0.4 → vy−0.6;档=Next(40,121)×0.01;sticky=false）
//   消费  ShopHelper.ProcessMood :100-110：`_currentPriceAdjustment = 1f;`
//         → `if (npc.loveStruck) ×0.9`（:103-106）→ 提前 return 门（:107-110
//         remix/368/453/IsTownPet/IsNotReallyTownNPC=37）——乘区在门【之前】,
//         提前 return 亦跳过 LimitAndRoundMultiplier（:180-187 钳 [0.75,1.5] 圆 0.01）
// 变异证红两发（sha256 对拍还原）：①摘 computeHappiness `mul *= 0.9` → ①②段红；
// ②乘区移到提前 return 门之后 → 门序结构锁段红。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TownNPC } from '../src/entities/TownNPC';
import { GorePiece } from '../src/entities/GorePiece';
import { applyBuffTicks } from '../src/entities/projStatus';
import { computeHappiness, type BiomeZones } from '../src/data/vanillaHappiness';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { Game } from '../src/core/Game';
import type { GameHooks } from '../src/entities/types';

const ZONES: BiomeZones = {
  forest: false, ocean: false, snow: false, desert: false,
  jungle: false, underground: false, hallow: false, mushroom: false,
};
const baseHappy = {
  npcVanillaId: 17, homeless: false, distFromHome: 0,
  playerInCorrupt: false, playerInCrimson: false, playerInDungeon: false,
  zones: ZONES,
  npcsInHouse: 0, npcsInVillage: 4, nearby: [] as number[], isPrincess: false,
};

const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; vi.restoreAllMocks(); });

// ===========================================================================
// ① ProcessMood :103-106 门前 ×0.9（普通城镇 NPC 面合成）
// ===========================================================================
describe('刀B-① loveStruck ×0.9 门前乘区（ShopHelper.cs:103-106）', () => {
  it('恋爱中 Content 态 → priceMul 0.9（报告仍产 Content——普通 NPC 不提前 return）', () => {
    const r = computeHappiness({ ...baseHappy, loveStruck: true });
    expect(r.priceMul).toBe(0.9);
    expect(r.report.map((l) => l.key)).toEqual(['TownNPCMood_Merchant.Content']);
  });

  it('未恋爱同态（village 0 → LoveSpace 命中）→ 0.95;village 4 时无 LoveSpace = 1.0', () => {
    expect(computeHappiness({ ...baseHappy, npcsInVillage: 0 }).priceMul).toBe(0.95);
    expect(computeHappiness({ ...baseHappy }).priceMul).toBe(1);
  });

  it('复合：恋爱 ×0.9 × LoveSpace ×0.95 = 0.855 → LimitAndRound 0.86', () => {
    // vanilla 语句序：0.9 先行（:103-106），LoveSpace 后乘（:153-157），末尾钳+圆
    expect(computeHappiness({ ...baseHappy, loveStruck: true, npcsInVillage: 3 }).priceMul).toBe(0.86);
    expect(0.9 * 0.95).toBeCloseTo(0.855, 12);
  });

  it('覆盖序：恋爱+无家 → 0.9 先行后置 1000 → 钳顶 1.5（百倍赋值覆盖乘区,原版同相）', () => {
    expect(computeHappiness({ ...baseHappy, loveStruck: true, homeless: true })
      .priceMul).toBe(1.5);
  });
});

// ===========================================================================
// ② 门序结构锁（:103-106 先于 :107-110 提前 return——368/453/37/宠物/remix 也 ×0.9）
// ===========================================================================
describe('刀B-② 乘区在提前 return 门之前（原版结构 :103→:107 语句序）', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['旅行商 368', { npcVanillaId: 368 }],
    ['骷髅商 453', { npcVanillaId: 453 }],
    ['老人 37（IsNotReallyTownNPC）', { npcVanillaId: 37 }],
    ['城镇宠物 637（IsTownPet）', { npcVanillaId: 637 }],
    ['城镇史莱姆 670（IsTownPet⊂）', { npcVanillaId: 670 }],
    ['remix 世界', { remixWorld: true }],
  ];
  for (const [label, over] of cases) {
    it(`${label}：恋爱 → 0.9 且报告空（提前 return 不产 Content 行）`, () => {
      const r = computeHappiness({ ...baseHappy, loveStruck: true, ...over } as typeof baseHappy);
      expect(r.priceMul).toBe(0.9);
      expect(r.report).toEqual([]);
    });
    it(`${label}：未恋爱 → 1.0 且报告空（刀前基线保持）`, () => {
      const r = computeHappiness({ ...baseHappy, ...over } as typeof baseHappy);
      expect(r.priceMul).toBe(1);
      expect(r.report).toEqual([]);
    });
  }
});

// ===========================================================================
// ③ TownNPC 载体：applyBuffTicks 119 写入（applyAura 圈支既有面）+ max 合并
// ===========================================================================
describe('刀B-③ TownNPC.lovestruckT 载体（projStatus SUPPORTED[119] 映射落位）', () => {
  it('applyBuffTicks(npc,119,1800t) → lovestruckT = 30s（1800/60）;guide(22) 不在 119 免疫表', () => {
    const npc = new TownNPC('guide', 100 * 16, 98 * 16);
    applyBuffTicks(npc as unknown as Record<string, number>, 119, 1800);
    expect(npc.lovestruckT).toBe(30);
  });

  it('AddBuff max 合并：短续期不覆盖、长续期取长（NPC.AddBuff :91044-91050）', () => {
    const npc = new TownNPC('guide', 100 * 16, 98 * 16);
    applyBuffTicks(npc as unknown as Record<string, number>, 119, 1800);
    applyBuffTicks(npc as unknown as Record<string, number>, 119, 600);
    expect(npc.lovestruckT).toBe(30);   // 短不覆盖
    applyBuffTicks(npc as unknown as Record<string, number>, 119, 3600);
    expect(npc.lovestruckT).toBe(60);   // 长取长
  });
});

// ===========================================================================
// ④ 每 tick 递减 + 头爱心 gore 331（NPC.cs:92455-92466）
// ===========================================================================
describe('刀B-④ fixedUpdate 递减 + UpdateNPC_BuffApplyVFX 爱心发射', () => {
  function flatWorld(): World {
    const world = new World(200, 200, 100, 'lovestruck-test');
    for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, TILE_BY_KEY['dirt']!);
    world.clock.timeOfDay = 0.5;
    return world;
  }
  function makeGame(world: World): GameHooks {
    return {
      world,
      player: { x: -9999, y: -9999, w: 0, h: 0, dead: true, sitting: false },
      enemies: () => [], npcs: () => [], critters: () => [],
      spawnTownShot: () => {}, spawnParticles: () => {}, spawnBurst: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, addDamageNumber: () => {},
      achievements: { notifyProgressionEvent: () => {} },
    } as unknown as GameHooks;
  }

  it('递减：lovestruckT 30s → 每 tick −1/60（:93099-93102 lowerBuffTime 秒制等价）', () => {
    const npc = new TownNPC('guide', 100 * 16, 98 * 16);
    npc.lovestruckT = 30;
    npc.fixedUpdate(1 / 60, makeGame(flatWorld()));
    expect(npc.lovestruckT).toBeCloseTo(30 - 1 / 60, 12);
  });

  it('过期归零：余量 1t → 一 tick 后 ≤0（:93091 守卫 buffTime≤0 跳过）', () => {
    const npc = new TownNPC('guide', 100 * 16, 98 * 16);
    npc.lovestruckT = 1 / 60;
    npc.fixedUpdate(1 / 60, makeGame(flatWorld()));
    expect(npc.lovestruckT).toBeLessThanOrEqual(0);
  });

  it('在位发射：Math.random=0 全中 → gore 331、位/速/档下沿 + 调用侧 ×0.4/vy−0.6/sticky=false', () => {
    Math.random = () => 0;   // 全掷取下沿：1/5 门中、位 Next(w+1)=0、速 Next(3,6)=3、档 Next(40,121)=40
    const captured: Array<{ type: number; x: number; y: number; vx0: number; vy0: number; scale: number | undefined; ret: GorePiece }> = [];
    vi.spyOn(GorePiece, 'newGore').mockImplementation(((type, x, y, vx, vy, scale) => {
      const ret = { sticky: true, vx: 1, vy: 2 } as unknown as GorePiece;   // NewGore 后基速桩
      captured.push({ type, x, y, vx0: vx, vy0: vy, scale, ret });
      return ret;
    }) as typeof GorePiece.newGore);
    const npc = new TownNPC('guide', 100 * 16, 98 * 16);
    npc.lovestruckT = 30;
    const x0 = npc.x, y0 = npc.y;   // 发射位读在 fixedUpdate 头部（物理步移位前）
    npc.fixedUpdate(1 / 60, makeGame(flatWorld()));
    expect(captured.length).toBe(1);
    const c = captured[0];
    expect(c.type).toBe(331);
    expect(c.x).toBe(x0);                               // Next(width+1) 下沿 0
    expect(c.y).toBe(y0);
    expect(c.scale).toBe(0.4);                          // Next(40,121)×0.01 下沿
    // 速度 = 单位向（X×0.66）×Next(3,6)×0.33；Math.random=0 → 向 (-10,-10)、spd=0.99
    const ul = Math.hypot(-10, -10);
    expect(c.vx0).toBeCloseTo((-10 / ul) * 0.66 * 0.99, 12);
    expect(c.vy0).toBeCloseTo((-10 / ul) * 0.99, 12);
    // 调用侧三连（:92464-92466）：sticky=false → velocity×0.4 → vy−0.6（施于桩基速）
    expect(c.ret.sticky).toBe(false);
    expect(c.ret.vx).toBeCloseTo(0.4, 12);              // 1×0.4
    expect(c.ret.vy).toBeCloseTo(0.2, 12);              // 2×0.4−0.6
  });

  it('过期不发射：lovestruckT ≤0 → 零 gore（:92455 loveStruck 位门）', () => {
    Math.random = () => 0;
    const spy = vi.spyOn(GorePiece, 'newGore');
    const npc = new TownNPC('guide', 100 * 16, 98 * 16);
    npc.fixedUpdate(1 / 60, makeGame(flatWorld()));
    expect(spy.mock.calls.filter(([id]) => id === 331).length).toBe(0);
  });
});

// ===========================================================================
// ⑤ Game.computeShopHappiness 快照接线（dialogHappiness.priceMul 消费链口）
// ===========================================================================
describe('刀B-⑤ computeShopHappiness 快照（Game.ts :36529 openNpcDialog 缓存链）', () => {
  /** Game 原型桩（happiness-price-adjustment 同式）——computeShopHappiness 只读
   *  entities.npcs/world.seedFlags/scene 三面 */
  function gameStub(state: Record<string, unknown>): Game {
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    Object.assign(g, state);
    return g as unknown as Game;
  }
  function npcAtHome(): TownNPC {
    const npc = new TownNPC('guide', 100 * 16, 98 * 16);
    npc.home = { x: Math.floor(npc.cx / 16), y: Math.floor(npc.cy / 16) };
    return npc;
  }

  it('恋爱 NPC → 0.9×LoveSpace 0.95 = 0.855 → 钳圆 0.86 落 dialogHappiness.priceMul', () => {
    const npc = npcAtHome();
    npc.lovestruckT = 30;
    const g = gameStub({ world: { seedFlags: {} }, scene: null, entities: { npcs: [] } });
    const r = (Game.prototype as unknown as { computeShopHappiness: (n: TownNPC) => { priceMul: number } })
      .computeShopHappiness.call(g, npc);
    expect(r.priceMul).toBe(0.86);
  });

  it('未恋爱同位 → 0.95（接线前基线;差 = loveStruck 快照读位生效）', () => {
    const npc = npcAtHome();
    const g = gameStub({ world: { seedFlags: {} }, scene: null, entities: { npcs: [] } });
    const r = (Game.prototype as unknown as { computeShopHappiness: (n: TownNPC) => { priceMul: number } })
      .computeShopHappiness.call(g, npc);
    expect(r.priceMul).toBe(0.95);
  });
});
