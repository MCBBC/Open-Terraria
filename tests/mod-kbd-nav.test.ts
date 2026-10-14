// ★键盘导航域守卫(2026-10-14):焦点序列/hover 语义复用/Enter 激活/越界校正。
//   锚:kbdNav(installModKbdNav/invalidateModKbdNav)+mods/ui 树变沿接线。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { modUiPanel, modUiSetInGame, _resetModUiForTests } from '../src/mods/ui';
import { installModKbdNav, invalidateModKbdNav, _resetModKbdNavForTests, _kbdNavDebug } from '../src/mods/kbdNav';
import { VUI } from '../src/vui/VUI';
import { UIScale } from '../src/vui/draw/UIScale';

const keyHandlers: Array<(e: KeyboardEvent) => void> = [];

const fire = (key: string, shift = false): void => {
  const e = { key, shiftKey: shift, preventDefault: () => {}, stopPropagation: () => {} } as unknown as KeyboardEvent;
  for (const h of keyHandlers) h(e);
};

describe('键盘导航域:mod 面板焦点导航', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      addEventListener: (t: string, fn: (e: never) => void) => { if (t === 'keydown') keyHandlers.push(fn as never); },
      removeEventListener: (t: string, fn: unknown) => {
        if (t === 'keydown') { const i = keyHandlers.indexOf(fn as never); if (i >= 0) keyHandlers.splice(i, 1); }
      },
    });
    keyHandlers.length = 0;
    _resetModKbdNavForTests();
    _resetModUiForTests();
    modUiSetInGame(false);
    modUiSetInGame(true);
  });

  it('焦点序列/hover 语义/Enter 激活/越界校正', () => {
    modUiSetInGame(true);
    const p = modUiPanel('m', 'nav', { x: 10, y: 10, width: 300, height: 220, fullscreen: true });   // ★KB-1:fullscreen=消费门恒开,隔离测试焦点语义
    const clicks: string[] = [];
    const hovers: number[] = [];
    const b1 = { c: 0, h: 0 };
    // 两交互元素(addButton=有 click 订阅)+一非交互(addText)
    p.addButton('B1', { x: 10, y: 40, w: 80, onClick: () => clicks.push('b1') });
    p.addText('非交互', { x: 10, y: 80 });
    p.addButton('B2', { x: 10, y: 110, w: 80, onClick: () => clicks.push('b2') });
    // hover 探针(树序=B1,B2)
    const list = VUI.ui.current!.children[0]!.children;
    for (const el of list) el.onMouseOver(() => hovers.push(1));
    invalidateModKbdNav();   // 树变沿失效

    installModKbdNav();
    expect(keyHandlers.length).toBeGreaterThan(0);
    // 诊断:面板现役态+候选数
    expect(VUI.ui.current).not.toBeNull();
    const probe = VUI.ui.current!.children;
    let clickCount = 0;
    for (const c of probe) for (const e2 of c.children) {
      const h = (e2 as unknown as { handlers?: Record<string, Set<unknown>> }).handlers;
      if (h?.click) clickCount++;
    }
    expect(clickCount).toBeGreaterThanOrEqual(2);

    fire('ArrowDown');   // 焦点→B1
    fire('ArrowDown');   // 焦点→B2
    fire('Enter');       // 激活 B2
    const dbgTree = (el: unknown, d: number): string[] => {
      const e = el as { children?: unknown[]; uiState?: unknown; handlers?: Record<string, Set<unknown>>; constructor?: { name: string } };
      const row = `${' '.repeat(d)}${e.constructor?.name} ui=${e.uiState ? 'Y' : 'N'} click=${e.handlers?.click ? e.handlers.click.size : 0}`;
      const out = [row];
      for (const c of (e.children ?? []) as unknown[]) out.push(...dbgTree(c, d + 1));
      return out;
    };
    console.log('[dbg] clicks=', clicks, 'nav=', _kbdNavDebug(), '\n' + dbgTree(VUI.ui.current, 0).join('\n'));
    expect(clicks).toEqual(['b2']);
    expect(hovers.length).toBeGreaterThanOrEqual(2);   // mouseOver 程序化派发=hover 语义复用

    fire('ArrowDown');   // 越界→回绕 B1
    fire('Enter');
    expect(clicks).toEqual(['b2', 'b1']);

    fire('ArrowUp');     // 回绕→B2
    fire('Enter');
    expect(clicks).toEqual(['b2', 'b1', 'b2']);
  });

  it('KB-3 removeElement:tag 簿移除/kbdNav 焦点摘/未知 tag false', () => {
    modUiSetInGame(true);
    const p = modUiPanel('m', 'rm', { x: 10, y: 10, width: 300, height: 220, fullscreen: true });
    let clicked = 0;
    p.addButton('A', { x: 10, y: 40, w: 60, onClick: () => clicked++ });
    p.addButton('B', { x: 10, y: 80, w: 60, onClick: () => clicked++, tag: 'btnB' });
    installModKbdNav();
    // tag 簿移除
    expect(p.removeElement('btnB')).toBe(true);
    expect(p.removeElement('btnB')).toBe(false);   // 已删=false
    expect(p.removeElement('ghost')).toBe(false);  // 未知 tag=false
    // A 仍可激活;B 已摘(焦点序跳过)
    fire('ArrowDown');
    fire('Enter');
    expect(clicked).toBe(1);   // 只 A 响应
    fire('ArrowDown');         // 回绕仍 A(B 摘除后焦点集=1)
    fire('Enter');
    expect(clicked).toBe(2);
  });

  it('文本输入让位:activeElement=INPUT 时全放行(UITextBox 编辑不劫)', () => {
    modUiSetInGame(true);
    // ★R-B-KB-1:消费门=输入让位面(fullscreen=整屏让位)——普通面板+指针在外
    //  本就不消费(世界键放行),本测改用 fullscreen 面板隔离 INPUT 门自身
    const p = modUiPanel('m', 'txt', { x: 10, y: 10, width: 300, height: 200, fullscreen: true });
    let clicked = 0;
    p.addButton('B', { x: 10, y: 40, w: 80, onClick: () => clicked++ });
    installModKbdNav();
    // 模拟 UITextBox 隐藏 input 聚焦态
    const fakeInput = { tagName: 'INPUT' };
    vi.stubGlobal('document', { activeElement: fakeInput });
    fire('ArrowDown');
    console.log('[dbg3] doc=', typeof document, (document as unknown as { activeElement?: { tagName: string } }).activeElement?.tagName, 'clicked=', clicked);
    fire('Enter');
    expect(clicked).toBe(0);   // INPUT 聚焦=导航全放行
    vi.stubGlobal('document', { activeElement: { tagName: 'CANVAS' } });
    fire('ArrowDown');
    console.log('[dbg4] nav=', _kbdNavDebug(), 'clicked=', clicked);
    fire('Enter');
    expect(clicked).toBe(1);   // 非输入态照常
  });
});
