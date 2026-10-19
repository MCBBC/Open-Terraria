# 双键注册根源清理 — 改动代价评估与执行方案

## Context

items.ts 存在 523 个原版物品双键注册（蛇形显式键 `vi_832_living_wood_wand` + 驼峰自动键 `vi_832_LivingWoodWand`），曾致战利品双份入箱（已打补丁）。用户要求审查清理代价。实测（esbuild 运行时注册表 + 全库扫描，9 次只读调用）：

## 实测代价

**比预估乐观**：驼峰键 96% 是死键（501/520 零引用），蛇形键已是规范键（src 侧 1196 处引用零改动）。**这不是纯删除——驼峰 def 独有字段必须先搬移**，否则静默丢数据：

| 维度 | 实测 |
|---|---|
| 双键对 | 520 干净对 + **10 个异常键**（vid 122/217/1507 蛇形键自身注册两次；vid 4851-4857 GemTree 种子驼峰注册两次——现存潜在 bug） |
| 字段差异 | 165/520 对有差异：**蛇形独有 140**（wallId×124/tile/placeStyle）、**驼峰独有 39（tool×32/axePower×5/value×2）**——驼峰侧有 32 件工具的挖掘力数据 |
| 字面量改点 | 驼峰引用仅 ~30 处需重定向（UI.ts 药水表 14 + 测试/脚本 ~16）；蛇形 1196 处零改动 |
| 运行时映射 | 改 3 处方向：`VANILLA_ITEM_KEY_BY_ID`（现 530/530 全指驼峰）、工具力循环、音乐盒/喷泉循环 → 改指蛇形 |
| **wld 导入（最大触点）** | WldImport:909 走 `VANILLA_ITEM_KEY_BY_ID` 驼峰 fallback——不改方向则 520 个物品导入被静默丢弃 |
| **存档** | v3 **零迁移字节级等价**（稳定 id = key 内嵌原版 id，两键相同；加载端首 def=蛇形）；⚠️ **v2 旧档**直读内部下标，删 520 条后 id 前移错位——需保留 v2 旧映射或声明 v2 弃用 |
| 涉及文件 | ~20（items.ts 删 ~520 行 + 修 10 重复键、WldImport、UI.ts、2 测试、~10 smoke 脚本） |
| 并发风险 | **高**——36h 内 68 commits，items.ts 被改 12 次；须单 commit 串行落地 |

**评级：中低**（数据搬移型重构，非纯删除；~2-3 小时工作量，风险集中在搬移遗漏与 v2 存档）。

## 执行方案（批准后）

1. **字段搬移**：39 个驼峰独有字段（tool/axePower/value）并入蛇形 def——脚本生成 + 人工核对清单。
2. **映射方向翻转**：`VANILLA_ITEM_KEY_BY_ID`、`VANILLA_TOOL_POWERS`、音乐盒/喷泉三循环改指蛇形键（ITEM_BY_KEY 查蛇形）。
3. **删 520 行驼峰注册** + 修 10 个重复键（122/217/1507 蛇形去重；4851-4857 驼峰去重取后注册者）。
4. **重定向 ~30 处驼峰字面量**（UI.ts 药水表、tests、smoke 脚本）。
5. **v2 存档决策**：保留旧内部 id 映射表兼容 v2（默认）或声明弃用（需用户拍板）。
6. **新增回归测试**：双键检测锁（同 vid 多键断言为 0——防再犯）、520 对字段合并后等价断言（tool/wallId/placeStyle 抽验）、wld 导入 520 物品不丢、存档往返字节等价。

## 验证

1. `npx tsc --noEmit` + `npx vitest run` 全绿（重点：item-coverage/wld 导入/save 往返/living-tree）。
2. wld 导入冒烟：导入真实 .wld，抽验 832/4281 等双键物品进包不丢。
3. build-l10n 重跑（idNames 键方向核对）。

## 前置条件（不可省）

- **避开并发窗口**：items.ts/Game.ts/SaveFile.ts 无人触碰时单 commit 落地（当前多代理高频改动，建议用户指定安静时段）。

---

## 状态：已延期（2026-08-12）；第 1 步（字段搬移）已完成（2026-08-14 批次A）

