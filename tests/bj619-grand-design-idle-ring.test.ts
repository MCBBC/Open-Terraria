// ★BJ619（2026-10-10）宏伟蓝图未开启态色环 + 机械标尺默认态 + wireToolMode 缺省——
//  用户实报（图92=本仓 / 图93=原版）三面判别测试。
//  定谳锚（Terarria1457 亲读,1456/1405 交叉同构）：
//   · 面①未开启态色环：WiresUI.WiresRadial.Draw(:184-187) 只调 DrawFlower+
//     DrawCursorArea——DrawLine(:190-335,底部横排 45px 步距)是【死码】(无调用点)。
//     活码 DrawCursorArea(:517-690)：锚=MouseScreen+(10,25)（!actuator +(−20,10),
//     :512-522),:616-668 按 num4 覆写 vec——actuator 支（3611 在持,DrawToolAllow
//     Actuators :68-80）红(-12,0)/黄(12,0)/蓝(-6,12)/绿(6,12)/致动器(0,0) 居中;
//     非 actuator 支（3625）×num6=0.7 菱形 红(0,-8.4)/黄(8.4,0)/蓝(-8.4,0)/绿(0,8.4);
//     末位 vec.Floor()(:690)。旧实现误用死码横排几何=用户图92「五点横排」病灶
//     （R1-F1 家族:钉值测试锁误读语义本身,bj572 同锁已随刀重写）。
//   · 面②机械标尺默认态【判语=本仓无缺陷,不改缺省】：新档 builderAccStatus[1]=0
//     （Player ctor :56749 只翻 [0]=1,[1] 从未 ctor 翻面;1405 ctor 零
//     builderAccStatus 行=ctor 翻面机制存在而 [1] 未翻=刻意）,网格门
//     DrawInterface_3_LaserRuler(:47146-47223 全文) = rulerGrid(携带 2799/3611 能位,
//     ResetEffects :18808 每拍 false+UpdateEquips :12997-13004 背包∪装备扫描置位)
//     ∧ [1]==0 ⇒ 新档携带蓝图/机械标尺【网格默认亮】=原版现行为。用户观察到的
//     「原版默认不开」源于其原版档 [1]=1（两条原版机制可产生:①1.4.4 读档迁移
//     PL:56312-56325 release<249 且持 3611 强制 [1]=1;②图标列手动关闭）——本仓
//     机制面（缺省/能位门/UI 极性/存档往返/导入迁移）已与反编译逐位同构,缺省改 1
//     =自造分歧,须用户明令（KEY_HARDMODE_TOAST 族）。边界声明见测试 ⑤ 注。
//   · 面③wireToolMode 缺省：WiresUI.Settings.ToolMode 静态初始化
//     `= MultiToolMode.Red`（WiresUI.cs:23;MultiToolMode :13-19 Red=1/Green=2/
//     Blue=4/Yellow=8/Actuator=0x10/Cutter=0x20）——旧缺省四色全开=自造分歧
//     （用户实报「默认应该只开启红线色环」）。静态字段=会话态不入档
//     （PlrImport/serialize/SaveFile 亲查无 wireToolMode 字段,vanilla static 同相）。
//  判别力（旧码必红）：①② 横排几何/缺 Floor;⑤ 缺省位翻动;⑥ 能位门旁路;
//    ⑦ 存档值覆写/迁移缺线;⑧ 缺省位面回潮。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cursorDots, flowerSlots, flowerPick, WIRES_TOOL_CUTTER,
} from '../src/stats/wiresRadial';
import { TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW, TOOL_ACTUATOR } from '../src/data/wiringToolBits';
import { BACC, builderAccDefaults, builderAccGateSet, playerVidCarried } from '../src/stats/builderAcc';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { VI_ID } from '../src/data/itemKeys';
import { exportPlr, parsePlr } from '../src/save/PlrImport';
import type { SaveData } from '../src/save/serialize';
import type { Appearance } from '../src/player/Appearance';

const HERE = dirname(fileURLToPath(import.meta.url));
const RDR_SRC = readFileSync(join(HERE, '..', 'src/render/Renderer.ts'), 'utf8');
const GAME_SRC = readFileSync(join(HERE, '..', 'src/core/Game.ts'), 'utf8');
const FLOW_SRC = readFileSync(join(HERE, '..', 'src/mainFlow.ts'), 'utf8');
const PLR_SRC = readFileSync(join(HERE, '..', 'src/save/PlrImport.ts'), 'utf8');

