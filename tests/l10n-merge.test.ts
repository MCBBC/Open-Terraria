// l10n-merge 纯函数单测(尾逗号/扁平化/合并/{$}展开/{?}剥离)。
import { describe, it, expect } from 'vitest';
import { parseLenient, flattenDeep, mergePacks, expandCopyCommands, stripConditionMarkers } from '../scripts/l10n-merge.mjs';

describe('parseLenient(原版 JSON 尾逗号/BOM)', () => {
  it('尾逗号容错', () => {
    expect(parseLenient('{"UI": {"A": "x",}}')).toEqual({ UI: { A: 'x' } });
    expect(parseLenient('{"a": [1,2,],}')).toEqual({ a: [1, 2] });
  });
  it('BOM 剥离', () => {
    expect(parseLenient('﻿{"a": 1}')).toEqual({ a: 1 });
  });
});

describe('flattenDeep(自定义文案深层嵌套 → 扁平)', () => {
  it('顶层段=category,其余路径点连接', () => {
    expect(flattenDeep({ Mods: { SandboxWorld: { UI: { Backpack: '背包' } } } }))
      .toEqual({ Mods: { 'SandboxWorld.UI.Backpack': '背包' } });
  });
  it('两层原版形状不受影响', () => {
    expect(flattenDeep({ UI: { Play: '开始' } })).toEqual({ UI: { Play: '开始' } });
  });
  it('同类别多组嵌套全部保留(回归:Object.assign 整体替换曾致只剩最后一组)', () => {
    const flat = flattenDeep({
      Mods: { SandboxWorld: { UI: { A: 'a' }, Buff: { B: 'b' }, CharSelect: { C: 'c' } } },
    });
    expect(flat.Mods).toEqual({
      'SandboxWorld.UI.A': 'a',
      'SandboxWorld.Buff.B': 'b',
      'SandboxWorld.CharSelect.C': 'c',
    });
  });
});

describe('mergePacks(键级 merge,后者覆盖)', () => {
  it('同类别跨包合流 + 冲突以高优先级为准', () => {
    const { out, conflicts } = mergePacks([
      { UI: { A: 'en-A', B: 'en-B' } },
      { UI: { B: 'zh-B', C: 'zh-C' } },
    ]);
    expect(out).toEqual({ UI: { A: 'en-A', B: 'zh-B', C: 'zh-C' } });
    expect(conflicts).toEqual(['UI.B: "en-B" → "zh-B"']);
  });
});

describe('expandCopyCommands({$Key} 跨键复制,LanguageManager.cs:158)', () => {
  it('展开已有键;引用不存在的键替换为裸键名(原版 L171 `: text2` 语义——曾误读为保留原样,2026-08-18 纠正)', () => {
    const table = {
      ItemTooltip: { A: '效果:{$Common.Bonus}', Bad: '{$Common.NotExist}' },
      Common: { Bonus: '+1 速度' },
    };
    const { unresolved } = expandCopyCommands(table);
    expect(table.ItemTooltip.A).toBe('效果:+1 速度');
    expect(table.ItemTooltip.Bad).toBe('Common.NotExist');   // 裸键名(L171)
    expect(unresolved).toEqual([]);   // 裸键替换后无残留(循环引用才落 unresolved)
  });
  it('链式引用迭代到不动点(≤100 次)', () => {
    const table = {
      A: { X: '{$B.Y}!' },
      B: { Y: '{$C.Z}' },
      C: { Z: 'deep' },
    };
    expandCopyCommands(table);
    expect(table.A.X).toBe('deep!');
  });
});

describe('stripConditionMarkers({?Cond}/{?!Cond} 剥标记保留文本)', () => {
  it('剥掉标记、保留正文(城镇 NPC chatter 语义)', () => {
    const table = { BartenderChatter: { '1': '{?Day}有人看见树妖吗？', '2': '{?!Day}那里真的很安静。' } };
    const touched = stripConditionMarkers(table);
    expect(table.BartenderChatter['1']).toBe('有人看见树妖吗？');
    expect(table.BartenderChatter['2']).toBe('那里真的很安静。');
    expect(touched).toHaveLength(2);
  });
  it('不动 {0} 位置参数与普通文本', () => {
    const table = { UI: { Greet: '你好 {0}', Plain: '普通' } };
    stripConditionMarkers(table);
    expect(table.UI.Greet).toBe('你好 {0}');
    expect(table.UI.Plain).toBe('普通');
  });
});
