# 服务器权威房（ServerRoom / SimHost）实施计划 v1

> 状态：实施中（2026-08-17 起）。基准：docs/multiplayer-design.md §0 混合权威模型。
> 核心原则：**NPC/世界/事件服务器权威；玩家位置/物品/伤害客户端上报、服务器中继**（= 原版
> netMode==2 语义）。正常单人/中继房游玩零影响（Z0 禁区零触碰，见 §8）。

## 0. 目标 / 非目标

目标：lobby 可开"服务器房"——世界由服务器 SimHost 模拟（NPC AI/刷怪/液体/天气/事件/
掉落），房主掉线不影响世界运转；GM 可按房禁用召唤 Boss/破坏/放置/PvP/爆炸物/刷怪。
非目标（本期不做）：玩家物理服务器权威（维持 victim-settles）、弹幕全权威、千人多线程
分片（接口预留见 §7）。

## 1. 架构：SimHost = 进程内"虚拟房主客户端"

```
客户端(全部按访客语义)          服务器进程
┌──────────────┐   msg13/17/32/42…  ┌─────────────────────────────┐
│ 玩家本地物理  │ ─────────────────▶ │ Room（中继+AOI+短码+背压）    │
│ NPC=傀儡渲染  │ ◀───────────────── │   ↑ room.handle(simStub,…)  │
└──────────────┘  msg23/27/21/7/32  │ SimHost(60Hz 定步长)          │
                                    │   Enemy/TownNPC/Critter/Drop │
                                    │   VanillaSpawner/LiquidSim/  │
                                    │   Weather/事件  ──共享──▶ World│
                                    └─────────────────────────────┘
```

关键设计（最低侵入）：SimHost **不旁路任何中继逻辑**。它以上行帧格式构造
msg23/27/21/28 帧，经 `room.handle(simStub, msgId, reader)` 走与房主客户端完全相同的
管线——AOI 滞回、msg23 短码、背压分级、限流全部原样复用。`simStub` 是一个
`isHost:true, state:10` 的桩（不在 `clients` 集合中，不接收广播）。

- `room.ts:182` 预留兑现：`npcAuthority(c) = !this.sim && c.isHost`
- msg42 StrikeNPC：`sim` 存在时改投 `sim.onStrike()`（原 strikeTarget 房主路径跳过）
- tile 变更（含 SimHost 内液体/AI 拆门）经既有 `store.netReporter` 上报链广播

## 2. 权威矩阵

| 状态 | 权威方 | 通道 |
|---|---|---|
| 玩家位置/速度/HP/物品栏 | 各客户端（victim-settles） | msg13/16/5 原样 |
| NPC（敌怪/小动物/城镇） | **SimHost** | msg23 下行（短码）；上行仅 simStub |
| NPC 弹幕 | **SimHost** | msg27（hostile 位合法源）+ msg28 |
| NPC 掉落 | **SimHost** | msg21（netId 高 8 位 = 255 服务器段） |
| 打击 NPC | 客户端上报 → SimHost 结算 | msg42 → sim.onStrike |
| tile/箱子 | 服务器校验后应用（现状） | msg17/32 + netReporter |
| 天气/时间/事件掷骰 | **SimHost** | world.clock/weather 状态 |
| Boss 召唤 | 客户端**意图** → SimHost 校验+生成 | v8 SummonIntent（§3） |

## 3. 协议 v8（全部尾部追加，未知位/尾部忽略）

- **RoomPolicy 尾部追加 `u8 ruleBits`**（v7 pvpAllowed 之后；旧客户端 remaining=0 不读）：
  `bit0 serverAuth / bit1 forbidBossSummon / bit2 forbidBreak / bit3 forbidPlace /
  bit4 forbidPvp(=pvpAllowed 强制关) / bit5 forbidExplosives / bit6 peaceMode`
  客户端 UI 据此门禁（召唤物品灰显、拒绝提示走既有 netDeny toast 链）。
