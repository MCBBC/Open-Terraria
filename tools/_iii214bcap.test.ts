// IIIII214b：天顶 UI 生成卡死 — 终清理槽头捕获（真值基座 dump，供快速重放迭代）
// 用法: SW_III214B_CAP=1 SW_III214B_SEED=getfixedboi npx vitest run tools/_iii214bcap.test.ts
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TileStore } from '../src/world/TileStore';

const RUN_CAP = !!process.env.SW_III214B_CAP;
const SEED = process.env.SW_III214B_SEED ?? 'getfixedboi';
const SIZE = Number(process.env.SW_III214B_SIZE ?? 0);
const OUT = process.env.SW_III214B_CAPDIR ?? '/tmp/iii214b-out/cap';
const SLOT = process.env.SW_III214B_CAPSLOT ?? '终清理';

function serializeStore(st: TileStore, dir: string): void {
  const hdr: Record<string, number | string> = { w: st.w, h: st.h };
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const a = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c];
    const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    writeFileSync(`${dir}/base_${c}.bin`, b);
    hdr[`${c}_len`] = a.length;
  }
  writeFileSync(`${dir}/base_hdr.json`, JSON.stringify(hdr));
}
type AnyGs = Record<string, unknown>;
function serVal(v: unknown): unknown {
  if (v instanceof Uint8Array || v instanceof Int8Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (v instanceof Uint16Array || v instanceof Int16Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (v instanceof Uint32Array || v instanceof Int32Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (v instanceof Float32Array || v instanceof Float64Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (Array.isArray(v)) return v.map(serVal);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) o[k] = serVal((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}

(RUN_CAP ? it : it.skip)(`capture base at "${SLOT}" slot head (zenith UI path)`, async () => {
  mkdirSync(OUT, { recursive: true });
  let liveStore: TileStore | null = null;
  let spawn = { x: -1, y: -1 };
  let wseed = -1;
  const G2Any = globalThis as unknown as Record<string, unknown>;
  G2Any.__swI91Cap = (st: unknown, g: unknown, ch: unknown, name: string) => {
    if (name !== SLOT) return;
    liveStore = st as TileStore;
    serializeStore(liveStore, OUT);
    writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(g)));
    writeFileSync(`${OUT}/base_chests.json`, JSON.stringify(ch ?? []));
    writeFileSync(`${OUT}/base_spawn.json`, JSON.stringify({ ...spawn, seed: wseed }));
    console.log(`[iii214bcap] captured @${SLOT} spawn=${spawn.x},${spawn.y} seed=${wseed}`);
    // 捕获即停管：专用 abort 错误（槽头钩在 pass try 外,直接外溢）
    const e = new Error('SW_III214B_ABORT');
    (e as Error & { swAbort?: boolean }).swAbort = true;
    throw e;
  };
  try {
    await generateWorld(
      {
        size: SIZE, width: 0, height: 0, seedText: SEED, evil: -1, name: 'iii214b-cap',
        onWorldPartial: (w) => {
          spawn = { x: w.spawnX, y: w.spawnY };
          wseed = w.seed;
        },
      } as never,
      () => {},
    );
    console.log('[iii214bcap] generation completed (no abort) — unexpected');
  } catch (e) {
    if ((e as { swAbort?: boolean })?.swAbort) console.log('[iii214bcap] aborted after capture (expected)');
    else throw e;
  } finally { delete G2Any.__swI91Cap; }
}, 900_000);
