// 原版 pass 8-14 移植（1456 注册序对齐：RocksInDirt 11922 / DirtInRocks 11952 /
// Clay 11985 / DirtLayerCaves 12094 / RockLayerCaves 12135 / SurfaceCaves 12191；
// SmallHoles 12034 已拆到 MissingCavesPass——本文件不再重复执行）。
// 2026-08-11 种子等价重写：DirtLayer/RockLayer 恢复 TileRunner 直呼（原版就是直线
// runner，曾自创 digTunnel 蜿蜒改型=掷骰序列分叉）；Caverer 首掷顺序改回
// 「段数→方向」；首实心行上界用 GenVars raw double；计数一律 (int) 截断。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { tileRunner, digTunnel } from './TileRunner';

const DIRT = T.DIRT;
const CLAY = TILE_BY_KEY['clay']!;

/** pass 8-10:泥石混合 + 粘土（cs:11922-12033）。三段各自是独立 GenPass
 *  （RocksInDirt 11922 / DirtInRocks 11952 / Clay 11985）——RunPass 每 pass 前重播
 *  种子（WorldGenerator.cs:497），函数头与两处内部边界各 reseed 一次。 */
export function runRocksAndClayPass(st: TileStore, rng: RNG, gs: GenState,
  gp?: import('../GenProgress').GenProgress): void {
  const { w, h } = st;
  const area = w * h;
  rng.reseed(gs.seed); // ▶RocksInDirt cs:11922（pass 头）
  const run = (count: number, yMin: number, yMax: number, type: number, sMin: number, sMax: number, stMin: number, stMax: number) => {
    for (let n = 0; n < count; n++) {
      tileRunner(st, rng, gs, rng.int(0, w - 1), rng.int(Math.max(0, Math.floor(yMin)), Math.min(h - 1, Math.floor(yMax))), {
        strength: rng.int(sMin, sMax), steps: rng.int(stMin, stMax), type,
      });
    }
  };
  // Rocks In Dirt（cs:11922）：三档密度带，石嵌泥
  // ★进度锚：反编译在 gen4 域内有两处平台跃迁字面值 Set(0.34)(cs:11944)/Set(0.67)(cs:11956)
  //   ——按带间位置照录（语义=中带前/下带前各一跳）
  run(area * 0.00015, 0, gs.worldSurfaceLow, T.STONE, 4, 14, 5, 39);
  gp?.set(0.34);
  for (let n = 0; n < area * 0.0002; n++) { // 中带:起点上方 10 格须为实心否则重掷一次
    const i = rng.int(0, w - 1);
    let j = rng.int(gs.worldSurfaceLow, gs.worldSurfaceHigh);
    if (!st.flags[st.idx(i, Math.max(0, j - 10))]) j = rng.int(gs.worldSurfaceLow, gs.worldSurfaceHigh);
    tileRunner(st, rng, gs, i, j, { strength: rng.int(4, 9), steps: rng.int(5, 29), type: T.STONE });
  }
  gp?.set(0.67);
  run(area * 0.0045, gs.worldSurfaceHigh, gs.rockLevelHigh, T.STONE, 2, 6, 2, 22);
  rng.reseed(gs.seed); gp?.beginVan('Dirt In Rocks'); // ▶DirtInRocks cs:11952（内部 pass 边界）
  // Dirt In Rocks（cs:11952）：泥嵌石
  run(area * 0.005, gs.rockLevelLow, h, DIRT, 2, 5, 2, 39);
  // ★IIIII43 REMIX（1457 cs:11981-11996）：**地下泥↔石全域互换**——每列掷一次
  //   Next(-1,3) 定起始行（(int)worldSurface+该值），向下把 active 的 0↔1 互换。
  if (!!gs.seedFlags.remix) {
    for (let x = 0; x < w; x++) {
      // ★rng.int(-1,2)=Next(-1,3) 双闭——曾误用 nextIntRange(-1,2)=Next(-1,2) 三值，
      //   起始行分布 4 值均匀被截成 3 值（mile8 #008 T=2018 的真凶）
      const k0 = Math.max(0, gs.worldSurface + rng.int(-1, 2));
      for (let y = k0; y < h; y++) {
        const i2 = st.idx(x, y);
        if (!st.flags[i2]) continue;
        const t2b = st.type[i2];
        if (t2b === DIRT) st.type[i2] = T.STONE;
        else if (t2b === T.STONE) st.type[i2] = DIRT;
      }
    }
  }
  // Clay（cs:11985）：三带 + 表层粘土清除。
  // ★计数 (int) 截断（cs:11990/11997/12009）：area*2e-5=100.8 → 100 次，
  //  此前浮点上界多跑 1 发 runner → 其后 RNG 流永久漂移
  rng.reseed(gs.seed); gp?.beginVan('Clay'); // ▶Clay cs:11985（内部 pass 边界）
  run(Math.trunc(area * 0.00002), 0, gs.worldSurfaceLow - 1, CLAY, 4, 13, 10, 49);
  gp?.set(0.25);
  if (!!gs.seedFlags.remix) {
    // ★IIIII43 REMIX（1457 cs:12006-12012）：粘土主带替换为深域大 runner 单循环
    //   （数量 area*7e-05；y∈[(int)GenVars.rockLayer-25, maxTilesY-350)；8-15/5-50）
    //   ——注意下界是 **GenVars.rockLayer（游走终值 raw double 截断，≠Main.rockLayer）**；
    //   域上界为右开（Next 上界不取到），骰序 x→y→str→stp。
    const count = Math.trunc(area * 7e-5);
    const gy0 = Math.max(0, Math.floor(gs.genRockLayer) - 25);
    for (let n = 0; n < count; n++) {
      gp?.set3(n / count, 0.25, 1);   // 进度锚（main band 占窗 25%..100%）
      const rx = rng.nextIntRange(0, w);
      const ry = rng.nextIntRange(gy0, h - 350);
      tileRunner(st, rng, gs, rx, ry, {
        strength: rng.nextIntRange(8, 15), steps: rng.nextIntRange(5, 50), type: CLAY,
      });
    }
  } else {
    run(Math.trunc(area * 0.00005), gs.worldSurfaceLow, gs.worldSurfaceHigh, CLAY, 8, 13, 15, 44);
    run(Math.trunc(area * 0.00002), gs.worldSurfaceHigh, gs.rockLevelHigh, CLAY, 8, 14, 5, 49);
  }
  // 表层粘土清除（cs:12023-12025）：type=0（原版 0=泥土）保持 active——转泥而非挖空
  for (let x = 5; x < w - 5; x++) {
    for (let y = 1; y < gs.worldSurface - 1; y++) {
      if (!st.flags[st.idx(x, y)]) continue;
      for (let y2 = y; y2 < y + 5; y2++) {
        if (y2 < h && st.get(x, y2) === CLAY) st.type[st.idx(x, y2)] = DIRT;
      }
      break;
    }
  }
}

