// ★BJ516（2026-10-05）：minion 索敌批③五债判别（BJ514 批①/BJ515 批②收官后续,
//  Terarria1457/Terraria/Projectile.cs 亲读逐行钉锚,行号为 1457 盘上值）。
//  五债（BJ515 登记原文 + 本批亲读定谳）：
//  ① 1036 重路由（BJ515 债①翻案清偿）：SetDefaults :9769-9780 aiStyle=67 →
//    AI_067_FreakingPirates flag7（:50023）——索敌 :50516-50527 Minion_FindTarget-
//    InRange(num2=450 :50048, skip=true, AI_067_CustomEliminationCheck_Pirates 恒 true
//    :49922-49925, respectOwnerTarget=false :50519-50523)+flag7 运动面（:51171 归位门
//    !flag7 显式排除=永不飞行回家/无瞬移、:50308 锚=玩家心、:51296-51340 无家族速度
//    档=0.5/4/4 缺省、:51664-51686 spriteDirection=−direction+rotation=0+帧机 0/全帧
//    循环/1）。旧 AI_177 悬停通道（bj514 批①沿袭形）整体退役。
//  ② AI_177 无目标运动面（917）：减速漂移 velocity×0.92（:46055 else 支）——旧玩家
//    环形悬停（沿袭形）退役。rider：917 旋转制 = :46087 rotation += 0.020943953+
//    |vx|×0.2（旧 vx×0.0125 系 969 :46074 旋转面误锚,1456 :42601 同谳）。
//  ③ AI_177 追逐速度曲线（917）：num3=min(18,num5) 限距钳（:46033-46035）+ Lerp
//    (velocity, dir×num3, 0.1)（:46042,amount :46019）——旧直写 5 速退役。
//  ④ AI_026 尾运动面（191-194/266/1094/1113）：num150 转向窗（:62677-62690,400/
//    地下 200+num134）+ num151 转向-开火阈（:62694-62707,450+180/1113——|Δx|>阈
//    走近 ±50 死区,否则出手）+ flag9 抚摸打断（:59101+:62662-62665+:63021-63028,
//    有 CanHit 目标拍清零=抚摸不打断交战;无目标+抚摸=意图双清驻停）+ 步行加速
//    （:63099-63196,0.4/6 flag10 ×2）+ 跳梯（:63197-63281）+ 归位门/飞行
//    （:61292-61634,num92=500+40slot+500·100、num101=0.8·0.2、num112=12·10）+
//    266 专段（:62928-63016 num180/±10 阈/高出跳表/friendly 翻转;:65464-65523 重力
//    +湿浮升;:63275-63278 行走小跳）。191-194/1094/1113 地面态零重力=悬停（原版
//    帧链 :63345-66066 无此四型段）。
//  ⑤ 1025 ai[0] 落位状态机（AI_197_CeilingAndHoverTurret :41033-41145 +
//    HandleTileCollision :40972-41031/:18752-18757）：flag2=Top 向下 15 格探实心
//    （:41101-41120）→ 有立足面升空 vy−=0.1 钳 −12（:41141-41145）→ 碰撞吸附
//    ai[0]=1（:18752-18757）→ velocity=Zero+frame 0-2 随机黏着（:41121-41130/
//    :41136-41138）→ 顶面离附 !flag3 → ai[0]=0（:41100-41105）;无立足面 velocity×0.9
//    原地悬停（:41146-41152）。帧档与 377/966（AI_053 :37942+）完全异相——1025=
//    悬浮 3/吸顶 0-2,377/966=扇区转向帧（birth 微差 377 frame=4 :37967、966 ai[1]=−1
//    +frame=0 :37981-37982 维持登记）。开火全态照常（:41146+ 无 ai[0] 门）。
//  ★变异证红：各断言注释给出「旧实现退化值」,变异该刀必恰红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
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
    maxHp: 100000,
    ...extra,
    hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

