# 专案:光照与天空渲染对齐原版(Lighting Parity Project)

> 2026-08-20 用户定案立项:"光照和原版目前有非常大的差异,日间和夜间都一样有问题,
> 比如光太阳一个的渲染效果就有着十万八千里,开个专案来单独处理"。
> 唯一标杆:`Terarria1456/` 反编译源码(数值/行为一律取 1456 最终态)。

## 0. 现状基线(2026-08-20 冻结)

- **默认路径 = 全屏乘光**(用户定案的稳定基线,"下午版本"):compositeLight 把
  光照图 multiply 到整屏。夜月亮已修(月盘注光,见 §3.6)。`?worldlayer=1`
  = 世界层分层路径选择加入(天空不进乘光,GL 精确乘,A/B 已证逐像素正确)。
- **光照引擎本体已 1:1**(种子/传播/衰减/TileLightScanner 既有工程,勿重做)。
- 差距集中在**渲染合成层与天空族**,不在光值计算。

## 1. 原版铁律(已逐行核实,反编译锚点)

| # | 语义 | 锚点 |
|---|------|------|
| 1 | 天空 = `Background_N.png`(48×1400 竖条,按群系选,不换昼夜贴图)× ColorOfTheSkies | Main.cs:61508-61516 |
| 2 | ColorOfTheSkies = SetBackColor 五段昼夜曲线 + 月相地板 11-19/255(空月11…满月19)+ 血月 25/日食压暗/群系影响 | Main.cs:62889-63361,:63230-63266 |
| 3 | tile 光种子:tileColor.C=(R+G+B+7C)/10;LegacyLighting._skyColor=avg(tileColor) 露天播种 | Main.cs:62608-62616;LegacyLighting.cs:301-307,:440-470 |
| 4 | 世界内容着色 = 每绘制 GetColor **线性乘,A 恒 255**(XNA 顶点色),无 gamma | Lighting.cs:222+ |
| 5 | 天空/日月/星/远景层/云 **从不进 tile 光照**(backbuffer 直绘) | Main.cs DrawBackground 帧序 |
| 6 | 远景群系层 ×ColorOfSurfaceBackgrounds(=ColorOfTheSkies) | Main.cs:56194 |
| 7 | 云 cloudColor、环境天空实体 GetColor bg ← ColorOfTheSkies 单源 | :58752 族 |
| 8 | 太阳 sunColor / 月亮 moonColor 曲线在 SetBackColor 内计算,随时刻/月相/事件变化 | Main.cs:62900-63250 |
| 9 | 传播:衰减 ~0.91/tile、截断 0.0185、水/蜜/裂变通道差异 | LegacyLighting.cs:1120+(已移植) |

## 2. 差距清单(现状 → 原版目标)

| # | 项 | 现状 | 原版 | 严重度 |
|---|----|------|------|--------|
| G1 | 合成架构 | 全屏乘光(天空/日月/星/远景/云全被压暗) | 只乘世界内容,天空族直绘 | ★根源,日夜通病 |
| G2 | 太阳渲染 | 贴图+旋转近似,sunColor 未接,晨昏被乘光压暗 | sunColor 曲线+DrawSunAndMoon 全链 | ★用户点名 |
| G3 | 天空渐变 | SKY_KEYS 手搓 10 键表(夜 navy 亮原版~2×) | Background_N × ColorOfTheSkies | 高 |
| G4 | 远景层 tint | 手搓 (1-0.70·night…)≈夜(0.30,0.34,0.50) | ColorOfTheSkies(夜≈0.075 剪影) | 高 |
| G5 | 云色/环境实体 bg | lastSkyTop/Bottom(SKY_KEYS 派生) | ColorOfTheSkies 单源 | 中 |
| G6 | 星星 | ×0.075 全屏乘光后近不可见 | 直绘可见(闪烁/坠落星) | 中 |
| G7 | 半透明实体乘色 | 全屏乘光(数学上恰好正确,但天空同暗) | 顶点色(分层路径已 1:1,?worldlayer=1) | 低(基建已备) |
| G8 | 月亮 | 已修:月盘注光(默认路径) | 不进乘光(分层路径天然正确) | ✅已修 |

## 3. 已备基建(本专案直接复用,勿重造)

