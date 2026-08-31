// IIII98c：rainbow 幽灵谓词双点 · Dungeon 单 pass 反演重放 + 家具/横幅候选级状态仪。
// 克隆 _iii89dg 范式（capture 复用 /tmp/iii99-out/cap-rainbow @▶Dungeon 基座），
// 新增：
//   SW_I110_MARK=1          —— 使能 DungeonPass 内 futx/fudes/BANHD/BANRET 标记（与 rig 同 tag）
//   SW_I110_JRNG=lo-hi      —— 家具 j 窗口明细快照（与 rig Mark98FutCell 同协议）
//   SW_I110_OUT=<dir>       —— 标记落盘 <dir>/js-marks.txt（默认 /tmp/iii110-out）
//   SW_I89_ROLLLOG=<path>   —— pass 内样本值流（mc|value，同 iii89 协议）
// 用法：cd game && SW_I110_MARK=1 npx vitest run tools/_iii110a.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';
void 0;

const TAG = process.env.SW_I89_TAG ?? 'rainbow';
const CAP = process.env.SW_I89_OUT ?? '/tmp/iii99-out/cap-rainbow';
const G2 = process.env.SW_I89_G2 ?? '/tmp/iii80-out/x86-rainbow';
const CMP_IDX = Number(process.env.WIN_CMP ?? 33);
const W = 4200, H = 1200, N = W * H;
const OUTDIR = process.env.SW_I110_OUT ?? '/tmp/iii110-out';

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

it(`IIII98c rainbow dungeon replay + candidate state marks`, () => {
  const hdr = JSON.parse(readFileSync(`${CAP}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const buf = readFileSync(`${CAP}/base_${c}.bin`);
    const per = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (per === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, buf.length / per));
  }
  const gs = desVal(JSON.parse(readFileSync(`${CAP}/base_gs.json`, 'utf8'))) as GenState;

  // dual 链模块态复位（rainbow 非 dual；仅清槽防跨用例污染）
  try { dualSnakes.length = 0; } catch { /* non-dual */ }
  void runDualDungeonsDitherSnakePass;

  // x86 dump 对拍通道
  const NAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) NAME.set(Number(m[1]), m[2]);
  }
  const pre = `${G2}/${String(CMP_IDX).padStart(3, '0')}_${NAME.get(CMP_IDX)}`;
  const xt = existsSync(`${pre}.typ`) ? new Uint16Array(readFileSync(`${pre}.typ`).buffer.slice(0)) : null;
  const xa = existsSync(`${pre}.act`) ? readFileSync(`${pre}.act`) : null;
  const xw = existsSync(`${pre}.wal`) ? new Uint16Array(readFileSync(`${pre}.wal`).buffer.slice(0)) : null;

  const wv: string[] = [];
  (globalThis as unknown as { __wvLines?: string[] }).__wvLines = wv;
  (globalThis as unknown as { __swWvLog?: unknown }).__swWvLog = {};
  (globalThis as unknown as { __swRollN?: number }).__swRollN = 0;
  const ROLLLOG = process.env.SW_I89_ROLLLOG;
  if (ROLLLOG) writeFileSync(ROLLLOG, '');
  let rollH = 2166136261 >>> 0;
  const oOnRoll = (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll;
  const rollLogBuf: string[] = [];
  (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll = (v) => {
    const box = (globalThis as unknown as { __swRollN?: number });
    box.__swRollN = (box.__swRollN ?? 0) + 1;
    rollH = ((rollH ^ (v >>> 0)) * 16777619) >>> 0;
    if (ROLLLOG) rollLogBuf.push(`${box.__swRollN}|${v}`);
  };
  globalThis.__i93RollHash = () => `${rollH.toString(16)}(${rollH})`;
  const t0 = Date.now();
  try {
    runDungeonPass(st, rngNew(gs), gs, [] as never);
  } finally {
    (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll = oOnRoll;
  }
  console.log(`runDungeonPass ${Date.now() - t0}ms totalSample=${(globalThis as unknown as { __swRollN?: number }).__swRollN}`);
  console.log(`passFnvHash=${globalThis.__i93RollHash?.() ?? 'na'}`);
  writeFileSync(`${OUTDIR}/js-marks.txt`, wv.join('\n') + '\n');
  if (ROLLLOG) writeFileSync(ROLLLOG, rollLogBuf.join('\n') + '\n');
  console.log(`marks -> ${OUTDIR}/js-marks.txt (${wv.length} lines)`);

  if (xt && xa && xw) {
    let dA = 0, dT = 0, dW = 0;
    let fI = -1;
    for (let i = 0; i < N; i++) {
      const va = xa[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) { dA++; if (fI < 0) fI = i; continue; }
      const vt = va ? xt[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (vt !== jt) { dT++; if (fI < 0) fI = i; }
      else if (xw[i] !== st.wall[i]) { dW++; if (fI < 0) fI = i; }
    }
    console.log(`QUICKCMP#${CMP_IDX}: A=${dA} T=${dT} W=${dW} first=${fI < 0 ? '-' : `(${fI % W},${(fI / W) | 0})`}`);
  }
}, 600_000);

function rngNew(gs: GenState): RNG {
  return new RNG(gs.seed);
}
