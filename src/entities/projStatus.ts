// 投射物命中 → 敌怪 debuff(Projectile.StatusNPC 1:1,Projectile.cs:10555-11065;
// 由 StrikeNPC:12757 每次命中敌怪后调用)。表由 tools/extract-projstatus.mjs 从
// Terarria1456 源码提取:{"<projType>": [{buff, chance, durMin, durMax, src, gate?}]}(tick)。
// 复杂形状已入表并带 gate 标记(2026-08-13 G7):
//   · 'ai1==i' 定向 tag(598/636/971/975/614)——StrikeNPC :12421 先写 ai[1]=victimIndex
//     再调 StatusNPC → 首击恒真;repo 附着弹无追踪态,单次命中等价恒真,直接施加
//   · 'setHuntressT2' 套装门(694-696)——运行时校验 ctx.setHuntressT2(Player.equipStats)
//   · 'remixWorld→N'(15/954/979)/'ai0==1→N'(85)——秘密种子/附着态未跟踪,
//     取基档(else 档)生效,另一档登记偏差
// 提取器仍 SKIP 的三块为"无 type==N"运行时配件门:meleeEnchant(:10558)→applyMeleeImbue、
// frostBurn(:10862)→applyFrostBurn、magmaStone(:10866)→applyMagmaStoneProj。
import { npcImmuneTo } from '../data/vanillaNpcImmunity';
import tableJson from '../data/vanilla-projstatus.json';
import { BuffType } from '../stats/Buffs';

/** mut=互斥组 id(StatusNPC if/else 双分支:单掷骰二选一必中其一,
 *  组内按累积 chance 扫描——两条独立掷骰会让双落空/双中,2026-08-13 修正)
 *  src=StatusNPC 源码行号(提取器锚);gate=原版条件门档记(见文件头) */
interface StatusEntry { buff: number; chance: number; durMin: number; durMax: number; mut?: number; src?: number; gate?: string }
export const TABLE = tableJson as unknown as Record<string, StatusEntry[]>;

/** Enemy 侧已实装的 buff 字段(秒)。效果对照(全部回源 NPC.cs UpdateNPC_BuffApplyDOTs
 *  :92577 起,lifeRegen 单位=2×HP/s;受击穿甲在 checkArmorPenetration :81912) */
const SUPPORTED: Record<number, string> = {
  24: 'onFireT',     // On Fire!(onFire,:92616-92630;-8 = 4 HP/s)
  20: 'poisonT',     // Poisoned(:92584-92591;-12 → 6 HP/s)
  70: 'venomT',      // Venom(:92703-92710;-60 → 30 HP/s)
  39: 'cursedT',     // Cursed Inferno(onFire2,:92684-92695;-48 → 24 HP/s)
  31: 'confusedT',   // Confused(TargetClosest direction 反转,:78569)
  69: 'ichorT',      // Ichor(NPC 侧=checkArmorPenetration :81916 armorPenetration+15 进
  //   共享池,非独立直伤也非防直减;玩家侧 Ichor 才是 statDefense-15,Player.cs:9756-9758)
  //   Enemy.hurt 已接 npcCheckArmorPenetration 原版序(2026-08-15):池/2 加伤→
  //   再减 def/2,Projectile.cs:12796-12808 + Main.cs:65626
  72: 'midasT',      // Midas(掉钱 ×1.10-1.51,Enemy.ts rollCoins)
  44: 'frostburnT',    // Frostburn(onFrostBurn,:92648-92661;-16 → 8 HP/s)
  324: 'frostburn2T',  // Frostburn2(:92668-92680;-50 → 25 HP/s)
  323: 'onFire3T',     // OnFire3(:92632-92644;-30 → 15 HP/s)
  153: 'shadowFlameT', // ShadowFlame(:92712-92724;-30 → 15 HP/s)
  204: 'oiledT',       // Oiled:六火系在身时再叠 -50 = +25 HP/s(:92728-92737)
  36: 'brokenArmorT',  // BrokenArmor:受击无视 20 防(:81919-81921)
  203: 'betsysCurseT', // BetsysCurse:受击无视 40 防(:81922-81924)
  189: 'daybreakT',    // Daybreak:层数模型已接(:92807-92830 层数×100HP/s,零层兜底 1;
  //   层数 = WeaponProj.daybreakStacks 场上附着 636 计数,Enemy 侧消费)
  30: 'bleedT',        // Bleeding(:92592-92601;-24 = 12 HP/s)
  137: 'slimedT',      // Slimed(drippingSlime):六火系 DoT 翻倍(:92623 等 6 处)
  375: 'hemorrhageT',  // Hemorrhage(:92604-92611;-200 = 100 HP/s)
  169: 'javelinT',     // BoneJavelin:层数模型已接(3 HP/s/层×附着 598 计数,
  //   :92740-92758;层池=Enemy.addStickerStack,cap 6)
  337: 'spikeT',       // TentacleSpike:层数模型已接(3 HP/s/层,:92761-92779;无上限)
  344: 'butcherT',     // BloodButcherer:层数模型已接(4 HP/s/层,:92786-92804;无上限)
  151: 'soulDrainT',   // SoulDrain:25 HP/s(:92927-92935,-50;魂镰 3006 联动登记 GAP)
  183: 'stardustT',    // StardustBleed:层数模型已接(20 HP/s/层,:92846-92863;
  //   层池 cap 10;MinionProj 613 星尘细胞→614 已在仓,弹命中即经本表入层)
  // ---- 1457 新敌怪 debuff 家族（BuffID.cs:961-971；DoT/视觉在 Enemy.fixedUpdate
  //      DOTTally 等价段,1457 NPC.cs:92746-92800）----
  395: 'potentAcidT',        // PotentAcid:90 HP/s(AddPoison(180,60),:92751;可被 398 加速)
  397: 'chlorophyteSporeT',  // ChlorophyteSpore:90 HP/s(:92755;+孢子云/叶尘 VFX)
  398: 'acceleratePoisonsT', // AcceleratePoisons:可加速族 DoT ×2(:92840-92847)
  399: 'blueLightningT',     // BlueLightning:纯视觉(BlueLightningSmall 1/10,:92274)
  400: 'redLightningT',      // RedLightning:纯视觉(RedLightningSmall 1/10,:92281)
  362: 'eelWhipT',           // EelWhipNPCDebuff(markedByEelWhip):50 HP/s 平铺 DoT
  //   （1457 :92781 Add(100,50)——链式缩放/标记玩家数/链电粒子全删,ApplyEelWhipDoT
  //   成死代码;施加源 = 鞭 1033 ApplyWhipDebuffs）
};

