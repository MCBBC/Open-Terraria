// ★BJ300（2026-09-23）镰刀干草链守卫 —— 用户实报"镰刀不能收获干草"。
//  定谳=真缺链：原版唯一掉落链真锚 = Player.ItemCheck_CutTiles 循环体
//  `if (sItem.type == 1786)` 支（Player.cs:45033-45062）——KillTile 成功
//  （!tile.active(), :45037）后按【破坏前捕获型】掷 Hay 1727：
//    {3 长草,24 腐化植物,61 丛林植物,110 神圣植物,201 猩红植物,529 海燕麦,637 灰烬草}
//      → Main.rand.Next(1,3) = 1-2 束；
//    {73 长草2,74 丛林植物2,113 神圣植物2} → Next(2,5) = 2-4 束；
//    表外型（藤 52/瓦罐 28/药草 82…）连 Main.rand 都不消费（掷序纪律）。
//  全 10 型 ∈ Main.tileCut（Main.cs:7516/7520/7915-7933）→ TILE_CUT 挥割门先受理，
//  Hay 是镰刀专属加掷（generic else 支 = 裸 KillTile 无此掷——本仓此前只挂了
//  generic 支,故镰刀割草只碎草不掉干草）。
//  本仓两处消费者 = vanilla ItemCheck_CutTiles 调用点全镜像：近战挥割循环
//  （updateSwingHits 内 :44018 支）+ mowCutTiles（MowTheLawn :20494 传 HeldItem）。
//  弹域 CutTiles（Projectile.CutTilesAt）无此支 = 原版本相（1727 全反编译仅
//  Player:45062 / WorldGen:64914 干草块格 252 掉落 / Recipe 三锚）。
// 变异证红（开发期实测）：
//  M1 Game.ts sickleHayDropIfSickle 摘 `heldVid !== 1786` 门（恒过）→ vid 门组红；
//  M2 sickleHayStackForSheet 表外臂 `return 0` → `return 1`（表外也掷）→ 零掷纪律组红；
//  M3 mowCutTiles 签名 heldVid 缺省改恒 -1（割草机路径断线）→ mow 接线组红。
import { describe, it, expect, vi } from 'vitest';
import { Game, sickleHayStackForSheet } from '../src/core/Game';
import { TILE } from '../src/core/constants';
import { TILE_DEFS } from '../src/data/tiles';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

/** vanilla sheet → 内部 tile id（TILE_DEFS 反查；def 不存在断言失败防漂移） */
function idOfSheet(sheet: number): number {
  const idx = TILE_DEFS.findIndex((d) => d.vanilla?.sheet === sheet);
  expect(idx, `sheet ${sheet} 应有内部 tile def`).toBeGreaterThan(0);
  return idx;
}

const HAY_KEY = VANILLA_ITEM_KEY_BY_ID[1727];
if (!HAY_KEY) throw new Error('Hay 1727 应已注册（VANILLA_ITEM_KEY_BY_ID 反查失败）');
const SICKLE = 1786;      // ItemID.cs:5118
const DEATH_SICKLE = 1327; // ItemID.cs:4200 —— 名字含 Sickle 的反例物（表内 Hay 掷不得串门）

type DropCall = { key: string; stack: number; x: number; y: number };

interface HayGame {
  world: { store: unknown };
  spawnDrop: (x: number, y: number, key: string, stack: number, vx: number, vy: number) => unknown;
  sickleHayDropIfSickle: (vid: number, t: number, x: number, y: number) => void;
  mowCutTiles: (rx: number, ry: number, rw: number, rh: number, heldVid?: number) => void;
  breakTile: (x: number, y: number) => void;
  smashPot: (x: number, y: number) => void;
  swingTileCutSet: Set<number>;
  player: unknown;
}

/** helper 直调台：world.store 只含 hasTile（helper 唯一 store 消费面） */
function hayHarness(tileAlive: boolean) {
  const game = Object.create(Game.prototype) as unknown as HayGame;
  game.world = { store: { hasTile: () => tileAlive } };
  const drops: DropCall[] = [];
  game.spawnDrop = (x, y, key, stack) => {
    drops.push({ key, stack, x, y });
    return null;
  };
  return { game, drops };
}

