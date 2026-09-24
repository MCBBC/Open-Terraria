// BJ334 2026-09-24 用户实报：绿史莱姆（Green Slime）悬停名显示「蓝史莱姆」。
// 定谳三层（反编译 Terarria1457 锚）：
//   ① 判定面（真凶）：tickHoverNpcName 敌怪桶喂基底 vanillaId(1)。原版链 =
//     HoverOverNPCs（Main.cs:43715-43813）帧盒命中 → GivenOrTypeName（NPC.cs:6767）
//     → TypeName = Lang.GetNPCNameValue(npc.netID)（NPC.cs:6751）——名字域是
//     netID 非基底 type。绿史莱姆 = netID -3（SetDefaultsFromNetId case -3:
//     NPC.cs:7726-7735,life14/dmg6/def0/scale0.9/color(0,220,40)）,基底
//     FromNetId(-3)=NetIdMap[2]=1（NPCID.cs:10451-10516/:12478-12484）——
//     1 的本地化名=Blue Slime ⇒ 喂基底=绿史莱姆显示「蓝史莱姆」。
//   ② 解析面：Lang.npcName 负 id 曾 `-netId` 正查近似（-3→3=Zombie、-2→2=DemonEye
//     ——后者今天活体:恶翅史莱姆 121 死亡掉落体 Enemy.ts:14491 vanillaNetId=-2）。
//     原版=Lang.cs:520-539 负表（缺省基底名 + 12 显式覆写 -1..-10/-54/-55）。
//   ③ 数据面：extract-banners.mjs 两 regex `(\d+)` 负数盲区（placeStyle 提取器
//     盲区同族）→ vanilla-banners.json 丢 10 条 npcToBanner 负键 + 7 条
//     bannerToNpc 负规范——绿史莱姆旗（BannerID()=netID∈[-10,-1],NPC.cs:7672;
//     NPCtoBanner case -3→119,BannerSystem.cs:881;规范 BannerToNPC(119)=-3,:1337;
//     物品 2928）杀数/掉旗/tooltip 名/达标公告四链全不可达。
// 配刀：Banners.ts excludedFromDeathTally 负分支（NPC.cs:80610-80619 仅 -5/-1 排除）
//   + ITEM_TO_NPC/scanBannerReps 规范代表优先（负键入库后最小 id 近似翻错 146 旗）;
//   BestiaryPanel.bestiaryFlavorText 负 id 直查（曾反转拿 Zombie 风味）。
// 测试法：fx56/sw-bj7 同款 Game 原型桩 + Lang spy 钉喂参；解析面经 Lang.has spy 钉
//   键选择（单测环境无 l10n bundle,名称文案由 l10n 产物另行保障）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { Game } from '../src/core/Game';
import { Enemy } from '../src/entities/Enemy';
import { TownNPC } from '../src/entities/TownNPC';
import { Lang } from '../src/i18n/Lang';
import { NPC_NAME_BY_ID } from '../src/i18n/idNames.generated';
import {
  bannerOfNpc, bannerToNpcOf, bannerNpcOfItem, excludedFromDeathTally, scanBannerReps,
} from '../src/world/Banners';
import { TILE_BY_KEY } from '../src/data/tiles';

type AnyGame = Record<string, any>;
const HERE = dirname(fileURLToPath(import.meta.url));

/** Game 原型桩（sw-bj7/fx56 同法;atlas.vnpc 40×56 帧盒桩=npcHoverHit 帧盒支） */
function stubGame(): AnyGame {
  const g = Object.create(Game.prototype) as unknown as AnyGame;
  g.player = {
    x: 160, y: 160, w: 20, h: 42, cx: 170, cy: 181, dead: false,
    cursorItemIconEnabled: false, cursorItemIconID: 0, cursorItemIconText: '',
  };
  g.entities = { enemies: [], npcs: [], critters: [] };
  g.renderer = { atlas: { vnpc: () => ({ sw: 40, sh: 56 }) }, fullMap: { open: false } };
  g.input = { mouseX: 0, mouseY: 0 };
  g.camera = { screenToWorld: (sx: number, sy: number) => [sx, sy] };
  return g;
}

