// IIII99c 一次性：REMIX 地狱箱循环语义旋钮仿真仪（简化重写版）。
// 基座=dump058 byte-equal 快照；候选流=RNG 种子直接驱动 Next(20,W-20)+Next(H-200,H-50)；
// 接受判定按旋钮组合离线展开 —— 目标：找出哪组谓词变体恰能复现 x86 的 15 深箱体集。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I112UW === '1';
const BASE = process.env.SW_TM_BASE ?? '/tmp/iii104-out/base_UndergroundHousesAndBuriedChests';
const W = 4200, H = 1200;

function sheetMap(): Int32Array {
  const arr = new Int32Array(2000).fill(-1);
  for (const l of readFileSync('/tmp/iii112-out/scripts/sheetmap.tsv', 'utf8').split('\n')) {
    const m = l.trim().split(' ');
    if (m.length === 2 && m[0] !== '') arr[Number(m[0])] = Number(m[1]);
  }
  return arr;
}
const SH = sheetMap();

const PC_SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
const BOULDERS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
const PLATFORMS = new Set([19]);
const TABLES = new Set([14, 16, 18]);
const CUT = new Set([3, 24, 28, 32, 51, 52, 61, 62, 69, 71, 73, 74, 82, 83, 84, 110, 113, 115, 184, 201, 205, 231, 236, 254, 352, 382, 444, 454, 484, 485, 518, 519, 528, 529, 549, 636, 637, 638, 654, 655, 711,
  185, 165, 81, 186, 187, 227, 233, 324, 485, 530, 624]);
const idx = (x: number, y: number): number => y * W + x;

interface Sim { a: Uint8Array; t: Uint16Array; hf: Uint8Array; sl: Uint8Array; wa: Uint16Array; lq: Uint8Array; lt: Uint8Array; ir: Uint8Array }

