// dontHurtCritters 饰品实装回归（★E，2026-08-31 清零批二波；★F2/F3/F4 二轮蓝队翻新）：
//   4767 Guide to Critter Companionship / 5323 双件（RefreshMechanicalAccsFromItemType
//   1457 Player.cs:12922-12924 → equipStats.dontHurtCritters——装备位/背包 58 格/
//   虚空袋 bank4 三面传播见 Player.ts mech 聚合器与 vanillaOpenBags WorksInVoidBag 门）
//   统一谓词出口 = projTargets.playerProjectileCanHitNpcGate（CanNPCBeHitByPlayerOrPlayerProjectile
//   :20673-20689 玩家实体面；IsCritterThatIsHostileToPlayers 复权 :19849 +
//   CritterThatCanTurnOnPlayers NPCID.cs:4781 = {645,639,644,642,643,641,640,299,538,539}
//   ∧ 【运行时】aiStyle==3——F2 后由 Enemy.blackenedCritter 运行时位承载,
//   def.aiStyle 臂仅为数据面等价形保留;松鼠系 SetDefaults 恒 aiStyle=7,NPC.cs:12892-96）
//   消费端全挂：近战三重门（Game.canNpcBeHitByPlayerMelee）/坐骑通道（MountCombat
//   canMountHitTarget——矿车碾压/踩踏/横向冲撞三扫掠共门）/狱火光环 projectile=null 面
//   （Game 狱火块 F1）/弹幕 hitCritters ctx 面（F4:minion/sentry 恒拒+trap 复位）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  playerProjectileCanHitNpcGate, countsAsCritterOf, isCritterThatIsHostileToPlayers,
  CRITTER_TURN_ON_PLAYERS_TYPES, hitCritters,
} from '../src/entities/projTargets';
import { Enemy } from '../src/entities/Enemy';
import { Player } from '../src/entities/Player';
import { minecartNpcRampage } from '../src/entities/MountCombat';
import { Inventory } from '../src/items/Inventory';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } from '../src/data/items';

const world = new World(64, 64, 21, 'e');

function gameWith(playerEq?: { dontHurtCritters?: boolean }) {
  return {
    world,
    player: { equipStats: playerEq ?? {} },
    enemies: () => [],
    critters: () => [],
  };
}

describe('playerProjectileCanHitNpcGate（统一出口真值表）', () => {
  const critter = { vanillaId: 46, def: { friendly: false, critter: true } };   // 兔（CountsAsCritter 成员=def.critter 提取旗）

  it('无饰品：critter 照常可命中（改动前行为不变）', () => {
    expect(playerProjectileCanHitNpcGate(gameWith(), critter)).toBe(true);
    expect(playerProjectileCanHitNpcGate(gameWith({ dontHurtCritters: false }), critter)).toBe(true);
  });

  it('4767/5323 面：CountsAsCritter ∧ flag=true → 拒收', () => {
    expect(playerProjectileCanHitNpcGate(gameWith({ dontHurtCritters: true }), critter)).toBe(false);
  });

  it('非 critter 不受饰品影响（僵尸/克眼球照打不误）', () => {
    expect(playerProjectileCanHitNpcGate(gameWith({ dontHurtCritters: true }),
      { vanillaId: 3, def: {} })).toBe(true);
  });

  it('敌对小动物复权（数据面臂：CritterThatCanTurnOnPlayers ∧ def.aiStyle==3）', () => {
    for (const vid of CRITTER_TURN_ON_PLAYERS_TYPES) {
      // 数据面等价形（def.aiStyle==3 的形态——原版实例 aiStyle 读取的第二真值源）
      const dataArmWalker = { vanillaId: vid, def: { aiStyle: 3 } };
      expect(isCritterThatIsHostileToPlayers(dataArmWalker)).toBe(true);
      expect(playerProjectileCanHitNpcGate(gameWith({ dontHurtCritters: true }), dataArmWalker)).toBe(true);
      // 未黑化（松鼠系出生态,SetDefaults aiStyle=7 恒定,NPC.cs:12892-96）
      expect(isCritterThatIsHostileToPlayers({ vanillaId: vid, def: { aiStyle: 7 } })).toBe(false);
    }
  });

  it('★F2 运行时位：真实松鼠经升级链翻身后复权（黑化 → dontHurtCritters 不再保护）', () => {
    const w = new World(80, 80, 42, 'blackened-runtime');
    w.groundLevel = 42;
    for (let x = 10; x <= 70; x++) w.store.setTileSilent(x, 60, 2);
    const sq = Enemy.fromVanilla(299, 40 * 16, 59 * 16)!;
    const game = {
      world: w, player: null,
      playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
      spawnDrop: () => null, damagePlayer: (): number => 0,
      entities: { add: () => {} }, enemies: () => [] as unknown[],
      critters: () => [sq] as unknown[],          // 真实桶成员（spawnNpcByVanilla 同构）
      achievements: { handleSpecialEvent: () => {} },
    } as never;
    // 出生未黑化：静态提档 aiStyle=7（NPC.cs:12892-96；def.aiStyle 无值=静态判据
    // 恒假的直接证据）+ 谓词 false
    expect(sq.vanilla?.aiStyle).toBe(7);
    expect((sq.def as { aiStyle?: number } | undefined)?.aiStyle ?? undefined).toBeUndefined();
    expect(isCritterThatIsHostileToPlayers(sq)).toBe(false);
    expect((sq as unknown as { blackenedCritter?: boolean }).blackenedCritter ?? false).toBe(false);

    const seedMath = Math.random;
    Math.random = () => 0;   // 厄运掷恒命中（RollOnlyBadLuckExtreme 内部同源）
    try {
      const pNear = { x: 41 * 16, y: 58 * 16, w: 20, h: 42, cx: 41 * 16, cy: 58 * 16 + 21,
        dead: false, luck: -0.5 };   // 负运才进 RollOnlyBadLuckExtreme 触发窗
      (game as unknown as { player: unknown }).player = pNear;
      sq.fixedUpdate(1 / 60, game);   // 真实 AI 变异：ai3=2 → 黑化位写入
    } finally { Math.random = seedMath; }
    expect((sq as unknown as { blackenedCritter?: boolean }).blackenedCritter).toBe(true);
    expect(isCritterThatIsHostileToPlayers(sq)).toBe(true);
    // 复权后戴书照样可命中/可杀（CanNPCBeHitByPlayerOrPlayerProjectile :20680-20683）
    expect(playerProjectileCanHitNpcGate(gameWith({ dontHurtCritters: true }), sq, true)).toBe(true);
    // 对照：普通 critter（未黑化桶成员）在戴书时仍被拒收
    const bunny = Enemy.fromVanilla(46, 30 * 16, 59 * 16)!;
    expect(playerProjectileCanHitNpcGate(gameWith({ dontHurtCritters: true }), bunny, true)).toBe(false);
  });

  it('countsAsCritterOf 双成员源：def.critter 提取旗 ∪ critters 桶标记', () => {
    expect(countsAsCritterOf({ def: { critter: true } }, false)).toBe(true);
    expect(countsAsCritterOf({ def: {} }, true)).toBe(true);         // spawnNpcByVanilla 落桶位
    expect(countsAsCritterOf({ def: {} }, false)).toBe(false);
  });
});

