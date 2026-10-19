# 存档对齐账本（原版 .wld/.plr ↔ SaveData）

对照:Terraria.IO/WorldFile.cs(1.4.5.6,v319)+ Player.cs Serialize(PL:53802-53982)。
2026-08-12 全量对账。**每条修复/缺口都有原版行号。**

## 已对齐(2026-08-12 本批)

| 项 | 原版 | 本仓 | 状态 |
|---|---|---|---|
| 城镇 NPC 段 | WF:1703-1750 | SaveData.npcs(曾三重断链:serializeSave 硬编码[]/saveGame 不传参/loadSaveData 不读) | ✅ serialize/SaveFile/loadSaveData/WorldPacket 四端打通 |
| **worker 读档字段黑洞** | — | packWorld/fromPacket 曾丢 invasion/altarCount/weather/bestiary(读档全失效) | ✅ WorldPacket 补六字段 |
| 玩家 Buffs | PL:53913-53925(44槽) | player.buffs=[vanillaBuffId,秒],Main.buffNoSave(Main.cs:8896-8990)过滤 | ✅ BuffState.toSave/applySaved |
| 血月/日食/月相 | WF:1276-1278 | clock.bloodMoon/eclipse/moonPhase(曾注释"运行时态不进存档"——原版进) | ✅ |
| moonType | WF:1252 | header.moonType→SkyRenderer.moonType;wld 导入接线(WldParser:121 曾丢弃) | ✅ |
| 派对 | WF:1361-1368 | events.partyManual(ManualParty;genuine/庆祝名单依赖未实装) | ✅ 部分 |
| 灯笼夜 | WF:1381-1384 | events.lanternManual/Genuine/Next/Cooldown | ✅ |
| 税务员税款 | PL:53839 | player.taxMoney(曾仅运行时) | ✅ |
| PVE 死亡计数 | PL:53840 | player.deathsPve(死亡点 Game.ts 计数) | ✅ |
| 金箱锁 | (原版不存,由帧派生) | chests[].locked(本仓锁是运行时态→入档) | ✅ |
| 史莱姆王击败键 | NPC.downedSlimeKing | 击败写 downed_50;天气钩子读点回退 downed_50 | ✅ 读点回退 |
| wld 导入 header | WF:1252/1276-1278 | moonType/bloodMoon/eclipse/moonPhase 捕获 | ✅ |

## 已对齐(此前已有,对账核实)

tiles(含帧/液/线/半砖坡面)、chests+items、signs、invasion 五元组(WF:1306-1339)、
altarCount(WF:1303)、weather(WF:1312-1372)、bestiary 三桶(WF:3397-3411)、
boss downed 族(downed_<vanillaId> 通用键+入侵胜利键+downedOldOnesArmyT1-3+downedTower*)、
saved NPC 六键(savedGoblin/Wizard/Mech/Stylist/TaxCollector/Golfer)、shadowOrbSmashed、
挂物族六类(TileEntity 段最小等价)、armor/dye/misc/loadout/banks/trash/favorited/prefix、
playTimeMs、床出生点(world.spawn 入 header)。

**bannerSystem killCount（SW-BJ47 2026-09-09 自「待补」表核销——持久面 2026-09-03 已落,台账行漏销）**：
WF:1347 `BannerSystem.Save` 写/:2210 Load 读 ↔ 本仓 SaveData.bannerKills（serialize.ts/SaveFile
双构建器+loadSaveData 回填,WldParser banner 段→WldImport 同缝）。消费面 = Tally Counter 计数行
+ 旗授权。活证：tests/banner-kills-save（存读回环/旧档缺段/wld 段解码）+ SW-BJ47 实机探针
saveGame 写入 `{"8":1,"87":12}` 读档回填。

## 待补(依赖系统未实装) → **SW-FX11 逐项定谳核销(2026-09-10)**

对盘核查+补刀结果(1457 行号锚;测试=tests/sw-fx11-save-parity.test.ts):

### ✅ 此前批次已闭合(本批对盘复核,勿重复动刀)

