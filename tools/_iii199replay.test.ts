// IIII199 批一次性取证仪①：LivingTree 房 LATE 循环 C# 忠实离线重放（独立于 JS lt* 端口）。
// 动机（CLXXIV 移交）：藤蔓掷流失步 95 格——「hit∧ok=0 耗掷不落盘」盲区，写面对拍不可见。
// 方法：
//   1) 从 post 态（gold 033_Dungeon / js33-post）反演 LATE 入口态（去活性化 52/62/185/187
//      ——LATE 房环只激活惰性格 ⇒ 可逆；残型/墙/坡不参与环内读取判定）。
//   2) 在反演态上按 LivingTreeDungeonRoom.cs:111-179 + DU.cs:532-562 FirstSolid +
//      WorldGen.cs SolidTile2/SolidTileAllowBottomSlope/SolidTileAllowTopSlope/Place3x2/
//      PlaceSmallPile 逐句重放（vanilla sheet 域谓词,独立手译,不复用 JS lt*）。
//   3) 三向对账：重放写面 ≡ post 写面（反演自证）；重放台账 vs JS SW_I196LT 台账（js33
//      =端口行为；gold=原版行为）→ 首分歧掷位定罪。
// 用法：cd game && SW_I199REPLAY=1 npx vitest run tools/_iii199replay.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_I199REPLAY === '1';
const G2 = process.env.SW_I196_G2 ?? `${process.env.HOME}/GoldenChains/golden-ddual2`;
const JSPOST = process.env.SW_I199_JSPOST ?? '/tmp/iii199-out/js33-post';
const WVL = process.env.SW_I199_WVL ?? '/tmp/iii199-out/wvlines.txt';
const OUT = process.env.SW_I199_OUT ?? '/tmp/iii199-out';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const N = W * H;

// ── vanilla 生成期表（Main.cs SetWorldFlags 逐行提取,2026-09-05 1458）──
const SOLID = new Uint8Array(760);
[0,1,2,6,7,8,9,10,19,22,23,25,30,37,38,39,40,41,43,44,45,46,47,48,53,54,56,57,58,59,60,63,64,65,66,67,68,70,75,76,107,108,109,111,112,116,117,118,119,120,121,122,123,127,130,137,138,140,145,146,147,148,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,166,167,168,169,170,175,176,177,179,180,181,182,183,188,189,190,191,192,193,194,195,196,197,198,199,200,202,203,204,206,208,211,221,222,223,224,225,226,229,230,232,234,235,239,248,249,250,251,252,253,272,273,274,284,311,312,313,315,321,322,325,326,327,328,329,345,346,347,348,350,357,367,368,369,370,371,379,380,381,383,384,385,387,388,396,397,398,399,400,401,402,403,404,407,408,409,415,416,417,418,421,422,426,427,430,431,432,433,434,446,447,448,458,459,460,472,473,474,476,477,478,479,481,482,483,484,492,495,496,498,500,501,502,503,507,508,512,513,514,515,516,517,534,535,536,537,539,540,541,546,557,562,563,566,618,625,626,627,628,633,635,641,659,661,662,664,666,667,668,669,670,671,672,673,674,675,676,677,678,679,680,681,682,683,684,685,686,687,688,689,690,691,692,708,711,712,713,714,715,716,717,718,719,722,726,734,735,736,737,738,739,740,741,742,743,744,745,746,747,748,749,750].forEach((t) => { SOLID[t] = 1; });
const SOLIDTOP = new Uint8Array(760);
[14,16,18,19,87,88,101,114,134,239,275,276,277,278,279,280,281,285,286,296,297,298,299,309,310,339,358,359,361,362,363,364,376,380,391,392,393,394,405,413,414,427,469,532,533,538,542,544,550,551,553,554,555,556,558,559,582,599,600,601,602,603,604,605,606,607,608,609,610,611,612,619,629,632,640,643,644,645,710].forEach((t) => { SOLIDTOP[t] = 1; });
const PLATFORMS = (t: number): boolean => t === 19 || t === 427 || (t >= 435 && t <= 439);
const BOULDERS = (t: number): boolean => t === 138 || t === 484 || t === 664 || t === 665 || (t >= 711 && t <= 716);
const inWorld = (x: number, y: number, f = 0): boolean => x >= f && x < W - f && y >= f && y < H - f;

