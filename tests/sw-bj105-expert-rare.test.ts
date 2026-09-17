// ★BJ105 债刀（2026-09-17）：expert 旗表数据面 + 掉落物名 expert→rare=−12 专家彩虹支清偿。
// 取证定谳（1457 反编译锚）：
//   · 原版语义 Main.cs:43624-43627 `rare = inner.rare; if (inner.expert) { rare = -12; }`
//     ——expert 旗与稀有度正交、最后覆写（3332 月主袋 rare=8 实测仍 −12）。
//   · 旗源 = Item.cs SetDefaults `expert = true` 25 处 → **43 id**（三个 fallthrough
//     共享组展开；1456/1457/1458 三树 id 集全等，CLI 对拍实证）。tools/extract-expert.mjs
//     深度栈机器提取（extract-itemrare.mjs 同法）→ src/data/vanilla-expert.json；
//     recon-item-1456-1457.mjs 已扩 expert 对账面（DRIFT/幻影键双通道）。
//   · 消费面 = Game.ts tickHoverDropName（本件结构锁）；渲染端 -12=disco 彩虹档
//     （Renderer.mouseTextInnerColor(-12) 已在 sw-bj105-hover-claims.test.ts 锁定）。
// 测试法：Game 原型桩（sw-bj105-hover-claims.test.ts 同法）+ 旗表金标（亲读 43 id 钉死）
//   + 源文本结构锁（变异即红）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Game } from '../src/core/Game';
import { Lang } from '../src/i18n/Lang';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import vanillaRareJson from '../src/data/vanilla-itemrare.json';
import vanillaExpertJson from '../src/data/vanilla-expert.json';

const ITEM_RARE = vanillaRareJson as Record<string, number>;
const ITEM_EXPERT = vanillaExpertJson as Record<string, number>;

type AnyGame = Record<string, any>;

/** Game 原型桩（sw-bj105-hover-claims.test.ts bj105Game 同法） */
function expertGame(): AnyGame {
  const g = Object.create(Game.prototype) as unknown as AnyGame;
  g.player = {
    x: 160, y: 160, w: 20, h: 42, cx: 170, cy: 181, dead: false,
    cursorItemIconEnabled: false, cursorItemIconID: 0, cursorItemIconText: '',
    cursorItemIconRare: 0, cursorItemIconDiff: 0,
  };
  g.world = { isJourney: false };
  g.entities = { enemies: [], npcs: [], drops: [], critters: [] };
  g.renderer = {};
  g.input = { mouseX: 0, mouseY: 0, mouseDown: false };
  g.camera = { screenToWorld: (sx: number, sy: number) => [sx, sy] as [number, number] };
  return g;
}

/** 掉落物桩（原型伪装）。atlasIcon 桩回贴图单帧 22×26 → 帧盒 (95,86) 22×26 */
const mkDrop = (vid: number, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  dead: false, itemId: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]], stack: 1, prefix: 0,
  x: 100, y: 100, w: 12, h: 12,
  ...over,
});
const HOVER = { x: 106, y: 106 };   // 帧盒内（atlasIcon 桩 22×26 或物理盒 12×12 皆含）

// ================= 行为面：expert→rare=−12（Main.cs:43624-43627） =================
describe('BJ105 债刀 ① tickHoverDropName expert→rare=−12 支（本刀新可达）', () => {
  it('expert 配饰（3090 史莱姆王之凝,rare=2）hover → cursorItemIconRare=−12（旗表支）', () => {
    const g = expertGame();
    g.renderer.atlasIcon = () => ({ sw: 22, sh: 26 });
    g.entities.drops = [mkDrop(3090)];
    g.input.mouseX = HOVER.x; g.input.mouseY = HOVER.y;
    (g as AnyGame).tickHoverDropName();
    expect(g.player.cursorItemIconText).toBe(Lang.itemNameByKey(VANILLA_ITEM_KEY_BY_ID[3090]));
    expect(g.player.cursorItemIconRare).toBe(-12);   // :43626 expert 覆写（非 ITEM_RARE[3090]=2）
  });

  it('expert 胜过表值：3332 月主宝袋 rare=8 仍 −12（原版 rare=inner.rare 后置覆写同序）', () => {
    expect(ITEM_RARE['3332']).toBe(8);   // 前置锚：表值确为 8（bj91 HAND_RARE 面）
    const g = expertGame();
    g.entities.drops = [mkDrop(3332)];
    g.input.mouseX = HOVER.x; g.input.mouseY = HOVER.y;
    (g as AnyGame).tickHoverDropName();
    expect(g.player.cursorItemIconRare).toBe(-12);
  });

  it('SetDefaults5 段抽查：5289 电动矿车（:41996）同旗 → −12（五段机器全覆盖）', () => {
    const g = expertGame();
    g.entities.drops = [mkDrop(5289)];
    g.input.mouseX = HOVER.x; g.input.mouseY = HOVER.y;
    (g as AnyGame).tickHoverDropName();
    expect(g.player.cursorItemIconRare).toBe(-12);
  });

  it('负控：非 expert 掉落物（75 坠落星,rare=1）维持表值,不吃 −12', () => {
    expect(ITEM_EXPERT['75']).toBeUndefined();
    const g = expertGame();
    g.renderer.atlasIcon = () => ({ sw: 22, sh: 26 });
    g.entities.drops = [mkDrop(75)];
    g.input.mouseX = HOVER.x; g.input.mouseY = HOVER.y;
    (g as AnyGame).tickHoverDropName();
    expect(g.player.cursorItemIconRare).toBe(ITEM_RARE['75']);   // =1
    expect(g.player.cursorItemIconRare).not.toBe(-12);
  });
});

