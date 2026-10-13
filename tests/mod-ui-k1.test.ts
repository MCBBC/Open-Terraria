// ★刀1(2026-10-13)mod UI 宿主守卫:面板注册(同键聚焦/级联)/ESC 链支/世界让位/
//   per-mod closeAll。渲染面(canvas 绘制)=实机探针批;本件=逻辑面(vui 元素构造
//   与命中均无 DOM 依赖)。
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveEscapeChain } from '../src/ui/escapeChain';
import {
  modUiPanel, modUiSetInGame, modUiBlockingPointer, modUiCloseTop,
  modUiPanelsOpen, modUiCloseAllOf, _resetModUiForTests,
} from '../src/mods/ui';
import { UIScale } from '../src/vui/draw/UIScale';
import { VUI } from '../src/vui/VUI';

describe('ESC 链 closeModPanels 支(刀1)', () => {
  it('mod 面板开着:closeSummon 后、fullMap 前收 mod 面板;无面板不抢沿', () => {
    const base = { summonOpen: false, fullMapOpen: false, pauseOpen: false,
      npcDialogActive: false, signDialogActive: false, settingsOpen: false,
      uiBlocking: false, dead: false, inventoryOpen: false } as const;
    expect(resolveEscapeChain({ ...base, modPanelsOpen: true }, 'escape')).toBe('closeModPanels');
    expect(resolveEscapeChain({ ...base, modPanelsOpen: true, fullMapOpen: true }, 'escape')).toBe('closeModPanels');
    expect(resolveEscapeChain({ ...base, modPanelsOpen: true, summonOpen: true }, 'escape')).toBe('closeSummon');
    expect(resolveEscapeChain({ ...base, modPanelsOpen: false }, 'escape')).toBe('openInventory');
  });
});

