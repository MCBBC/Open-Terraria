// 弹幕染料四通道闸门（清偿刀 N 2026-09-30）——GetProjectileDesiredShader 1:1。
// 原版锚（Terarria1457 唯一标杆）：
//   · Main.GetProjectileDesiredShader（Main.cs:22428-22470）优先序（后写胜）：
//     minion→cMinion / projHook(aiStyle7)→cGrapple / projPet∧!minion∧dmg0∧!LightPet→cPet
//     / !minion∧dmg0∧LightPet→cLight / switch{623,1020,1105→cPet; 818→cMinion}
//   · Player.UpdateDyes（Player.cs:9667-9692）逐槽亲读：cPet=miscDyes[0] / cLight=
//     miscDyes[1] / cGrapple=miscDyes[4]（cMinecart=[2]/cMount=[3] 不在弹幕域）
//   · cMinion 唯一源=UpdateItemDye（Player.cs:9832-9834）armorItem 4762 CritterShampoo
//     → 配对染料槽 getEffectiveDye(i%10)（配饰 3-9/时装 13-19 同槽对,时装后扫胜出）
//   · 消费面（各实体 draw 经 src/data/projDye.dyedProjCanvas=EntitySpriteDraw×
//     Armor.Apply 等价）：DroneProjs（1020 白带档 DrawContinuousTrail :28300-28303 +
//     本体）/PetFollower（cPet/cLight）/MinionProj（cMinion/623→cPet/818→cMinion）/
//     GrappleProj（cGrapple）
// 测试域=纯逻辑（表/解析器/通道/SM2 色值钉）;canvas 烘焙面（dyedProjCanvas/
// dyedSolidBand）由浏览器探针覆盖（game/docs/evidence/proj-dye/）。
import { describe, it, expect } from 'vitest';
import { PROJ_PET, PROJ_LIGHT_PET, CRITTER_SHAMPOO, dyeChannelsOf, getProjDesiredDyeVid,
  type DyeInvSource } from '../src/data/projDye';
import { dyeApplyOf, applyDyePass, dyeCount } from '../src/data/vanillaDyes';
import { ITEM_DEFS } from '../src/data/items';

/** 内部 id → vid 反查（测试域内本地实现,不依赖 itemKeys 双注册语义） */
function iidOfVid(vid: number): number {
  for (let i = 1; i < ITEM_DEFS.length; i++) {
    if (ITEM_DEFS[i]?.vid === vid) return i;
  }
  return -1;
}

/** 通道 fixture：染料 vid → InvItem 形（{id}）;染料未入库 → null */
function dyeItem(vid: number): { id: number } | null {
  const id = iidOfVid(vid);
  return id > 0 ? { id } : null;
}

/** Inventory 窄接口 fixture（miscDyes/armor/isItemSlotUnlockedAndUsable/getEffectiveDye） */
function fixtureInv(o: {
  miscDyes?: Array<number | 0>;            // vid,0=空
  shampooSlot?: number;                    // 4762 所在 armor 槽（-1=无）
  shampooDyeSlot?: number;                 // 配对染料槽染料 vid（0=无）
  dyeSlots?: Record<number, number>;       // dye[slot]=vid
}): DyeInvSource {
  const miscDyes = Array.from({ length: 5 }, (_, i) => {
    const v = o.miscDyes?.[i] ?? 0;
    return v > 0 ? dyeItem(v) : null;
  });
  const armor: Array<{ id: number } | null> = Array(20).fill(null);
  if ((o.shampooSlot ?? -1) >= 0) {
    const id = iidOfVid(CRITTER_SHAMPOO);
    if (id > 0) armor[o.shampooSlot as number] = { id };
  }
  const dye: Array<{ id: number } | null> = Array(10).fill(null);
  for (const [k, v] of Object.entries(o.dyeSlots ?? {})) {
    const it = dyeItem(v);
    if (it) dye[Number(k)] = it;
  }
  if ((o.shampooDyeSlot ?? 0) > 0) {
    const it = dyeItem(o.shampooDyeSlot as number);
    if (it) dye[(o.shampooSlot ?? 0) % 10] = it;
  }
  return {
    miscDyes,
    armor,
    isItemSlotUnlockedAndUsable: (i: number) => i !== 8 && i !== 9,   // 恶魔心/大师水晶槽锁
    getEffectiveDye: (slot: number) => dye[slot] ?? null,
  };
}

