# 武器效果对齐专项总台账(第五批 R26–R32 收官,2026-08-25)

五批红蓝对抗+集成收编+R32 视觉终验矩阵的**单一汇总口径**。数值/行为标杆=
`Terarria1457/`(1458 增量面以 `Terarria1458/` 为准,本专项全程 SetDefaults 数值面
零变更);用户硬要求「视觉必须成立,不停留于公式」由 R27 起每批浏览器探针自证兑现,
R32 以统一矩阵做收官终验。

## 0. 批次索引

| 轮次 | 报告 | 覆盖面 | 探针 |
|---|---|---|---|
| R26 红/蓝 | /tmp/recon/red-team-r26.md · blue-team-r26.md | 管线审计:多发/单扣魔、音库单实例、Item_1 轮换、reuseDelay 32 件、slowMagic 框架 | scripts/_r26-pipeline-probe.mjs |
| R27 红/蓝 | red-team-r27.md · blue-team-r27.md | 魔法前期(宝石杖族/Water Bolt/Demon Scythe/Crystal Storm/Vilethorn/Rainbow Rod/Golden Shower/Aqua) | scripts/_r27-fx-probe.mjs |
| R28 红/蓝 | red-team-r28.md · blue-team-r28.md | 魔法中期(Shadowbeam/Inferno Fork/Toxic Flask/Blizzard/Razorpine/Medusa Head/Nebula 系) | scripts/_r28-fx-probe.mjs |
| R29 红/蓝 | red-team-r29.md · blue-team-r29.md | 远程(Tsunami/Phantasm/Tactical/Onyx/Clockwork/弹药分型视觉/星星炮行为面) | scripts/_r29-fx-probe.mjs |
| R30/R31 红 + 蓝合并批 | red-team-r30.md · red-team-r31.md · blue-team-r30r31.md | 近战投掷四族(回旋镖/链枷/矛/悠悠球)+召唤鞭+哨兵模型 | scripts/_r30r31-probe.mjs |
| 批5 集成收编 | blue-team-batch5-integration.md | 哨兵放置接线/回旋镖出手点/链枷多球门/strongBees/矛伴生弹/reuseDelay·channel 列核实 | scripts/_batch5-probe.mjs |
| **R32 终验** | /tmp/recon/red-team-r32.md | **五族 28 把统一视觉终验矩阵(本台账 §2)** | **scripts/_r32-matrix.mjs(保留复跑)** |

## 1. 各族状态总表

图例:✅ 已对齐(探针/vitest 双证或单证+原版行号) · ◐ 近似备案(语义等价,像素级/边角待对拍) · ⛔ 待办(登记未修)。

### 1.1 魔法前期(R27 批)
| 武器 | 状态 | 要点 |
|---|---|---|
| 宝石杖族 739-744/3377 | ✅ | rotation=ToRotation()+飞行彩尘 d86 族+Kill 迸碎;辉光十字脉冲 ◐(§4-E2) |
| Crystal Storm 518→94 | ✅ | 出速散布 ±1.6 带+撞块 Shatter×0.35;Item_9 白名单叠响=真态 |
| Water Bolt 165→27 | ✅ | 五点错位 d172 拖尾(≥4.5 枚/帧)+像素差分 ~11k px+1800 寿命隐形 |
| Demon Scythe 272→45 | ✅ | 0.2 起点 ×1.06ⁿ 加速带 11.82+aiCnt≥100 冻结;GetAlpha 全亮 ◐(§4-E1) |
| Vilethorn/Nettle 64/788→7/8 | ✅ | 链段状态机(thornStep)+渐显静止+152 尾端+出生 Item_8;'tink' 错音抑制 |
| Rainbow Rod 495→79 | ✅ | **1458 变更面**(AI_009 :44390 type79 门):d66 每拍+Item_9 十拍循环+Kill 128px AoE+d267 尾迹迸散 |
| Aqua Scepter 157→22 | ✅ | 弧线+~34 帧收缩消亡+单击一窗三发(flag4 门,真值 t=0/8/16——R26"两发"粗算勘误);熔岩反弹 ◐(§4-E3) |
| Golden Shower 1336→280 | ✅ | 一窗四连发(+补间帧窗 19)+附着池 Item_17+隐形弹体尘流 |

