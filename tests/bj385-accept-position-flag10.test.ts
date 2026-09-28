// ★BJ385 落刀批判别面（反编译锚 Terarria1457/Terraria/Projectile.cs）：
//   件 1 = 非受理位写修正（BJ382 登记债清偿）：
//     ①656 ForbiddenSignProj.runContactHits——localImmune 写（:14181-14182
//       usesLocalNPCImmunity 支）/ hitCount++（:14245 type==656 localAI[0]++）在
//       原版都在 StrikeNPC（:13702）后的受理面内;拒收跳（Damage_PVE_Inner
//       :12634-12637 immune[owner]>0 残窗 / 外层 :12589 dontTakeDamage 门）整跳
//       return 三写全不达。旧码 hurt 返假仍照写=Enemy.iframes 残窗内虚增 30 命中帽
//       +8t 局部窗提前拉闸。判别面:拒收跳后次拍重试可中（旧码被自建局部窗拦死）。
//     ②239/245 雨滴 aiDrop——dropHits++（penetrate-- :14189-14196）从 onHit
//       （命中即调拒收亦跑）移入 onAccepted 受理位。判别面:拒收残窗不虚耗穿透数
//       （245 penetrate=2 不再被纯拒收跳提前消亡）。
//   件 3 = flag10 lifeMax>5 段三老站补门（:13712 flag10 = num41>0 ∧ lifeMax>5 ∧
//       friendly ∧ !hostile ∧ aiStyle≠59;304 vampireHeal :13876-78 与 ghostHeal
//       :13879 同块）——MagicProj BJ157-① / Arrow BJ167（vampire+ghost 两支）/
//       MissileProc BJ167 老站缺段,门单源 vanillaFlag10LifeMaxOk（critter 一击
//       致死族 lifeMax≤5 原版不 proc;maxHp/def.lifeMax 缺=容缺放行）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ForbiddenSignProj } from '../src/entities/ForbiddenSignProj';
import { RainCloudProj } from '../src/entities/WeaponProj';
import { Arrow } from '../src/entities/Arrow';
import { MagicMissileProj } from '../src/entities/MissileProj';
import { vanillaFlag10LifeMaxOk } from '../src/entities/SpectreSoulProj';
import type { GameHooks } from '../src/entities/types';

afterEach(() => vi.restoreAllMocks());

const DEFENSE = 22;   // spy 敌防御模拟:实扣 = 入伤 − 22（num41=StrikeNPC 防后返回值等位）

function makeGame(enemies: unknown[]): GameHooks {
  const w = new World(64, 200, 7, 'bj385');
  const player = new Player(30 * 16, 10 * 16, new Inventory());
  // 656 柱域 + 245 跌落通道共用净空（x 28..32,行 20..140 开阔）——expandVertically
  //  InWorld 门（:4407）要求 startX < w−10,柱锚须离左右缘 ≥10 格:
  for (let x = 28; x <= 32; x++) {
    for (let y = 20; y <= 140; y++) w.store.setTileSilent(x, y, 0, 0, 0);
  }
  return {
    world: w,
    player,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
    playSfxFiles: () => {},
    onEnemyKilled: () => {},
    entities: { add: () => {}, nextId: 1 },
    applyLifeSteal: () => 0,
  } as unknown as GameHooks;
}

