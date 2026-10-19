# 方案 A 实施计划：物品 id 双域统一（内部序 → 原版序重排）

> 状态：**已实施（P4 终审通过，2026-09-22）**——阶段 0-6 由 BJ264/265/266/267 实施；
> **P4 独立复核+红蓝终审（BJ268）判语=通过（零新增债）**，判语/八步证据/边界声明/债表/
> 快照坐标全录 **`game/docs/plan-A-implementation-verdict.md`**（引用为准）。要点：reorder
> pass 生效（internal≡stable 恒等域，稀疏长 20754/实件 6856/0 号位=空洞）；disk-0 迁移落位
> （MANA_CRYSTAL_IID）+写出面 `=== 0` 特判撤除；稀疏洞守卫 342 触点清账+vid 回填（⑥）+
> 374 处反解税退役；BJ268 独立重放（自建 disk0 三域夹具/税删除全域逐件等价/战役块级重放/
> 红队七面）零分歧零实害；终态零新增稳定红；tsc=0/build=0；冻结窗已收。

## 0. 背景与目标

两域并存：内部 id（ITEM_DEFS 数组下标，运行时索引）vs 稳定 id（≡原版 vid+SW 扩展段 PRIV 10000+/place_v 20000+，对外契约）。踩坑两案同型（SW-BO1 箱侧+BJ146 .plr 导出侧——写盘边界误用加载向表，自回环恒等掩盖）。BJ152 哨兵网已兜底复发面；方案 A=彻底消灭内部序域（重排 ITEM_DEFS 使下标=stable），收益=灭零哨兵碰撞家族（下标 0=魔力水晶 vs 0=空槽）+删 374 处 vid 反解税（含热路径正则 viIdFromKey 267 处/vanillaIdOfItem 107 处）+internal≡原版 netID 概念统一。

## 1. 关键事实（BJ150 普查实测）

