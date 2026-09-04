// IIII162 一次性：LT 窗 JS 箱调用掷 span 实测（__swChestEv ab/abx 戳）
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runLivingTreesPass } from '../src/world/gen/vanilla/LivingTreePass';

const OUT = '/tmp/iii146-out/cap-lt';
const G2 = process.env.HOME + '/GoldenChains/i106/x86-iamerror';

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

it('span probe', () => {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  const rng = new RNG(gs.seed);
  const ev: Array<[string, number, number, number]> = [];
  let n = 0;
  (globalThis as { __swChestEv?: (p: string, i: number, j: number, x?: number) => void }).__swChestEv =
    (p, i, j) => { if (p === 'ab' || p === 'abx') ev.push([p, i, j, n]); };
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = () => { n++; (globalThis as { __ltRc?: { n: number } }).__ltRc = { n }; };
  const oLog = console.log;
  const logs: Array<[string, number]> = [];
  console.log = (...a: unknown[]) => { logs.push([String(a[0] ?? ''), n]); };
  try {
    runLivingTreesPass(st, rng, gs, []);
  } finally {
    console.log = oLog;
    delete (globalThis as { __swChestEv?: unknown }).__swChestEv;
    delete (globalThis as { __swOnRoll?: unknown }).__swOnRoll;
  }
  // x86 箱1 = roll #90817619..#90817634 → JS idx 4943..4958; 箱2 = #90830935+pre6 → JS idx?
  // x86 房2 箱 = #90830941..#90830968 → JS idx 90830941-90812676=218265?? 超窗——房2 RM3 在 LT 窗内 idx = 90830934-90812676 = 218258
  for (let k = 0; k + 1 < ev.length; k += 2) {
    const [p1, i1, j1, n1] = ev[k]!;
    const [p2, i2, j2, n2] = ev[k + 1]!;
    if (p1 === 'ab' && p2 === 'abx') {
      console.log(`SPAN ab@(${i1},${j1}) n=${n1}..${n2} = ${n2 - n1 + 1} rolls | x86 room1 chest=4943..4958(16 rolls) room2=218266..218293(28)`);
    }
  }
  for (const [line, rc] of logs) {
    if (line.startsWith('LT try') || line.startsWith('LT result') || line.startsWith('LT patch') || line.startsWith('GLT r') || line.startsWith('MP enter') || line.startsWith('MP exit')) console.log(`EVT rc=${rc} ${line.slice(0, 56)}`);
  }
  console.log('total rolls in LT window:', n);
});
