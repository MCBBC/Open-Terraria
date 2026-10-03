// BJ476 击杀蠕虫出现巨大飘字数字 10059（用户实报+截图：橙色大数字+一串小 5）。
//
// 定谳（原版 1457 亲读锚）：
//   ① 原版蠕虫族级联死亡【零飘字零受击音】：
//      · EoW 13/14/15 断链自灭（AI_006_Worms NPC.cs:51973-52050）与
//        毁灭者 134/135/136 前段灭（AI_037_Destroyer NPC.cs:50490-50502）均为
//        `life = 0; HitEffect(); checkDead();`——checkDead 面（死亡音/掉落），
//        非 StrikeNPC 面（:82063-82095 飘字/受击音单点）→ 无伤害数字。
//      · 通用蠕虫族两 switch（:51958-51972/:51985-52000）同式。
//   ② 原版唯一"9999 静默"通道：GetHurtByDebuff（NPC.cs:93036-93047）致死 DoT =
//      `life = 1; StrikeNPCNoInteraction(9999,…)`（owner=255）→ StrikeNPC_Inner
//      flag = Damage>=9999 && owner==255（:82063）→ 飘值块整体跳过。
//   ③ 10059 来源判定（本仓）：die() 旧传 `maxHp + 9999` 击穿 hurt 飘值门
//      （rawDmg!==9999，Enemy.ts:14685）→ 级联自灭每段冒 ~10K 飘字。
//      用户报值分解：墓穴爬虫头 513（SetDefaults NPC.cs:11490-11508 区 lifeMax=60、
//      defense=0）→ 60+9999=10059 整，逐位吻合（无伤害掷、无防御减免、crit=false）。
//      触发序：打死蠕虫中段→死亡管线清链→头(513)下拍断链自灭 die()→10059。
//   ④ 颜色勘误：橙色≠暴击。原版 DamagedHostile=(255,160,80)（CombatText.cs:12）
//      本就橙；暴击=DamagedHostileCrit=(255,100,30)（:14）。本仓单源
//      fx/CombatTextColors.ts COMBAT_TEXT_DAMAGED_HOSTILE='#FFA050' 同值。
//      "同屏多个小 5"=正常受击/DoT 飘字（原版 GetHurtByDebuff 小字 dot 形态，
//      地狱业火/暗影火焰每秒 5 同相），非本缺陷。
// 修刀：die() 传 9999 整（走既有 DoT 静默门，applyDoT:4636 同款通道）——飘字+受击音
//   双静音，死亡管线（掉落/死亡音/粒子/记账）不变；致死性无涉（hp 先置 0）。
import { describe, expect, it } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';

interface Spy {
  numbers: Array<{ x: number; y: number; value: number; crit: boolean; color?: string; dot?: boolean }>;
  sounds: string[];
  wavs: string[];
}

const makeGame = (w: World) => {
  const spy: Spy = { numbers: [], sounds: [], wavs: [] };
  const game = {
    world: w,
    player: { dead: false, cx: 0, cy: 0, buffs: { has: () => false, apply: () => {} }, equipStats: {}, addDPS: () => {} },
    recLog: () => {},
    addDamageNumber: (x: number, y: number, value: number, crit: boolean, color?: string, dot?: boolean) => {
      spy.numbers.push({ x, y, value, crit, color, dot });
    },
    playSfx: () => {}, playSfxFiles: (files: string[]) => { spy.sounds.push(...files); },
    playSfxWav: (f: string) => { spy.wavs.push(f); },
    spawnParticles: () => {}, spawnDrop: () => null, onEnemyKilled: () => {},
    enemies: () => [], critters: () => [],
    dust: { spawn: () => ({}) },
    noSpawnCycleThisFrame: false,
    spawnTitaniumShard: () => {}, spawnOnHitPetals: () => {}, chloroOnHitLeafStrike: () => {},
  } as never;
  return { game, spy };
};

