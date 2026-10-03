// ★BJ475（2026-10-03）tag/crit 四残余三批判别测试（BJ467 新登记,BJ453/467 域同构）。
//  定谳锚（Terarria1457 亲读,行号=落刀日盘上;Damage_PVE 循环门在 Projectile.cs）：
//   · ①:12600 头门前置（`flag2 && (!nPC.dontTakeDamage || NPCID.Sets.ZappingJellyfish
//     [nPC.type]) && (aiStyle != 112 || ai[2] <= 1)` 先于 Inner 全链）——BJ467⑥ 拳/
//     光环/爆弹/爆裂四臂已落,contact() 敌怪环与 818 扑击臂 BJ467⑥ 任务清单未含=
//     同形漏网。dontTakeDamage 靶不达 TimerCrit(:12928)/tag ModifyHit(:12947)/
//     私表 cd 消费;随从弹非接触反噬族（:12680 zap 门=aiStyle 19/161/75/140 ∪
//     IsAWhip ∪ AllowsContactDamageFromJellyfish）→ DTD 水母亦无 zap 口,整跳。
//   · ②WhipProj 城镇臂 TimerCrit 缺位——Damage_PVE_Inner 单函数单遍历,crit 段
//     (:12915-12943) 无 friendly 门=巫毒窄门(:12618-25)放行的城镇受害靶同链同达
//     （BJ453 定谳复核）。位次=窄门→:12636 窗门→AABB(:12668)→crit 段;settle 回调
//     （巫毒窄门后/hurt 前）承载消费,窗门前置上位 skip 谓词（窗拒拍整跳零消费）。
//     TownNPC.hurt crit 参=防后双精度 ×2+色一体（NPC.cs:82067,:1492 仓内）
//     → 传 crit=true 勿预倍（BJ445② 城镇约定,与敌怪环调用侧预倍异形）。
//   · ③proj1457.dealContacts F11 掷中照消费——原版序=三类掷(:12915-12927 各自独立)
//     → TryConsumingTimerCrit(:12928)【无条件】消费（前掷已 crit 照吃,charge>0 置
//     −15）→武僧掷(:12929-43)。旧 `roll || consume` 短路=critChance 掷中拍跳过消费,
//     charge 残留满蓄。影响面=critChance>0 弹（1126-1129）;=0 掷恒假零回退。
//   · ④964 记账面定谳（BJ467② 报告遗留复核项）——原版 964=标准 Damage_PVE 管线:
//     :12600/:12636 拒收拍 Inner 整跳 return=不达 :14175-14179 写梯（局部表 -1,
//     localNPCHitCooldown=-1 永续档）/:14189 penetrate 递减;旧形态 hitEnemies.add+
//     pierceLeft-- 无条件跑=外源残窗敌怪被永记+弹提前亡=真债,落门前置。BJ467②
//     shadowGate964 快照判据退役=两前置门上位承载（V2/S3b 习语）。
//  判别力（旧码必红项）：§1/§2 DTD 靶 hurt 0 调+charge 不动（旧白吃 TimerCrit 必红）;
//    §3a 城镇 TimerCrit 消费 ×2+charge −15（旧恒 false 必红）;§3b 窗拒拍 charge 恒
//    1000（旧 settle 白消费 −15 必红）;§4a 掷中照消费（旧短路 charge 残留必红）;
//    §5a 窗清照达（旧 hitEnemies 永记必红）/§5b 记账不白耗（旧 pierce 白递减必红）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { MinionProj } from '../src/entities/MinionProj';
import { WhipProj } from '../src/entities/WhipProj';
import { TigerPounce } from '../src/entities/MinionProj';
import { InsanityShadowFriendly } from '../src/entities/InsanityShadowFriendly';
import { TownNPC } from '../src/entities/TownNPC';
import { dealContacts, HitCdImpl } from '../src/entities/proj1457';
import type { GameHooks } from '../src/entities/types';

