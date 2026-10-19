# FX53 全量普查：NPC 射弹尘站对照表（2026-09-16）

> 任务：把 FX53（骷髅弓箭手燃烧箭无火焰尾迹）的同族问题推广为全量普查。
> 本文档 = 原版尘站全集 × 本仓实态 × 缺失判定的对照总账。**只普查不修**（FX53 已修面除外）；
> 修复按分级另行派刀。

## 1. 普查入口（可复跑）

| 件 | 路径 | 用途 |
|---|---|---|
| 仓内 id 枚举 | `game/tools/_fx53-repo-enum.mjs` | 五出口（spawnHostileProj@6 / shoot@6 / shootDart@7 / new Arrow@6 / new Dart@5）括号配平切参,敌域文件过滤；**声明面**补 RANGED_TABLE proj 值（`Enemy.ts` RANGED_TABLE,表项非调用点）与 DART_STYLE 键 |
| 原版尘站提取 | `game/tools/_fx53-vanilla-dust-scan.mjs` | 扫 `Terarria1457/Terraria/Projectile.cs`：按 `type == N` 行花括号配平取整块,块内收 Dust.NewDust/Direct/Perfect（顶层参切分,dust=第4参）+ for 循环标记；三区 Update/AI()/Kill。**局限**：①尘型为变量（numXXX）的站只给锚不给值；②`aiStyle` 独占支/`else` 兜底支无 `type==N` 字面 → 需人工核读（本文已核：44/101/129/174/176/27/293/605 族,见 §3 行号） |
| 实态探针 | `game/scripts/_fx53-census.mjs` | 私有 vite 下逐 id 隔离 90 tick（stub ctx:空世界+尘池记录器）,产 `/tmp/fx53-census-result.json`：飞行尘频/型、死亡拍尘、泛色 spawnParticles 标记、音 |

复跑：`SW_PORT=5256 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5256 npx vite &` →
`SW_ORIGIN=http://localhost:5256 node tools/run-diag.mjs scripts/_fx53-census.mjs`（收尾 kill 5256）。

## 2. 域边界

- **入域**：本仓 NPC 实际会射出的弹 id 全集 = DART_STYLE 键(41) ∪ RANGED_TABLE proj 值(18) ∪ bossAI/Enemy 调用点字面(净 29) → **70 id**（§4 表）。
- **TownShot 域**（城镇 NPC 射击,第三载体,低优先）：1,14,15,21,24,30,48,242,267,520,582-590,669,721,880,950 —— 原版站见 §5。
- **出域**：玩家武器弹（Arrow 载体 friendly 面）、鞭/召唤（WhipProj/WhipTag/MinionProj）、机关陷阱（TrapShot:98/184/980/187/186/185/99/654/162/281/166/烟花族；BoulderMech:99/727/1002-1057;RollingBoulder:763）——非「NPC 射击」域,同族债务另账。
- **特别标注**：腐化者 112/666 是 **NPC 实体**（Enemy AI）,不发射弹幕,不在本域。NPC 409 发射的是 NPC 410 星体（NewNPC）,亦非弹幕。

## 3. 原版尘站三类（Projectile.cs 1457）

1. **Update 尾通用站**（:17141-17182,owner 无关,每子步 1 粒）：2/82→d6、172→d135、103→d75(1/2 noGravity+scale×2)、278→d169(1/2)、4→1/5 d14、5→Next(3)∈{15,57,58}。**入域 id 仅 2/82**（已修）；172/103/278/4/5 无 NPC 射手,不入域。
2. **per-type AI 段站**：AI_001/AI() 各 `type == N` 支内 Dust.NewDust（§4 逐 id 行号）；aiStyle 独占支/else 兜底支人工核读补了 44(:25793,aiStyle18)、101(:26222-26236,aiStyle23 变量 num194=75)、129(:27010,aiStyle28 else)、174/176(:55999/:56076,alpha==0 门)、605/920/926(:56020-57,alpha==0 门+变量 num70)、293(:28844,aiStyle51 else,已修面)、27(:24603,aiStyle8 else——**本仓无射手,仅登记**)。
3. **Kill 分档链**（:71752-78000）：每 id 死亡爆尘（§4 "K" 行号）。