- **延期原因**：前置条件不满足——Game.ts/SaveFile.ts 有其它代理在途修改，36h 内 68 commits 高并发窗口。
- **落地条件**：items.ts / Game.ts / SaveFile.ts 无人触碰的安静窗口，单 commit 串行落地。
- **第 1 步已完成（2026-08-14）**：实测对数已从 520 涨至 **1227**（自动注册循环全量 + 蛇形键增长），
  驼峰独有字段实测 **81** 个（tool×35 / axePower×7 / value×2 / wireTool×1 / tile×22 /
  placeStyle×14，清单已逐项并入 60 个蛇形键 / 63 行，行尾注释 `←vi_…CamelKey` 标来源）。
  回归锁：tests/dual-key-fields.test.ts（驼峰独有字段=0 断言 + 搬移抽验）。
  遗留（不动，另行处理）：10 处值冲突（蛇形为手工修正值：307-312/2357 草药籽
  tile/placeStyle、498 人偶 tile）+ 14 个重复键异常（第 3 步范围）。
- 本文件为完整执行方案快照，恢复工作（第 2 步起）以此为纲。
- **考古定性（2026-09-02，tests/dual-key-fields 两红 → 守卫对齐当前阶段）**：
  第 3 步的「消除同 vid 双注册」已由 288267a5（2026-08-21）以**部分落地**方式推进——
  自动注册循环改按 vid 去重（`VID_SEEN_IDX`）+ Pascal 键**别名**到既有蛇形 def
  （修「道具搜索双行雷管」＝1246 组同 vid 双注册；不删 ITEM_DEFS 条目以避开下标平移
  事故先例）→ 双键对 **1227→611**（余对＝注册序晚于自动循环的蛇形族：banner×289＋
  f 兜底×33＋墙纸等×289）。与方案第 6 步终态断言「同 vid 多键=0」同向，属计划内推进
  非回归 → tests/dual-key-fields 的基数守卫由 ≥1200（批次A时点值）改为 ≥600（当前
  阶段基线 611，2026-09-02）。第 3 步余量未清：蛇形自身双注册 vid 122/217/1507/1681/
  3392/3393/5359＋驼峰双 def vid 4851-4857；第 2 步（映射方向翻转）未执行（别名机制
  已缓解 wld 导入/UI 药水表反查）。另 51fefa56（2026-08-18）createTile 双源回填令驼峰
  def vi_2613_PinkDungeonChest 获 tile='chest'（2613 在 itemfunc 提取外，createTile 21），
  蛇形 vi_2613_f2613 注册于回填循环之后未刷到，已按批次A惯例追补进蛇形 def（行尾注
  标来源驼峰键）。
- **SW-BK1 试点落地（2026-09-06/07，墙族 284 件归一＝第 3 步首批实质删注册）**：
  items.ts 墙物品循环③把 284 件影子 def（wallitems 循环注册的蛇形件，字段面
  {value:1,wallId} 与权威驼峰 def **284/284 全等**——探针实测零搬移负担）撤注册，
  蛇形键**别名**到同 vid 权威 def（288267a5 同构反向：彼批 camel→snake 别名，
  本批 snake→camel 别名，因墙族权威 def=自动循环先建的驼峰件）。同 vid 单 def 双键，
  消除「字段落到影子 def 而实持 def 缺失」整类病根（SW-BG1 墙不可放置事故类）。
  **撤注册安全性定谳**（当时"删注册会断旧档解码链"的顾虑经核实不成立）：
  ①v4/v5 存档（现 version 5）全走稳定 id（key 内嵌 vid 派生），内部 id 平移免疫；
  ②v3 armor/dye/trash/misc 裸下标经 legacyItemIndex 快照**键**中转
  （SaveFile.mapLegacySlot：快照[it.id]→key→ITEM_BY_KEY[key] 现值），快照索引与
  现行注册表布局早已分叉（快照 :6925-6945=Demonite 家具族、现行同位=墙影子件），
  解码零依赖现行下标；③快照内蛇形键全部保留（键不删只撤 def 条目），快照键反查
  基线不变（仅 wood_pickaxe/wood_axe 两键按 DELETED_KEYS 设计归 0）；④v2 直读=
  既有「接受破损」政策不变；⑤快照冻结后新注册的 12 件（内部 id ≥7467）不可能出现
  在 v3 档。内部 id 平移面（墙循环后注册敌旗/钓鱼/具名等 -284）：ITEM_STABLE_OF_INTERNAL
  建于文件尾（D1）按最终注册表重算、PRIV/WldImport/UI 全 vid/key 反查——
  item-retirement 往返锁+save/plr/wld 全家绿实证。
  守卫重推：tests/dual-key-fields 基数守卫 ≥600→≥320（基线 327=611−284 实测，
  banner×289+f兜底×33+杂×5）。字段搬移断言（驼峰独有=0）当前红 285 个＝banner 族
  placeStyle（驼峰侧有、蛇形 banner_bN 影子件无；玩家实持=驼峰件，无 gameplay 影响，
  2026-09-06 用旧数据 json 复核证实为 SW-BK1 前已存红）。
