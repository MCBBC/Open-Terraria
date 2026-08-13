// 一次性:死亡文本全分支冒烟(所有 DeathCause kind 均产出非空且无残留占位符)
// 默认 skip;SW_AUDIT=1 npx vitest run tests/_death-text.test.ts
import { describe, it, expect } from 'vitest';
const AUDIT = !!process.env.SW_AUDIT;
import { createDeathText, type DeathCause } from '../src/i18n/RandomText';
import { Lang } from '../src/i18n/Lang';

(AUDIT ? describe : describe.skip)('死亡文本全分支', () => {
  it('每个 kind 产出非空文本且无残留 {n}', async () => {
    await Lang.init('zh-Hans').catch(() => undefined);
    const causes: DeathCause[] = [
      { kind: 'npc', name: '僵尸' },
      { kind: 'fell' }, { kind: 'drowned' }, { kind: 'lava' },
      { kind: 'defaultWrap' }, { kind: 'slain' }, { kind: 'petrified' },
      { kind: 'stabbed' }, { kind: 'suffocated' }, { kind: 'burned' },
      { kind: 'poisoned' }, { kind: 'electrocuted' }, { kind: 'triedToEscape' },
      { kind: 'tongued' }, { kind: 'teleportFail' }, { kind: 'inferno' },
      { kind: 'diedInTheDark' }, { kind: 'starved' }, { kind: 'space' },
      { kind: 'teamTank' }, { kind: 'underground' }, { kind: 'vampire' },
    ];
    for (const c of causes) {
      const t = createDeathText('测试员', c, '泰拉世界');
      expect(t.length, c.kind).toBeGreaterThan(2);
      expect(/\{\d\}/.test(t), `${c.kind} 残留占位符: ${t}`).toBe(false);
      if (AUDIT) console.log(c.kind.padEnd(16), t);
    }
  });
});
