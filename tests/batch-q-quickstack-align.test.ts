// 快速堆叠复核批（Q-F1..Q-F8）专测（2026-09-01）——
//  权威：Terarria1457/Terraria.GameContent/QuickStacking.cs（1456 双版行号标见
//  src/stats/QuickStacking.ts 头注）+ NearbyChests.cs + Terraria/Chest.cs +
//  Terraria.UI/ChestUI.cs。看门既有套件 = tests/batch-d-tagstack.test.ts /
//  tests/player-smallpack.test.ts / tests/orchestra-types-l6.test.ts。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE_INTERNAL_BY_SHEET, TILE_DEFS } from '../src/data/tiles';
import {
  quickStackToChests, moveCoinsIntoBank, nearbyBanksInRange,
  ITEM_TRANSFER_PLAYER_TO_CHEST_BITS,
} from '../src/stats/QuickStacking';
import { blockedChestFx, itemTransferFx } from '../src/fx/orchestraFx';
import type { GameHooks } from '../src/entities/types';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

type Slot = { id: number; stack: number; prefix?: number; favorited?: boolean } | null;

const mkHooks = (capture: Array<{ x: number; y: number; color: string; opts: Record<string, unknown> }>): GameHooks => ({
  spawnParticles: (x: number, y: number, color: string,
    _count?: number, _speed?: number, opts?: Record<string, unknown>) => {
    capture.push({ x, y, color, opts: opts ?? {} });
  },
} as never);

// ===================== Q-F1：bank 盒扫 sheet→内部 id 反查 =====================
describe('Q-F1 bank 盒扫（NearbyChests.GetBanksInRangeOf :61-89 tile 段）', () => {
  it('TILE_INTERNAL_BY_SHEET 四 sheet 映射真值锚（tiles.ts 首同-sheet def 下标）', () => {
    expect(TILE_INTERNAL_BY_SHEET.get(29)).toBe(83);   // v_29_piggy_bank
    expect(TILE_INTERNAL_BY_SHEET.get(97)).toBe(235);  // v_97_safe
    expect(TILE_INTERNAL_BY_SHEET.get(463)).toBe(84);  // v_463_defenders_forge
    expect(TILE_INTERNAL_BY_SHEET.get(491)).toBe(230); // v_491_void_vault
    expect(TILE_DEFS[83].key).toBe('v_29_piggy_bank');
    expect(TILE_DEFS[235].key).toBe('v_97_safe');
    expect(TILE_DEFS[84].key).toBe('v_463_defenders_forge');
    expect(TILE_DEFS[230].key).toBe('v_491_void_vault');
  });

  it('旧直比恒不命中的前提锚：内部 id ∉ [29,97,463,491]', () => {
    for (const t of [83, 235, 84, 230]) {
      expect([29, 97, 463, 491].indexOf(t)).toBe(-1);
    }
  });

  it('盒扫命中 + 首遇格去重 + 槽位序映射（bi=0 存钱罐…3 vault）', () => {
    const store = new TileStore(200, 120);
    store.setTileSilent(99, 63, 83);   // piggy 后置候选
    store.setTileSilent(102, 61, 83);  // j 序更靠后 → 不改首遇锚
    store.setTileSilent(110, 66, 235); // safe
    store.setTileSilent(112, 70, 84);  // forge
    store.setTileSilent(114, 72, 230); // void vault
    const banks: Slot[][] = [Array(40).fill(null), Array(40).fill(null), Array(40).fill(null), Array(40).fill(null)];
    const hits = nearbyBanksInRange(store, 105, 66, banks, false);
    expect(hits.map((h) => h.bi)).toEqual([0, 1, 2, 3]);
    expect(hits[0]).toMatchObject({ tx: 99, ty: 63 });
    expect(hits[1]).toMatchObject({ tx: 110, ty: 66 });
    expect(hits[2]).toMatchObject({ tx: 112, ty: 70 });
    expect(hits[3]).toMatchObject({ tx: 114, ty: 72 });
  });

  it('vault 持 5325 排除（ContainerIndexToPlayerBank -5 支 :119-130）与盒界', () => {
    const store = new TileStore(200, 120);
    store.setTileSilent(50, 50, 230);   // vault 在 (50,50)
    store.setTileSilent(10, 10, 83);    // 盒外（中心 (51,51),num=39 → 界 12..90）
    const bank4 = Array<Slot>(40).fill(null);
    const banks: Slot[][] = [Array(40).fill(null), Array(40).fill(null), Array(40).fill(null), bank4];
    // num=39 盒含 (12..90)：(10,10) 出界不命中;(50,50) 命中
    expect(nearbyBanksInRange(store, 51, 51, banks, false).map((h) => h.bi)).toEqual([3]);
    expect(nearbyBanksInRange(store, 51, 51, banks, true)).toEqual([]);   // 持 vault 物 → 不计
    // 盒下缘（(12,12)）在界内：(12,12) 无 tile；把 vault 放界角验证闭区间端点
    store.setTileSilent(12, 90, 83);
    expect(nearbyBanksInRange(store, 51, 51, banks, false).some((h) => h.tx === 12 && h.ty === 90)).toBe(true);
  });

  it('bank 缺席跳过该格且不中断扫描;未注册 tile 不命中（default=不入 container 面）', () => {
    const store = new TileStore(200, 120);
    store.setTileSilent(100, 60, 83);
    store.setTileSilent(101, 60, 21);   // 原版宝箱 sheet=21——非 bank 家族
    const noBanks: ReadonlyArray<Slot[] | null> = [null, null, null, null];
    expect(nearbyBanksInRange(store, 100, 60, noBanks, false)).toEqual([]);
    // bank[0] 缺席但同盒后续列的 safe（bi1）仍须命中——缺席面是 continue 非 break
    store.setTileSilent(101, 61, 235);
    const partial: ReadonlyArray<Slot[] | null> = [null, Array<Slot>(40).fill(null), null, null];
    const hits = nearbyBanksInRange(store, 100, 60, partial, false);
    expect(hits.map((h) => h.bi)).toEqual([1]);
    expect(hits[0]).toMatchObject({ tx: 101, ty: 61 });
  });
});