### 1.2 魔法中期(R28 批)
| 武器 | 状态 | 要点 |
|---|---|---|
| Shadowbeam Staff 1444→294 | ✅ | 隐形弹体(alpha255)+无限墙反弹(主轴反射近似 ◐)+撞块铺束 d173+EU100 |
| Inferno Fork 1445→295/296 | ✅ | 尘焰包裹+Kill 火柱 150×150(dmg×0.75/~135t)+发射双音 Item20+74 |
| Toxic Flask 3105→510-513 | ✅ | aiStyle92 毒云 20-30 片滞留+idStatic 组共享免疫 10t+爆音 Item_107 |
| Blizzard Staff 1931→337 | ✅ | 天顶双锥(玩家上方 600px 出生线−100i)+动态穿墙门+恒向下落+Kill Item_27 |
| Razorpine 1930→336 | ✅ | 梯次扇 2-4+延迟重力档(AI1_NO_DROP 摘除) |
| Medusa Head 3269→535 | ✅ | channel 挂首+per-volley 计费闭环(MEDUSA_REFUND_LEGACY=false 路径)+GetSlowMagicScalar 拉长;536 束绘制几何两说 ◐(§4-E5) |
| Nebula Blaze 3542→634/635 | ✅ | 20% 强发 ×3/速 −1+Kill 50×50 AoE+散射首帧补掷;出手音 Item_20 |
| Spirit Flame/Arcanum/Lunar Flare 等 | ✅ | 死亡 AoE 二次结算模板三实例;lineY 符号精修 |

### 1.3 远程(R29 批)
| 武器 | 状态 | 要点 |
|---|---|---|
| Tsunami 2624→1 | ✅ | 海啸扇 3-5 箭(探针实测 [5,5,5] 带) |
| Phantasm 3540→630/631 | ✅ | 载体+加速窗 gap 24→22→20→18(ai0 40/80/120 三档)+每轮 4 箭 ±15 散布+命中侧 3×631 补刀+省弹 1/3;**载体绘制 ◐(§4-E4)** |
| Tactical Shotgun 679→14 | ✅ | 单击 6 弹丸+±40×0.05 散角带(SHOTGUN_PELLETS 表) |
| Onyx Blaster 3788→14/661 | ✅ | 4 弹片+黑爆显形链(scale1.3/alpha−55)+二段 AoE 160px Resize+Item_14+d62/d240 配比 |
| Clockwork AR 434→14 | ✅ | tap 三连发错峰(t≈1/4/8,增益递减档)+冷却=动画12+rd14 |
| Star Cannon 197/4060→955/728 | ✅ | 已注册即活;955 闪烁带 alpha 0↔200+开炮音 Item_9+耗坠落星;PROJ_SPIN 自旋(红队 0.3 系数驳正) |
| 血雨弓 4381/骷髅弓 4058 | ✅ | resolveBowProjOverride 换体链(4381→819 无条件;4058+骨箭 474→117) |
| Quad-Barrel 4703 | ✅ | 8 弹丸角向扇(max ≈33-35°,理论上限 atan(5/9)) |
| 弹药分型视觉 | ✅ | AMMO_TRAILS 六型(41/91/120/225/282/819)+BULLET_KILL_SFX 撞块音集 24 型 |

