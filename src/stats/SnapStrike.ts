// 拍击石系三脉冲（Projectile.TryMakingSnappingStoneStrike 1457 :14347-14465 1:1）：
//  6167 拍击石   kind 0（ranged 命中触发 :13443-13446）——30×rangedDamage/120px/2 目标；
//                加伤基座 num3=40（:14363 头部缺省值,kind0 不覆写）
//  6178 焰爆石   kind 1（melee|ranged 命中触发 :13439-13442）——45×meleeDamage/300px/
//                弹 1131 + 目标 323 Hellfire 180t（:14396-14401）；1131 出射逐弹按
//                持有者 meleeCrit>rangedCrit 现场定类 :14414-14418（★F3,见 trySnapStrike）；
//                加伤基座 num3=70（:14373）/乘区 = max(meleeDamage,rangedDamage)
//                （:14448-14451,与初始伤的 meleeDamage【不同式】）+ 受击者本体
//                AddBuff(323,180)（:14444）
//  6179 毁灭臂镗 kind 2（tag 命中触发 :13447-13450）——150×minionDamage/400px/弹 1132；
//                加伤基座 num3=150（:14378）
// ★F1（蓝队四轮，2026-08-31）：脉冲扫描尾【无条件】把加伤并入本次触发命中的 dmg：
//   `num13 = num2 − num7`（:14442,漏配额=2−实出弹数,零目标也非负）→
//   `num14 = num3 + num4*num13`（num4=10,:14362）→ 按 kind 乘区截断 → `dmg += num14`
//   （:14457）→ kind1 另行给受击者本体 Hellfire。trySnapStrike 因此把旧 boolean
//   返回值改为【返回 num14 终值】(number,未触发/冷却拦下 = 0)——所有调用站须把它
//   并入本次 e.hurt 实伤参（防御前）。迁移时序说明：
//    · 原版弹幕侧（Projectile.Damage_PVE_Inner）加伤点在 DamageVar(:12959) 与
//      banner(:13387-91) 之后、parry ×5(:13634)/StrikeNPC(:13702) 之前 ⇒ num14 不吃
//      攻端旗乘区；暴击翻倍在 StrikeNPC_Inner 防后 (:81990 num*(crit?2:1)) 故 num14
//      【随本次命中一起】吃暴击——仓内调用侧预倍惯例下按 `+ bonus*(crit?2:1)` 并入；
//    · 原版挥砍侧（Player.ProcessHitAgainstNPC :44684-86）恰好相反：加伤在
//      DamageVar(:44700 前) 之前 ⇒ num14 跟全链一起掷 ±15%（Game.ts 已按此序并入）。
// 共用冷却 Player.accSnappingStoneCooldown=360t（:14382-14383,Player.ts:571 字段/
//  :3837 逐 t 递减——Update_SnappingStone :28592-28604 同款）;目标选取 =
//  FindTargetWithLineOfSight（Projectile.cs:46474-46501,至多 num2=2 个,跳过本次受击者
//  + 此前已选者）。★F2（蓝队四轮）：扫描面已按原文重建——①最近距离收缩语义
//  （`num2 < num` STRICT 严格小于：距离恰等于 maxRange 的目标不取;原版 Distance()
//  为 f32 长度,仓内 f64 双精度在常规量程与 f32 同值,f32 次常差异域备案），
//  每个 num8 循环迭代以本次结果为 skipTargets 新成员重扫（缩短半径）；②视线门
//  Collision.CanHit(targeter 整盒 → npc 整盒)（:46491,physics.canHit 家族复用；
//  targeterBox 缺省 = 点盒(hx,hy,0,0),仅测试桩形态）;③localNPCImmunity!=0 排除
//  （:46488,targeter 为 Projectile 时——经 ctx.exclude 读各宿主弹体的局部免疫窗，
//  对齐 GC1 noteNpcPlayerImmune 体系承载的同语义窗位）。
//  弹 1121/1131/1132 timeLeft=2 速 UnitY×0.1（:14413-14416）——本仓 Arrow 直生近似。
//  ★1457 编排器对齐（2026-08-23）：命中尘 = Spawn_SnappingStone{,Melee,Summon}
//  （ParticleOrchestrator.cs:593-812）Dust 段 1:1 入 vanillaDust 池（见
//  snapStrikeDust）。受击者自身脉冲（Projectile.cs:14432-
//  14437 victim.Center,num11=盒径/2 钳 100）已补（R4-33,蓝队）——victimBox 经 ctx 传。
//  ★B2②（2026-08-31）：命中尾 Item30/Item20/Item43 三连 PlaySound（Projectile.cs
//  :14453-14463 尾节拍,kind 分支各一声,零目标也播）已接线于 trySnapStrike 尾——
//  原「三音效同批登记未接」状态退役。节拍面澄清：尾三连是【每次触发一声】的原版
//  显式 PlaySound（decompiled 直证）；环带侧的命名轨音（L5 批在 snappingStoneRingFx
//  内接 Item_72/pyroclastic_stone/armlet_of_ruin 随逐弹 Spawn 播）与其为两处不同
//  节拍位,若两侧同源成立则并存非重复（orchestrator 源不在本反编译树,L5 批归属其批）。
//  ★F3 接线台账（蓝队四轮）：projectileSnapStrikeBonus 为弹幕侧统一双支入口；
//  971/975 飞行段原版本体即零伤害结算面（vanilla Damage() 无 971/975 特案,两弹型
//  也不在本仓任何结算站出现）⇒ "无可接面"判定维持留档,不接线。
import type { GameHooks } from '../entities/types';
import type { Player } from '../entities/Player';
import { Arrow } from '../entities/Arrow';
import { canBeChasedBy, pyroclastProjectileGate, snappingStoneProjectileGate } from '../entities/projTargets';
import type { ProjClass } from '../entities/projTargets';
import { canHit } from '../physics/LineOfSight';
// L5 长尾批（2026-08-31）：拍击石系三味 Spawn_ 环带+音效收编与 module8 上行
import { snappingStoneRingFx } from '../fx/orchestraFx';
import { ParticleOrchestraType } from '../net/syncModules';

