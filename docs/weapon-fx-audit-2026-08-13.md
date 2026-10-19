# 武器特效与音效全量审计（2026-08-13）

起因：喵刀（Meowmere 3063）"没有喵叫/没有彩虹拖尾/没有猫贴图"报障。
标杆修复后按同一方法对 **565 件 shoot≠0 武器 / 486 个射击弹型** 全量对账。

## 架构现状（本次确认）

全部原版武器（melee+shoot 剑族 / 投掷 / 弓枪 / magic / shot 兜底）汇入
**Arrow 类**，弹体贴图按 `Projectile_{id}.png` 数据驱动加载——**贴图层全绿**
（含 projframes 帧表与原版 `projFrames[]` 275 条赋值零差异）。缺口在三层：

| 层 | 现状 | 本次处置 |
|---|---|---|
| ① 弹体贴图/帧 | ✅ 全量正确 | 无需动 |
| ② 独占特效绘制（DrawProjDirect 特例） | ❌ 221 个射击弹型有原版独占绘制，仅 502 覆盖 | 喵刀 502 全量 1:1；其余 220 列入清单 |
| ③ 音效 | ⚠️ 每路径单通道兜底（magic 恒 tink！） | ✅ 数据驱动：582 件 Item.cs 显式 UseSound 全量提取接入（vanilla-itemusesound.json + Game.playUseSound，5 个发射点） |

## 本次修复明细

### 喵刀 3063 → 弹 502（全链 1:1，tests/meowmere.test.ts 4 例）
- **弹跳**（HandleMovement :16794-16812 专支，先于通用 aiStyle-8 tink 链
  :18165 命中——502 弹跳不播 tink）：ai[0] 计数 ≥5 消亡、全速翻面无衰减；
  前 20t 平飞后重力 0.2（:22656）终端 16
- **撞块弹跳喵叫** HandleMovement :16794-16812（全库唯一 PlaySound(37)——
  曾误接命中链，实测复核修正）：ai[0] 1..5 递增、style 5+ai0 音量爬升，
  第 5 弹消亡；命中怪物无音无计数；发射仅 Item1 挥击 whoosh
- **同敌冷却** localNPCHitCooldown 10t（:5466）替代 hitSet 永久免疫
- **彩虹拖尾** Main.cs:32495-32513：Projectile_250.png 沿 oldPos 逐段，
  旋转=段向−π/2、纵向拉伸=段长、alpha=127/255×(1−i/N)
- **迪斯科点光** :22613 (Disco+0.5)/2，DoUpdate_AnimateDiscoRGB :19441 六段±7
- **朝向** :22659 rotation=vel角+π/2、spriteDirection=sign(vx)（镜像）
- melee-shoot **穿透去 min-3 钳**（原版 penetrate=5 数据驱动，-1→3 近似保留）

### 音效数据驱动（全武器）
- `game/src/data/vanilla-itemusesound.json`：Item.cs SetDefaults 显式
  UseSound 582 件（74 个不同 Item_N + 7 命名轨）
- `Game.playUseSound(vid, fallback)`：显式优先、缺省回落原通道
- 接入 5 发射点：magic（原恒 tink！）、shot 兜底、弓/枪（bowVid 覆盖）、
  投掷×2
- copy-sfx 白名单 +135 文件（60 个 UseSound wav + Item_57/58 + 之前的 9）
- 备案：7 命名轨（DD2_五音轨/DeadCells×2/LeafBlower/PalSummon/AbigailSummon）
  需 Trackable 变体号解析，暂回落通道音

## 未覆盖独占绘制清单（220 项，按武器伤害降序取头部）

> 弹型 → 武器 item id。多数同时伴随专属 AI（光束/召唤链/爆发），
> 移植时需 AI+绘制成对（参照 502 样板）。

| 弹型 | 武器（dmg） | 弹型 | 武器（dmg） |
|---|---|---|---|
| 1100 | 5669(190) | 933 | 4956(190) |
| 857 | 4722(190) | 603 | 3389 聚能爆破炮(190) |
| 684 | 3827(180) | 503 | 3065(170) |
| 679 | 3826(156) | 636 | 3543(150) |
| 707 | 3858(140) | 643 | 3571(130) |
| 634 | 3542 星云烈焰(130) | 693 | 3834(126) |
| 261 | 1296(125) | 611 | 3473 日耀喷发(105) |
| 1023 | 5460(100) | 711 | 3870(100) |
| 645 | 3570(100) | 641 | 3569(100) |
| 633 | 3541 最后的棱镜(100) | 460 | 2882(100) |
| 451 | 2880(100) | 301 | 1513(100) |
| 554 | 3291(95) | 946 | 5005(90) |
| 262 | 1297(90) | 667 | 3820(88) |
| 856 | 4715(85) | 659 | 3779(85) |
| 409 | 2622(85) | 312 | 1784/1785(85) |

