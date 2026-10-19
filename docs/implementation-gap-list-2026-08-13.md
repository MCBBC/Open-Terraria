# 全量功能实装缺口清单(2026-08-13)

> 扫描器:`scripts/_impl-gap-scan.mjs`(经 `node tools/run-diag.mjs` 运行)。
> 口径:vanilla.json .items 全量 6059 件 × 原版使用画像(itemfunc+itemcombat),
> 家族派发(同 combatWeapon)+ src 代码树 vi_/VI_ID/===id/case id 数字信号 + 坐骑/钩爪家族表。
> 结论:**实装 2332 / 材料·纯装备 3656 / 候选 71 → 去伪存真后真缺口如下**。

## 一、功能未实装(真缺口)

### 1. 液体工具族扩展(6 件)——桶链已实装水/熔岩/蜂蜜(206/207/1128 ✓),缺:
| id | 名称 | 原版行为 |
|---|---|---|
| 4820 | 无底熔岩桶 | 恒量倾倒,不耗液(Item.cs:48187 DefaultToBottomlessBucket 族) |
| 5302 | 无底蜂蜜桶 | 同上 |
| 5364 | 无底微光桶 | 同上(微光) |
| 4872 | 熔岩吸收绵 | 单格吸液→饱和变体(4153 超级吸收绵已实装,同链扩展) |
| 5303 | 蜂蜜吸收绵 | 同上 |
| 5304 | 终极吸收绵 | 无限吸液 |

### 2. 墙物品放置链 —— ✅ 已销核(2026-08-13 W2-2 代理)
提取器重写(共享 case 算式/if 区间段/DefaultToPlaceableWall/嵌套 switch/goto case 全覆盖,
幂等,内置归因+墙名双闸),vanilla-wallitems.json **124 → 292 条**(↔292 墙 id 一一双射,
每条带源码行号锚);消费点 items.ts wallId 回填纯数据驱动,Game.ts 零接线;
tests/wallitems-parity.test.ts 7/7(独立向上归因算法交叉验证)。
**初判 15 件定案**:真墙 7 件入表(1957/2014/2160/2213/2434/2791/3762);
8 件假阳性(源码行号证伪)=2 泥土块(:1390)/29 生命水晶(:1706)/206·207 桶(倾倒)/
215 坐垫(:4030)/1124 蜂巢=tileWand 消耗(:13869)/1905 圣诞树顶饰(:41055)/2262 王朝瓦=块(:22752)。

### 3. 放置块 tile 回填缺口(5 件)—— ✅ 已销核(主会话 BLOCK_TILE_BACKFILL 表+回归测试):
3576 星尘碎片块(tile 418)/ 3637 白队块(434)/ 3738 呆头绿气球(448)/
2755 活性超亮火块(344)/ 2262 王朝瓦(313)。

### 4. 乐器(2 件)—— ✅ 已销核(X1 代理):
508 竖琴(音高=归一化鼠标距离 ÷SmallerScaledAxis/2 钳1 ×2−1 ×Round(·6)/6 量化,:45905
亲核;Sfx 新增 pitch 通道 2^pitch XNA 语义)/4673 鼓槌(须站鼓组 tile 486,10 档音色按距离)。
### 5. 趣味道具 —— ✅ 已销核(X1 代理):
856 棍上独角兽(useStyle16=纯声响玩具)/1345 彩带(定案纯合成材料无行为)/1450 泡泡棒
(气泡 gore 掷骰五档);**5464 Mitey-Titey 第 7 次前提纠正=放置物非玩具**
(DefaultToPlaceableTile(693,0)+consumable=false 不消耗,:43085 亲核;顺带修 4460 沙堡
桶误消耗)。**引擎级三补**:GorePiece.fixedUpdate 全仓从未接线(死亡碎块冻结+600 槽
泄漏!)/气泡 gore 族 411-430 AI 缺失/Sfx 无音高通道。26 测试+回归 131+探针 23/23 绿。

