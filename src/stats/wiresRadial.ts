// ★BJ572 面②（2026-10-08）：WiresRadial 径向工具模式菜单——原版右键菜单面 1:1。
//  金标：Terarria1457/Terraria.GameContent.UI/WiresUI.cs 亲读——
//   · Settings.MultiToolMode(:11-19)：Red=1/Green=2/Blue=4/Yellow=8/Actuator=0x10/
//     Cutter=0x20——与本仓 wiringToolBits TOOL_* 同编号（Cutter 位本仓在
//     world/Wiring.TOOL_CUTTER,此处叶子化自持常量,禁回引断环）。
//   · DrawToolModeUI(:57-66)=手持 3611/3625;DrawToolAllowActuators(:68-80)=
//     3611→_lastActuatorEnabled=2（本仓按"当前手持"直取,闩存位对桌面无观察差,
//     登记偏差 W-R1）。
//   · WiresRadial.FlowerUpdate(:165-202)：持 3611/3625 时右键沿翻转 active;
//     开位=Main.MouseScreen;mouseInterface(非自身)∥死亡∥光标持物⇒收。
//   · DrawFlower(:337-455)：R/G/B/Y 外圈半径 45 + 致动器外圈（3611 时 5 外圈,
//     num3=5,num4=11;3625 时 4 外圈,num3=4,num4=-0.5）+ 中心剪线钳;
//     悬浮=距离<19（中心<20,键盘路径）;左键图标⇒ToolMode 位 XOR;左键空白⇒收;
//     图标钮 WireUi[0|1]（Cutter 态 8|9）+色标 WireUi[2..5]/[6|7]/[10]。
//   · DrawCursorArea(:517-690)：花关闭期光标迷你色点——横排 45px 步距（i-1.5),
//     锚=MouseScreen+(10,25)（!actuator 时 +(−20,10)）,BuilderAcc 表
//     (128,0,10,10) 底+(140,2,6,6) 色点+(148,2,6,6) 剪线钳角标;
//     i→num4={3,2,1,0,5},色 num4:0 红(253,58,61)/1 蓝(83,180,253)/2 绿(83,253,153)/
//     3 黄(253,254,83)/5 白烟;bit=num5(1↔2 交换后 1<<num5,5→致动器);
//     关位色=lerp(色,黑,0.65)。
//   · LineUpdate(:138-163)：_lineOpacity 斜坡 ±0.05/拍,min 0.75（DrawToolModeUI
//     且非聊天）;死亡/光标持物/UI 上方即刻归零。3611 常显、3625 仅光标图标态显
//     （:153-156 !cursorItemIconEnabled && !DrawToolAllowActuators 隐藏支）。
//   · DrawLine(:190-335)=死码（Draw 只调 DrawFlower+DrawCursorArea,WiresUI.cs:184-187）。
import { TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW, TOOL_ACTUATOR } from '../data/wiringToolBits';

/** MultiToolMode.Cutter=0x20（WiresUI.cs:18;本仓 world/Wiring.TOOL_CUTTER 同值） */
export const WIRES_TOOL_CUTTER = 32;

/** 手持件是否出径向菜单/迷你点（Settings.DrawToolModeUI :57-66） */
export function wiresDrawToolModeUI(heldVid: number): boolean {
  return heldVid === 3611 || heldVid === 3625;
}
/** ★帧闩（Settings.DrawToolAllowActuators :68-80）：3611→2 / 3625→1,余件不改写
 *  ——getter 每帧被 DrawFlower/DrawCursorArea/LineUpdate 消费,换件后闩存位保持,
 *  迷你点对蓝图→他件切换走【衰减】而非瞬灭（3625 接手才切 1=瞬灭支激活）。 */
let _lastActuatorEnabled = 0;
export function noteRadialHeld(heldVid: number): void {
  if (heldVid === 3611) _lastActuatorEnabled = 2;
  else if (heldVid === 3625) _lastActuatorEnabled = 1;
}
export function radialActuatorAllowed(): boolean {
  return _lastActuatorEnabled === 2;
}

/** 径向菜单状态（Main.WiresUI.radial 等价;opacity=_lineOpacity） */
export interface WiresRadialState {
  active: boolean;
  /** 开启时 MouseScreen 锚（画布 px） */
  px: number;
  py: number;
  /** _lineOpacity：迷你点/光标角标亮度斜坡 */
  opacity: number;
  /** OnWiresMenu：悬停自身图标期（豁免 mouseInterface 收门） */
  onWiresMenu: boolean;
}

export function newWiresRadialState(): WiresRadialState {
  return { active: false, px: 0, py: 0, opacity: 0, onWiresMenu: false };
}