### 1.4 近战投掷(R30 批)
| 武器 | 状态 | 要点 |
|---|---|---|
| 回旋镖族(52/113/55/191/119…) | ✅ | 出手点收口(placeAtShootSpawn 盒心=玩家中心,batch5 探针 <0.01px);木/冰无尘=正确防过度实现 |
| 链枷族(163 Blue Moon/220 Sunfury…) | ✅ | 同型多球门放宽(st≥1 掷出态放行双球同场);尘粒 VanillaDust 化(d172/d6 scale3);FLAIL_PARAMS 注释勘误(FlowerPow≠Flairon) |
| 矛族(Dark Lance 274→46/Gungnir 550…) | ✅ | playerImmune 10t 全局复击窗(hits=3 时序直证)+SPEAR_DUST 表驱动 {46:d14+d27,…}+伴生弹链(756→131 七连孢子/4061→732 单气旋 v×4) |
| 悠悠球族(Valor 3317→564/Cascade 3282…) | ✅ | PROJ_SCALE 小表(564:1.075/563:1.05)+持握存活;配件注册随自动循环点亮(yoyo-bag 直测) |
| Chain Guillotines 3012→481 | ✅ | aiStyle13 锚定族专支(非 aiStyle15):行程 >450px 回收近手消亡(实测 522px) |

### 1.5 召唤鞭(R31 批)
| 武器 | 状态 | 要点 |
|---|---|---|
| 小鬼杖 Imp Staff 2365→375 | ✅ | 召唤音 Item_77+驻场识别色待机尘(375 d6 1/7;407 d217 1/5,R31 §A⑥ 消账)+跟随 |
| 彩虹水晶杖 3571→643 | ✅ | 悬浮哨兵免扫描直放鼠标行(drift=0)+volley cd=26(一行止血;hsl 粒子节拍 median=26 实测) |
| 哨兵放置模型 | ✅ | pickSentryLandingSpot 落地三列扫描(1572/2366/5119)+悬浮三件(3571/3569/5463)+vy15 下坠入场 |
| aiStyle53 出生尘爆 | ✅ | 308 80×d185/377 40×d171/966 30×d219+Item46 音一次性门 |
| 鞭拖尾 WHIP_TRAIL_DUST | ✅ | 17 支数据表全接(Snapthorn 4913→914/Morning Star 4679→848 d172 实测) |
| MINION_SUMMON_SFX 收口 | ✅ | OOA 十二塔条目删除(item 侧 usesound 真值播放) |
| 644 晶片实体化+642 月门扫摆 | ⛔ | 见 §4-R12(cd26 止血已落,实体化另批) |

### 1.6 管线级(R26 批,跨族)
| 机制 | 状态 | 要点 |
|---|---|---|
| 多发/单扣魔 | ✅ | sprayCyclePlan:flag4=itemAnimation>0 && ItemTimeIsZero+useSwing +1 补间帧门(reuseDelay==0 子句)+窗内续发免扣魔+尾停发 gate;Golden Shower 四连发实证 |
| 音库打断语义 | ✅ | Stop-then-play 单实例槽(marks 序列直证);Item_9 白名单自由叠响;Item_1 三变体 Next(3) 随机轮换 |
| slowMagic 三通道 | ✅ | getSlowMagicUseTime ×2.5/getSlowMagicScalar 数值档/spaceGun(123/124/125)回蓝豁免;空蓝 swing.dur 不拉长登记(§4-R17) |
| reuseDelay | ✅ | REUSE_DELAY_TICKS 静态表 32 件(召唤杖27+Vilethorn434+Medusa/Fury/Prism)与 golden 表双向 1:1 对账闸;消费端维持静态表不切读表(golden json 不入包裁定) |
| useSound 数据驱动 | ✅ | vanilla-itemusesound.json 968 件;'tink' fallback 抑制集 {64,788,1931,3269} |

## 2. R32 终验矩阵结果(2026-08-25)

探针 `scripts/_r32-matrix.mjs`(私有实例 SW_PORT=5222,SW_NO_HMR=1;经 run-diag 运行,
R32_FAMILY 分族/R32_ONLY 单把参数化)。断言维度:出膛弹数与类型/关键 dust 类型/
playSfxFiles(+playSfxFile 使用音路径)序列/canvas 像素差分/几何锚点。截图 28 张存
/tmp/recon/r32-shots/<weapon>.png。

