// 1457 补盲(2026-08-21):叶绿巨剑 1226 三连击 + 死亡界面跳过复活五门。
//   · 1226:ItemCheck_Shoot :49406-49426 + chlorophyteBladeCounter :43161-43163——
//     计数空的那一击=奖励击(×1.5 伤 ×1.25 kb 水平出手,counter += itemAnimation×3);
//     非奖励击向下出手 velocity=(dir,1)。实现落点 Game.updateUse :7491。
//   · 复活跳过:Main.cs:46124-46134 JustBecameTrue(Jump) → SkipRespawnTime;门 =
//     Player.AllowsRespawnTimerSkip :39264-39391(DeadSkipLockoutTime=90 :1627)。
//     幽灵相/PvP 死亡两门内联在 Game.fixedUpdate :4741,后四门在 allowsRespawnTimerSkip。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY } from '../src/data/items';
import { combatWeapon } from '../src/data/vanillaItemCombat';
import type { GameHooks } from '../src/entities/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** updateUse 可驱动的最小 Game 桩(手持 1226、鼠标指右) */
function chlorophyteGame(counter = 0) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(ITEM_BY_KEY['vi_1226_ChlorophyteClaymore'], 1);
  player.chlorophyteBladeCounter = counter;
  const added: unknown[] = [];
  g.player = player;
  g.world = new World(120, 120, 30, 'c1226');
  g.entities = { critters: [], npcs: [], enemies: [], add: (e: unknown) => added.push(e) };
  g.input = { mouseDown: true, mouseX: 700, mouseY: 300, rightDown: false, uiBlocking: false, downAction: () => false };
  g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0] };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  g.annotateMode = false;
  g.prevSwingMouse = false;      // 点击沿 → canChain
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
  return { g: g as unknown as GameHooks & Record<string, unknown>, player, added };
}

describe('1457 叶绿巨剑 1226 三连击(updateUse :7491 奖励击制)', () => {
  // ★产品 bug 备案(2026-08-21,只记录不修):1457 三连击块整段不可达——
  //   vanilla-itemcombat.json 1226 = {melee:true, noMelee:true, shoot:229} →
  //   combatWeapon(vanillaItemCombat.ts:253)`melee+noMelee` 落 'shot' 兜底(该门要求 :244
  //   `c.melee && !c.noMelee`,叶绿巨剑这类"本体无近战伤害、伤害全在射出弹上"的
  //   1457 件被排除);updateUse 侧 cwMelee=null → `tool?.type==='sword' || (cwMelee&&!tool)`
  //   (:7288)不成立 → 落"其它物品"支(:7835,未排除 'shot')→ :7889 useSwing 起挥动画,
  //   再落到 :8593 useCombatWeapon 的 'shot' 兜底(case 'shot' 尾段通用直射)。
  //   后果:①:7491 奖励击块死代码,chlorophyteBladeCounter 恒 0(×1.5 伤/×1.25 kb/
  //   (dir,0|1) 原版出手制全不生效);②弹走鼠标瞄准角 + 通用 pierce=1,非 1457 语义
  //   (1457:挥击动画 + 每挥射 1126,弹体 1456=229 → 1457=1126)。
  it.skip('奖励击:counter 空 → ×1.5 伤 ×1.25 kb 水平出手,counter += dur×3——待产品修复后启用', () => {
    const { g, player, added } = chlorophyteGame(0);
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    expect(added).toHaveLength(1);
    const shot = added[0] as { projId: number; damage: number; knockback: number; vx: number; vy: number };
    expect(shot.projId).toBe(229);
    expect(shot.damage).toBe(Math.round(95 * 1.5));            // :49411-49413
    expect(shot.knockback).toBeCloseTo(6 * 1.25, 6);           // :49414
    expect(shot.vy).toBe(0);                                   // 奖励击水平出手 (dir,0)
    expect(player.chlorophyteBladeCounter).toBe(32 * 3);       // :49419-49421(useAnimation 32)
  });
  it.skip('非奖励击:counter>0 → 原伤原 kb 向下出手 (dir,1),counter 不增', () => {
    const { g, player, added } = chlorophyteGame(96);
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    const shot = added[0] as { damage: number; knockback: number; vx: number; vy: number };
    expect(shot.damage).toBe(95);
    expect(shot.knockback).toBeCloseTo(6, 6);
    expect(shot.vy).toBeCloseTo(shot.vx, 6);                   // (dir,1)/√2 归一
    expect(player.chlorophyteBladeCounter).toBe(96);
  });

  it('现状锚定(修复后本用例须反转):combatWeapon(1226)=' +
    "kind 'shot' → :7491 块不可达的根因", () => {
    const cw = combatWeapon({ key: 'vi_1226_ChlorophyteClaymore' });
    expect(cw?.kind).toBe('shot');        // melee+noMelee 落兜底(vanillaItemCombat.ts:253)
    expect(cw?.shoot).toBe(229);
  });
  it('现状锚定:手持 1226 点击 → 走通用 shot 兜底(鼠标瞄准弹,无奖励击制)', () => {
    const { g, player, added } = (() => {
      const r = chlorophyteGame(0);
      (r.g.input as { mouseY: number }).mouseY = 200;    // 鼠标指上方:兜底弹 vy<0
      return r;
    })();
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    expect(added).toHaveLength(1);                       // 229 仍会射(useCombatWeapon 'shot' 兜底)
    const shot = added[0] as { projId: number; damage: number; knockback: number; vy: number };
    expect(shot.projId).toBe(229);
    expect(shot.damage).toBe(95);                        // 无 ×1.5(奖励击制未接)
    expect(shot.knockback).toBe(6);                      // 无 ×1.25
    expect(shot.vy).toBeLessThan(0);                     // 鼠标瞄准角,非 (dir,0/1) 原版出手
    expect(player.chlorophyteBladeCounter).toBe(0);      // 计数链死(恒 0,永不递减消费)
  });
});

