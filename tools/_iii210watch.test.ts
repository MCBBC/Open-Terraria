// ★IIIII210 一次性仪④：终清理期 (2580..2590,425..450) 盒内写面监视（Proxy 通道）
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I210WATCH === '1';
const OUT = process.env.SW_I210_OUT ?? '/tmp/iii210-out';
const W = 4200, H = 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } } | undefined)?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const inBox = (x: number, y: number): boolean => x >= 2578 && x <= 2592 && y >= 424 && y <= 450;
(RUN ? it : it.skip)('iii210 final cleanup write watch', async () => {
  const g = globalThis as Record<string, unknown>;
  const logs: string[] = [];
  let armed = false;
  let passName = '';
  g.__swI91Cap = (stRaw: unknown, _gs: unknown, _ch: unknown, name: string) => {
    if (name !== '终清理' || armed) return;
    const st = stRaw as TileStore;
    armed = true;
    const wrap = (arr: Uint8Array | Uint16Array, label: string): unknown => new Proxy(arr, {
      get(t: Record<string, unknown>, p: string | symbol, _r: unknown): unknown {
        if (p === 'length' || p === 'byteLength' || p === 'byteOffset') return (t as unknown as Record<string, number>)[p as string];
        const v = (t as unknown as Record<string, unknown>)[p as string];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
      set(t: Record<string, unknown>, p: string | symbol, v: unknown): boolean {
        if (typeof p === 'string' && /^\d+$/.test(p)) {
          const idx = Number(p);
          const x = idx % W, y = (idx - x) / W;
          if (inBox(x, y) && t[p] !== v) logs.push(`${label} (${x},${y}) ${t[p]}->${v} @${passName}`);
        }
        t[p] = v;
        return true;
      },
    });
    const rec = st as unknown as Record<string, unknown>;
    rec.type = wrap(st.type, 'typ');
    rec.liquid = wrap(st.liquid, 'liq');
    rec.wire = wrap(st.wire, 'wir');
    rec.flags = wrap(st.flags, 'flg');
    rec.liquidType = wrap(st.liquidType, 'lty');
  };
  const baseOnPartial = (w: { store: TileStore }, name: string): void => { passName = name; void w; };
  try {
    await generateWorld({
      width: W, height: H,
      seedText: '1.1.1.0.doubledaringdangers|20260831',
      evil: 0 as -1 | 0 | 1,
      onWorldPartial: (w, _i, name) => { baseOnPartial(w, name); },
    } as Parameters<typeof generateWorld>[0]);
  } finally { delete g.__swI91Cap; }
  writeFileSync(`${OUT}/j-watch.txt`, logs.join('\n') + '\n');
  console.log(`watch rows=${logs.length}`);
}, 600_000);
