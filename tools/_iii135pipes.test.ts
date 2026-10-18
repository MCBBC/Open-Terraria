// IIII104b：lava-trap 成功数普查 —— tile 135(wire-pipe) 在 MB pass 前后差 = 成功放置数。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';

const W = 4200, H = 1200, N = W * H;
const tPre = `${process.env.HOME ?? ''}/GoldenChains/golden-ftw-wir/096_Larva.typ`;
const tPost = `${process.env.HOME ?? ''}/GoldenChains/golden-ftw-wir/097_Micro_Biomes.typ`;
const jd = process.env.SW_I135_JSOUT ?? '/tmp/iii135-out/jsdumps';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

// ★C档可移植:GoldenChains 真值链+jsdumps 均本机对拍面(不可收编);缺=skip 不红
it.skipIf(!existsSync(tPre) || !existsSync(tPost) || !existsSync(jd))('III135 lava trap census', () => {
  const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer, 0, N);
  const t0 = le16(tPre), t1 = le16(tPost);
  let addT = 0, rmT = 0;
  for (let i = 0; i < N; i++) {
    if (t0[i] !== 135 && t1[i] === 135) addT++;
    if (t0[i] === 135 && t1[i] !== 135) rmT++;
  }
  console.log(`TRUTH pipes added=${addT} removed=${rmT} net=${addT - rmT}`);
  const fpre = readdirSync(jd).find((x) => x.startsWith('049') && x.endsWith('.typ'))!;
  const fpost = readdirSync(jd).find((x) => x.startsWith('050') && x.endsWith('.typ'))!;
  const j0 = le16(join(jd, fpre)), j1 = le16(join(jd, fpost));
  let addJ = 0, rmJ = 0;
  // JS dump 是内部 id：type==0 表示未激活格亦写 0；sheet 换算后统计
  const conv = (raw: Uint16Array): Uint16Array => {
    const out = new Uint16Array(N);
    for (let i = 0; i < N; i++) out[i] = raw[i] === 0 ? 0 : (SHEET[raw[i]] >= 0 ? SHEET[raw[i]]! : 9999);
    return out;
  };
  const c0 = conv(j0), c1 = conv(j1);
  for (let i = 0; i < N; i++) {
    if (c0[i] !== 135 && c1[i] === 135) addJ++;
    if (c0[i] === 135 && c1[i] !== 135) rmJ++;
  }
  console.log(`JS     pipes added=${addJ} removed=${rmJ} net=${addJ - rmJ}`);
}, 600_000);