const mkEnemy = (over: Record<string, unknown> = {}): Enemy =>
  Object.assign(Object.create(Enemy.prototype), {
    id: 9, vanillaId: 1, vanillaNetId: 0, dead: false, x: 160, y: 160, w: 20, h: 42,
    hp: 14, maxHp: 14, ai0: 0, ai3: 0,
    ...over,
  }) as unknown as Enemy;

const mkNpc = (over: Partial<TownNPC> = {}): TownNPC =>
  Object.assign(Object.create(TownNPC.prototype), {
    id: 1, vanillaId: 22, dead: false, bound: false, givenName: '',
    x: 160, y: 160, w: 20, h: 42, hp: 250, maxHp: 250,
    ...over,
  }) as TownNPC;

const IN_BOX: [number, number] = [170, 180];    // 帧盒内
const OUT_BOX: [number, number] = [145, 180];   // 帧盒外

afterEach(() => vi.restoreAllMocks());

describe('BJ334 ① 判定面：悬停名喂 netID（vanillaNetId!==0?v:vanillaId）', () => {
  it('绿史莱姆（基底1/netID-3）悬停 → npcName 收到 -3,名=「绿史莱姆: 14/14」', () => {
    const spy = vi.spyOn(Lang, 'npcName').mockReturnValue('绿史莱姆');
    const g = stubGame();
    g.input.mouseX = IN_BOX[0]; g.input.mouseY = IN_BOX[1];
    g.entities.enemies = [mkEnemy({ vanillaId: 1, vanillaNetId: -3 })];
    (g as AnyGame).tickHoverNpcName();
    expect(spy).toHaveBeenCalledWith(-3);                    // Main.cs:43820 netID 域
    expect(g.player.cursorItemIconText).toBe('绿史莱姆: 14/14');
    expect(g.player.cursorItemIconEnabled).toBe(false);
  });

  it('蓝史莱姆（netID=1 正 spawn,vanillaNetId=1）→ 收到 1（名=蓝史莱姆不回归）', () => {
    const spy = vi.spyOn(Lang, 'npcName').mockReturnValue('蓝史莱姆');
    const g = stubGame();
    g.input.mouseX = IN_BOX[0]; g.input.mouseY = IN_BOX[1];
    g.entities.enemies = [mkEnemy({ vanillaId: 1, vanillaNetId: 1 })];
    (g as AnyGame).tickHoverNpcName();
    expect(spy).toHaveBeenCalledWith(1);
    expect(g.player.cursorItemIconText).toBe('蓝史莱姆: 14/14');
  });

  it('正型直刷敌怪（vanillaNetId=0 哨兵）→ 回退 vanillaId', () => {
    const spy = vi.spyOn(Lang, 'npcName').mockReturnValue('僵尸');
    const g = stubGame();
    g.input.mouseX = IN_BOX[0]; g.input.mouseY = IN_BOX[1];
    g.entities.enemies = [mkEnemy({ vanillaId: 3, vanillaNetId: 0, hp: 45, maxHp: 45 })];
    (g as AnyGame).tickHoverNpcName();
    expect(spy).toHaveBeenCalledWith(3);
    expect(g.player.cursorItemIconText).toBe('僵尸: 45/45');
  });

  it('小动物桶同口径（vanillaNetId=0 → vanillaId;鸟 74）', () => {
    const spy = vi.spyOn(Lang, 'npcName').mockReturnValue('冠蓝鸦');
    const g = stubGame();
    g.input.mouseX = IN_BOX[0]; g.input.mouseY = IN_BOX[1];
    g.entities.critters = [mkEnemy({ vanillaId: 74, vanillaNetId: 0, hp: 5, maxHp: 5 })];
    (g as AnyGame).tickHoverNpcName();
    expect(spy).toHaveBeenCalledWith(74);
    expect(g.player.cursorItemIconText).toBe('冠蓝鸦: 5/5');
  });

  it('城镇 NPC 桶不变（vanillaId 即 netID）+ 盒外不 claim', () => {
    const spy = vi.spyOn(Lang, 'npcName').mockReturnValue('向导');
    const g = stubGame();
    g.input.mouseX = IN_BOX[0]; g.input.mouseY = IN_BOX[1];
    g.entities.npcs = [mkNpc()];
    (g as AnyGame).tickHoverNpcName();
    expect(spy).toHaveBeenCalledWith(22);
    const g2 = stubGame();
    const spy2 = vi.spyOn(Lang, 'npcName').mockReturnValue('绿史莱姆');
    g2.input.mouseX = OUT_BOX[0]; g2.input.mouseY = OUT_BOX[1];
    g2.entities.enemies = [mkEnemy({ vanillaId: 1, vanillaNetId: -3 })];
    (g2 as AnyGame).tickHoverNpcName();
    expect(spy2).not.toHaveBeenCalled();
    expect(g2.player.cursorItemIconText).toBe('');
  });
});

