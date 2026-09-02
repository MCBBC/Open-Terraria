// IIII186 批一次性取证仪④：槽24（浮空岛屋尾）JS 全通道 vs x86 069 dump 逐格聚类。
// 输入：/tmp/iii186-out/pipeslot-24/base_*.bin（SW_I81_SAVE 产物）
//       ~/GoldenChains/golden-remix/dumps/069_Floating_Island_Houses.{act,typ,wal,half,slope,inact}
// typ 对拍过 SHEET 映射（JS 内部 id→vanilla sheet,LXVII 判例）;act/wal/half/slope/inact 直比。
// 用法：npx vitest run tools/_iii186slot24diff.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { TILE_DEFS } from '../src/data/tiles';

(it as (n: string, f: () => void) => void)('IIIII186 slot24 cluster diff', () => {
  const D = '/tmp/iii186-out/pipeslot-24';
  const G = `${homedir()}/GoldenChains/golden-remix/dumps/069_Floating_Island_Houses`;
  const W = 4200, H = 1200, N = W * H;
  const rd = (p: string): Uint8Array | Uint16Array => {
    const b = readFileSync(p);
    return b.byteLength === N ? new Uint8Array(b.buffer, b.byteOffset, N) : new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2);
  };
  const jsFlags = rd(`${D}/base_flags.bin`) as Uint8Array;
  const jsType = rd(`${D}/base_type.bin`) as Uint16Array;
  const jsWall = rd(`${D}/base_wall.bin`) as Uint16Array;
  const jsHalf = rd(`${D}/base_half.bin`) as Uint8Array;
  const jsSlope = rd(`${D}/base_slope.bin`) as Uint8Array;
  const gAct = rd(`${G}.act`) as Uint8Array;
  const gTyp = rd(`${G}.typ`) as Uint16Array;
  const gWal = rd(`${G}.wal`) as Uint16Array;
  const gHalf = rd(`${G}.half`) as Uint8Array;
  const gSlope = rd(`${G}.slope`) as Uint8Array;
  const gInact = rd(`${G}.inact`) as Uint8Array;
  // JS 内部 id→sheet 映射
  const sheetOf = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const v = (TILE_DEFS[i] as unknown as { vanilla?: { sheet?: number } } | undefined)?.vanilla?.sheet;
    if (v !== undefined) sheetOf[i] = v!;
  }
  const cells: Array<{ x: number; y: number; k: string; js: string; g: string }> = [];
  const YMAX = Number(process.env.SW_I186_YMAX ?? 200);
  for (let y = 0; y < YMAX; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const jf = jsFlags[i]! & 1;
      const gf = gAct[i]!;
      const jt = jsFlags[i] ? sheetOf[jsType[i]!] ?? -2 : 0;
      const gt = gAct[i] ? gTyp[i]! : 0;
      const diffs: string[] = [];
      if (jf !== gf) diffs.push(`act${jf}/${gf}`);
      if (jt !== gt) diffs.push(`typ${jt}/${gt}`);
      if (jsWall[i] !== gWal[i]) diffs.push(`wal${jsWall[i]}/${gWal[i]}`);
      if (jsHalf[i] !== gHalf[i]) diffs.push(`half${jsHalf[i]}/${gHalf[i]}`);
      if (jsSlope[i] !== gSlope[i]) diffs.push(`slope${jsSlope[i]}/${gSlope[i]}`);
      if ((jsFlags[i]! & 32) !== 0 !== (gInact[i] !== 0)) diffs.push('inact');
      if (diffs.length) cells.push({ x, y, k: diffs.join(','), js: `${jf}t${jt}w${jsWall[i]}`, g: `${gf}t${gt}w${gWal[i]}` });
    }
  }
  console.log(`[i186c] 总差格=${cells.length}`);
  // 聚类：按 y 带分组打印
  const byY = new Map<number, typeof cells>();
  for (const c of cells) {
    const arr = byY.get(c.y) ?? [];
    arr.push(c);
    byY.set(c.y, arr);
  }
  const ys = [...byY.keys()].sort((a, b) => a - b);
  for (const y of ys) {
    const arr = byY.get(y)!;
    const xs = arr.map((c) => c.x);
    const kinds = new Map<string, number>();
    for (const c of arr) kinds.set(c.k, (kinds.get(c.k) ?? 0) + 1);
    console.log(`[i186c] y=${y} n=${arr.length} x∈[${xs[0]}..${xs[xs.length - 1]}] kinds=${JSON.stringify([...kinds.entries()])}`);
  }
  // 全量格明细
  for (const c of cells) console.log(`[i186c] (${c.x},${c.y}) ${c.k} js[${c.js}] x86[${c.g}]`);
});