type StatusEnemy = { [field: string]: number | undefined };

/** 运行时门上下文(对应表内 gate 标记;缺省 = 门条件按"可施加"处理) */
export interface ProjStatusCtx {
  /** setHuntressT2(女猎手 T2/T3 套装,Player.cs:16119/16149)——爆炸机关弹 694-696
   *  的 Oiled 门(StatusNPC :10786)。由调用方从 Player.equipStats.huntressT2 传入 */
  setHuntressT2?: boolean;
  /** 催化指环 6185（Player.catalystBand :1961）——任意弹命中 398 AcceleratePoisons
   *  300t（Projectile.StatusNPC :11189-11193 + Player 侧 :6534-6537）。提取器 SKIP
   *  档（运行时饰品门无 type==N），代码层并表 */
  catalystBand?: boolean;
  /** 毒刺 6165/6184/6185（accPoisonBarb :1223）——箭体命中 100% 中毒 90t
   *  （StatusNPC :11183-11188,`arrow && !noEnchantments` 门）。箭侧调用方
   *  （Arrow.ts,批 C 域）未接,登记 */
  accPoisonBarb?: boolean;
}

/** 命中结算侧调用:按投射物型号掷骰并施加 debuff(AddBuff max 合并语义)。
 *  duration 掷骰 Next(durMin, durMax+1) tick → 秒(/60)。
 *  同 mut 组 = 互斥分支(单掷骰按累积概率选一,必中其一或全落空) */
/** 1457 提取器 SKIP 档手补（Terarria1457 Projectile.cs:11453-11457）:
 *  549 永恒水晶弹新增 Venom(70) 120t——`int time3 = 120; AddBuff(70, time3)`
 *  局部变量时长表达式提取器不识别（SKIP 名单在案），按源码钉值代码层并表 */
const PROJ_STATUS_1457_HANDPATCH: Record<number, StatusEntry[]> = {
  549: [{ buff: 70, chance: 1, durMin: 120, durMax: 120, src: 11456 }],
};

