# 秘密（彩蛋）种子金标对齐总账（HHHHHH 批 · 2026-08-22）

> 任务代号 HHHHHH（只读+对拍，零 src/tests 改动）。目标：确保全部彩蛋/秘密种子的
> 金标都能正确对齐——资产完整性矩阵、每种子 JS 对拍定量、修复排期总账（依赖图）、
> 金标对齐定义书。侦察细节见
> `content-parity-vs-vanilla-2026-08-16.md` 各 RECON 章 + memory 各 `*recon*.md`；
> 槽链配方与豁免口径见 `/tmp/final-runbook.md` ZZZZZ 附录。

## 0. 范围与种子清单

**本批 9 行** = 8 侦察批（RECON-{DRUNK,FTW,NTB,CONST,CELEB,NOTRAPS,REMIX,LIGHTNING}）+ GFB。
原版 1.4.5 权威注册（`Terarria1456/Terraria.WorldBuilding/WorldSeedOption_*.cs`）：
**9 特殊种子**（drunk/fortheworthy/notthebees/theconstant/celebration(=Anniversary)/
notraps/remix/zenith(=Everything)/skyblock）+ **37 SecretSeed**（哈希注册，1.4.5.7 增
moreLightning/noLightning 达 37）。LIGHTNING 两键属 SecretSeed 体系非特殊种子——
零 worldgen 债（见 ⑤）。skyblock 不在本批 9 行内，作搭车项（⑥）。

## 1. 资产完整性矩阵（9 × 5）

格含义：**配方**=确定性复现通道；**基线 .wld**=终态金标（受控对=同种子 flag on/off）；
**槽链**=106 槽×8 通道 dump 链（mile8 逐槽对拍用）；**JS 对拍**=同数字种子+旗标直注
四通道定量（本批 §2）；**债清单**=分支级缺口台账。

| 种子 | 确定性配方 | 终态基线 .wld | 106 槽链 | JS 对拍 | 债清单 |
| --- | --- | --- | --- | --- | --- |
| DRUNK | ✅ `seed_drunk=1`+`-seed 1868024079`（本批补产 hh-drunk） | ✅ `/tmp/sw-recon-drunk/d0516.wld`（真 drunk，文本种子产档=随机数种子 1868024079） | ⏳ hh-drunk（本批补产，7914） | ✅ 55.77/30.41/10.33 | ✅ RECON-DRUNK 章（37 站点/21 文件） |
| FTW | ✅ `seed_fortheworthy=1`+数字（ftw86.wld 即该配方产物） | ✅ `/tmp/ftw-rec/{ftw86,ftw-crc,ctrl}.wld`（ftw-crc/ctrl=同种子 1777078565 受控对） | ⏳ hh-ftw（本批补产，7915） | ✅ 54.61/30.33/9.10 | ✅ memory `recon-ftw-status`（22 处映射；报告未落 doc 章，§7 补录） |
| NTB | ✅ `seed_notthebees=1`+`1372357239`（ZZZZZ） | ✅ `/tmp/sw-recon-ntb/ntb_s.wld` | **★已认证（2026-08-29 七链终局满绿,rrrr-out/x86-ntb,见 §10）** 原 `/tmp/sw-slp/g-secret-ntb`（848 文件/106 槽 PASS） | ✅ 38.31/14.81/5.03 | ✅ memory `recon-ntb-secret-seed` |
| CONST | ✅ `seed_theconstant=1`+`1321365005`（ZZZZZ） | ✅ `/tmp/sw-const-recon/{const_s,normal_1321365005}.wld`（同种子受控对） | **★已认证（2026-08-29 七链终局满绿,rrrr-out/x86-const,见 §10）** 原 `g-secret-const` | ✅ 24.52/15.12/5.78 | ✅ memory `constant-seed-recon`（核心 5 件+跳掷铁证） |
| CELEB | ✅ `seed_celebration=1`（★旗标名非 celebrationmk10）+`1999040562`（ZZZZZ） | ✅ `/tmp/celeb-recon/{celeb_s,norm_s}.wld`（同 RNG 种子受控对，worldId 同） | ✅ `g-secret-celeb` | ✅ 46.03/29.47/7.99 | ✅ memory `celeb-recon`（~70 分支位） |
| NOTRAPS | ✅ `seed_notraps=1`+`1896728457`（ZZZZZ） | ✅ `/tmp/notraps86/{nt_notraps,nt_plain2}.wld`（同种子受控对） | **★已认证（2026-08-29 七链终局满绿,rrrr-out/x86-notraps,见 §10）** 原 `g-secret-notraps` | ✅ 5.68/4.92/0.92 | ✅ memory `notraps-seed-recon`（placeTrap 17 分支+FinishNoTraps） |
| REMIX | ✅ `seed_remix=1`+`1138154190`（remix-seeded.wld 即该配方） | ✅ `/tmp/sw-remix-recon/home/{remix-seeded,remix}.wld` | ⏳ hh-remix（本批补产，7916） | ✅ 57.04/28.02/8.71 | ✅ memory `recon-remix-skyblock-status` |
| GFB(zenith) | ✅ `seed_zenith=1`+`1261990929`（本批补产 hh-gfb） | ✅ `/tmp/sw-recon-gfb/gfb-small-getfixedboi.wld`（8 旗标位全真落盘） | ⏳ hh-gfb（本批补产，7917） | ✅ 60.94/34.04/9.39 | ⚠️ **memory `recon-gfb-zenith-seed` 文件缺失**（secret-seed-recons 索引悬空）；数据在 `/tmp/sw-recon-gfb/probe-out.json`，定量本批补齐（§2） |
| LIGHTNING | N/A（SecretSeed 无 serverconfig 通道=原版事实；确定性通道=交互式 CLI 两行 stdin，仅 rainsForAYear 叠加态才涉 worldgen） | N/A（无 worldgen 分歧可对） | N/A | N/A | ✅ RECON-LIGHTNING 章（零 worldgen 债；运行时两层） |

**侦察报告落盘缺口（本批定谳）**：8 批侦察中仅 RECON-DRUNK、RECON-LIGHTNING 落了
doc 章；FTW/NTB/CONST/CELEB/NOTRAPS/REMIX 六批的完整报告只在 memory 文件
（内容齐全可用）；GFB 批连 memory 文件都缺（索引 `recon-gfb-zenith-seed` 悬空），
仅存 /tmp 数据。§7 补六行摘要 + GFB 定量，索引悬空由本批总账接管。

**ZZZZZ 槽链复核（本批）**：g-secret-{notraps,const,celeb,ntb} 四链各 848 通道文件
+106 P 行，与 ZZZZZ 附录记录一致，只读未触。补产工具 `/tmp/hhhhhh-sec/`
（produce-chains.sh=错峰包装 + genchain/postcheck/sanity 复用件 + cfg-{drunk,ftw,remix,gfb}.txt），
新产隔离目录 `g-secret-hh-*`/`home-sec-hh-*`（ZZZZZ 资产零触碰）。

## 2. JS 对拍总表（同数字种子 + 旗标直注，2026-08-22 实测）

**口径**：vanilla 基线 .wld ↔ JS `generateWorld(数字种子)` + seedFlags 直注
（vi.mock parseSeed——BBBBB「seed/flags 耦合」缺口的探针侧解法，见 §3-S0）。
四通道差 = `_matrixrun` 联合口径（typ=(active,type) 二元组不等；act=存在性子集；
wal/liq 同前例）。报告：`/tmp/hhhhhh-out/report.json`（逐种子头锚/稀疏对象/分带）。