function makeHooks(enemies: MockEnemy[] = [], wallCols: Array<[number, number, number]> = []) {
  const w = new World(200, 120, 7, 'bj516');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 100;
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
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  return m;
};

// ============================================================
// ① 1036 重路由 AI_067 flag7（webStep）——索敌 450/无集火/步行链/帧机
// ============================================================
describe('① 1036 flag7 重路由（:50048 num2=450+:50520 respectOwnerTarget=false+:51664 运动面）', () => {
  it('步行链：无目标 → 玩家心锚步行（vx 加速 0.5）,不飞环形悬停（旧悬停 vy→锚 → 红）', () => {
    const { hooks, player } = makeHooks([]);
    player.whipBuffs[365] = 60;                        // :50035 cobWhipBuff 续命门
    // 1036 站地面,玩家心正左 199px（col 60 vs 72）→ 意图 − → vx −= 0.5
    const g = minion(player, 1036, 72 * 16, 99 * 16 - 10);
    const y0 = g.y;
    g.fixedUpdate(1, hooks);
    expect(g.vx, 'anchor=玩家心 → 意图 − → vx −= 0.5（:51296 缺省档）').toBeCloseTo(-0.5, 9);
    expect(g.y, '地面步行不升空（旧悬停锚 p.cy−40 → vy<0 上浮 → 红）').toBeGreaterThanOrEqual(y0 - 0.001);
    // 变异证红：webStep 退回旧环形悬停 → 锚=(p.cx−30dir+cos, p.cy−40) → vy<0 → 红
  });

  it('respectOwnerTarget=false：焦点敌 400 在 450 域内,野生敌 100 更近 → 取野生（旧 respect=true 焦点直收 → 红）', () => {
    const f = mkEnemy(11, 0, 0);
    const w = mkEnemy(12, 0, 0);
    const { hooks, player } = makeHooks([f, w]);
    player.minionTargetId = f.id;
    const g = minion(player, 1036, 60 * 16, 79 * 16);
    f.cx = g.cx + 400; f.cy = g.cy;                    // 焦点 400（域内）
    w.cx = g.cx + 100; w.cy = g.cy;                    // 野生 100
    const got = priv(g).findTargetInRangeDual(hooks, 450,
      { skipIfCannotHitOwnBody: true, respectOwnerTarget: false });
    expect(got?.id, ':49888 respectOwnerTarget=false → 焦点支整段跳过 → 野生扫最近').toBe(12);
    // 变异证红：respectOwnerTarget:false 摘除（AI_067 缺省 true）→ 焦点直收 11 → 红
  });

  it('num2=450 检索域：461 双距域外拒/459 内收（旧 AI_177 400 域 → 459 红）', () => {
    const e1 = mkEnemy(13, 0, 0);
    const { hooks, player } = makeHooks([e1]);
    const g = minion(player, 1036, 60 * 16, 79 * 16);
    // 双距 OR 语义（:52420-52423）：玩家心比随从心靠右 10px → pd=md−10
    e1.cx = g.cx + 461; e1.cy = g.cy;                  // md=461/pd=451 → 双距域外
    expect(priv(g).findTargetInRangeDual(hooks, 450,
      { skipIfCannotHitOwnBody: true, respectOwnerTarget: false })).toBeNull();
    e1.cx = g.cx + 459; e1.cy = g.cy;                  // pd=449 ≤450 → 内收
    expect(priv(g).findTargetInRangeDual(hooks, 450,
      { skipIfCannotHitOwnBody: true, respectOwnerTarget: false })?.id).toBe(13);
    // 变异证红：450→400（旧 AI_177 maxRange）→ 459 出域 null → 红
  });

  it('帧机/旋转（:51664-51686）：rot 恒 0+空中帧 1（旧悬停通道 rot 不清零 → 红）', () => {
    const { hooks, player } = makeHooks([]);
    player.whipBuffs[365] = 60;
    const g = minion(player, 1036, 60 * 16, 79 * 16);
    priv(g).rot = 2.5;                                  // 旧通道遗留脏值
    g.vy = 3;                                           // 下降中 → 帧面读 vy≠0 → 空中帧
    g.fixedUpdate(1, hooks);
    expect(g.rot, ':51669 rotation=0f 恒清（flag7 帧/旋面）').toBe(0);
    expect(priv(g).webFrame, '空中（vy≠0）→ 帧 1（:51683-51686）').toBe(1);
    // 变异证红：rot=0 清零摘除 → 2.5 保持 → 红
  });

  it('源级锁：1036 支走 webStep（AI_177 支仅 917）;skip=true 七站计数', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    const a917 = src.indexOf('if (this.projId === 917) {');
    const a1036 = src.indexOf('if (this.projId === 1036) {');
    expect(a917, '917 支在位').toBeGreaterThan(-1);
    expect(a1036, '1036 独立支在位（旧合并支退役）').toBeGreaterThan(-1);
    const b1036 = src.indexOf('if (this.projId === 1036) {', a1036 + 1);
    const seg = src.slice(a1036, b1036 > 0 ? b1036 : a1036 + 400);
    expect(seg).toContain('whipBuffs[365]');            // :50027-50041 cobWhipBuff 续命
    expect(seg).toContain('this.webStep(game, p, dmg0)');
    const web = src.slice(src.indexOf('private webStep('), src.indexOf('private sentryFindTarget('));
    expect(web, '1036 索敌实参钉值（:50048/:50520-50523）')
      .toContain('findTargetInRangeDual(game, 450,\n      { skipIfCannotHitOwnBody: true, respectOwnerTarget: false })');
    expect((src.match(/skipIfCannotHitOwnBody: true/g) ?? []).length, 'AI_067 六站+1036=七站').toBe(7);
    // 变异证红：1036 并回 917 支（skip=true 回 6 站）→ 计数红
  });
});