// internal→vanilla sheet 映射
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const r8 = (p: string): Uint8Array => { const b = readFileSync(p); return new Uint8Array(b.buffer, b.byteOffset, b.length); };
const r16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.byteLength >> 1); };

// ── 域状态（vanilla sheet 域统一）──
type Dom = {
  name: string;
  act: Uint8Array; typ: Uint16Array; wal: Uint16Array; half: Uint8Array; slope: Uint8Array;
  inact: Uint8Array; liq: Uint8Array; lava: Uint8Array; fX: Int32Array | null; fY: Int32Array | null;
};
function loadGold(): Dom {
  const base = `${G2}/033_Dungeon`;
  const typ = r16(`${base}.typ`), act = r8(`${base}.act`), wal = r16(`${base}.wal`);
  const half = r8(`${base}.half`), slope = r8(`${base}.slope`), inact = r8(`${base}.inact`);
  const liq = r8(`${base}.liq`), lty = r8(`${base}.lty`);
  const lava = new Uint8Array(N);
  for (let i = 0; i < N; i++) lava[i] = liq[i]! > 0 && lty[i]! === 1 ? 1 : 0;  // vanilla lty: 1=lava
  return { name: 'gold', act, typ, wal, half, slope, inact, liq, lava, fX: null, fY: null };
}
function loadJs(): Dom {
  const typI = r16(`${JSPOST}/type.bin`), flags = r8(`${JSPOST}/flags.bin`), wal = r16(`${JSPOST}/wall.bin`);
  const half = r8(`${JSPOST}/half.bin`), slope = r8(`${JSPOST}/slope.bin`), wire = r8(`${JSPOST}/wire.bin`);
  const liq = r8(`${JSPOST}/liquid.bin`), lty = r8(`${JSPOST}/liquidType.bin`), fX = r16(`${JSPOST}/frameX.bin`), fY = r16(`${JSPOST}/frameY.bin`);
  const typ = new Uint16Array(N), act = new Uint8Array(N), inact = new Uint8Array(N), lava = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    act[i] = flags[i]! & 1;
    typ[i] = act[i] ? (SHEET[typI[i]!] >= 0 ? SHEET[typI[i]!]! : 9999) : (SHEET[typI[i]!] >= 0 ? SHEET[typI[i]!]! : 9999);
    inact[i] = (wire[i]! >>> 5) & 1;
    lava[i] = liq[i]! > 0 && lty[i]! === 2 ? 1 : 0;  // JS LIQUID_TYPE: 2=LAVA
  }
  return { name: 'js', act, typ, wal, half, slope, inact, liq, lava, fX: Int32Array.from(fX), fY: Int32Array.from(fY) };
}

// ── C# 谓词（vanilla 域,WorldGen.cs 独立手译）──
function platProperTopFrame(fX: Int32Array | null, i: number): boolean | null {
  if (fX === null) return null;                        // 域无帧数据（gold dump 8ch）
  const num = Math.trunc(fX[i]! / 18);
  if ((num < 0 || num > 7) && (num < 12 || num > 16)) { if (num >= 25) return num <= 26; return false; }
  return true;
}
/** SolidTile2(int,int)（cs:71031-71046）。null 仅 OOB（生成期 Main.tile 全量分配）；
 *  世界内惰性格=Tile 对象 active=false ⇒ false。 */
