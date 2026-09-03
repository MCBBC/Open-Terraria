// 原版物品战斗数据（tools/extract-itemcombat.mjs 从 Terarria1456 Item.cs SetDefaults 提取）：
// damage/knockBack/useTime/useAnimation/shoot/useAmmo/shootSpeed/ammo/consumable/noMelee/autoReuse/mana
import combatJson from './vanilla-itemcombat.json';
import { projectileData, AI_ANCHORED, AI_BOOMERANG, AI_FLAIL, AI_GLOWSTICK, AI_GRENADE, AI_SPEAR, AI_SHORTSWORD, AI_THROWN, AI_YOYO } from './vanillaProjectiles';
import { activeVariantStatsOfVid } from './vanillaItemVariants';

export interface ItemCombat {
  damage?: number;
  crit?: number;           // Item.crit（武器自带暴击，GetWeaponCrit P:25230-25232 消费）
  knockBack?: number;
  useTime?: number;
  useAnimation?: number;
  shoot?: number;
  useAmmo?: number;
  shootSpeed?: number;
  ammo?: number;
  consumable?: boolean;
  noMelee?: boolean;
  autoReuse?: boolean;
  mana?: number;
  melee?: boolean;
  ranged?: boolean;
  magic?: boolean;
  summon?: boolean;
  /** Item.cs useTurn=true（3504 件：工具/食物/可放置族；显式 `useTurn = true` 1399 行经
   *  贯穿组/区间 if/DefaultTo* 族展开后的逐物品计数；武器缺省 false）——itemAnimation
   *  窗内移动改向豁免（:19546）。2026-08-17 提取器三通道回填 */
  useTurn?: boolean;
  /** Item.cs noUseGraphic=true（381 件：矛/炸弹/鞭/投掷/捕获小动物/电锯族——使用期间
   *  不画手持贴图，投射物即本体）。对照 Game.NO_USE_GRAPHIC_VIDS 手工小表（其 7 件
   *  全含于本列），消费侧换表另批 */
  noUseGraphic?: boolean;
}

const RAW = combatJson as unknown as Record<string, ItemCombat>;

// ---- 鞭系（DefaultToWhip 提取，Item.cs SetDefaults switch 共 18 把）----
// ★2026-08-23 基准切换 1457：json 已载 1457 终值（whips[5477] 花鞭 50/whips[5688]
// 史莱姆鞭 15/combat[4607] 沙漠虎杖 kb 2.5），recon 闸门 DRIFT=0。旧"手钉 1456 值"
// 注释作废（曾以 1456 为准钉 75/12/4,白名单已随基准切换删除）。
import whipsJson from './vanilla-whips.json';
const WHIPS = whipsJson as unknown as Record<string, { proj: number; dmg: number; kb: number; speed: number; anim: number }>;

