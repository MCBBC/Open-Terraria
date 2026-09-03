# Duke Fishron（猪鲨）补全立项报告

> **★2026-09-03 已收官**（同日完成批）：四批静态面经逐点对账**绝大部分早已实装**
> （立项报告图景过期——生成链/掉落表/成就/音乐/存档旗全在位），本轮实补 4 处真缺口
> +1 处探针实锤的全局成就 bug，验收闸门全绿（见文末）。

## 已实装（勿重做）

| 面 | 位置 | 状态 |
|---|---|---|
| AI_069 本体（三阶段冲撞/泡泡/龙卷/半血狂暴） | `entities/bossAI_duke_moonlord.ts` `dukeFishronAI`，挂 `Enemy.ts` case 69 | ✅ |
| 371 DetonatingBubble 泡泡 | `dukeBubbleAI` 同文件 | ✅ |
| 372/373 Sharkron 鲨鱼龙 | `sharkronAI` 挂 case 71 | ✅ |
| 残影系统（oldPos 拖影+ai0≥4 换贴图） | `Renderer.ts:6055`（2026-08-27 审计批） | ✅ |
| 难度缩放（371/372/373） | `stats/ScaleStats.ts:753` | ✅ |
| 随从交互（MinionProj type 373） | `MinionProj.ts:3005` | ✅ |
| **372/373 贴图镜像 flip** | `Renderer.ts` `idR===372||373` + `bossAI_duke_moonlord.ts` spin 裸值化（2026-09-03 本轮） | ✅ |

## 遗留待实装（本立项范围）

### 批 1：生成链（钓鱼召唤）
- 原版：海洋生物群系钓鱼 + 饵=Truffle Worm（蠕虫饵，item 3191，地下蘑菇生物群系生物）→ 上钩即 spawn 370（Fishing 处理链 grep `TruffleWorm` / `ItemID.TruffleWorm` = 3191）
- 本仓：钓鱼系统存在（grep bobber/Fishing 链），**无 truffle worm 生成/召唤接线**。需：①蠕虫饵生物实装（地下蘑菇生物群系小动物，AI_255? grep 原版 type）②钓鱼上钩判定接 spawn 370（条件=饵 id 3191 + 海洋生物群系 `ZoneOcean`）
### 批 2：掉落/钱币
- 原版 Kill :79797 区（`case 370`）：专家袋 2656?/大师袋/钱币雨——逐值对照 `NPC.cs :79797` 起 Kill 段+本仓 `Game.onProjectileDeath`/NPC 掉落表惯例
### 批 3：成就/音乐/事件标记
- 音乐切换（bossMusicParity 惯例套件）、成就钩（"Tied the Leader"等——本仓成就域惯例）、`DownedDukeFishron` 存档旗（后续渔夫任务/商店依赖）
### 批 4：372/373 细节补全（现 sharkronAI 已 1:1 主体）
- 原版 :35213-35315 蓄力横游/扑咬已接；核 `:35222-35230` 粒子面与 `Main.cs` 372/373 残像（已接）逐值收尾

## 本仓 boss 实装惯例参照
- 文件模式：`entities/bossAI_<name>.ts` 纯函数 AI + `Enemy.ts` case 分派 + `Renderer` 绘制段 + `stats/ScaleStats` 难度缩放
- 测试：`tests/bossAI-<name>.test.ts`（固定种子桩，参照 bossAI-deerclops/plantera）
- 纪律：**反编译为唯一标杆逐行直译**；子代理产出须主线 spot-check（本会话 7 起身份/归属错标教训）；新出生路径必配 placeAtShootSpawn；蓝队禁 git stash/reset

## 验收闸门
1. `npx tsc --noEmit` 触碰文件零错
2. vitest：新增 bossAI-dukefishron 套件 + 既有 fishing/boss 音乐/掉落套件全绿
3. 实机探针：蠕虫饵海洋垂钓 → 370 spawn → 三阶段状态机走查（阶段切换 hp 阈值 0.5/专家二阶段）→ 掉落落盘
4. 372/373 镜像在左/右移动双向正确（本轮已修,回归即可）

---

## 收官批（2026-09-03）实际改动与验收

### 立项图景勘误（对账结论）
- 饵物品 id：**2673**（非报告所写 3191——3191 是魔夜爬虫 484 的饵）；NPCID.TruffleWorm=374 / Digger=375。
- 生成链三段（spawner 蘑菇洞穴支 374 / AI_066+375 钻地 / 虫网捕捉 2673 / Bobber
  truffleBite → Game.reelBobber −1 哨兵 → SpawnOnPlayer 370）**全部已在位**，本轮未动。
