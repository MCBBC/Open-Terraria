// IIII174 批 grvfix #59 房屋段逐骰对拍探针：掷流(R)+掷类标记(M)+阶段标记(S)+房事件(H)
//   +门(G)+房形(MR)+箱(C)+AgeGen(AG)。段=reseed(Buried Chests)→reseed(Surface Chests)
//   （行号启动时从盘上源码解析,抗并行车道位移）。行号 ln=段内掷序（对拍 x86 pass59）。
// 用法：SW_I174_GTRACE=1 npx vitest run tools/_iii174grv.test.ts
import { it } from 'vitest';
import { appendFileSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I174_GTRACE === '1';
const G2D = process.env.SW_I174_G2 ?? '/Users/vinlic/GoldenChains/golden-grvfix';
const SEED = process.env.SW_I174_SEED ?? 'nightofthelivingdead|20260903';
const EVIL = Number(process.env.SW_I174_EVIL ?? 0);
const OUT = process.env.SW_I174_TRACE_OUT ?? '/tmp/iii174-out/jstrace-grv174.txt';

const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I174_FLAGS ?? '').split(',').filter(Boolean)) M8_FLAGS[f] = true;

(RUN ? it : it.skip)('III174 grv house roll-class trace', async () => {
  void readFileSync(G2D + '/058_Statues.typ');
  // 段边界锚：从盘上源码解析 reseed 行号（抗并行车道位移）
  const src = readFileSync('src/world/gen/WorldGen.ts', 'utf8').split('\n');
  const findLine = (needle: string): number => {
    for (let i = 0; i < src.length; i++) if (src[i]!.includes(needle)) return i + 1;
    return -1;
  };
  const LN_BURIED = findLine("beginVan('Buried Chests')");
  const LN_SURFACE = findLine("beginVan('Surface Chests')");
  if (LN_BURIED < 0 || LN_SURFACE < 0) throw new Error(`reseed anchors not found: ${LN_BURIED}/${LN_SURFACE}`);
  console.log(`anchors: BuriedChests@${LN_BURIED} SurfaceChests@${LN_SURFACE}`);

  rmSync(OUT, { force: true });
  const buf: string[] = [];
  let flushN = 0;
  const flush = (): void => {
    if (buf.length) { appendFileSync(OUT, buf.join('\n') + '\n'); flushN += buf.length; buf.length = 0; }
  };
  let rec = false;
  let ln = 0;
  const g = globalThis as Record<string, unknown>;
  g.__swOnRoll = (v: number, _inst: object) => {
    if (!rec) return;
    ln++;
    (g as { __swRollN?: number }).__swRollN = ln;
    buf.push(`R|${ln}|${v}`);
    if (ln % 100000 === 0) flush();
  };
  g.__swHMark = (t: string) => { if (rec) buf.push(`M|${ln}|${t}`); };
  g.__swHouseMk = (n: string, s?: string | number, t?: string | number) => {
    if (rec) buf.push(`S|${ln}|${n}${s !== undefined ? '|' + s : ''}${t !== undefined ? '|' + t : ''}`);
  };
  g.__swChestEv = (p: string, i: number, j: number, x?: number) => { if (rec) buf.push(`C|${ln}|${p}|${i}|${j}|${x ?? -1}`); };
  g.__swAbGate = (tag: string, i: number, j: number, extra?: number) => { if (rec) buf.push(`G|${ln}|${tag}|${i}|${j}|${extra ?? -1}`); };
  g.__swHouseEv = (phase: string, x: number, y: number) => { if (rec) buf.push(`H|${ln}|${phase}|${x}|${y}`); };
  g.__swHouseRooms = (ox: number, oy: number, rooms: string) => { if (rec) buf.push(`MR|${ln}|${ox}|${oy}|${rooms}`); };
  g.__swHouseGate = (gate: string, x: number, y: number) => { if (rec) buf.push(`G|${ln}|${gate}|${x}|${y}|0`); };
  g.__swAgeGen = (o: number, x: number, y: number, w: number, h: number, k: number) => {
    if (rec) buf.push(`AG|${ln}|${o}|${x},${y}|${w}x${h}|${k}`);
  };
  // RNG.reseed 包装：段边界（按解析行号）
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    const m = stack.match(/src\/world\/gen\/WorldGen\.ts:(\d+):\d+/);
    if (m) {
      const line = Number(m[1]);
      if (line === LN_BURIED && !rec) { rec = true; ln = 0; buf.push('---START 59'); }
      else if (line === LN_SURFACE && rec) { buf.push(`---PASS 59 total=${ln}`); rec = false; }
    }
    return oReseed.call(this, s);
  };
  class AbortOK extends Error {}
  try {
    await generateWorld({
      width: 4200, height: 1200,
      seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
      onWorldPartial: (_w, i, _pn) => {
        if (rec && i > 18) throw new AbortOK(`overshot-${i}`);
      },
    });
  } catch (e) {
    if (!(e instanceof AbortOK)) throw e;
  }
  RNGp.reseed = oReseed;
  flush();
  writeFileSync('/tmp/iii174-out/jstrace-grv174.meta', JSON.stringify({ lines: flushN, ln, LN_BURIED, LN_SURFACE }));
  console.log(`trace written ${flushN} lines (rolls=${ln}) -> ${OUT}`);
}, 900_000);
