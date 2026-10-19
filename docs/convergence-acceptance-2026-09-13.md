# 收敛验收清单（2026-09-13）

> 本轮 campaign（≈2026-09-06 起）按 `/goal` 推进：用户实报批处理 → 红蓝对抗 review → 台账剩余任务收敛循环。
> 收敛定义：登记账每项终态必居其一——**①实装**（1:1 带 1457 反编译锚+测试守卫）、**②备案**（带反编译锚文档化的原版本相/用户明令分歧/防御形状）、**③门控**（显式登记依赖，非静默缺失）。
> 方法论正本：`docs/methodology/campaign-playbook.md`（先定谳再动刀；每刀 Checklist；P4 八步收官）。

---

## 一、总量账

| 项 | 数 |
|---|---|
| 法证/修复批次 | ≈90 批（BJ/FX/RB/IIIII 系列） |
| 红蓝对抗波次 | 14 轮（RB6a→RB14），findings 150+ 全闭环 |
| 用户实报 bug | 30+ 全部定谳（终态见 §三） |
| 台账过时（已清偿未同步） | ≈15 笔核对后销账 |
| 测试全量基线 | 见 §七（收官时全量 vitest 实测） |

## 二、逐域终态三类清点

### 2.1 UI/背包/交互域 — 实装为主
| 项 | 终态 |
|---|---|
| FX39 vanilla 布局缺省转正 + FX51 一次性迁移 | 实装（差集审计真差为零；classic 退 `?invlayout=legacy` 回退旗；存档 classic 迁移带 migrated 旗防回迁） |
| FX41 modern 合成窗族（NewCraftingUI+11 类筛选） | 实装（缺省回切 Modern=原版缺省；FX30 偏差退役） |
| FX30 经典网格族+网格切换钮 | 实装（★TileUsedInRecipes=闭包折叠集翻案在案） |
| FX28/32 箱侧/店侧内嵌+Set-Back 撤除 | 实装（Set-Back=自创撤除；储蓄行 bank-only 分立） |
| FX29 ItemSorting 52 层整库移植 | 实装（RB13c-e 终审 52 层亲读无机制级错移植） |
| Alt/Shift 槽位路由/商店售卖/快捷栏原版本相 | 实装+备案 |
| 悬停 NPC 名/晶塔传送/地图 ping/eqDock | 实装 |
| RB14b 关包不关店+箱条第三门 | 实装（★货架段原版无门=同式不同门本相） |
| 布局 classic 独有自创面（配方搜索/合成站文字行） | 备案（登记债，原版 1457 无此面） |

### 2.2 滚轮/输入域 — 实装
| 项 | 终态 |
|---|---|
| FX50 方向家族复核定谳 | 备案+新债登记（热栏滚轮整缺） |
| FX51 热栏滚轮分支树+全屏图缩放复利 | 实装（★上滚=−1；复利 1.3ⁿ；关包才滚门；暂停窗双锚归位；±notch 计数档余数留置） |
| 合成滚距三偏差（子档拍/反转/吸附） | 实装 |
| Windows 右键三态兜底/RB12b 关包热栏门 | 实装 |
| FX51 切换音（Select SoundID 12） | 门控（两通道现状均不响，不单边响防通道不一致） |
| FX51 TryInterruptingItemUsage 滚轮 veto 臂 | 门控（heldProj 中断面未建模，登记债） |

### 2.3 玩家/物理/重力域 — 实装
| 项 | 终态 |
|---|---|
| 反重力波 1-5 全收官（屏翻转/持物 gravDir/物理余量/终刀八项/FX47 残项） | 实装（★跨波零回退；波 1 本地镜像保留=两层叠加恰为原版视觉） |
| RB11f 重力总闸 P0 只清不置 | 实装 |
| RB14a 微光化接触伤豁免+粪块 Stinky | 实装（★F1 merman 误报撤销样本在案） |
| RB11a 反弹速度差判据/RB11b 贴墙探针 | 实装 |
| 浮液湿域门（FX46 真回归） | 实装 |
| 翅膀水中脱离/翼链 NaN/阻尼四案/坡残量 | 实装+备案 |

### 2.4 wld/存档/导入域 — 实装
| 项 | 终态 |
|---|---|
| FX33 header 753 位+FX35 TE 双拒载级+FX43 snap 差量携行 | 实装（round-trip 逐字节全等主判据；真档全字段全等） |
| RB14c 墙高 liquid 互换+CreationTime ticks | 实装（★pointers 全走 mark() 尾回钉） |
| wld 导入 id 域统一稳定域 | 实装（1152 万格逐格全等） |
| RB11d SPW 泄档 | 实装 |
| 游玩时间二次方膨胀 | 实装（存量污染值不可恢复=诚实边界） |
| FX11 存档 24 项（17 陈旧+7 真刀） | 实装+销账 |

### 2.5 渲染/帧/颜色域 — 实装+备案
| 项 | 终态 |
|---|---|
| FX49 Item.alpha 维度（18 键+三消费面） | 实装（★BJ60 三处勘误在案；中和除名=GetAlpha 覆写） |
| 火焰花色表伪造案 | 实装（★"之前的修复"就是病灶教训在案） |
| 变体源表 CopyVariant 链/预乘暗晕/obj55 | 实装 |
| 智能光标暗处（BJ61-d 域碰撞定谳） | 实装（用户明令分歧注册+回滚口；域归一三消费点） |
| FX36 标尺族三档/FX37 图鉴 perf | 实装 |
| BJ64 彩虹巨石帧贴图/光效 | 实装（BJ64-b：对象=弹幕 1047 非 NPC；真病根=draw 整图直绘 95×380 壳表随转；修=三叠画+帧账 2t/100 帧环+CastLightOpen 彩虹光；余族 99/727/1013 等整图=原版本相备案；20 测+变异 7 例+实机探针绿） |
| 世界渲染 583ms hitch（WaterWaves/compositeLight） | 门控（用户暂缓，专项留档 docs 内 FX37 memory） |

### 2.6 NPC/事件/城镇域 — 实装+备案
| 项 | 终态 |
|---|---|
| 出生嵌墙决策树/NPC 入住 quickFindHome/旅行商净空 | 实装 |
| 皇家凝胶/哥布林工匠零偏差/渔夫重构 | 实装+备案 |
| NPC 交互矩形域/格交互优先旗/SmartInteract 链 | 实装 |
| 节日窗（万圣 10/10-11/1 等） | 实装（真缺 chokepoint 已补） |
| 毁灭者帧/巨鹿重影/肉山岩浆 | 实装+备案 |

### 2.7 弹幕/武器/物品域 — 实装
| 项 | 终态 |
|---|---|
| 弹域台账（载体错误五起教训）+AI_016/公主 950/微光弹反 | 实装+备案 |
| 泰拉棱镜数量本相 | 备案（SM2 管线已移植；946 接线+ssd 错值=已登记可执行债） |
| FX24 天顶剑拖尾表值 | 实装（金标=反编译直读） |
| 快速堆叠 vid 哨兵/ITEM_DEFS 零哨兵 | 实装 |
| FX12 漆域 6 项/FX13 匣/15 表情/FX17 勋章 | 实装+销账 |

### 2.8 工具/提取器域 — 实装
| 项 | 终态 |
|---|---|
| placeStyle 提取器盲区（共享 case 算式/550 件） | 实装（★重产前必反哺否则回退） |
| FX48 boss 宠 DefaultToVanitypet 漏提 | 实装 |
| createWall dual-key 归一 | 实装 |
| FX53 提取器算式盲区教正则（四形态固化进五提取器；dry-run 对拍 622/41/0；数据面手补承载未重产） | 实装（17 测+变异六刀全红） |
| 图集追加时代守卫（FX23/RB12c） | 实装（全量重跑禁令+三探针判据） |

### 2.9 世界生成域 — 备案为主（本 campaign 前段）
| 项 | 终态 |
|---|---|
| 掷流方法论族/ddual 反演重放族/清型方法论族 | 备案（36/36 全种子 1:1 收官沉淀入 playbook） |
| #98/#105/KLOG/ULP 翻案 | 备案（判例） |

