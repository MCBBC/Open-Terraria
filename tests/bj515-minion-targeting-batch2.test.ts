// ★BJ515（2026-10-05）：minion 索敌批②六债判别（BJ514 批①收官后续,源锚逐行钉）。
//  六债（BJ514 登记原文 + 本批亲读定谳）：
//  ① AI_177 FindTargetWithinRange 的 localNPCImmunity[i]==0 门（:45925）+ 原版锁
//    结构（:45997-46020 ai[0] 持锁跨拍,失效门 :46000）——917 命中写
//    :14175-14179（localNPCHitCooldown=20 :8713-8714）,DecrementLocalImmune
//    TimeCounters :17365-17385 逐 t 全表衰减（Update 头先衰减后 AI 同相）。
//    ★1036 亲读翻案（新债登记）：SetDefaults :9773 aiStyle=67 → 1036 走
//    AI_067_FreakingPirates flag7（:50023/:50519-50523 respectOwnerTarget=false、
//    num2=450 :50049）,非 AI_177——本刀门/锁仅 917 消费,1036 重路由留登记。
//  ② AI_156 blackListedTargets：1457 填充函数 AI_GetMyGroupIndexAndFillBlackList
//    （:52809-52825）只算 index/total 【零 .Add】（1405 :20333/1456 :48973 三代
//    同形）→ 表结构性恒空,:52776/:52796 Contains=死谓词。建模=每拍 Clear
//    （:52473）+ 死谓词门原形在位;变异面=未来真填充源接入（同主同型弟妹目标
//    规避语义）即翻红。
//  ③ 哨兵族 AI_053_HandleSentryNPCTargeting（:40920-40969）专用移植：曼哈顿自
//    muzzle（Center+firingOffset,966=(0,-16) :38025-38028/1025=(0,10) :41164-41168,
//    借道 num8=1240 :41150-41154）+ CanHit 点对（:40935/:40958,双调用点
//    straightLine=false）+ 集火支先行（:40927-40944）。旧 nearestEnemy=Euclid
//    自本体心+无视面+900 集火窗。
//  ④ 1119 findTargetInRangeDual 扩形参（:49883 五参形）：customEliminationCheck
//    = AI_206_CustomEliminationCheck_Forbidden CanHitLine 盒（:38177-38180/:38199,
//    野生扫尾位门 :49905,焦点支不过 :49888）+ skipIfCannotHitOwnBody（AI_067 六站
//    skip=true :50524,IsInRangeOfMeOrMyOwner 内嵌门不覆盖 playerDistance 通路）。
//  ⑤ AI_026 通用尾双轨（flag10 段 :62598-62661 = 191-194/1094/1113;266 段
//    :62771-62850）：曼哈顿自本体心 + CanHit 本体盒双轨（num139/num140 分账,
//    检索无射程门,消费端 :62677/:62691 门 800+40×slot）+ 集火种子（:62606-62628/
//    :62791-62813,无前导）+ flag10 野生支 ×20 速度前导（:62645-62652 num142,
//    266 段无）。
//  ⑥ shim-dynamic-scratch-family 2 红锁更新 → tests/shim-dynamic-scratch-family.
//    test.ts（BJ481 删 mlfloor/BJ485 摘 wingTint·bv 登记后锁面=现役退役形）。
//  ★变异证红：各断言注释给出「旧实现退化值」,变异该刀必恰红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj, AI156_BLACKLIST } from '../src/entities/MinionProj';
import { canHitLine } from '../src/physics/LineOfSight';
import type { GameHooks } from '../src/entities/types';

