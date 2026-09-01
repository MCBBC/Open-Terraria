// EoW 离屏消散回归（用户报告:"打两下自动战败"）:
//   根因 = 体节 14/15 不在 DoesntDespawnToInactivity 名单 → 离屏 750t 消散 →
//   链级联整链同灭（含 boss 槽头）→ Game 误判击败公告。
//   原版 NPC.cs:78584-78679 名单含 14/15；13 走 CheckActive flag2 强真名单 :78735-78758。
//   断言:14/15 长期离屏不消散;13 离屏重置不消散;普通怪（1 史莱姆）离屏照常消散。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 300;
function world(): World {
  const w = new World(W, H, 11, 'eow-despawn');
  w.groundLevel = 50; w.rockLevel = 90;
  return w;
}
function hooks(w: World, p: Player): GameHooks {
  return {
    world: w, player: p,
    enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
}
/** 玩家钉在 (60,60),怪放远处模拟离屏(>62×35 格) */
function farEnemy(vid: number): Enemy {
  return Enemy.fromVanilla(vid, 180 * TILE, 60 * TILE)!;
}

describe('EoW 离屏消散豁免（DoesntDespawnToInactivity :78584）', () => {
  it('完整链（头13+段14+尾15）长期离屏不消散（2000t ≫ 750t 窗）', () => {
    const w = world();
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    const h = hooks(w, p);
    // 完整链放离屏远端(孤立段会被链维护自灭=原版语义,非消散)
    const head = Enemy.fromVanilla(13, 180 * TILE, 60 * TILE)!;
    const segs = Enemy.spawnWormChain(head, 4);
    [head, ...segs].forEach((e) => { e.hp = e.maxHp; e.id = 1; });
    for (let i = 0; i < 2000; i++) {
      head.fixedUpdate(1, h);
      segs.forEach((s) => s.fixedUpdate(1, h));
    }
    // 段间引用互查:链维护自灭与消散都会置 dead——豁免生效则整链存活
    expect(head.dead, '头13(离屏)不应消散').toBe(false);
    expect(segs.every((s) => !s.dead), '段14/尾15(离屏)不应消散').toBe(true);
  });

  it('对照:普通怪(1 蓝史莱姆)离屏 750t 照常消散——豁免名单未误扩', () => {
    const w = world();
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    const e = farEnemy(1);
    e.hp = e.maxHp;
    for (let i = 0; i < 800; i++) e.fixedUpdate(1, hooks(w, p));
    expect(e.dead).toBe(true);
  });
});
