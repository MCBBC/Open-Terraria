# 恢复备案：2026-09-03 红蓝对抗收尾批（系统重启前停摆）

> 停摆时点：2026-09-03 晚，用户重启系统前主动停摆。
> 本文件 = 唯一恢复依据（红队 findings 全文在此，不依赖会话转录）。
> 恢复入口：逐支蓝队 SendMessage（agentId 续 transcript）+ 本文件核对盘上状态。

## 一、已完成并验证（勿重做）

### 本回合主批（八代理全绿落盘）
- 内联簇：TryFloatingInFluid 浮液物理+过渡拍湿阻尼+accFlipper 湿授予 / 幻彩斗篷 5355 微光豁免+controlDownHold / Enemy/TownNPC 微光衰减两 lanes / quickBuff 槽上限 44 / beachDistance=380 / 平移切换音 / value1456 定性 / orchestraFx 编译修复 / spawn-parity-l6 旧测试重产 / Arrow critChance `??`（修 514 钉死失效）/ blue-r3 窗口扩
- A 哨兵携带全链 / B 渲染三清 / C 弹体四清 / D 刷怪存档四清 / E1 DD2 主属性 / E2 UI 三清 / F 换块四清 / E3 粒子五清 —— 全部 1:1 落盘，测试绿
- 红队 R1/R2/R3/R4 四报告已出（findings 全文见下节）
- **B9（宠物 F7/F8/F12）重启前恰好完成**：down=+120 拆基线/脱离门 5+飞行坐骑/138 CanBeChasedBy；48/48 绿。勿重做。

### 已知红项归属（全量回归 67 红的分域定性，非本方改动）
- worldgen 域（caves-oracle 探针/world-final-hash/gem-passes/hive/sky-invariant/shimmer-checkpoint/_dgidump/_freeze-caves/tools/_*）= **并行 worldgen 会话在途**（其 TS2307 导入链重排中）
- summon-gate-fixes×4（blockRange 在其 Game.ts:12900-23223 重构区）/ npc-damage-gate / redblue-r20（explodeAt PREPARE_BOMB_KB WIP）/ dual-key-fields（其字段搬移批）/ paint.test（IIIII201 陈旧金标）/ sky-gore-tail（其地下遮挡门）/ emote-menu（其 world 旗面）/ redblue-r35（其 WIP 挪锚）= 并行会话
- ⚠️ 重启后先与并行会话确认其 WIP 收口状态，再判残余红项归属

## 二、十支蓝队状态与恢复指令

| 支 | ID | 任务 | 停摆时状态 | 恢复动作 |
|---|---|---|---|---|
| B1 | acdc816ff26712cb9 | 粒子通道（perfect 泄漏/dst 衰减/密度门/FadingParticles 三项/lv 分支/锚校正） | 重读被并行改动的区域，落地量未知 | SendMessage「重读盘上+逐项核对①-⑦哪些已落，续完余项+tsc+tests/orchestra-types-l6,snapstrike-ring-particles,snapstrike-class-f3,lakesparkle-envelope」 |
| B2 | a82176078a1942ab9 | 失焦音频（blur 钩/暂停耦合/音乐-only 放行/boot 监听/MP 注） | 自述"所有测试已通过，正在核盘上标记"——接近完成 | SendMessage「核对你①-④落地标记+tsc+playwhenunfocused/sfx 测试，补缺后交报告」 |
| B3 | a5094048ef0c0741f | UI/飘字（命中盒字体/尸体门/numActive/露西 scale/FakeFish 掷序×2/WorldSelect 竞态+天顶 128/图鉴 404+disabled） | 正在把 lakesparkle-envelope.test.ts 调成六掷真值——FakeFish 源改了没落全 | SendMessage「从 lakesparkle 测试续：先核 FakeFish 源侧两掷序是否已落，逐项①-⑦核对续完」 |
| B4 | a3ea400e3f061f5d5 | 矿车旋位/载荷 gfxOffY/MountedTop gravDir | 仍在取证（查 Mount.cs gfxOffY 写面），大概率零落盘 | SendMessage「按原任务继续（TrackRotation fullRotation 写面→deadCells 旋位支+速度旋支+gfxOffY 载荷+MountedTop gravDir）」 |
| B5 | a62c40a80104adb44 | 刷怪存档冰雹（F1 critters 门/F2 clamp 次序/F3 合成夹具/F4 banner 两道门/F5 timeLeft/F6 成就旗/F7 公告规范名/F8/F11/F13） | 正扩提取器做 BannerToNPC 规范表（④⑦前置） | SendMessage「续：先核 F1/F2/F5/F6/F8/F11 是否已落（grep 对应区），④⑦从提取器续」 |
| B6 | accc809f01bf4c3ed | TownNPC 微光 WetCollision 链（buff353 载体/TryAddingRepeatedBuff 100t/ramp 源改 shimmering/1042 通路/oracle 重产） | 仍在取证（查 TownNPC import 与测试 mock 面），大概率零落盘 | SendMessage「按原任务继续（机制对照表见原任务提示词）」 |
| B7 | abc121342c957351c | quickBuff 三缺（cursed/CCed 门/食物 +1 严格档/mana×manaCost） | 自述"修改 7：头注释+F11 mana 块+剩余锚"——接近完成 | SendMessage「核对 F2/F3/F11 三处落地+tsc+quickBuff 相关测试，补缺交报告」 |
| B8 | acb6dd58be8130647 | 浮液 canFloat 源（F1 MAJOR 脚蹼药不是 canFloat 源/wet 含岩浆口径/F6 unstuck/注释勘误） | 无尾迹——落地量未知（**这条最关键，F1 是 MAJOR**） | SendMessage「逐项核对：shouldFloatInWater getter 是否仍并 FlipperPotion（是则未修）→ 按原任务①②③修；测试 oracle 改 4404 驱动」 |
| B10 | a54c7f77fc3e4df6a | 砍切门/锚点（F5 CanCutTile MED/距离锚弹体中心/remix 免疫/整型化/Width÷2/Keybrand 盒心/F11 测试锁/owner 域） | 停止时无尾迹 | SendMessage「逐项核对①-⑨，重点 grep CanCutTile 是否已在 mowCutTiles/挥击循环接线」 |

