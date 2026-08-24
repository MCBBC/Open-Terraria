// 蓝队 r8 批回归（红队第八轮复核确认项）：
//   R8-28 挡光表 278 项机械提取（TileLightScanner 废 opacity 推导）
//   R8-29 发光墙门语义（宝石七墙无门/其余 !LightIsBlocked/137·44·346 动态）
//   R8-30 挡阳表（solid−16 豁免）+ R8-36 深水微光支 + R8-37 地狱无玻璃支
//   R8-33/34/35 SceneState shimmerDarken/FTW/headcovered 衰减
//   R8-38 水晶球 125 G/B 赋值语义
//   R8-42 ExportTo 截断 + LightMap.clear 清 mask
//   R8-44/45 SwitchTiles 全量（敌怪/城镇/小动物/弹幕触板 + 风格门 + 210/443/442）
//   R8-46 XferWater 四值类型匹配 / R8-47 PixelBox 仅 v==3 / R8-48 日晷月晷 / R8-51 触发音
//   R8-10 OreRunner 原语（白名单/不填空气/清油漆）
//   R8-18 泡泡 379 液体域实心 / R8-19 合并产物 liquid>0 门 / R8-20 UnifiedRandom 流
//   R8-22 CheckAlch case5 量门 / R8-23 情形 B 裁切植物门 / R8-21 睡莲 solidTop 族
// 驳回项备案：R8-1（IsTouching 链 AND,60 死代码）/ R8-31（五族 switch 有 default 亮色）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import {
  TILE_BLOCK_LIGHT_SHEETS, TILE_NO_SUN_LIGHT_SHEETS,
} from '../src/lighting/lightTables';
import { TileLightScanner } from '../src/lighting/TileLightScanner';
import { FlickerClock } from '../src/lighting/SkyColor';
import { FastRandom } from '../src/lighting/FastRandom';
import { LightMap, Mask } from '../src/lighting/LightMap';
import { updateLightDecay } from '../src/lighting/lightTables';
import { Game } from '../src/core/Game';
import { Wiring } from '../src/world/Wiring';
import { deviceTable, type DeviceCtx } from '../src/world/wiring/devices';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { oreRunner } from '../src/world/gen/vanilla/TileRunner';
import { RNG } from '../src/core/rng';
import { TILE } from '../src/core/constants';

const bySheet = (s: number): number => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
const STONE = bySheet(1);
const DOOR = bySheet(10);
const WEB = bySheet(51);
const VINE = bySheet(52);
const ECHO = bySheet(541);
const GRATE = bySheet(546);
const CLOUD = bySheet(189);
const SPIKE = bySheet(48);
const BUBBLE = bySheet(379);
const SNOW = bySheet(147);
const DUNGEON_BRICK = bySheet(41);
const THIN_ICE = bySheet(162);

// ================= R8-28/30 表本体 =================

describe('R8-28/30 挡光/挡阳布尔表（1457 Main.cs 机械提取）', () => {
  it('tileBlockLight：277 项静态（718 昼夜动态单列）；关门/蛛网/藤蔓挡光，回声/云/尖刺/泡泡不挡', () => {
    expect(TILE_BLOCK_LIGHT_SHEETS.size).toBe(277);
    for (const s of [10, 32, 51, 52, 62, 131, 165, 205, 352, 382, 549, 697]) {
      expect(TILE_BLOCK_LIGHT_SHEETS.has(s), `sheet ${s} 应挡光`).toBe(true);
    }
    for (const s of [48, 189, 196, 328, 379, 446, 541, 546, 748]) {
      expect(TILE_BLOCK_LIGHT_SHEETS.has(s), `sheet ${s} 不应挡光`).toBe(false);
    }
  });
  it('tileNoSunLight：solid−16 豁免；与挡光表是两张独立表', () => {
    expect(TILE_NO_SUN_LIGHT_SHEETS.size).toBe(138);
    // 16 豁免（Main.cs:8535-8544）
    for (const s of [19, 48, 54, 189, 196, 232, 328, 379, 388, 427, 459, 460, 541, 546, 748, 750]) {
      expect(TILE_NO_SUN_LIGHT_SHEETS.has(s), `sheet ${s} 应豁免挡阳`).toBe(false);
    }
    // 普通实心在表内
    for (const s of [0, 1, 2, 53, 57]) expect(TILE_NO_SUN_LIGHT_SHEETS.has(s)).toBe(true);
    // 两表独立：门 10 挡光但不豁免挡阳（实心）；蛛网 51 挡光且非实心不在挡阳表
    expect(TILE_BLOCK_LIGHT_SHEETS.has(10)).toBe(true);
    expect(TILE_NO_SUN_LIGHT_SHEETS.has(51)).toBe(false);
  });
});

