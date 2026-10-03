// ★BJ468（2026-10-03）：SetDefaults 静态置位型 dontTakeDamageFromHostiles（374/375/686）
//   + BJ450「375/686 旗为摆置」判语翻案 + BJ454「374 被僵尸接触互伤」行为锁翻案。
//   vanilla 锚（1457 反编译亲读）：
//   · 置位：NPC.cs:13803（374 藏匿松露虫）/:13822（375 遁地松露虫）/:17670（686 笨笨
//     气球史莱姆）`dontTakeDamageFromHostiles = true`；1456 同（:13707/:13726/:17573，
//     非 1457 新变）；SetDefaults 序章 :8529 复位（无每帧复位,BJ450 已证）。
//   · 身份：375=松露虫遁地形态（catchItem 2673,aiStyle6 穿墙蠕虫,Transform 自 374）；
//     686=笨笨气球史莱姆（Clumsy Balloon Slime,AI_125 :44009,lifeMax1,noTileCollide,
//     DD2 被绑上气球的城镇笨笨史莱姆,死亡 Transform(680) 解救）——非 Betsy
//     （Betsy=551 双足翼龙 aiStyle110;弹幕 686=DD2BetsyFireball 同号异域）。
//   · 消费：GetHurtByOtherNPCs 头门 :93557 `dontTakeDamage || dontTakeDamageFromHostiles
//     || immortal || (CritterThatCanTurnOnPlayers∧aiStyle3)` → return。通道两支：
//     ①AllNPCs（:91592 `type!=37 && (friendly || T-set[type])`,T-set=NPCID.cs:4783
//     96 项含 374 不含 375/686）②蜂（:91601 蜂 210/211 在场 ∧ CanBeHurtByBees
//     [NPCID.cs:4789 CreateBoolSet(true,210,211,222)=除 210/211/222 全真]）。
//   · 净效应：374 双通道开而头门闭=敌怪接触+蜂蜇全免疫;375/686 仅蜂通道开=拒蜂蜇。
//     BJ450 判语只查 T-set 通道漏蜂通道=翻案；BJ454 行为锁（374 被僵尸杀）同因翻案。
//   · 玩家/弹幕 Damage_PVE 通道不设此门（照常可捕可杀）。Transform 全链重跑：
//     tryTransformTo 同参复位+置位（686 死亡 Transform(680) 旗不带给孩子）。
//   判别力：摘置位（Enemy.ts DONT_TAKE_DAMAGE_FROM_HOSTILES_SETDEFAULTS）→ 免疫腿红;
//     摘头门 FromHostiles 支（Enemy.ts:12421）→ 免疫腿红且对照腿仍过=通道判别保活;
//     摘 tryTransformTo 同参线 → 680 旗残留腿红。
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Enemy } from '../src/entities/Enemy';

vi.mock('../src/vui/draw/MouseTextBake', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/vui/draw/MouseTextBake')>();
  return { ...orig, drawBakedMouseText: vi.fn(() => true) };
});

// bj454-dd2-edge-three 同款桩（缺省屏外玩家防误吃伤害;天空层防环境杀干扰对照面）
function makeGame(list: Enemy[], playerX = -9999, playerY = -9999): GameHooks {
  return {
    world: new World(200, 200, 30, 'bj468'),
    player: {
      dead: false, x: playerX, y: playerY, w: 20, h: 42,
      cx: playerX + 10, cy: playerY + 21,
      luck: 0, hp: 400, maxHp: 400, mana: 100, maxMana: 100,
    } as unknown,
    enemies: () => list,
    critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfxFiles: () => {}, playSfx: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
    applyLifeSteal: () => 0,
  } as unknown as GameHooks;
}