## 4. 对照表（70 id）

图例：A=AI 段站,U=Update 尾站,K=Kill 站；判定 ✅已修(FX53)／✅本来就有／❌缺失(分级)／🔷近似(实现与原版不同源)／Carrier=载体缺 DART_STYLE 走 legacyStep。

| id | 弹名/射手(仓) | 原版站(行号 尘型 频率) | 仓内实态(探针/代码) | 判定 |
|---|---|---|---|---|
| 31 | 沙球(蚁狮) | A:58815/58866 1/2×d32;K:77814 5×d32 | 飞行 d32×50/90t ✓ | K✅(普查批:Dart 口 killShooterDust 5×d32+dig;Arrow 口 Game.onProjectileDeath 31/42 支既有) |
| 38 | 哈比羽 | K:77933 **10×d42** | 无 | K✅(普查批 killShooterDust;★复核勘误:循环 num836=0..9 全 10 粒,原行 ×3 系误记) |
| 44 | 魔镰(恶魔) | A:25793 2×d27/update;K:77941 30 循环×{d27 s1.7 ng+d27} | A✅(2/tick) | K✅(Arrow 口 Game.onProjectileDeath 44/45 支既有;Dart 口普查批 killShooterDust) |
| 55 | 黄蜂毒刺 | A:56458 1×d18;K:77139 5×d18 | A✅(FX53) | K✅(普查批 killShooterDust;55/719 共组) |
| 75 | 炸弹(小丑) | K:80081 爆炸组(d31/d6+gore) | rocketKill 全套爆炸尘 ✓ | ✅(等价口) |
| 81 | 木箭敌(哥布林弓手) | K:75452 10×d7 | 无飞行尘=原版同;K✅(FX53) | ✅ |
| 82 | 燃烧箭敌(骷髅弓手110/海盗215/精灵350) | **U:17143 1×d6/update**;K:77170 10×d6 | U✅+K✅(FX53) | ✅ |
| 83 | 死光(Eyezor/EoC) | 无 A/K 尘站;K:77649 组=HitTiles+Item10 撞击面 | 撞击面双口✅(BULLET_KILL_SFX 组:Arrow 口 Game.onProjectileDeath;Dart 口 killShooterDust 头,普查批接) | 撞击面✅ |
| 84 | 粉激光(附魔师?) | 同 83 组 | 同 83 | 撞击面✅ |
| 96 | 诅咒焰(爬行者) | A:24588 1×d75(3×scale);K:77792 20×(2×d75) | A✅(FX53) | K✅(Arrow 口 Game.onProjectileDeath 95/96 支既有;Dart 口普查批 killShooterDust) |
| 100 | Boss 弹(bossAI 双子系) | 无 | 无 | ✅(无站) |
| 101 | 火球(石巨人) | A:26222-36 aiStyle23 1/2×d75/update(v×0.2,α100;7/9 noGravity+scale×3,vel×2×1.2+=弹速;num193=ai[0]∈{8,9,10} 0.25/0.5/0.75 爬升) | Arrow 载体 aiStyle23 分段已接(普查批) | **A✅** |
| 115 | 三叉戟(红恶魔) | A:26814 首拍沿弹道 20×d27(scale0.9,vel×0.25−=弹速×5);A:26860 localAI[1]≥15 起 1×d27(scale0.6,vel×−0.25);K:78774 Item10+27 循环×2×d27 | 全站已接(普查批) | **A+K✅**(★复核勘误:26847/26858 两站实为 type 173/132 专属,115 无涉) |
| 128 | 霜爆(冰雪巨人) | A:26983 3×d92/update;K:76878 Item27+10×d92(2/3 vel×2 ng scale×1.75/1/3 scale×0.5) | A✅(FX53) | K✅(Arrow 口 Game 119/118/128/359 支既有;Dart 口普查批 killShooterDust) |
| 129 | 符文爆弹(符文法师) | A:27010 6×d106/update(v,α100,noG,vel×(0.1+rand4×0.1),scale×(1+rand5×0.1)) | 真尘站已接,泛色 trail 已退役(普查批) | **A✅** |
| 174 | 冰刺(尖刺史莱姆) | A:55999 alpha==0 门 1×d76/update(α50,noG,noLight,vel×0.5,盒=oldPos−v×3) | 已接(普查批;α==0 门相位=fade 前,第 7 update 起) | **A✅** |
| 176 | 丛林刺(尖刺史莱姆) | A:56076 alpha==0 门 1×d22/update(α100,scale0.5,noG,noLight,vel×0.15,fadeIn0.8) | 已接(普查批) | **A✅** |
| 177 | 冰涎(冰鱼人) | A:26966 3×d137/update;K:76852 20×d137 | A✅(FX53) | K✅(普查批 killShooterDust) |
| 180 | 毒泡弹(海盗) | 无(撞击组 :77649) | 同 83 | 撞击面✅ |
| 257 | 霜束(冰雪巨人) | 无 | 无 | ✅ |
| 259 | 火球(石巨人手) | 无(AI_001 无站) | 无 | ✅ |
| 270 | 髅骨(骷髅王头,★弹名勘误) | A:57061 首拍 10×d5(scale2);A:57658 2×d5/update(盒缩 8,位−=弹速);K:75816 dig+20×(d26+d5) | 全站已接(普查批,skullBone Arrow 支) | **A+K✅** |
| 288 | 金雨(脓水粘怪) | A:24788 3×d170/update(ai[0]=4 恒真)+1/8×d170 | ✅(FX53,9.3/tick) | ✅ |
| 290 | 暗影束(死灵法师) | A(:28630 α 面)+束铺撒(orchestrator 非 Dust) | ✅(束段铺撒+α) | ✅ |
| 291 | 地狱火弹(魔法师) | A:28760 10×d174/update | ✅(10/tick) | ✅ |
| 293 | 迷失魂(布道者) | A:28844 9×d175/update(aiStyle51 else) | ✅(9/tick) | ✅ |
| 299 | 暗影焰(巨型诅咒颅) | A:57618/57630 d181(首拍爆+尾) | ✅ | ✅ |
| 300 | 圣锤(圣骑士) | 无(AI 无尘;K 无) | 无 | ✅ |
| 302 | 狙击弹(骷髅神射) | 无(撞击组 :77649) | 同 83 | 撞击面✅ |
| 303 | 火箭(骷髅爆破) | A:48194-29 火箭尾烟族;K:79845 爆炸组 | ✅(ROCKET_TRAIL+rocketKill) | ✅ |
| 329 | 月事光柱 | 无(aiStyle56 无尘) | 无 | ✅ |
| 436 | 火星弹(脑洗器) | K:74894 Next(5,10)×d220(scale0.5,vel×1.6,vY−−,位=Lerp(Center)) | DART_STYLE 投影+Kill 站已接(普查批;AI 面仅音/帧动画/光) | Carrier+K✅ |
| 438 | 火星激光(射线枪手) | 无(★复核定谳:AI 仅 AddLight+fade,无尘站) | DART_STYLE 投影已接(α255+EU3+fade \|v\|×0.9+Item12) | Carrier✅(原版本无尘站) |
| 452 | 幻影矢(★弹名勘误:月总手/鱼唇射,非猪鲨) | K:74329 Zombie103+Resize144+4×d31+40×(2×d229)+gore | 泛色已退役,真尘站迁 killNow(普查批) | K✅ |
| 454 | 幻影能量球(★弹名勘误:月总真眼射) | K:74363 NPC_Killed_6+Resize208+7×d31+60×(2×d229 径向)+gore | 泛色已退役,真尘站迁 killNow(普查批) | K✅ |
| 462 | 幻影矢(月主) | A:55827 1×d229/update(vel=弹速,pos−4,scale0.8,noG,noLight);A:56245 出膛 Next(5,10)×d229;K:74909 Next(5,10)×d229(scale0.5,vel×1.6,vY−−) | A 尾迹+K 已接(普查批,EU=3 每子步) | **A+K✅** |
| 467 | 教徒火球(拜月教) | A:55230-68 d6/d31 多站;K:74398-25 | ✅(d6×320/d31×34/79t) | ✅ |
| 468 | 光珠(★弹名勘误:远古教徒四大 Clone 补射) | A:55372 12×d27 环(age%12);A:55386 1/4×d31;A:55397 1/32×d31;A:55410 1/2×2×d27;K:74446+ | A 四站已接(普查批);K 既有真值(Game.onProjectileDeath 467/468 支,原勘误漏记) | **A✅(K 既有✅)** |
| 471 | 投骨(投骨骷髅) | K:77893 dig+10×d26(scale0.8;21/471/532/1111 共组) | 已接(普查批 killShooterDust) | K✅ |
| 472 | 诅咒颅(地牢蜘蛛) | A:55078 1×d30/update(vel×0.25+弹速×0.75)+首拍 20×d30+Item17;K:74805 20×d30 | DART_STYLE 投影(8×8 timeLeft60)+双站已接(普查批) | **A+K✅** |
| 498 | 铁钉(Nailhead) | 无 | 无 | ✅ |
| 501 | 蝇瓶体(Dr Man Fly 本体) | K:74219 Shatter+20×d188+gore 435-437 ×5(毒爆;盒扩 40→Damage 134) | 已接(普查批 killShooterDust) | **K✅** |
| 508 | 标枪(希腊骷髅) | K:75392 dig+20×d81 退进行列 | ✅(FX53) | ✅ |
| 537 | 观星者激光 | A:32246 束端 int(2×age/30)×d226(束角±π/2,rand·0.8+1,noG,scale1.2)+1/(5..10)×d31(侧偏−(4,4),vel×0.5,vY=−\|vY\|);K 无 | 泛色 spawnBurst 退役改真尘站(普查批;宿主驱动=探针盲区,vitest 判定) | **A✅** |
| 538 | 加农弹(海盗) | A:25477 上升期(vy<0∧ai[0]<60) 1/4×d180(位=Center,velY−2)+1/6×d176(scale+0.3+,vel×0.1) | 已接(普查批 Arrow 支) | A✅ |
| 572 | 蝾螈吐息 | A:57254 2×d40/update;K:73976 15×d40(vel×0.1→×3,位=(Center+pos)/2,scale1.25) | A✅(FX53) | K✅(普查批 killShooterDust) |
| 573 | 蓄能弹(预言者) | A:33937 1/2×d242(蓄能,位=Center,vel=弹速,scale1.5);A:34054 1/4×d242(释放,vel×0.2,scale1.5) | 泛色退役改真尘站(普查批) | **A✅** |
| 575 | 沙漠精魄? | 无(AI :34178 无尘) | 无 | ✅ |
| 576 | 星旋弹(事件) | A:57278 5×d242/update(vel=0,位−=弹速/5×i,noG,scale0.8,noLight) | 已接(普查批 Arrow 支) | A✅ |
| 577 | 星旋激光(风暴潜水员) | A:56334 首拍 5×d229;撞击组 :77649 | A✅(FX53);撞击面同 83 双口(普查批 Dart 口接) | 撞击面✅ |
| 581 | 破甲刺(漩涡蜂后 426) | A:57288 首拍 Item17+2×SelRandom(229,161,161)/update(vel/4+弹速/2,noG,noLight,scale1.2,位=Center);K:73993 30×SelRandom(229,229,161)(scale1.25+rand,fadeIn0.25,vel×2) | ★num155 定谳=SelectRandom;DART_STYLE 投影(α255 恒=本体恒隐)+穿透豁免+双站已接(普查批) | **A+K+Carrier✅** |
| 592 | 火星弹(火星行者) | 无(★复核定谳:AI 仅 AddLight+fade,无尘站) | DART_STYLE 投影已接(α255+EU3+Item12) | Carrier✅(原版本无尘站) |
| 596 | 沙漠幽焰(沙漠精灵) | A:34243 1/27 受理 d27 环+尾爆 SelectRandom(27,6);K:73777 爆组 | ✅(环+爆);泛色已退役 | ✅ |
| 605 | 史莱姆刺(尖刺史莱姆) | A:56025 alpha==0 门+1/3 掷 1×d4(色(78,136,255,150),scale1.2,盒=position+弹速,vel×0.3+弹速×0.3,noG) | ★变量定谳:num70=4(605 桶缺省);已接(普查批) | **A✅** |
| 622 | 水弹(猪鲨) | A:57145 2/3×d229/update(盒=position+(4,4) 缩 8,v×0.2,scale1.2,noG,noLight,pos−v×2) | 已接(普查批 Arrow 支,EU=2) | **A✅** |
| 719 | 蜂刺(蜂王) | A:56461 1/2×d147/update(盒=pos−弹速);A:56465 首拍 20×d147(+弹速×0.75)+10×d147(×2);K:77139 5×d18 | 全站已接(普查批,Arrow 支+killNow) | **A+K✅** |
| 811 | 血弹(血月骑手) | A:57348/57362 d5;K:74023 | ✅(killBloodShot) | ✅ |
| 814 | 血弹雨(恐惧鹦鹉螺) | A:57411/57425/57434 d5;K:74023 | ✅;泛色已退役(曾双发) | ✅ |
| 836 | 蒲公英籽(风) | A:34744 首拍 3×d31(α50,White,scale1.2,vel×0.3,noG);K:75138 3×d31(White,scale0.8,vel×0.5,noG) | 双站已接(普查批 dartStep 首拍支+killShooterDust) | K✅;A✅ |
| 872 | 月主弹 | 无 | 无 | ✅ |
| 873 | 光鞭(光之女皇,★弹名勘误) | A:AI_171 区 1 站;K:72691 20×NewDustPerfect(267)(fadeIn1,noG,α100,AI_171 色 Lerp White) | K 已接(普查批 killNow+empressHue 通道;A 站不在普查域) | K✅ |
| 874 | 月主弹 | 无 | 无 | ✅ |
| 909 | 岩石(石巨人) | K:77226 dig+10×d1(v×0.1,scale0.75;3/48/54/599/909 共组) | 已接(普查批 killShooterDust) | K✅ |
| 920 | 史莱姆箭矢(地牢蓝史莱姆 658,★弹名勘误) | A=无(★复核定谳:AI 块 :56025 明文排除 920/921,外层 type∈{605,920…} 是扫描器误并);K:72761 6×d4(色(78,136,255,150)环) | DART_STYLE 投影+Kill 站已接(普查批) | K✅(A=原版本无站) |
| 922 | 食人魔砸地冲击(DD2) | A:69800/69834 AI_135 扩张盒逐格 d4(num5−1)+d31(3 粒,scale=2−num4×0.15+num7×0.5) | 尘面已接(普查批 Arrow 支,ai[0]∈{3,6,9} 三波;毁块面=行为债另账) | **A✅(尘面)** |
| 926 | 凝胶弹(史莱姆女皇,★弹名勘误) | A:56025 alpha==0 门+1/3 掷 1×d4(QueenSlime 色,num72=8 盒加宽,noG=1/2);K:72773 22×d31(QueenSlime 色,盒加宽 16) | ★num70=4 定谳;PROJ_ALPHA0/AI001_FADE_RATE 补键+双站已接(普查批) | **A+K✅** |
| 1001 | 冰雪宝箱弹? | 无 | 无 | ✅ |
| 1021 | 月总巨砾(★弹名勘误) | K:76364 族块——1021 走尾支 dig+30×d323(1/2 scale×1.4) | K 已接(普查批 killNow;族他员由 RollingBoulder rbKill 承载) | **K✅** |
| 1073 | 携物史莱姆凝胶 | K:75452 10×d7 | ✅(FX53) | ✅ |

