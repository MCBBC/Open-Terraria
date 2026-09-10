// 弹幕命中小动物回归:原版小动物是 NPC,任何伤害即死——
// 箭/法弹此前只遍历 enemies 桶,critters 桶漏判,射松鼠无效果。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
// Critter.ts 已由小动物 Enemy 化重构移除（066d742b）——小动物=Enemy.fromVanilla 入
// critters 桶；本测试只验"弹幕扫掠 critters 桶"语义，构造等价 Enemy 实体即可
import { Enemy } from '../src/entities/Enemy';
import { Arrow } from '../src/entities/Arrow';
import { MagicProj } from '../src/entities/MagicProj';
import type { GameHooks } from '../src/entities/types';

const makeSquirrel = (): Enemy => {
  const e = Enemy.fromVanilla(299, 40 * 16 + 8, 20 * 16 + 8);
  if (!e) throw new Error('squirrel 299 构造失败');
  return e;
};

function makeGame(critters: unknown[]): GameHooks {
  const world = new World(64, 32, 42, '测试');
  // Enemy.hurt 死亡掉落 ctx 读 game.player 的 hp/luck（原版 Main.player[myPlayer] 恒在）
  // ★SW-RB11c：补 addDPS 桩（Enemy.hurt :13739/:13801 pl?.addDPS 消费,?. 只防 null
  //  不防缺方法——2026-09-02 DPS 计量批后本夹具缺此键=命中即 TypeError,两用例伪红）
  const stubPlayer = { hp: 100, maxHp: 100, mana: 20, maxMana: 20, luck: 0, dead: false, cx: 0, cy: 0, addDPS: (_d: number) => {} };
  return {
    world,
    player: stubPlayer,
    enemies: () => [],
    critters: () => critters,
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfxFiles: () => {},
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
}

describe('弹幕命中小动物', () => {
  it('箭射中松鼠:松鼠死亡,箭消耗', () => {
    const squirrel = makeSquirrel();
    expect(squirrel.dead).toBe(false);
    const game = makeGame([squirrel]);
    // 松鼠在 (40,20) 格;箭从左侧水平飞入
    // ★SW-RB11c（2026-09-10）FX9 codemod 残留清偿：旧 ctor 第 8 参 dropKey
    //  （VANILLA_ITEM_KEY_BY_ID[40] 表达式形态,codemod 只摘了 null/'vi_*' 字面量
    //  形态,漏了索引表达式）随回收链摘除——字符串入 opts 槽运行时被静默忽略
    //  （string 属性访问恒 undefined）,但 tsc TS2559 恒红。
    const arrow = new Arrow(40 * 16 - 20, 20 * 16 + 4, 8, 0, 9, 1, 1);
    for (let i = 0; i < 8; i++) arrow.fixedUpdate(1 / 60, game);
    expect(squirrel.dead).toBe(true);
    expect(arrow.dead).toBe(true);
  });

  it('魔法弹射中松鼠:松鼠死亡,弹体消耗', () => {
    const squirrel = makeSquirrel();
    const game = makeGame([squirrel]);
    const proj = new MagicProj(40 * 16 - 20, 20 * 16 + 4, 8, 0, 9, 45, '#8080FF');
    for (let i = 0; i < 8; i++) proj.fixedUpdate(1 / 60, game);
    expect(squirrel.dead).toBe(true);
    expect(proj.dead).toBe(true);
  });

  it('未命中:松鼠存活,箭继续飞', () => {
    const squirrel = makeSquirrel();
    const game = makeGame([squirrel]);
    // 箭在松鼠下方 3 格飞过
    const arrow = new Arrow(40 * 16 - 20, 23 * 16, 8, 0, 9, 1, 1);   // ★SW-RB11c 同上:摘残留 dropKey 实参
    for (let i = 0; i < 8; i++) arrow.fixedUpdate(1 / 60, game);
    expect(squirrel.dead).toBe(false);
    expect(arrow.dead).toBe(false);
  });
});

// ============================================================
// ★F4 木网捕熔岩饵料回归（2026-08-30）：ItemCheck_CatchCritters（1457
//  Player.cs:45085 flag=金网3183/防火网4821 豁免；:45097-45103 `!flag &&
//  IsLavaBait[catchItem]` → Hurt(1…WrongBugNet)>0 才 AddBuff(24 OnFire,300t)
//  且不捕捉不掉落）。IsLavaBait 表 = ItemID.cs:1080 {4845地狱蝴蝶,4847熔岩蝇,
//  4849熔岩蜗牛} ← NPC 653/654/655。
// ============================================================
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE } from '../src/core/constants';
import { BuffType } from '../src/stats/Buffs';