**终验通过率:28/28 把全 PASS(逐把断言 62 条全绿)。**

| # | 族 | 武器(vid→弹) | 断言要点 → 实测 | 结果 |
|---|---|---|---|---|
| 1 | 魔法前期 | Amethyst Staff 739→121 | rotate==速度向角 5/5 轮;d86 彩尘 6-7 | PASS |
| 2 | | Crystal Storm 518→94 | 按住一窗 7 发;出速极差>0 且 ≤3.2([14.48..16.73]) | PASS |
| 3 | | Water Bolt 165→27 | 寿命 1774+alpha255 隐形;d172 7.46/帧;像素差分 13895px | PASS |
| 4 | | Demon Scythe 272→45 | vAt29=0.212<0.25;peak=11.82∈带;冻结(vEnd=peak) | PASS |
| 5 | | Vilethorn 64→7/8 | chainMax=7;Item_8 出生音 | PASS |
| 6 | | Rainbow Rod 495→79(channel) | d66=48/35f;Item_9 循环 5 次;Kill Item_10+b66=15+t267=18 | PASS |
| 7 | | Aqua Scepter 157→22 | 一窗三发 ticks=[1,8,16](flag4 真值) | PASS |
| 8 | 魔法中期 | Shadowbeam 1444→294 | 首目击 alpha=255 隐形;d173=1752;任一实体 vx 翻号=1 | PASS |
| 9 | | Inferno Fork 1445→295/296 | 火柱 150×150;Item_74 双音 | PASS |
| 10 | | Toxic Flask 3105→510+云 | 云 24 片 pids={511,512,513};Item_107 | PASS |
| 11 | | Blizzard Staff 1931→337 | 一窗 7 发;天顶带触达玩家上方 ≥550px;恒向下落 | PASS |
| 12 | | Medusa Head 3269→535 | channel 多 volley:240t 内 32 发 | PASS |
| 13 | | Nebula Blaze 3542→634 | 出膛 1;出手音 Item_20 | PASS |
| 14 | 远程 | Tsunami 2624→1 | 三波扇 [5,5,5] ⊂ 3-5 带 | PASS |
| 15 | | Phantasm 3540→630/631 | 载体在场;gaps=[24,22,22,20,20,18…] 单调至 18;batches 全 4 | PASS |
| 16 | | Tactical Shotgun 679→14 | count=6;spread=0.329rad | PASS |
| 17 | | Onyx Blaster 3788→14/661 | shards=4+bolt=1;Item_14;d62=76 | PASS |
| 18 | | Clockwork AR 434→14 | tap 3 发 t=[1,4,8];cd=26 | PASS |
| 19 | | Star Cannon 197→955 | 出膛 1;Item_9 开炮音;坠星弹药 999→998 | PASS |
| 20 | 近战投掷 | Wooden Boomerang 284→52 | 出膛;返回近手 minDist=12px | PASS |
| 21 | | Blue Moon 163→26 | 出膛;松手掷出态 aiState=2 | PASS |
| 22 | | Dark Lance 274→46 | 矛出膛;d14=5+d27=42 双粒齐现 | PASS |
| 23 | | Valor 3317→564 | 出膛;持握期存活 60/60 拍 | PASS |
| 24 | | Chain Guillotines 3012→481 | 出膛;锚定行程 maxDist=522px | PASS |
| 25 | 召唤鞭 | Imp Staff 2365→375 | 召唤成功;60t 存活 dist≈128px;Item_77 | PASS |
| 26 | | Rainbow Crystal 3571→643 | posMatch 落地扫描;drift=0 恒悬浮;hsl 节拍 median=26 | PASS |
| 27 | | Snapthorn 4913→914 | 鞭体出膛;拖尾尘 types 含 39 | PASS |
| 28 | | Morning Star 4679→848 | 鞭体出膛;d172=10 | PASS |