恢复协议（每支通用）：先 `npx tsc --noEmit` 只看其触碰文件域 → grep 各自锚点判已落/未落 → 只补缺 → 相关 vitest → 报告（原版行号锚+修法）。纪律不变：1:1、单次 Edit 原子、禁新近似。

## 三、红队 findings 存档（原文级，供蓝队核对）

### R1 玩家簇（12 条：4 MAJOR / 8 MINOR）
- **F1(MAJOR)** shouldFloatInWater 并入 FlipperPotion 错——原版 canFloatInWater 仅两源：buff265(Flamingo 坐骑,Player.cs:9984)+件 4404(:13366)；Flipper 药 109=ignoreWater+accFlipper(:10257-60) 不置 canFloat。锚 Player.ts:707 getter + :5235/:5259/:4253/:4333/:4683/:4688。
- **F2(MAJOR)** quickBuff 入口缺 cursed||CCed（Player.cs:5760-65）；quickHeal(:5495)/quickMana(:5601) 同缺。
- **F3(MAJOR)** quickBuff 食物挑选丢"+1"（PickBestFoodItem :5912-40 现役扫描 num=num2+1→候选须严格更高档）；锚 Game.ts:9884-87。
- **F4(MAJOR)** TownNPC 微光 lane 用中心格探针——原版=ramp 读 shimmering(buff353 在身 :93255-64)+TryAddingRepeatedBuff(353,100) 续期(:94211-18/:94446-56)+WetCollision 全共享体(:1575-1650)+1042 弹 lane。锚 TownNPC.ts:1623-34。
- F5(MINOR) 湿阻尼触发集缺岩浆/微光（wet=任意液体 Collision.cs:1612-13）+阻尼应在碰撞积分前(:28390 前)+merman/trident 走 DryCollision 无浮液。F6(MINOR) AddBuff353 门缺 !ShouldUnstuck（:27944 三因子）+no-spot 支缺 StartUnstuck+ClearBuff（:29108-22，降级近不可达）。F7(MINOR) Wisp down=+120 无−60（:60790-60801）——**B9 已修**。F8(MINOR) Wisp 脱离门 5 非 12+飞行坐骑——**B9 已修**。F9(MINOR) rise 态缺 −0.001 伴位（TownNPC.ts:265-67，收尾晚 2-3t）。F10(MINOR) wet 含岩浆：accFlipper(:13115)/翼帧 waterFloat(:30456/:30724) 同口径。F11(MINOR) 耗魔未乘 manaCost（:5875-84）。F12(MINOR) AI_138 缺 CanBeChasedBy——**B9 已修**。
- 已核净：controlDownHold/Enemy 双 lanes/哨兵主干/rollGolemSentryCrit/DD2 主属性/ShadowOrb18/消费面一致性。

### R2 弹体战斗簇（11 条：1 MED / 10 LOW）
- **F5(MED)** 砍切面缺 CanCutTile 门（WorldGen.cs:88111-24：wall350/下格∈{78,380,579}/254 frameX<144）→ 挥击误割盆栽香草/未熟南瓜。锚 Game.ts:17897-916(mow)+25796-812(挥击)。
- F1(LOW) dealContacts 距离锚=玩家中心≠弹体 Center（Projectile.cs:12415-25；1126 Center=RRP−velocity :42781）。F2(LOW) 迭代域缺城镇 NPC（预置缺口）。F3(LOW) type22 remix 局部免疫 12t（:1053-57）。F4(LOW) CheckPlatformSolidity 玩家盒未 int 截断（Entity.cs:171-77）。F6(LOW) 巨石成就 34 边沿应跟风暴条件非窗口（WorldGen.cs:72225-39）——**B5 在修（与 R4 重复）**。F7(LOW) 发蜂 Width/2 int 整除三处（:43974-75）。F8(LOW) Keybrand 参考点=判定盒中心非玩家中心（:44681-82/:82004）。F9(LOW) 1122 slowMagicUse owner 域（MP 面）。F10(LOW) chloroslam 测试第一例钉死错锚（随 F1 重产）。F11(LOW) net 测试未锁 +1 外沿。
- 核净：LOS 四探针/受理位豁免/22 熔岩反弹 LCG32 全链/换块五族全表/扫描域/清除盒/蜂巢数值/Keybrand 死支定谳。

