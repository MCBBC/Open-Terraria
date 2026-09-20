// 滚石弹（原版 Projectile 99 aiStyle=25 RollingBall 家族）：Check2x2 摧毁巨石
// 贴图时生成（WorldGen.cs:49171-49235 各 sheet 一张 NewProjectile 表，表值经
// BoulderMech.BOULDER_CONVERT_TABLE 查询）。
// AI 常量（Projectile.cs aiStyle==25 主链 26358-26734 的非 1055/1021 通用支）：
//   重力 +0.3/t、vy 帽 16；vy<=6 时横向加速 ±0.05 至 |vx|>=7（无地面摩擦——
//   原版滚动不停站）；rotation += vx*0.06；宽高 31、penetrate=-1、
//   friendly+hostile 双面命中、每目标免疫 10t（usesLocalNPCImmunity +
//   localNPCHitCooldown，Projectile.cs:10755-10762）。贴墙 X 碰撞无独立碎裂规则
//   （TileCollision 清 vx 后仍被 accel 推进；getgood 才 BoulderExplosion）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { moveAndCollide } from '../physics/TileCollision';
import { BOULDER_CONVERT_TABLE } from '../world/BoulderMech';
import { projSprite, Arrow } from './Arrow';
import { beeWallPushDir } from './WeaponProj';   // SW-AF1 2026-09-04（F-3）：1047 滚石踢墙门单源化（与 655/99 同摄取器）
import { cutTilesBox } from './ProjCutTiles';   // ★SW-BJ93 债1：CutTiles 面（:12517/:15276 共享体;vid 穿线 1047 幼虫豁免）
import { GorePiece } from './GorePiece';        // ★SW-BJ93 债2：1053 Kill gore 61..63（Game.explodeAt 同引擎,30:28419 先例）
import { projectileWetSection, projWaterDragFactor } from './projWetSection';
import { projectileData } from '../data/vanillaProjectiles';
import { TILE_DEFS, TILE_BY_KEY, TILE_CUT_SHEETS, BREAKABLE_WHEN_PLACING_SHEETS, PLATFORMS_SHEETS, ORE_SHEETS, IS_A_DRIP_TILE_SHEETS, FRIENDLY_FAIRY_CAN_LURE_TO_SHEETS } from '../data/tiles';
import { LIQUID_TYPE } from '../world/TileStore';   // ★SW-BJ93 债②：液体编码（repo +1 域）
import { canHit, solidTileAt } from '../physics/LineOfSight';   // ★SW-BJ93 债②：CanHit/SolidTile 1:1
import { VANILLA_ITEM_KEY_BY_ID } from '../data/items';   // ★SW-BJ93 债2：Kill 掉落 vid→键反查（Player.ts:6333 同款）
import { f32 } from '../stats/ScaleStats';
import { shimmerBlockFx, rainbowBoulderFx, rainbowRodHitFx, orchestraHslCss, hexToRgbArr, pooFlyFx }
  from '../fx/orchestraFx';
import { ParticleOrchestraType } from '../net/syncModules';

const KB_X = 10;               // 出生 kb 第二参 = 10f

// ===========================================================================
// ★SW-BJ67（2026-09-14）彩虹巨石 1047 行为面五债 D1/D2/D5（D4=CutTiles 豁免在
//   ProjCutTiles/Entity/types/Game 四件,D3=宠 1090 在 PetFollower）。
//   锚 1457=1458 同域逐字（2026-09-14 对拍 diff 零差,1458 全域行号 +1）。
// ===========================================================================
// ★SW-BJ88（2026-09-15）弹幕域四债清偿（全部 1457 锚 1:1;1458 同域逐字对拍 2026-09-15）：
//   债1 1013 专属分段弹支  P.cs:19129-19191（含 :26365 localAI[0] 拍龄钟、
//                          :19183-19186 静止杀、:19187-19190 >20 弹 Kill 门）
//   债2 boss 命中即碎      P.cs:14336-14340（TreatedAsABossForRainbowBoulders
//                          =NPC.cs:6868-6878 boss ∨ NPCID.cs:4873 集合）→ rbKill
//   债3 GetAreas 曼哈顿    Player.cs:4933-4957 Player.FindClosest（|Δx|+|Δy|）
//   债4① rotation 时序     P.cs:26679-26682 AI 段内（=本拍加速/重力/碰撞之前）
//   债4② cutTilesBox 边界  P.cs:15356-15377 +1=循环排除界（ProjCutTiles.ts）
// ===========================================================================
// ★SW-RB20a（2026-09-15）RB20a 溢出发现清偿：
//   F1 727/1054/1048 三型专属分段弹支
//     727  = P.cs:19196-19239（落地弹回 −0.65 + 双轴掷 3..5 发 763 碎片;撞墙 Kill
//            【后】碎片照发——旧仓被 else 桶吞进 99 家族①②,落地弹 0.2/碎面零碎片）
//     1054 = P.cs:19240-19302（撞墙【不碎】:X 档 0.1/0.25/0.5/0.8、Y 档同式缺省 0.6、
//            X 门 |lastVX|>2 → localAI[1]++、>1 Kill、静止杀——旧仓撞墙即碎=债本体）
//     1048 = P.cs:19303-19378（撞墙不碎:X/Y 档 0.1/0.2/0.45/0.75、门 |lastV|>4、
//            localAI[1]+=3、HitTiles+Item177+尘 322×10+PooFly(2..3)、静止杀、>20 Kill）
//            ——旧仓撞墙即碎=债本体
//   F2 :localAI0 字段注勘误：「1048 只写不读」伪——真读站 flag20 :19333 / 静止杀
//     :19370 / （原注漏读 :19303-19378 全支）;移植 F1 后时钟承重
//   F4 friendly 弹对玩家伤害面豁免——Damage_EVP 门 P.cs:14848 `!hostile → return`
//     （1047 SetDefaults :9920-9929 friendly=true 无 hostile 行 → 原版永不伤玩家;
//     家族余型 friendly+hostile 双旗 → EVP 照适用,旧仓 1047 撞玩家结算伤害=伪伤面）
//   登记债（域外观察,未落刀）：vanilla Kill() 对家族全型有死亡尘/声面
//     （P.cs:76379-76400 尘表 1013→243/727→40/1048→322 + 声 Item16/Item14/NPCHit29/
//     NPCDeath6/缺省 dig(0)）——本仓 rbKill 仅 1047 有爆段,余型静默;BJ88 债1 注
//     「1013 无专属爆面」系漏读该表（待立案）→ ★SW-BJ93 债2 落刀（2026-09-16）
// ===========================================================================
// ★SW-BJ93（2026-09-16）新登记账五债清偿（全部 1457 锚 1:1;1458 同域逐字对拍
//   2026-09-16:Kill 家族块/宽限门/两段伴生尘 byte-diff 全等,行号偏移见各锚）：
//   债1 aiStyle25 出膛宽限门（BJ88 立案）Damage_CanDealDamage 尾 P.cs:12491
//     （1458 :12491 逐字同）`aiStyle==25 && type∉{1021,1047,1005,1014} &&
//     localAI[2]<=7 → false`——Damage() :12512 门内四面（CutTiles/PVE/PVP/EVP）
//     出生全免。localAI[2] = 出生计数（AI_025 头 :26360 每 tick++,1458 :26361;
//     无人置初值=0 起,出生 1..7 拍无伤,第 8 拍首伤;1002=aiStyle16 无此钟）。
//     本仓伤害环（PVE+EVP）与 CutTiles 收口（:12515 friendly∧type!=1054 门;
//     CanCutTiles :15407 排除表无家族成员）此前均未接=债本体,CutTiles 面整缺同债补。
//   债2 Kill() 家族死亡尘/声面（BJ92 登记债）P.cs:76355-76500（1458 :76356-76501
//     同域逐字）——尘表 :76361-69（1013→243/727→40/1014→12/1021→323/1048→322/
//     缺省 1）+ 声 :76370-89（1048→Item16/1053→Item14/1054→NPCHit29/1055→
//     NPCDeath6/缺省 PlaySound(0)=dig）+ 1053 专属 :76390-76446（64 盒尘 31×25 +
//     尘 6×(40×2) + gore 61..63×4 + 盒还原）+ 1054 :76447-52（尘 30×20,vy=-1）+
//     1055 :76453-66（尘 192×50,scale×1.5/vel×2/noGravity）+ 缺省 :76467-78
//     （尘 num623×30,rand scale×1.4;:76476 `velocity *= 1.9f` 在环内=死写[弹已
//     Kill,velocity 无观察面],1:1 不移植）+ 掉落 :76479-87（1057→Item 5523/
//     1014→Item 29,owner==myPlayer 门单机恒真）+ :76488-76490 netMode!=1 支
//     （1048 SpreadPoopPyramid / 1053 LavaBoulderExplosion = 地形面,本刀未移植=
//     邻接债登记）。1047 不在族表（:72354 专属爆段=rbKillRainbowExplosion 已接）。
//   债3 aiStyle25 头部伴生尘：1053 三色尘 :26390-26410（1458 :26391-26411 逐字同;
//     尘 31/6/6 各 1/3 拍率）+ 1048 滚动尘 :26745-26749（1458 :26746-26750 同;
//     netMode!=2 ∧ |v|>1 门,Center+NextVector2Circular(w*0.4,h*0.4) 线性半径）。
//   债4 1002 TNTBarrel 双向偏差（RB21 新登记）：①EVP 豁免集 SkipDamage_EVP=
//     CreateBoolSet(108,164,1002)（ProjectileID.cs:275,1458 同行;全库唯一消费=
//     Damage_EVP 门 :14848/1458 :14848）——1002 原版 EVP 恒不适用=零接触伤玩家;
//     ②其玩家伤害面在 aiStyle16 Kill 支 SelfHurtPlayers（:71766-71795,调用 :71790
//     flag4=friendly∧!npcProj∧!RocketsSkip[1002=不在集 :189]、flag5=owner 三臂
//     单机恒真;本体 :15104-15152,FixedSelfDamageForPlayers :193 无 1002 行=自然伤,
//     trap=true :9539 → sweater cap 臂 :15119-22 适用;playerIndex=-1/pvp=false
//     :15124-27 hostile 弹）;③名实勘误 BoulderMech.ts「654 大石柱仙人掌球」→
//     TNTBarrel（TileID.cs:1745;WorldGen :49178 出生 dmg=400/kb=10）。
//   债5 Chilled 门同族幻影姿态（BJ80 域外观察）：vanilla Player.cs:28211
//     （1458 :28209 逐字同）`expertMode && ZoneSnow && wet && !lavaWet &&
//     !honeyWet && !arcticDivingGear && environmentBuffImmunityTimer==0`——
//     探针基面=湿粘滞位（读点在 num86 刷新 :28060/:28073 之后≡本拍 wet;RB20a F6
//     同族判例）;本仓 Player.ts 用 inWater&&!inLava&&!inHoney 桶位=同族幻影姿态
//     → wetSticky/splashLavaWet/splashHoneyWet 化（Player.ts）。
// ===========================================================================
// ★SW-BJ97/RB22a（2026-09-16）minor 清偿两债 + note 登记（全部 1457 锚 1:1;
//   1458 同域核对 2026-09-16:Kill 头闸/SetDefaults timeLeft/子更新环——行号见各注）：
//   债1 rbKill 头幂等闸   P.cs:71763-71765 `if (!active) return;`（1458 :71764-66;
//                         Kill 本体 :71752/:71753）——同拍多 Kill 支齐发第二发空转
//                         （1048 静止杀 :19370-72 + >20 弹杀 :19374-76 同拍可达齐发
//                         →家族死亡面双发尘 322×60+Item_16×2;1013 :19183-90、
//                         1054 :19294-300 同构双门同受本闸保护）
//   债2 json timeLeft 承接 ctor 读 vanilla-projectiles.json timeLeft 列（Arrow.ts
//                         life 先例）：1054=300/:1846、1055=900/:1850、1047=3600/
//                         :9927;1021 `timeLeft *= 3`=:1871（=缺省×3=10800,json 不载
//                         算术覆写→特支）;1002=2/:9535【独不承接】——本仓爆炸面已拆
//                         tntBarrelBlast（t+0 持自伤+NPC 面）,承接 2 = Check2x2 完整
//                         性流双自伤面及时可达（原版=弹体单面）,单面归一归 BJ93 债①
//   登记项（RB22a note,只登记未落刀）：
//   ① vy 帽位次          原版帽在 AI 段内重力支【前】（:26683-26686 velY>16→16,
//                         后重力 +0.3/:26738 → 终速 16.3;1021 重力 0.06/:26728 →
//                         16.06）——本仓 min(vy+0.3,16) 帽在加后=终速 16.0（差 0.3px/t）
//   ② 1021 运动核参数     X 加速 0.025/帽 ±3.5/门 |velY|<=1（:26703-26713）与重力
//                         0.06（:26728）未移植——本仓落通用支 0.05/7、0.3;专属弹跳支
//                         :19101-19125 未移植=BJ93 登记债③同面
//   ③ 1055 追踪切换面     落地 ai[1]=1（:19077-19080）/撞墙 ai[1]!=1→置1+HitTiles+
//                         声（:19095-19101）/AI 追踪支+rotation×0.6（:26591 区）整缺
//                         ——本仓 1055 撞墙静默不碎、无 ai[1] 面
//   ④ 注释线锚漂移        债账/字段注行号与现盘漂移（连续落刀所致,行为面无差=
//                         记账瑕疵;引用以锚语句文本为准）
//   ⑤ 1002 CutTiles 面    RB22a 原记「每拍面」——定谳修正：vanilla Damage() 无型别门
//                         （:17183 无条件每子更新,CutTiles :12515-18 门 friendly∧
//                         owner∧!npcProj∧!minion∧type!=1054）→ 面率与原版同相;
//                         真偏差=盒（本仓 31×31 vs 原版 260×260）与时长（本仓 life=
//                         3600 vs 原版 t+2 即 Kill）两维——归 BJ93 债①整建模范畴
//   ⑥ 池满掷形            spawnDust 池满时掷形（vanilla Dust 槽复用序 vs 本仓）
//                         RB22a 观察项,未定谳未落刀
// ===========================================================================
// ★SW-BJ93 债③/④/②（2026-09-16 wave2）三债清偿（全部 1457 锚 1:1;1458 同域逐字
//   byte-diff 全等 2026-09-16——1021 弹支 :19101-19128↔:19102-19129、家族①落地支
//   :19055-19099↔:19056-19100、1054 蛛网 :26394-26410↔:26395-26411、Kill 地形面
//   :76478-76489↔:76479-76490、LavaBoulderExplosion :71647-71661↔:71648-71662、
//   SpreadTile/SpreadPoopPyramid DelegateMethods.cs:469-599 同行、FloodFillTile
//   Utils.cs:2548-2592 同行、PlaceLiquid WorldGen.cs:4495-4546 同行）：
//   债③ 1021 MoonBoulder 专属弹跳支 :19101-19128——撞墙【不即碎】：Y 高速(>4)落地
//        弹回 −0.9、低速下落置 localAI[1]=999（停稳标记）;X 撞墙 localAI[1]<=3 →
//        弹回 −0.75++（四次内弹回）,>3 → Kill。旧仓落通用②即碎=BJ67 登记偏差。
//        ★本支零 RNG（无 Main.rand 掷,亲读定谳）→ 无掷序面;运动核参数（X 加速
//        0.025/帽 ±3.5/重力 0.06,:26702-26730）仍属 RB22a note② 登记债未动。
//   债④a 1053 落地 20 尘（家族①落地支 :19059-19071）——10 迭代×2 尘 6（盒=
//        (pos.X,pos.Y+8,w,h−8)、α100）:①scale2→v×8+noGravity ②scale1.25→v×2→
//        X×1.5→Y−2（原文三连写序）;位序=HitTiles 近似【前】。BJ93 债2 只接了
//        Kill 死亡面,落地尘整缺=本刀。
//   债④b 1054 蛛网铺置（AI_025 :26394-26410）——扫盒 x∈[(int)(px+1)/16,(int)(px+w)/16]
//        （y 同式,C# (int) 截断+int÷;31px 盒=3×3 格域）逐格 x 外 y 内,门=!active()
//        ∧ liquid==0 ∧ Next(7)==0（短路,空干格才掷）;铺置=PlaceTile(51,mute)——
//        tileSolid[51]=false → PlaceTile :59864 门经 `!tileSolid` 臂直过（EmptyTile
//        玩家/NPC 占用面【不适用】;AI 门已保空格）→ active+type 直写+SquareTileFrame。
//        ★放置占位豁免面判例（tileCut∪BreakableWhenPlacing 并集）在此【无】消费位
//        （该判例属 TileObject.CanPlace/Place 域;本处只往空格铺）;cutTilesBox 语义
//        核对：蛛网 sheet 51 ∈ TILE_CUT_SHEETS → 1054 滚过蛛网被 CutTiles 割除,
//        既有 cutTilesBox 面（TILE_CUT 单源）已 1:1 承载。
//   债② Kill 地形面（:76478-76489 netMode!=1 支,单机恒真）——1048→
//        SpreadPoopPyramid / 1053→LavaBoulderExplosion。★原版 Kill() 调用序亲读
//        定谳：尘表(:76361)→声(:76370)→1053 专属爆面(:76391)→1054/1055/缺省尘
//        (:76438-76469)→掉落(:76470-77)→【地形面最后】→ 故插 rbKillFamilyFace
//        掉落臂之后=掷序 1:1（1048 金字塔铺置尘 322 逐格 3×2 掷在家族死亡尘之后）。
//        1048 链=RunDelegateMethodPushUpForHalfBricks(:71627-71645 半砖顶推)→
//        FloodFillTile(Utils.cs:2548 BFS,7×7 位域,四邻序 左右上下,经 plot==true 格
//        扩散)→SpreadTile(666,322,pyramid)（DelegateMethods.cs:474-599:金字塔形门
//        1/3/5/3 行、TryKillingReplaceableTile、PlaceTile(EmptyTile 语义=空格∧无玩家
//        ∧无 NPC)、成功面 3×2 尘 322+邻坡拍平+草族 3×3 全围实心 KillTile(fail:true)
//        转化）。1053 链=半径 4 圆盘（81 盒内 Distance<4）∧CanHit 线→PlaceLiquid
//        (1,255)（WorldGen.cs:4495-4546:实心门/注液满 255/异液合并 岩浆×水→黑曜石
//        56、×蜂蜜→脆蜂蜜 230、×微光→659）。本面零掷序交叉（1053 零 RNG）。
// ===========================================================================
// ★SW-BJ93 债①/BJ102（2026-09-16）1002 aiStyle16 建模余波单面归一（四件同刀;
//   全部 1457 锚 1:1;1458 同域逐字 2026-09-16——Kill 支 :71766-71795↔:71767-71796、
//   AI_016 Kill 闸 :48031-48035↔:48032-48036、SetDefaults :9525-9539↔:9526-9540、
//   Damage 减半 :12971-12975↔同行、NewProjectile :49178↔同域、Utils.ToTileCoordinates
//   :1899-1902↔同行、DelegateMethods.SpreadTile :474-599↔同域）：
//   ① life=2 承接（json :9535 列;BJ97 3600 carve-out 退役——其存在前提「格侧爆炸面
//     已拆 tntBarrelBlast」随格侧面归零而消失,双自伤面不复存在）
//   ② 爆炸面=弹侧 rbKill1002Face→Game.explodeAt 单发（vanilla aiStyle16 Kill flag3
//     臂全序:PrepareBombToBlow[1002 无 resize 支]→SelfHurtPlayers :71790→Damage
//     :71792→Kill_Bombs_DoUsualKillCode :80125 大族视觉→Kill_ExplodeTiles :79027
//     闸门表无 1002=零地形破坏[:79064 死代码,SW-J1 定谳沿立]）;格侧 tntBarrelBlast
//     改 spawnTntBarrelRoll Spawn-only（Game.ts,vanilla 格侧无爆炸面——KillTile 654
//     只经 Check2x2 destroy 块 NewProjectile :49178;destroyObject 单飞闸
//     boulderDestroyGuard 收编 Game 654 挖除臂,改前实证挖一格=3×格侧爆炸面+2×幻影弹）
//   ③ Kill 拍 Damage() 面=dmg=DV(400)/2（:12971-75 逐字,explodeAt 1002 链承载;
//     usesIDStaticNPCImmunity 15t 对 1 拍寿命弹无观察面）;旧 rbSelfHurtPlayers
//     单臂面退役（SelfHurt+Damage 同在 Kill flag3 臂,拆两处=建模余波本体）
//   ④ tileCollide=false（SetDefaults :9533/json 列;首拍即 Kill=零位移,声明位 1:1）
//   拍序表（vanilla 单机）:出生(KillTile 654→:49178 NewProjectile,260×260/
//   timeLeft=2/零速)→t+0 首 AI 拍:AI_016 :48031 timeLeft≤3→Kill→自伤 400(DV)+NPC
//   200(dmg/2)+视觉(Item14+尘31×50+尘6×160+gore×8,盒 pos..pos+260)→active=false;
//   t+1 桶扫移除。本仓同相（fixedUpdate 头=计数器→Kill 闸,先于运动核/湿段/伤害环）。
//   邻接登记（域外观察,未落刀）:①explodeAt 全域无 CutTiles 支——vanilla Damage()
//   :12515-12518 门内 CutTiles 每拍（炸弹/1002 爆炸应割 tileCut 草族）,本仓爆炸面
//   整缺=独立债;②真实巨石挖路径多 Spawn（TrapShot×2+RollingBoulder×1,挖 138 实证
//   3 弹）=家族挖除臂与 Check2x2 convert 双口并存,654 已单飞归一,余型待立案;
//   ③654 出生位已还原 vanilla :49178 字面 +8/+8（260 盒无嵌柱问题,余型 +0.5 冻结
//   偏差延续）。
// ===========================================================================

