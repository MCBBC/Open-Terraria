// ★清偿刀 R（2026-09-29，X4-债11）：634/635 Kill AoE 环写支档位对齐判别测试。
//   病灶（清偿刀 L 定谳）：刀 F 修 634/635 只及飞行盒面（pierce=1+弹侧补写 5），
//   Kill AoE 爆盒敌怪环仍走 strike pierce=0 → Enemy.hurt 通用尾档（Enemy.ts:14295）
//   受理写 iframes=10，两重偏差：
//     ① 窗值 10t ≠ 原版专支 5t（Terarria1457/Terraria/Projectile.cs:14080-14082
//        `else if (type == 634 || type == 635) { targetNPC.immune[owner] = 5; }`
//        ——写支梯 else-if 链先于尾档 :14176-14182（penetrate!=1→10），飞行盒
//        （penetrate=1）与 Kill AoE（Kill :73265-73269 先置 maxPenetrate=penetrate=-1）
//        两面同梯同值 5；vanillaProjImmuneTiers.ts:80 桥表同钉 5）；
//     ② 受理写支（Enemy.ts:14295，血尽级联 :14369 在其后=致死/非致死均写）污染
//        burst() 紧随的 vanillaGated 门位读（hurt 内 iframes 0→10 ⇒ 读恒真）→
//        AoE 受理命中 ghostHeal proc（Projectile.cs:13877-79）与 numHits++
//        （:14263）恒跳——吸血域（幽灵兜帽）对 AoE 面断供。
//   选型：pierce=-2（Enemy.ts 现役档零改动复用——:13988 免疫门照走〔:12635 flag3=
//   假：Kill 先置 maxPenetrate=-1，非飞行盒 maxPenetrate==1 豁免档〕+:14294-14295
//   写支两档全不达=三不写）+ 受理面弹侧补写 5t（照刀 F 飞行盒形态；写位=原版
//   :14080 在 proc :13877 后，ghostHeal 不读窗 ⇒ 序等价）。-3 档不合：634/635
//   SetDefaults（P.cs:6818-6839）无 usesLocalNPCImmunity 行=非局部族，原版写支
//   是【显型定档 5t】非 usesLocal 清零支（:14175-14178）。
//   判别力：夹具全用【真 Enemy.fromVanilla】（门/写支在真 hurt 内部），几何钉死
//   纯 AoE 面（靶盒交爆盒 1275..1325 不交飞行盒 1280..1320）。旧码（pierce=0）下
//   B 靶 iframes=10、log 仅飞行盒 1 proc、pveNumHits=1，全红；新码全绿。
//   645 面（刀 L pierce=-3）与飞行盒面（刀 F pierce=1）零交叉：debt-f/debt-l 回归承载。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Enemy } from '../src/entities/Enemy';
import { NebulaBlazeBolt } from '../src/entities/LunarNebula';

interface StealCall { kind: string; dmg: number; numHits: number }

function makeGame(log: StealCall[], list: Enemy[]): GameHooks {
  return {
    world: new World(200, 200, 30, 'debt-r'),
    player: null as unknown,
    enemies: () => list,
    entities: { nextId: 1, add: () => {} },
    playSfxFiles: () => {}, playSfx: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    applyLifeSteal: (kind: 'vampire' | 'ghost', dmg: number, numHits: number) => {
      log.push({ kind, dmg, numHits });
      return 0;
    },
  } as unknown as GameHooks;
}

/** 坦克桩敌（真 Enemy 管线;血量抬高避开死亡管线=判别面只看「门过不过+写支」）。
 *  静止不动（测试不 tick 敌）→ iframes 残窗保持到第二发到达。 */
function tankEnemy(game: GameHooks, cx: number, cy: number, id: number): Enemy {
  const e = Enemy.fromVanilla(15, cx, cy)!;   // 僵尸：friendly=false/非 384 族
  e.id = id;
  e.maxHp = 5000;
  e.hp = 5000;
  (game as unknown as { enemies: () => Enemy[] }).enemies().push(e);
  return e;
}

/** 出生点 (1280,1600)（80,100 格）40×40 飞行盒 → A 靶重叠首拍飞行盒命中 →
 *  penetrate 1→0 → Kill=burst（skipId=A）。速度 (0,0)=首拍命中不位移（爆盒锚
 *  恒 1275..1325×1595..1645,与 bj380 贴脸爆夹具同式）。一步 fixedUpdate 即爆。 */
