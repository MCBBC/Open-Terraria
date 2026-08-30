// IIII65 一次性仪 v2：Dungeon pass 内部段级网格快照（__dgSegWatch 钩）——与 x86 rig
// SW_SNAPDIR 的 JJHook.Snap 同位同态对比。BOX 限定塔区周边（#32 残差簇域），通道
// 语义完全对齐 mile8（typ=x86 原版 sheet 直映/ghost 保留；lty x86 0 基 ↔ JS 1 基）。
// 用法：cd game && SW_I65SNAP=1 npx vitest run tools/_iii65snap.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I65SNAP === '1';
const SEED = process.env.SW_M8_SEED ?? '51620200';
const OUTDIR = process.env.SW_I65_DIR ?? '/tmp/iii65-out/js-snaps';

const BX0 = Number(process.env.SW_I65_BX0 ?? 3200);
const BX1 = Number(process.env.SW_I65_BX1 ?? 4150);
const BY0 = Number(process.env.SW_I65_BY0 ?? 60);
const BY1 = Number(process.env.SW_I65_BY1 ?? 760);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('iii65 segment snapshots', async () => {
  mkdirSync(OUTDIR, { recursive: true });
  const W = 4200, H = 1200;
  const RW = BX1 - BX0 + 1, RH = BY1 - BY0 + 1, N = RW * RH;
  const clean = (tag: string): string => {
    let out = '';
    for (const ch of tag) out += /[0-9A-Za-z]/.test(ch) ? ch : '_';
    return out;
  };
  let seq = 0;
  const write = (name: string, ch: Record<string, Uint8Array | Uint16Array>): void => {
    const base = `${String(seq++).padStart(3, '0')}_${clean(name)}`;
    for (const [k, v] of Object.entries(ch)) {
      const buf = Buffer.alloc(v.byteLength);
      Buffer.from(v.buffer, v.byteOffset, v.byteLength).copy(buf);
      writeFileSync(`${OUTDIR}/${base}.${k}`, buf);
    }
    console.log(`[i65snap] ${base} rw=${RW} rh=${RH}`);
  };
  type ST2 = {
    idx(x: number, y: number): number; inBounds(x: number, y: number): boolean;
    type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
    liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
  };
  (globalThis as unknown as { __dgSegWatch?: (name: string, s: ST2) => void }).__dgSegWatch =
    (name: string, st: ST2) => {
      const typ = new Uint8Array(N * 2);
      const act = new Uint8Array(N);
      const wal = new Uint8Array(N * 2);
      const liq = new Uint8Array(N);
      const hf = new Uint8Array(N);
      const sl = new Uint8Array(N);
      const lt = new Uint8Array(N);
      const ia = new Uint8Array(N);
      let p = 0;
      for (let y = BY0; y <= BY1; y++) {
        for (let x = BX0; x <= BX1; x++, p++) {
          if (!st.inBounds(x, y)) continue;
          const i = st.idx(x, y);
          const sh = SHEET[st.type[i]!];
          const t = st.flags[i]! ? (sh >= 0 ? sh : 9999) : (st.type[i] === 0 ? 0 : (sh >= 0 ? sh : 9999));
          typ[p * 2] = t & 0xff;
          typ[p * 2 + 1] = ((t >>> 8) & 0xff) as number;
          act[p] = st.flags[i]! & 1;
          wal[p * 2] = st.wall[i]! & 0xff;
          wal[p * 2 + 1] = ((st.wall[i]! >>> 8) & 0xff) as number;
          liq[p] = st.liquid[i]!;
          hf[p] = st.half[i]!;
          sl[p] = st.slope[i]!;
          lt[p] = st.liquid[i]! > 0 ? st.liquidType[i]! - 1 : 0;   // x86 vanilla 0 基对齐
          ia[p] = ((st.wire[i]! >>> 5) & 1) as 0 | 1;
        }
      }
      write(`dg_${name}`, { typ, act, wal, liq, half: hf, slope: sl, lty: lt, inact: ia });
    };
  try {
    await generateWorld({ width: W, height: H, seedText: SEED, evil: -1, seedFlags: { drunkWorld: true } });
  } finally {
    delete (globalThis as unknown as { __dgSegWatch?: unknown }).__dgSegWatch;
    console.log(`[i65snap] total=${seq}`);
  }
}, 900_000);