**规模**：核心域 70 id,原版有站者 51,仓内完整对齐 24,FX53 修 10(82U/K、55A、96A、128A、177A、288A、572A、577A、508K、1073K、811/814 系),缺失/近似 36 面(见 §6 分级)。

## 5. TownShot 域（城镇 NPC 射击,第三载体——另账派刀）

| id | 原版站 | 备注 |
|---|---|---|
| 1 | K:75452 10×d7 | TownShot 无 Kill 尘 |
| 15 | K:77764 2×d6 | 火花 |
| 21 | K:77893 d26 | |
| 24 | K:77916 d1 | |
| 30 | K:80081 爆组 | 手雷 |
| 48 | K:77226 10×d1 | |
| 267 | A:58325 分裂爆 4+1×d170 | 仓内为 d267 近似(待核) |
| 520 | K:74707 d252 | |
| 583 | K:77901 d4 | |
| 585 | A:57078/57109 d27;K:73905/73912 | |
| 587 | A:57176/57193 d76;K:73966/73973 | |
| 588 | K:80198-08 d219+rand5/d139+rand4 | |
| 589 | K:75690 d11 | |
| 590 | K:73928 变量 | |
| 669 | K:73200-10 3×d4 | |
| 14/242/242/582/586/721/880/950 | 无站 | ✅ |

