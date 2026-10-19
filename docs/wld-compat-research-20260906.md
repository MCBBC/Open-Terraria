# 原版 .wld 双向兼容研究报告(2026-09-06)

目标:①我们导出的 .wld **原版 1.4.5.7/1.4.5.8 可直接加载游玩**;②原版 .wld 导入后**全字段保真**(再导出不漂移)。真值源=Terarria1457/Terraria.IO/WorldFile.cs(反编译,逐段亲读)。

## 一、原版格式的硬约束(已核实)

1. **section 位置字节级断言**:LoadWorld_Version2 每段读完做 `Position != positions[i] → BadSectionPointer` 拒载。任何一段多/少 1 字节=整文件拒载(**好消息:失败模式是明确拒绝,不会静默坏档**)。
2. **footer 校验**(LoadFooter :3003):`bool true + worldName + worldId` 三项与 header 一致,不符=BadFooter。
3. **版本门**:>325=LaterVersion 拒(1.4.5.8=326 同构可放);<87 走 V1 旧读(不支持,概率≈0)。
4. FileFormatHeader:325 + 7B 'relogic' + byte fileType(2=World) + u32 revision + u64 fav + i16 段数(11)+ i32×11 指针 + u16 TileID.Count(**754**)+ tileFrameImportant 位图(754 位 LSB-first)。
5. 11 段序:FFH/header/tiles/chests/signs/npcs/TileEntities/pressurePlates/townManager/bestiary/creativePowers + footer。指针=各段尾=下段起点。

## 二、方向 A:导出 → 原版可加载(现状=自足版,缺口清单)

### A1. header flags 段(最大头,~230 字段,现自足版只写 ~120 项)

本仓 WldExport 现写序=本仓读侧消费序,**与原版读序的逐字段差异**需台账化。已知缺口(原版有、自足版没写/写法待核):

| 块 | 内容 | 备注 |
|---|---|---|
| anglerWhoFinishedToday | i32 n + n×string | 可写空 |
| TempPartyCelebratingNPCs | i32 n + n×i32 | 可写空 |
| DD2Event.Save | 4 bool 之外**还有 cachedDownedT1..3 等待核**(DD2Event.cs Save 全文待抄) | |
| WorldGen.TreeTops.Save | i32 13 + 13×i32?(**与自足版写的"任意 n"不同,原版恒 13**) | |
| WorldGen.Manifest.Serialize() | **1.4.4+ 世界清单(varint 长度+串)**——内容与 tileFrameImportant/tile 索引关联,待专项研究 | 高风险新面 |
| ExtraSpawnPointManager.Write | u8 n + n×(i16,i16) | 可写空 |
| Main.fastForwardTimeToDusk/moondialCooldown/vampireSeed/infectedSeed/dualDungeons/moreLightning/noLightning/teamBasedSpawnsSeed/_tempMeteorShowerCount/_tempCoinRain | 已写 ✓ | |
| tileFrameImportant 位图 | 必须与原版 TileID.Sets.Main.tileFrameImportant 逐位一致 | **用 rig dump 原版数组做金标**,不能只信 vanilla.json.framed |

### A2. TileEntities(现只写挂物族)

TE 全 10 类(RegisterAll 序):0 假人(short npc)/1 物品框(short,byte,short)/2 逻辑传感器(byte+bool)/3 模特(位图×2+pose+misc+三元组)/4 武器架(三元组)/5 帽架(位图+三元组×N)/6 食物盘(三元组)/7 晶塔(无)/8 展示罐(三元组)/9 风筝桩/10 小动物桩(无)。
本仓 SaveData.furniture 只有 8 kind(无假人/传感器/晶塔)。**缺口:晶塔(玩法面:原版晶塔网络)与假人/传感器**。TE 的 ID 字段原版读后重编号,写 0 即可。

### A3. 其余段(自足版已 1:1,复用)

tiles(RLE 列主序)/chests/signs/npcs(shimmered 表+镇 NPC+SavesAndLoads 尾表)/footer ✓。npcs 尾表=SavesAndLoads 集(非镇持久 NPC,集合需从 NPCID.Sets 提取,可写空首版)。

### A4. 物品/NPC id 映射

- tile:存档 TILE_STABLE_OF_INTERNAL → netId(TILE_INTERNAL_OF_STABLE)✓ 已接;**place_v 派生件无 netId → 导出为空气(导出前清单功能)**
- 物品:ITEM_INTERNAL_OF_STABLE ✓;同缺口
- NPC:内部 id=原版 netId ✓

