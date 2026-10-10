// ★BJ572（2026-10-08）宏伟蓝图家族三面判别测试——用户复报 BJ569 三症状。
//  定谳锚（Terarria1457 亲读）：
//   · 面①触发形态：RefreshMechanicalAccsFromItemType（Player.cs:12897-12921）由
//     UpdateEquips（:12997-13004）对 inventory[0..57] 逐槽调用——【背包在册即生效】,
//     非手持限定;3619|3611→InfoAccMechShowWires / 486|3611→rulerLine（ResetEffects
//     :18809 每拍 rulerLine=true 恒真,FX36 判谳）/ 2799|3611→rulerGrid。
//     反编译内部名 3611=WireKite（宏伟蓝图历史内部名,ItemID.cs:8766,不在 IsAKite
//     集 :157）;3619=MechanicalLens;3612=YellowWrench（≠机械透镜）。
//   · 面①卡面：drawBuilderRulers 网格段旧逐格双 pass ≈18.7K drawImage/帧
//     （_bj572-grid-fps-probe 实测 8.8ms/帧@1080p=渲染 81%）;条带批刀后 0.15ms;
//     整数设备相位下同底图 A/B（_bj572-samebase-ab）n=0 逐字节等价,分数相位有界
//     AA 差 ⇒ 门=Number.isInteger(z)（滚轮 1.3ⁿ 复利档回退 BJ448 逐格支）。
//   · 面②右键菜单：WiresUI.WiresRadial（WiresUI.cs:100-698）——右键沿翻转开合
//     （FlowerUpdate :165-202,开位=MouseScreen）;DrawFlower（:337-455）5 外圈
//     （R/G/B/Y+致动器,3611）+中心剪线钳,左键图标 XOR ToolMode 位/左键空白收;
//     DrawCursorArea（:517-690）花关闭期光标迷你色点;LineUpdate（:138-163）斜坡。
//     AI_125 :36362 右键取消臂与菜单翻转同帧双臂（BJ569 取消臂保留,不回归）。
//   · 面③显示电线闭环：3611 蓝图背包在册 ⇒ refreshMechanicalAccsFromItemType 置
//     mechShowWires（=InfoAccMechShowWires）⇒ Game.render showWires 门
//     （equipStats.mechShowWires && builderAccStatus[8]==0）⇒ Renderer.drawWires。
//     旧码缺 3611 支=蓝图收起后电线整层消失（用户复报「看不见电线」真凶）。
//  判别力（旧码必红）：§1 面③ 3611 支;§2 面① 条带 op 序/门路由;§3 面② 开合/
//    几何/交互/斜坡/迷你点;§4 BJ569 取消臂共存（右键沿双臂不互斥）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Renderer } from '../src/render/Renderer';
import {
  flowerUpdate, lineOpacityUpdate, flowerSlots, flowerPick, cursorDots,
  flowerSlotColors, dotDimColor, newWiresRadialState, WIRES_TOOL_CUTTER,
  noteRadialHeld, radialActuatorAllowed,
} from '../src/stats/wiresRadial';
import { TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW, TOOL_ACTUATOR } from '../src/data/wiringToolBits';
import { refreshMechanicalAccsFromItemType } from '../src/entities/Player';
import { builderAccGateSet } from '../src/stats/builderAcc';

const HERE = dirname(fileURLToPath(import.meta.url));
const RDR_SRC = readFileSync(join(HERE, '..', 'src/render/Renderer.ts'), 'utf8');
const GAME_SRC = readFileSync(join(HERE, '..', 'src/core/Game.ts'), 'utf8');