### 2.10 联机域 — 实装+门控
| 项 | 终态 |
|---|---|
| FX42 传输层定谳+四笔接线（quest/死亡/force/在用箱） | 实装（架构定谳推翻台账） |
| R12 箱改名 msg69 | 实装（FX52：协议面闭合——msg69 编解码 1:1+msg33 改名段受理/广播/镜像；★施加对象=发送者在用箱非本帧 idx；附带修 msg33 本地域 vs 服务器域错位；剩=箱改名文本 UI 门控） |
| R11 serverAuth 拓展位 | 实装半边+备案半边（★1457 全树 serverAuth 零命中=原版无此位段，实义=SimHost 拓展位；任务鱼 swap 双端单源+module15 sub0 补发已通；陷阱箱直触发=零消费端死码免接线，归 wiring 模拟架构债） |
| R6 超级矿车 msg4 位 | 备案撤项（位面存在但消费面全 own-player 域跨端零消费=免接线；死码位禁入线格式，结构锁防误加） |
| R8 访客命中写位（per-slot）/R9 teamBasedSpawnsSeed | 门控（独立设计批——涉及服务器权威模型取舍，非 1:1 机械移植） |
| R5 ItemTransfer vid 金闪近似/R7 owner 闩位/R10 火把神自然收敛 | 备案（定谳免接线） |
| M11 随从目标同步 | 备案（单端模型零消费面，反伪影纪律禁死码镜像） |

### 2.11 音频/发布/平台域 — 实装+备案
| 项 | 终态 |
|---|---|
| SFX Opus 化/863 xnb 零缺/循环音 | 实装 |
| 发布链/CF Pages/Electron/UNCAPPED rAF | 实装+备案 |
| perf 三案/0907 trace | 备案（判例） |

## 三、用户实报 bug 终态（本 campaign 直报面）

| 实报 | 定谳 | 终态 |
|---|---|---|
| `?invlayout=vanilla` 未生效 | 转正缺省+迁移 | 实装（FX39/FX51） |
| 智能光标暗黄痕迹 | 域碰撞（高草吃宝箱候选） | 实装（BJ61/BJ61-d） |
| 空手暗黄痕迹 | 同上=BJ61 修复复核 25/25 | 实装 |
| 彩虹巨石帧贴图/光效 | 弹幕 1047 整图直绘=“多帧完整贴图滚动”病根；三叠画+帧账 1:1 重建 | 实装（BJ64-b） |
| 靠近宝箱无 hover 高亮 | 原版仅智能光标模式高亮 | 备案+实装（BJ54 全链+BJ61 加固） |
| 节日事件接线 | 万圣窗真缺 3 chokepoint | 实装 |
| 彩虹巨石（重复报） | 同上 | 实装（BJ64-b） |
| 悬停宝箱光标图标≠贴图高亮 | 两层语义区分后 BJ54 移植 | 实装 |
| 图鉴卡顿 | getImageData 读回风暴 | 实装（FX37） |
| 其余 20+ 实报（史莱姆水囊/上坡减速/魔法阵/晶塔/锤墙/…) | 逐案定谳 | 实装/备案（见 §2 各域） |

## 四、红蓝对抗波次闭环声明