describe('BJ334 ② 解析面：Lang.npcName 负 netID=Lang.cs:520-539 负表', () => {
  /** 键选择钉法：单测无 l10n bundle——has/text 双 spy 捕获 npcName 解析出的
   *  NPCName.<Internal> 键（数据面键集由 idNames.generated+l10n-audit 保障） */
  function keyOf(netId: number): string | null {
    let captured: string | null = null;
    vi.spyOn(Lang, 'has').mockImplementation((p: string) => { captured = p; return true; });
    vi.spyOn(Lang, 'text').mockImplementation((p: string) => p);
    return Lang.npcName(netId) === null ? null : captured;
  }

  it('史莱姆族 12 覆写面：-3→GreenSlime/-4→Pinky/-5..-10 各色/-2→Slimer2/-1→Slimeling', () => {
    expect(keyOf(-3)).toBe('NPCName.GreenSlime');     // Lang.cs:530（用户实报面）
    expect(keyOf(-4)).toBe('NPCName.Pinky');
    expect(keyOf(-5)).toBe('NPCName.BabySlime');      // King Slime 子代
    expect(keyOf(-6)).toBe('NPCName.BlackSlime');
    expect(keyOf(-7)).toBe('NPCName.PurpleSlime');
    expect(keyOf(-8)).toBe('NPCName.RedSlime');
    expect(keyOf(-9)).toBe('NPCName.YellowSlime');
    expect(keyOf(-10)).toBe('NPCName.JungleSlime');
    expect(keyOf(-2)).toBe('NPCName.Slimer2');        // 121 死亡掉落体（曾=DemonEye）
    expect(keyOf(-1)).toBe('NPCName.Slimeling');
    expect(keyOf(-54)).toBe('NPCName.SmallRainZombie');  // Lang.cs:538-539
    expect(keyOf(-55)).toBe('NPCName.BigRainZombie');
  });

  it('非覆写负变体=基底名缺省（Lang.cs:525-527）:-32→基底187 SlimedZombie/-15→基底77', () => {
    expect(keyOf(-32)).toBe(`NPCName.${NPC_NAME_BY_ID[187]}`);
    expect(NPC_NAME_BY_ID[187]).toBe('SlimedZombie');
    expect(keyOf(-15)).toBe(`NPCName.${NPC_NAME_BY_ID[77]}`);
    expect(NPC_NAME_BY_ID[77]).toBe('ArmoredSkeleton');   // NetIdMap[14]=77
  });

  it('正 id 直查不回归 + 越界(<-65)=null（原版 LocalizedText.Empty）', () => {
    expect(keyOf(1)).toBe('NPCName.BlueSlime');
    expect(keyOf(22)).toBe('NPCName.Guide');
    expect(Lang.npcName(-70)).toBeNull();
    expect(Lang.npcName(-66)).toBeNull();
  });
});