// ---------------------------------------------------------------------------
// 件 1① 禁戒沙暴柱 656:localImmune/hitCount 受理位
// ---------------------------------------------------------------------------
describe('BJ385-① 656 runContactHits 受理位（Projectile.cs:14181/:14245 ∈ StrikeNPC 后受理面）', () => {
  /** 敌怪:前 rejectTicks 拍 hurt 返假（Enemy.iframes 残窗 2t 同相）,其后受理 */
  function flakyEnemy(id: number, rejectTicks: number) {
    let calls = 0;
    const e = {
      id, x: 30 * 16, y: 45 * 16, w: 16, h: 16, dead: false, maxHp: 100,
      hits: [] as number[],
      hurt(d: number): boolean {
        calls++;
        if (calls <= rejectTicks) return false;   // 残窗拒收
        this.hits.push(d);
        return true;
      },
    };
    return e;
  }

  it('拒收残窗次拍重试可中（旧码自建 8t 局部窗拦死=变异红）;受理跳才记帽', () => {
    const e = flakyEnemy(1, 1);                 // 首拍拒收（残窗 1t）
    const storm = new ForbiddenSignProj(30 * 16 + 8, 45 * 16, 130);
    storm.fixedUpdate(1 / 60, makeGame([e]));   // 拍 1:拒收
    expect(storm.hitCount).toBe(0);             // 旧码 1（拒收照 ++）= 既有位反模式
    expect(e.hits.length).toBe(0);
    expect(storm.pveNumHits).toBe(0);
    storm.fixedUpdate(1 / 60, makeGame([e]));   // 拍 2:重试受理
    expect(e.hits.length).toBe(1);              // ← 旧码=0(拍 1 拒收已 set 局部窗,拍 2 被拦)
    expect(storm.hitCount).toBe(1);             // 受理位才 ++
    expect(storm.pveNumHits).toBe(1);
  });

  it('受理跳建 8t 局部窗（localNPCHitCooldown=8）:受理拍后窗口内不再结算', () => {
    const e = flakyEnemy(2, 0);                 // 恒受理
    const game = makeGame([e]);
    const storm = new ForbiddenSignProj(30 * 16 + 8, 45 * 16, 130);
    storm.fixedUpdate(1 / 60, game);            // 受理 1
    for (let t = 0; t < 6; t++) storm.fixedUpdate(1 / 60, game);
    expect(e.hits.length).toBe(1);              // 8t 窗内不重复
    for (let t = 0; t < 4; t++) storm.fixedUpdate(1 / 60, game);
    expect(e.hits.length).toBe(2);              // 窗满重结算（cap 未达）
  });
});

// ---------------------------------------------------------------------------
// 件 1② 雨滴 245:dropHits（penetrate--）受理位
// ---------------------------------------------------------------------------
describe('BJ385-① 239/245 aiDrop dropHits 受理位（Projectile.cs:14189 ∈ Damage_PVE_Inner 受理面）', () => {
  function tallEnemy(id: number, cx: number, cy: number, rejectTicks: number) {
    let calls = 0;
    const e = {
      id, x: cx - 8, y: cy, w: 16, h: 800, dead: false, maxHp: 100,
      // ★BJ393 件2 夹具忠实化：真 Enemy 的门拒=【调用前】iframes>0（:13972 读前值,
      //  受理态 iframes==0）——判据 !vanillaGated 读的就是前值,残窗须以初值承载;
      //  旧缺字段返假在旧判据（hurt 返真）下恰好被当拒收,新判据下=级联受理形态。
      iframes: 2,
      hits: [] as number[],
      hurt(d: number): boolean {
        calls++;
        // ★BJ393 件2 夹具忠实化：门拒判据=【调用前】iframes>0（真 Enemy :13972 读前值）。
        //  残窗 2t=33ms < 167ms 结算间隔（共享表节流）→ 末次拒收跳须清窗（时间性衰减的
        //  真实承载）,否则首次受理跳前值仍>0=vanillaGated 误吞首跳受理位（hits 3≠2）。
        if (calls <= rejectTicks) {
          this.iframes = calls === rejectTicks ? 0 : 2;   // 末拒清窗（衰减）/中段保持残窗
          return false;
        }
        this.iframes = 0;
        this.hits.push(d);
        return true;
      },
    };
    return e;
  }

  it('245:恒拒收不耗穿透（旧码两拒收跳即消亡=变异红）;转受理后两跳穿尽消亡', () => {
    const e = tallEnemy(9201, 30 * 16, 30 * 16, 6);    // 前 6 次结算拒收,其后受理
    const game = makeGame([e]);
    // 共享 idStatic 免疫表为真实时间驱动(RainDropSharedImmunity.cdMs=167ms)——
    // 注入 20ms/tick 假钟 ⇒ 结算尝试每 ~9 拍一发
    let clockMs = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clockMs);
    // 拒收相位:穿透数不被虚耗（245 penetrate=2,旧码两拒收跳即 Kill——ready() 记账
    // 在 hurt 前,拒收跳也吃 idStatic 槽）
    const drop = new RainCloudProj(30 * 16 - 2, 31 * 16, 0, 5, 30, 0, 245);
    for (let t = 0; t < 50 && !drop.dead; t++) { clockMs += 20; drop.fixedUpdate(1 / 60, game); }
    expect(drop.dead).toBe(false);                     // ← 旧码已亡（拒收跳耗尽穿透）
    expect((drop as unknown as { dropHits: number }).dropHits).toBe(0);
    // 受理相位:过窗后两受理跳 → penetrate 归零消亡
    for (let t = 0; t < 120 && !drop.dead; t++) { clockMs += 20; drop.fixedUpdate(1 / 60, game); }
    expect(drop.dead).toBe(true);
    expect(e.hits.length).toBe(2);                     // 恰好两受理跳
  });
});

