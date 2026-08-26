// TTTTTTT 批一次性探针③：二次沉降（槽 50 ≡ x86 pass idx 98）掷流值序列导出。
// 钩 UnifiedRandom.prototype.internalSample 记录原始样本值，窗口=onWorldPartial(49)
// 之后到(50)为止；与 rig SW_ROLLWIN=98-98 输出逐行对拍（首差索引+值）。
// 用法：cd game && SW_T3=1 SW_T3_CHAIN=g npx vitest run tools/_ttt3.test.ts
import { it } from 'vitest';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_T3 === '1';
const CHAIN = process.env.SW_T3_CHAIN ?? 'g';
const CFGS: Record<string, { seed: string; evil: number; flags?: Record<string, boolean> }> = {
  g: { seed: '9293480', evil: 0 },
  s22222: { seed: '22222', evil: 1 },
  ntb: { seed: '1372357239', evil: 0, flags: { notTheBees: true } },
  notraps: { seed: '1896728457', evil: 1, flags: { noTraps: true } },
  12345: { seed: '12345', evil: 1 },
  const: { seed: '1321365005', evil: 0, flags: { theConstant: true } },
};
const cfg = CFGS[CHAIN]!;
(RUN ? it : it.skip)('TTT③ settle2 roll-stream export + compare', async () => {
  const URp = UnifiedRandom.prototype as unknown as Record<string, (...a: unknown[]) => number>;
  const oIS = URp.internalSample;
  const vals: number[] = [];
  let cap = false;
  URp.internalSample = function (this: unknown) {
    const v = oIS.call(this);
    if (cap) vals.push(v);
    return v;
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: cfg.seed, evil: cfg.evil as -1 | 0 | 1,
      seedFlags: cfg.flags,
      onWorldPartial: (_w, i) => {
        if (i === 49) cap = true;
        if (i === 50 && cap) {
          cap = false;
          console.log(`[slot50 rolls] ${vals.length}`);
        }
      },
    });
  } finally { URp.internalSample = oIS; }
  writeFileSync(`/tmp/ttt-out/jsroll-${CHAIN}.txt`, `${vals.join('\n')}\n`);
  console.log(`[written] /tmp/ttt-out/jsroll-${CHAIN}.txt (${vals.length} values)`);
  // 若已有 rig 窗口产物则直接对拍
  const rigPath = `/tmp/ttt-out/rollwin-${CHAIN}.txt`;
  if (!existsSync(rigPath)) { console.log('[rig] window file missing, export only'); return; }
  const raw = readFileSync(rigPath, 'utf8').split('\n');
  // 取 START 与首个 PASS/END 标记之间的行
  let seg: string[] = [];
  let started = false;
  for (const l of raw) {
    if (l.startsWith('---START')) { started = true; continue; }
    if (l.startsWith('---')) break;
    if (started && l.length > 0) seg.push(l);
  }
  // 剔除非主流线（xtra-stack 追加段记录 LINE n）
  const xsPath = '/tmp/sss-out/xtra-stack.txt';
  const nonMain = new Set<number>();
  if (existsSync(xsPath)) {
    const xs = readFileSync(xsPath, 'utf8').split('\n');
    for (const l of xs) {
      const m = l.match(/^LINE (\d+) VAL -?\d+$/);
      if (m) nonMain.add(Number(m[1]));
    }
  }
  const mainVals: number[] = [];
  for (let i = 0; i < seg.length; i++) if (!nonMain.has(i + 1)) mainVals.push(Number(seg[i]));
  console.log(`[rig] window lines=${seg.length} main-only=${mainVals.length} js=${vals.length}`);
  const n = Math.min(mainVals.length, vals.length);
  let first = -1;
  for (let i = 0; i < n; i++) {
    if (mainVals[i] !== vals[i]) { first = i; break; }
  }
  console.log(`[first-divergence] ${first < 0 ? (mainVals.length === vals.length ? 'NONE（逐位全等）' : `长度差 rig=${mainVals.length} js=${vals.length}`) : `idx=${first} rig=${mainVals[first]} js=${vals[idxGuard(vals, first)]}`}`);
  if (first >= 0) {
    console.log(`[ctx] ${JSON.stringify({ rigBefore: mainVals.slice(Math.max(0, first - 4), first), jsBefore: vals.slice(Math.max(0, first - 4), first), rigAt: mainVals.slice(first, first + 6), jsAt: vals.slice(first, first + 6) })}`);
  }
}, 900_000);
function idxGuard(a: number[], i: number): number { return Math.min(i, a.length - 1); }