function solidTile2(d: Dom, x: number, y: number): boolean | null {
  if (!inWorld(x, y)) return true;                     // Tilemap OOB→null→true
  const i = y * W + x;
  if (!d.act[i]) return false;                         // 世界内惰性格 ⇒ active()=false ⇒ false
  const t = d.typ[i]!;
  if (!SOLID[t]) return false;
  const topSlope = d.slope[i] === 1 || d.slope[i] === 2;
  if (!((PLATFORMS(t) && (d.half[i]! !== 0 || topSlope)) || d.slope[i] === 0)) return false;
  if (d.half[i] !== 0) return false;
  if (d.inact[i]) return false;
  return true;
}
/** SolidTileAllowBottomSlope（cs:70706-70726） */
function allowBottomSlope(d: Dom, x: number, y: number): boolean {
  if (!inWorld(x, y)) return true;
  const i = y * W + x;
  if (!d.act[i]) return false;
  const t = d.typ[i]!;
  if (!SOLID[t] && !SOLIDTOP[t]) return false;
  const topSlope = d.slope[i] === 1 || d.slope[i] === 2;
  if (topSlope) {
    if (!PLATFORMS(t)) return false;
    if (platProperTopFrame(d.fX, i) !== true) return false;   // 帧缺失域（gold）按 false 保守,由 frameMiss 计数暴露
  }
  if (d.half[i] !== 0) return false;
  if (d.inact[i]) return false;
  return true;
}
/** SolidTileAllowTopSlope（cs:70859-70875）。无 InWorld 早退：OOB→tile==null→true。 */
function allowTopSlope(d: Dom, x: number, y: number): boolean {
  if (!inWorld(x, y)) return true;
  const i = y * W + x;
  if (!d.act[i]) return false;
  const t = d.typ[i]!;
  if (!SOLID[t] && t !== 380) return false;
  const bottomSlope = d.slope[i] === 3 || d.slope[i] === 4;
  if (PLATFORMS(t)) { if (d.half[i] === 0) return false; }
  else if (bottomSlope) return false;
  if (d.inact[i]) return false;
  return true;
}
/** FirstSolid（DU.cs:532-562） */
function firstSolid(d: Dom, ceiling: boolean, px: number, py: number, L: number, T: number, R: number, B: number): { x: number; y: number } {
  let guard = W * 5;
  let cx = px, cy = py;
  do {
    guard--;
    if (guard <= 0) break;
    if (ceiling ? allowTopSlope(d, cx, cy) : allowBottomSlope(d, cx, cy)) return { x: cx, y: cy };
    cy = ceiling ? cy - 1 : cy + 1;
  } while (cy > 10 && cy < H - 10 && cx >= L && cx < R && cy >= T && cy < B);
  return { x: cx, y: cy };
}
function invalidForPiles(d: Dom, x: number, y: number): boolean {
  if (!inWorld(x, y, 2)) return false;
  const i = y * W + x;
  return d.act[i] === 1 && BOULDERS(d.typ[i]!);
}
/** Place3x2 default 支（cs:52533-52654,type=187）→ 写面+ok */
function place3x2(d: Dom, x: number, y: number, type: number, style: number): number[] {
  if (x < 5 || x > W - 5 || y < 5 || y > H - 5) return [];
  let flag2 = true;
  for (let i = x - 1; i < x + 2; i++) {
    for (let j = y - 1; j < y + 1; j++) {
      if (d.act[j * W + i]) flag2 = false;
    }
    if (invalidForPiles(d, i, y + 1) || solidTile2(d, i, y + 1) !== true) flag2 = false;
  }
  if (!flag2) return [];
  const wcells: number[] = [];
  for (let i = x - 1; i <= x + 1; i++) {
    for (let j = y - 1; j <= y; j++) {
      const k = j * W + i;
      d.act[k] = 1; d.typ[k] = type; d.half[k] = 0; d.slope[k] = 0;
      wcells.push(k);
    }
  }
  return wcells;
}
/** PlaceSmallPile（cs:47229-47291,type=185）→ 写面+ok */
function placeSmallPile(d: Dom, x: number, y: number, pileStyle: number, pileSize: number): number[] {
  const type = 185;
  if (d.lava[y * W + x]) return [];
  const wc: number[] = [];
  if (pileSize === 1) {
    let flag = solidTile2(d, x, y + 1) === true && solidTile2(d, x + 1, y + 1) === true && !d.act[y * W + x] && !d.act[y * W + x + 1];
    if (flag && (invalidForPiles(d, x, y + 1) || invalidForPiles(d, x + 1, y + 1))) flag = false;
    if (flag) {
      for (const xx of [x, x + 1]) {
        const k = y * W + xx;
        d.act[k] = 1; d.typ[k] = type; d.half[k] = 0; d.slope[k] = 0;
        wc.push(k);
      }
      return wc;
    }
    return [];
  }
  if (solidTile2(d, x, y + 1) === true && !d.act[y * W + x]) {
    const k = y * W + x;
    d.act[k] = 1; d.typ[k] = type; d.half[k] = 0; d.slope[k] = 0;
    wc.push(k);
    return wc;
  }
  return [];
}

