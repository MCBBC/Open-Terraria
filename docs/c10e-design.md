# C10e 分体画布呈现架构（一期设计定谳）

> 2026-10-01 · 旗灰度 `?c10e=1`（缺省关=现架构零变化）。Windows SHM 实测主线程被
> GL 画布→2D 画布全屏跨上下文拷贝钉死（每帧 2-4 次 × 1.5-2.5ms）；C10e 把跨上下文
> 拷贝在常态帧归零：GL 唯一呈现面 = 可见 DOM 画布（glCanvas），2D 内容分居
> sky2D（底）/HUD（顶）两块透明画布，DOM 合成替代像素拷贝。

## 一、三画布栈

```
DOM #game-root 内（append 序=paint 序）：
  [0] sky2D   (2D, alpha:true, pointer-events:none)  天空渐变/自然星2D回退/日月/远云2D/群系bg2D回退/天气色罩2D回退
  [1] glCanvas(WebGL2, alpha:true premul, preserveDrawingBuffer, pointer-events:none)
       = GLPipeline.canvas 注入的可见 DOM 画布 —— 唯一 GL 呈现面
       帧内栈式 present（premul source-over）：自然星GL批 → bg会话(远云+biomeBg+近云+黑闪)
         → 天气色罩GL quad(分回合帧) → 世界合成(opresent 合并/单 present) → [人工星会话(踩踏+restack)]
  [2] HUD     (2D, alpha:true —— mainCtxAttrs 在 c10e 下强制 alpha:true，opaqueMain 失效)
       世界 present 后的一切 2D（原绘制代码零改动，只换画布归属）：
       夹层族(灯笼near/气球/环境实体/通关名单/veil+人工星2D)/死亡灰化/重力翻转自拷/
       荧光涂层/镜头光斑/全亮族/滤镜链输出/飘字/黑幕/F5标注/地图全屏/小地图/资源条…
  [z-300/301 cursor/icon 覆盖层] 现状不变（DOM 兄弟）
```

GL 会话面（swPipe 单上下文，FBO 驻留不变）：`sstarn`自然星 / `bg`远云+biomeBg+近云 /
`world`世界累积 / `lit`·`warped`·`opresent`世界合成 / `sfxA/B`滤镜链 / `wtint`天气色罩quad。
B1/B2b 世界层链零改动（FBO('world') 直采 compose；桥接/降级帧的内部 present+blit 保留，
C10e 下补 restack——见 §四）。

## 二、present 位清单（GL→2D 拷贝点全量，行号为 2026-10-01 盘面）

| # | 位 | 现行为 | C10e 处置 |
|---|----|--------|-----------|
| P1 | Renderer:3365 presentPendingSky 补贴 | present+全屏blit | 屏 over present（入栈），删 blit |
| P2 | Renderer:4953 bg 会话 split 收口 | end+全屏blit | end(over)，删 blit |
| P3 | SkyRenderer:2599/2647 drawCloudsNear merged 收口 | end+全屏blit（defer 时无） | end(over)，删 blit |
| P4 | SkyRenderer:2651 cloudBlitRect（'both' 批会话 bbox） | end+bbox blit | end(over)，删 bbox blit（全屏 over quad ≤ bbox blit 成本） |
| P5 | SkyRenderer:4368 自然星 'sstarn' blit | mini-session+blit | end(over)，删 blit（glCanvas 内层序=biomeBg 前 ✓） |
| P6 | SkyRenderer:1409 人工星 'sstars' blit | mini-session+blit | 保留 blit→HUD（veil 在 HUD，星同层序）+ restack（present 踩踏屏面） |
| P7 | Renderer:19074/:19339 世界合成回贴 | compose 内 present+全屏blit | 合并帧=compose 尾 present(over)，删 blit；夹层帧=present+blit→HUD+restack |
| P8 | Renderer:19361 旧链(wfbo=0) warped/gl.canvas | 全屏blit | 不变（异上下文必 blit→HUD；夹层帧同） |
| P9 | Renderer:18991/:19397 fullbright·lightFast accFbo | present+全屏blit | 纯帧=over 删 blit；夹层帧=blit→HUD+restack |
| P10 | Renderer:3185 degradeAcc 内部 present | present+blit→worldCanvas | 不变（内部读回）+ restack |
| P11 | Renderer:5260 bglStageGrid 桥内部 present | end+blit→worldCanvas | 不变（内部读回）+ restack |
| P12 | Renderer:20627 地图 GL(glfx 异上下文) | 全屏blit | 不变（开图期低频，一期取简=HUD 上 blit） |
| P13 | Renderer:14524 拖尾 glfx | 'lighter' blit | 不变（异上下文，战斗期低频） |
| P14 | GLScreenFilters drawChainPipe 末 pass | present+全屏blit | 不变（输入换 scratch 合成画布，输出 blit→HUD；glCanvas 被踩但 HUD 不透明覆盖） |
| P15 | SkyRenderer drawWeatherTint2D（分回合帧） | ctx.fillRect | C10e=GL mini-session fillQuad(over)；回退=fillRect(ctx=sky2D 路由) |

