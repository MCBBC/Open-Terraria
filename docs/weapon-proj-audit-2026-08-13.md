# 武器投射物族审计(2026-08-13,链球专项牵引)

起因:阳炎之怒(Sunfury,item 220)使用无效果。排查发现一串"近似实现/缺失",
本审计对照 Terarria1456 源码逐族核查,已修项与登记 GAP 如下。

## 已修(本轮)

| 项 | 根因/原版语义 | 落点 |
|---|---|---|
| 链球出生 1 帧即死 | `input.mouseDown` 是边沿消费量(use 后清零,无 mousedown 事件回填);channel 需电平语义 | `Input.mouseHeld`(新增,不被消费);Game.ts channel 回调改用之 |
| 链球行为=YoyoProj 近似(追光标) | AI_015_Flails(Projectile.cs:41051-41506)是状态机:0 绕体旋转(椭圆 R=37,向下 Y×0.8 再×0.5)/1 松手朝鼠标掷出(17px/t,直线无重力,15t 或 800px 上限)/2 回拉弹簧/5 撞墙坠落(0.4 反弹)/6 垂地悬荡/4 回收(无视碰撞);撞墙恢复系数按态 0.4/0.2/0(:40982);900×(1/meleeSpeed) 击杀门 | 新实体 `FlailProj`(WeaponProj.ts),每型号参数表 25/26/35/63/154/247/757/947/948/1058 |
| 链条=单色细线 | DrawProj_FlailChains(Main.cs:34752):型号→专属链贴图(25→Chain2/35→Chain6/63→Chain7/154→Chain13/247→Chain19/947→Chain41/948→Chain43-42-41 三段混排/757→Extra_99 六帧/默认 Chain3),球心→臂逐节步长=链节高、按光照着色 | `FlailProj.drawChain`;vanilla-atlas.mjs MISC 补 10 张链贴图 |
| 命中无灼烧 | StatusNPC(Projectile.cs:10555-11065):type 35 = 50% AddBuff(24 OnFire,300t=5s) | `tools/extract-projstatus.mjs` 提取全表(88 型号/97 条)→ `src/data/vanilla-projstatus.json` → `applyProjStatus()` 接入 WeaponProj/Arrow/WhipProj 命中 |
| 角色旁静态武器图标 | useStyle-通用分支 useSwing 会画持物;但链球族源码 `noUseGraphic = true`(Item.cs case 220) | Game.ts useSwing 门排除 spear/yoyo/flail/boomerang 四族 |
| 暴击率写死 4% | GetWeaponCrit = 4 基础 + 武器 item.crit + 装备/buff(Sunfury crit=7 → 11%) | useCombatWeapon 算 `critTotal` 注入四实体;hitEnemies 消费 |
| 武器浸剂不作用于投射物近战 | StatusNPC:10559 开头段:(melee||whip)&&meleeEnchant>0 → 按药剂施加 | `applyMeleeImbue()`(projStatus.ts),近战四族 meleeProj=true 命中消费 |

## 登记 GAP(未修,按优先级)

1. **AI_003 回旋镖近似**——✅已修(2026-08-13 行为层 1:1,见下"AI_003 终审"节)。
2. **AI_019 长矛简化**——✅已修(包络 1:1+终审销核,见下"AI_019 长矛重写"与
   "第九轮"节;`reach = min(170, 60+shootSpeed*12)` 系自造已废,正确 = 包络
   offset×shootSpeed,射程与贴图长无关)。
3. **AI_099 悠悠球近似**——✅已修(恒速+线长约束 1:1+终审销核,见"AI_099
   悠悠球重写"与"第九轮"节;射程公式 220+spd×10 系自造已废,正确 =
   Sets.YoyosMaximumRange 表+yoyoString×1.25+30+meleeSpeed 缩放,与 shootSpeed
   无关。线画直线 vs 原版 string 微垂仍近似)。
4. **StatusNPC 复杂块未入表**(提取器 SKIP 清单):598/636/971/975/614(ai[1] 定向 tag)、
   399-402 与 1107-1109(区间门)、frostBurn/magmaStone 配件门、setHuntressT2 套装门、
   15(remixWorld 分支)/85(ai 依赖)。whip 侧 tag 链已有独立实现(WhipTag),不缺。
   ——✅已修(2026-08-13 G7,见"第十一轮"节:ai1 定向/remix 族/85 ai0/694 套装门全入表,
   全表带 src 行号;SKIP 仅余 meleeEnchant/frostBurn/magmaStone 三块"无 type==N"运行时
   配件门,由 applyMeleeImbue/applyFrostBurn/applyMagmaStoneProj 承接)。
5. **Enemy 侧 debuff 字段缺口**(表数据已就绪,字段补齐即自动生效):
   30 Bleeding/36 BrokenArmor/44 Frostburn/137 Slimed/151 SoulDrain/153 ShadowFlame/
   169 BoneJavelin/183 StardustBleed/189 Daybreak/203 BetsysCurse/204 Oiled/323 OnFire3/
   324 Frostburn2/337 TentacleSpike/344 BloodButcherer/375 Hemorrhage。
   ——✅已修(16 字段全挂,见"第十一轮"节;69 Ichor/72 Midas 此前已挂)。
6. **MinionProj 命中路径未接 applyProjStatus**(随从/哨兵各家族 hurt 点分散;火龙 1106
   已有硬编码 ignite,与表重复但无害)。
7. **Arrow 路径远程武器 crit 未接**:Arrow 内暴击写死 4%;远程 GetWeaponCrit 同样含
   武器+弹药 crit(vanilla PickAmmo 不带 crit,武器 crit 生效)。
