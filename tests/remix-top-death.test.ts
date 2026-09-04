// ③ remix 顶界死亡（成就 44 MY_PEOPLE_NEED_ME）——反编译真值批（2026-09-04）
//   BordersMovement 顶界段（1457 Player.cs:24252-24284）：`position.Y < topWorld+640` 内
//   remix 世界（Main.remixWorld）或 forcedGravity > 0（克脑强制重力）分支——
//   · `position.Y < topWorld+640-height && !dead` → KillMe(ByOther(19), 10.0, 0)（:24264）
//     + whoAmI==myPlayer → NotifyProgressionEvent(44)（:24266-24268，KillMe 之外恒执行
//     ——creativeGodMode 下 KillMe 早退（:39096）但 44 照发 = 原版语义）
//   · 半幅钳位 num4=640/2=320（:24269-24276）：`y < 320 → y=320, vy<0→0, gravDir=1`
//   非 remix 世界 else 支（:24277-24283）：y=640 钳回 + vy<0.11→0.11 + gravDir=1（原样）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { bindJourneyPowers, createJourneyPowers } from '../src/world/JourneyPowers';
import type { GameHooks } from '../src/entities/types';

// 原版最小世界门豁免（≤80 格钳制早退）→ 用 200×200（3200px > 2×640）
function mkWorld(remix: boolean) {
  const w = new World(200, 200, 100, remix ? 'remix-top' : 'plain-top');
  if (remix) w.seedFlags = { remix: true };
  return w;
}

function mkHooks(w: World, p: Player, events: number[], settle = vi.fn()) {
  const hooks = {
    world: w,
    player: p,
    achievements: { notifyProgressionEvent: (ev: number) => { events.push(ev); } },
    settlePlayerDeath: settle,
    enemies: () => [], critters: () => [], projectiles: () => [],
    spawnDrop: () => null, damagePlayer: vi.fn(() => 40),
    askSpectateExit: vi.fn(), addDamageNumber: vi.fn(), cutTile: vi.fn(),
    breakTile: vi.fn(), fellCactus: vi.fn(), onEnemyKilled: vi.fn(),
    spawnEnemy: vi.fn(), spawnParticles: vi.fn(), broadcastParticleOrchestra: vi.fn(),
    notifyInventoryChanged: vi.fn(), playSfx: vi.fn(), playSfxFiles: vi.fn(),
    showPickupLabel: vi.fn(), punchCamera: vi.fn(),
    sfx: { play: vi.fn(), playWavFile: vi.fn() },
  };
  return { hooks: hooks as unknown as GameHooks, events, settle };
}

function mkPlayer(w: World, y: number, events: number[], settle?: ReturnType<typeof vi.fn>) {
  const p = new Player(100 * 16, y, new Inventory());
  const { hooks } = mkHooks(w, p, events, settle);
  return { p, hooks };
}

afterEach(() => bindJourneyPowers(null));