/** FlowerUpdate 入参（Game tick 每拍装配;mouseInterface=DOM UI/blockMouse 悬浮族） */
export interface FlowerUpdateInput {
  heldVid: number;
  dead: boolean;
  /** Main.mouseItem>0（UI 光标持物） */
  cursorItem: boolean;
  /** player.mouseInterface ∥ lastMouseInterface（DOM UI/其他浮层悬浮） */
  mouseInterface: boolean;
  /** Main.SmartInteractShowingGenuine（仅开门时拦;本仓无真互动态,恒 false 登记） */
  smartInteract: boolean;
  /** mouseRight && mouseRightRelease 右键沿（本仓=rightDown&&!prevRightDown 电沿） */
  rightEdge: boolean;
  mx: number;
  my: number;
}

/** WiresRadial.FlowerUpdate（WiresUI.cs:165-202 1:1——更新态,不消费输入沿） */
export function flowerUpdate(st: WiresRadialState, inp: FlowerUpdateInput): void {
  if (!wiresDrawToolModeUI(inp.heldVid)) {
    st.active = false;
    return;
  }
  if (inp.mouseInterface && !st.onWiresMenu) {
    st.active = false;
    return;
  }
  if (inp.dead || inp.cursorItem) {
    st.active = false;
    st.onWiresMenu = false;
    return;
  }
  st.onWiresMenu = false;
  if (!inp.rightEdge) return;
  if (st.active) {
    st.active = false;
  } else if (!inp.smartInteract) {
    st.active = true;
    st.px = inp.mx;
    st.py = inp.my;
  }
}

/** LineUpdate（WiresUI.cs:138-163 1:1——_lineOpacity 斜坡） */
export function lineOpacityUpdate(
  st: WiresRadialState,
  inp: {
    heldVid: number;
    dead: boolean;
    cursorItem: boolean;
    /** player.cursorItemIconEnabled && cursorItemIconID≠0（3625 光标图标支） */
    cursorItemIcon: boolean;
    mouseInterface: boolean;
  },
): void {
  let value = true;
  let min = 0.75;
  if (!wiresDrawToolModeUI(inp.heldVid)) { value = false; min = 0; }
  if (inp.dead || inp.cursorItem) { st.opacity = 0; return; }
  if (inp.cursorItemIcon && !radialActuatorAllowed()) { st.opacity = 0; return; }
  if (!inp.cursorItemIcon && (!radialActuatorAllowed() || inp.mouseInterface)) { st.opacity = 0; return; }
  const target = Math.min(1, Math.max(min, st.opacity + 0.05 * (value ? 1 : -1)));
  st.opacity += 0.05 * Math.sign(target - st.opacity);
  if (Math.abs(st.opacity - target) < 0.05) st.opacity = target;
}

/** 径向图标槽（DrawFlower 几何 1:1） */
export interface FlowerSlot {
  /** 槽中心（画布 px） */
  x: number;
  y: number;
  /** ToolMode 位（红1/绿2/蓝4/黄8/剪32/致动器16） */
  bit: number;
  /** 中心剪线钳槽（悬浮判 <20px） */
  center: boolean;
  kind: 'red' | 'green' | 'blue' | 'yellow' | 'cutter' | 'actuator';
}

/** DrawFlower 槽位几何（WiresUI.cs:352-383）：num3=4+(actuator?1:0),
 *  num4=actuator?11:-0.5;角=num5·2π/num3−π/num4（num5:i=0→3,1→1,2→2,3→0,
 *  5→(i-1)=4）;i=4 剪线钳居中;半径 45。 */
export function flowerSlots(st: { px: number; py: number }, actuatorAllowed: boolean): FlowerSlot[] {
  const num3 = 4 + (actuatorAllowed ? 1 : 0);
  const num4 = actuatorAllowed ? 11 : -0.5;
  const slots: FlowerSlot[] = [];
  const kinds: Array<FlowerSlot['kind']> = ['red', 'green', 'blue', 'yellow'];
  const bits = [TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW];
  for (let i = 0; i < 4; i++) {
    let num5 = i;
    if (i === 0) num5 = 3;
    if (i === 3) num5 = 0;
    const ang = num5 * (Math.PI * 2) / num3 - Math.PI / num4;
    slots.push({
      x: st.px + Math.cos(ang) * 45,
      y: st.py + Math.sin(ang) * 45,
      bit: bits[i], center: false, kind: kinds[i],
    });
  }
  slots.push({ x: st.px, y: st.py, bit: WIRES_TOOL_CUTTER, center: true, kind: 'cutter' });
  if (actuatorAllowed) {
    const ang = (5 - 1) * (Math.PI * 2) / num3 - Math.PI / num4;
    slots.push({
      x: st.px + Math.cos(ang) * 45,
      y: st.py + Math.sin(ang) * 45,
      bit: TOOL_ACTUATOR, center: false, kind: 'actuator',
    });
  }
  return slots;
}

/** DrawFlower 悬浮判定（:407-425 键盘路径）：外圈距<19,中心距<20;
 *  首中即占（flag 链——原版一帧至多一槽悬浮,槽间不重叠时等价）。 */
export function flowerPick(slots: FlowerSlot[], mx: number, my: number): FlowerSlot | null {
  for (const s of slots) {
    const d = Math.hypot(mx - s.x, my - s.y);
    if (s.center ? d < 20 : d < 19) return s;
  }
  return null;
}