## 三、层序表（每元素 → 目标画布与 z 位）

| 层序 | 元素 | C10e 目标 |
|------|------|-----------|
| 1 | 天空渐变/黑场 fade | sky2D |
| 2 | 自然星（GL 批/2D 回退） | glCanvas 栈底 / sky2D（GL 死时） |
| 3 | 日月/塔天空/极光/2D 云回退 | sky2D |
| 4 | 远云 pass1（stash→bg 会话首段） | glCanvas（bg FBO 内） |
| 5 | biomeBg surface + 群系切换黑闪（GL 会话内联） | glCanvas |
| 6 | 天气色罩（分回合帧） | glCanvas（GL quad）/ sky2D（2D 回退） |
| 7 | 近云 pass2/3 | glCanvas |
| 8 | 灯笼near/气球/环境实体/通关名单（夹层族） | HUD |
| 9 | veil+人工星空（shim>0） | HUD |
| 10 | 世界层（墙/tile/实体/水/粒子，光照乘） | glCanvas（合并/单 present）或 HUD blit（夹层帧） |
| 11 | 世界 present 后 2D 全家族 | HUD |

层序不变式： porter-duff over 结合律 —— glCanvas 栈式 over 链 ≙ 原单画布 2D 序列
（半透明重叠像素 ±1~2LSB = cloudbatch/C10b GC·GD 备案族）。

## 四、C10e 帧分类与路由

帧头定谳（全部状态帧头已 settle）：`c10eFrame = Renderer.c10e && !_capturePass &&
!isCpuRender() && wK===1 && !sky.farInterlayerActive()`。

- **F-pure**（常态）：sky→sky2D；GL 栈式 present 全家；HUD=post-present。**跨上下文拷贝 0 次**。
- **F-inter**（`opresentInterlayerPending() || shimA0>0`）：sky/GL 栈同 F-pure（bg 会话
  照走）；夹层族+veil+人工星落 HUD（绘制代码零改动，主 ctx 即 HUD）；**世界 present
  改 blit→HUD + restack**（1 次拷贝）。
- **F-tint**（hasSkyWeatherTint）：bg 会话 split + 色罩 GL quad + 云会话，全 GL 栈；
  世界照栈。0 拷贝。
- **F-xform**（死亡灰化/重力翻转，全帧自拷消费者）：
  - 纯帧：compositeLight 后 sky2D+glCanvas→HUD 合成（1 次拷贝），自拷语义逐位保持。
  - 夹层帧：合成提前到夹层族绘制前（HUD-start），随后世界 blit→HUD。
- **sfx 滤镜链帧**（passes 非空）：链输入换 **scratch 合成画布**（sky2D+glCanvas+HUD
  三 blit，其中 glCanvas→scratch 1 次跨上下文），输出 blit→HUD。链前 HUD 绘制不受污染。
- **F-lowres / cpuRender / 拍照**：整帧回退旗关行为（sky→主 ctx=HUD，全部 blit 照旧；
  HUD 不透明天空覆盖 glCanvas 残影，无需隐藏切换）。
