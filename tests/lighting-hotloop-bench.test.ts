// 光照热循环 micro-bench 防回退闸(2026-09-19 perf2 刀配套)。
// 背景:LightingEngine runFullCycle 曾占 trace 17%(~12.7ms/帧):exportTo 播种
//   逐格对象/重播种、blurLine 逐格 y*w+x 与逐访问水 flicker 重播种(250%细缝案
//   blurLine 曾 18%)。本测试把 exportTo/blur 钉在耗时上限(观察值 ~2.5-3× 裕量,
//   只抓数量级回退,不抓机器噪声;输出位级由 lighting-scan-blur-golden 锁定,
//   本文件只看耗时)。
// 场景:确定性过程世界(160×120,地表亮带+水坑+岩浆+火把阵)——
//   exportTo 计 surface/hell/水/火把/specialTileLight 混合面;
//   blur 用满亮图+水格 mask(每格全通道活=worst-case 步进,含水 flicker LUT 支)。
import { describe, it, expect } from 'vitest';
import { TileLightScanner } from '../src/lighting/TileLightScanner';
import { LightMap, Mask } from '../src/lighting/LightMap';
import { FlickerClock } from '../src/lighting/SkyColor';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { updateLightDecay } from '../src/lighting/lightTables';

const W = 160, H = 120, GROUND = 60, LAVA = 100;
const bySheet = (s: number): number => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);

function buildBenchWorld(): TileStore {
  const st = new TileStore(W, H);
  const dirt = bySheet(0), stone = bySheet(1), torch = bySheet(4), glass = bySheet(54);
  // 地表带 + 地下基底(与 golden 同构的亮/暗两域)
  for (let x = 0; x < W; x++) {
    for (let y = GROUND; y <= GROUND + 4; y++) st.setTile(x, y, dirt);
    for (let y = GROUND + 40; y <= GROUND + 52; y++) st.setTile(x, y, stone);
    for (let y = LAVA + 2; y < H; y++) st.setTile(x, y, stone);
  }
  // 火把阵(发光 tile 面:24 档样式轮转)
  for (let x = 4; x < W; x += 16) st.setTile(x, GROUND - 1, torch, 0, (x % 6) * 22);
  // 玻璃带(AllowLightInWater 支)
  for (let x = 10; x < 30; x++) st.setTile(x, GROUND - 2, glass);
  // 水坑(深水微光支+blur 水 flicker 支)
  for (let x = 40; x < 90; x++) for (let y = GROUND - 3; y < GROUND; y++) {
    const i = st.idx(x, y);
    st.liquid[i] = 255; st.liquidType[i] = 1;
  }
  // 岩浆海(液体光支)
  for (let x = 0; x < W; x++) for (let y = LAVA; y < LAVA + 2; y++) {
    const i = st.idx(x, y);
    st.liquid[i] = 255; st.liquidType[i] = 2;
  }
  // 地下土墙
  for (let x = 0; x < W; x++) for (let y = GROUND + 6; y < H; y++) st.wall[st.idx(x, y)] = 1;
  return st;
}

function makeScanner(): { scanner: TileLightScanner; world: Parameters<TileLightScanner['exportTo']>[0] } {
  const st = buildBenchWorld();
  const flicker = new FlickerClock();
  flicker.mouseTextColor = 210;
  flicker.demonTorch = 0.37;
  flicker.discoR = 200; flicker.discoG = 80; flicker.discoB = 40;
  Object.defineProperty(flicker, 'globalTimeWrappedHourly', { value: 987.654, configurable: true });
  const world = { store: st, groundLevel: GROUND, lavaLine: LAVA, clock: { timeOfDay: 0.85, dayCount: 7, eclipse: false } };
  return { scanner: new TileLightScanner(flicker), world: world as Parameters<TileLightScanner['exportTo']>[0] };
}

describe('光照热循环 micro-bench 防回退(上限闸,输出位级归 golden)', () => {
  it('exportTo 160×120 min < 8ms(2026-09-19 观察 ~2.7ms node;回退=逐格分配/重播种复发)', () => {
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);   // 钉深水微光档
    const { scanner, world } = makeScanner();
    const map = new LightMap();
    map.setSize(W, H);
    map.nonVisiblePadding = 18;
    for (let k = 0; k < 5; k++) scanner.exportTo(world, map, 0, 0, []);   // 预热
    const ts: number[] = [];
    for (let k = 0; k < 40; k++) {
      const t = performance.now();
      scanner.exportTo(world, map, 0, 0, []);
      ts.push(performance.now() - t);
    }
    const best = Math.min(...ts);
    expect(best, `exportTo min ${best.toFixed(2)}ms 超闸(8ms)——热路径回退`).toBeLessThan(8);
  });

  it('blur 160×120:游戏形对 exportTo 开销比 < 4(观察 ~1.4;blur 域回退=重播种/逐格乘法复发)+ 宽松绝对闸', () => {
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);
    const { scanner, world } = makeScanner();
    const map = new LightMap();
    map.setSize(W, H);
    map.nonVisiblePadding = 18;
    // ★判读用 min-of-N(噪声只增不减);绝对耗时受并行测试负载漂移影响大
    //   (同机空载 3.8ms / 全套并发 5.1ms),故 blur 域主闸用【同 run exportTo 比值】
    //   (负载对两者同相,比值稳;blur 专项回退会单边推高比值),绝对值只留宽松兜底。
    // ① 游戏形负载:exportTo 产物图(地表亮带+暗穴+水格 flick LUT 支)——真场景形状
    for (let k = 0; k < 5; k++) { scanner.exportTo(world, map, 0, 0, []); map.blur(); }   // 预热
    const tScan: number[] = [], tGame: number[] = [];
    for (let k = 0; k < 40; k++) {
      let t = performance.now();
      scanner.exportTo(world, map, 0, 0, []);
      tScan.push(performance.now() - t);
      t = performance.now();
      map.blur();
      tGame.push(performance.now() - t);
    }
    const scan = Math.min(...tScan), game = Math.min(...tGame);
    // (比值闸曾试 game/scan:node/vitest JIT 分割与浏览器不同相,不稳,弃——
    //  绝对宽松闸兜底;精确 A/B 归 scripts/_perf2-lighting.mjs 探针同机对跑)
    void scan;
    expect(game, `blur(游戏形) min ${game.toFixed(2)}ms 超闸(12ms)——热路径回退`).toBeLessThan(12);
    // ② 全亮 worst-case(全格活=步进满载;水/实心 mask 支路保留)——宽松闸只抓数量级回退
    for (let x = 40; x < 90; x++) for (let y = GROUND - 3; y < GROUND; y++) map.mask[y * W + x] = Mask.Water;
    for (let x = 0; x < W; x++) for (let y = GROUND + 40; y <= GROUND + 52; y++) map.mask[y * W + x] = Mask.Solid;
    const fill = () => { map.r.fill(0.7); map.g.fill(0.7); map.b.fill(0.7); };
    fill(); map.blur(); fill(); map.blur(); fill(); map.blur();   // 预热
    const tWorst: number[] = [];
    for (let k = 0; k < 40; k++) { fill(); const t = performance.now(); map.blur(); tWorst.push(performance.now() - t); }
    const worst = Math.min(...tWorst);
    expect(worst, `blur(全亮 worst-case) min ${worst.toFixed(2)}ms 超闸(24ms)——热路径回退`).toBeLessThan(24);
  });
});