describe('mod UI 宿主(刀1)', () => {
  beforeEach(() => {
    _resetModUiForTests();
    modUiSetInGame(false);
    modUiSetInGame(true);
  });

  it('面板注册+同键聚焦(不重复建);级联默认位', () => {
    const a = modUiPanel('m', 'demo', { title: 'Demo', x: 100, y: 80, width: 200, height: 120 });
    const b = modUiPanel('m', 'demo', { title: 'Demo', width: 200, height: 120 });
    expect(b).toBe(a);                       // 同键=同一句柄
    expect(modUiPanelsOpen()).toBe(true);
    expect(a.visible).toBe(true);
  });

  it('世界让位:面板开着+命中面板=UI 吃指针;指针在外=放行', () => {
    modUiPanel('m', 'hit', { x: 100, y: 80, width: 200, height: 120 });
    UIScale.mouseX = 50; UIScale.mouseY = 40;          // 面板外
    expect(modUiBlockingPointer()).toBe(false);
    UIScale.mouseX = 150; UIScale.mouseY = 100;        // 面板内
    expect(modUiBlockingPointer()).toBe(true);
    // 菜单态(不在役):恒放行
    modUiSetInGame(false);
    UIScale.mouseX = 150; UIScale.mouseY = 100;
    expect(modUiBlockingPointer()).toBe(false);
    modUiSetInGame(true);
  });

  it('ESC 链消费:closeTop 栈式收层;全收后宿主回 cursor 模式', () => {
    const p1 = modUiPanel('m', 'l1', { x: 10, y: 10, width: 120, height: 80 });
    const p2 = modUiPanel('m', 'l2', { x: 40, y: 40, width: 120, height: 80 });
    expect(modUiCloseTop()).toBe(true);      // 收 l2(顶)
    expect(p2.visible).toBe(false);
    expect(p1.visible).toBe(true);
    expect(modUiCloseTop()).toBe(true);      // 收 l1
    expect(modUiCloseTop()).toBe(false);     // 空栈
    expect(modUiPanelsOpen()).toBe(false);
    expect(VUI.ui.current).toBeNull();       // 宿主让位=光标独占模式
  });

  it('per-mod closeAll:只关本 mod 面,他 mod 面照开', () => {
    modUiPanel('m1', 'a', { x: 10, y: 10, width: 120, height: 80 });
    modUiPanel('m2', 'b', { x: 30, y: 30, width: 120, height: 80 });
    modUiCloseAllOf('m1');
    expect(modUiPanelsOpen()).toBe(true);    // m2 仍开
    modUiCloseAllOf('m2');
    expect(modUiPanelsOpen()).toBe(false);
  });

  it('hide/show/toggle 经句柄;元素面 addText/addButton 不抛(vui 构造无 DOM)', () => {
    const p = modUiPanel('m', 'el', { x: 10, y: 10, width: 200, height: 140 });
    p.addText('Hello', { x: 8, y: 28 });
    p.addButton('OK', { x: 8, y: 60, w: 60, onClick: () => {} });
    p.hide();
    expect(p.visible).toBe(false);
    expect(modUiPanelsOpen()).toBe(false);
    p.show();
    expect(p.visible).toBe(true);
    p.toggle();
    expect(p.visible).toBe(false);
  });
  // ★D19-F10(2026-10-13):卸载沿全收——modUiSetInGame(false) 关全部可见面板
  //  (entries 保留=句柄引用稳定,mod 依 onWorldLoad 重开);再入世界由 modUiResync 恢复
  it('卸载沿全收(F10):setInGame(false) 关面板;句柄仍可重开', () => {
    const p = modUiPanel('m', 'wl', { x: 10, y: 10, width: 200, height: 140 });
    p.show();
    expect(modUiPanelsOpen()).toBe(true);
    modUiSetInGame(true);
    modUiSetInGame(false);
    expect(modUiPanelsOpen()).toBe(false);
    expect(p.visible).toBe(false);
    p.show();   // entries 永存=句柄重开语义(mod 侧 onWorldLoad 重开面)
    expect(p.visible).toBe(true);
  });

  // ★D19-F4(2026-10-13):DOM 吞门(无 document 环境=门静默不炸;开合沿可调)
  it('DOM 吞门(F4):无 document 环境静默;面板开合不抛', () => {
    const p = modUiPanel('m', 'gate', { x: 10, y: 10, width: 200, height: 140 });
    p.show();
    modUiCloseTop();
    p.show();
    p.close();
  });
  // ★D15余债(2026-10-13):全屏页 uiBlocking——可见置位/收板还原(owned 旗);
  //  普通面板不置位;整屏指针让位
  it('fullscreen 面板:uiBlocking 置位+整屏让位;收板还原', () => {
    const g = { input: { uiBlocking: false } };
    (globalThis as { __swGame?: unknown }).__swGame = g;
    modUiSetInGame(true);
    const fs = modUiPanel('m', 'fs', { x: 0, y: 0, width: 400, height: 300, fullscreen: true });
    expect(g.input.uiBlocking).toBe(true);
    expect(modUiBlockingPointer()).toBe(true);   // 整屏让位(不论指针)
    const norm = modUiPanel('m', 'nm', { x: 500, y: 500, width: 200, height: 140 });
    norm.show();
    fs.hide();
    expect(g.input.uiBlocking).toBe(false);      // 全收 fullscreen 后还原
    // norm 在(500,500)不在指针(0,0)下=不整屏让位(普通面板=盒命中语义)
    expect(modUiBlockingPointer()).toBe(false);
    fs.show();
    expect(g.input.uiBlocking).toBe(true);
    modUiSetInGame(false);                        // 退世界清
    expect(g.input.uiBlocking).toBe(false);
    delete (globalThis as { __swGame?: unknown }).__swGame;
  });

  // ★蓝队自检(2026-10-13):原版模态先置 uiBlocking=true → fullscreen 开关 →
  //  原版置位保留(裸 owned 旗曾连原版的一起清=互踩)
  it('fullscreen×原版模态互踩:claim 期 preExisting 记位,释放不清原版', () => {
    const g = { input: { uiBlocking: false } };
    (globalThis as { __swGame?: unknown }).__swGame = g;
    modUiSetInGame(true);
    g.input.uiBlocking = true;   // 原版模态(图鉴/研究)先置
    const fs = modUiPanel('m', 'fs2', { x: 0, y: 0, width: 400, height: 300, fullscreen: true });
    expect(g.input.uiBlocking).toBe(true);
    fs.hide();                    // mod 全屏收 → 原版置位不得被清
    expect(g.input.uiBlocking).toBe(true);
    fs.show(); fs.hide();
    expect(g.input.uiBlocking).toBe(true);
    g.input.uiBlocking = false;   // 原版模态自己收
    fs.show();
    expect(g.input.uiBlocking).toBe(true);   // 此时 preExisting=false → 我们置位
    fs.hide();
    expect(g.input.uiBlocking).toBe(false);  // 我们清自己的
    delete (globalThis as { __swGame?: unknown }).__swGame;
  });
});