describe('BJ334 ③ 数据面：vanilla-banners.json 负 netID 键（提取器盲区修复后重产）', () => {
  const raw = JSON.parse(readFileSync(
    join(HERE, '..', 'src', 'data', 'vanilla-banners.json'), 'utf8')) as {
    npcToBanner: Record<string, number>; bannerToNpc: Record<string, number>;
  };

  it('npcToBanner 负键 10 条（NPCtoBanner case -1..-10,BannerSystem.cs:689/:788-896）', () => {
    expect(raw.npcToBanner['-1']).toBe(99);    // :689-691 与 81 同旗
    expect(raw.npcToBanner['-2']).toBe(167);   // 与 121 同旗
    expect(raw.npcToBanner['-3']).toBe(119);   // 绿史莱姆旗（用户实报面）
    expect(raw.npcToBanner['-4']).toBe(151);
    expect(raw.npcToBanner['-5']).toBe(146);   // 与 16 同旗
    expect(raw.npcToBanner['-6']).toBe(90);
    expect(raw.npcToBanner['-7']).toBe(155);
    expect(raw.npcToBanner['-8']).toBe(159);
    expect(raw.npcToBanner['-9']).toBe(183);
    expect(raw.npcToBanner['-10']).toBe(131);
    expect(raw.npcToBanner['1']).toBe(69);     // 正键不回归
  });

  it('bannerToNpc 负规范 7 条（BannerToNPC 箭头表 :1306-1341）', () => {
    expect(raw.bannerToNpc['90']).toBe(-6);
    expect(raw.bannerToNpc['119']).toBe(-3);
    expect(raw.bannerToNpc['131']).toBe(-10);
    expect(raw.bannerToNpc['151']).toBe(-4);
    expect(raw.bannerToNpc['155']).toBe(-7);
    expect(raw.bannerToNpc['159']).toBe(-8);
    expect(raw.bannerToNpc['183']).toBe(-9);
  });

  it('Banners 纯函数链：bannerOfNpc(-3)=119 → bannerToNpcOf(119)=-3（公告名=绿史莱姆）', () => {
    expect(bannerOfNpc(-3)).toBe(119);
    expect(bannerToNpcOf(119)).toBe(-3);
    expect(bannerOfNpc(1)).toBe(69);
    expect(bannerToNpcOf(69)).toBe(1);
  });

  it('旗物品 → 规范 NPC：2928→-3（绿史莱姆旗 tooltip 名恢复）/1683→1 不回归', () => {
    expect(bannerNpcOfItem(2928)).toBe(-3);
    expect(bannerNpcOfItem(1683)).toBe(1);
    // 146 母史莱姆旗（NPC 集 {-5,16}）规范=16——最小 id 近似翻错面
    expect(bannerNpcOfItem(2955)).toBe(16);
  });

  it('ExcludedFromDeathTally 负分支（NPC.cs:80610-80619）:-5/-1 排除,其余负变体计旗', () => {
    expect(excludedFromDeathTally(-5)).toBe(true);   // Baby Slime（King Slime 子代）
    expect(excludedFromDeathTally(-1)).toBe(true);   // Slimeling
    expect(excludedFromDeathTally(-3)).toBe(false);
    expect(excludedFromDeathTally(-2)).toBe(false);
    expect(excludedFromDeathTally(-10)).toBe(false);
    expect(excludedFromDeathTally(121)).toBe(true);  // 正表不回归（Slimer）
    expect(excludedFromDeathTally(1)).toBe(false);
  });
});

describe('BJ334 ④ scanBannerReps 规范代表（负键入库后最小 id 近似翻错面）', () => {
  function stubStore(frameX: number[]): unknown {
    return {
      hasTile: () => true,
      idx: (x: number) => x,
      type: [TILE_BY_KEY['v_91_banners']],
      frameX,
      frameY: [0],
    };
  }

  it('旗 119（绿史莱姆）→ 代表 -3；旗 146（母史莱姆,集 {-5,16}）→ 规范 16 非 -5', () => {
    const reps = scanBannerReps(
      stubStore([(119 + 21) * 18, (146 + 21) * 18]) as never,
      0, 0, 1, 0,
    );
    expect(reps.has(-3)).toBe(true);
    expect(reps.has(16)).toBe(true);
    expect(reps.has(-5)).toBe(false);
  });
});
