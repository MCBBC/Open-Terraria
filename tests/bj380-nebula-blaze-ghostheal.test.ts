// ★BJ380（2026-09-28）星云烈焰（634/635）+ 月耀（645）幽灵治疗头 ghostHeal proc 补缺回归。
// 用户实报：星云烈焰不触发幽灵兜帽（Spectre Hood）吸血。
// 定谳（Terarria1457/Terraria/Projectile.cs）：原版吸血链在 Projectile.Damage() 通用
//   on-hit 段【无弹号白名单】——
//     :13712 flag10 = num41>0 ∧ targetNPC.lifeMax>5 ∧ friendly ∧ !hostile ∧ aiStyle≠59
//     :13875 if (targetNPC.canGhostHeal | flag9)     ——canGhostHeal=false 族 384/387/388/523
//     :13877 if (Main.player[owner].ghostHeal && !moonLeech) ghostHeal(num41, victimCenter)
//     :14263 numHits++ 在 proc 块【后】⇒ 首跳读 0 档率 0.20（BJ157-② 同相）
//   634/635/645 SetDefaults 均 magic（vanilla-projectiles.json magic 位）⇒ 原版本就吸血。
//   本仓 MagicProj（BJ157-①）/Arrow/MissileProc（BJ167）已接；NebulaBlazeBolt/LunarFlareStar
//   两类漏接（自绘 strike 环无 proc）——本文件锁两类落地 + 实参口径（BJ167-②③④ 同款）。
// 判别面 spy：hurt 萰 StrikeNPC——lastStrikeDealt = 防后实扣（num41 等位,Enemy.ts:13959
//   入口清零/:14195 实扣写点）；拒收（false）= 原版 immune 门整跳 → 无 proc 无 numHits++。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { NebulaBlazeBolt, LunarFlareStar } from '../src/entities/LunarNebula';
import { projPveNumHits } from '../src/entities/SpectreSoulProj';

interface StealCall {
  kind: string; dmg: number; numHits: number; x: number; y: number; isMagic: boolean;
}

const DEFENSE = 22;   // 实扣 = 入伤 − 22（num41 防后口径）

function enemySpy(id: number, tx: number, ty: number, w = 24, h = 24,
  vanillaId: number | null = 15) {
  return {
    id, x: tx * TILE, y: ty * TILE, w, h, dead: false, vanillaId, maxHp: 100,
    lastStrikeDealt: 0, attempts: 0, iframes: 0,
    hurt(this: { lastStrikeDealt: number; attempts: number }, dmg: number): boolean {
      this.attempts++;
      this.lastStrikeDealt = Math.max(0, dmg - DEFENSE);
      return true;
    },
  };
}

function makeGame(log: StealCall[], list: unknown[]): GameHooks {
  return {
    world: new World(160, 200, 30, 'bj380'),
    player: null as unknown,
    enemies: () => list,
    entities: { nextId: 1, add: () => {} },
    playSfxFiles: () => {}, playSfx: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    applyLifeSteal: (kind: 'vampire' | 'ghost', dmg: number, numHits: number,
      x: number, y: number, isMagic?: boolean) => {
      log.push({ kind, dmg, numHits, x, y, isMagic: !!isMagic });
      return 0;
    },
  } as unknown as GameHooks;
}

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'bj380-open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