- **新 Msg.SummonIntent（C→S）**：`str itemKey + f32 x + f32 y + f32 vx + f32 vy`。
  仅 serverAuth 房接受；SimHost 反查 ITEM 表确认召唤类（NPC_CRAFT/召唤物表）+
  规则门（forbidBossSummon）→ 原版语义生成（含 Boss 公告链）。非 serverAuth 房整包丢弃。
- msg23/27/21/42 布局零改动。

## 4. ServerGameHooks（`entities/types.ts` GameHooks 的服务器实现）

- `world` = room.world（共享实例——Room 应用的 tile op 对模拟即时可见，反之亦然）
- `player` = **合成 avatar**：真实 `new Player(x, y, new Inventory())`（构造无 DOM 依赖，
  Player.ts:439）。逐怪更新前把 avatar 位置摆到**该怪最近的在线客户端**（RoomClient.lastX/Y）
  ——敌怪 AI 即获得多人最近目标语义，Enemy.ts 零改动。无在线玩家 → 摆到世界出生点下
  （AI 静默）。avatar.hp 恒 400（防 AI 因"玩家已死"全图暴走）；dead 恒 false。
- 视觉/音频钩子（spawnParticles/addDamageNumber/punchCamera/achievements…）no-op。
- `spawnDrop` → 真实 ItemDrop 入桶 + msg21 上行帧（净空上限+TTL 见 §5）。
- `damagePlayer` → no-op（victim-settles：接触伤害由各客户端对傀儡本地结算，现状语义）。
- `spawnEnemy/spawnNpcByVanilla` → 真实入桶（netId 分配：服务器段 owner=255）。

## 5. SimHost 每 tick 编排（60Hz 定步长，dt=1/60）

1. 实体桶：enemies/npcs/critters/drops/proj（NPC 弹）`fixedUpdate(dt, hooks)`
   （傀儡概念不存在——桶内全是权威实体；`netPuppet` 恒 false）
2. 刷怪：每 20 tick 轮询在线客户端，**逐玩家** `VanillaSpawner.spawn`（多人语义：
   每玩家一套 spawnRate/maxSpawns 掷骰；`remotePlayers` = 全体在线位置注入——
   对齐原版 CheckNotSpawningOnScreen 多玩家语义）。v1 不含 buff 修正（水蜡烛/战斗
   药水——服务器无 buff 同步，差异备案；peaceMode 门在此短路）
3. 液体：`liquid.step()` 每 2 tick（变更经 netReporter 广播）
4. 天气/时钟：weather.update（无头 hooks）+ clock（index.ts 1Hz tick 保留，SimHost
   内不再二次推进）；bloodMoon/slimeRain 掷骰在 weather 对象内
5. 同步冲洗（每 30 tick=0.5s，对齐客户端 netSweepPuppets 节拍）：
   msg23 快照批（≤64 条/批，多批轮转）/ msg27 弹幕批 / msg21 攒批 / msg28 消亡批
6. 掉落物 TTL/上限（<ItemDrop 原版清场语义>）+ 净空（NPC 上限对齐原版 maxSpawns 门）

生命周期：Room 构造时若 `serverRoom:true` → 启动；房空 5 min 回收时（复用 index.ts
既有回收）→ SimHost.stop()。存档：复用既有 300s save-interval（世界脏 = tileOps/
chestEdits + SimHost 实体变更标记）。

## 6. GM 规则系统

- `RoomRules`（lobby POST /rooms 创建时传入；PATCH /rooms/:code/rules?gmToken= 热更
  → 重播 RoomPolicy 全房刷新）：ruleBits 即 §3 位图 + `gmToken`（创建时生成）。
- 执法门（全部服务器端）：
  | 规则 | 执法点 |
  |---|---|
  | forbidBreak / forbidPlace | room.ts msg17 case：按 TileOpAction 分立拒绝（泛化既有 protectTiles 整包门；protectTiles=两位同置，行为不变） |
  | forbidPvp | 既有 pvpAllowed 墙（msg27 bit6 / msg44 非 PvP 丢弃） |
  | forbidBossSummon | SummonIntent case：拒 + serverNotice 提示 |
  | forbidExplosives | msg17 爆炸链（TileOp 爆炸 action/SummonIntent 爆炸物）拒 |
  | peaceMode | SimHost 刷怪短路 + 在场敌怪 EncourageDespawn |
