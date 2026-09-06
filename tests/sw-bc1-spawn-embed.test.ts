// ★SW-BC1 2026-09-06（2026-09-06 用户实报：出生点放方块后重进/重生嵌墙）
// Player.Spawn 出生落位扫位链 1:1 守卫：
//   · 纯函数面（src/world/spawn/SpawnPlacement.ts）：
//     Spawn_GetPositionAtSpawn :38008（上 30 行 X±1 三列→下 30 行同式）
//     Spawn_IsAreaValidSpawn   :38222（3×3 净空：实心非顶/压板 135/液/底邻伤害）
//     Spawn_DescendFromDefaultSpace :38103（50 行下探落板+singleBlockAllowed 重试）
//     Spawn_ForceClearArea     :38199（全堵兜底 3×3 破块排水）
//   · 组合面（Game.placePlayerAtSpawn = Player.Spawn :37854-37919 三分支）：
//     床点臂直置（无扫位）/床复验失败回落世界点臂扫位/队点臂/世界点臂扫位+全堵兜底。
import { describe, expect, it, vi } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import {
  spawnDescendFromDefaultSpace, spawnForceClearArea, spawnGetPositionAtSpawn,
  spawnIsAreaValidSpawn, spawnValidSpawnFloor,
} from '../src/world/spawn/SpawnPlacement';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { T, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';

const DIRT = T.DIRT;                       // 实心非顶（tileSolid=1,无 platform 旗）
const PLATFORM = T.PLATFORM;               // sheet 19——tileSolid∩tileSolidTop 可站族
const PLATE = TILE_INTERNAL_BY_SHEET.get(135)!;   // 压板 135——净空/地板双门拒收
const SPAWN_X = 100;
const SPAWN_Y = 100;

/** 空世界（200×200,扫描窗/InWorld(5) 边带均不受限） */
function makeStore(): TileStore {
  return new TileStore(200, 200);
}

/** 原版 Spawn_SetPosition 语义（底边=floorY*16=行顶）换算的期望像素位 */
const px = (floorX: number) => floorX * 16 + 8;
const py = (floorY: number) => (floorY - 3) * 16;

// ── 纯函数面：Spawn_IsAreaValidSpawn 谓词判别 ──────────────────────────────

describe('SW-BC1 Spawn_IsAreaValidSpawn（:38222 3×3 净空判别）', () => {
  it('正常空位=净空通过', () => {
    const st = makeStore();
    expect(spawnIsAreaValidSpawn(st, SPAWN_X, SPAWN_Y)).toBe(true);
  });

  it('实心非顶格（泥土）在 3×3 内=堵（用户实报场景）', () => {
    const st = makeStore();
    st.setTile(SPAWN_X, SPAWN_Y - 1, DIRT);          // 头顶一行
    expect(spawnIsAreaValidSpawn(st, SPAWN_X, SPAWN_Y)).toBe(false);
  });

  it('平台格不算堵（tileSolid∩tileSolidTop 可站族非障碍）', () => {
    const st = makeStore();
    for (let x = SPAWN_X - 1; x <= SPAWN_X + 1; x++) st.setTile(x, SPAWN_Y - 1, PLATFORM);
    expect(spawnIsAreaValidSpawn(st, SPAWN_X, SPAWN_Y)).toBe(true);
  });

  it('半砖/坡面不改判——实心类型带 slope/halfBrick 旗仍算堵（原版无坡豁免）', () => {
    const st = makeStore();
    st.setTile(SPAWN_X - 1, SPAWN_Y - 1, DIRT);
    st.setSlope(SPAWN_X - 1, SPAWN_Y - 1, 1);        // 左坡
    st.setTile(SPAWN_X + 1, SPAWN_Y - 2, DIRT);
    st.setHalfBrick(SPAWN_X + 1, SPAWN_Y - 2, true); // 半砖
    expect(spawnIsAreaValidSpawn(st, SPAWN_X, SPAWN_Y)).toBe(false);
  });

  it('非实心件（火把/树）不算堵', () => {
    const st = makeStore();
    st.setTile(SPAWN_X, SPAWN_Y - 1, T.TORCH);       // decor 非实心
    st.setTile(SPAWN_X + 1, SPAWN_Y - 2, T.TREE);    // 树干非实心
    expect(spawnIsAreaValidSpawn(st, SPAWN_X, SPAWN_Y)).toBe(true);
  });

  it('压板 135 在 3×3 内=拒（:38244-38246）', () => {
    const st = makeStore();
    st.setTile(SPAWN_X, SPAWN_Y - 2, PLATE);
    expect(spawnIsAreaValidSpawn(st, SPAWN_X, SPAWN_Y)).toBe(false);
  });

  it('液格（水）在 3×3 内=拒（:38250-38252）', () => {
    const st = makeStore();
    st.setLiquid(SPAWN_X - 1, SPAWN_Y - 1, 128, 1);  // 水
    expect(spawnIsAreaValidSpawn(st, SPAWN_X, SPAWN_Y)).toBe(false);
  });

  it('底邻行伤害块（岩浆灼烧族 sheet 37 熔岩）=拒（CanTileHurt :38236-38238）', () => {
    const st = makeStore();
    const obsidian = TILE_INTERNAL_BY_SHEET.get(37)!;   // TouchDamageHot 族
    st.setTile(SPAWN_X, SPAWN_Y - 1, 0);
    st.setTile(SPAWN_X, SPAWN_Y, obsidian);          // 底邻行下方=地板位伤害块
    expect(spawnIsAreaValidSpawn(st, SPAWN_X, SPAWN_Y)).toBe(false);
  });

  it('幽灵残型格（flags=0,type≠0）不算堵（nactive 腿,判例 RD-F7/G1）', () => {
    const st = makeStore();
    st.setTile(SPAWN_X, SPAWN_Y - 1, DIRT);
    st.flags[st.idx(SPAWN_X, SPAWN_Y - 1)] = 0;      // 抹 active 位留型
    expect(spawnIsAreaValidSpawn(st, SPAWN_X, SPAWN_Y)).toBe(true);
  });
});

// ── 纯函数面：Spawn_GetPositionAtSpawn 扫位链 ─────────────────────────────

describe('SW-BC1 Spawn_GetPositionAtSpawn（:38008 上/下 30 行扫位链）', () => {
  it('正常空位不动：moved=false 且落点=原点', () => {
    const st = makeStore();
    const r = spawnGetPositionAtSpawn(st, SPAWN_X, SPAWN_Y);
    expect(r).toEqual({ floorX: SPAWN_X, floorY: SPAWN_Y, moved: false });
  });

  it('头顶被堵→上移到首个净空行（moved=true）', () => {
    const st = makeStore();
    for (let x = SPAWN_X - 1; x <= SPAWN_X + 1; x++) {
      st.setTile(x, SPAWN_Y - 1, DIRT);
      st.setTile(x, SPAWN_Y - 2, DIRT);
    }
    const r = spawnGetPositionAtSpawn(st, SPAWN_X, SPAWN_Y);
    // 两行厚板(98..99)顶=行 98:i=0/1 行 (100,100)/(100,99) 窗口沾板,i=2 行 (100,98)
    // 净空(板顶=合法地板,上方 95..97 净)——落位=站板顶
    expect(r.moved).toBe(true);
    expect(r.floorX).toBe(SPAWN_X);
    expect(r.floorY).toBe(SPAWN_Y - 2);
  });

  it('X±1 折行：障碍偏右时先折左列（:38026-38040 探测序 中→左→右）', () => {
    const st = makeStore();
    // 仅右侧列（x+1）rows 97..99 堵——(x,y) 与 (x+1,y-i) 窗口全沾, (x-1,·) 窗口净空
    for (let y = SPAWN_Y - 3; y < SPAWN_Y; y++) st.setTile(SPAWN_X + 1, y, DIRT);
    // 下探落板行（净空窗口内地板）
    for (let x = SPAWN_X - 2; x <= SPAWN_X + 2; x++) st.setTile(x, SPAWN_Y + 5, DIRT);
    const r = spawnGetPositionAtSpawn(st, SPAWN_X, SPAWN_Y);
    expect(r.moved).toBe(true);
    expect(r.floorX).toBe(SPAWN_X - 1);              // i=0 行左列 (99,100) 先中
    expect(r.floorY).toBe(SPAWN_Y + 5);              // Descend 落到 105 行地板
  });

  it('起点净空但无地板→Descend 下探到首个地板行（moved=false）', () => {
    const st = makeStore();
    for (let x = SPAWN_X - 2; x <= SPAWN_X + 2; x++) st.setTile(x, SPAWN_Y + 4, DIRT);
    const r = spawnGetPositionAtSpawn(st, SPAWN_X, SPAWN_Y);
    expect(r.moved).toBe(false);
    expect(r.floorX).toBe(SPAWN_X);
    expect(r.floorY).toBe(SPAWN_Y + 4);
  });

  it('上 30/下 30 全堵→原点返回+moved=true（全堵兜底锚 :38074-38078）', () => {
    const st = makeStore();
    for (let y = SPAWN_Y - 30; y <= SPAWN_Y + 30; y++) {
      for (let x = SPAWN_X - 1; x <= SPAWN_X + 1; x++) st.setTile(x, y, DIRT);
    }
    const r = spawnGetPositionAtSpawn(st, SPAWN_X, SPAWN_Y);
    expect(r.moved).toBe(true);
    expect(r.floorX).toBe(SPAWN_X);
    expect(r.floorY).toBe(SPAWN_Y);
  });

  it('Descend 压板中止：下探路径遇压板整轮中止回原点（:38128-38131）', () => {
    const st = makeStore();
    for (let x = SPAWN_X - 2; x <= SPAWN_X + 2; x++) st.setTile(x, SPAWN_Y + 4, DIRT);
    st.setTile(SPAWN_X, SPAWN_Y + 1, PLATE);         // 下探路径上的压板
    const d = spawnDescendFromDefaultSpace(st, SPAWN_X, SPAWN_Y);
    expect(d.validSpace).toBe(false);
    expect(d.x).toBe(SPAWN_X);
    expect(d.y).toBe(SPAWN_Y);
  });

  it('Spawn_ValidSpawnFloor：实心/平台/380 收,空气/379 拒（:38181-38197）', () => {
    const st = makeStore();
    st.setTile(SPAWN_X, SPAWN_Y, DIRT);
    st.setTile(SPAWN_X + 1, SPAWN_Y, PLATFORM);
    expect(spawnValidSpawnFloor(st, SPAWN_X, SPAWN_Y)).toBe(true);
    expect(spawnValidSpawnFloor(st, SPAWN_X + 1, SPAWN_Y)).toBe(true);   // 平台是合法地板
    expect(spawnValidSpawnFloor(st, SPAWN_X + 2, SPAWN_Y)).toBe(false);  // 空气
  });
});

// ── 纯函数面：Spawn_ForceClearArea 全堵兜底 ───────────────────────────────

describe('SW-BC1 Spawn_ForceClearArea（:38199 3×3 破块排水）', () => {
  it('实心非顶全破、平台不破、液格排空（KillTile 掉落开=setLiquid 清空通道）', () => {
    const st = makeStore();
    for (let x = SPAWN_X - 1; x <= SPAWN_X + 1; x++) {
      for (let y = SPAWN_Y - 3; y < SPAWN_Y; y++) st.setTile(x, y, DIRT);
    }
    st.setTile(SPAWN_X, SPAWN_Y - 2, PLATFORM);      // 3×3 内一格平台（tileSolidTop 族不破）
    st.setLiquid(SPAWN_X, SPAWN_Y - 2, 200, 1);      // 平台格蓄水——破格门与排水门独立
    const killed: Array<[number, number]> = [];
    const drained: Array<[number, number]> = [];
    spawnForceClearArea(st, SPAWN_X, SPAWN_Y,
      (x, y) => killed.push([x, y]),
      (x, y) => { drained.push([x, y]); st.setLiquid(x, y, 0, 0); });
    expect(killed).toHaveLength(8);                  // 9 格 - 平台（:38208 实心非顶门）
    expect(drained).toEqual([[SPAWN_X, SPAWN_Y - 2]]);   // :38212 liquid>0 门独立触发
    expect(st.liquid[st.idx(SPAWN_X, SPAWN_Y - 2)]).toBe(0);
  });
});

// ── 组合面：Game.placePlayerAtSpawn（Player.Spawn :37854-37919 三分支） ────

/** Game 原型壳（world/player 真件,其余按需 stub——spectate-self 同范式） */
function gameShell(): { g: Game; w: World; p: Player; breakTile: ReturnType<typeof vi.fn> } {
  const w = new World(200, 200, 42, 'SW-BC1');
  const p = new Player(px(SPAWN_X), py(SPAWN_Y), new Inventory());
  const g = Object.create(Game.prototype) as unknown as Game;
  (g as unknown as { world: World }).world = w;
  (g as unknown as { player: Player }).player = p;
  const breakTile = vi.fn();
  (g as unknown as Record<string, unknown>).breakTile = breakTile;
  return { g, w, p, breakTile };
}

describe('SW-BC1 placePlayerAtSpawn 三分支组合（:37908-37919）', () => {
  it('世界点臂·空位：原点直置零破格（守恒面）', () => {
    const { g, w, p, breakTile } = gameShell();
    w.spawnX = SPAWN_X; w.spawnY = SPAWN_Y;
    w.spawnX0 = SPAWN_X; w.spawnY0 = SPAWN_Y;
    g.placePlayerAtSpawn(p);
    expect(p.x).toBe(px(SPAWN_X));
    expect(p.y).toBe(py(SPAWN_Y));
    expect(breakTile).not.toHaveBeenCalled();
  });

  it('世界点臂·出生点被堵：上移落位（用户实报主场景——修复前嵌墙）', () => {
    const { g, w, p, breakTile } = gameShell();
    w.spawnX = SPAWN_X; w.spawnY = SPAWN_Y;
    w.spawnX0 = SPAWN_X; w.spawnY0 = SPAWN_Y;
    for (let x = SPAWN_X - 1; x <= SPAWN_X + 1; x++) {
      st_(w).setTile(x, SPAWN_Y - 1, DIRT);
      st_(w).setTile(x, SPAWN_Y - 2, DIRT);
    }
    g.placePlayerAtSpawn(p);
    expect(p.y).toBe(py(SPAWN_Y - 2));               // 两行厚板顶=首个净空落脚行（站板顶）
    expect(p.x).toBe(px(SPAWN_X));
    expect(breakTile).not.toHaveBeenCalled();        // 找到净空位不触发兜底
  });

  it('世界点臂·上30/下30 全堵：原点落位+3×3 破格兜底（ForceClearArea 接线）', () => {
    const { g, w, p, breakTile } = gameShell();
    w.spawnX = SPAWN_X; w.spawnY = SPAWN_Y;
    w.spawnX0 = SPAWN_X; w.spawnY0 = SPAWN_Y;
    const st = st_(w);
    for (let y = SPAWN_Y - 30; y <= SPAWN_Y + 30; y++) {
      for (let x = SPAWN_X - 1; x <= SPAWN_X + 1; x++) st.setTile(x, y, DIRT);
    }
    g.placePlayerAtSpawn(p);
    expect(p.x).toBe(px(SPAWN_X));                   // 全堵兜底=原点
    expect(p.y).toBe(py(SPAWN_Y));
    expect(breakTile).toHaveBeenCalledTimes(9);      // 3×3 全实心 → 9 格 KillTile
    const calls = breakTile.mock.calls as Array<[number, number]>;
    for (const [cx2, cy2] of calls) {
      expect(cx2).toBeGreaterThanOrEqual(SPAWN_X - 1);
      expect(cx2).toBeLessThanOrEqual(SPAWN_X + 1);
      expect(cy2).toBeGreaterThanOrEqual(SPAWN_Y - 3);
      expect(cy2).toBeLessThan(SPAWN_Y);
    }
  });

  it('床点臂·床复验通过：直置床点且无扫位（:37910——床区被围死也照放）', () => {
    const { g, w, p, breakTile } = gameShell();
    w.spawnX = 50; w.spawnY = 60;
    w.spawnX0 = SPAWN_X; w.spawnY0 = SPAWN_Y;
    (g as unknown as Record<string, unknown>).checkBedSpawn = () => null;   // 复验通过
    // 床点 3×3 故意全堵——床臂无扫位（CheckSpawn 已是其障碍门）
    const st = st_(w);
    for (let x = 49; x <= 51; x++) {
      for (let y = 57; y < 60; y++) st.setTile(x, y, DIRT);
    }
    g.placePlayerAtSpawn(p);
    expect(p.x).toBe(px(50));
    expect(p.y).toBe(py(60));
    expect(breakTile).not.toHaveBeenCalled();
  });

  it('床点臂·床被堵：CheckSpawn 复验失败→回落世界点臂扫位（不嵌失效床点）', () => {
    const { g, w, p, breakTile } = gameShell();
    w.spawnX = 50; w.spawnY = 60;
    w.spawnX0 = SPAWN_X; w.spawnY0 = SPAWN_Y;
    const st = st_(w);
    // 床格在位（checkBedSpawn 首门）+ 床上 3×3 内实心一格 → Game.BedObstructed
    st.setTile(50, 59, TILE_INTERNAL_BY_SHEET.get(79)!);
    st.setTile(50, 58, DIRT);
    // 世界点周围留净空——回落后正常直置
    g.placePlayerAtSpawn(p);
    expect(p.x).toBe(px(SPAWN_X));                   // 复位支 :37856-37859 → 世界点
    expect(p.y).toBe(py(SPAWN_Y));
    expect(breakTile).not.toHaveBeenCalled();
  });

  it('床点臂·床被堵且世界点也被堵：回落世界点后上移（两源复验级联）', () => {
    const { g, w, p } = gameShell();
    w.spawnX = 50; w.spawnY = 60;
    w.spawnX0 = SPAWN_X; w.spawnY0 = SPAWN_Y;
    const st = st_(w);
    st.setTile(50, 59, TILE_INTERNAL_BY_SHEET.get(79)!);
    st.setTile(50, 58, DIRT);                        // 床堵
    for (let x = SPAWN_X - 1; x <= SPAWN_X + 1; x++) st.setTile(x, SPAWN_Y - 1, DIRT);
    g.placePlayerAtSpawn(p);
    expect(p.x).toBe(px(SPAWN_X));
    expect(p.y).toBe(py(SPAWN_Y - 1));               // 世界点臂扫位上移一行
  });
});

/** world.store 取置助手（测试壳内避免 any 链） */
function st_(w: World): TileStore {
  return (w as unknown as { store: TileStore }).store;
}