const hitSounds = (spy: Spy) => spy.sounds.filter((f) => f.startsWith('NPC_Hit_'));
const deathSounds = (spy: Spy) => spy.sounds.filter((f) => f.startsWith('NPC_Killed_'));

describe('BJ476 级联自灭零飘字（原版 checkDead 面，非 StrikeNPC 面）', () => {
  it('墓穴爬虫头 513（用户实报同构：lifeMax 60+9999=10059）die() 零飘字零受击音，仍致死+死亡音', () => {
    const w = new World(64, 64, 7, 'bj476');
    const { game, spy } = makeGame(w);
    const e = Enemy.fromVanilla(513, 100, 100) as Enemy & { maxHp: number };
    // 原版 SetDefaults 钉值：513 lifeMax=60 / defense=0（NPC.cs）——10059 分解唯一解
    expect(e.maxHp).toBe(60);
    expect(e.def.defense ?? 0).toBe(0);
    expect(60 + 9999).toBe(10059);   // 用户报值逐位吻合（无伤害掷/无减免/crit=false）

    e.die(game);

    expect(spy.numbers).toEqual([]);            // ★判别点：旧 maxHp+9999 会冒 10059 橙字
    expect(hitSounds(spy)).toEqual([]);         // 原版级联死无受击音（非 StrikeNPC 面）
    expect(deathSounds(spy).length).toBeGreaterThan(0);  // checkDead 面死亡音保留
    expect(e.dead).toBe(true);                  // 死亡管线照走
  });

  it('EoW 头 13 断链自灭同构（AI_006 :51973-52050 life=0+HitEffect+checkDead）零飘字', () => {
    const w = new World(64, 64, 7, 'bj476');
    const { game, spy } = makeGame(w);
    const e = Enemy.fromVanilla(13, 100, 100) as Enemy & { maxHp: number };
    expect(e.maxHp).toBe(150);                  // 原版 EoW 三段独立 150（SetDefaults）
    e.die(game);
    expect(spy.numbers).toEqual([]);
    expect(hitSounds(spy)).toEqual([]);
    expect(e.dead).toBe(true);
  });

  it('毁灭者头 134（共享池 lifeMax 80000）die() 仍致死——9999 致死性无涉 hp 先置 0', () => {
    const w = new World(64, 64, 7, 'bj476');
    const { game, spy } = makeGame(w);
    const e = Enemy.fromVanilla(134, 100, 100) as Enemy & { maxHp: number };
    expect(e.maxHp).toBe(80000);
    e.die(game);
    expect(e.dead).toBe(true);
    expect(spy.numbers).toEqual([]);
  });
});

describe('BJ476 门判别力（rawDmg 9999 静默通道 = 原版 :82063 DoT 静默锚）', () => {
  it('旧病灶签名：hurt(60+9999) 直调 = 冒 10059 橙字（伤害色非暴击色）——die() 回退即红', () => {
    const w = new World(64, 64, 7, 'bj476');
    const { game, spy } = makeGame(w);
    const e = Enemy.fromVanilla(513, 100, 100) as Enemy;
    e.hurt(60 + 9999, 0, 0, game);
    expect(spy.numbers.length).toBe(1);
    expect(spy.numbers[0].value).toBe(10059);   // 用户报值精确复现
    expect(spy.numbers[0].crit).toBe(false);    // 橙=伤害色 (255,160,80)，非暴击
    expect(spy.numbers[0].color).toBe('#FFA050');
    expect(hitSounds(spy).length).toBe(1);      // StrikeNPC 面受击音在
  });

  it('hurt(9999) 整 = 静默（GetHurtByDebuff :93036 致死 DoT 同通道），死亡照走', () => {
    const w = new World(64, 64, 7, 'bj476');
    const { game, spy } = makeGame(w);
    const e = Enemy.fromVanilla(513, 100, 100) as Enemy;
    e.hurt(9999, 0, 0, game);
    expect(spy.numbers).toEqual([]);
    expect(hitSounds(spy)).toEqual([]);
    expect(e.dead).toBe(true);
  });
});
