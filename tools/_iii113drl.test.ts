// IIII99b2 批一次性诊断：DualDungeonLayoutProvider 段界记账对拍仪（δ 先行）。
// x86 侧：i98b2→rrrr 认证树 + DR|S|/DR|HC| DRL 钩（run-ddp-r5，SW_MARKLOG=dr-mark.log）。
//   JS 侧：cap-ddual 基座（_iii99seg 同 hydrate）+ DungeonDualLayout.ts __swI113 镜像钩。
// 输出：两侧行级 diff（首分歧行定位）＋分座段界账本。JS 行存 SW_I113_OUT。
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

(RUN ? it : it.skip)('DR segment ledger js-side capture + pairwise diff vs x86', () => {
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

  // —— 分座对拍：把每行尾 |rc=N 换成段间增量 Δ（首行置 *），mr 剥离 ——
  const normalizeSeatRows = (raw: string[]) => {
    const rows = raw.map((l) => l.replace(/^(MARK.)?/, ""));
    const seatOf = (l: string) => l.split("|")[2]?.replace(/^i/, "") ?? "";
    const out = new Map<string, { txt: string; n: number }[]>();
    for (const l0 of rows) {
      let l = l0;
      // 剥离 Snaplog 追加的重复尾巴：形如 “...|rc=A|rc=A” 且两个数值相同
      const m = l.match(/^(.*\\|rc=(\\d+))\\|rc=\\2$/);
      if (m) l = m[1]!;
      // 剥 mr
      l = l.replace(/\\|mr=-?\\d+/, "");
      const seat = seatOf(l);
      const nm = l.match(/(^|[ |])rc=(\\d+)$/);
      const n = nm ? Number(nm[2]) : NaN;
      const keyTxt = l.replace(/(^|[ |])rc=-?\\d+$/, "$1rc=@");
      if (!out.has(seat)) out.set(seat, []);
      out.get(seat)!.push({ txt: keyTxt, n });
    }
    return out;
  };
  const fmt = (list: { txt: string; n: number }[]) => {
    let prev = NaN;
    return list.map((e) => {
      const d = Number.isNaN(e.n) || Number.isNaN(prev) ? "*" : e.n - prev;
      prev = e.n;
      return e.txt.replace("rc=@", `rc=${d === "*" ? "*" : d}`);
    });
  };
  const xtAll = readFileSync(X86, "utf8").split("\n").filter((l) => l.startsWith("MARK|DR|")).map((l) => l.slice(5))
    .filter((l) => !l.startsWith("DR|S|MD"));
  const jsm = normalizeSeatRows(lines);
  const xsm = normalizeSeatRows(xtAll);
  console.log(`[i113] x86 rows=${xtAll.length} js rows=${lines.length} mainSample=${rollN} totalSample=${totalN}`);
  const XJ = fmt(xsm.get("1") ?? []);
  const JJ = fmt(jsm.get("1") ?? []);
  void XJ; void JJ;
  for (const [k, xr0] of [...xsm.entries()].sort()) {
    const xr = fmt(xr0);
    const jr = fmt(jsm.get(k) ?? []);
    let first = -1;
    const nn = Math.min(xr.length, jr.length);
    for (let i = 0; i < nn; i++) if (xr[i] !== jr[i]) { first = i; break; }
    const eqAll = first < 0 && xr.length === jr.length;
    console.log(eqAll
      ? `[i113] seat i${k}: ALL-EQUAL (${xr.length} rows)`
      : `[i113] seat i${k}: FIRST-DIFF @#${first}/${nn} lenX=${xr.length} lenJ=${jr.length}`);
    for (let q = Math.max(0, first - 2); !eqAll && q < Math.min(first + 5, nn, xr.length, jr.length); q++) {
      console.log(`   [${q}] X ${xr[q]}\n   [${q}] J ${jr[q]}${xr[q] === jr[q] ? "" : "   <<<"}`);
    }
  }
});
