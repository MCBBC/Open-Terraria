// IIII68 一次性仪：DRUNK GroundFurniture(dg_fC/dg_fR) 对账仪 —— 镜像 rig /tmp/iii68-out/rig
// 的 dg_fs/dg_fc/dg_fw/dg_fz/dg_ff 细粒度 marks（DungeonPass.ts 内 __swDgFx 门控）。
// 附带：非主实例骰计数（span 污染探针）+ 主实例值流窗口（d61layoutStart..dungeonLate）。
// 用法：cd game && SW_I68FX=1 npx vitest run tools/_iii68fx.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I68FX === '1';
const SEED = process.env.SW_M8_SEED ?? '51620200';
const OUTDIR = process.env.SW_I68_DIR ?? '/tmp/iii68-out';

(RUN ? it : it.skip)('iii68 furniture trace', async () => {
  const g = globalThis as unknown as { __wvLines?: string[]; __swWvLog?: unknown; __swDgFx?: boolean };
  g.__wvLines = [];
  g.__swWvLog = `${OUTDIR}/wv-js.tmp`;
  g.__swDgFx = true;
  let phase: 'pre' | 'open' | 'closed' = 'pre';
  let mainInst: object | null = null;
  const arr: number[] = [];
  const foreign: number[] = [];          // 非 main 实例在 open 相位的 draw 数（按主骰索引记录事件）
  const foreignEvents: Array<[number, string]> = [];
  const marks: Array<[string, number]> = [];
  let scanLen = 0;

  const RNGp = RNG.prototype as unknown as Record<string, (...a: never[]) => void>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    oReseed.call(this, s);
    const van = (this as unknown as { vanilla?: object }).vanilla;
    if (van) mainInst = van;
  };

  let cbCount = 0;
  (globalThis as unknown as { __swOnRoll?: (value: number, inst: object) => void }).__swOnRoll =
    (value: number, inst: object) => {
      cbCount++;
      const L = g.__wvLines!;
      while (scanLen < L.length) {
        const ln = L[scanLen++];
        if (!ln.startsWith('MARK|')) continue;
        const tag = ln.slice(5);
        if (phase === 'open') {
          marks.push([tag, arr.length]);
          foreignEvents.push([arr.length, `MARK ${tag} pendingForeign=${foreign.length}`]);
        }
        if (tag.startsWith('d61layoutStart')) { if (phase === 'pre') { phase = 'open'; console.log('[i68fx] OPEN seen cbIdx=' + cbCount); } }
        else if (tag.startsWith('dungeonLate') && phase === 'open') { phase = 'closed'; console.log('[i68fx] CLOSED cbIdx=' + cbCount); break; }
      }
      if (phase !== 'open') return;
      if (mainInst !== null && inst !== mainInst) {
        foreign.push(arr.length);
        if (foreign.length < 4000) foreignEvents.push([arr.length, 'FOREIGN']);
        return;
      }
      arr.push(value >>> 0);
    };

  try {
    await generateWorld({ width: 4200, height: 1200, seedText: SEED, evil: -1, seedFlags: { drunkWorld: true } });
  } finally {
    delete (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll;
    g.__swDgFx = false;
  }
  console.log(`[i68fx] len=${arr.length} cb=${cbCount} lines=${g.__wvLines?.length} scanLen=${scanLen} mainBound=${mainInst ? 'y' : 'n'} closedPhase=${phase} foreignDraws=${foreign.length}`);
  if (g.__wvLines && g.__wvLines.length) console.log(`[i68fx] first3=${JSON.stringify(g.__wvLines.slice(0, 3))} last1=${g.__wvLines[g.__wvLines.length - 1]}`);
  writeFileSync(`${OUTDIR}/js-trace.txt`, marks.map(([m, n]) => `${m} @${n}`).join('\n') + '\n');
  writeFileSync(`${OUTDIR}/js-rolls68.txt`, arr.join('\n') + '\n');
  writeFileSync(`${OUTDIR}/js-foreign.txt`, foreignEvents.map(([m, s]) => `@${m} ${s}`).join('\n') + '\n');
}, 900_000);