describe('坐骑通道挂接（minecartNpcRampage 经 canMountHitTarget 共门）', () => {
  function mkBunny(dontHurt: boolean | undefined) {
    void dontHurt;
    return {
      x: 232, y: 320, w: 16, h: 16,
      dead: false, iframes: 0,
      vanillaId: 46,
      def: { friendly: false, critter: true },   // CountsAsCritter 成员（def.critter 提取旗）
      hits: [] as unknown[],
      hurt(dmg: number, kbx: number) { void dmg; void kbx; this.dead = true; this.hits.push(1); return true; },
    };
  }
  const mkGame = (bunny: object, eq?: { dontHurtCritters?: boolean }) => ({
    world,
    player: { dead: false, luck: 0, maxHp: 400, maxMana: 200, cx: 0, cy: 0,
      critChance: () => 0, tryConsumingTimerCrit: () => false, equipStats: eq ?? {} },
    enemies: () => [bunny],
    critters: () => [],
    achievements: { handleSpecialEvent: () => {} },
  });

  it('饰品在身（4767/5323 面）：矿车碾过 critter 桶成员零命中', () => {
    const bunny = mkBunny(true);
    const cart = { x: 200, y: 300, w: 20, h: 52, vx: 12, vy: 0, mountId: 6, superCart: false, runSpeed: 13 };
    expect(minecartNpcRampage(cart as never, mkGame(bunny, { dontHurtCritters: true }) as never)).toBe(0);
    expect((bunny as { hits: unknown[] }).hits.length).toBe(0);
  });

  it('无饰品：碾杀路径保持原样（正例行为不回退）', () => {
    const bunny = mkBunny(undefined);
    bunny.def = { friendly: false, critter: true } as never;   // def.critter 源单测
    const cart = { x: 200, y: 300, w: 20, h: 52, vx: 12, vy: 0, mountId: 6, superCart: false, runSpeed: 13 };
    expect(minecartNpcRampage(cart as never, mkGame(bunny) as never)).toBe(1);
    expect((bunny as { hits: unknown[] }).hits.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ★F4 弹幕域伤害时刻：book(戴/不戴) × 弹型(直射/minion/sentry/trap) 四象限矩阵
//    ——统一出口 hitCritters 的 projectile 语境参（CanNPCBeHitByPlayerOrPlayerProjectile
//    :20675 flag = dontHurtCritters ∪ (minion∪MinionShot∪sentry∪SentryShot)、:20676 trap 复位）
// ---------------------------------------------------------------------------
describe('hitCritters ctx 四象限（F4）', () => {
  function critterWorld(gameEq?: { dontHurtCritters?: boolean }) {
    const hits: unknown[] = [];
    const c = {
      x: 100, y: 100, w: 16, h: 12, dead: false,
      hurt(g: object) { void g; this.dead = true; hits.push(1); return true; },
    };
    const g = {
      world: new World(64, 64, 21, 'ctx-matrix'),
      player: { equipStats: gameEq ?? {} },
      enemies: () => [] as unknown[],
      critters: () => [c] as unknown[],
    };
    return { c, g, hits };
  }
  const box = (x = 96) => ({ x, y: 92, w: 24, h: 24 });

  it('直射玩家弹不带召唤语境：无书→命中 / 戴书→拒收', () => {
    const a = critterWorld();
    expect(hitCritters(box(), a.g as never)).toBe(true);
    expect(a.hits.length).toBe(1);
    const b = critterWorld({ dontHurtCritters: true });
    expect(hitCritters(box(), b.g as never)).toBe(false);
    expect(b.hits.length).toBe(0);
  });

  it('minion/sentry 语境恒拒（饰品无关）', () => {
    for (const eq of [undefined, { dontHurtCritters: true }]) {
      const m = critterWorld(eq);
      expect(hitCritters(box(), m.g as never, { minion: true })).toBe(false);
      expect(m.hits.length).toBe(0);
      const s = critterWorld(eq);
      expect(hitCritters(box(), s.g as never, { sentry: true })).toBe(false);
      expect(s.hits.length).toBe(0);
    }
  });

  it('trap 复位：镖陷阱族照杀小动物（含戴书）', () => {
    const a = critterWorld({ dontHurtCritters: true });
    expect(hitCritters(box(), a.g as never, { trap: true })).toBe(true);
    expect(a.hits.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ★F3 虚空袋（bank4）信息/机械饰品传播——UpdateEquips Player.cs:13026-13040：
//   背包持 4131 VoidLens → bank4 逐槽重放 RefreshInfoAccs+RefreshMechanicalAccs，
//   WorksInVoidBag=Factory.CreateBoolSet(true,4346,5095)（ItemID.cs:82）默认全真
//   二例外。装备位面 = GrantArmorBenefits :13204-13206 对 armor[0-9] 每槽重放。
// ---------------------------------------------------------------------------
describe('虚空袋传播 + 例外不透传（F3）', () => {
  it('书在袋内+背包持 4131：dontHurtCritters 生效；无 4131：袋内物品全失效', () => {
    const idOf = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
    expect(idOf(4767)).toBeDefined();
    const p = new Player(0, 0, new Inventory());
    p.banks[3][0] = { id: idOf(4767), stack: 1 };
    // 无透镜：袋内饰品不生效（原版无 flag 门整段跳过）
    expect(p.equipStats.dontHurtCritters).toBe(false);
    // 持透镜：传播开启
    p.inv.slots[0] = { id: idOf(4131), stack: 1 };
    expect(p.equipStats.dontHurtCritters).toBe(true);
  });

  it('机械族同源传播（3619→mechShowWires）+ WorksInVoidBag=false 两例外不透传', () => {
    const idOf = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
    const p = new Player(0, 0, new Inventory());
    p.banks[3][0] = { id: idOf(3619), stack: 1 };   // 机械透镜：WorksInVoidBag 默认真
    p.banks[3][1] = { id: idOf(4346), stack: 1 };   // 防拾取石：例外=false → 不重放
    p.banks[3][2] = { id: idOf(5095), stack: 1 };   // Lucy 斧：例外=false → 不重放
    p.inv.slots[0] = { id: idOf(4131), stack: 1 };  // 虚空透镜开传播门
    const es = p.equipStats;
    expect(es.mechShowWires).toBe(true);            // 真位照常出袋生效
    expect(es.preventAllItemPickups).toBe(false);   // 4346 被表拦下
    expect(es.hasLucyTheAxe).toBe(false);           // 5095 被表拦下
    // 对照：同一对例外进【主背包】即恢复 FromItemType 语义（原版 j<58 无条件重放）
    p.banks[3][1] = null; p.banks[3][2] = null;
    p.inv.slots[1] = { id: idOf(4346), stack: 1 };
    p.inv.slots[2] = { id: idOf(5095), stack: 1 };
    expect(p.equipStats.preventAllItemPickups).toBe(true);
    expect(p.equipStats.hasLucyTheAxe).toBe(true);
  });

  it('装备位面：4767 戴在配饰槽即生效（GrantArmorBenefits :13204 同链）', () => {
    const idOf = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: idOf(4767), stack: 1 };   // 第一个配饰功能槽
    expect(p.equipStats.dontHurtCritters).toBe(true);
  });
});
