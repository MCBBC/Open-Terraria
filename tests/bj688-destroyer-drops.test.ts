// ★BJ688 判别锁：毁灭者(The Destroyer 134)掉落锚重定位——checkDead NPC.cs:79003-79024
//   type==134 专支：NPCLoot 前头 position 临时顶替为【距 Main.player[target] 曼哈顿
//   最近的在场 134/135/136 段】position（原版 DropItemFromNPC CommonCode.cs:13-14 落
//   position+w/2,+h/2=胜段中心）。用户实报（2026-10-16）「打完毁灭者零掉落」根因：
//   本仓掉落全锚 this.cx/cy（头自身）——毁灭者头常钻地/出屏（80 段链 ~3500px），末击
//   落身段且头远离时全套战利品生成在头位 = 玩家侧零可见（探针 _bj688-destroyer-drops
//   实证：头移远 3150px 时 12-15 件掉落全部落在头位 3px 内、距玩家 3110px；修复后
//   距玩家 56-62px 且 90t 泵内被玩家拾取入包）。
//   ★与飞龙 FX44b（realLife 死亡归属门,Enemy.ts:15287-15315）不同族：FX44b=头的
//   死亡管线被段窃走（零掉落,掉落【不发生】）；BJ688=头的死亡管线照跑、掉落【发生
//   在错误锚点】（头位 vs 玩家交战处）。对照锁：飞龙 87 无重定位（原版仅 134 专支）
//   ——防过度矫正把全 realLife 族都重定位。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { destroyerAI } from '../src/entities/bossAI';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const SOUL_OF_MIGHT = VANILLA_ITEM_KEY_BY_ID[548];    // 强力灵魂（NotExpert 25-40）
const HALLOWED_BAR = VANILLA_ITEM_KEY_BY_ID[1225];    // 神圣锭（NotExpert 15-30）
const DESTROYER_BAG = VANILLA_ITEM_KEY_BY_ID[3325];   // 毁灭者宝藏袋（专家档唯一面）
const SOUL_OF_FLIGHT = VANILLA_ITEM_KEY_BY_ID[575];   // 飞翔之魂（87 对照,100% 5-10）

