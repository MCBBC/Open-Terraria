# 自申报近似做法·全仓清账台账(2026-08-31)

> 方法:全仓标记词 grep(近似|简化|省略|未建模|不建模|不做|跳过|登记差异|备案|偏离|GAP|TODO)
> → 逐条读代码真实行为 → 对照 Terarria1457/1458 反编译定性 → 四档分类。
> 三路代理(六巨头簇/中件簇/杂散域簇)+ 子审计(Dart/MissileProj)+ 双向误判防控
> (自证式注释与无标记真缺口都要抓)。分档:**A 行为缺口 / B 数值漂移 / C 视觉素材替代 / D 误报或已修**。

## 总量分布

| 域 | 原始标记 | A | B | C | D | 覆盖 |
|---|---|---|---|---|---|---|
| 簇1 六巨头(Enemy/Arrow/MinionProj/Player/proj1457/TownNPC) | 413 | **50(+8 无标记挖出)** | 37 | 76 | ~124 | 100% |
| 簇2a WeaponProj+四 bossAI | ~125 | **18** | 8 | 34 | 45 | 100% |
| 簇2c 八小件(Mounts/SwingArc/PetFollower/lunar_misc/WhipProj/PhoenixBow/FakeFish/DeadCellsFlint) | ~71 | **3** | 7 | ~16 | ~10 | 100% |
| Dart/MissileProj 子审计 | 27 | **3** | 5 | 14 | 3 | 100% ——✅2026-08-31 三 A(①镖族穿透数据面②537 宿主死即灭⑥飞刀光标可达区钳)+三 B(③尖刺球物理常数族/整盒分轴⑤LaserScan 转正+④75 摩擦门)+C1(拖尾相位基准) 清偿,详见文末专项节;184/187 两向反差缺口顺带闭合;✅2026-09-01 终清波追加 D1/D2/D3+M1/M2 五件（见下专项节） |
| 簇3 杂散域(entities 其余/world 运行时/render/core/ui/items/stats) | ~250 行详读 | **~18**(点名小件族 41 条 A6+B12+C16;world/render/core 计入本域) | — | — | — | 各域覆盖 |
| Wave 新件七文件(SlimeGlob/GlobProj/MonkStaffFury/FertilizerCloud/scarab 区/ThrowKillFx/beenade) | 全查 | 0 新增 | — | — | 两处死码视觉差 | 逐参对 |

**A 档行为缺口合计 ≈ 92 条,B 档 ≈ 65 条,C 档 ≈ 140+。**

---

## A 档优先级台账(按玩法影响排序)

### L 级(大工程,独立立项)

| # | 位置 | 缺口 | 原版锚 |
|---|---|---|---|
| L1 | proj1457.ts:962-1023 | 风暴家 GameMode 难度乘区全档错键——经典/专家/大师/旅程应 {1/2/3/1}+玩家 {.08/.16/.24/.08×2},我们直采 {0..3};连带缺 DamageVar(-luck)/死囚毛衣帽300/格挡旗 | P.cs:14916/:14630+GameDifficultyData.cs:77 ——✅2026-08-31 已清偿（曲线实锚 Main.Difficulty 浮点轴 Main.cs:2783-2809+GameDifficultyData.cs:71 键表：Journey .5→.04/Classic1→.08/Master3→.24/Legendary4→.4,NPC=Remap(D,Classic1,Master3,1,3);玩家链 damageVarRoll(-luck)→f32 截断×curve→×2→死囚毛衣(trap 半额帽300,:14919-14922)+CanParryAgainst(:31673 shieldParryTimeLeft/facing 门)挂 evpStormBolt 死囚毛衣就近读 armor[0..9](equipStats 未建键登记)。金标零扰动,item-stats-golden-1457/npc-stats-golden 复跑绿 |
| L2 | proj1457.ts:375-382 | 叶绿巨剑挥击尾孢子 1128:原版 ai[1]≥1 时 CanDealDamage=false 纯视觉零伤,我们结算接触伤害且寿命约3倍(ai[0]+=2 加速缺);IDStatic 应类型级共享表非每弹实例 | P.cs:12463/:33169/:2686 ——✅2026-08-31 已清偿（①ai[1]>=1 不进 dealContacts=零伤零 CritTimer 消费,仅砸地大云(ai[1]==0)结算;②ai[0]+=2 老化 ×3 实效寿命 90+rand60→≤33 拍(AI_92 :33167-33170);③IdStaticSharedTable 型级墙钟表(immunityIdentity:type :784 帧到期语义)替代逐弹 HitCd——1128 表 30t 同批,1122 的 10t 潜在"N 弹同拍 N 连击+衰减 N 倍加速"一并修入;tests/orphan-proj1457.test.ts 三条）|
| L3 | Player.ts:1708-1710 | 叶绿水晶叶套装 SetBonus 整套未移植(226剑气→227花瓣三件套弹幕增援) | Item.cs OnBonus :6986-7036 ——✅2026-08-31 已清偿（**真值勘误锚**：主体系 ArmorSetBonuses.cs:128-146 四头变体（近战头1001+endurance.05/召唤头5524+SUMMON_SET slot2/头盔1002·头饰1003 基础档×胸1004(bs51)×腿1005(ls47))→AddBuff(60,5)+setChlorophyte 每拍 Effect(Player.cs:16417)+!setChlorophyte→ClearBuff(60)(:16436-40)；buff60 效果分支=crystalLeaf 旗+buffTime 钉18000+全桶 type226 只留最先扫到一只多余 Kill(:11749-66)；**226=头顶常驻锚体**(aiStyle42 P.cs:28188-56 钉−60px/翻转支/mouseText 脉动移绘制,索敌 Manhattan<700+CanHit 取最近 CanBeChasedBy 目标,cd=40t=P.cs:25664)——非"226剑气"；**227=一拍全路径扫掠瞬发弹**(aiStyle43/extraUpdates180→Update 主循环 while(numUpdates>=0) :16781-17346 连 timeLeft--(:17308 在子步内!)整体展开 181 子步×v12≈2160px,penetrate1 flag3 免疫豁免+不设帧,hide=true 视觉全靠 ChlorophyteLeafCrystalShot 编排粒子→L5 备案项同批收编 syncModules type17+fx/orchestraFx.chlorophyteLeafCrystal* (Passive=16 全树无 producer 不接));**Player.OnHit 引援叶三门本体**(:6986-7040:①petalTimer 共享窗50t:7009 与金花 :6963 未建模登记②victim CanBeChasedBy 门 ③桶序首个>1200 break 怪癖照抄;方向怪癖=x2/y2 左上自捕获基向(−w/2,−h/2)仅 GetChaseResults 追及失败时兜底,victim.Center 代 hitPoint 偏差登记);伤值=Player.crystalLeafDamage/KK static 100/10(:821/:823) 不吃面板。落地=vanillaArmorSets 四键+ArmorSetBonus.crystalLeaf 字段；Buffs.LeafCrystal=319(vanilla60,BuffDescription 原 12 语言零自造键)；ChloroLeafCrystalProj.ts 新实体族(锚体 226+叶弹 227)+getChaseResults/SolveQuadratic 1:1(Utils.cs:651/:721)；GameHooks 三钩 updateChloroCrystalAnchor/spawnChloroLeafShot/chloroOnHitLeafStrike(Game.ts spawnTitaniumShard 邻位,对账保最旧按桶序)+Enemy.hurt fromPlayer 钛金 proc 后同位次 proc(复用 hp>5 残血门族,ON_HIT_EXCLUDED_PROJS 断链 227 已在表);proj1457.dealContacts 开放导出+尾参 hitPierce(缺省0 全调用面不变)。MP 面:锚/弹本地自持不跨端(远端代理不跑 fixedUpdate),远端可见面=type17 编排粒子广播,偏差登记于 Game 注）。回归 tests/chloro-setbonus.test.ts 22 绿（四头检测/卸套即清 buff/单锚最旧保留补生/40t 节奏+700 曼哈顿门+假人488 排除/弹伤 DamageVar 链+pierce1+Kill 尘音/OnHit 三门与 break 怪癖/追及解算数值锚）+equip-r4/blue-r6-player-fixes/buff-r2-imbue/combat-stitch 家族复绿；
**δA 红队复查批（蓝队单条群,对照 Terarria1458）——bug①②③+疑①③ ✅2026-08-31 已清偿**：①幻影暴击面——原版暴击掷只走 melee/ranged/magic 三旗（P.cs:12932-12945 ownedBySomeone 支内）而 227 SetDefaults（:3126-3137）无任何类别旗⇒永不暴击，critChance .04→0（TitaniumStormShard 弹 908「α-H1」同款先例；TryConsumingTimerCrit :12945 全弹通用独立面保留不走此旗）；②dealContacts 新增尾参 stopAfterFirstHit=首命中即截断（maxPenetrate==1 语义映射：Damage_PVE_Inner :14186-14201 penetrate 逐击递减至 0 时 keepIterating=false＋Damage_PVE for 条件 `(i<maxNPCs)&keepIterating` :12592 即止⇒重叠多怪同拍只伤桶序首个，旧实现无早退=同拍连吃两份 100），叶弹 227 调用侧启用；③type17 载荷色相链修齐——producer 三段式全文（num330 wrap→hslToRgb(H,1,.5)→Lerp(·,Red,Remap(H,.33,.7,0,1))→Lerp(·,Lerp(LimeGreen,Gold,.3),(int)R/255f) P.cs:28282-28405 同段）前移入广播载荷 fx/orchestraFx.leafTrailInfoByte=rgbToHsl(value2).X×255f 的 **(byte) 截断**字节（旧=未变换 raw H 直广播+Math.round 字节化="输入错一格"，Main.rgbToHsl/hslToRgb Main.cs:48695/:48749 逐行移植），消费端 Spawn_LeafCrystalShot（ParticleOrchestrator.cs:3139-46）与本地渲染两面同一字节面；netApplyParticleOrchestra 补 type17 分支（ChloroLeafCrystalShot）远端复放同函数=全端一致；④出生坐标语义钉死——NewProjectile 形参=position(top-left)（aiStyle42 :28253 Center.X−4f,Center.Y 两生产位同参）⇒实际中心=top-left+(w/2,h/2)=锚中心+(+3,+7)；换算收敛于 Game.spawnChloroLeafShot 单点（CHLORO_LEAF_SHOT_SIZE 14），两调用侧字面 Center.X−4f/Centery 不动（旧构造把形参当中心再左上化 ⇒ 有效 top-left=(cx−11,cy−7)，出生点偏 (−14,−14)）；⑤世界边界原值判定——P.cs:16787 `position.X<=leftWorld||position.X+width>=rightWorld||…` 且 leftWorld/topWorld=0、rightWorld/maxTilesX×16≡像素全域（Main.cs:1080-1086），自造 ±16px 内缩带退役（our-id 与 vanilla tile 域不同但世界像素边界语义相同,st.w×16 等值;NaN 支 JS 无输入源不建模）；疑② 不修备案：game.enemies() 平铺桶含蠕虫段体 vs 原版整虫一个 npc index（索敌"最近目标"在蠕虫族逐段化,引擎表示层结构差,记入文末挂账节）；回归 chloro-setbonus.test.ts 22→28 绿（新增 δA①②③③b④⑤ 六锚：critChance===0+掷面行为证、双怪截断、三段式 byte 数值锚 83/77/55/66/69/58 含 trunc/round 分野点、type17 四站采样对拍、top-left→中心换算、贴边存活/出界即杀双证）；tsc 触碰文件零错（ChloroLeafCrystalProj/proj1457/orchestraFx/Game/syncModules/test 六文件）|
| L4 | entities/LeashedCritter.ts:2715-2726 | 牵绳宠 1457 引擎增量五项:跳跃族水中浮力/flyer IsBlockedByMedium 液体遮挡/坡面探针 SolidTileAllow*/大气泡缩放/Recall 尘 noLight | Jumper/FlyerLeashedCritter.cs+WorldGen.cs:70500 ——✅2026-08-31 已清偿（①Jumper 浮力族全套移植：buoyancy=0.4 水中 vy 反浮+冷却钉 minWaitTime(:31/:143-150，只认 vanilla Water 档——本仓 liquidType+1 编码) + TryStartJump 初速重排(num4<-gravity 门先行,:104-128) + Move_NoObstruction Clamp(vy±maxFallSpeed)/|dy|召回门(:199-200) + 落点吸附 CanStandOnTile 复核(:82) + TryGetReachableTile 起点 min(AnchorY,CenterY/16)+下探 while<AnchorY+strayingY 重写(:233-271)；②Flyer IsBlockedByMedium/IsLiquidBoundary 全式(:139-197):threshold=aquatic?255:0 对称谓词=非边界∧非异液(岩浆/蜂蜜/微光)∧液量恰等 threshold,origin==dest 早退,边界三分支(partial/满液上承实心按 tileSolidTop 分流)同构,Update 探针段接入+停驻支 1457 形态(snapped∧origin下格可站才vy=0,:110-115)；③四探针拆分全量换装 solidTileAllowTopSlope/NoPlatforms/AllowBottomSlope/AllowPlatformTopFrame+platformProperTopFrame(WorldGen.cs:70686-70919):Walker AdvanceTarget :42/:43/:44/:46+HandleFalling :109、Flyer Spawn :45+Update :102/:114/:119、Jumper Move :151/:162/:169+CanStandOnTile/TryGetReachableTile；真值表映射 tileSolid=TILE_DEFS.solid∪VAN_TILE_SOLID_EXTRA(19/239/380/427/435-439 原版实心)/tileSolidTop≈platform 旗既有近似口径/Sets.Platforms 按 sheet 反查{19,427,435-439}·380 PlanterBox 走 AllowTopSlope type==380 特例且 NoPlatforms 不拒——详见实现头注登记；④DrawBubble 档缩放 num2=max(1,max(frame.Size()*scale/(rect.Size()-8)))（bubbleScaleTier+Renderer.drawLeashedBubble,附贴点校正 _dummy.Center=(0,8) 纵移与 GetDrawOffset 同源叠加——Draw :205 次序原文）；⑤Recall 尘 noLight=noLightEmittance=true 双旗(:134-141)。回归 tests/leashed-critters.test.ts 五 describe(探针真值表/浮力三态/遮挡门 truth-table+Update 长跑停摆/Recall 双旗/bubble 缩放档) 78 绿;1457↔1458 Jumper/Flyer/LeashedCritter 三文件 diff 全等,行号单锚）|
| L5 | syncModules.ts:270-277 | module8 编排粒子 17+ 型未接(RainbowRodHit/RainbowRodDraw/RepelAt/HealEffect/Disc 宗族) | ParticleOrchestrator.cs 各 Spawn_* ——✅2026-08-31 已清偿（消费+生产双面,视觉统一收编 **fx/orchestraFx.ts**（每型 Spawn_ 段 derive,rng 注入;netApplyParticleOrchestra 分支=真派发测试面）。新接九型：**RainbowRodHit(5)**（六掷双层虹彩 sparkle life60 + 12×d267 双层尘 noGrace :3462-3512——万花筒鞭 tag WhipTagEffect_Kaleidoscope.cs:9 OnTaggedHit 占位 burst 退役 + MissileProj 79 命中 P.cs:14293-14304 紫 #FFB0FF 占位退役/killNow 双掷 :72488 收编真值本体,kaleidoscope+79命中两 clientOnly:false 面走 module8 上行）;**SlapHand(20)/WaffleIron(30)/FlyMeal(21)**（纯音三连 :2860/:2865/:2914,Player.cs:44707-44745 命中侧——Game.meleeOrchestraStrike 敌怪/城镇 NPC 双循环同位挂载,3258/5382/5129 三 case 本地直生+broadcast）;**ClassyCane(55)**(:2887-2912 纸屑 gore1218 近似+7×d10 α80——3351 铜币支 :44722-44732 门内接线,双循环同锚);**DeadCells 族三型**:MushroomBoiExplosion(34)(:2426-2516 收编 DeadCellsMushroom.requestMushroomBoiExplosion 三槽音轮换+红爆——原版 clientOnly:true :35277 但随从仅 owner 权威模拟→MinionProj 爆点 broadcast 补远端,偏差登记)、DownDashExplosion(35)(:2128-2223 dust306×40 hue strong?0.01:0.55+monk 冲地音 uniqueInfo==1 强化档 ×1.5 速幅;下坠跳系统未移植 vanillaWingVisuals 登记④→当前仅远端广播可达,producer 缺口挂账)、Flint(41)(:1786-1901 裸露实心门+release 音+尘228×30——emitFlintSpikes 内联近似迁 fx 收编池,clientOnly:false :53240 走 module8 上行,MovementVector=(32,gravDir) 载荷);**ShadowbeamHostile/Friendly(58/59)**(:1987-2005 锚点→当前位置 d173 三联直线,movementVector=上一锚点、uniqueInfo=|v|×1000 步距载荷——Arrow.ts:2470/:5209 早有 59 广播而收包侧静默丢,L5 补消费面);**PaladinsHammerShockwave(68)**(:816-881 Item180+d57/d43 放射环×50 掷+7×7 实心块尘圈上抛帽32——WeaponProj.C 批内联函数收编 fx 池并补 Item180 音(C 批曾误注"调用侧已播"实缺)+module8 上行(PositionInWorld=左上,MovementVector=Size 还原命中盒),_movementVector_载荷语义见 WeaponProj 301 支)。RepelAt 排斥面同批收编：FakeFish.beRepelled(FakeFishParticle.cs:521-561 全式：四态豁免/环差 Remap(100→0,2→5) 离源 RotByRandom π/4/Rotation 跟随/Position−=V/前向探湿重掷 target×0.1/_gotRepelled 单次门/寿命压缩 lerp(1,.85)·prog1档 .7)+repelParticlesAt(ParticleOrchestrator.cs:1411-1427 全群广播面)+玩家侧 Player.UpdateParticles :28781-28792 门(v≠0,Bottom,height/2,wet 形参死参保留)接入 Game 主循环——全体本地+镜像玩家逐 tick 驱动,原版非 wire 面不进 module8。登记仍未接（无对应视觉/无 producer 锚,不硬造）：Keybrand/GasTrap/ShimmerArrow/ShimmerBlock/TownSlimeTransform/ChlorophyteLeafCrystal×2/RainbowBoulder1-4+PetBounce/CattivaHit/HeroicisSetSpawnSound/PlayerVoiceOverrideSound/InScreenDungeonSpawn/Black·Blue·RedLightning 族/ArcSurge/StardustPunch/PrincessWeapon/NightsEdge×4/MoonLordWhipHit·Eye/PaladinsHammer(3302 命中尘)/UFOLaser/MagnetSphereBolt/HeatRay/SnappingStone×6/HarpyCharm/PhoenixQuiver/SeraphNecklace/ItemTransfer/PooFly/LakeSparkle/NatureFly/FakeFish±Jump(clientOnly:true 本地直驱族,FakeFish.ts 同口径)/DeadCells 余三型(BarnacleShotFiring :27036 无锚;BarrelExplosion≈Arrow1023 killNow 内联已覆盖;MushroomBoiTargetFound 挂点父弹键缺省)、DeadCellsDownDash producer(下坠跳未移植);MissileProj 79 Kill 双掷原版 clientOnly:true 维持本地直驱。回归 tests/orchestra-types-l5.test.ts（枚举序对表/九型 type 触发→粒子特征参数(rng 注入)/wire 往返/producer 结构断言/FakeFish beRepelled 四态门）19 绿） |
| **L5+** | syncModules.ts 枚举注（终态）/ Game.netApplyParticleOrchestra 派发尾段 / fx/orchestraFx.ts 追加收编段 | **module8 编排粒子"仍未接超长尾"逐型补齐（~33 型全量,2026-08-31 L5 长尾批）**——每型 Spawn_ 段 derive（Terarria1458 ParticleOrchestrator.cs 逐行）,视觉统一入 fx/orchestraFx.ts 追加段（rng 注入）;消费派发=netApplyParticleOrchestra 真分支;生产端按各型原 netMode 面:**clientOnly:false → 本地直生+broadcast 上行**,clientOnly:true → 本地直驱不广播。接入映射（型→生产者锚）：**剑刃轨迹族** NightsEdge(10)/TrueNightsEdge(12)/Excalibur(13)/TrueExcalibur(14)/TerraBlade(15) ← Projectile.Damage case972-985 :12984-13031 ownedBySomeone 支=SwingArc/NightsEdgeFly/TrueNightsEdgeSlash 三命中站 swordTrailOrchestra 分派+TimerCrit 蓄能暴击命中面(Player.cs:28574→Player.ts tryConsumingTimerCrit,d228×20 尘环不走编排面——δB B4 ✅2026-08-31 已清偿)（PositionInWorld=目标盒内随机点近似）;MoonLordWhipHit(44) ← case1035/:13025 =WhipProj 敌侧命中支（±0.1τ 抖动载荷）;MoonLordWhipEye(45) ← SpawnMoonLordWhipProc P.cs:15005 补鞭面（子鞭即 projId1035 同支触发,消费可达）;StardustPunch(7)/PrincessWeapon(8) ← P.cs:14315/14331/51790/43546 消费+FX 在位（随从/挥拍锚随其域批接线登记）;FormatC(72) ← case562 :13003 crit 门;**雷族** BlackLightningHit(4) ← WhipTagEffect_DarkHarvest.cs:24 =WhipTag darkharvest 支（旧 Arrow916 占位退役）;BlueLightningSmallLong(65) ← WhipTagEffect_ElectricEel.cs:46=eelChainBlast 双盒随机点 + 1091 浸液导通链 proj1457 等价位（链记忆字段缺→±150 近似载荷登记）;BlackLightningSmall(6)/Blue(37)/Red(77)=lightningSmallOrchestra 共体（packedColor 载荷分色直译）消费可达·光环族 clientOnly:true 生产面登记缺锚;StormlightningWindup(62) 消费+FX 在位;ArcSurge(71)/StormLightning(61)=**proj1457 emitBoltFx 原生承担折线与声段——编排面只留 ArcSurge 端点余像+双音收编、61 占位注册,防重复生成**;PaladinsShieldHit(63) ← Player.Hurt :38649=(受击槽,持盾槽) int 对,pvp 盾链未建模,消费+FX 在位;**配饰** SnappingStone(69)/Melee(74)/Summon(75) ← TryMakingSnappingStoneStrike=SnapStrike.ts 出弹循环节带+三味音（Item72/PyroclasticStone/ArmletOfRuin;snapStrikeDust 导出共用）;Recharge 三连(79/80/81) ← Player.Update_SnappingStone 冷却归零拍改走 snappingStoneRechargeFx 同本体+broadcast（旧 r15 内联退役,两端面同源）;HarpyCharm(70)/PhoenixQuiver(76)/SeraphNecklace(78) ← ApplyHarpyCharm P.cs:58802=Arrow.applyHarpyCharm 锚（itemID 6166/6181/6180 分味,up×2 升格,Item39/Item20 音;旧"视觉省略"注退役）;SilverBulletSparkle(11)/ShimmerArrow(25) ← 弹981/1006 Kill 贴块支 :77659/:77676（Arrow Kill 族新分支,clientOnly:true 直驱）;**杂项** Keybrand(0) ← NPC.KeyBrandStrike :82005=Game 近战循环 swingVid671 支（closest-point-in-rect 锚）;GasTrap(23) 弹1007首帧 Broadcast 面（弹在场性随数据面）;ShimmerBlock(28) 四点全 clientOnly:true 直驱;TownSlimeTransform(26) kind0书呆/1铜/2长三味真值尘（NPC.cs:19186/:19210/:80339）;CattivaHit(67) ← type1093/1112 受击拍(MinionProj.contact 命中拍接线)+:52194 挖掘面(ai[0]=3 帮工意图未折算维持登记)——δB B11 ✅2026-08-31 已清偿;RainbowBoulder1-4(47-50)+PetBounce(60) 全味收编（tile/fairy ambience 无通道登记,RB4 跃迁/RB1 寻宝面可达）;BestReforge(18) ← Main.ReforgeItemInReforgeSlot top-tier 支 :42645(Game.doReforge 接线=三连掷 bestReforgeFx+两掷 RainbowRodHit 直驱——旧档只响声系声称失实,δB B13 ✅2026-08-31 已清偿);UFOLaser(39)/MagnetSphereBolt(56)/HeatRay(57) ← P.cs:71850 区 AI_001 行进尘束三型（160 二选色/160 四层/162 四层,BroadcastOrRequest——弹433/255/260 trail per-tick 锚随弹幕域登记）;ItemTransfer(24) ← Chest.VisualizeChestTransfer :315=QuickStackToNearbyChests 包装位（movedVids plumbing 入 QuickStacking,flags=RandomizeStart）;PooFly(31)/HeroicisSetSpawnSound(64)/NatureFly(53)/LakeSparkle(52) 收编+消费在位（producer 缺口维持登记）;InScreenDungeonSpawn(66)=VanillaSpawner.spawnNPC 尾门(NPC.SpawnNPC :5265-5273 包装位,spawnOrchestra 出站钩双半边)——旧注散域 producer 缺口对 66 系声称失实,δB B12 ✅2026-08-31 已清偿;PlayerVoiceOverrideSound(46) 音效型照 PlaySound 锚直译='hurt'（变声字未建模登记）。**遗留判定（确不可达/维持登记）**：①PaladinsHammer(9)=★vanilla 自身孤儿——1458 全仓 grep 仅 Spawn_ 分派臂无任何调用点,占位注册;②FakeFishJump(54)+FakeFish(51) 保持 FakeFish.ts 局部池（跃态密度门同池语义,迁池得不偿失——评估结论）;③NatureFly/PooFly tile-ambient 面（仓内无该通道,LakeSparkle 已迁统一池）;④DeadCells 余型（BarnacleShotFiring :27036 挂点父弹缺省/BeheadedEffect :24503 种子联动缺锚/BarrelExplosion 维持 Arrow1023 内联口径）;⑤HeroicisSet 湿沙转化链/PaladinsShield pvp 盾链/Keybrand :35153 滑行拖星支/TownSlimeTransform 命名链 caller/StardustPunch 随从侧与 PrincessWeapon 挥拍侧 anchor 随各域批接续。回归=tests/orchestra-types-l6.test.ts（39 断言：枚举值域全表对齐/wire 往返/逐型计数·寿命·尘型触发断言/音名断言/生产者结构断言）;orchestra l5+l6=58 绿、orphan 全家 142 绿、whip 族对齐套件绿（a-batch2 控制点断言红为并行会话在途面与本批无关）;tsc 触及文件零错 |
| L6 | docs/spawn-parity-gaps.md 活体清单 | VanillaSpawner parity bundle(雨怪/节日史莱姆/skyblock lowTiles/remix 支)未核销项 | NPC spawning 族 |

