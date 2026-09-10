// SW-FX17 bank4 虚空袋四层银行语义（incomplete-work-audit「虚空袋 VoidBag bank4
// 路径 — Game:5505」收口复核矩阵：槽域/存读档/打开距离门/吸入通道 + 判别力）。
//
// 反编译金标（Terarria1457；Terarria1458 同域文件 diff 实证同源——ItemVariants/
// CustomCurrencyManager/CustomCurrencySingleCoin/VoidLensHelper 逐字节同、
// useVoidBag 1458 Player.cs:23354-23363 同文、BuyItem customCurrency 支 :35683 同文）：
//   ① 槽域  bank4 = Chest.CreateBank(-5) 40 槽（Player.cs:1571）→ chest==-5 面板域
//      （Main.TryInteractingWithVoidLens Main.cs:38355-38376 chest=-5 + voidLensChest
//      .Set(proj)；tile 491 支 Player.cs:33339 num74=4）。VoidBag 4131 / ClosedVoidBag
//      5325 共用 SetDefaults（Item.cs:35876-35890 shoot 734）→ 弹 734 containerIndex=-5
//      （Projectile.cs:80567-80571）/ IsInteractable（:80573-80590）。
//   ② 存读档 bank4 逐槽 type/stack/prefix/【favorited】（Player.cs:55510-55522——四行
//      中唯一存 favorited 的 bank；canFavoriteAt=ChestUI CreateBoolSet(0,1,2,32)，
//      32=虚空袋面板专属收藏位）+ voidVaultInfo 字节（:55523 写/:56157 读——
//      IsVoidVaultEnabled 运行时每帧重算 Player.cs:24744-24747，持久位无消费域）。
//   ③ 打开距离门 IsProjectileInteractableAndInInteractionRange（Player.cs:23336-23352 =
//      Hitbox.ClosestPointInRect(player.Center).ToTileCoordinates() + Simple 射程）；
//      T2 跟随关门 HandleBeingInChestRange :31271-31290（透镜出射程/消亡 → chest=-1）。
//   ④ 吸入 GetItem_VoidVault（Player.cs:39710-39731，汇流门 :39703 CanGoIntoVoidVault）
//      = 满背包溢流通道：CanVoidVaultAccept :39733-39745（questItem ∪ 3822 拒）+
//      IsVoidVaultEnabled = HasItem(4131)（:24746，只扫 inventory 58 :56551-56561）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Player, canVoidVaultAccept, QUEST_ITEM_VIDS } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import { vanillaIdOfItem } from '../src/stats/Shimmer';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { VoidLensProj } from '../src/entities/VoidLensProj';
import { CAN_FAVORITE_AT, RETAIN_FAVORITE_ON_MOVE_AT, blockedFromTransferIntoChest, slotContext } from '../src/ui/SlotActions';
import { Game } from '../src/core/Game';

const iidOf = (vid: number): number => {
  const id = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
  if (!ITEM_DEFS[id]) throw new Error(`测试前提失效：vid ${vid} 未注册`);
  return id;
};
const VOID_BAG = iidOf(4131);
const VOID_VAULT_ITEM = iidOf(4076);
const WOOD = iidOf(9);
const M_WOOD = ITEM_DEFS[WOOD].maxStack ?? 999;
const DD2_MANA = iidOf(3822);            // 埃特尼亚魔力（CanVoidVaultAccept 拒收面）
const BATFISH = iidOf(2450);             // 任务鱼（questItem 拒收面）

type Slot = { id: number; stack: number; prefix?: number; favorited?: boolean } | null;

function vaultPlayer(): Player {
  const p = new Player(50 * 16, 90 * 16, new Inventory());
  p.banks[3] = Array(40).fill(null) as typeof p.banks[3];
  return p;
}