// ============================================================
// A. 纯掷函数 sickleHayStackForSheet（Player.cs:45041-45056 逐字）
// ============================================================
describe('BJ300 sickleHayStackForSheet 掷表（Player.cs:45041-45056）', () => {
  it('1-2 束表 {3,24,61,110,201,529,637}：400 掷全落 [1,2] 且两端齐现（Next(1,3) 闭下开上）', () => {
    for (const sheet of [3, 24, 61, 110, 201, 529, 637]) {
      const seen = new Set<number>();
      for (let n = 0; n < 400; n++) {
        const v = sickleHayStackForSheet(sheet);
        expect(v, `sheet ${sheet}`).toBeGreaterThanOrEqual(1);
        expect(v, `sheet ${sheet}`).toBeLessThanOrEqual(2);
        seen.add(v);
      }
      expect(seen, `sheet ${sheet} 两端应齐现`).toEqual(new Set([1, 2]));
    }
  });

  it('2-4 束表 {73,74,113}：400 掷全落 [2,4] 且三值齐现（Next(2,5)）', () => {
    for (const sheet of [73, 74, 113]) {
      const seen = new Set<number>();
      for (let n = 0; n < 600; n++) {
        const v = sickleHayStackForSheet(sheet);
        expect(v, `sheet ${sheet}`).toBeGreaterThanOrEqual(2);
        expect(v, `sheet ${sheet}`).toBeLessThanOrEqual(4);
        seen.add(v);
      }
      expect(seen, `sheet ${sheet} 三值应齐现`).toEqual(new Set([2, 3, 4]));
    }
  });

  it('表外型零掷：藤 52/瓦罐 28/药草 82/泥土 2 → 恒 0 且 Math.random 零消费（掷序纪律）', () => {
    const rnd = vi.spyOn(Math, 'random');
    try {
      for (const sheet of [52, 28, 82, 2]) {
        for (let n = 0; n < 50; n++) {
          expect(sickleHayStackForSheet(sheet), `sheet ${sheet} 表外不掷`).toBe(0);
        }
      }
      expect(rnd).not.toHaveBeenCalled();
    } finally {
      rnd.mockRestore();
    }
  });
});

// ============================================================
// B. sickleHayDropIfSickle（Player.cs:45033-45062 门链）
// ============================================================
describe('BJ300 sickleHayDropIfSickle 门链（vid 门 → !active 门 → 捕获型掷 → 格中心出生）', () => {
  it('镰刀割长草（sheet 3）：格死 → 掉 Hay 1-2 束 @ 格中心 (5*16+8, 5*16+8)', () => {
    const { game, drops } = hayHarness(false);
    game.sickleHayDropIfSickle(SICKLE, idOfSheet(3), 5, 5);
    expect(drops).toHaveLength(1);
    expect(drops[0].key).toBe(HAY_KEY);
    expect(drops[0].stack).toBeGreaterThanOrEqual(1);
    expect(drops[0].stack).toBeLessThanOrEqual(2);
    expect(drops[0].x).toBe(5 * TILE + 8);   // Point.ToWorldCoordinates ≙ 全仓 tile 掉落 +8 惯例
    expect(drops[0].y).toBe(5 * TILE + 8);
  });

  it('镰刀割长草2（sheet 73）：掉 Hay 2-4 束（大束表）', () => {
    const seen = new Set<number>();
    for (let n = 0; n < 40; n++) {
      const { game, drops } = hayHarness(false);
      game.sickleHayDropIfSickle(SICKLE, idOfSheet(73), 3, 3);
      expect(drops).toHaveLength(1);
      expect(drops[0].key).toBe(HAY_KEY);
      expect(drops[0].stack).toBeGreaterThanOrEqual(2);
      expect(drops[0].stack).toBeLessThanOrEqual(4);
      seen.add(drops[0].stack);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);   // 概率门在掷（40 掷只出一种值 ≈ 2^-39）
  });

  it('镰刀割藤（sheet 52∈tileCut 表外 Hay 表）：不掉且零耗骰', () => {
    const rnd = vi.spyOn(Math, 'random');
    try {
      const { game, drops } = hayHarness(false);
      game.sickleHayDropIfSickle(SICKLE, idOfSheet(52), 5, 5);
      expect(drops).toHaveLength(0);
      expect(rnd).not.toHaveBeenCalled();
    } finally {
      rnd.mockRestore();
    }
  });

  it('死亡镰刀 1327（名字同族反例物）：同格不掉不掉骰 —— vid 门是 1786 严判', () => {
    const rnd = vi.spyOn(Math, 'random');
    try {
      const { game, drops } = hayHarness(false);
      game.sickleHayDropIfSickle(DEATH_SICKLE, idOfSheet(3), 5, 5);
      expect(drops).toHaveLength(0);
      expect(rnd).not.toHaveBeenCalled();
    } finally {
      rnd.mockRestore();
    }
  });

  it('格未死（KillTile 被保护门吞）：零掉落零耗骰（!tile.active() :45037 门在先）', () => {
    const rnd = vi.spyOn(Math, 'random');
    try {
      const { game, drops } = hayHarness(true);
      game.sickleHayDropIfSickle(SICKLE, idOfSheet(3), 5, 5);
      expect(drops).toHaveLength(0);
      expect(rnd).not.toHaveBeenCalled();
    } finally {
      rnd.mockRestore();
    }
  });
});

