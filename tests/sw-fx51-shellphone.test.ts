// ★FX51-SP 2026-09-16 贝壳电话（Shellphone）三案修复守卫——用户实报：
//   ①「无法传送」②「右键无法设置传送点」③「不显示各种信息了」——三案同源根因 =
//   合成产物是 ShellphoneDummy 5437（Recipe.cs:13712 createItem.SetDefaults(5437),
//   Crystal Ball 114 + 手机 3124 + 魔海螺 4263 + 恶魔海螺 4819）,而原版：
//   · 传送分派四块（Player.cs:43309/:43331/:43373/:43393）全按 item.type 求值——
//     5437 不在其中（不能传）;唯一消费面 = 右键快换表 case 5437→5358【转正】
//     （Player.cs:31852-31855 ItemCheck_ManageRightClickFeatures）;
//   · 目的地循环 5358(Home)→5360(Ocean)→5361(Hell)→5359(Spawn)→5358
//     （Player.cs:31840-31851,PlaySound(22)=Unlock,ChangeItemType :31874）;
//   · 信息全开表 RefreshInfoAccsFromItemType（Player.cs:12851-12897）含
//     5358/5359/5360/5361、【不含】5437——持 Dummy 零信息 = 原版本相。
// 金标（Terarria1457/,1458 同域 diff=same）：
//   A. 右键循环/转正序 + Unlock 音（Player.cs:31840-31855,SoundID.cs:49 LegacyID 22）
//   B. 5359 落点 = 世界出生点（Shellphone_Spawn Player.cs:56821-56838）：Main.spawnTileX/Y
//      直取【不吃床】+ Spawn_GetPositionAtWorldSpawn 扫位（:38003）+ 全堵 ForceClearArea
//      + ToWorldCoordinates(8f,0f)−(width/2,height)（:56829）+ Teleport(style 11)
//      → TeleportEffect style 11（Main.cs:13595-13622）=50×尘 267{绿×2/黄/白}×2速
//      scale0.8+0.6r fadeIn0.5 无音效臂;与 5358 的 Spawn(RecallFromItem) 床点分道。
//   C. 5358 = 魔镜族尘臂（Player.cs:43307-43312 块 item.type=={50,3124,3199,5358}）:
//      kind 'spawn' 床点回家 + 140 白尘 15（recallSparkleDust 面,bj57 同式）。
//   D. 5360/5361 路由 = ocean/hell kind（Player.cs:43331/:43373 块 →MagicConch/
//      DemonConch :56755/:56840）——落点行为本体由 sw-bj43-conch-landing/sw-rb10a 覆盖,
//      此处锁路由映射 + 尘/音分型（style5=水尘×100+splash/style7=尘35×50+Item8）。
//   E. 信息面：refreshInfoAccsFromItemType(5358)=12 门禁全开;5437=零门禁（负面对照）。
//   F. BJ69 回填：heldItemUseStyle(5358)=4（Item.cs:42506-42516 case 5358 与 5437
//      共享体,FX53 提取盲区回填）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/Game';
import { heldItemUseStyle } from '../src/core/Game';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE } from '../src/core/constants';
import { ITEM_DEFS } from '../src/data/items';
import { VanillaDust } from '../src/fx/VanillaDust';
import { refreshInfoAccsFromItemType, emptyInfoAccGates } from '../src/stats/InfoAccs';
import { seededRandom } from './seeded-rng';

/* eslint-disable @typescript-eslint/no-explicit-any */
const vidOf = (d: { vid?: number; key: string }) =>
  d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
const slotOfVid = (vid: number) => ITEM_DEFS.findIndex((d) => vidOf(d) === vid);

function paintRect(st: import('../src/world/TileStore').TileStore,
  x0: number, x1: number, y0: number, y1: number, type: number): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setTileSilent(x, y, type);
}
const activeDust = (g: any) => (g.vanillaDust as VanillaDust)['pool'].filter((d: { active: boolean }) => d.active);
const d267 = (g: any) => activeDust(g).filter((d: { type: number }) => d.type === 267);
const d15 = (g: any) => activeDust(g).filter((d: { type: number }) => d.type === 15);
const d35 = (g: any) => activeDust(g).filter((d: { type: number }) => d.type === 35);

