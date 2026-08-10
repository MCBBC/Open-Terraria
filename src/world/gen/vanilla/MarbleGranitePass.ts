// 原版 pass 21 "Marble" / 22 "Granite" 移植(MarbleBiome.cs / GraniteBiome.cs)。
// 大理石:板格穹顶洞窟——宽 Next(80,150)/3×3 = 78-149 tile,高 39-57;
// 上半中空(墙 178)+下半实心大理石(367),边缘毛化。
// 花岗岩:200×200 岩浆区——大实心花岗岩体(368,墙 180)+ digTunnel 蜿蜒洞。
// 位置:横向扫过,避开中部 45-55% 与冰雪/丛林/沙漠带(BiomeTileCheck 半径 50 简化为 30)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { tileRunner, digTunnel } from './TileRunner';

const MARBLE = TILE_BY_KEY['v_367_marble_block']!;
const GRANITE = TILE_BY_KEY['v_368_granite_block']!;
const SNOW = TILE_BY_KEY['snow']!, ICE = TILE_BY_KEY['ice']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const SANDSTONE = TILE_BY_KEY['sandstone']!, HARDSAND = TILE_BY_KEY['hardened_sand']!;

export function runMarbleGranitePass(st: TileStore, rng: RNG, gs: GenState): void {
  const count = Math.max(2, Math.floor(st.w / 700)); // C# (int)
  // 大理石带:xPad 80;花岗岩带:xPad 100
  placeMarbleCaves(st, rng, gs, count, 80);
  placeGraniteCaves(st, rng, gs, count, 100);
}

function biomeClear(st: TileStore, x: number, y: number): boolean {
  // BiomeTileCheck 简化:半径 30 内无冰雪/丛林/沙漠材料
  for (let dx = -30; dx <= 30; dx += 5) {
    for (let dy = -30; dy <= 30; dy += 5) {
      if (!st.inBounds(x + dx, y + dy)) continue;
      const t = st.type[st.idx(x + dx, y + dy)];
      if (t === SNOW || t === ICE || t === JUNGLE_GRASS || t === SANDSTONE || t === HARDSAND) return false;
    }
  }
  return true;
}

/** 大理石穹顶洞窟(MarbleBiome.Place 主体流程简化) */
function placeMarbleCaves(st: TileStore, rng: RNG, gs: GenState, count: number, xPad: number): void {
  for (let n = 0; n < count; n++) {
    // 横向扫过分布
    let x = Math.floor((n / count) * (st.w - 2 * xPad)) + xPad + rng.int(-20, 20);
    while (x > st.w * 0.45 && x < st.w * 0.55) x = rng.int(gs.beachLeftEnd, st.w - gs.beachLeftEnd - 1);
    x = Math.max(xPad, Math.min(st.w - xPad, x));
    const y = rng.int(gs.rockLevel + 20, Math.max(gs.rockLevel + 21, st.h - 240));
    if (!biomeClear(st, x, y)) continue;
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
  }
}

/** 花岗岩岩浆体(GraniteBiome.Place 简化:200×200 区大实心体 + 蜿蜒洞) */
function placeGraniteCaves(st: TileStore, rng: RNG, gs: GenState, count: number, xPad: number): void {
  for (let n = 0; n < count; n++) {
    let x = Math.floor((n / count) * (st.w - 2 * xPad)) + xPad + rng.int(-20, 20);
    while (x > st.w * 0.45 && x < st.w * 0.55) x = rng.int(gs.beachLeftEnd, st.w - gs.beachLeftEnd - 1);
    x = Math.max(xPad, Math.min(st.w - xPad, x));
    const y = rng.int(gs.rockLevel + 20, Math.max(gs.rockLevel + 21, st.h - 240));
    if (!biomeClear(st, x, y)) continue;
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
}
