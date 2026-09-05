// IIII187(#60/#69 双前沿) 一次性取证探针（sc60 子车道,与 GFB 车道 _iii187sim 无涉）：
// ①__swChestEv/__swAbGate 全事件台账——第4参改读 **live __swRollN**（_iii184dump 只记
//   'ab' 入口掷;'abx' 出口掷缺失 → 无法离线重放 AB 耗骰。本仪补出口掷 → D=出口−入口）。
// ②▶SurfaceChests reseed 锚导出 JS 八通道 + **rawRes**（act=0 格的残型 st.type 原值,
//   _iii184dump 的 typ/raw 对 inact 格写 0,幽灵残型通道缺失——#60 flag3 门定罪关键面）。
// 用法：cd game && SW_SC60=1 npx vitest run tools/_iii187sc60.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_SC60 === '1';
const OUT = process.env.SW_SC60_OUT ?? '/tmp/iii187-out/sc60';
const SEED = process.env.SW_I81_SEED ?? '1.1.1.0.iamerror|106103';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; srcCache.set(file, src); } }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

(RUN ? it : it.skip)('IIII187 sc60 dump: chest ledger with live rolls + residual-type snapshot', async () => {
  type Store = { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array; w: number; h: number };
  let store: Store | null = null;
  let dumped = false;
  const saveTo = (prefix: string): void => {
    if (!store) return;
    const st = store as unknown as Record<string, Uint8Array | Uint16Array>;
    const N = W * H;
    const act = new Uint8Array(N), typ = new Uint16Array(N), wal = new Uint16Array(N);
    const liq = new Uint8Array(N), lty = new Uint8Array(N), hf = new Uint8Array(N), sl = new Uint8Array(N), ia = new Uint8Array(N);
    const res = new Uint16Array(N); // 残型通道：act=0 时 st.type 原值（幽灵格）
    const flags = st.flags as Uint8Array, type = st.type as Uint16Array;
    const SHEET = new Int32Array(1024).fill(-1);
    for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
    for (let i = 0; i < N; i++) {
      const a = flags[i]! & 1;
      act[i] = a;
      typ[i] = a ? (type[i]! === 0 ? 0 : (SHEET[type[i]!]! >= 0 ? SHEET[type[i]!]! : 9999)) : 0;
      res[i] = a ? 0 : type[i]!;   // JS 内部 id 空间残型
      wal[i] = (st.wall as Uint16Array)[i]!;
      liq[i] = (st.liquid as Uint8Array)[i]!;
      lty[i] = (st.liquidType as Uint8Array)[i]!;
      hf[i] = (st.half as Uint8Array)[i]!;
      sl[i] = (st.slope as Uint8Array)[i]!;
      ia[i] = (((st.wire as Uint8Array)[i]!) >>> 5) & 1;
    }
    const w8 = (n: string, b: ArrayBufferView): void => writeFileSync(`${OUT}/${n}`, Buffer.from(b.buffer, b.byteOffset, b.byteLength));
    w8(`${prefix}.typ`, typ); w8(`${prefix}.act`, act); w8(`${prefix}.wal`, wal); w8(`${prefix}.liq`, liq);
    w8(`${prefix}.lty`, lty); w8(`${prefix}.half`, hf); w8(`${prefix}.slope`, sl); w8(`${prefix}.inact`, ia);
    w8(`${prefix}.res`, res);
    console.log(`[sc60] JS anchor state saved -> ${OUT}/${prefix}.*`);
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let rollN = 0, inWin = false, winStart = -1;
  const rollLog: number[] = [];
  const evs: string[] = [];
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v: number) => {
    rollN++;
    (globalThis as { __swRollN?: number }).__swRollN = rollN;
    if (inWin && rollLog.length < 3_000_000) rollLog.push(v);
  };
  (globalThis as { __swChestEv?: (p: string, i: number, j: number, x?: number) => void }).__swChestEv = (p: string, i: number, j: number) => {
    if (inWin) evs.push(`${p} ${i} ${j} R${rollN}`);
  };
  (globalThis as { __swAbGate?: (tag: string, i: number, j: number, extra?: number) => void }).__swAbGate = (tag: string, i: number, j: number, extra?: number) => {
    if (inWin && tag !== 'enter') evs.push(`abgate ${tag} ${i} ${j} ${extra ?? ''} R${rollN}`);
  };
  (globalThis as { __swScGate?: (ev: string, x: number, y: number, a?: number, b?: number) => void }).__swScGate = (ev: string, x: number, y: number, a?: number, b?: number) => {
    if (inWin) evs.push(`sc ${ev} ${x} ${y} ${a ?? ''} ${b ?? ''} R${rollN}`);
  };
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let lab = '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng')) { lab = labelOf(m[1], Number(m[2])); break; }
    }
    if (lab === 'UndergroundHousesAndBuriedChests' && !inWin) { inWin = true; winStart = rollN; console.log(`[sc60] window starts at roll ${rollN}`); }
    if (store && !dumped && lab === 'SurfaceChests') { dumped = true; saveTo('js059'); console.log(`[sc60] SurfaceChests anchor at roll ${rollN}`); }
    if (store && lab === 'ChestsInJungleShrines') {
      if (inWin) { inWin = false; console.log(`[sc60] window ends at roll ${rollN} (count ${rollN - winStart})`); }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
      onWorldPartial: (w) => { if (!store) store = w.store as never as Store; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!dumped) throw new Error('sc60: 未命中 ▶SurfaceChests reseed 锚');
  writeFileSync(`${OUT}/sc-ev.txt`, evs.join('\n') + '\n');
  writeFileSync(`${OUT}/sc-rolls.txt`, rollLog.join('\n') + '\n');
  console.log(`[sc60] window rolls=${rollLog.length} events=${evs.length} -> ${OUT}/sc-ev.txt, sc-rolls.txt`);
}, 900_000);