| 种子（基线 seed） | typ% | wal% | liq% | hdrΔ | 头锚差明细 | 树 cc v/j | 箱 v/j | 雕像 v/j | 侦察数字复核 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DRUNK (1868024079) | **55.77** | 30.41 | 10.33 | 5 | ground 361≠337/rock 481≠445/dungeonX 3788≠3676/dungeonY 397≠235/spawnY 272≠235 | 252/178 | 223/174 | 271/199 | 侦察 55.67/30.82/10.38 ✅（Δ+0.10pp=旗标直注后宝石树恒放支生效的流位移） |
| FTW (1671560105) | **54.61** | 30.33 | 9.10 | 3 | dungeonX 3733≠3776/dungeonY 235≠198/spawnY 246≠292 | 221/231 | 187/179 | 279/207 | 侦察「纯 FTW≈48.3%+本底 3%」✅（不同种子对，量级一致） |
| NTB (1372357239) | **38.31** | 14.81 | 5.03 | 2 | spawnX 2113≠2100/spawnY 264≠265 | 380/204 | 177/175 | 216/200 | 侦察 38.27/15.02/4.99 ✅（Δ+0.04pp≈0——crimsonForce 死字段实证：旗标注入不改 JS 输出） |
| CONST (1321365005) | **24.52** | 15.12 | 5.78 | 4 | spawnY 305≠306/treeX/treeStyle/worldId(=抽取位移，见下) | 187/197 | 171/171 | 218/211 | 侦察 A-B 足迹 typ 10.5%+act 14.3% ✅（联合口径 24.52≈两者之和；wal 15.6→15.12/liq 5.8→5.78 逐通道吻合） |
| CELEB (1999040562) | **46.03** | 29.47 | 7.99 | 5 | rock 493≠511/dungeonX 3505≠3506/dungeonY 269≠200/spawn 285,229≠2099,281 | 141/194 | 170/159 | 202/205 | 侦察 45.97/29.50/7.93 ✅（Δ+0.06pp=tenth 宝石树恒放支生效） |
| NOTRAPS (1896728457) | **5.68** | 4.92 | 0.92 | **0** | 无（头锚全等） | 123/165 | 177/177 | **1896**/207 | 侦察「typ 4.31%（含 ~3.3% 当日本底漂移快照）」✅；雕像 1896 vs 207=Statues ×15 债直读 |
| REMIX (1138154190) | **57.04** | 28.02 | 8.71 | 5 | rock 769≠445/spawnY **1065**≠295（出生地狱）/dungeonX/Y | 404/176 | 194/182 | 230/207 | 侦察「act 49.6% 结构倒置签名」✅（本行 zoneAct≈168 万格同量级） |
| GFB (1261990929) | **60.94** | 34.04 | 9.39 | 6 | ground 361≠335/rock 733≠515/dungeon 516,636≠717,241/spawn 2100,1062≠2098,243 | 451/212 | 209/161 | 514/221 | 侦察仅通道哈希（无 %）；本批首份定量=七种子债叠加+专属尾链 |

分带 typ%（sky/surface/cave/deep/hell）与逐格 top 差异对在 report.json `zones`。
全 8 种子 unmapped=0（JS→vanilla sheet 投影无漏）。

**★CONST worldId 抽取位铁证（本批新证）**：五种子 worldId 重放扫描——
drunk/notraps/celeb/gfb 全部 **t=18** 命中（与普通世界同位），**CONST 在 t=16 命中**
（609426797）。即 vanilla Constant 的矿石锁 `if((!constant||drunk)&&Next(2)==0)`
把铁/金两掷关在 if 内不耗——Reset 流**恒 -2 样本**，下游全体（worldId 抽取位、treeX、
dungeon、spawn）随之移位。JS 修复必须先补跳掷（否则一切 Constant 世界全盘错位），
且该证据可从 .wld 头单独复核（无需跑图）。

**旗标直注有效性**（flags-on vs 侦察 plain 数字）：drunk/celeb +0.04~0.10pp
（`GemPasses alwaysTry = tenth||drunk` 是现役消费支，注入即改变流）；ntb ≈0
（crimsonForce 全仓无消费者=死字段）；const/remix/ftw/gfb/notraps ≈0（worldgen
零消费或仅恒 vanilla 门）。**结论：JS 旗标管道通、但消费面≈0——九种子债几乎
全部是未移植分支本体，不是旗标路由问题。**

## 3. 修复排期总账（依赖图）

### S0 · 结构性前置（全种子共享，单独立项，1 批）

> **✅ S0-1/2/3/4 已全部落地（NNNNNN 批，2026-08-22）**——四链 mile8 106/106×4 全绿；
> 验收探针三件全过（notraps 头锚全等+陷阱族 ×100 显现 / celeb 头锚=HHHHH 基线 /
> celeb_s.wld 导入 tenthAnniversary=true+paint 326568/307736 逐格回填）。
> 明文映射 37/37 经 BCrypt 复算器对注册码位级验证（/tmp/s0-verify）。
> 明细=content-parity-vs-vanilla-2026-08-16.md「NNNNNN 批」章。
> **遗留：S0-2③ 文本特殊种子→SetSeedToRandomWithCurrentEvents 语义**（须存档兼容
> 评估，对拍链不受影响）；S0-5 未做（可选）。S0-4 勘误：store paint/paintWall 通道
> 任务书立项时已在位（全链核验），本批实做=SW_MATRIX pt/pw 扩通道。

| # | 项 | 内容 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| S0-1 | **seed/flags 解耦管道** | `GenConfig.seedFlags?` 覆写位：`generateWorld`/`vanillaTerrain` 两处 `parseSeed(cfg.seedText)` 改为 `cfg.seedFlags ?? parseSeed(...)`（WorldGen.ts:57/:445/:468）；探针 vi.mock 路径退役 | 数字种子+任意旗标组合可产（本批 _hhhhh1 八行数字可经公开入口复现） | ✅ NNNNNN |
| S0-2 | **parseSeed 明文扩容** | ① drunk 数字路由（SpecialSeedValues{5162020} 接 translateSeed int 路 + CRC32 碰撞串自动命中；删自造 `drunkworld` 别名）② celeb 零填充/负号（5162021/5162011 int 路）③ 特殊种子文本命中→`SetSeedToRandomWithCurrentEvents` 语义（文本→随机流+置旗，替换现 CRC32 固定流——★语义修正，须与存档兼容评估）④ getfixedboi 七依赖全置（现缺 noTraps/theConstant/tenthAnniversary）⑤ NTB crimsonForce 死字段删除 | 触发语义对照 WorldGenerationOptions.GetOptionFromSeedText 逐条 1:1 | ✅ ①②④⑤ NNNNNN；③ 遗留 |
| S0-3 | **WldParser 旗标位回填** | v222 drunk/v227 good/v238 tenth/v239 dontStarve/v241 notTheBees/v249 remix/v266 noTraps/v267 zenith/v302 skyblock 九位读入 `world.seedFlags`（现读位即弃——导入原版特殊种子档丢全部特性） | 导入任一基线 .wld 后 seedFlags 与 wldgrid.py 头读一致 | ✅ NNNNNN |
| S0-4 | **paint 数据面+第四通道** | JS 生成器无 color/wallColor 存储——drunk FinishDrunkGen/FTW FinishGetGoodWorld/celeb Paint 系列全部不可见；store 加 paint/paintWall 通道 + SW_MATRIX/sanity 扩通道 | drunk/celeb/ftw 修复批可对拍涂装 | ✅ NNNNNN（store 通道已在位；补 SW_MATRIX pt/pw；/tmp sanity.py 未动） |
| S0-5 | **serverconfig 通道（可选）** | JS 侧对等物=世界创建入口旗标面板/配置（原版 `seed_<ServerConfigName>=1` 九名：drunk/fortheworthy/notthebees/theconstant/celebration/notraps/remix/zenith/skyblock）；JS room server 若需 autocreate 特殊世界才必要 | 配方复现 ZZZZZ/hh 链等价档 | ⬜ 未做（可选；S0-1 直注已覆盖对拍需求） |

