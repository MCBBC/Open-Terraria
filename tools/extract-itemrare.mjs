// 从 Terarria1456 Item.cs 提取 rare/value → src/data/{vanilla-itemrare,vanilla-itemvalue}.json。
// 未列出的物品 rare=0 / value=0（ResetStats :48542/:48628 默认）。供 Tooltip 稀有度
// 着色（GetItemNameColor 15 档）、重铸费用 value×stack÷3、商店定价与 decraft 组代表
// （RecipeGroup.DecraftItemId OrderBy(value)）。
//
// 2026-08-13 工厂方法盲区修复（本批散项）：旧实现单正则扫全文件，五类失真——
//   ① value = buyPrice(...) 不求值（427 处，致 1250/1251/1252 读 0 抢占
//      Cloud/Blizzard/SandstormBalloon 三组 decraft 组代表，实测错位）；
//   ② SetShopValues(rarity, price) 双字段工厂（1139 处）完全不可见；
//   ③ case 标签列（case A: case B: 共体）只有末标签拿到值（水母饵 2436-2438、
//      宝石小动物 4831-4844、食物大列表）；
//   ④ 扫描越界：体终止锚 `\n\t\tbreak;` 匹配不到 3-tab 深的体 → 贯穿到后续
//      case 偷 value（case 2630 幻影 150）；工厂方法体内 case（4071/4072/4073/2626）
//      也被当物品混入；
//   ⑤ 工厂方法体内的 value（DefaultToSeaShell/DefaultToFood/DefaultToTorch…）不可见。
// 现策略：仅扫 SetDefaults1..5 + SetFoodDefaults（IsFood 分派 :48295 → 食物走后者），
//   按行解析（case 标签列合并 / 体终止 = 同深度 case|default|break|return|goto /
//   只认 case 体顶层(depth 3)无条件赋值——变体 if 块内赋值属 WeakerVariant 等变体，
//   本表建模基础变体，取顶层赋值序列的**最后一个**（工厂调用与显式赋值按源序覆盖，
//   DefaultToFood→SetShopValues 即此模式）），嵌套 if/switch 内赋值忽略。
//
// 2026-08-23 sellPrice 系统性漏乘 ×5 修复：sellPrice(p,g,s,c) = buyPrice(…)×5
//   （1457 Item.cs:49426-49429 尾乘 5；1456 :49019-49022 同式；extract-shops.mjs
//   同名分支早已带 ×5，本件是漏网者）。旧 evalPrice 把 sellPrice 与 buyPrice 同式
//   求值 → 全表 sellPrice 系条目统一 ÷5（case 757 实证 200000，应为 1000000）。
//   FACTORY_VALUE 同病同修：SeaShell/Vanitypet 手算常量按无 ×5 口径，改存源码
//   表达式串经修后 evalPrice 求值（Solution/Food/HealingPotion 本就是 buyPrice 不变，
//   Torch/MusicBox 字面量不变）。2026-08-23 二批（只读价格字段 + 自赋值伪影）：
//   ⑥ `value = shadowOrbPrice/dungeonPrice/queenBeePrice/hellPrice/eclipse*` 只读
//      字段引用不可求值 → FIELD_PRICE 映射表（字段 → 初始化器 sellPrice 表达式，
//      1457 Item.cs:71-83 / 1456 :52-64，经 evalPrice 自动 ×5 与 sellPrice 系同口径）；
//   ⑦ 反编译器自赋值伪影 `value = (value = 250000);`（1456:6323 case 425 /
//      :10417 case 774）→ evalPrice 剥 `(value = X)` 壳。
//   变体分支内字段引用不收（case 2623 影杖 WeakerVariant `value = dungeonPrice`
//   :25670，基础变体已有顶层 sellPrice(0,5)，按既有"建模基础变体"口径忽略）。
//
// ★追加时代守卫（2026-09-18，清债 BJ114-e 同族普查；★拍板#7A 同日缺省翻转 1457——
//   原洗库险面「缺省 1456（SW_ITEM_VER 未设 → SRC_VER='1456'）而现库已是 1457
//   终值态」就此闭合，守卫语义与流不变）：重产盖不住现库（如显式 SW_ITEM_VER=1456
//   重放旧基线）=把 1457 新物品 6147-6195（49 件）连同 1293 rare 档
//   （1457 Item.cs:15981 新增 rare=8，1456 案无此行）从现库洗成缺键 → 运行时
//   rare=0/value=0 兜底，拾取飘名/重铸费用/商店定价/decraft 组代表全错。BJ92
//   （3860-3862 错值非缺键）同案异构：本件=缺键型增量，与 extract-npcs 的字段型
//   不同构。照 era guard 判例（atlas 四连 / recipes R25-B5② / npcs 债刀-3）落闸——
//   守卫=重产输出 vs 现库【动态 diff】：现库有而重产盖不住的 id（missing）非空即拒
//   exit 1+物证，不硬编码 id 清单（1293≤6146 同被动态探测捕获；实证 1456 重产
//   missing=50/49）。正常更新流：裸跑重产（缺省 1457，输出盖住现库全部 id →
//   零缺失放行；实证与现库逐键 byte-perfect 零漂移）。--dump 对账通道不受守卫限制
//   （recon-item-1456-1457.mjs 双实例 1456/1457 都走 --dump，拦了=对账闸门自断）。
//   活通道与 recon 闸分工：守卫只拦【缺键型】（一门一职责），错值型漂移归
//   recon-item-1456-1457.mjs（--fix 一键重放 1457 终值 + DRIFT=0 双闸）。确需原地
//   强推：双旗 --force-full --overwrite-append-era（单旗仍拒）；事后必须全绿 recon
//   双闸门 + tests/item-stats-golden-1457。测试注入面：SW_ITEMRARE_JSON/
//   SW_ITEMVALUE_JSON（守卫探测路径）/ SW_OUT（写盘目录，缺省 game/src/data），
//   缺省行为不变。守卫测试：tests/extract-itemrare-era-guard.test.ts。
// ★g1 footgun 硬化（2026-09-18，红蓝-F①）：探测 env（SW_ITEMRARE_JSON/
//   SW_ITEMVALUE_JSON）设置而 SW_OUT 缺省 → 拒跑 exit 1（fail-closed）——定谳：
//   守卫探测读注入夹具（零缺失→放行）而写盘落缺省 OUT_DIR=现库 game/src/data，
//   探测与写盘分离=守卫被绕过洗库。处置：显式 SW_OUT（与探测同沙箱）或同时清
//   探测 env 走真实现库守卫；--dump 对账通道不写盘不受此限。
// ★R2 边界登记（2026-09-30 helper 体面收官时的同域残留面,均【未】在本件建模——
//   逐面有源码锚,修复须各自定谳）：
//   ① SetFoodDefaults 方法尾 rare=(int)(num/4f)（:48395;1456:48007/1458 同式）——
//     86 件食物/Eggnog1912/无 case 的 4010 错值型面（饱食档越高 rare 越高,json 恒 SSV 的 1）;
//   ② SetDefaults3 方法尾 value=buyPrice(0,10)（:27641,2192-2208 笼件段+2194 覆写）——value 缺键;
//   ③ 方法级 if 范围守卫 rare 面（case 组不可达,QuestFish 2450-2488 已 HAND 同族）：
//     1522-1527=1(:18541)/1533-1537=8(:18563)/1977-1986=2(:21241)/2104-2113=1(:21879)/
//     2214-2217=3(:22380)/2284-2287=5(:22993)/3309-3314=2(:30262)/2421=1(:23088);
//   ④ case 内 per-type if 链 rare（RB20b 同族残留）：bait 链 2303-2321（:23171-23270）、
//     2420/2421 if-else（:23088-23096）、30189 内层 switch rare=2;
//   ⑤ SetDefaults 派发后方法级块（:48721-48836 value if 链 + :48843 bait>0 → rare 3/2/1）;
//   ⑥ 变体 if 分支（Weaker/StrongerVariant）=按设计忽略（本表建模基础变体,非债）。
//
// ★清偿刀 S1（2026-09-30,五段续刀,R2 基线=DEFAULT_TO_BODY_RV 编译器+HAND 通道+FACTORY_VALUE
//   七表——在其上扩方法级域:if 范围守卫/尾段算式/派发后块三形态）。五段 1457 亲读定谳,
//   1456/1458 三版同构跨版对拍实证（foodTail 式/isFood=86/baitBlock 阈值 50>3,30>2,15>1/
//   sd3tail/cageGuard/food 形参 85/链 30 ids/(c) numKs/(d) 14 ids 全同;守卫行号随版漂移,
//   内容锚定不锚行）。行源序语义:case 组(区域扫描) < 方法级守卫/链 < 既有 HAND <
//   派发后块(无条件覆写) < 食物尾式(食物 case 的 SSV rare=死码,尾式恒胜):
//   ① SetFoodDefaults 尾段 rare=(int)(num/4f)（:48395;1456:48007/1458 同式）编译器:
//     num = (buffType==207?12:buffType==206?8:3) + buffTime/14400(C# 整除); rare=trunc(num/4)。
//     buffType/buffTime 取各 case 的 DefaultToFood 第 3/4 形参（DefaultToHealingPotion→0/0;
//     无 case 的 4010(ApplePieSlice)→0/0→rare=0）。IsFood=ItemID.cs CreateBoolSet 动态解析
//     （86 ids=85 case+4010）。48 件错值漂移（4022=6/1919=3/4011=4/Eggnog1912=0 等）。
//   ② SetDefaults3 方法尾笼件段 value=buyPrice(0,10)（:27641）:可达集=尾卫
//     `if (type < 2192 || type > 2198)`（:22289,块尾无条件 return :27618）之补集
//     [2192,2198]∩(SD3 无 2192-2198 case 标签=亲核零)——R2 census「2192-2208」过宽
//     （2199+ 落卫内提前 return）;尾内 case 2203/2204=死码。2194→buyPrice(0,2,70)/
//     2196→200 覆写机械解析。
//   ③ 方法级 if 范围守卫 rare 面:sweep（SD1-5 全域 `if (type >= A && type <= B)` 块顶层
//     rare）≡钉表（10 族=8 注册族+3 census 外同形扫获:3390-3452 事件旗 rare=1、
//     3456-3459 四碎片 rare=9、3638-3642 队块平台 rare=1）——新守卫现形即 throw 逼定谳
//     （era-guard 变异守卫扩面）。另钉:单件守卫 2320（rare=3,:23100,census 外同形）、
//     if-else 守卫 2421/2422（rare 1/3,:23075-23098;census 误记 2420,实际范围 [2421,2422]）。
//     全族 liveness 亲核=守卫线前零 case 标签（脚本实证 NONE(live)）。
//   ④ per-type if 链 rare:鱼链 2303-2321（共享 case 2290-2321(无 2314)体 :23165-23270,
//     链 if 全带 value+rare 双写——本刀按注册面只取 rare,value 面另登记债）。链前返回构造
//     亲核:2290-2296 鱼竿组 return/2314 独立 case(rare=1 既有)/2320 独立守卫——链 16 ids
//     全 live、bait=0(鱼非饵,派发后 bait 块不覆写)。:30189 内层 switch default(rare=2)=
//     死码定谳:可达集 {3262,3278-3292,3315-3317(外层 default goto case 3262)} 全有内层
//     case 零 id 命中 default→不落刀（census 过计）。
//   ⑤ SetDefaults 派发后方法级块（:48716-48915）:value if 链 30 ids+:48860 1994-2001 num
//     块+:48892 14-id 或块（与链同族,census 行号域只圈到 48836,同构补面）+bait 块
//     （bait>=50→3/>=30→2/>=15→1,阈值机械解析;1-14 档不写）×37 bait 赋值行——上下文
//     走栈解析器逐行定 id 集（裸 case 体/if(type==X)/if(num==K)/多或/内层 switch 段五形态,
//     形态外 throw）。
//   新登记债（本刀不修,值已定谳待各自刀）:③④守卫/链的 value 面（1977-86=50000,
//     1980=100000,1984=75000,1985=150000;2104-13=3750;2214-17=100000;2284-87=50000;
//     3309-14=50000;3390-3452=1000;3456-59=10000;3638-42=100;2421=156000,2422=500000;
//     2320=75000(另:现库 2320 value=2500 系死标签污染);鱼链 2298-2321 per-type value 覆写）、
//     :48905-48909 SetDefaults 递归 1803-1807→SetDefaults(1533+type-1803)（终值=1533-1537 面,
//     rare=8/value=0）。
//
// ★清偿刀 T4（2026-10-01,value 面续刀,S1 终态为基线）:上记 S1 债三件全部落刀——
//   ①③守卫 value 面:S1_GUARD_VALUE_PINS 钉表+rangeGuardValueFace 机械解析（base 顶层
//     value 行+per-type if(type==N) 覆写;sweep≡钉表,漂移 throw 逼定谳）+单件/if-else 守卫
//     2320=75000/2421=156000/2422=500000（findTypeGuardBlock 扩 value/elseValue 采集）。
//     ★S1 头注勘误:2104-13 真值=37500 非 3750——源锚 `value = sellPrice(0, 0, 75);`
//     （1457:21880/1456:21854/1458:21880 三版同式）,boss 面具卖价 75 银×5 口径,S1 头注
//     「3750」系笔误（3750=sellPrice(0,0,7,50) 另物）。三版同构对拍实证。
//   ②鱼链 value 面:S1_FISH_VALUE_PINS 22 ids（2298-2319,2321;块内 value+rare 双写的 value
//     支）——运行基值 sellPrice(0,0,5)=2500 仅 2290/2297 存活（2291-2296 鱼竿组内层 switch
//     后提前 return、2320 走 :23100 守卫提前 return=标签死码）,其余 22 件全被 per-type
//     覆写;expected-override-ids=标签连−{2320}−{无块存活性已由 rare 面亲核}机械断言。
//   ③2320 死标签污染修正:现库 value=2500（鱼链运行基值经死标签写入）→ 75000（守卫
//     sellPrice(0,1,50)）;S1③ 单件守卫段扩 value 断言。
//   ④S1⑥ 新段:SetDefaults 派发后递归 `if (type >= 1803 && type <= 1807) { SetDefaults(1533
//     + type - 1803); }`（:48922;1456:48525/1458:48922 三版同锚）——递归整体重置重建,终值=
//     目标面 1533-1537（S1③ rare=8;value 缺键=0）→ RARE[1803-1807]=8、VALUE 强制缺键
//     （delete 清区域扫描可能写入的 case 级死码值;运行时递归覆写语义 1:1）。目标面 rare
//     非均匀/value 非缺键即 throw 逼重定谳。1803-1807=Jungle/Crimson/Corruption/Frozen/
//     Hallowed KeyMold（1.3 时代钥匙模具,终值=对应钥匙面,Identities 亲核 ItemID.cs:
//     5152 JungleKeyMold=1803）。
//   消费面:Shimmer groupDecraftItemId（组 31 碎片 3456-3459 四件同切 10000=均匀平移,
//     OrderBy(value) 代表不变=3458;其余新增 value id 不属任何 RecipeGroup）/Game.ts reforge
//     cost（:48799 权威值查表,面具/鱼/锤衣面重铸费由死值 0/2500 归真）/tooltip 稀有色
//     （rare 面零变更,唯 1803-1807 新增 8）。
//   ★T4 新登记债（本刀不修,census 已扫获待各自刀定谳）:方法级【无 rare】value 守卫面——
//     SD1-5 范围守卫 if(type>=A&&type<=B) 块顶 value 行 34 族全 live（守卫线前零 case 标签
//     机械核）全缺键:1481-1494=10000/1500-1502=5000/1528-1532=2500/1538-1540=5000/1541-1542=5000/
//     1543-1545=300000/1709-1712=200/1713-1718=300/1719-1722=2000/2055-2065=3000/2066-2071=2000/
//     2072-2081=300/2082-2091=500/2092-2103=1500/2114-2118=2500/2129-2134=500/2135-2138=300/
//     2145-2148=150/2149-2152=1500/2153-2155=300/2254-2256=300/2376-2385=300(2379=100000)/
//     2386-2396=300(2389=100000)/2397-2416=300/2442-2449=25000/2631-2633=150/2634-2636=300/
//     2648-2651=300/2652-2657=3000/2658-2663=300/2664-2668=1500/3651-3662=300/3739-3741=50/
//     3915-3916=300;另 4695-4697 守卫=死码（case 标签 :38616-38618 先捕获,不取）。per-type
//     覆写/嵌套形态未逐族亲读,落刀前须各族机械解析+三版同构对拍。
//
// ★清偿刀 U1（2026-10-01,方法级【无 rare】value 守卫 34 族,T4 census 主面落刀;S1/T4 终态为基线）:
//   「无 rare」语义=守卫块内无 rare 行（与 S1③④有 rare 守卫对偶）的 value 面。SD1-5 方法级链
//   （顺序 guard/switch,命中即 return）内 if(type>=A&&type<=B) 守卫采集 base（块顶 value 行,后写
//   胜）/over（嵌套 if(type==N) 顶层 value）/ifElse（嵌套 if(范围){v}else{v} 双支,else 覆盖=父域−
//   if 域,双侧开口未建模）。34 族逐族亲读定谳+三版（1456/1457/1458）逐行同构对拍零漂移（行号随
//   版漂移,内容锚定;1457 锚）:1481-1494=10000（buyPrice(0,1),:18311,嵌套于父守卫 1479-1494
//   @:18300 的 if 支）/1500-1502=5000（:18354）/1528-1532=2500（:18544）/1538-1540=5000（:18566）/
//   1541-1542=5000（:18581）/1543-1545=300000（sellPrice(0,6),:18596）/1709-1712=200（:19271）/
//   1713-1718=300（:19285）/1719-1722=2000（:19300）/2055-2065=3000（:21799）/2066-2071=2000
//   （:21814）/2072-2081=300（:21829）/2082-2091=500（:21844）/2092-2103=1500（:21859）/
//   2114-2118=2500（sellPrice(0,0,5),:21884）/2129-2134=500（:21950）/2135-2138=300（:21965）/
//   2145-2148=150（:22025）/2149-2152=1500（:22040）/2153-2155=300（sellPrice(0,0,0,60),:22055）/
//   2254-2256=300（:22724,SD3 尾卫 if(type<2192||type>2198) 反演大块内 d4,11 个 d4 族同域）/
//   2376-2385=300+2379=100000（:23921;buyPrice(0,10) :23936）/2386-2396=300+2389=100000（:23940/
//   :23955）/2397-2416=300（:23959）/2442-2449=25000（sellPrice(0,0,50),:24138）/2631-2633=150
//   （:25645）/2634-2636=300（:25660）/2648-2651=300（sellPrice(0,0,0,60),:25759）/2652-2657=3000
//   （:25775）/2658-2663=300（:25790）/2664-2668=1500（:25805）/3651-3662=300（:32835）/3739-3741=50
//   （buyPrice(0,0,0,50),:33105）/3915-3916=300（:34600）。
//   ★census 外同形扫获（liveness 亲核 live）:1479-1480=5000——1479-1494 父守卫 if-else 的 else 支
//   （:18317 sellPrice(0,0,10)）;1479/1480 无 case 标签、无更早守卫捕获（SD2 域内机械核）。
//   liveness 全 35 族=守卫线前零 case 标签+零前向遮蔽守卫（脚本机械核）。★T4 4695-4697「死码」
//   结构定性【翻案】::38632 的 if(type>=4695&&type<=4697){value=1000}else{value=40000} 在
//   case 4695-4700 体【内】（:38616-38621,体尾 break :38640）=case 体嵌套 if-else 活面,非方法级
//   ——本刀不写值,登债待 case 体 per-type if 值域专刀（U1 sweep 收录 fail-loud:嵌套清单漂移即
//   爆红;同域已核实 debt:2242=2000（现库 20 错值）/2258=5000（20）/2434=50（缺）/2843=100000
//   （300）/SD5 5218+ 组 per-type 覆写族（5222/5228/5231 等现库 5000,真值待普查））。
//   行源序:本段在 S1⑤ 之前——族内 10 id（1710/1716/1720/2133/2137/2147/2151/2155/2405/2663）
//   随后被 S1⑤ SetDefaults 派发后或块终值覆写 100000（或块在 SetDefaultsN 返回之后运行,覆写序
//   1:1）;2413=300 与现库死标签值（case :24880,守卫 :23959-23973 提前 return=死码）同值零漂移。
//   消费面:groupDecraftItemId 组代表零变更（U1 全 217 id 不属任何 RecipeGroup,机械核）/
//   SellChain 卖价/Game.ts reforgeCost 由 0 兜底归真值。守卫:sweep≡钉表（35 族键+值+覆写+
//   liveness+嵌套清单+形态缝+单件清单七维,漂移即 throw）+tests/u1-itemrare-no-rare-guard-value.test.ts。
//
// ★清偿刀 V1(2026-10-01,case 体嵌套 per-type if 值域全域普查+落刀;U1 终态为基线):
//   U1 门②收录的「case 体嵌套域」从单点 4695-4697 扩成全域语义普查——每 region 从方法体顶层
//   起语义走栈演步(case run 连排合并/内层 switch 按 run 分发含 default 补集/if(type==N|范围|
//   补集复合 type<A||type>B) 分支分区/return 灭集跨层上传/goto case 重派发),写入面按 path 四分:
//   method(方法级=既有 S1③④⑤/T4/U1 域,本刀不写)/top(case 体顶层直写=区域扫描域)/
//   nested(case 体【任意深度,含 default 体】内经 type-if 派生=本刀域)/variant(非 type 条件域,
//   R2⑥ 按设计忽略,11 处 Variant 块全登记)。scope 语义:nontype 支配(变体块内的 type-if 仍属
//   变体域),switch run 体重置 scope(嵌套 switch 的 case 体顶层仍是扫描域)。
//   ★三版对拍:1456/1457/1458 nested 面+variant 清单逐键全等(普查脚本 _v1-nested-value-sweep
//   三版 IDENTICAL;唯一 tv 漂移=255/5920/5926/6148+ 既有 recon 域)。liveness 全 62 面机械核
//   (case 标签捕获+前向遮蔽+灭集传播)。
//   普查定谳(62 面/138 id):分两域——
//   ①「ch/ch-post」40 面 112 id=既有通道已收(本刀只锁键集+id 集,值由各通道 sweep≡pins 承载):
//     ch(S1③/T4/U1 已落,运行时先于本刀)=2214-2217/2254-2256/2284-2287/2320/2421/2422/
//     2376-2385(+2379)/2386-2396(+2389)/2397-2416/2442-2449/2631-2668;
//     ch-post(S1④ 鱼链,后于本刀落值=键集门只锁形态)=2298-2321 22 面。
//   ②「v1」22 面 26 id=本刀落值(现库全错/全缺,1457 亲读逐面定谳+三版同构):
//     2242=2000(buyPrice(0,0,20) :22647;现库 20=case 体顶层基值冒充)/2258=5000(buyPrice(0,0,50)
//     :22756;现库 20)/2434=50(buyPrice(0,0,0,50) :24091;现库缺)/2843=100000(buyPrice(0,10)
//     :27103;现库 300)/4695-4697=1000(:38634)/4698-4700=40000(:38638 else 支;全缺)=U1 门②
//     唯一登记域兑现/SD5 旗帜墙四组 per-type 覆写(基值 sellPrice(0,0,10)=5000 全组已对):
//     5231=10000/5222=5228=100000(:41641-41649)/5243=30000/5245=10000/5235=25000(:41677-41685)/
//     5251=5253=5257=10000/5252=5256=25000(:41737-41753)/5266=100000/5259=5265=5264=5263=25000
//     (:41785-41801)。
//   消费面:卖价域=value÷5(2242 卖 400 银→真值 buyPrice 面;2258/2843/52xx 组同步归真)/
//   Game.ts reforgeCost 权威值查表归真/Shimmer groupDecraftItemId 零变更(26 id 不属任何
//   RecipeGroup,机械核)/rare 面零变更(nested rare 面 29 id 对拍全等=既有通道)。
//   ★V1 sweep≡V1_NESTED_PINS 七维门(键/id 集/own 分域/v1 值),漂移即 throw 逼定谳。
//   ★新登记债(本刀不修,值已定谳待专刀):SD3 尾段基值面 2203/2204=100000 现库缺键——
//     S1② 结构前提「尾卫块尾无条件 return」不成立:卫块内唯一 return 在 switch A default 体
//     尾(:27618@4tab),case 2203/2204 体=裸 break(:22295)→穿出卫块落入尾段 value=buyPrice(0,10)
//     (:27641);S1②「尾内 case 2203/2204=死码」系该前提误推。V1 语义走栈 method 面机械实证;
//     修复须重推 S1② 可达集([2192,2198]∪{2203,2204})+消费面定谳,本刀不动。
//     ★S1b 已兑现（2026-10-01,见文件头 S1b 节+S1② 块重写）。
//   守卫测试:tests/v1-itemrare-nested-value.test.ts。
//
// ★清偿刀 S1b(2026-10-01,V1 走栈翻案兑现专刀;S1② 定谳翻正落刀):
//   S1② 原「尾卫块尾无条件 return(:27618)→case 2203/2204 死码、100000 缺键非债」翻正——
//   亲读+机械走栈三版复核（1456 guard:22263/tail:27614,1458=1457;行漂移内容逐字节全等）:
//   ①卫块（:22289 if(type<2192||type>2198)）内唯一语句=switch(:22291-27619),其收口与卫块
//     收口(:27620)之间零语句;
//   ②卫块内唯一 return :27618 在 switch default 段体尾（default 标签 :22374,体含嵌套 switch
//     :27550-27617）,非「块尾无条件 return」——case 2203/2204 裸 break 不经它;
//   ③case 2203/2204 体=裸 break(:22295)=switch 直接段唯一 break-exit 集,穿出 switch→穿出
//     卫块→落尾段 value=buyPrice(0,10)(:27641)=100000 铜=10 金买价;
//   ④尾段可达集修正=[2192,2198]∪{2203,2204}（[2192,2198]=卫块补集直达,前提「SD3 零
//     case 2192-2198 标签」不变;2199-2213 直接段全 return;default 段尾 return=无第三路径）。
//   落刀:S1② 块重写（结构前提 A/B 机械断言+break-exit≡{2203,2204} 钉面+尾段 base/over
//   表达式钉面,fail-loud 漂移即 throw 逼定谳）+VALUE[2203]=VALUE[2204]=100000。2192-2198
//   同值面不变（2194=27000/2196=200 覆写保留）。
//   消费面:2203=SteampunkBoiler/2204=HoneyDispenser（ItemID.cs:5952/5954;tile 307/308 同名,
//   任务猜测「血腥祭坛」不实）——双表口径:运行时卖回/货架=vanilla-shopstock.json（Steampunker
//   178 两格 price=100000+values['2203'/'2204']=100000 既有,本刀不改其运行时行为;可放置物块
//   不可重铸,Game.ts reforgeCost(:48840) 的 ITEM_VALUE 唯一消费点不受累）;本刀兑现
//   vanilla-itemvalue.json 权威值面与货架/卖回表同值对齐（消缺键债,extract-itemsorting
//   对照校验源同步归真）。RecipeGroup 零成员（机械核,decraft 代表零变更）/
//   rare 面零变更（value 键 5344→5346,rare 3632 不变）。
//   守卫:tests/s1-itemrare-five-faces.test.ts（② 扩锚+变异二发源）+
//   tests/v1-itemrare-nested-value.test.ts（⑤ 缺键锚翻正为兑现锚）。
//
// ★清偿刀 Z2（2026-10-02,S1① 食物尾式钉面;红蓝 D2 揭出的中低危潜伏面）:
//   S1① 尾段公式原为硬编码（基值 12/8/3+÷14400+trunc(÷4)）,源行 Item.cs:48392-48395
//   从不被解析或钉文本——M-F 实证（本刀开工复核）:源码 /4f→/5f 后旧实现 exit 0、输出
//   零漂移、全绿,未来版本改尾式全工具链不可见。落刀=尾式四行【文本钉面】（SetFoodDefaults
//   收口前 2-tab 尾段,位置锚在 region 平衡收口上=行漂移不破锚;1456:48004-48007 行漂文本
//   逐字节全等,1458 Item.cs 全文件 sha256 同 1457）+基值/除数常量【机械解析】（==207→12/
//   !=206→3/==206→8 三支+buffTime/14400 整除+trunc(num/4) 全部从源文本解析,非硬编码;
//   解析值≡定谳钉值对拍,漂移即 throw 逼定谳）+rare 计算改用解析常量（钉面通过后语义
//   不变=零漂移）。判别测试:tests/s1-itemrare-five-faces.test.ts 变异⑧⑨⑩（尾式文本
//   漂移/基值漂移/buffTime 除数漂移→fail-loud;源变异走沙箱副本,原树 sha256 零接触）。