// ── LATE 入口态反演：去活性化 {52,62,185,187} 活性格（窗口=box±40）──
const LATE_TYPES = new Set([52, 62, 185, 187]);
function invertLate(d: Dom, L: number, T: number, R: number, B: number): number[] {
  const removed: number[] = [];
  const wl = Math.max(0, L - 40), wr = Math.min(W - 1, R + 40);
  const wt = Math.max(0, T - 40), wb = Math.min(H - 1, B + 40);
  for (let y = wt; y <= wb; y++) {
    for (let x = wl; x <= wr; x++) {
      const i = y * W + x;
      if (d.act[i] && LATE_TYPES.has(d.typ[i]!)) {
        removed.push(i);
        d.act[i] = 0;
      }
    }
  }
  return removed;
}

// ── wvlines 解析 ─
type RoomDef = { seed: number; L: number; T: number; R: number; B: number; Bt: number; Ct: number; Wt: number; Pt: number; lines: string[] };
function parseRooms(): RoomDef[] {
  const rooms: RoomDef[] = [];
  let cur: RoomDef | null = null;
  for (const line of readFileSync(WVL, 'utf8').split('\n')) {
    if (line.startsWith('LT|')) {
      const m = /seed=(\d+)\|box=(\d+),(\d+),(\d+),(\d+)\|B=(\d+) C=(\d+) W=(\d+) P=(-?\d+)/.exec(line);
      if (!m) throw new Error(`bad LT line: ${line}`);
      cur = { seed: +m[1], L: +m[2], T: +m[3], R: +m[4], B: +m[5], Bt: +m[6], Ct: +m[7], Wt: +m[8], Pt: +m[9], lines: [] };
      rooms.push(cur);
    } else if (cur && (line.startsWith('P|i=') || line.startsWith('V|j='))) {
      cur.lines.push(line);
    }
  }
  return rooms;
}
type Att = { kind: 'P' | 'V'; idx: number; r?: string; fs?: string; hit?: boolean; b?: number; s?: number; n?: number; ok?: number; anchor?: string; w: number; run?: number };
function parseAtts(lines: string[]): Map<string, Att> {
  const out = new Map<string, Att>();
  for (const ln of lines) {
    const m = /^([PV])\|i?j?=?(\d+)\|/.exec(ln);
    if (!m) continue;
    const key = `${m[1]}${m[2]}`;
    const a: Att = out.get(key) ?? { kind: m[1] as 'P' | 'V', idx: +m[2], w: 0 };
    out.set(key, a);
    if (ln.includes('|r=')) { const mm = /\|r=(\d+),(\d+)\|fs=(\d+),(\d+)/.exec(ln); if (mm) { a.r = `${mm[1]},${mm[2]}`; a.fs = `${mm[3]},${mm[4]}`; } }
    if (ln.includes('|hit ')) a.hit = true;
    if (ln.includes('|b=187')) { a.b = 187; const mm = /b=187 s=(\d+) ok=(\d+)/.exec(ln); if (mm) { a.s = +mm[1]; a.ok = +mm[2]; } }
    if (ln.includes('|b=185')) { a.b = 185; const mm = /b=185 n=(\d+) st=(\d+) ok=(\d+)/.exec(ln); if (mm) { a.n = +mm[1]; a.s = +mm[2]; a.ok = +mm[3]; } }
    if (ln.includes('|anchor=')) { const mm = /anchor=(\d+),(\d+)/.exec(ln); if (mm) a.anchor = `${mm[1]},${mm[2]}`; }
    if (ln.includes('|w=')) a.w++;
  }
  return out;
}