- 掉落（vanilla-npcdrops.json 370 七条+vanilla-bossbags.json 3330 全内容+value=250000
  钱币+药水心 499）、音乐（BOSS_MUSIC[370]=58 / MUSIC_SLOT[370]=15）、成就表
  （FISH_OUT_OF_WATER killed(370)）、downed 旗（通用 downed_<vid> 链+WldParser
  downedFishron 双读）均已在位。

### 本轮实补（反编译 1457 逐值）
1. **373 蓄力摆头 spriteDirection**（AI_071 :35213-35227）：direction 与
   spriteDirection 是两字段——摆头按 cos 符号写渲染向（新字段 `Enemy.sharkronSdir`
   缺省 −1 同 :6522），rotation=vy·sdir·0.1 钳 ±0.2 随摆头向；横游乘子恒用
   direction。Renderer 372/373 flip 按相位分流（蓄力读 sdir / 起扑读 facing）。
2. **蓄力段 vx 不清零**（:35211 只写 velocity.Y=ai[3]）+ **扑咬态入块渐显极性**
   （:35280-35284 alpha−=15 钳150——曾 min(150,+15)=一拍跳 150）。
3. **expert flag2 整支缺**（:49300 expertMode && life≤15% → :49908-49910 num33=4 →
   ai0=9 二段狂暴变身）——dukePick2 补 flag2 参，10-13 狂暴段从死码复活。
4. **成就 vanillaNetId 0 哨兵 bug**（Game.ts 击杀通知 `vanillaNetId ?? id` 对 0 缺省
   失效→**全游戏 npcKilled 类成就永不可完成**）：归一为 `!==0 ? netId : id`
   （同 :3099/:13482 惯例）。猪鲨探针实锤后修。
5. **items.ts 顶层循环序 TDZ 断环两刀**（boot 抽彩炸，冷启动实锤）：音乐盒表
   →`data/musicBoxStyles.ts`、TOOL_* 五常量→`data/wiringToolBits.ts`（叶子数据
   模块，devices/Wiring 侧 re-export 兼容）。

### 验收闸门（全绿）
1. `npx tsc --noEmit` 触碰文件零错。
2. vitest：新增 `tests/bossAI-dukefishron.test.ts` 16/16（状态机/AI_071 摆头/alpha/
   flag2/掉落药水/音乐槽）+ 回归面 fishing-full/r7、boss-bags、boss-music-parity、
   critter-ai、critter-spawn-parity、duke-sharknado-damage、boss-summon、achievements
   等 18 文件 231 测试全绿。
3. 实机探针 `scripts/_duke-accept-probe.mjs`（私有 5201 实例）**25/25**：海洋垂钓
   →truffleBite→370 spawn（boss 槽/公告/饵必耗）→三阶段走查（0/1/2/3→半血 4→5→
   flag2 9→10+）→经典杀（武器池 2621/药水 499/心/钱币/downed_370/FISH_OUT_OF_WATER）
   →专家杀（袋 3330）→374 贴近钻地 375→373 摆头 sdir 双值→dash 左右截图
   /tmp/duke-accept/。
4. 372/373 镜像双向回归通过（实拍+前轮修复未回退）。

---

## 红蓝对抗 review 终章（2026-09-03，5 红 + 2 蓝，主线逐条对反编译定谳）

### 定谳总表（子代理产出全部经主线 spot-check）

