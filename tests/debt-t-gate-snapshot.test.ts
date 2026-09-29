// ★清偿刀 T（2026-09-29,X4-债12 族级残差）：vanillaGated 门位读【前置快照】判别测试。
//   病灶（清偿刀 R 定谳,本刀推广全族）：各弹 vanillaGated 后置读站（hurt 返值后读
//   e.iframes/dontTakeDamage）会被 Enemy.hurt 内写支污染,两源：
//     ① 受理写支（Enemy.ts:14297-14298,pierce≠-3/-2/1 写 10t）——pierce=0 站受理拍
//        读恒真 → proc/numHits 恒跳（吸血域断供;mock hurt 无写支故旧测全绿=测试债）;
//     ② 死亡转换写支（Enemy.ts:14421,星璇四塔 517/422/507/493 血尽转演出写
//        iframes=2,与 pierce 档无关,写支 1:1 禁改）——致死命中撞转换族必污染。
//   原版锚（Terarria1457/Terraria）：免疫门 :12634-12637（immune[owner]==0）与
//   :12686（dontTakeDamage）都读【StrikeNPC 之前】的受害者态;proc（:13877-79）与
//   numHits++（:14263）在受理面【无死亡复查】→ 四塔转换拍（checkDead :78867-78875 →
//   PrepareForDeathAnimation :78835-78841 写 dontTakeDamage=true,原版不写 immune 窗）
//   proc/入账照达。
//   处方：strike 前 snapshotVanillaGate 快照 → 返回后 vanillaGateRejected(快照) 判。
//   判别力：①②两源全用【真 Enemy.fromVanilla】（写支在真 hurt 内部,debt-r 同式）
//   ——旧码（后置读）下四面全红（proc/入账恒跳）;新码全绿。门拒面（残窗/演出旗）
//   零回归。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Enemy } from '../src/entities/Enemy';
import { NebulaBlazeBolt, LunarFlareStar } from '../src/entities/LunarNebula';
import { RainbowSegment } from '../src/entities/RainbowProj';

interface StealCall { kind: string; dmg: number; numHits: number; x: number; y: number; isMagic: boolean }

function makeGame(log: StealCall[], list: Enemy[]): GameHooks {
  return {
    world: new World(200, 200, 30, 'debt-t'),
    player: null as unknown,          // debt-r 同式：真 hurt 的 fromPlayer 支对 null 安全跳过
    enemies: () => list,
    critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfxFiles: () => {}, playSfx: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
    applyLifeSteal: (kind: 'vampire' | 'ghost', dmg: number, numHits: number,
      x: number, y: number, isMagic?: boolean) => {
      log.push({ kind, dmg, numHits, x, y, isMagic: !!isMagic });
      return 0;
    },
  } as unknown as GameHooks;
}

/** 坦克桩敌（debt-r 同式,入列;血量抬高避开死亡管线）。静止不 tick → 残窗保持。 */
function tankEnemy(game: GameHooks, cx: number, cy: number, id: number): Enemy {
  const e = Enemy.fromVanilla(15, cx, cy)!;   // 僵尸 38×38：friendly=false
  expect(e).toBeTruthy();
  e.id = id;
  e.maxHp = 5000;
  e.hp = 5000;
  (game as unknown as { enemies: () => Enemy[] }).enemies().push(e);
  return e;
}

/** 星璇柱（真 Enemy 管线,TOWER_KEY 517/422/507/493 转换写支 :14421 在真 hurt 内）。
 *  血量钉 1 = 任意受理命中即血尽 → 转演出（ai2=1/hp=maxHp/iframes=2,hurt 返假）。 */
function pillarEnemy(game: GameHooks, cx: number, cy: number, id: number, vid: number): Enemy {
  const e = Enemy.fromVanilla(vid, cx, cy)!;
  expect(e).toBeTruthy();
  e.id = id;
  e.hp = 1;
  (game as unknown as { enemies: () => Enemy[] }).enemies().push(e);
  return e;
}