// ===================== Q-F2：虚空袋源件臂 =====================
describe('Q-F2 PackQuickStackableItems(includeVoidBag:true) 臂（:379-389/:368-378）', () => {
  const mkChest = (): { x: number; y: number; items: Slot[] } => {
    const items = Array<Slot>(20).fill(null);
    items[0] = { id: iid(2), stack: 10 };   // dirt 同型补叠口
    return { x: 20, y: 38, items };
  };

  it('bank4 段参与转移并经写回扩展位落位;favorited/IsACoin 对袋内件同门', () => {
    const inv = new Inventory();
    const dirt = iid(2), torch = iid(8), copper = iid(71);
    inv.slots[10] = { id: torch, stack: 5 };            // 背包段、无同型箱 → 不动
    const chest = mkChest();
    const bank4 = Array<Slot>(40).fill(null);
    bank4[0] = { id: dirt, stack: 5 };
    bank4[1] = { id: dirt, stack: 7, favorited: true }; // 收藏 → 不打包(:397 单判式)
    bank4[2] = { id: copper, stack: 50 };               // IsACoin → 同拒
    const r = quickStackToChests(inv, [chest], false, { voidVaultSource: bank4 });
    expect(chest.items[0]!.stack).toBe(15);             // FillStack 吃袋内件
    expect(bank4[0]).toBeNull();                        // 写回扩展位清格
    expect(bank4[1]!.stack).toBe(7);
    expect(bank4[2]!.stack).toBe(50);
    expect(inv.slots[10]!.stack).toBe(5);
    expect(r.touched).toContain(chest);
  });

  it('缺省（includeVoidBag=false,bank 径）：袋面不参与源件', () => {
    const inv = new Inventory();
    const chest = mkChest();
    const bank4 = Array<Slot>(40).fill(null);
    bank4[0] = { id: iid(2), stack: 5 };
    quickStackToChests(inv, [chest], false);
    expect(chest.items[0]!.stack).toBe(10);
    expect(bank4[0]!.stack).toBe(5);
  });
});