import { readFileSync, writeFileSync, writeSync, existsSync } from 'node:fs';

const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)
// 源版本可选(★拍板#7A 2026-09-18 缺省翻转 1456→1457：现库 vanilla-itemrare/itemvalue
//   已是 1457 终值态,裸跑重产恢复正常更新流;extract-projectiles.mjs 同族先例。
//   1456 显式路径保留供 recon-item-1456-1457.mjs 双闸——其双实例均显式注入
//   SW_ITEM_VER(:198-199 亲核,--dump 对账通道不受守卫限制,不破)。显式 1456
//   重放旧基线会被下方追加时代守卫拦截(missing=50/49),防洗库)
export const SRC_VER = process.env.SW_ITEM_VER ?? '1457';

/** 提取库:Item.cs 全文 → { RARE, VALUE }（id → 档位/价值,铜币,原版 value 字段终值——
 *  sellPrice 系含 ×5 尾乘,2026-08-23 修正）。
 *  ★S1 起第二参 itemIdsSrc = 同版本 Terraria.ID/ItemID.cs 全文（S1① IsFood 集解析;
 *  缺省 null 时食物尾段编译器 fail-loud——禁静默跳过,防 1456/1457 双实例口径漂移） */
export function extractRareValue(src, itemIdsSrc = null) {
  const LINES = src.split('\n');

// ============ 区域：SetDefaults1..5 + SetFoodDefaults 方法体 ============

/** 方法体切片（从签名行到配平的闭括号，含尾行） */
function methodRange(name) {
  const sig = LINES.findIndex((l) => new RegExp(`^\\t(public|private) void ${name}\\(`).test(l));
  if (sig < 0) throw new Error(`method ${name} not found`);
  let depth = 0;
  for (let i = sig; i < LINES.length; i++) {
    depth += (LINES[i].match(/{/g) ?? []).length - (LINES[i].match(/}/g) ?? []).length;
    if (depth === 0 && i > sig) return [sig, i];
  }
  throw new Error(`method ${name} unbalanced`);
}

const REGIONS = ['SetDefaults1', 'SetDefaults2', 'SetDefaults3', 'SetDefaults4', 'SetDefaults5', 'SetFoodDefaults']
  .map((n) => methodRange(n));

// ============ 表达式求值 ============

/** 只读价格字段 → 初始化器 sellPrice 表达式（Item.cs 顶部 private readonly 字段，
 *  静态扫描只见 `value = shadowOrbPrice;` 引用名 → 先展开为表达式再走 sellPrice
 *  求值（自动 ×5，与 sellPrice 系条目同口径）。出处行号：1457 Item.cs:71-83 /
 *  1456 :52-64，两版初始化器同式。 */
const FIELD_PRICE = {
  shadowOrbPrice: 'sellPrice(0, 1, 50)',        // 1457:71 / 1456:52 → 75000（卖 1金50银）
  dungeonPrice: 'sellPrice(0, 1, 75)',          // 1457:73 / 1456:54 → 87500（卖 1金75银）
  queenBeePrice: 'sellPrice(0, 2)',             // 1457:75 / 1456:56 → 100000（卖 2金）
  hellPrice: 'sellPrice(0, 2, 50)',             // 1457:77 / 1456:58 → 125000（卖 2金50银）
  eclipsePrice: 'sellPrice(0, 7, 50)',          // 1457:79 / 1456:60 → 375000（卖 7金50银）
  eclipsePostPlanteraPrice: 'sellPrice(0, 10)', // 1457:81 / 1456:62 → 500000（卖 10金）
  eclipseMothronPrice: 'sellPrice(0, 12, 50)',  // 1457:83 / 1456:64 → 625000（卖 12金50银）
};

/** buyPrice(p, g, s[, c]) = p*1e6 + g*1e4 + s*100 + c（Item.cs:49421-49424，铜币直和）。
 *  sellPrice(p, g, s[, c]) = buyPrice(…) × 5（Item.cs:49426-49429 尾乘 5；1456
 *  :49019-49022 同式）——参数语义 = 玩家卖出价（币面额），value 字段存 NPC 买入价
 *  = 卖价×5（原版商店 5:1 买卖差）。★2026-08-23 系统性漏乘修复：旧实现把两者
 *  同式求值，全表 sellPrice 系条目统一 ÷5（case 757 实证 200000，应为 1000000）。 */
function evalPrice(expr) {
  let out = expr
    .replace(new RegExp(`\\b(${Object.keys(FIELD_PRICE).join('|')})\\b`, 'g'), (n) => `(${FIELD_PRICE[n]})`)
    .replace(/sellPrice\(([^()]*)\)/g, (_all, args) => {
      const a = args.split(',').map((x) => parseInt(x.trim(), 10) || 0);
      return String(((a[0] || 0) * 1e6 + (a[1] || 0) * 1e4 + (a[2] || 0) * 100 + (a[3] || 0)) * 5);
    })
    .replace(/buyPrice\(([^()]*)\)/g, (_all, args) => {
      const a = args.split(',').map((x) => parseInt(x.trim(), 10) || 0);
      return String((a[0] || 0) * 1e6 + (a[1] || 0) * 1e4 + (a[2] || 0) * 100 + (a[3] || 0));
    })
    .replace(/\((?:int|double|float)\)\s*/g, '')  // (int)((double)x * 1.5) 族强转
    .trim();
  // 反编译器自赋值伪影：`value = (value = 250000);`（1456:6323 case 425 /
  // :10417 case 774）→ 剥壳取内层表达式（C# 赋值表达式值为右操作数）
  while (/\(value = ([^()]*)\)/.test(out)) out = out.replace(/\(value = ([^()]*)\)/g, '$1').trim();
  if (!/^[\d+\-*/(). ]+$/.test(out)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const v = new Function(`"use strict";return (${out});`)();
    return Number.isFinite(v) ? Math.trunc(v) : null;
  } catch {
    return null;
  }
}

/** ItemRarityColor（Terraria.Enums/ItemRarityColor.cs）→ rare 档 */
const RARITY_COLOR = {
  AmberMinus11: -11, TrashMinus1: -1, White0: 0, Blue1: 1, Green2: 2, Orange3: 3,
  LightRed4: 4, Pink5: 5, LightPurple6: 6, Lime7: 7, Yellow8: 8, Cyan9: 9,
  StrongRed10: 10, Purple11: 11,
};

// ============ 工厂方法 value 表（方法体内赋值，静态扫描不可见） ============
//  行号锚 = 1457：DefaultToSeaShell :47967-47993 按 type 内层 switch；DefaultToSolution
//  :47800-47808；DefaultToVanitypet :47937-47952；DefaultToTorch :48471-48482；
//  DefaultToFood :48544-48570；DefaultToHealingPotion :48573-48615；DefaultToMusicBox
//  :48638-48648。表值一律存源码表达式字符串、经上方 evalPrice 求值（sellPrice 自动
//  ×5）——★旧表存手算常量（按无 ×5 口径），SeaShell/Vanitypet 六族随之 ÷5。
//  DefaultToPlaceableTile/Wall / DefaultToCapturedCritter 不设 value（缺表=0 是对的）。
const FACTORY_VALUE = {
  DefaultToSeaShell: (id) => (id === 4071 ? 'sellPrice(0, 1)' : id === 4072 || id === 4073 ? 'sellPrice(0, 0, 20)' : id === 2626 ? 'sellPrice(0, 0, 10)' : 'sellPrice(0, 0, 5)'),
  DefaultToSolution: () => 'buyPrice(0, 0, 15)',
  DefaultToVanitypet: () => 'sellPrice(0, 2)',
  DefaultToTorch: () => '60',             // value = 60 字面量
  DefaultToFood: () => 'buyPrice(0, 0, 20)',
  DefaultToHealingPotion: () => 'buyPrice(0, 0, 20)',
  DefaultToMusicBox: () => '100000',      // value = 100000 字面量
};

// ============ ★清偿刀 R2（2026-09-30,头注续）：DefaultTo* helper 体 rare/value 编译 ============
//  extract-itemcombat Q1 DEFAULT_TO_BODY 同法移植（两提取器独立文件,按本件 rare/value
//  两域裁剪为「委托基座先、自身行后覆写」的行源序模拟;形参不参与 rare/value 表达式
//  ——11 helper 逐条亲核 RHS 全为字面/buyPrice/sellPrice/ItemRarityColor）。
//  census（1457 逐 helper 亲读;1456/1458 三版同构零漂移——BodyCensus 对照脚本实证）：
//  33 名 DefaultTo* 中 11 名体含 rare/value/SetShopValues——DefaultToMusicBox rare=4+
//  value=100000（:48649-48650）、DefaultToSolution rare=3+value（:47806-47807）、
//  DefaultToVanitypet rare=3+value（:47944/47946）、DefaultToFood rare=1+value（:48565-
//  48566）、DefaultToHealingPotion rare=1+value（:48583-48584）、DefaultToTorch value=60
//  （:48482）、DefaultToQuestFish rare=-11（:27658）、DefaultToKite SSV(Blue1,buyPrice(0,2))
//  （:47835）、DefaultToBanner SSV(Blue1,1000)（:47756）、DefaultToGolfBall value=0→
//  SSV(Green2,buyPrice(0,1))（:35459-35460,行序尾胜=rare2/10000）。case 体顶层可达调用点
//  （id 对,由区域扫描组归属）：MusicBox 101/Solution 3/Vanitypet 51/Kite 24/Banner 3/
//  GolfBall 15/QuestFish 2/Food 85/Potion 1/SeaShell 5/Torch 8;其余 22 名体无 rare/value。
//  value 域分工（配方核对,禁双源漂移）：FACTORY_VALUE 七表维持权威（金标已锁;SeaShell
//  per-type switch 体编译器不可达=表唯一来源）;编译器对七表 helper 做编译值≡表值对拍,
//  不等即 throw;表缺的 Kite/Banner/GolfBall 由编译器供值。rare 域：编译器唯一权威
//  （MusicBox=4/Solution=3/Vanitypet=3/Kite=1/Banner=1/GolfBall=2/QuestFish=-11/Food=1/
//  Potion=1——Food/Potion 调用点全带尾随 SetShopValues,case 级 rare 已在,编译值不新增键）。
//  fail-loud：①helper 体/委托缺失 ②depth>0 处 rare/value/SetShopValues 不可达编译（唯
//  SeaShell per-type switch 已知例外,FACTORY_VALUE 承接）③rare RHS 非整数字面 ④value
//  RHS evalPrice 不可解 ⑤七表 helper 编译值≠表值。
const DEFAULT_TO_BODY_RV = (() => {
  const SPEC = new Map(); // name -> (id) => {rare?, value?}
  // ① 收集全部 DefaultTo* 声明（含重载——DefaultToPlaceableTile int/ushort 双载,自转发）
  const decls = new Map(); // name -> body[]
  const declRe = /\b(?:public|private)\s+void\s+(DefaultTo\w+)\s*\(([^)]*)\)\s*\{/g;
  let dm;
  while ((dm = declRe.exec(src))) {
    const name = dm[1];
    const start = src.indexOf('{', dm.index);
    let d = 0, end = -1;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (d === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    if (!decls.has(name)) decls.set(name, []);
    decls.get(name).push(src.slice(start + 1, end));
    declRe.lastIndex = end + 1;
  }
  // ② 体编译：行序步进（委托/rare/value/SetShopValues 赋值）;depth>0 的本域赋值不可达
  //   编译即 fail-loud（era guard ③ 静默兜底禁令;唯 SeaShell switch(type) 已知例外）
  function compileBody(name, stack) {
    if (SPEC.has(name)) return SPEC.get(name);
    if (stack.has(name)) throw new Error(`[extract-itemrare] helper 委托环:${[...stack, name].join('→')}`);
    const bodies = decls.get(name);
    if (!bodies) throw new Error(`[extract-itemrare] helper 体缺失:${name}（Item.cs 漂移,禁止静默空体）`);
    stack.add(name);
    const steps = [];
    for (const body of bodies) {
      let depth = 0;
      for (const raw of body.split('\n')) {
        const o = (raw.match(/{/g) || []).length, c = (raw.match(/}/g) || []).length;
        const t = raw.trim();
        if (t) {
          if (depth === 0 && o === 0) {
            let m;
            if (new RegExp(`^${name}\\s*\\(`).test(t)) { /* 自转发重载行（int→ushort） */ }
            else if ((m = /^(DefaultTo\w+)\s*\((.*)\);\s*$/.exec(t))) steps.push({ delegate: m[1] });
            else if ((m = /^SetShopValues\(ItemRarityColor\.(\w+),\s*([^;]+)\);\s*$/.exec(t))) {
              const r = RARITY_COLOR[m[1]];
              if (r === undefined) throw new Error(`[extract-itemrare] helper ${name} SetShopValues 档名不可解:${m[1]}`);
              steps.push({ rare: r }, { value: m[2] });
            } else if ((m = /^rare = (-?\d+);\s*$/.exec(t))) steps.push({ rare: +m[1] });
            else if ((m = /^value = ([^;]+);\s*$/.exec(t))) steps.push({ value: m[1] });
            // 其它语句（width/height/useStyle…）与本域无关,忽略
          } else if (/^(rare = |value = |SetShopValues\()/.test(t) && name !== 'DefaultToSeaShell') {
            throw new Error(`[extract-itemrare] helper ${name} depth>${depth} 处 rare/value/SetShopValues 不可达编译（Item.cs 漂移,禁止静默跳过）:${t}`);
          }
        }
        depth += o - c;
        if (depth < 0) depth = 0;
      }
    }
    // 委托基座【编译期】递归解析（环检测在此发生）
    for (const st of steps) if (st.delegate) compileBody(st.delegate, stack);
    stack.delete(name);
    const spec = () => {
      const out = {};
      for (const st of steps) {
        if (st.delegate) {
          const sub = SPEC.get(st.delegate)();
          if (sub.rare !== undefined) out.rare = sub.rare;
          if (sub.value !== undefined) out.value = sub.value;
          continue;
        }
        if (st.rare !== undefined) out.rare = st.rare;
        else {
          const v = evalPrice(st.value);
          if (v === null) throw new Error(`[extract-itemrare] helper ${name} value 不可解:${st.value}`);
          out.value = v;
        }
      }
      return out;
    };
    SPEC.set(name, spec);
    return spec;
  }
  for (const name of decls.keys()) compileBody(name, new Set());
  return SPEC;
})();

const RARE = {};
const VALUE = {};

// 深度栈解析：switch 关键字 depth d → case 标签 d+1 → 体语句/终止符 d+2。
// SetDefaults 各段嵌套异构（顶层 case depth 2；SetDefaults2/3 内还有 depth 4 的
// 内层 switch case，如水母饵 2436-2438 :24082、贝壳 2625/2626 :25598）——
// 按标签深度分组建栈，语句归属 depth-1 的最内层组，终止符弹同深度组；
// 内层 per-type 赋值随内层组独立成段（变体分支，不污染外层基础值）。
for (const [from, to] of REGIONS) {
  const groups = []; // { ids: number[], depth, entries: [] }
  const groupAt = (d) => {
    for (let i = groups.length - 1; i >= 0; i--) if (groups[i].depth === d) return groups[i];
    return null;
  };
  const flush = (g) => {
    if (!g) return;
    // 顶层序列最后一个生效（DefaultToFood → SetShopValues 覆盖模式）；
    // 工厂调用按标签逐个求值（DefaultToSeaShell 2625=500 / 2626=1000 per-type）。
    // **先写为准**：反编译 SetDefaults 是多个顺序独立 switch(type) 链，命中即 return
    // ——后置 switch 里的重叠标签是死代码（如 2291 鱼竿 :22989 先于 :23107 的
    // 死标签组 value=500），不覆盖
    for (const id of g.ids) {
      let val;
      let rar;
      for (const e of g.entries) {
        if (e.kind === 'value') val = e.v;
        else if (e.kind === 'rare') rar = e.v;
        else if (e.kind === 'factory') {
          // ★R2：工厂调用 → DEFAULT_TO_BODY_RV 体编译规格。rare 域=编译器唯一权威;
          //   value 域=FACTORY_VALUE 七表权威（金标已锁）+编译值对拍（不等即 throw,
          //   禁双源漂移）;表缺 helper（Kite/Banner/GolfBall 等）由编译器供值。
          const spec = DEFAULT_TO_BODY_RV.get(e.name);
          if (!spec) throw new Error(`[extract-itemrare] 工厂 ${e.name} 无体编译规格（Item.cs 漂移,禁止静默空面）`);
          const b = spec(id);
          if (b.rare !== undefined) rar = b.rare;
          const table = FACTORY_VALUE[e.name];
          if (table) {
            const fv = evalPrice(table(id));
            if (fv === null) throw new Error(`[extract-itemrare] ${e.name} FACTORY_VALUE 不可解:${table(id)}`);
            if (b.value !== undefined && fv !== b.value) throw new Error(`[extract-itemrare] ${e.name} value 双源漂移:表=${fv} 体编译=${b.value}`);
            val = fv;
          } else if (b.value !== undefined) {
            val = b.value;
          }
        }
      }
      if (val !== undefined && VALUE[id] === undefined) VALUE[id] = val;
      if (rar !== undefined && RARE[id] === undefined) RARE[id] = rar;
    }
    groups.splice(groups.indexOf(g), 1);
  };
  for (let i = from; i <= to; i++) {
    const line = LINES[i];
    const depth = (line.match(/^\t*/) ?? [''])[0].length;
    const cm = line.match(/^\t*case (\d+):\s*$/);
    if (cm) {
      const id = parseInt(cm[1], 10);
      const top = groups[groups.length - 1];
      if (top && top.depth === depth) top.ids.push(id);
      else groups.push({ ids: [id], depth, entries: [] });
      continue;
    }
    const s = line.trim();
    if (/^(break;|return\b|goto )/.test(s)) { flush(groupAt(depth - 1)); continue; }
    if (/^default:/.test(s)) { flush(groupAt(depth)); continue; }
    const g = groupAt(depth - 1);
    if (!g || depth !== g.depth + 1) continue;   // 只认 case 体顶层无条件语句
    let m;
    if ((m = s.match(/^SetShopValues\(ItemRarityColor\.(\w+),\s*([^;]+)\);$/))) {
      const v = evalPrice(m[2]);
      const r = RARITY_COLOR[m[1]];
      if (r !== undefined) g.entries.push({ kind: 'rare', v: r });
      if (v !== null) g.entries.push({ kind: 'value', v });
      continue;
    }
    // ★R2：工厂 regex 扩面 7 名 → DefaultTo\w+ 全量（Kite/Banner/GolfBall/QuestFish 等
    //   体含 rare/SetShopValues 的 helper 调用点此前整行不可见;体面产出走
    //   DEFAULT_TO_BODY_RV 编译规格,见 flush 工厂分支）
    if ((m = s.match(/^(DefaultTo\w+)\(/))) {
      g.entries.push({ kind: 'factory', name: m[1] });
      continue;
    }
    if ((m = s.match(/^value = ([^;]+);$/))) {
      const v = evalPrice(m[1]);
      if (v !== null) g.entries.push({ kind: 'value', v });
      continue;
    }
    if ((m = s.match(/^rare = (-?\d+);$/))) {
      g.entries.push({ kind: 'rare', v: +m[1] });
    }
  }
  while (groups.length) flush(groups[0]);
}

// ★BJ91 2026-09-15（RB17b note③）共享 case 的 if(type==X) 全覆盖 rare 覆写反哺：
//   提取器按设计只认 case 体顶层无条件赋值、忽略 if 变体分支（头注口径）——但
//   case 3860/3861/3862（泰坦袋/食人魔袋/黑魔法师袋）的基础 rare=1 被三型 if 链
//   【全覆盖】=对每型皆死码，终值 3860=8/3861=5/3862=3（Item.cs:34145-34164；
//   1456:34120-34140/1458:34145-34165 同链零漂移）。
// ★RB20b 2026-09-15 追加（同族盲区残留）：13 主 Boss 宝袋 3320-3332 与 3860-3862
//   同构——共享 case 3319-3332 基础 rare=1（:30562）+ 13 条 if(type==X) 覆写链
//   （1457 :30563-30589；1456 :30539-30588/1458 同链零漂移）：2/2/3/3/4/5/5/5/6/7/
//   7/8/8（逐值=吞噬/克脑/蜂王/骷髅/肉山/毁灭者/双子/ Prime /世纪花/石巨人/猪龙鱼/
//   拜月教主）。★RB20b note① 勘误：旧注「此前整缺」不实——json 一直有键，
//   是【错值非缺键】（提取面 rare=1，运行时 tooltip/拾取飘名按 1=蓝档着色错档）。
//   3319 克苏鲁之眼袋无覆写行=1 正确不在此列。钉值随提取器走=重产不回退
//   （判例 fx3:重产前必反哺，否则手补被静默洗回提取字面）。守卫=tests/
//   bj91-bossbag-rare.test.ts（json 值+def 面+13 袋值表）+ recon-item-1456-1457.mjs DRIFT。
const HAND_RARE = {
  3860: 8, 3861: 5, 3862: 3,
  3320: 2, 3321: 2, 3322: 3, 3323: 3, 3324: 4, 3325: 5, 3326: 5, 3327: 5,
  3328: 6, 3329: 7, 3330: 7, 3331: 8, 3332: 8,
  // ★BJ413 2026-09-30（风筝无效实报,item 面回填）：24 风筝 rare=1（Blue1）——
  //   rare 由 DefaultToKite 体 :47835 `SetShopValues(ItemRarityColor.Blue1,
  //   buyPrice(0, 2))` 落（helper 体内=case 体顶层无条件语句子之外,本提取器
  //   「只认 case 体顶层」口径不可达→HAND 钉值,与 3860 判例同形）。17 调用点
  //   （4367-4371 组/4379/4610-4612/4613/4648-4651 组/4669-4671/4674-4677/4681/
  //   4683-4684）。4676/4681 的 case 内 `value = buyPrice(0, 2)` 与 helper 体同值
  //   （冗余覆写,非 rare 面）。
  4367: 1, 4368: 1, 4369: 1, 4370: 1, 4371: 1, 4379: 1,
  4610: 1, 4611: 1, 4612: 1, 4613: 1,
  4648: 1, 4649: 1, 4650: 1, 4651: 1,
  4669: 1, 4670: 1, 4671: 1, 4674: 1, 4675: 1, 4676: 1, 4677: 1,
  4681: 1, 4683: 1, 4684: 1,
  // ★R2 2026-09-30（helper 体 rare 面·方法级 if 范围守卫形态,Kite/BJ413 判例同构）：
  //   angler 任务鱼 2450-2488（39 件）rare=-11——rare 由 DefaultToQuestFish 体 :27657
  //   `rare = -11;` 落,但调用点在 SetDefaults3 方法级范围守卫 `if (type >= 2450 &&
  //   type <= 2488)`（:24153-24157,内层 switch 收口后）=非 case 组顶层,本扫描器
  //   「只认 case 体顶层」口径不可达→HAND 钉值。case 顶层调用的 4393/4394 走上方
  //   DEFAULT_TO_BODY_RV 体编译器自动入面（同 rare=-11）,3385-3388 为 case 级显式行
  //   （:30975）既有——任务鱼全族 45 件=39+2+4。消费面：Bobber consumeBait
  //   （Player.cs:53148-53156 rare<0 饵不耗,任务鱼原版同款）+ tooltip 稀有色 quest 档
  //   （UI rarityColor −11 档）。
  2450: -11, 2451: -11, 2452: -11, 2453: -11, 2454: -11, 2455: -11, 2456: -11,
  2457: -11, 2458: -11, 2459: -11, 2460: -11, 2461: -11, 2462: -11, 2463: -11,
  2464: -11, 2465: -11, 2466: -11, 2467: -11, 2468: -11, 2469: -11, 2470: -11,
  2471: -11, 2472: -11, 2473: -11, 2474: -11, 2475: -11, 2476: -11, 2477: -11,
  2478: -11, 2479: -11, 2480: -11, 2481: -11, 2482: -11, 2483: -11, 2484: -11,
  2485: -11, 2486: -11, 2487: -11, 2488: -11,
};
for (const [id, r] of Object.entries(HAND_RARE)) RARE[id] = r;
// ★BJ413：24 风筝 value=20000（2 金）——DefaultToKite 体 :47835 buyPrice(0, 2)
//   （buyPrice(int platinum=0, int gold=0, int silver=0, int copper=0),Item.cs:49421
//   ——第一实参 0=platinum、第二实参 2=gold → 2×10000=20000 铜;4676/4681 case 内
//   `value = buyPrice(0, 2)` 同值冗余）。helper 体面提取器不可达→HAND 钉值
//   （消费面=Game.ts:48408 权威值查表/商店售价/Shimmer 重铸费）。
const HAND_VALUE = {
  4367: 20000, 4368: 20000, 4369: 20000, 4370: 20000, 4371: 20000, 4379: 20000,
  4610: 20000, 4611: 20000, 4612: 20000, 4613: 20000,
  4648: 20000, 4649: 20000, 4650: 20000, 4651: 20000,
  4669: 20000, 4670: 20000, 4671: 20000, 4674: 20000, 4675: 20000, 4676: 20000,
  4677: 20000, 4681: 20000, 4683: 20000, 4684: 20000,
};
for (const [id, v] of Object.entries(HAND_VALUE)) VALUE[id] = v;

// ============ ★清偿刀 S1（2026-09-30,五段续刀）============
// 行源序:case 组 < 方法级守卫/链 < 既有 HAND < 派发后块 < 食物尾式。逐段头注见文件顶。

// ---- S1① SetFoodDefaults 尾段 rare=(int)(num/4f) 编译器 ----
const S1_FOOD = (() => {
  if (itemIdsSrc === null) throw new Error('[extract-itemrare] S1① 缺 ItemID.cs 源（IsFood 解析不可用,禁静默跳过）');
  const im = itemIdsSrc.match(/IsFood\s*=\s*Factory\.CreateBoolSet\(([^)]*)\)/);
  if (!im) throw new Error('[extract-itemrare] S1① ItemID.cs IsFood=Factory.CreateBoolSet 未找到（源漂移,禁静默）');
  const ids = im[1].split(',').map((s) => parseInt(s.trim(), 10)).filter(Number.isInteger);
  if (!ids.length) throw new Error('[extract-itemrare] S1① IsFood 集为空（解析漂移）');
  const [fFrom, fTo] = REGIONS[5];
  if (!LINES[fFrom] || !LINES[fFrom].includes('SetFoodDefaults(')) {
    throw new Error('[extract-itemrare] S1① REGIONS[5] 非 SetFoodDefaults（区域表漂移,禁静默）');
  }
  const args = new Map(); // id → [buffType, buffTime]
  let cur = null;
  for (let i = fFrom; i <= fTo; i++) {
    const line = LINES[i];
    const cm = line.match(/^\t\tcase (\d+):\s*$/);
    if (cm) { cur = parseInt(cm[1], 10); continue; }
    if (/^\t\tbreak;\s*$/.test(line)) {
      if (cur !== null) throw new Error(`[extract-itemrare] S1① 食物 case ${cur} 无 DefaultToFood/DefaultToHealingPotion 调用（形态漂移,禁静默）`);
      cur = null;
      continue;
    }
    if (cur === null) continue;
    if (/^\t\tbuffType = |^\t\tbuffTime = /.test(line)) {
      throw new Error(`[extract-itemrare] S1① case ${cur} 直写 buffType/buffTime（未建模形态,禁静默）:${line.trim()}`);
    }
    const fm = line.trim().match(/^(DefaultToFood|DefaultToHealingPotion)\(([^)]*)\);\s*$/);
    if (fm) {
      if (fm[1] === 'DefaultToHealingPotion') { args.set(cur, [0, 0]); continue; }
      const a = fm[2].split(',').map((x) => x.trim());
      const buff = parseInt(a[2], 10);
      const time = parseInt(a[3], 10);
      if (!Number.isInteger(buff) || !Number.isInteger(time)) {
        throw new Error(`[extract-itemrare] S1① case ${cur} DefaultToFood 第 3/4 形参不可解（具名/表达式形参未建模）:${fm[2]}`);
      }
      args.set(cur, [buff, time]);
    }
  }
  for (const id of args.keys()) {
    if (!ids.includes(id)) throw new Error(`[extract-itemrare] S1① SetFoodDefaults case ${id} 不在 IsFood 集（死 case,源漂移）`);
  }
  // ★清偿刀 Z2（2026-10-02,S1① 食物尾式钉面;头注 Z2 节）:旧实现基值 12/8/3+÷14400+
  //   trunc(÷4) 全硬编码,源行 :48392-48395 从不被解析或钉文本（M-F 实证 /4f→/5f 全绿
  //   不可见）。落刀=①尾式四行文本钉面（方法收口前 2-tab 尾段,位置锚=region 平衡收口,
  //   行漂移不破锚;1456:48004-48007 文本逐字节全等）②基值/除数机械解析（三支+14400+4
  //   从源文本解析,解析值≡定谳钉值对拍,漂移即 throw 逼定谳）③rare 计算改用解析常量
  //   （钉面通过后语义不变=零漂移）。
  const TAIL_PINS = [
    '\t\tfloat num = 0f;',
    '\t\tnum = ((buffType == 207) ? (num + 12f) : ((buffType != 206) ? (num + 3f) : (num + 8f)));',
    '\t\tnum += (float)(buffTime / 14400);',
    '\t\trare = (int)(num / 4f);',
  ];
  for (let k = 0; k < TAIL_PINS.length; k++) {
    const at = fTo - TAIL_PINS.length + k;
    if (LINES[at] !== TAIL_PINS[k]) {
      throw new Error(`[extract-itemrare] Z2/S1① 食物尾式文本漂移(:${at + 1}):${JSON.stringify(LINES[at])}（expected ${JSON.stringify(TAIL_PINS[k])}）——尾式改版全工具链不可见面,须重定谳`);
    }
  }
  const bm = TAIL_PINS[1].match(/^\t\tnum = \(\(buffType == (\d+)\) \? \(num \+ (\d+)f\) : \(\(buffType != (\d+)\) \? \(num \+ (\d+)f\) : \(num \+ (\d+)f\)\)\);$/);
  if (!bm) throw new Error('[extract-itemrare] Z2/S1① 尾式基值三支不可解析（形态漂移,须重定谳）');
  const tm = TAIL_PINS[2].match(/^\t\tnum \+= \(float\)\(buffTime \/ (\d+)\);$/);
  if (!tm) throw new Error('[extract-itemrare] Z2/S1① buffTime 除数不可解析（形态漂移,须重定谳）');
  const rz = TAIL_PINS[3].match(/^\t\trare = \(int\)\(num \/ (\d+)f\);$/);
  if (!rz) throw new Error('[extract-itemrare] Z2/S1① rare 除数不可解析（形态漂移,须重定谳）');
  const tail = { posId: +bm[1], posVal: +bm[2], negId: +bm[3], neqVal: +bm[4], eqVal: +bm[5], timeDiv: +tm[1], rareDiv: +rz[1] };
  if (tail.posId === tail.negId) throw new Error(`[extract-itemrare] Z2/S1① 尾式三支 id 退化(posId==negId=${tail.posId})——分支语义矛盾,须重定谳`);
  // 定谳钉值对拍（1457 亲读终值;源改基值/除数→解析≠钉=fail-loud,改口径须先定谳再改钉值）
  const Z2_TAIL_TRUTH = { posId: 207, posVal: 12, negId: 206, neqVal: 3, eqVal: 8, timeDiv: 14400, rareDiv: 4 };
  for (const [k, v] of Object.entries(Z2_TAIL_TRUTH)) {
    if (tail[k] !== v) throw new Error(`[extract-itemrare] Z2/S1① 尾式基值/除数漂移:${k}=${tail[k]}（expected ${v}）——新基值/新除数现形须先定谳`);
  }
  // num 语义（:48392-48395 亲读,常量已由上方解析）:饱食档→基值（207 三档=12/206 两档=8/
  // 其余含 26 一档与无 buff=3）+ buffTime 整除档位（14400 帧=4 分钟）;rare=(int)(num/4f)
  // 截断。C# int/int 整除+float 除后 (int) 强转 ≡ Math.trunc。
  const rare = {};
  for (const id of ids) {
    const [buff, time] = args.get(id) ?? [0, 0];
    const base = buff === tail.posId ? tail.posVal : buff !== tail.negId ? tail.neqVal : tail.eqVal;
    rare[id] = Math.trunc((base + Math.trunc(time / tail.timeDiv)) / tail.rareDiv);
  }
  return { ids, rare };
})();
for (const [id, r] of Object.entries(S1_FOOD.rare)) RARE[id] = r;

// ---- S1② SetDefaults3 方法尾笼件段 value=buyPrice(0,10)（可达集=卫块补集∪break-exit） ----
// ★清偿刀 S1b（2026-10-01,V1 走栈翻案兑现;S1② 定谳翻正）:原「块尾无条件 return」前提
//   不成立——卫块内唯一 return 在内层 switch default 段体尾(:27618),case 2203/2204 体=裸
//   break(:22295) 穿出 switch→穿出卫块→落尾段 value=buyPrice(0,10)(:27641)。可达集=
//   [2192,2198]∪{2203,2204}。结构前提 A/B+break-exit 钉面+尾段表达式钉面全部 fail-loud
//   （机械断言见下;三版同构锚:1456:22263/27614,1458=1457,头注 S1b 节）。
(() => {
  const [cFrom, cTo] = REGIONS[2]; // SetDefaults3
  if (!LINES[cFrom] || !LINES[cFrom].includes('SetDefaults3(')) {
    throw new Error('[extract-itemrare] S1② REGIONS[2] 非 SetDefaults3（区域表漂移）');
  }
  // 尾卫 `if (type < A || type > B)`(2-tab)
  let guard = null;
  for (let i = cFrom; i <= cTo; i++) {
    const gm = LINES[i].match(/^\t\tif \(type < (\d+) \|\| type > (\d+)\)\s*$/);
    if (!gm) continue;
    let d = 0;
    let blockEnd = -1;
    for (let j = i + 1; j <= cTo; j++) {
      if (j === i + 1 && LINES[j].trim() === '{') { d = 1; continue; }
      d += (LINES[j].match(/{/g) || []).length - (LINES[j].match(/}/g) || []).length;
      if (d === 0 && j > i + 1) { blockEnd = j; break; }
    }
    guard = { lo: +gm[1], hi: +gm[2], blockEnd, line: i };
    break;
  }
  if (!guard) throw new Error('[extract-itemrare] S1② SetDefaults3 尾卫 `if (type < A || type > B)` 未找到（源漂移）');
  // ★S1b 结构前提 A:卫块内唯一语句=顶层 switch(type),其收口与卫块收口之间零语句
  //   （break-exit 穿出 switch 后直落尾段的通路前提;新语句现形=路径面变化,须重定谳）
  const swHead = LINES[guard.line + 1].trim() === '{' ? guard.line + 2 : guard.line + 1;
  if (!/^\t\t\tswitch \(type\)\s*$/.test(LINES[swHead] ?? '')) {
    throw new Error(`[extract-itemrare] S1② 卫块(:${guard.line + 1})首语句非 3-tab switch(type)(:${swHead + 1}):${LINES[swHead]?.trim()}——结构漂移,须重定谳`);
  }
  let swD = 0;
  let swEnd = -1;
  for (let j = swHead + 1; j <= guard.blockEnd; j++) {
    swD += (LINES[j].match(/{/g) || []).length - (LINES[j].match(/}/g) || []).length;
    if (swD === 0) { swEnd = j; break; }
  }
  if (swEnd < 0) throw new Error('[extract-itemrare] S1② 卫块内 switch 未收口（结构漂移）');
  for (let j = swEnd + 1; j < guard.blockEnd; j++) {
    if (LINES[j].trim()) {
      throw new Error(`[extract-itemrare] S1② 卫块 switch 收口(:${swEnd + 1})后残留语句(:${j + 1}):${LINES[j].trim()}——break-exit 通路面变化,须重定谳`);
    }
  }
  // ★S1b 结构前提 B:switch 直接 case 段终止符谱 → break-exit 集（=落尾段的唯一 id 来源;
  //   直接标签=3-tab/体顶层=4-tab;段终止符=体顶层 bal==0 的 break/return/goto）
  const runs = [];
  let cur = null;
  for (let j = swHead + 1; j < swEnd; j++) {
    const lm = LINES[j].match(/^\t\t\tcase (\d+):\s*$/);
    const isDef = /^\t\t\tdefault:\s*$/.test(LINES[j]);
    if (!lm && !isDef) continue;
    const lab = lm ? +lm[1] : 'default';
    if (cur && j === cur.end + 1 && cur.labels !== 'default' && lab !== 'default') {
      cur.labels.push(lab);
      cur.end = j;
    } else {
      if (cur) runs.push(cur);
      cur = { labels: lab === 'default' ? 'default' : [lab], start: j + 1, end: j, labStart: j };
    }
  }
  if (cur) runs.push(cur);
  const breakExit = [];
  for (let k = 0; k < runs.length; k++) {
    const run = runs[k];
    const spanTo = k + 1 < runs.length ? runs[k + 1].labStart - 1 : swEnd - 1;
    const terms = [];
    let topStmts = 0;
    let bal = 0;
    for (let q = run.start; q <= spanTo; q++) {
      const t = LINES[q].trim();
      const dq = (LINES[q].match(/^\t*/) ?? [''])[0].length;
      if (bal === 0 && dq === 4 && t && !t.startsWith('case ') && t !== 'default:') {
        topStmts++;
        if (/^(break;|return\b|goto\b)/.test(t)) terms.push(t);
      }
      bal += (LINES[q].match(/{/g) || []).length - (LINES[q].match(/}/g) || []).length;
      if (bal < 0) bal = 0;
    }
    if (run.labels === 'default') {
      // default 段=补集:尾 return 终止（若变 break-终止=补集全体改落尾段,可达集剧变须重定谳）
      if (terms.length !== 1 || !/^return/.test(terms[0])) {
        throw new Error(`[extract-itemrare] S1② 卫块 switch default 段终止符漂移:[${terms.join('|')}]（expected 唯一 return）——须重定谳`);
      }
      continue;
    }
    if (terms.length !== 1) {
      throw new Error(`[extract-itemrare] S1② 卫块 switch 段(${run.labels.join(',')})终止符数≠1:[${terms.join('|')}]——复合/贯穿形态未建模,须重定谳`);
    }
    if (/^break;/.test(terms[0])) {
      if (topStmts !== 1) {
        throw new Error(`[extract-itemrare] S1② break-exit 段(${run.labels.join(',')})非裸 break（体 ${topStmts} 语句）——体语句面变化,须重定谳`);
      }
      breakExit.push(...run.labels);
    } else if (!/^return/.test(terms[0])) {
      throw new Error(`[extract-itemrare] S1② 段终止符形态外(${run.labels.join(',')}):${terms[0]}——goto/复合须重定谳`);
    }
  }
  breakExit.sort((a, b) => a - b);
  if (JSON.stringify(breakExit) !== JSON.stringify([2203, 2204])) {
    throw new Error(`[extract-itemrare] S1② break-exit 集漂移:[${breakExit.join(',')}]（expected [2203,2204]——V1 走栈翻案面,漂移须重定谳）`);
  }
  // 可达性前提（补集部分,不变）:SD3 内零 [lo,hi] case 标签（有=该 id 提前 return,尾段对它死码）
  for (let id = guard.lo; id <= guard.hi; id++) {
    const re = new RegExp(`^\\t*case ${id}:\\s*$`);
    for (let i = cFrom; i <= cTo; i++) {
      if (re.test(LINES[i])) throw new Error(`[extract-itemrare] S1② 可达集破约:case ${id} 在 SD3 出现(:${i + 1}),尾段对其死码——须重定谳`);
    }
  }
  // 尾段:卫块后首个 2-tab `value = buyPrice(0, 10);` + 后随 if(type==N) 覆写块
  let baseExpr = null;
  const over = {}; // id → expr
  for (let i = guard.blockEnd + 1; i <= cTo; i++) {
    const line = LINES[i];
    if (baseExpr === null) {
      if (/^\t\tvalue = [^;]+;\s*$/.test(line)) baseExpr = line.trim().match(/^value = ([^;]+);$/)[1];
      continue;
    }
    const m = line.match(/^\t\tif \(type == (\d+)\)\s*$/);
    if (!m) continue;
    const vm = (LINES[i + 2] ?? '').trim().match(/^value = ([^;]+);\s*$/);
    if (!vm || LINES[i + 1].trim() !== '{') {
      throw new Error(`[extract-itemrare] S1② 尾段覆写块形态漂移(:${i + 1}):${LINES[i + 1]?.trim()}|${LINES[i + 2]?.trim()}`);
    }
    over[+m[1]] = vm[1];
  }
  if (baseExpr === null) throw new Error('[extract-itemrare] S1② 尾段基值行未找到');
  // ★S1b 尾段表达式钉面（源漂移即 throw,禁静默重放新值;三版逐字节全等锚=buyPrice(0, 10)）
  if (baseExpr !== 'buyPrice(0, 10)') {
    throw new Error(`[extract-itemrare] S1② 尾段基值漂移:${baseExpr}（expected buyPrice(0, 10)）——须重定谳`);
  }
  const S1B_OVER_PINS = { 2194: 'buyPrice(0, 2, 70)', 2196: '200' };
  const overKeys = Object.keys(over).map(Number).sort((a, b) => a - b);
  const pinKeys = Object.keys(S1B_OVER_PINS).map(Number).sort((a, b) => a - b);
  if (JSON.stringify(overKeys) !== JSON.stringify(pinKeys) || pinKeys.some((k) => over[k] !== S1B_OVER_PINS[k])) {
    throw new Error(`[extract-itemrare] S1② 尾段覆写面漂移:${JSON.stringify(over)}（expected ${JSON.stringify(S1B_OVER_PINS)}）——须重定谳`);
  }
  const baseVal = evalPrice(baseExpr);
  if (baseVal === null) throw new Error(`[extract-itemrare] S1② 尾段基值不可解:${baseExpr}`);
  for (let id = guard.lo; id <= guard.hi; id++) VALUE[id] = baseVal;
  for (const id of breakExit) VALUE[id] = baseVal; // ★S1b:2203/2204 裸 break 落尾段,同值面 100000
  for (const [id, expr] of Object.entries(over)) {
    const v = evalPrice(expr);
    if (v === null) throw new Error(`[extract-itemrare] S1② 覆写值不可解:${expr}`);
    VALUE[id] = v;
  }
})();

// ---- S1③ 方法级 if 范围守卫 rare 面（sweep ≡ 钉表,新守卫现形即 throw） ----
const S1_GUARD_PINS = [
  // 8 注册族（R2 census）+ 3 census 外同形扫获（事件旗/四碎片/队块平台）;行号=1457 锚
  { lo: 1522, hi: 1527, rare: 1, at: ':18537' },
  { lo: 1533, hi: 1537, rare: 8, at: ':18559' },
  { lo: 1977, hi: 1986, rare: 2, at: ':21236' },
  { lo: 2104, hi: 2113, rare: 1, at: ':21874' },
  { lo: 2214, hi: 2217, rare: 3, at: ':22375' },
  { lo: 2284, hi: 2287, rare: 5, at: ':22988' },
  { lo: 3309, hi: 3314, rare: 2, at: ':30258' },
  { lo: 3390, hi: 3452, rare: 1, at: ':30986' },
  { lo: 3456, hi: 3459, rare: 9, at: ':31021' },
  { lo: 3638, hi: 3642, rare: 1, at: ':32793' },
];
(() => {
  const swept = [];
  for (const [from, to] of REGIONS.slice(0, 5)) { // SetDefaults1..5
    for (let i = from; i <= to; i++) {
      const m = LINES[i].match(/^(\t*)if \(type >= (\d+) && type <= (\d+)\)\s*\{?\s*$/);
      if (!m) continue;
      const depth = m[1].length;
      const inline = /\{\s*$/.test(LINES[i]);
      let d = depth + (inline ? 1 : 0);
      let rareVal;
      for (let j = i + 1; j <= to; j++) {
        const bd = LINES[j].match(/^\t*/)[0].length;
        const t = LINES[j].trim();
        if (!inline && j === i + 1 && t === '{') { d += 1; continue; }
        if (bd === depth + 1 && d === depth + 1) {
          const rm = t.match(/^rare = (-?\d+);\s*$/);
          if (rm) rareVal = +rm[1];
        }
        d += (LINES[j].match(/{/g) || []).length - (LINES[j].match(/}/g) || []).length;
        if (j > i + 1 && d < depth + 1) break;
      }
      if (rareVal !== undefined) swept.push(`${m[2]}-${m[3]}=${rareVal}`);
    }
  }
  const pinKeys = S1_GUARD_PINS.map((g) => `${g.lo}-${g.hi}=${g.rare}`).sort();
  const sweptKeys = [...swept].sort();
  if (sweptKeys.length !== pinKeys.length || sweptKeys.some((k, i2) => k !== pinKeys[i2])) {
    throw new Error(`[extract-itemrare] S1③ 范围守卫 sweep≠钉表——新守卫现形须先定谳再入钉表:\n  sweep=[${sweptKeys.join(' ')}]\n  pins =[${pinKeys.join(' ')}]`);
  }
  for (const g of S1_GUARD_PINS) for (let id = g.lo; id <= g.hi; id++) RARE[id] = g.rare;
  // 单件方法级守卫 2320（census 外同形;锚 :23100-23117,块内 rare=3,return）
  const single = findTypeGuardBlock(2320);
  if (!single || single.rare !== 3) {
    throw new Error(`[extract-itemrare] S1③ 单件守卫 2320 锚漂移:found=${JSON.stringify(single)}（expected rare=3）`);
  }
  RARE[2320] = 3;
  // if-else 守卫 2421/2422（:23075-23098;if 体 rare=1→2421,else 体 rare=3→2422;
  // census 误记 2420——实际范围 [2421,2422]）
  const ie = findTypeGuardBlock(2421, 'type >= 2421 && type <= 2422');
  if (!ie || ie.rare !== 1 || !ie.elseBlock || ie.elseRare !== 3) {
    throw new Error(`[extract-itemrare] S1③ if-else 守卫 2421/2422 锚漂移:${JSON.stringify(ie)}（expected if rare=1/else rare=3）`);
  }
  RARE[2421] = 1;
  RARE[2422] = 3;
  // ★T4 ①:单件/if-else 守卫的 value 面（亲读锚:2320 sellPrice(0,1,50)=75000 :23105;
  //   2421 sellPrice(0,3,12)=156000 :23089;2422 sellPrice(0,10)=500000 :23096）
  const sv = findTypeGuardBlock(2320);
  if (!sv || sv.value === null || evalPrice(sv.value) !== 75000) {
    throw new Error(`[extract-itemrare] S1③value 单件守卫 2320 value 面漂移:${JSON.stringify(sv)}（expected sellPrice(0,1,50)=75000）`);
  }
  VALUE[2320] = 75000; // 死标签污染修正:鱼链运行基值 2500 经死标签写入现库,真值=守卫面
  if (ie.value === null || ie.elseValue === null || evalPrice(ie.value) !== 156000 || evalPrice(ie.elseValue) !== 500000) {
    throw new Error(`[extract-itemrare] S1③value if-else 守卫 2421/2422 value 面漂移:${JSON.stringify(ie)}（expected if=sellPrice(0,3,12)=156000/else=sellPrice(0,10)=500000）`);
  }
  VALUE[2421] = 156000;
  VALUE[2422] = 500000;
  // ★T4 ①续:范围守卫 value 面（sweep≡钉表;per-type 覆写机械解析,漂移 throw 逼定谳）
  const S1_GUARD_VALUE_PINS = [
    // 10 注册族全列（含两族无 value 行=缺省 0,缺行也钉——新增 value 行即 throw）
    { lo: 1522, hi: 1527, base: null, over: {}, at: ':18537' },
    { lo: 1533, hi: 1537, base: null, over: {}, at: ':18559' }, // =S1⑥ 递归目标面(value 缺键前提)
    { lo: 1977, hi: 1986, base: 50000, over: { 1980: 100000, 1984: 75000, 1985: 150000 }, at: ':21236' }, // buyPrice(0,5)+三覆写
    { lo: 2104, hi: 2113, base: 37500, over: {}, at: ':21874' }, // sellPrice(0,0,75)——S1 头注「3750」系笔误勘误
    { lo: 2214, hi: 2217, base: 100000, over: {}, at: ':22375' }, // buyPrice(0,10)
    { lo: 2284, hi: 2287, base: 50000, over: {}, at: ':22988' }, // buyPrice(0,5)
    { lo: 3309, hi: 3314, base: 50000, over: {}, at: ':30258' }, // buyPrice(0,5)
    { lo: 3390, hi: 3452, base: 1000, over: {}, at: ':30986' },  // value=1000 字面量
    { lo: 3456, hi: 3459, base: 10000, over: {}, at: ':31021' }, // sellPrice(0,0,20)
    { lo: 3638, hi: 3642, base: 100, over: {}, at: ':32793' },   // buyPrice(0,0,1)
  ];
  for (const pin of S1_GUARD_VALUE_PINS) {
    const face = rangeGuardValueFace(pin.lo, pin.hi);
    if (!face) throw new Error(`[extract-itemrare] S1③value 守卫 ${pin.lo}-${pin.hi} 块未找到（源漂移）:${pin.at}`);
    const baseV = face.base === null ? null : evalPrice(face.base);
    if ((baseV ?? null) !== (pin.base ?? null)) {
      throw new Error(`[extract-itemrare] S1③value 守卫 ${pin.lo}-${pin.hi} base 漂移:parsed=${face.base}(=${baseV}) pin=${pin.base}——新面现形须先定谳`);
    }
    const parsedOver = {};
    for (const [idS, expr] of Object.entries(face.over)) {
      const v = evalPrice(expr);
      if (v === null) throw new Error(`[extract-itemrare] S1③value 守卫 ${pin.lo}-${pin.hi} 覆写不可解:${expr}`);
      parsedOver[+idS] = v;
    }
    const pinKeys = Object.keys(pin.over).map(Number).sort((a, b) => a - b);
    const parseKeys = Object.keys(parsedOver).map(Number).sort((a, b) => a - b);
    if (JSON.stringify(pinKeys) !== JSON.stringify(parseKeys) || pinKeys.some((k) => pin.over[k] !== parsedOver[k])) {
      throw new Error(`[extract-itemrare] S1③value 守卫 ${pin.lo}-${pin.hi} 覆写面漂移:parsed=${JSON.stringify(parsedOver)} pin=${JSON.stringify(pin.over)}——新覆写现形须先定谳`);
    }
    if (baseV !== null) for (let id = pin.lo; id <= pin.hi; id++) VALUE[id] = baseV;
    for (const [idS, v] of Object.entries(parsedOver)) VALUE[+idS] = v;
  }
})();

// ---- ★清偿刀 U1（2026-10-01,方法级【无 rare】value 守卫 35 面,T4 census 主面落刀）----
// 34 census 族 + census 外同形 else 面（1479-1480）;定谳/翻案/debt 全录文件头注 U1 节。
// 行源序:本段在 S1④⑤⑥ 之前（族内 10 id 由 S1⑤ 或块终值覆写=运行时覆写序 1:1）。
const U1_PINS = [
  // { lo, hi, base（铜币终值）, over:{id:终值}, at=1457 行号锚 }
  { lo: 1479, hi: 1480, base: 5000, over: {}, at: ':18317 else sellPrice(0,0,10)（父守卫 1479-1494@:18300）' },
  { lo: 1481, hi: 1494, base: 10000, over: {}, at: ':18313 buyPrice(0,1)' },
  { lo: 1500, hi: 1502, base: 5000, over: {}, at: ':18365 sellPrice(0,0,10)' },
  { lo: 1528, hi: 1532, base: 2500, over: {}, at: ':18556' },
  { lo: 1538, hi: 1540, base: 5000, over: {}, at: ':18577 sellPrice(0,0,10)' },
  { lo: 1541, hi: 1542, base: 5000, over: {}, at: ':18592 sellPrice(0,0,10)' },
  { lo: 1543, hi: 1545, base: 300000, over: {}, at: ':18605 sellPrice(0,6)' },
  { lo: 1709, hi: 1712, base: 200, over: {}, at: ':19282' },
  { lo: 1713, hi: 1718, base: 300, over: {}, at: ':19297' },
  { lo: 1719, hi: 1722, base: 2000, over: {}, at: ':19311' },
  { lo: 2055, hi: 2065, base: 3000, over: {}, at: ':21811' },
  { lo: 2066, hi: 2071, base: 2000, over: {}, at: ':21826' },
  { lo: 2072, hi: 2081, base: 300, over: {}, at: ':21841' },
  { lo: 2082, hi: 2091, base: 500, over: {}, at: ':21856' },
  { lo: 2092, hi: 2103, base: 1500, over: {}, at: ':21871' },
  { lo: 2114, hi: 2118, base: 2500, over: {}, at: ':21895 sellPrice(0,0,5)' },
  { lo: 2129, hi: 2134, base: 500, over: {}, at: ':21962' },
  { lo: 2135, hi: 2138, base: 300, over: {}, at: ':21976' },
  { lo: 2145, hi: 2148, base: 150, over: {}, at: ':22037' },
  { lo: 2149, hi: 2152, base: 1500, over: {}, at: ':22052' },
  { lo: 2153, hi: 2155, base: 300, over: {}, at: ':22067 sellPrice(0,0,0,60)' },
  { lo: 2254, hi: 2256, base: 300, over: {}, at: ':22736' },
  { lo: 2376, hi: 2385, base: 300, over: { 2379: 100000 }, at: ':23933 base+:23936 buyPrice(0,10)' },
  { lo: 2386, hi: 2396, base: 300, over: { 2389: 100000 }, at: ':23952 base+:23955 buyPrice(0,10)' },
  { lo: 2397, hi: 2416, base: 300, over: {}, at: ':23971' },
  { lo: 2442, hi: 2449, base: 25000, over: {}, at: ':24149 sellPrice(0,0,50)' },
  { lo: 2631, hi: 2633, base: 150, over: {}, at: ':25657' },
  { lo: 2634, hi: 2636, base: 300, over: {}, at: ':25672' },
  { lo: 2648, hi: 2651, base: 300, over: {}, at: ':25771 sellPrice(0,0,0,60)' },
  { lo: 2652, hi: 2657, base: 3000, over: {}, at: ':25787' },
  { lo: 2658, hi: 2663, base: 300, over: {}, at: ':25802' },
  { lo: 2664, hi: 2668, base: 1500, over: {}, at: ':25817' },
  { lo: 3651, hi: 3662, base: 300, over: {}, at: ':32846' },
  { lo: 3739, hi: 3741, base: 50, over: {}, at: ':33116 buyPrice(0,0,0,50)' },
  { lo: 3915, hi: 3916, base: 300, over: {}, at: ':34611' },
];
// case 体嵌套域清单（非方法级,本刀不写值=债;唯一已知=4695-4697 翻案面,头注 U1 节）
const U1_NESTED_INV = ['4695-4697'];
// live 无 rare 带面单件守卫清单（值面由 S1②over/S1③over/本刀 over 各自承载,此处只锁键集）
const U1_SINGLE_INV = ['1980', '1984', '1985', '2194', '2196', '2379', '2389'];

(() => {
  /** 平衡括号块跨度:块头行 gi（brace 同行或次行）→ 收口行 idx（含）;未收口=-1 */
  function spanOf(gi, to) {
    const inline = /\{\s*$/.test(LINES[gi]);
    let d = 0;
    let started = false;
    for (let j = gi; j <= to; j++) {
      const raw = LINES[j];
      if (j === gi && inline) { d += (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length; started = d > 0; continue; }
      if (!started && raw.trim() === '{') { d = 1; started = true; continue; }
      if (!started) continue;
      d += (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
      if (d === 0) return j;
    }
    return -1;
  }
  /** 块 [gi+1,end) 顶层（bd===depth+1）采集 { base, over, ifElse, rareSeen };嵌套 if 块整体跳过 */
  function faceOf(gi, end, depth) {
    let base = null;
    const over = {};
    const ifElse = [];
    let rareSeen = false;
    for (let j = gi + 1; j < end; j++) {
      const t = LINES[j].trim();
      if (LINES[j].match(/^\t*/)[0].length !== depth + 1) continue;
      const vm = t.match(/^value = ([^;]+);\s*$/);
      if (vm) base = vm[1]; // 后写胜（C# 赋值序）
      if (/^rare = /.test(t) || /^SetShopValues\(/.test(t)) rareSeen = true;
      const nm = t.match(/^if \(type == (\d+)\)\s*\{?\s*$/);
      const rm = t.match(/^if \(type >= (\d+) && type <= (\d+)\)\s*\{?\s*$/);
      if (!nm && !rm) continue;
      const end2 = spanOf(j, end);
      if (end2 < 0) throw new Error(`[extract-itemrare] U1 嵌套块未收口(:${j + 1})`);
      const sub = faceOf(j, end2, depth + 1);
      if (sub.rareSeen) rareSeen = true;
      let skipTo = end2;
      if (nm) {
        over[+nm[1]] = sub.base;
      } else {
        // 嵌套范围 if 的 else 支（else 独立行+次行 {;else if 链未建模）
        const nxt = (LINES[end2 + 1] ?? '').trim();
        if (nxt === 'else') {
          if ((LINES[end2 + 2] ?? '').trim() !== '{') {
            throw new Error(`[extract-itemrare] U1 else 支形态漂移(:${end2 + 3}):${(LINES[end2 + 2] ?? '').trim()}——else if 未建模`);
          }
          const elseEnd = spanOf(end2 + 2, end);
          if (elseEnd < 0) throw new Error(`[extract-itemrare] U1 else 块未收口(:${end2 + 3})`);
          const sub2 = faceOf(end2 + 2, elseEnd, depth + 1);
          if (sub2.rareSeen) rareSeen = true;
          ifElse.push({ lo: +rm[1], hi: +rm[2], ifVal: sub.base, elseVal: sub2.base });
          skipTo = elseEnd;
        } else if (/^else/.test(nxt)) {
          throw new Error(`[extract-itemrare] U1 else if 链未建模(:${end2 + 2}):${nxt}`);
        } else {
          ifElse.push({ lo: +rm[1], hi: +rm[2], ifVal: sub.base, elseVal: null });
        }
      }
      j = skipTo;
    }
    return { base, over, ifElse, rareSeen };
  }
  const evalP = (expr, at) => {
    const v = evalPrice(expr);
    if (v === null) throw new Error(`[extract-itemrare] U1 ${at} value 不可解:${expr}`);
    return v;
  };
  const caseHitOf = (lo, hi, from, gi) => {
    let n = 0;
    for (let k = from; k < gi; k++) {
      const cm = LINES[k].match(/^\t*case (\d+):\s*$/);
      if (cm && +cm[1] >= lo && +cm[1] <= hi) n++;
    }
    return n;
  };
  // pass1:各 region 全部 range 守卫位置+跨度（前向遮蔽核用;同 region 内才构成遮蔽）
  const spans = [];
  REGIONS.slice(0, 5).forEach(([from, to], ri) => {
    for (let i = from; i <= to; i++) {
      const gm = LINES[i].match(/^(\t*)if \(type >= (\d+) && type <= (\d+)\)\s*\{?\s*$/);
      if (gm) spans.push({ ri, lo: +gm[2], hi: +gm[3], gi: i, end: spanOf(i, to) });
    }
  });
  // pass2:守卫分类采集（range=本刀面;singles=键集清单;形态缝=拒）
  const faces = new Map(); // 'lo-hi' → { base:number|null, over:{id:number}, srcs:string[] }
  const mergeFace = (lo, hi, baseV, overV, src) => {
    const key = `${lo}-${hi}`;
    let f = faces.get(key);
    if (!f) { f = { base: null, over: {}, srcs: [] }; faces.set(key, f); }
    if (baseV !== null) {
      if (f.base !== null && f.base !== baseV) {
        throw new Error(`[extract-itemrare] U1 守卫面多源漂移 ${key}:${f.srcs.join('/')}=${f.base} vs ${src}=${baseV}`);
      }
      f.base = baseV;
    }
    for (const [id, v] of Object.entries(overV)) {
      if (f.over[id] !== undefined && f.over[id] !== v) {
        throw new Error(`[extract-itemrare] U1 守卫覆写多源漂移 ${key}#${id}:${f.over[id]} vs ${v}（${src}）`);
      }
      f.over[id] = v;
    }
    f.srcs.push(src);
  };
  const deadMethod = [];
  const nestedInv = [];
  const oddForms = [];
  const singlesGate = new Set();
  REGIONS.slice(0, 5).forEach(([from, to], ri) => {
    for (let i = from; i <= to; i++) {
      const gm = LINES[i].match(/^(\t*)if \(type >= (\d+) && type <= (\d+)\)\s*\{?\s*$/);
      const sm = gm ? null : LINES[i].match(/^(\t*)if \(type == (\d+)\)\s*\{?\s*$/);
      if (!gm && !sm) {
        // 形态缝:条件子串在而守卫形态不在=单行体/复合条件等未建模形态（已知例外两处:
        //   :25554 placeStyle 双支/:27415 bait 多或,块内均无 value/rare 面）
        if (/if \(type >= \d+ && type <= \d+\)/.test(LINES[i]) || /if \(type == \d+\)/.test(LINES[i])) {
          oddForms.push(`${i + 1}:${LINES[i].trim()}`);
        }
        continue;
      }
      if (sm) {
        // 单件守卫:live∧无 rare∧带面 → 键集清单（值由 S1②over/S1③over/U1 over 承载）
        const end = spanOf(i, to);
        if (end < 0) throw new Error(`[extract-itemrare] U1 单件守卫块未收口(:${i + 1})`);
        const face = faceOf(i, end, sm[1].length);
        if (caseHitOf(+sm[2], +sm[2], from, i) === 0 && !face.rareSeen && face.base !== null) {
          singlesGate.add(String(sm[2]));
        }
        continue;
      }
      const lo = +gm[2];
      const hi = +gm[3];
      const depth = gm[1].length;
      const end = spanOf(i, to);
      if (end < 0) throw new Error(`[extract-itemrare] U1 守卫块未收口(:${i + 1})`);
      const face = faceOf(i, end, depth);
      const caseHit = caseHitOf(lo, hi, from, i);
      const hasFace = face.base !== null || Object.keys(face.over).length > 0 || face.ifElse.length > 0;
      const at = `:${i + 1}`;
      if (caseHit > 0) {
        // 方法级链死码（d2）/case 体嵌套域（d>2,债:4695-4697 翻案面）——只收录不写值
        if (hasFace && !face.rareSeen) (depth === 2 ? deadMethod : nestedInv).push(`${lo}-${hi}@${at}`);
        continue;
      }
      if (face.rareSeen) continue; // S1③/S1④ 有 rare 守卫域,自有 sweep≡pins 守卫
      // 前向遮蔽核:更早 range 守卫与本族相交且本守卫不在其块内=遮蔽（须定谳）
      for (const s of spans) {
        if (s.ri > ri) break;
        if (s.ri === ri && s.gi < i && s.lo <= hi && s.hi >= lo && !(i < s.end)) {
          throw new Error(`[extract-itemrare] U1 前向遮蔽:守卫 ${lo}-${hi}@${at} 被 ${s.lo}-${s.hi}@:${s.gi + 1} 遮蔽——须定谳`);
        }
      }
      // ifElse 面:if 支=[嵌套域];else 支=父域−if 域（双侧开口未建模）
      for (const e of face.ifElse) {
        if (e.ifVal !== null) mergeFace(e.lo, e.hi, evalP(e.ifVal, `${at}→if`), {}, `${at}if`);
        if (e.elseVal === null) continue;
        const loPart = e.lo > lo;
        const hiPart = e.hi < hi;
        if (loPart && hiPart) throw new Error(`[extract-itemrare] U1 else 覆盖双侧开口未建模:${lo}-${hi}−[${e.lo},${e.hi}]@${at}`);
        if (loPart) mergeFace(lo, e.lo - 1, evalP(e.elseVal, `${at}→else`), {}, `${at}else`);
        if (hiPart) mergeFace(e.hi + 1, hi, evalP(e.elseVal, `${at}→else`), {}, `${at}else`);
      }
      if (face.base !== null) mergeFace(lo, hi, evalP(face.base, at), {}, at);
      for (const [id, expr] of Object.entries(face.over)) {
        if (expr === null) throw new Error(`[extract-itemrare] U1 覆写块无 value 行:${lo}-${hi}#${id}@${at}（形态外,须定谳）`);
        mergeFace(lo, hi, null, { [+id]: evalP(expr, `${at}#${id}`) }, `${at}#${id}`);
      }
    }
  });
  // 门①:方法级死码 range 守卫带面（今天=空;新现形须定谳）
  if (deadMethod.length) throw new Error(`[extract-itemrare] U1 方法级死码 range 守卫带面:${deadMethod.join(' ')}`);
  // 门②:case 体嵌套域清单（今天=4695-4697 唯一;漂移即爆红逼定谳）
  const nestedKeys = [...new Set(nestedInv.map((s) => s.split('@')[0]))].sort();
  if (JSON.stringify(nestedKeys) !== JSON.stringify(U1_NESTED_INV)) {
    throw new Error(`[extract-itemrare] U1 case 体嵌套 value 守卫清单漂移:${nestedInv.join(' ')}（expected ${U1_NESTED_INV.join(',')}——T4 4695-4697 翻案面,新现形须定谳）`);
  }
  // 门③:未建模 if(type) 形态缝
  if (oddForms.length) throw new Error(`[extract-itemrare] U1 未建模 if(type) 形态:${oddForms.join(' | ')}`);
  // 门④:live 无 rare 带面单件守卫键集
  const singlesGot = [...singlesGate].sort();
  if (JSON.stringify(singlesGot) !== JSON.stringify(U1_SINGLE_INV)) {
    throw new Error(`[extract-itemrare] U1 单件守卫清单漂移:${singlesGot.join(',')}（expected ${U1_SINGLE_INV.join(',')}）`);
  }
  // 门⑤:sweep 面 ≡ 钉表（键+base 值+覆写键值;新守卫面现形须先定谳）
  const faceKeys = [...faces.keys()].sort();
  const pinKeys = U1_PINS.map((p) => `${p.lo}-${p.hi}`).sort();
  if (JSON.stringify(faceKeys) !== JSON.stringify(pinKeys)) {
    throw new Error(`[extract-itemrare] U1 sweep 面≠钉表(键):faces=[${faceKeys.join(' ')}] pins=[${pinKeys.join(' ')}]——新守卫面现形须先定谳`);
  }
  for (const pin of U1_PINS) {
    const f = faces.get(`${pin.lo}-${pin.hi}`);
    if ((f.base ?? null) !== (pin.base ?? null)) {
      throw new Error(`[extract-itemrare] U1 守卫 ${pin.lo}-${pin.hi} base 漂移:parsed=${f.base} pin=${pin.base}(${pin.at})——新面现形须先定谳`);
    }
    const pOverKeys = Object.keys(pin.over).map(Number).sort((a, b) => a - b);
    const fOverKeys = Object.keys(f.over).map(Number).sort((a, b) => a - b);
    if (JSON.stringify(pOverKeys) !== JSON.stringify(fOverKeys) || pOverKeys.some((k) => f.over[k] !== pin.over[k])) {
      throw new Error(`[extract-itemrare] U1 守卫 ${pin.lo}-${pin.hi} 覆写面漂移:parsed=${JSON.stringify(f.over)} pin=${JSON.stringify(pin.over)}(${pin.at})——新覆写现形须先定谳`);
    }
  }
  // 落刀（行源序:S1④⑤⑥ 在后,S1⑤ 或块对 10 id 终值覆写 100000）
  for (const pin of U1_PINS) {
    if (pin.base !== null) for (let id = pin.lo; id <= pin.hi; id++) VALUE[id] = pin.base;
    for (const [id, v] of Object.entries(pin.over)) VALUE[+id] = v;
  }
})();

// ---- ★清偿刀 V1(2026-10-01):case 体嵌套 per-type if 值域全域 sweep + 落刀 ----
// 语义走栈机械核(三版对拍脚本 tools/_v1-nested-value-sweep.mjs 同构;头注见文件顶 V1 节)。
// 面键 = region|runKey|tagChain(tagChain=type-if 条件链,→if/→else 分支标记);own 三态:
//   v1=本刀落值 / ch=既有通道已落且先于本刀(值做对拍,漂移 throw) / ch-post=S1④ 后置落值(只锁形态)。
const V1_NESTED_PINS = [
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2214&&type<=2217→if', ids: [2214, 2215, 2216, 2217], own: 'ch', at: ':22381' },
  { key: 'SetDefaults3|2242-2243(2)|type<2192||type>2198→if/type==2242→if', ids: [2242], own: 'v1', value: 2000, at: ':22647' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2254&&type<=2256→if', ids: [2254, 2255, 2256], own: 'ch', at: ':22736' },
  { key: 'SetDefaults3|2257-2258(2)|type<2192||type>2198→if/type==2258→if', ids: [2258], own: 'v1', value: 5000, at: ':22756' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2284&&type<=2287→if', ids: [2284, 2285, 2286, 2287], own: 'ch', at: ':22992' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2421&&type<=2422→if/type==2421→if', ids: [2421], own: 'ch', at: ':23089' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2421&&type<=2422→if/type==2421→else', ids: [2422], own: 'ch', at: ':23096' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type==2320→if', ids: [2320], own: 'ch', at: ':23105' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2308→if', ids: [2308], own: 'ch-post', at: ':23170' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2312→if', ids: [2312], own: 'ch-post', at: ':23175' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2317→if', ids: [2317], own: 'ch-post', at: ':23180' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2310→if', ids: [2310], own: 'ch-post', at: ':23185' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2321→if', ids: [2321], own: 'ch-post', at: ':23190' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2315→if', ids: [2315], own: 'ch-post', at: ':23195' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2303→if', ids: [2303], own: 'ch-post', at: ':23200' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2304→if', ids: [2304], own: 'ch-post', at: ':23205' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2316→if', ids: [2316], own: 'ch-post', at: ':23210' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2311→if', ids: [2311], own: 'ch-post', at: ':23214' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2313→if', ids: [2313], own: 'ch-post', at: ':23219' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2306→if', ids: [2306], own: 'ch-post', at: ':23224' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2307→if', ids: [2307], own: 'ch-post', at: ':23229' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2319→if', ids: [2319], own: 'ch-post', at: ':23234' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2318→if', ids: [2318], own: 'ch-post', at: ':23239' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2298→if', ids: [2298], own: 'ch-post', at: ':23244' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2309→if', ids: [2309], own: 'ch-post', at: ':23248' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2300→if', ids: [2300], own: 'ch-post', at: ':23253' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2301→if', ids: [2301], own: 'ch-post', at: ':23257' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2302→if', ids: [2302], own: 'ch-post', at: ':23261' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2299→if', ids: [2299], own: 'ch-post', at: ':23265' },
  { key: 'SetDefaults3|2290-2321(31)|type<2192||type>2198→if/type==2305→if', ids: [2305], own: 'ch-post', at: ':23269' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2376&&type<=2385→if', ids: [2376, 2377, 2378, 2379, 2380, 2381, 2382, 2383, 2384, 2385], own: 'ch', at: ':23933' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2376&&type<=2385→if/type==2379→if', ids: [2379], own: 'ch', at: ':23936' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2386&&type<=2396→if', ids: [2386, 2387, 2388, 2389, 2390, 2391, 2392, 2393, 2394, 2395, 2396], own: 'ch', at: ':23952' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2386&&type<=2396→if/type==2389→if', ids: [2389], own: 'ch', at: ':23955' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2397&&type<=2416→if', ids: [2397, 2398, 2399, 2400, 2401, 2402, 2403, 2404, 2405, 2406, 2407, 2408, 2409, 2410, 2411, 2412, 2413, 2414, 2415, 2416], own: 'ch', at: ':23971' },
  { key: 'SetDefaults3|2432-2434(3)|type<2192||type>2198→if/type==2434→if', ids: [2434], own: 'v1', value: 50, at: ':24091' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2442&&type<=2449→if', ids: [2442, 2443, 2444, 2445, 2446, 2447, 2448, 2449], own: 'ch', at: ':24149' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2631&&type<=2633→if', ids: [2631, 2632, 2633], own: 'ch', at: ':25657' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2634&&type<=2636→if', ids: [2634, 2635, 2636], own: 'ch', at: ':25672' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2648&&type<=2651→if', ids: [2648, 2649, 2650, 2651], own: 'ch', at: ':25771' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2652&&type<=2657→if', ids: [2652, 2653, 2654, 2655, 2656, 2657], own: 'ch', at: ':25787' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2658&&type<=2663→if', ids: [2658, 2659, 2660, 2661, 2662, 2663], own: 'ch', at: ':25802' },
  { key: 'SetDefaults3|default|type<2192||type>2198→if/type>=2664&&type<=2668→if', ids: [2664, 2665, 2666, 2667, 2668], own: 'ch', at: ':25817' },
  { key: 'SetDefaults3|2827-2855(29)|type<2192||type>2198→if/type==2843→if', ids: [2843], own: 'v1', value: 100000, at: ':27103' },
  { key: 'SetDefaults5|4695-4700(6)|type>=4695&&type<=4697→if', ids: [4695, 4696, 4697], own: 'v1', value: 1000, at: ':38634' },
  { key: 'SetDefaults5|4695-4700(6)|type>=4695&&type<=4697→else', ids: [4698, 4699, 4700], own: 'v1', value: 40000, at: ':38638' },
  { key: 'SetDefaults5|5218-5233(16)|type==5231→if', ids: [5231], own: 'v1', value: 10000, at: ':41641' },
  { key: 'SetDefaults5|5218-5233(16)|type==5228→if', ids: [5228], own: 'v1', value: 100000, at: ':41645' },
  { key: 'SetDefaults5|5218-5233(16)|type==5222→if', ids: [5222], own: 'v1', value: 100000, at: ':41649' },
  { key: 'SetDefaults5|5234-5245(12)|type==5243→if', ids: [5243], own: 'v1', value: 30000, at: ':41677' },
  { key: 'SetDefaults5|5234-5245(12)|type==5245→if', ids: [5245], own: 'v1', value: 10000, at: ':41681' },
  { key: 'SetDefaults5|5234-5245(12)|type==5235→if', ids: [5235], own: 'v1', value: 25000, at: ':41685' },
  { key: 'SetDefaults5|5248-5257(10)|type==5251→if', ids: [5251], own: 'v1', value: 10000, at: ':41737' },
  { key: 'SetDefaults5|5248-5257(10)|type==5253→if', ids: [5253], own: 'v1', value: 10000, at: ':41741' },
  { key: 'SetDefaults5|5248-5257(10)|type==5257→if', ids: [5257], own: 'v1', value: 10000, at: ':41745' },
  { key: 'SetDefaults5|5248-5257(10)|type==5252→if', ids: [5252], own: 'v1', value: 25000, at: ':41749' },
  { key: 'SetDefaults5|5248-5257(10)|type==5256→if', ids: [5256], own: 'v1', value: 25000, at: ':41753' },
  { key: 'SetDefaults5|5258-5273(16)|type==5266→if', ids: [5266], own: 'v1', value: 100000, at: ':41785' },
  { key: 'SetDefaults5|5258-5273(16)|type==5259→if', ids: [5259], own: 'v1', value: 25000, at: ':41789' },
  { key: 'SetDefaults5|5258-5273(16)|type==5265→if', ids: [5265], own: 'v1', value: 25000, at: ':41793' },
  { key: 'SetDefaults5|5258-5273(16)|type==5264→if', ids: [5264], own: 'v1', value: 25000, at: ':41797' },
  { key: 'SetDefaults5|5258-5273(16)|type==5263→if', ids: [5263], own: 'v1', value: 25000, at: ':41801' },
];
(() => {
  /** 平衡块跨度({ 同行或次行;V1 局部版) */
  function spanV1(gi, to) {
    const inline = /\{\s*$/.test(LINES[gi]);
    let d = 0;
    let started = false;
    for (let j = gi; j <= to; j++) {
      const raw = LINES[j];
      if (j === gi && inline) { d += (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length; started = started || d > 0; if (started && d === 0) return j; continue; }
      if (!started) { if (raw.trim() === '{') { d = 1; started = true; } continue; }
      d += (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
      if (d === 0) return j;
    }
    return -1;
  }
  /** switch(type) runs 解析(连排标签合并;default 单列;★本反编译器 switch 头/`{`/标签同深度,
   *  体语句=+1;run 终止=体语句层(bal==0)的 break/return/goto——嵌套 switch 的 break 不算) */
  function runsV1(head, swEnd, labelDepth) {
    const inline = /\{\s*$/.test(LINES[head]);
    const bodyStart = inline ? head + 1 : head + 2;
    if (!inline && (LINES[bodyStart - 1] ?? '').trim() !== '{') throw new Error(`[extract-itemrare] V1 switch 块头无体 :${head + 1}`);
    const runs = [];
    let cur = null;
    for (let j = bodyStart; j < swEnd; j++) {
      const tj = LINES[j].trim();
      const dj = (LINES[j].match(/^\t*/) ?? [''])[0].length;
      if (dj !== labelDepth) continue;
      const cm = tj.match(/^case (\d+):\s*$/);
      const isDef = /^default:\s*$/.test(tj);
      if (!cm && !isDef) continue;
      const lab = cm ? +cm[1] : 'default';
      if (cur !== null && j === cur.start && cur.labels !== 'default' && lab !== 'default') { cur.labels.push(lab); cur.start = j + 1; }
      else { if (cur) runs.push(cur); cur = { labels: lab === 'default' ? 'default' : [lab], start: j + 1 }; }
    }
    if (cur) runs.push(cur);
    return runs.map((r, k) => {
      const nextStart = k + 1 < runs.length ? runs[k + 1].start - 1 : swEnd;
      let end = nextStart;
      let bal = 0;
      for (let q = r.start; q <= nextStart; q++) {
        const raw = LINES[q];
        const tq = raw.trim();
        const dq = (raw.match(/^\t*/) ?? [''])[0].length;
        if (bal === 0 && dq === labelDepth + 1 && /^(break;|return\b|goto\b)/.test(tq)) { end = q; break; }
        bal += (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
        if (bal < 0) bal = 0;
      }
      return { ...r, end };
    });
  }
  function mergeGotoV1(map, tg, ids) {
    if (!map.has(tg)) map.set(tg, new Set());
    for (const id of ids) map.get(tg).add(id);
  }
  /** 语义走栈:返回 { dead, gotoOut };out 累加写入 {id, expr, at, path, faceTag}。
   *  path=!inCase?'method':scope==='none'?'top':scope==='type'?'nested':'variant'(头注 V1 节)。 */
  function walkV1(from, to, depth, liveIn, runLabels, inCase, scope, out, ctx, faceTag) {
    const path = !inCase ? 'method' : scope === 'none' ? 'top' : scope === 'type' ? 'nested' : 'variant';
    const live = new Set(liveIn);
    const dead = new Set();
    const gotoOut = new Map();
    let i = from;
    while (i <= to) {
      if (live.size === 0) break;
      const raw = LINES[i];
      const t = raw.trim();
      if (t === '' || t.startsWith('//') || t.startsWith('#')) { i++; continue; }
      const bd = (raw.match(/^\t*/) ?? [''])[0].length;
      if (bd < depth) break;
      if (bd > depth) { i++; continue; }
      let m;
      if ((m = t.match(/^goto case (\d+);\s*$/)) || (m = t.match(/^goto default;\s*$/))) {
        const target = m[1] !== undefined ? +m[1] : 'default';
        if (!gotoOut.has(target)) gotoOut.set(target, new Set());
        for (const id of live) { gotoOut.get(target).add(id); dead.add(id); }
        live.clear(); break;
      }
      if (/^return\b/.test(t)) { for (const id of live) dead.add(id); live.clear(); break; }
      if (/^break;/.test(t)) { live.clear(); break; }
      if (/^(case \d+:|default:)\s*$/.test(t)) { i++; continue; }
      if ((m = t.match(/^(value|rare) = ([^;]+);$/))) {
        if (m[1] === 'value') for (const id of live) out.push({ id, expr: m[2], at: i + 1, path, runLabels, faceTag: faceTag ?? '' });
        i++; continue;
      }
      if (/^SetShopValues\(|^DefaultTo\w+\(/.test(t)) { i++; continue; }
      if (/^switch\s*\(type\)\s*\{?\s*$/.test(t)) {
        const inline = /\{\s*$/.test(LINES[i]);
        const swEnd = inline ? spanV1(i, to) : spanV1(i + 1, to);
        if (swEnd < 0) throw new Error(`[extract-itemrare] V1 switch 未收口 :${i + 1} (${ctx.region})`);
        const runs = runsV1(i, swEnd, depth);
        const explicitIds = new Set();
        for (const r of runs) if (r.labels !== 'default') for (const x of r.labels) explicitIds.add(x);
        for (const r of runs) {
          if (r.labels === 'default') continue;
          const bodyIds = new Set([...live].filter((id) => r.labels.includes(id)));
          if (!bodyIds.size) continue;
          const sub = walkV1(r.start, r.end, depth + 1, bodyIds, r.labels, true, 'none', out, ctx, faceTag);
          for (const id of bodyIds) if (sub.dead.has(id)) { live.delete(id); dead.add(id); }
          if (sub.gotoOut.size) dispatchV1(sub, runs, depth + 1, r, out, ctx, live, faceTag);
        }
        const defRun = runs.find((r) => r.labels === 'default');
        if (defRun) {
          const defIds = new Set([...live].filter((id) => !explicitIds.has(id)));
          if (defIds.size) {
            const sub = walkV1(defRun.start, defRun.end, depth + 1, defIds, 'default', true, 'none', out, ctx, faceTag);
            for (const id of defIds) if (sub.dead.has(id)) { live.delete(id); dead.add(id); }
            if (sub.gotoOut.size) dispatchV1(sub, runs, depth + 1, defRun, out, ctx, live, faceTag);
          }
        }
        i = swEnd + 1;
        continue;
      }
      if ((m = t.match(/^if\s*\((.*)\)\s*\{?\s*$/))) {
        const cond = m[1].trim();
        const inlineBr = /\{\s*$/.test(LINES[i]);
        let ifEnd;
        if (inlineBr) ifEnd = spanV1(i, to);
        else {
          if ((LINES[i + 1] ?? '').trim() !== '{') throw new Error(`[extract-itemrare] V1 if 单行体未建模 :${i + 1} (${ctx.region}):${t}`);
          ifEnd = spanV1(i + 1, to);
        }
        if (ifEnd < 0) throw new Error(`[extract-itemrare] V1 if 块未收口 :${i + 1} (${ctx.region})`);
        let elseEnd = -1;
        let chainElseIf = false;
        if (ifEnd + 1 <= to) {
          const nxt = (LINES[ifEnd + 1] ?? '').trim();
          if (nxt === 'else') {
            const es = ifEnd + 2;
            if (/\{\s*$/.test(LINES[es]) || (LINES[es] ?? '').trim() === '{') elseEnd = spanV1(es, to);
            else { chainElseIf = true; ctx.unmodeled.push(`${ctx.region}:${es + 1} else-if/单行 else`); }
          } else if (/^else/.test(nxt)) chainElseIf = true;
        }
        const brScope = scope === 'nontype' ? 'nontype' : 'type';
        const cSingle = cond.match(/^type == (-?\d+)$/);
        const cRange = cond.match(/^type >= (\d+) && type <= (\d+)$/);
        const cCompl = cond.match(/^type < (\d+) \|\| type > (\d+)$/);
        if (cSingle || cRange || cCompl) {
          let lo; let hi; let invert = false;
          if (cSingle) { lo = hi = +cSingle[1]; } else if (cRange) { lo = +cRange[1]; hi = +cRange[2]; } else { lo = +cCompl[1]; hi = +cCompl[2]; invert = true; }
          const inIf = new Set([...live].filter((id) => (id >= lo && id <= hi) !== invert));
          const outIf = new Set([...live].filter((id) => (id >= lo && id <= hi) === invert));
          const tagIf = (faceTag ? faceTag + '/' : '') + cond.replace(/\s+/g, '') + '→if';
          const subIf = walkV1(inlineBr ? i + 1 : i + 2, ifEnd, depth + 1, inIf, runLabels, inCase, brScope, out, ctx, tagIf);
          let subElse = { dead: new Set(), gotoOut: new Map() };
          if (!chainElseIf && elseEnd >= 0) subElse = walkV1(ifEnd + 3, elseEnd, depth + 1, outIf, runLabels, inCase, brScope, out, ctx, (faceTag ? faceTag + '/' : '') + cond.replace(/\s+/g, '') + '→else');
          for (const id of subIf.dead) { live.delete(id); dead.add(id); }
          for (const id of subElse.dead) { live.delete(id); dead.add(id); }
          for (const [tg, ids] of subIf.gotoOut) mergeGotoV1(gotoOut, tg, ids);
          for (const [tg, ids] of subElse.gotoOut) mergeGotoV1(gotoOut, tg, ids);
          if (chainElseIf && outIf.size) ctx.unmodeled.push(`${ctx.region}:${i + 1} else-if 链:${cond}`);
          i = (elseEnd >= 0 ? elseEnd : ifEnd) + 1;
          continue;
        }
        // 非 type 条件:scope=nontype(变体域 R2⑥;其内 type-if 不收);有 value 写入=形态外登记
        const probeStart = out.length;
        const subA = walkV1(inlineBr ? i + 1 : i + 2, ifEnd, depth + 1, live, runLabels, inCase, 'nontype', out, ctx, faceTag);
        let subB = { dead: new Set(), gotoOut: new Map() };
        if (!chainElseIf && elseEnd >= 0) subB = walkV1(ifEnd + 3, elseEnd, depth + 1, live, runLabels, inCase, 'nontype', out, ctx, faceTag);
        for (const id of subA.dead) { live.delete(id); dead.add(id); }
        for (const id of subB.dead) { live.delete(id); dead.add(id); }
        for (const [tg, ids] of subA.gotoOut) mergeGotoV1(gotoOut, tg, ids);
        for (const [tg, ids] of subB.gotoOut) mergeGotoV1(gotoOut, tg, ids);
        if (!/Variant/.test(cond) && out.length > probeStart) ctx.unmodeled.push(`${ctx.region}:${i + 1} 非type条件 if(${cond}) 带写入`);
        i = (elseEnd >= 0 ? elseEnd : ifEnd) + 1;
        continue;
      }
      if (/;\s*$/.test(t) && !/[{}]/.test(t)) { i++; continue; }
      if (t === '{') { const e2 = spanV1(i, to); if (e2 < 0) throw new Error(`[extract-itemrare] V1 裸块未收口 :${i + 1}`); walkV1(i + 1, e2, depth + 1, live, runLabels, inCase, scope, out, ctx, faceTag); i = e2 + 1; continue; }
      if (t === '}') { i++; continue; }
      ctx.unmodeled.push(`${ctx.region}:${i + 1} 语句形态外:${t.slice(0, 60)}`);
      i++;
    }
    return { dead, gotoOut };
  }
  /** goto case 重派发(目标=本 switch 的 run;写序在 goto 体之后;灭集上传给调用方 sub) */
  function dispatchV1(sub, runs, bodyDepth, fromRun, out, ctx, live, faceTag) {
    for (const [tg, ids] of sub.gotoOut) {
      const target = runs.find((r) => r.labels !== 'default' && r.labels.includes(tg));
      if (!target || target === fromRun) throw new Error(`[extract-itemrare] V1 goto case ${tg} 目标未找到/自指 (${ctx.region})`);
      const bodyIds = new Set([...ids].filter((id) => live.has(id) || sub.dead.has(id)));
      if (!bodyIds.size) continue;
      const sub2 = walkV1(target.start, target.end, bodyDepth, bodyIds, target.labels, true, 'none', out, ctx, undefined);
      for (const id of bodyIds) if (sub2.dead.has(id)) { live.delete(id); sub.dead.add(id); }
      if (sub2.gotoOut.size) throw new Error(`[extract-itemrare] V1 goto 链未建模 (${ctx.region} case ${tg})`);
    }
  }
  // sweep:SetDefaults1..5+SetFoodDefaults 全域(nested 面=本刀域;method/top 只演步不收)
  const V1_SEED_MAX = 6200; // ItemID.Count=6196 上界余量
  const v1Faces = new Map(); // key → { key, ids:[], val, expr, at }
  const v1Unmodeled = [];
  const v1FinalNested = new Map(); // id → 终值嵌套写(行序=执行序,末写胜;base+override 叠加时以 override 为终)
  for (const name of ['SetDefaults1', 'SetDefaults2', 'SetDefaults3', 'SetDefaults4', 'SetDefaults5', 'SetFoodDefaults']) {
    const [fFrom, fTo] = methodRange(name);
    const ctx = { region: name, unmodeled: v1Unmodeled };
    const out = [];
    const all = new Set();
    for (let id = 1; id <= V1_SEED_MAX; id++) all.add(id);
    walkV1(fFrom + 2, fTo, 2, all, null, false, 'none', out, ctx, undefined);
    // nested 写入按 (runKey, faceTag) 聚合成 face(值必须单值;ids 按首写序)
    const regWrites = out.filter((w) => w.path === 'nested');
    regWrites.sort((a, b) => a.at - b.at);
    for (const w of regWrites) {
      const runKey = w.runLabels === 'default' ? 'default' : `${Math.min(...w.runLabels)}-${Math.max(...w.runLabels)}(${w.runLabels.length})`;
      const key = `${name}|${runKey}|${w.faceTag}`;
      let f = v1Faces.get(key);
      if (!f) { f = { key, ids: [], val: null, expr: w.expr, at: w.at }; v1Faces.set(key, f); }
      if (!f.ids.includes(w.id)) f.ids.push(w.id);
      const v = evalPrice(w.expr);
      if (v === null) throw new Error(`[extract-itemrare] V1 face 值不可解:${key} expr=${w.expr}`);
      if (f.val !== null && f.val !== v) throw new Error(`[extract-itemrare] V1 face 多值漂移:${key}:${f.val} vs ${v}(${w.expr})——形态漂移须定谳`);
      f.val = v;
      v1FinalNested.set(w.id, v); // regWrites 已按行序(=执行序)排序,末写胜
    }
  }
  // 门①:形态外语句(今天=空;现形须定谳)
  if (v1Unmodeled.length) throw new Error(`[extract-itemrare] V1 未建模形态:\n  ${v1Unmodeled.join('\n  ')}`);
  // 门②:sweep faces ≡ 钉表(键+id 集+own 分域+v1 值)
  const pinKeys = V1_NESTED_PINS.map((p) => p.key).sort();
  const sweepKeys = [...v1Faces.keys()].sort();
  if (JSON.stringify(sweepKeys) !== JSON.stringify(pinKeys)) {
    const onlySweep = sweepKeys.filter((k) => !pinKeys.includes(k));
    const onlyPins = pinKeys.filter((k) => !sweepKeys.includes(k));
    throw new Error(`[extract-itemrare] V1 嵌套面清单漂移——新面现形/旧面消失须先定谳:\n  sweep 独有=[${onlySweep.join(' ')}]\n  pins 独有=[${onlyPins.join(' ')}]`);
  }
  for (const pin of V1_NESTED_PINS) {
    const f = v1Faces.get(pin.key);
    if (JSON.stringify(f.ids) !== JSON.stringify(pin.ids)) {
      throw new Error(`[extract-itemrare] V1 face id 集漂移:${pin.key} parsed=[${f.ids.join(',')}] pin=[${pin.ids.join(',')}](${pin.at})`);
    }
    if (pin.own === 'v1') {
      if (f.val !== pin.value) {
        throw new Error(`[extract-itemrare] V1 face 值漂移:${pin.key} ids=[${pin.ids.join(',')}] parsed=${f.val} pin=${pin.value}(${pin.at})`);
      }
      for (const id of pin.ids) VALUE[id] = f.val; // 落刀(覆写区域扫描基值:2242/2258/2843/52xx 组)
    } else if (pin.own === 'ch') {
      // 既有通道(S1③value/T4/U1)先于本刀已落值:按 per-id 终值嵌套写对拍防双源漂移
      for (const id of pin.ids) {
        if (VALUE[id] !== v1FinalNested.get(id)) {
          throw new Error(`[extract-itemrare] V1 ch 面对拍漂移:${pin.key}#${id} 本刀解析终值=${v1FinalNested.get(id)} 通道值=${VALUE[id]}(${pin.at})——通道钉表与本刀解析失同步`);
        }
      }
    } // ch-post:S1④ 后置落值,只锁形态(键+id 集)
  }
})();

/** ★T4:方法级范围守卫 `if (type >= lo && type <= hi)` 块的 value 面（SD1-5 首处;base=块顶
 *  层 value 行,over=嵌套 per-type `if (type == N)` 体顶层 value 行;brace 次行/同行双型）。
 *  返回 { base: string|null, over: Record<number,string> }。 */
function rangeGuardValueFace(lo, hi) {
  for (const [from, to] of REGIONS.slice(0, 5)) {
    for (let i = from; i <= to; i++) {
      const m = LINES[i].match(new RegExp(`^(\\t*)if \\(type >= ${lo} && type <= ${hi}\\)\\s*\\{?\\s*$`));
      if (!m) continue;
      const depth = m[1].length;
      const inline = /\{\s*$/.test(LINES[i]);
      let d = depth + (inline ? 1 : 0);
      let base = null;
      const over = {};
      for (let j = i + 1; j <= to; j++) {
        const bd = LINES[j].match(/^\t*/)[0].length;
        const t = LINES[j].trim();
        if (!inline && j === i + 1 && t === '{') { d += 1; continue; }
        if (bd === depth + 1 && d === depth + 1) {
          const vm = t.match(/^value = ([^;]+);\s*$/);
          if (vm) base = vm[1]; // 后写胜（C# 赋值序语义;族内恰一行）
          const om = t.match(/^if \(type == (\d+)\)\s*\{?\s*$/);
          if (om) {
            const n = +om[1];
            let d2 = d + (/\{\s*$/.test(t) ? 1 : 0);
            for (let k = j + 1; k <= to; k++) {
              const t2 = LINES[k].trim();
              const bd2 = LINES[k].match(/^\t*/)[0].length;
              if (!/\{\s*$/.test(t) && k === j + 1 && t2 === '{') { d2 += 1; continue; }
              if (bd2 === d2 && d2 === d + 1) {
                const vm2 = t2.match(/^value = ([^;]+);\s*$/);
                if (vm2) over[n] = vm2[1];
              }
              d2 += (LINES[k].match(/{/g) || []).length - (LINES[k].match(/}/g) || []).length;
              if (k > j + 1 && d2 <= d) break;
            }
          }
        }
        d += (LINES[j].match(/{/g) || []).length - (LINES[j].match(/}/g) || []).length;
        if (j > i + 1 && d < depth + 1) break;
      }
      return { base, over };
    }
  }
  return null;
}

/** 方法级 `if (type == X)`/`if (type >= A && type <= B)` 块定位（SD 域内首处;brace 次行/同行
 *  双型),返回 { line, rare, elseBlock, elseRare, value, elseValue }——rare/value 取块顶层或
 *  块内嵌套 if(type==N)/else 分支体首条赋值（2421/2422 型:rare/value 在嵌套 if/else 各支;
 *  2320 型:平铺在守卫体顶层）。★T4 扩 value/elseValue 采集（value 面续刀）。 */
function findTypeGuardBlock(id, condOverride) {
  const cond = condOverride ?? `type == ${id}`;
  for (const [from, to] of REGIONS.slice(0, 5)) {
    for (let i = from; i <= to; i++) {
      const m = LINES[i].match(new RegExp(`^(\\t*)if \\(${cond.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\s*\\{?\\s*$`));
      if (!m) continue;
      const depth = m[1].length;
      const inline = /\{\s*$/.test(LINES[i]);
      let d = depth + (inline ? 1 : 0);
      let rare = null;
      let elseBlock = false;
      let elseRare = null;
      let value = null;
      let elseValue = null;
      let branch = null;      // null | 'if' | 'else'（嵌套分支体归属）
      let branchDepth = -1;   // 嵌套分支体的 brace 深度
      for (let j = i + 1; j <= to; j++) {
        const bd = LINES[j].match(/^\t*/)[0].length;
        const t = LINES[j].trim();
        if (!inline && j === i + 1 && t === '{') { d += 1; continue; }
        if (branch === null && bd === depth + 1 && d === depth + 1) {
          if (/^if \(.*\)\s*$/.test(t) || /^if \(.*\)\s*\{\s*$/.test(t)) {
            branch = 'if';
            branchDepth = d + 1;
            if (/\{\s*$/.test(t)) d += 1;
            continue;
          }
          if (/^else\s*$/.test(t)) {
            branch = 'else';
            branchDepth = d + 1;
            elseBlock = true;
            continue;
          }
          const rm = t.match(/^rare = (-?\d+);\s*$/);
          if (rm && rare === null) rare = +rm[1];
          const vm = t.match(/^value = ([^;]+);\s*$/);
          if (vm && value === null) value = vm[1];
        } else if (branch !== null && bd === branchDepth && d === branchDepth) {
          const rm = t.match(/^rare = (-?\d+);\s*$/);
          if (rm) {
            if (branch === 'if') { if (rare === null) rare = +rm[1]; }
            else if (elseRare === null) elseRare = +rm[1];
          }
          const vm = t.match(/^value = ([^;]+);\s*$/);
          if (vm) {
            if (branch === 'if') { if (value === null) value = vm[1]; }
            else if (elseValue === null) elseValue = vm[1];
          }
        }
        d += (LINES[j].match(/{/g) || []).length - (LINES[j].match(/}/g) || []).length;
        if (branch !== null && d < branchDepth) { branch = null; branchDepth = -1; }
        if (j > i + 1 && d < depth + 1) break;
      }
      return { line: i + 1, rare, elseBlock, elseRare, value, elseValue };
    }
  }
  return null;
}

// ---- S1④ 鱼链 2303-2321 per-type if 链 rare 面（共享 case 2290-2321 无 2314） ----
(() => {
  const S1_FISH_PINS = {
    2303: 1, 2304: 1, 2305: 1, 2306: 1, 2307: 2, 2308: 3, 2309: 1, 2310: 3,
    2311: 1, 2312: 2, 2313: 1, 2315: 2, 2317: 4, 2318: 1, 2319: 1, 2321: 1,
  };
  const [cFrom, cTo] = REGIONS[2];
  // 定位共享 case 标签连（含 2303 且 2321;2314 独立 case 不在连内）
  let runStart = -1;
  let runEnd = -1;
  let runIds = null;
  for (let i = cFrom; i <= cTo; i++) {
    if (!/^\t*case \d+:\s*$/.test(LINES[i])) continue;
    const ids = [];
    let j = i;
    while (j <= cTo) {
      const m2 = LINES[j].match(/^\t*case (\d+):\s*$/);
      if (!m2) break;
      ids.push(+m2[1]);
      j++;
    }
    if (ids.includes(2303) && ids.includes(2321)) { runStart = i; runEnd = j - 1; runIds = ids; break; }
  }
  if (runStart < 0) throw new Error('[extract-itemrare] S1④ 鱼链共享 case 标签连未找到（源漂移）');
  const expectedRun = [];
  for (let id = 2290; id <= 2321; id++) if (id !== 2314) expectedRun.push(id);
  if (JSON.stringify(runIds) !== JSON.stringify(expectedRun)) {
    throw new Error(`[extract-itemrare] S1④ 鱼链标签连漂移:${runIds.join(',')}（expected ${expectedRun.join(',')};2314 独立 case/2320 独立守卫/2290-2296 鱼竿组须重新定谳）`);
  }
  // 解析体至 return;:per-type `if (type == X)` 块内 rare 面 + ★T4 value 面（链 if 全带
  //   value+rare 双写,rare 面 S1 已落,value 面本刀补齐——S1_FISH_VALUE_PINS 22 ids）
  const S1_FISH_VALUE_PINS = {
    2298: 3750, 2299: 3750, 2300: 3750, 2301: 3750, 2302: 7500,
    2303: 7500, 2304: 15000, 2305: 3750, 2306: 7500, 2307: 12500,
    2308: 500000, 2309: 3750, 2310: 50000, 2311: 7500, 2312: 25000,
    2313: 7500, 2315: 7500, 2316: 7500, 2317: 150000, 2318: 7500,
    2319: 7500, 2321: 12500,
  };
  const parsed = {};
  const parsedValue = {};
  for (let i = runEnd + 1; i <= cTo; i++) {
    const t = LINES[i].trim();
    if (/^(break;|return\b)/.test(t)) break;
    const m = t.match(/^if \(type == (\d+)\)\s*$/);
    if (!m) continue;
    if ((LINES[i + 1] ?? '').trim() !== '{') throw new Error(`[extract-itemrare] S1④ 链块形态漂移(:${i + 1})`);
    let d = 1;
    const body = [];
    let end = -1;
    for (let j = i + 2; j <= cTo; j++) {
      if (d === 1) body.push(LINES[j].trim());
      d += (LINES[j].match(/{/g) || []).length - (LINES[j].match(/}/g) || []).length;
      if (d === 0) { end = j; break; }
    }
    const rm = body.map((x) => x.match(/^rare = (-?\d+);\s*$/)).find(Boolean);
    if (rm) parsed[+m[1]] = +rm[1];
    const vm = body.map((x) => x.match(/^value = ([^;]+);\s*$/)).find(Boolean);
    if (vm) {
      const v = evalPrice(vm[1]);
      if (v === null) throw new Error(`[extract-itemrare] S1④ 鱼链 ${m[1]} value 不可解:${vm[1]}`);
      parsedValue[+m[1]] = v;
    }
    i = end;
  }
  const parsedKeys = Object.keys(parsed).map(Number).sort((a, b) => a - b);
  const pinKeys = Object.keys(S1_FISH_PINS).map(Number).sort((a, b) => a - b);
  if (JSON.stringify(parsedKeys) !== JSON.stringify(pinKeys) || pinKeys.some((k) => parsed[k] !== S1_FISH_PINS[k])) {
    throw new Error(`[extract-itemrare] S1④ 鱼链 rare 面漂移:${JSON.stringify(parsed)}（expected ${JSON.stringify(S1_FISH_PINS)}——新链支现形须先定谳）`);
  }
  // ★T4 value 面对拍:解析覆写集 ≡ 钉表（键+值）;存活覆盖=标签连 − {2320(守卫提前 return,
  //   死标签)} − {2290/2297(无覆写块,运行基值 2500 存活)} ≡ 覆写块全集——新成员无块入连
  //   即 throw（防死基值静默写新 id）。
  const vParsedKeys = Object.keys(parsedValue).map(Number).sort((a, b) => a - b);
  const vPinKeys = Object.keys(S1_FISH_VALUE_PINS).map(Number).sort((a, b) => a - b);
  if (JSON.stringify(vParsedKeys) !== JSON.stringify(vPinKeys) || vPinKeys.some((k) => parsedValue[k] !== S1_FISH_VALUE_PINS[k])) {
    throw new Error(`[extract-itemrare] S1④ 鱼链 value 面漂移:${JSON.stringify(parsedValue)}（expected ${JSON.stringify(S1_FISH_VALUE_PINS)}——新覆写现形须先定谳）`);
  }
  const noBlockSurvivors = [2290, 2297]; // 运行基值 sellPrice(0,0,5)=2500 存活件（亲核:无覆写块）
  const earlyReturnIds = [2291, 2292, 2293, 2294, 2295, 2296]; // 鱼竿组:体前内层 switch 后提前 return,不达鱼链体
  const expectedOver = runIds
    .filter((id) => id !== 2320 && !noBlockSurvivors.includes(id) && !earlyReturnIds.includes(id))
    .sort((a, b) => a - b);
  if (JSON.stringify(vParsedKeys) !== JSON.stringify(expectedOver)) {
    throw new Error(`[extract-itemrare] S1④ 鱼链 value 覆写覆盖漂移:blocks=${vParsedKeys.join(',')}（expected ${expectedOver.join(',')}）——基值存活集变动须重定谳`);
  }
  for (const [id, r] of Object.entries(parsed)) RARE[id] = r;
  for (const [id, v] of Object.entries(parsedValue)) VALUE[id] = v;
})();

// ---- S1⑤ SetDefaults 派发后方法级块（value if 链 + 1994-2001 num 块 + 14-id 或块 + bait rare） ----
(() => {
  const [dFrom, dTo] = methodRange('SetDefaults');
  const dyeIdx = dFrom + LINES.slice(dFrom, dTo + 1).findIndex((l) => /\tdye = \(byte\)GameShaders\.Armor\.GetShaderIdFromItemId\(type\);/.test(l));
  const baitIdx = dFrom + LINES.slice(dFrom, dTo + 1).findIndex((l) => /^\t\tif \(bait > 0\)\s*$/.test(l));
  if (dyeIdx < dFrom || baitIdx < dFrom) throw new Error('[extract-itemrare] S1⑤ SetDefaults 尾锚(dye/bait>0)未找到（源漂移）');
  // value if 链（dye..bait 之间,2-tab `if (type == X) { value = E; }` 四行块）
  const chain = {};
  for (let i = dyeIdx + 1; i < baitIdx; i++) {
    const m = LINES[i].match(/^\t\tif \(type == (\d+)\)\s*$/);
    if (!m) continue;
    const vm = (LINES[i + 2] ?? '').trim().match(/^value = ([^;]+);\s*$/);
    if (!vm || (LINES[i + 1] ?? '').trim() !== '{' || (LINES[i + 3] ?? '').trim() !== '}') {
      throw new Error(`[extract-itemrare] S1⑤ value 链块形态漂移(:${i + 1}):${LINES[i + 1]?.trim()}|${LINES[i + 2]?.trim()}`);
    }
    chain[+m[1]] = vm[1];
  }
  // bait 块阈值（机械解析,不硬编码 50/30/15;块形=`if (bait >= T)`/独立行 `else if (bait >= T)`+次行 {+rare）
  const tiers = [];
  for (let i = baitIdx; i <= dTo; i++) {
    const m = LINES[i].match(/^\t\t\t(?:else )?if \(bait >= (\d+)\)\s*$/);
    if (m) {
      if ((LINES[i + 1] ?? '').trim() !== '{') throw new Error(`[extract-itemrare] S1⑤ bait 阈值块形态漂移(:${i + 1})`);
      const rm = (LINES[i + 2] ?? '').trim().match(/^rare = (-?\d+);\s*$/);
      if (!rm) throw new Error(`[extract-itemrare] S1⑤ bait 阈值块形态漂移(:${i + 1})`);
      tiers.push([+m[1], +rm[1]]);
    }
    if (i > baitIdx && /^\t\t\}$/.test(LINES[i])) break; // bait 块收口
  }
  if (tiers.length < 2) throw new Error(`[extract-itemrare] S1⑤ bait 阈值面不足（tiers=${JSON.stringify(tiers)}）`);
  const baitRareOf = (p) => {
    for (const [t, r] of tiers) if (p >= t) return r;
    return null; // 1-14 档:不写 rare
  };
  // (c) 1994-2001 num 块 + (d) 14-id 或块（bait 块之后,同族补面）
  const cBlock = {};   // id → expr
  const dBlock = {};   // id → expr
  for (let i = baitIdx + 1; i <= dTo; i++) {
    if (/^\t\tif \(type >= 1994 && type <= 2001\)\s*$/.test(LINES[i])) {
      const nm = (LINES[i + 2] ?? '').trim().match(/^int num = type - (\d+);\s*$/);
      if (!nm || (LINES[i + 1] ?? '').trim() !== '{') throw new Error(`[extract-itemrare] S1⑤ num 块形态漂移(:${i + 1})`);
      const base = +nm[1];
      for (let j = i + 3; j <= dTo; j++) {
        const km = LINES[j].match(/^\t\t\tif \(num == (\d+)\)\s*$/);
        if (!km) continue;
        const vm = (LINES[j + 2] ?? '').trim().match(/^value = ([^;]+);\s*$/);
        if (!vm) throw new Error(`[extract-itemrare] S1⑤ num 块分支形态漂移(:${j + 1})`);
        cBlock[base + +km[1]] = vm[1];
        if ((LINES[j + 3] ?? '').trim() === '}' && /^\t\t\}$/.test(LINES[j + 4] ?? '')) break; // 外块收口
      }
    }
    const dm = LINES[i].match(/^\t\tif \(type == \d+(?: \|\| type == \d+)+\)\s*$/);
    if (dm) {
      const vm = (LINES[i + 2] ?? '').trim().match(/^value = ([^;]+);\s*$/);
      if (!vm || (LINES[i + 1] ?? '').trim() !== '{') throw new Error(`[extract-itemrare] S1⑤ 或块形态漂移(:${i + 1})`);
      for (const idm of LINES[i].matchAll(/type == (\d+)/g)) dBlock[+idm[1]] = vm[1];
    }
  }
  // 键集钉面（值机械流过,键集漂移即 throw 逼定谳;1456/1457/1458 三版同构已对拍）
  const CHAIN_PINS = [2015, 2016, 2017, 5212, 5300, 5311, 5312, 5313, 2019, 2018, 3563, 261, 2205, 2123, 2122, 2003, 2156, 2157, 2121, 1992, 2004, 2002, 2740, 2006, 3191, 3192, 3193, 3194, 2007, 2673].sort((a, b) => a - b);
  const chainKeys = Object.keys(chain).map(Number).sort((a, b) => a - b);
  if (JSON.stringify(chainKeys) !== JSON.stringify(CHAIN_PINS)) {
    throw new Error(`[extract-itemrare] S1⑤ value 链键集漂移:${chainKeys.join(',')}（expected ${CHAIN_PINS.join(',')}）`);
  }
  const C_PINS = [1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001].sort((a, b) => a - b);
  const cKeys = Object.keys(cBlock).map(Number).sort((a, b) => a - b);
  if (JSON.stringify(cKeys) !== JSON.stringify(C_PINS)) {
    throw new Error(`[extract-itemrare] S1⑤ num 块键集漂移:${cKeys.join(',')}（expected ${C_PINS.join(',')}）`);
  }
  const D_PINS = [2663, 1720, 2137, 2155, 2151, 1704, 2143, 1710, 2238, 2133, 2147, 2405, 1716, 1705].sort((a, b) => a - b);
  const dKeys = Object.keys(dBlock).map(Number).sort((a, b) => a - b);
  if (JSON.stringify(dKeys) !== JSON.stringify(D_PINS)) {
    throw new Error(`[extract-itemrare] S1⑤ 或块键集漂移:${dKeys.join(',')}（expected ${D_PINS.join(',')}）`);
  }
  for (const [id, expr] of Object.entries(chain)) {
    const v = evalPrice(expr);
    if (v === null) throw new Error(`[extract-itemrare] S1⑤ value 链不可解:${expr}`);
    VALUE[id] = v;
  }
  for (const [id, expr] of Object.entries(cBlock)) {
    const v = evalPrice(expr);
    if (v === null) throw new Error(`[extract-itemrare] S1⑤ num 块值不可解:${expr}`);
    VALUE[id] = v;
  }
  for (const [id, expr] of Object.entries(dBlock)) {
    const v = evalPrice(expr);
    if (v === null) throw new Error(`[extract-itemrare] S1⑤ 或块值不可解:${expr}`);
    VALUE[id] = v;
  }
  // bait 赋值行 → id 集（上下文走栈解析器）+ 阈值 rare 覆写
  for (const [rFrom, rTo] of REGIONS.slice(0, 5)) {
    for (let i = rFrom; i <= rTo; i++) {
      const bm = LINES[i].match(/^\t*bait = (\d+);\s*$/);
      if (!bm) continue;
      const ids = baitIdsOf(i, rFrom);
      const rare = baitRareOf(+bm[1]);
      if (rare === null) continue;
      for (const id of ids) RARE[id] = rare;
    }
  }

  /** bait 赋值行 → 覆盖 id 集。向上走栈（brace 次行/同行双型）:
   *  ①governing=首个 case|default 标签连（同层、与 bait 行之间无段终止符 break/return/goto）
   *  ②governing 为 run:之后先遇同层段终止符=外层组自身→收工;先遇 `switch (type)` 块头=
   *    内层 switch 段→跨头后首个无终止符间隔的标签连=外层组（取到即收工;走栈到底未取到
   *    =外层 switch 头误检,fallback:governing 即外层组）
   *  ③governing='default':至 switch 块头之间沿途 case 标签（含跨段终止符后的兄弟段）=
   *    显式集,default 补集=外层组−显式集
   *  ④if 守卫链:type==X / num==K(须有 int num = type - B 声明) / 多或;&& 合取、混合条件、
   *    块头形态外一律 throw 逼定谳 */
  function baitIdsOf(baitLine, regionFrom) {
    let need = 0;
    let crossedTerm = false;
    let governing = null;        // number[]（标签连）| 'default'
    let resolved = false;
    let siblingLabels = [];
    let pendingInner = false;    // 已跨出 switch 块头,外层组待取
    let outer = null;            // number[]
    const conds = [];
    let numBase = null;
    const collectRun = (hit) => {
      const run = [];
      let j = hit;
      while (j >= regionFrom) {
        const m2 = LINES[j].trim().match(/^case (\d+):\s*$/);
        if (!m2) break;
        run.unshift(+m2[1]);
        j--;
      }
      return { run, above: j };
    };
    for (let i = baitLine - 1; i >= regionFrom; i--) {
      const raw = LINES[i];
      const t = raw.trim();
      const opens = (raw.match(/{/g) || []).length;
      const closes = (raw.match(/}/g) || []).length;
      const atScope = need === 0;
      if (atScope && /^(break;|return\b|goto )/.test(t)) {
        // 段终止符=已离开所属 case:governing 即终值（pendingInner 仍立=跨出的 switch 头
        // 系外层 switch 误检,fallback 用 governing——外层组在 case 体顶部无终止符间隔,
        // 先遇终止符即证跨出的不是包裹本段的内层 switch）
        if (governing !== null && governing !== 'default') { resolved = true; break; }
        crossedTerm = true;
        continue;
      }
      const ndm = t.match(/^int num = type - (\d+);\s*$/);
      if (ndm && numBase === null) numBase = +ndm[1];
      const isCase = t.match(/^case (\d+):\s*$/);
      const isDefault = t === 'default:';
      if (atScope && (isCase || isDefault)) {
        if (governing === null && !crossedTerm) {
          if (isDefault) { governing = 'default'; need += closes - opens; continue; }
          const { run, above } = collectRun(i);
          governing = run;
          i = above + 1; // 跃过标签连（循环 i-- 落到连上方行）
          continue;
        }
        if (governing === 'default' && !pendingInner) {
          siblingLabels.push(+isCase[1]); // 同 switch 显式段（跨段终止符后的兄弟段也算）
          need += closes - opens;
          continue;
        }
        if (pendingInner && !crossedTerm && isCase) {
          const { run } = collectRun(i);
          outer = run;
          resolved = true;
          break;
        }
        need += closes - opens;
        continue;
      }
      need += closes - opens;
      if (need < 0) {
        // 块头行:行内除括号外有内容=头在本行（inline）;纯括号行=头在上一行（decompile 次行型）
        const bareBrace = /^[\t{}]*$/.test(raw);
        const headLine = bareBrace ? (LINES[i - 1] ?? '').trim() : t;
        if (/^switch\s*\(\s*type\s*\)/.test(headLine)) {
          if (governing !== null && !pendingInner) {
            pendingInner = true;   // governing 为内层 switch 段（或 default）,外层组另取
            crossedTerm = false;
          }
          need = 0;
          continue;
        }
        if (/^\t*(case \d+:|default:)\s*$/.test(headLine)) { need = 0; continue; } // case 体块 `{`（头行=标签）
        if (/^\t*(public|private)\s+\S+.*\(.*\)\s*$/.test(headLine)) {
          // 方法体边界=走栈收工（governing 已定即终值;SD 首案例:外层 switch 头误检后触界）
          if (governing !== null) { resolved = true; break; }
        }
        const im = headLine.match(/^if \((.*)\)\s*\{?\s*$/);
        if (im) {
          const cond = im[1].trim();
          if (/&&/.test(cond)) throw new Error(`[extract-itemrare] S1⑤ bait ${baitLine + 1}:合取守卫未建模:${cond}`);
          const terms = [...cond.matchAll(/\b(type|num) == (\d+)\b/g)];
          if (!terms.length) throw new Error(`[extract-itemrare] S1⑤ bait ${baitLine + 1}:守卫条件不可解:${cond}`);
          const kinds = new Set(terms.map((x) => x[1]));
          if (kinds.size > 1) throw new Error(`[extract-itemrare] S1⑤ bait ${baitLine + 1}:混合 type/num 条件未建模:${cond}`);
          // num 条件延迟解析:num 声明行在 cond 块上方,走栈至此尚未经过——走栈收工后统一求值
          conds.unshift({ num: kinds.has('num'), values: terms.map((x) => +x[2]) });
          need = 0;
          continue;
        }
        throw new Error(`[extract-itemrare] S1⑤ bait ${baitLine + 1}:块头不可解(:${i + 1})"${headLine}"（形态外,须定谳）`);
      }
    }
    if (!resolved || governing === null) {
      throw new Error(`[extract-itemrare] S1⑤ bait ${baitLine + 1}:走栈失败（governing=${JSON.stringify(governing)}）`);
    }
    let ids;
    if (governing === 'default') {
      if (!outer) throw new Error(`[extract-itemrare] S1⑤ bait ${baitLine + 1}:default 段外层组未定`);
      ids = outer.filter((x) => !siblingLabels.includes(x));
    } else {
      ids = governing; // pendingInner 无 outer=governing 即外层组（外层 switch 头误检 fallback）
    }
    for (const c of conds) {
      const condIds = c.num ? (numBase === null
        ? (() => { throw new Error(`[extract-itemrare] S1⑤ bait ${baitLine + 1}:num 条件无 int num = type - B 声明`); })()
        : c.values.map((k) => numBase + k))
        : c.values;
      ids = ids.filter((x) => condIds.includes(x));
    }
    if (!ids.length) throw new Error(`[extract-itemrare] S1⑤ bait ${baitLine + 1}:id 集为空（约束解析失败）`);
    return ids;
  }
})();

// ---- S1⑥ SetDefaults 派发后递归（★T4 新段）:1803-1807→SetDefaults(1533+type-1803) ----
//  锚=SetDefaults 派发器体唯一 `SetDefaults(` 调用（:48922;1456:48525/1458:48922 三版同锚,
//  体遍历机械核唯一）。递归=整体重置重建,终值=目标面 C..C+(B-A)（rare/value 全被内层
//  SetDefaults 覆写;外层 case 体=死码）。1803-1807=五钥匙模具（JungleKeyMold 等）,终值=
//  对应钥匙 1533-1537 面（S1③ rare=8/value 缺键 0）。
(() => {
  const [dFrom, dTo] = methodRange('SetDefaults');
  let rec = null;
  for (let i = dFrom; i <= dTo; i++) {
    if (!LINES[i].includes('SetDefaults(')) continue;
    if (LINES[i].match(/^\t(public|private) void SetDefaults\(/)) continue; // 签名行
    const m = LINES[i].trim().match(/^SetDefaults\((\d+) \+ type - (\d+)\);\s*$/);
    if (!m) throw new Error(`[extract-itemrare] S1⑥ 未建模的 SetDefaults 调用形态(:${i + 1}):${LINES[i].trim()}——须定谳`);
    if (rec) throw new Error(`[extract-itemrare] S1⑥ 多处递归锚（:${rec.line} 与 :${i + 1}）——须扩面定谳`);
    const A = +m[2];
    const Bm = (LINES[i - 2] ?? '').match(/^\t\tif \(type >= (\d+) && type <= (\d+)\)\s*$/);
    if (!Bm || +Bm[1] !== A || (LINES[i - 1] ?? '').trim() !== '{' || (LINES[i + 1] ?? '').trim() !== '}') {
      throw new Error(`[extract-itemrare] S1⑥ 递归守卫块形态漂移(:${i + 1}):${JSON.stringify([LINES[i - 2], LINES[i - 1], LINES[i], LINES[i + 1]])}`);
    }
    rec = { A, B: +Bm[2], C: +m[1], line: i + 1 };
  }
  if (!rec) throw new Error('[extract-itemrare] S1⑥ 递归锚未找到（源漂移）');
  // 目标面终值核:rare 均匀单值（S1③ 已落）+value 缺键（=0 重置默认）——任一破约即 throw
  const targetIds = [];
  for (let k = 0; k <= rec.B - rec.A; k++) targetIds.push(rec.C + k);
  const targetRares = new Set(targetIds.map((id) => RARE[id]));
  if (targetRares.size !== 1 || targetRares.has(undefined)) {
    throw new Error(`[extract-itemrare] S1⑥ 目标面 ${rec.C}-${rec.C + (rec.B - rec.A)} rare 非均匀/缺键:${[...targetRares]}——须重定谳`);
  }
  for (const id of targetIds) {
    if (VALUE[id] !== undefined) {
      throw new Error(`[extract-itemrare] S1⑥ 目标面 value 非缺键(${id}=${VALUE[id]})——递归终值面漂移,须重定谳`);
    }
  }
  for (let k = 0; k <= rec.B - rec.A; k++) {
    RARE[rec.A + k] = RARE[rec.C + k];  // 递归覆写:rare=目标面
    delete VALUE[rec.A + k];            // 终值 value=0=缺键(清区域扫描可能写入的 case 级死码值)
  }
})();

  return { RARE, VALUE };
}

const { RARE, VALUE } = extractRareValue(
  readFileSync(`${ROOT}/Terarria${SRC_VER}/Terraria/Item.cs`, 'utf8'),
  readFileSync(`${ROOT}/Terarria${SRC_VER}/Terraria.ID/ItemID.cs`, 'utf8'), // S1① IsFood 集源
);
export { RARE, VALUE };
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  // --dump:全量表出 stdout 不落盘(recon-item-1456-1457.mjs 双版本对账用;守卫不拦
  //  dump——双实例 1456/1457 都走此通道,拦了=对账闸门自断)
  if (process.argv.includes('--dump')) {
    writeSync(1, JSON.stringify({ src: SRC_VER, RARE, VALUE }));
  } else {
    // ★g1 footgun 硬化（红蓝-F①,2026-09-18）：探测注入面设置而 SW_OUT 缺省 →
    //  fail-closed 拒跑。定谳：守卫探测读 SW_ITEMRARE_JSON/SW_ITEMVALUE_JSON（夹具，
    //  零缺失→放行）而 writeFileSync 落缺省 OUT_DIR=现库 game/src/data——探测与
    //  写盘分离=守卫被绕过洗库。变异判别：tests/extract-itemrare-era-guard.test.ts。
    const PROBE_ENV_SET = process.env.SW_ITEMRARE_JSON !== undefined || process.env.SW_ITEMVALUE_JSON !== undefined;
    if (PROBE_ENV_SET && process.env.SW_OUT === undefined) {
      console.error('[extract-itemrare] 拒绝运行：探测注入面（SW_ITEMRARE_JSON/SW_ITEMVALUE_JSON）已设置而 SW_OUT 缺省（fail-closed）。');
      console.error('  守卫将探测注入夹具（零缺失→放行），写盘却落缺省现库路径 game/src/data——探测与写盘分离=守卫被绕过（footgun 洗库面）。');
      console.error('  处置：显式设置 SW_OUT 指向与探测一致的沙箱目录，或同时清掉探测 env 走真实现库守卫；--dump 对账通道不写盘不受此限。');
      process.exit(1);
    }
    // ---- ★追加时代守卫（头注见上）：重产 vs 现库动态 diff,缺键非空即拒 ----
    const FORCE_FULL = process.argv.includes('--force-full');
    const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
    const OUT_DIR = process.env.SW_OUT ?? `${ROOT}/game/src/data`;
    const RARE_OUT = `${OUT_DIR}/vanilla-itemrare.json`;
    const VALUE_OUT = `${OUT_DIR}/vanilla-itemvalue.json`;
    const RARE_GUARD = process.env.SW_ITEMRARE_JSON ?? RARE_OUT;
    const VALUE_GUARD = process.env.SW_ITEMVALUE_JSON ?? VALUE_OUT;
    // 现库 id 集 − 重产输出集 = 重产盖不住的缺键（动态探测,不硬编码 id 清单;
    // 现库不存在/坏损时不拦——同 npcs 判例,让正常流程自行报错）
    const missingOf = (guardPath, fresh) => {
      if (!existsSync(guardPath)) return [];
      try {
        const prev = JSON.parse(readFileSync(guardPath, 'utf8'));
        if (prev == null || typeof prev !== 'object' || Array.isArray(prev)) return [];
        return Object.keys(prev).filter((k) => fresh[k] === undefined);
      } catch { return []; }
    };
    const missingRare = missingOf(RARE_GUARD, RARE).sort((a, b) => Number(a) - Number(b));
    const missingValue = missingOf(VALUE_GUARD, VALUE).sort((a, b) => Number(a) - Number(b));
    const appendEra = missingRare.length > 0 || missingValue.length > 0;
    if (appendEra && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
      const sample = (ids) => `${ids.slice(0, 6).join(', ')}${ids.length > 6 ? '…' : ''}`;
      console.error(`[extract-itemrare] 拒绝全量重写：现库含重产(SW_ITEM_VER=${SRC_VER})盖不住的 id（追加时代·缺键型增量）。`);
      console.error(`  物证：vanilla-itemrare.json 缺 ${missingRare.length} 个 id（${sample(missingRare)}）；vanilla-itemvalue.json 缺 ${missingValue.length} 个 id（${sample(missingValue)}）。`);
      console.error('  全量重写会把缺键 id 洗成 rare=0/value=0 兜底——拾取飘名/重铸费用/商店定价/decraft 组代表全错（缺键型,与 BJ92 错值型同案异构）。');
      console.error('  正常更新流：node tools/extract-itemrare.mjs 重产（缺省 1457,输出盖住现库全部 id,零缺失即放行）。');
      console.error('  错值型漂移走活通道：node tools/recon-item-1456-1457.mjs（--fix 一键重放 1457 终值 + DRIFT=0 双闸）。');
      console.error('  确需原地强推：双旗 --force-full --overwrite-append-era（单旗仍拒）；事后必须全绿 recon-item 双闸门 + tests/item-stats-golden-1457。');
      process.exit(1);
    }
    writeFileSync(RARE_OUT, JSON.stringify(RARE));
    writeFileSync(VALUE_OUT, JSON.stringify(VALUE));
    console.error(`rare 条目: ${Object.keys(RARE).length} / value 条目: ${Object.keys(VALUE).length}（源 Terarria${SRC_VER}）`);
  }
}