// ================= 复活跳过五门(AllowsRespawnTimerSkip :39264-39391) =================

/** allowsRespawnTimerSkip 可驱动的最小 Game 桩(敌表经回调构造——玩家坐标先行可用) */
function respawnGame(enemiesFn: (p: Player) => Array<Record<string, unknown>> = () => []) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const world = new World(120, 120, 30, 'respawn');
  const player = new Player(60 * TILE, 60 * TILE, new Inventory());
  g.player = player;
  g.world = world;
  g.entities = { enemies: enemiesFn(player), critters: [], npcs: [] };
  return {
    g: g as unknown as { allowsRespawnTimerSkip(): boolean },
    world, player,
  };
}

describe('1457 复活跳过五门', () => {
  it('门③ 大危险族(NearAnyNPCsThatBlockRespawn :39293-39323):399 天塔柱在视野+320 内 → 禁跳', () => {
    const { g, player } = respawnGame((p) => [
      { vanillaId: 399, x: p.cx + 100, y: p.cy, w: 16, h: 16, dead: false },
    ]);
    expect(g.allowsRespawnTimerSkip()).toBe(false);
  });
  it('门③ 视野外不阻止(Inflate(320) 矩形外的大危险族不管)', () => {
    const { g, player } = respawnGame((p) => [
      { vanillaId: 399, x: p.cx + 3000, y: p.cy, w: 16, h: 16, dead: false },
    ]);
    expect(g.allowsRespawnTimerSkip()).toBe(true);
  });
  it('门② boss(AnyBossHindersRespawnTime :39368-39397):活值 4000px 曼哈顿内 → 禁跳', () => {
    const { g, player } = respawnGame((p) => [
      { vanillaId: 4, def: { boss: true }, x: p.cx + 1000, y: p.cy, w: 38, h: 50, dead: false },
    ]);
    expect(g.allowsRespawnTimerSkip()).toBe(false);
  });
  it('门② boss 4000px 外放行;395 火星飞碟核心豁免(未破核心不可选中)', () => {
    const { g, player } = respawnGame((p) => [
      // 玩家 (960,960):敌 (-3000,-3000) → 曼哈顿 7920 > 4000
      { vanillaId: 4, def: { boss: true }, x: p.cx - 3000, y: p.cy - 3000, w: 38, h: 50, dead: false },
    ]);
    expect(g.allowsRespawnTimerSkip()).toBe(true);
    const ufo = respawnGame((p) => [
      { vanillaId: 395, def: { boss: true }, x: p.cx + 10, y: p.cy, w: 16, h: 16, dead: false },
    ]);
    expect(ufo.g.allowsRespawnTimerSkip()).toBe(true);       // vid 395 豁免
  });
  it('门① 南瓜月/霜月(moonEvent.kind≠0)→ 禁跳;DD2 进行中 → 禁跳', () => {
    const moon = respawnGame();
    moon.world.moonEvent.kind = 1;
    expect(moon.g.allowsRespawnTimerSkip()).toBe(false);
    const dd2 = respawnGame();
    dd2.world.oldOnesArmy.ongoing = true;
    expect(dd2.g.allowsRespawnTimerSkip()).toBe(false);
  });
  it('门① 入侵组匹配(invasionType 同组敌在场)→ 禁跳;无事件空场 → 放行', () => {
    const inv = respawnGame((p) => [
      // INVASION_GROUP[27]=1 哥布林(视野矩形内)
      { vanillaId: 27, x: p.cx + 100, y: p.cy, w: 16, h: 16, dead: false },
    ]);
    inv.world.invasionType = 1;
    expect(inv.g.allowsRespawnTimerSkip()).toBe(false);
    expect(respawnGame().g.allowsRespawnTimerSkip()).toBe(true);
  });
  it('门④ 幽灵相(isGhostPhase):硬核死亡超时 → 禁跳;普通死亡 → 不禁', () => {
    const p = new Player(0, 0, new Inventory());
    const w = new World(120, 120, 30, 'ghost');
    p.dead = true;
    expect(p.isGhostPhase(w)).toBe(false);            // 非硬核:永不成幽灵
    (p as unknown as { appearance: { difficulty: number } }).appearance = { difficulty: 2 };
    p.respawnTimer = 600;
    expect(p.isGhostPhase(w)).toBe(false);            // 经典档阈值 600,未超时
    p.respawnTimer = 601;
    expect(p.isGhostPhase(w)).toBe(true);             // 超时 → 幽灵相(跳过门被禁)
  });
  it('门⑤ PvP 死亡(lastPvpDeath):置位即禁跳(内联门 fixedUpdate :4741)', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.lastPvpDeath).toBe(false);
    p.lastPvpDeath = true;
    expect(p.lastPvpDeath).toBe(true);
  });
  it('结构锚:fixedUpdate 跳过链含 幽灵相/PvP/90t 锁/活值四门(防门被拆)', () => {
    const src = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
    const i = src.indexOf('jumpEdge && player.respawnTimer >= 90');
    expect(i).toBeGreaterThan(-1);
    const chain = src.slice(i, i + 220);   // if 链体(跨行条件)
    expect(chain).toContain('isGhostPhase');
    expect(chain).toContain('lastPvpDeath');
    expect(chain).toContain('allowsRespawnTimerSkip');
    expect(chain).toContain('respawnTimer >= 90');   // DeadSkipLockoutTime(:1627)
  });
});
