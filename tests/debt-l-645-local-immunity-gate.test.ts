// ★清偿刀 L（2026-09-29）：645 月耀星飞行接触零免疫门统筹定谳+落刀判别测试
//   定谳链（Terarria1457/Terraria/Projectile.cs）：
//     :6955-6965  SetDefaults：penetrate=-1 + usesLocalNPCImmunity + localNPCHitCooldown=-1
//                 → :12635 flag3 = maxPenetrate==1 && !usesLocal && !usesIDStatic = 假
//     :12635-12637 免疫门照走：`if (!((owner<0 || targetNPC.immune[owner]==0) | flag3)) return;`
//                 → 残窗敌（immune[owner]>0）【不】受理
//     :14257-14262 转爆支 `type==645 && ai[1]!=-1 → ai[0]=0, ai[1]=-1` 在 Damage_PVE_Inner
//                 【受理面后】→ 门拒=不转爆,星照常下坠（60px AI 索敌支 :57987-58006
//                 用 CanBeChasedBy,无免疫门=原版本相）
//     :14175-14178 受理写支（usesLocal && cd!=-2 通用梯）：immune[owner]=0（受理面
//                 immune[owner] 已为 0=无操作等位）+ immuneArray[victim]=cd=-1
//                 （:17380-17382 仅 >0 递减 → -1=本星对目标永久豁免）
//     齐射语义：每星独立 localNPCImmunity 表 + 受理写支【不开】10t 全局窗 →
//                 N 星齐射同拍同敌 = N 独立命中（634/635 专支写 5 的星云烈焰不同族）
//   本仓落刀（LunarNebula.ts 645 面）：
//     ①爆相 strike pierce 0→-3（Enemy.ts BJ398 清零档：门 :13988 照走,受理写
//       iframes=0 :14294——局部节流全归弹侧 hitSet）。旧 pierce=0 写 10t 全局窗
//       =多星齐射首星后其余星被门拒整饿死 + 受理写支污染 vanillaGated 门位读
//       （proc/numHits 恒跳,原版受理照 proc :13877-79 照计数 :14263）。
//     ②飞行盒敌怪环补 :12598+:12635-12637 受理门——残窗/免伤敌不触发转爆相。
//   判别力：夹具用【真 Enemy.fromVanilla】（门在真 hurt 内部,非 spy 桩）。
//     旧码下：齐射案 3 星只 1 命中+log 空+iframes=10;转爆门案残窗敌照样转爆
//     （exploded=true）。新码全绿。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Enemy } from '../src/entities/Enemy';
import { LunarFlareStar } from '../src/entities/LunarNebula';

interface StealCall { kind: string; dmg: number; numHits: number }

function makeGame(log: StealCall[], list: Enemy[]): GameHooks {
  return {
    world: new World(200, 200, 30, 'debt-l'),
    player: null as unknown,
    enemies: () => list,
    critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfxFiles: () => {}, playSfx: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    applyLifeSteal: (kind: 'vampire' | 'ghost', dmg: number, numHits: number) => {
      log.push({ kind, dmg, numHits });
      return 0;
    },
  } as unknown as GameHooks;
}

/** 坦克桩敌（真 Enemy 管线;血量抬高避开死亡管线=判别面只看「门过不过+写支」）。
 *  静止不动（测试不 tick 敌）→ iframes 残窗保持到判别窗口结束。 */
function tankEnemy(game: GameHooks, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(15, tx * TILE, ty * TILE)!;   // 僵尸：friendly=false
  e.id = 1;
  e.maxHp = 5000;
  e.hp = 5000;
  (game as unknown as { enemies: () => Enemy[] }).enemies().push(e);
  return e;
}

function runStar(star: LunarFlareStar, game: GameHooks, cap = 40): void {
  for (let t = 0; t < cap && !star.dead; t++) star.fixedUpdate(1, game);
}