// ---- 提取缺口补丁（tools/extract-itemcombat.mjs 只解析 case 内字面赋值）----
// DefaultToSpear/DefaultToStaff/DefaultToMagicWeapon/DefaultToRangedWeapon 的形参
// 赋值（Item.cs:47630/:48045/:48057）漏提：4347/4348/5629 仅剩 damage/knockBack、
// 4788-4790（剑矛三件 DefaultToSpear+SetWeaponValues）与 4060-4062 整条缺失。
// 下表按源码 case 逐件 1:1（:35651/:35672/:37119/:39341-39353/:44212）：
//   DefaultToSpear → useStyle5 / useTime=useAnimation=animationTime / shootSpeed=push / noMelee+melee
//   DefaultToStaff → magic / autoReuse / mana=manaPerShot / UseSound43
//   DefaultToMagicWeapon → magic / noMelee / useTime=useAnimation=singleShotTime
//   DefaultToRangedWeapon → noMelee / ranged / useAmmo=ammoID（5629 随后 ranged=false 已在表内）
//   （4703 四管霰弹枪 :38629 同款漏提——已直接回填 json 键"4703"，2026-08-22 移出本表）
const EXTRACT_PATCH: Record<string, Partial<ItemCombat>> = {
  '4060': { shoot: 728, useAmmo: 75, useTime: 18, useAnimation: 18, shootSpeed: 20, damage: 60, knockBack: 5, noMelee: true, ranged: true, autoReuse: true },
  '4061': { shoot: 730, useTime: 28, useAnimation: 28, shootSpeed: 3.5, damage: 14, knockBack: 6, noMelee: true, melee: true },
  '4062': { shoot: 731, useTime: 17, useAnimation: 17, shootSpeed: 8, mana: 6, damage: 24, knockBack: 3, noMelee: true, magic: true, autoReuse: true },
  '4347': { shoot: 876, useTime: 36, useAnimation: 36, shootSpeed: 15, noMelee: true, magic: true },
  '4348': { shoot: 876, useTime: 36, useAnimation: 36, shootSpeed: 15, noMelee: true, magic: true },
  '4788': { shoot: 877, useTime: 24, useAnimation: 24, shootSpeed: 3.5, damage: 60, knockBack: 12, noMelee: true, melee: true },
  '4789': { shoot: 878, useTime: 24, useAnimation: 24, shootSpeed: 3.5, damage: 130, knockBack: 14, noMelee: true, melee: true },
  '4790': { shoot: 879, useTime: 24, useAnimation: 24, shootSpeed: 3.5, damage: 90, knockBack: 13, noMelee: true, melee: true },
  '5629': { shoot: 1088, useAmmo: 27, useTime: 20, useAnimation: 20, shootSpeed: 10, noMelee: true, autoReuse: true },
  // ---- 七金属短剑 SetDefaults1(6) 模板漏提(Item.cs:1377-1392;2026-08-13
  //   "铜剑变投掷"根因:shootSpeed 缺→默认 8→位移 120px 像丢剑;autoReuse 应 false;
  //   noMelee 应 true。铁短剑 item 6 自带全量(不走模板)不受影响) ----
  '3483': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  '3489': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  '3495': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  '3501': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  '3507': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  '3513': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  '3519': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  // ---- 血腥锤斧 4317（Item.cs:36950-36964）SetWeaponValues(30, 7f) 形参赋值
  //   提取器不解析 → damage/knockBack 双缺。F1 工具节奏修复（2026-08-22）把
  //   combat.damage/knockBack 桥进 def.tool——缺省会让挥击伤/词缀乘区回落 1/3 ----
  '4317': { damage: 30, knockBack: 7 },
  // ---- 湿/干/土制炸弹族（Item.cs:39461-39473 / :39787-39799 共享 case 段算式
  //   `shoot = 903 + (type - 4824)` / `shoot = 910 + (type - 4908)` 提取器不解析字面量
  //   → 缺 shoot 整族死路径。此处按源码算式逐件回填（4824-4827→903-906，
  //   4908/4909→910/911）。★noMelee 非 1456 SetDefaults 字面（该两段未置），
  //   此处作 combatWeapon `consumable && noMelee` 爆炸物门的派发等价门：
  //   原版族 damage 缺省 0 + noUseGraphic=true，近战面 0 伤，语义相同 ----
  '4824': { shoot: 903, noMelee: true },
  '4825': { shoot: 904, noMelee: true },
  '4826': { shoot: 905, noMelee: true },
  '4827': { shoot: 906, noMelee: true },
  '4908': { shoot: 910, noMelee: true },
  '4909': { shoot: 911, noMelee: true },
  // ---- 甲虫炸弹 4423（Item.cs case 4423 :37462-37474,1457/1458 同锚——useStyle1/
  //   shootSpeed5/shoot773/20×20/UseSound Item1/consumable/useAnim=useTime25/
  //   noUseGraphic）——与湿/干土制炸弹同型缺口：SetDefaults【无】noMelee 字面行,
  //   extract json 缺该标志 → combatWeapon 返 null + thrownCombat 把 773 射成箭体。
  //   补 combatWeapon `consumable && noMelee` 爆炸物门派发等价门 → aiStyle16 归
  //   grenade 族（B2 波 2026-08-30；近战面 damage 缺省 0+noUseGraphic,语义等价）----
  '4423': { noMelee: true },
  // ---- SW-E1 2026-09-03：Power Bomb 5594 / Sticky Power Bomb 5595（Item.cs case
  //   5594/5595 :44024-44028，1457 原文）——`DefaultToBomb(1086+(type-5594), 6f)`
  //   共享算式提取器整块不解析（json 只落了 noUseGraphic 残键）→ 死物品。DefaultToBomb
  //   （:47771-47783）推导终值：useStyle1/shootSpeed6/shoot=1086|1087/8×28/consumable/
  //   UseSound Item1/useAnim=useTime40/noUseGraphic/noMelee；damage/knockBack 缺省 0
  //   （爆炸伤/击退在 PrepareBombToBlow P.cs:47652-47657 补 200/9）；SetShopValues
  //   LightRed4+sell 2s（rare4 已在 vanilla-itemrare.json）。弹 1086/1087 aiStyle16
  //   （vanilla-projectiles.json 已有）→ consumable+noMelee 门归 grenade 族 ----
  '5594': { shoot: 1086, shootSpeed: 6, useTime: 40, useAnimation: 40, consumable: true, noMelee: true, noUseGraphic: true },
  '5595': { shoot: 1087, shootSpeed: 6, useTime: 40, useAnimation: 40, consumable: true, noMelee: true, noUseGraphic: true },
  // （5334 奥库瑞姆剃刀 consumable/useTime 45 已移出本表——Item.cs:42279-42285
  //   在 `Variant == EnabledVariant` 条件块内，仅 mechdusa 世界生效；现由
  //   vanillaItemVariants.ts ITEM_VARIANT_STATS[5334] 变体层提供）
  // 天顶剑 4956 / 真铜短剑 5669（Item.cs:39974-39992 / 5669 同构 case）：
  //   `useTime = useAnimation / 3f` 算式提取器不解析 → useTime 缺失（combatWeapon
  //   缺省回退 useAnimation=30 = 挥一次只发一发剑弹；原版 30 帧动画内每 10 帧
  //   一发共 3 发，num164=(animMax−anim)/itemTime=0/1/2）
  '4956': { useTime: 10 },
  '5669': { useTime: 10 },
  // ---- 1.4.4 三溶液（Item.cs:42744-42752 DefaultToSolution(1015/1016/1017)——
  //   辅助方法形参赋值提取器不解析，与湿/干炸弹同型缺口）。DefaultToSolution
  //   （:47428-47438）：shoot = projectileId-145 → 870/871/872（PickAmmo 加法链
  //   Clentaminator.shoot 145 + 870 = SandSpray 1015）；ammo=AmmoID.Solution 780 ----
  '5392': { shoot: 870, ammo: 780, consumable: true },
  '5393': { shoot: 871, ammo: 780, consumable: true },
  '5394': { shoot: 872, ammo: 780, consumable: true },
  // ---- 割草机 4049（Item.cs:35615-35618 → DefaultToLawnMower :48532-48541 辅助
  //   方法形参赋值,提取器不解析 → 整件缺键=死物品）。DefaultToLawnMower(20,20)：
  //   width20/height20/holdStyle1/useStyle11(MowTheLawn,ItemUseStyleID.cs:27)/
  //   useAnimation30/useTime10/UseSound Item23/autoReuse true——
  //   useTime/useAnimation/autoReuse 入本表;useStyle/holdStyle 在 vanillaItemFunc
  //   FUNC['4049']（heldUseStyle/bodyFrame 行/静持持位消费面）;width/height 本表无列。
  //   SW-K1 2026-09-03 消费面=ItemCheck_UseLawnMower(Player.cs:47373)+MowTheLawn
  //   (:20447),autoReuse 键兼驱动 updateSwingHits 归零保活 ----
  '4049': { useTime: 10, useAnimation: 30, autoReuse: true },
  // ---- ★弹药伤害 4 错补丁已撤（2026-08-23 基准切换 1457）：曾以 1456 为准钉
  //   546→12/988→7/1350→15/3011→7,现 json 的 1457 终值（15/9/10/10）即权威,
  //   补丁层删除（Item.cs 1457 实测行号:546 case:7897 damage=:7899/988 case:12740
  //   damage=:12743/1350 case:16683 damage=:16686/3011 case:27828 damage=:27833
  //   ——recon CLASS B 权威;初版注释行锚有漂移,2026-08-23 复核校正）。
  //   1319 雪球炮 useAmmo 949（Item.cs:16307 `useAmmo = AmmoID.Bullet` 后 :16318
  //     `useAmmo = AmmoID.Snowball` 双赋值，C# 顺序语义终值=Snowball 949；1457 同构
  //     :16335/:16338——提取器首匹配取到中段 Bullet 97。2026-08-22 弹幕基建批顺带修）
  '1319': { useAmmo: 949 },
  // ---- 1457 批 C 新魔法武器五件（DefaultToMagicWeapon/DefaultToStaff/SetWeaponValues
  //   辅助方法形参赋值提取器不解析 → json 只收编了直写字段。逐件回填 1457 终值：
  //   6152 DaybloomStaff（Item.cs:47411-47422 DefaultToMagicWeapon(1114,40,6)+useTime=4
  //     +autoReuse+mana5+damage8+kb3+Item8）
  //   6153 GlacierFang（:47423-47434 DefaultToMagicWeapon(1115,24,4)+mana10+damage11
  //     +crit11+kb2+channel）
  //   6154 Petalstorm（:47435-47446 DefaultToMagicWeapon(1116,42,5)+mana20+damage20
  //     +kb3.5+useStyle15+autoReuse）
  //   6155 LightningStrike（:47447-47453 DefaultToStaff(1117,8,55,30)→useAnim=useTime55/
  //     speed8/autoReuse/40×40+SetWeaponValues(150,10,10)→damage150/kb10/crit10）
  //   6173 ArcSurge（:47556-47564 DefaultToStaff(1122,8,18,18)+useTime=6 直写+
  //     SetWeaponValues(180,4)→damage180/kb4+Item15+noUseGraphic）----
  //   ★6152/6173 的 useAnimation 行是 multishot 满蓝发数的数据面（json 缺行时
  //     cw.useAnimation 回退 useTime → sprayCyclePlan(U,U)=null → maxShots 恒 1;
  //     慢施窗 slowMagicWindowGrow 同吃本列）——行为锁 tests/slow-magic-window
  //     「6152/6173 满蓝 multishot」10/3 两例（2026-09-03 逐字段复核=1457 终值）----
  '6152': { shoot: 1114, useAnimation: 40, useTime: 4, shootSpeed: 6, mana: 5, damage: 8, knockBack: 3, noMelee: true, magic: true, autoReuse: true },
  '6153': { shoot: 1115, useAnimation: 24, useTime: 24, shootSpeed: 4, mana: 10, damage: 11, knockBack: 2, crit: 11, noMelee: true, magic: true },
  '6154': { shoot: 1116, useAnimation: 42, useTime: 42, shootSpeed: 5, mana: 20, damage: 20, knockBack: 3.5, noMelee: true, magic: true, autoReuse: true },
  '6155': { shoot: 1117, useAnimation: 55, useTime: 55, shootSpeed: 8, mana: 30, damage: 150, knockBack: 10, crit: 10, noMelee: true, magic: true, autoReuse: true },
  '6173': { shoot: 1122, useAnimation: 18, useTime: 6, shootSpeed: 8, mana: 18, damage: 180, knockBack: 4, noMelee: true, magic: true, autoReuse: true, noUseGraphic: true },
  //   6171 BejeweledStaff（2026-08-23 内容缺口批；Item.cs:47551-47554
  //     DefaultToStaff(126, 6f, 22, 15)+SetWeaponValues(27, 6f)）：
  //     DefaultToStaff（:48016-48023）= DefaultToMagicWeapon(126,22,6,autoReuse)
  //     +mana15+40×40+Item43；DefaultToMagicWeapon（:48433-48441）= autoReuse/
  //     useStyle5/useAnim=useTime22/shoot126/speed6/noMelee/magic。
  //     出手链 = PackGemStaffFeatures（Player.cs:50002 `AllGems = (HeldItem.type
  //     == 6171)`）→ vanillaGemStaff.packGemStaffFeatures allGems 位 ----
  '6171': { shoot: 126, useAnimation: 22, useTime: 22, shootSpeed: 6, mana: 15, damage: 27, knockBack: 6, noMelee: true, magic: true, autoReuse: true },
  //   1782 糖果玉米步枪 crit+6（2026-08-23 备案遗留④；Item.cs:19755 `crit += 6`
  //     复合赋值提取器不解析 → json 缺 crit。GetWeaponCrit 消费 :25230-25232）----
  '1782': { crit: 6 },
  // ---- R29 移交注册项两弓（R30/R31 合并批 2026-08-25；Item.cs 1458 实测行号）：
  //   DefaultToBow(singleShotTime, shotVelocity, hasAutoReuse)（:48425-48432）=
  //   DefaultToRangedWeapon(1, AmmoID.Arrow=40, …)+width14/height30+UseSound Item5
  //   ——辅助方法形参赋值提取器不解析 → json 两键全缺 = combatWeapon 返 null 死路径。
  //   ★红队移交单曾写"Star Cannon 955/Super Star Cannon 728"系型号误记：1458
  //   Terraria.ID/ItemID.cs:1940 StarCannon=197（json 已有 shoot955/useAmmo75 全条目）、
  //   :9666 SuperStarCannon=4060（EXTRACT_PATCH '4060' 已在）；955/728 实为
  //   Ancient Gold Helmet/Wood Breastplate 盔甲——无需修。
  //   4058 骷髅弓（:35653-35657 DefaultToBow(17,11f)+SetWeaponValues(8,5f)+buyPrice(0,10)）
  //   4381 血雨弓（:38154-38158 DefaultToBow(19,9f,hasAutoReuse:true)+SetWeaponValues(14,3f)
  //     +rare3——多矢天降散布本体在 Player.cs:47766/:47877 专支,弹链归 R29 弓域,
  //     本表只补"可用性"数值面）----
  '4058': { shoot: 1, useAmmo: 40, useTime: 17, useAnimation: 17, shootSpeed: 11, damage: 8, knockBack: 5, noMelee: true, ranged: true },
  '4381': { shoot: 1, useAmmo: 40, useTime: 19, useAnimation: 19, shootSpeed: 9, damage: 14, knockBack: 3, noMelee: true, ranged: true, autoReuse: true },
};

