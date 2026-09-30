// ★清偿刀 R2（2026-09-30）守卫：extract-itemrare.mjs DefaultTo* helper 体 rare/value 面。
// 金标：Terarria1457 Item.cs helper 定义体（1456/1458 三版同构零漂移,BodyCensus 对照实证）——
//   DefaultToMusicBox   rare=4, value=100000      (:48649-48650)
//   DefaultToSolution   rare=3, value=buyPrice(0,0,15) (:47806-47807)
//   DefaultToVanitypet  rare=3, value=sellPrice(0,2)   (:47944/47946)
//   DefaultToFood       rare=1, value=buyPrice(0,0,20) (:48565-48566)
//   DefaultToHealingPotion rare=1, value=…             (:48583-48584)
//   DefaultToTorch      value=60                        (:48482)
//   DefaultToQuestFish  rare=-11                        (:27657)
//   DefaultToKite       SSV(Blue1, buyPrice(0,2))       (:47835) → rare=1/value=20000
//   DefaultToBanner     SSV(Blue1, 1000)                (:47756) → rare=1/value=1000
//   DefaultToGolfBall   value=0 → SSV(Green2, buyPrice(0,1)) (:35459-35460) → 尾胜 rare=2/value=10000
// 缺陷史（Q1 登记债）：旧提取器 case 体工厂 regex 只认 7 名（MusicBox/Solution/Vanitypet/
//   Torch/Food/HealingPotion/SeaShell）且工厂分支只产 value——helper 体 rare 全盲：
//   MusicBox 101 件 rare 缺键（562 实报）、Solution 3 件（5392）、Vanitypet 6 件（44 件
//   已被 case 级显式 rare 覆盖）、Kite 24 件（BJ413 HAND 补过）、Banner 3 件 rare+value
//   双缺（5651/5672/5673）、GolfBall 15 件双缺（3989/4242-4255）、QuestFish 4393/4394 缺。
//   修 = DEFAULT_TO_BODY_RV 体编译器（extract-itemcombat Q1 DEFAULT_TO_BODY 同法移植：
//   委托基座先、自身行后覆写,行源序模拟;value 域 FACTORY_VALUE 七表权威+编译值对拍
//   fail-loud）+ 任务鱼 2450-2488 方法级 if 范围守卫（:24153-24157,case 组不可达）HAND 面。
// 迁移面：rare[5466] 2→3——case 体源序 SetShopValues(Green2)→DefaultToVanitypet,原版
//   「体尾覆写后」终值 3（三版同构 :43100/43129/43129 亲读）;旧提取器工厂不产 rare=错值。
// 消费面：tooltip 稀有色（UI.ts tooltipRareOf → def.rare 自描述）、Bobber consumeBait
//   （Player.cs:53148-53156 rare<0 饵不耗,任务鱼原版同款）、Game.ts 权威 value/商店/重铸。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import rareJson from '../src/data/vanilla-itemrare.json';
import valueJson from '../src/data/vanilla-itemvalue.json';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
// @ts-expect-error 纯 JS 提取库（无类型声明）
import { RARE as EX_RARE, VALUE as EX_VALUE } from '../tools/extract-itemrare.mjs';

const RARE = rareJson as Record<string, number>;
const VALUE = valueJson as Record<string, number>;
const EXTRACTOR_SRC = () => readFileSync(join(dirname(__dirname), 'tools', 'extract-itemrare.mjs'), 'utf8');

const range = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