RB6a/RB6b/RB10a/RB10e/RB11a-f/RB12a-c/RB13a-e/RB14a-d/**RB15a-d** 全部归队核验完毕：
- **RB15（2026-09-13，§五两刀+SC1/SC2/SC3+套件清扫+FX51/52/53/BJ64-b 抽查，四路并行）**：
  判语=CONFIRMED 4（R1 通用挥摆兜底臂接住持袋左键→抑制门已修；zz-red-io 容忍面命名错位→已修；
  SimHost 缺 stopEvents 门→已修+守卫×2+变异证红；F1 双未命中 round→trunc 已修）+
  REFUTED 大半（原版锚自证全过/桩族等价/Opus 判别力/TTL 真语义/round→floor=RB11b 有意/2413=17 复核成立/
  BJ64-b 三攻击点逐位一致）+ 登记债 10 项（§六）。总回归 17 文件 257/257+tsc 430 持平。
- 每波 findings 逐条三态落位（修/备案/撤），无未处置项。
- 撤销样本（RB14a-F1 merman、RB11c-F7 图集误诊链）保留完整推翻证据链。
- 跨批互踩（RB11e/RB13b/RB14b 第三门）已单源化收口。

## 五、裁决点群（✅ 2026-09-13 用户拍板：全部对齐原版——已执行）

1. **砍树整树倒** → 对齐原版：保持切口上倒、桩留（fellTree 单格委托 1:1 已在位），**不做**自创整树全倒。核验=零动刀。
2. **杀怪计数器观感** → 对齐原版：显示 BannerToNPC 规范名（鸟族旗 47→NPC 42 显示"鸟"，BannerSystem.cs:1206 与仓 vanilla-banners.json 同构；bannerless 击杀覆 0→"杀敌数不可用"=原版 Main.cs:47849 语义）。核验=已 1:1，零动刀。
3. **宝藏袋左键链** → 对齐原版：**持用左键开包链已摘除**（Game.ts 分支退役+unused import 清理；开启唯 ItemSlot 右键首支 ItemSlot.cs:1786-789）。sw-fx21 结构锁防回潮（`BOSS_BAG_IDS.has`/`openBossBag(` 不得再现于 Game.ts）；包族 77/77 绿。
4. **浮标超时** → 对齐原版：**落地未入水 600t 自毁已摘除**（AI_061 首行 timeLeft=60 逐拍重置=干态永续，Projectile.cs:54602；唯一清理=拉竿 flag2 Kill :54622）。airT 字段退役+结构锁；浮标族 45/45 绿。

## 六、显式门控项（依赖未就绪，均已登记锚）

| 项 | 依赖 |
|---|---|
| R8/R9 联机设计批 | 服务器权威模型取舍（设计批） |
| 世界渲染 hitch 专项 | 用户批准开工（WaterWaves/compositeLight/liquids 定位已留档） |
| FX49 手持物/展示家具 color 两遍域 | 新烘焙管线（缺域非缺维度） |
| FX51 热栏切换音/TryInterruptingItemUsage | heldProj 中断面建模 |
| GetAlpha 完整 switch 特例 ~60 项 | 逐项建模批 |
| legacy lightMode 三档（White/Retro/Trippy） | LegacyLighting 引擎族移植 |
| 火把神 590 宝石树苗 fw:3 等 worldgen 微残 | rig 通道排期 |
| 女体 voiceVariant 奇偶派生偏差 | 音频域批 |
| AI_174 蠕虫三款宠 | 多头渲染引擎 |
| BJ64b-D1 彩虹巨石贴墙弹跳不碎 | CheckBounce+smart bounce 整套（P.cs:20165-218/20319-420） |
| BJ64b-D2 Kill 彩虹爆 | dust267 沿尾+66 彩虹×14+专用音（P.cs:72354-427） |
| BJ64b-D3 宠物 1090 滚动模式切绘 1047 壳表 | Main.cs:33212-17+帧环 |
| BJ64b-D4 CutTiles 1047→幼虫 231 豁免 | vid 穿线 Entity.ts 收口（现压幼虫误召蜂王） |
| BJ64b-D5 1047 tileCollide 动态门 | ai[1] 嵌墙穿透态（P.cs:26437） |
| R12 箱改名文本 UI | 协议/受理/镜像三面已通（UI.ts:9025 落地即全链活） |
| serverAuth 房 wiring/机器模拟 | SimHost 无模拟面架构债（陷阱箱/季节重算同归属） |
| RB15a 3861/3862 物品注册 | Ogre/DarkMage 袋 VANILLA_ITEM_KEY_BY_ID 缺条目（玩家不可持用仅引擎面）——vanilla.json 内容登记另批 |
| BJ67 波外债 1013 专属弹支 | 彩虹巨石族 1013 走家族①②支，原版有专属分段弹支（P.cs:19140-90 含 >20 弹 Kill）——待移植 |
| BJ67 波外偏差组 | rbGetAreas 欧氏 vs 原版曼哈顿（仅联机异）/rotation 累加时序碰撞后 vs 碰撞前（弹跳拍视觉差）/cutTilesBox 右下多割 1 列（预先存在） |
| BJ71 计数器重进归零（用户实报） | ✅ 已清偿：★双轨装配漂移=fx43 同族重演（同步回退 saveGame 有喂掩盖 worker 缝漏喂）——四处落点+同缝族 seedFlags/meteorShowerCount/oreTiersPH；登记=starterSwapMigrated 死字段/BinarySave 元数据丢+kSet 竞态 |
| BJ72 autoPause 光标残留（用户实报） | ✅ 已清偿：缺 Update 头逐帧清半拍（MouseOversClear 先清后 claim 原版不可能残留）；修=frame 头 mouseOversClear+frame 尾 refreshCursorIconDrawState；偏差=绘制相悬停暂停期不回填（独立刀） |
| BJ73 孢子蝙蝠雷达漏检（用户实报） | ✅ 已清偿：★幻影字段 def.lifeMax(实为 hp)→全部 478 敌怪恒计 0；DONT_COUNT_ME 欠 23 id；真 id=634（7203 注释命名失误）；姊妹病 projTargets canBeChasedBy 同字段移交；★测试教训=GAME_ROOT 禁 process.cwd() |
| BJ77 hitch 零语义层（用户批准开工） | ✅ 已实施 ?swperf=1 灰度（缺省关=逐位不变）：画像定谳走动 hitch=水体邻接成本（drawLiquids ×11）；L1 缓存扫描重复两份（drawLiquids -21%）+C1 compositeLight 4-tap 重构（-17.4%/总 -6.7%）；逐像素 md5 光照图 4/4 场景逐位一致；★chunk blit 爆量=profiler 伪影未立案；收益如实=~0.2-0.3ms/f 温和 |
| BJ78 WaterWaves 区 W1-W4 补刀 | ✅ 已清偿+swperf 转正缺省开（用户确认）：W1/W2=waveAmpParam() 缓存（分配 W1 140.1 次/帧→0）；W3=_step 快路径（非零滚动原路径）；W4=常量 Set 模块级+持久槽；★现场定谳=W1 热分配只在低配 warp 关闭场兑现（GL 场逐格 bob 按设计关闭）；逐像素六场景 md5 逐位一致；帧时 frame -7.4%/updateWaterWaves -7.2%/sampleDisplace -48%；守卫 22/22+变异六发 |
| hitch T3 纹理上传脏追踪 | ✅ 已调研结案=**不建议开（C 级）**：实测全幅上传 3.9MB 仅 0.07-0.09ms/帧（43GB/s 零拷贝近免费）收益上限低于噪声；走动=相机滚动 89-100% 脏；实体烘焙=收益主导损耗；状态侧打标已现成（ChunkCache.markDirtyAround）真难点在绘制侧 ~12 层入口；探针件 _bj82-*.mjs ×4 留档，将来重开先真机复测 |
| hitch 有取舍项 T1-T2/T4-T6 | 登记留拍板（T1 endFgPass 双用途管线重构/T2 水格合批=vanilla 同构语义/T4 已否/T5 保留/T6 需标量变体） |
| BJ97 rbKill 闸+timeLeft 承接 | ✅ 清偿（rbKill 头幂等闸=1048 唯一同拍可达双发消除；boulderTimeLeft 承接 1054=300/1055=900/1021=10800 算术覆写勿烘÷2；1002 carve-out 双自伤留 3600 单面归一归 BJ93 债①专刀；10 测+变异 4/4+滚石族 132/132） |
| BJ98 AMMO_SCOPE 口径勘误（RB22b 揭出偏差收尾） | ✅ 清偿（集合 {97,1783,1836,283,780}→{97,1783,1836,23,780}——283 Dart 移除=飞镖四武器原版不 pan 本仓曾误 pan 0.5；23 Gel 补入={506 火焰喷射器,1910 精灵熔枪}原版 pan 本仓漏 pan；★溯源=2bc3f288 引 :14356-60 错行号（实为 monolith shader switch）且 23 误读 283；Player.cs:15002-15008 逐 id 定谳表+BJ98 守卫 describe 值表锁+变异哨兵；66/66 绿；登记债=pan 档位引号 1456 陈旧（真锚 Main.cs:63703/63709）+batch-d-accs/SnapStrike 同族错引） |
| **BJ99 两批清账波（2026-09-16 用户令「一和二谨慎做完」）** | 七刀+红蓝三路全 CONFIRMED（详见下七行） |
| BJ99-A Game.ts 三项 | ✅ 清偿（①pan 档位注释重锚 Main.cs:63703/Player.cs:6268-89 两版分写+golf/spectate 同区顺带；②stepRemoteProxy 收尾 p.wetSticky=p.inWater=OR 臂恒等零视觉变化；③BJ72 暂停期悬停回填=真缺陷动刀（原版 DrawMouseOver 绘制相每帧 claim，暂停帧 render 前补 tickHoverNpcName）；红蓝 CONFIRMED——wetSticky「曾湿现干砍除」疑虑被反编译反证=原版 wet 本就同拍重置；sw-bj99 7+sw-bj72 9） |
| BJ99-B SnapStrike 重锚+金币锚 | ✅ 清偿（★SnapStrike 真锚归属勘误=**Projectile.cs TryMakingSnappingStoneStrike :14347-14464** 非 Player.cs（1456 全树无此函数=1.4.5 新内容）；~60 条注释逐条重锚+逐值 dmg30/45/150·maxRange120/300/400·projId1121/1131/1132 全同相零行为面；金币 71-74 逐件锚 vanillaItemCombat.ts:414-421+IsACoin 直掷禁门 Player.cs:47510-13+PickAmmo 币槽 50-53；87 测绿） |
| BJ99-C 守卫补强+探针复核 | ✅ 清偿（RB17b note① 属实：1457 Item.cs 六区体 **36 支顶层区间分支**被 switch-only 提取器漏提 231 vid 真值低估=「盲非错杀」全被消费支接管；守卫三层补强=提取器线性化+区间表反解对拍（36/35/27 钉死）+词法哨兵+paintTool 6 件标记，变异 5 发全红含 false&& 锚定强度证；RB15c 探针 -15 已在盘复核四环全验+头注旧前提除险；红蓝 CONFIRMED+揭出提取器 else 正则永假潜伏缺陷） |
| BJ99-D UI 暂停滚轮 | ✅ **二次翻案零落刀**（原版 DoUpdate_WhilePaused :17546-51 暂停期重跑背包滚轮=autoPause∧背包开照滚正是原版语义本体，BJ70「真发现」判伪；补 paused 早退反为真回归；台账改立 H4 禁门锁=断言两函数体不得出现 paused（三变异全红）；红蓝 CONFIRMED+揭出失焦暂停旁支低害缺口）；回归 206/206 |
| BJ99-E proj-wet 随机红定谳 | ✅ 清偿（定谳=**原版同相**：1/180 smart-bounce 无条件臂 :26453-55+FindClosest :4934-57 首槽回退只查 active 不排死=跳 dead player 是原版行为；★关键勘误=RB4 爆发每次跳跃都发与 dead 无耦合（BJ93 原归因错一层）；测试重锚=flake 结构性消除（除 RB4 跃迁尘外零尘+窗口 6→14 拍+夹具入 playArea）+**坐实原测 vacuous**（6 拍窗 66.3px 恒在水面上，变异 711→138 重锚前绿重锚后红）+1/180 钉 0 确定性用例；20 连跑×2=0 红；生产零改动） |
| BJ99-F round 族可达性定谳 | ✅ 登记不动（两处 round 可达但 49 目标 id base scale 全=1 ⇒ round≡trunc≡w 零行为差，穷尽普查+反证三路封死；★新立案=**Transform 路径缺 SetDefaults 尾链**（种子档二级盒乘+ScaleStats 难度缩放）——FTW EoW 晋升盒 38 vs 51/53 内部不一致+专家/大师变身停经典档，独立刀待派；红蓝 CONFIRMED（复核普查口径 22 调用点/47 id，结论不变）） |
| BJ99-G 弹幕地形/弹支三面 | ✅ 清偿（债③ 1021 弹支 rb1021Bounce（真锚 Projectile.cs :19101-28，零 RNG，变异 4 发）；债④ 1054 蛛网 3×3 扫盒+Next(7) 尾掷序+放置豁免面无消费位亲读定谳+1053 落地 20 尘三连写序（变异 6 发）；债② Kill 地形面=★Kill 调用序亲读定谳地形面最后 :76478-89→插掉落臂后掷流逐位同序+1048 金字塔 BFS/形门/EmptyTile/草族转化+1053 半径 4 CanHit→注岩浆水→黑曜石（变异 6 发含 M6 前挪 3 红=掷序锁有效）；★fall-through 残型 type 0=等价改写亲读终判（原版语义=「无替换」非「替换成土」）；滚石族 162/162+消费 223 绿+金标零写入；红蓝三面 CONFIRMED） |
| BJ99 红蓝揭出缺口（登记债候选） | D·失焦暂停旁支（applyFocusPause 不收背包=本仓滚轮活/原版死，低频低害）/E·钉 0 用例湿面覆盖空洞+注释过称/F·tryTransformTo 潜伏 round 差（scale≠1 扩对时爆）/C1·提取器 else 正则永假潜伏缺陷+C1·哨兵 2205 落穿机制勘误（真落穿件=2203/2204）/B2·Game.ts:14859 PickAmmo 锚 1456 陈旧/A1·pan 平滑率 36px 钳+黑幕传送两面未登记/A3·三族绘制相悬停缺口维持（掉落物名/血名/信息饰品行）/**★G·rbPlaceLiquidLava 合并臂缺 EmptyTile 门=真缺口→BJ100 收尾**/G·rbEmptyTile1457 实体矩形未 trunc/solidTileAt OOB→true 怪癖/SpreadTile !platform 超集脆点/RB_KILL_FAMILY 缺 1005（不可达） |
| BJ100 1053 合并臂收尾 | ✅ 清偿（红蓝缺口#1+#2：①merge 臂插 rbEmptyTile1457 门——★亲读定谳原版序=先清液后 PlaceTile（PlaceLiquid :4535-37），拒铺=止于液清零+原件保留（merge 型 56/230/659 全 solid→PlaceTile 门化简为 EmptyTile）；②rbEmptyTile1457 两处实体矩形补 Math.trunc（=C# (int) 同构含负域，Collision.cs:1370/1377）；判别力=V2b/V2c/V4/V5+S4 门序结构锁 5 件+变异 M7/M8/M9 全红；滚石族 167/167+消费套件 237/237 绿+金标零写入；登记 1 条域内观察=SquareTileFrame 拒铺分支缺失（单机无观察面=零修刀判据）） |
| **BJ101-108 第三批（用户令「继续下一批」）** | 八刀全清偿+红蓝三路全 CONFIRMED（BJ101 Transform 尾链 seedTailBox 单源/BJ102 1002 四件同刀三流恰一次 400+三小缺/BJ103 pan 36px 钳+黑幕+失焦旁支/BJ104 else 解释器+2205 勘误+湿面覆盖/BJ105 三族绘制相悬停/BJ106 四复位面+270 双载勘误/BJ108 传送面+CutTiles+挖路径单飞；红蓝 REFUTED 两处=非 pan 态误钳无偏+144Hz 黑幕同律；揭出 F1-F4+P2-P4 缺口池） |
| **BJ109-112 四柱批（用户实报「四柱没发光/没小怪」+「多开子代理找真相」）** | 四路定谳+双刀落刀+红蓝专项全 CONFIRMED+BJ111/112 收尾：★真凶=Game.ts 自造 active 门锁死孵化链（Zone=纯距离 SceneMetrics:276-282，BJ107 距离门结论被双证伪）；★crystalDeath 整支=锚错伪影（DD2 败北水晶）；★月主 P1 生命线（boss 占槽丢弃召唤）；护盾 SM2 字节码泡泡+glow 呼吸+FilterTower 染色+自发光地板+环境尘四组+小怪 7 刀（415 喷火/516/羽化链/死亡分裂）+575 光/539·574 glow+BJ111 月主落位 Bottom 语义（重推算式怀疑被锚证伪）+BJ112 五刀（F1 悬停绘制相/F2 黑幕层/F3 hcColor 25/F4 嵌套 else chainAt[d] 净简化/P2 泡预武装死窗/428 半格/415 justHit/三角分布单源/Deerclops 落位+despawnTimer/多塔混叠=数学定谳同相） |
| **红蓝二轮+清债七刀（BJ113 收官，2026-09-17）** | 红蓝-A/B 审 BJ111+112 五项全 CONFIRMED（含处方证伪独立复现+M2 判别力勘误=变异须限定 else 头读侧）；清债七刀全落：债刀-1 TrailShader 三义 null 死窗+428 乘数整数化+无括号 if 哨兵（21/21）/债刀-2 masterColor 脉冲+告示牌泡翻案（黑幕在 DrawInterface 前=全接口层画黑幕上）+标尺后移/债刀-3 expert 43 id 提取器+per-type color 定谳修正（json 已在=债真身无闸裸奔→recon 扩面）/债刀-4 shimmer+钩挂墙接过渡+tileCutIgnorance 13 例外表/债刀-5 光女链勘误（672=BlueMacaw 错挂，661=EmpressButterfly；死亡链 Bottom 半盒+方抖两处落刀）/债刀-6=BJ113 Bottom 全仓普查（确认五处+候选全审+系统性自查榜单外新 3 站+Deerclops finder 1:1 重写失败语义+405 收编★2π 三角≡均匀解析等价用源哨兵+despawnTimer 家族 18740 ★整截断非 18750+蠕虫段逐族核验段高恒等=差恒 0 同相） |
| **BJ114-115 清债五刀+红蓝-C+BJ115（2026-09-17 用户令「新登记债继续收齐」）** | 五刀全落+红蓝-C 14 项（13 CONFIRMED+1 REFUTED）+新立债当场收：债刀①extract-npcs era guard（重跑洗 110 条+6 字段物证→动态探测拒 exit 1+双旗逃生门；同族普查表 41 个——两条高风险登记=itemrare 1456 洗 6147-6195+projectiles 1456 树）/②UI tooltip expert ★致命死门（旧 ctx.expert=rare===−12 全表零基值永假=Expert/Master 行从未渲染）六处落刀单源委托+rarityColor −13 活色+四档漂移登记/③Bottom 残余（619/454·521 仪式/msg202 ★定谳双端同错=v8 自有通道双端落刀/血月转化 ★value==0 钉零外层怪癖 1:1+BLOOD_MOON_EVIL 11 条逐条核）/④TrapShot vid 穿线（★trap=SetDefaults 型录旗 20 站→27 id）+1052 Axearang 加砍面（★323=棕榈非仙人掌勘误）/⑤breakHive 整面 ★双勘误（1124=Hive 物品非 NPC/出蜂=210/211；分道=tile 臂 1/3 蜜+1124+0-2 蜂@Bottom vs 弹臂 2-5 蜂@弹心——"手雷 2-5"系弹臂语义误接 tile 臂历史态）四面落刀（Bottom 锚/离散 401 档/noItem 门/dig 音/655 wet 同键）+红蓝-C 无误罩实证；红蓝-C REFUTED=bunny 281 缩盒系引注张冠李戴（281 本就 28×28 同相）+新立债=弹域 cutTile 缺 CanCutTile 门（近战/放置/裂砖已挂独缺弹域）→**BJ115 当场收**（判定子 context 形参未消费三档恒同体双验+候选面外零求值=flag&& 短路同相+变异 4 红逐腿判别+回归 144 测）；MP 探针案登记=case 225 蜂/物 netMode 管籍 |
| **BJ116-139 用户实报+standing 收齐波（2026-09-17/18，红蓝 D/E/F/G/H/I/J1/J2/J3/K 十路全 CONFIRMED）** | 用户实报八件+standing 新登记全收：BJ116 时装栏 ghost 帧误帽 i≤17（恶魔心紧凑行无底图）+右键语义=原版同相翻案（眼睛左键才是 hide 入口）/BJ117 bound 生成零偏差判例（★106=hardMode vs 105=downedGoblins=用户实报答案）/BJ118+123+136 tile129 水晶碎块三层（PITCH 误罩纵走带=灰白圆斑根因+pitch 全表普查 ~20 tile 一次清+质感 α100+彩虹辉光 GlobalTimeWrappedHourly 钟+149 彩灯掉落支+死副本删除 tsc -12）/BJ119+139 F10 标记坐标+pan 平滑黑幕（★zh toast 双括号=格式化双源判例）/BJ121+139 商贩帽五通道全谱（★真根因=Flymeal 缺伤=itemcombat SetWeaponValues 形参盲区 14 件；岩浆烧帽=原版同相）/BJ122+124+131+135 bound 全链（★永久化=地下久不遇第一因+探测器 NPC_RARITY 255 捏造清洗 335→79+分析仪域错位 boundAnalyzerVid 反查+方案 A 摘触碰解救+摘音尘——用户两拍板落地）/BJ125+134 UI 右键 1:1+★词缀 f32 阈值六件+HasItemSwap 接线/BJ126 邪恶粉单源+1124 键翻案/BJ127+129+133+137 era guard 家族（三闸+g1 footgun 硬化+嵌套 else 链态+UseGroupStaticImmunity 10id+SporeSac 组表勘正 FX1 15→3 勘误）/BJ128 SimHost 134 超集+netMode 门/BJ130 Repeated 门四件族（★AnchorValidTiles REFUTED 撤案）/BJ138 彩灯测试转正；红蓝十路全部 CONFIRMED（REFUTED 3 发=段宽恒 7 原版本相/value 钉零属 Transform 本体/AnchorValidTiles 零消费位） |
| **BJ140-146 用户拍板批+实报续（2026-09-18，红蓝 L1/L2 全 CONFIRMED）** | A 组拍板七项落地：#1A 云组表门摘除（pierce=−2 新档+三命题坐实）/#2A 685 发射半边+#3A 浮字摘除（自创键 12 语言退役）/#4A 南瓜 RandomStyle（★翻案红蓝-I：变体带非生长带，「即植即熟」判据作废）/#5A 死岛退役 10 文件（tsc 422→345+worldgen 逐位不变金标）/#6A 10140 remap/#7A itemrare 翻转 1457（byte-perfect）/#11A bestiary ★判词证伪降级零生产刀（parseWldToSave≡parseWld 同函数，RB15c 段表错位误读——parity 钉锁）；#8B/#9B/#12/#13 维持。实报续：BJ144 FX58 字体档位化（Mac 过锐=binarize→NN 非整倍率→pixelated ×2 三连硬量化；hidpi 2× 超采样灰度=原版 LinearClamp 语义；双线性否决 34% 复演）/BJ145 云空爆（★处方被实证推翻=hurt 布尔返是击杀语义→收编前置门+气团 −2）/BJ146 mark() trap 拆雷+netIdOf 域定性（SW-BO1 孪生；★用户实测 Vinlic.plr 推翻时间线→BJ148 叙事勘误=错位仅 09-06 后窗口）；红蓝 L1/L2 全 CONFIRMED（云空爆新债立案+mark() trap 结构锁） |
| **方案 A 物品 id 统一计划（2026-09-18 落档，待启动）** | 用户架构问询（双域踩坑两案后）→BJ150 内部序触点全景普查（290 消费点/8 收口全正确/vid 反解税 374 处/方案 A 成本 3-5 专注日+冻结窗口）→BJ152 哨兵网就位=验收网 →**计划正本 `docs/item-id-reunify-plan-A.md` 落档待启动**（触发=用户令「启动方案A」；七阶段/disk 0 唯一真险专项先行/开窗冻结并行车道）；tile 域（BJ154 双域混淆第三案）不在 A 范围——BJ158 tile 键表普查并行复核 |
| BJ89 液体索敌域三债 | ✅ 清偿（canBeChasedBy=maxHp??def.hp 修 108 型过含+★两处测试夹具喂幻影字段连带修复=守卫失明家族新形态/wetSticky 字段≙vanilla wet 居中探针驱动岩浆擦过幻影发射消除/★债3 定谳升级=波场移向相反+读侧补偿整缺非亚 texel（探针实测 2× 漂移）滚动域改 F+uWaveOff+waveReadOffset；24 测+回归 897/61 文件） |
| BJ88 弹幕域四债 | ✅ 清偿（1013 专属分段弹支移植含 >20 弹 Kill 门/TreatedAsABoss 38 元素集伤害面接线先伤害再 Kill/★曼哈顿对齐勘误 RB19 坐标笔误=Player.cs:4933-57/rotation 时序碰撞前+cutTilesBox 排除界；25 测+变异五组；新立案=aiStyle25 出膛宽限门 P.cs:12488-90 未接） |
| BJ91 UI/内容域五债 | ✅ 清偿（3860=8/3861=5/3862=3 rare 终值金标 DRIFT=0+itemrare 提取器 HAND_RARE 反哺/箱名三分支 467·88/改名对话随关箱收（原版箱关编辑态在=不可达态）/snapshotTrace 结构断言三测/旅程大礼包 difficulty 参数逐槽直置） |
| BJ87 新角色三件套落物品栏区（用户实报） | ✅ 已清偿：★两层根因（inv.add 路由+itemfunc 缺 useStyle→GetItem 热栏臂不可达→降序臂背包尾 49/48/47）；原版=UICharacterCreation :1714-61 逐槽直置热键区（剑/镐/斧）从不走 GetItem 路由；修=grantStarterKit 单源+死亡发还同源+tripwire；6 测+变异；登记=旅程难度大礼包内容面缺口 |
| BJ95 UI 补课+框架三债 | ✅ 清偿（BJ92 拖拽块逐式对拍补课=1457 五锚六式同相+★真缺陷两处修（补武沿缺 mouseInterface 门=标注/查房误触已修）+架构级登记（槽位拖拽/关包热栏取件=DOM 适配自创）；gotoApp 洗 URL 参数框架修（carryQuery 透传）；__swAudio 拆名 __swAudioRec 双向互踩消除；13 测+变异 3 红） |
| BJ93 弹幕湿域五债 | ✅ 清偿（aiStyle25 出膛宽限门 localAI2 出生计数四面收进 rbDamageCanDeal/Kill 家族死亡尘声面+1053 gore+掉落+三处直写 dead 收口 rbKill/头部伴生尘/1002 TNTBarrel 双向偏差 EVP 豁免集+SelfHurtPlayers 直译+名实勘误/Chilled 门 wetSticky 化★原假设被探针证伪=居中湿⊆wetSticky 恒同相；30 测+变异 15/15+分域 621/621；登记 6 项=1002 建模余波/地形面/1021 弹支/1054 蛛网/既有随机红） |
| BJ94 渲染 swperf 域三债 | ✅ 清偿（4×/帧 URLSearchParams→0（searchHasParam 缓存读取面真参页逐位对拍）/Set 消 6 固定余 4.3 登记（★activeIds 跨拍持有=唯一真逃逸站）/波注入 wet 域收口（wetSticky‖inWater——岩浆注入章此前整缺+涟漪反相修复，OR 臂=联机代理保真）；10 测+变异 4 发+逐像素 16/16 零差） |
| BJ90 存档域四债 | ✅ 清偿（starterSwapMigrated 六落点激活=换人向导 splice 顶替实害消除/Banner 锚勘误三处/epoch-marking 零刀销账=★RB29 并行车道已退役 BJ83 迁移块超集达成/BinarySave 死路径移除=零消费方+竞态实害 KV 竞态残留损毁；10 测+变异 4 刀+169/169） |
| BJ78 波外新账 | 渲染循环另 4 个 URLSearchParams 构造点（drawChunkGrid×2/drawAnimatedTileLayer/drawDummyTileAnim）+~12/帧 Set 背景——零语义候选待普查；bootstrap gotoApp 洗 URL 参数（IIII236 框架域） |
| BJ83 制作台宫格=烤档（用户实报） | ✅ 已清偿+RB19 修刀面全 CONFIRMED（三层根因：FX30 窗口期烤档★新判例+双开缺互斥+对话缺收；迁移刀+Migrated 旗；epoch-marking 变体登记更优不落刀） |
| BJ84 智能光标开态持久化（用户实报） | ✅ 两轴判决（轴 1 跨进程不持久化=原版同相 config 存模式非开态；轴 2 同进程退世界复位=本仓缺陷已修 sessionWanted 页面寿命）；RB19 CONFIRMED（恰 4 写点/触屏 else 臂=Mouse） |
| RB21 审 BJ92 | ✅ 满绿 6/6 CONFIRMED（三支逐式对拍+拍龄钟+F4 豁免面家族双旗逐一核+F6 四消费面逐处定谳非机械换+itemrare 13 键 CONFIRMED）；RB21 落刀=wetSticky private→public（跨模块消费结构参数）；登记=SkipDamage_EVP(108,164,1002) 1002=TNTBarrel 双向偏差（aiStyle16→25 余波）/BJ92 另有 UI.ts 拖拽块未逐式对拍声明（→BJ95 债1 补课清偿） |
| RB22a 审 BJ93/94/95 主批 | ✅ 满绿通过——揭出 2 条 minor（rbKill 缺幂等闸/1021 timeLeft=10800 算术覆写未承接）→ **BJ97 清偿收官**；其余逐式 CONFIRMED（出膛宽限门/Kill 家族尘声面/1002 EVP+SelfHurt/Chilled wetSticky 化/searchHasParam/Set 普查/波注入 OR 臂/拖拽补课/carryQuery/__swAudio 拆名） |
| RB22b 审 BJ97/94 尾面 | ✅ 满绿通过（PASS-WITH-2-NOTES）——①AMMO_SCOPE 口径偏差 CONFIRMED（283 误入/23 漏配）→ **BJ98 清偿收官**；②注记=batch-d-accs/SnapStrike 引 :14356-58 同族错引（1457 该区实为 monolith shader switch，物品 6178 case 在 1457:14686）=登记债下一刀；BJ97 闸面/timeLeft 承接/1002 carve-out 定谳全部 CONFIRMED |
| RB20b 审 BJ90/91 | ✅ 满绿通过（PASS-WITH-2-NOTES）——十债全 CONFIRMED（starterSwapMigrated 无第七轨/BinarySave 三重死码判定升级/箱名三分支逐位/旅程十槽逐项）；新揭 [major]=itemrare if 链同族盲区残留 13 主 Boss 袋（3320-3332）rare 仍错→BJ92 追加清偿中 |
| RB19 揭出 FX30 期存量 major×2 | ✅ 实锤复核（BJ85：★_lastFilter 写点实为 4 处判据不变/IngameUIWindows 三版字节全等/arm1=LOUD CloseAll 音 11×3）+1:1 落刀（七刀：ClearHacks 面接 vinvCloseAllQuiet 尾+vinvCloseAllLoud 新增+网格臂改写+滤器消费面退役+头文字恒通用）；45/45+变异 2 刀各 2 红；BJ81 选择器字面锁同步 42/42 |
| RB17b note×5 |
| RB17b note×5 | ①守卫覆盖债（SetDefaults1-5 顶层区间 if 盲/paintTool 支缺标记）②金币 shoot 注记逐件 158/159/160/161 ③3861/3862 def 缺 rare（tooltip 稀有色）④vinvChestTypeName 缺 dresser/467 分支 ⑤改名对话不随关箱收起（UX） |
| RB15c 探针落点欠矫正 | Enemy.ts:13837 机械探针 -10 应为 −h/2=−15（原版 NPC.cs:10748 SetDefaults(139)=30×30，非注释所称 h=20；ba8ca147 欠矫正冻结错误前提）——现探针仍低 5px，随 Enemy 域批勘误 |
| RB15c bestiary 读侧分叉 | parseWldToSave（存档域）缺 bestiary=拒载 vs WldParser（游戏路径）try/catch 容错——双读侧行为分叉已入档，对齐属 WldImport 域另派 |
| RB15b-F1 已清偿 | fromVanilla 双未命中支 round→trunc(f32)（原版 :17842 (int) 截断；史莱姆王普通世界盒宽 123→122）——Enemy.ts 已修+数值金标 63/63 绿 |
| RB15b-F2 变换路径 round 族 | Enemy.ts:6166/:6267 TryChangingSize/tryTransformTo 用 round——原版经 ContentSamples SetDefaults 终盒（截断+种子档）；可达性未证，先证可达再议 |
| RB15b-F3 remix 渲染乘区缺口 | remix 命中族盒已 ×1.3 族但 vanillaScale 不写（仅 seedBox）→贴图按基 scale 画；修法方向=seedBox\|\|remixHit 时写 seedS.scale/vScale |
| RB15b-F4 金标记账 | ✅ 已清偿（BJ70）：孤儿金标 1511931452 双证零引用后删除（备份在案+git 可恢复）；.ghost=冻结快照历史档零消费登记不动；shimmer 前缀明文不裁决维持 |
| RB15d-FX51 暂停期双偏 | ✅ 部分清偿+勘误（BJ70）：fullMap 缩放支=伪发现翻案（滚轮树宿主 fixedUpdate 仅在 frame() !paused 门内调用=暂停期整树已死，Game.ts 零变更+3 结构锁守卫）；背包 DOM 支=真发现但坐标在 UI.ts（vinvGridWheelTick/vinvCraftWheel 加 game.paused 早退）→ 移交登记 |
| RB15d-SimHost 灯笼夜子面 | LanternNight.lanternsUp 服务器无源（注释已声明），待事件态同步另批 |
| RB15d-FX53 重产扩面 | extract-itemfunc 重产将新增 ~785 id（防误判漂移）；✅ main 守卫已清偿（BJ70：main() 包写盘+pathToFileURL 守卫，中立性 md5 逐字节自证） |
| RB15d-BJ64b GTW 墙钟 | GlobalTimeWrappedHourly 用墙钟 vs 原版 TotalGameTime（失焦冻结）——色相相位漂移仅视觉，登记 |
| RB15a 通用挥摆兜底臂家族 | 「其它物品」臂对所有非使用物左键兜底起挥（Game.ts:13562/13619）——本波只收口 BossBag 21 件抑制门（BOSS_BAG_NO_USE_VIDS），家族面（其他无 useStyle 物品）另批 |


