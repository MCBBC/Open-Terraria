import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { doErrorWorldShuffleBlocks } from '../src/world/gen/vanilla/SecretSeedDoEndsPass';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
function desVal(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(desVal);
  if (v && typeof v === 'object') {
    const o = v as { __t?: string; d?: unknown[] };
    if (o.__t) {
      const Ctor = (globalThis as unknown as Record<string, new (n: number) => unknown>)[o.__t];
      const arr = new Ctor((o.d?.length ?? 0)) as { set(a: unknown[]): void };
      arr.set(o.d!);
      return arr;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}
it('phase roll boundaries', () => {
  const OUT = '/tmp/iii165-out/cap-lc';
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  restoreGenSolid(new Map(JSON.parse(readFileSync(`${OUT}/base_gensolid.json`, 'utf8')) as Array<[number, boolean]>));
  const marks: string[] = [];
  let rc = 0;
  (globalThis as { __swEw?: (k: string, a: number, b: number, c: number) => void }).__swEw = (k) => {
    if (k === 'p2b') marks.push(`p2 begin rc=${rc}`);
    if (k === 'p3b') marks.push(`p3 begin rc=${rc}`);
    if (k === 'p4b') marks.push(`p4 begin rc=${rc}`);
    if (k === 'p4end') marks.push(`p4 end rc=${rc}`);
  };
  const oRoll = (globalThis as { __swOnRoll?: unknown }).__swOnRoll;
  (globalThis as { __swOnRoll?: (v: number, i: object) => void }).__swOnRoll = () => { rc++; };
  try {
    doErrorWorldShuffleBlocks(st, new RNG(gs.seed), gs);
  } finally {
    delete (globalThis as { __swEw?: unknown }).__swEw;
    (globalThis as { __swOnRoll?: unknown }).__swOnRoll = oRoll;
  }
  console.log(marks.join('\n'));
  console.log(`shuffle total rc=${rc}`);
}, 300_000);
