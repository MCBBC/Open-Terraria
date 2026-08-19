// 一次性诊断（PPPPP 批 #81）：金标 079 基座上参数化模拟向日葵 pass，
// 暴力定谳"每株真实掷数 X"——目标复现 vanilla 081 六块 {2051,2057,2063,2065,2957,2965}。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG, translateSeed } from '../src/core/rng';

const RUN = process.env.SW_PP2 === '1';
const G2 = '/tmp/sw-slp/g', W = 4200, H = 1200;
const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const nm = '079_Grass_Wall';
const T0 = le16(`${G2}/${nm}.typ`), A0 = new Uint8Array(readFileSync(`${G2}/${nm}.act`)),
  L0 = new Uint8Array(readFileSync(`${G2}/${nm}.liq`)), HF0 = new Uint8Array(readFileSync(`${G2}/${nm}.half`)),
  SL0 = new Uint8Array(readFileSync(`${G2}/${nm}.slope`)), WL0 = le16(`${G2}/${nm}.wal`);

interface Res { blocks: Array<[number, number]>; bands: string[] }
function simulate(rollsPerPlace: number, bandCount: number, wsNum: number, dbg = false): Res {
  const t = T0.slice(), a = A0.slice(), l = L0.slice();
  const hf = HF0.slice(), sl = SL0.slice(), wl = WL0.slice();
  const seed = translateSeed('9293480');
  const rng = new RNG(seed);
  rng.reseed(seed);
  const ws = Math.floor(wsNum);
  const bands: string[] = [];
  const blocks: Array<[number, number]> = [];
  const I = (x: number, y: number) => y * W + x;
  for (let i = 0; i < bandCount; i++) {
    const c = rng.nextInt(W);
    const lo = Math.max(0, c - rng.nextInt(10) - 7);
    const hi = Math.min(W - 1, c + rng.nextInt(10) + 7);
    bands.push(`b${i}:[${lo},${hi}]`);
    for (let j = lo; j < hi; j++) {   // vanilla j < num3 独占上界
      for (let k = 1; k < ws - 1; k++) {
        if (a[I(j, k)] && t[I(j, k)] === 2 && !a[I(j, k - 1)]) {
          const ai = I(j, k - 1);
          if (l[ai] > 0) { if (dbg) console.log(`attempt(${j},${k}) rej liquid`); }
          else {
            let flag = true;
            const why: string[] = [];
            for (let x = j; x < j + 2; x++) {
              for (let y = k - 4; y < k; y++) {
                if (x < 0 || x >= W || y < 0) continue;
                if (a[I(x, y)] || wl[I(x, y)] > 0) { flag = false; why.push(`air(${x},${y}) a=${a[I(x, y)]} w=${wl[I(x, y)]}`); }
              }
              const gy = k;
              if (x < 0 || x >= W || gy >= H) { flag = false; continue; }
              if (!a[I(x, gy)] || hf[I(x, gy)] || sl[I(x, gy)] !== 0
                || (t[I(x, gy)] !== 2 && t[I(x, gy)] !== 109)) {
                flag = false;
                why.push(`ground(${x},${gy}) a=${a[I(x, gy)]} t=${t[I(x, gy)]} hf=${hf[I(x, gy)]} sl=${sl[I(x, gy)]}`);
              }
            }
            if (dbg) console.log(`attempt(${j},${k}) flag=${flag} ${why.join(';')}`);
            if (flag) {
              for (let q = 0; q < rollsPerPlace; q++) rng.nextInt(3);
              for (let x = j; x < j + 2; x++) for (let y = k - 4; y < k; y++) {
                if (x < 0 || x >= W || y < 0 || y >= H) continue;
                const ii = I(x, y);
                a[ii] = 1; t[ii] = 27;
              }
              blocks.push([j, k - 1]);
            }
          }
        }
        if (a[I(j, k)]) break;
      }
    }
  }
  return { blocks, bands };
}

(RUN ? it : it.skip)('brute-force rolls per sunflower placement', async () => {
  const target = JSON.stringify([[2051, 230], [2057, 230], [2063, 230], [2065, 230], [2957, 249], [2965, 255]]);
  for (const ws of [337, 336, 338]) {
    for (let x = 1; x <= 18; x++) {
      for (const bands of [8, 9]) {
        const r = simulate(x, bands, ws);
        const got = JSON.stringify(r.blocks);
        if (got === target) console.log(`HIT ws=${ws} rolls/place=${x} bands=${bands}`);
      }
    }
  }
  console.log('--- dbg rolls=9 bands=9 ws=337:');
  const r = simulate(9, 9, 337, true);
  console.log(r.bands.join(' '));
  console.log('blocks:', JSON.stringify(r.blocks));
}, 300_000);