describe('弹幕染料主表（反编译照录）', () => {
  it('projPet 全表 125 项（Main.cs:8867-8989）', () => {
    expect(PROJ_PET.size).toBe(125);
    // 逐位锚（头/尾/双表交集/switch 族抽样）
    for (const id of [111, 266, 313, 492, 533, 623, 625, 755, 833, 891, 895, 1022, 1093, 1096]) {
      expect(PROJ_PET.has(id), `projPet[${id}]`).toBe(true);
    }
    for (const id of [1, 2, 14, 25, 643, 663, 677, 818, 1020, 1105]) {
      expect(PROJ_PET.has(id), `!projPet[${id}]`).toBe(false);
    }
  });
  it('LightPet 集 12 项（ProjectileID.cs:389 CreateBoolSet）', () => {
    expect(PROJ_LIGHT_PET.size).toBe(12);
    for (const id of [18, 500, 72, 87, 86, 211, 492, 650, 702, 891, 896, 895]) {
      expect(PROJ_LIGHT_PET.has(id)).toBe(true);
    }
    expect(PROJ_LIGHT_PET.has(111)).toBe(false);
  });
});

describe('GetProjectileDesiredShader 族判定 1:1（Main.cs:22428-22470）', () => {
  const CH = { cPet: 1007, cLight: 1015, cGrapple: 1013, cMinion: 1008 };
  const q = (vid: number, o: { minion?: boolean; damage?: number; aiStyle?: number } = {}) =>
    getProjDesiredDyeVid({ vid, minion: o.minion ?? false, damage: o.damage ?? 0, aiStyle: o.aiStyle }, CH);

  it('① minion → cMinion（266 宝宝史莱姆:minion=true SetDefaults P.cs:3518-3529）', () => {
    expect(q(266, { minion: true })).toBe(CH.cMinion);
    expect(q(266)).toBe(CH.cPet);              // 数据 minion=false 时走 projPet 支（dmg0）
  });
  it('② projHook（aiStyle==7）→ cGrapple（Main.cs:6755-6763 派生）', () => {
    expect(q(13, { aiStyle: 7 })).toBe(CH.cGrapple);
  });
  it('③ projPet∧dmg0∧!LightPet → cPet（111 可疑眼球）', () => {
    expect(q(111)).toBe(CH.cPet);
    expect(q(111, { damage: 5 })).toBe(0);     // damage>0 出 projPet 支=无染
  });
  it('④ LightPet∧dmg0 → cLight;双表交集（211/492/702/891/895/896）不被 cPet 捕获', () => {
    expect(q(18)).toBe(CH.cLight);
    expect(q(211)).toBe(CH.cLight);            // projPet∪LightPet → light 支后写胜
    expect(q(895)).toBe(CH.cLight);
  });
  it('⑤ switch 覆写：623/1020/1105 → cPet（1105 非 projPet,纯 switch 面）;623 minion=true 仍 cPet', () => {
    expect(q(1105)).toBe(CH.cPet);
    expect(q(1020)).toBe(CH.cPet);
    expect(q(623, { minion: true })).toBe(CH.cPet);   // switch 在 minion 支【后】写
  });
  it('⑤' + ' switch 覆写：818 → cMinion（白虎扑击弹,damage>0 仍命中——switch 无 damage 门）', () => {
    expect(q(818, { damage: 25 })).toBe(CH.cMinion);
  });
  it('哨兵/武器族零通道（663 爆炸烈焰塔 minion=false 数据面;781 武器弹）', () => {
    expect(q(663, { aiStyle: 130 })).toBe(0);
    expect(q(781, { damage: 12, aiStyle: 1 })).toBe(0);
  });
  it('通道全 0 → 恒 0（fail-open 同相:vanilla .dye=0 → Apply pass0 恒等）', () => {
    const ZERO = { cPet: 0, cLight: 0, cGrapple: 0, cMinion: 0 };
    for (const vid of [111, 18, 266, 818, 1020]) {
      expect(getProjDesiredDyeVid({ vid, minion: false, damage: 0, aiStyle: 7 }, ZERO)).toBe(0);
    }
  });
});

