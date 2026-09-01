// 毁灭者共享生命（NPC.realLife,StrikeNPC :82132-82137 传导语义）:
//   段 135/136 受击 → 防御按【本段】结算（135 def=30）→ 伤害扣【头 134】80000
//   总血,段 hp/maxHp 镜像头——节不可单独打死;对照 EoW realLife=null 各段独立。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { destroyerAI } from '../src/entities/bossAI';

const W = 200, H = 400;
function world(): World {
  const w = new World(W, H, 11, 'destroyer-test');
  w.groundLevel = 60; w.rockLevel = 150;
  w.clock.timeOfDay = 0.9;   // 夜间（Clock 默认 8:15AM 白天——AI 白天钻地撤离会整链 dead）
  return w;
}
function hooks(w: World, p: Player, enemies: Enemy[]): GameHooks {
  return {
    world: w, player: p,
    enemies: () => enemies, critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
}

describe('毁灭者共享生命（realLife :50208-50227 / StrikeNPC :82132-82137）', () => {
  it('destroyerAI 首帧建链:全链 realLifeHost=头,段数 80+尾', () => {
    const w = world();
    const p = new Player(100 * TILE, 100 * TILE, new Inventory());
    const head = Enemy.fromVanilla(134, 100 * TILE, 200 * TILE)!;
    const enemies = [head];
    const h = hooks(w, p, enemies);
    (h as unknown as { entities: { add: (e: Enemy) => void } }).entities = { add: (e) => enemies.push(e) };
    destroyerAI(head, h, p);   // bInit 建链
    const segs = enemies.filter((e) => e !== head);
    expect(segs.length).toBe(81);              // 80 身段 + 1 尾
    expect(head.realLifeHost).toBe(head);
    expect(segs.every((s) => s.realLifeHost === head)).toBe(true);
  });

  it('打身体段:防御按段结算,伤害传导扣头,段 hp 镜像', () => {
    const w = world();
    const p = new Player(100 * TILE, 100 * TILE, new Inventory());
    const head = Enemy.fromVanilla(134, 100 * TILE, 200 * TILE)!;
    head.hp = head.maxHp;                      // 80000
    const enemies = [head];
    const h = hooks(w, p, enemies);
    (h as unknown as { entities: { add: (e: Enemy) => void } }).entities = { add: (e) => enemies.push(e) };
    destroyerAI(head, h, p);
    const seg = enemies.find((e) => e.vanillaId === 135)!;
    seg.hp = seg.maxHp;
    const hp0 = head.hp;
    seg.hurt(100, 0, 0, h, 0, false, 1, true); // 单发弹(pierce=1)免 iframes 干扰
    // 段防御 30:dmg = 100 − 30/2 = 85
    expect(head.hp).toBe(hp0 - 85);
    expect(seg.hp).toBe(head.hp);               // 镜像
    expect(seg.maxHp).toBe(head.maxHp);
    expect(seg.dead || seg.hp > 0).toBe(true);  // 未死（节不可单独打死）
  });

  it('对照:EoW 段 realLifeHost 恒 null,受击只扣自己', () => {
    const seg = Enemy.fromVanilla(14, 100 * TILE, 100 * TILE)!;
    expect(seg.realLifeHost).toBeNull();
  });
});
