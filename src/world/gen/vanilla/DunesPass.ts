// 原版 pass "Dunes"(GenPassNameID.DunesAndPyramidLocations,WorldGen.cs:11540-11602)
// + DunesBiome.cs(DunesBiome.cs:53-161)1:1 移植。
// 两个单侧沙丘(各宽 SingleDunesWidth 150-250、高 60-99×HeightScale 1.0)叠在 origin 两侧:
//   PlaceSingle = 8-10 个小山丘(二次贝塞尔 PlaceCurvedLine,曲线以下到 Surface+√x*3 全转沙 53,
//   曲线上方 10 格清非沙物) + 1-2 个 0.8 scale 中央大山丘。
// 同 pass 还掷金字塔候选(cs:11591-11599:80% 概率,origin±200 列地表+20 → GenVars.PyrX/PyrY,
// 这里写 gs.pyramidSpots,由 StructuresPass.runPyramidPass 按 cs:15426 段消费)。
// 数量:Dunes.Count = WorldGenRange 1-2 × WorldWidth/4200(Configuration.json)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY } from '../../../data/tiles';
import { dualDungeonState, refreshDualPotentialBounds } from './DungeonStyles1457'; // ★IIIII88 双地牢装配

const SAND = TILE_BY_KEY['sand']!;
const CLOUD = TILE_BY_KEY['v_189_cloud_block']!;
const RAIN_CLOUD = TILE_BY_KEY['v_196_rain_cloud_block']!;

interface DunesArea { left: number; top: number; width: number; height: number }
interface DunesDesc {
  area: DunesArea;
  surface: Int16Array; // SurfaceMap 高度(相对 area.left-20)
  surfaceX: number;    // SurfaceMap 起始列(= area.left-20)
  windRight: boolean;  // WindDirection
}

const HEIGHT_SCALE = 1.0; // Configuration.json DunesBiome.HeightScale

/** SurfaceMap.FromArea(DunesBiome 描述用):每列自 y=50 向下扫 maxTilesY/2 格,
 *  跳过云族(Clouds)取首个实心;无则 maxTilesY/2+50(SurfaceMap.cs:41-64) */
function surfaceMap(st: TileStore, startX: number, width: number): Int16Array {
  const limit = Math.floor(st.h / 2);
  const out = new Int16Array(width);
  for (let i = 0; i < width; i++) {
    const x = startX + i;
    let found = false;
    let y = 0;
    for (let j = 50; j < 50 + limit; j++) {
      if (!st.inBounds(x, j) || !st.flags[st.idx(x, j)]) continue;
      const t = st.type[st.idx(x, j)];
      if (t === CLOUD || t === RAIN_CLOUD) { found = false; continue; }
      if (!found) { y = j; found = true; }
    }
    out[i] = found ? y : limit + 50;
  }
  return out;
}

