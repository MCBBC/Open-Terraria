// ① surviveHardcoreDeath 中核存活链（成就 35 EXTRA_LIFE）——反编译真值批（2026-09-04）
//   ★任务前提勘误：原版 HardcoreDeathPenalty 只在【硬核 difficulty==2】调用
//   （KillMe 内 `Main.myPlayer == whoAmI && difficulty == 2`，1457 Player.cs:39164-39167），
//   中核（difficulty==1）死亡惩罚 = 只掉全部物品，不走 -60 上限链（task 面里
//   "中核=difficulty 1?" 的猜测按反编译证伪）。
//   surviveHardcoreDeath = Main.cs:2723-2733 计算属性（非可赋值字段，全仓无赋值面）：
//     dontStarveWorld && tenthAnniversaryWorld && !getGoodWorld
//   → The Constant × Celebrationmk10 组合世界（FTW 附加即失效，forum 实证一致）。
//   HardcoreDeathPenalty（Player.cs:39075-39087）：survive → statLifeMax=Max(-60,0)，
//   仍 >0 → NotifyProgressionEvent(35) + return（不 KillMeForGood，:17161 else 支正常
//   重生）；归零或旗 false → KillMeForGood（:39089-39102 删档）。
//   ghost 门（UpdateDead :17161）：`difficulty==2 && (statLifeMax<=0 || !survive)` 才
//   ghost 化——本仓 isGhostPhase 补齐该门。
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Game } from '../src/core/Game';
import { surviveHardcoreDeath } from '../src/world/gen/SeedEasterEggs';
import { defaultAppearance } from '../src/player/Appearance';
import type { Achievements } from '../src/core/Achievements';
import type { SeedFlags } from '../src/world/gen/SeedEasterEggs';

// ---- Main.cs:2723-2733 计算属性 1:1 ----
describe('surviveHardcoreDeath 派生（Main.cs:2723-2733）', () => {
  it('The Constant × Celebrationmk10 → true', () => {
    expect(surviveHardcoreDeath({ theConstant: true, tenthAnniversary: true })).toBe(true);
  });
  it('附加 FTW → false（forum 实证「fortheworthy as an extra」失效面）', () => {
    expect(surviveHardcoreDeath({
      theConstant: true, tenthAnniversary: true, getGoodWorld: true,
    })).toBe(false);
  });
  it('单种子（仅 Constant / 仅 Celebration）→ false', () => {
    expect(surviveHardcoreDeath({ theConstant: true })).toBe(false);
    expect(surviveHardcoreDeath({ tenthAnniversary: true })).toBe(false);
  });
  it('zenith（getfixedboi 七依赖全置含 FTW）→ false', () => {
    expect(surviveHardcoreDeath({
      everything: true, remix: true, drunkWorld: true, notTheBees: true,
      noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true,
    })).toBe(false);
  });
  it('普通世界 / 缺旗 → false', () => {
    expect(surviveHardcoreDeath({})).toBe(false);
    expect(surviveHardcoreDeath(undefined)).toBe(false);
  });
});