- **第 3 步余量（后续批，方案同 SW-BK1 试点同构）**：
  ①banner×289＋f兜底×33＋杂×5（hotline_fishing_hook/brand_of_the_inferno/chum_bucket/
  sergeants_united_shield/torch_gods_potion）——蛇形影子件撤注册别名到权威 def；
  落地前须逐族做字段面对拍（banner 权威=驼峰件含 placeStyle，影子件字段面更窄，
  撤注册零搬移）；完成后「驼峰独有字段」红与基数守卫一并退役。
  ②蛇形自身双注册 vid 122/217/1507/1681/3392/3393/5359＋驼峰双 def vid 4851-4857
  （去重取后注册者，保留键别名）。
  ③终态断言：同 vid 多 def=0 永久锁（现由 dual-key-fields 基数守卫代行）。
- **SW-BN1 二期归一收官（2026-09-07，第 3 步余量①②③全量清偿，本节终态）**：
  落刀探针（运行时注册表复算）定谳多 def vid=339 组/影子 def=341 件——banner 290
  （288 单对＋3392/3393 三 def）＋f兜底 35（33+3392/3393 的 f 件）＋杂 5＋蛇形自身双
  注册 4（122/217/1507/5359）＋宝石橡树 4851-4857 同键双 def 7。逐族字段面对拍
  （field-loss 范式）：**全族 laterOnly=[]/valueDiff 仅 122/217/1507 tool 回填差与
  4851-4857 value 1→100**——即影子 def 字段面 ⊆ 权威 def（banner 权威件独有
  placeStyle=其注册序晚于 bannerStyleClassPs :1258 类级回填循环恒未刷到；f/杂权威件
  经 itemfunc/createTile 回填与批次A搬移值全等），撤注册零字段损失。落刀四刀
  （items.ts，标记 `SW-BN1 2026-09-07`）：①banner 290 行逐条 item() → BANNER_VID_RUNS
  13 段带别名循环（键别名到 VANILLA_ITEM_KEY_BY_ID 权威 def,无权威件兜底注册现 0/290）；
  ②杂 5+f兜底 35 行 → SWBN1_MISC5_KEYS/SWBN1_F_FALLBACK_VIDS 别名循环；③蛇形自身
  双注册撤**首**注册行（122/217/1507/5359——保 byKey 现指向的回填全量 def,零行为差）；
  ④自动注册循环加 4851-4857 跳过支（VANILLA_ITEM_KEY_BY_ID 仍写,显式件 :1316 取后
  注册者）。**终态：ITEM_DEFS 7195→6854（-341）、byKey 8109 键零丢失（键全保留=别名）、
  同 vid 多 def=0**。守卫改写：tests/dual-key-fields 基数守卫（≥320）与「驼峰独有
  字段」断言随双键对消失退役（285 个 banner 族 placeStyle 预存红同批清偿）,改挂
  终态锁三件——同 vid 多 def=0 永久锁/影子键别名解析锁（20 代表键,含 banner 首末件、
  banner-plus 双影子、蛇形自身双注册、宝石橡树同键,断言与 VANILLA_ITEM_KEY_BY_ID 同靶）/
  权威面抽验（banner placeStyle 22/313[1457 Item.cs:44398 DefaultToBanner(313)]、
  2001 饵 placeStyle=8、2613 箱 tile=chest、4851 value=100）；批次A搬移抽验保留。
  验证：存档链全家（save/save-migration-v4/plr-import/character-store/wld-export/
  item-retirement/item-id-stability/item-coverage/banner-tooltip/housing-banner-anchor）
  + 金标四闸（item-stats/npc-stats/npc-frame/atlas-append）+ wld-real 导入冒烟 +
  place-backfill/placeable-sheet-prefetch/inventory-equip-rules/vampire-seed/wld/
  golden-wld-meta/sw-az1-craft-place 全绿；tsc 触碰文件零错；tests/golden 与
  vanilla.json 零写入；idNames.generated ITEM_KEY_TO_ID 826 键全可解析（键空间守恒,
  无需 build-l10n 重跑）。**遗留债（非本批）**：tests/banner-kills-save.test.ts:302
  源文本锁红——并行会话石化旁路（petrifyBypassInteractionGate）改写 Game.ts 交互门
  （:36067/:36161）致锁锚串 `if (enemy.playerInteracted === true) {` 失配,与本批无关
  （本批只动 items.ts 数据面,bannerKills 存/读/导入 8 测全绿）,由该会话按新门语义
  重推锁锚。
