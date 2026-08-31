// IIII99b2 批一次性诊断：DualDungeonLayoutProvider 段界记账对拍仪（δ 先行）。
// x86 侧：rrrr 认证树 + DR|S|/DR|HC| DRL 钩（run-ddp-r5.sh，SW_SNAPLOG=dr-mark.log）。
//   JS 侧：cap-ddual 基座（_iii99seg 同 hydrate）+ DungeonDualLayout.ts __swI113 镜像钩。
// 对拍口径：每行尾 rc=N → 段间增量 Δ（首行置 *）；mr 剥离；Snaplog 重复尾巴剥离。
// 用法：cd game && SW_I113=1 SW_I89_OUT=/tmp/iii99-out/cap-ddual \
//   SW_I113_X86=/tmp/iii113-out/rig-ddp-r5/dr-mark.log npx vitest run tools/_iii113drl.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_I113 === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii99-out/cap-ddual';
const X86 = process.env.SW_I113_X86 ?? '/tmp/iii113-out/rig-ddp-r5/dr-mark.log';
const JOUT = process.env.SW_I113_OUT ?? '/tmp/iii113-out/js-dr-ledger.txt';

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

(RUN ? it : it.skip)('DR segment ledger js-side capture + per-seat delta diff vs x86', () => {
  if (!existsSync(X86)) throw new Error(`x86 dr-mark log missing: ${X86}`);
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

  // —— 挂载镜像接收器与主实例掷计数（x86 SW_MAINROLL=1 同口径：首样本锁 MainInst）——
  const lines: string[] = [];
  const g = globalThis as unknown as { __swI113?: (l: string) => void; __swOnRoll?: (v: number, inst: object) => void; __swRollN?: number; __swRollTotal?: number };
  g.__swI113 = (l) => lines.push(l);
  let rollN = 0;
  let totalN = 0;
  let mainInst: object | undefined;
  g.__swRollN = 0;
  g.__swRollTotal = 0;
  g.__swOnRoll = (_v, inst) => {
    totalN++;
    g.__swRollTotal = totalN;
    if (mainInst === undefined) mainInst = inst;
    else if (inst !== mainInst) return;
    rollN++;
    g.__swRollN = rollN;
  };

  runDungeonPass(st0, new RNG(gsRaw.seed), gsRaw as never, []);
  delete g.__swI113;

  writeFileSync(JOUT, lines.join('\n') + '\n');

  // —— 归一化 ——
  // x86 行：MARK| 前缀去除；Snaplog 追加尾 |rc=N（若同行已含另一相同 rc=N）剥除；mr 剥离。
  const stripDupRc = (l: string): string => {
    const m = l.match(/^(.*[| ]rc=(\d+))\|rc=\2$/);
    return m ? m[1]! : l;
  };
  const normRow = (l: string): string =>
    stripDupRc(l.replace(/\|mr=-?\d+/g, '')).replace(/(^|[| ])rc=-?\d+$/, '$1rc=@');

  const seatOf = (l: string): string => l.split('|')[2]?.replace(/^i/, '') ?? '';
  const groupDeltas = (rawRows: string[]): Map<string, string[]> => {
    const out = new Map<string, string[]>();
    let prev = NaN;
    for (const l of rawRows) {
      const seat = seatOf(l);
      if (!out.has(seat)) { out.set(seat, []); prev = NaN; }
      const nMatch = l.match(/rc=(-?\d+)$/);
      const n = nMatch ? Number(nMatch[1]) : NaN;
      const d = Number.isNaN(n) || Number.isNaN(prev) ? '*' : String(n - prev);
      prev = n;
      out.get(seat)!.push(normRow(l).replace('rc=@', `rc=${d}`));
    }
    return out;
  };

  const xtAll = readFileSync(X86, 'utf8').split('\n').filter((l) => l.startsWith('MARK|DR|')).map((l) => l.slice(5))
    .filter((l) => !l.startsWith('DR|S|MD'))   // MakeDungeon 头探针：JS 无同位钩，剔除
    .map((l) => l.replace(/^(DR\|(?:R|Ro|CP))\|i(\d+)\|/, (_, tag, n) => `${tag}|i${Number(n) + 1}|`)); // R/Ro/CP 用 CurrentDungeon(0基)，统一到 drlInst(1基)

  console.log(`[i113] x86 rows=${xtAll.length} js rows=${lines.length} mainSample=${rollN} totalSample=${totalN}`);

  const segOnly = (rows: string[]) => rows.filter((l) => !/^DR\|R(o)?\|/.test(l));
  const attOnly = (rows: string[]) => rows.filter((l) => /^DR\|R(o)?\|/.test(l));

  const diffPair = (label: string, xr0: string[], jr0: string[]) => {
    let first = -1;
    const nn = Math.min(xr0.length, jr0.length);
    for (let i = 0; i < nn; i++) if (xr0[i] !== jr0[i]) { first = i; break; }
    const eqAll = first < 0 && xr0.length === jr0.length;
    console.log(eqAll
      ? `[i113] ${label}: ALL-EQUAL (${xr0.length} rows)`
      : `[i113] ${label}: FIRST-DIFF @#${first}/${nn} lenX=${xr0.length} lenJ=${jr0.length}`);
    for (let q = Math.max(0, first - 2); !eqAll && q < Math.min(first + 6, nn, xr0.length, jr0.length); q++) {
      console.log(`   [${q}] X ${xr0[q]}\n   [${q}] J ${jr0[q]}${xr0[q] === jr0[q] ? '' : '   <<<'}`);
    }
  };

  // —— 全座分段流（去掉绝对 rc 基差：把每行 rc 值替换为 Δ）——
  const withDeltas = (rows: string[]): string[] => {
    let prev = NaN;
    return rows.map((l0) => {
      const l = stripDupRc(l0).replace(/\|mr=-?\d+/g, '');
      const nMatch = l.match(/rc=(-?\d+)$/);
      const n = nMatch ? Number(nMatch[1]) : NaN;
      const d = Number.isNaN(n) || Number.isNaN(prev) ? '*' : String(n - prev);
      prev = n;
      return l.replace(/(^|[| ])rc=-?\d+$/, `$1rc=${d}`);
    });
  };
  for (const want of ['SEG', 'ATT'] as const) {
    const xf = want === 'SEG' ? segOnly(xtAll) : attOnly(xtAll);
    const jf = want === 'SEG' ? segOnly(lines) : attOnly(lines);
    diffPair(`${want}`, withDeltas(xf), withDeltas(jf), false);
  }
});