### 6. 发色剂系统(3 件)——已销核(2026-08-13 §6 会话):
**原判定"发色剂槽位未建"不成立——回源定案:原版无装备槽**。发色剂是
Player.hairDye byte(Player.cs:2412),使用即赋值(Player.cs:42179-42186
`item.hairDye >= 0` 门,1990 去除剂 hairDye=0 在内=清除),随 .plr 存档
(:53805-53808)。已落地:提取器 tools/extract-hairdyes.mjs →
vanilla-hairdyes.json(12 染料,shaderId 1..12=BindShader 执行序锚)+
src/data/vanillaHairDyes.ts + 公式模块 src/player/HairDyeColor.ts
(11 款 legacy CPU 色 1:1,暮光 3259 ArmorTwilight 像素着色器近似登记);
使用链 Game.ts 单点分支(消耗+Item3 音+useTime 17);渲染 Renderer 拆发层
(后发→本体→前发→头甲叠画,动态染料逐帧变色);存档 player.hairDye 往返
(旧档缺省 0)。测试 tests/hair-dye.test.ts(21)+探针 _hairdyeprobe(10)。
遗留登记:光照乘区随纸娃娃既有偏差面跳过 / 派对 1984 彩纸尘未接 /
MP 远端 hairDye 未同步(msg4)。

### 7. 爆炸物扩展(2 件):
4827 干燥炸弹(吸走液体) / 4909 黏性土制炸弹(黏墙爆)。

### 8. 杂项 —— 电路工具族已销核(2026-08-13 主会话):
**§8 五件扳手族定案为真缺口并已修**:items.ts 电路工具段曾是**空壳注释**——
运行时链(Game.ts:5313 使用派发/:15326 显示导线/:1842 R 键切模式/UseWiringTools
全分支)只等 wireTool 登记表,整族(509/850/851/3612 扳手、510 剪线钳、849 致动器、
3620 致动魔杖、3625 五彩扳手、3611 宏伟蓝图)手持无任何效果=死路径。
已补 WIRE_TOOL_TABLE(9 件,TOOL_* 掩码对照 Player.cs:30289)+回归测试。
**余下杂项**:1315 海盗地图 / 5334 奥库姆之刃 / 5644 水晶球(等 Game.ts 错峰)。

## 二、行为层 GAP(有入口,行为不 1:1;详见 docs/weapon-proj-audit-2026-08-13.md)

| # | GAP | 现状 vs 原版 |
|---|---|---|
| G1 | 可控导弹族 aiStyle 9/20/28 | 113 魔法飞弹/218 Flamelash/579/1262/753 彩虹魔杖=直飞;原版 channel 光标操控(Projectile.cs AI_009/AI_020) |
| G2 | 老星怒 65 落剑 aiStyle 5 | 直飞;原版天降剑(新 3065→503 已实装) |
| G3 | 食人鱼枪 AI_039(190) | 直飞;原版追踪咬住+撕咬+松手返回(:26050-26200) |
| G4 | AI_003 回旋镖 | 摩擦+低速回收;原版出程无摩擦直线、命中/撞墙/计数门回收、返回加速 0.9/上限 12、光刃 106 45t 门 |
| G5 | AI_019 长矛 | 固定单段前刺;原版 itemAnimation 分相位伸缩+reach 与动画相位相关 |
| G6 | AI_099 悠悠球 | 加速度追标;原版恒速+线长物理,线微垂,射程 220+spd×10 未溯源 |
| G7 | StatusNPC 复杂块 | 598/636/971/975/614/399-402/1107-1109 提取器 SKIP;Enemy 侧 16 debuff 字段未挂 |
| G8 | FlailProj 细节 | 757 气泡弹 928/247 自机弹 248/1058 轨道刺 405/948 入水变 947/ChangeDir 未接 |
| G9 | MagicProj 无贴图 | 纯色圆点;应走弹幕贴图+projframes 帧切片 |
| G10 | 笼子渲染 | CritterCage GAP①(放置✓渲染缺) |
| G11 | 敌弹 w×h 归一画法 | bossAI_*/TownShot 按实体盒画贴图,未逐款对账原生尺寸×scale |

## 三、验证口径备忘
- 假阳性已剔除:Boss 召唤物(70/560/1331 else 链/544/556/557)、永久升级+许可证+性别药水
  (PERMANENT_USE_VIDS Game.ts:383)、油漆工具(paintTool def 派发)、致动器(countOf 849)、
  蜂蜜桶(swap :9606)、笼子 7 件(items.ts 表)、多彩扳手(wireTool)。
- ⚠ 扫描器名字列有错位(_impl-gap-scan.mjs 的 names 正则对部分 id 取串偏移,如 29 实为
  生命水晶非"糖棒墙")——以 id + idNames.generated.ts 为准,勿信扫描输出的名称列。
- 重跑:`node tools/run-diag.mjs scripts/_impl-gap-scan.mjs`(新武器登记后续查)。

