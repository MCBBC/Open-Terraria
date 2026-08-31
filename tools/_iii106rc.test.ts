// IIII106b：oceanCave 离线逐句转写器（knob 定罪实验，III98 批 dd-domain-test 范式）。
// 内层用「roll 值流 jsrolls.txt」（n|v=原始 InternalSample int32）驱动——与引擎 RNG 解耦；
// K0-double 必须与引擎现值重放结果全等（自检），其后各 knob 隔离一个数值域假设对拍 G2#37。
import { it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const OUT = process.env.SW_OC_OUT ?? '/tmp/iii106-out';
const G2 = process.env.SW_OC_G2 ?? '/tmp/iii80-out/x86-jagged';
const W = 4200, H = 1200, N = W * H;
const CMP_IDX = Number(process.env.SW_OC_CMP ?? 37);
const ONLY = process.env.SW_OC_KNOB ?? '';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
const INT_OF_SHEET = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!INT_OF_SHEET.has(s)) INT_OF_SHEET.set(s, i); }
}
const SAND = INT_OF_SHEET.get(53)!;
const HSAND = INT_OF_SHEET.get(397)!;
const CAVITY = INT_OF_SHEET.get(264)!;
/** Main.tileSolidTop 族（平台类）：SolidTile 的排除项 */
const SOLID_TOP = new Set([19, 239, 380, 427, 435, 436, 437, 438, 439]);
const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
const DUNGEON_TILE = new Set([41, 43, 44, 677, 678, 679]);

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const u8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p).buffer.slice(0));

let DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) {
  const m = f.match(/^(\d{3})_(.+)\.typ$/);
  if (m) DUMPNAME.set(Number(m[1]), m[2]);
}
interface DumpCh { nm: string; xt: Uint16Array; xa: Uint8Array; xw: Uint16Array; xl: Uint8Array }
function loadDump(idx: number): DumpCh {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  return {
    nm: DUMPNAME.get(idx) ?? '?',
    xt: le16(`${pre}.typ`), xa: u8(`${pre}.act`), xw: le16(`${pre}.wal`), xl: u8(`${pre}.liq`),
  };
}

class RollSrc {
  private arr: number[];
  private p = 0;
  constructor(path: string) {
    this.arr = readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => Number(l.split('|')[1]));
  }
  get consumed(): number { return this.p; }
  private sample(): number { return this.arr[this.p++]! * 4.656612875245797e-10; }
  nd(): number { return this.sample(); }                              // NextDouble
  ni(max: number): number { return Math.trunc(this.sample() * max); } // Next(maxValue)
  nir(minV: number, maxV: number): number {                           // Next(min,max)
    return (Math.trunc(this.sample() * (maxV - minV)) + minV) | 0;
  }
}

interface Knobs {
  frPos?: boolean;        // Vector2D 字段按 float32 存储（val 与 val2 全部写入点）
  frLen?: boolean;        // Vector2D.Length() 结果 float32
  solidVanilla?: boolean; // 断轴谓词升格为 SolidTile 全口径（!tileSolidTop/half/slope/inActive）
}

const RUNRC = process.env.SW_OC_RC === '1';
const beachDistance = 380;

