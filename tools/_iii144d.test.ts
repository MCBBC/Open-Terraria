// IIIII111b 反演重放②（用毕可删）：把 x86 真值 #027_Webs 注入 underworld 入口
// （runUnderworldPass 的 __swUwCap 钩），跑 ship 地狱段（Underworld+灰烬草/树
// +AddHellHouses），在 ▶Corruption 前沿（@CORRHEAD 的 __swI87Cap）截获，
// 对拍真值 #028_Underworld ⇒ 残差=ship 地狱段自身债（上游继承债免疫）。
// 运行：cd game && SW_I144D=1 SW_I144_G2=$HOME/GoldenChains/golden-win npx vitest run tools/_iii144d.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I144D === '1';
const G2 = process.env.SW_I144_G2 ?? '';
const SEED = process.env.SW_I144_SEED ?? '20260907';
const OUT = process.env.SW_I144_OUT ?? '/tmp/iii144-out';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const N = W * H;
const DUMPA = Number(process.env.SW_I144_DIN ?? 27);
const DUMPB = Number(process.env.SW_I144_DOUT ?? 28);

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
interface X9 { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; lt: Uint8Array; hf: Uint8Array; sl: Uint8Array; ia: Uint8Array }
function x9(dir: string, name: string): X9 {
  const pre = `${dir}/${name}`;
  return {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`),
    l: readFileSync(`${pre}.liq`), lt: readFileSync(`${pre}.lty`),
    hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`), ia: readFileSync(`${pre}.inact`),
  };
}