## 6. 缺失清单分级摘要（修复另行派刀）

**HIGH（玩家可见高频站,常驻尾迹缺失）**
1. `472` 诅咒颅火焰尾迹（d30×2/update + Kill d30,地牢常客）— Dart 载体 AI 段新增
2. `101` 石巨人火球（1/2×d75/update,aiStyle23 变量站）— Arrow 载体需新增 aiStyle23 分段
3. `174/176` 尖刺史莱姆冰/丛林刺（alpha==0 门 1×d76/1×d22 每更新）— Dart 载体
4. `605/920/926` 史莱姆胶尘族（alpha==0 门 1×变量/update——先核 num70 选择器再钉值）— Dart 载体
5. `462` 幻影矢每更新尾迹（1×d229,出膛尘已有）— Arrow 载体
6. `270` 月主系球（A d5/d6 三站+K 五支）

**MEDIUM（阶段/爆发站,战斗中可见）**
- `115` 红恶魔三叉戟（3 站:弹墙 d27/rand{15,57,58}/2×d107 + K）
- `129` 符文爆弹（6×d106/update 真站替换泛色近似）
- `573` 预言者蓄能弹（1/2、1/4×d242 两站替换泛色近似）
- `537` 观星者激光束缘尘（d226 锥形+1/N×d31）
- `468` 蝇瓶 AI 四站 + K 五支;`501` 蝇瓶本体毒爆 K(Sound13+20×d188+gore)
- `622` 猪鲨水弹（2/3×d229/update）;`452/454` 猪鲨 K;`719` 蜂王蜂刺（1/2×d147+首拍 30×d147+K）
- `922` DD2 食人魔砸地尘（d4/d31）;`1021` 月主血珠 K 六支
- **Carrier 面**：`436/438/581/592` 无 DART_STYLE 表项走 legacyStep 色块（先补 SetDefaults 投影再谈尘站）