8. **FlailProj 细节**——✅已修(2026-08-13 行为层终审,见下"第十轮"节;余项 =
   heldProj/itemRotation 手臂指向=引擎级缺口,26/35 双球 flag5 反转受 channel 模型
   限制结构性不可达)。
9. **noEnchantments 门**(骷髅/旁支)未建模:浸剂/debuff 链对部分弹应豁免。

## 提取器

- `tools/extract-projstatus.mjs`:从 Terarria1456 Projectile.cs StatusNPC 段提取
  type→(chance, buff, durMin..durMax tick) 简单块;复杂块打印 SKIP 供人工核对。
  重跑:`node tools/extract-projstatus.mjs`。
- **概率两层结构**(2026-08-13 review 修正):cond 外层门 × 体内嵌套门组合;
  嵌套 `if (rand(K)==0) {A} else {B}` 双分支按 A=outer×1/K、B=outer×(K-1)/K
  (285/267/504/163 族 else 分支曾被错标 1/K);其余多 AddBuff+嵌套门形状防御性跳过。
- 裸 `Next(K)` 时长 = 0..K-1 tick(勿 ×60——潜伏错数学已清)。

## review 修正(2026-08-13 第二轮)

- 链条光照:lightAt 返回 **0..255**——不除 255 恒满亮(静默 no-op),已修。
- FlailProj 碰撞盒按型号:SetDefaults 247/757=34、947/948=20、1058=26、其余 22
  (此前写死 22×22,5 型号命中盒失真)。
- 弹墙计数:每次接触都计(localAI[0] 语义,:41001),>4 只是音尘门——
  只计 >4 会让缓磨墙永不触发卡死逃生。
- 鞭命中补武器浸剂(StatusNPC:10559 门含 IsAWhip)。

## 全量武器族审计第二轮(2026-08-13,/goal)

**AI_003 回旋镖重写**(Boomerang,原实现 6 处偏差):
- 出程无摩擦直线(原 0.985 摩擦+低速回收,飞行剖面完全失真);30t 定时回收(:434-438)/
  撞墙·出界(InWorld 10 格)回收
- 返回段 tileCollide=false 穿墙;目标速度制(num28=9 缺省/型号表 BOOMERANG_RETURN,
  加速 num29=0.4 异号×2,:532-660);>3000px Kill;与玩家 AABB 相交收手(:663-673)
- 旋转:出程=飞行向+π/4 定角,返回段自旋 0.4/t(:675-706)
- GAP:Phaseblade 垂落/383 追踪/182 圣骑士镖/301 按住 20t/106 光碟 45t 特例族

**AI_019 长矛重写**(SpearProj):伸缩包络 1:1
(GetSpearOffsetRelativeToPlayer :43417:伸出相前 2/3 num9 增长/缩回相后 1/3 num10 增长,
位移=offset×shootSpeed;SPEAR_PARAMS 21 型号 [num6,num7,num8];rotation +π/4/-π/2)。
原 sin 曲线+reach=min(170,60+spd×12) 自造公式全废。
- GAP:aiStyle 161 新短剑族(802/842/938-945)共用直刺近似(独立 AI_161 直刺不可转向)

**AI_099 悠悠球重写**(YoyoProj):参数链 1:1
(YOYO_RANGE/TOP/LIFE 三表 + meleeSpeed 双缩放(射程顶速 (1+3ms)/4、寿命 (1+ms)/2)+
yoyoString 射程 ×1.25+30/寿命 ×1.5;惯性 num7=14-top/2;死区 num9=5+top/2;
lerp 逼近 `(v×(num7-1)+dir×min(d/2,top))/num7`;超程 flag3 减速/1.3× 强制回收;
回收态 ×0.8/×1.5/穿墙/Kill<num8+10 或 >2000;寿命回收终态锁)。
原"加速度 0.55 追光标+cap"模型全废。Game 侧 stringLen/life 双轨计算已删(实体内统一)。

**⑩ autoReuse 边沿门时序修复**(并行会话新增的死门):
`_prevMouseDown` 原在 updateUse【之前】赋值(=本帧值),边沿 `mouseDown&&!prev` 恒 false
——非 autoReuse 武器(链球/回旋镖/悠悠球/长矛)全体掷不出。已挪到 updateUse 之后。
另:boomerang/spear/grenade/glowstick/shot 分支补 `mouseDown=false` 消费
(flail/yoyo/magic 原有)——同族一致。

**暴击链补齐**(GetWeaponCrit=4+武器 item.crit+装备):挥砍侧(原只有装备 crit)、
shot 兜底、投掷分支 ranged→melee 修正(1.4.4+ 投掷并入 melee)。

**探针**:_weapons-family-probe.mjs 7 断言(回旋镖恒速/30t 回收/收手/长矛刺满 80.8px/
悠悠球射程钳制/松手回收)。萤火棒 AI_014/170 已是深实现未动;弓枪(审计§6/§7)、
魔法(⑩ noAutoReuse 进行中)由并行会话推进。

## 完善第四轮(/goal 续):AI_003 特例族 + aiStyle 161 + MinionProj 挂点

- **AI_003 特例族落地**(36 型号全覆盖):
  - 182 圣骑士锤/866 飞刀:800px 内最近敌追踪,目标速度制(×12,轴步进 0.25,:264-360);
    无目标 ≥30t 回收。GAP:Collision.CanHit 视线门未接(仅距离门)
  - 106 光碟:45t 回收(非 30t,:180-186);返回 16/1.2
  - 301 Bouncing Shield:按住 20t/松手 100t 双门回收+速度归零(:437-452);
    返回 15/3、6000px Kill;新增 channel 回调(Game 仅 301 注入)
  - 383 附魔飞刀:10t 后 vy+=0.5(上升再+0.35)/vx×0.95;>800px 回收(:263-277)
  - 320 冰回旋镖:10t 后下垂(:263-268)
  - Phaseblade 族(IsAPhaseblade :27 = 1059-1072/1074-1076/1101/1102,共 18 型号):
    前 30t 自旋,之后 vy+=1/vx×0.96 垂落(:190-232);返回 40/3 高速穿墙(:527-531)
  - 其余(6/19/33/52/113/272/333/867/902/1000/1052)= 默认 30t 无摩擦直线
