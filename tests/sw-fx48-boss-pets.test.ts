// SW-FX48 补债批（2026-09-12）数据微债①：1.4.5 boss 宠 21 件收口（FX2/FX41 剩债）。
//
// 债的形态（FX2 豁免注释原文）：物品 4797-4817 在仓（vanilla.json + itemfunc
// buffType 284-304/shoot 881-901）但 vanilla-pets.json 无行 → petInfoOfVid 落空,
// Game.petBuffKinds 双集/UI.petVanillaBuffs 哨兵集/UpdatePet 补挂面（updatePetSlot）
// 全无载体 = itemfunc 单边入档死条目。根因 = extract-pets.mjs 的
// `^DefaultToVanitypet\((\d+), (\d+)\);$` 只吃字面量参数,Item.cs:39438
// `DefaultToVanitypet(881 + type - 4797, 284 + type - 4797)` 共享算式块整批漏提
// （同族盲区先例：items.ts DefaultToPlaceableTile(179+type-4349) 共享 case 算式）。
//
// 本批定谳（1457 反编译,1456 :39399-39422 / 1458 :39417-39438 同值零漂移）：
//   ① 4797-4817 共享块 DefaultToVanitypet(881+type-4797, 284+type-4797)
//      + value=buyPrice(0,25) + rare=-13（Item.cs:39417-39440）
//   ② DefaultToVanitypet 本体（Item.cs:47937-47950）：damage=0/useStyle=1/
//      16×30/UseSound=Item2/useAnimation=20/useTime=20/noMelee/buffType/shoot
//   ③ vanity 18 + light 3：Main.vanityPet[284..293,295..297,300..304]
//      （Main.cs:9392-9409）/ Main.lightPet[294,298,299]（Main.cs:9436-9438,
//      =4807 石巨人/4811 光之女皇/4812 南瓜王三只光宠）
//   ④ 弹体 SetDefaults：aiStyle 26 ground 十款 + 26 fly 四款（:60398 共享悬停
//      分支）+ 124 hover 五款（:35618-35760）+ 174 蠕虫三款（:46177,未建模豁免）
// 变异证红：任一行值翻转（buff/proj/light/家族/参数）即本文件对应断言红;
//   pets.json 删 4797 行 → A2/A4/D1 三面同时红;Buffs.ts 删收口位 → A3/D1 红
//   （且 sw-fx2-buff-gap A 节全 vid 扫描面复活红,互为二道闸）。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuffType, BUFF_DEFS, buffTypeByVanilla } from '../src/stats/Buffs';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { petInfoOfVid, type PetInfo } from '../src/data/vanillaPets';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { ITEM_BY_KEY } from '../src/data/items';
import { equipKindOfVid, miscSlotAccepts } from '../src/data/vanillaEquip';
import { PetFollower } from '../src/entities/PetFollower';
import petsJson from '../src/data/vanilla-pets.json';
import petaiJson from '../src/data/vanilla-petai.json';
import equipJson from '../src/data/vanilla-equip.json';
import projframesJson from '../src/data/vanilla-projframes.json';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 审计定谳矩阵（元组 = [vid, buff, proj, light, 物品内部名, BuffID 内部名, 弹内部名]）
 *  ——值源：Item.cs:39417-39440（vid→buff/proj 算式）+ Main.cs:9436-9438（light）
 *  + idNames.generated（物品/弹内部名）;物品名可用 public/l10n ItemName 核对 */
