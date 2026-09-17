// SW-BJ31b 2026-09-17【受缚巫师 106 不生成（用户实报，"和不会生成受缚哥布林工匠一样"）】
// 定谳：本仓生成链四面对照零偏差，非缺陷——用户首因 = 巫师前置旗是 Main.hardMode，
// 肉前世界恒不刷（与 105 downedGoblins/685 downedBoss3 各异；BJ31 判例同族：
// 前置旗/深度层/生成率/场上唯一 + 已有一只未找到）。
// 原版锚（Terarria1457/Terraria/NPC.cs，1458 同行同文）：
//   绑缚三人组支（1456 :1994-2005 = 1457 :2087-2096）：
//     else if (Main.hardMode && RollLuck(20) == 0 && !waterTile && deeperThanRockLayer
//       && spawnTileY < Main.maxTilesY - 210 && !savedWizard && !AnyNPCs(106))
//       → SpawnNPC(x, y, 106)                                    [:2091]
//   · 106 = NPCID.BoundWizard（绑缚态本体；解救 talkNPC → AI_000_TransformBoundNPC
//     :19893 Transform(108) 城镇巫师；savedWizard 记账 AI_007 :53496-53498）。
//   · 深度层 = deeperThanRockLayer（洞穴层 :1204 spawnTileY >= Main.rockLayer）且
//     y < maxTilesY-210；非水域；生成率 = RollLuck(20)（运气调制 1/20）。
//   · 不在地牢表（ZoneDungeon 段 :2629 起只挂 123 机械师 :2656——用户把巫师记成
//     "地牢表 108" 系形迹错位：108 = 城镇巫师解救态）。
// 本仓链：VanillaSpawner 绑缚三人组块 → spawnBound(106) 占位体 → Game.trySpawnBoundTownNpc
// 转 bound TownNPC('wizard')（TOWN_NPC_IDS.wizard = 108）→ activeIds 反查登记 106
// （BOUND_TOWN_NPC_ID.wizard）→ 解救 freeBoundNpc 置 flags.savedWizard（关门）。
// 本测试锁（BJ31 同式实机条件）：正例采样 / hardMode×深度 2×2 门 / saved 与场上唯一 /
// 转换与落位契约 / freeBoundNpc 解救行为 / 同链 685 普查腿 / 结构锁。
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import { Enemy } from '../src/entities/Enemy';
import { TownNPC } from '../src/entities/TownNPC';
import { Game } from '../src/core/Game';
import { TILE } from '../src/core/constants';
import type { World } from '../src/world/World';

let world: World;
let cavern: { x: number; y: number };        // 洞穴层干燥落脚点（rockLevel 下）
let underground: { x: number; y: number };    // 地下层干燥落脚点（rockLevel 上）

beforeAll(async () => {
  world = await generateWorld({ width: 2400, height: 1200, seedText: 'sw-bj31b-a', evil: 0 });
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
}, 300000);

/** 实机条件组装（同 sw-bj31：setPlayerFlags 实参序镜像 Game.trySpawnEnemy + 实机半屏 60/34） */
function makeSpawner(activeIds: Set<number> = new Set()): VanillaSpawner {
  const sp = new VanillaSpawner(world);
  sp.setPlayerFlags(false, false, false, activeIds, null, null, 400, 0, false, false, false, false, false);
  return sp;
}

function sample(spot: { x: number; y: number }, attempts: number, salt = 1): Map<number, number> {
  const sp = makeSpawner();
  const hits = new Map<number, number>();
  for (let k = 0; k < attempts; k++) {
    const e = sp.spawn((spot.x + 0.5) * TILE, (spot.y - 3) * TILE,
      new RNG((k * 2654435761 + salt) >>> 0), 60, 34);
    if (e && e.vanillaId != null) hits.set(e.vanillaId, (hits.get(e.vanillaId) ?? 0) + 1);
  }
  return hits;
}

const n106 = (h: Map<number, number>): number => h.get(106) ?? 0;
const n685 = (h: Map<number, number>): number => h.get(685) ?? 0;