export function runDunesPass(st: TileStore, rng: RNG, gs: GenState, onIter?: (i: number) => void): void {
  const { w, h } = st;
  // pass 头：DungeonCrawler.SetupDungeonGenVarVariables（cs:11542 + DungeonCrawler.cs:56）
  // ——地牢主题 Next(3) 在**这里**消耗（曾错放到 DungeonPass=流错位 1 颗）
  gs.dungeonTheme = rng.nextIntRange(0, 3);
  // ★IIIII82（DungeonCrawler.cs:56-58）：REMIX 世界主题**不用掷值**——先照掷
  //   （骰面消耗一致），再被 `num = WorldGen.crimson ? 2 : 0` 钉死（猩红→粉 2 /
  //   腐化→蓝 0）。此前漏钉 ⇒ zenith(remix∧drunk) 下地牢砖色随裸掷值漂移：
  //   #32 窗整体 T41>44×~5.2 万（蓝→粉）主体残差（反演重放 THEME_PIN=0 复验收敛）。
  if (gs.seedFlags.remix) gs.dungeonTheme = gs.crimson ? 2 : 0;
  // ★IIIII21（DungeonCrawler.cs:94-110）：drunk 世界墙风格重掷——紧跟主题 switch
  //   之后、入口三掷之前。普通世界该 if 整段短路=零掷骰零扰动。
  gs.dungeonWallStyle = gs.seedFlags.drunkWorld ? rng.nextIntRange(0, 3) : undefined;
  // ★入口三掷归位（2026-08-16 每 pass 重播改造）：SetupDungeonGenVarVariables 尾段的
  //   入口类型掷①② Next(3)（DungeonCrawler.cs:174/177 Legacy→Dome→Tower 门）+
  //   MakeDungeon_GetEntranceSettings.RandomSeed Next()（:856）原版就在 Dunes pass 头
  //   消耗——此前 JS/oracle 同步延后到 DungeonPass 头是续流期妥协；pass 边界重播后
  //   dunes 流须逐掷对齐。A/B 结果落 gs（XX 批 2026-08-18：②==0→Tower/①==0→Dome
  //   走 PrecalculateEntrancePosition 路径，DungeonPass 消费；Legacy 路径不用），
  //   entSeed 落 gs 供 DungeonPass 的 DgEntrance 消费。
  gs.dungeonEntA = rng.nextIntRange(0, 3);  // 入口类型掷①（普通世界 flag 即真只跑一轮）
  gs.dungeonEntB = rng.nextIntRange(0, 3);  // 入口类型掷②
  // ★IIIII80（2026-08-30，DungeonCrawler.cs:184-209）：surfaceIsInSpace（such great
  //   heights）时拒绝环——Tower（②==0）被拒则 flag=false 整循环重掷（guard num3=50，
  //   耗尽回退 Legacy；每轮各耗 Next(3)×2）。普通世界恰好一轮=上方两掷不变。
  if (gs.seedFlags.surfaceIsInSpace) {
    let num3 = 50;
    let flagged = gs.dungeonEntB !== 0;
    while (!flagged) {
      num3--;
      if (num3 <= 0) { gs.dungeonEntA = -1; gs.dungeonEntB = -1; break; }   // 强制 Legacy（-1 哨兵：DungeonPass 的 ?? 兜底掷不触发）
      gs.dungeonEntA = rng.nextIntRange(0, 3);
      gs.dungeonEntB = rng.nextIntRange(0, 3);
      flagged = gs.dungeonEntB !== 0;
    }
  }
  gs.dungeonEntSeed = rng.vanilla.next(); // preGenDungeonEntranceSettings.RandomSeed
  // ★IIIII88 双地牢第二套 genvars 装配（WorldGen.cs:11552-11559）：Dunes pass 头
  //   `if (SecretSeed.dualDungeons.Enabled) { GenVars.CurrentDungeon = 1;
  //   SetupDungeonGenVarVariables(GenVars.CurrentDungeonGenVars, genRand);
  //   GenVars.CurrentDungeon = 0; }`——同一函数再跑一遍（ CurrentDungeon=1 ⇒ odd
  //   样式表 Snow/Desert/Hallow/Temple + 地牢#1 自己的主题/入口掷）。掷序=主题
  //   Next(3)、drunk 墙重掷、入口①② Next(3)、entSeed Next()；界域 Create 零掷。
  //   theme/ent* 掷值落 dualDungeonState.dungeons[1]（DitherSnake/Dungeon 域消费）;
  //   普通（非 dual）世界整段短路零掷流不变。
  if (gs.seedFlags.dualDungeons && dualDungeonState.dungeons.length >= 2) {
    const d1 = dualDungeonState.dungeons[1]!;
    d1.theme = rng.nextIntRange(0, 3);                       // DungeonCrawler.cs:56
    if (gs.seedFlags.drunkWorld) d1.wallStyle = rng.nextIntRange(0, 3); // :96 drunk 墙重掷（★IIIII93b 留痕代弃——掷位不变）
    // :109 CreatePotentialDungeonBounds（对偶侧）+ GetCurrentDungeonStyle/样式表追加：零掷
    d1.entA = rng.nextIntRange(0, 3);                        // :184-208 入口环（surfaceIsInSpace 拒 Tower 环,门见下）
    d1.entB = rng.nextIntRange(0, 3);
    if (gs.seedFlags.surfaceIsInSpace) {
      let num3 = 50;
      let flagged = d1.entB !== 0;
      while (!flagged) {
        num3--;
        if (num3 <= 0) { d1.entA = -1; d1.entB = -1; break; }   // 耗尽回退 Legacy（-1 哨兵同主套）
        d1.entA = rng.nextIntRange(0, 3);
        d1.entB = rng.nextIntRange(0, 3);
        flagged = d1.entB !== 0;
      }
    }
    d1.entSeed = rng.vanilla.next();                         // :856 preGen.RandomSeed
    const d0 = dualDungeonState.dungeons[0]!;                // 主套四掷回填（单源 gs 面）
    d0.theme = gs.dungeonTheme;
    d0.entA = gs.dungeonEntA ?? -1;
    d0.entB = gs.dungeonEntB ?? -1;
    d0.entSeed = gs.dungeonEntSeed ?? -1;
    refreshDualPotentialBounds(w, h, gs.worldSurface, gs.genWorldSurfaceHigh,
      !!gs.seedFlags.drunkWorld || !!gs.seedFlags.noSurface);
  }
  // ★IIIII44（cs:11561）：Dunes 主门 `if (!Skyblock.denyAllGeneration &&
  //   !SecretSeed.noSurface.Enabled)`——沙丘/金字塔候选整段天空盒跳过；pass 头的
  //   地牢主题/入口五掷在门外照常消耗（x86 实证 slot2 rolls=5 恰为头部掷数）。
  if (gs.seedFlags.skyblock || gs.seedFlags.noSurface) return;
  // WorldGenRange(1,2,ScaleWith:WorldWidth).GetRandom:ScaleValue=(int)(w/4200×v)
  const ws = w / 4200;
  const lo = Math.max(1, Math.trunc(ws * 1));
  const hi = Math.max(lo, Math.trunc(ws * 2));
  const count = rng.int(lo, hi);
  // Configuration.json Dunes.ChanceOfPyramid；★IIIII14（cs:11564-11567）：drunk 世界
  // ChanceOfPyramid → 1.0（每个沙丘 spot 必产金字塔候选）。
  const pyramidChance = gs.seedFlags.drunkWorld ? 1.0 : 0.8;
  const scale = w / 4200;    // cs:11562 num2
  for (let i = 0; i < count; i++) {
    // RandomWorldPoint(0, 500, 0, 500)(cs:11570)+ 拒绝带(cs:11572-11588):
    // 丛林 ±600·num2 / 中央 ±300 / 雪原带 ±300;超 w 次放松丛林、超 2w 次放松雪原
    let ox = 0, oy = 0, tries = 0;
    for (;;) {
      ox = rng.int(500, w - 501); // Next(500, w-500)
      oy = rng.int(0, h - 1);     // Next(0, maxTilesY)
      let fJungle = Math.abs(ox - gs.jungleX) < Math.trunc(600 * scale);
      const fCenter = Math.abs(ox - w / 2) < 300;
      let fSnow = ox > gs.snowOriginLeft - 300 && ox < gs.snowOriginRight + 300;
      tries++;
      if (tries >= w) fJungle = false;
      if (tries >= 2 * w) fSnow = false;
      if (!(fJungle || fCenter || fSnow)) break;
    }
    placeDunes(st, rng, ox, oy);
    // 金字塔候选(cs:11591-11599)
    if (rng.next() <= pyramidChance) {
      const px = rng.int(ox - 200, ox + 199); // Next(origin.X-200, origin.X+200)
      for (let j = 0; j < h; j++) {
        if (st.inBounds(px, j) && st.flags[st.idx(px, j)]) {
          gs.pyramidSpots.push({ x: px, y: j + 20 });
          break;
        }
      }
    }
  }
}