- **aiStyle 161 细剑族**(RAPIER_PROJ 10 型号,802/842/938-945):AI_161_RapierStabs
  1:1——线性外伸 velocity×(t-1)(:44987-45006,与 AI_019 包络完全不同),16t 消失;
  挂 SpearProj 直刺分支。GAP:opacity 淡入淡出视觉未接
- **MinionProj StatusNPC 挂点**:6 处 hurt 点接 applyProjStatus(GAP 清单第 6 项销核;
  TigerPounce 是召唤物本体攻击非投射物,不适用)
- **测试**:weapons-entities.test.ts 旧断言按新语义修正(回旋镖直线射程内摆敌/
  长矛新签名 spd 真值/YoyoProj 陈旧第 9 参清理),新增特例族 6 测试——**10/10 全绿**;
  探针 7+10 回归全绿

## 完善第五轮(/goal 续):视线门/细剑视觉/Enemy DoT 五系/互斥组语义

- **追踪视线门**(182/866):canHit(LineOfSight 1:1)接入目标搜索(GAP 销核)。
- **细剑族视觉**:rotation=atan2+π/2(无 π/4);Opacity 淡入 0→7/淡出 16→12
  (:44993)——drawProj 加 alpha 参数。
- **Enemy 新增五系 buff 字段**(UpdateNPC_BuffDOT 逐条核值):
  Frostburn(44)=8HP/s、Frostburn2(324)=25HP/s、OnFire3(323)=15HP/s、
  ShadowFlame(153)=15HP/s、Oiled(204)=六火系 DoT 翻倍(:93728-93731,含 cursed);
  SUPPORTED 表挂接——**21 条 StatusNPC 条目自动生效**(寒霜箭/暗影焰鞭/贝希火系等)。
  GAP 余:189 Daybreak(层数模型,需太阳耀斑 636 投射物计数)、30/36/137/151/169/183/
  203/337/344/375 仍无字段。
- **★互斥组(mut)语义修正**(又一概率拍平坑):StatusNPC `if(rand){A}else{B}` 是
  单掷骰二选一必中其一;此前两条独立掷骰会双落空/双中(163 族 pick(0.9) 曾双空)。
  提取器给 twoBranch 标 mut id,运行时同组单掷按累积 chance 区间判定。
  测试 proj-status-table.test.ts 5 断言(35 概率/63 区间/新四系映射/163 必中/504 外层门)。
- **回归**:三测试套 18/18 全绿。

## 第六轮(/goal 续):冰霜盔甲引擎 + ★提取器 targetId 根治("铜剑变投掷")

**"铜剑变投掷"根因链**(用户报告 2026-08-13):
1. 铜短剑 3507 走 `SetDefaults1(6)` 模板(Item.cs:31381+1377-1392),模板带
   shootSpeed 2.1/noMelee/autoReuse=false——**提取器漏提模板三字段**;
2. 漏提根因:`extract-itemcombat.mjs:210` 的 `targetId = dl.match(/\d+/)` 对
   "SetDefaults**1**(6)" 抓到**方法号 1** 而非模板号 6 → 3507 继承了 item 1
   (铁镐:autoReuse=true、无 shootSpeed)——autoReuse:true 之谜同解;
3. spd 缺 → combatWeapon 默认 8 → 细剑位移 8×15=120px(原版 2.1×15≈30px)
   → 剑"飞出"7.5 格 = 投掷观感。
修复:提取器 targetId 改取括号内数字(`/\((\d+)\)/`)+ SpearProj spd 兜底 +
EXTRACT_PATCH 七金属短剑(3483-3519)三字段补丁(提取器修复后冗余无害)。
**重提 diff 44/2612 全部方向正确**——顺带治好:2778 族(旧继承 item 3 土墙模板!)
→ 正确继承火箭族 2773;3480 珍珠木弓(旧缺 shoot/useAmmo=弓静默失效)→ 拿回
木弓 99 模板。探针 `_shortsword-probe.mjs` 6 断言(spd 2.1/位移 29.4px/16t/单发)。

**冰霜盔甲引擎落地**:套装表 Frost 加 frostBurn 标志 → equipStats → 三挂点
(挥砍/WeaponProj 近战四族/远程箭 frostEligible;魔法召唤弹不吃)→
StatusNPC:93712-93716 命中 Frostburn2(324) 5-14s。
magmaStone 门依赖配饰实装(岩浆石 1322 未实装),登记。

## 第七轮(/goal 收尾):铜短剑视觉修复 + 三 buff + 链球细节 + 全量 review

**铜短剑二连修(用户第二轮报告"抛出效果")**:根因不在数据在视觉——
短剑族(aiStyle 161)SetDefaults1(6) 模板【未设 noUseGraphic】(=false),
使用期间玩家【必须画手持剑】(useStyle 13 突刺持位,:50423-50446);
此前 useSwing 排除门随 spear 整族误排除 161 → 玩家空手+剑贴图独立飞出=抛出观感。
修复:门细化(spear 仅排 aiStyle 19)+ heldUseStyle 对 161 推断 useStyle 13
(itemfunc 提取缺口兜底)+ useSwing 传 aim。探针加持械姿势断言,7/7。
**教训:noUseGraphic 排除必须按"是否真设了 noUseGraphic"逐族核,不能按 kind 一刀切。**