/** 634 螺栓几何（debt-r 同式）：出生 (1280,1600) 速度 0 → A 靶飞行盒首拍命中 →
 *  Kill=burst。 */
function fireBolt(game: GameHooks): NebulaBlazeBolt {
  const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 130, 3, 634);
  bolt.critChance = 0;
  for (let t = 0; t < 40 && !bolt.dead; t++) bolt.fixedUpdate(1, game);
  expect(bolt.dead).toBe(true);
  return bolt;
}

describe('清偿刀 T：死亡转换写支污染（四塔血尽转演出,真 Enemy）', () => {
  it('634 Kill AoE（pierce=-2 站）：塔血尽转换拍 proc+入账照达（旧后置读=门拒跳）', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    // A 靶：飞行盒内（flag3 pierce=1,刀 F 面,回归钉）→ burst(skipId=A)
    const a = tankEnemy(game, 81 * TILE, 100 * TILE, 50);
    expect(a.x + a.w > 1280 && a.x < 1320).toBe(true);   // A 飞行盒重叠（前置自检）
    // 塔靶：右缘钉 1277 ∈（爆盒左沿 1275, 飞行盒左沿 1280]=纯 AoE 面
    const tw = pillarEnemy(game, 0, 0, 51, 517);          // 517 日耀柱
    tw.x = 1277 - tw.w;
    tw.y = 1620 - tw.h / 2;
    expect(tw.x + tw.w).toBeGreaterThan(1275);            // 交爆盒（前置自检）
    expect(tw.x + tw.w).toBeLessThanOrEqual(1280);        // 不交飞行盒（前置自检）

    const bolt = fireBolt(game);
    // 转换写支 1:1 原样（禁改写支物证）：
    expect(tw.ai2).toBe(1);                               // 血尽转演出
    expect(tw.hp).toBe(tw.maxHp);                         // 满血续命
    // ★主判别面：受理面 proc/入账照达（原版 :13877-79/:14263 无死亡复查）。
    //   旧码（后置读 iframes=2）→ 门拒跳 log=1/pveNumHits=1 红。
    expect(log.length).toBe(2);                           // A 飞行盒 proc + 塔 AoE proc
    expect(log[0].numHits).toBe(0);                       // A 首结 0 档
    expect(log[1].kind).toBe('ghost');
    expect(log[1].dmg).toBeGreaterThan(0);                // 塔面 num41 等位
    expect(log[1].numHits).toBe(1);                       // A 先入账 1 → 塔 proc 读 1 档
    expect(bolt.pveNumHits).toBe(2);                      // 飞行盒 1 + AoE 1（旧码=1 红）
    // 受理面弹侧补写 5t（:14080-14082 专支,刀 R 形态）覆盖转换写支的 2：
    expect(tw.iframes).toBe(5);
  });

  it('645 爆炸相（pierce=-3 站）：塔血尽转换拍 proc+入账照达;转换写支 iframes=2 原样（本站无补写=直证写支未被读侧触碰）', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    const tw = pillarEnemy(game, 84 * TILE, 100 * TILE, 52, 422);   // 422 星旋柱（debt-l 空域几何）
    const star = new LunarFlareStar(tw.cx - 5, tw.cy - 5, 0, 0, 100, 4.5, tw.cy + 15);
    star.critChance = 0;
    for (let t = 0; t < 40 && !star.dead; t++) star.fixedUpdate(1, game);
    expect(tw.ai2).toBe(1);                               // 转换发生（写支原样）
    expect(tw.hp).toBe(tw.maxHp);
    expect(tw.iframes).toBe(2);                           // ★:14421 转换写 2 原样（旧码读它误判门拒）
    expect(log.length).toBe(1);                           // ★proc 照达（旧码=门拒跳红）
    expect(log[0].kind).toBe('ghost');
    expect(star.pveNumHits).toBe(1);                      // ★入账照达（旧码=0 红）
  });

  it('死亡演出期（dontTakeDamage 真旗,towerAI :13606 形态）：全通道拒收——零伤零 proc 零写支', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    tankEnemy(game, 81 * TILE, 100 * TILE, 50);           // A 靶（触发爆,回归钉）
    const tw = pillarEnemy(game, 0, 0, 53, 507);          // 507 星云柱
    tw.x = 1277 - tw.w;
    tw.y = 1620 - tw.h / 2;
    tw.ai2 = 1;
    tw.hp = tw.maxHp;
    tw.iframes = 0;
    tw.dontTakeDamage = true;                             // 演出期真旗（AI 每 tick 重算的终态）
    const hp0 = tw.hp;
    fireBolt(game);
    expect(tw.hp).toBe(hp0);                              // hurt :13997 整跳零伤
    expect(tw.iframes).toBe(0);                           // 写支不达（残态原样）
    expect(log.length).toBe(1);                           // 仅 A 飞行盒 proc（flag3 照打）
    expect(log[0].numHits).toBe(0);
  });
});

