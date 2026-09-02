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
