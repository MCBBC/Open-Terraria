// IIII196 批一次性取证仪（源=_iii81m8 载入 + _iii195win 范式）：REMIX 尾段残槽邻域逐格对拍。
// 离线模式（免 worldgen）：读 SW_I81_SAVE 落盘的 JS 槽末全通道（base_*.bin）↔ x86 8 通道
// dump（G2 目录）逐格对拍 → diff 聚簇 → 每簇邻域双面 ASCII 图（x86|JS，symbol=vanilla sheet）。
// 用法：cd game && SW_I196NB=1 SW_I196_D=87 npx vitest run tools/_iii196nb.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I196NB === '1';
const D = Number(process.env.SW_I196_D ?? 87);
const JS_DIR = process.env.SW_I196_JS ?? '/tmp/iii196-out/slot87';
const G2 = process.env.SW_I81_G2 ?? `${process.env.HOME}/GoldenChains/golden-remix/dumps`;
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const NCELLS = Number(process.env.SW_I196_N ?? 6);
const HALF = Number(process.env.SW_I196_HALF ?? 14);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN ? it : it.skip)('iii196 offline neighborhood diff', () => {
  // ---- JS 槽末态（SW_I81_SAVE 落盘） ----
  const jr = (c: string) => readFileSync(`${JS_DIR}/base_${c}.bin`);
  const jType = new Uint16Array(jr('type').buffer, jr('type').byteOffset, jr('type').byteLength >> 1);
  const jFlags = jr('flags');
  const jWall = new Uint16Array(jr('wall').buffer, jr('wall').byteOffset, jr('wall').byteLength >> 1);
  const jHalf = jr('half'), jSlope = jr('slope');
  const hdr = JSON.parse(readFileSync(`${JS_DIR}/base_hdr.json`, 'utf8')) as { w: number; h: number };
  if (hdr.w !== W || hdr.h !== H) throw new Error(`hdr ${hdr.w}x${hdr.h} != ${W}x${H}`);

  // ---- x86 dump ----
  const names = [
    'Terrain', 'Dunes', 'Ocean_Sand', 'Sand_Patches', 'Tunnels', 'Shimmer', 'Cleanup', 'Structures',
    'Settle_Liquids', 'Clear_Sand_Water', 'Oasis', 'Beach_Surface_Decor', 'Slope_Smoothing',
    'Waterfall_Gates', 'Thin_Ice', 'Cave_Wall_Variation', 'Life_Crystals', 'Statues', 'Gems',
    'Moss_Grass', 'Lihzahrd_Temple', 'Jungle_Walls', 'Underground_Jungle_Trees', 'Floating_Island_Houses',
    'Quick_Cleanup', 'Pots', 'Underworld_Flows', 'Webs', 'Underworld', 'CorruptionAndCrimson', 'Lakes',
    'Slush', 'Dungeon', 'MountainCaveOpenings', 'BeachesAndOceanCleanup', 'Gems', 'OceanCaves', 'Shimmer',
    'DirtWallCleanup', 'Pyramids', 'DirtRockWallRunner', 'LivingTrees', 'LivingTreeWalls', 'DemonAndCrimsonAltars',
    'SurfaceWaterInJungle', 'LihzahrdTemple', 'Beehives', 'JungleShrines', 'Statues', 'UndergroundHousesAndBuriedChests',
    'SurfaceChests', 'ChestsInJungleShrines', 'UnderwaterChests', 'SpiderCaves',
  ];
  // 直接扫目录：找 087_ 前缀
  const pre = `${G2}/${String(D).padStart(3, '0')}_`;
  const dir = readFileSync ? G2 : '';
  void names; void dir;
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  const hit = readdirSync(G2).find((f) => f.startsWith(`${String(D).padStart(3, '0')}_`) && f.endsWith('.typ'));
  if (!hit) throw new Error(`no dump #${D} in ${G2}`);
  const nm = hit.slice(4, -4);
  const vpre = `${pre}${nm}`;
  const vType = le16(`${vpre}.typ`);
  const vAct = readFileSync(`${vpre}.act`);
  const vWall = le16(`${vpre}.wal`);
  const vHalf = readFileSync(`${vpre}.half`), vSlope = readFileSync(`${vpre}.slope`);

  // ---- diff 收集 ----
  const diffs: number[] = [];
  for (let i = 0; i < W * H; i++) {
    const va = vAct[i]!, ja = jFlags[i]! & 1;
    const vt = va ? vType[i]! : 0;
    const jt = ja ? (SHEET[jType[i]!] >= 0 ? SHEET[jType[i]!]! : 9999) : 0;
    if (va !== ja || vt !== jt) diffs.push(i);
  }
  console.log(`[#${D} ${nm}] diff cells=${diffs.length} first=(${diffs[0] % W},${(diffs[0] / W) | 0})`);

  // ---- 聚簇（曼哈顿距离 ≤40 合并） ----
  const clusters: number[][] = [];
  for (const i of diffs) {
    const cx = i % W, cy = (i / W) | 0;
    const cl = clusters.find((c) => {
      const px = c[0] % W, py = (c[0] / W) | 0;
      return Math.abs(px - cx) <= 40 && Math.abs(py - cy) <= 40;
    });
    if (cl) cl.push(i); else clusters.push([i]);
  }
  clusters.sort((a, b) => b.length - a.length);
  console.log(`clusters=${clusters.length} top sizes=${clusters.slice(0, 10).map((c) => `${c.length}@(${c[0] % W},${(c[0] / W) | 0})`).join(' ')}`);

  // ---- symbol 表 ----
  const SYM: Record<number, string> = {
    0: 'd', 1: 's', 2: 'g', 3: 'G', 5: 'T', 23: 'E', 25: 'e', 59: 'u', 60: 'J', 61: 'j',
    62: 'v', 69: 'h', 70: 'M', 71: 'm', 147: 'n', 161: 'i', 199: 'c', 203: 'S', 226: 'L',
    227: 'D', 233: 'p', 383: 'Y', 396: 'X', 397: 'H', 53: 'a', 112: 'A', 116: 'q', 234: 'Q',
  };
  const sym = (t: number, act: boolean, wall: number): string => {
    if (!act) return wall > 0 ? '-' : ' ';
    return SYM[t] ?? '?';
  };
  const win = (label: string, ci: number) => {
    const cx = ci % W, cy = (ci / W) | 0;
    const x0 = Math.max(0, cx - HALF), x1 = Math.min(W - 1, cx + HALF);
    const y0 = Math.max(0, cy - HALF), y1 = Math.min(H - 1, cy + HALF);
    console.log(`\n==== ${label} @(${cx},${cy}) 窗 x[${x0}..${x1}] y[${y0}..${y1}] ====`);
    for (let y = y0; y <= y1; y++) {
      let l = '', r = '';
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const va = vAct[i]! === 1, ja = (jFlags[i]! & 1) === 1;
        const vt = va ? vType[i]! : 0, jt = ja ? (SHEET[jType[i]!] >= 0 ? SHEET[jType[i]!]! : 9999) : 0;
        const diff = va !== ja || vt !== jt;
        l += sym(vt, va, vWall[i]!) + (diff ? '!' : ' ');
        r += sym(jt, ja, jWall[i]!) + (diff ? '!' : ' ');
      }
      console.log(`${String(y).padStart(4)} ${l} | ${r}`);
    }
    void jHalf; void jSlope; void vHalf; void vSlope; void jWall;
  };
  const nShow = Math.min(NCELLS, clusters.length);
  for (let k = 0; k < nShow; k++) {
    const c = clusters[k];
    void existsSync;
    win(`cluster#${k} n=${c.length}`, c[0]);
  }
  // 指定坐标数值窗（SW_I196_AT=x,y[,x2,y2...] 逗号分隔多中心;数值=vanilla sheet|inactive=.)
  const at = process.env.SW_I196_AT;
  if (at) {
    for (const pair of at.split(',')) {
      const [axs, ays] = pair.split(':').map(Number);
      const cx = axs, cy = ays;
      const x0 = Math.max(0, cx - HALF), x1 = Math.min(W - 1, cx + HALF);
      const y0 = Math.max(0, cy - HALF), y1 = Math.min(H - 1, cy + HALF);
      console.log(`\n==== RAW @(${cx},${cy}) x[${x0}..${x1}] y[${y0}..${y1}] sheet; inactive=.; w=wall>0; !=diff ====`);
      for (let y = y0; y <= y1; y++) {
        let l = '', r = '';
        for (let x = x0; x <= x1; x++) {
          const i = y * W + x;
          const va1 = vAct[i]! === 1, ja1 = (jFlags[i]! & 1) === 1;
          const vt1 = va1 ? vType[i]! : -1, jt1 = ja1 ? SHEET[jType[i]!]! : -1;
          const diff = va1 !== ja1 || vt1 !== jt1;
          l += (vt1 < 0 ? ' .'.padStart(4) : String(vt1).padStart(4)) + (vWall[i]! > 0 ? 'w' : ' ') + (diff ? '!' : ' ');
          r += (jt1 < 0 ? ' .'.padStart(4) : String(jt1).padStart(4)) + (jWall[i]! > 0 ? 'w' : ' ') + (diff ? '!' : ' ');
        }
        console.log(`${String(y).padStart(4)}: ${l} | ${r}`);
      }
    }
  }
});
