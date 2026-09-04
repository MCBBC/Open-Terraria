// IIII100g 仪④c：slot-51 捕获 ↔ 金标 098 全格 8 通道对拍(定谳 mile8 #98 13×j9999 真伪)
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I100GP98C === '1';
const G2 = `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const W = 4200, H = 1200, N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };

(RUN ? it : it.skip)('iii100g slot51 vs golden 098', { timeout: 3_600_000 }, async () => {
  const st = { flags: null as unknown as Uint8Array, type: null as unknown as Uint16Array, wall: null as unknown as Uint16Array, liquid: null as unknown as Uint16Array, slope: null as unknown as Uint8Array, half: null as unknown as Uint8Array };
  let snap = false;
  await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 as -1 | 0 | 1,
    seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
    onWorldPartial: (w, i) => {
      if (i !== (Number(process.env.SW_I100GP98C_CB) || 51) || snap) return;
      snap = true;
      const s0 = w.store as never as TileStore;
      st.flags = (s0.flags as Uint8Array).slice();
      st.type = (s0.type as Uint16Array).slice();
      st.wall = (s0.wall as Uint16Array).slice();
      st.liquid = (s0.liquid as Uint16Array).slice();
      st.slope = (s0.slope as Uint8Array).slice();
      st.half = (s0.half as Uint8Array).slice();
    },
  } as Parameters<typeof generateWorld>[0]);
  if (!snap) throw new Error('no slot-51 snap');
  const SLOT = String(Number(process.env.SW_I100GP98C_SLOT) || 51).padStart(3, '0');
const GT = le16(`${G2}/${SLOT}_${process.env.SW_I100GP98C_NAME ?? 'Settle_Liquids_Again'}.typ`), GA = readFileSync(`${G2}/${SLOT}_${process.env.SW_I100GP98C_NAME ?? 'Settle_Liquids_Again'}.act`);
  const GW = le16(`${G2}/${SLOT}_${process.env.SW_I100GP98C_NAME ?? 'Settle_Liquids_Again'}.wal`), GL = readFileSync(`${G2}/${SLOT}_${process.env.SW_I100GP98C_NAME ?? 'Settle_Liquids_Again'}.liq`);
  let dA = 0, dT = 0, dW = 0, dL = 0, firstI = -1;
  const pair = new Map<string, number>();
  const unmapped: string[] = [];
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i]! & 1;
    const va = GA[i]!;
    if (va !== ja) { dA++; if (firstI < 0) firstI = i; }
    const vt = va ? GT[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (jt === 9999 && unmapped.length < 8) { const x = i % W, y = (i / W) | 0; unmapped.push(`(${x},${y})t${st.type[i]}`); }
    if (vt !== jt) { dT++; if (firstI < 0) firstI = i; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (GW[i]! !== st.wall[i]!) { dW++; if (firstI < 0) firstI = i; }
    if (GL[i]! !== st.liquid[i]!) { dL++; if (firstI < 0) firstI = i; }
  }
  // active-air 计数解剖
  let gAA = 0, jAA = 0, bothAA = 0, gAA_jsT_nonzero = 0, jAA_gT_nonzero = 0;
  for (let i = 0; i < N; i++) {
    const va = GA[i]!, ja = st.flags[i]! & 1;
    const gAir = va === 1 && GT[i] === 0;
    const jAir = ja === 1 && st.type[i] === 0;
    if (gAir) gAA++;
    if (jAir) jAA++;
    if (gAir && jAir) bothAA++;
    if (gAir && ja === 1 && st.type[i] !== 0) gAA_jsT_nonzero++;
    if (jAir && va === 1 && GT[i] !== 0) jAA_gT_nonzero++;
  }
  console.log(`golden active+type0=${gAA}  JS active+type0=${jAA}  交集=${bothAA}  金标air格JS放实type=${gAA_jsT_nonzero}  JS air格金标实type=${jAA_gT_nonzero}`);
  console.log(`A=${dA} T=${dT} W=${dW} L=${dL} first=(${firstI % W},${Math.floor(firstI / W)})`);
  console.log('pairs:', [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k}x${n}`).join(' '));
  console.log('unmapped samples:', unmapped.join(' '));
  if (process.env.SW_I100GP98C_CELL) {
    const [cx, cy] = (process.env.SW_I100GP98C_CELL).split(',').map(Number);
    const i = cy * W + cx;
    const GS = readFileSync(`${G2}/${SLOT}_${process.env.SW_I100GP98C_NAME ?? 'Settle_Liquids_Again'}.slope`);
    const GH = readFileSync(`${G2}/${SLOT}_${process.env.SW_I100GP98C_NAME ?? 'Settle_Liquids_Again'}.half`);
    console.log(`CELL(${cx},${cy}) JS: act=${st.flags[i]&1} type=${st.type[i]} slope=${st.slope[i]} half=${st.half[i]} wall=${st.wall[i]} | golden: act=${GA[i]} type=${GT[i]} slope=${GS[i]} half=${GH[i]} wall=${GW[i]}`);
  }
});
