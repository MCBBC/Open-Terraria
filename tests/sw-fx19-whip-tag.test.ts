// SW-FX19 域③：鞭 tag 计数链收尾 + 召唤集火槽两写源回归。
//  金标：Projectile.cs:14321-14323（鞭命中写 MinionAttackTargetNPC,aiStyle 165
//  per-hit 单槽最新写胜出——approx-registry L5+④ 定谳）/ Player.cs:57587-57607
//  （MinionNPCTargetAim 右键选靶,无距离门）/ :57682-57685（每 tick 失效清除）。
//  ★变异证红：注释给出「旧实现退化值」。
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { WhipProj } from '../src/entities/WhipProj';
import type { GameHooks } from '../src/entities/types';

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; vanillaId?: number;
  def?: { lifeMax?: number; friendly?: boolean };
  hurt: (d: number, kx?: number, ky?: number, g?: GameHooks) => boolean;
  hits: number[];
}
const mkEnemy = (id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 100000, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

function makeHooks(enemies: MockEnemy[] = []) {
  const store = new TileStore(200, 120);
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) store.setTile(x, y, 1);
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  (hooks as unknown as { entities: { add: (e: unknown) => void } }).entities = {
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks, store, player, added };
}

/** 鞭挥至命中的标准流程（batch-d 同款）：9 拍起手 → 敌移到曲线第 10 点 → 1 拍命中 */
function whipHit(player: Player, hooks: GameHooks, e: MockEnemy, projId = 841, itemId = 4672): void {
  const w = new WhipProj(player.cx, player.cy, 0, projId, itemId, 50, 4, 30, 4, () => player);
  for (let i = 0; i < 9; i++) w.fixedUpdate(1, hooks);
  const pts = w.pointsAt(20, true);
  e.cx = pts[10].x; e.cy = pts[10].y;
  e.x = pts[10].x - 8; e.y = pts[10].y - 12;
  w.fixedUpdate(1, hooks);
}

describe('鞭命中写召唤集火槽（Projectile.cs:14321-14323,aiStyle 165 per-hit）', () => {
  it('① 鞭命中敌 A → minionTargetId=A（旧实现命中不写槽 = -1 必红）', () => {
    const a = mkEnemy(11, 0, 0);
    const { player, hooks } = makeHooks([a]);
    expect(player.minionTargetId).toBe(-1);
    whipHit(player, hooks, a);
    expect(a.hits.length).toBeGreaterThan(0);      // 命中已发生
    expect(player.minionTargetId).toBe(11);        // ★本批新写源
  });
  it('② 单槽最新写胜出：再鞭敌 B → 槽切到 B（定谳:无"多 tag 争距"——各随从消费自持距离/视线门 :29043+:30314+:37836）', () => {
    const a = mkEnemy(11, 0, 0);
    const b = mkEnemy(12, 0, 0);
    const { player, hooks } = makeHooks([a, b]);
    whipHit(player, hooks, a);
    expect(player.minionTargetId).toBe(11);
    whipHit(player, hooks, b);
    expect(player.minionTargetId).toBe(12);        // 最新写覆盖,无距离仲裁
  });
});

describe('集火槽失效清除（Player.cs:57682-57685 每 tick）', () => {
  it('① 目标死亡 → 清 -1', () => {
    const a = mkEnemy(21, 0, 0);
    const { player, hooks } = makeHooks([a]);
    player.minionTargetId = 21;
    a.dead = true;
    player.fixedUpdate(1 / 60, hooks);
    expect(player.minionTargetId).toBe(-1);        // 旧实现无此清除 = 槽悬挂
  });
  it('② 目标离玩家 >3000px → 清 -1;≤3000 保留', () => {
    const near = mkEnemy(31, 60 * 16, 90 * 16);
    // 距离按【中心距】量（玩家 cx=x+10）——far.cx = player.cx + 3001
    const far = mkEnemy(32, 60 * 16 + 10 + 3001, 90 * 16);
    const { player, hooks } = makeHooks([near, far]);
    player.minionTargetId = 32;
    player.fixedUpdate(1 / 60, hooks);
    expect(player.minionTargetId).toBe(-1);        // 超 3000
    player.minionTargetId = 31;
    player.fixedUpdate(1 / 60, hooks);
    expect(player.minionTargetId).toBe(31);        // 近距保留
  });
  it('③ 目标 !CanBeChasedBy（lifeMax≤5 critter 族 :91141）→ 清 -1', () => {
    const critter = mkEnemy(41, 60 * 16, 90 * 16);
    critter.def = { lifeMax: 5 };
    const { player, hooks } = makeHooks([critter]);
    player.minionTargetId = 41;
    player.fixedUpdate(1 / 60, hooks);
    expect(player.minionTargetId).toBe(-1);
  });
  it('④ 集火槽无目标（id 悬空）→ 清 -1', () => {
    const { player, hooks } = makeHooks([]);
    player.minionTargetId = 99;
    player.fixedUpdate(1 / 60, hooks);
    expect(player.minionTargetId).toBe(-1);
  });
});