| 项 | 1457 锚 | 本仓闭环 |
|---|---|---|
| savedAngler/anglerQuest/anglerWhoFinishedToday | WF:1334-1338/:2159-2173 | BJ45:SaveData.angler 全链+flags.savedAngler 写点 Game.ts:6926+ |
| bannerSystem killCount | WF:1347/:2210 | BJ47:bannerKills 全链(活证 tests/banner-kills-save) |
| savedBartender | WF:1379 | flags.savedBartender(Game.ts:6975 解救写点);wld 导入 WldParser:397/导出台账 :171 |
| hardMode 写点 | WF:1310 | flags.hardMode(HardmodePass.ts:596 StartHardmode);wld 双通道 |
| SavedOreTiers 钴/秘银/精金 | WF:1321-1323 | savedOreTiers 全链+写点 Game.ts:18325(砸祭坛) |
| boughtCat/Dog/Bunny | WF:1398-1400 | flags 三键(Game.ts:13905-13907 证照使用);wld 双通道 |
| unlocked*Spawn 15 键 | WF:1404-1421 | flags 同键;写点 Game.ts:32042-32046 HasArrived 链+史莱姆五写点 |
| extraAccessory(恶魔心) | PL:55430 | permanentUpgrades.extraAccessory(写点 Game.ts:13720;读 mainFlow:529) |
| 永久消耗品 6 件 | PL:55435-55440 | permanentUpgrades.used*(写点 Game.ts:13724-13728/13344) |
| dead+respawnTimer | PL:55558-55562 | player.dead/respawnTimer(存 SaveFile:114-115;读 mainFlow:582-583) |
| anglerQuestsFinished | PL:55548 | 写点 Game.ts:34069;读 mainFlow:584;消费 :6094/:32755 |
| 派对 genuine/cooldown | WF:1363-1364 | events.partyGenuine/partyCooldown(Game.ts:40264/40283) |
| cultistDelay | WF:1340/:2192 | world.cultistDelay(RuntimeEvents.ts:122-144;wld 导入 :869) |
| sundial+moondial | WF:1311/:1416-1417 | 四件套全链(写点 Game.ts:24772-24774/26393-26395) |
| GameMode/难度 | WF:1240 | header.difficulty(创建 UI→生成;wld gameMode;旧档槽位回填 mainFlow:668) |
| 秘密种子 9 旗 | WF:1242-1250 | header.seedFlags(SeedEasterEggs 9 位;wld 导入合流 :837-842) |
| caveBack 样式/背景变体 17 项 | WF:1266-1331 | header.bgStyles 17 键全链(R16-5+P0-2);caveBackX 见备案② |
| CreativePowers(Journey) | WF:3427-3436 | 世界 6 权力(CreativePowers.cs:866/1007/1448/1482/1516/1550)+玩家 3 权力(:695/:734/:1584)全等建模 |
| savedOreTiers 肉前四档+oreTiersPH | WF:1394-1397 | SaveData.oreTiersPH 持久面(本批补 wld 导入/导出,见下) |

### 🔧 本批补刀(SW-FX11)

