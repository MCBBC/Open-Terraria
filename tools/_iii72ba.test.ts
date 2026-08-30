// IIII72 一次性仪：DRUNK 横幅受理面细化对账 + 离线重放实验室基座。
// 产出 /tmp/iii72-out/lab/{dump.bin,dump.json,rolls-ba.txt,marks.txt,ba-js.txt}
// 用法：cd game && SW_I72BA=1 npx vitest run tools/_iii72ba.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I72BA === '1';
const SEED = process.env.SW_M8_SEED ?? '51620200';
const OUTDIR = process.env.SW_I72_DIR ?? '/tmp/iii72-out';

(RUN ? it : it.skip)('iii72 banners gate trace', async () => {
  const g = globalThis as unknown as {
    __wvLines?: string[];
    __swOnRoll?: (value: number, inst: object) => void;
    __swDgLab?: { dump?: (ctx: unknown) => void };
  };
  const lines: string[] = [];
  g.__wvLines = lines;

  let mainInst: object | null = null;
  const arr: number[] = [];              // 主实例骰值流（全量）
  const marks: Array<[string, number]> = [];
  let scanLen = 0;
  let capturing = false;

  // RNG 主实例识别：reseed 时 vanilla 实例即主流
  const RNGp = (await import('../src/core/rng')).RNG.prototype as unknown as {
    reseed?: (this: unknown, s: number) => void;
  };
  const oReseed = RNGp.reseed!;
  RNGp.reseed = function (this: unknown, s: number) {
    oReseed.call(this, s);
    const inner = (this as unknown as { vanilla?: object }).vanilla;
    if (inner) mainInst = inner;
    else mainInst = this as unknown as object;
  };

  g.__swOnRoll = (value: number, inst: object) => {
    while (scanLen < lines.length) {
      const ln = lines[scanLen++]!;
      if (!ln.startsWith('MARK|')) continue;
      marks.push([ln.slice(5), arr.length]);
      if (ln.includes('dg_ba0')) capturing = true;
      if (ln.includes('dg_baDone')) {
        marks.push(['__windowEnd__', arr.length]);
        capturing = false;
      }
    }
    if (!capturing || (mainInst !== null && inst !== mainInst)) return;
    arr.push(value >>> 0);
  };

  // 实验室区域快照（Ba 相位起点真值）
  g.__swDgLab = {
    dump: (raw: unknown) => {
      type Bnd = { L: number; R: number; T: number; B: number };
      type DBx = { L: number; R: number; T: number; B: number; has: boolean };
      const ctx = raw as {
        st: {
          idx: (x: number, y: number) => number; w: number; h: number;
          flags: Uint8Array; type: Uint16Array; wall: Uint16Array;
          half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
          liquid: Uint8Array; liquidType: Uint8Array;
        };
        bounds: Bnd; pits: DBx[]; winBoxes: DBx[]; entExists: boolean;
        entBounds: DBx; wallVariants: number[]; bannerStyles: number[];
      };
      const { st, bounds, pits, winBoxes, entExists, entBounds, wallVariants, bannerStyles } = ctx;
      const M = 6;
      const x0 = Math.max(0, bounds.L - M), x1 = Math.min(st.w - 1, bounds.R - 1 + M);
      const y0 = Math.max(0, bounds.T - M), y1 = Math.min(st.h - 1, bounds.B - 1 + M);
      const Wd = x1 - x0 + 1, Ht = y1 - y0 + 1, n = Wd * Ht;
      const bufA = Buffer.alloc(n), bufT = Buffer.alloc(n * 2), bufW = Buffer.alloc(n * 2);
      const bufHf = Buffer.alloc(n), bufSl = Buffer.alloc(n), bufIa = Buffer.alloc(n), bufLq = Buffer.alloc(n);
      let k = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++, k++) {
          const i = st.idx(x, y);
          bufA[k] = st.flags[i]! & 1 ? 1 : 0;
          bufT[k * 2] = st.type[i]! & 255; bufT[k * 2 + 1] = (st.type[i]! >> 8) & 255;
          bufW[k * 2] = st.wall[i]! & 255; bufW[k * 2 + 1] = (st.wall[i]! >> 8) & 255;
          bufHf[k] = st.half[i]!; bufSl[k] = st.slope[i]!;
          bufIa[k] = (st.wire[i]! >> 5) & 1 ? 1 : 0;
          bufLq[k] = st.liquid[i]!;
        }
      }
      mkdirSync(`${OUTDIR}/lab`, { recursive: true });
      writeFileSync(`${OUTDIR}/lab/dump.bin`, Buffer.concat([bufA, bufT, bufW, bufHf, bufSl, bufIa, bufLq]));
      writeFileSync(`${OUTDIR}/lab/dump.json`, JSON.stringify({
        x0, x1, y0, y1, Wd, Ht,
        bounds: [bounds.L, bounds.R, bounds.T, bounds.B],
        pits: pits.map((p) => [p.L, p.R, p.T, p.B]),
        winBoxes: winBoxes.map((p) => [p.L, p.R, p.T, p.B]),
        entExists, entBounds: [entBounds.L, entBounds.R, entBounds.T, entBounds.B],
        wallVariants, bannerStyles,
      }));
    },
  };

  try {
    await generateWorld({ width: 4200, height: 1200, seedText: SEED, evil: -1, seedFlags: { drunkWorld: true } });
  } finally {
    delete g.__swOnRoll;
    delete g.__swDgLab;
    RNGp.reseed = oReseed;
    delete g.__wvLines;
  }
  mkdirSync(`${OUTDIR}/lab`, { recursive: true });
  writeFileSync(`${OUTDIR}/lab/rolls-ba.txt`, arr.join('\n') + '\n');
  writeFileSync(`${OUTDIR}/lab/marks.txt`, marks.map(([m, nn]) => `${nn} ${m}`).join('\n') + '\n');
  writeFileSync(`${OUTDIR}/ba-js-full.txt`, lines.join('\n') + '\n');
  const ba = lines.filter((l) => l.startsWith('MARK|dg_b'));
  writeFileSync(`${OUTDIR}/ba-js.txt`, ba.join('\n') + '\n');
  console.log(`[i72ba] total=${lines.length} ba=${ba.length} rolls=${arr.length} -> ${OUTDIR}`);
}, 900_000);
