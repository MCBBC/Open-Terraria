// IIII108b2:MB 全程 segProbe 收集器(SW_I136TRACE)——hydrate+重放,抓取指定矩形
// 触及的所有探针行(BCHK/BFR/DCHK/MS*/EXPL/CAND/GATE/118TI/CS*/118LT...) 定罪归属。
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const BASE = process.env.SW_I135_BASE ?? '/tmp/iii133-out/js';
const W = Number(process.env.SW_I135_W ?? 4200);
const H = Number(process.env.SW_I135_H ?? 1200);
const SEED = Number(process.env.SW_I135_SEED ?? '1671560105');
const X0 = Number(process.env.SW_I136_X0 ?? '1020'), X1 = Number(process.env.SW_I136_X1 ?? '1090');
const Y0 = Number(process.env.SW_I136_Y0 ?? '950'), Y1 = Number(process.env.SW_I136_Y1 ?? '1000');
const OUTTAG = process.env.SW_I136_OUTTAG ?? 'band';

it('III136 trace collector', () => {
  const hdr = JSON.parse(readFileSync(`${BASE}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType',
    'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const buf = readFileSync(`${BASE}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    const len = hdr[`${c}_len`] as number;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer.slice(buf.byteOffset, buf.byteOffset + len * bytesPer)));
  }
  try {
    restoreGenSolid(new Map(JSON.parse(readFileSync(`${BASE}/base_gensolid.json`, 'utf8')) as Array<[number, boolean]>));
  } catch { /* none */ }
  const gs = JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8')) as unknown as GenState;
  const chests = JSON.parse(readFileSync(`${BASE}/base_chests.json`, 'utf8'));

  const rows: string[] = [];
  let jIdx = -1;
  let rngCount = 0;
  const g = globalThis as {
    __swSeg?: (n: string, d?: unknown) => void;
    __swOnRoll?: unknown;
    __swMbDraws?: unknown;
  };
  const oSeg = g.__swSeg;
  const oRoll = g.__swOnRoll;
  const oDraws = g.__swMbDraws;
  g.__swOnRoll = () => { rngCount++; };
  g.__swMbDraws = () => rngCount;
  // 注入偏置接口（复算谱实验用）
  const BIASES: Array<{ tag: string | number; k: number }> = [];
  for (const pair of (process.env.SW_I136_SETS ?? '').split(',')) {
    if (!pair) continue;
    const [a, b] = pair.split('@').map(Number);
    BIASES.push({ tag: pair.startsWith('a') || pair.startsWith('MINEPRE') || ANCHOR_WORDS.includes(pair.split('@')[0]!) ? String(pair.split('@')[0]) : NaN, k: b });
    void a;
  }
  const anchorHit = new Map<string, number>();
  g.__swSeg = (name: string, d?: unknown): void => {
    if (name.startsWith('lavaJ')) { jIdx++; }
    if (ANCHOR_WORDS.includes(name)) {
      anchorHit.set(name, (anchorHit.get(name) ?? 0) + 1);
      for (const bb of BIASES) if (bb.tag === name && bb.k > 0 && !bb.used) { for (let z = 0; z < bb.k; z++) rng.next(); (bb as { used?: boolean }).used = true; }
      if ((process.env.SW_I136_ALLSEG ?? '') === '1') rows.push(`ANCH ${name} rc=${rngCount}`);
    }
    if (name.startsWith('tAtt') && (process.env.SW_I136_TATT ?? '') === '1') rows.push(`tAtt#${(anchorHit.get('__tAtt') ?? -1)} d=${JSON.stringify(d)} j=${jIdx} rc=${rngCount}`);
    else if (name.startsWith('tAtt')) { anchorHit.set('__tAtt', (anchorHit.get('__tAtt') ?? -1) + 1); }
    // 矩形命中过滤
    const hits = coordProbe(name, d);
    if (hits) rows.push(`${name}${d !== undefined ? '|' + JSON.stringify(d) : ''} j=${jIdx} rc=${rngCount}`);
  };
  function coordProbe(name: string, d?: unknown): string | null {
    // 各探针载荷格式: 从 detail 或名字中提取坐标
    let xs: Array<number> = []; let ys: Array<number> = [];
    if (typeof d === 'object' && d !== null) {
      const arr = d as unknown[];
      if (Array.isArray(arr)) {
        if (arr.length >= 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') { xs.push(arr[0]!); ys.push(arr[1]!); }
        else if (typeof arr[0] === 'string' && arr.length === 1) return null;
        else {
          for (const e of arr) {
            if (Array.isArray(e) && e.length >= 2) { xs.push(e[0]!); ys.push(e[1]!); }
          }
        }
      }
    } else if (typeof d === 'string') {
      const m = /^(-?\d+),(-?\d+)/.exec(d);
      if (m) { xs.push(Number(m[1])); ys.push(Number(m[2])); }
    }
    if (!xs.length) {
      const m = /(\d+),(\d+)/.exec(name);
      if (m) { xs.push(Number(m[1])); ys.push(Number(m[2])); }
    }
    for (let q = 0; q < xs.length; q++) {
      if (xs[q]! >= X0 && xs[q]! <= X1 && ys[q]! >= Y0 && ys[q]! <= Y1) return `${xs[q]},${ys[q]}`;
    }
    return null;
  }
  const rng = new RNG(SEED);
  runMicroBiomesPass(st, rng, gs, chests as never);
  g.__swSeg = oSeg;
  g.__swOnRoll = oRoll;
  g.__swMbDraws = oDraws;
  console.log(`anchors=${JSON.stringify([...anchorHit.entries()].filter(([k]) => !k.startsWith('__')))}`);
  console.log(`TRACE(${OUTTAG}) rows=${rows.length}`);
  for (const r of rows.slice(0, 400)) console.log('R| ' + r);
}, 900_000);

const ANCHOR_WORDS = ['passStart', 'deadCands', 'deadCount', 'iceCount', 'swordAttempts',
  'campCount', 'trapCount', 'treeCount', 'longTrackCount', 'stdTrackCount', 'mbLavaS', 'mbMine'];
