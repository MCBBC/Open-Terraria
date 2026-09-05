// IIII193 批主仪：轨段 m-loop 分歧定位——JS 侧 TH2(pre-smooth)/REW(tryRewrite 步进,
//   oracle MBREW 同格式)/trackdump/终态网格四件套（基于 _iii180ledger,增量三钩）。
// 行格式：REW len=.. num=.. seg=.. cell=x,y,slope,mode（↔ caves-oracle.cs MBREW）
//         TH2 <i> <x> <y> <slope> <mode>（↔ oracle MBSEG_TH2,pre-smooth）
//         TRACK TPFP OK len=.. dir=.. origin=x,y rc=..（post-smooth TH 跟随）
// 用法：cd game && SW_I193=1 npx vitest run tools/_iii193ledger.test.ts
//   产物 /tmp/iii193-out/{js-mbledger.txt,js-td2.*,js-mb.*}
process.env.SW_MB_1457 = '1';
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';
import { __setTrackDraws, __setTrackHistProbe, __setTrackColProbe, __setTrackKillProbe, __setTrackRewProbe } from '../src/world/gen/vanilla/TrackPass';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I193 === '1';
const SEED = process.env.SW_I193_SEED ?? '9293480';
const EVIL = Number(process.env.SW_I193_EVIL ?? '0') as 0 | 1;
const OUT = process.env.SW_I193_OUT ?? '/tmp/iii193-out';

(RUN ? it : it.skip)(`iii193 js track ledger seed=${SEED}`, async () => {
  mkdirSync(OUT, { recursive: true });
  let nDraws = 0;
  const URp = Object.getPrototypeOf(new RNG(1)['vanilla']) as unknown as { internalSample: () => number };
  const origSample = URp.internalSample;
  URp.internalSample = function (this: unknown) { nDraws++; return origSample.call(this); };

  const lines: string[] = [];
  const L = (s: string) => { lines.push(s); };
  (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg =
    (n: string, d?: unknown) => {
      if (n === 'mbTrack') {
        const dd = d as { st: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; half: Uint8Array; slope: Uint8Array; w: number; h: number }; gs: { shimmerX: number; shimmerY: number; worldSurface: number; rockLevel: number; beachDistance: number; lavaLine: number } };
        const { writeFileSync } = require('node:fs') as typeof import('node:fs');
        const stt = dd.st; const nn = stt.w * stt.h;
        const tb = Buffer.alloc(nn * 2), ab = Buffer.alloc(nn), wb = Buffer.alloc(nn * 2);
        for (let i = 0; i < nn; i++) { tb.writeUInt16LE(stt.type[i] & 0xffff, i * 2); ab[i] = stt.flags[i] ? 1 : 0; wb.writeUInt16LE(stt.wall[i] & 0xffff, i * 2); }
        writeFileSync(`${OUT}/js-td2.typ`, tb);
        writeFileSync(`${OUT}/js-td2.act`, ab);
        writeFileSync(`${OUT}/js-td2.wal`, wb);
        writeFileSync(`${OUT}/js-td2.half`, stt.half);
        writeFileSync(`${OUT}/js-td2.slope`, stt.slope);
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
    if (tag === 'TPRE') {                       // ★IIIII193:pre-smooth 历史（oracle TH2 同位）
      for (let i = 0; i < len; i++) {
        const h = hist[i]!;
        L(`TH2 ${i} ${h.x} ${h.y} ${h.slope} ${h.mode}`);
      }
      return;
    }
    L(`TRACK ${tag} len=${len} dir=${dir} origin=${ox},${oy} rc=${nDraws}`);
    if (process.env.SW_I193_TH && tag === 'TPFP OK') {
      for (let i = 0; i < len; i++) {
        const h = hist[i]!;
        L(`TH ${i} ${h.x} ${h.y} ${h.slope} ${h.mode}`);
      }
    }
  });
  __setTrackRewProbe((len, num, seg, cell) => {   // ★IIIII193:MBREW 镜像（同格式同行窗）
    L(`REW len=${len} num=${num} seg=${seg} cell=${cell.x},${cell.y},${cell.slope},${cell.mode}`);
  });
  __setTrackColProbe((loop, k, x, y, ph, rc) => { L(`P${loop} ${k} ${x} ${y} ${ph} ${rc}`); });
  __setTrackKillProbe((draws, x, y, sheet, fx, fy) => { L(`KILL ${x},${y} t=${sheet} fx=${fx} fy=${fy} rc=${draws}`); }, () => nDraws);
  (globalThis as unknown as { __cavesGridExport?: { at: string; dir: string } }).__cavesGridExport =
    { at: 'microbiomes', dir: `${OUT}/js-mb` };
  try {
    const t0 = Date.now();
    chainCheckpoints(SEED, EVIL);
    console.log(`[iii193] chain done ${Date.now() - t0}ms lines=${lines.length}`);
  } finally {
    delete (globalThis as unknown as { __swSeg?: unknown }).__swSeg;
    delete (globalThis as unknown as { __swMbDraws?: unknown }).__swMbDraws;
    delete (globalThis as unknown as { __cavesGridExport?: unknown }).__cavesGridExport;
    __setTrackDraws(undefined);
    __setTrackHistProbe(undefined);
    __setTrackRewProbe(undefined);
    __setTrackColProbe(undefined);
    __setTrackKillProbe(undefined);
    URp.internalSample = origSample;
  }
  writeFileSync(`${OUT}/js-mbledger.txt`, lines.join('\n') + '\n');
  console.log(`[iii193] ledger -> ${OUT}/js-mbledger.txt (${lines.length} lines)`);
}, 900_000);
