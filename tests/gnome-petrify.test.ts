// 624 侏儒日光石化谓词重写回归（2026-09-04 蓝队批）。
// 真值锚：NPC.cs:56413-56423 AI_003_Gnomes_ShouldTurnToStone
//   （remix: position.Y/16 > maxTilesY-350；否则 Main.dayTime && InAPlaceWithWind）；
//   NPC.cs:56437-56470 效果链（尘43×1 → SolidTileAllowBottomSlope → 尘×5 →
//   CanPlace+PlaceTile(567, rand(5)) → 图鉴/旗杀 → 成就 24 → life=0/active=false）；
//   WorldGen.cs:88124-88162 InAPlaceWithWind（DoesWindBlowAtThisHeight remix 翻转 +
//   liquid>0 / wall>0&&!AllowsWind 双门）；WallID.cs:54 AllowsWind 白名单；
//   WorldGen.cs:70698-70716 SolidTileAllowBottomSlope（收坡 0/3/4 拒顶坡 1/2）；
//   CheckGnome WorldGen.cs:54400（石像 = 1×2、顶帧 0/底帧 20、frameX 风格步 28）。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import { inAPlaceWithWind } from '../src/entities/Mounts';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 520, SURF = 40;
// remix 深度阈值 = maxTilesY-350 = 170（:56416）——40 在阈上、200 在阈下
const DEEP = 200;

const GNOME_TILE = TILE_BY_KEY['v_567_garden_gnome'];

function makeWorld(): World {
  const w = new World(W, H, 11, 'gnome-petrify');
  const st = w.store;
  w.groundLevel = SURF;
  for (let x = 2; x < W - 2; x++) {
    st.setTile(x, SURF, 1);   // 地表地板
    st.setTile(x, DEEP, 1);   // 地下洞底（remix 深度支用）
  }
  return w;
}

function makeHooks() {
  const w = makeWorld();
  const enemies: Enemy[] = [];
  const killed: number[] = [];
  const achEvents: number[] = [];
  const placedStatues: Array<{ x: number; y: number; fy: number }> = [];
  const sfx: string[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      (e as { id: number }).id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
    },
  };
  const player = new Player(100 * TILE, (SURF - 6) * TILE, new Inventory());
  // placeObjectCells = Game 侧裸写口测试等价（TileObject.Place 抑制窗在无监听
  // 的裸 store 下与逐格 setTile 同态,此处记录顶格行帧供断言）
  const placeObjectCells = (
    cells: ReadonlyArray<{ x: number; y: number; type: number; fx: number; fy: number }>,
  ) => {
    for (const c of cells) {
      w.store.setTile(c.x, c.y, c.type, c.fx, c.fy);
      if (c.fy === 0) placedStatues.push({ x: c.x, y: c.y, fy: c.fy });
    }
  };
  const hooks = {
    world: w, player,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    onEnemyKilled: (_key: string, enemy?: { vanillaId?: number | null }) => {
      killed.push(enemy?.vanillaId ?? -1);
    },
    spawnParticles: () => {},
    playSfx: (k: string) => { sfx.push(k); },
    notifyInventoryChanged: () => {},
    showPickupLabel: () => {},
    cutTile: () => {},
    dropContext: () => ({
      zoneHallow: false, zoneCorrupt: false, zoneCrimson: false, zoneJungle: false,
      zoneSnow: false, zoneDesert: false, zoneDungeon: false, zoneBeach: false,
      bloodMoon: false, halloween: false, xmas: false, windy: false,
    }),
    scene: { zoneHallow: false, zoneGraveyard: false },
    entities: em,
    placeObjectCells,
    achievements: { notifyProgressionEvent: (id: number) => { achEvents.push(id); } },
  } as unknown as GameHooks & { placeObjectCells: typeof placeObjectCells };
  return { hooks, enemies, killed, achEvents, placedStatues, sfx, w, em };
}