/** DunesBiome.Place(cs:DunesBiome.cs:53-64):左右两个单侧沙丘 */
function placeDunes(st: TileStore, rng: RNG, ox: number, oy: number): void {
  const h1 = Math.trunc(rng.int(60, 99) * HEIGHT_SCALE); // Next(60,100)
  const h2 = Math.trunc(rng.int(60, 99) * HEIGHT_SCALE);
  const w1 = rng.int(150, 250); // SingleDunesWidth.GetRandom(含两端)
  const w2 = rng.int(150, 250);
  // ★求值顺序（DunesBiome.cs:62-65）：两张 description（含 SurfaceMap 采样+风向掷）
  // 都在 PlaceSingle **之前**创建——dune2 的地表图取的是 dune1 放置前的地形。
  // 此前 makeDesc 内联在 placeSingle 实参里 → dune2 的图被 dune1 污染（+/- 若干行）
  const d1 = makeDesc(st, rng, ox - Math.trunc(w1 / 2) + 30, oy, w1, h1);
  const d2 = makeDesc(st, rng, ox + Math.trunc(w2 / 2) - 30, oy, w2, h2);
  placeSingle(st, rng, d1);
  placeSingle(st, rng, d2);
}

function makeDesc(st: TileStore, rng: RNG, x: number, y: number, width: number, height: number): DunesDesc {
  // DunesDescription.CreateFromPlacement:area = origin-(w/2,h/2, w, h);
  // SurfaceMap.FromArea(area.Left-20, area.Width+40);风向后随机(DunesBiome.cs:26-36)
  const left = x - Math.trunc(width / 2);
  const area: DunesArea = { left, top: y - Math.trunc(height / 2), width, height };
  const sx = left - 20;
  return { area, surface: surfaceMap(st, sx, width + 40), surfaceX: sx, windRight: rng.int(0, 1) !== 0 };
}