1. **GLWorldLight**(`src/render/GLWorldLight.ts`):双纹理 shader 精确乘
   `out.rgb=世界.rgb×光.rgb,α保留` = 原版顶点色语义的 Canvas 等价。
   探针已证:昼 on/off 逐像素全等;三路径地面点一致。`?wgl=0` 逃生门。
   ★两个已踩的坑:fragment `precision highp`(uCanvas 跨级共享);
   aPos 已归一化勿再除 uCanvas(曾把 quad 缩成 1px)。
2. **worldLayer 分层路径**(`?worldlayer=1`):天空直绘主画布+世界层 GL 乘。
   2D 三步回退(copy→multiply→destination-in)。
3. **colorOfTheSkies()**(`src/lighting/SkyColor.ts`,skySeed 内核):
   SetBackColor 1:1 纯函数,单源接线入口(含月相地板/血月/日食)。
4. **moonScreen 注光**(默认路径月亮修复,SkyRenderer.moonScreen →
   compositeLight 光照图径向注光,月盘乘法≈恒等+2.2×柔晕)。
5. **A/B 量化探针**:`scripts/_wl-ab.mjs`(四象限截图+区域均值+worldCanvas α 直读)、
   `_wlgl2/_wlgl3/_wlgl4`(三路径解剖/readPixels)、`_wlmoon.mjs`(月亮点检)。
   方法论:数值断言+视觉模型双审;采样窗须锚定真实地面(向下扫实心格)。
6. **原版贴图色值实测**:Background_0 = 顶(56,49,243)/中(118,161,249)/底(132,170,248);
   满月夜理论夜空 ≈ (4,4,18)→(10,13,18)。

## 4. 里程碑(每步独立可验收,禁跨步合并提交)