---

## 六D、BJ224-257 收敛波终账（2026-09-20/21，红蓝 R1-R4 四路全 CONFIRMED + 用户实报 16 件全闭环）

- **用户实报 16 件**：套装 tooltip 误贴（BJ224 1.4.5 ArmorSetBonus 新制 1:1）/猪龙彩罐钩爪技巧（BJ225 零修刀+8 守卫）/生命果无限掉落（BJ226 武器可割=原版相+mod2 真修）/水上漂慢沉（BJ227 两档制+钉位 1:1，探针 6s 漂移 0.00px）/邪恶三叉戟+彩虹魔杖（BJ228 GetAlpha 276 id 全表+方向反较正→BJ247 RainbowRodDrawer 1:1→BJ255 GL 化 p99 198ms→16.67ms+假尘摘除）/水晶风暴水矢反弹（BJ229 aiStyle8 族+94）/贝壳电话右洋（BJ240 零修刀原版 quirk+BJ242 三路实锤→补偿式分歧落刀回滚口 CONCH_RIGHT_OCEAN_COMPENSATION）/Radio Thing 贴图（BJ241 左右半 sheet 语义）/熔岩史莱姆粒子（BJ243 ID 勘误 59+三面）/飞龙尾粒子（BJ244 REFUTED→BJ254 HitEffect 面部分平反）/树妖祝福（BJ256 放了但全盲=TownShot 吞专类视觉，BJ33 同病灶）/先进战斗技术卷二（BJ257 消耗面+惰性书原版语义）/钱币传送门（BJ253 弹 518 喷币非吸币，修透明度 2.55×等四面）/tsc build 阻塞（BJ239 418→0 exit 0）。
- **红蓝 R1-R4**：19 刀全 CONFIRMED、漏修 18 条全立刀（BJ248/249/251/252）；翻案两起=BJ175b"原版无特支"（473-476 后绘支 :26436 在）+R1 误列 700 支；普查案=右键 RC-census（BJ250 落刀+24 测，全表对照续批）/HitEffect extractor（BJ254 首批 78 组/299 型，续批批 2-4）/横移 addFrX 族（R2 顺带收口）。
- **事故与故障处置**：BJ223 世界加载断链（BJ90 连坐删 worker json/save 源，mainFlow:803 镜像消费方漏计）——三源恢复+结构锁；BJ228 vanillaProjAlpha 截断（无名车道 truncate-then-write+BJ228 无守卫提交向量）——快照重放+写面守卫四断言（BJ236）；BJ250 三连停滞破案=大测试文件 collect 320s（非上下文）——极小收尾刀接管；孤儿进程两清（8+2 个，含 20h 满转 vitest worker×2/26h vite）。
- **待续批池**：HitEffect 批 2-4（~163 组）/右键 33 支全表对照/反射族同形 13+（640 双面同批）/MOD 表 5 条陈旧注/@ts-expect-error 政策（业主拍板）/钥匙 toast（明令分歧待拍板）/方案 A（待触发"启动方案A"）。
- **memory**：`bj224-257-wave.md`+BJ244 单案档（代理自落）。



