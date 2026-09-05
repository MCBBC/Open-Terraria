// IIII198: 单点取证——(20,832) 首分歧罐格邻域 before/after 全量状态 + JS 帧解码
// 用法：npx vitest run tools/_iii198cell.test.ts  (SW_I198C_X/SW_I198C_Y 可换点)
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const GOLD4 = `${process.env.HOME}/GoldenChains/i106/x86-iamerror/104_Remove_Broken_Traps`;
const GOLD5 = `${process.env.HOME}/GoldenChains/i106/x86-iamerror/105_Final_Cleanup`;
const JS4 = process.env.SW_I198C_J4 ?? '/tmp/iii198-out/js-slot104';
const JS5 = process.env.SW_I198C_J5 ?? '/tmp/iii195-out/js-slot105';
const W = 4200, H = 1200, N = W * H;
const CX = Number(process.env.SW_I198C_X ?? 20), CY = Number(process.env.SW_I198C_Y ?? 832);
const R = Number(process.env.SW_I198C_R ?? 5);

it('iii198 cell forensics', () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const g4t = rd16(`${GOLD4}.typ`), g4a = readFileSync(`${GOLD4}.act`), g4l = rd16(`${GOLD4}.liq`);
  const g5t = rd16(`${GOLD5}.typ`), g5a = readFileSync(`${GOLD5}.act`), g5l = rd16(`${GOLD5}.liq`);
  const j4t = new Uint16Array(readFileSync(`${JS4}/base_type.bin`).buffer), j4f = new Uint8Array(readFileSync(`${JS4}/base_flags.bin`).buffer), j4fx = new Uint16Array(readFileSync(`${JS4}/base_frameX.bin`).buffer), j4fy = new Uint16Array(readFileSync(`${JS4}/base_frameY.bin`).buffer), j4l = rd16(`${JS4}/base_liquid.bin`);
  const j5t = new Uint16Array(readFileSync(`${JS5}/base_type.bin`).buffer), j5f = new Uint8Array(readFileSync(`${JS5}/base_flags.bin`.toString())), j5fx = new Uint16Array(readFileSync(`${JS5}/base_frameX.bin`).buffer), j5fy = new Uint16Array(readFileSync(`${JS5}/base_frameY.bin`).buffer), j5l = rd16(`${JS5}/base_liquid.bin`);

  const cell = (label: string, x: number, y: number) => {
    const i = y * W + x;
    const ga = g4a[i] & 1, ja = j4f[i] & 1;
    return `${label}(${x},${y}) x86[${ga ? `t${g4t[i]} l${g4l[i]}` : 'off'}→${(g5a[i] & 1) ? `t${g5t[i]} l${g5l[i]}` : 'off'}] js[${ja ? `t${SHEET[j4t[i]]} fx${j4fx[i]} fy${j4fy[i]} l${j4l[i]}` : `off(ghost t${SHEET[j4t[i]]} fx${j4fx[i]} fy${j4fy[i]})`}→${(j5f[i] & 1) ? `t${SHEET[j5t[i]]} fx${j5fx[i]} fy${j5fy[i]} l${j5l[i]}` : `off(ghost t${SHEET[j5t[i]]} fx${j5fx[i]} fy${j5fy[i]})`}]`;
  };
  console.log(`=== 窗口 (${CX - R}..${CX + R}, ${CY - R}..${CY + R}) before→after ===`);
  for (let y = CY - R; y <= CY + R; y++) {
    for (let x = CX - R; x <= CX + R; x++) console.log(cell('  ', x, y));
  }
  // JS 帧解码 CheckPot 复算（对每个 28 格：锚/2x2 一致性/支撑）
  const wrap2 = (v: number) => { let n = Math.floor(v / 18); while (n > 1) n -= 2; return n; };
  console.log('\n=== JS CheckPot 复算（before 帧） ===');
  for (let y = CY - R; y <= CY + R; y++) for (let x = CX - R; x <= CX + R; x++) {
    const i = y * W + x;
    if (!(j4f[i] & 1) || SHEET[j4t[i]] !== 28) continue;
    const x0 = x - wrap2(j4fx[i]);
    let n3 = Math.floor(j4fy[i] / 18), num4 = 0;
    while (n3 > 1) { n3 -= 2; num4++; }
    const y0 = y - n3;
    let bad = false; const why: string[] = [];
    for (let k = x0; k < x0 + 2 && !bad; k++) for (let l = y0; l < y0 + 2; l++) {
      const q = l * W + k;
      const ok = (j4f[q] & 1) && SHEET[j4t[q]] === 28 && wrap2(j4fx[q]) === k - x0 && j4fy[q] === (l - y0) * 18 + num4 * 36;
      if (!ok) { bad = true; why.push(`(${k},${l}) act${j4f[q] & 1} t${SHEET[j4t[q]]} fx${j4fx[q]}(exp${(k - x0) * 18}..) fy${j4fy[q]}(exp${(l - y0) * 18 + num4 * 36})`); }
    }
    for (let k = x0; k < x0 + 2; k++) {
      const q = (y0 + 2) * W + k;
      const solid = (j4f[q] & 1) && [0, 1, 2, 5, 30, 53, 112, 116, 123, 147, 161, 163, 199, 200, 203, 224, 234, 396, 397, 398, 399, 402, 403].includes(SHEET[j4t[q]]);
      if (!solid) why.push(`sup(${k},${y0 + 2}) act${j4f[q] & 1} t${SHEET[j4t[q]]}`);
    }
    console.log(`  jsPot(${x},${y}) anchor=(${x0}..${x0 + 1},${y0}..${y0 + 1}) style=${num4} bad=${bad} ${why.join(' | ')}`);
  }
}, 600_000);
