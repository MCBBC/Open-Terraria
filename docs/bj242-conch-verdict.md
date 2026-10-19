> ★入库注(BJ249,2026-09-21):证据原件在 `/tmp/bj242-evidence/`(VERDICT.md/probe_bj242.mjs/rig_conch_teleport.py/rig_output.txt/shot-right-ocean-landing.png,/tmp 易失),本档为入库副本,与原件逐字一致(仅头部加此注)。

# BJ242 定谳+分歧注册备案（2026-09-21）

用户 2026-09-21 拍板：右海洋传送友好化（明令分歧,补偿式内移重试）。先经三路实锤 BJ240
「原版本相」证据链,全部通过后落刀。物证地图 = /tmp/bj240-evidence.wld（勿外传）。

## 原版本相（BJ240 判据,本轮三路独立复核通过）

- Player.MagicConch（Terarria1457/Terraria/Player.cs:56755-56819,1458 同域 diff=same）
  双尝试序:首选对侧洋（flag=玩家在左半 → rightOcean=true）、败回同侧（!flag）。
  ToDirectionInt（Utils.cs:2131）true→+1/false→-1;爬向配对恒:rightOcean⇔crawl=-1（向内）。
- TeleportHelpers.RequestMagicConchTeleportPosition（TeleportHelpers.cs:49-239,1458 diff=same）
  起点 x = rightOcean ? maxTilesX-40 : 40,y=50;唯二调用点=MagicConch 内 56785/56788,
  无第二路径、无 mixin/remix 分支;MagicConch 里 new RandomTeleportationAttemptSettings
  为弃置死对象（未传参）。
- WorldGen.InWorld(x,y,fluff=40)（WorldGen.cs:9642-9648,1458 同文）:
  x<40 ∨ x≥maxTilesX-40 ∨ y<40 ∨ y≥maxTilesY-40 → false。
  ⇒ 右缘起点 x=maxTilesX-40 落位候选恒界外（零爬行步时 px 不变）;左缘 x=40 恒合法
  （40≥40）。= 原版左右不对称根:左缘可零爬行落位,右缘必须 ≥1 爬行步。
- 物证地图（w=6400,右缘甲板 [6354..6364]@414 恰盖起点列 6360）→ 右洋零爬行必败 →
  MagicConch 回退左洋 → 「只能传到左海洋」。自然世界（起点列=水）爬行 ≥1 步 →
  两洋皆可达（bj43-b 档案「有的地图正常」同相）。

## 三路实锤（2026-09-21）

1. 第三方记载（wiki.gg 直取,非搜索摘要）:
   - Magic Conch 页:载「传最远(对侧)海洋」「两洋全受阻(如淹没)→传送失败原地不动」
     「1.4.5.7 Fixed…not considering tiles freshly placed over water to be valid /
     not avoiding dangerous tiles / lagging heavily on Skyblock worlds」——行为级记载
     与反编译机制全相容;**无任何右缘/单侧海洋 quirk 记载**（页内 right/left/only
     works/not possible 逐句核对,两次独立抓取一致）。
   - Shellphone 页:无海洋侧 quirk 记载（明示核对）。
   - WebSearch 摘要曾引「Teleporting to the right side is usually not possible」——
     直取原页证伪,该引文不采信;Reddit 类社区帖因搜索服务余额中断无法核源,如实记
     「无可采信的针对此 quirk 的社区记载」（不构成反证）。
2. 反编译调用链全图:items 4263(魔法海螺)/5360(贝壳电话·海洋) → Player.cs:43356
   MagicConch()（唯一调用点）→ RequestMagicConchTeleportPosition ×2（56785/56788）
   → InWorld(_,_,40)（唯一边界判,cs:171）。1458 交叉:TeleportHelpers.cs 全文件
   diff 为空;MagicConch 函数体 diff 为空;InWorld 同文。本仓 Game.ts
   requestMagicConchTeleportPosition（:29825 起）逐臂指纹对读全等
   （x0/crawl 配对/InWorld40/ToWorldCoordinates(8,16);boxBlocked 9 格=SW-BJ43 判例）。
3. rig 独立二重奏（rig_conch_teleport.py,逐行照抄反编译,不参考本仓实现）:
   8/8 PASS（rig_output.txt）——物证特征世界右洋尝试败（零爬行,InWorld 560≥560）、
   左洋胜 (40,111)、双半场落左洋;自然世界右洋爬行 11 步胜 (549,163);微世界零爬行
   不对称（右败/左胜）。与 LIVE（vitest bj240 3/3）+ BJ240 金标三方同判。

**实锤判定:BJ240 判据无动摇,三路全过 → 落刀。**

## 分歧落刀（补偿式重试,对正常地图零变化）

- 形态:requestMagicConchTeleportPosition 增 `inwardRetry=false` 参;InWorld 拒绝点
  右边界拒绝（rightOcean ∧ px≥w-40 ⇒ 必零爬行,爬向恒内卷）且闸开时内移起点
  x=w-41 重试右洋一次（!inwardRetry 防再入）。py 面拒绝/左洋永不补偿;原版双尝试序
  原样跑（fx51 源码文本锁 `?? this.requestMagicConchTeleportPosition(!leftHalf)`
  零触碰）。
- 回滚口:`Game.CONCH_RIGHT_OCEAN_COMPENSATION = true`（Game.ts:29823,静态闸,
  先例 Player.SURFACE_SKIM_SPLASH 同型;登记注在闸处+拒绝点）。
  置 false ⇒ 与原版逐字全等。
- 测试:tests/bj242-conch-right-ocean-compensation.test.ts（①补偿命中右洋甲板
  (w-41,163) ②自然图单次直达重试臂未触发 ③左洋/右半场首选序零变化 ④OFF=原版
  逐字含调用序 [[true,false],[false,false]]）。bj240 语义锁按分歧转「回滚口关闭态」
  断言（bj240 test1/2 加闸 OFF 包裹）。
- 变异:M1 摘重试臂 → ① 红（余绿）;M2 闸失效（摘 Game.CONCH_RIGHT_OCEAN_COMPENSATION
  合取）→ ④ 红 + bj240 两关闭态锁红。还原复绿。
- 回归:bj242(4)+bj240(3)+bj42+bj43(9)+fx51(16)=36/36;传送域 bj103-a1b/bj108/
  caster/pylon/bj48/bj57=70/70;tsc --noEmit exit 0。
- 实机探针（probe_bj242.mjs,私有 vite 5201,run-diag,收尾已 kill+lsof 净）:
  14/14 PASS——物证图:①rightTry 经补偿落右洋甲板 (6359,413)=px101742,py6582
  ②左半场 fire 直达右洋,calls=[[true,false],[true,true]]（原版败→内移重试命中,
  无左洋脚）③右半场 fire=原版对侧优先落左洋 (40,311);OFF:④rightTry=null
  ⑤回退左洋;自然图(4200×1200):⑥右洋直达单次调用 ⑦左洋。截图
  shot-right-ocean-landing.png（小地图示玩家立于世界右缘海洋柱,该图夜间甲板无光照）。

## 残留/边界

- 补偿只对「InWorld 右边界拒绝」这一 quirk 面生效;右洋因其它因败（如整墙、py 出界）
  仍=原版失败（bj43-syn3 右缘沙墙 null 不回归,实测绿）。
- 右半场玩家首选仍是左洋（原版对侧优先序保持,未动）;要「右半场也传右洋」属另一
  处分歧,本轮未做。
- 台账债:无新增（bj240 零修刀判定继续成立;本刀=纯增量分歧,OFF 态与原版逐字全等）。
