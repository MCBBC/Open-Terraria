// 右键子帧轻点兜底三态机回归（SW-AW1 2026-09-06,模型 tests/input-virtual.test.ts）：
//   Windows 用户实报右键交互（NPC 对话/开箱）整类失效而 macOS 正常——rightDown
//   纯电平,若 mousedown(b2)→mouseup(b2) 对完整落在两帧间隙（合成事件/远控压缩流/
//   驱动合拍）,下一帧采样已 false,交互扑空。修=三态兜底（0 电平/1 按下未过帧/
//   2 松开落在首帧窗内延迟清）,每个右键至少活过一个消费窗口,Hold 档持续电平不受影响。
// DOM 以最小 stub 满足 Input 构造期挂钩(监听器只登记,事件由测试手动派发)。
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Listener = (e: unknown) => void;

const winReg = new Map<string, Listener[]>();
const elReg = new Map<string, Listener[]>();
const makeReg = (reg: Map<string, Listener[]>) => ({
  addEventListener: (t: string, fn: Listener) => {
    if (!reg.has(t)) reg.set(t, []);
    reg.get(t)!.push(fn);
  },
  removeEventListener: (t: string, fn: Listener) => {
    const arr = reg.get(t);
    if (arr) reg.set(t, arr.filter((f) => f !== fn));
  },
});
const dispatchWin = (t: string, e: unknown) => { for (const fn of winReg.get(t) ?? []) fn(e); };

vi.stubGlobal('window', {
  addEventListener: (...a: [string, Listener]) => makeReg(winReg).addEventListener(...a),
  removeEventListener: (...a: [string, Listener]) => makeReg(winReg).removeEventListener(...a),
});
const fakeEl = {
  addEventListener: (...a: [string, Listener]) => makeReg(elReg).addEventListener(...a),
  removeEventListener: (...a: [string, Listener]) => makeReg(elReg).removeEventListener(...a),
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 }),
};

import { Input } from '../src/core/Input';

/** world 目标(closest→null=非 UI 面板)与 UI 面板目标(closest→truthy) */
const worldTarget = { closest: () => null };
const uiTarget = { closest: () => ({}) };
const mouseEv = (button: number, target: unknown = worldTarget) => ({
  button, target, preventDefault: () => {},
});

function freshInput(): Input {
  winReg.clear(); elReg.clear();
  return new Input(fakeEl as unknown as HTMLElement);
}

describe('右键子帧轻点兜底（SW-AW1 三态机）', () => {
  let inp: Input;
  beforeEach(() => { inp = freshInput(); });

  it('子帧 down-up 对：电平保住到下一帧采样窗,endFrame 强制释放且不残留', () => {
    dispatchWin('mousedown', mouseEv(2));
    expect(inp.rightDown).toBe(true);
    dispatchWin('mouseup', mouseEv(2));            // 同一帧间隙内松开
    expect(inp.rightDown).toBe(true);              // ★延迟清——本帧消费者（:7451
                                                   //  inputUseTile=:rightDown）仍见 true
    inp.endFrame();                                // 消费窗过 → 强制释放
    expect(inp.rightDown).toBe(false);
    inp.endFrame();                                // 不残留/不二次触发
    expect(inp.rightDown).toBe(false);
  });

  it('双击同间隙合并单帧可见：一帧采样,一次释放（原版 60Hz 轮询同粒度）', () => {
    dispatchWin('mousedown', mouseEv(2));
    dispatchWin('mouseup', mouseEv(2));
    dispatchWin('mousedown', mouseEv(2));
    dispatchWin('mouseup', mouseEv(2));
    expect(inp.rightDown).toBe(true);
    inp.endFrame();
    expect(inp.rightDown).toBe(false);
  });

  it('长按跨帧：首帧末归纯电平,Hold 档持续电平不被掐断,松开立即清', () => {
    dispatchWin('mousedown', mouseEv(2));
    expect(inp.rightDown).toBe(true);
    inp.endFrame();                                // 帧1 过 → 态1 归零（不清电平）
    expect(inp.rightDown).toBe(true);              // ★Hold 档(:9314 需持续电平)完好
    inp.endFrame();
    expect(inp.rightDown).toBe(true);
    dispatchWin('mouseup', mouseEv(2));
    expect(inp.rightDown).toBe(false);             // 纯电平语义立即清
  });

  it('按下过帧再松：照旧立即清（态0 路径与旧语义逐位一致）', () => {
    dispatchWin('mousedown', mouseEv(2));
    inp.endFrame();
    dispatchWin('mouseup', mouseEv(2));
    expect(inp.rightDown).toBe(false);
  });

  it('UI 面板目标：不置位不武装（isDomUiTarget 门先于兜底）', () => {
    dispatchWin('mousedown', mouseEv(2, uiTarget));
    expect(inp.rightDown).toBe(false);
    dispatchWin('mouseup', mouseEv(2, uiTarget));
    inp.endFrame();
    expect(inp.rightDown).toBe(false);
  });

  it('blur/退世界兜底：态非零连态带电平清,无 true 残留', () => {
    dispatchWin('mousedown', mouseEv(2));
    dispatchWin('mouseup', mouseEv(2));            // 态2（延迟清未决）
    inp.clearForBlur();
    expect(inp.rightDown).toBe(false);
    inp.endFrame();                                // 态已清,不再动作
    expect(inp.rightDown).toBe(false);
  });

  it('左键语义回归：b0 down/up 置清 mouseDown/mouseHeld 不受兜底影响', () => {
    dispatchWin('mousedown', mouseEv(0));
    expect(inp.mouseDown).toBe(true);
    expect(inp.mouseHeld).toBe(true);
    dispatchWin('mouseup', mouseEv(0));
    expect(inp.mouseDown).toBe(false);
    expect(inp.mouseHeld).toBe(false);
  });
});