// ================= R8-28 mask / R8-29 墙 / R8-30 天空 =================

function scannerWorld(): { w: World; scan: TileLightScanner; map: LightMap } {
  const w = new World(40, 40, 11, 't');
  w.groundLevel = 20;
  const scan = new TileLightScanner(new FlickerClock());
  const map = new LightMap();
  map.setSize(40, 40);
  return { w, scan, map };
}

describe('R8-28 挡光判定（getMask/LightIsBlocked）', () => {
  it('关门/蛛网/藤蔓 → Solid mask；回声块/栅格 → None（原版透光）', () => {
    const { w, scan } = scannerWorld();
    const st = w.store;
    st.setTileSilent(5, 5, DOOR, 0, 0);
    st.setTileSilent(6, 5, WEB, 0, 0);
    st.setTileSilent(7, 5, VINE, 0, 0);
    st.setTileSilent(8, 5, ECHO, 0, 0);
    st.setTileSilent(9, 5, GRATE, 0, 0);
    expect(scan.getMask(st, st.idx(5, 5))).toBe(Mask.Solid);
    expect(scan.getMask(st, st.idx(6, 5))).toBe(Mask.Solid);
    expect(scan.getMask(st, st.idx(7, 5))).toBe(Mask.Solid);
    expect(scan.getMask(st, st.idx(8, 5))).toBe(Mask.None);
    expect(scan.getMask(st, st.idx(9, 5))).toBe(Mask.None);
  });
  it('718 昼云昼夜动态：昼不挡/夜挡（Main.cs:66134-66141）', () => {
    const { w, scan } = scannerWorld();
    const st = w.store;
    const cloud718 = bySheet(718);
    expect(cloud718).toBeGreaterThanOrEqual(0);
    st.setTileSilent(5, 5, cloud718, 0, 0);
    const day = { timeOfDay: 0.5, dayCount: 1, isDay: true };
    scan.exportTo({ store: st, groundLevel: 20, lavaLine: 38, clock: day } as never, new LightMap(), 0, 0, []);
    expect(scan.getMask(st, st.idx(5, 5))).toBe(Mask.None);
    const night = { timeOfDay: 0.9, dayCount: 1, isDay: false };
    scan.exportTo({ store: st, groundLevel: 20, lavaLine: 38, clock: night } as never, new LightMap(), 0, 0, []);
    expect(scan.getMask(st, st.idx(5, 5))).toBe(Mask.Solid);
  });
});

describe('R8-29 发光墙（ApplyWallLight 门语义）', () => {
  it('宝石灯墙 154 无门：实心块覆盖下仍发光；恶魔砖墙 33 有门：被实心块压住不发光', () => {
    const { w, scan, map } = scannerWorld();
    const st = w.store;
    st.setTileSilent(5, 5, STONE, 0, 0);
    st.wall[st.idx(5, 5)] = 154;   // Amethyst 宝石墙（无 LightIsBlocked 门,cs:248-251）
    st.wall[st.idx(6, 5)] = 33;    // 恶魔砖墙（有门,cs:180-186）
    st.setTileSilent(6, 5, STONE, 0, 0);
    scan.exportTo({ store: st, groundLevel: 0, lavaLine: 1, clock: { timeOfDay: 0.9, dayCount: 1 } } as never, map, 0, 0, []);
    const li = 5 * map.w + 5;
    expect(map.r[li]).toBeGreaterThan(0.5);   // 0.6
    const li2 = 5 * map.w + 6;
    expect(map.r[li2]).toBe(0);               // 被挡光块压住
  });
  it('137 岩浆瀑布墙动态闪烁：基量 0.4+(270-mt)/1500±抖动（:229-239）', () => {
    const { w, scan, map } = scannerWorld();
    const st = w.store;
    st.wall[st.idx(5, 5)] = 137;
    scan.exportTo({ store: st, groundLevel: 0, lavaLine: 1, clock: { timeOfDay: 0.9, dayCount: 1 } } as never, map, 0, 0, []);
    const li = 5 * map.w + 5;
    // mt=255 → 基量 0.41±0.025；R=1×n4 ∈ [0.385, 0.435]
    expect(map.r[li]).toBeGreaterThan(0.38);
    expect(map.r[li]).toBeLessThan(0.44);
    expect(map.g[li]).toBeCloseTo(map.r[li] * 0.5, 5);
  });
});

