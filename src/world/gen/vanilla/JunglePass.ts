// 原版 JunglePass 移植(GameContent/Biomes/JunglePass.cs,1:1)。
// 起点 (jungleOriginX, (h+rockLayer)/2):三轮随机移动 + 泥 runner(带宝石 63/65/67),
// 巨型泥 runner(num2=400-600×scale,steps 10000,向上 -20)+ 地表隧道,
// 泥墙挖洞(简化)+ 收尾(泥簇/石囊/宝石)。mudWall 期间铺丛林天然墙 64。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { tileRunner } from './TileRunner';

const MUD = TILE_BY_KEY['mud']!;
const GEMS = ['gem_sapphire', 'gem_ruby', 'gem_emerald', 'gem_topaz', 'gem_amethyst', 'gem_diamond'].map((k) => TILE_BY_KEY[k]!);

export function runJunglePass(st: TileStore, rng: RNG, gs: GenState): number {
  const { w, h } = st;
  const scale = (w / 4200) * 1.5;
  const van = w / 4200;
  let x = gs.jungleX;
  let y = Math.floor((h + gs.rockLevel) / 2);
  let zeroX = 0, zeroY = 0;

  const applyRandomMovement = (xRange: number, yRange: number) => {
    x += rng.int(Math.floor(-xRange * scale), Math.floor(xRange * scale));
    y += rng.int(Math.floor(-yRange * scale), Math.floor(yRange * scale));
    y = Math.max(gs.rockLevel, Math.min(h - 1, y));
  };
  const placeFirstPassMud = (xSpeedScale: number) => {
    const str = rng.int(Math.floor(250 * scale), Math.floor(500 * scale));
    // 原版步数固定 50-150 不缩放(speedX=±3 → 漂移 ≤450;4200 宽的 10.7%)
    const stp = rng.int(50, 149);
    tileRunner(st, rng, gs, x, y, { strength: str, steps: stp, type: MUD, speedX: gs.dungeonSide * xSpeedScale, speedY: 0, mudWall: true });
  };
  const placeGemsAt = (baseGem: number, variants: number) => {
    for (let n = 0; n < 6 * scale; n++) {
      tileRunner(st, rng, gs,
        x + rng.int(-Math.floor(125 * scale), Math.floor(125 * scale)),
        y + rng.int(-Math.floor(125 * scale), Math.floor(125 * scale)), {
          strength: rng.int(3, 6), steps: rng.int(3, 7),
          type: GEMS[baseGem + rng.int(0, variants - 1)],
        });
    }
  };

  applyRandomMovement(100, 100);
  zeroX += x; zeroY += y;
  placeFirstPassMud(3);
  placeGemsAt(0, 2); // 蓝宝石 63
  applyRandomMovement(250, 150);
  zeroX += x; zeroY += y;
  placeFirstPassMud(0);
  placeGemsAt(2, 2); // 祖母绿 65
  const oldX = x, oldY = y;
  applyRandomMovement(400, 150);
  zeroX += x; zeroY += y;
  placeFirstPassMud(-3);
  placeGemsAt(4, 2); // 黄玉 67

  // 巨型泥 runner:三次移动点的均值为中心
  const cx = Math.floor(zeroX / 3), cy = Math.floor(zeroY / 3);
  const num2 = rng.int(Math.floor(400 * scale), Math.floor(600 * scale));
  const num3 = Math.floor(25 * scale);
  const i = Math.max(gs.beachLeftEnd + Math.floor(num2 / 2) + num3, Math.min(gs.beachRightStart - Math.floor(num2 / 2) - num3, cx));
  // JunglePass.cs:50-54：noYChange:true——vy=-20 保持原速直上；缺失时被钳到 ±1
  // （曾致泥柱矮、泥量大范围横向堆积，丛林地下形态与原版明显不同）
  tileRunner(st, rng, gs, i, cy, { strength: num2, steps: 10000, type: MUD, speedY: -20, noYChange: true, mudWall: true });
  // 泥柱中心记录给后续(丛林表面草化)
  (gs as any).jungleCoreX = i;
  const jungleXOut = generateTunnelToSurface(st, rng, gs, i, cy);
  generateHolesInMudWalls(st, rng, gs);
  generateFinishingTouches(st, rng, gs, oldX, oldY, scale, van);
  return jungleXOut;
}