// ================================================================
// §1 面③：显示电线闭环（3611 补支=本刀;旧码缺支必红）
// ================================================================
describe('★BJ572 §1 面③：机械透镜/宏伟蓝图显示电线置位域（Player.cs:12897-12901）', () => {
  const mk = () => ({ mechShowWires: false, autoActuator: false, autoPaint: false, dontHurtCritters: false, preventAllItemPickups: false, hasLucyTheAxe: false, oldStyleParkour: false });

  it('3611 宏伟蓝图（背包在册）→ mechShowWires=true（旧码缺支=真凶）', () => {
    const m = mk();
    refreshMechanicalAccsFromItemType(m, 3611);
    expect(m.mechShowWires).toBe(true);
  });
  it('3619 机械透镜 → mechShowWires=true（对照支,基线绿）', () => {
    const m = mk();
    refreshMechanicalAccsFromItemType(m, 3619);
    expect(m.mechShowWires).toBe(true);
  });
  it('非家族 vid（3612 黄扳手）不置位——置位域不过宽', () => {
    const m = mk();
    refreshMechanicalAccsFromItemType(m, 3612);
    expect(m.mechShowWires).toBe(false);
  });
  it('面①触发形态钉值：rulerLine/rulerGrid 置位域（:12903-12910——背包∪装备扫描域）', () => {
    const g486 = builderAccGateSet((vid) => vid === 486);
    const g2799 = builderAccGateSet((vid) => vid === 2799);
    const g3611 = builderAccGateSet((vid) => vid === 3611);
    expect(g486.rulerLine).toBe(true);            // Ruler→rulerLine（ResetEffects :18809 旗恒真,FX36——真门=status[0]）
    expect(g2799.rulerGrid).toBe(true);           // Mechanical Ruler（反编译 LaserRuler :2799）→rulerGrid
    expect(g3611.rulerLine && g3611.rulerGrid && g3611.infoAccMechShowWires).toBe(true);
    expect(g3611.rulerGrid).toBe(true);
    expect(builderAccGateSet((vid) => vid === 3612).rulerGrid).toBe(false);   // 3612=黄扳手不置位
  });
  it('置位域与 builderAccGateSet 同域（3619|3611 同支,:12899-12901 双消费面一致）', () => {
    const g3611 = builderAccGateSet((vid) => vid === 3611);
    const g3619 = builderAccGateSet((vid) => vid === 3619);
    const g3612 = builderAccGateSet((vid) => vid === 3612);
    expect(g3611.infoAccMechShowWires).toBe(true);
    expect(g3619.infoAccMechShowWires).toBe(true);
    expect(g3612.infoAccMechShowWires).toBe(false);
  });
});