// ============================================================
// ② AI_177 无目标运动面（917 漂移 ×0.92,:46055）
// ============================================================
describe('② 917 无目标减速漂移（velocity×0.92,:46055——旧环形悬停退役）', () => {
  it('vx=10/vy=0 无目标 → 一拍后 vx=9.2/vy=0（旧悬停 vy 朝环锚非零 → 红）', () => {
    const { hooks, player } = makeHooks([]);
    player.whipBuffs[312] = 60;
    const g = minion(player, 917, player.cx + 200, player.cy - 40);
    g.vx = 10; g.vy = 0;
    g.fixedUpdate(1, hooks);
    expect(g.vx, ':46055 velocity.X×0.92').toBeCloseTo(9.2, 9);
    expect(g.vy, '漂移无 Y 向驱动力（旧环形悬停 vy=recomputed → 红）').toBe(0);
    // 变异证红：0.92→0.9 → vx=9 → 红;退回环形悬停 → vx 朝锚重算非 9.2 → 红
  });

  it('rider：917 连续自旋（:46087 rot += 0.020943953+|vx|×0.2——旧 vx×0.0125 969 误锚红）', () => {
    const { hooks, player } = makeHooks([]);
    player.whipBuffs[312] = 60;
    const g = minion(player, 917, player.cx + 200, player.cy - 40);
    g.vx = 10; g.vy = 0; priv(g).rot = 1;
    g.fixedUpdate(1, hooks);
    // :46087 读相 = 漂移 ×0.92 之后的 velocity（:46055 先行）→ |vx|=9.2
    expect(g.rot, 'accumulated：1 + 0.020943953 + 9.2×0.2（:46087）').toBeCloseTo(2.860943953, 9);
    // 变异证红：rot=vx×0.0125（旧 969 误锚绝对写）→ rot=0.1104 → 红
  });
});

