// 读档进度文案回归(用户报"正在安置液体50% - 0%"双重百分比):
// 标签自带 %(tiles/settle 原版水位文案)时 UIWorldLoadState 不得再追加 " - X%"。
import { describe, it, expect } from 'vitest';
import { UIWorldLoadState } from '../src/vui/states/UIWorldLoadState';

const textOf = (s: UIWorldLoadState) =>
  (s as unknown as { header: { text: string } }).header.text;

describe('UIWorldLoadState 进度头(双重百分比修复)', () => {
  it('标签含 %:原样显示,不追加后缀', () => {
    const s = new UIWorldLoadState();
    s.setProgress('正在安置液体 50%', 0);
    expect(textOf(s)).toBe('正在安置液体 50%');
    s.setProgress('正在安置液体 75%', 0.5);
    expect(textOf(s)).toBe('正在安置液体 75%');
  });
  it('标签不含 %:保持 "label - X%" 后缀(既有语义)', () => {
    const s = new UIWorldLoadState();
    s.setProgress('正在读取存档', 0.3);
    expect(textOf(s)).toBe('正在读取存档 - 30%');
    s.setProgress('正在读取存档', 0.6);   // 同标签只更新数字
    expect(textOf(s)).toBe('正在读取存档 - 60%');
  });
});
