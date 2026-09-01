// 台账清偿回归：approx-registry-2026-08-31「vault questItem/3822 拒收 + 币种兑换
// DoCoins + LootAll 多通道 + Football MP 宽限」四件钉死（2026-08-31）。
// 原版真值 ../Terarria1458：
//   · CanVoidVaultAccept（Player.cs:39733-39745）：questItem ∪ type==3822 双门拒
//     （questItem 全集唯一置位点 Item.DefaultToQuestFish :27652-27658）。
//   · GetItem_FillEmptyInventorySlot_VoidBag 尾逐槽 DoCoins(i)（:39844-39847）——★原文
//     读主背包 this.inventory 而非形参 inv 数组：升档结算在主背包【同下标位】发生，
//     虚空袋自身不换币（接 Player.depositIntoVoidVault → Inventory.doCoinsAt）。
//   · LootAll 通道 vault 允许面：ChestUI.LootAll（ChestUI.cs:391-392）settings 按
//     player.chest>-1 二选一——真箱=LootAllFromChest(CanGoIntoVoidVault=true)、
//     bank 面板=LootAllFromBank(default=false)。
//   · 橄榄球 861 宽限 owner-only：Projectile.cs:23677-23691 回收条件
//     `(player2.whoAmI != player.whoAmI || !(localAI[0] < 30f))`——其他玩家一触即回收。
import { describe, it, expect } from 'vitest';
import { Player, canVoidVaultAccept, QUEST_ITEM_VIDS } from '../src/entities/Player';
import { Inventory, COIN_KEYS } from '../src/items/Inventory';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { FootballProj } from '../src/entities/BallProjs';
import { TileStore } from '../src/world/TileStore';
import { chestSettingsAllowsVault, lootAllFromContainer } from '../src/stats/QuickStacking';
import type { GameHooks } from '../src/entities/types';

const iidOf = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];

/** 带虚空袋玩家桩：slot0 放 4131 虚空透镜（IsVoidVaultEnabled=HasItem(4131),
 *  Player.cs:24744 只扫主背包——bank 内透镜不计,与原式一致）。 */
function vaultPlayer(): Player {
  const p = new Player(50 * 16, 90 * 16, new Inventory());
  p.inv.slots[0] = { id: iidOf(4131), stack: 1 };
  p.banks[3] = new Array(40).fill(null);
  return p;
}

describe('① vault 拒收：CanVoidVaultAccept 双门（P.cs:39733-39745）', () => {
  it('questItem 全集（DefaultToQuestFish 调用面）=2450..2488∪{4393,4394}=41 项', () => {
    expect(QUEST_ITEM_VIDS.size).toBe(41);
    for (let v = 2450; v <= 2488; v++) expect(QUEST_ITEM_VIDS.has(v)).toBe(true);
    expect(QUEST_ITEM_VIDS.has(4393)).toBe(true);
    expect(QUEST_ITEM_VIDS.has(4394)).toBe(true);
  });

  it('拒收门真值表：任务鱼 ∪ 3822=false；普通物/钱币/透镜本体=true', () => {
    expect(canVoidVaultAccept(2450)).toBe(false);
    expect(canVoidVaultAccept(2488)).toBe(false);
    expect(canVoidVaultAccept(4393)).toBe(false);
    expect(canVoidVaultAccept(4394)).toBe(false);
    expect(canVoidVaultAccept(3822)).toBe(false);       // DD2EnergyCrystal 埃特尼亚魔力
    expect(canVoidVaultAccept(71)).toBe(true);          // 铜币
    expect(canVoidVaultAccept(2)).toBe(true);           // 石块
    expect(canVoidVaultAccept(4131)).toBe(true);        // 虚空透镜本体不拒收
  });

  it('溢流口端到端：任务鱼/3822 灌袋原样返回、bank4 全空；泥土正常入袋', () => {
    const p = vaultPlayer();
    const vault = p.banks[3];
    expect(p.depositIntoVoidVault(iidOf(2450), 3)).toBe(3);
    expect(p.depositIntoVoidVault(iidOf(3822), 5)).toBe(5);
    expect(p.depositIntoVoidVault(iidOf(4393), 1)).toBe(1);
    expect(vault.every((s) => s === null)).toBe(true);
    // 拒收面=留在原地不掉入袋：余量退回世界由 ItemDrop.ts 残余路径承载（dep==stack）
    const dep = p.depositIntoVoidVault(iidOf(1), 1);    // 泥土（非拒收面）走通通道
    expect(dep).toBe(0);
    expect(vault[0]).toEqual({ id: iidOf(1), stack: 1 });
  });
});

