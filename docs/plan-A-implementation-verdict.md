# 方案 A 实施终审档案（P4 独立复核+红蓝终审 · BJ268）

> 判语：**通过（零新增债）**——方案 A 阶段 0-6（BJ264 reorder+disk0 迁移 / BJ265 稀疏洞
> 守卫+vid 回填+税删除 / BJ266 测试面甄别+兜底退役 / BJ267 全量战役）实施面经 BJ268
> 独立重放全数复现成立；红队攻击六面+面外自由攻击**零实害命中**；终态红集相对基线
> **零新增稳定红**。终审时点 2026-09-22（审计日），审计人 BJ268（与实施刀 BJ264-267 无
> 共享断言：全部复核脚本/夹具独立重写，测试文件临时架收审即删）。

## 一、八步证据

### 1. 定格（独立复算，非采信 BJ264 数字）

临时架 `tests/zz-bj268-frame.test.ts`（独立 import items.ts 复算，收审已删）逐项复现：

| 项 | 声称值 | 独立复算 | 判 |
|---|---|---|---|
| `ITEM_DEFS.length` | 20754 | 20754 | ✓ |
| 实件数 | 6856 | 6856（vi_=6178 + place_v=678，其它键域=0） | ✓ |
| 稀疏洞 | ~13898 | 13898=20754−6856 | ✓ |
| `ITEM_DEFS[0]` | undefined | undefined | ✓ |
| `ITEM_DEFS[109].key` | vi_109_mana_crystal | vi_109_mana_crystal（`vid`亦=109） | ✓ |
| maxStable | 20753（length=max+1） | 独立重算 max=20753 | ✓ |
| 双桥写向恒等 | `ITEM_STABLE_OF_INTERNAL[i]===i` | 逐位全等（长度 20754） | ✓ |
| 双桥读向恒等 | map 仅实件、key≡value | size=6856、每 entry s===i、指实件、实件全覆盖、洞位无键 | ✓ |
| 键唯一性 | 无双注册 | canonical key 6856 无重复 | ✓ |
| byKey 一致性 | canonical 回指自身；别名不指洞 | 全过（checked>6856） | ✓ |

### 2. 金标再生（亲跑）

- 哨兵网：`tests/id-domain-sentinel.test.ts`（15）+ `tests/tile-domain-sentinel.test.ts`（101）全绿；
- 金标四闸：`item-stats-golden-1457`（6）/`npc-stats-golden`/`npc-frame-golden`（4）/`atlas-append-golden` 全绿；
- 附加闸：`item-retirement` + `dual-key-fields`（15）全绿；合计 8 文件 161 测试 161 绿；
- 数据对账：`tools/recon-item-1456-1457.mjs` **DRIFT=0**；`tools/recon-npc-1456-1457.mjs` CLASS A=0 / CLASS B=0；
- `tools/id-domain-guard.mjs`：item 域（IDG-I）零违例；IDG-T2 tile 域 **恰 4 处**（tiles.ts
  ALLOW_LIGHT_IN_WATER_SHEETS / VanillaFraming.ts ORE_SHEETS+PLATFORMS_SHEETS / Housing.ts
  ORE_SHEETS）=冻结窗定格基线值，不多不少。

### 3. 门禁（亲跑）

- `npx tsc --noEmit`：**0 错**（基线对账=0，/tmp/bj268-tsc.log 零行）；
- `npx vite build`：**exit 0**（12.86s，chunk 体积警告=既有）。

### 4. 独立复核（重放，非采信）

**a. 双射/稀疏形状**：见 §一.1 定格表（同脚本覆盖）。

