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
    });
    keyHandlers.length = 0;
    _resetModKbdNavForTests();
    _resetModUiForTests();
    modUiSetInGame(false);
    modUiSetInGame(true);
  });

  it('焦点序列/hover 语义/Enter 激活/越界校正', () => {
    modUiSetInGame(true);
    const p = modUiPanel('m', 'nav', { x: 10, y: 10, width: 300, height: 220 });
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
});