## 销核记录(2026-08-13)
- §2 墙物品 → W2-2 代理销核(292 条全量,见 §2)
- §3 放置块回填 → 主会话销核(BLOCK_TILE_BACKFILL)
- G4 回旋镖 → 代理 C 销核(WeaponProj Boomerang 重写,106 死代码门/301 AI 次计数坐实)
- G9 MagicProj 贴图化 → W2-3 代理销核(projId 尾参+旋转模式+帧切片;netSnapProj
  MagicProj 分支必须居 projId!==undefined 门前——else-if 顺序是命门)
- G10 笼子渲染 → 并行会话已实装(93 tile/33 族状态机/测试 49 绿),定案非缺口
- G5·G6 长矛+悠悠球 → W2-1 代理销核(终审抓 6 真偏差:矛绘制翻转写反/2.355 字面量/
  悠悠球 0.45 旋转/射程=型号常量与速度无关/命中盒型号表;自造公式双溯源;
  详见 docs/weapon-proj-audit-2026-08-13.md 第九轮)
- G3 食人鱼 → B 代理销核(stall 唤醒后收尾):Arrow opts.piranha 扩展(非新实体,
  复用判定盒/朝右贴图/帧切片/hurt 链基建);AI 39 全锚(:26065-26315)——咬住 16 速
  逼近/清速咬定/目标死 3000 视线转咬/直飞无追踪离主>700 返回/同主<8px 排斥;
  **与旋转表协同**:咬住清速后 atan2(0,0) 会掰头 → AI 侧 pRot/pFlip 替代 vx<0
  判镜像(draw :403/:437 分流,其余朝右族不受影响);8/8 绿)
- G1·G2 可控导弹族 → A 代理销核(stall 唤醒后收尾):新 MissileProj 实体;
  **任务前提双纠偏**:①范围收窄为 aiStyle===9(20=手持钻头 :23837/28=风动物理,
  均非光标导弹——勿挂);②族成员勘误(579=Drax 钻镐/753=海龟宠物/1262=叶绿手钻,
  真成员=113→16/218→34/495→79);老星怒 65 落剑独立于 melee 分支(:5191-5220,
  Bottom.Y≥线 与 503 的 Center.Y>线 不同 :22159);vi_495 未注册=数据层缺口;
  21/21 绿+邻近 38 绿
- 液体工具族(§1 六件) → D 代理销核(stall 唤醒后收尾):无底桶 4820/5302/5364
  倒 255 不换桶不消耗;吸收绵 4872/5303/5304 与空桶共用舀取体四邻回吸——
  **任务前提第 4 次被纠**:海绵族无饱和变体永不消耗(:45738 排除清单原文)、
  微光桶无额外交互(转化由 ShimmerCheck 承接);**顺带修旧桶链三既有偏差**
  (3031 任意<200 可倒→须空格/同类;3032 无差别清液→仅同类吸到 255;补
  mouseDown/useTime/射程三门;useTime 硬编码→数据驱动);19/19 绿;
  探针 7 PASS/4 FAIL=探针自身封闭腔问题留档可续