- **GL 死亡窗**：各 acquire 失败→既有 2D 回退自然落位（bg 2D 路由 sky2D；世界 2D 链
  blit→HUD）；glCanvas 隐藏（陈旧屏防鬼影）；pipe 复活恢复。
- **远云夹层帧**（极光/far 灯笼，farInterlayerActive）：整帧回退 F-lowres（任务书一期
  边界；二期夹层纹理桥另批）。

## 五、restack 机制（内部 present 踩踏屏面 Restoration）

GLPipeline 增设屏直出栈：`screenStackMode`（Renderer 注入）/`clearScreenForStack()`
（帧首层 begin 触发一次：清透明+清栈）/`present(src, over)`（over=premul source-over
+入栈）/`restackScreen()`（清+按栈重放）。凡「present 后 2D 读回 pipe.canvas」的内部
位（P6/P7 夹层/P9 夹层/P10/P11/P14）在 C10e 下 blit 后调 restackScreen，恢复
「glCanvas=本帧屏栈」不变式。

## 六、回退语义

- `?c10e=0`（=缺省）：单画布架构零变化（所有分支旗外死代码）。
- 旗内运行时回退：cpuRender / 拍照 / 低清档 / GL 死亡 / 远云夹层 → §四帧分类自动落位。
- canvas 属性定死约束：HUD 画布构造期即 alpha:true；回退帧以不透明天空填充获得
  覆盖力（与 opaque 语义等价）；cpuRender 全量 2D 帧同样覆盖。

## 七、验收记录（2026-10-01 一期收官）

- **结构/路由（scripts/_c10e-ab.mjs,12/12 PASS）**：GA 三画布栈+呈现窗开（B 臂
  `isC10e/glShown=true`）；GD 路由账面相干——纯帧 `lrecon+opresent` 合并账、重力翻转
  帧 P2 全帧合成触发（composite=58）、B 帧间确定全相位 PASS。
- **像素定谳（scripts/_c10e-diag.mjs 冻结态范式）**：同种子+出生冻结+同状态整帧比较，
  A 臂单画布 vs B 臂三画布 DOM 合成 **全帧逐字节 n=0**（昼地表基线）。
- **源锚锁 tests/c10e-split-canvas-stack.test.ts（24/24）**：三画布脚手架/present 位
  P1-P15/逃生门/帧分类/屏栈机制结构锁全绿；C10 家族既有锁随盘刷新（a0/c10a/c10b/
  opresent/a1/a2/r1b-beta）全绿。
- **对拍方法论文档（v1-v5 教训，探针沉淀）**：跨 evaluate 捕获夹真实时钟漂移；世界
  模拟手动步进点亮 RNG 依赖系统（云种群/树摆/落叶/火苗种子/光照增量态=五起伪差源，
  对照实验 A-vs-A2 同源复现、tile 数据两臂全等=非呈现面差异）；ImageData 经 CDP JSON
  传输炸页（base64 传输）；相位矩阵 diff=INFO 级（世界态残差），像素定谳走冻结态整帧。
- tsc 零新增错误（ dye 域 3 条=并行会话在途）；全套 vitest 既有红=并行域
  （bj378/extract-tables2/render-v2 shim accFail 签名/b1-clamp 网络域等），C10 归属
  全数清零。

## 八、实机断裂补充定谳（2026-10-01,呈现在逃 Bug 收口）

**实报**：?c10e=1 实机 sky2D/bg 会话/HUD 热栏心 ✓,但世界层（地形/玩家/NPC）完全
不可见,glCanvas 只剩 bg 会话内容。

**根因（布局与背板劈叉,非呈现链断裂）**：sky2D 画布未出流——`display:block` 进正常
文档流占位（布局高=背板高 800px）→ 流内 HUD 画布被顶出视口下缘 800px=DOM 不可见。
F-inter 帧（环境实体驻留期,`opresentInterlayerPending` 含 ambEntities,活机长期
true）世界 present 走 HUD blit →世界随 HUD 一起出视口=「世界层消失」。glCanvas 为
absolute 不受影响=bg 会话照常可见（与实报逐项吻合：渐变✓/bg✓/热栏✓(DOM VUI 层)/
世界✗）。