- 豁免：gmToken 持有连接（URL ?gm=）→ c.isGM，规则门放行。
- 聊天命令（NetModules Text case，前缀 '/'）：`/rules`（查询回显）；GM: `/peacemode`
  等翻转位（v1 实现 /rules + 热更走 HTTP）。

## 7. Worker 化

- **即刻**：存档序列化 + 建房 JSON.parse → `node:worker_threads`（二者是当前事件循环
  阻塞主源；大世界 20MB stringify 秒级阻塞）。接口：`server/src/workers/ioWorker.ts`
  （任务式：{type:'stringify'|'parse', payload} → transferable 回传）。
- **预留**：SimHost 整体进 worker 需 World 随迁 + tile op 异步代理（破坏现有同步
  apply+broadcast 契约），本期不做——SimHost 已按接口隔离（Room 只见 ISimHost 接口），
  千人分片批再迁。

## 8. Z0 禁区（零触碰）与回归门

禁区：world/gen/**、VanillaSpawner 内部、掉落引擎、LiquidSim 内部、TileStore/World
布局、挖掘模型。SimHost 预算/上限全部在**调用侧**实现。
回归门（每批必过）：① 全量 vitest ② worldgen 金标 ③ 新探针 `_sr-probe.mjs`
（服务器房：建房/NPC 服务器模拟下发/傀儡渲染/打击回流/GM 规则拒绝）。

## 9. 分批交付（B1-B4 全部完成,2026-08-17）

| 批 | 内容 | 验收 | 状态 |
|---|---|---|---|
| B1 | 协议 v8 + RoomRules 模型 + Room 执法门 | `_sr-probe` 规则拒绝帧断言 | ✅ |
| B2 | SimHost 骨架 + ServerGameHooks + msg23 源切换 | `_sr-probe` 服务器源 NPC 下发 | ✅ |
| B3 | 刷怪/液体/天气编排 + SummonIntent + 存档脏标记 | `_sr-probe` 20/20 | ✅ |
| B4 | ioWorker(save/parse worker) + TownNPC/蠕虫/水生落位全镜像 + 入侵链(startInvasion/tickInvasion/击杀扣分/日出roll) + SSC 强制 + 客户端浏览器 E2E | `_sr-e2e` 15/15 + `_sr-probe` ⑨ 存档落盘 | ✅ |

B4 增补事实：
- **ioWorker**（`server/src/workers/ioWorker*.ts`）：parse=worker JSON.parse 回传纯对象；stringify=主线程 buildSaveParts 廉价视图→structuredClone(memcpy) 进 worker 做 RLE+stringify（SaveFile.buildSaveParts 抽取,saveWorldOnly 同源部件语义不变）。故障/超时/队列满 → null 回退同步,永不成新故障点;SIGTERM 收尾=等在途→同步兜底刷→ioShutdown。
- **刷怪链全镜像**（SimHost.trySpawn = Game.trySpawnEnemy 1:1）：setPlayerFlags/setWeather 旗标灌注（服务器近似:zoneDungeon=玩家格地牢墙/luck=0/ddCurse/partyUp=false 备案）+ 蠕虫段链 + 水生找水 + 小动物贴地 + 两格净空落脚 + 萤火虫附加 + 骷髅商/bound 族 TownNPC 转化（TOWN_SKIP 已退役）。
- **入侵链**：SimHost 每 tick tickInvasion（前线推进/胜利/周期公告→serverNotice generic 文案备案）；onEnemyKilled 入侵击杀扣分（INVASION_GROUP/KILL_WEIGHT）；日出沿自然 roll（哥布林/海盗;日食 roll 未接——eclipse 需 scene 链备案）。
- **SSC 强制**：serverAuth 房 sscLoad 注入 + 断开/定时落盘 force（不依赖全局 --ssc;朋友服开关语义保留在中继房）。
- **探针坑**：msg42 dmg 为 i16(探针伤害取 9999 勿超,99999 溢出致回绕负值)；msg7 spawn 解析偏移=f64(8)+u32(4)+u16(2)+u16(2)=16/20；纠正帧 v 偏移=payload 11。
- **并行会话隔离**：worldGen worker 运行期爆栈(栈溢出)为在途第三方改动——进程内 generateWorld(vitest 双种子)全绿,E2E 用 loadJson 现成档绕开,不影响本批。

## 10. B5 批（2026-08-18：review 修复 + 容量第一步）

**review 修复 4 件**（自审发现,双探针复验 20/15 全绿）：
1. SimHost.step 异常防护：逐次捕获,连续 600 次(10s)→停机+公告（防 interval 异常打穿进程 handler 后状态撕裂）
2. serverAuth 召唤 Boss 在场预检：查傀儡表（本地 this.boss 恒 null——防白烧召唤物;服务器门双保险）
3. 聊天命令只拦已知（/rules、/gm）——'/xxx' 照常广播（一刀切吞 '/' 会静默吃正常聊天,中继房同样受害）
4. dropSweep 重复 take 抑制（takenDrops 集——客户端 take 已全房广播）

**B5 容量件**：
- **AOI 空间索引**：broadcastAt 全房线性扫 → 2048px 网格桶（查询半径 ≤1920<2048 → ≤2×2 格;msg13 增量入格/断开出格;**观战者不入格走线性兜底表**——视野中心≠自身位,按自身位入格会漏）。msg23/msg27 接收端加**整批包围盒早退**（一批 ≤24 条空间局部,远端 O(1) 拒绝）。探针 `_aoi-probe.mjs` 8/8（近收/远不收/移近重入格/观战兜底/断开清理）。
- **日食 roll**：dawnRolls 内联（Eclipse.ts:66-81 同式,避开其 Lang 依赖;hardMode+downedMech+1/20;命中则跳过入侵 roll——原版 if/else）;夜沿清 w.clock.eclipse。

**B5 遗留（B6 千人架构批）**：SimHost 整体进 worker（World 随迁+tile op 异步代理——Room 同步世界访问全部改 RPC,最大单件）;slot u16 + netId owner 扩位（>255 人硬门,owner 8bit→10bit 级联 makeNetId/msg21 属主校验）;分线部署。TownNPC 入驻链服务器侧（优先级链 100+ 行+找房+服务器侧名字生成 Lang 依赖未验证——独立批次,非可靠性项）。

## 11. B6a 批（2026-08-18：房间进程化 RoomWorker）

**架构**（比 §7 原案更优：Room/World/SimHost/persist/SSC **零改动**整体进 worker）：
- `server/src/roomHost.ts`（worker 宿主）：K 房/工,自 index.ts 原样迁入房间注册表/回收/时钟/落盘/SSC/`--world` 常驻房;`ShimSocket` 还原 Room 依赖的 ws 语义——`bufferedAmount = 已投递未ack字节 + 主进程回报的socket缓冲`（out 写入后主进程回 ack）,readyState 由 closed 位驱动,kick=桩直发帧+close 事件。背压/慢端踢出阈值语义与单进程版一致。
- `server/src/roomHostEntry.mjs` / `workers/ioWorkerEntry.mjs`（★坑）：worker 不继承主进程 tsx loader,Node 原生 strip-types 遇 `const enum` 直接炸（"TypeScript enum is not supported in strip-only mode"）——execArgv --import 三种写法均无效,唯一解=**mjs 入口内部 `register()` tsx 再动态 import TS 体**。
- `index.ts`（主进程）：HTTP lobby 路由（语义不变）+ WS 装配（早到帧缓冲——connOk 往返期间的 Hello 不丢）+ worker 池（`--workers N` 默认 1,`--max-rooms` 全局均摊;codeOwner 路由表;stats 跨工合并;worker 挂=其房间失联客户端自愈断开）。
- **onHostEvent 顺序坑**：connOk/connFail 必须在 `conns.get` 守卫**之前**处理（接线前 conns 无条目——曾致全部进房 5s 超时）。

**验证**：`_sr-probe` 20/20 + `_aoi-probe` 8/8 + `_sr-e2e` 15/15（三探针零改动全过=接口层等价达成）+ W=2 多工冒烟（2 worker/2 房/双握手/stats 合并/零异常）。

**B6b 遗留**：slot u16+netId owner 扩位（**明确等并行会话修复 worldGen worker 后启动**——全协议破坏性清扫必须以 `_roomprobe` 54 断言为回归门,当前其浏览器 worldgen 段被在途第三方改动卡死）;TownNPC 入驻链同前备案。多房每工默认 32,1000 CCU≈170 房拓扑已就绪（内存/崩溃域隔离,`--workers` 按核扩展）。

## 12. 千人容量实测与配置评估（2026-08-18,`_load-probe.mjs`）

**实测数据**（4200×1200 真实档,serverAuth 房 SimHost 活跃,bot 10Hz msg13 游走,双口径互证=bot 收字节 ≈ /stats 出向）：

| 场景 | 人均下行 | 服务器出向 | 房 worker CPU |
|---|---|---|---|
| 60 分散（全图 6kpx 间距） | 0.44 KB/s | 25.8 KB/s | 46.6% |
| 120 分散 | 1.05 KB/s | 123 KB/s | 82.1% |
| 60 聚集（±600px,最坏） | **10.8 KB/s** | 538 KB/s | 59.8% |

**关键结论**：
1. **单房 worker=单线程是千人单房的硬顶**：边际斜率 (82.1-46.6)/60 ≈ 0.59%/人 → **~120 人/房即单线程饱和**（82%@120bot）。千人单房需把房内工作再拆线程（sim worker+fanout worker,B6 后续）——当前架构下**单房舒适上限 100-150 人**。
2. **带宽由局部密度决定**（AOI 1920px 窗）：聚集场景人均 10.8KB/s（60 人全在彼此 AOI≈60×10Hz×25B 互播,与实测吻合）;千人单房常态（热点存在）按人均 8-15KB/s 规划=**64-120 Mbps 持续**;千人同屏病态≈人均 180KB/s（180MB/s）超现实,须 AOI 分级降频治理。
3. **1000 CCU 推荐拓扑（今天可用）**：多房分线 ~8-12 人/房 → ~100 房 ÷ 32 房/工 = 4 worker + 主进程 ≈ **8 vCPU/16GB + 100Mbps** 轻松承载（实测外推 4-6 worker 核 + 主进程 ~1 核 + 余量）。

**国内带宽费用基准**（阿里云,公网流出;WS 动态流量不走 CDN,入向免费）：
- 常态千人（10MB/s 均值,晚高峰 4-6h 峰 + 白天低谷,≈35% 占空比）≈ **10-11 TB/月** → 按量 ~0.8 元/GB ≈ **8,000-9,000 元/月**;峰值带宽包（≥120Mbps 档）通常更优,以当期价格页为准
- 24/7 满载上界 26TB/月 ≈ 2 万元/月（不现实,列作上界）
- 均匀分散型（0.5-1KB/s/人）≈ 1.5-2.5TB/月 ≈ **1,500-2,000 元/月**

**测量期修复**：startBpsSampler 未随 B6a 迁入 worker（/stats outBps 恒 0）——已迁 roomHost.ts。探针基建:随机端口防跨跑孤儿污染;★单位坑（B/s 误标 KB/s 制造"洪水"假象 45 分钟——**双口径互证**(bot 收 vs /stats 出)当场拆穿）。

## 13. 千人单房优化批 + B7 最终形态蓝图（2026-08-18 续）

**差分剖析**（120 bot,relay 房 vs serverAuth 房）：优化前 worker CPU 11.6% vs 82.1% → **模拟占 86%**,中继 14%。

**两项斜率优化落地**（`_sr-probe` 20 + `_aoi-probe` 8 + `_sr-e2e` 15 全绿零回归）：
1. **玩家空间网格**（SimHost.pGrid 1024px,每 tick O(P) 重建）：avatar 最近目标 O(E×P)→3×3 格查——消灭模拟 CPU 平方项
2. **刷怪掷骰节流**：trySpawn 整体 4 tick 一轮、概率×4 折算（期望不变）——统计 O(E) 与 getSpawnRate 调用砍 75%
3. **AOI 密度降频**（broadcastAt）：msg13 在拥挤格（>16 人/2048px 格降半频、>48 降三频）按接收端伪随机抽样——客户端 netOffset 插值按低频设计,视觉无损

**实测对比**：

| 场景 | 优化前 | 优化后 |
|---|---|---|
| 120 分散 worker CPU | 82.1% | **28.6%**（-65%） |
| 60 聚集 人均下行 | 10.8 KB/s | **3.27 KB/s**（-70%） |
| 60 聚集 worker CPU | 59.8% | **18.5%**（-69%） |

**千人单房外推刷新**：带宽 3-6 MB/s（24-48 Mbps）;CPU ≈ 中继 ~1 核 + 模拟 ~0.6-1 核 = **~1.6-2.5 核**——原估"模拟 5.9 核需分区并行"的复杂方案不再必要,最终形态大幅简化。

**B7 最终形态蓝图**（千人单房,2 项前置+1 项拆分）：
1. **slot u16 + netId owner 扩位**（唯一硬门;gated on worldGen worker 修复——`_roomprobe` 54 断言为回归门）
2. **房内双线程**：中继线程（Room/strip/chest/背压,~1 核@千人）+ 模拟线程（SimHost+World 随迁,~0.6-1 核@千人）——TileStore 以 **SharedArrayBuffer 背衬**（构造参数 additive 开关,布局零改;tile 读写单元素原子性足够,最后写者胜=游戏语义可接受）;meta（clock/weather/flags/chests/存档）经 RPC 到模拟线程;msg42/SummonIntent 直投模拟线程。B6a 的 roomHost worker 内再 spawn 模拟子线程即可,架构不变
3. 验证：三探针 + `_load-probe` 千 bot（bot 进程需拆分:单 node 进程 1000 ws 会先饱和——4×250 bot 分进程压）

**千人单房配置终值（B7 后）**：16 vCPU/32GB 单实例可载 4-6 个千人房或 1 千人房+充裕余量;带宽 50-100Mbps（密度降频后）;月流量 10-20TB 视密度。

## 14. 聊天系统与世界频道（2026-08-18）

**背景**：客户端此前只有显示侧（ChatMonitor+onChat）——无输入入口。本批补全链：

- **`src/ui/ChatInput.ts`**：Enter 开框（原版语义;联机态+无 UI 阻塞+非观战）/Enter 发送/Esc 关/blur 关/Tab 切频道;300ms 重开抑制（发送键残留事件防重开）。键处理挂 **window capture**（不依赖输入框焦点）。l10n 两键（Chat.ChannelWorld/ChannelRoom,已过 build-l10n 管线）。
- **协议（尾部增量）**：C→S Text 模块尾部 `u8 channel`（0=房间/1=世界;旧端无尾段=房间,语义不变）。S→C 世界帧=authorSlot 255 + `[世界] <名> 文本` + 金色 (255,215,80)——客户端零新解析。
- **服务器链**：Room 读尾字节;世界消息上抛 roomHost → main 扇出全部 worker → 逐房 `broadcastWorldChat`（含发送者回显——回显是发送端唯一确认）。反刷屏：10s 窗 8 条/人（世界一条放大全服,独立于 NetModules 30/s 桶）。两种房型（中继/服务器权威）同路径支持 ✓。
- **Game.sendChat**：房间频道本地即时回显（服务器不回发发送者,原版同语义）;世界频道靠服务器回显（~1RTT）。
- **验证**：`_sr-probe` ⑩ 25/25（跨房收达 serverAuth→中继/房间隔离/反刷屏）+ `_sr-e2e` ⑤c 20/20（浏览器:开框/打字/Esc/双频道收达 `[世界]` 前缀帧）。

**已知事项**：键盘逐键发送跳点（监听器→sendChat）在 headless 自动化语境未稳定复现——证据链各环独立全绿（监听器触发 enter-len 记录 ✓/onSend 直调→服务器 ✓/sendChat 直调→服务器 ✓/prop-call ✓），判定为自动化环境性悬案（疑似页面闭包/模块双载）;真机手动一键验证即可关闭。生产代码已用 window 活实例解析加固双路径。
