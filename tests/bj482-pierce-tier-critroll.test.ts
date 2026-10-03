// ★BJ482（2026-10-03）两件判别测试：964 pierce 档位残留 + dealContacts 掷率装配面。
//  定谳锚（Terarria1457 亲读,行号=落刀日盘上）：
//   · ①964 InsanityShadowFriendly SetDefaults（Projectile.cs:9129-9143）=
//     usesLocalNPCImmunity=true + localNPCHitCooldown=-1 → 受理写梯落【清窗档】
//     （:14175-14179 usesLocal 主支：immune[owner]=0 + 局部表行=cd=-1——节流全归
//     弹内局部表,全局窗【清零】不设 10t）。旧 hurt 传 pierce=0=Enemy.hurt 通用尾档
//     开 10t 自造全局窗（964 命中后 10t 内玩家他武器全被拒=BJ436 主病灶同形）。
//     修复式=BJ452/455 家族（656/856）+WhipProj S3b 0→-3 同式。
//   · ②1126-1129=ChlorophyteClaymore 四弹（ProjectileID.cs:2704-2710）,SetDefaults
//     （:10545-10590）全 melee=true（1127 经 DefaultToShortsword :10775 melee 置位）
//     → 原版 crit 掷=Damage_PVE 三类掷（:12915-12927）`Next(1,101) <= owner.meleeCrit
//     + bonusCritChance`（动态装备面,命中拍读）;本面其余 dealContacts 弹族 magic 旗
//     （482/704/731/439/440/950/1115/1116/1117/1122）同梯。旧档=类字段固定 0.04
//     （BJ467② 遗留"掷率面不在本刀"）。无类旗（908/226/221/227/567-568）与
//     trap=true（1091→OwnedBySomeone=false :580-589 整 crit 块跳过）→ 零掷。
//     基 4=Player.cs:2413-2417 字段初值;owner 聚合=Player.critChance(kind)（不含
//     基 4,调用侧补）。bonusCritChance 本面恒 0（原版写入点仅 2269 :11134/698
//     :70581/父弹继承 :11142,无 item.crit→弹传递）。
//  判别力（旧码必红项）：§1a pierce=-3 载体+iframes=0 清窗（旧 0/10 必红）;
//    §1b 同拍他武器可达（旧 10t 窗拒必红）;§2a/2b 旗驱聚合掷（旧固定 0.04 必红）;
//    §2c 无旗零掷（旧 0.04 必暴面必红）;§2d 基 4（撤基必红）;§2f ≤0 关断钉
//    （语义保留锚,回归面）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { InsanityShadowFriendly } from '../src/entities/InsanityShadowFriendly';
import { dealContacts, HitCdImpl, rollVanillaHitCrit } from '../src/entities/proj1457';
import type { GameHooks } from '../src/entities/types';

// ---- mock 环境（bj475 同款：真 World+真 Player+ spyEnemy 桶） ----
function makeGame(): { hooks: GameHooks; player: Player; list: unknown[] } {
  const w = new World(200, 120, 7, 'bj482-pierce-tier-critroll');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const list: unknown[] = [];
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => list,
    npcs: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    applyLifeSteal: () => 0,
    entities: { add: () => undefined, projectiles: [] } as never,
  } as unknown as GameHooks;
  return { hooks, player, list };
}

interface RecCall { d: number; crit: boolean; pierce: number; fromPlayer: boolean }

/** 窗档契约桩（§1 专用）：hurt 复刻 Enemy.hurt 免疫窗三档（:14533 门/:14725 写）——
 *  pierce=-3 清窗 / -2、1 不写 / 其余写 10t。非门拒拍整跳=Enemy.hurt 同相。 */
