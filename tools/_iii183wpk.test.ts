// IIII183 批 waterpark #53 门级对拍（x86 JJHook.HtCell/HtRoll 同构）：
//   SV|<ln>|<i>|<j>|<31 字段>   loop A 逐格状态向量（x86 "SV ln|i|j|fields" 同格式）
//   HT|<ln>|<i>|<j>|<tag>|<v>   门掷标签（tag∈A26/B37/T62/T62b/T77/T77b/FILL1/FILL2/HANG）
//   W|<ln>|<v>|<i>|<j>          带内逐掷值（掷归格）
// 带 SW_I183_BAND=lo-hi（列带,须与 x86 SW_HTBAND 一致）；窗口槽 12 起（=x86 pass52 头）。
// 用法：SW_I183=1 npx vitest run tools/_iii183wpk.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I183 === '1';
const SEED = process.env.SW_I183_SEED ?? 'waterpark|20260905';
const EVIL = Number(process.env.SW_I183_EVIL ?? 0);
const OUT = process.env.SW_I183_OUT ?? '/tmp/iii183-out/js-ht183.txt';
const [BLO, BHI] = (process.env.SW_I183_BAND ?? '3589-3611').split('-').map(Number);
const ABORT_SLOT = Number(process.env.SW_I183_ABORT_SLOT ?? 13);
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I183_FLAGS ?? 'extraLiquid').split(',').filter(Boolean)) FLAGS[f] = true;

(RUN ? it : it.skip)('III183 waterpark #53 gate-probe JS side', async () => {
  mkdirSync('/tmp/iii183-out', { recursive: true });
  const lines: string[] = [];
  let rec = false;
  let ln = 0;
  let ci = -1;
  let cj = -1;
  const g = globalThis as Record<string, unknown>;
  const inBand = (): boolean => ci >= BLO && ci <= BHI;
  g.__swSWCell = (x: number, y: number): void => {
    if (!rec) return;
    ci = x;
    cj = y;
  };
  // ★IIIII183：状态向量（HalfBrickPass swStateVec183 构建,x86 HtCell 同格式）
  g.__swSV183 = (x: number, y: number, sv: string): void => {
    if (!rec || !inBand()) return;
    lines.push(`SV|${ln}|${x}|${y}|${sv}`);
  };
  // ★IIIII183：门掷标签
  g.__swRoll183 = (x: number, y: number, tag: string, v: number): void => {
    if (!rec || !inBand()) return;
    lines.push(`HT|${ln}|${x}|${y}|${tag}|${v}`);
  };
  g.__swOnRoll = (v: number, _inst: object): void => {
    if (!rec) return;
    ln++;
    if (inBand()) lines.push(`W|${ln}|${v}|${ci}|${cj}`);
    if (ln % 65536 === 0) process.stderr.write(`[i183] ${ln}\n`);
  };
  class AbortOK extends Error {}
  try {
    await generateWorld({
      width: 4200, height: 1200,
      seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
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
  g.__swSV183 = undefined;
  g.__swRoll183 = undefined;
  writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`i183 gate log ${lines.length} lines -> ${OUT}`);
}, 900_000);