// ===========================================================================
// ★SW-BJ93 债4①（2026-09-16）：ProjectileID.Sets.SkipDamage_EVP（ProjectileID.cs:275
//  Factory.CreateBoolSet(108,164,1002);1458 :275 逐字同）——原版全库唯一消费 =
//  Damage_EVP 门（P.cs:14848/1458 :14848 `… || SkipDamage_EVP[type] → return`）：
//  集 108 Explosives/164 Landmine/1002 TNTBarrel 三型【永不】经弹幕接触 EVP 伤玩家
//  （1002=tile 654 TNTBarrel 出生弹,aiStyle16,玩家伤害面唯一在 aiStyle16 Kill 支
//  SelfHurtPlayers :71766-71795）。108/164 本仓无活体弹实体（接线引爆走 Game.explodeAt
//  自伤段=SelfHurtPlayers 同构面,EVP 面结构性不存在）→ 本集在本仓唯一活消费 = 本类
//  1002 的 EVP 环（fixedUpdate 尾）。1002 SetDefaults :9525-9539 friendly+hostile
//  双旗,旧仓 hostile 门照伤接触=双向偏差之正向（RB21 R3 定谳）。
// ===========================================================================
export const SKIP_DAMAGE_EVP: ReadonlySet<number> = new Set([108, 164, 1002]);

/** ★SW-BJ93 债2：Kill() 家族尘/声臂族表（P.cs:76355 `else if (type == 99 || 1013 ||
 *  727 || 1014 || 1021 || 1048 || 1053 || 1054 || 1055 || 1057)`;1458 :76356 同）——
 *  1047 :72354/1005 :76487/1078 :76497 各有专属支不落族表;1002=aiStyle16 支
 *  （:71766）亦不落（本仓 1002 走 SelfHurtPlayers 面,无族尘）。 */
const RB_KILL_FAMILY: ReadonlySet<number> = new Set(
  [99, 1013, 727, 1014, 1021, 1048, 1053, 1054, 1055, 1057]);

// ---- ★SW-BJ93 债②（2026-09-16）地形面世界写入伴生表（sheet 域,勿用 def.platform
//  超集替代——SW-AW1b 判例:Platform 门必须按 TileID.cs:243 表读）----
/** TileID.Sets.Platforms（TileID.cs:243 全 7 元素直抄）——SpreadTile 邻坡拍平门 */
// ★BJ182b 收编单源 data/tiles.ts:PLATFORMS_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const RB_PLATFORM_SHEETS = PLATFORMS_SHEETS;
/** TileID.Sets.IsADripTile（TileID.cs:157 全 5 元素直抄）——TryKillingReplaceableTile
 *  可杀面第三支（:59809）。
 *  ★BJ203 收编单源 data/tiles.ts:IS_A_DRIP_TILE_SHEETS（逐值对拍全等,tests/tile-domain-sentinel §6h） */
const RB_DRIP_SHEETS: ReadonlySet<number> = IS_A_DRIP_TILE_SHEETS;
/** SpreadTile 草族转化表（:554 白名单 {2,23,60,70,109,199,477,492} × KillTile(fail:true)
 *  转化支 :64228-64239——2/23/109/199/477/492→0 土、60/70→59 泥） */
const RB_GRASS_TO_BARE: Record<number, 'dirt' | 'mud'> = {
  2: 'dirt', 23: 'dirt', 109: 'dirt', 199: 'dirt', 477: 'dirt', 492: 'dirt',
  60: 'mud', 70: 'mud',
};

/** ★SW-BJ97/RB22a 债2（2026-09-16）：家族 timeLeft 终值单源（ctor 消费;Arrow.ts
 *  life 先例=ctor 读 vanilla-projectiles.json timeLeft 列）。
 *  · 1021：原版 `timeLeft *= 3`（P.cs:1871,1458 同行）= 缺省 3600×3=10800——算术
 *    覆写,json 只有字面赋值列（1021 行仅 extraUpdates=1）→ 特支锚终值。原版递减
 *    在 Update 子更新环（:17307,环 :16780-81）每帧 extraUpdates+1=2 次 → 实时 90s;
 *    本仓 extraUpdates 未消费每帧 −1 → 180s（字段值 1:1,速率差=既有登记债,勿把
 *    ÷2 烘进初值——会掩盖 extraUpdates 债）。
 *  · 1002：★BJ93 债①/BJ102（2026-09-16）归一落刀,旧 3600 carve-out 退役——json/
 *    原版 timeLeft=2（P.cs:9535,1458 同行）直接按列承接。原版 1002 是 aiStyle16
 *    弹体单面引信：首 AI 拍 `timeLeft≤3 → Kill()`（AI_016_Bombs :48031-48035）→
 *    自伤+NPC 减半+大族视觉一发全清（详 rbKill1002Face 注）;格侧 tntBarrelBlast
 *    已同步改 Spawn-only（Game.ts,0 爆炸面）→ 双自伤面（BJ97 判 400×2）随格侧
 *    面摘除而消除,承接 2 不再有回归面。
 *  · 余型：json 有列按列（1054=300/:1846、1055=900/:1850、1047=3600/:9927）,
 *    无列=原版无覆写 → 缺省 3600（P.cs:789）。 */
export function boulderTimeLeft(projId: number): number {
  if (projId === 1021) return 10800;                 // P.cs:1871 timeLeft *= 3（json 无列）
  const jt = projectileData(projId)?.timeLeft;
  return jt !== undefined ? jt : 3600;               // 1002=2（json :9535 列,BJ102 归一承接）
}

/** Utils.Remap 前向档（GetLerpValue clamped + Lerp,Utils.cs:761-780/:496-502——
 *  本域唯二调用 :20342 Remap(len,0,200,4,32) 恒 from<to;反向 GetLerpValue(10,0,i)
 *  在 D2 爆段直写 1−i/10） */
function remap1457(v: number, fMin: number, fMax: number, tMin: number, tMax: number): number {
  const t = (v - fMin) / (fMax - fMin);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return tMin + (tMax - tMin) * c;
}