export interface SnapStrikeTarget {
  id: number;
  x: number; y: number; w: number; h: number; cx: number; cy: number;
  dead: boolean;
  realLife?: number | null;
  onFire3T?: number;
  hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean;
}

/** ★F1/F2 上下文包（原位 C# ref-dmg / skipTargets / localNPCImmunity 的仓内投影） */
export interface SnapStrikeCtx {
  /** R4-33 受击者自脉冲（Projectile.cs:14432-37 victim.Center 盒径尘） */
  victimBox?: { w: number; h: number; cx: number; cy: number };
  /** F2 视线门 targeter 整盒（Collision.CanHit 首参原文实体盒形态；缺省 = 点盒
   *  (hx,hy,0,0) —— 仅测试桩与"触发锚即受击点"的面使用） */
  targeterBox?: { x: number; y: number; w: number; h: number };
  /** F2 localNPCImmunity[id]!=0 排除读面（真值 = 该敌仍在本弹免疫窗内,不可被选） */
  exclude?: (npcId: number) => boolean;
}

/** FindTargetWithLineOfSight（Projectile.cs:46474-46501）单次扫描：全程候选里取
 *  「skip/exclude 外 ∪ CanBeChasedBy ∪ 距离 < 当前收缩阈(STRICT) ∪ CanHit」的最小者。
 *  距离 = 中心距欧氏（:46490 targeter.Distance(nPC.Center)）。 */
