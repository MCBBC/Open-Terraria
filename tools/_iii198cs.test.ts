// IIII198: Final_Cleanup 变更集对拍——x86 dump104→dump105 vs JS slot104→slot105。
// 直接度量双方在 FinalCleanup 窗内的【写格变换】(act/typ/liq/lty/half/slope/wal),
// 分类 census + 循环序 (x 主序) 首分歧 + 5×5 窗显影。
// 用法：npx vitest run tools/_iii198cs.test.ts  (SW_I198CS_* 可覆写路径/采样)
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const GOLD4 = process.env.SW_I198CS_G4 ?? `${process.env.HOME}/GoldenChains/i106/x86-iamerror/104_Remove_Broken_Traps`;
const GOLD5 = process.env.SW_I198CS_G5 ?? `${process.env.HOME}/GoldenChains/i106/x86-iamerror/105_Final_Cleanup`;
const JS4 = process.env.SW_I198CS_J4 ?? '/tmp/iii198-out/js-slot104';
const JS5 = process.env.SW_I198CS_J5 ?? '/tmp/iii195-out/js-slot105';
const OUT = process.env.SW_I198CS_OUT ?? '/tmp/iii198-out/cs.txt';
const W = Number(process.env.SW_I198CS_W ?? 4200), H = Number(process.env.SW_I198CS_H ?? 1200);
const SAMPLE = Number(process.env.SW_I198CS_SAMPLE ?? 30);