/** 迷你色点（DrawCursorArea :540-690）：i→num4={3,2,1,0,5};色表见文件头;
 *  横排 45px 步距,锚=MouseScreen+(10,25)（!actuator 时再 +(−20,10)）。 */
export interface CursorDot {
  x: number;
  y: number;
  kind: 'red' | 'green' | 'blue' | 'yellow' | 'actuator';
  /** 该点对应 ToolMode 位（lit=位亮） */
  bit: number;
  /** 原版不透明显色（位灭时消费端 lerp 黑 0.65） */
  r: number;
  g: number;
  b: number;
}

export function cursorDots(mouseSX: number, mouseSY: number, actuatorAllowed: boolean, toolMode: number): CursorDot[] {
  const vecX = mouseSX + 10 + (actuatorAllowed ? 0 : -20);
  const vecY = mouseSY + 25 + (actuatorAllowed ? 0 : 10);
  const dots: CursorDot[] = [];
  const COLORS: Record<number, [number, number, number]> = {
    0: [253, 58, 61],    // num4=0 红
    1: [83, 180, 253],   // num4=1 蓝
    2: [83, 253, 153],   // num4=2 绿
    3: [253, 254, 83],   // num4=3 黄
    5: [245, 245, 245],  // num4=5 WhiteSmoke
  };
  const BITS: Record<number, number> = { 0: TOOL_RED, 1: TOOL_BLUE, 2: TOOL_GREEN, 3: TOOL_YELLOW, 5: TOOL_ACTUATOR };
  const KINDS: Record<number, CursorDot['kind']> = { 0: 'red', 1: 'blue', 2: 'green', 3: 'yellow', 5: 'actuator' };
  for (let i = 0; i < 5; i++) {
    if (!actuatorAllowed && i === 4) continue;
    let num4 = i;
    if (i === 0) num4 = 3;
    if (i === 1) num4 = 2;
    if (i === 2) num4 = 1;
    if (i === 3) num4 = 0;
    if (i === 4) num4 = 5;
    const [r, g, b] = COLORS[num4];
    dots.push({
      x: vecX + 45 * (i - 1.5),
      y: vecY,
      kind: KINDS[num4],
      bit: BITS[num4],
      r, g, b,
    });
  }
  void toolMode;
  return dots;
}

/** 位灭色（WiresUI.cs:590 `Color.Lerp(color2, Color.Black, 0.65f)`——XNA lerp
 *  逐通道线性,×0.35 后 round 链与 byte 截断同族） */
export function dotDimColor(c: [number, number, number]): [number, number, number] {
  return [Math.round(c[0] * 0.35), Math.round(c[1] * 0.35), Math.round(c[2] * 0.35)];
}

/** 径向图标钮贴图槽（DrawFlower :426-448）：基钮=Cutter 态 WireUi[8|9] else [0|1];
 *  覆盖标=i0..3→WireUi[2+i]（红/绿/蓝/黄）,剪线钳→[7|6]（Cutter 态 7）,致动器→[10] */
export function flowerSlotTextures(slot: FlowerSlot, hovered: boolean, toolMode: number):
  { base: 0 | 1 | 8 | 9; overlay: 2 | 3 | 4 | 5 | 6 | 7 | 10 } {
  const cutterOn = (toolMode & WIRES_TOOL_CUTTER) !== 0;
  const hi = hovered ? 1 : 0;
  let base: 0 | 1 | 8 | 9;
  let overlay: 2 | 3 | 4 | 5 | 6 | 7 | 10;
  if (slot.kind === 'cutter') {
    base = cutterOn ? (hi ? 9 : 8) : (hi ? 1 : 0);
    overlay = cutterOn ? 7 : 6;
  } else if (slot.kind === 'actuator') {
    base = cutterOn ? (hi ? 9 : 8) : (hi ? 1 : 0);
    overlay = 10;
  } else {
    base = cutterOn ? (hi ? 9 : 8) : (hi ? 1 : 0);
    overlay = (slot.kind === 'red' ? 2 : slot.kind === 'green' ? 3 : slot.kind === 'blue' ? 4 : 5) as 2 | 3 | 4 | 5;
  }
  return { base, overlay };
}

/** 径向图标钮灭位色（DrawFlower :432-445）：位亮=White×White;灭+悬浮=
 *  钮(200,200,200)/标(120,120,120);灭=钮(100,100,100)/标(80,80,80)
 *  （原版双赋值 100→120/150→80 为反编译现形,终值=后赋） */
export function flowerSlotColors(bit: number, toolMode: number, hovered: boolean):
  { button: [number, number, number]; icon: [number, number, number] } {
  const lit = (toolMode & bit) !== 0;
  if (lit || bit === WIRES_TOOL_CUTTER) return { button: [255, 255, 255], icon: [255, 255, 255] };
  return hovered
    ? { button: [200, 200, 200], icon: [120, 120, 120] }
    : { button: [100, 100, 100], icon: [80, 80, 80] };
}