/** DunesBiome.PlaceSingle(DunesBiome.cs:66-87) */
function placeSingle(st: TileStore, rng: RNG, d: DunesDesc): void {
  const num = rng.int(0, 2) + 8; // Next(3)+8 → 8-10
  for (let i = 0; i < num - 1; i++) {
    const n2 = Math.trunc((2 / num) * d.area.width); // C# int
    let n3 = Math.trunc((i / num) * d.area.width + d.area.left) + Math.trunc((n2 * 2) / 5);
    n3 += rng.int(-5, 5);
    const n4 = i / (num - 2);
    const n5 = 1 - Math.abs(n4 - 0.5) * 2;
    placeHill(st, rng, d, n3 - Math.trunc(n2 / 2), n3 + Math.trunc(n2 / 2), (n5 * 0.3 + 0.2) * HEIGHT_SCALE);
  }
  const n6 = rng.int(0, 1) + 1; // Next(2)+1
  for (let j = 0; j < n6; j++) {
    const n7 = Math.trunc(d.area.width / 2);
    const cx = d.area.left + Math.trunc(d.area.width / 2) + rng.int(-10, 10);
    placeHill(st, rng, d, cx - Math.trunc(n7 / 2), cx + Math.trunc(n7 / 2), 0.8 * HEIGHT_SCALE);
  }
}