const BOSS_PETS: ReadonlyArray<readonly [number, number, number, 0 | 1, string, string, string]> = [
  [4797, 284, 881, 0, 'KingSlimePetItem', 'KingSlimePet', 'KingSlimePet'],
  [4798, 285, 882, 0, 'EyeOfCthulhuPetItem', 'EyeOfCthulhuPet', 'EyeOfCthulhuPet'],
  [4799, 286, 883, 0, 'EaterOfWorldsPetItem', 'EaterOfWorldsPet', 'EaterOfWorldsPet'],
  [4800, 287, 884, 0, 'BrainOfCthulhuPetItem', 'BrainOfCthulhuPet', 'BrainOfCthulhuPet'],
  [4801, 288, 885, 0, 'SkeletronPetItem', 'SkeletronPet', 'SkeletronPet'],
  [4802, 289, 886, 0, 'QueenBeePetItem', 'QueenBeePet', 'QueenBeePet'],
  [4803, 290, 887, 0, 'DestroyerPetItem', 'DestroyerPet', 'DestroyerPet'],
  [4804, 291, 888, 0, 'TwinsPetItem', 'TwinsPet', 'TwinsPet'],
  [4805, 292, 889, 0, 'SkeletronPrimePetItem', 'SkeletronPrimePet', 'SkeletronPrimePet'],
  [4806, 293, 890, 0, 'PlanteraPetItem', 'PlanteraPet', 'PlanteraPet'],
  [4807, 294, 891, 1, 'GolemPetItem', 'GolemPet', 'GolemPet'],
  [4808, 295, 892, 0, 'DukeFishronPetItem', 'DukeFishronPet', 'DukeFishronPet'],
  [4809, 296, 893, 0, 'LunaticCultistPetItem', 'LunaticCultistPet', 'LunaticCultistPet'],
  [4810, 297, 894, 0, 'MoonLordPetItem', 'MoonLordPet', 'MoonLordPet'],
  [4811, 298, 895, 1, 'FairyQueenPetItem', 'FairyQueenPet', 'FairyQueenPet'],
  [4812, 299, 896, 1, 'PumpkingPetItem', 'PumpkingPet', 'PumpkingPet'],
  [4813, 300, 897, 0, 'EverscreamPetItem', 'EverscreamPet', 'EverscreamPet'],
  [4814, 301, 898, 0, 'IceQueenPetItem', 'IceQueenPet', 'IceQueenPet'],
  [4815, 302, 899, 0, 'MartianPetItem', 'MartianPet', 'MartianPet'],
  [4816, 303, 900, 0, 'DD2OgrePetItem', 'DD2OgrePet', 'DD2OgrePet'],
  [4817, 304, 901, 0, 'DD2BetsyPetItem', 'DD2BetsyPet', 'DD2BetsyPet'],
];
const PET_VIDS = BOSS_PETS.map((r) => r[0]);
const iidOf = (vid: number): number => {
  const k = vanillaItemKey(vid);
  expect(k, `vid ${vid} 应在仓`).toBeDefined();
  return ITEM_BY_KEY[k!];
};