const TABLE: Record<string, ItemCombat> = { ...RAW };
for (const k of Object.keys(EXTRACT_PATCH)) {
  TABLE[k] = { ...(RAW[k] ?? {}), ...EXTRACT_PATCH[k] } as ItemCombat;
}

/** 原版 item id → 战斗数据（无条目返回 null）。
 *  世界态变体叠层（Item.cs SetDefaults 各 Variant 分支的运行时等价物）：
 *  remix/getGood/mechdusa 秘密种子世界取变体参数，普通世界取常规值——
 *  变体表与上下文见 vanillaItemVariants.ts（Game.afterWorldLoad 灌入） */
export function itemCombat(vanillaId: number): ItemCombat | null {
  const base = TABLE[String(vanillaId)];
  const vs = activeVariantStatsOfVid(vanillaId);
  if (!vs) return base ?? null;
  const out: ItemCombat = { ...(base ?? {}), ...(vs.combat ?? {}) };
  // Rebalanced 乘区（197/4060，:3808-3812/:35653-35657）：C# `(int)(v * f)` 截断
  if (vs.damageMul !== undefined) {
    out.damage = Math.trunc((base?.damage ?? 0) * vs.damageMul);
  }
  if (vs.useTimeMul !== undefined) {
    out.useTime = Math.trunc((base?.useTime ?? 0) * vs.useTimeMul);
  }
  return out;
}

/** 弓类 AmmoID.Arrow = 40（AmmoID.cs:116） */
export const AMMO_ARROW = 40;
/** AmmoID 常量（AmmoID.cs:114-146）：子弹/凝胶/钱币/坠落之星/沙/飞镖/火箭/溶液/信号弹 */
export const AMMO_GEL = 23;
export const AMMO_COIN = 71;
export const AMMO_FALLEN_STAR = 75;
export const AMMO_BULLET = 97;
export const AMMO_SAND = 169;
export const AMMO_DART = 283;
export const AMMO_ROCKET = 771;
export const AMMO_SOLUTION = 780;
export const AMMO_FLARE = 931;
/** AmmoID.Snowball = 949（AmmoID.cs:134——雪球炮 1319 useAmmo，Item.cs:16318） */
export const AMMO_SNOWBALL = 949;

// ================= vi_* 武器语义解析（json 数据驱动;json 已过 recon-item 闸门=1457 终值,DRIFT=0） =================

/** vi_<id>_<slug> key → 原版 item id（vi_ 批次未显式存 vid 时从 key 反解） */
export function viIdFromKey(key: string): number {
  const m = key.match(/^vi_(\d+)_/);
  return m ? Number(m[1]) : -1;
}

export type CombatWeapon =
  | { kind: 'melee'; damage: number; knockback: number; useTime: number; useAnimation: number; autoReuse: boolean; shoot?: number; shootSpeed?: number }
  | { kind: 'summon'; shoot: number; sentry: boolean; damage: number; knockback: number; useTime: number; shootSpeed: number }
  | { kind: 'whip'; shoot: number; damage: number; knockback: number; useTime: number; shootSpeed: number; itemId: number }
  | {
      kind: 'boomerang' | 'spear' | 'anchored' | 'yoyo' | 'flail' | 'flairon' | 'grenade' | 'glowstick' | 'magic' | 'shot' | 'summon';
      shoot: number;
      damage: number;
      knockback: number;
      useTime: number;
      shootSpeed: number;
      mana?: number;
      sentry?: boolean;
      /** ★magic 分支随行（2026-08-24）：门 `(cw.autoReuse || fresh-edge)` 消费——
       *  曾缺省=恒 undefined=按住不连发（用户实报太阳花法杖第二根因） */
      autoReuse?: boolean;
      useAnimation?: number;
    };

/** 物品定义的最小形状（items.ts 的 ItemDef 满足之） */
export interface CombatWeaponItemLike {
  key: string;
  vid?: number;
}

/** vi_* 物品的原版战斗语义：按 itemCombat 字段 + 投射物 aiStyle 家族分流
 *  （Projectile.cs SetDefaults 数据 + DefaultTo* 族 aiStyle）。
 *  返回 null = 无战斗语义（材料/家具/药水等，或走既有手写分支的弓）。
 *  注意：消耗型 aiStyle 2（手里剑等抛物线投掷）仍走 Game.thrownCombat，
 *  这里只接管爆炸物族（ai16）——判定顺序见 Game.useItem */