依赖：无。**所有种子修复批的前置。→ 已清，A/B/C 组修复批可开（推荐序不变）。**

### A 组 · 叠加型（普通世界骨架不动，加/改局部）

| 种子 | 债规模（本批 typ%） | 依赖 | 预估 | 验收口径（对拍链/基线） |
| --- | --- | --- | --- | --- |
| **CONST** | 24.52%（纯足迹 typ 10.5%+act 14.3%） | S0；**矿石跳掷是全种子最小编号先决修**（t=16 铁证） | 1-2 批 | `g-secret-const` 链 mile8 + `/tmp/sw-const-recon/const_s.wld`（受控对 normal_1321365005 同在）；顺序=WavyCaves(cs:12301)→LavaLayerCaverer(:74003)→MarblePileWithStatues(:10421 白漆 26)→蜘蛛墙 62+webs y=50→运行时族独立批（hunger/黑暗/sepia） |
| **NOTRAPS** | 5.68%（纯足迹 typ 4.09%/act 2.93%） | S0；前置仅 item 5346 Gas Trap 入物品空间 | 2 批 | `g-secret-notraps` 链 + `/tmp/notraps86/nt_notraps.wld`（受控对 nt_plain2）；批 1=placeTrap 17 分支+Traps pass 支线（×100/采样域/TNT/沙×5/巨石窗）；批 2=FinishNoTraps 新 pass+Statues ×15（雕像 1896 vs 207 直读验收）+Piles 巨石堆+AddBuriedChest 死箱 |
| **CELEB** | 46.03%（≈纯足迹——JS 零消费） | S0-4（paint 通道硬前置：Paint 系列/彩虹带/彩绘） | 2-3 批 | `g-secret-celeb` 链 + `/tmp/celeb-recon/celeb_s.wld`（受控对 norm_s）；批 1=Reset 3+Pass ~30 分支（金字塔保底/剑冢 ×2/宝石洞 ×1.5/苔藓 ×2/巨石 711）；批 2=Finish 全家（ConvertSkyIslands/Paint*/ImproveAllChestContents 前缀引擎——GoodPrefix 表取 1456 召唤 5 项）+微光巨化+StarterNPC；运行时 ~18 处独立批 |
| **DRUNK** | 55.77%（纯债 +50pp over 普通基线） | S0-4（FinishDrunkGen 涂装不可见）；RNG 流零漂移已证（worldId t=18）=分支移植即收敛型 | 3-5 批 | hh-drunk 链 + `/tmp/sw-recon-drunk/d0516.wld`；顺序=掷流照掷照弃族先行（Beehives 额外 RandomWorldPoint/TileRunner ±80% 双掷/1/30 跳变/TerrainPass 长爬升表）→双矿石 per-vein→双邪恶对半（crimsonLeft）→地下地牢族（无地表入口/死树/老人屋）→地狱反转+残屋时序→FinishDrunkGen（paint） |

### B 组 · 转化型（全域改写，各需专属批）

| 种子 | 债规模 | 依赖 | 预估 | 验收口径 |
| --- | --- | --- | --- | --- |
| **NTB** | 38.31%（纯转化 ≈33-35%） | S0 | 2-3 批 | `g-secret-ntb` 链 + `/tmp/sw-recon-ntb/ntb_s.wld`；批 1=NotTheBees() 转化核（:25275-25507，×6 槽调用位=MudCaves/SettleLiquids/FragileIce/LifeCrystals/QuickCleanup/SettleLiquidsPart2）；批 2=FinishNotTheBees(:25535)+OverGrownedDungeon+17 门族；批 3=运行时（音乐 86/bgStyle3/钓鱼折半/商人货架/spawner Merchant） |
| **FTW** | 54.61%（纯足迹 ≈48.3%+油漆 43 万格） | S0-4（FinishGetGoodWorld 油漆 18 万格+墙漆 25 万格不可见） | 3-4 批 | hh-ftw 链 + `/tmp/ftw-rec/ftw86.wld`（受控对 ftw-crc/ctrl 同种子对可拆纯足迹）；顺序=TileRunner 增强(:77141 主驱动)+TerrainOffset→各 pass 计数族→tileSolid[56] 黑曜石开窗(16855-21055)→FinishGetGoodWorld(:25942)+paint→地牢入口翻转(LegacyDungeonEntrance:114) |
| **REMIX** | 57.04%（act 49.6% 结构倒置签名） | S0 | 3 批（+skyblock 搭车 1 批） | hh-remix 链 + `/tmp/sw-remix-recon/home/remix-seeded.wld`；批 1=TerrainPass 4 分支（rockLayer=0.5-0.6h/lavaLine 抬地表/remixMushroom+remixSurface GenVars）+Reset 池（地狱箱 112→683/丛林锚 20-35%）；批 2=SpawnPoint 地狱+52 pass remix 支（Y 域换算）+Liquid.cs:179 倒置液转岩浆；批 3=沙漠/地牢族 19 处；★skyblock=「加」型专用 pass（GenerateSkyBlockWorld+SkyblockIsland ~500 行+denyAll 门+v302 位），基线 `/tmp/sw-remix-recon/home/skyblock.wld` |

### C 组 · 组合型（排最后）

| 种子 | 债规模 | 依赖 | 预估 | 验收口径 |
| --- | --- | --- | --- | --- |
| **GFB(zenith)** | 60.94%（全表最高=七种子债叠加+专属尾链） | **全部 A/B 组种子批 + S0**（继承债清偿是其前置） | 2 批 | hh-gfb 链 + `/tmp/sw-recon-gfb/gfb-small-getfixedboi.wld`；批 1=七继承验收（逐旗标单开链复跑归因继承债 vs 专属债）；批 2=专属尾链（Mechdusa/remix×getGood 物品变体、zenith 专属 pass 分支、Everything.Dependencies 级联语义） |

### D 组 · 非 worldgen（不进金标对拍体系）

| 种子 | 处置 |
| --- | --- |
| **LIGHTNING**（moreLightning/noLightning） | 零 worldgen 债（RECON-LIGHTNING ④）；运行时特效两层（Layer 0=雷击弹引擎全链——1456 既有引擎缺口；Layer 1=1457 增量 ~9 消费点+存档 v323 门+msg7 2bit）。**1456 基线下 JS 现态即终态**；随 1457 接口批次移植，无对拍/金标需求（唯一受控基线=rainsForAYear×moreLightning 叠加态，配方=CLI 两行 stdin） |

### 推荐执行序（串行口径）

```
S0 → CONST(最小债+跳掷先决,验证管道) → NOTRAPS(叠加型第二小,验证 Finish 新 pass 模式)
   → NTB → CELEB(需 S0-4) → FTW(需 S0-4) → DRUNK(需 S0-4,分支最多)
   → REMIX → GFB(继承验收+尾链)
   （LIGHTNING 随 1457 批；skyblock 搭 REMIX 批）
```
理由：CONST/NOTRAPS 最小且资产最全（受控对+槽链齐），先跑通「旗标→分支→mile8
滚动清偿」全流程并暴露 S0 遗留；paint 依赖种子（CELEB/FTW/DRUNK）在 S0-4 后并行
窗口展开；GFB 必须收尾（继承债未清时其 60.94% 无法归因）。

## 4. 金标对齐定义书（彩蛋种子验收标准）

一个彩蛋种子宣告「金标对齐」当且仅当以下四条全绿：