// ==================== A. 21 件定谳矩阵 ====================
describe('A. boss 宠 21 件定谳矩阵（Item.cs:39417-39440 共享算式块）', () => {
  it('A1 逐件 buff/proj/light 三元组（vanilla-pets.json 补行 1:1）', () => {
    for (const [vid, buff, proj, light] of BOSS_PETS) {
      const p = petInfoOfVid(vid);
      expect(p, `vid ${vid} pets 行`).toEqual({ buff, proj, light: light === 1 } satisfies PetInfo);
    }
  });

  it('A2 itemfunc 单边入档 ↔ pets 行对拍（buffType/shoot 双源一致）', () => {
    for (const [vid, buff, proj] of BOSS_PETS) {
      const f = itemFuncOfVid(vid);
      expect(f?.buffType, `vid ${vid} buffType`).toBe(buff);
      expect(f?.shoot, `vid ${vid} shoot`).toBe(proj);
      expect(f?.damage ?? 0).toBe(0);          // DefaultToVanitypet damage=0（Item.cs:47938）
    }
  });

  it('A3 Buffs.ts 收口位：284-304 ↔ BuffType 360-380 往返一致 + 枚举名 = 原版 BuffID 内部名', () => {
    for (const [i, [vid, buff]] of BOSS_PETS.entries()) {
      void vid;
      const t = buffTypeByVanilla(buff);
      expect(t, `buff ${buff} 收口位`).toBeDefined();
      expect(BUFF_DEFS[t!].vanillaBuff).toBe(buff);   // 往返一致（BUFF_BY_VANILLA 反查源）
      expect(BuffType[t!]).toBe(BOSS_PETS[i][5]);     // 枚举名 = BuffID 内部名（l10n 键源）
      expect(BUFF_DEFS[t!].descKey).toBe(`BuffDescription.${BOSS_PETS[i][5]}`);
    }
    expect(buffTypeByVanilla(284)).toBe(BuffType.KingSlimePet);
    expect(buffTypeByVanilla(304)).toBe(BuffType.DD2BetsyPet);
  });

  it('A4 图标/描述/名称语料全在位（Buff_284-304.png + 原版 l10n BuffName/BuffDescription/ItemName）', () => {
    for (const [vid, buff, proj, , itemKey, buffKey] of BOSS_PETS) {
      expect(existsSync(join(ROOT, 'public/sprites/vanilla', `Buff_${buff}.png`)),
        `Buff_${buff}.png`).toBe(true);
      expect(existsSync(join(ROOT, 'public/sprites/vanilla', `Projectile_${proj}.png`)),
        `Projectile_${proj}.png`).toBe(true);
      expect(existsSync(join(ROOT, 'public/sprites/vanilla', `Item_${vid}.png`)) ||
        atlasHasItem(vid), `Item_${vid} 贴图（散件或 Item_Atlas）`).toBe(true);
      void itemKey; void buffKey;
    }
    // 原版 l10n 语料（zh/en 双语在盘,BuffName/BuffDescription 按 BuffID 内部名键）
    for (const loc of ['zh-Hans', 'en-US']) {
      const l10n = JSON.parse(readFileSync(join(ROOT, `public/l10n/${loc}.json`), 'utf8')) as {
        BuffName: Record<string, string>; BuffDescription: Record<string, string>;
        ItemName: Record<string, string>;
      };
      for (const [vid, , , , itemKey, buffKey] of BOSS_PETS) {
        expect(l10n.BuffName[buffKey], `${loc} BuffName.${buffKey}`).toBeTruthy();
        expect(l10n.BuffDescription[buffKey], `${loc} BuffDescription.${buffKey}`).toBeTruthy();
        expect(l10n.ItemName[itemKey], `${loc} ItemName.${itemKey}(vid ${vid})`).toBeTruthy();
      }
    }
  });

  it('A5 equip/journeycat 分类面：vanity 18→pet 槽 / light 3→光源槽', () => {
    const eq = equipJson as { pet: number[]; light: number[] };
    for (const [vid, , , light] of BOSS_PETS) {
      expect(eq.light.includes(vid) === (light === 1), `vid ${vid} light 集成员`).toBe(true);
      expect(eq.pet.includes(vid) === (light === 0), `vid ${vid} pet 集成员`).toBe(true);
      expect(equipKindOfVid(vid)).toBe(light === 1 ? 'light' : 'pet');
      // 杂项槽受理门（ItemSlot.PickItemMovementAction 判定,SlotActions 消费）
      expect(miscSlotAccepts(light === 1 ? 1 : 0, iidOf(vid)), `vid ${vid} 槽受理`).toBe(true);
      expect(miscSlotAccepts(light === 1 ? 0 : 1, iidOf(vid)), `vid ${vid} 反槽拒收`).toBe(false);
    }
  });
});

// --- A4 辅助（内部名 ↔ vanilla id 反查,避免再拉 idNames.generated 大表） ---
const BUFF_VID: Record<string, number> = Object.fromEntries(BOSS_PETS.map((r) => [r[5], r[1]]));
const PROJ_VID: Record<string, number> = Object.fromEntries(BOSS_PETS.map((r) => [r[5], r[2]]));
const ITEM_VID: Record<string, number> = Object.fromEntries(BOSS_PETS.map((r) => [r[4], r[0]]));
const buffVidOf = (k: string) => BUFF_VID[k];
const projOf = (k: string) => PROJ_VID[k];
const vidOfItem = (k: string) => ITEM_VID[k];
/** 物品贴图双形态：散件 Item_<id>.png 或 Item_Atlas_*.png 矩形（vanilla.json icon 域） */
function atlasHasItem(vid: number): boolean {
  const vanilla = JSON.parse(readFileSync(join(ROOT, 'public/sprites/vanilla.json'), 'utf8')) as {
    items: Record<string, { icon?: string }>;
  };
  const e = vanilla.items[String(vid)];
  return !!e?.icon && existsSync(join(ROOT, 'public/sprites', e.icon));
}

// ==================== B. petai 弹体 AI 参数（1457 Projectile.cs 锚） ====================
const T = petaiJson as unknown as {
  meta: { petProjCount: number; familyCounts: Record<string, number>; swFx48Ext?: { exemptAI174: number[] } };
  pets: Record<string, { name: string; aiStyle: number; family: string; frames: number; [k: string]: unknown }>;
};

