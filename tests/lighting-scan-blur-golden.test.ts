// 光照 Scan+Blur 输出金标(2026-08-24,FastRandom f64 重写 + 分配惰性化的位级安全网)。
// 录制:SW_RECORD_GOLDEN=1 npx vitest run tests/lighting-scan-blur-golden.test.ts
//   ——以【改造前】的实现产出 fixtures/lighting-scan-blur-golden.json(位级真值);
// 回放(缺省):逐格逐通道严格相等(===),任何分歧报首差格坐标。
// 覆盖:exportTo 全支路(天空/地狱/彩玻璃墙/发光墙/涂装覆写/火把 24 档/蜡烛族/蘑菇组/
//   动态特例 switch 高发 sheet/液体光/致动/涂层/半砖坡面/裂纹砖/perFrame 点光)
//   + blur 两连跑(cycleIndex 递进 → 水 flicker withModifier 链)。
// 确定性钉:globalTimeWrappedHourly(performance.now() 派生)以实例自有属性覆写;
//   FlickerClock 全字段手设;updateLightDecay(13)×6 固定衰减/微光水体档。
import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TileLightScanner, type ScannerWorld, type PerFrameLight } from '../src/lighting/TileLightScanner';
import { FlickerClock } from '../src/lighting/SkyColor';
import { LightMap } from '../src/lighting/LightMap';
import { FastRandom } from '../src/lighting/FastRandom';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { updateLightDecay } from '../src/lighting/lightTables';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'lighting-scan-blur-golden.json');
const RECORD = process.env.SW_RECORD_GOLDEN === '1';

const W = 64, H = 48;
const GROUND = 20, LAVA = 44;
const bySheet = (s: number): number => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);

interface Feat {
  sheet: number; x: number; y: number;
  frameX?: number; frameY?: number;
  wall?: number; liquid?: number; liquidType?: number;
  half?: number; slope?: number; coat?: number; wire?: number; paintWall?: number;
}