function findTargetWithLineOfSight(
  game: GameHooks,
  hx: number,
  hy: number,
  maxRange: number,
  skip: ReadonlySet<number>,
  ctx: SnapStrikeCtx | undefined,
): SnapStrikeTarget | null {
  let bestDist = maxRange;                        // num 初值 = maxRange（:46477）
  let best: SnapStrikeTarget | null = null;       // result = -1 档（:46479）
  const tb = ctx?.targeterBox ?? { x: hx, y: hy, w: 0, h: 0 };
  for (const ent of game.enemies()) {
    if (!ent || typeof ent !== 'object') continue;
    const t = ent as unknown as SnapStrikeTarget;
    if (!t || t.dead || skip.has(t.id)) continue;            // ignoreTargets.Contains(:46481)
    if (!canBeChasedBy(ent)) continue;                       // CanBeChasedBy(targeter)（:46485）
    if (ctx?.exclude?.(t.id)) continue;                      // localNPCImmunity[i]!=0（:46487-89）
    const tcx = t.cx ?? t.x + t.w / 2;
    const tcy = t.cy ?? t.y + t.h / 2;
    const d = Math.hypot(tcx - hx, tcy - hy);
    if (!(d < bestDist)) continue;                           // num2 < num STRICT（:46492）
    // Collision.CanHit(targeter.position,w,h, nPC.position,w,h)（:46493 实体整盒形）
    if (!canHit(game.world.store, tb.x, tb.y, tb.w, tb.h, t.x, t.y, t.w, t.h)) continue;
    bestDist = d;                                            // 收缩阈值（:46494）
    best = t;
  }
  return best;
}

/** ★B2② 音高复合卷（LSP.cs:640 case2 default 支 Next(-6,7)×0.01 离散均匀 ±0.06 +
 *  LSP.cs:1417 尾部显式 pitchOffset 叠加,Clamp(-1,1) 域内无截断影响）。
 *  Main.rand.Next 整型均匀离散用 floor(rand×13)-6 重建同一支集（仓内 rand=连续 [0,1)
 *  惯例;13 态等概率）。独立小卷不进 Sfx 全局表——见尾节拍注的表污染论证。 */
function snapStrikeTailPitch(offset: number): number {
  return offset + (Math.floor(Math.random() * 13) - 6) * 0.01;
}

/** TryMakingSnappingStoneStrike（:14347-14465）。victim = 本次受击者（跳过）;
 *  返回并入本次命中实伤（防御前）的加伤 num14 终值（冷却拦下/门关 = 0）。
 *  F1 迁移注意：返回值不再是触发布尔——调用站必须消费（game.player 挥砍站把它并进
 *  DamageVar 滚前链,弹幕站并进 e.hurt 实伤参并按暴击态乘 2/1）。 */