// ================= 数据面金标：亲读 43 id 钉死（旗错/缺/幻影皆红） =================
describe('BJ105 债刀 ② vanilla-expert.json 金标（亲读清单逐 id 对拍）', () => {
  // 亲读清单（1457 Item.cs 25 处 `expert = true;` 逐站点归属 case 组展开；三树全等）：
  // SetDefaults2 :13924 / SetDefaults4 :28600-34164 / SetDefaults5 :37576-41996
  const HAND_EXPERT = [
    1131,                                        // 重力球（:13924）
    3090, 3097, 3223, 3224, 3245,                // 史莱姆王之凝/克苏鲁护盾/混乱之脑/蠕虫围巾/骨手套
    3318, 3319, 3320, 3321, 3322, 3323, 3324, 3325, 3326, 3327, 3328, 3329, 3330, 3331, 3332,
                                                 // 十三主袋+王袋 15 袋共享组（:30615,if 链只覆写 rare）
    3333, 3335, 3336, 3337,                      // 蜂巢背包/恶魔心脏/孢子囊/闪亮石
    3353, 3354, 3355, 3356,                      // 机械矿车+车轮三件（3354-3356 共享组 :30679）
    3367,                                        // 虾米松露（小猪龙鱼坐骑）
    3577,                                        // 可疑触手
    3860, 3861, 3862,                            // 撒旦三袋共享组（:34164,if 链只覆写 rare）
    4444,                                        // 女巫扫帚
    4782,                                        // 光之女皇宝袋
    4954,                                        // 长虹尾翼
    4957,                                        // 史莱姆女皇宝袋
    4987, 4989,                                  // 挥发凝胶/女皇飞行助推器
    5100,                                        // 骨头盔
    5111,                                        // 独眼巨鹿宝袋
    5289,                                        // 电动矿车
  ];

  it('旗表恰为亲读 43 id（多=幻影手补,少=提取盲区回退,皆红）', () => {
    const got = Object.keys(ITEM_EXPERT).map(Number).sort((a, b) => a - b);
    const want = [...HAND_EXPERT].sort((a, b) => a - b);
    expect(got).toEqual(want);
  });

  it('旗值恒 1（itemfunc 1/0 旗惯型;recon SCALAR 写回口径）', () => {
    for (const v of Object.values(ITEM_EXPERT)) expect(v).toBe(1);
  });

  it('专家件 vid ↔ 本仓 def 键双射可解析（消费面可达性前置锚）', () => {
    for (const vid of Object.keys(ITEM_EXPERT)) {
      expect(VANILLA_ITEM_KEY_BY_ID[Number(vid)], `vid ${vid}`).toBeTruthy();
    }
  });
});

// ================= 结构锁（变异即红） =================
describe('BJ105 债刀 ③ 结构锁：tickHoverDropName expert 支接线', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/core/Game.ts'), 'utf8');

  it('expert→−12 支在 tickHoverDropName 内（摘支/换位即红）', () => {
    const s = src.indexOf('private tickHoverDropName(): void {');
    const e = src.indexOf('private tickHeldCursorIcon(', s);
    expect(s).toBeGreaterThan(0);
    expect(e).toBeGreaterThan(s);
    const body = src.slice(s, e);
    expect(body).toContain('-12');                                  // 专家彩虹档
    expect(body).toContain('ITEM_EXPERT[String(vid)] === 1');       // 旗读点（vanilla-expert.json 域）
    // 旗支在 baseRare（变体覆写 ?? 表查）之后：原版 rare=inner.rare → if(expert) 覆写同序
    const iBase = body.indexOf('const baseRare =');
    const iExp = body.indexOf('ITEM_EXPERT[String(vid)] === 1');
    expect(iBase).toBeGreaterThan(0);
    expect(iExp).toBeGreaterThan(iBase);
  });

  it('旗表 import 在 Game.ts（断供即红）', () => {
    expect(src).toContain("import vanillaExpertJson from '../data/vanilla-expert.json'");
  });
});