export function combatWeapon(def: CombatWeaponItemLike): CombatWeapon | null {
  const vid = def.vid ?? viIdFromKey(def.key);
  if (vid < 0) return null;
  // 传送门枪 3384（Item.cs:30926-30942）：shoot=600 是 aiStyle75 手持光束投射物
  // （本身不落门，其首帧 AI 在 Projectile.cs:63883-63911 发出真正的 601 落门弹）。
  // 直射兜底（kind 'shot'）会把 600 发成一发无落门逻辑的 Arrow——显式退出通用分流，
  // 物品链由 entities/PortalGunBolt.ts firePortalGun 承载（Game.updateUse 专属分支）。
  // 另两消费点（右键集火门/remoteSwingDur）对 null 与 'shot' 行为一致，无回归。
  if (vid === 3384) return null;
  // 吉姆无人机 5451/遥控车 5738（Item.cs 共用支 Player.cs:49511-49522）：宠物机件
  // 非武器弹幕——使用语义=先 Kill 场内所有同型同主弹再生成一只（单实例替换）。
  // noUseGraphic 使通用分流落 'shot' 兜底=把机件当子弹射出（R35 清单⑤）——显式退出,
  // 发射链由 Game 专支承载（ai195/205 本体行为另批登记）
  if (vid === 5451 || vid === 5738) return null;
  // 鞭（DefaultToWhip，Item.cs:47439——提取器漏提，独立表 src/data/vanilla-whips.json 全 18 把）
  const whip = WHIPS[String(vid)];
  if (whip) {
    return {
      kind: 'whip', itemId: vid,
      shoot: whip.proj, damage: whip.dmg, knockback: whip.kb,
      useTime: whip.anim, shootSpeed: whip.speed,
    };
  }
  const c = itemCombat(vid);
  if (!c || c.useAmmo || c.ammo) return null; // 弓弩/弹药体系不在此分流
  const shoot = c.shoot ?? 0;
  const ai = shoot ? projectileData(shoot)?.aiStyle ?? -1 : -1;
  const base = {
    damage: c.damage ?? 1,
    knockback: c.knockBack ?? 3,
    useTime: c.useTime ?? c.useAnimation ?? 100,   // ResetStats 缺省 100（Item.cs:48626-48627）
    shootSpeed: c.shootSpeed ?? 8,
  };
  if (shoot) {
    if (c.consumable && c.noMelee) {
      // 消耗型：荧光棒族（282 普通/286 粘性/3112 弹力/3002 矿工/4776 妖精/5643 彩虹
      // → proj 50/53/515/473/870/1089，ai14 弹跳物理）；爆炸物族（ai16）弹跳+引信；
      // ai2 抛物线投掷武器（手里剑）交回 thrownCombat
      // 门禁 = ItemID.Sets.Glowsticks（ItemID.cs:1198 精确六件）——ai14 还有巨石/药瓶等
      // 其他投掷物，不能按 aiStyle 一律归入
      if (ai === AI_GLOWSTICK && (vid === 282 || vid === 286 || vid === 3112 || vid === 3002 || vid === 4776 || vid === 5643)) {
        return { kind: 'glowstick', shoot, ...base };
      }
      if (ai === AI_GRENADE) return { kind: 'grenade', shoot, ...base };
      return null;
    }
    if (ai === AI_BOOMERANG) return { kind: 'boomerang', shoot, ...base };
    // ★1457 叶绿军刃 1227 重做（Item.cs:15140-15158 shoot 228→1127）：1127 虽是
    //   aiStyle 161 短剑刺族，但它是 ChloroSaberStab 专属弹（AI_161 1127 支带
    //   meleeSpeed 节奏/397 孢子侵染/挥击音尘），不能落通用 SpearProj——归 'shot'
    //   交 Game 专支（同 1226 归 melee 专支先例）
    if (vid === 1227 && ai === AI_SHORTSWORD) return { kind: 'shot', shoot, ...base };
    if (ai === AI_SPEAR || ai === AI_SHORTSWORD) return { kind: 'spear', shoot, ...base };
    // AI_ANCHORED(13) 四件已实装专支（entities/WeaponProj.ts AnchoredProj,
    // AI_013 全状态机 Projectile.cs:24928-25121）：出膛恒速→超程门回收
    // （23>1000/262>500/271>200/273>150）/撞块·命中敌即转回收/返回段穿墙制速
    // （262=30）/玩家→拳 Chain22·18·23·Chain 链索绘制。鱼叉 160(弹23)带
    // penetrate=3 三击才回收+私账免疫 12t；Golem 拳 1297(262)返回起手 200×200
    // 一帧冲击盒+爆炸音(:25064-25074/:15057)。此前整族落 'spear' 长矛前刺近似
    // （用户实报"石巨人之拳不对,缺少部件"=无伸缩三段形态、无链条）；
    // ★481 断头台链刃(3012)保留走 'spear'——SpearProj 内 R30 专支行为已对拍锁定
    if (ai === AI_ANCHORED) {
      if (shoot === 481) return { kind: 'spear', shoot, ...base };
      return { kind: 'anchored', shoot, ...base };
    }
    if (ai === AI_YOYO) return { kind: 'yoyo', shoot, ...base };
    if (c.summon) {
      // 召唤武器（31 件）：按投射物 AI 分流哨兵与随从。哨兵 aiStyle 集合 = 53（冰九头蛇
      // 308/蜘蛛皇后 377/猎犬 966，:3724/:4342/:8860）/123（月门 641/彩虹水晶 643，:6638/:6651）
      // /130/134/137/138（OOA 四塔）。**aiStyle 54 不是哨兵**——唯一使用者 317 乌鸦是
      // minion（:3825-3836 minion=true/minionSlots=1，无 sentry 字段），此前误入哨兵
      // 路径吃到"60t 一发"兜底
      // 197 = 5463→1025 悬空毒眼球哨兵(P.cs:9424-9433 aiStyle=197/sentry=true——
      // 曾漏 → 误归随从占随从槽;2026-08-22 审计附带给补)
      return { kind: 'summon', shoot, sentry: ai === 53 || ai === 123 || ai === 130 || ai === 134 || ai === 137 || ai === 138 || ai === 197,
        ...base };
    }
    if (ai === AI_FLAIL) return { kind: 'flail', shoot, ...base };
    // ★R4 猪龙鱼链球 2611（弹 404 = aiStyle 69 掷球回收族,1457 Projectile.cs:30730-30829
    //   AI_069 全库唯一成员——flail 门旁加支,与 AI_FLAIL(15) 互斥天然分流）：noMelee 挡掉
    //   melee 门曾落 'shot' 兜底 = 通用直线弹（无回收三段/无伴生泡泡/无链条/出生半盒偏
    //   (13,13)）。kind 'flairon' → Game 专支（FlaironHeadProj 全状态机 + FlaironSpike
    //   伴生 + drawChain37 链）。与 5526 FlaironFlail（shoot 1058 aiStyle15 经典链锤,
    //   kind 'flail'）是同物右键互换两形态（Player.cs:31864-31868,互换未移植登记）。
    //   autoReuse/useAnimation 随行（'shot' 兜底同批纪律 2026-08-24——2611 autoReuse=true）
    if (ai === 69) return { kind: 'flairon', shoot, ...base,
      autoReuse: !!c.autoReuse, useAnimation: c.useAnimation ?? base.useTime };
    // ★天顶剑族（4956 Zenith / 5669 真铜短剑：melee+noMelee+shoot、投射物
    //   aiStyle 182 FinalFractal）：原版 useStyle 1 挥击动画 + noUseGraphic，
    //   本体 noMelee——全部伤害在 933/1100 剑弹上（Item.cs:39974-39992）。
    //   此前因 noMelee 落 'shot' 兜底 = 直线箭弹（无剑阵无挥击），归 melee
    //   交 Game 挥击分支 case 933/1100（挥击命中盒走 updateSwingHits noMelee 门）
    if (ai === 182 && c.melee) {
      return {
        kind: 'melee', damage: base.damage, knockback: base.knockback, useTime: base.useTime,
        useAnimation: c.useAnimation ?? base.useTime, autoReuse: !!c.autoReuse,
        shoot, shootSpeed: base.shootSpeed,
      };
    }
    // ★1457 叶绿巨剑 1226(melee+noMelee+shoot 229,useStyle 1):三连击重做后
    //   noMelee=本体不走近战接触盒(伤害全在叶绿弹上),但仍是挥击动画武器——
    //   落 'shot' 兜底 = 通用直射、chlorophyteBladeCounter 计数链整段死
    //   (补盲测试 gem-bolt/chlorophyte 抓出)。归 melee 交 Game 挥击分支
    //   heldVid===1226 专用支(ItemCheck_Shoot :49406-49426 计数制)——同天顶剑先例
    if (vid === 1226 && c.melee) {
      return {
        kind: 'melee', damage: base.damage, knockback: base.knockback, useTime: base.useTime,
        useAnimation: c.useAnimation ?? base.useTime, autoReuse: !!c.autoReuse,
        shoot, shootSpeed: base.shootSpeed,
      };
    }
    // ★ melee+shoot（附魔剑 989/波刃 190 等 46 件）：原版语义 = 挥砍为主 +
    // 挥击中射弹（Player.cs:42880：flag4 = itemAnimation>0 && ItemTimeIsZero →
    // ItemCheck_Shoot，useTime 节奏发弹）。此前落入 shot 兜底 = 变成"光束枪"
    // 完全不挥砍——语义错误。数值取 melee 分支，附带 shoot/shootSpeed 给挥击侧发射
    if (c.melee && !c.noMelee) {
      return {
        kind: 'melee', damage: base.damage, knockback: base.knockback, useTime: base.useTime,
        useAnimation: c.useAnimation ?? base.useTime, autoReuse: !!c.autoReuse,
        shoot, shootSpeed: base.shootSpeed,
      };
    }
    // ★autoReuse/useAnimation 必须随行（2026-08-24 用户实报"太阳花法杖挥动没效果"
    //  第二根因）：门 `(cw.autoReuse || fresh-edge)` 吃 cw.autoReuse——曾只展开 base
    // （damage/knockback/useTime/shootSpeed）丢 autoReuse → 恒 undefined → 按住不连发
    // （全部 magic 武器共性,非 autoReuse 件语义不变）。useAnimation 同理（挥动动画
    // 时长,useSwing heldUseAnimation 消费）
    if (c.magic || c.mana) return { kind: 'magic', shoot, mana: c.mana ?? 0, ...base,
      autoReuse: !!c.autoReuse, useAnimation: c.useAnimation ?? base.useTime };
    // 其余 melee/ranged+shoot（附魔剑光束等）：直射弹兜底
    // 'shot' 兜底同样随行 autoReuse/useAnimation（2026-08-24 清零批：779/5134 连发
    // 镖枪等 noMelee+autoReuse 件走本支,曾丢=按住单发）
    if (c.melee || c.ranged || c.noMelee) return { kind: 'shot', shoot, ...base,
      autoReuse: !!c.autoReuse, useAnimation: c.useAnimation ?? base.useTime };
    return null;
  }
  // 纯近战（剑等：melee 且非 noMelee；无 shootSpeed 语义）。
  // useAnimation=挥击动画时长 / useTime=复用冷却（Player.ItemCheck: itemAnimationMax 与 itemTime
  // 分立，1790 件 vi 武器两者不同——只回传 useTime 会让挥速虚快）
  if (c.melee && !c.noMelee) {
    return {
      kind: 'melee', damage: base.damage, knockback: base.knockback, useTime: base.useTime,
      useAnimation: c.useAnimation ?? base.useTime, autoReuse: !!c.autoReuse,
    };
  }
  return null;
}