### 2.1 R32 当场处置记录

**实现侧修复:零**——28 把全部通过,本轮未改动任何 src 文件(esbuild/vitest 面
天然保持绿;npc-frame-golden 复跑 4/4 绿佐证)。全部失败项经查均为**探针装置问题**
(纪律要求"先查装置再定罪"的直接兑现),修正清单:

| 装置缺陷 | 影响 | 修正 |
|---|---|---|
| clickOnce 漏清 mouseHeld 电平 | autoReuse 武器"单击"后续发(aqua 实测 5 发) | 松开双电平=真单击语义 |
| channel 武器用单击驱动 | Rainbow Rod 松手即断链(飞行尘/循环音全灭) | 持按驱动(pump 中 held=true) |
| playSfxFiles 单钩 | **使用音走 playSfxFile(单数)路径全漏采**(Nebula Blaze Item_20 假阴) | 双钩并采 |
| 无头引擎追帧累加器超驱子步(~100×/拍) | 时序类断言方差:弹体数 tick 走完一生(Shadowbeam 假阳)/暴雪雪片首拍已下坠数百 px/Demon Scythe 冻结窗撞墙 | 口径改聚合观测:任一实体翻号/首次目击采样/最高触达带/冻结容差 5e-3/重按加固 ≤3 次 |
| Phantasm 观测窗 130t 太短 | gap18(≥120t 档)不可达 | 延至 235t(R29 口径) |
| rainbowCrystal 无靶敌怪 | 哨兵不开火(bursts=0) | 补高血假人+hsl 粒子确定性节拍信号(命中随机落点不影响计数) |
| Snapthorn 鞭体 pid 误记 847 | 847=Durendal | 按 vanilla-whips.json 真值 914 |

**勘误一条**:R26/R27 报告"Aqua Scepter 两发"系未计 +1 补间帧的粗算;原版真值
(Item.cs:3253 ut8/ua16/autoReuse + Player.cs flag4 门)为**单击一窗三发 t≈0/8/16**,
我方实现正确,矩阵按真值断言。

### 2.2 插队案(Golem 部件,降级保留项)
- **帧数案结案**:所谓"247 json=1 vs 原版 6"不成立——三棵反编译树(1456/1457/1458)
  `Main.npcFrameCount[245..249]`=7/6/**1**/1/2 完全一致且与 src/data/vanillaNpcs 相等;
  npc-frame-golden 四层闸门复跑 4/4 绿。协调方正则位置提取错位,无漂移、闸门无失效。
- **部件在位性最小检查 PASS**:`spawnVanillaEnemy(245)` 后 130 帧,245 本体+246/247
  双拳+248 头部稳定在场(ids 时间线 t29..t129 恒定),拳锚点相对本体 247:(−84,−9)、
  246:(−3,−57),截图 /tmp/recon/r32-shots/golem-245.png。深挖像素取证按降级指示不做。
  附注:锚点几何(一拳在正上方偏左)与原版肩部对称悬挂的直觉不符,**登记**进 Golem
  AI 行为域待办(非武器特效域,不占本专项名额)。

## 3. 系统性机制基建清单(本专项沉淀)

1. **Kill 爆模板**:`onProjectileDeath` 分档——Resize(N×N)+Damage() 二段 AoE+Item_10
   族 Kill 音+尘配比三元组,一次接入多把(Rainbow Rod 128/NebulaBlaze 50/Onyx 黑爆
   160/Inferno Fork 火柱 296/毒云 511-513/血雨 819…),新增死亡 AoE 型武器照抄骨架。
2. **multishot 泛化**:sprayCyclePlan(flag4 门+补间帧+窗内免扣魔+尾停发)+per-shot
   参数注入(支持 Clockwork 档位/Chloro 梯次/Quad-Barrel 角向扰动类特例支)。