其余 194 项见 `/tmp/uncovered_specials.json`（会话级）——固化方式：
按同一脚本重跑（src/world/scripts 无；临时脚本模式见 git 无，
重算口径：DrawProjDirect(27768-34506) 的 `proj.type == N` ∩ itemcombat shoot≠0）。

### 第二批补齐（2026-08-13 下午）
- **彩虹枪 1260 → 250/251**（`RainbowProj.ts` 专用弹链 + tests/rainbow.test.ts）：
  隐形飞行头每 2t 铺 14×14 段、恒速 15.95、ai0>30 拱弧重力、撞块亡；
  段 2400t(40s) 持续、淡入 10t/中段全显/末 10t 淡出、scale1.25、light 0.3、
  **全段共享静态免疫 10t**（usesIDStaticNPCImmunity——共享钟实现，每段自衰减会
  把 10t 压成 10/N t 实测踩坑）；magic 路径 250 分流
- **泰拉刃 757 → 985**（Arrow terra 模式 + tests）：25t 消亡（非 timeLeft 90）、
  >8 速 ×0.94 减速、前方 110px 扇形视线探测失败双阻尼 ×0.8/×0.88、全程淡出、
  绿光 (64,220,96)、分层绘制对齐 DrawProj_TerraBlade2Shot（Frame(1,4) 四帧
  蓝镜像对/绿芯/黄绿主芯/帧3白芯三层）
- **星怒 3065 → 弹 503**（Arrow star 模式 + tests）：此前文档误记"3062→500"
  （3062=猩红之心宠物！3065 才是星怒，射 503 非 500——itemCombat 数据为准）。
  天降三剑（Player.cs:47107-47136：出生=玩家上方 600px 偏后 0-400px、逐剑
  +100px 高，速度朝鼠标强制 |dy|≥20 + vy 抖动，目标线=min(鼠标Y, cy−200)）；
  线上方穿墙（:22139 tileCollide 门）越线撞块；alpha 255−15/t 渐显
  （线上钳 150/线下 0）；周期 Item9 星啸 + 尘 58 尾；rotation=vel−π/2 +
  origin(17,70) 近底锚（Main.cs:29898）
- **最后的棱镜 3541 → 633/632**（`PrismProj.ts` 独占链 + tests×3）：633 晶体
  channel 主控（AI_075 :63626——魔耗节奏 30→90t 后 15→120t 后 5/aim 0.92 平滑/
  断 channel Kill/首帧生成 6 光棱）；632 光棱充能三段（<120t 散 20 线性收/
  透明 0.4→120-180t 散 16→1.75/透明→1/≥180t **伤害 ×3** + friendly 门 charge>30）；
  激光长度 LaserScan 2400 截实心（Lerp 0.75 平滑）；命中=线碰撞厚 22×scale
  同敌 5t 免疫；绘制=彩虹双 pass（hue=棱序/6 主束 26×scale×0.75 + 内白半宽，
  lighter）。玩家名色相彩蛋分支（GetLastPrismHue 30+ case）不移植备案
### 复查批（2026-08-13 晚，对照原版逐行清查近似错植）
- **泰拉刃 985 生命周期三错**（Player.cs:48313-48317 出生注入漏读）：
  ① 寿命 = ai[1]+25 = **43t**（曾 25t——ai[1] 误当 0）；② 初速 = 瞄准向×**5**
  非 shootSpeed 12（→ 原 >8 减速/探墙段恒不触发，属 973 甩剑共用段）；
  ③ ai[0]=±朝向、ai[2]=scale 漏传（绘制 ±ai0 项/scale 收缩全失效）。
  补淡入 9t/末 12t 淡出 + 34t 后 damage=0 视觉尾段 + 绘制 scale 1.5→1 收缩
- **984 旋斩弧补齐**（`TerraArc.ts`）：与 985 同链伴生（曾整件漏移植）——
  锚玩家/t÷ai1 旋进/scale 1+0.6num/opacity 拱形/Item60×0.65/Frame(1,4) 分层
- **棱镜 632 两处相位错**：轨道预旋 (−4sinθ, num725·cosθ)（曾 sin(θ+π/2)
  错相）+ spread 取 cosθ 非 sinθ；633 aim **先归一**再 lerp（曾 0.08×原始差）
- **彩虹段 251 绘制锚**：贴图中心=盒中心+(−10,−18)（num143=18/num144=−10
  绘制偏移漏读——段贴图应骑弹道上方）
- **星怒 503**：tileCollide 严格 `cy > ai[1]`（曾 ≥）
- 核验无误项：喵刀 502 全链、彩虹头 250 恒速拱弧/隐形、彩虹枪出生无
  Player 特例、星怒出生链（600px 天降/|dy|≥20/ai1 目标线）

