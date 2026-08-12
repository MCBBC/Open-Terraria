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
  const game = {
    world,
    player,
    entities: ents,
    chunks,
    lighting,
    wiring,
    pylons: [{ x: 5, y: 6, type: 2 }],
    smartCursor: { wanted: true, showing: true, x: 10, y: 30, lockedDirection: { x: 1, y: 0 } },
    smartSelect: { strategy: 3, slot: 2 },
    enemySpawnEnabled: true,
    forceShowWires: false,
    paused: false,
    fps: 59.5,
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

    // render：ChunkCache 陈旧哨兵可见
    const cc = (r.render as Record<string, Record<string, unknown>>).chunkCache;
    expect(cc.chunks).toBe(1);
    expect(cc.dirtyQueue).toBe(1);
    expect(cc.staleSentinels).toBe(1);
    expect(cc.maxChunks).toBe(384);
    expect(cc.lastFlushMs).toBe(6.5);

    // lighting
    const li = r.lighting as Record<string, unknown>;
    expect(li.dirty).toBe(1);
    expect(li.perFrameCount).toBe(1); // addLight 1 条未消费
    expect((li.heldLight as unknown) === null).toBe(true);

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