**LOW（低频/死亡一瞬/撞击面）**
- Kill 单站：38(d42×3)、44(2×d27)、55(5×d18)、96(40×d75)、128(Item27+10×d92)、177(20×d137)、471(d26)、572(15×d40)、836(3×d31)、873(perfect 267)、909(10×d1)、31(5×d32,落沙已有)
- 撞击面组（HitTiles+Item10）:83/84/180/302/577（:77649）
- A 低频：538(上升期 1/4+1/6)、576(d242 尾)、836 首拍(3×d31)

**已修勿重复报**：82(U+K)、55(A)、96(A)、128(A)、177(A)、288(A)、572(A)、577(A)、508(K)、1073(K)、811/814(A+K)、291/293/303/596/290(既有)。本批顺手修:DART_STYLE 596/814 残留泛色 trail 退役(曾双发)。

## 7. 边界声明

- 原版行号锚 1457;`AI_DisplayDoll` 区标签实为 AI() 巨方法体(:23404-54949),表内已按「AI()」理解。
- 扫描器盲区=变量尘站/aiStyle 独占支/else 兜底支,已人工核读的高危面见 §3;`581/605/920/926/937/590` 等变量尘派刀前**必须先核变量选择器**再钉值（纪律:先定谳再动刀）。
- 探针 stub ctx 里 Arrow 载体按 `{hostile:true,grav:0,life:600}` 构造,个别 boss 弹的出膛/宿主绑定面（537/573）在实机由宿主驱动,实态以仓内代码锚为准。
- 112/666(腐化者)为 NPC 实体非弹幕;27(aiStyle8 else 2×d6)本仓无射手,仅登记备查。

