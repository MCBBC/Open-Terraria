# 全方块审计台账（2026-08-23）

> 基线 = Terarria1456 反编译源码（WorldGen.cs）。
> 审计维度：①挖掘/毁坏条件（pick/axe/上方保护门）②破坏掉落物（vid/stack）③掉落物贴图（Item_N 对应）。
> 方法：6 子代理分区对账（每区一张表，逐项填 确认状态+行号）。
> 状态图例：✅确认正确 | ⚠️偏差(已派发) | ❌未实装(已派发) | 📋登记(微差不修)。

## 1457 基线方法索引

| 方法 | 行号 | 作用 |
|---|---|---|
| KillTile | WorldGen.cs:63559 | 破坏主入口（上方保护/连锁/特效） |
| CheckTileBreakability | WorldGen.cs:62403 | 破坏能力判定（0/1/2 档） |
| CheckTileBreakability_HasReasonToReturnEarly | WorldGen.cs:62488 附近 | 上方支撑族早退 |
| KillTile_DropItems | WorldGen.cs:63996 | 掉落投递 |
| KillTile_GetItemDrops | WorldGen.cs:64012 | 掉落主 switch（no-drop 表 :65803-66145） |
| GetItemDrop_*（21 族） | WorldGen.cs:39766-50157 | style→物品 掉落表 |
| CheckCactus / CheckTree / CheckSign 等 | WorldGen.cs 分散 | 特殊连锁破坏 |

本仓方块总数: 679（tiles.ts）。分区: A 自然solid 102 / B 建材 421 / C style掉落族 26 / D decor 90 / E 功能 39 / 其他 1

---

## 第一批审计结果汇总（A/B/C 区）

| 分区 | 项数 | ✅确认 | ⚠️偏差 | ❌未实装 | 📋登记 |
|---|---|---|---|---|---|
| A 自然 solid | 102 | 41 | 2 | 59 | 0 |
| B 建材 | 421 | 60 | 7 | 230 | 124 |
| C style 掉落族 | 26 | 24 | 2 | 0 | 4 |
| D decor 装饰/植物 | 90 | 46 | 12 | 27 | 4 |
| E 功能方块 | 39 | 11 | 1 | 24 | 3 |
| F 掉落贴图 | 1626 vid | 全有图 | 0 | 0 | 1(哨兵) |
| **合计** | **679 方块 + 1626 vid** | **182+全图** | **24** | **340** | **132** |

**关键发现**:
- S1 系统性（B 区 ❌×192 + A 区 ❌×59）：`drop:null` 的 v_ 方块挖掉掉 `place_v_` 复刻件而非原版 vid——171 个原版 vid 中 121 个是配方材料，配方按 vid 严格计数 → 挖→合成链断裂。修复 = tiles.ts 批量回填 drop vid（vid 全验有图）。
- S2 多 style 家族（B 区 ❌×27）：画/营火/盆栽/圣物底座等原版逐 style 掉真物品，仓库恒掉通用件。
- C-1 ⚠️ Doors 表缺 1.4.5 新门 9 档（style 60-68）→ 新门破坏恒掉木门。
- ⚠️ TILE_DUNGEON_SHEETS 误收 481-483 裂砖（原版无镐门槛）+ 漏收 677-679 古砖（原版 <100 不可挖）。
- A 区 ⚠️ ash 掉 3 应 172；thin_ice 应无掉落。

## 修复批终态（2026-08-23，6 修复代理全部收口）

| 代理 | 范围 | 落点 | 状态 |
|---|---|---|---|
| ① | S1 系统性 drop 回填 | tiles.ts 252 件 `drop:<vid>`（A 58+1 / B 192 / C-3 铂金砖 719），逐 case 对 1457 KillTile_GetItemDrops :64477-66613 | ✅ |
| ② | S2 多 style 家族（S2×27+D-7） | vanillaStyleDrops.ts 新增 20 表 + 33 sheet ≈447 档；三消费点（object 支/1×1 尾/失撑链）同源；假容器 -1 哨兵压 place_v_ 兜底；宝石锁 440 伴生钥匙；216/572 放置竖排修正 | ✅ |
| ③ | 门族 4 修 | Doors style 60-68 九门；sv==0 神庙锁门不掉落；isLockedDoor 挖掘门（tileHitDamage）；开态门失撑掉 386→3239/389→3240 | ✅ |
| ④ | D-1 decor 失撑链 + D-3 火把 24 档 + D-4 cordage + D-6 25 件 | Game.ts DECOR_SUPPORT_KIND 表+checkDecorSupport 十族分派+killDecorTile（breakTile 链+4096 级联预算）；torchDropVid（咒火炬 523 等，堵刷炬漏洞）；cordage 割藤 1/2 掉 2996；tiles.ts 21 件直掉+4 逻辑件走帧表 | ✅ |
| ⑤ | E 区 22 修 | tiles.ts 14 直掉 + vanillaStyleDrops 6 sheet（129/133/50/103/135/144）+ 蛛网 51 墙门 + 小堆饰 185 掷串 | ✅ |
| ⑥ | A 区 58 + 挖门修正 | A 区 58 drop 回填（苔藓→3/草组→2/泥组→176 fallthrough 组全对）；ash 172；thin_ice null（无 v_ 前缀不触兜底，已注释防回改）；TILE_DUNGEON_SHEETS [41,43,44,677,678,679]（-481-483/+677-679+pick100×3）；v_137 陷阱 210 镐力门（styles1-4+种子豁免，tileHitDamage :12002） | ✅ |

**回归**：tsc src/ 零错；decor-support 16/16、style-drop-restore 67/67、tile-drop-null/tile-passability/multi-tile-drop/cracked-brick-chain 等全绿；全量套件 6391+ 过，30 败逐项归因全部为并行会话在飞工作（worldgen 金标门=金标 03:54 vs pass 改动 13:03-15:12、双键重构 key 大小写、TownNPC 越障跳数值）或环境（hive 负载超时、tools/_* 缺 /tmp/vserver 夹具），本批自引入 3 处（enemy-death-single mock/weather mock/living-tree 断言）已当场修复。**world-final-hash 金标未由本批重烘**（分歧属 worldgen 并行会话，待其收口自烘）。

**遗留登记（需大表转录，另批）**：~~v_105 雕像 51 档 StatueStyleToItem 表；v_91 旗帜 CheckBanner 分段表~~ → **2026-08-23 二批已清偿**（雕像实域 **83 档** 0..82（审计注 51 有误,StatueStyleToItem :38311-38374,公式 fx/36+(fy/54%3)*55 :38542）;旗帜 **316 档/22 段**（CheckBanner :46493,掉落链 :46564-46655,style=fx/18+(fy/54)*111）;399 vid 全验图,双射实证）;v_110 种子档拆分已修（:65528 神圣短草无种子支,曾并入 3 支误掉 283）。

## 二批收口（2026-08-23 下午,2 代理）

| 代理 | 范围 | 落点 | 状态 |
|---|---|---|---|
| ⑦ | TileFrame 全量派发对照+覆盖补齐（用户实报 233 丛林大型植物悬空根修） | 新增 kind 18 个（jungleplant/oasisplant/wallhang/stalactite/moss/pile/deco3x2/deco3x1/dyeplant/waterplant/sandplant/hangtop/gnome/treebase/stinkbug/xmas/support2x2/drip）+ 既有 kind 扩员 5 处,覆盖 61 sheet;判据助手 solidTileStrictAt/solidAllow{Top,Left,Right}SlopeAt;对照表见分区 G | ✅ |
| ⑧ | 雕像 83 档 + 旗帜 316 档全转录 | vanillaStyleDrops.ts 追加 STATUES/BANNERS 两表+styleFromFrame[105]/[91]+styleDropVid case 91/105;Game.ts 零改动（三消费点按 sheet 直调已通） | ✅ |

**二批回归**：decor-support 49 it（含用户场景 233 双变体）/style-drop-restore 74/multi-tile-drop 28/tile-drop-null/tile-passability 合计 163 全绿;tsc src/ 零错。

---

### 分区 A（102 项）

自然实心方块：土/石/矿/宝石/冰/沙/雪/丛林/腐化/神圣。对账点 = pick 门槛(TEdit)+drop vid(GetItemDrops default 档/矿石族)。

| 方块 | tiles.ts 行 | 挖掘条件(pick/axe) | 掉落(vid) | 贴图 sheet | 确认 | 1457 基线行 |
|---|---|---|---|---|---|---|
| dirt | 50 | pick:0 axe:— | 2 | 0 | ✅ | case 0 :64075-64081（泥土） |
| stone | 51 | pick:0 axe:— | 3 | 1 | ✅ | case 1 :64183-64184（石块） |
| grass | 52 | pick:0 axe:— | 2 | 2 | ✅ | case 2/109/199/477/492 :64076-64081（草块掉泥土；1457 草块不掉种子） |
| ore_copper | 53 | pick:0 axe:— | 12 | 7 | ✅ | case 7 :64527-64528（铜矿） |
| ore_iron | 54 | pick:0 axe:— | 11 | 6 | ✅ | case 6 :64525-64526（铁矿） |
| ore_silver | 55 | pick:20 axe:— | 14 | 9 | ✅ | case 9 :64533-64534；pick 20=原创平衡（1457 银矿无镐力门），与钨矿 20 同族一致 |
| ore_gold | 56 | pick:40 axe:— | 13 | 8 | ✅ | case 8 :64530-64531；pick 40 与铂金 40 同族一致（1457 无门） |
| wood | 59 | pick:0 axe:— | 9 | 30 | ✅ | case 30 :64674-64676（木材块→木） |
| door_closed | 67 | pick:0 axe:— | 25 | 10 | ✅ | GetItemDrops 无掉落（:65803 no-drop 表）；门物走 CheckDoorClosed :87253→DropDoorItem :69466→GetDoorItem(style0)=25 :69257——端到端 vid 正确（机制不同已核） |
| sand | 72 | pick:0 axe:— | 169 | 53 | ✅ | case 53 :64735-64736（沙块） |
| snow | 73 | pick:0 axe:— | 593 | 147 | ✅ | case 147 :64825-64826（雪块） |
| ash | 75 | pick:0 axe:— | 3 | 57 | ⚠️ | case 57 :64747-64748=**172 AshBlock**（1.4.4+ 灰烬独立物品）；本仓仍掉 3 石块 |
| ore_tin | 82 | pick:0 axe:— | 699 | 166 | ✅ | case 166 :64594-64595（锡矿） |
| ore_lead | 83 | pick:0 axe:— | 700 | 167 | ✅ | case 167 :64597-64598（铅矿） |
| ore_tungsten | 84 | pick:20 axe:— | 701 | 168 | ✅ | case 168 :64600-64601；pick 与银矿 20 同族一致 |
| ore_platinum | 85 | pick:40 axe:— | 702 | 169 | ✅ | case 169 :64603-64604；pick 与金矿 40 同族一致 |
| ore_demonite | 86 | pick:55 axe:— | 56 | 22 | ✅ | case 22 :64662-64664（魔矿）；pick 55=Player.cs :53005（1457 仅地下设门，本仓全深度同值=📋 级微差） |
| ore_meteorite | 87 | pick:50 axe:— | 116 | 37 | ✅ | case 37 :64693-64694（陨石）；pick 50=:53001 |
| ore_hellstone | 88 | pick:65 axe:— | 174 | 58 | ✅ | case 58 :64750-64751（狱石）；pick 65=:53017 |
| ore_cobalt | 90 | pick:100 axe:— | 364 | 107 | ✅ | case 107 :64774-64775；pick 100=:53040 |
| ore_mythril | 91 | pick:110 axe:— | 365 | 108 | ✅ | case 108 :64777-64778；pick 110=:53044 |
| ore_adamantite | 92 | pick:150 axe:— | 366 | 111 | ✅ | case 111 :64780-64781；pick 150=:53048 |
| gem_sapphire | 99 | pick:30 axe:— | 177 | 63 | ✅ | case 63-68 :64995-65002 `dropItem=type-63+177`（蓝宝石 177）；pick 30 全宝石族一致（1457 无门） |
| gem_ruby | 100 | pick:30 axe:— | 178 | 64 | ✅ | 同上（178） |
| gem_emerald | 101 | pick:30 axe:— | 179 | 65 | ✅ | 同上（179） |
| gem_topaz | 102 | pick:30 axe:— | 180 | 66 | ✅ | 同上（180） |
| gem_amethyst | 103 | pick:30 axe:— | 181 | 67 | ✅ | 同上（181） |
| gem_diamond | 104 | pick:30 axe:— | 182 | 68 | ✅ | 同上（182） |
| ice | 107 | pick:0 axe:— | 664 | 161 | ✅ | case 161 :64621-64622（冰块） |
| thin_ice | 108 | pick:0 axe:— | 664 | 162 | ⚠️ | 162 在 no-drop 表 :65863=**无掉落**（薄冰不可获得）；本仓掉 664 |
| snow_brick | 110 | pick:0 axe:— | 594 | 148 | ✅ | case 148 :64828-64829（雪砖） |
| clay | 116 | pick:0 axe:— | 133 | 40 | ✅ | case 40 :64702-64703（粘土） |
| glass | 117 | pick:0 axe:— | 170 | 54 | ✅ | case 54 :64882-64883（玻璃） |
| obsidian | 118 | pick:55 axe:— | 173 | 56 | ✅ | case 56 :64744-64745（黑曜石）；pick 55=:53009 |
| gray_brick | 119 | pick:0 axe:— | 129 | 38 | ✅ | case 38 :64696-64697（灰砖） |
| red_brick | 120 | pick:0 axe:— | 131 | 39 | ✅ | case 39 :64699-64700（红砖） |
| mud | 121 | pick:0 axe:— | 176 | 59 | ✅ | case 59/60/661/662 :64986-64991（泥块） |
| silt | 122 | pick:0 axe:— | 424 | 123 | ✅ | case 123 :64606-64607（淤泥） |
| v_181_red_moss_block | 179 | pick:0 axe:— | null | 181 | ❌ | 苔藓族 case 179-183/381/534/536/539/625/627 :64049-64059 → **3 石块**（1457 无苔藓方块掉落,挖苔藓得石头） |
| v_189_cloud_block | 180 | pick:0 axe:— | null | 189 | ❌ | case 189 :64636-64637 → **751 Cloud** |
| v_183_purple_moss_block | 181 | pick:0 axe:— | null | 183 | ❌ | 同苔藓族 :64049-64059 → **3** |
| v_179_green_moss_block | 187 | pick:0 axe:— | null | 179 | ❌ | 同苔藓族 :64049-64059 → **3** |
| v_48_spike | 191 | pick:0 axe:— | null | 48 | ❌ | case 48 :64723-64724 → **147 Spike**（尖刺可回收;pick 0 ✓ :53017 旁路=双倍镐伤档） |
| v_192_living_leaf_block | 192 | pick:0 axe:— | null | 192 | ✅ | no-drop 表 :65871（生命树叶无掉落,1457 同） |
| v_191_living_wood_block | 195 | pick:0 axe:— | null | 191 | ❌ | case 191 :64585-64586 → **9 Wood** |
| v_196_rain_cloud_block | 196 | pick:0 axe:— | null | 196 | ❌ | case 196 :64657-64658 → **765 RainCloud** |
| v_118_pearlstone_brick | 197 | pick:0 axe:— | null | 118 | ❌ | case 118 :64795-64796 → **412 PearlstoneBrick** |
| v_152_ebonstone_brick | 199 | pick:0 axe:— | null | 152 | ❌ | case 152 :64741-64742 → **609 EbonstoneBrick** |
| v_158_rich_mahogany | 200 | pick:0 axe:— | null | 158 | ❌ | case 158 :64615-64616 → **620 RichMahogany** |
| v_130_active_stone_block | 205 | pick:0 axe:— | null | 130 | ❌ | case 130 :64867-64868 → **511 ActiveStoneBlock** |
| v_193_slime_block | 206 | pick:0 axe:— | null | 193 | ❌ | case 193 :64654-64655 → **762 SlimeBlock** |
| v_190_glowing_mushroom_block | 207 | pick:0 axe:— | null | 190 | ❌ | case 190 :64993-64994 → **183 GlowingMushroom**（发光蘑菇物品,非方块） |
| v_137_traps | 210 | pick:0 axe:— | null | 137 | ❌ | case 137 :65597-65619 按 `frameY/18` 分档 → **539/1146/1147/1148/1149/5135**；且 styles 1-4 镐力门 210（Player.cs :53025-53031），本仓 pick:0 |
| v_117_pearlstone_block | 211 | pick:65 axe:— | null | 117 | ❌ | case 117 :64792-64793 → **409 PearlstoneBlock**（pick 65 ✓ =:52997） |
| v_112_ebonsand_block | 212 | pick:0 axe:— | null | 112 | ❌ | case 112 :64786-64787 → **370 EbonsandBlock**（1457 黑沙无镐力门,pick 0 ✓） |
| v_109_hallowed_grass_block | 216 | pick:0 axe:— | null | 109 | ❌ | case 109 :64077-64081 → **2 泥土** |
| v_138_boulder | 251 | pick:0 axe:— | null | 138 | ✅ | no-drop 表 :65859（巨石格无掉落,1457 同;巨石物另走 NPC/机关链） |
| v_151_sandstone_brick | 379 | pick:0 axe:— | null | 151 | ❌ | case 151 :64738-64739 → **607 SandstoneBrick** |
| v_182_blue_moss_block | 381 | pick:0 axe:— | null | 182 | ❌ | 同苔藓族 :64049-64059 → **3** |
| v_45_gold_brick | 383 | pick:0 axe:— | null | 45 | ❌ | case 45 :64714-64715 → **141 GoldBrick** |
| v_175_tin_brick | 391 | pick:0 axe:— | null | 175 | ❌ | case 175 :64846-64847 → **717 TinBrick** |
| v_119_iridescent_brick | 397 | pick:0 axe:— | null | 119 | ❌ | case 119 :64798-64799 → **413 IridescentBrick** |
| v_120_mudstone_brick | 398 | pick:0 axe:— | null | 120 | ❌ | case 120 :64801-64802 → **414 MudstoneBrick** |
| v_23_corrupt_grass_block | 416 | pick:0 axe:— | null | 23 | ❌ | case 23 :64668-64670 → **2 泥土**（1457 腐化草不掉种子） |
| v_41_blue_brick | 418 | pick:100 axe:— | null | 41 | ❌ | case 41 :64705-64706 → **134 BlueBrick**（pick 100 ✓ =tileDungeon 门 :53033-53037） |
| v_75_obsidian_brick | 419 | pick:0 axe:— | null | 75 | ❌ | case 75 :64756-64757 → **192 ObsidianBrick** |
| v_199_crimson_grass_block | 420 | pick:0 axe:— | null | 199 | ❌ | case 199 :64078-64081 → **2 泥土**（不掉种子） |
| v_60_jungle_grass_block | 421 | pick:0 axe:— | null | 60 | ❌ | case 60 :64987-64991 → **176 泥块**（丛林草掉泥不掉土） |
| v_70_mushroom_grass_block | 422 | pick:0 axe:— | null | 70 | ❌ | case 70 :64753-64754 → **176 泥块** |
| v_25_ebonstone_block | 424 | pick:65 axe:— | null | 25 | ❌ | case 25 :64672-64673 → **61 EbonstoneBlock**（pick 65 ✓ =:52993） |
| pixel_block | 438 | pick:0 axe:— | null | 0 | ✅ | 原创方块（无原版基线,drop:null 走 place_v_ 回收=本仓语义） |
| v_43_green_brick | 445 | pick:100 axe:— | null | 43 | ❌ | case 43 :64708-64709 → **137 GreenBrick**（pick 100 ✓ 同地牢族） |
| v_44_pink_brick | 446 | pick:100 axe:— | null | 44 | ❌ | case 44 :64711-64712 → **139 PinkBrick**（pick 100 ✓ 同地牢族） |
| v_163_purple_ice_block | 520 | pick:0 axe:— | null | 163 | ❌ | case 163 :64855-64856 → **833 PurpleIceBlock**（1457 邪冰无镐力门,pick 0 ✓） |
| v_200_red_ice_block | 521 | pick:0 axe:— | null | 200 | ❌ | case 200 :64861-64862 → **835 RedIceBlock** |
| v_116_pearlsand_block | 522 | pick:0 axe:— | null | 116 | ❌ | case 116 :64789-64790 → **408 PearlsandBlock**（1457 无镐力门） |
| v_76_hellstone_brick | 523 | pick:0 axe:— | null | 76 | ❌ | case 76 :64759-64760 → **214 HellstoneBrick** |
| v_46_silver_brick | 534 | pick:0 axe:— | null | 46 | ❌ | case 46 :64717-64718 → **143 SilverBrick** |
| v_47_copper_brick | 535 | pick:0 axe:— | null | 47 | ❌ | case 47 :64720-64721 → **145 CopperBrick** |
| v_115_hallowed_vines | 538 | pick:0 axe:— | null | 115 | ✅ | no-drop 表 :65851（垂藤族无掉落,1457 同） |
| v_121_cobalt_brick | 539 | pick:0 axe:— | null | 121 | ❌ | case 121 :64804-64805 → **415 CobaltBrick** |
| v_122_mythril_brick | 540 | pick:0 axe:— | null | 122 | ❌ | case 122 :64807-64808 → **416 MythrilBrick** |
| v_127_ice_ice_rod | 541 | pick:0 axe:— | null | 127 | ✅ | no-drop 表 :65854（冰杖冰块无掉落,1457 同） |
| v_140_demonite_brick | 545 | pick:0 axe:— | null | 140 | ❌ | case 140 :64666-64667 → **577 DemoniteBrick** |
| v_145_red_candy_cane_block | 546 | pick:0 axe:— | null | 145 | ❌ | case 145 :64819-64820 → **586 CandyCaneBlock** |
| v_146_green_candy_cane_block | 547 | pick:0 axe:— | null | 146 | ❌ | case 146 :64822-64823 → **591 GreenCandyCaneBlock** |
| v_150_adamantite_beam | 548 | pick:0 axe:— | null | 150 | ❌ | case 150 :64783-64784 → **604 AdamantiteBeam** |
| v_153_red_stucco | 549 | pick:0 axe:— | null | 153 | ❌ | case 153 :64831-64832 → **611 RedStucco** |
| v_154_yellow_stucco | 550 | pick:0 axe:— | null | 154 | ❌ | case 154 :64834-64835 → **612 YellowStucco** |
| v_155_green_stucco | 551 | pick:0 axe:— | null | 155 | ❌ | case 155 :64837-64838 → **613 GreenStucco** |
| v_156_gray_stucco | 552 | pick:0 axe:— | null | 156 | ❌ | case 156 :64840-64841 → **614 GrayStucco** |
| v_157_ebonwood | 553 | pick:0 axe:— | null | 157 | ❌ | case 157 :64612-64613 → **619 Ebonwood** |
| v_159_pearlwood | 554 | pick:0 axe:— | null | 159 | ❌ | case 159 :64618-64619 → **621 Pearlwood** |
| v_160_rainbow_brick | 555 | pick:0 axe:— | null | 160 | ❌ | case 160 :64843-64844 → **662 RainbowBrick** |
| v_164_pink_ice_block | 556 | pick:0 axe:— | null | 164 | ❌ | case 164 :64858-64859 → **834 PinkIceBlock** |
| v_170_pine_tree_block | 557 | pick:0 axe:— | null | 170 | ❌ | case 170 :64510-64511 → **1872 PineTreeBlock** |
| v_176_tungsten_brick | 559 | pick:0 axe:— | null | 176 | ❌ | case 176 :64849-64850 → **718 TungstenBrick** |
| v_180_yellow_moss_block | 561 | pick:0 axe:— | null | 180 | ❌ | 同苔藓族 :64049-64059 → **3** |
| v_188_cactus_block | 562 | pick:0 axe:— | null | 188 | ❌ | case 188 :64771-64772 → **276 Cactus**（1457 物品 276 createTile=188;本仓 fellCactus 只拦 v_80 植株形态,188 放置块挖掉无仙人掌返还） |
| v_195_flesh_block | 564 | pick:0 axe:— | null | 195 | ❌ | case 195 :64648-64649 → **763 FleshBlock** |
| v_197_frozen_slime_block | 565 | pick:0 axe:— | null | 197 | ❌ | case 197 :64660-64661 → **767 FrozenSlimeBlock** |
| v_198_asphalt_block | 566 | pick:0 axe:— | null | 198 | ❌ | case 198 :64630-64631 → **775 AsphaltBlock** |

### 分区 A 审计发现

**横切结论（适用于全部 ❌ 项）**

1. **掉落兜底语义**：本仓 breakTile 1×1 路径（Game.ts:12913-12915）对 `drop:null` 的 v_ 方块掉 `place_v_*` 回收物品（可再放置的仓内复刻品），**不是蒸发**。下表 ❌ = 原版 vid 掉落未实装（现掉 place_v_ 复刻品）。修复全部是 tiles.ts 数据改动：`drop` 填原版 vid 即可——所涉 vid 已逐一验证存在于 `public/sprites/vanilla.json` items 表（含 createTile/图集矩形 ix/iy/iw/ih）且经 items.ts:1049-1075 运行时合成注册，贴图走 Item_Atlas_* 图集，无缺图风险。
2. **pick 门槛**：1457 镐力门全表在 Player.cs `GetPickaxeDamage` :52989-53048（211:200 / 25·203:65 / 117:65 / 37:50 / 22·204:55 仅地下 / 56:55 / 58:65 / 226·237:210 / 137 styles1-4:210 / tileDungeon(41·43·44 等):100 仅地下 / 107·221:100 / 108·222:110 / 111·223:150）。分区 A 内全部 pick 值与门值一致（魔矿 55/陨石 50/狱石 65/黑曜石 55/黑曜石砖外邪块 65/钴 100/秘银 110/精金 150/地牢砖 100），银 20·金 40·宝石 30 属原创平衡且同族一致（银=钨、金=铂、六宝石同值）；黑沙/珍珠沙/三色邪冰在 1457 **无**镐力门，pick 0 正确。同族跨分区核过：crimtane 55、palladium 100、orichalcum 110、titanium 150（分区 B）与本区一致。
3. **草族种子问题（任务问询）**：1457 草**块**不掉种子——腐化草 23→泥土 2（:64668）、猩红草 199→泥土 2（:64078）、神圣草 109→泥土 2（:64077）、丛林草 60→**泥块 176**（:64987）、蘑菇草 70→泥块 176（:64753）、普通草 2→泥土 2（:64076）、灰烬草 633→灰烬块 172（:64083-64084）。种子只出自植株族（KillTile_DropItems case 61/74/703 丛林帧档、短高草 3/110/24/201/73 等），本仓 killTileDropItems（Game.ts:12332 起）已实现。荆棘（tile 24）不在分区 A 清单。

**⚠️ 偏差（2 项）**

| 方块 key | 问题 | 1457 行号 | 建议修复 |
|---|---|---|---|
| ash | drop=3（石块），1457 灰烬块掉独立物品 AshBlock=172（1.4.4+ 变更） | WorldGen.cs:64747-64748（case 57→172）；ItemID.cs:1883 `AshBlock=172` | tiles.ts ash `drop: 3 → 172` |
| thin_ice | drop=664（冰块），1457 薄冰在 no-drop 表=破坏无掉落（薄冰物品不可获得） | WorldGen.cs:65863（162 入 no-drop 组 :65803-66145） | 不能简单填 null（v_ 键 null 会走 place_v_ 兜底）——需 breakTile 1×1 路径加"真无掉落"表达（drop:-1 哨兵或 no-drop 集合门），或 drop 留 664 并登记为有意微差 |

**❌ 未实装（58 项=drop vid 未填、现走 place_v_ 兜底；修复=填 vid；另 v_137_traps 见下"结构性"）**