it('iii198 changeset', () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const N = W * H;
  const rd16 = (p: string) => { const b = readFileSync(p); const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = b[i * 2] | (b[i * 2 + 1] << 8); return a; };
  const rdu8 = (p: string) => new Uint8Array(readFileSync(p).buffer, readFileSync(p).byteOffset, N);
  // x86
  const g4t = rd16(`${GOLD4}.typ`), g4a = rdu8(`${GOLD4}.act`), g4l = rd16(`${GOLD4}.liq`), g4lt = rd16(`${GOLD4}.lty`), g4h = rdu8(`${GOLD4}.half`), g4s = rdu8(`${GOLD4}.slope`), g4w = rd16(`${GOLD4}.wal`);
  const g5t = rd16(`${GOLD5}.typ`), g5a = rdu8(`${GOLD5}.act`), g5l = rd16(`${GOLD5}.liq`), g5lt = rd16(`${GOLD5}.lty`), g5h = rdu8(`${GOLD5}.half`), g5s = rdu8(`${GOLD5}.slope`), g5w = rd16(`${GOLD5}.wal`);
  // JS
  const j4t = new Uint16Array(readFileSync(`${JS4}/base_type.bin`).buffer), j4a = rdu8(`${JS4}/base_flags.bin`), j4l = rd16(`${JS4}/base_liquid.bin`), j4lt = rdu8(`${JS4}/base_liquidType.bin`), j4h = rdu8(`${JS4}/base_half.bin`), j4s = rdu8(`${JS4}/base_slope.bin`), j4w = rd16(`${JS4}/base_wall.bin`);
  const j5t = new Uint16Array(readFileSync(`${JS5}/base_type.bin`).buffer), j5a = rdu8(`${JS5}/base_flags.bin`), j5l = rd16(`${JS5}/base_liquid.bin`), j5lt = rdu8(`${JS5}/base_liquidType.bin`), j5h = rdu8(`${JS5}/base_half.bin`), j5s = rdu8(`${JS5}/base_slope.bin`), j5w = rd16(`${JS5}/base_wall.bin`);

  // 活性 typ 场（before/after 各自）。x86 dump 原生 vanilla id 域——不再过 SHEET
  // （★勘误：首版把 x86 原始 id 误过 JS SHEET 表,烧出 404/77/455 伪 id 空间）；
  // JS 侧经 SHEET 映射到 vanilla 域后对拍。
  const shX = (t: Uint16Array, act: Uint8Array) => { const o = new Int32Array(N); for (let i = 0; i < N; i++) o[i] = (act[i] & 1) ? t[i] : 0; return o; };
  const shJ = (t: Uint16Array, act: Uint8Array) => { const o = new Int32Array(N); for (let i = 0; i < N; i++) o[i] = (act[i] & 1) ? (SHEET[t[i]] >= 0 ? SHEET[t[i]] : 9999) : 0; return o; };
  const g4T = shX(g4t, g4a), g5T = shX(g5t, g5a), j4T = shJ(j4t, j4a), j5T = shJ(j5t, j5a);

  interface Tr { a0: number; a1: number; t0: number; t1: number; l0: number; l1: number; lt0: number; lt1: number; h0: number; h1: number; s0: number; s1: number; w0: number; w1: number; }
  const changed = (a: Tr) => a.a0 !== a.a1 || a.t0 !== a.t1 || a.l0 !== a.l1 || a.lt0 !== a.lt1 || a.h0 !== a.h1 || a.s0 !== a.s1 || a.w0 !== a.w1;
  const sig = (a: Tr) => `a${a.a0}>${a.a1} t${a.t0}>${a.t1} l${a.l0}>${a.l1} y${a.lt0}>${a.lt1} h${a.h0}>${a.h1} s${a.s0}>${a.s1} w${a.w0}>${a.w1}`;

  const gtr: Array<Tr | null> = new Array(N).fill(null);
  const jtr: Array<Tr | null> = new Array(N).fill(null);
  let ncg = 0, ncj = 0, nsame = 0, ndiff = 0;
  for (let i = 0; i < N; i++) {
    const g: Tr = { a0: g4a[i] & 1, a1: g5a[i] & 1, t0: g4T[i], t1: g5T[i], l0: g4l[i], l1: g5l[i], lt0: g4lt[i], lt1: g5lt[i], h0: g4h[i], h1: g5h[i], s0: g4s[i], s1: g5s[i], w0: g4w[i], w1: g5w[i] };
    const j: Tr = { a0: j4a[i] & 1, a1: j5a[i] & 1, t0: j4T[i], t1: j5T[i], l0: j4l[i], l1: j5l[i], lt0: j4lt[i], lt1: j5lt[i], h0: j4h[i], h1: j5h[i], s0: j4s[i], s1: j5s[i], w0: j4w[i], w1: j5w[i] };
    const gc = changed(g), jc = changed(j);
    if (gc) { gtr[i] = g; ncg++; }
    if (jc) { jtr[i] = j; ncj++; }
    if (gc || jc) {
      if (gc && jc && sig(g) === sig(j)) nsame++;
      else ndiff++;
    }
  }

  const lines: string[] = [];
  const P = (s: string) => lines.push(s);
  P(`FinalCleanup 变更集: x86 改格=${ncg} JS 改格=${ncj} | 变换全等=${nsame} 分歧格=${ndiff}`);

  // census: 杀(kill)/生(create)/液改/换型
  const census = (tr: Array<Tr | null>, name: string) => {
    const killBy = new Map<number, number>(); const createBy = new Map<number, number>();
    const conv = new Map<string, number>(); let liqOnly = 0;
    for (let i = 0; i < N; i++) {
      const a = tr[i]; if (!a) continue;
      if (a.a0 === 1 && a.a1 === 0) killBy.set(a.t0, (killBy.get(a.t0) ?? 0) + 1);
      else if (a.a0 === 0 && a.a1 === 1) createBy.set(a.t1, (createBy.get(a.t1) ?? 0) + 1);
      else if (a.a0 === 1 && a.a1 === 1 && a.t0 !== a.t1) conv.set(`t${a.t0}>${a.t1}`, (conv.get(`t${a.t0}>${a.t1}`) ?? 0) + 1);
      else if (a.l0 !== a.l1 || a.lt0 !== a.lt1) liqOnly++;
    }
    const top = (m: Map<number, number>) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, v]) => `${k}×${v}`).join(' ');
    P(`\n[${name}] kill(act1→0) 按型: ${top(killBy)}`);
    P(`[${name}] create(act0→1) 按型: ${top(createBy)}`);
    P(`[${name}] 换型(活→活): ${[...conv.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, v]) => `${k}×${v}`).join(' ') || '(无)'}`);
    P(`[${name}] 纯液变换: ${liqOnly}`);
  };
  census(gtr, 'x86');
  census(jtr, 'JS');

  // 双方 kill 集合交差（按型）
  const cross = (ty: number) => {
    let both = 0, gOnly = 0, jOnly = 0, gKillJStay = 0, jKillGStay = 0;
    for (let i = 0; i < N; i++) {
      const g = gtr[i], j = jtr[i];
      const gk = g && g.a0 === 1 && g.a1 === 0 && g.t0 === ty;
      const jk = j && j.a0 === 1 && j.a1 === 0 && j.t0 === ty;
      if (gk && jk) both++;
      else if (gk) { gOnly++; if (!j || (j.a1 === 1 && j.t1 === ty)) gKillJStay++; }
      else if (jk) { jOnly++; if (!g || (g.a1 === 1 && g.t1 === ty)) jKillGStay++; }
    }
    return `型${ty}: 双杀=${both} 仅x86杀=${gOnly}(其中JS仍活=${gKillJStay}) 仅JS杀=${jOnly}(其中x86仍活=${jKillGStay})`;
  };
  P('');
  for (const ty of [28, 653, 379, 60, 2, 1, 183, 534, 536, 539, 625, 627, 59, 147, 397]) P(`  ${cross(ty)}`);

  // 循环序 (x 主序: idx=x*H+y) 首分歧
  const loopIdx = (i: number) => (i % W) * H + ((i / W) | 0);
  const divergent: number[] = [];
  for (let i = 0; i < N; i++) if (gtr[i] || jtr[i]) {
    const g = gtr[i], j = jtr[i];
    if ((g && !j) || (!g && j) || (g && j && sig(g) !== sig(j))) divergent.push(i);
  }
  divergent.sort((a, b) => loopIdx(a) - loopIdx(b));
  P(`\n分歧格=${divergent.length}; 循环序前 ${Math.min(SAMPLE, divergent.length)} 格:`);

  const win5 = (T: Int32Array, x: number, y: number) => {
    const rows: string[] = [];
    for (let yy = y - 2; yy <= y + 2; yy++) {
      let s = '';
      for (let xx = x - 2; xx <= x + 2; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) { s += ' ####'; continue; }
        const i = yy * W + xx;
        const g5 = gtr[i], j5 = jtr[i];
        const mark = g5 || j5 ? '*' : ' ';
        s += ' ' + mark + String(T[i]).padStart(3);
      }
      rows.push(s);
    }
    return rows;
  };
  for (let s = 0; s < Math.min(SAMPLE, divergent.length); s++) {
    const i = divergent[s];
    const x = i % W, y = (i / W) | 0;
    const g = gtr[i], j = jtr[i];
    P(`\n--- #${s} (${x},${y})`);
    P(`    x86: ${g ? sig(g) : '(无变换)'}`);
    P(`    JS : ${j ? sig(j) : '(无变换)'}`);
    const wa = win5(g5T, x, y), wb = win5(j5T, x, y);
    for (let r = 0; r < 5; r++) P(`    x86 ${wa[r]}  | js ${wb[r]}`);
  }
  writeFileSync(OUT, lines.join('\n'));
  console.log(`[i198cs] wrote ${lines.length} lines -> ${OUT}`);
  console.log(lines.slice(0, 40).join('\n'));
}, 600_000);