**b. disk0 三域分立（自建夹具，走真实 loadSaveData/serializeSave）**：
临时架 `tests/zz-bj268-disk0.test.ts`（9 测试全绿，收审已删；夹具=自构 RLE 空世界 20×15
+手写 varint 编码，非采信 BJ264 夹具）：
- ① v3 稳定域：inventory 磁盘 0→**109 魔力水晶**、磁盘 2→2（dirt）；chests 磁盘 0→109、109→109；
- ② v3 裸下标段（域分立铁证：同磁盘 0 不同归）：armor[0] 磁盘 0→LEGACY_KEY_OF_INTERNAL_V3[0]
  =`dirt_block` 退役键链→**2（非 109）**；armor[1]→stone_block 3；trash 磁盘 0→2；
- ③ furniture 域：slot 磁盘 0→`get(0)=undefined→0`→**空槽 null**（非水晶）；display_doll 槽位补齐 19；
- ④ v2 直读：inventory/armor/chest 磁盘 0 全部**原样透传 0**（不迁移、不造水晶幽灵）；
- ⑤ 写出面：水晶 109 落盘 **109 非 0**（`===0` 特判已撤）；v5 round-trip 109/75/2 全数读回恒等；
  v5 armor 磁盘 0（未知兜底面）→109=与旧 `??0` 幽灵同形（零恶化备案钉）。

**c. 税删除等价**：抽样升级为**全域逐件**——独立重写旧正则语义
（`viIdFromKey(key)= /^vi_(\d+)_/ → Number ?? -1`）对全部 6856 实件对照 `d.vid ?? -1`：
**mismatch=0**；vi_ 6178 件 vid≡自身下标；place_v/PRIV 678 件 vid 恒 undefined→-1（同相）。
5 站位亲读复核直读域正确：Renderer.ts:14261（染料）/Player.ts:1751、:2090（穿戴）/ItemDrop.ts:141
（全函数消费）/UI.ts:5533（quick maxStack `?.` 洞守卫）/scripts/item-audit.ts:31（for..of `d &&` 守卫）。
★ BJ267 复钉案独立验证：debug-report 夹具 `{id:1}` → `ITEM_DEFS[1].vid`，本刀实测
ID 1=`vi_1_IronPickaxe`（vid 回填=1）——旧钉 −1（旧序 1 号位=vi_1291 无 vid）按新域设计值改钉 1 **正确**。

**d. 阶段 5 甄别抽样（8/81 文件）**：`{id: N` 字面量域判定亲读——
- 非物品域（中性）：sw-bj1-interact（NPC 槽位 id）、audio-recorder（BGM 轨 id）、proj-wet-boss-cluster（Enemy id）；
- 物品域对准验证：bank-storage（1-4 恒等 round-trip）、extractinator（424=SiltBlock/999=Amber/1103=slush
  =正确输入域）、sw-bj81-itemsearch（75=fallen_star）、vault-luck（500-503）、string-accessory
  （3306=WhiteString/5540=MagicString/1007·1050·1066=染料族）——全部与消费面语义对准，零错位。

**e. 全量战役抽验（块级重放）**：重跑 phase6 chunk-02（78 文件）=**78/78 全绿**（与战役 rc=0 全等）；
chunk-03（78 文件）=1 红（consumable-remainder，基线红）+0 新红。战役期 chunk-03 曾 2 红
（+debug-report）——定谳见 §二红集对账。

### 5. 红队攻击（六面+面外，全数零实害）

