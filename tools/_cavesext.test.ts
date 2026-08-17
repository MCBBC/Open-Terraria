// 一次性诊断（_ 前缀，用后即删）：链外扩展批（2026-08-17）四个新检查点 JS vs
// /tmp caves-oracle 扩展产物对拍——金标零写（产物在 /tmp，不进 tests/golden/）。
// SW_FREEZE_CAVES 置位以抑制 caves-checkpoint.test 自身的重量级 describe 注册。
// 运行：npx vitest run tools/_cavesext.test.ts（纯 vitest，无需 dev server）
process.env.SW_FREEZE_CAVES = '1';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('链外扩展检查点对拍（vs /tmp caves-oracle 扩展产物）', () => {
  const cases = [
    { file: '/tmp/caves-ext-9293480.json', seedText: '9293480', evil: 0 as const },
    { file: '/tmp/caves-ext-SandboxWorld.json', seedText: 'SandboxWorld', evil: 1 as const },
  ];
  for (const c of cases) {
    it(`种子 ${c.seedText}：全链含 4 新检查点 type/flags/liquid 哈希全等`, async () => {
      const { chainCheckpoints } = await import('../tests/caves-checkpoint.test');
      const golden = JSON.parse(readFileSync(c.file, 'utf8')) as { checkpoints: string[] };
      const gold = new Map<string, string>();
      for (const line of golden.checkpoints) {
        const [name, typ, act, wal, liq] = line.split(/[| ]+/);
        gold.set(name, `${typ} ${act} ${liq}`);
      }
      const res = chainCheckpoints(c.seedText, c.evil);
      let firstBad = '';
      let n = 0;
      for (const [k, v] of gold) {
        if (!res.grids.has(k)) continue;   // oracle 独有内部段名（dirtlayer/rocklayer，JS 只有 surfacecaves 总名）——已知名字错位项跳过
        n++;
        const ours = res.grids.get(k);
        if (ours !== v && !firstBad) firstBad = k;
        console.log(`${k.padEnd(22)} ${ours} vs ${v} ${ours === v ? '✓' : '✗'}`);
      }
      console.log(`total=${n} 新四项=${['statues', 'cavewalls', 'undergroundjungletrees', 'quickcleanup'].map((m) => `${m}:${res.grids.get(m) === gold.get(m) ? '✓' : '✗'}`).join(' ')}`);
      expect(firstBad, '首个分歧检查点').toBe('');
      expect(n, '检查点总数（63 旧 + 4 新）').toBeGreaterThanOrEqual(67);
    }, 600000);
  }
});