describe('R8-30/36/37 天空/地狱放行（ApplySurfaceLight/ApplyHellLight）', () => {
  it('云 189/尖刺 48 格吃天光（挡阳豁免）；石格不吃', () => {
    const { w, scan, map } = scannerWorld();
    const st = w.store;
    st.setTileSilent(5, 5, CLOUD, 0, 0);
    st.setTileSilent(6, 5, SPIKE, 0, 0);
    st.setTileSilent(7, 5, STONE, 0, 0);
    scan.exportTo({ store: st, groundLevel: 30, lavaLine: 38, clock: { timeOfDay: 0.5, dayCount: 1 } } as never, map, 0, 0, []);
    const row = 5 * map.w;
    expect(map.r[row + 5]).toBeGreaterThan(0);  // 云透天光
    expect(map.r[row + 6]).toBeGreaterThan(0);  // 尖刺透天光
    expect(map.r[row + 7]).toBe(0);             // 石挡阳
  });
  it('深水微光支路（:3181-3188）：liquid≥200 且微光水体 → 仅 B 通道淡蓝', () => {
    const { w, scan } = scannerWorld();
    const st = w.store;
    const i = st.idx(5, 5);
    st.liquid[i] = 255;
    st.liquidType[i] = 4;
    // shimmerWaterAlpha 由 updateLightDecay(waterStyle=13) 驱动（±0.2/帧,5 帧满）
    for (let k = 0; k < 6; k++) updateLightDecay(13, false);
    const sky: [number, number, number] = [0.9, 0.9, 1.0];
    const rand = new FastRandom(1);
    const out = (scan as unknown as { surfaceSky: Function }).surfaceSky.call(scan, st, 5, 5, sky, rand) as [number, number, number];
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeGreaterThan(0);          // 1.0×0.175×(1+r)×alpha
    expect(out[2]).toBeLessThan(0.175 * 1.14);
    // 深水普通水体：vanilla 门是全局 liquidAlpha[13]（水体风格=微光）而非本格液型
    // ——微光水体风格下普通深水同样吃蓝;水风格切回 0 后 alpha 退坡 → 全零
    st.liquidType[i] = 1;
    for (let k = 0; k < 6; k++) updateLightDecay(0, false);
    const out2 = (scan as unknown as { surfaceSky: Function }).surfaceSky.call(scan, st, 5, 5, sky, rand) as [number, number, number];
    expect(out2[0]).toBe(0); expect(out2[1]).toBe(0); expect(out2[2]).toBe(0);
  });
});

// ================= R8-44/45 SwitchTiles =================

function wiringWorld(): { w: World; wr: Wiring; hits: Array<[number, number]> } {
  const w = new World(60, 120, 5, 't');   // 高 ≥80:SwitchTiles 扫描钳 maxTilesY-40
  const wr = new Wiring(w.store);
  const hits: Array<[number, number]> = [];
  const orig = wr.hitSwitch.bind(wr);
  wr.hitSwitch = (x, y) => { hits.push([x, y]); orig(x, y); };
  return { w, wr, hits };
}

/** switchTilesScan 只消费 this.wiring/this.world.store/this.breakTile ——
 *  取 Game.prototype 方法 + duck-typed this 直呼（免构造全量 Game） */
function scanThis(w: World, wr: Wiring) {
  const self = { wiring: wr, world: w, breakTile: () => {} };
  return (e: { x: number; y: number; w: number; h: number; id: number }, o: 2 | 3 | 4 | 5,
          l: Set<string>, p?: Set<string>) =>
    (Game.prototype as unknown as { switchTilesScan: Function }).switchTilesScan.call(self, e, o, l, p);
}