## 六C、BJ150-223 收敛波终账（2026-09-17~20，红蓝 N1-N6 六路全 CONFIRMED + 22 刀全归队）

- **方案 A 前置**：BJ150 内部序触点全景普查（290 消费点/8 收口全正确）+BJ152 哨兵网就位=验收网；计划正本 `docs/item-id-reunify-plan-A.md` 待触发。
- **用户实报 6 件全闭环**：钥匙召唤=原版 hardMode 静默拒绝（BJ213 零修刀判据）/花苞=原版稀疏性 1 朵/12min+两真缺陷修复（BJ214 force 档死门+双子键旧档读档补偿）/翱翔徽章效果整缺实装（BJ216 empressBrooch 四消费面）/宝箱怪无伤（BJ197）/永夜刃剑影（BJ172）/拖影（BJ175b+BJ209+BJ219 双域战役：NPC 59 对+弹幕 ~150 id；双重偏移=残影屏外不可见真根因）。
- **清债刀**：BJ151/154/155/159/161/162/164/165/166/167/168/169/170/171/173/174/175/176/177/178/179/180/181/182-188/189/190/191/196/197/198/201-222 全归队（各见 memory）。
- **tile 副本收编战役收官**：BJ182→BJ221 八批归零（累计 ~90 表 300+ 处副本；lexer 普查×148 表对拍方法论；值同语义异分名/三名同值/并集分名/关系锁判例族）。
- **era guard 家族收官**：13 工具闭环+处方正本 `docs/era-guard-family.md`；提取器编码面恢复闭环（bossbags/travelshop/shops 重产≡现库 byte-perfect）；火星门真 bug 修复（shops 353 downedMartians）。
- **★BJ223 世界加载断链修复**：BJ90 连坐删 worker json/save 源（mainFlow:803 镜像消费方 grep 漏计）→导入/探针路径全断+alert 阻塞伪装挂死；三源恢复+结构锁+BJ90 勘误入档；`scripts/_bj223-loadcheck.mjs` 复用探针 exit 0。
- **待拍板**：非困难放钥匙提示 toast（明令分歧）/方案 A（触发语"启动方案A"）。