describe('清偿刀 L：645 爆相 usesLocal 清零档（:14175-14178）——多星齐射不互饿', () => {
  it('三星齐射同拍同敌：每星独立命中（3 扣血 3 proc）+受理写支不开 10t 全局窗（iframes 恒 0）', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    const e = tankEnemy(game, 84, 100);
    const hp0 = e.hp;

    // 三星同点落（velocity 0：首子步 60px AI 索敌支 :57987-58006 转爆——原版无免疫门）
    const hpAfter: number[] = [];
    for (let s = 0; s < 3; s++) {
      const star = new LunarFlareStar(e.cx - 5, e.cy - 5, 0, 0, 100, 4.5, e.cy + 15);
      star.critChance = 0;
      runStar(star, game);
      expect(star.dead).toBe(true);
      hpAfter.push(e.hp);
      expect(e.iframes).toBe(0);      // ★本刀主判别面：-3 清零档不开全局窗（旧 pierce=0 写 10 → 后星整饿死）
    }
    expect(hpAfter[0]).toBeLessThan(hp0);
    expect(hpAfter[1]).toBeLessThan(hpAfter[0]);   // 星 2 照打（旧码门拒=饿死,hp 不再降）
    expect(hpAfter[2]).toBeLessThan(hpAfter[1]);   // 星 3 照打
    expect(log.length).toBe(3);                    // 每星受理照 proc（:13877-79;旧码受理写 10 污染门位读=proc 恒跳）
    expect(log.every((c) => c.kind === 'ghost' && c.numHits === 0)).toBe(true);  // 每星独立局部表,首跳 0 档
  });

  it('单星爆相受理面：扣血+proc+清零档（iframes=0 非 10）——写支 :14175-14178 钉面', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    const e = tankEnemy(game, 84, 100);
    const hp0 = e.hp;
    const star = new LunarFlareStar(e.cx - 5, e.cy - 5, 0, 0, 100, 4.5, e.cy + 15);
    star.critChance = 0;
    runStar(star, game);
    expect(e.hp).toBeLessThan(hp0);                 // 真实扣血（门过）
    expect(log.length).toBe(1);
    expect(log[0].kind).toBe('ghost');
    expect(star.pveNumHits).toBe(1);                // :14263 受理入账
    expect(e.iframes).toBe(0);                      // :14175-14178 写 0（旧 pierce=0 写 10=两向偏差）
  });
});

describe('清偿刀 L：645 飞行盒受理门（:12598+:12635-12637）——残窗敌不触发 :14257 转爆相', () => {
  it('残窗敌（iframes=10）盒重叠不转爆：星高速穿越（60px AI 支追不上）→ 落全程零转爆零伤', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    const e = tankEnemy(game, 84, 100);
    e.iframes = 10;                                 // 预置残窗（他源 10t——永不 tick 不衰减）
    const hp0 = e.hp;
    // 几何：星起点在敌中心上方 90px（>60：首子步 AI 索敌支不触发）;vy=80/子步 →
    // 首子步末位距 10px（10×10 盒与 18×42 敌盒重叠,<26）→ 盒路径（受 :12636 门）
    // 次子步已 -70（>60：次拍 AI 支亦不触发）→ 高速穿越,转爆只能来自盒路径。
    const star = new LunarFlareStar(e.cx - 5, e.cy - 90, 0, 80, 100, 4.5, e.cy + 15);
    star.critChance = 0;
    runStar(star, game);
    expect(star.dead).toBe(true);                   // 撞块/出界亡（星照常下坠）
    expect((star as unknown as { exploded: boolean }).exploded).toBe(false);  // ★本刀判别主面：残窗敌不触发转爆相（旧码盒重叠即 explodeNow=true）
    expect(e.hp).toBe(hp0);                         // 残窗零伤（:12636 门拒）
    expect(log.length).toBe(0);
  });

  it('无残窗同几何：盒重叠受理 → 转爆+爆相扣血（:14257 受理面转爆本相钉面）', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    const e = tankEnemy(game, 84, 100);
    const hp0 = e.hp;
    const star = new LunarFlareStar(e.cx - 5, e.cy - 90, 0, 80, 100, 4.5, e.cy + 15);
    star.critChance = 0;
    runStar(star, game);
    expect((star as unknown as { exploded: boolean }).exploded).toBe(true);   // 盒路径受理转爆
    expect(e.hp).toBeLessThan(hp0);                 // 爆相 pierce=-3 承伤（门过）
    expect(log.length).toBe(1);
    expect(e.iframes).toBe(0);                      // 受理写支清零档
  });
});

describe('清偿刀 L：爆相免疫门回归钉面（:12636 门拒=零伤零 proc,60px AI 支无门=原版本相）', () => {
  it('残窗敌在 60px 内：AI 支照转爆（无免疫门）但爆相门拒零伤——两支合流同原版', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    const e = tankEnemy(game, 84, 100);
    e.iframes = 10;
    const hp0 = e.hp;
    const star = new LunarFlareStar(e.cx - 5, e.cy - 5, 0, 0, 100, 4.5, e.cy + 15);
    star.critChance = 0;
    runStar(star, game);
    expect((star as unknown as { exploded: boolean }).exploded).toBe(true);   // AI 索敌支 :57987-58006 无免疫门（勿过门=过修）
    expect(e.hp).toBe(hp0);                         // 爆相 :12636 门拒=零伤
    expect(log.length).toBe(0);                     // 门拒不 proc（X2-D1 判据）
    expect(e.iframes).toBe(10);                     // 门拒不写（残窗余值原样保持）
  });
});
