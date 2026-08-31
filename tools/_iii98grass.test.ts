// IIII93 批（jagged rocks 记账族定罪）——Grass 段账目仪：
//   ①▶label 分桶样本计数（SW_I98_BUCKETS="Grass,JunglePass,IceBiome"）
//   ②Grass 段 dig/face 双区段 + 每 runner 边界记账（引擎 __swGBand 钩，见
//     WorldGen.ts ▶Grass 段与 SecretSeedDoEndsPass.doDigExtraHoles）。
// 语义约定：n=该 pass 内 InternalSample 序号（reseed 后清零——与 rig taglog ln
//   同口径，因为每 pass 头重播种子后主实例序号从 1 计）。
// 用法：cd game && SW_I98=1 SW_I98_SEED=771005 SW_I98_EVIL=0 \
//   SW_I98_FLAGS=digExtraHoles SW_I98_OUT=/tmp/iii98-out/js-ledger.json \
//   npx vitest run tools/_iii98grass.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = !!process.env.SW_I98;
const SEED = process.env.SW_I98_SEED ?? '771005';
const EVIL = Number(process.env.SW_I98_EVIL ?? 0);
const W = Number(process.env.SW_I98_W ?? 4200), H = Number(process.env.SW_I98_H ?? 1200);
const OUT = process.env.SW_I98_OUT ?? '/tmp/iii98-out/js-ledger.json';
const BUCKETS = new Set((process.env.SW_I98_BUCKETS ?? '').split(',').filter(Boolean));

(RUN ? it : it.skip)('IIIII93 Grass 段账目仪', async () => {
  console.log(`seed=${SEED} flags=${process.env.SW_I98_FLAGS ?? ''} buckets=${[...BUCKETS].join(',')}`);
  // ── 主实例滚动计数 + pass 头标签跟踪（每 pass 头 reseed ⇒ n 重置到该 pass 流位）──
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string | null => {
    let src = srcCache.get(file);
    if (!src) {
      try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; }
      srcCache.set(file, src);
    }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return null;
  };
  let curLabel = '(pre)';
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let mainInst: unknown = null;
  let n = 0;
  const bucketCounts: Record<string, number> = {};
  const marks: Array<{ t: string; k?: number; n: number }> = [];
  // 标签探测用的 inst 身份门（PassGeneration 全部走 ctx.rng 单实例；音频实例滤除）
  RNGp.reseed = function (this: unknown, s: number) {
    try {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii98grass')) {
          const lb = labelOf(m[1], Number(m[2]));
          if (lb !== null && lb !== '') curLabel = lb;
          break;
        }
      }
    } catch { /* noop */ }
    const r = oReseed.call(this, s);
    // 每次重播种子后重绑主实例（RNG.reseed 内部换新 UnifiedRandom）
    mainInst = null;
    return r;
  };
  (globalThis as { __swOnRoll?: (v?: number, inst?: object) => void }).__swOnRoll = (_v, inst) => {
    n++;
    if (mainInst === null && inst) mainInst = inst;
    if (BUCKETS.has(curLabel) && inst === mainInst) {
      bucketCounts[curLabel] = (bucketCounts[curLabel] ?? 0) + 1;
    }
  };
  (globalThis as { __swGBand?: (t: string, d?: unknown) => void }).__swGBand = (t, d) => {
    marks.push({ t, k: typeof d === 'number' ? d : undefined, n });
  };
  delete (globalThis as { __swGBandCount?: unknown }).__swGBandCount;
  const t0 = Date.now();
  const flags: Record<string, boolean> = {};
  for (const f of (process.env.SW_I98_FLAGS ?? '').split(',').filter(Boolean)) flags[f] = true;
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    seedFlags: Object.keys(flags).length > 0 ? flags : undefined,
  });
  console.log(`done ${(Date.now() - t0) / 1000}s lastLabel=${curLabel}`);
  // ── 汇总：phases + 每 runner 长度（seg_k=[r|k 的 n .. 下一个 mark 前夜]）──
  type Mark = { t: string; k?: number; n: number };
  const digStart = marks.find((m: Mark) => m.t === 'dig-start');
  const digEnd = marks.find((m: Mark) => m.t === 'dig-end');
  const faceStart = marks.find((m: Mark) => m.t === 'face-start');
  const faceEnd = marks.find((m: Mark) => m.t === 'face-end');
  const rs = marks.filter((m: Mark) => m.t === 'r');
  // runner k 的消费区间 = [r|k.n .. r|{k+1}.n)，末 runner 至 dig-end
  const runnerLens: number[] = rs.map((m: Mark, i: number) => {
    const nxt = i + 1 < rs.length ? rs[i + 1]! : null;
    const endN = nxt ? nxt.n : (digEnd ? digEnd.n : m.n);
    return endN - m.n;
  });
  const out = {
    seed: SEED, flags: process.env.SW_I98_FLAGS ?? '', w: W, h: H,
    lastLabel: curLabel,
    bucketCounts,
    phases: {
      digStartN: digStart?.n ?? null, digEndN: digEnd?.n ?? null,
      faceStartN: faceStart?.n ?? null, faceEndN: faceEnd?.n ?? null,
      digTotal: digStart && digEnd ? digEnd.n - digStart.n : null,
      faceTotal: faceStart && faceEnd ? faceEnd.n - faceStart.n : null,
      grassTotalAll: faceEnd && digStart ? faceEnd.n : null,
    },
    runners: { count: rs.length, lens: runnerLens },
    marksTail: marks.slice(-3),
  };
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`written ${OUT}`);
  console.log(`buckets=${JSON.stringify(bucketCounts)}`);
  console.log(`phases=${JSON.stringify(out.phases)}`);
  delete (globalThis as { __swOnRoll?: unknown }).__swOnRoll;
  delete (globalThis as { __swGBand?: unknown }).__swGBand;
  RNGp.reseed = oReseed;
}, 900_000);
