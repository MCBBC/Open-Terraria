// IIII67 一次性仪：CELEB 全管线 Micro_Biomes 段账（mbProbe/segProbe → 账本落盘）。
// 与 x86 /tmp/iii69-out/x86run/marks.txt 同构对拍。另存 __swMbCap 基座快照供单跑反演。
// 用法：cd game && SW_I69=1 SW_MB_1457=1 npx vitest run tools/_iii69mb.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I69 === '1';
const OUT = process.env.SW_I69_DIR ?? '/tmp/iii69-out';
const SEED = process.env.SW_M8_SEED ?? '1999040562';
const EVIL = Number(process.env.SW_M8_EVIL ?? 0) as -1 | 0 | 1;
const MB1457 = (process.env.SW_MB_1457 ?? '') === '1';

(RUN ? it : it.skip)('iii69 micro-biomes attempt ledger', async () => {
  mkdirSync(OUT, { recursive: true });
  const g = globalThis as unknown as Record<string, unknown>;
  interface Mark { c: number; n: string; d?: unknown }
  const segMarks: Mark[] = [];
  let count = 0;
  let mainInst: object | null = null;

  // 主实例绑定：每 pass 头 reseed 后 this.vanilla 即当轮主 UnifiedRandom
  const RNGp = RNG.prototype as unknown as Record<string, (...a: never[]) => void>;
  const oReseed = RNGp.reseed as unknown as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    oReseed.call(this, s);
    mainInst = (this as unknown as { vanilla?: object }).vanilla ?? mainInst;
  };
  g.__swOnRoll = (_v: number, inst: object): void => {
    if (mainInst !== null && inst === mainInst) count++;
  };
  g.__swMbDraws = () => count;
  { const tg = new Set(['63,559','74,589','1806,487','1807,487','1806,488','1807,488']);
    (g as unknown as { __swShimTargets?: Set<string> }).__swShimTargets = tg; }
  g.__swSeg = (n: string, d?: unknown): void => { segMarks.push({ c: count, n, d }); };

  // 微群系基座快照（单跑反演用）
  g.__swMbCap = (gs: unknown, _st: unknown, chests: unknown): void => {
    try {
      const gr = gs as { protectedRects?: unknown } & Record<string, unknown>;
      const base: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(gr)) {
        if (typeof v === 'function' || k === 'store' || v instanceof Uint16Array || v instanceof Uint8Array || v instanceof Int32Array) continue;
        if (v instanceof Array && (v as unknown[]).length > 40000) continue;
        base[k] = v;
      }
      writeFileSync(`${OUT}/js-mb-base.json`, JSON.stringify({ mb1457: MB1457, genState: base, chests }, null, 1));
    } catch (e) { console.log('mbcap fail', e); }
    g.__swMbCap = undefined;
  };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: EVIL,
      seedFlags: { tenthAnniversary: true },
      ...(MB1457 ? {} : {}),
    });
  } finally {
    delete g.__swOnRoll;
    delete g.__swMbDraws;
    delete g.__swSeg;
    delete g.__swMbCap;
  }

  // 只落微群系窗口：首个 passStart 起，至 lavaJ 序列结束（下一 pass 的首 seg 无则截断于文件尾）
  let startIdx = segMarks.findIndex((m) => m.n === 'passStart');
  const lines: string[] = [];
  if (startIdx < 0) startIdx = 0;
  for (let i = startIdx; i < segMarks.length; i++) {
    const m = segMarks[i]!;
    lines.push(`${m.c}\t${m.n}${m.d !== undefined ? `\t${JSON.stringify(m.d)}` : ''}`);
  }
  writeFileSync(`${OUT}/js-mb-marks.txt`, lines.join('\n') + '\n');
  console.log(`[i69] marks=${lines.length} totalDraws=${count} windowStart=${startIdx}`);
}, 900_000);