// ================================================================
// §1 面①：未开启态迷你色点=紧凑环簇（DrawCursorArea 活码几何）
// ================================================================
describe('★BJ619 §1：未开启态色环形态（WiresUI.cs:616-668 num4 覆写+Floor :690）', () => {
  it('① 3611 五点紧凑簇：红左(-12,0)/黄右(12,0)/蓝左下(-6,12)/绿右下(6,12)/致动器居中', () => {
    // 锚=(500+10,400+25)=(510,425)（actuator 在持无额外偏移,:512-522）
    const dots = cursorDots(500, 400, true, 0);
    expect(dots.length).toBe(5);
    expect(dots.find((d) => d.kind === 'red')).toMatchObject({ x: 510 - 12, y: 425 });
    expect(dots.find((d) => d.kind === 'yellow')).toMatchObject({ x: 510 + 12, y: 425 });
    expect(dots.find((d) => d.kind === 'blue')).toMatchObject({ x: 510 - 6, y: 425 + 12 });
    expect(dots.find((d) => d.kind === 'green')).toMatchObject({ x: 510 + 6, y: 425 + 12 });
    expect(dots.find((d) => d.kind === 'actuator')).toMatchObject({ x: 510, y: 425 });
  });
  it('② 紧凑判别（旧横排退化必红）：y 两档;同档最大横向跨度 24（≠横排 45 步距）', () => {
    const dots = cursorDots(500, 400, true, 0);
    const ys = new Set(dots.map((d) => d.y));
    expect(ys.size).toBe(2);                                   // 中行+下排
    const mid = dots.filter((d) => d.y === 425).map((d) => d.x);
    expect(Math.max(...mid) - Math.min(...mid)).toBe(24);      // 红-黄跨度
    // 横排病灶形态（等距 45px 一字排开）不存在：任两点距≠45
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const dist = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
        expect(dist).not.toBeCloseTo(45, 5);
      }
    }
  });
  it('③ 3625 四点菱形 ×0.7+Floor：红(490,426)/黄(498,435)/蓝(481,435)/绿(490,443)', () => {
    // 锚=(500-10,400+35)=(490,435);红 y=435-8.4=426.6⇒Floor 426=Floor 活锁
    const dots = cursorDots(500, 400, false, 0);
    expect(dots.length).toBe(4);
    expect(dots.find((d) => d.kind === 'red')).toMatchObject({ x: 490, y: 426 });
    expect(dots.find((d) => d.kind === 'yellow')).toMatchObject({ x: 498, y: 435 });
    expect(dots.find((d) => d.kind === 'blue')).toMatchObject({ x: 481, y: 435 });
    expect(dots.find((d) => d.kind === 'green')).toMatchObject({ x: 490, y: 443 });
    expect(Number.isInteger(dots.find((d) => d.kind === 'red')!.y)).toBe(true);
  });
  it('④ 开启态菜单不受影响：flowerSlots 外圈半径 45/中心剪线钳/悬浮阈值不随本刀移动', () => {
    const slots = flowerSlots({ px: 1000, py: 800 }, true);
    expect(slots.length).toBe(6);                              // 4 色+剪线钳+致动器
    const cutter = slots.find((s) => s.center)!;
    expect(cutter).toMatchObject({ x: 1000, y: 800, bit: WIRES_TOOL_CUTTER });
    for (const s of slots) {
      if (s.center) continue;
      expect(Math.hypot(s.x - 1000, s.y - 800)).toBeCloseTo(45, 6);
    }
    const outer = slots.find((s) => !s.center && s.bit === TOOL_RED)!;
    expect(flowerPick(slots, outer.x + 18.9, outer.y)).toBe(outer);   // 外圈 <19
    expect(flowerPick(slots, outer.x + 19.1, outer.y)).toBeNull();
    expect(flowerPick(slots, 1000 + 19.9, 800)).toBe(cutter);         // 中心 <20
    expect(flowerPick(slots, 1000 + 20.1, 800)).toBeNull();
    // 渲染消费面源锚：!active 支仍走 cursorDots,Flower 支仍走 flowerSlots（未随刀动）
    expect(RDR_SRC).toContain('const dots = cursorDots(mouseX, mouseY, actuatorAllowed, toolMode);');
    expect(RDR_SRC).toContain('const slots = flowerSlots(st, actuatorAllowed);');
  });
});

