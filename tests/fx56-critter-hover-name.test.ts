// FX56 2026-09-16 用户实报：鼠标指向小动物（鸟/鼠/蛙/蝶 critter 族）不显示名称+生命值
// 文字（NPC/敌怪悬停有）。
// 定谳（反编译 Terarria1457/Terraria/Main.cs HoverOverNPCs :43715-43813 全文亲读）：
//   ① 原版小动物=普通 NPC（Main.npc 单数组），悬停显示链【无 critter 特化排除支】
//     ——排除集 85/341/629（伪装宝箱怪 ai0==0）/aiStyle87（睡）/694（ai3==3）/
//     690/488（恒排除）/685（图标 327 特化支）皆非小动物型 ⇒ 小动物与城镇/敌怪同链。
//   ② 显示格式（:43820-43832）：flag && !mouseText → cursorItemIconEnabled=false +
//     GivenOrTypeName（NPC.cs:6767 = givenName || TypeName）+ 血量行门 lifeMax>1 &&
//     ShowLife（NPC.cs:6856：仅 dontTakeDamage 才可能 false，小动物无该旗=恒 true）
//     → "名: life/lifeMax"。小动物 lifeMax=5（鸟/鼠/蛙/蝶）⇒ HP 行恒在场。
//   ③ 特型盒（:43734-43736）：677 微光萤 = 20×20 中心盒（贴图帧盒过小，原版加宽
//     容差），整体替换帧盒——本仓 npcHoverHit 同批接线。
// 根因：本仓小动物落 entities.critters 独立桶（spawnNpcByVanilla/摇树/物品释放/
//   仙女族 583-585），tickHoverNpcName 只遍历 enemies+npcs 两桶 = 小动物悬停整缺。
// 测试法：sw-bj7 同法 Game 原型桩 + Enemy/TownNPC 原型伪装（instanceof 过门）；
//   Lang.npcName 用 spy（单测环境无 l10n bundle，名称数据面由 l10n-audit/构建产物
//   另行保障——本文件只钉悬停链路本身）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Game } from '../src/core/Game';
import { Enemy } from '../src/entities/Enemy';
import { TownNPC } from '../src/entities/TownNPC';
import { Lang } from '../src/i18n/Lang';

type AnyGame = Record<string, any>;

/** Game 原型桩（sw-bj7 同法；atlas.vnpc 换 40×56 帧盒桩 = npcHoverHit 走帧盒支） */
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

/** 小动物桩（原型伪装过 instanceof；鸟 74 命中盒 20×42 → 帧盒 [150,190)×[146,202)。
 *  ★vid 勘误:原版 NPCID.Bird=74（29=哥布林巫士——NPCID.cs:10593 勘对） */
const mkCritter = (over: Record<string, unknown> = {}): Enemy =>
  Object.assign(Object.create(Enemy.prototype), {
    id: 7, vanillaId: 74, dead: false,
    x: 160, y: 160, w: 20, h: 42, hp: 5, maxHp: 5, ai0: 0, ai3: 0,
    ...over,
  }) as unknown as Enemy;

const mkNpc = (over: Partial<TownNPC> = {}): TownNPC =>
  Object.assign(Object.create(TownNPC.prototype), {
    id: 1, vanillaId: 22, dead: false, bound: false, givenName: '',
    x: 160, y: 160, w: 20, h: 42, hp: 250, maxHp: 250,
    ...over,
  }) as TownNPC;

const mkEnemy = (over: Record<string, unknown> = {}): Enemy =>
  Object.assign(Object.create(Enemy.prototype), {
    id: 9, vanillaId: 1, dead: false, x: 160, y: 160, w: 20, h: 42,
    hp: 45, maxHp: 45, ai0: 0, ai3: 0,
    ...over,
  }) as Enemy;

const IN_BOX: [number, number] = [170, 180];     // 帧盒内（鸟）
const OUT_BOX: [number, number] = [145, 180];    // 帧盒外

