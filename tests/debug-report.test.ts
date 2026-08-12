// F5 一键调试报告提取器（src/debug/DebugReport.ts）：node 无 DOM 环境样本断言。
// 样本 = World + Player + Enemy.fromVanilla + 真实 ChunkCache/LightingEngine/Wiring，
// 其余（camera/debugSnapshot）用结构兼容桩——collectDebugReport 全程防御式访问。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Enemy } from '../src/entities/Enemy';
import { EntityManager } from '../src/entities/Entity';
import { Inventory } from '../src/items/Inventory';
import { ChunkCache } from '../src/render/ChunkCache';
import { LightingEngine } from '../src/lighting/LightingEngine';
import { Wiring } from '../src/world/Wiring';
import { TILE } from '../src/core/constants';
import { EMPTY_SCENE } from '../src/world/SceneMetrics';
import { WaterfallRenderer } from '../src/render/WaterfallRenderer';
import { SpriteAtlas } from '../src/assets/SpriteAtlas';
import {
  collectDebugReport,
  encodeRle,
  decodeRle,
  dumpArea,
  sheetOfType,
  DEBUG_REPORT_SCHEMA_VERSION,
} from '../src/debug/DebugReport';
import type { Game } from '../src/core/Game';

function sampleWorld(): World {
  const w = new World(80, 60, 42, 'open');
  const st = w.store;
  // 石地板一行 + 泥土块（带帧/墙/液体），供直方图与 RLE 转储断言
  st.setTileSilent(10, 30, 1);
  st.setTileSilent(11, 30, 1);
  st.setTileSilent(12, 30, 2);
  st.setTileSilent(10, 31, 2, 18, 18);
  st.setWallSilent(10, 30, 62);
  st.setWallSilent(11, 30, 62);
  st.setLiquid(12, 31, 128, 1);
  w.groundLevel = 20; w.rockLevel = 35; w.lavaLine = 50;
  w.dungeonX = 40; w.dungeonY = 25;
  w.flags.hardMode = true;
  w.clock.bloodMoon = true;
  w.weather.raining = true;
  w.weather.rainTime = 1234;
  return w;
}

function sampleGame() {
  const world = sampleWorld();
  const player = new Player(10 * TILE + 8, 27 * TILE, new Inventory());
  player.inv.slots[0] = { id: 1, stack: 30, prefix: 0 };
  const e = Enemy.fromVanilla(1, 20 * TILE, 28 * TILE)!;
  const ents = new EntityManager();
  ents.add(e, 'enemies');
  const chunks = new ChunkCache(world, new Map());
  // 一个待重建哨兵 + 一个"已烘焙"假 chunk（node 无 canvas，不触发 get()）
  chunks.chunks.set(ChunkCache.key(0, 1), undefined as never);
  chunks.dirtyQueue.push(ChunkCache.key(0, 1));
  chunks.lastFlushMs = 6.5;
  chunks.lastFlushCount = 3;
  const lighting = new LightingEngine(world);
  lighting.dirty = true;
  lighting.addLight(10, 30, 1, 0.8, 0.5);
  const wiring = new Wiring(world.store);
  const scene = { ...EMPTY_SCENE, tileX: 11, tileY: 28, zoneCorrupt: true, snowTileCount: 42, fountainColor: -1 };
  const game = {
    world,
    player,
    entities: ents,
    chunks,
    lighting,
    wiring,
    scene,
    renderer: { waterfalls: new WaterfallRenderer() },
    pylons: [{ x: 5, y: 6, type: 2 }],
    smartCursor: { wanted: true, showing: true, x: 10, y: 30, lockedDirection: { x: 1, y: 0 } },
    smartSelect: { strategy: 3, slot: 2 },
    enemySpawnEnabled: true,
    forceShowWires: false,
    paused: false,
    fps: 59.5,
    // 真实 SpriteAtlas（vanilla.json 元数据可用；vimages 全空 = 表未载）
    atlas: new SpriteAtlas(),
    // 鼠标 hover → (11,30) 泥土格（screenToWorld 手算路径：桩相机无 tileUnder）
    input: { mouseX: 430, mouseY: 330 },
    camera: { x: 10 * TILE, y: 29 * TILE, zoom: 1.25, zoomTarget: 1.25, viewW: 800, viewH: 600 },
    debugSnapshot: () => ({
      fps: 59.5,
      frameDtMs: [16.8, 16.7],
      hitTilesSize: 2,
      hitTilesTop: [
        { x: 10, y: 30, type: 1, damage: 55, ttl: 60 },
        { x: 11, y: 30, type: 1, damage: 20, ttl: 48 },
      ],
      mining: { x: 10, y: 30, progress: 0.4 },
      swing: { t: 5, dur: 20, item: 1, dmg: null, kb: null, useStyle: 1, aim: null },
      invasionWarn: 3600,
      tickCount: 4321,
    }),
  } as unknown as Game;
  return { game, world, player, e, chunks, lighting, wiring };
}