1. **确定性配方可复现 .wld**：`serverconfig seed_<ServerConfigName>=1 + -seed <数字>`
   （或该种子的等价确定性通道）产档，与侦察基线 .wld **worldId 相等 + 八通道零豁免
   0 差**（WLDvWLD 双验，ZZZZZ 口径）。LIGHTNING 例外：无 worldgen 分歧，本条 N/A。
2. **槽链 sanity**：106 槽×8 通道 dump 链（`SW_DUMP_ALL`+`SW_PASSCHAIN`），槽名序与
   普通链 106 名逐位相同（1456 特殊种子不改 pass 列表，ZZZZZ 事实④）；槽105 vs
   基线 .wld sanity PASS（豁免仅两条：typ 幽灵格=act==0；lty 干涸残型=dump.liq==0；
   其余六通道零豁免）。
3. **JS 四链式滚动清偿到 #105 全绿**：mile8 逐槽对拍（JS 链 vs dump 槽，`_mile8` 同款），
   首差槽号单调推进至 #105；终态=四通道 typ/wal/liq 回到普通世界基线量级
   （参照 x86 矩阵均值 typ 5.71%/wal 4.37%/liq 0.79%）+ 头锚 hdrΔ=0（spawnY±1 可备案）
   + worldId 抽取位正确（普通 t=18；CONST t=16）+ 稀疏对象计数收敛。
4. **旗标管道在档**：S0-1~S0-3 全落地——JS 能以「数字种子+旗标」公开入口复现基线
   （本批 §2 表数字即各种子修复批的起点基线，修复后同口径复测逐列不升）。

复用方法论：SW_MATRIX 四通道口径、_matrixrun/_oraclesync、掷账 harness（_ffff1 同款）、
sanity.py 豁免口径、genchain.sh 产链纪律（md5 双复核/独立 HOME/专用端口/自起自 kill）。

## 5. 本批新证与坑（方法论）

1. **seed/flags 耦合缺口的探针解法实证**：`vi.mock('../src/world/gen/SeedEasterEggs')`
   包装 parseSeed 对指定 seedText 强制旗标并集——八种子全部跑通。修复期正式通道=
   GenConfig.seedFlags（S0-1），探针（tools/_hhhhh1.test.ts）已按纪律删除，报告在
   /tmp/hhhhhh-out/report.json，配方在 runbook HHHHHH 节。
2. **CONST worldId t=16**：矿石跳掷 -2 样本的 .wld 头级铁证（§2）；任何 Constant 修复
   不补跳掷则全盘错位，且该证据零成本可复核。
3. **act 通道探针侧口径**：本批探针 overall.act 未累加（z.act 分带值完整在
   report.json zones）——读数请用 zones.act 或重跑；typ/wal/liq 三通道不受影响。
4. **侦察报告落盘纪律**：侦察批交付时报告只进 memory 不进 doc 章=总账断链
   （六批报告 doc 缺章+GFB memory 悬空）。后续侦察批交付物必须含 doc 章落盘。
5. **服务器确定性配方普适**：`seed_<ServerConfigName>=1`+数字 -seed 与「文本种子
   随机抽中态」逐位等价（ZZZZZ 四链双验+本批 hh 四链沿用）；旗标名
   celebration（非 celebrationmk10）/zenith（非 getfixedboi）/theconstant（非 constant）
   三个易错。

## 6. 资产索引（修复批直取）

| 资产 | 路径 |
| --- | --- |
| JS 对拍报告（八种子全量） | `/tmp/hhhhhh-out/report.json` |
| 槽链（已备 4+本批补产 4） | `/tmp/sw-slp/g-secret-{notraps,const,celeb,ntb}` + `g-secret-hh-{drunk,ftw,remix,gfb}` |
| 产链工具 | `/tmp/zzzzz-sec/{genchain,postcheck,sanity,wldgrid}.py·sh` + `/tmp/hhhhhh-sec/{produce-chains.sh,cfg-*.txt}` |
| 基线 .wld | §1 表逐行 |
| 侦察报告 | doc 章×2（DRUNK/LIGHTNING）+ memory×6 + 本批 §7 补录 |
| worldId 抽取位扫描 | runbook HHHHHH 节（_hhhhh2 一次性探针已删，十行可重建） |

## 7. 六批侦察摘要补录（doc 缺章接管；全文本见各 memory 文件）

- **RECON-FTW**（memory `recon-ftw-status`）：FTW worldgen 22 处映射；主驱动=
  TileRunner 增强(:77141)+TerrainOffset；FinishGetGoodWorld(:25942-26128 油漆 18 万格
  +墙漆 25 万格)整缺；tileSolid[56] 黑曜石 16855-21055 开窗；地牢入口翻转
  (LegacyDungeonEntrance:114)；天使像 1/15 ×7；纯足迹 48.3%+油漆 43 万。
- **RECON-NTB**（memory `recon-ntb-secret-seed`）：NotTheBees():25275-25507 ×6 槽+
  FinishNotTheBees:25535+OverGrownedDungeon 全缺；17 门族；crimsonForce=自造死字段；
  基线 hive 389,090/蜂蜜液 83,094/幼虫 171。
- **RECON-CONST**（memory `constant-seed-recon`）：核心 5 件（WavyCaves/LavaLayerCaverer/
  MarblePileWithStatues/蜘蛛墙 62/webs y=50）全缺；★矿石锁跳掷 -2 样本（本批 t=16 铁证）；
  纯足迹 act 14.3%/typ 10.5%/wal 15.6%/liq 5.8%；运行时=hunger/黑暗伤害(1456 终值
  60t 警告/120t 起伤/250 伤)/sepia/仙人掌接触伤/掉落 DontStarveIsUp。
- **RECON-CELEB**（memory `celeb-recon`）：~70 分支位（Reset 3+Pass ~30+Finish 全家
  +微光巨化+宝箱两处+StarterNPC）+运行时 ~18 处；Finish=Paint*/ConvertSkyIslands/
  ImproveAllChestContents（GoodPrefix 表 :3774-3784，召唤 5 项取 1456）；JS 正则漏
  零填充/负号/CRC 变体。
- **RECON-NOTRAPS**（memory `notraps-seed-recon`）：placeTrap :8875-9460 十七分支+
  Traps pass ×100/采样域/TNT/沙×5+Statues ×15+Piles 巨石堆+MicroBiomes 三处+
  FinishNoTraps(:26129-26367 全新 pass)+AddBuriedChest 死箱；前置仅 item 5346；
  纯足迹 typ 4.09%/act 2.93%/wal 1.50%/liq 0.36%。
- **RECON-REMIX**（memory `recon-remix-skyblock-status`）：worldgen 零消费 remix/
  skyblock；remix=「改」型（TerrainPass 4 分支+Reset 池+SpawnPoint 地狱+52 pass 支
  +Liquid.cs:179 倒置+沙漠地牢族 19 处），act 49.6% 倒置签名；skyblock=「加」型
  （GenerateSkyBlockWorld+SkyblockIsland ~500 行+denyAll 门+v302 位）；运行时已接
  ~30/252 处。
- **GFB（本批定量接管）**：基线 8 旗标全真落盘；JS 对拍 typ 60.94%/wal 34.04%/liq
  9.39%/hdrΔ6（ground/rock/dungeon/spawn 全移位=remix 倒置+drunk 地形核叠加）；
  雕像 514 vs 221、树 451 vs 212。专项侦察批（依赖级联语义+专属尾链清单）待 GFB
  修复批前补做。

## 8. ★1457 真值定版与 1.4.5.8 第三战役登记（GGGGGGGG 批 · 2026-08-24）

### 8.1 版本定版裁决（用户已裁）