describe('FX56 ① critters 桶悬停名牌+血量行（Main.cs:43820-43832 与城镇/敌怪同链）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('鸟(74)帧盒内悬停 → "名: 5/5"（lifeMax=5>1 ∧ ShowLife 恒 true → HP 行在场）', () => {
    vi.spyOn(Lang, 'npcName').mockReturnValue('冠蓝鸦');
    const g = stubGame();
    g.input.mouseX = IN_BOX[0]; g.input.mouseY = IN_BOX[1];
    g.entities.critters = [mkCritter()];
    (g as AnyGame).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe('冠蓝鸦: 5/5');
    expect(g.player.cursorItemIconEnabled).toBe(false);      // :43822 压悬停/手持图标
  });

  it('盒外悬停 → 不 claim', () => {
    vi.spyOn(Lang, 'npcName').mockReturnValue('冠蓝鸦');
    const g = stubGame();
    g.input.mouseX = OUT_BOX[0]; g.input.mouseY = OUT_BOX[1];
    g.entities.critters = [mkCritter()];
    (g as AnyGame).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe('');
  });

  it('血量行门 lifeMax>1（:43829）——maxHp==1 只显名（GivenOrTypeName 单行）', () => {
    vi.spyOn(Lang, 'npcName').mockReturnValue('萤火虫');
    const g = stubGame();
    g.input.mouseX = IN_BOX[0]; g.input.mouseY = IN_BOX[1];
    g.entities.critters = [mkCritter({ vanillaId: 355, maxHp: 1, hp: 1 })];   // 355=萤火虫（maxHp 覆写=闸门测试）
    (g as AnyGame).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe('萤火虫');
  });

  it('dead 小动物不 claim', () => {
    vi.spyOn(Lang, 'npcName').mockReturnValue('冠蓝鸦');
    const g = stubGame();
    g.input.mouseX = IN_BOX[0]; g.input.mouseY = IN_BOX[1];
    g.entities.critters = [mkCritter({ dead: true })];
    (g as AnyGame).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe('');
  });

  it('桶序首中语义：同盒双中敌怪赢小动物（enemies→npcs→critters，原版单数组 index 序拆桶近似）', () => {
    vi.spyOn(Lang, 'npcName').mockImplementation((vid: number) => (vid === 1 ? '绿史莱姆' : '冠蓝鸦'));
    const g = stubGame();
    g.input.mouseX = IN_BOX[0]; g.input.mouseY = IN_BOX[1];
    g.entities.critters = [mkCritter()];
    g.entities.enemies = [mkEnemy({ vanillaId: 1 })];
    (g as AnyGame).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe('绿史莱姆: 45/45');
  });

  it('桶序首中语义：同盒双中城镇 NPC 赢小动物（givenName 直引 GivenOrTypeName）', () => {
    vi.spyOn(Lang, 'npcName').mockImplementation((vid: number) => (vid === 22 ? '向导' : '冠蓝鸦'));
    const g = stubGame();
    g.input.mouseX = IN_BOX[0]; g.input.mouseY = IN_BOX[1];
    g.entities.critters = [mkCritter()];
    g.entities.npcs = [mkNpc({ givenName: 'Levi' })];
    (g as AnyGame).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe('Levi: 250/250');
  });
});

describe('FX56 ② 677 微光萤特型盒（Main.cs:43734-43736 CenteredRectangle(Center,20,20)）', () => {
  it('20×20 中心盒命中——8×8 命中盒体在 (100,100)，中心 (104,104) → 盒 [94,114)²；(113,104) 命中', () => {
    const g = stubGame();
    g.renderer = { fullMap: { open: false } };   // atlas 缺席（回退支路径也不触达——特型盒前置）
    expect((g as AnyGame).npcHoverHit(677, 113, 104, 100, 100, 8, 8)).toBe(true);
  });

  it('特型盒替换 ±8px 回退盒：(92,104) 在回退盒 [92,118)×[92,118) 内、20×20 外 → 不命中', () => {
    const g = stubGame();
    g.renderer = { fullMap: { open: false } };
    expect((g as AnyGame).npcHoverHit(677, 92, 104, 100, 100, 8, 8)).toBe(false);
  });

  it('非 677 小动物不受特型支影响（帧盒路径照旧：帧缘点 (155,150) 命中）', () => {
    const g = stubGame();   // atlas vnpc 40×56 → 帧盒 [150,190)×[146,202)
    expect((g as AnyGame).npcHoverHit(74, 155, 150, 160, 160, 20, 42)).toBe(true);
  });
});