(RUN ? it : it.skip)('underworld segment inversion replay', async () => {
  if (!G2) throw new Error('need SW_I144_G2');
  const dumpNames = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) dumpNames.set(Number(m[1]), m[2]);
  }
  const XA = x9(G2, `${String(DUMPA).padStart(3, '0')}_${dumpNames.get(DUMPA)!}`);
  const XB = x9(G2, `${String(DUMPB).padStart(3, '0')}_${dumpNames.get(DUMPB)!}`);

  const INV = new Int32Array(2048).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && s >= 0 && s < INV.length && INV[s] === -1) INV[s] = i;
  }
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const sh = (s: number): number => (s >= 0 ? s : 9999);

  function injectStore(st: unknown): void {
    const s = st as Record<string, Uint8Array | Uint16Array>;
    const typ = s.type as Uint16Array, flags = s.flags as Uint8Array, wall = s.wall as Uint16Array,
      liq = s.liquid as Uint8Array, lty = s.liquidType as Uint8Array, hf = s.half as Uint8Array,
      sl = s.slope as Uint8Array, wire = s.wire as Uint8Array,
      fx = s.frameX as Uint16Array, fy = s.frameY as Uint16Array;
    for (let i = 0; i < N; i++) {
      typ[i] = INV[XA.t[i]!] >= 0 ? INV[XA.t[i]!] : 0;
      flags[i] = XA.a[i]! & 1;
      fx[i] = 0; fy[i] = 0;
      wall[i] = XA.w[i]!;
      liq[i] = XA.l[i]!;
      lty[i] = XA.l[i]! > 0 ? XA.lt[i]! + 1 : 0;
      hf[i] = XA.hf[i]!;
      sl[i] = XA.sl[i]!;
      wire[i] = (wire[i] & ~32) | ((XA.ia[i]! ? 1 : 0) * 32);
    }
    console.log('[I144D] injected x86', DUMPA, 'at underworld entry');
  }

  // ── 挂钩 ──
  const gg = globalThis as Record<string, unknown>;
  const oUw = gg.__swUwCap, oI87 = gg.__swI87Cap;
  let injected = false, captured: Record<string, Uint8Array | Uint16Array> | null = null;
  gg.__swUwCap = (_gsX: unknown, stX: unknown) => {
    if (!injected) { injected = true; injectStore(stX); }
  };
  gg.__swI87Cap = (stX: unknown) => {
    if (injected && !captured) {
      const s = stX as Record<string, Uint8Array | Uint16Array>;
      captured = {
        type: Uint16Array.from(s.type as Uint16Array), flags: Uint8Array.from(s.flags as Uint8Array),
        wall: Uint16Array.from(s.wall as Uint16Array), liquid: Uint8Array.from(s.liquid as Uint8Array),
        liquidType: Uint8Array.from(s.liquidType as Uint8Array), half: Uint8Array.from(s.half as Uint8Array),
        slope: Uint8Array.from(s.slope as Uint8Array),
      };
      console.log('[I144D] captured at CORR head');
      try {
        mkdirSync(OUT, { recursive: true });
        const ck = ['type', 'flags', 'wall', 'liquid', 'liquidType', 'half', 'slope'] as const;
        for (const k of ck) writeFileSync(`${OUT}/uwC-${k}.bin`, Buffer.from((captured![k] as Uint8Array | Uint16Array).buffer, (captured![k] as Uint8Array | Uint16Array).byteOffset, (captured![k] as Uint8Array | Uint16Array).byteLength));
        console.log(`[I144D] C-dumps -> ${OUT}/uwC-*.bin`);
      } catch (err) { console.log('[I144D] dump failed', err); }
    }
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED,
      seedFlags: { worldIsFrozen: true },
    });
  } finally {
    gg.__swUwCap = oUw; gg.__swI87Cap = oI87;
  }
  if (!captured) throw new Error('capture missing');
  const C = captured;

  // ── 对拍 C vs XB ──
  interface Diff { i: number; chan: string; vt: number; jt: number }
  const diffs: Diff[] = [];
  let dA = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0;
  for (let i = 0; i < N; i++) {
    const va = XB.a[i]!, ja = (C.flags[i] as number) & 1;
    const vt = va ? XB.t[i]! : 0;
    const jt = ja ? sh(SHEET[(C.type[i] as number)]) : 0;
    if (va !== ja) { dA++; diffs.push({ i, chan: 'A', vt: va, jt }); continue; }
    if (vt !== jt) diffs.push({ i, chan: 'T', vt, jt });
    if (XB.w[i]! !== (C.wall[i] as number)) { dW++; diffs.push({ i, chan: 'W', vt: XB.w[i]!, jt: C.wall[i] as number }); }
    if (XB.l[i]! !== (C.liquid[i] as number)) { dL++; diffs.push({ i, chan: 'L', vt: XB.l[i]!, jt: C.liquid[i] as number }); }
    if (XB.hf[i]! !== (C.half[i] as number)) { dHf++; diffs.push({ i, chan: 'Hf', vt: XB.hf[i]!, jt: C.half[i] as number }); }
    if (XB.sl[i]! !== (C.slope[i] as number)) { dSl++; diffs.push({ i, chan: 'Sl', vt: XB.sl[i]!, jt: C.slope[i] as number }); }
    const vl = XB.l[i]! > 0 ? XB.lt[i]! + 1 : 0;
    const jl = (C.liquid[i] as number) > 0 ? C.liquidType[i] as number : 0;
    if (vl !== jl) { dLt++; diffs.push({ i, chan: 'Y', vt: vl, jt: jl }); }
  }
  let cnt633 = 0, cnt57 = 0, cnt634 = 0;
  for (let i = 0; i < N; i++) {
    const ja = (C.flags[i] as number) & 1;
    if (!ja) continue;
    const shp = SHEET[C.type[i] as number];
    if (shp === 633) cnt633++;
    else if (shp === 57) cnt57++;
    if (shp === 634) cnt634++;
  }
  console.log(`[I144D] 注入重放(CORR头态) vs #${DUMPB}: diffs=${diffs.length} A=${dA} T=${diffs.length - dA - dW - dL - dHf - dSl - dLt} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Y=${dLt}`);
  const bucket = new Map<string, number>();
  for (const d of diffs) {
    const k = `${d.chan}:${Math.min(d.vt, 9999)}>${Math.min(d.jt, 9999)}`;
    bucket.set(k, (bucket.get(k) ?? 0) + 1);
  }
  console.log('[I144D] top:', [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, c]) => `${k}×${c}`).join(' '));
  console.log(`[I144D] ship 灰烬面计数: 633=${cnt633} 634=${cnt634} 残余57(活跃)=${cnt57}`);
  console.log('[I144D] first12:', diffs.slice(0, 12).map((d) => `${d.chan}(${d.i % W},${(d.i / W) | 0}) v${d.vt} j${d.jt}`).join(' | '));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/uw-replay.json`, JSON.stringify({
    g2: G2, din: DUMPA, dout: DUMPB, total: diffs.length, dA, dW, dL, dHf, dSl, dLt,
    cnt633, cnt634, cnt57,
    top: [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
    first: diffs.slice(0, 60).map((d) => ({ c: [d.i % W, (d.i / W) | 0], ch: d.chan, v: d.vt, j: d.jt })),
  }, null, 1));
  console.log(`[I144D] report -> ${OUT}/uw-replay.json`);
}, 900_000);
