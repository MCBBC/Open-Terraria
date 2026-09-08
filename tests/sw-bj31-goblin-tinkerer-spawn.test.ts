// SW-BJ31 2026-09-08【洞穴层刷不出哥布林工匠（用户实报）】
// 原版锚（Terarria1457/Terraria/NPC.cs，1458 同行同文）：
//   SpawnAnNPC 绑缚三人组支（:2087-2098）：
//     else if (downedGoblins && RollLuck(20) == 0 && !waterTile && deeperThanRockLayer
//       && spawnTileY < Main.maxTilesY - 210 && !savedGoblin && !AnyNPCs(105))
//       → SpawnNPC(x, y, 105)
//   · 105 = NPCID.BoundGoblin（NPCID.cs:11275 绑缚态本体；解救 Transform(107) 后
//     才是城镇哥布林工匠 107，AI_000_TransformBoundNPC :45371 / AI() aiStyle0 头
//     :19885-19891 talkNPC 触发；savedGoblin 记账在 AI_007_TownEntities_UpdateSavedStates
//     :53494-53496）。前置旗 = NPC.downedGoblins（哥布林军团胜利，Main.cs:65309
//     SetEventFlagCleared；NPC.cs:6362）。
//   · 深度层 = deeperThanRockLayer（洞穴层,SetSpawnFlagsForChosenTile :1204
//     spawnTileY >= Main.rockLayer）且 y < maxTilesY-210（地狱带上缘除外）；非水域。
//   · 生成率 = RollLuck(20)（运气调制 1/20,Spawner.RollLuck :5356=Luck.RollLuck(luck,range)）。
//   · 互斥/共存：与 106/685 为同链相邻 else-if（各自独立掷,互不吞掷）；
//     !AnyNPCs(105) 场上唯一；!savedGoblin（解救后绝迹）。
// 本仓链（src/world/spawn/VanillaSpawner.ts 绑缚三人组块）→ spawnBound(105) 占位体
// → Game.trySpawnBoundTownNpc 转 bound TownNPC('goblin_tinkerer')（Game.ts）→
// 解救 freeBoundNpc 置 flags.savedGoblin（关门）。
// 本测试在【实机同条件】（setPlayerFlags 实参镜像 Game.trySpawnEnemy + 实机半屏格数
// 60/34）下驱动 spawner.spawn 全链,锁：前置旗矩阵 / 深度层边界 / 场上唯一 /
// 转换与落位契约 / 解救链协同 / 结构锁。
import { describe, it, expect, beforeAll } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import { Enemy } from '../src/entities/Enemy';
import { TownNPC } from '../src/entities/TownNPC';
import { Game } from '../src/core/Game';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { World } from '../src/world/World';

// 单世界共享（worldgen 重量级；旗矩阵按用例顺序推演并在用例尾复位）
let world: World;
let cavern: { x: number; y: number };        // 洞穴层干燥落脚点
let underground: { x: number; y: number };    // 地下层干燥落脚点（rockLevel 上）
let beach: { x: number; y: number } | null = null;  // 海岸带干沙落脚点（SW-BJ31 新支）