const itemIdOf = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

/** netCatchCritter 最小驱动桩（同 weapon-melee-leftover 口径的私有方法直调） */
function netStub(heldVid: number, dealt = 2) {
  const world = new World(64, 32, 42, 'los-f4');
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.player = new Player(50 * TILE, 90 * TILE, new Inventory());
  g.swing = { t: 15, dur: 15, item: itemIdOf(heldVid), useStyle: 1 };
  const drops: string[] = [];
  g.spawnDrop = (x: number, y: number, key: string) => { drops.push(key); return null; };
  g.spawnParticles = () => {};
  const dmgCalls: Array<[number, number]> = [];
  g.damagePlayer = (dmg: number, _sx: number, _sy: number, attacker: unknown) => {
    void attacker;
    dmgCalls.push([dmg, Math.round(dmg)]);
    return dealt;
  };
  return { g, drops, dmgCalls };
}

describe('★F4 木网捕熔岩饵料（IsLavaBait 门 ItemCheck_CatchCritters :45097-45103）', () => {
  it('木网 1991 × 地狱蝴蝶 653：拒捕不掉物 + 自伤 1 + OnFire 300t(5s)', () => {
    const fly = Enemy.fromVanilla(653, 40 * 16 + 8, 20 * 16 + 8)!;
    const { g, drops, dmgCalls } = netStub(1991);
    (g as unknown as { netCatchCritter: (c: unknown) => void }).netCatchCritter(fly);
    expect(fly.dead).toBe(false);                       // 不捕捉（:45097 支无 CatchNPC）
    expect(drops).toHaveLength(0);                      // 不掉落
    expect(dmgCalls).toHaveLength(1);
    expect(dmgCalls[0][0]).toBe(1);                     // Hurt(...,1,...) :45098
    expect((g.player as Player).buffs.has(BuffType.OnFire)).toBe(true);   // AddBuff(24,300)
  });

  it('金网 3183 豁免：照常捕到手心（flag=true :45085）', () => {
    const fly = Enemy.fromVanilla(653, 40 * 16 + 8, 20 * 16 + 8)!;
    const { g, drops, dmgCalls } = netStub(3183);
    (g as unknown as { netCatchCritter: (c: unknown) => void }).netCatchCritter(fly);
    expect(fly.dead).toBe(true);
    expect(drops).toHaveLength(1);
    expect(drops[0]).toContain('4845');
    expect(dmgCalls).toHaveLength(0);
  });

  it('防火网 4821 同豁免照捕；对照木网×普通松鼠 299 照常捕', () => {
    const fly = Enemy.fromVanilla(653, 40 * 16 + 8, 20 * 16 + 8)!;
    const g1 = netStub(4821);
    (g1.g as unknown as { netCatchCritter: (c: unknown) => void }).netCatchCritter(fly);
    expect(fly.dead).toBe(true);
    expect(g1.drops).toHaveLength(1);

    const squirrel = Enemy.fromVanilla(299, 40 * 16 + 8, 20 * 16 + 8)!;
    const g2 = netStub(1991);
    (g2.g as unknown as { netCatchCritter: (c: unknown) => void }).netCatchCritter(squirrel);
    expect(squirrel.dead).toBe(true);                   // 非熔岩饵料生物不受门影响
    expect(g2.dmgCalls).toHaveLength(0);
    expect((g2.g.player as Player).buffs.has(BuffType.OnFire)).toBe(false);
  });
});