// ===================== Q-F5：逐帧 ItemTransfer 序列 =====================
describe('Q-F5 每搬一件各发一帧（FillStack :533 / InsertIntoFreeSlot :564）', () => {
  it('A 阶段两槽同补叠 → movedVids=[torch,dirt]（按 dest 槽序,序列首元素=旧首件型断言位）', () => {
    const inv = new Inventory();
    const torch = iid(8), dirt = iid(2);
    const chest: { x: number; y: number; items: Slot[] } = {
      x: 20, y: 38, items: [{ id: torch, stack: 1 }, { id: dirt, stack: 1 }, ...Array<Slot>(18).fill(null)],
    };
    inv.slots[10] = { id: torch, stack: 50 };
    inv.slots[11] = { id: dirt, stack: 50 };
    const r = quickStackToChests(inv, [chest], false);
    expect(r.touched).toContain(chest);
    expect(r.movedVids.get(chest)).toEqual([8, 2]);               // vanilla id 面（visualize 用 type）
    expect(chest.items[0]!.stack).toBe(51);
    expect(chest.items[1]!.stack).toBe(51);
  });

  it('InsertIntoFreeSlot 帧：满叠不并 → 登记 → 整件入空格一帧;先 Visualize 后 Swap', () => {
    const inv = new Inventory();
    const torch = iid(8);
    const torchMax = ITEM_DEFS[torch].maxStack;
    const chest: { x: number; y: number; items: Slot[] } = {
      x: 20, y: 38, items: [{ id: torch, stack: torchMax }, ...Array<Slot>(19).fill(null)],
    };
    inv.slots[10] = { id: torch, stack: 50 };
    const r = quickStackToChests(inv, [chest], false);
    expect(r.movedVids.get(chest)).toEqual([8]);
    expect(chest.items[1]).toMatchObject({ id: torch, stack: 50 });   // Utils.Swap 落位
    expect(inv.slots[10]).toBeNull();
  });
});

// ===================== Q-F8：FillStack 并尽跳过同型登记（:503-506 / 1456 :492-495）=====================
describe('Q-F8 分次补叠边窗（vanilla continue 面）', () => {
  it('首源并尽（continue 面）+ 次源触顶留残余 → 残余走 Lookup 直送空格;终态钉死防回归', () => {
    const inv = new Inventory();
    const dirt = iid(2);
    const dirtMax = ITEM_DEFS[dirt].maxStack;
    const chest: { x: number; y: number; items: Slot[] } = {
      x: 20, y: 38, items: [{ id: dirt, stack: dirtMax - 400 }, ...Array<Slot>(19).fill(null)],
    };
    inv.slots[10] = { id: dirt, stack: 300 };   // 全并（cs→dirtMax-100,源并尽 → vanilla continue）
    inv.slots[11] = { id: dirt, stack: 700 };   // 只进 100（cs→max 满）→ 留 600 且登记类型
    quickStackToChests(inv, [chest], false);
    expect(chest.items[0]!.stack).toBe(dirtMax);            // 叠界钳制
    // 残余 600 经 destinationsForItemTypes 登记 → B 阶段整件入空格
    const rest = chest.items.filter((s) => s && s.id === dirt && s !== chest.items[0]);
    expect(rest.length).toBeGreaterThanOrEqual(1);
    expect(rest.reduce((n, s) => n + s!.stack, 0)).toBe(600);
    expect(inv.slots[10]).toBeNull();
    expect(inv.slots[11]).toBeNull();
  });

  it('全并尽无残余：不产生幽灵空格直送（continue 面的干净终态）', () => {
    const inv = new Inventory();
    const dirt = iid(2);
    const chest: { x: number; y: number; items: Slot[] } = {
      x: 20, y: 38, items: [{ id: dirt, stack: 500 }, ...Array<Slot>(19).fill(null)],
    };
    inv.slots[10] = { id: dirt, stack: 200 };
    inv.slots[11] = { id: dirt, stack: 200 };   // 合计 900 < maxStack
    quickStackToChests(inv, [chest], false);
    expect(chest.items[0]!.stack).toBe(900);
    expect(chest.items.slice(1).every((s) => !s)).toBe(true);   // 无直送残件
    expect(inv.slots[10]).toBeNull();
    expect(inv.slots[11]).toBeNull();
  });
});