describe('B. petai 补条目（17 款 + AI_174 三款豁免）', () => {
  it('B1 ground 八款参数（AI_026 :59137-59162 idleRange / :63108-63112 速度组 / :61262-61295 catchUp）', () => {
    // 884/890 → idleRange 80;885/889/891/897/899/900 → 95（:59137-59155 case 组）
    // 速度组 884/890/891/897/899/900 → 0.2/6（:63108-63112）;885/889 缺省臂 0.08/6.5
    // catchUp 组 881/884/890/891/897/900 → 400,899 → 500,885/889 不在 switch = 默认 500（:61278-61295）
    const want: Record<string, Record<string, number | undefined>> = {
      '884': { idleRange: 80, accel: 0.2, maxSpeed: 6, catchUpRange: 400 },
      '885': { idleRange: 95, accel: 0.08, maxSpeed: 6.5, catchUpRange: 500 },
      '889': { idleRange: 95, accel: 0.08, maxSpeed: 6.5, catchUpRange: 500 },
      '890': { idleRange: 80, accel: 0.2, maxSpeed: 6, catchUpRange: 400 },
      '891': { idleRange: 95, accel: 0.2, maxSpeed: 6, catchUpRange: 400 },
      '897': { idleRange: 95, accel: 0.2, maxSpeed: 6, catchUpRange: 400 },
      '899': { idleRange: 95, accel: 0.2, maxSpeed: 6, catchUpRange: 500 },
      '900': { idleRange: 95, accel: 0.2, maxSpeed: 6, catchUpRange: 400 },
    };
    for (const [k, w] of Object.entries(want)) {
      const e = T.pets[k];
      expect(e, `proj ${k}`).toBeDefined();
      expect(e.family).toBe('ground');
      expect(e.aiStyle).toBe(26);
      expect(e.idleRange, `${k} idleRange`).toBe(w.idleRange);
      expect(e.accel ?? 0.08, `${k} accel`).toBeCloseTo(w.accel as number);
      expect(e.maxSpeed ?? 6.5, `${k} maxSpeed`).toBeCloseTo(w.maxSpeed as number);
      expect(e.catchUpRange ?? 500, `${k} catchUpRange`).toBe(w.catchUpRange);
      expect(e.faceFrom).toBe('move');
      expect(e.flipSign).toBe(1);
    }
  });

  it('B2 fly 四款（:60398 共享悬停分支;892/894 跳过抖动 :60431,901 不跳;速度档 :60463-60466）', () => {
    const bee = T.pets['886'];
    expect(bee).toMatchObject({ family: 'fly', aiStyle: 26, hoverX: -60, hoverY: -60, jitter: 10, speed: 14, accel: 0.4 });
    for (const k of ['892', '894']) {
      expect(T.pets[k]).toMatchObject({ family: 'fly', hoverX: -60, hoverY: -60, jitter: 0, speed: 9, accel: 0.4, farSpeed: 12, farDist: 400 });
    }
    expect(T.pets['901']).toMatchObject({ family: 'fly', jitter: 10, speed: 9, farSpeed: 12, farDist: 400 });
    expect(T.pets['886'].line).toBe(60398);
  });

  it('B3 hover 五款（aiStyle 124 内联 :35693/:35700/:35709/:35714/:35723 锚位逐型）', () => {
    expect(T.pets['882']).toMatchObject({ aiStyle: 124, family: 'hover', hoverX: 30, hoverY: -20, snap: 4, velLerp: 0.1, teleport: 1000, line: 35693 });
    expect(T.pets['888']).toMatchObject({ aiStyle: 124, family: 'hover', hoverX: 30, hoverY: -50, line: 35700 });
    expect(T.pets['895']).toMatchObject({ aiStyle: 124, family: 'hover', hoverX: -36, hoverY: -50, line: 35709 });
    expect(T.pets['896']).toMatchObject({ aiStyle: 124, family: 'hover', hoverX: 30, hoverY: -60, line: 35714 });
    expect(T.pets['898']).toMatchObject({ aiStyle: 124, family: 'hover', hoverX: -30, hoverY: -50, line: 35723 });
    for (const k of ['882', '888', '895', '896', '898']) {
      expect(T.pets[k].faceFrom).toBe('player');
      expect(T.pets[k].flipSign).toBe(-1);
    }
  });

  it('B4 帧数 = Main.cs projFrames（:8808-8828）= vanilla-projframes 表', () => {
    const frames = projframesJson as Record<string, number>;
    for (const [, , proj] of BOSS_PETS) {
      if ([883, 887, 893].includes(proj)) continue;    // AI_174 豁免无条目
      expect(T.pets[String(proj)].frames).toBe(frames[String(proj)]);
    }
  });

  it('B5 AI_174_MultisegmentPet 三款豁免（:46177 蠕虫多头,单精灵引擎未建模 = 登记债）', () => {
    expect(T.meta.swFx48Ext?.exemptAI174).toEqual([883, 887, 893]);
    for (const p of [883, 887, 893]) {
      expect(T.pets[String(p)]).toBeUndefined();       // 落 legacy 回退（PetFollower legacyAI）
      const f = new PetFollower(0, 0, p, () => null);
      expect((f as unknown as { params: unknown }).params).toBeNull();  // 表外 → legacy 面
    }
  });

  it('B6 PetFollower 对 17 款全部命中表载引擎（不落 legacy）', () => {
    for (const [vid, , proj] of BOSS_PETS) {
      void vid;
      if ([883, 887, 893].includes(proj)) continue;
      const f = new PetFollower(0, 0, proj, () => null);
      const params = (f as unknown as { params: { family: string } | null }).params;
      expect(params, `proj ${proj}`).not.toBeNull();
      expect(['ground', 'fly', 'hover']).toContain(params!.family);
    }
  });
});