// ---- mock 环境（bj467 同款：真 World+真 Player+ spyEnemy 桶） ----
function makeGame(): { hooks: GameHooks; player: Player; list: unknown[]; towns: TownNPC[] } {
  const w = new World(200, 120, 7, 'bj475-tag-crit-batch3');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const list: unknown[] = [];
  const towns: TownNPC[] = [];
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => list,
    npcs: () => towns,
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
    entities: { add: () => undefined, projectiles: [] } as never,   // countStormTigerGems 消费面
  } as unknown as GameHooks;
  return { hooks, player, list, towns };
}

interface SpyEnemy {
  id: number; x: number; y: number; w: number; h: number; cx: number; cy: number;
  dead: boolean; iframes: number; maxHp: number; hp: number; vanillaId: number;
  realLife: number; dontTakeDamage: boolean;
  def?: { friendly?: boolean };
  vx: number; vy: number;
  calls: Array<{ d: number; crit: boolean; pierce: number }>;
  hurt(d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean,
    pierce?: number, fromPlayer?: boolean, penPercent?: number): boolean;
}
let spySeq = 1;
function spyEnemy(cx: number, cy: number, w = 38, h = 38): SpyEnemy {
  const e: SpyEnemy = {
    id: spySeq++, x: cx - w / 2, y: cy - h / 2, w, h, cx, cy,
    dead: false, iframes: 0, maxHp: 500000, hp: 500000, vanillaId: 0,
    realLife: -1, dontTakeDamage: false, vx: 0, vy: 0, calls: [],
    hurt(d, _kx, _ky, _g, _pen = 0, crit = false, pierce = 0) {
      e.calls.push({ d, crit, pierce });
      return true;
    },
  };
  return e;
}
const push = (hooks: GameHooks, e: SpyEnemy): void => {
  (hooks.enemies() as unknown as SpyEnemy[]).push(e);
};
const timerOn = (p: Player): void => {
  Object.defineProperty(p, 'equipStats', {
    value: Object.freeze({ ...p.equipStats, accTimerCrit: true }), configurable: true,
  });
};
const voodooOn = (p: Player): void => {
  Object.defineProperty(p, 'equipStats', {
    value: Object.freeze({ ...p.equipStats, killGuide: true }), configurable: true,
  });
};
function guide(hooks: GameHooks, towns: TownNPC[], cx: number, cy: number): TownNPC {
  const g = new TownNPC('guide', 0, 0);
  g.id = 100 + towns.length;
  g.maxHp = 5000; g.hp = 5000;
  g.x = cx - g.w / 2; g.y = cy - g.h / 2;
  towns.push(g);
  void hooks;
  return g;
}
const tickUntil = (m: { fixedUpdate: (dt: number, g: GameHooks) => void; dead: boolean },
  hooks: GameHooks, until: () => boolean, max = 120): number => {
  for (let i = 0; i < max && !until(); i++) m.fixedUpdate(1, hooks);
  return max;
};
const tickN = (m: { fixedUpdate: (dt: number, g: GameHooks) => void }, hooks: GameHooks, n: number): void => {
  for (let i = 0; i < n; i++) m.fixedUpdate(1, hooks);
};

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

