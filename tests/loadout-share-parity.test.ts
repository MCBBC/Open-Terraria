// LoadoutShare（收藏跨配装共享，1457 Player.cs:5679-5758）回归：
// 机制面防叠加三律 + effectiveSharedFrom（幽灵/tooltip 代打数据源，R4-15 补绘批）
// 用户报"切配装后对应格子还是空的，可以叠加多重装备"——定谳：机制原版本就防叠加
// （worn 非空恒胜出、同槽收藏唯一、往返零复制），欠的是槽面幽灵/角标/悬停代打。
import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';

const iid = (vid: number) => {
  const k = vanillaItemKey(vid);
  expect(k, `vid ${vid}`).toBeDefined();
  return ITEM_BY_KEY[k!];
};

/** 全域物品普查（worn armor+dye + 三 loadout 仓）：同 id 计数（防复制/防凭空多出） */
function census(inv: Inventory): Map<number, number> {
  const m = new Map<number, number>();
  const add = (it: { id: number } | null) => {
    if (!it) return;
    m.set(it.id, (m.get(it.id) ?? 0) + 1);
  };
  inv.armor.forEach(add);
  inv.dye.forEach(add);
  for (const lo of inv.loadouts) { lo.armor.forEach(add); lo.dye.forEach(add); }
  return m;
}

