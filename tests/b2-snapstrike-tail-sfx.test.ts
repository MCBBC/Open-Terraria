// ★B2②（2026-08-31）命中尾三音效回归——独立文件防并行会话 buffer 覆写。
// 原版真值锚：Projectile.cs:14453-14463 尾节拍三连 PlaySound,kind 分支各一声——
//   拍击石 Item30(pitchOffset .3,vol ×0.08) / 焰爆石 Item20(pitchOffset .08,vol 1) /
//   毁灭臂镗 Item43(pitchOffset .3,vol ×0.08)。重载序=SoundEngine.cs:88
//   (LegacySoundStyle,pos,pitchOffset,volumeScale)：:14458 第三实参是 pitch 非音量。
// 音高复合 = LSP case2 default 抖动 Next(-6,7)×0.01（LSP.cs:640,style 20/30/43 无特例）
//   + 尾部 += 显式 offset（LSP.cs:1417）→ 值域 [offset−0.06, offset+0.06]。
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { ITEM_BY_KEY } from '../src/data/items';
import { trySnapStrike } from '../src/stats/SnapStrike';
import type { GameHooks } from '../src/entities/types';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number;
  cx?: number; cy?: number; dead: boolean; onFire3T?: number;
  hurt: () => boolean;
}
const mkEnemy = (id: number, cx: number, cy: number): MockEnemy => ({
  id, x: cx - 8, y: cy - 12, w: 16, h: 24, dead: false,
  hurt: () => true,
});

type SfxCall = [string, number?, number?, number?, number?];

function mkHooks(enemies: MockEnemy[]) {
  const store = new TileStore(200, 120);
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) store.setTile(x, y, 1);
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const sfxWavCalls: SfxCall[] = [];
  const hooks: Record<string, unknown> = {
    world: { store } as never,
    player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnDust: () => null,
    broadcastParticleOrchestra: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    playSfxWav: (file: string, vol?: number, x?: number, y?: number, pitch?: number) => {
      sfxWavCalls.push([file, vol, x, y, pitch]);
    },
  };
  hooks.entities = { add: () => {} };
  return { hooks: hooks as unknown as GameHooks, player, sfxWavCalls };
}

/** 尾三连取证口：按文件名过滤（L5 批环带音 Item_72/pyroclastic_stone/armlet_of_ruin
 *  随逐弹 Spawn 同播——与尾节拍是两处不同位次,断言须分离计数） */
const TAIL_FILES = new Set(['Item_20', 'Item_30', 'Item_43']);
const tailCallsOf = (calls: SfxCall[]): SfxCall[] => calls.filter((c) => TAIL_FILES.has(c[0]));

describe('★B2② 命中尾三音效接线（节拍/档位/复合音高）', () => {
  it('kind1 焰爆石：尾段恰一声 Item_20 满响、位置=owner.MountedCenter、音高域 [0.02,0.14]', () => {
    const { hooks, player, sfxWavCalls } = mkHooks([mkEnemy(2, 1080, 1440), mkEnemy(3, 1140, 1440)]);
    player.inv.armor[3] = { id: iid(6178), stack: 1 };
    trySnapStrike(hooks, player, 1, 960, 1440, 999);
    const tails = tailCallsOf(sfxWavCalls);
    expect(tails).toHaveLength(1);                              // 触发一次=尾段一声（其余为环带音）
    const [file, vol, x, y, pitch] = tails[0];
    expect(file).toBe('Item_20');
    expect(vol).toBe(1);                                        // :14458 volumeScale 缺省满响
    expect(x).toBeCloseTo(player.mountedCenter.x, 4);           // Main.player[owner].MountedCenter
    expect(y).toBeCloseTo(player.mountedCenter.y, 4);
    expect(pitch).toBeGreaterThanOrEqual(0.08 - 0.06 - 1e-9);
    expect(pitch).toBeLessThanOrEqual(0.08 + 0.06 + 1e-9);
  });

  it('kind0 拍击石：尾段恰一声 Item_30 ×0.08 + 域 [0.24,0.36];共用冷却内第二次进函数静默', () => {
    const { hooks, player, sfxWavCalls } = mkHooks([mkEnemy(2, 1020, 1440)]);   // 距 60<120 ✓
    player.inv.armor[3] = { id: iid(6167), stack: 1 };
    trySnapStrike(hooks, player, 0, 960, 1440, 999);
    expect(player.accSnappingStoneCooldown).toBe(360);
    const tails = tailCallsOf(sfxWavCalls);
    expect(tails).toHaveLength(1);
    const [file, vol, , , pitch] = tails[0];
    expect(file).toBe('Item_30');
    expect(vol).toBe(0.08);
    expect(pitch).toBeGreaterThanOrEqual(0.3 - 0.06 - 1e-9);
    expect(pitch).toBeLessThanOrEqual(0.3 + 0.06 + 1e-9);
    // 共用冷却第二次进函数即早退——原文同函数门(:14352-54),不产生第二声（环带/尾皆无）
    sfxWavCalls.length = 0;
    trySnapStrike(hooks, player, 1, 960, 1440, 999);
    expect(tailCallsOf(sfxWavCalls)).toHaveLength(0);
  });

  it('kind2 毁灭臂镗：尾段恰一声 Item_43 ×0.08 + 域 [0.24,0.36];零目标仍播（原文尾段无条件）', () => {
    const { hooks, player, sfxWavCalls } = mkHooks([]);         // 无任何敌怪=零出弹
    player.inv.armor[3] = { id: iid(6179), stack: 1 };
    expect(trySnapStrike(hooks, player, 2, 960, 1440, 999))
      .toBe(Math.trunc((150 + 10 * 2) * player.summonDamageMult));   // ★F1 全漏配档照样给伤
    const tails = tailCallsOf(sfxWavCalls);
    expect(tails).toHaveLength(1);                              // 尾声不受出弹数影响
    const [file, vol, , , pitch] = tails[0];
    expect(file).toBe('Item_43');
    expect(vol).toBe(0.08);
    expect(pitch).toBeGreaterThanOrEqual(0.3 - 0.06 - 1e-9);
    expect(pitch).toBeLessThanOrEqual(0.3 + 0.06 + 1e-9);
  });
});