export function trySnapStrike(
  game: GameHooks,
  owner: Player | null,
  kind: 0 | 1 | 2,
  hx: number,
  hy: number,
  victimId: number,
  ctx?: SnapStrikeCtx,
): number {
  if (!owner || owner.accSnappingStoneCooldown > 0) return 0;   // :14352-14354
  const eq = owner.equipStats;
  // 门：kind 对应饰品在身（调用侧已门,此处兜底）
  if (kind === 0 && !eq.accSnappingStone) return 0;
  if (kind === 1 && !eq.accPyroclast) return 0;
  if (kind === 2 && !eq.accArmletOfRuin) return 0;
  let dmg = 30;            // num（:14356）
  let maxRange = 120;      // maxRange
  const maxTargets = 2;    // num2
  let projId = 1121;
  let flatBase = 40;       // num3（加伤基座,:14363 缺省——kind0 不覆写）
  let flatMult = 1 + eq.dmgRanged;               // kind0 加伤乘区（:14446-14448 rangedDamage）
  if (kind === 0) {
    dmg = Math.trunc(30 * (1 + eq.dmgRanged));                    // ×rangedDamage（:14358）
  } else if (kind === 1) {
    dmg = Math.trunc(45 * (1 + eq.dmgMelee));                     // num=45 ×meleeDamage（:14360-14362）
    flatBase = 70;                                                // :14373
    flatMult = Math.max(1 + eq.dmgMelee, 1 + eq.dmgRanged);       // :14447-14451 max(melee,ranged)
    maxRange = 300;
    projId = 1131;
  } else {
    dmg = Math.trunc(150 * owner.summonDamageMult);               // num=150 ×minionDamage（:14364-14366）
    flatBase = 150;                                               // :14378
    flatMult = owner.summonDamageMult;                            // :14459-14461 minionDamage
    maxRange = 400;
    projId = 1132;
  }
  owner.accSnappingStoneCooldown = 360;                            // :14382-14383
  // ★F3 类旗现场定类（Projectile.cs:14414-14418）：flag2（kind1）支在 NewProjectile 后
  //  逐弹覆写 `bool flag4 = Main.player[owner].meleeCrit > Main.player[owner].rangedCrit;
  //  proj.melee = flag4; proj.ranged = !flag4` —— 弹 1131 SetDefaults 静态 melee=true
  //  （:10613-10624）但每次出射按持有者双 crit 现值重定类；弹 1121 静态 ranged=true
  //  （:10493-10504）/弹 1132 不设任何类旗（:10626-10637）原版均【无】翻旗。
  //  crit 掷随类旗走 Damage() 三连掷（:12906-12912，meleeCrit/rangedCrit 含基 4——
  //  Player.cs:2413/:18458），repo 无类旗弹不进掷臂 → 经 Arrow.critChance 注入同一
  //  概率并把决策以显式 projClass 字段钉在实体上（resolveProjClass 第一级=显式字段，
  //  后续消费面与数据面 static melee 一致性由本字段兜住）；1132 原版无类旗 = 恒不暴击
  //  （<0 阈值 → rand<threshold 恒假,Math.random() 抽取次数不变）。
  let strikeClass: ProjClass | null = null;
  let strikeCritPct = -0.01;                    // 负百分点 = 原版无掷档（1132）
  if (kind === 0) {
    strikeClass = 'ranged';                     // 1121 数据面同值（static ranged）
    strikeCritPct = 4 + owner.critChance('ranged');
  } else if (kind === 1) {
    const mC = owner.critChance('melee'), rC = owner.critChance('ranged');
    const meleeWin = mC > rC;                   // flag4（:14415）
    strikeClass = meleeWin ? 'melee' : 'ranged';
    strikeCritPct = 4 + (meleeWin ? mC : rC);
  }
  const add = (e: unknown) =>
    (game as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'projectiles');
  // ★F2 重构：skipTargets 表（victim 起表 :14381-83 → 每出一弹追加 :14426-27）+
  //  FindTargetWithLineOfSight 收缩语义（num8 循环每次全量重扫取最近,:14384-14428）。
  const skip = new Set<number>([victimId]);
  let strikes = 0;                              // num7
  for (let n = maxTargets; n > 0; n--) {        // for(num8=num2; num8>0; num8--)（:14385）
    const t = findTargetWithLineOfSight(game, hx, hy, maxRange, skip, ctx);
    if (!t) break;                              // num9 == -1 → break（:14388-90）
    strikes++;
    // NewProjectile(nPC.Center, UnitY*0.1, projId, dmg, kb 5) + timeLeft=2（:14413-14416）
    const pulse = new Arrow(t.cx, t.cy - 4, 0, 0.1, dmg, 5, projId, null,
      { grav: 0, life: 2, pierce: 1 });
    (pulse as { projClass?: ProjClass }).projClass = strikeClass ?? undefined;   // ★F3 :14414-14418
    pulse.critChance = Math.min(1, strikeCritPct / 100);   // 负值原样穿过=不暴击（1132 档）
    add(pulse);
    if (kind === 1) t.onFire3T = Math.max(t.onFire3T ?? 0, 3);     // AddBuff(323,180)=3s（:14399）
    // ★1457 编排器环带段（Spawn_SnappingStone{,Melee,Summon} :593/:649/:734——L5 长尾批
    //  收编:FadingParticle/PrettySparkle 环带+三味音 Item72/PyroclasticStone/ArmletOfRuin;
    //  原版载荷 = PositionInWorld=lerp(盒内随机点,Center,.6)、MovementVector=(num11×num12,
    //  出弹序号+1),本仓以目标中心+出弹序号近似锚）;clientOnly:false → module8 上行补远端。
    //  ★F3（2026-09-01）：num12 单掷落在载荷 X 上（:14429 halfDiag×(0.3+1.4r)）——
    //  环带/尘/广播三面共吃同一 msX（原版 Spawn_ 的 num=钳(X/256,≤.12) 环带与尘同源），
    //  尘段禁再掷 num12（曾本地尘另掷一次+远端 |X|/2 再掷 = 三面速度分裂）。
    {
      const halfDiag = Math.min(100, Math.hypot(t.w ?? 16, t.h ?? 16) / 2);  // num11 钳 100（:14430-31）
      const msX = halfDiag * (0.3 + 1.4 * Math.random());   // ×num12（:14429）= 载荷 X 原值
      snappingStoneRingFx(game, kind, t.cx, t.cy, msX, strikes);
      game.broadcastParticleOrchestra?.(
        kind === 0 ? ParticleOrchestraType.SnappingStone
          : kind === 1 ? ParticleOrchestraType.SnappingStoneMelee
            : ParticleOrchestraType.SnappingStoneSummon,
        t.cx, t.cy, msX, strikes);
      snapStrikeDust(game, kind, t.cx, t.cy, msX);          // 载荷直用（尘段内钳(X/256,.12)）
    }
    skip.add(t.id);                             // skipTargets.Add(num9)（:14425-27）
  }
  // R4-33（Projectile.cs:14432-14437）：受击者自身也发一次脉冲——载荷 X = 盒对角
  // Length()/2 裸值【无钳无 num12 掷】（:14434-36），尘段同值直用（★F3,与广播共 vh）
  if (ctx?.victimBox) {
    const vh = Math.hypot(ctx.victimBox.w, ctx.victimBox.h) / 2;
    snapStrikeDust(game, kind, ctx.victimBox.cx, ctx.victimBox.cy, vh);
    // R4-33 自脉冲面同款广播（★2026-09-01 载荷对齐原文 :14431-14437：X=盒对角
    //   Length()/2 原值【无钳无掷】、Y=0=零延迟拍——曾错传 ×(0.3+1.4r) 掷幅 +
    //   Y=maxTargets 延迟档；延迟仅属出弹链 num7+1 :14429）
    game.broadcastParticleOrchestra?.(
      kind === 0 ? ParticleOrchestraType.SnappingStone
        : kind === 1 ? ParticleOrchestraType.SnappingStoneMelee
          : ParticleOrchestraType.SnappingStoneSummon,
      ctx.victimBox.cx, ctx.victimBox.cy, vh, 0);
  }
  // ★F1 加伤链（:14442-14457）——零目标也照样给满额漏配（num13 = 2 − num7）：
  //   `(int)((float)num14 ×乘区)` 为 C# float 乘后截断；f64/f32 双精度在常规乘区
  //   量程同值（乘区非 2 幂边界的次常差异域备案），沿用仓内截断惯例。
  const misses = maxTargets - strikes;          // num13（:14442,≤上限恒非负）
  const bonus = Math.trunc((flatBase + 10 * misses) * flatMult);   // num14 = num3 + num4*num13（:14443）
  if (kind === 1) {                             // victim.AddBuff(323,180)=3s（:14444 受击者本体）
    const vic = (game.enemies() as unknown as SnapStrikeTarget[])
      .find((t) => t?.id === victimId && !t.dead);
    if (vic) vic.onFire3T = Math.max(vic.onFire3T ?? 0, 3);
  }
  // ★B2②（2026-08-31）命中尾三音效接线：三连 PlaySound 是本函数【尾节拍】——扫描/
  //   加伤/上 buff 之后按 kind 分支各发一声（Projectile.cs:14453-14463）：拍击石
  //   Item30(pitchOffset .3)/焰爆石 Item20(pitchOffset .08)/毁灭臂镗 Item43
  //   (pitchOffset .3)，vol=原版 volumeScale(0.08/满响/0.08——:14458 第三实参是
  //   pitchOffset 非音量，重载序 SoundEngine.cs:88)。位置 = Main.player[owner]
  //   MountedCenter；冷却内不进函数、门关不进函数，零目标照样播（原文无条件尾段）。
  //   音高复合 = LSP case2 默认抖动 Next(-6,7)×0.01（LegacySoundPlayer.cs:640 default 支,
  //   style 20/30/43 均无特例）+ 原文 pitchOffset 尾部叠加（LSP.cs:1417 Instance.Pitch
  //   += offset）→ 本地合卷经【显式】pitch 直传：playWavFile 显式参跳 PITCH_CASE 表，
  //   故不吃全局 Item 表抖动——严禁改成表登记（PITCH/FILE_CASE_VOL 键全局共享,
  //   Item_20/43 是多件武器 UseSound 同文件,表改会毒化全武器库音色）。
  const ocx = owner.mountedCenter.x, ocy = owner.mountedCenter.y;
  if (kind === 0) {
    game.playSfxWav?.('Item_30', 0.08, ocx, ocy, snapStrikeTailPitch(0.3));
  } else if (kind === 1) {
    game.playSfxWav?.('Item_20', 1, ocx, ocy, snapStrikeTailPitch(0.08));
  } else {
    game.playSfxWav?.('Item_43', 0.08, ocx, ocy, snapStrikeTailPitch(0.3));
  }
  return bonus;                                 // dmg += num14（:14457 由调用站并入实伤参）
}