## 8. 清偿记录（2026-09-16 尘站普查批,本文档 §4 判定列已随刀更新）

**载体单口架构（本批定谳）**：敌弹两载体——`spawnHostileProj`/`shootDart`(RANGED_TABLE)→
Dart；`bossAI.shoot`→Arrow。**Dart 不路由 `Game.onProjectileDeath`**（Game.ts:554 注），
其 Kill 站/撞击面在 `Dart.killShooterDust` 单口承载；Arrow 载体 Kill 站在 `Arrow.killNow`
（Game.onProjectileDeath 既有面为 Arrow 口,两侧不重复撒）。A 站：Dart 在 `dartStep`
FX53 块续支,Arrow 在 `subStepAI` 普查批块（均在通用位移行前=pre-move 盒）。

**分级清偿计数（原 §6 缺失清单 → 全清）**
- HIGH 9 id（472/101/174/176/605/920/926/462/270）：A 站 8 支 + Carrier 投影 3 支
  （472/920/926 中 920 A=原版本无站,926 走 Arrow fade 键补齐）+ K 站 5 支全接。
- MED 16 id（115/129/573/537/468/501/622/452/454/719/922/1021/436/438/581/592）：
  A 站 10 支（115 三站/129 真站替换泛色/573 两站替换泛色/537 两站替换泛色/468 四站/
  622/719 三站/922 尘面）+ K 站 8 支（115/501/436/581/452/454/719/1021）+ Carrier 投影
  4 支（436/438/581/592 SetDefaults 盒/α/EU/首帧音;581 另 penetrate−1 穿透豁免）。