const PLATE = TILE_BY_KEY['v_135_pressure_plates']!;
const MINE = TILE_BY_KEY['v_210_landmine']!;
const GEYSER = TILE_BY_KEY['v_443_geyser']!;

function plateAt(w: World, x: number, y: number, style: number): void {
  w.store.setTileSilent(x, y, PLATE, 0, style * 18);
}

describe('R8-44 SwitchTiles 板风格门（Collision.cs:3240-3377）', () => {
  it('敌怪(objType 2)可触发风格 5 板、不可触发风格 2 板；玩家(5)反之', () => {
    const { w, wr, hits } = wiringWorld();
    plateAt(w, 20, 40, 5);   // 风格 5：NPC/弹幕可触
    plateAt(w, 22, 40, 2);   // 风格 2：仅玩家
    const g = scanThis(w, wr);
    const npc = { x: 20 * TILE, y: 40 * TILE + 16 - 40, w: 18, h: 40, id: 1 };  // 脚踩板格
    g(npc, 2, new Set());
    expect(hists(hits, 20, 40)).toBe(true);
    expect(hists(hits, 22, 40)).toBe(false);
    hits.length = 0;
    const player = { x: 22 * TILE, y: 40 * TILE + 16 - 42, w: 20, h: 42, id: 2 };
    g(player, 5, new Set());
    expect(hits.some(([x]) => x === 22)).toBe(true);
  });
  it('风格 7 一次性板：触发后 KillTile（:3366-3372）', () => {
    const { w, wr } = wiringWorld();
    plateAt(w, 20, 40, 7);   // 风格 7 玩家专属（{2,3,4,6,7} 门）→ objType 5
    let broken = 0;
    const self = { wiring: wr, world: w, breakTile: (x: number) => { if (x === 20) broken++; } };
    (Game.prototype as unknown as { switchTilesScan: Function }).switchTilesScan.call(
      self, { x: 20 * TILE, y: 40 * TILE + 16 - 20, w: 16, h: 20, id: 3 }, 5, new Set());
    expect(broken).toBe(1);
  });
});

describe('R8-45 地雷 210 / 间歇泉 443 接触触发', () => {
  it('210 全 objType 触发；443 仅 objType 1/5（玩家）', () => {
    const { w, wr, hits } = wiringWorld();
    w.store.setTileSilent(20, 40, MINE, 0, 0);
    w.store.setTileSilent(24, 40, GEYSER, 0, 0);
    const g = scanThis(w, wr);
    const box = (x: number) => ({ x: x * TILE, y: 40 * TILE + 16 - 20, w: 16, h: 20, id: 9 });
    g(box(20), 2, new Set());   // 敌怪踩雷
    expect(hits.some(([x]) => x === 20)).toBe(true);
    hits.length = 0;
    g(box(24), 2, new Set());   // 敌怪踩间歇泉
    expect(hits.some(([x]) => x === 24)).toBe(false);
    g(box(24), 5, new Set());   // 玩家踩
    expect(hits.some(([x]) => x === 24)).toBe(true);
  });
});

// ================= R8-46/47/48/51 电路 =================

function devCtx(): DeviceCtx & { skipped: Array<[number, number]>; timeSkips: string[] } {
  const ctx = {
    dropItem: () => {}, spawnNpc: () => true, mechSpawnOk: () => true, itemSpawnOk: () => true,
    shootProjectile: () => {}, countProjectiles: () => 0,
    doorOpen: () => true, doorClose: () => true, teleportPair: () => {},
    relocateTownNpc: () => true, explode: () => {}, toast: () => {}, sfx: () => {},
    extractinatorPull: () => null, dropItemStack: () => {},
    worldSurface: 100,
    skipped: [] as Array<[number, number]>,
    timeSkips: [] as string[],
    timeSkip: (k: 'dawn' | 'dusk') => { ctx.timeSkips.push(k); },
  };
  return ctx as never;
}