**钉 1457**：项目真值基线=Terarria1457 反编译源（AssemblyVersion 1.4.5.7）。
caves-oracle 的 UnifiedRandom 反射加载（Steam exe）**退役**——该 exe 08-24 10:36 已升
**1.4.5.8**（strings 实证），继续 LoadFrom 即产出 1458 掷流（污染真值源）。oracle 改
**源级转录**（Terarria1457/Terraria.Utilities/UnifiedRandom.cs 逐行入 oracle 文末
class UnifiedRandom；与 1456 版 diff=零差异，双版同真值；SeedArray/inext 放宽 public
仅供内部态指纹自省）。**验收铁证**：改造后 oracle（9293480）76 检查点与 committed
caves-chain 金标**逐字节全等** + dungeon pass 末流指纹 f890f8a6=x86 真值——转录零漂移。

### 8.2 1457 真值重产状态（三线 #32 解锁的 truth 源）

caves-oracle 地牢域已按 1457 重转录（GGGGGGGG 批，逐项源行号在
content-parity-vs-vanilla-2026-08-16.md GGGGGGGG 章）：①灯笼 Next(3)（JS R11-D2 已有，
双端对齐实证）②吊灯资格门 wallDungeon 全族+GOTHIC 5744（**JS 缺**）③④房/廊砖环缘格
resetTile 计算化=墙保留（**JS 缺**，walls 通道）⑤Late GOTHIC 门替换（**JS 缺**，
9293480 实测 22 门命中、+66 掷）⑥precalc 失败回退 Legacy+1 掷（1456/1457 两版皆有，
JS R11-D3 已接但**掷值丢弃仍传旧 entSeed=回退路径种子偏差**，precalc 成功路径零差）。
**#32 三方对拍（9293480，post-Dungeon 全格）**：oracle-1457 vs x86-1456 差 52,139 格
=真 1456→1457 增量；JS vs x86 差 52,030 格（其中与 oracle 共有 51,197=①级联主体）；
**JS 缺口=942 格**（t34 吊灯 45+位移族+wal 169=②③④⑤ 未接）+JS-only 833 格（②③
网格差引致的饰件锚位移）。orB 消融实验（去②③⑤）43 检查点 typ/act/liq 与 JS 全等——
缺口归因闭合。

### 8.3 1.4.5.8 第三战役（登记，本批不动）

Steam exe=1.4.5.8（changelog 顶=Version 1.4.5.8）。worldgen 域修复两条**命中彩蛋域**：
1. 「Fixed paint not applying to the dungeon in certain Not The Bees seed worlds」——
   **NTB** 地牢上漆（NTB 批 2 OverGrownedDungeon/地牢漆域，修复批须按 1458 终态转录）。
2. 「Fixed Dungeon Guardian appearing in seeds where the dungeon is underground even in
   the intended fighting entrance」——地下地牢（remix/dualDungeons 族）入口域守卫人判定。

**战役方案**：①真值源=重反编译 1.4.5.8（ilspycmd 流水线复用 docs/diff-1456-1457-*：
diff-methods-1456-1457.py 方法级 diff+behavior/semantic/summary 四件套；★嵌套类
SIG_RE 盲区坑在案，SecretSeed/Skyblock 族须补扫）；②caves-oracle 再走一次「转录翻版」
（UnifiedRandom 1456→1457 零差先例，1458 预计同样低危；pass 域按 diff 清单逐项）；
③x86 dump 重产需 1458 服务器 exe（当前 TerrariaServer.hs.exe=1456 冻结件勿覆写，
/tmp/sw-slp/Terraria.app=08-18 1456 冻结件勿覆写）；④三线收官顺序不变
（§3 推荐序），1458 增量并入各线修复批而非独立重跑。

## 9. IIIII14 批（2026-08-28）：DRUNK 生成内容层首波落地（30 消费点）

DRUNK 修复批收官账本见 `content-parity-vs-vanilla-2026-08-16.md`「IIIII14 批」章
（分支清单 ①/RNG 纪律②/探针证据③/护栏④/排期⑤）。要点：
- **P0 双邪恶群落全链**：crimsonLeft 落盘 → CorruptionAndCrimson 双分支
  （各半组数、猩红侧锁 crimsonLeft 半侧、num19=100 非对称中带、hearts 夹双分支间）
  → 祭坛/珠 style 半侧规则 → 双邪恶矿并生。
- P1 已落：Reset 雪原带双翻、金字塔 chance=1.0+minDist 110、OresAndShinies 逐脉
  重掷+双生矿带、地牢 y0=ws+70、蜂巢 ×0.667+弃掷、Underworld 中带门+×2w runner+
  灰烬草树时序反转+AddHellHouses 横带反转、TileRunner 五触点、TerrainPass 0.15/0.28
  +长爬升表、JunglePass 地表隧道截断、MarbleGranite 互换、Moss 中带跳过、地下丛林树
  恒跑、GrowEpicTree 矮化、SpawnStarterNPCs 裸 drunk→派对女孩 / drunk×const→机械师。
- 探针 scripts/_iiii14-drunk-probe.mjs：17/17（5162020 双邪共存双阈值）；
  护栏 worldgen-1457-rewire/micro-biomes/seed-parity/liquid-settle-golden 全绿。
- 剩余排期（岛族/paint 通道/地牢入口族/神庙三倍体/HiveBiome 内参/组合域/GFB 合并注意）
  见 IIIII14 章 ⑤；全种子覆盖度另见 secret-seed-audit-matrix-2026-08-28.md。

## 10. 终局·七链满绿认证与各种子状态定谳（2026-08-29）

七链权威复跑（配方法纪律/G2 源/结果 md5 全录 **content-parity-vs-vanilla-2026-08-16.md「终局·七链满绿宣告」章**；档案 /tmp/endgame-cert）。本计划域内三种子（NTB/CONST/NOTRAPS）**tile 面已随链认证到顶：0..105×8ch 满绿、槽名实校验零名实不符**——§2 的债百分比数字与 §1 表「106 槽链」列自此作废为历史侦察值。