- LOW：Kill 单站 12 支（38/44/55/96/128/177/471/572/836/873/909/31——全 Dart 口;
  44/96/128 的 Arrow 口在 Game.onProjectileDeath 既有）；撞击面组 5 id（83/84/180/302/
  577——BULLET_KILL_SFX 组,Dart 口在 killShooterDust 头、Arrow 口 Game 侧既有）；
  A 低频 3 支（538 上升期门/576 五粒尾/836 首拍）。

**复核勘误（先定谳再动刀产出,原表误记随行注修正）**
1. `920` A 站不存在——AI 块 :56025 `type != 920 && type != 921` 明文排除,扫描器把外层
   type∈{605,920,921,926,937} 当尘站条件;920 首拍仅随机帧+Item154。
2. `926` 弹名/射手勘误——史莱姆女皇凝胶弹（NPC.AI_121_QueenSlime_GetDustColor 消费）,
   非 DD2;num70=4、num72=8、noGravity=1/2 掷、QueenSlime 色 A=150。
3. `115` 的 :26847 rand{15,57,58}/:26858 2×d107 两站实为 `type==173`/`type==132`
   专属（扫描器 cond 列本就正确,表行误并）;115 真站=首拍 20×d27 弹道排布+
   localAI[1]≥15 起 1×d27 + K 27 循环×2。