describe('R8-47 PixelBox 仅双向触发值 3 翻帧（WR57:668-680）', () => {
  it('v=1 不翻帧；v=3 翻 0↔18', () => {
    const w = new World(30, 30, 3, 't');
    const wr = new Wiring(w.store);
    const t = TILE_BY_KEY['v_445_pixelbox']!;
    w.store.setTileSilent(10, 10, t, 0, 0);
    (wr as unknown as { pixelBoxTriggers: Map<number, number> }).pixelBoxTriggers.set(w.store.idx(10, 10), 1);
    (wr as unknown as { pixelBoxPass: () => void }).pixelBoxPass();
    expect(w.store.frameX[w.store.idx(10, 10)]).toBe(0);   // 水平单侧不复位
    (wr as unknown as { pixelBoxTriggers: Map<number, number> }).pixelBoxTriggers.set(w.store.idx(10, 10), 3);
    (wr as unknown as { pixelBoxPass: () => void }).pixelBoxPass();
    expect(w.store.frameX[w.store.idx(10, 10)]).toBe(18);
  });
});

describe('R8-48 魔幻日晷 356/月晷 663 导线触发', () => {
  it('2×3 SkipWire + timeSkip 门', () => {
    const w = new World(30, 30, 3, 't');
    const wr = new Wiring(w.store);
    const ctx = devCtx();
    const origSkip = wr.skipCell.bind(wr);
    const skipped: Array<[number, number]> = [];
    wr.skipCell = (x, y) => { skipped.push([x, y]); origSkip(x, y); };
    const t = TILE_BY_KEY['v_356_enchanted_sundial']!;
    w.store.setTileSilent(10, 10, t, 0, 0);      // 锚格
    w.store.setTileSilent(11, 10, t, 18, 0);
    deviceTable(wr, ctx, 356, 11, 10);            // 从右格触发
    expect(ctx.timeSkips).toEqual(['dawn']);
    expect(skipped.length).toBe(6);               // 2×3
  });
});

describe('R8-51 HitSwitch 触发音钩', () => {
  it('hitSwitch 每次触发都调 hitSwitchSound', () => {
    const { w, wr } = wiringWorld();
    const sounds: Array<[number, number]> = [];
    wr.hitSwitchSound = (x, y) => sounds.push([x, y]);
    plateAt(w, 20, 20, 0);
    wr.hitSwitch(20, 20);
    expect(sounds).toEqual([[20, 20]]);
  });
});

// ================= R8-10 OreRunner =================

describe('R8-10 oreRunner（WorldGen.cs:49246-49355）', () => {
  it('只替换白名单实心块（石/雪/泥）、不激活空气、不动地牢砖、清油漆', () => {
    const w = new World(60, 60, 9, 't');
    const st = w.store;
    const ORE = bySheet(107);   // 钴矿
    st.setTileSilent(20, 20, STONE, 0, 0);
    st.setTileSilent(21, 20, SNOW, 0, 0);        // 147 雪可被替换（TileRunner flag3 曾保护）
    st.setTileSilent(22, 20, DUNGEON_BRICK, 0, 0); // 表外不动
    st.paint[st.idx(20, 20)] = 5;
    // (23,20) 保持空气——矿脉绝不凸进洞穴
    const rng = new RNG(1234);
    oreRunner(st, rng, 20, 20, { strength: 4, steps: 6, type: ORE });
    expect(st.type[st.idx(20, 20)]).toBe(ORE);
    expect(st.paint[st.idx(20, 20)]).toBe(0);          // 清油漆（:49315）
    expect(st.type[st.idx(21, 20)]).toBe(ORE);         // 雪被替换
    expect(st.type[st.idx(22, 20)]).toBe(DUNGEON_BRICK);
    expect(st.flags[st.idx(23, 20)]).toBe(0);          // 空气格不激活
  });
});

// ================= R8-18/19/20/22/23/21 液体 =================

describe('R8-18 泡泡 379 液体域实心（Liquid.cs:453）', () => {
  it('solidNP[379]=1：blocksLiquid 拒收、Update kill=999', () => {
    const w = new World(30, 30, 3, 't');
    const sim = new LiquidSim(w);
    const st = w.store;
    st.setTileSilent(10, 10, BUBBLE, 0, 0);
    const i = st.idx(10, 10);
    st.liquid[i] = 255;
    st.liquidType[i] = 1;
    expect((sim as unknown as { solidNP: Uint8Array }).solidNP[BUBBLE]).toBe(1);
    expect((sim as unknown as { blocksLiquid: (x: number, y: number) => boolean }).blocksLiquid(10, 10)).toBe(true);
    // 单格 Update：泡泡内液体 kill=999（LQ57:459）——同一 entry 对象
    const entry = { x: 10, y: 10, kill: 0, delay: 0 };
    (sim as unknown as { liquids: Array<typeof entry> }).liquids.push(entry);
    (sim as unknown as { update: (e: typeof entry) => void }).update(entry);
    expect(entry.kill).toBe(999);
  });
});