**剩余 GAP 清理**:
- BrokenArmor(36)/BetsysCurse(203):受击无视 20/40 防(NPC.cs:81919-81924
  armorPenetration += 20/40)——Enemy.brokenArmorT/betsysCurseT 进 hurt 穿甲链
- Daybreak(189):单层 100 HP/s 近似(层数模型=场上 636 太阳耀斑计数,repo 无 636
  实体,登记);Daybreak/SoulDrain 等剩余 8 buff 低频或需专属机制,静默跳过
- 链球撞墙音(SoundID 0=playSfx dig,:41045);948 火焰重锤入水变形 947(:41069-41072)
- SUPPORTED 现 15 项(24/20/70/39/31/69/72/44/324/323/153/204/36/203/189)

**全量 review(/goal 要求)**:
- tsc 37 错误全部位于并行会话活跃区(spawner 私有化 18/townNPC 接口 11/
  wldParser 1/成就 3),本系列改动文件零错误
- 测试 29/29(6 套)、探针 24 断言全绿(shortsword 7/sunfury 10/family 7)
- mut 组 O(n²) 内循环可忽略;Arrow.frostEligible 不入联机序列化(伤害归
  拥有者客户端,可接受)
- 教训沉淀:①提取器模板/委托必须打印继承链对账;②近似常数一律核源码量纲;
  ③排除类逻辑按原版字段逐族核,不按 kind 一刀切;④边沿检测 prev 快照在消费后;
  ⑤并行会话改动后全族回归

## 第八轮(/goal 续):AI_003 行为层终审(GAP#1 销核)

逐段对照 `AI_003_Boomerang`（Projectile.cs:36623-37352）重写 Boomerang 四段,销核 GAP#1:

- **回收门三处独立**(此前只撞墙+计数两门,且撞墙语义错):
  - 命中敌 → Projectile.Damage :12278-12291:出程**速度反转 + ai[0]=1**;豁免
    301/866/902/光刃族。`hitEnemies` 加可选 `onHit` 回调(第 7 参)承接。
  - 撞墙 → HandleMovement :18103-18161:**33/106/866 分轴反弹不回收**(:18142-18151,
    荆棘轮/光碟/飞刀撞墙弹开的签名行为,此前被错写成"撞墙即回收");光刃转悬停
    ai[0]=2(:17975-17990,独立 else 链无挖掘音);其余 ai[0]=1+速度=-lastVelocity,
    **383 豁免取反**(:18156)。
  - 计数门 per-type(表在 WeaponProj.ts 头注)。
- **106 光碟 45t 门是影子死代码**(:36794-36799 独立 if 位于类型链之前,链尾
  else if(ai[1]≥30) :37082-37087 未豁免 106 → 先触发)——实际回收点=30。旧测试
  名"45t 才回收"是把死代码当活门,已改。
- **extraUpdates 建模**(SetDefaults 182/866=1、301=2;Update :15336-15339):
  AI+移动每 tick 跑 1+extra 次,计数门按 AI 次计——301 按住门实为 7t(非 20t)、
  松手门 34t(非 100t)。光刃返回段动态 extraUpdates=dist/3000(+1(1074),上限 20,
  :37211-37221)一并落地。
- **383 返回段专属加速式**(:37237-37247 沿(目标速度-当前速度)方向加速
  min(num29,差距长),非通用轴步进);**旋转尾段 1:1**(:37294-37352:缺省族两段
  自旋 0.4×direction 非"飞行向+π/4 定角"、106 0.3、866/383 对准飞行向、301 出程
  +π/4/返回自旋)——direction=掷出瞬间玩家 facing(Game 第 8 参注入)。
- **penetrate 链**(:13175-13182/:15866-15868):182=10 次命中消亡;866 特例
  (:13124-13137)五击后复位 1+伤害归零不消失。
- timeLeft 900→**3600**(SetDefaults :526 缺省,旧值自造);同敌命中冷却 20→10t
  (NPC immune[owner]=10,:13172-13174);掷出呼啸 Item7 节奏 8t/301 10t(:36626-36651)。
- **866 计数源修正**:无目标回收门计数在 localAI[0](:36999)非 ai[1](被目标索引
  占用)——复刻时若用错计数源,该门永不触发(首版即踩,测试拦截)。
- 回归:weapons-entities 24/24(新增 8:三门各一+悬停+penetrate+866 两门);
  weapon-census/thrown-physics/thrown-weapons/vi-weapons 全绿;探针
  _weapons-family-probe 6 断言全过(返回段收尾速度 9.1≈目标速率 9)。
  tsc 本批文件零错(全仓存量错误均在他会话活跃区)。
- **遗留偏差**(行为层收口后余项):光刃"再掷召回门"(:36758-36764)需 Player
  controlUseItem/releaseUseItem 语义未建模;106 LightDisc_Bounce 溅射粒/301 冲击波
  /383 HitTilesInACircle 视觉未接;per-type 尘为色/率近似;301/383 命中改写
  direction/182 spriteDirection 翻面、Item7 -0.33 变调未建模(引擎无 pitch)。

## 第九轮(GAP#2/#3 终审):AI_019 绘制朝向 + AI_099 四处细节

对前批"长矛/悠悠球重写"逐行回源复核,销核 GAP#2/#3,另抓出 5 处真偏差:

- **★AI_019 绘制朝向写反(最重,视觉)**:绘制权威 = DrawProj_Spear 专支
  (aiStyle 19 全族走它,Main.cs:34153-34157 按 aiStyle==19 派发;:34659-34668):
  `num = atan2(vy,vx)+2.355;theOwner.direction>0(玩家朝右)→ dir=FlipHorizontally
  且 num -= π/2`。原实现把翻转条件写成 dx<0 且丢 mirror——右刺纯数值巧合仍指正右
  (β+θ 恰抵消),**左刺矛头指 φ-π/2(正下)偏 90°**。提取 `spearDrawAngle()`
  纯函数(draw 与测试共用)。**考古**:原版用字面量 **2.355f 非 3π/4(=2.35619)**,
  自带 0.0012rad≈0.068° 近似差——实现按源码保留字面量,测试容差 ≥0.0015。
  AI 侧 rotation 赋值(:43271-43276,:43214 spriteDirection=-direction)与该专支同值。