- §7 爆炸扩展 + §8 余项(1315/5644/5334/1905) → 2026-08-13 深夜销核:
  **§7 湿/干/岩浆/蜂蜜/土制炸弹族 4824-4827+4908/4909 整族**(任务名 4827/4909,
  同根因=共享 case 段算式 `shoot=903+(type-4824)`/`910+(type-4908)`
  (Item.cs:39461/:39787)提取器不解析→整族缺 shoot 死路径,EXTRACT_PATCH 逐件回填):
  爆炸载荷 Game.BOMB_PAYLOAD+spreadBombPayload(Kill :74007-74244 →
  RunDelegateMethodPushUpForHalfBricks :67221+FloodFillTile :2516+DelegateMethods
  SpreadWater/Lava/Honey/Dry/Dirt :601/:650/:626/:670/:464;半径水/岩/蜜 3、干 3.5、
  土 4.2;BFS 只经 plot=true 扩散=不穿墙);伤害 100/盒 48×48(:44188-44196);
  **不在 :75262 ExplodeTiles 表=不毁地形**;液体弹入液即爆(AI_016 :44267);
  911 黏性族+首贴回退/推出(:44364-44393)+速度钳 ±8(:44898)。12/12 绿。
  **§8-1315 海盗地图**:发现已在 Game.ts 入侵物品分支(361/602/1315)——
  **任务前提第 5 次被纠:1456 无夜间门**(CanStartInvasion :63863 只查无进行中+
  hp≥200,"夜间使用"系误传,白天可用);补齐成功音 Sound 15(:43280)+useTime
  45 数据驱动(原硬编码 60)。
  **§8-5644 占卜球**:useStyle15 HoldOrb/useTime100(Item.cs:44324);
  行为=观战系统(Player.cs:43011-43030 AnyoneToSpectate→SpectateNextPlayer)——
  **引擎级缺口登记:观战镜头未实装**,本仓恒走"无目标"支(Item198+
  Game.SpectateSinglePlayer 文案 1:1,不消耗)。
  **§8-5334 奥库瑞姆剃刀**:getfixedboi 秘密种子 Mechdusa 召唤物——
  SpawnMechQueen(:19724)双门(无机械 Boss 在场+SpecialSeedFeatures.Mechdusa
  =remix&&getGoodWorld 亲核)+127 主同点伴随 125/126/134/2×139+LegacyMisc[107]
  公告;**偏差登记:mechQueen 联动 AI 未实装(四 Boss 独立行动)+本仓 getfixedboi
  解析不置 remix(SeedEasterEggs)→门以 everything 兜底**;Variant 条件块提取缺口补丁。
  **§8-1905 蓝/黄串灯(圣诞树装饰族 1874-1905)**:新 world/XmasTree.ts
  (锚点双帧约定兼容:原版 frameX=10 哨兵+裸索引 vs 本仓 18px 步长;装饰位段
  frameY bits0-13=四槽);使用分支(PlaceThing_XMasTreeTops :41053-41136 同槽
  同款不动作/旧装饰掉落回收/不消耗);整树破碎(CheckXmasTree :39647-39703
  掉 1873+装饰逐件);渲染 drawXmasTreeCell(16px 紧排网格——Tiles_171≡Xmas_0
  逐字节相同,18px 采样原本逐列漂 2px+装饰层 Xmas_1/2/3/4 66px 变体+串灯 130px
  帧行动画 TileAnim 171@17t/4帧);**顺带修 repairIndexFrames 会把 wld 原生
  索引帧×18 毁掉圣诞树双约定(171 豁免)**。23/23 绿(含液体炸弹 12+杂项 11)。

## 战役终态(2026-08-13 深夜)
- **行为 GAP G1-G11:11/11 销核**;功能缺口 §1/§2/§3/§8 销核;G10 定案非缺口
- 10 代理全部完成验收(4 次 stall 唤醒收尾);4 次任务前提被代理回源纠正
- 余留队列(Game.ts 错峰后):§4 乐器/§5 趣味/§6 发色剂
  ——(§7 爆炸扩展/海盗地图/水晶球/奥库姆之刃/1905 串灯已于 2026-08-13 深夜销核,见上);
  引擎级登记:heldProj 手臂系统/491 飞刀/vi_495 注册/
  189 层数模型/D 探针封闭腔/5644 观战镜头系统/5334 mechQueen 联动 AI
- §8 电路工具族 → 主会话销核(items.ts 空壳注释补 WIRE_TOOL_TABLE 9 件,死路径激活)
- G7 StatusNPC 复杂块 + Enemy 16 debuff → W3-1 代理销核(提取器 +5 形状,表 98→110
  型号;16 字段全行号锚;**顺手修两真 bug**:Oiled 旧"翻倍"系误读=六火系单块 flat−50
  (:92728)、Slimed 翻倍旧只接 onFire 补齐六系;huntressT2 套装门贯通;27 新断言绿)
- G8 FlailProj 细节 → W3-2 代理销核(前提纠偏:特殊弹型已由并行会话落地,转对账修
  偏差——ChangeDir 七态全锚(:41195-41380)/757 迟 1t/247·1058 旋转式与淡入/FlaironSpike
  α 方向写反+scale 误改命中盒/撞墙位移回卷+单响 dig/**case 3 死状态**(1456 无 ai[0]=3
  入口,"飞行中再按"是旧实现自造);heldProj 手臂向=引擎级登记;42/42 绿)
- G11 敌弹画法对账 → W3-3 代理销核(自绘 9 款失真修复:**683 原版 alpha=255 根本不绘制**
  (:7003 亲核,旧实现画 640px² 幻影)/961 6.25×失真+旋转错/962 网格错/456 胶片条/965 漏镜像/
  813 2.25×;TownShot 29 型全量改规格表驱动:10 旋转档+9 源帧切片+scale 接通;75 断言+
  回归 171 绿;盘点工具 _enemy-proj-draw-audit.mjs 留档)