// ================================================================
// §2 面①：条带批 op 序 + 整数 zoom 门（旧逐格路径由 BJ448 套件锁定）
// ================================================================
interface DrawRec { img: unknown; a: number[]; gco: string; ga: number }
function recordingCtx(): { ctx: CanvasRenderingContext2D; rec: DrawRec[] } {
  const rec: DrawRec[] = [];
  const state = { gco: 'source-over', ga: 1 };
  const t: Record<string, unknown> = {};
  const ctx2 = new Proxy(t, {
    get(o, k) {
      if (k === 'globalCompositeOperation') return state.gco;
      if (k === 'globalAlpha') return state.ga;
      if (k === 'imageSmoothingEnabled') return false;
      if (k === 'drawImage') {
        return (...args: unknown[]) => { rec.push({ img: args[0], a: args.slice(1) as number[], gco: state.gco, ga: state.ga }); };
      }
      if (typeof k === 'string' && k in o) return o[k];
      return () => undefined;
    },
    set(o, k, v) {
      if (k === 'globalCompositeOperation') { state.gco = v as string; return true; }
      if (k === 'globalAlpha') { state.ga = v as number; return true; }
      (o as Record<string, unknown>)[k as string] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx: ctx2, rec };
}

function makeSelf(builderRulers: Record<string, unknown>): {
  self: Record<string, unknown>; tints: Array<{ r: number; g: number; b: number; slot: number }>; strips: string[];
} {
  const tints: Array<{ r: number; g: number; b: number; slot: number }> = [];
  const strips: string[] = [];
  const self = {
    builderRulers,
    atlas: {},
    rulerReadout: null as unknown,
    tintedExtra(_p: string, r: number, g: number, b: number, slot: number) {
      const m = { r, g, b, slot, __tint: true as const };
      tints.push(m);
      return m;
    },
    _gridStrip(key: string, _w: number, _h: number, _src: unknown, _sx: number, _sy: number, _sw: number, _sh: number, _vert: boolean) {
      strips.push(key);
      return { __strip: key };
    },
  };
  return { self, tints, strips };
}

const drawBuilderRulers = (Renderer.prototype as unknown as {
  drawBuilderRulers: (this: unknown, ctx: CanvasRenderingContext2D, world: unknown,
    cam: unknown, viewW: number, viewH: number, z: number) => void;
}).drawBuilderRulers;

function gridRulers(): Record<string, unknown> {
  return {
    lineOn: false, gridOn: true,
    feetTx: 30, feetTy: 30, nudge: 1,
    mouseTx: 10, mouseTy: 8, speed: 0,
    gridDist: 0, gravDir: 1,
  };
}

describe('★BJ572 §2 面①：标尺网格条带批（整数相位门+op 序+几何段）', () => {
  it('整数 zoom（z=1）走条带支：op 数 ≪ 逐格数,且条带烘焙被调用', () => {
    const { self, strips } = makeSelf(gridRulers());
    const { ctx, rec } = recordingCtx();
    drawBuilderRulers.call(self, ctx, {}, { x: 455, y: 455 }, 800, 600, 1);
    // 800×600 → nx=56,ny=43;逐格支 op≈2×(56×43−双十字)≈4700+;条带支应 ≪1000
    expect(strips.length).toBeGreaterThan(0);
    expect(rec.length).toBeLessThan(1000);
    expect(rec.length).toBeGreaterThan(0);
  });
  it('条带支 pass 序：先罩（multiply gA=gridMaskA）后加（lighter gA=1）,pass C 收尾', () => {
    const { self } = makeSelf(gridRulers());
    const { ctx, rec } = recordingCtx();
    drawBuilderRulers.call(self, ctx, {}, { x: 455, y: 455 }, 800, 600, 1);
    const gcos = rec.map((r) => r.gco);
    const firstM = gcos.indexOf('multiply');
    const firstL = gcos.indexOf('lighter');
    const lastM = gcos.lastIndexOf('multiply');
    expect(firstM).toBe(0);                       // 首绘=罩
    expect(firstL).toBeGreaterThan(firstM);       // 罩先于加
    expect(lastM).toBeGreaterThan(firstL);        // 竖十字罩在加后（pass C 序）
    expect(gcos[gcos.length - 1]).toBe('lighter');
    // gA 链：首段罩 gA=35/255（floor(127·0.4·0.7)）,十字罩段=44/255,加段=1
    expect(rec[0].ga).toBeCloseTo(35 / 255, 6);
    const crossMask = rec.filter((r) => r.gco === 'multiply' && Math.abs(r.ga - 44 / 255) < 1e-9);
    expect(crossMask.length).toBeGreaterThan(0);
    const addOps = rec.filter((r) => r.gco === 'lighter');
    expect(addOps.every((r) => r.ga === 1)).toBe(true);
  });
  it('条带支几何：均匀列段步距=16px（十字排除列成缺口）,px/px+1 列缺席', () => {
    const { self } = makeSelf(gridRulers());
    const { ctx, rec } = recordingCtx();
    drawBuilderRulers.call(self, ctx, {}, { x: 455, y: 455 }, 800, 600, 1);
    // cam.x=455 → leftPx=55 → ox=floor((55-50)/16)=0;DX0=ox·16-1=-1
    // 竖向段（uniform 列）:dest.x=-1+16i;相邻列差=16 或 16×缺口宽（px/px+1 排除）
    const colOps = rec.filter((r) => r.gco === 'multiply' && r.ga === 35 / 255 && r.a[0] === 0 && r.a[2] === 16);
    expect(colOps.length).toBeGreaterThan(10);
    const xs = [...new Set(colOps.map((r) => r.a[4]))].sort((a, b) => a - b);
    for (let k = 1; k < xs.length; k++) expect((xs[k] - xs[k - 1]) % 16).toBe(0);
    // 十字排除：px=mouseTx-ox=10 → 列 x=-1+160=159 缺席均匀列
    expect(xs).not.toContain(159);
    expect(xs).not.toContain(175);   // px+1=11 → inset 列不走均匀段
  });
  it('非整数 zoom（z=1.3 复利档）回退 BJ448 逐格支（op 数大,无条带烘焙）', () => {
    const { self, strips } = makeSelf(gridRulers());
    const { ctx, rec } = recordingCtx();
    drawBuilderRulers.call(self, ctx, {}, { x: 455, y: 455 }, 800, 600, 1.3);
    expect(strips.length).toBe(0);
    // 逐格支 op≈2×(nx×ny−十字修正)≈4700+
    expect(rec.length).toBeGreaterThan(3000);
  });
  it('源面锁：multiply 支消费黑模槽 2,lighter 支消费调色槽 0/1（回潮即红）', () => {
    const { self, tints } = makeSelf(gridRulers());
    const { ctx, rec } = recordingCtx();
    drawBuilderRulers.call(self, ctx, {}, { x: 455, y: 455 }, 800, 600, 1);
    expect(tints.some((t) => t.slot === 2 && t.r === 0 && t.g === 0 && t.b === 0)).toBe(true);
    // 罩段（multiply）源=槽 2 标记;加段源=槽 0/1 标记
    const maskOps = rec.filter((r) => r.gco === 'multiply');
    const addOps = rec.filter((r) => r.gco === 'lighter');
    expect(maskOps.every((r) => (r.img as { slot?: number }).slot === 2 || (r.img as { __strip?: string }).__strip?.includes('M'))).toBe(true);
    expect(addOps.every((r) => (r.img as { slot?: number }).slot === 0 || (r.img as { slot?: number }).slot === 1
      || ((r.img as { __strip?: string }).__strip && !(r.img as { __strip?: string }).__strip!.includes('M')))).toBe(true);
  });
  it('源码锁：门=Number.isInteger(z)（_bj572-samebase-ab 整数相位 n=0 定谳）', () => {
    expect(RDR_SRC).toContain('Number.isInteger(z) && !Renderer._gridStripsOff');
    expect(RDR_SRC).toContain('_gridStrip(');
    expect(GAME_SRC).toContain('tickWiresRadial');
  });
});

// ================================================================
// §3 面②：右键径向菜单（WiresUI.cs 1:1）
// ================================================================
describe('★BJ572 §3 面②：WiresRadial 开合/几何/交互/斜坡', () => {
  const base = () => ({ heldVid: 3611, dead: false, cursorItem: false, mouseInterface: false, smartInteract: false, rightEdge: true, mx: 100, my: 90 });

  it('右键沿开→再沿关（FlowerUpdate :186-199 翻转）;开位=MouseScreen', () => {
    const st = newWiresRadialState();
    flowerUpdate(st, base());
    expect(st.active).toBe(true);
    expect(st.px).toBe(100);
    expect(st.py).toBe(90);
    flowerUpdate(st, { ...base(), rightEdge: true });
    expect(st.active).toBe(false);
  });
  it('非右键帧不开（rightEdge=false）;收门：非手持件/mouseInterface/死亡/光标持物', () => {
    const st = newWiresRadialState();
    flowerUpdate(st, { ...base(), rightEdge: false });
    expect(st.active).toBe(false);
    const st2 = newWiresRadialState();
    flowerUpdate(st2, base());
    expect(st2.active).toBe(true);
    flowerUpdate(st2, { ...base(), heldVid: 510 });      // 换手持非家族件→收
    expect(st2.active).toBe(false);
    const st3 = newWiresRadialState();
    flowerUpdate(st3, base());
    flowerUpdate(st3, { ...base(), mouseInterface: true });  // DOM UI 悬浮→收
    expect(st3.active).toBe(false);
    const st4 = newWiresRadialState();
    flowerUpdate(st4, base());
    flowerUpdate(st4, { ...base(), dead: true });
    expect(st4.active).toBe(false);
    const st5 = newWiresRadialState();
    flowerUpdate(st5, base());
    flowerUpdate(st5, { ...base(), cursorItem: true });
    expect(st5.active).toBe(false);
  });
  it('3625 无致动器槽（num3=4）;3611 五外圈（num3=5）,半径 45', () => {
    const st = newWiresRadialState();
    st.px = 200; st.py = 200;
    const s3611 = flowerSlots(st, true);
    const s3625 = flowerSlots(st, false);
    expect(s3611.filter((s) => !s.center).length).toBe(5);   // 4 色+致动器
    expect(s3625.filter((s) => !s.center).length).toBe(4);
    expect(s3611.find((s) => s.kind === 'cutter')!.center).toBe(true);
    for (const s of s3611.filter((s) => !s.center)) {
      expect(Math.hypot(s.x - 200, s.y - 200)).toBeCloseTo(45, 6);
    }
    // 位域：红1/绿2/蓝4/黄8/剪32/致动器16（MultiToolMode 编号 1:1）
    expect(s3611.find((s) => s.kind === 'red')!.bit).toBe(TOOL_RED);
    expect(s3611.find((s) => s.kind === 'green')!.bit).toBe(TOOL_GREEN);
    expect(s3611.find((s) => s.kind === 'blue')!.bit).toBe(TOOL_BLUE);
    expect(s3611.find((s) => s.kind === 'yellow')!.bit).toBe(TOOL_YELLOW);
    expect(s3611.find((s) => s.kind === 'cutter')!.bit).toBe(WIRES_TOOL_CUTTER);
    expect(s3611.find((s) => s.kind === 'actuator')!.bit).toBe(TOOL_ACTUATOR);
  });
  it('悬浮判定 2：阈值边界（18.9 中/19.1 不中;中心 19.9 中/20.1 不中）', () => {
    const st = newWiresRadialState();
    st.px = 200; st.py = 200;
    const slots = flowerSlots(st, true);
    const red = slots.find((s) => s.kind === 'red')!;
    expect(flowerPick(slots, red.x + 18.9, red.y)?.kind).toBe('red');
    expect(flowerPick(slots, red.x + 19.1, red.y)).toBeNull();
    const cutter = slots.find((s) => s.kind === 'cutter')!;
    expect(flowerPick(slots, cutter.x + 19.9, cutter.y)?.kind).toBe('cutter');
    expect(flowerPick(slots, cutter.x + 20.1, cutter.y)).toBeNull();
  });
  it('灭位图标灰阶色（:432-445 悬浮亮档/静默暗档）;剪线钳恒白', () => {
    const lit = flowerSlotColors(TOOL_RED, TOOL_RED, false);
    expect(lit.button).toEqual([255, 255, 255]);
    const off = flowerSlotColors(TOOL_RED, TOOL_GREEN, false);
    expect(off.button).toEqual([100, 100, 100]);
    expect(off.icon).toEqual([80, 80, 80]);
    const offHover = flowerSlotColors(TOOL_RED, TOOL_GREEN, true);
    expect(offHover.button).toEqual([200, 200, 200]);
    expect(offHover.icon).toEqual([120, 120, 120]);
    const cutter = flowerSlotColors(WIRES_TOOL_CUTTER, TOOL_GREEN, false);
    expect(cutter.button).toEqual([255, 255, 255]);   // i==4 豁免灰化
  });
  it('迷你色点：★BJ619 定谳重移植——紧凑环簇（:616-668 num4 覆写,非横排）+Floor(:690)', () => {
    const dots3611 = cursorDots(500, 400, true, 0);
    expect(dots3611.length).toBe(5);                       // 4 色+致动器
    // actuator 支（3611 在持）：锚=(500+10,400+25)=(510,425)
    //   红(-12,0)→(498,425) / 黄(12,0)→(522,425) / 蓝(-6,12)→(504,437)
    //   绿(6,12)→(516,437) / 致动器(0,0)→(510,425)（旧横排 45px 锁=死码几何,废）
    expect(dots3611.find((d) => d.kind === 'red')).toMatchObject({ x: 498, y: 425 });
    expect(dots3611.find((d) => d.kind === 'yellow')).toMatchObject({ x: 522, y: 425 });
    expect(dots3611.find((d) => d.kind === 'blue')).toMatchObject({ x: 504, y: 437 });
    expect(dots3611.find((d) => d.kind === 'green')).toMatchObject({ x: 516, y: 437 });
    expect(dots3611.find((d) => d.kind === 'actuator')).toMatchObject({ x: 510, y: 425 });
    // 紧凑环判别：纵坐标两档（中行 425/下排 437）——横排退化必红
    expect(new Set(dots3611.map((d) => d.y)).size).toBe(2);
    // 色表（DrawCursorArea :575-590）
    expect(dots3611.find((d) => d.kind === 'red')!.r).toBe(253);
    expect(dots3611.find((d) => d.kind === 'blue')!.g).toBe(180);
    expect(dots3611.find((d) => d.kind === 'green')!.g).toBe(253);
    expect(dots3611.find((d) => d.kind === 'yellow')!.r).toBe(253);
    expect(dots3611.find((d) => d.kind === 'actuator')!.r).toBe(245);
    // 位映射（num5 1↔2 交换 quirk：蓝点位=TOOL_BLUE(4),绿点位=TOOL_GREEN(2)）
    expect(dots3611.find((d) => d.kind === 'blue')!.bit).toBe(TOOL_BLUE);
    expect(dots3611.find((d) => d.kind === 'green')!.bit).toBe(TOOL_GREEN);
    const dots3625 = cursorDots(500, 400, false, 0);
    expect(dots3625.length).toBe(4);                       // !actuator 跳 i=4
    // 非 actuator 支：锚=(500-10,400+35)=(490,435),×num6=0.7 菱形+Floor
    //   红(0,-8.4)→(490,426.6)⇒426 / 黄(8.4,0)→(498.4,435)⇒(498,435)
    //   蓝(-8.4,0)→(481.6,435)⇒(481,435) / 绿(0,8.4)→(490,443.4)⇒(490,443)
    expect(dots3625.find((d) => d.kind === 'red')).toMatchObject({ x: 490, y: 426 });
    expect(dots3625.find((d) => d.kind === 'yellow')).toMatchObject({ x: 498, y: 435 });
    expect(dots3625.find((d) => d.kind === 'blue')).toMatchObject({ x: 481, y: 435 });
    expect(dots3625.find((d) => d.kind === 'green')).toMatchObject({ x: 490, y: 443 });
  });
  it('位灭色 lerp 黑 0.65（:590）', () => {
    expect(dotDimColor([253, 58, 61])).toEqual([Math.round(253 * 0.35), Math.round(58 * 0.35), Math.round(61 * 0.35)]);
  });
  it('_lineOpacity 斜坡：+0.05/拍至 1;非家族件衰减（闩存位保持）;死亡/光标持物即刻归零', () => {
    const st = newWiresRadialState();
    noteRadialHeld(3611);                 // 帧闩=蓝图在持（闩对 LineUpdate 门生效）
    expect(radialActuatorAllowed()).toBe(true);
    lineOpacityUpdate(st, { heldVid: 3611, dead: false, cursorItem: false, cursorItemIcon: false, mouseInterface: false });
    expect(st.opacity).toBeCloseTo(0.05, 6);
    for (let i = 0; i < 40; i++) lineOpacityUpdate(st, { heldVid: 3611, dead: false, cursorItem: false, cursorItemIcon: false, mouseInterface: false });
    expect(st.opacity).toBe(1);
    lineOpacityUpdate(st, { heldVid: 510, dead: false, cursorItem: false, cursorItemIcon: false, mouseInterface: false });
    expect(st.opacity).toBeCloseTo(0.95, 6);
    lineOpacityUpdate(st, { heldVid: 3611, dead: true, cursorItem: false, cursorItemIcon: false, mouseInterface: false });
    expect(st.opacity).toBe(0);
    st.opacity = 0.8;
    lineOpacityUpdate(st, { heldVid: 3611, dead: false, cursorItem: true, cursorItemIcon: false, mouseInterface: false });
    expect(st.opacity).toBe(0);
  });
  it('Game 侧接线源面锁：tick 前置于蓝图路由（右键沿双臂同帧共存,不互斥）', () => {
    expect(GAME_SRC).toContain('this.tickWiresRadial();');
    const iTick = GAME_SRC.indexOf('this.tickWiresRadial();');
    const iRoute = GAME_SRC.indexOf('this.tickGrandDesignRoute();');
    expect(iTick).toBeGreaterThan(-1);
    expect(iRoute).toBeGreaterThan(iTick);
  });
});
