// ★693b:YStart 真值复算——DetermineYStart 在 Sulphur Sea pass(111)运行时确定
// (SulphurousSea.cs:228-241),须用海 pass 输入态=snap-110(Micro Biomes 完成态)扫描,
// 而非 Draedon 完成态(120;中间 9 pass 可能改列)。真链首岛 j=382 反推 startH=382
// → (YStart+337)/2+90=382 → YStart∈{247,248}。
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const W = 4200, H = 1200;
function load(p: string) {
  const buf = gunzipSync(readFileSync(p));
  const type = new Uint16Array(W * H), act = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const o = (x * H + y) * 4;
    const t = buf[o] | (buf[o + 1] << 8);
    type[y * W + x] = t;
    act[y * W + x] = t !== 0 ? 1 : 0;
  }
  return { type, act };
}
const surfLow = Number(process.env.SW_SURFLOW ?? 194);
const xStart = (W - 1) - (370 + 1);   // GetActualX(BiomeWidth+1),atLeft=false
for (const [label, path] of [
  ['snap-110(海 pass 输入)', '/tmp/genprobe-consolidated-snaps/genprobe-snap-110-pre-Micro_Biomes.bin.gz'],
  ['snap-120(Draedon 完成)', '/tmp/genprobe-consolidated-snaps/genprobe-snap-120-pre-Draedon_Structures.bin.gz'],
] as const) {
  const s = load(path);
  // Searches.Down(3000)+IsSolid:自 (x, surfLow-20) 下行首个 active∧tileSolid 格
  // (IsSolid=WorldGen.SolidTile 语义近似:active 且非 tileSolidTop——此处用 active∧type∉{非实心集},
  //  快照只有 type,非实心类型保守排除常见装饰:草/花/藤/树等)
  const NONSOLID = new Set([3, 5, 20, 24, 27, 28, 32, 52, 61, 62, 69, 71, 73, 74, 81, 82, 83, 84, 110, 113, 115, 165, 184, 185, 186, 187, 201, 205, 227, 231, 233, 236, 238, 323, 324, 382, 444, 461, 518, 519, 528, 529, 530, 549, 571, 572, 586, 590, 591, 592, 595, 615, 624, 636, 637, 638, 649, 650, 651, 652]);
  let x = xStart;
  for (let guard = 0; guard < 400; guard++) {
    let found = -1;
    for (let y = Math.max(0, surfLow - 20); y < Math.min(H, surfLow - 20 + 3000); y++) {
      const i = y * W + x;
      if (s.act[i] && !NONSOLID.has(s.type[i])) { found = y; break; }
    }
    const t = found >= 0 ? s.type[found * W + x] : -1;
    console.log(`${label}: x=${x} 首实心 y=${found} type=${t}${t === 25 ? '(Ebonstone→西移重试)' : ''}`);
    if (t !== 25) {
      const startH = Math.floor((found + 337) / 2) + 90;
      console.log(`  → YStart=${found} startH=${startH}(真链首岛 sy=382)`);
      break;
    }
    x += -1;   // atLeft=false → ToDirectionInt=-1
  }
}
process.exit(0);