/** 侏儒立在 (col, floorRow) 上（盒单列：x = col*16+1 → x..x+14 同列） */
function spawnGnome(h: ReturnType<typeof makeHooks>, col: number, floorRow: number): Enemy {
  const e = Enemy.fromVanilla(624, col * TILE + 8, floorRow * TILE - 15)!;
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

/** 桩玩家挪到目标点附近——CheckActive ①activeRange 窗（2.1×屏）外首拍即消散,
 *  深处用例须把玩家带上（ Otherwise=消散伪影,非石化语义） */
function placePlayerNear(h: ReturnType<typeof makeHooks>, col: number, row: number): void {
  h.hooks.player.x = col * TILE + 1;
  h.hooks.player.y = (row - 6) * TILE;
}

// ===========================================================================
// ① WorldGen.InAPlaceWithWind（WorldGen.cs:88124-88162）风高盒两态 + remix 翻转
// ===========================================================================
describe('inAPlaceWithWind（Mounts 单源,WorldGen.cs:88124-88162）', () => {
  const st = makeWorld().store;

  it('地表以上无液体无墙 → true（迎风）', () => {
    const px = 50 * TILE, py = (SURF - 3) * TILE;
    expect(inAPlaceWithWind(st, px, py, 14, 30, SURF)).toBe(true);
  });

  it('地表以下 → false（DoesWindBlowAtThisHeight 门）', () => {
    const px = 50 * TILE, py = (SURF + 10) * TILE;
    expect(inAPlaceWithWind(st, px, py, 14, 30, SURF)).toBe(false);
  });

  it('普通墙体（wall=1）→ false； AllowsWind 围栏墙（150）→ true（WallID.cs:54）', () => {
    const px = 60 * TILE, py = (SURF - 3) * TILE;
    const col = 60, r0 = SURF - 3, r1 = SURF - 1;
    for (let r = r0; r <= r1; r++) st.wall[st.idx(col, r)] = 1;
    expect(inAPlaceWithWind(st, px, py, 14, 30, SURF)).toBe(false);
    for (let r = r0; r <= r1; r++) st.wall[st.idx(col, r)] = 150;
    expect(inAPlaceWithWind(st, px, py, 14, 30, SURF)).toBe(true);
    for (let r = r0; r <= r1; r++) st.wall[st.idx(col, r)] = 0;
  });

  it('盒内液体 > 0 → false', () => {
    const px = 70 * TILE, py = (SURF - 3) * TILE;
    st.liquid[st.idx(70, SURF - 2)] = 200;
    expect(inAPlaceWithWind(st, px, py, 14, 30, SURF)).toBe(false);
    st.liquid[st.idx(70, SURF - 2)] = 0;
  });

  it('remix 翻转（cs:88137-88138）：地下迎风 true / 地表 false', () => {
    const under = (SURF + 10) * TILE, above = (SURF - 3) * TILE;
    expect(inAPlaceWithWind(st, 80 * TILE, under, 14, 30, SURF, true)).toBe(true);
    expect(inAPlaceWithWind(st, 80 * TILE, above, 14, 30, SURF, true)).toBe(false);
  });
});

// ===========================================================================
// ② 效果链端到端（NPC.cs:56437-56470）
// ===========================================================================
describe('624 侏儒石化（AI_003_Gnomes_ShouldTurnToStone + 效果链）', () => {
  it('白天+地表风高+实心底 → 石化：1×2 石像帧 0/20（frameX 步 28）+ dead + 记账 + 成就 24', () => {
    const h = makeHooks();
    const g = spawnGnome(h, 100, SURF);
    g.fixedUpdate(1 / 60, h.hooks);
    // CheckGnome 完整性形态（:54418-54420）：顶格 frameY=0、底格 frameY=20
    const st = h.w.store;
    expect(st.type[st.idx(100, SURF - 2)]).toBe(GNOME_TILE);
    expect(st.type[st.idx(100, SURF - 1)]).toBe(GNOME_TILE);
    const fxT = st.frameX[st.idx(100, SURF - 2)];
    expect(st.frameY[st.idx(100, SURF - 2)]).toBe(0);
    expect(st.frameY[st.idx(100, SURF - 1)]).toBe(20);
    expect(fxT % 28).toBe(0);
    expect(fxT / 28).toBe(st.frameX[st.idx(100, SURF - 1)] / 28);   // 同风格列
    expect(fxT / 28).toBeLessThan(5);                              // style ∈ rand(5)
    expect(g.dead).toBe(true);                                     // life=0+active=false
    expect(h.killed).toEqual([624]);                               // 图鉴/旗杀记账口
    expect(h.achEvents).toEqual([24]);                             // NotifyProgressionEvent(24)
    expect(h.sfx).toContain('place');                              // PlaceObject !mute PlaySound(0)
  });

  it('夜晚不石化（Main.dayTime 门）', () => {
    const h = makeHooks();
    h.w.clock.timeOfDay = 0.9;   // ≥ DUSK 0.8125
    const g = spawnGnome(h, 100, SURF);
    g.fixedUpdate(1 / 60, h.hooks);
    expect(g.dead).toBe(false);
    expect(h.w.store.type[h.w.store.idx(100, SURF - 2)]).toBe(0);
    expect(h.killed).toEqual([]);
  });

  it('地下（地表以下,盒外无风）白天不石化', () => {
    const h = makeHooks();
    placePlayerNear(h, 120, DEEP);
    const g = spawnGnome(h, 120, DEEP);
    g.fixedUpdate(1 / 60, h.hooks);
    expect(g.dead).toBe(false);
    expect(h.w.store.type[h.w.store.idx(120, DEEP - 2)]).toBe(0);
  });

  it('普通墙挡风 → 不石化；AllowsWind 围栏墙 → 石化（白名单端到端）', () => {
    const st = makeWorld().store;
    const h1 = makeHooks();
    for (let r = SURF - 3; r <= SURF - 1; r++) h1.w.store.wall[h1.w.store.idx(100, r)] = 1;
    const g1 = spawnGnome(h1, 100, SURF);
    g1.fixedUpdate(1 / 60, h1.hooks);
    expect(g1.dead).toBe(false);
    void st;
    const h2 = makeHooks();
    for (let r = SURF - 3; r <= SURF - 1; r++) h2.w.store.wall[h2.w.store.idx(100, r)] = 150;
    const g2 = spawnGnome(h2, 100, SURF);
    g2.fixedUpdate(1 / 60, h2.hooks);
    expect(g2.dead).toBe(true);
    expect(h2.w.store.type[h2.w.store.idx(100, SURF - 2)]).toBe(GNOME_TILE);
  });

  it('脚面格顶坡 slope=1 → 不石化（SolidTileAllowBottomSlope 拒顶坡）；底坡 slope=3 → 石化', () => {
    const h1 = makeHooks();
    h1.w.store.setSlope(100, SURF, 1);
    const g1 = spawnGnome(h1, 100, SURF);
    g1.fixedUpdate(1 / 60, h1.hooks);
    expect(g1.dead).toBe(false);
    expect(h1.w.store.type[h1.w.store.idx(100, SURF - 2)]).toBe(0);

    const h2 = makeHooks();
    h2.w.store.setSlope(100, SURF, 3);
    const g2 = spawnGnome(h2, 100, SURF);
    g2.fixedUpdate(1 / 60, h2.hooks);
    expect(g2.dead).toBe(true);
    expect(h2.w.store.frameY[h2.w.store.idx(100, SURF - 1)]).toBe(20);
  });

  it('remix 深度支（:56415-56417）：y/16 > maxTilesY-350 夜里也石化,阈上不石化', () => {
    const h1 = makeHooks();
    placePlayerNear(h1, 100, DEEP);
    h1.w.seedFlags = { remix: true } as typeof h1.w.seedFlags;
    h1.w.clock.timeOfDay = 0.9;                          // 夜——remix 支昼夜无关
    const g1 = spawnGnome(h1, 100, DEEP);                // 200 > 520-350=170
    g1.fixedUpdate(1 / 60, h1.hooks);
    expect(g1.dead).toBe(true);
    expect(h1.w.store.type[h1.w.store.idx(100, DEEP - 2)]).toBe(GNOME_TILE);

    const h2 = makeHooks();
    h2.w.seedFlags = { remix: true } as typeof h2.w.seedFlags;
    h2.w.clock.timeOfDay = 0.9;
    const g2 = spawnGnome(h2, 100, SURF);                // 40 < 170 阈上
    g2.fixedUpdate(1 / 60, h2.hooks);
    expect(g2.dead).toBe(false);
  });

  it('非 remix 地下夜（无风且非 remix）不石化——remix 支不误扩普通世界', () => {
    const h = makeHooks();
    placePlayerNear(h, 120, DEEP);
    h.w.clock.timeOfDay = 0.9;
    const g = spawnGnome(h, 120, DEEP);
    g.fixedUpdate(1 / 60, h.hooks);
    expect(g.dead).toBe(false);
  });
});