| 方块 key | 应掉 vid（1457） | 1457 行号 | 备注 |
|---|---|---|---|
| v_179_green_moss_block / v_180_yellow_moss_block / v_181_red_moss_block / v_182_blue_moss_block / v_183_purple_moss_block | 3（StoneBlock） | :64049-64059 | 苔藓族 7 tile（179-183/381/534/536/539/625/627）统一掉石块;苔藓物品 4349+ 另有获取链,非挖苔藓 |
| v_189_cloud_block | 751（Cloud） | :64636-64637 | |
| v_196_rain_cloud_block | 765（RainCloud） | :64657-64658 | |
| v_193_slime_block | 762（SlimeBlock） | :64654-64655 | |
| v_197_frozen_slime_block | 767（FrozenSlimeBlock） | :64660-64661 | |
| v_195_flesh_block | 763（FleshBlock） | :64648-64649 | |
| v_198_asphalt_block | 775（AsphaltBlock） | :64630-64631 | |
| v_190_glowing_mushroom_block | 183（GlowingMushroom 物品） | :64993-64994 | 掉蘑菇物品非方块 |
| v_191_living_wood_block | 9（Wood） | :64585-64586 | 生命木→木 |
| v_48_spike | 147（Spike） | :64723-64724 | 尖刺可回收 |
| v_130_active_stone_block | 511（ActiveStoneBlock） | :64867-64868 | |
| v_23_corrupt_grass_block | 2（DirtBlock） | :64668-64670 | 不掉种子 |
| v_199_crimson_grass_block | 2（DirtBlock） | :64078-64081 | 不掉种子 |
| v_109_hallowed_grass_block | 2（DirtBlock） | :64077-64081 | |
| v_60_jungle_grass_block | 176（MudBlock） | :64987-64991 | 丛林草掉泥 |
| v_70_mushroom_grass_block | 176（MudBlock） | :64753-64754 | 蘑菇草掉泥 |
| v_25_ebonstone_block | 61（EbonstoneBlock） | :64672-64673 | pick 65 已对 |
| v_112_ebonsand_block | 370（EbonsandBlock） | :64786-64787 | |
| v_116_pearlsand_block | 408（PearlsandBlock） | :64789-64790 | |
| v_117_pearlstone_block | 409（PearlstoneBlock） | :64792-64793 | pick 65 已对 |
| v_163_purple_ice_block | 833（PurpleIceBlock） | :64855-64856 | |
| v_164_pink_ice_block | 834（PinkIceBlock） | :64858-64859 | |
| v_200_red_ice_block | 835（RedIceBlock） | :64861-64862 | |
| v_41_blue_brick | 134（BlueBrick） | :64705-64706 | pick 100 已对 |
| v_43_green_brick | 137（GreenBrick） | :64708-64709 | pick 100 已对 |
| v_44_pink_brick | 139（PinkBrick） | :64711-64712 | pick 100 已对 |
| v_45_gold_brick | 141（GoldBrick） | :64714-64715 | |
| v_46_silver_brick | 143（SilverBrick） | :64717-64718 | |
| v_47_copper_brick | 145（CopperBrick） | :64720-64721 | |
| v_75_obsidian_brick | 192（ObsidianBrick） | :64756-64757 | |
| v_76_hellstone_brick | 214（HellstoneBrick） | :64759-64760 | |
| v_118_pearlstone_brick | 412（PearlstoneBrick） | :64795-64796 | |
| v_119_iridescent_brick | 413（IridescentBrick） | :64798-64799 | |
| v_120_mudstone_brick | 414（MudstoneBrick） | :64801-64802 | |
| v_121_cobalt_brick | 415（CobaltBrick） | :64804-64805 | |
| v_122_mythril_brick | 416（MythrilBrick） | :64807-64808 | |
| v_140_demonite_brick | 577（DemoniteBrick） | :64666-64667 | |
| v_145_red_candy_cane_block | 586（CandyCaneBlock） | :64819-64820 | |
| v_146_green_candy_cane_block | 591（GreenCandyCaneBlock） | :64822-64823 | |
| v_150_adamantite_beam | 604（AdamantiteBeam） | :64783-64784 | |
| v_151_sandstone_brick | 607（SandstoneBrick） | :64738-64739 | |
| v_152_ebonstone_brick | 609（EbonstoneBrick） | :64741-64742 | |
| v_153_red_stucco / v_154_yellow_stucco / v_155_green_stucco / v_156_gray_stucco | 611 / 612 / 613 / 614 | :64831 / :64834 / :64837 / :64840 | 灰泥四色 |
| v_157_ebonwood | 619（Ebonwood） | :64612-64613 | |
| v_158_rich_mahogany | 620（RichMahogany） | :64615-64616 | |
| v_159_pearlwood | 621（Pearlwood） | :64618-64619 | |
| v_160_rainbow_brick | 662（RainbowBrick） | :64843-64844 | |
| v_170_pine_tree_block | 1872（PineTreeBlock） | :64510-64511 | |
| v_175_tin_brick | 717（TinBrick） | :64846-64847 | |
| v_176_tungsten_brick | 718（TungstenBrick） | :64849-64850 | |
| v_188_cactus_block | 276（Cactus） | :64771-64772 | 1457 物品 276 createTile=188;fellCactus（Game.ts:13326）只处理 v_80 植株,放置形态需补 |

**❌ 结构性 1 项（非填 vid 可解）**

| 方块 key | 问题 | 1457 行号 | 建议修复 |
|---|---|---|---|
| v_137_traps | ①掉落按 `frameY/18` 分 6 档：0→539 DartTrap / 1→1146 SuperDart / 2→1147 Flame / 3→1148 SpikyBall / 4→1149 Spear / 5→5135 VenomDart；本仓恒 null。②镐力门只在 styles 1-4 生效（需 210=Picksaw 档），style 0/5 任意镐可挖；本仓 pick:0 无分档 | WorldGen.cs:65597-65619（掉落档）;Player.cs:53025-53031（镐力门） | tiles.ts 维持 pick:0（style 0 主档），在 breakTile 陷阱分支按 frameY/18 查表掉 vid;若仓内已实现超枪/火焰陷阱 style 再补 pick 门 |

**✅ 机制注记（2 项，无需改动）**

- door_closed（tile 10）：GetItemDrops 对门无掉落（:65803 no-drop 表），门物经 TileFrame→CheckDoorClosed :87253→DropDoorItem :69466→GetDoorItem :69257（style 0=25）返还。本仓 drop:25 端到端等价（style>0 门 vid 未分款,登记不修）。
- v_138_boulder / v_115_hallowed_vines / v_127_ice_ice_rod / v_192_living_leaf_block：四者与 1457 同属 no-drop 表（:65803-66145）,drop:null 语义一致（注:本仓 v_ 键 null 会走 place_v_ 兜底,与原版"真无掉落"仍有微差,同 thin_ice 一并登记）。

**分区 A 总结**：确认正确 41 项（✅,含 door_closed 机制等价与 pixel_block 原创块）/ 偏差 2 项（⚠️:ash 掉落值 3→172、thin_ice 应无掉落）/ 未实装 59 项（❌:58 项 drop vid 未填现走 place_v_ 兜底 + v_137_traps 帧档掉落/pick 分档）;📋 0 项。掉落贴图维度全绿：所涉全部 vid 已验证存在于 vanilla.json items 表+Item_Atlas 图集（本仓无单体 Item_N.png,物品图标全走图集矩形）。pick 维度全绿：与 Player.cs :52989-53048 镐力门全表一致或属同族一致的原创平衡。

### 分区 B（421 项）

建材方块（sheet>200 为主：砖/玻璃/陶瓦/神庙/地牢/雪原建材…）。对账点 = drop vid(多数=放置物自身 vid)+pick 门槛。

