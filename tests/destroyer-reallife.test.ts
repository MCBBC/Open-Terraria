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
import { destroyerAI, spawnMechQueenEnsemble } from '../src/entities/bossAI';
import { crawltipedeAI } from '../src/entities/bossAI_lunar_misc';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

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

// ===================== RB30b-F1 自指豁免回归（2026-09-16 P0 停机） =====================
// 头 realLifeHost===this（原版建链 :51859-51861 realLife=whoAmI 同式）时，血尽必须
// 落进【头自身的】标准死亡管线一次（checkDead NPC.cs:78846 `realLife>=0 &&
// realLife!=whoAmI` 第二支=自指豁免）。曾缺：门判"头活着"→ head.die→hurt→门→die
// 无限递归 → RangeError → rAF 熔断整机停机。断言面：无 throw + 恰一次 death 事件
// （vid=头）+ 掉落归属头 + 整链同死。
describe('RB30b-F1 归属门自指豁免（末击落头/落段各一次 + 千足蜈蚣 + Mechdusa）', () => {
  const SOUL_OF_MIGHT_KEY = VANILLA_ITEM_KEY_BY_ID[548];

  function hooksRec(w: World, p: Player, enemies: Enemy[]) {
    const drops: { key: string; n: number }[] = [];
    const events: { kind: string; vid: number | null }[] = [];
    const h = hooks(w, p, enemies);
    (h as unknown as { entities: { add: (e: Enemy) => void } }).entities = { add: (e) => enemies.push(e) };
    (h as unknown as Record<string, unknown>).spawnDrop = (_x: number, _y: number, key: string, n: number) => {
      drops.push({ key, n });
      return null;
    };
    (h as unknown as Record<string, unknown>).recLog = (kind: string, e: { vid: number | null }) => {
      events.push({ kind, vid: e?.vid ?? null });
    };
    return { h, drops, events };
  }

  const deathsOf = (events: { kind: string; vid: number | null }[]) =>
    events.filter((e) => e.kind === 'death').map((e) => e.vid);

  function buildDestroyer(enemies: Enemy[], h: GameHooks, p: Player) {
    const head = Enemy.fromVanilla(134, 100 * TILE, 200 * TILE)!;
    head.hp = head.maxHp;
    enemies.push(head);
    destroyerAI(head, h, p);          // bInit 建链（bossAI.ts:2043 头自指 host）
    return { head, segs: enemies.filter((e) => e !== head) };
  }

  it('毁灭者·末击落头:头自指 host,一次死亡管线 vid=134,掉落归属头(548),整链同死,无 RangeError', () => {
    const w = world();
    const p = new Player(100 * TILE, 100 * TILE, new Inventory());
    const enemies: Enemy[] = [];
    const { h, drops, events } = hooksRec(w, p, enemies);
    const { head, segs } = buildDestroyer(enemies, h, p);
    expect(head.realLifeHost).toBe(head);          // 原版建链同式（自指）
    head.hp = 10;
    expect(() => head.hurt(9999, 0, 0, h, 0, false, 1, true)).not.toThrow();
    expect(head.dead).toBe(true);
    expect(segs.every((s) => s.dead)).toBe(true);  // 蠕虫任一段死亡→整链同死(:14092)
    expect(deathsOf(events)).toEqual([134]);       // 恰一次,归属头
    expect(drops.some((d) => d.key === SOUL_OF_MIGHT_KEY && d.n >= 25)).toBe(true);
  });

  it('毁灭者·末击落段:门归头,头死亡管线恰一次,段自身不进死亡管线,掉落归属头,无 RangeError', () => {
    const w = world();
    const p = new Player(100 * TILE, 100 * TILE, new Inventory());
    const enemies: Enemy[] = [];
    const { h, drops, events } = hooksRec(w, p, enemies);
    const { head, segs } = buildDestroyer(enemies, h, p);
    head.hp = 10;                                   // 共享池余量
    const seg = segs[Math.floor(segs.length / 2)];
    expect(() => seg.hurt(9999, 0, 0, h, 0, false, 1, true)).not.toThrow();
    expect(head.dead).toBe(true);
    expect(seg.dead).toBe(true);                    // 整链同死(级联,非段自身管线)
    expect(deathsOf(events)).toEqual([134]);        // 死亡唯一归属头,无段 death
    expect(drops.some((d) => d.key === SOUL_OF_MIGHT_KEY && d.n >= 25)).toBe(true);
  });

  it('千足蜈蚣 412·末击落段:crawltipedeAI 建链头自指,一次死亡 vid=412,无 RangeError', () => {
    const w = world();
    const p = new Player(100 * TILE, 100 * TILE, new Inventory());
    const enemies: Enemy[] = [];
    const { h, events } = hooksRec(w, p, enemies);
    const head = Enemy.fromVanilla(412, 100 * TILE, 100 * TILE)!;
    enemies.push(head);
    crawltipedeAI(head, h, p);                      // bInit 建链（bossAI_lunar_misc.ts:1979 头自指）
    expect(head.realLifeHost).toBe(head);
    const segs = enemies.filter((e) => e !== head);
    expect(segs.length).toBe(30);                   // :51764-51785 num35=30
    expect(segs.every((s) => s.realLifeHost === head)).toBe(true);
    head.hp = 10;
    expect(() => segs[15].hurt(9999, 0, 0, h, 0, false, 1, true)).not.toThrow();
    expect(head.dead).toBe(true);
    expect(deathsOf(events)).toEqual([412]);
    expect(segs.every((s) => s.dead)).toBe(true);
  });

  it('千足蜈蚣 412·末击落头:同断言', () => {
    const w = world();
    const p = new Player(100 * TILE, 100 * TILE, new Inventory());
    const enemies: Enemy[] = [];
    const { h, events } = hooksRec(w, p, enemies);
    const head = Enemy.fromVanilla(412, 100 * TILE, 100 * TILE)!;
    enemies.push(head);
    crawltipedeAI(head, h, p);
    const segs = enemies.filter((e) => e !== head);
    head.hp = 10;
    expect(() => head.hurt(9999, 0, 0, h, 0, false, 1, true)).not.toThrow();
    expect(head.dead).toBe(true);
    expect(deathsOf(events)).toEqual([412]);
    expect(segs.every((s) => s.dead)).toBe(true);
  });

  it('Mechdusa 路径:spawnMechQueenEnsemble 三机械一体,134 头建链后末击落头一次 vid=134,无 RangeError', () => {
    const w = world();
    const p = new Player(100 * TILE, 100 * TILE, new Inventory());
    const enemies: Enemy[] = [];
    const { h, drops, events } = hooksRec(w, p, enemies);
    const prime = spawnMechQueenEnsemble(h, 100 * TILE, 100 * TILE);
    expect(prime).not.toBeNull();
    const ens134 = enemies.find((e) => e.vanillaId === 134)!;
    expect(ens134).toBeTruthy();
    destroyerAI(ens134, h, p);                      // 真实游戏循环首帧 bInit 建链
    expect(ens134.realLifeHost).toBe(ens134);       // 自指 host → 门豁免覆盖
    const segs = enemies.filter((e) => e !== ens134 && (e.vanillaId === 135 || e.vanillaId === 136));
    expect(segs.length).toBe(81);
    ens134.hp = 10;
    expect(() => ens134.hurt(9999, 0, 0, h, 0, false, 1, true)).not.toThrow();
    expect(ens134.dead).toBe(true);
    expect(deathsOf(events)).toEqual([134]);
    expect(drops.some((d) => d.key === SOUL_OF_MIGHT_KEY && d.n >= 25)).toBe(true);
  });
});
