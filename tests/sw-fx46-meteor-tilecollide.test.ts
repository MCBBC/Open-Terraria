// SW-FX46（2026-09-12）首测：424-426 流星法杖弹 AI_001 支的 tileCollide 动态门
// （Projectile.cs:58010-58017——1457 终值;1458 :58010 同域无变更面）：
//   ① `position.Y > Main.player[owner].position.Y - 300f` → tileCollide=true
//   ② `position.Y < Main.worldSurface * 16.0`      → tileCollide=true
// SetDefaults tileCollide=false（:58009 前）→ 高空穿墙坠落,两门任一命中恢复撞块。
// 仓内 :5451 地表线读 `game.world.groundLevel * 16`（groundLevel=worldSurface 消费位,
// Game.ts:5402 `worldSurface: w.groundLevel` 映射）——FX44 定谳「NaN-unsafe 裸读」:
// 缺 groundLevel 的宿主 undefined×16=NaN → `y<NaN` 恒 false=高空恢复支静默失效
// （全寿穿墙）。修复=FX20/R28 :6012 同款 `(groundLevel || 0)` NaN 防灌;本文件为
// 该支首个行为测试（修复前全库无测试驱动 424-426 支）。
import { describe, it, expect, vi } from 'vitest';
import { Arrow } from '../src/entities/Arrow';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { projectileData } from '../src/data/vanillaProjectiles';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

function mkHooks(opts: { groundLevel?: number; playerY?: number }): {
  hooks: GameHooks; player: Player;
} {
  const player = new Player(60 * TILE, (opts.playerY ?? 90) * TILE, new Inventory());
  const world: Record<string, unknown> = { store: new TileStore(120, 200), flags: {} };
  if (opts.groundLevel !== undefined) world.groundLevel = opts.groundLevel;
  const hooks = {
    world,
    player,
    enemies: () => [], critters: () => [],
    projectiles: [], spawnDrop: () => null, damagePlayer: (): number => 0,
    addDamageNumber: () => {}, cutTile: () => {}, onEnemyKilled: () => {},
    spawnEnemy: () => {}, spawnParticles: vi.fn(), notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => true, playSfxWav: vi.fn(),
    spawnDust: vi.fn(), showPickupLabel: () => {}, recLog: () => {},
    achievements: undefined, scene: {},
  } as unknown as GameHooks;
  return { hooks, player };
}

describe('SW-FX46 流星弹 424-426 tileCollide 动态门（AI_001 :58010-58017）', () => {
  it('数据面：424 SetDefaults tileCollide=false（高空穿墙前提）', () => {
    for (const id of [424, 425, 426]) {
      const pd = projectileData(id)!;
      expect(pd, `proj ${id}`).toBeDefined();
      expect(pd.tileCollide, `proj ${id} tileCollide`).toBe(false);
    }
  });

  it('门②：y < groundLevel×16（高空）→ noTileCollide 恢复 false', () => {
    const { hooks } = mkHooks({ groundLevel: 80, playerY: 200 });
    // y=90*16=1440 > 80*16=1280?否——改放 y 高于地表线：y=60*16=960 < 1280 ✓
    // 门①：960 > 200*16-300=2900?否（不触发）
    const m = new Arrow(60 * TILE, 60 * TILE, 4, 0, 26, 0.25, 424, { grav: 0 });
    expect(m.noTileCollide).toBe(true);           // SetDefaults 穿墙初值
    m.fixedUpdate(1, hooks);
    expect(m.noTileCollide).toBe(false);          // 高于地表线 → 恢复撞块
  });

  it('门①：y > player.y-300（贴近玩家）→ noTileCollide 恢复 false', () => {
    const { hooks } = mkHooks({ groundLevel: 200, playerY: 90 });
    // y=88*16=1408 > 90*16-300=1140 ✓ 门①;门②：1408 < 200*16=3200 ✓ 也命中——
    // 两门同拍命中取或语义,断言恢复即可（门②独立覆盖见上一用例）
    const m = new Arrow(60 * TILE, 88 * TILE, 4, 0, 26, 0.25, 425, { grav: 0 });
    m.fixedUpdate(1, hooks);
    expect(m.noTileCollide).toBe(false);
  });

  it('两门皆不命中（中空带）→ noTileCollide 保持 true（继续穿墙）', () => {
    const { hooks } = mkHooks({ groundLevel: 60, playerY: 90 });
    // y=65*16=1040：门② 1040 < 60*16=960?否;门① 1040 > 90*16-300=1140?否
    const m = new Arrow(60 * TILE, 65 * TILE, 4, 0, 26, 0.25, 424, { grav: 0 });
    m.fixedUpdate(1, hooks);
    expect(m.noTileCollide).toBe(true);
  });

  it('★NaN 守卫：宿主缺 groundLevel → 不炸且不误恢复（FX20 :6012 同款缺省支）', () => {
    const { hooks } = mkHooks({});                // world 桩无 groundLevel
    const m = new Arrow(60 * TILE, 65 * TILE, 4, 0, 26, 0.25, 426, { grav: 0 });
    expect(() => m.fixedUpdate(1, hooks)).not.toThrow();
    expect(m.noTileCollide).toBe(true);           // 缺省=地表线未知,不触发高空恢复
  });
});