| 方块 | tiles.ts 行 | 挖掘条件(pick/axe) | 掉落(vid) | 贴图 sheet | 确认 | 1457 基线行 |
|---|---|---|---|---|---|---|
| ore_crimtane | 89 | pick:55 axe:— | 880 | 204 | ✅ | case 204 :64591 |
| ore_palladium | 93 | pick:100 axe:— | 1104 | 221 | ✅ | case 221 :64567 |
| ore_orichalcum | 94 | pick:110 axe:— | 1105 | 222 | ✅ | case 222 :64570 |
| ore_titanium | 95 | pick:150 axe:— | 1106 | 223 | ✅ | case 223 :64573 |
| ore_chlorophyte | 96 | pick:200 axe:— | 947 | 211 | ✅ | case 211 :64522 |
| ice_brick | 109 | pick:0 axe:— | 883 | 206 | ✅ | case 206 :64624 |
| sandstone | 113 | pick:0 axe:— | 3271 | 396 | ✅ | case 396 :64461 |
| hardened_sand | 114 | pick:0 axe:— | 3272 | 397 | ✅ | case 397 :64473 |
| desert_fossil | 115 | pick:0 axe:— | 3347 | 404 | ✅ | case 404 :64485 |
| v_463_defenders_forge | 155 | pick:0 axe:— | MISSING | 463 | 📋 | no-drop 表 :65803-66145 |
| v_368_granite_block | 175 | pick:0 axe:— | null | 368 | ❌ | case 368 :64159 |
| v_226_lihzahrd_brick | 176 | pick:210 axe:— | null | 226 | ❌ | case 226 :64543 |
| v_367_marble_block | 177 | pick:0 axe:— | null | 367 | ❌ | case 367 :64165 |
| v_633_ash_grass_block | 178 | pick:0 axe:— | null | 633 | ❌ | case 633 :64084 |
| v_536_xenon_moss_block | 182 | pick:0 axe:— | null | 536 | ❌ | case 536 :64060 |
| v_225_hive_block | 183 | pick:0 axe:— | null | 225 | ❌ | :65521-65543 case 225 |
| v_483_cracked_pink_brick | 184 | pick:0 axe:— | null | 483 | ⚠️ | Main.cs:7941-7946 tileDungeon 不含 481-483 |
| v_224_slush_block | 185 | pick:0 axe:— | null | 224 | ❌ | case 224 :64546 |
| v_383_living_mahogany_block | 186 | pick:0 axe:— | null | 383 | ❌ | case 383 :64189 |
| v_384_living_mahogany_leaves_block | 188 | pick:0 axe:— | null | 384 | 📋 | no-drop 表 :65803-66145 |
| v_273_stone_slab | 189 | pick:0 axe:— | null | 273 | ❌ | case 273 :64324 |
| v_381_lava_moss | 190 | pick:0 axe:— | null | 381 | ❌ | case 381 :64060 |
| v_321_boreal_wood | 198 | pick:0 axe:— | null | 321 | ❌ | case 321 :64873 |
| v_357_smooth_marble_block | 201 | pick:0 axe:— | null | 357 | ❌ | case 357 :64180 |
| v_272_cog_block | 202 | pick:0 axe:— | null | 272 | ❌ | case 272 :64321 |
| v_229_honey_block | 203 | pick:0 axe:— | null | 229 | ❌ | case 229 :64561 |
| v_311_dynasty_wood | 204 | pick:0 axe:— | null | 311 | ❌ | case 311 :64552 |
| v_350_martian_conduit_plating | 208 | pick:0 axe:— | null | 350 | ❌ | case 350 :64378 |
| v_369_smooth_granite_block | 209 | pick:0 axe:— | null | 369 | ❌ | case 369 :64162 |
| v_232_wooden_spike | 213 | pick:0 axe:— | null | 232 | ❌ | case 232 :64627 |
| v_274_sandstone_slab | 214 | pick:0 axe:— | null | 274 | ❌ | case 274 :64327 |
| v_322_palm_wood | 215 | pick:0 axe:— | null | 322 | ❌ | case 322 :64876 |
| v_312_red_dynasty_shingles | 217 | pick:0 axe:— | null | 312 | ❌ | case 312 :64555 |
| v_422_conveyor_belt_ccw | 218 | pick:0 axe:— | null | 422 | ❌ | case 422 :64306 |
| v_495_shell_pile_block | 219 | pick:0 axe:— | null | 495 | ❌ | case 495 :64366 |
| v_479_smooth_sandstone_block | 220 | pick:0 axe:— | null | 479 | ❌ | case 479 :64360 |
| v_477_mowed_grass_block | 222 | pick:0 axe:— | null | 477 | ❌ | case 477 :64081 |
| v_230_crispy_honey_block | 224 | pick:0 axe:— | null | 230 | ❌ | case 230 :64564 |
| v_562_bamboo_block | 225 | pick:0 axe:— | null | 562 | ❌ | case 562 :64436 |
| v_371_pink_slime_block | 226 | pick:0 axe:— | null | 371 | ❌ | case 371 :64687 |
| v_668_the_dirtiest_block | 227 | pick:0 axe:— | null | 668 | ❌ | case 668 :64041 |
| v_398_corrupt_hardened_sand_block | 228 | pick:0 axe:— | null | 398 | ❌ | case 398 :64476 |
| v_379_bubble | 229 | pick:0 axe:— | null | 379 | ❌ | case 379 :64168 |
| v_618_stone_accent_slab | 230 | pick:0 axe:— | null | 618 | ❌ | case 618 :64330 |
| v_314_minecart_track | 235 | pick:0 axe:— | null | 314 | ✅ | :64633 →Minecart.GetTrackItem |
| v_373_water_drip | 237 | pick:0 axe:— | null | 373 | 📋 | no-drop 表 :65803-66145 |
| v_484_rolling_cactus | 239 | pick:0 axe:— | null | 484 | ✅ | :48768-48769 →弹727 无物品 |
| v_374_lava_drip | 240 | pick:0 axe:— | null | 374 | 📋 | no-drop 表 :65803-66145 |
| v_233_jungle_large_plants | 241 | pick:0 axe:— | null | 233 | ✅ | no-drop 表+无 Check 返还 |
| v_461_sand_drip | 244 | pick:0 axe:— | null | 461 | 📋 | no-drop 表 :65803-66145 |
| v_485_antlion_larva | 246 | pick:0 axe:— | null | 485 | ✅ | no-drop 表+tileCut |
| v_637_ash_short_plants | 247 | pick:0 axe:— | null | 637 | ❌ | :65025-65030 case 637 |
| v_444_bee_hive | 248 | pick:0 axe:— | null | 444 | ✅ | no-drop 表+tileCut |
| v_240_wall_hangings_3x3 | 249 | pick:0 axe:— | null | 240 | ❌ | Check3x3 :44381+（101 档） |
| v_519_cattails | 250 | pick:0 axe:— | null | 519 | ❌ | :65051-65056 case 519 |
| v_634_ash_tree | 252 | pick:-1 axe:0 | null | 634 | ✅ | :65265-65281 →GetTreeDrops |
| v_323_palm_trees | 256 | pick:-1 axe:0 | null | 323 | ✅ | :65283-65317 case 323 |
| v_242_paintings_6x4 | 259 | pick:0 axe:— | null | 242 | ❌ | Check6x4Wall 逐 style（75 档） |
| v_549_seaweed | 262 | pick:0 axe:— | null | 549 | ✅ | no-drop 表+tileCut |
| v_254_pumpkin_plant | 263 | pick:0 axe:— | null | 254 | 📋 | no-drop 表 :65803-66145 |
| v_571_bamboo | 264 | pick:0 axe:— | null | 571 | ❌ | case 571 :64439 |
| v_246_paintings_3x2 | 265 | pick:0 axe:— | null | 246 | ❌ | Check3x2Wall 逐 style（37 档） |
| v_245_paintings_2x3 | 266 | pick:0 axe:— | null | 245 | ❌ | Check2x3Wall 逐 style（29 档） |
| v_586_emerald_tree | 267 | pick:-1 axe:0 | null | 586 | ✅ | :65775 SetGemTreeDrops |
| v_596_vanity_tree_sakura | 268 | pick:-1 axe:0 | null | 596 | ✅ | :65265-65281 →GetTreeDrops |
| v_443_geyser | 270 | pick:0 axe:— | null | 443 | 📋 | no-drop 表 :65803-66145 |
| v_589_amber_tree | 271 | pick:-1 axe:0 | null | 589 | ✅ | :65754 SetGemTreeDrops |
| v_411_detonator | 272 | pick:0 axe:— | null | 411 | 📋 | no-drop 表 :65803-66145 |
| v_518_lily_pads | 273 | pick:0 axe:— | null | 518 | ✅ | no-drop 表+tileCut |
| v_588_diamond_tree | 274 | pick:-1 axe:0 | null | 588 | ✅ | :65796 SetGemTreeDrops |
| v_585_sapphire_tree | 275 | pick:-1 axe:0 | null | 585 | ✅ | :65782 SetGemTreeDrops |
| v_583_topaz_tree | 276 | pick:-1 axe:0 | null | 583 | ✅ | :65768 SetGemTreeDrops |
| v_530_oasis_plants | 278 | pick:0 axe:— | null | 530 | ✅ | no-drop 表+无 Check 返还 |
| v_616_vanity_tree_yellow_willow | 279 | pick:-1 axe:0 | null | 616 | ✅ | :65265-65281 →GetTreeDrops |
| v_215_campfires | 280 | pick:0 axe:— | null | 215 | ❌ | GetCampfireItemDrop :50054-50075（16 档） |
| v_597_pylons | 282 | pick:0 axe:— | null | 597 | ✅ | TEFraming_CheckTile :86379 逐 style |
| v_592_hanging_brazier | 283 | pick:0 axe:— | null | 592 | 📋 | no-drop 表 :65803-66145 |
| v_375_honey_drip | 284 | pick:0 axe:— | null | 375 | 📋 | no-drop 表 :65803-66145 |
| v_227_dye_plants | 285 | pick:0 axe:— | null | 227 | ⚠️ | case 227 :65098-65105 |
| v_584_amethyst_tree | 286 | pick:-1 axe:0 | null | 584 | ✅ | :65761 SetGemTreeDrops |
| v_231_larva | 287 | pick:0 axe:— | null | 231 | ✅ | :53254-53280 case 231（无掉落+召蜂后） |
| v_395_item_frame | 288 | pick:0 axe:— | MISSING | 395 | 📋 | no-drop 表 :65803-66145 |
| v_241_catacombs | 289 | pick:0 axe:— | null | 241 | ❌ | Check4x3Wall 逐 style |
| v_587_ruby_tree | 290 | pick:-1 axe:0 | null | 587 | ✅ | :65789 SetGemTreeDrops |
| v_470_mannequins | 293 | pick:0 axe:— | MISSING | 470 | ❌ | TEDisplayDoll.Framing_CheckTile :86373（2 档） |
| v_324_seashells | 294 | pick:0 axe:— | null | 324 | ❌ | :65328-65346 case 324 |
| v_355_alchemy_table | 297 | pick:0 axe:— | null | 355 | 📋 | no-drop 表 :65803-66145 |
| v_354_bewitching_table | 298 | pick:0 axe:— | null | 354 | 📋 | no-drop 表 :65803-66145 |
| v_529_sea_oats | 300 | pick:0 axe:— | null | 529 | ✅ | no-drop 表+无 Check 返还 |
| v_506_bast_statue | 301 | pick:0 axe:— | null | 506 | 📋 | no-drop 表 :65803-66145 |
| v_349_mushroom_statue | 302 | pick:0 axe:— | null | 349 | 📋 | no-drop 表 :65803-66145 |
| v_377_sharpening_station | 303 | pick:0 axe:— | null | 377 | 📋 | no-drop 表 :65803-66145 |
| v_613_potted_lava_plants | 304 | pick:0 axe:— | null | 613 | 📋 | no-drop 表 :65803-66145 |
| v_219_extractinator | 305 | pick:0 axe:— | null | 219 | 📋 | no-drop 表 :65803-66145 |
| v_388_tall_gate_closed | 306 | pick:0 axe:— | null | 388 | 📋 | no-drop 表 :65803-66145 |
| v_389_tall_gate_open | 307 | pick:0 axe:— | null | 389 | ❌ | :51683-51736 CheckTallGate |
| v_466_elder_cystal_stand | 309 | pick:0 axe:— | null | 466 | 📋 | no-drop 表 :65803-66145 |
| v_220_solidifier | 310 | pick:0 axe:— | null | 220 | 📋 | no-drop 表 :65803-66145 |
| v_303_lihzahrd_furnace | 311 | pick:0 axe:— | null | 303 | 📋 | no-drop 表 :65803-66145 |
| v_304_living_loom | 313 | pick:0 axe:— | null | 304 | 📋 | no-drop 表 :65803-66145 |
| v_488_fallen_log | 314 | pick:-1 axe:0 | null | 488 | ✅ | :49561 Check3x2 木9×Next(10,21) |
| v_548_potted_trees_group_2 | 315 | pick:0 axe:— | null | 548 | ❌ | Check3x6 :53361-53365（9 档） |
| v_614_potted_ember_tendrils | 316 | pick:0 axe:— | null | 614 | 📋 | no-drop 表 :65803-66145 |
| v_598_lava_serpent_bowl | 317 | pick:0 axe:— | null | 598 | 📋 | no-drop 表 :65803-66145 |
| v_406_chimney | 318 | pick:0 axe:— | null | 406 | 📋 | no-drop 表 :65803-66145 |
| v_305_sky_mill | 319 | pick:0 axe:— | null | 305 | 📋 | no-drop 表 :65803-66145 |
| v_300_bone_welder | 320 | pick:0 axe:— | null | 300 | 📋 | no-drop 表 :65803-66145 |
| v_302_glass_kiln | 321 | pick:0 axe:— | null | 302 | 📋 | no-drop 表 :65803-66145 |
| v_306_ice_machine | 322 | pick:0 axe:— | null | 306 | 📋 | no-drop 表 :65803-66145 |
| v_247_autohammer | 323 | pick:0 axe:— | null | 247 | 📋 | no-drop 表 :65803-66145 |
| v_491_void_vault | 324 | pick:0 axe:— | MISSING | 491 | 📋 | no-drop 表 :65803-66145 |
| v_642_chlorophyte_extractinator | 326 | pick:0 axe:— | null | 642 | 📋 | no-drop 表 :65803-66145 |
| v_319_ship_in_a_bottle | 327 | pick:0 axe:— | null | 319 | 📋 | no-drop 表 :65803-66145 |
| v_320_seaweed_planter | 330 | pick:0 axe:— | null | 320 | 📋 | no-drop 表 :65803-66145 |
| v_378_target_dummy | 332 | pick:0 axe:— | null | 378 | 📋 | no-drop 表 :65803-66145 |
| v_218_meat_grinder | 333 | pick:0 axe:— | null | 218 | 📋 | no-drop 表 :65803-66145 |
| v_356_enchanted_sundial | 334 | pick:0 axe:— | null | 356 | 📋 | no-drop 表 :65803-66145 |
| v_237_lihzahrd_altar | 336 | pick:210 axe:— | null | 237 | 📋 | no-drop 表 :65803-66145 |
| v_621_slice_of_cake | 338 | pick:0 axe:— | null | 621 | 📋 | no-drop 表 :65803-66145 |
| v_387_trap_door_closed | 339 | pick:0 axe:— | null | 387 | 📋 | no-drop 表 :65803-66145 |
| v_316_blue_jellyfish_jar | 340 | pick:0 axe:— | null | 316 | 📋 | no-drop 表 :65803-66145 |
| v_287_ammo_box | 342 | pick:0 axe:— | null | 287 | 📋 | no-drop 表 :65803-66145 |
| v_294_zebra_swallowtail_butterfly_jar | 343 | pick:0 axe:— | null | 294 | 📋 | no-drop 表 :65803-66145 |
| v_291_ulysses_butterfly_jar | 344 | pick:0 axe:— | null | 291 | 📋 | no-drop 表 :65803-66145 |
| v_292_sulphur_butterfly_jar | 345 | pick:0 axe:— | null | 292 | 📋 | no-drop 表 :65803-66145 |
| v_289_purple_emperor_butterfly_jar | 346 | pick:0 axe:— | null | 289 | 📋 | no-drop 表 :65803-66145 |
| v_656_glow_tulip | 348 | pick:0 axe:— | null | 656 | ❌ | case 656 :64504 |
| v_235_teleporter | 350 | pick:0 axe:— | null | 235 | 📋 | no-drop 表 :65803-66145 |
| v_567_garden_gnome | 351 | pick:0 axe:— | null | 567 | 📋 | no-drop 表 :65803-66145 |
| v_625_neon_moss_block | 378 | pick:0 axe:— | null | 625 | ❌ | case 625 :64060 |
| v_234_crimsand_block | 380 | pick:0 axe:— | null | 234 | ❌ | case 234 :64540 |
| v_205_crimson_vines | 382 | pick:0 axe:— | null | 205 | ✅ | no-drop 表+tileCut |
| v_399_crimson_hardened_sand_block | 384 | pick:0 axe:— | null | 399 | ❌ | case 399 :64479 |
| v_352_crimtane_thorns | 385 | pick:0 axe:— | null | 352 | ✅ | no-drop 表+tileCut |
| v_248_palladium_column | 386 | pick:0 axe:— | null | 248 | ❌ | case 248 :64576 |
| v_340_living_cursed_fire_block | 387 | pick:0 axe:— | null | 340 | ❌ | case 340 :64384 |
| v_207_water_fountains | 388 | pick:0 axe:— | null | 207 | ✅ | :38199-38226 逐 style |
| v_475_hat_rack | 390 | pick:0 axe:— | MISSING | 475 | 📋 | no-drop 表 :65803-66145 |
| v_539_argon_moss_block | 395 | pick:0 axe:— | null | 539 | ❌ | case 539 :64060 |
| v_481_cracked_blue_brick | 396 | pick:0 axe:— | null | 481 | ⚠️ | Main.cs:7941-7946 tileDungeon 不含 481-483 |
| v_714_spider_boulder | 399 | pick:0 axe:— | null | 714 | ✅ | :48789-48790 →1054 |
| v_752_chillet_egg | 400 | pick:0 axe:— | null | 752 | ✅ | x |
| v_751_sleeping_digtoise | 401 | pick:0 axe:— | null | 751 | ✅ | no-drop 表 :65803-66145 |
| v_753_gianttiki | 408 | pick:0 axe:— | 6147 | 753 | 📋 | switch :64038-66145 无 case 753 |
| v_664_bouncy_boulder | 409 | pick:0 axe:— | null | 664 | ✅ | :48774-48775 →1013 |
| v_711_rainbow_boulder | 410 | pick:0 axe:— | null | 711 | ✅ | :48777-48778 →1047 |
| v_715_ghoulder | 411 | pick:0 axe:— | null | 715 | ✅ | :48792-48793 →1055 |
| v_716_friendly_boulder | 412 | pick:0 axe:— | null | 716 | ✅ | :48795-48796 →1057 |
| v_713_lava_boulder | 413 | pick:0 axe:— | null | 713 | ✅ | :48786-48787 →1053 |
| v_202_sunplate_block | 425 | pick:0 axe:— | null | 202 | ❌ | case 202 :64537 |
| v_203_crimstone_block | 447 | pick:65 axe:— | null | 203 | ❌ | case 203 :64588 |
| v_255_amethystgemsparkoff | 467 | pick:0 axe:— | null | 255 | ❌ | case 255-268 :64970-64985 |
| v_256_topazgemsparkoff | 468 | pick:0 axe:— | null | 256 | ❌ | case 255-268 :64970-64985 |
| v_257_sapphiregemsparkoff | 469 | pick:0 axe:— | null | 257 | ❌ | case 255-268 :64970-64985 |
| v_258_emeraldgemsparkoff | 470 | pick:0 axe:— | null | 258 | ❌ | case 255-268 :64970-64985 |
| v_259_rubygemsparkoff | 471 | pick:0 axe:— | null | 259 | ❌ | case 255-268 :64970-64985 |
| v_260_diamondgemsparkoff | 472 | pick:0 axe:— | null | 260 | ❌ | case 255-268 :64970-64985 |
| v_261_ambergemsparkoff | 473 | pick:0 axe:— | null | 261 | ❌ | case 255-268 :64970-64985 |
| v_262_amethystgemspark | 474 | pick:0 axe:— | null | 262 | ❌ | case 255-268 :64970-64985 |
| v_263_topazgemspark | 475 | pick:0 axe:— | null | 263 | ❌ | case 255-268 :64970-64985 |
| v_264_sapphiregemspark | 476 | pick:0 axe:— | null | 264 | ❌ | case 255-268 :64970-64985 |
| v_265_emeraldgemspark | 477 | pick:0 axe:— | null | 265 | ❌ | case 255-268 :64970-64985 |
| v_266_rubygemspark | 478 | pick:0 axe:— | null | 266 | ❌ | case 255-268 :64970-64985 |
| v_267_diamondgemspark | 479 | pick:0 axe:— | null | 267 | ❌ | case 255-268 :64970-64985 |
| v_268_ambergemspark | 480 | pick:0 axe:— | null | 268 | ❌ | case 255-268 :64970-64985 |
| v_421_conveyorbeltleft | 494 | pick:0 axe:— | null | 421 | ❌ | case 421 :64303 |
| v_476_golfhole | 507 | pick:0 axe:— | null | 476 | ❌ | case 476 :65485 |
| v_546_grate | 512 | pick:0 axe:— | null | 546 | ❌ | case 546 :64415 |
| v_557_grateclosed | 513 | pick:0 axe:— | null | 557 | ❌ | case 557 :64415 |
| v_482_cracked_green_brick | 519 | pick:0 axe:— | null | 482 | ⚠️ | Main.cs:7941-7946 tileDungeon 不含 481-483 |
| v_301_flesh_cloning_vat | 527 | pick:0 axe:— | null | 301 | 📋 | no-drop 表 :65803-66145 |
| v_307_steampunk_boiler | 528 | pick:0 axe:— | null | 307 | 📋 | no-drop 表 :65803-66145 |
| v_308_honey_dispenser | 529 | pick:0 axe:— | null | 308 | 📋 | no-drop 表 :65803-66145 |
| v_499_decay_chamber | 530 | pick:0 axe:— | null | 499 | 📋 | no-drop 表 :65803-66145 |
| v_208_shadewood | 567 | pick:0 axe:— | null | 208 | ❌ | case 208 :64678 |
| v_217_blend_o_matic | 568 | pick:0 axe:— | null | 217 | 📋 | no-drop 表 :65803-66145 |
| v_228_dye_vat | 569 | pick:0 axe:— | null | 228 | 📋 | no-drop 表 :65803-66145 |
| v_236_life_fruit_plant | 570 | pick:0 axe:— | null | 236 | ✅ | :48013-48036 →1291 |
| v_238_plantera_s_bulb | 571 | pick:0 axe:— | null | 238 | ✅ | :48017-48030 召世花 |
| v_243_imbuing_station | 573 | pick:0 axe:— | null | 243 | 📋 | no-drop 表 :65803-66145 |
| v_249_bubblegum_block | 574 | pick:0 axe:— | null | 249 | ❌ | case 249 :64579 |
| v_250_titanstone_block | 575 | pick:0 axe:— | null | 250 | ❌ | case 250 :64582 |
| v_251_pumpkin_block | 576 | pick:0 axe:— | null | 251 | ❌ | case 251 :64446 |
| v_252_hay_block | 577 | pick:0 axe:— | null | 252 | ❌ | case 252 :64449 |
| v_253_spooky_wood | 578 | pick:0 axe:— | null | 253 | ❌ | case 253 :64452 |
| v_269_womannequin_legacy | 579 | pick:0 axe:— | null | 269 | 📋 | no-drop 表 :65803-66145 |
| v_270_firefly_in_a_bottle | 580 | pick:0 axe:— | null | 270 | 📋 | no-drop 表 :65803-66145 |
| v_271_lightning_bug_in_a_bottle | 581 | pick:0 axe:— | null | 271 | 📋 | no-drop 表 :65803-66145 |
| v_282_fish_bowl | 589 | pick:0 axe:— | null | 282 | 📋 | no-drop 表 :65803-66145 |
| v_283_heavy_work_bench | 590 | pick:0 axe:— | null | 283 | 📋 | no-drop 表 :65803-66145 |
| v_284_copper_plating | 591 | pick:0 axe:— | null | 284 | ❌ | case 284 :64513 |
| v_288_monarch_butterfly_jar | 594 | pick:0 axe:— | null | 288 | 📋 | no-drop 表 :65803-66145 |
| v_290_red_admiral_butterfly_jar | 595 | pick:0 axe:— | null | 290 | 📋 | no-drop 表 :65803-66145 |
| v_293_tree_nymph_butterfly_jar | 596 | pick:0 axe:— | null | 293 | 📋 | no-drop 表 :65803-66145 |
| v_295_julia_butterfly_jar | 597 | pick:0 axe:— | null | 295 | 📋 | no-drop 表 :65803-66145 |
| v_313_blue_dynasty_shingles | 604 | pick:0 axe:— | null | 313 | ❌ | case 313 :64558 |
| v_315_coralstone_block | 605 | pick:0 axe:— | null | 315 | ❌ | case 315 :64192 |
| v_317_green_jellyfish_jar | 606 | pick:0 axe:— | null | 317 | 📋 | no-drop 表 :65803-66145 |
| v_318_pink_jellyfish_jar | 607 | pick:0 axe:— | null | 318 | 📋 | no-drop 表 :65803-66145 |
| v_325_tin_plating | 608 | pick:0 axe:— | null | 325 | ❌ | case 325 :64455 |
| v_326_waterfall_block | 609 | pick:0 axe:— | null | 326 | ❌ | case 326 :64885 |
| v_327_lavafall_block | 610 | pick:0 axe:— | null | 327 | ❌ | case 327 :64888 |
| v_328_confetti_block | 611 | pick:0 axe:— | null | 328 | ❌ | case 328 :64903 |
| v_329_midnight_confetti_block | 612 | pick:0 axe:— | null | 329 | ❌ | case 329 :64906 |
| v_334_weapon_rack_legacy_do_not_use | 615 | pick:0 axe:— | null | 334 | ❌ | CheckWeaponsRack :46406-46465 |
| v_336_living_fire_block | 616 | pick:0 axe:— | null | 336 | ❌ | case 336 :64381 |
| v_337_text_statue | 617 | pick:0 axe:— | null | 337 | 📋 | no-drop 表 :65803-66145 |
| v_341_living_demon_fire_block | 619 | pick:0 axe:— | null | 341 | ❌ | case 341 :64387 |
| v_342_living_frost_fire_block | 620 | pick:0 axe:— | null | 342 | ❌ | case 342 :64390 |
| v_343_living_ichor_fire_block | 621 | pick:0 axe:— | null | 343 | ❌ | case 343 :64393 |
| v_344_living_ultrabright_fire_block | 622 | pick:0 axe:— | null | 344 | ❌ | case 344 :64396 |
| v_345_honeyfall_block | 623 | pick:0 axe:— | null | 345 | ❌ | case 345 :64897 |
| v_346_chlorophyte_brick | 624 | pick:0 axe:— | null | 346 | ❌ | case 346 :64369 |
| v_347_crimtane_brick | 625 | pick:0 axe:— | null | 347 | ❌ | case 347 :64372 |
| v_348_shroomite_plating | 626 | pick:0 axe:— | null | 348 | ❌ | case 348 :64375 |
| v_351_smoke_block | 627 | pick:0 axe:— | null | 351 | ❌ | case 351 :64399 |
| v_360_gold_butterfly_cage | 630 | pick:0 axe:— | null | 360 | 📋 | no-drop 表 :65803-66145 |
| v_370_meteorite_brick | 639 | pick:0 axe:— | null | 370 | ❌ | case 370 :64458 |
| v_385_crystal_block | 640 | pick:0 axe:— | null | 385 | ❌ | case 385 :64813 |
| v_390_lava_lamp | 641 | pick:0 axe:— | null | 390 | 📋 | no-drop 表 :65803-66145 |
| v_400_corrupt_sandstone_block | 646 | pick:0 axe:— | null | 400 | ❌ | case 400 :64464 |
| v_401_crimson_sandstone_block | 647 | pick:0 axe:— | null | 401 | ❌ | case 401 :64467 |
| v_402_hallow_hardened_sand_block | 648 | pick:0 axe:— | null | 402 | ❌ | case 402 :64482 |
| v_403_hallow_sandstone_block | 649 | pick:0 axe:— | null | 403 | ❌ | case 403 :64470 |
| v_407_sturdy_fossil_block | 650 | pick:0 axe:— | null | 407 | ❌ | case 407 :64488 |
| v_408_luminite_ore | 651 | pick:0 axe:— | null | 408 | ❌ | case 408 :64210 |
| v_409_luminite_brick | 652 | pick:0 axe:— | null | 409 | ❌ | case 409 :64213 |
| v_412_lunar_crafting_station | 653 | pick:0 axe:— | null | 412 | 📋 | no-drop 表 :65803-66145 |
| v_415_solar_fragment_block | 656 | pick:0 axe:— | null | 415 | ❌ | case 415 :64291 |
| v_416_vortex_fragment_block | 657 | pick:0 axe:— | null | 416 | ❌ | case 416 :64294 |
| v_417_nebula_fragment_block | 658 | pick:0 axe:— | null | 417 | ❌ | case 417 :64297 |
| v_418_stardust_fragment_block | 659 | pick:0 axe:— | null | 418 | ❌ | case 418 :64300 |
| v_426_red_team_block | 660 | pick:0 axe:— | null | 426 | ❌ | case 426 :64087 |
| v_430_green_team_block | 662 | pick:0 axe:— | null | 430 | ❌ | case 430 :64090 |
| v_431_blue_team_block | 663 | pick:0 axe:— | null | 431 | ❌ | case 431 :64093 |
| v_432_yellow_team_block | 664 | pick:0 axe:— | null | 432 | ❌ | case 432 :64096 |
| v_433_pink_team_block | 665 | pick:0 axe:— | null | 433 | ❌ | case 433 :64099 |
| v_434_white_team_block | 666 | pick:0 axe:— | null | 434 | ❌ | case 434 :64102 |
| v_446_silly_pink_balloon_block | 672 | pick:0 axe:— | null | 446 | ❌ | case 446 :64141 |
| v_447_silly_purple_balloon_block | 673 | pick:0 axe:— | null | 447 | ❌ | case 447 :64144 |
| v_448_silly_green_balloon_block | 674 | pick:0 axe:— | null | 448 | ❌ | case 448 :64147 |
| v_449_blue_streamer | 675 | pick:0 axe:— | null | 449 | ❌ | case 449 :64150 |
| v_450_green_streamer | 676 | pick:0 axe:— | null | 450 | ❌ | case 450 :64153 |
| v_451_pink_streamer | 677 | pick:0 axe:— | null | 451 | ❌ | case 451 :64156 |
| v_453_silly_tied_balloon | 678 | pick:0 axe:— | null | 453 | 📋 | no-drop 表 :65803-66145 |
| v_454_pigronata | 679 | pick:0 axe:— | null | 454 | 📋 | no-drop 表 :65803-66145 |
| v_456_silly_tied_bundle_of_balloons | 680 | pick:0 axe:— | null | 456 | 📋 | no-drop 表 :65803-66145 |
| v_457_party_presents | 681 | pick:0 axe:— | null | 457 | 📋 | no-drop 表 :65803-66145 |
| v_458_sandfall_block | 682 | pick:0 axe:— | null | 458 | ❌ | case 458 :64891 |
| v_459_snowfall_block | 683 | pick:0 axe:— | null | 459 | ❌ | case 459 :64894 |
| v_460_snow_cloud_block | 684 | pick:0 axe:— | null | 460 | ❌ | case 460 :64333 |
| v_462_desert_spirit_lamp | 685 | pick:0 axe:— | null | 462 | 📋 | no-drop 表 :65803-66145 |
| v_464_war_table | 686 | pick:0 axe:— | null | 464 | 📋 | no-drop 表 :65803-66145 |
| v_465_war_table_banner | 687 | pick:0 axe:— | null | 465 | 📋 | no-drop 表 :65803-66145 |
| v_471_weapon_rack | 688 | pick:0 axe:— | MISSING | 471 | 📋 | no-drop 表 :65803-66145 |
| v_472_iron_brick | 689 | pick:0 axe:— | null | 472 | ❌ | case 472 :64345 |
| v_473_lead_brick | 690 | pick:0 axe:— | null | 473 | ❌ | case 473 :64348 |
| v_474_lesion_block | 691 | pick:0 axe:— | null | 474 | ❌ | case 474 :64354 |
| v_478_crimstone_brick | 692 | pick:0 axe:— | null | 478 | ❌ | case 478 :64357 |
| v_486_drum_set | 693 | pick:0 axe:— | null | 486 | 📋 | no-drop 表 :65803-66145 |
| v_489_pin_wheel | 694 | pick:0 axe:— | null | 489 | 📋 | no-drop 表 :65803-66145 |
| v_490_weather_vane | 695 | pick:0 axe:— | null | 490 | 📋 | no-drop 表 :65803-66145 |
| v_492_hallowed_mowed_grass_block | 696 | pick:0 axe:— | null | 492 | ❌ | case 492 :64081 |
| v_493_pin_flags | 697 | pick:0 axe:— | null | 493 | 📋 | no-drop 表 :65803-66145 |
| v_494_golf_tee | 698 | pick:0 axe:— | null | 494 | ❌ | case 494 :65488 |
| v_496_anti_portal_block | 699 | pick:0 axe:— | null | 496 | ❌ | case 496 :64363 |
| v_498_spider_nest_block | 700 | pick:0 axe:— | null | 498 | ❌ | case 498 :64309 |
| v_500_solar_brick | 701 | pick:0 axe:— | null | 500 | ❌ | case 500 :64402 |
| v_501_vortex_brick | 702 | pick:0 axe:— | null | 501 | ❌ | case 501 :64405 |
| v_502_nebula_brick | 703 | pick:0 axe:— | null | 502 | ❌ | case 502 :64408 |
| v_503_stardust_brick | 704 | pick:0 axe:— | null | 503 | ❌ | case 503 :64411 |
| v_505_gold_fish_bowl | 706 | pick:0 axe:— | null | 505 | 📋 | no-drop 表 :65803-66145 |
| v_507_gold_starry_block | 707 | pick:0 axe:— | null | 507 | ❌ | case 507 :64909 |
| v_508_blue_starry_block | 708 | pick:0 axe:— | null | 508 | ❌ | case 508 :64912 |
| v_510_arrow_sign | 709 | pick:0 axe:— | null | 510 | 📋 | no-drop 表 :65803-66145 |
| v_511_painted_arrow_sign | 710 | pick:0 axe:— | null | 511 | 📋 | no-drop 表 :65803-66145 |
| v_512_green_moss_brick | 711 | pick:0 axe:— | null | 512 | ❌ | case 512 :64073 |
| v_513_brown_moss_brick | 712 | pick:0 axe:— | null | 513 | ❌ | case 513 :64073 |
| v_514_red_moss_brick | 713 | pick:0 axe:— | null | 514 | ❌ | case 514 :64073 |
| v_515_blue_moss_brick | 714 | pick:0 axe:— | null | 515 | ❌ | case 515 :64073 |
| v_516_purple_moss_brick | 715 | pick:0 axe:— | null | 516 | ❌ | case 516 :64073 |
| v_517_lava_moss_brick | 716 | pick:0 axe:— | null | 517 | ❌ | case 517 :64073 |
| v_520_plate | 717 | pick:0 axe:— | MISSING | 520 | ❌ | case 520 :65518 |
| v_521_black_dragonfly_jar | 718 | pick:0 axe:— | null | 521 | 📋 | no-drop 表 :65803-66145 |
| v_522_blue_dragonfly_jar | 719 | pick:0 axe:— | null | 522 | 📋 | no-drop 表 :65803-66145 |
| v_523_green_dragonfly_jar | 720 | pick:0 axe:— | null | 523 | 📋 | no-drop 表 :65803-66145 |
| v_524_orange_dragonfly_jar | 721 | pick:0 axe:— | null | 524 | 📋 | no-drop 表 :65803-66145 |
| v_525_red_dragonfly_jar | 722 | pick:0 axe:— | null | 525 | 📋 | no-drop 表 :65803-66145 |
| v_526_yellow_dragonfly_jar | 723 | pick:0 axe:— | null | 526 | 📋 | no-drop 表 :65803-66145 |
| v_527_gold_dragonfly_jar | 724 | pick:0 axe:— | null | 527 | 📋 | no-drop 表 :65803-66145 |
| v_534_krypton_moss_block | 727 | pick:0 axe:— | null | 534 | ❌ | case 534 :64060 |
| v_535_krypton_moss_brick | 728 | pick:0 axe:— | null | 535 | ❌ | case 535 :64073 |
| v_537_xenon_moss_brick | 729 | pick:0 axe:— | null | 537 | ❌ | case 537 :64073 |
| v_540_argon_moss_brick | 731 | pick:0 axe:— | null | 540 | ❌ | case 540 :64073 |
| v_541_echo_block | 732 | pick:0 axe:— | null | 541 | ❌ | case 541 :64336 |
| v_543_pupfish_bowl | 734 | pick:0 axe:— | null | 543 | 📋 | no-drop 表 :65803-66145 |
| v_545_lawn_flamingo | 736 | pick:0 axe:— | null | 545 | 📋 | no-drop 表 :65803-66145 |
| v_547_potted_trees | 737 | pick:0 axe:— | null | 547 | ❌ | Check3x6 :53361-53365（5 档） |
| v_552_sandcastle_bucket | 740 | pick:0 axe:— | null | 552 | 📋 | no-drop 表 :65803-66145 |
| v_560_golf_trophies | 747 | pick:0 axe:— | null | 560 | 📋 | no-drop 表 :65803-66145 |
| v_563_large_bamboo_block | 748 | pick:0 axe:— | null | 563 | ❌ | case 563 :64443 |
| v_566_amber_stone_block | 749 | pick:0 axe:— | null | 566 | ❌ | case 566 :65004 |
| v_568_pink_fairy_jar | 750 | pick:0 axe:— | null | 568 | 📋 | no-drop 表 :65803-66145 |
| v_569_green_fairy_jar | 751 | pick:0 axe:— | null | 569 | 📋 | no-drop 表 :65803-66145 |
| v_570_blue_fairy_jar | 752 | pick:0 axe:— | null | 570 | 📋 | no-drop 表 :65803-66145 |
| v_572_souls_in_a_bottle | 753 | pick:0 axe:— | null | 572 | ❌ | Check1x2Top :46824-46826（6 档） |
| v_573_tattered_wood_sign | 754 | pick:0 axe:— | null | 573 | 📋 | no-drop 表 :65803-66145 |
| v_579_rock_golem_head | 755 | pick:0 axe:— | null | 579 | ❌ | case 579 :64491 |
| v_580_hell_butterfly_jar | 756 | pick:0 axe:— | null | 580 | 📋 | no-drop 表 :65803-66145 |
| v_581_lavafly_in_a_bottle | 757 | pick:0 axe:— | null | 581 | 📋 | no-drop 表 :65803-66145 |
| v_590_gem_saplings | 759 | pick:0 axe:— | null | 590 | 📋 | no-drop 表 :65803-66145 |
| v_591_hanging_pots | 760 | pick:0 axe:— | null | 591 | 📋 | no-drop 表 :65803-66145 |
| v_595_sakura_sapling | 761 | pick:0 axe:— | null | 595 | 📋 | no-drop 表 :65803-66145 |
| v_615_yellow_willow_sapling | 776 | pick:0 axe:— | null | 615 | 📋 | no-drop 表 :65803-66145 |
| v_617_relic_base | 777 | pick:0 axe:— | null | 617 | ❌ | Check3x4 :50167-50176（28 档） |
| v_620_prismatic_lacewing_jar | 779 | pick:0 axe:— | null | 620 | 📋 | no-drop 表 :65803-66145 |
| v_622_teapot | 780 | pick:0 axe:— | null | 622 | 📋 | no-drop 表 :65803-66145 |
| v_623_potted_crystal_plants | 781 | pick:0 axe:— | null | 623 | 📋 | no-drop 表 :65803-66145 |
| v_624_abigail_s_flower | 782 | pick:0 axe:— | null | 624 | ❌ | case 624 :64497 |
| v_626_neon_moss_brick | 783 | pick:0 axe:— | null | 626 | ❌ | case 626 :64073 |
| v_627_helium_moss_block | 784 | pick:0 axe:— | null | 627 | ❌ | case 627 :64060 |
| v_628_helium_moss_brick | 785 | pick:0 axe:— | null | 628 | ❌ | case 628 :64073 |
| v_630_stinkbug_blocker | 787 | pick:0 axe:— | null | 630 | ❌ | case 630 :64339 |
| v_631_ghostly_stinkbug_blocker | 788 | pick:0 axe:— | null | 631 | ❌ | case 631 :64342 |
| v_635_ash_wood | 790 | pick:0 axe:— | null | 635 | ❌ | case 635 :64879 |
| v_639_mana_crystal | 791 | pick:0 axe:— | null | 639 | 📋 | no-drop 表 :65803-66145 |
| v_641_reef_block | 793 | pick:0 axe:— | null | 641 | ❌ | case 641 :64195 |
| v_646_shadow_candle | 797 | pick:0 axe:— | null | 646 | ❌ | case 646 :64684 |
| v_647_large_rubble_3x2 | 798 | pick:0 axe:— | null | 647 | ✅ | :49573-49617 Check3x2 资源段 |
| v_648_large_rubble_3x2_group_2 | 799 | pick:0 axe:— | null | 648 | ✅ | :49618-49675 Check3x2 资源段 |
| v_649_medium_rubble_2x1 | 800 | pick:0 axe:— | null | 649 | ❌ | Check2x1 case 649 :47271-47340 |
| v_650_small_rubble_1x1 | 801 | pick:0 axe:— | null | 650 | ❌ | :65403-65477 case 650 |
| v_651_large_rubble_3x2_group_3 | 802 | pick:0 axe:— | null | 651 | ✅ | :49679-49688 Check3x2 |
| v_652_medium_rubble_2x2 | 803 | pick:0 axe:— | null | 652 | ✅ | :48705-48708 Check2x2 |
| v_653_pots_rubblemaker | 804 | pick:0 axe:— | null | 653 | ❌ | :86385 CheckPot |
| v_654_tnt_barrel | 805 | pick:0 axe:— | null | 654 | ✅ | no-drop :66114 + :48771-48772 →弹1002（Game.ts:12754 压 place_v_） |
| v_657_echo_chamber | 807 | pick:0 axe:— | null | 657 | 📋 | no-drop 表 :65803-66145 |
| v_658_aether_monolith | 808 | pick:0 axe:— | null | 658 | 📋 | no-drop 表 :65803-66145 |
| v_659_aetherium_block | 809 | pick:0 axe:— | null | 659 | ❌ | case 659 :64044 |
| v_660_faeling_in_a_bottle | 810 | pick:0 axe:— | null | 660 | 📋 | no-drop 表 :65803-66145 |
| v_661_corrupt_jungle_grass_block | 811 | pick:0 axe:— | null | 661 | ❌ | case 661 :64990 |
| v_662_crimson_jungle_grass_block | 812 | pick:0 axe:— | null | 662 | ❌ | case 662 :64990 |
| v_663_enchanted_moondial | 813 | pick:0 axe:— | null | 663 | 📋 | no-drop 表 :65803-66145 |
| v_665_life_crystal_boulder | 814 | pick:0 axe:— | null | 665 | ✅ | :48780-48781 →1014 |
| v_666_poo | 815 | pick:0 axe:— | null | 666 | ❌ | case 666 :64288 |
| v_667_aetherium_brick | 816 | pick:0 axe:— | null | 667 | ❌ | case 667 :64047 |
| v_669_lunar_rust_brick | 817 | pick:0 axe:— | null | 669 | ❌ | case 669 :64216 |
| v_670_dark_celestial_brick | 818 | pick:0 axe:— | null | 670 | ❌ | case 670 :64219 |
| v_671_astra_brick | 819 | pick:0 axe:— | null | 671 | ❌ | case 671 :64222 |
| v_672_cosmic_ember_brick | 820 | pick:0 axe:— | null | 672 | ❌ | case 672 :64225 |
| v_673_cryocore_brick | 821 | pick:0 axe:— | null | 673 | ❌ | case 673 :64228 |
| v_674_mercury_brick | 822 | pick:0 axe:— | null | 674 | ❌ | case 674 :64231 |
| v_675_star_royale_brick | 823 | pick:0 axe:— | null | 675 | ❌ | case 675 :64234 |
| v_676_heavenforge_brick | 824 | pick:0 axe:— | null | 676 | ❌ | case 676 :64237 |
| v_677_ancient_blue_brick | 825 | pick:0 axe:— | null | 677 | ⚠️ | Main.cs:7944 tileDungeon[677]=true |
| v_678_ancient_green_brick | 826 | pick:0 axe:— | null | 678 | ⚠️ | Main.cs:7945 tileDungeon[678]=true |
| v_679_ancient_pink_brick | 827 | pick:0 axe:— | null | 679 | ⚠️ | Main.cs:7946 tileDungeon[679]=true |
| v_680_ancient_gold_brick | 828 | pick:0 axe:— | null | 680 | ❌ | case 680 :64249 |
| v_681_ancient_silver_brick | 829 | pick:0 axe:— | null | 681 | ❌ | case 681 :64252 |
| v_682_ancient_copper_brick | 830 | pick:0 axe:— | null | 682 | ❌ | case 682 :64255 |
| v_683_ancient_obsidian_brick | 831 | pick:0 axe:— | null | 683 | ❌ | case 683 :64258 |
| v_684_ancient_hellstone_brick | 832 | pick:0 axe:— | null | 684 | ❌ | case 684 :64261 |
| v_685_ancient_cobalt_brick | 833 | pick:0 axe:— | null | 685 | ❌ | case 685 :64264 |
| v_686_ancient_mythril_brick | 834 | pick:0 axe:— | null | 686 | ❌ | case 686 :64267 |
| v_687_lava_moss_brick | 835 | pick:0 axe:— | null | 687 | ❌ | case 687 :64270 |
| v_688_argon_moss_brick | 836 | pick:0 axe:— | null | 688 | ❌ | case 688 :64273 |
| v_689_krypton_moss_brick | 837 | pick:0 axe:— | null | 689 | ❌ | case 689 :64276 |
| v_690_xenon_moss_brick | 838 | pick:0 axe:— | null | 690 | ❌ | case 690 :64279 |
| v_691_neon_moss_brick | 839 | pick:0 axe:— | null | 691 | ❌ | case 691 :64282 |
| v_692_helium_moss_brick | 840 | pick:0 axe:— | null | 692 | ❌ | case 692 :64285 |
| v_693_mitey_titey | 841 | pick:0 axe:— | null | 693 | ❌ | :65095-65097+:38947-39003 |
| v_694_stalactite_1x2_echo | 842 | pick:0 axe:— | null | 694 | ✅ | :38940-39003 GetStalactiteEchoDrop |
| v_695_replica_demon_altar | 843 | pick:0 axe:— | null | 695 | ❌ | :49466-49476（2 档） |
| v_696_replica_shadow_orb | 844 | pick:0 axe:— | null | 696 | ❌ | :54250-54257（2 档） |
| v_698_item_flask | 846 | pick:0 axe:— | MISSING | 698 | 📋 | no-drop 表 :65803-66145 |
| v_699_alchemy_flask | 847 | pick:0 axe:— | null | 699 | 📋 | no-drop 表 :65803-66145 |
| v_700_abigails_flower_replica | 848 | pick:0 axe:— | null | 700 | ❌ | case 700 :64500 |
| v_701_glow_tulip_replica | 849 | pick:0 axe:— | null | 701 | ❌ | case 701 :64507 |
| v_702_life_fruit_replica | 850 | pick:0 axe:— | null | 702 | ✅ | :48037-48040 →1291 |
| v_703_jungle_plants_echo | 851 | pick:0 axe:— | null | 703 | ✅ | :65660-65690 case 703 帧表 |
| v_704_fallen_log_echo | 852 | pick:-1 axe:0 | null | 704 | ✅ | :49564 Check3x2 →501 |
| v_705_oasis_plants_echo | 853 | pick:0 axe:— | null | 705 | ✅ | :49458-49465 Check3x2 |
| v_706_terragrim_shrine_echo | 854 | pick:0 axe:— | null | 706 | ✅ | :49838-49848 →4144 |
| v_707_books_echo | 855 | pick:0 axe:— | null | 707 | ❌ | case 707 :65718-65728 |
| v_708_shimmerfall_block | 856 | pick:0 axe:— | null | 708 | ❌ | case 708 :64900 |
| v_709_magic_shimmer_dropper | 857 | pick:0 axe:— | null | 709 | 📋 | no-drop 表 :65803-66145 |
| v_712_poo_boulder | 859 | pick:0 axe:— | null | 712 | ✅ | :48783-48784 →1048 |
| v_717_lava_cloud | 860 | pick:0 axe:— | null | 717 | ❌ | case 717 :64639 |
| v_718_star_cloud | 861 | pick:0 axe:— | null | 718 | ❌ | case 718 :64642 |
| v_719_rainbow_cloud | 862 | pick:0 axe:— | null | 719 | ❌ | case 719 :64645 |
| v_720_crt_monolith | 863 | pick:0 axe:— | null | 720 | 📋 | no-drop 表 :65803-66145 |
| v_721_retro_monolith | 864 | pick:0 axe:— | null | 721 | 📋 | no-drop 表 :65803-66145 |
| v_722_fallen_star_block | 865 | pick:0 axe:— | null | 722 | ❌ | case 722 :64915 |
| v_723_kite_anchor | 866 | pick:0 axe:— | null | 723 | ✅ | :66141-66145 no-drop+TE 返还 |
| v_724_critter_anchor | 867 | pick:0 axe:— | null | 724 | ✅ | :66141-66145 no-drop+TE 返还 |
| v_725_film_projector | 868 | pick:0 axe:— | null | 725 | 📋 | no-drop 表 :65803-66145 |
| v_726_cannonball | 869 | pick:0 axe:— | null | 726 | ❌ | case 726 :64351 |
| v_727_dull_red_team_block | 870 | pick:0 axe:— | null | 727 | ❌ | case 727 :64105 |
| v_728_dull_green_team_block | 871 | pick:0 axe:— | null | 728 | ❌ | case 728 :64108 |
| v_729_dull_blue_team_block | 872 | pick:0 axe:— | null | 729 | ❌ | case 729 :64111 |
| v_730_dull_yellow_team_block | 873 | pick:0 axe:— | null | 730 | ❌ | case 730 :64114 |
| v_731_dull_pink_team_block | 874 | pick:0 axe:— | null | 731 | ❌ | case 731 :64117 |
| v_732_dull_white_team_block | 875 | pick:0 axe:— | null | 732 | ❌ | case 732 :64120 |
| v_733_radio_thing | 876 | pick:0 axe:— | null | 733 | 📋 | no-drop 表 :65803-66145 |
| v_734_feywood | 877 | pick:0 axe:— | null | 734 | ❌ | case 734 :64918 |
| v_735_hallowed_brick | 878 | pick:0 axe:— | null | 735 | ❌ | case 735 :64921 |
| v_736_easter_block | 879 | pick:0 axe:— | null | 736 | ❌ | case 736 :64924 |
| v_737_gothic_brick | 880 | pick:0 axe:— | null | 737 | ❌ | case 737 :64927 |
| v_738_flinx_fur_block | 881 | pick:0 axe:— | null | 738 | ❌ | case 738 :64930 |
| v_739_jellyfish_block | 882 | pick:0 axe:— | null | 739 | ❌ | case 739 :64933 |
| v_740_toybreaker_brick | 883 | pick:0 axe:— | null | 740 | ❌ | case 740 :64936 |
| v_741_pine_wood | 884 | pick:0 axe:— | null | 741 | ❌ | case 741 :64939 |
| v_742_harpy_block | 885 | pick:0 axe:— | null | 742 | ❌ | case 742 :64942 |
| v_743_moonplate_block | 886 | pick:0 axe:— | null | 743 | ❌ | case 743 :64945 |
| v_744_librarian_block | 887 | pick:0 axe:— | null | 744 | ❌ | case 744 :64948 |
| v_745_spike_block | 888 | pick:0 axe:— | null | 745 | ❌ | case 745 :64951 |
| v_746_office_block | 889 | pick:0 axe:— | null | 746 | ❌ | case 746 :64954 |
| v_747_forbidden_block | 890 | pick:0 axe:— | null | 747 | ❌ | case 747 :64957 |
| v_748_aquarium_block | 891 | pick:0 axe:— | null | 748 | ❌ | case 748 :64960 |
| v_749_boulder_block | 892 | pick:0 axe:— | null | 749 | ❌ | case 749 :64963 |
| v_750_sharp_spike_block | 893 | pick:0 axe:— | null | 750 | ❌ | case 750 :64966 |

### 分区 B 审计发现（2026-08-23）

总结：**确认 60 / 偏差(⚠️) 7 / 未实装(❌) 230 / 备案(📋) 124**（共 421）。❌ 口径与分区 A 一致：原版 vid 掉落未实装（现掉 place_v_ 复刻品或无掉落）；⚠️=已实装但行为偏差。

#### S1 系统性（❌×192）——v_ 建材方块 drop:null → 掉 place_v_ 复刻件，非原版 vid