> **进度 2026-08-20:M1+M2+M3 已落地**(用户定案"按原版源码设计方式落地,着色器
> 也要反编译实施";M0 金标由反编译数值锚替代,用户验收截图待回)。同批内容:
> worldLayer 分层默认开(GL 双纹理精确乘=顶点色语义)+ ColorOfTheSkies 单源
> (天空贴图/远景层/云/环境实体)+ 晨昏地平线系统(`src/lighting/Horizon.ts`:
> 梯度×4 调色板/可见性窗口/sunColor 三段/月色/bgTopY)+ 太阳双通道
> (白本体+sunColor×n12 叠层)+ 镜头耀斑链校勘修复。
> 校勘修正的既有移植 bug 三件(★"以前有移植不代表准确"实证):
> ① drawLensFlare 强度多乘一次 celestial((t·c)³·c ≠ (t·c)³);
> ② baseRot 微扰误用 sun.y(应为 Main.screenPosition.Y 屏顶世界 Y);
> ③ 日/月轨迹漏 bgTopY(整体偏低 ~200px)。
> **终轮 review(同日)再修四件 XNA 全通道乘语义/几何项**:
> ④ 晨昏渐变 Color.White×vis=vis² 贡献(ctx.filter brightness+α 精确等价);
> ⑤ 月亮 moonColor×=num13 全通道(染色值也乘,晴夜白月直绘快速路径);
> ⑥ 云量压暗天空色 :62990-62999(位置=曲线后/月相地板前,月亮地板穿云;
>    setBackColor cloudDim 参数+setFrameCloudDim 帧状态,雨天光种同步变暗);
> ⑦ 天空贴图竖向 1:1@bgTopY+max(屏高,贴图高)(:61506-61512,曾整幅拉伸=
>    渐变竖向漂移;横向 48px 平铺经三列采样证实完全均匀,整幅拉伸等价)。
> ⑧ 闪电白改走 cots 链(:63346-63355 bg 向 1 lerp,天空/远景/光种同步闪亮;
>    自创 0.85 系数全屏白闪 overlay 退役)。
> 已知未接项(登记):星星仍为方块近似(原版 Star[type] 贴图+twinkle)、
> AuroraSky.ModifyTileColor(0.08)、日食 Sun3/骷髅头 Sun2、耀斑玩家影子项
> num·−0.0002、sunScorch、sunModY/moonModY 拖拽、BackgroundDrawers 群系树顶渐变。
>
> **群系变色四块已落地(2026-08-20 续,用户指令"继续推进")**:
> 数据源 `scanBiomeLightCounts`(SceneMetrics.ts 尾:可视 tile 矩形±1..2 再
> Inflate(28)=Main.GetAreaToLight+Inflate(28,28) 逐值;计数表
> AggregateTileCounts :607-623 1:1,向日葵×−10)→ Game 每 tick 蘑菇平滑
> (±0.01/−0.02,:61380-61404)+墓园 MoveTowards(0.02/0.1,SceneState:412-418,
> 复用 weather 段单字段)→ scene.biomeLightInfluence → Renderer 帧状态 →
> setBackColor 四块(墓园×(1−0.6I)/腐化/猩红★R 用 G 归一/丛林/蘑菇★月色
> 跨通道快照语义逐字保留)+applyBiomeToSun/ToMoon+sunDim/可见性蘑菇因子。
> 端到端验证:注入腐化计数 → cots (165,115,185)=手算原版值精确命中;
> 出生点丛林带基线已带绿 tint。锁测试 horizon-parity.test.ts 群系块 7 用例。
>
> **残项清偿(2026-08-20 末,用户指令"逐个收齐,全部对齐")**:
> - ✅ **星空全量 1:1**:Star.cs 状态机(spawn 200-400/twinkle 0.6-1.0 往返/
>   rotation/fadeIn 夜渐显/1/40 大星)+UpdateStars 昼 27000 重生+
>   DrawStarsInBackground 门(墓园×(1−1.4I) 整群吞/云可见性门
>   255·(1−cloudα·atmo)−bg.R−25>0)+DrawStar 亮度公式
>   ((255−bg.C−100)·twinkle·(1−fadeIn) 均值×1.4)+位置映射
>   (1920×1200→屏+bgTopY)+坠星 8 段尾迹+StarFall(坠星实体出生时接通,
>   Projectile.cs:50204 语义);旧方块近似退役。shimmer 分支恒 0=原版跳过=1:1。
> - ✅ **日食 Sun3**:eclipse→Sun3.png+通道①暗紫(255n12,sunG·n12,sunB·n12)+
>   通道② α=(B−60)·n12(:62345-62374)。
> - ✅ **BackgroundDrawers 13 项**:BiomeBackground.surfaceGradientBands()
>   (森林四槽双带@176/179/沙漠@248/雪原@263,268,269/丛林双带@59/@284/海洋@283)
>   +SkyRenderer dither 渐隐带(colorgradientdither×cots×weight,
>   GetGradientRect drawer 版逐值);画在晨昏渐变前(DrawHorizon 序)。
> - 📋 **登记(依赖系统缺失,缺失态=原版等价 0/跳过)**→**同日全部子代理补齐**:
>   - ✅ **AuroraSky**(src/render/AuroraSky.ts 新建):状态机(±0.3/0.5s,含淡出中
>     重入不重 Activate 原版怪癖)+月相八分支(QuarterAtLeft/HalfRight return)
>     +141 段/带 Canvas 顶点色 Gouraud 等价+_lastSkyColor(:376-379 仅带0段19
>     hslToRgb)+ModifyTileColor(0.08) 接入 skySeed/cots;层序=远距云后/云背景
>     前(考据修正任务书的"日月之前"误记);shader 像素级噪声(Extra_286/287
>     编译产物)不可复刻已诚实登记;14 锁测试。
>   - ✅ **sunScorch 数值容器+AdjustIntensity 逐式**(counter 0-300/±6/−2 档/
>     scorch 分支整体替换 1−(1−lerp²)·celestial·5);吸血鬼秘密种子玩法链
>     (VampireSeedSunlightExposure/炽灼音/120 档点火链/Molten 套门)登记。
>   - ✅ **耀斑影子项真接线**:GetAdvancedShadow=60 项移动残影环,本仓等价
>     Player.advancedShadows 已接(flareShadowTerm);%1 改回 C# 保号语义。
>   - ✅ **sunModY/moonModY**:×0.999 short 截断衰减+LastCelestialBodyPosition
>     帧序(画用衰减前/锚用衰减后)+主菜单拖拽彩蛋全链(TitleMenu→mainFlow→
>     MenuBackground→SkyRenderer)。
>   - ✅ **Sun2 太阳镜彩蛋**:head 槽 12=物品 237 太阳镜(Item.cs:4273),经
>     Player.headArmorSlot(displayArmor) 透传换皮+Extra_280 α=100 叠层;
>     顺手修换皮太阳横穿轨迹错用贴图宽的既有债。
>   - ✅ **海洋背景层**(BiomeBackground):考据推翻"forest 兜底"自造——海滩
>     原版无任何树层;海洋=远景槽 3、贴图 8 变体(WorldGen.setBG case 7 掷骰,
>     28/110/111/209/210/283/332/340)、几何 scale1.15/parallax0.2/topY num3·1400
>     +1260、Y 偏移(283→−800 等);渐隐带门改 oceanTexId()===283;2 锁测试。
>   集成终验:tsc src 零错/新批 52 测试全绿/构建过/四时刻数值稳定(夜空
>   (6,7,19)≈原版理论值)。
> 验证:夜空 (4,4,18)=原版贴图×月光地板理论值精确命中;正午太阳 (255,246,204);
> 黄昏暖橙红+耀斑串+日落渐变/黎明冷紫渐变 视觉模型判"与原版泰拉瑞亚风格一致";
> tests/horizon-parity.test.ts 锁梯度表/三段曲线/HorizonPhase/ModifyHorizonLight。

- **M0 金标冻结**:请用户提供原版参考截图(正午/日落/深夜/黎明四时刻,
  地表+洞穴各一组;若有原版 .wld 更佳,见"种子等价路线图"记忆)。无金标
  不动手——本专案 2026-08-19 的教训:合成与色链分批改动=观感漂移被误判。
- **M1 天空族直绘化(G1)**:✅ 已落地(默认开,?worldlayer=0 逃生门保留全屏乘光+
  月盘注光)。验收:四时刻 on/off 截图+数值断言(天空/地面/远景带)已过。
- **M2 ColorOfTheSkies 单源接线(G3/G4/G5)**:✅ 已落地(含 ModifyHorizonLight
  晨昏渗入光种——setFrameHorizon 帧状态,光照引擎滞后一帧消费)。
- **M3 太阳渲染对账(G2)**:✅ 主体落地(双通道+bgTopY+云遮蔽数12/num13)。
  残项登记:日食 Sun3 换贴图/骷髅头 Sun2 彩蛋/群系 sunColor 修正
  (Corruption/Jungle/Mushroom 段)/sunModY·moonModY 拖拽衰减/SunGradients.
  BackgroundDrawers(群系背景树顶渐变)。
- **M4 星星直绘可见(G6)**:✅ 分层路径天然恢复(天空不进乘光)。
- **M5 收尾**:全量 vitest(4403 绿,28 失败=worldgen/城镇既有债)+构建 ✅;
  残项:默认/逃生门矩阵回归(worldlayer/wgl/bggl/mapgl)、旧全屏乘光路径
  标记 deprecated。

## 5. 风险与铁律

> **★分层架构不变量(2026-08-20 用户实报修复)**:worldLayer 分层后,【主画布
> 内容不吃光照】是设计语义(天空侧)——一切需要被光照的内容必须画进世界层。
> 教训实例:地下分层背景曾画在主画布 → 洞里恒亮且与时间无关(原版 Main.cs
> :52327+ 逐 16px 段 Lighting.GetColor 采光,与本层 lightCanvas 乘法等价)。
> 修法:BiomeBackground.draw 增 phase 参——surface 留主画布(只吃 cots 染=
> ColorOfSurfaceBackgrounds 语义),underground 画进世界层。验证:深处探针
> 双路径 (0,0,0);四时刻地表数值不变;背景族 27 测试绿。同因连锁:亮背景下
> 水缝透明像素更显眼(水缝本体修复在水体代理线)。
>
> ★**反向不变量**(同日耀斑修复):不该吃光的内容画进世界层也会被误伤!
> 教训实例:drawWorldFx(耀斑)与 LitNature 晨昏光晕都曾画在世界层内——
> 加性光效被 lightCanvas 乘暗:晨昏光照暗 → 耀斑变黑色矩形(用户实报),
> LitNature 光晕变不可见。修法:两者都挪到 compositeLight 后(帧序 7a'/7a'')。
> **分层规则双向**:需要光→进层;不需要光→出层。每新增全屏效果须先判断归侧。

- **观感耦合**:天空/云/远景/光照是同一条色链,单点改动会在其他环节放大
  (2026-08-19 worldLayer 单独上线=三症状连锁;2026-08-20 单换合成不换色链=夜景倒挂)。
- **用户验收优先于探针绿灯**:本事件两轮探针误测被用户戳穿;每里程碑交付截图,
  用户过目后再进。
- 并行会话共用 Renderer.ts(2026-08-20 chunk 缝修复同文件并行),动工前 pgrep/git diff。
- 测试基线:17 文件/29 用例失败为 worldgen/城镇族既有债(非光照),勿混入本专案判定。