function hydrate(): Sim {
  return {
    a: new Uint8Array(readFileSync(`${BASE}/base_flags.bin`)),
    t: new Uint16Array(readFileSync(`${BASE}/base_type.bin`).buffer),
    hf: new Uint8Array(readFileSync(`${BASE}/base_half.bin`)),
    sl: new Uint8Array(readFileSync(`${BASE}/base_slope.bin`)),
    wa: new Uint16Array(readFileSync(`${BASE}/base_wall.bin`).buffer),
    lq: new Uint8Array(readFileSync(`${BASE}/base_liquid.bin`)),
    lt: new Uint8Array(readFileSync(`${BASE}/base_liquidType.bin`)),
    ir: new Uint8Array(readFileSync(`${BASE}/base_wire.bin`)),
  };
}
interface Knobs {
  genSolidAll?: boolean;      // 落体判 active+非solidTop+!half+slope0+!inact（即按生成期全实心近似）
  pillarGate?: boolean;
  rejectBodyLava?: boolean;
  acceptType0Leg?: boolean;
  solidTopStopsFall?: boolean;
  yMinOffset?: number;        // 地狱循环 y 域下界 offset
  stopAtAnyActive?: boolean;  // 落体遇任意 active 即停
}
function simulate(s: Sim, target: number, k: Knobs): Array<{ i: number; gy: number }> {
  const rng = new RNG(1138154190);
  void k.genSolidAll;
  const out: Array<{ i: number; gy: number }> = [];
  let fails = 10000;
  for (let n = 0; n < target && fails > 0;) {
    const cx = rng.int(20, W - 21);
    const cy = rng.int(H - 200 + (k.yMinOffset ?? 0), H - 51);
    let ok = true;
    let gy = cy;
    for (; gy < H - 10; gy++) {
      const li = idx(cx, gy);
      if (s.lq[li] > 0 && s.lt[li] === 4) { ok = false; break; }
      if (s.a[li] && s.t[li] === 231) { ok = false; break; }
      if (k.pillarGate && cx > W * 0.37 && cx < W * 0.63 && gy > H - 250) { ok = false; break; }
      let hb = false;
      for (let dx = -2; dx <= 2 && !hb; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const xx = cx + dx, yy = gy + dy;
          if (xx < 100 || yy < 100 || xx >= W - 100 || yy >= H - 100) continue;
          const bi = idx(xx, yy);
          if (!s.a[bi]) continue;
          const sh = SH[s.t[bi]];
          if (BOULDERS.has(sh)) { hb = true; break; }
        }
      }
      if (hb) { ok = false; break; }
      const i = idx(cx, gy);
      const sh = s.a[i] ? SH[s.t[i]] : -9;
      const anySolid = s.a[i] && !PC_SOLID_TOP.has(sh)
        && !(k.solidInactBitIfSet !== false ? ((s.ir[i] >>> 5) & 1) : false)
        && s.hf[i] === 0 && s.sl[i] === 0;
      const stop = k.stopAtAnyActive ? !!s.a[i] : anySolid;
      if (stop || (k.solidTopStopsFall && PC_SOLID_TOP.has(sh))) break;
    }
    if (gy >= H - 10) ok = false;
    if (ok) {
      const topY = gy - 2;
      if (topY < 1) ok = false;
      else {
        for (let dx = -1; ok && dx <= 0; dx++) {
          for (let dy = 0; dy < 2; dy++) {
            const bx = cx + dx, by = topY + dy;
            const bi = idx(bx, by);
            if (bx < 5 || by < 5 || bx >= W - 5 || by >= H - 5) { ok = false; break; }
            if (k.rejectBodyLava !== false && s.lq[bi] > 0 && s.lt[bi] === 2) { ok = false; break; }
            if (s.a[bi]) {
              const sheet = SH[s.t[bi]];
              if (!CUT.has(sheet < 0 ? 9999 : sheet)) { ok = false; break; }
            }
          }
        }
        if (ok) {
          const legOKL = leg(s, cx - 1, gy, k), legOKR = leg(s, cx, gy, k);
          if (!(legOKL && legOKR)) ok = false;
        }
      }
    }
    if (ok) { out.push({ i: cx, gy }); n++; } else fails--;
  }
  return out;
}
function leg(s: Sim, x: number, y: number, k: Knobs): boolean {
  const i = idx(x, y);
  if (!s.a[i]) return false;
  const sheet = SH[s.t[i]] ?? -1;
  const b0 = s.hf[i] === 0 && s.sl[i] === 0;
  if (k.acceptType0Leg && s.t[i] === 0) return true;
  if (b0 && !PC_SOLID_TOP.has(sheet < 0 ? 9999 : sheet)) return true;
  if (PLATFORMS.has(sheet) && s.hf[i] === 0) return true;
  if (PC_SOLID_TOP.has(sheet < 0 ? 9999 : sheet)) return true;
  if (TABLES.has(sheet) && b0) return true;
  return false;
}

(RUN ? it : it.skip)('underworld loop knob sweep', () => {
  const s = hydrate();
  const x86set = new Set(['1653,1024', '3367,1027', '334,1046', '419,1052', '3742,1055', '955,1056', '338,1063', '3250,1063', '498,1064', '673,1069', '76,1072', '158,1083', '101,1096', '3183,1104', '3188,1117']);
  const combos: Array<[string, Knobs]> = [
    ['base', { pillarGate: true }],
    ['noPillar', {}],
    ['noPillarAcceptT0', { acceptType0Leg: true }],
    ['anyActiveStop', { stopAtAnyActive: true }],
    ['solidTopFalls', { solidTopStopsFall: true, pillarGate: true }],
    ['yMinUp', { yMinOffset: +50, pillarGate: true }],
    ['yMinDown', { yMinOffset: -50, pillarGate: true }],
  ];
  for (const [name, k] of combos) {
    const got = simulate(s, 15, { ...k });
    const keys = got.map(g => `${g.i},${g.gy}`);
    void keys;
    const anchors = got.map(g => `${g.i},${g.gy - 2}`);
    const hit = anchors.filter(a => x86set.has(a)).length;
    console.log(`[${name}] n=${got.length} match=${hit} :: ${anchors.join(' ')}`);
  }
}, 300_000);
