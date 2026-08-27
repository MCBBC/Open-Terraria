// SSSS2 一次性：导出生成期实心/半实心表（sheet 域）供 python 离线重放
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { genSolidType, snapshotGenSolid, VAN_TILE_SOLID_EXTRA } from '../src/world/gen/vanilla/GenSolid';

it('export gen-solid tables', () => {
  const snap = snapshotGenSolid();
  void snap;
  const solid: Record<string, boolean> = {};
  const solidTop: Record<string, boolean> = {};
  for (let t = 0; t < TILE_DEFS.length; t++) {
    const d = TILE_DEFS[t];
    if (!d?.vanilla || typeof d.vanilla.sheet !== 'number') continue;
    const sh = String(d.vanilla.sheet);
    const isSolidExtra = VAN_TILE_SOLID_EXTRA.has(d.vanilla.sheet) || genSolidType(t);
    // 同 sheet 多 def 时取并集（solid 与 solidTop 分立聚合）
    solid[sh] = (solid[sh] ?? false) || isSolidExtra;
    solidTop[sh] = (solidTop[sh] ?? false) || !!d.solidTop;
  }
  const sheetMap: Record<string, number> = {};
  for (let t = 0; t < TILE_DEFS.length; t++) {
    const sh = TILE_DEFS[t]?.vanilla?.sheet;
    if (typeof sh === 'number' && !(sh in sheetMap)) sheetMap[String(sh)] = t;
  }
  writeFileSync('/tmp/sss2-out/ntb/gen-tables.json', JSON.stringify({ solid, solidTop, sheetMap }));
});
