# 地牢陈设审计移交单（2026-08-13 19:15，会话 1fc2b821 → DungeonPass 拥有会话）

用户报告（debug-report-崭新的爪钩海滨-2026-08-13T10-11，seed 12345）四症状的处置状态。
所有结论均有原版行号背书 + 进程内审计探针（tests/_dungeon-furnish-audit*.test.ts，可复跑）。

## 已修复（本会话落地）

| 症状 | 根因 | 修复 |
|---|---|---|
| ④ 灯/开关配套但没电线 | `dgSwitch` 只放开关，漏原版 `Lights_GenerateSwitch`（DungeonGlobalLights.cs:159-194）两件事：L 形红线逐格铺（:173-185）+ 2/3 灯初始灭档 frameX=18（:186-190） | DungeonPass.ts dgSwitch 补齐（红线 bit0，开关格含、灯格不含；灭档绝对写 frameX=18，吊灯中心列 27-29 无分页时=原版同款无操作，照抄未"修"）。审计：接线 0/16 → **9/9**，灭档 8 盏，红线 369→712 格 |
| 灯笼无样式（帧缺失） | dgLights `chTile` 不写帧，样式数组 `lantern[]`（:194-197）算了不用 | Place1x2Top（:46694-46720）帧式：frameY=style*36（下格+18）、frameX=0；样式按墙变体三档（Lights:109-118：wall==variants[1]/[2] 换档） |
| 吊灯无样式 | placeChand 不写帧 | PlaceChand（:52753-52824）帧式：style=27+theme（Item.cs:25748-25757 `27+type-2652`，2652/53/54=蓝/绿/粉）；num2=108*(style/36) 页列、num3=style*54 行基（分页修正同式）；三列 fx+{0,18,36}、三行 fy+{0,18,36} |
| 宝箱单格贴图错乱 | `dgAddBuriedChest` 不写帧（chTile 留残留帧） | PlaceChestDirect 帧式（:57864-57903）：顶行 fy=0/底行 fy=18、列 fx=36*style / 18+36*style。审计：地牢箱现显 style 2（fx=72，原版默认 chestStyle=2）✓ |
| 神庙锁门无钥匙可开 | `Door.ts isLockedDoor` 写 `st.type[i]===10`——10 是原版 sheet id，TileStore 存内部 id（门=17）→ **恒 false**，Game.ts:9593-9610 金钥匙链全灭 | 改 `T.DOOR_CLOSED` + tests/locked-door-chain.test.ts 5 条硬闸门 |
| 蛛网堵门打不开 | `Door.ts openDoor` 要求侧列全空；原版 OpenDoor（cs:37698-37724）允许 tileCut/165/IsADripTile 并 KillTile 碎掉 | tiles.ts 新增 `doorSmashable()`（tileCut 38 项全表+165+373/374/375/461/709）+ openDoor 砍切放行。审计：开门 11/16 → **13/14** |

注意：`tiles.ts TILE_CUT_SHEETS` 与 `Game.ts TILE_CUT_VANILLA`（:336-340，挥击消费）是同表两副本——Game.ts 是活跃战区未动，待安静后合并去重。

## 查明为原版行为（不修）

- **地牢门样式 13 = 地牢门（item 1138），普通门**；16/17/18=蓝/绿/粉地牢门（1411-1413）。DungeonGlobalDoors 的 `rn(3)===0 ? doorStyle : 13` 与原版一致。锁门只属于神庙 style 11（WorldGen.cs:34199，fy=594 落 IsLockedDoor [594,646] 区）。用户看到的"木门打不开"主根因=门帧缺失（渲染退化 style0+开门锚点扫描失败）——拥有会话 18:27 已修 dgPlaceDoorAt。
- **剩余 1 扇打不开的门**（沙漠屋 style43 + Bast 雕像贴门 + 黏土外侧）：Bast 雕像 x 范围 `Next(2,W-2)+X` 与我们 `int(2,w-3)+x` 等价，且原版 Bast 放置 `forced:true` 不查门——原版同样可生成贴门雕像。雕像/楼梯石贴门均非可砍格，原版 OpenDoor 同样拒绝。
- **起爆器 411/炸药桶**（(3198,841) 等处）：MicroBiomesPass 爆炸物微生物群系（WorldUtils WireLine L 形红线），可刷进地牢，原版行为。

## 遗留（拥有会话战区，未动）

1. ~~living_wood 残留~~ **已破案并修复（2026-08-13 23:00）**：真身不是树——是 **DG_ITEM_TILE id 空间碰撞**（陶罐案同款）。`DG_ITEM_TILE` 直存原版 tile id（sheet 空间），`placeSimple` 裸写 `st.type`：落地钟 sheet104→内部#104=活木、蜡烛33→猩红矿、灯93→氙苔、椅15→铁砧、烛台100→石板、书架101→熔岩苔、床79→中式灯笼、工作台18→开门图块。用户"诡异装饰物"即此。修复=DG_ITEM_TABLE 源头经 TILE_INTERNAL_BY_SHEET 换算成内部 id + place4x2 去掉双重转换（:2137）。插桩验尸（setLivingWood trace 零命中）+ 修复后残留=0。**注意**：placeSimple 仍只写单格（原版 PlaceTile 放整件多格家具）——多格家具保真度（桌3×2/椅1×2 等）留你们家具重构批，DG_ITEM_SHEET 原表已留（DungeonPass.ts:89 区）。
2. **门帧修复落盘前生成的旧存档**（用户 10:11 报告的世界）需重新生成才能看到全部修复——dungeonX 从 3277（旧）→ 3384（现），坐标持续漂移中。
3. dgSwitch 灭档写 `frameX=18` 是绝对写——若你们后续把吊灯样式推到 ≥36（分页 num2=108），中心列会跳到 18（原版同款行为，勿"修复"）。
4. LivingTreePass 根漫步两处写入已补原版 `!wallDungeon` 门（cs:28505 区域，DungeonHall 防御同源）——与本次残留无关但属正确 1:1，保留。

## 审计探针复跑

```sh
cd game && npx vitest run tests/_dungeon-furnish-audit.test.ts tests/_dungeon-furnish-audit2.test.ts --disable-console-intercept
```
（vitest ≥4 默认吞 console.log，须带 --disable-console-intercept。负载 130 时全管线测试会超时——用 --testTimeout=400000。）