**为何冻结态对拍未暴露**：对拍抓的是三画布 **canvas 背板**（drawImage 读 backing
store）而非 DOM 合成布局——背板内容正确（HUD 回读有世界,hudCenter=肤色实证）,
布局劈叉不进背板=方法论盲区。修复后新增「活机零钉面长时采样+DOM 截图」探针
（scripts/_c10e-live.mjs）补此盲区。

**修复**：三画布全部出流 absolute 铺满（sky2D/HUD 构造期 cssText,glCanvas 既有）,
paint 序仍由 attach 挂载序保证；指针事件仍由顶层 HUD 承接（同 rect）。

**修复后验证**：
- 活机零钉面长跑（scripts/_c10e-live.mjs）：环境鸟群驻留期 F-inter（HUD blit,世界
  可见）→鸟群离场自动转 F-pure（`lrecon+opresent`+opresentUsed=true,glCanvas 中央
  =玩家像素=世界 present 落屏实证）；DOM 截图地形/树/玩家/猩红矿/小地图全在位
  （shots/c10e/live-16s.png）。
- 冻结态整帧比较 n=0 复跑 ✓；路由套件 12/12 复跑 ✓；源锚锁 24/24（新增出流锁）。
- dist-analyze 重建 ✓。

**连带登记**：环境实体（鸟群 10-120s 周期驻留 10-30s+）使活机大量时间处于 F-inter
（世界 blit 1 拷贝/帧）——C10e 零拷贝收益在此窗口折损；二期夹层纹理桥（ambience
quads 入 GL 栈）为回收路径,与极光/far 灯笼桥同批。

## 八b、实机拖影/远景丢失补充定谳（2026-10-01 第二轮）

**实报三症状**：①glCanvas 帧内容累积型拖影（太阳横带/落日彩带拉丝/小眼球圆环轨迹/
彩虹魔杖大弧,随场景移动增长）；②远景/远云消失约 1 分钟,「卡了一下」后恢复；③恢复
后仍有拖影。

**根因（头号嫌疑坐实+连带挖出 revive 中断 hazards）**：「帧首首个会话 begin 代理
清屏」的隐式机制失效面——①**管线帧中 revive**（实报「卡了一下」=5s 退避后
reviveSwPipe 换元）：新管线实例 `screenCleared=false` → 世界段 `begin('world')`
的代理清屏在 bg 会话已 present 之【后】触发=清掉屏上 bg（远景丢失）+屏栈句柄随旧
上下文失效（over 叠合空屏=拖影);②帧类切换/星场 mini-session 先于 bg 会话等时序
面,代理判定覆盖不全=整帧无清屏（拖影累积签名）。

**修复（采纳协调者方案）**：**废除 begin 代理清屏**,改 `Renderer.render()` 帧头
（任何 GL 会话开之前）对 glCanvas 默认帧缓冲 `clearScreenForStack()` 显式清一次
透明+清屏栈——确定性每帧干净底板,`present(over)` 叠合语义不变;`screenCleared`
闩字段随代理一并废除;`restackScreen` 复核=目标恒默认帧缓冲（bindTarget(null) 先
行）无错位。**revive 连带 Hazards 一体消除**：新实例屏栈空表+帧头显式清屏=跨上下
文句柄面归零。

**修复后验证**：源锚锁 24/24（新增「begin 内零触碰 clearScreenForStack+显式帧头
清屏位+bindTarget(null) 目标锁」）;C10 家族 8 文件全绿;tsc 零新增;活机长跑
（Boss 战动态场景）截图无拖影（轨道/地面边缘锐利）;冻结态对拍与路由套件同范式
复跑通过;dist-analyze 重建（index-IVipaA5k.js）。

**若实机仍有残留拖影=第二写入面排查清单（按管线调用图穷举）**：mapGL/glfx（异画
布,不在 glCanvas）、sfx 链 present（blend-off 直写,读回后无 restack——filter 帧
glCanvas=链结果被 HUD 覆盖,理论无泄漏）、waterWarp 旧链（异上下文）。三者均不写
glCanvas 屏栈语义面;若实机复现请抓 Frame 段 trace 定位。

