// IIII174 批 waterpark #53 尘段排布对拍探针：pass53 loop1 掷窗内逐掷归格（scan cell）
//   W|<ln>|<v>|<i>|<j>|<srcline>   掷行（RNG __swOnRoll 织入 + __swSWCell 当前格）
//   A|Q 行同 _iii167rolls（S/P/K/T + SQ 级联）
// 窗口 SW_I174_WIN="a:b"（段内掷序,1-based）；STACKS=1 时附 HalfBrickPass 源行号。
// 用法：SW_I174_ROLLS=1 SW_I174_WIN=237000:239500 npx vitest run tools/_iii174wpk.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I174_ROLLS === '1';
const STACKS = process.env.SW_I174_STACKS === '1';
const SEED = process.env.SW_I174_SEED ?? 'waterpark|20260905';
const EVIL = Number(process.env.SW_I174_EVIL ?? 0);
const OUT = process.env.SW_I174_OUT ?? '/tmp/iii174-out/js-wpk-win.txt';
const [WINA, WINB] = (process.env.SW_I174_WIN ?? '237000:239500').split(':').map(Number);
const ABORT_SLOT = Number(process.env.SW_I174_ABORT_SLOT ?? 13);
const G2D = process.env.SW_I174_G2 ?? `${process.env.HOME ?? ''}/GoldenChains/golden-waterpark`;

const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I174_FLAGS ?? '').split(',').filter(Boolean)) M8_FLAGS[f] = true;

(RUN ? it : it.skip)('III174 waterpark loop1 roll-window cell attribution', async () => {
  mkdirSync('/tmp/iii174-out', { recursive: true });
  const lines: string[] = [];
  let rec = false;
  let ln = 0;
  let ci = -1;
  let cj = -1;
  const g = globalThis as Record<string, unknown>;
  g.__swSWCell = (x: number, y: number): void => {
    if (!rec) return;
    ci = x;
    cj = y;
  };
  g.__swSWAct = (f: string, x: number, y: number, e: number): void => {
    if (!rec) return;
    lines.push(`A|${ln}|${f}|${x}|${y}|${e}`);
  };
  g.__swFntSq = (x: number, y: number): void => {
    if (!rec) return;
    lines.push(`Q|${ln}|${x}|${y}`);
  };
  g.__swOnRoll = (v: number, _inst: object): void => {
    if (!rec) return;
    ln++;
    if (ln < WINA || ln > WINB) return;
    let src = '';
    if (STACKS) {
      const save = Error.stackTraceLimit;
      Error.stackTraceLimit = 12;
      const st = new Error().stack ?? '';
      Error.stackTraceLimit = save;
      const fr = st.split('\n').map((s) => s.trim())
        .find((s) => /HalfBrickPass\.ts:\d+/.test(s));
      src = fr ? (fr.match(/HalfBrickPass\.ts:(\d+):\d+/)?.[1] ?? '?') : '?';
    }
    lines.push(`W|${ln}|${v}|${ci}|${cj}|${src}`);
    if (ln % 65536 === 0) process.stderr.write(`[i174] ${ln}\n`);
  };
  class AbortOK extends Error {}
  try {
    await generateWorld({
      width: 4200, height: 1200,
      seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
      onWorldPartial: (_w, i, _pn) => {
        if (i === ABORT_SLOT) {
          if (rec) lines.push('---PASS 53');
          throw new AbortOK(`rolls-abort-${i}`);
        }
        if (i === 12) { rec = true; lines.push('---START 53'); }
      },
    });
  } catch (e) {
    if (!(e instanceof AbortOK)) throw e;
  }
  g.__swOnRoll = undefined;
  g.__swSWCell = undefined;
  g.__swSWAct = undefined;
  g.__swFntSq = undefined;
  writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`i174 window log ${lines.length} lines -> ${OUT}`);
}, 900_000);