| 种子 | 终局状态（2026-08-29） | G2 认证目录 | 登记项残留 |
|---|---|---|---|
| NTB(notthebees,1372357239) | ✅ **已认证·满绿**（notTheBees 别名 ntb;38s） | /tmp/rrrr-out/x86-ntb | 无 tile 面残留；运行时族按 audit-matrix 行#9 P2 维持 |
| CONST(theconstant,1321365005) | ✅ **已认证·满绿**（theConstant 直注,自然 evil） | /tmp/rrrr-out/x86-const | 无 tile 面残留；hunger/黑暗/sepia 运行时族=非 tile 面（行#4 P2） |
| NOTRAPS(notraps,1896728457) | ✅ **已认证·满绿**（noTraps 直注,EVIL1） | /tmp/rrrr-out/x86-notraps | #105 Final_Cleanup 已归零(IIII39/40 收口)；物品空间 item 5346 前置既落 |
| g/m/s22222/12345（普通线四_lane） | ✅ 已认证·满绿（同上章矩阵表） | rrrr-out/x86-{g,m,s22222,12345} | — |
| CELEB(celebration,1999040562) | ★**106 行只差 1 槽（IIIII67 批,2026-08-30）：#97 Micro_Biomes 定罪清偿=EnchantedSwordBiome 入口竖井 `||tenth` 短路门缺失（竖井恒雕+die恒耗，曾整段跳过 ⇒ Camps/Mine/Mahog/Tracks/Lava 全体源点平移=三带 ~30k conversion），mile8 #97..#104 连锁归零、row105 尾差 A54k→A3/T21（仅 (1806..1807)×(487..488) RollingCactus 四格独立面移交 IIII68）**；同批收割 #105 尾差族六刀：ConvertSkyIslands 云线取最低岛+PaintTheMushrooms 519 frameY90 帧谓词+Shimmerator 1:1 重写（每调用清集/递归 DFS/SolidTile 全项/OOB 弃用）+SHIMMERATOR_CAP=3500（AddSpikeCaves 遗写）+TILE_CUT_FC 键域 sheet 修复；仪具=x86 rrrr-rigs/src 重编译（marks 中立性 106槽×8ch==G2）＋JS _iii69mb 步骰账（SHIMA/PMB/CSI/死箱 rc-delta 全对齐）；mile8 快照 {SW_MB_1457:"1",seed:1999040562,size:4200×1200,EVIL:0,FLAGS:tenthAnniversary,G2:/tmp/iii48-out/x86-celeb}——详见 content-parity「IIII67 批」章＋/tmp/iii69-out。次级原注：T1 双刀收官推进（IIIII65 批,2026-08-30）：#32/#69 双残差均清偿,mile8 red74→red9、内容前沿 #69→#97 Micro_Biomes**——
  ① B 刀 #32 定罪=SpreadWallDungeon 的 SolidTile 谓词缺 halfBrick/slope 两判项(cs:70650-70666;檐帽坡位石堵死洪水,角柱四格永不入队),修复=DungeonPass.dgSpreadSolid 全项版仅扩散判定切换(共享 dgSolid 不动);字节级 stage 快照实证 dungeonL..D 全等+dungeonW 仅四格=「BFS 队列序」预置嫌疑再证伪;DRUNK row32 W4→0 联动增益。
  ② A 刀 #69 三连定罪=(a)tenth 岛风格矩阵整缺(cs:13156-70 tenth→style6 ⇒ 喷泉臂必进,JS 曾恒 style0)(b)cs:79903-14/79940-47 挖空/门洞只 active(false)+wall 不清 type ⇒ sunplate 幽灵位(rig 单屋 84 格)被喷泉采样门直接消费,JS 置零致 att 数百级偏移+下一屋 halfW 错值 (c)chestStyle getGood?2:13 收录。mile8 反演重放三层法=行级窗口/raw-stage 字节快照/mark·rc·att 步骰账(仪=/tmp/iii67-out+rig 拷贝 /tmp/iii67-rig-src)。
  ③ 回归九链全绿(g/s22222/const/ntb/notraps/12345/m/skyblock/ftw)+金标十件套 53 tests 零写入。
  尾部 red9=#97..#105 Micro_Biomes 族(T1 清偿移交:三大地下带 conversion 家族 ~30k 格,与本批无关既有债)。原记：（IIIII52 批：#59 离线重放 harness 建成＋受控重放坐实残差「内部性」——vanilla-exact 输入下 rep-base 66,124 骰/dA10,188/dW8,203 与 r12 同量级；三候选谓词 lava±2/IsSolid 语义/pad5 **全部洗清**；x86 全窗 TAGLOG 硬数字 builds=38·wood=27 EXACT vs JS wood≈19 ⇒ 主题分类分布系统性偏离；首分叉压缩至 [~3900..4300] 且定性「零骰门判定翻转」（失败↔成功互翻不动流长，靠拒绝采样重排坐标摊全网=Δ+3,153 谜底）；下批单刀=findRoom/getHouseType 同值异判谓词细部；#32 维持与 DRUNK 车道共享定罪（本批证 G2 高地表 99/9/89 马赛克非 DGWV 所写、写者仍在 Dungeon pass 内部未锚），r13 终态读数=r12 同值 | /tmp/iii48-out/x86-celeb（G2 不动）＋控制链 /tmp/iii50-out/rigcn ＋本批仪具 /tmp/iii54-out（rigT 逐骰栈/replay harness/exp-store） | content-parity IIII52 批章 §①~⑥ |
| SKYBLOCK(skyblock,20260829) | ✅ **已认证·满绿**（★IIIII44 批,2026-08-29:加型生成器本体实装+107 槽×8ch 全绿,9s） | /tmp/iii46-out/x86-skyblock | 生成面零残留；运行时 lowTiles 系/NpcDrops SkyblockIsUp 族/team 岛集合(ExtraSpawnsRoyale landmassData)为非 tile 面登记债（audit-matrix 行#8 P2）；extraLivingTrees 组合 GrowLivingTree 特化支未移植 |
| FTW(fortheworthy,1671560105) | ⏳ **T1 车道首段建成**（IIII42 批,2026-08-29：G2=/tmp/iii44-out/x86-ftw——dotted autocreate 配方 seed="1.1.1.4.1671560105"（size.mode.evil(1=corruption).optionBits(4=ForTheWorthy).seed）；**终态 act/typ/wal/liq/lty/half/slope 七通道 ≡ 官方 Steam TerrariaServer.exe v1.4.5.8 同配方产物**（外部仲裁级中立性，比同代仪器三跑互同更强）＋sum0 对照点官方互证；**IIIII50 批推进（2026-08-29）：#10..31 槽全绿**——池味残差定罪=TileRunner 海滩带 num3 烙灭(:77764)漏移植（非序列错位），修后 #10..17 Lt 族清零；台账 12 项清偿 8 修（HellHouses 76 强制/SonOfLakinater 熔岩湖/ShroomPatch×1.5/SpiderCaves×3/makeTemple×3/neonMoss×1.5/Moss 窄带/FinishGetGoodWorld 整函数），rig-v 插桩二进制对 FTW 配方 848 文件中立性认证；前沿余 #32 地牢城邦族 ~8.2 万格=与 IIII47 DRUNK 链同家族的 inner-instance LCG 域共有债（content-parity IIII50 章 §③）） | /tmp/iii44-out/x86-ftw | SpiderCaves×3(:17492)/Moss 强制带(:17625)/tileSolid[56] 开窗↔还原(:16870/:21073)/Traps 组合臂(:21241,:21392)/FinishGetGoodWorld 油漆族(:22639,wld paint 层承载)/AddHellHouses(:32449)/makeTemple×3(:33756)/AddBuriedChest num10=52(:36425)/SonOfLakinater lava湖(:80918——recon「FTW 不支持 lava 湖」记载已翻案)/ShroomPatch×1.5(:81107)/neonMoss×1.5(:9777)/ItemVariants 物品池域 |

| 六秘种子批（IIIII77,2026-08-30）：SGIS(suchgreatheights,771001)/TOAD(toadstool,771002)/FISHMOX(fishmox,771003)/SPARKLE(doesthatsparkle,771004)/JAGGED(jaggedrocks,771005)/RAINBOW(rainbowroad,771006) | ⏳ **T1 车道建成·两绿四残**（G2=/tmp/iii80-out/x86-{sgis,toad,fishmox,sparkle,jagged,rainbow}；rig=/tmp/iii80-app.app，JJHook PreGen 六 SW_FLAG_* 旗标注入+PcPath 双写块套 SW_PC_DOUBLE 门；控制链 g 全106槽 FNV==认证基线）。**TOADSTOOL 满绿(0..105)**。残留：sgis #89 vine×2＋#97/#103 上提形状派生位族、fishmox #105 装饰杀族(A21/T141)、jagged #16 打孔臂步级语义(TileRunner dig 组合)、sparkle/rainbow #32 Dungeon 装饰漂移——**rainbow 旗面 finalize 才生效仍同锚红 ⇒ 坐实为 DungeonPass 种子性既有债非本批回归**。批内双定罪=①lane env 跨链残留污染（串行 export 不清旗→跨旗越域,已修「每链六清」）②SecretSeedDoEndsPass Next(a,b) off-by-one 全家族（nextIntRange 实为 Exclusive 直传误读含上界,toad 修后满绿坐实）——详见 content-parity「IIIII77 批」章 XIII | /tmp/iii80-out | 判读纪律新条目=mile8 slot0 红先查链配方污染再查 JS；/tmp/iii80-out/MANIFEST.md 全配方 |