function windowEnemy(cx: number, cy: number, w = 38, h = 38) {
  const e = {
    id: 9001, x: cx - w / 2, y: cy - h / 2, w, h, cx, cy,
    dead: false, iframes: 0, dontTakeDamage: false, vanillaId: 0,
    hp: 500000, maxHp: 500000,
    calls: [] as RecCall[],
    hurt(d: number, _kx: number, _ky: number, _g: GameHooks, _pen = 0, crit = false,
      pierce = 0, fromPlayer = false): boolean {
      if (pierce !== 1 && e.iframes > 0) return false;      // :14533 flag3 豁免外照门
      e.calls.push({ d, crit, pierce, fromPlayer });
      if (pierce === -3) e.iframes = 0;                     // :14725 清窗档
      else if (pierce !== -2 && pierce !== 1) e.iframes = 10; // :14726 通用尾档
      e.hp -= d;
      return true;
    },
  };
  return e;
}
/** 普通受理桩（§2 专用，dealContacts 逐参记录） */
let spySeq = 1;
function spyEnemy(cx: number, cy: number, w = 38, h = 38) {
  const e = {
    id: spySeq++, x: cx - w / 2, y: cy - h / 2, w, h, cx, cy,
    dead: false, iframes: 0, dontTakeDamage: false, vanillaId: 0,
    hp: 500000, maxHp: 500000,
    calls: [] as RecCall[],
    hurt(d: number, _kx: number, _ky: number, _g: GameHooks, _pen = 0, crit = false,
      pierce = 0, fromPlayer = false): boolean {
      e.calls.push({ d, crit, pierce, fromPlayer });
      return true;
    },
  };
  return e;
}
const push = (hooks: GameHooks, e: unknown): void => {
  (hooks.enemies() as unknown as unknown[]).push(e);
};
const tickUntil = (m: { fixedUpdate: (dt: number, g: GameHooks) => void; dead: boolean },
  hooks: GameHooks, until: () => boolean, max = 120): void => {
  for (let i = 0; i < max && !until(); i++) m.fixedUpdate(1, hooks);
};
const critGear = (p: Player, kind: 'critMelee' | 'critRanged' | 'critMagic', v: number): void => {
  Object.defineProperty(p, 'equipStats', {
    value: Object.freeze({ ...p.equipStats, [kind]: v }), configurable: true,
  });
};
const runDeal = (hooks: GameHooks, e: { x: number; y: number; w: number; h: number },
  projId: number, critChance = 0.04): void => {
  const self = {
    x: e.x - 5, y: e.y - 5, w: e.w + 10, h: e.h + 10,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    damage: 50, knockback: 0, armorPen: 0, critChance, projId,
  };
  dealContacts(self as never, hooks, new HitCdImpl(), -1);
};

beforeEach(() => { vi.restoreAllMocks(); spySeq = 1; });
afterEach(() => { vi.restoreAllMocks(); });

// ================ §1（BJ482①）964 受理写梯=清窗档（pierce -3） ================
describe('BJ482-①：964 usesLocal 族写梯——immune[owner]=0 清窗档（:14175-14179）', () => {
  it('1a 受理拍 pierce=-3 载体+iframes=0 清窗（旧 pierce=0 写 10t 必红）', () => {
    const { hooks } = makeGame();
    const e = windowEnemy(400, 552);
    push(hooks, e);
    const sh = new InsanityShadowFriendly(
      { x: e.x, y: e.y, vx: 0, vy: 0, ai0: 0, ai1: 0 }, 18);
    tickUntil(sh, hooks, () => e.calls.length > 0, 30);
    expect(e.calls.length).toBeGreaterThanOrEqual(1);      // 夹具自证：淡入后命中成立
    expect(e.calls[0]!.pierce).toBe(-3);                   // ★主判别①:清窗档载体（旧 0 必红）
    expect(e.iframes).toBe(0);                             // ★主判别②:窗清零（旧 10 必红）
  });

  it('1b 同拍他武器可达（清窗语义）；第三击被 10t 窗拒=契约自证', () => {
    const { hooks } = makeGame();
    const e = windowEnemy(400, 552);
    push(hooks, e);
    const sh = new InsanityShadowFriendly(
      { x: e.x, y: e.y, vx: 0, vy: 0, ai0: 0, ai1: 0 }, 18);
    tickUntil(sh, hooks, () => e.calls.length > 0, 30);
    expect(e.calls.length).toBe(1);
    // 他武器（近战类 pierce=0 面）同拍打同一敌——清窗档下必达（旧 10t 窗必拒）
    const accepted = (e as unknown as {
      hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number,
        crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean;
    }).hurt(30, 0, 0, hooks, 0, false, 0, true);
    expect(accepted).toBe(true);                           // ★主判别:他武器同拍可达（旧 false 必红）
    expect(e.calls.length).toBe(2);
    expect(e.calls[1]!.pierce).toBe(0);                    // 他武器=通用档载体自证
    // 契约自证：他武器自身开 10t 窗 → 第三击拒（桩窗档在活,排除"恒达假桩"）
    const blocked = (e as unknown as {
      hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number,
        crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean;
    }).hurt(30, 0, 0, hooks, 0, false, 0, true);
    expect(blocked).toBe(false);
  });

  it('1c 964 局部表不因清窗重开：同敌整生一次（cd=-1 每敌一发,BJ475④ 锚延续）', () => {
    const { hooks } = makeGame();
    const e = windowEnemy(400, 552);
    push(hooks, e);
    const sh = new InsanityShadowFriendly(
      { x: e.x, y: e.y, vx: 0, vy: 0, ai0: 0, ai1: 0 }, 18);
    tickUntil(sh, hooks, () => e.calls.length > 0, 30);
    const n = e.calls.length;
    tickUntil(sh, hooks, () => false, 25);                 // 续拍 25 tick（原地漂移重叠）
    expect(e.calls.length).toBe(n);                        // 局部表 -1 永续=不二结
  });
});

