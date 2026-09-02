// EoW 离屏消散回归（★2026-09-02 按红队 C 仲裁重写,旧注释把「boss 短路永生」当 parity
//   系偏离,MINOR-7 基线更正）:
//   原版 CheckActive（NPC.cs:78698-78810）【无 boss 短路】——头 13 的 flag2 强真
//   （boss :78743 / case13 强真名单 :78747-78767）挡不住 timeLeft 归零强制翻假
//   （:78790-78794）⇒ 头 13 离 activeRange 盒(2.1×屏)即消、盒内离屏 750t 也消。
//   体节 14/15 在 DoesntDespawnToInactivity 名单（:78584-78679）永不自消;头消散经
//   CheckActive_WormSegments（:78812-78833,自 ai[0] 前向逐段 active=false）整链退场
//   ——Transform 自愈（:52059-52065）只服务【伤害路径】头死后的段接管,消散路径无自愈。
//   断言:①头 13 离屏 despawnTimer 无条件倒数,归零即消散+整链级联;②头在屏内/窗口内
//   照常保命（CRITICAL 摘 boss 短路后的①②保命臂不回归,bossFled 不误置）;
//   ③对照:普通怪（1 蓝史莱姆）离屏照常消散——豁免名单未误扩。
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
    entities: { add: (): void => {} },     // EoC 仆从召出位（eocAI :20096 段 entities.add）
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
}
/** 玩家钉在 (60,60),怪放远处模拟离屏（120 格 = 1920px：activeRange 4032 内、
 *  屏幕盒 ~1019 外——处于「保命但 timer 无reset」的四步④倒数带） */
function farEnemy(vid: number): Enemy {
  return Enemy.fromVanilla(vid, 180 * TILE, 60 * TILE)!;
}

describe('EoW 头 13 离屏消散（flag2 强真挡不住 timeLeft 归零 :78790-78794）', () => {
  it('完整链离屏：头 despawnTimer 无条件倒数（旧 boss 短路下恒 750 不动）', () => {
    const w = world();
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    const h = hooks(w, p);
    const head = Enemy.fromVanilla(13, 180 * TILE, 60 * TILE)!;
    const segs = Enemy.spawnWormChain(head, 4);
    [head, ...segs].forEach((e) => { e.hp = e.maxHp; e.id = 1; });
    for (let i = 0; i < 20; i++) {
      head.fixedUpdate(1, h);
      segs.forEach((s) => s.fixedUpdate(1, h));
    }
    expect(head.dead).toBe(false);
    // 20t 内最多位移数百 px（120 格距不变屏）→ 无屏幕盒 reset → 纯倒数
    expect(head.despawnTimer, 'boss/强真名单保命 ≠ 续命:timer 必须无条件 −1').toBeLessThan(750);
  });

  it('timer 归零 → 头消散且整链级联退场（CheckActive_WormSegments :78812 前向级联等价）', () => {
    const w = world();
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    const h = hooks(w, p);
    const head = Enemy.fromVanilla(13, 180 * TILE, 60 * TILE)!;
    const segs = Enemy.spawnWormChain(head, 4);
    [head, ...segs].forEach((e) => { e.hp = e.maxHp; e.id = 1; });
    head.despawnTimer = 30;                       // 钉低值代替 750t 等待（AI 追击位移不影响判别）
    for (let i = 0; i < 60; i++) {
      head.fixedUpdate(1, h);
      segs.forEach((s) => s.fixedUpdate(1, h));
    }
    expect(head.dead, '头13:flag2 强真(:78743/:78747-78767)在 timer≤0 时被 :78791-78794 翻假')
      .toBe(true);
    expect(segs.every((s) => s.dead), '体节14/尾15 随头级联退场(整链同灭,原版无消散自愈)')
      .toBe(true);
  });

  it('boss 屏内照常保命：EoC 夜间贴玩家 800t 不消散、bossFled 不误置（CRITICAL ②保命臂）', () => {
    const w = world();
    w.clock.timeOfDay = 0.9;                      // 夜间:避开白天 EncourageDespawn(10) 漂离支
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    const h = hooks(w, p);
    const eoc = Enemy.fromVanilla(4, 60 * TILE, 60 * TILE)!;
    eoc.hp = eoc.maxHp; eoc.id = 1;
    for (let i = 0; i < 800; i++) eoc.fixedUpdate(1, h);
    expect(eoc.dead, 'boss 在任一活跃玩家屏内/activeRange 内 → flag2 保命(:78743)').toBe(false);
    expect(eoc.bossFled).toBe(false);
  });
});

describe('EoW 离屏消散豁免（DoesntDespawnToInactivity :78584）', () => {
  it('对照:普通怪(1 蓝史莱姆)离屏 750t 照常消散——豁免名单未误扩', () => {
    const w = world();
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    const e = farEnemy(1);
    e.hp = e.maxHp;
    for (let i = 0; i < 800; i++) e.fixedUpdate(1, hooks(w, p));
    expect(e.dead).toBe(true);
  });
});