const priv = (o: object): Record<string, any> => o as unknown as Record<string, any>;

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; maxHp?: number; boss?: boolean;
  vx?: number; vy?: number;
  hurt: (d: number, kx?: number, ky?: number, g?: GameHooks) => boolean;
  hits: number[];
}
const mkEnemy = (id: number, cx: number, cy: number, extra: Record<string, unknown> = {}): MockEnemy => {
  const w = 16, h = 24;
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false,
    get cx() { return this.x + this.w / 2; },
    set cx(v: number) { this.x = v - this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    set cy(v: number) { this.y = v - this.h / 2; },
    hp: 100000,
    maxHp: 100000,   // canBeChasedBy 门读 maxHp ?? def.hp（★BJ89 定谳）
    ...extra,
    hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

function makeHooks(enemies: MockEnemy[] = [], wallCols: Array<[number, number, number]> = []) {
  const w = new World(200, 120, 7, 'bj515');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 100;
  // 竖墙列 [col, rowTop, rowBottom]（canHit/CanHitLine 阻断面）——★几何约束：
  //  clampYTile 上界 = maxTilesY−40 = 80（cs:414-416 字面）→ 行 ≥80 的点对行走行
  //  全被钳到 80,墙列须盖行走行（缺省 74..84）;实体行放 79（<80 不被钳）
  for (const [col, r0, r1] of wallCols) for (let y = r0; y <= r1; y++) w.store.setTile(col, y, 1);
  const player = new Player(60 * 16, 79 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => enemies,
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
    spawnDust: (() => ({})) as never,
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown) => void } }).entities = {
    projectiles: added,
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks, store: w.store, player, added };
}

const minion = (player: Player, projId: number, cx: number, cy: number,
  ground = false, sentry = false, slot = 0): MinionProj => {
  const m = new MinionProj(cx, cy, projId, 10, 2, sentry, slot, ground, () => player);
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;   // cx/cy 对齐给定点（盒左上=Entity 语义）
  return m;
};

// ============================================================
// ① 917 localNPCImmunity 门 + ai[0] 原版锁（:45925/:45997-46020/:14178/:17365）
// ============================================================
describe('① 917 localNPCImmunity 门+锁（冷却 20t 内不重锁,期满重锁）', () => {
  it('命中后次拍失锁+扫描跳免疫敌：E1 命中→19>0 拒,E2 补位锁定（旧无门退化=恒锁 E1）', () => {
    const e1 = mkEnemy(11, 0, 0);
    const e2 = mkEnemy(12, 0, 0);
    const { hooks, player } = makeHooks([e1, e2]);
    player.whipBuffs[312] = 1;                          // AI_177 续命门（:45949-45953）
    const g = minion(player, 917, player.cx, player.cy - 40);
    e1.cx = g.cx; e1.cy = g.cy;                         // tick1 同位 → 接触命中
    g.fixedUpdate(1, hooks);
    expect(e1.hits.length, 'tick1 命中 E1（免疫写 20 :14178）').toBe(1);
    expect(priv(g).ai177Lock).toBe(11);                 // 扫描先于 contact（:45997 段序）
    expect(priv(g).ai177Immunity!.peek(11)).toBe(20);   // 写位=localNPCHitCooldown（:8713）
    e2.cx = g.cx + 200; e2.cy = g.cy;                   // E2 补位（400 窗内,非免疫）
    g.fixedUpdate(1, hooks);
    expect(priv(g).ai177Immunity!.peek(11), '逐 t 衰减（:17378）20→19').toBe(19);
    expect(priv(g).ai177Lock).toBe(12);                 // 锁失效门 :46000 + 扫描门 :45925
    // 变异证红：摘 :45925 门/摘 :46000 失效门 → 锁恒 E1 → 红
  });

  it('冷却期满重锁：E1 独苗,tick20 仍拒（1>0）,tick21 期满（0）重锁 E1', () => {
    const e1 = mkEnemy(21, 0, 0);
    const { hooks, player } = makeHooks([e1]);
    player.whipBuffs[312] = 1;
    const g = minion(player, 917, player.cx, player.cy - 40);
    e1.cx = g.cx; e1.cy = g.cy;
    g.fixedUpdate(1, hooks);
    expect(priv(g).ai177Lock).toBe(21);
    for (let t = 2; t <= 20; t++) g.fixedUpdate(1, hooks);   // 19..1 全窗拒
    expect(priv(g).ai177Lock, '冷却窗内（20t）不重锁（原版门=冷却期不重锁）').toBe(-1);
    g.fixedUpdate(1, hooks);                                 // tick21：0 → 期满
    expect(priv(g).ai177Lock).toBe(21);                      // :45925 门放行 → 重锁
  });

  it('持锁跨拍（ai[0] 原文）：A(+100) 锁定后 B(-50) 更近 → 仍追 A（旧逐拍重扫退化=追 B）', () => {
    const a = mkEnemy(31, 0, 0);
    const b = mkEnemy(32, 0, 0);
    const { hooks, player } = makeHooks([a]);
    player.whipBuffs[312] = 1;
    const g = minion(player, 917, player.cx, player.cy - 40);
    a.cx = g.cx + 100; a.cy = g.cy;
    g.fixedUpdate(1, hooks);
    expect(priv(g).ai177Lock).toBe(31);
    b.cx = g.cx - 50; b.cy = g.cy;
    (hooks as { enemies: () => MockEnemy[] }).enemies = () => [a, b];
    g.fixedUpdate(1, hooks);
    expect(priv(g).ai177Lock).toBe(31);                 // 持锁跨拍（:45997 num2 直用）
    // ★BJ516③：Lerp 曲线（:46042）——tick1 vx=1.8,tick2 = 1.8+(18−1.8)×0.1=3.42
    expect(g.vx).toBeCloseTo(3.42, 9);                  // 追 A;旧重扫：-5 速换靶 B → 红
    // 变异证红：ai177FindTarget 摘锁结构（恒重扫）→ tick2 换靶 B → 红
  });
});