3. **Stop-then-play 音库**:单实例槽打断语义+例外白名单(Item_9 叠响/Item_1 三变体
   轮换);useSound 数据驱动(playUseSound→playSfxFile 单数路径)。
4. **slowMagic 三通道**:getSlowMagicUseTime ×2.5(getSlowMagicUseRate 消费点
   GlacierFang 范式)/getSlowMagicScalar 数值档/spaceGun 套装回蓝豁免。
5. **WHIP_TRAIL_DUST**:17 支逐鞭拖尾三元组表,whipSwingEnvelope 包络消费。
6. **SENTRY 放置模型**:pickSentryLandingSpot 导出函数(落地三列扫描 1:1)+悬浮三件
   免扫描+vy15 下坠入场+SENTRY_SHOOT cd/volley 表+aiStyle53 出生尘爆/待机尘表。
7. **出生自校正体系**:Arrow.birthLock 兄弟弹互斥锁下的 pending 挂起(337 天顶双锥/
   316 蝙蝠散布/659 悬浮出生态/511-513 idStatic 组免疫/thornChain 自动激活)。
8. **弹药两张表+换体链**:AMMO_TRAILS 六型/BULLET_KILL_SFX 24 型;
   resolveBowProjOverride(4381→819/4058+474→117)+GUN_AMMO_SAVE 三档省弹掷 roll 口。
9. **矛伴生弹 spawnProj 回调**(仿 FlailProj 先例,Game 注入)+localAI0 计数门。
10. **strongBees(Hive Pack 3333)通道**(equipStats 位+蜂枪四点消费)。
11. **REUSE_DELAY_TICKS 静态表**与 golden 表双向 1:1 对账闸(recon-item 同源)。

## 4. 遗留登记项汇总(全部 ⛔ 登记不修,注明来源与性质)

### A. 像素级/渲染近似备案(P2,待像素对拍防过度实现红线)
- E1 Demon Scythe GetAlpha Color.White 全亮不调光(渲染管线光照叠层限制)[R27]
- E2 宝石辉光环 BiggerHitbox 十字脉冲(DrawProj :33667-33685 多层镜像)[R27]
- E3 Aqua Scepter 熔岩反弹(LCG32 种子注入面缺)[R27]
- E4 幻象 630 载体绘制(原版 DrawProj 持弓姿态朝光标旋转;现仓 drawGlobalAlpha=0
  隐形+swing 动画近似)[R29→batch5 维持]
- E5 Medusa 536 束反编译绘制几何两说并存(字面 head 镜像侧 vs 游戏实感头→目标连线,
  按实感实现)[R28]
- E6 Zapinator 出生渐显白光的加算混色 'lighter' 近似[R27]

### B. 结构性另批(R31 修法②③,cd 止血已落)
- R12 彩虹晶片 644 最小实体化(alpha−8 显形/Disco hue/PlotTileLine 拴线/死亡双圈
  d267+60×60 二次 AoE)+642 月门扫摆光束专支(aiStyle84 线碰 50t)[R31 §C③/batch5⑧]
- R13 Shadowbeam 编排器化(现本地粒子束近似;ParticleOrchestra 子系统缺位备案)[R28 §1]

### C. 数据面/工具链(提取器重跑风险故缓)
- R14 extract-itemcombat.mjs 补 reuseDelay/channel 列重跑+recon-item 闸门扩列+
  消费端 player.reuseDelay 接线(batch5⑦ 已核实列在 golden 侧齐备,src 侧行为零差异)[R30 §7/R31 §A①/batch5⑦]
- R15 R26 提取器 DefaultToWhip/DefaultToStaff 通道(whip 18 件 useTime/useSound 列 null,
  以 vanilla-whips.json+Item.cs :47811 对拍补位)[R31 附注]

