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

  it('配饰效果：再生手环49 life2 / 星力手环111 mana40(1457 :15040-15046) / 赫尔墨斯靴54 runSpeed6', () => {
    expect(statOfInternal(_iid(49))).toMatchObject({ life: 2, acc: 1 });
    expect(accFxOfInternal(_iid(111))).toMatchObject({ mana: 40 });   // 1457 switch :15040-15046(星力手环族 +20→+40;2026-08-23 基准切换 1457)
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
    p.inv.armor[3] = { id: _iid(54), stack: 1 }; // 赫尔墨斯靴 accRunSpeed=6(冲刺上限;不再折算进移速,2026-08-13)
    expect(p.equipStats.moveMult).toBeCloseTo(1, 5);
    expect(p.equipStats.accRunSpeed).toBe(6);
    p.inv.armor[4] = { id: _iid(49), stack: 1, prefix: 73 }; // Brisk +1% 移速
    expect(p.equipStats.moveMult).toBeCloseTo(1.01, 5);  // runSpeed/3-1 折算已拆(2026-08-13)
    p.inv.armor[4] = { id: _iid(3992), stack: 1 }; // 狂战士手套 meleeSpeed +12%
    expect(p.equipStats.meleeSpeed).toBeCloseTo(0.12, 5);
    // attackSpeedMult = CapAttackSpeeds 倒数档（Player.cs:28555-28574）：1/1.12
    expect(p.attackSpeedMult).toBeCloseTo(1 / 1.12, 5);
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
    // R5-F10：jumpOpts 按原版消费优先序（JumpMovement :20875-20922）排列
    expect(p.equipStats.jumpOpts).toEqual(['Sandstorm', 'Blizzard', 'Cloud']);
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

  it('恐慌项链：damage 触发 panicTime=480(8s) → 移速聚合 +1.0', () => {
    const p = mkPlayer();
    p.hp = 100;
    p.inv.armor[3] = { id: _iid(1290), stack: 1 }; // 恐慌项链
    expect(p.equipStats.moveMult).toBe(1);
    p.damage(10, 0, 0);
    expect(p.panicTime).toBe(480);   // R5-F26：AddBuff(63,480)（Hurt :38524），旧 300 且按秒递减
    expect(p.equipStats.moveMult).toBeCloseTo(2, 5);   // +1.0(:10218 moveSpeed++)
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

  it('三轮行为：翅膀属性/冲刺档/黑带/蜜蜂/飞毯', () => {
    const p = mkPlayer();
    // 恶魔之翼 492：wingSlot 1 → 100t / 6.25 速度（WingStatsInitializer）
    p.inv.armor[3] = { id: _iid(492), stack: 1 };
    // hidden = hideVisibleAccessory 旗（UpdateEquips :12580 隐藏翼门,2026-08-23 批新增字段）
    expect(p.equipStats.wing).toEqual({ logic: 1, slot: 1, time: 100, accSpeed: 6.25, accelMult: 1, hover: false, hidden: false });
    // 忍者大师装备 984：dash 1 + blackBelt
    p.inv.armor[4] = { id: _iid(984), stack: 1 };
    expect(p.equipStats.dash).toBe(1);
    expect(p.equipStats.blackBelt).toBe(true);
    // 克苏鲁护盾 3097：dash 2（冲撞伤害型，取最高档）
    p.inv.armor[5] = { id: _iid(3097), stack: 1 };
    expect(p.equipStats.dash).toBe(2);
    // 蜂窝 1132：bees
    p.inv.armor[6] = { id: _iid(1132), stack: 1 };
    expect(p.equipStats.bees).toBe(true);
    // 飞毯 934：carpet
    p.inv.armor[7] = { id: _iid(934), stack: 1 };
    expect(p.equipStats.carpet).toBe(true);
  });

  it('黑带闪避：damage 有 10% 概率完全闪避（返回 false 且不掉血）', () => {
    const p = mkPlayer();
    p.hp = 100;
    p.inv.armor[3] = { id: _iid(963), stack: 1 }; // Black Belt（963）
    let dodged = 0;
    for (let k = 0; k < 300; k++) {
      p.iframes = 0; p.hp = 100;
      if (!p.damage(10, 0, 0, false)) dodged++;
    }
    // 300 次样本：10% 闪避，容差带宽松防抖动
    expect(dodged).toBeGreaterThan(10);
    expect(dodged).toBeLessThan(80);
  });

  it('五轮字段：天界石复合/蛙腿跳速/十字项链无敌帧/宝藏磁石范围/悠悠球线', () => {
    const p = mkPlayer();
    // 天界石（skyStone 复合 :12558：life+2/def+4/全系伤+10%/全系暴+2%/近战速+10%）
    p.inv.armor[3] = { id: _iid(1865), stack: 1 }; // Celestial Stone 1865
    const st = p.equipStats;
    expect(st.hpPerSec).toBe(1);        // (2)/2
    expect(st.def).toBe(4);
    expect(st.dmgMelee).toBeCloseTo(0.1, 5);
    expect(st.critRanged).toBe(2);
    expect(st.meleeSpeed).toBeCloseTo(0.1, 5);
    p.inv.armor[3] = null;
    // 蛙腿 2423：jumpSpd 1.6
    p.inv.armor[3] = { id: _iid(2423), stack: 1 };
    expect(p.equipStats.jumpSpd).toBe(1.6);
    // 十字项链 554：longInvince → iframes 翻倍
    p.inv.armor[4] = { id: _iid(554), stack: 1 };
    p.hp = 100; p.iframes = 0;
    p.damage(5, 0, 0, false);
    expect(p.iframes).toBe(80); // 40×2
    // 宝藏磁石 5010：grabRangeBonus +150（★2026-08-31 台账批:P.cs:35429-35431+
    // Item.cs:46 treasureGrabRange=150;旧 +94 档退役,金戒指币族项迁
    // getItemGrabRangeBonus 正解位不再全类生效）
    p.inv.armor[5] = { id: _iid(5010), stack: 1 };
    expect(p.grabRangeBonus).toBe(150);
    p.inv.armor[5] = null;
    // 白绳 3306：yoyoString（Item.stringColor>0 通道，Player.cs:14170）
    p.inv.armor[6] = { id: _iid(3306), stack: 1 };
    expect(p.equipStats.yoyoString).toBe(true);
  });
});