// ---------------------------------------------------------------------------
// ① 槽域（bank4 = 40 槽 bank 域 + useVoidBag 门 + CanVoidVaultAccept 谓词）
// ---------------------------------------------------------------------------
describe('SW-FX17 ① bank4 槽域（Chest.CreateBank(-5) :40 槽 + useVoidBag :56551）', () => {
  it('banks[3] 默认 40 槽全空（bank:true maxItems=40, Chest.cs:185）', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.banks.length).toBe(4);
    expect(p.banks[3].length).toBe(40);
    expect(p.banks[3].every((s) => s === null)).toBe(true);
  });

  it('useVoidBag 只扫主背包 58 槽（Player.cs:22892-22901 for i<58）——末槽在域内', () => {
    const p = vaultPlayer();
    expect(p.useVoidBag()).toBe(false);
    p.inv.slots[57] = { id: VOID_BAG, stack: 1 };        // 弹药区末格（原版域内 58 上界）
    expect(p.useVoidBag()).toBe(true);
  });

  it('4131 在装备/时装/杂项域不启用（原版只扫 inventory——armor 不在 58 槽）', () => {
    const p = vaultPlayer();
    p.inv.armor[0] = { id: VOID_BAG, stack: 1 };
    expect(p.useVoidBag()).toBe(false);
    p.inv.armor[0] = null;
    p.inv.miscEquips[0] = { id: VOID_BAG, stack: 1 };
    expect(p.useVoidBag()).toBe(false);
  });

  it('CanVoidVaultAccept：questItem ∪ 3822 拒、其余全收（:39733-39745）', () => {
    expect(canVoidVaultAccept(3822)).toBe(false);        // DD2EnergyCrystal
    expect(canVoidVaultAccept(2450)).toBe(false);        // DefaultToQuestFish 族
    expect(QUEST_ITEM_VIDS.has(2450)).toBe(true);
    expect(canVoidVaultAccept(4131)).toBe(true);         // 虚空袋自身可入袋（嵌套）
    expect(canVoidVaultAccept(3817)).toBe(true);         // 勋章可入袋（BuyItem 五仓前提）
    expect(canVoidVaultAccept(4076)).toBe(true);         // 虚空保险库本体
  });

  it('虚空袋对 4131/5325 数据面同体（Item.cs:35876-35890 同 case：shoot 734 / rare 3）', () => {
    expect(vanillaIdOfItem(VOID_BAG)).toBe(4131);
    expect(vanillaIdOfItem(VOID_VAULT_ITEM)).toBe(4076); // 4076 = 放置型 VoidVault（tile 491）
  });
});