- **1457 语义**：建材挖掉=掉放置物自身 vid。KillTile_GetItemDrops（WorldGen.cs:64012-66145）对每个建材 tile **显式赋 dropItem**（case 368→3086 花岗岩/case 321→2503 针叶木/case 226→1101 神庙砖/case 512-517 苔砖族→129 灰砖…），无 case 者落 :65803-66145 no-drop 表=真无掉落。
- **本仓**：tiles.ts 对 192 个 1×1 v_ 方块写 `drop:null`，Game.breakTile 1×1 通用尾（Game.ts:12916-12921）`else if (def.drop)` 落空→`place_v_<key>` 兜底（items.ts:973-984 自动注册的合成放置件）——vid/名称/图标/价值与原版件不同（另：World.breakTileAt:394 对 null 语义是"真无掉落"，与 Game 路径不一致，微差）。
- **功能影响**：171 个原版 vid 中 **121 个是配方材料**（vanilla-recipes.json 3376 条全扫）——针叶木 2503×29 配方/棕榈木 2504×29/活木 620×31/灰烬木 5215×28/南瓜块 1725×29/暗影木 911×28/齿轮 1344×26/苔砖族→灰砖 129×24/蜂蜜块 1125×24/王朝木 2260×24/竹 4564×23/日盘块 824×22/神庙砖 1101×21/星辰砖 4229-4232×21…挖→合成链断裂（配方按 vid 严格计数，vanillaRecipes.ts:404 invIndexOfVanilla；place_v_ 无 vid 永不计入）。
- **修复建议**：tiles.ts 批量回填 `drop:<原版 vid>`（逐 case 机械转录，171 vid 已全验存在于 vanilla.json items 表+图集矩形，无缺图风险）；同步改 tests/multi-tile-drop.test.ts 的 place_v_ 断言面。
- S1 全录（192）：
  > 368_granite_block、226_lihzahrd_brick、367_marble_block、633_ash_grass_block、536_xenon_moss_block、224_slush_block、383_living_mahogany_block、273_stone_slab、381_lava_moss、321_boreal_wood、357_smooth_marble_block、272_cog_block、229_honey_block、311_dynasty_wood、350_martian_conduit_plating、369_smooth_granite_block、232_wooden_spike、274_sandstone_slab、322_palm_wood、312_red_dynasty_shingles、422_conveyor_belt_ccw、495_shell_pile_block、479_smooth_sandstone_block、477_mowed_grass_block、230_crispy_honey_block、562_bamboo_block、371_pink_slime_block、668_the_dirtiest_block、398_corrupt_hardened_sand_block、379_bubble、618_stone_accent_slab、571_bamboo、656_glow_tulip、625_neon_moss_block、234_crimsand_block、399_crimson_hardened_sand_block、248_palladium_column、340_living_cursed_fire_block、539_argon_moss_block、202_sunplate_block、203_crimstone_block、421_conveyorbeltleft、476_golfhole、546_grate、557_grateclosed、208_shadewood、249_bubblegum_block、250_titanstone_block、251_pumpkin_block、252_hay_block、253_spooky_wood、284_copper_plating、313_blue_dynasty_shingles、315_coralstone_block、325_tin_plating、326_waterfall_block、327_lavafall_block、328_confetti_block、329_midnight_confetti_block、336_living_fire_block、341_living_demon_fire_block、342_living_frost_fire_block、343_living_ichor_fire_block、344_living_ultrabright_fire_block、345_honeyfall_block、346_chlorophyte_brick、347_crimtane_brick、348_shroomite_plating、351_smoke_block、3
  > 70_meteorite_brick、385_crystal_block、400_corrupt_sandstone_block、401_crimson_sandstone_block、402_hallow_hardened_sand_block、403_hallow_sandstone_block、407_sturdy_fossil_block、408_luminite_ore、409_luminite_brick、415_solar_fragment_block、416_vortex_fragment_block、417_nebula_fragment_block、418_stardust_fragment_block、426_red_team_block、430_green_team_block、431_blue_team_block、432_yellow_team_block、433_pink_team_block、434_white_team_block、446_silly_pink_balloon_block、447_silly_purple_balloon_block、448_silly_green_balloon_block、449_blue_streamer、450_green_streamer、451_pink_streamer、458_sandfall_block、459_snowfall_block、460_snow_cloud_block、472_iron_brick、473_lead_brick、474_lesion_block、478_crimstone_brick、492_hallowed_mowed_grass_block、494_golf_tee、496_anti_portal_block、498_spider_nest_block、500_solar_brick、501_vortex_brick、502_nebula_brick、503_stardust_brick、507_gold_starry_block、508_blue_starry_block、512_green_moss_brick、513_brown_moss_brick、514_red_moss_brick、515_blue_moss_brick、516_purple_moss_brick、517_lava_moss_brick、520_plate、534_krypton_moss_block、535_krypton_moss_brick、537_xenon_moss_brick、540_argon_moss_brick、541_echo_block、563_large_bamboo_block、566_amber_stone_block、579_rock_golem_head、624_abigail_s_flower、626_neon_moss_brick、627_helium_moss_block、628_helium_moss_brick、630_stinkbug_blocker、631_ghostly_stinkbug_blocker、635_ash_wood、641_reef_block、646_shadow_candle、659_aet
  > herium_block、661_corrupt_jungle_grass_block、662_crimson_jungle_grass_block、666_poo、667_aetherium_brick、669_lunar_rust_brick、670_dark_celestial_brick、671_astra_brick、672_cosmic_ember_brick、673_cryocore_brick、674_mercury_brick、675_star_royale_brick、676_heavenforge_brick、680_ancient_gold_brick、681_ancient_silver_brick、682_ancient_copper_brick、683_ancient_obsidian_brick、684_ancient_hellstone_brick、685_ancient_cobalt_brick、686_ancient_mythril_brick、687_lava_moss_brick、688_argon_moss_brick、689_krypton_moss_brick、690_xenon_moss_brick、691_neon_moss_brick、692_helium_moss_brick、700_abigails_flower_replica、701_glow_tulip_replica、708_shimmerfall_block、717_lava_cloud、718_star_cloud、719_rainbow_cloud、722_fallen_star_block、726_cannonball、727_dull_red_team_block、728_dull_green_team_block、729_dull_blue_team_block、730_dull_yellow_team_block、731_dull_pink_team_block、732_dull_white_team_block、734_feywood、735_hallowed_brick、736_easter_block、737_gothic_brick、738_flinx_fur_block、739_jellyfish_block、740_toybreaker_brick、741_pine_wood、742_harpy_block、743_moonplate_block、744_librarian_block、745_spike_block、746_office_block、747_forbidden_block、748_aquarium_block、749_boulder_block、750_sharp_spike_block

#### S2 多 style 家族（❌×27）——原版 Check*/TE 逐 style 返还真物品，repo 恒掉 place_v_ 通用件

| 方块 key | 原版基线 | 差异 |
|---|---|---|
| v_240_wall_hangings_3x3 | Check3x3 :44381+（101 档） | 画族逐 style 掉真画件 |
| v_242_paintings_6x4 | Check6x4Wall 逐 style（75 档） | 画族逐 style |
| v_246_paintings_3x2 | Check3x2Wall 逐 style（37 档） | 画族逐 style |
| v_245_paintings_2x3 | Check2x3Wall 逐 style（29 档） | 画族逐 style |
| v_215_campfires | GetCampfireItemDrop :50054-50075（16 档） | 应逐 style 掉 966/3046-3050/3723/3724… |
| v_241_catacombs | Check4x3Wall 逐 style | 画族逐 style |
| v_470_mannequins | TEDisplayDoll.Framing_CheckTile :86373（2 档） | 模特逐 style 返还 |
| v_548_potted_trees_group_2 | Check3x6 :53361-53365（9 档） | 应掉 4430+/5081+ |
| v_255_amethystgemsparkoff | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_256_topazgemsparkoff | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_257_sapphiregemsparkoff | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_258_emeraldgemsparkoff | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_259_rubygemsparkoff | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_260_diamondgemsparkoff | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_261_ambergemsparkoff | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_262_amethystgemspark | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_263_topazgemspark | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_264_sapphiregemspark | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_265_emeraldgemspark | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_266_rubygemspark | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_267_diamondgemspark | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_268_ambergemspark | case 255-268 :64970-64985 | 宝石火花块 on/off 应掉 1970+type-255（1970-1976），现掉 place_v_ |
| v_547_potted_trees | Check3x6 :53361-53365（5 档） | 应掉 4430+/5081+ |
| v_572_souls_in_a_bottle | Check1x2Top :46824-46826（6 档） | 应掉 4695+style |
| v_617_relic_base | Check3x4 :50167-50176（28 档） | 圣物底座逐 boss 返还 |
| v_695_replica_demon_altar | :49466-49476（2 档） | 应掉 5467/5468 |
| v_696_replica_shadow_orb | :54250-54257（2 档） | 应掉 5469/5470 |

#### 逐项 ❌ 明细（11 项）

| 方块 key | 问题 | 1457 行号 | 建议 |
|---|---|---|---|
| v_225_hive_block | 1/3 变蜂蜜+1/2 出蜂 1-2 已接；掉落应 1124 Hive，现掉 place_v_ | :65521-65543 case 225 | breakHive 掉落改 vi_1124（蜂巢） |
| v_637_ash_short_plants | 1/100 应掉 5214 灰烬草种，repo 无 | :65025-65030 case 637 | killTileDropItems 补 case 637（1/100→5214） |
| v_519_cattails | frameY==90 段 1/2 应掉 183 发光蘑菇，repo 无 | :65051-65056 case 519 | killTileDropItems 补 case 519（fy==90 段 1/2→183） |
| v_324_seashells | 应按 fy/22 掉 2625/2626/4071-4073，现掉 place_v_ | :65328-65346 case 324 | 补 case 324 逐 style（fy/22→2625/2626/4071-4073） |
| v_389_tall_gate_open | 开门破坏原版也返还 3240 Tall Gate；repo 无掉落 | :51683-51736 CheckTallGate | 开门破坏返还 Tall Gate 3240（同 388） |
| v_334_weapon_rack_legacy_do_not_use | 原版返还 2699 Weapon Rack；repo 无掉落 | CheckWeaponsRack :46406-46465 | object 分支补 2699 返还（或并入 471 TE 族） |
| v_649_medium_rubble_2x1 | 原版按 fx 段掉 3/154/71-73 币/181/180/177-179/182/593/9/150/3271…；repo 整件无掉落（未入 ECHO_RESOURCE_SHEETS） | Check2x1 case 649 :47271-47340 | 补入 ECHO_RESOURCE_SHEETS+echoResourceDropVid 帧段（同 647 族） |
| v_650_small_rubble_1x1 | 应按 fx/18 段掉 3/2/154/9/593/664/150/3271/3086/3081/62/169，现掉 place_v_ | :65403-65477 case 650 | 同 649：echoResourceDropVid 补 case 650 帧段 |
| v_653_pots_rubblemaker | 原版同 28 走 CheckPot 整罐战利品；repo 只掉 place_v_ 无罐 loot | :86385 CheckPot | 653 并入 smashPot 瓦罐 loot 链（原版 CheckPot 同 28） |
| v_693_mitey_titey | 应掉 GetStalactiteEchoDrop(fx/18) 段资源（原版不返还 5464），现掉 place_v_ | :65095-65097+:38947-39003 | echoResourceDropVid 补 case 693（GetStalactiteEchoDrop 13 档） |
| v_707_books_echo | 原版 fx==90→165 水蜡书(noPrefix)/其余→149 书；repo 无掉落（breakTile 帧带覆写只拦 sheet 50） | case 707 :65718-65728 | breakTile 帧带覆写补 sheet 707（同 50 支：90→165/其余→149） |

#### ⚠️ 偏差（7 项）——已实装但行为错

| 方块 key | 问题 | 1457 行号 | 建议修复 |
|---|---|---|---|
| v_483_cracked_pink_brick | 同 481 | Main.cs:7941-7946 tileDungeon 不含 481-483 | TILE_DUNGEON_SHEETS 剔除 481-483（Game.ts:508） |
| v_227_dye_plants | 1107+fx/34 已接；style 8-11 应改掉 3385+num-8，repo 缺该支（Game.ts killTileDropItems） | case 227 :65098-65105 | killTileDropItems 227 支补 3385+num-8 档（style 8-11） |
| v_481_cracked_blue_brick | 裂砖原版无镐门槛无÷2（肉前地牢薄弱墙设计）；repo TILE_DUNGEON_SHEETS(Game.ts:508) 误收→地表下 100 镐力拦死+÷2 | Main.cs:7941-7946 tileDungeon 不含 481-483 | TILE_DUNGEON_SHEETS 剔除 481-483（Game.ts:508） |
| v_482_cracked_green_brick | 同 481 | Main.cs:7941-7946 tileDungeon 不含 481-483 | TILE_DUNGEON_SHEETS 剔除 481-483（Game.ts:508） |
| v_677_ancient_blue_brick | 古砖原版 <100 镐力地表下不可挖+÷2；repo pick:0 且不在 TILE_DUNGEON_SHEETS→木镐可挖（门槛+减伤双缺） | Main.cs:7944 tileDungeon[677]=true | TILE_DUNGEON_SHEETS 补 677-679 + tiles.ts pick:100（同 41/43/44 族） |
| v_678_ancient_green_brick | 同 677 | Main.cs:7945 tileDungeon[678]=true | TILE_DUNGEON_SHEETS 补 677-679 + tiles.ts pick:100（同 41/43/44 族） |
| v_679_ancient_pink_brick | 同 677 | Main.cs:7946 tileDungeon[679]=true | TILE_DUNGEON_SHEETS 补 677-679 + tiles.ts pick:100（同 41/43/44 族） |

#### 📋 登记面（124 项，微差不修）

- **多格单件家具/罐/瓶族**：原版 KillTile 在 no-drop 表、掉落走 TileFrame Check* 返还【放置物品】；repo multiTileDropKey（Game.ts:535-541）按 vanillaPlaceableTileKeys 门掉 place_v_ ≈同语义，仅合成 id 微差（功能=挖掉可再放置）。
- **1×1 原版无掉落而 repo 超发 place_v_**：384 活红木树叶/373·374·375·461 滴落族/709 微光滴管等（原版破坏无掉落）。
- **树苗 590/595/615**：原版 Check1x2 无返还（挖苗无物）；repo place_v_ 超发。
- **v_654 TNT 桶**：repo 专用支压 place_v_（Game.ts:12754）=无物品+1002 等效爆炸，与原版 no-drop（:66114）一致，计 ✅。
- **v_753_gianttiki**：1456 switch 无 case 751-753（1457 新内容）；repo 显式 drop 6147 合理，无基线可对，备案。v_751/752 同为无 case→repo 无掉落=✅ 已计入确认。

#### 贴图抽查（维度③）

- B 区全部掉落 vid（显式 9 + 专用链 + S1 171 个去重）逐一核对 `public/sprites/vanilla.json` items 表：**全存在**且带 Item_Atlas_* 图集矩形（ix/iy/iw/ih），3 个图集文件在盘；place_v_ 复刻件走 ItemIconGen 兜底生成（SpriteAtlas.ts:677-686）。**无缺图**。
- 专用链抽查 30+：棕榈 323→2504（邪沙 234→911/珍珠沙 116→621/黑檀沙 112→619 变体+树冠橡实 27）、轨道 314→GetTrackItem(2340/2492/2739)、宝石树 583-589→1/10 宝石 else 石块 Next(1,3)+树冠 1/2 宝石橡实、蜂巢 225→1/3 蜂蜜+蜜蜂 210/211、幼虫 231→无掉落+召蜂后、裂砖 481-483→无掉落+连锁、晶塔 597/喷泉 207→逐 style、巨石族 664/665/711-716→无物品+对应滚石弹——**与 1457 一致**。
- 任务点名核对：481-483 地牢裂砖（GetItemDrops 无赋值项=无掉落 ✓，repo breakCrackedBrick 同，但挖门见 ⚠️）；幼虫是 **231** 非 323（323=棕榈树，每干格 2504）；蜂巢 225 ✓；**128-131 不在分区 B**（活性石块族在分区 A，B 表无此四格）。

### 分区 C（26 项）

style 掉落族（27 族，vanillaStyleDrops.ts 逐族对拍 tests/style-drop-restore.test.ts）。对账点 = style 推导式(fx/fy 除数)+表内容+1457 GetItemDrop_* 行号。

> 审计方法（2026-08-23 子代理 C）：①解释器法全量对拍——从 Terarria1456/Terarria1457 两版
> WorldGen.cs 机械提取 22 个 GetItemDrop_* + GetDoorItem 函数体，C# 子集解释器对 style
> 0..255 逐档求值，与 vanillaStyleDrops.ts 27 数组逐项比对（case 落空/算术档/switch 表达式/
> if 链/secondType 全语义展开）；②styleFromFrame 26 条除数逐一回对 1456 调用点源码；
> ③掉落贴图=vanilla.json items[vid].icon 全量扫（非抽查，27 表 1383 去重 vid+19 单件 vid）。

| 方块 | tiles.ts 行 | 挖掘条件(pick/axe) | 掉落(vid) | 贴图 sheet | 确认 | 1456/1457 基线行 |
|---|---|---|---|---|---|---|
| platform | 60 | pick:0 axe:0 | 94 | 19 | ✅ | Platforms :42927/:43278；KillTile :65589(fy/18)/:66054 |
| v_93_lamps | 261 | pick:0 axe:— | null | 93 | ✅ | Lamps :41087/:41438；Check1xX :37802/:38169(num=3→fy/54 :37814-37820) |
| v_467_chests_group_2 | 269 | pick:0 axe:— | null | 467 | ✅ | Chests(secondType) :41596/:41947；GetItemDrop_Chests(x,y,type) :58022-58024/:58489-58491(fx/36,467=true) |
| v_13_placed_bottles | 277 | pick:0 axe:— | null | 13 | ✅ | Bottles :41265/:41616；KillTile :65585-65587(fx/18)/:66050-66052 |
| v_487_picnic_tables | 328 | pick:0 axe:— | null | 487 | ✅ | PicnicTables :40287/:40638；Check4x2 :47432-47435(fx/72)/:47838-47841 |
| v_172_sinks | 347 | pick:0 axe:— | null | 172 | ✅ | Sinks :41469/:41820；Check2x2 :48425(num3=38→fy/38)/:48831 |
| v_149_holidaylights | 459 | pick:0 axe:— | null | 149 | ✅ | KillTile case149 :65571-65583(fx 三色×两向)/:66036-66048 |
| v_497_toilets | 509 | pick:0 axe:— | null | 497 | ✅ | Toilet :42815/:43166；Check1x2 :43542(fy/40)/:43893 |
| v_177_platinum_brick | 560 | pick:0 axe:— | null | 177 | ⚠️ | KillTile case177 :64851-64853→719/:65316-65318（repo drop:null→place_v_ 兜底，见发现 C-3） |
| v_194_bone_block | 563 | pick:0 axe:— | null(表 194→154) | 194 | ✅ | KillTile case194 :64650-64652→154/:65115-65117（★154=Bone 骨头材料非 Bone Block 766，原版本相，勿"修"） |
| chair | 128 | pick:0 axe:— | 34 | —(自绘) | ✅ | Chair :42677/:43028（表[0]=34）；Check1x2 :43537(fy/40)/:43888 |
| bed | 129 | pick:0 axe:— | 224 | —(自绘) | ✅ | Beds :39947/:40298（表[0]=224）；Check4x2 :47424-47430(fy/36)/:47830-47836 |
| grandfather_clock | 131 | pick:0 axe:— | 359 | —(自绘) | ✅ | Clocks :40131/:40482（表[0]=359）；Check2xX :38170(fx/36)/:38537 |
| bench | 134 | pick:0 axe:— | 335 | —(自绘) | ✅ | Benches :40211/:40562（表[0]=335）；Check3x2 :49714(num6=fx/54)/:50141 |
| bathtub | 135 | pick:0 axe:— | 336 | —(自绘) | ✅ | Bathtubs :42322/:42673（表[0]=336）；Check4x2 :47424-47430(fy/36)/:47830-47836 |
| keg | 136 | pick:0 axe:— | 352 | 94 | ✅ | Check2x2 num14 链 :48673-48676→352/:49079-49082（TileFrame 派发 :86527/:87065） |
| cooking_pot | 137 | pick:0 axe:— | 345 | 96 | ✅ | Check2x2Style case96 :52430-52440(0→345/1→1791)/:52858-52868；TileFrame :86543-86544/:87081-87082 |
| clay_pot | 138 | pick:0 axe:— | 222 | 78 | ✅ | KillTile case78 :64761-64763→222/:65226-65228 |
| tombstone_v | 139 | pick:0 axe:— | 321 | 85 | ✅📋 | CheckSign case85 :43736-43744/:44087-44095（0→321/1-5→1173+/6-10→3229+，fx/36 :43626-43631）；幽灵掷骰未接（发现 C-5） |
| candle | 142 | pick:0 axe:— | 105 | 33 | ✅ | Candles :39766/:40117（表[0]=105）；KillTile :65593-65595(fy/22)/:66058-66060 |
| chandelier | 143 | pick:0 axe:— | 106 | 34 | ✅ | Chandeliers :40676/:41027（表[0]=106）；CheckChand :52855-52863(fy/54+37·fx/108)/:53283-53291 |
| lantern | 144 | pick:0 axe:— | 136 | 42 | ✅ | Lanterns :40873/:41224（表[0]=136）；Check1x2Top :46727-46733(fy/36)/:47117-47123 |
| candelabra | 146 | pick:0 axe:— | 349 | 100 | ✅ | Candelabras :40296/:40647（表[0]=349）；Check2x2 :48709-48712(num5=fy/36,num3=36)/:49115-49118 |
| chinese_lantern | 147 | pick:0 axe:— | 344 | 95 | ✅ | Check2x2 num14 链 :48677-48680→344/:49083-49086 |
| skull_lantern | 148 | pick:0 axe:— | 347 | 98 | ✅ | Check2x2 num14 链 :48689-48692→347/:49095-49098 |
| water_candle | 149 | pick:0 axe:— | 148 | 49 | ✅ | KillTile case49 :64725-64727→148/:65190-65192 |

#### 27 张 style→物品表对拍（vanillaStyleDrops.ts）

解释器逐 style 0..255 求值 vs `pick(t,style)=t[style]??t[0]`，**26/27 表零差**；两版函数体逐字节相同（1457 等价性实证，非仅注释声明）：

| 表 | 档数 | 首档 | 末档 | 1456/1457 函数行 | 对拍 |
|---|---|---|---|---|---|
| Candles(33) | 64 | 105 | 6115 | :39766/:40117 | ✅0 差 |
| Beds(79) | 65 | 224 | 6112 | :39947/:40298 | ✅0 差 |
| Clocks(104) | 66 | 359 | 6119 | :40131/:40482 | ✅0 差（1-5 档=if 早退 return 2237+st-1，已核） |
| Benches(89) | 69 | 335 | 6127 | :40211/:40562 | ✅0 差 |
| PicnicTables(487) | 2 | 4064 | 4065 | :40287/:40638 | ✅0 差 |
| Candelabras(100) | 65 | 349 | 6114 | :40296/:40647 | ✅0 差 |
| Bookcases(101) | 65 | 354 | 6113 | :40476/:40827 | ✅0 差 |
| Chandeliers(34) | 71 | 106 | 6117 | :40676/:41027 | ✅0 差 |
| Lanterns(42) | 71 | 136 | 6123 | :40873/:41224 | ✅0 差 |
| Lamps(93) | 65 | 342 | 6122 | :41087/:41438 | ✅0 差（1-10→2082+/11-16→2129+ 算术档已核） |
| Bottles(13) | 9 | 31 | 2258 | :41265/:41616 | ✅0 差 |
| Pianos(87) | 65 | 333 | 6124 | :41298/:41649 | ✅0 差 |
| Sinks(172) | 66 | 2827 | 6126 | :41469/:41820 | ✅0 差 |
| Tables(14) | 35 | 32 | 3154 | :42131(secondType=false)/:42482 | ✅0 差（index28=677 跳档为原版本相） |
| Tables_2(469) | 32 | 3920 | 6128 | :42131(secondType=true)；调用点 :49443-49445/:49870-49872 | ✅0 差 |
| Bathtubs(90) | 65 | 336 | 6111 | :42322/:42673 | ✅0 差 |
| Workbenches(18) | 65 | 36 | 6130 | :42489/:42840 | ✅0 差 |
| Chair(15) | 68 | 34 | 6116 | :42677/:43028 | ✅0 差 |
| Toilet(497) | 65 | 4096 | 6129 | :42815/:43166 | ✅0 差 |
| Platforms(19) | 70 | 94 | 6125 | :42927/:43278 | ✅0 差 |
| Dressers(88) | 65 | 334 | 6121 | :49870/:50297 | ✅0 差（KillTile 大件预开关 :64029-64030 fx/54 同式） |
| Chests(21) | 52 | 48 | 3181 | :41596/:41947 | ✅0 差（306/328/1528-1532/2612-2614 重复档为原版本相） |
| Chests_2(467) | 38 | 3884 | 6118 | :41596/:41947 | ✅0 差（4712 双档 :4265-4271 原版本相） |
| Doors(10/11) | 60 | 25 | 5907 | GetDoorItem :69257/:69726 | ⚠️缺 style 60-68（发现 C-1） |
| Tombstones(85) | 11 | 321 | 3233 | CheckSign :43736-43744/:44087-44095 | ✅0 差 |
| CookingPots(96) | 2 | 345 | 1791 | Check2x2Style :52430-52440/:52858-52868 | ✅0 差 |
| OreBars(239) | 23 | 20 | 3467 | KillTile :65166-65225/:65631-65690 | ✅0 差（fx/18 :65167/:65632） |

附表（非 const 数组，同文件）：CoinPiles 330-333→71-74（KillTile :64197-64204/:64662-64669）✅；holidayLightVid fx 0/54→596、18/72→597、36/90→598、余→0（:65571-65583）✅；BONE_BLOCK 194→154（:64650-64652）✅；echoResourceDropVid 8 组（647/648/651/652/694/702/704/705，:49573-49675/:49679-49688/:48705-48708/:38940-39003/:48037-48040/:49564-49566/:49458-49465）逐段核 ✅；MusicBoxes(139) 不在本文件——devices.ts MUSIC_BOX_ITEM_BY_STYLE 101 条对拍 GetItemDrop_MusicBoxes :43138-43366/:43489-43717 **0 差**（越界兜底 576=空盒初值 ✅）；喷泉 207 表 [909,910,940-945,4922,4417]（Check2xX :38199-38226）✅。

#### style 推导式（styleFromFrame 26 条）对拍

26 条除数全部与 1456 调用点一致：13 fx/18(:65586)、14/87/88/89/101/469 fx/54(Check3x2 num6 :49207-49213、Check3x4 :50102-50106)、15/497 fy/40(Check1x2 :43393-43399)、18 fx/36(Check2x1 num3=(fx/18)>>1 :47001-47002)、19 fy/18(:65590)、21/467 fx/36(:58024)、33 fy/22(:65594)、34 fx/108·37+fy/54(CheckChand :52855-52863，num6/108≡fx/108 已验)、42 fy/36(Check1x2Top :46727-46733)、79/90 fy/36(Check4x2 :47424-47430)、85 fx/36(CheckSign num12 :43626-43631)、93 fy/54(Check1xX num=3 :37809-37820)、96 fx/36(Check2x2Style :52334-52338)、100 fy/36/172 fy/38(Check2x2 num3 :48425-48432)、104 fx/36(:38170)、239 fx/18(:65167)、487 fx/72(:47434)；门两式 fx/54·36+fy/54(CheckDoorClosed :87184-87186 num2)、fy/54+fx/72·36(CheckDoorOpen :87093-87094 num4)。消费点 4 路全接（Game.ts 门 ：12597/object :12743/1×1 :12916/失撑 ：23487，行号为审计时快照、文件并行编辑中会漂移），帧取破坏前命中格帧——各族 style 轴带内所有格同带（3 列内 fx 差 <54、2 行内 fy 差 <36/38/40），与锚帧反推等价 ✅。

#### 掉落贴图

vanilla.json items[vid].icon 全量扫（非抽查）：27 表 1383 个去重 vid **0 缺**；19 个单件 vid（94/105/106/136/148/154/222/224/321/335/336/344/345/347/349/352/359/719）全有图标，且 createTile 反查与 tiles.ts VAN(sheet) 一致（chinese_lantern 344→tile95、skull_lantern 347→tile98、water_candle 148→tile49、keg 352→tile94、platinum_brick 719→tile177）✅。

### 分区 C 审计发现

- **C-1 ⚠️ Doors 表缺 style 60-68（9 件 1.4.5 新门）**：GetDoorItem 1456 :69431-69457 / 1457 :69900-69926 有 case 60-68→5941 天鹫门/5964 云门/5984 暮色门/6007 馆员门/6030 尖刺门/6053 办公室门/6076 禁忌门/6098 水族门/6120 巨石门（九件 vanilla.json 均在、createTile=10）；repo Doors 数组止于 style59(5907)，越界回落 t[0]=25——破坏/失撑这九种门恒掉木门。建议 Doors 表补 9 档（数组长 60→69）。1457 等价性不受影响（两版 case 块逐字节同）。
- **C-2 ⚠️ 门 sv==0 回落 VI(25) 与原版「不掉」语义冲突**：Game.ts 门路径 `sv > 0 ? (VANILLA_ITEM_KEY_BY_ID[sv] ?? VI(25)) : VI(25)`（审计时 ：12598-12599）——GetDoorItem 初值 result=0、DropDoorItem :69466-69471/:69935-69940 有 `doorItem != 0` 门：style11 神庙锁门（表 index11=0）与越界 style 应**无掉落**，repo 掉木门（同函数注释自己写「style11 神庙锁门=0 不掉」但代码未兑现）。建议 sv==0 时跳过 spawnDrop。
- **C-3 ⚠️ v_177_platinum_brick 掉 place_v_ 兜底而非原版物品**：KillTile case177 :64851-64853/:65316-65318 `dropItem = 719`（白金砖物品，repo vanilla.json 已有 719、createTile=177）；tiles.ts :560 drop:null + styleFromFrame 无 177 → 1×1 通用分支落 place_v_177_platinum_brick。与 A/B 分区砖族 drop:null 系同模式（归 A/B 批处置），C 区仅此一件，修法=drop:719 一处。
- **C-4 📋 越界 style 回落差（不可达微差）**：原版 KillTile_GetItemDrops dropItem 初值 0（:64014）→ 越界不掉；repo `pick` 回落 t[0]。仅 style>22 矿石条（fx≥414 越出贴图）等帧域外可达，不修。
  - **【2026-08-30 修订】失谐门审计后两处升级为显式钳制**：社区"失谐门/哲学家之石"利用链证明帧域外并非纯理论——雕像 ±72/篝火 ±36 整块改帧叠格可累积漂移（Wiring.cs:2536/:3021），漂移帧流进线性反推 sink 即成嬗变。①门支（sheet 10/11）：裸 pick 改**显式区间钳制**（`styleDropVidOfFrames` 内 banner 注释；行为与原 pick 逐点一致，仅固化）；②火把 `torchDropVid`：原版 default 本身就是无界外推 `426+num`（WorldGen.cs:65162,合法域 {0,8..23}+彩炬带 1..7），仓内曾忠实移植——本次判为原版自带洞、**刻意偏离**，出 [0,23] 一律回落普通火把 8。其余 pick 表族维持本条"不修"结论不变。守卫=tests/desync-door-clamp-guard.test.ts（6 断言）。
