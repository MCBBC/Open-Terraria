// IIII67 一次性仪：CELEB 地牢 pass 段级全图快照（__dgSegWatch 钩，dungeonL..dungeonLate）。
// 与 x86 iii61-rig JJHook.Snap（SW_SNAPDIR）同格式落盘：{seq:D3}_{tag}.{8ch}；全图 box。
// 用法：cd game && SW_I67SNAP=1 npx vitest run tools/_iii67snap.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I67SNAP === '1';
const SEED = process.env.SW_M8_SEED ?? '1999040562';
const EVIL = Number(process.env.SW_M8_EVIL ?? 0) as -1 | 0 | 1;
const OUTDIR = process.env.SW_I67_DIR ?? '/tmp/iii67-out/js-snaps';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('iii67 segment snapshots', async () => {
  mkdirSync(OUTDIR, { recursive: true });
  let seq = 0;
  const logLines: string[] = [];
  type ST2 = {
    idx(x: number, y: number): number; inBounds(x: number, y: number): boolean; w: number; h: number;
    type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
    liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
  };
  (globalThis as unknown as { __dgSegWatch?: (name: string, s: ST2) => void }).__dgSegWatch =
    (name: string, st: ST2) => {
      const W = st.w, H = st.h, N = W * H;
      const clean = (tag: string): string => {
        let out = '';
        for (const ch of tag) out += /[0-9A-Za-z]/.test(ch) ? ch : '_';
        return out;
      };
      // ★IIIII67 与 x86 JJHook.Snap 字节布局逐一对齐：所有通道=byte 数组；
      //   typ/wal 每格 2 字节小端（byte[n*2]），其余每格 1 字节。
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
          // x86 Snap 直写 t.type（活/非活性同值）；JS 端经 sheet 直映,未注册=9999 哨兵
          const t = st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999);
          typ[p * 2] = t & 0xff;
          typ[p * 2 + 1] = (t >>> 8) & 0xff;
          act[p] = st.flags[i]! & 1;
          wal[p * 2] = st.wall[i]! & 0xff;
          wal[p * 2 + 1] = (st.wall[i]! >>> 8) & 0xff;
          liq[p] = st.liquid[i]!;
          hf[p] = st.half[i]!;
          sl[p] = st.slope[i]!;
          lt[p] = st.liquid[i]! > 0 ? st.liquidType[i]! - 1 : 0;   // vanilla 0 基
          ia[p] = ((st.wire[i]! >>> 5) & 1) as 0 | 1;
        }
      }
      const base = `${String(seq++).padStart(3, '0')}_dg_${clean(name)}`;
      logLines.push(`${seq - 1}|${name}`);
      const dump = { typ, act, wal, liq, half: hf, slope: sl, lty: lt, inact: ia };
      const bufs: Record<string, Buffer> = {};
      for (const [k, v] of Object.entries(dump)) {
        const buf = Buffer.alloc(v.byteLength);
        Buffer.from(v.buffer, v.byteOffset, v.byteLength).copy(buf);
        bufs[k] = buf;
        writeFileSync(`${OUTDIR}/${base}.${k}`, buf);
      }
      console.log(`[i67snap] ${base}`);
    };
  try {
    await generateWorld({
      width: Number(process.env.SW_M8_W ?? 4200), height: Number(process.env.SW_M8_H ?? 1200),
      seedText: SEED, evil: EVIL,
      seedFlags: { tenthAnniversary: true },
    });
  } finally {
    delete (globalThis as unknown as { __dgSegWatch?: unknown }).__dgSegWatch;
    console.log(`[i67snap] total=${seq}`);
  }
  writeFileSync(`${OUTDIR}/snaplog.txt`, logLines.join('\n') + '\n');
}, 900_000);