/** 特征格清单:每行尽量独立成格,跨天空(y<20)/洞穴/地狱(y>44)三域 */
function features(): Feat[] {
  const f: Feat[] = [];
  let x = 2;
  const put = (sheet: number, y: number, extra: Partial<Feat> = {}): void => {
    f.push({ sheet, x, y, ...extra });
    x += x >= W - 3 ? -(W - 6) : 2;   // 蛇形走位铺满
  };
  // —— 天空域:火把 24 档采样(含 demon7/disco14/shimmer23)——
  for (const style of [0, 3, 7, 14, 20, 23]) put(4, 8, { frameY: style * 22, wall: 1 });
  // 蜡烛 33:静态档 + 动态档(25 demon/30 hsl/42 shimmer)
  for (const style of [0, 5, 20, 25, 30, 42]) put(33, 12, { frameY: style * 22, wall: 1 });
  // 吊灯 93 / 挂灯 100 / 烛台 34(双 frameX)
  for (const style of [1, 6, 23, 31]) put(93, 14, { frameY: style * 54, wall: 1 });
  for (const style of [1, 20, 31]) put(100, 16, { frameY: style * 36, wall: 1 });
  for (const style of [7, 25]) { put(34, 16, { frameX: 0, frameY: style * 54, wall: 1 }); put(34, 17, { frameX: 108, frameY: style * 54, wall: 1 }); }
  // 动态特例高发:迪斯科球/导线灯泡/传送门炮/药草/书架/梳妆台/烟囱/瓶中魂/微光蜡烛/暗影蜡烛
  put(126, 6, { frameX: 0 }); put(126, 7, { frameX: 36 });
  for (const fx of [0, 18, 36, 72, 144]) put(429, 5, { frameX: fx });
  put(209, 5, { frameX: 234 }); put(209, 6, { frameX: 306 });
  for (const fx of [0, 36, 90, 108]) put(84, 8, { frameX: fx });
  put(49, 10, { frameX: 0, wall: 1 }); put(49, 11, { frameX: 36, wall: 1 });
  put(95, 10, { frameX: 0, wall: 1 }); put(95, 11, { frameX: 36, wall: 1 }); put(96, 12, { frameX: 36, wall: 1 });
  put(98, 13, { frameY: 0, wall: 1 });
  for (const fy of [0, 36, 72]) put(572, 14, { frameY: fy });
  for (const fy of [0, 54, 108]) put(658, 15, { frameY: fy, wall: 1 });
  put(646, 15, { frameX: 0, wall: 1 });
  put(620, 16, { wall: 1 });
  put(663, 17, { wall: 1 });
  // 迪斯科族块 / 熔岩装饰(localRand 支路)
  for (const s of [160, 627, 628, 692]) put(s, 6, {});
  put(327, 9, { wall: 1 });
  // 彩色玻璃墙支路(88-93/241)× 液量档
  const glassWalls = [88, 89, 90, 91, 92, 93, 241];
  glassWalls.forEach((wl, i) => put(1, 4 + (i % 2), { wall: wl, liquid: [0, 100, 200, 255][i % 4], liquidType: 1 }));
  // 发光墙:宝石灯墙 / 彩虹砖墙 44 / 彩虹苔砖墙 346 / 岩浆瀑布墙 137 / 透光墙 21
  for (const wl of [153, 154, 164, 165, 44, 346, 137, 21]) put(0, 5, { wall: wl });
  // 涂装覆写墙 175/357(paintWall≠0)
  put(0, 7, { wall: 175, paintWall: 5 }); put(0, 8, { wall: 357, paintWall: 9 });
  // —— 地表带:水坑四档深 / 蜂蜜 / 半砖 / 坡面 / 裂纹砖 / 致动火把 / 隐形涂层 ——
  const waterDepths = [100, 150, 200, 255];
  waterDepths.forEach((d, i) => f.push({ sheet: 0, x: 4 + i * 3, y: 19, liquid: d, liquidType: 1, wall: 1 }));
  f.push({ sheet: 0, x: 20, y: 19, liquid: 255, liquidType: 3, wall: 1 });   // 蜂蜜
  for (let i = 0; i < 4; i++) f.push({ sheet: 1, x: 30 + i * 2, y: 19, half: 1, liquid: i === 3 ? 220 : 0, liquidType: 1, wall: 1 });
  for (let s = 1; s <= 4; s++) f.push({ sheet: 1, x: 40 + s, y: 19, slope: s, wall: 1 });
  for (const s of [481, 482, 483]) put(s, 18, { wall: 1 });
  f.push({ sheet: bySheet(4), x: 50, y: 18, frameY: 0, wire: 32, wall: 1 });          // 致动火把(仍发光,原版门)
  f.push({ sheet: bySheet(1), x: 52, y: 18, coat: 2, wall: 1 });                       // 隐形涂层实心
  // AllowLightInWater 族泡在水里(玻璃 54/回声 541/彩纸 328/降雪 459/水族馆 748/尖刺 750)
  [54, 541, 328, 459, 748, 750].forEach((s, i) => f.push({ sheet: s, x: 2 + i * 2, y: 21, liquid: 255, liquidType: 1, wall: 1 }));
  // 挡阳族(门 10/蛛网 51/藤 52)+ 坡半砖 → 天空放行支路
  f.push({ sheet: bySheet(10), x: 20, y: 21, wall: 1 });
  f.push({ sheet: bySheet(51), x: 22, y: 21, wall: 1 });
  f.push({ sheet: bySheet(52), x: 24, y: 21, slope: 1, wall: 1 });
  // —— 洞穴域:蘑菇组 / 闪烁组 / 水母笼 / 岩浆 / 微光液 / 云族 ——
  for (const s of [70, 71, 72, 190, 348, 528, 578]) put(s, 26, {});
  put(349, 26, { frameX: 0 }); put(349, 27, { frameX: 36 });   // 雕像门控双态
  for (const s of [405, 215, 592]) put(s, 28, {});
  for (const s of [316, 317, 318]) put(s, 29, {});
  f.push({ sheet: 0, x: 8, y: 32, liquid: 255, liquidType: 2, wall: 1 });    // 岩浆
  f.push({ sheet: 0, x: 12, y: 32, liquid: 100, liquidType: 4, wall: 1 });   // 微光液浅
  f.push({ sheet: 0, x: 14, y: 32, liquid: 255, liquidType: 4, wall: 1 });   // 微光液满
  put(718, 30, {});   // 星云(夜支路;昼变体应不发光)
  put(719, 31, {});   // 传送塔彩虹云
  put(327, 34, { wall: 1 });
  // —— 地狱域:hellSky 支路(干格/带墙/半砖上邻液)+ 岩浆海 ——
  f.push({ sheet: 0, x: 6, y: 46, wall: 1 });
  f.push({ sheet: 0, x: 10, y: 46, wall: 88 });
  f.push({ sheet: 1, x: 14, y: 46, half: 1, wall: 1 });
  f.push({ sheet: 0, x: 14, y: 45, liquid: 220, liquidType: 1 });
  for (let i = 0; i < 6; i++) f.push({ sheet: 0, x: 20 + i * 2, y: 47, liquid: 255, liquidType: 2, wall: 1 });
  put(4, 46, { frameY: 0, wall: 1 });   // 地狱火把
  return f;
}