- **C-5 📋 墓碑破坏幽灵掷骰未接**：CheckSign case85 掉落物品后 1/8（专家 1/4、大师 1/2）且墓地/夜晚/地下三门槛生成幽灵 NPC 316（:43766-43776/:44117-44127）。掉落表本身 ✅，此为附带生成链（Ghost 316 已在 BOSS_SPAWN_SILENT 表，缺墓碑触发点）。
- **C-6 📋 喷泉 207 越界 style 微差**：Check2xX default 落 `num12=style` 原样掉该 id（:38218-38230），repo fountainDropItemOf 返 -1 不掉；喷泉仅 10 档帧域内不可达，不修。
- **C-7 📋 表注释行号小误（不影响实现）**：vanillaStyleDrops.ts 头注与 Game.ts 注释称关门 style 式在「CheckDoorClosed :87159 段 num4」——:87159 实为 CheckDoorOpen 的 DropDoorItem 调用；关门式在 CheckDoorClosed **:87184-87186（变量 num2）**，CheckDoorClosed 自己的 DropDoorItem 在 ：87253（1457 :87723/:87791）。两式本身正确。
- **C-8 ✅ 骨块 194→154 是原版本相**：KillTile case194 掉 154（Bone 骨头材料）而非 Bone Block 物品 766——1456 :64650-64652 与 1457 :65115-65117 一致；repo BONE_BLOCK=154 正确，后续勿按 wiki 直觉「修」成 766。

**分区 C 总结**：确认 24 / 偏差 2（C-1 Doors 缺 9 档、C-2 门 sv==0 回落）/ 未实装 0（另 📋 登记 4 条微差/注释勘误）；27 表×style 0..255 全量解释器对拍 26 表零差，贴图 1402 vid 全存在，1456↔1457 函数族逐字节同。

### 分区 D（90 项）

#### 主会话预审发现（D 区，待并入子代理报告）

- ⚠️ 香蒲 v_519_cattails：1457 :65051-65055 `case 519: frameY==90 && Next(2)==0 → drop 183`——本仓 drop:null 且 breakTile 无 case 519 = 香蒲破坏零掉落。
- ⚠️ 蘑菇藤 v_528_mushroom_vines：1457 :65057-65060 `case 528: Next(2)==0 → drop 183`——本仓 drop:null 同缺口。


decor 装饰/植物（割除掉落/附着门）。对账点 = 割除掉落(种子/药草/草籽)+附着(ground/wall)+秒清。

| 方块 | tiles.ts 行 | 挖掘条件(pick/axe) | 掉落(vid) | 贴图 sheet | 确认 | 1457 基线行 |
|---|---|---|---|---|---|---|
| torch | 61 | pick:0 axe:— | 8 | 4 | ⚠️ | case 4 :65106-65164 fy/22→24 档（0=8/8=523/9=974/10=1245/11=1333/12=2274/13=3004/14=3045/15=3114/16=4383/17=4384/18=4385/19=4386/20=4387/21=4388/22=5293/23=5353/default=426+n）；本仓恒掉 8——放置侧已支持 24 style（Torch.ts BIOME_TORCH_ITEM）→ D-3 |
| door_open | 68 | pick:0 axe:— | 25 | 11 | ✅ | case 11 共享 no-drop :65804；掉落走门链 Doors 表（GetDoorItem :69257/DropDoorItem :69466）端到端 vid 正确——C-1/C-2 已记 |
| mushroom | 69 | pick:0 axe:— | 5 | 3 | ✅ | case 3 :65041-65047 fx==144→5；killTileDropItems 帧表同式，生成期蘑菇帧 144（SurfaceDecorPasses :2271/:2284）✓ |
| flower | 70 | pick:0 axe:— | null | 3 | ✅ | case 3 :65048-65050 ShouldDropSeeds→283（KillTile_ShouldDropSeeds :66232=1/2 且背包有吹管 281/吹枪 986）本仓 :12358-12367 同式 ✓ |
| tallgrass | 71 | pick:0 axe:0 | 27 | 3 | 📋 | 实际掉落=283 吹管门 ✓；def.drop:27 系死代码（TILE_CUT 分支不读 def.drop，Game.ts :12818-12845）——登记防误读，勿按 27「修」 |
| acorn_sapling | 74 | pick:0 axe:0 | 27 | 20 | ⚠️ | case 20 共享 no-drop :65811 且 Check1x2 :43377 无 type20 返还支=原版挖苗**无返还**；本仓 def.drop=27 经 object 分支掉橡实（多余）→ D-5 |
| pot | 151 | pick:0 axe:— | null | 28 | ✅ | case 28 共享 no-drop :65815；掉落走 CheckPot 战利品链——本仓 smashPot（Game.ts :17053）✓ |
| v_353_vine_rope | 221 | pick:0 axe:— | null | 353 | ❌ | case 353 :64170-64171→2996 Vine Rope；本仓 drop:null→place_v_ 兜底 → D-6 |
| v_638_ash_vines | 354 | pick:0 axe:— | null | 638 | ✅ | 共享 no-drop :66101；TILE_CUT 割除无掉落 ✓ |
| v_528_mushroom_vines | 355 | pick:0 axe:— | null | 528 | —主会话已记 | case 528 :65057-65061 Next(2)==0→183（缺 183，见上主会话节） |
| v_382_flower_vines | 356 | pick:0 axe:— | null | 382 | ⚠️ | case 52/62/382 :65087-65092 Next(2)==0 且 player.cordage→2996；cordage（3068 植物纤维绳索指南）效果全仓未接 → D-4 |
| v_124_wooden_beam | 357 | pick:0 axe:— | null | 124 | ❌ | case 124 :64608-64609→480 Wooden Beam；place_v_ 兜底 → D-6 |
| v_575_rich_mahogany_beam | 358 | pick:0 axe:— | null | 575 | ❌ | case 575 :64423-64424→4718 Rich Mahogany Beam → D-6 |
| v_213_rope | 359 | pick:0 axe:— | null | 213 | ❌ | case 213 :64518-64519→965 Rope；place_v_ 兜底 → D-6 |
| v_636_corrupt_vines | 360 | pick:0 axe:— | null | 636 | ✅ | 共享 no-drop :66100；TILE_CUT 割除无掉落 ✓ |
| v_574_boreal_beam | 361 | pick:0 axe:— | null | 574 | ❌ | case 574 :64420-64421→4717 Boreal Beam → D-6 |
| v_333_platinum_coin_pile | 362 | pick:0 axe:— | null | 333 | ✅ | case 333 :64206-64207→74 铂币；本仓 CoinPiles 表（vanillaStyleDrops.ts :114→styleDropVidOfFrames）✓ |
| v_332_gold_coin_pile | 363 | pick:0 axe:— | null | 332 | ✅ | case 332 :64203-64204→73 金币 ✓ |
| v_577_sandstone_column | 364 | pick:0 axe:— | null | 577 | ❌ | case 577 :64429-64430→4720 Sandstone Column → D-6 |
| v_561_marble_column | 365 | pick:0 axe:— | null | 561 | ❌ | case 561 :64417-64418→4554 Marble Column → D-6 |
| v_576_granite_column | 366 | pick:0 axe:— | null | 576 | ❌ | case 576 :64426-64427→4719 Granite Column → D-6 |
| v_214_chain | 369 | pick:0 axe:— | null | 214 | ❌ | case 214 :64515-64516→85 Chain；place_v_ 兜底 → D-6 |
| v_578_mushroom_beam | 370 | pick:0 axe:— | null | 578 | ❌ | case 578 :64432-64433→4721 Mushroom Beam → D-6 |
| v_52_vines | 373 | pick:0 axe:— | null | 52 | ⚠️ | cordage→2996 未接（同 v_382）→ D-4 |
| v_62_jungle_vines | 374 | pick:0 axe:— | null | 62 | ⚠️ | cordage→2996 未接（同 v_382）→ D-4 |
| v_69_jungle_thorns | 375 | pick:0 axe:— | null | 69 | ✅ | 共享 no-drop :65823 ✓ |
| v_31_orb_heart | 417 | pick:0 axe:— | null | 31 | ✅ | case 31 共享 no-drop :65817；破碎走 smashOrbHeart=CheckOrb :54187 1:1（召唤/计数链）✓ |
| v_71_mushroom_plant | 426 | pick:0 axe:— | null | 71 | ✅ | case 71/72 :65697-65703 1/40→194 蘑菇草种子 else 1/2→183；killTileDropItems :12377-12379 同式 ✓ |
| v_24_corruption_short_plants | 427 | pick:0 axe:— | null | 24 | ✅ | case 24 :65069-65073 fx==144→60 Vile Mushroom ✓ |
| v_32_corruption_thorns | 428 | pick:0 axe:— | null | 32 | ✅ | 共享 no-drop :65818 ✓ |
| v_27_sunflower | 429 | pick:0 axe:— | null | 27 | ✅ | case 27 共享 no-drop :65814；返还走 CheckSunflower :53744→63（:53806）——本仓 place_v_27（item 63 createTile=27 命中 placeableTiles 门）机制不同已核 |
| v_5_trees | 430 | pick:0 axe:0 | null | 5 | 📋 | 树掉落走 fellTree/fellImportedTree 链（树族批已对齐：木/橡实/苹果掷）；📋 镐经 decor 分支可砍干（原版 tileAxe 格镐不伤 Player.cs :45039）→ D-12 |
| v_80_cactus | 431 | pick:0 axe:0 | null | 80 | ✅ | case 80 :64767-64768→276 Cactus；fellCactus 掉 276（Game.ts :13359+）✓（镐可清同 D-12 📋） |
| v_3_forest_short_plants | 433 | pick:0 axe:— | null | 3 | ✅ | case 3 :65041-65050 fx144→5 / ShouldDropSeeds→283 ✓ |
| v_73_forest_tall_plants | 439 | pick:0 axe:— | null | 73 | ✅ | case 73 :65081-65085 ShouldDropSeeds→283 ✓ |
| v_61_jungle_short_plants | 440 | pick:0 axe:— | null | 61 | ✅ | case 61 :65677-65690 fx144→331×Next(2,4)/162→223/108-126 1/20→208/else 1/100→195；killTileDropItems :12347-12352 同式（含 stack 2..3）✓ |
| v_74_jungle_tall_plants | 441 | pick:0 axe:— | null | 74 | ✅ | case 74 :65678 1/100→195 Jungle Grass Seeds ✓ |
| v_83_herbs_mature | 442 | pick:0 axe:— | null | 83 | ✅ | case 83/84 :65729-65750 草 313+n(6→2358)×1 + 种子 307+n(6→2357)（staffOfRegrowthBonus ×Next(1,3)/×Next(1,6)；IsAlchemyPlantHarvestable :66205 时辰门）本仓 :12827-12846 同式 ✓（气象/深度门微差 → D-11 📋） |
| v_84_herbs_bloom | 443 | pick:0 axe:— | null | 84 | ✅ | 同上（84 恒附种子 :65743 flag=IsHarvestableHerbWithSeed(84)=true）✓ |
| v_72_mushroom_tree | 444 | pick:-1 axe:0 | null | 72 | 📋 | 掉落 194/183 ✓（case 71/72）；📋 pick:-1 被 decor 秒清分支旁路（镐可清=原版 tileAxe 镐不伤）→ D-12 |
| v_201_crimson_short_plants | 448 | pick:0 axe:— | null | 201 | ✅ | case 201 :65075-65079 fx==270→2887 Vicious Mushroom ✓ |
| v_35_jackolanterns | 452 | pick:0 axe:— | null | 35 | ✅ | case 35 共享 no-drop :65820；返还走 CheckMB :51221→1813 Jack 'O Lantern（:51284）≈ place_v_35（item 1813 createTile=35）机制不同已核 |
| v_92_lampposts | 453 | pick:0 axe:— | null | 92 | ✅ | no-drop :65834；Check1xX :37802→341 Lamppost（:37869）≈ place_v_92 ✓ |
| v_126_discoball | 454 | pick:0 axe:— | null | 126 | ✅ | no-drop :65853；Check2x2 :48405→488 Disco Ball（:48725）≈ place_v_126 ✓ |
| v_139_musicboxes | 456 | pick:0 axe:— | null | 139 | ✅ | no-drop :65860；CheckMB→GetItemDrop_MusicBoxes(num3=fy/36)——本仓 devices.ts MUSIC_BOX_ITEM_BY_STYLE（C 区 101 档对拍 0 差）✓ |
| v_142_inletpump | 457 | pick:0 axe:— | null | 142 | ✅ | no-drop :65861；Check2x2 :48733-48736→581 Inlet Pump ≈ place_v_142 ✓ |
| v_143_outletpump | 458 | pick:0 axe:— | null | 143 | ✅ | no-drop :65862；Check2x2 :48737→582 Outlet Pump ✓ |
| v_173_platinumcandelabra | 460 | pick:0 axe:— | null | 173 | ✅ | no-drop :65866；Check2x2 :48713-48716→714 Platinum Candelabra ≈ place_v_173 ✓ |
| v_174_platinumcandle | 461 | pick:0 axe:— | null | 174 | ❌ | case 174 :64689-64690→713 Platinum Candle；本仓 drop:null→place_v_174 → D-6 |
| v_209_cannon | 462 | pick:0 axe:— | null | 209 | ⚠️ | no-drop :65874；CheckCannon :50804 style→928/1337/3369/3664 五档（:50869-50878）；place_v_209 单件无 style 档 → D-7 |
| v_210_landmine | 463 | pick:0 axe:— | null | 210 | ❌ | case 210 :64863-64864→937 Land Mine；place_v_ 兜底 → D-6 |
| v_212_snowballlauncher | 464 | pick:0 axe:— | null | 212 | ✅ | no-drop :65875；Check3x3 :53092 case212 :53184-53187→951 Snowball Launcher ≈ place_v_212 ✓ |
| v_216_firework | 465 | pick:0 axe:— | null | 216 | ⚠️ | no-drop :65877；Check1x2 :43377→970+style 四档烟花（:43496）；place_v_216 单件 → D-7 |
| v_244_bubblemachine | 466 | pick:0 axe:— | null | 244 | ✅ | no-drop :65893；Check3x2 :49190 case244 :49570-49572→1449 Bubble Machine ≈ place_v_244 ✓ |
| v_335_fireworksbox | 481 | pick:0 axe:— | null | 335 | ✅ | no-drop :65942；Check2x2 :48697-48700→2700 Fireworks Box ≈ place_v_335 ✓ |
| v_338_fireworkfountain | 482 | pick:0 axe:— | null | 338 | ✅ | no-drop :65944；Check1x2 :43500-43503→2738 Fountain ≈ place_v_338 ✓ |
| v_372_peacecandle | 483 | pick:0 axe:— | null | 372 | ❌ | case 372 :64680-64681→3117 Peace Candle；place_v_ 兜底 → D-6 |
| v_386_trapdooropen | 484 | pick:0 axe:— | null | 386 | ❌ | no-drop :65965；CheckTrapDoor :51622→3239 Trap Door（:51671）；本仓 sheet386 无放置物（3239 createTile=387）→placeableTiles 不含→**零返还** → D-8 |
| v_389_tallgateopen | 490 | pick:0 axe:— | null | 389 | ❌ | no-drop :65968；CheckTallGate :51683→3240 Tall Gate（:51735）；同上零返还 → D-8 |
| v_410_lunarmonolith | 491 | pick:0 axe:— | null | 410 | ⚠️ | no-drop :65977；Check2xX :38009→3536+fx/36 四档天塔柱（:38235-3538）；place_v_410 单件（key 亦名不副实：410=四柱天塔柱共用 tile）→ D-7 |
| v_419_logicgatelamp | 492 | pick:0 axe:— | null | 419 | ❌ | case 419 :65348-65361 fx/18→3602 熄/3618 亮/3663 故障；place_v_ 兜底 → D-6 |
| v_420_logicgate | 493 | pick:0 axe:— | null | 420 | ❌ | case 420 :65380-65403 fy/18→3603-3608 六逻辑门；place_v_ 兜底 → D-6 |
| v_423_logicsensor | 495 | pick:0 axe:— | null | 423 | ❌ | case 423 :65490-65510 fy/18→3613/3614/3615/3726/3727/3728/3729 七档感应器；place_v_ 兜底 → D-6 |
| v_424_wirepipe | 496 | pick:0 axe:— | null | 424 | ❌ | case 424 :64311-64312→3616 Junction Box；place_v_ 兜底 → D-6 |
| v_425_announcementbox | 497 | pick:0 axe:— | null | 425 | ✅ | no-drop :65982；CheckSign :43593 case425 :43777-43781→3617 Announcement Box ≈ place_v_425 ✓ |
| v_428_weightedpressureplate | 498 | pick:0 axe:— | null | 428 | ❌ | case 428 :65362-65378 fy/18→3630 橙/3632 青/3631 紫/3626 粉测重板；place_v_ 兜底 → D-6 |
| v_429_wirebulb | 499 | pick:0 axe:— | null | 429 | ❌ | case 429 :64317-64318→3629 Wire Bulb；place_v_ 兜底 → D-6 |
| v_440_gemlocks | 500 | pick:0 axe:— | null | 440 | ⚠️ | no-drop :65983；Check3x3Wall :44321 case440 :44546→3644-3650 逐宝石档（伴生 1523-1526 钥匙档）；place_v_440 单件 → D-7 |
| v_441_fakecontainers | 501 | pick:0 axe:— | null | 441 | ⚠️ | no-drop :65984；Check2x2Style case441 :52441-52448→GetItemDrop_FakeChests 逐 style（-1=不掉）；place_v_441 单件 → D-7 |
| v_442_projectilepressurepad | 502 | pick:0 axe:— | null | 442 | ❌ | case 442 :64185-64186→3707 Teal Pressure Pad；place_v_ 兜底 → D-6 |
| v_445_pixelbox | 503 | pick:0 axe:— | null | 445 | ❌ | case 445 :64314-64315→3725 Pixel Box；place_v_ 兜底 → D-6 |
| v_452_sillyballoonmachine | 504 | pick:0 axe:— | null | 452 | ✅ | no-drop :65987；Check3x3 case452 :53238-53241→3742 Silly Balloon Machine ≈ place_v_452 ✓ |
| v_455_partymonolith | 505 | pick:0 axe:— | null | 455 | ✅ | no-drop :65990；Check3x3 case455 :53252-53255→3747 Party Monolith ✓ |
| v_468_fakecontainers2 | 506 | pick:0 axe:— | null | 468 | ⚠️ | no-drop :66000；Check2x2Style case468 :52450-52457→GetItemDrop_FakeChests(secondType) 逐 style；place_v_468 单件 → D-7 |
| v_480_bloodmoonmonolith | 508 | pick:0 axe:— | null | 480 | ✅ | no-drop :66005；Check2xX :38239-38242→4054 Blood Moon Monolith ≈ place_v_480 ✓ |
| v_509_voidmonolith | 510 | pick:0 axe:— | null | 509 | ✅ | no-drop :66023；Check2xX :38247-38250→4318 Void Monolith ✓ |
| v_531_boulderstatue | 511 | pick:0 axe:— | null | 531 | ✅ | no-drop :66036；Check2xX→4355 Boulder Statue ≈ place_v_531 ✓ |
| v_564_plasmalamp | 514 | pick:0 axe:— | null | 564 | ✅ | no-drop :66057；Check2x2 :48609-48611→4553 Plasma Lamp ≈ place_v_564 ✓ |
| v_565_fogmachine | 515 | pick:0 axe:— | null | 565 | ✅ | no-drop :66058；Check2x2 :48612-48614→4552 Fog Machine ✓ |
| v_593_volcanosmall | 516 | pick:0 axe:— | null | 593 | ❌ | case 593 :64493-64494→4868 Mini Volcano；place_v_ 兜底 → D-6 |
| v_594_volcanolarge | 517 | pick:0 axe:— | null | 594 | ✅ | GetItemDrops no-drop :66071；返还走 Check2x2 :48615-48617→4869 Large Volcano ≈ place_v_594（4869 createTile=594 命中 placeable 门）机制不同已核 |
| v_330_copper_coin_pile | 613 | pick:0 axe:— | null | 330 | ✅ | case 330 :64197-64198→71 铜币；CoinPiles 表 ✓ |
| v_331_silver_coin_pile | 614 | pick:0 axe:— | null | 331 | ✅ | case 331 :64200-64201→72 银币 ✓ |
| v_365_silk_rope | 637 | pick:0 axe:— | null | 365 | ❌ | case 365 :64173-64174→3077 Silk Rope；place_v_ 兜底 → D-6 |
| v_366_web_rope | 638 | pick:0 axe:— | null | 366 | ❌ | case 366 :64176-64177→3078 Web Rope；place_v_ 兜底 → D-6 |
| v_504_mystic_snake_rope | 705 | pick:0 axe:— | null | 504 | ⚠️ | case 504 共享 no-drop :66020 且原版无放置物（vanilla.json createTile=504 空）→破坏**无返还**；本仓 1×1 通用分支对 v_ 键无条件 place_v_（Game.ts :12921）=多余返还且可无限刷 → D-9 |
| v_655_plantera_thorns | 806 | pick:0 axe:— | null | 655 | ✅ | 共享 no-drop :66115 ✓ |
| v_697_decorative_cobweb | 845 | pick:0 axe:— | null | 697 | ❌ | case 697 :64731-64732→5471 Decorative Cobweb；place_v_ 兜底 → D-6 |
| leaves | 58 | pick:0 axe:0 | MISSING | —(自绘) | 📋 | 原创自绘树冠（无原版 tile 基线——原版叶冠属 tile 5 帧域）；decor 秒清+无掉落与原版语义不冲突，登记备查 |
| crystal_heart | 140 | pick:0 axe:— | 29 | 12(VAN) | ✅ | tile12=水晶心；case 12 共享 no-drop :65805，返还走 CheckOrb :54187 case12 :54252-54254→29 Life Crystal——本仓 def.drop=29（object 分支直掉）端到端 vid 正确（触发机制不同已核；55 镐力门 1456 GetPickaxeDamage :52981-53075 无 tile12 档=本仓 pick:0 同） |

#### 分区 D 审计发现（子代理）

> 行号口径：KillTile_GetItemDrops/共享 no-drop 表/Check\* 族均 **1456 行号**（:64012 起）；D 区全族 1457 = 1456 **+465** 且逐字节同（已抽 7 段 diff：case3..382 块/火把/药草/61·74·71·72/梁柱/逻辑·地雷块/no-drop 表/ShouldDropSeeds 全等）。掉落贴图维度全绿：本区所涉全部 vid（8/25/5/283/27/29/313-319/2357-2358/307-312/331/223/208/195/194/183/60/2887/2996/965/85/480/4717-4721/4554/71-74/3077/3078/4868/5471/713/3117/937/3616/3629/3725/3707/276/3602-3608/3613-3615/3726-3729/3626/3630-3632/3663/523/974/1245/1333/2274/3004/3045/3114/4383-4388/5293/5353/427-433 共 98 个）全数存在于 vanilla.json items 表+图集矩形，零缺失。

- **D-1 ⚠️ 运行期 decor 失撑链缺（本区最大横切缺口）**：原版 decor 支撑亡杀全走 TileFrameImportant（:85703）分派的 Check\* 族——PlantCheck（:81280，派发 ：85970-85981，族={3,24,61,71,73,74,110,113,201}，失配即 KillTile 或**变型**到新地面族）、CheckAlch（:45981，tileAlch default 支 ：86573-86577，药草 82/83/84 逐阶段锚表）、CheckCatTail（:58764，:85710，519 水深/底质）、CheckSunflower（:53744，27 须草族实心底）、CheckOrb（:54187，12/31/639/696）、CheckMB（:51221，35/139）、Check1xX（:37802，92）、CheckTrapDoor/TallGate（:51622/:51683）、Check2xX（:38009，410/480/509/531）、Check2x2（:48405，126/142/143/173/335/564/565/594）、Check3x2（:49190，244）、Check3x3（:53092，212/452/455）、Check3x3Wall（:44321，440）、Check2x2Style（:52430 附近，441/468）、CheckCannon（:50804）、Check1x1（:45243，210/428/593）、Check1x2（:43377，20/216/338）、CheckLogicTiles（:45288，419/420/423/424/429/445）、CheckOnTable1x1（:43548，174/372）。本仓 onTileChanged 只挂 checkTorchDetach（:3633）/checkVineAt（:3656，八藤）/checkFurnitureSupport（:3659）——而 checkFurnitureSupport 头部 `def.decor` 早退（:23432）把 **D 区全族 decor:true 排除在外**：挖掉植物/药草/向日葵/树苗/蘑菇树/香蒲脚下格、或 decor 家具（南瓜灯/路灯/迪斯科球/八音盒/泵/烛台/炮/雪球发射器/泡泡机/烟花族/单色石/广播盒/宝石锁/假容器/测重板/逻辑件/像素盒/气球机/派对石/火山/水晶心…）的支撑格 → **悬空不塌不掉**。生成期引擎 FinalCleanupPass.genSquareTileFrame 已有 PlantCheck/CheckAlch/CheckOrb 臂（LiquidSim.ts :282-289 注），但仅 gen 侧消费（WorldGen.ts :1972/LiquidSim :316）——运行期复用同一引擎（挂 onTileChanged，destroyObject 闸同原版）即闭环。原版**无**支撑语义的 15 件非 frameImportant 块（697/353/213/214/365/366/504/330-333/124/561/574-578，Main.cs tileFrameImportant 全 0）悬空保留=原版同款，勿误修。
- **D-2 📋 attach 字段死代码**：TileDef.attach（'ground'|'wall'，tiles.ts :20）全仓 **0 处赋值、0 处消费**——D 区 90 件无一标注附着面。若接 D-1，支撑判据建议按原版 Check\* 锚表走而非此字段（字段可顺手删或补注）。
- **D-3 ⚠️ 火把 style 掉落表缺（24 档）**：case 4 :65106-65164 `fy/22`→0=8/8=523/9=974/10=1245/11=1333/12=2274/13=3004/14=3045/15=3114/16=4383/17=4384/18=4385/19=4386/20=4387/21=4388/22=5293/23=5353/default=426+style（427-433 彩炬）。本仓放置侧已写 24 style（Torch.ts BIOME_TORCH_ITEM + 火把神药水换炬 Game.ts :23321），破坏侧 breakTile 1×1 尾与 checkTorchDetach（:23381-23394）恒掉普通火把 8——咒火炬掉回火把=刷炬漏洞兼 vid 错。修法=vanillaStyleDrops 补 Torches 表+styleFromFrame[4]=fy/22，checkTorchDetach 同表取 vid。
- **D-4 ⚠️ 割藤 cordage 掉落未接（3 件）**：case 52/62/382 :65087-65092 `Next(2)==0 && GetPlayerForTile.cordage → 2996 Vine Rope`。本仓 killTileDropItems 不含 52/62/382，TILE_CUT 分支清格无掉落；3068 植物纤维绳索指南物品已注册但 cordage 效果（equipStats）全仓未接——戴指南割藤应 1/2 掉 Vine Rope（藤绳=前期垂直通行获取链）。
- **D-5 ⚠️ 树苗多余掉落**：case 20 共享 no-drop :65811 且 Check1x2 :43377 无 type20 返还支——原版挖树苗**无返还**（橡实种下不退）。本仓 def.drop=27 经 object 分支掉橡实（acorn_sapling w1h2 走 object 支 multiTileDropKey :535-541 直读 def.drop）。修法=drop:null（object 支 placeableTiles 门会放行 place_v_20? 否——20 的 placeableTiles 键即 'acorn_sapling'（item 27 createTile=20），故须显式 drop:'' 或加 no-drop 旗标，勿只改 null）。
- **D-6 ❌ GetItemDrops 直掉 vid 未接（26 件，现掉 place_v_ 合成件）**：353→2996（:64170）/124→480（:64608）/213→965（:64518）/214→85（:64515）/561→4554（:64417）/574→4717（:64420）/575→4718（:64423）/576→4719（:64426）/577→4720（:64429）/578→4721（:64432）/174→713（:64689）/210→937（:64863）/372→3117（:64680）/419→3602·3618·3663（:65348）/420→3603-3608（:65380）/423→3613-3615·3726-3729（:65490）/424→3616（:64311）/428→3626·3630-3632（:65362）/429→3629（:64317）/442→3707（:64185）/445→3725（:64314）/593→4868（:64493）/697→5471（:64731）/365→3077（:64173）/366→3078（:64176）。功能等价（place_v_ 可再放置同款）但 vid/名称/图标非原版物品，与 A/B 区 ❌ 同口径；修法=每件 tiles.ts drop:<vid> 一处（全部 vid 已验在 vanilla.json）。
- **D-7 ⚠️ style 档掉落未接（7 件，place_v_ 单件 vs 原版逐 style）**：炮 209（CheckCannon :50869-50878→928/1337/3369/3664 五档）/烟花 216（Check1x2 :43496→970+style 四档）/天塔柱 410（Check2xX :38235→3536+fx/36 四档；def key 'lunarmonolith' 名不副实）/宝石锁 440（Check3x3Wall :44546→3644-3650 七档+1523-1526 伴生）/假容器 441·468（Check2x2Style :52441/:52450→GetItemDrop_FakeChests 逐 style，-1 档不掉）。修法=vanillaStyleDrops 增五表+styleFromFrame（209 fx/54? 按 CheckCannon num2 推导、410 fx/36、440/441/468 按 Check\* 帧式）。
- **D-8 ❌ 活板门/高门开态零返还**：386→3239 Trap Door（CheckTrapDoor :51668-51671）、389→3240 Tall Gate（CheckTallGate :51732-51735）——原版破坏任一态整件清+掉**关闭态**放置物。本仓 sheet 386/389 无放置物（3239/3240 createTile=387/388）→ multiTileDropKey placeable 门不命中→零掉落。修法=def.drop 直填 3239/3240（或门链按 386/389 扩 Doors 表）。
- **D-9 ⚠️ v_504_mystic_snake_rope 多余返还（1×1 v_ 无条件兜底口）**：原版 case 504 no-drop :66020 且 createTile=504 无物品（蛇绳不可再得）→破坏无返还；本仓 1×1 通用分支 `def.key.startsWith('v_')` **无条件**掉 place_v_504（Game.ts :12921）——与 object 分支的 placeableTiles 门（:535-541）不同判据，可无限刷放置物。修法=1×1 尾同接 placeableTiles 门（波及面=全部 1×1 无物品 v_ 装饰，需按 D-6 清单先行填 vid 再收口）。
- **D-10 📋 TILE_CUT 两副本缺 454/254/236**：Main.cs :8270（454 猪隆纳彩罐）/:10155（254 南瓜株）/:10158（236 生命果株）三件 tileCut=true——原版任意挥击割除；本仓 TILE_CUT_VANILLA（Game.ts :457-460）与 TILE_CUT_SHEETS（tiles.ts :961-964）均 38 项缺这三件（件属 B/E 区，表共享故记此）。另两副本并存待合并（tiles.ts :960 自注）。
- **D-11 📋 药草时辰门两微差**：IsAlchemyPlantHarvestable :66205-66231 style4=`Main.raining || Main.cloudAlpha > 0f`（本仓仅 weather.raining）、style5 深度门用 `y > Main.worldSurface`（本仓 groundLevel）且 remix 分支（:66222-66226 `y < maxTilesY-350`）未接。影响=特定时辰收获判定偶差，掉落结构本身 ✅。
- **D-12 📋 镐可清 tileAxe 族 decor（3 件）**：v_5_trees/v_80_cactus/v_72_mushroom_tree decor:true——镐因 TILE_AXE_SHEETS（Game.ts :472）不匹配走 decor 秒清支（:11872-11877）可砍树/仙人掌/蘑菇树；原版 tileAxe 格镐不伤（Player.cs :45039 排除门，树族批已记）。'tree' 干本体非 decor 不受影响。修法=decor 支对 TILE_AXE_SHEETS 排除 'pick'。
- **跨区备注（非 D 件，killTileDropItems 同函数两处）**：(a) **v_110_hallow_short_plants（E 区）**多掉种子——原版 case 110 :65063-65067 仅 fx144→5 **无** ShouldDropSeeds 支，本仓 Game.ts :12360 把 110 并进 3 的种子支；(b) **v_227_dye_plants（B 区）**缺 num 8-11→3385+n-8 档（:65103-65109），本仓 :12375 只做 `1107+fx/34`（style 8-11 掉 1115-1118 错档）。