describe('LoadoutShare 机制三律（GetEffectiveArmor/GetEffectiveDye 1:1）', () => {
  it('共享件切仓后对空槽仍生效；同槽再装=置换不叠加；往返切换零复制', () => {
    const inv = new Inventory();
    const ironHelm = iid(90);   // 铁头盔（armor[0]，vid 4=铁阔剑勿混）
    const wings = iid(492);     // 天使翅膀（配饰段）

    // L0：穿铁头盔 + 翅膀，Alt 收藏（=共享源）
    inv.armor[0] = { id: ironHelm, stack: 1, favorited: true };
    inv.armor[3] = { id: wings, stack: 1, favorited: true };
    expect(inv.getEffectiveArmor(0)?.id).toBe(ironHelm);
    expect(inv.getEffectiveArmor(3)?.id).toBe(wings);

    // 切到空仓 L1：worn 全空；共享件对空槽继续生效（Ghost/tooltip 代打的数据态）
    inv.trySwitchingLoadout(1);
    expect(inv.armor[0]).toBeNull();
    expect(inv.armor[3]).toBeNull();
    expect(inv.getEffectiveArmor(0)?.id).toBe(ironHelm);
    expect(inv.getEffectiveArmor(3)?.id).toBe(wings);
    expect(inv.effectiveSharedFrom(0, false)).toBe(0);
    expect(inv.effectiveSharedFrom(3, false)).toBe(0);

    // 空槽再装第二副本：worn 非空恒胜出（原版防叠加核心），共享件被置换
    inv.armor[0] = { id: ironHelm, stack: 1 };
    inv.armor[3] = { id: wings, stack: 1 };
    expect(inv.effectiveSharedFrom(0, false)).toBeNull();
    expect(inv.effectiveSharedFrom(3, false)).toBeNull();
    expect(census(inv).get(ironHelm)).toBe(2);   // L0 仓 1 + worn 1，无凭空多出

    // 往返切换：各仓各存其套，零复制
    inv.trySwitchingLoadout(0);
    expect(inv.armor[0]?.favorited).toBe(true);          // 原共享套回身
    expect(inv.loadouts[1].armor[3]?.id).toBe(wings);    // 第二套入 L1 仓
    inv.trySwitchingLoadout(1);
    expect(inv.getEffectiveArmor(0)?.id).toBe(ironHelm); // L0 共享件对空槽再生效
    const c = census(inv);
    expect(c.get(ironHelm)).toBe(2);
    expect(c.get(wings)).toBe(2);
  });

  it('同槽跨仓收藏唯一（ClearSlotShareInOtherLoadouts :863-884 语义在 UI 侧）：唯一共享源', () => {
    const inv = new Inventory();
    const wings = iid(492);
    // 模拟 UI 侧 ToggleLoadoutShare 全链：worn 收藏 → 清三仓同槽收藏
    const toggleShare = () => {
      const cur = inv.armor[3]!;
      cur.favorited = !cur.favorited;
      if (cur.favorited) for (const lo of inv.loadouts) { const b = lo.armor[3]; if (b) b.favorited = false; }
    };
    inv.armor[3] = { id: wings, stack: 1 };
    toggleShare();
    inv.loadouts[2].armor[3] = { id: wings, stack: 1, favorited: true };  // 旧残留(另一仓同槽副翼)
    toggleShare(); toggleShare();   // OFF→ON：第二次收藏触发 ClearSlotShareInOtherLoadouts
    expect(inv.loadouts[2].armor[3]?.favorited).toBe(false);
    inv.trySwitchingLoadout(1);     // 切空仓（L1 槽空）
    expect(inv.effectiveSharedFrom(3, false)).toBe(0);   // 唯一源=L0
    expect(inv.getEffectiveArmor(3)?.id).toBe(wings);
  });

  it('armorAccepts 槽型门拒 → 共享链 break（GetEffectiveArmor :5688-5691），非空槽位不代打', () => {
    const inv = new Inventory();
    inv.loadouts[0].armor[0] = { id: iid(90), stack: 1, favorited: true };   // 铁头盔藏 L0
    inv.armor[0] = null;
    inv.currentLoadout = 1;
    expect(inv.getEffectiveArmor(0)?.id).toBe(iid(90));   // 槽型兼容 → 共享
    // 换成不兼容件（胸甲藏头盔槽）→ break 不共享
    inv.loadouts[0].armor[0] = { id: iid(81), stack: 1, favorited: true };   // 铁链甲=胸部位
    expect(inv.getEffectiveArmor(0)).toBeNull();
    expect(inv.effectiveSharedFrom(0, false)).toBeNull();
  });

  it('存档往返：收藏标记（共享源数据）worn+loadout 双侧保留，读回共享仍生效', async () => {
    const { World } = await import('../src/world/World');
    const { Player } = await import('../src/entities/Player');
    const { saveGame, loadSave } = await import('../src/save/SaveFile');
    const w = new World(60, 40, 42, 'lo-share-test');
    const p = new Player(100, 100, new Inventory());
    p.inv.armor[0] = { id: iid(90), stack: 1, favorited: true };            // 身上共享源
    p.inv.loadouts[0].armor[3] = { id: iid(492), stack: 1, favorited: true }; // 仓内共享源
    p.inv.currentLoadout = 1;
    const { player } = loadSave(saveGame(w, p, 0));
    expect(player.loadouts?.[0].armor[3]?.favorited).toBe(true);
    expect(player.armor?.[0]?.favorited).toBe(true);
    // 回填后共享语义不灭（mainFlow 回填 {...it} 浅克隆保留 favorited）
    const inv2 = new Inventory();
    inv2.armor = player.armor!.map((it) => it ? { ...it } : null);
    inv2.loadouts = player.loadouts!.map((l) => ({
      armor: l.armor.map((it) => it ? { ...it } : null),
      dye: l.dye.map((it) => it ? { ...it } : null),
      hide: l.hide ? [...l.hide] : Array(10).fill(false),
    }));
    inv2.currentLoadout = player.currentLoadout ?? 0;
    expect(inv2.getEffectiveArmor(3)?.id).toBe(iid(492));
    expect(inv2.effectiveSharedFrom(3, false)).toBe(0);
  });

  it('misc 族收藏偏离清零（R4-15③）：sanitizeEquipStacks 剥旧档残留,甲/仓收藏不动', () => {
    const inv = new Inventory();
    inv.miscEquips[0] = { id: iid(1169), stack: 1, favorited: true };   // 宠物(旧档残留)
    inv.miscDyes[2] = { id: iid(1007), stack: 1, favorited: true };     // 杂项染料(残留)
    inv.armor[0] = { id: iid(90), stack: 1, favorited: true };          // 共享源,勿动
    inv.loadouts[1].armor[3] = { id: iid(492), stack: 1, favorited: true }; // 共享源,勿动
    Inventory.sanitizeEquipStacks(inv);
    expect(inv.miscEquips[0]?.favorited).toBe(false);
    expect(inv.miscDyes[2]?.favorited).toBe(false);
    expect(inv.armor[0]?.favorited).toBe(true);
    expect(inv.loadouts[1].armor[3]?.favorited).toBe(true);
  });
});