// ---------------------------------------------------------------------------
// 件 3 flag10 lifeMax>5 段三老站补门
// ---------------------------------------------------------------------------
describe('BJ385-③ vanillaFlag10LifeMaxOk 单源门（Projectile.cs:13712 flag10 lifeMax>5 段）', () => {
  it('单元面:lifeMax≤5 拒 / >5 放 / 缺省容缺放行', () => {
    expect(vanillaFlag10LifeMaxOk({ maxHp: 5 })).toBe(false);
    expect(vanillaFlag10LifeMaxOk({ maxHp: 100 })).toBe(true);
    expect(vanillaFlag10LifeMaxOk({ def: { lifeMax: 5 } })).toBe(false);
    expect(vanillaFlag10LifeMaxOk({})).toBe(true);           // 容缺（mock 桩面零漂移）
  });

  it('Arrow 304 吸血鬼飞刀:lifeMax≤5 目标零 vampire proc（BJ167 老站缺段=变异红）', () => {
    const log: Array<{ kind: string }> = [];
    const mkGame = (es: unknown[]) => {
      const g = makeGame(es);
      (g as unknown as { applyLifeSteal: unknown }).applyLifeSteal =
        (kind: string) => { log.push({ kind }); return 0; };
      return g;
    };
    const critter = {
      id: 9301, x: 30 * 16, y: 10 * 16 - 8, w: 16, h: 16, dead: false,
      vanillaId: 15, maxHp: 5, lastStrikeDealt: 0, iframes: 0,
      hurt(d: number): boolean { this.lastStrikeDealt = Math.max(0, d - DEFENSE); return true; },
    };
    const a = new Arrow(28 * 16, 10 * 16, 6, 0, 60, 0, 304, { grav: 0, life: 300, pierce: 1 });
    a.fixedUpdate(1 / 60, mkGame([critter]));
    expect(critter.lastStrikeDealt).toBeGreaterThan(0);       // 命中结算面未被门吞
    expect(log.length).toBe(0);                               // flag10 lifeMax>5 段
    const normal = {
      id: 9302, x: 30 * 16, y: 10 * 16 - 8, w: 16, h: 16, dead: false,
      vanillaId: 15, maxHp: 100, lastStrikeDealt: 0, iframes: 0,
      hurt(d: number): boolean { this.lastStrikeDealt = Math.max(0, d - DEFENSE); return true; },
    };
    const b = new Arrow(28 * 16, 10 * 16, 6, 0, 60, 0, 304, { grav: 0, life: 300, pierce: 1 });
    b.fixedUpdate(1 / 60, mkGame([normal]));
    expect(log.length).toBe(1);
    expect(log[0].kind).toBe('vampire');
  });

  it('MissileProc(34) ghost 支:lifeMax≤5 目标零 proc（BJ167 老站缺段=变异红）', () => {
    const log: Array<{ kind: string }> = [];
    const mkGame = (es: unknown[]) => {
      const g = makeGame(es);
      (g as unknown as { applyLifeSteal: unknown }).applyLifeSteal =
        (kind: string) => { log.push({ kind }); return 0; };
      return g;
    };
    const mk = (id: number, maxHp: number) => ({
      id, x: 40 * 16, y: 40 * 16, w: 240, h: 240, dead: false,
      vanillaId: 15, maxHp, lastStrikeDealt: 0, iframes: 0,
      hurt(d: number): boolean { this.lastStrikeDealt = Math.max(0, d - DEFENSE); return true; },
    });
    const proj = new MagicMissileProj(40 * 16 + 60, 40 * 16 + 60, 0, 0, {
      projId: 34, damage: 80, knockback: 2, useTime: 20,
      channelCb: () => false, aimCb: () => ({ x: 40 * 16 + 60, y: 40 * 16 + 60 }),
      payMana: () => true,
    });
    proj.critChance = 0;
    proj.fixedUpdate(1 / 60, mkGame([mk(9401, 5)]));
    expect(log.length).toBe(0);                               // flag10 lifeMax>5 段
    const proj2 = new MagicMissileProj(40 * 16 + 60, 40 * 16 + 60, 0, 0, {
      projId: 34, damage: 80, knockback: 2, useTime: 20,
      channelCb: () => false, aimCb: () => ({ x: 40 * 16 + 60, y: 40 * 16 + 60 }),
      payMana: () => true,
    });
    proj2.critChance = 0;
    proj2.fixedUpdate(1 / 60, mkGame([mk(9402, 100)]));
    expect(log.length).toBe(1);
    expect(log[0].kind).toBe('ghost');
  });
});