describe('SW-BJ31b 受缚巫师（绑缚 106）生成链', () => {
  it('实机同条件：hardMode && 洞穴层 → spawner 产出 106 占位体', () => {
    world.flags.hardMode = true;
    delete world.flags['savedWizard'];
    // 生成率语义：1/20 掷 × 链可达率（困难模式支更密,可达率低于肉前）→ 6000 次采样;
    // 下界取 3（泊松尾）保判别力不脆
    expect(n106(sample(cavern, 6000, 1))).toBeGreaterThan(3);
    world.flags.hardMode = false;
    delete world.flags['savedWizard'];
  }, 120000);

  it('条件门 2×2：hardMode=false 绝迹（肉前不刷=原版同相，用户首因）/ 深度层 / saved / 场上唯一', () => {
    // ① hardMode=false + 洞穴层 → 绝迹（★定谳锚：原版 :2091 Main.hardMode 前置旗——
    //    肉前世界刷不出受缚巫师与本仓实现无关）
    world.flags.hardMode = false;
    delete world.flags['savedWizard'];
    expect(n106(sample(cavern, 2000, 11))).toBe(0);
    // ② hardMode=true 但地下层（岩石层上）→ 绝迹（deeperThanRockLayer 门）
    world.flags.hardMode = true;
    expect(n106(sample(underground, 2000, 12))).toBe(0);
    // ③ 已解救（savedWizard=true）→ 关门绝迹
    world.flags['savedWizard'] = true;
    expect(n106(sample(cavern, 2000, 13))).toBe(0);
    delete world.flags['savedWizard'];
    // ④ 场上唯一门：activeIds 含 106（原版 !AnyNPCs(106)；本仓 bound TownNPC 'wizard'
    //    经 BOUND_TOWN_NPC_ID.wizard 反查登记,同语义）→ 绝迹
    const sp = makeSpawner(new Set([106]));
    const hits = new Map<number, number>();
    for (let k = 0; k < 2000; k++) {
      const e = sp.spawn((cavern.x + 0.5) * TILE, (cavern.y - 3) * TILE,
        new RNG((k * 2654435761 + 14) >>> 0), 60, 34);
      if (e && e.vanillaId != null) hits.set(e.vanillaId, (hits.get(e.vanillaId) ?? 0) + 1);
    }
    expect(n106(hits)).toBe(0);
    world.flags.hardMode = false;
  }, 180000);

  it('转换契约：spawnBound 占位体 106 → trySpawnBoundTownNpc → bound TownNPC 落位', () => {
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
    const picked = new Enemy('v_106', 640 * TILE + 8, 760 * TILE);
    picked.vanillaId = 106;
    expect(g.trySpawnBoundTownNpc(picked)).toBe(true);
    expect(added.length).toBe(1);
    expect(added[0].bucket).toBe('npcs');
    const tn = added[0].obj as TownNPC;
    expect(tn instanceof TownNPC).toBe(true);
    expect(tn.npcKey).toBe('wizard');
    expect(tn.bound).toBe(true);
    expect(tn.vanillaId).toBe(108);   // 城镇巫师 108（解救前以 bound 近似,原版本体 106）
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

  it('解救行为测：freeBoundNpc(bound wizard) 置 savedWizard → 三人组门随之关闭', () => {
    // 裸原型 Game 驱动 freeBoundNpc 全语义（685 金钥匙特支不涉 wizard 臂）：
    // bound=false + SAVED_FLAG_BY_KEY.wizard='savedWizard' 写 world.flags + 演出桩
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    g.world = world;
    g.newText = vi.fn();
    g.spawnParticles = vi.fn();
    g.playSfxFiles = vi.fn();
    g.checkAchievementRealEstateAndTownSlimes = vi.fn();
    world.flags.hardMode = true;
    delete world.flags['savedWizard'];
    const tn = new TownNPC('wizard', (cavern.x + 0.5) * TILE, (cavern.y - 2) * TILE);
    tn.bound = true;
    (g.freeBoundNpc as (n: TownNPC) => void).call(g, tn);
    expect(tn.bound).toBe(false);
    expect(world.flags['savedWizard']).toBe(true);
    // 旗关门：同条件再采样 → 106 绝迹
    expect(n106(sample(cavern, 2000, 21))).toBe(0);
    world.flags.hardMode = false;
    delete world.flags['savedWizard'];
  }, 120000);

  it('同链普查腿：685 BoundTownSlimeOld ← downedBoss3，unlockedSlimeOldSpawn 关门', () => {
    // 隔离态：hardMode=false && downedGoblins=false 关掉 105/106 两支,只留 685
    world.flags.hardMode = false;
    world.flags['downedGoblins'] = false;
    delete world.flags['unlockedSlimeOldSpawn'];
    const sp = makeSpawner();
    sp.setPlayerFlags(false, true, false, new Set(), null, null, 400, 0, false, false, false, false, false);
    const hits = new Map<number, number>();
    for (let k = 0; k < 6000; k++) {
      const e = sp.spawn((cavern.x + 0.5) * TILE, (cavern.y - 3) * TILE,
        new RNG((k * 2654435761 + 31) >>> 0), 60, 34);
      if (e && e.vanillaId != null) hits.set(e.vanillaId, (hits.get(e.vanillaId) ?? 0) + 1);
    }
    expect(n685(hits)).toBeGreaterThan(3);
    world.flags['unlockedSlimeOldSpawn'] = true;
    expect(n685(sample(cavern, 2000, 32))).toBe(0);
    delete world.flags['unlockedSlimeOldSpawn'];
  }, 120000);

  it('结构锁：106 门表达式逐字在位 + Game 侧三表运行时反查', async () => {
    const fs = await import('node:fs/promises');
    const spawnerSrc = await fs.readFile('src/world/spawn/VanillaSpawner.ts', 'utf8');
    // 1457 NPC.cs:2091 门序逐字段（hardMode → RollLuck(20) → !water → 洞穴层 →
    // 地狱带上缘 → !savedWizard → 场上唯一）——防静默重排/回退
    expect(spawnerSrc).toContain('if (hardMode && luck20() && !this.waterTile && this.deeperThanRockLayer');
    expect(spawnerSrc).toContain('&& this.spawnTileY < st.h - 210 && !f[\'savedWizard\'] && !any(106))');
    expect(spawnerSrc).toContain('return this.spawnBound(106);');
    // 双版本注释锚防漂移
    expect(spawnerSrc).toContain('1457 :2087-2096');
    // Game 侧：转换映射 / 解救旗表 / 场上唯一反查三表运行时核（比文本锁强）
    const maps = Game as unknown as {
      BOUND_TOWN_NPC_ID: Record<string, number>;
      SAVED_FLAG_BY_KEY: Record<string, string>;
      BOUND_TOWN_NPC_VANILLA: Set<number>;
    };
    expect(maps.BOUND_TOWN_NPC_ID.wizard).toBe(106);
    expect(maps.SAVED_FLAG_BY_KEY.wizard).toBe('savedWizard');
    expect(maps.BOUND_TOWN_NPC_VANILLA.has(106)).toBe(true);
  });
});
