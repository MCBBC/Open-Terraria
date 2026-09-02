// IIII99d：rainbow #32 残差簇定位仪（只读）。
// 克隆 _iii110a 范式；输出与 x86 金标 032_Dungeon 的逐格差异坐标簇 + 帧面摘要。
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_ORACLE === "1";   // ★一次性 rig/oracle 仪(2026-09-02 补门):夹具在 /tmp 不入库,缺省 skip 防默认 sweep 红;SW_ORACLE=1 启用

const CAP = process.env.SW_I89_OUT ?? '/tmp/iii99-out/cap-rainbow';
const G2 = process.env.SW_I89_G2 ?? '/tmp/iii80-out/x86-rainbow';
const CMP_IDX = Number(process.env.WIN_CMP ?? 32);
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
type AnyGs = Record<string, unknown>;
function desVal(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(desVal);
  if (v && typeof v === 'object') {
    const o = v as { __t?: string; d?: unknown[] };
    if (o.__t) {
      const Ctor = (globalThis as unknown as Record<string, new (n: number) => unknown>)[o.__t];
      const arr = new Ctor((o.d ?? []).length) as Uint8Array & { set(a: unknown[]): void };
      arr.set(o.d!);
      return arr;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

(RUN ? it : it.skip)(`IIII99d rainbow #32 diff-cluster locator`, () => {
  const hdr = JSON.parse(readFileSync(`${CAP}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const buf = readFileSync(`${CAP}/base_${c}.bin`);
    const per = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (per === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, buf.length / per));
  }
  const gs = desVal(JSON.parse(readFileSync(`${CAP}/base_gs.json`, 'utf8'))) as GenState;
  try { dualSnakes.length = 0; } catch { /* non-dual */ }
  void runDualDungeonsDitherSnakePass;

  const NAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) NAME.set(Number(m[1]), m[2]);
  }
  const pre = `${G2}/${String(CMP_IDX).padStart(3, '0')}_${NAME.get(CMP_IDX)}`;
  const xt = existsSync(`${pre}.typ`) ? new Uint16Array(readFileSync(`${pre}.typ`).buffer.slice(0)) : null;
  const xa = readFileSync(`${pre}.act`);
  const xfX = existsSync(`${pre}.frx`) ? new Uint16Array(readFileSync(`${pre}.frx`).buffer.slice(0)) : null;

  runDungeonPass(st, new RNG(gs.seed), gs, [] as never);

  if (!xt) throw new Error('no golden typ');
  const dA: Array<[number, number]> = [];
  const dT: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA.push([i % W, (i / W) | 0]); continue; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) dT.push([i % W, (i / W) | 0]);
  }
  console.log(`A=${dA.length} T=${dT.length}`);
  const summarize = (list: Array<[number, number]>, tag: string) => {
    // 聚类：按行分组、输出相邻行段
    const rows = new Map<number, number[]>();
    for (const [x, y] of list) { if (!rows.has(y)) rows.set(y, []); rows.get(y)!.push(x); }
    const ys = [...rows.keys()].sort((a, b) => a - b);
    let segs = 0;
    let curStart = -10, curEnd = -10, curInfo = '';
    const out: string[] = [];
    const flush = () => { if (curStart >= 0) out.push(`  seg ys=${curStart}..${curEnd} ${curInfo}`); };
    for (const y of ys) {
      const xs = rows.get(y)!;
      if (y > curEnd + 2) {
        flush(); curStart = -10;
      }
      if (curStart < 0) { curStart = y; curInfo = ''; }
      curEnd = y;
      curInfo += ` | y${y}:x${xs.sort((a, b) => a - b)[0]}..${xs[xs.length - 1]} n=${xs.length}`;
      segs++;
    }
    flush();
    console.log(`${tag}: ${segs} rows, seg-groups:`);
    for (const s of out) console.log(s);
  };
  summarize(dT, 'T-diffs');
  summarize(dA, 'A-diffs');
  // 帧面：对 active 相同且 type 相同但 frameX 不同的格子计数
  if (xfX) {
    let dfx = 0; let fI = -1;
    for (let i = 0; i < N; i++) {
      const va = xa[i]!;
      if (va === 0) continue;
      if (xt![i] !== SHEET[st.type[i]!]) continue;
      if (xfX[i] !== st.frameX[i]) { dfx++; if (fI < 0) fI = i; }
    }
    console.log(`frameX-diff(on matched type)=${dfx} first=${fI < 0 ? '-' : `(${fI % W},${(fI / W) | 0})`}`);
  }
}, 600_000);
void TILE_BY_KEY_GUARD;
function TILE_BY_KEY_GUARD(): void {}
