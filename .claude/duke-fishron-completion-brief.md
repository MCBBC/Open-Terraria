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