// ================ §1（BJ475①a）contact() 敌怪环 :12600 头门前置 ================
describe('BJ475-①a：contact() 敌怪环 DTD 前置门（不达 TimerCrit/tag/私表,BJ467⑥ 同构）', () => {
  /** contact 为 private——测试面经类型手术直驱（BJ436 同式）;317 乌鸦=local 族显式 cd */
  const contactDirect = (m: MinionProj, hooks: GameHooks, dmg = 30, cd?: number): boolean =>
    (m as unknown as { contact: (g: GameHooks, d: number, cdIn?: number, pad?: number) => boolean })
      .contact(hooks, dmg, cd);

  it('1a DTD 靶：hurt 0 调+charge 不动（旧白吃 TimerCrit 必红）', () => {
    const { hooks, player } = makeGame();
    timerOn(player);
    player.accTimerCritCharge = 1000;
    const z = spyEnemy(400, 600);
    z.dontTakeDamage = true;
    push(hooks, z);
    const m = new MinionProj(z.cx - 14, z.cy - 14, 317, 30, 1.5, false, 0, false, () => player);
    expect(contactDirect(m, hooks, 30, 5)).toBe(false);   // ★主判别①:整跳（旧 true 必红）
    expect(z.calls.length).toBe(0);                        // ★主判别②:hurt 0 调
    expect(player.accTimerCritCharge).toBe(1000);          // ★主判别③:TimerCrit 不消费（旧 −15 必红）
    expect(z.iframes).toBe(0);                             // 私表/写梯零落地
  });

  it('1b 对照（非 DTD 同几何）：照命中+charge −15=达面自证+消费位回归锚', () => {
    const { hooks, player } = makeGame();
    timerOn(player);
    player.accTimerCritCharge = 1000;
    const z = spyEnemy(400, 600);
    push(hooks, z);
    const m = new MinionProj(z.cx - 14, z.cy - 14, 317, 30, 1.5, false, 0, false, () => player);
    expect(contactDirect(m, hooks, 30, 5)).toBe(true);     // 达面自证
    expect(z.calls.length).toBe(1);
    expect(player.accTimerCritCharge).toBe(-15);           // 对照:TimerCrit 照消费
  });
});

// ================ §2（BJ475①b）818 扑击臂 :12600 头门前置 ================
describe('BJ475-①b：TigerPounce 818 DTD 前置门（hitSet/TimerCrit/tag 不达）', () => {
  /** 水平扑击 vx=120：弧线中点 ≈(sx+60, sy+45)（垂度 sag=120×1.5,盒 132×32 外沿覆盖） */
  const pounceAt = (hooks: GameHooks, player: Player, cx0: number, cy0: number): TigerPounce => {
    const t = new TigerPounce(cx0, cy0, 120, 0, 30, () => player, 0, 60);
    tickN(t, hooks, 18);
    return t;
  };

  it('2a DTD 靶在场：hurt 0 调+charge 不动（旧白吃必红）', () => {
    const { hooks, player } = makeGame();
    timerOn(player);
    player.accTimerCritCharge = 1000;
    const e = spyEnemy(460, 645);
    e.dontTakeDamage = true;
    push(hooks, e);
    pounceAt(hooks, player, 400, 600);
    expect(e.calls.length).toBe(0);                        // ★主判别①:0 调（旧 ≥1 必红）
    expect(player.accTimerCritCharge).toBe(1000);          // ★主判别②:不消费（旧 −15 必红）
  });

  it('2b 对照（非 DTD 同几何）：照命中+charge −15（消费位回归锚）', () => {
    const { hooks, player } = makeGame();
    timerOn(player);
    player.accTimerCritCharge = 1000;
    const e = spyEnemy(460, 645);
    push(hooks, e);
    pounceAt(hooks, player, 400, 600);
    expect(e.calls.length).toBeGreaterThanOrEqual(1);      // 达面自证
    expect(player.accTimerCritCharge).toBe(-15);           // 对照:TimerCrit 照消费
  });
});