**分区 D 总结**（90 项，按行计）：确认 46 / 偏差（⚠️）12 / 未实装（❌）27（25 件 GetItemDrops 直掉 vid 未接现走 place_v_ 合成件见 D-6 + 活板门 386/高门 389 开态零返还 2 件见 D-8）/ 备案（📋）4（tallgrass 死字段、树/蘑菇树镐清、leaves 原创块）/ 主会话已记 1（v_528）。掉落贴图维度全绿（98 vid 全存在零缺失）；decor 秒清维度全对（90/90 decor:true，TILE_CUT 割除族与原版 38 项全对齐，唯 454/254/236 三件表缺记 D-10）；1456↔1457 全族逐字节同（+465 平移）。

### 分区 E（39 项）

功能方块（宝箱/门/平台/砧/熔炉/祭坛/机关…≤200 sheet 非 style 族）。对账点 = 破坏门(空箱才可拆/门锁)+掉落。

| 方块 | tiles.ts 行 | 挖掘条件(pick/axe) | 掉落(vid) | 贴图 sheet | 确认 | 1457 基线行 |
|---|---|---|---|---|---|---|
| tree | 57 | pick:-1(不可挖) axe:0 | 9 | 5 | ✅ | case 5 :65225-65260 → KillTile_GetTreeDrops :66245（基座草族定木种+bonus 掷+树冠橡实）;本仓 dropVanillaTreeLoot 1:1（Game.ts:13046 注） |
| furnace | 64 | pick:0 axe:— | 33 | 17 | ✅ | 17 在 no-drop 表 :65806;Check3x2 case 17 :49613-49615 → **33 Furnace**;def.drop=33 直掉 ✓ |
| chest | 66 | pick:0 axe:— | 48 | 21 | ✅ | 空箱门=Chest.CanDestroyChest（shouldTileSurviveAt+chestDestroyableAt Game.ts:528/:12443 ✓）;掉落=CheckChest :57938 → GetItemDrop_Chests fx/36（:41596）;本仓 styleDropVidOfFrames(21) Chests 表 ✓;承载位保护 21∈PROTECTED_ABOVE ✓ |
| v_29_piggy_bank | 154 | pick:0 axe:— | MISSING | 29 | ❌ | 29 no-drop 表 :65808;Check2x1 case 29 :47255-47258 → **87 Piggy Bank**（+Sound 13）;本仓掉 place_v_29 合成件;桌面支撑门 29/103/462（:47030-47040 tileTable）未单列 |
| v_51_cobweb | 174 | pick:0 axe:— | null | 51 | ❌ | case 51 :64740-64741 → **150 Cobweb**;且 :63890-63892 蛛网墙 wall==62 时 3/4 无掉落;本仓 51∈TILE_CUT 走割草支→killTileDropItems 无 51 档=**零掉落**（连 150 也缺） |
| v_165_cave_decos | 233 | pick:0 axe:— | null | 165 | ✅ | 165 no-drop 表 :65850;CheckStalactite :54146 无掉落;本仓多格门 placeable 落空→''=无掉落 ✓;tileNoFail/`165→num=100`（Player.cs:53013）✓ |
| v_184_moss_plants | 234 | pick:0 axe:— | null | 184 | ✅ | 184 no-drop 表 :65851 + Main.tileCut（可割）;TileFrame case 184 :85890 苔藓锚检;本仓 TILE_CUT→割草支无掉落 ✓ |
| v_185_small_decos | 236 | pick:0 axe:— | null | 185 | ❌ | CheckPile :46891（fy!=18 行无掉落）/Check2x1 case 185 :47180-47232（fy==18 行按 fx 段掉 71/72/73 钱币+181/180/177/179/178/182 宝石×Next(1,4)）;饵料虫掷 KillTile_DropBait :66416 已接（DropBait.ts 185 ✓）;本仓恒掉 place_v_185 合成件 |
| v_187_decos_3x2_group_2 | 238 | pick:0 axe:— | null | 187 | ✅ | Check3x2 case 187 :49838-49848：fx 918-970（style17 圣地之剑）→ Next(30)==0 **4144 Terragrim** else **989 Enchanted Sword**;其余 style 无掉落;本仓 breakShrineSword 1:1 ✓ |
| v_105_statue | 242 | pick:0 axe:— | null | 105 | ❌ | 105 no-drop 表;Check2xX case 105 :38133-38139 → **StatueStyleToItem(fx/36+(fy/54%3)\*55)** :37944（51 件雕像物品 360/52/438…）;本仓恒掉 place_v_105（style0 盔甲雕像） |
| v_186_decos_3x2 | 243 | pick:0 axe:— | null | 186 | ✅ | Check3x2 case 186 :49726-49836：fx<864 无 / ≤954→71 / ≤1062→72 / ≤1170→73（掷串全链）;本仓 coinBandVid+spawnCoinBand 段界/掷串逐条对拍 ✓;饵料虫 186 fx378-700 已接 |
| v_178_gems | 245 | pick:0 axe:— | null | 178 | ✅ | case 178 :65545-65569：fx/18 → 0紫181/1黄180/2蓝177/3翠179/4红178/5钻182/6琥珀999;本仓 Game.ts:12937 同序数组 1:1 ✓ |
| v_26_altars | 253 | pick:-1 axe:— | null | 26 | 📋 | 26 no-drop 表（砸祭坛无掉落）✓;Check3x2 case 26 :49451-49455 → SmashAltar（困难矿轮换）;镐门=Player.cs:45058（锤≥80+hardMode,否则 ByOther(4) 半血反噬）;本仓 tryMine 祭坛支 1:1 ✓（防误修：勿给 26 填 drop） |
| v_82_herbs_sprout | 255 | pick:0 axe:— | null | 82 | ✅ | 82 no-drop 表 :65810（幼株无掉落,原版语义）;本仓 TILE_CUT→割草支 killTileDropItems 无 82 档=无掉落 ✓ |
| v_135_pressure_plates | 257 | pick:0 axe:— | null | 135 | ❌ | case 135 :65620-65645：fy/18 → 0红529/1绿541/2灰542/3棕543/4蓝852/5黄853/6蜥蜴1151;本仓恒掉 place_v_135（style0 红压板）;压板无注册表（原版按坐标扫）无注销债 |
| v_91_banners | 258 | pick:0 axe:— | null | 91 | ❌ | CheckBanner case 91 :46176-46268：style=fx/18+(fy/54)\*111 → 分段 337+n/785+n/838+n/1441+n/1448+n/1593+n/2788+n/3183+n/3323/3516/3559/4253/4602/4392/4668+n/5352/5497/5498/5651/5672/5673;本仓恒掉 place_v_91（重放置恒 style0 哥布林旗=旗 buff 张冠李戴） |
| v_50_books | 260 | pick:0 axe:— | null | 50 | ❌ | case 50 :65709-65716：fx==90（水书伪装帧）→ **165 Water Bolt**,else **149 Book**;本仓 sheet50 特判写在多格支（Game.ts:12768）而 def w1×h1 走 1×1 尾→恒掉 place_v_50=**死分支**,水书挖取链断 |
| v_141_explosives | 281 | pick:0 axe:— | null | 141 | ❌ | case 141 :64815-64816 → **580 Explosives**（镐挖只掉物不爆;爆炸仅在电线触发 Wiring.cs:2039→弹 108）;本仓掉 place_v_141 合成件（wiring case141 已接 ✓） |
| v_86_loom | 291 | pick:0 axe:— | null | 86 | ❌ | 86 no-drop 表;Check3x2 case 86 :49621-49622 → **332 Loom**;本仓掉 place_v_86 合成件 |
| v_81_coral | 295 | pick:0 axe:— | null | 81 | ❌ | case 81 :64770-64771 → **275 Coral**（81 非 tileCut,镐挖）;本仓 1×1 尾掉 place_v_81 合成件 |
| v_136_switch | 296 | pick:0 axe:— | null | 136 | ❌ | case 136 :64765-64766 → **538 Switch**;本仓掉 place_v_136 合成件 |
| v_103_bowls | 299 | pick:0 axe:— | null | 103 | ❌ | Check2x1 case 103 :47260-47276：fx/36 → 0碗356/1王朝碗2235/2精致餐具2242/3玻璃碗2243（+Sound13）;桌面支撑门同 29;本仓恒掉 place_v_103（style0） |
| v_129_crystal_shard | 308 | pick:0 axe:— | null | 129 | ❌ | case 129 :65031-65039：fx≥324（大晶簇 style18-23）→ **4988 Gelatin Crystal**,else **502 Crystal Shard**;本仓掉 place_v_129 合成件=两档全缺;129∈tileNoFail ✓;生长 pass hardUpdateWorld :69668-69710 未移植（晶簇仅 wld 导入） |
| v_106_sawmill | 325 | pick:0 axe:— | null | 106 | ❌ | 106 no-drop 表;Check3x3 case 106 :53179-53180 → **363 Sawmill**;本仓掉 place_v_106 合成件 |
| v_97_safe | 329 | pick:0 axe:— | MISSING | 97 | ❌ | 97 no-drop 表;Check2x2 case 97 :48688-48690 → **346 Safe**;本仓 drop 键缺省→place_v_97 合成件 |
| v_110_hallow_short_plants | 337 | pick:0 axe:— | null | 110 | ⚠️ | case 110 :65056-65062：仅 fx==144 → **5 蘑菇**,**无种子档**（与 case 3 不同!）;本仓 killTileDropItems 把 3/110 同支→fx!=144 时掉 283 草籽=多掉;蘑菇档 ✓ |
| v_125_crystal_ball | 341 | pick:0 axe:— | null | 125 | ❌ | 125 no-drop 表;Check2x2 case 125 :48724-48726 → **487 Crystal Ball**;本仓掉 place_v_125 合成件 |
| v_113_hallow_tall_plants | 349 | pick:0 axe:— | null | 113 | ✅ | 113 no-drop 表 :65851（神圣高株无掉落）+tileCut;本仓 TILE_CUT→无掉落 ✓ |
| v_144_timers | 389 | pick:0 axe:— | null | 144 | ❌ | case 144 :65640-65658：fx 0/18/36/54/72 → **583 1秒/584 3秒/585 5秒/4484 半秒/4485 四分秒**;本仓恒掉 place_v_144（style0 1秒计时器） |
| v_132_lever | 392 | pick:0 axe:— | null | 132 | ❌ | 132 no-drop 表;Check2x2 case 132 :48738-48740 → **513 Lever**;本仓掉 place_v_132 合成件（拉杆 wiring 功能已接） |
| v_131_inactivestoneblock | 455 | pick:0 axe:— | null | 131 | ❌ | case 131 :64858-64860 → **512 Inactive Stone Block**（130 激活石→511 :64856）;本仓掉 place_v_131 合成件 |
| v_77_hellforge | 524 | pick:65 axe:— | null | 77 | ❌ | 77 no-drop 表;Check3x2 case 77 :49617-49618 → **221 Hellforge**;本仓掉 place_v_77 合成件;⚠️镐门：原版 65 门仅地下世界层生效（Player.cs:53011-53014 `y>=UnderworldLayer`）,def.pick:65 全域生效=偏严;承载位保护 77∈PROTECTED_ABOVE ✓（含 !hardMode 门 :62496 本仓 hasReasonToReturnEarly 已接） |
| v_55_signs | 525 | pick:0 axe:— | null | 55 | ❌ | CheckSign default :43787-43788 → **171 Sign**（85 墓碑走 321/1173+/3229+ 档）;本仓掉 place_v_55 合成件;牌面注销 KillSign ✓（Game.ts:12817 signs filter）;⚠️wld 导入无 55 映射（导入档告示牌丢失,另案） |
| v_36_presents | 533 | pick:0 axe:— | null | 36 | ❌ | case 36 :64548-64550 → **1869 Present**（镐挖掉礼盒;开礼盒走右键战利品链另案）;本仓掉 place_v_36 合成件;⚠️wld 导入无 36 映射 |
| v_99_trash_can | 536 | pick:0 axe:— | null | 99 | 📋 | Check2x2 case 99 :48696-48697 → **348 Trash Can**;但原版物品 348 createTile=**21**+placeStyle 6（Item.cs:5444-5455,垃圾桶=箱 21 style6,掉落走 Chests[6]=348 ✓本仓已通）;独立 tile99 def 无放置/导入路径=死 def,若激活需补 348 |
| v_102_throne | 537 | pick:0 axe:— | null | 102 | ❌ | 102 no-drop 表;Check3x4 case 102 :50162-50164 → **355 Throne**;本仓掉 place_v_102 合成件;⚠️wld 导入无 102 映射 |
| v_128_mannequin_legacy | 542 | pick:0 axe:— | null | 128 | 📋 | 128 no-drop 表;CheckMan :46539-46590 → **498 Mannequin**（:46589）;另 KillTile 头 :63606-63640 frameX≥100 逐件掉已陈列盔甲（headType/bodyType/legType）+GetPickaxeDamage :53064-53074 带甲 num=0+blockMouse 不可挖;本仓 470 新模特走 TE 挂物族 ✓,128 旧模特无放置/导入路径=死 def |
| v_133_forges | 543 | pick:0 axe:— | null | 133 | ❌ | 133 no-drop 表;Check3x2 case 133 :49631-49638：fx≥54 → **1221 Titanium Forge**,else **524 Adamantite Forge**;本仓恒掉 place_v_133（style0 精金熔炉,钛金档错）;⚠️wld 导入无 133 映射 |
| v_171_christmas_tree | 558 | pick:0 axe:— | null | 171 | ✅ | CheckXmasTree :39647（整树清+掉 **1873**）+KillTile case 171 :65319（锚 fx≥10 → dropXmasTree ×4 :39327 位段→1874+n/1878+n/1884+n/1895+n）;本仓 breakXmasTree+xmasDecorItem 1:1 ✓ |


#### 主会话预审发现（E 区，待并入子代理报告）

- ⚠️ 水晶碎片基座 v_129_crystal_shard：1457 :65031-65039 `case 129: frameX>=324 → drop 4988, else drop 502`——本仓 drop:null = 两档掉落（水晶碎块 502/夜明水晶 4988）全缺。
- 📋 恶魔祭坛 v_26_altars：原版砸祭坛不走掉落（走 Hardmode 变换链，已接 :5687 smash 链）——drop:null 正确，确认 📋（防误修）。
- ❓ v_131_inactivestoneblock（非激活石）/v_128_mannequin_legacy（旧模特）：1457 case 128-131 需子代理核对（128 模特掉 498? 130/131 = 511/512 世界之杖类）。

### 分区 E 审计发现（子代理）

**主会话 3 项预审复核结论（全部准确）**

1. **v_129_crystal_shard（水晶碎片基座）❌ 属实**：1457 case 129（:65031-65039）`frameX>=324 → 4988 Gelatin Crystal, else 502 Crystal Shard` 两档全缺——本仓 1×1 尾掉 `place_v_129_crystal_shard` 合成件。补三点主会话未及的背景：(a) 大晶簇（style 18-23,fx≥324）= 凝胶水晶（女王史莱姆召唤物）,原版由 hardUpdateWorld 生长 pass 播种（:69668-69710,1/50 概率大档）——该 pass 本仓未移植,晶簇仅经 wld 导入存在（WldImport.ts:303 copyFrame）,故 4988 档现状不可达但导入档可达;(b) fx≥324 的"大晶簇"判定在 SceneMetrics.ts:232 / Enemy.ts:12019（探矿仙子/金属探测器算宝藏）已按原版接好,掉落侧补档时勿动这两处;(c) 修复=tiles.ts 填 drop 无法表达双档（fx 分档）,需 Game.ts 1×1 尾加 sheet129 分支（同 178 宝石支先例）。
2. **v_26_altars（恶魔祭坛）📋 无掉落正确**：1457 case 26 在共享 no-drop 表（:65807）,砸碎走 Check3x2 case 26 → SmashAltar（:49451-49455,困难矿三档轮换+公告）。挖掘门 1:1 已接：镐不可伤（tryMine 祭坛支前置拦截,Game.ts:12448）+ 锤≥80 且 hardMode → smashAltar + 不足时 ByOther(4) 半血反噬（Player.cs:45058-45064）。**勿"修"成掉落**。
3. **v_131/v_128 核对结果**：case 130 → **511 Active Stone Block**、case 131 → **512 Inactive Stone Block**（:64856-64860,非"世界之杖"）;本仓 v_131 走 1×1 尾掉 place_v_131 合成件 → ❌（应 512）。case 128 模特本体无 KillTile 掉落（no-drop 表）,掉 **498 Mannequin** 走 CheckMan :46589;另有两项附属语义：KillTile 头 :63606-63640 frameX≥100 时逐件掉已陈列盔甲（headType/bodyType/legType）、GetPickaxeDamage :53064-53074 带甲 num=0+blockMouse（带甲不可挖）。本仓 128 为死 def（无放置物品——498 createTile=470;wld 导入无 128 映射）,新模特链已由 v_470 TE 挂物族承担 → 📋 备案不修。

**横切结论（适用于本区 ❌ 项）**

1. **两条掉落路径、两种偏差形态**：(a) 多格件（w×h>1）走 object 分支 `multiTileDropKey`（Game.ts:535）——`drop:null/undefined` 且 tile 无真实原版放置物品 → `''`=真无掉落（165/128/99 即此,与原版一致）;有放置物品 → 掉 `place_v_*` 合成件（❌ 主形态）。(b) 1×1 件走通用尾（Game.ts:12930-12945）——**无 placeable 门**,v_ 键 null 恒掉 `place_v_*` 合成件（131/135/136/141/144/81/36/110/185/50/129 即此）。合成件可再放置同款 tile（功能等价）但 vid/名称/价值/图签非原版件,且**配方系统按 vid 计数不计合成件**（分区 A/B S1 已证）。
2. **修复面**：单档族= tiles.ts 填 `drop:<vid>`（87/150/275/332/346/355/363/487/513/538/580/1869/221/171/512）;多档族= Game.ts 加帧分档支（同 178/50 先例）：105（StatueStyleToItem 51 档）/91（CheckBanner 分段表）/135（fy/18 七档）/144（fx 五档）/103（fx/36 四档）/133（fx≥54 二档）/129（fx≥324 二档）/50（**把现有 sheet50 死分支从 object 支移到 1×1 尾**——v_50_books w1×h1 永远到不了 object 支,现分支不可达）/185（fy==18 行 fx 段钱币+宝石,其余无掉落）。所涉 vid 全部验证存在于 vanilla.json items 表+图集矩形（见分区 F）,无缺图风险。
3. **掉落贴图维度全绿**：本区涉及的全部 vid（含应掉未掉的 87/150/171/221/332/346/348/355/356/363/487/498/502/512/513/524/529/538/541/542/543/580/583/584/585/852/853/1151/1221/1869/2235/2242/2243/4484/4485/4988/989/4144/1873-1901/71-73/177-182/999/5/283）逐一验证存在于 `public/sprites/vanilla.json` items 表且带 ix/iy/iw/ih 图集矩形（脚本全量核过,零缺失）。
4. **破坏门（挖掘条件）维度**：空箱门（Chest.CanDestroyChest → shouldTileSurviveAt + chestDestroyableAt,Game.ts:528/:12443）✓;承载位保护（21/26/72/77/88/467/488 上方件,PROTECTED_ABOVE_SHEETS = CanKillTile :62293-62300 全表）✓;祭坛镐门/锤反噬 ✓;77 地狱熔炉 pre-hardMode 上方保护门（CheckTileBreakability_HasReasonToReturnEarly :62494-62495）经 Mounts.ts hasReasonToReturnEarly 已接 ✓。**唯一缺口见下 ❌ 附加#1（门锁）**。

**❌ 未实装/偏差明细**

| # | 方块 key | 问题 | 1457 行号 | 建议修复 |
|---|---|---|---|---|
| 1 | （横切·门）door_closed 锁门挖掘门缺失 | 原版 CanKillTile case 10 `IsLockedDoor → return false`（:62321-62325,神庙锁门镐/锤均不可拆,须 Temple Key 解锁）;本仓仅钻头链有此门（Mounts.ts canKillTileAt :549/:664）,**常规镐挖路径（tryMine→tileHitDamage→breakTile）无锁门门**——锁门可被直接挖掉（掉落侧 Doors 表 style11=0 不掉,但方块被拆=绕过钥匙门） | WorldGen.cs:62321-62325 / 69248-69255 | tryMine 或 tileHitDamage 加 `isLockedDoor(st,tx,ty) → dmg=0`（复用 world/Door.ts isLockedDoor,与 Mounts.ts 同源） |
| 2 | v_51_cobweb | 割草支无掉落档——原版恒掉 150（蛛网墙 wall==62 时 3/4 无掉落 :63890-63892） | :64740-64741 | killTileDropItems 加 51 档：`dropId=150`,wall==62 时 1/4 掷 |
| 3 | v_50_books | sheet50 特判在 object 支为**死分支**（def w1×h1）,水书帧 fx==90 应掉 165 Water Bolt | :65709-65716 | 特判移到 1×1 尾（或 1×1 尾加 sheet50 同款） |
| 4 | v_129_crystal_shard | 两档掉落全缺（502/4988）,见预审复核#1 | :65031-65039 | 1×1 尾加 sheet129 支：fx≥324→4988 else 502 |
| 5 | v_105_statue | 51 档雕像物品按 StatueStyleToItem(fx/36+(fy/54%3)*55),现恒掉 place_v_105 | :38133-38139 / :37944 | object 支加 sheet105 分档（或 vanillaStyleDrops 增表） |
| 6 | v_91_banners | 33+ 旗物品按 CheckBanner 分段表,现恒掉 place_v_91（重放置恒 style0 哥布林旗→旗 buff 张冠李戴） | :46176-46268 | object 支加 sheet91 分档（style=fx/18+(fy/54)*111） |
| 7 | v_135_pressure_plates | 七档压板 529/541/542/543/852/853/1151（fy/18）,现恒掉 place_v_135 | :65620-65645 | 1×1 尾加 sheet135 分档 |
| 8 | v_144_timers | 五档计时器 583/584/585/4484/4485（fx 0/18/36/54/72）,现恒掉 place_v_144 | :65640-65658 | 1×1 尾加 sheet144 分档 |
| 9 | v_103_bowls | 四档碗 356/2235/2242/2243（fx/36）,现恒掉 place_v_103;桌面支撑门（29/103/462 tileTable :47030-47040）未单列 | :47260-47276 | object 支加 sheet103 分档;支撑门随 29 一并补 |
| 10 | v_133_forges | fx≥54 → 1221 钛金熔炉,else 524 精金熔炉;现恒掉 place_v_133（钛金档错） | :49631-49638 | object 支加 sheet133 二档 |
| 11 | v_185_small_decos | fy==18 行按 fx 段掉 71/72/73 钱币+六宝石×Next(1,4)（:47180-47232）,fy!=18 行无掉落;现恒掉 place_v_185 | :46891-46960 | 1×1 尾加 sheet185 帧段支（段界 576/612/648/684/720/756/792/828/864,步 34） |
| 12 | v_29_piggy_bank | 应掉 87（Check2x1 case 29 + Sound13）;现掉 place_v_29;桌面支撑门同 #9 | :47255-47258 | tiles.ts 填 drop:87 |
| 13 | v_97_safe | 应掉 346;现掉 place_v_97 | :48688-48690 | tiles.ts 填 drop:346 |
| 14 | v_125_crystal_ball | 应掉 487;现掉 place_v_125 | :48724-48726 | tiles.ts 填 drop:487 |
| 15 | v_132_lever | 应掉 513;现掉 place_v_132 | :48738-48740 | tiles.ts 填 drop:513 |
| 16 | v_136_switch | 应掉 538;现掉 place_v_136 | :64765-64766 | tiles.ts 填 drop:538 |
| 17 | v_141_explosives | 应掉 580（镐挖不爆,爆炸仅电线支 Wiring.cs:2039→弹 108,本仓已接）;现掉 place_v_141 | :64815-64816 | tiles.ts 填 drop:580 |
| 18 | v_86_loom | 应掉 332;现掉 place_v_86 | :49621-49622 | tiles.ts 填 drop:332 |
| 19 | v_106_sawmill | 应掉 363;现掉 place_v_106 | :53179-53180 | tiles.ts 填 drop:363 |
| 20 | v_77_hellforge | 应掉 221;现掉 place_v_77（另见 ⚠️#2 镐门） | :49617-49618 | tiles.ts 填 drop:221 |
| 21 | v_55_signs | 应掉 171;现掉 place_v_55（牌面注销链 ✓ 已接） | :43787-43788 | tiles.ts 填 drop:171 |
| 22 | v_102_throne | 应掉 355;现掉 place_v_102 | :50162-50164 | tiles.ts 填 drop:355 |
| 23 | v_131_inactivestoneblock | 应掉 512;现掉 place_v_131 | :64858-64860 | tiles.ts 填 drop:512 |
| 24 | v_81_coral | 应掉 275（81 非 tileCut 镐挖）;现掉 place_v_81 | :64770-64771 | tiles.ts 填 drop:275 |
| 25 | v_36_presents | 应掉 1869;现掉 place_v_36 | :64548-64550 | tiles.ts 填 drop:1869 |

**⚠️ 偏差（2 项）**

| # | 方块 key | 问题 | 1457 行号 | 建议修复 |
|---|---|---|---|---|
| 1 | v_110_hallow_short_plants | 本仓把 3/110 同支（killTileDropItems `sheet === 3 \|\| sheet === 110`）→ fx!=144 时掉 283 草籽;原版 case 110 **仅** fx==144→5,**无种子档**（神圣短株不掉种,与森林草 3 不同） | :65041-65050（3 有种子支）vs :65056-65062（110 无） | killTileDropItems 拆开 3/110：110 只留 fx==144→5 |
| 2 | v_77_hellforge | def.pick:65 全域生效;原版 65 门仅 `y >= UnderworldLayer` 段生效（:53011-53014,地表放置的地狱熔炉低镐可挖）,tileHitDamage 的条件门已 1:1 → def 级门重复且偏严 | Player.cs:53011-53014 | tiles.ts v_77 pick 65→0（保留 tileHitDamage 条件门）;或备案为有意微差 |

**📋 备案/死 def（3 项,不修）**

| 方块 key | 说明 |
|---|---|
| v_26_altars | 无掉落=原版语义（预审复核#2）,砸碎链/镐门/反噬已 1:1,勿填 drop |
| v_99_trash_can | 死 def：原版物品 348 createTile=21+placeStyle 6（Item.cs:5444-5455,垃圾桶即箱 21 style6,破坏掉 Chests[6]=348 本仓已通）;独立 tile99 无放置/导入路径。若激活需补 Check2x2 case 99 → 348（:48696-48697） |
| v_128_mannequin_legacy | 死 def：物品 498 createTile=470（新模特）,wld 导入无 128 映射;旧模特语义（CheckMan→498 + 盔甲逐件回收 + 带甲不可挖 :53064-53074）已由 v_470 TE 挂物族承担。若激活需补三门（见预审复核#3） |

**附加发现（wld 导入映射缺口,另案登记）**：WldImport.ts tile 映射表缺 55（Signs）/102（Throne）/133（Forges）/36（Presents）/171（Christmas Tree）/99/128——导入档中这些物件会丢失（本区 ❌ 修复落地后,放置链可达的 55/102/133/36/171 掉落语义即生效,但导入档仍无来源）。

