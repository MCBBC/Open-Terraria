// IIII167 批掷流+动作流探针（克隆 _iii66rolls 范式，waterpark 链 #53 Smooth World 域）：
//   R|<ln>|<v>   掷值行（RNG __swOnRoll 观察点）
//   A|<ln>|<fn>|<x>|<y>|<e>  动作行（swAct 织入：S=坡 P=半砖 K=杀 T=补 B=踩）
//   Q|<ln>|<x>|<y>           SQ 级联行（squareTileFrame）
// 分段：---START 52（slot12 末）… ---PASS 53（slot13 末）＝Smooth World 掷流段。
// 用法：SW_I167_ROLLS=1 npx vitest run tools/_iii167rolls.test.ts
import { it } from 'vitest';
import { writeFileSync, appendFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_I167_ROLLS === '1';
/** SW_I167_STACKS=1：每掷附最近 3 帧（src 域过滤）——与 rig SW_TAGLOG 帧序列对位 */
const STACKS = process.env.SW_I167_STACKS === '1';
const SEED = process.env.SW_I167_SEED ?? 'waterpark|20260905';
const EVIL = Number(process.env.SW_I167_EVIL ?? 0);
const OUT = process.env.SW_I167_ROLLS_OUT ?? '/tmp/iii167-out/jsrolls-wpk.txt';
const ABORT_SLOT = Number(process.env.SW_I167_ABORT_SLOT ?? 13);
const G2D = process.env.SW_I167_G2 ?? `${process.env.HOME ?? ''}/GoldenChains/golden-waterpark`;

const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I167_FLAGS ?? '').split(',').filter(Boolean)) {
  M8_FLAGS[f] = true;
}
const SLOT_IDX = new Map<number, number>([[12, 52], [13, 53]]);
const DUMPNAME = new Map<number, string>();

(RUN ? it : it.skip)('III167 waterpark roll+action stream capture', async () => {
  for (const f of readdirSync(G2D)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  mkdirSync('/tmp/iii167-out', { recursive: true });
  const lines: string[] = [];
  let rec = false;
  let ln = 0;
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  (globalThis as unknown as { __swSWAct?: (f: string, x: number, y: number, e: number) => void }).__swSWAct =
    (f: string, x: number, y: number, e: number) => {
      if (!rec || lines.length > 60_000_000) return;
      lines.push(`A|${ln}|${f}|${x}|${y}|${e}`);
    };
  (globalThis as unknown as { __swFntSq?: (x: number, y: number) => void }).__swFntSq =
    (x: number, y: number): void => {
      if (!rec || lines.length > 60_000_000) return;
      lines.push(`Q|${ln}|${x}|${y}`);
    };
  g.__swOnRoll = (v: number, inst: object) => {
    if (!rec || lines.length > 60_000_000) return;
    ln++;
    if (STACKS && ln <= 6000) {
      const save = Error.stackTraceLimit;
      Error.stackTraceLimit = 10;
      const st = new Error().stack ?? '';
      Error.stackTraceLimit = save;
      const fr = st.split('\n').slice(2)
        .map((s) => s.trim())
        .filter((s) => !/rng\.ts|core\/|node_modules|vitest/.test(s))
        .map((s) => s.replace(/^at /, '').replace(/ \/Users[^ ]*game\//, ' ').replace(/\?.*$/, '').slice(0, 80))
        .slice(0, 3);
      lines.push(`R|${ln}|${v}|${fr.join('|')}`);
    } else {
      lines.push(`R|${ln}|${v}`);
    }
    if (ln % 65536 === 0) process.stderr.write(`[rolls] ${ln}\n`);
  };
  class AbortOK extends Error {}
  try {
    await generateWorld({
      width: 4200, height: 1200,
      seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
      onWorldPartial: (_w, i, _pn) => {
        if (i === ABORT_SLOT) {
          if (rec) lines.push(`---PASS 53 ${DUMPNAME.get(53) ?? 'Smooth_World'}`);
          throw new AbortOK(`rolls-abort-${i}`);
        }
        const d = SLOT_IDX.get(i);
        if (d === undefined) return;
        if (!rec && d >= 52) { rec = true; lines.push(`---START ${d}`); }
        else if (rec) { lines.push(`---PASS ${d} ${DUMPNAME.get(d) ?? '?'}`); }
      },
    });
  } catch (e) {
    if (!(e instanceof AbortOK)) throw e;
  }
  g.__swOnRoll = undefined;
  (globalThis as { __swSWAct?: unknown }).__swSWAct = undefined;
  rmSync(OUT, { force: true });
  let buf: string[] = [];
  let fw = 0;
  const flush = (): void => {
    appendFileSync(OUT, buf.join('\n') + '\n');
    fw += buf.length;
    buf = [];
  };
  for (const l of lines) { buf.push(l); if (buf.length >= 1_000_000) flush(); }
  if (buf.length) flush();
  console.log(`rolllog written ${fw} lines -> ${OUT}`);
}, 900_000);