describe('清偿刀 T：受理写支污染（pierce=0 站真机 proc 恒跳,真 Enemy 非致死面）', () => {
  it('251 彩虹段：受理命中 proc 照达（旧后置读被 :14297 写 10t 污染=真机 proc 全灭,旧码红）', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    const e = tankEnemy(game, 80 * TILE + 3, 100 * TILE, 1701);   // 38×38 盒 1265..1303 交段盒 1273..1287
    expect(e.x < 1287 && e.x + e.w > 1273).toBe(true);    // 与段盒重叠（前置自检）
    const hp0 = e.hp;
    const seg = new RainbowSegment(80 * TILE, 100 * TILE, 1, 0, 100, 2);
    seg.critChance = 0;
    seg.fixedUpdate(1 / 60, game);
    expect(e.hp).toBeLessThan(hp0);                       // 受理（真扣血）
    expect(e.iframes).toBe(0);                            // ★受理写尾=0（原版 :14032-14037
    //   IDStatic 支清零档；★清偿刀 W 2026-09-29 X4-债13① 归正——本行旧钉
    //   「:14297 pierce=0 通用尾档 10t」系病灶旁证,proc/入账判别面不受影响）
    expect(log.length).toBe(1);                           // ★proc 照达（旧码=读 10 恒门拒红）
    expect(log[0].dmg).toBe(e.lastStrikeDealt);           // num41 等位
    expect(log[0].dmg).toBeGreaterThan(0);
    expect(seg.pveNumHits).toBe(1);                       // ★入账照达（旧码=0 红）
  });

  it('门拒零回归：残窗敌（iframes>0 快照=进 hurt 前状态）不 proc 不计数——251 mock', () => {
    const log: StealCall[] = [];
    const game = makeGame(log, []);
    const e = {
      id: 1711, x: 79 * TILE, y: 99 * TILE, w: 24, h: 24, dead: false,
      vanillaId: 15, maxHp: 100, hp: 100, lastStrikeDealt: 0, attempts: 0, iframes: 10,
      hurt(this: { lastStrikeDealt: number; attempts: number }, dmg: number): boolean {
        this.attempts++;
        this.lastStrikeDealt = Math.max(0, dmg - 22);
        return false;
      },
    };
    (game as unknown as { enemies: () => unknown[] }).enemies().push(e);
    const seg = new RainbowSegment(80 * TILE, 100 * TILE, 1, 0, 100, 2);
    seg.critChance = 0;
    seg.fixedUpdate(1 / 60, game);
    expect(e.attempts).toBe(1);                           // hurt 被调（弹侧无前置 iframes 门）
    expect(log.length).toBe(0);                           // 快照=10 → 门拒判据复原
    expect(seg.pveNumHits).toBe(0);
  });
});
