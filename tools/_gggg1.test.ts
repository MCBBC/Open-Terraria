// GGGGGGGG 批一次性探针（用毕即删）：JS 链 dungeon 检查点网格导出（vanilla sheet 映射版）——
// 与 oracle GRID_DUMP=dungeon:/tmp/gggg-or32 对拍（#32 槽 1456→1457 增量归因）。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';
import { TILE_DEFS } from '../src/data/tiles';

it('dump JS dungeon grid (sheet-mapped)', () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  (globalThis as { __cavesGridExportRaw?: unknown }).__cavesGridExportRaw = null;
  // 借 chainCheckpoints 的导出钩拿原始网格，再映射落盘
  const mod = globalThis as { __cavesGridExport?: { at: string; dir: string } };
  mod.__cavesGridExport = { at: 'dungeon', dir: '/tmp/gggg-js32raw' };
  const res = chainCheckpoints('9293480', 0);
  console.log('dungeon hash:', res.grids.get('dungeon'));
  // 读回原始 typ 并映射
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const raw = readFileSync('/tmp/gggg-js32raw.typ');
  const n = raw.length >> 1;
  const mapped = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = raw.readUInt16LE(i * 2);
    mapped.writeUInt16LE(SHEET[v] >= 0 ? SHEET[v] : 9999, i * 2);
  }
  writeFileSync('/tmp/gggg-js32.typ', mapped);
  console.log('mapped typ written');
}, 300000);