/** 可直掷的"武器+弹药"双职件白名单：雪球 949（useStyle1+shoot166+consumable，
 *  Item.cs:12337-12353——手持左键直接掷出弹 166，同时是雪球炮 1319 的弹药）。
 *  金币 71-74 虽同为双职数据面（useStyle1+shoot158-161），但原版 ItemCheck_Shoot
 *  有显式 IsACoin 门（Player.cs:46473-46476 `if (sItem.IsACoin) canShoot = false`）
 *  ——四币【不可】掷出（补 B 审计"金币可投掷"系误读，:52594-52605 是金币枪
 *  PickAmmo 的币槽扫描非投掷链）；种子 283 等无 useStyle 永不入使用链。 */
const THROWABLE_AMMO_DUAL = new Set([949]);

/** thrownCombat 显式退出群（2026-08-30 孤儿武器 A 波）：消耗型但弹体非 ai2 抛物刀——
 *  走 Game 专支承载（同 combatWeapon 3384 先例）：
 *   · 4608 打窝桶 → 弹 820 AI_163 浮筒（entities/ChumBucketProj + chumBucket 注册面）
 *   · 4702 放飞灯笼 → 弹 855 AI_166 飞升发光体（entities/SkyLanternProj）
 *   · 5438 肥料 / 5518 富集肥料 → 弹 1019/1051 aiStyle 6 肥料云（B2 波,
 *     entities/WeaponProj FertilizerCloud + Game.growFertilizedSapling 世界管线;
 *     combatWeapon 对 consumable+noMelee+ai6 先返 null,通用投掷出口再射成箭体）
 *   · B3 波扩（2026-08-30）：859 沙滩球 → 弹 155 AI_032 玩具球物理+Kill 回收
 *     （BallProjs.BeachBallProj,踢飞/湿浮/静止杀 :27264-27408+回收 :79351-79354);
 *     4743 橄榄球 → 弹 861 型专段滚动档/接触回收/Kill 回落堆叠（BallProjs.
 *     FootballProj,:18484-18502+:23674-23730+回落 :79355-79357)——通用出口会把它俩
 *     射成重力箭体且 Kill 无回收
 *  通用投掷出口会把这些件射成重力抛物 Arrow——vanilla 弹自管物理,AI 家族完全不同。
 *  ★三地球仪 4765/4766/5285 不入本表：弹体就是 aiStyle2 抛物线(P.cs:8336/:9460),
 *  继续走通用分流,Kill 三重掷(:75111-75131)经 Game.onProjectileDeath 承载 */
const THROWN_EXPLICIT_NULL = new Set([4608, 4702, 5438, 5518, 859, 4743]);

/** 旧判定（消耗型投掷武器）：shoot+consumable+noMelee 且无 useAmmo；
 *  ammo 双职件仅白名单（雪球）可掷——原版按 useStyle/IsACoin 判定（见上注） */
export function thrownCombat(def: CombatWeaponItemLike): { shoot: number; damage: number } | null {
  const vid = def.vid ?? viIdFromKey(def.key);
  if (vid < 0 || THROWN_EXPLICIT_NULL.has(vid)) return null;
  const c = itemCombat(vid);
  if (!c?.shoot || !c.consumable || !c.noMelee || c.useAmmo) return null;
  if (c.ammo && !THROWABLE_AMMO_DUAL.has(vid)) return null;
  return { shoot: c.shoot, damage: c.damage ?? 0 };
}

