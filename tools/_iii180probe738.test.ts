// IIII180：stateAt(1492,735) 离线直算（TH738 分歧格）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
const W = 4200, H = 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
const PLAT = new Uint8Array(TILE_DEFS.length);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet; const d = TILE_DEFS[i] as unknown as { platform?: boolean };
  if (typeof s === 'number') SHEET[i] = s;
  if (d?.platform) PLAT[i] = 1;
}
const SOLID = new Set<number>([0,1,2,7,6,9,8,30,10,53,147,57,166,167,168,169,22,37,58,204,107,108,111,221,222,223,211,63,64,65,66,67,68,161,162,206,148,396,397,404,40,54,56,38,39,59,123,368,226,367,633,181,189,183,536,225,483,224,383,179,384,273,381,48,192,191,196,118,321,152,158,357,272,229,311,130,193,190,350,369,137,117,112,232,274,322,109,312,422,495,479,477,380,230,562,371,668,398,379,618,484,138,388,387,235,625,151,234,182,45,399,248,175,539,481,119,120,714,664,711,715,716,713,23,41,75,199,60,70,25,202,43,44,203,255,256,257,258,259,260,261,262,263,264,265,266,267,268,421,476,546,557,482,163,200,116,76,46,47,115,121,122,127,140,145,146,150,153,154,155,156,157,159,160,164,170,176,177,180,188,194,195,197,198,208,239,249,250,251,252,253,284,313,315,325,326,327,328,329,336,341,342,343,344,345,346,347,348,351,365,366,370,385,400,401,402,403,407,408,409,415,416,417,418,426,427,430,431,432,433,434,435,436,437,438,439,446,447,448,449,450,451,458,459,460,472,473,474,478,492,496,498,500,501,502,503,507,508,512,513,19]);
const VAN_EXTRA = new Set([239, 380, 427, 435, 436, 437, 438, 439]);
const RESTORE = new Set([659, 484, 481, 482, 483, 162, 232, 229]);
const INVALID_WALLS = new Set([7, 94, 95, 8, 98, 99, 9, 96, 97, 3, 83, 68, 62, 78, 87, 86, 42, 74, 27, 149]);
const INVALID_TILES = new Set([383, 384, 15, 304, 30, 321, 245, 246, 240, 241, 242, 16, 34, 158, 377, 94, 10, 19, 86, 219, 484, 190, 664, 665, 41, 43, 44, 226, 237, 711, 712, 713, 714, 715, 716, 379, 314, 141, 411, 21, 467, 88]);
const PLACE_BLOCKED = new Set([225, 41, 481, 43, 482, 44, 483, 226, 203, 112, 25, 70, 151, 21, 31, 696, 467, 12, 665, 639, 138, 664, 711, 712, 713, 714, 715, 716]);
const PLATFORM_84 = new Set([14,16,18,19,87,88,101,114,134,239,275,276,277,278,279,280,281,285,286,296,297,298,299,309,310,339,358,359,361,362,363,364,376,380,391,392,393,394,405,413,414,427,435,436,437,438,439,469,532,533,538,542,544,550,551,553,554,555,556,558,559,582,599,600,601,602,603,604,605,606,607,608,609,610,611,612,619,629,632,640,643,644,645,710]);
const WS = 337, RL = 571, BD = 380;

it('probe stateAt(1492,735)', () => {
  const le16 = (b: Buffer) => new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  const T = le16(readFileSync('/tmp/iii180-out/js-trackdump.typ')), A = readFileSync('/tmp/iii180-out/js-trackdump.act'),
    Wl = le16(readFileSync('/tmp/iii180-out/js-trackdump.wal')), Hf = readFileSync('/tmp/iii180-out/js-trackdump.half'), Sl = readFileSync('/tmp/iii180-out/js-trackdump.slope');
  const idx = (x: number, y: number) => y * W + x;
  const trkSolidGen = (t: number) => (t === 0 || SHEET[t] === 0) ? true : (SOLID.has(t) || t === 19);
  const staticSolidOr = (t: number) => (SOLID.has(t) && !VAN_EXTRA.has(t)) || RESTORE.has(t);
  const jvs = (t: number) => t === 19 || SOLID.has(t);
  const jsSolid = (x: number, y: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return false; const i = idx(x, y); return !!A[i] && trkSolidGen(T[i]) && !PLAT[T[i]] && Hf[i] === 0 && Sl[i] === 0; };
  const orSolid = (x: number, y: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return false; const i = idx(x, y); return A[i] !== 0 && staticSolidOr(T[i]) && !PLATFORM_84.has(T[i]) && Hf[i] === 0 && Sl[i] === 0; };
  const orSolidJvs = (x: number, y: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return false; const i = idx(x, y); return A[i] !== 0 && jvs(T[i]) && !PLATFORM_84.has(T[i]) && Hf[i] === 0 && Sl[i] === 0; };
  const locInv = (x: number, y: number) => {
    if (y > H - 200 || x < 5 || y < WS || x > W - 5) return 'bound';
    const oceanLevel = (WS + RL) / 2 + 40;
    if (y <= oceanLevel && (x < BD || x > W - BD)) return 'ocean';
    const i = idx(x, y);
    if (INVALID_WALLS.has(Wl[i])) return `wall${Wl[i]}`;
    if (A[i] && INVALID_TILES.has(T[i])) return `tile${T[i]}`;
    for (let k = -1; k <= 1; k++) {
      const ni = idx(x + k, y);
      if (A[ni] && T[ni] !== 314 && PLACE_BLOCKED.has(T[ni])) return `nbr${T[ni]}@${k}`;
    }
    return '';
  };
  const X = 1492, Y = 735;
  for (let k = 0; k < 6; k++) {
    const x = X, y = Y - k, i = idx(x, y);
    const li = locInv(x, y);
    console.log(`cell(${x},${y}) t=${T[i]} a=${A[i]} h=${Hf[i]} s=${Sl[i]} w=${Wl[i]} locInv=${li || '-'} jsSolid=${jsSolid(x, y)} orSolidStatic=${orSolid(x, y)} orSolidJvs=${orSolidJvs(x, y)}`);
  }
  for (let j = 0; j < 6; j++) {
    const x = X, y = Y + j, i = idx(x, y);
    if (A[i] && T[i] === 314) console.log(`track cell at (${x},${y})`);
  }
  console.log('INVALID scan (y-5..y):');
  for (let i2 = 0; i2 < 6; i2++) { const r = locInv(X, Y - i2); if (r) console.log(`  locInvalid(${X},${Y - i2})=${r}`); }
});