// ============================================================
// ② AI_156 blackListedTargets（:52809-52825 零 Add 定谳 → 恒空表+死谓词原形）
// ============================================================
describe('② AI_156 黑名单面（恒空表定谳+弟妹目标不规避）', () => {
  it('结构锁：tTarget 每拍 Clear（:52473）后零填充（:52809-52825 零 Add 定谳）', () => {
    const e = mkEnemy(41, 0, 0);
    const { hooks, player } = makeHooks([e]);
    const g = minion(player, 946, player.cx + 100, player.cy - 30);
    priv(g).tTarget(hooks, player.cx, player.cy);
    expect(AI156_BLACKLIST.length, '填充函数零 .Add（1405/1456/1457 三代同形）→ 恒空').toBe(0);
    // 变异证红：tTarget 内接入任何填充源（弟妹目标/同型槽位）→ length>0 → 红
  });

  it('行为锁：同主同型弟妹（tA1=W）正攻 W → 本体仍取 W（原版无规避;直觉填充退化=取 X）', () => {
    const w = mkEnemy(42, 0, 0);
    const x = mkEnemy(43, 0, 0);
    const { hooks, player } = makeHooks([w, x]);
    const m2 = minion(player, 946, player.cx + 140, player.cy - 30);
    priv(m2).tA1 = w.id;                                // 弟妹当前攻击 W（未来填充源的读源）
    const m1 = minion(player, 946, player.cx + 100, player.cy - 30);
    w.cx = player.cx + 500; w.cy = player.cy;           // W 更近（500）
    x.cx = player.cx + 800; x.cy = player.cy;           // X 较远（800）,双敌 1000 窗内
    const got = priv(m1).tTarget(hooks, player.cx, player.cy);
    expect(got?.id).toBe(42);                           // :52796 死谓词恒放行 → 最近 W
    // 变异证红：AI_GetMyGroupIndexAndFillBlackList 接入真实填充（弟妹 tA1 入表）
    //  → W 被野生支拒 → 返 X（800） → 红
  });
});

