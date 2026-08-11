// 原版 JunglePass 移植(GameContent/Biomes/JunglePass.cs,1:1)。
// 起点 (jungleOriginX, (h+rockLayer)/2):三轮随机移动 + 泥 runner(带宝石 63/65/67),
// 巨型泥 runner(num2=400-600×scale,steps 10000,向上 -20)+ 地表隧道,
// 泥墙挖洞(简化)+ 收尾(泥簇/石囊/宝石)。mudWall 期间铺丛林天然墙 64。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { tileRunner, gp2Begin, gp2End, gp2Dump } from './TileRunner';

const MUD = TILE_BY_KEY['mud']!;
const GEMS = ['gem_sapphire', 'gem_ruby', 'gem_emerald', 'gem_topaz', 'gem_amethyst', 'gem_diamond'].map((k) => TILE_BY_KEY[k]!);

export function runJunglePass(st: TileStore, rng: RNG, gs: GenState): number {
  const GH1: string[] = [];
  const ghAt = (tag: string) => { const i = st.idx(3395, 315); GH1.push(`${tag}:t${st.type[i]}a${st.flags[i]}`); };
  const PT: string[] = [];
  const { w, h } = st;
  const scale = (w / 4200) * 1.5;
  const van = w / 4200;
  let x = gs.jungleX;
  let y = Math.floor((h + gs.rockLevel) / 2);
  let zeroX = 0, zeroY = 0;

  const applyRandomMovement = (xRange: number, yRange: number) => {
    x += rng.int(Math.floor(-xRange * scale), Math.floor(xRange * scale));
    y += rng.int(Math.floor(-yRange * scale), Math.floor(yRange * scale));
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

  ghAt('entry');
  applyRandomMovement(100, 100);
  zeroX += x; zeroY += y;
  placeFirstPassMud(3);
  placeGemsAt(0, 2); ghAt('r1');
  applyRandomMovement(250, 150);
  zeroX += x; zeroY += y;
  placeFirstPassMud(0);
  placeGemsAt(2, 2); ghAt('r2');
  const oldX = x, oldY = y;
  applyRandomMovement(400, 150);
  zeroX += x; zeroY += y;
  placeFirstPassMud(-3);
  placeGemsAt(4, 2); ghAt('r3');

  PT.push(`g3_t=${st.type[st.idx(3405, 308)]}a${st.flags[st.idx(3405, 308)]}`);
  // 巨型泥 runner:三次移动点的均值为中心
  const cx = Math.floor(zeroX / 3), cy = Math.floor(zeroY / 3);
  // 原版 Next((int)(400*ws), (int)(600*ws)) 上界开（曾闭区间多 1 档）
  const num2 = rng.int(Math.floor(400 * scale), Math.floor(600 * scale) - 1);
  const num3 = Math.floor(25 * scale);
  const i = Math.max(gs.beachLeftEnd + Math.floor(num2 / 2) + num3, Math.min(gs.beachRightStart - Math.floor(num2 / 2) - num3, cx));
  // JunglePass.cs:50-54：noYChange:true——vy=-20 保持原速直上；缺失时被钳到 ±1
  // （曾致泥柱矮、泥量大范围横向堆积，丛林地下形态与原版明显不同）
  gp2Begin();
  tileRunner(st, rng, gs, i, cy, { strength: num2, steps: 10000, type: MUD, speedY: -20, noYChange: true, mudWall: true });
  ghAt('big');
  gp2End();
  console.log('GP2DUMP ' + gp2Dump());
  console.log('GH1 ' + GH1.join(' '));
  // 泥柱中心记录给后续(丛林表面草化)
  (gs as any).jungleCoreX = i;
  const jungleXOut = generateTunnelToSurface(st, rng, gs, i, cy);
  PT.push(`big_t=${st.type[st.idx(3405, 308)]}a${st.flags[st.idx(3405, 308)]}`);
  generateHolesInMudWalls(st, rng, gs);
  PT.push(`holes_t=${st.type[st.idx(3405, 308)]}a${st.flags[st.idx(3405, 308)]}`);
  generateFinishingTouches(st, rng, gs, oldX, oldY, scale, van);
  console.log('PT ' + PT.join(' '));
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
          // 原版 KillTile：只 active(false) **保留 type**（幽灵语义）——清零会
          // 让后续拒绝采样（查 type==59）判定分叉
          st.flags[st.idx(x, y)] = 0;
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

/** 泥墙挖洞（cs:12503-12520 + MudWallRunner cs:77584-77663 1:1）：
 *  w/4 次：拒绝采样到墙 64/15 格后跑 MudWallRunner（TileRunner 形状的清墙游走）。
 *  曾是"简化随机走"自创实现——掷骰序列完全不同 */
function generateHolesInMudWalls(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const underworld = h - 200; // Main.UnderworldLayer（Main.cs:2863）
  const tries = Math.floor(w / 4);
  for (let n = 0; n < tries; n++) {
    let x = rng.int(20, w - 21);
    let y = rng.int(gs.worldSurface + 10, underworld - 1); // Next(wS+10, UnderworldLayer)
    while (!(st.wall[st.idx(x, y)] === 64 || st.wall[st.idx(x, y)] === 15)) {
      x = rng.int(20, w - 21);
      y = rng.int(gs.worldSurface + 10, underworld - 1);
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
  const L3: string[] = [];
  for (let n = 0; n <= 300 * scale; n++) {
    let i2 = oldX + rng.int(-Math.floor(600 * scale), Math.floor(600 * scale) - 1);
    let j2 = oldY + rng.int(-Math.floor(200 * scale), Math.floor(200 * scale) - 1);
    let tries = 1;
    if (n < 3) L3.push(`s${tries}@${i2},${j2}=${st.type[st.idx(i2, j2)]}`);
    while (!(i2 >= 1 && i2 < st.w - 1 && j2 >= 1 && j2 < st.h - 1 && st.type[st.idx(i2, j2)] === MUD)) {
      i2 = oldX + rng.int(-Math.floor(600 * scale), Math.floor(600 * scale) - 1);
      j2 = oldY + rng.int(-Math.floor(200 * scale), Math.floor(200 * scale) - 1);
      tries++;
      if (n < 3) L3.push(`s${tries}@${i2},${j2}=${st.type[st.idx(i2, j2)]}`);
    }
    if (n < 40) L3.push(`n${n}@${i2},${j2}t${tries}`);
    if (n < 3) L3.push(`E${n}pk${rng.vanilla.peek()}`);
    const sStr = rng.int(4, 9), sStp = rng.int(5, 29);
    if (n < 3) L3.push(`P${n}s${sStr}k${sStp}pk${rng.vanilla.peek()}`);
    tileRunner(st, rng, gs, i2, j2, { strength: sStr, steps: sStp, type: T.STONE });
    if (n < 3) L3.push(`X${n}pk${rng.vanilla.peek()}`);
    if (rng.next() * 4 < 1) {
      // ★原版掷序（cs:269-271）：type2(Next 63,69) 在实参求值**之前**求值 →
      // type → x偏移 → y偏移 → strength → steps（对象字面量会把 type 排到最后=流错位）
      const gtype = GEMS[rng.int(0, 5)];
      tileRunner(st, rng, gs,
        i2 + rng.int(-1, 1), j2 + rng.int(-1, 1),
        { strength: rng.int(3, 6), steps: rng.int(4, 7), type: gtype });
    }
  }
  console.log('L3LOG ' + L3.join(' '));
}
