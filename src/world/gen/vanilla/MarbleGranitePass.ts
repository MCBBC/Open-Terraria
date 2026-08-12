// 原版 pass 21 "Marble" / 22 "Granite" 移植(MarbleBiome.cs / GraniteBiome.cs)。
// 大理石:板格穹顶洞窟——宽 Next(80,150)/3×3 = 78-149 tile,高 39-57;
// 上半中空(墙 178)+下半实心大理石(367),边缘毛化。
// 花岗岩:200×200 岩浆区——大实心花岗岩体(368,墙 180)+ digTunnel 蜿蜒洞。
// 位置:cs:12830/12915 均匀矩形采样(n/num*(w-200)+100 起宽 (w-160或200)/num 的带内均匀掷点,
// y∈[rockLayer+20, h-220]),避开中部 45-55% 与冰雪/蘑菇/沙漠/彼此(BiomeTileCheck 半径 50 逐格,cs:10949)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { tileRunner, digTunnel } from './TileRunner';

const MARBLE = TILE_BY_KEY['v_367_marble_block']!;
const GRANITE = TILE_BY_KEY['v_368_granite_block']!;
const SNOW = TILE_BY_KEY['snow']!, ICE = TILE_BY_KEY['ice']!, THIN_ICE = TILE_BY_KEY['thin_ice']!;
const MUSHROOM_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const MUSHROOM_TREE = TILE_BY_KEY['v_72_mushroom_tree']!;
const SANDSTONE = TILE_BY_KEY['sandstone']!, HARDSAND = TILE_BY_KEY['hardened_sand']!;

/** 原版 WorldGenRange(Configuration.json "Count")取值(WorldGenRange.cs:GetRandom)。
 *  ScaleWith WorldArea → w*h/5040000;WorldWidth → w/4200;ScaleValue=(int)(scale*value) 截断。
 *  Marble/Granite Count 均为 Min 4 / Max 8(Marble=WorldArea、Granite=WorldWidth)。 */
function worldGenRangeCount(st: TileStore, rng: RNG, min: number, max: number, mode: 'area' | 'width'): number {
  const scale = mode === 'area' ? (st.w * st.h) / 5040000 : st.w / 4200;
  const lo = Math.max(1, Math.trunc(scale * min));
  const hi = Math.max(lo, Math.trunc(scale * max));
  return rng.int(lo, hi); // Next(scaledMin, scaledMax+1) 含两端
}

export function runMarbleGranitePass(st: TileStore, rng: RNG, gs: GenState): void {
  // cs:12802/12906:num = passConfig.Get<WorldGenRange>("Count").GetRandom(genRand)
  placeMarbleCaves(st, rng, gs, worldGenRangeCount(st, rng, 4, 8, 'area'));
  placeGraniteCaves(st, rng, gs, worldGenRangeCount(st, rng, 4, 8, 'width'));
}

/** cs:12830/12915 均匀矩形采样:RandomRectanglePoint(n/num*(w-200)+100, rockLayer+20,
 *  (w-160)/num 或 (w-200)/num, h-(rockLayer+40)-200)。基底 100(非 80),区间内均匀掷点;
 *  中部 45-55% 带改掷 beachDistance..w-beachDistance(cs:12839-12844);
 *  失败计数 num3 > w*10 放弃该带(cs:12875-12879)。 */
function pickOrigin(
  st: TileStore, rng: RNG, gs: GenState, n: number, count: number, bandWidth: number,
): { x: number; y: number } {
  const w = st.w, h = st.h, rl = Math.floor(gs.rockLevel);
  const x0 = Math.floor((n / count) * (w - 200)) + 100;
  let x = rng.int(x0, x0 + Math.trunc(bandWidth) - 1);
  while (x > w * 0.45 && x < w * 0.55) {
    x = rng.int(gs.beachDistance, w - gs.beachDistance - 1);
  }
  const yLo = rl + 20;
  const yHi = yLo + (h - (rl + 40) - 200) - 1;
  return { x, y: rng.int(yLo, Math.max(yLo, yHi)) };
}

function biomeClear(st: TileStore, x: number, y: number): boolean {
  // BiomeTileCheck（1456 cs:10949）1:1：半径 50、逐格（非步进采样）。
  // 拒绝 tile 集：368 花岗岩 / 367 大理石 / 147 雪 / 161 冰 / 162 薄冰 /
  // 70 蘑菇草 / 72 蘑菇树 / 396 沙岩 / 397 硬化沙（active 才判）；
  // 墙 187/216（地下沙漠腔/壳）无视 active 直接拒绝。
  const num = 50;
  for (let i = x - num; i <= x + num; i++) {
    for (let j = y - num; j <= y + num; j++) {
      if (!st.inBounds(i, j)) continue;
      const k = st.idx(i, j);
      if (st.flags[k]) {
        const t = st.type[k];
        if (t === GRANITE || t === MARBLE || t === SNOW || t === ICE || t === THIN_ICE
          || t === MUSHROOM_GRASS || t === MUSHROOM_TREE || t === SANDSTONE || t === HARDSAND) return false;
      }
      const wl = st.wall[k];
      if (wl === 187 || wl === 216) return false;
    }
  }
  return true;
}

