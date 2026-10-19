# 金标真值链 Runbook（IIIII90b 批 · 2026-08-31）

> 目的：让「七链满绿认证 + 秘种子/flag 链 mile8 对拍」所需的 **x86 G2 真值目录**
> 不再依赖 /tmp，永远可复验、可重生。
>
> 本 runbook 即再生保险：dump 本体不入 git（单链 5–19GB），配方/锚点 md5/复现命令
> 全部在案；真值丢失 = 按本文 §4 SOP 重产 + §2 校验器对拍即可恢复满绿证据。

## 0 规约禁令（车道级硬约定，等同 CLAUDE 级红线）

1. **任何车道的 G2 一律放 `$HOME` 居所 `~/GoldenChains/<chain>/`（或指向该处的
   符号链接），禁止再直写 /tmp 当真值库；/tmp 只许放过程产物**（探针输出、
   mile8 日志、重产中间件）。历史教训：/tmp 清理已灭失 rrrr-out/x86-{g,m}、
   iii44-out/x86-ftw、iii47-out/x86-drunk、iii48-out/x86-celeb、iii80-out/x86-toadstool
   等 12+ 条认证链本体与 endgame-cert 之外的全部批章档案。
2. rig 铁律不变：`arch -x86_64` 强制；env 由脚本内嵌（外层 SW_* 一律先清，
   白名单显式透传）；`pkill` 必钉本链 `-config <绝对路径>` 参数串；世界目录唯一命名；
   复跑前必 `rm w.wld`（残留存档会走载档分支跳过整个 worldgen）。
3. 秘种子旗标域注意：L1 canon rig 对部分 serverconfig `seed_<flag>` 键惰性
   （已实证 `seed_fortheworthy=1` 无效），可靠通道 =
   dotted 文本路由（如 `1.1.1.4.<crc>`）/ 官方键（celebration→`seed_celebration`、
   drunk→`seed_drunk`）/ JJHook `SW_FLAG_*` env 注入。新链建链后必须做
   「控制槽比对」确认旗标真的生效（首差位置对得上旗面效应才算链成立）。
4. 新 x86 truth 链建成后立刻：(a) 迁入 `~/GoldenChains/<chain>/`；
   (b) 在 §1 总表追加一行并补 §5 的 pc-unique sha256；(c) 若 mile8 绿 → 把
   result JSON 存档到本目录 `golden-spotcheck/`（结果 JSON ~15KB 可入 git）。

## 1 资产总表（2026-08-31 盘点+重产终态）

局所：`~/GoldenChains/`。「布局」栏：
A=852 标准(106 槽×8ch act/typ/wal/liq/half/slope/lty/inact + pc/serverconfig/wld/run.log)
B=A+110(dump 全集含瞬态 -004_PostFinSeed 与 frx/fry 帧,pc 双写行,用 pc-unique.txt)
C=1166 超集(A+B 两代通道并集,paint/paintWall/wire 等齐全)
D=i44 skyblock 特形(107 槽×10ch + 双写 pc)