| 项 | 1457 锚 | 缺口定谳 → 补齐 |
|---|---|---|
| **combatBook/peddlersSatchel** | WF:1386/:1413-1414 | **双域键名断裂**:wld 面落 {combatBook,combatBook2,peddler},运行时消费/写点用 {combatBookWasUsed,combatBookVolumeTwoWasUsed,peddlersSatchelUsed}(Game.ts:38711/:15562/:13674/:35811)——导入书已用世界=进度门/旅商股票丢失,自建用书世界导出=真值丢失。归一到运行时键(WldParser+台账 getters) |
| **vampireSeed/infectedSeed** | WF:1426-1427 | **落错域**:wld 面落 flags.vampire/infected(全仓零消费),消费面读 seedFlags.vampireSeed/infectedSeed(SeedFlags 注册码,Player.ts:8384/SceneMetrics.ts:346/Game.ts:28853/mainFlow:218/UI.ts:4534)——导入种子世界=种子特性全失效。归一到 seedFlags 域 |
| **oreTiersPH wld 面** | WF:1394-1397 | WldParser 读位即弃(:436 void)+台账导出恒 7/6/9/8——醉酒世界 166/167/168/169 替代矿导入/导出双丢(军火商钨弹门 Game.ts:34531)。双向接通 |
| **savedOreTiers wld 导出** | WF:1321-1323 | 台账 getters 恒 -1——自建砸祭坛掷定档位导出即丢。改读 save.savedOreTiers |
| **天界塔 NPC 位置** | WF:1744-1755/:2937-2955 | **整缺**:SavesAndLoads 段(NPCID.cs:4807 CreateBoolSet(422,507,517,493)=仅四塔)从未持久——读档/导入后天界入侵中途档塔实体消失,updateLunarApocalypse 首帧全灭塔旗,四塔齐无 398 时**误启 ImpendingDoom 倒计时**(账本旧注「现 flags 重生成」为不实描述,盘上无重生成路径)。补:SaveData.pillarNpcs 段+Game 实体扫描/afterWorldLoad 原位重生成+respawnMissingTowers 兜底(旧档无段时按 trigger 同款算式补活动塔)+wld 导入/导出真值 |
| **按压压力板** | WF:3374-3386/:3388-3398 | **整缺**。原版语义=存档点被踩住的压力板格,读档首拍逐位 PokeLocation→Wiring.HitSwitch **一次性重触发**后清空(PressurePlateHelper.cs:19-31/:156-164)——存档点恰站压力板时接线机关重载应响一次。补:SaveData.pressurePlates+Game.plateLatch 快照/afterWorldLoad 一次性重触发(含 blockPlayerTeleportationForOneIteration)+wld 双通道 |
| **chest name** | WF:1660 | **持久面整缺**:ChestData 无 name 字段;WldParser:510 已读但 WldImport:754 丢弃,导出恒 ''。补:SaveData.chests[].name+ChestData.name+四端透传+UI 回显(vinvUpdateChestName 命名支 1:1 Main.cs:102-180);**重命名输入 UI 仍=债**(UI.ts:7418 ID5) |
| **ShimmeredTownNPCs** | WF:1712-1720/:2899-2906 | wld 面:解析读位即弃(:550-552)+导出恒 i32(0)——微光城镇化导入变体丢失/导出丢真值。SaveData 面已通(npcs[].shimmered)。补:解析捕获名单+导入映射 spriteId∈名单+导出写真值 |

### 📋 备案(有理由不动刀)

| 项 | 1457 锚 | 备案理由 |
|---|---|---|
| ① TempPartyCelebratingNPCs 庆祝名单 | WF:1365-1368 | 原版该列表**全仓无消费者**:仅派对开场公告播报用(BirthdayParty.cs:128-139)+结束时 Clear(:47/:107),读档后无任何读点(NPC.cs/WorldGen.cs grep 实证)——持久与否零可观测差。本仓 partyState.celebratingNpcs 运行时面已有 |
| ② caveBackX[0..2] | WF:1269-1271 | 保存面已随 wldSnap 快照零漂移(导入原版档);自建世界=BiomeBackground.ts:635 渲染近似(0.22/0.42/0.65),1:1 需接 WorldGen.cs:8146-8159 掷流——**渲染域债非存档域债**,挂渲染台账 |
| ③ teamBasedSpawnsSeed | WF:1430 | flags 域持久已通;消费面本仓未建模(Renderer.ts:16669 恒画/TeleportPylons.ts:279 单人恒揭示,与原版单人语义一致)——联机域,非存档债 |

## 近似(有意偏离)

| 项 | 说明 |
|---|---|
| dayCount 持久化 | 原版**不存** dayCount(WF header 无此字段)——本仓存(斜眼自增源),保留 |
| explored 战争迷雾不存档 | 原版无迷雾;本仓读档全零=与原版语义一致(生成即全知) |
| projectile/召唤物零持久化 | 与原版一致(PL/WF 均不存弹幕) |
| 塔盾值/月总倒计时/南瓜霜月进行态 | 原版亦不存(WF 只存 flags);读档重置 |
| playTimeMs 传参为本次会话时长 | mainFlow:564 传 Date.now()-playStart;WorldStore 累计侧另有记账 |
