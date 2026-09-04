// IIII158 一次性探针：manors (2561,1082) 幽灵坡面 Hellforges 清算路由取证。
// 复用既有零开销钩：__swShimTargets+__swSeg（tileFrameGen 入口栈）/ __swSqfCell（SQF 九宫逐格掷耗）。
// 用法：cd game && SW_III158=1 npx vitest run tools/_iii158probe.test.ts
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

it('III158 probe', async () => {
  if (process.env.SW_III158 !== '1') return;
  const g = globalThis as Record<string, unknown>;
  const segs: string[] = [];
  const sqf: string[] = [];
  let ev = 0;
  const marks: string[] = [];
  g.__swShimTargets = new Set(['2561,1082']);
  g.__swSeg = (n: string) => { segs.push(`ev${ev} ${n}`); };
  g.__swSqfCell = (k: number, l: number, t: number, before: number, after: number) => {
    if (Math.abs(k - 2561) <= 3 && Math.abs(l - 1082) <= 3) {
      sqf.push(`ev${ev} SQFcell(${k},${l}) t=${t} rc=${before}->${after}`);
    }
  };
  const atts: string[] = [];
  g.__swHfAttempt = (s: string) => { atts.push(s); };
  const t0 = Date.now();
  await generateWorld({
    width: 4200, height: 1200, seedText: 'abandonedmanors|20260904', evil: 0,
    onWorldPartial: (w, i, pn) => {
      const st = (w as { store: { idx(x: number, y: number): number; flags: Uint8Array; type: Uint16Array; slope: Uint8Array } }).store;
      const q = st.idx(2561, 1082);
      const line = `slot#${String(i).padStart(3)} ${pn} act=${st.flags[q] & 1} typ=${st.type[q]} slope=${st.slope[q]} ev=${ev}`;
      if (i <= 2 || (st.flags[q] & 1) === 0 || st.slope[q] !== 0 || i >= 71) marks.push(line);
    },
  });
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s  segs=${segs.length} sqf=${sqf.length}`);
  console.log('=== ghost (2561,1082) per-slot (incl. every change) ===');
  for (const m of marks) console.log(m);
  console.log('=== TileFrame on ghost (full run) ===');
  for (const s of segs) console.log(s);
  console.log('=== SQF cells within 3 of ghost (full run) ===');
  for (const s of sqf) console.log(s);
  console.log('=== Hellforges attempts x∈[2556,2566] (full run) ===');
  for (const s of atts) console.log(s);
}, 600000);
