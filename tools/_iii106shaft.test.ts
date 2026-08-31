// IIII106d：shaft35 行循环离散取证——在转写器里逐列记录行数与断因，
// 并用谓词变体（SolidTile 全口径/badOcTile 变体）统计行差，定位 Δ+12 来源。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const OUT = '/tmp/iii106-out';
const W = 4200, H = 1200;
const IT = Number(process.env.SW_SHAFT_IT ?? 35);
const TARGET_START = Number(process.env.SW_SHAFT_AT ?? 70);   // 触发 x
const TARGET_L = Number(process.env.SW_SHAFT_Y ?? 319);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));
const u8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));

(process.env.SW_SHAFT_ACCT === '1' ? it : it.skip)('shaft row accounting', () => {
  const bt = le16(`${OUT}/base_type.bin`), ba = u8(`${OUT}/base_flags.bin`);
  const bw = le16(`${OUT}/base_wall.bin`), bl = u8(`${OUT}/base_liquid.bin`);
  const bhf = u8(`${OUT}/base_half.bin`), bsl = u8(`${OUT}/base_slope.bin`);
  void bw; void bl;
  // 引擎热身：先跑一遍完整 waterState 的等价初值不必要——直接用 base。
  // 逐句复刻直到第 IT 轮的 shaft 结束,事件驱动的行计数:
  interface ColRec { m: number; rows: number; breakWhy: string; breakAt: [number, number] | null }
  const cols: ColRec[] = [];

  // UnifiedRandom 最小重放：直接用 jsrolls.txt —— 但 consumption 到达该轮需要
  // 完整前缀,偷懒方案:从引擎 Trace 已知本轮入参(SH1 值),跳过 RNG 重放,
  // 状态断层只影响写格→断点判定。前面轮次的写格已在 base 中吸收(重放一致性已证),
  // 但 base 是 ▶OceanCaves 入口快照——需要把 1..IT-1 轮的全部写入重放出来才准确!
  // ⇒ 完整内联重放(RNG 由 jsrolls 驱动, 与 _iii106rc 同源)
  const lines = readFileSync(`${OUT}/jsrolls.txt`, 'utf8').split('\n').filter(Boolean);
  const V = lines.map((l) => Number(l.split('|')[1]));
  let p = 0;
  const sample = () => V[p++]! * 4.656612875245797e-10;
  const nd = () => sample();
  const ni = (max: number) => Math.trunc(sample() * max);
  const nir = (a: number, b: number) => (Math.trunc(sample() * (b - a)) + a) | 0;

  const typ = new Uint16Array(bt), act = new Uint8Array(ba), wal = new Uint16Array(bw), liq = new Uint8Array(bl);
  const idx = (x: number, y: number) => x + y * W;
  const DW = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
  const DT = new Set([41, 43, 44, 677, 678, 679]);
  const SOLID_TOP = new Set([19, 239, 380, 427, 435, 436, 437, 438, 439]);
  let GSOLID: Map<number, boolean> | null = null;
  try { GSOLID = new Map(JSON.parse(readFileSync(`${OUT}/base_gensolid.json`, 'utf8'))); } catch { /* */ }
  const gsT = (t: number) => GSOLID?.get(t) ?? !!TILE_DEFS[t]?.solid;
  const beachDistance = 380;
  const INT_OF_SHEET = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) { const s2 = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s2 === 'number' && !INT_OF_SHEET.has(s2)) INT_OF_SHEET.set(s2, i); }
  const SAND_ID = INT_OF_SHEET.get(53)!, HSAND_ID = INT_OF_SHEET.get(397)!, CAVITY_ID = INT_OF_SHEET.get(264)!;
  console.log('ids:', { SAND_ID, HSAND_ID, CAVITY_ID });
  const VANILLA_PRED = process.env.SW_OC_VANPRED === '1';   // SolidTile 全口径变体

  const badOc = (i: number): boolean => {
    const wv = wal[i]!;
    if (wv === 83 || wv === 3 || DW.has(wv)) return true;
    const sh = SHEET[typ[i]!] ?? -1;
    if (sh === 203 || sh === 25 || DT.has(sh) || sh === 26 || sh === 31) return true;
    return false;
  };
  const solidBreak = (i: number): boolean => {
    if (!act[i]) return false;
    const t = typ[i]!;
    const sh = SHEET[t] ?? -1;
    if (VANILLA_PRED) {
      if (SOLID_TOP.has(sh)) return false;
      if (bhf[i]) return false;
      if (bsl[i]) return false;
    }
    return gsT(t);
  };

  ni(3); // oceanRoll 门
  const iStart = nir(55, 95);
  let jStart = 0;
  while (jStart < H && !act[idx(iStart, jStart)]) jStart++;
  let vx = iStart, vy = jStart;
  let dirX = 0.25 + nd() * 0.25, dirY = 0.4 + nd() * 0.25;
  let radius = nir(17, 25), life = nir(600, 800);
  const MIN_R = 4;
  let steep = true;
  let itN = 0;
  console.log(`start=(${iStart},${jStart})`);

  while (radius > MIN_R && life > 0) {
    let firstShaft = true, firstWater = true;
    if (vx > beachDistance - 50 && vx < W - beachDistance + 50) { radius *= 0.96; life *= 0.96; }
    const big = radius >= MIN_R + 2 && life >= 20;
    itN++;
    if (steep) { radius -= 0.01 + nd() * 0.01; life -= 0.5; }
    else { radius -= 0.02 + nd() * 0.02; life -= 1; }
    const r3 = radius * 3;
    const x0 = Math.max(1, Math.trunc(vx - r3)), x1 = Math.min(W - 1, Math.trunc(vx + r3));
    const y0 = Math.max(1, Math.trunc(vy - r3)), y1 = Math.min(H - 1, Math.trunc(vy + r3));
    let rowsAll = 0;
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const ti = idx(x, y);
        if (badOc(ti)) continue;
        const dist = Math.sqrt(Math.abs(x - vx) ** 2 + Math.abs(y - vy) ** 2);
        if (big && dist < radius * 0.5 + 1) {
          typ[ti] = CAVITY_ID; act[ti] = 0;
          void 0;
        } else if (dist < radius * 1.5 + 1 && typ[ti] !== CAVITY_ID) {
          if (y < vy) {
            if ((dirX < 0 && x < vx) || (dirX > 0 && x > vx)) {
              if (dist < radius * 1.1 + 1) { typ[ti] = HSAND_ID; }
              else if (typ[ti] !== HSAND_ID) typ[ti] = SAND_ID;
            }
          } else if ((dirX < 0 && x < iStart) || (dirX > 0 && x > iStart)) {
            typ[ti] = SAND_ID; act[ti] = 1;
            if (x === Math.trunc(vx) && firstShaft) {
              firstShaft = false;
              const depth = 50 + nir(0, 3), wide = 43 + nir(0, 3), len = 20 + nir(0, 3);
              const xa = dirX < 0 ? x - len : x, xb = dirX < 0 ? x : x + len;
              console.log(`SH it=${itN} at=${x},${y} pre=${depth},${wide},${len} rollP=${p}`);
              const recIt = itN === IT && x === TARGET_START && y === TARGET_L;
              const clocal: ColRec[] = [];
              for (let sx = xa; sx <= xb; sx++) {
                let rows = 0, why = '', bAt: [number, number] | null = null;
                for (let sy = y; sy < y + depth; sy++) {
                  const sti = idx(sx, sy);
                  if (badOc(sti)) { why = `bad@${sy}`; bAt = [sx, sy]; break; }
                  if (sy > y + wide) {
                    if (solidBreak(sti) && typ[sti] !== SAND_ID) { why = `solid@${sy}(t=${typ[sti]},sh=${SHEET[typ[ti]!]});`; bAt = [sx, sy]; break; }
                    typ[sti] = HSAND_ID;
                  } else typ[sti] = SAND_ID;
                  act[sti] = 1;
                  if (ni(3) === 0 && sx - 1 >= 0) { typ[idx(sx - 1, sy)] = SAND_ID; act[idx(sx - 1, sy)] = 1; }
                  if (ni(3) === 0 && sx + 1 < W) { typ[idx(sx + 1, sy)] = SAND_ID; act[idx(sx + 1, sy)] = 1; }
                  rows++;
                }
                if (!why) why = 'depth-end';
                clocal.push({ m: sx, rows, breakWhy: why, breakAt: bAt });
              }
              if (recIt) cols.push(...clocal);
              rowsAll += clocal.reduce((s, c) => s + c.rows, 0);
            }
          }
        }
        if (dist < radius * 1.3 + 1 && y > jStart - 10) liq[ti] = 255;
        if (firstWater && x === Math.trunc(vx) && y > vy) {
          firstWater = false;
          for (let sx = x - 2; sx <= x + 2; sx++) {
            for (let sy = y; sy < y + 100; sy++) {
              if (sx < 0 || sx >= W || sy >= H) continue;
              const wi = idx(sx, sy);
              if (!badOc(wi)) liq[wi] = 255;
            }
          }
        }
      }
    }
    vx += dirX; vy += dirY;
    dirX += nd() * 0.1 - 0.05;
    dirY += nd() * 0.1 - 0.05;
    if (steep) {
      if (vy > (337 * 2 + 415) / 3 && vy > jStart + 30) steep = false;
      dirY = Math.max(0.35, Math.min(1, dirY));
    } else {
      if (vx < W / 2) { if (dirX < 0.5) dirX += 0.02; }
      else if (dirX > -0.5) dirX -= 0.02;
      if (!big) { if (dirY < 0) dirY *= 0.95; dirY += 0.04; }
      else if (vy < (337 * 4 + 415) / 5) { if (dirY < 0) dirY *= 0.97; dirY += 0.02; }
      else if (dirY > -0.1) { dirY *= 0.99; dirY -= 0.01; }
      dirY = Math.max(-1, Math.min(1, dirY));
    }
    if (vx < W / 2) dirX = Math.max(0.1, Math.min(1, dirX));
    else dirX = Math.max(-1, Math.min(-0.1, dirX));
    if (itN === IT + 1) break;
  }
  console.log(`rolls consumed till it${IT + 1} head: ${p}`);
  console.log(`shaft#IT rows by column (predicate=${VANILLA_PRED ? 'VANILLA-full' : 'ENGINE-current'}):`);
  let tot = 0;
  for (const c of cols) { tot += c.rows; console.log(`  m=${c.m} rows=${c.rows} ${c.breakWhy}${c.breakAt ? '' : ''}`); }
  console.log(`total rows=${tot} -> rollDeltaVsCols=${tot * 2}`);
}, 120_000);