## 八c、前景拖影第三轮定谳（2026-10-01）——HUD 无帧头清屏

**症状**：地形/人物/怪物拖影，仅出现在【无背景墙】位置（夜空区巨弧），120fps 实机。

**定谳**（活机三画布同区原像素读回 scripts/_c10e-trail-locate.mjs：全宽细条带
R-G>40∧R-B>40 计数——细弧降采样会被背景稀释，判别器必须原像素）：拖影红像素
**hudRed=125 vs glRed=0 / skyRed=0** → 宿主=HUD 画布（主 ctx）。

**机制**：单画布时代帧头天空渐变（全幅不透明）自净主画布；C10e 分体后渐变落
sky2D，HUD（alpha:true）帧头再无垫底。F-inter 帧世界 blit（drawImage source-over）
上帧残留——本帧不透明区（墙区）被覆写、透明区（无墙/天空）原样保留 → 逐帧叠合成
弧；F-pure 帧不新画但陈旧残留持续可见。复现面=夜晚+走路+F-inter→F-pure 迁移窗。

**修复**：Renderer.render() 帧头（与 glCanvas 帧头清屏同区）对 c10e 帧
clearRect 主画布（identity transform save/restore 包裹）。回退帧/照相帧不在此清
（天空渐变自净语义保留）。验证：20s 走路×路由迁移 hudRed 全程 0（修复前 8s 即
125）；白天全要素在位；夜晚与 ?c10e=0 基线同黑度（无回归）；C10 家族 60/60。

## 八d、条带武器黑块定谳（2026-10-01）——透明 HUD × a=1 暗纹素

**症状**：HUD 清屏修复落地后，天顶剑/彩虹魔杖等条带族武器拖尾整体发黑（亮弧外圈
巨大黑带）。

**定谳**：obj58/obj55 条带 shader 历史上恒写 `a=1`（防预乘读出 rgb>a 钳暗——旧
不透明主画布时代 alpha 无观感，flushTrailShade 注释自证「opaque 主画布 alpha 抬升
无观感」）。C10e 透明 HUD 上 'lighter' 连 alpha 一起加（out.a=sa+da）→ 暗 texel
(rgb≈0,a=1) 变不透明黑=条带几何全域黑块。

**修复**：两 shader `oC = vec4(oc.rgb, max(oc.r, max(oc.g, oc.b)))`——①a≥每通道
=预乘读出零钳制零色移（与恒 1 同 rgb 字节）；②旧不透明画布 'lighter' 只加 rgb
不读源 alpha=逐位不变；③透明 HUD 暗处 a≈0 保留 dst=黑块根除；④GL 侧 (ONE,ONE)
累积 rgb≤a 不变式保持（各片 rgb_i≤a_i ⇒ Σrgb≤Σa）。

**验证**：探针 scripts/_c10e-strip-black-probe.mjs 发 Zenith(4956) 实挥——剑龙卷
条带全弧干净无黑带；bj112c-trailshader/gl-layer-regression 11 测绿；c10e 套件
26/26（含 shader alpha 锁+lighter 上屏链锁）。obj55（彩虹魔杖）与 obj58 同 glfx
画布同 flushTrailShade 上屏链，同刀覆盖。

## 八f、K1 滤镜链源分档（2026-10-01,日曜柱 trace 定谳后续刀）

四柱战 Monolith* 屏面滤镜每帧走 c10eChainSource 三画布折叠（DPR2 全幅 drawImage×3
+链结果全幅 blit）≈15% 墙钟=柱战 60fps 主因之一。**定谳修正**：原处方「F-pure 帧
7d 时点 HUD 为空」被证伪——compositeLight 后存在整段 HUD 覆盖层（死亡灰化/涂层/
tile shine/尘/智能光标/拖尾/网格/镜像等），原版采集界 Main.cs:63050→63279 证明
其必须入滤镜输入。