### A5. 装饰/伴档

- .map 迷你地图伴档:原版无 .map=全图重探(可接受,不阻塞)
- 世界加载后原版**不重算地形** ✓

## 三、方向 B:原版 → 导入保真(现状缺口)

| 缺口 | 影响 | 修法 |
|---|---|---|
| header 数值域部分"读了即弃":oreTiers 四档/sandstorm 四元组/anglerQuest+anglerWhoFinishedToday/cultistDelay/invasionX(已修 f64)/TempPartyCelebratingNPCs/shadowOrbCount(有)/moondialCooldown(有) | 肉后矿层/沙暴/渔夫进度漂移 | SaveData 扩容(见 D) |
| Bestiary 三桶(Kills/Sights/Chats,各 int n+n×(persistentId string+int)) | 导入后图鉴空 | WldParser 读+SaveData.bestiary 对齐 persistentId 键 |
| TownManager(i32 n+n×(i32 npcId,i16 x,i16 y) 房间表) | NPC 分房重算(轻微) | 读+落档 |
| CreativePowers per-world(id 0/8/9/10/12/13:toggle=bool/slider=float) | 旅程世界设置重置 | 读+落档(注册序 0-14 固定) |
| TE 7 晶塔/0 假人/2 传感器/9/10 桩 | 晶塔网络丢失(玩法面) | SaveData.furniture 扩 kind 或新段 |
| tileActive 幽灵位/涂层/油漆/导线 | 已覆盖 ✓ | — |

## 四、数据模型决策(关键架构选择)

**推荐:SaveData 新增 `wldSnap` 快照段**(存档版本 bump v6):
- 导入原版档时,把 header 段**全部字段原值**(含本仓暂不建模的)收进 `wldSnap: Record<string, number|boolean|string>`(键=台账字段名)
- 导出时:有 wldSnap 的世界**逐字段回写快照值**(零漂移);自建世界走默认值+建模字段
- 优点:避免"逐字段补 SaveData 建模"的无限追平;新增原版字段自动进快照
- 代价:存档体积 +~1KB/世界(可忽略)

## 五、验证金字塔(每层都过才算成)

1. **往返闭环**:exportWld→parseWldToSave 全字段断言(现有测试扩全量)
2. **TEdit 第三方仲裁**:项目根有 Terraria-Map-Editor——用 TEdit 打开我们导出的 .wld(它对格式极挑剔,能开=强证据)+ 对拍 tile/chest 直方图
3. **原版 rig 实机**(终极真值):1457 rig(TS37.exe)实测 LoadWorld:导出档丢进 Players 同级 Worlds 目录加载+进游戏;方向 B 用原版存档导入后逐 flags 对拍
4. **tileFrameImportant 金标**:rig dump 原版 bool[754] vs vanilla.json.framed 逐位对拍(不一致=以 rig 为准修表)

## 六、分阶段计划

| 阶段 | 内容 | 估算 |
|---|---|---|
| P0 字段台账 | 脚本从 WorldFile.cs LoadHeader/SaveWorldFlags 提取全字段表(machine-readable JSON:名/类型/版本门/映射键) | 0.5 批 |
| P1 SaveData v6 | wldSnap 快照通道+导入侧全字段捕获(WldParser 补 manifest/TreeTops/DD2 全读) | 1 批 |
| P2 WldExport 全量 | header 230 字段+Manifest.Serialize 专项+TE 全 10 类+Bestiary/TownManager/powers 写侧 | 1.5-2 批 |
| P3 验证塔 | 闭环→TEdit→rig 双向实机;tileFrameImportant 金标 | 1 批 |
| 合计 | | **3.5-4.5 个批次** |

## 七、风险清单

1. Manifest.Serialize(1.4.4+):内容/作用待专项(可能与 tileFrameImportant+项目版本挂钩)——**唯一可能反向阻塞的未知面**
2. rig 为 x86_64(SW_MB_1457 门),实机验证需 ARM 转译环境(现有 rig 流程可复用)
3. 原版对非法 tile 液位/墙 id 的钳制行为(读侧已见 wall≥367 归 0)——导出侧要预钳
4. frameImportant 与 tile 帧数据的一致性:本仓帧表若与原版 tileFrameImportant 冲突,原版渲染错帧(不影响加载,影响观感)
5. tests/_ 前缀文件会被清理:验证脚本用 zz- 前缀
