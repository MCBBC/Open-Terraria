// BJ114-c 登记债收口：邪恶粉 11/猩红粉 463 命中 NPC → AttemptToConvertNPCToEvil
//（1457 Projectile.cs:14828-14849；1458 :14787 同文零变更）——原版在 AI_006 尾
// Damage()（:17184）逐拍调，仓内=PowderProj.fixedUpdate 每拍 applyPowder 回调内接线，
// 复用血月转化单源 Game.attemptConvertNpcToEvil（血月 UpdateNPC_BloodMoonTransformations
// :93033-93048 与粉末两消费面共用；表=NPC.cs:93050-93085 → BLOOD_MOON_EVIL）。
// Transform 底层语义（:81909-81970）：底边对齐/X/速度不动/血量比例结转（:81931）/
// value==0 钉零（:81914+:81931-81934；血月 caller 面显式重钉 :93037-93046）。
// 判别力：分道（11→腐化表/463→猩红表,crimson 与 world.crimson 无关=弹型权威）×
// 敌怪/小动物双桶×盒相交门×value 钉零（兔 46 value=0 缺省 → 47=500f 钉回 0,
// NPC.cs:9364-9386）×底边对齐+速度结转+血量比例（小动物支）。
// 变异 ≥2 发（crimson 反接→红；摘相交门→红；摘小动物底边/速度/血量结转→红；
// 摘 value 钉零→红）——run 目录见 git log。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';

/** applyPowder 可驱动面最小桩（shell 形制同 tests/bj113-breakhive-tileface.test.ts） */
function mkShell(crimsonWorld = false): {
  g: Game & Record<string, unknown>;
  w: World;
  enemies: Enemy[];
  critters: Enemy[];
} {
  const w = new World(40, 40, 1, 'powder-evil');
  (w as { crimson: boolean }).crimson = crimsonWorld;
  const enemies: Enemy[] = [];
  const critters: Enemy[] = [];
  const g = Object.create(Game.prototype) as unknown as Game & Record<string, unknown>;
  g.world = w;
  g.player = { x: 8 * TILE, y: 8 * TILE, w: 20, h: 42, cx: 8 * TILE + 10, cy: 8 * TILE + 21, dead: false } as never;
  (g as unknown as { remotePlayerProxies: unknown[] }).remotePlayerProxies = [];   // candidatePlayers() 真身消费（targetClosest）
  g.evolution = { convert: () => {} } as never;
  g.entities = {
    enemies, critters, npcs: [], projectiles: [],
    add: (e: unknown, bucket: string) => { if (bucket === 'enemies') enemies.push(e as Enemy); },
  } as never;
  g.spawnParticles = () => {};
  g.playSfxFiles = () => {};
  g.newText = () => {};
  g.cb = { onToast: () => {} } as never;
  return { g, w, enemies, critters };
}