export function applyProjStatus(projId: number | undefined, enemy: StatusEnemy, ctx?: ProjStatusCtx): void {
  if (projId === undefined || projId < 0) return;
  // 催化指环 6185（StatusNPC :11189-11193）：任意命中 398 AcceleratePoisons 300t=5s
  //（无弹型门;398 ∈ SUPPORTED acceleratePoisonsT——可加速族 DoT ×2 消费在 Enemy DOTTally）
  if (ctx?.catalystBand) {
    if (5 > (enemy.acceleratePoisonsT ?? 0)) enemy.acceleratePoisonsT = 5;
  }
  const entries = TABLE[String(projId)] ?? PROJ_STATUS_1457_HANDPATCH[projId];
  if (!entries) return;
  let pendingMut: { id: number; roll: number } | null = null;
  for (const en of entries) {
    // 运行时门:setHuntressT2 未穿套装 → 该条不施加(其余 gate 档已按基档并入,
    //  见文件头注释,不拦)
    if (en.gate === 'setHuntressT2' && !ctx?.setHuntressT2) continue;
    let hit: boolean;
    if (en.mut !== undefined) {
      // 互斥组:同组共用一次掷骰,按累积 chance 区间判定本条是否被选中
      if (!pendingMut || pendingMut.id !== en.mut) pendingMut = { id: en.mut, roll: Math.random() };
      let lo = 0;
      hit = false;
      for (const g of entries) {
        if (g.mut !== en.mut) continue;
        const hi = lo + g.chance;
        if (g === en) { hit = pendingMut.roll >= lo && pendingMut.roll < hi; break; }
        lo = hi;
      }
    } else {
      hit = Math.random() < en.chance;
    }
    if (!hit) continue;
    // NPC buffImmune 门（NPC.cs:90968 AddBuff 免疫即 return + NPCID.Sets
    // .DebuffImmunitySets 派生——2026-08-13 D5）。1457 AI_001 熔岩史莱姆段
    // （:61312-61316）对 70/397/395/20 运行时置 buffImmune=false——实例级覆写位
    // （Enemy.debuffImmuneOverride）优先于静态表
    const vId = (enemy as { vanillaId?: number }).vanillaId;
    const override = (enemy as { debuffImmuneOverride?: Map<number, boolean> }).debuffImmuneOverride;
    if (override?.get(en.buff) === false) {
      // 运行时豁免（原版运行时复位语义）：跳过静态免疫表
    } else if (vId !== undefined && vId > 0 && npcImmuneTo(vId, en.buff)) continue;
    const field = SUPPORTED[en.buff];
    if (!field) continue; // 未实装 buff,登记见上
    const ticks = en.durMin + Math.floor(Math.random() * (en.durMax - en.durMin + 1));
    const sec = ticks / 60;
    const cur = enemy[field] ?? 0;
    if (sec > cur) enemy[field] = sec;
    // 贴附族层数登记（NPC.cs:92740-92863 层数=场上附着弹计数）：169/183/337/344
    // 每次施加=一枚贴附弹入池——层寿命=本处 buff 时长（与贴附弹 60×num11 AI 次
    // 寿命等长），Enemy.fixedUpdate 按层×单层 HP/s 结算；上限（KillOldestJavelin
    // :13019-13030：598=6/614=10）在 Enemy.addStickerStack 内执行。
    // 189 Daybreak 走 WeaponProj.daybreakStacks 活计数（有实体），不入此链
    if (en.buff === 169 || en.buff === 183 || en.buff === 337 || en.buff === 344) {
      (enemy as { addStickerStack?: (b: 169 | 183 | 337 | 344, d: number) => void })
        .addStickerStack?.(en.buff, sec);
    }
  }
}

/** 武器浸剂对【投射物近战族】的命中施加（StatusNPC:10559-10583 开头段:
 *  (melee||whip) && meleeEnchant>0 → 按药剂施加。近战挥砍侧同表在
 *  Game.ts 挥击结算内,此函数供 WeaponProj 四族(链球/悠悠球/长矛/回旋镖)共用)。
 *  时长 = Player.cs:6141-6171 Next(a,b) 秒,max 合并 */
/** 冰霜盔甲引擎(StatusNPC :93712-93716):(melee||ranged) 命中且套装在身 →
 *  AddBuff(324 Frostburn2, 60×Next(5,15) tick=5-14s,max 合并)。
 *  魔法/召唤弹不吃。三挂点:挥砍(Game)/WeaponProj 近战四族/远程箭 */
export function applyFrostBurn(frostBurn: boolean, enemy: StatusEnemy): void {
  if (!frostBurn) return;
  const sec = 5 + Math.floor(Math.random() * 11); // 60×Next(5,15)t
  if (sec > (enemy.frostburn2T ?? 0)) enemy.frostburn2T = sec;
}