// ---- settlePlayerDeath 硬核分支 = HardcoreDeathPenalty 1:1 ----
describe('HardcoreDeathPenalty（Player.cs:39075-39087 → Game.settlePlayerDeath）', () => {
  function deathShell(seedFlags: SeedFlags | undefined) {
    const g = Object.create(Game.prototype) as Record<string, any>;
    const w = new World(48, 48, 99, 'extra-life');
    w.seedFlags = seedFlags ?? {};
    const p = new Player(24 * 16, 20 * 16, new Inventory());
    p.appearance = { ...defaultAppearance('幸存者'), difficulty: 2 };
    g.player = p;
    g.world = w;
    g.spawnDrop = vi.fn(() => null);
    g.cb = { onToast: vi.fn(), onHardcoreDeath: vi.fn() };
    const events: number[] = [];
    g.achievements = { notifyProgressionEvent: (ev: number) => { events.push(ev); } } as unknown as Achievements;
    return { g, p, w, events, toast: g.cb.onToast };
  }

  it('survive 世界：首死 -60 上限（100→40）+ 成就 35 + 不 KillMeForGood', () => {
    const { g, p, events, toast } = deathShell({ theConstant: true, tenthAnniversary: true });
    p.dead = true;
    g.settlePlayerDeath(false);
    expect(p.baseMaxHp).toBe(40);                 // Max(statLifeMax-60, 0)
    expect(events).toEqual([35]);                 // NotifyProgressionEvent(35)
    expect(p.appearance!.hardcoreDead).toBeFalsy(); // 不删档（return 路径）
    expect(toast).not.toHaveBeenCalled();
  });

  it('survive 世界：上限归零（40-60→0）→ KillMeForGood（hardcoreDead + toast，无 35）', () => {
    const { g, p, events, toast } = deathShell({ theConstant: true, tenthAnniversary: true });
    p.baseMaxHp = 40;
    p.dead = true;
    g.settlePlayerDeath(false);
    expect(p.baseMaxHp).toBe(0);                  // Max(40-60,0)=0 → 不 >0
    expect(events).toEqual([]);                   // 归零无成就
    expect(p.appearance!.hardcoreDead).toBe(true); // KillMeForGood :39089-39102
    expect(toast).toHaveBeenCalledTimes(1);
    expect(g.cb.onHardcoreDeath).toHaveBeenCalledTimes(1);
  });

  it('普通世界：硬核死亡直入 KillMeForGood，不上限扣减、无 35', () => {
    const { g, p, events, toast } = deathShell(undefined);
    p.dead = true;
    g.settlePlayerDeath(false);
    expect(p.baseMaxHp).toBe(100);
    expect(events).toEqual([]);
    expect(p.appearance!.hardcoreDead).toBe(true);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('★勘误面：中核（difficulty==1）死亡不掉上限、不删档、无 35（:39164 difficulty==2 门）', () => {
    const { g, p, events } = deathShell({ theConstant: true, tenthAnniversary: true });
    p.appearance = { ...defaultAppearance('中核'), difficulty: 1 };
    p.dead = true;
    g.settlePlayerDeath(false);
    expect(p.baseMaxHp).toBe(100);                // 不走 HardcoreDeathPenalty
    expect(events).toEqual([]);
    expect(p.appearance!.hardcoreDead).toBeFalsy();
  });

  it('survive 世界多死推进：100→40→0 两拍链（首拍 35、次拍删档）', () => {
    const { g, p, events } = deathShell({ theConstant: true, tenthAnniversary: true });
    p.dead = true;
    g.settlePlayerDeath(false);
    expect(events).toEqual([35]);
    (p as unknown as { __swDeathSettled?: boolean }).__swDeathSettled = false;
    p.dead = true;                                 // 第二死（respawnPlayer 已复位的等价态）
    g.settlePlayerDeath(false);
    expect(p.baseMaxHp).toBe(0);
    expect(events).toEqual([35]);
    expect(p.appearance!.hardcoreDead).toBe(true);
  });
});

// ---- ghost 门补齐（UpdateDead :17161 完整条件） ----
describe('isGhostPhase :17161 完整门（statLifeMax<=0 || !survive）', () => {
  function ghostShell(seedFlags: SeedFlags | undefined, baseMaxHp: number) {
    const w = new World(48, 48, 99, 'ghost-gate');
    w.seedFlags = seedFlags ?? {};
    const p = new Player(24 * 16, 20 * 16, new Inventory());
    p.appearance = { ...defaultAppearance('亡魂'), difficulty: 2 };
    p.dead = true;
    p.respawnTimer = 0;
    p.baseMaxHp = baseMaxHp;
    return { w, p };
  }

  it('survive 世界且上限 >0 → 不 ghost（:17170 else 支正常重生）', () => {
    const { w, p } = ghostShell({ theConstant: true, tenthAnniversary: true }, 40);
    expect(p.isGhostPhase(w)).toBe(false);
  });
  it('survive 世界但上限归零 → ghost（statLifeMax <= 0 臂）', () => {
    const { w, p } = ghostShell({ theConstant: true, tenthAnniversary: true }, 0);
    expect(p.isGhostPhase(w)).toBe(true);
  });
  it('普通世界 → ghost（!surviveHardcoreDeath 臂，原版常态）', () => {
    const { w, p } = ghostShell(undefined, 100);
    expect(p.isGhostPhase(w)).toBe(true);
  });
  it('非硬核（difficulty==0）恒不 ghost', () => {
    const w = new World(48, 48, 99, 'ghost-gate');
    const p = new Player(24 * 16, 20 * 16, new Inventory());
    p.appearance = { ...defaultAppearance('软核'), difficulty: 0 };
    p.dead = true;
    p.respawnTimer = 0;
    expect(p.isGhostPhase(w)).toBe(false);
  });
});
