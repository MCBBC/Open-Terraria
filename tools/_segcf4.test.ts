// 一次性取证 IV（F/Ba 终裁 II）：灯笼+开关两层外科补丁 + CF 重同步。
// 已证：I 段输出=吊灯(34,已全同)/灯笼(42)/开关(136,dgSwitch) + 线(F/Pa/Ba 不读)。
// 补丁：42+136 两族格集合改成 vanilla 032 终态 → F 若恰耗 39929 ⇒ F 无自因；仍偏 ⇒ F 自因。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deserialize as v8Deserialize } from 'node:v8';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG, UnifiedRandom } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_ORACLE === "1";   // ★一次性 rig/oracle 仪(2026-09-02 补门):夹具在 /tmp 不入库,缺省 skip 防默认 sweep 红;SW_ORACLE=1 启用

const W = 4200, H = 1200, N = W * H;
const G2 = process.env.SW_DG_G2 ?? '/tmp/sw-slp/g';
const CAP = '/tmp/dgcap';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (s !== undefined && !REV.has(s)) REV.set(s, i);
}
const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };

(RUN ? it : it.skip)('patched-lantern CF replay (F/Ba final verdict)', () => {
  const pre = `${G2}/031_Slush`;
  const dTyp = le16(`${pre}.typ`), dAct = readFileSync(`${pre}.act`), dWal = le16(`${pre}.wal`);
  const dLiq = readFileSync(`${pre}.liq`), dHalf = readFileSync(`${pre}.half`), dSlope = readFileSync(`${pre}.slope`);
  const dLty = readFileSync(`${pre}.lty`);
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.flags[i] = dAct[i] ? 1 : 0;
    st.type[i] = dAct[i] ? (REV.get(dTyp[i]!) ?? 0) : 0;
    st.wall[i] = dWal[i]!;
    st.liquid[i] = dLiq[i]!;
    st.liquidType[i] = dLiq[i]! > 0 ? dLty[i]! + 1 : 0;
    st.half[i] = dHalf[i]!;
    st.slope[i] = dSlope[i]!;
  }
  st.wire.set(readFileSync(`${CAP}/in.wire`));
  st.paint.set(readFileSync(`${CAP}/in.paint`));
  st.frameX.set(le16(`${CAP}/in.frameX`));
  st.frameY.set(le16(`${CAP}/in.frameY`));
  const gs = v8Deserialize(readFileSync(`${CAP}/gs.bin`)) as GenState;
  const chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null>; locked?: boolean }> = [];

  const gb = readFileSync(`${CAP}/gEnd.state`);
  const mkState = (steps: number): { sa: Int32Array; ix: number } => {
    const u = new UnifiedRandom(0) as unknown as { seedArray: Int32Array; inext: number; next(): number };
    for (let q = 0; q < 56; q++) u.seedArray[q] = gb.readInt32LE(q * 4);
    u.inext = gb.readInt32LE(56 * 4);
    for (let k = 0; k < steps; k++) u.next();
    return { sa: u.seedArray.slice(), ix: u.inext };
  };
  const ENTRY: Record<string, [number, number, string]> = {
    dungeonI: [36856, 1133, 'T'], dungeonT: [37989, 39929, 'F'],
    dungeonF: [77918, 2299, 'Pa'], dungeonPa: [80217, 4661, 'Ba'],
  };
  const entryStates = new Map<string, { sa: Int32Array; ix: number }>();
  for (const [k, [steps]] of Object.entries(ENTRY)) entryStates.set(k, mkState(steps));

  let rolls = 0;
  const rng2 = new RNG(gs.seed);
  const rAny = rng2 as unknown as Record<string, unknown>;
  const oInt = rAny.int as (...a: number[]) => number;
  const oNextInt = rAny.nextInt as (...a: number[]) => number;
  const oNext = rAny.next as () => number;
  rAny.int = (...a: number[]) => { rolls++; return oInt.apply(rng2, a); };
  rAny.nextInt = (...a: number[]) => { rolls++; return oNextInt.apply(rng2, a); };
  rAny.next = (...a: number[]) => { rolls++; return oNext.apply(rng2, a); };
  const uRand = (rng2 as unknown as { vanilla: UnifiedRandom }).vanilla;
  const uAny = uRand as unknown as Record<string, unknown>;
  const oUNext = uAny.next as () => number;
  uAny.next = (..._a: unknown[]) => { rolls++; return oUNext.apply(uRand); };

  // vanilla 032 灯笼格集
  const pre2 = `${G2}/032_Dungeon`;
  const vT = le16(`${pre2}.typ`), vA = readFileSync(`${pre2}.act`);
  const FAM = [42, 136];          // lantern + dungeon switch（dgLights 两族；吊灯已证全同）
  let patched = 0;
  const patchLanterns = (): void => {
    for (const sh of FAM) {
      const jsId = REV.get(sh)!;
      for (let i = 0; i < N; i++) {
        const vHas = vA[i]! !== 0 && vT[i] === sh;
        const jHas = (st.flags[i]! & 1) !== 0 && SHEET[st.type[i]!] === sh;
        if (vHas === jHas) continue;
        patched++;
        if (vHas) { st.flags[i] = 1; st.type[i] = jsId; st.frameX[i] = 0; st.frameY[i] = 0; }
        else { st.flags[i] = 0; st.type[i] = 0; }
      }
    }
  };

  let mark = 0, prevSnap = '';
  const snapFn = (name: string): void => {
    if (prevSnap) {
      const [, exp, seg] = ENTRY[prevSnap]!;
      console.log(`CF ${seg}: rolls=${rolls - mark} x86=${exp} diff=${rolls - mark - exp}`);
      prevSnap = '';
    }
    if (name === 'dungeonT') {           // F 入口：先补丁再重同步
      patchLanterns();
      console.log(`family patch (42+136): ${patched} cells`);
    }
    const e = entryStates.get(name);
    if (e) {
      const uS = (rng2 as unknown as { vanilla: { seedArray: Int32Array; inext: number } }).vanilla;
      uS.seedArray.set(e.sa); uS.inext = e.ix;
      mark = rolls; prevSnap = name;
    }
  };
  runDungeonPass(st, rng2, gs, chests, snapFn);

  // 终态对拍
  let dTot = 0; const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const va = vA[i]!, vt = va ? vT[i]! : 0;
    const ja = st.flags[i]! & 1, jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 0x7777) : 0;
    if (va !== ja || vt !== jt) { dTot++; const k = `${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
  }
  console.log(`PATCHED final vs 032: diffCells=${dTot}`);
  let shown = 0;
  for (let i = 0; i < N && shown < 24; i++) {
    const va = vA[i]!, vt = va ? vT[i]! : 0;
    const ja = st.flags[i]! & 1, jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 0x7777) : 0;
    if (va !== ja || vt !== jt) { console.log(`  resid (${i % W},${(i / W) | 0}) van=${vt} js=${jt}`); shown++; }
  }
  console.log(`pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, n]) => `${k}×${n}`).join(' ')}`);
}, 300_000);
