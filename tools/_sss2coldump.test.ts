// SSSSSSSS2 一次性：导出 JS id ↔ 原版 sheet 双向表供独立 dump 工具使用（无浏览器依赖）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

(it ? it : it.skip)('export tile maps', () => {
  const rev: Record<string, number> = {};   // sheet -> jsid
  const fwd: string[] = [];
  TILE_DEFS.forEach((d, i) => {
    const s = d?.vanilla?.sheet;
    if (typeof s === 'number' && s >= 0 && !(s === 0 && i !== 0)) { rev[s] ??= i; }
    fwd[i] = String(d?.vanilla?.sheet ?? -1);
  });
  writeFileSync('/tmp/sss2-out/tile-rev.json', JSON.stringify(rev));
  writeFileSync('/tmp/sss2-out/tile-fwd.json', JSON.stringify(fwd));
  console.log('tile maps exported', Object.keys(rev).length);
});