function buildWorld(): TileStore {
  const st = new TileStore(W, H);
  // 地表带 + 地下基底
  for (let x = 0; x < W; x++) {
    for (let y = 19; y <= 23; y++) st.setTile(x, y, bySheet(0));
    for (let y = 35; y <= 38; y++) st.setTile(x, y, bySheet(1));
  }
  // 地下土墙(天空域留 wall=0)
  for (let x = 0; x < W; x++) for (let y = 22; y < H; y++) st.wall[st.idx(x, y)] = 1;
  for (const ft of features()) {
    const id = bySheet(ft.sheet);
    if (id < 0) { console.warn(`[golden] sheet ${ft.sheet} 不在 TILE_DEFS,跳过`); continue; }
    st.setTile(ft.x, ft.y, id, ft.frameX ?? 0, ft.frameY ?? 0);
    const i = st.idx(ft.x, ft.y);
    if (ft.wall !== undefined) st.wall[i] = ft.wall;
    if (ft.liquid !== undefined) st.liquid[i] = ft.liquid;
    if (ft.liquidType !== undefined) st.liquidType[i] = ft.liquidType;
    if (ft.half !== undefined) st.half[i] = ft.half;
    if (ft.slope !== undefined) st.slope[i] = ft.slope;
    if (ft.coat !== undefined) st.coat[i] = ft.coat;
    if (ft.wire !== undefined) st.wire[i] = ft.wire;
    if (ft.paintWall !== undefined) st.paintWall[i] = ft.paintWall;
  }
  return st;
}

function makeFlicker(): FlickerClock {
  const f = new FlickerClock();
  f.mouseTextColor = 210;
  f.demonTorch = 0.37;
  f.discoR = 200; f.discoG = 80; f.discoB = 40;
  f.essScale = 0.9;
  f.timeForVisualEffects = 12345;
  // 钉死真实时钟派生量(performance.now() → 固定值;实例自有属性遮蔽原型 getter)
  Object.defineProperty(f, 'globalTimeWrappedHourly', { value: 987.654, configurable: true });
  return f;
}

const PER_FRAME: PerFrameLight[] = [
  { x: 12, y: 12, r: 1, g: 0.6, b: 0.3 },
  { x: 40, y: 30, r: 0.2, g: 0.9, b: 0.4 },
  { x: 5, y: 46, r: 0.8, g: 0.2, b: 0.1 },
];

interface Snap { mask: number[]; r: number[]; g: number[]; b: number[] }
const snapMap = (m: LightMap): Snap => ({ mask: Array.from(m.mask), r: Array.from(m.r), g: Array.from(m.g), b: Array.from(m.b) });

function runVariant(isDay: boolean): Record<string, Snap> {
  for (let k = 0; k < 6; k++) updateLightDecay(13, false);
  const st = buildWorld();
  const world = {
    store: st,
    groundLevel: GROUND,
    lavaLine: LAVA,
    clock: { timeOfDay: isDay ? 0.3 : 0.85, dayCount: 7, eclipse: false, bloodMoon: !isDay, moonPhase: isDay ? 0 : 4, isDay },
  } as unknown as ScannerWorld;
  const scanner = new TileLightScanner(makeFlicker());
  const map = new LightMap();
  map.setSize(W, H);
  map.nonVisiblePadding = 18;
  (map as unknown as { random: FastRandom }).random = new FastRandom(12345);
  scanner.exportTo(world, map, 0, 0, PER_FRAME);
  const out: Record<string, Snap> = { scan: snapMap(map) };
  map.blur();
  out.blur1 = snapMap(map);
  map.blur();
  out.blur2 = snapMap(map);
  return out;
}

describe('光照 Scan+Blur 输出金标', () => {
  it('day/night 两变体 scan+blur1+blur2 位级一致', () => {
    const fresh = { day: runVariant(true), night: runVariant(false) };
    if (RECORD) {
      mkdirSync(join(import.meta.dirname, 'fixtures'), { recursive: true });
      writeFileSync(FIXTURE, JSON.stringify(fresh));
      console.log(`[golden] 已录制 ${FIXTURE}`);
      return;
    }
    expect(existsSync(FIXTURE), '金标文件缺失——先 SW_RECORD_GOLDEN=1 录制').toBe(true);
    const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, Record<string, Snap>>;
    for (const variant of ['day', 'night'] as const) {
      for (const phase of ['scan', 'blur1', 'blur2'] as const) {
        const a = fresh[variant][phase];
        const b = golden[variant][phase];
        for (const ch of ['mask', 'r', 'g', 'b'] as const) {
          for (let i = 0; i < a[ch].length; i++) {
            if (a[ch][i] !== b[ch][i]) {
              const cell = `${i % W},${Math.floor(i / W)}`;
              throw new Error(`${variant}/${phase}/${ch}[${i}](格 ${cell}) 分歧: fresh=${a[ch][i]} golden=${b[ch][i]}`);
            }
          }
        }
      }
    }
  });
});