/** 大理石穹顶洞窟(MarbleBiome.Place 主体流程简化)。
 *  带宽 num2 = (w-160)/num(cs:12805,大理石专用 160) */
function placeMarbleCaves(st: TileStore, rng: RNG, gs: GenState, count: number): void {
  let n = 0, fails = 0; // num4/num3
  while (n < count) {
    const { x, y } = pickOrigin(st, rng, gs, n, count, (st.w - 160) / count);
    fails++;
    if (biomeClear(st, x, y) && carveMarble(st, rng, x, y)) {
      n++;
      fails = 0;
    } else if (fails > st.w * 10) {
      count = n; // cs:12876 num = num4 后 num4++ → 结束
      n++;
      fails = 0;
    }
  }
}

function carveMarble(st: TileStore, rng: RNG, x: number, y: number): boolean {
  // 尺寸(MarbleBiome):宽 78-149,高 39-57
  const halfW = Math.floor((rng.int(80, 149) / 3) * 3 / 2);   // 39-74
  const fullH = Math.floor((rng.int(40, 59) / 3) * 3);         // 39-57
  const halfH = Math.floor(fullH / 2);
  const oy = Math.max(4, y - halfH);
  // 椭圆穹顶放置
  for (let dx = -halfW; dx <= halfW; dx++) {
    const chord = Math.floor(Math.sqrt(Math.max(0, 1 - (dx / halfW) ** 2)) * halfH);
    if (chord <= 0) continue;
    for (let dy = -chord; dy <= chord; dy++) {
      const px = x + dx, py = oy + halfH + dy;
      if (!st.inBounds(px, py)) continue;
      const i = st.idx(px, py);
      // 上半(含中线以上 40%)= 洞窟:墙 178,保留原 tile 但清实心块?原版腔内 ClearEverything
      if (dy < -chord * 0.2) {
        st.type[i] = 0; st.flags[i] = 0;
        st.wall[i] = 178;
      } else if (dy > chord * 0.15 || rng.next() < 0.4) {
        // 下半 = 实心大理石(矿石保留由 flag3 语义覆盖,这里直接覆盖)
        st.type[i] = MARBLE; st.flags[i] = 1;
        if (dy < chord * 0.3) st.wall[i] = 178;
      }
    }
    // 边缘毛化:两端列 50% 跳过
    if ((dx === -halfW || dx === halfW) && rng.next() < 0.5) continue;
  }
  return true;
}

/** 花岗岩岩浆体(GraniteBiome.Place 简化:200×200 区大实心体 + 蜿蜒洞)。
 *  带宽 num2 = (w-200)/num(cs:12911,花岗岩专用 200)。 */
function placeGraniteCaves(st: TileStore, rng: RNG, gs: GenState, count: number): void {
  let n = 0, fails = 0; // num4/num3
  while (n < count) {
    const { x, y } = pickOrigin(st, rng, gs, n, count, (st.w - 200) / count);
    fails++;
    if (biomeClear(st, x, y) && carveGranite(st, rng, gs, x, y)) {
      n++;
      fails = 0;
    } else if (fails > st.w * 10) {
      count = n; // cs:12966 与大理石同式放弃
      n++;
      fails = 0;
    }
  }
}

function carveGranite(st: TileStore, rng: RNG, gs: GenState, x: number, y: number): boolean {
  {
    // 大实心花岗岩体(半径 ~55-75),矿石保留:用 tileRunner(石族只换石头)
    const radius = rng.int(55, 75);
    tileRunner(st, rng, gs, x, y, { strength: radius * 2, steps: 30, type: GRANITE });
    // 墙 180 涂抹
    for (let dx = -radius; dx <= radius; dx += 2) {
      for (let dy = -radius; dy <= radius; dy += 2) {
        if (!st.inBounds(x + dx, y + dy)) continue;
        const i = st.idx(x + dx, y + dy);
        if (st.type[i] === GRANITE && dx * dx + dy * dy < radius * radius) st.wall[i] = 180;
      }
    }
    // 岩浆洞:2-3 条蜿蜒隧道穿体(深于 lavaLine-30 用岩浆)
    const deep = y > gs.lavaLine - 30;
    for (let k = 0; k < rng.int(2, 3); k++) {
      const dx = rng.int(-100, 100) * 0.01, dy = rng.int(-100, 100) * 0.01;
      digTunnel(st, rng, x + rng.int(-radius / 2, radius / 2), y + rng.int(-radius / 2, radius / 2),
        dx, dy, rng.int(30, 60), rng.int(3, 6), deep && rng.next() < 0.5);
    }
    // 孤块清理:3×3 实心邻 <3 的花岗岩移除
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (!st.inBounds(x + dx, y + dy)) continue;
        const i = st.idx(x + dx, y + dy);
        if (st.type[i] !== GRANITE || !st.flags[i]) continue;
        let n = 0;
        for (let ax = -1; ax <= 1; ax++) for (let ay = -1; ay <= 1; ay++) {
          const j = st.idx(x + dx + ax, y + dy + ay);
          if (st.inBounds(x + dx + ax, y + dy + ay) && st.flags[j]) n++;
        }
        if (n < 3) { st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 180; }
      }
    }
  }
  return true;
}