describe('BJ468：SetDefaults 静态置位 dontTakeDamageFromHostiles（374/375/686）', () => {
  it('置位面：374/375/686=true;对照 1（非置位型）与 46（T-set 成员但非置位型）=false', () => {
    expect(Enemy.fromVanilla(374, 100 * TILE, 10 * TILE)!.dontTakeDamageFromHostiles).toBe(true);
    expect(Enemy.fromVanilla(375, 100 * TILE, 10 * TILE)!.dontTakeDamageFromHostiles).toBe(true);
    expect(Enemy.fromVanilla(686, 100 * TILE, 10 * TILE)!.dontTakeDamageFromHostiles).toBe(true);
    // 摘置位表 → 本三腿红
    expect(Enemy.fromVanilla(1, 100 * TILE, 10 * TILE)!.dontTakeDamageFromHostiles).toBe(false);
    // 46 在 T-set（TAKES_DAMAGE_FROM_HOSTILES）但原版 SetDefaults 无此旗——
    // 证明本表与 T-set 表是两张域不同的表（T-set=通道门,本表=置位面）
    expect(Enemy.fromVanilla(46, 100 * TILE, 10 * TILE)!.dontTakeDamageFromHostiles).toBe(false);
  });

  it('375 蜂通道免疫（:91601 通道开 + :93557 头门闭）;摘旗对照=被蜇（:93594 immune[255]=30）', () => {
    // 腿 A：免疫（bee 居中叠放,单 tick 内不脱叠;近距玩家 320px 防 CheckActive 远 despawn）
    const listA: Enemy[] = [];
    const gameA = makeGame(listA, 150 * TILE, 10 * TILE);
    const worm = Enemy.fromVanilla(375, 130 * TILE, 10 * TILE)!;
    listA.push(worm);
    const bee = Enemy.fromVanilla(210, 130 * TILE + 1, 10 * TILE + 1)!;
    expect(bee.def.damage).toBeGreaterThan(0);        // 攻击者门 :93621
    listA.push(bee);
    worm.fixedUpdate(1 / 60, gameA);
    expect(worm.hp).toBe(worm.maxHp);                 // 头门先拒（摘置位/摘头门支→红）
    expect(worm.dead).toBe(false);
    // 腿 B（摘旗对照,新实体防分离漂移）：蜂通道仍开——头门是唯一拒点
    const listB: Enemy[] = [];
    const gameB = makeGame(listB, 150 * TILE, 10 * TILE);
    const worm2 = Enemy.fromVanilla(375, 130 * TILE, 10 * TILE)!;
    worm2.dontTakeDamageFromHostiles = false;
    listB.push(worm2);
    listB.push(Enemy.fromVanilla(210, 130 * TILE + 1, 10 * TILE + 1)!);
    worm2.fixedUpdate(1 / 60, gameB);
    expect(worm2.hp).toBeLessThanOrEqual(0);          // lifeMax 5 吃 20 伤=死
    expect(worm2.npcImmune255).toBe(30);              // BeHurtByOtherNPC :93663
  });

  it('686 蜂通道免疫（npcVsNpcContactUpdate 直探,零位移确定性）;摘旗对照=被蜇', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const slime = Enemy.fromVanilla(686, 100 * TILE, 10 * TILE)!;
    expect(slime.dontTakeDamageFromHostiles).toBe(true);
    list.push(slime);
    list.push(Enemy.fromVanilla(210, 100 * TILE + 4, 10 * TILE + 4)!);
    (slime as unknown as { npcVsNpcContactUpdate: (g: GameHooks) => void })
      .npcVsNpcContactUpdate(game);
    expect(slime.hp).toBe(slime.maxHp);               // lifeMax 1 未掉=头门拒（摘置位→红）
    slime.dontTakeDamageFromHostiles = false;         // 摘旗对照：蜂通道仍开
    (slime as unknown as { npcVsNpcContactUpdate: (g: GameHooks) => void })
      .npcVsNpcContactUpdate(game);
    expect(slime.hp).toBeLessThan(slime.maxHp);       // 蜂 20 伤 ≥ lifeMax 1
  });

  it('变身同参：686→680 旗不残留（骑手不受传染）;374→375 旗延续（:13803→:13822 同置位）', () => {
    const game = makeGame([]);
    const tt = (e: Enemy, id: number) => (e as unknown as {
      tryTransformTo: (id: number, st: World['store'], allowEmbedded?: boolean, game?: GameHooks) => boolean;
    }).tryTransformTo(id, game.world.store, false, game);
    const balloon = Enemy.fromVanilla(686, 100 * TILE, 10 * TILE)!;
    expect(tt(balloon, 680)).toBe(true);
    expect(balloon.vanillaId).toBe(680);
    expect(balloon.dontTakeDamageFromHostiles).toBe(false);  // 摘 tryTransformTo 同参线→红
    const worm = Enemy.fromVanilla(374, 100 * TILE, 10 * TILE)!;
    expect(tt(worm, 375)).toBe(true);
    expect(worm.vanillaId).toBe(375);
    expect(worm.dontTakeDamageFromHostiles).toBe(true);      // 遁地形态主生产路承接置位
  });
});