// ================ §3（BJ475②）WhipProj 城镇臂 TimerCrit+:12636 窗门 ================
describe('BJ475-②：WhipProj 城镇臂 TimerCrit :12928（crit 防后×2）+:12636 窗前置', () => {
  /** 鞭 841 首挥（BJ467§1 同式）→ 向导置鞭尖 pts[10] → 下一拍 hitTownNpcs 命中 */
  const whipTownHit = (hooks: GameHooks, player: Player, g: TownNPC): number => {
    const hp0 = g.hp;
    const w = new WhipProj(player.cx, player.cy, 0, 841, 4672, 14, 1, 30, 4, () => player);
    for (let i = 0; i < 9; i++) w.fixedUpdate(1, hooks);
    const pts = w.pointsAt(20, true);
    g.x = pts[10].x - g.w / 2; g.y = pts[10].y - g.h / 2;
    w.fixedUpdate(1, hooks);
    return hp0 - g.hp;
  };

  it('3a 满蓄：城镇 TimerCrit 消费 → crit 防后×2+charge −15（旧恒 false 必红）', () => {
    const { hooks, player, towns } = makeGame();
    voodooOn(player);
    timerOn(player);
    player.accTimerCritCharge = 1000;
    const g = guide(hooks, towns, 400, 552);
    const hpLossCrit = whipTownHit(hooks, player, g);
    expect(hpLossCrit).toBeGreaterThan(0);                 // 夹具自证:城镇受理成立
    expect(player.accTimerCritCharge).toBe(-15);           // ★主判别①:消费位（旧 1000 必红）
    // crit 防后 ×2（NPC.cs:82067）——同几何非满蓄 A/B：
    const { hooks: h2, player: p2, towns: t2 } = makeGame();
    voodooOn(p2);
    const g2 = guide(h2, t2, 400, 552);
    const hpLossBase = whipTownHit(h2, p2, g2);
    expect(hpLossBase).toBeGreaterThan(0);
    expect(hpLossCrit).toBe(hpLossBase * 2);               // ★主判别②:防后双精度（旧 1× 必红）
  });

  it('3b 窗拒拍（iframes 残窗）：整跳零消费+窗清重试照达（旧 settle 白吃 −15 必红）', () => {
    const { hooks, player, towns } = makeGame();
    voodooOn(player);
    timerOn(player);
    player.accTimerCritCharge = 1000;
    const g = guide(hooks, towns, 400, 552);
    (g as unknown as { iframes: number }).iframes = 10;    // 外源残窗（TownNPC.hurt :1422 同域）
    expect(whipTownHit(hooks, player, g)).toBe(0);         // 窗拒:零伤
    expect(player.accTimerCritCharge).toBe(1000);          // ★主判别:settle 不达（旧 −15 必红）
    (g as unknown as { iframes: number }).iframes = 0;     // 窗清（spy 桩无自衰减,手动）
    const w2 = new WhipProj(player.cx, player.cy, 0, 841, 4672, 14, 1, 30, 4, () => player);
    for (let i = 0; i < 9; i++) w2.fixedUpdate(1, hooks);
    const pts = w2.pointsAt(20, true);
    g.x = pts[10].x - g.w / 2; g.y = pts[10].y - g.h / 2;
    w2.fixedUpdate(1, hooks);
    expect(g.hp).toBeLessThan(5000);                       // 窗清照达（拒收=整跳同相）
    expect(player.accTimerCritCharge).toBe(-15);           // 重试拍照消费
  });
});

// ================ §4（BJ475③）dealContacts F11 掷中照消费 ================
describe('BJ475-③：dealContacts F11——TimerCrit 消费独立于 critChance 掷中（:12928 无条件）', () => {
  const runDeal = (hooks: GameHooks, e: SpyEnemy, critChance: number): void => {
    const self = {
      x: e.x - 5, y: e.y - 5, w: 10, h: 10, cx: e.cx, cy: e.cy,
      damage: 50, knockback: 0, armorPen: 0, critChance, projId: 1127,
    };
    dealContacts(self as never, hooks, new HitCdImpl(), -1);
  };

  it('4a 掷中拍（roll=true）：crit=true 且 charge 照消费置 −15（旧短路残留 1000 必红）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);        // 0.01<0.04=掷中
    const { hooks, player } = makeGame();
    timerOn(player);
    player.accTimerCritCharge = 1000;
    const e = spyEnemy(400, 552);
    push(hooks, e);
    runDeal(hooks, e, 0.04);
    expect(e.calls.length).toBe(1);                        // 夹具自证
    expect(e.calls[0]!.crit).toBe(true);                   // 掷中 crit（两形态同）
    expect(player.accTimerCritCharge).toBe(-15);           // ★主判别:照消费（旧恒 1000 必红）
  });

  it('4b 掷空拍（roll=false）：TimerCrit 强制 crit+charge −15（回归锚=无条件面）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);        // 0.99>0.04=掷空
    const { hooks, player } = makeGame();
    timerOn(player);
    player.accTimerCritCharge = 1000;
    const e = spyEnemy(400, 552);
    push(hooks, e);
    runDeal(hooks, e, 0.04);
    expect(e.calls.length).toBe(1);
    expect(e.calls[0]!.crit).toBe(true);                   // TimerCrit 强制（回归锚）
    expect(player.accTimerCritCharge).toBe(-15);
  });

  it('4c 无饰品零行为变：掷中 crit=true/charge 不动（equipStats 门回归锚）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const { hooks, player } = makeGame();
    player.accTimerCritCharge = 1000;
    const e = spyEnemy(400, 552);
    push(hooks, e);
    runDeal(hooks, e, 0.04);
    expect(e.calls.length).toBe(1);
    expect(e.calls[0]!.crit).toBe(true);                   // 掷中（与 TimerCrit 无关）
    expect(player.accTimerCritCharge).toBe(1000);          // 无 6170:零消费
  });
});