describe('② 币种兑换：槽位级 DoCoins + 溢流接线（P.cs:39554-39570/:39844-39847）', () => {
  it('doCoinsAt 原式升级链：恰满 100 铜 → 本槽变 1 银（无归并目标时留银）', () => {
    const inv = new Inventory();
    inv.slots[2] = { id: iidOf(71), stack: 100 };
    inv.doCoinsAt(2);
    expect(inv.slots[2]).toEqual({ id: iidOf(72), stack: 1 });   // SetDefaults(type+1)
  });

  it('doCoinsAt 归并支：别处同型未满堆 +1、本槽 TurnToAir（:39581-39584）', () => {
    const inv = new Inventory();
    inv.slots[2] = { id: iidOf(71), stack: 100 };
    inv.slots[7] = { id: iidOf(72), stack: 1 };
    inv.doCoinsAt(2);
    expect(inv.slots[2]).toBeNull();                             // :39583
    expect(inv.slots[7]).toEqual({ id: iidOf(72), stack: 2 });   // :39582
  });

  it('边界双闸：非恰 100 不动；铂(74)只读不升（:39575 只认 71-73）', () => {
    const inv = new Inventory();
    inv.slots[2] = { id: iidOf(71), stack: 99 };
    inv.doCoinsAt(2);
    expect(inv.slots[2]).toEqual({ id: iidOf(71), stack: 99 });
    inv.slots[2] = { id: iidOf(74), stack: 100 };                // 白金 100 不换金
    inv.doCoinsAt(2);
    expect(inv.slots[2]).toEqual({ id: iidOf(74), stack: 100 });
  });

  it('溢流口接线：虚空袋落格于 vault 下标 i → 主背包同下标位 DoCoins 结算（原文本态）', () => {
    const p = vaultPlayer();
    p.banks[3][0] = { id: iidOf(2), stack: 1 };                   // 石头占 vault[0..1]（异型防并堆）
    p.banks[3][1] = { id: iidOf(2), stack: 1 };
    p.inv.slots[2] = { id: iidOf(71), stack: 100 };               // 主背包恰好 100 铜
    const dep = p.depositIntoVoidVault(iidOf(1), 1);              // 泥土独立落格到 vault[2]=首个空位，尾随 DoCoins(2)
    expect(dep).toBe(0);
    expect(p.banks[3][2]).toEqual({ id: iidOf(1), stack: 1 });    // 入袋成功
    expect(p.inv.slots[2]).toEqual({ id: iidOf(72), stack: 1 });  // ★主背包 2 号位升银=原文
  });

  it('COIN_KEYS 升级链键序守护（铜→银→金→铂）', () => {
    expect(VANILLA_ITEM_KEY_BY_ID[71]).toBe(COIN_KEYS[0]);
    expect(VANILLA_ITEM_KEY_BY_ID[72]).toBe(COIN_KEYS[1]);
    expect(VANILLA_ITEM_KEY_BY_ID[73]).toBe(COIN_KEYS[2]);
    expect(VANILLA_ITEM_KEY_BY_ID[74]).toBe(COIN_KEYS[3]);
  });
});

describe('③ LootAll 多通道 vault 允许面（ChestUI.cs:391-392/:414-465）', () => {
  it('settings 二选一：真箱开通道，bank 面板(-2..-5)不开', () => {
    expect(chestSettingsAllowsVault(undefined)).toBe(true);
    expect(chestSettingsAllowsVault(120)).toBe(true);      // 世界宝箱 tile x≥0
    for (const bx of [-2, -3, -4, -5]) expect(chestSettingsAllowsVault(bx)).toBe(false);
  });

  it('lootAllFromContainer：全吸收即清格；残余经 spill 溢流、部分吸收回写残量', () => {
    type SlotT = { id: number; stack: number } | null;
    const added: Array<[number, number]> = [];
    const spilled: Array<[number, number]> = [];
    const stubInv = {
      add: (id: number, count: number): number => {
        added.push([id, count]);
        return Math.min(count, 1);                          // 每次硬吞 (count-1)，1 起恒剩 1?
      },
    } as unknown as Inventory;

    // A：一次装下 → 清格、不触 spill
    const itemsA: SlotT[] = [{ id: 500, stack: 4 }];
    (stubInv as unknown as { add: unknown }).add = (id: number, n: number): number => {
      void id;
      return 0;                                             // 全吞
    };
    spilled.length = 0;
    const spill = (id: number, n: number): number => { spilled.push([id, n]); return 0; };
    expect(lootAllFromContainer(stubInv, itemsA, spill)).toBe(true);
    expect(itemsA[0]).toBeNull();

    // B：装不下且 spill 全兜 → 容器也清空、spill 收到整份
    const itemsB: SlotT[] = [{ id: 501, stack: 6 }];
    (stubInv as unknown as { add: unknown }).add = (_id: number, n: number): number => n;  // 全部装不下
    expect(lootAllFromContainer(stubInv, itemsB, spill)).toBe(true);
    expect(spilled).toContainEqual([501, 6]);
    expect(itemsB[0]).toBeNull();

    // C：spill 部分兜底 → 容器回写剩余；未带 spill 时同样余量留存（LootAllFromBank 面）
    const itemsC: SlotT[] = [{ id: 502, stack: 6 }];
    (stubInv as unknown as { add: unknown }).add = (_id: number, n: number): number => n - 2;
    expect(lootAllFromContainer(stubInv, itemsC, (id) => (id === 502 ? 1 : 0))).toBe(true);   // spill 兜到只余 1
    expect(itemsC[0]).toEqual({ id: 502, stack: 1 });
    const itemsD: SlotT[] = [{ id: 503, stack: 6 }];
    expect(lootAllFromContainer(stubInv, itemsD, undefined)).toBe(true);
    expect(itemsD[0]).toEqual({ id: 503, stack: 4 });
    void added;
  });
});

