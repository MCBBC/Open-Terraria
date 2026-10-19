# 登记债台账 — X 波（X4/X5/X3 红蓝对抗复核）

> 立账：2026-09-29，清偿刀 C。红蓝对抗复核（X4/X5/X3 路）审出的登记债汇总。
> 落刀项（①-⑦）不在本档——落刀判语见对应测试与源码注（★X4/X5 清偿刀C 标记）；
> 本档只收「登记不动/需拍板/随批接续」面。新债入账须带反编译锚与不建模理由。
>
> ★刀字母撞号消歧（清偿刀 P4 2026-09-30 落账）：刀字母按【战役域内】唯一，跨战役
> 以「日期+域」消歧——J=l10n 09-29（tests/l10n-orphan-sentinel.test.ts）与
> itemcombat 09-30（vanillaItemCombat.ts 头注⑦）；M=era-guard 09-29
> （tests/extract-itemcombat-era-guard.test.ts）与 content-parity/credits 09-30
> （tests/m-credits-player-segment.test.ts）；K=X4 travelshop 翻案 09-29
> （tests/x4-debt10-travelshop-cyborg-verdict.test.ts）与 BJ405-D1 mount-bar
> 09-30（tests/mount-buff-bar-bj405d1.test.ts,自标 K①）。

## 目录

