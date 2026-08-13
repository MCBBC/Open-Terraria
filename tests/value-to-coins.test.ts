// 死亡掉钱文案 ValueToCoins（Main.cs:54649-54689 1:1）
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Lang } from '../src/i18n/Lang';
import { languageManager } from '../src/i18n/LanguageManager';

describe('Lang.valueToCoins（Main.ValueToCoins 1:1）', () => {
  beforeAll(() => {
    // 真实 zh-Hans 包注入（fetch 在 node 测试不可用——同 random-text.test 模式）
    const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
    languageManager.loadPackJson(pack);
  });

  it('逐级拆解：白金×1M/金×10K/银×100/铜', () => {
    expect(Lang.valueToCoins(0)).toBe('');
    expect(Lang.valueToCoins(50)).toBe('50 铜');
    expect(Lang.valueToCoins(12345)).toBe('1 金 23 银 45 铜');
    expect(Lang.valueToCoins(100)).toBe('1 银');
    expect(Lang.valueToCoins(10000)).toBe('1 金');
    expect(Lang.valueToCoins(1000000)).toBe('1 铂金');
    // 12,345,678 = 12 铂金 + 34,5678? 验算：12,345,678 - 12×1,000,000 = 345,678
    // 345,678 → 34 金（340,000）余 5,678 → 56 银（5,600）余 78 铜
    expect(Lang.valueToCoins(12345678)).toBe('12 铂金 34 金 56 银 78 铜');
  });

  it('只显示非零档（原版 if(numN>0) 链）', () => {
    expect(Lang.valueToCoins(10100)).toBe('1 金 1 银');          // 0 铜不显示
    expect(Lang.valueToCoins(1000001)).toBe('1 铂金 1 铜');      // 金银为 0 跳过
  });

  it('死亡行文案拼装（Game.DroppedCoins {0}）', () => {
    expect(Lang.text('Game.DroppedCoins', Lang.valueToCoins(12345)))
      .toBe(`掉了${Lang.valueToCoins(12345)}`);
    expect(Lang.text('Game.DroppedCoins', Lang.valueToCoins(12345))).toContain('1 金');
  });
});