### R3 渲染粒子 UI 簇（44 条：2 P1 / 10 P2 / 余 P3）——B1/B2/B3/B4 在修
- **[P1]** princess/stardust mkPS/mkSD 走 spawnDust 未传 perfect→+4/+4 位偏与 ±2 速度抖动（orchestraFx:994/:1054；原版 :3386/:3374/:3425/:3440 精确值）。**[P1]** 失焦钩缺 window blur（Sfx:853-55；FocusHelper:139-41）。
- P2：kind1 红臂 dst 衰减（红 A0.5×(1−0.35)≈0.16、金≈0.32；:665/:681）+注释锚错；kind2 d172/d211 未 perfect（:792/:805）；LakeSparkle 漏 :1339 死掷（6 掷非 5）+调用点掷序 X→Y→rise 错排（:20634-36）；popup 命中盒 combatMeasure 错源（GetTextHitbox=MouseText×scale Y×0.8 :751-58）+尸体缺 active 门（:687-91）+numActive 上帧终值（:760-72）+露西 scale=0 十帧生长（:95-107）；WorldSelect close/reload 孤儿 interval+fullSeedText 缺天顶 +=128（WorldFileData.cs:199-203）；失焦暂停耦合错位（开关直接驱暂停；autoPause 独立）+开关开时仅音乐放行（sfx PauseSounds :97-107/环境音归零 :109）；矿车 TrackRotation 写 fullRotation 推翻"死支"（Player.cs:28324/:28326）+载荷漏 gfxOffY（:24496）。
- P3 要点：FadingParticles 池满丢弃/缺省 tintA/缺 followPlayer 等三字段；dCount 密度门与掷污染；lv from==to 分支；Renderer 22_FaceAcc base-face 缺 (face!=23||head!=287) 门；BestiaryPanel 404 整头像空白+disabled 未 Remove；WorldSelect IconCompletion 徽标；boot 期监听窗口；注释锚系统性漂移（FadingParticles 头注/orchestraFx:2145-46/FakeFish:604-06/Player:5660 漏 28324/Options:152）。
- 核净：SnapStrike 收缩/popup 公式链/叠层筛选核心/轮播常量/plotLine 链/四层路由主体。

### R4 世界存档刷怪簇（13 条：4 MEDIUM / 3 LOW / 6 INFO）——B5 在修
- F1(MED) AnyHelpfulFairies critters 臂缺 ai[2]>1（NPC.cs:90954-64；野仙误关门 VanillaSpawner:564）。F2(MED) getGood 臂应 clamp 后（NPC.cs:750-61）。F3(MED) banner 金标例空转（须合成夹具）。F4(MED) banner 计数缺 ExcludedFromDeathTally 13 类（:4869/:4805）+交互门（:79658-61；与 bestiary 面同口径登记）。
- F5(LOW) 1049 timeLeft 未随子步（:16780-83/:17307-13→600t 非 1200）。F6(LOW) 成就 34 错旗（同 R2）。F7(LOW) 公告应 EnemiesDefeatedBy+规范名（BannerSystem.cs:249-55）。
- INFO：F8 i<293 守卫；F9 步间不重查块（族既有）；F10 尾迹尘未移植；F11 VanillaSpawner:882 过期登记；F12 测试覆盖缺口；F13 越界落点钳制语义（vanilla tile=null 照发）。
- 核净：isNearFairyWindow 本体/banner 段本体/冰雹臂本体/球广播本体。

## 四、恢复后终局清单
1. 重启后先 `npx tsc --noEmit` 摸底 + 与并行会话核对 WIP
2. 逐支续蓝队（上表）→ 全落盘
3. 终局全量回归（`npx vitest run --reporter=basic > /tmp/full-sweep.log 2>&1` 全量落盘勿 tail）
4. 终账：开放标记终扫 + 更新任务 #26 完成 + 归档


---
**✅ 已完成（2026-09-03 深夜）**：十支蓝队全部收口，红蓝对抗闭环（80 findings→修复~65/登记~10/误报反证~5），终局回归 10280 绿 / 84 红——红项全数定性为并行 worldgen 会话在途域（tools/_* 探针 + 其 WIP 测试面），本方域零红。本文件转为历史备案。