describe('BJ114-c 邪恶粉 11/猩红粉 463 → AttemptToConvertNPCToEvil（血月转化单源复用）', () => {
  it('敌怪兔 46 + 邪恶粉 11 相交 → 腐化兔 47；value 钉零（46 value=0 → 47=500f 钉回 0）+血量比例+X/底边不动', () => {
    const { g, enemies } = mkShell(false);
    const bunny = Enemy.fromVanilla(46, 20 * TILE, 20 * TILE)!;
    bunny.hp = 2;                                 // lifeMax 5（NPC.cs:9371）→ 2/5 比例
    enemies.push(bunny);
    // 弹盒覆盖兔盒（46 w18 h20 @20*TILE）：64×64 云心对齐兔心
    g.applyPowder(11, 20 * TILE + 9 - 32, 20 * TILE + 10 - 32, 64, 64);
    expect(enemies.length).toBe(1);               // 同槽换型（transformTo 不重建）
    const e = enemies[0];
    expect(e.vanillaId).toBe(47);                 // 腐化表 [腐化=47]（:93057 Transform(47)）
    expect((e.def.value ?? 0)).toBe(0);           // ★钉零：47 自带 value=500f（:9386）不得入账
    expect(e.hp).toBe(Math.max(1, Math.trunc((2 * 70) / 5)));   // 28（:81931 47 lifeMax=70）
    expect(e.x).toBe(bunny.x);                    // X 左缘保持（:81909 withReposition 只动 Y）
  });

  it('猩红粉 463 → 猩红表（464/465），与 world.crimson 无关（弹型权威）；11 与 world.crimson=true 仍走腐化表', () => {
    const { g, enemies } = mkShell(true);         // 世界=猩红：粉末分道不受 world 旗影响
    const b1 = Enemy.fromVanilla(46, 20 * TILE, 20 * TILE)!;
    enemies.push(b1);
    g.applyPowder(463, 20 * TILE, 20 * TILE, 64, 64);   // 盒相交（云 64×64 含兔盒）
    expect(enemies[0].vanillaId).toBe(464);       // 猩红兔（:93055 Transform(464)）

    const { g: g2, enemies: en2 } = mkShell(true);
    const b2 = Enemy.fromVanilla(46, 20 * TILE, 20 * TILE)!;
    en2.push(b2);
    g2.applyPowder(11, 20 * TILE, 20 * TILE, 64, 64);
    expect(en2[0].vanillaId).toBe(47);            // world.crimson=true 仍腐化表（crimson=type==463）
  });

  it('小动物支（critters 桶金鱼 55）→ 桶迁移敌怪 57：底边对齐+速度结转+value 钉零；463 → 465', () => {
    const { g, enemies, critters } = mkShell(false);
    const fish = Enemy.fromVanilla(55, 20 * TILE, 20 * TILE)!;
    fish.vx = 0.25; fish.vy = -0.125;
    critters.push(fish);
    g.applyPowder(11, 20 * TILE, 20 * TILE, 64, 64);
    expect(critters[0].dead).toBe(true);          // 旧小动物实体退役
    expect(enemies.length).toBe(1);
    const en = enemies[0];
    expect(en.vanillaId).toBe(57);                // 行走金鱼（:93063 Transform(57)）
    expect(en.x).toBe(fish.x);                            // X 不动
    expect(en.y).toBe(fish.y + fish.h - en.h);            // ★底边对齐（:81912-81918）
    expect(en.vx).toBe(0.25); expect(en.vy).toBe(-0.125); // 速度全程不动
    expect((en.def.value ?? 0)).toBe(0);                  // 钉零（血月 caller 面同款）

    const { g: g2, enemies: en2, critters: cr2 } = mkShell(false);
    const f2 = Enemy.fromVanilla(55, 20 * TILE, 20 * TILE)!;
    cr2.push(f2);
    g2.applyPowder(463, 20 * TILE, 20 * TILE, 64, 64);
    expect(en2[0].vanillaId).toBe(465);           // 猩红金鱼（:93061 Transform(465)）
  });

  it('盒相交门：不相交不转化；已腐化兔 47 再被 11 命中不重复转化（表无 47 键）；proj 10 净化粉不走此面', () => {
    const { g, enemies } = mkShell(false);
    const bunny = Enemy.fromVanilla(46, 20 * TILE, 20 * TILE)!;
    enemies.push(bunny);
    g.applyPowder(11, 0, 0, 64, 64);              // 云在世界角落，兔不相交
    expect(enemies[0].vanillaId).toBe(46);

    g.applyPowder(11, 20 * TILE, 20 * TILE, 64, 64);
    expect(enemies[0].vanillaId).toBe(47);
    const hpAfter = enemies[0].hp;
    g.applyPowder(11, 20 * TILE, 20 * TILE, 64, 64);   // 再命中：47 不在表
    expect(enemies[0].vanillaId).toBe(47);
    expect(enemies[0].hp).toBe(hpAfter);          // 二次命中零副作用（Transform 无二次链）

    const { g: g3, enemies: en3 } = mkShell(false);
    en3.push(Enemy.fromVanilla(46, 20 * TILE, 20 * TILE)!);
    g3.applyPowder(10, 20 * TILE, 20 * TILE, 64, 64);  // 净化粉不转 evil（只 534/687 面）
    expect(en3[0].vanillaId).toBe(46);
  });

  it('血月消费面回归：attemptConvertNpcToEvil(crimson) 直接驱动（血月支 crimson=WorldGen.crimson）——猩红世界出猩红表', () => {
    const { g, enemies } = mkShell(false);
    enemies.push(Enemy.fromVanilla(46, 20 * TILE, 20 * TILE)!);
    (g as unknown as { attemptConvertNpcToEvil(c: boolean): void }).attemptConvertNpcToEvil(true);
    expect(enemies[0].vanillaId).toBe(464);       // w.crimson=true → 猩红表（血月 :93042）
    const { g: g2, enemies: en2 } = mkShell(false);
    en2.push(Enemy.fromVanilla(46, 20 * TILE, 20 * TILE)!);
    (g2 as unknown as { attemptConvertNpcToEvil(c: boolean): void }).attemptConvertNpcToEvil(false);
    expect(en2[0].vanillaId).toBe(47);            // 腐化世界 → 腐化表
  });
});
