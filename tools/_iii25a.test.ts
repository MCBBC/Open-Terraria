// IIII24b 批一次性诊断：槽末#31（Traps/dump076）全 diff 聚簇提取。
// J 实时生成 vs X 真值 G2 目录 076_Traps 8 通道；输出逐簇 bbox+逐格双端 raw 值+锚点邻域。
// 用法：cd game && SW_I25A=1 npx vitest run tools/_iii25a.test.ts --reporter=basic
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I25A === '1';
const CHAIN = process.env.SW_I25_CHAIN ?? 'notraps';
const CFGS: Record<string, { seed: string; evil: -1 | 0 | 1; flags?: Record<string, boolean>; g2: string }> = {
  notraps: { seed: '1896728457', evil: 1, flags: { noTraps: true }, g2: '/tmp/rrrr-out/x86-notraps' },
  const: { seed: '1321365005', evil: -1, flags: { theConstant: true }, g2: '/tmp/rrrr-out/x86-const' },
  m: { seed: '20260811', evil: 0, g2: '/tmp/rrrr-out/x86-m' },
};
const cfg = CFGS[CHAIN]!;
(RUN ? it : it.skip)('iii25a cluster extract', async () => {
  const W = 4200, H = 1200, N = W * H;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  interface Snap {
    type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
    half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
  }
  function snap(store: unknown): Snap {
    const s = store as unknown as Snap;
    return {
      type: new Uint16Array(s.type), flags: new Uint8Array(s.flags), wall: new Uint16Array(s.wall),
      liquid: new Uint8Array(s.liquid), half: new Uint8Array(s.half), slope: new Uint8Array(s.slope),
      wire: new Uint8Array(s.wire),
    };
  }
  let S31: Snap | null = null;
  await generateWorld({
    width: W, height: H, seedText: cfg.seed, evil: cfg.evil,
    seedFlags: Object.keys(cfg.flags ?? {}).length > 0 ? cfg.flags as never : undefined,
    onWorldPartial: (w, i, pn) => {
      if (i === 31 && pn === '地表装饰') S31 = snap(w.store);
    },
  });
  if (!S31) throw new Error('no snap31');
  const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.byteLength >> 1); };
  const u8 = (p: string) => new Uint8Array(readFileSync(p));
  const X = `${cfg.g2}/076_Traps.`;
  const xt = le16(`${X}typ`), xa = u8(`${X}act`), xw = le16(`${X}wal`);
  const xl = u8(`${X}liq`), xh = u8(`${X}half`), xs = u8(`${X}slope`);
  const jt = S31.type, ja = S31.flags, jw = S31.wall, jl = S31.liquid, jh = S31.half, js2 = S31.slope;
  // diff mask
  const mask = new Uint8Array(N);
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0;
  for (let i = 0; i < N; i++) {
    const va = xa[i]! ? 1 : 0, vb = ja[i]! & 1 ? 1 : 0;
    const vt = va ? xt[i]! : 0;
    const jti = SHEET[jt[i]!] >= 0 ? SHEET[jt[i]!]! : 9999;
    const jeff = vb ? jti : 0;
    let bad = false;
    if (va !== vb) { dA++; bad = true; }
    if (vt !== jeff) { dT++; bad = true; }
    if (xw[i] !== jw[i]) { dW++; bad = true; }
    if (xl[i] !== jl[i]) { dL++; bad = true; }
    if (xh[i] !== jh[i]) { dHf++; bad = true; }
    if (xs[i] !== js2[i]) { dSl++; bad = true; }
    if (bad) mask[i] = 1;
  }
  console.log(`[${CHAIN}] GLOBAL A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl}`);
  // clusters 4-connectivity
  const seenC = new Uint8Array(N);
  const clusters: number[][] = [];
  const stk: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!mask[i] || seenC[i]) continue;
    const cells: number[] = [];
    stk.length = 0; stk.push(i); seenC[i] = 1;
    while (stk.length) {
      const c = stk.pop()!;
      cells.push(c);
      const cx = c % W, cy = Math.floor(c / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (mask[ni] && !seenC[ni]) { seenC[ni] = 1; stk.push(ni); }
      }
    }
    clusters.push(cells.sort((a, b) => a - b));
  }
  clusters.sort((a, b) => a[0] - b[0]);
  const cellDesc = (i: number): string => {
    const va = xa[i]! ? 1 : 0, vb = ja[i]! & 1 ? 1 : 0;
    const vt = va ? xt[i]! : 0;
    const shv = vb ? (SHEET[jt[i]!] >= 0 ? SHEET[jt[i]!]! : 9999) : 0;
    return `(${i % W},${Math.floor(i / W)}) V[a${va} t${vt} h${xh[i]} s${xs[i]} w${xw[i]} l${xl[i]} fx/fy-n/a] ` +
      `J[a${vb} t${shv} h${jh[i]} s${js2[i]} w${jw[i]} l${jl[i]} fx${jt[i] === 0 ? '-' : ''}${''}]`;
  };
  console.log(`clusters=${clusters.length}`);
  for (let ci = 0; ci < clusters.length; ci++) {
    const cells = clusters[ci]!;
    let minX = 9e9, maxX = -9e9, minY = 9e9, maxY = -9e9;
    for (const i of cells) { minX = Math.min(minX, i % W); maxX = Math.max(maxX, i % W); minY = Math.min(minY, Math.floor(i / W)); maxY = Math.max(maxY, Math.floor(i / W)); }
    console.log(`\ncluster#${ci} n=${cells.length} x[${minX},${maxX}] y[${minY},${maxY}]`);
    for (const i of cells.slice(0, 14)) console.log('  ' + cellDesc(i));
    // 5x5 raw both sides of first cell
    const ax = cells[0] % W, ay = Math.floor(cells[0] / W);
    const rowOf = (fn: (xx: number, yy: number) => string) => {
      const rows: string[] = [];
      for (let dy = -2; dy <= 2; dy++) {
        const r: string[] = [];
        for (let dx = -2; dx <= 2; dx++) r.push(fn(ax + dx, ay + dy));
        rows.push(r.join(','));
      }
      return rows.join('\n     ');
    };
    const vT = (xx: number, yy: number) => {
      const i = yy * W + xx;
      const a = xa[i]! ? 1 : 0;
      return String(a ? xt[i]! : -1);
    };
    const jTf = (xx: number, yy: number) => {
      const i = yy * W + xx;
      const a = ja[i]! & 1 ? 1 : 0;
      return String(a ? (SHEET[jt[i]!] >= 0 ? SHEET[jt[i]!]! : 9999) : -1);
    };
    console.log(`   V-types@(${ax},${ay})±2:\n     ${rowOf(vT)}\n   J-types:\n     ${rowOf(jTf)}`);
    const vHalf = (xx: number, yy: number) => String(xh[yy * W + xx]);
    const vSlope = (xx: number, yy: number) => String(xs[yy * W + xx]);
    console.log(`   V-half:${rowOf(vHalf)} | V-slope:${rowOf(vSlope)}`);
  }
}, 900_000);