- **AI_099 旋转速率**:0.25 → **0.45/tick**(:65203-65209;0.25 系自造)。
- **AI_099 击退方向**:sign(vx) → projectile.direction 语义(AI_099 ChangeDir 段
  :64925-64935:球在玩家右侧>2px→1/左侧→-1,±2 死区保持)。
- **AI_099 目标点双重钳制补第二重**(:65038-65050):光标钳 range 后,目标点变化
  时再钳 **range-1**(防贴射程边缘抖动);逼近段用这份 ai[0]/ai[1] 存量(原版语义),
  实体新增 ai0/ai1 字段。
- **AI_099 无限寿命型号 tick 上限摘除**:life=7200 硬上限仅留给有限寿命型号;
  Sets.YoyosLifeTimeMultiplier 缺省 -1(:185)的型号(547/550-552/554/555/603 等)
  life=Infinity——原版 timeLeft=6 每帧刷新(:64942),可永久滞留直至松手回收。
- **★SpearProj 命中盒型号表**(SetDefaults 逐 type):46=20、130=22、342=**22×2
  薄刃**(源码 :4045-4050 真值,勿当提取器错值)、877-879=25、其余 14 型号=18、
  161 细剑族全 18。原恒 20×20 → 14 型号命中盒失真。drawProj translate y 改用
  e.h(非方形型号中心修正,方型实体无感知)。

**对账通过(零差,前批已对,本轮复核)**:GetSpearOffset 包络公式+21 型号参数表
(:43417-43540)、YOYO_RANGE/TOP/LIFE 三表 vs ProjectileID.cs:187/189/185(21/21、
21/21、15/15 全对,缺省 200/10/-1)、yoyo 16×16+extraUpdates=0(:5735-5740)、
活跃/回收态主链(0.98 顶速衰减/flag3×0.5 四向/lerp(num7-1)/死区×0.8/回收 ×0.8
取整×1.5/num8+10·2000 Kill 门)、命中冷却 10t(yoyo 未设 usesLocalNPCImmunity →
NPC immune[owner] 全局 10t)、dur 传 useTime 等价(17 款长矛 useTime==useAnimation
全核)、AI_161 直刺/16t/opacity 双 GetLerpValue、细剑 π/4 补偿与左刺镜像
(:44990/:32444/:29827)。

**自造公式溯源结论**(GAP 清单原文):`reach=min(170,60+spd×12)` 与
`220+spd×10` 均**系自造,已在前批废除**;正确链 = Sets.YoyosMaximumRange 表 +
yoyoString ×1.25+30(:64968-64970)+ ÷(1+meleeSpeed×3)/4(:64974)。射程与
shootSpeed 无关(悠悠球射程是型号常量)。Game 侧 stringLen 第 6 参已标废弃死参。