// ================ §5（BJ475④）964 记账面前置门（拒收拍不记账不递减） ================
describe('BJ475-④：InsanityShadowFriendly 964 记账面——:12600/:12636 拒收拍不达写梯/递减', () => {
  it('5a 外源残窗敌：窗内 0 调,窗清照达（旧 hitEnemies 永记必红）', () => {
    const { hooks, player } = makeGame();
    const e = spyEnemy(400, 552);
    e.iframes = 10;                                        // 外源残窗
    push(hooks, e);
    const sh = new InsanityShadowFriendly(
      { x: e.x, y: e.y, vx: 0, vy: 0, ai0: 0, ai1: 0 }, 18);
    tickUntil(sh, hooks, () => (sh as unknown as { alpha: number }).alpha <= 250, 20);
    expect(e.calls.length).toBe(0);                        // 残窗内恒拒
    e.iframes = 0;                                         // 窗清（spy 桩无自衰减）
    tickUntil(sh, hooks, () => e.calls.length > 0, 30);
    expect(e.calls.length).toBeGreaterThanOrEqual(1);      // ★主判别:窗清照达（旧 0 必红）
  });

  it('5b DTD 靶不占记账：正常敌照命中+pierce 恰耗 1（旧 DTD 白耗必红）', () => {
    const { hooks, player } = makeGame();
    const dtd = spyEnemy(396, 548);
    dtd.dontTakeDamage = true;
    push(hooks, dtd);
    const ok = spyEnemy(404, 556);                         // 同接触带错位 8px（964 盒 40×40）
    push(hooks, ok);
    const sh = new InsanityShadowFriendly(
      { x: 400 - 20, y: 552 - 20, vx: 0, vy: 0, ai0: 0, ai1: 0 }, 18);
    tickUntil(sh, hooks, () => ok.calls.length > 0, 40);
    expect(ok.calls.length).toBeGreaterThanOrEqual(1);     // 达面自证
    expect(dtd.calls.length).toBe(0);                      // ★主判别①:DTD 零调
    expect((sh as unknown as { pierceLeft: number }).pierceLeft).toBe(2);   // ★主判别②:恰耗 1（旧 1 必红）
  });

  it('5c DTD 唯一靶：hurt 0 调+charge 恒满（:12600 前置门独立判别,BJ467§6 同构）', () => {
    const { hooks, player } = makeGame();
    timerOn(player);
    player.accTimerCritCharge = 1000;
    const e = spyEnemy(400, 552);
    e.dontTakeDamage = true;
    push(hooks, e);
    const sh = new InsanityShadowFriendly(
      { x: e.x, y: e.y, vx: 0, vy: 0, ai0: 0, ai1: 0 }, 18);
    tickN(sh, hooks, 30);
    expect(e.calls.length).toBe(0);                        // ★主判别①:0 调
    expect(player.accTimerCritCharge).toBe(1000);          // ★主判别②:消费不达（旧 −15 必红）
    expect((sh as unknown as { pierceLeft: number }).pierceLeft).toBe(3);   // 记账零耗
  });
});