/** census：case 体顶层可达调用点（tools/extract-itemrare.mjs 区域扫描组归属,2026-09-30 亲读） */
const MUSIC_BOX_IDS = [
  ...range(562, 574), ...range(1596, 1610), 1963, 1964, 1965, 2742, 3044,
  3235, 3236, 3237, 3370, 3371, 3796, 3869, ...range(4077, 4082), 4237,
  4356, 4357, 4358, 4421, 4606, 4979, 4985, 4990, 4991, 4992, 5006,
  ...range(5014, 5040), 5044, 5112, 5362, 5538, 5539, ...range(5578, 5582),
  5637, 5638, 5639, 6144, 6145, 6146,
];
const SOLUTION_IDS = [5392, 5393, 5394];
const VANITY_PET_NEW_IDS = [4366, 4551, 4735, 4736, 4737, 4777]; // 其余 44 件 case 级显式 rare 既有
const VANITY_PET_COVERED_IDS = [
  4365, 4425, 4550, 4603, 4604, 4605, 4701, ...range(4797, 4817), 4960,
  5088, 5089, 5090, 5091, 5098, 5131, 5276, 5297, 5332, 5333, 5400,
  5466, 5513, 5517, 5523, 5654,
];
const KITE_IDS = [
  4367, 4368, 4369, 4370, 4371, 4379, 4610, 4611, 4612, 4613,
  4648, 4649, 4650, 4651, 4669, 4670, 4671, 4674, 4675, 4676, 4677, 4681, 4683, 4684,
];
const BANNER_IDS = [5651, 5672, 5673];
const GOLF_BALL_IDS = [3989, ...range(4242, 4255)];
const QUEST_FISH_HAND_IDS = range(2450, 2488);   // 方法级 if 范围守卫 :24153-24157（HAND 面）
const QUEST_FISH_COMPILER_IDS = [4393, 4394];    // case 顶层调用（体编译器面）