/** pass 12-14:洞穴（DirtLayer/RockLayer/Surface；SmallHoles 已在 MissingCavesPass）。
 *  三段各自是独立 GenPass（12094/12135/12191）——RunPass 每 pass 前重播种子，
 *  函数头与两处内部边界各 reseed 一次。 */
export function runCavesPass(st: TileStore, rng: RNG, gs: GenState,
  gp?: import('../GenProgress').GenProgress): void {
  const { w, h } = st;
  const area = w * h;
  const avoidBeach = 340; // smallHolesBeachAvoidance = beachSandRandomCenter(320)+20
  rng.reseed(gs.seed); // ▶DirtLayerCaves cs:12094（pass 头）
  // Dirt Layer Caves（cs:12094-12134）：(int)(area*3e-5) 次；拒绝判定第一子句用
  // GenVars.worldSurfaceHigh raw double；中部 45-55% 为闭区间 >= <=
  {
    let num = Math.trunc(area * 0.00003);
    // ★IIIII43 REMIX（1457 cs:12118-12120）：DirtLayer 洞穴数量 ×2
    if (!!gs.seedFlags.remix) num = Math.trunc(num * 2);
    for (let i = 0; i < num; i++) {
      gp?.set(i / num);   // ≡ cs:12050-12056 逐轮 Set（gen7 域内）
      const type = rng.nextInt(6) === 0 ? -2 : -1;
      let num2 = rng.nextIntRange(0, w);
      let num3 = rng.nextIntRange(gs.worldSurfaceLow, gs.rockLevelHigh + 1);
      while (((num2 < avoidBeach || num2 > w - avoidBeach) && num3 < gs.genWorldSurfaceHigh)
        || (num2 >= w * 0.45 && num2 <= w * 0.55 && num3 < gs.worldSurface)) {
        num2 = rng.nextIntRange(0, w);
        num3 = rng.nextIntRange(gs.worldSurfaceLow, gs.rockLevelHigh + 1);
      }
      const num4b = rng.nextIntRange(5, 15);
      const num5b = rng.nextIntRange(30, 200);
      // ★IIIII43 REMIX（1457 cs:12137-12140）：泥层洞穴强度 ×1.1 / 步长 ×1.9（int 截断）
      const remixDL = !!gs.seedFlags.remix;
      tileRunner(st, rng, gs, num2, num3, {
        strength: remixDL ? Math.trunc(num4b * 1.1) : num4b,
        steps: remixDL ? Math.trunc(num5b * 1.9) : num5b,
        type,
      });
    }
  }
  // Rock Layer Caves（cs:12135-12165）：掷序 type→strength→steps→x→y（曾错位+改 digTunnel）
  rng.reseed(gs.seed); gp?.beginVan('Rock Layer Caves'); // ▶RockLayerCaves cs:12135（内部 pass 边界;★IIIII174b 补锚标签=mile8 dump 011_Dirt_Layer_Caves 窗,前值▶cs:12135 无名未接线）
  {
    let num = Math.trunc(area * 0.00013);
    // ★IIIII43 REMIX（1457 cs:12152-12154）：主循环数量 ×1.1
    if (!!gs.seedFlags.remix) num = Math.trunc(num * 1.1);
    for (let i = 0; i < num; i++) {
      gp?.set(i / num);   // ≡ cs:12110-12120 逐轮 Set（gen8 域内）
      const type = rng.nextInt(10) === 0 ? -2 : -1;
      let num2 = rng.nextIntRange(6, 20);
      let num3 = rng.nextIntRange(50, 300);
      // ★IIIII43 REMIX（cs:12160-12164）：石层洞穴折减 ×0.7/×0.7
      if (!!gs.seedFlags.remix) {
        num2 = Math.trunc(num2 * 0.7);
        num3 = Math.trunc(num3 * 0.7);
      }
      tileRunner(st, rng, gs, rng.nextIntRange(0, w), rng.nextIntRange(gs.rockLevelHigh, h), {
        strength: num2, steps: num3, type,
      });
    }
    // ★IIIII43 REMIX（1458 cs:12214-12238）：附加双发水平洞穴环——数量 area*0.00013*0.4，
    //   每轮 type→str→steps→speedX→speedY→x,y，随后正/负速度两发 noYChange runner
    //   （先掷初速再覆写，与主循环同构）。
    //   ★IIIII48 定罪修复（vs rig p12 全窗逐样本对拍+dump 字节比对）：四处上界曾把
    //   C# 半开界直译成「闭区间注释−1」——Next(7,26)/Next(50,200)/Next(100,221)/
    //   Next(-10,11)。偏位不改变掷耗计数（raw 流前缀仍逐位相等），但改变几何 ⇒
    //   挖蚀域全体偏差、总耗骰 −476k（mile8 #012 首差根因）。闭区间语义一律改用
    //   rng.int(a,b)=Next(a,b+1)。
    if (!!gs.seedFlags.remix) {
      const count2 = Math.trunc(area * 0.00013 * 0.4);
      for (let j = 0; j < count2; j++) {
        if (gs.rockLevelHigh <= h) {
          const type2 = rng.nextInt(10) === 0 ? -2 : -1;
          const s2b = rng.int(7, 25);          // Next(7,26)：str ∈[7,25]
          const stp = rng.int(50, 199);        // Next(50,200)：steps ∈[50,199]
          const spX = rng.int(100, 220) * 0.1; // Next(100,221)*0.1：∈[10.0,22.0]
          const spY = rng.int(-10, 10) * 0.02; // Next(-10,11)*0.02：∈[-0.20,+0.20]
          const x2 = rng.nextIntRange(0, w);
          const y2 = rng.nextIntRange(gs.rockLevelHigh, h);
          tileRunner(st, rng, gs, x2, y2, { strength: s2b, steps: stp, type: type2, speedX: spX, speedY: spY, noYChange: true });
          tileRunner(st, rng, gs, x2, y2, { strength: s2b, steps: stp, type: type2, speedX: -spX, speedY: -spY, noYChange: true });
        }
      }
    }
  }
  // Surface Caves（cs:12191-12300）：五组地表入口
  rng.reseed(gs.seed); gp?.beginVan('Surface Caves'); // ▶SurfaceCaves cs:12191（内部 pass 边界；分段值域 .0/.2/.4/.6/.8→1 锚点即组间;★IIIII174b 补锚标签=mile8 dump 012_Rock_Layer_Caves 窗,前值▶cs:12191 无名未接线）
  const beachL = gs.beachLeftEnd + 20, beachR = gs.beachRightStart - 20;
  /** 14a-14d 骨架：拒绝采样（无界 while）+ 首实心行（上界 GenVars.worldSurfaceHigh
   *  raw double；找不到则整轮跳过不掷 runner 骰——原版 for-break 语义） */
  const surfaceCave = (count: number, lo: number, hi: number, runners: Array<(x: number, y: number) => void>) => {
    for (let n = 0; n < count; n++) {
      let x = rng.nextIntRange(0, w);
      while ((x > w * lo && x < w * hi) || x < beachL || x > beachR) x = rng.nextIntRange(0, w);
      let sy = -1;
      for (let y = 0; y < gs.genWorldSurfaceHigh && y < h; y++) {
        if (st.flags[st.idx(x, y)]) { sy = y; break; }
      }
      if (sy < 0) continue;
      for (const r of runners) r(x, sy);
    }
  };
  // ★IIIII43 REMIX（1457 cs:12271-12279）：14a/14b/14c 三组数量 ×3（(int)(w*k)*3）
  const scMul = !!gs.seedFlags.remix ? 3 : 1;
  // 14a 细入口（cs:12205-12218）
  gp?.set(0);
  surfaceCave(Math.trunc(w * 0.002) * scMul, 0.45, 0.55, [(x, y) => {
    tileRunner(st, rng, gs, x, y, { strength: rng.nextIntRange(3, 6), steps: rng.nextIntRange(5, 50), type: -1, speedX: rng.nextIntRange(-10, 11) * 0.1, speedY: 1 });
  }]);
  // 14b 中入口（cs:12227-12238）
  gp?.set(0.2);   // ≡ cs:12234 平台锚（组间跃迁 1/4）
  surfaceCave(Math.trunc(w * 0.0007) * scMul, 0.43, 0.57, [(x, y) => {
    tileRunner(st, rng, gs, x, y, { strength: rng.nextIntRange(10, 15), steps: rng.nextIntRange(50, 130), type: -1, speedX: rng.nextIntRange(-10, 11) * 0.1, speedY: 2 });
  }]);
  // 14c 大竖井三连（cs:12241-12261）
  gp?.set(0.4);   // ≡ cs:12252 平台锚（组间跃迁 2/4）
  surfaceCave(Math.trunc(w * 0.0003) * scMul, 0.40, 0.60, [(x, y) => {
    tileRunner(st, rng, gs, x, y, { strength: rng.nextIntRange(12, 25), steps: rng.nextIntRange(150, 500), type: -1, speedX: rng.nextIntRange(-10, 11) * 0.1, speedY: 4 });
    tileRunner(st, rng, gs, x, y, { strength: rng.nextIntRange(8, 17), steps: rng.nextIntRange(60, 200), type: -1, speedX: rng.nextIntRange(-10, 11) * 0.1, speedY: 2 });
    tileRunner(st, rng, gs, x, y, { strength: rng.nextIntRange(5, 13), steps: rng.nextIntRange(40, 170), type: -1, speedX: rng.nextIntRange(-10, 11) * 0.1, speedY: 2 });
  }]);
  // 14d noYChange 入口（cs:12266-12280）：speedX=0 不掷覆写判定外的额外骰
  gp?.set(0.6);   // ≡ cs:12272 平台锚（组间跃迁 3/4）
  surfaceCave(Math.trunc(w * 0.0004), 0.40, 0.60, [(x, y) => {
    tileRunner(st, rng, gs, x, y, { strength: rng.nextIntRange(7, 12), steps: rng.nextIntRange(150, 250), type: -1, speedY: 1, noYChange: true });
  }]);
  // 14e Caverer 大洞穴系统（cs:12284-12299）：(int)(5*(w/4200)) 个；
  // y 上界 h-400，退化时 rockLayer 取 h-401（cs:12287-12292）
  const cavCount = Math.trunc(5 * (w / 4200));
  let yLo = gs.rockLevel;
  const yHi = h - 400;
  if (yLo >= yHi) yLo = yHi - 1;
  for (let n = 0; n < cavCount; n++) {
    gp?.set3(n / Math.max(1, cavCount), 0.8, 1);   // ≡ cs:12291-12296 尾段 .8→1 锚
    caverer(st, rng, gs, rng.nextIntRange(340, w - 340), rng.nextIntRange(yLo, yHi));
  }
}