**分区 E 总结**（39 项,按行计）：确认 11 / 偏差（⚠️）1（v_110 多掉种子;另 v_77 在其 ❌ 之上附 ⚠️ 镐门偏严 1 项,共 2 条 ⚠️ 明细）/ 未实装（❌）24（22 项掉落 vid 未实装现走 place_v_ 合成件 + v_51 蛛网零掉落 + v_50 死分支;另有门锁挖掘门横切缺口 1 项不计行）/ 备案（📋）3（祭坛无掉落正确 + 99/128 死 def）。掉落贴图维度全绿（所涉 vid 全数存在于 vanilla.json items 表+图集矩形,零缺失）;挖掘条件维度除门锁一项外全对齐（空箱门/承载位/祭坛/77 熔炉 pre-hardMode 门均 1:1）。主会话 3 项预审复核全部准确（129 两档缺失属实、26 无掉落正确、131=512/128=498 已核）。

### 分区 E 修复批（2026-08-23 修复子代理）

**已修 21 项（❌#2~#25 中除 #5/#6 外全部 + 横切外三门）**：

- **tiles.ts def.drop 直掉 14 件**（❌#12~#25）：v_29→87 / v_97→346 / v_125→487 / v_132→513 / v_136→538 / v_141→580 / v_86→332 / v_106→363 / v_77→221 / v_55→171 / v_102→355 / v_131→512 / v_81→275 / v_36→1869。多格件经 multiTileDropKey、1×1 件经通用尾 `def.drop` 支,失撑链（checkFurnitureSupport）同源生效。
- **vanillaStyleDrops.ts 表接档 6 sheet**（❌#4/#7/#8/#9/#10/#3）：129 帧直读 fx≥324→4988 else 502；133 帧直读 fx≥54→1221 else 524；50 帧直读 fx==90→165 else 149（**特判自 Game object 支死分支移入**——v_50_books def 1×1 永远到不了 object 支,旧分支已删）；103 表分档 fx/36 四档（356/2235/2242/2243）；135 表分档 fy/18 七档（529/541/542/543/852/853/1151）；144 表分档 fx/18 五档（583/584/585/4484/4485）。三路消费点（breakTile object 支 / 1×1 尾 / 失撑链）同批生效。
- **Game.ts**：蛛网 51 档入 killTileDropItems（❌#2）——恒掉 150,wall==62（蛛网墙）时 Next(4)!=0 无掉落（KillTile 门 :63904 位置等价,一切破坏路径含 TILE_CUT 割草支）;小堆饰 185 段掉（❌#11）——1×1 尾 sheet185 支 + pileDecoDropVid 段直查 + spawnPileDecoDrops 逐掷串（铜 12 掷/银金各 3 掷/宝石 ×Next(1,4),与生成侧 TrackPass.pileDropRolls 同构）,fy!=18 行无掉落且**压 place_v_ 兜底**（185 在共享 no-drop 表）。
- 测试：tests/style-drop-restore.test.ts 新增「审计 E 批」段 7 例（数据层三支/表分档三族/段直查/1×1 运行时/书/蛛网墙门/object 分支/185 掷串）;tests/multi-tile-drop.test.ts 三处 place_v_ 期望更新为真 vid（77/125/132/55——旧期望锁的是本批修掉的偏差行为）。

**待后续（2 项,修复复杂需新表）**：

| # | 方块 key | 缺口 | 说明 |
|---|---|---|---|
| 1 | v_105_statue（❌#5） | 51 档雕像物品按 StatueStyleToItem(fx/36+(fy/54%3)*55)（:38133-38139/:37944） | 需 51 项 StatueStyle→vid 全表（原版散在 GetItemDrop_Statues 大 switch）;现仍恒掉 place_v_105_statue（合成件可再放置,vid/图签非原版）。接法与 103/135/144 同构:vanillaStyleDrops 增 Statues 表+styleFromFrame 105 条目即可,工作量在转录 51 档 |
| 2 | v_91_banners（❌#6） | 33+ 旗物品按 CheckBanner 分段表（:46176-46268,style=fx/18+(fy/54)*111） | 需 CheckBanner 分段映射表（敌旗/镇旗/水晶旗多段混编）;现仍恒掉 place_v_91_banners（重放置恒 style0 哥布林旗→旗 buff 张冠李戴,玩家可见度高于雕像）。Game.ts:21825 已有 VANILLA_ITEM_KEY_BY_ID 反查先例可参照 |

**随批备案（不在本批范围）**：❌#9 附带的桌面支撑门（29/103/462 tileTable :47030-47040,TILE_TABLE_SHEETS 未单列）未动——放置侧支撑语义,与本批掉落侧无关;❌#1 门锁挖掘门横切缺口未动（tryMine/tileHitDamage 需复用 world/Door.ts isLockedDoor,涉挖掘主链,另批）;⚠️#1 v_110 种子档拆分未动（killTileDropItems 3/110 同支拆开,一行改动,可随下批）。

---

## 分区 F——掉落物贴图全量核验（子代理）

审计对象：A–E 五区全部方块（678 key）的破坏掉落 vid 在本仓的可渲染性。
判定链（Renderer.drawDrop :4420 → atlasIcon :2300 → atlasIconForKey SpriteAtlas.ts:666 →
SpriteAtlas.vicon :381 → `vanilla.json.items[vid]` 的 `icon`+`ix/iy/iw/ih` 图集矩形；
vicon 返 null 才落 ItemIconGen 程序化兜底）。核验四层：条目存在 / icon 文件存在
（磁盘 stat）/ 图集矩形齐全 / iw·ih>0。

### 统计

| 来源 | 唯一 vid 数 | 有图（矩形+文件全过） | 缺图 |
|---|---|---|---|
| S1 tiles.ts 显式 `drop:N`（A–E 区） | 68 | 68 | 0 |
| S2 vanillaStyleDrops.ts 27 族（26 const 表 + CoinPiles 71-74 + holidayLightVid 596-598 + BONE_BLOCK 154） | 1403 | 1402 | 1（vid 0，哨兵） |
| S3 echoResourceDropVid（Echo 资源组 8 sheet） | 32 | 31 | 1（vid 0，哨兵） |
| S4 补充帧检掉落路径（killTileDropItems 植物/染料植物 1107-1121（227 表 15 列×stride34）/草药 313-318+2358/种子 307-312+2357/宝石簇 178 七档/八音盒 MUSIC_BOX_ITEM_BY_STYLE 全表+576/喷泉 10 档/书 149·165/倒木 9） | 161 | 161 | 0 |
| **并集 S1–S4** | **1626** | **1625** | **1（vid 0）** |

- 1625 个真实 vid 全部：items 表有条目 + icon 图集矩形（ix/iy/iw/ih）齐全 + iw·ih>0 +
  icon 文件在 `public/sprites/` 磁盘存在。零异常。
- 唯一"缺"的 vid **0** 不是物品：S2 来自 `Doors` 表下标 11（vanilla GetDoorItem 该 style
  无掉落档）、S3 来自 echoResourceDropVid 各 `return 0` 无档分支——消费端各调用点均有
  `>0` 门（Game.ts :12744/:12767/:12792/:12917/:23490/:23496），vid 0 本身永不成为掉落
  vid。唯一例外是门路径 ：12599 `sv>0 ? … : VI(25)`——sv==0 回落掉木门 25（有图,不构成
  贴图缺口；该"应不掉却掉"的语义偏离已由本档 C-2 记录,非本区范围）。**非缺口。**

S1 明细（68 vid，6 个 vid 多方块共享）：2(dirt/grass) 3(stone/ash) 5 8 9(wood/tree) 11 12
13 14 25(door_closed/door_open) 27(tallgrass/acorn_sapling) 29 33 34 48 56 94 105 106 116
129 131 133 136 148 169 170 173 174 176 177-182(六宝石) 222 224 321 335 336 344 345 347
349 352 359 364-366 424 593 594 664(ice/thin_ice) 699-702 880 883 947 1104-1106 3271 3272
3347 6147(v_753_gianttiki)。

### 缺图清单表

| vid | 物品名 | 来源 | 结论 |
|---|---|---|---|
| 0 | —（无物品条目） | Doors 表[11] / echoResourceDropVid 无档 return 0 | 哨兵值，`>0` 门滤除，永不掉落，非缺口 |

**真实缺图：0 项。**

### place_v_ 兜底路径核验

drop 为 null / 无字段的 v_ 方块走 breakTile 末支 `else if (def.key.startsWith('v_')) →
spawnDrop('place_'+key)`（Game.ts :12922）。图标链：atlasIconForKey（SpriteAtlas.ts:677）
`place_v_` 前缀 → `atlas.vframeAt(td.vanilla.sheet, 0, 0)` 取该方块贴图首帧；
ItemIconGen.generateAllItemIcons 对全部 ITEM_DEFS 无条件产条目（place_v_ 的 tile 键不在
其专属像素画清单内 → 产"?"灰块占位，恒非 null），故兜底双层永不空图。

- 候选全集：**600** 个 v_ 方块（590 `drop:null` + 10 无 drop 字段的容器/挂物件：
  v_29_piggy_bank / v_97_safe / v_395_item_frame / v_463_defenders_forge /
  v_470_mannequins / v_475_hat_rack / v_471_weapon_rack / v_491_void_vault /
  v_520_plate / v_698_item_flask——快照 MISSING 十项全部即此组，语义=走 place_v_ 兜底）。
- **600/600 可解析**：每个 def 都有 `vanilla.sheet`、vanilla.json tiles 表有条目、
  Tiles_N.png 磁盘存在且非空、grid>0（vframeAt(0,0) 恒命中）。问题 0。
- items.ts 自动注册循环（`for (const td of TILE_DEFS) … 'place_' + td.key`）在位，
  678 个 v_ def 全部获得 place_v_ 物品条目 → ItemIconGen map 必有键。

抽查 10 件明细（跨区取样）：

| place_v_ 物品 | sheet | 方块名（vanilla.json tiles） | tiles 条目 | 文件 | grid | 原版同 createTile 物品（参照） |
|---|---|---|---|---|---|---|
| place_v_181_red_moss_block | 181 | Red Moss Block | ✔ | ✔ | 16×16 | 4351 Red Moss |
| place_v_25_ebonstone_block | 25 | Ebonstone Block | ✔ | ✔ | 16×16 | 61 Ebonstone Block |
| place_v_198_asphalt_block | 198 | Asphalt Block | ✔ | ✔ | 16×16 | 775 Asphalt Block |
| place_v_368_granite_block | 368 | Granite Block | ✔ | ✔ | 16×16 | 3086 Granite Block |
| place_v_360_gold_butterfly_cage | 360 | Gold Butterfly Cage | ✔ | ✔ | 16×16 | 3072 Gold Butterfly Jar |
| place_v_750_sharp_spike_block | 750 | Sharp Spike Block | ✔ | ✔ | 16×16 | 6134 Sharp Spike Block |
| place_v_93_lamps | 93 | Lamps | ✔ | ✔ | 16×16 | 342 Tiki Torch |
| place_v_172_sinks | 172 | Sinks | ✔ | ✔ | 16×16 | 2827 Wooden Sink |
| place_v_194_bone_block | 194 | Bone Block | ✔ | ✔ | 16×16 | 766 Bone Block |
| place_v_353_vine_rope | 353 | Vine Rope | ✔ | ✔ | 16×16 | 2996 Vine Rope |

（注：place_v_ 图标=方块贴图首帧 16×16，非原版物品图标——原版这些方块多有专属
放置物品贴图（如上表参照列）；视觉近似但非 1:1，属既定 place_v_ 兜底语义，不计缺图。）

### 快照新鲜度

/tmp/tile-audit-parts.json 与当前 src/data/tiles.ts 对拍：678 键仅 1 处漂移——
`leaves`（D 区）快照 MISSING（无字段）→ 现为 `drop:null`（显式无掉落，语义等价，良性）。

### 总结

✅ **全有图**：S1–S4 并集 1626 个掉落 vid 中 1625 个全部可渲染（条目+矩形+文件三层全过），
唯一"缺"为 vid 0 哨兵（消费端 `>0` 门滤除，永不掉落）；place_v_ 兜底 600/600 可解析、
ItemIconGen 恒产占位图。**真实缺图 0 项，无需修复。**

## 分区 G——TileFrame 全量派发对照（decor 失撑链覆盖缺口根修,2026-08-23 二批）

用户实报：挖掉方块后**丛林大型植物（sheet 233,3×2 framed,fx=54 fy=0）悬空**。
根因：`DECOR_SUPPORT_KIND`（Game.ts）只覆盖 PlantCheck 单格植物族,多格植物/装饰/画族
整族漏列——233 落入通用家具 `hasSupport`（底行 SolidTile2 **或身后任一格有墙**）,
丛林天然壁后植物挖根永不塌。本批对读 `TileFrame`（:82605）→ `TileFrameImportant`
（:86241）全量 switch（:86241-87362）,逐 type 建立派发对照并补齐 kind。

### G.1 控制流要点（读表须知,三处易误读已勘误）

1. **嵌套 switch 的 `break` ≠ 派发落空**：`TileFrameImportant` 深达九层嵌套 switch,
   内层 case 组（如 `case 405/…/647/648/651/706: break;` :86830-86846、
   `case 172/…/652/654/713-716/751/752: break;` :86949-86974）的 `break` 只退出
   **内层 switch**,随后命中外层尾部的 `goto case 14;`（:87239）/
   `goto case 132;`（:87221）→ **仍派发** Check3x2/Check2x2。据此：
   - 647/648/651/706 → Check3x2（对它们**仅完整性,无支撑行**）;
   - 652 → Check2x2 通用支（有支撑行）。
   （旧批"648 底掏空 → 掉 195"的失撑断言系家具 hasSupport 近似期行为,已按本节勘误;
   Echo 资源掉落不受影响——挖掉路 breakTile object 支 echoResourceDropVid 保留。）
2. **墙锚族仅七 sheet**：240/245/246/241/242（Check*Wall 族）+334/471（武器架）。
   任务前提中"人偶架 470/128/269、帽架 475"经对读为**立地族**
   （SolidTileAllowBottomSlope 逐柱,CheckMan :46969-46970/CheckWoman :47032-47033/
   TEDisplayDoll.cs:308/TEHatRack.cs:141）,维持家具 hasSupport 近似（备案 G.4）。
   464/466（Check5x4 :50650）同为立地,非墙锚。
3. **树与树苗分家**：583-589/596/616/634（树,CheckTreeWithSettings :54877）与
   590/595/615（苗,Check1x2 :43728 普通支——地基族重帧逻辑 :43781 有 `type == 20` 门,
   苗不参与）。323 棕榈独立（CheckPalmTree :54821）。

### G.2 全量派发对照表

「现状」列：✔=本批前已覆盖（kind 名）/★=本批新增 kind/独=独立链/近=通用家具
hasSupport 近似（语义偏差见 G.4）/无=原版该路径无杀语义（悬空保留=原版同款）。

#### G.2.1 TileFrame 入口（:82605,非 frameImportant 支）

| type | 原版派发 | 行号 | 现状 |
|---|---|---|---|
| 49 | CheckOnTable1x1 | :43899 | ✔ 'furniture'（ON_TABLE_1X1_SHEETS） |
| 80 | CheckCactus | :54579 | 独 fellCactus（breakTile :12646）;**失撑（挖沙）链未接=备案 G.4** |
| 52/62/115/205/382/528/636/638 | CheckVines（IsVine） | :85599 | 独 checkVineAt ✔ |
| 32/69/352/655 棘、697 蛛网、330-333 币堆等非实心非 frameImportant | TileFrameCosmetic 仅合并帧 | :82713 | 无（decor 早退同款）✔ |
| 其余实心块 | TileFrameCosmetic | :82713 | 无（合并帧）✔ |

#### G.2.2 TileFrameImportant 顶派发（:86246-86256）

| type | 原版派发 | 行号 | 现状 |
|---|---|---|---|
| 518 | CheckLilyPad | :59694 | ★ 'waterplant' |
| 519 | CheckCatTail | :59231 | ★ 'waterplant'（列长门 catTailDistance=8 :4318;边界 -50 钳 inBounds） |
| 549 | CheckUnderwaterPlant→CanUnderwaterPlantGrowHere | :59064/:59027 | ★ 'waterplant' |
| 571 | CheckBamboo | :58933 | ★ 'waterplant' |
| Torches 全族 | CheckTorch | :87376 | 独 checkTorchDetach ✔ |
| 442 | CheckProjectilePressurePad | :87463 | 近 |
| 136 | 内联多向锚定（失锚杀） | :86301-86365 | 近 |
| 129/149/178 | CheckAndAdjustMultiDirectionalTile | :60805 | 近 |
| 373/374/375/461/709（IsADripTile TileID.cs:157） | 内联顶锚杀 | :86390-86396 | ★ 'drip' |

#### G.2.3 TileFrameImportant 主 switch（:86398-87362）

| type | 原版派发 | 行号 | 现状 |
|---|---|---|---|
| 184 | 内联苔藓邻接杀 | :86463-86520 | ★ 'moss'（GetTileMossColor :82492=Moss∪MossBrick） |
| 529 | 内联沙族地基杀 | :86493-86510 | ★ 'sandplant' |
| 3/24/61/71/73/74/110/113/201/637/703 | PlantCheck | :86537-86548/:81280 | ✔ 'plant' |
| 227 | CheckDye | :86549/:54257 | ★ 'dyeplant' |
| 579 | CheckRockGolemHead | :86552/:54282 | ★ 'sandplant'（单判据支） |
| 12/639 | CheckOrb（12/639 有地基行 :48240-48246） | :86553/:54187 | ✔ 12 'orb'；★639 'orb' |
| 31/696 | CheckOrb（仅完整性 :48233-48239） | :86553 | 31 备案不接（smashOrbHeart 旗标）;★696 'support2x2' |
| 165 | CheckStalactite | :86557/:39389 | ★ 'stalactite'（UpdateStalagtiteStyle :39036 重帧略） |
| 693/694 | CheckStalactiteEcho | :86559/:39267 | ★ 'stalactite' |
| 324 | 内联立地+非巨石 | :86563-86570 | ★ 'ground1x1'（与 Check1x1 :45633 同判据） |
| 235 | Check3x1 | :86572/:49541 | ★ 'deco3x1'（CheckTileBreakability 豁免由 breakTile 保护门同源承担） |
| 185 | CheckPile | :86569/:47281 | ★ 'pile'（fy18→Check2x1 :47379;style 生物群系地基 :47313-47355） |
| 10/11 | CheckDoorClosed/Open | :86417-86424 | 独 门链（Door.ts）✔ |
| 314 | Minecart.FrameTrack | :86425 | 独 轨道链 ✔ |
| 380/Platforms 族 | 合并帧无杀 | :86464-86535 | 无 ✔ |
| 233/236/238/702 | CheckJunglePlant | :86929-86934/:48358 | ★ 'jungleplant'（233 双变体 3×2/2×2;**墙不算支撑**;236/238/702 地基行 SolidTileAllowBottomSlope :48424-48431） |
| 530 | CheckOasisPlant | :86935/:48026 | ★ 'oasisplant' |
| 240/440 | Check3x3Wall | :86938/:44690 | ★240 'wallhang';440 维持 'furniture'（近似,备案 G.4） |
| 245 | Check2x3Wall | :86941/:44997 | ★ 'wallhang' |
| 246 | Check3x2Wall | :86944/:45154 | ★ 'wallhang' |
| 241 | Check4x3Wall | :86947/:45284 | ★ 'wallhang' |
| 242 | Check6x4Wall | :86950/:45377 | ★ 'wallhang' |
| 464/466 | Check5x4（立地 :50650） | :86953/:50617 | 近（备案 G.4） |
| 334 | CheckWeaponsRack（墙锚 :46822-46840） | :86956/:46796 | ★ 'wallhang' |
| 471 | TEWeaponsRack.Framing_CheckTile（墙锚 TEWeaponsRack.cs:93） | :86959 | ★ 'wallhang' |
| 34/454 | CheckChand（顶行第 2 列 :53318-53322） | :86962/:53254 | ✔34 'hangs'；★454（锚列 num+1 特支） |
| 547/623 | Check2x5 | :86965/:53739 | 近 |
| 548/614 | Check3x6 | :86968/:53904 | 近 |
| 613 | Check3x5 | :86971/:53824 | 近 |
| 15/20/216/338/390/493/497/590/595/615 | Check1x2 | :87055-87066/:43728 | ✔20 'sapling'；★590/595/615（普通支,无地基族门 :43781）;216/338 'furniture';余近 |
| 391-394 | goto case 14→Check3x2 | :87239 | 近 |
| 405/486/488/532/533/544/552/555/556/582/619/629/647/648/651/695/704/705/706 | break→goto case 14→Check3x2 | :86830-86846/:87239/:49617 | ★647/648/651/706 'deco3x2'（仅完整性）;★704/705（支撑行无巨石门 :49717-49720）;532/533/544/555/556/582/619/629 近;488 近 |
| 36/135/141/210/239/428/593/624/650/656/700/701 | Check1x1 | :87049-87062/:45633 | ✔210/428/593；★650;余近/他区 |
| 476/494 | CheckGolf1x1 | :45656 | 近 |
| 419/420/423/424/429/445 | CheckLogicTiles | :87063-87070/:45680 | ✔ 'logic' |
| 16/18/29/103/134/462/649 | Check2x1 | :87071-87078/:47379 | ★649 'pile'（default 支 :47429-47433）;余近 |
| 13/33/49/50/78/174/372/646/707 | CheckOnTable1x1 | :87079-87087/:43899 | ✔33/49/78/174/372;余近 |
| BasicChest 21/467 | CheckChest | :58405 | 独 容器链（shouldTileSurviveAt/chestDestroyable）✔ |
| 128/269 | CheckMan/CheckWoman（立地 :46969/:47032） | :46929/:46992 | 近（备案 G.4） |
| 470 | TEDisplayDoll.Framing_CheckTile（立地 .cs:308） | TEDisplayDoll.cs:285 | 近 + furnitureItems 链 ✔ |
| 475 | TEHatRack.Framing_CheckTile（立地 .cs:141） | TEHatRack.cs:118 | 近 + furnitureItems 链 ✔ |
| 597 | TETeleportationPylon.Framing_CheckTile（立地 .cs:86） | TETeleportationPylon.cs:58 | 近 + breakPylon 挖掉链 ✔ |
| 27 | CheckSunflower | :54191 | ✔ 'sunflower' |
| 28/653 | CheckPot | :57273 | ✔28；★653 'pot' |
| 171 | CheckXmasTree | :39998 | ★ 'xmas'（掉落走 breakXmasTree 既有链） |
| 335/411/490/564/565/594 | Check2x2 | :48811 | ✔335/564/565/594 'furniture';411 近 |
| 316-318 | goto case 132→Check2x2 | :87221 | 近 |
| 172/360/505/521-527/543/568/569/570/580/598/620/652/654/713-716/751/752 | break→goto case 132→Check2x2 | :86949-86974/:87221 | ★652 'support2x2';654/713-716 独巨石/TNT 链 ✔;余近 |
| 376/443/444/485 | CheckSuper | :48523 | 近 |
| 91 | CheckBanner（顶锚 :46530-46547） | :46493 | 近（顶锚语义未接=备案 G.4） |
| 35/139 | CheckMB | :51649 | ★35 'support2x2'（CheckMB 判据归并,无半砖门 :51686-51692）;139 'furniture' |
| 386/387/388/389 | CheckTrapDoor/CheckTallGate | :52050/:52111 | ✔386/389 'furniture'（openStateDoorDropVid 链） |
| 92/93/453 | Check1xX | :38169 | ✔92;余近 |
| 104/105/207/320/337/349/356/378/410/456/465/480/489/506/509/531/545/560/591/592/657/658/663/720/721/725 | Check2xX | :38376 | ★465/591/592 'hangtop'（吊挂支 :38464-38505）;✔410/480/509/531 'furniture';378 独 假人链;余近 |
| 101/102/463/617 | Check3x4 | :50518 | 近 |
| 42/270/271/572/581/660/698 | Check1x2Top | :47109 | ✔42 'hangs';余近 |
| 55/85/395/425/510/511/573 | CheckSign | :43944 | ✔85/425;余近（sign 文本链 ✔） |
| 520 | CheckFoodPlatter | :82534 | 近 + furnitureItems 链 |
| 209 | CheckCannon | :51232 | ✔ 'furniture' |
| 79/90/487 | Check4x2 | :47817 | 近 |
| 699 | Check4x4 | :53439 | 近 |
| 94/95/97/98/99/100/125/126/173/282/287/319/621/622 | Check2x2 | :48811 | ✔95/98/100/126/173;余近（95/126 吊顶支 :48847-48851 近似偏差备案 G.4） |
| 96/254/假容器/457 | Check2x2Style | :52753 | ✔441/468 'furniture';余近 |
| tileAlch 82/83/84 | CheckAlch | :46371 | ✔ 'alch' |
| 72 | 内联蘑菇树 | :86978-86998 | ✔ 'shroomtree' |
| 5 | CheckTree | :55045 | 独 仓内树系统（fellTree :13311）;失撑（挖根）链未接=备案 G.4 |
| 583-589/596/616/634 | CheckTreeWithSettings | :54877 | ★ 'treebase'（GemTree/VanityTree/AshTreeGroundTest :30585-30616;重帧 cosmetic 略） |
| 323 | CheckPalmTree | :54821 | ★ 'treebase' |
| 567 | CheckGnome | :54400 | ★ 'gnome' |
| 630/631 | CheckStinkbugBlocker | :54373 | ★ 'stinkbug'（重定向写帧+全失效杀;树干锚特支 :54352 略） |
| 723/724 | CheckAnchor | :54290 | 无杀（switchToWallIfInvalid 恒活）+独 critter/kite anchor 挂物链 ✔ |
| 354/355/406/412/452/455/491/499/642/733/753 | goto case 106→Check3x3 | :53520 | ✔452/455;余近 |
| 296/297/309/358/359/413/414/542/550/551/553/554/558/559/599-612/632/640/643/644/645/710 | goto case 275→Check6x3 | :50689 | 近 |

### G.3 本批新增 kind（17 个,Game.ts `DECOR_SUPPORT_KIND`）

`jungleplant`(233/236/238/702)、`oasisplant`(530)、`wallhang`(240/245/246/241/242/334/471)、
`stalactite`(165/693/694)、`moss`(184)、`pile`(185/649)、`deco3x2`(186/187/647/648/651/704/705/706)、
`deco3x1`(235)、`dyeplant`(227)、`waterplant`(518/519/549/571)、`sandplant`(529/579)、
`hangtop`(465/591/592)、`gnome`(567)、`treebase`(583-589/596/616/634/323)、`stinkbug`(630/631)、
`xmas`(171)、`support2x2`(35/652/696)、`drip`(373/374/375/461/709)。
既有 kind 扩员：`ground1x1`+650/324、`sapling`+590/595/615（普通支门 :43781）、
`orb`+639、`pot`+653、`hangs`+454。
新增判据助手：`solidTileStrictAt`（SolidTile :70642）、`solidAllowTopSlopeAt`
（:70851）、`solidAllowLeftSlopeAt`（:70875）、`solidAllowRightSlopeAt`（:70893）、
`sheetAt`；地基表 `CONV_SAND/STONE/MOSS/MOSSBRICK/HARDENED_SAND/SANDSTONE/SNOW/ICE`
（TileID.cs:18-40）、`GEM_TREE_GROUND_SHEETS`（:30585）、`VANITY_TREE_GROUND_SHEETS`
（:30598）、`CATTAIL_GROUND_FY`（:59246-59262）。

### G.4 备案（近似/未接债,勿误修）

- **通用家具 hasSupport 近似偏差**（对全部「近」行）：底行 SolidTile2 严于
  SolidTileAllowBottomSlope（坡/半砖）、墙锚「任一格有墙即活」松于画族「逐格墙」
  （本批墙锚七 sheet 已摘出）、桌面/平台豁免差异。95/126 吊灯吊顶支（Check2x2
  :48847-48851）与 91 旗顶锚（CheckBanner :46530-46547）语义未接=过 lax 备案。
- **440 宝石锁**维持 'furniture'（原版 Check3x3Wall 墙锚;现走近似）。
- **5/80 失撑未接**：仓内树/仙人掌自有砍伐链（fellTree/fellCactus）承担破坏语义;
  挖根失撑（原版 CheckTree :55045/CheckCactus :54579 杀）未接=备案。
- **cosmetic 重帧略**：UpdateStalagtiteStyle（:39036）/CheckTreeWithSettings 与
  CheckPalmTree 的分支重帧/CheckStinkbugBlocker 树干锚特支（:54352）——均不产杀,
  只影响样式自愈,备案。
- **放置侧锚点债**（既有）：仓内放置走 hasSupport 近似（"下/上/侧邻任一"）,
  未提取 TileObjectData 全量锚点表——本批运行期判据收紧后,吊顶族（465/591/592/
  373 族）与墙锚族（240 系/334/471）按原版帧检执行,误放置会在邻格扰动时按原版
  语义塌落（原版 CanPlace 本不允许该锚法）。
- **519 边界钳**：原版水列走查边界 maxTilesY-50/50（:59237/:59255）在小世界为负,
  仓内钳为 inBounds 边（大世界行为等价）。

### G.5 验证

- `tests/decor-support.test.ts` 49 it（新增 D-1b…D-1h 八组:用户场景 233 3×2 fx54 fy0、
  233 2×2 变体、236 掉 1291、530、240/471 墙锚、647/650/649/652 碎砾、165/694、184、
  227、571/549、519、583、567、591、171、235、185、630、32/330/124 负例、454/590/639/
  653/696/579/373/706 补遗）。
- 回归：decor-support + style-drop-restore + multi-tile-drop + tile-drop-null +
  leftover-wiring-drops + sea-oats-anchor + palm-chop + tree-lifecycle 全绿
  （196/196）;tsc src/ 零新增错（并行会话在途域除外,见移交）。

## 分区 H——NPC 通用绘制锚点勘误（2026-08-24,用户实报"鸟妖碰撞盒不对"）