// ── 重放：LivingTreeDungeonRoom.GenerateLateDungeonFeaturesInRoom（cs:111-179）──
type Ledger = string[];
function replay(d: Dom, rd: RoomDef): { log: Ledger; writes: number[] } {
  const log: Ledger = [];
  const writes: number[] = [];
  const ur = new UnifiedRandom(rd.seed);
  const { L, T, R, B, Wt: wallType, Ct: cracked, Bt: brick } = rd;
  // 堆簇 50 掷
  for (let i = 0; i < 50; i++) {
    let x = ur.nextIntRange(L + 1, R);
    let y = ur.nextIntRange(T + 1, B);
    const fs = firstSolid(d, false, x, y, L, T, R, B);
    log.push(`P|i=${i}|r=${x},${y}|fs=${fs.x},${fs.y}`);
    x = fs.x; y = fs.y - 1;
    if (!inWorld(x, y)) continue;
    const gi = y * W + x;
    if (d.act[gi] || d.wal[gi] !== wallType) continue;
    log.push(`P|i=${i}|hit a=${d.act[gi]} w=${d.wal[gi]}`);
    if (ur.nextInt(2) === 0) {
      const style = ur.nextIntRange(47, 50);
      // PlaceTile(187) 大门恒过（!tileSolid[187]）⇒ 序言预清+Place3x2+SquareTileFrame
      if (!d.act[gi]) { d.typ[gi] = 0; d.half[gi] = 0; d.slope[gi] = 0; }
      const wc = place3x2(d, x, y, 187, style);
      log.push(`P|i=${i}|b=187 s=${style} ok=${wc.length ? 1 : 0}`);
      if (wc.length) { writes.push(gi, ...wc); }
      continue;
    }
    const num = ur.nextInt(2);
    let pileStyle = 72;
    if (num === 1) pileStyle = ur.nextIntRange(59, 62);
    const wc = placeSmallPile(d, x, y, pileStyle, num);
    log.push(`P|i=${i}|b=185 n=${num} st=${pileStyle} ok=${wc.length ? 1 : 0}`);
    if (wc.length) { writes.push(gi, ...wc); }
  }
  // 藤蔓 10 掷
  for (let j = 0; j < 10; j++) {
    let x2 = ur.nextIntRange(L + 1, R);
    let y2 = ur.nextIntRange(T + 1, B);
    const fs = firstSolid(d, true, x2, y2, L, T, R, B);
    log.push(`V|j=${j}|r=${x2},${y2}|fs=${fs.x},${fs.y}`);
    x2 = fs.x; y2 = fs.y + 1;
    if (!inWorld(x2, y2)) continue;
    const t2 = y2 * W + x2;
    const t3 = (y2 - 1) * W + x2;
    if (d.act[t2] || d.wal[t2] !== wallType) continue;
    if (!d.act[t3] || d.typ[t3] !== cracked) continue;
    const vine = brick === 383 ? 62 : 52;
    log.push(`V|j=${j}|anchor=${x2},${y2}`);
    let run = ur.nextIntRange(3, 12);
    for (; run > 0; run--) {
      const k = y2 * W + x2;
      if (d.act[k]) break;
      // ClearTile()+active(true)+type=vine（ClearTile 不动 wall）
      d.slope[k] = 0; d.half[k] = 0; d.inact[k] = 0;
      d.act[k] = 1; d.typ[k] = vine;
      log.push(`V|j=${j}|w=${x2},${y2}`);
      writes.push(k);
      y2++;
    }
  }
  return { log, writes };
}

