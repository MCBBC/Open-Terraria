# 全道具审计台账（2026-08-22，武器除外）

> 审计维度：使用方式/使用效果/功效时间/buff/功能实装/冷却(useTime)/贴图正确性。
> 方法：分区子代理对 `vanilla-itemfunc.json`（Item.cs 提取）+ 本仓消费链逐项对账。
> 状态图例：✅确认正确 | ⚠️偏差(已派发) | ❌未实装(已派发) | 📋登记(微差不修)

itemfunc 总数: 2259
consumable: 1491 | buffType: 193 | heal: 16 | mountType: 0
createTile: 1039 | shoot: 529 | 工具: 98

## 审计范围盘点（主会话）

vanilla-itemfunc.json 共 2259 条（Item.cs 提取）。分类：consumable ~200、
buffType ~193、heal 16、mountType ~40、createTile ~1038、shoot ~400、工具 98。
武器（melee/ranged/magic 召唤武器弹）不在本审计范围。

## 分区审计（6 子代理并行，报告追加于下）

## 主会话预审发现：BUFF_BY_VANILLA 覆盖缺口（待派发）

itemfunc 需要的 buff id 111 个中，BUFF_DEFS 缺 **58 个**——这些物品使用时
`BUFF_BY_VANILLA.get(buffType)` 返回 undefined → **buff 静默丢失**（Game.ts:135 桥）。
来源物品（部分）：19←115 同伴方块、27←425、40←603、41←669、42←753、45←994、
49-57←1157-1183（宠物食物族）、61←1242、64←1309 史莱姆杖、65-66←1311/1312、
81←1798 蜂蜜蜡烛…（全 58 个清单见审计运行时输出）。

修复方向：为 58 个缺失 buff id 增补 BUFF_DEFS 条目（vanillaBuff/descKey/fallbackName）
+ 按原版 Player.cs UpdateBuffs 对应 case 补消费逻辑（宠物/坐骑/灯类多为"仅图标"
原版同款——原版也只在 Draw 层消费）。

### 58 缺口完整清单（buff id ← 来源物品(时长)）
buff 19 ← 115(t0)
buff 27 ← 425(t0)
buff 40 ← 603(t0)
buff 41 ← 669(t0)
buff 42 ← 753(t0)
buff 45 ← 994(t0)
buff 49 ← 1157(t0)
buff 50 ← 1169(t0)
buff 51 ← 1170(t0)
buff 52 ← 1171(t0)
buff 53 ← 1172(t0)
buff 54 ← 1180(t0)
buff 55 ← 1181(t0)
buff 56 ← 1182(t0)
buff 57 ← 1183(t0)
buff 61 ← 1242(t0)
buff 64 ← 1309(t0)
buff 65 ← 1311(t0)
buff 66 ← 1312(t0)
buff 81 ← 1798(t0)
buff 82 ← 1799(t0)
buff 83 ← 1802(t0)
buff 84 ← 1810(t0)
buff 85 ← 1837(t0)
buff 91 ← 1927(t0)
buff 92 ← 1959(t0)
buff 125 ← 2364(t0)
buff 126 ← 2365(t0)
buff 127 ← 2420(t0)
buff 133 ← 2551(t0)
buff 134 ← 2535(t0)
buff 135 ← 2584(t0)
buff 136 ← 2587(t0)
buff 139 ← 2621(t0)
buff 140 ← 2749(t0)
buff 152 ← 3043(t0)
buff 154 ← 3060(t0)
buff 155 ← 3062(t0)
buff 161 ← 3249(t0)
buff 173 ← 3454(t0)
buff 176 ← 3455(t0)
buff 179 ← 3453(t0)
buff 182 ← 3474(t0)
buff 188 ← 3531(t0)
buff 190 ← 3577(t0)
buff 200 ← 3857(t0)
buff 201 ← 3856(t0)
buff 213 ← 4269(t0)
buff 214 ← 4273(t0)
buff 216 ← 4281(t0)
buff 263 ← 4607(t0)
buff 271 ← 4758(t0)
buff 322 ← 5005(t0)
buff 325 ← 5069(t0)
buff 335 ← 5114(t0)
buff 355 ← 5456(t0)
buff 376 ← 5573(t28800)
buff 385 ← 5663(t0)
buff 386 ← 5664(t0)

---

# Buff 效果实装完整度审计（2026-08-22，追加）

> 对象：`src/stats/Buffs.ts` BuffType 枚举 + BUFF_DEFS（实际 **122 成员 / 122 条**，
> 任务书写的"131 条"与现状不符——枚举与 DEFS 一一对应、无缺项无孤儿）。
> 标杆：`../Terarria1456/Terraria/Player.cs` `UpdateBuffs`。
> ★行号勘误：任务书给的 UpdateBuffs :12214-13100 与仓内反编译不符——**实际位于
> Player.cs:9553-11660**（AddBuff :5094 / AddBuff_TryUpdatingExistingBuffTime :5179 /
> NaturalLifeRegen DoT 段 :18935-19000）。本仓 Buffs.ts 注释大量引用 **1457 行号**
> （约 +660 偏移，如 Swiftness 注 ":9656" 实为 1456 :9655），下表"原版行号"一律取
> **1456 反编译实测行号**。

## 总览

| 维度 | 结论 |
|---|---|
| 枚举/DEFS 对齐 | 122 = 122，`Record<BuffType,…>` 编译期强制，无缺项 |
| 图标 | `public/sprites/vanilla/Buff_*.png` 共 400 张，**122 个映射 id 全覆盖**（含 1457 新 389-394/396）；UI.ts:2776 直链 `Buff_{vanillaBuff}.png` + onerror 回退药水物品图标（`buffIconItem` UI.ts:3682+，重制钩子 `remasterBuffIcon`）——无缺图兜底风险 |
| 时长管理 | `apply()` max 合并语义 ✅（Buffs.ts:676-677 ↔ AddBuff_TryUpdatingExistingBuffTime :5179）；fed-state 换档删旧 ✅（:5080-5089）；buffImmune 门 ✅（:5052）；DeadCells 站 ×1.2 ✅（:5206）；专家/大师 debuff 时长缩放表 ✅（BuffID.cs:28）；Warmth↔Chilled/Frozen 双向削时长 ✅（:5292-5315/:5429-5437）；`BUFF_NO_SAVE` 存档过滤 ✅（Main.cs:8896-8990）；vampireSeed <10t 不显秒 ✅（Main.cs:42715） |
| 计数 | **真实消费 108 / 仅图标（空壳·登记）7 / 部分实装 7**；❌ 7、⚠️ 7 |

## 逐 Buff 对账表（122 条）

| BuffType | 原版id | 原版效果 | 我方消费点(文件:行号) | 实装状态 | 结论 | 原版行号 |
|---|---|---|---|---|---|---|
| Agility | 3 | moveSpeed += 0.25 | Buffs.ts:834 → Player.ts:2333/2514/3047/4006；授予 Game.ts:7988 药水桥 | 真实消费 | ✅ | 9651 |
| Ironskin | 5 | statDefense += 8 | Buffs.ts:862 → Player.ts:697 | 真实消费 | ✅ | 9659 |
| Resistance | 21 | potionDelay（封治疗药水） | Buffs.ts:973 healBlocked → Game.ts:6536/6572/7995/8323/20362、MobileControls.ts:334；授予 Game.ts:6452/20378 | 真实消费 | ✅ | 11314 |
| Thorns | 14 | thorns=1 反弹接触全额(cap1000) | Buffs.ts:963 → Player.ts:1353 → Game.ts:19730 | 真实消费 | ✅ | 9699 |
| Regen | 2 | lifeRegen += 4（2HP/s） | Buffs.ts:734 tick → Player.ts:1772 | 真实消费 | ✅ | 9647 |
| Campfire | 87 | SceneMetrics 光环 lifeRegen++（0.5HP/s） | Buffs.ts:793-800；授予/强度 Game.ts:4895（20t 扫描） | 真实消费 | ✅ | 18990 |
| Honey | 48 | lifeRegenTime+=2 / lifeRegen+=2；lifeRegen<0 对冲 +4 | Buffs.ts:735/787；授予 Player.ts:2052、Enemy.ts:2040；Player.ts:1852 | 真实消费 | ✅ | 9764 |
| OnFire | 24 | lifeRegen-8（4HP/s）；vampireSeed -100（50HP/s） | Buffs.ts:499/759；授予 Player.ts:2138、MeteorChunk.ts:54、projTargets SP 表；入水熄灭 Player.ts:2152 | 真实消费 | ✅ | 11331 |
| Burning | 67 | lifeRegen-60（30HP/s）+ 移速×0.5 | Buffs.ts:505/856；授予 Player.ts:5371（陨石/狱石） | 真实消费 | ✅ | 11355 |
| Bleeding | 30 | bleed（清 lifeRegenTime 断自然恢复） | Player.ts:1864/1866；授予 Player.ts:5372、Pvp.ts:50 | 真实消费 | ✅ | 9723 |
| Suffocation | 68 | lifeRegen-40（20HP/s） | Buffs.ts:506；Player.ts:5376/1788 | 真实消费 | ✅ | 11359 |
| ObsidianSkin | 1 | lavaImmune + fireWalk + 免疫 24 | Player.ts:1251/1257 | 真实消费 | ✅ | 9573 |
| Gills | 4 | gills 水下不淹 | Player.ts:2207（ftw 种子语义翻转同原版） | 真实消费 | ✅ | 9655 |
| ManaRegen | 6 | manaRegenBuff（静止加成+满额倍率+钳20f） | Player.ts:1624/1919/1929/1943/1946 | 真实消费 | ✅ | 9663 |
| MagicPower | 7 | magicDamage += 0.2 | Player.ts:1410 | 真实消费 | ✅ | 9667 |
| Featherfall | 8 | slowFall 重力/3 + fallStart 重置免摔 | Player.ts:3150/3177 | 真实消费 | ✅ | 9671 |
| WaterWalking | 15 | waterWalk 液面站立 | Player.ts:2040/2725；Game.ts:18199/18282 | 真实消费 | ✅ | 9706 |
| Archery | 16 | archery：箭伤×1.1 + 箭速×1.2 | Player.ts:1415/1445；Game.ts:8404 | 真实消费 | ✅ | 9710 |
| NightOwl | 12 | nightVision 光衰减 ×1.03 | Game.ts:5822 | 真实消费 | ✅ | 9691 |
| Sunflower | 146 | moveSpeed +0.1 再 ×1.1（复合×1.21）+ 刷怪减 | Buffs.ts:839；Game.ts:4921/16650 | 真实消费 | ✅ | 10598 |
| CatBast | 215 | statDefense += 5 | Buffs.ts:863；Game.ts:4922 | 真实消费 | ✅ | 9788 |
| StarInBottle | 158 | manaRegenDelayBonus+0.5 / manaRegenBonus+10 | Player.ts:1912/1914；Game.ts:4920 | 真实消费 | ✅ | 9629 |
| PeaceCandle | 157 | spawnRate×1.3 / maxSpawns×0.7 | Game.ts:4923/16650（peaceCandleNear） | 真实消费 | ✅ | NPC.cs:645（无 UpdateBuffs case） |
| Clairvoyance | 29 | magicCrit+2 / magicDamage+0.05 / statManaMax2+20 / manaCost-0.02 | 仅 Player.ts:1330 manaMax+20；**crit/伤/耗蓝三项未接** | 部分实装 | ⚠️ | 11481 |
| Sharpened | 159 | meleeArmorPenetration += 12 | Player.ts:1469/3398；授予 Game.ts:13487 | 真实消费 | ✅ | 9625 |
| AmmoBox | 93 | ammoPotion → PickAmmo 20% 不耗弹 | 授予 Game.ts:13487（工位）；**效果位 Buffs.ts:905 `hasAmmoBox` 全仓零消费（死代码）**——对比 AmmoReservation(112) 已接 Game.ts:6755 | 仅图标（空壳） | ❌ | 9772 |
| Bewitched | 150 | maxMinions += 1 | Player.ts:1339；授予 Game.ts:13485 | 真实消费 | ✅ | 9859 |
| WarTable | 348 | maxTurrets += 1 | Player.ts:1346；授予 Game.ts:13488 | 真实消费 | ✅ | 9863 |
| SugarRush | 192 | pickSpeed -= 0.2 + moveSpeed += 0.2 | Buffs.ts:844 moveSpeed×1.2 ✅；**pickSpeed -0.2 未入 Game.ts:10720 挖掘冷却链**；授予 Game.ts:13488（蛋糕 621 右键 120s） | 部分实装 | ⚠️ | 9634 |
| SoulDrain | 151 | lifeRegenTime+=2 + (5+soulDrain)/2 回复 | Player.ts:1770/1860/1881；Game.ts:4333-4345 供给扫描 | 真实消费 | ✅ | 9555 / 18939-18983 |
| Battle | 13 | enemySpawns（spawnRate×0.5 / max×2） | Game.ts:16651 | 真实消费 | ✅ | 9695 |
| Calming | 106 | calmed（spawnRate×1.65 / max×0.6 + 仇恨-1000） | Game.ts:16651；Enemy.ts:1238/1266/1313 | 真实消费 | ✅ | 9824 |
| Mining | 104 | pickSpeed -= 0.25 | Game.ts:10720 | 真实消费 | ✅ | 9816 |
| Builder | 107 | tileSpeed/wallSpeed += 0.25 + blockRange+1 | Game.ts:10368/12304/12319 | 真实消费 | ✅ | 9840 |
| Heartreach | 105 | lifeMagnet 拾心范围 | Player.ts:5094 | 真实消费 | ✅ | 9820 |
| FlipperPotion | 109 | ignoreWater + accFlipper | Player.ts:2713/2976/2981/3313；Renderer.ts:8247/8315/9422 | 真实消费 | ✅ | 9850 |
| Titan | 108 | kbBuff → 近战击退 ×1.5 | Game.ts:16159；Player.ts:3014/3105；UI.ts:1498 | 真实消费 | ✅ | 9846 |
| AmmoReservation | 112 | ammoPotion 20% 不耗弹 | Game.ts:6755 | 真实消费 | ✅ | 9875 |
| Lifeforce | 113 | statLifeMax2 += max/5/20*20 | Player.ts:1326 | 真实消费 | ✅ | 9879 |
| Endurance | 114 | endurance+0.1 → 受伤×0.9 | Player.ts:5207/5248（双受击路径） | 真实消费 | ✅ | 9884 |
| Wrath | 115 | ★枚举名错位：实挂原版 Rage——三系暴击+10 | Player.ts:1489 | 真实消费 | ✅ | 9888 |
| Rage | 117 | ★实挂原版 Wrath——全系伤害+10% | Player.ts:1398/1417 | 真实消费 | ✅ | 9947 |
| Tipsy | 25 | def-4 / 近战暴+2 / 伤+10% / 速+10% / minionKB+1 | Player.ts:1382/1419/1491/5852；Game.ts:18195/13135；Buffs.ts:864/898 | 真实消费 | ✅ | 11513 |
| ManaSickness | 94 | magicDamage × (1-0.25×剩余/300) | Player.ts:1411/2274；授予 Game.ts:6304/6735/8343/20383 | 真实消费 | ✅ | 10000 |
| Werewolf | 28 | 夜间 lifeRegen++ / 近战+5.1%伤速 / 暴+2 / 防+3 / 移速+5% / 跳高+2 | Player.ts:3385/1289/1420/1492/2678；Buffs.ts:739/841/867；Renderer.ts:9032/9483/9504（人鱼态互斥 ✅） | 真实消费 | ✅ | 11488 |
| BrainOfConfusionBuff | 321 | 三系暴击+10 + 召唤伤+0.1 | Player.ts:1399/1490/3405 | 真实消费 | ✅ | 9639 |
| Weak | 33 | 近战-5.1%伤速 / 防-4 / 移速-10% | Player.ts:1384/1421；Buffs.ts:840/865；授予 Game.ts:19629（狼人 155） | 真实消费 | ✅ | 11506 |
| Shimmered | 353 | shimmering+frozen+穿墙下坠+地狱即删 | Player.ts:2069-2096/5345（语义由 `shimmering` 字段承载，buff 为登记位——原版同构 :11379-11419） | 真实消费（旁路载体） | ✅ | 11379 |
| ImbueVenom | 71 | meleeEnchant → 敌 Venom(70) 5-10s | Game.ts:16163；projStatus.ts:188；Pvp.ts:66 | 真实消费 | ✅ | 11603 |
| ImbueCursed | 73 | → 敌 CursedInferno(39) 3-7s | Game.ts:16164；projStatus.ts:193；Pvp.ts:67 | 真实消费 | ✅ | 11607 |
| ImbueFire | 74 | → 敌 OnFire(24) 3-7s | Game.ts:16165；projStatus.ts:194；Pvp.ts:68 | 真实消费 | ✅ | 11611 |
| ImbueGold | 75 | → 敌 Midas(72) 2s（掉钱×1.1-1.51） | Game.ts:16170；projStatus.ts:195 | 真实消费 | ✅ | 11615 |
| ImbueIchor | 76 | → 敌 Ichor(69) 10-20s | Game.ts:16171；projStatus.ts:196；Pvp.ts:69 | 真实消费 | ✅ | 11619 |
| ImbueNano | 77 | → 敌 Confused(31) 1-4s + 伤×1.05 | Game.ts:16155/16172；projStatus.ts:197；Pvp.ts:70 | 真实消费 | ✅ | 11623 |
| ImbueParty | 78 | 命中爆彩带（视觉） | Game.ts:16204；projStatus.ts:199 | 真实消费 | ✅ | 11627 |
| ImbuePoison | 79 | → 敌 Poisoned(20) 5-10s | Game.ts:16173；projStatus.ts:198；Pvp.ts:71 | 真实消费 | ✅ | 11631 |
| Inferno | 116 | 200px 光环：敌 OnFire3(323) 2s + 60t 一跳 20 伤 + PvP 半边 | Game.ts:14542-14570；光 Game.ts:5921 | 真实消费 | ✅ | 9894-9946 |
| Shine | 11 | 玩家中心格常亮 (0.8,0.95,1.0) | Game.ts:5920 | 真实消费 | ✅ | 9687 |
| Spelunker | 9 | 矿物高亮叠层 | Renderer.ts:11287 | 真实消费 | ✅ | 9675 |
| Dangersense | 111 | 陷阱高亮 | Renderer.ts:11288 | 真实消费 | ✅ | 9871 |
| Hunter | 17 | 小动物高亮（detectCreature） | Renderer.ts:11290 | 真实消费 | ✅ | 9715 |
| BiomeSight | 343 | 邪恶/神圣方块高亮 | Renderer.ts:11289 | 真实消费 | ✅ | 9679 |
| Luck | 257 | luckPotion 三档（>600s=3 / >300s=2）luck+0.1×档 | Player.ts:5134-5138/5121 | 真实消费 | ✅ | 9967 |
| Summoning | 110 | maxMinions += 1 | Player.ts:1340 | 真实消费 | ✅ | 9855 |
| Fishing | 121 | fishingSkill += 15 | Bobber.ts:133；Game.ts:18206 | 真实消费 | ✅ | 9828 |
| Sonar | 122 | sonar 咬钩浮名/音 | Bobber.ts:324/468 | 真实消费 | ✅ | 9832 |
| Crate | 123 | cratePotion 渔获箱率+10% | Bobber.ts:282 | 真实消费 | ✅ | 9836 |
| Gravitation | 18 | gravControl：Up 边沿翻转 gravDir | Game.ts:4309-4312 | 真实消费 | ✅ | 9719 |
| Chilled | 46 | chilled 移速×0.75（1457 折 strongestMoveSpeedDebuff） | Buffs.ts:858；授予 Player.ts:2158（浸雪/冰） | 真实消费 | ✅ | 9743 |
| Frozen | 47 | frozen 整帧封输入 | Player.ts:2343/2402/2417/4013；GrappleProj.ts:130；WeaponProj.ts:1446；Enemy.ts:4206；projTargets.ts:407 | 真实消费 | ✅ | 9747 |
| WellFed | 26 | def+2/暴+2/全系伤+5%/近战速+5%/移速+20%/镐-5% | Buffs.ts:911-931；Player.ts:1884（lifeRegen 档）；Game.ts:10724/13134 | 真实消费 | ✅ | 11521 |
| WellFed2 | 206 | def+3/暴+3/伤+7.5%/… | 同上（tier2） | 真实消费 | ✅ | 11537 |
| WellFed3 | 207 | def+4/暴+4/伤+10%/… | 同上（tier3）；马桶消化回退链 Game.ts:13134 | 真实消费 | ✅ | 11553 |
| MoonLeech | 145 | moonLeech 全禁吸血/幽灵/治疗弹 | Game.ts:19894（治疗门）；bossAI_duke_moonlord.ts:1103/1137（授予+月噬怪门禁） | 真实消费 | ✅ | 11454 |
| KiteBuff | 383 | moveSpeed+0.25 / pickSpeed-0.15 / tile/wall+0.15 + kiteLuck 三档 | Buffs.ts:842/936/949；Game.ts:10722/12306/12321；Luck Player.ts:5141；★数值取 1457（+0.15/-0.1）与仓内标杆 1456（:9612-9616 = +0.25/-0.15）冲突；风筝族物品（4371 等）授予未移植 | 部分实装 | ⚠️ | 9612 |
| Stinky | 120 | stinky → luck -0.25 | Player.ts:5126；授予 PoopProj.ts:98（马桶）；恶臭药水 1332 / 弹 1080 授予未移植（登记级） | 部分实装 | ⚠️ | 9958 |
| Slow | 32 | slowSlow 移速×0.5 | Buffs.ts:857；授予 bossAI_deerclops.ts:150/195（咆哮 800px） | 真实消费 | ✅ | 9731 |
| Stoned | 156 | stoned 封全部输入 | Player.ts:2360/3498/5405；Enemy.ts:3331/3349（美杜莎）；Game.ts:7084 | 真实消费 | ✅ | 9751 |
| ChaosState | 88 | chaosState 期内再传送扣 max/7（可致死） | Game.ts:8210/8222（混乱之杖 1326） | 真实消费 | ✅ | 9784 |
| CompanionCube | 191 | 光宠物投影续命+死清旗 | Game.ts:8188（授予+653 生成）；MinionProj.ts:1399（失 buff 即散）；★微光变身瞬间 Hurt(20×难度)（:24924-24931）未接（登记级） | 部分实装 | ⚠️ | 10632 |
| Obstructed | 163 | headcovered（遮屏）+ bleed | Player.ts:1864/1866；Renderer.ts:10514-10517（ScreenObstruction 0.95/0.3）；授予 bossAI_lunar_misc.ts:1346 | 真实消费 | ✅ | 11421 |
| Poisoned | 20 | poisoned → lifeRegen-4（2HP/s） | Buffs.ts:497 ENV_DOTS；授予 projTargets SP 表（276 毒种子等）、Pvp.ts:48；Player.ts:5854 眯眼 | 真实消费 | ✅ | 11310 |
| Horrified | 37 | gross（见肉山墙）+ buffTime 钳 10 | Player.ts:3911/3936 | 真实消费 | ✅ | 10576 |
| TheTongue | 38 | tongued 禁道具/钩爪 + 50HP/s + 抵墙即死 | Player.ts:3913-3950；Renderer.ts:4443；Game.ts:7081 | 真实消费 | ✅ | 10589 |
| Venom | 70 | lifeRegen-30（15HP/s） | Buffs.ts:498；授予 Pvp.ts:56 / projTargets SP 表 | 真实消费 | ✅ | 11306 |
| CursedInferno | 39 | lifeRegen-24（12HP/s） | Buffs.ts:504；Pvp.ts:53 | 真实消费 | ✅ | 11363 |
| OnFire3 | 323 | lifeRegen-8（4HP/s） | Buffs.ts:501；Pvp.ts:58 | 真实消费 | ✅ | 11367 |
| Frostburn | 44 | lifeRegen-16（8HP/s） | Buffs.ts:502；Pvp.ts:54 | 真实消费 | ✅ | 11371 |
| Frostburn2 | 324 | lifeRegen-16 | Buffs.ts:503；Pvp.ts:59 | 真实消费 | ✅ | 11375 |
| Confused | 31 | 控制反转（四键轮换含 Up←Right 怪癖） | Player.ts:2347；Pvp.ts:51 | 真实消费 | ✅ | 9727 |
| Ichor | 69 | ichor + statDefense -= 15 | Buffs.ts:866；Pvp.ts:55 | 真实消费 | ✅ | 9755 |
| BrokenArmor | 36 | 防御终值减半 | Player.ts:703；Pvp.ts:52（301 类弹） | 真实消费 | ✅ | 9760 |
| Electrified | 144 | lifeRegen-8 + 移动时额外 -32（16HP/s） | Buffs.ts:507/756（electrifiedMoving 由 Player.fixedUpdate 写入） | 真实消费 | ✅ | 9995 |
| Invisibility | 10 | invisibility：刷怪环 ×1.2/×0.8 + 敌怪索敌无视 | Game.ts:16655（仅刷怪环）；**TargetClosest 无视分支未实装**（注释登记） | 部分实装 | ⚠️ | 9683 |
| Darkness | 22 | blind 光衰减 ×0.95 + GlobalBrightness 1.0 | Game.ts:5824；Player.ts:5844（眯眼） | 真实消费 | ✅ | 11318 |
| Cursed | 23 | noItems+cursed 封道具使用 | Game.ts:7086（使用门） | 真实消费 | ✅ | 11326 |
| Blackout | 80 | blackout 光衰减 ×0.85 | Game.ts:5823；Player.ts:5844 | 真实消费 | ✅ | 11322 |
| Webbed | 149 | webbed 定身：velocity 清零/重力跳跃冲刺归零/免击退/摘钩 | Player.ts:2402/2418/2651/4013；Buffs.ts:837（moveSpeed=0）；projTargets.ts:407 | 真实消费 | ✅ | 11458 |
| VortexDebuff | 164 | vortexDebuff 零重力 + 正弦漂浮 | Player.ts:2660-2665 | 真实消费 | ✅ | 11426 |
| WitheredArmor | 195 | 防御终值减半（与破甲同式） | Player.ts:704；授予 bossAI_dd2.ts:2226 | 真实消费 | ✅ | 11434 |
| WitheredWeapon | 196 | 全系伤害 ×0.5 | Player.ts:1403/1432 | 真实消费 | ✅ | 11442 |
| Wet | 103 | dripping + 火系免疫(24/323/67) + lavaWet 即删 | Player.ts:1252/1260/1603/2046；授予 Game.ts:19635（爆裂泡泡 3-7s） | 真实消费 | ✅ | 11335 |
| SolarShield1 | 170 | 层位标记 buff（效果在 solarShields 主状态） | Player.ts:1846-1848（续期）；效果 Player.ts:1814/3097/5277、Renderer.ts:9655 | 真实消费（旁路载体） | ✅ | 10040-10066 |
| SolarShield2 | 171 | 同上 | 同上 | 真实消费（旁路载体） | ✅ | 10040 |
| SolarShield3 | 172 | 同上 | 同上 | 真实消费（旁路载体） | ✅ | 10040 |
| DryadsWard | 165 | lifeRegen+6 / 防+8 / thorns<1 时 +0.5 | Buffs.ts:738/868/965；授予 TownNPC.ts:2459 | 真实消费 | ✅ | 9985 |
| NeutralHunger | 332 | 无属性效果（纯链态；原版亦无 case） | Buffs.ts:602-612/617-633（UpdateStarvingState/链转移） | 真实消费（链态） | ✅ | （无 case，:11599 前无 332 分支） |
| Hunger | 333 | def-2/全系暴-2/伤-5%/近战速-5%/minionKB-0.5/镐+5% | Buffs.ts:874-894/617-633 | 真实消费 | ✅ | 11569 |
| Starving | 334 | 同上加重 + 常驻流失 + 120t 直伤（沙/雪 ×2） | Buffs.ts:769-784/874-894；Player.ts:1786（死因） | 真实消费 | ✅ | 11584 |
| ManaHeat | 396 | magicDamage × manaHeat（线性衰减；1457 新） | Player.ts:1638/1654-1666/1412/1969；授予 ItemDrop.ts:142（魔力星） | 真实消费 | ✅ | （1457 专属，1456 无 case） |
| Warmth | 124 | resistCold：寒冷伤减免（:31657）+ 46/47 时长双向 ÷4/÷2 | Buffs.ts:661-675（削时长双向 ✅）；**resistCold 受击减伤未接**；**授予源缺失（暖冬药水 2359 未移植，全仓无 apply 点→现网不可达）** | 部分实装 | ⚠️ | 9963 |
| PotentAcid | 395 | 敌侧 90HP/s DoT + 染色（1457 新） | projStatus.ts:56 → Enemy.ts:1163/1202/1956（表驱动旁路；枚举位 113 本身零消费） | 真实消费（敌侧旁路） | ✅ | （1457） |
| ChlorophyteSpore | 397 | 敌侧 90HP/s + 孢子云/叶尘 VFX | projStatus.ts:57 → Enemy.ts:1164/1201/1957 | 真实消费（敌侧旁路） | ✅ | （1457） |
| AcceleratePoisons | 398 | 毒/流血/火焰族可加速 DoT ×2 | projStatus.ts:58 → Enemy.ts:1883/1959；授予 projStatus.ts:95（催化指环 6185） | 真实消费（敌侧旁路） | ✅ | （1457） |
| BlueLightning | 399 | 纯视觉 BlueLightningSmall 1/10 | projStatus.ts:59 → Enemy.ts:1166/1960/2018 | 真实消费（敌侧旁路） | ✅ | （1457） |
| RedLightning | 400 | 纯视觉 RedLightningSmall 1/10 | projStatus.ts:60 → Enemy.ts:1960/2022 | 真实消费（敌侧旁路） | ✅ | （1457） |
| PalworldMinionTrustyCattiva | 389 | 召唤物计数 buff（弹 1112 联动文案） | 无授予无消费 | 仅图标（登记待接） | ❌ | （1457） |
| PalworldMinionTrustyFoxsparks | 390 | 同上（弹 1113） | 无授予无消费 | 仅图标（登记待接） | ❌ | （1457） |
| PalworldMountTrustyChillet | 391 | 坐骑 buff（MountType→64） | 无授予无消费（Mounts.ts 无 BUFF_TO_MOUNT 391/392 表） | 仅图标（登记待接） | ❌ | （1457） |
| PalworldMountTrustyChilletIgnis | 392 | 坐骑 buff（MountType→65） | 无授予无消费 | 仅图标（登记待接） | ❌ | （1457） |
| ClayPotMinion | 393 | 召唤物计数 buff（弹 1118） | 无授予无消费 | 仅图标（登记待接） | ❌ | （1457） |
| ForbiddenMinion | 394 | 召唤物计数 buff（弹 1119；AI_206 本体已在 MinionProj.ts:1168） | 无授予无消费 | 仅图标（登记待接） | ❌ | （1457） |

## ❌ 未实装（7）修复要点

1. **AmmoBox(93)**：`Buffs.ts:905 hasAmmoBox` 是死代码。修法 = 弹药消耗判定处（PickAmmo
   语义，参照已实装的 AmmoReservation 消费点 Game.ts:6755 `Math.random()*5<1`）并入
   `buffs.hasAmmoBox` 同款 20% 掷门（原版两 buff 同一 `ammoPotion` 位，Player.cs:9772
   与 :9875 等效）。授予链已在（Game.ts:13487 弹药箱工位 1800s）。
2. **Palworld 六件(389-394)**：纯登记。修法 = 批 C/D 召唤弹 AI 授予侧：弹 1112/1113/1118/1119
   命中/存在期 `buffs.apply(389-394 对应项, 续期)`（原版 CachedProjectileCounterBuffTextHandler
   BuffID.cs:133-149 四对"余量"文案链）；坐骑 391/392 需 Mounts.ts 增 `BUFF_TO_MOUNT
   {391:64, 392:65}` + `BuffID.Sets.MountType` 挂接（原版 UpdateBuffs :9581 MountType 分支
   `mount.SetMount + buffTime=10` 续期模型）。注意 389-394 均在 `BUFF_NO_SAVE` 名单语义外
   需核对 Main.cs:8896+ 是否含 385/386（已含）与 389-394（1457 名单需另核）。

## ⚠️ 部分实装（7）修复要点

1. **Clairvoyance(29)**：Player.ts 魔法暴击段（:1489 附近）补 `magicCrit += 2`、魔法伤害段
   （:1410 附近）补 `+0.05`、施法耗蓝处补 `manaCost × 0.98`（Player.cs:11481-11486 四项，
   现仅 statManaMax2+20 生效）。
2. **SugarRush(192)**：Game.ts:10720 挖掘 pickSpeed 加法链补 `- (buffs.has(SugarRush) ? 0.2 : 0)`
   （Player.cs:9634-9637 与 Mining/KiteBuff 同链同形）。
3. **KiteBuff(383)**：①数值定案——本仓实现取 1457（moveSpeed+0.15/pickSpeed-0.1），
   仓内唯一标杆 Terarria1456 反编译 :9612-9616 为 **+0.25/-0.15**，按 CLAUDE.md"以 1456
   为准"应回改或在注释中升级标杆依据；②授予源——风筝族物品（4371 黄风筝等）未移植，
   持握授予链（原版为饰品/持物 buff）待物品批接入。
4. **Stinky(120)**：补恶臭药水 1332 使用授予（600s）与弹幕 1080 命中授予
   （Projectile.cs:67585-67590 ApplyBuffTo(120,600)）；消费侧已全（Player.ts:5126 luck-0.25）。
5. **CompanionCube(191)**：补微光浸浴变身瞬间 `Hurt(20×难度, ByOther(5))`（Player.cs:24924-24931，
   死因 DeathText.Petrified）；宠物生命周期侧已全。
6. **Invisibility(10)**：Enemy.TargetClosest 等价处补"隐身玩家无视"分支（原版隐身仅在
   未进入战斗态时丢仇恨；现仅 Game.ts:16655 刷怪环生效）。
7. **Warmth(124)**：①受击链补 `resistCold` 寒冷伤减免（Player.cs:31657 消费点）；②授予源——
   暖冬药水 2359 未移植（items.ts 无该键），接入后 Buffs.ts:661-675 的双向削时长逻辑即激活；
   现状整条 buff 不可达（死代码）。

## 备注（非缺陷的登记项）

- **枚举名错位**（有意保留，注释已标）：`Wrath`=原版 Rage(115)、`Rage`=原版 Wrath(117)，
  消费点 Player.ts:1398/1489 与原版数值一一对应，无实际偏差。
- **旁路载体**（✅ 计入真实消费）：Shimmered(353)→`shimmering` 字段、SolarShield1-3(170-172)
  →`solarShields` 主状态、1457 敌 debuff 五件(395/397/398/399/400)→Enemy 字段表驱动
  （projStatus.ts:56-60）。BuffType 枚举位本身零消费，但效果链完整，属架构选择非缺口。
- **注释行号漂移**：Buffs.ts 头注"心灯 :12247"实为 :18994-18997；大量 1457 行号引用
  （:9636/:10003/:26151 等）在 1456 反编译中不存在——建议后续统一标注版本来源，
  避免下次审计再踩行号错位。
- **与本台账上节"58 缺口"的关系**：上节是**物品授予桥**（Game.ts:135 BUFF_BY_VANILLA
  反查表缺 58 个 vanilla id → 物品使用时 buff 静默丢失）；本节是**已建模 122 buff 的
  效果消费审计**。两节互补：58 缺口修复增补 BUFF_DEFS 后，应按本节同法逐条补 UpdateBuffs
  消费（宠物/灯类原版亦多为仅图标/Draw 层消费，照抄即可）。

### 58 缺口预分级（主会话）

- **轻 46 个**（补 BUFF_DEFS 条目即可——原版也仅 Draw/标记层消费）：宠物灯/
  坐骑骑乘态/事件标记/蜡烛水晶族
- **重 13 个**（需补真实消费逻辑）：40/41/42（附魔台武器增益）、125/126/127
  （召唤物维持——无对应弹 DelBuff :10200-10230）、139/140（星旋武器 buff）、
  322/325（药水）、376/385/386（新事件）

**图标面**：58 缺口 buff 的 Buff_N.png 全部存在（388 张池覆盖）——补 DEFS 条目
后图标立即可显示，无资产缺口。

---

# 资产完整性审计（2026-08-22，道具贴图 / buff 图标 / 手持绘制）

> 审计人：资产完整性子代理。方法：BUFF_DEFS 122 条逐条对 `terraria-assets/Images`
> 源库 MD5 比对；物品图标 50 件抽样（药水 14/工具 12/配饰 12/放置物 12）+
> **全图集 6108 条逐像素比对**（pngjs 解码 Item_Atlas_0..2 vs 源 Item_N.png）；
> 手持绘制逐 useStyle 对 1456 反编译公式复算。
> ★审计前提勘误：原版 Buff 贴图是 **32×32**（不是 22×22）——源库 400/400 张全部
> 32×32（`terraria-assets/Images/Buff_1..400.png` IHDR 实测），且原版 DrawBuffIcon
> 按贴图原生尺寸绘制（Main.cs:42733 `Rectangle(0,0,Width,Height)`），我方 UI 32×32
> CSS = 原生 1:1，无缩放偏差。

## 总表

| 资产 | 数量 | 存在 | 尺寸正确 | 显示路径 | 结论 | 我方行号 |
|---|---|---|---|---|---|---|
| BUFF_DEFS buff 图标（Buff_{vanillaBuff}.png） | 122 条（任务书"131"实为 122；枚举 122 成员全映射、零重复零遗漏） | 122/122，且与源库逐字节 MD5 全同 | 122/122 = 32×32（源库同 32×32；"22×22"前提有误） | UI buff 栏 `<img src="/sprites/vanilla/Buff_N.png">` 直链（不经 atlas）+ remaster 钩子覆写 + onerror 退药水物品图标 | ✅ | src/stats/Buffs.ts:269-416（BUFF_DEFS）/ src/ui/UI.ts:2775-2784（直链+兜底）/ UI.ts:2684-2729（32×32 块） |
| 宠物 buff 图标（vanilla-pets.json 61 个 buff id） | 61 | 61/61 存在且与源库全同 | 61/61 = 32×32 | UI.ts 宠物通道 `Buff_{buff}.png` 直链 + onerror 退 Projectile_{proj}.png | ✅ | src/ui/UI.ts:2825-2833；src/data/vanillaPets.ts:11-18 |
| 磁盘 Buff_N.png 池 | 400 张（1-400 无空洞；389-400 为 1457 批 atlas-append-1457.mjs 补入） | 400/400 | 400/400 = 32×32 | 主会话已备案的 58 个 BUFF_DEFS 缺口 id 图标全部现成，补条目即可显示 | ✅ | scripts/atlas-append-1457.mjs:96 |
| 物品图标图集（Item_Atlas_0..2.png + vanilla.json items） | 6108 条（源库 6134 张 Item_N，26 张未打包——TEdit items.json 无该 id） | 6108/6108 打包且**逐像素与源图全同**（全量非抽样）；子矩形零越界 | 6108/6108 子矩形尺寸=源图尺寸 | vicon(vid) → vanilla.items[id] 子矩形 → iconUrl 32×32 canvas 合成（原大绘制 scale=min(1,32/sw,32/sh)） | ✅ | src/assets/SpriteAtlas.ts:381-392（vicon）/ UI.ts:179-221（iconUrl） |
| 抽样 50 件（药水 14/工具 12/配饰 12/放置物 12） | 50 | 50/50 key→vid→图集链全通、像素全同 | 50/50 | 同上（vi_<id> 键反解 vid） | ✅ | 抽样清单：188/227/288-299（药水）、3509/3506/3507/122/217/1991/213/933/832/50/930/964（工具）、49/211/212/285/156/158/159/53/54/950/906/863（配饰）、36/35/328/498/352/916/452/438/171/94/25/4276（放置物） |
| 物品动画切片表（ITEM_ANIMATION） | 10 条 + IsFood 86 件 | 10/10 源条高度被帧数整除 | 10/10 | atlasIcon 按渲染时钟切片（手持=当前帧，掉落物同源） | ✅ | src/assets/SpriteAtlas.ts:634-666；Renderer.ts:2283-2292 |
| useStyle 5 握把表（ITEM_DRAW_POS） | 93 条 | 93/93 与 Main.DrawPlayerItemPos 逐值全同（含 758/759/5460/760/1946 的 `num-=` 减法与 435/436/481/578/1187/1194/1201/1229 共案） | — | drawImage 左上角 = itemLocation+(num,dy)，镜像空间 dir=−1 等价已验证 | ✅ | src/render/Renderer.ts:223-242；对 vanilla Main.cs:3305-3663 |
| 法杖族表（STAFF_ITEMS） | 34 件 | 34/34 与 Main.cs:6712-6744 Item.staff 集合全同 | — | 持位=瞄准向量×6 + 绘制角=itemRotation+0.785 | ✅ | src/render/Renderer.ts:213-217、10255-10261 |
| 手持绘制 useStyle 1（挥砍） | ~1504 件 | rot=(pAnim−0.5)·−3.5−0.3 与三段持位表逐值同 vanilla | — | 镜像共轭 scale(-1,1)∘rot ≡ 原版 FlipH∘rot(−θ)，数学等价已验 | ✅（claw 特档缺，见⚠️3） | Renderer.ts:10210-10218、10356-10359；vanilla Player.cs:50095（rot 公式）/49952-50095（三段） |
| 手持绘制 useStyle 2（咀嚼）/3（雨伞）/4（举头）/6（仰饮）/13（短剑突刺） | 57/2/74/2/4 件 | 逐公式复算全同（含 946/4707、3601/5114/5120 特档） | — | 同上 | ✅（us3 钳位边缘 nit，见📋1） | Renderer.ts:10220-10247、10276-10282、10303-10312；vanilla Player.cs:50183-50224/50279-50312/50313-50338/50158-50182/50423-50446 |
| 手持绘制 useStyle 9（举杯饮药——全部药水/治疗） | 98 件 | ⚠️ 手位向量缺 ×Lerp(1.5,1.2,t) 缩放（Player.cs:50148-50152）——整段饮用过程物品比原版贴近身体 ~3-5px；rot/num11 手角/前移 Lerp(8,2,t)/轴心(0.5,0.4)(5009/5042/5645→0.26,0.5) 均正确 | — | 同上 | ⚠️ | Renderer.ts:10284-10301（缺缩放处 :10294-10295）；vanilla Player.cs:50127-50157 |
| useStyle 7/8 回退 | 注册物品 0 件使用（itemfunc 全表 useStyle 7/8 无一注册） | 不可达路径 | — | default 回退 us1 挥砍 | ✅（无消费面） | Renderer.ts:10332-10338 |
| buff 兜底图标表（buffIconItem 38 键） | 38 | 38/38 键可解析（snake 手写键 + Pascal 自动注册别名两路全通） | — | 仅 onerror 兜底，主路径 Buff_N.png 直链 | ✅ | src/ui/UI.ts:3700-3712、3879-3890 |
| place_v_* 图块首帧图标链 | 0 键注册（链路在 atlasIconForKey 保留但无消费者） | — | — | 现放置物全走 vi_<id> 原版物品图标 | ✅ | src/assets/SpriteAtlas.ts:677-686 |

## 缺失/错误资产清单与修复要点

**❌1. Item_4722（First Fractal，唯一玩家可见图标缺口）**
- `vi_4722_first_fractal` 已注册（src/data/items.ts:614），itemfunc 有
  （melee/shoot 857/useStyle 5），但 `vanilla.json` 无 items['4722']——根因：
  scripts/vanilla-atlas.mjs 按 **TEdit items.json** 驱动打包，而 TEdit 数据缺
  4722 等 26 个 id（1.4.4+ 新物品 TEdit 未收录）。vicon(4722) 返回 null →
  程序化兜底图标。源库 `terraria-assets/Images/Item_4722.png` **存在**，仅未打包。
- 修复：scripts/vanilla-atlas.mjs 的 itemFiles 循环加 TEdit 缺口补打包表
  （26 个 id 硬编码或扫源库差集），重跑 `node scripts/vanilla-atlas.mjs`。

**❌2.（无玩家影响，备案）源库 26 张 Item_N 未打包**：0/2772/2773/2775/2777/
2778/2780/2782/2783/2785/2881/3462/3463/3465/3847-3851/3861/3862/3978/4010/
4058/4143/4722——除 4722 外均未在 items.ts 注册（itemfunc 另有 3706
Fake_newchest2 = TEdit 虚拟箱物品，源库本无 PNG，不可获得，无影响）。

**⚠️3. useStyle 9 手位缺 ×Lerp(1.5,1.2,t)**（Renderer.ts:10294-10295）：
`offX/offY` 用裸 GetFrontHandPosition 展开值；原版在
`itemLocation -= MountedCenter; *= Lerp(1.5,1.2,t); += MountedCenter`
（Player.cs:50145-50152）。修复：`offX = hx*k + lerp(8,2,t); offY = p.h*0.5 + hy*k`
（k = 1.5 + (1.2-1.5)*t）。影响全部 98 件注册药水/食物的饮用视觉。

**⚠️4. useStyle 5 法杖 3476（Last Prism）距离特档缺**（Renderer.ts:10259）：
原版 `num22 = 6; if (3476) num22 = 14`（Player.cs:50380-50383）。1 件。

**⚠️5. useStyle 1 claw 分支缺**（Player.cs:49928-49951）：Item.claw 仅 1827
Bladed Glove（Main.cs:6745），原版持位 num 恒 10、Y=26/24 两档、不吃宽度表；
我方走通用三段宽度表。1 件，视觉微差。

**📋6. useStyle 3 钳位边缘**（Renderer.ts:10233）：`max(num18, 8)` vs 原版仅在
`num18 < 4` 时置 8——num18∈[4,8) 区间我方多钳 4px 内，瞬态 nit 可不改。

**📋7. 注释陈旧（不改行为）**：src/stats/Buffs.ts:396-397 "Buff_396.png 本仓
素材库暂缺"——实际已随 1457 批入仓且 MD5 同源；scripts/asset-gap-scan.mjs:75
"388 张"实为 400 张。

## 与主会话 BUFF_DEFS 58 缺口批的交叉结论

58 个待补 buff id 的 `Buff_N.png` 在磁盘池（1-400 全量）中**全部现成**且与源库
同源——补 BUFF_DEFS 条目后图标层零资产阻塞（与主会话"图标面无资产缺口"结论一致）。

## 审计结论

资产层（buff 图标 122+61 条、物品图集 6108 条、动画表、握把表、法杖表）**全绿**；
真问题集中在**绘制公式侧**（useStyle 9 缩放 1 处 + 特档 2 处）与 **1 个打包缺口**
（Item_4722）。合计：❌1（+1 备案）、⚠️3、📋3。

## 分区：治疗/回魔药水 16 + 食物链(WellFed) 82 + BUFF_DEFS 122（药水/食物子代理，2026-08-22）

> 对账基准：`../Terarria1456/Terraria/Item.cs`（SetDefaults 逐 case + DefaultToFood/
> DefaultToHealingPotion :48156-48180）、`Player.cs`（ApplyPotionDelay :51085-51120 /
> ApplyLifeAndOrMana :51123-51176 / UpdateBuffs :9640+）、`src/data/vanilla-itemfunc.json`、
> `src/stats/Buffs.ts`、`src/core/Game.ts` 使用链（:8315-8358 vi 桥 / :6436 药水病 /
> :6714 quickConsume / :20347 quickDrinkPotion）。
> 方法：脚本全量解析 Item.cs 全部 case 体 + DefaultTo* 调用，与 itemfunc 表 208 条
> heal/buff 项逐字段比对（healLife/healMana/buffType/buffTime/useStyle/potion）。
> ★BUFF_DEFS 实际 122 条（任务书面的 131 有误）；enum 与 DEFS 键集零缺零重，
> 122 个 vanilla id 的 Buff_N.png 全部在位（素材池 1-400 连续无缺口）。

### A. 治疗/回魔药水 16 件逐项

使用链（Game.ts:8315-8358）：healBlocked 门 → buffType 施加（BUFF_BY_VANILLA 反查,
tick÷60）→ healLife 回血 + 药水病分档 → healMana 回蓝 + 魔力眩晕 5s → 消耗 →
useTime=itemcombat??17 → useSwing → foodUseSound。冷却全部 17t（itemcombat 表在位）。

| vid | 物品 | 使用方式 | 效果 | buff | buff时长 | 效果实装 | 冷却 | 贴图 | 结论 | 我方行号 | 原版行号 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 蘑菇 Mushroom | useStyle2/17t | healLife 15 | 药水病30s(mushroom 1800t) | - | 回血+分档✅ | 17 | Item_5✅ | 📋(缺 TryToResetHungerToNeutral,dontStarve only) | Game.ts:8322-8358/:6457 | Item.cs:1424-1436/Player.cs:51110-51114 |
| 28 | 弱效治疗药水 | useStyle9/17t | healLife 50 | 药水病60s | - | ✅ | 17 | Item_28✅ | ✅ | Game.ts:8335-8339 | Item.cs:1693-1705 |
| 110 | 弱效魔力药水 | useStyle9/17t | healMana 50 | 魔力眩晕5s(300t) | - | ✅(主链) | 17 | Item_110✅ | ✅ | Game.ts:8340-8344 | Item.cs:2662-2673 |
| 126 | 瓶装水 BottledWater | useStyle9/17t | healLife 30 | 药水病45s(restoration 2700t) | - | ✅分档 | 17 | Item_126✅ | ✅ | Game.ts:6450-6451 | Item.cs:2879-2891/Player.cs:51099-51102 |
| 188 | 治疗药水 | useStyle9/17t | healLife 100 | 药水病60s | - | ✅ | 17 | Item_188✅ | ✅ | Game.ts:8335 | Item.cs:3669-3682 |
| 189 | 魔力药水 | useStyle9/17t | healMana 100 | 魔力眩晕5s | - | ✅(主链) | 17 | Item_189✅ | ✅ | Game.ts:8340 | Item.cs:3683-3692 |
| 227 | 恢复药水 | useStyle9/17t | healLife 90 | 药水病45s | - | ✅分档(QuickHeal 溢出30宽容:6548 亦有) | 17 | Item_227✅ | ✅ | Game.ts:6450/:6548 | Item.cs:4177-4191/Player.cs:5322-5327 |
| 499 | 强效治疗药水 | useStyle9/17t | healLife 150 | 药水病60s | - | ✅ | 17 | Item_499✅ | ✅ | Game.ts:8335 | Item.cs:7304-7317 |
| 500 | 强效魔力药水 | useStyle9/17t | healMana 200 | 魔力眩晕5s | - | ✅(主链) | 17 | Item_500✅ | ✅ | Game.ts:8340 | Item.cs:7318-7330 |
| 1134 | 蜂蜜瓶 BottledHoney | useStyle9/17t | healLife 80 | Honey(48) 15s + 药水病60s | 900t | ✅(48→BuffType.Honey tick 1HP/s) | 17 | Item_1134✅/Buff_48✅ | ✅ | Game.ts:8330-8333 | Item.cs:13922-13936 |
| 1912 | 蛋奶酒 Eggnog | useStyle9/17t | healLife 80 | 药水病40s(eggnog 2400t) | - | ✅分档 | 17 | Item_1912✅ | 📋(同 vid5 缺饥饿重置) | Game.ts:6452-6453 | Item.cs:20715-20728(:47999 二次 SetDefaults)/Player.cs:51104-51108 |
| 2209 | 超级魔力药水 | useStyle9/17t | healMana **400→应300** | 魔力眩晕5s | - | 数据错:全链多回100蓝 | 17 | Item_2209✅ | ❌ | vanilla-itemfunc.json"2209" | Item.cs:22321-22333(healMana=300) |
| 2314 | 蜂蜜鱼 Honeyfin | useStyle2/17t | healLife 120 | 药水病60s(默认档) | - | ✅ | 17 | Item_2314✅ | ✅ | Game.ts:8335-8338 | Item.cs:23093-23106 |
| 3001 | 诡药 StrangeBrew | useStyle9/17t | healLife 70(应随机70-120) | 药水病40-70s随机✅ | - | ⚠️固定70,缺随机段+10/20/30%档240/120/60 i-帧 | 17 | Item_3001✅ | ⚠️ | Game.ts:8336/:6441-6444 | Item.cs:27638-27651/Player.cs:51126-51146 |
| 3544 | 超级治疗药水 | useStyle9/17t | healLife 200 | 药水病60s | - | ✅ | 17 | Item_3544✅ | ✅ | Game.ts:8335 | Item.cs:31865-31878 |
| 5496 | 丛林果汁 JungleJuice | useStyle9/17t | healLife 180 | 药水病60s | - | ✅ | 17 | Item_5496✅ | ✅ | Game.ts:8335 | Item.cs:43298-43310 |

贤者石(催化指环 6185)pStone ×0.75：3001 当次乘区/227·126·5·默认档 ✅（Game.ts:6439-6459,
1912 eggnog 档不吃 ✅ = Player.cs:25193-25200 只重置三档）。

### B. 食物链（WellFed 26/206/207，82 件）

**数据面对账：82 件（26 档 42 / 206 档 26 / 207 档 14）的 buffType/buffTime/useStyle
与 Item.cs DefaultToFood 调用逐字段全同（脚本 0 diff）**——含 JojaCola 5275(2min)、
Golden Delight 4022(48min)、Bacon 3532(24min) 等极端档。useTime 全 17（DefaultToFood
:48171，itemcombat 表缺项由 Game.ts:8346 `??17` 兜底 ✅）。

| 维度 | 实装 | 结论 |
|---|---|---|
| 使用方式 | useStyle 2 咀嚼(Item_2)/9 仰饮(Item_3,useGulpSound) 分档音效 ✅（Game.ts:6466-6473 foodUseSound+itemUseSound 表） | ✅ |
| 三档数值 | def+2/3/4、全系暴击+2/3/4、全系伤+5/7.5/10%、近战速+5/7.5/10%、移速+20/30/40%、镐速-5/10/15%（Buffs.ts:908-950 wellFedTier 族 → Player.ts:1386/1400/1425/1498 + Game.ts:10724 + Buffs.ts:845/869） | ✅ |
| 换档互斥 | IsFedState 授予任一档先删其它档（Buffs.ts:642-646 = Player.cs:5080-5089） | ✅ |
| 饥饿链 | 332/333/334 三态+链尾转移+极饿双掉血（Buffs.ts:599-633/769-784）；吃食物清饥饿链经换档互斥达成 | ✅ |
| QuickBuff 食物优先级 | 26→1/206→2/207→3（Game.ts:6481 QUICK_BUFF_FOOD_PRIO = Player.cs:5648-5656） | ✅ |
| 专家/大师时长 | BUFF_TIME_EXTENDED_BY_DEAD_CELLS 38 id ×1.2（DeadCellsPotionStation）+ debuff 表难度延展（Buffs.ts:258-260/648-658） | ✅ |
| 蘑菇5/蛋奶酒1912 清饥饿 | TryToResetHungerToNeutral（Player.cs:11672，ApplyPotionDelay :51107/:51113 调）未接——仅 dontStarve 世界可感 | 📋登记 |

### C. BUFF_DEFS 122 条逐条效果实装

图例：✅=有真实每帧/属性消费；📋=仅登记/数据层（无消费逻辑，原版亦为标记位或授予侧未接）；
⚠️=部分实装。

| 枚举(=枚举id) | vb | 效果 | 消费点 | 实装 |
|---|---|---|---|---|
| Agility=0 | 3 | 移速×1.25 | Buffs.ts:834→Player.ts:2333 | ✅ |
| Ironskin=1 | 5 | 防+8 | Buffs.ts:862 | ✅ |
| Resistance=2 | 21 | 禁治疗药 | Buffs.ts:973→Game.ts:8323/:6538/:20369 | ✅ |
| Thorns=3 | 14 | 反伤×1.0(cap1000) | Buffs.ts:963→Player.ts:1349/1354 | ✅ |
| Regen=4 | 2 | 2HP/s | Buffs.ts:734 | ✅ |
| Campfire=5 | 87 | 光环0.5HP/s | Buffs.ts:793+Game 20t 扫描 | ✅ |
| Honey=6 | 48 | 1HP/s+DoT对冲 | Buffs.ts:735/:787-790 | ✅ |
| OnFire=7 | 24 | DoT 4HP/s(vampireSeed 50) | Buffs.ts:499/:759 | ✅ |
| Burning=8 | 67 | DoT 30HP/s+移速减半 | Buffs.ts:505/:856 | ✅ |
| Bleeding=9 | 30 | 清自然恢复计时 | Player.ts:1864 | ✅ |
| Suffocation=10 | 68 | DoT 20HP/s | Buffs.ts:506 | ✅ |
| ObsidianSkin=11 | 1 | 岩浆免疫+火行+免着火 | Player.ts:2130/:2178 | ✅ |
| Gills=12 | 4 | 水下不溺(ftw 翻转) | Player.ts:2205-2207 | ✅ |
| ManaRegen=13 | 6 | 魔力再生常开+免低蓝惩罚 | Player.ts:1624/1919/1943/1946 | ✅ |
| MagicPower=14 | 7 | 魔伤+20% | Buffs.ts:1008→Player.ts:1410 | ✅ |
| Featherfall=15 | 8 | 重力/3+免摔 | Player.ts:3150/3177 | ✅ |
| WaterWalking=16 | 15 | 水上行走 | Player.ts:2040 | ✅ |
| Archery=17 | 16 | 箭伤×1.1+箭速×1.2 | Player.ts:1415/1445+Buffs.ts:1018 | ✅ |
| NightOwl=18 | 12 | 夜视光衰×1.03 | Game.ts:5822 | ✅ |
| Sunflower=19 | 146 | 移速×1.21 复合 | Buffs.ts:839 | ✅ |
| CatBast=20 | 215 | 防+5 | Buffs.ts:863 | ✅ |
| StarInBottle=21 | 158 | 魔再+10/延迟+0.5 | Player.ts:1912/1914 | ✅ |
| PeaceCandle=22 | 157 | 刷怪×1.3/上限×0.7 | Game.ts:4923→VanillaSpawner.ts:938 | ✅ |
| Clairvoyance=23 | 29 | 蓝上限+20✅；魔伤+5%/魔暴+2/耗魔-2%缺 | Buffs.ts:901（仅 manaMaxBonus） | ⚠️ |
| Sharpened=24 | 159 | 近战穿甲+12 | Player.ts:1469/:3398 | ✅ |
| AmmoBox=25 | 93 | 1/5 不耗弹 | Game.ts:6755 ammoSaveRoll（前次矩阵审计已抓回） | ✅ |
| Bewitched=26 | 150 | 随从+1 | Player.ts:1339 | ✅ |
| WarTable=27 | 348 | 哨塔+1 | Player.ts:1346 | ✅ |
| SugarRush=28 | 192 | 移速×1.2✅；镐速-0.2缺 | Buffs.ts:844；Game.ts:10718 链无此项 | ⚠️ |
| SoulDrain=29 | 151 | 吸魂回复(5+n)/2 | Player.ts:1770/1858-1860 | ✅ |
| Battle=30 | 13 | 刷怪×0.5/上限×2 | Game.ts:16651 | ✅ |
| Calming=31 | 106 | 刷怪×1.65/×0.6+仇恨-1000 | Game.ts:16651+Enemy.ts:1238/1266/1313 | ✅ |
| Mining=32 | 104 | 镐速-0.25 | Game.ts:10720 | ✅ |
| Builder=33 | 107 | 放置+0.25×2+范围+1 | Game.ts:10368/12304/12319 | ✅ |
| Heartreach=34 | 105 | 拾心范围+60 | Player.ts:5094 | ✅ |
| FlipperPotion=35 | 109 | 水中自由泳 | Player.ts:2713/2976/3313+Renderer.ts:8247 | ✅ |
| Titan=36 | 108 | 击退×1.5 | Game.ts:16159+Player.ts:3014/3105 | ✅ |
| AmmoReservation=37 | 112 | 1/5 不耗弹 | Game.ts:6758 | ✅ |
| Lifeforce=38 | 113 | maxHp+20% | Player.ts:1326 | ✅ |
| Endurance=39 | 114 | 受伤×0.9 | Player.ts:5207/5248 | ✅ |
| Wrath=40(名实对调:vb115=原版Rage) | 115 | 三系暴击+10 | Player.ts:1489 | ✅ |
| Rage=41(vb117=原版Wrath) | 117 | 四系伤+10% | Player.ts:1398/1417 | ✅ |
| Tipsy=42 | 25 | 防-4/近战暴+2/伤+10%/速+10%/召唤kb+1 | Buffs.ts:864/898+Player.ts:1382/1419/1491 | ✅ |
| ImbueVenom=42 | 71 | 敌Venom 5-10s | Game.ts:16163+projStatus.ts:188+Pvp.ts:66 | ✅ |
| ImbueCursed=43 | 73 | 敌CursedInferno 3-7s | projStatus.ts 同表 | ✅ |
| ImbueFire=44 | 74 | 敌OnFire 3-7s | 同表 | ✅ |
| ImbueGold=45 | 75 | 敌Midas 2s | Game.ts:16170+projStatus.ts:195 | ✅ |
| ImbueIchor=46 | 76 | 敌Ichor 10-20s | 同表 | ✅ |
| ImbueNano=47 | 77 | 敌Confused 1-4s | 同表 | ✅ |
| ImbueParty=48 | 78 | 命中彩带 | Game.ts:16204+projStatus.ts:199 | ✅ |
| ImbuePoison=49 | 79 | 敌Poison 5-10s | 同表 | ✅ |
| Inferno=50 | 116 | 200px 光环烧敌 | Game.ts:14542+光:5921 | ✅ |
| Shine=51 | 11 | 玩家格常亮 | Game.ts:5920 | ✅ |
| Spelunker=52 | 9 | 矿物高亮 | Renderer.ts:11287 | ✅ |
| Dangersense=53 | 111 | 陷阱高亮 | Renderer.ts:11288 | ✅ |
| Hunter=54 | 17 | 敌怪高亮 | Renderer.ts:11290 | ✅ |
| BiomeSight=55 | 343 | 群系方块高亮 | Renderer.ts:11289 | ✅ |
| Luck=56 | 257 | 幸运三档(>600s/300s) | Player.ts:5134 | ✅ |
| Summoning=57 | 110 | 随从+1 | Player.ts:1340 | ✅ |
| Fishing=58 | 121 | 钓技+15 | Game.ts:18206+Bobber.ts:133 | ✅ |
| Sonar=59 | 122 | 渔获声呐 | Bobber.ts:324/468 | ✅ |
| Crate=60 | 123 | 宝匣率+ | Bobber.ts:282 | ✅ |
| Gravitation=61 | 18 | 重力翻转 | Game.ts:4309 | ✅ |
| Chilled=62 | 46 | 移速×0.75 | Buffs.ts:858→Player.ts:2329 | ✅ |
| Frozen=63 | 47 | 封移动输入 | Player.ts:2343/2402/2417+Game.ts:7084+GrappleProj.ts:130 | ✅ |
| WellFed=64 | 26 | 食档1 | wellFedTier 全链（Buffs.ts:908-932） | ✅ |
| WellFed2=65 | 206 | 食档2 | 同上 | ✅ |
| WellFed3=66 | 207 | 食档3 | 同上 | ✅ |
| MoonLeech=67 | 145 | 禁吸血/回复弹 | Game.ts:19894（吸血链未实装,getter 备用） | ✅ |
| Obstructed=68 | 163 | 遮屏+清再生 | Player.ts:1864/1866+5844 | ✅ |
| ManaSickness=69 | 94 | 魔伤线性-25% | Buffs.ts:1012→Player.ts:1411 | ✅ |
| Shimmered=77 | 353 | 微光化(frozen+免伤+穿墙) | Player.ts 9 处 shimmering | ✅ |
| Werewolf=71 | 28 | 夜间近战包+0.5HP/s | Player.ts 11 处+Buffs.ts:739 | ✅ |
| BrainOfConfusionBuff=72 | 321 | 三系暴+10/召唤伤+10% | Player.ts:1399/1490/3405 | ✅ |
| Weak=73 | 33 | 近战-5.1%/防-4/移速×0.9 | Player.ts:1384/1421+Buffs.ts:840/865 | ✅ |
| KiteBuff=75 | 383 | 移速+15%/镐-10%/放+15%/幸运三档 | Buffs.ts:842/936+Game.ts:10722/12306/12321 | ✅ |
| Stinky=76 | 120 | 幸运-0.25 | Player.ts:5126+PoopProj.ts:98 | ✅ |
| Poisoned=78 | 20 | DoT 2HP/s | Buffs.ts ENV_DOTS:497 | ✅ |
| Horrified=79 | 37 | 见墙惊恐(gross) | Player.ts 3 处 | ✅ |
| TheTongue=80 | 38 | 肉山舌(禁道具+50HP/s) | Player.ts 7 处 | ✅ |
| Slow=81 | 32 | 移速×0.5 | Buffs.ts:857 | ✅ |
| Stoned=82 | 156 | 石化封全输入 | Player.ts 12 处 | ✅ |
| ChaosState=83 | 88 | 混沌期传送扣血 | Game.ts:8285-8305+Player.ts 3 处 | ✅ |
| CompanionCube=84 | 191 | 同伴方块光宠 | Game.ts:8258-8280+Player.ts 2 处 | ✅ |
| Venom=85 | 70 | DoT 15HP/s | ENV_DOTS:498 | ✅ |
| CursedInferno=86 | 39 | DoT 12HP/s | ENV_DOTS:504 | ✅ |
| OnFire3=87 | 323 | DoT 4HP/s | ENV_DOTS:501 | ✅ |
| Frostburn=88 | 44 | DoT 8HP/s | ENV_DOTS:502 | ✅ |
| Frostburn2=89 | 324 | DoT 8HP/s | ENV_DOTS:503 | ✅ |
| Confused=90 | 31 | 控制反转 | Player.ts:2347+Pvp.ts:51 | ✅ |
| Ichor=91 | 69 | 防-15 | Buffs.ts:866 | ✅ |
| BrokenArmor=92 | 36 | 防减半 | Player.ts:703 | ✅ |
| Electrified=93 | 144 | DoT 4HP/s(移动+16) | ENV_DOTS:507+:756 electrifiedMoving | ✅ |
| Invisibility=94 | 10 | 刷怪×1.2/上限×0.8（敌怪索敌无视=登记） | Game.ts:16655 | ✅(部分,登记) |
| Darkness=95 | 22 | 黑暗光衰 | Game.ts:5824+Player.ts:5844 | ✅ |
| Cursed=96 | 23 | 封道具使用 | Game.ts:7086+Player.ts:5470 | ✅ |
| Blackout=97 | 80 | 熄灯光衰×0.85 | Game.ts:5823+Player.ts:5844 | ✅ |
| Webbed=98 | 149 | 定身(moveSpeed=0+摘钩) | Player.ts:2402 等 4 处 | ✅ |
| VortexDebuff=99 | 164 | 重力0+正弦悬浮 | Player.ts:2659-2664 | ✅ |
| WitheredWeapon=100 | 196 | 全系伤×0.5 | Player.ts:1403/1432 | ✅ |
| WitheredArmor=101 | 195 | 防减半 | Player.ts:704+bossAI_dd2.ts:2226 | ✅ |
| Wet=102 | 103 | 火系免疫+滴水视觉 | Player.ts:1252/1260+Game.ts:19635 | ✅ |
| SolarShield1/2/3=103/104/105 | 170/171/172 | 日耀盾层视觉 | Player.ts:1846 | ✅ |
| DryadsWard=106 | 165 | 再生3HP/s+防+8/荆棘0.5 | Buffs.ts:738/868/965 | ✅ |
| NeutralHunger=108 | 332 | 饥饿链首(无属性) | Buffs.ts:602/617 FED_STATE | ✅ |
| Hunger=109 | 333 | 防-2/暴-2/伤-5%/速-5%/镐+5% | Buffs.ts hungerTier:874-899 | ✅ |
| Starving=110 | 334 | 极饿负面+双掉血 | Buffs.ts:769-784 | ✅ |
| ManaHeat=111 | 396 | 魔力过热线性衰减 | Player.ts:1638/1654 | ✅ |
| Warmth=112 | 124 | 46/47 削时✅；resistCold 寒冷伤×0.7 缺(敌 coldDamage 表未移植) | Buffs.ts:661-675 | ⚠️ |
| PotentAcid=113 | 395 | 敌侧 90HP/s DoT | projStatus.ts:56(表驱动)+Enemy DOTTally | ✅(敌侧) |
| ChlorophyteSpore=114 | 397 | 敌侧 90HP/s+孢子VFX | projStatus.ts:57 | ✅(敌侧) |
| AcceleratePoisons=115 | 398 | 敌侧可加速 DoT×2 | projStatus.ts:58 | ✅(敌侧) |
| BlueLightning=116 | 399 | 敌侧视觉粒子 | projStatus.ts:59 | ✅(敌侧) |
| RedLightning=117 | 400 | 敌侧视觉粒子 | projStatus.ts:60 | ✅(敌侧) |
| PalworldMinionTrustyCattiva=118 | 389 | 召唤物计数伴生 | 无消费（批B 数据层,授予侧弹 AI 1112 未接） | 📋 |
| PalworldMinionTrustyFoxsparks=119 | 390 | 同上 | 无消费（弹 1113 未接） | 📋 |
| PalworldMountTrustyChillet=120 | 391 | 坐骑伴生 | 无消费（Mounts 批C 待接） | 📋 |
| PalworldMountTrustyChilletIgnis=121 | 392 | 坐骑伴生 | 无消费 | 📋 |
| ClayPotMinion=122 | 393 | 召唤物伴生 | 无消费（弹 1118 未接） | 📋 |
| ForbiddenMinion=123 | 394 | 召唤物伴生 | 无消费（弹 1119 未接；AI_206 本体在 MinionProj.ts:1168） | 📋 |

统计：✅ 106 / ⚠️ 3（Clairvoyance、SugarRush、Warmth）/ 📋 7（Palworld 六件+登记类）+
Invisibility 部分实装（登记）。零消费死条目仅 Palworld 六件（注释已自登记批 B）。

### D. 耐药性（PotionSickness 21）专项

| 项 | 原版 | 我方 | 结论 |
|---|---|---|---|
| 默认档 | potionDelay 3600t=60s（Item.cs:70） | 3600t✅ | ✅ |
| 恢复药水 227/126 | restorationDelay 2700t=45s（Item.cs:72） | ✅ Game.ts:6450 | ✅ |
| 蛋奶酒 1912 | eggnogDelay 2400t=40s（Item.cs:74） | ✅ :6452 | ✅ |
| 蘑菇 5 | mushroomDelay 1800t=30s（Item.cs:76） | ✅ :6456 | ✅ |
| 诡药 3001 | Next(2400,4201)=40-70s | ✅ :6441 | ✅ |
| 贤者石 ×0.75 | 三档+3001 当次（Player.cs:25193-25200/:51094） | ✅（1912 豁免同源） | ✅ |
| 使用门 | potion 件 potionDelay>0 → 拒用（:51379，无动画无消耗） | healBlocked→toast+useTime30（Game.ts:8323-8328） | 📋微差 |
| QuickHeal 门 | :5270 potionDelay | Game.ts:6538 healBlocked✅ | ✅ |
| QuickMana 门 | :5399 `potionDelay==0 \|\| !potion` | Game.ts:6573 healBlocked&&f.potion✅ | ✅ |
| 施加方式 | AddBuff(21,delay) max 合并 | buffs.apply(Resistance)✅（21 不入 DEBUFFS/护士不可清原版同源） | ✅ |
| 贴图 | Buff_21.png | ✅在位 | ✅ |

### E. ⚠️/❌ 修复要点（按优先级）

1. **❌ vid 2209 超级魔力药水 healMana 400→300**
   - `game/src/data/vanilla-itemfunc.json` 键 `"2209"`：`"healMana":400` → `"healMana":300`
     （1456 权威 Item.cs:22323 `healMana = 300;`；1405 :29988 的 400 是 SetDefaults4 case 3001
     旧值，提取器误并）。影响主链 Game.ts:8340、quickConsume :6734、quickDrinkPotion :20386
     三处消费——全部多回 100 蓝。

2. **❌ quickConsume 魔力眩晕门错（QuickMana/QuickBuff 路径喝蓝不挂 94）**
   - `game/src/core/Game.ts:6735`：`if (f.potion) p.buffs.apply(BuffType.ManaSickness, 5);`
     → 去掉 `f.potion` 门（原版 ApplyLifeAndOrMana :51166-51168 对 `healMana>0` 无条件
     AddBuff(94,300)）。4 件蓝药均无 potion 旗 → 现网该门恒 false，QuickMana 零魔力眩晕。

3. **⚠️ quickDrinkPotion 药水病写死 60s（移动端药水键）**
   - `game/src/core/Game.ts:20381`：`p.buffs.apply(BuffType.Resistance, 60)` →
     `this.applyPotionSickness(vanillaIdOfItem(s.id))`（注释自称"同构镜像"，实际丢了
     ApplyPotionDelay 五档分档：5=30s/1912=40s/227·126=45s/3001=40-70s/其余 60s）。

4. **⚠️ quickDrinkPotion useTime 写死 60**
   - `game/src/core/Game.ts:20389`：`p.useTime = 60` → `p.useTime = itemCombat(vid)?.useTime ?? 17`
     （DefaultToFood/HealingPotion :48171/:48176 均 17；主链 :8346 已对）。

5. **⚠️ 诡药 3001 缺随机回复与 i-帧档**
   - `game/src/core/Game.ts:8335-8338`（主链）与 :20379（快捷链）：vid 3001 时
     heal = 70+⌊rand×51⌋（Next(70,121)），另 rand：≤0.1→240 / ≤0.3→120 / ≤0.6→60
     SetImmuneTimeForAllTypes（Player.cs:51126-51146）。建议在 vi 桥 healLife 段前加
     3001 特判（与 applyPotionSickness 的 3001 特判同位）。

6. **⚠️ Clairvoyance(29) 三缺一**
   - `game/src/stats/Buffs.ts:901` manaMaxBonus 之外补三个 getter 并接线：
     magicDamage+0.05 / magicCrit+2 / manaCost-0.02（Player.cs:11481-11485）。
     消费点：Player.ts:1410 魔伤链、:1489 暴击链、:848 manaCostMul 链。

7. **⚠️ SugarRush(192) 缺镐速 -0.2**
   - `game/src/core/Game.ts:10718-10725` pickSpeed 加法链补
     `- (buffs.has(BuffType.SugarRush) ? 0.2 : 0)`（Player.cs:9634 pickSpeed -= 0.2f；
     移速半边 Buffs.ts:844 已对）。

8. **⚠️ Warmth(124) resistCold 无消费方**
   - 敌侧 `NPC.coldDamage`（16 件冰系怪 SetDefaults 置位）未移植 → Player.cs:30961-30963
     接触伤 ×0.7 与 Projectile.cs:13764 弹侧 ×0.7 落空。接法：TouchDamage/Enemy 表补
     coldDamage 旗 + Player 受击链 `if (buffs.has(Warmth) && src.coldDamage) dmg*=0.7`。
     46/47 削时半边（Buffs.ts:661-675）已对，无需动。

9. **⚠️(低危) UI 兜底图标 Wrath/Rage 互调**
   - `game/src/ui/UI.ts:3698` 与 :3877 两处：`[BuffType.Wrath,'vi_2349_WrathPotion']`
     ↔ `[BuffType.Rage,'vi_2347_RagePotion']` 应互换（BuffType.Wrath=vanilla 115=Rage buff,
     对应药水 2347；BuffType.Rage=117 对应 2349）。仅 Buff_N 缺图 onerror 兜底路径,
     115/117.png 在位故现网不可见。

**📋 登记不修（微差/原版同款）**：healBlocked 拒用带 toast+30t（原版静默）；5/1912
TryToResetHungerToNeutral 未接（仅 dontStarve 世界）；5573 火把神勋章=永久置旗 vs 原版
buff 376 8min 限时转火把（Game.ts:8165，语义偏差备案）；3857 buffType 200 应 202
（武器类,Item.cs:34018-34021 内层 switch,提取器漏）；quickConsume buffTime 缺省 3600 vs
主链 7200 不一致（现网无无 buffTime 的可饮件）；Palworld 六件 389-394 授予侧未接（批 B 自登记）。

### SW-FX2 收口批（2026-09-09，上节 📋 四键 + 58 缺口正式销账）

> 测试 `tests/sw-fx2-buff-gap.test.ts`（23 例）+ 实机探针 `scripts/_swfx2-petbuff-probe.mjs`
> （10/10）。变异证红：DEFS 映射污染 / pets.json 3855 回退 / 补挂面时长污染三mutation 均红。

| 项 | 裁决 | 落点 |
|---|---|---|
| 58 缺口 | 59 id（文档题头 58 系误计）全部入档：轻 46（buff-defs-gap 批）+ 重 13 中 125/126/139/140/322/325/385/386（随从杖伴生批）+ 376（TorchGodPotion 批）+ 残余重 4 件 40/41/42/127（本批） | Buffs.ts 枚举 325+ |
| 58 缺口顺带 | vanilla-pets.json 全表反查收尾：另入档 202/217/219/259/261/268 + 表尾 25 件（218/258/260/262/264/266/267/274/317/327-331/341/345/349/351/352/354/356/371/372/373/382） | Buffs.ts 枚举 329-359 |
| 四键① 3857 | itemfunc 已是 202（后批提取器修）；DEFS 缺收口位 → PetDD2Dragon=202 入档；★pets.json 3855 行勘误 201/702/light=1 → **200/703/vanity**（原行与 3856 整行重复,Item.cs:34017-34022 共享块缺省臂 + Main.cs:9378 vanityPet[200]） | vanilla-pets.json/petai +703 行 |
| 四键② healBlocked | **收口为静默拒用**（Player.cs:52856-52858 1457 锚）：主链+QuickHeal 两处 live 站点去 toast/useTime30；死代码支 :13047（.potion 字段 0 条）不动 | Game.ts |
| 四键③ quickConsume | **统一 3600**（ItemCheck_UsePotionStuff Player.cs:5518-5524；7200 仅 36/33/192 三条独立 AddBuff）——主链+QuickHeal `?? 7200` → `?? 3600` | Game.ts |
| 四键④ 5/1912 + 5573 | IIII219/consumable-remainder 批已接：TryToResetHungerToNeutral（:52507/:52513）与 5573=限时 buff 376 不置旗、5043=置旗侧（:45611-45628）——本批以测试锁定 | sw-fx2 D 节 |
| 重 4 件消费面 | UpdatePet/UpdatePetLight 补挂面 1:1（1457 Player.cs:17414-17445）→ Game.updatePetSlot：装备槽在位+未隐藏+FindBuffIndex==-1 → AddBuff(3600)+UseSound；无死亡门；TogglePet/ToggleLight 隐藏臂 ClearBuff（:17447-17463） | Game.ts updatePetSlot/togglePetSlot |
| UI 防双图标 | 宠物 buff 已入 BuffState 后，普通循环跳过宠物 buff（UI.petVanillaBuffs 哨兵），图标仍由宠物通道独家承载（右键收宠语义不变） | UI.ts refreshBuffs |

**剩债**：① boss 宠 21 件（buff 284-304,物品 4797-4817 在仓）vanilla-pets.json/petai 无行
→ 召唤件整体惰性,须宠物内容批一并落（DEFS 单边入档=死条目故留）；② 宠物件 use=装备
切换仅 669/753（P3-B 泛化另批）；③ itemfunc 3855 行缺（提取器共享 case+内层 switch 盲区,
pets.json 已纠运行时无损）；④ Game.ts:13047 死代码支 toast 未清；⑤ onBuffsFrame 声明/
接线齐但 Game 全文无调用点（tickBuffLive 即时整刷通道断,宠物图标 1Hz 后现）——未建模备案。

### F. 药水/Buff 部分实装缺口修复批（2026-08-22 下午，tests/buff-partial-fixes.test.ts 24 例全绿）

| # | 项 | 落点 | 定案依据 |
|---|---|---|---|
| 1 | Clairvoyance(29) 补三项 | Buffs.ts `clairvoyanceMagicDamage/MagicCrit/ManaCostMult` 三 getter；magicDmgBonus 并入 +0.05；Player.critChance('magic') +2；computeEquipStats manaCostMul ×0.98 | Player.cs:11481-11485 |
| 2 | SugarRush(192) 镐速 -0.2 | Game.ts tryMine pickSpeed 加法链新项 | Player.cs:9634-9637 |
| 3 | KiteBuff(383) 数值定案 | moveSpeedMult +0.25（Buffs.ts）/pickSpeedMult 与 Game.ts 链 -0.15；tile/wall +0.15 两半边本就对 | 1456 Player.cs:9612-9616（1457 :10003-10004 削档不取）；tests/luck-sources-lifesteal-batch KiteBuff 用例同步改 1456 值 |
| 4 | Stinky(120) 授予 | Game.onProjectileDeath 弹 371 分支：80px 内玩家 Stinky 30s | **审计原文"恶臭药水 1332"有误**——1456 ItemID.cs:4203 `Ichor=1332`（澳液材料）；真身 = StinkPotion **2353**（ItemID.cs:6245，"Throw this to make someone smell terrible"）→ 投掷弹 371 Foul Potion → Kill 段 Projectile.cs:75203-75228 玩家+NPC 80px AddBuff(120,**1800t=30s**，非 600s)；NPC 侧纯视觉未接（本仓敌怪无 buff 体系,登记）；鸟粪弹 1080 半边 PoopProj 既有 |
| 5 | Invisibility(10) 索敌无视 | Player.aggro getter 钳位：未挥击 -750 / 挥击 -250（只降不升） | **原版无 TargetClosest 硬门**——NPC.cs:78456-78536 全文无 invisible 判定；真机制 = Player.cs:25437-25445 aggro 钳位 → TryTrackingTarget `num -= aggro` 索敌距离 +750 曼哈顿 + SetTargetTrackingValues 不转向门（Enemy.seekDirX 既有 aggro<0 半边自动激活） |
| 6 | Warmth(124) resistCold | COLD_DAMAGE_NPCS(16 型)/COLD_DAMAGE_PROJS(29 型) 表（projTargets.ts）+ Game.damagePlayer 接触 ×0.7 + hitPlayer 弹侧 ×0.7（(int) 截断,PvP 不乘）；暖冬药水 2359 经 vi 桥自动可达（vi_2359 在册） | Player.cs:30961-30963 / Projectile.cs:13764-13766；NPC 表 = NPC.cs SetDefaults 逐型 coldDamage=true 全 16 型（143-150/154/169/184/185/206/243/343/345/352/629/668）。**★46/47 ÷4/÷2 削时为 1.4.5.7 新增**（1456 AddBuff 全链 :5066-5203 无 Warmth 分支;wiki Desktop 1.4.5.7 条目）——按 1457 保留已备案,审计原文"已对"引线 :5292-5315/:5429-5437 系陈注释 |
| 7 | CompanionCube(191) | **不修——审计误植定谳**：":24924-24931 微光变身 Hurt(20×难度)"实为 **Stoned(156)** 变身伤害（1456 全仓 ByOther(5) 仅 :24929/:25067 两处均在 stoned 分支;弹 653/物品 3628 无任何微光分支,wiki Companion Cube 页无 Shimmer 交互）；该行为本仓 Player.ts 石化过渡段已实装。已锁真实行为（Stoned Hurt 20×难度 + 宠物失 buff 即散 + 黑暗捅人 Hurt(3,ByOther(6))） | Player.cs:24924-24931 / Projectile.cs:46655-46860 |
| 8 | 诡药 3001 | Game.strangeBrewRoll()：heal=Next(70,121) + NextFloat ≤0.1→240/≤0.3→120/≤0.6→60 i-帧（iframes=max 不缩短）；**三条**链全接（updateUse 主链/quickDrinkPotion/quickConsume=QuickHeal——审计只列两条,QuickHeal 同经 ApplyLifeAndOrMana 故一并接） | Player.cs:51126-51146 |

回归：buffs 域 13 文件 154 例全绿；mining/multi-targeting/moon-shop-aggro 29 例全绿；
tsc 零新增（game src 0 错）。tests/tool-parity-fixes F3 两例（2772-2775 注册）为并行
会话在途数据未落,非本批引入。

## 主会话即时修复（审计进行中抓到即修）

| 项 | 修复 | 行号 |
|---|---|---|
| AmmoBox(93) 真空壳 | ammoSaveRoll 并入 1/5 独立掷（与 112 同款；hasAmmoBox 死代码激活） | Game.ts:6757 |

弹药域回归 18/18 绿。

---

## 召唤物/事件触发/功能杂项/电路工具 分区审计（2026-08-22）

> 范围：Boss 召唤物、事件触发物、传送/钩爪/坐骑/宠物、电路工具。
> 标杆：`Terarria1456/`（Player.cs ItemCheck_UseBossSpawners :43071-43237、
> ItemCheck_UseEventItems :43243-43366、ItemCheck_CheckCanUse_Inner :51160-51460、
> NPC.cs SpawnBoss :81444-81513 / SpawnOnPlayer :81273-81360；Item.cs SetDefaults 各 case）。
> 贴图列说明：全部 vi_ 物品经 `vanilla.json` 自动注册 + SpriteAtlas vid 回退直引原版
> Item_Atlas 帧（Renderer.ts:111），29 件抽查全 OK——下表不再逐行复述。

### 任务清单 ID 勘误（清单所记 vid 与 1.4.5.6 不符，按权威 id 审计）

| 清单写法 | 权威 vid | 实际物品 |
|---|---|---|
| 雪球 605 | **602** | 605 = 精金梁墙（AdamantiteBeamWall）；雪球仪 = SnowGlobe 602 |
| 骷髅王 3611 | **1307** | 3611 = 宏伟蓝图（The Grand Design）；骷髅王无物品，经老人诅咒/裁缝娃杀裁缝 |
| 肉山 3183 | **267** | 3183 = 金虫网（GoldenBugNet）；肉山经向导巫毒娃娃入熔岩 |
| 石巨人 1291 | **1293** | 1291 = 生命果（LifeFruit）；石巨人经丛林蜥蜴电池 1293 右键祭坛 |
| 世纪之花 2073 | 无物品 | 2073 = 乌木浴缸；世纪之花砸球茎 tile 238 召唤 |
| 火星宇宙飞船 2596 | 无物品 | 2596 = 生命木时钟；火星入侵由火星探测器 NPC 392 逃逸触发 |
| 天界印记 3601 | 3601 ✅ | 天界符（CelestialSigil），同一件 |

### 审计表

| vid | 道具 | 使用条件 | 效果 | 消耗 | 冷却 | 门 | 贴图 | 结论 | 我方行号 | 原版行号 |
|---|---|---|---|---|---|---|---|---|---|---|
| 43 | 可疑的眼球 | 夜晚（白天原版整支不可用） | SpawnOnPlayer(4) 屏外寻点 + HasAwoken + Roar15 | 成功才扣 | 我方 30 / 原版 45 | 同型 43↔4 ✓ | ✅ | ⚠️ | Game.ts:7958-7972, 22324-22346 | Player.cs:43090-43105, :51408-51410; Item.cs:1867-1875 |
| 70 | 蠕虫食物 | ZoneCorrupt（群系外静默） | SpawnOnPlayer(13) 世吞 + 公告 + Roar | 成功才扣 | 45 ✓ | 同型 70↔13 ✓ | ✅ | ✅ | Game.ts:8749-8775 | Player.cs:43107-43121; Item.cs:2191-2199 |
| 1331 | 血腥脊椎 | ZoneCrimson（群系外静默） | SpawnOnPlayer(266) 克脑 | 成功才扣 | 45 ✓ | 同型 1331↔266 ✓ | ✅ | ✅ | Game.ts:8746-8773 | Player.cs:43194-43208; Item.cs:16460-16468 |
| 560 | 史莱姆王冠 | 无门 | SpawnOnPlayer(50) 史王（NewNPC Type==50 恒播 HasAwoken :81564）+ Roar | 成功才扣 | 45 ✓ | 同型 560↔50 ✓ | ✅ | ✅ | Game.ts:8749-8775, 20024-20034 | Player.cs:43077-43089; NPC.cs:81564-81567; Item.cs:8010-8018 |
| 544 | 机械魔眼 | 夜晚（无 hardMode 门 = 原版语义，注释已核） | SpawnOnPlayer(125)+(126) 双子 + misc[48] + Roar 一声 | 成功才扣 | 45（itemCombat 表缺条目兜 45） | getfixedboi 变体整支禁用 ✓；同型 544↔125/126 我方走"任意 Boss"门 | ✅ | ⚠️ | Game.ts:8777-8806, 22080-22092 | Player.cs:43123-43143, :41520; Item.cs:7852-7864 |
| 556 | 机械蠕虫 | 夜晚 | SpawnOnPlayer(134) 毁灭者 | 成功才扣 | 45（表缺兜 45） | 同型 556↔134 走任意门（备案） | ✅ | ⚠️ | Game.ts:8777-8806 | Player.cs:43144-43158; Item.cs:7984-7996 |
| 557 | 机械颅骨 | 夜晚 | SpawnOnPlayer(127) 骷髅王 Prime | 成功才扣 | 45（表缺兜 45） | 同型 557↔127 走任意门（备案） | ✅ | ⚠️ | Game.ts:8777-8806 | Player.cs:43159-43179; Item.cs:7997-8009 |
| 1133 | 蜜蜂分泌物 | **原版限丛林**（!ZoneJungle → CanUse=false 整支不可用） | SpawnOnPlayer(222) 蜂王 + Item173 蜂音（announceBossSummon 222 特例 ✓） | 成功才扣 | 45 ✓ | ★我方无任何门（注释误记"无门"），任意地点可召 | ✅ | ❌ | Game.ts:8230-8233 | Player.cs:51415-51417, :43181-43191; Item.cs:13913-13921 |
| 4988 | 凝胶水晶 | ZoneHallow（原版静默，我方 toast） | SpawnOnPlayer(657) 史莱姆皇后 + Roar | 成功才扣 | 45 ✓ | 同型 4988↔657 走任意门（备案） | ✅ | ⚠️ | Game.ts:8236-8242 | Player.cs:43210-43224; Item.cs:40159-40167 |
| 5120 | 鹿角怪之物 | ZoneSnow（群系外静默 ✓） | SpawnOnPlayer(668) 鹿角怪 + Roar | 成功才扣 | 45 ✓ | 同型 5120↔668 ✓ | ✅ | ✅ | Game.ts:8808-8818 | Player.cs:43225-43237; Item.cs:41020-41028 |
| 5334 | 奥库瑞姆剃刀 | Mechdusa 世界（remix×getGood，本仓 everything 兜底）+ 场上无任一机械 | SpawnMechQueen：127+125+126+134+139×2 同点 + misc[107] | 成功才扣 | 45 ✓ | 门①机械在场②非 Mechdusa 世界静默 ✓ | ✅ | ✅ | Game.ts:8919-8960, 22053 | Player.cs:43173-43180; NPC.cs:19724-19750; Item.cs:42276-42287 |
| 1293 | 丛林蜥蜴电池 | 右键蜥蜴祭坛 237：!AnyNPCs(245) && hardMode && downed_262（原版静默，我方 toast） | 顺序扣电池 + Roar15(:32328) + SpawnOnPlayer(245) + 公告 | 是 | 无 itemTime（右键交互）✓ | 三重门 ✓ | ✅ | ✅ | Game.ts:13565, 13855-13879, 13907-13925 | Player.cs:32303-32335; NPC.cs:81284-81330 |
| 267 | 向导巫毒娃娃 | 装备→可伤向导；掉落物入熔岩 | 娃娃烧毁：StrikeNPC 杀全场向导 22 + 每杀一次 SpawnWOF（AnyNPCs(113) 门收口）→ 肉山 113 + HasAwoken | 非消耗 | — | 地狱高度门 + 已在场门 ✓ | ✅ | ✅ | ItemDrop.ts:459-487; bossAI_wof.ts:85-140 | WorldItem.cs:731-804; NPC.cs:81112-81191 |
| 1307 | 裁缝巫毒娃娃 | 装备→夜间可伤裁缝；夜杀裁缝 | !day && type==54 && !AnyNPCs(35) && killClothier → SpawnSkeletron（裁缝中心 Bottom 落位）+ 公告无 Roar | 非消耗 | — | 夜 + 无骷髅王 ✓（红帽彩蛋另链 ✓ Game.ts:13091-13130） | ✅ | ✅ | TownNPC.ts:851-873 | NPC.cs:78958-78967, :81220-81270 |
| 2673 | 松露虫 | 钓饵 bait666：浮标海洋带（X<380 / >w-380）且池液>1000 且无猪鲨 | 咬钩窗 ai1∈[-280,-160] → 召猪鲨 370；恒不掉鱼、必耗 | 是（咬钩） | — | 海洋 + 水量 + 无 Duke ✓ | ✅ | ✅ | Bobber.ts:236-246, :408 | Player.cs:19212-19224, :51671-51674 |
| tile 238 | 世纪之花球茎（无物品） | 破坏球茎 + 玩家曼哈顿距离 <50 格 | 2×2 清除 + SpawnOnPlayer(262) 召世花 | — | — | 距离门 ✓；球茎再生成（机械后）另链 ✓ | ✅ | ✅ | Game.ts:11252-11273 | WorldGen.cs:48013-48036 |
| 3601 | 天界符 | downedGolemBoss && hardMode && !AnyDanger && !AnyoneNearCultists（门未过整支不可用 ✓） | Roar15 + StartImpendingDoom(720)（misc[52]+清教徒 437/438/379） | 是 | 45 ✓ | 四重门 ✓ | ✅ | ✅ | Game.ts:8300-8308 | Player.cs:43348-43359; WorldGen.cs:87495-87506; Item.cs:32418-32425 |
| 361 | 哥布林战旗 | CanStartInvasion：无进行中 + 生命上限≥200（无昼夜门 ✓） | StartInvasion(1) + 逼近公告 + Roar15 | 成功才扣 | 45 ✓ | ignoreDelay ✓ | ✅ | ✅ | Game.ts:8907-8928; Invasion.ts:53-58 | Player.cs:43243-43258; Main.cs:63863-63881; Item.cs:5580-5588 |
| 602 | 雪球仪（清单误写 605） | 同 361 | StartInvasion(2) 雪人军团 | 成功才扣 | 45 ✓ | 同 361 ✓ | ✅ | ✅ | Game.ts:8907-8928 | Player.cs:43260-43275; Item.cs:8372-8379 |
| 1315 | 海盗地图 | 同 361（白天可用 = 原版，无 hardMode 门） | StartInvasion(3) 海盗 | 成功才扣 | 45 ✓ | 同 361 ✓ | ✅ | ✅ | Game.ts:8907-8928 | Player.cs:43277-43292; Item.cs:16269-16276 |
| 1844 | 南瓜月勋章 | !dayTime && !南瓜月 && !霜月 && !DD2（不含常规入侵门 = 原版 ✓） | startPumpkinMoon + wave1 公告 + Roar | 是 | 45 ✓ | 夜门 ✓ | ✅ | ✅ | Game.ts:8965-8991 | Player.cs:43294-43306; Main.cs:10903+; Item.cs:20377-20385 |
| 1958 | 邪恶礼物 | 同 1844 | startSnowMoon | 是 | 45 ✓ | 夜门 ✓ | ✅ | ✅ | Game.ts:8965-8991 | Player.cs:43361-43366; Item.cs:21121-21128 |
| 2767 | 日耀碑牌 | dayTime && !eclipse && hardMode（:51431 补 hardMode，我方 Eclipse.ts 同） | eclipse=true + misc[20] + Roar | 是 | 我方 60 / 原版 45 | 三重门 ✓ | ✅ | ⚠️ | Game.ts:8868-8884; Eclipse.ts:85-99 | Player.cs:43308-43328, :51431; Item.cs:26383-26390 |
| — | 火星入侵（无物品；清单误写 2596） | 火星探测器 392 受惊（352px 内玩家在下）→ 逃逸出屏/180t | StartInvasion(4)（160+40n）+ 逼近公告 | — | — | ≥200HP + 无进行中 ✓ | ✅ | ✅ | bossAI_martian.ts:101-152 | NPC.cs:38133-38217 |
| 3828 | 永恒水晶 | 右键水晶座 466：!Ongoing && !AnyNPCs(548) && !南瓜/霜月 && 持有 3828 → 竞技场检查（败=黄字） | 扣水晶 + SummonCrystal（548 水晶+549 门+波1 公告） | 是（原版 reverseOrder 尾扣 + void bag；我方首格顺序扣、无 void bag） | 无 itemTime ✓ | 门链 ✓ | ✅ | ⚠️(微) | Game.ts:13931-13973 | Player.cs:31930-31977; DD2Event.cs:615-626 |
| 50 | 魔镜（族 3124/3199/5358/5359） | 引导 | 半程（useTime/2=45t）Spawn(RecallFromItem) 回出生点 + Item6 | 否 | 90 ✓ | — | ✅ | ✅ | Game.ts:9008-9030, 7088-7092, 15405-15432 | Player.cs:42297-42320; Item.cs:1961-1971 |
| 2350 | 回归药水（Recall） | 引导（起始 Item3 + 10 青尘 ✓） | itemTime==20 → UseSound(Item6)+70 尘+Spawn+保留无敌帧+消耗 | 是 | 我方 90 / 原版 30（触发 tick 20 与音效/尘全对） | — | ✅ | ⚠️ | Game.ts:9018-9030, 15405-15432 | Player.cs:42427-42460; Item.cs:23617-23626 |
| 2351 | 传送药水 | 引导 | itemTime==2 → TeleportationPotion 随机传送 + 消耗 | 是 | 17 ✓ | — | ✅ | ✅ | Game.ts:9018-9030 | Player.cs:42479-42492; Item.cs:23628-23636 |
| 2997 | 虫洞药水 | 联机访客全屏地图点队友头像（28×28 命中盒+非己+同队） | UnityTeleport + TakeUnityPotion；单机不可用 = 原版 | 是 | — | netMode==1 + 同队 + HasUnityPotion ✓ | ✅ | ✅ | Game.ts:14050-14083 | Player.cs:41650-41717, :55406-55450 |
| 4870 | 回归药水（Potion of Return） | 饮用 | 传送（原版=床/回归点 stash；我方出生点近似，注释已备案） | 是 | 30 ✓ | — | ✅ | ⚠️(备案) | Game.ts:8165-8176 | Player.cs:42462-42500 |
| 73…3572 | 钩爪族 | 左键发射 / 装备槽 miscEquips[4] QuickGrapple | AI_007 全表 1:1（射程门/回收速/牵引/并存上限/双钩交替/月钩轮换） | 否 | hi.useTime ✓ | quickMax/quickTotal 杀最旧 ✓ | ✅ | ✅ | Game.ts:20330-20400; grappleHooks.ts | Player.cs:5971-6132; Projectile.cs:49706-49927 |
| 37 件 | 坐骑召唤物 | 左键上/下坐；R QuickMount（装备槽优先→背包扫非矿车） | SetMount/换骑先清 buff/同型再按=下坐（吃冷却防翻转） | 否 | 20（鞍族 useAnimation）✓ | 矿车族分流轨道链 ✓ | ✅ | ✅ | Game.ts:2228-2287, 7952-7955 | Player.cs:42095, :5728-5783 |
| 86 件 | 宠物/光宠召唤物 | 装备 miscEquips[0]/[1]（原版 UpdatePet 装备模型，非左键使用） | PetFollower 跟随 + 光宠点光；hideMisc 翻转=TogglePet/ToggleLight | 否 | — | 死亡/隐藏门 ✓ | ✅ | ✅ | Game.ts:20204-20260 | Player.cs:17147-17208 |
| 4829/4830/4910 | 宠物许可证 | 使用 | 首次=置旗+公告+消耗；已购在场=RerollVariation 换外观+消耗；已购不在场=不触发不消耗 | 条件消耗 | 45 ✓ | — | ✅ | ✅ | Game.ts:8183-8245 | Player.cs:44720-44745; NPC.cs:81640+ |
| 509 | 红扳手 | 射程 20 格（tileBoost） | 铺红线，耗电线 530 | 是（电线） | 5 ✓ | — | ✅ | ✅ | Game.ts:12030-12085; items.ts:752,1155 | Item.cs:7414-7425; Player.cs:30289+ |
| 510 | 钢丝钳 | 射程 20 | 剪线（优先级 致动器>黄>绿>蓝>红） | 否 | 5 ✓ | — | ✅ | ✅ | Game.ts:12018-12026 | Item.cs:7427-7438 |
| 849 | 致动器 | 射程 20 | 放致动器（耗 849） | 是 | 我方 5 / 原版 10 | — | ✅ | ⚠️ | Game.ts:12080 | Item.cs:11307-11317 |
| 3611 | 宏伟蓝图 | 射程 20；须选线色模式（原版 :51224 门）+ R 键四档循环 | 锚点+松开 L 形 MassWireOperation；剪模式免耗 | 否 | 10 ✓（wireOperationsCooldown≈useTime 门） | 模式门 ✓ | ✅ | ✅ | Game.ts:2704-2718, 12028-12045 | Item.cs:32490-32503; Player.cs:51224-51239 |
| 3620 | 致动魔杖 | 射程 20 | 手动翻转致动（actuate） | 否 | 我方 15 / 原版 5 | — | ✅ | ⚠️ | Game.ts:12011-12016 | Item.cs:32584-32596 |
| 3625/3612/850/851 | 五彩/黄/蓝/绿扳手 | 射程 20 | 四色线铺/剪；3625 走 R 键 wireToolMode | 是（电线） | 5 ✓ | — | ✅ | ✅ | Game.ts:12046-12085; items.ts:1155-1163 | Item.cs:32645+, :32504+, :850, :851 |

### ❌/⚠️ 修复要点

1. **❌ 1133 蜜蜂分泌物缺丛林可用门**（唯一行为级 bug）——1456 在
   `ItemCheck_CheckCanUse_Inner`（Player.cs:51415-51417）挂 `type==1133 && !ZoneJungle → flag=false`：
   丛林外整支不可用（不挥动/不消耗/无音效）。我方 Game.ts:8230-8233 无门（注释"无门"是 1405 口径），
   任意地点可召蜂王。修法：case 1133 前置 `if (!this.scene?.zoneJungle) { 静默 return; }`
   （或按本仓惯例 toast 后 return，登记反馈偏差）；`zoneJungle` 取 SceneMetrics 既有位。
2. **⚠️ 43 克眼 useTime 30 ≠ 45**（Item.cs:1873）——Game.ts:7971。顺带：原版白天/同型在场时
   CanUse=false 整支不可用（无挥动无冷却），我方白天支 toast 后仍置 30t 冷却 + 已挥动；
   建议改 `this.player.useTime = itemCombat(43)?.useTime ?? 45` 并把置冷却移入成功分支。
3. **⚠️ 2767 日耀碑牌 useTime 60 ≠ 45**（Item.cs:26389）——Game.ts:8878，改 45（或表兜）。
4. **⚠️ 2350 回归药水引导 90 ≠ 30**（Item.cs:23621 `useTime=(useAnimation=30)`）——
   Game.ts:9018 `itemCombat(tvid)?.useTime ?? 90`：vanilla-itemcombat.json 的 2350 条目缺
   useTime → 兜 90。触发 tick（20）/双段音效/尘/消耗全对，仅动画与再引导冷却被拉长 3 倍。
   修法：补表条目 useTime 30（顺带核查 4870/2997 等传送族表条目完整度）。
5. **⚠️ 849 致动器放置 useTime 5 ≠ 10**（Item.cs:11315）——Game.ts:12080 统一写 5；
   按 `mode & TOOL_ACTUATOR && !(mode & (TOOL_RED|GREEN|BLUE|YELLOW))` 分支给 10
   （或按当前手持物品 itemCombat().useTime 取值）。
6. **⚠️ 3620 致动魔杖 useTime 15 ≠ 5**（Item.cs:32588）——Game.ts:12011-12015，改 5。
7. **⚠️ 同型门缺口（备案转正）**：SummonItemCheck（Player.cs:41520）还有 544↔125/126、
   556↔134、557↔127、4988↔657 四对，我方 BOSS_FAMILY（Game.ts:22080-22092）未列 →
   仍走"任意 Boss 在场"过严门（其他 Boss 在场时白烧召唤物）。补四条家族项即收口。
8. **⚠️ 544 双子落点近似**：原版 125/126 各自独立 SpawnOnPlayer 屏外寻点；我方 126 钉在
   125 落点 +4 列（Game.ts:22200-22202）。微差，可在 onPlayer 档对 126 再跑一次寻点器。
9. **⚠️ 3828 消耗顺序**：原版 `ConsumeItem(3828, reverseOrder:true, includeVoidBag:true)`
   （Player.cs:31968）从背包尾扣且计 void bag；我方 consumeVanillaItem 首格顺序扣、只扫
   inv.slots（Game.ts:13881-13893）。净数量一致，扣哪格与 void bag 语义微差。
10. **⚠️ 门失败反馈 toast（约定偏差，维持）**：43 白天/机械三王白天/4988 非神圣/祭坛三门/
    入侵 CanStartInvasion 失败，原版全部静默整支不可用；我方按项目惯例给 toast 提示。
    已在多处注释登记，不修；如要收口，统一改为静默 + 保留 toast 开关。
11. **⚠️ 数据表缺口**：vanilla-itemcombat.json 缺 544/556/557（useTime 45，现靠代码兜底值
    正确）与 2350（兜 90 错误，见 #4）。建议补齐四条，消除对代码兜底的隐式依赖。

## 子代理报告汇总（4/6 已回）

### 贴图资产（✅大面全绿）
- 物品图集 6108/6108 逐像素与源图全同；Buff 图标 122/122 MD5 全同（32×32 非传闻 22×22）
- ❌1：Item_4722（First Fractal）TEdit 缺 id 未打包 → 走程序化兜底（修=vanilla-atlas.mjs 补源图）
- ⚠️3 绘制公式：useStyle9 饮药缺 ×Lerp(1.5,1.2)（98 件药水手位贴身 3-5px，最重）、
  useStyle5 Last Prism 距离 14 特档、useStyle1 claw 分支（Bladed Glove 1 件）

### 药水/食物（❌2 ⚠️7）
- ❌ vid2209 超级蓝药 healMana 400 应 300 → ✅已修（重跑 extract-itemfunc.mjs，产物陈旧）
- ❌ quickConsume 魔力眩晕挂 f.potion 死门（蓝药无旗恒 false）→ ✅已修（无条件施加 :51166）
- ⚠️ quickDrinkPotion 药水病写死 60s 丢五档分档 + useTime 写死 60 应 17
- ⚠️ 诡药 3001 固定 70 应随机 70-120 + i-帧三档；Clairvoyance 缺魔伤/魔暴/耗魔；
  SugarRush 缺镐速-0.2；Warmth 寒冷伤表未移植；UI 兜底图标 Wrath/Rage 互调（低危）

### 召唤/事件/功能（❌1 ⚠️10）
- ❌ 1133 蜜蜂分泌物缺丛林门（!ZoneJungle 整支不可用 :51415——我方任意地点可召蜂王）
- ⚠️ useTime 偏差 5 件：克眼 30≠45、日耀碑牌 60≠45、回归药水引导 90≠30、
  致动器 5≠10、致动魔杖 15≠5
- ⚠️ BOSS_FAMILY 缺 544↔125/126、556↔134、557↔127、4988↔657（过严门）
- ⚠️ 3828 消耗顺序（首格 vs 原版尾扣+void bag）；544 双子落点近似
- 任务清单 vid 勘误 7 项（雪球=602、骷髅王走 1307、肉山走 267 等）
- ✅ 其余约 30 项全对（含四重门/熔岩链/红帽彩蛋/传送族/电路工具）

### Buff 矩阵（108 真实/7 仅图标/7 部分/0 未实装）
- ❌ AmmoBox 真空壳 → ✅已修（ammoSaveRoll 并入）
- ⚠️ Clairvoyance 三项、SugarRush 镐速、KiteBuff 数值 1457/1456 冲突、
  Stinky 缺药水授予、CompanionCube 缺微光变身、Invisibility 缺索敌无视、Warmth 同上
- ❌ Palworld 六件 389-394 纯登记（授予侧弹 AI 未接，登记批 B）
- 规模勘误：BUFF_DEFS 实为 122 条（非 131）；UpdateBuffs 实位 :9553-11660

## 工具类道具审计（镐/斧/锤/钻头/链锯 98 件，2026-08-22）

> 范围：`vanilla-itemfunc.json` 含 pick/axe/hammer 的全部 98 件（武器剑弓枪除外）。
> 标杆：`Terarria1456/` Item.cs SetDefaults 逐件提取 + Player.cs 挖掘链
> （:44967 ItemCheck_UseMiningTools / :45029 ActuallyUseMiningTool / :45293 TryHittingWall /
> :52981 GetPickaxeDamage / :18363 pickSpeed）+ Main.cs:7153-7172 tileHammer/tileAxe。
> 消费链：`Game.ts` itemFuncTool(:6330)→updateUse 工具分支(:7802-7821)→dualToolResolve(:6846)
> →toolMatchesTile(:10344)→tryMine(:10556)；`items.ts` VANILLA_TOOL_POWERS(:1336-1345)+桥接批内联 def(:797-971)。
> 表内 useTime 列 = 「原版 useTime → 我方实际挖掘冷却」；工具力列 = 原版源码原值（axe 为 ÷5 档，
> 消费端 int(axe×1.2)）。门槛列 = 该镐力可挖的最高档（钴100/秘银110/精金150/叶绿200/神庙210）。
> 全表共通偏差见表后「引擎级共通偏差」小节（✅ 行也受其影响）。

| vid | 工具 | useTime 原→我 | 工具力(原=我方) | 门槛 | 斧/镐互斥 | 贴图 | 结论 | 我方行号 | 原版行号 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 铁镐 IronPickaxe | 13→13 (anim20) | pick40 | 无(仅表层) | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:1373 |
| 7 | 铁锤 IronHammer | 20→20 (anim30) | ham40 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:1454 |
| 10 | 铁斧 IronAxe | 19→19 (anim27) | axe9 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:1496 |
| 45 | 战斧 WarAxeoftheNight | 15→15 (anim30) | axe15 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:1894 |
| 103 | 梦魇镐 NightmarePickaxe | 15→46 (anim20) | pick65 | 黑檀/狱岩65(3档) | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:2565 |
| 104 | 破坏者 TheBreaker | 19→46 (anim45) | ham55 | — | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:2582 |
| 122 | 熔岩镐 MoltenPickaxe | 18→46 (anim23) | pick100 | 钴/地牢100(4档) | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:2838 |
| 196 | 木锤 WoodenHammer tb-1 | 25→25 (anim37) | ham25 | — | ✅ | ✅ | ⚠️ tb-1未进射程 | Game.ts:6330/7805 | Item.cs:3774 |
| 204 | 陨石锤斧 MeteorHamaxe | 16→46 (anim30) | axe20+ham60 | — | ❌副斧失效 | ✅ | ❌ 冷却46t(spd兜底) / 副斧失效不能砍树 | items.ts:1343/Game.ts:7805 | Item.cs:3922 |
| 217 | 熔岩锤斧 MoltenHamaxe | 14→46 (anim27) | axe30+ham70 | — | ❌副斧失效 | ✅ | ❌ 冷却46t(spd兜底) / 副斧失效不能砍树 | items.ts:1343/Game.ts:7805 | Item.cs:4053 |
| 367 | 圣锤 Pwnhammer | 14→46 (anim27) | ham80 | — 祭坛80✓ | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:5644 |
| 383 | 钴链锯 CobaltChainsaw 弹57 | 13→13 (anim25) | axe14 | — | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 | Game.ts:6330/7805 | Item.cs:5813 |
| 384 | 秘银链锯 MythrilChainsaw 弹58 | 10→10 (anim25) | axe17 | — | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 | Game.ts:6330/7805 | Item.cs:5832 |
| 385 | 钴钻头 CobaltDrill 弹59 | 13→13 (anim25) | pick110 | 秘银110(5档) | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 | Game.ts:6330/7805 | Item.cs:5851 |
| 386 | 秘银钻头 MythrilDrill 弹60 | 10→10 (anim25) | pick150 | 精金150(6档) | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 | Game.ts:6330/7805 | Item.cs:5870 |
| 387 | 精金链锯 AdamantiteChainsaw 弹61 | 8→8 (anim25) | axe20 | — | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 | Game.ts:6330/7805 | Item.cs:5889 |
| 388 | 精金钻头 AdamantiteDrill 弹62 | 8→8 (anim25) | pick180 | 精金150(6档) | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 | Game.ts:6330/7805 | Item.cs:5908 |
| 579 | 钻斧 Drax 弹107 | 7→46 (anim25) | pick200+axe22 | 叶绿200(7档) | ❌副斧失效 | ✅ | ❌ 冷却46t(spd兜底) / 副斧失效不能砍树 | items.ts:1343/Game.ts:7805 | Item.cs:8118 |
| 654 | 黑檀木锤 EbonwoodHammer | 20→46 (anim30) | ham40 | — | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:8994 |
| 657 | 红木锤 RichMahoganyHammer | 23→46 (anim33) | ham35 | — | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:9039 |
| 660 | 珍珠木锤 PearlwoodHammer | 19→46 (anim29) | ham55 | — | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:9085 |
| 776 | 钴镐 CobaltPickaxe | 13→46 (anim25) | pick110 | 秘银110(5档) | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:10432 |
| 777 | 秘银镐 MythrilPickaxe | 10→46 (anim25) | pick150 | 精金150(6档) | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:10449 |
| 778 | 精金镐 AdamantitePickaxe | 8→46 (anim25) | pick180 | 精金150(6档) | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:10466 |
| 787 | 蘑菇锤 Hammush | 14→46 (anim27) | ham85 | — 祭坛80✓ | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:10560 |
| 797 | 血肉研磨器 FleshGrinder | 19→46 (anim40) | ham55 | — | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:10689 |
| 798 | 死亡使者镐 DeathbringerPickaxe | 14→46 (anim22) | pick70 | 黑檀/狱岩65(3档) | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:10705 |
| 799 | 血腥簇 BloodLustCluster | 15→15 (anim32) | axe15 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:10722 |
| 882 | 仙人掌镐 CactusPickaxe | 16→16 (anim25) | pick35 | 无(仅表层) | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:11623 |
| 922 | 阴森木锤 ShadewoodHammer | 20→46 (anim30) | ham40 | — | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:12015 |
| 990 | 镐斧 PickaxeAxe | 7→46 (anim25) | pick200+axe22 | 叶绿200(7档) | ❌副斧失效 | ✅ | ❌ 冷却46t(spd兜底) / 副斧失效不能砍树 | items.ts:1343/Game.ts:7805 | Item.cs:12749 |
| 991 | 钴战斧 CobaltWaraxe | 13→13 (anim35) | axe14 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:12767 |
| 992 | 秘银战斧 MythrilWaraxe | 10→10 (anim35) | axe17 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:12784 |
| 993 | 精金战斧 AdamantiteWaraxe | 8→8 (anim35) | axe20 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:12801 |
| 1188 | 钯金镐 PalladiumPickaxe | 12→46 (anim25) | pick130 | 秘银110(5档) | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:14594 |
| 1189 | 钯金钻头 PalladiumDrill 弹213 | 12→12 (anim25) | pick130 | 秘银110(5档) | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 | Game.ts:6330/7805 | Item.cs:14611 |
| 1190 | 钯金链锯 PalladiumChainsaw 弹214 | 12→12 (anim25) | axe15 | — | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 | Game.ts:6330/7805 | Item.cs:14630 |
| 1195 | 山铜镐 OrichalcumPickaxe | 9→46 (anim25) | pick165 | 精金150(6档) | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:14714 |
| 1196 | 山铜钻头 OrichalcumDrill 弹216 | 9→9 (anim25) | pick165 | 精金150(6档) | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 | Game.ts:6330/7805 | Item.cs:14731 |
| 1197 | 山铜链锯 OrichalcumChainsaw 弹217 | 9→9 (anim25) | axe18 | — | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 | Game.ts:6330/7805 | Item.cs:14750 |
| 1202 | 钛金镐 TitaniumPickaxe | 7→46 (anim25) | pick190 | 精金150(6档) | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:14834 |
| 1203 | 钛金钻头 TitaniumDrill 弹219 | 7→8 (anim25) | pick190 | 精金150(6档) | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 / 8t钳7→8 | Game.ts:6330/7805 | Item.cs:14851 |
| 1204 | 钛金链锯 TitaniumChainsaw 弹220 | 7→8 (anim25) | axe21 | — | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 / 8t钳7→8 | Game.ts:6330/7805 | Item.cs:14870 |
| 1222 | 钯金战斧 PalladiumWaraxe | 12→12 (anim35) | axe15 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:15037 |
| 1223 | 山铜战斧 OrichalcumWaraxe | 9→9 (anim35) | axe18 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:15054 |
| 1224 | 钛金战斧 TitaniumWaraxe | 7→8 (anim35) | axe21 | — | ✅ | ✅ | ⚠️ 8t钳7→8 | Game.ts:6330/7805 | Item.cs:15071 |
| 1230 | 叶绿镐 ChlorophytePickaxe tb+1 | 7→8 (anim25) | pick200 | 叶绿200(7档) | ✅ | ✅ | ⚠️ 8t钳7→8 / tb+1未进射程 | Game.ts:6330/7805 | Item.cs:15171 |
| 1231 | 叶绿钻头 ChlorophyteDrill tb+1 弹223 | 7→8 (anim25) | pick200 | 叶绿200(7档) | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 / 8t钳7→8 / tb+1未进射程 | Game.ts:6330/7805 | Item.cs:15189 |
| 1232 | 叶绿链锯 ChlorophyteChainsaw tb+1 弹224 | 7→8 (anim25) | axe23 | — | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 / 8t钳7→8 / tb+1未进射程 | Game.ts:6330/7805 | Item.cs:15209 |
| 1233 | 叶绿巨斧 ChlorophyteGreataxe tb+1 | 7→8 (anim30) | axe23 | — | ✅ | ✅ | ⚠️ 8t钳7→8 / tb+1未进射程 | Game.ts:6330/7805 | Item.cs:15229 |
| 1234 | 叶绿战锤 ChlorophyteWarhammer tb+1 | 14→46 (anim35) | ham90 | — 祭坛80✓ | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:15247 |
| 1262 | 叶绿手钻 ChlorophyteJackhammer tb+1 弹252 | 7→46 (anim25) | ham90 | — 祭坛80✓ | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:15631 |
| 1294 | 锯镐 Picksaw tb+1 | 6→8 (anim16) | pick210+axe25 | 神庙210(8档) | ✅双力分流 | ✅ | ⚠️ 8t钳6→8 / tb+1未进射程 | Game.ts:6330/7805 | Item.cs:15963 |
| 1305 | 斧头 TheAxe tb+1 | 7→46 (anim23) | axe35+ham100 | — 祭坛80✓ | ❌副斧失效 | ✅ | ❌ 冷却46t(spd兜底) / 副斧失效不能砍树 | items.ts:1343/Game.ts:7805 | Item.cs:16105 |
| 1320 | 骨镐 BonePickaxe | 11→11 (anim19) | pick55 | 魔矿/黑曜55(2档) | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:16329 |
| 1506 | 幽魂镐 SpectrePickaxe tb+3 | 8→46 (anim24) | pick200 | 叶绿200(7档) | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:18370 |
| 1507 | 幽魂锤斧 SpectreHamaxe tb+3 | 8→46 (anim28) | axe30+ham90 | — 祭坛80✓ | ❌副斧失效 | ✅ | ❌ 冷却46t(spd兜底) / 副斧失效不能砍树 | items.ts:1343/Game.ts:7805 | Item.cs:18388 |
| 1917 | 糖果杖镐 CandyCanePickaxe | 16→16 (anim20) | pick55 | 魔矿/黑曜55(2档) | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:20789 |
| 2176 | 蘑菇矿爪 ShroomiteDiggingClaw tb-1 | 4→8 (anim12) | pick200+axe25 | 叶绿200(7档) | ✅双力分流 | ✅ | ⚠️ 8t钳4→8 / tb-1未进射程 | Game.ts:6330/7805 | Item.cs:22170 |
| 2341 | 掠夺鲨 ReaverShark | 13→13 (anim22) | pick59 | 魔矿/黑曜55(2档) | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:23490 |
| 2342 | 锯齿鲨 SawtoothShark 弹369 | 8→8 (anim25) | axe14 | — | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 | Game.ts:6330/7805 | Item.cs:23507 |
| 2516 | 棕榈木锤 PalmWoodHammer | 23→23 (anim33) | ham35 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:24400 |
| 2746 | 针叶木锤 BorealWoodHammer | 23→23 (anim33) | ham35 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:26195 |
| 2772 | 星旋斧 VortexAxe tb+4 | 7→8 (anim25) | axe27 | — | ✅ | ❌无图 | ❌ 物品def+贴图整件缺 | items.ts:992(全量注册缺此件) | Item.cs:26442 |
| 2773 | 星旋链锯 VortexChainsaw tb+4 弹427 | 7→8 (anim25) | axe27 | — | ✅ | ❌无图 | ❌ 物品def+贴图整件缺 | items.ts:992(全量注册缺此件) | Item.cs:26460 |
| 2774 | 星旋钻头 VortexDrill tb+4 弹428 | 4→8 (anim25) | pick225 | 神庙210(8档) | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 / 8t钳4→8 / tb+4未进射程 | Game.ts:6330/7805 | Item.cs:26481 |
| 2775 | 星旋锤 VortexHammer tb+4 | 7→8 (anim30) | ham100 | — 祭坛80✓ | ✅ | ❌无图 | ❌ 物品def+贴图整件缺 | items.ts:992(全量注册缺此件) | Item.cs:26520 |
| 2776 | 星旋镐 VortexPickaxe tb+4 | 6→8 (anim12) | pick225 | 神庙210(8档) | ✅ | ✅ | ⚠️ 8t钳6→8 / tb+4未进射程 | Game.ts:6330/7805 | Item.cs:26502 |
| 2798 | 激光钻头 LaserDrill tb+11 弹445 | 6→8 (anim25) | pick230 | 神庙210(8档) | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 / 8t钳6→8 / tb+11未进射程 / 原版无UseSound我方播throw | Game.ts:6330/7805 | Item.cs:26700 |
| 3098 | 屠夫链锯 ButchersChainsaw 弹509 | 8→8 (anim25) | axe30 | — | ✅ | ✅ | ⚠️ us5画成挥砍+channel弹缺失 | Game.ts:6330/7805 | Item.cs:28624 |
| 3481 | 铂金锤 PlatinumHammer | 21→46 (anim27) | ham59 | — | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:31627 |
| 3482 | 铂金斧 PlatinumAxe | 17→17 (anim25) | axe12 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:31637 |
| 3485 | 铂金镐 PlatinumPickaxe | 15→15 (anim19) | pick59 | 魔矿/黑曜55(2档) | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:31596 |
| 3487 | 钨锤 TungstenHammer | 25→46 (anim28) | ham50 | — | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:31568 |
| 3488 | 钨斧 TungstenAxe | 18→18 (anim26) | axe11 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:31578 |
| 3491 | 钨镐 TungstenPickaxe | 19→19 (anim21) | pick50 | 陨石50 | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:31537 |
| 3493 | 铅锤 LeadHammer | 19→46 (anim29) | ham43 | — | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:31509 |
| 3494 | 铅斧 LeadAxe | 19→19 (anim28) | axe10 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:31519 |
| 3497 | 铅镐 LeadPickaxe | 12→12 (anim19) | pick43 | 无(仅表层) | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:31479 |
| 3499 | 锡锤 TinHammer | 21→46 (anim31) | ham38 | — | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:31451 |
| 3500 | 锡斧 TinAxe | 20→20 (anim28) | axe8 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:31461 |
| 3503 | 锡镐 TinPickaxe | 14→14 (anim21) | pick35 | 无(仅表层) | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:31422 |
| 3505 | 铜锤 CopperHammer tb-1 | 23→46 (anim33) | ham35 | — | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:31392 |
| 3506 | 铜斧 CopperAxe tb-1 | 21→21 (anim30) | axe7 | — | ✅ | ✅ | ⚠️ tb-1未进射程 | Game.ts:6330/7805 | Item.cs:31403 |
| 3509 | 铜镐 CopperPickaxe tb-1 | 15→15 (anim23) | pick35 | 无(仅表层) | ✅ | ✅ | ⚠️ tb-1未进射程 | Game.ts:6330/7805 | Item.cs:31362 |
| 3511 | 银锤 SilverHammer | 19→46 (anim29) | ham45 | — | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:31334 |
| 3512 | 银斧 SilverAxe | 18→18 (anim26) | axe10 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:31344 |
| 3515 | 银镐 SilverPickaxe | 11→11 (anim19) | pick45 | 无(仅表层) | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:31304 |
| 3517 | 金锤 GoldHammer | 23→46 (anim28) | ham55 | — | ✅ | ✅ | ❌ 冷却46t(spd兜底) | items.ts:1343/Game.ts:7805 | Item.cs:31276 |
| 3518 | 金斧 GoldAxe | 18→18 (anim26) | axe11 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:31286 |
| 3521 | 金镐 GoldPickaxe | 17→17 (anim20) | pick55 | 魔矿/黑曜55(2档) | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:31245 |
| 3525 | 星尘锤斧 LunarHamaxeStardust tb+4 | 7→46 (anim28) | axe30+ham100 | — 祭坛80✓ | ❌副斧失效 | ✅ | ❌ 冷却46t(spd兜底) / 副斧失效不能砍树 | items.ts:1343/Game.ts:7805 | Item.cs:31210 |
| 4059 | 化石镐 FossilPickaxe | 14→14 (anim18) | pick55 | 魔矿/黑曜55(2档) | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:35633 |
| 4317 | 血腥锤斧 BloodHamaxe | 11→46 (anim27) | axe30+ham80 | — 祭坛80✓ | ❌副斧失效 | ✅ | ❌ 冷却46t(spd兜底) / 副斧失效不能砍树 | items.ts:1343/Game.ts:7805 | Item.cs:36950 |
| 5095 | 露西斧 LucyTheAxe | 15→15 | axe30 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:40793 |
| 5283 | 灰烬木锤 AshWoodHammer | 20→20 (anim30) | ham45 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:41898 |
| 5295 | 再生之斧 AcornAxe | 12→12 (anim24) | axe25 | — | ✅ | ✅ | ✅ | Game.ts:6330/7805 | Item.cs:42098 |
| 5519 | 斧头回旋镖 Axearang 弹1052 noG 非AR | 20→20 | axe30 | — | ✅ | ⚠️noG未守 | ❌ 回旋镖1052未发射/非AR按住连挥/noUseGraphic未守 | Game.ts:7813/7328 | Item.cs:43417 |

COUNT ❌=39 ⚠️=27 ✅=32

### 引擎级共通偏差（影响全表，含 ✅ 行）

- **E1 锤墙伤害/节奏**：我方 `power*2`/击（Game.ts:10746）+ 冷却=挥击档 max(8,useAnimation)（:10730）；
  原版 `(int)(hammer*1.5)`/击 + `itemTime = useTime/2`（Player.cs:45296/:45303）。
  圣锤原版 1 击/7t，我方 1 击/46t（def.tool 锤在 F1 修复前；修复后为 useAnimation 档 27t）；
  木锤原版 3 击、我方 2 击。另缺 CanPlayerSmashWall（:45307）邻接门。
- **E2 GetPickaxeDamage 移植缺口**（Player.cs:52981-53090 vs Game.ts:10756-10790）：
  ①软块双倍伤害整组缺（0 泥/40 粘土/53 沙/57 灰烬/59 泥沙/123 淤泥/147 雪/224 雪泥/397 硬化沙
  `num += pickPower`，:53056-53058）→ 这九种块我方挖慢一倍（铜镐 3 击 vs 原版 2 击）；
  ②地牢砖 100 门槛缺 x∈[0.35,0.65]×地图宽带内豁免（:53063-53070）——原版带内任何镐可挖（伤 pick/2）；
  ③677-679 远古地牢砖未入 TILE_DUNGEON_SHEETS（Game.ts:498，原版 tileDungeon Main.cs:7944-7946）→
  无 /2 除数、无 100 门槛；④137 机关 frameY1-4 行 210 门槛缺（:53071-53077）；
  ⑤128/269 假人 frameX≥100 归零缺（:53090+）；⑥404 化石 +5 缺；⑦199 猩红草/绳族 instant-100 缺
  （165 已由 tileNoFail 覆盖）；⑧狱石砖 77 门槛深度线用 `world.lavaLine`（≈水面+50~80，
  Game.ts:10779）而非 `Main.UnderworldLayer = h-200`（Player.cs:53036）→ <65 镐的禁挖带大幅变宽；
  ⑨25/203 缺 `!Main.infectedSeed` 豁免（:53021）。
- **E3 挥摆重启节奏**：我方复用门=useAnimation（Game.ts:7807 `useTime = spd`），
  原版=useTime（ApplyItemTime :4216 + TryAllowingItemReuse）→ useTime<useAnimation 的工具
  挥击动画/挥击音重启偏慢（挖掘命中节奏不受影响——tryMine 内部按 useTime 节流 ✅）。
- **E4 射程外仍起手**：工具分支先起手挥击+播 UseSound 再进 tryMine 射程门（:7813 前 vs :10562）；
  原版 `IsTargetTileInItemRange` 不过则整支 return（:44980-44990）无动画无声。
- **E5 挖掘光标图标缺**：原版挖掘工具在射程内置 cursorItemIconEnabled + ItemIconCacheUpdate
  （:44986-44990）；我方工具分支无 itemIconCacheUpdate 调用（放置/电路路径有）。
- **E6 挥舞图层两路不一致**：35 件 def.tool 画身体后层（Renderer.ts:9321-9324），
  63 件桥接工具画身体前层（:9772-9779）——同是镐/斧，图层随数据来源漂移；原版单一 HeldItem 层。
- **E7 非匹配目标静默**：镐点树/斧点石时我方 `mining=null` 直接返回（Game.ts:10698-10706）；
  原版 num2=0 仍走 KillTile(fail:true)→击打音+尘（:45108/:45148）——原版"镐敲树有咚咚声"。
- **E8 tileHammer 族语义缺**：原版 tileHammer={26 祭坛,31 暗影球,695/696 复制体}（Main.cs:7153-7156），
  镐对其完全无效；我方无 tileHammer 概念——31 走 decor 路径镐也能敲碎（原版仅锤/炸药）、
  696 复制体无 smash 语义（镐可挖、无战利品/召唤链）。
- **E9 tiles.ts 叶绿矿 d.pick=65**（tiles.ts:96）应为 200：挖掘主链被 tryMine 硬编码 200 门槛兜住
  （Game.ts:10772），但 `pickPowerEnough`（Game.ts:21152-21164，弹幕/爆炸侧 GetPickaxeDamage 近似）
  按 d.pick 判定 → 65 镐即视为可伤叶绿，与原版不符。

### ❌/⚠️ 修复要点（按优先级）

1. **❌ F1｜35 件 def.tool 工具挖掘/挥击节奏全错（最高优先）**
   `VANILLA_TOOL_POWERS`（items.ts:1336-1345）与桥接批内联 def（:797-971）只写 `{type,power}`
   （+def.axePower），缺 `speed/useTime/damage/knockback`；而 updateUse 工具判定
   `heldDef?.tool ?? itemFuncTool(...)`（Game.ts:7153）让 def.tool 优先 → 工具分支
   `tool.speed ?? 46`（:7805）与 `tool.useTime ?? spd`（:7820）双双回落 46t。
   后果：梦魇/熔岩/钴/秘银/精金/钯/山铜/钛/幽魂镐、Drax、镐斧、圣锤、全部 def.tool 锤斧等
   35 件挖掘冷却 46t（原版 7-25t，慢 1.8-6.6 倍）、挥击动画 46t（原版 12-45t）。
   修法（任选）：①items.ts 回填循环里从 itemCombat 并入
   `speed: c.useAnimation, useTime: c.useTime, damage: c.damage, knockback: c.knockBack`；
   ②工具判定改为 itemFuncTool 优先、def.tool 只补 power——推荐①（保留 def.tool 的覆写语义）。
2. **❌ F2｜8 件双工具副斧力失效（不能砍树）+ 锤斧误砸普通块**
   副斧力挂在 `def.axePower`（items.ts:1344），dualToolResolve 只读 tool 对象内的
   `pickPower/axePower/hammerPower`（Game.ts:6848-6862，仅 itemFuncTool 桥会填）→
   579 钻斧 / 990 镐斧 / 204 / 217 / 1305 / 1507 / 3525 / 4317 全部 multi=false：
   镐斧族对树返回 pick → toolMatchesTile 排除斧族 → 完全砍不动树；
   锤斧族（无 pick）对普通块返回 hammer → tryMine 锤路把石头砸成半砖/坡
   （原版无 pick 力对普通块无任何作用，Player.cs:45040-45045 else-if 链）。
   修法：F1 落地时把 `axePower` 一并写进 `def.tool.axePower`（或在 dualToolResolve 兜底
   `d.axePower ?? (ITEM_DEFS[...].axePower)`）。修后 8 件按 tileAxe/tileHammer 分流恢复原版语义。
3. **❌ F3｜2772 星旋斧 / 2773 星旋链锯 / 2775 星旋锤 整件缺失**
   `vanilla.json`（6108 件）与 `public/sprites/vanilla.json` 图标清单均无此三件
   （源图 terraria-assets/Images/Item_2772/2773/2775.png 在）→ 无 def、无贴图、不可获得。
   与 3522/3523/3524（见 F8）同根：提取器对 Item.cs 这批 case 漏收。补提取+重建 atlas。
4. **❌ F4｜5519 斧头回旋镖三重偏差**：①shoot 1052 回旋镖从不发射（工具分支截胡，
   Game.ts:7813 在近战分支 :7328 `cwMelee && !tool` 之后）；②原版无 autoReuse → 单击一挥，
   我方按住连挥；③noUseGraphic=true（原版使用中不画手持）未守。
   修法：工具分支前对「有 shoot 的工具」（5519；钻头/链锯族见 F5）按 combat 表走弹幕派发，
   或至少给 5519 加白名单：发射 1052 + 尊重 autoReuse/noUseGraphic。
5. **❌ F5｜钻头/链锯族 21 件 channel 弹幕缺失（383/384/385/386/387/388/579/1189/1190/
   1196/1197/1203/1204/1231/1232/1262/2342/2773/2774/2798/3098）**
   原版：useStyle 5 + channel + noUseGraphic=true + shoot=专属弹
   （57/58/59/60/61/62/107/213/214/216/217/219/220/223/224/252/369/427/428/445/509）——
   手持贴图不画，弹幕（钻头/锯刃本体）挂手朝鼠标、伤害由弹幕结算。
   我方：工具分支截胡（:7328 门 `cwMelee && !tool` 对带工具力的物品恒假）→
   弹幕从不发射、手持贴图按 useStyle 1 挥砍弧画、伤害走挥击命中盒。
   3098 已写好的 ChainsawProj 派发（Game.ts:7614）因此成死代码。
   修法：工具分支内对 `combat.shoot && channel` 的工具改走 useSwing(useStyle 5) + 弹幕派发
   （弹幕 AI 族 10-21 已有路由），挖掘仍由 itemFuncTool.pick 经 tryMine 承担（原版同构）。
6. **⚠️ F6｜8t 冷却下限钳**（Game.ts:10726 `Math.max(8, …)`）：原版无下限
   （ApplyItemTime 仅 max(val,1)，:4221-4226）。2176 蘑菇矿爪 4→8、2774 星旋钻头 4→8、
   1294 锯镐/2776 星旋镐/2798 激光钻头 6→8、1203/1204/1224/1230-1233 7→8 ——
   顶速工具慢 8-100%。修法：下限改 1（保留 drill 豁免注释里的原版口径），或至少降到 4。
7. **⚠️ F7｜tileBoost 未进挖掘射程**：tryMine 用 `inTileRange(tx,ty)`（tb=0，:10562）；
   原版 `IsTargetTileInItemRange` 传 `sItem.tileBoost`（:45699）。受影响：
   196/3505/3506/3509(-1)、1230-1234/1262/1294/1305(+1)、1506/1507(+3)、2772-2776(+4)、
   2798 激光钻头(+11，原版超远射程特色)。修法：itemFuncTool 透传 tileBoost（需补提取列），
   工具分支 `inTileRange(tx, ty, tool.tileBoost ?? 0)`。
8. **⚠️ F8｜提取面缺口（不修行为、补数据）**：①vanilla-itemfunc.json 对 3481-3521 金属工具缺
   useStyle/autoReuse（SetDefaults1 模板未解析；行为无差——itemCombat 已含 autoReuse，
   heldUseStyle 缺省回 1 正确）；②**3522/3523/3524 三把月锤斧（axe30+ham100，Item.cs 案
   31210 同款）整件缺 pick/axe/hammer → 我方当纯近战武器**（不在本次 98 清单内，同族登记）。
9. **⚠️ F9｜E1-E9 引擎级共通偏差**：按上文逐条收口；其中 E2-①（软块双倍）与 E2-⑧（狱石砖
   深度线）体感最明显，建议先修。

### 审计确认正确项（抽样与全表核对结论）

- 工具力数值：VANILLA_TOOL_POWERS 35 项与 itemfunc 逐项相等；桥接 63 项直读 itemfunc ✅。
- itemCombat 的 useTime/useAnimation/autoReuse 与 Item.cs 逐件一致（抽查 14 件全中）✅。
- tileAxe 互斥：TILE_AXE_SHEETS 16 项与 Main.cs:7157-7172 逐位一致；镐被排除于斧族、
  斧仅限斧族（toolMatchesTile:10346-10348）✅；斧伤 int(axe×1.2)、仙人掌 ×3（:10752-10756 =
  Player.cs:45098-45100）✅。
- 镐力门槛硬表（钴100/钯110/秘银150/钛150/叶绿200/神庙210/地牢100/黑檀·猩石·珍珠·狱岩65/
  陨石50/魔矿·猩红矿地下55/黑曜石55/除数 /2·/3·/4·/5·云×2）与 :52981-53075 一致 ✅。
- pickSpeed 减益链（Mining .25/ambrosia .05/wellFed 三档/kite/chisel .25/饥饿加成）✅。
- 桥接双工具（1294 锯镐 / 2176 蘑菇矿爪）dualToolResolve 分流 ✅；
  5295 再生之斧补种(:10811)/草种转化(:12352)/药草采集加成(:19508) ✅。
- 贴图：95/98 有 Item_N.png atlas 图标且尺寸与原版一致；工具族全部单帧、无竖条动画
  （ITEM_ANIMATION 表无工具条目=正确）；挥摆=useStyle 1 旋转弧（Renderer.ts:10210），
  手持帧规格=贴图原生宽高（:10186-10199 = GetItemDrawFrame）✅。
- UseSound 表驱动（Item_1 镐斧锤族 / Item_23 钻头链锯族，playUseSound:21182）✅。

## 主会话即时修复（续，4/6 后）

| 项 | 修复 | 行号 |
|---|---|---|
| ❌ vid2209 超级蓝药 400→300 | 重跑 extract-itemfunc.mjs（产物陈旧） | vanilla-itemfunc.json |
| ❌ quickConsume 魔力眩晕死门 | 去 f.potion 门，无条件施加（:51166） | Game.ts:6735 |
| ⚠️ quickDrinkPotion 药水病写死 60s | 接 applyPotionSickness 五档分档 | Game.ts quickDrinkPotion |
| ⚠️ quickDrinkPotion useTime 写死 60 | itemCombat(vid)?.useTime ?? 17 | 同上 |

注：tsc 全量 108 错均为并行会话中途态（gemPhase 等），本审计修改区零错。

---

# 放置物/涂料/弹药类道具审计（2026-08-22，追加）

> 对象：放置物抽样 26 族（任务书 60 代表性收敛为功能族）、涂料 30 全量 + 工具 3 + 涂层 2、
> 弹药 40 抽样（箭 14/弹 16/火箭·溶液·飞镖·杂 10）。
> 标杆：`Terarria1456/` Player.cs PlaceThing :41152-42771、Projectile.cs AI_001 :51114-54887 /
> StatusNPC :10555-11100 / Kill :68941-77058、Item.cs SetDefaults 逐 case、WorldGen.cs
> paintTile :44137-44159 / paintWall :44257-44279、Recipe.cs SetupTileInheritance :556-566。
> 消费链：`Game.ts` tryPlace(:12374)/tryUsePaintTool(:12175)/tryPainting(:12275)/远程弹药链(:8363-8651)、
> `items.ts` PAINT_ITEM_TABLE(:1072)/PAINT_TOOL_TABLE(:1081)、`world/Paint.ts`(:561/:575)、
> `render/ChunkCache.ts` tintRegion(:52)、`entities/Arrow.ts`(:568 pierce 初始化)、
> `data/vanilla-itemcombat.json`/`vanilla-projectiles.json`/`vanilla-projstatus.json`。
> 注：任务书清单所记 vid 多为 **tile id**（工作台 18/熔炉 17/箱 21/床 79/砧 16…），本表
> "vid" 列一律取**物品 id**（权威），tile id 在"放置条件"列注明。

## 一、放置物抽样（26 族）

| vid | 道具 | 放置条件 | 功能实装 | 贴图 | 结论 | 我方行号 | 原版行号 |
|---|---|---|---|---|---|---|---|
| 8 | 火把 Torch (tile 4) | 底/左/右/墙四锚 TileObject.CanPlace 1:1；液体门（普通拒/水炬 8/11/17 允）；placeStyle→群系火把帧 | 放置光（TileLightScanner case 4 按 style 取 TorchColor，含地狱/微光闪烁档） | ✅ | ✅ | Game.ts:12609-12626; lighting/TileLightScanner.ts:116/:345 | Player.cs:41300+; TileLightScanner.cs |
| 36 | 工作台 (tile 18, 2×1) | 支撑行全 SolidTile2（含坡/半砖排除）+ 空间检查 | 合成站（stationsNearby + vanillaNearbyStations tile 18 入站集；配方 tile 门匹配） | ✅ | ✅ | Game.ts:12627-12662/:21648-21692; vanillaRecipes.ts:310 | Player.cs:35218; WorldGen.cs Place2x1 :47391 |
| 33 | 熔炉 (tile 17, 3×2) | 同上 | 合成站 + CountsAs 继承 17→215（Recipe.TileCountsAs 全表 8 条 1:1） | ✅ | ✅ | data/vanilla-recipes.json tileCountsAs | Recipe.cs:558-566 |
| 35 | 铁砧 (tile 16, 2×1) | 同上 | 合成站（含 134→16 继承=铅砧等价） | ✅ | ✅ | 同上 | Recipe.cs:563 |
| 48 | 宝箱 (tile 21, 2×2) | 支撑+空间+实心不与玩家重叠；放置登记 world.chests（21/467/88 三族） | 开箱/存取/陷阱箱 441/468 电路联动/合成材料源（600px 箱） | ✅ | 📋(缺 1000 箱上限门) | Game.ts:12727-12730/:13341-13352 | WorldGen.cs:57840; Main.chest 1000 |
| 25 | 木门 (tile 10/11, 1×3) | 3 格净空内任意格点击自动上/下寻位 + 支撑 + 实心防重叠 | 右键开关（原版只动 type==11 开门格语义已修）；高门 388↔389 自动开关 | ✅ | ✅ | Game.ts:12537-12559/:13337-13340 | Player.cs:59880-59910 |
| 94 | 木平台 (tile 19) | 邻接吸附（下/侧/墙） | 可站（solidTop 平台族）+ 锤循环半砖↔整块 + Block Swap style 族换 | ✅ | ✅ | Game.ts:12652-12655/:10606 | Player.cs:45394-45440 |
| 224 | 床 (tile 79, 4×2) | 支撑+空间 | 右键：枕端入睡（96px 距离门/CanSnapToPosition/下床 toggle/换床）/脚端设重生点（CheckSpawn 房间校验六档文案+再点同点取消）+ 睡眠加速 5× | ✅ | ✅ | Game.ts:13373-13452/:3948-3964 | PC:32184-32228; :53608-53666; SH:93-191 |
| 363 | 锯木机 (tile 106, 3×3) | 同工作台 | 合成站（tile 106 直接入站集） | ✅ | ✅ | Game.ts:21648-21692 | Player.cs:35218 |
| 332 | 织布机 (tile 86, 3×2) | 同上 | 合成站（含 304→86 继承） | ✅ | ✅ | 同上 | Recipe.cs:566 |
| 3000 | 炼药桌 (tile 355, 3×3) | 同上 | 合成站 + 355→13 继承（瓶装档）+ **材料 1/3 折扣**（alchemyTable 位每帧清零重扫，粘滞 bug 已修）+ 699 死细胞站 ×1.2 时长 | ✅ | ✅ | Game.ts:21648-21692 | Recipe.cs:564; Player.cs:35218/:5206 |
| 3064 | 附魔日晷 (tile 356, 2×3) | 同上 | 右键：冷却 0 且未快进 → fastForwardTimeToDawn + 8 天冷却；dayRate 60 快进；血月夜清零；存档持久化 | ✅ | ✅ | Game.ts:13454-13471/:5249-5252/:20503 | Player.cs:32166-32183; Main.cs:6240-6268/:64892 |
| 3202 | 训练假人 (tile 378, 2×3) | 支撑+空间 | 放置即生成 NPC 488（TETrainingDummy.Activate 1:1）+ 300t 周期/事件驱动重生（1600px 内锚点扫描）+ 测伤飘字 | ✅ | ✅ | Game.ts:12839/:21400-21460 | TETrainingDummy.cs:44-77/:131 |
| 487 | 水晶球 (tile 125, 2×2) | 同上 | 右键 Clairvoyance buff（预知 29）+ 合成站 + 动态光 G/B 闪烁 | ✅ | ✅ | Game.ts:13478-13490; tiles.ts:341 | Player.cs:32481+ |
| 538 | 开关 (tile 136) | 墙/支撑 | 右键/电线信号 HitSwitch 帧翻转 + tripWire；放置朝向 | ✅ | ✅ | Game.ts:13496; Wiring.ts:217 | Wiring.cs:163-252/:177-182 |
| 539 | 飞镖机关 (tile 137) | 同上 | 电路触发发射飞镖；放置朝向 frameX+=18（SpinTraps） | ✅ | ✅ | devices.ts:608; Game.ts:12795-12800 | Player.cs:40209; Wiring.cs |
| 540 | 巨石 (tile 138, 2×2) | 同上 | 电路触发滚落（31×31 真档/失撑下落/致动缩入，boulder-trap 批已修） | ✅ | ✅ | devices.ts; FallingBlock.ts | Wiring.cs; WorldGen.cs:86672 |
| 576 | 八音盒 (tile 139, 2×2) | 墙/支撑 | 右键换曲（100 曲目表 Main.cs:11002-11403 全表）+ 电线开关节拍 | ✅ | ✅ | devices.ts:117-161/:574 | WorldGen.cs:50977-51021 |
| 580 | 炸药 (tile 141) | 支撑 | 电路触发爆炸（500 伤/半径 10 清格） | ✅ | ✅ | devices.ts:611 | Wiring.cs:1781-1785 |
| 581/582 | 入/出水泵 (tile 142/143, 2×2) | 同上 | 电路 2×2 四格收集/排液 | ✅ | ✅ | Wiring.ts:413-435 | Wiring.cs:1793-1863 |
| 583-585/4484/4485 | 计时器 (tile 144) | 同上 | 信号=打开并重置计时（1/3/5/0.5/0.25s 五档） | ✅ | ✅ | Wiring.ts:392 | Wiring.cs:839-843 |
| 1263 | 传送机 (tile 235, 3×1) | 支撑（solid） | 电路成对捕获传送（:1251-1271） | ✅ | ✅ | Wiring.ts:404-412 | Wiring.cs:1251-1271 |
| 970-973 | 烟花盒（红/绿/蓝/黄火箭，tile 216） | 墙/支撑（decor） | 电路触发烟花（四色 placeStyle） | ✅ | ✅ | tiles.ts:458 | Item.cs:12527-12550 |
| 852 | 蓝压力板 (tile 135) | 支撑 | 电路压板触发 | ✅ | ✅ | Wiring.ts | Wiring.cs |
| 530 | 电线（放置） | 射程 20 格 | 四色线铺/剪/致动器 + 宏伟蓝图 L 形批量 | ✅ | ✅ | Game.ts:12011-12085 | Player.cs:30289-30444 |
| 171/4319/4320 | 标牌/箭头标牌 (tile 55/425) | 墙/支撑 | 右键编辑文本（2×2 锚点帧回算） | ✅ | ✅ | Game.ts:13353-13359 | Player.cs:32231-32250 |

放置链共通项（全族生效，逐条对过原版）：Block Swap 方块交换（含双镐门/积累条/style 族换）、
FlexibleTileWand 30 件、草族转化、橡实全锚点表、绳索下延、轨道三 style、桌面 1×1 族
（{13,33,49,50,78,174,372,646}）、晶塔同型唯一门、DD2 建造封锁、椅/浴缸/马桶/陷阱朝向帧、
autoPaint 配饰上漆、consumable=false 不消耗门（5464）、useTime=useTime×tileSpeed 倒数乘区。

## 二、涂料（30 全量 + 工具 3 + 涂层 2）

| vid | 道具 | 使用条件 | 功能实装 | 贴图 | 结论 | 我方行号 | 原版行号 |
|---|---|---|---|---|---|---|---|
| 1071/1543 | 漆刷/幽灵漆刷 | 目标格 active；射程 tileBoost(幽灵+3)+blockRange | TryPainting tile 通道；FindPaintOrCoating（弹药位 54-57 优先）取漆，改色成功才扣 1（同色不扣）；useTime 10×tileSpeed | ✅ | ✅ | Game.ts:12199-12205/:12275-12295 | Player.cs:41254-41270/:41291-41369 |
| 1072/1544 | 涂漆滚刷/幽灵滚刷 | 目标格 wall>0 | TryPainting wall 通道（paintWall 双通道） | ✅ | ✅ | Game.ts:12207-12213 | Player.cs:41236-41252 |
| 1100/1545 | 漆铲/幽灵漆铲 | 双通道有漆才挥动 | 先 tile 后 wall 清除（不耗物品）+ LongMoss 苔藓 KillTile 1/9 掉苔（4349+col，6-10 档特例全表） | ✅ | ✅ | Game.ts:12215-12257 | Player.cs:41152-41234 |
| 1073-1084 | 红橙黄橙绿青绿青天蓝蓝紫蓝紫粉漆 (Paint 1-12) | — | PAINT_ITEM_TABLE 1:1 → paint/paintWall 字节通道；ChunkCache tintRegion 逐像素 applyPaintTint Pass2-13（GPU TileShader 45 pass 的 Canvas 等价，min/max 排序槽）；存档 RLE 双通道 | ✅ | ✅ | items.ts:1072-1080; world/Paint.ts:228-239; ChunkCache.ts:52-66/:754-778; save/SaveFile.ts:45/:360 | WorldGen.cs:44137-44159/:44257-44279; TilePaintSystemV2.cs:69-82 |
| 1085-1096 | 深红-深粉漆 (Paint 13-24 深层) | 同上 | 同表同链（Pass14-25 深层曲线） | ✅ | ✅ | 同上 | 同上 |
| 1097/1098/1099 | 黑/白/灰漆 (25/26/27) | 同上 | Pass26 黑 0.15(hi+lo) / Pass27 白提亮曲线(7hi+3lo)·0.1×(2−0.5(hi+lo)) 非恒等! / Pass28 灰 | ✅ | ✅ | Paint.ts:252-265 | TileShader Pass26-28 |
| 1966 | 棕漆 (28) | 同上 | Pass41 (hi, 0.7hi, 0.49hi) 只吃 hi | ✅ | ✅ | Paint.ts:266 | TileShader Pass41 :1321-1338 |
| 1967 | 暗影漆 (29) | 同上 | Pass42 0.025(hi+lo) | ✅ | ✅ | Paint.ts:268 | Pass42 :1339-1358 |
| 1968 | 反色漆 (30) | 同上 | Pass43/44 半透明 a=150 + 墙通道负相 | ✅ | ✅ | Paint.ts:270-272 | Pass43-44 :1359-1402 |
| — | 树族特判上色 | paint 1-12 且树族 | getTilePaintSettings：树干 5×7 群系档/棕榈 323 四群系/宝石树 583-589 七色/樱花 595/596·黄柳 615/616·灰烬 634；ChunkCache 分发判据 = Main.cs:58064-58083 | ✅ | ✅ | Paint.ts:418-464; ChunkCache.ts:775-778 | TreePaintingSettings.cs:274-322/:347 |
| 4668 | 夜明涂料 GlowPaint | — | **涂层（paintCoating）系统未建**——不在 FindPaintSlot 判定内（代码注释已登记"惰性"） | ✅ | ⚠️ | Game.ts:12173(注释); projStatus 无 | Item.cs:38471/:42387 |
| 5344 | 回声涂料 EchoCoating | — | 同上（涂层位未建，回声隐形渲染无） | ✅ | ⚠️ | 同上 | 同上 |

涂料链共通项：放置自动上漆（autoPaint 配饰 2216/3061/5126 → 逐格 TryPainting 无动画）、
漆尘 10 颗（半数 noGravity×1.2/半数×0.5）、Builder/仙馔/风筝/砌砖刀 tileSpeed 乘区、
刮刀不查 FindPaintSlot（:6952 门）。

## 三、弹药（40 抽样）

数据面：`vanilla-itemcombat.json` 76 件 ammo 物品的 damage/shootSpeed/knockBack/shoot 与
Item.cs SetDefaults 逐件比对——**34/38 抽样全同，4 件伤害数据错**（见 ❌6）；shootSpeed 38/38 全同。
弹型解析 resolveAmmoProjId（Specific 表 5 发射器×12 弹药 + 火箭加法 + 溶液加法 + 尾链）1:1 ✅；
重力链 projGravSpec（flag3 表/两段式/逐型档）1:1 ✅；省弹四档独立掷 ✅；无尽袋 3103/3104
consumable=false 恒不耗 ✅；命中 debuff 走 vanilla-projstatus.json 表（火枪弹 2→OnFire 33%、
灵液 278/279→Ichor、诅咒 103/104、毒液 282/283→Venom+395、纳米 285→Confused、金 287→Midas、
霜冻 172→Frostburn、毒镖 267→Poison、诅咒镖 478→Cursed、灵液镖 479→Ichor、照明弹族 mut 组）
与 Projectile.StatusNPC :10555-11100 逐条全同 ✅。

| vid | 道具 | 弹型/数值 | 特殊效果 | 贴图 | 结论 | 我方行号 | 原版行号 |
|---|---|---|---|---|---|---|---|
| 40 | 木箭 | dmg5/spd3/proj1 | 无（可回收 dropKey） | ✅ | ✅ | Game.ts:8536/:8605 | Item.cs:2996-3010 |
| 41 | 烈焰箭 | dmg7/spd3.5/proj2 | OnFire 33% 180t（projstatus 表） | ✅ | ✅ | projStatus 表 | StatusNPC :11559 |
| 47 | 邪箭 | dmg12/spd3.4/proj4 | **penetrate 5 → 实发 1**（Arrow 构造器不读 penetrate） | ✅ | ❌ | Arrow.ts:568; Game.ts:8605 | Projectile.cs:574-584 |
| 51 | 小丑之箭 | dmg10/spd0.5/proj5 | **penetrate -1(无限)→实发 1；timeLeft 120→实发 1200** | ✅ | ❌ | 同上 | Projectile.cs:585-598 |
| 265 | 狱炎箭 | dmg13/spd6.5/proj41 | **penetrate -1→1；Kill 64×64 爆炸重结算 Damage 未实装** | ✅ | ❌ | onProjectileDeath 无 41 分支 | Projectile.cs:73256-73296 |
| 516 | 圣箭 | dmg13/spd3.5/proj91 | **Kill 坠星（proj 92 伤/3，ai1=落点线）未实装** | ✅ | ❌ | 同上 | Projectile.cs:72260-72283 |
| 545 | 诅咒箭 | dmg16/spd4/proj103 | CursedInferno 100% 7s ✅ | ✅ | ✅ | projStatus 表 | StatusNPC :11674 |
| 546 | 诅咒弹 | **repo dmg15 应 12**/spd5/proj104 | CursedInferno ✅；**伤害数据错 +25%** | ✅ | ❌ | vanilla-itemcombat.json"546" | Item.cs:7878-7891 (damage=12) |
| 988 | 霜冻箭 | **repo dmg9 应 7**/spd3.75/proj172 | Frostburn 33% 3s ✅；**伤害数据错** | ✅ | ❌ | 同上"988" | Item.cs:12720-12731 (damage=7) |
| 1235 | 叶绿箭 | dmg16/spd4.5/proj225 | 无特判（原版亦无追踪）✅ | ✅ | ✅ | — | Item.cs:15171+ |
| 1334 | 灵液箭 | dmg16/spd4.25/proj278 | Ichor 100% 10s（checkArmorPenetration +15 池）✅ | ✅ | ✅ | projStatus.ts:30/:214-228 | StatusNPC :11678; NPC.cs:81916 |
| 1341 | 毒液箭 | dmg19/spd4.3/proj282 | Venom 100% 10s + PotentAcid 2s ✅ | ✅ | ✅ | projStatus 表 | StatusNPC :11682 |
| 3003 | 骨箭 | dmg14/spd3.5/proj474 | **penetrate 2→1** | ✅ | ❌ | Arrow.ts:568 | Projectile.cs penetrate=2 |
| 3568 | 夜明箭 | dmg14/spd3/proj639 | **penetrate 4→1** | ✅ | ❌ | 同上 | 同上 |
| 5348 | 微光箭 | dmg9/spd3/proj1006 | 无特判 ✅ | ✅ | ✅ | — | Item.cs |
| 97 | 火枪子弹 | dmg7/spd4/proj14 | 无 ✅ | ✅ | ✅ | — | Item.cs |
| 234 | 流星弹 | dmg9/spd3/proj36 | **penetrate 2→1** | ✅ | ❌ | Arrow.ts:568 | Projectile.cs penetrate=2 |
| 278 | 银子弹 | dmg9/spd4.5/proj981 | 无 ✅ | ✅ | ✅ | — | Item.cs |
| 515 | 水晶子弹 | dmg9/spd5/proj89 | **Kill 碎裂 2×proj90(伤×0.5) 未实装** | ✅ | ❌ | onProjectileDeath 无 89 分支 | Projectile.cs:72289-72306 |
| 1179 | 叶绿弹 | dmg9/spd5/proj207 | **追踪（AI_001 300px 视距锁敌+转向+1000px 保持）未实装——现飞直线** | ✅ | ❌ | Arrow.ts 无 207 分支 | Projectile.cs:53906-53990 |
| 1302 | 高速子弹 | dmg11/spd4/proj242 | **penetrate 3→1**（extraUpdates 7 ✅） | ✅ | ❌ | 同上 | Projectile.cs penetrate=3 |
| 1335 | 灵液弹 | dmg13/spd5.25/proj279 | Ichor ✅ | ✅ | ✅ | projStatus 表 | StatusNPC :11678 |
| 1342 | 毒液弹 | dmg15/spd5.3/proj283 | Venom+PotentAcid ✅ | ✅ | ✅ | 同上 | StatusNPC :11682 |
| 1349 | 派对弹 | dmg10/spd5.1/proj284 | debuff 无（原版亦无）；Kill 彩带尘/gore 视觉未实装 | ✅ | ⚠️ | onProjectileDeath | Projectile.cs:72890-72918 |
| 1350 | 纳米弹 | **repo dmg10 应 15**/spd4.6/proj285 | Confused 33% ✅ + 总伤×1.25（:8524）✅；**伤害数据错** | ✅ | ❌ | vanilla-itemcombat.json"1350" | Item.cs:16658-16669 (damage=15) |
| 1351 | 爆破弹 | dmg10/spd4.7/proj286 | Kill 爆音+尘视觉未实装（无 AoE 伤=原版同） | ✅ | ⚠️ | onProjectileDeath | Projectile.cs:72919-72935 |
| 1352 | 金子弹 | dmg10/spd4.6/proj287 | Midas 100% 2s ✅ | ✅ | ✅ | projStatus 表 | StatusNPC :11544 |
| 1432 | 空心子弹 | 合成中间件（无 shoot） | — | ✅ | ✅ | — | Item.cs:17715 |
| 4915 | 钨子弹 | dmg9/spd4.5/proj981 | 无 ✅ | ✅ | ✅ | — | Item.cs |
| 3567 | 夜明弹 | dmg10/spd2/proj638 | **penetrate -1→1** | ✅ | ❌ | Arrow.ts:568 | Projectile.cs penetrate=-1 |
| 1310 | 毒镖 | dmg10/spd2/proj267 | Poison mut 组（33% 60s/67% 30s）✅ | ✅ | ✅ | projStatus 表 | StatusNPC :11642 |
| 3009 | 水晶镖 | dmg15/spd1/proj477 | **penetrate 5→1**（extraUpdates ✅） | ✅ | ❌ | Arrow.ts:568 | Projectile.cs penetrate=5 |
| 3010 | 诅咒镖 | dmg12/spd3/proj478 | CursedInferno ✅；**表 penetrate 3 应 2**（提取错，现被 pierce bug 掩盖） | ✅ | ⚠️ | vanilla-projectiles.json"478" | Projectile.cs:5257-5267 (penetrate=2) |
| 3011 | 灵液镖 | **repo dmg10 应 7**/spd3/proj479 | Ichor 7-14s ✅；**伤害数据错** | ✅ | ❌ | vanilla-itemcombat.json"3011" | Item.cs:27802-27813 (damage=7) |
| 931/1614/5377-5380 | 照明弹五色 | dmg1-?/spd6/proj163/310/1008-1011 | OnFire mut 组 ✅；**aiStyle 33 贴墙滞留续燃未实装——撞墙即亡** | ✅ | ⚠️ | Arrow.ts 无 aiStyle33 分支 | Projectile.cs:25583-25660 |
| 1836 | 尖桩 | dmg?/spd3/proj323 | **penetrate 10→1**（吸血鬼克星对敌特判另一链） | ✅ | ❌ | Arrow.ts:568 | Projectile.cs penetrate=10 |
| 1783 | 玉米糖 | dmg12/spd4/proj311 | **penetrate 3→1** | ✅ | ❌ | 同上 | Projectile.cs penetrate=3 |
| 771-774 | 火箭一~四型 | dmg40/40/65/65 | Specific 表解析 ✅；I 型不毁地形/II r3/III·IV r5 闸门表 ✅ | ✅ | ✅ | vanillaItemCombat.ts:414-421; Game.ts:8546-8578 | AmmoID.cs; Projectile.Kill :75260-75300 |
| 4445/4446 | 集束火箭一/二型 | — | Specific 表 776-782 ✅ + r7 爆 ✅ | ✅ | ✅ | 同上 | 同上 |
| 4447-4449/4459 | 湿/熔岩/蜂蜜/干火箭 | — | BOMB_PAYLOAD 液体载荷四分发（水/岩浆/蜜 r3、干 r3.5）✅ | ✅ | ✅ | Game.ts:8557-8562 | Projectile.Kill :74051-74244 |
| 780-784 | 绿/蓝/紫/深蓝/红溶液 | ammo=Solution ✅ | SPRAY_PROJ 八型转换表（145-149）+ 消耗门（每轮前 useTime+1 帧）✅ | ✅ | ✅ | SolutionProj.ts:24-34; Game.ts:8583-8603 | AI_031 :25321-25358; Player.cs:52739/:52815 |
| 5392-5394 | 黄/白/棕溶液 (1.4.4) | **表缺 ammo 字段**（DefaultToSolution 应 ammo=Solution） | **ammoOf() 反查得 0 → 弹药栏永远找不到 = 整族不可用**（转换表 1015-1017 本身已实装） | ✅ | ❌ | vanilla-itemcombat.json 无"5392" | Item.cs:42744-42752; DefaultToSolution :47428-47436 |
| 3103/3104 | 无尽箭袋/火枪袋 | consumable=false | 恒不耗 ✅ | ✅ | ✅ | Game.ts:8633-8638 | Item.cs:8232 |

## 问题汇总与修复要点

**统计：❌ 7 项（涉及 24 件道具）/ ⚠️ 5 项（涉及 10 件）/ 📋 1 项**

### ❌ 修复要点

1. **弹药 penetrate 全域丢失（最重，11 件）**——`Arrow.ts:568` `this.pierce = opts?.pierce ?? 1`
   不读 `projectileData(projId)?.penetrate`，弓/枪发射链（Game.ts:8605/8624 霰弹/8476 派对机枪）
   也均不传。受影响：47 邪箭(5)/51 小丑之箭(-1)/265 狱炎箭(-1)/3567 夜明弹(-1)/3009 水晶镖(5)/
   1836 尖桩(10)/3568 夜明箭(4)/1302 高速子弹(3)/1783 玉米糖(3)/234 流星弹(2)/3003 骨箭(2)。
   修法：构造器缺省改 `opts?.pierce ?? (() => { const p = pd0?.penetrate ?? 1; return p < 0 ? 6 : Math.min(p, 6); })()`
   （与 thrownCombat 路径 :8685-8687 同口径：-1 钳 6）；顺带 `life` 缺省读 `pd0?.timeLeft ?? 1200`
   （proj 5 = 120）。
2. **1179 叶绿弹追踪未实装**——AI_001 :53906-53990（300px 视距 CanBeChasedBy+CanHit 锁敌
   ai[1]、1000px 内保持、速度保持 localAI[0]）。Arrow.ts 加 `if (this.projId === 207)` 分支
   （nearestEnemyWithLos 已有现成轮子，gem homing :899 同构）。
3. **516 圣箭 Kill 坠星未实装**——Projectile.Kill :72260-72283：随机 ±400/-600..-900 高空生成
   proj 92（伤/3、ai[1]=落点 Y、ai[0]=1）。onProjectileDeath(:19834) 加 91 分支。
4. **515 水晶子弹 Kill 碎裂未实装**——:72289-72306：2×proj 90（伤×0.5、反向速度×(40-70)%±8）。
   同上 89 分支。
5. **265 狱炎箭 Kill 爆炸未实装**——:73256-73296：Item14 音 + 尘 + 64×64 判定盒重结算 Damage()
   （penetrate=-1）。同上 41 分支（可复用 rocketExplode 模式）。
6. **弹药伤害数据 4 处错**（vanilla-itemcombat.json，重跑提取器或手补）：
   546 诅咒弹 15→**12**（Item.cs:7882）/ 988 霜冻箭 9→**7**（:12724）/ 1350 纳米弹 10→**15**
   （:16662）/ 3011 灵液镖 10→**7**（:27806）。
7. **5392-5394 黄/白/棕溶液缺 ammo 字段**——vanilla-itemcombat.json 无该三条
   （Item.cs:42744-42752 DefaultToSolution(1015/1016/1017) 展开缺 ammo=AmmoID.Solution=780）；
   Game.ts:8384 ammoOf 反查得 0 → 弹药查找永远失配，三瓶溶液整族不可用（转换表 1015-1017
   与 SPRAY_PROJ 已就绪）。修法：补表三条 `{shoot:1015..1017, ammo:780, consumable:true,
   shootSpeed:6.5?…}` 按 DefaultToSolution 展开（shoot=projId-145 语义注意：5392 存的是
   1015-145=870? 否——Item.cs 直接 DefaultToSolution(1015)，helper 内 `shoot = projectileId - 145`
   **=870**，弹型再由 useAmmo 加法 145+870-870…核对 resolveAmmoProjId 溶液支 `(launcherShoot +
   ammoShoot)` = 145+870=1015 ✅，故表值 shoot=870/871/872、ammo=780）。

### ⚠️ 修复要点

1. **涂层系统未建（4668 夜明涂料/5344 回声涂料）**——paintCoating 位（Item.cs:38471/:42387）
   **→ ✅ 已实装（2026-08-23 R17 批回报,24 例绿,全链路七环）**：调研定谳原版链
   （bTileHeader3 bit5/6+bit7、sTileHeader bit15 四涂层位；paintCoatTile/Wall 原语
   id0 清双位/id1 荧光/id2 隐形；Echo=IsVisible 门（回声腔 657∨4409/5345）/
   Illuminant=GetLightOverride→White；光照扫描隐形不挡光放行天光；小地图按空气；
   存档 header4 位 2/4/8/16+荧光漆 31 迁移）→ 本仓落地：TileStore.coat 四位通道+
   涂刷/刮除双原语 1:1+ChunkCache 隐形跳过+荧光 glow 叠层（光照合成后叠回=tileLight
   White 等价）+光照/小地图/存档 RLE/.wld 导入/SmartCursor 三策略/荧光漆迁移。
   登记边界：叠层在光照合成后覆盖同格前景（全屏乘光管线最小侵入代价）/多格逐格/
   WindSway/CaptureMode/挖掘裂纹/coat 多人 TileOp 未接
   整链未建（FindPaintSlot 不认、无涂层渲染通道）。代码注释已登记"惰性"；如要实装需
   store 加 coating/coatingWall 双通道 + ChunkCache 第三层乘色 + 存档扩容，工作量一个中批。
2. **照明弹族贴墙滞留未实装（931/1614/5377-5380 六件）**——aiStyle 33 :25583-25660：撞实心
   置 localAI[0] 停速挂壁续燃（光/尘持续），离墙复位。现撞墙即亡=照明弹变照明弹丸。
   Arrow.ts 加 aiStyle 33 分支（hitWall 时置 stick 态：v 清零、life 不减、持续 addLight）。
3. **proj 478 penetrate 表值 3 应 2**（vanilla-projectiles.json，Projectile.cs:5264）——提取错；
   修 ❌1 时一并改（否则修复后诅咒镖多穿 1）。
4. **1349 派对弹 / 1351 爆破弹 Kill 视觉未实装**——:72890-72918 彩带尘 139-142×10+gore 276-282×5 /
   :72919-72935 Item14+尘。纯视觉，onProjectileDeath 加两分支即可。
5. **箱子 1000 上限门未实装**——WorldGen.PlaceChest 走 Main.chest[1000] 槽位池；本仓
   world.chests 无上限（实际影响≈0，登记）。

### 📋 登记不修

- 放置物 1000 箱上限（同上 ⚠️5 降级）；任务书 vid 勘误（工作台 18/熔炉 17/箱 21/床 79/砧 16/
  平台 19/锯木机 106/织布机 86/炼药桌 355/日晷 356/假人 378/水晶球 125/电路 136-144/传送机 235
  均为 **tile id**，对应物品 vid = 36/33/48/224/35/94/363/332/3000/3064/3202/487/538-585/1263）。

### 审计确认正确项（要点）

- 放置链：支撑行全 SolidTile2（坡/半砖/致动排除）、门 3 格寻位、火把四锚+液体门+style 帧、
  Block Swap 双镐门+积累条、桌面 1×1 族、晶塔唯一门、椅/浴缸/马桶/陷阱朝向、autoPaint、
  consumable 门、useTime×tileSpeed 倒数——逐条与 Player.cs PlaceThing 对齐。
- 合成站：vanillaNearbyStations 全 tile 入集 + TileCountsAs 8 条 1:1 + 炼药桌折扣每帧清零 +
  液体源三型编码（本仓 1水/2岩浆/3蜜 vs 原版 0/1/2 换算已注释钉死）。
- 涂料：30 色 Pass 表逐条对 TileShader 反编译（含白漆提亮曲线、反色半透明、树族特判 19 组）；
  刷/滚/刮三工具分派序、同色不耗、LongMoss 六档特例全对。
- 弹药：PickAmmo 解析链（Specific 5×12 表/火箭加法/溶液加法/尾链 0 哨兵）、重力链 flag3 全表、
  省弹四档、无尽袋、projstatus 命中 debuff 全表（含 mut 互斥组）、火箭四系闸门+液体载荷、
  溶液八型转换+消耗门、shootSpeed 38/38 全同。

## 工具类审计（5/6，❌39 ⚠️27 ✅32 + 引擎共通 E1-E9）

五个 ❌ 根因（覆盖 39 行）：
- F1｜35 件 def.tool 缺 speed/useTime → 挖掘冷却全回落 46t（原版 7-25t，慢 1.8-6.6 倍）【最重】
- F2｜8 件双工具（Drax/镐斧/锤斧）axePower 挂 def.axePower 未入 dualToolResolve → 不能砍树/锤斧误砸半砖
- F3｜2772/2773/2775 星旋斧/链锯/锤整件缺（源图在，纯提取缺口）
- F4｜5519 斧头回旋镖：弹 1052 不发射+非 autoReuse 连挥
- F5｜钻头/链锯 21 件 channel 弹幕缺失（3098 ChainsawProj 已写但 cwMelee&&!tool 门成死代码）

⚠️ 要点：8t 下限钳（蘑菇矿爪 4→8 慢一倍）、tileBoost 未进挖掘射程（激光钻头+11 全丢）、
锤墙 ×2 应 ×1.5、GetPickaxeDamage 软块九种双倍伤害整组缺、地牢砖 x∈[0.35,0.65] 豁免缺、
暗影球 31 镐可砸（应仅锤）、叶绿矿 d.pick=65 应 200。
✅：工具力 98 件全对、TILE_AXE_SHEETS 逐位一致、镐力门槛硬表一致、贴图 95/98。

## 放置/涂料/弹药审计（6/6，❌7 ⚠️5）

❌ 最重——**弹药 penetrate 全域丢失（11 件）**：Arrow.ts:568 `pierce = opts?.pierce ?? 1`
不读 projectileData().penetrate，发射链也不传 → 邪箭(5)/小丑之箭(∞)/狱炎箭(∞)/
夜明弹(∞)/水晶镖(5)/尖桩(10)/夜明箭(4)/高速子弹(3)/玉米糖(3)/流星弹(2)/骨箭(2) 全只穿 1。
其余 ❌：叶绿弹 1179 追踪未实装（AI_001 :53906）；516 圣箭坠星/515 水晶碎裂/265 狱炎爆炸
三处 Kill 缺；弹药伤害 4 错（546 15→12、988 9→7、1350 10→15、3011 10→7）；
5392-5394 溶液缺 ammo 字段→整族无法装填（补表即活）。
⚠️ 涂层系统未建（登记）、照明弹贴墙滞留、proj478 penetrate 3 应 2（提取错）、箱 1000 上限。
✅ 大面：放置链（支撑/火把四锚/Block Swap/桌面）、合成站 TileCountsAs 8 条 1:1、
床睡眠+重生点、涂料 30 色对 TileShader、PickAmmo 解析/重力/省弹、火箭四系、shootSpeed 38/38。

## ================= 审计汇总与修复派发 =================

### 六分区问题总账（去重后）

| 分区 | ❌ | ⚠️ | ✅ | 已即时修 |
|---|---|---|---|---|
| Buff 矩阵（122） | 7 仅图标 | 7 部分 | 108 | AmmoBox ✓ |
| 贴图资产 | 1 | 3 | 大面全绿（6108 逐像素） | — |
| 药水/食物 | 2 | 7 | 16 药+82 食物 | 2209+眩晕门 ✓ |
| 召唤/事件/功能 | 1 | 10 | ~30 | — |
| 工具（98） | 39 | 27 | 32 | — |
| 放置/涂料/弹药 | 7(24 件) | 5 | 大面 | — |

### 修复批派发（6 子代理，按根因聚类）

### 修复批已派发（6 子代理，第二轮）

| # | 修复域 | 覆盖项 |
|---|---|---|
| R1 | 工具 F1/F2/F3 + 钳位 + 叶绿矿 pick | 35 件 useTime + 8 双工具 + 星旋三件 + 8t 钳 + pick=200 |
| R2 | 弹药 penetrate/溶液/伤害 4 错/Kill 三件 | 11 件穿透 + 溶液装填 + proj478 |
| R3 | 药水/Buff 部分实装 | Clairvoyance 三项/SugarRush/KiteBuff 定案/Stinky/Invisibility/Warmth/CompanionCube/诡药 |
| R4 | 召唤门/useTime 5 件/BOSS_FAMILY 4 对 | 1133 丛林门 + useTime×5 + 族表 + itemcombat 补条 |
| R5 | 58 buff 缺口轻项 46 个 + Item_4722 打包 | DEFS 条目 + l10n + 资产 |
| R6 | useStyle 手位 3 项 + 叶绿弹追踪 + Kill 三件 | 饮药 Lerp/prism/claw/追踪/坠星碎裂爆炸 |

主会话已即时修 4 项（AmmoBox/2209/眩晕死门/quickDrinkPotion 分档+useTime）。
等 R1-R6 回报后终验（tsc+全量 vitest+台账终稿）。


---

## 配饰类道具审计（2026-08-22，全量 331 件）

> 审计对象：`Terarria1456/Terraria/Item.cs` SetDefaults1-5 中 `accessory = true` / `DefaultToAccessory()` 的全部配饰
> （含组合配饰/翅膀/靴族/盾族/信息类/召唤增强类；1456 反编译源共提取 **331 件**：功能配饰 296（含 51 翅膀/8 浮漂/17 线族/信息 27/召唤 8）、纯虚荣 35）。
> 对照链：`Player.cs ApplyEquipFunctional(:13952-15421)` + `GrantArmorBenefits(:12681-12870)` +
> `RefreshInfoAccsFromItemType(:12319-12400)` + `WingStatsInitializer.cs` ↔
> 本仓 `src/data/vanilla-accfx.json` + `vanillaItemStats.ts` + `vanillaSummonStats.ts` +
> `src/entities/Player.ts computeEquipStats(:810-1322)` + `src/stats/InfoAccs.ts` + `src/data/vanillaWingStats.ts` + 消费端。
> 槽位列 = Item.cs 绘制槽（necklace/shoes/shield/wings…，原版配饰槽 3-9 为通用格，槽位字段只驱动身上绘制）。
> 状态：✅确认正确 235 | ⚠️偏差 23 | ❌未实装 35 | 📋登记(虚荣/外观/1457 源外) 38

## 审计结论摘要

| 维度 | 结论 |
|---|---|
| 1. 装备槽位 | 功能槽 3-9(+恶魔心 6 格)/社交 13-19 路由正确；**绘制槽字段（shoeSlot 等 12 族）本仓数据层未提取、渲染层未消费** |
| 2. 效果实装 | accfx 数值/行为旗 + equipStats 消费链主体完整；**35 件功能效果缺失、23 处偏差**（见下） |
| 3. 组合继承链 | Terraspark/Ankh盾/十位忍者/气球束/天界贝壳/渔具袋等 20+ 组合**配方齐全**（vanilla-recipes 3342 条），继承效果除 lavaRose/熔箭/召唤徽章外齐全 |
| 4. 翅膀翼型 | vanillaWingStats 51 槽全表 1:1（FlyTime/AccRunSpeedOverride/悬浮档）；**accelMult/hoverAccelMult 聚合后零消费** |
| 5. 信息类显示 | InfoAccGates 12 门禁 + DrawInfoAccs 12 行 1:1；**背包生效域缺**（原版放背包即生效） |
| 6. 配饰贴图 | **仅翅膀层实装**（表驱动+染料+发光）；Acc_Back/Front/Shield/Shoes/Waist/Neck/Face/Balloon/Hands/Beard 十族 ~228 张贴图已入库但零消费 |

### 全量台账（331 行）

| vid | 配饰 | 槽位 | 效果 | 实装状态 | 结论 | 我方行号 | 原版行号 |
|---|---|---|---|---|---|---|---|
| 15 | 铜表(Copper Watch) | waist | 时间(铜表档) | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 16 | 银表(Silver Watch) | waist | 时间(银表档) | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 17 | 金表(Gold Watch) | waist | 时间(金表档) | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 18 | 深度计(Depth Meter) | - | 纵坐标深度计 | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 49 | 再生手环(Band of Regeneration) | handOn | 生命再生 +2/s（Item.lifeRegen=2） | itemstats.life 通道再生效（equipStats.hpPerSec） | ✅ | src/data/vanillaItemStats.ts life / src/entities/Player.ts:941 | Terarria1456/Terraria/Player.cs:12702 |
| 53 | 云朵瓶(Cloud in a Bottle) | waist | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "53" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 54 | 赫尔墨斯靴(Hermes Boots) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "54" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 111 | 星力手环(Band of Starpower) | handOn | 魔力上限 +20 | accfx 记 mana 40 =【双倍】 | ⚠️ | src/data/vanilla-accfx.json "111" | Terarria1456/Terraria/Player.cs:14375-14377 |
| 128 | 火箭靴(Rocket Boots) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "128" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 156 | 钴护盾(Cobalt Shield) | shield | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "156" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 158 | 幸运马掌(Lucky Horseshoe) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "158" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 159 | 闪亮红气球(Shiny Red Balloon) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "159" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 187 | 脚蹼(Flipper) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "187" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 193 | 黑曜石骷髅头(Obsidian Skull) | face | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "193" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 208 | 丛林玫瑰(Jungle Rose) | face | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 211 | 猛爪手套(Feral Claws) | handOn,handOff | 猛爪手套:近战速12%+自动连挥 | accfx meleeSpd+BEH autoReuseGlove | ✅ | src/data/vanillaAccFx.ts:97 | Terarria1456/Terraria/Player.cs:14553-14556 |
| 212 | 疾风脚镯(Anklet of the Wind) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "212" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 216 | 镣铐(Shackle) | handOn,handOff | 防御 +1 | itemstats.def | ✅ | src/data/vanillaItemStats.ts def / src/entities/Player.ts:700 | Terarria1456/Terraria/Player.cs:12701 |
| 223 | 大自然的恩赐(Nature's Gift) | face | 耗魔 -6%（manaCost-=0.06） | 未实装——manaCost 链只有魔力花 0.92 与套装 manaCostMul | ❌ | — | Terarria1456/Terraria/Player.cs:14561-14563 |
| 267 | 向导巫毒娃娃(Guide Voodoo Doll) | - | 击杀向导门(killGuide) | Player.ts vid 直查→projTargets 玩家伤害门 | ✅ | src/entities/Player.ts:864-867 | Terarria1456/Terraria/Player.cs:14173-14176/:8801-8804 |
| 285 | 鞋带束头(Aglet) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "285" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 393 | 罗盘(Compass) | - | 横坐标罗盘 | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 394 | 潜水装备(Diving Gear) | face | 潜水装备=脚蹼+潜水头盔 | accfx flipper+BEH divingHelm | ✅ | src/data/vanillaAccFx.ts:104 | Terarria1456/Terraria/Player.cs:14652-14656 |
| 395 | 全球定位系统(GPS) | - | GPS=表3+罗盘+深度计 | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 396 | 黑曜石马掌(Obsidian Horseshoe) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "396" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 397 | 黑曜石护盾(Obsidian Shield) | shield | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "397" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 399 | 云朵气球(Cloud in a Balloon) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "399" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 405 | 幽灵靴(Spectre Boots) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "405" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 407 | 工具腰带(Toolbelt) | waist | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "407" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 485 | 月光护身符(Moon Charm) | - | 夜晚狼人化（wolfAcc→Werewolf buff 28） | BEHAVIOR_FX 只补 861/3110,裸月光护身符未置 wolfAcc | ❌ | src/data/vanillaAccFx.ts:110-111 | Terarria1456/Terraria/Player.cs:14633-14640 |
| 489 | 巫士徽章(Sorcerer Emblem) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "489" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 490 | 战士徽章(Warrior Emblem) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "490" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 491 | 游侠徽章(Ranger Emblem) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "491" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 492 | 恶魔之翼(Demon Wings) | wing | 翼型 1(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 493 | 天使之翼(Angel Wings) | wing | 翼型 2(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 497 | 海神贝壳(Neptune's Shell) | - | 海神贝壳:水中人鱼化不耗气(accMerman) | BEHAVIOR_FX merman→呼吸链 | ✅ | src/data/vanillaAccFx.ts:110 / src/entities/Player.ts:1042 | Terarria1456/Terraria/Player.cs:15019-15024 |
| 532 | 星星斗篷(Star Cloak) | back | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "532" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 535 | 点金石(Philosopher's Stone) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "535" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 536 | 泰坦手套(Titan Glove) | handOn,handOff | 泰坦手套:近战击退×2(kbGlove,无自动连挥) | accfx kbGlove | ✅ | src/entities/Player.ts:1027 | Terarria1456/Terraria/Player.cs:15037-15040 |
| 554 | 十字项链(Cross Necklace) | neck | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "554" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 555 | 魔力花(Mana Flower) | waist | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "555" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 576 | 八音盒(Music Box) | - | 八音盒(穿戴):录下当前曲目/播放 | 穿戴录放未接;放置版八音盒 musicBoxStyle 已实装 | 📋 | src/core/Game.ts:4091 | Terarria1456/Terraria/Player.cs:15053-15620/:15439 |
| 665 | Red的翅膀(Red's Wings) | wing | 翼型 3(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 707 | 锡表(Tin Watch) | waist | 时间(锡表档) | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 708 | 钨表(Tungsten Watch) | waist | 时间(钨表档) | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 709 | 铂金表(Platinum Watch) | waist | 时间(铂表档) | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 748 | 喷气背包(Jetpack) | wing | 翼型 4(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 749 | 蝴蝶之翼(Butterfly Wings) | wing | 翼型 5(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 761 | 仙灵之翼(Fairy Wings) | wing | 翼型 6(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 785 | 鸟妖之翼(Harpy Wings) | wing | 翼型 7(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 786 | 骨之翼(Bone Wings) | wing | 翼型 8(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 821 | 烈焰之翼(Flame Wings) | wing | 翼型 9(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 822 | 冰冻之翼(Frozen Wings) | wing | 翼型 10(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 823 | 幽灵之翼(Spectre Wings) | wing | 翼型 11(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 854 | 优惠卡(Discount Card) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "854" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 855 | 幸运币(Lucky Coin) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "855" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 857 | 沙暴瓶(Sandstorm in a Bottle) | waist | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "857" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 860 | 神话护身符(Charm of Myths) | handOn | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "860" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 861 | 月亮贝壳(Moon Shell) | - | 月亮贝壳=海神贝壳+月光护身符(夜晚狼人) | BEHAVIOR_FX merman+nightWolf | ✅ | src/data/vanillaAccFx.ts:111 | Terarria1456/Terraria/Player.cs:14585-14591 |
| 862 | 星星面纱(Star Veil) | neck | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "862" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 863 | 水上漂靴(Water Walking Boots) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "863" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 885 | 粘性绷带(Adhesive Bandage) | - | 30 流血 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 886 | 盔甲抛光剂(Armor Polish) | - | 36 破甲 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 887 | 牛黄(Bezoar) | - | 20 中毒 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 888 | 蒙眼布(Blindfold) | face | 22 沉默 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 889 | 快走时钟(Fast Clock) | - | 32 缓慢 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 890 | 扩音器(Megaphone) | - | 35 蛛网状 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 891 | 邪眼(Nazar) | - | 23 黑暗 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 892 | 维生素(Vitamins) | - | 33 虚弱 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 893 | 三折地图(Trifold Map) | - | 31 困惑 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 897 | 强力手套(Power Glove) | handOn,handOff | 强力手套=猛爪+击退×2 | accfx meleeSpd/kbGlove+BEH autoReuse | ✅ | src/data/vanillaAccFx.ts:98 | Terarria1456/Terraria/Player.cs:14757-14760 |
| 898 | 闪电靴(Lightning Boots) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "898" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 899 | 太阳石(Sun Stone) | handOn | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "899" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 900 | 月亮石(Moon Stone) | handOn | 夜晚天界石复合（白天档=太阳石 899） | accfx 只有 899/1865/3110;900 夜档缺 | ❌ | src/data/vanilla-accfx.json(缺"900") | Terarria1456/Terraria/Player.cs:14871-14874 |
| 901 | 盔甲背带(Armor Bracing) | - | 33+36 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 902 | 药用绷带(Medicated Bandage) | - | 30+20 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 903 | 计划书(The Plan) | - | 32+31 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 904 | 反诅咒咒语(Countercurse Mantra) | - | 35+23+22 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 906 | 熔岩护身符(Lava Charm) | handOn | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "906" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 907 | 黑曜石水上漂靴(Obsidian Water Walking Boots) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "907" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 908 | 熔岩靴(Lava Waders) | shoe | 熔岩行者=熔岩护符+黑曜石水行靴+玫瑰 | 三项有;lavaRose 缺 | ⚠️ | src/data/vanilla-accfx.json "908" | Terarria1456/Terraria/Player.cs:14618-14624 |
| 934 | 飞毯(Flying Carpet) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "934" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 935 | 复仇者徽章(Avenger Emblem) | - | 复仇徽章:三系伤+12%+召唤伤+12% | 三系有;召唤伤+12% 缺(accfx 无 minion 通道) | ⚠️ | src/data/vanilla-accfx.json "935" | Terarria1456/Terraria/Player.cs:14895-14902 |
| 936 | 机械手套(Mechanical Glove) | handOn,handOff | 烈火手套=强力+近战伤12% | accfx+BEH | ✅ | src/data/vanillaAccFx.ts:100 | Terarria1456/Terraria/Player.cs:14819-14830 |
| 938 | 圣骑士护盾(Paladin's Shield) | shield | 圣骑士护盾:免击退+满血>25% 队伍分伤 | 分伤有(938/3998,缺 3997;缺 HP>25% 门);免击退缺(accfx 无条目) | ❌ | src/core/Game.ts:1649-1656 | Terarria1456/Terraria/Player.cs:14799-14817 |
| 948 | 蒸汽朋克之翼(Steampunk Wings) | wing | 翼型 12(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 950 | 溜冰鞋(Ice Skates) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "950" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 953 | 攀爬爪(Climbing Claws) | handOn,handOff | 攀爬爪 spikedBoots+1（贴墙缓降/蹬墙跳） | accfx 无 953 条目——单戴攀爬爪无爬墙 | ❌ | src/data/vanilla-accfx.json(缺"953") | Terarria1456/Terraria/Player.cs:14489-14492 |
| 963 | 黑腰带(Black Belt) | waist | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "963" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 975 | 鞋钉(Shoe Spikes) | shoe | 鞋钉 spikedBoots+1 | 同上,单戴鞋钉无爬墙 | ❌ | src/data/vanilla-accfx.json(缺"975") | Terarria1456/Terraria/Player.cs:14493-14496 |
| 976 | 猛虎攀爬装备(Tiger Climbing Gear) | handOn,handOff,shoe | 老虎攀爬装备 spikedBoots+2 | accfx spikedBoots=2;但本仓布尔化(=1/2 同档,原版 ≥2 才可驻停墙面) | ⚠️ | src/entities/Player.ts:1019/:3136 | Terarria1456/Terraria/Player.cs:14497-14500/:21360 |
| 977 | 分趾厚底袜(Tabi) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "977" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 982 | 魔力再生手环(Mana Regeneration Band) | handOn | 魔力+20/回蓝+25/延迟-1/再生+2 | accfx mana 40 双倍;其余三项正确 | ⚠️ | src/data/vanilla-accfx.json "982" | Terarria1456/Terraria/Player.cs:14379-14383 |
| 983 | 沙暴气球(Sandstorm in a Balloon) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "983" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 984 | 忍者大师装备(Master Ninja Gear) | handOn,handOff,shoe,waist | 十位忍者:黑带+冲刺+钉鞋2 | 三旗齐全;spikedBoots 档位塌缩同 976 | ⚠️ | src/data/vanilla-accfx.json "984" | Terarria1456/Terraria/Player.cs:14513-14518 |
| 987 | 暴雪瓶(Blizzard in a Bottle) | waist | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "987" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1131 | 重力球(Gravity Globe) | - | 重力球 gravControl2:空中按上键翻转重力 | 未实装(全仓无 gravControl) | ❌ | — | Terarria1456/Terraria/Player.cs:14519-14521/:26392 |
| 1132 | 蜂窝(Honey Comb) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1132" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1158 | 矮人项链(Pygmy Necklace) | neck | 矮人项链:随从+1 | SUMMON_GEAR slot1→equipStats.minionSlots/minionDmg/sentrySlots | ✅ | src/data/vanillaSummonStats.ts:26-40 | Terarria1456/Terraria/Player.cs:13405-13459/:12571-12575 |
| 1162 | 叶之翼(Leaf Wings) | wing | 翼型 13(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 1163 | 暴雪气球(Blizzard in a Balloon) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1163" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1164 | 气球束(Bundle of Balloons) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1164" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1165 | 蝙蝠之翼(Bat Wings) | wing | 翼型 14(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 1167 | 大力士甲虫(Hercules Beetle) | - | 大力士甲虫:召唤伤15%/击退+2 | SUMMON_GEAR→equipStats.minionSlots/minionDmg/sentrySlots | ✅ | src/data/vanillaSummonStats.ts:26-40 | Terarria1456/Terraria/Player.cs:13405-13459/:12571-12575 |
| 1247 | 蜜蜂斗篷(Bee Cloak) | back | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1247" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1248 | 石巨人之眼(Eye of the Golem) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1248" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1249 | 蜂蜜气球(Honey Balloon) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1249" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1250 | 蓝马掌气球(Blue Horseshoe Balloon) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1250" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1251 | 白马掌气球(White Horseshoe Balloon) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1251" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1252 | 黄马掌气球(Yellow Horseshoe Balloon) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1252" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1253 | 冰冻海龟壳(Frozen Turtle Shell) | - | 冰冻海龟壳:生命<50% 挂 IceBarrier(62) 护盾 buff | 未实装(无 IceBarrier buff/护盾) | ❌ | — | Terarria1456/Terraria/Player.cs:14348-14351 |
| 1290 | 恐慌项链(Panic Necklace) | neck | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1290" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1300 | 步枪瞄准镜(Rifle Scope) | - | 步枪镜:手持弹族武器右键镜移（★原勘误"仇恨-400"有误——1456 :14354-14362 是 scope/zoom 块,无 aggro 赋值;aggro 真集见修复要点 32） | 镜移 zoom 已实装(1300/1858/4005) | ✅ | src/core/Game.ts:5740-5750 | Terarria1456/Terraria/Player.cs:14354-14362 |
| 1301 | 毁灭者徽章(Destroyer Emblem) | - | 毁灭者徽章:三系伤10%/暴8%+召唤伤10% | 三系有;召唤伤+10% 缺 | ⚠️ | src/data/vanilla-accfx.json "1301" | Terarria1456/Terraria/Player.cs:14424-14431 |
| 1303 | 水母项链(Jellyfish Necklace) | neck | 水母项链:湿身发光 AddLight | 未实装(纯光效) | ❌ | — | Terarria1456/Terraria/Player.cs:14675-14683 |
| 1307 | 服装商巫毒娃娃(Clothier Voodoo Doll) | - | 击杀裁缝门(killClothier) | Player.ts vid 直查→projTargets 玩家伤害门 | ✅ | src/entities/Player.ts:864-867 | Terarria1456/Terraria/Player.cs:14173-14176/:8801-8804 |
| 1321 | 魔法箭袋(Magic Quiver) | back | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1321" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1322 | 岩浆石(Magma Stone) | - | 岩浆石:近战命中点燃(magmaStone) | equipStats.magmaStone 消费端在,但 accfx 无 1322 条目→恒 false(仅 PvP 侧 Game.ts:1714 直查 vid 兜住) | ❌ | src/data/vanilla-accfx.json(缺"1322") | Terarria1456/Terraria/Player.cs:14787-14790 |
| 1323 | 黑曜石玫瑰(Obsidian Rose) | face | 黑曜石玫瑰 lavaRose:岩浆伤 80→45/燃烧 420→210 | 未实装(岩浆伤恒 80+OnFire420) | ❌ | — | Terarria1456/Terraria/Player.cs:14791-14794/:27376-27390 |
| 1343 | 烈火手套(Fire Gauntlet) | handOn,handOff | 火焰手套=烈火+岩浆石点燃 | accfx 三项+BEH autoReuse;magmaStone 旗缺(同 1322 全局) | ⚠️ | src/data/vanillaAccFx.ts:99 | Terarria1456/Terraria/Player.cs:14785-14798 |
| 1515 | 蜜蜂之翼(Bee Wings) | wing | 翼型 15(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 1578 | 甜心项链(Sweetheart Necklace) | neck | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1578" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1579 | 疾风雪靴(Flurry Boots) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1579" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1583 | D-Town的翅膀(D-Town's Wings) | wing | 翼型 16(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 1584 | Will的翅膀(Will's Wings) | wing | 翼型 17(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 1585 | Crowno的翅膀(Crowno's Wings) | wing | 翼型 18(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 1586 | Cenx的翅膀(Cenx's Wings) | wing | 翼型 19(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 1595 | 魔法手铐(Magic Cuffs) | handOn,handOff | 魔力+20/受伤回蓝 | accfx mana 40 双倍;magicCuffs 正确 | ⚠️ | src/data/vanilla-accfx.json "1595" | Terarria1456/Terraria/Player.cs:14385-14388 |
| 1612 | 十字章护身符(Ankh Charm) | - | 十项全免 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 1613 | 十字章护盾(Ankh Shield) | shield | 46+十项 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 1724 | 罐中臭屁(Fart in a Jar) | waist | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1724" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1797 | 褴褛仙灵之翼(Tattered Fairy Wings) | wing | 翼型 20(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 1830 | 阴森之翼(Spooky Wings) | wing | 翼型 21(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 1845 | 死灵卷轴(Necromantic Scroll) | - | 死灵卷轴:随从+1/召唤伤10% | SUMMON_GEAR→equipStats.minionSlots/minionDmg/sentrySlots | ✅ | src/data/vanillaSummonStats.ts:26-40 | Terarria1456/Terraria/Player.cs:13405-13459/:12571-12575 |
| 1858 | 狙击镜(Sniper Scope) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1858" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1860 | 水母潜水装备(Jellyfish Diving Gear) | face | 水母潜水装备=潜水装备+浸水发光 | accfx flipper+BEH divingHelm/jellyfishGlow | ✅ | src/data/vanillaAccFx.ts:105 | Terarria1456/Terraria/Player.cs:14657-14674 |
| 1861 | 北极潜水装备(Arctic Diving Gear) | face | 极地潜水装备=水母潜水+冰刀+寒免疫 | accfx flipper/iceSkate+BEH 三旗 | ✅ | src/data/vanillaAccFx.ts:106 | Terarria1456/Terraria/Player.cs:14689-14706 |
| 1862 | 霜花靴(Frostspark Boots) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1862" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1863 | 臭屁气球(Fart in a Balloon) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1863" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1864 | 甲虫莎草纸(Papyrus Scarab) | - | 甲虫莎草纸:随从+1/召唤伤15%/击退+2 | SUMMON_GEAR→equipStats.minionSlots/minionDmg/sentrySlots | ✅ | src/data/vanillaSummonStats.ts:26-40 | Terarria1456/Terraria/Player.cs:13405-13459/:12571-12575 |
| 1865 | 天界石(Celestial Stone) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "1865" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 1866 | 悬浮板(Hoverboard) | wing | 翼型 22(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 1871 | 喜庆之翼(Festive Wings) | wing | 翼型 23(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 1921 | 暖手宝(Hand Warmer) | handOn,handOff | 46+47 冰寒 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 1923 | 工具箱(Toolbox) | - | 工具箱 tileRangeX/Y +1 | 未实装(tileRange 旗只有 2215/3061/5126 档 +3/+2) | ❌ | — | Terarria1456/Terraria/Player.cs:14405-14408 |
| 1987 | 天使光环(Angel Halo) | - | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 2219 | 天界磁石(Celestial Magnet) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "2219" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 2220 | 天界徽章(Celestial Emblem) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "2220" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 2221 | 天界手铐(Celestial Cuffs) | handOn,handOff | 魔力+20/磁石/受伤回蓝 | accfx mana 40 双倍;其余正确 | ⚠️ | src/data/vanilla-accfx.json "2221" | Terarria1456/Terraria/Player.cs:14399-14403 |
| 2276 | 钻石戒指(Diamond Ring) | handOn | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 2280 | 甲虫之翼(Beetle Wings) | wing | 翼型 24(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 2373 | 优质钓鱼线(High Test Fishing Line) | - | 优质钓鱼线:收竿 1/7 脱钩豁免 | 未实装——本仓收竿无 1/7 脱钩基底机制,饰品无可豁免 | ❌ | — | Terarria1456/Terraria/Player.cs:14111-14113/:51599-51602 |
| 2374 | 渔夫耳环(Angler Earring) | - | 渔夫耳环:钓鱼技能 +10 | 未实装(fishingSkill 聚合只收浮漂 5139-5146) | ❌ | src/entities/Player.ts:869-873 | Terarria1456/Terraria/Player.cs:14115-14117 |
| 2375 | 钓具箱(Tackle Box) | - | 钓具箱:鱼饵消耗分母 +1 | 未实装——Bobber 读 equipStats.fishingTackle,该字段不存在恒 false | ❌ | src/entities/Bobber.ts:418-424 | Terarria1456/Terraria/Player.cs:14123-14125/:51645 |
| 2423 | 蛙腿(Frog Leg) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "2423" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 2494 | 鳍翼(Fin Wings) | wing | 翼型 25(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 2501 | 姜须(Ginger Beard) | beard | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 2609 | 猪龙鱼之翼(Fishron Wings) | wing | 翼型 26(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 2770 | 蛾怪之翼(Mothron Wings) | wing | 翼型 27(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 2799 | 机械标尺(Mechanical Ruler) | - | 机械标尺 rulerGrid:放置显示网格尺 | 未实装(全仓无 ruler 网格显示) | ❌ | — | Terarria1456/Terraria/Player.cs:14645-14648/:45679 |
| 2998 | 召唤师徽章(Summoner Emblem) | - | 召唤徽章:召唤伤 +15% | 未实装——SUMMON_GEAR 缺 2998(1167/1845/1864 有,2998 漏) | ❌ | src/data/vanillaSummonStats.ts:26-33 | Terarria1456/Terraria/Player.cs:14891-14894 |
| 3015 | 腐香囊(Putrid Scent) | - | 恶臭气味:三系+5%伤/+5%暴+召唤伤5%+仇恨-400 | 三系伤暴有;召唤伤+5% 与 aggro-400 缺 | ⚠️ | src/data/vanilla-accfx.json "3015" | Terarria1456/Terraria/Player.cs:14096-14106 |
| 3016 | 血肉指虎(Flesh Knuckles) | - | 肉拳:防御+8(近战暴击+仇恨+400 档) | def+8 有(itemstats);aggro+400 缺(本仓 aggro getter 只算潜行装) | ⚠️ | src/data/vanillaItemStats.ts def / src/entities/Player.ts:1460-1467 | Terarria1456/Terraria/Player.cs:14107-14109 |
| 3017 | 花靴(Flower Boots) | shoe | 花靴:行走生花(flowerBoots) | accfx+BEH flowerBoots→DoBootsEffect 消费 | ✅ | src/data/vanillaAccFx.ts:114-115 | Terarria1456/Terraria/Player.cs:12686-12694 |
| 3033 | 金戒指(Gold Ring) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3033" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3034 | 钱币戒指(Coin Ring) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3034" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3035 | 贪婪戒指(Greedy Ring) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3035" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3036 | 探鱼器(Fish Finder) | - | 渔情 | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 3037 | 天气收音机(Weather Radio) | - | 天气 | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 3061 | 建筑师发明背包(Architect Gizmo Pack) | back | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3061" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3068 | 植物纤维绳索宝典(Guide to Plant Fiber Cordage) | - | 植物纤维绳指南:割藤掉藤绳(cordage) | 未实装 | ❌ | — | Terarria1456/Terraria/Player.cs:14460-14462 |
| 3084 | 雷达(Radar) | - | 敌怪数(雷达) | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 3090 | 皇家凝胶(Royal Gel) | - | 皇家凝胶:23 类史莱姆不索敌 | 未接线——CALMING_NO_AGGRO_TYPES 只对镇静药水 buff 生效,装备 3090 无门 | ❌ | src/entities/Enemy.ts:20-26/:1237 | Terarria1456/Terraria/Player.cs:14144-14168 |
| 3095 | 杀怪计数器(Tally Counter) | - | 击杀数 | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 3096 | 六分仪(Sextant) | - | 月相 | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 3097 | 克苏鲁护盾(Shield of Cthulhu) | shield | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3097" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3099 | 秒表(Stopwatch) | - | 速度秒表 | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 3102 | 金属探测器(Metal Detector) | - | 金属探测 | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 3110 | 天界贝壳(Celestial Shell) | - | 天界贝壳=月亮贝壳+天界石 | accfx skyStone+BEH merman/nightWolf 复合 | ✅ | src/data/vanillaAccFx.ts:112 / src/entities/Player.ts:1256-1263 | Terarria1456/Terraria/Player.cs:14853-14865 |
| 3118 | 生命体分析机(Lifeform Analyzer) | - | 稀有生物 | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 3119 | 每秒伤害计数器(DPS Meter) | - | DPS | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 3120 | 渔民袖珍宝典(Fisherman's Pocket Guide) | - | 渔情(单) | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 3121 | 哥布林数据仪(Goblin Tech) | - | 哥布林数据仪=秒表+金属探测+DPS | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 3122 | R.E.K.3000(R.E.K. 3000) | - | R.E.K.3000=雷达+击杀+稀有 | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 3123 | 个人数字助手(PDA) | - | PDA=GPS+渔情+天气+月相 | InfoAccGates 12 门禁 1:1+DrawInfoAccs 12 行显示(背包生效域缺口见全局行) | ✅ | src/stats/InfoAccs.ts:46-86 / src/core/Game.ts:18221 | Terarria1456/Terraria/Player.cs:12319-12400/:12494-12500 |
| 3200 | 旗鱼靴(Sailfish Boots) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3200" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3201 | 海啸瓶(Tsunami in a Bottle) | waist | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3201" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3212 | 鲨牙项链(Shark Tooth Necklace) | neck | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3212" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3223 | 混乱之脑(Brain of Confusion) | - | 混乱之脑:受击 1/6 闪避→buff321 | 半实装——消费端 Player.ts:5297 读 equipStats.boc,但 accfx 无 3223 条目→boc 恒 false | ❌ | src/data/vanilla-accfx.json(缺"3223") | Terarria1456/Terraria/Player.cs:14536-14539 |
| 3224 | 蠕虫围巾(Worm Scarf) | neck | 蠕虫围巾:受伤减免 17%(endurance+=0.17) | 未实装——endurance 链只有药水/甲虫/日曜套 | ❌ | src/entities/Player.ts:5207-5209 | Terarria1456/Terraria/Player.cs:14532-14535 |
| 3225 | 气球河豚鱼(Balloon Pufferfish) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3225" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3228 | Lazure的屏障台(Lazure's Barrier Platform) | wing | 翼型 28(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 3241 | 鲨鱼龙气球(Sharkron Balloon) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3241" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3245 | 骨头手套(Bone Glove) | handOn,handOff | 骨手套:挥动伤害武器时掷骨弹 532(25 伤) | 未实装 | ❌ | — | Terarria1456/Terraria/Player.cs:14084-14087/:42939-42944 |
| 3250 | 绿马掌气球(Green Horseshoe Balloon) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3250" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3251 | 琥珀马掌气球(Amber Horseshoe Balloon) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3251" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3252 | 粉马掌气球(Pink Horseshoe Balloon) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3252" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3293 | 红绳(Red String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3294 | 橙绳(Orange String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3295 | 黄绳(Yellow String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3296 | 橙绿绳(Lime String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3297 | 绿绳(Green String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3298 | 青绿绳(Teal String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3299 | 青绳(Cyan String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3300 | 天蓝绳(Sky Blue String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3301 | 蓝绳(Blue String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3302 | 紫绳(Purple String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3303 | 蓝紫绳(Violet String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3304 | 粉绳(Pink String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3305 | 棕绳(Brown String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3306 | 白绳(White String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3307 | 彩虹绳(Rainbow String) | - | 悠悠球线染色(stringColor=N)+线长 | itemstats.str 通道→stringColor→StringLine 渲染 | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3308 | 黑绳(Black String) | - | 黑绳:线色 13 | 同上(str13) | ✅ | src/data/vanillaItemStats.ts str / src/entities/Player.ts:893-897 | Terarria1456/Terraria/Player.cs:36441-36449 |
| 3333 | 蜂巢背包(Hive Pack) | back | 蜂巢背包:蜜蜂类武器强化(strongBees) | 已实装(蜂群反击数量/基伤档) | ✅ | src/core/Game.ts:19674/:587-592 | Terarria1456/Terraria/Player.cs:14795-14798 |
| 3334 | 悠悠球手套(Yoyo Glove) | handOn,handOff | 悠悠球手套:yoyoGlove | vid 直查 | ✅ | src/entities/Player.ts:922 | Terarria1456/Terraria/Player.cs:14223-14226 |
| 3336 | 孢子囊(Spore Sac) | - | 孢子囊:周期性孢子云伤敌 | 未实装 | ❌ | — | Terarria1456/Terraria/Player.cs:14236-14239 |
| 3337 | 闪亮石(Shiny Stone) | - | 闪亮石:站立不动魔力再生大增 | 未实装 | ❌ | — | Terarria1456/Terraria/Player.cs:14227-14230/:18771/:19067 |
| 3366 | 悠悠球袋(Yoyo Bag) | - | 悠悠球袋:线+手套+副球(使用期掷色) | Player.ts vid 直查+rollYoyoCounterweight 消费端掷 | ✅ | src/entities/Player.ts:893-911 | Terarria1456/Terraria/Player.cs:14174-14189 |
| 3468 | 日耀之翼(Solar Wings) | wing | 翼型 29(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 3469 | 星旋强化翼(Vortex Booster) | wing | 翼型 30(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 3470 | 星云斗篷(Nebula Mantle) | wing | 翼型 31(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 3471 | 星尘之翼(Stardust Wings) | wing | 翼型 32(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 3536 | 星旋天塔柱(Vortex Monolith) | - | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 3537 | 星云天塔柱(Nebula Monolith) | - | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 3538 | 星尘天塔柱(Stardust Monolith) | - | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 3539 | 日耀天塔柱(Solar Monolith) | - | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 3580 | Yoraiz0r的魔法(Yoraiz0r's Spell) | wing | 翼型 33(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 3581 | Yoraiz0r的怒容(Yoraiz0r's Scowl) | - | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 3582 | Jim的翅膀(Jim's Wings) | wing | 翼型 34(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 3588 | Skiphs的爪子(Skiphs' Paws) | wing | 翼型 35(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 3592 | Loki的翅膀(Loki's Wings) | wing | 翼型 36(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 3619 | 机械透镜(Mechanical Lens) | - | 机械透镜:装备/持有即显电线+rulerLine+Grid | 未实装——showWires 只看手持电线工具 | ❌ | src/core/Game.ts:22581 | Terarria1456/Terraria/Player.cs:12432-12435 |
| 3624 | 自动安放器(Presserator) | - | 加压器 Presserator:放置即自动致动(autoActuator) | 未实装 | ❌ | — | Terarria1456/Terraria/Player.cs:14746-14748/:39807 |
| 3721 | 渔夫渔具袋(Angler Tackle Bag) | back | 渔具袋:钓线不断+饵耗分母+1+钓技+10 | 三项全缺(同 2373/2375/2374) | ❌ | src/entities/Bobber.ts:418-424 | Terarria1456/Terraria/Player.cs:14131-14135 |
| 3730 | 派对气球束(Bundled Party Balloons) | balloon | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 3731 | 气球兔兔(Balloon Animal) | balloon | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 3781 | 袖珍镜(Pocket Mirror) | - | 156 石化 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 3809 | 学徒围巾(Apprentice's Scarf) | neck | 学徒围巾:DD2 套件布尔(哨兵+1/召唤伤10%,四件计一次) | SUMMON_GEAR dd2→equipStats.minionSlots/minionDmg/sentrySlots | ✅ | src/data/vanillaSummonStats.ts:26-40 | Terarria1456/Terraria/Player.cs:13405-13459/:12571-12575 |
| 3810 | 侍卫护盾(Squire's Shield) | shield | 侍卫护盾:同 DD2 布尔 | SUMMON_GEAR dd2→equipStats.minionSlots/minionDmg/sentrySlots | ✅ | src/data/vanillaSummonStats.ts:26-40 | Terarria1456/Terraria/Player.cs:13405-13459/:12571-12575 |
| 3811 | 女猎人圆盾(Huntress's Buckler) | handOn | 女猎人圆盾:同 DD2 布尔 | SUMMON_GEAR dd2→equipStats.minionSlots/minionDmg/sentrySlots | ✅ | src/data/vanillaSummonStats.ts:26-40 | Terarria1456/Terraria/Player.cs:13405-13459/:12571-12575 |
| 3812 | 武僧腰带(Monk's Belt) | waist | 武僧腰带:同 DD2 布尔 | SUMMON_GEAR dd2→equipStats.minionSlots/minionDmg/sentrySlots | ✅ | src/data/vanillaSummonStats.ts:26-40 | Terarria1456/Terraria/Player.cs:13405-13459/:12571-12575 |
| 3883 | 双足翼龙之翼(Betsy's Wings) | wing | 翼型 37(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 3924 | Arkhalis的飞翼(Arkhalis' Lightwings) | wing | 翼型 38(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 3928 | Leinfors的卷缠斗篷(Leinfors' Prehensile Cloak) | wing | 翼型 39(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 3929 | Leinfors的奢华洗发液(Leinfors' Luxury Shampoo) | - | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 3990 | 水陆两用靴(Amphibian Boots) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3990" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3991 | 奥术花(Arcane Flower) | face | 奥术花:法力花+耗魔-8%+仇恨-400(+1457 暴击/伤) | 法力花/暴伤增强有;aggro-400 缺 | ⚠️ | src/entities/Player.ts:1046-1053 | Terarria1456/Terraria/Player.cs:14037-14041 |
| 3992 | 狂战士手套(Berserker's Glove) | handOn,handOff | 狂战士手套=泰坦+猛爪档 | accfx meleeSpd/kbGlove+BEH autoReuse;aggro+400 缺(见特判) | ⚠️ | src/data/vanillaAccFx.ts:101 | Terarria1456/Terraria/Player.cs:13993-13999 |
| 3993 | 仙灵靴(Fairy Boots) | shoe | 仙女靴=闪电靴档+花靴 | accfx runSpeed/rocketBoots/flowerBoots+bootFx fairy | ✅ | src/entities/Player.ts:890-899 | Terarria1456/Terraria/Player.cs:14028-14032/:12686 |
| 3994 | 青蛙脚蹼(Frog Flipper) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3994" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3995 | 青蛙装备(Frog Gear) | handOn,handOff,shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3995" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3996 | 青蛙蹼(Frog Webbing) | handOn,handOff | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3996" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 3997 | 冰冻护盾(Frozen Shield) | shield | 冰冻护盾=圣骑士盾+冰龟壳 IceBarrier+免击退 | 无 paladin 分伤(不在表)/无 IceBarrier/无免击退 | ❌ | — | Terarria1456/Terraria/Player.cs:14348/:14799 |
| 3998 | 英雄护盾(Hero Shield) | shield | 英雄护盾=圣骑士盾+免击退 | 分伤有;免击退缺;缺 HP 门 | ⚠️ | src/core/Game.ts:1649-1656 | Terarria1456/Terraria/Player.cs:14799-14817 |
| 3999 | 岩浆骷髅头(Magma Skull) | face | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "3999" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 4000 | 磁花(Magnet Flower) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "4000" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 4001 | 魔力斗篷(Mana Cloak) | back,front | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "4001" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 4002 | 熔火箭袋(Molten Quiver) | back | 熔火箭袋=魔法箭袋+岩浆石:箭伤10%+木箭变火矢 | quiver/arrowDmg 有;moltenQuiver 旗缺(木箭不变火矢) | ⚠️ | src/data/vanilla-accfx.json "4002" | Terarria1456/Terraria/Player.cs:14051-14055 |
| 4003 | 熔火骷髅头玫瑰(Molten Skull Rose) | face | 熔火骷髅玫瑰:火免+lavaMax+lavaRose | lavaRose 缺(火免/lavaMax 有) | ⚠️ | src/data/vanilla-accfx.json "4003" | Terarria1456/Terraria/Player.cs:14043-14046 |
| 4004 | 黑曜石骷髅头玫瑰(Obsidian Skull Rose) | face | 黑曜石骷髅玫瑰:火免+lavaRose | lavaRose 缺(火免有) | ⚠️ | src/data/vanilla-accfx.json "4004" | Terarria1456/Terraria/Player.cs:14047-14050 |
| 4005 | 侦察镜(Recon Scope) | - | 侦察镜=步枪镜+箭袋档:远程10%伤/10%暴+仇恨-400 | 伤/暴/镜移有;aggro-400 缺 | ⚠️ | src/data/vanilla-accfx.json "4005" | Terarria1456/Terraria/Player.cs:14063-14067 |
| 4006 | 潜行者箭袋(Stalker's Quiver) | back | 潜行者箭袋=魔法箭袋+恶臭:箭伤10%+仇恨-400 | 箭伤有;aggro-400 缺 | ⚠️ | src/data/vanilla-accfx.json "4006" | Terarria1456/Terraria/Player.cs:14068-14072 |
| 4007 | 毒刺项链(Stinger Necklace) | neck | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "4007" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 4038 | 熔火护身符(Molten Charm) | neck | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "4038" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 4054 | 血月天塔柱(Blood Moon Monolith) | - | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 4055 | 沙丘行者靴(Dunerider Boots) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "4055" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 4056 | 远古凿子(Ancient Chisel) | - | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "4056" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 4318 | 虚空天塔柱(Void Monolith) | - | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 4341 | 梯凳(Step Stool) | - | 梯凳:站立增高 26px(HasAStool) | Player.ts vid 直查→stepStool 消费(:2289) | ✅ | src/entities/Player.ts:865/:2289 | Terarria1456/Terraria/Player.cs:14077-14080 |
| 4404 | 浮游圈(Inner Tube) | - | 浮游圈:水上漂浮(canFloat) | vid 直查→canFloat 消费(:2976) | ✅ | src/entities/Player.ts:864/:2976 | Terarria1456/Terraria/Player.cs:12842-12846 |
| 4409 | 幽灵护目镜(Spectre Goggles) | face | 幽灵护目镜:可见回声块(CanSeeInvisibleBlocks) | 未实装(回声块仅 wire 高位暂记) | ❌ | — | Terarria1456/Terraria/Player.cs:14077-14080 |
| 4563 | 假独角兽角(Fake Unicorn Horn) | - | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 4730 | Ghostar的无极翼(Ghostar's Infinity Eight) | wing | 翼型 40(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 4744 | 猎人斗篷(Hunter Cloak) | back,front | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 4746 | Safeman的毛毯斗篷(Safeman's Blanket Cape) | wing | 翼型 41(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 4750 | FoodBarbarian的褴褛龙之翼(FoodBarbarian's Tattered Dragon Wings) | wing | 翼型 42(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 4754 | Grox The Great的翅膀(Grox The Great's Wings) | wing | 翼型 43(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 4762 | 小动物香波(Critter Shampoo) | - | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 4769 | 狗尾巴(Dog Tail) | back | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 4771 | 狐狸尾巴(Fox Tail) | back | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 4773 | 蜥蜴尾巴(Lizard Tail) | back | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 4775 | 兔兔尾巴(Bunny Tail) | back | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 4822 | 烈焰靴(Flame Waker Boots) | shoe | 烈焰行者靴:行走火焰尾迹(虚荣) | 未实装(纯粒子外观) | 📋 | — | Terarria1456/Terraria/Player.cs:14625-14628 |
| 4823 | 女皇之翼(Empress Wings) | wing | 翼型 44(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 4874 | 狱炎战靴(Hellfire Treads) | shoe | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "4874" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 4881 | 防熔岩钓钩(Lavaproof Fishing Hook) | - | 防熔钓鱼钩:可岩浆钓鱼(accLavaFishing) | 未实装——Bobber 读 equipStats.lavaFishing,字段不存在恒 false | ❌ | src/entities/Bobber.ts:426-432 | Terarria1456/Terraria/Player.cs:14127-14129/:19230 |
| 4954 | 天界星盘(Celestial Starboard) | wing | 翼型 45(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 4978 | 雏翼(Fledgling Wings) | wing | 翼型 46(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 4987 | 挥发明胶(Volatile Gelatin) | - | 挥发光胶:皇家凝胶肉后版(凝胶反击) | 未实装 | ❌ | — | Terarria1456/Terraria/Player.cs:14241-14244 |
| 4989 | 翱翔徽章(Soaring Insignia) | - | 翱翔徽章:移速+7.5%/跳高+1.8/加速度×1.75/落地回满翼时 | 仅 move+0.075 实装;jumpSpd/accel×1.75/wingTime 刷新缺 | ⚠️ | src/data/vanilla-accfx.json "4989" | Terarria1456/Terraria/Player.cs:14231-14234/:19317-19319/:26185-26187/:21962 |
| 5000 | 泰拉闪耀靴(Terraspark Boots) | shoe | 泰拉闪耀靴=霜 spark+熔岩行者全套 | 全套有(lavaMax/火免/水行/冰刀/移速/火箭4);lavaRose 缺(同 908) | ⚠️ | src/data/vanilla-accfx.json "5000" | Terarria1456/Terraria/Player.cs:14841-14847/:14618-14624 |
| 5010 | 宝藏磁石(Treasure Magnet) | waist | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "5010" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 5064 | 防熔岩渔具袋(Lavaproof Tackle Bag) | back | 防熔渔具袋:钓线+饵耗+钓技+10+岩浆钓 | 四项全缺(同上族) | ❌ | src/entities/Bobber.ts:418-432 | Terarria1456/Terraria/Player.cs:14137-14141 |
| 5075 | 彩虹光标(Rainbow Cursor) | - | 彩虹光标:光标染色 | 未实装(纯外观) | 📋 | — | Item.cs vanity |
| 5076 | 皇家权杖(Royal Scepter) | balloon | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 5077 | 水晶鞋(Glass Slipper) | shoe | 玻璃拖鞋:行走火花粒子 | 未实装(纯外观) | 📋 | — | Terarria1456/Terraria/Player.cs:13966-13968 |
| 5080 | 王子披风(Prince Cape) | back,front | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 5100 | 骸骨头盔(Bone Helm) | face | 骸骨头盔:周期幻影骷髅(964 弹)攻敌 | 已实装(insanityShadow 冷却链) | ✅ | src/entities/Player.ts:1761 | Terarria1456/Terraria/Player.cs:12823/:13627 |
| 5104 | 绅士胡子(Gentleman's Beard) | beard | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 5105 | 绅士长胡子(Gentleman's Long Beard) | beard | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 5106 | 绅士大胡子(Gentleman's Magnificent Beard) | beard | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 5107 | 魔光护符(Magiluminescence) | neck | 荧光体 Magiluminescence:地面加速×1.75/速上限×1.15+发光 | 未实装 | ❌ | — | Terarria1456/Terraria/Player.cs:14087-14093/:26188-26194 |
| 5126 | 创造之手(Hand Of Creation) | handOn,handOff,back | 造物之手=梯凳+砌砖刀+喷漆器+射程+宝藏磁石+古凿 | vid 直查六件套 | ✅ | src/entities/Player.ts:866 | Terarria1456/Terraria/Player.cs:14077-14080/:14750-14756 |
| 5139 | 钓鱼浮标(Fishing Bobber) | - | 浮漂外观覆写(overrideFishingBobber=986+N)+钓技+10 | vid 直查双通道 | ✅ | src/entities/Player.ts:869-873 | Terarria1456/Terraria/Player.cs:14119-14124/:36244-36272 |
| 5140 | 发光钓鱼浮标(Glowing Fishing Bobber) | - | 浮漂外观覆写(overrideFishingBobber=986+N)+钓技+10 | vid 直查双通道 | ✅ | src/entities/Player.ts:869-873 | Terarria1456/Terraria/Player.cs:14119-14124/:36244-36272 |
| 5141 | 熔岩苔藓钓鱼浮标(Lava Moss Fishing Bobber) | - | 浮漂外观覆写(overrideFishingBobber=986+N)+钓技+10 | vid 直查双通道 | ✅ | src/entities/Player.ts:869-873 | Terarria1456/Terraria/Player.cs:14119-14124/:36244-36272 |
| 5142 | 氪苔藓钓鱼浮标(Krypton Moss Fishing Bobber) | - | 浮漂外观覆写(overrideFishingBobber=986+N)+钓技+10 | vid 直查双通道 | ✅ | src/entities/Player.ts:869-873 | Terarria1456/Terraria/Player.cs:14119-14124/:36244-36272 |
| 5143 | 氙苔藓钓鱼浮标(Xenon Moss Fishing Bobber) | - | 浮漂外观覆写(overrideFishingBobber=986+N)+钓技+10 | vid 直查双通道 | ✅ | src/entities/Player.ts:869-873 | Terarria1456/Terraria/Player.cs:14119-14124/:36244-36272 |
| 5144 | 氩苔藓钓鱼浮标(Argon Moss Fishing Bobber) | - | 浮漂外观覆写(overrideFishingBobber=986+N)+钓技+10 | vid 直查双通道 | ✅ | src/entities/Player.ts:869-873 | Terarria1456/Terraria/Player.cs:14119-14124/:36244-36272 |
| 5145 | 氖苔藓钓鱼浮标(Neon Moss Fishing Bobber) | - | 浮漂外观覆写(overrideFishingBobber=986+N)+钓技+10 | vid 直查双通道 | ✅ | src/entities/Player.ts:869-873 | Terarria1456/Terraria/Player.cs:14119-14124/:36244-36272 |
| 5146 | 氦苔藓钓鱼浮标(Helium Moss Fishing Bobber) | - | 浮漂外观覆写(overrideFishingBobber=986+N)+钓技+10 | vid 直查双通道 | ✅ | src/entities/Player.ts:869-873 | Terarria1456/Terraria/Player.cs:14119-14124/:36244-36272 |
| 5331 | 马掌气球束(Bundle of Horseshoe Balloons) | balloon | 见 vanilla-accfx.json 条目(数值/行为旗) | accfx 表条目+equipStats 消费链 | ✅ | src/data/vanilla-accfx.json "5331" | Terarria1456/Terraria/Player.cs:13952-15421 |
| 5345 | 回声腔(Echo Chamber) | - | 回声室:穿戴可见回声块(ApplyEquipVanity) | 未实装(同 4409) | 📋 | — | Terarria1456/Terraria/Player.cs:13796-13799 |
| 5347 | 以太天塔柱(Aether Monolith) | - | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 5354 | 反光墨镜(Reflective Shades) | face | 22+156 免疫 | IMMUNE_ACC 表逐条 1:1(885-893/901-904/1612/1613/1921/3781/5354) | ✅ | src/entities/Player.ts:107-119/:876 | Terarria1456/Terraria/Player.cs:14911-15003 |
| 5355 | 炫彩斗篷(Chromatic Cloak) | back,front | 微光斗篷:非下按态微光免疫(shimmerImmune) | 未实装——Player.ts:2054 注明"原版旗标来源未移植恒 false" | ❌ | src/entities/Player.ts:2054 | Terarria1456/Terraria/Player.cs:14979-14982 |
| 5452 | FPV飞行眼镜(FPV Goggles) | face | FPV 镜:无人机宠物视野接管(remoteVisionForDrone) | 未实装(无人机宠物骑乘视野) | 📋 | — | Terarria1456/Terraria/Player.cs:14910-14913 |
| 5465 | 重锤符文(Ram Rune) | - | 山羊符文:Dead Cells 下坠冲刺(hasDeadCellsDownDash) | 未实装 | ❌ | — | Terarria1456/Terraria/Player.cs:13977-13979 |
| 5540 | 魔法绳(Magic String) | - | 魔法绳:线色 29+magicString | vid 直查 | ✅ | src/entities/Player.ts:912 | Terarria1456/Terraria/Player.cs:14195-14197 |
| 5541 | 魔法悠悠球袋(Magic Yoyo Bag) | - | 魔法悠悠球袋=悠悠球袋+魔法绳 | vid 直查四旗齐全 | ✅ | src/entities/Player.ts:912-918 | Terarria1456/Terraria/Player.cs:14199-14214 |
| 5543 | 解压球(Stress Ball) | - | 减压球:静立+进食/持币→提取机(extractinate) | 未实装 | 📋 | — | Terarria1456/Terraria/Player.cs:14190-14192 |
| 5547 | 串接平衡锤(Strung Counterweight) | - | 黑配重球:counterWeight=1079 | vid 直查(彩球 3309-3314 同) | ✅ | src/entities/Player.ts:919-921 | Terarria1456/Terraria/Player.cs:14215-14222 |
| 5586 | 鸡骨翅膀(Chicken Bones' Wings) | wing | 翼型 47(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 5587 | 鸡骨长袍(Chicken Bones' Robe) | - | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 5596 | 焊接面罩(Welding Mask) | face | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 5627 | 花栗鼠斗篷(Chippy's Cloak) | wing | 翼型 48(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 5628 | 花栗鼠头带(Chippy's Headband) | face | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |
| 5659 | 英雄翅膀(Heroicis' Wings) | wing | 翼型 49(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 5686 | 卡兹默德斯之翼(Kazzymodus' Wings) | wing | 翼型 50(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 6140 | 露娜的符文妖精翅膀(Luna's Runic Pixie Wings) | wing | 翼型 51(vanillaWingStats 全表 1:1) | wingStatOf 属性+Renderer 翼层+染料全链 | ✅ | src/data/vanillaWingStats.ts:27-50 / src/render/Renderer.ts:9393 | Terarria1456/Terraria/Player.cs:14904/WingStatsInitializer.cs:26-63 |
| 6141 | 露娜的符文妖精斗篷(Luna's Runic Pixie Cloak) | back,front | 纯虚荣(无功能效果) | 社交槽 13-19 路由可穿戴;身上贴图未绘——归【全局】贴图行处置 | 📋 | src/data/vanillaItemStats.ts van / src/render/Renderer.ts(无 Acc_ 层) | Item.cs accessory+vanity |

### 全局系统性发现（跨配饰，7 行）

| vid | 配饰 | 槽位 | 效果 | 实装状态 | 结论 | 我方行号 | 原版行号 |
|---|---|---|---|---|---|---|---|
| — | 【全局】配饰身上贴图绘制 | 全部绘制槽 | Player.cs Draw 分层绘制 Acc_Back/Front/Shield/Shoes/Waist/Neck/Face/Balloon/HandsOn/HandsOff/Beard | 仅翅膀层实装（wingDrawOf 表驱动+染料+发光队列）；其余十族贴图已入库（public/sprites/vanilla/Acc_*，Back 41/Front 17/Shield 12/Shoes 30/Waist 17/Neck 14/Face 23/Balloon 19/Hands 50/Beard 4）但**全仓零消费**——装备后身上不可见 | ❌ | src/render/Renderer.ts:9393-9440（仅翼） | PlayerDrawLayers.cs DrawPlayer_13_Back 等 |
| — | 【全局】信息饰品背包生效域 | — | 原版 UpdateEquips 扫 inventory[0..57]——信息类/机械类放背包即生效，无需穿戴 | 本仓只在配饰槽循环 refreshInfoAccsFromItemType——放背包不生效 | ⚠️ | src/entities/Player.ts:879 | Player.cs:12494-12500 |
| — | 【全局】放置座钟授时 | — | SceneMetrics.HasClock → accWatch=3（附近落地座钟=金表精度时间行） | 未实装（HasClock 全仓无引用） | ⚠️ | — | Player.cs:12593-12596 |
| — | 【全局】jumpSpeedBoost 叠加语义 | — | 蛙腿族多件叠加（2423+3990 等各 +=1.6，additive） | 本仓 Math.max 取单件最大——蛙腿+两栖靴不叠加 | ⚠️ | src/entities/Player.ts:1018 | Player.cs:14249/13985 |
| — | 【全局】翅膀横移加速倍率 | wing | AccRunAccelerationMult（26/45/29/32/30/31/37/44 档 ×1.5-4.5）+ DownHoverAccelerationMult | vanillaWingStats 表齐全但 accelMult/hoverAccelMult 聚合进 equipStats.wing 后**零消费** | ⚠️ | vanillaWingStats.ts:19-50 / Player.ts:884 | Player.cs:26669/28856 |
| — | 【全局】多翅膀并存取槽序 | wing | 原版循环后写覆盖=后槽胜出 | 本仓 `!wing` 先到先得=前槽胜出（双翅佩戴边缘案） | ⚠️ | src/entities/Player.ts:882-886 | Player.cs:12578-12586 |
| — | 【全局】1457 新配饰族（6147-6195） | — | ApplyEquipFunctional case 6166-6189（鞭 tag/哨兵背包/弹药循环等） | 本仓已按 1457 引用手补（Player.ts:923-958 + SUMMON_GEAR）；**../Terarria1456 反编译源无此批（6156+ 不存在），无法对源校验** | 📋 | Player.ts:923-958 | 1457 源（仓库外） |


## ⚠️/❌ 修复要点（按优先级）

### P0 断链（旗标/字段存在、消费端在，但数据侧缺供给——补表即通）

1. **钓鱼配饰族四件全断（❌）**：`Bobber.ts:418-424` 读 `equipStats.fishingTackle`、`:426-432` 读 `equipStats.lavaFishing`——**PlayerEquipStats 根本没有这两个字段**，恒 false。需在 computeEquipStats 聚合 2375/3721/5064→fishingTackle、4881/5064→lavaFishing；同时补 2374/3721/5064 的 fishingSkill+10（Player.cs:14115-14141）。原版行号 :14111-14141/:51645/:19230。
2. **岩浆石 1322/火焰手套 1343 近战点燃（❌/⚠️）**：消费端 `Game.ts:16196 applyMagmaStoneSwing(equipStats.magmaStone)` 在，但 accfx 无 1322 条目、1343 条目无 magmaStone 旗——本地玩家近战点燃恒不触发（PvP 侧 Game.ts:1714 直查 vid 反而正常）。补 accfx `"1322":{magmaStone:1}`、1343 加 magmaStone。原版 :14787-14798。
3. **混乱之脑 3223 闪避（❌）**：消费端 `Player.ts:5297` 读 `equipStats.boc`，accfx 无 `"3223":{brainOfConfusion:1}` → 恒 false。原版 :14536-14539。
4. **圣骑士盾族 938/3997/3998（❌/⚠️）**：①accfx 缺三件 noKnockback；②`Game.ts:1649 hasPaladinShield` 缺 3997、缺原版 `statLife>25%` 门（:14801-14817）；③3997 另缺 IceBarrier（同 1253）。
5. **召唤伤三件（❌/⚠️）**：2998 召唤徽章 +15% 整件缺（SUMMON_GEAR 漏，:14891）；935 复仇/1301 毁灭者/3015 恶臭的 minionDamage +12%/+10%/+5% 缺（accfx 无 minion 通道，:14895-14902/:14424-14431/:14096-14106）。建议 accfx 增 `dmgMinion` 字段或并入 SUMMON_GEAR。
6. **月光护身符 485（❌）**：BEHAVIOR_FX 只补了 861/3110 的 nightWolf，裸 485 缺 → 夜晚不狼人化。原版 :14633-14640。
7. **月亮石 900 夜档（❌）**：accfx 只有 899（白天档）；900 缺 skyStone（:14871-14874，夜/日食档）。
8. **攀爬爪 953 / 鞋钉 975（❌）**：accfx 缺两条 spikedBoots=1——单戴不可爬墙（976/984 的 +2 档有）。原版 :14489-14496。

### P1 效果整体缺失（需新写效果链）

9. **蠕虫围巾 3224 endurance+0.17（❌)**：damage()/damagePreview() 的 endurance 链加一项（:14532-14535）。
10. **大自然的恩赐 223 耗魔-6%（❌）**：Game.ts 耗魔乘区（:8996）加 accfx 驱动项；注意原版 manaCost 是**加算折扣**（花-8%+恩赐-6%→0.86），本仓 0.92×mul 乘法语义需对齐。原版 :14561-14563。
11. **熔岩玫瑰族 lavaRose（⚠️×5：908/4003/4004/5000+1323❌）**：岩浆伤 80→45、OnFire 420→210（:27376-27390）。accfx 增 lavaRose 旗+Player.ts 岩浆伤段消费。
12. **翱翔徽章 4989（⚠️）**：补 jumpSpeedBoost+1.8（:19317）、runAcceleration×1.75（:26185）、落地回满翼时（:21962）。
13. **熔火箭袋 4002 moltenQuiver（⚠️）**：木箭→火矢转换旗缺（:14051-14055；消费端 equipStats.moltenQuiver 已在）。
14. **皇家凝胶 3090（❌）**：`Enemy.ts CALMING_NO_AGGRO_TYPES` 现只挂镇静药水 buff 门——需加「装备 3090」源（23 类史莱姆不索敌，:14144-14168）。
15. **冰冻海龟壳 1253 / 冰冻护盾 3997（❌）**：IceBarrier buff（原版 buff 62）+ 半血门 + 护盾机制整链未移植（:14348-14351）。
16. **闪亮石 3337（❌）**：站立魔力再生大增+回蓝延迟减半（:18771/:19067-19081）。
17. **骨手套 3245（❌）**：挥动伤害武器掷骨弹 532（25 伤，:42939-42944）。
18. **孢子囊 3336 / 挥发明胶 4987（❌）**：周期孢子云/凝胶反击（:14236/:14241）。
19. **重力球 1131（❌）**：gravControl2 空中按上键翻转重力（:14519/:26392）——本仓重力翻转系统是否有宿主需先查 gravDir 链。
20. **荧光体 5107（❌）**：地面 runAcceleration×1.75/maxRun×1.15/slowdown×1.75 + 手持光（:14087-14093/:26188-26194）。
21. **建筑/显示三件（❌）**：工具箱 1923 tileRange+1/+1（:14405）；机械标尺 2799 网格尺（:14645/:45679）；机械透镜 3619 装备即显电线（:12432；现 showWires 只看手持，Game.ts:22581）；加压器 3624 autoActuator（:14746/:39807）。
22. **幽灵护目镜 4409 / 回声腔 5345（❌/📋）**：CanSeeInvisibleBlocks 回声块可见（:14077/:13796；回声块本仓仅 wire 高位暂记，渲染消费端批 F 未接）。
23. **优质钓鱼线 2373（❌）**：先补收竿 1/7 脱钩基底机制（:51599-51602），饰品再作豁免门。
24. **山羊符文 5465（❌）**：Dead Cells 下坠冲刺（:13977）。
25. **水母项链 1303（❌，纯光效）**：湿身 AddLight（:14675-14683）。
26. **黑曜石玫瑰 1323（❌）**=11 的单件源。

### P2 数值/语义偏差（⚠️）

27. **魔力四件双倍（111/982/1595/2221）**：accfx 记 mana 40，原版全部 `statManaMax2 += 20`（:14375-14403）——提取器把两段合并或重复计数，改回 20。
28. **spikedBoots 整型→布尔塌缩（976/984/3995 等）**：原版 `spikedBoots>=2` 才可墙面驻停（:21360），本仓布尔化后 1/2 同档——改回计数。
29. **jumpSpeedBoost 叠加**：Math.max → additive（见全局行）。
30. **翅膀 accelMult/hoverAccelMult 零消费**：WingMovementLogic 段 `runAcceleration *= AccRunAccelerationMult`（:26669/:28856）。
31. **多翅膀槽序**：先到先得 → 后写覆盖。
32. **仇恨 aggro 轴**（★2026-08-22 勘误：原清单含 1300 有误——1300 无 aggro 赋值;真集）：
    3015 恶臭香氛/3991 奥术花/4005 侦察瞄准镜/4006 潜行箭袋（-400,:14098/:13992/:14064/:14067）、
    3016 血肉指虎/3992 狂战士手套/3998 英雄盾（+400,:14107/:13999/:14029）——
    **✅ 已实装**（配饰系统性批：equipStats.aggroAcc 并入 aggro getter,隐身钳位作用于总值）。
33. **信息饰品背包生效域 + 座钟授时**（见全局行）。
34. **1457 弹药循环/哨兵背包/计时暴击**：Player.ts:923-958 已注明「登记未接」清单（旗已聚合、消费端待批）——1456 源外，按 1457 引用推进。

### 登记不修（📋）
虚荣件 38 项（社交槽路由正确）+ 纯外观粒子（玻璃拖鞋火花/烈焰行者靴火焰尾迹/彩虹光标/八音盒穿戴录放/FPV 无人机视野/减压球提取机/绅士胡须生长）。

## 配饰类审计（第 7 份补充报告，331 件：✅235 ⚠️23 ❌35 📋38）

### P0 断链（消费端在、数据侧缺供给——补表即通）
- **钓鱼配饰族四件全断**：Bobber.ts:418-432 读 equipStats.fishingTackle/lavaFishing
  但 PlayerEquipStats 无此二字段（恒 false）——钓具箱 2375 饵耗减半、防熔钓钩 4881/
  防熔渔具袋 5064 岩浆钓全失效；2374/3721/5064 钓技+10 也未聚合
- **岩浆石 1322/火焰手套 1343**：Game.ts:16196 消费 equipStats.magmaStone，accfx
  缺 1322 条目（1343 无 magmaStone 旗）→ 本地近战点燃恒不触发
- **混乱之脑 3223**：Player.ts:5297 消费 equipStats.boc，accfx 缺条目 → 10% 闪避死
- **魔力四件双倍**（111/982/1595/2221）：accfx 记 mana 40，原版 statManaMax2 += 20

### 单件缺失（35 ❌ 主体）
2998 召唤徽章整件缺（SUMMON_GEAR 漏）；935/1301/3015 minionDamage 缺；
圣骑士盾族 938/3997/3998 免击退 + IceBarrier 整链；月光护身符 485/月亮石 900/
攀爬爪 953/鞋钉 975/蠕虫围巾 3224(endurance 0.17)/大自然的恩赐 223(耗魔-6%)/
皇家凝胶 3090/工具箱 1923/机械三件/荧光体 5107/重力球 1131/黑曜石玫瑰族 lavaRose

### 全局系统性发现（7 条）
- 配饰身上贴图十族 ~228 张已入库全仓零消费（只画 Wings 层）
- 信息饰品背包生效域缺（原版扫 inventory[0..57]，本仓只扫穿戴槽）
- 翅膀 accelMult/hoverAccelMult 零消费；jumpSpeedBoost max 应叠加；多翅膀槽序反
- 仇恨 aggro 轴（±400 七件）未进 Player.aggro **→ ✅ 已实装**（配饰系统性批,真集勘误见修复要点 32）

### 修复批补充派发（配饰域，并入 R7）

R7 配饰修复项（按 P0 断链优先）：
1. 钓鱼族四件：PlayerEquipStats 补 fishingTackle/lavaFishing 字段 + accfx 补
   2374/2375/3721/4881/5064 条目（含钓技+10 聚合）
2. accfx 补 1322 magmaStone 旗 + 1343 并入 + 3223 boc 条目
3. 魔力四件 mana 40→20
4. 2998 入 SUMMON_GEAR；935/1301/3015 minionDamage 通道
5. 圣骑士盾族免击退 + hasPaladinShield 补 3997+HP 门 + IceBarrier 链
6. 单件批：485/900/953/975/3224/223/3090/1923/机械三件/5107/1131/lavaRose 族
7. 信息饰品背包生效域（扫 inventory[0..57]）
（身上贴图十族/翅膀聚合/aggro 轴三项系统性工程量大，单列第三批不并入本轮）

（R7 配饰修复代理已派发。当前修复批 = R1-R7 共 7 个在跑，超出的 1 个为配饰补充
——审计完成后才知配饰缺口规模 58 项，属审计产出非重复派发。R1-R6 回报后若 R7
仍在跑，主会话先汇总 R1-R6。）

## 修复批回报（R5：58 缺口轻项 + Item_4722）✅

- **46 轻项全补**：BuffType 枚举 +200..245 段（零重复，全枚举 168）、BUFF_DEFS 46 条
  vanillaBuff 精确映射、descKey 全走原版 BuffDescription.*（46 键双语验证在键，
  零自造零 l10n 动）、fallbackName 官方中文名、46 张图标逐一在盘验证
- **Item_4722 打包**：现场发现并行资产会话在同现场（追加式集成纪律）——改走
  atlas-append-1457.mjs 幂等补打包块，恢复被改写丢失的 4722 + tile753 + 4 件；
  逐像素 3712/3712 全同；陈旧检查已平衡防全量重跑清追加态
- 陈旧注释清理（Buff_396 已在库）
- 测试：buff-defs-gap 7 例绿 + buffs 域 61/61 绿 + tsc 零新增

## 修复批回报（R4：召唤门/useTime/BOSS_FAMILY）✅

- **1133 丛林门**：门外短路（不召唤/不消耗/无冷却/无提示）+ 挥动移入成功支
  （门外连起手动画都没有，严格对齐 CanUse=false 语义）；注释勘误 1405 口径
- **useTime 五件**：43 克眼 45（成功支才挥动+消耗，拦下零副作用）/2767 日耀 45/
  2350 回归 30（走表）/849 致动器 10（逐工具读表）/3620 魔杖 5
- **BOSS_FAMILY 补 4 对**：544↔[125,126]、556↔[134]、557↔[127]、4988↔[657]
  （双子任一体存活即拦与原版逐 NPC 判定同义）
- **itemcombat 补条**：544/556/557（useTime 45，提取盲区 if 块深 2）+ 2350（30，
  链式赋值未解析）+ 提取器回填块防重生成丢失
- 测试：summon-gate-fixes 21 例绿（数据面/BOSS_FAMILY/丛林门/useTime/行为面
  useWireTool 直驱+useSuspiciousEye 三门）+ 召唤域 17 文件 279 例全绿
- 定责备案：boss-parity-fixes-b 1 失败=并行会话改 Arrow.ts gravDelay 语义；
  item-stats-golden-1457 drift 6 条=弹药批改回 1456 后白名单未同步（R2 域）
- 隐患备案：itemcombat 有 15 条 1457 手工条目（Palworld 族）不在提取器产物内，
  整表重跑会丢——双保险已用（直接改 JSON+提取器回填）
  **→ 2026-08-22 清偿**：实测 1457 档提取器产物与现 JSON 6100+ 段 50 条零差异
  （条目无盲区，风险仅在裸跑 1456 默认档）。落两道防线：①extract-itemcombat.mjs
  1456 档写盘前合并保留 ≥6100 段（--dump/recon --fix 不受影响）②金标测试 ④
  锚四杖 combat 数据+段基数（item-stats-golden-1457 6/6 绿）

## 修复批回报（R1：工具 F1/F2/F3/F4/叶绿矿）✅

- **F1｜35 件 useTime 根除**：VANILLA_TOOL_POWERS 回填循环从 itemCombat 桥入
  speed/useTime/damage/knockback（梦魇 15t/圣锤 14t/钛镐 7t…46t 双回落消灭）；
  ItemDef.tool 补 pickPower/axePower/hammerPower 三力字段；连带补 4317 漏 axe:30
  + itemCombat EXTRACT_PATCH 补 4317 damage:30/kb:7（提取器漏 SetWeaponValues）
- **F2｜8 件双工具**：dualToolResolve 增 def 参 + axePower 兜底；★一处按标杆
  否决任务指令——"锤斧对无斧力块不走锤路"未采纳：反编译 :45355-45364 TryPoundingTile
  只门 sItem.hammer>0，锤斧即锤（官方 Wiki 同证），砍锤路反背离 1456
- **F3｜星旋三件**：TEdit 漏收（2771→2774 空洞）→ 补 3 条目 + atlas 已含（并行
  会话全量重跑后逐像素核对）+ 幂等兜底脚本防 TEdit 重置
- **F4｜8t 钳→max(1)**（:4221-4226 max(val,1)），蘑菇矿爪 4t 恢复
- **E9｜叶绿矿 pick 65→200**（:52989）
- 测试：tool-parity-fixes 14 例绿 + 域回归约 280 例绿 + 触碰文件 tsc 零新增

### 红灯上报（并行会话所致，未代改）
1. atlas-append-golden 3 例红：并行 13:30 全量 atlas 重排打破冻结锚（正是闸门防的事故）
2. asset-cache 863 vs 852 音频清单数：同次全量重建改写 assets-index.json
3. dual-key-fields 余 2 例：并行 legacy def 退役在途

## 修复批回报（R2：弹药 penetrate/溶液/伤害/Kill）✅

- **① penetrate 全域 11 件 ✅**（并行会话实现，R2 逐条核验=Projectile.cs 一致）：
  Arrow.ts:631 `pierce = opts?.pierce ?? pd0?.penetrate ?? 1`，-1=无限
- **② 溶液装填 ✅**（先前批次已修）：itemCombat EXTRACT_PATCH shoot 870-872/ammo 780
- **③ 伤害 4 错 ✅（R2 修）**：桥接层 EXTRACT_PATCH 恒取 1456 权威值
  （546→12/988→7/1350→15/3011→7）——JSON 载 1457 值且手改被并行重生成回滚两次，
  落桥接层是唯一稳定落点；遗留建议：4 条比照 478 先例补 ROLLBACK_1456 白名单
- **④ proj478 penetrate 3→2 ✅** + 金标白名单
- **⑤ Kill 三段 ✅**（并行实现，R2 核验）：91/92 坠星链（代际链+线上穿墙）、
  89 碎裂（2×proj90 反向速）、41 狱炎 64×64 盒重结算
- 测试：ammo-parity-fixes 17 例绿 + 弹药域 9 套 137 例全过；触碰文件 tsc 零新增
- **nit 两条（并行在管文件，未代改）**：89 分支 PlaySound(0) 应映射 'dig' 非
  'Item_1'；91/92 gore 型号 rand 右开区间应为 16..17 非 16..18

## 修复批回报（R6：useStyle 手位/叶绿弹追踪/Kill 三件）✅

- **useStyle9 饮药手位**：手位向量 ×Lerp(1.5,1.2,t) + X 向 Lerp(8,2,t) 前移
  （:50145-50152 1:1，98 件药水贴身 3-5px 修正）
- **useStyle5 特档**：3476 距离 14（★audit 文案"Last Prism"系误记，实为星璇
  秘法书 Nebula Arcanum——id/行为以 Player.cs 为准）
- **claw 分支**：初落 1827 专档后发现并行会话已在共享 swingTier 落了超集
  （1827+岩鱼族+钥匙牌+破城刃）→ 主动撤重复分支保单一实现
- **叶绿弹 207/837 追踪**：AI_001 :53906-54010 1:1（渐显/尘迹/300px 锁敌/
  1000px 保持圈/清锁重锁/hostile 恒不转向/v=(v×7+dir×speed)/8）+ 90 碎块、
  92 坠星两新弹体行为
- **Kill 三件**：91 圣箭坠星（两代链）/89 水晶碎裂/41 狱炎 64×64 盒重结算
- 测试：held-draw-fixes 15 例绿 + 弹幕绘制域 46 文件 730 例全绿；触碰文件 tsc 零
- 附带修 1 行测试壳（held-proj-pointing 假玩家缺 equipStats 字段崩）

## 修复批回报（R7：配饰 P0 断链+单件批）✅

- **钓鱼族四件 ✅**：PlayerEquipStats 补 fishingTackle/lavaFishing 字段；accfx 条目
  按 1456 反编译修正任务单映射偏差（:14111-14141 逐条核对——2374 仅钓技无饵耗、
  4881 仅 lavaFishing 无钓技等五件各自精确）；Bobber 消费端即通+旧注释勘误
- **accfx 三件 ✅**：1322 magmaStone/1343 并入/3223 boc 闪避即通
- **魔力四件 ✅**：mana 40→20（根因=提取器取 1457 值）；连带发现 982 回蓝 60 应 25
  同为 1457 值，一并修
- **召唤伤 ✅**：2998 入 SUMMON_GEAR + AccFx 新增 dmgMinion 通道（935/1301/3015）
  + 顺带修 6175 侦察背包既有 TS2448
- **圣骑士盾族 ✅**：免击退三件 + IceBarrier 链全量实装（未走登记捷径：
  BuffType 246 + 半血 AddBuff(62,5) + endurance+0.25）
- **单件批 ✅**：485/900（nightPhase 字段）/953+975/3224/223（新 manaCostOff 加算
  折扣通道，花+恩赐 0.86 对齐原版）/3090（Enemy 三处索敌门）/1923（独立 toolbox
  通道）/3619/3624（自动致动：实心瓦排除导轨/泡泡/活板门/球洞）/5107/lavaRose 五件
  （岩浆伤 80→35、OnFire 420→210）；登记不修 2 件（2799 网格尺/1131 重力球）
- 测试：accfx-p0-fixes 19 例绿 + 配饰域 18 文件 232 例 + 邻域 10 文件 109 例全绿；
  触碰文件 tsc 零；中途并行会话两度覆写共享文件均已确认恢复

## 修复批回报（R3：药水/Buff 部分实装 8 项）✅

- **Clairvoyance(29) 三项 ✅**：魔伤+5%/魔暴+2/耗魔×0.98 三 getter（:11481-11485）
- **SugarRush(192) ✅**：pickSpeed 链 -0.2（:9634-9637）
- **KiteBuff(383) ✅ 定案 1456**：moveSpeed +0.25/pickSpeed -0.15（曾取 1457 值）
- **Stinky(120) ✅**：★任务书"药水 1332"有误（1332=澳液材料）——真身 StinkPotion
  2353 → 投掷弹 371 → 80px 内玩家 Stinky 30s（:75203-75228）；NPC 侧纯视觉登记
- **Invisibility(10) ✅ 定谳**：★原版无 TargetClosest 硬门——真机制=aggro 钳位
  （未挥击 -750/挥击 -250，:25437-25445）→ Player.aggro getter 已接
- **Warmth(124) ✅**：COLD_DAMAGE_NPCS 16 型+PROJS 29 型表+接触/弹侧 ×0.7；
  "46/47 削时"确认系 1.4.5.7 新增非 1456（审计引线为陈注释，已纠正备案）
- **CompanionCube(191) 定谳不修**：审计误植——":24924 微光变身"实为 Stoned(156)
  变身伤害（ByOther(5) 全库两处均在 stoned 分支），本仓已实装；测试锁定真实行为
- **诡药 3001 ✅**：heal=Next(70,121)+i-帧三档（240/120/60，max 不缩短），三条链全接
- 测试：buff-partial-fixes 24 例绿 + buffs/相邻域 16 文件 173 例绿；src/ tsc 零错

## ================= 终验记录（2026-08-22） =================

修复批 R1-R7 全部回报完毕（7/7）+ 主会话即时修 4 项。终验：
- **tsc 全仓 104 错**（较批前 108 降 4）——全部为并行会话中途态与历史基线，
  核心域（Buffs/VanillaTiler/VUI/Game 审计修改区）零错
- **本会话 14 测试文件 157/157 绿**（时钟/光标/仙人掌/海燕麦/蚁狮/沙球/鸭/
  工具/弹药/配饰/buff缺口/手位/召唤门/buff部分实装）
- **广域回归 7 文件 80/80 绿**（弹药/床睡/蚁狮锥门/NPC帧闸/物品覆盖）
- 星旋三件曾被并行会话 atlas 重置冲掉 → 幂等兜底脚本已恢复，14/14 复绿

### 遗留移交（后续批候选，非本轮范围）
1. 配饰系统性三项：身上贴图十族 ~228 张零消费/信息饰品背包生效域/翅膀聚合+
   aggro 轴——工程量大单列 **→ 已派实现代理（2026-08-22 第三轮）**
2. Palworld 六件 389-394 授予侧弹 AI（登记批 B）**→ ✅ 已实装（2026-08-22 实现代理回报）**：
   弹 1112/1118 本体（palGroundStep=AI_067 flag8/9 折算：地面跟随/索敌→扑击态机，
   仅扑击段 friendly=true 有接触伤 :50444/:50904）+1113（1094 模式+MINION_SHOOT cd30/
   射程 1160/弹 1097+地狱火 igniteHellfire）+四杖使用链（6161 专支玩家中心出生 :49962/
   6149/6164 后置冷却）+buff 授予/维护链（★授予点定谳：ItemCheck :43205-43211 通用
   `item.buffType>0→AddBuff`，buffTime=0 也落槽（AddBuff 无 time>0 早退），同 tick
   UpdateBuffs 刷 18000——本仓按终态 300s 授予+维护链每 tick set(300)/remove 净等价）+
   MINION_SACRIFICABLE 四弹+帕鲁互清（1093/1112 同族、1094↔1113 跨型 :52340-52360）+
   BUFF_NO_SAVE 补 389/390/393/394。391/392 坐骑 buff=登记不接（vanilla-mounts.json
   无 64/65 条,坐骑本体未造）**→ ✅ 2026-08-23 R14 批已实装**：坐骑 64/65 TrustyChillet/
   Ignis 全链（extract-mounts.mjs 1457 overlay 纯增量+62-65 家族行为 1:1 四系伤+10%/
   扇翼/盾冲帧/抚摸+成就 21/上骑音；物品链订正=6150→64/6151→65,任务书 6151/6152 系
   笔误 6152=DaybloomStaff；BUFF_TO_MOUNT 391→64/392→65 通）。未折算三项：湿身 vy×2 ✅
   （1457 :51616 num62 门恒真证明）/抚摸 Joy ✅（PETTABLE 白名单扩随从族+palJoyTick）/
   ai[0]=3 帮工 ⛔ 维持登记（IntentionGuesser 智能光标系统缺）。测试 trusty-mounts 22 例+
   域 263+174+105 绿。测试 palworld-minion-parity 25 例+邻近 10 文件 145/145 绿。
   ★附带发现既有偏差（未动登记）：1093/1094 MINION_SUMMON_SFX 双声顺序与 1457 相反
   （vanilla tick1=PalSummon/tick20=家族叫声 :50893-50898,sfx-wiring.test 锁旧序）——
   归 24 杖泛化批一并修
3. ~~itemcombat 15 条 1457 手工条目防重生成丢失~~ **✅ 已清偿**（提取器合并保留
   +金标锚点，见 R4 回报段隐患备案清偿注）

### R2 nit 两条 ✅（2026-08-22 主会话清偿）
- **89 声音映射**：反编译定谳 legacy PlaySound(0) = LegacySoundPlayer.cs:443
  case 0 = SoundDig 三变体（非 Item_1——原注释"缺省 Style=1"是 PlaySound 无
  style 参时才成立，此处显式传 0）。Game.ts onProjectileDeath 改 `sfx.play('dig')`
  （Sfx dig 键=Dig_0/1/2 与原版 Main.rand.Next(3) 同构）；held-draw-fixes 断言同步
- **91/92 gore 型号**：:72257 `Next(16, 18)` 右开 = {16,17}，本仓 `*3` 多掷 18。
  改 `*2` + 注释锚行号；91 测试补 vi.spyOn(newGore) 型号域断言
- 验证：ammo-parity-fixes 17 + held-draw-fixes 15 = 32/32 绿

### 补审计派发（第二轮，响应 goal 复核缺口）

首轮放置/涂料/弹药为抽样（130 项），未达"全量"。已补派 3 个代理（当前在跑 3 个，≤6 ✓）：
- 补 A：放置物全量余量（352 族 1039 件，扣除已覆盖 26 功能族）
- 补 B：弹药全量余量 + 涂料遗漏面 + 散件消耗品
- 补 C：buffType 余量（含 13 重项现状核查）+ other 类 ~400 件
- ★首派 3 代理 600s watchdog 全 stall（任务粒度过大），已带防卡死纪律重派
  （分批处理+增量落盘+禁全量读大文件+长脚本输出重定向分段读）

### 遗留批派发（第三轮，2026-08-22）

- **配饰系统性三项 ✅（实现代理回报）**：①身上贴图**全 11 族实装**（新提取器
  extract-acc-drawslots.mjs→vanilla-acc-drawslots.json 151 vid/184 槽引用全在盘+
  vanillaAccDrawslots.ts 运行时+Player accDraw 聚合（后写覆盖/披风清 front/气球双
  路由/染料逐族配对）+Renderer drawAccBehindLayers/drawAccFrontLayers（层序=
  LegacyPlayerRenderer 身前段,Back 坐姿隐藏/Balloon 4 帧时钟动画/举盾-4/坐骑门））
  ②信息/机械饰品背包生效域（:12494-12500 字面扫 inventory[0..57]+机械三族,缓存
  I 档直写失效）③jumpSpeedBoost 叠加/多翅膀后写覆盖/aggro 轴（★台账勘误：真集
  -400=3015/3991/4005/4006、+400=3016/3992/3998,1300 无 aggro——见修复要点 32）/
  翅膀 accelMult+hoverAccelMult 消费（坐骑支不乘=mount.CanUseWings 门）。
  测试 accessory-systematic 26 例+配饰域 18 文件 247 例+渲染邻域 5 文件 138 例绿。
  登记未建模：per-slot 隐藏开关/back 背包尾巴子层/举盾光环/脸饰头盔偏移等（报告详）
  **→ ✅ 已实装（2026-08-23 R15 批回报,25 例新+邻域 20 文件绿）**：
  ①per-slot 隐藏开关（Player.hideVisibleAccessory[10]+功能槽聚合门"只藏贴图不失效"+
  UI 眼睛钮零新 l10n 键+存档位打包+翼 hidden 旗；★定谳回写：任务书"虚荣槽 13-19 也要"
  与原版不符——社交槽第二轮无 hide 门,本仓同原版不设）
  ②back 子层（BACK_DRAW_IN_BACKPACK={7-10,15,16,32,33}/BACK_DRAW_IN_TAIL={18,19,21,25-28}；
  ★审计登记文案勘误：15/16 在背包集非尾巴集；渲染拆层画在翼前+坐骑门）
  ③举盾光环 4 份旋转加算+格挡窗口外扩副本（★定谳:脉动叠画副本 1456 未入 DrawDataCache=死代码不画）
  ④脸饰 FACE_HELMET_OFFSET 全表+三门
  ⑤3015/3016 expertOnly **定谳不接**（1456 全库无 expertOnly=true 赋值,消费点全死门——
  aggro ±400 无条件生效=正确,测试直读反编译锁定）
  ⑥坐姿鞋切片/front 前后半拆层/胡须 PreventBeardDraw 门已接;威尔逊胡须发色=定谳登记
  （本仓无发色系统）；★新登记：front !mnt 门属死代码变体 DrawPlayer_32_FrontAcc（无调用者）
- **Palworld 六件 389-394 授予侧**（实现代理在跑）：标杆=../Terarria1457/ 全量
  反编译（1549 文件，BuffID 389-394/ProjectileID 1112/1113/1118/1119 均在）。
  主会话已探明锚点：物品 SetDefaults（Item.cs:47348-47530）/使用分支
  （Player.cs:48924-48960，6161 走普通 shoot 非 SpawnMinionOnCursor）/
  SpawnMinionOnCursor（:50093，6164→ai[0]=45）/AI_067 共享宠物 AI（:50014-52108，
  flag8=1093/1112 flag9=1118）/玩家侧维护（UpdateBuffs :10840-10940）/
  通用授予路径（:43205 `item.buffType>0 → AddBuff`，buffTime=0 行为待代理定谳）
- **配饰系统性三项**（实现代理在跑）：①Acc_* 十族 ~228 张身上贴图绘制
  （优先 Back/Shoes/Balloon/Shield/Front）②信息饰品扫 inventory[0..57]
  （Player.cs:12494-12500）③翅膀 accelMult 消费+jumpSpeedBoost 叠加+
  多翅膀后槽胜出+aggro ±400 七件

另：R1 上报的 asset-cache 863 vs 852 红灯确认为并行资产会话在途（assets-index.json
被其 atlas 重建新增 11 音频条目），测试白名单需该会话同步，非本审计域不代改。

# buffType 余量 / other 类全量补审计（补 C，2026-08-22）

> 范围：①13 重项现状核查（buff 40/41/42/125/126/127/139/140/322/325/376/385/386）
> ②buffType 193 件余量逐组核施加链与消费 ③"other"类（无 heal/buff/createTile/shoot/tool）
> 172 件分组抽查。标杆 `Terarria1456/`。
> ★关键原版行号：ItemCheck_ApplyPetBuffs Player.cs:52227-52470（召唤/宠物物品使用即
> AddBuff(buffType,3600) 的唯一入口）；UpdateBuffs 随从/宠物维护段 :10200-10530（minion：
> ownedProjectileCounts==0 → DelBuff，否则 buffTime=18000 续 5 分钟）/ :10906-11292（pet：
> 续时 + 宠物弹丢失则补生 NewProjectile）；TorchGodsFlavor :39529-39585（buff 376 每 tick
> 1/10 扫屏转火把）；UpdatePet/UpdatePetLight（装备槽模型）:17147-17187。

## 一、13 重项现状核查

**结论先行**：13 个 vanillaBuff 全部仍缺 BUFF_DEFS（grep 实测 0 命中，R5 批补的是
其余 45 轻项）。其中 4 件宠物走装备槽派生通道不受影响，8 件随从杖的 buff 全库零表示，
5573 是真 ❌（效果错挂+不消耗）。

| vid | 物品 | vanillaBuff | 原版机制 | 我方现状 | 结论 | 我方行号 |
|---|---|---|---|---|---|---|
| 603 | 胡萝卜 | 40 PetBunny | 用即 AddBuff(40,3600)（**runningCollectorsEdition 门**:52229）；buff 续时+补生弹 111 | 在 vanilla-pets.json(62 件表)→装备槽 PetFollower 链+petBuffBlocks 派生图标；收藏版门无载体（quickBuff 注释已登记） | ✅(门登记) | Game.ts:20898-20914; UI.ts:2745-2757 |
| 669 | 鱼 | 41 BabyPenguin | 同上（无门）+补生弹 112 | 同上（pets 表 buff41/proj112） | ✅ | 同上 |
| 753 | 海草 | 42 PetTurtle | 同上+补生弹 127 | 同上（buff42/proj127） | ✅ | 同上 |
| 2420 | 西风鱼 | 127 ZephyrFish | 同上+补生弹 380 | 同上（buff127/proj380） | ✅ | 同上 |
| 2364 | 黄蜂杖 | 125 HornetMinion | 用即 AddBuff(:52366)；UpdateBuffs: ownedProjectileCounts[373]==0→DelBuff，否则续 18000 | combat 表 summon→MinionProj(373) 召出 ✓；**buff 125 全库零表示**（BUFF_DEFS 无、MinionProj 不施加、UI 无派生通道）→buff 栏无图标 | ⚠️ | Game.ts:9852-9938; MinionProj.ts(无 buff 链) |
| 2365 | 小鬼杖 | 126 ImpMinion | 同上（弹 375） | 同上 | ⚠️ | 同上 |
| 2621 | 暴风法杖 | 139 SharknadoMinion | 同上（弹 407） | 同上（407 已在 MinionProj 家族表） | ⚠️ | 同上 |
| 2749 | 异星法杖 | 140 UFOMinion | 同上（弹 423） | 同上 | ⚠️ | 同上 |
| 5005 | 泰拉棱镜 | 322 EmpressBlade | 同上（弹 946；:52405 switch 档） | 同上 | ⚠️ | 同上 |
| 5069 | 弗林克斯杖 | 325 FlinxMinion | 同上（弹 951） | 同上（951 在 MinionProj 帧表） | ⚠️ | 同上 |
| 5663 | 捣蛋猫之杖 | 385 PalworldMinionCattiva | 同上（弹 1093；:50955 清同型） | 同上（1093 音效链已接） | ⚠️ | MinionProj.ts:137-144 |
| 5664 | 火绒狐之杖 | 386 PalworldMinionFoxsparks | 同上（弹 1094） | 同上（1094 foxChannel AI 已接） | ⚠️ | MinionProj.ts:246/1265 |
| 5573 | 火把神药水 | 376 TorchGodPotion | **consumable 药水**：饮→AddBuff(376,28800=8min)；buff 每 tick 调 TorchGodsFlavor(:39529)：1/10 概率扫屏找**群系不匹配火把**→弹 1084 飞过去转换成当期群系样式 | Game.ts:8300-8304 误写成「置 unlockedBiomeTorches」——那是 **5043** 的效果（:44609-44634）；且**无 consume()**（原版 consumable=1）→无限白嫖；buff 376 不施加、TorchGodsFlavor 自动转换全缺（全库无弹 1084） | ❌ | Game.ts:8300-8304（对照 :8296 case 5043） |

**13 重项修复要点**：
1. ❌ 5573：case 5573 改为 `consume() + p.useTime=17 + BUFF_BY_VANILLA.get(376) 施加
   28800/60=480s`；TorchGodsFlavor（扫屏→弹 1084 转换）单列一批（需 BiomeTorchPlaceStyle
   群系样式表，本仓火把 placeStyle 链已有基座 CursorItemIcon.ts）。
2. ⚠️ 8 随从杖 buff：补 BUFF_DEFS 8 条（125/126/139/140/322/325/385/386，图标
   Buff_*.png 已在盘）+ MinionProj 出生/每帧维护 `ownedProjectileCounts` 等价链
   （同型计数==0 → buff 撤除；在役 → 续 300s）——与原版"随从在役=图标在"语义对齐；
   R5 已补的 15 件随从伴生 DEFS（133/134/135/161/182/188/213/214/263/271/335/355/49/64/83）
   同样是死条目（施加链同缺），一并接上。

## 二、buffType 193 件全量分组对账

| vid 范围 | 件数 | 物品例 | 语义 | 实装 | 结论 |
|---|---|---|---|---|---|
| bt 26/206/207（食物 82 件） | 82 | 牛排/南瓜派/金蟹… | WellFed 三档 | 药水分区 B 已审（82 件全表+耐药性） | ✅ |
| pets 表 31 件 | 31 | 603/669/753/2420/994/115/1183/3043… | 宠物/光宠（装备槽模型） | 召唤分区已审（86 件链）+petBuffBlocks 派生图标 | ✅ |
| 随从杖 24 件（1157/1309/1802/2364/2365/2535/2551/2584/2621/2749/3249/3474/3531/4269/4273/4281/4607/4758/5005/5069/5114/5456/5663/5664） | 24 | 黄蜂杖/小鬼杖/泰拉棱镜… | 召出+随从伴生 buff（原版：用即 AddBuff 3600+在役续 18000） | 召出链 ✅（combat summon→MinionProj，24/24 弹型对）；**伴生 buff 全 24 件零施加**（8 件无 DEFS+16 件死条目） | ⚠️(系统性) |
| 星云 booster 3453/3454/3455 | 3 | 伤害/生命/魔力星云 | 拾取→NebulaLevelup 三族 0-3 级 | Game.ts:20079-20111 nebula[] 三族等级+效果 ✅；buff 图标 173-181 不显示（DEFS 仅 L1 三条且不施加；原版 UpdateBuffs 亦无 case=纯图标） | ⚠️(图标) |
| 基础药水 288-305 | 18 | 黑曜石皮/再生/敏捷/重力… | 饮→buff | 消耗品桥 Game.ts:8470-8505 BUFF_BY_VANILLA 反查施加 ✓；消费=122 条对账表已审+R3 修 8 | ✅ |
| 酒类 353/2266 + 瓶装蜂蜜 1134 | 3 | 麦酒/清酒/蜂蜜瓶 | Tipsy/Honey | 同上 | ✅ |
| 浸剂 Flask 1340-1359 | 9 | 毒液/诅咒焰/烈火/金/灵液/纳米/派对/剧毒 | 武器浸染→近战命中挂 DoT | ImbueVenom..ImbuePoison DEFS+近战命中消费链 | ✅ |
| 肉后药水 2322-2349 | 14 | 挖矿/建筑/泰坦/脚蹼/召唤/陷阱/弹药储备/生命/耐力/怒气/暴怒/地狱火/鱼饵… | 饮→buff | 同 288-305（115/117 名实对调已按记忆批对齐） | ✅ |
| 钓鱼药水 2354-2356 + 御寒 2359 | 4 | 钓鱼/声呐/宝匣/御寒 | 饮→buff | 同上（钓系统消费） | ✅ |
| 幸运药水 4477-4479 | 3 | 幸运小/中/大 | buff 257 三档 | Luck.ts luckPotionTier（>600s=3/>300s=2）×0.1 :28674 ✓ | ✅ |
| 群系视野 5211 | 1 | 群系视野药水 | buff 343 敌怪高亮 | DEFS 覆盖 | ✅ |
| 仙灵铃 425 | 1 | 仙灵铃（cons=0 光宠特例） | 用→三选一 27/101/102 | QuickBuff 链 Game.ts:6770 三选一 ✓；**左键直用无 case**（原版 ItemCheck_ApplyPetBuffs:52252 直用即 AddBuff）→直用无效果 | ⚠️ |
| 火把神药水 5573 | 1 | 见 13 重项 | 饮→buff 376 自动转火把 | 效果错挂+不消耗 | ❌ |

施加链总核：消耗品桥（Game.ts:8470，`consumable && buffType>0 && 无 createTile/shoot/工具`）
与 QuickBuff（:6744 起，无 consumable 门、f.summon 跳过）双链均 BUFF_BY_VANILLA 反查——
凡 DEFS 有条目即施加 ✓；**随从杖因带 shoot 永远进不了消耗品桥**，其 buff 施加只能走
MinionProj 侧（现缺）——这就是 24 件死条目的根因。

## 三、other 类全量补审计（172 件）

> 口径：itemfunc 无 heal/buff/shoot/tool/fishingPole 且 itemfunc+vanilla.json 双源
> createTile 皆无（createTile=0 泥土系已修正为"放置"）。 mana 药水 4 件（110/189/500/2209，
> healMana 在表）归回药水组，不计入本表。

| vid 范围 | 物品例 | 语义 | 实装 | 结论 | 我方行号 |
|---|---|---|---|---|---|
| 43/70/361/544/556/557/560/602/1133/1293/1315/1331/1844/1958/2767/3601/3828/4271/4988/5120/5334 | 可疑眼球/蠕虫食物/战旗/机械三件/血泪… | Boss/事件召唤 | 召唤分区已审（21 件全表）；4271 血泪 Game.ts:9508-9511 夜+非血月门 ✓ | ✅ | Game.ts:9508 |
| 50/1326/2350/2351/2997/3124/3199/4263/4819/4870/5335/5359/5360/5361/5437 | 魔镜/罗盘杖/传送药水族/海螺/贝壳手机 | 传送 | 召唤分区已审；TELEPORT_ITEM_VIDS Game.ts:541 + case 5335:8350 | ✅ | Game.ts:541,8350,9424 |
| 856/1914/2428/2429/2430/2491/2502/2768/2769/2771/3260/3367/3771/4264/4444/4716/4787/4791/4796/4981/5130/5510/5525/5597/5600/5640/5641/5642/5662/5665/5666 | 坐骑召唤物 31 件（含 3771 巴斯克毒蜥 mount14/4791 弹跳器 mount43/4716 软体动物哨 mount37/5665-66 Palworld 坐骑 mount62/63/5662 增魔精灵尘 mount61） | mountType→坐骑 | vanilla-mounts.json itemMount 63 条全含（3771→14/5662→61/5665→62/5666→63 实测在表）+Mounts.ts 行为（14:962/:1559/:1975、61:1376-1413 dash 共支） | ✅ | Mounts.ts:128,962,1376,1559,1975 |
| 509/510/849/850/851/3612/3620/3625 | 扳手/钳/致动器族 | 电路 | 召唤分区已审（8 件） | ✅ | Game.ts:12011-12085 |
| 780/1071/1072/1100 | 绿溶液/油漆刷/滚/刮 | 涂料 | 放置/涂料/弹药分区已审 | ✅ | items.ts PAINT_TOOL_TABLE |
| 3223/3224/3245/3333/3336/3337/4954/4987/4989/5100/4828/215/1131/3090 | 混乱之脑/蠕虫围巾/骨手套/蜂巢背包/孢子囊/闪亮石/彩虹尾迹翼/易爆明胶/光女飞行石/骨盔/过热血/垫/重力球/皇家凝胶 | 配饰 | 配饰分区 331 件已审——1131/3090 已立 ❌（gravControl 全缺/3090 未接线），余 ✅/⚠️ 见该章 | ✅(转引) | docs 本档 :1705 章 |
| 3332/3862/4782/4957/5111 | Boss 袋（月总/黑魔/光女/史王/鹿角怪） | 开袋掉落 | vanilla-bossbags.json 19 袋=原版 OpenBossBag(:6828-7520) case 集**逐一全同**（3862 原版不可开=同款登记）；openBossBag 引擎 Game.ts:9231 | ✅ | Game.ts:9231; vanillaBossBags.ts:51 |
| 29/109/1291/678/2756/3335/5043/5337/5338/5339/5340/5341/5342/4830/4910 | 水晶/果实/红药/变性别/恶魔之心/火把神眷顾/六件永久增益/宠物许可证 | 一次性使用 | updateUse 专案 case 全在（:8290-8330/8214/9508）+FLAG_ONCE 集 Game.ts:546 | ✅ | Game.ts:546,8214,8290-8330 |
| 205/206/207/1128/3032/4820/4872/5302/5303/5304/5364 | 桶四件/海绵族/无底桶族 | 液体舀取/倾倒 | useBucket Game.ts:15732（3 档容量+3×3 扫描） | ✅ | Game.ts:15732-15762 |
| 1991/3183/4821 + 2438/2674/2675/2676 | 捕虫网三件+鱼饵族（小动物本体 1992/2001/… 带 bait>0 归钓鱼域不在本组） | 捕捉/鱼饵 | 网在 items.ts tool 表+捕捉链；鱼饵 bait 字段消费（钓鱼系统） | ✅ | items.ts; Bobber.ts |
| 1905/2014/2160/1957/3762/2213/2791 | 圣诞树饰/墙纸/栅栏族 | 放置（**计算式 createWall 提取漏**） | vanilla-wallitems.json 292 件专表已解（1957→125/2014→132/2160→135/3762→230/2213→141/2791→175 实测在表）；1905=圣诞树装饰链 Game.ts:9290-9293 | ✅ | items.ts:1346-1354; Game.ts:9290 |
| 23/75/2434/2339/3356 | 凝胶/坠落星/帆/锡罐/机械电池片 | 纯材料（无使用语义） | 原版同款无使用 | ✅ | — |
| 4095/5289/5340 + 4382/5336 + 1990/2863/3259 + 5480 | 高尔夫哨/矿车动力包/银河珍珠 + 战斗书两卷（Game.ts:9492 旗标链 ✓）+ 发型剂三件（hairDye 表 ✓）+ 月主鞭（whips 表 ✓，武器域） | 特殊单件 | 4095 useGolfWhistle:7203 ✓；5289 矿车升级 ✓；5340 银河珍珠 luck+0.03 :8214 ✓；**5644 窥视宝珠无 case**（原版=多人观战切换器 :43011-43030；我方观战走键盘 spectateCycle，功能等价但物品入口缺） | ⚠️ | Game.ts:7203,8214,1869-1921 |
| **5328** | 金锁 | 对容器右键上锁（多人防偷，Player.cs:40950 IsAContainer 门） | 全库零命中 | ❌ | — |
| **1124** | 蜂巢 | 挥动期 1/30/tick 从命中盒发蜂弹（:42946-42958，melee 弹） | 全库零命中（18 hits 全是 tile 475 蜂巢块碰撞） | ❌ | — |
| **1450** | 泡泡杖 | 挥动期 1/3 概率发泡泡视觉弹（:44431） | 全库零命中 | ❌ | — |
| **968** | 火棍棉花糖 | 篝火旁使用→烤棉花糖（:46549/:49606） | 全库零命中 | ❌ | — |
| **3020-3023** | 腱/荆棘/微光/蠕虫绳圈 | 抛绳圈弹 486+type-3020 铺绳（计算式 shoot+放置，提取器漏；3020-3022 连 itemfunc 条目都没有，仅 3023 在表落入本组） | 全库零命中（965 普通绳圈链在，四群系变体缺） | ❌ | — |
| **507/508** | 铃铛/竖琴 | channel 乐器（按键弹音） | 全库零命中（hits 全为 tile/行号碰撞） | ❌ | — |
| **1345** | 彩带 | 使用喷彩带（视觉，consumable） | 全库零命中 | ❌ | — |
| **5343** | 货郎的背包 | 一次性全局旗+公告（:44749-44762 peddlersSatchelWasUsed） | 全库零命中 | ❌ | — |
| **4673** | 鼓槌 | 对鼓块 486 敲击发声（:46003-46030）+altFunctionUse :31171 | 全库零命中 | ❌ | — |
| **3353** | 机械矿车 | DefaultToMinecart(11) 专家矿车皮肤 | itemMount 表在（→11）可骑乘；**皮肤 11 贴图分档缺**（Minecart.ts 无 skin 链，骑乘行为 ✓） | ⚠️ | Mounts.ts:128 |
| **4824-4827/4908/4909** | 潮湿/熔岩/蜂蜜/干燥/土/黏性土炸弹六件 | 投掷炸弹（shoot 903-906/910-911，计算式——itemcombat 六件全缺 shoot 列，166 普通炸弹=28 在） | thrownCombat 需 itemCombat.shoot → 六件返 null **不可投掷**（数据表缺口；4824-4826/4908 连 itemfunc 条目都无，不在本组 172 计数内） | ❌ | vanillaItemCombat.ts:247 thrownCombat; itemcombat.json 缺 6 条 |
| 4788/4789/4790 | 骑枪三色 | **武器**（马上冲锋 channel）——itemfunc 无 damage 落入本组 | 武器域不在本审计；登记 combat 表无条目=当前不可用 | 📋(域外) | — |

## 四、统计与 ❌ 修复要点（补 C）

**计数**：❌ **21 件**（5573 + other 组 13 件 + 炸弹数据缺口 6 件 + 绳圈 3020-3022 计入
绳圈族）＋ ⚠️ **5 项**（1 系统性+4 单点）＋ 📋 4 ＋ ✅ 其余（buffType 193 件中 ✅ 164；
other 基础组 168 件中 ✅ 150/⚠️ 2/❌ 10/📋 3，另 3 件绳圈在组外）。

- ❌ **21 件**：
  - **5573 火把神药水**（效果错挂+不消耗+buff 376/TorchGodsFlavor 缺——唯一行为级错挂）；
  - **炸弹六件 4824/4825/4826/4827/4908/4909**（itemcombat 缺 shoot 列→thrownCombat
    返 null 不可投掷——数据表补 6 条 shoot 即通，903-906/910-911）；
  - **other 组 13 件**：5328 金锁、1124 蜂巢、1450 泡泡杖、968 棉花糖、3020-3023 绳圈×4、
    507 铃铛、508 竖琴、1345 彩带、5343 货郎背包、4673 鼓槌
    （原版有使用语义、本仓整支无 case，多为低频趣味件）。
- ⚠️ **系统性 1 项**：24 件随从杖伴生 buff 全缺施加链（8 件无 DEFS+16 件 R5 死条目）——
  根因=带 shoot 物品进不了消耗品桥，须在 MinionProj 侧补 ownedProjectileCounts 维护。
  **→ ✅ 已实装（2026-08-22 泛化批回报）**：24 杖映射表（1456 Item.cs 逐杖提取
  buffType/shoot）+8 新枚举 250-257（2364 黄蜂 125/2365 小鬼 126/2621 鲨旋 139/
  2749 UFO 140/5005 泰拉棱镜 322/5069 小雪怪 325/5663 捣蛋猫 385/5664 火绒狐 386）
  +16 死条目复活；Game.ts `MINION_BUFFS` 28 条全表（1457 四件并入单表防漏维护）+
  `maintainMinionBuffs()` 维护核（在役 set(300)=18000 直写/离役 remove=DelBuff；
  多型族 projs 数组；4281 雀宝宝重生支 :10369-10385）；★1093/1094 双声翻转
  （1456 实证：首拍 PalSummon 0.15/第 20 拍家族叫 0.35,Projectile.cs:488/:50893-50898/
  :59128-59131——与 1112/1113 同序）+sfx-wiring 断言同翻。测试 minion-buff-generalize
  25 例（金标/授予/维护 8/驱逐 4/双声 4）+12 文件 172 例绿
- ⚠️ **4 件单点**：星云 booster 图标（173-181 九态仅 L1 三条在 DEFS 且不施加）、425 仙灵铃
  左键直用无效果（QuickBuff 路径 ✓）、5644 窥视宝珠（观战物品入口缺，键盘等价）、
  3353 机械矿车皮肤分档。
- 📋 登记不修：4788-4790 骑枪（武器域）、3862 黑魔袋（原版不可开=同款）、603 收藏版门
  （无载体已登记）、门失败 toast 约定偏差（维持）。

# 弹药/涂料/消耗品全量补审计（补 B，2026-08-22 追加）

> 任务：①弹药全量余量（76 件 ammo 物品扣除首轮已覆盖 58 件 → 余 18 件）②涂料遗漏面
> ③散件消耗品。标杆 `Terarria1456/` Item.cs（ammo 赋值全 79 处逐一定位）/ Player.cs
> PickAmmo :52590-52830 / Projectile.cs SetDefaults+Kill+StatusNPC / AmmoID.cs。
> 方法：`node` 脚本提取（/tmp/ammo-all.txt ammo 全表、/tmp/ammo-vanilla.txt Item.cs
> ammo→vid 映射、/tmp/consumables2.txt 散件消耗品 135 件），未整读 Item.cs。
> **数据面总对账**：vanilla Item.cs `ammo =` 赋值 79 处 = 76 件真弹药 + 1912(None 复位)
> + 6143(DefaultToSolution helper) + 353(Ale 自指 `ammo=353;notAmmo=true`)；
> 76 件与 repo `vanilla-itemcombat.json` ammo 键集**完全同集**（无漏提取）。
> 首轮已覆盖 58 件：40/41/47/51/97/234/265/278/515/516/545/546/988/1179/1235/1302/
> 1310/1334/1335/1341/1342/1349/1350/1351/1352/1432/1614/1783/1836/3003/3009/3010/
> 3011/3103/3104/3567/3568/4915/5348/5377-5380/931/771-774/4445-4449/4459/780-784/
> 5392-5394。余量 18 件 = 23/27/71-74/75/169/370/408/1246/283/949/1261/1785/3108/4457/4458。
>
> **首轮遗留三项复核（均已修，销项）**：❌6 弹药伤害 4 错 → EXTRACT_PATCH（vanillaItemCombat.ts:110-121）
> 已补 546=12/988=7/1350=15/3011=7 ✅；❌7 溶液 5392-5394 缺 ammo → EXTRACT_PATCH :102-104
> 已补 shoot 870-872+ammo 780 ✅；⚠️3 proj478 penetrate → 修复批 R2 已改 ✅。
> 另：1319 雪球炮 useAmmo 双赋值（:16307 Bullet 后 :16318 Snowball 覆盖，提取器取首值）
> → EXTRACT_PATCH :122-125 已补 useAmmo 949 ✅；5629 橡实弹弓 DefaultToRangedWeapon
> 形参漏提 → EXTRACT_PATCH :65 已补 shoot 1088/useAmmo 27 ✅。

## 一、弹药余量 18 件

消费者链（vanilla useAmmo → repo 可达性）：凝胶 23←火焰喷射器 506/精灵熔炉 1910、
橡实 27←橡实弹弓 5629、钱币 71←金币枪 905、坠落星 75←星星炮 197、沙 169←沙枪 266、
雪球 949←雪球炮 1319、刺炮弹 1261←刺炮 1258、南瓜 1785←南瓜发射器 1784、
钉弹 3108←钉枪 3107、迷你核弹 4457/4458←五发射器 Specific 表。repo 远程链
（Game.ts:8521 门 `heldDef.ranged || rangedAmmoWeapon`）按 itemcombat.useAmmo 数据驱动，
上述发射器**全部可达**（Game.ts:8693"沙枪 266 本仓未移植"注释已过时）。

| vid | 物品 | 伤害/效果 | 特殊 | 贴图 | 结论 | 我方行号 | 原版行号 |
|---|---|---|---|---|---|---|---|
| 23 | 凝胶 Gel | dmg0/ammo23/consumable；火焰弹 85（pen4/armorPen15/OnFire✅projstatus） | **❌ 耗弹门缺**：原版 projToShoot==85 时每轮动画仅首帧耗 1 凝胶（:52816 `itemAnimation < max-useTime → dontConsume`）；repo 每发（6t）耗 1 = 5 倍耗弹 | ✅ | ❌ | Game.ts:9028-9035 消耗段无 85 门 | Item.cs:1634-1642; Player.cs:52816-52818 |
| 27 | 橡实 Acorn | ammo27+notAmmo✅（不入弹药栏 Inventory.ts:112）；弹弓 5629 已补链✅ | **❌ 落地种树未实装**：弹 1088 Kill → AI_016_CanAcornPlant → PlaceTile(20)（:70507-70530）；⚠️ 1088 弹道缺重力弧（ai0>10 后 vy+0.2 :44881-44901，repo GrenadeProj fired 恒直线）；⚠️ 5629 恒耗弹（:52806 flag2=false 压制省弹掷）repo 缺 | ✅ | ❌ | WeaponProj.ts:2763 fired 无重力；Game.ts:8734 ai16 路由 | Item.cs:1679-1692; Projectile.cs:70507/:44881; Player.cs:52806 |
| 71 | 铜币 | dmg25/spd1/shoot158/stack100 ✅；金币枪 905 dmg0+弹伤加算✅（Game.ts:8713） | **❌ 金币不可投掷**：原版四币 useStyle1+shoot+consumable+autoReuse 可直接掷出伤敌；repo thrownCombat 门 `c.ammo` 真值排除（vanillaItemCombat.ts:331-339） | ✅ | ❌ | vanillaItemCombat.ts:339 | Item.cs:2200-2220; Player.cs:52594-52605 |
| 72 | 银币 | dmg50/spd2/shoot159 ✅ | 同上 ❌（另：币槽 50-53 优先扫描缺——repo 只扫 54-57→0-53，钱币槽序在背包后，混币时先耗背包币 ≠ 原版先耗币槽） | ✅ | ❌ | Game.ts:8541-8548 | Item.cs:2221-2241; Player.cs:52594 |
| 73 | 金币 | dmg100/spd3/shoot160 ✅ | 同上 ❌ | ✅ | ❌ | 同上 | Item.cs:2242-2262 |
| 74 | 铂币 | dmg200/spd4/shoot161 ✅（maxStack 无=9999✅1456 默认） | 同上 ❌ | ✅ | ❌ | 同上 | Item.cs:2263-2282 |
| 75 | 坠落星 | ammo75/consumable/useStyle4 ✅；星星炮 197→弹 955（pen-1/AI_005 无重力直线✅/timeLeft✅） | ⚠️ 原版点击即消耗 1 颗（useStyle4+consumable+Item4 音，:42602 消耗门无豁免）；repo 无动作不消耗；⚠️ 955 循环音 Item9（20-60t）/alpha 脉冲未实装（cosmetic） | ✅ | ⚠️ | Game.ts:8468 消耗支要求 heal/buff → 落空 | Item.cs:2283-2297; Projectile.cs:22130+ |
| 169 | 沙块 | ammo169+notAmmo✅；沙枪 266（dmg30/shoot42）链可达✅ | **❌ 沙枪整链缺**：①三色砂换弹 370→65/408→68/1246→354 各+5 伤（:52666-52678）repo 无（Game.ts:8691-8693 注释误判"不可达"）；②弹 42 aiStyle10 物理链缺（AI_010 :55060-55075：channel 瞄准→60t 直飞后 +0.2 重力；:55114 切草族 185-187/165/12/665/639/105/178）；③Kill 落地放置沙块 42→53 缺（:75376-75390）——repo grav=0 直飞不放置 | ✅ | ❌ | vanillaItemCombat.ts:396-409 grav=0；Game.ts:8691 注释 | Item.cs:3435-3447; Projectile.cs:55060/:75376; Player.cs:52666 |
| 370 | 黑檀砂块 | 同 169 数据 ✅ | 同上 ❌（应换弹 65 黑檀砂球+5 伤、落地放 112） | ✅ | ❌ | 同上 | Player.cs:52669-52672; Projectile.cs:75390 |
| 408 | 猩红砂块 | 同 169 数据 ✅ | 同上 ❌（应换弹 68+5 伤、落地放 116） | ✅ | ❌ | 同上 | Player.cs:52673-52676 |
| 1246 | 沙漠化石 | 同 169 数据 ✅（createTile 234 放置域✅vanilla.json） | 同上 ❌（应换弹 354+5 伤、落地放 234；354/65/68 pen=-1 repo json ✅） | ✅ | ❌ | 同上 | Player.cs:52677-52679; Projectile.cs:75430 |
| 283 | 种子 Seed | dmg4/shoot51/ammo283 ✅；吹管族链（前轮已审 ✅）；pen1✅；原版无 useStyle 不可直掷=repo thrownCombat 排除✅ | 无 | ✅ | ✅ | — | Item.cs:4717-4725 |
| 949 | 雪球 | dmg8/kb5.75/spd7/shoot166/19t/noUseGraphic ✅；雪球炮 1319 已补 useAmmo949✅ | **❌ 雪球不可直接投掷**：原版雪球=可掷武器+雪球炮弹药双职（useStyle1）；repo thrownCombat 门 `c.ammo` 排除（ammo949 真值）→ 手持雪球无动作 | ✅ | ❌ | vanillaItemCombat.ts:339 | Item.cs:12337-12353; Player.cs:52823 |
| 1261 | 刺炮弹 | dmg17/kb1/spd2/shoot246/pen1✅；刺炮 1258 链✅ | **❌ Kill 爆炸未实装**：:74609-74666 Item14 音+尘+gore+**判定盒 Resize(150×150)+penetrate=-1 重结算 Damage()**+2-5 枚 249 破片（伤继承、随机散射 8/模长）；repo onProjectileDeath 无 246/249 分支（249 json aiStyle2 ✅在库） | ✅ | ❌ | Game.ts:20388-20524 无 246 | Item.cs:15618-15630; Projectile.cs:74609 |
| 1785 | 爆炸南瓜 | dmg60/kb3/spd4/shoot312/tl300✅；南瓜发射器 1784 链✅ | **❌ Kill 22×22 重结算+视觉未实装**：:73893-73953 Item14+尘 31×20/6×20+gore 61-63×4+Damage()；repo 无 312 分支 | ✅ | ❌ | 同上 | Item.cs:19775-19786; Projectile.cs:73893 |
| 3108 | 钉弹 | dmg30/kb3/spd6/shoot514/pen3✅（aiStyle93）；钉枪 3107 链✅ | **❌ Kill 112×112 重结算未实装**：:73295-73340 Item14+尘+penetrate=-1+Resize(112×112)+Damage()；repo 无 514 分支 | ✅ | ❌ | 同上 | Item.cs:28749-28761; Projectile.cs:73295 |
| 4457 | 迷你核弹 I | dmg75/kb4/ammo771 ✅；Specific 表 793/794/795/808/717 ✅全对（vanillaItemCombat.ts:417-421）；爆炸半径：793-795/808 **不在**Kill 闸门表=不毁地形 ✅（repo EXPLODE_RADIUS 无此四键=0 ✅） | ⚠️ 爆炸伤害盒 22×22（半宽 11）≠ 原版 **Resize(50×50)**（:74255，repo hurtBox16 恒 11）；⚠️ 音效分档缺（794/797=Item62 炮声、余 Item14 :74258-74263） | ✅ | ⚠️ | Game.ts:8736-8738 hurtBox16 | Item.cs:37631-37641; Projectile.cs:74246/:75260 |
| 4458 | 迷你核弹 II | dmg75 ✅；Specific 表 796/797/798/809/718 ✅；r7 毁地形 ✅（EXPLODE_RADIUS 796-798/809=7 :75260-75286 对齐） | ⚠️ 同上伤害盒/音效两处 | ✅ | ⚠️ | 同上 | Item.cs:37641-37651; Projectile.cs:75278-75282 |

弹药余量小结：**数据面 18/18 全同**（damage/shoot/shootSpeed/knockBack/useTime 逐字段对
Item.cs SetDefaults 终态）；penetrate 链修复（Arrow.ts:658 `pd0?.penetrate`+life :655
`pd0?.timeLeft`）确认余量件全部走通（65/68/354/955/1088=-1、514=3、158-161=1+tl600）。
notAmmo（币/沙/橡实不入弹药栏）与 NO_AUTO_FILL_AMMO（凝胶/沙/坠星不自动填空弹药栏，
Inventory.ts:100 对齐 :38632-38651）均 1:1 ✅。StatusNPC 命中 debuff：18 件中仅弹 85
有（OnFire，repo projstatus 已有 ✅），余皆无 = 原版同。

## 二、涂料遗漏面（差集核对）

vanilla Item.cs 全部 paint 赋值定位（脚本逐行映射回 case）：`paint = 1..27`（L13375-13531
→ vid 1073-1099）、`paint = 28/29/30`（L21169/21175/21181 → vid 1966/1967/1968）、
`paintCoating = 1/2`（L38472 → 4668 夜明涂料 / L42388 → 5344 回声涂料）、复位 L48562-48563。
**与 repo `PAINT_ITEM_TABLE`（items.ts:1072-1076：1073-1099+1966-1968）差集 = 空**，
涂料 30 色无遗漏 ✅。工具三件六 id（1071/1543 刷、1072/1544 滚、1100/1545 刮）✅。

| vid | 物品 | 登记状态 | 结论 | 我方行号 | 原版行号 |
|---|---|---|---|---|---|
| 1073-1099 | 漆 1-27 | PAINT_ITEM_TABLE 全量 → def.paint | ✅（维持首轮 ✅ 判定） | items.ts:1072-1080 | Item.cs:13374-13535 |
| 1966-1968 | 棕/暗影/反色漆 28-30 | 同上 | ✅ | items.ts:1075 | Item.cs:21168-21185 |
| 4668 | 夜明涂料 GlowPaint | PAINT_OR_COATING 集（Inventory 路由）在册；涂层位未建（FindPaintSlot 不认，Game.ts:12647 注释惰性） | ⚠️ 维持首轮判定（涂层系统未建，中批工程） | Inventory.ts:81-84; Game.ts:12647 | Item.cs:38471-38473 |
| 5344 | 回声涂料 EchoCoating | 同上 | ⚠️ 同上 | 同上 | Item.cs:42387-42389 |

## 三、散件消耗品（vanilla-itemfunc consumable 全量分桶 135 件）

提取口径：consumable=1 且非放置（createTile/createWall）非药水（healLife/healMana）非弹
（ammo/useAmmo）非涂料非食物（buffType 26/206/207）非投掷武器（shoot）非工具。
分桶结果：**buff 药水族 44 件**（288-305/1340/1353-1359/2322-2329/2344-2349/2354-2356/
2359/4477-4479/5211/5573——Buff 矩阵域已审，不重复）；**召唤/事件/许可证族 26 件**（前轮
召唤分区已审）；**Boss 袋 5 件**（3332/3862/4782/4957/5111 → openBossBag Game.ts:9237 ✅，
vanillaOpenBags.ts 全表）；**放置域泄漏 26 件**（2 泥墙/929 炮弹→tile726/1124 蜂巢/1976/
3576/3637/3738/2755/2213/2262/2791/1957/2014/2160/2168/2175/2187/2191/2207/3076/3257/
2434/3762/1905/849——itemfunc 提取漏 createTile/createWall（共享 case 段/DefaultTo
形参），repo 放置走 vanilla.json 双源回填（items.ts:1080-1088 注释）不受影响；
929 createTile:726 vanilla.json 在库 ✅）；**鱼饵 3+**（2438 粉水母/2674 apprentice/2676
master——Bobber.ts:12 咬钩消耗率 1/(1+bait/6) ✅）；**真散件缺口如下表**。

| vid | 物品 | 伤害/效果 | 特殊 | 贴图 | 结论 | 我方行号 | 原版行号 |
|---|---|---|---|---|---|---|---|
| 29 | 生命水晶 | 使用 +20 最大生命（useStyle4/consumable） | 上限门/音效/水晶生成 | ✅ | ✅ | Game.ts:8164 | Item.cs; Player.cs |
| 109 | 魔力水晶 | 使用 +20 最大魔力 | 同上 | ✅ | ✅ | Game.ts:8178 | 同上 |
| 1291 | 生命果 | 使用 +20（原版 +5 上限增量语义本仓等价） | 500 上限门 | ✅ | ✅ | Game.ts:8195 | 同上 |
| 5289 | 矿车升级套件 | 使用→矿车加速档永久解锁 | 旗标持久化 | ✅ | ✅ | Game.ts:7319 | Player.cs:44583 |
| 4271 | 血泪 | 夜且非血月 → 血月（Roar15+月相 4→5+misc[8] 公告+消耗）；昼/血月中整支不可用 | ⚠️ 微：repo useTime 30 ≠ 原版 45（Item.cs:36728） | ✅ | ✅ | Game.ts:9511-9525 | Item.cs:36724-36733; Player.cs:43329/:51435 |
| 4382 | 战斗技巧书 | 使用→combatBookWasUsed 旗（敌怪生成率 -23.07%? 本仓旗标语义）+绿字公告+消耗 | 重复使用不消耗（旗标门）✅ | ✅ | ✅ | Game.ts:9494-9498 | Item.cs:37263-37274; Player.cs:44745+ |
| 5336 | 战斗技巧书·卷二 | 同上（combatBookVolumeTwoWasUsed） | 同上 | ✅ | ✅ | Game.ts:9494-9498 | Item.cs:42298-42307 |
| 353 | 麦酒 | Tipsy(25) 120s（buffType25/7200t/useStyle9 饮用）；`ammo=353;notAmmo=true` 自指（无消费者，纯数据位） | 走通用 buff 药水路径 ✅（BUFF_BY_VANILLA 25→Tipsy） | ✅ | ✅ | Game.ts:8468-8500; stats/Buffs.ts:374 | Item.cs:47990-47999 |
| 2266 | 清酒 | Tipsy 240s | 同上 ✅ | ✅ | ✅ | 同上 | Item.cs:22660+ |
| 3332/3862/4782/4957/5111 | 宝藏袋五件 | 右键开启掉落表 | bossbags 表 | ✅ | ✅ | Game.ts:9237; vanillaBossBags.ts | Player.cs UseItem |
| 2438/2674/2676 | 鱼饵三件 | 咬钩消耗 1/(1+bait/6)，钓具箱 +1 分母 | 鱼力/幸运入钓力公式 ✅ | ✅ | ✅ | Bobber.ts:12/:98-133 | Player.cs:19212+ |
| 3335 | 恶魔之心 | **专家模式**使用→永久第 5 饰品栏（extraAccessory=true + net4）；非专家/已用整支不可用（:51212 门） | 永久旗标存档 | ✅ | ❌ | 全仓 0 命中（饰品栏固定 5 槽无扩展位） | Item.cs:30613-30624; Player.cs:44575-44581/:51212-51214 |
| 5337 | 活力水晶 | 使用→usedAegisCrystal 永久旗（生命再生 +0.5/s 档） | 微光转化永久件；重复使用不可（旗标门 :44768） | ✅ | ❌ | 全仓 0 命中 | Item.cs:42308-42317; Player.cs:44766-44806 |
| 5338 | 神盾果 | usedAegisFruit（永久防御 +4） | 同上 | ✅ | ❌ | 全仓 0 命中 | Item.cs:42318-42327; Player.cs:44774 |
| 5339 | 奥秘水晶 | usedArcaneCrystal（魔力再生 +2%） | 同上 | ✅ | ❌ | 全仓 0 命中 | Item.cs:42328-42337; Player.cs:44780 |
| 5340 | 银河珍珠 | usedGalaxyPearl（永久幸运 +0.05 档） | 同上（repo 仅借贴图给微光 debuff 图标 UI.ts:3710） | ✅ | ❌ | 全仓无效果链 | Item.cs:42338-42347; Player.cs:44786 |
| 5341 | 软糖虫 | usedGummyWorm（永久钓力 +2） | 同上 | ✅ | ❌ | 全仓 0 命中 | Item.cs:42348-42357; Player.cs:44792 |
| 5342 | 仙馔 | usedAmbrosia（上述全项 +0.05 幸运/+2 钓力/+4 防/再生/魔再） | 同上 | ✅ | ❌ | 全仓 0 命中 | Item.cs:42358-42367; Player.cs:44798 |
| 5343 | 货郎背包 | 使用→NPC.peddlersSatchelWasUsed 永久旗（商店售价 8 折档）+世界绿字公告 | 全局旗（非玩家位） | ✅ | ❌ | 全仓 0 命中 | Item.cs:42368-42377; Player.cs:44749-44763 |
| 678 | 红色药水 | 饮用→**11 种减益各 60 分钟**（20/22/23/24/30/31/32/33/35/36/68 :42271-42283）；getGood 世界→3 随机减益 30 分钟（18 态表 :42210-42269）；无治疗 | 惩罚彩蛋件；repo 无动作不消耗（itemfunc 无 buffType/heal → 消耗支落空） | ✅ | ❌ | 全仓 0 命中 | Item.cs:9330-9340; Player.cs:42205-42284 |
| 2756 | 变性药水 | 饮用→itemTime==2 时 Male 翻转 + 声线 1↔2/3↔4 切换（:42516-42540） | 外观系统域 | ✅ | ❌ | 全仓 0 命中 | Item.cs; Player.cs:42516 |
| 5043 | 火把神恩宠 | 使用→火把神事件（25 根火把环绕+判定，完成→unlockedBiomeTorches 永久旗+成就）；已解锁整支不可用（:44609 门） | repo 仅：手持点光（:6154）+持有判定成就（:20840——原版是事件完成才授予） | ✅ | ❌ | 事件链未建 | Item.cs:40412-40422; Player.cs:44609-44616/:17928 |
| 1345 | 彩纸 | 原版=纯"挥动+消耗"（无 shoot/createTile/无 Player.cs 效果分支——全仓 grep 仅 Main.cs:26777 微光旋转） | repo 无动作不消耗（微差：原版白耗 1 个+挥动动画） | ✅ | ⚠️ | 链外 | Item.cs:16620-16630 |
| 1124 | 蜂巢 | 同上（vanilla 亦无 createTile=纯挥动+消耗件；vanilla.json createTile:null 一致 ✅） | 同上 | ✅ | ⚠️ | 链外 | Item.cs:13816-13825 |
| 5328 | 箱锁 | 右键可锁箱型上锁：tile21 style{1,3,18-22,35,37,39}/tile467 style12（:40950-40990 PlaceThing_LockChest） | 箱交互域（上锁后需钥匙/剪线开） | ✅ | ⚠️ | repo 箱链无上锁态 | Item.cs:42246-42256; Player.cs:40948-40990+ |
| 1990 | 卸妆水 | hairDye=0（染发槽清空件） | 染发域（本仓无染发系统） | ✅ | 📋 | 域登记 | Item.cs:21267-21278 |
| 2863/3259 | 火星/暮色染发剂 | 染发槽件 | 同上 | ✅ | 📋 | 域登记 | Item.cs |
| 678 外 useStyle9 杂件 | （2350/2351/2997/4870 传送族） | 前轮召唤分区已审 ✅ | — | ✅ | ✅ | 见前轮表 | — |

## 四、问题汇总与修复要点（补 B 域）

**统计：❌ 25 件（14 组问题）/ ⚠️ 8 件（弹药 3 + 消耗品 3 + 涂料 2 维持）/ ✅ 48 件（含涂料 30 全量）/ 📋 3 件（染发域）**
另销项 3 条：首轮 ❌6（弹药伤害 4 错）、❌7（溶液缺 ammo）、⚠️3（proj478 penetrate）均已由
EXTRACT_PATCH/R2 修复批落地，本轮逐条复核确认。

### ❌ 修复要点（按优先级）

1. **P0｜弹药 Kill 爆炸三连（1261 刺炮弹/1785 爆炸南瓜/3108 钉弹）**——onProjectileDeath
   （Game.ts:20388）加三分支：246 = Item14 音+尘 31×10/6×5+gore 61-63×1+判定盒
   Resize(150×150)+penetrate=-1 重结算 Damage()+2-5 枚 249 破片（伤继承、速度 8/模长随机向，
   :74609-74666）；514 = Item14+尘+112×112 盒重结算（:73295-73340）；312 = Item14+尘+gore+
   22×22 盒重结算（:73893-73953）。重结算模式可复用 41 狱炎箭现成分支（Game.ts:20494）。
2. **P0｜沙枪 266 整链（含 169/370/408/1246 四弹药）**——①resolveAmmoProjId 加沙枪换弹：
   launcher==266 且弹型==42 时 370→65/408→68/1246→354 各 +5 伤（Player.cs:52666-52678，
   加伤走 ammoBonus 同路）；②aiStyle10 物理档：Arrow 加 sandBall 态（channel 期速度跟随
   鼠标≤12 → 松开 60t 直飞 → vy+0.2/t；途经草族 185-187/165/12/665/639/105/178 KillTile，
   AI_010 :55060-55120）；③Kill 放置对应块 42→53/65→112/68→116/354→234（:75376-75433）。
   ★Game.ts:8693"沙枪未移植不可达"注释已过时（266 数据链现可达），修时一并纠偏。
3. **P0｜凝胶耗弹门（23，波及 506/1910）**——消耗段（Game.ts:9028）加
   `projId===85 && 非本轮动画首帧 → 跳过 removeAt`（Player.cs:52816-52818：itemAnimation <
   max-useTime 即非首帧）。现每 6t 耗 1 凝胶 = 原版 5 倍。
4. **P1｜双职件投掷门（71-74 金币/949 雪球）**——thrownCombat（vanillaItemCombat.ts:331）
   现以 `c.ammo` 真值一票排除；原版按 useStyle 判定（金币/雪球 useStyle1+shoot+consumable
   可掷，种子/刺炮弹/南瓜/钉弹无 useStyle 不可掷）。修法：门改 `!c.useStyle`（无 useStyle
   才排除），或显式白名单 {71,72,73,74,949}。连带：币槽 50-53 优先扫描（Player.cs:52594，
   仅 useAmmo==Coin 时先扫 50-53）。
5. **P1｜微光永久六件 + 货郎背包（5337-5343）**——Player 加 used* 六旗 + 消费端接入
   （再生/防御 +4/魔再/幸运/钓力 +2/商店 8 折），使用链走 useStyle4 45t+Item92 音+旗标门
   （重复使用不可，:44751-44806）；旗标入存档。5343 旗在 NPC 静态位（peddlersSatchelWasUsed）。
6. **P1｜恶魔之心 3335**——专家模式使用→永久第 5 饰品栏。需饰品栏 miscEquips 扩展位 +
   存档兼容（非专家/已用整支不可用 :51212），工程量中批，可与配饰域"信息饰品背包生效域"
   遗留合并做。
7. **P1｜红色药水 678**——消耗支加 case：普通世界 11 减益 ×21600s（:42271-42283）、
   getGood 世界 3 随机 ×10800s（18 态表 :42210-42269）；UseSound Item3/useStyle9 17t。
8. **P1｜火把神恩宠 5043 事件链**——使用→火把神事件（火把环绕+判定→unlockedBiomeTorches
   永久旗+火把幸运）；现仅持有判成就（Game.ts:20840 应移到事件完成）。事件体量中批，
   可与事件系统域合批。
9. **P2｜橡实弹弓弹 1088 补全（27/5629）**——①Kill 种树：AI_016_CanAcornPlant 寻位点→
   PlaceTile(20)（:70507-70530）；②重力弧 ai0>10 后 vy+0.2（:44881-44901，GrenadeProj
   fired 加 1088 特例档）；③5629 恒耗弹（:52806 flag2=false 压制省弹掷）。
10. **P2｜变性药水 2756**——itemTime==2 时 Male 翻转+声线切换（:42516-42540）；依赖本仓
    外观系统性别位。
11. **P2｜迷你核弹伤害盒（4457/4458）**——hurtBox16 对 793-798/808/809 给 25（Resize 50×50
    :74255）；顺带音效分档 794/797=Item62（:74258）。

## 修复批回报（R9：other 趣味件 ❌13+⚠️4）✅（2026-08-22；33 例新+邻域 150 绿）

- **先决核查**：1450 泡泡杖/4673 鼓槌/508 竖琴/968 棉花糖/5644 占卜球 5 件已被并行会话在途
  修毕——只做回归锁不重做；其余按 1456 原文亲核实装（补 C 行号确有偏差,均以原文为准）
- **新实装**：5328 金锁（chestLockOf 样式表=Chest.Lock :409-473 1:1+世纪之花门+frameX 右移+
  Sound22+消耗 :40946-41010）；1124 蜂巢（hiveBeeRoll 1/30 门发 Arrow 181 :42946-42958）；
  507 铃（与 508 共段 :45905-45936,6 档音高按鼠标距离）；5343 货郎背包（一次性旗+公告+
  buildTravelStock 接通 +1 件 Chest.cs:1271-1273）
- **★审计证伪/误记三处**：①3020-3023"绳圈"实为 **Tendon/Thorn/Illuminant/Worm 四钩爪**
  （ItemID.cs:7579-7585,shoot 486-489 aiStyle7）——本仓 grappleHooks 早已全通,无可补；
  顺带修出真数据 bug=3021 荆棘钩 shootSpeed 应 16（:27955-27957 覆写,表与测试曾误 15）
  ②507 铃"音效弹"系误记——原版纯 PlaySound+musicPitch 零弹体 ③1345 彩带"彩纸弹"证伪——
  Player.cs 全源零引用（仅微光绘制）,真身=挥动+通用消耗（:42602）,按字面落地
- **⚠️4**：星云图标 173-181（根因=等级制从不产生真 buff→UI 派生通道 nebulaBuffBlocks
  三族+右键取消 nebulaCancel :56091-56121/:11660 映射 1:1）；425 仙灵铃左键三选一
  （:52252-52272+清三色+AddBuff 60s）+顺带修 QuickBuff 同源缺口（FairyRed/Green=248/249
  补 DEFS 后三掷全生效）；3353 机械矿车真缺=发光层（Minecart.textureGlow+Renderer lighter 叠画）

## 修复批回报（R8 弹药侧 + R11 消耗品侧）✅（2026-08-22）

### R8（弹药/投掷，33 例新+126 域绿）
- **Kill 爆炸三分支 ✅**（onProjectileDeath 提取共用 settleKillExplosion）：
  246 刺炮弹 150 盒无 owner 门+2-5 枚 249 破片（原式 ±0.01 相相消双零退化产 NaN→‖1 钳）/
  312 爆炸南瓜 **★补 B"22 盒重结算"系误读——22 只罩尘,Damage 在 128 盒内跑（:73946-73951）**/
  514 钉弹 112 盒 owner 门内
- **沙枪 266 整链 ✅**：resolveSandGunSwap（370→65/408→68/1246→354 各+5）+Arrow sandBall 态
  （直飞档+割草族 breakTile+顶坡铲平+恒滚）+Kill 放块 4 映射（半砖上移/轨道/传送带/
  sandFallsBelow flag9 门）+:8693 过时注释纠偏
- **凝胶耗弹门 ✅**：flameGelConsumesThisShot 按弹序取模（30/6=每 5 发仅首发扣 1,换武器重计）
- **橡实 1088 ✅**：重力弧+CanAcornPlant 种树/掉落+5629 恒耗弹双接线
- **金币/雪球投掷 ✅ ★补 B"金币可投掷"系误读——1456 :46473 `if (sItem.IsACoin) canShoot=false`
  明门禁止四币掷出**；按原文修：thrownCombat 门改雪球 949 白名单（金币保持不可掷=原版一致）
  +连带金币枪币槽 50-53 优先扫描（:52593-52605）
- **迷你核弹盒 11→25 ✅**（八型 793-798/808/809）+音效分档；**坠落星 75 点击消耗 ✅**（useStyle4+17t）

### R11（消耗品，43 例新+218 邻域绿；★前置发现:审计 11 件中 5 件已被并行会话在途修毕,逐项核实后只补真缺口）
- **微光六件 ✅**：六条旗→属性结算链核实**全部已在位**（★审计"钓力+2"系误,1456 终值
  fishingSkill+=3 :12451）；本批补两缺口=银河珍珠旗**不入档**（SaveFile permanentUpgrades
  缺它→读档可重复吃+幸运丢失,补 serialize/SaveFile/mainFlow 三处）+六件 UseSound Item92
- **货郎背包 5343 ✅**：★审计"商店 8 折"系误——原版真行为=**旅商每日股票 +1 件**
  （Chest.SetupTravelShop :1271-1273 num++ 无掷）；实装已在,补行为级对拍测试（同种子双跑货架+1）
- **恶魔之心 3335 ✅**：消费端已在（accSlotMax=3+5+extraAccessory）；补难度门偏差备案
  （原版第 6 槽仅 expert/gameMenu 生效;本仓玩家档与世界档同存亡→门结构不可达）+UseSound
- **红药水 678 ✅**：旧表 13 项混入 21/25-29 漏 31/32/35/36 → 改原版 11 减益
  [20,22,23,24,30,31,32,33,35,36,68]×3600s+**getGood 分支**（3 掷×1800s 十八态表）+
  useTime 30→17；★任务书"自伤"假设经原文核实**不存在**（:9330-9340 无伤害字段）；
  新增 **Silenced(35)** buff（施法封锁,magic case 头 mana>0 物品整支不可用 :51383-51385）
- **火把神转换链 ✅ 全新实装**：Torch.ts 提取 biomeTorchPlaceStyle 全表 12 群系档+
  IS_BIOME_TORCH_STYLE+TorchGodHelperProj（弹 1084:extraUpdates=2 三跑/tick,抵 16px 转换）+
  torchGodsFlavor()（1/10 掷→单弹门→视口 1000 采样→地牢墙 XOR 门→原版出生几何含
  Next(400,401)≡400 常量怪癖照抄）挂 fixedUpdate buff 376 门

### ⚠️ 修复要点

1. 坠落星 75 点击消耗（useStyle4+consumable，:42602 门无豁免）+955 循环音/alpha 脉冲——
   前者一行消耗支，后者 cosmetic。
2. 彩纸 1345/蜂巢 1124"挥动+消耗"（原版无效果纯白耗）——通用 consumable 兜底支可顺带覆盖。
3. 箱锁 5328（可锁箱型白名单 style 表 :40956-40977）——箱交互域，登记待箱域批。
4. 涂层 4668/5344——维持首轮登记（涂层系统未建）。

### 📋 登记不修

- 染发域三件（1990 卸妆水/2863/3259 染发剂）——本仓无染发系统，域登记。
- vanilla-itemfunc.json createTile/createWall 提取缺口（929/1976/3576 等共享 case 段与
  DefaultToPlaceableTile 形参不在单值提取面）——repo 放置走 vanilla.json 双源已覆盖，
  数据面无需补（items.ts:1080-1088 注释已备案机制）。
- 弹 955 音效/alpha、4457/4458 音效分档等 cosmetic 项（随主修复顺带，不单列）。

### 审计确认正确项（要点）

- 数据面：弹药 76/76 ammo 键集与 vanilla 完全同集；余量 18 件逐字段全同；涂料 30 色
  差集为空；1319/5629/5392-5394/546/988/1350/3011 七处 EXTRACT_PATCH 逐条对源码复核无误。
- 链路面：penetrate/timeLeft 修复（Arrow.ts:655-658）对余量件全生效；notAmmo 与
  NO_AUTO_FILL_AMMO 两道弹药栏门 1:1；Specific 表 5×12 全对（含 4457/4458）；迷你核弹
  爆炸半径闸门（793-795/808 不毁地形、796-798/809 r7）全对；金币枪 0 伤+弹伤加算、
  星星炮 955 无重力直线（AI_005 无 gravity 项）语义正确。
- 消耗品面：生命/魔力水晶/生命果/矿车升级包/血泪/战斗技巧书两册/麦酒清酒（Tipsy 经
  BUFF_BY_VANILLA 25 通用路径）/宝藏袋五件（openBossBag）/鱼饵消耗率全链 ✅。

# 放置物全量补审计（补 A：未覆盖 325 族 846 件，2026-08-22 追加）

> 对象：vanilla-itemfunc.json createTile 物品全量 1040 件 / 353 族，扣除首轮已覆盖 26 功能族
> （tile {4,10,11,16,17,18,19,21,55,79,86,106,125,135,136-144,216,235,355,356,378,425}）与共通链
> （轨道 314/绳 213/晶塔 597/锚桩 723·724）后余 **325 族 846 件**。
> 方法：脚本分组（/tmp/place-groups.json）→ 逐族核对①放置链（Game.ts tryPlace :12848 通用路径 +
> 特例分支）②贴图打包（public/sprites/vanilla.json tiles[]，**325/325 全有**）③放下后功能
> （TileLightScanner/Wiring/devices/SceneMetrics/FurnitureItems/recipes tile 门/交互分派 :13767-14070）。
> 标杆：Item.cs SetDefaults 逐 case、WorldGen.PlaceTile/CheckTile/Check2x2（:48405/:86251+）、
> KillTile_GetItemDrops（:63999）+ GetItemDrop_*（:39766-43138/:49870）、TileID.cs Sets、
> Main.cs tileLighted/AnimateTiles（:18366+）。

## 一、总览

| 维度 | 结果 |
|---|---|
| 贴图打包 | 325/325 族全有（vanilla.json tiles[0..753] 754 张全量） |
| tile def 注册 | 325/325（含 VAN() 帮助注册的 19 族：桌/椅/烛/吊灯/灯笼/水蜡/陶罐/墓碑/钢琴/梳妆/浴缸/酒桶/中式灯/汤锅/骷髅灯/烛台/书架/座钟） |
| 物品→tile 回填 | 1040/1040 可解析（items.ts:1690-1714，itemfunc.createTile → TILE_KEY_BY_SHEET） |
| 放置链 | 通用路径全覆盖（支撑/桌面集/实心防重叠/多格锚点/style 帧）；特例族（火把/轨道/绳 coil/橡实/晶塔/魔杖 30 件）首轮已核 |
| 功能实装 | 光源 68 case + defLight 73 def、合成站 35 sheet（recipes tile 门）、电路 20+ 器件、右键交互 15+、TE 挂物 6 类、存储 4 bank——逐族见下表，**未发现整族缺功能** |
| ❌ | 2 件（帽架/女模特 createTile 提取陈旧值） |
| ⚠️ | 127 族 622 件（三大系统性：多格破坏无返还 99 族 / style 掉落不还原 15 族 / 杂项 13 族） |

## 二、系统性发现（按根因归组）

### ❌1 帽架 3977 / ❌2 女模特 1989：createTile 取到源码二次赋值前的陈旧值（2 件）
- Item.cs case 3977（:35321）`createTile=269` 后被 `createTile=475` **覆写**（终态 475）；case 1989
  同构（269 → 470 + placeStyle 2）。提取器取首赋值 → vanilla-itemfunc.json 记 269。
- 回填链 items.ts:1707 只在 itemfunc **缺** createTile 时才回退 vanilla.json（终态 470/475），
  故陈旧值胜出 → 帽架放成 v_269_womannequin_legacy（2×3 女模特 legacy），**帽架 TE 存储类
  （FurnitureItems.ts:73 'v_475_hat_rack'→hat_rack）永不触发**；女模特同理放错 tile。
- 同族先例：498 Mannequin 已在 items.ts:886 手工修（tile:'v_470_mannequins'）——1989/3977 漏网。
- 修复：items.ts 补两行手工 def（同 498 样板），或提取器改取终态（双源分歧全表仅此 3 件，
  498 已修、余 2 件即本条）。

### ⚠️1 多格放置物破坏无返还（99 族 338 件）——本轮最大缺口
- 根因：breakTile 多格 object 分支（Game.ts:11856-11879）`def.drop===null → dropKey=null → 无掉落`；
  1×1 路径（:11992-11998）有 `place_v_*` 兜底，**多格分支漏同款兜底**。
- v_ 系 def（机械重生成批）几乎全 `drop: null`：地狱熔炉 77/巫惑台 354/提取器 219/灌注台 243/
  染料缸 228/水晶球 125/日晷 356/训练假人 378（后四件属首轮已覆盖 26 族，同漏）/雕像 105（51 件）/
  画 240+242+245+246（107 件）/旗帜 91（33 件）/营火 215/大炮 209/天塔柱 410/钓鱼箱 376/
  二类箱 467+陷阱 468/二类桌 469/水槽 172/精金·钛金熔炉 133/山铜·秘银砧 134/碗 103/拉杆 132/
  引爆器 411/宝石锁 440/巨石族 664-715 等。
- 原版：KillTile_GetItemDrops 共享 no-drop 表（WorldGen.cs:65832-66136）的族，掉落走 TileFrame 的
  Check* 帧检分支（Check2x1/2x2/2xX/3x2… :46000-52000 → Item.NewItem + GetItemDrop_*(style)）——
  **挖掉必返还对应物品**。
- 修复：多格分支补 place_ 兜底（一行，与 :11998 对齐）；style 族再按帧查 GetItemDrop_*（见 ⚠️2）。
  **→ ✅ 已实装（2026-08-22 R10 批回报）**：①`chestDestroyableAt`/`multiTileDropKey`
  纯函数（Game.ts:524/:533）②breakTile 头部存活门=Mounts.ts 既有 1:1 移植
  shouldTileSurviveAt（WorldGen.cs:62515-62559）——**非空宝箱 21/467+梳妆台 88 整件
  不可破坏**（原版 CanDestroyChest→KillTile :63899 早退；此前"有物也拆+内容全弹"
  改归原版语义）③多格分支掉落接 multiTileDropKey（null→place_v_ 兜底,门=存在真实
  原版放置物品——27 族纯世界生成装饰双源 createTile 均无→维持无掉落,CheckSeaOat
  :58345 实证）④checkFurnitureSupport 失撑链同接。锚点单次掉落+帧带覆写保留。
  测试 multi-tile-drop 27 例（含 279 个多格 drop:null def 对独立 vanilla createTile
  oracle 全等）+回归 ~200 例绿。附带观察（未动,归 ⚠️3 批）：巨石族 solid 早退仍在
  失撑链外/非空箱失撑路径不经存活门。

### ⚠️2 style→物品 掉落不还原（15 族 244 件 + 1×1 版 6 族 45 件）
- 单 def 单 drop：桌 14(27)/椅 15(32)/烛 33(15)/吊灯 34(18)/灯笼 42(33)/钢琴 87(15)/梳妆台 88(15)/
  凳沙发 89(13)/浴缸 90(12)/汤锅 96(2)/烛台 100(11)/书架 101(29)/座钟 104(10)/墓碑 85(7)——
  挖掉恒掉 style0 档（木桌/木椅/铜吊灯…），原版 GetItemDrop_Tables/Chair/Lanterns/...（:42131/:42677/
  :40873/...）按帧还对应材质档。已覆盖族同病：床 79（drop 224）/平台 19/工作台 18。
- 1×1 drop:null 版：矿石条 239（23 style，原版 case 239 按 frameX/18 掉对应锭 :64286+）/
  瓶杯 13（6）/钱币堆 330-333（4，原版掉币 71-74）/节日灯 149（3）/药草种 82（7，掉落已按帧✅
  仅放置返还位）/骨块 194（2）——挖掉掉 place_v_ 通用物品，非原版真物品。
- 已正确按帧掉：八音盒 139/喷泉 207/书 50/宝石 178/染料植物 227/药草 83-84/火把 4（Game.ts:11863-11878/
  :11942/:11552）——修复时照此样板扩表即可。

### ⚠️3 杂项（8 族）
**→ ✅ 已实装（2026-08-22 R12 批回报；38 例新+邻近 161 例绿）**

| tile | 族 | 处置 |
|---|---|---|
| 138/484/664/665/711/712 | 巨石族 | ✅ checkFurnitureSupport solid 早退加 BOULDER_SUPPORT_SHEETS 豁免；支撑判据=Check2x2 逐柱下方实心；失撑→整件清+滚石弹（cs:48766-48801 逐 sheet 伤 70/35/100/50，**不掉物品**=原版滚石陷阱语义） |
| 326/327/345/458/459 | 瀑布族 | ✅ TILE_ANIM_RATE 补 5 档（5/10t、pitch90、8 帧回卷 Main.cs:18743-18793）+VanillaTiler 'auto' 路径补 anim 偏移（附带修 739/748 水母砖/鱼缸砖恒静止） |
| 78/254/579 | 陶罐/南瓜株 | ✅ WorldEvolution 补 case 254（GrowPumpkin cs:52522 1:1）+78/380/579 顶部杂草（cs:72381-72390） |
| 104 | 座钟 | ✅ SceneMetrics.scanScene 补 hasClock（:465-467）+Game 每 tick accWatch<3→++（:12593-12596）金表精度 |
| 654 | TNT 桶 | ✅ 已核定谳：TileFrame :86419-86427 无 Check+KillTile :66114 no-drop→原版直接破坏无掉落无爆炸；breakTile 改判无掉落。电线引爆（proj 1002）未接=登记遗留 |
| 353/365/366 | 绳 | 核实已符原版，未动 |
| 82 | 药草盆 | 核实已符原版，未动 |
| 128/269 | legacy 模特 | decor✅ 未动 |

**⚠️2 style→物品掉落还原同批 ✅（超额：32 sheet/425 件，审计要求 21 族 289 件）**：
新 `vanillaStyleDrops.ts`（1456 GetItemDrop_* 23 函数逐 case 机械转录+特例 7 处）+
接线三路（breakTile object/1×1 通用/失撑链，style 还原优先于 place_v_ 兜底）+
**放置帧修正**：烛台 100 `[0,style*72]→[0,style*36]`、水槽 172 补 `[0,style*38]`
（原版 Place2x2 cs:51436-51446 竖排实证——旧 72 系空带误读致 style≥1 光照/掉落全错位）。
测试 style-drop-restore 38 例（>900 档全表对拍+帧⇄style roundtrip）。
**备案未改（后续批）**：①灯族 93 放置帧疑错（[0,style*110] vs 原版 fy/54 :37812,足迹 1×6 vs 1×3）
②CaveHousePass.placeFurniture Place2x2 写 frameX=style*36 与原版 Y 带相反（世界生成侧帧债,
现 oracle 种子无带 style 实例）③TNT 桶电线引爆链（proj 1002）未接


## 三、全族清单（325 族；"放置"=通用链/特例，"功能"=实装要点，"结论"含缺口注记）

| tile | 物品例(vid:名) | 数量 | 放置 | 功能 | 贴图 | 结论 | 我方行号 |
|---|---|---|---|---|---|---|---|
| 0 | 2:Dirt Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 1 | 3:Stone Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 2 | 62:Grass Seeds/213:Staff of Regrowth/… | 3 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 6 | 11:Iron Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 7 | 12:Copper Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 8 | 13:Gold Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 9 | 14:Silver Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 13 | 31:Bottle/350:Pink Vase/… | 6 | 通用链 | 合成站(瓶装档,ON_TABLE 桌面族) | ✅ | ⚠️ 挖掉掉 place_v_ 通用物品(原版按 style 掉真物品) | Game.ts:13132/:22329 |
| 14 | 32:Wooden Table/638:Ebonwood Table/… | 27 | 通用链 | 住房桌(TILE_TABLE_SHEETS) | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | tiles.ts:934; Housing.ts:41 |
| 15 | 34:Wooden Chair/358:Toilet/… | 32 | 通用链 | 住房椅+朝向帧 | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | Housing.ts:45; Game.ts:18076 |
| 20 | 27:Acorn | 1 | 通用链 | decor(原版同款无功能) | ✅ | ✅ | Game.ts:12848(通用放置链) |
| 22 | 56:Demonite Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 23 | 59:Corrupt Seeds | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 25 | 61:Ebonstone Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 27 | 63:Sunflower | 1 | 通用链 | 阳光花:SceneMetrics 防僵直/幸福 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | SceneMetrics.ts:41 |
| 29 | 87:Piggy Bank | 1 | 通用链 | 存钱罐 bank0 | ✅ | ✅ | Game.ts:640 |
| 30 | 9:Wood | 1 | 通用链 | decor(原版同款无功能) | ✅ | ✅ | Game.ts:12848(通用放置链) |
| 33 | 105:Candle/1405:Blue Dungeon Candle/… | 15 | 通用链 | 光源(样式表+动态档)+水蜡刷怪档 | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | TileLightScanner.ts:212 |
| 34 | 106:Copper Chandelier/107:Silver Chandelier/… | 18 | 通用链 | 吊灯光(样式表 wrap37) | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | TileLightScanner.ts; FurnitureStyle.ts |
| 35 | 1813:Jack 'O Lantern | 1 | 通用链 | 南瓜灯光 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | TileLightScanner case 35 |
| 36 | 1869:Present | 1 | 通用链 | decor(原版同款无功能) | ✅ | ✅ | Game.ts:12848(通用放置链) |
| 37 | 116:Meteorite | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 38 | 129:Gray Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 39 | 131:Red Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 40 | 133:Clay Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 41 | 134:Blue Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 42 | 136:Chain Lantern/1390:Brass Lantern/… | 33 | 通用链 | 灯笼光 54 样式表+ demonTorch 调制 | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | TileLightScanner.ts:145-178 |
| 43 | 137:Green Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 44 | 139:Pink Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 45 | 141:Gold Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 46 | 143:Silver Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 47 | 145:Copper Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 48 | 147:Spike | 1 | 通用链 | 尖刺 TouchDamage | ✅ | ✅ | env-hazards TouchDamage 表 |
| 49 | 148:Water Candle | 1 | 通用链 | 水蜡烛:刷怪率修正(32格扫+手持) | ✅ | ✅ | Game.ts:4928-4944 |
| 50 | 149:Book | 1 | 通用链 | 书:放置随机帧0-4+水书掉落 | ✅ | ✅ | Game.ts:13172/:11872 |
| 51 | 150:Cobweb | 1 | 通用链 | 蛛网:粘滞+掉落 | ✅ | ✅ | Player.ts:3348/:3402 |
| 53 | 169:Sand Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 54 | 170:Glass | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 56 | 173:Obsidian | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 57 | 172:Ash Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 58 | 174:Hellstone | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 59 | 176:Mud Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 60 | 195:Jungle Grass Seeds | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 70 | 194:Mushroom Grass Seeds | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 75 | 192:Obsidian Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 76 | 214:Hellstone Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 77 | 221:Hellforge | 1 | 通用链 | 合成站+光(继承17→215) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | vanilla-recipes tileCountsAs |
| 78 | 222:Clay Pot | 1 | 通用链 | 陶罐(ON_TABLE)+顶部随机草生长(原版有,未接⚠) | ✅ | ⚠️ 顶部随机草/南瓜生长未接(原版 UpdateWorld :72381/:72386) | Game.ts:13132 |
| 81 | 275:Coral | 1 | 通用链 | decor(原版同款无功能) | ✅ | ✅ | Game.ts:12848(通用放置链) |
| 82 | 307:Daybloom Seeds/308:Moonglow Seeds/… | 7 | 通用链 | 药草苗:三态生长 GrowAlch | ✅ | ✅ | WorldEvolution.ts:340/:1498 |
| 85 | 321:Tombstone/1173:Grave Marker/… | 7 | 通用链 | 墓碑族(7样式) | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | Game.ts:11882 注销牌面 |
| 87 | 333:Piano/641:Ebonwood Piano/… | 15 | 通用链 | 钢琴 decor(原版无演奏) | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | tiles.ts:132 |
| 88 | 334:Dresser/647:Ebonwood Dresser/… | 15 | 通用链 | 梳妆台=箱登记 88 | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | Game.ts:13205 |
| 89 | 335:Bench/858:Boreal Wood Sofa/… | 13 | 通用链 | 凳/沙发 decor | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | tiles.ts |
| 90 | 336:Bathtub/2128:Bone Bathtub/… | 12 | 通用链 | 浴缸 decor(原版无功能,CountsAsWater={172,207}不含) | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | TileID.cs:281 |
| 91 | 337:Red Banner/338:Green Banner/… | 33 | 通用链 | 旗帜 buff(Banners.ts)+style 帧横排 wrap111 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Banners.ts; FurnitureStyle.ts |
| 92 | 341:Lamp Post | 1 | 通用链 | 路灯柱光 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | TileLightScanner case 92 |
| 93 | 342:Tiki Torch/2225:Dynasty Lamp/… | 12 | 通用链 | 灯族光(样式表) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | TileLightScanner.ts:216 |
| 94 | 352:Keg | 1 | 通用链 | 酒桶=合成站 | ✅ | ✅ | vanilla-recipes tile 94 |
| 95 | 344:Chinese Lantern | 1 | 通用链 | 中式灯笼光 | ✅ | ✅ | TileLightScanner case 95 |
| 96 | 345:Cooking Pot/1791:Cauldron | 2 | 通用链 | 汤锅=合成站+光 | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | vanilla-recipes; TileLightScanner |
| 97 | 346:Safe | 1 | 通用链 | 保险箱 bank1 | ✅ | ✅ | Game.ts:640 |
| 98 | 347:Skull Lantern | 1 | 通用链 | 骷髅灯光 | ✅ | ✅ | TileLightScanner case 98 |
| 100 | 349:Candelabra/2227:Large Dynasty Candle/… | 11 | 通用链 | 烛台光(样式表) | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | TileLightScanner case 100 |
| 101 | 354:Bookcase/1414:Blue Dungeon Bookcase/… | 29 | 通用链 | 书架=合成站(29样式) | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | vanilla-recipes tile 101 |
| 102 | 355:Throne | 1 | 通用链 | 王座=住房椅 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Housing.ts:45 |
| 103 | 356:Bowl/2235:Dynasty Bowl/… | 3 | 通用链 | 碗族(桌面放置走通用支撑近似) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13128 |
| 104 | 359:Grandfather Clock/2241:Steampunk Clock/… | 10 | 通用链 | 座钟 decor;授时 HasClock 未接(首轮⚠) | ✅ | ⚠️ 挖掉恒掉 style0 物品(原版 GetItemDrop_* 按 style) | doc:1650 |
| 105 | 52:Angel Statue/360:Armor Statue/… | 51 | 通用链 | 雕像族 51 件:电线产怪/掉物(STATUE 表) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | devices.ts:390-486 |
| 107 | 364:Cobalt Ore | 1 | 通用链 | decor(原版同款无功能) | ✅ | ✅ | Game.ts:12848(通用放置链) |
| 108 | 365:Mythril Ore | 1 | 通用链 | decor(原版同款无功能) | ✅ | ✅ | Game.ts:12848(通用放置链) |
| 109 | 369:Hallowed Seeds | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 111 | 366:Adamantite Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 112 | 370:Ebonsand Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 114 | 398:Tinkerer's Workshop | 1 | 通用链 | decor(原版同款无功能) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:12848(通用放置链) |
| 116 | 408:Pearlsand Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 117 | 409:Pearlstone Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 118 | 412:Pearlstone Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 119 | 413:Iridescent Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 120 | 414:Mudstone Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 121 | 415:Cobalt Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 122 | 416:Mythril Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 123 | 424:Silt Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 124 | 480:Wooden Beam | 1 | 通用链 | 木梁:无支撑可悬放(decor 非 framed) | ✅ | ✅ | tiles.ts:357; Game.ts:13127 |
| 126 | 488:Disco Ball | 1 | 通用链 | 迪斯科球动态光 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | TileLightScanner.ts:180 |
| 128 | 498:Mannequin | 1 | 通用链 | 模特(legacy) decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts:567 |
| 129 | 502:Crystal Shard | 1 | 通用链 | 晶簇光+SceneMetrics 探矿 | ✅ | ✅ | SceneMetrics.ts:221 |
| 130 | 511:Active Stone Block | 1 | 通用链 | 通电石块:电线切换 130↔131 | ✅ | ✅ | devices.ts:602-606 |
| 131 | 512:Inactive Stone Block | 1 | 通用链 | 断电石块:同上 | ✅ | ✅ | devices.ts:602-606 |
| 132 | 513:Lever | 1 | 通用链 | 拉杆:右键/电线翻帧 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13992; Wiring.ts:252 |
| 133 | 524:Adamantite Forge/1221:Titanium Forge | 2 | 通用链 | 精金/钛金熔炉=合成站+光 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | vanilla-recipes tileCountsAs |
| 134 | 525:Mythril Anvil/1220:Orichalcum Anvil | 2 | 通用链 | 山铜/秘银砧=合成站(继承134→16) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | vanilla-recipes tileCountsAs |
| 140 | 577:Demonite Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 145 | 586:Candy Cane Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 146 | 591:Green Candy Cane Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 147 | 593:Snow Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 148 | 594:Snow Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 149 | 596:Blue Light/597:Red Light/… | 3 | 通用链 | 节日灯三色动态光 | ✅ | ⚠️ 挖掉掉 place_v_ 通用物品(原版按 style 掉真物品) | TileLightScanner case 149 |
| 150 | 604:Adamantite Beam | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 151 | 607:Sandstone Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 152 | 609:Ebonstone Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 153 | 611:Red Stucco | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 154 | 612:Yellow Stucco | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 155 | 613:Green Stucco | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 156 | 614:Gray Stucco | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 157 | 619:Ebonwood | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 158 | 620:Rich Mahogany | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 159 | 621:Pearlwood | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 160 | 662:Rainbow Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 161 | 664:Ice Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 163 | 833:Purple Ice Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 164 | 834:Pink Ice Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 166 | 699:Tin Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 167 | 700:Lead Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 168 | 701:Tungsten Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 169 | 702:Platinum Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 170 | 1872:Pine Tree Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 171 | 1873:Christmas Tree | 1 | 通用链 | 圣诞树:右键礼物+串灯动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:9292/:12084; TileAnim 171 |
| 172 | 2855:Martian Sink/3149:Granite Sink/… | 5 | 通用链 | 水槽=合成水源 CountsAsWater | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:22351 |
| 173 | 714:Platinum Candelabra | 1 | 通用链 | 铂烛台光 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | TileLightScanner case 173 |
| 174 | 713:Platinum Candle | 1 | 通用链 | 铂蜡烛光(ON_TABLE) | ✅ | ✅ | TileLightScanner case 174 |
| 175 | 717:Tin Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 176 | 718:Tungsten Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 177 | 719:Platinum Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 178 | 177:Sapphire/178:Ruby/… | 7 | 通用链 | 宝石放置+暴露晶簇按帧掉对应宝石 | ✅ | ✅ | Game.ts:11942 |
| 188 | 276:Cactus | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 189 | 751:Cloud | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 190 | 183:Glowing Mushroom | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 191 | 832:Living Wood Wand | 1 | 通用链 | decor(原版同款无功能) | ✅ | ✅ | Game.ts:12848(通用放置链) |
| 192 | 933:Leaf Wand | 1 | 通用链 | decor(原版同款无功能) | ✅ | ✅ | Game.ts:12848(通用放置链) |
| 193 | 762:Slime Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 194 | 766:Bone Block/932:Bone Wand | 2 | 通用链 | 骨块+骨魔杖(放置) | ✅ | ⚠️ 挖掉掉 place_v_ 通用物品(原版按 style 掉真物品) | tiles.ts; Game.ts |
| 195 | 763:Flesh Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 196 | 765:Rain Cloud | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 197 | 767:Frozen Slime Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 198 | 775:Asphalt Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 199 | 2171:Crimson Seeds | 1 | 通用链 | decor(原版同款无功能) | ✅ | ✅ | Game.ts:12848(通用放置链) |
| 200 | 835:Red Ice Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 202 | 824:Sunplate Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 203 | 836:Crimstone Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 204 | 880:Crimtane Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 206 | 883:Ice Brick | 1 | 通用链 | decor(原版同款无功能) | ✅ | ✅ | Game.ts:12848(通用放置链) |
| 207 | 909:Pure Water Fountain/910:Desert Water Fountain/… | 8 | 通用链 | 喷泉 8 色:电线换色+掉落按帧 | ✅ | ✅ | devices.ts:577; Game.ts:11869 |
| 208 | 911:Shadewood | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 209 | 928:Cannon/1337:Bunny Cannon/… | 4 | 通用链 | 大炮/兔炮/彩带炮/传送门炮:电线状态机 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | devices.ts:633-707 |
| 210 | 937:Land Mine | 1 | 通用链 | 地雷:电线爆炸 | ✅ | ✅ | devices.ts:715 |
| 211 | 947:Chlorophyte Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 212 | 951:Snowball Launcher | 1 | 通用链 | 雪球发射器:电线状态机 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | devices.ts:720 |
| 214 | 85:Chain | 1 | 通用链 | decor(原版同款无功能) | ✅ | ✅ | Game.ts:12848(通用放置链) |
| 215 | 966:Campfire/3050:Rainbow Campfire/… | 6 | 通用链 | 营火:再生 buff+光+烤棉花糖站 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:4951; vanilla-recipes tile 215 |
| 217 | 995:Blend-O-Matic | 1 | 通用链 | 混合机=合成站+动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | vanilla-recipes; TileAnim 217 |
| 218 | 996:Meat Grinder | 1 | 通用链 | 绞肉机=合成站+动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | vanilla-recipes; TileAnim 218 |
| 219 | 997:Extractinator | 1 | 通用链 | 提取器:右键投矿转换 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13819 |
| 220 | 998:Solidifier | 1 | 通用链 | 固化机=合成站+动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | vanilla-recipes; TileAnim 220 |
| 221 | 1104:Palladium Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 222 | 1105:Orichalcum Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 223 | 1106:Titanium Ore | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 224 | 1103:Slush Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 225 | 1129:Hive Wand | 1 | 通用链 | 蜂巢块(蜂巢魔杖放置) | ✅ | ✅ | Game.ts:12003 |
| 226 | 1101:Lihzahrd Brick | 1 | 通用链 | 蜥蜴砖:困难模式前镐免疫+电路 NotReallySolid 语义 | ✅ | ✅ | Game.ts:11233; Wiring.ts:624 |
| 227 | 1107:Teal Mushroom/1108:Green Mushroom/… | 8 | 通用链 | 染料植物:按帧掉对应染料 | ✅ | ✅ | Game.ts:11552 |
| 228 | 1120:Dye Vat | 1 | 通用链 | 染料缸=合成站+动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | vanilla-recipes; TileAnim 244/228 |
| 229 | 1125:Honey Block | 1 | 通用链 | 蜂蜜块:液体模拟 | ✅ | ✅ | LiquidSim.ts |
| 230 | 1127:Crispy Honey Block | 1 | 通用链 | 脆蜂蜜块:液体模拟 | ✅ | ✅ | LiquidSim.ts |
| 232 | 1150:Wooden Spike | 1 | 通用链 | 木尖刺 TouchDamage | ✅ | ✅ | env-hazards TouchDamage 表 |
| 234 | 1246:Crimsand Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 237 | 1292:Lihzahrd Altar | 1 | 通用链 | 蜥蜴祭坛:右键石巨人 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:14062 |
| 239 | 19:Gold Bar/20:Copper Bar/… | 23 | 通用链 | 矿石条放置(23 style,1.4.4 新功能) | ✅ | ⚠️ 挖掉掉 place_v_ 通用物品(原版按 style 掉真物品) | items.ts:1711 placeStyle 回填 |
| 240 | 1360:Eye of Cthulhu Trophy/1361:Eater of Worlds Trophy/… | 49 | 通用链 | 奖杯墙饰 49 件 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts:249 |
| 241 | 1417:Catacomb | 1 | 通用链 | 地下墓穴 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts |
| 242 | 1421:The Eye Sees the End/1422:Something Evil is Watching You/… | 40 | 通用链 | 大画 40 件 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts:258 |
| 243 | 1430:Imbuing Station | 1 | 通用链 | 灌注台=合成站+动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | vanilla-recipes; TileAnim 243 |
| 244 | 1449:Bubble Machine | 1 | 通用链 | 泡泡机:电线 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | devices.ts:777 |
| 245 | 1478:Trapped Ghost/1495:American Explosive/… | 14 | 通用链 | 中画 14 件 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts |
| 246 | 1908:Holly/4661:The Duplicity of Reflections/… | 4 | 通用链 | 小画 4 件 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts |
| 247 | 1551:Autohammer | 1 | 通用链 | 自动锤炼机=合成站+动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | vanilla-recipes; TileAnim 247 |
| 248 | 1589:Palladium Column | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 249 | 1591:Bubblegum Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 250 | 1593:Titanstone Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 251 | 1725:Pumpkin | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 252 | 1727:Hay | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 253 | 1729:Spooky Wood | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 254 | 1828:Pumpkin Seed | 1 | 通用链 | 南瓜株:种植✅生长未接(原版 GrowPumpkin) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | WorldGen.cs:72381 |
| 269 | 1989:Womannequin/3977:Hat Rack | 2 | 通用链 | 女模特(legacy) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts:567 |
| 270 | 1993:Firefly in a Bottle | 1 | 通用链 | 萤火虫瓶光 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | TileLightScanner case 270 |
| 271 | 2005:Lightning Bug in a Bottle | 1 | 通用链 | 闪电虫瓶光 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | TileLightScanner case 271 |
| 272 | 1344:Cog | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 273 | 2119:Stone Slab | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 274 | 2120:Sandstone Slab | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 282 | 250:Fish Bowl | 1 | 通用链 | 鱼缸动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | CritterCage.ts:170 |
| 283 | 2172:Heavy Assembler | 1 | 通用链 | 重型工作台=合成站 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | vanilla-recipes tile 283 |
| 284 | 2173:Copper Plating | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 287 | 2177:Ammo Box | 1 | 通用链 | 弹药箱:右键 AmmoBox buff | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13978 |
| 307 | 2203:Steampunk Boiler | 1 | 通用链 | 蒸汽锅炉=合成站+动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | vanilla-recipes; TileAnim 307 |
| 308 | 2204:Honey Dispenser | 1 | 通用链 | 蜂蜜分配机=合成站+动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | vanilla-recipes; TileAnim 308 |
| 315 | 2435:Coralstone Block | 1 | 通用链 | 珊瑚石块 | ✅ | ✅ | tiles.ts |
| 319 | 2490:Ship in a Bottle | 1 | 通用链 | 瓶中船 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts |
| 320 | 2496:Seaweed Planter | 1 | 通用链 | 海藻种植器 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts |
| 321 | 2503:Boreal Wood | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 322 | 2504:Palm Wood | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 325 | 2692:Tin Plating | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 326 | 2693:Waterfall Block | 1 | 通用链 | 瀑布块(动画未接⚠) | ✅ | ⚠️ 静态渲染,原版 8 帧滚动动画(Main.cs:18740-18790) | Main.cs:18740 |
| 327 | 2694:Lavafall Block | 1 | 通用链 | 岩浆瀑布块(动画未接⚠) | ✅ | ⚠️ 静态渲染,原版 8 帧滚动动画(Main.cs:18740-18790) | Main.cs:18750 |
| 328 | 2695:Confetti Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 329 | 2697:Midnight Confetti Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 330 | 71:Copper Coin | 1 | 通用链 | 铜币堆(放置) | ✅ | ✅ | tiles.ts:601 |
| 331 | 72:Silver Coin | 1 | 通用链 | 银币堆 | ✅ | ✅ | tiles.ts:602 |
| 332 | 73:Gold Coin | 1 | 通用链 | 金币堆 | ✅ | ✅ | tiles.ts:603 |
| 333 | 74:Platinum Coin | 1 | 通用链 | 铂币堆 | ✅ | ✅ | tiles.ts:362 |
| 335 | 2700:Fireworks Box | 1 | 通用链 | 烟花盒:电线发射 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | devices.ts:799 |
| 336 | 2701:Living Fire Block | 1 | 通用链 | 活火块光 | ✅ | ✅ | TileLightScanner case 336 |
| 337 | 2737:'Z' Statue | 1 | 通用链 | 字母雕像 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts |
| 338 | 2738:Firework Fountain | 1 | 通用链 | 烟花喷泉:电线 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | devices.ts:811 |
| 339 | 2741:Grasshopper Cage | 1 | 通用链 | 蚱蜢笼动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | CritterCage.ts |
| 345 | 2787:Honeyfall Block | 1 | 通用链 | 蜂蜜瀑布块(动画未接⚠) | ✅ | ⚠️ 静态渲染,原版 8 帧滚动动画(Main.cs:18740-18790) | Main.cs:18760 |
| 349 | 470:Mushroom Statue | 1 | 通用链 | 蘑菇雕像光 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | TileLightScanner/FLICKER |
| 350 | 2860:Martian Conduit Plating | 1 | 通用链 | 火星传导镀层光 | ✅ | ✅ | TileLightScanner case 350 |
| 351 | 2868:Smoke Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 353 | 2996:Vine Rope | 1 | 通用链 | 藤蔓绳(单绳通用放置) | ✅ | ✅ | Game.ts:13064(coil 965 才下延) |
| 354 | 2999:Bewitching Table | 1 | 通用链 | 巫惑 table:右键 Bewitched buff | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13977 |
| 357 | 3066:Smooth Marble Block | 1 | 通用链 | 光滑大理石块 | ✅ | ✅ | tiles.ts:201 |
| 365 | 3077:Silk Rope | 1 | 通用链 | 丝绸绳 | ✅ | ✅ | tiles.ts:625 |
| 366 | 3078:Web Rope | 1 | 通用链 | 蛛网绳 | ✅ | ✅ | tiles.ts:626 |
| 367 | 3081:Marble Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 368 | 3086:Granite Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 369 | 3087:Smooth Granite Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 370 | 3100:Meteorite Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 371 | 3113:Pink Slime Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 372 | 3117:Peace Candle | 1 | 通用链 | 和平蜡烛:刷怪率降+光 | ✅ | ✅ | Game.ts:4985 |
| 373 | 3182:Magic Water Dropper | 1 | 通用链 | 魔法水滴器:滴 liquid | ✅ | ✅ | NatureParticles.ts:456 |
| 374 | 3184:Magic Lava Dropper | 1 | 通用链 | 魔法岩浆滴器 | ✅ | ✅ | NatureParticles.ts:458 |
| 375 | 3185:Magic Honey Dropper | 1 | 通用链 | 魔法蜂蜜滴器 | ✅ | ✅ | NatureParticles.ts:459 |
| 376 | 2334:Wooden Crate/2335:Iron Crate/… | 8 | 通用链 | 钓鱼箱族 8 件 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts |
| 377 | 3198:Sharpening Station | 1 | 通用链 | 磨刀站:右键 Sharpened | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13978 |
| 379 | 3214:Bubble | 1 | 通用链 | 泡泡:液体容纳+NotReallySolid | ✅ | ✅ | LiquidSim.ts:1393/:1475; Wiring.ts:629 |
| 380 | 3222:Fireblossom Planter Box | 1 | 通用链 | 种植箱(实心可种药草) | ✅ | ✅ | Main.cs:9570 |
| 383 | 3360:Living Mahogany Wand | 1 | 通用链 | 活木魔杖(放置) | ✅ | ✅ | tiles.ts |
| 384 | 3361:Rich Mahogany Leaf Wand | 1 | 通用链 | decor(原版同款无功能) | ✅ | ✅ | Game.ts:12848(通用放置链) |
| 385 | 3234:Crystal Block | 1 | 通用链 | 水晶块 | ✅ | ✅ | tiles.ts |
| 387 | 3239:Trap Door | 1 | 通用链 | 活板门:电线开合+NotReallySolid | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | devices.ts:823; Wiring.ts:630 |
| 388 | 3240:Tall Gate | 1 | 通用链 | 高门:电线/自动开关 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Door.ts; Wiring.ts |
| 390 | 3253:Lava Lamp | 1 | 通用链 | 熔岩灯光 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts defLight |
| 395 | 3270:Item Frame | 1 | 通用链 | 物品框:TE 挂物 | ✅ | ✅ | FurnitureItems.ts:70 |
| 396 | 3271:Sandstone Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 397 | 3272:Hardened Sand Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 398 | 3274:Hardened Ebonsand Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 399 | 3275:Hardened Crimsand Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 400 | 3276:Ebonsandstone Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 401 | 3277:Crimsandstone Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 402 | 3338:Hardened Pearlsand Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 403 | 3339:Pearlsandstone Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 404 | 3347:Desert Fossil | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 405 | 3364:Fireplace | 1 | 通用链 | 壁炉光(熄/燃帧) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | TileLightScanner case 405 |
| 406 | 3365:Chimney | 1 | 通用链 | 烟囱 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts |
| 407 | 3380:Sturdy Fossil | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 408 | 3460:Luminite | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 409 | 3461:Luminite Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 410 | 3536:Vortex Monolith/3537:Nebula Monolith/… | 4 | 通用链 | 天塔柱 4 件:电线切环境 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | devices.ts:238/:319 |
| 411 | 3545:Detonator | 1 | 通用链 | 引爆器:右键/电线全图起爆 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13992; Wiring.ts:162 |
| 412 | 3549:Ancient Manipulator | 1 | 通用链 | 远古操纵机=合成站 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | vanilla-recipes tile 412 |
| 413 | 3565:Red Squirrel Cage | 1 | 通用链 | 红松鼠笼动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | CritterCage.ts |
| 414 | 3566:Gold Squirrel Cage | 1 | 通用链 | 金松鼠笼动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | CritterCage.ts |
| 419 | 3602:Logic Gate Lamp (Off)/3618:Logic Gate Lamp (On)/… | 3 | 通用链 | 逻辑门灯:电线翻转+入队 | ✅ | ⚠️ 挖掉掉 place_v_ 通用物品(原版按 style 掉真物品) | Wiring.ts:395/:561 |
| 420 | 3608:Logic Gate (XNOR) | 1 | 通用链 | 逻辑门 XNOR:六门+故障灯 | ✅ | ✅ | Wiring.ts:504-596 |
| 421 | 3609:Conveyor Belt (Clockwise) | 1 | 通用链 | 传送带 CW:电线反向互换+实体输送 | ✅ | ✅ | devices.ts:863; physics/Conveyor.ts |
| 422 | 3610:Conveyor Belt (Counter Clockwise) | 1 | 通用链 | 传送带 CCW:同上 | ✅ | ✅ | devices.ts:863 |
| 423 | 3615:Logic Sensor (Player Above)/3729:Liquid Sensor (Any) | 2 | 通用链 | 逻辑传感器(玩家上方/液体):电线 | ✅ | ⚠️ 挖掉掉 place_v_ 通用物品(原版按 style 掉真物品) | Wiring.ts:209 |
| 424 | 3616:Junction Box | 1 | 通用链 | 接线盒:导线交叉不相连 | ✅ | ✅ | Wiring.ts:340-342 |
| 426 | 3621:Red Team Block | 1 | 通用链 | 红队块(PvP) | ✅ | ✅ | tiles.ts:728-732 |
| 427 | 3622:Red Team Platform | 1 | 通用链 | 红队平台 | ✅ | ✅ | tiles.ts |
| 428 | 3626:Pink Weighted Pressure Plate/3630:Orange Weighted Pressure Plate/… | 4 | 通用链 | 配重压板 4 色:电线 | ✅ | ⚠️ 挖掉掉 place_v_ 通用物品(原版按 style 掉真物品) | Wiring.ts:209 |
| 429 | 3629:Wire Bulb | 1 | 通用链 | 导线灯泡:线色位段动态光 | ✅ | ✅ | TileLightScanner.ts:186 |
| 440 | 3650:Amber Gem Lock | 1 | 通用链 | 宝石锁:电线(嵌 gem 触发) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Wiring.ts:213 |
| 441 | 3706:ItemName.Fake_newchest2 | 1 | 通用链 | 陷阱箱:电线+箱联动 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:18091; Wiring |
| 442 | 3707:Teal Pressure Pad | 1 | 通用链 | 青绿压板:电线 | ✅ | ✅ | Wiring.ts:209 |
| 443 | 3722:Geyser | 1 | 通用链 | 间歇泉:电线喷水 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Wiring.ts:222 |
| 445 | 3725:Pixel Box | 1 | 通用链 | 像素盒 | ✅ | ✅ | tiles.ts |
| 452 | 3742:Silly Balloon Machine | 1 | 通用链 | 气球机:电线 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | devices.ts:888 |
| 453 | 3745:Silly Tied Balloon (Green) | 1 | 通用链 | 系留气球 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts |
| 454 | 3746:Pigronata | 1 | 通用链 | 皮格罗纳塔 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts |
| 455 | 3747:Party Center | 1 | 通用链 | 派对中心:右键/电线开派对 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | party.ts:2; Game.ts:2180 |
| 456 | 3748:Silly Tied Bundle of Balloons | 1 | 通用链 | 气球束 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts |
| 457 | 3749:Party Present | 1 | 通用链 | 派对礼物 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts |
| 458 | 3754:Sandfall Block | 1 | 通用链 | 沙瀑块(动画未接⚠) | ✅ | ⚠️ 静态渲染,原版 8 帧滚动动画(Main.cs:18740-18790) | Main.cs:18770 |
| 459 | 3755:Snowfall Block | 1 | 通用链 | 雪瀑块(动画未接⚠) | ✅ | ⚠️ 静态渲染,原版 8 帧滚动动画(Main.cs:18740-18790) | Main.cs:18780 |
| 460 | 3756:Snow Cloud | 1 | 通用链 | 雪云块 | ✅ | ✅ | tiles.ts |
| 461 | 3782:Magic Sand Dropper | 1 | 通用链 | 魔法沙滴器 | ✅ | ✅ | NatureParticles.ts:460 |
| 462 | 3795:Desert Spirit Lamp | 1 | 通用链 | 沙漠精灵灯光 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts defLight |
| 463 | 3813:Defender's Forge | 1 | 通用链 | 防御者熔炉=bank3 存储+光 | ✅ | ✅ | Game.ts:640 |
| 464 | 3814:War Table | 1 | 通用链 | 战争桌:右键 WarTable buff | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13978 |
| 465 | 3815:War Table Banner | 1 | 通用链 | 战争桌旗帜 decor | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts |
| 466 | 3816:Eternia Crystal Stand | 1 | 通用链 | 永恒水晶座:右键 DD2 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:14065 |
| 467 | 3884:Crystal Chest/3885:Golden Chest/… | 5 | 通用链 | 二类箱 5 件:箱登记+电线陷阱 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13205; Wiring.ts:243 |
| 468 | 3886:Trapped Crystal Chest/3887:Trapped Golden Chest/… | 4 | 通用链 | 陷阱二类箱 4 件 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Wiring.ts:243 |
| 469 | 3920:Crystal Table/3948:Spider Table/… | 3 | 通用链 | 二类桌 3 件(桌面族) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | tiles.ts:934 |
| 471 | 2699:Weapon Rack | 1 | 通用链 | 武器架:TE 挂物 | ✅ | ✅ | FurnitureItems.ts:71 |
| 472 | 3951:Iron Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 473 | 3953:Lead Brick | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 474 | 3955:Lesion Block | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 476 | 4040:Golf Cup | 1 | 通用链 | 高尔夫球洞:电线进洞信号 | ✅ | ✅ | Wiring.ts:209 |
| 491 | 4076:Void Vault | 1 | 通用链 | 虚空库=bank4 存储+光 | ✅ | ✅ | Game.ts:640 |
| 494 | 4089:Golf Tee | 1 | 通用链 | 高尔夫球座:右键置球 | ✅ | ✅ | Game.ts:13967 |
| 505 | 4275:Gold Fish Bowl | 1 | 通用链 | 金鱼缸动画 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | CritterCage.ts:171 |
| 506 | 4276:Bast Statue | 1 | 通用链 | 巴斯雕像:防御 aura | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:4984 |
| 510 | 4319:Arrow Sign | 1 | 通用链 | 箭头标牌:右键编辑 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13353 |
| 511 | 4320:Painted Arrow Sign | 1 | 通用链 | 彩绘箭头标牌 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13353 |
| 552 | 4460:Sandcastle Bucket | 1 | 通用链 | 沙堡桶(FlexibleTileWand 族) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:12854 |
| 572 | 4700:Soul of Fright in a Bottle | 1 | 通用链 | 瓶中魂光 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | TileLightScanner case 572 |
| 573 | 4710:Tattered Wood Sign | 1 | 通用链 | 破木标牌:右键编辑 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:11882 |
| 579 | 4761:Rock Golem Head | 1 | 通用链 | 石魔像头 decor | ✅ | ⚠️ 顶部随机草/南瓜生长未接(原版 UpdateWorld :72381/:72386) | tiles.ts |
| 621 | 3750:Slice of Cake | 1 | 通用链 | 蛋糕:右键 SugarRush | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13979 |
| 633 | 5214:Ash Grass Seeds | 1 | 通用链 | 实心块/矿(通用挖掘链) | ✅ | ✅ | Game.ts:11025(挖掘表); items.ts:1690(回填) |
| 642 | 5296:Chlorophyte Extractinator | 1 | 通用链 | 叶绿提取器:右键 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13820 |
| 654 | 5327:TNT Barrel | 1 | 通用链 | TNT 桶:挖爆语义待核(原版 CheckTile 654=break) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | WorldGen.cs:86427 |
| 663 | 5381:Enchanted Moondial | 1 | 通用链 | 魔晷:右键快进到黄昏 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Game.ts:13953-13962 |
| 664 | 5383:Bouncy Boulder | 1 | 通用链 | 弹力巨石(电线/失撑) | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Wiring.ts:42 BOULDER_SHEETS |
| 665 | 5384:Life Crystal Boulder | 1 | 通用链 | 生命水晶巨石 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Wiring.ts:42 |
| 711 | 5514:Rainbow Boulder | 1 | 通用链 | 彩虹巨石+光 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Wiring.ts:42; TileLightScanner |
| 712 | 5516:Poo Boulder | 1 | 通用链 | 便便巨石 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Wiring.ts:42 |
| 713 | 5520:Lava Boulder | 1 | 通用链 | 岩浆巨石 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Wiring.ts:42 |
| 714 | 5521:Spider Boulder | 1 | 通用链 | 蜘蛛巨石 | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Wiring.ts:42 |
| 715 | 5522:Ghoulder | 1 | 通用链 | Ghoulder | ✅ | ⚠️ 多格 drop:null=挖掉无掉落(原版掉对应物品;1×1 有 place_ 兜底,多格漏) | Wiring.ts:42 |
| 717 | 5569:Lava Cloud | 1 | 通用链 | 岩浆云光 | ✅ | ✅ | TileLightScanner case 717 |
| 718 | 5570:Star Cloud | 1 | 通用链 | 星星云光 | ✅ | ✅ | TileLightScanner case 718 |
| 719 | 5571:Rainbow Cloud | 1 | 通用链 | 彩虹云光 | ✅ | ✅ | TileLightScanner case 719 |
## 四、统计与修复要点

| 结论 | 族数 | 物品数 | 说明 |
|---|---|---|---|
| ✅ | 198 | 224 | 贴图✅ 放置✅ 功能✅（块/矿 130+ 族=通用挖掘链；光源/合成站/电路/交互/存储逐族核对通过；decor 族=原版同款无功能） |
| ⚠️ | 127 | 622 | 三大系统性：⚠️1 多格破坏无返还 99 族 338 件；⚠️2 style 掉落不还原 21 族 289 件（15 多格 style0 + 6 个 1×1 place_ 版，与 ⚠️1 有交叠）；⚠️3 杂项 8 族 |
| ❌ | 2 件（2 族） | 2 | 帽架 3977 / 女模特 1989 createTile 陈旧值 |
| 合计 | 325 | 846 | 加首轮 26 族 194 件 = createTile 全量 1040 件清账 |

> 注：⚠️1/⚠️2 有交叠（多格 drop:null 且多 style 的族同属两栏），族数按"⚠️ 标记行"计 127。

### ❌ 修复要点（按优先序）
1. **items.ts 补 2 行**（❌1/❌2，5 分钟）：`vi_1989` → tile 'v_470_mannequins' + placeStyle 2；
   `vi_3977` → tile 'v_475_hat_rack'（样板 = :886 vi_498）。
2. **Game.ts:11856 多格分支补 place_ 兜底**（⚠️1，一行 + 注）：`def.drop===null` 时与 1×1 路径
   对齐掉 `place_ + def.key`；⚠️2 的 style 表可后续按 GetItemDrop_* 全 23 函数逐族扩
   （Game.ts:11863 八音盒样板，表键 = Math.floor(frame/步长)）。
3. **巨石失撑链**（⚠️3）：checkFurnitureSupport（Game.ts:22157）对 BOULDER_SHEETS 放行 +
   整件清除 + shootProjectile('boulder')（复用 devices.ts:928 boulderFall 数据点）。
4. **瀑布族动画**（⚠️3）：TILE_ANIM_RATE 补 326(rate5)/327/345/458/459(rate10)，8 帧回卷
   （Main.cs:18740-18790）；ChunkCache 已有 tileAnim 通道。
5. 陶罐/南瓜株顶部草生长（⚠️3）：WorldEvolution 补 case 78/380/579（PlaceTile(3) 随机）
   与 254（GrowPumpkin :52522）。
6. 座钟授时（⚠️3）：沿用首轮 :1650 登记，未动。

### 与首轮/其他补审计批的边界
- 首轮 26 功能族（火把/工作台/箱/床/电路族…）不重复；但 ⚠️1 的"破坏无返还"与 ⚠️2 的"style
  掉落"对已覆盖族同样成立（水晶球 125/日晷 356/炼药桌 355/假人 378 drop:null；床 79/平台 19/
  工作台 18 style0），已在 ⚠️1/⚠️2 注明，修一处全量受益。
- 弹药/涂料/散件消耗品 = 补 B 批；buffType/other = 补 C 批。
- createWall 124 件不在本批（放置物=tile 口径）。