**本波处理中（BJ67-70 四路并行）**：
| 项 | 代理 |
|---|---|
| BJ64b-D1~D5 彩虹巨石行为面（弹跳/彩虹爆/宠切绘/幼虫豁免/动态门） | ✅ BJ67 清偿+RB17a 全 CONFIRMED（1458 字节全等；★两翻案=D5 flag9 严格等价非近似/JumpToPlayer"无解"被 Lagrange 判别式推翻=拦截真发生照抄正确；★PreventSpam 盒=弹心±3000 坐标盒非世界尺寸；域外偏差登记=1013 专属分段弹支待移植/欧氏 vs 曼哈顿/rotation 时序/cutTilesBox 边界） |
| RB16 遗留（bossHeadRotation 35/127/345 ai 门/守卫双咆哮/mode-3 EncourageDespawn）+ FX51 切换音+TryInterruptingItemUsage | ✅ BJ68 清偿+RB17a 全 CONFIRMED（死码四树复核含反射/字符串面；Select 音即写模型 buffered 等价，唯一偏差=Shift 智选覆盖窗重选多播 1 tick 纯视觉登记；三结构锁红全=锁文本陈旧已重锚 72/72 绿） |
| RB15a 非使用物抑制门推广+3861/3862 注册+R12 箱改名 UI | ✅ BJ69 清偿+RB17b 全 CONFIRMED（A 面 8/8 分层抽检全等/B 面零反向误杀（26 坐骑门=0 全=DefaultToMinecart 无 useStyle 1:1）/3861-3862 幂等自证+零产出 1:1/箱改名全链 1:1 含闩锁时序；独立扫描器交叉验证；note×5 登记） |
| RB15b-F3 乘区+F4 金标记账+FX51 暂停滚轮+FX53 守卫 | ✅ BJ70 清偿+RB17b CONFIRMED（F3 三代表逐位推演+消费面同语义；金标删除 HEAD 可恢复；暂停滚轮翻案=fullMap 支宿主已死伪发现；FX53 import 惰性自证 md5 恒等） |

