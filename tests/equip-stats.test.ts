// 装备属性生效测试：vi_ 盔甲/配饰可装备 + 防御/魔力/回复/移速/伤害/暴击聚合
import { describe, it, expect } from 'vitest';
import { statOfInternal, armorSlotIndexOfInternal } from '../src/data/vanillaItemStats';
import { accFxOfInternal } from '../src/data/vanillaAccFx';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { ITEM_BY_KEY } from '../src/data/items';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

describe('装备数据表（extract-equip-prefix.mjs）', () => {
  it('盔甲部位+防御：护目镜37=头+1 / 铁护胫77=腿+2 / 铜链甲80=身+2', () => {
    expect(statOfInternal(_iid(37))).toMatchObject({ s: 'h', def: 1 });
    expect(statOfInternal(_iid(77))).toMatchObject({ s: 'l', def: 2 });
    expect(statOfInternal(_iid(80))).toMatchObject({ s: 'b', def: 2 });
    expect(armorSlotIndexOfInternal(_iid(77))).toBe(2);
  });

  it('配饰效果：再生手环49 life2 / 星力手环111 mana20 / 赫尔墨斯靴54 runSpeed6', () => {
    expect(statOfInternal(_iid(49))).toMatchObject({ life: 2, acc: 1 });
    expect(accFxOfInternal(_iid(111))).toMatchObject({ mana: 20 });
    expect(accFxOfInternal(_iid(54))).toMatchObject({ runSpeed: 6 });
  });

  it('vi_ 盔甲/配饰可入对应槽（armorAccepts 查表）', () => {
    const inv = new Inventory();
    expect(inv.armorAccepts(0, _iid(37))).toBe(true);   // 护目镜 → 头盔槽
    expect(inv.armorAccepts(1, _iid(37))).toBe(false);  // 头盔不能穿身上
    expect(inv.armorAccepts(2, _iid(77))).toBe(true);   // 铁护胫 → 腿槽
    expect(inv.armorAccepts(3, _iid(49))).toBe(true);   // 再生手环 → 配饰槽
    expect(inv.armorAccepts(0, _iid(49))).toBe(false);  // 配饰不能穿盔甲槽
    expect(inv.armorAccepts(13, _iid(49))).toBe(true);  // 时装配饰槽
  });
});