/** ★F3 弹幕侧统一双支入口（Projectile.Damage_PVE_Inner :13439-13446 书写序的仓内单源，
 *  2026-08-31 蓝队四轮收编——此前 Arrow.dealContacts 的 kind0 内联手搓口径撤销、
 *  各新站一律经本函数接入，禁止散写 projectileData 类位查表）：
 *   支1 kind1 焰爆石门 pyroclastProjectileGate（melee|ranged ∧ accPyroclast）；
 *   支2 kind0 拍击石门 snappingStoneProjectileGate（ranged ∧ accSnappingStone）。
 *  两支共用 360t 冷却 ⇒ 同帧至多一支实触发；返回两次触发的加伤和（冷却/门关 = 0），
 *  调用站并入本次 e.hurt 实伤参（防御前,不吃攻端旗乘区,见 trySnapStrike 迁移注）。 */
export function projectileSnapStrikeBonus(
  game: GameHooks,
  host: { hostile?: boolean; projClass?: ProjClass; projId?: number; meleeProj?: boolean } | null | undefined,
  hx: number,
  hy: number,
  victimId: number,
  ctx?: SnapStrikeCtx,
): number {
  if (!host || host.hostile === true) return 0;            // ownedBySomeone 档
  let bonus = 0;
  if (pyroclastProjectileGate(game, host)) {
    bonus += trySnapStrike(game, game.player, 1, hx, hy, victimId, ctx);       // :13439-42
  }
  if (snappingStoneProjectileGate(game, host)) {
    bonus += trySnapStrike(game, game.player, 0, hx, hy, victimId, ctx);       // :13443-46
  }
  return bonus;
}

