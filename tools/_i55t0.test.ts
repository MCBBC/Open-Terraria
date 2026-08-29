// IIII55·slot0 复验仪：抓 JS pass0 末态 8 通道 vs G2 000_Terrain，输出差带分布。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I55T0 === '1';
const OUT = '/tmp/iii55-out';
const W = Number(process.env.SW_I55T0_W ?? 4200), H = 1200, N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
(RUN ? it : it.skip)('IIII55 t0 terrain zone check', async () => {
  let captured: Uint8Array[] | null = null;
  await generateWorld({
    width: W, height: H, seedText: process.env.SW_I55_SEED ?? '1671560105', evil: 0 as -1 | 0 | 1,
    seedFlags: { getGoodWorld: true },
    onWorldPartial: (w, i) => {
      if (i === 0 && !captured) {
        const st = w.store as unknown as Record<string, Uint16Array | Uint8Array>;
        const a = new Uint8Array(N); const t = new Uint16Array(N);
        for (let k = 0; k < N; k++) { a[k] = (st.flags[k] as number) & 1; const sh = SHEET[st.type[k] as number]; t[k] = sh >= 0 ? sh : 9999; }
        captured = [a, t];
      }
    },
  });
  if (!captured) throw new Error('no snapshot');
  const gact = readFileSync('/tmp/iii44-out/x86-ftw/000_Terrain.act');
  const btyp = readFileSync('/tmp/iii44-out/x86-ftw/000_Terrain.typ');
  const gtyp = new Uint16Array(btyp.buffer.slice(btyp.byteOffset, btyp.byteLength));
  // 差异行的行统计
  const rowCnt = new Array(H).fill(0);
  let pairMap = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const va = gact[i], ja = captured[0][i];
    const vt = va ? gtyp[i] : 0, jt = ja ? captured[1][i] : 0;
    if (va !== ja || vt !== jt) {
      rowCnt[(i / W) | 0]++;
      const key = `${vt}>${jt}`;
      pairMap.set(key, (pairMap.get(key) ?? 0) + 1);
    }
  }
  console.log('diff rows histogram (top):', [...rowCnt.entries()].filter(([, c]) => c > 500).map(([r, c]) => `y${r}x${c}`).join(' '));
  console.log('pairs:', [...pairMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' '));
}, 600_000);