- `ITEM_DEFS` 6856 项（6178 vi_ + 678 place_v）；`ITEM_STABLE_OF_INTERNAL`（Uint16Array 6856）+`ITEM_INTERNAL_OF_STABLE`（Map 6856）双射成立、零双注册；
- internal 序与 stable 序**从下标 0 起即发散**（`ITEM_DEFS[0]=vi_109_mana_crystal` stable=109；重合率 0/6856）；
- stable 值域：vanilla<5450=5432 件、5450-6195=746、PRIV 10000+=318、place_v 20000+=360，max=20753 ⇒ 重排后**稀疏数组：长度 20754、6856 实、~13900 洞**；
- **全部 vanilla-*.json 已是 vid 键**（重排零波及）；存档 v3 裸下标段（LEGACY_KEY_OF_INTERNAL_V3 7467 项）**顺序无关设计**（remap 链=下标→key→ITEM_BY_KEY）；
- internal 消费点 290 处：热路径 ~200/冷路径 ~50/**跨边界 8 收口全部方向正确**（SW-BO1+BJ146 修复后，BJ150 逐点核读）。

## 2. 实施阶段（3-5 个专注日 + 全量验证战役）

### 阶段 0：开窗前置 ✅（BJ264 2026-09-22）
- [x] 冻结窗口声明（/tmp/planA-baseline/FREEZE.md）；并行车道为外部项目负载（backend-e2e 等）持续吃 CPU——整进程全量跑两次楔死（2 worker 满载/队列不派发），改为**分块串行**跑法（独立 vitest 进程×文件清单位置参数）后稳定。
- [x] 基线定格（/tmp/planA-baseline/BASELINE.md）：非诊断回归面 1245 件中 1241 件入账（1227 全绿+14 红测试/13 文件=工作树既有红）；4 件 zz-wc 磨盘环境受限未入账（zz-gold/m7/wld-real/genwld/spawn-safe 已入账全绿）。
- [x] 哨兵网全绿：id-domain(15)+tile-domain(101)=116/116；id-domain-guard=item 域零违例+4 处 IDG-T2 tile 陈旧债（BJ158 范围外，定格）。
- 基线既有红 13 文件（与方案 A 无关，after 对比锚）：auto-reuse-all-gate/bj236-getalpha-longtail-guard/consumable-remainder/explosion-z1-siblings/id-domain-guard(IDG-T2)/player-hurt-domain/redblue-r27/redblue-r33/remaster-catalog×2/spectate-self/sw-az1-craft-place/sw-n1-ai016-timing/sw-rb14d-audit（+wallitems-parity 行号对拍债,尾部未及预采样）。

### 阶段 1：注册尾规范化 pass ✅（BJ264 2026-09-22）
- [x] items.ts 文件尾 reorder pass：stable 求值→双射 fail-fast（重复 stable throw，D1 静默首胜不再容忍）→稀疏重排（length=maxStable+1=20754）→ITEM_BY_KEY 全量重指（别名同走映射,键插入序不变）→双桥重建恒等（STABLE let 化重建 20754 恒等表;INTERNAL 仅实件 set(s,s),洞 .get()=undefined 保持未注册语义）。
- [x] 双射实测定谳：BJ150 双射成立成立（reorder 未炸=0 重复）；PRIV 10259/10407 双 389 tile 键由 PRIV 显式号消歧。
- [x] 求值序复核：下游缓存 STAT_BY_IID/VID_BY_IID/FX_BY_IID/KIND_BY_IID 均 import 后构建且已带 !d 守卫；items.ts 中段无下标捕获（VID_SEEN_IDX 仅注册期）；唯一外部模块级捕获 proj1457.ts:259 值捕获=安全；itemMigration 退役漏斗/蜂巢 10140 覆写全键反查且落在恒等表上语义不变。
- [x] 注册序语义复验：first-def-wins/1255 Pascal 别名重指/vanilla 自动循环 skip 全为注册期语义=置换良定义（哨兵网收口 3/8+退役闸门全绿实证）。

### 阶段 2：disk 0 怪癖迁移 ✅（BJ264 2026-09-22）
- [x] 迁移式定谳：v3+ 稳定域槽位（inventory/banks/chests）磁盘 0=旧 internal 0=vi_109 魔力水晶（旧 serialize `it.id===0?0` 写出面）→ SaveFile.ts mapItem（:253/:309 两站）`it.id===0 ? MANA_CRYSTAL_IID : .get(it.id) ?? 0`（运行时键反查防漂移）。**v3 armor 裸下标段不迁移**（快照[0]='dirt_block' 键链=独立冻结域,顺序无关）✓实测；**furniture 域不迁移**（旧档磁盘 0 经 `??0`→0→furnitureFromSave 置空槽=旧行为本就是空槽,恒等域同相）✓核读；**v2 直读分支不迁移**（接受破损政策,磁盘 0 归空洞优于错件幽灵）。
- [x] serialize 写出面：`it.id===0?0` 特判撤除（:480/:577）——水晶落盘 109 非 0,磁盘 0 仅剩 `??0` 未知兜底面（旧档同形幽灵=零恶化）。
- [x] 专项回归 tests/plan-a-disk0-migration.test.ts（6 测试：布局锚/inventory/chest/round-trip 编码归正/新档 109/v3 快照域分立）。变异三发：M1 摘迁移臂（inventory+chest 两点独立验证各红→还原复绿）；M2 reorder 摘除→哨兵恒等钉+普查红→复绿；M3 mapLegacySlot 裸读变异→收口3 红→复绿。

### 阶段 3：稀疏洞守卫 ✅（BJ265 2026-09-22）
- [x] 全量扫描器清账（`ITEM_DEFS[` 325 位/`for..of` 6 位/`.length` 11 位=342 触点）：
  BJ150 普查行号已漂移,以 BJ265 盘面扫描为准。循环点 BJ264 已全部守卫（worker/
  itemSearch/Game.setupDevMode/vanillaRecipes/vanillaAccFx/vanillaEquip/vanillaItemStats
  均带 `!d`+BJ264 标记）;本刀补 5 处（scripts/item-audit.ts:31 for..of 洞 TypeError 实害 +
  UI.ts:5533/5627/5629 `?.` 精确等价守卫 + UI.ts:1689 `d?.accessory` + UI.ts:2793 `!!def`）；
  其余裸下标=槽位 id 域（读档 mapItem 迁移边界 BJ264 已收口）逐点亲读登记=洞不可达。
- [x] items.ts registration 期站点（:1480/:1895/:2341 等）=稠密相位安全（reorder 块之前）。
- [x] 验收网 tests/plan-a-sparse-hole-vid-backfill.test.ts（7 测试:稀疏形状/三迭代形态
  JS 语义/守卫冒烟/buildItemSearchPool 调用面）；变异 3 发（M1 itemSearch 摘守卫→洞
  TypeError 红 / M2 vanillaItemStats 摘守卫→初始化炸红 / M3 vanillaRecipes VID_TO_KEY
  同型红——逐发还原复绿）。

### 阶段 4：收益面兑现 ✅（BJ265 2026-09-22）
- [x] 数据面：items.ts reorder 块 ⑥ **vid 回填**——vi_ 键 def 的 vid 补齐=自身下标
  （internal≡stable≡键解析 vid 恒等域;place_v/PRIV 不回填=vid undefined 语义同相）。
  实测定谳:6856 def 全部 vi_(6178)/place_v(678) 两域、place_v 带 vid=0 件、vi_ vid≠键
  解析=0 件——`d.vid ?? -1` 与旧键前缀反解全域逐件等价（回填探针测试在案）。
- [x] viIdFromKey **src 278 调用位全数直读化+函数退役**（定义处退役注:vanillaItemCombat.ts）；
  vanillaIdOfItem src 94 调用位直读化（`ITEM_DEFS[x]?.vid ?? -1`）+函数体塌缩为一步
  直读（保留=存量测试面兼容 API,定义处退役注:Shimmer.ts）；vanillaIdOfItemKey 范围外
  保留（1 调用位+3 源锁锚定,零热路径）。多行/嵌套括号/`?.key ?? ''`/`?? -1` 冗余折叠
  全形态 codemod+残量逐点亲读（spawnDrop 节日替代=def 查表+未注册键键前缀解析兜底
  同相;starterGate 双域回退同相）。Tests 面同步 24 处（工具型改直读+6 处源码锁重锚）。
- [x] 每帧热路径税整段删除：Renderer 染料（:14262/:14311/:14413 染料三臂+heldProj/
  DisplayDoll）、Player 穿戴（accDrawApply/染料/跑步尘/infoAccs 全链）、Game 挥砍判定
  （autoReuseAllChain/heldItemUseStyle 门/useCombatWeapon/combatWeapon/rangedAmmoWeapon/
  thrownCombat）——`.vid ?? -1` 字段直读,零正则零 Map 查。★例外备案:combatWeapon/
  thrownCombat/rangedAmmoWeapon 三站的 CombatWeaponItemLike 契约（vid? 可缺）被 14 文件
  key-only 测试夹具广钉——恢复 `def.vid ?? keyFallbackVid(def.key)` 私有兜底（真实 def
  经⑥回填恒短路=生产热路径零正则;兜底仅键-only 合成对象可达）。
- [x] 验收：src 零 `viIdFromKey`/零 vanillaIdOfItem 调用位（仅定义处退役注）;tsc 零新错；
  行为钉值（mana crystal 109/fallen star 75/place_v=-1/DirtBlock vid≡下标）；行为面变异
  2 发（M4 摘回填→vid 钉红 / M5 vanillaIdOfItem 体变异→双文件红——逐发还原复绿）。

### 阶段 5：测试面甄别
- [x] 69 文件/186 处 `{id: N` 字面量逐个判 internal/vid（估 40-80 文件需改）——**BJ264 已清偿验收网面**：20 件测试文件稀疏洞守卫（find/findIndex 对洞以 undefined 调用+for..of 产洞+map 产洞数组经 Set 展开三形态）+4 件装备 id 硬编码（bj108/bj114-d 的 6015→运行时反查）+5 处字面量重钉（sentinel 掩蔽对/全域普查/D1 闸门/journey 0 号位/dual-key 三账+第三锁/sw-bj24 碰撞金丝雀/sw-bj154 快照——同域统一后旧「错位负空间」消亡,负空间改钉蜂巢 10140 单向漏斗+disk-0 洞锚+「永不落盘 0」空槽哨兵）；BJ266 键-only 夹具 14 文件显式补 vid+keyFallbackVid 退役；BJ267 战役行为面等价背书余量；BJ268 抽样 8/81 文件亲读零错位（判语 §一.4d）；
- [x] 哨兵掩蔽对 1327/1 **按新注册序有意识重钉**（BJ264：I4=4/I1291=1291 恒等钉;旧错位对前提已消亡）；
- [x] recon-item 闸门=vid 域零波及；金标网（item-stats-golden-1457/atlas-append-golden/item-retirement/dual-key-fields）=验收网（BJ264 终态全绿;BJ268 亲跑复验 DRIFT=0/161 测试全绿）。

### 阶段 6：全量验证战役
- [x] 全量 vitest（BJ267 分块 16 块 1243 文件;BJ268 块级重放 chunk-02=78/78 全绿、chunk-03 红集与基线全等）；
- [x] 哨兵网 8 收口全绿（BJ268 复验 116/116）；
- [x] 存档/wld/plr 三向 round-trip 探针扫（BJ267;BJ268 自建 disk0 三域夹具独立复现+哨兵网 wld/plr 面背书）；
- [x] 金标四闸零写入（BJ268 亲跑全绿）；
- [x] tsc 对账（BJ268 亲跑=0 错;build exit 0）。

### 阶段 7：独立复核+红蓝对抗
- [x] campaign-playbook P4 流程（定格→金标再生→门禁→独立复核→红队→判语+边界声明→登记债→档案）——**BJ268 判语=通过（零新增债）**，全录 `game/docs/plan-A-implementation-verdict.md`。

## 3. 风险登记

| 风险 | 等级 | 缓解 |
|---|---|---|
| disk 0 怪癖迁移（魔力水晶静默丢失） | ★唯一真险 | 阶段 2 专项先行+专项回归+变异 |
| 红海期并行车道污染 | 高 | 阶段 0 冻结窗口 |
| 稀疏洞认知税（长期） | 中 | items.ts 头注铁律+守卫 |
| 注册序语义复验（first-def-wins/别名/skip） | 中 | 闸门全量复跑+双射复测 |
| 热路径性能回归 | 低 | 重排后逐帧画像对比（预期=改善：删正则税） |
| 回滚 | 兜底 | revert 即可（旧 internal id 除 v3 层外无持久化） |

## 4. tile 域（范围外，另行评估）

tile 域（762 defs、stable=sheet、导出已探针验证干净）不在本 A 范围。⚠️ BJ154 金属探测器（sheet 键表被内部 id 直查=火把幻影报生命水晶）证明 tile 域**运行时消费面同样会踩**——BJ158 tile 域键表普查+哨兵扩展（IDG-T 系）已立项并行；A 启动前以 BJ158 结论复核 tile 域是否需要同款治理。

## 5. 触发与执行

- **触发指令**：用户说「启动方案 A」；
- **执行**：本文档逐阶段派刀（阶段 1-2 一刀、3-4 一刀、5 一刀、6-7 红蓝+独立复核）；
- **先行确认**：开窗时点无在途车道依赖测试（BJ147 套装组A/B/C 等归队后）；
- **完成后**：internal 域退役归档+铁律文档化（新代码禁再引入内部序语义）。