// ---------------------------------------------------------------------------
// ④ 橄榄球 861 MP 宽限：owner-only 钉死（Projectile.cs:23677-23691）
// ---------------------------------------------------------------------------
type Box = { x: number; y: number; w: number; h: number; vx?: number; vy?: number; dead?: boolean };

function ballHooks(self: Box, others: Box[]): { hooks: GameHooks; drops: Array<{ key: string; n: number }> } {
  const drops: Array<{ key: string; n: number }> = [];
  const hooks = {
    world: { store: new TileStore(80, 80) },
    player: self,
    candidatePlayers: (): unknown[] => [self, ...others],
    enemies: (): unknown[] => [],
    npcs: (): unknown[] => [],
    critters: (): unknown[] => [],
    projectiles: (): unknown[] => [],
    spawnDrop: (_x: number, _y: number, key: string, n?: number): null => {
      drops.push({ key, n: n ?? 1 });
      return null;
    },
    damagePlayer: (): void => {},
    addDamageNumber: (): void => {},
    playSfx: (): void => {},
    playSfxFiles: (): void => {},
    playSfxFile: (): boolean => true,
    showPickupLabel: (): void => {},
    spawnDust: (): null => null,
    spawnParticles: (): void => {},
    notifyInventoryChanged: (): void => {},
    cutTile: (): void => {},
    onEnemyKilled: (): void => {},
    spawnEnemy: (): void => {},
    addLightAt: (): void => {},
  };
  return { hooks: Object.assign(hooks as unknown as GameHooks, { drops }), drops };
}