**不入本终局的在途面**（对应 §3 排期残卷）：DRUNK=**T1 攻坚在途·88→78 红（★IIIII47 批,2026-08-29）**：G2 不变；**#18 边缘残迹清偿 ✅**（runMudCavesPass②flood 边界 `>=w-5` → C# `>maxX-5` 定罪修，cs:10054 tileCounterNext）；mile8 0..27 全绿、首差 #28揭幕（underworld 窗 ≈4.1k 格零骰写分叉——21,806,910 样本骰流逐位全等、JS 尾多 685k＝quickWater/hellFort 余项/灰烬带 ghost 写三类嫌疑待审）；#32 地牢族 **仪器级定罪未修复**：主流(genRand)全程逐位对齐（LCS 交错归并）、差异全为 inner-instance LCG 延续采样双向不对称 ⇒ 残差在「非骰写面」（早段写砖/保护谓词/读旧态分支），左翼 [3104..3399] 仅 JS 有；「cs 13136-13641 drunk 支」系 remix 内层矿变支与本世界无关（假设翻案）。掷流仪新律：x86 SW_ROLLWIN 分段标签 K 实载 pcIdx=K+1 的骰。mile8 快照 {SW_MB_1457:"1",seed:51620200,size:4200×1200,EVIL:-1,FLAGS:drunkworld,G2:/tmp/iii47-out/x86-drunk}——详见 content-parity「IIII47 批」章＋/tmp/iii49-out 档案。~~FTW/REMIX(+skyblock)/GFB 各线未达金标定义书 §4 四条全绿~~（SKYBLOCK 于 IIII44 批达标并出线；**FTW 于 IIII42 批升格在途——G2 /tmp/iii44-out/x86-ftw 建成+官方 Steam 二进制终态双点互证，mile8 0..9 槽满绿、前沿=#10 Small_Holes 池味残差族（Next(4) 序列错位），状态行 FTW:T3→T1(链面建成,清偿移交掷流仪器批)**，详见 content-parity「IIII42 批」章；**REMIX 于 IIII43 批升格在途——truth 链 /tmp/iii45-out/x86-remix 双产+中立性三证+remix 支五波落地，mile8 0..11 槽全绿、前沿=#12 Rock_Layer_Caves（掷窗账 rig 9,017,229 vs JS 8,541,215），状态行 REMIX:T3→T1(链面建成,清偿移交下批)**，详见 content-parity「IIII43 批」章；**IIIII48·B 批清偿推进（2026-08-29）：#12 定谳=remix 附加双发环四处闭/半开界偏位（raw 流前缀恒等而写面偏 ⇒ −476k 耗骰），修后 mile8 0..18 槽全绿——含 #15 IceBiome 整转线换轴（占位掷+950 底）与 Reset 丛林锚 Next(20,35)；前沿推进至 #19 Full_Desert（沙漠 remix 五件套已落：BlockRows 固定/SandMound 保液/裸露沙岩翻沙尾段/Hive 深域门+液回写/AddTileVariance 深域跳过；残余 Y1>0×7483 归因上游 ghost 位牵动泥狩猎——ghost 一致性专项已立刀口），七满绿回归 g/s22222/const 复跑仍 106/106 满绿，详见 content-parity「IIIII48·B 批」章+/tmp/iii51-out**；GFB 未动）;CELEB=**T1 攻坚在途（★IIIII56 批,2026-08-29）：前沿守恒 red74 first=#32**——A刀 #59 定罪收窄：序数结构对账法取代 vacuous 值对拍，前 17 尝试逐序数咬合、首行为分叉=k16 蘑菇屋@2403 单屋四相骰差+28（墙帧/Dither/Fill 三家族全等⇒差异在 KillTile_MakeTileDust 触发拓扑+宝箱级联面；行主序化与梁 SetFrames 两试刀回退,单变量定罪需 x86 JJHook mark 序）；IIIII52「主题分类系统性偏离」判级修正为统计铺开非分类器 bug。B刀 #32 writer 翻案=DungeonGlobalWallVariants BFS 洪水可达集差（l>ws 只挡种子格不约束洪水；99=GreenDungeonTileUnsafe=wallVariants[2]；f32 阈值量化假设证伪,fround 保真修正已落 g 链无害）；剩余单刀=BFS 队列序逐句对拍+98/99 双洪水竞速 dump（DungeonPass 为 lane IIII55 在飞文件避二次动刀）。回归七链+skyblock+ftw 全绿（ftw 首证 106/106）、m 链静默窗复核满绿、金标九件 58/58 零写入——详见 content-parity「IIII56 批」章+/tmp/iii58-out。P2 润色项残留（内嵌 infected 支 :19855 等）仍在；LIGHTNING=N/A。诚实边界全清单=content-parity 宣告章 §⑤。

### 10.1 IIII78 批状态行（2026-08-30）：dualDungeons+七条状态/资源型秘种子链

| 链 | 本批终值 | G2 认证目录 | 登记项残留 |
|---|---|---|---|
| DDUAL(double daring dangers) | ⏳ **T2 域内清单推进+G2 建成**：x86 链 106 槽×10ch（含 Dual_Dungeons_Dither_Snake 新槽+禁表十二槽冻结快照）；**插桩 rig≡官方 Steam 同配方 w.wld 六通道零差**；JS 侧十二禁表门落地（WorldGen.ts 六处 gate+三独立槽）；域内未接面=禁表门之外的 dither snake 本体/双套样式房间/EarlyDual 家族接线壳展开 | /tmp/iii81-out/x86-ddual | DitherSnakePass.cs(190行) 族+DualDungeonLayoutProvider+dgEarlyDualFamilies 展开；mile8 tile 面 verification 被③底座债掩盖 |
| 七条状态/资源旗(tooeasy/nightofthelivingdead/pumpkinseason/waterpark/truckstop/winteriscoming/planetoids) | **G2×7 建成+pinned 配方 oracle 级中立性同证**；JS 侧端点均已登记在档（SecretSeedDoEndsPass/HardmodePass），tile 面验证被底座债掩盖——详见下条 | /tmp/iii81-out/x86-{tooeasy,graveyard,pumpkin,waterpark,truckstop,winter,planetoids} | DoPooEverywhere(:2975,:14963,:23009)/DoExtraLiquidFinish(:597)/worldIsFrozen Do*:615/:667/:8238/:16781/:17596/:18767/:24151/roundLandmasses 收口/surfaceIsDesertFinish 单刀待落 |
| ★系统性新案（重于上述各链） | **「种子类依赖早发散」定谳**：八新链 mile8 全部自 slot0 起红、共享签名（首格 (0,203)、~3% 格量级、dungeonX±18..90 漂移）；控制链实验证明与旗标无关且 today-JS 对认证种子仍字节零差 ⇒ 平价仅在历史认证配方窗成立，任意其它底种存在 Reset 早期 dice 流偏差（疑似 RareBranch 漏计族）。修复闸门建议＝任选种子 slot0 级抽样 harness。取证材料齐全（rolls 值流/slot0 探针/_iii81wld 解析仪） | ctl201(无旗标控制)+oracle-g9293480b 仲裁对 | 见 content-parity「IIII78 批」章③⑤ |

### 10.3 IIII106 批状态行（2026-09-01 立项 → 2026-09-04 终局）：秘种子下一波迷你链九枚