// ================================================================
// §2 面②：机械标尺默认态（判语=原版新档 [1]=0 网格默认亮;本仓已同构,锁防漂）
// ================================================================
describe('★BJ619 §2：机械标尺默认态（Player ctor :56749 只翻 [0];LaserRuler 门 :47148）', () => {
  it('⑤ 新档缺省形 [1,0,…]：[0]=1 标尺线关;[1]=0 网格【缺省亮】（原版刻意态,改 1=自造分歧）', () => {
    expect(builderAccDefaults()).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const p = new Player(0, 0, new Inventory());
    expect(p.builderAccStatus).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(p.builderAccStatus[BACC.RulerGrid]).toBe(0);
  });
  it('⑥ 网格显示门=能位(携带 2799/3611)∧[1]==0（Game.ts:52071 同构三分支）', () => {
    const unlocked = () => true;
    const gateOf = (slots: Array<{ id: number } | null>, armor: Array<{ id: number } | null>) =>
      builderAccGateSet((vid) => playerVidCarried(slots, armor, unlocked, vid));
    const empty: Array<{ id: number } | null> = Array.from({ length: 58 }, () => null);
    const noAcc: Array<{ id: number } | null> = Array.from({ length: 20 }, () => null);
    // 无 2799/3611：rulerGrid 能位 false ⇒ 网格不画（无论 [1] 取值）
    expect(gateOf(empty, noAcc).rulerGrid).toBe(false);
    // 携带机械标尺 2799（工具行 10 号格,背包∪装备扫描域 UpdateEquips :12997-13004）
    const withRuler = [...empty];
    withRuler[10] = { id: VI_ID(2799) };
    expect(gateOf(withRuler, noAcc).rulerGrid).toBe(true);
    // 门合成（Game.ts:52071 `gates.rulerGrid && status[1]===0`）三分支：
    expect(gateOf(withRuler, noAcc).rulerGrid && builderAccDefaults()[BACC.RulerGrid] === 0).toBe(true);   // 新档=亮
    const toggledOff = builderAccDefaults();
    toggledOff[BACC.RulerGrid] = 1;
    expect(gateOf(withRuler, noAcc).rulerGrid && toggledOff[BACC.RulerGrid] === 0).toBe(false);           // 手动关=灭
    // 携带宏伟蓝图 3611 同门
    const withGD = [...empty];
    withGD[0] = { id: VI_ID(3611) };
    expect(gateOf(withGD, noAcc).rulerGrid).toBe(true);
  });
  it('⑦ 存档兼容：老档已存 [1] 值往返保真;恢复链/导入迁移源锚（不回缺省形）', () => {
    const mkAppearance = (): Appearance => ({
      name: 'bj619', hair: 0, skinVariant: 0,
      hairColor: { r: 1, g: 2, b: 3 }, skinColor: { r: 4, g: 5, b: 6 }, eyeColor: { r: 7, g: 8, b: 9 },
      shirtColor: { r: 10, g: 11, b: 12 }, undershirtColor: { r: 13, g: 14, b: 15 },
      pantsColor: { r: 16, g: 17, b: 18 }, shoeColor: { r: 19, g: 20, b: 21 },
      difficulty: 0, voiceVariant: 1, voicePitchOffset: 0,
    });
    const mkState = (ba: number[]): SaveData['player'] => ({
      hp: 100, x: 0, y: 0,
      inventory: Array.from({ length: 58 }, () => null),
      selected: 0, baseMaxHp: 100, baseMaxMana: 20, mana: 20,
      banks: [[], [], [], []],
      armor: Array.from({ length: 20 }, () => null),
      dye: Array.from({ length: 10 }, () => null),
      miscEquips: [null, null, null, null, null],
      miscDyes: [null, null, null, null, null],
      buffs: [],
      anglerQuestsFinished: 0,
      builderAccStatus: ba,
    });
    // 老档 [1]=1（迁移/手动关产物）+ 线材可见度族 [4]=2：load 后逐位保真
    const stored = [1, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0];
    const bytes = exportPlr(mkAppearance(), mkState(stored));
    const p = parsePlr(bytes);
    expect(p.playerState.builderAccStatus).toEqual(stored);
    // 恢复链源锚（mainFlow.ts:861-866 逐位回填,不用缺省形覆写）
    expect(FLOW_SRC).toContain('ba[i] = player.builderAccStatus[i] | 0;');
    // 导入迁移源锚（PL:56310 release<210→[0]=1;PL:56312-56325 release<249 且持 3611→[1]=1）
    expect(PLR_SRC).toContain('if (version < 210) ba[0] = 1;');
    expect(PLR_SRC).toContain('if (version < 249 && archStable');
    expect(PLR_SRC).toContain('ba[1] = 1;');
  });
});

// ================================================================
// §3 面③：wireToolMode 缺省=只开红线（WiresUI.cs:23）
// ================================================================
describe('★BJ619 §3：wireToolMode 缺省 = MultiToolMode.Red（WiresUI.cs:23 静态初始化）', () => {
  it('⑧ 缺省位面=TOOL_RED 单位（旧「四色全开」回潮必红）;会话态不入档', () => {
    expect(GAME_SRC).toMatch(/wireToolMode = TOOL_RED;\s*\n/);
    expect(GAME_SRC).not.toContain('wireToolMode = TOOL_RED | TOOL_GREEN | TOOL_BLUE | TOOL_YELLOW');
    expect(GAME_SRC).toContain('WiresUI.cs:23');
  });
  it('⑨ 位值=MultiToolMode flags 面（Red=1/Green=2/Blue=4/Yellow=8/Actuator=0x10）', () => {
    expect(TOOL_RED).toBe(1);
    expect(TOOL_GREEN).toBe(2);
    expect(TOOL_BLUE).toBe(4);
    expect(TOOL_YELLOW).toBe(8);
    expect(TOOL_ACTUATOR).toBe(16);
    expect(WIRES_TOOL_CUTTER).toBe(32);
  });
});
