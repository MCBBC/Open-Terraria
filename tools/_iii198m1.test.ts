// IIII198: 机制1验证——JS 杀罐的支撑行 act1-type0(残型格)统计
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const W = 4200, H = 1200, N = W * H;

it('iii198 mechanism1', () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const load = (dir: string) => ({
    t: new Uint16Array(readFileSync(`${dir}/base_type.bin`).buffer),
    a: new Uint8Array(readFileSync(`${dir}/base_flags.bin`).buffer),
  });
  const J4 = load('/tmp/iii198-out/js-slot104');
  const J5 = load('/tmp/iii195-out/js-slot105');
  const rdX = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const rduX = (p: string) => new Uint8Array(readFileSync(p).buffer, readFileSync(p).byteOffset, N);
  const G4 = `${process.env.HOME}/GoldenChains/i106/x86-iamerror/104_Remove_Broken_Traps`;
  const G5 = `${process.env.HOME}/GoldenChains/i106/x86-iamerror/105_Final_Cleanup`;
  const gt4 = rdX(`${G4}.typ`), ga4 = rduX(`${G4}.act`), ga5 = rduX(`${G5}.act`);

  const wrap2 = (v: number) => { let n = Math.floor(v / 18); while (n > 1) n -= 2; return n; };
  const fx4 = rd16('/tmp/iii198-out/js-slot104/base_frameX.bin'), fy4 = rd16('/tmp/iii198-out/js-slot104/base_frameY.bin');

  // JS 杀的罐格 → 解码罐窗 → 支撑行状态分类
  let killedCells = 0;
  let supHasT0 = 0, supHasT0x86Kept = 0, supAllSolid = 0, supOther = 0;
  const potsSeen = new Set<number>();
  for (let y = 6; y < H - 6; y++) for (let x = 6; x < W - 6; x++) {
    const i = y * W + x;
    if (!((J4.a[i] & 1) && !(J5.a[i] & 1) && SHEET[J4.t[i]] === 28)) continue;
    killedCells++;
    const x0 = x - wrap2(fx4[i]);
    let n3 = Math.floor(fy4[i] / 18), num4 = 0;
    while (n3 > 1) { n3 -= 2; num4++; }
    const y0 = y - n3;
    const potKey = y0 * W + x0;
    if (potsSeen.has(potKey)) continue;
    potsSeen.add(potKey);
    // 支撑行两格
    let hasT0 = false, allSolid = true;
    for (let k = x0; k < x0 + 2; k++) {
      const q = (y0 + 2) * W + k;
      const act = (J4.a[q] & 1) === 1;
      const jt = J4.t[q];
      if (act && jt === 0) { hasT0 = true; allSolid = false; continue; }  // JS: 空(非实心)
      const d = TILE_DEFS[jt];
      if (!act || !d || !d.solid || d.platform) allSolid = false;
    }
    if (hasT0) {
      supHasT0++;
      // x86 对该罐是否保留(4格全活)
      let kept = true;
      for (let k = x0; k < x0 + 2 && kept; k++) for (let l = y0; l < y0 + 2; l++) {
        const q = l * W + k;
        if (!(ga5[q] & 1)) kept = false;
      }
      if (kept) supHasT0x86Kept++;
    } else if (allSolid) supAllSolid++;
    else supOther++;
  }
  console.log(`[m1] JS 杀罐格=${killedCells} 罐数=${potsSeen.size}`);
  console.log(`[m1] 支撑行含act1-type0(残型)罐=${supHasT0} 其中x86全保留=${supHasT0x86Kept}`);
  console.log(`[m1] 支撑行全实心罐=${supAllSolid} 其他=${supOther}`);
}, 600_000);