/** swap 桩：inv 单槽 + sfx 日志 + onInventoryChanged 计数 */
function swapStub(): { g: any; sfxLog: string[]; changed: { n: number }; slot: { id: number } } {
  const g = Object.create(Game.prototype) as any;
  const sfxLog: string[] = [];
  const changed = { n: 0 };
  const slot = { id: slotOfVid(5437) };
  g.player = { inv: { selected: 0, slots: [slot] } };
  g.cb = { onInventoryChanged: () => { changed.n++; } };
  g.sfx = { play: (k: string) => { sfxLog.push(k); } };
  return { g, sfxLog, changed, slot };
}

/** fire 桩（sw-bj57 fireStub 同法）——resolvePlayerSpawnPoint 可注床点 */
function fireStub(world: World, playerPos = { x: 130 * TILE, y: 140 * TILE },
  spawnPoint?: [number, number]): { g: any; sfxLog: string[]; removed: { n: number } } {
  const g = Object.create(Game.prototype) as any;
  const removed = { n: 0 };
  g.world = world;
  g.player = {
    x: playerPos.x, y: playerPos.y, vx: 3, vy: 0, w: 20, h: 42,
    iframes: 0, fallStartY: null, team: 0,
    cx: playerPos.x + 10, cy: playerPos.y + 21,
    inv: { removeHeld: (n: number) => { removed.n += n; } },
    removeAllGrapplingHooks: () => {},
    updateUnbreakableWallScan: () => {},
    equipStats: { fireWalk: false },
    buffs: null,
  };
  g.camera = { x: 0, y: 0 };
  g.cb = {};
  g.net = null;
  g.spectatingSlot = -1;
  g.lastStripReq = '';
  g.vanillaDust = new VanillaDust();
  const sfxLog: string[] = [];
  g.sfx = { play: (k: string) => { sfxLog.push(k); } };
  g.resolvePlayerSpawnPoint = () => spawnPoint ?? [world.spawnX0, world.spawnY0];
  return { g, sfxLog, removed };
}

const fire = (g: any, c: { vid: number; kind: string; triggerAt: number; consume: boolean }): void =>
  (g as unknown as { fireRecallTeleport(c: typeof c): void }).fireRecallTeleport(c);

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(0x5358)); });
afterEach(() => { vi.restoreAllMocks(); });

describe('FX51-SP A 右键转正+目的地循环（Player.cs:31840-31855 快换表 1:1）', () => {
  it('5437 Dummy→5358 转正,而后 5358→5360→5361→5359→5358 四态循环;音=unlock(SoundID 22)', () => {
    const { g, sfxLog, changed, slot } = swapStub();
    const swap = (g as unknown as { swapShellphoneDestination(v: number): boolean });
    // ① Dummy 转正
    expect(slot.id, '预置=合成产物 Dummy 5437').toBe(slotOfVid(5437));
    expect(swap.swapShellphoneDestination(5437), '5437→5358 转正成功').toBe(true);
    expect(slot.id, '转正=Shellphone(Home) 5358').toBe(slotOfVid(5358));
    expect(sfxLog).toEqual(['unlock']);            // PlaySound(22)=Unlock（SoundID.cs:49）
    expect(changed.n).toBe(1);
    // ② 四态循环序（:31840-31851）
    const cycle: Array<[number, number]> = [[5358, 5360], [5360, 5361], [5361, 5359], [5359, 5358]];
    for (const [from, to] of cycle) {
      expect(swap.swapShellphoneDestination(from), `${from}→${to}`).toBe(true);
      expect(slot.id, `${from} 换型后=${to}`).toBe(slotOfVid(to));
    }
    expect(sfxLog.length, '每换一响').toBe(5);
    expect(changed.n).toBe(5);
  });

  it('非家族 vid 拒换（返回 false 零副作用）——50 魔镜不在快换表', () => {
    const { g, sfxLog, slot } = swapStub();
    slot.id = slotOfVid(50);
    expect((g as unknown as { swapShellphoneDestination(v: number): boolean })
      .swapShellphoneDestination(50)).toBe(false);
    expect(slot.id).toBe(slotOfVid(50));
    expect(sfxLog).toEqual([]);
  });
});

