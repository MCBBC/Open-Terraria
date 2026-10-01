// SW-BJ87 2026-09-15 新角色开局三件套落位定谳守卫（用户实报"三件套在物品栏不在热键区"）
// 原版锚：UICharacterCreation.cs:1714-1761 SetupPlayerStatsAndInventoryBasedOnDifficulty
//   经典支 :1749-1756 =【逐槽直置】inventory[0]=3507 铜短剑/[1]=3509 铜镐/[2]=3506 铜斧
//   （各 Prefix(-1)）；槽 0-9=热键区首行。1458 同锚（1458 UICharacterCreation.cs:1751-1755
//   零变更）。同款直置另见中核死亡发还 Player.DropItems :55010-55015。
// 本仓断链：loadWorld（新建角色唯一授予面——createWorldFlow 无随身态分支只吃它）与
//   importWld 曾走 inv.add（GetItem 路由）：三件 vanilla-itemfunc 缺 useStyle（共享 case
//   提取盲区）→ itemUseStyleOf exact-only=0 → GetItem 热栏空格臂（Player.cs:39671-39680
//   useStyle!=0）不可达 → 降序臂（:39688-39700）落背包尾 49/48/47 = 实报现象。
// 修复：单源 grantStarterKit（Game.ts）逐槽直置；loadWorld/importWld/死亡发还三点同源。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { VI_KEY, VI_ID } from '../src/data/itemKeys';
import { grantStarterKit } from '../src/core/Game';

const GAME_SRC = () => readFileSync(join(__dirname, '..', 'src', 'core', 'Game.ts'), 'utf8');
const FLOW_SRC = () => readFileSync(join(__dirname, '..', 'src', 'mainFlow.ts'), 'utf8');

describe('SW-BJ87 新角色三件套逐槽直置（UICharacterCreation.cs:1749-1756）', () => {
  it('落位 = 热键区 [0]短剑 3507 / [1]镐 3509 / [2]斧 3506，数量各 1，原版顺序', () => {
    const inv = new Inventory();
    grantStarterKit(inv);
    expect(inv.slots[0]?.id).toBe(ITEM_BY_KEY[VI_KEY.STARTER.SHORTSWORD]);
    expect(inv.slots[0]?.stack).toBe(1);
    expect(inv.slots[1]?.id).toBe(ITEM_BY_KEY[VI_KEY.STARTER.PICK]);
    expect(inv.slots[2]?.id).toBe(ITEM_BY_KEY[VI_KEY.STARTER.AXE]);
    // vanilla id 面钉死（ItemID.cs:8558/:8560/:8564；内部 id↔vid 映射单源 VI_ID）
    expect(ITEM_BY_KEY[VI_KEY.STARTER.SHORTSWORD]).toBe(VI_ID(3507));
    expect(ITEM_BY_KEY[VI_KEY.STARTER.PICK]).toBe(VI_ID(3509));
    expect(ITEM_BY_KEY[VI_KEY.STARTER.AXE]).toBe(VI_ID(3506));
  });

  it('槽 3-49 / 盔甲 / 染料零触碰（原版经典支只给三件，其余不给）', () => {
    const inv = new Inventory();
    grantStarterKit(inv);
    for (let i = 3; i < inv.slots.length; i++) expect(inv.slots[i], `slot ${i}`).toBeNull();
    expect(inv.armor.every((s) => s === null)).toBe(true);
    expect(inv.dye.every((s) => s === null)).toBe(true);
    expect(inv.miscEquips.every((s) => s === null)).toBe(true);
  });

  it('SetDefaults 语义 = 原地覆盖既有槽物（vanilla inventory[0].SetDefaults(3507)）', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: ITEM_BY_KEY[VI_KEY.TORCH], stack: 7 };
    grantStarterKit(inv);
    expect(inv.slots[0]?.id).toBe(ITEM_BY_KEY[VI_KEY.STARTER.SHORTSWORD]);
    expect(inv.slots[0]?.stack).toBe(1);
  });

  it('幂等：loadWorld 授予 × applyPlayerWithCharacter 新角色臂双跑不重不乱序', () => {
    const inv = new Inventory();
    grantStarterKit(inv);
    // ★X2 快照口径收窄（2026-10-01）:BJ390（8504d274,2026-09-28）开局件逐件
    //  Prefix(-1) 自然词缀掷（vanillaPrefixes 1/4 无词缀早退+骰源随机）——双跑
    //  重掷词缀=原版 SetDefaults 原地覆盖同相;幂等锁承保的是【槽位放置面】
    //  （id/stack/序）,故快照剥 prefix。
    const snapShape = (inv2: Inventory) =>
      JSON.stringify(inv2.slots.slice(0, 10).map((it) => it && { id: it.id, stack: it.stack }));
    const snap = snapShape(inv);
    grantStarterKit(inv);
    expect(snapShape(inv)).toBe(snap);
    expect(inv.slots[0]?.id).toBe(ITEM_BY_KEY[VI_KEY.STARTER.SHORTSWORD]);
  });
});