**遗留偏差(GAP#2/#3 余项,登记)**:
- DrawProj_Spear origin(朝右 origin.X=贴图宽,朝左 0;repo 绕中心)+ Extra_98
  拖尾光效(46/105/342/153 四色,:34681-34733)未建模
- AI_019 特殊弹型:130→131 周期自机弹/730→732/342→343/222→228/367→1107-1109;
  877-879 alpha 淡入+channel 延长动画(SetDummyItemTime,:43238-43245/:43279-43282)
- GetExtensionHitbox(:43530)玩家近战延伸命中盒(105/46/153 加宽)未接
- AI_099 flag(多悠悠球并存:死区+20/寿命加速/速度维持 :64827-64836):Game 单枚
  门禁(同型号在场不重复掷出)下恒 false,与原版单枚行为等价
- AI_099 flag2 = type 556-561/1079 配重球不占 heldProj(:64913-64918)——
  CounterweightProj 本就不设,等价;603 每 6t 生成 604、magicString ai[0]=-3/-2
  自由坠落态、stoned/frozen channel 门、玩家死亡 Kill、
  AI_AdjustPlayerItemRotationToFaceProjectile 指向(★2026-08-13 回源:悠悠球
  noUseGraphic(Item.cs:30033)原版不画持物、useStyle 5 也不设复合臂
  (Player.cs:50339-50422)→ 该调用对本族无可见消费,非缺口;可见消费族
  已实装,见链枷段⑤与 src/render/heldProj.ts 头注)
- 探针 _weapons-family-probe 本轮因**并行会话 Game.ts 在途报错**(页面进不了世界)
  无法执行;其 6 断言中长矛"刺满≈80px"(49 型号 80.85px)与悠悠球射程钳制两项
  已由 weapons-entities 新测试等效锁定(vitest 34/34 全绿)。

## 探针

- `scripts/_sunfury-probe.mjs`(10 断言):掷出/椭圆旋转(min 14.8=R×0.4, max 37)/
  channel 存活/无静态图标/暴击 11%/OnFire 5s/掷出初速 17/链贴图加载。
  `SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_sunfury-probe.mjs`

---

## 第十轮(GAP#8 终审):AI_015 五项细节回源补齐(2026-08-13)

对 FlailProj 逐段回源 AI_015_Flails(:41051-41505)/AI_015_HandleMovementCollision
(:40976-41049)/AI_015_Flails_Dust(:41740-41785),销核 GAP#8:

- **①ChangeDir 接入(六态)**:case 0 = 朝鼠标侧(:41195-41201,`vector5.X>0?1:-1`,
  channel 判定之前,掷出 tick 同帧生效);case 1(:41261)/2(:41296,仅未再按支)/
  3(:41328)/4(:41349)/5(:41364,else 支)/6(:41380)= 面朝球
  (`player.Center.X < proj.Center.X ? 1 : -1`)。落点 = `player.facing`
  (Player.fixedUpdate 先于实体循环,同 tick 渲染生效,与原版时序同构)。
  旋转锚由"鼠标侧近似"改为直接消费 ChangeDir 结果(:41218-41227 vector6 用
  player.direction)。**附带真偏差修复**:case 1 再按目标态 **3→6**(:41238)——
  1456 的 case 3 在 AI_015 内无任何入口(ai[0] 全部赋值点 :41204/41238/41251/
  41275/41292/41355/41370 无 3)= 死状态,此前误接 3 导致"飞行中再按球悬链不落地"。
- **②特殊弹型三组对账**(Game 侧 spawnProj 回调已接,本轮补时序/朝向):
  - **757→928**(:41236-41259,气泡 :41241-41246/:41253-41259):仅两过渡点(再按→6 速度×0.2 / 超时→2 ×0.3),
    气泡速度 = 衰减后 ×1.3、damage/knockBack 满额。此前 trans757 缓存到帧尾 =
    迟 1t 且位置已积分,改当场生成(bubble757 助手)。
  - **247→248**(:41435-41478,搜索 :41450-41465/生成 :41468-41475):20t 节奏(脱靶续 17)/命中归零/600px 内最近敌
    (CanHit)/速 14/damage÷1.5/kb÷2——数值已对;本轮补**旋转专属式**
    (flag=false :41437 通用段跳过):rotation ±=(|vx|+|vy|)×0.01 按向,
    旋转态再 +2π/15×direction(:41438-41442)。
  - **1058→405**(:41384-41434):3-5t(旋转态 Next(3,6))/6t(垂链·悬荡)/4t(其余)
    朝玩家反向 ±π/4、速 Next(45,65)/10、damage 满额、旋转态 kb×0.5、ai0=-10——
    已对;本轮补**旋转专属式**(:41397 rotation 恒指玩家-π/2)+**击退方向**
    (:41398-41405 反 player→球 向)+**出场淡入**(SetDefaults alpha=255 :9719,
    每 tick -50 至 0,:41386-41394)。
  - **★FlaironSpike(405)两视觉错位修复**:α 映射方向写反(Main.cs:28965
    `(255-alpha)/255`,原实现直接 alpha/255 = 出生全显、越漂越透明);
    scale=ai1(:29237)是贴图缩放,原实现改 w 会让绘制中心随缩放偏移 → 改走
    drawProj drawSize 参。
- **③948 入水变 947**(:41064-41067):语义回源确认 = **FlamingMace→Mace 熄火**
  (非青蛙枷);`wet && !lavaWet` = 任一液体(水/蜂蜜/微光,Collision.WetCollision
  :1608 liquid>0)且非岩浆(:15456-15459)——原实现 `liquidType!==2` 语义正确,
  本轮收拢为 inLiquid 助手并注明 wet 判据行号(阈值 64 近似表面偏移 :1613-1616)。
  变型在 switch(type) 参数提取之前 → 同 tick 起 947 参数(两型参数表一致,无感);
  火尘开关随 projId 自动切换。附带补 case 6 微光重力豁免(:41374-41376 !shimmerWet)。
- **④掷出撞墙 CreateImpactExplosion**(:41014-41033 → :66367-66412/:66452-66500):
  - 位移回卷 `position -= vector`(:41024)——撞墙 tick 不陷墙(原缺);
  - num2 音尘档收拢(:40985-41033):|lastV|>4 按轴置 1 / 掷出态**强制 2**(:41021,
    无视速度门)→ num2 次 HitTiles 尘 + **一次** SoundID 0(原按轴各播一次会双响,
    且掷出态撞墙可能一声不响);
  - 冲击波两连近似:①CreateImpactExplosion 逐格块色上抛尘 → 尘团;②8 颗椭圆
    (7×0.7)白尘环沿撞前方向偏置 → spawnBurst yMul 0.7 定向半环(入墙半环原版
    本就被块遮住)。逐格块色/定点椭圆环为粒子系统级近似,登记。
- **⑤heldProj/itemRotation**(:41496-41501 `heldProj=whoAmI`+`SetDummyItemTime(2)`+
  `itemRotation=DirectionFrom(mountedCenter)` 球在左侧 +π):**2026-08-13 回源纠偏
  +渲染层实装**(src/render/heldProj.ts + Renderer.drawPlayer 单点接入)——
  原登记"链球族 noUseGraphic 门下角色空手"是误读:链枷(Item.cs:3321)/悠悠球
  (:30033)/DefaultToSpear(:47648)/DefaultToWhip(:47451)四族 noUseGraphic=true,
  原版 DrawPlayer_27_HeldItem 有 !noUseGraphic 门(PlayerDrawLayers.cs:3192)
  → 四族持物贴图原版**也不画**;且 useStyle 5 分支只写 itemLocation 不设复合臂
  (Player.cs:50339-50422,唯一跟随 itemRotation 的臂是 useStyle 13 :50443-50445),
  链条锚点纯 bodyFrame 推导(Main.cs:37071-37091)→ 四族"手臂恒定姿势"与原版
  一致,非缺口。itemRotation 唯一可见消费 = 画贴图的通道武器,与本仓实装交集
  唯一 = 食人鱼枪 1156→190(aiStyle 39 尾部 :26313):已实装(aim 覆写 + swing
  过期合成 = SetDummyItemTime 渲染侧等价 :26086),探针 _heldproj-probe 9/9
  (指向角 err=0)。
- 击退方向 1:1(:41479-41482 `velocity.X>0?1:-1`,vx==0 → -1;原 `sign(vx)||1`
  把零速档写成 1)。
- 测试:weapons-entities 42/42(新增 8:ChangeDir 两态/757 两过渡时机与速度/
  247 首掷恰 20t/1058 首掷 3-5t+方向±π/4+伤kb/948 水变岩浆豁免/撞墙回卷+单响
  dig+冲击波);vi-weapons/thrown-physics/thrown-weapons/weapon-census 共 65/65
  全绿;tsc 本批两文件零错(存量错误均在并行会话活跃区)。

### 第十轮登记偏差(余项)
1. ~~heldProj/itemRotation 手臂指向(⑤,引擎级,同悠悠球侧合并)~~→ 已处置
   (2026-08-13):回源证伪"手臂指向"前提(见⑤纠偏),可见消费族(食人鱼枪)
   渲染层实装;余留真缺口仅两项——①SelectedDrawnProjectile 绘制层分层
   (PlayerDrawSet.cs:263-269 → projectileDrawPosition,PlayerDrawLayers.cs:3152/
   3874/4306):连枷/悠悠球/长枪 DefaultToFlail/Yoyo :10142-10158 与
   DefaultToShortsword :10165-10167 均 drawLayer=7,原版插在持物后/前臂前,
   本仓投射物恒整体画在玩家身后(纸娃娃单层帧无"前臂前"插槽,结构性不可达);
   ②gfxOffY 未入指向角 y 项(:21178)——仅矿车骑乘下食人鱼枪受影响,亚像素级。
2. 26/35 双球 flag5 反转(:41174-41191 方向取反 + 掷出速度 X 翻转 :41207-41209)——
   本仓 channel 绑定手持物品 id(换手即掷出),双球并存结构性不可达。
3. CreateImpactExplosion 逐格块色尘/定点椭圆环为粒子近似(份数/形状,音效已 1:1)。
4. 247 弹墙计数与气泡计数共用 localAI[0](原版自身如此,弹墙会加速气泡节奏);
   本仓分列 subT/bounces 两字段,未复刻该耦合(更稳,差异仅在弹墙期间节奏)。
5. Game 侧 248 花瓣 life=1200(SetDefaults aiStyle1 缺省 timeLeft=3600)、射出音
   Item17 未提取——Game.ts 热区未动,登记待后续批。

---

## 第十一轮(G7):StatusNPC 复杂块入表 + Enemy 16 字段全挂(销核 GAP#4/#5)

**提取器四类新形状**(tools/extract-projstatus.mjs,全部带 src 行号入 JSON):
- **ai1==i 定向族**:cond 拆 `ai[1] == (float)i` 记 gate——598→169(:10687)/
  636→189(:10691)/971→337(:10695)/975→344(:10699)/614→183(:10727)。
  时序实证:StrikeNPC :12421-12427 `aiStyle==113 && ai[0]<2` 先写 `ai[1]=victimIndex`
  再于 :12757 调 StatusNPC → **首击恒真**;repo 附着弹无追踪态,单次命中语义等价恒真。
- **remix 局部变量族**:`int numN = C; if (Main.remixWorld) { numN = ALT; }` 取基档 C,
  ALT 记 gate——15→24 @1/2 300t(:10907)/954→24 互斥双分支(:10743)/979→44(:10770)。
- **85 ai0 三元**:`int num6 = ((ai[0] == 1f) ? 324 : 323)` 取 else 档 323(:10997),
  ai0==1→324 记 gate(附着态档)。
- **setHuntressT2 套装门**:694/695/696→204 Oiled 240-510t(:10786),gate 运行时校验。
- 表 98 型号/107 条 → **110 型号/121 条**;SKIP 13 → **3**(全为"无 type==N"配件门)。
  **15/85 旧手工块删除**(projStatus.ts),改表驱动(行为等价,且补上 buffImmune 门)。

**运行时门接线**:applyProjStatus 增可选 ctx;`gate==='setHuntressT2'` 未穿套装不施加。
套装旗标链:SUMMON_SET 增 huntressT2 键 4 条(205|202|146/147、212|206|154/155,
Player.cs:16119-16122/:16145-16149)→ Player.equipStats.huntressT2 → MinionProj
爆炸机关命中点按"塔 691-693 → 爆炸弹 694-696"(AI_138 :66063-66073)传 ctx。

**Enemy 16 字段效果对照**(NPC.cs UpdateNPC_BuffApplyDOTs :92577+,lifeRegen=2×HP/s;
穿甲 checkArmorPenetration :81912-81945):
30 Bleeding 12HP/s(:92592)/36 BrokenArmor 穿 20 防(:81919)/44 Frostburn 8(:92648)/
137 Slimed 六火系翻倍(:92623 等 6 处)/151 SoulDrain 25(:92927)/153 ShadowFlame 15
(:92712)/169 BoneJavelin 3HP/s·层(:92740)/183 StardustBleed 20HP/s·层(:92846)/
189 Daybreak 100HP/s·层(:92807,零层兜底 1)/203 BetsysCurse 穿 40 防(:81922)/
204 Oiled 见下/323 OnFire3 15(:92632)/324 Frostburn2 25(:92668)/337 TentacleSpike
3HP/s·层(:92761)/344 BloodButcherer 4HP/s·层(:92786)/375 Hemorrhage 100(:92604)。

**★Oiled 语义修正(第五轮"翻倍"系误读)**::92728-92737 真身 = 六火系任意在身时
【单块 flat 再叠 -50 = +25 HP/s】,非按系翻倍——旧 `oiledMul=2` 在单火系时算 30
(真值 40 的另一种错)、多火系并存时按系重复叠(双系 90 vs 真值 65)。现独立
oiledDoT 累加器单次结算。同时 Slimed(drippingSlime)翻倍从仅 onFire 扩到全六系
(:92633/:92643/:92655/:92667/:92684 五处旧漏)。

**测试**:tests/projstatus-g7-debuffs.test.ts 27 断言(16 字段逐条 DoT/穿甲 +
12 新表条目 deep-equal + 全表 src 区间护栏 + 15/85 表驱动 + 694 门双态)全绿;
proj-status-table/extract-audit/buff-r2-imbue/piranha-proj/weapons-entities/
npc-drops/hostile-proj-player-hit/npc-liquid 回归全绿;tsc 本批文件零错。

**遗留偏差(登记)**:
- 层数模型四族(189/169/337/344/183)= 场上附着弹计数(636/598/971/975/614 的
  ai[0]==1&&ai[1]==whoAmI),repo 无附着态 → 单层近似(189 另有零层兜底 1)。
- 151 SoulDrain 玩家侧联动(魂镰 3006 持械挥击 player.soulDrain++ 计数,
  :91952-91979)依赖魂镰实装,只接 DoT 数据面。
- 85 ai0==1→324(Frostburn2)与 15/954/979 remix 档未跟踪(秘密种子/附着态恒 false)。
- setHuntressT2 的机关冷却档 90→60/30(GetExplosiveTrapCooldown :66109-66119,
  需 setHuntressT3 旗标)未接。
- 1104 鞭 buff24 条目(:10602)提取器给了 chance 1,原版门 = ai[0] 窗口+鞭尖
  50×50 盒(:10633-10647)——现状略过量施加(3-5s OnFire),登记待鞭尖窗口建模。

---

# 自动检查四件套(2026-08-13 落地,/goal)

四类历史 bug(巨石孤格/提取器错基底/自创衰减/共享链截胡/取帧落空)的自动拦截体系:

## A. 世界不变量扫描器(src/world/audit/)
- R1 `framed-multitile-incomplete`(error):多格 framed 每活跃格须属一个 w×h 全同矩形
  (锚点无关算法,兼容"帧全 0 家具形态"与"分片帧形态");抓 PlaceTile 缺角族
- R2 `framed-frame-offset`(warn):帧分片类型矩形内帧值互异(重复=重画锚点帧)
- 豁免表 exemptions.ts(10 条,全部带原版依据+移除条件):矿轨/多 style 表/
  丛林高草(Height34)/宝石树苗(带宽标记)/灯笼(双轴)/海燕麦(单格写入 cs:58333)/
  掘地龟蛋(单格存储)等**存储形态差**
- 集成:tests/world-invariants.test.ts 双层——合成用例(10,秒级)+ 真实生成集成
  (FRAGMENTS 白名单+计数基线:残片类已知不阻塞,**新类型/同类暴增必红**)
- 负向验收:注入式(生成后抠巨石格→R1 必报,种子 9293480 陷阱路径不可达的教训)
- **集成首跑即抓到 9 类疑点**:海燕麦形态差(原版单格)/陶罐·祭坛·雕像·生命水晶
  残片(放置端完整,后续 pass 半拆——KillTile 整块清语义未接通,二期专项)/
  186/187 多带表帧语义

## B. 素材自洽 lint(tools/atlas-lint.mjs,vite 插件 atlasLintAuto)
- ATL-01..07:PNG 缺失/帧网格越界(与 vframeAt 同式)/grid>stride/framed 帧格/
  def↔meta 脱节/def 尺寸≡frameSize(豁免 3 条带依据)/孤儿图
- 753 表全自洽 0 error;行级正则带 ≥700 基数护栏防 tiles.ts 格式漂移失明
- **4 处存量错配逐条裁决**(TileObjectData.cs):树苗 fh:1→2 已修;丛林高草/
  宝石树苗/灯笼进豁免(Style1x1Plant_Height34/3-style 带宽/双轴语义)
- 双消费:vite dev 警告+build 阻断 / tests/atlas-lint.test.ts(5,TS 原生强校验)

## C. 提取器自审计(--audit 子命令,与提取同源)
- itemcombat:anomalies(X-01 自委托/X-02 无靶/X-04 委托基数<20=bug#2 发生机制)+
  pinned(3507 铜短剑/3509 铜镐 deep equal——错基底必翻);ROOT 绝对路径已修
- projstatus:{types,entries,skipped}+跳过数护栏 25
- tests/extract-audit.test.ts(6):常跑层(不依赖 C# 源)+审计层双层
- 负向验收:targetId 正则还原 bug#2 原样 → 审计层红(常跑层不红=JSON 未重生成
  场景由 pinned deep-equal 捕获,双层设计按预期)

## D. 探针一键 runner(tools/run-probes.mjs)
- `--boot-server`:自动起私有实例(5300-5399 空闲探测,SW_NO_HMR/SW_CACHE 独立,
  跑完 SIGTERM→SIGKILL,绝不碰共享 5199);`--only/--list/--timeout`
- 收编 5 存量探针(解析统一输出协议,零改动)+ 新增 2:
  - _usereach-probe(使用链可达矩阵:镐→tryMine>0/斧/短剑——**共享链截胡通用捕手**)
  - _invariants-probe(浏览器侧全图 auditWorld,与集成测试同白名单)
- 负向验收:剑分支还原 bug#4 原样 → mining+usereach 双红

## 基线与用法
- 测试:6 套 40/40(world-invariants 11/atlas-lint 5/extract-audit 6/weapons 10/
  proj-status 5/critter 3)
- 探针:7 全 PASS(36 断言)
- 日常:`node tools/run-probes.mjs --boot-server`;vitest 全量含集成(单种子 ~13s,
  SW_AUDIT_SEEDS 扩展)