1. [X4-债1 DroneCameraTracker 通道整缺（★已清偿 2026-10-03：清偿刀 I+BJ456）](#x4-债1)
2. [X4-债2 幽灵相死亡文字可见性（★已拍板：对齐原版）](#x4-债2)
   2a. [X4-债2a PanControl 文案分歧（★已拍板：对齐原版官方文案）](#x4-债2a)
3. [X4-债3 死亡/幽灵相 buff 计时面](#x4-债3)
4. [X4-债4 BJ401 残面（4262 特效旗/手持光·食饮粒子）](#x4-债4)
5. [X4-债5 BJ391 classic 列表站首击合并语义](#x4-债5)
6. [X4-债6 BJ401/358 残面（54 迅猛龙身前照画）](#x4-债6)
7. [X4-债7 BJ374 三条边界微差](#x4-债7)
8. [X4-债8 BJ397 手柄 48f 档（★已拍板 2026-09-30：不做，维持登记）](#x4-债8)
9. [X4-债9 BJ351 回填不补播 misc[43]](#x4-债9)
10. [X4-债10 PriceAdjustment loveStruck ×0.9 面维持不建模（★已清偿：清偿刀 B）](#x4-债10)
11. [X4-债11 634/635 Kill AoE 受理面 proc/入账污染+窗值 10t≠5t](#x4-债11)
12. [X4-债12 vanillaGated 门位读后置污染（读侧,清偿刀 T 已清偿）](#x4-债12)
13. [X4-债13 写面档位三弹 251/632/856（清偿刀 W 已清偿）](#x4-债13)
14. [X4-债14 血尽转换放行支 kill-tick 护窗缺（清偿刀 Y 已清偿,BJ446 复核）](#x4-债14)
15. [X4-债15 Enemy 桶 Lovestruck 头爱心 gore 发射位未接（展示级,清偿刀 F 已清偿,BJ446 复核）](#x4-债15)
16. [X4-债16 DroneCameraTracker 通道边债（★P4 勘误：原误号债10 重号,改号债16；①清偿刀A BJ456,②销核刀K,③★BJ460 定谳=清偿刀D 已全建模销账,④判伪刀N）](#x4-债16)
17. [X4-债17 历史会话取证测试死夹具（ENOENT 44 桶,登记禁清）](#x4-债17)

---

## X4-债1 <a id="x4-债1"></a>

**DroneCameraTracker 通道（配饰 5452 洞窟无人机跟拍）**

- 现状：本仓配饰 5452（Cave Drone/洞窟无人机）装备面在轨，但其相机跟拍通道
  （vanilla DroneCameraTracker——无人机侦测到稀有敌怪/宝藏时的镜头提示跟随）
  整通道缺。
- 锚：vanilla `DroneCameraTracker`（Main 相机附加通道，随配饰批审计补锚行号）。
- 处置：随配饰批统一接续；不单独立刀（收益面窄：仅 5452 佩戴且目标在场的
  相机提示支）。
- 风险：低。缺通道=静默无跟拍，无错误行为。
- ★已清偿（清偿刀 I 2026-09-29 通道本体 + BJ456 2026-10-03 收口）：通道=
  src/render/DroneCameraTracker.ts 全文 1:1 + Camera.droneTracker 宿主 +
  Game.ts 物体跟踪链接入（优先序 spectating→dead→drone→golf,Main.cs:63677-63699）；
  AI_195/205 本体=entities/DroneProjs.ts（弹 1020/1105,清偿刀 A 实装）,Track 由
  AI owner==myPlayer 支逐帧调（Projectile.cs:41688/:38825）,出膛位代行退役。
  ★BJ456 定谳：本条原文「无人机侦测到稀有敌怪/宝藏时的镜头提示跟随」措辞与
  实体不符——AI_195/AI_205 本体全文（:41652-41804/:38768-39169）无任何 NPC/宝箱/
  稀有度扫描逻辑,通道=纯跟随（TryTracking）+ 5452 FPV 眼镜装备门
  （remoteVisionForDrone）。锁面=tests/bj456-drone-ai-body.test.ts（①②③④ 四轴）
  + drone-ai/drone-camera-tracker/drone-visor-face-draw 三深层锁。

## X4-债2 <a id="x4-债2"></a>

**幽灵相死亡文字可见性（★已拍板 2026-09-29：对齐原版，终态）**

- 现状：本仓 `drawDeathScreen`（Renderer.ts）倒计时行已补 `respawnTimer > 1` 门
  （★X4 清偿刀C，vanilla Main.cs:46140-46146）；但「你被杀死了……」主文字
  （vanilla Main.cs:46089，无门恒画）与掉钱行在幽灵相（respawnTimer≤0 常驻）
  的可见性未动。
- 分歧点：照原版=幽灵相仍恒显「你被杀死了…」（原版 46089 无 ghost 相门，
  仅 `spectating < 0` 观战门）；
  备选=幽灵相隐没死亡文字（观感更合理，但属明令分歧）。
- 处置：**★用户拍板（2026-09-29）「需要拍板的项目对齐原版就行」→ 对齐原版=
  幽灵相恒画维持现状（零改动），本条终态**。原版门序亲读：死亡文字行无任何
  respawnTimer/ghost 相条件，仅 GetDeathAlpha 淡入驱动。
- 附注：本条与落刀④同域——倒计时门已落（原版 1:1），文字可见性=原版同相。

## X4-债2a <a id="x4-债2a"></a>

**PanControl 文案分歧（★已拍板 2026-09-29：对齐原版官方文案，终态）**

- 来源：清偿刀 G（l10n 清淤）发现 PanControl 平键自身 A/B 双写——A 档全句式
  （「镜头平移（键鼠）/右键切换…」）被 B 档短句式（「平移控制/按住/点击/恒开/
  恒关」）按 JSON 后者胜出序完全遮蔽；G 按消费面定谳摘 A 保 B，文案分歧登记
  待拍板。
- ★拍板（2026-09-29 用户「需要拍板的项目对齐原版就行」）：原版 PanControlMode
  为**原版功能**（Main.cs:63719 ButtonControlMode；Player.cs:381
  CycleControlControl_OffOnClickHold 四档 Hold→Click→OnAlways→OffAlways，
  UIManageControls.cs:670-675 UIKeybindingCycleListItem 循环）——语言键
  `UI.PanControlMode{,_Hold,_Click,_OnAlways,_OffAlways}` 官方文本（反编译树
  Terraria.Localization.Content.*.json）：
  - zh-Hans：向前缩放 / 按住使用 / 点击切换 / 始终开启 / 始终关闭
  - en-US：Forward Zoom / Hold to Use / Click to Toggle / Always On / Always Off
- 落刀：tools/l10n-custom/{zh-Hans,en-US}.json 五键值改官方文本（本仓键名
  `Mods.SandboxWorld.Settings.PanControl*` 保留——设置页为本仓自建 UI）+
  build-l10n 重建+产物展平核验+闸全绿（l10n-audit/orphan-sentinel/l10n-data/
  pan-control-setting-cycle/bj394 共 80 测）。
- 附注：官方 zh 主键译名「向前缩放」（Forward Zoom）系官方翻译原样（pan 语义
  实为平移，官方译如此）——对齐口径=官方 lang 文本逐字。A/B 文案分歧随之
  终态（两者皆弃，用官方文案）。

## X4-债3 <a id="x4-债3"></a>

**死亡/幽灵相 buff 计时面（计时前进 vs 原版冻结）**

- vanilla 语义（亲读 1457）：
  - 死亡相 UpdateDead 清非持久 buff：`Player.cs:17111-17116`
    `for i<maxBuffs: if (buffType[i] <= 0 || !Main.persistentBuff[buffType[i]])
    { buffTime[i] = 0; buffType[i] = 0; }`（X4 报告引 :17121-17127 系段位偏移，
    本档按亲读钉 :17111-17116，语义同一）。
  - 幽灵相 UpdateBuffs 整体不跑（Player.Update :24938-24942 ghost 分支先于
    dead 分支接管，buff 计时冻结）。
- 本仓现状：`buffs.tick`（Player.ts:3933，dt 驱动）死亡/幽灵相照跑，且
  `handlePlayerDeath`（Game.ts:10053 调用点）不清 buff → 死亡/幽灵相 buff
  计时继续前进（图标可到期消失/可持续衰减），原版=冻结+非持久清空。
- 处置：登记不动，随 buff 域批接续。风险面：观感级（死亡期间某些 debuff 少
  跳了几秒/图标提前消失），无逻辑实害（死亡相无 buff 消费链在跑）。
- 接续要点：清面须过 `Main.persistentBuff` 持久表（vanilla 表随 buff 批已有
  对应域则直接消费）；幽灵相走 isGhostPhase 早退跳 tick。
- **已清偿（2026-09-29 清偿刀 E）**：①死亡相清非持久 buff 落地——Player.ts 死亡
  分支调 `buffs.clearNonPersistent()`（Buffs.ts 新方法，判据=PERSISTENT_BUFFS
  {71,73-79}=Main.cs:9337-9344 全表 8 项即武器浸剂八族；72 Midas 不在内照清；
  裸字段写零无音效/尘=原版同相，表现仅图标下帧消失），死亡相每 tick 幂等=
  原版 UpdateDead 每帧跑；②幽灵/死亡相 tick 停——`buffs.tick` 挂 `!dead` 门
  （Player.ts:3940），死亡/幽灵相计时冻结=UpdateBuffs 不跑（:25763 早退序）。
  判别测试 tests/x4-death-ghost-buff-settlement.test.ts（11 测）；变异 M1（摘
  清 buff 调用→红）/M2（tick 门回退→2 红）逐字节还原+sha256 对拍通过。

## X4-债4 <a id="x4-债4"></a>

**BJ401 残面（4262 特效旗 + 手持光/食饮粒子面）**

- `Player.cs:51729` item 4262 特效旗：低危特效位。
- `Player.cs:43178` 手持光/食饮粒子面：低危特效面。
- 处置：登记维持。主面已被使用链整禁覆盖（BJ401 落刀判语），残面仅特效
  观感差，不单独立刀。
- **已清偿（2026-09-29 清偿刀 E）**：两处实装面均为小面（单文件、无新子系统），
  1:1 补齐——①音符 gore：4262 使用动画期（itemAnimation>0 每帧）Next(20)==0 →
  gore Next(570,573)（音符，Gore_570-572.png 在库）于 (Center.X+dir·30−6,
  MountedCenter.Y−36)、v=(WindForVisuals×2+dir·0.3,−0.5) 逐分量 ×(1+Next(−50,51)
  ×0.01)、571→X−4/572→X−8、scale 0.8、非 DontHoldItems 坐骑门（Player.cs:51723-51751
  亲读定谳=吹笛音符特效非坐骑特效，:51735-51737 flag 恰为坐骑豁免支）；落
  Game.ts updateSwingHits 挥击窗（锚=AnimatePlayerAndGetItemFrame :43712）。
  ②手持光抑制：tickLighting heldDef 挂 DontHoldItems{55,56,61} 门（:43178
  IsAllowedToHoldItems，Mount.cs:5195-5200 置 false）——三变身坐骑手持光全族熄；
  食饮粒子半边定谳=本仓已有（Game.ts emitFoodDrinkParticles:32821 1:1 在轨 +
  三坐骑使用链整禁无 swing 天然覆盖）。源码锚锁 tests/x4-death-ghost-buff-
  settlement.test.ts；变异 M4（门短路→红）surgical 还原（并行刀 H 同文件在途，
  禁整档 cp 回写）。

## X4-债5 <a id="x4-债5"></a>

**BJ391 classic 列表站首击合并语义**

- vanilla：classic 制作列表站首击=聚焦该配方不合成（Main.cs:43020）。
- 本仓：classic 列表站首击即合成的既有交互面（SW 交互惯例）；modern 站
  （FX41 族）已 1:1。
- 处置：~~登记维持（SW 既有交互面优先，不回改）。若用户报「classic 站首击
  误合成」再立刀。~~
- **已清偿（2026-10-02 BJ430 用户拍板翻案）**：用户实报「制作栏里长按物品无法
  批量快速制作」后拍板按原版完整移植,推翻本条「SW 单击合并语义维持」。落刀
  =UI.ts `craftListPress` 两臂分派（HoverOverCraftingItemButton Main.cs:42971-43036
  if/else-if 1:1）:①`:42988` 合成支 `focusRecipe==recipeIndex && guideItem.IsAir`
  → craftPressTick（BJ391 压拍面单源,零复制）;②`:43020-43024` 聚焦支=首击聚焦
  不合成（focusRecipe 写位+stackSplit=15 :43021+Sound 12 :43023,不上膛承载
  _preventCrafting 旗恒阻面）。判别测试 tests/bj430-craft-list-two-stage.test.ts
  （首击聚焦/二击合成/长按加速梯端到端/离行暂停回行续做/guidePlaced 门/焦点切换,
  变异 M1 焦点门反转 7 红/M2 冷却写点摘除 2 红/M3 guidePlaced 门摘除 1 红,逐字节
  还原+sha256 对拍通过）。实机探针（tools/probe.mjs scripts/_bj430-craft-hold-probe.mjs,
  证据 game/docs/evidence/bj430/）:classic 站首击 0 合成（旧码 1）+二击按住 2.6s
  连做 25 次（加速梯同拍）;fisheye 默认站/modern 网格站零回归（25/34 次同旧）。

## X4-债6 <a id="x4-债6"></a>

**BJ401/358 残面（54 迅猛龙身前非脸族照画）**

- vanilla 坐骑 54（迅猛龙）身前绘制支对非脸族配件的裁剪面，本仓照画
  （自登记维持，BJ401/358 判语）。
- 处置：登记不动；观感级，随坐骑绘制批复核。
- **已清偿（2026-09-29 清偿刀 E）**：亲读定谳=真偏差非原版本相——
  AdjustmentsForVelociraptorMount（PlayerDrawSet.cs:1886-1888）置
  hideEntirePlayerExceptHelmetsAndFaceAccessories，消费 :1689-1693 把
  colorArmorBody/colorArmorLegs/colorShoes 等 14 色全染 Transparent 仅留
  colorArmorHead；身前各族染色亲读：18_OffhandAcc :2060 / 19_WaistAcc :2076
  (colorArmorLegs) / 20_NeckAcc :2090 / 25_Shield :3096 / 29_OnhandAcc :3867 /
  32_FrontAcc :3917+ / 12_1_BalloonFronts :1117 全 colorArmorBody——身前非脸族
  原版整族不可见。修=Renderer.drawAccFrontLayers 拆 `mnt.type !== 54` 豁免支
  （与 52/55/56/61 同门）；脸饰（22_FaceAcc CanDrawOnVelociraptorMount 门）本仓
  无该槽=零损失；头盔照画走 veloHead 纸娃娃路径保留。判别测试
  bj401-mount61-equip-hidden.test.ts（54 行为翻正+era-guard 防复活）+
  x4-death-ghost-buff-settlement.test.ts 锚锁；变异 M3（豁免复活→3 红）
  逐字节还原+sha256 对拍通过。

## X4-债7 <a id="x4-债7"></a>

**BJ374 三条边界微差（一行台账）**

1. 尾窗回退：本仓 `(cw.useTime||4)` vs 原版 `useTime==0 → sItem.useTime`
   （WorldGen.cs:43818-43821）——缺省档 4 vs 原版回退语义。
2. 风暴出生 x：本仓 `player.cx` vs 原版 `pointPosition.X`（杖尖）——≤~10px 级。
3. 朝向门：本仓鼠标对盒心 vs 原版点积对杖尖——边界级朝向差。
- 处置：登记维持，边界级（±10px/朝向边沿），随 BJ374 复审批一并清算。
- **★已清偿（2026-09-29 清偿刀D，①③落刀/②零修刀定谳；锚均按 1457 亲读重钉，
  X4 原报告行号系段位偏移+误注文件——「WorldGen.cs:43818-43821」实为
  Player.cs:43819-43823 ItemCheck_OwnerOnlyCode）：**
  1. 尾窗回退【已落刀】：三站位（case'magic' 派发门/6152/泛化 spray gate）改原版式
     兜底链——窗单位=窗内已施用 useTime（本仓 itemTimeMax 对映：慢施档
     ApplyItemTime(sItem,2.5) :4406-4415 → ⌊U×2.5⌋，仓内载体=swing.multishot.useTime
     续发钟同源同值）`|| cw.useTime（≡sItem.useTime 数据面）|| 4（cw 缺表防御档，
     原版该支不可达）`。旧形慢施窗单位分裂（续发钟 ⌊U×2.5⌋/尾窗 U）已收口。
     判语见 tests/bj374-bookstaff-modes.test.ts「尾窗单位原版式兜底」+源码注
     （Game.ts ★X4-债7① 三站）。
  2. 风暴出生 x【零修刀定谳】：「杖尖」读法被亲读推翻——pointPosition.X=
     RotatedRelativePoint(MountedCenter).X（:47605+:4209-4235 无坐骑→PlayerOffset 0
     →num2=4、无 fullRotation→恒等）=盒心 X（MountedCenter :3321-3326）≡player.cx；
     NewProjectile :10878-10879 传点即弹心（:49561）。**残余转登记**：fullRotation
     斜面项 X 偏 +(21−4)·sin(φ)px 与 mount.PlayerOffset≠0 支——本仓 fullRotation
     未建模（Player.ts:5170 注，坐骑旋转域），随玩家斜面旋转批一并复核（维持登记）。
  3. 朝向门【已落刀】：原版窗首拍（ItemAnimationJustStarted :4050）点积门
     Dot(UnitX.RotatedBy(fullRotation), normalize(MouseWorld−pointPosition))>0 →
     右，否则左（:47612-47634）——dx==0 同轴拍 num=0 落 else=朝左；本仓 `>=` 改
     严格 `>`。点积对「杖尖」=对 pointPosition（≡盒心，见 2），本仓收敛式同构。
     判语见 tests/bj374-bookstaff-modes.test.ts「右键风暴方向=鼠标侧严格 >」+
     Game.ts ★X4-债7③ 源码注。

## X4-债8 <a id="x4-债8"></a>

**BJ397 手柄 48f 档维持登记债**

- vanilla pan 手柄档 `maxPanSpeed = 48f`（Main.cs:63772，`PlayerInput.UsingGamepad`
  支内）；本仓无手柄 pan 通道（Game.ts:11535 区注已登记），48f 档维持不建模。
- 关联：★X4 清偿刀C 在 pan 门补 mount 门（:63724-63727）时该债维持原判。
- **★定谳（2026-09-29 清偿刀D，维持不建模）**：本仓确无手柄输入域——
  `usingGamepad` 全仓硬编码 false（Game.ts:13484/:45551、DoorOpeningHelper.ts:30
  「本作无手柄恒 false」、SmartSelect.ts:153-154「分支保留为死代码注释」；手柄臂
  :25391-25394 登记不建 Game.ts:8781）——无 pan 通道可挂 48f 档。唯一真 Gamepad
  API 面=UIWorldLoadState.ts:62-71 navigator.getGamepads（加载提示池选择近似，
  IIIII229 登记面，非玩法输入）。手柄接入批成立时随 PlayerInput 域批补 48f 档
  （:63762-63773 整支：摇杆死区+Click 门+maxPanSpeed=48）。
- **★用户拍板（2026-09-30）：手柄支持不做，本条维持登记终态**。定谳+分层接入
  计划正本已落档 `game/docs/gamepad-integration-plan.md`（E 刀：原版 GameInput
  全谱 ≈9900 行/61 触发器/本仓接入点 10 锚/L1 最小 pan 面 2-3 专注日 → L4 全谱
  19-33 日+风险 Top3）——将来若要开工手柄，照计划正本分批即可，勿从零定谳。

## X4-债9 <a id="x4-债9"></a>

**BJ351 回填不补播 misc[43]**

- rescue 态原版不可达（回填补播支无可达输入）；本仓回填不补播 misc[43]
  =测试锁定的静默选择（BJ351 判语）。
- 处置：登记维持；若未来 rescue 态可达性变化（新入口）再翻案。

## X4-债10 <a id="x4-债10"></a>

**PriceAdjustment loveStruck ×0.9 面维持不建模（TownNPC 无 Lovestruck 载体）**

- 原版：ShopHelper.ProcessMood（ShopHelper.cs:103-106）在 368/453/宠物/remix
  提前 return 门【之前】`npc.loveStruck → ×0.9`（无报告行、不钳不圆——提前
  return 亦跳过 LimitAndRoundMultiplier）。
- 本仓：computeHappiness（vanillaHappiness.ts）门前恒 1——TownNPC 继承
  Entity 而非 Enemy，`lovestruckT` 载体（Enemy.ts:1700,projStatus 119 映射）
  不覆盖城镇 NPC，爱情药水弹 370 圈支（ThrowKillFx）对 TownNPC 无施加面。
  其余 PriceAdjustment 消费面（重铸 :42302/商店 GetItemExpectedPrice/护士
  :40793/税官 :40625+:40878/钓鱼 :56968/理发 :44538/成就 Player.cs:4376/
  remix 门 :107）已由清偿刀 H 接线（2026-09-29）。
- 处置：登记维持；待 TownNPC buff 承载批（119 施加面）落刀时一并接
  （ HappinessInput 加 `loveStruck` 入参 + 门前 `mul *= 0.9` 两点）。
- ★【已清偿】清偿刀 B（2026-09-29）：TownNPC buff 承载最小面落地——
  ①载体 `TownNPC.lovestruckT`（秒,projStatus SUPPORTED[119] 映射既有写入面
  经 ThrowKillFx.applyAura 三桶含 npcs 直接生效）;②每 tick 递减 + 头爱心
  gore 331（NPC.cs:92455-92466,TownNPC.fixedUpdate）;③vanillaHappiness
  `HappinessInput.loveStruck` + 门前 `mul *= 0.9`（提前 return 门改返
  `mul`）;④Game.computeShopHappiness 快照 `npc.lovestruckT > 0`。测试
  tests/townnpc-lovestruck.test.ts（门序结构锁:368/453/37/宠物/remix 恋爱
  中 0.9;无家钳 1.5 覆盖序;施加入账/过期/爱心发射）。余债（展示级）：
  Enemy 桶爱心 gore 发射位未接（Enemy.lovestruckT 仅倒数,原版 :92455 对
  全 NPC 发射）——登记新债见 X4-债15。

## X4-债16 <a id="x4-债16"></a>

**DroneCameraTracker 通道边债（★X4 清偿刀I 2026-09-29 判后余债；★清偿刀 P4 2026-09-30
勘误：原误号「X4-债10」与 loveStruck 债重号+锚 id 撞车,本条改号债16——travelshop
翻案测试文件名/头注的「X4-债10#2」系历史编号引用,保留不改名）**

通道本体已实装（src/render/DroneCameraTracker.ts 全文 1:1 + Camera.droneTracker
宿主 + Game.ts 物体跟踪链接入），余债四条：

1. **Track 调用点归属**：原版 Track 在 AI_195_JimsDrone（Projectile.cs:41688）/
   AI_205_RemoteControlCar（:38825）owner==myPlayer 支逐帧调——本仓两 AI 未实装
   （既有登记「ai195/205 本体行为另批登记」，Game.ts:14282 区注），过渡期由
   5451/5738 spawn 共用支出膛位代行（Game.ts:14335，Track 幂等覆写,单实例替换
   语义下与逐帧观测等价）；AI 批落地后由其逐帧 Track 接管（出膛位保留无害）。
   ——★BJ456 2026-10-03 已清偿：AI 本体实装 entities/DroneProjs.ts（清偿刀 A）+
   逐帧 Track 接管（Game.droneCameraTrack 钩子→Camera.droneTracker）,出膛位代行
   退役（spawn 支零 Track）。锁=tests/bj456-drone-ai-body.test.ts ①②④
   （Track 位次 spy/幂等/单实例替换/自愈=出膛位单发代行无此相）+
   tests/drone-camera-tracker.test.ts ⑤（spawn 退役源锚）。
2. **旅行商人可得性**：★翻案销核（清偿刀 K 2026-09-29 定谳=伪债,NPC 归属误判）——
   原判「SetupTravelShop hardmode 栏三件套」错:Chest.cs:2396-2400 是 Chest.SetupShop
   **case 14**=电子人(209)困难模式货架（槽位映射 NPCInteractions.cs:502 `Shop(209,14)`,
   1456 同构;NPCID.cs:11489 Cyborg=209）;旅行商人=368→槽 19（:507）,case 19
   （Chest.cs:2785-2803）全貌=帕鲁甲 5735/5736 条件段+Main.travelShop[] 流动池,无
   hardmode 支,SetupTravelShop 函数体(:1269-1382)零三 id。三 id 全 Chest.cs 唯一出现点
   =case 14 段。本仓数据面早已全量在位:vanilla-shopstock.json shops['209'] 含三件
   （cond=hardMode/price=100000=原版 buyPrice(0,10)——原判「10 银」系 buyPrice 形参
   语义误读,第二形参=gold（Item.cs `gold * 100 * 100`）,10 金=100000 铜）;经
   Game.shopStockFor→shopCondOk('hardMode') 消费,困难模式前后货架差集=4459/760/1346
   +三件套（tests/x4-debt10-travelshop-cyborg-verdict.test.ts 三轴判别,9 测全绿;
   变异=摘三件→2 红还原 sha256 全等）。extract-travelshop 干跑「重产盖住现库」双向
   零差——vanilla-travelshop.json（GetItem 66+GetPainting 31 随机池）无缺口,三件本就
   不在池内（添入=旅行商卖电子人货=新偏离）。原判遗留真债仅剩：vi_ 自动件 def
   value=1 vs 原版 buyPrice 的卖价面（全 vi_ 同域既况,随价面批一并,与本债 NPC 归属
   无关）。~~原债正文~~：~~原版 SetupTravelShop hardmode 栏三件套 5452/5451/5738
   （Chest.cs:2397-2401，买价均 10 银）；本仓 vanilla-travelshop.json
   （tools/extract-travelshop.mjs 产物）缺该三件=提取器盲区。须扩提取器对 1457
   重提或代码层回填（ACC_STATS_1457 同法），禁手改生成 json。~~
3. **MP netCameraTarget 面**：原版物体跟踪支置 LocalPlayer.netCameraTarget=
   trackedPosition 并在位移 >160px 时发 msg13（Main.cs:63620-63628）——本仓
   netCameraTarget 全域未建模（观战/高尔夫支同缺），同域维持不建模。
   ——★BJ460 定谳销账（2026-10-03）：**条目陈旧,清偿刀 D（2026-09-29）已全链建模**
   ——五站亲读复核：①写=Game.ts:11923 `net?.notifyCameraTarget(specCam ?? droneCam
   ?? golfCam)` 三域同序并集（GetObjectTrackingCameraPan 观战 :63694-63698/无人机
   :63702-63705/高尔夫 :63707-63710 1:1;无跟踪=null 同 :63636 每帧头置空）;②发送门=
   ClientNet.notifyCameraTarget（:1282,HasValue 翻转∨位移>160px 同 :63671-63676）;
   ③序列化=msg13 flagBits[5]+条件尾随 Vector2（ClientNet.ts:1135-1147,同
   NetMessage.cs:487/:507-509+lastSyncedNetCameraTarget 记账 :55091）;④收=客户端镜像
   （ClientNet.ts:603）+服务器 camX/camY/hasCam（room.ts msg13 顺带）;⑤消费=
   room.ts:609 entityAoiCenter（hasCam 优先→观战 msg150 回退→avatar 位）→msg23
   广播（:1289-1291）与 msg27（:1523-1525）=原版唯一读者 ReportedCameraPosition
   （Player.cs:3896-3905=netCameraTarget??position→NPC.cs:91765 AOI 距离）等价消费面。
   判别锁=tests/mp-net-camera-target.test.ts（16 测）。本仓覆盖度=**全建模,无残面**
   （原版消费面仅 AOI 一站,五站全闭环）。
4. **面部穿戴视觉**：5452 faceSlot=21（ArmorIDs.Face.JimsDroneVisor :2237，
   hasVanityEffects=true）——玩家面部穿戴视觉未入 accDrawslots 表（观感级，
   随配饰绘制批复核）。
   ——★判伪（清偿刀 N 2026-09-30：face 槽四层路由 2026-09-03 已整链落地,
   5452→face:21 提取器原生在位,裸锚零偏移=GetFaceDrawOffset 无 case 21）；
   锁=tests/drone-visor-face-draw.test.ts（绘制深层）+
   tests/bj456-drone-ai-body.test.ts ③（表+路由+授权同源）。
- 处置：①★已清偿（BJ456 2026-10-03）；②已翻案销核（清偿刀 K 2026-09-29,判别测试
  tests/x4-debt10-travelshop-cyborg-verdict.test.ts 锁定）;③★已销账（BJ460 2026-10-03
  定谳=清偿刀 D 已全建模,条目陈旧,五站锚见条目内复核注）;④★判伪（清偿刀 N 2026-09-30）。

---

## X4-债11 <a id="x4-债11"></a>

**634/635 Kill AoE 受理面 proc/入账污染 + 窗值 10t≠原版 5t（清偿刀 L 2026-09-29 统筹定谳 645 时发现；634 面属清偿刀 F 领地，未动刀）**

- 原版锚：634/635 Kill（Projectile.cs:73267-73269 先置 maxPenetrate=penetrate=-1）→ Damage()
  同链 Damage_PVE_Inner——受理命中写支走 **:14080-14082 634/635 专支**（immune[owner]=**5**，
  Kill 内 AoE 与飞行盒同支；专支无条件赋值，残窗余值同被覆写），proc（:13877-79）/numHits++
  （:14263）在受理面照达（血尽级联 :14369 族在写支【后】亦不改受理事实）。
- 本仓现状（LunarNebula.ts NebulaBlazeBolt.burst 敌怪环）：strike 传 pierce=0（Enemy.hurt 通用
  尾档 Enemy.ts:14295 写 **iframes=10**）→ ①窗值 10t≠原版 5t（后继非 flag3 弹节拍偏差）；
  ②受理写支污染紧随的 vanillaGated 门位读（`iframes>0` 读到刚写的 10；血尽级联在写支后,
  致死/非致死受理命中均污染）→ 634 Kill AoE 敌怪受理命中 ghostHeal proc 与 pveNumHits
  入账恒跳——与该站注自述「血尽级联/普通未致命返假照 proc 照计数」自相矛盾。
  飞行盒面无此病（pierce=1 三不写+F 侧补写 5：Enemy.hurt 免疫门保证受理面 iframes==0）。
- 判别面建议：真 Enemy 夹具、AoE 命中非 skipId 敌 → 断言 proc 达 + iframes===5。
  修复形候选：strike 传 pierce=-3 后弹侧补写 5（仿 F 飞行盒 :14080-14082 承载式），
  落刀时按现役档位表定谳。
- 边界：仅 634/635 Kill AoE 面。645 爆相已由清偿刀 L 走 pierce=-3 清零档闭合（
  tests/debt-l-645-local-immunity-gate.test.ts 五案；双变异杀伤+sha256 对拍还原）。
  bj404 敌怪 AoE 案以 skipId 挡飞行盒已命中敌、critter 面走独立桶，均未触此面
  （测试无钉=未观察项）。
- 处置：**已清偿（清偿刀 R,2026-09-29）**——Kill AoE 环 strike pierce 0→**-2**（门照走
  +写支三不写）+ 受理面弹侧补写 iframes=**5**（LunarNebula.ts AoE 站 :410-411/:417,
  仿 F 飞行盒承载式;原版写位 :14080 在 proc :13877 后,ghostHeal 不读窗=序等价）。
  选型勘误：登记候选「pierce=-3」不采——634/635 SetDefaults（Projectile.cs:6818-6839）
  无 usesLocalNPCImmunity 行=非局部族,原版写支是【显型定档 5t】非 usesLocal 清零支
  （:14175-14178）。判别测试 tests/debt-r-634-aoe-window5.test.ts（三案;变异=摘补写
  5→红,sha256 对拍还原）。★BJ446（2026-10-03）独立复核：第二判别面
  tests/bj446-enemy-three-debts.test.ts 债11 describe 两案全绿（纯 AoE 靶
  iframes===5+proc/入账达+5t 窗内二发拒）。

---

## X4-债12 <a id="x4-债12"></a>

**vanillaGated 门位读后置污染（读侧残差）——已清偿（2026-09-29 清偿刀 T）**

- 病灶（清偿刀 R 定谳,T 推广全族）：各弹 vanillaGated 后置读站（hurt 返值后读
  e.iframes/dontTakeDamage）被 Enemy.hurt 内写支污染,两源：①受理写支
  （Enemy.ts:14297-14298,pierce≠-3/-2/1 写 10t——pierce=0 站 251/632/461/536/856
  受理拍读恒真 → proc/numHits 恒跳,吸血域断供）;②死亡转换写支（Enemy.ts:14421
  四塔血尽转演出写 iframes=2,写支 1:1 禁改）——致死命中撞转换族必污染。
- 原版锚：免疫门 Projectile.cs:12634-12637/:12686 都读 StrikeNPC 之前态;proc
  （:13877-79）/numHits++（:14263）受理面无死亡复查。
- 处置：**已清偿（清偿刀 T,2026-09-29）**——strike 前 `snapshotVanillaGate`
  快照 → `vanillaGateRejected(快照)` 判（单源 SpectreSoulProj.ts:124-133）。
  判别测试 tests/debt-t-gate-snapshot.test.ts。
- 注：本条由 T 刀在源码注/测试立账,台账条目由清偿刀 W 补录（锚自 T 刀自注）。

## X4-债13 <a id="x4-债13"></a>

**写面档位三弹 251/632/856（hurt 受理后写 iframes 窗档位与原版写梯不符）——已清偿（2026-09-29 清偿刀 W）**

- 原版锚（Terarria1457/Terraria/Projectile.cs 写梯亲读）：
  - 251 :14032-14037 IDStatic 支：`immune[owner]=0` + perIDStaticNPCImmunity 表
    +idStaticNPCHitCooldown(10)（SetDefaults :3337-3351 usesIDStaticNPCImmunity+
    penetrate=-1）——节流归共享静态表,全局窗显式清零;
  - 632 :14056-14058 显型专支：`immune[owner]=GetSlowMagicUseTime(5)`
    （Player.cs:47425——常态 5t,slowMagicUse ×2.5=12t;SetDefaults :6807-6816 无两旗）;
  - 856 :14175-14178 usesLocal 主支：`immune[owner]=0` + 局部表写 cd=-1
    （SetDefaults :8208-8220 usesLocalNPCImmunity+localNPCHitCooldown=-1）。
  - 461/536 尾档 10t（:14180-14183）与仓 pierce=0 写面同值=无债（W 刀未触）。
- 本仓病灶：三弹受理尾 pierce=0 → Enemy.ts:14297 通用尾档写 iframes=10——
  251=静态期内误拦他型弹;632=hitCd 5t 期满后 5..10t 段被 hurt 头门（Enemy.ts:13991）
  整拒,真机节拍 10t vs 原版 5t;856=背靠背二奏 10t 内被头门整拒零伤（节流本就由
  hitOnce〔cd=-1 每敌终生一跳〕承载）。
- 处置：**已清偿（清偿刀 W,2026-09-29）**——Enemy.ts 写支零改动,三弹各按现役档位
  落刀：251 pierce=0 保持+B6D 式受理面清窗（iframes=0,Arrow.ts:9445 同范式）+
  近战域桥写（noteVanillaProjImmune face=idStatic→0）;632 受理面双域写
  win=GetSlowMagicUseTime(5)（hitCd 同源单值）;856 pierce=-3（usesLocal 族清零档,
  BJ398 656 先例,Enemy.ts:14297 现役）+受理面近战域桥写（face=usesLocal→0）,
  旧 sparkImmuneWindowClear 无条件裸清退役（拒收跳也清=over-clear）。
  判别测试 tests/debt-w-writeface-tiers.test.ts（六案;三发变异逐弹杀伤+sha256
  逐字节还原对拍）;debt-t 251 案写面旁证钉值 10→0 随刀更新（proc/入账判别面不变）。
- 选型注：pierce=-1 已被日曜爆闪 608 反击面占用（Enemy.ts:13968 勿混用注）,
  IDStatic 多跳清零档无现役 pierce 位且 Enemy.ts 写支核心禁碰 → 251 走 B6D
  弹侧补写而非新档;856 属 usesLocal 族 → -3 档语义正合（656 同族第二消费位）。

## X4-债14 <a id="x4-债14"></a>

**血尽转换放行支 kill-tick 护窗缺（清偿刀 W 定谳,清偿刀 Y 已清偿,BJ446 复核）**

- 原版语义：checkDead（NPC.cs:78841-78875）血尽转演出族即时调
  PrepareForDeathAnimation（:78835-78841 写 dontTakeDamage=true）——kill-tick 内
  后续命中全通道被 :12686 门拦。
- 本仓现状：转换放行支（Enemy.ts hurt 死亡级联内 396/397/398 :14400-14402、
  371 :14409-14411、246 :14412-14414）`return false` 放行、AI 下拍才接管——
  kill-tick 免疫只靠残余写梯值：四塔 :14421 显式补 iframes=2（有护）;放行支不补
  → pierce=0 杀手靠通用尾档 10t 顺带盖住,IDStatic/usesLocal 清零档写入方
  （567/568 孢子云三不写、656/856 pierce=-3、251 受理面清窗——W 刀后加入）
  下 kill-tick 同拍补刀可对引信态/转换态敌再命中（原版 dontTakeDamage 拒）。
- 影响面：371 爆裂泡泡引信态同拍多扣血最实际（转换前 hp 可再压）;396-398/246
  转换拍同族暴露。写支 1:1 禁改（T 刀钉）→ 正解=放行支补 dontTakeDamage=true
  或 iframes 护窗（Enemy.ts 写支核心,归属刀定夺）。
- 处置：**已清偿（清偿刀 Y,2026-09-29）**——hurt 死亡级联六分支补
  PrepareForDeathAnimation 真旗（原版 checkDead 位直调 :78836-78842
  `dontTakeDamage=true`）：月总族 396/397/398、371、246 放行支+四塔支各补写
  （盘面锚 Enemy.ts :14871/:14883/:14902/:14913,hurt 头 dontTakeDamage 门 :14457）,
  状态转换仍在各 AI 首行=台账①②架构不动;写支 1:1 零改动（T 刀钉）。判别测试
  tests/debt-y-death-conversion-window.test.ts（七案;变异=摘旗→红,sha256 对拍
  还原）。★BJ446（2026-10-03）独立复核：bj446 债14 describe 两案全绿（397 两路
  补刀拒/371 引信态全链）;原版行号亲读漂移=PrepareForDeathAnimation
  :78836-78842（登记写 :78835-78841,+1）;原版 checkDead 无 246 支（挂载头致死=
  HitEffect 召 249 :85913-85920+active 门天然拒,本仓 246 支=boss#19 架构只补旗）。
  W 刀前同面已暴露（567/568/656 先例）,非本刀新引入;本刀仅扩大写入方集合（251/856）。

## X4-债15 <a id="x4-债15"></a>

**Enemy 桶 Lovestruck 头爱心 gore 发射位未接（展示级,X4-债10 清偿刀 B 勘余,清偿刀 F 已清偿,BJ446 复核）**

- 原版：NPC.cs:92455-92466（UpdateNPC_BuffApplyVFX）对【全体】loveStruck NPC
  每拍 1/5 发射爱心 gore 331（敌怪中招同样冒心,如爱情药水弹炸敌群）。
- 本仓：Enemy.lovestruckT（Enemy.ts:1698-1700,B1 批）仅倒计时承载（"纯展示
  位倒数"）,无 gore 发射;TownNPC 侧已由刀 B 接（TownNPC.fixedUpdate,
  2026-09-29）。320 GelBalloon 敌怪侧滴落展示同族先例（projStatus.ts:85-86
  "NPC 侧无任何消费"）。
- 影响面：纯演出,无机制消费（119 对敌怪零战斗语义）。
- 处置：**已清偿（清偿刀 F,2026-09-29;P3-F1 2026-09-30 门重锚）**——Enemy.fixedUpdate
  lovestruck 倒数位接发射（Enemy.ts :2685-2690,发射调用 :2688）,单源=
  GorePiece.newLovestruckHeart（刀B TownNPC 内联实现提取,TownNPC/Enemy 共用;掷序按
  原版实参求值序修齐）。门=逐实例 canDisplayBuffs（P3-F1 翻案:原版 false 面只由
  getGoodAdjustments 置（:18040-18052）且该函数整体在 Main.getGoodWorld 门内
  （:17875-17878）⇒ 仅 FTW 世界石巨人四件拒发,普通世界照发;旧 vid 硬拒=误杀）。
  判别测试 tests/enemy-lovestruck-heart.test.ts（五段）。★BJ446（2026-10-03）独立
  复核：bj446 债15 describe 三案全绿（发射形态/1/5 门/canDisplayBuffs 门）。

## X4-债17 <a id="x4-债17"></a>

**历史会话取证测试死夹具（ENOENT 44 桶落账,清偿刀 P4 2026-09-30 入账;登记禁清）**

- 现状：历史会话取证测试死夹具 ~20 文件（tools/_iii*/_t2* 等,/tmp scratch 依赖
  ——取证会话一次性仪器,scratch 路径已随会话清理）。全量批跑命中 vitest 缺省
  include（`**/*.test.ts`,tools/ 同被扫）时以 ENOENT 崩出（单会话采样 44 处,
  非全量普查——P4 落账时点 census:tools/ 前缀 `_` 取证件 767 个,其中引 /tmp/
  路径者 426 个,死活未逐个复核）。
- 处置：登记禁清，归属原取证会话。`_` 前缀诊断件不入常规回归（一次性诊断
  脚本须经 tools/run-diag.mjs,见 CLAUDE.md）,死夹具无害;若未来清理,按「删文件
  前先 pgrep 确认无关联进程」纪律由原取证会话处置,本档不授权清。

---

## U刀-债2 <a id="u刀-债2"></a>

**槽位 CD 覆盖渲染基建整套缺（装备槽 CoolDown 族;U 刀实装 expertOnly 效益门时发现并立账）——已清偿（2026-09-29 清偿刀 C）**

- 原版锚（1457 亲读）：ItemSlot.cs:2693-2725 四分支——①context 13+item.potion
  （:2702-2707,α=GetAlpha×potionDelay/potionDelayTime）②context 13+healMana>0
  （:2708-2713,α=GetAlpha×Remap(manaPotionDelay,300,0,1,0)）③context 34 定值 0.5
  （:2714-2718）④(context 10|18)+expertOnly∧!expertMode（:2720-2725,α=White×itemFade）。
  贴图=Images\CoolDown（AssetInitializer.cs:780 TextureAssets.Cd;32×32,本仓
  public/sprites/vanilla/CoolDown.png 在库=红 X「不可用」指示）。计时面：
  potionDelay=buff21 剩余逐 tick 同步（Player.cs:11807-11809）;potionDelayTime
  每 tick 重算 3600×pStone0.75（:25674-25683,Item.potionDelay=3600 Item.cs:89）。
- 本仓清偿面：UI.ts 槽位 CD 基建（`slotCooldownAlpha` 纯函数四分支逐字+`makeSlotCdEl`
  覆盖层（inset 19.2%/61.538% 同 FX43 图标盒几何,z-index 3=绘序在图标/堆叠数后）
  +`tickSlotCooldownOverlays` 逐帧驱动（tickBuffLive 头=Game.ts:11513 onBuffsFrame
  60Hz 通道,同值守卫写≤22 格）。消费面①药水 CD：potionDelay=BuffType.Resistance
  剩余秒×60（buff 21 同构）;谓词单源=itemFuncOfVid(vid).potion（vanilla-itemfunc.json
  与 Item.cs SetDefaults 对账:potion 族 {5,28,126,188,227,499,1134,1912,2314,3001,
  3544,5496}/healMana 族 {110:50,189:100,500:200,2209:400}）;关包 lightColor.A
  因子（Main.cs:44351 选中 225/未选 187）。消费面②expertOnly CD：armor 3-9
  （ctx10）+misc[2] 矿车（ctx18——misc 逐槽语境 19/20/18/17/16,槽位刀 16 代表值
  不含 18 故逐槽枚举）;Main.expertMode≙gateExpert∨gateMaster（U 刀口径）。
- 定谳三则：②manaPotionDelay 非零写支全在 DebugOptions.ManaPotionDelay 门内
  （Player.cs:10408-10411/:52577-52581;DebugOptions.cs:28 缺省 false）=原版常规局
  死支（α≡0）,本仓无 DebugOptions 通道→计时源恒 0,分支照建（测试注入点亮）;
  开包时快捷栏整体早退（Main.cs:44324）+面板 50 格全 context 0（:41748）→开包
  【无任何 context 13 面】=覆盖消失系原版本相;itemFade（GetDimSlotForMouseItem
  :1336-1397 持物变暗）本仓未建模→恒 1（若日后建模该面,覆盖层 α 参数位已留）。
- 判别测试 tests/knife-c-slot-cd-overlay.test.ts（15 测:纯函数四分支+接线消费面+
  谓词数据对账）;变异 M1（比例式→1）/M2（摘 !expertMode）/M3（计时源→0）三发
  全红,逐字节还原+sha256 对拍（b49c3202…两侧全等）。实机探针
  scripts/_slot-cd-probe.mjs（私有端口 5341）：喝药→槽位红 X 出现（选中 0.874/
  未选 0.726 逐帧衰减）→期满消失;expertOnly 面 armor3/misc2 点亮、armor0/抓钩/
  坐骑/宠物/光源槽零;开包面板行无覆盖。证据 game/docs/evidence/slot-cd/
  （before/after/after-expiry 3× 特写+panel 全幅+report.json）。
- 边界声明：③context 34（旅程创造锁格）本仓无槽面,分支在纯函数在位=零消费面
  登记;②死支按原版恒 0（若未来接 DebugOptions 等价通道,计时源单点位已留）;
  hotbarScale ±0.05/帧缓动过渡态未建模（稳态 0.75/1 已钉）;大帧物品的 overlay
  `scale` 收缩象（DrawItemIcon finalDrawScale<1 时 X 随缩）未建模——本仓图标面
  为定盒近似,覆盖层取同构定盒（61.5%）。

---

## BJ422-债1 标尺网格亮背景 dst 衰减缺项（登记 2026-10-01）【已清偿 2026-10-03,BJ448】<a id="bj422-债1"></a>

- **债面**：标尺网格/十字加亮（DrawInterface_3_LaserRuler,Extra_68）的 Canvas 直译
  用 `'lighter'` 全额加算预乘 rgb——XNA BlendState.AlphaBlend（One/InvSrcAlpha）的
  dst×(1−a) 衰减项未实现。暗背景（dst≈0,=BJ422 用户实报域）逐位等价零偏差;亮背景
  网格覆盖像素偏亮,偏差上界 = a×dst（普通格 a=0.2num3≤0.14、十字 a=0.249num3≤0.174,
  纯白底 ≤36/255,常见亮物块底 ≤25/255）。标尺线（Extra_2）不受此债（(r,g,b,1)×k
  型色可用本色烘焙+globalAlpha=k 的 source-over 单遍精确,已落）。
- **为何不即时清偿**：精确实现需第二遍黑罩 multiply（整幅 scratch 派生+双合成,
  绘制拓扑翻新）;亮背景偏差 ≤0.174×dst 为低可见度洗白,且旧实现同背景偏暗 7×
  （双重 α）——本债是「从 7× 偏暗到 ≤0.174 偏亮」的净改善,精确化收益边际。
- **清偿路径**：drawBuilderRulers 网格段改双 pass（'lighter' 预乘 rgb + 黑罩
  'multiply' gA=tint.a）或整帧 scratch 烘焙后双合成;判别面=亮背景 A/B 对拍
  （原版帧序同一机位）。锁位 tests/sw-fx36-rulers.test.ts（★BJ422 describe）。
- **清偿记录（2026-10-03,BJ448）**：Renderer.drawBuilderRulers 网格段落
  【罩→加】双 pass——pass A 黑罩 'multiply' gA=tint.a（tintedExtra 黑模槽 2,
  α=模板 texA∈{255,127} ⇒ 逐像素 αs=texA·tint.a;黑源 B=0 ⇒ co=αb(1−αs)Cb 精确,
  PDF 洗色项恒零）+pass B 'lighter' 预乘 rgb（BJ422② 面逐位不动）。★序定谳：
  **先罩后加**——登记账原文的「'lighter' + 黑罩」字面序给 (dst+src)×(1−a)
  （src 被二次衰减+亮底先触 255 钳）,与登记账自证的代数 src×1+dst×(1−a) 相悖,
  按代数落罩先行（变异证红：倒序→白底对拍红）。α 档单源 rulerGridMaskAlpha/
  rulerCrossMaskAlpha（builderAcc.ts,floor(127·0.4|0.5·num3)/255 byte 链）。
  几何交叠普查：普通格步距 16=宽 16 相接不交叠、inset +2 贴平;十字横行×纵列
  仅交叠 2×2 块 ⇒ 竖列独立 pass C（罩→加）复刻原版逐绘序,交叠块逐位（暗域
  亦收敛:旧双加 178→原版序 163,唯一暗域行为差=该 4 px 向 vanilla 修正）。
  判别闸门 tests/bj448-ruler-dst-decay.test.ts（白底/中灰/黑底三档 × 普通格
  边框/内核/inset/十字横纵 8 探针,W3C compositing-1 算子式重放+模板 PNG 实读;
  变异双证：摘罩 5 红/倒序 6 红,还原 sha256 逐字节）。残债（登记 BJ448-观1）：
  GL shim/acc 态 'multiply' drawImage 走 rawDrawImage 逐条直绘（不进 quad 批,
  fallback 计数有噪;flushForFallback 空队 no-op 保序）——纯 2D 逐条同构,仅
  perf 观察项;pattern 平铺化批罩为未来优化路径。
- **独立复核（2026-10-06,债B 定谳刀,不复用 BJ448 刀测代码）**：①代数独立重推
  逐位吻合（罩先行 multiply 黑模 αs=texA·tint.a→co=(1−αs)·cb 精确+lighter 预乘
  rgb 加算;倒序=(dst+src)×(1−a) 有钳位险=与登记自证式相悖,盘上序正确）。②成本
  定谳：双 pass 仅 `r.gridOn`（2799/3611 背包∪装备扫描∧开关位[1]）可见帧支付,
  非每帧 ×2;活机实测 1280×800 网格全视图可见帧 +2~14ms/帧（+53~381% 噪声带,
  scripts/_debtB-ruler-wash-probe.mjs B4）=观1 的量化入账。③可感度/正确性活机
  独立验证：雪原亮底 A/B（网格开关对拍）亮底子集（dst_r>140,n=105506）
  meanΔr=−3.33<0=罩 live（旧纯加法该子集 Δr=+17t 恒正=brightwash 签名,已消除）;
  21280 changed 像素与精确式 Δc=src_c−(35/255)·t·dst_c（t∈{1,127/255} 模板档）
  ±6 内命中=双 pass 逐像素级在位。B0-B4 全 PASS;tests/bj448-ruler-dst-decay
  +sw-fx36-rulers 39 测绿。判语：**维持已清偿,无需续登记**;观1（perf 观察项）
  续登记,量化基准见上。

---

## BJ460 登记账扫尾三件（2026-10-03）<a id="bj460"></a>

**①X4-债16③ 陈旧项复核**：定谳=清偿刀 D 已全建模,条目销账（五站锚见 X4-债16 条目③
复核注）。只改账+DroneCameraTracker.ts 头注陈旧声明修正（注释级零行为;同文件
「两 AI 尚未实装」过渡注同步标过期=BJ456 已接管）。行为面回归=tests/
mp-net-camera-target.test.ts 16 测全绿。

**②breakTileBody 特支装饰近似定谳（BJ444 域外登记）**——BJ444 原判「原版对应位次
是 TileFrame 级联直清无逐格尘」**部分翻案**（级联非直清,是逐格 KillTile 逐格出尘;
但「装饰超原版」主判对巨石族成立）。逐支定谳（Terarria1457/Terraria/WorldGen.cs）：

| tile | 定谳 | 原版尘面 | 落刀 |
|---|---|---|---|
| 巨石 654+全 Boulders 集 {138,484,664,665,711-716}（TileID.cs:195=本仓 BOULDERS_SHEETS 同表） | **A 原版真无** | GetTileDustAmount :67130 case 654→0 / :67144-67177 零尘族收全 Boulders;Check2x2 级联逐格 KillTile（:48973-48983）尘亦 0→全程零尘 | 8/6 粒装饰退役（判别=破坏零粒子） |
| 门 10 闭/11 开 | **B 形态不同** | BJ444「级联直清无尘」翻案：CheckDoorClosed :87774-87786 闭门 1×3 余格逐 KillTile/CheckDoorOpen :87673-87681 开门 2×3 同——每格 ：64212 尘段（表外 default 10 粒）→原版总量闭门 3×10/开门 6×10 | 单点 8 粒装饰退役+余格逐格补 spawnTileDustAt（clearDoorAt 前=格尚在,原版尘位同相） |
| 花苞 238/236/702 | **B 形态不同** | CheckJunglePlant :48452-48463 余格逐 KillTile（被击格已死跳过）→2×2 全 4 格出尘 | 单点 8 粒装饰退役+清格循环对非被击格补 spawnTileDustAt |
| 轨道 314 | **B→按原版=退役装饰** | 仅被击格 ：64212（default 10 粒,头位已单源）;邻轨只 reframe 不破坏（TileFrameImportant 轨道段无 KillTile）=无级联尘 | 6 粒装饰退役（超原版面） |
| 锚桩 723/724 | **B→按原版=退役装饰** | 仅被击格 ：64212（:64205 DropItemForTileBreak 无 return 尘照发）;1×1 无级联 | 6 粒装饰退役 |

- 落刀面：Game.ts breakTileBody 五特支 6 处 spawnParticles 退役+门/花苞级联逐格
  尘补齐（★BJ460② 标记 9 处,含 654 支头注「尘 8×1.8」误记勘误）——尘量语义单源
  仍=breakTileBody 头 BJ444 1:1 表（TileDust.ts）,特支零自造尘。
- 判别锁=tests/bj460-ledger-sweep.test.ts（10 测：巨石零尘表锚+零装饰粒子/门闭
  1×3 三尘位+开 2×3 六尘位/花苞 2×2 四尘位/轨道·锚桩单尘位）+BJ444 尘量表回归。
- 变异一发：摘门支级联补尘行→2 红（闭/开门）;逐字节还原 sha256 对拍全等
  （fbd4d6ad…）。回归：尘域 BJ444+蜂巢/巨石/门/锚桩/轨道/MP 链 13 文件 143 测
  全绿+tsc --noEmit 零新增。

**③尘池 spawn 期屏外裁剪（BJ444 观察项）——原版语义定谳（只定谳,落刀排 BJ457
后,同域 VanillaDust.ts 在途）**：

- 原版锚（Dust.cs）：NewDust :97-101——`margin=(int)(400×(1−dCount))`,视口=
  screenPosition 外扩 margin 四向,spawn 盒=(Position,10,10) 恒定（非 w/h 形参）,
  不相交→return 6000（拒且零 RNG 消费,先于密度梯 :106-151）。dCount 阶梯=
  UpdateDust 尾 ：2465-2496 按活跃数/maxDustToDraw 分位 {0,0.5,0.6,0.7,0.8,0.9}
  →margin∈{400,200,160,120,80,40}。NewDustPerfect :52-63 无此裁剪。
- 本仓现状：VanillaDust.spawn 屏外裁剪跳过（:224-225 注,update/draw 双兜底）,
  仅密度池压梯;头注「取 400 常量门」系计划态非实现态。
- 落刀方案（排 BJ457 后）：spawn 头（ps/Perfect 载体豁免支后、密度门前,零 RNG
  早退）+update 暂存视口（screenX/Y/W/H 形参已有）+dCount 阶梯（activeCount 既有
  逐帧重数）。判别面：屏外 spawn 拒（池零新增）/视口外 margin 内照常入池/
  Perfect·prettySparkle 载体通道不裁（原版 PS 面不走 NewDust）。

---

## BJ474 蜂蜜中跑动绿叶尘（登记 2026-10-03,用户实报两次翻案后重查）**——已清偿（2026-10-03,BJ474 第三轮真机定谳+落刀,判别测试 tests/bj474-liquid-run-dust-third.test.ts 变异证红）**<a id="bj474-债1"></a>

- **定谳（第三轮,真机复现）**：真凶=**spawnFastRunParticles（跑靴快跑尘面,Player.ts:8515）在蜜中被自造速度因子误触发**。speedMult 曾乘 `(inHoney ? 0.5 : 1)` 把蜜中 maxRun 半缩而 accRun 不缩 → 尘门带 (accRun+maxRun)/2~accRun 由干地空带 [3,3) 张开为 (2.25,3) → 跑动 vx 2.86-3.02 越门。原版 maxRunSpeed/accRunSpeed 全链无 wet 因子（reset :24096-24099/moveSpeed 乘区 :25694-25695/装备链 :26184-26300）,蜜减速全在位移积分层 WetCollision movementSpeed=0.25（:28380,本仓 liqFactor 1:1）→ 原版蜜中门带同空=不触发。
- **绿叶色来源（用户装备实证,.plr 解析）**：armor[6]=665 Red's Wings（原版 case 665 `wingSlot=3` Item.cs:9175）→ 翼支 `wings==3`（Player.cs:20365）发 **dust 186**×2/tick 脚下盒（x-4,feetY,w+8,4,alpha50,scale1.5）+ cWings 染料;dye[6]=1011 **GreenDye** 染翼 → 186 渲染绿=「绿叶色」。着火状态无关（OnFire 臂对照同发）。
- **真机探针（用户存档 map-天真的钴最高点(3).json+角色,scripts/_bj474-honey-dust-live.mjs,5203 私有实例）**：修复前 1826/1826 粒全 inHoney 侧（910+1826 两臂）,干地零发;修复后同场同装备 0 粒（蜜穿越 inH 翻转 45/36 次确认）。居中湿探针够不到 1 格浅洼（差 ~5px）→ wet/wetCount 恒假=日志 wet=0 之谜底;「缓慢液体」体感=位移减速非湿位。
- **落刀**：撤 speedMult 的 `(inHoney ? 0.5 : 1)`（Player.ts:5203 区,定义处留 BJ474 注;星璇 0.3 场景因子保留）。变异回填→判据红（70 粒复现）→逐字节还原 sha256 对拍全等。回归 BJ444/457/465/474 尘域 45 测全绿,tsc 0 新增。
- **物源排除账（前两轮+本轮）**：出入液溅花（一次性 20×152 蜜支,id/色/门全 1:1,图集对色琥珀）;MakeFloorDust（草不在允许集+!wet 门,同原版）;spawnParticles 层（绿事件全远端世界演化域非玩家域）;呼吸泡面（蜜排除同原版）;掠水反馈面（门链不达）。
- **探针教训（升格）**：BJ457/465 双轮探针场景自造均未命中——本轮注入用户真实存档+角色复现一次命中;双口统计须含 game.vanillaDust 直连口（spawnFastRunParticles 绕过 game.spawnDust,wrap 池底才全）。

---

## 债A accFail 落 popAll 的静默弃队窗（鸟妖定谳刀登记 2026-10）【已清偿 2026-10-06】<a id="accfail-preopen-债a"></a>

- **债面**：`GLShimExecutor.accFail` 旧收口门 `(hadFbo || why==='nogl')`——FBO 未开
  （`!isAccumOpen('world')`,=每帧首 flush 的预解析门 'tex'/'begin' 失败窗）且非
  'nogl' 时直接 `popAll()`=整队静默弃且无 2D 重放,违背「宁回退不丢精灵」。
- **定谳**：①触发条件=acc 帧首个 flushAcc 在 `begin('world')` 前失败（预解析门
  'tex'（texFromRegion/texFromImage null:源 0 尺寸/半加载 texReady/preTex LRU 逐出）
  或 'begin' 审计窗 GL 错）;频率探针（`GLShimExecutor.accFailPreopen` 定谳仪,
  accDiag 消费）9 场景（8 群系扫掠+水池波相位 600 帧）preopen=0/accFailLedger 空
  ——健康会话零触达=潜伏窗（09-30 亚像素钳修复后 'tex' 主产地已闭）。②该窗队列
  原封未动（预解析门先于 begin——零发射零 present,FBO 本帧零内容）,2D 重放完全
  可行:degradeAcc 在 FBO 未开态安全（'nogl' 支既有路径实证:endAccumulate 无开
  会话返 null→present 跳过,仅惰性建 worldCanvas+换桥）,replay2D 全队列落新面,
  与 'nogl' 收口逐字同构。
- **落刀**：门撤除——accFail 无条件尝试 degradeAcc（自守卫 `_accMode!=='acc'`→
  false,拒绝仍落 popAll=帧不可救兜底保留）;hadFbo 仅存续为定谳仪计数判据。
  健康路径零行为面变化（探针修前修后 9 场景全同:preopen=0/ledger 空/零错误）。
- **判别闸门**：tests/b2-shim-executor.test.ts ★债A describe 4 测——'tex' 预解析
  窗/'begin' 窗两失败类必 degrade+replay（旧码 replays=0 红）/FBO 有量中途失败
  （tex2）路径不变+preopen 不计/结构锁（门回潮=红）。变异证红:旧门回潮→3 红,
  还原后 55/55 绿。
- **验证**：tsc 干净;活机探针 scripts/_debtA-accfail-probe.mjs（SW_PORT 5213）
  修前修后各一轮全 PASS。

---

## 维护约定

- 翻案/清偿某条时：在本档该条标「已清偿（日期+落刀标记）」并迁移细节至
  对应测试/源码注；禁止直接删条（保审计链）。
- 新 X 波红蓝批次（X6+）续章于此档，编号续 X4-债N 推进。