| 链 | 目录 | 配方(seed/autocreate/evil/旗标) | 布局 | 来源 | 验证 |
|----|------|-------------------------------|------|------|------|
| golden-g | golden-g | seed=9293480 auto=1 EVIL=0 | B | IIII90b fresh | manifest 抽样 72/72 ✓ + mile8 全绿(rc0)✓ + pc FNV 链≡i80 控制链 ✓ |
| golden-m | golden-m | seed=20260811 auto=2(中图) EVIL=0 | B(+1214 文件) | IIII90b fresh | manifest 72/72 ✓ + 对 gen2-m 共享 848/848 字节全等 ✓；**mile8 106/106 满绿=IIIII153 首份正确尺寸全链认证**（6400×1800/SW_MB_1457=1/NOCACHE+STRICT_NAMES,103 锚行 8 通道零差·首差无,ghost 首差 #19 gh=97 信息位;绿基线 JSON=golden-spotcheck/mile8-iiiii153-m-seed20260811.json md5 064d6452…） |
| golden-ftw | golden-ftw | seed="1.1.1.4.1671560105"(dotted) auto=1 evil 自带 corruption-pin | B | IIII90b fresh | mile8 0..31 绿、首差 #32 Dungeon @MountainCaveOpenings(3725,199)=文档在案前沿 ✓ |
| golden-drunk | golden-drunk | seed=51620200 auto=1 +`seed_drunk=1`,EVIL 缺省 | B | IIII90b fresh | 对 iii73 rig-drunk 二代拷贝 **848/848 字节全等** ✓ |
| golden-celeb | golden-celeb | seed=1999040562 auto=1 +`seed_celebration=1` EVIL=0 | B | IIII90b fresh | mile8 全绿(rc0)✓ + 结果 JSON ≡ 归档 mile8_1999040562.json(md5 bc52fad8064dcc8e…)逐字节 ✓ |
| golden-toadstool | golden-toadstool | seed=771002 auto=1 + SW_FLAG_TOAD=1(i77 lane 配方) | B(i80 特形) | i80-out/x86-toad 收养 | **已定谳**: 与 i80-bundle(b8e4e8ff) 复产物 toadstool-i80 对拍 pc 槽键链 110/110 全等 + 881/881 dump 字节全等(差集仅 run.log/serverconfig/w.wld 元数据); mile8 #18 红=JS 面(在途 DesertPass.ts 并行改动)非真值 |
| golden-ddual | golden-ddual | seed="1.1.1.1.doubledaringdangers\|20260831" | A+ | i81-x86-ddual 收养 | i78/i81 批章在案（双地牢旗标域）；当批 regress rc=0 |
| golden-ddual2 | golden-ddual2 | seed="1.1.1.0.doubledaringdangers\|20260831" auto=1 +SW_EVIL=0 钉（dotted 明文段路→dualDungeons；i137-rig=iii109-rig-src+JJHook DRL 重织,exe 6878122…） | A+(108 dump×8ch 含 032_Dither_Snake) | IIII137 fresh（CXXV 章；g2v3 灭失桶接棒） | **三重中立性**:ctl-g 107/107 dump≡golden-g 字节+G2 三连跑 108/108 恒等;mile8 0..32 全绿+首差 #33 签名≡IIIII224 终态逐值;座1 SEG 12/12 rc-delta 恒等;pc sha256 4ec043936eff4973f7dd8ee57ec3fa1e5fc03e2b556fcbe777b4499eceeee6d8,wld md5 ab4469636613ec565780a09687f3e264 |
| golden-gfb-a | golden-gfb-a | seed=9293480 auto=1 +`seed_zenith=1` EVIL=0 | A | iii82-x86-gfb-a 收养 | i79 批章：双跑中立性 0 差 + GFB delta 地图基座 |
| golden-gfb-c | golden-gfb-c | 同 gfb-a 配方(c 版)=9293480 auto=1 +`seed_zenith=1`（mile8 必传七字段真值集 `remix,drunkWorld,notTheBees,noTraps,theConstant,tenthAnniversary,getGoodWorld`,勿用 'everything' 单键） | B(1060 dump) | iii85-x86-gfb-c 收养 | **mile8 106/106 满绿**（CXX 章 IIII101f 首证;IIIII151 复验=103 锚行八通道零差·首差无,ghost 首差 #19 gh=7 信息位既档;绿基线 JSON=golden-spotcheck/mile8-iiiii151-gfb-seed9293480.json md5 104accde…,CXXVI 批章在案;**GFB-E 嫁接收尾域=IIIII153 批销账**（Y1162 微残/箱雕 #58..63/#38 shimmer 移交域均经满绿复验+world-final-hash 统一时刻再生,复跑 103 锚行 8 通道零差仅 gh 信息位漂 49 格） |
| golden-remix | golden-remix/{dumps,w.wld,pc.txt,…} | seed=1138154190 auto=1 +`seed_remix=1` EVIL 缺省 | dumps 子目录 | iii89-rigb 收养(i85 remix 复产) | i43/i85 章节两代互证 |
| golden-skyblock | golden-skyblock | seed=20260829 auto=1 +`seed_skyblock=1`(evil 默认 corruption) | D | i46-x86-skyblock 收养 | i44 章:59/59 checkpoint 绿；IIIII96b 复验=专用仪 `_i46` 满绿（generic mile8 无「空岛」槽映射者呈 reds=59 错位幻影,勿作 skyblock verdict 源）;**IIIII154 销账（2026-09-04,CXXIX 章）**：spot「#105 T668>0×2/W41@(2169,218) 桶债」=仪锚伪红——空岛加型槽 JS 槽序+1,旧 `i==58→dump105` 硬锚把 JS#58 断线陷阱清理态对桶#105 终清理态=桶自身 104→105 FinalCleanup 增量（668×2+画墙继承 41）;spot 名锚化+pts:[0,105] 后 **rc=0 五点全绿（在案首次）**,「缺 45/46/47」=denyAll 世界三 reseed 标签结构性不可达（桶文件在） |
| golden-fishmox | golden-fishmox | seed=771003 auto=1 evil0 + `SW_FLAG_FISHMOX=1` env(lane-iii80 配方) | C(i80 特形 12ch) | IIII96b 收养(/tmp/iii80-out/x86-fishmox) | mile8 771003/E0/noInfection reds=0 满绿;pc.txt sha256 eb1644aeb28b7140569376eec8802f8fb83a9ce397801ad68482252eafd8c44d |
| golden-sgis | golden-sgis | seed=771001 auto=1 EVIL=0 + SW_FLAG_SGIS=1（i109 rig+IIIII101h 直注臂,run.log arm 落证） | A(107 typ) | IIII101h 批 fresh 重产（原 iii80-out 桶灭失） | mile8 103 rows bad=0 满绿双跑+slot0 旗开面反证+五点全绿;pc.txt sha256 前16 5c49eb0f4b38d5d6 |
| golden-win | golden-win | seed=20260907 auto=1 evil缺省(-1)+`SW_FLAG_WIN=1` env（★i118-rig-src 克隆+JJHook110 PreGen 注入钩;app=win-rig.app 装 **TS37.exe** 面,本代 bundle 实载 Resources/TS37.exe 非 TerrariaServer.exe） | A(106×8ch) | IIII110 fresh（IIII110 批章：winter 真值链,control 臂 winctl 同 rig 无旗=域隔离证据） | mile8 i141s3:冬季冰化巨面(T161>67万@#55→T 全通道 -96%级)清偿后首差 #28 T633>57×25569=T634>0×925（AshGrass 域,**无旗 control 同签名**=树代际债非 winter 面）;2026-09-01 regen 129s wld=2740316 |
| golden-grvfix | golden-grvfix | seed="nightofthelivingdead\|20260903" auto=1 +`SW_FLAG_GRV=1` env +**SW_EVIL=0 钉**（i163-rig.app=iii106-rig-src2+GRV/WPK/PLD 三注入臂,exe 10a213be） | A(106×8ch+4瞬态) | IIII163 fresh（LIX 章） | 旗标生效实证=墓碑(85) 1528（无旗版=0）;mile8 终态 **0..58** 绿,首差 #59 Buried_Chests（房屋域基线债,与 IIII89 逐值同）;pc sha256 6f8894ac… |
| golden-waterpark | golden-waterpark | seed="waterpark\|20260905" auto=1 +`SW_FLAG_WPK=1` env +SW_EVIL=0 钉（同 i163-rig） | A(106×8ch+4瞬态) | IIII163 fresh（LIX 章） | mile8 终态 **0..52** 绿（+36 槽:蜜斑 num6=0/注水液型 WATER 两刀）,首差 #53 Smooth_World;pc sha256 b2712dc9… |
| golden-planetoids | golden-planetoids | seed="planetoids\|20260908" auto=1 +`SW_FLAG_PLD=1` env +SW_EVIL=0 钉（同 i163-rig） | A(106×8ch+4瞬态) | IIII163 fresh（LIX 章） | mile8 终态 **106 槽满绿 rc=0 首差无**（CXXVIII·IIIII108d 批收官:活木房箱金档天空三连+Oasis/QuickCleanup roundLandmasses 外门三刀;此前 CXIX 0..31→CXXIII 0..41）;pc sha256 51238948… |
| golden-truckstop | golden-truckstop | seed="truckstop\|20260910" auto=1 +`SW_FLAG_TRK=1` env(pooEverywhere) +SW_EVIL=0 钉（i171-rig.app=iii106-rig-src2 血统+GRV/WPK/PLD/**TRK/TSE/DSV** 六注入臂,exe 756a5654） | A(106×8ch+4瞬态) | IIII171 fresh（LXII 章） | 旗标生效实证=粪块(666) 59166 首现 #034_Beaches（cs:14965 DoPooEverywhere 头位;无旗=0）;mile8 首战 0..33 绿,首差 #034=T666 族（后由 IIII176 DoPooEverywhere 三消费面+QuickWater [379] 括弧清偿）;**IIIII108c 复验（2026-09-04,CXIV 章）＝106 槽满绿 rc=0 首差无**（poo 域 cs:2975/:14963/:23009/:9294 四锚逐谓词对 1458 考证 1:1;x86 T666 账=#034 首现 59,166→终态 56,379;绿基线 JSON 入 golden-spotcheck/mile8-iiiii134-truckstop-seed-truckstop20260910.json）;pc sha256 b3e2af69… |
| golden-tooeasy | golden-tooeasy | seed="tooeasy\|20260911" auto=1 +`SW_FLAG_TSE=1` env(startInHardmode) +SW_EVIL=0 钉（同 i171-rig） | A(106×8ch+4瞬态) | IIII171 fresh（LXII 章） | 旗标生效实证=#105 T117=115410+T109=81（DoStartInHardmode→initializeHardMode GERunner 神圣条带;无旗=0）;mile8 首战 0..37 绿,首差 #038 Shimmer 单墙格(495,537) v178 j0;#105 旗面经 LXVIII/LXXXVIII/IIIII216（GERunner 转化尾 SquareTileFrame 级联）清偿;**IIIII108c 复验（2026-09-04,CXIV 章）＝0..37 绿+唯一 W=1 @(495,537)（#038 起恒在,LXVIII 跨运行时 FP 翻脸固有备案）+其余全零;#32 Dungeon A301/T354 已收敛归零（地牢家族修复级联,XXV 移交债清账）;IIIII156 收官（2026-09-04,CXXXIII 章）＝**mile8 106/106 满绿 rc=0 首差无**——唯一 W=1 @(495,537) 经反演重放翻案（该格不在 ShimmerMakeBiome 椭圆盒,真根=ShimmerMakeBiomeOpening 写门 SolidTile 弱谓词漏 slope/half/tileSolidTop/inActive 四门,格 slope=3;LXVIII「ULP 翻脸」备案证伪,「mono libm 仿真」立项建议撤账）,五门 1:1 一刀（vanilla/ShimmerPass.ts）;gh=64 前后同,21 线 spot+3 链 mile8 全绿零扰动**;pc sha256 6a1c8fbd… |
| golden-dontstarve | golden-dontstarve | seed="theconstant\|20260912" auto=1 +`SW_FLAG_DSV=1` env(WorldSeedOption_DontStarve) +SW_EVIL=0 钉（同 i171-rig;特殊种子位不入 count） | A(106×8ch+4瞬态) | IIII171 fresh（LXII 章） | 旗标生效实证=#013→#014 活性差 −166,481（WavyCaves 饥荒波隧 cs:12315;无旗 control ctl171 同位差=0）;mile8 首战 **0..64** 绿,首差 #065 Moss 单格 deco(165)@(1491,533)（JS 有 x86 无,潜伏 rare-path）+ #090 双格 @(3845,280);#100..#105 **全绿**=theConstant 世产面（WavyCaves/LavaLayerCaverer/Dungeon/Corruption/Lakes/Oasis/StarterNPCs 等）整体对齐;pc sha256 dd8f4184… |
| gen2-g / gen2-m / gen2-s22222 / gen2-ntb | gen2-* | 同上四链同种子配方 | C | jjj-out/g1457-* 收养 | endgame-cert cross-gen 400/400 全等 + 本批复验抽样全对 |
| golden-const | golden-const | seed=1321365005 auto=1 +**官方 serverconfig 键 `seed_theconstant=1`**（1457 WorldGenerationOptions.TryEnablingFlagFrom→ServerConfigName="theconstant",无 BCrypt 依赖）evil 缺省(随机随种子)（i128-rig SW_DUMP_ALL 面,bin.osx 3248fc76） | A(106×8ch+wld/cfg/run.log;无 pc.txt=i128-rig 无 SW_PASSCHAIN) | IIII107b2 fresh 重产（2026-09-04,CXV 章） | **中立性自证=72/72 sample md5 ≡ cert-endgame TRUTH-MANIFEST['const']**（死桶 /tmp/rrrr-out/x86-const 的在档指纹,逐字节复现）;mile8 SW_M8_FLAGS=theConstant **106 槽 0 红**,绿基线 JSON 入 golden-spotcheck/mile8-iiiii107b2-const-seed1321365005.json;§0-3 勘误细化：BCrypt 不可达的是秘种子**文本**路由,`seed_<ServerConfigName>` serverconfig 键是官方可靠通道 |
| golden-notraps | golden-notraps | seed=1896728457 +**EVIL=1+noTraps**（spot/mile8 配方=SW_I81_SEED/SW_I81_EVIL/SW_I81_FLAGS 钉死判例,CXLXII/CLXX 章） | A(106×8ch+10ch 帧通道,IIIRS172 普查在用) | 原七链桶（provenance 见 ~/GoldenChains/ 桶内账） | **mile8 106/106 认证**（CLXX 章复验+IIIRS213 复核补表;frame 桶=golden-*-fr 在库）；★本行系 IIII213 复核勘误补齐——原 §1 总表漏列本桶 |
| c12345 (gen2-12345) | gen2-12345 | seed=12345 auto=1 **EVIL=1（JS 口径 1=crimson 腥红;'c'=crimson 非 corruption）** | C(106槽×10ch) | jjj-out/g1457-12345 收养（IIIII97b 迁居） | **★IIIII107b2 定谳（CXV 章）：「c12345 79 红首 #26 T722 @(765,428)」=EVIL 配方漂移伪影非真红**——iii117 reg100b.sh 误用 SW_M8_EVIL=0(=corruption→Demonite)对 crimson 真值;EVIL=1 复跑 mile8 106 槽 0 红=cert 满绿复现;桶 72/72 sample md5 ≡ cert-endgame TRUTH-MANIFEST['12345']（未灭失,居所真身完好） |
| cert-endgame | cert-endgame/(6MB) | 七链 endgame 权威复跑档案 | 档案 | /tmp/endgame-cert 克隆 | results/md5-manifest.txt + TRUTH-MANIFEST.json 在内 |
| varia-g1458-ARM64-TAINTED | varia-…/README.md | （NNN 批 run-chain.sh 缺 arch -x86_64 污染线） | — | /tmp/sw-slp/g1458-* 克隆 | **禁作认证基准**：Dunes T=4115163441 污染指纹实锤 |
| x86-i78-pumpkin | x86-i78-pumpkin（别名 /tmp/iii84-out/x86-i78-pumpkin=symlink） | seed="pumpkinseason\|20260904" auto=1 **无旗** +SW_EVIL=0 钉（i78 家族 flagless 域,IIIII163 定谳）;**JS 对拍面必须无旗直注**（SW_I81_PINFLAGS=1 或 spot flags:{}——压掉 parseSeedChain 把 'pumpkinseason' 段路由成 halloweenGen,否则旗语义两侧不对称=CXVIII 配方漂移判例） | A(110 dump×8ch+4瞬态) | IIII202 fresh 重产（i171-rig,exe 756a5654;早间 /tmp 误清后恢复） | 110/110 槽 active 指纹≡ctl171;x86 全 110 dump active 254=0（桶无南瓜实证,CXVIII 尸检）;**IIIII110b（CXVIII 章,2026-09-04）：mile8 103/103 锚行全绿·首差无**（SW_I81_PINFLAGS=1 配方,/tmp/iii140-out/m8-pumpkin-final-green.log）;原「#105 登记红 T165/T373 族」销账=旗开级联伪影（原 spot/mile8 配方带 halloweenGen 所致,旗关自愈）;pc md5 5bc6dd5b…/sha256 b0f9baf5… |
| x86-jagged | x86-jagged（别名 /tmp/iii80-out/x86-jagged=symlink） | seed=771005 auto=1 +`SW_FLAG_JAGGED=1` env(digExtraHoles) +SW_EVIL=0 钉（IIIII77 原配方/IIIII99c 认证） | A(110 dump×8ch+4瞬态) | IIII202 fresh 重产（同上 rig） | 旗面生效实证=无旗控制 000..015 恒等、首差 #016_Grass −291,862（打孔臂域）;**spot 五点 rc=0 全绿**=IIIII99c 满绿态复现（IIIII139 期重产桶疑似漏旗→其 T57 族登记红=桶代际伪影,待 jagged lane 销账）;pc md5 2c8a0bbf…/sha256 2b3ebfb6… |
| golden-winter | golden-winter | seed="1.1.1.0.winteriscoming\|20260914"(dotted 五段;**BCrypt 明文路由首次在 x86 打通**——TryApplyingCopiedSeed→TryParseSecretSeed→ToSecret("winteriscoming")≡注册码,零 JJHook env) auto=1 evil=配方段(0=corruption) | A(106×8ch) | IIII107b fresh（rig-iii133=Steam vanilla 1.4.5.8 exe c02f1ea4…+Cecil 三点织入 JJHook133;rig 中立性=g-verify 重产 848/848 dump 字节全等） | 旗标生效实证=#055 Ice ice161=1112559/snow147=1298679/thin162=8176(无旗≈20.9万/17.2万);anyseed-slot0 8 通道 ✓;mile8 首差 #28 T0>10×1 @(1862,1047) 单格（全 106 行仅 3 单格债,冰化巨面全通道归零）;pc sha256 0512a5dd… |

| mch3-arachno | mch3-arachno（别名 /tmp/iii135-out/x86-arachno=symlink） | seed="arachnophobia\|20260904" auto=1 +`SW_FLAG_ARACHNO=1` env(noSpiderCaves) +SW_EVIL=0 钉（i109-rig,exe 27b0e2aa） | A(107 dump×8ch 含 -004_PostFinSeed) | IIII109 fresh（CXVII 章） | **mile8 103/103 满绿认证（复跑双证）**;旗面三重实证=#062≡#063 整跳 8/8 字节+蛛网 0+wld savedStylist=true;pc sha256 9cf5476a…;控制链 i109ctl/ctl3 856/856 字节+pc 107/107 全等 golden-g |
| mch3-mch | mch3-mch（别名 /tmp/iii135-out/x86-mch=symlink） | seed="howdidigethere\|20260904" auto=1 +`SW_FLAG_RNDSPAWN=1` env(randomSpawn) +SW_EVIL=0 钉（同上） | A(107 dump×8ch) | IIII109 fresh | 重掷臂生效实证（spawn=(3508,797) vs 无旗中心带）;mile8 102/103（唯一红=#105 火把环快照时点语义）;残差=spawn 落点 js≠x86=CheckForGoodTeleportationSpot 精简核非逐句（移交）;pc sha256 6b034606… |
| mch3-manors | mch3-manors（别名 /tmp/iii135-out/x86-manors=symlink） | seed="abandonedmanors\|20260904" auto=1 +`SW_FLAG_MANORS=1` env(biggerAbandonedHouses) +SW_EVIL=0 钉（同上） | A(107 dump×8ch) | IIII109 fresh（+同种子无旗控制 manors0） | 台账前 15 attempt 逐格全等含 5 accept 同点位（SW_HOUSELOG 双端台账）;mile8 0..58 绿、首红 #59;残差=第 5 accept 屋 builder 掷耗差（移交）;pc sha256 f9d6219d… |
| mch3-pglun | mch3-pglun（别名 /tmp/iii135-out/x86-pglun=symlink） | seed="wedonteventestforthat\|20260904" auto=1 +`SW_FLAG_PGLUN=1` env(portalGunInChests) +SW_EVIL=0 钉（同上） | A(107 dump×8ch) | IIII109 fresh（+同种子无旗控制 mch0） | **箱插枪实锤=x86 w.wld 27 枪/174 箱**;mile8 0..75 绿、首红 #76=4 格 TNT 桶 @(2620-2621,387-388)（PlaceSandTrap 清场邻格 Check2x2 横扫未复刻,移交;24vs27 枪=下游投影）;pc sha256 08a3ccbe… |
| i106/x86-xrayvision・x86-monochrome（涂装对桶,同目录另有 negativeinfinity/invisibleplane/五 canon 链/mch2ctl,布局=i106/MANIFEST.md） | seed=`1.1.1.0.<flag>\|106107..106109`（dotted 勘误式=小世界/经典/腐化,即 §0-3 可靠通道）auto=1 | A(107 dump×13ch——8ch+.pnt/.pwal/.cbt 涂装三通道) | IIII106 lane-paint2 fresh（2026-09-04,i109p-rig=SW_DUMP_PAINT 钩,exe efe170d1;runner=~/GoldenChains/i106/run-chain.sh） | mile8 paint 位面满版逐位认证 **dP=dPw=dCb=0×4**（XXIX §⑤,tools/_i106paintcert）;**IIIII161（2026-09-04,CXXXV 章）：III132 桶 /tmp 灭失后本对桶接任 spot 五点 G2,xrayvision/monochrome 双线五点 8ch 全零差 rc=0**;配方自证=桶内 run.log「Seed: xrayvision\|106107, 4200×1200, Evil: 0」;★对照链 mch2ctl(plain 9293480)曾现 #026 差=runner 未钉 SW_EVIL 之 Evil:-1 配方伪影（IIIII163 勘误既判,非 i109p 谱系差——涂装对桶配方段显式 value3=1 恒 evil=0,免疫此伪影） |

另收养但未列入 cert 主表的存活姐妹资产（保留原位可查，建议后续按 §0-4 迁移）：
i78 八旗标链 graveyard/tooeasy/pumpkin/waterpark/truckstop/winter/planetoids 及
i80 其余五秘种子 sgis/fishmox/sparkle/jagged/rainbow（`/tmp/iii{81,80}-out/x86-*`）。

> **★IIII163 勘误（2026-09-02,LIX 章）**：i78 八旗标链（含上列 /tmp 姐妹资产）的 x86 真值
> **全部 flagless**——秘种子文本路由依赖 `Secrets.ToSecret`（BCrypt）码比对,在 recompiled rig
> 不可达（实证：grv 链墓碑=0、pumpkin 链南瓜=0）。凡旗标域 mile8 判读,一律改用
> JJHook env 注入重产链（golden-win/golden-grvfix/golden-waterpark/golden-planetoids 及
> IIII110/113b/114 各臂先例）；并**必钉 SW_EVIL**（否则邪恶自然掷在 #26 Shinies 伪分叉,
> XXV 章③「#26 代际分叉」即此伪影,已由 SW_EVIL=0 重产 pc 110/110 全等翻案）。

## 2 校验器

- **manifest 抽样校验**（恢复 rrrr-out 认证系链的标准手段）:
  ```sh
  python3 ~/GoldenChains/cert-endgame/truth_verify.py … # 或内联比较
  ```
  权威基准 = `cert-endgame/truth-verify/TRUTH-MANIFEST.json`
  （每链 files/total_bytes/listing_md5/pc_txt_sha256 前 32 hex + 9 槽×8ch sample_md5）+
  `cross_generation_sampled[]`（rrrr-out × jjj/g1457 400/400 全等的代际自证记录）。
- **mile8 快照对拍**（JS↔x86 全 106 槽×8ch 逐字节投影，最能暴露 JS 面回归）:
  ```sh
  cd game && SW_MB_1457=1 SW_M8=1 SW_M8_NOCACHE=1 SW_M8_STRICT_NAMES=1 \
    SW_M8_VG=<dir> SW_M8_G2=<dir> \
    SW_M8_SEED=<seed> [SW_M8_EVIL=<n>] [SW_M8_FLAGS=<SeedFlags 字段名或别名>] \
    [SW_M8_W=6400 SW_M8_H=1800] \
    npx vitest run tools/_mile8.test.ts
  # 结果 JSON → /tmp/mile8_<SEED>.json；绿基线档 docs/worldgen/golden-spotcheck/
  ```
  判读口径：红绿裁决只看 dA/dT/dW/dL/dHf/dSl/dLt/dIa 八通道；dGh 是信息位。
- **二代拷贝全文件 diff**（最硬的字节级验证）: 任一 python/md5 循环对共享文件集
  比对即可（本批 m/drunk 均得 848/848 全等）。

## 3 已知遗留与判读警示

1. **pc.txt 双写行**：canon L1 rig 的 PcPath 写行器每槽两行（第二行 R:0:2166136261
   为 FNV 幺元行）。fresh 链同时落了逐槽去重的 `pc-unique.txt`；跨链比对请用它。
2. **mile8 JSON 的 md5 只在同一 harness 版本内可比**：endgame-cert 时代 JSON 带
   非零 dGh 列，现行树 dGh≡0 → 直接比 md5 会假性不等；本批 celeb 出现的全等属于
   现 harness 世代内部的自证。
3. **sw-slp/g1458-* 家族 = ARM64 污染线**（Dunes T=4115163441）：与认证 x86 线
   非同族，已在 `varia-g1458-ARM64-TAINTED/README.md` 定罪；所有并行会话引用
   到 `/tmp/sw-slp/g145X-*` 作 G2 的旧命令一律作废。
4. **toadstool 三连判（已闭）**：①收养目录(x86-toad) mile8 首差 #18
   Mud_Caves_To_Grass@DesertBiome(T0>59×349)；②用 L1 bundle(ea8694d5)+env 复产
   → 首差升级 T0>59×87,501 ⇒ 定罪「L1 .exe 不含 i80 六旗标 JJHook 语义，
   旗标 env 域必须 GC_APP=/tmp/iii80-app.app(b8e4e8ff)」；③i80-bundle 复产物
   toadstool-i80 vs 收养目录：pc 槽键链 **110/110 全等**、dump **881/881 字节全等**
   （仅 run.log/serverconfig/w.wld 元数据面差异——w.wld 尾部序列化自由场为
   i79 章已知类）。判决：收养目录=可靠 x86-toad 真值；#18 红系工作树
   DesertPass.ts 等并行在途改动的 JS 面漂移，i77 批「满绿」日志为锚。
   重现命令：
   `GC_APP=/tmp/iii80-app.app/Contents/MacOS/TerrariaServer GC_KEEP_SW='|SW_FLAG_TOAD|' GC_PORT=83xx \
    game/scripts/golden-chain-regen.sh toadstool 1 771002 - _ gold-toadstool`
   （另注：旗标域名万不可走 L1 bundle；serverconfig 键/dotted/SW_EVIL 域两代皆备。）
5. **命令行 FLAGS 别名须精确**：`SW_M8_FLAGS=forttheworthy`（多打一个 t）会静默
   穿透成未知字段名 → JS 跑普通世界 vs FTW 真值 → Terrain 起全线伪红。别名表见
   `tools/_mile8.test.ts` FLAG_ALIAS。
6. **旗标链 mile8 必须 SW_I81_FLAGS 同发**（IIIII110 车道踩坑）：sw-i81 工具直注通道是
   `SW_I81_FLAGS=<SeedFlags 字段名>`；漏发=JS 侧跑普通世界对 winter 真值 → 冰化巨面
   "恒等假绿已消失却仍全级联伪红"，且排障时被误判为"修没生效"。冬季链复现命令：
   ```sh
   SW_I81=1 SW_I81_G2=~/GoldenChains/golden-win SW_I81_VG=~/GoldenChains/golden-win \
     SW_I81_SEED='20260907' SW_I81_FLAGS=worldIsFrozen npx vitest run tools/_iii81m8.test.ts
   ```
7. **win-rig.app 载入面=Resources/TS37.exe**：k13 代 bundle 的 MonoKickstart 实际加载
   `Contents/Resources/TS37.exe`（Terraria.exe 为同字节别名，Resources/TerrariaServer.exe
   【不】被加载——与 IIII40 代「实载 TerrariaServer.exe」纪要相反）。改源重编译后须覆盖
   TS37.exe+Terraria.exe 两名同字（否则跑旧 exe=注入钩静默失效，run.log 无 [JJHook110] 即铁证）。
   rig 源=/tmp/iii141-out/rig-win-src（i118-rig-src 克隆 + JJHook.PreGen 头 SW_FLAG_WIN 臂，
   dotnet build -c Release → bin/Release/net48/Terraria.exe）。
8. **rig-win-src JJHook.Snap 插行断链事故（IIIII111b 定谳＋已修＋G2 已重产）**：`uw08_housepost`
   钩曾被插在 `if (drunkWorldGen)` 与其 `{` 之间——C# 下 Snap 吞掉条件体、后续满宽灰烬草/树
   尾扫块变无条件执行 ⇒ win 车道一切世界 #028 内带 T633×25495/T634 伪影（曾误判「树代际债」）。
   已移钩至 AddHellHouses() 后并重建（Resources/TS37.exe+Terraria.exe 双名同字节，sha256
   6ccc3830…2e56b2d）；golden-win G2 已按同配方重产迁移（worldname=win-th，pc.txt sha256
   a47a8863…2d8c，旧桶 #028/#055/w.wld/pc 存档 /tmp/iii144-out/archive-old-golden-win/）。
   **插桩红线：向 rig 源插钩禁止落在控制流头行（if/for/while/else）与其语句体之间；插钩后
   必跑无旗 control 已知锚槽对拍。**
9. **mile8/spot 车道配方必须逐链对 cert lane-params.txt 钉死（IIIII107b2 判例）**：
   12345 链（`c12345`）= **evil=1（JS 口径 1=crimson 腥红）**，手写 runner 曾误写
   `SW_M8_EVIL=0`（=corruption→ShiniesPass 掷 Demonite）对 crimson 真值 ⇒ 「79 红首
   #26 T204>22×722 @(765,428)」的整族伪红（T204=Crimtane vs T22=Demonite 邪矿族;
   per-pass reseed 下 0..25 槽仍绿=evil 只门控特定 pass,极易误读成「树前段回归」）。
   仲裁锚=cert-endgame/results/mile8-12345-seed12345.json（106 行八通道全零）+ 桶
   sample md5 对 TRUTH-MANIFEST 复验；配方漂移与树回归的分辨法=**换正确配方单变量复跑**
   （EVIL=1 → 0 红即定谳 env 伪影）。同理 const 链复活后勿再走 AB 猜测口径。
8. **mile8 `_iii81m8` 的 `SW_I81_EVIL` 必须与桶配方同值**（同上条 CXXV c12345 判例的
   harness 侧镜像）：harness 缺省 EVIL=-1（邪恶自然掷），对 EVIL=0 桶即 #26 Shinies
   T22>204 伪红——`_iii107c-regress.sh` grv 段曾带 -1 误跑（IIIRS158/CXXIX·IIII108c2
   判例 EVIL=0 钉 105✓/0✗；IIIRS168「graveyard #26 先在债」同签名误报，
   IIII174b 批 EVIL=0 复跑销账并已把脚本原文钉 0）。x86 侧同源坑=runner 家族
   `unset SW_EVIL`（run-chain.sh/anyseed-rig.sh 等）→ control 链必须用删过该行的
   派生 runner（rig-i106ev.sh 范式）并核对 run.log `Evil:` 字段；IIIII174b 批
   iii128/i106p 两世系钉 0 复跑均 848/848 dump 字节≡golden-g。

## 4 复产 SOP（灭失链重建）

运行器已固化：`game/scripts/golden-chain-regen.sh`（同 /tmp/gc-regen/gc-run.sh，
模板源自 i81 run-rig.sh / i46 run-sb.sh）：

```sh
# 用法: <NAME> <AUTOCREATE> <SEED值> <额外serverconfig行|-> <EVIL|_> [WORLDNAME]
#   env: GC_PORT=<port> GC_KEEP_SW='|SW_FLAG_TOAD|'（白名单透传）
cd /tmp && GC_PORT=83xx /path/to/game/scripts/golden-chain-regen.sh g 1 9293480 - 0 gold-g
```

六条主链注册表（重产后先按 §2 校验，再迁入 `~/GoldenChains/<NAME>/` 并更新 §1/§5）:

| NAME | AUTOCREATE | SEED | EXTRA 行 | EVIL |
|------|-----------|------|---------|------|
| g | 1 | 9293480 | - | 0 |
| m | 2 | 20260811 | - | 0 |
| ftw | 1 | 1.1.1.4.1671560105 | - | _ |
| drunk | 1 | 51620200 | seed_drunk=1 | _ |
| celeb | 1 | 1999040562 | seed_celebration=1 | 0 |
| toadstool | 1 | 771002 | （旗标经 SW_FLAG_TOAD env 透传） | _ |

护栏：**★IIIII107b 勘误（2026-09-04）：全部 /tmp rig bundle 已灭失**（iii40-rig/
i171-rig/win-rig/sw-slp 家族无一幸免;nuget 缓存与 dotnet SDK 10 幸存）。新 rig=
`~/GoldenChains/rig-iii133/rig.app`——**Steam vanilla TerrariaServer.exe
（1.4.5.8,md5 c02f1ea4…）+Mono.Cecil 0.11.6 三点织入**（①WorldGenerator.GenerateWorld
的 PassResults.Add 后插 JJHook.Hook.AfterPass(idx,name)；②UnifiedRandom.InternalSample
ret 前 dup+OnRoll；③WorldGen.Reset 的 generatingRandomEvil=true 后插 SW_EVIL 覆写——
★分支用 Blt 非 Ble,ble 会把 evil=0 一并跳过=IIIII107b 首跑 #26 Demonite/Crimtane
1295 格伪分叉根因）。织入器/probe 源=/tmp/iii133-out/rig-build/{patcher,jjhook}
（灭失照 content-parity「IIIII107b 批」§② 30 分钟重建）。中立性认证=g-verify
(seed 9293480/E0) 重产 848/848 dump 字节全等=canon rig 血统复辟。旧「从反编译源
dotnet build 复刻」路径退役（ILSpy 修复家族工作量远大于 Cecil 织入,且 Steam exe
即 1.4.5.8 权威真值本体）。

## 5 关键 md5/sha256 锚点（摘录；权威清单=cert-endgame/results/md5-manifest.txt）

- 七链 endgame mile8 结果 JSON md5（2026-08-29 终局宣告日, /tmp/endgame-cert 当时实境）:
  见本仓 `docs/worldgen/golden-md5-manifest.txt`。
- IIII90b fresh 六链 pc-unique sha256：
  g 1a26aa7fd3f163b8035bc3071db95da69fa0319992c90fb852f035c8e3413c99
  m f2682182acaa9bea4cff78c1fc986bee26d85170aab6ec574596cd37952794db
  ftw 73b46f8b3e9ea8c6b2bb96c9dd88fd3fd62a340aaadf3969b8ccfe78d426903b
  drunk 58fbfdc9c380efdb57580c76786d298ec45c26381ed16e1b3f761fc2e8c3880d
  celeb 4f0ba8492c89de4231d047c0ca04c2828ec7d8da87731856633ee5bd0e417d7d
  toadstool (adopted, pc 双写未去重——沿用 i80 pc.txt 原样)
- IIII109 四链 pc-unique（单写行,即 pc.txt）sha256（2026-09-04）：
  mch3-arachno 9cf5476a036f414fbeeafa698c1cc4276613a98989982d127703d0f5f6c84dfc
  mch3-mch 6b034606939ff7e66a0f339fbb5ede7e763f3ed221adf63bbe42de3f779e1fca
  mch3-manors f9d6219dce901daccbe756d4e0573f6fbb75aaf461b147d91aca34086e8d22ec
  mch3-pglun 08a3ccbe35b0b7fcdd8827992fa41dc56b4afb0913e749f180995a02f1a9f9c2
  （i109-rig 终态 exe 27b0e2aa=Contents/Resources/TS37.exe;控制认证=856/856 dump 字节+pc 107/107 全等 golden-g）
- IIII109 arachno 满绿 mile8 快照 JSON（★IIIRS213 复核勘误：实居 home 树 ~/GoldenChains/golden-spotcheck/，仓内 golden-spotcheck 无此件——勿按本行旧注在仓内找）：mile8-iiiii109-arachno-seed-arachnophobia20260904.json
- spot-check 绿基线 JSON（入 git, game/docs/worldgen/golden-spotcheck/）:
  mile8-iiiii90b-g-seed9293480.json（md5 d543afa6c0b65095686cf77fda9f45b3）
  mile8-iiiii90b-celeb-seed1999040562.json（md5 bc52fad8064dcc8e269cdb6aec91da3f）

## 6 HOME 树速览

```
~/GoldenChains/
├─ golden-{g,m,ftw,drunk,celeb}        # IIII90b fresh 重产（六缺 toadstool=收养）
├─ golden-toadstool                    # i80 x86-toad 收养
├─ golden-{ddual,gfb-a,gfb-c,remix,skyblock,fishmox}   # fishmox=IIIII96b 收养迁居
├─ golden-{grvfix,waterpark,planetoids}                # IIII163 三旗批（i163-rig SW_FLAG_GRV/WPK/PLD）
├─ golden-{truckstop,tooeasy,dontstarve}               # IIII171 三旗批（i171-rig SW_FLAG_TRK/TSE/DSV,exe 756a5654）
├─ golden-const                          # IIII107b2 重产（官方 seed_theconstant=1 键;72/72 ≡ cert 指纹）
├─ golden-winter                        # IIII107b fresh（dotted BCrypt 路由;冰化面 mile8 三单格债）
├─ rig-iii133/rig.app                   # IIII107b rig 复刻（Steam vanilla 1.4.5.8 exe+JJHook133 织入;jjhook/patcher 源=/tmp/iii133-out/rig-build,灭失可按 content-parity「IIIII107b 批」§② 重建）
├─ gen2-{g,m,s22222,ntb}               # jjj g1457 二代超集（cert cross-gen 400/400）
├─ cert-endgame/                       # endgame-cert 全档案克隆
└─ varia-g1458-ARM64-TAINTED/          # 已定罪的 arm64 变味家族（含 README 定罪书）

## 7 终局清算规程（IIIII178b 批 · 2026-09-05）

> 全种子版图收官清算的**一键可复跑全量认证门禁**：`game/tools/final-gate.sh`。
> 把散装认证面（金标十件套 / recon 三闸 / 护卫族 / seed-parity / spot 22 线 /
> mile8 关键链）统合为分阶段、逐段日志落盘、摘要+判读一体的单命令流程。
> 本节是它的操作规程与判读基准；批号撞号备案见门禁脚本头（**IIIII178b** ≙ 交办书
> IIII178,LXVII 章已占,照 CXVIII/CXLI/CXLIX/CL 判例加 b）。

### 7.1 两档与调用

```sh
cd game
bash tools/final-gate.sh --full          # 全档:S0..S5（约 1.5~2.5h,建议 nohup+轮询）
bash tools/final-gate.sh                 # 快档:S0..S4（spot 五点族,不含 mile8）
bash tools/final-gate.sh --stage mile8 --chain g      # 单段/单链复跑
bash tools/final-gate.sh --list          # 打印链表与逐链配方
SPOT_PAR=3 bash tools/final-gate.sh      # spot 波次并行（仅省墙钟;日志逐线独立）
```

产物（每次运行独立目录,互不覆盖）：`/tmp/iii178-out/final-gate-<stamp>/` ——
`SUMMARY.txt`（阶段化 PASS/FAIL 摘要）/ `VERDICT.txt`（终局判读）/
`stage-*.log`（goldens / recon-* / guards / seed-parity / spot-<chain> / m8-<chain>）/
`mile8-fg-<chain>.json`（_iii81m8 结果 JSON 存档）/ 零写入快照 before/after。

### 7.2 阶段与认证面清单

| 段 | 认证面 | 通过判据 |
|----|--------|---------|
| S0 preflight | 22 spot 桶+6 mile8 桶在位性、.typ≥100、零写入快照（before） | rc=0 |
| S1 金标 | 十件套除 sfx 9 件 + world-final-hash + 加件（npc-flags-golden / spawn-side-override-golden） | vitest rc=0 |
| S1 sfx | sfx-wiring-golden 单闸 | 见 7.3 域外债行 |
| S2 recon | recon-item DRIFT=0 / recon-npc CLASS A=0∧B=0 / recon-tileanim rc=0 / tests/tile-anim-authority | 全 0 / rc=0（A3=85 审阅面、item CLASS B=478 移植确认清单=信息位,不入判） |
| S3 护卫 | skyblock-anchor-sets / micro-biomes / worldgen-1457-rewire / dungeon-1457-alignment / weather-precip-parity + seed-parity | vitest rc=0 |
| S4 spot | 22 线 × 关键槽五点（#0/#45/#46/#47/#105;skyblock 名锚化 pts=[0,105]） | 每线「五点全绿 ✓」 |
| S5 mile8 | g / iamerror / ddual / winter / sparkle / graveyard 六链全 106 槽（tools/_iii81m8 name-anchored;红绿只裁八通道,dGh=信息位） | 见 7.3 逐链残差域 |
| 收尾 | 零写入复核（tests/golden + src/data/*.json + vanilla.json md5 前后全等） | 全等 |

配方纪律（脚本内置,违者拒跑）：spot 的 seed/evil/flags 一律以 `tools/_iii100spot`
CHAINS 表钉死值透传,门禁不旁路覆盖;mile8 逐链 EVIL 起跑前对桶 `run.log`
`Evil:` 字段强制比对,**冲突即拒绝执行**（CXLIX 案一「每链 EVIL 必须与桶配方同值」;
无 run.log 的桶以 serverconfig+lane 章为配方权威,如实记入日志）。

### 7.3 PASS 判据表（放行域外债 vs 阻断）

**【阻断】（任何一项即 VERDICT: BLOCK,终局清算不得放行）**

- S1 金标 9 件/world-final-hash/加件、S2 recon 三闸、S3 护卫+seed-parity 任一红；
- S4 spot 22 线任何一线红（含曾满绿链转红——spot 五点=桶采样的最小认证面,转红
  即 JS 面回归或配方漂移,按 §3-9「换正确配方单变量复跑」分辨后处置）；
- S5 已满绿链（g/sparkle/graveyard）任何新首差;在途链残差**越出备案域**；
- 任何「名实不符」（管线槽序漂移——对拍结论不可按本表解读,§2 mile8 口径）；
- 桶缺失/8 通道不全/假绿免疫 throw/EVIL 配方冲突；零写入快照前后不等；
- **INVALID（环境级无效运行）**：mile8 rows=0 且 vitest rc≠0 = harness 未产出任何
  对拍行（树破损/模块解析断/桶坏）——这不是对拍红,不进判读,修复后单段复跑。
  2026-09-05 dry-run 实录：在途车道 02:58 落盘 `WorldGenTileHelpers.ts` 带断链
  import（`../../../TileStore` ⇒ src/TileStore 不存在）→ 当刻之后四个 mile8 链
  全部 INVALID。共享树长跑的窗口敏感面,门禁如实单列,不与配方漂移/回归混判。

**【域外债·可放行】（注记放行,记入 VERDICT「WITH-KNOWN-DEBT」）**

| 红名 | 放行条件 | 台账 |
|------|---------|------|
| sfx-wiring-golden | 失败签名=`toBeGreaterThan(800)`（本树 public/sounds 无 863 wav 库=发布域资产交付面;代码面 UNWIRED_ALLOWLIST=[] 已钉死,与代码无关） | 音频发布域 |
| mile8 iamerror | **0..58 绿（IIIII183/CLVII 后：#57 A/T/Hf/Sl 全零+Gh 157→4,#58 A/T 全零,零新增红）;残差 bad=#59..#105（47 行,首差 #59 Buried_Chests@SurfaceChests (1798,266) T0>53×1635/Y1>0×837…;#59..62 恰=CLVI 基线−200,更深层域内分歧图样重排（#97..105 A+5.2k）=非 AddManaCrystal 级联,槽内 chests 族域+在途 Dungeon/Skyblock 刃）** | CLVII 章（原 CXLVI/CXLVIII 域 {#56,#57} 已清偿） |
| mile8 ddual | bad 全部 ≥#33（座2腐化草域 (3628,153);首差 #33 前全绿） | IIII222/IIIII224 章 |

**【备案红】（签名匹配才放行,签名漂移即升级阻断）**

- mile8 winter：#28 T633>57×N / T634>0×N（AshGrass 域,**无旗 control 同签名**=
  树代际债非 winter 面;§1 golden-win 行在案）——签名或首差位置漂移即阻断。
  ★2026-09-05 dry-run 实测：该债已由后续车道清偿,**winter 106/106 满绿**;本行
  规则保留为历史签名守卫（若未来 winter 再红,先对 T633/T634 签名判读）。

**【在途树警示】（2026-09-05 dry-run 实录,判定规则）**

- `world-final-hash` 终态哈希红 + 逐 pass 检查点绿 = **车道在途未重冻金标**
  （树在动,金标只锁"没变"）——非门禁可放行项,也非本批可修项:按
  「在途金标禁重冻」纪律,待在途车道（ddual/iamerror/IIIII179 等）落刀收敛后由
  车道按 UPDATE_GOLDEN=1 重冻,再复跑本门禁取 PASS。判读时比对
  `tests/golden/world-final-*.json` mtime 与 `src/world/gen/**` 最新 mtime 即可定谳。
- 终局清算的正时点 = **全部在途刃落盘收敛、金标重冻后**;在途窗口内跑本门禁,
  结论一律降级为「在途基线」记档,不得作收官凭证。

### 7.4 收官流程（规程）

1. 确认无在途车道改 `src/world/gen/**`（mtime+批章双查）,金标已按终态重冻；
2. `nohup bash tools/final-gate.sh --full` + 轮询（>60s 任务;分段日志自包含）；
3. 按 7.3 判读：VERDICT=PASS（或 PASS-WITH-KNOWN-DEBT 且仅含域外债/备案红）→
   把 SUMMARY/VERDICT/m8 JSON 存档进批章产物,收官；
   出现任何 BLOCK → 定位到 stage-*.log 按对应批章处置,禁止在本门禁内手改数据；
4. 收官后在 §1 总表/本节追加当次 dry-run 基线行（stamp+VERDICT+红名清单）。

### 7.5 dry-run 基线（2026-09-05 03:07~03:18,树自愈后重跑窗;产物 /tmp/iii178-out/final-gate-*）

- S4 spot **22/22 全绿**;S2 recon 三闸 PASS（DRIFT=0 / A=0 / B=0 / tileanim rc=0）;
  S3 护卫五件+seed-parity PASS;S1 金标 9+2 件 PASS;零写入复核 PASS。
- S5 mile8：**g / winter / sparkle / graveyard 四链 106/106 满绿**（winter #28 备案债
  已清偿）;ddual 残差=74 行全部 ≥#33（座2腐化草域,备案域内=域外债）;**iamerror
  残差越界=49 行（#57..#105,首差 #57 Life_Crystals T639>0×200）**——越出 CXLVIII
  备案域 {#56,#57},与在途 iamerror/CL 后继刀（CavesPass/DesertPass/TemplePass
  01:11~02:58 落盘窗）时序耦合,判在途车道中间态,移交该车道 A/B 复判后重跑本门禁。
- S1 意外红两项（如实列账）：
  ① `world-final-hash` 双种子终态 type 哈希红（9293480: 2f93f782≠4ce4ffc2 /
  1511931452: fbdb5f30≠6c4c4c13;flags/wall/liquid 未及判）——金标冻于 09-04 15:23,
  而 src/world/gen 至 09-05 02:16 有在途落刀（DungeonPass ★IIIII179 等）;逐 pass
  检查点（underworld 段）绿 + mile8 g 全绿 ⇒ 差异在 later pass 域或金标陈旧,
  **按在途金标禁重冻纪律移交在途车道收敛后重冻**,本门禁不代冻。
  ② sfx-wiring-golden=wav 库缺失（域外债,7.3 判例）。
- 环境事件实录：02:58 在途车道曾落盘 `WorldGenTileHelpers.ts` 带断链 import
  （`../../../TileStore`）→ 当刻四个 mile8 链 INVALID（rows=0∧rc≠0,首窗
  final-gate-20260905-024132）;03:07 车道自愈后本基线全线重跑。
- 终局 VERDICT=BLOCK（2 阻断类:iamerror 越界+world-final-hash;域外债/备案红
  放行 3:sfx/ddual/（INVALID 环境项已修复））——**收官清算须待 iamerror 车道
  收敛 + world-final-hash 重冻后复跑取 PASS**。

### 7.6 收官基线（IIIII211b 批 · 2026-09-06 02:57~03:12,终局清算正时点;产物 /tmp/iii178-out/final-gate-20260906-025727）

- **VERDICT: PASS-WITH-KNOWN-DEBT（唯一注记项=sfx-wiring-golden wav 库缺失;
  域外债/备案红放行 1,阻断 0,INVALID 0）**。
- S4 spot **22/22 全绿**;S5 mile8 **六链全 106/106 满绿**（rows=106 bad8ch=0
  名实不符=0 首差=无）——**7.5 的 iamerror 越界（#57..#105）与 ddual 座2腐化草域
  （#33 起）两域外债行即日全额清偿销账**（CLXXXVI/CLXXXVII 落刀后终态）;EVIL 配方
  核对零冲突;零写入复核 ✓（tests/golden 39 文件+src/data 52 文件+vanilla.json）。
- S1 金标 12 文件 rc=0（**world-final-hash 已按 IIII211b 重冻**:双种子终态与
  09-05 03:39 在途窗冻结字节全等=CLXXXV..CLXXXVII 落刀对普通种子零扰动自证;
  断言模式复跑 rc=0）。
- 同批金标统一再生（UPDATE_GOLDEN=1 判例规程,caves-oracle CLXXXII 终态工装）:
  caves/shimmer 四金标重产（9293480→b6e1df96…/1511931452→bf6bb84a…,确定性四跑
  自证;残差面=microbiomes/finalcleanup 液域尾段 2/76）+shimstate 夹具重写（内容
  字节全等）+ghost 伴生通道同批落盘。链位级对账（非本门禁认证面）:caves 9293480
  76/76 全绿、shimmer 9293480 全绿+状态恢复×2 全绿;**caves/shimmer 全链
  SandboxWorld 预存红**（首差 dungeonPa 画域写面差,掷流 8 点全对齐——CLI 章
  全绿→CLXII/CLXIV 记在途漂移→src 定格后未回归 oracle 同态,移交 oracle 车道,
  详 content-parity doc CLXXXVIII 章 §4）。

```