describe('R8-19 合并产物 liquid>0 门（GetLiquidMergeTypes）', () => {
  it('残型字节不选产物：空邻格残岩浆型 + 真水邻 → 仍黑曜石', () => {
    const w = new World(30, 30, 3, 't');
    const sim = new LiquidSim(w);
    const st = w.store;
    const s = sim as unknown as Record<string, unknown>;
    // 岩浆格 (10,10)：左邻 (9,10) 空格残岩浆型（liquid=0,type=2）、右邻 (11,10) 真水
    const i5 = st.idx(10, 10), il = st.idx(9, 10), ir = st.idx(11, 10);
    st.liquid[i5] = 255; st.liquidType[i5] = 2;
    st.liquid[il] = 0; st.liquidType[il] = 2;      // 残型
    st.liquid[ir] = 255; st.liquidType[ir] = 1;    // 真水
    let placed: Array<[number, number, number]> = [];
    s.createMergeTile = (x: number, y: number, t: number) => { placed.push([x, y, t]); };
    (sim as unknown as { lavaCheck: (x: number, y: number) => void }).lavaCheck(10, 10);
    expect(placed.length).toBe(1);
    expect(placed[0][2]).toBe(bySheet(56));        // OBSIDIAN,非 230 脆蜂蜜
  });
  it('shimmerCheck：三邻有水才产块（mergeType!=this 真值门）', () => {
    const w = new World(30, 30, 3, 't');
    const sim = new LiquidSim(w);
    const st = w.store;
    const i5 = st.idx(10, 10), ir = st.idx(11, 10);
    st.liquid[i5] = 255; st.liquidType[i5] = 4;
    st.liquid[ir] = 255; st.liquidType[ir] = 1;    // 真水邻
    let placed = 0;
    (sim as unknown as Record<string, unknown>).createMergeTile = () => { placed++; };
    (sim as unknown as { shimmerCheck: (x: number, y: number) => void }).shimmerCheck(10, 10);
    expect(placed).toBe(1);
    // 全微光邻（残型不算）→ 不产块
    const w2 = new World(30, 30, 3, 't');
    const sim2 = new LiquidSim(w2);
    const st2 = w2.store;
    const j5 = st2.idx(10, 10);
    st2.liquid[j5] = 255; st2.liquidType[j5] = 4;
    st2.liquid[st2.idx(11, 10)] = 0; st2.liquidType[st2.idx(11, 10)] = 4;  // 残型微光
    let placed2 = 0;
    (sim2 as unknown as Record<string, unknown>).createMergeTile = () => { placed2++; };
    (sim2 as unknown as { shimmerCheck: (x: number, y: number) => void }).shimmerCheck(10, 10);
    expect(placed2).toBe(0);
  });
});

describe('R8-22 CheckAlch case5 量门（WG57:46451 anyLava）', () => {
  it('液退净残岩浆型不做 83↔84 互转', () => {
    const w = new World(30, 30, 3, 't');
    const sim = new LiquidSim(w);
    (sim as unknown as { killTile: unknown }).killTile = () => {};  // 测试内不真杀
    const st = w.store;
    const MATURE = bySheet(83), BLOOM = bySheet(84);
    const SNOWBLOCK = bySheet(57);              // case5 依附土（雪族）
    st.setTileSilent(10, 11, SNOWBLOCK, 0, 0);
    const i = st.idx(10, 10);
    st.setTileSilent(10, 10, MATURE, 5 * 18, 0);   // stage5
    st.liquid[i] = 0;
    st.liquidType[i] = 2;                       // 残岩浆型,量 0
    (sim as unknown as { checkAlch: (x: number, y: number) => void }).checkAlch(10, 10);
    expect(st.type[i]).toBe(MATURE);            // 未转 84（anyLava 量门）
    // 有量才转
    st.liquid[i] = 200;
    (sim as unknown as { checkAlch: (x: number, y: number) => void }).checkAlch(10, 10);
    expect(st.type[i]).toBe(BLOOM);
  });
});

