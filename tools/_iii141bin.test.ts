// IIII110 一次性离线对拍仪（用毕可删）：pipeslot 薄冰管线态 vs x86 dump #055 逐格分解。
// 运行：cd game && npx vitest run tools/_iii141bin.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

(it.skip as unknown as { __run?: boolean });
const RUN = process.env.SW_I141BIN === '1';
(RUN ? it : it.skip)('thin-ice slot offline decomposition', async () => {
  const d = process.env.SW_I141_DIR ?? '/tmp/iii141-out/pipeslot-thinice';
  const g2 = process.env.SW_I141_G2 ?? '';
  const DUMP = process.env.SW_I141_DUMP ?? '055_Ice';
  if (!g2) throw new Error('need SW_I141_G2');
  const hdr = JSON.parse(readFileSync(`${d}/base_hdr.json`, 'utf8')) as { w: number; h: number };
  const w = hdr.w, h = hdr.h, n = w * h;
  const u16 = (b: Buffer): Uint16Array => new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
  const jsType = u16(readFileSync(`${d}/base_type.bin`));
  const jsFlags = readFileSync(`${d}/base_flags.bin`);
  const jsWall = u16(readFileSync(`${d}/base_wall.bin`));
  const jsLiq = readFileSync(`${d}/base_liquid.bin`);
  const xTyp = u16(readFileSync(`${g2}/${DUMP}.typ`));
  const xAct = readFileSync(`${g2}/${DUMP}.act`);
  const xWal = u16(readFileSync(`${g2}/${DUMP}.wal`));
  const xLiq = readFileSync(`${g2}/${DUMP}.liq`);
  // 内部 id → vanilla sheet（同 mile8 SHEET 表构建法）
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  let cntA = 0, cntT = 0, cntW = 0, cntL = 0;
  const pairT = new Map<string, number>();
  const samples: string[] = [];
  for (let i = 0; i < n; i++) {
    const va = xAct[i]!, ja = jsFlags[i]! & 1;
    if (va !== ja) {
      cntA++;
      if (samples.length < 12) samples.push(`A(${i % w},${(i / w) | 0}) v${va} j${ja}`);
    }
    const vt = va ? xTyp[i]! : 0;
    const jt = ja ? (SHEET[jsType[i]!] >= 0 ? SHEET[jsType[i]!]! : 9999) : 0;
    if (vt !== jt) {
      cntT++;
      const k = `T${vt}>${jt}`;
      pairT.set(k, (pairT.get(k) ?? 0) + 1);
      if (samples.length < 12 && Math.abs(vt - jt) > 400) samples.push(`T(${i % w},${(i / w) | 0}) v${vt} j${jt}`);
    }
    if (xWal[i] !== jsWall[i]) cntW++;
    if (xLiq[i] !== jsLiq[i]) cntL++;
  }
  console.log(`[I141bin] A=${cntA} T=${cntT} W=${cntW} L=${cntL}`);
  console.log('[I141bin] topT', [...pairT.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, c]) => `${k}×${c}`).join(' '));
  console.log('[I141bin] samples', samples.join(' | '));
}, 900_000);