### M 级(可测行为差)

**proj1457/风暴家**:①落雷液体导通击杀链整缺(P.cs:16206 PlotLine<500)——✅2026-08-31 已清偿(Kill 帧 localAI[0] 组值 1/2/3 + SpawnLightningLiquidElectrificationParticles 40 放射只走液体白光;命中面 stormBoltCollides=距离<500+PlotLine 全程 liquid!=0,敌/玩家双消费面,EVP 口径同源;Bresenham=Utils.PlotLine int 重载 1:1 含 num3 初值 dx/2+补差序)②1091 世界雷爆炸域 CenteredRectangle(Center,64) 错挂到 1117(:14853)——✅2026-08-31 已清偿(勘误:域为 aiStyle203 三型共有 localAI0==1 门,Colliding :15954-15965 分流——1091 补挂 CenteredRectangle(64);1117 另有本体盒 Inflate60 先置支保留;"错挂"实为漏挂+弱化近似)③sporeSpawn 中奖列偏移最多5列(:42566)——✅2026-08-31 已清偿(勘误翻案:返回 X 本就钉基准列 vector2.X=:42587 原文,真缺口在**度量**用候选列中心((num2+i)*16+8,:42583 num6)而非基准列——旧法跨列候选全同距退化最左扫描;已按候选列度量,返回仍钉基准列)⑤1129 大爆盒隔墙伤+timeLeft——✅2026-08-31 已清偿(ownerHitCheck=true(:3358)接 dealContacts 距离段 ownerHitCheckDistance 缺省 1000f+timeLeft=5 即亡(:3353),ai[0]>20 判死为永不可达死代码迁钉 batch-c 用例)⑥1117 打屏演出错装——✅2026-08-31 已清偿(Spawn_StormLightning flag 分流 ParticleOrchestrator.cs:1044-1052:PunchCameraModifier+NewLightning(instant) 只属 !flag=1091 世界雷,1117 从无打屏;强度=Lerp(2,10,outsideWeatherEffectIntensity) 天气通道实值接线退掉"恒 6"近似,frames45 origin=bolt 落点;bolt StripWidth 1117=12/1091=16(:1048) 一并修入)⑦731 射程减半(extraUpdates=1 未折叠)——✅2026-08-31 已清偿(Update 双跑→双子步各带 tileCollide,AI 单拍折算登记,440 先例)⑨--459 CutTiles 三采样——✅2026-08-31 已清偿(cutThickTileLine=Utils.PlotTileLine 带状全覆盖转正:1126 旋转厚带 60×scale/1127 突刺线长 88×厚 10,端+中三窗退役)④741 光刃持同类召回门⑧1104 湿旗盒缘缩窄⑩重力尾族已部分转正（④非 proj1457.ts 域待 WeaponProj 批;⑧1104 未在本文件）
**武器面**:①Arrow.ts:5107 弹药 1/3 落地回收=自加机制伪称原版(三版箭族 Kill 均无回收;影响全部 dropKey 循环)②Daybreak 953 爆炸 AoE 整缺(P.cs:73404/:35090)——✅2026-08-31 已清偿(DaybreakExplosionProj 实装:SetDefaults :8990 8×8/tileCollide=false/localNPCImmunity80,AI_117 :35095 首拍扩盒 trunc(52×scale) Damage() 单窗+Buff189 StatusNPC :11369 补刷+Item14+0.9/0.8/0.6 光+四环真值尘;Kill 掷 ai[1]=0.85+r×1.15;tests/weapon-proj-ledger-clean)③Spear 三类伴生弹 343/228/1107-1109 缺(P.cs:46746-46795,未申报)——✅2026-08-31 已清偿(342→343 v×2.4/kb×0.85/CanHit 门+222→228 满额+367→1..3×1107-rand3 dmg÷2/timeLeft Next(30,150);缩回相 flag=itemAnimation<max/3 整除语义+localAI 闩先于 CanHit 判定;1458 实锚 :46749-46802)④蜂箭 469 恒 181 丢 Hive Pack 半数巨蜂(P.cs:12505-12531;strongBees 通道现成)——✅2026-08-31 已清偿（Kill 放蜂链逐只掷 beeType():strongBees 半数 566 巨蜂、伤=beeDamage(damage/3) 强蜂 +Next(1,4)/弱蜂+Next(2)、kb=beeKB(0)=强蜂0.5——三链 makeStrongBee 同拍配对（1458 Player.cs:12505-12532,1456 :12506-12533）;复用 beenadeBurst 的 equipStats.strongBees 通道;其余参(pierce2/ranged/出生点−oldVel×8×i/Next(-35,36)×0.01+oldVel/6)未动。回归 tests/arrow-ledger-aug31）⑤光刃召回门(:39717)——✅2026-08-31 已清偿(Boomerang.recallGate 电平=IsAPhaseblade[HeldItem.shoot]&&controlUseItem→ai0=1;Game 发射侧仅对 PHASEBLADE_PROJ 接线,手持同 itemId 绑定,换持另一柄也触发之偏差登记于调用点注)⑥4044 圣骑锤尘圈(纯视觉 M)——✅2026-08-31 已清偿(源码勘误:P.cs:19646-19655 该段为两支互斥——383 附魔飞刀 ai[1]≥10 → HitTilesInACircle(300 块尘圈/圆距 150)+Item14;301 圣骑锤 → Spawn_PaladinsHammerShockwave(ParticleOrchestrator.cs:816-880,d57 α200/d43 α254 放射环×50 掷+命中点 7×7 格上抛块尘,gore 段无 API 不接),且两者均落 localAI[0]=300/200 冲击盒由 Damage_GetHitbox :15050-15076 一帧消费——冲击盒非纯视觉,本批一并实装)⑦烟雾弹 1168→196 专支 dmgT 已随根治线自动归零 ✓(已清偿)

**WeaponProj B/C 批同日清偿（2026-08-31，回归锚 tests/weapon-proj-ledger-clean.test.ts）**：
- B⑤ 彩虹棒反弹钳档：X 锚按翻转后新速度符号定 ±1（旧实现用翻转前符号=推回墙内）、Y 新增 lastVy∈(0,1)→−1 缓降特例（P.cs:19798-19821）。
- B⑥ 连枷湿探盒改造：FlailProj.inLiquid 由"中心格+liquid>64"升级 Collision.WetCollision 真形（:1575-1652）——探针盒=盒心 min(10,W)×min(H/2,H)、扫描窗 pos/16−1..+2、液体表面带 y=j·16+(256−liq)/16 与深带矩形相交即湿（任意液体含岩浆）；lavaWet 分家 LavaCollision 全盒档（:1657）。坡面支（斜块上方液体）store 无斜度旗不建模登记。948 转态/尾尘 !wet 门/case6 微光重力豁免三个消费点自动继承。
- C1 回旋镖头段尘近似退役 → AI_003 头段逐型真值表（1458 :39619-39686）：19 两粒 d6/1000 三分档含 d267 专色/867 d165/33 d40/320 d5 双态/6 三选水花/113 d76+d15；旧表误收的 182/383 头段本就无尘删除。
- C3 773 甲虫炸弹贴附三段式真值尘（P.cs:47869-47956）：正面 d59(1/3,内嵌 1/3 反态 scale÷2)/背面 d59 朝 GetScarabBombDigDirectionSnap8 八向/d88 1/15+七点椭圆环 fadeIn1.6;姿态 AngleLerp(0.2)+AngleTowards(0.05)双档补齐(Utils.cs:2174)。
- C4 火箭烟尾"1/3 水"接入 Dust.dustWater() 水样分档（Dust.cs:405-418 waterStyle{2..12}→98..288/缺省 33;经 renderer.waterStyle 读面）。
- C5 弗莱龙刺 Kill 尘：d212 真值 20 粒——NewDust 20×20 盒后归位半径 10×scale 圆+径向速度+hslToRgb(hue .4±.2,.9,.5) lerp 白 30%+Item54 音（1458 P.cs:74184-74208;合成橙粒兜底仅测试 mock 面）。
**Boss 面**:①月总两态+猪鲨四态 iframes 白嫖窗(:1447/:41593)——✅2026-08-31 已清偿（核心 -2/-1 NPC.cs:41601/:41625、猪鲨 flag7 :49519/:49815/:50040/:50202→:50278 每 tick 双向、鲨龙起扑窗 AI_071 :35300/:35381 均落 dontTakeDamage 真旗标,pierce===1 白嫖直伤闭合;②371 泡泡 1456→1458 行为变更裁定(p.cs:78848 hit 当拍死 vs 我们 1456 态;需人工定夺跟版)——✅2026-08-31 已裁定并清偿（按仓规取 1458 真值:StrikeNPC 零伤支已删→命中照常扣血+legacy 死音库 style3(:85185)+致命 d212 尘环(:85190-85211);血尽走 checkDead :78850-78855 转 ai[0]=1/ai[1]=4+PrepareForDeathAnimation 由 dukeBubbleAI 首行接管;★与 CLAUDE.md「1458 未触数值面」冲突已单列报告）;③Empress 光枪 60t 预告+旋转扫束(AI_180 :45853 九 23 同批,含未申报 923)——✅2026-08-31 已清偿④467 制导 AngleLerp 0.008/t(CanHit≤2000)——✅2026-08-31 已清偿⑤686 轨迹扫掠命中(oldPos 全轨迹 :16156)——✅2026-08-31 已清偿（DD2BetsyFireball 专用实体:TrailCacheLength[686]=20 尾迹全盒∪当前盒、AI_001 两段式全值/vy 帽32/ai 钳20、撞块终结;Arrow 单盒单测退役）⑥BossNoCheese 免疫槽接线两处(:1161/:1290↔14853)——✅2026-08-31 已清偿（projTargets.DAMAGE_EVP_NO_CHEESE_PROJS 分槽表{452/454/455/462,871-874,919,923,924}+damageEvPNoCheese 复用 Player.damage __swNextHitBucket 门/写两面;hitPlayer 与 MLDeathray 直伤双点接入,"死光可穿透 General 帧"旧备案闭合）⑦dd2 四型弹重力模型错档(:2218:662/671/676/685 标枪前 60t 直飞相缺失等)——✅2026-08-31 已清偿（662/685 :58454-58460 >60 才弧化 vy+.3∧vx*.98 同拍;671/676 :58653-58666 ≥15 才+.1/t;显式 grav 覆盖退役走 projGravSpec;timeLeft=3600/penetrate=-1 回归数据列,pierce999 近似退役;682 timeLeft=30 核清）⑧golem collideGround 三列盲带/坡形整块(Collision.cs:2299)——✅2026-08-31 已清偿⑨dd2:1381 solidBody 五点采样漏爆(半砖偏移)——✅2026-08-31 已清偿（Collision.SolidCollision 全盒 any 等价件,同款修法互见 bossAI_duke_moonlord.inSolid;另 dd2 小妖精引信循环音 startTrackedLoop 跟踪轨落地 AI_107 :63957-64005/AI_108 :66388-66406,60t 补播近似退役=本批加项,详见专项节）⑩lategame expert 远古末日召唤梯度(CountNPCS<10 门)——✅2026-08-31 已清偿