/** AI_001（aiStyle 1）重力全链规格（1.4.5.6 反编译 :53083-53173 / :53881-54698 /
 *  :54871-54887，2026-08-14 对账）：
 *  · 默认（:54686-54696）：ai[0] ≥15（每 AI update 计一次）后 vy += 0.1/update，
 *    终端 vy 16（flag7，577 除外）——箭族 E=0 即"15t 平飞后 0.1/t² 缓坠"
 *  · 三类豁免默认：①flag3 表（:53085-53168，ai[0] 冻结 → 默认门永不开——
 *    子弹/光束族 83 型）②顶层行为链命中（:53881-54295 自管速度——357 叶绿弹/
 *    207/837 吸血飞刀等）③链尾排除（:54308/:54638：239/264/675 + 437/477）
 *  · 逐型自带重力（替代默认）：见 AI1_GRAV 表
 *  · 686/711 两段式（:54640-54659）：+0.1@ai0≥10 再 +0.1@≥20、vx×0.99 */
const AI1_NO_DROP = new Set<number>([
  // flag3（ai[0] 不自增；498/639 例外——639 timeLeft 门档在 AI1_GRAV 表）
  5, 14, 20, 36, 38, 55, 83, 84, 88, 89, 98, 100, 104, 110, 158, 159, 160, 161, 180, 184,
  242, 248, 257, 259, 265, 270, 279, 283, 284, 285, 286, 287, 299, 302, 323, 325, 348, 349,
  350, 355, 374, 376, 389, 435, 436, 438, 440, 442, 449, 459, 462, 467, 468, 469, 472, 483,
  484, 485, 498, 576, 577, 585, 592, 593, 601, 606, 616, 634, 635, 638, 639, 660, 661, 682,
  684, 706, 709, 710, 712, 876, 980, 981, 1073,
  // 顶层行为链命中（分支自管速度，重力链不达）
  // ★R28：336 摘除——原版 AI_001 `type == 336 || type == 345` 分支（1458 :58098-58107，
  // 与 1457 :57920 区间同构）有延迟重力支 ai[0]≥50 → vy+=0.5（松针手枪 1930 的
  // 标志性"半秒平飞后下坠抛洒"），并非无重力；改走 AI1_GRAV 表 [0.5,50] 档
  357, 207, 837, 962, 337, 645, 424, 425, 426, 344, 345, 246, 311, 1023, 312,
  // 链尾排除 + 无重力分支（437 仅淡出 / 477 分支内豁免）
  239, 264, 675, 437, 477,
]);

/** 逐型重力 [rate/update, ai0 门槛]（顶层链 :54009-54032 + 嵌套链 :54310-54626）。
 *  负 rate = 上飘（1006 微光箭 flag4 分支 :54686-54696 vy−=0.1，终端 −16 走
 *  AI_001 尾 flag7 对称钳 :54878-54890——Arrow grav<0 档取 −maxFall） */
const AI1_GRAV: Record<number, [number, number]> = {
  // ---- 绳索线圈弹 475 藤/476/505 丝/506 蛛网（aiStyle35 :27581-27590：ai0≤30 无
  //      重力,之后 vy+=0.2 钳 14+vx×0.985——钳/阻尼未建模登记;撞块铺绳在 Arrow）----
  475: [0.2, 30], 476: [0.2, 30], 505: [0.2, 30], 506: [0.2, 30],
  81: [0.07, 20], 91: [0.07, 20],                                        // :54009-54016
  174: [0.15, 5], 605: [0.15, 5], 920: [0.15, 5], 921: [0.15, 5], 926: [0.15, 5],  // :54017-54024
  937: [0.07, 5],                                                        // :54025-54032
  176: [0.05, 15], 275: [0.025, 35], 276: [0.025, 35],                   // :54310/:54318
  172: [0.085, 17], 117: [0.06, 35], 120: [0.05, 30],                    // :54354-54380
  195: [0.15, 40], 1097: [0.15, 40],                                     // AI_001 :58255-58269(★R3 行号纠偏:原注 54381-54408 实为 AI_147/尘段)
  267: [0.075, 20], 478: [0.075, 20], 479: [0.075, 20],                  // :54409-54423
  408: [0.05, 45], 495: [0.04, 30], 498: [0.15, 50],                     // :54482/:54597/:54608
  // ★R28：336 松针弹（1930 松针手枪）/345（AI_001 type 段 :58098-58107）——
  // ai[0]≥50 后 vy+=0.5/update（ai[0] 同时钳 50，恒定加速档）；336 extraUpdates=1
  // → ai[0] 按子步自增，50 子步 = 25t ≈ 半秒平飞。发射侧每发 ai[0] 随机初值
  // rand(0,10(i+1)) 由 Arrow 出生自校正折算成 gravDelay 前移（见 Arrow rp30 段）
  336: [0.5, 50],
  // 507 族原版门为严格 `> 60`（:54589-54596）——Arrow 门已统一 `>=`，存 61 等价
  507: [0.3, 61], 508: [0.3, 61], 662: [0.3, 61], 680: [0.3, 61], 685: [0.3, 61],  // :54589-54596
  // 1006 微光箭 flag4 上飘（:54686-54696，ai[0] 正常自增——不在 flag3 表）；
  // 639 月总箭（:54660-54663 timeLeft ≤ MaxUpdates×45−14 门 = 子步 14 起 +0.1，
  // flag3 冻结 ai[0]，门槛按子步龄计——extraUpdates 2 与 timeLeft 同步子步消耗）
  1006: [-0.1, 15], 639: [0.1, 14],
};

/** 686/711 两段式（grav2 通道） */
const AI1_TWO_STEP = new Set<number>([686, 711]);

export interface ProjGravSpec {
  /** 每 update 重力（Arrow subStep 即 per-update 语义） */
  grav: number;
  /** ai[0] 门槛（update 计）；-1 = 无延迟 */
  delay: number;
  /** 二段重力（686/711 @20 再 +0.1） */
  grav2?: number;
  grav2At?: number;
  /** 恒定 vx 衰减（686/711 ×0.99/update） */
  drag?: number;
}

export function projGravSpec(shoot: number): ProjGravSpec {
  const ai = projectileData(shoot)?.aiStyle ?? -1;
  if (ai !== 1) {
    // aiStyle 2/16 旧口径保留（GrenadeProj/投掷路径自带物理，此处仅兜底）
    return { grav: ai === AI_THROWN || ai === AI_GRENADE ? 0.3 : 0, delay: -1 };
  }
  const t = AI1_GRAV[shoot];
  if (t) return { grav: t[0], delay: t[1] };
  if (AI1_TWO_STEP.has(shoot)) return { grav: 0.1, delay: 10, grav2: 0.1, grav2At: 20, drag: 0.99 };
  if (AI1_NO_DROP.has(shoot)) return { grav: 0, delay: -1 };
  return { grav: 0.1, delay: 15 };   // 默认（:54686-54696）
}

/** aiStyle → 投射物重力（兼容旧调用面；规格细节走 projGravSpec） */
export function projGravity(shoot: number): number {
  return projGravSpec(shoot).grav;
}

/** AmmoID.Sets.SpecificLauncherAmmoProjectileMatches 全表（AmmoID.cs，1.4.5.6）：
 *  发射器 id → { 弹药 id → 弹体 id }，5 发射器 × 12 弹药，优先级最高 */
export const SPECIFIC_LAUNCHER_AMMO: Record<number, Record<number, number>> = {
  759: { 771: 134, 772: 137, 773: 140, 774: 143, 4445: 776, 4446: 780, 4457: 793, 4458: 796, 4459: 799, 4447: 784, 4448: 787, 4449: 790 },
  758: { 771: 133, 772: 136, 773: 139, 774: 142, 4445: 777, 4446: 781, 4457: 794, 4458: 797, 4459: 800, 4447: 785, 4448: 788, 4449: 791 },
  760: { 771: 135, 772: 138, 773: 141, 774: 144, 4445: 778, 4446: 782, 4457: 795, 4458: 798, 4459: 801, 4447: 786, 4448: 789, 4449: 792 },
  1946: { 771: 338, 772: 339, 773: 340, 774: 341, 4445: 803, 4446: 804, 4457: 808, 4458: 809, 4459: 810, 4447: 805, 4448: 806, 4449: 807 },
  3930: { 771: 715, 772: 716, 773: 717, 774: 718, 4445: 717, 4446: 718, 4457: 717, 4458: 718, 4459: 717, 4447: 717, 4448: 717, 4449: 717 },
};