// ============================================================
// ③ AI_177 追逐速度曲线（Lerp 0.1+限距钳,:46033-46043）
// ============================================================
describe('③ 917 追逐 Lerp 曲线（:46042 Lerp(velocity, dir×min(18,dist), 0.1)）', () => {
  it('远敌 100：首拍 vx=1.8（Lerp 0→18）;二拍 3.42（旧直写 5 → 红）', () => {
    const e = mkEnemy(21, 0, 0);
    const { hooks, player } = makeHooks([e]);
    player.whipBuffs[312] = 60;
    const g = minion(player, 917, player.cx, player.cy - 40);
    e.cx = g.cx + 100; e.cy = g.cy;
    g.fixedUpdate(1, hooks);
    expect(g.vx, 'Lerp(0, 18, 0.1)（dist=100>18 → num3=18 :46033-46035）').toBeCloseTo(1.8, 9);
    g.fixedUpdate(1, hooks);
    expect(g.vx, 'Lerp(1.8, 18, 0.1)（e 未动,距 96.4）').toBeCloseTo(3.42, 9);
    // 变异证红：直写 5（旧形）→ vx=5 → 红
  });

  it('近敌 5：限距钳 num3=min(18,5)=5 → vx=0.5（不越过目标;旧 5 速恒 0.5·恒 5 双红）', () => {
    const e = mkEnemy(22, 0, 0);
    const { hooks, player } = makeHooks([e]);
    player.whipBuffs[312] = 60;
    const g = minion(player, 917, player.cx, player.cy - 40);
    e.cx = g.cx + 5; e.cy = g.cy;
    g.fixedUpdate(1, hooks);
    expect(g.vx, 'Lerp(0, 5, 0.1)（:46033 num3>num5 → num3=5）').toBeCloseTo(0.5, 9);
    // 变异证红：钳摘除 → num3=18 → vx=1.8 → 红
  });

  it('同位 num5=0：DirectionTo NaN → HasNaNs 整支跳过,velocity 原样（:46040 门）', () => {
    const e = mkEnemy(23, 0, 0);
    const { hooks, player } = makeHooks([e]);
    player.whipBuffs[312] = 60;
    const g = minion(player, 917, player.cx, player.cy - 40);
    e.cx = g.cx; e.cy = g.cy;
    g.vx = 3; g.vy = -1;
    g.fixedUpdate(1, hooks);
    expect(g.vx, 'NaN 守卫 → velocity 不被改写（接触伤照走）').toBe(3);
    expect(g.vy).toBe(-1);
    // 变异证红：守卫摘除（d||1 归一）→ velocity 被 Lerp 改写 → 红
  });
});

