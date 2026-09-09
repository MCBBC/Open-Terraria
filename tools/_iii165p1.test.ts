// IIII165 一次性：JS 相① 全量锚点流落盘（与 python vanilla 重放对拍）
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I165P1=1 npx vitest run tools/_iii165p1.test.ts
const RUN = process.env.SW_I165P1 === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { doErrorWorldShuffleBlocks } from '../src/world/gen/vanilla/SecretSeedDoEndsPass';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { TILE_DEFS } from '../src/data/tiles';
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
it('p1 anchors dump', () => {
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
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = (TILE_DEFS[i] as unknown as { vanilla?: { sheet?: number } })?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const ev: Array<[string, number, number, number, number]> = [];
  (globalThis as { __swEw?: (k: string, a: number, b: number, c: number) => void }).__swEw = (k, a, b, c) => {
    ev.push([k, a, b, c, rc]);
  };
  const oRoll = (globalThis as { __swOnRoll?: unknown }).__swOnRoll;
  let rc = 0;
  (globalThis as { __swOnRoll?: (v: number, i: object) => void }).__swOnRoll = () => { rc++; };
  try {
    doErrorWorldShuffleBlocks(st, new RNG(gs.seed), gs);
  } finally {
    delete (globalThis as { __swEw?: unknown }).__swEw;
    (globalThis as { __swOnRoll?: unknown }).__swOnRoll = oRoll;
  }
  writeFileSync('/tmp/iii165-out/js-p1.json', JSON.stringify({ total: rc, ev }));
  const p1w = ev.filter((e) => e[0] === 'p1w');
  console.log('js total', rc, 'p1w count', p1w.length);
}, 300_000);