// ★W3 清偿刀（2026-10-01,R4-19 登记残面收口）：CanShareArmor 第二段=低位空槽
// 逐槽配对扫（1457 Player.cs:5712-5732）。定谳：shareItem 入位后,低位【空】槽的
// 收藏件将经 GetEffectiveArmor 一并共享入位（两件同时在场）→ 须过
// CanEquipBothAccessories 配对（同款/双翅/互斥组;vanity=shareItem 半段）,冲突拒;
// 低位【被占】continue;首配饰槽 3/13 与部位槽不进扫;首个收藏件定谳。
describe('CanShareArmor 第二段：低位空槽逐槽配对扫（Player.cs:5712-5732）', () => {
  // itemstats 定谳：492/493=双翅（wing:1/2）,3580=开发者翅（wing:33）,899=无翅配饰
  const wingA = 492, wingB = 493, devWing = 3580, plain = 899;

  it('功能段：低位 3 空槽收藏翅 + 共享异翅入 4 → 双翅配对冲突拒（:5713-5731）', () => {
    const inv = new Inventory();
    inv.loadouts[1].armor[3] = { id: iid(wingA), stack: 1, favorited: true };
    inv.loadouts[1].armor[4] = { id: iid(wingB), stack: 1, favorited: true };
    // worn 全空（新 Inventory）→ 3/4 双双待共享
    expect(inv.getEffectiveArmor(3)?.id).toBe(iid(wingA));   // 首配饰槽 3 不进扫（3%10=3）→ 放行
    expect(inv.getEffectiveArmor(4)).toBeNull();             // 低位 3 空槽有收藏翅 → 拒
    expect(inv.effectiveSharedFrom(4, false)).toBeNull();
    expect(inv.effectiveSharedFrom(3, false)).toBe(1);
  });

  it('低位被占 → continue 无配对面（:5716-5719）,异翅共享放行（防过拒回归）', () => {
    const inv = new Inventory();
    inv.loadouts[1].armor[3] = { id: iid(wingA), stack: 1, favorited: true };
    inv.loadouts[1].armor[4] = { id: iid(wingB), stack: 1, favorited: true };
    inv.armor[3] = { id: iid(plain), stack: 1 };   // 功能 3 worn 被占（无翅,与翅兼容）
    expect(inv.getEffectiveArmor(4)?.id).toBe(iid(wingB));   // 3 被占=该位无共享 → 放行
    expect(inv.effectiveSharedFrom(4, false)).toBe(1);
  });

  it('同款臂跨位配对（非翅件）：低位 3 收藏件与共享件同款 → 拒（:3462-3464）', () => {
    const inv = new Inventory();
    inv.loadouts[2].armor[3] = { id: iid(plain), stack: 1, favorited: true };
    inv.loadouts[2].armor[4] = { id: iid(plain), stack: 1, favorited: true };
    expect(inv.getEffectiveArmor(3)?.id).toBe(iid(plain));   // 3 放行
    expect(inv.getEffectiveArmor(4)).toBeNull();             // 4 与低位 3 收藏同款 → 拒
  });

  it('时装段（:5712 vanity=shareItem 半段）：双普通翅拒,普通翅×3580 例外放行（:3465-3473）', () => {
    // 拒面：低位 13 收藏普通翅 A,共享普通翅 B 入 15（社交段无例外臂适用）
    const inv1 = new Inventory();
    inv1.loadouts[0].armor[13] = { id: iid(wingA), stack: 1, favorited: true };
    inv1.loadouts[0].armor[15] = { id: iid(wingB), stack: 1, favorited: true };
    expect(inv1.getEffectiveArmor(15)).toBeNull();
    expect(inv1.effectiveSharedFrom(15, false)).toBeNull();
    // 放行面：低位 13 收藏 3580（开发者翅）,共享普通翅入 15——社交段例外臂
    const inv2 = new Inventory();
    inv2.loadouts[0].armor[13] = { id: iid(devWing), stack: 1, favorited: true };
    inv2.loadouts[0].armor[15] = { id: iid(wingB), stack: 1, favorited: true };
    expect(inv2.getEffectiveArmor(15)?.id).toBe(iid(wingB));
    expect(inv2.effectiveSharedFrom(15, false)).toBe(0);
  });

  it('低位首个收藏件定谳（:5720-5731 break/return,后续 Loadout 不再看）', () => {
    const inv = new Inventory();
    inv.loadouts[0].armor[3] = { id: iid(wingA), stack: 1, favorited: true };   // 首个=冲突件
    inv.loadouts[1].armor[3] = { id: iid(plain), stack: 1, favorited: true };   // 后仓兼容件不看
    inv.loadouts[0].armor[4] = { id: iid(wingB), stack: 1, favorited: true };
    expect(inv.getEffectiveArmor(4)).toBeNull();   // L0 翅定谳拒（即便 L1 有兼容件）
  });

  it('部位槽/首时装槽不进扫（slot%10<=3）：盔甲 0-2 与时装 13 共享不受配对扫约束', () => {
    const inv = new Inventory();
    inv.loadouts[0].armor[0] = { id: iid(90), stack: 1, favorited: true };    // 铁头盔
    inv.loadouts[0].armor[13] = { id: iid(wingA), stack: 1, favorited: true };
    inv.loadouts[0].armor[14] = { id: iid(wingB), stack: 1, favorited: true };
    expect(inv.getEffectiveArmor(0)?.id).toBe(iid(90));       // 部位槽只过第一门
    expect(inv.getEffectiveArmor(13)?.id).toBe(iid(wingA));   // 13 不进扫（13%10=3）→ 放行
    expect(inv.getEffectiveArmor(14)).toBeNull();             // 14 进扫,低位 13 收藏异翅 → 拒
  });
});