// ============================================================
// ③ 哨兵族 AI_053_HandleSentryNPCTargeting（:40920-40969 曼哈顿+muzzle+CanHit）
// ============================================================
describe('③ sentryFindTarget（曼哈顿自 muzzle+CanHit 点对+集火先行）', () => {
  it('曼哈顿度量：X(Δ100,Δ210) 曼 310/欧 232.6 vs Y(Δ290,Δ0) 曼 290/欧 290 → 取 Y（旧欧氏退化=取 X）', () => {
    const ex = mkEnemy(51, 0, 0);
    const ey = mkEnemy(52, 0, 0);
    const { hooks } = makeHooks([ex, ey]);
    const g = minion(hooks.player, 308, 100 * 16, 95 * 16, false, true);
    ex.cx = g.cx + 100; ex.cy = g.cy + 210;
    ey.cx = g.cx + 290; ey.cy = g.cy;
    const got = priv(g).sentryFindTarget(hooks, 0, 0, false, 1000);
    expect(got?.id).toBe(52);                           // :40954 曼哈顿 |Δx|+|Δy|
    // 变异证红：sentryFindTarget 退回 nearestEnemy 欧氏 → 取 X(232.6<290) → 红
  });

  it('CanHit 门：近敌 W(曼 300) 隔墙失视,远敌 F(曼 500) 通视 → 取 F（旧无视面退化=取 W）', () => {
    const w = mkEnemy(53, 0, 0);
    const f = mkEnemy(54, 0, 0);
    // 墙列 col=90（rows 74..84 盖行走行,严格夹在 muzzle(col100) 与 W(col81) 之间
    //  ——canHit L 形行走会在靶格前拐竖步,墙在靶格外侧（col80）不阻断）
    const { hooks } = makeHooks([w, f], [[90, 74, 84]]);
    const g = minion(hooks.player, 308, 100 * 16, 79 * 16, false, true);
    w.cx = g.cx - 300; w.cy = g.cy;                     // col ≈ 81.25 → 墙(80)隔断
    f.cx = g.cx + 500; f.cy = g.cy;                     // 通视
    const got = priv(g).sentryFindTarget(hooks, 0, 0, false, 1000);
    expect(got?.id).toBe(54);                           // :40958 CanHit 点对 muzzle→敌心
    // 变异证红：摘 sight 门（旧 nearestEnemy 无视线）→ 取 W → 红
  });

  it('1025 借道 muzzle (0,10)+maxDistance=1240：曼 1239 收/1241 拒（严格 < :40955）;集火窗=1240（旧 900 窗退化红）', () => {
    const near = mkEnemy(55, 0, 0);
    const { hooks, player } = makeHooks([near]);
    const g = minion(player, 1025, 100 * 16, 95 * 16, false, true);
    near.cx = g.cx + 1239; near.cy = g.cy + 10;         // muzzle=Center+(0,10)（:41164）
    expect(priv(g).sentryFindTarget(hooks, 0, 10, false, 1240)?.id).toBe(55);
    near.cx = g.cx + 1241;
    expect(priv(g).sentryFindTarget(hooks, 0, 10, false, 1240)).toBeNull();
    // 集火窗：焦点敌曼 1000（>旧 900 Euclid 窗）+ 野生 200 → 取焦点
    const f = mkEnemy(56, 0, 0);
    const w2 = mkEnemy(57, 0, 0);
    (hooks as { enemies: () => MockEnemy[] }).enemies = () => [f, w2];
    player.minionTargetId = f.id;
    f.cx = g.cx + 1000; f.cy = g.cy;
    w2.cx = g.cx + 200; w2.cy = g.cy;
    expect(priv(g).sentryFindTarget(hooks, 0, 10, false, 1240)?.id).toBe(56);
    player.minionTargetId = -1;
    // 变异证红：旧 nearestEnemy(1240)（focusRange=900 Euclid）→ 焦点 1000>900 出窗 → 取 W → 红
  });
});