(RUN ? it : it.skip)('iii199 livingtree LATE replay', { timeout: 300_000 }, () => {
  const rooms = parseRooms();
  console.log(`rooms=${rooms.length}`);
  const report: string[] = [];
  for (const rd of rooms) {
    report.push(`=== room seed=${rd.seed} box=${rd.L},${rd.T},${rd.R},${rd.B} B=${rd.Bt} C=${rd.Ct} W=${rd.Wt} P=${rd.Pt}`);
    // ★peel：首差列窥探（fs 分歧诊断）——gold/js post 原态 + 反演标记
    for (const dom0 of [loadGold(), loadJs()] as const) {
      const col = dom0.name === 'gold' ? process.env.SW_I199_PEEKCOL_G : process.env.SW_I199_PEEKCOL_J;
      if (col) {
        const [px, y0, y1] = col.split(',').map(Number);
        const rows: string[] = [];
        for (let y = y0; y <= y1; y++) {
          const i = y * W + px;
          rows.push(`(${px},${y}) a${dom0.act[i]}t${dom0.typ[i]}w${dom0.wal[i]}h${dom0.half[i]}s${dom0.slope[i]}ia${dom0.inact[i]}l${dom0.liq[i]}`);
        }
        report.push(`  peek[${dom0.name}] col=${px} ${y0}..${y1}\n    ${rows.join('\n    ')}`);
      }
      const box = dom0.name === 'gold' ? process.env.SW_I199_PEEKBOX_G : process.env.SW_I199_PEEKBOX_J;
      if (box) {
        const [x0, y0, x1, y1] = box.split(',').map(Number);
        const rows: string[] = [];
        for (let y = y0; y <= y1; y++) {
          let row = '';
          for (let x = x0; x <= x1; x++) {
            const i = y * W + x;
            const ch = dom0.act[i] ? (dom0.typ[i] === 14 ? 'T' : dom0.typ[i] === 191 ? 'B' : dom0.typ[i] === 192 ? 'C' : dom0.typ[i] === 185 ? 'p' : dom0.typ[i] === 187 ? 'P' : dom0.typ[i] === 52 ? 'v' : dom0.typ[i] === 62 ? 'V' : dom0.typ[i] === 19 ? '=' : dom0.typ[i] === 4 ? 't' : dom0.typ[i] === 21 ? 'h' : '?') : (dom0.wal[i] === 244 ? '.' : ',');
            row += ch;
          }
          rows.push(`  y=${y} ${row}`);
        }
        report.push(`  peekbox[${dom0.name}] x=${x0}..${x1}\n${rows.join('\n')}`);
      }
      if (dom0.fX !== null && dom0.fY !== null && box) {
        const [x0, y0, x1, y1] = box.split(',').map(Number);
        const rows: string[] = [];
        for (let y = y0; y <= y1; y++) {
          const cells: string[] = [];
          for (let x = x0; x <= x1; x++) {
            const i = y * W + x;
            if (dom0.act[i] && dom0.typ[i] === (Number(process.env.SW_I199_FRAMETYP ?? 14))) cells.push(`(${x},${y})fx=${dom0.fX[i]}fy=${dom0.fY[i]}`);
          }
          if (cells.length) rows.push(cells.join(' '));
        }
        if (rows.length) report.push(`  t14frames[${dom0.name}]:\n    ${rows.join('\n    ')}`);
      }
    }
    const jsAtts = parseAtts(rd.lines);
    for (const dom of [loadGold(), loadJs()] as const) {
      const removed = invertLate(dom, rd.L, rd.T, rd.R, rd.B);
      const { log, writes } = replay(dom, rd);
      // 自证：重放激活集 ≡ 反演掉的那些格（同一批,值同型）
      const removedSet = new Set(removed);
      let rehit = 0, miss = 0;
      for (const k of writes) { if (removedSet.has(k)) rehit++; else miss++; }
      let uncovered = 0;
      const writeSet = new Set(writes);
      for (const k of removed) if (!writeSet.has(k)) uncovered++;
      // 台账 diff（重放 vs JS 实录）—— jslog 行尾 ` post=...` 仪装尾巴剥除
      const norm = (s: string): string => s.replace(/ post=\S+$/, '');
      let firstDiff = '';
      const n = Math.max(log.length, rd.lines.length);
      for (let i = 0; i < n; i++) {
        if (norm(log[i] ?? '') !== norm(rd.lines[i] ?? '')) { firstDiff = `line#${i}\n    replay: ${log[i] ?? '<eof>'}\n    jslog : ${rd.lines[i] ?? '<eof>'}`; break; }
      }
      const unc = removed.filter((k) => !writeSet.has(k)).map((k) => `(${k % W},${(k / W) | 0},t${dom.typ[k]})`).join(' ');
      report.push(`  [${dom.name}] removed=${removed.length} replayWrites=${writes.length} rehit=${rehit} extra=${miss} uncovered=${uncovered}${uncovered ? ` [${unc}]` : ''} logdiff=${firstDiff === '' ? 'NONE(全等)' : firstDiff}`);
      if (dom.name === 'gold') {
        // gold 重放台账全量落盘,供逐掷解码
        writeFileSync(`${OUT}/replay-gold-${rd.seed}.log`, log.join('\n') + '\n');
      } else {
        writeFileSync(`${OUT}/replay-js-${rd.seed}.log`, log.join('\n') + '\n');
      }
    }
  }
  writeFileSync(`${OUT}/replay-report.txt`, report.join('\n') + '\n');
  console.log(report.join('\n'));
});