**落地=合成即折叠**：`_c10eFilterPending` 帧头谓词（保守超集）→ P1/P2 合成门拓宽
（滤镜活动帧在 7x 覆盖层前完成 sky2D+glCanvas→HUD 合成）→ `c10eCompositeIntoHud`
改 destination-over+gl→sky 逆序垫底（既有 HUD 覆盖层恒保序其上;空 HUD 帧与
source-over 逐位同）→ 链源分档：合成帧取 `this.canvas`（HUD 本身,零折叠 scratch
清屏+零 HUD 腿搬运）,非合成帧照旧 c10eChainSource 三腿;2D 回退链保留折叠（源取
HUD 有自绘读写别名）。逃生门 `?c10ek1=0`。A/B：纯帧∩滤镜/xform∩滤镜逐字节 n=0。
**K1-2 二期债**：屏栈 FBO 直入链（sky 单腿上传+stack FBO premul 重放）——需
GLPipeline.screenStack 开栈口,设计已定型存探针头注。

## 八e、二期鸟群 GL 桥（2026-10-01,F-inter 收刀）

**普查定谳**（scripts/_c10e-inter-census.mjs,120s×240 样本）：F-inter 240/240 全由
**鸟群驻留**触发（空转帧 0——谓词收紧刀判死）；1-2 只小精灵逼全帧 blit+restack。
**收刀后**：F-inter **0/240**,鸟群 GL quads 照画（屏栈读数 `bg|ambgl|warped`）。

**机制**：drawAmbience 增 GL 发射支——ambPlan 单源（2D 循环与 GL 共用位置/染色/α/
翻转计算,防双路漂移;星批 starCompute 同范式）→ 'ambgl' mini-session 逐鸟
quadSprite（rot+flipX ≙ translate·rotate·[scale(-1,1)]·drawImage 中心锚,R·F 复合
序两路同;尺寸×k=ctx 均匀标量）→ over present 入屏栈（bg 后/世界前）。染色缓存
AMB_TINT_CACHE key 稳定 → texFromImage 一次驻留。all-or-nothing 纹理预解析先于
begin（B2b 判例）。

**谓词分工**：新 worldRouteInterlayerPending（=旧谓词去鸟群三项）驱动世界路由;
旧 opresentInterlayerPending 原样保留驱动 opresent 延迟门+合并门（鸟帧禁 pass3
合并——合并 present 是天空+世界单 quad,鸟 quads 无法插入其间会被云盖;分回合
bg present→鸟 quads→世界 present 才是正确层序）。

**边界**：lantern/party/slime/martin/drama 未桥化=其帧保持 F-inter 1 拷贝（灯笼夜
另被 farInterlayerActive 帧头门罩住,桥化近灯无收益——判死）;极光窗同。调用点门
`_c10eFrame && swPipe.screenStackMode`（revive 窗 2D 兜底）。

## 十、转正（2026-10-01）

灰度期 `?c10e=1` 显式开 → 三轮实机定谳（§八b/八c/八d）+ 二期鸟桥（§八e）收刀 →
Mac+Windows 实机通过（用户令「A1 应该 ok，可以先转正」）→ **缺省开**，`?c10e=0`
=二级逃生门（逐帧回退语义不动：回退帧/回退类/拍照/CPU/低清/菜单走原单画布行为）。
旗面史注存案在旗内（防无证据动旗面）；c10a/c10b 双注入点强制共管语义不变。

## 九、已知边界（登记）

1. 夹层帧/滤镜帧/死亡帧/重力翻转帧保留 1 次跨上下文拷贝（低频帧，仍优于现状 2-4 次）。
2. F-lowres 帧世界回贴走 HUD drawImage 拉伸（平滑语义同旧链）；glCanvas CSS 拉伸仅在
   GL 死亡窗可见（隐藏）。
3. 会话中途 pipe 死亡：glCanvas 残影窗（下帧 acquire 自愈，既有语义族）。
4. `?cloudpipe=0`/`?bggl=0` 逃生门在 c10e 下语义收窄：cloudpipe 强制共管（C10e 呈现面
   依赖 pipe.canvas=DOM）；bggl=0 时 bg 2D 回退路由 sky2D（层序保持）。
5. opaqueMain（?opaque=0）与 c10e 互斥：c10e 下 HUD 恒 alpha:true。
6. CaptureMode 拍照整帧回退旗关行为（_capturePass 门）；F5 报告截图走 DOM 合成面。