beforeAll(async () => {
  world = await generateWorld({ width: 2400, height: 1200, seedText: 'sw-bj31-a', evil: 0 });
  const st = world.store;
  const ry = Math.floor(world.rockLevel);
  const find = (y0: number, y1: number): { x: number; y: number } => {
    for (let y = y0; y < y1; y += 2) {
      for (let x = 200; x < st.w - 200; x += 3) {
        if (!st.inBounds(x, y) || !st.isSolid(x, y)) continue;
        if (st.isSolid(x, y - 1) || st.isSolid(x, y - 2) || st.isSolid(x, y - 3)) continue;
        if (st.liquid[st.idx(x, y - 1)] > 0 || st.liquid[st.idx(x, y - 2)] > 0) continue;
        return { x, y };
      }
    }
    throw new Error(`no dry floor spot in [${y0},${y1})`);
  };
  cavern = find(ry + 60, ry + 260);
  underground = find(ry - 260, ry - 40);
  // 海岸带（x<380 || x>w-380）干沙（Main.tileSand 表）落脚点——生成流随机性可能
  // 无干沙海岸（沙滩淹水/被海蚀），找到才跑新支正例（找不到则该臂跳过并备案）。
  // ★只扫 worldSurface 上方行（y<groundLevel=原版 worldSurface）：支门要求
  // spawnTileY<groundLevel——地下干沙腔不算（L1928 同门）
  const ws = Math.floor(world.groundLevel);
  const sands = new Set([TILE_BY_KEY['sand'], TILE_BY_KEY['v_112_ebonsand_block'],
    TILE_BY_KEY['v_116_pearlsand_block'], TILE_BY_KEY['v_234_crimsand_block']]
    .filter((v): v is number => v !== undefined));
  for (let y = ws - 1; y > 20 && !beach; y--) {
    for (const x of [200, 240, 280, 320, 360, st.w - 201, st.w - 241, st.w - 281, st.w - 321, st.w - 361]) {
      if (!sands.has(st.type[st.idx(x, y)])) continue;
      if (st.isSolid(x, y - 1) || st.isSolid(x, y - 2) || st.isSolid(x, y - 3)) continue;
      if (st.liquid[st.idx(x, y - 1)] > 0 || st.liquid[st.idx(x, y - 2)] > 0) continue;
      beach = { x, y };
      break;
    }
  }
}, 300000);

/** 实机条件组装：setPlayerFlags 实参序镜像 Game.trySpawnEnemy（zoneDungeon/
 *  downedSkeletron/invaders/activeIds/moonEvent/lunar/maxHp/luck/trespassDual/
 *  partyUp/anyDanger/pal×2）；实机半屏格数 60/34 */
function makeSpawner(activeIds: Set<number> = new Set()): VanillaSpawner {
  const sp = new VanillaSpawner(world);
  sp.setPlayerFlags(false, false, false, activeIds, null, null, 400, 0, false, false, false, false, false);
  return sp;
}

function sample(spot: { x: number; y: number }, attempts: number, salt = 1,
  viewHalfW = 60, viewHalfH = 34): Map<number, number> {
  const sp = makeSpawner();
  const hits = new Map<number, number>();
  for (let k = 0; k < attempts; k++) {
    const e = sp.spawn((spot.x + 0.5) * TILE, (spot.y - 3) * TILE,
      new RNG((k * 2654435761 + salt) >>> 0), viewHalfW, viewHalfH);
    if (e && e.vanillaId != null) hits.set(e.vanillaId, (hits.get(e.vanillaId) ?? 0) + 1);
  }
  return hits;
}

const n105 = (h: Map<number, number>): number => h.get(105) ?? 0;

