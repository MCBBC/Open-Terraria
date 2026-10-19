# 合成配方全面审计（基线 1457 反编译，2026-08-23）

解析器：/tmp/audit1457/parse1457.py（状态机 + for 展开 + SetIngredients/SetCraftingStation/数组表）
原版解析：2827 条（去重 2814）| 我们：vanilla-recipes.json 3342 条

## 审计结论表

| 审计项 | 结果 | 依据行号 | 状态 |
|---|---|---|---|
| 配方总量对照 | 1457=2814(去重) vs 我们=3342 | Recipe.cs:604-15159(SetupRecipes)+43 子方法 | ⚠️ 差异待甄别 |
| 成品种类覆盖 | 1457 2678 种 vs 我们 3154 种；1457 有我们无=仅 id 0（无效噪声） | 同上 | ✅ |
| 材料级精确匹配 | 2668/3342 (79.8%) | 对称组语义 diff（组代表↔假 id 对齐） | ✅ |
| 材料数量/组成错 | ~200 条（2527/858/2398-2413/3150 族 [225x1,Mx1] vs 1457 [225x2,Mx5] 等；5924/5953/1872/5930 互换族；4033/4031/4022/4024/4014/4019 族材料全空 vs SetIngredients 实材料） | Recipe.cs:4880-5618/1157-1298 | ❌ → 代理 A |
| 我们独有配方甄别 | 657 条中 ~400 条空材料占位（4033 族/3884-3920 族）+ 组标记差 17 条（多标 24/27） | vanilla-recipes.json | ❌ → 代理 B |
| 1457 独有配方 | 129 条（与数量错同源 + create 0x4 无效 1 条忽略） | Recipe.cs 行号见 /tmp/audit_final2.txt | ❌ → 代理 A |
| 丛林植物帧级掉落 | 61/74/703 帧表已补（前轮） | WorldGen.cs:65017/:65660 | ✅ |
| 贴图对应审计 | 配方涉及 item sprite 存在性 | assets 索引 | ❌ → 代理 C |
| 合成站条件 | tileCountsAs 表 + requiredTile 全量对照 | Recipe.cs:549-566(AddTileCountsAs) | ⏳ 代理 C 顺带 |
| 环境条件 | needWater(12)/Honey(7)/Lava(5)/Graveyard(110)/Snow(1)/Mechdusa(1)/TorchGod(2) | Recipe.cs 各配方段 | ⏳ 代理 C 顺带 |

## 缺口清单（机器可读）
- /tmp/audit_final2.txt — 三类完整清单（含 1457 行号）
- /tmp/v14_unique.json — 1457 解析配方全量
- /tmp/audit1457/parse1457.py — 解析器（可重跑）

## 修复派发（全部完成，2026-08-23）

| 代理 | 结果 |
|---|---|
| A 材料/数量 | 改 323（空材料补 276/stack 26/缺材料 12/tile 9）+增 34（水晶球变体 21/雕像 4466/Pine 12）+Turtles 组；**避免一次误修**（3665-3704/4327-4332 的 1457 侧 None 是解析盲区，我方本正确）；精确匹配 3278/3278，三类缺口清零 |
| B 独有甄别 | 657"独有"全部=解析器 4 盲区假信号（带参辅助方法/雕像配方/算式 SetDefaults/obj 覆写），扩展器 full1457.json 3313 条，**零删除**；组标记 20 条全正确 |
| C 贴图/条件 | 贴图 0 缺失（3757 id，TextureCopyLoad 族抽验等价）；合成站/液体/墓地/雪原全等；mechdusa/torchGod 已接线（vanillaRecipes.ts envOk + json 3 条 + Game.ts ctx） |

最终：3376 条（count 键已同步）；残余 98 条"我们独有"=反向墙配方（CreateReverseWallRecipes :16744 运行时生成，合法非缺口）。
备份 /tmp/vanilla-recipes.backup.json；脚本 /tmp/audit1457/{parse1457,expand1457,verify_fixes}.py

## 全量复核（2026-08-23，独立实现）
| 检查 | 结果 |
|---|---|
| json 结构完整性（3376 条/无重复/无畸形/count 同步） | ✅ |
| 空材料配方 1457 覆盖复核（0 条真缺） | ✅ |
| 上轮错例抽样（水晶球族 29 变体逐条） | ✅ |
| 新增配方旗标（4466 graveyard/5573+5638 torchGod/5334 mechdusa） | ✅ |
| Turtles 组（33 = 4464/4465） | ✅ |
注：复核脚本首两轮 FAIL 均为脚本自身元组排序/嵌套错误（数据无误），修正后 OK。

## 附：1457 新物品波（6147-6195 共 49 个）落地（2026-08-23）
中文名（官方译名）+id-maps 闭合+value 回填完成，道具搜索可见（含太阳花法杖 6152）。
遗留登记：弹 1112-1123 投射物数据、Palworld buff/坐骑、vanilla-itemvalue.json
sellPrice 提取器系统性 ÷5（全游戏卖价/重铸费偏低，建议单独波修）。

## Palworld 系收口（2026-08-23）
buff 389-394/坐骑 64-65/召唤物 6148-6149-6161-6164 核对通过（并行会话已清偿大半）；
本次补：骑乘抚摸悬停光标 {62:5665,63:5666,64:6150,65:6151}（Mount.cs:6155-6175）、
Renderer MOUNT_DATA import、content-gap 断言对齐 1457（AllGems 四位非八位）。
澄清：6174 Digtoise 非坐骑（shoot 1123 随从物）。扩域 250/250 绿。

