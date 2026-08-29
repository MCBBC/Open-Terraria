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
  // ★IIIII48 勘误案底：CreateStartPoint 的 (1200+Main.rockLayer)/2 用的是 **Terrain
  //   尾段六格吸附后的 Main.rockLayer**（=worldSurface+(int)((rockHigh−ws)/6)*6，
  //   本链恰=769==rockLevel），不是 GenVars.rockLayer(745.8)。原实现正确，勿改。
  let x = gs.jungleX;
  let y = Math.floor((h + gs.rockLevel) / 2);
  let zeroX = 0, zeroY = 0;

  const applyRandomMovement = (xRange: number, yRange: number) => {
    // ★C# (int) 截断向零（JunglePass.cs:87 `Next((int)((double)(-xRange)*ws), …)`）：
    //   中尺寸 ws=2.2857… 时 -100×ws=-228.57 → (int)=-228，Math.floor 会得 -229
    //   （下界差 1 → 掷值偏差 → 胖泥 runner 起点移位 → 后续流位级联，丛林整体
    //   左移 ~200 列=深层 59↔1 十万格对调根因）。小尺寸 ws=1.5 积恰整数无感。
    x += rng.int(Math.trunc(-xRange * scale), Math.trunc(xRange * scale));
    y += rng.int(Math.trunc(-yRange * scale), Math.trunc(yRange * scale));
    y = Math.max(gs.rockLevel, Math.min(h, y)); // 原版 clamp 上界 = maxTilesY（H 非 H-1）
  };
  const placeFirstPassMud = (xSpeedScale: number) => {
    // 原版 Next((int)(250*ws), (int)(500*ws)) 上界开 → int(a, b-1)（曾多 1 档值）
    const str = rng.int(Math.floor(250 * scale), Math.floor(500 * scale) - 1);
    // 原版步数固定 50-150 不缩放(speedX=±3 → 漂移 ≤450;4200 宽的 10.7%)
    const stp = rng.int(50, 149);
    tileRunner(st, rng, gs, x, y, { strength: str, steps: stp, type: MUD, speedX: gs.dungeonSide * xSpeedScale, speedY: 0, mudWall: true });
  };
  const placeGemsAt = (baseGem: number, variants: number) => {
    // 原版 Next(-(int)(125*ws), (int)(125*ws)) 上界开 → int(a, b-1)。
    // 曾写成闭区间多 1 档：偏移 187 时 gem runner 落点差 1 → 巨型泥 runner
    // 扫描内出现 1 格骰偏移（值不同但总数自愈）→ 丛林 ~292 格写出差异。
    for (let n = 0; n < 6 * scale; n++) {
      tileRunner(st, rng, gs,
        x + rng.int(-Math.floor(125 * scale), Math.floor(125 * scale) - 1),
        y + rng.int(-Math.floor(125 * scale), Math.floor(125 * scale) - 1), {
          strength: rng.int(3, 6), steps: rng.int(3, 7),
          type: GEMS[baseGem + rng.int(0, variants - 1)],
        });
    }
  };

  applyRandomMovement(100, 100);
  zeroX += x; zeroY += y;
  placeFirstPassMud(3);
  placeGemsAt(0, 2);
  applyRandomMovement(250, 150);
  zeroX += x; zeroY += y;
  placeFirstPassMud(0);
  placeGemsAt(2, 2);
  const oldX = x, oldY = y;
  applyRandomMovement(400, 150);
  zeroX += x; zeroY += y;
  placeFirstPassMud(-3);
  placeGemsAt(4, 2);

  // 巨型泥 runner:三次移动点的均值为中心
  const cx = Math.floor(zeroX / 3), cy = Math.floor(zeroY / 3);
  // 原版 Next((int)(400*ws), (int)(600*ws)) 上界开（曾闭区间多 1 档）
  const num2 = rng.int(Math.floor(400 * scale), Math.floor(600 * scale) - 1);
  const num3 = Math.floor(25 * scale);
  const i = Math.max(gs.beachLeftEnd + Math.floor(num2 / 2) + num3, Math.min(gs.beachRightStart - Math.floor(num2 / 2) - num3, cx));
  if (typeof process !== 'undefined' && process.env.JUNGLE_TRACE) {
    console.log(`[JUNGLE_TRACE] scale=${scale} origin=(${gs.jungleX},${Math.floor((h + gs.rockLevel) / 2)}) mv=(${x - gs.jungleX}) zero=(${zeroX},${zeroY}) cx,cy=(${cx},${cy}) old=(${oldX},${oldY}) giant i=${i} str=${num2} beach=[${gs.beachLeftEnd},${gs.beachRightStart}]`);
  }
  // JunglePass.cs:50-54：noYChange:true——vy=-20 保持原速直上；缺失时被钳到 ±1
  // （曾致泥柱矮、泥量大范围横向堆积，丛林地下形态与原版明显不同）
  tileRunner(st, rng, gs, i, cy, { strength: num2, steps: 10000, type: MUD, speedY: -20, noYChange: true, mudWall: true });
  // （原 `(gs as any).jungleCoreX = i` 记录已删 2026-08-16：唯一消费者=vanillaBiomes 的
  //  自造「丛林表面泥化补偿块」，随该块一并退役；巨型 runner 的表面覆盖已由本函数
  //  1:1 保证（caves-checkpoint jungle/mudcaves 双种子全绿））
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
      // ★IIIII14（JunglePass.cs:129-132）：drunk 隧道头越过地表即停（flag=false，
      // 本迭代照常执行,下一轮 while 退出）——丛林不挖地表隧道
      if (gs.seedFlags.drunkWorld) running = false;
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
          // 原版 WorldGen.KillTile（cs:63559，worldgen 期）：活性格 active(false)
          // **且 type=0**（cs:63970 尾部；SquareTileFrame 的 Next(0,3) 在
          // !generatingWorld 门内不掷）；非活性格早退不动（TileRunner 挖空格的
          // 幽灵 type 得以保留）。曾误记"保留 type"→ 收尾拒绝采样（查 type==59
          // 会读到幽灵泥）与 typ 网双双分叉。
          const ii = st.idx(x, y);
          if (st.flags[ii]) { st.flags[ii] = 0; st.type[ii] = 0; }
        }
      }
    }
    count++;
    // 偶发分支洞穴
    if (count > 10 && rng.int(0, 49) < count) {
      count = 0;
      const side = rng.next() < 0.5 ? 2 : -2;   // 原版 num4 默认 -2、Next(2)==0 才 +2(JunglePass.cs:178-182),曾写反
      // ★mudWall=true(JunglePass.cs:54 置位、:59 才复位):隧道段整体在 mudWall 期,
      //   分支洞穴 TileRunner(type=-1)同样走 WorldGen.cs:77233 铺墙分支——每过
      //   `l>worldSurface && wall(k,l-1)!=2` 的格耗 1 颗 Next(3),过阈值再耗
      //   1 颗 Next(-10,11),铺丛林墙 15/64。漏传则隧道分支洞穴零掷骰零铺墙,
      //   流位整体前移(TileRunner.mudWall 分支已按原版实现,见 TileRunner.ts:119)
      tileRunner(st, rng, gs, Math.floor(px), Math.floor(py), {
        strength: rng.int(3, 19), steps: rng.int(10, 99), type: -1, speedX: side, mudWall: true,
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

/** 泥墙挖洞（cs:12503-12520 + MudWallRunner cs:77584-77663 1:1）：
 *  w/4 次：拒绝采样到墙 64/15 格后跑 MudWallRunner（TileRunner 形状的清墙游走）。
 *  曾是"简化随机走"自创实现——掷骰序列完全不同 */
function generateHolesInMudWalls(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const underworld = h - 200; // Main.UnderworldLayer（Main.cs:2863）
  // ★JunglePass.cs:220 用 **GenVars.worldSurface**（=Terrain 游走终值，TerrainPass.cs:235）
  // 而非 Main.worldSurface（=worldSurfaceHigh+25）——每样本掷骰数相同（恒 1 颗）但
  // y 区间不同 → 落点/清墙区域不同（流指纹不变、墙网分叉，拒绝次数随之分叉）。
  const holeLo = Math.trunc(gs.genWorldSurface) + 10;
  const tries = Math.floor(w / 4);
  for (let n = 0; n < tries; n++) {
    let x = rng.int(20, w - 21);
    let y = rng.int(holeLo, underworld - 1); // Next((int)GenVars.worldSurface+10, UnderworldLayer)
    while (!(st.wall[st.idx(x, y)] === 64 || st.wall[st.idx(x, y)] === 15)) {
      x = rng.int(20, w - 21);
      y = rng.int(holeLo, underworld - 1);
    }
    mudWallRunner(st, rng, gs, x, y);
  }
}

/** MudWallRunner（cs:77584）：衰减半径游走，菱形域内（y>worldSurface）清墙 */
function mudWallRunner(st: TileStore, rng: RNG, gs: GenState, i: number, j: number): void {
  const { w, h } = st;
  const num = rng.int(8, 20) + 0.0;          // Next(8,21)（double）
  const num2 = rng.int(8, 32) + 0.0;         // Next(8,33)（double）
  let num3 = num2;
  let px = i + 0.0, py = j + 0.0;
  let vx = rng.int(-10, 10) * 0.1, vy = rng.int(-10, 10) * 0.1;
  while (num > 0 && num3 > 0) {
    const num4 = num * (num3 / num2);
    num3 -= 1;
    let x0 = Math.trunc(px - num4 * 0.5), x1 = Math.trunc(px + num4 * 0.5);
    let y0 = Math.trunc(py - num4 * 0.5), y1 = Math.trunc(py + num4 * 0.5);
    if (x0 < 0) x0 = 0;
    if (x1 > w) x1 = w;
    if (y0 < 0) y0 = 0;
    if (y1 > h) y1 = h;
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        if (Math.abs(x - px) + Math.abs(y - py) < num * 0.5 * (1 + rng.int(-10, 10) * 0.015)
          && y > gs.worldSurface) {
          st.wall[st.idx(x, y)] = 0;
        }
      }
    }
    px += vx; py += vy;
    vx += rng.int(-10, 10) * 0.05;
    if (vx > 1) vx = 1;
    if (vx < -1) vx = -1;
    vy += rng.int(-10, 10) * 0.05;
    if (vy > 1) vy = 1;
    if (vy < -1) vy = -1;
  }
}

function generateFinishingTouches(st: TileStore, rng: RNG, gs: GenState, oldX: number, oldY: number, scale: number, van: number): void {
  void van;
  let x = oldX, y = oldY;
  // 大泥簇
  for (let n = 0; n <= 20 * scale; n++) {
    // 原版 Next((int)(-5*ws), (int)(6*ws))：上界 6 非 5（曾写对称 ±5）
    x += rng.int(-Math.floor(5 * scale), Math.floor(6 * scale) - 1);
    y += rng.int(-Math.floor(5 * scale), Math.floor(6 * scale) - 1);
    // 原版 300-500 步固定不缩放
    const str = rng.int(40, 99), stp = rng.int(300, 499);
    tileRunner(st, rng, gs, x, y, { strength: str, steps: stp, type: MUD });
  }
  // 洞穴(1/7 填液体)
  for (let n = 0; n <= 10 * scale; n++) {
    // Next(-A, A) 上界开 → int(-A, A-1)；拒绝采样无界 while（原版，无 40 次上限）
    let i2 = oldX + rng.int(-Math.floor(600 * scale), Math.floor(600 * scale) - 1);
    let j2 = oldY + rng.int(-Math.floor(200 * scale), Math.floor(200 * scale) - 1);
    while (!(i2 >= 1 && i2 < st.w - 1 && j2 >= 1 && j2 < st.h - 1 && st.type[st.idx(i2, j2)] === MUD)) {
      i2 = oldX + rng.int(-Math.floor(600 * scale), Math.floor(600 * scale) - 1);
      j2 = oldY + rng.int(-Math.floor(200 * scale), Math.floor(200 * scale) - 1);
    }
    for (let k = 0; k < 8 * scale; k++) {
      i2 += rng.int(-30, 30);
      j2 += rng.int(-30, 30);
      // ★原版掷序（cs:245-247）：type(Next 7) → strength(Next 10,20) → steps(Next 30,70)
      //（对象字面量曾按 strength/steps/type 求值 = 流错位）
      const cavType = rng.next() * 7 < 1 ? -2 : -1;
      const cavStr = rng.int(10, 19), cavStp = rng.int(30, 69);
      tileRunner(st, rng, gs, i2, j2, { strength: cavStr, steps: cavStp, type: cavType });
    }
  }
  // 泥内石囊 + 宝石
  for (let n = 0; n <= 300 * scale; n++) {
    let i2 = oldX + rng.int(-Math.floor(600 * scale), Math.floor(600 * scale) - 1);
    let j2 = oldY + rng.int(-Math.floor(200 * scale), Math.floor(200 * scale) - 1);
    while (!(i2 >= 1 && i2 < st.w - 1 && j2 >= 1 && j2 < st.h - 1 && st.type[st.idx(i2, j2)] === MUD)) {
      i2 = oldX + rng.int(-Math.floor(600 * scale), Math.floor(600 * scale) - 1);
      j2 = oldY + rng.int(-Math.floor(200 * scale), Math.floor(200 * scale) - 1);
    }
    tileRunner(st, rng, gs, i2, j2, { strength: rng.int(4, 9), steps: rng.int(5, 29), type: T.STONE });
    if (rng.next() * 4 < 1) {
      // ★原版掷序（cs:269-271）：type2(Next 63,69) 在实参求值**之前**求值 →
      // type → x偏移 → y偏移 → strength → steps（对象字面量会把 type 排到最后=流错位）
      const gtype = GEMS[rng.int(0, 5)];
      tileRunner(st, rng, gs,
        i2 + rng.int(-1, 1), j2 + rng.int(-1, 1),
        { strength: rng.int(3, 6), steps: rng.int(4, 7), type: gtype });
    }
  }
}