describe('④ FootballProj 接触回收宽限窗（owner-only,:23677-23691）', () => {
  /** 大覆盖盒保证整个测程保持重叠；球给 vx=0.3/vy=-0.15 防静止杀双零误发。 */
  it('宽限期内 owner 本人触碰不回收（≤29t 存活，localAI[0]<30 门）', () => {
    const self: Box = { x: -10000, y: -10000, w: 20000, h: 20000, vx: 0, vy: 0, dead: false };
    const { hooks } = ballHooks(self, []);
    const fb = new FootballProj(110, 120, 0.3, -0.15, 1, false);
    for (let i = 0; i < 29 && !fb.dead; i++) fb.fixedUpdate(1 / 60, hooks);
    expect(fb.dead).toBe(false);
    expect(fb.graceTicks()).toBeLessThanOrEqual(30);
  });

  it('宽限期内其他代理玩家触碰立即回收（MP 其他端不吃宽限=原文真值）并单笔回落 max(ai2,1)', () => {
    const self: Box = { x: -10000, y: -10000, w: 20000, h: 20000, vx: 0, vy: 0, dead: false };
    const stranger: Box = { x: 95, y: 105, w: 20, h: 42, dead: false };
    const { hooks, drops } = ballHooks(self, [stranger]);
    const fb = new FootballProj(105, 118, 0.3, -0.15, 3, false);   // 出生即压在 stranger 盒上
    for (let i = 0; i < 3 && !fb.dead; i++) fb.fixedUpdate(1 / 60, hooks);
    expect(fb.dead).toBe(true);
    expect(drops.filter((d) => d.key === 'vi_4743_Football')).toHaveLength(1);
    expect(drops[0].n).toBe(3);                                    // RequestNewItem max(ai[2],1)
  });

  it('死亡门（:23685 !player2.dead）：存活 owner 不回收（同上死斗他人不相干）', () => {
    const self: Box = { x: -10000, y: -10000, w: 20000, h: 20000, vx: 0, vy: 0, dead: false };
    const ghost: Box = { x: -9999, y: -9999, w: 99999, h: 99999, dead: true };
    const { hooks } = ballHooks(self, [ghost]);                    // 幽灵大盒覆盖全场
    const fb = new FootballProj(110, 120, 0.3, -0.15, 1, false);
    for (let i = 0; i < 28 && !fb.dead; i++) fb.fixedUpdate(1 / 60, hooks);
    expect(fb.dead).toBe(false);
  });

  it('owner 在 localAI[0]==30 拍起即可被自身回收（宽限窗恰好 30t 关闭）', () => {
    const self: Box = { x: -10000, y: -10000, w: 20000, h: 20000, vx: 0, vy: 0, dead: false };
    const { hooks, drops } = ballHooks(self, []);
    const fb = new FootballProj(110, 120, 0.3, -0.15, 2, false);
    for (let i = 0; i < 30 && !fb.dead; i++) fb.fixedUpdate(1 / 60, hooks);
    expect(fb.dead).toBe(true);
    expect(fb.graceTicks()).toBe(30);                              // min(30, ++localAI) 钳位
    expect(drops.filter((d) => d.key === 'vi_4743_Football')).toHaveLength(1);
    expect(drops[0].n).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ⑤ F2 词缀语义：合并支同 prefix 门 + 空位支整件随行
//   · 占用合并受理门 = Item.CanStack(returnItem, inv[i])（Player.cs:39749 →
//     Item.CanStack :49870-49876 = 同 type【且同 prefix】）——异词缀互融堆叠=
//     词缀堆污染。仓内同款判定先例 QuickStacking.canStack。
//   · 空位落格 `inv[i] = returnItem`（Player.cs:39845）整件随行含 prefix——
//     新建裸 {id,stack} 槽=存档可观测的词缀丢失（SavedItem.prefix 原样透传）。
//   · 词缀取实值：PrefixID.Unreal=82（PrefixID.cs:174）/ PrefixID.Deadly=20
//     （PrefixID.cs:50）；弹药可重铸+带词缀掉落，木箭 vid=40 为典型受害者面。
// ---------------------------------------------------------------------------
describe('⑤ vault 词缀语义（F2：P.cs:39749/:39845 + Item.cs:49870-49876）', () => {
  const UNREAL = 82;
  const DEADLY = 20;

  it('同一 prefix 溢流：先并满既有堆、残段续落新格且带前缀', () => {
    const p = vaultPlayer();
    const arrow = iidOf(40);                        // 木箭 vid=40（可重铸弹药）
    // 容量与被测代码同源读法（ITEM_DEFS[?].maxStack ?? 999）——桥接批缺省 maxStack
    // 非 999 字面，钉死注册表真值防脆断
    const amax = ITEM_DEFS[arrow]?.maxStack ?? 999;
    p.banks[3][0] = { id: arrow, stack: amax - 4, prefix: UNREAL };
    expect(p.depositIntoVoidVault(arrow, amax, UNREAL)).toBe(0);
    expect(p.banks[3][0]).toEqual({ id: arrow, stack: amax, prefix: UNREAL });          // 并满
    expect(p.banks[3][1]).toEqual({ id: arrow, stack: amax - 4, prefix: UNREAL });      // 段随行保词缀
  });

  it('不同 prefix 分槽：Unreal 堆不被 Deadly 灌入（互融=bug 面钉死）', () => {
    const p = vaultPlayer();
    const arrow = iidOf(40);
    p.banks[3][0] = { id: arrow, stack: 5, prefix: UNREAL };
    expect(p.depositIntoVoidVault(arrow, 3, DEADLY)).toBe(0);
    expect(p.banks[3][0]).toEqual({ id: arrow, stack: 5, prefix: UNREAL });     // 既有堆原样不动
    expect(p.banks[3][1]).toEqual({ id: arrow, stack: 3, prefix: DEADLY });     // 异词缀独立落格
    expect(p.banks[3][2]).toBe(null);
  });

  it('空位落格整件随行：新槽携词缀字段；无词缀走旧形不写字段', () => {
    const p = vaultPlayer();
    const star = iidOf(19);                         // 掉落拾取面同理；空袋直落空位
    expect(p.depositIntoVoidVault(star, 7, UNREAL)).toBe(0);
    expect(p.banks[3][0]).toEqual({ id: star, stack: 7, prefix: UNREAL });
    // 缺省（无词缀）：保持裸 {id,stack}，与存档 SavedItem.prefix||undefined 双向对称
    expect(p.depositIntoVoidVault(iidOf(1), 2)).toBe(0);
    expect(p.banks[3][1]).toEqual({ id: iidOf(1), stack: 2 });
  });
});
