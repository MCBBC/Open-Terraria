// Input 虚拟通道单测(mobile-adaptation-plan 模块①,P0,node 纯逻辑):
//  - pressVirtual/releaseVirtual/tapVirtual 边沿派发序列(KeyEventLite.origin/
//    shiftKey 透传/onKeyEvent 录制口/电平双轨)
//  - action 注入与用户重绑跟随(Jump=['KeyZ'] 回归锁)
//  - 防环三例(real-takeover / virtual-sticky / replay-no-loop)
//  - clearForBlur 清全集 / 触摸 tap 吞边沿兜底(pendingTapRelease × endFrame)
// DOM 以最小 stub 满足 Input 构造期挂钩(监听器只登记,事件由测试手动派发)。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
const dispatchEl = (t: string, e: unknown) => { for (const fn of elReg.get(t) ?? []) fn(e); };

vi.stubGlobal('window', {
  addEventListener: (...a: [string, Listener]) => makeReg(winReg).addEventListener(...a),
  removeEventListener: (...a: [string, Listener]) => makeReg(winReg).removeEventListener(...a),
});
const fakeEl = {
  addEventListener: (...a: [string, Listener]) => makeReg(elReg).addEventListener(...a),
  removeEventListener: (...a: [string, Listener]) => makeReg(elReg).removeEventListener(...a),
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 }),
};

import { Input, type KeyEventLite } from '../src/core/Input';
import { DEFAULT_KEYBINDS } from '../src/core/Keybinds';
import { options } from '../src/core/Options';

function freshInput(): Input {
  return new Input(fakeEl as unknown as HTMLElement);
}

const touchEv = (id: number, x: number, y: number) => ({
  target: null,
  preventDefault: () => {},
  stopPropagation: () => {},
  changedTouches: [{ identifier: id, clientX: x, clientY: y }],
});

