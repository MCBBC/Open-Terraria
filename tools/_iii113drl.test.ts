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

  // —— x86 侧解析 + 两两对比（归一化：去 SW_MARKRC 追加的重复 |rc=、mr 与 JS 无可比面）——
  const normX86 = (l: string): string =>
    l.replace(/(?:\|rc=\d+){2}$/, (m) => m.slice(0, m.indexOf('|', 1)))
      .replace(/\|mr=-?\d+\|/, '|');
  const xtRaw = readFileSync(X86, 'utf8').split('\n').filter((l) => l.startsWith('MARK|DR|')).map((l) => normX86(l.slice(5)))
    .filter((l) => !l.startsWith('DR|S|MD'));   // MakeDungeon 头探针：JS 侧无同位钩，剔除
  // JS 侧同样剥掉 |mr= 使可比键一致（JS 双计数恒等）
  const xt = xtRaw.map((l) => l.replace(/\|mr=\d+\|/, '|'));
  const jsNorm = lines.map((l) => l.replace(/\|mr=\d+\|/, '|'));
  console.log(`[i113] x86 lines=${xt.length} js lines=${lines.length} mainSample=${rollN} totalSample=${totalN}`);
  let first = -1;
  const n = Math.min(xt.length, lines.length);
  for (let i = 0; i < n; i++) {
    if (xt[i] !== jsNorm[i]) { first = i; break; }
  }
  const ctx2 = Math.max(0, first - 3);
  if (first >= 0) {
    console.log(`[i113] FIRST-DIVERGENCE @#${first}:`);
    for (let k = ctx2; k < Math.min(first + 4, n, xt.length, lines.length); k++) {
      console.log(`  [${k}] X86 ${xt[k]}\n  [${k}] JS  ${lines[k]}${xt[k] === lines[k] ? '' : '   <<<'}`);
    }
  } else {
    console.log(`[i113] ALL-EQUAL (${n}/${xt.length}|${lines.length})`);
  }
  // 座别分段小计
  const summarize = (rows: string[]) => {
    const perSeat = new Map<string, { segs: string[]; nHC: number }>();
    for (const l of rows) {
      const m = l.match(/^DR\|[SH]C\|i(\d+)\|([A-Z]+)/);
      if (!m) continue;
      const key = m[1]!;
      const e = perSeat.get(key) ?? { segs: [], nHC: 0 };
      if (m[2] !== 'CTOR') e.segs.push(m[2]);
      if (l.includes('src=')) e.nHC++;
      perSeat.set(key, e);
    }
    for (const [k, v] of [...perSeat.entries()].sort()) {
      console.log(`[i113] seat i${k}: HCcalls=${v.nHC} segs=${v.segs.filter((x) => !['INL'].includes(x)).join(',')}`);
    }
  };
  summarize(xt);
  summarize(lines);
});