// ============================================================
// ④ findTargetInRangeDual 扩形参（:49883 五参形;:49905 skip+elimination 尾位门）
// ============================================================
describe('④ findTargetInRangeDual 扩形参（skipIfCannotHitOwnBody+customEliminationCheck）', () => {
  it('1119 消除门：W1(300) 隔墙（CanHitLine 盒拒）被剔除,W2(620) 通视入选（旧无消除门退化=取 W1）', () => {
    const w1 = mkEnemy(61, 0, 0);
    const w2 = mkEnemy(62, 0, 0);
    // 墙列 col=70（rows 74..84 盖行走行）：随从(80*16=col80) 与 W1(980=col61) 之间
    const { hooks } = makeHooks([w1, w2], [[70, 74, 84]]);
    const g = minion(hooks.player, 1119, 80 * 16, 79 * 16);
    w1.cx = g.cx - 300; w1.cy = g.cy;                   // 墙隔断（:38179 CanHitLine 盒拒）
    w2.cx = g.cx + 620; w2.cy = g.cy;                   // 通视 + viewRect 内（玩家心 ±960）
    const got = priv(g).findTargetInRangeDual(hooks, 800, {
      customEliminationCheck: (e: { x: number; y: number; w: number; h: number }) =>
        canHitLineBox(hooks, g, e),
    });
    expect(got?.id).toBe(62);                           // :49905 尾位 elimination 门
    // 变异证红：摘 customEliminationCheck（旧 nearestEnemy 无门）→ 取 W1(300) → 红
  });

  it('skip=true（AI_067 :50524）：敌在玩家侧通视（pd 通）但我侧隔墙（md=∞）→ skip 拒（旧缺门退化=入选）', () => {
    const e = mkEnemy(63, 0, 0);
    // 墙列 col=70：随从(col80) 与 敌(col≈62.5) 隔断;玩家(col60) 与敌通视
    const { hooks, player } = makeHooks([e], [[70, 74, 84]]);
    const g = minion(player, 758, 80 * 16, 79 * 16);
    e.cx = player.cx + 40; e.cy = player.cy;            // 敌贴玩家侧（melee 四试通）
    const got = priv(g).findTargetInRangeDual(hooks, 800, { skipIfCannotHitOwnBody: true });
    expect(got, 'pd 通路入选后 skip 独立门拒（:49905 !skip||CanHitWithOwnBody）').toBeNull();
    // 变异证红：摘 skip 门（旧形参缺位）→ pd=40≤800 经 playerDistance 入选 → 红
  });

  it('焦点支不过消除门（:49888-49896 原文）：焦点隔墙仍入选（skip=false 缺省）', () => {
    const f = mkEnemy(64, 0, 0);
    const { hooks, player } = makeHooks([f], [[70, 74, 84]]);
    player.minionTargetId = f.id;
    const g = minion(player, 1119, 80 * 16, 79 * 16);
    f.cx = g.cx - 300; f.cy = g.cy;                     // 焦点隔墙
    const got = priv(g).findTargetInRangeDual(hooks, 800, {
      customEliminationCheck: () => false,              // 全拒谓词——焦点支不消费
    });
    expect(got?.id).toBe(64);                           // :49891 焦点支只查双距域
  });
});

// canHitLine 盒（1119 消除门谓词本体——与落刀处 :38179 形同构）
function canHitLineBox(hooks: GameHooks, g: MinionProj,
  e: { x: number; y: number; w: number; h: number }): boolean {
  return canHitLine(hooks.world.store, g.x, g.y, g.w, g.h, e.x, e.y, e.w, e.h);
}

