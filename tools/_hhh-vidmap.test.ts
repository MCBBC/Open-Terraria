// HHHH 批一次性探针：内部 tile id → vanilla sheet / solid / platform 三元组落
// /tmp/hhhh-vidmap2.json（FinalCleanup 尾段 C# 转录的谓词表源）。用后即删。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

it('vidmap2', () => {
  const rows: Array<[number, number, 0 | 1, 0 | 1]> = [];
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const d = TILE_DEFS[i];
    if (!d) continue;
    const sheet = d.vanilla?.sheet;
    rows.push([i, typeof sheet === 'number' ? sheet : -1, d.solid ? 1 : 0, d.platform ? 1 : 0]);
  }
  // 一致性校验：同 sheet 的 solid/platform 必须一致（C# 侧按 sheet 折叠的前提）
  const bySheet = new Map<number, string>();
  let clash = 0;
  for (const [, sheet, s, p] of rows) {
    if (sheet < 0) continue;
    const tag = `${s}${p}`;
    const prev = bySheet.get(sheet);
    if (prev && prev !== tag) { clash++; console.log(`CLASH sheet ${sheet}: ${prev} vs ${tag}`); }
    bySheet.set(sheet, tag);
  }
  writeFileSync('/tmp/hhhh-vidmap2.json', JSON.stringify(rows));
  console.log(`rows=${rows.length} sheets=${bySheet.size} clash=${clash}`);
  console.log('solid sheets:', [...bySheet.entries()].filter(([, v]) => v[0] === '1').map(([k]) => k).join(','));
  console.log('platform sheets:', [...bySheet.entries()].filter(([, v]) => v[1] === '1').map(([k]) => k).join(','));
});