**实锤清偿（本轮全部落地,回归全绿）**：
| # | 发现 | 来源 | 修复 |
|---|---|---|---|
| 1 | 起扑段 spin 缺 `+π·[direction==−1]`（:35344-35348 与 flip **并存**,曾误判"裸值+flip"→左扑 180° 错向/贴图倒挂） | R1-F1+B1-D1+R5-F1 三方一致,主线亲读原文再证 | sharkronAI 两处恢复 π 项;Renderer/AI 错误注释改正 |
| 2 | **370 本体 flip 位整缺**（贴图原生朝右目验,原版 sdir=-direction+flip 门;玩家居左头尾反向鱼腹朝上） | B1-E10 越界发现,主线亲验贴图+伺服公式 | Renderer 补 `idR===370 flip(facing>0)`——AI spin 本就按 flip 存在的原版式写,零 AI 改动 |
| 3 | expert 参数面整表缺失（num=1.2 第二乘区/hover 40·0.55·8.5/charge 28·17/两 expert 子档） | R2-F1+B1-E9+R5-F2 | dukeFishronAI 参数块全表接入(flag2 门已通,经典/专家双档) |
| 4 | 态9 前半 alpha 钳 255→应 150（:50043-50058） | R2-F3 | 一行 |
| 5 | 泡泡/出鲨出生点 Bottom 锚语义（NewNPC center=Y−h/2,曾中心语义低 18/12px） | R2-F4+R1-F4（出鲨 sP/sC≡num511 主线亲推证） | 泡泡×2+出鲨共 3 处 |
| 6 | despawn 早退跳过尾句 dontTakeDamage（逃离期残留无敌） | R2-F5 | 一行 |
| 7 | EoW 13/14/15 成就缺 boss 门（杀中段也推进 WORM_FODDER/SLAYER_OF_WORLDS） | R3-A2+B2 双证,主线亲读 :80652-80658 | `killBossFlag` 门（同块 vanillaNetId 修法旁） |
| 8 | **remix 掉落条件族恒 false 断裂**（remix 种子已可产,前提过期→remix+困难杀猪鲨掉 BubbleGun 非 AquaScepter、袋 3330 remix 支死、十周年 devArmor 1/8 退化 1/16） | R3-B2 | evalCond 四变体接 ctx.remixWorld + Enemy 注入 + 袋调用点补传 remixWorld/tenthAnniversary |
| 9 | .wld 导入 downedFishron 只落驼峰键（表情 50/城镇自卫档丢失）+ EmoteMenu 史莱姆女皇误读 downed_641（永锁） | R3-C3 | Parser 双键+EmoteMenu 键正 657 |
| 10 | 态10 悬浮翻面支缺 oldPos 清零（残影跨图拖尾;case12 同款支系 ai2==0 恒假死码,原版本相即拖尾,**不补**） | R5-F13⑤,主线亲裁活/死支 | Enemy.clearTrailHistory()+dukeHover 态10 门 |

**驳回（伪影,勿改）**：
- B1-D2"转换拍 else 支同拍串联"——if/else 每拍互斥,B1 模拟伪影（主线读 :35330-35355 结构再证）。
- R5-F13⑤"瞬移 oldPos 清零缺失"——原版 case12 清零支 ai2==0 恒假死码,原版本相即拖尾。

**登记账（存量/越界/低危,未在本轮清偿）**：
- R1-F2：371/372/373 死亡演出缺（vanilla-gore.json 无 371-373 键,75 尘+4 尸块两死路同缺,存量）。
- R1-F6/B1-E11①：inSolid 不裁 halfBrick 顶 8px/inActive 格（共享助手,存量）。
- R2-F6/R5-F13-5：chaseable=false 态10/12 相位暂关未接（召唤物可锁隐身猪鲨,引擎级备案）。
- R3-A3/A4：playerInteraction 门缺（环境杀计成就）/MP msg23 不携 vanillaNetId（存量,MP 域）。
- R3-B3/B4：extraValue 并入时机/药水心与掉落求值序（低危）。
- R3-C4：钓鱼召 Duke 无 boss 槽在位守卫（槽模型结构限制,连杀/双 boss 场景记账丢失,自愈=重杀）。
- R4-F5a/F5b：**两颗存量同型 TDZ 地雷**——NotTheBeesPass↔DungeonPass（**距炸 1 个求值步,中危**,DG_FRAMED_ALL 抽叶子即除）/Minecart↔Mounts（低危）；F7 结构备案：49 节点大环仍在,顶层读环内绑定即复死,惯例=抽叶子通道。
- R5-F13：覆盖缺口清单（帧机/态7-13 全行为/AI_070 整支/音乐运行时/出生尘环 18vs36 粒近似/1456 行号锚全文）。
- 测试环境登记：vitest 对泡泡锚点几何恒 +w/2 漂移（独立 vite-node 实证逐位 0 差,vitest 断言放宽至半径带,探针=真机权威）。

### 探针/测试终态
- `scripts/_duke-accept-probe.mjs` **27/27**（新增：370 flip 证据帧/严格 dead 位/掉落差集口径/局部强断言）。
- `tests/bossAI-dukefishron.test.ts` **21/21**（新增：左扑 π/困块无敌窗/重力恢复/expert 参数表/狂暴换招跳拍/泡泡锚点带/弹初速/双实例基值/死门先行）。
- 新增 `tests/tdz-leaf-guard.test.ts`（叶子零 import/items 断边不回焊/经叶子消费面存活三钉）+ `tests/achievements.test.ts` 0 哨兵钉（notifyNPCKilled(0) 永不完成任何成就）。
- 回归面 18 文件 **313/313**；tsc 触碰文件零错（Enemy.ts:5367 一错系并行会话在途）。
