// IIII93b 批一次性诊断：runDungeonPass 双座分段差值追踪（_iii89dg 克隆）。
// 在每个 snap(name)/段界对 dump#CMP 做八通道差分计数（act/typ/wal/liq/lty/inact），
// 输出「实例序号 | 段名 | 累计差值」——定位双座内首个大爆炸段。
// 用法：cd game && SW_I99SEG=1 SW_I89_OUT=/tmp/iii99-out/cap-ddual \
//   SW_I89_G2=/tmp/iii84-out/x86-i78-ddual SW_I89_CMP=33 npx vitest run tools/_iii99seg.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { TILE_DEFS } from '../src/data/tiles';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_I99SEG === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii99-out/cap-ddual';
const G2 = process.env.SW_I89_G2 ?? '/tmp/iii84-out/x86-i78-ddual';
const CMP_IDX = Number(process.env.SW_I89_CMP ?? 33);
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  function desVal(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(desVal);
    if (v && typeof v === 'object') {
      const o = v as { __t?: string; d?: unknown[] };
      if (o.__t) {
        const Ctor = (globalThis as unknown as Record<string, new (n: number) => Uint8Array | Int16Array>)[o.__t];
        const arr = new (Ctor as unknown as new (n: number) => never)(o.d?.length ?? 0) as unknown as { set(a: unknown[]): void };
        arr.set(o.d!);
        return arr;
      }
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  return { st, gs };
}

(RUN ? it : it.skip)('segment-wise diff tracking through two instances', () => {
  if (!existsSync(`${OUT}/base_dual.json`)) throw new Error('base_dual.json missing');
  const du = JSON.parse(readFileSync(`${OUT}/base_dual.json`, 'utf8')) as typeof dualDungeonState;
  dualDungeonState.enabled = du.enabled;
  dualDungeonState.potentialBounds = du.potentialBounds;
  dualDungeonState.dungeons = du.dungeons;
  dualDungeonState.normalizedDistanceSafeFromDither = du.ndsf;
  console.log(`[i99] dungeons=${JSON.stringify(du.dungeons.map((d) => [d.side, d.location, d.theme]))}`);

  // x86 truth at dump#CMP
  let dn = '';
  for (const f of require('node:fs').readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m && Number(m[1]) === CMP_IDX) dn = m[2];
  }
  const pre = `${G2}/${String(CMP_IDX).padStart(3, '0')}_${dn}`;
  const xt = (() => { const b = readFileSync(`${pre}.typ`); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); })();
  const xa = readFileSync(`${pre}.act`), xw = readFileSync(`${pre}.wal`) ?? null;
  const xwl = (() => { const b = readFileSync(`${pre}.wal`); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); })();
  const xl = readFileSync(`${pre}.liq`);

  const st = hydrate().st;
  const gs = JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'));
  if (du.dungeons.length >= 2 && !dualSnakes[0]) {
    const scr = new TileStore(st.w, st.h);
    for (const c of CHANS) {
      const src = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c]!;
      (scr as unknown as Record<string, Uint8Array | Uint16Array>)[c]!.set(src);
    }
    runDualDungeonsDitherSnakePass(scr, new RNG(gs.seed), gs);
  }

  const instOf = { n: 0 };
  let prevA = -1, prevT = -1, prevW = -1, prevL = -1, prevIa = -1;
  const wv: string[] = [];
  (globalThis as { __wvLines?: string[] }).__wvLines = wv;
  (globalThis as { __swWvLog?: unknown }).__swWvLog = {};
  (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll = () => {};

  (globalThis as unknown as { __dgSegWatch?: (name: string, s2: TileStore) => void }).__dgSegWatch =
    (name: string, s2: TileStore) => {
      if (name === 'd61layoutStart') instOf.n++;
      let dA = 0, dT = 0, dWl = 0, dLq = 0, dIa = 0;
      for (let i = 0; i < N; i++) {
        const ja = s2.flags[i]! & 1;
        const va = xa[i]!;
        if (va !== ja) { dA++; continue; }
        if (va) {
          const vt = xt[i]!;
          const jt = SHEET[s2.type[i]!]! >= 0 ? SHEET[s2.type[i]!]! : 9999;
          if (vt !== jt) dT++;
        }
        if (xwl[i] !== s2.wall[i]) dWl++;
        if (xl[i] !== s2.liquid[i]) dLq++;
        if (((xa[i]! ? 0 : 1)) !== ((s2.wire[i]! >>> 5) & 1)) dIa++;
      }
      const tag = `inst${instOf.n}`;
      console.log(`SEG ${tag} ${name}: A:${prevA < 0 ? dA : `+${dA - prevA}`} T:${prevT < 0 ? dT : `+${dT - prevT}`} W:${prevW < 0 ? dWl : `+${dWl - prevW}`} L:${prevL < 0 ? dLq : `+${dLq - prevL}`} Ia:${prevIa < 0 ? dIa : `+${dIa - prevIa}`}`);
      prevA = dA; prevT = dT; prevW = dWl; prevL = dLq; prevIa = dIa;
      void xt; void xa; void xw;
    };

  runDungeonPass(st, new RNG(gs.seed), gs, []);
});