// ============================================================
// C. mowCutTiles 接线（MowTheLawn :20494 传 HeldItem 面）
// ============================================================
/** mow 直调台：store 状态化 hasTile（breakTile 桩翻格死,模拟真清格序） */
function mowHarness(weedInternal: number) {
  const dead = { v: false };
  const game = Object.create(Game.prototype) as unknown as HayGame;
  game.world = {
    store: {
      inBounds: () => true,
      hasTile: () => !dead.v,
      get: (x: number, y: number) => (x === 5 && y === 5 ? weedInternal : 0),
      // canCutTile 谓词读 idx/wall/frameX——零墙零帧全过（bj108 cutHarness 同构）
      idx: (x: number, y: number) => (x & 255) * 256 + (y & 255),
      wall: new Uint16Array(256 * 256),
      frameX: new Uint16Array(256 * 256),
    },
  };
  game.player = { inv: { armor: {}, accSlotMax: 8 } };   // accessoryVanillaIds 空=无 natureGuard
  game.swingTileCutSet = new Set();
  game.breakTile = vi.fn(() => { dead.v = true; });      // 破坏成功 → 格死
  game.smashPot = vi.fn();
  const drops: DropCall[] = [];
  game.spawnDrop = (x, y, key, stack) => {
    drops.push({ key, stack, x, y });
    return null;
  };
  return { game, drops, breakTile: game.breakTile as unknown as ReturnType<typeof vi.fn> };
}

describe('BJ300 mowCutTiles heldVid 穿线（MowTheLawn HeldItem 面）', () => {
  it('持镰刀割草：割切照常 + Hay 落地（vanilla CutTiles(HeldItem) 的 Sickle 支同效）', () => {
    const { game, drops, breakTile } = mowHarness(idOfSheet(3));
    // 盒 (80,80,16,16) → 扫描 tx/ty 5..6 恰含 (5,5) 杂草格
    game.mowCutTiles(80, 80, 16, 16, SICKLE);
    expect(breakTile).toHaveBeenCalledWith(5, 5);
    expect(drops).toHaveLength(1);
    expect(drops[0].key).toBe(HAY_KEY);
    expect(drops[0].x).toBe(5 * TILE + 8);
    expect(drops[0].y).toBe(5 * TILE + 8);
  });

  it('非镰刀挥动（heldVid=-1 缺省/异形调用）：割切照常但零干草 —— generic 支本相', () => {
    const { game, drops, breakTile } = mowHarness(idOfSheet(3));
    game.mowCutTiles(80, 80, 16, 16);
    expect(breakTile).toHaveBeenCalledWith(5, 5);
    expect(drops).toHaveLength(0);
  });
});