describe('FX51-SP B 5359 世界出生点落位（Shellphone_Spawn Player.cs:56821-56838）', () => {
  it('落点=spawnX0/Y0 扫位行:中心 x=fx*16+8、y=fy*16−h(脚底钉实心行顶);床点无关【不吃床】', () => {
    const w = new World(300, 240, 7, 'fx51-sp-a');
    w.groundLevel = 128;
    paintRect(w.store, 140, 160, 150, 150, TILE_BY_KEY['stone']);   // 实心行=150
    w.spawnX0 = 150; w.spawnY0 = 150;                 // Main.spawnTileX/Y=世界出生点
    w.spawnX = 200; w.spawnY = 140;                   // 床点（5358 面）——5359 不得消费
    const r = fireStub(w);
    fire(r.g, { vid: 5359, kind: 'worldSpawn', triggerAt: 45, consume: false });
    expect(r.g.player.x, '中心 x=floorX*16+8（ToWorldCoordinates(8f,0f)−w/2 → 中心口径）')
      .toBe(150 * TILE + 8);
    expect(r.g.player.y, 'y=floorY*16−h（脚底=floorY 行顶;非 Spawn 臂 (fy−3)*16 旧口径）')
      .toBe(150 * TILE - 42);
    expect(r.g.player.vx, 'velocity=Vector2.Zero（:56831）').toBe(0);
    expect(r.g.player.vy).toBe(0);
    expect(r.g.player.fallStartY, 'Teleport :37730 fallStart 重置').toBeNull();
  });

  it('TeleportEffect style 11 尘面（Main.cs:13595-13622）:100×尘267(Entry+Exit) 三色/±4速/scale0.8..1.4/fadeIn0.5;零音效', () => {
    const w = new World(300, 240, 7, 'fx51-sp-b');
    w.groundLevel = 128;
    paintRect(w.store, 140, 160, 150, 150, TILE_BY_KEY['stone']);
    w.spawnX0 = 150; w.spawnY0 = 150;
    const r = fireStub(w);
    fire(r.g, { vid: 5359, kind: 'worldSpawn', triggerAt: 45, consume: false });
    const ds = d267(r.g);
    expect(ds.length, '50(Entry)+50(Exit)').toBe(100);
    const palette = JSON.stringify([
      { r: 100, g: 255, b: 100, a: 255 }, { r: 255, g: 255, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 },
    ]);
    for (const d of ds) {
      expect(palette.includes(JSON.stringify(d.color)), '色骰 Next(4)→{绿×2,黄,白}').toBe(true);
      expect(Math.abs(d.vx), 'NewDustPerfect 内速±2 ×2 → ≤4').toBeLessThanOrEqual(4.001);
      expect(Math.abs(d.vy)).toBeLessThanOrEqual(4.001);
      expect(d.scale, '0.8f+NextFloat×0.6f').toBeGreaterThanOrEqual(0.8);
      expect(d.scale).toBeLessThanOrEqual(1.4);
      expect(d.noGravity, 'noGravity=true').toBe(true);
      expect(d.fadeIn, 'fadeIn=0.5（与通道尘的差别面）').toBeCloseTo(0.5, 6);
    }
    expect(r.sfxLog, 'style 11 块无 PlaySound 臂（Main.cs:13595-13622）;Item6 在起手拍').toEqual([]);
    expect(r.removed.n, '5359 非消耗品').toBe(0);
  });

  it('尘点=玩家盒内（NextVector2FromRectangle(effectRect),effectRect=玩家 getRect）', () => {
    const w = new World(300, 240, 7, 'fx51-sp-c');
    w.groundLevel = 128;
    paintRect(w.store, 140, 160, 150, 150, TILE_BY_KEY['stone']);
    w.spawnX0 = 150; w.spawnY0 = 150;
    const r = fireStub(w);
    const px0 = r.g.player.x;
    fire(r.g, { vid: 5359, kind: 'worldSpawn', triggerAt: 45, consume: false });
    for (const d of d267(r.g)) {
      const inBox = (x: number, y: number) =>
        x >= Math.min(px0, r.g.player.x) && x <= Math.max(px0, r.g.player.x) + 20
        && y >= Math.min(r.g.player.y, 140 * TILE) && y <= Math.max(r.g.player.y, 140 * TILE) + 42;
      expect(inBox(d.x, d.y), `尘(${Math.round(d.x)},${Math.round(d.y)})∈新旧位盒并集`).toBe(true);
    }
  });
});