/**
 * ★1457 拍击石系命中尘（ParticleOrchestrator.cs 三 Spawn 的 Dust 段 1:1；
 *  编排器粒子类型 FadingParticle/PrettySparkle 本仓无池,环带视觉登记未接）：
 *  mvX 形参 = 编排载荷 MovementVector.X 原值【已含出弹端 num12 单掷】,禁在尘段
 *  复掷/再除（★F3 2026-09-01,Projectile.cs:14429-31 num11×num12/受击者拍 :14434-36
 *  num11 裸值——本地/远端/环带三面共吃同一 X,消费式唯一 = num=钳(X/256,≤0.12)）：
 *  kind0 拍击石（:593-646）num=钳(MovementVector.X/256,≤0.12)——20 颗 2/3→226
 *  否则 15,velocity×64num,noGravity,scale1,fadeIn 1.5→0,noLight;226 再 ×0.5 速、
 *  1/6 恢复重力再 ×0.5 速、noLightEmittance;
 *  kind1 焰爆石（:649-732）4 颗 6 沿 ±bolt 向 ±0.025·2π·rand 旋转 ×NextFloat 速,
 *  noGravity scale1.4（bolt 基角 = NextFloatDirection×2π×0.05 + π/4·(1|2)）;
 *  kind2 毁灭臂镗（:734-812）15 颗 172 + 8 颗 211,Circular(10,10) 速,
 *  scale=max(0.75,20num),noGravity,1/6 重力 + scale×0.25
 */