function generateTunnelToSurface(st: TileStore, rng: RNG, gs: GenState, i: number, j: number): number {
  let radius = rng.int(5, 10);
  let px = i + 0.0, py = j + 0.0;
  let vx = rng.int(-10, 10) * 0.1;
  let vy = rng.int(10, 19) * 0.1;
  let count = 0;
  let running = true;
  let jungleX = i;
  while (running) {
    if (py < gs.worldSurface) {
      const cx = Math.max(10, Math.min(st.w - 10, Math.floor(px)));
      const cy = Math.max(10, Math.min(st.h - 10, Math.floor(py)));
      // 隧道顶到达无墙无块的开放区即停(检查上方 1-5 格)
      let open = true;
      for (let d = 0; d <= 5; d++) {
        const ii = st.idx(cx, Math.max(5, cy - d));
        if (st.wall[ii] !== 0 || st.flags[ii]) { open = false; break; }
      }
      if (open) running = false;
    }
    jungleX = Math.floor(px);
    radius += rng.int(-20, 20) * 0.1;
    if (radius < 5) radius = 5;
    if (radius > 10) radius = 10;
    const x0 = Math.max(10, Math.min(st.w - 10, Math.floor(px - radius * 0.5)));
    const x1 = Math.max(10, Math.min(st.w - 10, Math.floor(px + radius * 0.5)));
    const y0 = Math.max(10, Math.min(st.h - 10, Math.floor(py - radius * 0.5)));
    const y1 = Math.max(10, Math.min(st.h - 10, Math.floor(py + radius * 0.5)));
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        if (Math.abs(x - px) + Math.abs(y - py) < radius * 0.5 * (1 + rng.int(-10, 10) * 0.015)) {
          st.setTileSilent(x, y, 0);
        }
      }
    }
    count++;
    // 偶发分支洞穴
    if (count > 10 && rng.int(0, 49) < count) {
      count = 0;
      const side = rng.next() < 0.5 ? -2 : 2;
      tileRunner(st, rng, gs, Math.floor(px), Math.floor(py), {
        strength: rng.int(3, 19), steps: rng.int(10, 99), type: -1, speedX: side,
      });
    }
    px += vx; py += vy;
    vy += rng.int(-10, 10) * 0.01;
    if (vy > 0) vy = 0;
    if (vy < -2) vy = -2;
    vx += rng.int(-10, 10) * 0.1;
    if (px < i - 200) vx += rng.int(5, 20) * 0.1;
    if (px > i + 200) vx -= rng.int(5, 20) * 0.1;
    if (vx > 1.5) vx = 1.5;
    if (vx < -1.5) vx = -1.5;
    if (py < -50 || py > st.h + 50) running = false; // 安全阀
  }
  return jungleX;
}

/** 泥墙挖洞(原版 MudWallRunner 的简化:在丛林墙上随机游走清出通道) */
function generateHolesInMudWalls(st: TileStore, rng: RNG, gs: GenState): void {
  const tries = Math.floor(st.w / 4);
  for (let n = 0; n < tries; n++) {
    let x = rng.int(20, st.w - 21);
    let y = rng.int(gs.worldSurface + 10, st.h - 150);
    let found = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const i = st.idx(x, y);
      if (st.wall[i] === 64 || st.wall[i] === 15) { found = true; break; }
      x = rng.int(20, st.w - 21);
      y = rng.int(gs.worldSurface + 10, st.h - 150);
    }
    if (!found) continue;
    // 简化随机走:清墙 30-80 步
    let steps = rng.int(30, 80);
    while (steps-- > 0) {
      if (!st.inBounds(x, y)) break;
      const i = st.idx(x, y);
      if (st.wall[i] === 64 || st.wall[i] === 15) st.wall[i] = 0;
      x += rng.int(-1, 1);
      y += rng.int(-1, 1);
    }
  }
}

function generateFinishingTouches(st: TileStore, rng: RNG, gs: GenState, oldX: number, oldY: number, scale: number, van: number): void {
  let x = oldX, y = oldY;
  // 大泥簇
  for (let n = 0; n <= 20 * scale; n++) {
    x += rng.int(Math.floor(-5 * scale), Math.floor(5 * scale));
    y += rng.int(Math.floor(-5 * scale), Math.floor(5 * scale));
    // 原版 300-500 步固定不缩放
    const str = rng.int(40, 99), stp = rng.int(300, 499);
    tileRunner(st, rng, gs, x, y, { strength: str, steps: stp, type: MUD });
  }
  // 洞穴(1/7 填液体)
  for (let n = 0; n <= 10 * scale; n++) {
    let i2 = oldX + rng.int(-Math.floor(600 * scale), Math.floor(600 * scale));
    let j2 = oldY + rng.int(-Math.floor(200 * scale), Math.floor(200 * scale));
    let found = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (i2 >= 1 && i2 < st.w - 1 && j2 >= 1 && j2 < st.h - 1 && st.type[st.idx(i2, j2)] === MUD) { found = true; break; }
      i2 = oldX + rng.int(-Math.floor(600 * scale), Math.floor(600 * scale));
      j2 = oldY + rng.int(-Math.floor(200 * scale), Math.floor(200 * scale));
    }
    if (!found) continue;
    for (let k = 0; k < 8 * scale; k++) {
      i2 += rng.int(-30, 30);
      j2 += rng.int(-30, 30);
      tileRunner(st, rng, gs, i2, j2, {
        strength: rng.int(10, 19), steps: rng.int(30, 69),
        type: rng.next() * 7 < 1 ? -2 : -1,
      });
    }
  }
  // 泥内石囊 + 宝石
  for (let n = 0; n <= 300 * scale; n++) {
    let i2 = oldX + rng.int(-Math.floor(600 * scale), Math.floor(600 * scale));
    let j2 = oldY + rng.int(-Math.floor(200 * scale), Math.floor(200 * scale));
    let found = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (i2 >= 1 && i2 < st.w - 1 && j2 >= 1 && j2 < st.h - 1 && st.type[st.idx(i2, j2)] === MUD) { found = true; break; }
      i2 = oldX + rng.int(-Math.floor(600 * scale), Math.floor(600 * scale));
      j2 = oldY + rng.int(-Math.floor(200 * scale), Math.floor(200 * scale));
    }
    if (!found) continue;
    tileRunner(st, rng, gs, i2, j2, { strength: rng.int(4, 9), steps: rng.int(5, 29), type: T.STONE });
    if (rng.next() * 4 < 1) {
      tileRunner(st, rng, gs,
        i2 + rng.int(-1, 1), j2 + rng.int(-1, 1),
        { strength: rng.int(3, 6), steps: rng.int(4, 7), type: GEMS[rng.int(0, 5)] });
    }
  }
}