// ---------------------------------------------------------------------------
// ② 吸入通道（GetItem_VoidVault :39710-39731 满背包溢流）
// ---------------------------------------------------------------------------
describe('SW-FX17 ② 吸入通道（GetItem_VoidVault 溢流语义 1:1）', () => {
  it('满背包余量入袋：同 vid+prefix 并堆优先 → 溢量落首空格（:39749-39857）', () => {
    const p = vaultPlayer();
    p.inv.slots[0] = { id: VOID_BAG, stack: 1 };
    p.banks[3][0] = { id: WOOD, stack: 100 };
    const left = p.depositIntoVoidVault(WOOD, M_WOOD + 1);   // 并堆补满 9899 + 溢 1
    expect(left).toBe(0);
    expect(p.banks[3][0]!.stack).toBe(M_WOOD);               // 并堆优先：补满至 maxStack
    expect(p.banks[3][1]).toEqual({ id: WOOD, stack: M_WOOD + 1 - (M_WOOD - 100) });   // 溢量 101 落首空格
    expect(p.banks[3].slice(2).every((s) => s === null)).toBe(true);
  });

  it('异词缀不并堆（Item.CanStack = type+prefix 全等 Item.cs:49870-49876）', () => {
    const p = vaultPlayer();
    p.inv.slots[0] = { id: VOID_BAG, stack: 1 };
    p.banks[3][0] = { id: WOOD, stack: 100, prefix: 4 };
    const left = p.depositIntoVoidVault(WOOD, 50, 9);
    expect(left).toBe(0);
    expect(p.banks[3][0]!.stack).toBe(100);              // 原格不动
    expect(p.banks[3][1]).toEqual({ id: WOOD, stack: 50, prefix: 9 });   // 独落空格带词缀
  });

  it('拒收面原样返回（questItem ∪ 3822）——余量退回世界不落袋', () => {
    const p = vaultPlayer();
    p.inv.slots[0] = { id: VOID_BAG, stack: 1 };
    expect(p.depositIntoVoidVault(DD2_MANA, 5)).toBe(5);
    expect(p.depositIntoVoidVault(BATFISH, 3)).toBe(3);
    expect(p.banks[3].every((s) => s === null)).toBe(true);
  });

  it('未持虚空袋（useVoidBag=false）整通道关闭（IsVoidVaultEnabled 门 :39703/:39511）', () => {
    const p = vaultPlayer();
    expect(p.depositIntoVoidVault(WOOD, 50)).toBe(50);
    expect(p.banks[3].every((s) => s === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ③ 存读档（bank4 逐槽 type/stack/prefix/favorited :55510-55522 + 面板收藏语义）
// ---------------------------------------------------------------------------
describe('SW-FX17 ③ 存读档（bank4 favorited 位 + round-trip）', () => {
  it('saveGame → loadSave：banks[3] 全字段保真（favorited/prefix 随实例）', () => {
    const w = new World(60, 40, 42, 'sw-fx17-vault');
    const p = new Player(100, 100, new Inventory());
    p.banks[3][0] = { id: WOOD, stack: 99 };
    p.banks[3][7] = { id: VOID_BAG, stack: 1, favorited: true };   // 袋嵌袋（可入袋）
    p.banks[3][38] = { id: WOOD, stack: 5, prefix: 4 };
    const json = saveGame(w, p, 0);
    const { player } = loadSave(json);
    expect(player.banks?.[3][0]).toEqual({ id: WOOD, stack: 99 });
    expect(player.banks?.[3][7]).toEqual({ id: VOID_BAG, stack: 1, favorited: true });
    expect(player.banks?.[3][38]).toEqual({ id: WOOD, stack: 5, prefix: 4 });
  });

  it('收藏域：canFavoriteAt = {0,1,2,32}（ChestUI CreateBoolSet）——32=虚空袋面板专属收藏位', () => {
    expect(CAN_FAVORITE_AT).toEqual([0, 1, 2, 32]);      // bank 世界箱(3)/银行族(4) 不可收藏
    expect(RETAIN_FAVORITE_ON_MOVE_AT).toContain(32);    // 移动保留收藏（:365）
  });

  it('-5 面板槽位语境 = 32 VoidItem（ChestUI.cs:330-355；非世界箱 3 / 银行族 4）', () => {
    expect(slotContext('chest', 0, true, -5)).toBe(32);
    expect(slotContext('chest', 0, true, -2)).toBe(4);
    expect(slotContext('chest', 0, true, 120)).toBe(3);
  });

  it('自转入门：收藏虚空袋对 4131/5325 拒转入 -5 面板（IsBlockedFromTransferIntoChest）', () => {
    expect(blockedFromTransferIntoChest(-5, 4131)).toBe(true);
    expect(blockedFromTransferIntoChest(-5, 5325)).toBe(true);
    expect(blockedFromTransferIntoChest(-5, 87)).toBe(false);    // 存钱罐不受 -5 门
    expect(blockedFromTransferIntoChest(-2, 3213)).toBe(true);   // 收藏钱槽→猪猪同族对照
  });
});

// ---------------------------------------------------------------------------
// ④ 打开距离门（透镜弹 AI + 交互射程 + T2 跟随关门）
// ---------------------------------------------------------------------------
describe('SW-FX17 ④ 打开距离门（AI_154 + IsProjectileInteractableAndInInteractionRange）', () => {
  const world = new World(96, 96, 21, 'sw-fx17-lens');
  function gameStub(): Record<string, unknown> {
    return {
      world,
      spawnParticles: () => {},
      addLightAt: () => {},
      playSfx: () => {},
      projectiles: () => [],
    } as unknown as Record<string, unknown>;
  }

  it('透镜弹数据面（Projectile.cs:7728-7736）：30×24 / timeLeft 10800 / 淡入 0.03→1', () => {
    const e = new VoidLensProj(500, 500, 4, -1);
    expect(e.w).toBe(30); expect(e.h).toBe(24);
    expect(e.timeLeft).toBe(10800);
    expect(e.opacity).toBe(0);
    for (let i = 0; i < 20; i++) e.fixedUpdate(1 / 60, gameStub() as never);
    expect(e.opacity).toBeCloseTo(0.6, 5);               // 20×0.03
  });

  it('AI_154 主面（:53088-53101）：velocity ×0.94 恒衰减 + 直线位移（tileCollide=false）', () => {
    const e = new VoidLensProj(500, 500, 4, -1);
    e.fixedUpdate(1 / 60, gameStub() as never);
    expect(e.vx).toBeCloseTo(4 * 0.94, 6);
    expect(e.vy).toBeCloseTo(-1 * 0.94, 6);
    expect(e.x).toBeCloseTo(500 - 15 + 4 * 0.94, 6);     // 盒心化 + 位移
  });

  it('同主同型去重（:53074-53087）：timeLeft 大者留,小者自杀；等值=先跑者留（原文同形）', () => {
    const older = new VoidLensProj(500, 500, 0, 0);
    older.fixedUpdate(1 / 60, gameStub() as never);      // older.timeLeft → 10799
    const newer = new VoidLensProj(600, 500, 0, 0);
    const projs: VoidLensProj[] = [];
    const g = gameStub(); g.projectiles = () => projs;
    projs.push(older, newer);
    newer.fixedUpdate(1 / 60, g as never);               // newer 扫场 → 杀 older
    expect(older.dead).toBe(true);
    expect(newer.dead).toBe(false);
    // 等值面（原文 `timeLeft < other.timeLeft` 假 → other.Kill() :53078-53086）：
    // 两枚同 fresh,先跑者杀对方、自己存活——后出生者只有先跑过一拍才赢
    const a = new VoidLensProj(500, 500, 0, 0);
    const b = new VoidLensProj(600, 500, 0, 0);
    const projs2 = [a, b];
    const g2 = gameStub(); g2.projectiles = () => projs2;
    a.fixedUpdate(1 / 60, g2 as never);
    expect(a.dead).toBe(false);
    expect(b.dead).toBe(true);
  });

  it('timeLeft 自灭（3 分钟静默退场）', () => {
    const e = new VoidLensProj(500, 500, 0, 0);
    (e as unknown as { timeLeft: number }).timeLeft = 1;
    e.fixedUpdate(1 / 60, gameStub() as never);
    expect(e.dead).toBe(true);
  });

  it('Game 生产接线钉死：petInRange = ClosestPointInRect + inTileRange（:23346-23350）', () => {
    // petInRange 几何单元驱动（Object.create 绕 DOM constructor；inTileRange 注入真值）
    const g = Object.create(Game.prototype) as unknown as {
      player: { cx: number; cy: number };
      inTileRange: (tx: number, ty: number) => boolean;
    };
    g.player = { cx: 500, cy: 640 };
    g.inTileRange = () => true;
    const petInRange = (Game.prototype as unknown as { petInRange(pet: { x: number; y: number; w: number; h: number }): boolean }).petInRange;
    expect(petInRange.call(g, { x: 480, y: 600, w: 30, h: 24 })).toBe(true);    // 盒含玩家中心
    // 玩家中心在盒右外侧 → 最近点 = 盒右缘（ClosestPointInRect 语义 :23347-23348）
    g.inTileRange = (tx: number) => tx === Math.floor(510 / 16);   // 仅右缘格可达
    expect(petInRange.call(g, { x: 480, y: 600, w: 30, h: 24 })).toBe(true);
    g.inTileRange = (tx: number) => tx === Math.floor(480 / 16);   // 仅左缘格可达 → 右缘出射程
    expect(petInRange.call(g, { x: 480, y: 600, w: 30, h: 24 })).toBe(false);
  });

  it('开/关链 + T2 跟随关门接线（Main.cs:38355-38376 + Player.cs:31271-31290 等价位）', () => {
    const src = srcText('../src/core/Game.ts');
    expect(src).toContain('| { kind: \'lens\'; pet: VoidLensProj }');      // 三型并轨（chester/pig/lens）
    expect(src).toMatch(/734 透镜 = Item130/);                             // 开关音锚
    expect(src).toMatch(/private throwVoidLens\(heldDef: ItemDef, vid: number\): void/);
    expect(src).toMatch(/e instanceof VoidLensProj && !e\.dead\s*\n\s*&& wx >= e\.x/);   // 命中体走盒交
    expect(src).toMatch(/this\.petInRange\(e\)/);                          // 射程门同源
    expect(src).toMatch(/private updateChesterContainerRange\(\): void \{[\s\S]*?this\.closeChestPanel\?\.\(\);/);   // T2 出射程关面板
  });

  it('吸入通道生产接线钉死（ItemDrop 溢流面）：useVoidBag 门 + depositIntoVoidVault', () => {
    const src = srcText('../src/entities/ItemDrop.ts');
    expect(src).toMatch(/if \(left > 0 && player\.useVoidBag\(\)\) \{/);
    expect(src).toContain('player.depositIntoVoidVault(this.itemId, left, this.prefix)');
  });
});

// ---------------------------------------------------------------------------
// ⑤ 判别力矩阵（内存变异——三路错形逐路证实可捕）
// ---------------------------------------------------------------------------
describe('SW-FX17 ⑤ 判别力矩阵（内存变异）', () => {
  it('变异1 useVoidBag 门整缺：无袋也吸入（旧缺陷族=通道常开）——金标拒绝面可捕', () => {
    const p = vaultPlayer();                             // 无 4131
    const mutantDeposit = (id: number, stack: number): number => {
      // 变异体：跳过 useVoidBag 门,直灌 banks[3]
      const left = p.depositIntoVoidVault(id, stack);    // 金标通道先试（拒收面前提同）
      if (left > 0) {                                    // 变异点：金标已回满额=0 进账
        p.banks[3][0] = { id, stack: left };
        return 0;
      }
      return left;
    };
    expect(mutantDeposit(WOOD, 50)).toBe(0);             // 变异体吸进袋
    expect(p.banks[3][0]).toEqual({ id: WOOD, stack: 50 });
    // 金标：p.depositIntoVoidVault 未持袋恒返 stack——上方变异体与金标分歧可见
    expect(p.depositIntoVoidVault(WOOD, 50)).toBe(50);   // 金标通道拒（此格已被变异体占 → 仍 50 全退）
  });

  it('变异2 CanVoidVaultAccept 漏 3822 臂：埃特尼亚魔力入袋可捕（:39739-39742 唯一 type 门）', () => {
    const mutantAccept = (vid: number): boolean => vid !== 0;   // 变异体：只拒空
    expect(mutantAccept(3822)).not.toBe(canVoidVaultAccept(3822));   // true vs false
  });

  it('变异3 useVoidBag 扫描域扩到装备域：armor 持袋误启用可捕（金标恒闭）', () => {
    const p = vaultPlayer();
    p.inv.armor[0] = { id: VOID_BAG, stack: 1 };
    const mutantUseVoidBag = (): boolean => true;               // 变异体：无域门
    expect(mutantUseVoidBag()).not.toBe(p.useVoidBag());        // true vs false
  });
});

function srcText(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}