describe('SW-BJ87 写面 tripwire：起始件禁止回改 inv.add 路由（GetItem 语义≠原版逐槽直置）', () => {
  it('Game.ts：loadWorld 与死亡发还（DropItems :55010-55015）走 grantStarterKit', () => {
    const src = GAME_SRC();
    expect(src).toContain('export function grantStarterKit');
    // ★BJ91 2026-09-15：loadWorld 授予改带 difficulty 入参（旅程支 BJ87 债 B 清偿）——
    //   调用形状随刀更新,授予面本身不变（仍逐槽直置单源）
    expect(src).toMatch(/grantStarterKit\(this\.player\.inv, /);   // loadWorld 授予（带 difficulty）
    expect(src).toContain('grantStarterKit(inv);');               // dropInventoryOnDeath 发还
    expect(src).not.toMatch(/inv\.add\(ITEM_BY_KEY\[VI_KEY\.STARTER\./);
  });
  it('mainFlow.ts：importWld 与新角色臂走 grantStarterKit（两处调用,零路由）', () => {
    const src = FLOW_SRC();
    expect(src.match(/grantStarterKit\(/g)?.length).toBe(2);
    expect(src).not.toMatch(/add\(ITEM_BY_KEY\[VI_KEY\.STARTER\./);
  });
});

// ---------------- BJ91（2026-09-15）：旅程分支（BJ87 登记债 B 清偿） ----------------
// 金标：UICharacterCreation.cs:1720-1747 旅程支（difficulty==3,1458 同锚零变更）——
//   [0]=6 铁短剑/[1]=1 铁镐/[2]=10 铁斧/[3]=7 铁锤/[4]=4281 雏鸟杖/[5]=8 火把×100/
//   [6]=965 藤蔓绳×100/[7]=50 魔镜/[8]=84 抓钩（ItemID.cs:1548/1558/1566/1560/10108/
//   1562/3476/1646/1714）+ armor[3]=4978 雏鸟翼（:1740,CreativeWings=ItemID.cs:11502）。
//   死亡发还（Player.cs:55010-55015）= 无条件经典铜三件,不随 difficulty——本仓死亡路
//   grantStarterKit(inv) 缺省 difficulty=0 同相。
describe('SW-BJ91 旅程难度新角色大礼包（UICharacterCreation.cs:1720-1747 逐槽连排）', () => {
  const J = VI_KEY.JOURNEY;

  it('difficulty=3：九槽连排 + armor[3] 雏鸟翼,stack 逐槽钉死（[5]/[6]=100）', () => {
    const inv = new Inventory();
    grantStarterKit(inv, 3);
    const expectSlot = (i: number, vid: number, stack: number) => {
      expect(inv.slots[i]?.id, `slot ${i} id=vid${vid}`).toBe(VI_ID(vid));
      expect(inv.slots[i]?.stack, `slot ${i} stack`).toBe(stack);
    };
    expectSlot(0, 6, 1);        // Iron Shortsword
    expectSlot(1, 1, 1);        // Iron Pickaxe
    expectSlot(2, 10, 1);       // Iron Axe
    expectSlot(3, 7, 1);        // Iron Hammer
    expectSlot(4, 4281, 1);     // Baby Bird Staff（雏鸟杖）
    expectSlot(5, 8, 100);      // Torch ×100（:1732-1733 stack=100）
    expectSlot(6, 965, 100);    // Rope ×100（:1734-1735）
    expectSlot(7, 50, 1);       // Magic Mirror（:1736 无 stack 赋值=1）
    expectSlot(8, 84, 1);       // Grappling Hook（:1737-1738 无 stack 赋值=1）
    expect(inv.slots[9], '槽 9 起不给（连排至 num=9 止）').toBeNull();
    expect(inv.armor[3]?.id, 'armor[3].SetDefaults(4978)（:1740 首配饰槽）').toBe(VI_ID(4978));
    expect(inv.armor[3]?.stack).toBe(1);
  });

  it('armor 其余位/染料/杂项/ Loadout 零触碰（原版旅程支只动 armor[3]）', () => {
    const inv = new Inventory();
    grantStarterKit(inv, 3);
    for (let i = 0; i < inv.armor.length; i++) {
      if (i === 3) continue;
      expect(inv.armor[i], `armor[${i}]`).toBeNull();
    }
    expect(inv.dye.every((s) => s === null)).toBe(true);
    expect(inv.miscEquips.every((s) => s === null)).toBe(true);
    expect(inv.miscDyes.every((s) => s === null)).toBe(true);
  });

  it('difficulty 0/1/2/缺省 → 经典铜三件（if(difficulty==3) else 结构,armor[3] 不给）', () => {
    for (const d of [0, 1, 2] as const) {
      const inv = new Inventory();
      grantStarterKit(inv, d);
      expect(inv.slots[0]?.id, `difficulty=${d} [0]铜短剑`).toBe(ITEM_BY_KEY[VI_KEY.STARTER.SHORTSWORD]);
      expect(inv.slots[5]).toBeNull();
      expect(inv.armor[3]).toBeNull();
    }
    const inv0 = new Inventory();
    grantStarterKit(inv0);   // 缺省=死亡发还同签名（Player.cs:55010-55015 无条件经典）
    expect(inv0.slots[0]?.id).toBe(ITEM_BY_KEY[VI_KEY.STARTER.SHORTSWORD]);
  });

  it('幂等：旅程授予双跑不叠不乱序（SetDefaults 原地覆盖语义）', () => {
    const inv = new Inventory();
    grantStarterKit(inv, 3);
    // ★X2 快照口径收窄（2026-10-01）:同 BJ390 词缀重掷勘注——幂等锁=槽位放置面
    const snapShape = (inv2: Inventory) =>
      JSON.stringify(inv2.slots.slice(0, 12).map((it) => it && { id: it.id, stack: it.stack }));
    const snap = snapShape(inv);
    grantStarterKit(inv, 3);
    expect(snapShape(inv)).toBe(snap);
    expect(inv.slots[5]?.stack).toBe(100);
  });

  it('key 面锚：JOURNEY 表 vid 反查一致（防 itemKeys 表漂移/未注册空串）', () => {
    for (const vid of [6, 1, 10, 7, 4281, 8, 965, 50, 84, 4978]) {
      expect(VI_KEY.JOURNEY as unknown as Record<string, string>).toBeTruthy();
    }
    expect(ITEM_BY_KEY[J.PICK]).toBe(VI_ID(1));
    expect(ITEM_BY_KEY[J.SHORTSWORD]).toBe(VI_ID(6));
    expect(ITEM_BY_KEY[J.HAMMER]).toBe(VI_ID(7));
    expect(ITEM_BY_KEY[J.AXE]).toBe(VI_ID(10));
    expect(ITEM_BY_KEY[J.FINCH_STAFF]).toBe(VI_ID(4281));
    expect(ITEM_BY_KEY[J.TORCH]).toBe(VI_ID(8));
    expect(ITEM_BY_KEY[J.ROPE]).toBe(VI_ID(965));
    expect(ITEM_BY_KEY[J.MAGIC_MIRROR]).toBe(VI_ID(50));
    expect(ITEM_BY_KEY[J.GRAPPLING_HOOK]).toBe(VI_ID(84));
    expect(ITEM_BY_KEY[J.WINGS]).toBe(VI_ID(4978));
  });

  it('结构锁：Game.ts 旅程支 + 死亡发还保持缺省经典 + mainFlow 两站带 difficulty', () => {
    const src = GAME_SRC();
    expect(src).toContain('export function grantStarterKit(inv: import(\'../items/Inventory\').Inventory, difficulty = 0)');
    expect(src).toMatch(/if \(difficulty === 3\)/);
    expect(src).toContain('grantStarterKit(inv);');                      // 死亡发还=不带 difficulty
    // ★X2 重锚（2026-10-01）:BJ390 开局件 ...starterPrefixOf(wings) 自然词缀掷
    expect(src).toMatch(/inv\.armor\[3\] = \{ id: wings, stack: 1, \.\.\.starterPrefixOf\(wings\) \}/);   // :1740 直置+词缀掷
    const flow = FLOW_SRC();
    expect(flow.match(/grantStarterKit\(g\.player\.inv, /g)?.length).toBe(2);   // 新角色臂+importWld 带参
  });
});
