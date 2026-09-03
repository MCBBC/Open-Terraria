// ★IIIII213 一次性仪③：#97→#98 液体动静对照（gold 两 dump 间 + JS 侧）——
// 判定 ±1 池面差是 #98 settle 的局部动力学还是全局再分配。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
const G2 = `${process.env.HOME}/GoldenChains/golden-remix/dumps`;
const JS98 = '/tmp/iii209-out/pipeslot-98';
const W = 4200, H = 1200;
function le16(p: string): Uint16Array { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); }
function u8(p: string): Uint8Array { const b = readFileSync(p); return new Uint8Array(b.buffer, b.byteOffset, b.length); }
const ZONES: [string, number, number, number, number][] = [
  ['pond', 3660, 3720, 100, 135],
  ['slab856', 2150, 2290, 840, 880],
  ['ocean278', 3950, 4199, 260, 300],
];
it('iii213 zone motion', () => {
  const g97L = u8(`${G2}/097_Micro_Biomes.liq`), g98L = u8(`${G2}/098_Settle_Liquids_Again.liq`);
  const g97T = le16(`${G2}/097_Micro_Biomes.typ`), g98T = le16(`${G2}/098_Settle_Liquids_Again.typ`);
  const g98A = u8(`${G2}/098_Settle_Liquids_Again.act`);
  const g97A = u8(`${G2}/097_Micro_Biomes.act`);
  const jL = u8(`${JS98}/base_liquid.bin`);
  for (const [nm, x0, x1, y0, y1] of ZONES) {
    let movedG = 0, movedJ = 0, sumG97 = 0, sumG98 = 0, sumJ = 0;
    const tiles = new Map<number, number>();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (g97L[i] !== g98L[i]) movedG++;
      if (g98L[i] !== (jL[i] ?? 0)) movedJ++;
      sumG97 += g97L[i]; sumG98 += g98L[i]; sumJ += jL[i] ?? 0;
      if (g98A[i]) tiles.set(g98T[i], (tiles.get(g98T[i]) ?? 0) + 1);
    }
    console.log(`${nm}: gold 97→98 moved=${movedG} (Σ97=${sumG97} Σ98=${sumG98}) | JS vs gold98 cells=${movedJ} (Σjs=${sumJ}) | top tiles: ${[...tiles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `${t}=${n}`).join(' ')}`);
  }
  // 全图层面：gold 97→98 动了多少格
  let gMoved = 0, jMovedVsGold97 = 0;
  const jL97 = u8('/tmp/iii209-out/pipeslot-98/base_liquid.bin');
  for (let i = 0; i < W * H; i++) {
    if (g97L[i] !== g98L[i]) gMoved++;
    if (jL97[i] !== g98L[i]) jMovedVsGold97++;
  }
  console.log(`wholemap: gold 97→98 liquid-changed cells=${gMoved}; JS98 vs gold98 diff=${2872} (known)`);
});