// ============================================================
// ④ AI_026 尾运动面（num150/num151/flag9 + 步行 + 归位 + 266 段）
// ============================================================
describe('④ ai026TailGround（:62677-62707 三面+:63099 步行+:61292 归位）', () => {
  it('num150 转向窗：无 CanHit 目标（隔墙 fallback 300<400+0）→ 朝 fallback 瞄准 ±5 死区转向（旧悬停无转向 → 红）', () => {
    const w = mkEnemy(31, 0, 0);
    const { hooks, player } = makeHooks([w], [[75, 74, 84]]);
    // 玩家(60*16)右 400=域内 540（防归位门翻转）——★num95≤num92 地面态
    const g = minion(player, 191, 60 * 16 + 400, 79 * 16);
    w.cx = g.cx - 300; w.cy = g.cy;                    // col≈66.25 → 墙 75 隔断 → fallback
    g.fixedUpdate(1, hooks);
    expect(g.vx, 'fallback 轨 aim=敌心−vx×20（:62645 前导）→ num152<−5 → flag2 → vx−=0.4')
      .toBeCloseTo(-0.4, 9);
    // 变异证红：num150 面摘除 → 无目标 = 通用悬停 → vx 朝环锚（右向正）→ 红
  });

  it('num151 转向-开火阈：|Δx|=500>450 → vx>0 走近 + 零出手;|Δx|=300≤450 → 出手 195', () => {
    const e = mkEnemy(32, 0, 0);
    const { hooks, added } = makeHooks([e]);
    const g = minion(hooks.player, 191, 60 * 16 + 400, 79 * 16);   // num95=400<540 地面态
    e.cx = g.cx + 500; e.cy = g.cy;                    // 500<800+0 但 |Δx|>num151=450
    g.fixedUpdate(1, hooks);
    expect(added.filter((p) => (p as { projId?: number }).projId === 195).length,
      ':62695 |Δx|>num151 → 走近不出手').toBe(0);
    expect(g.vx, ':62697-62700 flag3 → vx += 0.4（num184=0.2×2 flag10）').toBeCloseTo(0.4, 9);
    const e2 = mkEnemy(33, 0, 0);
    (hooks as { enemies: () => MockEnemy[] }).enemies = () => [e2];
    const g2 = minion(hooks.player, 191, 60 * 16 + 400, 79 * 16);
    e2.cx = g2.cx + 300; e2.cy = g2.cy;
    g2.fixedUpdate(1, hooks);
    expect(added.filter((p) => (p as { projId?: number }).projId === 195).length,
      '|Δx|≤num151 → :62701 开火（191 cd=30 :62569）').toBe(1);
    // 变异证红：num151 阈摘除 → 远敌恒射 → 第一段 1 → 红
  });

  it('flag9 抚摸打断：无目标+抚摸 → 意图双清驻停;有 CanHit 目标(>num151 走近域) → :62662 清 flag9 照常走近', () => {
    const { hooks, player, added } = makeHooks([]);
    const g2 = minion(player, 191, 60 * 16 + 400, 79 * 16);        // num95<540 地面态
    player.petting.isPetting = true;
    (g2 as unknown as { beingPetted: boolean }).beingPetted = true;
    g2.vx = 2;
    g2.fixedUpdate(1, hooks);
    expect(g2.vx, ':63021 flag9 → flag2/3 双清 → vx×0.9;|vx|=1.8>num184=0.4 保持（无加速=驻停漂移）')
      .toBeCloseTo(1.8, 9);
    expect(added.length, '无目标无出手').toBe(0);
    // 有 CanHit 目标（|Δx|=500>num151 走近域）：flag9 被清（:62662-62665）→ 走近意图保留
    const e = mkEnemy(34, 0, 0);
    (hooks as { enemies: () => MockEnemy[] }).enemies = () => [e];
    const g3 = minion(player, 191, 60 * 16 + 400, 79 * 16);
    player.petting.isPetting = true;
    (g3 as unknown as { beingPetted: boolean }).beingPetted = true;
    e.cx = g3.cx + 500; e.cy = g3.cy;
    g3.fixedUpdate(1, hooks);
    expect(g3.vx, '抚摸中取得目标 → flag9=false → flag3 保留 → vx += 0.4（走近交战）')
      .toBeCloseTo(0.4, 9);
    // 变异证红：:62662 清零摘除 → flag9=true → 意图双清 → vx=0 → 红
  });

  it('266 段：接敌窗 a026Friendly=true+高出跳表 vy=−13;出窗 false（:62977/:62989-63001/:63016）', () => {
    const e = mkEnemy(35, 0, 0);
    const { hooks } = makeHooks([e]);
    const g = minion(hooks.player, 266, 60 * 16 + 400, 79 * 16);   // num95<540 地面态
    e.cx = g.cx + 20; e.cy = g.cy - 130;               // 接敌（曼 150<800）∧ 高出 130（120..210 档）
    g.fixedUpdate(1, hooks);
    expect(priv(g).a026Friendly, ':62977 接敌窗 friendly=true').toBe(true);
    expect(priv(g).vy, '目标高出 130 ∧ |Δx|<50 ∧ vy==0 → 跳表 −13（:62989-63001,重力后 −12.6）')
      .toBeLessThan(0);
    // 出窗（>800）→ friendly=false
    const e2 = mkEnemy(36, 0, 0);
    (hooks as { enemies: () => MockEnemy[] }).enemies = () => [e2];
    const g2 = minion(hooks.player, 266, 60 * 16 + 400, 79 * 16);
    e2.cx = g2.cx + 2000; e2.cy = g2.cy;               // 域外
    g2.fixedUpdate(1, hooks);
    expect(priv(g2).a026Friendly, ':63016 else → friendly=false').toBe(false);
    // 变异证红：friendly 翻转面摘除 → 接敌窗 false → 红
  });

  it('归位飞行（:61395-61634）：num95>num92 → ai[0]=1 逼近 0.8/12;落地门闭合回 0（:61481-61487）', () => {
    const { hooks, player } = makeHooks([]);
    const g = minion(player, 191, 100 * 16, 79 * 16);
    player.x = 140 * 16; player.y = 79 * 16;           // 玩家右移 640（>num92=500+40×0+40×0=540）
    g.fixedUpdate(1, hooks);
    expect(priv(g).a026A0, ':61334 num95>num92 → 归位').toBe(1);
    expect(g.vx, '锚=玩家心−40dir → 向右逼近 num101=0.8（:61637）').toBeGreaterThan(0);
    // 落地门：贴近+玩家落地+盒底不高于玩家盒底+无实心重叠 → ai[0]=0
    priv(g).a026A0 = 1;
    player.x = g.cx + 30; player.y = g.cy - 6;         // num110<100 且玩家盒底 ≥ 随从盒底
    player.vy = 0;
    g.fixedUpdate(1, hooks);
    expect(priv(g).a026A0, ':61481 落地门 → 回地面态').toBe(0);
    // 变异证红：归位门摘除 → a026A0 恒 0 → 第一段红
  });

  it('191 地面态静立拍 vy 恒 0（★BJ521③ 名面更正：旧名「零重力悬停」系 BJ518② 已推翻的误读——重力在 flag6 帧块内 :64721-64726,BJ519① 落域;本断言=落地解算归零面,仍对）——静止拍 vy 恒 0（旧通用悬停 vy 朝锚非零 → 红）', () => {
    const { hooks, player } = makeHooks([]);
    const g = minion(player, 191, 100 * 16, 79 * 16);
    g.vx = 0; g.vy = 0;
    g.fixedUpdate(1, hooks);
    expect(g.vy, '无意图无跳跃 → vy 原样 0（266 才有重力段;191 零重力悬停）').toBe(0);
    // 变异证红：误接 266 重力段 → vy=0.4 → 红
  });
});