**本波后仍门控（需设计/大引擎/用户拍板，非机械清偿）**：R8/R9 联机设计批、世界渲染 hitch 专项（用户暂缓）、FX49 手持物 color 域（烘焙管线批）、GetAlpha ~60 项（逐项建模批）、legacy lightMode 三档（引擎移植）、AI_174 蠕虫宠（多头渲染引擎）、voiceVariant（音频域批）、serverAuth wiring（架构债）、bestiary 读侧分叉（WldImport 域）、SimHost 灯笼夜（MP 事件态）、BJ66 MP 席位远端玩家、RB15b-F2 变换路径 round（先证可达）、BJ64b GTW 墙钟（视觉相位）。

---
## 六E、BJ258-295 收敛收官段终账（2026-09-22/23，goal「直到完全收敛」循环走完：U1→U2→U3→U4 四轮红蓝）

- **清偿批链**：U1 审 BJ286/288/289 抓漏修 ~10 条 → BJ290（死亡拍割面四站 Arrow 管线头盖 4 死亡位/Counterweight -2/Molotov 含期满支定谳修订/Dart 备案锁 + 平移钳语义修正=定尺寸平移钳非相交裁剪 + 可达区钳制单源化 PlayerReachableArea.ts 七消费面含天顶剑）+BJ291（尘量 ceil 浮点条件+fround 全域零差证法 + 音效差集 SINGLE_INSTANCE 89+16 键「逐文件槽≡逐槽门」严格子集+死码 case45 辨析 + 台账批）→ **U2 审两刀全过**（M1 裁决=期满照割，U1 旧判被 :17307-17311 亲读撤销；变异 2 发精准；三刀割面站类级零交叉）→ 抓 PU 实害案 → BJ293（中央割 friendly 投影门 Entity.ts——数据面投影绕 repo hostile/vanilla friendly 域混淆；9 判别面+变异 2 发独红）→ **U3 审 CONFIRMED**（五因门逐项对拍+数据面 10 vid 零陈旧+vid=0 折中备案成立；登记 P2 vid=0 残留+P3 三案）→ BJ294（vid=0 敌射收口=保守缺省定谳+noVanillaCut 独立正一位不征用 projId+46 类创建点全普查+tripwire+443/1110 回收相落刀+1130/1135 证伪+52 锚零数据校准+307 防回潮锚）→ **U4 终审判「收敛达成」**（15 类标注全验含 MeteorChunk owner=255 唯一性/SquidCloud 显式 owner 同相；1130/1135 证伪独立复现维持；变异 2 发判别力证实；F1-F5 注释级登记）→ BJ295 注释勘误收官（F2 owner=255 事实错误改真依据/F1+F3 六处行号基线 1456→1457/F4 间接继承 gap 登记）。
- **BJ292 清偿历史挂账 BJ153**：journeycat 漂移 CONFIRMED（79 缺键=48 mat+31 acc；★D2 单向守卫「盘⊆dry」盲区→D4 双向全等钉）/重铸键 REFUTED（LegacyInterface.46=「花费」冒号由 Main.cs:42294 拼接，任务书猜词本身是漂移）/LAG 盘点=BJ205 已覆盖机械复验销账。
- **★判例**：①期满支=timeLeft Kill 在 Damage 后同子步→期满拍照割（「死不割」直觉判被反编译亲读撤销=先定谳再动刀再验）；②平移钳≠相交裁剪（W/H 原样）；③repo hostile≠vanilla friendly（TrapShot 取反先例）→数据面投影；④vid=0 保守缺省=失败不对称定谳+noVanillaCut 独立位（不征用 projId=联机快照约束）；⑤普查判据=注释剥离后缺 vid 字段三判据（对象字面量不算字段=ElectroSphereProj 漏捕教训）；⑥**红蓝锚漂移连环案**（U3 引锚行段漂移被 BJ294 证伪→BJ294 注锚又被 U4 抓）=锚引用前必亲读上下文、红蓝结论也会漂、逐轮互审才收敛；⑦单向守卫盲区→双向全等钉（journeycat D4）。
- **登记债（滚动，非阻塞）**：HitEffect 批 4（402 oldPos 轨迹盒,需 Enemy oldPos 支持）/右键 33 支全表对照续批/磨盘 4 件/gore 重锚 1457 独立刀/E1 续批尾/低优普查案 C1-C3/P2 shimmer/信息栏时间分桶（待用户复测拍板）/玩家侧多割（250/298/305/444/460/633/971·975/818 落 vanilla 豁免表）/SwingArc 弧体冗余照报/ElectroSphereProj vid 穿线缺 443（快照约束）/间接继承链普查 gap（BallBase 族现害零）/307 死码 hole（306 链移植时触发）/443·1110·1130·1135 相位差（443/1110 已落刀）。