### 第五批：真刃系六剑（2026-08-13 晚，`SwingArc.ts` + tests/swingarc.test.ts 5 例）
- **通用旋斩弧**（AI_190 :39416-39557，TerraArc 泛化进配置表）：
  972 永夜刃（num5 0.2）/982 圣剑（0.6）/983 真断钢（1.0+num6 1.2）/
  997 无头骑士（0.6）/984 泰拉（0.6+Item60×0.65）——t/ai1 旋进、
  scale=(num6+num×num5)×ai2、ai1 消亡；绘制 = DrawProj_* 四方法同骨架
  （Frame(1,4)+FlipVertically+num3 包络+分层色表，色按 :27398/:27455/:27494/:27533）
- **973 真永夜伸长斩**（AI_191 :39241-39332 + DrawProj_TrueNightsEdge :27574）：
  锚定 vel×num6²×77 前伸、旋进 π×2×(4+4Opacity)/90、寿命 ai1+65=97、
  t≥80 清伤、近墙 80px 锥探测阻尼；绘制带 oldPos 3 档残影×三向扇形
- **972 飞斩变体**（273 第二发 |ai0|<0.2 分支）：10t 起前漂 45px、30t 消亡
- **出生链**（Player.cs:48265-48317，melee-shoot 拦截先于 shootSpeed 门——
  368/1826 无 shootSpeed 曾被饿死）：273=972+飞斩 / 675=972+973 半伤 /
  674=983+982 伤害0 / 368=982 / 1826=997
- 【备案】DrawPrettyStarSparkle 星尘原语（粒子近似，同 402 先例）；
  997 南瓜弹 321（:12837→Player:41472 屏外召南瓜追击）暂缓

### 第六批：Zenith 4956 → 弹 933（AI_182_FinalFractal，SwingArc.ts 内）
- 出生链（Player.cs:48078-48121）：useAnimation 30/useTime 10 → **每挥 3 剑**；
  vel=(目标−MountedCenter)/2【非归一——轨道半径=|vel|】；ai[0]=rand(−100,101)
  轨道高；ai[1]=剑档案——**首剑 4956、后续 19 档案表随机**（FinalFractalHelper.cs
  :81-168：剑物品 id → 全刃长/拖尾色，GetRandomProfileIndex 含 4956 重掷）；
  cycle1-2 在鼠标 400px 内重定向最近敌 + ±150px 圆散布
- AI（:40434-40515）：首帧 Item169；counter += Lerp(0.7,2,GetLerpValue(900,0,|vel|×2))
  【慢则快计】；≥120 消亡；**锚点=MountedCenter+vel 随玩家移动**；椭圆轨道
  （半径 |vel|+Late×40 下限 60、高 ai0×Lerp(2,1,lv)）旋转 π+sign(vx)×phase×2π；
  ai0<0 反旋+镜像；Opacity 淡入 0-5/淡出 115-120；档案色点光
- 绘制：**本体 = ai[1] 物品贴图**（Main.cs:30174-30185 LoadItem(ai[1])——蒙太奇
  各剑的真相；基角 −π/4×spriteDir）+ 彩带拖尾（VertexStrip→canvas polyline，
  trailColor/2 alpha，lighter）
- 命中：32×32 盒穿透 -1 + 10t 免疫
- 【备案】LimitPointToPlayerReachableArea 未接；VertexStrip 着色带为 polyline 近似
- 自查修复：lerpV 递减区间钳位写反（t≥max→1 对 from>to 错，改线性后钳——
  "慢剑计数更快"测试盯住）

- ⚠️ 审计方法修正：DrawProjDirect 内还有 **`case N:` → DrawProj_XXX 独占方法
  分派**（LightsBane/NightsEdge/TrueNightsEdge/Excalibur/TerraBlade2/FairyQueenLance
  等 ~30 族）——首批只扫了 `proj.type == N` 内联分支，case 分派族未入清单
  （真刃系四剑 972-976/982-985 均在此列，续批按此口径重扫）

### 旗舰武器专项（用户优先级参考）
- 彩虹枪 1260 → 弹 **250**（彩虹铺设 aiStyle 46；Projectile_250 兼作喵刀拖尾素材）
- 最后的棱镜 3541 → **633**（充能聚束）｜星怒 3062 → **500**（落星剑）
- 泰拉刃 757 → **985**｜日耀喷发 3475 → **611**｜星云烈焰 3542 → **634**
- 喷火器 506 → **85**（DrawProj_Flamethrower 7 帧分层火焰，
  98×686 纹理帧数硬编码非 projFrames——帧表审计抓不到此类，须 Draw 源码级对账）

## 弹 AI 层备注（非绘制）
Arrow 仅实现通用运动（重力/弹跳/追踪/翻滚），221 中多数弹型的专属 AI
（充能/链段/召唤）未接——特效修复需与 `Projectile.cs AI_XXX` 成对移植，
单接绘制会"有皮无骨"。建议按旗舰顺序：250 彩虹 → 633 棱镜 → 985 泰拉
→ 500 星怒（均高使用率高辨识度）。