**bossAI_lategame+golem 双件清偿（2026-08-31，回归锚 tests/bossai-ledger-aug31.test.ts + tests/golem-collision-aug31.test.ts）**：
- A③ 女皇光枪 919/扫束 923 实体化：`FairyQueenLance`（AI_179 P.cs 两版同段 1458 :45852-45872/1457 :45853-45873——localAI[0]<60 零速预告渐显→40 速沿 ai[0] 锁定角发射、旋转锁定、≥360 Kill；命中=Colliding :15711 线形盒〔300×300 粗筛+center±40 宽 8，segHitsRect 承载〕；CanDamage 表臂 la0≤60 免伤 :12463）与 `SunDanceBeam`（AI_180 :45791-45851——锚本体 Center、timeLeft=180 非 240〔SetDefaults :8766〕、scale 三段梯度 lerpValue(0,20)·lerpValue(180,120)、rotation=ai[0]+π/9·lerpValue(50,180)、三段锥形束 {510,660,800}×{70,42,7}·scale）；case4/:1268/case11 三处"12 速直飞"收敛退役，头注"ai1 延时参"说法订正为 localAI[0]<60 门（ai[1] 仅 GetColor 色相源）。未申报 case7 第 4/5 线同理收口。
- A④ 467 真制导入 Arrow 直飞桶专支（AI_001 type==467 支 1458 :55133-55253/1457 :55132-55252）：ai[1] 态机扫描锁定 CanHit(1×1 点对) 最近玩家〔上限 2000px；★扫描节拍=每 19 个 AI 更新一回（[1,20) 计数环），旧"每 tick 重试"转述失真〕→ 保速转向 AngleLerp(target,0.008)/update（Utils.cs:2154 移植）→ <20px 自爆 Kill（爆炸口 onProjectileDeath 467 分支原样承接）；alpha −40/update 渐显（PROJ_ALPHA0 补 467:255）+ AddLight(1.1,.9,.4)+尾尘环×12+帧 3 拍推进。首拍音 Item34/OnFire 表不受影响。life 仍传 300（vanilla 无 timeLeft 覆写=3600——挂账：无离屏剔除前不放宽）。
- B⑩ expert 数值链逐值校正（NPC.cs :65130-65174 两版本同段）：冰 num 120→90（g−30）、火 18×3→12×4（g 覆写 10×5）、雷 80→40（g−20）、光拍距 20→30、打断清场预算 10→3（:65270-65273）；弹伤 Remap=GetAttackDamage_ForProjectiles：冰(35,25)/火(30,20)/雷(45,30)，克隆体 468 字面 18 不参与；选拍 doomRoll 表驱动断言 4 行（hp 梯度 ×maxValue 6/4/3）。
- C 可映射两项：光音位置化——Item_159 移入 SunDanceBeam 弹位首帧播（调用点逐辐重复播退役）；克隆体入场 Zombie_89 补一声（spawnCultistClone 于出生点播，:65298-65307 对 440 同样生效）。
- golem 三列盲带：私有三列采样 collideGround 退役 → `physics/TileCollision.moveAndCollide` 1:1（Collision.cs:2299 TileCollision+SlopeCollision 全语义）。本体主链/死亡演出/自由头嵌块撤出/拳冲拳撞停四态机全部迁移；拳撞停改读"速度被碰撞改写"差分（=Collision_MoveWhileDry :93734-93747 oldVelocity≠velocity 语义，:19449 `num2>700f||collideX||collideY` 原文，替换"先嵌墙再整盒重叠"的 hitSolid 近似）。回归含窄柱场景（唯一支撑列在盲带内→站稳；对照全空坑正常坠落）、slope2 单列座位贴合断言与蓄力→跳→落地整周期时序（landings≥1 且落地当拍底边钉回支承面）。
- 刻意豁免维持登记（未动）：女皇侧弹伤的 ForProjectiles Remap 未在本批展开（光枪/虹迹的 (50,30)/(60,35)/(70,65)/(65,30)/(50,35)/(60,40) 二元档仍按经典值，见 NPC.cs :46455-46505，后续批接手）；史莱姆皇后误报区（AI_121 无暴怒分支）与 EncourageDespawn 接线保持原样。proj-rotation.test.ts 两例红（121 绘制预载/312 fake store 缺 idx）为先行既有红灯，与本批无关（id 集不经过 467 支与新增表项）。
**镇民/宠物**:①TownNPC 开门掷门第二操作数错配+开成不加 80t 走程(:54578) ✅2026-08-31 已清偿(TownNPC 七件批:第二操作数=该回家旗 homeFlag(NPC.cs:53532-53547 快照,雨/夜/日食/史莱姆雨/风暴地表)替代 hitWall 必开兜底、成功走程 ai[1]+=80f(:54610/:54619/:54627)、全败 direction*=−1 重试(:54629)、旧 hitWall 无掷直开兜底通道退役并入前瞻扫门唯一化;C# `(A|B)` 非短路骰序保持;回归 tests/townnpc-ledger-aug31.test.ts 掷门四象限)②stinky 强逃停打双路缺(:55768) ✅2026-08-31 已核清(实体面 C3② 批已落:NPC 带臭支 :54033+玩家支 :54081-96 同置 flag16/17、flag17 停打=attackUpdate 触发门 `!dangerStinky`、flag16 强逃=逃离覆写伞;本批 tests/townnpc-ledger-aug31.test.ts 双路行为钉死防回滚;任务书 V@ 行号 :2638 为陈位)③MinionProj 接触统一 20t 私有 CD vs 原版 −2 全局免工件窗(:466 default) ✅2026-08-31 已清偿(contact() 三态化:CONTACT_PLAYER_WINDOW 全局窗/local/idStatic 同型桶,CONTACT_CD_TABLE 逐型 SetDefaults 真值;蜘蛛15/蛙10(旧误30)/407·266·双子 idStatic 迁表,统一20t 私表退役)④鞭 tag 单槽最新选靶 vs 多 tag 争距(:14320)⑤Mounts 滚轴鞋 RollerSkateMovement 两改(accRunSpeed−1f 减速带+空中收敛门 :28736-28778)⑥圣坦炮击 930 penetrate−1+650 归航(:48143)⑦石碑仪式 526 归巢镖降级纯粒子(:33746 实体本体 AI 存在,中性化只做粒子)⑧WhipProj 臂位偏移缺失(:37071)⑨太阳石白天门(Player.cs:15529)⑩Enemy stinky 逃离/变暗/苍蝇尘三消费支(:54033 族) ✅2026-08-31 已清偿⑪Enemy 587 眼球飞鱼参数档错表(0.13/0.09/±6.5/±3.5+白天反转) ✅2026-08-31 已清偿⑫Enemy 411 观星者昼行极性反转(蓄力窗内才豁免) ✅2026-08-31 已核清(当前实现原状正确=台账误报,dayActive/fighterNotDiscouraged 双面一致)⑬MinionProj tigerBody 步行链(:51296-51557 两结算段) ✅2026-08-31 已清偿(ai067WalkChase 两结算段 1:1=1458 :51273-52057:速度档 1/8/8+0.7 catch-up、三柱跳梯 -5.1..-11.1、高出距离表 -6..-16、wet×2、num62 重力附加项;手写 ±0.12/clamp3.5/5% 小跳退役;海盗 393-395 同批入轨 A②;残留=ai[0]=5 态机两触发源待批)⑭MinionProj 索敌家族半径漂移(pygmy 800/700 兜底) ✅2026-08-31 已清偿(MINION_SHOOT 补 search 键表:俾格米 800=:61424 主周曼哈顿 700+100;残留=双距择近与射击门 +40×slot 未折算已登记——✅**2026-09-01 终清波五小件批已清偿/核清**,见文末专项节)
**MP 与联动**:①SlimeGlob/GlobProj flag25 支其它玩家 ApplyBuffTo 跳过(:29485;单人空转)②LucyAxe msg141 台词同步③~~沙滩球踢次广播 recLog 替代 Chat(:18715)~~ ✅2026-09-03 已清偿(game.chatBroadcast 单口=GameHooks 面:本地 newText(ChatMonitor)+联机 net.sendCommandLine(channel2 系统行→server slot=255 无名前缀中继其他端,server/src/room.ts channel2 支);文本=NetworkText.FromKey("Game.BallBounceResult",FromKey(弹名155),ai[1])+ChatColors.ServerMessage(255,240,20)(Projectile.cs:18719+ChatColors.cs:13);SimHost 服务器半边=simRoom.notice 同色;tests/ball-bounce-broadcast.test.ts)④FakeFish BeRepelled 排斥面(:521)——✅2026-08-31 已清偿(FakeFish.beRepelled :521-561 全式+repelParticlesAt :1411 广播面+Player.UpdateParticles :28781 门接主循环,详见 L5)⑤PetFollower 光宠控制键支(±40/±120)⑥module8 见 L5

### C 档抽样代表(完整 140+ 详见各簇报告归档)
烦见:各文件头"素材 stub 共 50 张 1×1 占位"家族(SlimeGlob/GlobProj/SpectreSoul 平涂圆点/dust 色值手动近似/spawnParticles 代编排粒/multiply→lighter 辉光口径)。判定面无损,渲染观感层。
**SpectreSoul 平涂圆点——✅2026-08-31 已清偿**(点名家;详见文末"绘制保真·平涂扫描批"专项节)。

---
## ✅2026-08-31 绘制保真·平涂扫描专项清偿(Spectre 点名件 + 同族 fillStyle+arc 扫描)

范围:`game/src/entities/{SpectreSoulProj,HealProj,GolfBall,bossAI_duke_moonlord}.ts`。
原版真值 `../Terarria1458`;回归=`tests/spectre-draw-fidelity.test.ts`(15 断言全绿);
spectre/golf/duke/heal/proj-draw 族 194 例全绿;tsc 零错(2026-09-01 自查)。

**① 弹 356 SpectreSoulProj 定性(点名件)**:盘上 `vanilla/Projectile_356.png`=1×1
占位 stub(素材缺家族,357/358 同),无贴图可转正;且原版本体本就【不可见】——
SetDefaults alpha=255(P.cs:4471)+GetAlpha 无 type356 特判(P.cs:80596 起)⇒ 缺省尾
(:81509-81521)Color(0,0,0,0) 全透明。可见观感全部来自 AI_059 尘 175 拖尾:
旧 draw() 的 `#9DF5E8` fillStyle 平涂圆点退役 → draw() 文档化空实现 +
fixedUpdate 子步内挂 `spawnTrailDust`(P.cs :29417-29430/1458 :29385-29398 逐粒:
d175×5/子步、NewDust(pos,6,6,175,0,0,100,default,1.3f)、noGravity=true、
velocity*=0、position −= v×0.2×i 反向排布,i=0 贴弹;EU=3 ⇒ 每拍 20 粒;
Kill 支提前 return 不出尘=原版 AI() 提前 return 跳过尘循环同态)。资产缺已在本台账登记。

**② 同族平涂扫描全表(fillStyle+arc 组合;贴图主支+注释豁免者排除)**:

| 文件:行 | 判定 | 处置 |
|---|---|---|
| HealProj.ts(draw 段) | **转正**:本体 α255+GetAlpha 无特判不可见,P.cs:28960-29004 有真值尘组合,盘上 Projectile_298/305.png 均 1×1 stub | d183×3 s1.1(305,v×0.334×i)/d175×5 s1.3(298,v×0.2×i) 逐粒精确化,draw() 空实现 |
| GolfBall.ts(draw) | **转正**:Projectile_721/739..752.png 均在盘(8×8 实图);原版 DrawProjDirect 高尔夫支(Main.cs:31464-31507+31578 无条件本体)本就是贴图染色链 | GetGolfTrailColor(P.cs:11154)染色 + num188=min(1,\|v\|/16) 速因子 + oldPos[4] 插值尾迹 26 发(f 步 .04,α=q×f,scale Lerp(.7,1.5,f))+本体染色复刻 ×1.5;posHist 5 槽环承载 oldPos 域 |
| bossAI_duke_moonlord.ts DukeSharknadoBolt 385 | **转正**:Projectile_385.png 在盘(68×204×3 帧);平涂 #8FD8FF 圆点无必要 | Main.cs:34878-34897 专支直译:帧窗 H/3、origin=中心、rotDraw+=vx×0.1、visAlpha −5/t 钳 100(AI_065 :30023-30067)、frame=(age/3)%3;懒加载未就绪保留标注兜底色点。登记不接:oldPos[4] 插值运动尾迹段(:34884-34893 需 TrailCacheLength 域)/追踪支 d172 尘环×6/substep(:30018-30033,AI 域债) |
| Bobber/Boss dd2/deerclops/lategame/CoinPortal/MagicProj/SparkleGuitar/StardustMark/WhipTag/XenoBubble 各 fallback 支 | 保留:均有真实贴图主支(drawImage/ensureVImage),arc 仅懒加载未就绪标注兜底,合任务豁免条款 | 不动 |
| proj1457.ts :634/:844 | 保留:同上,贴图主支兜底 | 不动 |
| proj1457.ts :2374 双环描边 | 保留:本体 α255 不可见型(与 356 同族定性),原版观感=d267 环形尘阵+编排粒,双环为包络近似已有注释登记,非平涂圆点 | 不动 |

**③ 测试**:`tests/spectre-draw-fidelity.test.ts` 15 断言——资产 IHDR 直读定性
(356/357/358/298/305=1×1 stub;385=68×204;739 档=8×8)/356 尾尘逐粒(type·α·scale·
盒·noGravity·velocity 归零·每拍 20 粒·批基点=AI 时点 pre-move·句柄偏移闭式/
Kill 支短路少尘)/HealProj 20+33 粒两型闭式核对/385 绘制态机+drawImage 帧切片+
globalAlpha=(255−α)/255/GolfBall 三态绘制数(静球 1 发/满窗动球 28 发/未满窗 2 发)
+α 序列 f 线性端值/台账勾销锚(SpectreSoulProj 与 HealProj 源面 arc/fillStyle 归零)。
登记维持:950 双环包络近似、项目尾迹域债见上表。

---

## D 档值得留意的两次反例(审计方法论实证)
- "自称近似实则公式级精确":proj1457 MultiPointHitbox/Ellipse 波前/bolt 折线几何、FakeFish 剪影调制、BallProjs 反弹系数逐字一致。
- "无标记的真缺口":proj1457 液体导通链/1128 伤害越权、Enemy 587 参数错表/411 极性反、Arrow idStaticGroup 缺失——✅2026-08-31 已清偿（SetDefaults UseGroupStaticImmunity(181)：type==181 :2686-2688 / type==566 :6181-6186 两版同段，usesIDStaticNPCImmunity+idStaticNPCHitCooldown=10(方法体 :10678-10683)；ctor 对 181/566 注组键 181+167ms 冷却走 idStaticCheck 表级共享门（proj1457 IdStaticSharedTable 先例），蜂群齐扑同敌单结算、到期再咬语义保留；毒云 511-513 组键同机制已在案。回归 tests/arrow-ledger-aug31）、WeaponProj 三伴生弹——注释干净≠没有债。

## 备案遗留的双版本行号漂移提醒
Arrow 族 GetAlpha 1457:75940→1458:80596;NPC AI_007 全段 +185;beenade 尘爆 :78093→:78094;lmprovedLuck 消费端 UpdateBrokenMirrorLuck 1456→1458 :29396。动数据前先 grep 符号定位勿信旧注。

## 挂账但不动的刻意豁免(与本次台账并行有效)
**叶绿域 δA 复查批备案（2026-08-31,疑② 不修）**:叶弹 227 索敌宇宙粒度——本仓 `game.enemies()` 平铺桶含蠕虫段体（每段独立 id/盒,proj1457.dealContacts 命中面与锚体索敌同桶）vs 原版整虫一个 npc index（Main.npc 槽位)——曼哈顿"最近目标"在蠕虫族逐段化、一拍全路径扫掠可对多段各掷一次免疫窗;引擎表示层结构差（怪物身份/桶模型）,非 chloro 实体批可收口,待引擎表示层批处理。

形参位 approve 文档另有记录的:B2 波 scarab CutTiles/AngleTowards 半幅/vol luck/pickup 特性、**vault questItem+币种兑换+多通道——✅2026-08-31 已清偿**(拒收门在库=核验补测试;币种兑换按反编译原式接线 Inventory.doCoinsAt→depositIntoVoidVault;LootAll 真箱通道接通+bank 面板不开,详见文末专项节)、explodeAt 炸药链复核题、**Football MP grace——✅2026-08-31 已核清并钉死**(原文即 owner-only 宽限,Projectile.cs:23677-23691 回收条件 `(player2.whoAmI != player.whoAmI || !(localAI[0] < 30f))`;30t 窗只豁免 owner 本人,其他玩家/代理一触即回收——实现本就正确,回归钉死防"统一改全玩家宽限窗"的过修)、D324 killBurst 聚合链(红蓝二轮已核等价)、Football 反射时序 ±1 tick。还有未列出的僵尸骷髅 stylist 等 rare edge 未触及面由后续 parity 批次接手。