describe('miscDyes 槽位接线（Player.UpdateDyes Player.cs:9667-9692 逐槽亲读）', () => {
  it('cPet=miscDyes[0] / cLight=miscDyes[1] / cGrapple=miscDyes[4]（非简报存疑映射）', () => {
    const ch = dyeChannelsOf(fixtureInv({ miscDyes: [1007, 1015, 0, 0, 1013] }));
    expect(ch.cPet).toBe(1007);
    expect(ch.cLight).toBe(1015);
    expect(ch.cGrapple).toBe(1013);
    expect(ch.cMinion).toBe(0);
  });
  it('空槽 → 0（.dye 零链同相）', () => {
    const ch = dyeChannelsOf(fixtureInv({}));
    expect(ch).toEqual({ cPet: 0, cLight: 0, cGrapple: 0, cMinion: 0 });
  });
  it('cMinion=CritterShampoo 链：armor[5]=4762 + dye[5] → cMinion（Player.cs:9832-9834）', () => {
    const ch = dyeChannelsOf(fixtureInv({ shampooSlot: 5, shampooDyeSlot: 1009 }));
    expect(ch.cMinion).toBe(1009);
    expect(ch.cPet).toBe(0);                   // miscDyes[0] 空不串道
  });
  it('时装槽 13-19 同槽对（i%10）：armor[13]=4762 → dye[3];配饰槽 5 → dye[5]', () => {
    // vanity 13 → i%10=3（GetEffectiveDye(num) 同参,Player.cs:9693-9697）
    expect(dyeChannelsOf(fixtureInv({ shampooSlot: 13, dyeSlots: { 3: 1010 } })).cMinion).toBe(1010);
    // equip 5 → i%10=5
    expect(dyeChannelsOf(fixtureInv({ shampooSlot: 5, dyeSlots: { 5: 1011 } })).cMinion).toBe(1011);
  });
  it('锁槽跳过（IsItemSlotUnlockedAndUsable 门——8 号恶魔心/9 号大师水晶位）', () => {
    const ch = dyeChannelsOf(fixtureInv({ shampooSlot: 8, shampooDyeSlot: 1009 }));
    expect(ch.cMinion).toBe(0);                // 槽 8 锁 → UpdateItemDye 不跑=原版同相
  });
});

describe('染料仿真链复用（dyeApplyOf/applyDyePass——弹幕消费面同源）', () => {
  it('染料表容量（116 条 1:1 提取;探测回归保护）', () => {
    expect(dyeCount()).toBeGreaterThanOrEqual(116);
  });
  it('红染 1007 → ArmorColored uColor=(1,0,0) sat=1.2（DyeInitializer.LoadBasicColorDyes :1007 首条）', () => {
    const a = dyeApplyOf(1007);
    expect(a).not.toBeNull();
    expect(a!.tech).toBe('ArmorColored');
    expect(a!.uniforms.uColor).toEqual([1, 0, 0]);
    expect(a!.uniforms.uSaturation).toBeCloseTo(1.2, 5);
  });
  it('白像素过红染 pass → 染后色值钉（SM2 字节码逐指令;1020 白带档同式）', () => {
    const a = dyeApplyOf(1007)!;
    // ★钉值=解释器输出（字节码=唯一真值,反伪影纪律:禁手推公式——sat=1.2 的
    //   ArmorColored 对纯白输入输出 g/b=234 而非 0,naive「mix(lum,color,sat)」
    //   推导不命中,正是「先定谳再动刀」的教科书反例）。冻结基线=回归闸门。
    const data = new Uint8ClampedArray([255, 255, 255, 255]);
    applyDyePass(data, 1, 1, a, [], { sx: 0, sy: 0, sheetW: 1, sheetH: 1 });
    expect([data[0], data[1], data[2], data[3]]).toEqual([255, 234, 234, 255]);
  });
  it('通道 vid → dyeApplyOf 在库性（弹幕四通道全表面）', () => {
    for (const vid of [1007, 1015, 1013, 1008]) {
      expect(dyeApplyOf(vid), `dye ${vid}`).not.toBeNull();
    }
  });
});
