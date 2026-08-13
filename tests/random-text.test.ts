import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageManager } from '../src/i18n/LanguageManager';
import { randomWorldName, newNpcName, randomPlayerName, createDeathText } from '../src/i18n/RandomText';

// 真实 zh-Hans 包注入（对标原版 RandomFromCategory 的数据面）
beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

describe('原版随机文本体系', () => {
  it('随机世界名：组合模板产物 ≤27 字符且非空（UIWorldCreation.cs:1004-1021）', () => {
    for (let i = 0; i < 50; i++) {
      const n = randomWorldName();
      expect(n.length).toBeGreaterThan(0);
      expect(n.length).toBeLessThanOrEqual(27);
    }
  });

  it('NPC 随机名：向导(22)/商人(17)/护士(18) 有池；守卫老人(37) 无池（NPC.cs:7260）', () => {
    for (const t of [22, 17, 18, 19, 20]) {
      expect(newNpcName(t).length).toBeGreaterThan(0);
    }
    expect(newNpcName(37)).toBe('');
    expect(newNpcName(9999)).toBe('');
  });

  it('玩家随机名：非空（人类 NPC 名字池并集，原版无玩家池——偏差见模块注记）', () => {
    expect(randomPlayerName().length).toBeGreaterThan(0);
  });

  it('死亡文本：各死因都含角色名；NPC 死因含凶手名与「凶手」措辞（Lang.cs:1010+）', () => {
    const name = '泰拉瑞亚人';
    expect(createDeathText(name, { kind: 'npc', name: '蓝史莱姆' })).toContain(name);
    expect(createDeathText(name, { kind: 'npc', name: '蓝史莱姆' })).toContain('蓝史莱姆');
    expect(createDeathText(name, { kind: 'npc', name: '蓝史莱姆' })).toContain('凶手');
    expect(createDeathText(name, { kind: 'fell' })).toContain(name);
    expect(createDeathText(name, { kind: 'drowned' })).toContain(name);
    expect(createDeathText(name, { kind: 'lava' })).toContain(name);
    expect(createDeathText(name, { kind: 'defaultWrap' })).toContain(name);  // 旧称 'default' 已更名
  });

  it('死亡文本池可命中（多次抽样至少出现两种不同措辞）', () => {
    const set = new Set<string>();
    for (let i = 0; i < 30; i++) set.add(createDeathText('玩家甲', { kind: 'fell' }));
    expect(set.size).toBeGreaterThan(1);
  });
});