/** PickAmmo 弹型解析 1:1（Player.cs:52635-52668）：优先级 = Specific 匹配表 >
 *  雪人炮算式（338+ammo−771）/ MK2 算式（715+ammo−771）> 火箭族【加法】
 *  （发射器 shoot + 弹药 shoot，:52648-52651 —— 非替换！火箭一型 shoot=0 → 基弹，
 *  二/三/四型 +3/+6/+9 偏移）> 弹药 shoot>0 门替换（:52656-52659，否则保留
 *  发射器 shoot）；弓族特例尾改写（3019/3052）。
 *  此前误用"弹药 shoot 替换"链：火箭一型打出 projId 0 隐形弹、二型打出手里剑
 *  贴图（772.shoot=3=Shuriken），2026-08-14 对账修复 */
export function resolveAmmoProjId(launcherVid: number, ammoVid: number, useAmmo: number,
  launcherShoot: number | undefined, ammoShoot: number | undefined): number {
  const specMatch = SPECIFIC_LAUNCHER_AMMO[launcherVid]?.[ammoVid];
  if (specMatch !== undefined) return specMatch;
  if (launcherVid === 1946) return 338 + ammoVid - 771;
  if (launcherVid === 3930) return 715 + ammoVid - 771;
  if (useAmmo === 771) return (launcherShoot ?? 0) + (ammoShoot ?? 0);   // 火箭加法
  // 溶液加法（Player.cs:52645-52647：useAmmo==AmmoID.Solution → projToShoot +=
  // item.shoot——Clentaminator 145 + 溶液 shoot 0-4/870-872 → 145-149/1015-1017；
  // 此前走"弹药 shoot 替换"尾链 → 绿溶液打出 projId 0 隐形弹，2026-08-20 修）
  if (useAmmo === AMMO_SOLUTION) return (launcherShoot ?? 0) + (ammoShoot ?? 0);
  // 尾链（Player.cs:52656-52659）：仅 item.shoot > 0 才替换 projToShoot（进
  //  PickAmmo 前已初始化为发射器 sItem.shoot）；弹药 shoot≤0 → 保留发射器 shoot；
  // 发射器自身也 ≤0 → 原版 projToShoot=0（NewProjectile 前置门不发射），本仓射击链
  // 无 0 哨兵档 → 兜 1（木箭）。★曾用 ?? 链把显式 shoot:0 当有效值——绿溶液 780/
  // 火箭一型 771 的显式 0 若未被上方加法支拦截即成隐形弹（2026-08-21 复审 P3③）
  const ammoS = ammoShoot ?? 0;
  if (ammoS > 0) return ammoS;
  const launcherS = launcherShoot ?? 0;
  if (launcherS > 0) return launcherS;
  return 1;
}

/** 沙枪 266 三色砂换弹（PickAmmo :52680-52696;★V1 复核校正,旧锚 :52666-52678 实为 4953/4381/4058 特例段）：projToShoot==42（沙枪基弹
 *  Sand Ball）时按弹药品种改写弹体——黑檀砂 370→65 / 猩红砂 408→68 /
 *  沙漠化石 1246→354，各 +5 伤（原版直加 Damage，位于 :52686 弹药伤乘算之前；
 *  本仓与熔火箭袋 +2 同走 ammoBonus 通道，见 Game 远程段注释）。
 *  普通沙 169 弹体恒 42 不加伤。返回 null = 非沙枪/非换弹品种 */
export function resolveSandGunSwap(launcherVid: number, projId: number, ammoVid: number):
  { projId: number; bonus: number } | null {
  if (launcherVid !== 266 || projId !== 42) return null;
  if (ammoVid === 370) return { projId: 65, bonus: 5 };
  if (ammoVid === 408) return { projId: 68, bonus: 5 };
  if (ammoVid === 1246) return { projId: 354, bonus: 5 };
  return null;
}

/** vi_ useAmmo 远程武器（弓/枪/发射器，DefaultToRangedWeapon 族 useStyle=5）：
 *  返回 useAmmo id（AmmoID.Arrow=40 / Bullet=97 …）；非 useAmmo 物品返回 0。
 *  combatWeapon 对 useAmmo 物品返回 null（弓弩/弹药体系另走 PickAmmo），Game 远程
 *  分支据此接管枪族——此前 vi_ 手枪/雪球炮等无 def.ranged 又被 combatWeapon 排除 = 静默失效 */
export function rangedAmmoWeapon(def: CombatWeaponItemLike): number {
  const vid = def.vid ?? viIdFromKey(def.key);
  if (vid < 0) return 0;
  const ua = itemCombat(vid)?.useAmmo ?? 0;
  return ua > 0 ? ua : 0;
}

// ================= 逐枪射击链纯函数（Game 远程分支消费，可单测） =================

/** 弹药伤害分道（GetWeaponDamageMultiplier Player.cs:52521-52535 的 AmmoID.Sets 三表）：
 *  IsArrow{40 箭,1836 桩}→bowEffective（本仓 'arrow'）/ IsBullet{97 弹,1783 糖果玉米}
 *  →gunEffective（'bullet'）/ IsSpecialist{771 火箭,1261 刺炮弹,1785 南瓜,3108 钉弹,
 *  71 钱币,931 信号弹,283 飞镖,949 雪球,75 坠落星,23 凝胶}→specialistEffective
 *  （本仓 'rocket' 桶）/ 其余 → rangedDamage（'other'）。此前负滤（≠弹/火箭/镖/溶液）
 *  把雪球/星星/凝胶/钱币/信号弹全误落 'arrow' 桶（2026-08-22 对齐三表）。
 *  原版另查 item.ammo（弹药侧类别），本仓按 useAmmo 单侧判——弓/枪/发射器的
 *  useAmmo 已定类别，弹药交叉（弓射桩/枪射糖果玉米）由 useAmmo 侧同名集覆盖 */
const AMMO_KIND_ARROW = new Set([40, 1836]);
const AMMO_KIND_BULLET = new Set([97, 1783]);
const AMMO_KIND_SPECIALIST = new Set([771, 1261, 1785, 3108, 71, 931, 283, 949, 75, 23]);

export type AmmoDamageKind = 'arrow' | 'bullet' | 'rocket' | 'other';

export function ammoDamageKind(useAmmo: number): AmmoDamageKind {
  if (AMMO_KIND_ARROW.has(useAmmo)) return 'arrow';
  if (AMMO_KIND_BULLET.has(useAmmo)) return 'bullet';
  if (AMMO_KIND_SPECIALIST.has(useAmmo)) return 'rocket';
  return 'other';
}

/** 弓族弹型换体全链（PickAmmo 尾链 Player.cs:52660-52705 + ItemCheck_Shoot 弹型段
 *  :46525-46549，顺序敏感：熔火箭袋在蜂膝弓之后、ItemCheck 表在整链最末——
 *  熔火箭袋先把木箭 1→2 后，熔岩之怒 120 的 `projToShoot==1` 门即不再触发，同原版）。
 *  返回换体后弹型 + 熔火箭袋 +2 加伤（:52704 同支结算） */