function fireBolt(game: GameHooks): NebulaBlazeBolt {
  const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 130, 3, 634);
  bolt.critChance = 0;
  for (let t = 0; t < 40 && !bolt.dead; t++) bolt.fixedUpdate(1, game);
  expect(bolt.dead).toBe(true);
  return bolt;
}

describe('清偿刀 R：634 Kill AoE 环写支档位（专支 5t :14080-14082 + 门位读除污）', () => {
  it('纯 AoE 靶受理：proc+入账不再跳（旧码恒跳）+ 窗值钉 5t 非 10t', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    // A 靶：盒 1287..1305×1580..1620 与飞行盒 1280..1320×1600..1640 重叠 → 首拍
    // 飞行盒命中（flag3 豁免,刀 F 面）→ burst(skipId=A)
    const a = tankEnemy(game, 81 * TILE, 100 * TILE, 1);
    // B 靶：右缘钉 1277 ∈ (爆盒左沿 1275, 飞行盒左沿 1280] —— 交爆盒不交飞行盒
    // = 纯 AoE 面（无 skipId 豁免）。垂直居中对齐爆心 y=1620。
    const b = tankEnemy(game, 0, 0, 2);
    b.x = 1277 - b.w;
    b.y = 1620 - b.h / 2;
    expect(a.x + a.w > 1280 && a.x < 1320).toBe(true);          // A 飞行盒重叠（前置自检）
    expect(b.x + b.w).toBeGreaterThan(1275);                    // B 交爆盒（前置自检）
    expect(b.x + b.w).toBeLessThanOrEqual(1280);                // B 不交飞行盒（前置自检）

    const hpA0 = a.hp, hpB0 = b.hp;
    const bolt = fireBolt(game);

    // A 飞行盒面（刀 F 既有形态,回归钉）
    expect(a.hp).toBeLessThan(hpA0);
    expect(a.iframes).toBe(5);                                  // :14080-14082 专支 5t
    expect(log[0].numHits).toBe(0);                             // 飞行盒首结 0 档
    // B 纯 AoE 面（本刀判别主面）
    expect(b.hp).toBeLessThan(hpB0);                            // 受理（门过,真扣血）
    expect(b.iframes).toBe(5);                                  // ★专支 5t（旧 pierce=0 写 10=红）
    expect(log.length).toBe(2);                                 // ★proc 不再跳（旧=1 红）
    expect(log[1].kind).toBe('ghost');
    expect(log[1].dmg).toBeGreaterThan(0);                      // num41 防后实扣等位
    expect(log[1].numHits).toBe(1);                             // A 先入账 1 → B proc 读 1 档（:14263 序）
    expect(bolt.pveNumHits).toBe(2);                            // 飞行盒 1 + AoE 1（旧=1 红）
  });

  it('5t 窗消费者：同敌窗内第二发 AoE 被免疫门拦（:12636 flag3=假照走）——零伤零 proc 零覆写', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    const a = tankEnemy(game, 81 * TILE, 100 * TILE, 1);
    const b = tankEnemy(game, 0, 0, 2);
    b.x = 1277 - b.w;
    b.y = 1620 - b.h / 2;
    fireBolt(game);                                             // 首爆：B 受理 → 窗 5t
    expect(b.iframes).toBe(5);
    const hpB1 = b.hp, logLen1 = log.length;

    fireBolt(game);                                             // 第二发（敌不 tick,窗活着）
    // B：Enemy.hurt :13988 免疫门（pierce=-2 ≠ 1）整跳——不扣血、不 proc、不覆写窗
    expect(b.hp).toBe(hpB1);                                    // ★AoE 门拒零伤
    expect(log.length).toBe(logLen1 + 1);                       // 仅 A 飞行盒再 proc（flag3 照打）
    expect(log[logLen1].numHits).toBe(0);                       // 第二弹自计数器首跳 0
    expect(b.iframes).toBe(5);                                  // 门拒不写支,窗原样
  });

  it('残窗敌 AoE 门拒不覆写：他源 10t 残窗原样保持（hurt 早退在写支前,Enemy.ts:13988）', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    const a = tankEnemy(game, 81 * TILE, 100 * TILE, 1);
    const b = tankEnemy(game, 0, 0, 2);
    b.x = 1277 - b.w;
    b.y = 1620 - b.h / 2;
    b.iframes = 10;                                             // 他源残窗
    fireBolt(game);
    expect(b.hp).toBe(5000);                                    // 门拒零伤
    expect(b.iframes).toBe(10);                                 // 残窗原样（三不写）
    expect(log.length).toBe(1);                                 // 仅 A 飞行盒 proc
    expect(log[0].numHits).toBe(0);
  });
});