describe('R2 helper 体 rare/value 面（extract-itemrare DEFAULT_TO_BODY_RV）', () => {
  it('census 键集自检（表完备性:分族计数与 2026-09-30 亲读对拍）', () => {
    expect(MUSIC_BOX_IDS.length).toBe(101);
    expect(SOLUTION_IDS.length).toBe(3);
    expect(VANITY_PET_NEW_IDS.length + VANITY_PET_COVERED_IDS.length).toBe(51);
    expect(KITE_IDS.length).toBe(24);
    expect(BANNER_IDS.length).toBe(3);
    expect(GOLF_BALL_IDS.length).toBe(15);
    expect(QUEST_FISH_HAND_IDS.length).toBe(39);
  });

  it('MusicBox 101 件 rare=4（体 :48649;value=100000 既有零漂移）', () => {
    for (const id of MUSIC_BOX_IDS) {
      expect(RARE[String(id)], `rare[${id}]`).toBe(4);
      expect(VALUE[String(id)], `value[${id}]`).toBe(100000);
    }
  });

  it('Solution 5392-5394 rare=3（体 :47806）', () => {
    for (const id of SOLUTION_IDS) expect(RARE[String(id)], `rare[${id}]`).toBe(3);
  });

  it('Vanitypet 体 rare=3:新显影 6 件=3（value 按 case 尾覆写分账）', () => {
    // value 面：体 sellPrice(0,2)=100000（×5）;4735/4777 case 尾 buyPrice(0,50)=500000、
    // 4736 buyPrice(0,30)=300000（体尾覆写序,行源序终值）
    const PET_VALUES: Record<number, number> = { 4366: 100000, 4551: 100000, 4735: 500000, 4736: 300000, 4737: 100000, 4777: 500000 };
    for (const id of VANITY_PET_NEW_IDS) {
      expect(RARE[String(id)], `rare[${id}]`).toBe(3);
      expect(VALUE[String(id)], `value[${id}]`).toBe(PET_VALUES[id]);
    }
  });

  it('Vanitypet 既有 44 件:case 级源序终值保持（先厂后 SSV=5 锚 / 后厂=体值迁移锚）', () => {
    // 4365:DefaultToVanitypet → SetShopValues(Pink5)（源序 SSV 在后,终值 5,体值 3 被覆写）
    expect(RARE['4365']).toBe(5);
    expect(VALUE['4365']).toBe(1000000);   // buyPrice(1)
    // 5466:SetShopValues(Green2) → DefaultToVanitypet（源序体在后,终值 3=「体尾覆写后」
    // 三版同构 :43100/43129 亲读;旧提取器工厂不产 rare=错值 2,本刀迁移）
    expect(RARE['5466']).toBe(3);
    expect(VALUE['5466']).toBe(100000);    // 体 value=sellPrice(0,2)（×5）尾胜 SSV sellPrice(0,1)
  });

  it('Kite 24 件 rare=1/value=20000（体 SSV :47835 ≡ BJ413 HAND 钉值,双源对拍零漂移）', () => {
    for (const id of KITE_IDS) {
      expect(RARE[String(id)], `rare[${id}]`).toBe(1);
      expect(VALUE[String(id)], `value[${id}]`).toBe(20000);
    }
  });

  it('Banner 5651/5672/5673 rare=1 + value=1000（体 SSV :47756,双缺面补齐）', () => {
    for (const id of BANNER_IDS) {
      expect(RARE[String(id)], `rare[${id}]`).toBe(1);
      expect(VALUE[String(id)], `value[${id}]`).toBe(1000);
    }
  });

  it('GolfBall 15 件 rare=2 + value=10000（体 value=0→SSV 尾胜 :35459-35460）', () => {
    for (const id of GOLF_BALL_IDS) {
      expect(RARE[String(id)], `rare[${id}]`).toBe(2);
      expect(VALUE[String(id)], `value[${id}]`).toBe(10000);
    }
  });

  it('QuestFish 全族 45 件 rare=-11（39 HAND + 2 体编译 + 3385-3388 case 级既有）', () => {
    for (const id of [...QUEST_FISH_HAND_IDS, ...QUEST_FISH_COMPILER_IDS, 3385, 3386, 3387, 3388]) {
      expect(RARE[String(id)], `rare[${id}]`).toBe(-11);
    }
  });

  it('Food/Potion 体 rare=1 零新增键（85+1 调用点全带尾随 SetShopValues,case 级既有）', () => {
    // 4022 等食物档位=SetFoodDefaults 尾式 rare=(int)(num/4f)（:48395,1456:48007/1458 同）
    // ——该尾式面为 R2 边界外【已登记债】（错值型,86 件）,本刀不动:json 维持 SSV rare=1。
    expect(RARE['4022']).toBe(1);
    expect(RARE['1912']).toBe(1);
    expect(RARE['5326']).toBe(3);   // case 5326 SSV(Orange3) 覆写 DefaultToFood 体 rare=1
  });

  it('live json ≡ 提取器现产（重产零漂移;键集与值双向全等）', () => {
    expect(Object.keys(EX_RARE).sort()).toEqual(Object.keys(RARE).sort());
    expect(Object.keys(EX_VALUE).sort()).toEqual(Object.keys(VALUE).sort());
    for (const [id, v] of Object.entries(EX_RARE)) expect(RARE[id], `rare[${id}]`).toBe(v);
    for (const [id, v] of Object.entries(EX_VALUE)) expect(VALUE[id], `value[${id}]`).toBe(v);
  });

  it('结构锁:体编译器/fail-loud/HAND 面在提取器源码锚在位', () => {
    const src = EXTRACTOR_SRC();
    expect(src).toContain('DEFAULT_TO_BODY_RV');
    expect(src).toContain('helper 委托环');                     // 环检测 fail-loud
    expect(src).toContain('helper 体缺失');                     // 体缺失 fail-loud
    expect(src).toContain('value 双源漂移');                    // 七表对拍 fail-loud
    expect(src).toContain('不可达编译');                         // depth>0 fail-loud
    expect(src).toContain('/^(DefaultTo\\w+)\\(/');             // 工厂 regex 扩面
    expect(src).toContain('2450: -11');                         // 任务鱼 HAND 面
  });

  it('消费面:vi_ def.rare 自描述（items.ts 自动注册随 json 面带入;VANILLA_ITEM_KEY_BY_ID 反查）', () => {
    for (const [vid, rare] of [[562, 4], [5392, 3], [5466, 3], [5651, 1], [4242, 2], [2450, -11], [4393, -11]] as const) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `vi_${vid} 注册键`).toBeTruthy();
      const def = ITEM_DEFS[ITEM_BY_KEY[key as string] as number];
      expect(def, `def ${key}`).toBeTruthy();
      expect(def.rare, `${key}.rare`).toBe(rare);
    }
  });
});