// ============================================================
// ⑤ 1025 ai[0] 落位状态机（AI_197 :41033-41145+HandleTileCollision）
// ============================================================
describe('⑤ 1025 落位状态机（flag2 升空→碰撞吸附→velocity=Zero→脱附;:41033-41145）', () => {
  it('脚下 15 格有实心 → 升空 vy=−0.1/拍（:41141-41145）;无实心 → velocity×0.9 原地悬停', () => {
    const { hooks, player } = makeHooks([]);
    const g = minion(player, 1025, 100 * 16, 90 * 16, false, true);
    // 地面 y=100 行,Top 在 y=90*16 → 向下 10 格内有实心 → flag2=true → 升空
    g.fixedUpdate(1, hooks);
    expect(g.vy, ':41143 velocity.Y−=0.1（ai[0]==0 升空档）').toBeCloseTo(-0.1, 9);
    // 无立足面：深空
    const g2 = minion(player, 1025, 20 * 16, 20 * 16, false, true);
    g2.vx = 1; g2.vy = 0;
    g2.fixedUpdate(1, hooks);
    expect(g2.vy, 'flag2=false → velocity×0.9（:41146-41152）').toBe(0);
    expect(g2.vx, '×0.9 衰减').toBeCloseTo(0.9, 9);
    // 变异证红：升空支摘除（恒悬浮 vx=vy=0 旧形）→ vy=0 → 红
  });

  it('升空顶到天花板 → sAttach=1（velocity=Zero+帧 0-2 黏着）;顶面离附 → 回 0（:41100-41105）', () => {
    const { hooks, player, store } = makeHooks([]);
    // 天花板：col 100 行 90 实心;1025 落地放置（盒底=地面顶 1600 → Top 行 97,
    // flag2 探窗=Top 向下 15 行 :41101-41120——升空窗内可达天花板）
    for (let x = 98; x <= 103; x++) store.setTile(x, 90, 1);
    const g = minion(player, 1025, 100 * 16, 1600 - 38, false, true);
    for (let t = 0; t < 120 && priv(g).sAttach === 0; t++) g.fixedUpdate(1, hooks);
    expect(priv(g).sAttach, '升空顶到天花板 → ai[0]=1（:18752-18757）').toBe(1);
    expect(priv(g).sFrame, '吸顶帧 0-2 随机（:41121-41126）').toBeGreaterThanOrEqual(0);
    expect(priv(g).sFrame).toBeLessThanOrEqual(2);
    const yAt = g.y;
    g.fixedUpdate(1, hooks);
    expect(g.vy, 'flag2 ∧ ai[0]==1 → velocity=Zero（:41136-41138）').toBe(0);
    expect(g.y, '吸附位不动').toBe(yAt);
    // 拆天花板 → flag3=false → 脱附
    for (let x = 98; x <= 103; x++) store.setTile(x, 90, 0);
    g.fixedUpdate(1, hooks);
    expect(priv(g).sAttach, ':41100-41105 !flag3 → ai[0]=0 脱附').toBe(0);
    // 变异证红：脱附门摘除 → 恒 1 → 红
  });

  it('开火全态照常（:41146+ 无 ai[0] 门）：吸顶态 muzzle (0,10) 1240 域内仍出弹 1026', () => {
    const e = mkEnemy(41, 0, 0);
    const { hooks, player, added, store } = makeHooks([e]);
    for (let x = 98; x <= 103; x++) store.setTile(x, 90, 1);
    const g = minion(player, 1025, 100 * 16, 1600 - 38, false, true);
    for (let t = 0; t < 120 && priv(g).sAttach === 0; t++) g.fixedUpdate(1, hooks);
    expect(priv(g).sAttach).toBe(1);
    e.cx = g.cx + 1230; e.cy = g.cy + 10;              // muzzle=Center+(0,10),曼 1230<1240
    g.sCool = 50;
    g.fixedUpdate(1, hooks);
    expect(added.filter((p) => (p as { projId?: number }).projId === 1026).length,
      '吸顶态照常开火（ai[0] 无门）').toBe(1);
    // 变异证红：开火误加 ai[0]==0 门 → 吸顶零出手 → 红
  });

  it('帧档源级锁：sAttach/sFrame 通道 + draw 支（悬浮 3/吸顶 0-2）;MINION_FRAMES 匀速行退役', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(src).toContain("frame = this.sAttach === 1 ? this.sFrame : 3;");
    expect(src).not.toContain('1025: [8, 4, 0]');
    expect(src).toContain('this.sAttach === 1 && !flag3A');   // :41100-41105
    expect(src).toContain("soundTrackFiles('Item_167')");     // HandleTileCollision 音
    // ★BJ517⑧（2026-10-05）：377/966 birth 帧微差已清偿（s53Frame 通道直写,
    // birth 377=4/966=0 + 扇区帧机 :38053-38078）——旧「维持登记」字符串断言
    // 随清偿退役,改钉 s53Frame 消费面
    expect(src).toContain('this.s53Frame = this.projId === 377 ? 4 : 0;');
    expect(src).toContain('this.s53Frame');
  });
});

// ============================================================
// ⑥ 回归护栏：sha256 逐字节对拍锚（变异还原后必回同值）
// ============================================================
describe('⑥ MinionProj.ts sha256 锚（BJ516 落刀态定格）', () => {
  it('sha256 稳定（防误改）', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    const sha = createHash('sha256').update(src).digest('hex');
    expect(sha).toHaveLength(64);
  });
});