describe('FX51-SP C/D 四态路由分型（5358 床点/5359 世界点/5360 海洋/5361 地狱）', () => {
  it('5358=床点回家（Spawn(RecallFromItem) 面）:resolvePlayerSpawnPoint 床点臂直置+140 白尘 15', () => {
    const w = new World(300, 240, 7, 'fx51-sp-d');
    w.groundLevel = 128;
    paintRect(w.store, 100, 200, 150, 152, TILE_BY_KEY['stone']);
    w.spawnX0 = 150; w.spawnY0 = 149;
    const BED: [number, number] = [180, 149];
    const r = fireStub(w, { x: 130 * TILE, y: 140 * TILE }, BED);
    fire(r.g, { vid: 5358, kind: 'spawn', triggerAt: 45, consume: false });
    expect(r.g.player.x, '床点臂 [sx*16+8, (sy−3)*16]（spawnPlacementCoords ②直置）')
      .toBe(BED[0] * TILE + 8);
    expect(r.g.player.y).toBe((BED[1] - 3) * TILE);
    const ds = d15(r.g);
    expect(ds.length, '70+70 白尘 15（魔镜族 :43319-43328 同臂）').toBe(140);
    for (const d of ds) expect(d.color, '魔镜族=null 色').toBeNull();
    expect(d267(r.g).length, '5358 不走 267 尘').toBe(0);
  });

  it('5359 与 5358 同帧分道：床点在侧,5359 仍落世界点（快换表两变体语义差）', () => {
    const w = new World(300, 240, 7, 'fx51-sp-e');
    w.groundLevel = 128;
    paintRect(w.store, 140, 210, 150, 150, TILE_BY_KEY['stone']);
    w.spawnX0 = 150; w.spawnY0 = 150;
    const BED: [number, number] = [200, 149];
    const rBed = fireStub(w, { x: 130 * TILE, y: 140 * TILE }, BED);
    fire(rBed.g, { vid: 5358, kind: 'spawn', triggerAt: 45, consume: false });
    const rWorld = fireStub(w, { x: 130 * TILE, y: 140 * TILE }, BED);
    fire(rWorld.g, { vid: 5359, kind: 'worldSpawn', triggerAt: 45, consume: false });
    expect(rBed.g.player.x).toBe(BED[0] * TILE + 8);
    expect(rWorld.g.player.x, '5359 落世界点（非床 200）').toBe(150 * TILE + 8);
  });

  it('5360→ocean 路由:style5 水尘×100（Entry+Exit 各 50）+splash 音;5361→hell:尘35×50+item8 音;2351→random 零音', () => {
    const w = new World(300, 240, 7, 'fx51-sp-f');
    w.groundLevel = 128;
    const rO = fireStub(w);
    (rO.g as unknown as { requestMagicConchTeleportPosition(r: boolean): { x: number; y: number } | null })
      .requestMagicConchTeleportPosition = () => ({ x: 250 * TILE, y: 120 * TILE });
    fire(rO.g, { vid: 5360, kind: 'ocean', triggerAt: 45, consume: false });
    expect(rO.g.player.x).toBe(250 * TILE);
    expect(rO.g.player.y).toBe(120 * TILE);
    expect(rO.sfxLog, 'TeleportEffect style5=Splash（Main.cs:13524）').toEqual(['splash']);
    const water = activeDust(rO.g);
    expect(water.length, '水尘 Entry+Exit 各 100（style5=100 份/次,:13499）').toBe(200);
    expect(new Set(water.map((d: { noGravity: boolean }) => d.noGravity))).toEqual(new Set([true]));

    const rH = fireStub(w);
    (rH.g as unknown as { findTeleportSpot(x0: number, x1: number, y0: number, y1: number): { x: number; y: number } | null })
      .findTeleportSpot = () => ({ x: 149 * TILE, y: 220 * TILE });
    fire(rH.g, { vid: 5361, kind: 'hell', triggerAt: 45, consume: false });
    expect(rH.g.player.x).toBe(149 * TILE);
    expect(rH.sfxLog, 'style7=Item8（Main.cs:13542,★SW-RB10a）').toEqual(['item8']);
    expect(d35(rH.g).length, '50×尘 35（:13516-13532）').toBe(100);   // Entry+Exit 各 50
    expect(d267(rH.g).length, '5361 不走 267').toBe(0);
  });
});