export function snapStrikeDust(game: GameHooks, kind: 0 | 1 | 2, x: number, y: number, mvX: number): void {
  const pool = game.vanillaDust;
  if (!pool) return;
  const rand = Math.random;
  if (kind === 0) {
    const num = Math.min(0.12, mvX / 256);   // :600-605（X 原值直入——num11 钳 100 已在出弹端 :14430-31）
    for (let j = 0; j < 20; j++) {
      const chloro = Math.floor(rand() * 3) !== 0;                 // Next(3)!=0 → 226
      const d = pool.spawn(x, y, 0, 0, chloro ? 226 : 15);
      if (!d) continue;
      d.vx *= 64 * num;                                            // :633 velocity *= 64f*num
      d.vy *= 64 * num;
      d.noGravity = true;
      d.scale = 1;
      d.fadeIn = 0;                                                // :636-638 终值 0（1.5 被覆写）
      d.noLight = true;
      if (chloro) {                                                // :639-647
        d.vx *= 0.5;
        d.vy *= 0.5;
        if (Math.floor(rand() * 6) === 0) {
          d.noGravity = false;
          d.vx *= 0.5;
          d.vy *= 0.5;
        }
        d.noLightEmittance = true;
      }
    }
    return;
  }
  if (kind === 1) {
    const base = (rand() * 2 - 1) * Math.PI * 2 * 0.05;            // :665 num4
    for (let n = 1; n < 2; n++) {                                  // :668 num5 单值 1
      const dir = Math.PI / 4 + Math.PI / 4 * n + base;            // vector3 角
      for (let i = 0; i < 2; i++) {                                // :722-731 双向各 2 颗
        for (const s of [1, -1]) {
          const a = dir * s + (rand() * 2 - 1) * Math.PI * 2 * 0.025;
          const d = pool.spawn(x, y, 0, 0, 6, Math.cos(a) * rand(), Math.sin(a) * rand());
          if (!d) continue;
          d.noGravity = true;
          d.scale = 1.4;
        }
      }
    }
    return;
  }
  // kind2：num = 1→钳 0.12（:738/:743-745 反编译字面）→ scale = max(0.75, 2.4)
  for (const [count, type] of [[15, 172], [8, 211]] as const) {    // :779-812
    for (let k = 0; k < count; k++) {
      const d = pool.spawn(x, y, 0, 0, type,
        (rand() * 2 - 1) * 10, (rand() * 2 - 1) * 10);             // NextVector2Circular(10,10)
      if (!d) continue;
      d.scale = Math.max(0.75, 20 * 0.12);
      d.noGravity = true;
      if (Math.floor(rand() * 6) === 0) {
        d.noGravity = false;
        d.scale *= 0.25;
      }
    }
  }
}