describe('SW-BJ31 洞穴层哥布林工匠（绑缚 105）生成链', () => {
  it('实机同条件：downedGoblins && 洞穴层 → spawner 产出 105 占位体', () => {
    world.flags['downedGoblins'] = true;
    delete world.flags['savedGoblin'];
    // 生成率语义：链内 1/20 掷（运气 0）× 链可达率 → 3000 次采样期望命中数十次;
    // 下界取 3（泊松 P(≤3|λ≈30) < 1e-10）保判别力不脆
    expect(n105(sample(cavern, 3000, 1))).toBeGreaterThan(3);
    world.flags['downedGoblins'] = false;
    delete world.flags['savedGoblin'];
  }, 120000);

  it('前置旗矩阵：downedGoblins=false / savedGoblin=true / 场上唯一 → 105 绝迹', () => {
    // ① 前置旗缺：绝不出现 105
    world.flags['downedGoblins'] = false;
    delete world.flags['savedGoblin'];
    expect(n105(sample(cavern, 1200, 11))).toBe(0);
    // ② 已解救（savedGoblin=true）：关门绝迹
    world.flags['downedGoblins'] = true;
    world.flags['savedGoblin'] = true;
    expect(n105(sample(cavern, 1200, 12))).toBe(0);
    // ③ 场上唯一门：activeIds 含 105（原版 !AnyNPCs(105)）→ 绝迹
    delete world.flags['savedGoblin'];
    const sp = makeSpawner(new Set([105]));
    const hits = new Map<number, number>();
    for (let k = 0; k < 1200; k++) {
      const e = sp.spawn((cavern.x + 0.5) * TILE, (cavern.y - 3) * TILE,
        new RNG((k * 2654435761 + 13) >>> 0), 60, 34);
      if (e && e.vanillaId != null) hits.set(e.vanillaId, (hits.get(e.vanillaId) ?? 0) + 1);
    }
    expect(n105(hits)).toBe(0);
    world.flags['downedGoblins'] = false;
  }, 120000);

  it('深度层边界：地下层（岩石层上）→ 105 绝迹（deeperThanRockLayer 门）', () => {
    world.flags['downedGoblins'] = true;
    delete world.flags['savedGoblin'];
    expect(n105(sample(underground, 1200, 21))).toBe(0);
    world.flags['downedGoblins'] = false;
    delete world.flags['savedGoblin'];
  }, 120000);

  it('转换契约：spawnBound 占位体 105 → trySpawnBoundTownNpc → bound TownNPC 落位', () => {
    // Game 侧转换（trySpawnBoundTownNpc 公开方法）：以裸原型实例驱动（同 BJ10 惯例）
    const added: Array<{ obj: unknown; bucket: string }> = [];
    const g = Object.create(Game.prototype) as unknown as {
      entities: { npcs: unknown[]; add(o: unknown, b: string): void };
      vanillaSpawner: { currentSpawnX: number; currentSpawnY: number };
      trySpawnBoundTownNpc(picked: Enemy): boolean;
    };
    const npcs: unknown[] = [];
    g.entities = {
      npcs,
      add(o: unknown, b: string) { npcs.push(o); added.push({ obj: o, bucket: b }); },
    };
    g.vanillaSpawner = { currentSpawnX: 640, currentSpawnY: 760 };
    // 占位体同 VanillaSpawner.spawnBound 形态：vanillaId 105
    const picked = new Enemy('v_105', 640 * TILE + 8, 760 * TILE);
    picked.vanillaId = 105;
    expect(g.trySpawnBoundTownNpc(picked)).toBe(true);
    expect(added.length).toBe(1);
    expect(added[0].bucket).toBe('npcs');
    const tn = added[0].obj as TownNPC;
    expect(tn instanceof TownNPC).toBe(true);
    expect(tn.npcKey).toBe('goblin_tinkerer');
    expect(tn.bound).toBe(true);
    expect(tn.vanillaId).toBe(107);   // 城镇态 107（解救前以 bound 近似,原版本体 105）
    // 落位：脚底 = 落脚实心面顶（TownNPC ctor y-h 语义 = NewNPC Bottom 锚 NPC.cs:46596）
    expect(tn.y + tn.h).toBe(760 * TILE);
    // 已在场 → 消费 picked 但不重复加
    expect(g.trySpawnBoundTownNpc(picked)).toBe(true);
    expect(added.length).toBe(1);
    // 非绑缚族 id → 不消费（返回 false 走通用放置）
    const slime = new Enemy('v_1', 0, 0);
    slime.vanillaId = 1;
    expect(g.trySpawnBoundTownNpc(slime)).toBe(false);
    expect(added.length).toBe(1);
  });

  it('解救链协同：解救置 savedGoblin（freeBoundNpc 语义）→ 三人组门随之关闭', () => {
    world.flags['downedGoblins'] = true;
    delete world.flags['savedGoblin'];
    // 命中至少一次 105（证明可达；转换后即场上唯一 → 解救关门）
    let seen = 0;
    for (let k = 0; k < 3000 && seen === 0; k++) {
      const e = makeSpawner().spawn((cavern.x + 0.5) * TILE, (cavern.y - 3) * TILE,
        new RNG((k * 2654435761 + 77) >>> 0), 60, 34);
      if (e?.vanillaId === 105) seen++;
    }
    expect(seen).toBeGreaterThan(0);
    world.flags['savedGoblin'] = true;
    expect(n105(sample(cavern, 1200, 31))).toBe(0);
    world.flags['downedGoblins'] = false;
    delete world.flags['savedGoblin'];
  }, 120000);

  it('同族新支（NPC.cs:1928-1931）：海岸带干沙 → 376 睡渔夫；savedAngler 关门', () => {
    if (!beach) {
      console.log('[SW-BJ31] 本种子无干沙海岸点——沙滩支正例跳过（结构锁仍覆盖）');
      return;
    }
    // 正例：未解救 → 海岸干沙落点必出 376（门全确定性,无概率面）。实机视野 60/34：
    // 屏内格拒收（checkNotSpawningOnScreen）后合格带=选点 x∈[w-380, 玩家x-60),
    // 全为干沙海岸——200 次采样取_margin
    delete world.flags['savedAngler'];
    const h1 = sample(beach, 200, 41);
    console.log('[SW-BJ31] beach spot', beach, 'hits', [...h1.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
    expect(h1.get(376) ?? 0).toBeGreaterThan(0);
    // 负例：解救后（savedAngler=true）→ 绝迹（L1928 !savedAngler 门）
    world.flags['savedAngler'] = true;
    const h2 = sample(beach, 200, 42);
    expect(h2.get(376) ?? 0).toBe(0);
    delete world.flags['savedAngler'];
  }, 60000);

  it('结构锁：绑缚三人组门表达式与转换映射逐字在位', async () => {
    const fs = await import('node:fs/promises');
    const spawnerSrc = await fs.readFile('src/world/spawn/VanillaSpawner.ts', 'utf8');
    // 1457 NPC.cs:2087 门序逐字段（前置旗 → RollLuck(20) → !water → 洞穴层 →
    // 地狱带上缘 → !saved → 场上唯一）——防静默重排/回退
    expect(spawnerSrc).toContain("f['downedGoblins'] && luck20() && !this.waterTile && this.deeperThanRockLayer");
    expect(spawnerSrc).toContain('&& this.spawnTileY < st.h - 210 && !f[\'savedGoblin\'] && !any(105))');
    expect(spawnerSrc).toContain('return this.spawnBound(105);');
    expect(spawnerSrc).toContain("if (hardMode && luck20() && !this.waterTile && this.deeperThanRockLayer");
    expect(spawnerSrc).toContain('this.downedBoss3 && luck20()');
    // 同族新支：沙滩干沙睡渔夫（NPC.cs:1928-1931 1:1,门序逐字段）+ 海洋支 !savedAngler 两门（L1705/L1708）
    expect(spawnerSrc).toContain("if (!this.waterTile && !this.world.flags['savedAngler'] && !any(376)");
    expect(spawnerSrc).toContain('&& TILE_SAND.has(t) && this.spawnTileY < this.world.groundLevel)');
    expect(spawnerSrc).toContain('return this.spawnNPC(x, y, 376, rng);');
    expect(spawnerSrc).toContain("(!this.spawnFriendlyCycle || (!this.world.flags['savedAngler'] && !any(376)))");
    // Game 侧转换映射（105 → goblin_tinkerer）与解救旗表
    const gameSrc = await fs.readFile('src/core/Game.ts', 'utf8');
    expect(gameSrc).toContain("picked.vanillaId === 105 ? 'goblin_tinkerer'");
    expect(gameSrc).toContain("goblin_tinkerer: 'savedGoblin'");
    expect(gameSrc).toContain('goblin_tinkerer: 105');
    // 原版语义锚注释（1457 行号）防注释漂移
    expect(spawnerSrc).toContain('NPC.cs:1994-2005');
  });
});