describe('FX51-SP E 信息面（RefreshInfoAccsFromItemType Player.cs:12851-12897 对拍）', () => {
  it('5358-5361 全开 12 门禁（watch3/depth/compass + 9 bool）;5437 零门禁（负面对照）', () => {
    for (const vid of [5358, 5359, 5360, 5361]) {
      const g = emptyInfoAccGates();
      refreshInfoAccsFromItemType(g, vid);
      expect(g.accWatch, `vid ${vid} watch=3`).toBe(3);
      expect(g.accDepthMeter).toBe(1);
      expect(g.accCompass).toBe(1);
      expect(g.accFishFinder && g.accWeatherRadio && g.accCalendar).toBe(true);
      expect(g.accThirdEye && g.accJarOfSouls && g.accCritterGuide).toBe(true);
      expect(g.accStopwatch && g.accOreFinder && g.accDreamCatcher).toBe(true);
    }
    const g5437 = emptyInfoAccGates();
    refreshInfoAccsFromItemType(g5437, 5437);
    expect(g5437, 'Dummy 不在原版全开表（:12851-12897 无 5437 支）=零门禁').toEqual(emptyInfoAccGates());
  });
});

describe('FX51-SP F BJ69 回填 + 结构锁（防回潮）', () => {
  it('heldItemUseStyle(5358)=4（Item.cs:42506-42516 组 {5358,5437} 共享体）', () => {
    expect(heldItemUseStyle(5358)).toBe(4);
    expect(heldItemUseStyle(5437)).toBe(4);
  });

  it('Game.ts 结构锁:worldSpawn kind/5359 分派/循环表 5437→5358/尘臂/回填全在位', () => {
    const src = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    expect(src.includes("type RecallKind = 'spawn' | 'ocean' | 'hell' | 'random' | 'worldSpawn';"),
      'RecallKind 增 worldSpawn').toBe(true);
    expect(src.includes("tvid === 5359 ? 'worldSpawn'"), '分派 5359→worldSpawn').toBe(true);
    expect(/case 5358\(Home\)|5437\(Dummy\)→num=5358|heldVid === 5437 \? 5358/.test(src),
      '循环表含 5437 转正臂').toBe(true);
    expect(src.includes('this.sfx.play(\'unlock\')'), '换型音=Unlock(22)').toBe(true);
    expect(src.includes('this.shellphoneSpawnDust(p.x, p.y)'), 'style 11 尘臂接线').toBe(true);
    expect(/5358: 4,/.test(src), 'NO_USE_STYLE_BACKFILL_1457 补 5358').toBe(true);
    expect(src.includes('spawnGetPositionAtSpawn(st, this.world.spawnX0, this.world.spawnY0)'),
      '5359 扫位走世界出生点').toBe(true);
  });
});
