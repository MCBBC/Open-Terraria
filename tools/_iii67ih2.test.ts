// IIII67 单屋快照仪：挂 __dgSegWatch 接收 ih_chest/ih_fnt/ih_ban（与 x86 rig 同名），
// 以 JJHook.Snap 字节布局落盘。用法：SW_I67IHSNAP=1 npx vitest run tools/_iii67ih2.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I67IHSNAP === '1';
const SEED = process.env.SW_M8_SEED ?? '1999040562';
const OUTDIR = process.env.SW_I67_DIR ?? '/tmp/iii67-out/js-ih-snaps';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('iii67 island-house segment snapshots', async () => {
  mkdirSync(OUTDIR, { recursive: true });
  let seq = 0;
  type ST2 = {
    idx(x: number, y: number): number; inBounds(x: number, y: number): boolean; w: number; h: number;
    type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
    liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
  };
  (globalThis as unknown as { __dgSegWatch?: (name: string, s: ST2) => void }).__dgSegWatch =
    (name: string, st: ST2) => {
      const W = st.w, H = st.h, N = W * H;
      // 与 rig 相同布局：typ/wal 双字节小端，其余单字节
      const typ = new Uint8Array(N * 2);
      const act = new Uint8Array(N);
      const wal = new Uint8Array(N * 2);
      const liq = new Uint8Array(N);
      const hf = new Uint8Array(N);
      const sl = new Uint8Array(N);
      const lt = new Uint8Array(N);
      const ia = new Uint8Array(N);
      let p = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++, p++) {
          if (!st.inBounds(x, y)) continue;
          const i = st.idx(x, y);
          const t = st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999);
          typ[p * 2] = t & 0xff;
          typ[p * 2 + 1] = (t >>> 8) & 0xff;
          act[p] = st.flags[i]! & 1;
          wal[p * 2] = st.wall[i]! & 0xff;
          wal[p * 2 + 1] = (st.wall[i]! >>> 8) & 0xff;
          liq[p] = st.liquid[i]!;
          hf[p] = st.half[i]!;
          sl[p] = st.slope[i]!;
          lt[p] = st.liquid[i]! > 0 ? st.liquidType[i]! - 1 : 0;
          ia[p] = ((st.wire[i]! >>> 5) & 1) as 0 | 1;
        }
      }
      const base = `${String(seq++).padStart(3, '0')}_${name}`;
      const dump = { typ, act, wal, liq, half: hf, slope: sl, lty: lt, inact: ia };
      for (const [k, v] of Object.entries(dump)) {
        const buf = Buffer.alloc(v.byteLength);
        Buffer.from(v.buffer, v.byteOffset, v.byteLength).copy(buf);
        writeFileSync(`${OUTDIR}/${base}.${k}`, buf);
      }
      console.log(`[i67ihsnap] ${base}`);
    };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED,
      evil: Number(process.env.SW_M8_EVIL ?? 0) as -1 | 0 | 1,
      seedFlags: { tenthAnniversary: true },
    });
  } finally {
    delete (globalThis as unknown as { __dgSegWatch?: unknown }).__dgSegWatch;
    console.log(`[i67ihsnap] total=${seq}`);
  }
}, 900_000);