/** Caverer（cs:79642-79751）1:1：模式 0 = 主隧道+粗支洞，模式 1 = 长细链。
 *  ★首掷顺序：mode(Next 2) → 段数 → 方向（曾方向先于段数=第 2 个样本起流错位） */
function caverer(st: TileStore, rng: RNG, gs: GenState, X: number, Y: number): void {
  const randDir = () => {
    let dx = rng.nextIntRange(0, 100) * 0.01;
    let dy = 1 - dx;
    if (rng.nextIntRange(0, 2) === 0) dx = -dx;
    if (rng.nextIntRange(0, 2) === 0) dy = -dy;
    return [dx, dy] as [number, number];
  };
  if (rng.nextIntRange(0, 2) === 0) {
    // 模式 0:先段数 Next(7,9)，再方向 3 掷
    let px = X + 0.0, py = Y + 0.0;
    const segs = rng.nextIntRange(7, 9);
    let [dx, dy] = randDir();
    for (let k = 0; k < segs; k++) {
      [px, py] = digTunnel(st, rng, px, py, dx, dy, rng.nextIntRange(6, 20), rng.nextIntRange(4, 9));
      dx += rng.nextIntRange(-20, 21) * 0.1; dy += rng.nextIntRange(-20, 21) * 0.1;
      dx = Math.max(-1.5, Math.min(1.5, dx));
      dy = Math.max(-1.5, Math.min(1.5, dy));
      const [bx, by] = randDir();
      const [ex, ey] = digTunnel(st, rng, px, py, bx, by, rng.nextIntRange(30, 50), rng.nextIntRange(3, 6));
      tileRunner(st, rng, gs, Math.trunc(ex), Math.trunc(ey), {
        strength: rng.nextIntRange(10, 20), steps: rng.nextIntRange(5, 10), type: -1,
      });
    }
  } else {
    // 模式 1:先段数 Next(15,30)，再方向 3 掷
    let px = X + 0.0, py = Y + 0.0;
    const segs = rng.nextIntRange(15, 30);
    let [dx, dy] = randDir();
    for (let k = 0; k < segs; k++) {
      [px, py] = digTunnel(st, rng, px, py, dx, dy, rng.nextIntRange(5, 15), rng.nextIntRange(2, 6), true);
      dx += rng.nextIntRange(-20, 21) * 0.1; dy += rng.nextIntRange(-20, 21) * 0.1;
      dx = Math.max(-1.5, Math.min(1.5, dx));
      dy = Math.max(-1.5, Math.min(1.5, dy));
    }
  }
}