describe('F5 调试报告（机器优先 JSON）', () => {
  it('RLE 编解码互逆 + 空格合并语义', () => {
    expect(encodeRle(['0', '0', '0', '5:0:18:0:0', '5:0:18:0:0'])).toBe('0*3;5:0:18:0:0*2');
    const toks = ['0', '1:2:3:4:5', '1:2:3:4:5', '1:2:3:4:5', '0', '7:0:0:0:0'];
    expect(decodeRle(encodeRle(toks))).toEqual(toks);
    expect(decodeRle('0*65')).toHaveLength(65);
  });

  it('dumpArea 行 RLE 与原始 store 一致（往返）', () => {
    const w = sampleWorld();
    const st = w.store;
    const area = dumpArea(st, 10, 30, 12, 31);
    expect([area.x0, area.y0, area.w, area.h]).toEqual([10, 30, 3, 2]);
    expect(area.rows).toHaveLength(2);
    // y=30 行：(10,30)(11,30) 同为泥土 type1+帧0+墙62 → 合并成一个 run；
    // (12,30) 石头 type2 是独立 cell
    const row0 = decodeRle(area.rows[0]);
    expect(row0).toHaveLength(3);
    expect(row0[0]).toBe(row0[1]);
    expect(row0[0]).not.toBe(row0[2]);
    for (const tok of row0) expect(tok.split(':')).toHaveLength(5);
    // cell 字段逐一对上 store：sheet:fx:fy:wall:liquid
    const cellAt = (x: number, y: number) => {
      const i = st.idx(x, y);
      const d = st.type[i] > 0
        ? `${sheetOfType(st.type[i])}:${st.frameX[i]}:${st.frameY[i]}:${st.wall[i]}:${st.liquid[i]}`
        : '0';
      return d;
    };
    expect(row0[0]).toBe(cellAt(10, 30));
    expect(row0[1]).toBe(cellAt(11, 30));
    expect(row0[2]).toBe(cellAt(12, 30));
    // 出界裁剪：负起点钳到 0
    const clamped = dumpArea(st, -5, -5, 3, 3);
    expect([clamped.x0, clamped.y0]).toEqual([0, 0]);
  });

  it('collectDebugReport 各段齐全 + ai0 初值/直方图/ChunkCache 哨兵', () => {
    const { game, world, e } = sampleGame();
    const r = collectDebugReport(game, {
      screenshot: false,
      playTimeMs: 123456,
      errors: [{ t: 1, kind: 2, msg: 'boom', stack: 'at x (y.ts:1)' }],
      warnings: [{ t: 2, msg: '[VanillaTiler] 源矩形越界,该格不绘制(每键仅一次): sheet 28' }],
      instanceCount: 2,
    }) as Record<string, Record<string, unknown>>;

    // meta
    expect(r.meta.schemaVersion).toBe(DEBUG_REPORT_SCHEMA_VERSION);
    expect(Number.isNaN(Date.parse(r.meta.generatedAt as string))).toBe(false);
    expect(r.meta.fps).toBeCloseTo(59.5);
    expect(r.meta.playTimeMs).toBe(123456);
    expect(r.meta.viewport).toBeNull();

    // errors ring（注入透传）
    expect(r.errors).toEqual([{ t: 1, kind: 2, msg: 'boom', stack: 'at x (y.ts:1)' }]);
    // warnings ring（注入透传；缺省读 globalThis.__swWarns）
    expect(r.warnings).toEqual([{ t: 2, msg: '[VanillaTiler] 源矩形越界,该格不绘制(每键仅一次): sheet 28' }]);

    // instance（HMR 双实例检测：注入 2）
    expect(r.instance.gameMounts).toBe(2);

    // world
    expect(r.world.name).toBe('open');
    expect(r.world.seed).toBe(42);
    expect(r.world.w).toBe(80);
    expect(r.world.hardMode === undefined).toBe(true); // flags 在 flags 段不在顶层
    expect((r.world.flags as Array<[string, number]>).find(([k]) => k === 'hardMode')).toEqual(['hardMode', 1]);
    expect((r.world.clock as Record<string, unknown>).bloodMoon).toBe(1);
    expect((r.world.weather as Record<string, unknown>).raining).toBe(1);

    // world.zones（SceneMetrics 快照；布尔 0/1、计数原值、器件态）
    const zones = r.world.zones as Record<string, Record<string, unknown>>;
    expect(zones.tileX).toBe(11);
    expect(zones.tileY).toBe(28);
    expect(zones.zone.corrupt).toBe(1);
    expect(zones.zone.crimson).toBe(0);
    expect(zones.counts.snowTile).toBe(42);
    expect(zones.devices.fountainColor).toBe(-1);
    expect(zones.devices.musicBoxStyle).toBe(-1);

    // tiles：直方图 + 玩家 ±32 区域
    const tiles = r.tiles as Record<string, unknown>;
    expect(tiles.total).toBe(80 * 60);
    const hist = tiles.histType as Array<[number, number]>;
    const dirtCount = hist.find(([id]) => id === 1)?.[1];
    expect(dirtCount).toBe(2);
    const areaPlayer = tiles.areaPlayer as { w: number; h: number; rows: string[] };
    // 玩家 ptx=11/pty=28：±32 后负侧被世界边界裁剪 → 44×60（h 贴世界高 60）
    expect([areaPlayer.w, areaPlayer.h]).toEqual([44, 60]);
    expect(areaPlayer.rows).toHaveLength(60);

    // tiles.focus：三焦点键（hover/相机中心/玩家脚下）+ 5×5 邻域环转储两份
    //（DebugReport.ts:627 hoverRing/playerRing——贴图问题现场常不在焦点上）
    const focus = tiles.focus as Record<string, Record<string, unknown>>;
    expect(Object.keys(focus).sort()).toEqual(['camera', 'hover', 'hoverRing', 'player', 'playerRing']);
    // 环键形如 "x,y"（仅保留非空格；焦点自身不入环）
    for (const ringKey of ['hoverRing', 'playerRing']) {
      const ring = focus[ringKey] as Record<string, unknown> | null;
      if (!ring) continue;
      for (const k of Object.keys(ring)) expect(k).toMatch(/^-?\d+,-?\d+$/);
    }
    // hover=(11,30) 泥土：cell 链（def 字段/帧编码 blend/墙 62）
    const hov = focus.hover;
    expect([hov.x, hov.y]).toEqual([11, 30]);
    expect(hov.cell).toMatchObject({ type: 1, key: 'dirt', sheet: 0, frameMode: 'blend', wall: 62, fx: 0, fy: 0, solid: true, platform: false, framed: false });
    // atlas 链：vmeta 命中；表未载 → loaded false/png 尺寸 null/按 meta 网格判界不越界
    expect(hov.atlas).toMatchObject({ sheet: 0, loaded: false, pngW: null, pngH: null, oob: false, boundsBasis: 'meta' });
    expect(Array.isArray((hov.atlas as Record<string, unknown>).stride)).toBe(true);
    // sample：node 无 DOM → 安全降级 null（不抛）
    expect(hov.sample).toBeNull();
    // frameEngine：blend 模式 → 仅 mode，无 auto/tileAnim/findFrame
    expect(hov.frameEngine).toMatchObject({ mode: 'blend', auto: null, tileAnim: null, findFrame: null });
    // 相机中心格 (10,29) 空格：cell.type 0、atlas/frameEngine 降级 null
    expect([focus.camera.x, focus.camera.y]).toEqual([10, 29]);
    expect((focus.camera.cell as Record<string, unknown>).type).toBe(0);
    expect(focus.camera.atlas).toBeNull();
    expect(focus.camera.frameEngine).toBeNull();
    // 玩家脚下格 (11,28) 空格
    expect([focus.player.x, focus.player.y]).toEqual([11, 28]);
    expect((focus.player.cell as Record<string, unknown>).type).toBe(0);

    // render：ChunkCache 陈旧哨兵可见
    const cc = (r.render as Record<string, Record<string, unknown>>).chunkCache;
    expect(cc.chunks).toBe(1);
    expect(cc.dirtyQueue).toBe(1);
    expect(cc.staleSentinels).toBe(1);
    expect(cc.maxChunks).toBe(384);
    expect(cc.lastFlushMs).toBe(6.5);

    // render.subsystems（渲染器 debugState() 钩子收集；未绘制时 count/lastDraw 保守值）
    const subs = (r.render as Record<string, Record<string, unknown>>).subsystems;
    const wf = subs.waterfall as Record<string, unknown>;
    expect(wf.count).toBe(0);
    expect(wf.byType).toMatchObject({ water: 0, lava: 0, honey: 0, rain: 0, snow: 0, ashRain: 0 });
    expect((wf.lastDraw as unknown) === null).toBe(true);
    const liq = subs.liquids as Record<string, unknown>;
    expect(liq.calls).toBe(0);
    expect(liq.waterStyle).toBe(0);
    expect(Array.isArray(liq.sheetsReady)).toBe(true);

    // lighting.samples（相机中心格 + 玩家格；区域未建立 → 三通道 0）
    const li = r.lighting as Record<string, unknown>;
    expect(li.dirty).toBe(1);
    expect(li.perFrameCount).toBe(1); // addLight 1 条未消费
    expect((li.heldLight as unknown) === null).toBe(true);
    const samples = (li.samples as Record<string, [number, number, number, number, number]>);
    expect(samples.camera).toEqual([10, 29, 0, 0, 0]); // cam (10*TILE, 29*TILE)
    expect(samples.player![0]).toBe(11);               // ptx=11（现有 tiles 断言同源）
    expect(samples.player!.slice(2)).toEqual([0, 0, 0]);

    // entities：ai0 初值 -1120 直接可查（史莱姆 ai[0]==0 门陷阱点）
    expect((r.entities as Record<string, unknown>).counts).toMatchObject({ enemies: 1, drops: 0, npcs: 0 });
    const er = ((r.entities as Record<string, unknown>).enemies as Array<Record<string, unknown>>)[0];
    expect(er.vid).toBe(e.vanillaId);
    expect(er.aiStyle).toBe(e.vanilla?.aiStyle);
    expect(er.ai0).toBe(-1120);
    expect(er.aiInit).toBe(false);
    expect(er.despawnTimer).toBe(750);
    expect(er.netPuppet).toBe(false);

    // player：invNonEmpty = [slot, id, stack, prefix, vid]
    const p = r.player as Record<string, unknown>;
    expect(p.maxHp).toBeGreaterThan(0);
    expect(p.invNonEmpty).toEqual([[0, 1, 30, 0, -1]]);

    // systems
    const sys = r.systems as Record<string, Record<string, unknown>>;
    expect(sys.hitTiles.size).toBe(2);
    expect(sys.hitTiles.top).toHaveLength(2);
    expect((sys.mining as Record<string, unknown>).progress).toBe(0.4);
    expect((sys.swing as Record<string, unknown>).item).toBe(1);
    expect(sys.smartCursor).toMatchObject({ wanted: 1, showing: 1, x: 10, y: 30 });
    expect((sys.smartCursor as Record<string, unknown>).lockDir).toEqual({ x: 1, y: 0 });
    expect(sys.smartSelect).toEqual({ strategy: 3, slot: 2 });
    expect((sys.wiring as Record<string, unknown>).mechActive).toBe(0);
    expect((sys.wiring as Record<string, unknown>).teleportPairs).toEqual([[-1, -1], [-1, -1]]);
    expect((sys.pylons as unknown as number[][])[0]).toEqual([5, 6, 2]);
    expect(sys.enemySpawnEnabled).toBe(1);
    expect(sys.forceShowWires).toBe(0);

    // perf
    expect((r.perf as Record<string, unknown>).entitiesTotal).toBe(1);
    expect((r.perf as Record<string, unknown>).hitTilesSize).toBe(2);

    // screenshot:false → shot 段整体缺省
    expect(r.shot).toBeNull();
  });

  it('无 DOM 环境默认开截图：安全降级为 null 而不抛', () => {
    const { game } = sampleGame();
    const r = collectDebugReport(game) as Record<string, Record<string, unknown>>;
    expect(r.shot.main).toBeNull();
    expect(r.shot.minimap).toBeNull();
    expect(r.shot.mainOmitted).toBe(false);
    expect(r.shot.minimapOmitted).toBe(false);
  });

  it('缺 scene/renderer/lighting 样本：新段落缺省安全降级（不抛、键在）', () => {
    const { game } = sampleGame();
    const bare = { ...game, scene: undefined, renderer: undefined, lighting: undefined };
    const r = collectDebugReport(bare as unknown as Game) as Record<string, Record<string, unknown>>;
    // world.zones 缺 scene → null
    expect((r.world.zones as unknown) === null).toBe(true);
    // render.subsystems 键恒在；waterfall 缺钩子 → null，liquids 是模块态恒有
    const subs = r.render.subsystems as Record<string, unknown>;
    expect(Object.keys(subs).sort()).toEqual(['liquids', 'waterfall']);
    expect((subs.waterfall as unknown) === null).toBe(true);
    // lighting 段整体缺省 → null（样本连引擎都没有）
    expect((r.lighting as unknown) === null).toBe(true);
  });

  it('tiles.focus 源矩形越界标记 + hover 缺 input / 无 DOM 采样降级', () => {
    const { game } = sampleGame();
    // 石头 sheet 1 塞一张 16×16 假图：相机中心对准 (10,31) 石块（fx=fy=18）
    // → 18+16 > 16 源矩形越界，按已载图尺寸判定（boundsBasis=image）
    const atlas = new SpriteAtlas();
    const stoneMeta = atlas.vmeta(1)!;
    expect(stoneMeta).not.toBeNull();
    atlas.vimages.set(stoneMeta.sheet, { naturalWidth: 16, naturalHeight: 16, width: 16, height: 16 } as unknown as HTMLImageElement);
    const r = collectDebugReport({
      ...game,
      atlas,
      camera: { x: 10 * TILE, y: 31 * TILE, zoom: 1.25, zoomTarget: 1.25, viewW: 800, viewH: 600 },
    } as unknown as Game, { screenshot: false }) as Record<string, Record<string, unknown>>;
    const focus = (r.tiles as Record<string, unknown>).focus as Record<string, Record<string, unknown>>;
    const cam = focus.camera;
    expect([cam.x, cam.y]).toEqual([10, 31]);
    expect(cam.cell).toMatchObject({ type: 2, key: 'stone', fx: 18, fy: 18, frameMode: 'blend' });
    expect(cam.atlas).toMatchObject({ sheet: 1, loaded: true, boundsBasis: 'image', oob: true });
    expect((cam.atlas as Record<string, unknown>).src).toMatchObject({ sx: 18, sy: 18 });
    // 越界 + node 无 DOM → sample 不采样，安全降级 null
    expect(cam.sample).toBeNull();
    // hover 缺 input → 整键 null
    const r2 = collectDebugReport({ ...game, input: undefined } as unknown as Game, { screenshot: false });
    expect(((r2.tiles as Record<string, unknown>).focus as Record<string, unknown>).hover).toBeNull();
  });

  it('玩家 ±32 区域含放置块的完整 cell 串', () => {
    const w = sampleWorld();
    const area = dumpArea(w.store, 8, 28, 13, 33);
    // 行 y=30：x=10,11 泥土(type1) x=12 石头(type2)——同 type 且帧/墙相同才合并
    const row = decodeRle(area.rows[2]);
    expect(row).toHaveLength(6);
    expect(row[2].split(':')).toHaveLength(5); // (10,30) 泥土
    expect(row[3].split(':')).toHaveLength(5); // (11,30) 泥土
    expect(row[4].split(':')).toHaveLength(5); // (12,30) 石头
    expect(row[5]).toBe('0');                  // (13,30) 空格
    expect(row[0]).toBe('0');
    expect(row[0]).not.toBe(row[2]);
    // 液体格 (12,31)：liquid=128 进 cell 第 5 段（x=12 → 列 4；y=31 → 行 3）
    const row31 = decodeRle(area.rows[3]);
    expect(row31[4].split(':')[4]).toBe('128');
    void w;
  });
});