| # | 攻击面 | 手法 | 结果 |
|---|---|---|---|
| R1 | 变异操作面 | 全仓 grep `ITEM_DEFS.push/splice/unshift/sort/pop/shift/reverse/fill/copyWithin` + `.length=` 写 | 仅 items.ts:125 注册期 push（稠密相位，reorder 块之前=安全）+reorder 块自身 :2403/:2405；src 零其它变异点 |
| R2 | 元素写面 | grep `ITEM_DEFS[…]=` 写式 | src 内除 items.ts reorder 块外**零写点**；`ITEM_BY_KEY[…]=` 同零（server 侧亦零） |
| R3 | 键序假设面 | grep `Object.keys/entries/values(ITEM_BY_KEY)` | items.ts 之外零消费点（键插入序声明 vacuously 成立） |
| R4 | 稀疏数组序列化面 | grep stringify×items 交集 / structuredClone / postMessage 载荷 | 无任何 `JSON.stringify(ITEM_DEFS/BY_KEY)`（洞→null 炸面不存在）；worker 经模块 import 自算（worldGen.worker:47 洞守卫 `-1` 压格），无跨 postMessage 传数组 |
| R5 | 遍历/方法面 | 32 处 `of ITEM_DEFS)` + 6 处 `.length` 循环 + forEach/entries 逐点亲读 | 全部带 `!d` 守卫（BJ264/265 标记在位）；`ITEM_DEFS.forEach`（itemSearch:110，跳洞安全）+`Object.entries(ITEM_DEFS)`（JourneyPowersUI:58，洞非 own key 安全）|
| R6 | disk0 边界外第四通道 | SaveData 全字段枚举 + server 协议面 + 随机下标/模块级捕获 | item id 载荷通道穷举=inventory/banks/armor/dye/trash/miscEquips/miscDyes/loadouts（mapItem/mapLegacySlot）+chests（mapItem）+furniture（furnitureFromSave mapId）——**无第四未映射通道**；townNpcs=键域、pillarNpcs/pressurePlates/teSnap 非物品域；联机协议掉落/残余走 **key 字符串**（room.ts:997/:1367 域中立）；`Math.random()*ITEM_DEFS.length` 零命中；`ITEM_STABLE_OF_INTERNAL` 为 let 重指——全仓消费点均为 live import 调用时取用，无模块级值捕获（MANA_CRYSTAL_IID 模块求值走 ITEM_BY_KEY const=安全） |
| R7 | 面外自由攻击 | 双域交叉误读扫描（WldImport stItem/PlrImport netIdOf/TenthAnniversaryImprove）+ vid 回填副作用面 | WldImport:801 stItem=写向 internal→stable（恒等域两代皆真）；PlrImport netIdOf 同；TenthAnniversaryImprove:82 带界守卫；vid 回填仅改 def 对象（defs 无序列化消费面，金标四闸绿证）；`d.vid ?? (key 正则)` 混合臂（vanillaRecipes:423 等）=回填后死兜底，无害 |

**红队结论：零实害命中，无新型缺口立案。**

### 6. 终态红集对账（零新增稳定红）

战役期 failed-files（16）与基线集差异逐件定谳（本刀隔离复跑判别）：
- **稳定红 14 文件**（全部基线既有/登记债）：auto-reuse-all-gate / bj236-getalpha-longtail-guard /
  consumable-remainder / explosion-z1-siblings / **id-domain-guard（=4 处 IDG-T2 tile 陈旧债，
  guard 工具实测恰基线 4 处零增）** / player-hurt-domain / redblue-r27 / redblue-r33（usesound
  缺键补齐面=基线同位红）/ remaster-catalog×2 / spectate-self / sw-az1-craft-place /
  sw-n1-ai016-timing / sw-rb14d-audit / **wallitems-parity（B 源锚漂移=登记债）**；
- **BJ267 复钉 2 件**（盘面已改、未随快照提交）：debug-report（−1→1，本刀独立验证新域设计值正确）、
  redblue-r33 DamageVar 假红钉 RNG（4% 掷域）；
- **环境随机红 4 件**（战役满载红、隔离复跑全绿，本刀亲验）：orphan-b2 / hellwing-cast /
  parity-g-forensics / redblue-r29。

### 7. 判语

**通过（零新增债）。** 实施五刀（BJ264-267）自报与独立重放零分歧；disk0 唯一真险点经
自建夹具三域分立独立复现；374 处反解税删除经全域逐件等价重演；红队七面零命中。
方案 A 目标全数兑现：internal 序域退役（下标≡stable≡原版 vid 恒等域）、零哨兵碰撞家族根除
（0 号位=空洞语义）、每帧键前缀正则税整段删除。

## 二、边界声明（已知偏差与登记债全集）