(RUNRC ? it : it.skip)('recon oceanCave knob sweep vs G2 dump#37', () => {

  const bt = le16(`${OUT}/base_type.bin`), ba = u8(`${OUT}/base_flags.bin`);
  const bw = le16(`${OUT}/base_wall.bin`), bl = u8(`${OUT}/base_liquid.bin`);
  const bhf = u8(`${OUT}/base_half.bin`), bsl = u8(`${OUT}/base_slope.bin`);
  // genSolid 生成期覆写（▶OceanCaves 时点快照，cap 模式落盘）
  let GSOLID: Map<number, boolean> | null = null;
  try {
    GSOLID = new Map(JSON.parse(readFileSync(`${OUT}/base_gensolid.json`, 'utf8')));
  } catch { /* 无快照则纯初值 */ }
  const genSolidT = (t: number): boolean => {
    const o = GSOLID?.get(t);
    return o !== undefined ? o : !!TILE_DEFS[t]?.solid;
  };
  const gsJ = JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'));
  const worldSurface = gsJ.worldSurface as number, rockLevel = gsJ.rockLevel as number;

  const target = loadDump(CMP_IDX);
  // 引擎轨迹基线（▶OceanCaves 单 pass 重放的 VT 记录）：按 itN 比对行走状态
  let engVT = new Map<number, string>();
  try {
    engVT = new Map(readFileSync(`${OUT}/oc-trace-js.log`, 'utf8').split('\n')
      .filter((l) => l.startsWith('VT|')).map((l) => {
        const [tag, itn] = l.split('|');
        return [Number(itn), `${tag}|${itn}|${l.split('|').slice(2).join('|')}`];
      }));
  } catch { /* 无轨迹文件 */ }

  function runRecon(kn: Knobs): { typ: Uint16Array; act: Uint8Array; wal: Uint16Array; liq: Uint8Array; treasures: Array<{ x: number; y: number }> } {
    const vtrace: string[] = [];
    const src = new RollSrc(`${OUT}/jsrolls.txt`);
    const typ = new Uint16Array(bt), act = new Uint8Array(ba), wal = new Uint16Array(bw), liq = new Uint8Array(bl);
    void bhf; void bsl;
    const idx = (x: number, y: number) => x + y * W;
    const badOcTile = (i: number): boolean => {
      const wv = wal[i]!;
      if (wv === 83 || wv === 3 || DUNGEON_WALLS.has(wv)) return true;
      const sh = SHEET[typ[i]!] ?? -1;
      if (sh === 203 || sh === 25 || DUNGEON_TILE.has(sh) || sh === 26 || sh === 31) return true;
      return false;
    };
    const isBreakSolid = (i: number): boolean => {
      // vanilla SolidTile(m,n)：active && tileSolid && !tileSolidTop && !halfBrick && slope==0 && !inActive
      if (!act[i]) return false;
      const t = typ[i]!;
      const sh = SHEET[t] ?? -1;
      if (kn.solidVanilla) {
        if (SOLID_TOP.has(sh)) return false;
        if (bhf[i]) return false;    // halfBrick
        if (bsl[i]) return false;    // slope != 0
      }
      return genSolidT(t);
    };

    let valX = 0, valY = 0, dirX = 0, dirY = 0;
    const P = (v: number) => kn.frPos ? Math.fround(v) : v;
    const distOf = (x: number, y: number): number => {
      const dx = Math.abs(x - valX), dy = Math.abs(y - valY);
      const len = Math.sqrt(dx * dx + dy * dy);
      return kn.frLen ? Math.fround(len) : len;
    };
    const treasures: Array<{ x: number; y: number }> = [];
    // OceanCaves 门：jagged(dungeonSide=-1,无 drunk/tenth/remix)→ 仅左侧；
    // ★IIIII46 流序：C# 短路 OR 首项 Next(maxValue) 先求值——oceanRoll 先消耗
    src.ni(3);
    // i==0 时 Next(55,95) 直接采用
    const iStart = src.nir(55, 95);
    let jStart = 0;
    while (jStart < H && !act[idx(iStart, jStart)]) jStart++;
    valX = iStart; valY = jStart;
    dirX = 0.25 + src.nd() * 0.25;
    dirY = 0.4 + src.nd() * 0.25;
    valX = P(valX); valY = P(valY); dirX = P(dirX); dirY = P(dirY);
    let radius = src.nir(17, 25);
    let life = src.nir(600, 800);
    const MIN_R = 4;
    let steep = true;
    let cur: { x: number; y: number } | null = null;
    let itN = 0;
    while (radius > MIN_R && life > 0) {
      let firstShaft = true, firstWater = true;
      if (valX > beachDistance - 50 && valX < W - beachDistance + 50) { radius *= 0.96; life *= 0.96; }
      const big = radius >= MIN_R + 2 && life >= 20;
      itN++;
      vtrace.push(`x=${valX}|y=${valY}|dx=${dirX}|dy=${dirY}|r=${radius}|life=${life}|big=${big ? 1 : 0}`);
      if (steep) { radius -= 0.01 + src.nd() * 0.01; life -= 0.5; }
      else { radius -= 0.02 + src.nd() * 0.02; life -= 1; }
      if (big) cur = { x: Math.floor(valX), y: Math.floor(valY) };
      const r3 = radius * 3;
      const x0 = Math.max(1, Math.trunc(valX - r3)), x1 = Math.min(W - 1, Math.trunc(valX + r3));
      const y0 = Math.max(1, Math.trunc(valY - r3)), y1 = Math.min(H - 1, Math.trunc(valY + r3));
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          const ti = idx(x, y);
          if (badOcTile(ti)) continue;
          const dist = distOf(x, y);
          if (big && dist < radius * 0.5 + 1) {
            typ[ti] = CAVITY; act[ti] = 0;
          } else if (dist < radius * 1.5 + 1 && typ[ti] !== CAVITY) {
            if (y < valY) {
              if ((dirX < 0 && x < valX) || (dirX > 0 && x > valX)) {
                if (dist < radius * 1.1 + 1) {
                  typ[ti] = HSAND;
                  if (liq[ti] === 255) wal[ti] = 0;
                } else if (typ[ti] !== HSAND) {
                  typ[ti] = SAND;
                }
              }
            } else if ((dirX < 0 && x < iStart) || (dirX > 0 && x > iStart)) {
              if (liq[ti] === 255) wal[ti] = 0;
              typ[ti] = SAND; act[ti] = 1;
              if (x === Math.trunc(valX) && firstShaft) {
                firstShaft = false;
                let depth = 50 + src.nir(0, 3), wide = 43 + src.nir(0, 3), len = 20 + src.nir(0, 3);
                let xa = x, xb = x + len;
                if (dirX < 0) { xa = x - len; xb = x; }
                if (life < 100) {
                  depth = Math.trunc(depth * (life / 100)); wide = Math.trunc(wide * (life / 100)); len = Math.trunc(len * (life / 100));
                }
                if (radius < MIN_R + 5) {
                  const kf = (radius - MIN_R) / 5;
                  depth = Math.trunc(depth * kf); wide = Math.trunc(wide * kf); len = Math.trunc(len * kf);
                }
                for (let sx = xa; sx <= xb; sx++) {
                  for (let sy = y; sy < y + depth && sx >= 0 && sx < W; sy++) {
                    const sti = idx(sx, sy);
                    if (sy >= H || badOcTile(sti)) break;
                    if (sy > y + wide) {
                      if (isBreakSolid(sti) && typ[sti] !== SAND) break;
                      typ[sti] = HSAND;
                    } else typ[sti] = SAND;
                    act[sti] = 1;
                    if (src.ni(3) === 0 && sx - 1 >= 0) { typ[idx(sx - 1, sy)] = SAND; act[idx(sx - 1, sy)] = 1; }
                    if (src.ni(3) === 0 && sx + 1 < W) { typ[idx(sx + 1, sy)] = SAND; act[idx(sx + 1, sy)] = 1; }
                  }
                }
              }
            }
          }
          if (dist < radius * 1.3 + 1 && y > jStart - 10) liq[ti] = 255;
          if (firstWater && x === Math.trunc(valX) && y > valY) {
            firstWater = false;
            for (let sx = x - 2; sx <= x + 2; sx++) {
              if (sx < 0 || sx >= W) continue;
              for (let sy = y; sy < y + 100; sy++) {
                if (sy >= H) break;
                const wi = idx(sx, sy);
                if (!badOcTile(wi)) liq[wi] = 255;
              }
            }
          }
        }
      }
      valX = P(valX + dirX); valY = P(valY + dirY);
      dirX = P(dirX + src.nd() * 0.1 - 0.05);
      dirY = P(dirY + src.nd() * 0.1 - 0.05);
      if (steep) {
        if (valY > (worldSurface * 2 + rockLevel) / 3 && valY > jStart + 30) steep = false;
        dirY = Math.max(0.35, Math.min(1, dirY));
      } else {
        if (valX < W / 2) { if (dirX < 0.5) dirX += 0.02; }
        else if (dirX > -0.5) dirX -= 0.02;
        if (!big) { if (dirY < 0) dirY *= 0.95; dirY += 0.04; }
        else if (valY < (worldSurface * 4 + rockLevel) / 5) { if (dirY < 0) dirY *= 0.97; dirY += 0.02; }
        else if (dirY > -0.1) { dirY *= 0.99; dirY -= 0.01; }
        dirY = Math.max(-1, Math.min(1, dirY));
      }
      if (valX < W / 2) dirX = Math.max(0.1, Math.min(1, dirX));
      else dirX = Math.max(-1, Math.min(-0.1, dirX));
    }
    if (cur) treasures.push(cur);
    // 与引擎轨迹逐迭代对账（K0 校准器）
    let firstVTmismatch = -1;
    const engArr: string[] = [...engVT.values()];
    for (let t = 0; t < vtrace.length && t < engArr.length; t++) {
      const eng = engArr[t].split('|').slice(2).join('|');
      if (vtrace[t] !== eng) { firstVTmismatch = t; break; }
    }
    console.log(`   [rolls] consumed=${src.consumed} iters=${vtrace.length} vtMismatchAt=${firstVTmismatch}` +
      (firstVTmismatch >= 0 ? `\n     recon: ${vtrace[firstVTmismatch]}\n     engTr: ${engArr[firstVTmismatch]?.split('|').slice(2).join('|')}` : ''));
    return { typ, act, wal, liq, treasures };
  }

  const variants: Array<[string, Knobs]> = [
    ['K0-double', {}],
    ['K1-frPos', { frPos: true }],
    ['K2-frLen', { frLen: true }],
    ['K3-frPos+frLen', { frPos: true, frLen: true }],
    ['K5-solidVanilla', { solidVanilla: true }],
    ['K6-frLen+solidVanilla', { frLen: true, solidVanilla: true }],
  ];
  const want = ONLY ? variants.filter(([n]) => n === ONLY) : variants;
  for (const [name, kb] of want) {
    const res = runRecon(kb);
    let dA = 0, dT = 0, dW = 0, dL = 0, dGh = 0, first = -1;
    const pair = new Map<string, number>();
    const markCat = (k: string) => pair.set(k, (pair.get(k) ?? 0) + 1);
    for (let i = 0; i < N; i++) {
      const va = target.xa[i], ja = res.act[i] ? 1 : 0;
      if (va !== ja) {
        if (first < 0) first = i;
        dA++; markCat(`A${va}>${ja}`);
        continue;
      }
      const vt = va ? target.xt[i] : 0;
      const jt = va ? (SHEET[res.typ[i]] ?? 9999) : 0;
      if (vt !== jt) {
        if (first < 0) first = i;
        dT++; markCat(`T${vt}>${jt}`);
        continue;
      }
      if (target.xw[i] !== res.wal[i]) {
        if (first < 0) first = i;
        dW++; continue;
      }
      if (target.xl[i] !== res.liq[i]) {
        if (first < 0) first = i;
        dL++; continue;
      }
      if (!va && target.xt[i] !== (res.typ[i] === 0 ? 0 : (SHEET[res.typ[i]] ?? 9999))) dGh++;
    }
    console.log(`[${name}] T=${dT} A=${dA} W=${dW} L=${dL} Gh=${dGh} first=${first < 0 ? 'ZERO-DIFF' : `(${first % W},${Math.floor(first / W)})`} treasure=[${res.treasures.map((t) => `(${t.x},${t.y})`).join(',')}]`);
    console.log(`     pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  }
  expect(true).toBe(true);
}, 900_000);
