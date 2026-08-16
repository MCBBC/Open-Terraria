// 一次性诊断（dungeonI 转写债，2026-08-16 已修复收档）：JS↔oracle 网格逐格 diff。
// 输入：/tmp/cs-{dgg,dgi}.{typ,act}（oracle GRID_DUMP=dungeon{G,I}:/tmp/cs-dg{g,i}）与
// /tmp/js-{dgg,dgi}.{typ,act}（_dgidump.test.ts 产物，typ=internal id → 此处经
// TILE_DEFS.vanilla.sheet 映射回原版空间）。缺文件时跳过（默认不进全量跑）。
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const W = 4200, H = 1200;
const READY = existsSync('/tmp/cs-dgi.typ') && existsSync('/tmp/js-dgi.typ');

function loadTyp(p: string, mapped: boolean): Int32Array {
  const buf = readFileSync(p);
  const n = W * H;
  const out = new Int32Array(n);
  let vid: Int32Array | null = null;
  if (mapped) {
    vid = new Int32Array(TILE_DEFS.length).fill(-1);
    for (let i = 0; i < TILE_DEFS.length; i++) {
      const s = TILE_DEFS[i]?.vanilla?.sheet;
      if (typeof s === 'number') vid[i] = s;
    }
  }
  for (let i = 0; i < n; i++) {
    const v = buf.readUInt16LE(i * 2);
    out[i] = mapped ? (vid ? vid[v] : v) : v;
  }
  return out;
}

function diff(tag: string): void {
  const csT = loadTyp(`/tmp/cs-${tag}.typ`, false);
  const jsT = loadTyp(`/tmp/js-${tag}.typ`, true);
  const csA = readFileSync(`/tmp/cs-${tag}.act`);
  const jsA = readFileSync(`/tmp/js-${tag}.act`);
  let actDiff = 0, typDiff = 0, ghoDiff = 0;
  const cells: string[] = [];
  for (let i = 0; i < W * H; i++) {
    const ca = csA[i] !== 0, ja = jsA[i] !== 0;
    if (ca !== ja) {
      actDiff++;
      if (cells.length < 40) cells.push(`ACT x=${i % W} y=${(i / W) | 0} cs=${ca ? 1 : 0}/${csT[i]} js=${ja ? 1 : 0}/${jsT[i]}`);
      continue;
    }
    if (ca && csT[i] !== jsT[i]) {
      typDiff++;
      if (cells.length < 40) cells.push(`TYP x=${i % W} y=${(i / W) | 0} cs=${csT[i]} js=${jsT[i]}`);
    } else if (!ca && csT[i] !== jsT[i]) ghoDiff++;
  }
  console.log(`[${tag}] actDiff=${actDiff} typDiff(活性)=${typDiff} ghostDiff=${ghoDiff}`);
  for (const c of cells) console.log('  ' + c);
}

(READY ? it : it.skip)('diff dungeonG/dungeonI grids', () => {
  if (existsSync('/tmp/cs-dgg.typ')) diff('dgg');
  diff('dgi');
});