1. **磨盘 4 件**（zz-wc-count2/zz-wc-verify2 等 worldgen 金标磨盘）：基线期即环境受限未入账，
   终态亦未跑——tile 域与 Plan A 改动零接触，维持欠账另验；
2. **低优普查案 C1-C3/E1 续批**：实施刀（BJ266 测试面甄别）登记的低优类目续批件，随甄别台账滚动；
3. **随机红 4 件**：orphan-b2（既有登记）/hellwing-cast/parity-g-forensics/redblue-r29——
   满载并行才现形，隔离全绿；本刀仅判别未修；
4. **wallitems-parity B 源锚漂移**：行号对拍债，基线尾部未及预采样，维持登记；
5. **IDG-T2 tile 域 4 处**（BJ158 范围外陈旧债）：方案 A 期间保持不多不少（本刀复核=恰 4 处）；
6. **v2 直读分支**：旧 internal 裸下标在恒等域下=「vid 直读」语义（接受破损政策内，
   对原版件反而更准），政策不变；
7. **v5 armor 磁盘 0 →水晶**：未知 id 兜底 `??0` 与旧档幽灵同形（零恶化不新增），已钉备案。

## 三、债表（BJ268 新登记）

| 债 | 锚 | 级别 |
|---|---|---|
| 快照提交 provenance：Plan A 全部实施面随 HEAD b21333f4（2026-09-22 09:48）以陈旧 message「Add bj257-combat-book-use.json…」捆绑入库，Plan A diff 不可经 git 单独圈定；BJ267 两件复钉（debug-report/redblue-r33 测试文件）仍在工作树未提交 | git b21333f4 | 中（溯源税，非行为面） |
| JourneyPowersUI.ts:68 注「ITEM_DEFS[0] 是合法位」已随 reorder 失效（0 号位=空洞），行为无涉（哨兵 −1 返回未变），纯陈旧注 | src/ui/JourneyPowersUI.ts:66-70 | 低 |
| `(typeof ITEM_DEFS)[number]` 类型不感知稀疏洞（TS 把洞读型为 ItemDef 非 undefined）——洞守卫靠 BJ265 亲读纪律而非类型系统；后续若出洞解引用 tsc 不拦 | src/data/items.ts:102 | 低（长期认知税，勿轻改：改型会全仓泛滥可空） |
| `d.vid ?? (key.startsWith('vi_') ? parseInt…)` 混合兜底臂（vanillaRecipes.ts:423/vanillaItemStats.ts:76 等）在回填后为死码，可择期清理 | src/data/vanillaRecipes.ts:423 | 低 |

## 四、快照坐标

- 实施锚：`src/data/items.ts`（双桥 let :2338 / Map :2340 / reorder 块 :2362-2424 含 ⑥ vid 回填）；
  `src/save/SaveFile.ts`（MANA_CRYSTAL_IID :33 / remapPlayerSlots mapItem :272-273 / loadSaveData
  mapItem :328-329 / furniture :489-493）；`src/save/serialize.ts`（mapItem :477-487 / player :558-567 /
  furniture :581）；`src/data/vanillaItemCombat.ts`（viIdFromKey 退役注 :279-283、keyFallbackVid
  退役注 :285-290）；`src/stats/Shimmer.ts`（vanillaIdOfItem 塌缩 :77-80）；
- 验收网：`tests/plan-a-disk0-migration.test.ts`（6）/`tests/plan-a-sparse-hole-vid-backfill.test.ts`（7）+ 哨兵网 116；
- 审计工件：/tmp/planA-baseline/（冻结窗+基线）/tmp/planA-bj265/（甄别台账）/tmp/planA-phase6/
  （战役 16 块日志+红集）/tmp/bj268-tsc.log（门禁）；BJ268 临时复核架（frame/disk0/literals 三件）
  已于收审删除，证据全录本档；
- 冻结窗：/tmp/planA-baseline/FREEZE.md 已由 BJ268 于终审通过后移除收窗（2026-09-22）。