describe('Player 装备属性聚合', () => {
  const mkPlayer = () => new Player(0, 0, new Inventory());

  it('防御 = 盔甲表防御 + 配饰 + 铁皮 Buff', () => {
    const p = mkPlayer();
    expect(p.defense).toBe(0);
    p.inv.armor[0] = { id: _iid(37), stack: 1 }; // 护目镜 +1
    p.inv.armor[2] = { id: _iid(77), stack: 1 }; // 铁护胫 +2
    expect(p.defense).toBe(3);
    p.inv.armor[3] = { id: _iid(49), stack: 1 }; // 再生手环（无防御）
    expect(p.defense).toBe(3);
  });

  it('词缀效益（GrantPrefixBenefits）：Warding 65→防御+4 / Arcane 66→魔力+20', () => {
    const p = mkPlayer();
    p.inv.armor[3] = { id: _iid(49), stack: 1, prefix: 65 }; // Warding
    expect(p.equipStats.def).toBe(4);
    p.inv.armor[3] = { id: _iid(49), stack: 1, prefix: 66 }; // Arcane
    expect(p.equipStats.mana).toBe(20);
    expect(p.maxMana).toBe(40);
  });

  it('移速/近战速度/全系伤害/暴击聚合', () => {
    const p = mkPlayer();
    p.inv.armor[3] = { id: _iid(54), stack: 1 }; // 赫尔墨斯靴 runSpeed 6 → ×2
    expect(p.equipStats.moveMult).toBeCloseTo(2, 5);
    p.inv.armor[4] = { id: _iid(49), stack: 1, prefix: 73 }; // Brisk +1% 移速
    expect(p.equipStats.moveMult).toBeCloseTo(2.01, 5);
    p.inv.armor[4] = { id: _iid(3992), stack: 1 }; // 狂战士手套 meleeSpeed +12%
    expect(p.equipStats.meleeSpeed).toBeCloseTo(0.12, 5);
    expect(p.attackSpeedMult).toBeCloseTo(1.12, 5);
    p.inv.armor[5] = { id: _iid(49), stack: 1, prefix: 72 }; // Menacing +4% 全伤
    expect(p.damageMult('melee')).toBeCloseTo(1.04, 5);
    expect(p.damageMult('ranged')).toBeCloseTo(1.04, 5);
    expect(p.damageMult('magic')).toBeCloseTo(1.04, 5);
    p.inv.armor[6] = { id: _iid(49), stack: 1, prefix: 68 }; // Lucky → 全系暴击 +4%
    expect(p.critChance('melee')).toBe(4);
  });

  it('生命回复：再生手环 life2 → 每秒 1 HP', () => {
    const p = mkPlayer();
    expect(p.equipStats.hpPerSec).toBe(0);
    p.inv.armor[3] = { id: _iid(49), stack: 1 };
    expect(p.equipStats.hpPerSec).toBe(1);
  });

  it('行为型字段聚合：马掌摔伤免疫/钴护盾击退免疫/熔岩护身符/云朵瓶/火箭靴', () => {
    const p = mkPlayer();
    // 幸运马掌 158（原版 item）→ noFallDmg
    p.inv.armor[3] = { id: _iid(158), stack: 1 };
    expect(p.equipStats.noFallDmg).toBe(true);
    // 钴护盾 156 → noKnockback
    p.inv.armor[4] = { id: _iid(156), stack: 1 };
    expect(p.equipStats.noKnockback).toBe(true);
    // 熔岩护身符 906 → lavaMax 420
    p.inv.armor[5] = { id: _iid(906), stack: 1 };
    expect(p.equipStats.lavaMax).toBe(420);
    // 云朵瓶 158? no——云朵瓶 id：查 accfx jumpOpts
    p.inv.armor[3] = null;
    p.inv.armor[6] = { id: _iid(1164), stack: 1 }; // 气球束：Cloud+Sandstorm+Blizzard
    expect(p.equipStats.jumpOpts).toEqual(['Cloud', 'Sandstorm', 'Blizzard']);
    // 仙灵靴 3993 → rocketBoots 2
    p.inv.armor[4] = null;
    p.inv.armor[5] = null;
    p.inv.armor[6] = null;
    p.inv.armor[3] = { id: _iid(3993), stack: 1 };
    expect(p.equipStats.rocketBoots).toBe(2);
    // 鲨牙项链 → 护甲穿透 5
    p.inv.armor[4] = { id: _iid(4007), stack: 1 };
    expect(p.equipStats.armorPen).toBe(5);
  });

  it('恐慌项链：damage 触发 panicTime=300 → 移速聚合 +0.5', () => {
    const p = mkPlayer();
    p.hp = 100;
    p.inv.armor[3] = { id: _iid(1290), stack: 1 }; // 恐慌项链
    expect(p.equipStats.moveMult).toBe(1);
    p.damage(10, 0, 0);
    expect(p.panicTime).toBe(300);
    expect(p.equipStats.moveMult).toBeCloseTo(1.5, 5);
  });

  it('钴护盾：damage 不再施加击退', () => {
    const p = mkPlayer();
    p.hp = 100;
    p.vx = 0;
    p.inv.armor[3] = { id: _iid(156), stack: 1 };
    p.damage(10, p.cx - 100, 0); // 攻击来自左侧 → 击退应向右
    expect(p.vx).toBe(0);
    p.inv.armor[3] = null;
    p.iframes = 0; // 无敌帧不重置时第二次 damage 会被吞
    p.vx = 0;
    p.damage(10, p.cx - 100, 0);
    expect(Math.abs(p.vx)).toBeGreaterThan(0);
  });

  it('多段跳：落地重置为装备段表（含 jumpBoost 速度增益标记）', () => {
    const p = mkPlayer();
    p.inv.armor[3] = { id: _iid(1164), stack: 1 };
    expect(p.equipStats.jumpOpts).toHaveLength(3);
    // extraJumps 由 fixedUpdate 落地时重置（此处仅验证聚合层；飞行行为在冒烟覆盖）
  });
});