## sellPrice 漏乘修复（2026-08-23）
根因=Item.cs:49426 sellPrice 尾乘×5（原版 5:1 买卖差），extract-itemrare.mjs
evalPrice 漏乘→全表 sellPrice 系 ÷5。修=拆双通道（sellPrice×5/buyPrice 直和）+
FACTORY_VALUE 改存表达式串；重提取 4889 条（1471×5/3417 不变），Terra Blade
1000000 wiki 双证；下游 reforgeCost/Shimmer 零改动随正。另解 l10n 闸门
（TitleMenu BuyTerraria 键）。**新遗留**：shadowOrbPrice/dungeonPrice 等只读字段
引用静态不可求值→112 火之花/157 水魔杖等数十条缺表——下一批。

## 弹幕数据收口（2026-08-23）
前提勘误：1112-1135 SetDefaults 核心前批已有——真缺口=19 条缺失列（提取器三类
盲区：localNPCHitCooldown/元组赋值宽高/idStaticNPCHitCooldown）+ Arrow GetAlpha
case 1114。已补（Projectile.cs:10364-10679）；贴图零缺失（直连路径+逐字节核验）；
武器接线/aiStyle 路由零缺失（全部有专用实体）。遗留登记：①1113/1094 网格贴图
（9 列×N 行，projFrameImg 只支持竖条）②MinionProj 1112/1113/1118/1119 命中盒
缺省 16×16 vs 真值。1457 全家桶 136/136 绿；l10n 重建解闸。

## 网格贴图渲染收口（2026-08-23）
1094/1113=6 列×9 行**列主序**（sx=⌊f/9⌋×64, sy=(f%9)×46, 62×44；Main.cs:33734-33737
——与直觉相反：除法→X 取模→Y）；连带 1092 书同型。修=Arrow.ts PROJ_GRID 表+
projGridRect+MinionProj 狐帧态机（五态 1:1）+DYN 偏移 [24,−22]。新单测 6/6+
邻域 121✓+探针截图实证。备案：贴地三态待地面型判定；remaster 帧枚举须另接网格表。

## 外星霰弹枪子弹颜色修复（2026-08-24，用户报）
链路核实：泡泡 444 爆裂射出弹 = 玩家装填弹药弹型（localAI[0]，Game.ts:9917 链正确）。
颜色差异真因 = **Xenopopper 子弹族加算发光层缺失**（原版 GlowMask 214 族青紫光晕，
GetAlpha 白化调制 :81040-81100 亦未移植）。修=Arrow.ts：drawGlobalAlpha 补 440-454/
684 十二档 alpha + drawXenoFilter 白化滤镜（Lerp(白,k)≈brightness/saturate）+
XENO_GLOW lighter 叠画 α0.45。回归 83/83 绿。

## GetAlpha 颜色调制全量移植（2026-08-24，外星霰弹枪颜色报障扩展）
原版 GetAlpha 307 id → vanillaProjAlpha.ts 300 项（167 active/133 off 带原因：
52 A=0 隐形档/14 门控未建模/39 专属类消费/22 现有档/6 同族先例；default 7 不进表；
死支 16 首中即返实证）。kind 分布：fixed 73/fade 57/lerp 39/fixedfade 33/
invisible 60/afade 19/…。接线=Arrow.ts drawTableAlpha（drawGlobalAlpha 后、
drawXenoFilter 同点，专属 id 集不相交）。抽样 8 跨类 id 逐条对源码；回归 103/103
+ 扩域全过。语义决策：Opacity=1-α/255 折 ga；Lerp(白,k)≈brightness/saturate；
270 WrappedLerp=三角波。

## 电圈发射器行为补全（2026-08-24，用户"荧光+追踪"报障真身）
勘误：荧光青色+追踪=**电圈发射器 2796**（弹 442 电圈导弹+443 电球 AOE），非外星
泡泡枪 2797（射普通弹药弹，本就正确）。我们 2796 曾只发裸 442 直飞=症状来源。
修（1:1）：Arrow aimPoint opt+442 AI（渐显/到点≤16px Kill/120t 超时/青蓝光/Dust135
旋转环）+ElectroSphereProj 443 全链（脉冲盒 60-80/双层反转绘制/替换态）+Game.ts
锁定格传递+全消亡路径单口。Xenopopper 零改动。新测 15+回归 ~200 全绿。

## 追踪弹全量排查+补齐（2026-08-24，用户报外星霰弹枪追踪扩展）
原版制导弹全量提取（两份独立审计交叉：19 家族版+AI() dispatcher 逐块版，aistyle_map
五处修正）：**A 朝敌 homing 24 族 34 弹**（蜂族 36/207/837/616/297/659/409/617+618/
451 三态瞬移重射/634-635/715-718/338-341 火箭/614/225/321/16-34-79/491/宝石珠/
182/866/442/190——已有 14 族✓ 本批补 12 弹 id+306→307 链+616 寿命+pierce 表直读+
蜂群反击出速改原版随机）；**B 朝锁定点 4 族**（442/16-34-79/491 已有✓，660 出生点
特化登记）；**C 命中后二次制导 5 族**（306→307/451 本批补，余已有✓）。
skip 核对：285 纳米/477 水晶镖原版无 homing（非缺失）；鞭 969 死内容；随从/哨兵/
盔甲套/敌对弹旁系。验证：指定回归 84/84+新单测 11/11（每类制导≥1 弹）+广谱 15 文件
290/290+全量 6608/6625（17 失败逐一定位=并行会话 Arrow 1458 毒刺空守卫等非本批域）。
