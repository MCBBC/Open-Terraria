// IIII180 批主仪：microbiomes 段 JS 侧逐臂掷数账（与 oracle MBSEG 行同格式对拍）
//   行格式：SEG <name> rc=<draws> [detail]——rc=UnifiedRandom.internalSample 链累计
//   （oracle 侧 rc=QRollWrap.N,窗口 beehives..microbiomes;两侧只比【臂间 delta】）。
//   另收 mbProbe 逐尝试行（CAMP/MINE/MAHOG/LTRK/STRK x,y rc=.. ok=..）。
// 用法：cd game && SW_I180=1 SW_I180_SEED=9293480 npx vitest run tools/_iii180ledger.test.ts
//   产物 /tmp/iii180-out/js-mbledger.txt
process.env.SW_MB_1457 = '1';
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';
import { __setTrackDraws, __setTrackHistProbe, __setTrackColProbe, __setTrackKillProbe } from '../src/world/gen/vanilla/TrackPass';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I180 === '1';
const SEED = process.env.SW_I180_SEED ?? '9293480';
const EVIL = Number(process.env.SW_I180_EVIL ?? '0') as 0 | 1;
const OUT = '/tmp/iii180-out';

(RUN ? it : it.skip)(`iii180 js mb ledger seed=${SEED}`, async () => {
  mkdirSync(OUT, { recursive: true });
  let nDraws = 0;
  const URp = Object.getPrototypeOf(new RNG(1)['vanilla']) as unknown as { internalSample: () => number };
  const origSample = URp.internalSample;
  URp.internalSample = function (this: unknown) { nDraws++; return origSample.call(this); };

  const lines: string[] = [];
  const L = (s: string) => { lines.push(s); };
  (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg =
    (n: string, d?: unknown) => {
      if (n === 'mbTrack' && process.env.SW_I180_TRACKDUMP) {
        const dd = d as { st: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; half: Uint8Array; slope: Uint8Array; w: number; h: number }; gs: { shimmerX: number; shimmerY: number; worldSurface: number; rockLevel: number; beachDistance: number; lavaLine: number } };
        const { writeFileSync } = require('node:fs') as typeof import('node:fs');
        const stt = dd.st; const nn = stt.w * stt.h;
        const tb = Buffer.alloc(nn * 2), ab = Buffer.alloc(nn), wb = Buffer.alloc(nn * 2);
        for (let i = 0; i < nn; i++) { tb.writeUInt16LE(stt.type[i] & 0xffff, i * 2); ab[i] = stt.flags[i] ? 1 : 0; wb.writeUInt16LE(stt.wall[i] & 0xffff, i * 2); }
        writeFileSync(`${process.env.SW_I180_TRACKDUMP}.typ`, tb);
        writeFileSync(`${process.env.SW_I180_TRACKDUMP}.act`, ab);
        writeFileSync(`${process.env.SW_I180_TRACKDUMP}.wal`, wb);
        writeFileSync(`${process.env.SW_I180_TRACKDUMP}.half`, stt.half);
        writeFileSync(`${process.env.SW_I180_TRACKDUMP}.slope`, stt.slope);
        L(`SEG trackdump rc=${nDraws} shimmer=${dd.gs.shimmerX},${dd.gs.shimmerY} ws=${dd.gs.worldSurface} rl=${dd.gs.rockLevel} bd=${dd.gs.beachDistance} lava=${dd.gs.lavaLine}`);
        return;
      }
      let ds = '';
      if (d !== undefined) {
        if (typeof d === 'object') { try { ds = ' ' + JSON.stringify(d); } catch { ds = ' [obj]'; } }
        else ds = ' ' + String(d);
      }
      L(`SEG ${n}${ds} rc=${nDraws}`);
    };
  (globalThis as unknown as { __swMbDraws?: () => number }).__swMbDraws = () => nDraws;
  __setTrackDraws(() => nDraws);
  __setTrackHistProbe((tag, hist, len, dir, ox, oy) => {
    if (tag === 'TPFS' || tag === 'TPFP FAIL') return;
    L(`TRACK ${tag} len=${len} dir=${dir} origin=${ox},${oy} rc=${nDraws}`);
    if (process.env.SW_I180_TH && tag === 'TPFP OK') {
      for (let i = 0; i < len; i++) {
        const h = hist[i]!;
        L(`TH ${i} ${h.x} ${h.y} ${h.slope} ${h.mode}`);
      }
    }
  });
  __setTrackColProbe((loop, k, x, y, ph, rc) => { L(`P${loop} ${k} ${x} ${y} ${ph} ${rc}`); });
  __setTrackKillProbe((draws, x, y, sheet, fx, fy) => { L(`KILL ${x},${y} t=${sheet} fx=${fx} fy=${fy} rc=${draws}`); }, () => nDraws);
  try {
    const t0 = Date.now();
    chainCheckpoints(SEED, EVIL);
    console.log(`[iii180] chain done ${Date.now() - t0}ms lines=${lines.length}`);
  } finally {
    delete (globalThis as unknown as { __swSeg?: unknown }).__swSeg;
    delete (globalThis as unknown as { __swMbDraws?: unknown }).__swMbDraws;
    __setTrackDraws(undefined);
    __setTrackHistProbe(undefined);
    __setTrackColProbe(undefined);
    __setTrackKillProbe(undefined);
    URp.internalSample = origSample;
  }
  writeFileSync(`${OUT}/js-mbledger.txt`, lines.join('\n') + '\n');
  console.log(`[iii180] ledger -> ${OUT}/js-mbledger.txt (${lines.length} lines)`);
}, 900_000);