---
## 六F、HitEffect 尘面批 2-3 终账（2026-09-23,BJ296 批 2 + BJ304 批 3;NpcHitDust/extract-npcdust 域）

- **BJ296 批 2（概率门族 15 型）**：134-136/262-265/407/409-411/428/478/516/636——帧树逐型臂解析（死臂剪枝/循环组逐拍/单掷分支/pre 短路不耗掷/区域门/`N+Next(K)` idRand）;掷流通道=Math.random（批 1 alt 同源）。金标+行为锁+变异 2 发（tests/bj296-npcdust-batch2.test.ts）。
- **BJ304 批 3（fadeIn 定谳翻案族 18 型）**：415-421/423-427/429/518/524-527——★**翻案**：BJ296 批 2 报告曾按「fadeIn=alpha 渐入,本仓不可用」登记 postUnsupported,反编译亲读证伪——原版 fadeIn=**生长目标语义**（Dust.cs :2148-2171：0<fadeIn<100 时 scale+=0.03/t（46/213/260=0.1、235=0.007）至超 fadeIn 归零转衰落,**无 alpha 参与**）,且本仓 VDust.fadeIn 在位+老化链 1:1（fx/VanillaDust.ts :740-745）+spawnDust 返活尘 → `fadeIn=N` 收编 std 算子。叶族（叶=[ng,scaleSet1.5,fadeIn1,velMul3],主 d241|d249+叶 d6|d242|d229）13 型全接;524-527 加 typedLocals per-type 数值局部桶（组头 `int num205=0`+型帧覆写 75/170/67,同 colorLocals 模式）+门静态析取 `num205>0` 逐型判——524 臂体静态死→掷流占位空分支（roll 照耗=&& 左先同相）,525/526/527 恒真脱门。复合 `scale=A+NextFloat()`=scaleSet+scaleAddR01 收编。表 314→332 型,std 1170→1237。
- **批 3 真缺口登记（勿强行模拟）**：①661 光女（:82666-:82722）四缺口=色局部 hslToRgb 彩虹（loop 序函数非静态色）+`position=Center+NextVector2Circular` 位移+`velocity=position−Center` 派生+`CloneDust` 回声（第二粒尘!）——零尘保守（半接=臆造彩虹环错样）;②426/427 死亡 SelectRandom 环（:83966-:83981/:84019-:84028）——`noLight=true` 真 postUnsupported（VDust.noLight 字段在位但引擎不消费,接线=假保真;原版 DrawDust 免光照乘）+SelectRandom 带权 id（idPick 机制未建）——**半接**：d241 主环（426 n20/427 n10）入表,环零发零掷登记（_meta.pending reason=id:numNNN;postUnsupported:dustNN.noLight）。
- **判例**：①post 算子定性须三步：原版语义（反编译亲读）→本仓引擎字段在位性→引擎消费路径;字段在位+语义 1:1 即 std-expressible,登记「不可用」前必查引擎（本批翻案即 BJ296 跳过第三步）;②报告前提≠定谳——「fadeIn=alpha 渐入」以讹传讹（字段名误导）,实测=生长目标;③并行 D 面变异（两 suite 同变异 NpcHitDust.ts）须跨文件互斥锁（tests/npcdust-mutation-mutex.ts,O_EXCL+陈旧强拆+env 豁免子进程）+持锁后快照（模块加载期快照在并行下读他文件变异窗=毒快照回写）。
- **测试**：tests/bj304-npcdust-batch3.test.ts（A 金标钉值/B 行为锁 fadeIn 落活尘+占位耗掷+半接零掷/C 边界 661+pending 收敛/D 变异 2 发：M1 摘 fadeIn 应用、M2 摘占位掷流）;bj254/bj296 陈旧边界钉更新（314→332、419 零尘钉面移 661——661 仓内 stats 缺口 maxHp=5 与尘面无关,零尘钉面走单源直驱）;era-guard 四件套维持绿;1458 交叉=剥 meta.source 后逐字节全等。

---
## 七、验证基线（2026-09-13 收官实测）

- **全量 tests/ vitest：1097 文件 = 1096 绿 + 1 门控跳过；14689 测试 0 失败**（17 既有门控跳过）。
  收官前实测基线：24 文件 90 测红 → 逐族定谳全清（8 错误族，含 1 笔真生产缺陷 CreditsRollOverlay
  永久负缓存→TTL 自愈；SC1 抓出 getGood 首盒平方真回归→修 Enemy.ts 读取点序）。
  生产修刀：Enemy.ts(读序归位)/ScaleStats 关联锁/CreditsRollOverlay(TTL)——均有 1457 锚+变异证红。
- tsc --noEmit：**430 = 基线精确持平**（全为已知 tests/worldgen 噪声；所有触碰面零新错）。
- recon 双闸门/动画帧权威闸门/金标四闸：全绿（CLAUDE.md 工具链约定）。
- SC2 金标重产：caves-chain 双种子与 JS HEAD 逐位全等（9293480 重产=旧金标逐字节一致=零副作用不变量）。

## 八、方法论沉淀（本 campaign 新增）

- 提取器五形态盲区分类法（共享 case 算式/区间 if/DefaultTo\* helper/SetDefaults3 继承/有状态正则）→ FX53 已固化进五提取器（dry-run 对拍 622/41/0，宁缺勿伪）
- 统一探针框架 `tools/probe.mjs`（IIIII236）：私有 vite/杀树/看门狗/seed 注入，批量简报标准句已换新
- 反伪影纪律新增判例：Math.random 实体 A/B 必须 6× 统计；弹道断言不超随机语义保证面；"断言不存在"须全量 grep 核子串污染；同域异门锚不同（torchLuck=Center 等）
- 用户明令分歧注册范式（Esc 链/智能光标暗处）：反编译冲突时按用户明令动刀+回滚口单点