/** 岩浆石/火焰护手——近战【弹幕】命中（StatusNPC :10866-10869：melee 门，
 *  1/7 → OnFire3 360t=6s）。挥砍侧是另一公式（applyMagmaStoneSwing） */
export function applyMagmaStoneProj(magmaStone: boolean, enemy: StatusEnemy): void {
  if (!magmaStone || Math.random() >= 1 / 7) return;
  if (6 > (enemy.onFire3T ?? 0)) enemy.onFire3T = 6;
}

/** 岩浆石/火焰护手——近战【挥砍】命中（Player.cs:6184-6198 三段掷）：
 *  1/4 → 360t=6s；否则 1/2 → 240t=4s；否则 60t=1s */
export function applyMagmaStoneSwing(magmaStone: boolean, enemy: StatusEnemy): void {
  if (!magmaStone) return;
  const r = Math.random();
  const sec = r < 0.25 ? 6 : r < 0.625 ? 4 : 1;
  if (sec > (enemy.onFire3T ?? 0)) enemy.onFire3T = sec;
}

export function applyMeleeImbue(
  buffs: { has: (b: never) => boolean },
  enemy: StatusEnemy,
  partyFx?: () => void,
): void {
  const has = (bt: BuffType): boolean => buffs.has(bt as unknown as never);
  const max = (field: string, v: number): void => {
    if (v > (enemy[field] ?? 0)) enemy[field] = v;
  };
  if (has(BuffType.ImbueVenom)) {
    max('venomT', 5 + Math.random() * 5);
    // 1457 StatusNPC :11201-11204：毒液浸剂命中伴发 AddBuff(395 PotentAcid, 60t=1s)
    max('potentAcidT', 1);
  }
  if (has(BuffType.ImbueCursed)) max('cursedT', 3 + Math.random() * 4);
  if (has(BuffType.ImbueFire)) max('onFireT', 3 + Math.random() * 4);
  if (has(BuffType.ImbueGold)) max('midasT', 2);
  if (has(BuffType.ImbueIchor)) max('ichorT', 10 + Math.random() * 10);
  if (has(BuffType.ImbueNano)) max('confusedT', 1 + Math.random() * 3);
  if (has(BuffType.ImbuePoison)) max('poisonT', 5 + Math.random() * 5);
  if (has(BuffType.ImbueParty)) partyFx?.();
}

/** NPC.checkArmorPenetration 1:1 纯函数（NPC.cs:81913-81938）。
 *  原版语义：返回值是【加到伤害上的加成】（StrikeNPC :12808 num12 += 本值，
 *  之后 CalculateDamageNPCsTake 才减 def/2——Main.cs:65626-65635），等价于
 *  有效防 = def − min(pool, def)。pool 单池累加（无"每层独立"档）：
 *    armorPenetration（StrikeNPC :12068 = 玩家 GetArmorPenetration(melee) +
 *    弹幕自带 armorPenetration——数据层 vanillaProjectiles.armorPenetration）
 *    + ichor 15（:81916）+ brokenArmor 20（:81919）+ betsysCurse 40（:81922）
 *    + (int)(defense × armorPenetrationPercent)（:81927，闪电光环 688/690 传 1）。
 *  早退：pool ≤ 0 或 defense ≤ 0 → 0（负防/零防不吃穿甲加成）；
 *  超防钳制：pool > defense → defense/2（加成永不把伤害推过全额）。
 *  已接线（2026-08-15）：Enemy.hurt = max(1, round(dmg + 本值 − def×0.5))
 *  原版序（Projectile.cs:12796-12808 → Main.cs:65626 CalculateDamageNPCsTake） */
export function npcCheckArmorPenetration(
  defense: number,
  armorPenetration: number,
  armorPenetrationPercent = 0,
  flags: { ichor?: boolean; brokenArmor?: boolean; betsysCurse?: boolean } = {},
): number {
  let pen = armorPenetration | 0;
  if (flags.ichor) pen += 15;             // NPC.cs:81916
  if (flags.brokenArmor) pen += 20;       // :81919
  if (flags.betsysCurse) pen += 40;       // :81922
  pen += Math.trunc(defense * armorPenetrationPercent); // :81927 (int) 截断
  if (pen <= 0 || defense <= 0) return 0; // :81929
  if (pen > defense) return (defense / 2) | 0; // :81933 整除
  return (pen / 2) | 0;                   // :81935 整除
}