/** DunesBiome.PlaceHill(DunesBiome.cs:89-108) */
function placeHill(st: TileStore, rng: RNG, d: DunesDesc, startX: number, endX: number, scale: number): void {
  // SurfaceMap 越界钳到边缘列(原版越界会 IndexOutOfRange,此处防御)
  const surfAt = (x: number) => {
    const i = Math.max(0, Math.min(d.surface.length - 1, x - d.surfaceX));
    return d.surface[i];
  };
  const startPoint = { x: startX, y: surfAt(startX) };
  const endPoint = { x: endX, y: surfAt(endX) };
  const center = { x: Math.trunc((startPoint.x + endPoint.x) / 2), y: Math.trunc((startPoint.y + endPoint.y) / 2) - Math.trunc(35 * scale) };
  const big = Math.trunc((endPoint.x - center.x) / 4);
  const small = Math.trunc((endPoint.x - center.x) / 16);
  if (!d.windRight) center.x -= rng.int(small, big);      // Next(min, num+1)
  else center.x += rng.int(small, big);
  const p2 = { x: 0, y: Math.trunc(scale * 12) };
  const p3 = { x: Math.trunc(p2.x / -2), y: Math.trunc(p2.y / -2) };
  placeCurvedLine(st, d, startPoint, center, d.windRight ? p3 : p2);
  placeCurvedLine(st, d, center, endPoint, !d.windRight ? p3 : p2);
}

/** DunesBiome.PlaceCurvedLine(DunesBiome.cs:110-161):二次贝塞尔取样,
 *  曲线以上 10 格清非沙物、曲线到 Surface+√(num3)*3 全列转沙(ResetToType(53)) */
function placeCurvedLine(
  st: TileStore, d: DunesDesc,
  startPoint: { x: number; y: number }, endPoint: { x: number; y: number },
  anchorOffset: { x: number; y: number },
): void {
  const p = {
    x: Math.trunc((startPoint.x + endPoint.x) / 2) + anchorOffset.x,
    y: Math.trunc((startPoint.y + endPoint.y) / 2) + anchorOffset.y,
  };
  const step = 0.5 / (endPoint.x - startPoint.x);
  let prevX = -1, prevY = -1;
  let t = 0, guard = 0;
  while (t <= 1 && guard++ < 10000) {
    const ax = startPoint.x + (p.x - startPoint.x) * t;
    const ay = startPoint.y + (p.y - startPoint.y) * t;
    const bx = p.x + (endPoint.x - p.x) * t;
    const by = p.y + (endPoint.y - p.y) * t;
    const px = Math.trunc(ax + (bx - ax) * t); // Vector2D.Lerp(...).ToPoint() 截断
    const py = Math.trunc(ay + (by - ay) * t);
    t += step;
    if (px === prevX && py === prevY) continue;
    prevX = px; prevY = py;
    const centerX = d.area.left + Math.trunc(d.area.width / 2);
    const n3 = Math.trunc(d.area.width / 2) - Math.abs(px - centerX);
    const surf = d.surface[Math.max(0, Math.min(d.surface.length - 1, px - d.surfaceX))];
    // 原版 Math.Sqrt(负)=NaN → (int)NaN。★平台语义：x86 cvttsd2si=0x80000000
    //（int.MinValue→填充循环不执行）；ARM64 fcvtzs=0（会填一格）。金标 .wld 在本机
    // 生成但游戏经 Rosetta x86 运行——实证 (2315,310) 无沙 = x86 语义。按 x86 复刻：
    const castSq = n3 < 0 ? -2147483648 : Math.trunc(Math.sqrt(n3) * 3);
    const n4 = surf + castSq;
    if (!st.inBounds(px, py)) continue;
    for (let i = py - 10; i < py; i++) {
      if (!st.inBounds(px, i)) continue;
      const ti = st.idx(px, i);
      if (st.flags[ti] && st.type[ti] !== SAND) {
        st.type[ti] = 0; st.flags[ti] = 0; st.liquid[ti] = 0; st.liquidType[ti] = 0;
      }
    }
    for (let j = py; j < n4; j++) {
      if (!st.inBounds(px, j)) continue;
      const ti = st.idx(px, j);
      st.type[ti] = SAND; st.flags[ti] = 1;
      st.liquid[ti] = 0; st.liquidType[ti] = 0; // ResetToType 清液体,墙保留
    }
  }
}