export function resolveBowProjOverride(bowVid: number, projId: number,
  hasMoltenQuiver: boolean): { projId: number; ammoBonus: number } {
  let p = projId;
  let ammoBonus = 0;
  if (bowVid === 3019 && p === 1) p = 485;   // 炼狱天弓：木箭→狱翼箭（:52660-52663）
  if (bowVid === 3052) p = 495;              // 暗影焰弓恒 495（:52664-52667）
  if (bowVid === 4953 && p === 1) p = 932;   // 暮夕：木箭→月总矢（:52668-52670）
  // ★R29：血雨弓恒换血箭 819（1458 PickAmmo :54148-54150 `if (sItem.type == 4381)
  //   projToShoot = 819`——【无视弹药品种】无条件换体；819 alpha255+hide 隐形弹体,
  //   视觉全靠血迹拖尾（Arrow 819 支）。位于蜂膝/熔火箭袋之前=熔火箭袋对它无效（同原版序））
  if (bowVid === 4381) p = 819;
  // ★R29：骷髅弓骨箭换弹支（1458 :54152-54154 `if (sItem.type == 4058 &&
  //   projToShoot == 474) projToShoot = 117`——仅骨箭弹药 3003(shoot 474) 生效,
  //   其他弹药照常;保持 p===474 门。117 死亡双骨片链 Game.ts 已备）
  if (bowVid === 4058 && p === 474) p = 117;
  if (bowVid === 2888 && p === 1) p = 469;   // 蜂膝弓：木箭→蜂箭（:52698-52701）
  if (hasMoltenQuiver && p === 1) { p = 2; ammoBonus = 2; }   // 熔火箭袋族（:52702-52705）
  if (p === 1 && bowVid === 120) p = 2;      // 熔岩之怒：仅木箭→火矢（:46525-46528）
  if (bowVid === 682) p = 117;               // 骨弓恒骨箭（:46529-46533）
  if (bowVid === 725) p = 120;               // 冰雪弓恒霜箭（:46534-46537）
  if (bowVid === 2223) p = 357;              // 脉冲弓恒脉冲矢（:46542-46545）
  return { projId: p, ammoBonus };
}

/** 海啸 2624 五扇出生解算（Player.cs:47138-47164）：5 矢扇形——出生点 = 锚点(玩家中心)
 *  + 40px 瞄准向旋转 π/10×(i−2)，速度全体 = 瞄准速原样（不散布）；起手 CanHit 失败
 *  → 出生点整体回拉一个 40px 瞄准向（:47146-47150），CanHitLine(中心→出生点−速度)
 *  失败 → 该矢出生点向心回拉 15px（:47152-47155）。canHit/canHitLine = Collision 桥接
 *  （0 尺寸盒；原版两查分别为 Collision.CanHit :47145 / CanHitLine :47152） */
export function tsunamiFanShots(ax: number, ay: number, cx: number, cy: number,
  svx: number, svy: number,
  canHit: (x1: number, y1: number, x2: number, y2: number) => boolean,
  canHitLine: (x1: number, y1: number, x2: number, y2: number) => boolean,
): Array<{ x: number; y: number; vx: number; vy: number }> {
  const vlen = Math.hypot(svx, svy) || 1;
  const dirX = (svx / vlen) * 40, dirY = (svy / vlen) * 40;
  const clear0 = canHit(ax, ay, ax + dirX, ay + dirY);
  const shots: Array<{ x: number; y: number; vx: number; vy: number }> = [];
  for (let i = 0; i < 5; i++) {
    const ra = (Math.PI / 10) * (i - 2);
    const c = Math.cos(ra), s = Math.sin(ra);
    let sx = ax + dirX * c - dirY * s;
    let sy = ay + dirX * s + dirY * c;
    if (!clear0) { sx -= dirX; sy -= dirY; }
    if (!canHitLine(cx, cy, sx - svx, sy - svy)) {
      const pl = Math.hypot(sx - cx, sy - cy) || 1;
      sx -= ((sx - cx) / pl) * 15;
      sy -= ((sy - cy) / pl) * 15;
    }
    shots.push({ x: sx, y: sy, vx: svx, vy: svy });
  }
  return shots;
}

/** 暮夕 4953 逐发弹规格（Player.cs:47307-47315）：第 3 发（扇位 num60==2）→
 *  932 月总矢 + 伤×2；弹型 932（含木箭整链换体）恒速×2（:47313-47315） */
export function eventideShotSpec(shotIdx: number, projId: number, damage: number, speed: number):
  { pid: number; dmg: number; spd: number } {
  let pid = projId;
  let dmg = damage;
  let spd = speed;
  if (shotIdx === 2) { pid = 932; dmg = damage * 2; }
  if (pid === 932) spd = speed * 2;
  return { pid, dmg, spd };
}

/** 逐枪弹型强制/转换（Player.cs ItemCheck_Shoot 弹型段，无视 PickAmmo 解析结果）：
 *  电圈发射器 2796 恒 442（:46539-46541，此前走火箭加法链混入 445/448/451 假弹）/
 *  气喇叭 5117 恒 968（:46547-46549，useAmmo 97 仅作耗弹/加伤）/
 *  狙击步枪 1254·维纳斯万能枪 1255·Uzi 1265：火枪弹(14)→高速弹 242（:46477-46487） */
export function forceGunProjId(gunVid: number, projId: number): number {
  if (gunVid === 2796) return 442;
  if (gunVid === 5117) return 968;
  if ((gunVid === 1254 || gunVid === 1255 || gunVid === 1265) && projId === 14) return 242;
  return projId;
}

/** 逐枪省弹档（Player.cs:52755-52778 六档独立掷，先于装备/buff 档）：
 *  [Next 分母, 掷 0 才省]——98 迷你鲨/1782 糖果玉米步枪 Next(3)==0 省 1/3、
 *  533 巨鲨/2270 加特利托 Next(2)==0 省 1/2、1553 SDMG/1929 链式机枪 Next(3)!=0
 *  即省 = 仅耗 1/3。此前整块漏 = 六枪实际耗弹 ×1.33-3 倍（2026-08-22 补） */
export const GUN_AMMO_SAVE: Record<number, [number, boolean]> = {
  98: [3, true],     // 迷你鲨（:52759-52761）
  1782: [3, true],   // 糖果玉米步枪（:52755-52757）
  533: [2, true],    // 巨鲨（:52767-52769）
  2270: [2, true],   // 加特利托（:52763-52765）
  1553: [3, false],  // SDMG 仅耗 1/3（:52775-52777）
  1929: [3, false],  // 链式机枪 仅耗 1/3（:52771-52773）
  // ★R29 三档（PickAmmo 省弹旗链 1458 :54200-54210）：星旋机枪 3475 Next(3)!=0
  //   即省=仅耗 1/3、庆祝 MK2 3930 Next(2)==0 省 1/2、幻象弓 3540 Next(3)!=0 即省
  //   =本体出手与 volley 内每发各掷 1/3（Celeb2 muzzle 回调此前绕过 roll 口=耗弹
  //   ×3/×2,红队 §13）
  3475: [3, false],  // 星旋机枪（:54200-54202）
  3930: [2, true],   // 庆祝 MK2（:54203-54205）
  3540: [3, false],  // 幻象弓（:54206-54208）
};

/** 逐枪省弹判定（rand01 = Math.random()，等价 Main.rand.Next(denom) 商值）：
 *  返回 true = 本发不耗弹；非表枪恒 false */
export function gunAmmoSaveHit(vid: number, rand01: number): boolean {
  const t = GUN_AMMO_SAVE[vid];
  if (!t) return false;
  const roll = Math.floor(rand01 * t[0]);
  return t[1] ? roll === 0 : roll !== 0;
}