- **SW-BN4 三期全域收官（2026-09-08，零 items.ts 改动=纯守卫升级批，本节终态）**：
  开工定谳推翻任务书前提——BJ16 报告「339 组同 stable id 双 def」是 SW-BN1 落刀前
  快照，BN1（2026-09-07）已全量清偿。独立探针（与 dual-key-fields 锁逻辑互为独立
  视角）运行时注册表复算三视角多 def 全 0：同 vid=0 / 同 stable id=0 / 同键字符串
  重复=0（全域含非 vi_ 键）；ITEM_DEFS=6854、byKey=8109、VANILLA_ITEM_KEY_BY_ID
  6175 项全可解析，与 BN1 台账记录精确吻合（无并行会话再犯）。banner 290 影子键
  100% 别名同靶权威 def、0 兜底注册、placeStyle 290/290 defined 且=BANNER_STYLE_
  BY_VID（类级回填循环 items.ts:1268 先于别名块 :1662，权威 def 恒刷到——BJ16
  「影子件缺 placeStyle 根因=注册序晚于类级回填」的归一后确认）；f 兜底 35＋杂 5
  别名同靶；蛇形自双注册 4（122/217/1507/5359）同靶；宝石橡树 4851-4857 无同键
  双 def。唯一无权威反查件=vi_4143_manacloakstar（vid 不在 vanilla.json 的显式手
  注册，合理豁免）。落刀=tests/dual-key-fields.test.ts 终态锁扩面（标记
  `SW-BN4 2026-09-08`）：①同 vid 多 def=0（保持）②新增同键重复注册=0（全域,
  ITEM_BY_KEY 静默覆写类）③新增同 stable id 多 def=0（BJ16 判词转正为锁）④
  新增 byKey 全 vi_ 键别名一致性域扫（7430 键逐键同靶,替代 20 代表抽验;覆盖面
  地板=VANILLA_ITEM_KEY_BY_ID vid 数 6175）⑤banner 族键基数锁 290＋placeStyle
  全域回填锁（0 兜底/0 缺失/0 失配）⑥f 族键基数锁 35。判别力=决定性翻转实验
  （items.ts 尾临时注入同 vid 双 def/同键双 def/既有 vid 再注册/banner 模式键
  六行,跑后全还原经 grep+行数+注册表计数三重复核）：vid/同键/stable-id/域扫/
  banner 基数五锁全爆红且指向精确（域扫 1/7431 失靶定位 vid 122）。回归：
  存档链全家+dual-key-fields+item-stats-golden-1457+housing-banner-anchor
  12 文件 87 测 85 绿；tests/golden 与 vanilla.json 零写入；tsc 触碰文件零错；
  探针一次性文件已删。**在途红 2（均非本批,归属定谳）**：①banner-kills-save:302
  Game.ts 接线锁=BN1 已登记石化旁路债（Game.ts 今晨 05:19 仍被改,锁锚 :37113
  现为 `playerInteracted === true && opts?.petrifyBypassInteractionGate !== true`
  复合表达式）,由该会话重推锁锚;②plr-import:174 voiceVariant 期望 2 实得 1=
  并行会话 2026-09-07 23:04-23:10 改 PlrImport.ts（voiceVariant 从流字节解析改按
  skinVariant 派生,:317-329）未同步测试,先于本批首刀 14h,零交集。
  **第 3 步至此全域终态：同 vid 多 def=0 永久锁+全域扩面在位,无剩余归一化债。**