### D. 行为小债(可感知度低/随注册批)
- R16 出手点发射挂点通用偏差:boomerang 已收口;magic/'shot'/'grenade' 同用 px/py
  待 Game 所有者逐 case 统一收口或统一改发射锚[R30 §4.2→blue-r30r31 落点#1]
- R17 autoReuse anim==1 截断(重臂周期 18 vs 19,持按每周期多 1t)[R26 蓝队落点]
- R18 光刃族物品侧 kb/damage ×1.25 随 phaseblade 注册批[R30 §4.3]
- R19 Space Gun 陨石套套件物品注册(检测通道先行就绪)[R27 §8]
- R20 矛伴生弹随注册生效余量:222 叶绿军刀刺/342 北极/367 黑曜剑鱼+877-879 玩家速度门尘
  [blue-r30r31 落点#8]
- R21 SENTRY53 族开火动画帧(frame 1-9 扇区动画未建模,P3 纯动画微差)[R31 §C④附]
- R22 哨兵超限驱逐等价性(timeLeft 最小杀 vs 我方插入序,P3 备案)[R31 §C④]
- R23 Game.ts:19002 蜂巢 accessoryVanillaIds(3333)扫描与 equipStats.strongBees 并存
  等价,待统一收敛[batch5⑧]
- R24 Golem 拳部锚点几何(见 §2.2 附注,归 NPC AI 行为域)[R32 插队案]

## 5. 探针资产索引(scripts/_r2x-*.mjs,全部保留复跑)

| 脚本 | 覆盖 | 运行 |
|---|---|---|
| _r26-pipeline-probe.mjs | 多发/单扣魔 mana 序列、Stop-then-play 音槽 marks、Item_1 三变体、reuseDelay 冷却(Hornet 24=22+2) | SW_ORIGIN=http://localhost:<port> node tools/run-diag.mjs scripts/_r26-pipeline-probe.mjs |
| _r27-fx-probe.mjs | Demon Scythe 加速曲线、Water Bolt d172+像素差分、宝石 rotate 钩、Rainbow Rod disco/循环音/Kill、Golden Shower 三连、Vilethorn 链段 | 同上(--timeout=180000) |
| _r28-fx-probe.mjs | Shadowbeam 束流/反弹、Inferno Fork 火柱、Blizzard 天顶双锥、Toxic Flask 毒云、Medusa volley 计费、蝙蝠多发等 | 同上 |
| _r29-fx-probe.mjs | Tactical 6 弹丸、Onyx 二段 AoE 半径带、Phantasm 加速窗 gaps、弹药拖尾六型、Quad-Barrel 扇宽、Clockwork 点射、换体链直测 | 同上(--timeout=400000) |
| _r30r31-probe.mjs | 哨兵放置(落地扫描/恒悬浮/下坠入场)、鞭拖尾三型、Dark Lance 复击时序、Chain Guillotines 行程、643 cd=26 | 同上(--timeout=420000) |
| _batch5-probe.mjs | 哨兵接线端到端、回旋镖出手点、链枷双球、strongBees 强蜂、蘑菇矛七连孢子/风暴矛气旋 | 同上 |
| **_r32-matrix.mjs** | **五族 28 把统一终验矩阵(§2 全表),R32_FAMILY=magicEarly,magicMid,ranged,meleeThrow,summonWhip / R32_ONLY=<id> 参数化;截图落 $R32_SHOTS** | SW_ORIGIN=http://localhost:5222 node tools/run-diag.mjs --timeout=600000 scripts/_r32-matrix.mjs |

## 6. 纪律备案(R32 本轮)

- 私有实例 SW_PORT=5222(SW_NO_HMR=1,SW_CACHE=/tmp/sw-vite-5222)起停自查,5199 共享
  实例与他人 52xx 未触碰;矩阵按族分批落盘(/tmp/recon/r32-matrix-results.jsonl)。
- worldgen/掷流/金标/R18/R19 零进入;json 数据文件零手改;l10n 零新键;编辑前重新 Read。
- 临时诊断脚本 _r32-dbg.mjs(294 逐拍观测+Golem 在位性两次复用)已删(删前 pgrep 确认
  无关联进程)。