| 链 | 终局状态 | G2（持久根 ~/GoldenChains/i106/x86-*） | 移交 |
|---|---|---|---|
| purifythis(infectedSeed) | ✅ **T1 满绿**（mile8 0..106 red=0） | x86-purifythis | 无 tile 面残留 |
| save the rainforest(extraLivingTrees) | ✅ **T1 满绿**（red=0） | x86-savetherainforest | 无（旧 #44 天空树冠差=旧 G2 代际伪影未复现） |
| the care bears movie(extraFloatingIslands) | ✅ **T1 满绿**（red=0） | x86-thecarebearsmovie | 无 |
| sandy britches(surfaceIsDesert) | ✅ **T1 满绿**（red=0） | x86-sandybritches | 无 |
| i am error(errorWorld) | ⏳ 前沿 #032（32✓/73✗） | x86-iamerror | Dungeon 尖刺海 T44×35718+冰带置换（cs 域=errorWorldAdjustment 臂族） |
| monochrome/negativeinfinity/xrayvision/invisibleplane | ✅ **paint 位面满版逐位认证 ×4**（dP=dPw=dCb=0；8ch 谱系差与 paint 位面正交已论证） | x86-{monochrome,negativeinfinity,xrayvision,invisibleplane} | 8ch 级认证待 canon 谱系 paint 二进制（批章 §⑧世系实录） |

基建=i109 世系 gate-passed 标准件(27b0e2aa)+其源码+SW_DUMP_PAINT 变体(/tmp/i109p-rig.app)、
runner=~/GoldenChains/i106/run-chain.sh、仪具 tools/_i106engage(接线证据)/_i106unit(Convert
烟测)/_i106paintcert(paint 位面认证)+_iii81m8 SW_I81_PAINT 扩展裁决。实现面 cs 锚全录
content-parity「XXIX·IIIII106 批」章；rig 世系三闸实录+「认证级资产必须落 ~/GoldenChains」
判例亦在该章 §⑧。
配套档案=/tmp/iii81-out/MANIFEST.md；运行器 run-rig.sh/run-oracle2.sh；工具 tools/_iii81m8(+slot0/rolls/full/wld).test.ts。

### 10.2 IIII89 复验冲刺状态行（2026-08-31）：七链+bigcrc 勘误后首张干净矩阵

| 链 | 本批终值 | G2（勘误配方干净链） | 登记项残留 |
|---|---|---|---|
| bigcrc(99999999999) | ✅ **满绿**（0..98/99 槽,mile8 首差边界「无」）| /tmp/iii84-out/x86-d-bigcrc | 无 tile 面;手尾 RunPass sink 掷澄清为 vanilla 全 pass 收尾 +1 内容无关掷（非债）|
| graveyardBloodmoonStart(grvfix) | ⏳ 0..58 绿,#59 起 flag 域 | /tmp/iii84-out/x86-grvfix | T0>30×612 墓碑族等夜活死面 |
| planetoids(roundLandmasses) | ⏳ 0..15 绿,#16 起全域重排 | x86-i78-planetoids | round 域已知 T3「山体重排收口」 |
| waterpark(extraLiquid) | ⏳ 0..16 绿,#17 起 | x86-i78-waterpark | 丛林泥草互化 ~3.3 万格 |
| tooeasy/halloweenGen/pooEverywhere/worldIsFrozen | ⏳ 各 0..31 绿,#32 起红 | x86-i78-* | worldIsFrozen 另有冰化世界面(70 万格级)/pooEverywhere 另有 poo 面(T666×7.4万)=flag 域;#32 面各自独立 |
| DUNGEON 布局域(共享前沿) | 🔬 **布屋骰序域立案**(新):pumpkin/truckstop Δ+132/+116、tooeasy −465;pumpkin KMP 锚定分叉=dgLayout 早段 DungeonLayoutProvider 房表骰序(idx≈20,+4000 内无再同步);bigcrc 两刀已清(spike 伴查格轴向+CheckPile 分派,g 链 106/106 零扰动复证) | — | 下刀=Legacy provider 房表步骰逐句对拍(仪具/值流档案=/tmp/iii93-out) |



### 10.4 IIII109 批状态行（2026-09-04）：末批秘种子迷你链四链（arachnophobia/howdidigethere/abandonedmanors/wedonteventestforthat）——arachno 满绿认证,三链旗面实证+残差单刀级定位

| 链 | 本批终值 | G2 认证目录 | 登记项残留 |
|---|---|---|---|
| ARACHNO(arachnophobia) | ✅ **已认证·满绿（103/103 槽×8ch,复跑双证）**——旗面三重实证=SpiderCaves 整跳自证（#062≡#063 8/8 字节）+全链蛛网 0+wld savedStylist=true（无旗控制=false） | /tmp/iii135-out/x86-arachno（已迁 ~/GoldenChains/mch3-arachno） | 无 tile 面残留 |
| MCH(howdidigethere) | ⏳ 重掷臂生效实证（x86 spawn=(3508,797) 真实重掷;PostFin≠#105）;mile8 102/103,唯一红=火把环快照时点语义（vanilla 重掷在 FinalCleanup pass 体内、JS 挂管线尾=IIIII41-T3① 备案位）;**残差=spawn 落点 x86(3508,797) vs js(1560,634)——CheckForGoodTeleportationSpot 精简核非逐句（盒几何/87 墙/strictRange 下坠/AnyHurtingTiles/四向探针省略）** | /tmp/iii135-out/x86-mch（已迁 ~/GoldenChains/mch3-mch） | CheckForGoodTeleportationSpot 逐句移植单刀（F8 终态探针 _iii109final8 已建） |
| MANORS(abandonedmanors) | ⏳ 大屋族进骨实证（**台账前 15 attempt 逐格全等含 5 accept 同点位**;getter 零掷早退成立）;mile8 0..58 绿、首红 #59（A46067）+47 行级联;**残差=第 5 accept 屋 (2846,545) builder 掷耗差**（x86 252 pl-attempt/36 accept vs JS 170/36,受理集自 #4 accept 错位） | /tmp/iii135-out/x86-manors（已迁 ~/GoldenChains/mch3-manors）+无旗控制 manors0 | builder 分相掷耗单窗反演;rolllog 实例过滤改造 |
| PGLUN(wedonteventestforthat) | ⏳ 箱插枪实锤（**x86 w.wld 27 枪/174 箱=DoPortalGunInChests 1:1**）;mile8 0..75 绿、首红 #76=**4 格 T0>751 @(2620-2621,387-388)**（金字塔 TNT 桶）;**根因（KillTile 定点 trace）=PlaceSandTrap 清场的邻格 Check2x2 锚清算横扫,JS TILEFRAME_NO_CHECK（IIIII29）未复刻该横扫路径**;枪 24 vs 27=掷流位移下游投影 | /tmp/iii135-out/x86-pglun（已迁 ~/GoldenChains/mch3-pglun）+无旗控制 mch0 | JS 沙陷阱清场后邻格框架链补 Check2x2 横扫清算 |
| i109 rig 资产 | **四旗臂（SW_FLAG_ARACHNO/RNDSPAWN/MANORS/PGLUN=SecretSeed.Enable 直注零掷）+SW_PASSCHAIN pc 链+PostFin(-004_PostFinSeed)瞬态+SW_HOUSELOG 房屋台账+SW_ROLLLOG 掷值流+SW_KILLWATCH 定点观察**;控制认证 i109ctl **856/856 dump 字节+pc 107/107 全等 golden-g**（基座=iii128-rig-src/III105b 复辟系,gc128b 848/848 已证） | /tmp/iii109-rig.app（exe 27b0e2aa 终态）/tmp/iii109-rig-src | RollLog 加 inst==genRand 过滤+reseed 标记 |

详见 content-parity CXVII 章;任意种子闸门 4/4 slot0 八通道全绿;探针=tools/_iii109{chain,final8,houses,rolls}.test.ts。