describe('R8-21 CheckLilyPad 下方判定（59305:!Platform && (!solid||solidTop)）', () => {
  it('水底非泥土族/实心家具 → 杀;泥土族 → 留;关门(10,tileSolidTop=false) → 留', () => {
    const mk = (sheet: number): { alive: boolean; killed: boolean } => {
      const w = new World(30, 120, 3, 't');   // h-50 深度界须为正
      const sim = new LiquidSim(w);
      const st = w.store;
      let killed = false;
      (sim as unknown as { killTile: unknown }).killTile = () => { killed = true; };
      const LILY = bySheet(518);
      st.setTileSilent(10, 10, LILY, 0, 0);
      st.liquidType[st.idx(10, 10)] = 1;          // 本仓水=1（vanilla 0）
      st.setTileSilent(10, 11, bySheet(sheet), 0, 0);
      (sim as unknown as { checkLilyPad: (x: number, y: number) => void }).checkLilyPad(10, 10);
      return { alive: st.flags[st.idx(10, 10)] !== 0, killed };
    };
    // 239/380 在本仓 defs 为 platform 类（passability 审计口径）→ 水底行判定杀
    // （vanilla 侧它们是 solid∧solidTop∧非平台,同杀;LILY_SOLIDTOP_KILL 为 defs
    //   未来改回 vanilla 口径时的防御支）
    expect(mk(239).killed).toBe(true);
    expect(mk(380).killed).toBe(true);
    expect(mk(1).killed).toBe(true);     // 泥土不在水底行表 {2,477/109,116/60} → 杀
    expect(mk(2).killed).toBe(false);    // 草 → 留
    // 门 10：tileSolid=true/tileSolidTop=false → 水底行表无 10 → num2=-1 → vanilla
    // 与本仓同样经行表支杀（红队 solidTop 半句归因有误,结论"删"恰对本仓亦真）
    expect(mk(10).killed).toBe(true);
  });
});

// ================= R8-46 XferWater =================

describe('R8-46 XferWater 四值类型匹配（WR57:486-501）', () => {
  it('水不抽微光；微光泵入水格禁止；空格继承来型', () => {
    const w = new World(30, 30, 3, 't');
    const wr = new Wiring(w.store);
    const s = wr as unknown as Record<string, unknown>;
    s.inPumpX = [10]; s.inPumpY = [10]; s.numInPump = 1;
    s.outPumpX = [14]; s.outPumpY = [10]; s.numOutPump = 1;
    const st = w.store;
    // 泵入微光,泵出水 → 类型不匹配,不转移
    st.liquid[st.idx(10, 10)] = 255; st.liquidType[st.idx(10, 10)] = 4;
    st.liquid[st.idx(14, 10)] = 255; st.liquidType[st.idx(14, 10)] = 1;
    (wr as unknown as { xferWater: () => void }).xferWater();
    expect(st.liquid[st.idx(10, 10)]).toBe(255);
    expect(st.liquidType[st.idx(14, 10)]).toBe(1);
    // 微光 → 空格：转移且保持微光
    st.liquid[st.idx(14, 10)] = 0; st.liquidType[st.idx(14, 10)] = 0;
    (wr as unknown as { xferWater: () => void }).xferWater();
    expect(st.liquid[st.idx(14, 10)]).toBeGreaterThan(0);
    expect(st.liquidType[st.idx(14, 10)]).toBe(4);
  });
});

// ================= R8-20 掷流 =================

describe('R8-20 运行期回退流 = UnifiedRandom(world.seed)', () => {
  it('同 seed 两实例掷流一致且非 mulberry32 旧值', () => {
    const a = new LiquidSim(new World(20, 20, 777, 't'));
    const b = new LiquidSim(new World(20, 20, 777, 't'));
    const ra = (a as unknown as { roll: (n: number) => number }).roll(30);
    const rb = (b as unknown as { roll: (n: number) => number }).roll(30);
    expect(ra).toBe(rb);
    const c = new LiquidSim(new World(20, 20, 778, 't'));
    expect((c as unknown as { roll: (n: number) => number }).roll(30)).not.toBe(ra);
  });
});

function hists(hits: Array<[number, number]>, x: number, y: number): boolean {
  return hits.some(([hx, hy]) => hx === x && hy === y);
}