describe('remix/forcedGravity 顶界死亡（Player.cs:24255-24272）', () => {
  it('remix 世界玩家整体越线（y < 640−height）→ KillMe(ByOther(19))：hp=0 + 空间死因 + 成就 44', () => {
    const events: number[] = [];
    const w = mkWorld(true);
    const { p, hooks } = mkPlayer(w, 100, events);      // 100 < 640−42=598
    p.bordersMovement(w, hooks);
    expect(p.hp).toBe(0);                                // KillMe(…,10.0,0) 等价直杀
    expect(p.lastDamageCause).toEqual({ kind: 'space' }); // ByOther(19) Space_1..5
    expect(events).toEqual([44]);                        // MY_PEOPLE_NEED_ME
  });

  it('完整死亡管线：次 tick fixedUpdate 过渡块置 dead + settlePlayerDeath 受理', () => {
    const events: number[] = [];
    const w = mkWorld(true);
    const settle = vi.fn();
    const p = new Player(100 * 16, 100, new Inventory());
    const { hooks } = mkHooks(w, p, events, settle);
    p.fixedUpdate(1 / 60, hooks);                        // 积分后 bordersMovement 杀
    expect(p.hp).toBe(0);
    p.fixedUpdate(1 / 60, hooks);                        // hp≤0 过渡块结算
    expect(p.dead).toBe(true);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(events).toEqual([44]);
  });

  it('越线即死与半幅钳位并存：y=200 → 死 + y 钳 320（num4=640/2 :24269-24276）', () => {
    const events: number[] = [];
    const w = mkWorld(true);
    const { p, hooks } = mkPlayer(w, 200, events);
    p.bordersMovement(w, hooks);
    expect(p.hp).toBe(0);
    expect(p.y).toBe(320);
    expect(events).toEqual([44]);
  });

  it('存活带：598 ≤ y < 640（触发带内未整体越线）不死不钳位', () => {
    const events: number[] = [];
    const w = mkWorld(true);
    const { p, hooks } = mkPlayer(w, 610, events);       // 610 ≥ 640−42=598
    p.vy = 0.05;
    p.bordersMovement(w, hooks);
    expect(p.hp).toBeGreaterThan(0);
    expect(p.lastDamageCause).toBeNull();
    expect(events).toEqual([]);
    expect(p.y).toBe(610);                               // 钳位线 320 以下才钳
  });

  it('整体越线但高于半幅钳位线：y=500 → 死、位置不动（500 ≥ 320 无钳）', () => {
    const events: number[] = [];
    const w = mkWorld(true);
    const { p, hooks } = mkPlayer(w, 500, events);       // 500 < 598 死；500 ≥ 320 不钳
    p.bordersMovement(w, hooks);
    expect(p.hp).toBe(0);
    expect(p.y).toBe(500);
    expect(events).toEqual([44]);
  });

  it('非 remix 世界 else 支原样：钳回 640 + vy 推至 0.11 + gravDir 复位，无死无事件', () => {
    const events: number[] = [];
    const w = mkWorld(false);
    const { p, hooks } = mkPlayer(w, 100, events);
    p.vy = -3;
    p.gravDir = -1;
    p.bordersMovement(w, hooks);
    expect(p.y).toBe(640);
    expect(p.vy).toBe(0.11);
    expect(p.gravDir).toBe(1);
    expect(p.hp).toBeGreaterThan(0);
    expect(events).toEqual([]);
  });

  it('forcedGravity > 0（克脑强制重力）在非 remix 世界同样出界即死（:24256 || 门）', () => {
    const events: number[] = [];
    const w = mkWorld(false);
    const { p, hooks } = mkPlayer(w, 100, events);
    p.forcedGravityT = 10;
    p.bordersMovement(w, hooks);
    expect(p.hp).toBe(0);
    expect(p.lastDamageCause).toEqual({ kind: 'space' });
    expect(events).toEqual([44]);
  });

  it('已死玩家不再重复触发（!dead 门 :24261）', () => {
    const events: number[] = [];
    const w = mkWorld(true);
    const { p, hooks } = mkPlayer(w, 100, events);
    p.dead = true;
    p.hp = 0;
    p.bordersMovement(w, hooks);
    expect(events).toEqual([]);
    expect(p.lastDamageCause).toBeNull();
  });

  it('creativeGodMode：KillMe 早退不置死，但 44 照发（通知在 KillMe 之外 :24266-24268）', () => {
    const events: number[] = [];
    const w = mkWorld(true);
    const powers = createJourneyPowers();
    powers.godmode = true;
    bindJourneyPowers(powers);
    const { p, hooks } = mkPlayer(w, 100, events);
    p.bordersMovement(w, hooks);
    expect(p.hp).toBeGreaterThan(0);                     // KillMe 内 creativeGodMode 早退
    expect(p.lastDamageCause).toBeNull();
    expect(events).toEqual([44]);                        // 原版：神模式照发成就
  });
});