**镇民/宠物**:①TownNPC 开门掷门第二操作数错配+开成不加 80t 走程(:54578) ✅2026-08-31 已清偿(TownNPC 七件批:第二操作数=该回家旗 homeFlag(NPC.cs:53532-53547 快照,雨/夜/日食/史莱姆雨/风暴地表)替代 hitWall 必开兜底、成功走程 ai[1]+=80f(:54610/:54619/:54627)、全败 direction*=−1 重试(:54629)、旧 hitWall 无掷直开兜底通道退役并入前瞻扫门唯一化;C# `(A|B)` 非短路骰序保持;回归 tests/townnpc-ledger-aug31.test.ts 掷门四象限)②stinky 强逃停打双路缺(:55768) ✅2026-08-31 已核清(实体面 C3② 批已落:NPC 带臭支 :54033+玩家支 :54081-96 同置 flag16/17、flag17 停打=attackUpdate 触发门 `!dangerStinky`、flag16 强逃=逃离覆写伞;本批 tests/townnpc-ledger-aug31.test.ts 双路行为钉死防回滚;任务书 V@ 行号 :2638 为陈位)③MinionProj 接触统一 20t 私有 CD vs 原版 −2 全局免工件窗(:466 default) ✅2026-08-31 已清偿(contact() 三态化:CONTACT_PLAYER_WINDOW 全局窗/local/idStatic 同型桶,CONTACT_CD_TABLE 逐型 SetDefaults 真值;蜘蛛15/蛙10(旧误30)/407·266·双子 idStatic 迁表,统一20t 私表退役)④鞭 tag 单槽最新选靶 vs 多 tag 争距(:14320)⑤Mounts 滚轴鞋 RollerSkateMovement 两改(accRunSpeed−1f 减速带+空中收敛门 :28736-28778) ✅2026-08-31 已清偿(四小件批:mountRollerSkateStep 实装并挂 Player.Run——减速带 num2=accRun−1f:28743/空中门 flag2=vy==0|||vx|≤originalRunSpeed(3f):28752/runSlowdown 尾钳 clamp(|vx|−max(maxRun,accRun),0,slow):28774/沥青 powerrun ×2.25·×1.6 特支 :28767;通用阻尼链在骑鞋态退役;MovementStatsAreAdditive(Mount.cs:2580,57-60)叠加支同步接通 maxRun/accRun/runAcc :26836-26853 与跳跃参数 :19744-19755——曾全赋值=B 档漂移)⑥圣坦炮击 930 penetrate−1+650 归航(:48143) ✅2026-08-31 已清偿(四小件批:SantankShellProj 真弹化替代 MountShot 命中即散近似——SetDefaults :8819 14×14/aiStyle16/penetrate−1,AI_016 ai0>30 后 CanBeChasedBy∪CanHit 曼哈顿 650(:48143-48168)、SafeNormalize×12 lerp1/12 归航(:48174-48180),无限穿敌+per-target 免工件窗,触墙 velocity×0/alpha255/timeLeft3 引信相(:19889-19894),Kill 爆散=PrepareBombToBlow 128×128 kb8 重盒 Damage(:47680+:71786)+SelfHurtPlayers+Item_14/d31×30/d6×40(79828-79856,gore 无 API 登记))⑦石碑仪式 526 归巢镖降级纯粒子(:33746 实体本体 AI 存在,中性化只做粒子) ✅2026-08-31 已清偿(四小件批:TabletShardProj 真弹——出生面 NPC.cs:37219-37248 六直飞/二十上抛(-20 配向)/每10t余烬全部走 NewProjectile 等价口,AI_098 Projectile.cs:33746-33766 vel.Length>距 Kill+normalize×15 Lerp .1+d228 双粒尾迹(timeLeft120/tileCollidefalse/alpha255 本体不画);damage0 非敌非友=纯视觉实体原貌)⑧WhipProj 臂位偏移缺失(:37071) ✅2026-08-31 已清偿(四小件批:armPos=Player.GetArmPosition 1:1——OffsetsPlayerOnhand Main.cs:506-528×2、direction≠1→40−x、gravDir≠1→56−y、MC−(w,42)/2+[onhand×2−((40−w)/2,(56−42)/2)]、mount52 PlayerOffsetHitbox 支(Po=−Po+hb 负号已折)、RotatedRelativePoint 复用 owner 同名法;bodyFrame 行经 Renderer 共表 meleeThirdOf 随挥动进程换行,ApplyItemPositionOffsetFromMount 大表未接登记;weapon-whip-sfx 五例锚点随行改由发拍同帧取参照)⑨太阳石白天门(Player.cs:15529) ✅2026-08-31 已清偿(Player 域批:899&&!nightPhase ⇔ dayTime&&(非日食),夜/日食翻转帧经 equipStats 内容键 'N'/'d' 失效;旧 accfx json '899'.skyStone 无条件直通位退役=恒开根因,1865/3110 无门族保留)⑩Enemy stinky 逃离/变暗/苍蝇尘三消费支(:54033 族) ✅2026-08-31 已清偿⑪Enemy 587 眼球飞鱼参数档错表(0.13/0.09/±6.5/±3.5+白天反转) ✅2026-08-31 已清偿⑫Enemy 411 观星者昼行极性反转(蓄力窗内才豁免) ✅2026-08-31 已核清(当前实现原状正确=台账误报,dayActive/fighterNotDiscouraged 双面一致)⑬MinionProj tigerBody 步行链(:51296-51557 两结算段) ✅2026-08-31 已清偿(ai067WalkChase 两结算段 1:1=1458 :51273-52057:速度档 1/8/8+0.7 catch-up、三柱跳梯 -5.1..-11.1、高出距离表 -6..-16、wet×2、num62 重力附加项;手写 ±0.12/clamp3.5/5% 小跳退役;海盗 393-395 同批入轨 A②;残留=ai[0]=5 态机两触发源待批)⑭MinionProj 索敌家族半径漂移(pygmy 800/700 兜底) ✅2026-08-31 已清偿(MINION_SHOOT 补 search 键表:俾格米 800=:61424 主周曼哈顿 700+100;残留=双距择近与射击门 +40×slot 未折算已登记——✅**2026-09-01 终清波五小件批已清偿/核清**,见文末专项节)

范围:`game/src/entities/MinionProj.ts`,原版真值 `../Terarria1458`(每处先自读反编译 derive,双版本行号锚),回归=α1 agent Enemy 用例(`tests/minionproj-ledger-aug31.test.ts` 22 断言)。

**A 档 2 条(L 级×1)**:① tigerBody 步行链两结算段 1:1(共轨实现 `ai067WalkChase`:段①速度分层/0.7 catch-up/±5 死区,段②三柱跳梯+高出距离表+wet×2+num62 重力附加项;新增 ai67FrontWallScan/ai67JumpLadder/groundAnchorScan 三探针);② 海盗随从 393-395(AI_067 flag 支)由"统一飞行"近似移入正轨 pirateStep——走行不咬(friendly=false)/扑击窗接触伤 cd18/800 索敌窗/高空俯扑 sqrt 蓄力反跳。
**B 档 7 条**:③ 接触冷却家族化(contact() 三态;-2 缺省族吃玩家全局免工件窗,P.cs:466+:12636+:14182;蜘蛛15/蛙10/407·266·双子 idStatic 迁表);④ MINION_SHOOT 补 search 键(俾格米 800 等,AI_066 2000 已在途);⑤ getChaseResults/SolveQuadratic 移植,mushBoi 蓄跃改真拦截(InterceptionTime<120 门);⑥ wet=WetCollision 盒级 1:1(wetCollisionProbe,帕鲁/蘑菇/蛙/虎四族);⑦ 蘑菇爆点 IsInRangeOfMeOrMyOwner 双距真值(CanHitWithOwnBody/CanHitWithMeleeWeapon 盒门,canHitWith*BodyBox 两导出);⑧ terraprisma tTarget 换 CanHitWithOwnBody 四试视线(:12428);⑨ worldSurface≡groundLevel 语义钉死(.wld 头序 WorldFile.cs:2077 读序,Game wiring 恒等映射,注释双点)。
**C 档 3 条**:920 抚摸心形气泡=palJoyCd∈(1,60) 窗内心跳节拍粉心粒子形态近似(EmoteBubble 图标缺资产,登记在案,资产入库应换图标直绘);3472 电弧声密度=ai[0] 循环 30t/僧侣T2 25t 场内有敌一声(:69955-69979,旧每直伤 tick 一声密度 ×30);4179 焰流塔底盆 d270 白烟带+炮口 d6 火舌双矩形环境尘(T3 三层各 1/5 帧)+AddLight 双点 ×{1|1.2|1.5}(:69178-69320,"未建模"登记消账)。
**遗漏判定(维持登记,非本批收口)**:虎/海盗 ai[0]=5 态机两触发源(目标脚下 15 格无地扫描/boss>600)与海盗俯扑 position.Y 整分叉 quirk;海盗落地尘 gore 两象限与攻击帧 draw 兜底差;Minion_FindTargetInRange 双距族/俾格米射击门 +40×slot/PlayTrackedSound 续播缓冲/存量四链跳梯探测形——✅**2026-09-01 终清波五小件批全部收偿或核清销账**(单柱形经 derive 判定仅 AI_026 原文成立并补支承闸;详见文末专项节)。
测试:`tests/minionproj-ledger-aug31.test.ts` 22 全绿;tsc MinionProj 域零错(2026-08-31 自查)。

## ✅2026-08-31 bossAI 双件域专项清偿（duke_moonlord + dd2 批）

范围:`game/src/entities/bossAI_duke_moonlord.ts` + `game/src/entities/bossAI_dd2.ts`
(原子连带:`projTargets.ts` Damage_EVP 分桶接线、`Enemy.ts` 371 零伤早退档退役)。原版真值
`../Terarria1458` 主,逐条先自读反编译 derive 再动码,双版本行号锚。

**★行为裁定单列——371 爆裂泡泡(台账②)**:CLAUDE.md「1458 未触数值面(SetDefaults 零变更)」
与反编译冲突——1456 的 StrikeNPC `type==371` 零伤转引信支(cs:82102-82107)在 1457 已删,
1458 保持删除面(NPC.cs 无该特例);新增语义为:①命中照常扣血(lifeMax=1 ⇒ 任一实弹皆致命),
每次命中播 legacy 死音库 style3 破裂音(:85185 PlaySound(4,…,3)),致命拍撒 60×d212 蓝环尘
(:85190-85211);②血尽走 checkDead(:78850-78855)→ ai[0]=1/ai[1]=4 + PrepareForDeathAnimation
(dontTakeDamage=true/life=lifeMax),由 AI 首行接管扩盒 100×100 引信 4t 消散;③aiStyle70 的
`justHit || ai[0]==1` 扩盒支(:35270-35278)仍在=非致命擦伤同样即刻进引信态。按仓规取最新版
行为实现(非数值变更而是逻辑支增删,冒进判定维持报告口径:1458 行为权威)。

**A/B 档 8 条清偿**:
① 月总核心 -2 归位/-1 出生(NPC.cs:41601/:41625)+猪鲨四态 -1/4/9/12(:49398 flag7 初值 true、:50278 `dontTakeDamage=!flag7` 每 tick 双向)+鲨鱼龙起扑窗(AI_071 :35300 蓄力真旗/:35381 起扑生效拍解除)全部落真旗标——pierce===1 单发弹白嫖直伤窗闭合;iframes=2 近似退役(boss/dd2 族面);
② 371 泡泡裁定如上(Enemy.hurt 零伤早退移除+AI 首行转换+dust/音效对齐);
⑤ 686 空袭火球专用实体 DD2BetsyFireball——Colliding oldPos 全轨迹扫掠(P.cs:16156-16172,TrailCacheLength[686]=20 ProjectileID.cs:387):当前盒∪尾迹 20 盒任一相交皆可伤,替换 Arrow 单盒单测;运动补 ai[0] 钳 20/vy 上限 32/two-stage(+0.1@10,+0.2@20)全值;
⑥ BossNoCheese 免疫槽接线两处(Damage_EVP 弹型分槽 P.cs:14853-14858↔projTargets.DAMAGE_EVP_NO_CHEESE_PROJS 表+damageEvPNoCheese 通道=Player.damage __swNextHitBucket 门/写两面复用):MLDeathray 直伤 + hitPlayer 内 452/454/462 幻影族(+871-874/919/923/924 自动入轨)不吃 General 无敌帧、独立 40t 槽节流,旧「单槽引擎差异备案」闭合;
⑦ dd2 四型弹重力日程逐型回归:662/685 标枪 ai[0]>60 才弧化(vy+=0.3+t vx*=0.98 同拍,P.cs:58454-58460/1456 :54589-54594)、671 德拉肯/676 涎 ai[0]>=15 才 +0.1/t(:58653-58666/1456 :54686-54699)——显式 grav .3 覆盖 spec 导致的前 60t 直飞相缺失+三倍重力修正;timeLeft=3600/penetrate=-1 回归数据列(pierce 999 近似退役);682 电弧 timeLeft=30(数据列,:7281)与无重力门核清;
⑧ dd2 solidBody 五点采样漏爆→Collision.SolidCollision 全盒 any 等价件(半砖骑线/边缘外扩格不再穿透,bossAI_duke_moonlord.inSolid 同款修法);
⑨ 小妖精族引信循环音:startTrackedLoop 跟踪轨落地(AI_107 地面型点火/冲锋双轨 NPC.cs:63957-64005,AI_108 俯冲滑翔怪 ai[1]>=20 单轨 :66388-66406)——60t 补播近似退役、俯冲侧缺失段补齐;状态退出/起爆/destroy 三路停轨。
**C 可映射 2 条**:1116 处月噬弹姿态稳态旋转公式(P.cs:32353 `(源心−玩家心+(0,216)).ToRotation()+π/2`,替自身速度角近似);939 处泡泡随机尺寸 `scale=ai[3]`(:35226 每拍恒等式,vanillaScale 应用)。
**登记遗留**(不构成本批收口目标):686 联机傀儡经 kind1 重建 Arrow 直飞档(sweep 仅权威端);682 scale 1.2 视觉档;d212 尘环粒子近似色;AI_107 卡位传送后受击音距衰减跟随面未建。
测试:`tests/boss-dd-ledger-clean.test.ts`(泡泡当拍死/扣血真实化、BossNoCheese 槽隔离互不穿透、四弹重力日程表断言、oldPos 扫掠命中、solidBody 全盒、引信轨句柄面);存量 a-batch4 A4-5 按 1458 裁定改判;tsc 两文件零错;boss/dd2 族 vitest 全绿。

---

## ✅2026-08-31 Player.ts 域专项清偿(专责代理批)

范围:`game/src/entities/Player.ts` 单文件,原版真值 `../Terarria1458`(先 derive 再动码,双版本行号锚)。回归=`tests/player-ledger-aug31.test.ts`(16 断言,全绿)。

**A 档 1 条(BossNoCheese 桶语义位)**:月总族接触(Update_NPCCollision :31576-31579)与 Damage_EVP 弹族(:14847-14872;与 boss 域批的 projTargets→__swNextHitBucket 通道【同源复用】,本批补 NPC 接触侧直传 cc=1 面)——门=:38493 hurtCooldowns[1]<=0 独立计时(General immune 帧内照常受理,双域互不遮挡),写面 :38674-38683 只空位写回同桶;表仍走 getGlobalHurtBuckets 单例(player 不建第二份),无表裸测面退 General 旧路;solarGateOk 收纳 counter==1 ⇒ 月总攻击照常进 ConsumeSolarFlare(:57415)吃盾。
**B 档 6 条**:
① 太阳石白天门(1457/1458 :15531/:15529 `type==899&&Main.dayTime`):nightPhase 非 ⇒ 日授/夜收,夜/日食翻转帧 equipStats 键失效;旧 accfx json '899'.skyStone 无条件直通消费位退役(恒开根因=表源),1865/3110 无门族保留;
② 老猩红甲两再生(ArmorSetBonuses.cs:433 items 792|793|794):eRT +1/t(:19233)+num5×1.5(:19362)+每回 1HP 十粒 dust5 收束红粒(:19412;±40 位置抖动并入速度近似,登记);crimsonRegen 落 equipStats(vanillaArmorSets 表暂未收录该键,内联检测等价键 57|37|35,扩表批迁移);
③ JumpMovement 滑行支与组合门(:20805-20845):外门 sliding 位=wallCling 仓内承载(1 tick 滞后登记)、autoJump 滑行抑制档落地;蹬墙跳单路权归一(旧内嵌 inputJump 直写+vx 反踢项退役=WallslideMovement 不处理跳键,起跳一律经外门 releaseJump 边沿);flag2&&flag3 组合门此前已以 flipperJump 形在场(钉死声明);
④ 拾取半径族(GetItemGrabRange :35405-35455+Item.cs:43-49 真值):磁石 94→150 全类项、heartGrabBonus 60→250(lifeMagnet=buff105)、manaMagnetBonus 80→300;金戒指 blanket +12 三元退役(原版币族 IsACoin{71-74} 专属 +350 且与磁石叠加)——新增 getItemGrabRangeBonus(vid) 正解位含币族 350/星族 300/法斗之星 4143 独立门/Eternia 3822+50/NebulaPickup{3453-3455}+100 五个漏项;✅消费面已接(2026-09-01 终零波一行改造):ItemDrop 复合式改按逐 vid 读(getItemGrabRangeBonus 直调 / 帧扫描路径 dropScanCtx.grabRangeBonusFor 四旗快照等价展开),币族/星杖星/Eternia/Nebula 四项全部生效——旧「仍读三 getter」挂账销核;
⑤ aggro 潜行链优先序翻转(psycho :25929 首支 > shroomite :26016 > vortex :26045 尾支,else-if 单链非多源取大):变态刀+星璇同持从误吃 -1200 档修为 -750 档;配饰轴 ±400 += 累加同构保留;
⑥ FindPulley !controlJump(:26320):jumpOnlyHeld=inputJump&&!inputUp ≙ controlJump(合并输入等价谓词,Space 不再吸附进绳态)——Space+↑ 组合语义钉死可抓(登记差异)。
**⑩小漂其余**:shimmer 外门转正(inShimmer=inShimmer 探针盒级 wetCollision 复用=Collision.WetCollision 全身盒/Collision.shimmer 同形,浅浸漏授/混池错授两向闭合;顶格内采样授予门保持);盾反触发域转正(Damage 内 shouldGuard=右键电平 inputUseTile∧手持 3823/4760∧hasRaisableShield≪shieldItem∧!mount.Active,旧"按 Down"域退役;theGeneralCheck 输入层闸=差异登记);抚摸站位谓词补 pulley/(mount.Active&&!petting.mount) 两停门(:33030);滚轴鞋 wingAir 门=等价钉死声明(横向 !mnt 保持,CanUseWings=true 的纵飞横移差归坐骑域批处置——并行会话已在同文件落 MovementStatsAreAdditive 分档,本批未触碰其编辑区)。
**shadowDodge 第四闪避支分级【无来源暂不可达】**:消耗位已入轨(Hurt 第五序 hasVanillaBuff(59)→dodgeFullFill(longInvince?120:80)+DelBuff(59)+shadowDodgeTimer=1800 重整,:38516/:38306-38326);来源唯一链=神圣套 onHitDodge(ArmorSetBonuses.cs:227-236→OnHitHandler :6937 AddBuff(59,1800)),vanillaArmorSets 无 Hallowed 键/onHitDodge 无写入端 → 自然触发不可达,timer 递减位(:25656 同段)随批就位待接线。Parent 提示 ItemID 5004 经查=Badger'sHat(DualEquipArmor 族),与本支无关。
**C 视觉**:猩红脉搏尘位置 ±40 抖动以速度矢量承载(dust.position.X/Y+=n10/n11 半边未建,登记);(法斗之星自吸面沿用 pickup==='star' 分支差=消费面挂账同步)。
测试:`tests/player-ledger-aug31.test.ts` 16 断言全绿(太阳石昼/夜对照×2、crimson 套件门+eRT 差分、墙滑 autoJump 抑制/平地按键沿帽、cc=1 双域独立+节流+solar 吃盾、getter 真值+逐物品叠加表、psycho+vortex 双向、pulley 三态);player 族(run-parity/diff-1457-player-batch1/sitting/voice/status/blue-r6/redblue-r5/hostile-proj-player-hit 等)全绿;tsc Player.ts 域零错(2026-08-31 自查;Mounts.ts 并行会话在途期以其自身文件状态为准)。

---
## ✅2026-08-31 四小件群专项清偿(Mounts / WhipProj / SwingArc / bossAI_lunar_misc)

范围:`game/src/entities/{Mounts,WhipProj,SwingArc,bossAI_lunar_misc}.ts` 四文件单所有权
(原子连带:`Player.ts` 最小挂点、`Renderer.ts` mountLights ctx 两字段、`tests/weapon-whip-sfx.test.ts`
锚点随行)。原版真值 `../Terarria1458`,先 derive 再动码,双版本行号锚。
回归=`tests/ledger-small-four-files-aug31.test.ts`(24 断言全绿);mounts/boss/lunar/whip 族
19 文件 429 测试全绿;tsc 四文件+Renderer 零错(2026-08-31 自查)。

**A 档 3 条**:①滚轴鞋 RollerSkateMovement 实装(Player.cs:28736-28778——表驱动四件套+Run 挂点,
上列台账⑤);②圣坦炮击 930 真弹化(SantankShellProj,台账⑥);③石碑仪式 526 真弹化(TabletShardProj,
台账⑦)。

**B 档 5 条**:
④ MovementStatsAreAdditive 累加支(Mount.cs SetAsRollerSkate :2580 唯一 additive 族;
Player.cs:26836-26853 maxRun/accRun `+=`、runAcceleration 同句叠加(:26840)、跳跃参数
UpdateJumpHeight :19744-19755 `+=` JumpHeight/JumpSpeed——四坐骑滑行手感与跳跃高度从
「整覆盖」修为「叠加」,Player.ts 三处原子改);
⑤ 鞭臂位偏移锚 GetArmPosition 1:1(见上⑧详注)+1104 wet 盒级 WetCollision 出生快照
(NewProjectile :10887-10891 盒级判定一次定终身,AI_165 不重评;wetCollisionProbe 复用,
旧弹心格每帧液检退役);
⑥ 刃线命中原式化(Projectile.Colliding type933/1100 支 :15626-15660):CheckAABBvLineCollision
六参全式(Collision.cs:275-371——线段 AABB 粗测+四角入带+上下轨段交穷举)替代 Liang-Barsky
胶囊近似+_lanceHitboxBounds 300×300 过靶闸前置(:498/:15641/:15654),端部矩形直角几何对齐;
⑦ 月总水蛭插值起点接真源弹(NPC.cs aiStyle82 :37090-37093 Lerp(proj.Center,头额)):bInit 时
按 srcId 配对认领 MoonLeechProj 并 WeakMap 落存,逐 tick 取源弹当帧实位(多弹同拍认领顺序 ±1
登记;无候选回退出生点原语义);
⑧ 宝箱怪态3 反射管线补全(aiStyle87 :37851 逐拍复位+态3 ReflectProjectiles(Hitbox) 全弹扫描
:37979→ReflectProjectile 反向归属管线接通(projTargets.reflectProjectile 同构):音 Item150/
尘31×3/reflected·hostile 翻转/速度=随机×原速+朝主×20 归一×原速/damage÷2÷2/penetrate=1;
reflectsProjectiles「闩锁不清」旧注系 1456 行段误读已废弃,Damage() flag6 侧(:12781-12791)
照常生效);
⑨ 飞蛾魔同 tick 重摇选招(NPC.cs aiStyle88 :38328-348 while 循环 1:1——pick0 无视线落空重掷/
case0 无赋值语义钉死,曾误串卵量支一次实测钉出修正;"单帧一次近似"会把无效轮空成整轮 180t)。

**C 可映射 5 条**:独角兽/山羊冲刺尘真值式(Mount.cs case10/47 :3896-3932——起锚身侧+
UnitY 相位环 14 粒×0.2frameExtra 半径 + velocity=单位向量+(RunSpeed−sign·fe·2) 轴向项 +
山羊 noLightEmittance;独角兽追加 dashing 每 tick 盒内追尾尘 :3924-3932 dashDustBody 新通道;
dye shader GetSecondaryShader(cMount) 引擎无宿主登记不接);猪鲨崽增益光 CurrentLiquidColor
透明档(Colors.cs:97-120 liquidAlpha 全 0 → Transparent → 光贡献归零,ctx.liquidColor null 化);
扫帚挂件露天 ×1 档(GetWitchBroomTrinketRotation :3591-3604 InAPlaceWithWind num3=1f,室内 0.5f);
仙灵武库 61 AddLight(Mount.cs case61 :3670-3673=hslToRgb 通名支 Main.hslToRgb 直译 ×0.55;
dev 名 easter-egg 分色表无消费面登记);BlackHarvest 849 尾迹点光(GameHooks.addLightAt 接通
AddLight(tip,(0.2,0,0.4)) :48721,R18 光照域备案就此闭合)。

**遗漏判定(维持登记,非本批收口)**:滚轴鞋 glideCap 手持可放置物 useTime 缩放面(ItemDef 无
通用 createTile/useTime 字段,恒基准档 1.6);fullRotation 轨道归零段(:28775 矿车轨外)由
Minecart 实体接管等价声明;ApplyItemPositionOffsetFromMount 52/54 手持位大表未接(骑乘鞭锚
±14px 级微差);930 爆散 gore 段与燃瓶烧地链(Kill_DirtAndFluidProjectiles)无 API 不接;526
磁尘 customData 吸附视觉微差与仪式余烬目标取空跳过原版零向量 quirk;水蛭多弹同拍配对顺序 ±1;
Dye/GetSecondaryShader 家族(引擎级);lunar-final-audit AI_096 orb |vx| 断言为 RNG 流敏感型
脆弱规格(孤立必绿,同 worker 与 whip-sfx 共跑会被随机数流位移扰动——建议后续加 seed 注入,
非本批引入)。
测试:`tests/ledger-small-four-files-aug31.test.ts`(①additive 集+两改数值面 ③920 归航/穿透/
引信/128×128 重盒 ⑤Onhand 表+锚闭式+镜像对称 ⑥探针水面带 ⑦矩形端部几何+300×300 闸
⑧抵靶消散+d228 双粒 ⑨认领/跟随 ⑩扫描/复位 ⑪恒无效重摇护栏/pick2 直落+C 三处灯),
family 19 文件 429 全绿;tsc 四文件域零错。

---
## ✅2026-08-31 Arrow.ts 域专项清偿(专责代理批)

范围:`game/src/entities/Arrow.ts` 单文件,原版真值 `../Terarria1458`(先 derive 再动码,
双版本行号锚;近期 Beenade/hive-adjacent/gore 缩放修复全数保留未回退)。回归=
`tests/arrow-ledger-aug31.test.ts` 12 断言全绿;arrow 族(gravity-parity/tree-pass/
weapon-arrow-fix/weapon-arrow-fx)+proj-immune-bridge+orphan-b1 共 89 测试全绿;
tsc Arrow 域零错(2026-08-31 自查;同刻仓库 TownNPC/gen/server 侧余错为并行会话在途面)。

**A/B 档 5 条**:
① **巨蜂档 Hive Pack**(台账武器面④):spawnBeeSwarm 逐只掷 beeType——strongBees 半数
566、beeDamage(damage/3)=强蜂+Next(1,4)/弱蜂+Next(2)、beeKB(0)=强蜂 0.5 三链同拍配对
(1458 P.cs:78058-78081 放蜂链+Player.cs:12505-12532;1456 :12506-12533);"恒 181"登记退役;
② **毒云互斥推挤**(aiStyle92 flag45 支,P.cs:33225-33257 两版同段):相交 511-513 云逐对
push=SafeNormalize(他心−我心)×0.005,我方 Lerp(v,v−push,.6)、对方 Lerp(v,v+push,.6)
【双向直写】,重合零向量按 whoAmI 序断向(:33237-33243);whoAmI=ctor 全场自增序(cloudWho);
原版每云独立循环→同拍两向各一推=净效应 ×2 照原文;"P2 未接"登记退役;
③ **微光气球浸液两支**(Shimmer() aiStyle==2 分支 :22676-22697):浸液每拍 velocity.Y−=0.7
浮升恒算、解锁支不成立走 timeLeft−=20 加速衰变(if/else 同构,解锁支当拍不减),shimmerUnlock
内部域重查保留;①备案半边清偿、"AI_001 弹浮升物理未建模"注订正;
④ **天顶双锥同拍双发**(Player.cs:48092-48119 两版同段):num36<2 同拍两掷 Y−600/Y−700、
各锥 X 散布 rand(201)(−dir)+(Center 混式 ±rand(-200,200))独立、抖动 rand(±40)×0.02 双轴
各掷一码且均加号(B 档漂移:旧实现共用一码且 Y 取负)、ai[1]=rand.Next(5) per 锥(birthLock 下
次锥 ctor 未掷已显式补);首发 shell 出生即补生次锥(blz337LatchAt 时间锁 350ms 内消费同挥
multishot 补发 shell 静默退役,535 先例),静态奇偶轮替 blz337Alt/"两拍相隔 useTime"登记退役。
残留风险登记:latch 补发窗对「补发 shell 缺失」病态不可达面会误食下一挥首拍一次并自愈,
几何分布不变;
⑤ **thornBounceOff 阈值 B 门**(type277 HandleMovement 支,:19838-19845/1457 :19829-19836
两版一致):Y 反弹门 vy>1 → lastVelocity.Y>3f(velocity!=lastVelocity 后取后值语义,本仓碰撞
前速度未改写=v 同值等价;旧 ":23389-23399 vy>1" 注系与 type185 的 >1f 门混串)——1<vy≤3 轻
着陆落定滚动(vy 归零+摩擦×0.97+|vx|≤0.01 自灭,本仓承载件原文无显式支);
⑥ **idStaticGroup 组共享免疫**(台账 D 档反例行内勾销,见上):181/566 UseGroupStaticImmunity(181)
接线,ctor 组键+167ms 冷却,idStaticCheck 表级共享门自动入轨(hitSet/localImmune 路径不变);

**C 可映射 1 条**:448 火箭 Kill 爆炸壳 gore(GorePiece.newGore 通道接入,type==448 Kill 段
1458 :75029-75033:gore Next(61,64)×1、出生位盒随机−One×10、NewGore 内扰动→×0.3→X/Y+=Next(-10,11)
×0.05 时序复刻,beenadeBurst 同构);xeno 滤镜族等其余 C 档保持登记不动。

测试:`tests/arrow-ledger-aug31.test.ts`(巨蜂档随机域与配对/idStatic 表级跨实例共享与到期/
毒云分离场+零向量断向+孤立云纯衰减/浸液浮升差分 −0.7·cap5·净−21/天顶同拍两锥 Y±100 槽+
退役锥不复计+latch 复位/thorn 阈值三态)。挂账维持:376/604 硬编码支不走字段通道既有口径。

---
## ✅2026-08-31 Dart.ts+MissileProj.ts 域专项清偿(专责代理批)

范围:`game/src/entities/Dart.ts` + `game/src/entities/MissileProj.ts` 双文件单所有权,
原版真值 `../Terarria1458`(每条先 derive 再动码,行号以 1458 反编译实测重锚)。
回归=`tests/dart-ledger-aug31.test.ts` 16 断言 + `tests/spiky-ball.test.ts` 重写 7 断言;
dart/thrown/trap/missile 族 19 文件 302 测试全绿;tsc 两文件域零错(2026-08-31 自查;
tests/orchestra-types-l5.test.ts 语法红为并行 L5 批在途面、pyroclast-proj-strike 红=同批
trySnapStrike→num14 迁移半途,均与本批无关)。

**A 档 3 条**(台账子审计①②⑥):
① **陷阱镖族穿透缺失**(Dart.ts TrapShot 敌怪/小动物/城镇 NPC 三桶命中段):改 SetDefaults
penetrate **数据面**驱动(trapPen():98 :1825/184 :2709/185 :2719/186 :2730/654 :7026/
980 :9332 均 −1、162 炮弹=4、166 雪球与 187 烈焰球未赋值=缺省 1)——pen≠1 弹每次成功
命中写目标 10t 免工件窗(Damage 尾梯 :14178-14185 immune[owner]=10;头门 :12635-12638
窗口未到期整体早退,StatusNPC/击退/伤害全跳)、−1 永存续、≥2 计数递减归零 Kill;曾按
kind 白名单近似("boulder/spiky/flame/cannonball/bunny 其余首杀")——镖族四型+喷泉命中
首怪即灭,**187 烈焰球反向恒穿**(derive 出的反向缺口一并闭合),162 补上 4 发计数。
② **537 束宿主死即灭**(原"S 注释级误判"改判 A):aiStyle84 位锁 if/else 链全部落空时进尾支
`if (type != 632 || !TryGetActive(633)) { Kill(); return; }`(:31993-31999),type==537→下拍
Kill,无残留束线伤害(:32044-32052 ≥90t Kill 同链保留);旧注"宿主死解除锁定原地照完剩余寿命"
系把 455 专属前置支误读成全族语义,已废弃重写。
③(A6) 见 MissileProj 条。

**B 档 3 条**:
④(**尖刺球 185 物理常数族**,台账③):AI_014 具名缺省尾(:25441-25453)+块尾终端(:25624)
——rotation+=vx×0.1 每拍(误 0.14)、vy==0 且 vx≠0 才摩擦 ×0.97(误恒 0.95×另叠 0.98)+
|vx|≤0.01 截停归零(★勘误:185 缺省尾静止【置 0 不 Kill】,静止 Kill 属 261/277 具名支——
台账原文"静止停转 Kill"按源码订正)、重力 0.2 带 ai[0]>5 门(首 5 更新无重力,误恒 0.3)、
终端 16(误 15.9);碰撞探针升级**整盒分轴**(shotCenterSolid 中心格单点退役,M:擦角穿墙/
嵌顶两向漏检),反射响应维持 type185 支真值(X 被挡 −lastVx×0.9 / Y 且 lastVy>1);
⑤(**75 HappyBomb 贴地摩擦门**):AI_016_Bombs 尾原式(:48379-48413)——门=上拍碰撞后的
velocity.Y==0(加重力前快照,原版同拍先判后加)且 vx≠0 + |vx|≤0.01 截停,"脚下实心"探针
退役,补静止截停(曾慢速爬行永不休止);ai[0]>5 全段门同步接入(首 5 拍无摩擦无重力);
⑥(**537 束测距 LaserScan 转正**):Collision.LaserScan(:4599-4614)+HitLine(:782-1147)
整格 Bresenham 逐字移植(dartHitLine/laserScanTiles——起点格到 col 格距×16 折算、命中含
方向侧邻格、Y 上界 maxTilesY−40、col==终点才走 maxDistance 面,AI_084 实参 num702=2/
num703×scale 宽/maxDistance 2400/localAI[1]=Lerp(.5)),8px 步进测距的半步量化差退役。

**MissileProj A6+C1**:飞刀 491 光标钳 `limitPointToPlayerReachableArea`(导出)落地
(Player.cs:45830-45858 = CenteredRectangle(Center,MaxWorldViewSize 1920×1200 Main.cs:754-758)
∩ WorldUtils.ClampToWorldBorders(:26-33=GetWorldPlayArea 内缩 640) 后沿盒心射线等比回拉,
裁后矩形实宽语义),消费位 AI_009_Old :44247-44249——<100px 刹车环在大屏/越界光标下恢复可达;
C1 彩虹拖尾 hue 相位基准换 GlobalTimeWrappedHourly(Main.cs:17014 游戏秒 %3600,仓库既有
performance.now() 口径),逐弹本地钟的恒定相位偏移退役。

**遗漏判定(维持登记/新登记,非本批收口)**:
· AI_009_MagicMissiles 新导弹族(16/34/79) 同样在 :44045-44046 钳光标——本批只接 491
(台账 A6 口径);新族接线涉及 missile-proj.test.ts 十余处小世界 fixture 相对几何重锚,
如实机典型屏(≤1920 视口)MouseWorld 本就在盒内、差值仅超大屏越界面,留后续批一行改造;
· 186 矛陷阱 timeLeft=300/tileCollide=false、654 喷泉 30×30/tileCollide=false、187 烈焰球
6×6 scale0.8 timeLeft×5 等 SetDefaults 尺寸/寿命档与本仓样式表仍存漂移(不在清单六项内,
动能近似未动);boulder 碾压节拍由 Enemy.hurt 内建 8t 帧改为弹级 10t 真窗(e2e 零红);
· HitLine 的 ignoreTargets/异常路径(null 面)按恒空表直译,Tile.isActuator 语义复用 store
isSolid 的致动排除。
测试:`tests/dart-ledger-aug31.test.ts`(镖三敌同拍穿透/10t 窗逐拍早退与翻零/五型穿透+
flame 单发+162 四发计数 Kill/537 活宿主位锁·死宿主下拍灭且零残留伤害·无绑定即灭/
空域束满距 2400 与遇墙整格折算/bomb 首 5 拍惰性·落定截停 vx=0/钳制盒内恒等·越界回拉·
贴边盒收缩·刹车环自锁 ai0=−10·转向 oracle 对拍/C1 共享墙钟),
`tests/spiky-ball.test.ts`(-1 数据档/重力门控+终端16/滚转 0.1/贴地摩擦+截停不灭/
反弹 0.9 双轴/整盒探针凸块场景);dart/thrown/trap/missile 族 302 测试全绿。

---
---
## ✅2026-08-31 TownNPC.ts 域七件专项清偿(台账①②行内已勾,③~⑦见下)

范围:`game/src/entities/TownNPC.ts`(单所有权;原子连带 `Enemy.ts` 186 承载位/
`projStatus.ts` SUPPORTED 键 186/`EmoteBubble.ts` 探针快照导出/`Game.ts` 两处
Stardew 挂点)。原版真值 `../Terarria1458/NPC.cs AI_007_TownEntities`(V@ 行号系
1457 基线+漂移,均先 grep 符号重定位后钉值)。回归=`tests/townnpc-ledger-aug31.test.ts`
15 断言;townnpc/npc 族既有套件全绿;tsc 本域零错。

**清偿七件**:
① **开门掷门第二操作数错配四点**(NPC.cs:54576-54608):掷门 `(Next(10)==0)|flag`
   第二操作数由本仓造面 `(非宠物&&hitWall)` 修为该回家旗(homeFlag=:53532-53547 的
   雨/夜/日食/史莱姆雨/(风暴且地表) 快照,:1647 同拍写入);成功三臂(OpenDoor 双向/
   ShiftTallGate)统一补 `ai[1]+=80f` 走程奖励(:54610/:54619/:54627);全败补
   `direction*=−1` 重试(:54629);旧「任何天气赌 10%+hitWall 必开兜底、被堵不转身」
   通道整体退役并入前瞻扫门唯一化。C# 非短路 `(A|B)` ⇒ Next(10) 每拍照耗骰序保持。
   列级三行探测(门槛半砖裕度)为登记保留的工程扩展。
② **stinky 双路**:核清=误报陈位(任务书 :2638 已漂到 lifeRegenUpdate)。实体消费面
   在 C3② 批已齐:NPC 带臭支(:54033)+玩家第二扫(:54081-96)同置 flag16/17,
   flag17 停打=攻击触发门 `!dangerStinky`,flag16 强逃=逃离覆写伞+PrettySafe 收口;
   本批新增双路行为回归钉死防回滚。
③ **社交演出两态**(:55886-55905 酒馆老板 550 / :55908-55915 海盗 229):
   `social.kind` 并入 11/18;550 站定 1/600+玩家 150px+CanHitLine(Top→Top)→
   ai[0]=18/ai[1]=300/面向玩家;229 站定 1/600→ai[0]=11/ai[1]=30×Next(1,4)
   (30/60/90 三档;尾部 !flag18 为死旗按字面省略)。推进:11 与发呆共段
   (小转身边 :54663-54669);退出口分流——{2,11} 族 localAI[3]=40(:54828 直值,
   旧实现误用 30+Next(60) 一并纠回),其余族维持 30+Next(60)(:54859)。
   表演帧带:socialFrame case11(:69709-69750 困盹 num60−1+NewBubble(89,90)+
   dust216 ×3+Next(4)/gore 580-582 无 API 登记)、case18(:69856-69889 反编译原文
   末行无条件覆写 npcFrameCount−2,按字面直录不"修复")。
④ **树妖本体不吃 165 光环→核清已由治理批 B2 清偿+敌怪 186 臂接通**:
   本体 ward(P.cs:41957-41973 无 owner 排除)现状正确;本批补齐 else-if 臂
   敌怪 DryadBane 186(:41961-41972):!friendly && lifeMax>5 && !dontTakeDamage &&
   (无 buff|≤20t 重授窗) && (已带煞||CanHit 弹心点对敌盒) && type!=488 蜂后豁免;
   DoT=DOTTally.Add(dps×2,dps/3)=dps HP/s,dps=GetDryadsBaneDamagePerSecond
   (:92898 基数 4×downed 进度链,GetAttackDamage_ForTownNPC 截断),Enemy 新增
   dryadBaneT/dryadBaneDps/dryadBaneDoT(DOTTally 对账循环+尘 163 1/4 :92448),
   projStatus.SUPPORTED 补键 186(免疫表继承)。城镇 NPC 165 时长档 ≤20t 重授窗
   与原式一致。
⑤ **问好窗口收窄**(Player.CanBeTalkedTo Player.cs:3872+端点 Top):
   面向玩家态(ai0∈{6,7,18,19})推进门与 ai[0]=7 入口补 Player.CanBeTalkedTo
   (active&&!dead&&!ShouldNotDraw&&stealth==1f——隐身衣/星璇潜行未满格不点头;
   dead 门覆盖硬核幽灵相);UI 占用工程收窄叠加面=input.uiBlocking(背包/挂牌/
   商店开着不点头——原版对应 mouseInterface/smartInteract 家族在 Main 侧而非
   AI 内,登记择优叠加);CanHitLine 端点由盒左上角修 Entity.Top(中心-X,顶-Y),
   距离度量同步改中心基(旧 pl.cx 直读对无 cx mock 形状 NaN 脆性一并消除)。
⑥ **结对聊天泡 NewBubbleNPC 三事件落真**(:70033-70054):第二参改【时长 tick】+
   表情走 PickNPCEmote 随机池(npcEmotePick;90/70/100 曾被当表情 id 直绘且寿命
   恒默认 180,t70 泡锚定对方头顶 life90 带 nPC.CanTalk 门,t216/t320 锚自己
   life70/100)。EmoteBubble 增 emoteSnapshot/emoteClearAll 测试探针导出。
⑦ **微光对话差分=核清(台账误报)**:1457(:6737)/1458(GetChat :94974 全文分型支 +
   Lang.dialog :170-173 平铺 LegacyDialog.N + GetShimmered :92668-92694 town 支
   仅置 ai[0]=25)均【不存在】微光变体台词族——IsShimmerVariant 全部消费点仅为
   gore/贴图偏移(Main.cs:27432 等)/肖像条件(NPCID.cs:4952)。 StardewTalk.* 台词键
   (Joja 可乐链)已在库。
   **树妖 Stardew 施法光主体落地**(:19220 HaveDryadDoStardewAnimation→ai[0]==24
   态,:55687-55703 推进块):TownNPC.social kind24 新增——enterStardewCast()
   (prevAi0=480/facing=1 锁向/480t,Game 'stardew' 按钮 Interact 与 msg144 远端回环
   双挂点,CanDryadPlayStardewAnimation ai[0]!=24 门等价 social?.kind!==24);
   lightRGB 补 GetMagicAuraColor() 全档直加(:55693-55694);帧带=魔法光环共带
   base/base+1 每 6t 交替+60t NewBubble(87,60)/150t NewBubble(3,90)/≥240 行归零
   (:69943-69970,frameCounter 不清零=气泡各恰一次);退出口 ai[0]=0/ai[1]=480/
   localAI[1]=480 专用形(:55695-55703)。弹 995 全屏 StardewValleyAnimation 编排器
   原样保留(fx/StardewAnimation)。

**遗漏判定(登记不闭)**:海盗 case11 gore 580-582 与酒馆麦酒 Kill 尘族(gore 无 API);
列级三行开门探测为本仓工程扩展(原版单行前提,判型语义等价);uiBlocking 工程门在
联机远端玩家代理上未区分(uiBlocking 是本地输入位);PickNPCEmote 仍取 ProbeEmotions
基池近似(全量 ProbeExceptions 未展开,沿 C3 登记);case18 终值帧行为若实测表现异常
需 TEdit 复核反编译末行覆写是否编译器伪影(现行按字面)。
测试:`tests/townnpc-ledger-aug31.test.ts` 15 断言全绿(掷门四象限/stinky 双路×2/
演出两态+施法态/泡锚三事件+CanTalk 门/186 三豁免+LOS 隔墙/潜行与 UI 双不点头);
townnpc-behavior/town-npc-{attack,damage,hurt,progression}/town-sitting/town-variants/
_npc-door-replay/npc-domain-gaps/diff-1457-npc-batch2/npc-frame-golden/npc-stats-golden/
town-sheet-frames/_npc-wall-clip/npc-damage-gate/npc-grid-draw/emote-menu 计 17 文件
298 例全绿(behavior P1-5 两例掷序随新两支后移修正)。tsc TownNPC/Enemy/projStatus/
EmoteBubble/Game 挂点零错(2026-08-31 自查;其余文件红灯属并行会话在途域)。

---
## ✅2026-08-31 vault 三通道+杂散收口专项清偿（vault 拒收 / 币种兑换 DoCoins / LootAll 多通道 / Football MP grace / Luck 锚漂移）

范围：`entities/Player.ts`（depositIntoVoidVault 注锚+DoCoins 接线）、`items/Inventory.ts`
（新增槽位级 `doCoinsAt`）、`stats/QuickStacking.ts`（新增 `lootAllFromContainer`
+`chestSettingsAllowsVault`）、`ui/UI.ts`（chestLootAll 改造）、`entities/BallProjs.ts`
（宽限语义钉死注）；Luck 锚漂移清理=`stats/Luck.ts` 全文件 + `core/Game.ts`(碎镜 1085 链
/银河珍珠) + `data/items.ts`(:5340/:5577 条目注) + `Player.ts` luck getter 头注——纯注释级。
原版真值 `../Terarria1458`，逐条先 derive 再动码。

**① vault questItem/3822 拒收（核验+补测试）**：库内双门已齐——
`canVoidVaultAccept`（Player.cs:39733-39745 原式：questItem ∪ type==3822）+ QUEST_ITEM_VIDS
全集（DefaultToFish 唯一置位点 Item.cs:27652-27658 → 2450..2488 ∪ {4393,4394}=41 项）；
两处消费点均过门：`Player.depositIntoVoidVault`（单点等价原文三重门序 :39703/:39711-14）
与 `ItemDrop.ts:243` 溢流口（经 deposit 内门，dep==stack 走残余退回路径）。回归=拒收
真值表 + 端到端灌袋断言。

**② 币种兑换 DoCoins（原式定谳接线）**：★derive 反转任务书语义假设——反编译原文
GetItem_FillEmptyInventorySlot_VoidBag 尾部逐槽 `if (!NoCoinMerge) DoCoins(i)`
（Player.cs:39844-39847）读的是 **this.inventory（主背包）而非形参 inv 数组**
（inv 只承载 bank4 槽位；占堆合并支 FillIntoOccupiedSlot_VoidBag :39747-39792 原文无
DoCoins）：即**钱币升档结算发生在主背包同下标位，虚空袋自身永不换币**——原文本态，
按仓规照录。实现：Inventory 新增 `doCoinsAt(i)` 槽位级 1:1（恰 stack==100 且面额
71-73 才 SetDefaults(type+1)；归并支找别处同型未满堆 +1→TurnToAir→递归 DoCoins(j)
:39578-39584；铂不升），`depositIntoVoidVault` 空位落格后逐槽尾随调用。全扫版
doCoins() 与其同一谓词两个遍历口径，存档链路不可达态差异登记。PickupItemFromWorld /
LootAllFromChest / RefundConsumedItem 三通道 NoCoinMerge 均缺省 false=恒生效；
ReturnItemShowAsNew*（NoCoinMerge=true 族）CanGoIntoVoidVault=false 不达本通道。

**③ LootAll/LootAllFromBank 类多通道逐 settings 对**：1458 实际消费面盘点——
vault=true 仅三个实例：PickupItemFromWorld（WorldItem 拾取 Player.cs:35381+QuickSpawnItem
:7188,已在库）、LootAllFromChest、RefundConsumedItem（CraftingRequests.Refund
CraftingRequests.cs:339-341）；LootAllFromBank/QuickTransferFromSlot/ReturnItemFromSlot/
ReturnItemShowAsNew*/GiftRecieved/ItemCreatedFromItemUsage 均 CanGoIntoVoidVault=false
无需接线。**落地面按"真实可达"分级**：ChestUI.LootAll（ChestUI.cs:389-412）settings 按
`player.chest > -1` 二选一（:391-392；bank 分支 :414-465 用 LootAllFromBank=false）——
新增 `chestSettingsAllowsVault(openChestX)` 表达该二选一（本仓 bank 面板=openChest.x∈
{-2..-5} 约定）+ `lootAllFromContainer(inv, items, voidSpill?)` 迁移 UI.chestLootAll
搬移体（词缀随新放置槽写入=对齐 inventory[i]=returnItem 原文,余量留箱语义不变）；
真箱开面板时 spill 绑 player.depositIntoVoidVault——vault 拒收门与 DoCoins 尾随在
deposit 内闭环自动继承。RefundConsumedItem 无仓内可达消费（跨端合成请求退款面未建,
不可达性登记）;ItemSpaceForCofveve(:39510-39525 纯探针面)为 UI 候选高亮用,非接收口,
不接。

**④ Football MP grace（核清钉死）**：读原文 Projectile.cs:23677-23691 定语义——回收条件
`(player2.whoAmI != player.whoAmI || !(localAI[0] < 30f))`，**30t 宽限窗只豁免 owner
本人**，其他存活玩家盒相交即立即 Kill;"任何玩家共享宽限窗"假设不成立=任务书过修预警
作废。BallProjs 实现原本正确,头注+位注钉死,回归四象限（owner 窗内存活 / 其他代理窗内
立即回收且回落 max(ai2,1) 单笔 / 死亡玩家 !player2.dead 门豁免 / owner 第 30 拍起自触
回收）。

**⑤ Luck 行号锚漂移清理（doc-level）**：以 1458 符号实测重锚——RecalculateLuck
Player.cs:29367-29394（brokenMirror −0.25 支 **:29390-29392**,stinky 支 :29384-29387;
任务书引 :29379-29381 系 lanterns/gnome 区段,一并勘误）、UpdateBrokenMirrorLuck
**:29396-29412**、caps :3071/:3073+UI 计量 :4098-4103、luckPotion 三档 :10372-10388、
clover 置位 :12820/:12824+装备聚合 :13148-13168、AddCoinLuck :18204-18215(cap :18208)、
UpdateCoinLuck :18217-18227、CalculateCoinLuck :18229-18268、GetLadyBugLuck :18270-18282、
UpdateLadyBugLuckTime :18950-18969、瓢虫常量 NPC.cs:6643/:6645、击杀支 NPC.cs:78861-62
LadyBugKilled(:82403-82433)/触碰 :78740 LadyBugLuck(:82437)/releaseOwner 门 :82439、
ladyBugRainBoost 生成支 Main.cs:65813/:65901(旧 VanillaSpawner cs:2413 文件已不存在)、
微光化币 WorldItem.GetShimmered :1719(钱币支 :1725-1745→AddCoinLuck :1743)、银河珍珠
置位 :45789-45793(@:45791)、火炬扫描 TryRecalculatingTorchLuck :17845-17909+
ConsumeCountersAndCalculate :18026-18202(num2=40@:17864;coral/ocean/cursed/ichor/bone/
plain/clamp 八处内注同步重锚)、碎镜链 Projectile.Kill type==1085 支 **:72034-72055**
(写位 BROKEN_MIRROR_TIME=25200@**:72054**)——旧 P.cs:67554-67574/Player.cs:28694-28711
族锚全数退役;GameContent/Luck.cs 掷骰五函数 :5/:18/:31/:40/:53 未漂移保留。

测试：`tests/vault-luck-ball-ledger-aug31.test.ts` 14 断言全绿（QUEST_ITEM_VIDS 全集数/
拒收真值表×9/溢流端到端/doCoinsAt 升级链·归并·99·铂边闸/vault 同下标位结算端到端/
COIN_KEYS 序/settings 二选一×6/lootAll 三段搬运/spill 未带残量留存/球四象限）；
luck-system/luck-r5/luck-drop-chain/shimmer/coin-single-track/orphan-b3/orphan-b1
七文件 110 例全绿;tsc 本批触域零错(Player/Inventory/BallProjs/items/Luck/Game,
2026-09-01 自查——QuickStacking.ts:155+Game.ts:27162 的 movedVids 两错为并行会话
quickStackToChests 在途编辑面,与本批新增 exports 无关)。

交叉修复登记：并行会话叶绿 L3 批粘贴伪影曾致语法炸（Player.ts solarShields 双 else
重复行 / vanillaArmorSets.ts 游离条目+多余 `};`,恢复期已在最小化去重,语义不变）。

遗漏判定（维持登记,非本批收口）：手动拖拽入虚空袋的 UI 位不走 GetItem 汇流（原版同不
经 CanVoidVaultAccept——仅拾取/GetItem 族有门,故本批不加戏）;chestLootAll 的
PopupText/AchievementsHelper.NotifyItemPickup 逐事件播报沿既有"单次音效"近似保持;
ItemDrop.ts:214 台账行号系陈位,现址 :243;'player2.whoAmI' 名义上可被 server 权威态改写
的 MP 远端回收差=本地模拟模型下不可达,登记不动。

### δB 蓝队四组补齐批（功能已实现但编排漏接/接线失实→生产面收口,✅2026-08-31 已清偿,2026-09-01 复核）

红队 δB 点名四组（另一组 B8 为纯资源面）生产端漏接项与失实声明订正全量：
| 项 | 内容 | 生产接线 |
|---|---|---|
| B4 | TimerCrit(6170 蓄能暴击) 命中面缺 NightsEdge 编排+20×d228 尘环（旧档仅 6 颗 '#E8E8FF' 通用白粒近似） | Player.tryConsumingTimerCrit 按 P.cs:28574-28593 直译：①NightsEdge 编排 clientOnly:false=本地 nightsEdgeFx 同本体+broadcast 上行(PositionInWorld=hitbox.Center);②d228×20：noLight/noGravity/scale .9/fadeIn 1.1/Y 钳盒中/noLightEmittance,velocity=(π/4+π/2·i)×NextFloat×4 径向环(原文 ×0.5/×3 中间式被尾式覆写=死支)。Game.spawnDust 补 vanillaDust 缺省 null 门(契约=静默丢弃,测试桩兼容) |
| B11 | CattivaHit(67) 从未发出——fx 本体六芒参数在位而生产零调用;同步模块行内注"clientOnly 直驱+消费派发在位"系声称失实 | MinionProj 新 emitSpawnHitVisuals（Projectile.SpawnHitVisuals :14466-14501/:13633 每靶一发直译）：type1093/1112 → contact() 命中拍(Enemy 桶逐靶;Critter 桶整桶合一近似)+小动物命中同样触发;Position=Center+(direction·8,0)+Circular(4,4)、Movement=CircularEdge(4,4),本地 cattivaHitFx 与 broadcast 同参。★镐力面 :52193(ai[0]=3 帮工意图/IntentionGuesser 未折算)不可达维持登记——生产锚缺,不强造;PalJoy 音掩护区(:920 心形气泡窗 palJoyTick)未误植(负例断言锁 1118 零发) |
| B12 | InScreenDungeonSpawn(66) 出生纸屑爆未接线；syncModules 注"NPC.NewNPC :5267·spawner 域 caller 接线在位"系声称失实要撤回重写 | VanillaSpawner.spawnNPC 尾门=NPC.SpawnNPC :5265-5273 包装位直译(dualDungeonsSeed&&Y>worldSurface×16&&Y<UnderworldLayer×16 严格不等,movement=(width,height),uniqueInfo=npcType 原值);出站经新增 spawnOrchestra 钩(Game.makeVanillaSpawner 注入,三构造点统一)=本地 netApplyParticleOrchestra 复放+broadcast 上行双半边。自然刷生全部链/slimeRain 经 spawnNPC 覆盖;微光之灵 SpawnFaelings 走裸 NewNPC :5924 不经包装=原版同构免笺。禁入 world/gen 生成期 pass 遵守（只动运行时刷生侧） |
| B13 | BestReforge(18) 只响声不发光——doReforge top-tier 仅 playWavFile('best_reforge') | Game.doReforge top-tier 分支按 Main.cs :42638-42652 接线：RainbowRodHit 两掷(mv=(48,0)+Circular(16,16)/(0,16)+Circular(5,5),pos=MountedCenter+(0,-16×gravDir))+BestReforge 三连掷(pos=MountedCenter+Circular(16,16),每掷 Spawn_BestReforge 内生八粒 Research_Spark)；clientOnly:true 全本地直驱不广播;reforgeCooldown=60 冷却面未建模维持登记 |

登记修正面（声称失实撤回）：syncModules.ts ParticleOrchestraType 行内注 NightsEdge(10)/BestReforge(18)/InScreenDungeonSpawn(66)/CattivaHit(67) 四条 + L5 头注尾段 + 本表 L5 行四处片段（以「δB…已清偿」补钉）；本表对 66 曾记 producer 缺口、现按包装位口径改写。

回归=tests/blue-deltab-wiring.test.ts（9 断言：TimerCrit 消费拍广播载荷+d228 参数面×2/猫命中拍广播+Movement=CircularEdge 模长恰 4+1118 防误植负例+1112 双猫族/双地牢门正例+非 dual 与地表带、地狱层三负例+top-tier 三连 24 粒 #FFE98A+RainbowRod 白核 12 粒 Y 带±12+零广播）;orchestra l5+l6 62 绿、minionproj-ledger-aug31+sfx-wiring+weapon-summon-evict+summon-r6 全绿、melee-los-gate(TimerCrit 消费面既有套件)10 绿;tsc 触碰文件零错。

遗漏判定：**B8 三 wav 资产缺失是资源问题（wav 本体提取面），不在本批代码清偿范围，报告备案**——音轨放行链 doReforge 已按 best_reforge 名义调用，资产落地即通。B11 镐力面（P.cs:52193 HitIntention，ai[0]=3 IntentionGuesser 智能光标系统）仓内无锚，维持"勿造系统"裁决，非本批可清偿。

---

## ✅2026-09-01 终清波·三小件残留近似 1:1 清偿(SpectreSoulProj / Dart / MissileProj)

范围:`entities/{SpectreSoulProj,Dart,MissileProj}.ts` 逐文件剩余标记块扫描收尾,真值
`../Terarria1458`。回归=`tests/missile-proj.test.ts`(追加 "79 Kill 迸散全链" describe)
+ `tests/dart-proj-styles.test.ts`(+498 自旋档) + `tests/boulder-trap.test.ts`(+2 锚)
计 48 绿;trap/dart/spectre 族既有 11 文件 207 绿;tsc 触碰文件(Dart/MissileProj/
SpectreSoulProj/missile 测试)零错。

**核清确认(台账已勾销项,原样维持)**:
① SpectreSoulProj:draw() 文档化空实现 + dust175 尾迹逐粒(:29385-29398 子步挂载)在位,
   全文件 grep 零 fillStyle/arc——平涂扫描批清偿态原样,资产缺已备案。
② Dart 尖刺球常数族(rot+=vx*0.1/贴地摩擦门 vy==0 快照 ×0.97+|vx|≤0.01 截停不灭/
   重力 .2@ai0>5/终端 16/整盒分轴探针)与 75 摩擦门(上拍碰撞后 vy==0 快照)——B④/B⑤
   清偿态原样。
③ Missile 彩虹拖尾 C1 相位基准(globalT=(秒)%3600 :17014 消费位 fxStep+draw 双面)、79 命中
   RainbowRodHit 编排(L5 收编 hitStep 本地 rainbowRodHitFx+broadcast 上行;Game.ts:23241
   消费臂在位)+Kill 双掷 clientOnly:true 本地直驱——均已接线,"module8 已接则本地组合可简化"
   不成立(现形态即原版最小等价面);新导弹族 16/34/79 光标钳仍按台账遗漏判定留后续批。

**本波清偿·Dart.ts**:
D1(B) **巨石旋转双累加勘误**:AI_025 单次 `rotation+=vx*0.06`(:26682 `type!=1055` 支),
   旧实现通用 spin 块(st.spinK)与 kind==='boulder' 支各计一次=双倍;已把 boulder 从通用块
   剔除且累加保持在踢门之后(vanilla 拍内时序 :26596 踢→:26682 rot→ai[0]=1:26684→滚地加速
   →重力),两处 stale 注("尖刺球 vx*0.14"陈位等)一并订正。回归=boulder-trap 逐拍闭式累加锚。
D2(A 补缺) **滞滞启动踢三级递宽窗转正**(:26596-26677):逐级 ±8/±24/±40px 列×双行探针,
   首中即定踢向、左实优先(if/else 序,:26614-26619)、最宽双侧全空才落 Center.X 奇偶兜底
   (:26663-26679)。旧实现只测最宽窗 → 丢近/中距命中面,且双侧皆实时误走奇偶(vanilla 左实
   恒胜 +0.5)。回归=boulder-trap 中距左墙场景(旧码判向相反:−0.5 vs 新 +0.55 含同拍滚地加速)。
D3(登记→接) **498 铁钉自旋**(AI 分支 :58485-58492):ai[0]<50 恒对齐 atan2+π/2(else 支,
   与通用 align90 同式),≥50 与摩擦/重力【同支】改自旋 rotation+=direction*0.5;新增 'nail'
   旋转模式经 gravDelay(49) 复用同一翻转点,direction=出生速度符号(ctor Math.sign(vx),
   NPC.cs:57793 发射位语义,飞行中不复评)。回归=dart-proj-styles 五段锚(含 2.15 重力首拍与
   vx×0.98⁴ 摩擦累计)。

**本波清偿·MissileProj.ts**:
M1(C→真值化) **79 Kill 迸散全链**(:72436-72487):①数量衰减方向勘误——vanilla 按「距头部」
   num65≥N×{.3/.65/.85} 各减(头密尾疏),旧实现对靠近爆心的新点减=方向反置;②白影升级为
   Dust.CloneDust 真克隆体(Dust.cs:260-288 字段级复制回池 + scale÷2/fadeIn×0.85/纯白覆写;
   经引擎 VanillaDust.clone 1:1 件即 Game.vanillaDust 直读,池满/inactive null 兜底原生),
   "独立半尺白粒"退役;③补全主尘链 velocity(抖动×r×0.8 后 += DirectionTo(target4 回走链)
   SafeNormalize(Vector2.Zero)×6)、scale=(.9+r×1.2)×Lerp(.3,1,lvp2) 整式覆写、fadeIn=r×1.2×k67、
   position=Lerp(盒心,dustPos,lvp2) 钉头;④色相链 hslToRgb((hue0+lvp2)%1,1,.65)——L=.65 亮度档
   (旧六边形表仅支持 L=.5),hue 助手换 Main.cs:48695-48737 闭式直译,L=.5 路径逐字节保持。
M2(B) **尾迹采样时序校准**:trail push 提前到积分之前(原版 oldPos 写入序 = 每拍先快照当前位
   再跑 AI/位移,:17200-17204 ⇒ oldPos[0] 恒落后一个位移步)——曾采"移动后中心"致 Kill 的
   DirectionTo 链首段零长退化(SafeNormalize(Vector2.Zero)=零向)且绘制链整体前移一段。
   回归=missile-proj 追加 describe(rand 恒 .5 钉死闭式):head-first 分组型 [2,2,2,2,1,1,1,1]
   正向断言(镜像实现合计缩为 8 可鉴别)/组间 scale 严格递减/head 组 scale 1.5·fadeIn 0.6 闭值/
   速度模≡6 且指向爆心/12 对 CloneDust 字段等价(scale÷2·fadeIn×0.85·纯白·pos/vel/type/α/
   noGravity 继承)。

**核对无行动**:Dart 当前 :557-563 区间=GC1 noteVanillaProjImmune + GB1 ghostHurt 接缝
（2026-08-31 GC 批接线体,非残留标记）;TrapShot.fireworkUpdate 粒子节流、"420 每 1/5 取色"、
gore 无 API 等均属已登记 C 档豁免条款族,不动。

---

## ✅2026-09-01 终清波·bossAI 三件残留近似 1:1 清偿(bossAI_lategame / bossAI_dd2 / bossAI_golem)

范围:`game/src/entities/{bossAI_lategame,bossAI_dd2,bossAI_golem}.ts`(原子连带:`core/Sfx.ts`
跟踪循环轨接口、`entities/types.ts` GameHooks 面、`render/SkyRenderer.ts` MoonlordDeathDrama
扫描面)。原版真值 `../Terarria1458` 全程逐行 derive。回归=`tests/bossai-final-wave-sep1.test.ts`
(14 断言);boss/golem/dd2/sfx 家族 9 文件 124 例 + 二批 8 文件 156 例 + sfx/music 4 文件 20 例全绿;
tsc 触及文件零错(2026-09-01 自查,余红为并行会话在途域 fx/gen 等)。

**bossAI_lategame(A/B×1 + C×2)**:
① **女皇侧弹伤五元组 ForProjectiles Remap 实装**(NPC.cs :46495-46499 GetAttackDamage_ForProjectiles=
(int)Remap(difficulty,Classic,Expert,n,e) clamped):num6 光枪墙919(50,30)/(60,35)、num7 光枪回环919
(70,65)/(65,30)、num8 彩虹射线873(45,30)/(50,35)、num9 永恒彩虹872(45,30)/(50,35)、num10 太阳舞923
(50,35)/(60,40),锚随二阶段翻转、大师/传奇钳 expert 档;flag4 白天暴怒后置覆写 9999 保持(:46500-46507);
case2/4/5/6/7/11/12 七处二元硬编码退役。★登记锚勘误旧注":46455-46505"系任务书 1457 行号,1458 实位
:46451-46505 同段。
② **919/923 彩虹渲染 hue-rotate 近似退役**:Main.hslToRgb((ai[1]+0.5)%1,1,.5)·Opacity(:46399)
真值乘色烘焙(本地 multiply+destination-in,键量化步 8——同 Renderer.tintedSprite 桶,防 hue 连续漂移
刷爆缓存);DrawProj_FairyQueenLance(Main.cs :36492-36536)逐 pass 直译=Extra_178 光带双画(num2=180×40/
2=3600 带长,fade=GTLV(60,55)·GTLV(0,10))+尾迹 num4 六步(-120·n4·|v|∈[0,1])+轨道环 4 点(offset 2·num3)
+本体白画/double(color2=A/2),A=0 pass 在预乘管线 AlphaBlend(One,InvSrcAlpha)=加性半边以 'lighter'
承载(仓内 xnaCombined 两遍合一推理同源);发射相尘 267 补 fadeIn/color Lerp(GetColor,White,rand·0.4)/
noLightEmittance/scale×1.5 全字段;SunDanceBeam 四画直译(Main.cs :28706-28741,value4/value5 hue+0.3/
+0.15、lum lerp、×白 0.1、暴怒 OurFavoriteColor 替换、color5·lerpValue 行 2);**CastLightOpen 光路精确式**
(:45818-45826+DelegateMethods.cs:729-744):13 点全采样(旧六步)、v3_=hslToRgb(hue,1,.85)·scale 逐帧虹彩、
实心格豁免(store.isSolid 含致动排除面同构)。新增 `enraged` 出生档快照入参——逐帧读 Main.dayTime 的活面差
(昼↔夜切换时颜色滞后一场演出)登记。
③ **467 life=300 判定复核=维持**:vanilla SetDefaults(P.cs:5364-5372)确无 timeLeft 覆写⇒缺省 3600;但全仓
弹幕实体无离屏剔除(VanillaDust 的 ±400 屏外裁剪只作用尘池),放宽会令脱靶制导火球在玩家远行期间持续存活/
汇聚;注释已在 fireball 段留档(引擎补齐弹幕离屏剔除后一并放宽,勿无声"顺手改真")。

**bossAI_dd2(A×1+勘误×1+C×3)**:
④ **传送门循环轨屏距衰减接通**:NPC.cs :41403-41465 PlayTrackedSound(DD2_EtherianPortalIdleLoop,
Center)=位置化跟踪轨 → GameHooks.startTrackedLoop(atten/pan 随 setPos)接入,lanePortalAI 两相
(开门 vol=1/消散 Volume=scale,NPC.cs:41464 收门段逐帧降音)经 handle.setVolume 面驱动(Sfx.startTrackedLoop
扩 setVolume(v)=乘基量再 atten,与位置衰减独立);"startLoopSfx 无空间参数"登记退役。★连带勘误:台账⑩
fuse 循环轨曾传 raw 文件名而 WAV_MAP 未收录 → startTrackedLookup 恒 null,两轨**实际从未出声**——
SfxName+WAV_MAP 补 dd2KoboldIgniteLoop/dd2KoboldChargeLoop/dd2PortalLoop 三键,wav 在盘即通。
⑤ **电光尘双支精确化**(NPC.cs :66985-67014):Next(15)==0 支 NewDustDirect 半宽盒 272(scale .65/
vy−0.8/direction 同向 vx 翻负/vy>0 → ×−0.5)+ Next(80)==0 支 Center 双粒 NewDustPerfect(随机单位向×{1.1,
1.5},noGravity);连同出生窗出场烟(:67036-67053,num15=localAI[1]/10×Next(5)==0 门 d27,v×0.1·num16 后+=自身速)
一并落码;"1/80 spawnParticles 两粒白点"近似退役。
⑥ **胜利演出尘涡+星爆精确式**(NPC.cs :41214-41271):num1499 密度相位 0.99→(≥60).79→(≥120).58→
(≥180).43→(≥240).33(≥540→1 全免),每 tick 9 掷 roll≥num1499 才出 264 号 perfect(110+600r 半径带/反向
14+8r 速/scale .9/fadeIn 1.15+.3r/color A=num1499(1−num1499)/noGravity/noLight);12 拍星爆 {100,...,540}
整环 120 粒(radius=810−ai0 收束、反向 14+5·ai0/600+8r)。旧恒密度单粒 spawnParticles 近似退役。
**RequestLight 缺口闭合**:MoonlordDeathDrama.RequestLight(lerpValue=GTLV(480,570,ai[0]))(:41201-41205)
经 SkyRenderer.updateMoonlordDrama 扫描 vanillaId===548∧ai1==2 面接入(共享 whitening MoveTowards .02;
SceneMetrics.Center=玩家扫描心,:183 的 <2000 距离门在 requestDramaLight 内既有),渲染帧扫描实体活态 =
drama 系既有模式,无 AI→renderer 直连通道。

**bossAI_golem(C×4+A 可视×1)**:
⑦ **排焰双流真实尘实装**(NPC.cs :31796-31812,aiStyle48 尾段 player 门外+!getGoodWorld 门):每 tick 两粒
Dust228/NewDustPerfect +=velocity/noGravity——流① Bottom+(±22·scale,−22·scale) 侧别向 Rot(π/2−π/2·side+
NextFloatDirection·π/4)×(2+NextFloat)、流② Bottom+(±6·scale,(−4..−12)·scale) UnitY 下洗流(fadeIn=0/
scale=.7+NextFloat·.5);原注"纯视觉略"整段缺失即缺即补。
⑧ **断臂尘逐 tick 真值流**(NPC.cs :19626-19663):每 tick 双臂各一粒 Dust.NewDust(臂点 8×8 盒 31 号灰,
alpha+=Next(100)/v×0.2/vy−=0.5+Next(10)·0.1/fadeIn 同分布)+Next(10)==0 火星支(Dust6,Next(20)!=0 门:
noGravity/scale×(1+Next(10)·0.1)/vy--);旧"每 10t 一簇粒子"近似退役。
⑨ **拳聚能向心收敛形态**(NPC.cs :19374-19390):ai1≤15 每 tick 一粒 228/NewDustPerfect——出生位=
Center+Circular(80,80)·0.95+Circular(20,20)(Utils.cs:1301 圆盘抽样,非逐轴均匀)、速度=−vector3·0.05 向心汇流,
fadeIn=1.5/scale=0.5/noGravity/getGoodWorld 加 noLight;'#C8A040' spawnParticles 近似退役。
⑩ **冲拳焰尾**(NPC.cs :19455-19460):1/2 拍一粒 Dust306(NewDustPerfect,speed=v×0.5+Circular(20,20),
**OurFavoriteColor(255,231,69)** Main.cs:886,**scale=2f**)——306 纹理/2 倍缩放/黄橙真值色三件套齐备,
'#E08040' 每 2t 近似退役。(仓内行号锚勘误:旧注 ":19348-19356/:19278-19292" 均 1457 位,1458 已漂至
:19455-19460/:19374-19390。)
⑪ **HitEffect 转换fresh-NPC 化**(NPC.cs :85904-85919):246 血尽 → NewNPC(Bottom 锚=原头底边,:81594)
249 走完整 ScaleStats(lifeMax 16000 档);本仓经 spawnVanillaEnemy 直生对齐,ctor 缺失环境退化为在位转换
兜底(该兜底的 lifeMax 差异=唯一漂移,备案);'#C04030'×16 非原版演出爆删除(HitEffect 该段零尘/gore)。
246/249 同为 70×70 → 盒逐位重合,无位移跳变。

**登记不动/边界声明**:
· 919/923 A>0 pass 的 canvas 单次 source-over 与 XNA 预乘"加色 rgb 项+遮蔽 α 项"两分量存在微差
(火舌 :32080 采用 destination-out+lighter 两步精确式;919/923 因多为大α覆盖层,观感差异 ≤ 合成半边误差,
C 档精度上限在此)。
· enraged 配色取出生快照;GetFairyQueenWeaponsColorFull 的 dev 名 easter-egg 分色表沿四小件批登记不接。
· cast-light "store.isSolid≈非 tileSolidTop∨非 tileSolid" 平台面粒度对齐现 LUT 口径。
· DD2 victory whitening 为渲染侧扫描实现(实体侧无 renderer 引用通道),语义等价性依赖 ai0/ai1 活体可见面,
与月总死亡戏剧同模式。

---

---

## ✅2026-09-01 终清波·WeaponProj.ts 全域残留标记 1:1 清偿（回归=tests/weapon-proj-ledger-clean.test.ts 终清波四 describe + weapons-entities/orchestra-types-l5 更新锚）

扫描法:全文件"近似|简化|省略|未建模|不做|跳过|登记差异|备案|偏离|GAP|TODO|偏差|缺口"逐块读 `../Terarria1458` 反编译 derive;三链交叉(AI_003 与 Main.cs DrawProjDirect/Collision 两提取件已核 1457≡1458 同值)。**A 类行为实装 9**:**B 类音准/音频修正 4**:**C 类视觉转正/登记升级 7**:注释勘误(陈旧近似注退役)5。

### A 行为 1:1 实装
1. **301 弹跳盾出程式重写**(AI_003 提取件 :459-477):1456"按住≥20/松手≥100 双门"退役 → scale=1.75/tick(仅绘制,getRect 不乘 P.cs:16760)、ai[1]==1 定角 −π/4−π/2、==20 Item_1、<30 绕手悬停(rotation+=dir×π/30+Center 钉 MountedCenter−velocity)、否则 atan2(v)+π/4、≥60 转回收速度归零;尾段 d57/d43 旋喷尘团(:707-761,RotatedBy(π/2)⊥向×±16×scale、NextFloat 单标量)随出程态实装。weapons-entities 旧双门断言按新真值重写。
2. **182 圣骑锤锤头 d57 光尘补接**(:39906-39912,出程段内——C1 批"头段本就无尘"误判勘误)。
3. **866 飞刀尾段 d212 尘**(全状态 :40281-40289)。
4. **106 LightDisc_Bounce 溅射实装**(:28787-28801):NewDustPerfect 306×4 主粒(α200 s1.6 lerp #DBFD00→Cyan)+CloneDust 白档,Reflect(v,n) 原式+RotatedBy(NextFloatDirection×π/4,"视觉略"退役);撞墙响应链重排至源码次序(106 特支→23/383/301 链→缺省 HitTiles→{33,106,866} 反射→Sound0)。
5. **AI_015 掷出撞墙冲击波两连实装**(:44499-44520+CreateImpactExplosion :70716/CreateImpactExplosion2_FlailTileCollision :70857):①扫窗 TopLeft..BottomRight+range=width 圆距筛选+fail:true×2 数量面合成占位、causedShockwaves 判定真值化;②d31 白尘椭圆环精确值 ×8(+!shock 补 8)。spawnBurst 合成半环退役,tests/weapons-entities 断言改锚 dust31。
6. **FlailProj 转坠落当拍 localNPCHitCooldown=10 覆写**(:44506 cdOverride 单拍位)。
7. **Collision.HitTilesInACircle 几何 1:1 化**(Collision.cs:3029-3086):Position+Velocity 偏移/halfBrick 探测窗/nactive 矩阵/maxTilesY−40 钳/无人工上限;383 传参改 Position−150 盒边 300 口径(:19639-19649)。
8. **Wet 坡面支并入 inLiquid**(:1646-1666,slope!=0+上方液体整深 16px 相交;"store 无斜度旗"缺口退役,lava 全盒档保持两分)。
9. **FlaironSpike 反射轴差分**(:18429-18445 真接触事件计数勘误——旧注"无条件++"系误读;反射改 lastVelocity 轴镜像)+FlaironSpike Kill 尘 y 坐标 cx0 笔误修复(P.cs:74184 回归钉死)。

### B 音准/音频
10. **Item_7 -0.33f 变调 + 出程静默门**(301 回程呼啸,:39578-39595,-1000 展示偶人语态守护;playSfxWav 第 5 参=XNA Pitch 直传)。
11. **1074 自旋段 -0.3f**(:39807)/**回收段三档**(-0.2 悬停过 Item_182(:40321)/-0.5 Item_7(:40324)/其余无变调)。
12. **262 回收起手音 'explosion' 合成兜底 → SoundID.Item14**(:25068,P.cs 校正)。
13. **1125 DD2_ExplosiveTrapExplode 三变体实播**(:43034-43041,WAV_MAP dd2Explosive 在盘资产,'explosion' 近似退役);**AI_189 首帧爆发逐参实装**:d6×20(α200,NPD+RotBy±π/4×0.3)+d31 rand(3,7)/3×5(α50 noGravity ×3)+壳 gore61-63 ×rand 档(vel×1.7,GorePiece.newGore 通道——'gore 池无 API'陈旧登记退役)+每 AI 帧 rand(3)<2 d6 烟团(α90 s2.5 fadeIn1)。

### C 登记/升级表述(不造假体)
14. DaybreakFlare 附着相 HitEffect(0,1.0)(:41453)→ 精确系统登记"NPC.HitEffect 敌怪自体受击尘族待移植"(合成两粒降格为观感占位);同页浸剂/霜燃/岩浆石/parry×5/nano×1.05/party confetti 链并入 hitStep(Damage_PVE 镜像,"浸剂链未接"退役)。
15. hitTilesInACircleFx/impactExplosion 的"块色尘"统一升级为 **WorldGen.KillTile_MakeTileDust per-tile 尘型表系统待移植** 登记(淘汰"观感等价近似"表述)。
16. SpearProj 头注/TorchGod 尘迹省略注/inLiquid wet 口径注/Boomerang channel 死字段注/FlaironSpike 锚定索引表示层差注 五处陈旧近似表述修订。
17. §预筛复核:**链刀出程 tileCollide 撞停(481+Anchored 双路)= 已完成**,跳过;**圣骑锤冲击波粒本体(paladinsHammerShockwaveFx+broadcast)= L5 批已收编**,跳过;**dropKey 弹射系对照原版 = 核验零债**:Terarria1458 Projectile.Kill() 全文无 aiStyle3/13 家族掉落 Item.NewItem(仅 1057→5523/1014→29/116/1124/4143 特例拾取),本仓 Boomerang/Anchored/Flail 无自造回收链=parity;Arrow.ts 投掷系 dropKey 维持既有"域登记"(已在 Game.ts:12402/Arrow.ts:5449 注明偏离原版恒消耗)。

### 其余留账(非本文件域)
- rotation-ledger-remainder 6 红/halfbrick 用户阶梯走廊 1 红/Game.ts:14750 tsc 错 + MinionProj 'st' 未定义错 = 本波开工前既存(基线复现取证,halfbrick 以旧实现回放确认与终清波无关),属并行会话管线域待其收口。


---
## ✅2026-09-01 终清波·五小件残留近似 1:1 清偿专项节

范围:`game/src/entities/{MinionProj,PetFollower,Mounts,bossAI_lunar_misc}.ts` + 引擎基建
`src/fx/VanillaDust.ts`(followEnt/attractTo 两档)。原版真值 `../Terarria1458`,逐条先 derive
再动码。回归=`tests/final-wave-five.test.ts`(14 断言全绿)+minionproj-ledger-aug31(22)+
weapon-minion-ai(29)+palworld-minion-parity(36)+summon/boss-lunar/blue-deltab/orchestra l5·l6/
mounts 家族/pet-ai(fixture isActive 补齐后 21)等全绿;tsc 触碰文件零错。

**MinionProj.ts(A2+B1+D1)**:
① A|跳梯探测形统一:蛙758/帕鲁1093·1112/蘑菇1022 三链由"单柱 walkerJump*"换装
虎先例共轨(`ai67FrontWallScan` 前墙列扫 + `ai67JumpLadder` 三柱承立闸+中腰行基准
:s51438-51545);顺带修正三处失真——猫/蘑菇内联扫描行界 off-by-one、Math.round(vx)
应为 (int)vX 截断、蛙旧 walkerJumpLadder 底行基准应为中腰行(h/2 系统差一格)。
★derive 判定:任务书"统一三柱"仅对 AI_067 族成立;蜘蛛390-392 属 AI_026(:63172-
63290),原文即单格前墙+单列底行支承闸(SolidTileAllowBottomSlope∪halfBrick∪slope>0)
+单列中腰梯档——保持单柱原文形并补上整段缺席的支承闸(ClosedDoors 门本仓无建模,
登记)。AI_067 跳跃意图两面合流 `ai67JumpFlags`:(a)家族 flag20 条件档(虎 flag3=
v15Y<−80 经 wallIntent 接回真形;海盗 flag 直死;(b)前墙列扫 num55≠0∧flag21 家族
无关恒可触发)——旧实现把虎的(a)误并入(b)扫描门,ledger 测试断言随 derive 改判;
② A|FindTargetInRange 双距择近归真:`findTargetInRangeDual(game,startRange)` 1:1
(P.cs:49884-49921 检索循环阈值收缩 num=min(num2,num3) + IsInRangeOfMeOrMyOwner
:52406-52424 双距 ∞ 语义[myDistance↔CanHitWithOwnBody 四试 / playerDistance↔
CanHitWithMeleeWeapon 四试,closerIsMe 择小 ≤max] + viewRect=玩家心 ±960×600
(MaxWorldViewSize :758)+boss 豁免+focus 早退),接入虎/海盗/蛙/猫/蘑菇五链——
旧单距检索登记退役;ownerHitCheckDistance 缺省 1000 对 startRange≤800 恒不束。
③ B|俾格米射击门 +40×slot:MINION_SHOOT 三键(metric='manhattan'/rangeSlot=40/
throwLos=Collision.CanHit 出手面,:62566-62753 flag10 段原式 num139<800+num134),
191-194+Foxparks 1094/1113 统一入表(1113 窗口=800+40slot+360 与 num134+=360 同构);
AI_062 族保持欧氏门距不动。
④ D|PlayTrackedSound 跨 tick 续播缓冲=核清非缺口:Sfx.startTrackedLoop(GH 钩
{stop,setPos})dd2 批已在位;MinionProj 域内 vanilla tracked 音点全部为定位置/一次性
发射音(:69529 存槽仅自定位 base.Center、:69684/:69977/:70439/:70583 无槽消费)→
逐事件 one-shot 可闻等效,无续播面需建,登记销账。

**PetFollower.ts(彩蛋批,A1+C2)**:
⑤ A/C|764 UpbeatStar(aiStyle144 case 764 :66801-66835):alpha 三角脉冲三角波
Opacity=Lerp(.4,.75,fold120t)+Y 波 cos(lai0/120·τ)×2 入 hover 目标+d292 微光尘双档
(慢 |v|∈(.1,4) Next(30)/快 Next(15)、vel×0.5 出速→×0.3+noLightEmittance)+localAI[1]
自旋累加就位。FallenStar 覆绘(DrawProjWithStarryTrail Item_75 分支 :38316-38334)
被**资产缺口**卡死(sprites 盘缺 vanilla/Item_75.png;Extra_91.png 在盘但三星尾迹
需拖尾域帧缓存,渲染域债登记)——atlas-append 落 Item_75 后即通。
⑥ A/C|1050 斧仙全量专支(case 1050 :71258-71338+公共尾段):axeCd(localAI[1])
冷却/-300 远离闸、近主(<320)侧扫 12 格 IsShakeable 树干→锚定树心近侧 30px+动画窗
8..15 rate3(num4=16/num5=8/num2=3)、砍击拍(frame==8||12∧frameCounter==0):
KillTile_MakeTileDust≈木屑粒(C 近似)+PlaySounds(fail:true)≈dig 音+蓄量达
200+rand100(rand20==0→÷8 加急档)且 rand5 → KillTile_DropItems 掉木材【不毁树】
(树种映射精简表 PET_AXE_WOOD_BY_GRASS+TILE_DEFS sheet 换算;宝石树果/冠帧橡实
不入精简表登记);召唤物 Item 5517 本身不可获得(item 数据缺口登记)——行为随批
就位,入库即通。
⑦ C|1090 彩虹巨石宠:归位飞行拍每-other-tick ShimmerBlock 编排粒子(:50640-50648,
clientOnly:true 本地直驱,CircularEdge(w/2,h/2)+MovementVector=v×0.05+
UniqueInfoPiece=500)=shimmerBlockFx 复用直驱。
⑧ 核清注:653 同伴方块彩蛋(岩浆尖叫 3600t 冷却/黑暗戳人/滚动)本体在
MinionProj.companionCubeStep 1:1(本仓 item-use 召唤路 = 原版 BuffHandle_SpawnPetIfNeeded
NewProjectile 同构),PetFollower 侧无重复实现;装备槽双表示共存漂移登记。

**Mounts.ts(B1)**:
⑨ B|圣坦 930 爆散视觉订正:vanilla Kill 先收缩盒至 22×22 弹心(:79837-79842)——
d31/d6/gore 锚=cx±11(旧实现误用 128 结算盒角作视觉锚)+d31 vel×1.4 补乘+
gore 两轮四对角 NewGore(Next(61,64)) vel×{0.4,0.8}±X/Y(:79861-79885,
GorePiece.newGore 通道,"gore 无 API 不接"登记退役);930 非 fluid 弹型,
Kill_DirtAndFluidProjectiles 无适用面→对应合并句一并销账。

**bossAI_lunar_misc.ts(核清2+A/C2)**:
⑩ D|月总水蛭插值起点接源弹456当帧实位(:37090-37093 Lerp 面)=四小件批已清偿
(claimSourceLeechProj WeakMap 配对),本批复核绿;
⑪ D|石碑仪式 526 已实体化且无需补:TabletShardProj 原 SetDefaults damage=0/
friendly=hostile=false、AI_098 无 Damage/tileCollide 分支(P.cs:5964-5972+:33745-
33766)——原版本体即纯视觉实体,"命中盒/伤害/hostile 补齐"前提不成立,核清;
⑫ A/C|水蛭 d229 双环精确化替换 spawnParticles 近似(:37102-37116):外环6粒
UnitY×(−h/2) 六向 RotatedBy(vel=−UnitY,scale .7)+内环3粒 ×(−h/6)(vel=(0,−2),
scale 1.5)+customData=this **随行 ride**——VanillaDust 增 followEnt 闭包承载
(dust.position += npc.position−npc.oldPos[1],oldPos[1] 一拍滞后语义≤1t 相位差登记),
228/279 同入 chain-A arm(重力 .05 档/customData 子块/光照贡献与原文同构,
既有 d228 生产者自动转正);
⑬ A/C|幻影之门 aiStyle108 聚尘/开门两段 customData=base.Center(Vector2 吸向档)
接线(attractTo,:906-912 velocity=(v×4+单位向·|v|)/5 定长折向);同文件
"磁尘 customData 吸附未接"系误植于 526 名下勘误撤销(AI_098 原文从不写 customData)。

**测试**:tests/final-wave-five.test.ts(①双距双侧分野+双墙全堵 ②列扫行界复核+
蜘蛛支承闸 ③slot0 曼哈顿拒/slot2 收 ④爆散量面/速度系数/gore id ⑤水蛭 9尘/拍+
ride/attractTo ⑥脉冲域/斧仙锚定掉落/缺省树 vid/1090 cadence)14 绿;
随批改判两处旧断言(minionproj-ledger-aug31 虎跳梯"不跳"→(b) 家族无关必跳;
weapon-minion-ai 蜘蛛 -9.1→-7.1 中腰重锚);pet-ai 三例系开工前既存红
(stubWorld 缺 isActive,walkDownSlopePre 并行域改动滞后),fixture 补齐后 21 全绿;
tests/bossai-final-wave-sep1.test.ts tsc 红=dust mock 类型面,属并行 sep1 会话在途
域非本批文件。

*生成方式:三个并行清账代理(六巨头/中件/杂散域)+Dart-Missile 子审计,覆盖原始标记 ~900+ 行,全部基于 Terarria1458 或 1457 反编译交叉验证。*

---

## ✅2026-09-01 终零波·Player.ts 域全标记扫描 1:1 清偿(专责代理批)

范围:`game/src/entities/Player.ts` 单文件(+关联新实体注册件 `entities/OrichalcumPetalProj.ts`;
原子连带 `data/vanillaArmorSets.ts`、`stats/Buffs.ts`、`entities/types.ts`、`core/Game.ts`、
`entities/Enemy.ts`)。原版真值 `../Terarria1458`(逐条先自读反编译 derive 再动码,
双版本行号锚)。回归=`tests/orichalcum-hallowed-set.test.ts`(32 断言全绿);
player 族 10 文件 174 绿 + chloro/blue-batch3/combat-parity 等邻域批次复绿;
tsc 触碰文件零错。

**A 档·行为实装 7 条**:

① **山铜(奥利哈刚)全套 onHitPetal 全链**(前序批点名遗留"petalTimer 齐备无写入端"):
ArmorSetBonuses.cs:455-456 三头变体(1210/1211/1212=hs86/87/88×胸1213=bs55×腿1214=ls50)
→ :217-220 onHitPetal → Player.OnHit :6963-6985 `petalTimer==0 → petalTimer=20 +
NewProjectile(221,36,kb0)`。落地=vanillaArmorSets 表键×3(`expandHeadVariants` 全组合
展开:1458 Builder.Set(int[],int[],int[]) :81-107 笛卡尔积 + GetCompleteSet :512
QueryCount.Complete 三件俱全语义)→ computeEquipStats 读面 → Enemy.hurt fromPlayer 段
新增第四支(钛金→[神圣]→[帕拉钯]→花瓣→叶绿 同位次)→ Game.spawnOnHitPetals 屏幕边出生点
(direction 背面屏幕缘 + y=sy+Next(sh)、速度=(命中点−出生点)+Next(-50,51)×0.1 抖动后
【无条件】24f/len 归一,len==0 除零死路 epsilon 钳制登记,chloro 先例同法)。
新实体 `OrichalcumPetalProj`(221 SetDefaults :3068-3080=20×20/aiStyle41/friendly/
tileCollide=false/ignoreWater/timeLeft120/penetrate=-1/scale 1+Next(30)×0.01/extraUpdates2;
AI_041 :28179-28189 frame=rand3+rotation+=vx×0.01;EU=2 子步折叠=每拍3子步/寿命40拍/AI
与位移全在子步内;ProjLight :16249 light>0 门 221 无写者=零光照贡献;GetAlpha :81338
α200;TryDoingOnHitEffects :15210 排除表含 221 自续断链,ON_HIT_EXCLUDED_PROJS 已载)。
② **神圣套/神圣召唤套 onHitDodge 写入端**(第四闪避支来源链闭合):vanillaArmorSets 收编
Hallowed 全组合 24 键(hs{41,42,43,255,256,257}×bs{24,229}×ls{23,212})+ HallowedSummoner
8 键(hs{254,258}) → equipStats.onHitDodge → Enemy.hurt 支(OnHit :6937-6940
shadowDodgeTimer==0 门 → AddBuff(59,1800)=BuffType.ShadowDodge=320/BUFF_DEFS vanilla59)
→ Hurt 第四支(:38516 ShadowDodge :38306-38324 dodgeFullFill+DelBuff+timer1800)全链可达。
★maxMinions+2(:229)不在新表承载——防双记(SUMMON_SET '254|*|*' slot2 与 SUMMON_GEAR
4873/4899 slot1 两旧链已在轨,vanilla 同效分道)。
③ **帕拉钯全套 onHitRegen**:表键×3(hs{83,84,85}|bs54|ls49)→ Enemy.hurt 支(OnHit
:6942-6945 AddBuff(58,300)=BuffType.RapidHealing=321/BUFF_DEFS vanilla58)→ 再生消费
UpdateLifeRegen :19385-19387 `lifeRegenCount+=4/t`(乘区外 flat +2HP/s,等价并入再生窗
flat 和——原版该支无 hp 窗门,满血溢出被上限钳吞,登记)。
④ **甲件 aggro 轴**:AGGRO_ARMOR_PIECE 表(GrantArmorBenefits :13852-13874/:13983-13997
逐 piece +=)——龟甲三件 1316/1317/1318 各+250、甲虫头/腿 2199/2202+250、壳胸 2201+400、
日曜三件各+300 → equipStats.aggroPiece 并入 aggro getter 多源 += ;旧注"甲件轴暂未建模"
退役。侦察背包 6175 aggro−400 经查 AGGRO_NEG 已接(V6 批),旧注陈位订正。
⑤ **environmentBuffImmunityTimer 实装**:字段+每 tick 递减(:1341/:24778)+shimmerUnstuck
传送写位 =4(Teleport :37701)+专家雪原冷水 Chilled 门补齐第 5 门(:28209 原式)。★旧注
"十字盾族 :27692 第 6 门未实装恒 0"系门源误标——该 timer 与十字盾无关,是 Teleport 的
环境 buff 免疫窗(Consumer 仅 Chilled 一处,grep 1458 全仓实证)。
⑥ **hasBreathingReed 坐骑门**:mount.Active 时查 MountID.Sets.DontHoldItems{55 Rat,
56 Bat,61 Pixie}(MountID.cs:29)→ 三乘骑宠物不认芦苇管换气;表随 vanilla-mounts.json
DontHoldItems 键已在盘,MOUNT_SETS 直读;旧注"本作无坐骑省略"退役。
⑦ **溺水气泡尘转正**:CheckDrowning 尾段(1458 :23473-23500)NewDust 盒(w−8×8,d34,scale1.2)
逐字等价 vanillaDust.spawn(口部锚=position+(12dir,num4+4gravDir);芦苇管偏移(-2dir,-58g));
程序粒子降级为缺池兜底。d34 Bubbles 帧表现成。

**B 档·接线核清(非空缺,注释陈位勘误)9 条**:太阳石白天门(accfg json 直通层确认在轨,
跳过项照办)/WarTable maxTurrets(buff 27 在轨,注订正)/拍击石回充音(snappingStoneRechargeFx+
广播+Item_30/20/28 已接,L5+ 批,注订正)/wetSlime 出水跳 ★D2 flag 链(justClearedWetSlime
已入起跳门 :20845 外门,注订正)/findPulley !controlJump(jumpOnlyHeld 等价谓词在轨,注订正)/
accTimerCrit(Game tryConsumingTimerCrit 已接,注订正)/WorksInVoidBag 例外(ItemID.cs:82
真值=WORKS_IN_VOID_BAG_FALSE{4346,5095}已在轨,注订正)/自然回血"恒 1HP/s"陈注(九档公式
2026-08-13 重写,注订正)/ManaRegen channel 白嫖(manaAnimTicks 钉窗修复面在轨,复核绿)。

**C/ENGINE/外域债·精确登记(维持)**:HeatDistortion 滤镜(引擎无 pass 宿主,:122 强度面)/
hideVisibleAccessory 定谳注(face head 层并入单层模型=渲染结构差)/sentry backpack 家族
AI_Sentries_HeavySlingReposition(Projectile AI 域,proj/boss 批)/getSlowMagicScalar 535 弹
AI(Projectile 域债,P.cs:45301)/chlorophyte 孢子云玩家侧粒子形态(box 近似 vs 编排粒,
Spawn_ChlorophyteSporeCloud 编排入 fx 需跨域批,Enemy.ts:2185 同族)/shimmer 解除音 style3
(sfx 库无样本)/磁体 PlotTileLine 手持光(:26188 门内消费,光域 R18 备案)/滚轴鞋 glideCap
useTime 缩放(ItemDef 无通用 useTime/createTile 面)/DownDash(D800 兔脚跳下坠跳系统域:
isPerformingJump_DownDash/:21211 族/Monk 冲刺伏击,L5 DeadCells 批挂账)/TryingToHoverDown
sticky 保持态(wings 物理 :22310/:22355/:26989 多点位微幅 vy 改写,M 级独立小工程)/
Double_Jump case16 单实例槽(LSP PlaySound 槽位模型,audio 引擎面)/case16 挂墙停注册不适用
(aiStyle7 Kill 段,tongued 效果①关键句)/eyebrella mount54 头顶偏移(月总头坐骑 n/a)/
petting 手臂复合层(gore/arm overlay 渲染缺宿主)/behindBackWall 抑制位(眼睑态未追踪)/
echo coating invisibleWall(Paint.ts 同注)/cross-necklace 族误标已随⑤改注/Journey 创意权限
difficulty==3 远放置 +240(GetItemGrabRange :35452 尾支,Journey 权限系统未建模,MP-only 类)/
日曜护盾反击消耗(608 弹 proc 于 Projectile.Damage 面+冲撞命中面,:57415 ConsumeSolarFlare
敌方反推,弹域债)/mysticSash DoMysticSashDodge 紫尘/gore(damage() 无 game 句柄,F13 桶表
同构需全局 FX 分发器——单例面留后续批)/cobweb stickyBreak 尘(KillTile HitEffect 网屑,
world 域)/屏蔽面 armor dye shader GetSecondaryShader 五处引用(引擎无 dye 宿主,总注保留)。

**测试**:`tests/orichalcum-hallowed-set.test.ts` 32 断言全绿(套装表三矿族+神圣两变体全
头位枚举/混搭缺一不亮/spawnOnHitPetals 门·置位·出生几何·归一速度/petalTimer 共享窗早退/
实体 EU 折叠×3·寿命40拍·tileCollide 穿透·世界边界/hurt 链四支授予·timer 门·来源排除表·
残血>5 门·影子闪避闭环·快速再生差分/甲件轴三例);player-ledger-aug31(16)+player 族家族
(174)+chloro-setbonus(28)+blue-batch3-combat-parity 全绿;tsc 触碰文件零错(2026-09-01)。

---
## ✅2026-09-01 终零波·Game.ts 域批（扫描标记 Top15+杂项清单清偿）

范围：Game.ts 域（Game.ts + Player/Buffs/ItemDrop/dropScanCtx/VanillaSpawner/Options/Settings 协同面），原版真值 Terarria1458。逐项处置：

**A 批·实装**：
1. **床设出生点消费侧统一**（回归药水 4870+重生链）：`resolveSpawnPoint()` 纯核=Player.Spawn :37851-37858 两源 failover（床点→CheckSpawn 复验失败→初始出生点）；respawnPlayer 与 4870（1458 P.cs:43470 区 DoPotionOfReturn…AndSet… :37780 内 Spawn(RecallFromItem) 等价面）共享读口；4870 补 removeAllGrapplingHooks(:37782)+clearSleeping。PotionOfReturn{Original,Home}Position 双锚不建死状态（返回腿 :37794 全树无调用方,渲染/地图图标专用——登记）。
2. **AFK 计数链**：stepAfkCounter 纯函数=P.cs:25692-25701 1:1（IsConsideredStandingStill 六门+kite 豁免）挂 Player.fixedUpdate 尾；Select 族清零接 Game 键位段(Digit/Hotbar±)；阈值常量 AFK_TIME_NEEDED_FOR_NO_WORM_SPAWNS=300(:971)；VanillaSpawner.noGroundWorms 注入(trySpawnEnemy 每周期快照)→setFlagsForChosenTile 头 `!skyMob→noWorms`(NPC.cs:1052-1053)+影子蜡烛三连清(:420-425)。afkCounterForKiting/auto-kite 未建模随风筝系统另批（登记）。
3. **GRAB_RANGE 一行改造**（B④ 勾销，见上）：帧扫描快照升级四旗输入 grabRangeBonusFor(ctx,vid)，legacy grab/heart/star 字段保留兼容。
4. **护士经济簇**：
   - 排除表实装：NURSE_CANNOT_REMOVE_VANILLA=BuffID.cs:32 全表 20 id；debuffCount/clearDebuffs 反查过滤（Main.cs:40758 计价门/:40832 清除门同式）。
   - Dazed(160)/OgreSpit(197) 玩家侧入档：DEBUFFS+BUFF_DEFS(descKey 用原版键)+strongestMoveSpeedDebuff ×1/3 折算+OgreSpit 地面 vx/=2(:26133-26135)+Dazed 跳高 ÷5/跳速 ÷2(:19762-19766)。生产位标注：OgreSpit←DD2 巨魔喷吐团 Death 近身 900t(P.cs:74093-74099,Ogre AI 未实装);Dazed←美杜莎之首 PvP StatusPlayer 面(NPC 侧全树无对玩家 AddBuff(160))。
   - 折扣链确认在位且销陈旧账：vanilla-accfx "854"/"3035" discount:1 → equipStats.discount → nurseHealCost/shop 三价链已消费——旧「discountAvailable 恒 false」注为过期登记（P.discountEquipped :15085/:15107/:15107 区→:25833 discountAvailable=discountEquipped 同构）。
   - ★顺手修正：nurseHealCost/nurseHeal 的 debuffCount 门参数 60【秒】→1【秒】——active 存秒而原版门是 buffTime>60【tick】,旧传参把计价门槛抬 60 倍（中毒 30s 内护士漏计价）。
5. **pendingItemReuse / UsingOrReusingItem**：P.pendingItemReuse 写真位=updateSwingHits 归零拍（autoReuse∪autoReuseGlove+mouseHeld+reuseDelay==0 门,:43148 与 AutoReuseLogic :53523/TryAllowingItemReuse :53542 合成）→updateUse 头复位(:42921)；usingOrReusingItem() 聚合接入 SmartSelect canChangeImmediately(:415 CanChangeSelectedItemImmediately)。reuseDelay 并窗与 channel 无全局旗两处同型映射偏差备案于方法头。
6. **开关 UI 最小可行版**（builderAccStatus[2]/[3]）：options.builderAutoActuatorDisabled/builderAutoPaintDisabled（缺省 false=status 0 启用）+Settings 'game' 页 toggle 行（文案用原版 GameUI.ActuationDeviceOn/Off、PaintSprayerOn/Off）+tryPlace 自动致动/自动上漆两段 gate 消费（:40952/:40018 位）。Ruler[0]/MechanicalRuler[1]/WireMode[8]/BlockReplace[10]/TorchSwap[11] 五钮对应系统未建模维持登记（原版可见性本身被 InfoAcc/Ruler 装备门约束）。
7. **十周年世界门勾销**：buildTravelStock 十周年臂早已在位（seedFlags.tenthAnniversary→num+1/+2），消其头注「未实装」陈旧声明并加同种子对拍锁。
8. **HasLockedInventory 读取面**：hasLockedInventory()=quickStackLockTicks>0（QUICK_STACK_LOCK_TICKS=12 演示窗≡P.IsStackingItems inventoryChestStack 窗,PendingInventoryActions 源本仓无光标手持槽≡恒空）;quickStackAllChests 入口静默拒绝重入(:22905)。
9. **AI_036 定谳与单核收编**：日曜反击 608 非 aiStyle36（SetDefaults aiStyle=117+出生即 Kill,AI 不运行;反击伤害全部由 Kill 的 penetrate=-1 重置+Damage() 160×160 AoE+音尘承担）——仓内既有的「同参 AoE 一次结算」实现成立,登记改判定语;蜂蜜斗篷反击蜂/蜂箭 469 放蜂/beenade 弹幕拨发三生产端均落 Arrow bee36 单一追踪内核（曼哈顿 800 最短+CanHit 全盒+逐轴步进）,参数表抽导出 AI_STYLE36_TRACK_PARAMS 金标直测。

**B 批·勘误销账**：Game.ts 多处登记为陈旧注而非真缺口（4870 床近似、608 直伤近似、折扣恒 false、旅商十周年、Arrow:2619 直线漂移）——本次以代码事实+测试锁定回填。

**C 批·维持不动**：CTF 旗物引擎级缺口、坐骑本体/宠物 chatter/bartenderQuestLog 持久化/bank 数组语义等登记位与本批无关保持;旅程支拾取 +240(difficulty==3 创意权限)继续登记。

**测试**：`tests/finalzero-game-domain.test.ts` 36 断言全绿(A×3/B×12/C×9/D×3/E×3/F×2/G×2/H×2;B 骨架含 spawn 面三态)；drop-scan-ctx/spawn 家族(74)/player+chest+craft+housing+crafting+luck 家族全绿;tsc 触碰文件域零错。恶魔之心 extraAccessory 三红=并行会话 Inventory.ts 在途重排所致非本批产物。

---
## 🔴2026-09-02 新登记·神圣种子链收尾核验＋AssortedThings 剩余分支两缺口

**①神圣种子叠块 BUG 终核（用户实报 2026-09-01，本日复核闭账）**：根因=转化门 false 回落通用铺块链；修=族内物品无论成败终止通用链（Game.tryPlace :17799 起）。复核=assortedPlaceOk 与 Terarria1457 PlaceThing_Tiles_BlockPlacementForAssortedThings（Player.cs:41356-41445）逐支比对一致（种子族 nactive() 门/staff 无门/case2|109→type0）；GRASS_CONVERT_SHEETS 单源迁 PlantRules 并以测试锁定全集九员；tests/assorted-place-gate.test.ts 6 断言绿。✅ **E2E 实机探针终裁**（scripts/_hallowed-seed-e2e.mjs,真实 UI 授予链 giveItem(internalIdOfVid(369))→vi_369_HallowedSeeds；tryPlace 点泥土[2003,260]=dirt→v_109_hallowed_grass_block(sheet109)+堆叠3→2消耗；点空格/草块(sheet2)=零动作零消耗——圣种原版只吃 type0 泥土(assortedPlaceOk case2|109),对既有草地无动作系原版本相）。用户报障行为日志实测使用键全程为 place_v_109_hallowed_grass_block（面板方块=设计走通用铺放,非种子）。树妖商店在售确认：vanilla-shopstock.json shops[20] {id:369,price:2000,cond:hardMode}。

**②🔴 GAP-A·tileMoss 苔藓族转化缺失**（AssortedThings moss 分支，Player.cs「else if (createTile>=0 && Main.tileMoss[createTile])」nactive()∧(type1|type38)→canPlace）：物品 4349-4354/4377/4378/4389/5127/5128（tileMoss={179,180,181,182,183,381,534,536,539,625,627}）现走通用链——点石头只能吃替换镐门，原版语义=免费石(1)/灰砖(38)原位转化苔藓＋空格照常铺设【双模】。派子代理清偿。

　✅**清偿（2026-09-01，附登记勘误）**：根因=族内物品落通用铺块链（替换镐门+空格铺设），原版走专用转化路。★【双模】系误读已勘误——AssortedThings else-if 链互斥（Player.cs:41356-41445），moss 支对空格【不置 canPlace】⇒ PlaceIt 不运行 ⇒ 不存在"空格回落普通铺设"；外门 :40058 的 `|| Main.tileMoss[tileToCreate]` 只是把活跃目标放进 TryPlacing 门口（227/moss 无 TileObjectData=CustomPlace 恒 false：Terraria.ObjectData addTile() 无 moss 档实证）；官方 wiki 同口径"Collected moss can be placed on Stone Blocks and Gray Bricks"。实装=PlantRules.MOSS_CONVERT_SHEETS+MOSS_TO_BRICK_SHEET+mossPlaceOk 纯函数、Game.tryMossConvert（tryPlace 草族路由前,族内无论成败终止；石(1)→原样、灰砖(38)→苔砖变体=PlaceTile :59902-59912 num 重写表镜像；ResetsHalfBrickPlacementAttempt TileID.cs:181 清半砖,油漆/坡面按 active→active 存活;recLog cause:'moss'）；place_v_* 苔块面板伪物品仍走通用链。证据链：AssortedThings :41377 / PlaceThing_Tiles_TryPlacing :40086 / PlaceIt :40426/:40451 / PlaceTile :59864/:59902。测试 tests/moss-place.test.ts 7 断言绿。

**③🔴 GAP-B·tile 227 染料植物族链路未审计**（AssortedThings `createTile==227 → canPlace=true` 无条件分支；物品 1107-1112/3385-3388＝v_227_dye_plants framed 装饰）：需按原版链路（无条件门＋其后 PlaceTile 规则面）定谳与本仓通用链终态是否等价；等价则勘误销账、不等价则实装。
　✅**定谳=不等价，已实装差异面（2026-09-01）**：物品面实为 **12 件**（1107-1112 style0-5＋**1114 血橙根 style7 吊顶档**〔Item.cs:13728-13741〕＋3385-3388 异奇株 style8-11；GAP 登记漏 1114）。三点不等价逐一修复：①3385-3388 `placeStyle=type-3385+8` 共享算式提取面缺失 → 全落 style0——items.ts PLACE_STYLE_BACKFILL_1458 补四条；②放置帧 stride：通用 framedCellFrame default=style*18，原版 PlaceDye=**frameX=34*style**（cs:54489；CheckDye cs:54260 fx/34 反推同式）——Game.tryDyePlantPlace 专用路由直写 34*style；③环境门：TryPlacing 显式把 227 从 TileObjectData 满分制排除（Player.cs:40086 `&& !=227`）走 legacy（AssortedThings 无条件支 :41403 → PlaceTile case227 :60533 → **PlaceDye cs:54451-54502**：0/1/2 干地立地、3/4 地表须无背景墙、5 仅满水非岩浆/蜂蜜/微光、6 仙人掌寄生、7 吊顶锚、8-11 立地无视液墙；失败静默不消耗）——dyePlaceOk 纯函数镜像于 PlantRules（入参预读表）。支撑存活侧 'dyeplant' 失撑链原有实现核对一致（CheckDye :54257）。连带补：破坏/失撑掉落 GetItemDrop case227（:65563 num=fx/34,8-11 覆写 3385+n-8；生成期 6/7 两档照抄算式产物掉占位物 1113/1114）入 vanillaStyleDrops（styleFromFrame[227]+DyePlants 表）。证据链：:40058/:40086/:41403/:60533/:54451/:54257/:65563/:72000（MossConversion 同源反查 179↔512 全对齐）。测试 tests/dye-plant-place.test.ts 11 断言绿（含 12 件 placeStyle 终值与掉落带矩阵）。

处置人：子代理（单一所有者串行，防 PlantRules/Game 编辑面冲突）。

---
## ✅2026-09-02 类问题专项 review（用户令"review一遍避免又类问题"）

本轮事故类=①浏览器无 process 裸引用②搜索→授予映射歧义③"内部 id 0 撞失败哨兵"。逐类终扫与加固：

**①裸 process 全仓闭包终扫**：save.worker/asset-warm.worker/worldGen.worker 三 worker 链共 542 模块闭包追踪，现存零裸引用（StructuresPass:18/LivingTreePass:49 均为注释或已守卫 ternary）。结构兜底扩面：procShim 首导入补进 save.worker.ts 与 net/asset-warm.worker.ts（worldGen.worker+main.ts 已挂）；三 HTML 入口核对（index/debug-line→main.ts 已护；npc-box-editor 纯内联无 gen 链）。附带修复：worldGen.worker 错误回传透传 cause 栈（generateWorld 槽包装 Error 吃栈,定位曾只能看到包装点）。

**②授予链全量映射锁**：新增 tests/journey-grant-mapping.test.ts——VANILLA_ITEM_KEY_BY_ID 全量 vid→def 保真（Pascal/snake 别名设计下锁 vi_vid 同一性非字符串全等）、place_v_* vid 空间(PRIV_ITEM_STABLE)不撞原版、种子族九员 meta↔路由判定桥接一致。

**③哨兵 0 撞合法 def 位实锤三处清偿**（review 过程中炸出的真雷，与神圣种子同型：搜得到拿不到）：ITEM_DEFS[0]=vi_109_mana_crystal（注册序首位）⇒ 任何以 0 为「不存在」哨兵的 vid→id 解析器都会把魔力水晶整条吞掉：
- src/net/leashedSync.internalIdOfVid 哨兵 -1（消费侧 Game.ts:2395/:2407 `<=0` 门天然兼容）；
- src/ui/JourneyPowersUI.ts:721 `!internalId` → `<0`（旅行浏览器 mousedown 曾使 vid109 无法复制）；
- src/data/itemMigration.viIdOfRetired 哨兵 -1 + remap 门 `>0`→`>=0`（读档漏斗同型漏项）。
回归锁定：journey-grant-mapping 显式钉 vid109→def0 位；leashed-net-sync 旧契约断言随变更更新。
测试：journey-grant-mapping(4)+leashed-net-sync(23)+item-retirement/item-dedupe/cage-placement/furniture-items 等 9 文件 105 断言绿；触碰文件 tsc 零错。

---
## ✅2026-09-02 第二轮·用户复测仍"叠方块"→ 真凶=tileName 物品名劫持（同名撞车）

**证据**：新行为日志（13-16-26Z,21:16）21 条 use 仍全为 place_v_109_hallowed_grass_block、零 vi_369（use 每点击必录,含无效点击）⇒ 窗口内从未选中真种子。用户在搜索里点"神圣种子"拿到的却是块——根因：`Lang.tileName` 旧序①号分支「放置该 tile 的物品名」优先,sheet109 唯一放置者=vid369 ⇒ 面板方块 place_v_109 的显示名也被解析成「神圣种子」（zh MapObject 无 HallowedGrass 键,但 zh id-map ③级本有正确「神圣草」被劫持遮蔽）。

**修复**：
1. **Lang.tileName 优先级反转**（Lang.ts）：MapObject 族名 → zh/en id-map 方块名 → 物品反查仅作末位兜底。原版地图/UI 语义=方块名;家具族 zh 仍经物品兜底命中（zh id-map 无家具条目,零行为回归,tile-names 7 断言绿含新增撞名回归位）。
2. **授予热栏落位**（Inventory.add 新 preferHotbar 入参 + giveItem 接线）：旧④空槽降序=热栏满时新授物坠背包尾,玩家手里仍是旧物继续点地（两轮日志共同实证）。新序=选中空槽→热栏 0..9→原策略。原版"复制到手/光标"的最近可用近似（本仓无光标槽）。
测试：journey-grant-mapping 6（新增热栏落位 2 例）/tile-names 7（culture 激活修正+撞名回归位）/家族 10 文件全绿;tsc 触碰零错。
**配套**：用户侧须重跑 build+preview（4173 实例 21:14 构建=本批之前）并强刷（SW 资产缓存）。

---
## ✅2026-09-02 第三轮·用户复测(14-17-15Z 日志)→ 真种子不在池内=研究门规则；用户拍板面板=开发者模式

**证据**：第三份日志 9 条 use 仍全为 place_v_109。实机面板复现（scripts/_search-panel-probe.mjs）：全新世界复制面板搜「神圣种子/神圣/Hallowed」全 0 件——复制列表源集=ForEachItemWithResearchProgress（ItemsSacrificedUnlocksTracker :48-57，只列已捐物品，原版规则）；用户池内唯一的圣域条目=曾捐过的面板方块(vid 10171,彼时显示名还撞「神圣种子」)，真种子 vi_369 从未入池 ⇒ 永不可得。

**用户拍板（产品例外）**：原版纪律不动（世界内获取 1:1），但**复制面板=开发者模式**——应含全部道具物品、可搜可取、不受研究门约束。

**实装**：
1. JourneyPowersUI sourceVids：`research.resolvedIdsWithProgress()` → 全量原版 vid 空间（VANILLA_ITEM_KEY_BY_ID 全键,6175 件）；研究进度保留为 partial 暗槽徽标展示。
2. makeCell：mousedown 授予解除 `if (fully)` 门（配合全量池;partial 槽同样可取）。
3. （承上轮）热栏落位 preferHotbar + tileName 反转已在本轮生效。
**终验（真实 UI 探针）**：搜「神圣种子」=唯一命中「神圣种子(0/25)」partial 格；mousedown → 热栏槽 3 落 `vi_369_HallowedSeeds`；搜「神圣草」命中墙物品（面板块不在原版 vid 空间,同名撞车根除）。测试：journey-grant-mapping 7（新增全量池+唯一命中钉）/journey-browser 38/tile-names 7/leashed-net-sync 23 全绿;tsc 触碰零错。

---
## ✅2026-09-02 第四轮·用户截图定面板=背包道具搜索器（UI.ts）→ 覆盖去重误杀种子族

**用户澄清**：面板=背包界「道具搜索（点击加入背包）」（UI.ts openItemSearchPanel,前几轮改的旅行面板=改错路径但顺手修对了另一面）。截图搜「神圣」列表无任何种子。

**真凶（第三案）**：面板条目构建的 place_v 覆盖去重（"惰性 vi_ 死条目"过滤）按 createTile 判——圣种 vid369 createTile=109 被 place_v_109 覆盖 ⇒ **整族误杀**：草种/腐化/猩红/丛林/蘑菇/灰烬种+圣种(7 vid)+再生法杖/斧(213/5295)+苔藓族(11 vid)全部从搜索消失。该去重本意只滤「唯一职能=铺那格」的死条目,没料到 AssortedThings 转化功能件。

**修复**：判据抽纯函数 `PlantRules.isFunctionalTileItem(ct)`=GRASS∪MOSS 转化面；UI.ts 过滤行接入——功能件豁免、纯铺块死条目照旧滤除。
**终验（真实面板探针 scripts/_invsearch-probe.mjs）**：搜「神圣种子」=唯一行 `vi_369_HallowedSeeds`→点击→热栏落位。测试：journey-grant-mapping 8（新增豁免钉+对照死条目）等 5 文件 39 断言绿;tsc 触碰零错。

---
## ✅2026-09-02 第五轮·第四份日志(15-59-24Z)=真种子已在手；"种不进草块"=原版本相（引擎实机终证）

**日志**：35 条 use **全部 vi_369_HallowedSeeds**（获得面三案全清）；零 tile 产出。用户操作=点草块。

**实机终证（scripts/_realclick-seed.mjs,真实输入层直驱）**：手持圣种点【泥土】=原位转 sheet109+堆叠扣 1（mouseDown→updateUse→place 分支→tryGrassConvert 全链通）；点【草块】=无动作不扣。前一轮探针"真点无反应"系合成 DOM 事件未进输入层的探针伪象,非产品 bug（结论以输入层直驱版为准）。

**原版依据（1457 Player.cs:41372-41377 AssortedThings 种子支）**：`nactive() && type == 0`——圣种/草种**只吃裸露泥土**；点已有草块(type2)不动作是原版行为。已有草地→圣域的转化职能属环境改造枪/圣水（TileID.Sets.Conversion 族），或圣草自然蔓延（WorldEvolution 已移植）。用户消耗只在转化成功后发生=与原版 ApplyItemTime 位一致（35 击零耗正确）。
---
## ✅2026-09-07 SW-BJ13·召唤物碰撞盒与贴图错位（用户实报+F3 截图）→ 34788 专绘支家族清偿 + 33703 中心锚家族登记移交

**实报**：黏土蓓蕾法杖(6161)召唤物 1118「F3 盒 14×22 在左上、精灵画在盒右下、走一步陷一步」（原版正常地面行走）。

**定谳（证据阶梯①源码锚）**：1118=原版 1.4.5 新物 ProjectileID.ClayPotMinion（SetDefaults 14×22/aiStyle67,Projectile.cs:10452-10464）。原版 draw 不走通用 num143/144 尾绘（盒左上锚,Main.cs:35567 起）,走 **Main.cs:34788-34800 专绘支**：anchor = proj.Center+(0, gfxOffY−num467)（num467=2 缺省/5=1093·1112 :34794/9=1118 :34798）、origin=(整图宽/2, 帧高/2+num151)（num151=1 仅 1022 :30079/−4 仅 1036 :30091;423 num152=−5 :30161 本支不消费=死值）。展开=帧心横居盒心、帧底=盒底+4px（步行族全支一致,「脚微陷」原版刻意）。本仓旧通用路把帧左上锚盒左上 ⇒ 偏差(ours−vanilla)：**1118 (+12,+22)**（帧 38×48/盒 14×22）、1093/1112 (+10,+14)、393-395 (+16,+8)、1022 (+11,+10)、423 (0,+4)、1036 (+3,0)。

**修复（本批清偿面=34788 支全族九型,398/450 原版同支但无本仓实体域）**：
- `MinionProj.draw` 新增 CENTER_ANCHOR_34788 专绘支（:5696 起,1:1 照录锚/origin/帧矩形/翻转/rot/alphaFade）;
- SetDefaults 真盒补注册：393-395 20×30(:4758-4759)/423 28×28(:4964-4965)/1036 18×10(:9770-9771)——构造器+minionTrueBox 双单源（此前落 16×16 缺省,湿段 K 批已登记的盒缺口本批部分收复）;
- `WeaponProj.PROJ_DRAW_OFFSET` 1022/1036/423 三项退役（表值系 :30077 switch 真值,本支原版只吃 num151——经通用路消费即错锚;T9 弩车退役同判例）。
- 回归：`tests/sw-bj13-minion-align.test.ts` 20 断言（两态同锚/帧底+4px 恒量/盒尺寸锁/翻转对称/淡入/结构锁）,判别力实证=锚行 sabotage 12/20 转红;palworld-minion-parity/minion-orientation/minionproj-ledger-aug31/minion-wet-oldfamilies/batch6-blue-fixes/minion-kb/blue-batch3-combat-parity/proj-wet-section-six 162 例全绿;tsc 触碰零错。

**登记移交（同病异支,未动刀——每型须独立定谳后落刀）**：原版 **Main.cs:33703 中心锚大支**（anchor=盒心 :33695、origin=帧心 :33787、尾绘 :34212）覆盖本仓 17 个 MinionProj 实体型,现仍走通用盒左上锚=同病：
{613,623,625,626,627,628,643,758,759,773,831,963,970,1092,1098,1119,1123}
（1094/1113 已由 DYN 表按支语义折算✓、663/665/667/677-679 专绘✓）。已预计算两例物证：钻地龟 1098/1123（帧 82×46/盒 34×34）偏差 (+24,+6);吸血蛙 758（帧 136×54/盒 20×30）偏差 (+58,+12)。折算式：num144=(bw−fw)/2、num143=fh/2−bh/2（仅适用无支内改锚者）。★963 阿比盖尔疑有第二病：原版帧=Frame(4,13) 横向网格(Main.cs:33754-33756),本仓 projFrameImg 竖条切片=整行 176px 四连帧,须先查 PROJ_GRID 缺注册再动锚。