// ================ §2（BJ482②）掷率装配面=owner 装配查询（:12915-12927） ================
describe('BJ482-②：dealContacts 掷率 owner 装配（旗驱动态装备面,旧固定 0.04 档退役）', () => {
  it('2a melee 旗 1127：critMelee=50 → 率 0.54,random 0.5 照暴（旧 0.04 必红）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { hooks, player } = makeGame();
    critGear(player, 'critMelee', 50);
    const e = spyEnemy(400, 552);
    push(hooks, e);
    runDeal(hooks, e, 1127);
    expect(e.calls.length).toBe(1);
    expect(e.calls[0]!.crit).toBe(true);                   // ★主判别:0.5<0.54（旧 0.5>0.04 恒假必红）
  });

  it('2b magic 旗 731：critMagic=50 → 率 0.54 照暴（旧 0.04 必红）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { hooks, player } = makeGame();
    critGear(player, 'critMagic', 50);
    const e = spyEnemy(400, 552);
    push(hooks, e);
    runDeal(hooks, e, 731);
    expect(e.calls[0]!.crit).toBe(true);
  });

  it('2c 无类旗 908 零掷：random 0.01 照假（旧 0.04 必暴面必红;α-H1 同谳面）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const { hooks, player } = makeGame();
    critGear(player, 'critMelee', 50);
    critGear(player, 'critMagic', 50);
    const e = spyEnemy(400, 552);
    push(hooks, e);
    runDeal(hooks, e, 908);
    expect(e.calls.length).toBe(1);
    expect(e.calls[0]!.crit).toBe(false);                  // ★主判别:零掷（旧 0.01<0.04 必红）
  });

  it('2d 基 4 归属：零装备 random 0.03 暴/0.05 空（基 4=Player.cs:2413 初值）', () => {
    const { hooks, player } = makeGame();
    const e1 = spyEnemy(400, 552);
    push(hooks, e1);
    vi.spyOn(Math, 'random').mockReturnValue(0.03);
    runDeal(hooks, e1, 1127);
    expect(e1.calls[0]!.crit).toBe(true);                  // 0.03<0.04（基 4 在）
    const e2 = spyEnemy(480, 552);
    push(hooks, e2);
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    runDeal(hooks, e2, 1127);
    expect(e2.calls[0]!.crit).toBe(false);                 // 0.05>0.04
  });

  it('2e 零掷≠跳消费：908+TimerCrit 满蓄照强制 crit+charge −15（F11 无条件面）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const { hooks, player } = makeGame();
    Object.defineProperty(player, 'equipStats', {
      value: Object.freeze({ ...player.equipStats, accTimerCrit: true }), configurable: true,
    });
    (player as unknown as { accTimerCritCharge: number }).accTimerCritCharge = 1000;
    const e = spyEnemy(400, 552);
    push(hooks, e);
    runDeal(hooks, e, 908);
    expect(e.calls[0]!.crit).toBe(true);                   // TimerCrit 强制（零掷不跳消费）
    expect((player as unknown as { accTimerCritCharge: number }).accTimerCritCharge).toBe(-15);
  });

  it('2f carrier≤0 关断钉保留：critChance=0+聚合 50+random 0 照假（r1/s2/bj420 确定性锚）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const { hooks, player } = makeGame();
    critGear(player, 'critMagic', 50);
    const e = spyEnemy(400, 552);
    push(hooks, e);
    runDeal(hooks, e, 731, 0);
    expect(e.calls[0]!.crit).toBe(false);                  // 关断钉=旧掷式 ≤0 恒假语义显式化
  });

  it('2g rollVanillaHitCrit 旗分类全口径：magic 十弹/melee 四弹照达,无旗+trap 零掷', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { hooks, player } = makeGame();
    critGear(player, 'critMagic', 50);
    critGear(player, 'critMelee', 50);
    const g = hooks;
    // magic 旗族（ProjectileID/SetDefaults 亲读：482:5116/704:7455/731:7702/439:5107/
    // 440:5121/950:9190/1115:10398/1116:10422/1117:10431/1122:10440）
    for (const id of [482, 704, 731, 439, 440, 950, 1115, 1116, 1117, 1122]) {
      expect(rollVanillaHitCrit(id, g)).toBe(true);
    }
    // melee 旗族（1126-1129;1127 经 DefaultToShortsword :10775 置 melee）
    for (const id of [1126, 1127, 1128, 1129]) {
      expect(rollVanillaHitCrit(id, g)).toBe(true);
    }
    // 无类旗/trap 族：任何掷值恒假（908 碎片/1091 世界雷 trap/226 花瓣/221/227 叶弹/567-568 云）
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    for (const id of [908, 1091, 226, 221, 227, 567, 568]) {
      expect(rollVanillaHitCrit(id, g)).toBe(false);
    }
  });
});