describe('Input 虚拟通道', () => {
  let inp: Input;
  /** 绑定表临时改动现场(options.data 直改不落盘;set() 才持久化) */
  const savedBinds = options.data.keybinds;
  const savedOpMode = options.data.touchOpMode;
  beforeEach(() => {
    winReg.clear(); elReg.clear();
    inp = freshInput();
    (options.data as { keybinds?: Record<string, string[]> }).keybinds = undefined;
    // 世界触摸合成的操作模式门(resolveTouchMode)在 node 无触摸硬件=keyboard,
    // 会吞掉全部 touch 合成用例——本组测试钉触屏档
    options.data.touchOpMode = 'touch';
  });
  afterEach(() => {
    options.data.keybinds = savedBinds;
    options.data.touchOpMode = savedOpMode;
  });

  it('pressVirtual(code 口):边沿派发 origin/shiftKey/onKeyEvent(true) + 电平入桶', () => {
    const got: KeyEventLite[] = [];
    inp.keydownHandlers.push((_c, ke) => got.push(ke));
    const rec: Array<[string, boolean]> = [];
    inp.onKeyEvent = (c, d) => rec.push([c, d]);

    expect(inp.pressVirtual('Escape', { shiftKey: true })).toBe(true);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ code: 'Escape', shiftKey: true, repeat: false, origin: 'virtual' });
    expect(rec).toEqual([['Escape', true]]);
    expect(inp.touchKeys.has('Escape')).toBe(true);
    // 电平对 down()/downAction 可见
    expect(inp.down('Escape')).toBe(true);

    inp.releaseVirtual('Escape');
    expect(inp.touchKeys.has('Escape')).toBe(false);
    expect(rec).toEqual([['Escape', true], ['Escape', false]]);
  });

  it('tapVirtual(action 口):virtualAction 标记 + edgeCode=首个绑定码 + 自动松键', () => {
    const got: KeyEventLite[] = [];
    inp.keydownHandlers.push((code, ke) => got.push(ke));
    // Inventory 默认绑定 = ['Escape','KeyE'](DEFAULT_KEYBINDS)
    expect(DEFAULT_KEYBINDS.Inventory[0]).toBe('Escape');

    expect(inp.tapVirtual('Inventory', { virtualIntent: 'inventory' })).toBe(true);
    expect(got).toHaveLength(1);
    expect(got[0].code).toBe('Escape');
    expect(got[0].origin).toBe('virtual');
    expect(got[0].virtualAction).toBe('Inventory');
    expect(got[0].virtualIntent).toBe('inventory');
    // tap 后电平随 release 清空
    expect(inp.touchKeys.size).toBe(0);
  });

  it('重绑跟随回归锁:keybinds={Jump:[KeyZ]} 时 virtualActions 使 downAction 生效', () => {
    options.data.keybinds = { Jump: ['KeyZ'] };
    expect(inp.downAction('Jump')).toBe(false);       // 未注入
    inp.setVirtualAction('Jump', true);               // ★纯电平:重绑后仍跟随 action 本身
    expect(inp.downAction('Jump')).toBe(true);
    inp.setVirtualAction('Jump', false);
    expect(inp.downAction('Jump')).toBe(false);
    // 物理 Z 也命中同一 action(电平三源合一)
    inp.keys.add('KeyZ');
    expect(inp.downAction('Jump')).toBe(true);
  });

  it('real-takeover:真实 keyup 不拔掉虚拟持有的电平,releaseVirtual 自会清', () => {
    inp.pressVirtual('KeyW');
    expect(inp.keys.has('KeyW')).toBe(false);          // 虚拟路径不入 keys
    // 物理按下同码(takeover:keys.add 正常)
    dispatchWin('keydown', { code: 'KeyW', repeat: false, target: null, shiftKey: false });
    expect(inp.keys.has('KeyW')).toBe(true);
    // 物理松开,但虚拟仍持有(touchKeys.has && virtualOrigin.has)→不清电平面;
    // keys.delete 因守卫跳过
    dispatchWin('keyup', { code: 'KeyW' });
    expect(inp.down('KeyW')).toBe(true);               // touchKeys 维持
    inp.releaseVirtual('KeyW');
    expect(inp.down('KeyW')).toBe(false);              // 虚拟松手后自然归零
  });

  it('virtual-sticky:setVirtual* 纯电平幂等,永不派发边沿', () => {
    let keyEdges = 0;
    const rec: Array<[string, boolean]> = [];
    inp.keydownHandlers.push(() => keyEdges++);
    inp.onKeyEvent = (c, d) => rec.push([c, d]);
    inp.setVirtualAction('Left', true);
    inp.setVirtualAction('Left', true);
    inp.setVirtualCode('ControlLeft', true);
    inp.setVirtualCode('ControlLeft', false);
    expect(keyEdges).toBe(0);
    inp.releaseVirtual('Left');
    expect(keyEdges).toBe(0);                          // 松开也不是 keydown 边沿
    // 录制口按【首个绑定码】记录(action→'KeyA'):与 REC_KEYS 物理码体系对齐,
    // 回放侧 pressVirtual 同样产生该码,闭环一致
    expect(rec).toEqual([['KeyA', false]]);
  });

  it('replay-no-loop:handler 内电平操作不再触发第二次边沿', () => {
    let calls = 0;
    inp.keydownHandlers.push((_c, ke) => {
      calls++;
      if (ke.origin === 'physical') return;
      inp.setVirtualCode('Digit3', true);              // handler 内电平级联:幂等不再派发
    });
    inp.pressVirtual('Digit3');
    inp.pressVirtual('Digit2');                        // 第二次边沿独立计数
    expect(calls).toBe(2);
  });

  it('按住自愈:伪 keyup 丢电平后,OS 自动重复沿补回(只补电平,仅一条 repeatHeal 沿)', () => {
    const rec: Array<[string, boolean, string?]> = [];
    inp.onKeyEvent = (c, d, k) => rec.push([c, d, k]);
    dispatchWin('keydown', { code: 'KeyA', repeat: false, target: null });
    expect(inp.keys.has('KeyA')).toBe(true);
    dispatchWin('keyup', { code: 'KeyA' });              // 伪 keyup(系统焦点抖动/输入法态切换)
    expect(inp.keys.has('KeyA')).toBe(false);
    dispatchWin('keydown', { code: 'KeyA', repeat: true, target: null });  // OS 自动重复沿
    expect(inp.keys.has('KeyA')).toBe(true);             // 电平补回,断档缩到一个重复周期
    expect(rec).toEqual([
      ['KeyA', true, undefined],
      ['KeyA', false, undefined],
      ['KeyA', true, 'repeatHeal'],                      // 只在真实补回时一条(不随重复沿刷环)
    ]);
    dispatchWin('keydown', { code: 'KeyA', repeat: true, target: null });  // 后续重复沿幂等
    expect(rec).toHaveLength(3);
    expect(inp.keys.has('KeyA')).toBe(true);
  });

  it('按住自愈不越权:输入框内的重复沿不补电平(打字语义优先)', () => {
    dispatchWin('keydown', { code: 'KeyA', repeat: false, target: null });
    dispatchWin('keyup', { code: 'KeyA' });
    const inputEl = { tagName: 'INPUT' };
    dispatchWin('keydown', { code: 'KeyA', repeat: true, target: inputEl });
    expect(inp.keys.has('KeyA')).toBe(false);            // 打字目标:游戏键不复活
  });

  it('onWindowBlur:clearForBlur 必经观察口(取证 blur 清空 vs 伪 keyup)', () => {
    let blurs = 0;
    inp.onWindowBlur = () => blurs++;
    inp.clearForBlur();
    expect(blurs).toBe(1);
  });

  it('clearForBlur:清全部四层状态并置 delayUseItem(R4-22 语义保留)', () => {
    inp.pressVirtual('Space');
    inp.keys.add('KeyA');
    inp.clearForBlur();
    expect([...inp.keys]).toEqual([]);
    expect(inp.touchKeys.size).toBe(0);
    expect(inp.downAction('Jump')).toBe(false);
    expect(inp.mouseHeld).toBe(false);
    expect(inp.delayUseItem).toBe(true);
  });

  it('tap 吞边沿兜底:touchend 未消费的 mouseDown 保到 endFrame 强制释放', () => {
    dispatchEl('touchstart', touchEv(7, 100, 200));
    expect(inp.mouseDown).toBe(true);
    expect(inp.mouseHeld).toBe(true);
    // touchend 到来(use 尚未消费,跨 fixedTick 前后)
    dispatchEl('touchend', touchEv(7, 100, 200));
    expect(inp.mouseDown).toBe(true);                  // ★保住
    expect(inp.mouseHeld).toBe(false);                 // 电平立即清(channel 类不受影响)
    inp.endFrame();
    expect(inp.mouseDown).toBe(false);                 // 释放点=fixedUpdate 尾
  });

  it('tap 吞边沿兜底不干扰已消费路径:消费后再 touchend 无残留', () => {
    dispatchEl('touchstart', touchEv(9, 100, 200));
    inp.mouseDown = false;                             // 模拟 updateUse 消费(读完主动清)
    inp.endFrame();
    dispatchEl('touchmove', touchEv(9, 100, 210));     // 拖动=瞄准,不崩
    dispatchEl('touchcancel', touchEv(9, 104, 208));
    expect(inp.mouseDown).toBe(false);
    // 兜底无残留:再来一次完整 tap 仍按"保到 endFrame"语义走(行为回归锁)
    dispatchEl('touchstart', touchEv(10, 120, 220));
    dispatchEl('touchend', touchEv(10, 121, 221));
    expect(inp.mouseDown).toBe(true);
    inp.endFrame();
    expect(inp.mouseDown).toBe(false);
  });
});