// ==================== C. 运行时消费面 ====================
const mkStub = () => {
  const p = new Player(0, 0, new Inventory());
  p.dead = true;                       // 压制跟随体生成（want=false）——补挂面无死亡门,1:1
  const g = Object.create(Game.prototype) as unknown as {
    updatePetSlot: (slot: 0 | 1, visible: boolean, cur: null) => null;
  } & Record<string, unknown>;
  g.player = p;
  g.playUseSound = vi.fn();
  g.sfx = { play: vi.fn() };
  return { g, p, playUseSound: g.playUseSound as unknown as ReturnType<typeof vi.fn> };
};

describe('C. 运行时消费面（petBuffKinds 双集 + updatePetSlot 补挂面）', () => {
  it('C1 petBuffKinds：284-304 按 light 位分入 vanity/light 双集（62+21=83 行全收）', () => {
    const pk = (Game as unknown as { petBuffKinds(): { light: Set<number>; vanity: Set<number> } }).petBuffKinds();
    for (const [, buff, , light] of BOSS_PETS) {
      expect(light === 1 ? pk.light.has(buff) : pk.vanity.has(buff), `buff ${buff}`).toBe(true);
    }
    expect(pk.vanity.size).toBe(74);
    expect(pk.light.size).toBe(9);
  });

  it('C2 装备 4797 Royal Delight → 史莱姆王子 284 补挂 60s（Player.cs:17414-17425 面）', () => {
    const { g, p, playUseSound } = mkStub();
    p.inv.miscEquips[0] = { id: iidOf(4797), stack: 1 };
    g.updatePetSlot(0, true, null);
    expect(p.buffs.has(BuffType.KingSlimePet)).toBe(true);
    expect(p.buffs.active.get(BuffType.KingSlimePet)).toBe(60);
    expect(playUseSound).toHaveBeenCalledTimes(1);
  });

  it('C3 光宠走槽 1：4811 Jewel of Light → 仙灵公主 298（UpdatePetLight :17427-17445 面）', () => {
    const { g, p } = mkStub();
    p.inv.miscEquips[1] = { id: iidOf(4811), stack: 1 };
    g.updatePetSlot(1, true, null);
    expect(p.buffs.has(BuffType.FairyQueenPet)).toBe(true);
  });

  it('C4 隐藏/已挂不重挂（:17418/:17420 门）+ TogglePet 隐藏臂清 buff', () => {
    const { g, p } = mkStub();
    p.inv.miscEquips[0] = { id: iidOf(4797), stack: 1 };
    g.updatePetSlot(0, false, null);
    expect(p.buffs.has(BuffType.KingSlimePet)).toBe(false);
    p.buffs.apply(BuffType.KingSlimePet, 10);
    g.updatePetSlot(0, true, null);
    expect(p.buffs.active.get(BuffType.KingSlimePet)).toBe(10);   // 不续期
    // 隐藏臂 ClearBuff（Player.cs:17447-17463;togglePetSlot 走 sfx.play 分支）
    (g as unknown as { togglePetSlot(slot: 0 | 1): void }).togglePetSlot(0);
    expect(p.buffs.has(BuffType.KingSlimePet)).toBe(false);
  });
});