describe('BJ380 星云烈焰 634/635 ghostHeal proc（Projectile.cs:13877-79）', () => {
  it('判别面（用户实报）：634 贴脸爆命中敌 → ghost proc,dmg=num41 防后实扣,首跳 numHits=0,出生点=受害者 Center', () => {
    const log: StealCall[] = [];
    const e = enemySpy(1, 81, 100);                       // Center (1308,1612),距弹心 8 < 20 → 搜敌即爆
    const game = makeGame(log, [e]);
    const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 130, 3, 634);
    bolt.critChance = 0;
    bolt.fixedUpdate(1, game);
    expect(bolt.dead).toBe(true);                         // 爆结算面未被门吞
    expect(e.lastStrikeDealt).toBe(130 - DEFENSE);
    expect(log.length).toBe(1);                           // ← 旧码 0 = 用户实报病灶
    expect(log[0].kind).toBe('ghost');
    expect(log[0].dmg).toBe(130 - DEFENSE);               // BJ167-③：num41 等位（非防前 130）
    expect(log[0].numHits).toBe(0);                       // BJ157-②：:14263 自增在 proc 后
    expect(log[0].x).toBe(81 * TILE + 12);                // BJ167-④：受害者 Center（:13879）
    expect(log[0].y).toBe(100 * TILE + 12);
    expect(log[0].isMagic).toBe(true);                    // 634 magic 数据面
  });

  it('635 强发档同 proc（magic 数据面）', () => {
    const log: StealCall[] = [];
    const e = enemySpy(1, 81, 100);
    const game = makeGame(log, [e]);
    const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 390, 3, 635);
    bolt.critChance = 0;
    bolt.fixedUpdate(1, game);
    expect(log.length).toBe(1);
    expect(log[0].dmg).toBe(390 - DEFENSE);
    expect(log[0].isMagic).toBe(true);
  });

  it('Kill AoE 多敌 numHits 衰减：首敌 0 档、次敌 1 档（:14263 逐受理自增）;pveNumHits 终值 2（BJ157-④ PVP 读口）', () => {
    const log: StealCall[] = [];
    const near = enemySpy(1, 81, 100);
    const beside = enemySpy(2, 82, 100);                  // 盒缘内（爆盒 1275..1325 ∩ 1312..1336）
    const game = makeGame(log, [near, beside]);
    const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 130, 3, 634);
    bolt.critChance = 0;
    bolt.fixedUpdate(1, game);
    expect(bolt.dead).toBe(true);
    expect(log.map((c) => c.numHits)).toEqual([0, 1]);    // 率 0.20 → 0.15（Game.applyLifeSteal 内消费）
    expect(log.every((c) => c.kind === 'ghost')).toBe(true);
    expect(bolt.pveNumHits).toBe(2);
    expect(projPveNumHits(bolt)).toBe(2);                 // PVP 反馈读口单源
  });

  it('飞行盒接触命中（非贴脸爆）同 proc：追踪抵达 48×48 敌,接触 1 proc + burst skipId 不双发', () => {
    const log: StealCall[] = [];
    const e = enemySpy(1, 84, 100, 48, 48);               // Center (1368,1624),盒 1344..1392
    const game = makeGame(log, [e]);
    const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 6, 0, 130, 3, 634);
    bolt.critChance = 0;
    for (let t = 0; t < 30 && !bolt.dead; t++) bolt.fixedUpdate(1, game);
    expect(bolt.dead).toBe(true);
    expect(e.attempts).toBe(1);                           // 接触命中一次
    expect(log.length).toBe(1);                           // 接触 proc；Kill 爆 skipId 不重复
    expect(log[0].numHits).toBe(0);
    expect(log[0].dmg).toBe(130 - DEFENSE);
  });

  it('canGhostHeal=false 族 384：命中照常结算但零 proc（:13875 门）', () => {
    const log: StealCall[] = [];
    const e = enemySpy(1, 81, 100, 24, 24, 384);
    const game = makeGame(log, [e]);
    const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 130, 3, 634);
    bolt.critChance = 0;
    bolt.fixedUpdate(1, game);
    expect(e.lastStrikeDealt).toBe(130 - DEFENSE);        // 结算面未被 victim 门吞
    expect(log.length).toBe(0);
  });

  it('拒收（门拒形态 iframes>0,hurt false）不 proc 不计数：numHits++ 仅受理面（原版 immune 门整跳）——★X2-D1 夹具忠实化', () => {
    const log: StealCall[] = [];
    const e = enemySpy(1, 81, 100);
    let attempts = 0;
    e.hurt = () => { attempts++; return false; };
    // ★X2-D1 夹具忠实化（2026-09-29）：hurt 返假在真 Enemy 合同里两族异义——门拒
    //  （iframes 残窗 :13972 读【调用前】值）vs 受理（血尽级联 :14369/普通未致命
    //  :15037）。本测模拟门拒 → 补 iframes 残窗承载（判据改 !vanillaGated 后,
    //  缺字段裸返假会被正确读作受理——见下案）。
    e.iframes = 10;
    const game = makeGame(log, [e]);
    const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 130, 3, 634);
    bolt.critChance = 0;
    bolt.fixedUpdate(1, game);
    expect(bolt.dead).toBe(true);                         // 爆照走（Kill 链独立于结算）
    expect(attempts).toBe(1);
    expect(log.length).toBe(0);
    expect(bolt.pveNumHits).toBe(0);
  });

  it('受理（普通未致命形态,hurt 返假无门位）照 proc 照计数（:14263 无死亡复查）——★X2-D1 判别面', () => {
    const log: StealCall[] = [];
    const e = enemySpy(1, 81, 100);
    e.hurt = () => false;                                 // 血尽级联/普通未致命形态（无 iframes/dontTakeDamage 门位）
    const game = makeGame(log, [e]);
    const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 130, 3, 634);
    bolt.critChance = 0;
    bolt.fixedUpdate(1, game);
    expect(bolt.dead).toBe(true);
    expect(log.length).toBe(1);                           // 非门拒=受理 → proc 照达
    expect(log[0].kind).toBe('ghost');
    expect(log[0].numHits).toBe(0);
    expect(bolt.pveNumHits).toBe(1);                      // :14263 受理后自增
  });
});

describe('BJ380 月耀 645 爆炸相 ghostHeal proc', () => {
  it('爆炸相两敌：numHits 0→1 衰减;pveNumHits 终值 2', () => {
    const log: StealCall[] = [];
    const a = enemySpy(1, 81, 100);                       // 距星心 24 < 60 触发爆炸
    const b = enemySpy(2, 83, 100);                       // 爆盒 1215..1355 ∩ 1328..1352
    const game = makeGame(log, [a, b]);
    const star = new LunarFlareStar(80 * TILE, 100 * TILE, 0, 0, 100, 4.5, 200 * TILE);
    star.critChance = 0;
    star.fixedUpdate(1, game);                            // 首 update 搜敌 → 爆炸相首结算
    expect(log.map((c) => c.numHits)).toEqual([0, 1]);
    expect(log.every((c) => c.kind === 'ghost' && c.isMagic)).toBe(true);
    expect(star.pveNumHits).toBe(2);
    for (let t = 0; t < 21 && !star.dead; t++) star.fixedUpdate(1, game);
    expect(log.length).toBe(2);                           // hitSet 每敌一次,不重复 proc
  });

  it('canGhostHeal=false 族 387：零 proc', () => {
    const log: StealCall[] = [];
    const a = enemySpy(1, 81, 100, 24, 24, 387);
    const game = makeGame(log, [a]);
    const star = new LunarFlareStar(80 * TILE, 100 * TILE, 0, 0, 100, 4.5, 200 * TILE);
    star.critChance = 0;
    star.fixedUpdate(1, game);
    expect(a.lastStrikeDealt).toBe(100 - DEFENSE);
    expect(log.length).toBe(0);
  });
});