// ============================================================
// ⑤ AI_026 通用尾双轨（:62598-62661 flag10 / :62771-62850 266 段）
// ============================================================
describe('⑤ ai026TailTarget（曼哈顿+CanHit 本体盒双轨+集火种子+×20 前导）', () => {
  it('双轨归真：W(300) 隔墙仅落 fallback,F(500) 通视落 num141 → tgt=F/dist=500（旧欧氏退化=追 W）', () => {
    const w = mkEnemy(71, 0, 0);
    const f = mkEnemy(72, 0, 0);
    const { hooks } = makeHooks([w, f], [[90, 74, 84]]);
    const g = minion(hooks.player, 191, 100 * 16, 79 * 16);
    w.cx = g.cx - 300; w.cy = g.cy;
    f.cx = g.cx + 500; f.cy = g.cy;
    const t = priv(g).ai026TailTarget(hooks, true);
    expect(t.tgt?.id).toBe(72);                         // :62648 CanHit 受理面 num141
    expect(t.dist).toBe(500);                           // num139=曼哈顿(本体心→F)
    expect(t.aimX).toBe(f.cx);                          // 焦点/CanHit 面=敌心（无前导差:见 ⑤.2）
    // 变异证红：退回 nearestEnemy 欧氏检索 → tgt=W(300) → 红
  });

  it('前导：flag10（1094）野生支 aim=敌心+velocity×20（:62645-62652）;266 段无前导（:62830-62838）', () => {
    const e1 = mkEnemy(73, 0, 0, { vx: 3, vy: -1 });
    const { hooks } = makeHooks([e1]);
    const fox = minion(hooks.player, 1094, 100 * 16, 79 * 16);
    e1.cx = fox.cx + 400; e1.cy = fox.cy;
    const t1 = priv(fox).ai026TailTarget(hooks, true);
    expect(t1.tgt?.id).toBe(73);
    expect(t1.aimX).toBe(e1.cx + 60);                   // +vx×20（num142=20 :62605）
    expect(t1.aimY).toBe(e1.cy - 20);                   // +vy×20
    const slim = minion(hooks.player, 266, 100 * 16, 79 * 16);
    const t2 = priv(slim).ai026TailTarget(hooks, false);
    expect(t2.tgt?.id).toBe(73);
    expect(t2.aimX).toBe(e1.cx);                        // 266 段敌心本值（:62830）
    expect(t2.aimY).toBe(e1.cy);
    // 变异证红：摘前导（266 式挂 flag10）→ aimX=cx → 红
  });

  it('集火种子：焦点隔墙失收 → 野生扫继续（F 通视入选;旧 nearestEnemy 焦点支退化=追焦点 W）', () => {
    const w = mkEnemy(74, 0, 0);
    const f = mkEnemy(75, 0, 0);
    const { hooks, player } = makeHooks([w, f], [[90, 74, 84]]);
    player.minionTargetId = w.id;
    const g = minion(player, 191, 100 * 16, 79 * 16);
    w.cx = g.cx - 300; w.cy = g.cy;
    f.cx = g.cx + 500; f.cy = g.cy;
    const t = priv(g).ai026TailTarget(hooks, true);
    expect(t.tgt?.id).toBe(75);                         // :62620 焦点 CanHit 拒 → :62629 野生扫
    // 变异证红：退回 nearestEnemy（焦点无 sight 门）→ 追 W → 红
    // 集火受理：焦点通视 → 即收（:62620-62626）,野生扫跳过（:62629 num141==-1 门）
    const w2 = mkEnemy(76, 0, 0);
    (hooks as { enemies: () => MockEnemy[] }).enemies = () => [w2, f];
    w2.cx = g.cx + 100; w2.cy = g.cy;                   // 更近野生
    player.minionTargetId = f.id;
    const t2 = priv(g).ai026TailTarget(hooks, true);
    expect(t2.tgt?.id).toBe(75);
    player.minionTargetId = -1;
  });

  it('曼哈顿度量判别：X(Δ100,Δ60) 曼 160/欧 116.6 vs Y(Δ150,Δ0) 曼 150/欧 150 → 取 Y（旧欧氏退化=取 X）', () => {
    const ex = mkEnemy(81, 0, 0);
    const ey = mkEnemy(82, 0, 0);
    const { hooks } = makeHooks([ex, ey]);
    const g = minion(hooks.player, 191, 100 * 16, 79 * 16);
    ex.cx = g.cx + 100; ex.cy = g.cy + 60;              // 曼 160 / 欧 ≈116.6
    ey.cx = g.cx + 150; ey.cy = g.cy;                   // 曼 150 / 欧 150
    const t = priv(g).ai026TailTarget(hooks, true);
    expect(t.tgt?.id).toBe(82);                         // :62611/:62639 曼哈顿 |Δx|+|Δy|
    expect(t.dist).toBe(150);
    // 变异证红：ai026TailTarget 退回欧氏 → ex(116.6<150) 先收且收缩门拒 Y → 取 81 → 红
  });

  it('fallback 合流：全敌隔墙 → tgt=null,dist=最近曼哈顿+fallback 瞄准带 ×20 前导（:62645-62661）', () => {
    const w1 = mkEnemy(77, 0, 0, { vx: 2, vy: 0 });
    const w2 = mkEnemy(78, 0, 0);
    const { hooks } = makeHooks([w1, w2], [[90, 74, 84], [120, 74, 84]]);
    const g = minion(hooks.player, 191, 100 * 16, 79 * 16);
    w1.cx = g.cx - 300; w1.cy = g.cy;                   // col≈81.25 → 墙 90 隔
    w2.cx = g.cx + 500; w2.cy = g.cy;                   // col≈131.25 → 墙 120 隔
    const t = priv(g).ai026TailTarget(hooks, true);
    expect(t.tgt).toBeNull();                           // num141=-1（无 CanHit 候选）
    expect(t.dist).toBe(300);                           // num139←num140（最近 fallback）
    expect(t.aimX, 'fallback 轨瞄准=敌心+velocity×20（:62645-62646,flag10）').toBe(w1.cx + 40);
    // 变异证红：fallback 轨前导摘除 → aimX=w1.cx → 红（与 ⑤.2 CanHit 轨前导互补）
  });

  it('消费端接线（191 集成）：tgt=F(400) Δx≤num151=450 开火 195;Δx=500>num151 走近不出手（★BJ516④）', () => {
    const w = mkEnemy(79, 0, 0);
    const f = mkEnemy(80, 0, 0);
    const { hooks, added } = makeHooks([w, f], [[75, 74, 84]]);
    // ★BJ516④：随从在玩家右 400（<num92=540 地面态;归位门 :61334 不会翻飞行态）
    const g = minion(hooks.player, 191, 60 * 16 + 400, 79 * 16);
    w.cx = g.cx - 300; w.cy = g.cy;                    // col≈66.25 → 墙 75 隔断（fallback 拒）
    f.cx = g.cx + 400; f.cy = g.cy;
    g.fixedUpdate(1, hooks);
    const shots = added.filter((p) => (p as { projId?: number }).projId === 195);
    expect(shots.length, '尾面 tgt=F → :62691 门 400<800+0 ∧ |Δx|=400≤num151 → 出手 195').toBe(1);
    // ★BJ516④ num151 转向-开火阈（:62694-62707）：|Δx|>num151=450 → 转向走近不出手
    //  （新随从 g2:shootCd=0——排除冷却窗混淆）
    const f2 = mkEnemy(81, 0, 0);
    (hooks as { enemies: () => MockEnemy[] }).enemies = () => [f2];
    const g2 = minion(hooks.player, 191, 60 * 16 + 400, 79 * 16);
    f2.cx = g2.cx + 500; f2.cy = g2.cy;
    g2.fixedUpdate(1, hooks);
    const shots2 = added.filter((p) => (p as { projId?: number }).projId === 195);
    expect(shots2.length, '|Δx|=500>450 → flag3 走近,不出手（旧无阈恒射=2 → 红）').toBe(1);
    // 变异证红：num151 阈摘除（恒射）→ g2 拍 +1 发 → 红
    // 变异证红：退回旧 nearestEnemy+throwLos 形 → tgt=W 隔墙 → 整支 return 零出手 → 红
  });
});

