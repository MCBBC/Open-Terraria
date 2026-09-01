// IIIII111b 反演重放仪（用毕可删）：把 x86 真值 #054_Waterfalls 全通道注入 JS store，
// 续跑 ship 薄冰槽（FragileIceOverIceBiomeWater），与真值 #055_Ice 对拍。
// ⇒ 残差=ship 该槽自身债（上游继承债免疫）。分桶：acceptance(162 面参与) / freeze 其他。
// 运行：cd game && SW_I144C=1 SW_I144_G2=$HOME/GoldenChains/golden-win npx vitest run tools/_iii144c.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I144C === '1';
const G2 = process.env.SW_I144_G2 ?? '';
const SEED = process.env.SW_I144_SEED ?? '20260907';
const OUT = process.env.SW_I144_OUT ?? '/tmp/iii144-out';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const N = W * H;

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
interface X8 { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; lt: Uint8Array; hf: Uint8Array; sl: Uint8Array; ia: Uint8Array }
function x8(dir: string, name: string): X8 {
  const pre = `${dir}/${name}`;
  return {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`),
    l: readFileSync(`${pre}.liq`), lt: readFileSync(`${pre}.lty`),
    hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`), ia: readFileSync(`${pre}.inact`),
  };
}

(RUN ? it : it.skip)('thin-ice slot inversion replay: inject x86 #054 into store', async () => {
  if (!G2) throw new Error('need SW_I144_G2');
  const dumpNames = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) dumpNames.set(Number(m[1]), m[2]);
  }
  const nm54 = dumpNames.get(54)!, nm55 = dumpNames.get(55)!;
  if (!nm54 || !nm55 || !nm54.includes('Waterfall') || !nm55.includes('Ice')) {
    throw new Error(`dump 名不符: #54=${nm54} #55=${nm55}`);
  }
  const X54 = x8(G2, `054_${nm54}`);
  const X55 = x8(G2, `055_${nm55}`);

  // internal ← sheet 反查表（首命中）
  const INV = new Int32Array(2048).fill(-1);
  let maxInternal = 0;
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && s >= 0 && s < INV.length && INV[s] === -1) INV[s] = i;
    if (s !== undefined) maxInternal = Math.max(maxInternal, i);
  }
  void maxInternal;
  // 报表用 internal→sheet
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const sh = (s: number): number => (s >= 0 ? s : 9999);

  class Aborted extends Error {}
  let captured: Record<string, Uint8Array | Uint16Array> | null = null;
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED,
      seedFlags: { worldIsFrozen: true },
      onWorldPartial: (w, _i, pn) => {
        const st = w.store as unknown as Record<string, Uint8Array | Uint16Array>;
        if (pn === '瀑布唇缘') {
          // ── 注入 x86 #054 全通道 ──
          const typ = st.type as Uint16Array, flags = st.flags as Uint8Array,
            wall = st.wall as Uint16Array, liq = st.liquid as Uint8Array,
            lty = st.liquidType as Uint8Array, hf = st.half as Uint8Array,
            sl = st.slope as Uint8Array, wire = st.wire as Uint8Array,
            fx = st.frameX as Uint16Array, fy = st.frameY as Uint16Array;
          for (let i = 0; i < N; i++) {
            const vanT = X54.t[i]!;
            typ[i] = INV[vanT] >= 0 ? INV[vanT] : 0;
            flags[i] = X54.a[i]! & 1;
            fx[i] = 0; fy[i] = 0;
            wall[i] = X54.w[i]!;
            liq[i] = X54.l[i]!;
            lty[i] = X54.l[i]! > 0 ? X54.lt[i]! + 1 : 0;
            hf[i] = X54.hf[i]!;
            sl[i] = X54.sl[i]!;
            wire[i] = (wire[i] & ~32) | ((X54.ia[i]! ? 1 : 0) * 32);
          }
          console.log('[I144C] injected x86 #054 at 瀑布唇缘 end');
          return;
        }
        if (pn === '薄冰') {
          captured = {
            type: Uint16Array.from(st.type as Uint16Array), flags: Uint8Array.from(st.flags as Uint8Array),
            wall: Uint16Array.from(st.wall as Uint16Array), liquid: Uint8Array.from(st.liquid as Uint8Array),
            liquidType: Uint8Array.from(st.liquidType as Uint8Array), half: Uint8Array.from(st.half as Uint8Array),
            slope: Uint8Array.from(st.slope as Uint8Array),
          };
          throw new Aborted();
        }
      },
    });
  } catch (e) {
    if (!(e instanceof Aborted)) throw e;
  }
  const C = captured!;
  // ── 对拍 C vs X55（mile8 口径）──
  interface Cell { i: number; chan: string; vt: number; jt: number }
  const diffs: Cell[] = [];
  let dA = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0;
  for (let i = 0; i < N; i++) {
    const va = X55.a[i]!, ja = (C.flags[i] as number) & 1;
    const vt = va ? X55.t[i]! : 0;
    const jt = ja ? sh(SHEET[(C.type[i] as number)]) : 0;
    if (va !== ja) { dA++; diffs.push({ i, chan: 'A', vt: va, jt }); continue; }
    if (vt !== jt) diffs.push({ i, chan: 'T', vt, jt });
    if (X55.w[i]! !== (C.wall[i] as number)) { dW++; diffs.push({ i, chan: 'W', vt: X55.w[i]!, jt: C.wall[i] as number }); }
    if (X55.l[i]! !== (C.liquid[i] as number)) { dL++; diffs.push({ i, chan: 'L', vt: X55.l[i]!, jt: C.liquid[i] as number }); }
    if (X55.hf[i]! !== (C.half[i] as number)) { dHf++; diffs.push({ i, chan: 'Hf', vt: X55.hf[i]!, jt: C.half[i] as number }); }
    if (X55.sl[i]! !== (C.slope[i] as number)) { dSl++; diffs.push({ i, chan: 'Sl', vt: X55.sl[i]!, jt: C.slope[i] as number }); }
    const vl = X55.l[i]! > 0 ? X55.lt[i]! + 1 : 0;
    const jl = (C.liquid[i] as number) > 0 ? C.liquidType[i] as number : 0;
    if (vl !== jl) { dLt++; diffs.push({ i, chan: 'Y', vt: vl, jt: jl }); }
  }
  // 分桶：是否 162 参与（C 或 X55 任一侧涉及薄冰）
  const acc = diffs.filter((d) => d.vt === 162 || d.jt === 162);
  const non = diffs.filter((d) => d.vt !== 162 && d.jt !== 162);
  console.log(`[I144C] 注入重放 vs #055: diffs=${diffs.length} A=${dA} T=${diffs.length - dA - dW - dL - dHf - dSl - dLt} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Y=${dLt}`);
  const bucket = new Map<string, number>();
  for (const d of non) {
    const k = `${d.chan}:${Math.min(d.vt, 9999)}>${Math.min(d.jt, 9999)}`;
    bucket.set(k, (bucket.get(k) ?? 0) + 1);
  }
  console.log('[I144C] freeze面 top:', [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, c]) => `${k}×${c}`).join(' '));
  console.log(`[I144C] acceptance(162 参与)=${acc.length}`);
  const accRow = new Map<number, number>();
  for (const d of acc) accRow.set((d.i / W) | 0, (accRow.get((d.i / W) | 0) ?? 0) + 1);
  console.log('[I144C] acc rows:', [...accRow.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([y, c]) => `y=${y}:${c}`).join(' '));
  console.log('[I144C] acc first12:', acc.slice(0, 12).map((d) => `${d.chan}(${d.i % W},${(d.i / W) | 0}) v${d.vt} j${d.jt}`).join(' | '));
  // 局部地图（首个 accept 聚类中心）
  function charAt(stAct: number, stTy: number, sq?: number): string {
    if (!stAct) return sq && sq > 0 ? '~' : '.';
    if (stTy === 162) return 't';
    if (stTy === 161 || stTy === 163 || stTy === 164 || stTy === 200) return 'I';
    if (stTy === 147) return 's';
    return '#';
  }
  function mapAround(cx: number, cy: number, rx: number, ry: number): string[] {
    const lines: string[] = [];
    for (let y = cy - ry; y <= cy + ry; y++) {
      let rX54 = '', rC = '', rV = '';
      for (let x = cx - rx; x <= cx + rx; x++) {
        const i = y * W + x;
        if (x < 0 || y < 0 || x >= W || y >= H) { rX54 += '?'; rC += '?'; rV += '?'; continue; }
        rX54 += charAt(X54.a[i]!, X54.t[i]!, X54.l[i]!);
        rV += charAt(X55.a[i]!, X55.t[i]!, X55.l[i]!);
        const ca = (C.flags[i] as number) & 1;
        rC += charAt(ca, ca ? sh(SHEET[C.type[i] as number]) : 0, (C.liquid[i] as number));
      }
      lines.push(`   ${String(y).padStart(4)} x54:${rX54} C:${rC} v55:${rV}`);
    }
    lines.push(`        center=(${cx},${cy})`);
    return lines;
  }
  const seenCenter = new Set<string>();
  let mapsPrinted = 0;
  mkdirSync(OUT, { recursive: true });
  const reportAcc: Array<Record<string, unknown>> = [];
  for (const d of acc) {
    const cx = d.i % W, cy = (d.i / W) | 0;
    const key = `${Math.round(cx / 12)},${Math.round(cy / 6)}`;
    if (seenCenter.has(key)) continue;
    seenCenter.add(key);
    if (mapsPrinted < 14) {
      console.log(`[I144C] --- acc cluster @(${cx},${cy}) ---`);
      for (const ln of mapAround(cx, cy, 16, 5)) console.log(ln);
      mapsPrinted++;
      reportAcc.push({ c: [cx, cy], map: mapAround(cx, cy, 16, 5) });
    }
  }
  writeFileSync(`${OUT}/inj-replay.json`, JSON.stringify({
    g2: G2, total: diffs.length, dA, dW, dL, dHf, dSl, dLt,
    accCount: acc.length, freezeTop: [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
    accRows: [...accRow.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
    accFirst: acc.slice(0, 40).map((d) => ({ c: [d.i % W, (d.i / W) | 0], chan: d.chan, vt: d.vt, jt: d.jt })),
    maps: reportAcc,
  }, null, 1));
  console.log(`[I144C] report -> ${OUT}/inj-replay.json`);
}, 900_000);