4. `38` K=10×d42（循环 num836=0..9）,非 ×3。
5. `468` K 已有真值——Game.onProjectileDeath 467/468 支（Item14+20 对 d27+速度轴环
   +gore）,普查表"无"系探针盲区（stub 无 onProjectileDeath 钩）漏判;弹名勘误=远古
   教徒 Clone 补射光珠（NPC 439-442）,非 Dr Man Fly（该 NPC 508 射弹 501）。
6. `452/454` 射手勘误——月总手/真眼幻影矢/球（SetDefaults aiStyle 82/83）,非猪鲨
   （猪鲨泡泡=NPC 371 实体）;K 原泛色 spawnParticles 退役,真尘站迁 Arrow.killNow。
7. `270` 弹名勘误——骷髅王头髅骨弹（bossAI.ts:140 skullBone 支）,非月主系球;
   873=光之女皇光鞭;590 域外、581=漩涡蜂后 426。
8. `438/592` 原版本无任何尘站（AI 仅 AddLight+fade）——Carrier 投影即终态。

**验证**
- `tsc` 零错（本批触碰面）;弹幕/尘族既有测试全绿（dart-npc-proj-dust-stations/
  dart-proj-styles/arrow-flight-trail-dust/boss-proj-ballistics/boss-hostile-proj-sim/
  dust-* 共 9 件 94 测试）。
- 新增 `tests/npc-proj-dust-census.test.ts`（28 测试）：逐站钉值（尘型/频率/参数/
  条件门）+ 探针盲区补测（537 宿主/573 蓄能/922 实心格/538 上升门/83 撞击面/各 Kill 站）。
- 探针 `scripts/_fx53-census.mjs` 复跑：**70 id 全表零缺失**——A 站全亮;死拍分桶相位
  修正（diedAt 原滞后一拍→Kill 尘全落 flight 桶）+ 未死者 force-life 走自然死亡口
  （K 站入可测域）。仍属盲区（以代码锚+vitest 判定）：537（宿主驱动,stub 无 NPC 411）、
  922（stub 世界无实心格）、83/84/180/302/577 撞击面（hitTilesFx 几何门,stub 无此钩）、
  538（上升期门 vy<0,探针发射向量恒 (6,0) 不入门——vitest 以 (1,−6) 上抛发射验证）、
  438/592（原版本无尘站=终态空）。
- HIGH 站实机截图（真 Dust 池渲染）：`/tmp/fx53c-472.png`（d30 尾焰 235 粒/26t）、
  `/tmp/fx53c-101.png`（d75 火焰尾 283 粒）、`/tmp/fx53c-462.png`（d229 幻影尾 540 粒）——
  探针 `scripts/_fx53c-shots.mjs`。

**登记（不在本批域,另账）**
- 922 的 AI_135 毁块面（KillTile 扩张环）未移植——本批只接尘面,格筛 num5 取
  fail:true 缺省档 3（零尘异型档=Game.killTileHitDustAmount 单源,Dart/Arrow 载体
  不可反向 import,登记近似）。
- 101 的 aiStyle23 timeLeft 钳 60/AI_023 位移段、462 的 aiStyle82 三段弹道、926 的
  penetrate=2、436 的逐 update penetrate-- 均为行为面,不在尘站批域（既有弹道账）。
- TownShot 域（§5）与出域面（§2）未动。