用户截图：鸟妖(48)贴图整体悬在碰撞盒上方（体底≈盒顶）。实测（drawImage hook 探针
scripts/_npc-anchor-probe.mjs）：修复前 dy=−82（底锚路径,帧底=盒底+4）、体底悬盒顶
11px——与截图吻合。

**根因**：渲染端通用路径把"地面型"画成**底锚+4 下沉**,出处是对 type==94 骷髅专属
绘制（Main.cs:25483 "+4"）的误读——那不是通用公式。原版真值（Main.cs:23658-23660
通用尾段 + origin=halfSize :23418）：**帧中心钉 (Center.X, Center.Y+num46+num47+
gfxOffY)**,对全体 NPC 一致。帧高=盒高+8 的紧裁剪行走族（僵尸 48=40+8）两模型恰好
重合故长期未露馅;带底边距的飞行族（鸟妖帧 86/盒 34）整体上飘。

**修复**（Renderer.ts drawEnemy）：
- 通用路径统一中心锚 + `addY = num46{108/124/625=+2} + num47(NPCAddHeight,复用
  血条 HB_ADD_H 封闭表 :22208)`;旋转枢轴随之从盒底修正为帧中心（546 怒滚虫手工
  枢轴补偿删除）;史莱姆王忍者锚从"底心−h/2"改盒中心（原版 :22812 锚 Center）。
- 血条 max(贴图底+6) 兜底收窄到校准偏差族（EoC 4）——num47>0 的 NPC 原版公式已含
  贴图下沉,对全体取 max 会把条推到帧底透明边距下（比原版低 20-40px）。
- 验证（探针,15/15+泛化 3 id）：鸟妖帧中心=盒中心+32×zoom（0.3px 内）、体底垂到
  盒底之下（原版观感:盒盖躯干,脚/尾悬下,体底=盒底+29 与血条 48:32 的"条悬贴图底
  6px"关系自洽）;僵尸(add=0)零漂移;蝙蝠 49(add=4)精确 +4。
- 回归：npc-grid-draw/enemy-proj-draw-parity/draw-side-leftovers/held-draw-fixes/
  ballistra-boomerang-anchor 139 + decor/style/multi-tile/tile-drop-null 153 全绿。

**影响面**：通用路径全体 NPC 向原版靠拢（行走族数学零漂移;带底边距帧下移
fh/2−h/2−4+num47 px）。专用绘制分支（月总/石巨人/双子/柱子/荷兰船/光女等）不经
此路径,不受影响。

### H.1 review 补全（2026-08-24 复核批）

对 H 批复核发现并当场修复五处：
1. **num46 链漏 13 档**（:23226-23277 只读到 :23235）：补 467:+7/537:+2/490:+4/484:+2/
   483:+14/478·606·612·613:−2 静态档 + 469(ai2==1)/692(wet?10:6)/626·627(wet)/688:+10/
   694(ai3==3:+16,ai3==4 按帧渐隐 :23336-23343,帧距 40 实证)运行时档 + 477 num47=22
   覆写 + 262/264/268/288 switch 尾 += 档。
2. **addY /scale 除反**：原版 `return num * theNPC.scale`（:22393）——偏移随 npc.scale
   放大；除以 scale 在专家档 13-15/134-136（×1.2/×1.05）时与原版差 5-6px。改纹理单位直加。
3. **HB_ADD_H 缺 671-675:+10**（笼中鸟族,switch 尾 :22385-22389）——全表 diff 定谳：
   其余 70 项与原版逐值相等（165 组系 5 连 || 解析漏、269-277 系 switch 形态漏,均在原版）。
4. **DrawNPC switch 绘制侧 num47 覆写**（:23445-23477）：555-557:−5/561-563:−8/568-569:−3/
   570-571:−2/572-573:−4——血条直调 NPCAddHeight 不经过此段,故独立 DRAW_NUM47_OVERRIDE
   表只入绘制路径（覆盖语义非累加）。
5. **旧底锚残留两处**：KS 王冠 −e.h/2（原版 :26476 锚=Center,双重补偿删）、
   drawWitherBirth −e.h/2/scale（num47=−3 保留）。
6. **halfSize 覆写组（4/125/126/262/264/63/64/103/69）定谳不接**：origin 位移与
   position 位移在锚点公式中恒相消（frame center = Center+(0,off) 与 halfSize 无关）,
   只改旋转枢轴——非旋转族无关,4/125/126 属 EoC 校准偏差域。num45（694 X 分量）赋值
   后无消费=死码。townNPC ai[0]==5 运行时 num47 减档（:22377-22386）:城镇 NPC 不走
   drawEnemy/此血条路径,不接。

验证：探针 4 id 矩阵（48:+32/3:0/49:+4/483:+14）各 6/6 全过（帧切片+锚点+偏移）;
tsc Renderer 0 错;draw 族 139 全绿。

### H.2 最终清零 sweep（2026-08-24 终审）

全渲染层扫描旧底锚残留模式（`-e.h/2` 补偿/`e.y+e.h` 平移/glowFlying 判别），再修五处：
1. **轨道 glow ocy**（drawNpcGlow orbit 族 541/542/568/569/661）：`glowFlying?0:-e.h/2`
   换算删——568/569 noGravity=None 走 −e.h/2 支=轨道整体高半盒（中心锚后原点恒盒心）。
2. **spinner 520 火星行者指示灯**：zero6=Top+(0,20)（:25434）——旧底锚局部顶=−h,中心锚
   下=−h/2（非删项,是基点换算）。
3. **546 亮核 draw546GlowCore**：枢轴平移 pc=4−sh·scale/2 删（同主 546 旋转支）。
4. **TownNPC 路径同款旧模型**（52/60 城镇族偏差 2-8px：巫师/染料商/旅行商 −8、城镇
   史莱姆 −7~8、宠物 −6）——中心锚+num46(108:+2)+HB 表+坐姿运行时减档（:22377-22386
   −4/124 再−2/637·656·IsTownSlime(670,678-684 :4448) 再−10）+ Glow 变体档同步 +
   **派对帽 vy −h→−h/2**（帽锚=Bottom−height=盒顶 :27464,继承 save 块原点）。
   持械 drawTownHoldout 走世界系绝对坐标不受影响（验证）。glowFlying 助手死码删除。
5. 判定不动：:4335 牵绳小动物（自有原版公式 Center+(0,8−h/2)）/drawNpcGrid 族
   （专用分支各自 1:1 公式）/双子链 :8085（`Bottom.Y−height×0.5×scale` :22558 逐字一致）。

验证：探针 48:+32/3:0 复跑 6/6×2；tsc Renderer 0 错；draw 族+townnpc 182 全绿。

### H.3 no-drop 族定谳 + 1×1 兜底门（2026-08-24 终审续）

- **1×1 尾 place_v_ 兜底加 placeableTiles 门**（Game.ts :13392）——与 object 支
  multiTileDropKey（:808「判据=存在真实原版放置物品」）同语义。此前无门：no-drop 组
  1×1 件（藤/滴落饰/苔叶块等 141 sheet）也走此支——spawnDrop 未知键静默 null 无实害,
  但语义与「真无掉落」相悖,对齐后这些件真无掉落=原版同款。
- **no-drop 族全量枚举定谳**（306 个 drop:null/缺省 v_ def × 原版 :65803-66145/
  :66435-66615 裸 break 组 × Check* 锚点 NewItem 交叉）：141 sheet 在原版 no-drop 组,
  其中 **18 站点有 Check* 锚点真掉落**（CheckSign 族 55/425/510/511/573、Check3x2 族
  486/642/704/706、Check1x2Top 族 581/660/698、Check3x4 463、Check2x3Wall 13/5、
  Check3x3Wall 61/73/74——后六站疑误报待逐站核）→ 派代理逐站定谳清偿（H.4）。
  其余 123 站确认真无掉落或已有专属链（巨石滚落/裂砖连锁/TNT 桶/瓦罐/植物种子支/
  wiring style 表/假容器 -1 哨兵）。
- worldgen 终态金标门仍红：并行 worldgen 会话金标 10:11 重烘后 pass 又有改动（在飞）,
  归因不变,本会话零 worldgen 改动。

### H.4 Check* 锚点 18 站点逐站定谳（2026-08-24 终审收官）

H.3 扫出的 18 站逐站读 1457 原版上下文（TileFrame 派发 :86241+ 逐 case 对读）定谳：
**真缺 11 站（已补 def.drop）/ 已有专属链 2 站 / 误报 5 站**。误报根因统一：
初扫把 Check* 函数 switch 里的 **style case**（`case 61:` 等）误读成 tile type case——
Check2x3Wall（:44997）整函数只派发 type 245（TileFrame :86769）、Check3x3Wall（:44690）
只派发 type 240/440（:86767-86768），函数内 case 号全是 240/245 的 style 档。

**真缺 11 站（tiles.ts 已补 drop:vid,挖掉 object 支/失撑链两消费点经 multiTileDropKey
自动通;vid 均验在 vanilla.json items 且 createTile=sheet）：**

| tile | sheet | Check 函数 | 原版行 | 掉落 vid |
|---|---|---|---|---|
| v_463_defenders_forge | 463 | Check3x4（派发 :87031 组 101/102/463/617） | :50591 | 3813 |
| v_395_item_frame | 395 | CheckSign（派发 :87049 组 55/85/395/425/510/511/573） | :44141 | 3270 |
| v_425_announcementbox | 425 | CheckSign | :44145 | 3617 |
| v_510_arrow_sign | 510 | CheckSign | :44154 | 4319 |
| v_511_painted_arrow_sign | 511 | CheckSign | :44151 | 4320 |
| v_573_tattered_wood_sign | 573 | CheckSign | :44148 | 4710 |
| v_581_lavafly_in_a_bottle | 581 | Check1x2Top（派发 :87040 组 42/270/271/572/581/660/698） | :47208 | 4848 |
| v_660_faeling_in_a_bottle | 660 | Check1x2Top | :47211 | 5351 |
| v_698_item_flask | 698 | Check1x2Top | :47198 | 5472 |
| v_486_drum_set | 486 | Check3x2（派发 :86829-:86846 no-op 裸 break 组闭合→goto case 14 :87239） | :49985 | 4063 |
| v_642_chlorophyte_extractinator | 642 | **Check3x3**（:53634→5296;TileFrame :86797 排除组 `type != 642` → goto case 106 :87275→Check3x3 :87294） | :53634 | 5296 |

（642 勘误：初扫记 Check3x2 :49970——该 case 同掉 5296 但**不可达死路**，642 被派发
守卫排除后走 Check3x3；两处 vid 相同,补 drop 无歧义。）

**已有专属链 2 站（def.drop:null 保留=防双掉,不动）：**
- v_704_fallen_log_echo（704）→ Check3x2 :49991 恒掉 501 仙尘——已接
  `echoResourceDropVid`（vanillaStyleDrops ECHO_RESOURCE_SHEETS,挖掉/失撑两路同源）。
- v_706_terragrim_shrine_echo（706）→ Check3x2 :50103 恒掉 4144 泰拉魔刃——已接
  `breakShrineSword`（Game.ts :13464,breakTile :12958 object 支前拦截;706 在
  DECOR_SUPPORT_KIND 为 deco3x2 integrity-only【无支撑行】,失撑路不可达=原版同款）。

**误报 5 站（Check* 行号系 style case 非本 tile 派发,原版真掉落在别处且本仓已接）：**

| tile | sheet | 误报行 | 真身 | 原版真掉落 | 本仓现状 |
|---|---|---|---|---|---|
| v_13_placed_bottles | 13 | Check2x3Wall :45084 `case 13→5086` | 245 的 **style 13** 档 | KillTile_GetItemDrops case 13 :66050→GetItemDrop_Bottles(fx/18) | styleDropVidOfFrames Bottles 表已接（1×1 尾 :13387） |
| v_5_trees | 5 | Check2x3Wall :45108 `case 5→1495` | 245 的 **style 5** 档 | case 5 :65730→KillTile_GetTreeDrops（木材链） | 树木系统 fellTree 链已接 |
| v_61_jungle_short_plants | 61 | Check3x3Wall :44811 `case 61→3866` | 240 的 **style 61** 档（画） | case 61 :66142 fx144→331/fx162→223/108-126 1/20→208/1/100→195 | killTileDropItems :12753 已接 |
| v_73_forest_tall_plants | 73 | Check3x3Wall :44829 `case 73→4958` | 240 的 **style 73** 档 | case 73 :65546→KillTile_ShouldDropSeeds→283 | killTileDropItems :12774 已接 |
| v_74_jungle_tall_plants | 74 | Check3x3Wall :44832 `case 74→5087` | 240 的 **style 74** 档 | case 74 :66143（与 61 共 case,74 只吃 1/100→195 支） | killTileDropItems :12758 已接 |

验证：tests/multi-tile-drop.test.ts 增补 G 段（11 站 def.drop 断言 + 11 站运行时挖掉
逐件 sweep + 失撑链 representatives + 704/706 专属链回归 + 误报 5 站 style 档铁证）;
D 段 drop:null 全量对拍基数 241→239（11 站移出,阈值同步）。四套件 157 绿;
npx tsc --noEmit 触碰文件零新增错。

### H.5 太阳花法杖（6152）双根因（2026-08-24 用户实报"挥动没效果"）

1457 新武器 DaybloomStaff（Item.cs:47411 DefaultToMagicWeapon(1114,40,6)/useTime 4/
mana 5/damage 8/autoReuse）。数据链（def 自动注册/combat 表/magic 分派/出手块）全在,
失效在两处运行时门：

1. **停发窗条件反相**（Game.ts magic case）：原版 Player.cs:43847
   `itemAnimation < itemAnimationMax − useTime×4 → flag=false`（倒计时末 16t 静默）。
   本仓 swing.t=倒计时（t=dur 起始→0），曾写成 `t > dur−16 → 吞`——起始帧 t=dur 恰
   落吞窗=**第一发即被吞+mouseDown 被消费**，再点再吞（每次点击都重启 swing→t=dur）
   =「挥动没有任何效果」直接根因。修=条件改 `t < dur−16`。
2. **分类器 magic 分支丢 autoReuse**（vanillaItemCombat.ts :316 `...base` 只带
   damage/knockback/useTime/shootSpeed）：use 门 `(cw.autoReuse || fresh-edge)` 吃
   cw.autoReuse→恒 undefined→**按住不连发**（全部 magic 武器共性；melee 支本就随行）。
   修=magic 分支随行 `autoReuse: !!c.autoReuse, useAnimation: c.useAnimation ?? base.useTime`
   （CombatWeapon 类型同步扩两可选字段）。非 autoReuse 件显式 false 语义不变。

验证：浏览器运行时探针（scripts/_dbloom-probe.mjs,真实 Game 管线持杖模拟连按）
修前 0 发/修后 **120t 15 发弹 1114**（节奏=40t 挥击×前 24t 窗÷4t 间隔≈6 发/循环,
末 16t 静默=原版停发窗语义）；手动直驱 useCombatWeapon 5/5 全中（case 本体完好）。
batch-c-1457 增 2 回归测试（分类器随行断言+停发窗方向源码守卫）；8 套件 246 全绿。

★探针方法论：`__swGame`（mainFlow 构造期）早于 `__swItems`（enterGameHooks 进图钩子）
——探针等待条件必须含后者,否则读到空 ITEM_BY_KEY=「物品不存在」假象；page.evaluate
内无 process,env 须外层注入再传参；vite 重启后首跑可能拿到旧 transform,复跑自愈。

### H.5b 单发+视觉二轮（2026-08-24 深夜,用户复报"只能单发+弹不像原版"）

**①按住连发第三层门**：发射路径消费 mouseDown（边沿量）后,updateUse 头部早退门
`if (!inp.mouseDown) return` 次 tick 即拦——mouseHeld 电平永远到不了 cw 门。
修三处：早退门放行 `cw.autoReuse && mouseHeld`（cwEarly 前置计算）+ cw 门
autoReuse 走 `(mouseDown||mouseHeld)` + ranged 门同款。三层门链（早退门→cw 门
autoReuse→停发窗方向）缺一即单发。

**②1114 视觉对齐**（原版=金色星形贴图 Projectile_1114+十份 oldPos 渐隐拖尾+金色
尘迹+旋转）：Main.cs:35299 十份拷贝沿 oldPos[0..9] 缩放/RGBA 各 ×(9−i)/9
（GetAlpha=(200,200,200,25),本仓 200-as-alpha 0.78 口径;ai[1]>6 起）+ AI_024
:26322 尘 57 1/4t noGravity 速度×0.5+:26285 rotation += vx×0.2+缩径消亡
（130t 后 −0.05/t→scale 0.2 Kill=有效寿命 ~146t,曾 life 600）。
Arrow 实装：starTrail 环（94/95/1114 同族）+PROJ_SPIN 1114+draw 十份拷贝+
spawnParticles 金尘+life 146+bounce:true（aiStyle 24 撞块反弹族）。

**③节奏账定谳**：原版出手=单发/次（:49950 ±4px Circular 抖动+RotatedByRandom
0.157）——用户原版截图"四颗金色"=useTime 4 高射速下的同时在飞数,非 4 连散布。
挥内节奏=itemAnimation 40/36/32/28/24 五连发（末次 `24<24`=false 仍发）+末 16t
静默；120t=3 循环×5=15 发与探针逐发吻合。

**④附带**：batch-c yoyo 1125 测试 4% 暴击偶发失败（crit ×2 vs 期望精确 100）
→ critChance=0 钉死确定性（3× 复跑绿）。

验证：真实按住语义探针（mouseDown 首拍后消费/mouseHeld 电平保持）15 发/120t；
截图实证金尘+星弹群；tsc 触碰面零错；batch-c 36×3+远程 5 文件 90+魔法/弹幕 174 全绿。

### H.5c 加算观感+法杖朝向+空蓝验证（2026-08-25,用户复报"仍半透+法杖指向后面"）

1. **半透根因=预乘语义误读**：XNA BlendState.AlphaBlend=预乘（SrcBlend=One）——
   GetAlpha=(200,200,200,25) 的 RGB 是全额加算贡献、A=25 只衰背景 10%=加算发光观感
   （飞灵终审同款坑）。source-over 直译 78% 不透明=半透灰。修：1114/94/95 本体+拖尾
   canvas 'lighter' 加算（Arrow.ts 两处）。
2. **法杖指向后面**：6152/6153/6154/6155/6173 不在 STAFF_ITEMS→落枪弓持物支（rot=aim
   无 staff 45° 斜持、握把锚错）。原版 staff 旗=Main.cs:6930 switch 逐型显式置位
   （Item.staff[]），1457 五杖在列——全量 diff 补齐（39 项对 39 项,零多余）。
3. **空蓝处理验证**（用户追加）：ManaV2 语义实装在位——mana=0 继续发射（探针空蓝段
   12 发/120t）、mana 保持 0、slowMagicUse=true（攻速 ×0.4 档）、魔力花自动喝蓝支在位。
4. **节奏账勘误**：挥内=itemAnimation 40/36/32/28/24 **五连发**（末次 24<24=false 仍
   发）+末 16t 静默（前记"约 6 发"不确）；120t=3 循环×5=15 发与探针逐发吻合。
5. 附带：batch-c 1115→chargeRate 源码守卫窗口 900→1400（H.5 注释增长挤出窗口,守卫
   语义不变）；yoyo 1125 测试 4% 暴击偶发钉死（critChance=0,3× 复跑绿）。

验证：截图实证（法杖 45° 斜指准星+加算金色星弹群+尘迹）；空蓝段探针；tsc 零错；
batch-c 36+魔法/弹幕/远程 174 全绿。

### H.5d 清零 sweep——四类模式扫全部武器（2026-08-25）

按太阳花法杖暴露的四类缺陷模式全量扫描：

**A. 分类器丢 autoReuse**：全表（vanilla-itemcombat.json 3600+ 条）按分类分支模拟——
非 melee/magic/ranged kind 中 autoReuse=true 仅 4060 超级星炮/5629 橡子弹弓（均
useAmmo→ranged 门已修）；'shot' 兜底支曾丢 autoReuse（779/5134 连发镖枪走本支）→
补随行（同 magic 修法）；boomerang/spear/yoyo/flail/grenade/glowstick/summon/thrown
零 autoReuse 件=边沿语义正确。thrown 门直读 combat 表无需 cw 随行 ✓。

**B. 同族停发窗**（Player.cs:43820-43852 同式族）：泛化 TAIL_SILENCE_WIN 表
{3852 书杖:4, 4952 夜光书:4, 6152:4}（win=useTime×N,3852 useTime3→12/4952 useTime2→8
=原版逐字）；4956/5669 ×3=zenithFireCycle `cycle<=2` 帽（方向已对）；4953 ×5=定数
5 连发已接。源码守卫测试同步表化。

**C. GetAlpha 预乘加算族全扫**（Projectile.cs:81007 (200,200,200,25) 组）：
{15 花火/34 火焰鞭/93 魔法匕首/94/95/96 敌诅咒火/1114/253 霜球/258 火球/102 Prime
炸弹}——ADDITIVE_GLOW_PROJS 集中管理,'lighter' 复刻（本仓射手:112 花火/218 火焰鞭/
517 魔法匕首/1264 冰霜法杖/6152）。★95 无 oldPos 拖尾块勘误（Main.cs 只画 94/1114
两支,95 绿尘即尾）——starTrail 移出 95。低 A 族另案：91 圣箭/5 小丑箭
(255,255,255,0)=纯加算白,箭类绘制路径独立未接（登记）。

**D. mouseHeld 门**：cw/ranged 两门已修;thrown 门无 autoReuse 件 ✓;melee 挥击不消费
mouseDown=按住天然连发 ✓。

**偶发测试钉死**：yoyo 1125/钉 514 两处 4% 暴击偶发（crit ×2 vs 精确断言）→
critChance=0 钉死（3×/5× 复跑绿）。

回归：触碰面 9 文件 242 + 玩家绘制域 66 全绿;tsc 零错。

### H.6 瀑布环境音接入（2026-08-25,用户实报"瀑布没有音效"）

原版瀑布环境音=Main.Ambience(:13636-13680) 每 15t 消费绘制期累积的强度→
SoundID 34(瀑布)/35(岩浆) **循环音**（强度=style/音量档,归零拆轨）；强度在
WaterfallManager.Draw 逐瀑布格累积（:709-719 num42=1−dist/(screenWidth×0.75),
最近格记位）→ Main.ambientWaterfall*(:962-964)。合并音（LiquidsWaterLava 等）
本仓早已接线（liquidChangeSound 回调,Game :4038）——缺的只是环境循环层。

实装三件：
1. **循环音资产**：原版 SoundID 34/35 的 xwb 循环音未进 legacy 提取集（528 wav
   无 Waterfall_0/Lava_0）→ 程序化合成（瀑布=白噪高通+低通+双频幅颤 3s 无缝循环;
   岩浆=深低通棕噪隆隆）,public/sounds/Waterfall_0.wav + Lava_0.wav。
2. **绘制期强度累积**：WaterfallRenderer step 环逐格按屏心距离衰减累积
   ambWf/ambLava（type 0 水/type 1 岩浆;ctx.canvas 尺寸=屏心/屏宽口径）,
   ambienceState() 消费口;逐帧重建（同 litCells 语义）。
3. **消费**：Game.updateWaterfallAmbience（liquid.step 后每 15t,suppress 窗静默）：
   强度→playLoopFile('Waterfall_0.wav'/'Lava_0.wav') 音量跟随（×0.12 压档）,
   归零拆轨。

探针 scripts/_wf-amb-probe.mjs：半砖行载流→唇缘溢出构造（★发现条件=唇缘格
halfBrick+同侧液>160+上格近干+对侧开,WaterfallManager L102/L124——满块边缘
不触发）→ 4/4 PASS（发现 count2/强度 9.36/循环轨句柄存活/无岩浆轨不误建）。
headless 解码异步,断言用句柄存活非 playing。

### H.6b 雨幕计入+音量提档（2026-08-25,用户复测"实测没听到"）

用户实测场景=雨云水幕（云洒水到空岛水面）——原版 Ambience 排除 Rain 11/12（雨幕
不计入环境音,Main.cs:709 排除表）＝纯云幕场景原版同样无声,但用户预期合理（可见
水幕无声=体验缺陷）。**刻意偏离（记录在案）**：type 3 雨幕计入环境音累积（雨幕
分支逐格衰减累积,×aF 前景透明度;天降雨=天气循环轨不同系统不受影响）。
音量提档：强度系数 0.12→**0.25**、base 0.5→**0.7**（曾单格帘 0.06 近不可闻;
现单格 0.25 可闻、多格帘满档）。
探针：_wf-cloud-probe.mjs 雨云水幕 3/3（5 帘发现/强度 24.8/轨创建）;水瀑布
4/4 回归绿。★探针坑：__swTiles 与 __swGame 分属不同就绪时刻,等待条件必须全含。

### H.6c 素材/公式改判原版真态（2026-08-25 音频对账,H.6b 音量提档被取代）

H.6①的前提"原版循环音未进提取集（528 wav 无 Waterfall_0/Lava_0）"系误判：
官方素材名是 **Liquid_0/Liquid_1**（Sounds/Liquid_N,LegacySoundPlayer.cs:225,
case 34 瀑布→Liquid[0]/case 35 岩浆→Liquid[1]），一直都在根级 wav 里。
tools/recon-sound-1458.mjs（PCM 级三方对账闸门,PASS）定罪后已换轨：
- 素材：合成 Waterfall_0.wav/Lava_0.wav 已删,改播原版 Liquid_0/Liquid_1;
- 公式：按 LegacySoundPlayer.cs 终值 vol=min(1,strength/50)(:1253-1255)
  ×0.2(瀑布 :1260)/0.65(岩浆 :1292)×(1−shimmerAlpha)(:1261/:1293),
  pitch 瀑布 −0.2(:1273)/岩浆 0(:1305)——**H.6b 的 0.25/0.7 提档废止**
  （1:1 对齐指令优先）。注意小瀑布（strength≲10）在原版口径下本来就近乎
  不可闻（满档 0.2）;若复测仍报"听不到",再议备案式补偿,不回退结构。
- 雨幕(type 3)计入累积的刻意偏离维持不变（与本次素材/公式正交）。

## 分区 I——E 区登记债收口（SW-FX8,2026-09-10）

对盘先行的现状定谳（先于动刀,全部有反编译/盘面双锚）：

| 项 | 现状定谳 | 处置 |
|---|---|---|
| ❌#5 雕像 51 档 | **二批已清**：STATUES 83 档全转录+styleFromFrame[105]+case 105 消费线全通（FX3 只做帧渲染面,物品侧本就未欠）;83=vanilla.json createTile=105 全集 82+470 蘑菇雕像特例（createTile=349）双射实证 | tests/sw-fx8-statue-banner.test.ts 补双射+全帧域往返 0..82 两道闸（变异 M4/M5 证红） |
| ❌#6 旗帜 33+ 段 | **二批已清**：BANNERS 316 档/22 段+styleFromFrame[91]+case 91;316=createTile=91 全集全等 | 同上（往返 0..315+22 段边界锚;双射闸变异证红） |
| ❌#9 桌面支撑门 29/103/462 | **真缺口**：三件落家具 hasSupport 底行 SolidTile2∨墙近似（泥土上也活+贴墙活,与 Check2x1 case 103/29/462 反向）;放置侧 tile-anchors.json AnchorBottom=Table 本就 1:1 | **本批修**：DECOR_SUPPORT_KIND 'table2x1'（Check2x1 :47426-47451 1:1,103 带 AnchorValid(Table) 兜底臂 :52294-52329=anchorTableValidAt 复用）;TILE_TABLE_SHEETS 补 435-439（Main.cs:10124-10131 for 循环臂,76→81 全表）。tests/sw-fx8-table-support.test.ts 10 it（变异 M1/M6 证红） |
| ❌#1 门锁挖掘门 | **SW-G1（2026-09-03）已清**：canKillTile 全式并入锁门分支（Mounts.ts isLockedDoorAt :62500-62503）,tileHitDamage :19288 消费（dmg=0 不积累）,锤整形门 tryMine :18669 同源 | 零改动;locked-door-chain.test.ts 回归绿 |
| 📋D-10 TILE_CUT 两副本缺 454/254/236 | 三件 2026-09-01/02 已补齐（两副本逐值对拍 41≡41）;剩合并债 | **本批修**：Game.ts TILE_CUT_VANILLA 副本删除,单源=tiles.ts TILE_CUT_SHEETS;tests/sw-fx8-tile-cut.test.ts 反编译 Main.cs tileCut 赋值全量反查金标闸（变异 M2 证红）+单源守卫 |
| 📋D-12 镐可清 tileAxe 族 | 手镐侧已闭合（toolMatchesTile TILE_AXE 排除臂+TILE_CUT 无 5/80/72）;**本批新发现**：drill 通道被 def.pick=-1 截断（72 蘑菇树/634/323/583-589/596/616/488/704 整子族钻头坐骑不可锯,原版 PickTile :54398 无分派门+GetPickaxeDamage 无 tileAxe case=可锯） | **本批修**：toolMatchesTile drillMount 臂前置（PickTile 直调语义,手镐双族排除不变）;5/80 与 72 家族口径归一。变异 M3 证红 |
| ⚠️香蒲 519/蘑菇藤 528 掉 183 | **P1×3 批已清**：killTileDropItems case 519（fy==90 基座门）/:528 纯 1/2→183（Game.ts:20066-20082） | 零改动;tile-drop-p1x3.test.ts 回归绿 |

验证：sw-fx8 三文件 23 it + 回归（style-drop-restore 74/decor-support 64/multi-tile-drop 36/sw-fx3 71/sw-bj50 8/tile-drop 族 4 文件/放置门族 10 文件/block-swap 族 3 文件/minecart 2）合计 592 全绿;tsc 触碰文件（Game.ts/tiles.ts/vanillaStyleDrops.ts/tests/sw-fx8*）零错（仓内既有基线错属 zz-*/trail 域非本批）。变异实验 M1-M6 全红后回滚全绿（判别力自证）。
