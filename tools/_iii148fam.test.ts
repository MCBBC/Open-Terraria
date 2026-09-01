// IIII109b 批一次性诊断：seat0/1 特征窗【族账】仪——dungeon* 窗 mark 主实例掷差分
//   （JS 现行代码）vs x86 权威表（/tmp/iii132-out/x86r-snap/snaps.log，同种子
//   1.1.1.0.doubledaringdangers|20260831，JJHook.Snap 边界 rc=全流主计数）。
// 复用 _iii113drl 基座（cap-ddual hydrate + DRL 镜像钩 + 主实例掷锁）。
// 用法：cd game && SW_I148=1 SW_I89_OUT=/tmp/iii99-out/cap-ddual \
//   SW_I148_OUT=/tmp/iii148-out npx vitest run tools/_iii148fam.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_I148 === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii99-out/cap-ddual';
const JOUT = process.env.SW_I148_OUT ?? '/tmp/iii148-out';

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
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

// —— x86 权威族账（/tmp/iii132-out/x86r-snap/snaps.log；dg01_premk 前基=48,190,350）——
// seat0: L=48222991 E=48223227 PD=48223992 Pi=48226674 S=48232390 D=48233271 W=48233316
//        P=48233563 C=48233638 B=48270121 G=48320966 I=48567773 T=48571701 F=48645823
//        Pa=48653851 Ba=48670721 Late=48670736
// seat1: L=48701946 E=48702162 PD=48703290 Pi=48709281 S=48715316 D=48716205 W=48716250
//        P=48716517 C=48716603 B=48751645 G=48796911 I=49077625 T=49083165 F=49165004
//        Pa=49174085 Ba=49189439 Late=49189439
const X86: number[][] = [
  [48222991, 48223227, 48223992, 48226674, 48232390, 48233271, 48233316, 48233563, 48233638, 48270121, 48320966, 48567773, 48571701, 48645823, 48653851, 48670721, 48670736],
  [48701946, 48702162, 48703290, 48709281, 48715316, 48716205, 48716250, 48716517, 48716603, 48751645, 48796911, 49077625, 49083165, 49165004, 49174085, 49189439, 49189439],
];
const FAMS = ['L', 'E', 'PD', 'Pi', 'S', 'D', 'W', 'P', 'C', 'B', 'G', 'I', 'T', 'F', 'Pa', 'Ba', 'Late'];

(RUN ? it : it.skip)('i148 family ledger: per-seat dungeon* window main-roll nets vs x86', () => {
  const du = JSON.parse(readFileSync(`${OUT}/base_dual.json`, 'utf8')) as typeof dualDungeonState;
  dualDungeonState.enabled = du.enabled;
  dualDungeonState.potentialBounds = du.potentialBounds;
  dualDungeonState.dungeons = du.dungeons;
  dualDungeonState.normalizedDistanceSafeFromDither = du.ndsf;

  const st0 = hydrate().st;
  const gsRaw = JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8')) as unknown as { seed: string };
  if (du.dungeons.length >= 2 && !dualSnakes[0]) {
    const scr = new TileStore(st0.w, st0.h);
    for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
      const src = (st0 as unknown as Record<string, Uint8Array | Uint16Array>)[c]!;
      (scr as unknown as Record<string, Uint8Array | Uint16Array>)[c]!.set(src);
    }
    runDualDungeonsDitherSnakePass(scr, new RNG(gsRaw.seed), gsRaw as never);
  }

  const lines: string[] = [];
  const g = globalThis as unknown as {
    __swWvLog?: unknown; __wvLines?: string[];
    __swI113?: (l: string) => void;
    __swOnRoll?: (v: number, inst: object) => void; __swRollN?: number; __swRollTotal?: number;
  };
  g.__swWvLog = 1;
  g.__wvLines = lines;
  g.__swI113 = (l) => lines.push(l);
  let rollN = 0;
  let mainInst: object | undefined;
  g.__swRollN = 0;
  g.__swOnRoll = (_v, inst) => {
    rollN++;
    g.__swRollN = rollN;
    if (mainInst === undefined) mainInst = inst;
    else if (inst !== mainInst) { rollN--; g.__swRollN = rollN; return; }
  };

  runDungeonPass(st0, new RNG(gsRaw.seed), gsRaw as never, []);
  delete g.__swI113;
  delete g.__swWvLog;

  writeFileSync(`${JOUT}/js-fam-marks-148.txt`, lines.filter((l) => l.startsWith('MARK|')).join('\n') + '\n');

  // —— 按座聚合 dungeon* mark（座=dungeonL 出现序；dual 两座）——
  const famRows: Array<Record<string, number>> = [];
  let cur: Record<string, number> | null = null;
  for (const l of lines) {
    const m = l.match(/^MARK\|dungeon([A-Za-z]+)\|rc=\d+\|mc=(\d+)$/);
    if (!m) continue;
    if (m[1] === 'L') { cur = {}; famRows.push(cur); }
    if (!cur) continue;
    cur[m[1]!] = Number(m[2]);
  }
  const envOf = (): Record<string, string> => ((globalThis as unknown as { __swProcessEnv?: Record<string, string> }).__swProcessEnv ?? (typeof process !== 'undefined' ? (process.env as unknown as Record<string, string>) : {}));
  console.log(`[i148] seats=${famRows.length} gate=${envOf().SW_I138_EARLY ?? 'off'}`);
  const names: Record<string, string> = {
    L: 'layout(L)', E: 'entrance', PD: 'plat&doors', Pi: 'EarlyDual', S: 'Spikes', D: 'Doors',
    W: 'WallVar', P: 'Platforms', C: 'BiomeChests', B: 'Bookshelves', G: 'BasicChests',
    I: 'Lights', T: 'Traps', F: 'Furniture', Pa: 'Paintings', Ba: 'Banners', Late: 'Late',
  };
  for (let s = 0; s < famRows.length && s < 2; s++) {
    const jr = famRows[s]!;
    const xr = X86[s]!;
    console.log(`[i148] == seat${s} ==`);
    let prevJ = 0;
    let prevX = 0;
    let totJ = 0;
    let totX = 0;
    for (let f = 0; f < FAMS.length; f++) {
      const fam = FAMS[f]!;
      const jv = jr[fam] ?? -1;
      const jn = f === 0 ? -1 : jv - prevJ;
      const xn = xr[f]! - prevX;
      prevJ = jv; prevX = xr[f]!;
      if (f >= 2) { totJ += Math.max(0, jn); totX += xn; }
      console.log(`[i148] ${fam.padEnd(4)} ${String(names[fam] ?? '').padEnd(12)} J=${String(jn).padStart(8)}  X=${String(xn).padStart(8)}  Δ=${String(jn - xn).padStart(8)}`);
    }
    console.log(`[i148] seat${s} PD→Late 净: J=${totJ} X=${totX} Δ=${totJ - totX}`);
  }
});