// ===================== Q-F6：MoveCoins 尾 PlaySound(7) 条件出参 =====================
describe('Q-F6 MoveCoins flag 支出参（ChestUI.cs:1000/:1071/:1185/:1196-1198）', () => {
  const copper = (() => { const c = iid(71); return c; })();
  const silver = iid(72);

  it('全数入袋（无④回手）→ playSound7=true;计数返回不变', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: copper, stack: 150 };
    inv.slots[11] = { id: copper, stack: 60 };
    const bank = Array<Slot>(40).fill(null);
    bank[0] = { id: silver, stack: 20 };
    const cue: { playSound7?: boolean } = {};
    const moved = moveCoinsIntoBank(inv, bank, cue);
    expect(moved).toBe(210);
    expect(cue.playSound7).toBe(true);
  });

  it('溢出回手（④臂占位）→ playSound7=false;bank 无币早退 → false 且不动背包', () => {
    // bank 除原银位外全实心 → 铜 10 无空槽可落 → 回手
    const inv = new Inventory();
    const dirt = iid(2);
    inv.slots[10] = { id: copper, stack: 210 };
    const bank = Array<Slot>(40).fill(null);
    bank[0] = { id: silver, stack: 20 };
    for (let i = 1; i < 40; i++) bank[i] = { id: dirt, stack: 1 };
    const cue: { playSound7?: boolean } = {};
    const moved = moveCoinsIntoBank(inv, bank, cue);
    expect(moved).toBe(200);                       // 10 铜回手
    expect(cue.playSound7).toBe(false);
    expect(inv.slots[10]).toMatchObject({ id: copper, stack: 10 });

    const inv2 = new Inventory();
    inv2.slots[10] = { id: copper, stack: 100 };
    const bank2 = Array<Slot>(40).fill(null);
    bank2[0] = { id: dirt, stack: 1 };             // flag2 门失败：无既有币
    const cue2: { playSound7?: boolean } = {};
    expect(moveCoinsIntoBank(inv2, bank2, cue2)).toBe(0);
    expect(cue2.playSound7).toBe(false);
    expect(inv2.slots[10]!.stack).toBe(100);
  });

  it('缺省调用（不出参）保持旧签名', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: copper, stack: 150 };
    const bank = Array<Slot>(40).fill(null);
    bank[0] = { id: silver, stack: 20 };
    expect(moveCoinsIntoBank(inv, bank)).toBe(150);
  });
});

// ===================== Q-F3/Q-F4/Q-F7：编排出站形 =====================
describe('编排出站（Visualize 族 / IndicateBlockedChest 等价通道）', () => {
  it('PlayerToChest 位面常量 = 0b1111<<24（Chest.cs:30-36 四旗）', () => {
    expect(ITEM_TRANSFER_PLAYER_TO_CHEST_BITS).toBe(0b1111 << 24);
    expect((ITEM_TRANSFER_PLAYER_TO_CHEST_BITS >> 24) & 0x01).toBe(1);   // bit0 RandomizeStart（消费端只读位）
  });

  it('itemTransferFx：金闪终点速度=move/life（bit0 开 → 出手项圈一粒）', () => {
    const caps: Array<{ x: number; y: number; color: string; opts: Record<string, unknown> }> = [];
    itemTransferFx(mkHooks(caps), 320, 320, 352, 336, 2, 0b1111);
    expect(caps.length).toBe(2);                        // bit0 项圈 + 主粒
    const main = caps[1];
    expect(main.opts.vx).toBeCloseTo((352 - 320) / 60); // life=60 → 常速指向终点
    expect(main.opts.vy).toBeCloseTo((336 - 320) / 60);
    expect(main.opts.life).toBe(60);
  });

  it('blockedChestFx：箱锚红粒子单粒 60t（IndicateBlockedChest Chest.cs:3578-3598 等价通道）', () => {
    const caps: Array<{ x: number; y: number; color: string; opts: Record<string, unknown> }> = [];
    blockedChestFx(mkHooks(caps), 336, 624);
    expect(caps.length).toBe(1);
    expect(caps[0].color).toContain('255,40,40');       // ColorTint (255,40,40)
    expect(caps[0].opts.life).toBe(60);                 // num=60f
    expect(caps[0].opts.vy).toBeCloseTo(0.1);           // Velocity=UnitY*0.1
    expect(caps[0].opts.grav).toBeCloseTo(-0.4 / 60);   // Accel=-UnitY*0.4/60
  });

  it('Game 快堆段结构断言翻新：端点=箱锚像素面 (ch.x+1)*16;旧 ch.x+8 形退役', () => {
    const src = readFileSync('src/core/Game.ts', 'utf8');
    expect(src).toContain('(ch.x + 1) * 16');
    expect(src).toContain('(ch.y + 1) * 16');
    expect(src).not.toContain('ch.x + 8');
    // Q-F4/F5/F7 接线锚
    expect(src).toContain('emitItemTransferFx(p.cx, p.cy, bx, by, 71 + i)');   // CoinsBatch 四档
    expect(src).toContain("this.sfx.play('pickup', 1)");                        // PlaySound(7)
    expect(src).toContain('blockedChestFx(this,');
    expect(src).not.toContain('[29, 97, 463, 491].indexOf(t)');                 // Q-F1 旧直比退役
  });
});