const W = 200, H = 400;
function world(expert = false): World {
  const w = new World(W, H, 11, 'bj688-test');
  w.groundLevel = 60; w.rockLevel = 150;
  w.clock.timeOfDay = 0.9;              // 夜间（Clock 默认白天——AI_037 白天/玩家死下坠逃离）
  if (expert) w.difficulty = 1;         // isExpert 为 getter（mainDifficulty>=1）,写字段
  return w;
}
function hooksRec(w: World, p: Player, enemies: Enemy[]) {
  const drops: { key: string; n: number; x: number; y: number }[] = [];
  const events: { kind: string; vid: number | null }[] = [];
  const h: GameHooks = {
    world: w, player: p,
    enemies: () => enemies, critters: () => [],
    spawnDrop: (x: number, y: number, key: string, n: number) => {
      drops.push({ key, n, x, y });    // ★BJ688:记录生成锚（掉落判别主面）
      return null;
    },
    damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
  (h as unknown as { entities: { add: (e: Enemy) => void } }).entities = { add: (e) => enemies.push(e) };
  (h as unknown as Record<string, unknown>).recLog = (kind: string, e: { vid: number | null }) => {
    events.push({ kind, vid: e?.vid ?? null });
  };
  return { h, drops, events };
}

/** 段堆锚（出生点）与头远离位（世界 200×400 tile 内,距堆 >2000px） */
const PILE = { x: 100 * TILE, y: 200 * TILE };          // (1600, 3200)——链出生堆
const HEAD_FAR = { x: 175 * TILE, y: 368 * TILE };      // (2800, 5888)——距堆 ≈2944px

/** 建毁灭者（destroyerAI bInit 81 段链）后把头移远（不再跑 AI,链保持堆位） */
function buildDestroyer(enemies: Enemy[], h: GameHooks, p: Player) {
  const head = Enemy.fromVanilla(134, PILE.x, PILE.y)!;
  head.hp = head.maxHp;
  enemies.push(head);
  destroyerAI(head, h, p);              // bInit 建链（全段堆在出生点）
  const segs = enemies.filter((e) => e !== head);
  head.x = HEAD_FAR.x - head.w / 2;     // 盒左上（cx 语义=中心）
  head.y = HEAD_FAR.y - head.h / 2;
  head.vx = 0; head.vy = 0;
  return { head, segs };
}

const deathsOf = (events: { kind: string; vid: number | null }[]) =>
  events.filter((e) => e.kind === 'death').map((e) => e.vid);

describe('BJ688 毁灭者掉落锚重定位（checkDead :79003-79024 type==134 专支）', () => {
  it('末击落【中段】·头远:掉落全锚最近段(玩家侧),非头位;死亡唯一归属头;灵魂/锭齐出', () => {
    const w = world();
    const p = new Player(PILE.x, PILE.y, new Inventory());   // 玩家在段堆=交战处
    const enemies: Enemy[] = [];
    const { h, drops, events } = hooksRec(w, p, enemies);
    const { head, segs } = buildDestroyer(enemies, h, p);
    expect(segs.length).toBe(81);
    head.hp = 10;                                             // 共享池余量
    const mid = segs[Math.floor(segs.length / 2)];
    expect(() => mid.hurt(9999, 0, 0, h, 0, false, 1, true)).not.toThrow();
    expect(head.dead).toBe(true);
    expect(segs.every((s) => s.dead)).toBe(true);
    expect(deathsOf(events)).toEqual([134]);                  // 死亡唯一归属头
    // 经典档掉落面（NotExpert 规则,ItemDropDatabase.cs:451-453）
    expect(drops.some((d) => d.key === SOUL_OF_MIGHT && d.n >= 25)).toBe(true);
    expect(drops.some((d) => d.key === HALLOWED_BAR && d.n >= 15)).toBe(true);
    // ★锚点判别：全部掉落生成在玩家交战处（<300px）而非头位（>2000px）
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) {
      expect(Math.hypot(d.x - p.cx, d.y - p.cy)).toBeLessThan(300);
      expect(Math.hypot(d.x - head.cx, d.y - head.cy)).toBeGreaterThan(2000);
    }
  });

  it('末击落【头】·头远:同重定位(原版两路径都走 checkDead 专支),锚=玩家侧最近段', () => {
    const w = world();
    const p = new Player(PILE.x, PILE.y, new Inventory());
    const enemies: Enemy[] = [];
    const { h, drops, events } = hooksRec(w, p, enemies);
    const { head, segs } = buildDestroyer(enemies, h, p);
    head.hp = 10;
    expect(() => head.hurt(9999, 0, 0, h, 0, false, 1, true)).not.toThrow();
    expect(head.dead).toBe(true);
    expect(segs.every((s) => s.dead)).toBe(true);
    expect(deathsOf(events)).toEqual([134]);
    expect(drops.some((d) => d.key === SOUL_OF_MIGHT && d.n >= 25)).toBe(true);
    for (const d of drops) {
      expect(Math.hypot(d.x - p.cx, d.y - p.cy)).toBeLessThan(300);
      expect(Math.hypot(d.x - head.cx, d.y - head.cy)).toBeGreaterThan(2000);
    }
  });

  it('专家档:唯一面=宝藏袋 3325(灵魂/锭不直掉,袋内),袋随重定位锚(玩家侧)', () => {
    const w = world(true);
    const p = new Player(PILE.x, PILE.y, new Inventory());
    const enemies: Enemy[] = [];
    const { h, drops, events } = hooksRec(w, p, enemies);
    const { head, segs } = buildDestroyer(enemies, h, p);
    head.hp = 10;
    const mid = segs[Math.floor(segs.length / 2)];
    expect(() => mid.hurt(9999, 0, 0, h, 0, false, 1, true)).not.toThrow();
    expect(deathsOf(events)).toEqual([134]);
    expect(drops.some((d) => d.key === DESTROYER_BAG && d.n === 1)).toBe(true);
    expect(drops.some((d) => d.key === SOUL_OF_MIGHT)).toBe(false);   // NotExpert 支不进
    expect(drops.some((d) => d.key === HALLOWED_BAR)).toBe(false);
    for (const d of drops) {
      expect(Math.hypot(d.x - p.cx, d.y - p.cy)).toBeLessThan(300);
      expect(Math.hypot(d.x - head.cx, d.y - head.cy)).toBeGreaterThan(2000);
    }
  });

  it('对照·飞龙 87(realLife 同族)无重定位:掉落锚=头自身(原版仅 134 专支,防过度矫正)', () => {
    const w = world();
    const p = new Player(PILE.x, PILE.y, new Inventory());
    const enemies: Enemy[] = [];
    const { h, drops } = hooksRec(w, p, enemies);
    const head = Enemy.fromVanilla(87, PILE.x, PILE.y)!;
    head.hp = head.maxHp;
    const segs = Enemy.spawnWormChain(head, 14,
      [89, 88, 89, 89, 89, 89, 89, 89, 88, 89, 89, 90, 91, 92], true);  // sharedLife 建链
    enemies.push(head, ...segs);
    expect(head.realLifeHost).toBe(head);
    head.x = HEAD_FAR.x - head.w / 2;      // 头移远（同毁灭者场景）
    head.y = HEAD_FAR.y - head.h / 2;
    head.hp = 10;
    expect(() => head.hurt(9999, 0, 0, h, 0, false, 1, true)).not.toThrow();
    expect(head.dead).toBe(true);
    // 飞翔之魂 575 照掉（FX44b 归属门面,100% 5-10）——但锚=头自身,不重定位
    expect(drops.some((d) => d.key === SOUL_OF_FLIGHT && d.n >= 5)).toBe(true);
    for (const d of drops) {
      expect(Math.hypot(d.x - head.cx, d.y - head.cy)).toBeLessThan(300);
      expect(Math.hypot(d.x - p.cx, d.y - p.cy)).toBeGreaterThan(2000);
    }
  });
});