/** AABB 相交（Rectangle.Intersects,XNA 闭开语义 = 原版逐轴 `l < r && r > l`） */
function rectsIntersect(ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Utils.CenteredRectangle（Utils.cs:1560-1563：position=(center−size/2).ToPoint()
 *  截断、size.ToPoint()） */
function centeredRect(cx: number, cy: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  return { x: Math.trunc(cx - w / 2), y: Math.trunc(cy - h / 2), w: Math.trunc(w), h: Math.trunc(h) };
}

/** Collision.SolidCollision（Collision.cs:2713-2745 直译）——D5 动态门消费。
 *  扫盒 = (int)(pos/16)−1 .. (int)((pos+size)/16)+2（【开】区间,整型截断）,
 *  钳世界（Y 上缘 maxTilesY−40）；格门 = !inActive() && active() && tileSolid &&
 *  !tileSolidTop,halfBrick 半格（y+8,高 8）；命中判据 = 查询盒 × 调整后格盒逐轴。 */
function solidCollision1457(
  st: { w: number; h: number; idx(x: number, y: number): number; hasTile(x: number, y: number): boolean;
    isActuated(x: number, y: number): boolean; get(x: number, y: number): number; half: Uint8Array },
  px: number, py: number, pw: number, ph: number,
): boolean {
  let x0 = Math.trunc(px / 16) - 1;
  let x1 = Math.trunc((px + pw) / 16) + 2;
  let y0 = Math.trunc(py / 16) - 1;
  let y1 = Math.trunc((py + ph) / 16) + 2;
  x0 = Math.min(Math.max(x0, 0), st.w - 1);
  x1 = Math.min(Math.max(x1, 0), st.w - 1);
  y0 = Math.min(Math.max(y0, 0), st.h - 40);
  y1 = Math.min(Math.max(y1, 0), st.h - 40);
  for (let i = x0; i < x1; i++) {
    for (let j = y0; j < y1; j++) {
      if (!st.hasTile(i, j) || st.isActuated(i, j)) continue;
      const def = TILE_DEFS[st.get(i, j)];
      if (!def || !def.solid || def.platform) continue;
      let vy = j * 16;
      let vh = 16;
      if (st.half[st.idx(i, j)] !== 0) { vy += 8; vh -= 8; }
      if (px + pw > i * 16 && px < i * 16 + 16 && py + ph > vy && py < vy + vh) return true;
    }
  }
  return false;
}

/** Utils.SolveQuadratic（Utils.cs:737-752）——浮点 IEEE 直译（a=0 时 JS 同出 ±Inf/NaN） */
function solveQuadratic1457(a: number, b: number, c: number): [number, number] | null {
  const num = b * b - 4 * a * c;
  if (num > 0) {
    const sq = Math.sqrt(num);
    return [(-b + sq) / (2 * a), (-b - sq) / (2 * a)];
  }
  if (num < 0) return null;
  const r = (-b + Math.sqrt(num)) / (2 * a);
  return [r, r];
}

/** Utils.GetChaseResults（Utils.cs:651-690 直译）——拦截求解器 */
interface ChaseResults1457 { happens: boolean; time: number; cvx: number; cvy: number }
function getChaseResults1457(cx: number, cy: number, speed: number,
  rX: number, rY: number, rvX: number, rvY: number): ChaseResults1457 {
  if (cx === rX && cy === rY) return { happens: true, time: 0, cvx: 0, cvy: 0 };
  if (speed <= 0) return { happens: false, time: 0, cvx: 0, cvy: 0 };
  const dx = cx - rX, dy = cy - rY;
  const num = Math.hypot(dx, dy);
  const num2 = Math.hypot(rvX, rvY);
  let time: number;
  let ipX: number, ipY: number;
  if (num2 === 0) {
    time = num / speed;
    ipX = rX; ipY = rY;
  } else {
    const a = speed * speed - num2 * num2;
    const b = 2 * (dx * rvX + dy * rvY);
    const c = -num * num;
    const roots = solveQuadratic1457(a, b, c);
    if (!roots) return { happens: false, time: 0, cvx: 0, cvy: 0 };
    if (roots[0] < 0 && roots[1] < 0) return { happens: false, time: 0, cvx: 0, cvy: 0 };
    time = (roots[0] > 0 && roots[1] > 0) ? Math.min(roots[0], roots[1]) : Math.max(roots[0], roots[1]);
    ipX = rX + rvX * time;
    ipY = rY + rvY * time;
  }
  return { happens: true, time, cvx: (ipX - cx) / time, cvy: (ipY - cy) / time };
}

/** Utils.FactorAcceleration（Utils.cs:714-719）——descendOfProjectile=(0,0.6f) 内联
 *  （JumpToPosition :20355/:20364 唯二调用）。★登记偏差：t<=0 时原式 0/0=NaN
 *  （velocity 中毒——vanilla 语义,同位 ChaseResults 同位特支 time=0 可达）,本仓
 *  物理面不容 NaN,守卫为原值不动（数值面其余逐字）。 */
function factorAcceleration1457(cvx: number, cvy: number, t: number, framesOfLenience: number): [number, number] {
  if (!(t > 0)) return [cvx, cvy];
  const num = Math.max(0, t - framesOfLenience);
  const fy = 0.6 * (num * num) / 2 / t;
  return [cvx - 0 * fy, cvy - fy];
}

/** TileID.Sets.Ore（TileID.cs:403 Factory.CreateBoolSet 全 19 元素直抄）
 *  ★BJ203 收编单源 data/tiles.ts:ORE_SHEETS（逐值对拍全等,tests/tile-domain-sentinel §6h） */
const RB_ORE_SHEETS = ORE_SHEETS;

/** TileID.Sets.FriendlyFairyCanLureTo（TileID.cs:413 全 17 元素）——★BJ210 收编单源
 *  data/tiles.ts:FRIENDLY_FAIRY_CAN_LURE_TO_SHEETS（逐值对拍 17≡17,tests/tile-domain-sentinel §6i） */
const RB_FAIRY_LURE_SHEETS = FRIENDLY_FAIRY_CAN_LURE_TO_SHEETS;

/** Main.tileOreFinderPriority（Main.cs:6355-6391）∩ FriendlyFairyCanLureTo——
 *  扫描候选集先被 :20394 帧门收窄到上表 17 sheet,本表覆盖即全量；逐值与
 *  SceneMetrics.ORE_FINDER_PRIORITY 同源核对一致（2026-09-14）。表外 sheet
 *  原版取默认 0（非 −1,候选仍有效——勿仿 Enemy.fairyTreasureCoords 的 <0 跳过式）。 */
const RB_LURE_PRIORITY: Record<number, number> = {
  8: 260, 169: 270, 21: 500, 467: 500, 107: 600, 221: 610, 108: 620, 222: 630,
  111: 640, 223: 650, 211: 700, 12: 550, 665: 550, 639: 550, 236: 810, 702: 810, 227: 750,
};

/** SceneMetrics.IsValidForOreFinder（SceneMetrics.cs:904-919 直译） */
function rbOreFinderValid(sheet: number, frameX: number): boolean {
  if (sheet === 227) return frameX >= 272 && frameX <= 374;
  if (sheet === 129) return frameX >= 324;
  return true;
}

/** PerformSmartBounce 敌怪扫描行（NPC.CanBeChasedBy NPC.cs:78671-78679 直译门:
 *  active && chaseable && lifeMax>5 && !dontTakeDamage && !friendly && !immortal;
 *  ★chaseable 位本仓 Enemy 无承载=恒真近似——该位原版仅个别 AI 段写否,登记）。 */
interface RBChaseCandidate {
  dead?: boolean; friendly?: boolean; immortal?: boolean; dontTakeDamage?: boolean;
  maxHp?: number; x: number; y: number; w: number; h: number;
  vx?: number; vy?: number; cx: number; cy: number;
}

/** Main.hslToRgb(h,s,l)（Main.cs:48689-48717 + hue2rgb :48737-48757 直译,浮点 0..1 出）。
 *  ★SW-BJ64b：仅 1047 彩虹光消费（s=1,l=0.6 → 每通道 0.2..1.0 浮点,addLight 端 >1 合法,
 *  原版 Lighting.AddLight 即收 >1 值,出口钳 255=LightingEngine present 截断同向）。 */
function hslToRgb1457(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (c: number, t1: number, t2: number): number => {
    if (c < 0) c += 1;
    if (c > 1) c -= 1;
    if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
    if (2 * c < 1) return t2;
    if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
    return t1;
  };
  if (s === 0) return [l, l, l];
  const t2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const t1 = 2 * l - t2;
  return [hue2rgb(h + 1 / 3, t1, t2), hue2rgb(h, t1, t2), hue2rgb(h - 1 / 3, t1, t2)];
}

/** ★SW-BJ64b 切片金标（Main.cs:33209 `Frame(5,20, proj.frame/20, proj.frame%20)`——
 *  Utils.cs:1389 Frame 直译：cell = (W/5×frameX, H/20×frameY, W/5, H/20)。1458 :33215
 *  同值）。Projectile_1047.png 95×380 → 19×19 壳 ×(5 列色相带 × 20 行微光相)。
 *  导出=金标测试消费（tests/sw-bj64b-frames.test.ts），draw() 同源调用=测的就是跑的。 */
export function rainbowBoulderCell(
  frame: number, texW = 95, texH = 380,
): { sx: number; sy: number; sw: number; sh: number } {
  const sw = texW / 5, sh = texH / 20;
  const f = ((frame % 100) + 100) % 100;
  return { sx: sw * Math.floor(f / 20), sy: sh * (f % 20), sw, sh };
}

/** ★SW-BJ64b 拖尾光金标（P.cs:26420-26435;1458 :26421 同值）：hue =
 *  ((GlobalTimeWrappedHourly×120)%300)/300 → hsl(hue,1,0.6) 基色 ×1.4（vector23）×
 *  (1−i/10)（num208=Utils.Remap(i/len,0,1,1,0) 线性 × num207²≡1）。gtw=运行秒%3600。
 *  导出=金标测试+fixedUpdate/draw 同源。 */
export function rainbowBoulderLight(
  gtw: number, i: number, trailLen = 10,
): [number, number, number] {
  const [r, g, b] = hslToRgb1457(((gtw * 120) % 300) / 300, 1, 0.6);
  const f = 1.4 * (1 - i / trailLen);
  return [r * f, g * f, b * f];
}

// ===========================================================================
// ★SW-BJ88（2026-09-15）债2：TreatedAsABossForRainbowBoulders 伤害面（BJ67 登记债）
// ===========================================================================

/** NPCID.Sets.ShouldBeCountedAsBossForRainbowBoulders（NPCID.cs:4873
 *  Factory.CreateBoolSet(false,…) 全 38 元素直抄;1458 :4873 逐字同,2026-09-15 对拍。
 *  语义 = 无 boss 位但按 boss 计入"巨石撞上即碎"面的部件/事件体：世吞三段 13-15、
 *  毁灭者 134-136、哀木 325、南瓜王 327、霜月 344-346、火把神 664 等（部件名以
 *  仓内既有对账注释为准,勿凭印象扩注）。 */
export const RAINBOW_BOULDER_BOSS_IDS = new Set([
  517, 422, 507, 493, 13, 14, 15, 267, 36, 114, 664, 134, 135, 136, 128, 129,
  130, 131, 245, 247, 248, 246, 491, 492, 392, 395, 394, 393, 564, 565, 576,
  577, 551, 325, 327, 344, 345, 346,
]);

/** NPC.TreatedAsABossForRainbowBoulders（NPC.cs:6868-6878 直译;1458 :6869 同）：
 *  `boss ? true : ShouldBeCountedAsBossForRainbowBoulders[type]`。boss 位取仓内
 *  实例/def 双落点（MinionProj.ts:4653 同款口径;VANILLA_BOSS_IDS=SetDefaults
 *  boss=true 对账集,已含 EoW 头 :79225 动态置位面）。 */
export function treatedAsABossForRainbowBoulders(
  vanillaId: number | null | undefined, boss: boolean | undefined,
): boolean {
  if (boss) return true;
  return vanillaId != null && RAINBOW_BOULDER_BOSS_IDS.has(vanillaId);
}

export class RollingBoulder extends Entity {
  w = 31; h = 31;
  /** ★FX34c 弹幕域 hoik=true（Body.hoik 注:原版 Projectile 全路径 true） */
  hoik = true;
  /** 原版弹 id（Atlas: vanilla/Projectile_{id}.png） */
  readonly projId: number;
  /** timeLeft 基线（vanilla 缺省 3600,P.cs:789;1458 :789 同）。★SW-BJ97/RB22a 债2
   *  （2026-09-16）：SetDefaults 逐型覆写终值 ctor 读 vanilla-projectiles.json
   *  timeLeft 列承接（Arrow.ts life 先例同款）——1054=300（:1846）/1055=900（:1850）/
   *  1047=3600（:9927 显式行）/1002=2（:9535,【独不承接】见 ctor 注）;旧注「json
   *  无覆盖 → 引擎通用 life 兜底同位」对 1054/1055/1002 失实（json 有列而 ctor 不读）
   *  =RB22a 勘误退役。1021 原版 `timeLeft *= 3`（:1871,=缺省 3600×3=10800;1458 同行）
   *  算术覆写 json 提取器不载 → ctor 特支锚终值。递减语义：vanilla timeLeft-- 在
   *  Update 子更新环内（P.cs:17307,环 :16780-81 `numUpdates = extraUpdates` while≥0;
   *  1458 :17306,环 :16781-82）每帧 extraUpdates+1 次 → 1021 原版实时 10800÷2=5400t
   *  =90s;本仓 extraUpdates 未消费（BJ93 登记债①邻接域,非本刀）每帧 −1 → 10800t
   *  =180s 实时（字段值 1:1,速率差=债面;勿把 ÷2 烘进初值——会掩盖 extraUpdates 债）。 */
  life = 3600;
  /** 出生表伤害 */
  readonly dmg: number;
  rotation = 0;
  /** 每目标命中免疫：目标 id → 剩余 tick（localNPCHitCooldown=10 镜像） */
  private immunities = new Map<number, number>();

  // ---- ★通用湿段（Projectile.cs:16903-17113 全体弹共用段,2026-09-04 溅花缺口批
  //  → projWetSection 共享体接入;豁免核对（SetDefaults 逐 id,ignoreWater=缺行）：
  //  · :1835-1852 共块 {99,727,1013,1014,1053,1054,1055,1057} 无 ignoreWater 行 → 受段
  //  · 1048 :9930-9939 无行 → 受段;1047 :9920-9929 `ignoreWater=true`@:9928 → 豁免
  //    （共享体整段门早退,四旗恒 false,溅花/阻尼零触发——与原版 :16903 同向）
  //  · 1002（sheet 654 TNTBarrel,TileID.cs:1745）:9525-9539 无行 → 受段（注：原版 1002 是
  //    aiStyle 16 弹,本类按既有模型同跑 AI_025——湿段仍按真 id 1002 传参接线）----
  //  位序口径：AI_025（踢门/滚转/滚地加速/重力/:26748 AnyWet 消费）→ 湿段(:16903)
  //  → moveAndCollide（HandleMovement :17721-17764 湿阻尼读【本拍刷新后】旗,乘进
  //  dx/dy 入参、采纳处原样回读）。99 系 aiStyle 25 不在 UpdatePosition 跳过表
  //  （:20551）→ 阻尼适用。
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐 update −1） */
  wetCount = 0;
  /** 出生预置已做（NewProjectile :10886-10892 等价;共享体首调用执行） */
  presetDone = false;

  // ---- ★SW-BJ64b（2026-09-13）1047 彩虹壳帧账/拖尾（P.cs:26411-26471 / Main.cs:33205-33210;
  //  1458 :26412/:33211 同域逐字=1457,零变更）----
  /** 弹帧 0..99：Projectile_1047.png 95×380 = 5 列×20 行 19×19 壳表（列=frame/20 色相带、
   *  行=frame%20 微光相,100 帧环 200t）;AI 每 2t 前进（P.cs:26414-26418）。 */
  frame = 0;
  private frameCounter = 0;
  // ---- ★SW-BJ67（2026-09-14）行为面债 D1/D2/D5 域 ----
  /** D5：ai[1] 弹跳宽限计数（JumpToPosition P.cs:20368 置值；AI :26438-26441 消费——
   *  >0 期间 tileCollide=false 穿墙 + flag9 跳过静止自启,逐拍 −1） */
  ai1 = 0;
  /** D1：localAI[1] 高速弹跳/撞墙计数（CheckBounce :20192 ++；★1457/1458 同域核对——
   *  1047 域内只写不读,1:1 照抄;★SW-BJ88 债1：1013 同计数【写+读】——专属弹支
   *  :19187-19190 `localAI[1] > 20 → Kill`（20 弹上限门）;1021（>3 Kill）未移植;
   *  ★SW-RB20a F1：1054【写+读】（X 门 :19285 ++ → :19298 `>1 Kill` 两次撞墙上限）、
   *  1048【写+读】（flag21 支 :19353 `+= 3` → :19374 `>20 Kill`）） */
  localAI1 = 0;
  /** ★SW-BJ88 债1（2026-09-15）：localAI[0] 存活拍龄（AI_025 头 :26365-26368 逐字——
   *  `type==1013||type==1048` 每 tick ++;1458 :26366 同）。1013 专属弹支消费：
   *  flag16 钟摆门 :19159 `>= 500`（500t 后低速碰撞也计硬弹）+ 静止杀 :19183
   *  `> 50`。★SW-RB20a F2 勘误（2026-09-15）：旧注「1048 在 1457 全域只写不读
   *  （:11839/:12152/:19303/:76371/:76480 五站逐一核空）」系漏读 :19303-19378 专属
   *  支——1048 真读站三处：flag20 钟摆门 :19333 `>= 500`、静止杀 :19370 `> 50`（写+读
   *  承重）;F1 移植后本钟对 1048 为承重位。1054 不在钟内（:26365 仅 1013/1048）→
   *  其支内 flag18 :19270 / 静止杀 :19294 恒假 = vanilla 死门,1:1 保留不裁。 */
  localAI0 = 0;
  /** ★SW-BJ93 债1（2026-09-16）：localAI[2] 出生拍龄计数（AI_025 头 :26360 每 tick
   *  ++,1458 :26361 同;无人置初值 → 0 起）——Damage_CanDealDamage 尾 :12491 消费：
   *  aiStyle25 ∧ type∉{1021,1047,1005,1014} ∧ localAI[2]<=7 → 伤害四面全免（出生
   *  1..7 拍,第 8 拍首伤）。vanilla Update 序 = AI(:16880 先++) → Damage(:17184 后读),
   *  本仓同序（fixedUpdate 头 ++/尾环读）。★1002=aiStyle16（SetDefaults :9525-9539）
   *  不在 aiStyle25 钟内 → 不计数不受门;1021/1047/1014 豁免（1005 MiniBoulder 本仓
   *  不可达,集照抄）。原版 localAI 不同步联机（单源本地）=单机面零差。 */
  localAI2 = 0;
  /** D5：Projectile.tileCollide 镜像（physics/TileCollision.Body 同名可选位——
   *  AI_025 :26437 每 tick 动态写,moveAndCollide 读 false 时整段跳过碰撞直写位移） */
  tileCollide?: boolean;
  /** TrailingMode[1047]=0（ProjectileID.cs:385 表尾）旧位环 10 段——P.cs:17199-17203
   *  每拍【位移后】shift+头插 [0]=position;trailN = 非 Zero 段数（消费端与原版
   *  Vector2.Zero 哨兵截断同义）。 */
  private readonly trailX = new Array<number>(10).fill(0);
  private readonly trailY = new Array<number>(10).fill(0);
  private trailN = 0;

  constructor(x: number, y: number, sheet: number) {
    super();
    this.x = x; this.y = y;
    const row = BOULDER_CONVERT_TABLE[sheet];
    this.projId = row?.proj ?? 99;
    this.dmg = row?.dmg ?? 70;
    // ★SW-BJ97/RB22a 债2（2026-09-16）+BJ93 债①/BJ102（2026-09-16）归一：json
    //  timeLeft 承接（Arrow.ts life 先例）——终值规则单源 boulderTimeLeft()
    //  （1021 无 tile sheet 行 ctor 不可达,测试面直调锚定;1002=2 已按列承接）。
    this.life = boulderTimeLeft(this.projId);
    // ★BJ93 债①④（BJ102）：1002 SetDefaults tileCollide=false（P.cs:9533,json 列同）——
    //  弹体零位移（出生零速+aiStyle16 无运动核+首拍即 Kill）,本旗为声明位 1:1;
    //  aiStyle25 家族余型缺省 undefined=真（原版缺省 true,:9533 仅 1002 显式 false）。
    if (this.projId === 1002) this.tileCollide = false;
  }

  /** ai[0]：首 tick 后恒 1（cs:26682）；静止自启支的前置门 */
  private ai0 = false;

  fixedUpdate(dt: number, game: GameHooks): void {
    void dt;
    for (const [id, t] of [...this.immunities]) {
      if (t <= 1) this.immunities.delete(id); else this.immunities.set(id, t - 1);
    }
    // ---- ★SW-BJ88 债1 伴生位（AI_025 头 :26365-26368 逐字;1458 :26366 同）：
    //  1013/1048 每 tick localAI[0]++（存活拍龄;读点与 1048 只写面见字段注）----
    if (this.projId === 1013 || this.projId === 1048) this.localAI0++;
    // ---- ★SW-BJ93 债1 伴生位（AI_025 头 :26359-26360 逐字;1458 :26360-26361 同）：
    //  aiStyle25 全型每 tick localAI[2]++（出生拍龄;无型别门,原版 else-if aiStyle==25
    //  支首行）——1002=aiStyle16 不进支=不计数（rbDamageCanDeal 门同构排除）----
    if (this.projId !== 1002) this.localAI2++;
    // ---- ★SW-BJ93 债①/BJ102（2026-09-16）：1002 aiStyle16 Kill 闸（AI_016_Bombs
    //  :48031-48035 `else if (owner == Main.myPlayer && timeLeft <= 3) Kill();`——
    //  owner 单机恒真（NewProjectile :49178 owner=Main.myPlayer）;timeLeft=2（json
    //  :9535 列承接,BJ102）→ 首 AI 拍即 Kill,爆炸面单发（rbKill1002Face）。原版位序
    //  =AI 段内（:16880 AI 先于湿段/位移/timeLeft--）→ 本闸置于运动核/湿段/弹跳/
    //  常规 life--/伤害环【之前】,1002 终身不进 aiStyle25 任何面（零位移/零接触结算,
    //  与原版弹体 1 拍寿命同相）。前置支 :48028-48030（1088 支）与 wet 引信表
    //  （:47770,1002 不在集）/IsABombWithFuse（ProjectileID.cs:277,无 1002=无引信声）
    //  对 1002 逐条核空=本闸即首个可达语句。----
    if (this.projId === 1002 && this.life <= 3) {
      this.rbKill(game);
      return;
    }
    // ---- ★SW-BJ67 D5 伴生位（AI_025 :26373 `bool flag9 = false` 的等价前算）：
    //  flag9 仅在 :26440（ai[1]>0 宽限支）被置 !tileCollide（宽限期 tileCollide 恒
    //  false → flag9=true）,唯一消费点 = 下行静止自启门 :26595 `!flag9`。本域 ai[1]
    //  只在弹跳宽限支内递减,本拍前置点读 ai[1] 与 :26437 门读值同拍（递减在后），
    //  故 flag9 ≡ (ai1 > 0)。 ----
    const flag9 = this.ai1 > 0;
    // ---- ★SW-BJ93 债3（2026-09-16）：1053 三色伴生尘（AI_025 :26390-26410 逐字;
    //  1458 :26391-26411 同,原版位序=flag9 置位后/1054 蛛网支与 1047 专支之前）——
    //  三支独立 1/3 拍率：①尘 31 烟（盒 pos+(6,6) 尺 (w-12,h-12)、α100、scale1.5、
    //  vel×0.3 后 vy−2）②尘 6 火（盒 pos+(4,4) 尺 (w-8,h-8)、α100、scale1.5、
    //  noGravity）③尘 6 火（盒 pos 全盒、α100、无 scale、vy−1）。1053 = 熔岩巨石
    //  （滚过留火痕的可见面,旧仓整缺）。----
    if (this.projId === 1053) {
      if (Math.floor(Math.random() * 3) === 0) {            // :26390 Next(3)==0
        const d = game.spawnDust?.(this.x + 6, this.y + 6, this.w - 12, this.h - 12,
          31, 0, 0, 100, null, 1.5);
        if (d) { d.vx *= 0.3; d.vy *= 0.3; d.vy -= 2; }     // :26395-26396 vel×0.3 → vy−2
      }
      if (Math.floor(Math.random() * 3) === 0) {            // :26398 Next(3)==0
        const d = game.spawnDust?.(this.x + 4, this.y + 4, this.w - 8, this.h - 8,
          6, 0, 0, 100, null, 1.5);
        if (d) d.noGravity = true;                          // :26401
      }
      if (Math.floor(Math.random() * 3) === 0) {            // :26403 Next(3)==0
        const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 6, 0, 0, 100);
        if (d) d.vy -= 1;                                   // :26406 velocity.Y--
      }
    }
    // ---- ★SW-BJ93 债④b（2026-09-16）：1054 蛛网铺置（AI_025 :26394-26410 逐字;
    //  1458 :26395-26411 同域 byte-diff 全等;原版位序=1053 三色尘后/1047 专支与
    //  静止自启前,读【本拍 AI 头】的弹盒位置）。门序=!active() ∧ liquid==0 ∧
    //  Next(7)==0（短路:空干格才掷,RNG 消费随格遍历 x 外 y 内逐位同序）;铺置=
    //  PlaceTile(51,mute:true)（tileSolid[51]=false → :59864 门经 `!tileSolid` 臂
    //  直过,EmptyTile 玩家/NPC 占用面不适用——AI 门已保空格）→ active+type 直写+
    //  SquareTileFrame(:60746-60753,本仓 setTile 监听链承载);netMode==2
    //  SendTileSquare 单机不达。OOB 格本仓 inBounds 跳过（vanilla 裸 Main.tile
    //  越界会炸,弹体活着到不了世界外=守卫面）。----
    if (this.projId === 1054) {
      const stW = game.world.store;
      const fxW = Math.fround(this.x), fyW = Math.fround(this.y);
      const tw0 = Math.trunc(Math.trunc(Math.fround(fxW + 1)) / 16);          // :26396 (int)(px+1)/16
      const tw1 = Math.trunc(Math.trunc(Math.fround(fxW + this.w)) / 16);     // (int)(px+w)/16
      const th0 = Math.trunc(Math.trunc(Math.fround(fyW + 1)) / 16);          // :26398 (int)(py+1)/16
      const th1 = Math.trunc(Math.trunc(Math.fround(fyW + this.h)) / 16);     // (int)(py+h)/16
      const webId = TILE_BY_KEY['v_51_cobweb'];
      for (let tw = tw0; tw <= tw1; tw++) {
        for (let th = th0; th <= th1; th++) {
          if (!stW.inBounds(tw, th) || stW.hasTile(tw, th)) continue;         // !active()
          if (stW.liquid[stW.idx(tw, th)] !== 0) continue;                    // liquid==0
          if (Math.floor(Math.random() * 7) !== 0) continue;                  // Next(7)==0
          if (webId !== undefined) stW.setTile(tw, th, webId);                // :26402 PlaceTile(51,mute)
        }
      }
    }
    // ---- 静止自启（cs:26684-26711 verbatim 门：ai[0]!=0 && vy<=0 && vx==0）——
    // 落入柱龛停稳后朝开阔侧踢 ±0.5，三级探柱(0/16/32px 外扩)都堵则按 cx 奇偶定边
    // SW-AF1 2026-09-04（F-3 收敛）：踢墙摄取器单源化 → WeaponProj.beeWallPushDir
    //  （655 蜂巢支/99 巨石支同一摄取器：三级递宽 ±8/24/40px 扫窗、左实优先、
    //  Center.X 奇偶兜底、SolidTile 全语义摄取 = active && tileSolid && !tileSolidTop
    //  && !halfBrick && slope==0（W.cs:70642-70655））。原第二实现 solidAt 用
    //  st.isSolid()（缺 halfBrick/slope/platform 排除→斜坡/半砖/平台格误判实心墙起踢）
    //  且 Math.floor 负商分叉,一并随 trunc(C# (int)) 修正。行为变更=1:1 目标。
    //  ★OOB 语义（SW-AL1 2026-09-05 定谳,纠正旧备案"越界=null→true"）：
    //  vanilla Main.tile 是裸 Tile[,]（Main.cs:1690）,OOB 下标抛异常被 SolidTile
    //  catch 吞掉【返 false】——beeWallPushDir OOB=false ≡ 原版,非差项
    //  （详证见 WeaponProj.ts beeWallPushDir 注）。※欠账备案：原版弹幕触世界界
    //  active=false 消散（P.cs:16789-16802）,本实体未接出界杀（655/949 已接）。
    //  ★SW-BJ67 D5：补 :26595 `!flag9` 门——弹跳宽限期（smart bounce 后穿墙段）
    //  不起踢（原版 flag9 消费位）。
    if (this.ai0 && this.vy <= 0 && this.vx === 0 && !flag9) {
      this.vx = beeWallPushDir(game.world.store, this.x, this.y, this.w, this.cx);
    }
    this.ai0 = true;
    // ---- ★SW-BJ64b 1047 专支（P.cs:26411-26471;1458 :26412 逐字同）----
    //  ① 帧动画（:26414-26418）：frameCounter 每 2t 一帧、frame 环 0..99。
    //  ② 彩虹拖尾光（:26420-26435）：基色 = hsl(((GlobalTimeWrappedHourly×120)%300)/300,
    //    1, 0.6)×1.4（vector22/23）;沿 oldPos 逐点 ×(1−i/10)（num208 Remap 线性,
    //    num207≡1 平方不变）,经 DelegateMethods.CastLightOpen（DelegateMethods.cs:729-742）
    //    ——【实心体格不吃光】门:active() && !inActive() && !tileSolidTop && tileSolid
    //    → 跳过（本仓映射:hasTile=原版 active() 裸位 / isActuated=inActive /
    //    TILE_DEFS.solid=tileSolid / .platform=tileSolidTop）。
    //    GlobalTimeWrappedHourly = 运行秒 %3600（Main.cs:16777;FlickerClock 同源公式）。
    //  ③ 微光星屑（:26466-26471）：ShimmerBlock clientOnly 每拍一粒,位 = Center+
    //    圆缘随机(w/2,h/2)、move = velocity×0.05（本地直驱 shimmerBlockFx,
    //    PetFollower 1090 判例同款;原版无 UniqueInfoPiece → 0）。
    if (this.projId === 1047) {
      if (++this.frameCounter >= 2) {
        this.frameCounter = 0;
        if (++this.frame >= 100) this.frame = 0;
      }
      const gtw = typeof performance !== 'undefined' ? (performance.now() / 1000) % 3600 : 0;
      const st = game.world.store;
      for (let i = 0; i < this.trailN; i++) {
        const tx = Math.floor((this.trailX[i] + this.w / 2) / 16);
        const ty = Math.floor((this.trailY[i] + this.h / 2) / 16);
        if (st.inBounds(tx, ty) && st.hasTile(tx, ty) && !st.isActuated(tx, ty)) {
          const d = TILE_DEFS[st.get(tx, ty)];
          if (d && d.solid && !d.platform) continue;
        }
        const [lr, lg, lb] = rainbowBoulderLight(gtw, i);
        game.addLightAt?.(this.trailX[i] + this.w / 2, this.trailY[i] + this.h / 2, lr, lg, lb);
      }
      // ---- ★SW-BJ67 D5：tileCollide 动态门（P.cs:26437-26456 逐字;1458 :26438 同）----
      //  `tileCollide = ai[1]==0 && !SolidCollision(position,w,h)`——嵌墙穿透态：
      //  仅当不在弹跳宽限期【且】当前未嵌入实心体时才吃 tile 碰撞（嵌入格内自由
      //  穿越 = 原版防卡死通道）;ai[1]>0 宽限期恒 false（smart bounce 跃迁后穿墙）
      //  且置 flag9/逐拍递减;ai[1]<=0 时 1/4 拍越出玩家视区（playArea 1920×1200
      //  Main.cs:758）即 smart bounce 拉回 + 1/180 拍无条件 smart bounce。
      this.tileCollide = this.ai1 === 0 && !solidCollision1457(st, this.x, this.y, this.w, this.h);
      if (this.ai1 > 0) {
        // flag9 已在 fixedUpdate 头部按本拍 ai[1] 前值等价前算（:26440 语义同）
        this.ai1--;                                        // :26441（:26442-26443 空支）
      } else {
        if (Math.floor(Math.random() * 4) === 0) {         // :26444 Main.rand.Next(4)==0
          const pa = this.rbGetAreas(game).playArea;       // :26447 GetAreas
          if (!rectsIntersect(this.x, this.y, this.w, this.h, pa.x, pa.y, pa.w, pa.h)) {
            this.rbPerformSmartBounce(game);               // :26449-26451
          }
        }
        if (Math.floor(Math.random() * 180) === 0) {       // :26453 Next(180)==0（owner==myPlayer 恒真）
          this.rbPerformSmartBounce(game);                 // :26454-26456
        }
      }
      const ang = Math.random() * Math.PI * 2;
      shimmerBlockFx(game,
        this.cx + Math.cos(ang) * this.w / 2, this.cy + Math.sin(ang) * this.h / 2,
        this.vx * 0.05, this.vy * 0.05);
    }
    // ---- ★SW-BJ88 债4①（2026-09-15）：rotation += vx×0.06 时序对齐（AI_025
    //  :26679-26682 `if (type != 1055) rotation += velocity.X * 0.06f`;1458 :26680
    //  同）——原版在【AI 段内=本拍横向加速/重力/tile 碰撞之前】,读的是上拍末速度;
    //  旧仓放 moveAndCollide 之后=读碰撞改写后速度,弹跳拍（1047 弹回/家族①②）
    //  自旋反向一拍（弹跳拍视觉差债）。1055 原版由 :26591 专支自旋（ai[1]==1 追踪
    //  态改 rotation*=0.6 不在此行）,本仓 1055 未接追踪态→恒常转支同值,维持
    //  无条件写面（不裁 1055 排除支,裁了反而丢常转）。----
    this.rotation += this.vx * 0.06;
    // ---- AI_025 运动核 ----
    if (this.vy <= 6) {
      if (this.vx > 0 && this.vx < 7) this.vx += 0.05;
      if (this.vx < 0 && this.vx > -7) this.vx -= 0.05;
    }
    this.vy = Math.min(this.vy + 0.3, 16);
    // ---- ★SW-BJ93 债3（2026-09-16）：1048 滚动伴生尘（AI_025 :26745-26749 逐字;
    //  1458 :26746-26750 同;原版位序=重力写后/AnyWet 消费前,读【本拍】重力后速度）——
    //  门 = netMode!=2（单机恒真）∧ |velocity|>1;位 = Center + NextVector2Circular
    //  (w×0.4,h×0.4)（Utils.cs:1301-1303 = NextVector2Unit×(w,h)×NextFloat——角均匀×
    //  线性半径,2 掷;rbHighlightNearbyTreasure F6 口径同）−(1,1) → 盒 2×2;
    //  尘 322、速 = −velocity×0.5、α0、scale 0.75+NextFloat×0.25、noGravity。
    //  NextVector2Unit 的角扫向（sin,−cos）与 cos/sin 仅差常数相移,角均匀同分布
    //  （rbHighlightNearbyTreasure 既有 cos/sin 口径,不另造掷形）。----
    if (this.projId === 1048 && Math.hypot(this.vx, this.vy) > 1) {   // :26745（netMode!=2 单机恒真）
      const ang = Math.random() * Math.PI * 2;                        // NextVector2Unit 角（掷1）
      const rr = Math.random();                                       // NextFloat 线性半径（掷2）
      const px = this.cx + Math.cos(ang) * rr * (this.w * 0.4);
      const py = this.cy + Math.sin(ang) * rr * (this.h * 0.4);
      const d = game.spawnDust?.(px - 1, py - 1, 2, 2, 322,
        -this.vx * 0.5, -this.vy * 0.5, 0, null, 0.75 + Math.random() * 0.25);
      if (d) d.noGravity = true;                                      // :26749
    }
    // ---- AI_025 AnyWet 消费（:26748-26765,原版 AI 段尾——读【上拍】湿旗字段）----
    //  `if (AnyWet && netMode != 1)`: 1053 → Kill(任一液) / wet∧655 → Kill(蜂巢,
    //  WeaponProj GrenadeProj 域已接) / lavaWet∧(727|1054) → Kill。99/1013/1014/
    //  1047/1048/1055/1057 无湿杀面;1002 原版 aiStyle 16 无此块 → 显式排除。
    //  1047 豁免湿段 → 四旗恒 false → 恒不触发（与原版同向）。
    //  ★SW-BJ93 债2（2026-09-16）：原版此处调 Kill()（:26752/:26760）→ 死亡尘/声面
    //  随 Kill 面（债2）发放;旧仓直写 dead=静默消亡=同债面整缺 → 收口 rbKill 单口。
    if (this.projId !== 1002
      && (this.wet || this.lavaWet || this.honeyWet || this.shimmerWet)) {
      if (this.projId === 1053) this.rbKill(game);                    // :26750-26752 Kill()
      else if (this.lavaWet && (this.projId === 727 || this.projId === 1054)) {
        this.rbKill(game);                                            // :26758-26760 Kill()
      }
    }
    if (this.dead) return;
    // ---- ★通用湿段（:16903-17113,共享体;溅花尘/音=wetSplashStepShared 弹面 10 粒）----
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater);
    // ---- 碰撞响应（Projectile.cs:19055-19101 巨石族分支 verbatim）----
    const lastVX = this.vx, lastVY = this.vy;
    // 碰撞位移（Body 旗由 lib 维护：onGround/collideY/hitWall）
    // ★水中位移阻尼（HandleMovement :17721-17764,湿段批）——速度【场】不减只削
    // 位移：阻尼乘进 dx/dy 入参,b.vx/vy=碰撞调整字段采纳处原样回读（勿除回,
    // 原版碰撞响应式读的也是未阻尼 velocity 场,lastVelocity 档不掺阻尼）
    const df = projWaterDragFactor(this);
    // SW-AQ1 2026-09-05：oldPosition 上报（Update :17118 AI 后/位移前置位）——
    //  99 ∈ OBJTYPE3 白名单（:17195）,objType 3 扫描新旧位判定
    //  （Collision.cs:3346-3353/:3356）消费;滚石撞墙碎裂拍 dead=true,
    //  旧位=本拍位移前真实值,碎裂拍扫描按原版 :19966 后位序照跑
    this.oldX = this.x; this.oldY = this.y;
    moveAndCollide(this, game.world, this.vx * df, this.vy * df);
    // ★SW-BJ64b：旧位环捕获（P.cs:17199-17203——TrailingMode=0 每拍无条件 shift+头插,
    //  [0] = HandleMovement 后 position（即本拍碰撞调整位）;置于碰撞响应分支前,
    //  撞墙碎裂拍旧位也照原版落账 = Kill 拖尾尘消费位）
    if (this.projId === 1047) {
      for (let i = 9; i > 0; i--) {
        this.trailX[i] = this.trailX[i - 1];
        this.trailY[i] = this.trailY[i - 1];
      }
      this.trailX[0] = this.x;
      this.trailY[0] = this.y;
      if (this.trailN < 10) this.trailN++;
    }
    // ---- ★SW-BJ67 D1（2026-09-14）：1047 专支 = RainbowBoulder_CheckBounce
    //  （P.cs:19192-19194 `else if (type == 1047) RainbowBoulder_CheckBounce(ref
    //  lastVelocity)`;1458 :19193 同）——巨石族 ①高速落地/②撞墙碎裂两支对 1047
    //  【都不适用】：弹墙按速度分段弹回（|v|≥1 → 0.95 近弹性）且不碎,弹后转
    //  PerformSmartBounce 重新寻的。原仓把 1047 落进 ②Kill 支 = 行为债 D1 本体。
    if (this.projId === 1047) {
      this.rbCheckBounce(lastVX, lastVY, game);
      if (this.dead) return;
    } else if (this.projId === 1021) {
      // ★SW-BJ93 债③（2026-09-16）：1021 月球巨石专属弹跳支（P.cs:19101-19128 直译;
      //  1458 :19102-19129 同域逐字 byte-diff 全等 2026-09-16）——旧仓落通用②撞墙
      //  即碎=BJ67 登记建模偏差;原版撞墙【不即碎】：X 向最多四次内弹回（localAI[1]
      //  0..3 弹、第 5 次撞墙 >3 → Kill）、系数 −0.75;Y 向高速(>4)落地弹回 −0.9、
      //  低速下落(0<lastVY≤4)置 localAI[1]=999（停稳标记,此后任一 X 撞墙即 Kill）。
      //  弹面次序=HitTiles(:19107)→PlaySound(0)(:19108)→速度覆写(:19109)（家族①同
      //  序）;★本支零 RNG（无 Main.rand 掷,亲读定谳）→ 无掷序面。宽限门豁免集/
      //  boulderTimeLeft(10800)/rbKill 幂等闸均未触碰。
      this.rb1021Bounce(lastVX, lastVY, game);
      if (this.dead) return;
    } else if (this.projId === 1013) {
      // ★SW-BJ88 债1（2026-09-15）：1013 专属分段弹支（P.cs:19129-19191 直译;
      //  1458 :19130-19192 逐字同）——旧仓把 1013 落进家族 ①②支（0.2 弹回+撞墙
      //  Kill）= 行为债本体;原版 1013 是"永不碎的分段弹跳球"：速度分段弹回
      //  （与 1047 同系数表）+ flag16 钟摆门/静止杀/20 弹上限三道生命周期门。
      this.rb1013Bounce(lastVX, lastVY, game);
      if (this.dead) return;
    } else if (this.projId === 727) {
      // ★SW-RB20a F1（2026-09-15）：727 滚刺球专属支（P.cs:19196-19239 直译;
      //  1458 :19197-19240 逐字同）——旧仓被 else 桶吞进家族 ①②（落地弹 0.2/撞墙
      //  Kill 无碎片）;原版落地弹 −0.65 且双轴各掷 3..5 发 763 仙人掌刺碎片,
      //  撞墙 Kill【后】碎片照发（原版 Kill 后代码续行）。
      this.rb727Bounce(lastVX, lastVY, game);
      if (this.dead) return;
    } else if (this.projId === 1054) {
      // ★SW-RB20a F1（2026-09-15）：1054 蜘蛛球专属支（P.cs:19240-19302 直译;
      //  1458 :19241-19303 逐字同）——旧仓撞墙即碎（家族②）=债本体;原版撞墙
      //  【不碎】：分段弹回（X 缺省 0.8/Y 缺省 0.6）+ X 门 |lastVX|>2 计硬弹
      //  （localAI[1]++）+ 两次撞墙上限（>1 Kill）。
      this.rb1054Bounce(lastVX, lastVY, game);
      if (this.dead) return;
    } else if (this.projId === 1048) {
      // ★SW-RB20a F1（2026-09-15）：1048 屎球专属支（P.cs:19303-19378 直译;
      //  1458 :19304-19379 逐字同）——旧仓撞墙即碎（家族②）=债本体;原版撞墙
      //  【不碎】：分段弹回（X/Y 档 0.1/0.2/0.45/缺省 0.75）+ 门 |lastV|>4 +
      //  硬弹支 Item177/尘 322×10/PooFly 2..3 + localAI[1]+=3 → >20 Kill。
      this.rb1048Bounce(lastVX, lastVY, game);
      if (this.dead) return;
    } else {
      // ① 高速落地（lastVy>5）：弹回 20% + 落地尘/声（SoundID 0 = dig 系）
      if (this.vy !== lastVY && lastVY > 5) {
        // ★SW-BJ93 债④a（2026-09-16）：1053 落地 20 尘（家族①落地支 :19059-19071
        //  逐字;1458 :19060-19072 同域 byte-diff 全等）——10 迭代×2 尘 6（盒=
        //  (pos.X,pos.Y+8,w,h−8)、α100）:①scale2 → v×8+noGravity ②scale1.25 →
        //  v×2→X×1.5→Y−2（原文三连写序）。位序=HitTiles 近似【前】（vanilla 尘
        //  :19061-71 → HitTiles :19072 → 声 :19073 → 速度覆写 :19074;BJ93 债2 只接
        //  Kill 死亡面,落地尘整缺=本刀。速度覆写行序为旧仓既置（粒子/声不读 vy,
        //  观测中性,RNG 序不受影响）。----
        if (this.projId === 1053) {
          for (let i = 0; i < 10; i++) {
            const d1 = game.spawnDust?.(this.x, this.y + 8, this.w, this.h - 8, 6, 0, 0, 100, null, 2);
            if (d1) { d1.vx *= 8; d1.vy *= 8; d1.noGravity = true; }        // :19064-19065
            const d2 = game.spawnDust?.(this.x, this.y + 8, this.w, this.h - 8, 6, 0, 0, 100, null, 1.25);
            if (d2) { d2.vx *= 2; d2.vx *= 1.5; d2.vy *= 2; d2.vy -= 2; }   // :19067-19069
          }
        }
        this.vy = -lastVY * 0.2;
        game.spawnParticles?.(this.cx, this.y + this.h, '#8A8A8A', 6, 1.2, { life: 14 });
        game.playSfx?.('dig', 0.8);
        // ★SW-BJ93 债2（2026-09-16）：vanilla :19089-19092 `else if (type == 1057)
        //  { Kill(); }`——落地即碎走 Kill 单口（尘被 :76467 type!=1057 排除,声=dig
        //  缺省支 + Item 5523 掉落）;旧仓直写 dead=静默=债面整缺 → rbKill 收口。
        if (this.projId === 1057) { this.rbKill(game); return; }  // 1057 落地即碎
      }
      // ② 横向撞墙：**Kill()（碎裂）**——不是反弹！ping-pong 根因即漏了这条
      // （cs:19097-19100 else 支；1055 荧光石球例外不碎走追踪切换）
      //  ★SW-BJ93 债2（2026-09-16）：vanilla 撞墙支 {99,1005,1014,1053,1057} 直调
      //  Kill()（:19098-19100）,【无】HitTiles 前置尘（旧仓 #9A9A9A 灰尘系 Kill 面
      //  整缺期的自造替身,真面=Kill 尘/声,随本刀就位 → 替身退役）;死亡面经 rbKill
      //  （99→尘1×30+dig / 1013 已专支 / 1014→尘12×30+dig+Item29 / 1021→尘323×30
      //  +dig【Kill 面同源,弹跳面已专支】 / 1053→64 盒尘+gore+Item14 / 1057→dig+
      //  Item5523）。★1021 vanilla 专属弹跳支（:19101-19128,四次内弹回/limit Kill）
      //  已由 ★SW-BJ93 债③ 落刀（2026-09-16）——本支余型 {99,1005,1014,1053,1057}。
      if (this.vx !== lastVX) {
        if (this.projId !== 1055) {
          this.rbKill(game);
          return;
        }
      }
    }

    // ---- 生命周期 ----
    this.life--;
    if (this.life <= 0) { this.rbKill(game); return; }   // ★SW-BJ67 D2：唯一死亡门

    // ---- ★SW-BJ93 债1（2026-09-16）：Damage() 结算面收口（P.cs:12512-12539 直译;
    //  1458 :12513-12540 同域逐字）——Damage_CanDealDamage()（:12461,尾支 :12491=
    //  aiStyle25 出膛宽限门,见 rbDamageCanDeal 注）【门内】才有 CutTiles/PVE/PVP/EVP
    //  四面;出生 localAI[2]∈[1..7] 拍（第 8 拍首伤）全免。旧仓伤害环（PVE+EVP）与
    //  CutTiles 均未接此门=债本体（BJ88 立案;RB21 :12520 亲见同域）。
    //  ★CutTiles 面（:12515-12518;1458 :12516-12519 同）整缺同债补——门 =
    //  friendly ∧ owner==myPlayer（单机恒真）∧ !npcProj ∧ !minion（家族无此二位）
    //  ∧ type!=1054（原版唯一排除型）;CanCutTiles（:15407,ProjCutTiles.ts 头注）
    //  排除表 aiStyle45/137/92/105/106 与 {463,69,70,621,10,11,379,407,476,623,
    //  625..628,833..835,818,831,820,864,970,995,908,1020,1105,1040} 无家族成员、
    //  尾支 return type!=1091 → 家族全过=调用方自证。vid 穿线（1047 幼虫豁免
    //  :15391-93）。1021 json 无 friendly 行（hostile-only）→ 不砍=原版同向。----
    if (this.rbDamageCanDeal()) {
      if (!!projectileData(this.projId)?.friendly && this.projId !== 1054) {
        cutTilesBox(game, this.x, this.y, this.w, this.h, this.projId);   // :12517 CutTiles()
      }

      // ---- 双面接触伤害（friendly+hostile → NPC 与玩家都结算）----
      //  ★SW-BJ93 债1：Damage_PVE/PVP（:12523-12525）在 CanDealDamage 门内 →
      //  宽限期不结算（出生 8 拍 PVE/EVP 全免,含 BJ88 债2 的 1047 boss 命中即碎支
      //  =Damage_PVE_Inner :14336 同门内）。
      for (const raw of game.enemies() as Array<Record<string, unknown>>) {
        const e = raw as unknown as {
          id: number; dead?: boolean; friendly?: boolean; immortal?: boolean; dontTakeDamage?: boolean;
          vanillaId?: number | null; boss?: boolean; def?: { boss?: boolean };
          x: number; y: number; w: number; h: number; cx: number; cy: number;
          hurt?: (dmg: number, kbx: number, kby: number, game: unknown) => boolean | void;
        };
        if (!e || e.dead || e.friendly || e.immortal || e.dontTakeDamage) continue;
        if ((this.immunities.get(e.id) ?? 0) > 0) continue;
        if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
        this.immunities.set(e.id, 10);
        const dir = e.cx >= this.cx ? 1 : -1;
        e.hurt?.(this.dmg, dir * KB_X, 0, game);
        // ★SW-BJ88 债2（2026-09-15）：1047 命中 TreatedAsABossForRainbowBoulders →
        //  Kill()（Damage_PVE_Inner :14336-14340 直译;1458 :14337 同）。原版位序=
        //  StrikeNPC :13702 之后 → boss 先吃到本拍伤害再自爆;`keepIterating = false`
        //  → break 不再遍历后续敌怪;Damage() 内 PVE→EVP 无 active 重入闸 → 不加
        //  dead 早退=字面 1:1（且 1047 friendly 非 hostile,EVP 恒不适用 :14848）。
        if (this.projId === 1047
          && treatedAsABossForRainbowBoulders(e.vanillaId,
            e.boss === true || e.def?.boss === true)) {
          this.rbKill(game);
          break;
        }
      }
      const p = game.player as { dead: boolean; iframes: number; x: number; y: number; w: number; h: number };
      // ★SW-RB20a F4（2026-09-15）：friendly 弹对玩家伤害面豁免——Damage_EVP 门
      //  （Projectile.cs:14848 `if (!hostile || Main.myPlayer >= 255 || damage <= 0 ||
      //  SkipDamage_EVP[type]) return;`;1458 :14849 逐字同）=【非 hostile 弹恒不伤玩家】。
      //  家族 SetDefaults 逐值：1047 friendly=true ∧ 无 hostile 行（P.cs:9920-9929,
      //  ignoreWater @:9928）→ 原版彩虹巨石撞玩家【零结算】;余型（99/1002/1013/1014/
      //  1048/1053/1054/1055/1057）friendly+hostile 双旗（SetDefaults 逐站核对,
      //  vanilla-projectiles.json hostile 列同源=recon 双闸门辖域）→ EVP 照适用。
      //  hostile 取 projectileData（json 列缺省=undefined → falsy → 豁免）,门语义与
      //  原版 `!hostile` 逐字同构。PVP 半边（hostile 弹打 PVP 队）不适用本仓单地面。
      //  ★SW-BJ93 债4①（2026-09-16）：SkipDamage_EVP 豁免集补门（:14848 第 4 因子;
      //  本域活消费=1002 TNTBarrel,108/164 无活体弹实体见集注）——旧仓 1002 hostile
      //  门照伤接触=RB21 R3 双向偏差之正向;豁免后 1002 玩家伤害面唯一=Kill 自伤
      //  （★BJ102 归一后=rbKill1002Face→Game.explodeAt 玩家段,见该函数注）。
      if (projectileData(this.projId)?.hostile
        && !SKIP_DAMAGE_EVP.has(this.projId)
        && !p.dead && p.iframes <= 0 && !(this.immunities.get(-1) ?? 0)) {
        if (this.x < p.x + p.w && this.x + this.w > p.x && this.y < p.y + p.h && this.y + this.h > p.y) {
          this.immunities.set(-1, 10);
          // ★SW-BI1 2026-09-06（用户崩溃报告定谳）：不传 this 作 attacker——attacker 槽是
          //  Enemy 受击反击面（荆棘/仙人掌套/日曜爆闪 → attacker.hurt(...)），弹体无 hurt
          //  方法，把滚石自身送进反击槽 → `k.hurt is not a function` → 帧循环守卫停机
          //  （沙漠滚仙人掌球实报，2026-09-06 报告 SW-BI1）。与全弹族调用约定对齐
          //  （FallingBlock:275/MeteorChunk:126/Dart 系/bossAI_* 均不传 attacker）：
          //  原版弹侧命中无 NPC 可反（PlayerDeathReason.ByProjectile），本无攻击者槽语义。
          game.damagePlayer(this.dmg, this.cx, this.cy);
        }
      }
    }   // ★SW-BJ93 债1：Damage_CanDealDamage 门收括号（CutTiles+PVE+EVP 四面全在内）
  }

  draw(r: Renderer, _cam: Camera): void {
    const img = projSprite(this.projId);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || !ctx) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    if (this.projId === 1047) {
      // ★SW-BJ64b 1047 彩虹壳三叠画。原版序：拖尾块（Main.cs:33351-33385）先画=垫底，
      //  本体（:33571）后画=压顶。帧账 = Frame(5,20, frame/20, frame%20)（:33209）——
      //  源矩形 19×19、origin=帧心（:33210）、scale=vector82×2（:33208,SetDefaults
      //  scale=1）、color87 = GetAlpha 全亮白（:80967 `type==488||1047 → (255,255,255,255)`,
      //  即本体不受环境光暗化=黑暗里也发光）、num340 = rotation（:33167/:33229 尾
      //  `type!=1055 → rotation += vx*0.06`）。
      //  ★反伪影自证：实拍逐点直读 drawImage 源矩形对拍本式（scripts/_bj64b.mjs）。
      const cw = img.width / 5, ch = img.height / 20;
      const cell = rainbowBoulderCell(this.frame, img.width, img.height);
      // ① 250 微光拖尾（:33351-33367,Projectile_250 14×32,origin=(w/2,0),沿段拉伸）：
      //    num350=0.5/num351=1 → scaleX=2.2×0.5=1.1、scaleY=段长/32、rot=段向−π/2、
      //    alpha=(127/255)×(1−i/10)²（white4.A=127 × (1−num355)²,i=旧位序 0..9）
      const streak = projSprite(250);
      if (streak && streak.width > 0) {
        for (let i = 9; i > 0; i--) {
          if (i >= this.trailN) continue;                     // 原版 Zero 哨兵截断
          const x1 = this.trailX[i] + this.w / 2, y1 = this.trailY[i] + this.h / 2;
          const x0 = this.trailX[i - 1] + this.w / 2, y0 = this.trailY[i - 1] + this.h / 2;
          const seg = Math.hypot(x0 - x1, y0 - y1);
          if (seg < 0.01) continue;
          ctx.save();
          ctx.translate(x1, y1);
          ctx.rotate(Math.atan2(y0 - y1, x0 - x1) - Math.PI / 2);
          ctx.globalAlpha = (127 / 255) * (1 - i / 10) * (1 - i / 10);
          ctx.drawImage(streak, -streak.width * 1.1 / 2, 0, streak.width * 1.1, Math.max(1, seg));
          ctx.restore();
        }
      }
      // ② Extra_55 星屑（:33368-33385）：68×384 竖 4 帧（68×96/帧）,origin=(w/2,h/8+14),
      //    rot=velocity.ToRotation()−π/2、scale=Lerp(0.1,0.8,(10−i)/10)×0.5、
      //    白×(1−i/3) 且 A=0 = 纯加法惯用法（memory:XNA α=0 → canvas 'lighter'）
      const spark = r.atlas?.ensureVImage('vanilla/Extra_55.png');
      if (spark) {
        const sh = spark.height / 4;
        const ox = spark.width / 2, oy = spark.height / 8 + 14;
        const rot = Math.atan2(this.vy, this.vx) - Math.PI / 2;
        const f4 = this.frame % 4;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 3; i >= 0; i--) {
          if (i >= this.trailN) continue;
          let fi = (f4 - i) % 4;
          if (fi < 0) fi += 4;                                // num358（:33379-33382）
          const a = 1 - i / 3;                                // white5 × (1−i/3)×num351
          if (a <= 0) continue;
          const sc = (0.1 + 0.7 * (10 - i) / 10) * 0.5;
          ctx.save();
          ctx.globalAlpha = a;
          ctx.translate(this.trailX[i] + this.w / 2, this.trailY[i] + this.h / 2);
          ctx.rotate(rot);
          ctx.drawImage(spark, 0, fi * sh, spark.width, sh,
            -ox * sc, -oy * sc, spark.width * sc, sh * sc);
          ctx.restore();
        }
        ctx.restore();
      }
      // ③ 本体单帧切片（:33571 缺省支 sourceRectangle2 非 null）——源矩形走
      //  rainbowBoulderCell 金标同源,绘制尺寸 = 帧心 origin × scale2 → 38×38
      ctx.globalAlpha = 1;
      ctx.translate(this.cx, this.cy);
      ctx.rotate(this.rotation);
      ctx.drawImage(img, cell.sx, cell.sy, cell.sw, cell.sh,
        -cw, -ch, cw * 2, ch * 2);
    } else {
      // 余族（99/727/1013/1048/1053/1054/1055/1057/1002）整图单帧：DrawProjDirect
      //  sourceRectangle2=null 缺省支（Main.cs:33169/:33571）——1055 竖条 10 帧走
      //  Main.cs:30618 家族块专支、1014 整图即原版本相（DrawProjDirect 全域无 1014
      //  切片支,projFrames[1014]=11 仅供 AI 消费）——1:1 维持勿"顺手修"。
      ctx.translate(this.cx, this.cy);
      ctx.rotate(this.rotation);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ===========================================================================
  // ★SW-BJ67（2026-09-14）D1 smart bounce 链 + D2 Kill 彩虹爆
  // ===========================================================================

  /** D1 弹跳响应（RainbowBoulder_CheckBounce P.cs:20165-20222 直译;HandleMovement
   *  碰撞响应位 :19192 调用,ref lastVelocity = 本拍 moveAndCollide 前速度快照）。
   *  弹回系数按 |lastV| 分段（<0.5→0.1 / <0.75→0.25 / <1→0.5 / 其余 0.95）;
   *  flag = 高速（|lastV|>5,双轴任一）→ localAI[1]++ + Collision.HitTiles（仓内
   *  近似=同族 ① 支灰尘,见该支注）+ SoundID.RainbowBoulder;flag2 = 双轴任一被
   *  碰撞改写 → PerformSmartBounce。 */
  private rbCheckBounce(lastVX: number, lastVY: number, game: GameHooks): void {
    const num = Math.abs(lastVX);
    const num2 = Math.abs(lastVY);
    let num3 = 0.95;
    let num4 = 0.95;
    if (num < 0.5) num3 = 0.1;
    else if (num < 0.75) num3 = 0.25;
    else if (num < 1) num3 = 0.5;
    if (num2 < 0.5) num4 = 0.1;
    else if (num2 < 0.75) num4 = 0.25;
    else if (num2 < 1) num4 = 0.5;
    let flag = false;
    let flag2 = false;
    if (this.vy !== lastVY) {                          // :20184-20189
      if (Math.abs(lastVY) > 5) flag = true;
      this.vy = -lastVY * num4;
      flag2 = true;
    }
    if (this.vx !== lastVX) {                          // :20190-20196
      if (Math.abs(lastVX) > 5) flag = true;
      this.vx = -lastVX * num3;
      flag2 = true;
    }
    if (flag) {                                        // :20197-20201
      this.localAI1++;
      game.spawnParticles?.(this.cx, this.y + this.h, '#8A8A8A', 6, 1.2, { life: 14 });
      game.playSfxWav?.('rainbow_boulder', 1, this.x, this.y);
    }
    if (flag2) {                                       // :20221-20223
      this.rbPerformSmartBounce(game);
    }
  }

  /** ★SW-BJ88 债1：1013 专属分段弹支（P.cs:19129-19191 直译;1458 :19130-19192
   *  逐字同,2026-09-15 对拍）。num46/num47 弹回系数按 |lastV| 分段（与 1047
   *  CheckBounce 同表:<0.5→0.1 / <0.75→0.25 / <1→0.5 / 其余 0.95）,差异面：
   *  ① flag16 = localAI[0] >= 500（:26365 拍龄钟）——≥500t 后任何速度的碰撞都计
   *  硬弹（防低速贴墙永动）;② flag17 → localAI[1]++ + Collision.HitTiles +
   *  PlaySound(0)（仓内近似=家族①支灰尘+dig 声,同 rbCheckBounce flag 支注）;
   *  ③ 双 Kill 门：静止（Length<0.1 且拍龄>50）与弹满（localAI[1]>20）——
   *  vanilla Kill() 对 1013 无专属爆面,rbKill 单口=仅置 dead（1047 才爆段）。 */
  private rb1013Bounce(lastVX: number, lastVY: number, game: GameHooks): void {
    const num44 = Math.abs(lastVX);                    // :19131
    const num45 = Math.abs(lastVY);                    // :19132
    let num46 = 0.95;                                  // :19133 X 系数
    let num47 = 0.95;                                  // :19134 Y 系数
    if (num44 < 0.5) num46 = 0.1;                      // :19135-19146
    else if (num44 < 0.75) num46 = 0.25;
    else if (num44 < 1) num46 = 0.5;
    if (num45 < 0.5) num47 = 0.1;                      // :19147-19158
    else if (num45 < 0.75) num47 = 0.25;
    else if (num45 < 1) num47 = 0.5;
    const flag16 = this.localAI0 >= 500;               // :19159
    let flag17 = false;                                // :19160
    if (this.vy !== lastVY) {                          // :19161-19168
      if (flag16 || Math.abs(lastVY) > 5) flag17 = true;
      this.vy = -lastVY * num47;
    }
    if (this.vx !== lastVX) {                          // :19169-19176
      if (flag16 || Math.abs(lastVX) > 5) flag17 = true;
      this.vx = -lastVX * num46;
    }
    if (flag17) {                                      // :19177-19182
      this.localAI1++;
      game.spawnParticles?.(this.cx, this.y + this.h, '#8A8A8A', 6, 1.2, { life: 14 });
      game.playSfx?.('dig', 0.8);                      // PlaySound(0)=dig 系（家族①同款近似）
    }
    if (Math.hypot(this.vx, this.vy) < 0.1 && this.localAI0 > 50) {   // :19183-19186
      this.rbKill(game);
      return;
    }
    if (this.localAI1 > 20) this.rbKill(game);         // :19187-19190（20 弹上限）
  }

  /** ★SW-BJ93 债③（2026-09-16）：1021 专属弹支（P.cs:19101-19128 直译;1458
   *  :19102-19129 同域逐字 byte-diff 全等,2026-09-16 对拍）。与 1013/1047 的分段
   *  弹表不同构——独立三段：①Y 高速（lastVY>4）落地弹回 −0.9 + HitTiles+PlaySound(0)
   *  （:19105-19110,HitTiles 近似=家族①同款约定）;②Y 低速下落（0<lastVY≤4）置
   *  localAI[1]=999（:19111-19114 停稳标记——标记后 X 撞墙必 >3 → Kill=着陆后贴墙
   *  推死）;③X 撞墙 localAI[1]<=3 → 弹回 −0.75++（:19118-19122,四次内弹回）,>3 →
   *  Kill（:19123-19126,尘 323+dig 族面随 rbKill）。无静止杀/无拍龄钟消费（1021
   *  不在 :26365 钟内）;本支零 RNG（无 Main.rand 掷）。 */
  private rb1021Bounce(lastVX: number, lastVY: number, game: GameHooks): void {
    if (this.vy !== lastVY) {                          // :19103
      if (lastVY > 4) {                                // :19105
        game.spawnParticles?.(this.cx, this.y + this.h, '#8A8A8A', 6, 1.2, { life: 14 });   // HitTiles 近似（家族①同款约定）
        game.playSfx?.('dig', 0.8);                    // :19108 PlaySound(0)
        this.vy = -lastVY * 0.9;                       // :19109
      } else if (lastVY > 0) {                         // :19111
        this.localAI1 = 999;                           // :19113（停稳标记）
      }
    }
    if (this.vx !== lastVX) {                          // :19116
      if (this.localAI1 <= 3) {                        // :19118（0..3 四次内弹回）
        this.vx = lastVX * -0.75;                      // :19120
        this.localAI1++;                               // :19121
      } else {
        this.rbKill(game);                             // :19125（limit Kill）
      }
    }
  }

  // ===========================================================================
  // ★SW-RB20a F1（2026-09-15）：727/1054/1048 三型专属分段弹支（RB20a 溢出发现——
  //  旧仓三型被 else 桶吞进 99 家族①②支）。三型 SetDefaults 均 aiStyle 25
  //  （727 :7848 区 / 1054 :9958 区 / 1048 :9930 区）,经 BOULDER_CONVERT_TABLE
  //  可达（484→727 / 714→1054 / 712→1048）。1458 同域逐字对拍 2026-09-15 零漂移。
  // ===========================================================================

  /** ★727 滚刺球专属支（P.cs:19196-19239 直译;1458 :19197-19240 同）。落地
   *  （lastVy>5）弹回 −0.65（−0.2 是 1055||99||1005||1014||1053||1057 支系数,
   *  727 不在集内）+ HitTiles + PlaySound(0) + 掷 3..5 发 763 碎片;撞墙 X：Kill()
   *  【后】掷同式 3..5 碎片（原版 Kill 后代码续行,727 撞墙确实碎——与 1054/1048 反）。
   *  Kill 尘/声面（:76391 尘表 727→40 + 缺省 dig）本仓未接=登记债（见文件头）。 */
  private rb727Bounce(lastVX: number, lastVY: number, game: GameHooks): void {
    const num48 = 30;                                  // :19198 碎片伤害
    const num49 = 2;                                   // :19199 碎片击退
    const num50 = 2;                                   // :19200 碎片速度
    if (this.vy !== lastVY && lastVY > 5) {            // :19201
      game.spawnParticles?.(this.cx, this.y + this.h, '#8A8A8A', 6, 1.2, { life: 14 });   // HitTiles 近似（家族①同款约定）
      game.playSfx?.('dig', 0.8);                      // :19203 PlaySound(0)
      this.vy = -lastVY * 0.65;                        // :19204
      this.rbSpawnCactusSpikes(num48, num49, num50, game);   // :19205-19220（owner==myPlayer 门单机恒真）
    }
    if (this.vx !== lastVX) {                          // :19222
      this.rbKill(game);                               // :19223 Kill()（无爆段,rbKill 面登记债——碎片在下行为 Kill 后续行）
      this.rbSpawnCactusSpikes(num48, num49, num50, game);   // :19224-19239（Kill 后续行,碎片照发）
    }
  }

  /** 727 碎片掷（:19206-19220/:19225-19239 双站同式）：n=Next(3,6)∈[3,5]、
   *  基相=NextFloat,环布角 (基相+i/n)·2π → 单位向量 ×2,Y>0（朝下）整向量 ×−0.7 翻上;
   *  出射位=弹心 Center。★循环节距 1/n 走 f32（C# float 累加;JS 双精度 1/3×3 累计
   *  0.999…<1 会多掷一发=行为差）。763 载体=Arrow（SetDefaults :7857-7866 aiStyle1/
   *  10×10/friendly+hostile/penetrate=−1/tileCollide/extraUpdates=1——json 全承,
   *  Arrow 构造按 projectileData(763) 取盒/pierce/extraUpdates;hostile 显式传=原版
   *  EVP 伤害面）。netSync:true ≙ NewProjectile 内联 SendData(27)（Z-F4 通道）。 */
  private rbSpawnCactusSpikes(dmg: number, kb: number, spd: number, game: GameHooks): void {
    const n = 3 + Math.floor(Math.random() * 3);       // :19206/:19225 Next(3,6)
    const base = Math.random();                        // :19207/:19226 NextFloat
    for (let f = 0; f < 1; f = f32(f + f32(1 / n))) {  // :19208/:19227 float 累加环（恰 n 发）
      const ang = (base + f) * Math.PI * 2;            // :19210/:19229（(base+f)×MathF.PI*2f——角度 f32 对拍差 ≤1e-6 rad,不承载行为）
      let vx = Math.cos(ang) * spd;
      let vy = Math.sin(ang) * spd;
      if (vy > 0) { vx *= -0.7; vy *= -0.7; }          // :19212-19214/:19231-19233（整向量 ×−0.7）
      game.spawnFriendlyProj?.(
        new Arrow(this.cx - 5, this.cy - 5, vx, vy, dmg, kb, 763, { hostile: true }),
        { netSync: true });                            // Center 出膛=位+5（NewProjectile 中心语义）
    }
  }

  /** ★1054 蜘蛛球专属支（P.cs:19240-19302 直译;1458 :19241-19303 同）——撞墙
   *  【不碎】（旧仓家族② Kill=债本体）：X 系数档 <0.5→0.1/<0.75→0.25/<1→0.5/缺省
   *  0.8（:19244-19254 num59）、Y 档同式缺省 0.6（:19255-19263 num60）;flag18 =
   *  localAI[0]>=500（:19270——★1054 不在拍龄钟 :26365 内→恒假=vanilla 死门,照抄
   *  勿修）;X 门 |lastVX|>2（非 5!）→ flag19 + localAI[1]++（:19282-19286）;flag19 →
   *  HitTiles+PlaySound(0)（:19289-19292）;静止杀 :19294-19296（localAI0 恒 0→死门）;
   *  两次撞墙上限 localAI[1]>1 → Kill（:19298-19300）。 */
  private rb1054Bounce(lastVX: number, lastVY: number, game: GameHooks): void {
    const num57 = Math.abs(lastVX);                    // :19242
    const num58 = Math.abs(lastVY);                    // :19243
    let num59 = 0.8;                                   // :19244 X 系数
    let num60 = 0.6;                                   // :19245 Y 系数
    if (num57 < 0.5) num59 = 0.1;                      // :19246-19254
    else if (num57 < 0.75) num59 = 0.25;
    else if (num57 < 1) num59 = 0.5;
    if (num58 < 0.5) num60 = 0.1;                      // :19255-19263
    else if (num58 < 0.75) num60 = 0.25;
    else if (num58 < 1) num60 = 0.5;
    const flag18 = this.localAI0 >= 500;               // :19270（1054 无钟→恒假,死门照抄）
    let flag19 = false;                                // :19271
    if (this.vy !== lastVY) {                          // :19272-19278
      if (flag18 || Math.abs(lastVY) > 5) flag19 = true;
      this.vy = -lastVY * num60;
    }
    if (this.vx !== lastVX) {                          // :19280-19287
      if (flag18 || Math.abs(lastVX) > 2) {            // 门 >2（Y 门 >5——两门不同值,勿归一）
        flag19 = true;
        this.localAI1++;                               // :19285
      }
      this.vx = -lastVX * num59;
    }
    if (flag19) {                                      // :19289-19292
      game.spawnParticles?.(this.cx, this.y + this.h, '#8A8A8A', 6, 1.2, { life: 14 });   // HitTiles 近似
      game.playSfx?.('dig', 0.8);                      // :19292 PlaySound(0)
    }
    if (Math.hypot(this.vx, this.vy) < 0.1 && this.localAI0 > 50) this.rbKill(game);   // :19294-19296（死门）
    if (this.localAI1 > 1) this.rbKill(game);          // :19298-19300（两次撞墙上限）
  }

  /** ★1048 屎球专属支（P.cs:19303-19378 直译;1458 :19304-19379 同）——撞墙
   *  【不碎】（旧仓家族② Kill=债本体）：X/Y 系数档同表 <0.5→0.1/<0.75→0.2/<1→0.45/
   *  缺省 0.75（:19305-19331 num63/num64）;flag20 = localAI[0]>=500（:19333——拍龄钟
   *  :26365 对 1048 生效=【承重位】,F2 勘误锚）;门 |lastV|>4（Y/X 同值,与 1054 异）;
   *  flag21 → localAI[1]+=3（:19353）+ HitTiles + PlaySound(Item177)（:19355,
   *  LegacySoundStyle(2,177)=便便族落地音）+ 尘 322×10（:19356-19362,盒=Hitbox 内
   *  随机点−(1,1) 2×2、速度=−v×0.5）+ PooFly 编排 2..3 粒（:19361-19367,clientOnly:
   *  true 本地直驱=pooFlyFx 单源,PositionInWorld=Hitbox 内随机点+velocity×−1）;
   *  静止杀 :19370-19372;localAI[1]>20 → Kill（:19374-19376,3/次→七次硬弹出局）。
   *  Kill 尘/声面（:76391 尘表 1048→322 + Item16）本仓未接=登记债（见文件头）。 */
  private rb1048Bounce(lastVX: number, lastVY: number, game: GameHooks): void {
    const num61 = Math.abs(lastVX);                    // :19305
    const num62 = Math.abs(lastVY);                    // :19306
    let num63 = 0.75;                                  // :19307 X 系数
    let num64 = 0.75;                                  // :19308 Y 系数
    if (num61 < 0.5) num63 = 0.1;                      // :19309-19319
    else if (num61 < 0.75) num63 = 0.2;
    else if (num61 < 1) num63 = 0.45;
    if (num62 < 0.5) num64 = 0.1;                      // :19321-19331
    else if (num62 < 0.75) num64 = 0.2;
    else if (num62 < 1) num64 = 0.45;
    const flag20 = this.localAI0 >= 500;               // :19333（1048 有钟→承重）
    let flag21 = false;                                // :19334
    if (this.vy !== lastVY) {                          // :19335-19341
      if (flag20 || Math.abs(lastVY) > 4) flag21 = true;
      this.vy = -lastVY * num64;
    }
    if (this.vx !== lastVX) {                          // :19343-19349
      if (flag20 || Math.abs(lastVX) > 4) flag21 = true;
      this.vx = -lastVX * num63;
    }
    if (flag21) {                                      // :19351-19367
      this.localAI1 += 3;                              // :19353
      game.spawnParticles?.(this.cx, this.y + this.h, '#8A8A8A', 6, 1.2, { life: 14 });   // :19354 HitTiles 近似
      game.playSfxFile?.('Item_177', 1, this.x, this.y);   // :19355 SoundID.Item177（Player.ts:9117 同名通道）
      for (let i = 0; i < 10; i++) {                   // :19356-19362
        // NextVector2FromRectangle(Hitbox) − Vector2.One,盒 2×2;速度 = −v×0.5（弹后值）
        const px = this.x + Math.random() * this.w - 1;
        const py = this.y + Math.random() * this.h - 1;
        game.spawnDust?.(px, py, 2, 2, 322, -this.vx * 0.5, -this.vy * 0.5);
      }
      const flies = 2 + Math.floor(Math.random() * 2); // :19361 2+Next(2)∈[2,3]
      for (let i = 0; i < flies; i++) {                // :19361-19367
        const px = this.x + Math.random() * this.w;    // NextVector2FromRectangle(Hitbox)
        const py = this.y + Math.random() * this.h;
        pooFlyFx(game, px - this.vx, py - this.vy);    // PositionInWorld = 位 + velocity×−1
      }
    }
    if (Math.hypot(this.vx, this.vy) < 0.1 && this.localAI0 > 50) this.rbKill(game);   // :19370-19372 静止杀
    if (this.localAI1 > 20) this.rbKill(game);         // :19374-19376（3/次→七次硬弹出局）
  }

  /** D1 防刷门（RainbowBoulder_PreventSpam P.cs:20139-20162 直译）：6000×6000 盒
   *  （Utils.CenteredRectangle）内同 owner 同 type 活跃弹（除自身）≥7 → Kill。
   *  owner 维度单机恒同主（联机弹域本仓统一本地主,与原版 owner==主同向）。 */
  private rbPreventSpam(game: GameHooks): void {
    const box = centeredRect(this.cx, this.cy, 6000, 6000);
    let count = 0;
    const list = game.projectiles?.() ?? [];
    for (const raw of list) {
      if (count >= 7) break;                           // :20148-20150 循环头即判
      if (raw === this) continue;                      // :20152 i != whoAmI
      const p = raw as { dead?: boolean; projId?: number; x: number; y: number; w: number; h: number };
      if (!p || p.dead || p.projId !== this.projId) continue;   // active && owner && type
      if (!rectsIntersect(p.x, p.y, p.w, p.h, box.x, box.y, box.w, box.h)) continue;
      count++;
    }
    if (count >= 7) this.rbKill(game);                 // :20160-20162
  }

  /** D1 smart bounce（RainbowBoulder_PerformSmartBounce P.cs:20227-20278 直译）：
   *  防刷门 → 藏宝高亮 → GetAreas（最近玩家 playArea/closeToMe）→ 敌怪索敌
   *  （CanBeChasedBy ∧ 盒交 playArea,按距玩家最近）→ JumpToEnemy；无敌怪则
   *  playArea（tile 化）寻宝 JumpToTreasure；再无则距玩家 <3000 → JumpToPlayer。 */
  private rbPerformSmartBounce(game: GameHooks): void {
    this.rbPreventSpam(game);                          // :20229
    if (this.dead) return;                             // :20230 !active
    this.rbHighlightNearbyTreasure(game);              // :20234
    const { closest, playArea, closeToMe } = this.rbGetAreas(game);   // :20235
    let num = Infinity;
    let num2 = Infinity;
    let target: RBChaseCandidate | null = null;
    for (const raw of game.enemies() as unknown[]) {   // :20237-20257（Main.npc 全槽）
      const e = raw as RBChaseCandidate | null;
      if (!e || e.dead) continue;                      // CanBeChasedBy active
      if (!((e.maxHp ?? 0) > 5) || e.dontTakeDamage || e.friendly || e.immortal) continue;
      if (!rectsIntersect(e.x, e.y, e.w, e.h, playArea.x, playArea.y, playArea.w, playArea.h)) continue;
      const num3 = Math.hypot(closest.cx - e.cx, closest.cy - e.cy);
      if (!(num <= num3)) {                            // :20245 `!(num <= num3)`
        num = num3;
        target = e;
        if (!rectsIntersect(e.x, e.y, e.w, e.h, closeToMe.x, closeToMe.y, closeToMe.w, closeToMe.h)
          && num2 > num3) {
          num2 = num3;                                 // nPC2 仅记账（原版 :20262 跳塔取 nPC）
        }
      }
    }
    if (target) {                                      // :20259-20265
      this.rbJumpToPosition(target.cx, target.cy, target.vx ?? 0, target.vy ?? 0, game);
      return;
    }
    // :20267-20271 playArea tile 化（int 逐字段 /16）→ GetTreasureCoords
    const pa2 = {
      x: Math.trunc(playArea.x / 16), y: Math.trunc(playArea.y / 16),
      w: Math.trunc(playArea.w / 16), h: Math.trunc(playArea.h / 16),
    };
    const treasure = this.rbGetTreasureCoords(game, pa2);
    if (treasure) {
      this.rbJumpToPosition(treasure[0] * 16, treasure[1] * 16, 0, 0, game);   // JumpToTreasure :20272（ToWorldCoordinates=×16）
      return;
    }
    const dist = Math.hypot(closest.cx - this.cx, closest.cy - this.cy);
    if (dist < 3000) {
      // JumpToPlayer :20276-20278 —— ★targetVelocity = player.position 字面（非
      // velocity!vanilla 原文 :20319 `JumpToPosition(player.Center, player.position)`
      // ——position (x,y) 被当速度喂进拦截式,1:1 照抄勿"顺手修"）。
      this.rbJumpToPosition(closest.cx, closest.cy, closest.x, closest.y, game);
    }
  }

  /** D1 藏宝高亮（RainbowBoulder_HighlightNearbyTreasure P.cs:20280-20307 直译）：
   *  中心 tile ±(CenteredRectangle(tile 心,(5,5)) → Left..Right/Top..Bottom 含端)
   *  扫 FriendlyFairyCanLureTo ∧ IsValidForOreFinder 格 → RainbowBoulder1 编排
   *  （clientOnly:true 本地直驱;内环 `num<0.5` 恰 1 迭代 → MovementVector=UnitX×16）
   *  + 命中行 j++ 双步（:20302）。 */
  private rbHighlightNearbyTreasure(game: GameHooks): void {
    const st = game.world.store;
    const tx = Math.trunc(this.cx / 16);
    const ty = Math.trunc(this.cy / 16);
    const rect = centeredRect(tx, ty, 5, 5);
    for (let i = rect.x; i <= rect.x + rect.w; i++) {
      for (let j = rect.y; j <= rect.y + rect.h; j++) {
        if (i < 2 || j < 2 || i >= st.w - 2 || j >= st.h - 2) continue;   // InWorld(i,j,2)
        if (!st.hasTile(i, j)) continue;
        const t = st.get(i, j);
        const sheet = TILE_DEFS[t]?.vanilla?.sheet ?? 0;
        if (!RB_FAIRY_LURE_SHEETS.has(sheet)) continue;
        const fx = (st as unknown as { frameX?: ArrayLike<number> }).frameX?.[st.idx(i, j)] ?? 0;
        if (!rbOreFinderValid(sheet, fx)) continue;
        const ang = Math.random() * Math.PI * 2;      // NextVector2Circular(16,16)=角均匀×线性半径（F6 口径,2 掷）
        const rr = Math.random() * 16;
        const px = i * 16 + 8 + Math.cos(ang) * rr;
        const py = j * 16 + 8 + Math.sin(ang) * rr;
        rainbowBoulderFx(game, 1, px, py, 16, 0);     // clientOnly:true → 不广播
        j++;                                          // :20302
      }
    }
  }

  /** D1 GetAreas（RainbowBoulder_GetAreas P.cs:20309-20315 直译）：FindClosest
   *  最近存活玩家（candidatePlayers 槽序镜像 Main.player 扫描;全灭回退首槽=原版
   *  返回 0 槽同构）→ playArea = CenteredRectangle(player.Center, MaxWorldViewSize
   *  (1920,1200) Main.cs:758) / closeToMe = CenteredRectangle(Center,(300,150))。
   *  ★SW-BJ88 债3（2026-09-15）：Player.FindClosest（Player.cs:4933-4957 直译;
   *  1458 :4934 同）距离度量=【曼哈顿 |Δx|+|Δy|】,非欧氏——本域仅此一处用
   *  FindClosest（PerformSmartBounce 敌怪扫描 :20241 Vector2.Distance=欧氏、
   *  JumpToPlayer <3000 门 :20278 同欧氏,均已对,勿顺手改）。 */
  private rbGetAreas(game: GameHooks): {
    closest: { x: number; y: number; cx: number; cy: number; dead: boolean };
    playArea: { x: number; y: number; w: number; h: number };
    closeToMe: { x: number; y: number; w: number; h: number };
  } {
    const players = (game.candidatePlayers?.() ?? [game.player])
      .filter((p) => p && !p.dead);
    if (players.length === 0) players.push(game.player);
    let closest = players[0]!;
    let bd = -1;                                       // 原版 num=-1f 哨兵（:4946）
    for (const p of players) {
      const d = Math.abs(p.cx - this.cx) + Math.abs(p.cy - this.cy);   // :4948 曼哈顿
      if (bd < 0 || d < bd) { bd = d; closest = p; }   // :4949 `num==-1f || num2<num`
    }
    return {
      closest,
      playArea: centeredRect(closest.cx, closest.cy, 1920, 1200),
      closeToMe: centeredRect(this.cx, this.cy, 300, 150),
    };
  }

  /** D1 跃迁核（RainbowBoulder_JumpToPosition P.cs:20338-20371 直译）：
   *  初速 = (target−Center).SafeNormalize((0,−1)) × Remap(len,0,200,4,32);
   *  RB4 编排（clientOnly:false → 本地直生 + module8 上行,owner==myPlayer 门单机
   *  恒真）;num4=8..32 步 2 逐档拦截解（GetChaseResults）命中 → 速度=ChaserVelocity
   *  经 FactorAcceleration((0,0.6))、num3=(int)(InterceptionTime−2);全 miss →
   *  FactorAcceleration(初速, min(120,num3));ai[1]=num3（宽限拍数）。 */
  private rbJumpToPosition(tCX: number, tCY: number, velX: number, velY: number, game: GameHooks): void {
    const dx = tCX - this.cx;
    const dy = tCY - this.cy;
    const len = Math.hypot(dx, dy);
    const num2 = remap1457(len, 0, 200, 4, 32);        // :20342
    let num3 = len / num2;                             // :20343
    let vx: number;
    let vy: number;
    if (len > 0) {
      vx = (dx / len) * num2;                          // SafeNormalize((0,-1))×num2
      vy = (dy / len) * num2;
    } else {
      vx = 0; vy = -num2;                              // 零长回退 Vector2.UnitY*-1
    }
    rainbowBoulderFx(game, 4, this.cx, this.cy, vx, vy);   // :20346-20353 clientOnly:false
    game.broadcastParticleOrchestra?.(ParticleOrchestraType.RainbowBoulder4, this.cx, this.cy, vx, vy);
    let flag = false;
    for (let num4 = 8; num4 <= 32; num4 += 2) {        // :20355-20364
      const cr = getChaseResults1457(this.cx, this.cy, num4, tCX, tCY, velX, velY);
      if (cr.happens) {
        [vx, vy] = factorAcceleration1457(cr.cvx, cr.cvy, cr.time, 0);
        num3 = Math.trunc(cr.time - 2);                // (int) 截断
        flag = true;
      }
    }
    if (!flag) {
      [vx, vy] = factorAcceleration1457(vx, vy, Math.min(120, num3), 0);   // :20366-20368
    }
    this.vx = vx;
    this.vy = vy;
    this.ai1 = num3;                                   // :20369
  }

  /** D1 寻宝（RainbowBoulder_GetTreasureCoords P.cs:20374-20420 直译）：
   *  playArea（tile 化入参）∩ 世界内缩 40（Inflate(−40)）→ 逐格扫
   *  FriendlyFairyCanLureTo ∧ IsValidForOreFinder；Ore 集格 7×7 同类 <40 → 优先级
   *  置 −1 作废;同优先取最近（`num2 <= num4` ∧ `num2!=num4 || d<num3` 序）。 */
  private rbGetTreasureCoords(game: GameHooks,
    pa: { x: number; y: number; w: number; h: number }): [number, number] | null {
    const st = game.world.store;
    // Rectangle.Intersect(playArea, Rect(0,0,maxTilesX,maxTilesY).Inflate(-40,-40))
    const x0 = Math.max(pa.x, 40);
    const y0 = Math.max(pa.y, 40);
    const xR = Math.min(pa.x + pa.w, st.w - 40);       // Right = X+Width
    const yB = Math.min(pa.y + pa.h, st.h - 40);       // Bottom = Y+Height
    let num2 = -1;
    let num3 = -1;
    let bx = -1;
    let by = -1;
    for (let i = x0; i <= xR; i++) {                   // Left..Right 含端（原版字面）
      for (let j = y0; j <= yB; j++) {
        if (!st.hasTile(i, j)) continue;
        const t = st.get(i, j);
        const sheet = TILE_DEFS[t]?.vanilla?.sheet ?? 0;
        if (!RB_FAIRY_LURE_SHEETS.has(sheet)) continue;
        const fx = (st as unknown as { frameX?: ArrayLike<number> }).frameX?.[st.idx(i, j)] ?? 0;
        if (!rbOreFinderValid(sheet, fx)) continue;
        let num4 = RB_LURE_PRIORITY[sheet] ?? 0;       // tileOreFinderPriority 缺省 0（非 −1）
        if (RB_ORE_SHEETS.has(sheet)) {                // TileID.Sets.Ore :20399
          let num8 = 0;
          for (let k = i - 3; k <= i + 3; k++) {       // num5=num6=3（7×7）
            for (let l = j - 3; l <= j + 3; l++) {
              if (st.hasTile(k, l) && st.get(k, l) === t) num8++;
            }
          }
          if (num8 < 40) num4 = -1;                    // num7=40
        }
        if (num2 <= num4) {                            // :20412
          const num9 = Math.hypot(i * 16 + 8 - this.cx, j * 16 + 8 - this.cy);
          if (num2 !== num4 || !(num9 >= num3)) {      // :20414 同优先取近
            num2 = num4;
            num3 = num9;
            bx = i;
            by = j;
          }
        }
      }
    }
    return num2 !== -1 && bx >= 0 ? [bx, by] : null;   // :20419 return num2 != -1
  }

  /** D2 唯一死亡门（vanilla Kill() 单口——timeLeft 耗尽/PreventSpam/boss 命中/
   *  1013 静止杀·20 弹上限全走 Kill → type==1047 爆段）。★P.cs:14336
   *  `type==1047 && targetNPC.TreatedAsABossForRainbowBoulders → Kill()`（命中
   *  boss 即碎）已由 SW-BJ88 债2 接线（2026-09-15,敌怪伤害环内）。 */
  /** ★SW-BJ93 债1（2026-09-16）：Damage_CanDealDamage 本域适用支（P.cs:12461 全函数,
   *  尾支 :12491 直译;1458 :12491 逐字同,byte-diff 全等 2026-09-16）——aiStyle25 ∧
   *  type∉{1021,1047,1005,1014} ∧ localAI[2]<=7 → false（出生 1..7 拍四面全免,
   *  第 8 拍首伤;localAI[2]=AI_025 头 :26360 出生计数,AI 先++/结算后读=Update 序）。
   *  全函数其余支（aiStyle10 localAI1==-1 / 85·1106 localAI0>=54 / 1091·1122
   *  localAI0<=0 / projPet 大表）对本家族逐条核空（99/727/1013/1014/1021/1047/1048/
   *  1053/1054/1055/1057/1002 无一命中）=仅尾支适用（ProjCutTiles「调用方自证」
   *  同款口径）;1002=aiStyle16（SetDefaults :9531）不进 aiStyle25 支=不受门
   *  （本仓钟也对其停计）。PVP 面本仓单机不建模;pet 大表全 miss（家族非宠）。 */
  private rbDamageCanDeal(): boolean {
    if (this.projId !== 1002
      && this.projId !== 1021 && this.projId !== 1047
      && this.projId !== 1005 && this.projId !== 1014
      && this.localAI2 <= 7) return false;             // :12491（字面序:1021→1047→1005→1014）
    return true;
  }

  private rbKill(game: GameHooks): void {
    // ★SW-BJ97/RB22a 债1（2026-09-16）：Kill() 头幂等闸——vanilla Kill() 首支
    //  `if (!active) return;`（P.cs:71763-71765;1458 :71764-71766 同域逐字,Kill
    //  本体 :71752/:71753）——同拍多 Kill 支齐发时第二发空转=原版唯一防双发面。
    //  本仓同构多站（vanilla 亦两连 Kill 依赖此闸,见各支注）：1048 静止杀
    //  （rb1048Bounce :19370-72 站,本仓 :1120 无 return）与 >20 弹杀（:19374-76 站,
    //  本仓 :1121）【同拍可达齐发】（弹后 |v|<0.1 ∧ localAI[1]>20）→ 无闸家族死亡
    //  面双发（尘 322×60 + Item_16×2）;1013（:19183-90 两连 Kill,本仓 :977/:981）、
    //  1054（:19294-300 双门,本仓 :1068/:1069）同构（caller dead 早退 / 1054 不在
    //  拍龄钟 → 静止门恒假=现不可达,结构 1:1 照抄原版=本闸保护面）。
    //  dead ≡ vanilla active 位。
    if (this.dead) return;
    this.dead = true;
    if (this.projId === 1047) { this.rbKillRainbowExplosion(game); return; }
    // ★SW-BJ93 债2（2026-09-16）：家族死亡尘/声面接通（BJ92 登记债——旧仓家族
    //  Kill 面整缺,本行前 rbKill 仅 1047 爆段）。
    this.rbKillFamilyFace(game);
    // ★SW-BJ93 债①/BJ102（2026-09-16）：1002 aiStyle16 Kill 支全面（P.cs:71766-71795
    //  flag3 臂;详 rbKill1002Face 注）——族表外与家族尘面互斥（类型集不相交,序无歧义）。
    if (this.projId === 1002) this.rbKill1002Face(game);
  }

  /** ★SW-BJ93 债①/BJ102（2026-09-16）：1002 aiStyle16 Kill 支全面单发。vanilla
   *  Kill()（P.cs:71766-71795,1458 同域）flag3=ai[0]!=1000 臂序：
   *  PrepareBombToBlow(:47629——1002 无 resize 支=盒保持 SetDefaults 260×260、
   *  damage 400、kb 10)→SelfHurtPlayers(:71790)→Damage()(:71792)→
   *  Kill_Bombs_DoUsualKillCode(:80125 大族视觉支)→Kill_ExplodeTiles(:78990——
   *  :79027 闸门表无 1002=零地形破坏,:79064 `type==1002→num6=10` 死代码,SW-J1 定谳)。
   *  本仓经 Game.explodeAt 既有 1:1 面单发承载（SW-J1 谱系,SelfHurt=玩家段
   *  :15104-15152 全门含 trap sweater cap+死因归因;Damage=PVE 链 dmg=DV(400)/2
   *  :12971-75 逐字——usesIDStaticNPCImmunity 15t 静态冷却对 1 拍寿命弹无观察面;
   *  视觉=大族支 Item14+尘 31×50+尘 6×(80+80)+gore 61-63×8 盒 260×260）。
   *  伤害盒=pos..pos+260（vanilla Hitbox 语义,SetDefaults :9526-9527 json 承载）
   *  → explodeAt compare=pos+半盒（爆炸面默认盒心锚）。
   *  ★去重判据（BJ97 400×2 双发消除）：格侧 tntBarrelBlast 已改 Spawn-only
   *  （0 爆炸面,Game.ts）+本面单发+旧 rbSelfHurtPlayers 面退役 → 玩家承伤恰一次
   *  400 面（vanilla 单面）。参：kb=10（出生参,WorldGen.cs:49178）/kbDir=+1
   *  （SW-AC1 零速生成弹恒 +1）/pen=0/radius=0∧destroyTiles=false（SW-J1 死代码
   *  定谳）/tx,ty=弹左上格（recLog 锚=旧格侧调用同位）。 */
  private rbKill1002Face(game: GameHooks): void {
    const hd = projectileData(1002);
    const half = (hd?.width ?? 260) / 2;               // SetDefaults 260×260（json 承载）
    game.explodeAt?.(Math.trunc(this.x / 16), Math.trunc(this.y / 16), this.dmg,
      0, false, half, 0, 1002, this.x + half, this.y + half, KB_X, 1);

  }

  /** ★SW-BJ93 债2（2026-09-16）：Kill() 家族死亡尘/声面（P.cs:76355-76500 直译;
   *  1458 :76356-76501 同域逐字,byte-diff 全等 2026-09-16）——BJ92 登记债：
   *  「本仓 rbKill 仅 1047 有爆段=家族 Kill 面整缺」。声名轨映射 vanillaSoundName
   *  （vanillaNpcs.ts:267 NPCHit29→NPC_Hit_29/NPCDeath6→NPC_Killed_6）;dig=
   *  SoundEngine.PlaySound(0) 缺省支（AshBallProj:207/Arrow:3125 同款通道）。 */
  private rbKillFamilyFace(game: GameHooks): void {
    if (!RB_KILL_FAMILY.has(this.projId)) return;
    // :76356-76359 NetMessage.SendData(27,…,whoAmI)（owner==myPlayer ∧ netMode!=0）
    //  ——联机弹状态同步;单机 no-op（rbKillRainbowExplosion 同款不广播,登记）。
    // :76361-76369 num623 尘型 switch 直译（缺省 _ => 1）
    const num623 = this.projId === 1013 ? 243
      : this.projId === 727 ? 40
      : this.projId === 1014 ? 12
      : this.projId === 1021 ? 323
      : this.projId === 1048 ? 322
      : 1;
    // :76370-76389 声面——(int)position.X/Y = Kill 拍弹盒左上截断
    const px = Math.trunc(this.x), py = Math.trunc(this.y);
    if (this.projId === 1048) game.playSfxWav?.('Item_16', 1, px, py);        // SoundID.Item16
    else if (this.projId === 1053) game.playSfxFile?.('Item_14', 1, px, py);
    else if (this.projId === 1054) game.playSfxFile?.('NPC_Hit_29', 1, px, py);
    else if (this.projId === 1055) game.playSfxFile?.('NPC_Killed_6', 1, px, py);
    else game.playSfx?.('dig', 1, px, py);                                    // PlaySound(0)=dig
    if (this.projId === 1053) {
      // :76390-76446 专属爆面——盒 31→64 居中（position+=15/width=64/position-=32
      //  净效=(x-17,y-17,64,64),尾段还原;本仓算术化非变异=后续语句读原盒同构）。
      const bx = this.x - 17, by = this.y - 17;
      for (let i = 0; i < 25; i++) {                                          // :76399-76403
        const d = game.spawnDust?.(bx, by, 64, 64, 31, 0, 0, 100, null, 2);
        if (d) { d.vx *= 1.4; d.vy *= 1.4; }
      }
      for (let i = 0; i < 40; i++) {                                          // :76405-76415
        const d1 = game.spawnDust?.(bx, by, 64, 64, 6, 0, 0, 100, null, 3);
        if (d1) { d1.noGravity = true; d1.vx *= 5; d1.vy *= 5; }
        const d2 = game.spawnDust?.(bx, by, 64, 64, 6, 0, 0, 100, null, 2);
        if (d2) { d2.vx *= 3; d2.vy *= 3; }
      }
      for (let i = 0; i < 4; i++) {                                           // :76417-76435
        // Gore.NewGore(展开盒心−(24,24), default, Next(61,64)) = (x-9,y-9);scale1.5;
        // velocity 逐件 ±1.5 对角四向（原文四连写 vel.X±=1.5/vel.Y±=1.5）。
        const g = GorePiece.newGore(61 + Math.floor(Math.random() * 3), this.x - 9, this.y - 9, 0, 0, 1.5);
        if (g) {
          g.vx += i % 2 === 0 ? 1.5 : -1.5;
          g.vy += i < 2 ? 1.5 : -1.5;
        }
      }
    } else if (this.projId === 1054) {
      for (let i = 0; i < 20; i++) {                                          // :76447-76452
        game.spawnDust?.(this.x, this.y, this.w, this.h, 30, 0, -1);
      }
    } else if (this.projId === 1055) {
      for (let i = 0; i < 50; i++) {                                          // :76453-76466
        const d = game.spawnDust?.(this.x + 4, this.y + 4, this.w - 8, this.h - 8, 192,
          this.vx * 0.5, this.vy * 0.5, 100, { r: 100, g: 100, b: 100, a: 100 });
        if (d) { d.scale *= 1.5; d.vx *= 2; d.vy *= 2; d.noGravity = true; }
      }
    } else if (this.projId !== 1057) {
      // :76467-76478 缺省支——尘 num623×30、半数 scale×1.4（Next(2)==0）。:76476
      //  `velocity *= 1.9f` 在环内=弹体速度死写（Kill 后 velocity 无观察面）,
      //  1:1 不移植（登记,防后车当漏）。
      for (let i = 0; i < 30; i++) {
        const d = game.spawnDust?.(this.x, this.y, this.w, this.h, num623);
        if (d && Math.floor(Math.random() * 2) === 0) d.scale *= 1.4;
      }
    }
    // :76479-76487 掉落（owner==myPlayer 门单机恒真;Item.NewItem(EntitySource_Loot,
    //  Center, …)=Center 出膛）——1057→5523 Friendly Boulder（BoulderThatSpawnsPet
    //  专属）/ 1014→29 Life Crystal（LifeCrystalBoulder 专属）。
    if (this.projId === 1057) {
      game.spawnDrop?.(this.cx, this.cy, VANILLA_ITEM_KEY_BY_ID[5523] ?? 'vi_5523_BoulderPet', 1);
    }
    if (this.projId === 1014) {
      game.spawnDrop?.(this.cx, this.cy, VANILLA_ITEM_KEY_BY_ID[29] ?? 'vi_29_LifeCrystal', 1);
    }
    // :76488-76490（1458 :76489-76491）netMode!=1 支——★SW-BJ93 债②（2026-09-16）
    //  地形面已落刀（原 rbKillFamilyFace 尾注「本刀未移植=邻接债登记」退役）：
    //  1048→SpreadPoopPyramid / 1053→LavaBoulderExplosion,见 rbKillTerrainFace 注。
    this.rbKillTerrainFace(game);
  }

  /** ★SW-BJ93 债②（2026-09-16）：Kill() 地形面（P.cs:76478-76489 `if
   *  (Main.netMode != 1)` 支直译;1458 :76479-76490 同域逐字 byte-diff 全等 2026-09-16）。
   *  ★原版 Kill() 调用序亲读定谳：尘表(:76361-69)→声(:76370-89)→1053 专属爆面
   *  (:76391-76446)→1054/1055/缺省尘(:76438-76469)→掉落(:76470-77)→【地形面最后】
   *  (:76478-76489)——故本面插在 rbKillFamilyFace 掉落臂之后=1048 铺置面/1053 注液
   *  面的 RNG（金字塔逐格铺置尘 322 掷+TryKillingReplaceableTile 破格面）恒在家族
   *  死亡尘/掉落掷【之后】,逐位同序。netMode!=1 = 单机恒真（本仓单机域无条件跑）。 */
  private rbKillTerrainFace(game: GameHooks): void {
    if (this.projId === 1048) {
      // :76482 pt=Center.ToTileCoordinates();:76483 RunDelegateMethodPushUpForHalfBricks(pt,2f,SpreadPoopPyramid)
      this.rbSpreadPoopPyramid(game);
    }
    if (this.projId === 1053) {
      this.rbLavaBoulderExplosion(game);               // :76487 LavaBoulderExplosion()（:71647-71661）
    }
  }

  // ---- ★SW-BJ93 债② 世界写入面（RollingBoulder 内直译,委托面最小化：唯一新增
  //  GameHooks 薄委托 = slopeTileAt（Game.worldGenSlopeTile(SlopeTile :82045) 既有
  //  1:1 面的 3 行包装）;其余写位走 TileStore.setTile/setLiquid 既有原语）----

  /** Entity.Center tile 化（Utils.ToTileCoordinates Utils.cs:1899-1902 =
   *  `(int)vec.X >> 4` 算术右移;Center=position+(float)width/2f Entity.cs:53-55 浮点
   *  半宽——入口 fround 物化 Vector2 f32 存储域,LineOfSight F4 批同口径）。 */
  private rbCenterTileX(): number {
    return Math.trunc(Math.fround(Math.fround(this.x) + Math.fround(this.w / 2))) >> 4;
  }

  private rbCenterTileY(): number {
    return Math.trunc(Math.fround(Math.fround(this.y) + Math.fround(this.h / 2))) >> 4;
  }

  /** (int)Center.X / 16 直译（C# int÷ 朝零截断;负带与 `>>4` 分叉：Center.X=−8px →
   *  本式 tile 0、`>>4`=−1）——消费点=1053 LavaBoulderExplosion :71650
   *  `new Vector2((int)base.Center.X / 16, …)`。★SW-BJ102 勘误（2026-09-16）：
   *  旧注把 :71650 锚在本类 rbCenterTileX（Utils.ToTileCoordinates = `(int)vec.X
   *  >> 4`,Utils.cs:1899-1902）——两式并存于 vanilla（:76482 1048 铺置用 >>4、
   *  :71650 1053 注液用 int÷）,分消费点保真勿合并（LineOfSight L2「两提取基元
   *  不合并」同判例）。本仓弹无出界杀（登记债,WeaponProj.ts:614 同案）负带理论
   *  可达 → 直落刀消除（变异=负坐标场景红）。−0 归 +0（tile 下标域无 −0 格）。 */
  private rbCenterTileTruncX(): number {
    const q = Math.trunc(Math.trunc(Math.fround(Math.fround(this.x) + Math.fround(this.w / 2))) / 16);
    return q === 0 ? 0 : q;
  }

  private rbCenterTileTruncY(): number {
    const q = Math.trunc(Math.trunc(Math.fround(Math.fround(this.y) + Math.fround(this.h / 2))) / 16);
    return q === 0 ? 0 : q;
  }

  /** WorldGen.SolidOrSlopedTile(Tile)（WorldGen.cs:70515-70537 直译）——tile≠null ∧
   *  active ∧ tileSolid ∧ !tileSolidTop ∧ !inActive（"OrSloped"名不副实:坡位不参与
   *  判,原文如此;:71636 半砖顶推消费）。 */
  private rbSolidOrSlopedTile(st: { inBounds(x: number, y: number): boolean;
    hasTile(x: number, y: number): boolean; isActuated(x: number, y: number): boolean;
    idx(x: number, y: number): number; get(x: number, y: number): number;
    half: ArrayLike<number> }, x: number, y: number): boolean {
    if (!st.inBounds(x, y) || !st.hasTile(x, y) || st.isActuated(x, y)) return false;
    const d = TILE_DEFS[st.get(x, y)];
    return !!d && !!d.solid && !d.platform;
  }

  /** ★1048 便便金字塔（Kill_DirtAndFluidProjectiles_RunDelegateMethodPushUpForHalfBricks
   *  P.cs:71627-71645 + Utils.FloodFillTile Utils.cs:2548-2592 + DelegateMethods.
   *  SpreadPoopPyramid→SpreadTile DelegateMethods.cs:469/474-599 全链直译）：
   *  ①半砖顶推（:71630-71641——pt 格 active∧halfBrick ∧ 上格非 SolidOrSlopedTile →
   *  pt.Y--）;②v2_1=pt/f_1=2f;③洪水填充 BFS（BitSet2D.Reset(pt,⌈2⌉+1=3)=7×7 位域、
   *  FIFO 层序、出队格 plot 真 → 四邻【左,右,上,下】序 InWorld∧未访 → 入队;扩散界=
   *  金字塔形门,plot 真 ⊆ 12 格形域）。 */
  private rbSpreadPoopPyramid(game: GameHooks): void {
    const st = game.world.store;
    let px = this.rbCenterTileX();
    let py = this.rbCenterTileY();
    if (!st.inBounds(px, py)) return;                  // FloodFillTile 头 WorldGen.InWorld(point)
    if (st.hasTile(px, py) && st.half[st.idx(px, py)] !== 0) {          // :71630
      if (py - 1 >= 0 && !this.rbSolidOrSlopedTile(st, px, py - 1)) py--;   // :71632-71640
    }
    const plot = (x: number, y: number): boolean => this.rbSpreadTilePoop(x, y, px, py, game);
    const visited = new Set<number>();
    const queue: Array<[number, number]> = [[px, py]];
    visited.add(py * st.w + px);
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi]!;
      if (!plot(cur[0], cur[1])) continue;             // :2567 plot 假 → 不扩散
      for (const [nx, ny] of [[cur[0] - 1, cur[1]], [cur[0] + 1, cur[1]],
        [cur[0], cur[1] - 1], [cur[0], cur[1] + 1]] as const) {
        if (!st.inBounds(nx, ny)) continue;            // :2570/:2575/:2580/:2585 InWorld
        const key = ny * st.w + nx;
        if (visited.has(key)) continue;                // floodFillBitset.Add
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
  }

  /** DelegateMethods.SpreadTile(x, y, 666, 322, pyramidShape:true)（:474-599 直译,
   *  overLiquidType=-1 支域）。返回值=FloodFillTile 扩散判据（:2567 plot）。 */
  private rbSpreadTilePoop(x: number, y: number, ax: number, ay: number, game: GameHooks): boolean {
    const st = game.world.store;
    const num = 2;                                     // :476 Math.Max(0.1f, f_1)
    // :477-487 金字塔形门（num3=ay+num/2、num4=|y−num3|/num、num2=num×(1−num4)）
    const num2 = num * (1 - Math.abs(y - (ay + num / 2)) / num);
    if (Math.abs(x - ax) > num2 || Math.abs(y - ay) > num) return false;
    this.rbTryKillingReplaceableTilePoop(x, y, game);  // :500
    if (this.rbPlacePoopBlock(x, y, game)) {           // :501 WorldGen.PlaceTile(x,y,666)
      // :520-530 成功面：3 迭代×2 尘 322（盒=格 16×16、α100）——①scale2.2:
      //  noGravity→Y−1.2→v×4（原文 Y 先于 ×4=Y 净 ×4 后 −4.8）②scale1.3:Y−1.2→v×2
      const wx = x * 16, wy = y * 16;
      for (let i = 0; i < 3; i++) {
        const d = game.spawnDust?.(wx, wy, 16, 16, 322, 0, 0, 100, null, 2.2);
        if (d) { d.noGravity = true; d.vy -= 1.2; d.vx *= 4; d.vy *= 4; }
        const d2 = game.spawnDust?.(wx, wy, 16, 16, 322, 0, 0, 100, null, 1.3);
        if (d2) { d2.vy -= 1.2; d2.vx *= 2; d2.vy *= 2; }
      }
      // :531-548 邻坡拍平——下格 非平台∧(topSlope{1,2}∨halfBrick) → SlopeTile(x,y+1);
      //  上格 非平台∧bottomSlope{3,4} → SlopeTile(x,y−1)（game.slopeTileAt=
      //  WorldGen.SlopeTile(i,j,0,false,true) 1:1 面,见 GameHooks 委托注）
      const below = st.inBounds(x, y + 1) ? st.idx(x, y + 1) : -1;
      if (below >= 0) {
        const bd = TILE_DEFS[st.type[below]];
        const bs = bd?.vanilla?.sheet ?? -1;
        if (bd && !RB_PLATFORM_SHEETS.has(bs)
          && (st.slope[below] === 1 || st.slope[below] === 2 || st.half[below] !== 0)) {
          game.slopeTileAt?.(x, y + 1);
        }
      }
      const above = st.inBounds(x, y - 1) ? st.idx(x, y - 1) : -1;
      if (above >= 0) {
        const ad = TILE_DEFS[st.type[above]];
        const asheet = ad?.vanilla?.sheet ?? -1;
        if (ad && !RB_PLATFORM_SHEETS.has(asheet)
          && (st.slope[above] === 3 || st.slope[above] === 4)) {
          game.slopeTileAt?.(x, y - 1);
        }
      }
      // :549-578 草族 3×3（自身 666 除外）全围 SolidTile → KillTile(fail:true) 转化
      this.rbKillGrassAround(x, y, game);
      return true;                                     // :579
    }
    // :581-598 PlaceTile 失败 fall-through（overLiquidType=-1 → :581 支跳过）——
    //  残型非实心（或窄表平台/380）→ 真=BFS 仍经此扩散;实心 → 假。★残型 type 域
    //  对拍：vanilla 残型 type=0=土块（tileSolid[0]=true → :594-597 假）——本仓 id 0
    //  是 'empty' 非实心 def,须按 vanilla 语义显式早退（幽灵残型 type≠0 照常按域判）。
    if (!st.inBounds(x, y)) return false;              // :586 tile2 == null
    const resid = st.get(x, y);
    if (resid === 0) return false;                     // vanilla type 0（土）实心 → 假
    const d = TILE_DEFS[resid];
    const sheet = d?.vanilla?.sheet ?? -1;
    // :594-597 `if (Main.tileSolid[type] && !TileID.Sets.Platforms[type]) return
    //  type == 380;`——★SW-BJ102 勘误（2026-09-16）：Platforms 门必须按窄表
    //  TileID.cs:243（RB_PLATFORM_SHEETS={19,427,435,436,437,438,439}）读,旧
    //  `!d.platform` 超集判（SW-AW1b 判例同病）把 tileSolid∧tileSolidTop∧∉窄表
    //  类放行——活实例=sheet 239 矿石条（vanilla tileSolid[239]=true Main.cs:9797
    //  ∧tileSolidTop :9798∧∉窄表 → 假=BFS 不穿过;旧判 d.solid=false 直接落
    //  :598 true=穿过）。tileSolid 还原 = solid∨platform（本仓编码：solid↔
    //  tileSolid∧!tileSolidTop、platform↔tileSolidTop 类——19/239/380/427 全
    //  platform:true 而非 solid:true）;380 种植箱特例保留（tileSolid[380]=true
    //  Main.cs:9799∧∉窄表 → 真=BFS 穿过种植箱,原文如此）。
    if (d && (d.solid || d.platform) && !RB_PLATFORM_SHEETS.has(sheet)) return sheet === 380;
    return true;                                       // :598
  }

  /** SpreadTile 草族围杀面（DelegateMethods.cs:549-578 直译）——放置格 3×3 邻域内
   *  草族 {2,23,60,70,109,199,477,492}（自身 666 除外）且其自身 3×3 全 WorldGen.
   *  SolidTile → KillTile(j,k,fail:true)（:64222-64250 转化支:草→土/泥零掉落+
   *  SquareTileFrame;dustAmount fail 档=3 :67124-67127=killTile 尘近似〔spawnParticles
   *  灰粒约定〕;声面=dig 近似〔repo SlopeTile fail-kill 同款,登记:vanilla 按
   *  KillTile_PlaySounds fail 档变体〕）。 */
  private rbKillGrassAround(x: number, y: number, game: GameHooks): void {
    const st = game.world.store;
    for (let j = x - 1; j <= x + 1; j++) {
      for (let k = y - 1; k <= y + 1; k++) {
        if (!st.inBounds(j, k) || !st.hasTile(j, k)) continue;           // :553 !tile.active()
        const tid = st.type[st.idx(j, k)];
        const sheet = TILE_DEFS[tid]?.vanilla?.sheet ?? -1;
        if (sheet === 666) continue;                                     // :554 tileType == tile.type
        const bare = RB_GRASS_TO_BARE[sheet];
        if (bare === undefined) continue;                                // :554 草族白名单
        let flag = true;                                                 // :558
        for (let l = j - 1; l <= j + 1; l++) {
          for (let m = k - 1; m <= k + 1; m++) {
            if (!solidTileAt(st, l, m)) flag = false;                    // :563 WorldGen.SolidTile（OOB→true 怪癖在 solidTileAt 内）
          }
        }
        if (flag) {
          game.spawnParticles?.(j * 16 + 8, k * 16 + 8,
            TILE_DEFS[tid]?.mapColor ?? '#8B7553', 3, 1.2);              // KillTile(fail) 尘 3
          const bareId = TILE_BY_KEY[bare];
          if (bareId !== undefined) st.setTile(j, k, bareId);            // :64230/:64238 转化+SquareTileFrame(:64248)
        }
      }
    }
  }

  /** WorldGen.TryKillingReplaceableTile(x, y, 666)（WorldGen.cs:59803-59831 直译）——
   *  可杀面=tileCut∨BreakableWhenPlacing∨IsADripTile（≠666）;flag3=tileAlch[666]=假
   *  → `num || ((flag|flag2)&flag3)` ≡ num（下格∉{78,380,579} 花盆族）,真 →
   *  KillTile(x,y)（全语义:掉落+声,game.breakTile 既有 1:1 委托）。 */
  private rbTryKillingReplaceableTilePoop(x: number, y: number, game: GameHooks): void {
    const st = game.world.store;
    if (x < 2 || y < 2 || x >= st.w - 2 || y >= st.h - 2) return;   // :59805 InWorld(x,y,2) fluff=2
    if (!st.hasTile(x, y)) return;                     // :59809 active()
    const tid = st.type[st.idx(x, y)];
    const sheet = TILE_DEFS[tid]?.vanilla?.sheet ?? -1;
    if (!(TILE_CUT_SHEETS.has(sheet) || BREAKABLE_WHEN_PLACING_SHEETS.has(sheet)
      || RB_DRIP_SHEETS.has(sheet))) return;
    if (sheet === 666) return;                         // :59811 type != tileType
    const belowSheet = TILE_DEFS[st.get(x, y + 1)]?.vanilla?.sheet ?? 0;   // :59813（y+1 界内,InWorld(2) 保证）
    const num = belowSheet !== 78 && belowSheet !== 380 && belowSheet !== 579;
    if (num) {
      game.breakTile?.(x, y);                          // :59819 KillTile(x, y)（全语义）
    }
  }

  /** Collision.EmptyTile(i, j)（Collision.cs:1361-1383 直译）——!active ∧ 无活玩家
   *  （active∧!dead∧!ghost）∧ 无活 NPC（Main.npc 全桶;本仓 enemies+npcs+critters
   *  三桶并集）矩形不相交。Rectangle.Intersects 闭开语义=rectsIntersect;实体矩形
   *  坐标 (int)position 截断（Collision.cs:1370 玩家/:1377 NPC;1458 同域 :1370/:1377
   *  全等）→ Math.trunc 朝零截断同构。 */
  private rbEmptyTile1457(x: number, y: number, game: GameHooks): boolean {
    const st = game.world.store;
    if (!st.inBounds(x, y) || st.hasTile(x, y)) return false;
    const rx = x * 16, ry = y * 16;
    for (const p of (game.candidatePlayers?.() ?? [game.player])) {
      const pp = p as { dead?: boolean; ghost?: boolean; x: number; y: number; w: number; h: number };
      if (!pp || pp.dead || pp.ghost) continue;
      if (rectsIntersect(rx, ry, 16, 16, Math.trunc(pp.x), Math.trunc(pp.y), pp.w, pp.h)) return false;   // (int)position :1370
    }
    const buckets = [game.enemies(), game.npcs?.() ?? [], game.critters?.() ?? []];
    for (const bucket of buckets) {
      for (const raw of bucket as unknown[]) {
        const e = raw as { dead?: boolean; x: number; y: number; w: number; h: number } | null;
        if (!e || e.dead) continue;                    // Main.npc[l].active
        if (rectsIntersect(rx, ry, 16, 16, Math.trunc(e.x), Math.trunc(e.y), e.w, e.h)) return false;       // (int)position :1377
      }
    }
    return true;
  }

  /** WorldGen.PlaceTile(i, j, 666)（WorldGen.cs:59833-59845+:60725-60759 最小语义面）——
   *  666 实心 → :59864 门走 Collision.EmptyTile 臂（forced=假、其余覆写臂对 666 全
   *  不匹配）;:59945 液格门对 666 不在排除表 {3,20,24,27,32,51,69,72,201,352,529,624,
   *  700,637,656,701,697} → 液上【可】铺（1:1）;写位=default 支 active+type
   *  （:60725-60727）+SquareTileFrame（:60752→本仓 setTile 监听链）→ result=true。 */
  private rbPlacePoopBlock(x: number, y: number, game: GameHooks): boolean {
    const st = game.world.store;
    if (!st.inBounds(x, y)) return false;
    if (!this.rbEmptyTile1457(x, y, game)) return false;
    const pooId = TILE_BY_KEY['v_666_poo'];
    if (pooId === undefined) return false;
    st.setTile(x, y, pooId);
    return true;
  }

  /** ★1053 熔岩巨石爆炸地形面（Projectile.LavaBoulderExplosion P.cs:71647-71661 直译）——
   *  心 tile ±4 盒（81 格）内 Distance(心,格)<4 圆盘 ∧ Collision.CanHit(弹盒→格盒)
   *  → WorldGen.PlaceLiquid(i, j, 1, 255)。零 RNG。★SW-BJ102：心 tile 提取=
   *  `(int)Center/16` 截断除（:71650,rbCenterTileTruncX/Y）,非 ToTileCoordinates
   *  之 `>>4`（两式负带分叉,见 rbCenterTileTruncX 注）。 */
  private rbLavaBoulderExplosion(game: GameHooks): void {
    const st = game.world.store;
    const num = 4;                                     // :71649
    const vx = this.rbCenterTileTruncX();              // :71650 value=((int)Center.X/16,(int)Center.Y/16)
    const vy = this.rbCenterTileTruncY();
    for (let i = vx - num; i <= vx + num; i++) {       // :71651（(float)i<=value.X+num 整域等价）
      for (let j = vy - num; j <= vy + num; j++) {     // :71653
        if (Math.hypot(i - vx, j - vy) < num
          && canHit(st, this.x, this.y, this.w, this.h, i * 16, j * 16, 16, 16)) {
          this.rbPlaceLiquidLava(i, j, game);          // :71657 PlaceLiquid(i,j,1,255)
        }
      }
    }
  }

  /** WorldGen.PlaceLiquid(x, y, 1, 255)（WorldGen.cs:4495-4546 直译,lava 255 支域;
   *  1458 同域 :4495-4546 逐字全等 2026-09-16）——①实心门 nactive∧tileSolid∧
   *  !tileSolidTop → false;②本格无液∧同液型 → 注满（amount 钳 255−liquid → 恒 255）;
   *  ③异液合并 GetLiquidMergeTypes(this=1)——水→黑曜石 56/蜂蜜→脆蜂蜜 230/微光→659。
   *  ★原版序（:4533-4544 亲读定谳）：【先】清液（:4535-4536 tile.liquid=0;
   *  liquidType(0)）【后】PlaceTile（:4537,mute,forced=缺省假）——mergeTile 56/230/659
   *  全 solid（tileSolid[56]=Main.cs:8079/[230]=:10362/[659]=:9767）∧非 moss∧非覆写
   *  特支 → :59864 析取链化简为 Collision.EmptyTile(i,j) 臂;拒铺（实体罩格/格上
   *  active 件）→【止于液清零、块不落】=原版序。:59945 液格门不适用（进 PlaceTile
   *  时液已清零）。SquareTileFrame(:4538 无条件)/sendWater=联机面（单机 no-op;
   *  setLiquid/setTile 监听链承载光照侧）。 */
  private rbPlaceLiquidLava(x: number, y: number, game: GameHooks): void {
    const st = game.world.store;
    if (!st.inBounds(x, y)) return;                    // :4497 InWorld
    if (st.isActive(x, y)) {
      const d = TILE_DEFS[st.get(x, y)];
      if (d && d.solid && !d.platform) return;         // :4507 实心门
    }
    const i = st.idx(x, y);
    const liq = st.liquid[i];
    const ltype = st.liquidType[i];                    // repo +1 编码（1水/2岩浆/3蜜/4微光）
    if (liq === 0 || ltype === LIQUID_TYPE.LAVA) {     // :4511（liquidType==b;b=岩浆↔repo 2）
      st.setLiquid(x, y, 255, LIQUID_TYPE.LAVA);       // :4513-4518（amount 钳后恒满 255）
      return;
    }
    const mergeSheet = ltype === LIQUID_TYPE.WATER ? 56            // b=水 → :4532 case 1 → 56
      : ltype === LIQUID_TYPE.HONEY ? 230                          // b=蜜 → case 1 → 230
      : ltype === LIQUID_TYPE.SHIMMER ? 659 : 0;                   // b=微光 → case 1 → 659
    if (mergeSheet === 0) return;                      // :4533 mergeTileType==0 → false
    st.setLiquid(x, y, 0, LIQUID_TYPE.NONE);           // :4535-4536 tile.liquid=0;liquidType(0)【先】
    const mergeId = mergeSheet === 56 ? TILE_BY_KEY['obsidian']
      : mergeSheet === 230 ? TILE_BY_KEY['v_230_crispy_honey_block']
      : TILE_BY_KEY['v_659_aetherium_block'];
    if (mergeId === undefined) return;                 // 数据面缺键护栏（:59839 TileID.Count 门域）
    if (!this.rbEmptyTile1457(x, y, game)) return;     // :4537 PlaceTile → :59864 EmptyTile 臂【后】;拒=止于液清零
    st.setTile(x, y, mergeId);                         // PlaceTile default 写位（:60725-60727+SquareTileFrame :60752→监听链）
  }

  /** ★SW-BJ93 债4②（2026-09-16）→ ★BJ93 债①/BJ102（2026-09-16）退役注：旧
   *  rbSelfHurtPlayers（SelfHurtPlayers :15104-15152 弹侧直译面）随 1002 Kill 支
   *  全面归一（rbKill1002Face=Game.explodeAt 单发,玩家段含同一 :15104-15152 面
   *  +trap sweater cap+死因归因+PVP 脸）整面退役——SelfHurt 与 Damage 同在
   *  Kill flag3 臂（:71790→:71792）,拆两处=旧「Kill 拍 Damage() 重复 PVE 面」
   *  建模余波本体。DV ±15%/sweater cap/immune 门的独立钉测迁 Game.explodeAt
   *  域（explosion-ac1-kbdir-sweater 已钉 EXPLODE_TRAP_PROJS={108,1002}）。 */

  /** D2 Kill 彩虹爆（P.cs:72354-72427 直译;1458 :72355 同域逐字）：沿 oldPos 环
   *  （Zero 哨兵截断）dust267 彩虹尘（数 = Next(1,4) 减尾三档、色相 = (基相+1−i/10)
   *  %1、scale/fadeIn/位 Lerp 逐式）+ CloneDust 白影（scale/2、fadeIn×0.85、白）+
   *  RainbowRodHit 编排 ×2（clientOnly:true,move=UnitX.RotatedBy(num61τ)×16）+
   *  dust66 ×14（α100 scale1.7 noGravity 速×3）+ SoundID.RainbowBoulder。 */
  private rbKillRainbowExplosion(game: GameHooks): void {
    game.playSfxWav?.('rainbow_boulder', 1, this.cx, this.cy);   // :72356 SoundID.RainbowBoulder
    let targetX = this.cx;                             // target3 = Center
    let targetY = this.cy;
    const num55 = Math.random();                       // :72357
    const half = this.w / 2;                           // vector12 = Size/2（15.5）
    for (let num56 = 0; num56 < this.trailN; num56++) {  // oldPos 环（Zero 哨兵=trailN 截断,同义）
      const vx0 = this.trailX[num56];
      const vy0 = this.trailY[num56];
      const lerpT = 1 - num56 / 10;                    // GetLerpValue(10,0,i,clamped)
      const newColor = hexToRgbArr(orchestraHslCss((num55 + lerpT) % 1, 1, 0.65));   // :72363
      let num57 = 1 + Math.floor(Math.random() * 3);   // Next(1,4)=1..3 :72364
      const num58 = 0.3 + (1 - 0.3) * lerpT;           // Lerp(0.3,1,lerpT) :72366
      if (num56 >= 10 * 0.3) num57--;                  // :72367
      if (num56 >= 10 * 0.65) num57 -= 2;              // :72370
      if (num56 >= 10 * 0.85) num57 -= 3;              // :72373
      // vector11 = vector10.DirectionTo(target3).SafeNormalize(Zero)
      const ddx = targetX - vx0;
      const ddy = targetY - vy0;
      const dl = Math.hypot(ddx, ddy);
      const dirX = dl > 0 ? ddx / dl : 0;
      const dirY = dl > 0 ? ddy / dl : 0;
      targetX = vx0;
      targetY = vy0;
      for (let num59 = 0; num59 < num57; num59++) {    // :72378-72417
        const d = game.spawnDust?.(vx0, vy0, this.w, this.h, 267, 0, 0, 0, newColor);
        if (!d) continue;                              // 池满（原版 6000 槽位变异面,仓内约定跳过）
        const k = Math.random() * 0.8;                 // :72381 velocity *= NextFloat×0.8
        d.vx *= k; d.vy *= k;
        d.noGravity = true;                            // :72382
        d.scale = 0.9 + Math.random() * 1.2;           // :72383 覆写（含 NewDust 抖动）
        d.fadeIn = Math.random() * 1.2 * num58;        // :72384
        d.vx += dirX * 6;                              // :72385 += vector11×6
        d.vy += dirY * 6;
        d.scale *= num58;                              // :72387
        d.x = (vx0 + half) + (d.x - (vx0 + half)) * lerpT;   // :72388 Lerp(旧位+Size/2, 位, lerpT)
        d.y = (vy0 + half) + (d.y - (vy0 + half)) * lerpT;
        const w = game.vanillaDust?.clone(d);          // :72390-72396 CloneDust 白影
        if (w) {
          w.scale /= 2;
          w.fadeIn *= 0.85;
          w.color = { r: 255, g: 255, b: 255, a: 255 };
        }
      }
    }
    for (let num61 = 0; num61 < 0.5; num61 += 0.25) {  // :72418-72425 恰 2 迭代
      rainbowRodHitFx(game, this.cx, this.cy, Math.cos(num61 * Math.PI * 2) * 16, Math.sin(num61 * Math.PI * 2) * 16);
    }
    for (let num62 = 0; num62 < 14; num62++) {         // :72426-72432
      // 色相掷【前】于 NewDust 内部掷（:72427 实参式,F6 掷序纪律）
      const color = hexToRgbArr(orchestraHslCss(Math.random(), 1, 0.5));
      const d = game.spawnDust?.(this.x, this.y, this.w, this.h, 66, 0, 0, 100, color, 1.7);
      if (!d) continue;
      d.noGravity = true;                              // :72429
      d.vx *= 3;                                       // :72430-72431 velocity *= 3
      d.vy *= 3;
    }
  }
}