// ============================================================
// ⑥ 源级锁：BJ515 落刀面在位（防回退）
// ============================================================
describe('⑥ BJ515 落刀面源级锁', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');

  it('① :45925 门/:46000 失效门/LocalImmunityTable 逐 t 衰减在位;门仅 917 消费（1036 翻案登记）', () => {
    const fn = src.slice(src.indexOf('private ai177FindTarget('), src.indexOf('private ai026TailTarget('));
    expect(fn).toContain('peek(this.ai177Lock) > 0');   // :46000
    expect(fn).toContain('peek(en.id) > 0');            // :45925
    expect(fn).toContain("this.projId === 917");        // 门/锁=AI_177 本相
    expect(fn).toContain('ai177Lock = best.id');        // :46016 写锁
    expect(src).toContain('tick(): void {');            // :17365-17385 逐 t 形
    expect(src).toContain('this.ai177Immunity.tick();');// Update 头先衰减同相
    expect(src).toContain('? !this.ai177Immunity.ready(en.id, spec as number)'); // :14178 写位
  });

  it('② AI156_BLACKLIST Clear+双死谓词在位（:52473/:52776/:52796）', () => {
    const fn = src.slice(src.indexOf('private tTarget('), src.indexOf('/** oldPos/oldRot 历史环'));
    expect(fn).toContain('AI156_BLACKLIST.length = 0');
    expect((fn.match(/AI156_BLACKLIST\.includes\(/g) ?? []).length).toBe(2);
    expect(src).toContain('零 .Add');                   // 定谳锚
  });

  it('③ sentryFindTarget 曼哈顿+CanHit 点对+双调用点换线（:40954/:40958/:38030/:41175）', () => {
    const fn = src.slice(src.indexOf('private sentryFindTarget('), src.indexOf('private guardianBody('));
    expect(fn).toContain('Math.abs(mx0 - en.cx) + Math.abs(my0 - en.cy)');
    expect(fn).toContain('canHit(st, mx0, my0, 0, 0, en.cx, en.cy, 0, 0)');
    expect((src.match(/this\.sentryFindTarget\(game, 0, this\.projId === 966 \? -16 : 0, false, 1000\)/g) ?? []).length).toBe(1);
    expect((src.match(/this\.sentryFindTarget\(game, 0, this\.carriedByBackpack \? 0 : 10, false, 1240\)/g) ?? []).length).toBe(1);
  });

  it('④ findTargetInRangeDual opts 三参+七站 skip=true+1119 CanHitLine 消除门（★BJ516①：+1036=七站）', () => {
    expect(src).toContain('skipIfCannotHitOwnBody?: boolean; customEliminationCheck?: (e: EnemyLike) => boolean;');
    expect((src.match(/skipIfCannotHitOwnBody: true/g) ?? []).length).toBe(7);
    expect(src).toContain('customEliminationCheck: (e) => canHitLine(game.world.store,');
    expect(src).toContain("opts?.respectOwnerTarget !== false");
  });

  it('⑤ ai026TailTarget 双轨+前导+七 id 面;MINION_SHOOT metric/throwLos 尾族键退役', () => {
    expect(src).toContain("const AI_026_TAIL_IDS = new Set([191, 192, 193, 194, 266, 1094, 1113]);");
    expect(src).toContain("const AI_026_LEAD_IDS = new Set([191, 192, 193, 194, 1094, 1113]);");
    const fn = src.slice(src.indexOf('private ai026TailTarget('), src.indexOf('private guardianBody('));
    expect(fn).toContain('Math.abs(this.cx - en.cx) + Math.abs(this.cy - en.cy)');
    expect(fn).toContain('vx * 20');                    // :62645-62652
    expect(fn).toContain('fbDist2.v < dist');           // :62658 合流
  });
});
