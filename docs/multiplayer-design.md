# 多人联机设计规范（WebSocket，对齐原版 1.4.5.6 + 选做优化）

> 状态：**储备方案**（完成调研与设计，待启用实施）。基准源码 Terarria1456；
> 涉及原版行号均已核对。所有"优化"项单列 §8 并标注 `--opt` 开关名，
> 默认关闭（默认行为与原版 1:1），逐项独立可开。

---

## 0. 原版架构要点（调研结论速查）

```
服务器 (netMode==2, 60Hz)                 客户端 (netMode==1)
├─ NPC.SpawnNPC()（仅服务器, Main.cs:17720） ├─ 本地玩家完整模拟
├─ npc.UpdateNPC()（服务器跑 AI）           ├─ 420t 兜底上报 msg13 + 事件驱动即时
├─ WorldGen.UpdateWorld()（液体/电路, :17921）├─ 远端玩家 = msg13 覆写 + netOffset 平滑(300px)
├─ UpdateServer()（:64004，CheckSection 驱动）└─ tile 收包应用 + 本地帧动画
└─ TCP 7777 / 帧=[ushort len][byte msgId][payload]
```

- **混合权威**：NPC/世界/事件服务器权威；玩家位置/物品栏/伤害/owner 弹幕客户端上报、服务器中继
- 世界不传文件：msg7 元数据 → 出生点 5×3 section → CheckSection 3×3 按需
- Host&Play = 回环客户端（`myPlayer=255`；IsLocalHost() 判 host，NetMessage.cs:2874）
- 握手：1 Hello("Terraria319") → 3 slot → 客户端全量上传 → 6 → 7 WorldData → 8 → 10 sections → 12 Spawn → State=10 → 129
- 双轨消息：MessageID 0..161 + msg82 内嵌 NetModule（15 个，注册顺序即 ID）
- 帧上限 65535B（ushort len）；缓冲 131070B（MessageBuffer.cs:29-37）；小端

## 1. 传输与协议规范

### 1.1 WebSocket 层

| 项 | 规范 | 说明 |
|---|---|---|
| 传输 | 二进制 WebSocket（ArrayBuffer） | 文本帧一律忽略并计异常 |
| 端口 | 7777（对齐原版 DefaultPort） | `--port` 可改 |
| 帧内格式 | **保留 `[u16 len][u8 msgId][payload...]`** | 一条 WS 消息可串联多个原版包（合包省帧开销）；粘包逻辑照搬 CheckBytes（NetMessage.cs:2504-2564） |
| 字节序 | 小端（LE） | 对齐 .NET BinaryWriter |
| 包上限 | 65535B（同原版，超限丢弃+告警） | 超大载荷必须走分片协议（§1.4） |
| WS 压缩 | **禁用 permessage-deflate** | msg10 内层已有 deflate，双层压缩纯浪费 CPU；若开则必须 `server_no_context_takeover` |
| Nagle | Node `ws` 底层 socket `setNoDelay(true)` | 对齐原版 TcpSocket（TcpSocket.cs:35-38），60Hz 小包不积团 |

### 1.2 版本协商

```
Hello(msg1) payload: { magic: "SW1", protoVer: u16, gameVer: string, features: u32 }
```
- `protoVer` = 本协议文档的修订号（初始 1）；不一致由服务器决定踢出（msg2）或降级（首版只踢，对齐原版版本校验语义）
- `features` 位图：bit0 SSC（服务器侧角色）、bit1 section 缓存、bit2 插值缓冲 …——未知 bit 忽略（前向兼容）
- 未知 msgId **跳过不断连**（原版 `b >= MessageID.Count` 丢弃，MessageBuffer.cs:137-139 同语义）

### 1.3 编码惯例（照搬 .NET BinaryWriter 语义）

| 类型 | 编码 |
|---|---|
| 数值 | LE 定宽（u8/i8/u16/i16/u32/i32/f32）——**不用 varint**（对齐原版，可对照逐字段校对） |
| 字符串 | u7-bit 前缀长度 + UTF-8（BinaryWriter.Write(string) 惯例：每字节高位续位） |
| bool | u8（0/1） |
| Vector2 | f32 x, f32 y |
| BitsByte | u8 位域（对齐原版大量 `BitsByte` 用法，位义在消息字典中定义） |
| 可选字段 | BitsByte 先行声明"哪些字段存在"，存在才写（对齐原版 msg13/23/27 惯例） |

### 1.4 分片协议（超 64KB 载荷，如大型 section 压缩结果或未来 SSC 全量背包）

原版无此机制（靠 section 200×150 本身小于上限，Deflate 后 30K 级）。我们保留：
- 逻辑通道：`{u8 chanId, u8 flags, u16 fragIdx, u16 totalFrags, payload}`，flags: bit0=first, bit1=last
- 收端按 chanId 组装，超时 10s 丢弃
- 仅在实测单 section 超 60KB 时启用（预留，首版不实现）

### 1.5 NetModule 表（显式建表——原版靠注册顺序隐式编码，是移植坑）

| moduleId | 模块 | 我们的状态 |
|---|---|---|
| 0 | Liquid（脏矩形批量，按 section 过滤） | P3 实现 |
| 1 | Text（聊天；命令服务器执行） | P4 实现 |
| 2 | Ping（RTT 样本） | P0 实现 |
| 3-14 | Ambience/Bestiary/Creative/Pylon/Particles/Banner/Crafting/TagEffect/Leash/UnbreakableWall | 暂缓（功能未到，占位跳过） |

## 2. 消息字典（首期实现范围，字段对齐原版）

> 完整语义见调研报告；此处给首期 wire format。`C→S`/`S→C`/双向。

### P1 握手/世界

**msg1 Hello（C→S）**：`string magic/protoVer 特性位（§1.2）`
**msg2 Kick（S→C）**：`u8 原因码, string 说明`
**msg3 PlayerSlot（S→C）**：`u8 slot, u8 特性位`（服务器从 0..254 分配空闲 slot）
**msg6 RequestWorldData（C→S）**：空
**msg7 WorldData（S→C）**：对齐 NetMessage.cs:210-393 字段集（裁剪项注释）：
```
f64 time; u8 dayTime; u8 bloodMoon; u8 eclipse; u8 moonPhase
u16 maxTilesX; u16 maxTilesY
i32 spawnX; i32 spawnY
f32 worldSurface; f32 rockLayer
i32 worldId; string worldName
u8 gameMode; string uniqueId(裁剪:传 worldId 字符串)
u8 flagsBits×N（downedBoss/hardMode/事件 → 对应 world.flags 逐位）
（裁剪：风/云/沙尘暴/种植背景——功能未到；预留 u16 reservedBits 保持前向兼容）
```
**msg8 SpawnTileData（C→S）**：`i32 spawnX, i32 spawnY`（客户端给出生点，服务器回 5×3 section，MessageBuffer.cs:647-860）
**msg9 StatusText（S→C）**：`i32 sectionCount`（进度条）
**msg10 TileSection（S→C）**：
```
i32 xStart; i32 yStart; i16 width(200); i16 height(行块 150)
[deflateRaw 后的字节]：
  每 tile 位标志 u8（对齐 CompressTileBlock 位义）：
    active/type>255/type/frameX/frameY/wall/liquid/liquidType/wire1-4/half/slope/actuator/inActive/color/wallColor
  + 存在通道的数据；RLE 重复计数
尾部：u16 chestCount + chests{u16 x,u16 y,items...}；signs 同构
```
首版实现顺序：**裸 RLE 先行（头部加 u8 codecVer=0），codecVer=1 再上 deflateRaw**——两版可共存。
**msg12 PlayerSpawn（双向）**：`u8 slot, i32 x, i32 y, i32 respawnTimer, u8 团队/死亡计数`
**msg129 FinishedConnecting（S→C）**：空
**msg154 / module2 Ping（双向）**：`i32 clientTs`；回传原值，客户端算 RTT

### P2 玩家

**msg4 SyncPlayer（双向）**：`u8 slot, string appearanceJson`（Appearance：hair/skinVariant/7×RGB/difficulty，~100B）
**msg5 SyncEquipment（双向）**：`u8 slot, u8 invSlot, i16 itemId, u8 prefix(裁剪), i16 stack, u8 favorited`
**msg13 PlayerControls（C→S→广播）**：对齐 NetMessage.cs:429-494：
```
u8 slot
BitsByte ctrlA（left/right/up/down/jump/使用/朝向1/朝向2）
BitsByte ctrlB（速度非零/坐骑/睡觉/重力翻转/潜行/盾/ghost/虚空袋）
u8 selectedItem; f32 x; f32 y;
[速度非零] f32 vx, f32 vy
[坐骑] u8 mountType(裁剪:仅标志位)
```
**msg14/16/42/50**：active / `u8 slot, i16 life, i16 lifeMax` / mana 同构 / buff 列表（裁剪：暂传计数+占位）
**msg21/22 SyncItem/ItemOwner（双向）**：掉落物（slot=400 表示"请服务器分配"，对齐原版）；归属 `u8 itemSlot, u8 playerSlot`

### P3 实体

**msg23 SyncNPC（S→C）**：对齐 NetMessage.cs:669-745：
```
u8 slot; f32 x,y,vx,vy; u16 target; u8 方向位
BitsByte aiFlags（ai[0..3] 哪些非零）+ 存在的 f32 ai[]
i16 netID(vanillaId); u8 life 档位(0:sbyte/1:short/2:int) + life
```
**msg27/29 SyncProjectile/Kill（双向）**：`i16 identity, f32 x,y,vx,vy, u8 owner(强制=whoAmI), i16 type, ai[0..2], i16 damage, f32 knockBack`——服务器收到强制 `owner=slot`（对齐 MessageBuffer.cs:1742）
**msg28 DamageNPC（C→S→广播）**：`u8 npcSlot, i16 damage, f32 knockBack, u8 hitDir+1, u8 crit`
**module0 NetLiquid（S→C）**：`u16 rectCount, 每 rect{u16 x,y,w,h} + 每格 u8 liquid + u8 type`（对齐按 section 过滤；节流 30t/次）
**module1 NetText（双向）**：聊天 `u8 authorSlot, string text, u8 r,g,b`；命令 `/kick /time …` 服务器执行（对齐 ChatHelper）

### P4 交互

**msg17 TileManipulation（C→S）**：`u8 action(0=挖/1=放/2=拆墙/3=放墙/…), i32 x, i16 data1, i16 data2`（action 枚举对齐原版 0..25）；服务器执行 WorldGen 等价逻辑后广播 msg17，**失败回 SendTileSquare 纠正**（MessageBuffer.cs:1253-1263 语义）
**msg20 SendTileSquare（S→C，必要时 C→S）**：`i16 x,y; u8 w,h; 每 tile {BitsByte×3 + 存在通道}`（对齐 NetMessage.cs:524-626），只广播 SectionRange 覆盖者
**msg19 门 / 31-34 箱子四条 / 59 开关 / 61 Boss 召唤 / 65 传送**：薄事件包，字段对齐原版
**msg90 InstancedItem**：私有掉落（`u8 playerSlot` 前缀，只发该玩家）

## 3. 服务器架构细则（server/，Node+TypeScript）

### 3.1 目录与构建

```
server/
├─ package.json            # 依赖: ws, tsx; type: module; 无 DOM lib tsconfig
├─ tsconfig.json           # { lib:["ES2022"], paths: { "@game/*": ["../game/src/*"] } }
├─ src/
│  ├─ index.ts             # CLI(--port/--world/--public/--save-interval) + 启动
│  ├─ net/Buffer.ts        # 读/写缓冲（131070B 上限对齐）、CheckBytes 粘包
│  ├─ net/RemoteClient.ts  # slot 状态机(State -1..10)、TileSections 位图、
│  │                       #   SpamUpdate 限流器、TimeOutTimer、发送队列
│  ├─ net/dispatch.ts      # msgId → handler 分发（对应 MessageBuffer.GetData）
│  ├─ net/encode.ts        # 全部 S→C 编码器（对应 NetMessage.SendData）
│  ├─ game/ServerGame.ts   # 60Hz 主循环：NPC AI+刷怪+液体+电路+Wiring 事件
│  ├─ game/Sections.ts     # CompressTileBlock(RLE/deflate)、CheckSection、位图
│  ├─ game/NpcSync.ts      # msg23 快照调度（netUpdate 收集 + netSpam 限流 + section 过滤）
│  └─ world/WorldHost.ts   # 世界加载/生成/定期存档（复用 @game 引擎模块）
└─ tests/                  # vitest 复用根配置
```

- **复用清单**（全部验证过零 DOM）：`WorldGen.generateWorld`、`settleWorldLiquids`、`LiquidSim`、`SaveFile.{saveGame,loadSaveData}`、`World/TileStore`、`VanillaSpawner`、`rng`。加载路径用相对 import + tsconfig paths，构建用 tsx 直跑（开发）与 tsc 产物（部署）双轨
- 唯一已知雷：`SaveFile.ts` 的 `btoa/atob`（Node 16+ 原生）✓

### 3.2 进程模型（对齐原版线程语义）

- Node 单线程 = 原版"IO 线程搬字节 + 主线程跑逻辑"的天然退化：WS `onmessage` 只做 `buffer.append(bytes)`；**全部解析与游戏逻辑在 60Hz `setInterval` tick 内**（对应 UpdateServerInMainThread）
- tick 超预算（>12ms）告警并计入直方图（§6 监控）；连续超限触发降级（NPC 同步降频）
- 世界加载/生成（重 CPU，可达数秒）**不得阻塞 tick**：启动期允许（无客户端），运行期再生成走子进程 `worker_threads`（预留）

### 3.3 生命周期与存档

| 事件 | 行为 |
|---|---|
| 启动 `--world <id>` | 加载 IndexedDB？否——服务器读**文件**：`worlds/<id>.json`（saveGame 格式）；缺省自动生成小世界 |
| 定期 `--save-interval`（默认 300s） | 全量 saveGame 写文件（原子写：tmp+rename）；对齐原版"退出存档"+防崩溃增强 |
| 最后一人离开 10min（`--empty-timeout`） | 可选停服存档（公网常驻则不启） |
| SIGINT/SIGTERM | 存档 + 优雅断开（msg2 原因码=server_shutdown） |

### 3.4 广播管线与带宽预算

- 每客户端**每 tick 发送字节预算**（默认 16KB，`--budget`）：优先级 心跳 > 玩家 > tile 事件 > NPC 快照 > 物品 > 液体；超预算顺延下 tick（对应原版 netSpam 思想的系统化）
- **section 压缩缓存**：`Map<sectionKey, {data, worldVersion}>`——世界 tile 静态为主，同 section 多客户端/重连复用压缩结果；任何 msg17/20 修改使相关缓存失效（优化项 §8.3）
- 合包：单 tick 内同客户端待发 ≤2KB 的包合并为一条 WS 消息（帧内原版包格式不变，对齐 §1.1）

### 3.5 内存

- 中世界 6400×1800 ≈ 46MB（TileStore）+ section 缓存（200×150 块压缩后均 ~30KB × 已压缩块数）+ 客户端缓冲 131KB×256 上限。设计余量 512MB/世界
- 进房**不传整图**（原版同款 section 流）→ 无 packWorld transfer 语义问题（worldPacket 仅用于服务器内部/单机）

## 4. 客户端架构细则（game/src/net/）

### 4.1 模块

```
src/net/
├─ NetMode.ts        # netMode 0/1/2 + isServer/isClient 谓词（对齐原版裸比较语义）
├─ MessageBuffer.ts  # 收包缓冲 + CheckBytes + msgId 分发（与 server/net/Buffer.ts 同源双份或提 shared/）
├─ ClientNet.ts      # WebSocket 连接 + 握手状态机 + 重连(§6.4) + RTT 采样
├─ NetPlayers.ts     # slot→远端 Player 实例池；msg13 应用 + netOffset 平滑
├─ NetEntities.ts    # npcSlot/projIdentity→本地 Enemy/投射物实例 + 快照应用
└── applyTiles.ts    # msg10/17/20 → store.setTile/setWall/...（复用 onTileChanged 事件链，
                      #   禁用 *Silent 与直写数组——调研确认 7 个下游全靠事件链）
```

### 4.2 Game 集成点

| 位置 | 改动 |
|---|---|
| `fixedUpdate` 头部 | `net.pump()`（解析入包、应用快照）——1 行 |
| 玩家输入 `Game.ts:815-818` | 联网时额外打包 msg13（事件驱动：位置变化>1px 或按键变化；兜底 420t 对齐原版，见 §8.1 优化） |
| `trySpawnEnemy`/`LiquidSim.step`/`fellTree`/Boss 召唤/箱子写入 | **netMode==1 时全部短路**，改为发消息（服务器权威侧执行） |
| 渲染 | 远端 Player 包装成带 draw 的实体塞 entities 列表（蹭现成 y 排序），drawPlayer 循环复用 |
| `this.player` | 保留为"本地玩家"别名（避免 200+ 处机械改），远端玩家独立桶 |
| 迷雾 markExplored | 仅本地玩家驱动（天然免费，存档本就不含 explored） |
| Boss 血条/公告/老人重生 | 仅服务器侧触发广播（客户端收事件渲染） |

### 4.3 插值（默认对齐原版 + 可选增强）

- **默认（1:1）**：msg13 到达直接覆写 + `netOffset` 平滑（NPC.cs:91321-91357 同款：距离 ≤300px 累积偏移，每 tick 衰减回 0）
- **可选 `--opt-interp`（§8.2）**：快照缓冲 100ms + 渲染插值（Entity 渲染位置 = lerp(prev, cur, α)），逻辑位置仍是最新快照——不改判定只改视觉
- 本地玩家零延迟（客户端权威，原版同款）

## 5. 同步职责矩阵（与原版逐格对齐）

| 状态 | 服务器 | 拥有者客户端 | 其他客户端 |
|---|---|---|---|
| tile/墙/液体/电路 | 权威模拟+下发（msg10/17/20/module0） | 上报请求 | 事件链应用 |
| 时间/天气/事件/flags | 权威（msg7/18） | — | 应用 |
| NPC 生成/AI/血量 | 权威 + msg23/28 广播 | 上报伤害 | netOffset 平滑 |
| 玩家位置/动作 | 中继覆写广播 | 权威模拟+上报 | 覆写+平滑 |
| 玩家物品栏/生命 | 中继（SSC 可选时权威） | 权威 | 应用 |
| 弹幕 | 中继+section 过滤 | **owner 权威**（跑 AI 上报 msg27） | 播放 |
| 掉落物 | 分配 slot+归属+广播 | 上报生成/拾取 | 应用 |
| 聊天 | 命令执行+广播 | 上报 | 显示 |

## 6. 工程最佳实践

### 6.1 心跳与超时
- module2 Ping 每 3000t（50s）双向；RTT 滑动均值上报 UI（ping 显示）
- 7200t（120s）无任何入包 → 判超时（对齐原版 TimeOutTimer）；WS close/ping/pong 底层异常直接触发同路径

### 6.2 背压与限流
- 服务器发送：§3.4 字节预算 + netSpam 限流（原版常量：弹幕 60、tile 500、液体 30 档）
- 服务器接收：**轻量 spam 计数默认开**（原版 `SpamCheck=false` 是已知宽松点，我们作为偏离项 §8.6 记录：挖块 >500/min 告警、>2000/min 踢）——防一人卡全场
- WS 缓冲水位监控：`bufferedAmount > 256KB` 的客户端标记慢速，跳过非关键广播（NPC 快照降频），避免雪崩

### 6.3 安全
- slot 覆写 `index = whoAmI` 全点位强制（对齐原版）；弹幕 owner 强制、敌对弹幕拒收（MessageBuffer.cs:1743-1746）
- State<10 白名单门禁（MessageBuffer.cs:161-171 原样保留——防乱序与未握手发包）
- 未收 section 的客户端 tile 操作按原版"无掉落"处理（msg17 flag13 语义）
- 伤害上报信任但**记录**（可选 §8.7：单次伤害 > 理论上限 3 倍 → 踢，默认关）
- 密码：msg37/38 保留（`--password`）；banlist 文件（对齐 IsBanned）

### 6.4 断线重连（**原版没有，必备增强**）
- 原 msg3 附 `u32 sessionToken`；断线 120s 内携 token 重连 → 服务器保留 slot/位置/物品栏，补发其 TileSections 缓存 + 周边 section + 全体玩家/NPC 快照，跳过完整握手
- 超时或服务器重启 → 客户端走全新握手（SSC 开启时角色从服务器档恢复，否则提示）
- 客户端侧：WS close 自动退避重连（0.5s/1s/2s/5s 封顶），期间本地玩家冻结 + "重连中"遮罩（不做本地预测——玩家本就客户端权威，重连后从最后位置继续，物品栏本地保留）

### 6.5 观测性
- 服务器 `/stats`（HTTP :7778，只绑 localhost 或 `--stats`）：在线 slot/RTT 直方图/tick 耗时直方图/每客户端带宽与缓冲水位/NPC 数/液体活动格/section 缓存命中率
- 结构化日志（JSON 行）：连接/断开/踢出（含原因码）/存档/异常，探针可直接断言
- 每 3600t 广播 msg7 时附带校验和（world flags + time），客户端静默丢弃冲突（防御性）

### 6.6 测试策略（沿用仓库探针范式）
| 层 | 手段 |
|---|---|
| 编解码 | vitest 单测：每条消息 roundtrip + 与 C# 字段布局逐字节对照的黄金样本（手工从原版抓或推导） |
| 协议 | Node 内回环：假客户端按握手序列发包，断言状态机转移与回包序列 |
| 一致性 | puppeteer 双浏览器探针：A/B 连同一 server，断言共享状态（tile hash/玩家位移/NPC hp）逐 tick 一致 |
| 稳定性 | 长稳脚本：随机操作流 10min + 断线注入 + 存档恢复比对 |

## 7. 局域网与部署

### 7.1 LAN
- server 启动 UDP :8888 每 1000ms 广播（载荷对齐原版 BroadcastThread：`int 魔数 1010, int port, string 世界名, string 主机名, u16 尺寸, bool 猩红, int 模式, u8 上限, u8 在线, bool 困难`）
- 浏览器无 UDP → 三档加入方式：
  1. **手动输 IP**（首版，`192.168.x.x:7777`，同原版主路径）
  2. 本机代理发现：server 附带 HTTP `:7778/lan`（CORS 开放），客户端页面试探常见网关段（`http://<网关>.1..254:7778/lan` 代价高——仅作为实验项）
  3. mDNS 广播 `sandboxworld._tcp`（`bonjour` 包；浏览器不解析 mDNS，供原生客户端/工具用）
- 局域网与公网**同一进程同一协议**，仅 `--public` 时关 UDP 广播、开 stats 鉴权

### 7.2 部署
- 单文件 `node dist/index.js --port 7777 --world 1 --save-interval 300`；systemd/PM2 单进程
- 反代注意：WebSocket 需要 `nginx: proxy_set_header Upgrade/Connection`；禁用反代层压缩（内层已有）

### 7.3 中央服务器房间制（v3，已实现）

单进程双端口：**WS :port（默认 7777）+ HTTP lobby :port+1（默认 7778）**。一台中央服务器承载多房，每房一个世界实例。

**HTTP lobby**（`server/src/index.ts`）：

| 端点 | 行为 |
|---|---|
| `POST /rooms` | 建房。body `{name, public, protectTiles, protectItems, save}`（save=存档 JSON，≤256MB）→ `{code, hostToken}`。hostToken=`randomUUID()`，仅建房端持有 |
| `GET /rooms` | **公开**房间列表（非公开房不出现，只能码进） |
| `GET /rooms/<6位码>` | 码校验（加入前置检查；非公开房也可查） |
| `DELETE /rooms/<码>?token=` | 房主关房（token 校验） |
| `GET /lan` | `{magic:1010, port, rooms, lanIps}`（LAN 发现/本机 IP 分享） |

全端点带 CORS + `Access-Control-Allow-Private-Network`（Chrome PNA）。房间码=6 位随机数字查重；上限 32 房；创建满 1 分钟且无人满 5 分钟回收。

**WS 路由**：URL = `/<6位码>[?token=<hostToken>]` → `Room`（`server/src/room.ts`）。token 经路由层注入 `RoomClient.urlToken`；Hello 消息内 token 兜底。首携正确 token 的连接=房主（`hostJoined` 单例防多主）。

**双保护**（用户需求："除房主外没有方块编辑毁坏能力；物品保护=不能取放房间物品，自动拾取豁免"）：
- **破坏保护 protectTiles**：服务端权威——非房主 `TileBatch` 整包拒绝 + 对前 8 个 op 回发权威快照 correctionFrame（对齐原版 SendTileSquare 纠正语义，清客户端乐观预测）
- **物品保护 protectItems**：`RoomPolicy`（msg200）下发 → 客户端集中门禁（`Game.netCanEditTile()/netCanChestInteract()`，挂在 tryMine/tryPlace/tryPlaceWall/useWireTool/interactAt/tryOpenChest 入口；自动拾取不门禁）。v1 无箱子内容同步，门禁开箱即拦截
- 单人（`net==null`）/房主恒放行；拒绝提示 2s 节流

**客户端**（`game/src/net/ClientNet.ts` + `game/src/ui/MultiplayerSelect.ts` v3）：
- 服务器地址输入（默认 `127.0.0.1:7778`，lobby 端口约定 WS=lobby-1）→ 房间列表点击加入 / 码加入 / 建房表单（选存档+公开+双保护勾选 → POST → 显示 6 位码 → 进入房间）
- `Msg.RoomPolicy=200`：S→C `{roomCode, roomName, isHost, protectTiles, protectItems}`，存 `net.policy`；非房主受控时 toast 提示

**探针**：`game/scripts/_roomprobe.mjs`（建房→列表/码校验→房主 token 进房→访客码加入→互见→非房主 op 被拒回滚→房主 op 中继→非公开房列表过滤/码可查，14 断言）。`__swFlow.createRoom/joinRoom` 为探针桥。

## 8. 原版可优化点清单（全部默认关，`--opt-*` 独立开关）

| # | 原版行为 | 问题 | 优化（默认关） | 代价/风险 |
|---|---|---|---|---|
| 8.1 | msg13 兜底 420t（7s！）纯事件驱动 | 网络抖动时远端玩家僵直；Web 场景 RTT 低用不满 | `--opt-posrate`：位置/速度变化驱动的节流上报（≥60ms 间隔、变化>1px 才发），目标 10-15Hz 有效率 | 带宽 ↑（每客户端 ~1KB/s×N）；与原版抓包不可比 |
| 8.2 | netOffset 事后平滑（300px 半径硬阈值） | 瞬移感（快照间隔不均时抖动） | `--opt-interp`：100ms 快照缓冲+渲染插值（§4.3） | 视觉延迟 +100ms；实现量中 |
| 8.3 | msg10 每次实时压缩 | 重连/多客户端重复压缩同一 section | `--opt-seccache`：压缩缓存（§3.4，含失效跟踪） | 内存 ↑（~30KB/块）；tile 频繁修改区命中率低 |
| 8.4 | NPC msg23 逐包广播、跳 4 次容忍 | 带宽浪费（同 section 多客户端重复字段） | `--opt-deltasnap`：每 NPC 每秒 1 次全量 + 期间增量（仅变化字段位图） | 协议复杂化；偏离原版包格式 |
| 8.5 | 玩家物品栏完全客户端权威 | 换设备/掉线丢进度（原版靠 SSC 服务器选项） | `--opt-ssc`：ServerSideCharacter 对齐原版 msg7 位（服务器存角色档） | 原 1.4 已有此开关，实为对齐而非偏离；实现量中 |
| 8.6 | SpamCheck 默认关 | 一人刷爆全场 | `--opt-spam`：§6.2 轻量限流默认开 | 误伤低概率（挖得快的高玩） |
| 8.7 | 伤害数值完全信任 | 秒杀外挂 | `--opt-dmgcheck`：伤害上限校验（默认 3 倍理论值踢） | 联动/反弹类伤害需白名单；默认关 |
| 8.8 | 无断线重连 | 掉线=丢进度退房 | §6.4 session token 重连（**此项建议直接默认开**，非原版但 Web 场景刚需；已在 §4.1 列为必备） | 服务器需短时保留 slot 状态 |
| 8.9 | TCP 队头阻塞 | 大 section 阻塞小指令包 | WS 无法多路复用；缓解=msg10 分片走低优先级通道+每 tick 预算（§3.4 已含） | — |
| 8.10 | 时间/事件全量靠 msg7 周期刷新 | 进程内时钟漂移 | 客户端 clock 以 msg18 事件驱动对齐（§2 P4 已含 msg18=SetTime） | 对齐原版语义，无代价 |

> 原则：**默认路径逐字段对齐原版可抓包比对**；优化项只在明确收益点开启，且每项独立开关、可在 /stats 中看到生效状态。

## 8bis. 2026-08 容量优化批（已实施，PROTO_VER=4）

> 起因：容量估算发现带宽 O(N²)（无 AOI 全房广播）、无观测（静默丢帧）、无持久化（房主退房世界蒸发）。
> 本批落地 P0-P3，探针 `_roomprobe.mjs`（36→50+ 断言）+ 压测 `_loadprobe.mjs` 验收。

| 项 | 内容 | 位置 | 实测/备注 |
|---|---|---|---|
| /stats 观测 | `GET /stats`：全局+逐房+逐客户端（in/out 字节、buffered 高水位、sendDrops、outBps 1s 采样、msg 直方图、stripHit/miss、stalePos） | `server/src/stats.ts`、`Room.send` 埋点 | 优化前的一切调优都是盲调——本项先行 |
| 分级背压 | ≤1MB 正常；1-4MB 只丢 prio=1（实体快照类）；>4MB 全丢，全计数 | `Room.send(c, frame, prio)` | 替代旧"超 4MB 静默丢" |
| 单房人数上限 | `--max-players` + `POST /rooms.maxPlayers`（钳 2-255）；RoomPolicy 尾部 u16 maxPlayers；UI 列表 online/max | `Room.opts.maxPlayers` | slot 物理上限恒 255（重连复位按物理上限校验） |
| 内存护栏 | `--world-budget`（默认 2GB，w×h×11B 估算）+ `--upload-limit`（默认 96MB） | `server/src/index.ts` | 注意 `2<<30` 溢出 int32 的坑（已踩过） |
| **实体 AOI** | msg13 半径 1920px / msg23+27 半径 1280px，滞回外径 ×1.6；接收端位置取其上行 msg13；>5s 无位置按全视野兜底（stalePos 计数） | `Room.broadcastAt` + `aoiBlind` | O(N²)→O(N·k)；msg21 掉落不做 AOI（spawn 一次性事件无重播，过滤会永久不可见） |
| AOI 客户端联动 | >1.5s 无 msg13 → 远端代理冻结输入（防幽灵行走）；NPC 傀儡 300 tick 自然清扫=原版"只收自己 section 内实体"语义 | `Game.simulateRemotePlayers` | 不变量：NPC 2s 兜底(120t) ≪ 300t 清扫阈值，勿改坏 |
| **msg23 短码** | S→C 每条 1B eflags：bit0=含 key 全量 / bit1=boss；平时仅 u16 codeId（服务器 netId→codeId 表，Room 级）。约 -25% msg23 流量。**PROTO_VER 3→4，server 与 game 必须同时发布** | `Room` npcCodes / `ClientNet.npcCodes` | 未知短码静默丢弃，≤2s 全量兜底自愈；表满 60000 清表重播 |
| 合包 | 上行 msg21 攒批 flush；服务器 `flushOutbox` 每 WS message 事件拼发（512KB 切片） | `ClientNet.pendingFrames` / `Room.flushOutbox` | `netDropSweep` 逐条成帧的几十次 send 归一 |
| FrameParser 增量化 | 单缓冲+读写偏移+copyWithin（旧版每 drain 全量合并拷贝） | `protocol.ts` | drain 回调内禁 append（重入断言） |
| section 缓存 | 条带级 LRU 512，`applyTileOps` 按条带归一化失效 | `Room.stripCache` | 高换人率/重连风暴场景的重复 RLE 归零 |
| **世界持久化** | `--world <file>` 常驻房（hostToken='' 首进者为房主）+ `--save-interval`（默认 300s，空房无修改跳过）+ SIGTERM/SIGINT 落盘退出；`saveWorldOnly`（不含玩家，无 SSC） | `server/src/persist.ts`、`SaveFile.saveWorldOnly` | 修复开服.sh `--world` 被忽略的挂账；存档=世界 tile/箱/clock/flags/天气。**部署注意**：SIGTERM 单播主进程实测 0.5s 落盘 ✓（systemd 默认行为）；对进程**组**发 TERM 与落盘并发会静默死亡（机制未定，疑似 npx 转发升级 SIGKILL）——生产用 systemd 直管主进程，避免 npx 包装层 |
| 傀儡插值 | 快照间 smoothstep 插值（4 tick 周期），到点后纯速度外推；逻辑位（netAx/netAy，接触判定）仍=最新快照 | `Entity.netSnapTo/netPuppetStep` | 渲染平滑，判定不漂 |

**已知偏离**（有意为之，记录在案）：
- AOI 下视野外 Boss 无血条（看不见本体时也无血条，语义自洽）；
- 远端玩家离开视野后代理原地冻结（非消失），回视野自动恢复；
- msg23 C→S 全量 / S→C 短码的非对称线格式（服务器重编码点本来就在）。

## 8ter. v5 补齐批（2026-08-12，review 后续）

| 项 | 内容 | 语义依据 |
|---|---|---|
| 敌对弹幕访客伤害 | msg27 kind **bit7=hostile**（仅 kind0/Arrow 携带，host 广播置位/服务器 `(kind&0x7f)>4` 校验透传/访客 `netMakeProj` 重建带 hostile）→ 访客 `netPuppetProjContact` **本地结算**（`hitPlayer`=原版 Damage_EVP 1:1：hostile+dmg>0 门禁/player.immune iframes 门禁/AABB；命中不消耗穿透弹体照飞；`statusPlayer` debuff 以实际伤害为准） | 原版玩家伤害即各端本地结算（HP 客户端权威+msg16 中继，与近战 `netPuppetContact` 同模型）——不走 msg42（那是 NPC 受击链） |
| session 认领制 | 建连只标记 `claimed` 不删条目，**Hello 成功才消费**；握手前断线 `disconnect` 释放认领（60s 窗口内重试有效）；顺带修复旧实现"认领即删→61s 超时回调跳过释放"的 **slot 永久泄漏** | §8.8 三次重连承诺成立 |

PROTO_VER 4→**5**（msg27 kind 值域扩展；server 与 game 同仓库同时发布）。探针新增 3 断言
（hostile 傀儡重建/本地伤害/msg16 中继），53 断言全绿。

**对抗审查补丁轮（2026-08-12 第二轮 review，全部已修）**：
- **Dart/TrapShot 补 hostile**：敌怪射击弹（`Enemy.shootDart` 咽喉 + 3 处直构）与机关/陷阱弹（TrapShot 构造时 `!style.friendly`）随 bit7 下发——v5 首版只覆盖 Boss Arrow 族，普通射击怪远程弹访客整体免疫；
- **服务器剥除非房主 bit7 + dmg 钳 9999**：hostile 位合法来源唯一=房主 NPC AI，否则任意访客伪造 hostile 弹即可无 PvP 开关强制击杀他人；
- **msg21 op=0 三重校验**（netId 属主/key 反查/maxStack 钳位）：堵"伪造掉落凭空造物直塞他人背包"（拾取无需同意），protectItems 只拦写箱拦不住这条链；
- **盲端免伤漏洞**：停发 msg13 → 判盲 → 傀儡表空 → 免疫一切 NPC/弹幕伤害，且 Ping 心跳使看门狗永不触发——对策 `blindAbuser`（盲 >15s 仍发操作类消息即踢；合法后台挂机页不发操作，语义安全）；
- **session 世代判等 + 迟到 Hello 复核**：超时回调按条目对象判等防误删同键新条目；Hello 复核条目仍在防超时后双占 slot；
- **NaN 坐标清洗**（msg13/23/27/21）——非法坐标中继会毒化他人代理物理；
- **空房且脏即时落盘**（ws close 钩子）——"取物后退出"的复制窗口从 ≤300s 收敛到 ~0；
- 弹幕接触判定改权威位（netAx/netAy，与 NPC 接触同标准）；netProjLast 差分基准清理。

**挂账清偿批（2026-08-12 第三轮，v6，PROTO_VER 5→6，全部落地）**：

| 原挂账 | 处置 |
|---|---|
| 上行限流（§6.2 兑现） | 每客户端每秒 per-msgId 计数，阈值=合法峰值 3-6 倍（msg13≤90 / TileBatch≤180 / msg23/27/28/21≤60 / msg5≤30 / 聊天≤30 / msg42≤120），超限踢出 |
| tile/箱帧 >4MB 静默分叉 | prio=0 帧 >4MB 不再丢——**带原因踢慢客户端**（重连全量拉条带自愈）；prio=1 丢弃语义不变 |
| 房主迁移无公告 | 房主离开→"NPC 模拟暂停"公告；新房主产生→"已成为房主"公告（Text 模块 slot=255=服务器直显，客户端无名字前缀） |
| AOI"见人不见弹"空洞 | 实体内径 1280→**1536px**（96t，≈玩家内径 80%），带宽 +20% 换对射可见性 |
| 幽灵弹 180t 窗口 | **msg28 弹幕消亡上报**（各端弹幕消亡批量 netId→服务器中继→接收端即时移除傀儡）；超时清扫降级为兜底 |
| Boss 锚定弹体零同步 | msg27 kind **5-8**：DukeSharknadoBolt/龙卷/MLDeathray/LunarOrb(539/574)。**访客重建真类本地跑确定性 AI**（锚=msg23 傀儡，netId 回溯查找；激光扫描/盘旋/生长/爆炸全本地=原版各端模拟语义）；spawn 类副作用经 !netPuppet 门禁排除（出鲨/落龙卷/线发 576 防双端重复） |
| 双保护非反作弊 | **--ssc 服务器角色档**（v6 msg201）：msg5/16/13 累积→断开/即时落盘 server/ssc/\<name\>.json→同名重连下发应用。语义=原版 ServerSideCharacter 存档型（跨设备恢复），信任模型同原版——仍非反作弊 |
| 断连掉落丢失 | 重连世界就绪后清本地真掉落 netId+差分基准 → netDropSweep 重播 spawn |

**判定位语义定论**（第三轮实测纠正 review F3）：敌对弹幕接触判定用**渲染位**（插值+外推）
而非权威位——原版各端本地模拟，"所见即所中"才是客户端权威语义；权威位在差分快照
间隔内（慢速弹最长 60t）冻结在过期位置，实测造成慢速敌弹系统性漏判。

**近似收紧**（第三轮补）：①MLDeathray 束角**快照回写**——实时角度本就随 exVx/exVy
每帧在线上，傀儡消费式同步（读后清零防回拉振荡），快照间隙本地按扫速自推，后台页
暂停恢复后由下一快照纠偏（消除永久漂移）；②DukeSharknadoTornado **生长状态携带**
——tag=`${big},${ai1},${ai0}`，重建时由快照段盒反解 topY（y = topY − h(ai1)/2 的逆，
与房主同公式确定性对齐），中途入视野不再从零重长、列判定盒不错位。剩余近似
（Orb 冲刺随机抖动双端异掷、猪鲨大弹狂暴速度差、液体导致的激光束长差）为
原版同款模型代价，msg28 消亡兜底误差有界。

**终审（2026-08-12 第四轮，三路交叉审查后修复）**：
- **SSC 双缺陷**：msg201 与 PlayerSpawn 同批到达、loadWorld 的 await 让出栈后应用会写到
  被重建替换的旧 Player 上 → 改**暂存**（net.pendingSSC）、loadWorld 完成后消费；
  世界下载期断开（state=10 但 msg13 未到）会以空背包+(-1e9,-1e9) 覆盖好档 →
  落盘加 lastPosAt>0 守卫 + 补定时刷盘（原仅断开落盘）；
- **重连傀儡残表**：entities.clear() 后 netNpc/Drop/ProjPuppets 等表持孤儿对象，
  同 netId 快照命中孤儿只 netSnapTo 不重新入桶 → 重连后怪/弹幕永久隐形、孤儿 NPC
  用陈旧坐标摸人 → onWorldReady 全清（三傀儡表+两差分基准+箱子 watch+远端代理）；
- 限流阈值按帧计语义重估（SyncItem 60→300：Boss 掉落/钻头连挖是合法峰值；
  StrikeNPC 120→240：穿透群攻瞬时峰）；
- 空房回收改**空置时长**跟踪（原按创建年龄，刚空 5 秒的老房被误回收、误伤 60s 重连窗）；
- 凭据恢复的连接名字以 session 条目为准（防换名占位错乱 SSC 按名落盘）；
- /stats 增 kicks 计数（prio=0 改踢后 sendDrops 剩单一语义）；
- v6 锚定 netId 合成改乘法（位运算 `<<24` 在 slot≥128 溢出 int32 成负数——
  js-bitwise-int32-traps 同族再犯）；msg28 上行分片 ≤64；
  Bolt 速度经 exVx/exVy 通道（原恒 0 访客端小弹静止）；Bolt/Orb 重建坐标左上→中心换算。
已知保留：ItemDrop 傀儡本地直接拾取（先发放后上报的乐观模型，与注释声称的权威
结算不符——记录为已知语义偏差）、msg8/31 无限流（低危 CPU 放大点）、临时房
room-*.json 存档累积（开服.sh 取最新语义可接受）。

**剩余挂账**（确认记录即可）：msg17 无重放（原版同款）、SSC 非反作弊边界、
上行限流阈值为首版经验值（按 /stats 观测调优）、Boss 锚定弹体的束角/爆炸为本地近似
（双端确定性漂移由 msg28 消亡兜底）。

**容量验证方法与实测**（`node game/scripts/_loadprobe.mjs --clients=N --seconds=20 --density=calm|boss [--spread]`，
本机 macOS / tsx server；平均出带宽 = 累计字节/时长，比 1s 采样可信）：

| 场景 | 服务器平均出带宽 | 每客户端 | 备注 |
|---|---|---|---|
| 32 人 calm 簇拥（全互见，AOI 最不利） | 1.43 MB/s | 45.9 KB/s | msg27 17.4MB / msg13 6.6MB / msg23 5.4MB（20s 累计） |
| 32 人 calm spread（一半 5000px 外） | 0.68 MB/s | 21.8 KB/s | **-53%**（AOI 生效，远组互不可见） |
| 100 人 boss 簇拥 | 18.5 MB/s | 184.6 KB/s | 物理上限：全员互见+10 发弹幕互播，带宽 O(N²) 不可约 |
| 100 人 boss（盲端修复前） | 25.6 MB/s | 262 KB/s | 修复前 stale 兜底形成饱和放大循环 |

实测驱动的两个设计修正（2026-08-12）：
1. **盲端语义从"全视野兜底"改为"跳过"**：饱和时 msg13 处理滞后 → 判盲 → 若兜底全量灌流 → 更饱和
   （实测 stalePos 197 万次、带宽反升）。盲端本就在滞后，停发实体流让它先追平，msg13 恢复后自愈。
2. **全员全量快速路径**：簇拥场景（所有接收端都收全部条目）单帧广播零重编码，
   去掉逐接收端 NetWriter 重建的 O(N²) 编码 CPU（msg27 无短码差异时直接复用原帧）。

## 9. 分阶段实施（细化版）

| 阶段 | 交付物 | 探针验收（可执行） |
|---|---|---|
| P0 协议层 | shared Buffer/MessageID 表、server 骨架（WS+握手+空世界）、ClientNet、Hello→slot→msg7 往返 | `probe-net-handshake`：浏览器连 server 收到 msg7 且字段与加载的世界一致 |
| P1 世界流式 | CompressTileBlock(RLE)、CheckSection、TileSections、msg8/9/10/159 | `probe-net-section`：客户端进房后出生点 ±200×150 逐格 hash == 服务器 |
| P2 玩家 | msg4/5/13/14/16/42、NetPlayers、远端渲染、netOffset | `probe-net-players`：双浏览器互见，A 走 10s 后 B 侧位移误差 < 300px 平滑收敛 |
| P3 实体 | ServerGame 60Hz（Spawner/NPC AI/液体/电路）、msg23/27/28/29、module0/2 | `probe-net-npc`：同一 NPC 双客户端 hp/位置 tick 级一致 |
| P4 交互 | msg17/19/20/31-34/59/61/65、聊天 module1、物品归属 | `probe-net-tiles`：A 挖 B 消失 + 掉落归属防抢拾 |
| P5 LAN+UI | UDP 广播、MultiplayerSelect 面板（TitleMenu mp 占位接线）、`npm run host` | 手测双机 LAN；探针覆盖 UI 流程 |
| P6 加固 | 重连(§6.4 默认开)、stats、定期存档、长稳脚本、优化项逐个评估开启 | 长稳 10min + 断线注入恢复比对存档 hash |

## 10. 风险登记（扩充）

| 风险 | 等级 | 缓解 |
|---|---|---|
| TileSection 编码位标志复杂易错 | 高 | 黄金样本单测 + 两客户端 hash 比对探针双重兜底；codecVer 版本位 |
| Node 单线程 60Hz 性能 | 中 | tick 直方图监控；NPC 同步限流；液体可迁 worker_threads |
| 引擎 import 链在 Node 断链（data/tiles 等传递依赖） | 中 | server tsconfig paths 白名单 + `--selftest` 启动自检 + CI 冒烟 |
| 双客户端 tick 不同步导致实体行为分歧 | 中 | 服务器权威实体（NPC/掉落）单一模拟源；客户端仅显示——天然无分歧；玩家判定各自本地（原版同款） |
| packWorld transfer 误用 | 高 | 服务器不用 worldPacket（走 section 流）；单机路径保持现状 |
| WS 在企业代理/HTTPS 环境兼容 | 低 | wss 反代文档；游戏本身不存凭证 |
| 原版语义偏差回归 | 中 | 每条消息实现附原版行号注释；协议单测对照黄金样本 |

## 附录 A. 原版常量速查（实现时直接引用）

```
60Hz tick / 端口 7777 / maxConnections 256 / 玩家 slot 0..254
帧 [u16 len][u8 msgId] ≤65535B / 缓冲 131070B
section 200×150 / 活跃窗口 60t / CheckSection 3×3(fluff=1) / 出生点首包 5×3
msg13 420t / msg36+16+40 900t / msg7 3600t / 超时 7200t
netOffset 平滑半径 300px / NPC 跳过容忍 4 次 / 弹幕 netSpam 60
msg23 life 档位 0:sbyte 1:short 2:int / msg21 slot=400 请求分配
物品槽冷却 timeItemSlotCannotBeReusedFor / msg17 flag13 无掉落
状态机：-1 密码 / 0 连接 / 1 过版本 / 2 发WorldData / 3 发section / 10 在游戏
```

## 附录 B. 源码锚点（1456）

NetMessage.cs（SendData 82 起/CompressTileBlock 1889/SendSection 2695/SyncOnePlayer 2883）、
MessageBuffer.cs（GetData 123/握手 179-930/msg13 937/msg17 1127/msg27 1712/门禁 156-171）、
Netplay.cs（InitializeServer 243/CheckSection 驱动/UDP 广播 796-857）、
RemoteClient.cs（TileSections 37/CheckSection 132/SpamUpdate 76）、
Main.cs（Update netMode 分支 17671/UpdateServer 64004/UpdateClient 63965）、
NetworkInitializer.cs（模块注册顺序 12-26）。

## 8quater. SW-FX42 联机域补债批（2026-09-12，子代理批号 SW-FX42）

> 范围：子系统台账 M3/M9/M10/M11 定谳收口 + 联机面登记批（quest msg74·75 /
> 死亡收尾同步包 / force 位 / 在用箱 / ItemTransfer vid / 超级矿车 msg4 /
> 831·970 / MP 访客命中写位 / teamBasedSpawnsSeed / EndOngoingTorchGodEvent）。
> 全部结论按 1457 终值锚（Terarria1457）；增量通道不升 PROTO_VER（同 §8bis 纪律）。

### 8quater.1 四 M 项定谳表

| # | 项 | 定谳 | 证据 |
|---|---|---|---|
| M3 | 聊天命令系统 | **已闭合**（前批）。客户端解析/执行面 `src/chat/ChatCommands.ts` 13 命令 1:1（ChatCommandProcessor + Terraria.Chat.Commands 全目录）+ BossDamageTracker（NPCDamageTracker 语义链）；MP 出口三通道齐：channel0 房间（Player.ChatColor 难度色随附）/ channel2 命令行（slot=255 系统行中继）/ channel3 队伍频道（按 msg13 team 定向,Main.teamColor）；服务器 `/rules` `/gm` 管理命令 + `/gm <token>` 认证。**残余登记**：原版 dedicated-server 控制台命令族（/kick /ban /time /give…）不在本仓范围（房间策略 UI+PATCH /rooms/:code/rules 承担同域功能）——语义替代备案,勿当缺口复立 | tests/chat-commands.test.ts（13 命令+执行契约）; room.ts channel2/3 支; NetModule.Text 注 |
| M9 | 旅程力量 MP 同步 | **已闭合**（前批）。module5/6/9 全链：服务器权威权限门（journeyPowerAllowed=IsAvailableForPlayer :182-197 等价,逐字段权限粒度聚合快照）/ 被拒回发权威纠正 / SyncThingsToJoiningPlayer 进房全量（权限 15 条+世界态+在场个人态,CreativePowerManager :167-181）/ 时段跳跃 ASharedButtonPower 语义（广播含发送者）/ 研究献祭中继（同队门收端） | room.ts handleJourneyPowersModule/journeySyncToJoiner; tests/journey-mp.test.ts |
| M10 | 液体联机收敛 | **已闭合**（前批）。访客不本地模拟（`!this.net \|\| isHost` 门,Game fixedUpdate 液体段——原版 netMode==1 客户端同语义）；权威端（中继房房主/SimHost）module0 60ms 节流上报 → 服务器镜像直写 + sentStrips 条带过滤逐端重编中继 + SimHost wakeLiquid（sendWater→AddWater 同义）。初装液体随 msg10 strip（liquid/liquidType 通道） | Game.ts:9006-9015 段; room.ts handleLiquidModule/relayLiquidToOthers; tests/mp-sync-pack.test.ts module0 段 |
| M11 | 多人索敌 | **分两半定谳**：①敌怪索敌全玩家槽（TargetClosest 扫 255 槽/CheckActive 屏内门/法师 telefrag）**已闭合**（前批,candidatePlayers 钩）。②随从目标同步（msg115 MinionAttackTargetNPC / msg99 MinionRestTargetPoint）**免接线**——设计定谳见 8quater.3-A | tests/multi-targeting.test.ts; Player.ts:1195 minionTargetId |

### 8quater.2 本批接线（四刀,每刀独立可回滚）

| 刀 | 原版锚（1457） | 实现 |
|---|---|---|
| ①渔夫任务 msg74/75 | Main.AnglerQuestSwap 头门 `if (netMode == 1) return;`（Main.cs:3851-3855——**原版客户端从不本地重掷**,此前本仓黎明每端各自 swap+roll）;msg74={byte anglerQuest, bool finished-for-you}（NetMessage.cs:1147-1153,读 MessageBuffer.cs:3145-3151,进场下发 :2682）;msg75 交付上行（MessageBuffer.cs:3152-3160,发送位 Main.cs:40948） | module15（=NetModule.AnglerQuest,依 InstancedLoot=14 先例取 15,增量通道）：sub0=任务断言（权威端=房主上行,服务器记账+排除发送者广播+进房补发;收端 world.anglerQuest 直写+今日旗复位=AnglerQuestSwap :3805-3806 面）/ sub1=交付上行（服务器 per-slot 今日集——**按 slot 不按名**,本仓名可改+重连凭据同 slot 保去重）/ 进房补发含已交付集。重掷确定性（seed^dayCount 播种）本使任务号天然一致,sub0 的净增益=访客不再各自跑 swap 的名单清空竞态 + 重连/晚进房的今日交付去重（此前访客重进即可重复领奖励）。**serverAuth 房登记**：SimHost 不跑 Game 黎明链,任务重掷/交付面未挂——拓展位见 8quater.4-R11 |
| ②死亡收尾同步包 | Player.KillMe → ChatHelper.BroadcastChatMessage(deathText, (225,25,25))（Player.cs:39221-39223）;msg118=SendPlayerDeath（SendData(118),NetMessage.cs:2624-2630,读 :3903-3922 KillMe 重放） | handlePlayerDeath newText→**chatBroadcast**（BroadcastChatMessage 等价单口：本地消息列+联机 channel2 系统行中继）。msg118 的 KillMe 重放面在本仓由既有 msg13 ghost 旗+msg16 hp=0 承担（死局/尸体表现已通）,本刀只补死亡文本跨端可见性——不引入 118 包（重放机不存在,发无人消费的包=死码） |
| ③force 位同步 | msg7 携 forceHalloweenForToday/XMasForToday（NetMessage.cs:340-341 bitsByte9[6]/[7],读 :588-589）+ forceHalloweenForever/XMasForever（:385-386 bitsByte14[1]/[2],读 :628-629） | forever 位在 world.flags→**msg7 通用 flags map 本就随帧同步**（WldImport/SaveFile 同键）;ForToday 位是 Game 私有运行时位（月事件 wave15 胜利当日,黎明先清再按事件重设 Main.cs:10833-10846）→ module15 sub2 断言（权威端每黎明 checkSeasonal 后发 {u8 bits}=合并结果+ForToday 四位;收端直写 clock.halloween/xMas+Game 私有位。原版收端收 force 位后各自重算 checkXMas/checkHalloween（Main.cs:13290-13344）——本仓发送端已算好合并值,直写=同一读数,登记省去重算） |
| ④在用箱 | msg31 服务器门 `Chest.UsingChest(num256) == -1`（MessageBuffer.cs:1869）+ `Main.player[whoAmI].chest = num256`（:1875）+ msg80 广播（:1878）;msg33 开/关箱公告→服务器更新+广播 80（:1962-1977）;进房补发=SyncOnePlayer 捆包 msg80 段（NetMessage.cs:2924）;UsingChest 消费=Wiring.cs:2571/:2667（提纯机/抽取机拒在用箱） | 服务器 `chestUserBySlot: Map<slot,chestIdx>`（=Main.player[].chest 单值语义,换箱自动让位）+ msg31 占用拒（不发内容,请求端回占用者镜像）/ msg33（Msg.ChestOpenState=33,客户端开/关公告{i16 chestIdx(-1=关),i32 x,y}）处理 + msg80（Msg.ChestInUse=80,{u8 slot,i16 chestIdx,i32 x,i32 y}）广播/进房补发/断线释放。客户端：msg80→chestOpenByPlayer 镜像+拒绝匹配清 netPendingChest（防陈旧 pending 被他人编辑广播误开面板）;tryOpenChest 尾开箱公告+closeChestPanel 访问器包装关箱公告（仅世界箱 x>=0,储蓄族 x<0 不在 Main.chest 域）。**serverAuth 房**：SimHost 不发公告,锁不生效（同 8quater.4-R11 拓展位）;箱改名 msg69 域整缺一并登记 |

测试：tests/sw-fx42-mp-faces.test.ts（17 测：编解码往返/权威门/记账清账/进房补发/null 门/占用锁/换箱/断线释放/ClientNet 镜像/源锚 tripwire）。

### 8quater.3 设计定谳（免接线,禁止未来无消费面硬加）

**A. M11 随从目标同步（msg115/msg99）——免接线。**
原版同步的存在理由 = 全机模拟全部弹幕：`Projectile.OwnerMinionAttackTargetNPC`
（Projectile.cs:568-577）在**每台机器**上读 `Main.player[owner].MinionAttackTargetNPC`
（msg115 写 NetMessage.cs:1361-1365 / 读 MessageBuffer.cs:3592-3601,服务器覆写 slot 后
中继;变更检测发送位 Main.cs:17859-17866;msg99 MinionRestTargetPoint 同构 :17859 前段）。
本仓弹幕权威模型 = owner 单端模拟（netProjBroadcast kind 表无随从族）→ 随从 AI 的
集火消费面只存在于 owner 端,本端 `player.minionTargetId` 本地读写已闭环
（FX19 双写源：召唤杖右键 Player.cs:57586-57605 + 鞭 tag Projectile.cs:14321-14323;
失效清除 :57682-57685）。目标标记绘制（Extra[199],Main.cs:47245-47270）原版本就只读
localPlayer → 无同步亦 1:1。**结论：接线=零消费死码（反伪影纪律禁）。**
未来消费面清单（届时才接线）：远端观战 UI 显示他人集火目标 / 随从弹改服务器权威 /
owner 端离线后他人接管随从模拟。

**B. 超级矿车 msg4 位——免接线。**
msg4 PlayerInfo bitsByte16[3]/[4]=unlockedSuperCart/enabledSuperCart
（NetMessage.cs:185-186,读 MessageBuffer.cs:346-347）。本仓 msg4=appearance JSON
（含 hairDye/voiceVariant 扩展,无 superCart 位）。跨端消费面=零：消耗面
`UsingSuperCart` 三元（Mount.cs:4851→Player.cs:3955-3961）是**移动权威面**=本端
客户端权威（同 msg13 位速自报模型）,远端不重算他人移动;远端坐骑渲染本就不同步
mount 类型（msg13 无 mount 段——若未来补坐骑外观同步,随其一起带 superCart 位）。
SSC 档扩展位备案：server/ssc/<name>.json 可加 superCartUnlocked（原版 SSC 存档面）,
当前 SSC record 契约不动。

**C. 831/970（沙漠虎宝石/阿比盖尔计数器）联机面——免接线。**
AI_164_StormTigerGem（Projectile.cs:47449-47490）消费 `player.stormTiger /
player.abigailMinion` owner 闩位——原版全机跑 AI 才需同步;本仓 owner 单端模拟,
闩位/升级音（970 peerCount>1,MinionProj.ts:1244 段）/计数环绕全部 owner 端闭环。
两弹既不在 netProjBroadcast kind 表（远端本就不显影）=与全库随从族同模型,无特例债。

**D. ItemTransfer vid——已携,消费面近似维持登记。**
Chest.VisualizeChestTransfer（Chest.cs:309-317）把 itemType 打进
`UniqueInfoPiece = itemType | flags<<24`（bit0-3=RandomizeStart/End/TransitionIn/
Fullbright）——本仓 module8 粒子载荷 21B 1:1（uniqueInfo i32 原样过网）,**vid 传输面
已通**;消费端 orchestraFx 的金闪近似不画 item 图标（ItemTransferParticle 的图标位
移动画需贴图池 API,orchestraFx.ts:1949-1961 段注登记在案）——维持近似,非传输缺口。
CoinsBatch（:319-330）按铜银金铂拆四发,同通道自然覆盖。

### 8quater.4 联机面登记册（SW-FX42,后续批次按此取号）

| # | 项 | 1457 锚 | 处置 |
|---|---|---|---|
| R1 | quest sync msg74·75 | Main.cs:3851-3855 / NetMessage.cs:1147-1153,:2682,:2688 / MessageBuffer.cs:3145-3160 | ✅本批接线（8quater.2①） |
| R2 | 死亡收尾同步包 | Player.cs:39221-39223 / NetMessage.cs:2624-2630 / MessageBuffer.cs:3903-3922 | ✅本批接线（8quater.2②,文本面）;118 重放面=msg13 ghost+msg16 承担,不发死码包 |
| R3 | force 位同步 | NetMessage.cs:340-341,:385-386 / MessageBuffer.cs:588-589,:628-629 | ✅本批接线（8quater.2③,sub2）;forever 位经 msg7 flags 已通 |
| R4 | 在用箱 | MessageBuffer.cs:1869-1878,:1962-1977 / NetMessage.cs:2924 / Chest.cs:492-503 / Wiring.cs:2571,:2667 | ✅本批接线（8quater.2④）;Wiring 在用门为未来消费位（机制模拟端=房主,本地 chests 有 UsingChest 等价数据后可直查 chestOpenByPlayer） |
| R5 | ItemTransfer vid | Chest.cs:309-330（UniqueInfoPiece=itemType\|flags<<24） | ⚠️维持近似登记（8quater.3-D：vid 已过网,消费端金闪近似不画图标） |
| R6 | 超级矿车 msg4 位 | NetMessage.cs:185-186 / MessageBuffer.cs:346-347 | ⚪免接线（8quater.3-B）;SSC 扩展位备案。**FX52 收口复核（2026-09-13）**：锚亲读核实（bitsByte16[3]/[4]=unlocked/enabledSuperCart 写/读面真实在位）；消费面 UsingSuperCart=Mount.cs:4851/LegacyPlayerRenderer.cs:150/Player.cs:29512 全 own-player 域,移动权威=本端自报（msg13 模型）→ 跨端零消费面,免接线维持;protocol.ts superCart 位结构锁=tests/sw-fx52-mp-protocol-r6r11r12（死码位禁入线格式） |
| R7 | 831·970 联机面 | Projectile.cs:47449-47490（AI_164 闩位）/ :8069,:9184（SetDefaults） | ⚪免接线（8quater.3-C,owner 单端模型） |
| R8 | MP 访客命中写位 | Projectile.cs:13382-13389（ownedBySomeone 弹命中写 Main.player[myPlayer].lastCreatureHit）/ Player.cs:20609-20619,:44769-44775 | ⚠️登记未建模：host 端收访客弹命中（fromPlayer=false）不写 lastCreatureHit/图鉴旗杀 credit——原版 host 聚合面（ApplyDamageToNPC 三写位并集）;需 per-slot 写模型+计数器归账设计,非小刀。仓内锚=Enemy.ts hurt fromPlayer 段注（"MP 远端访客弹不写=原版 ownedBySomeone host 聚合面登记未建模"） |
| R9 | teamBasedSpawnsSeed | msg7 bitsByte13[5]（NetMessage.cs:379,读 MessageBuffer.cs:623）;消费=MessageBuffer.cs:686（PlayerSpawn 落位）/ Main.cs:43492 / Player.cs:37912 / NPC.cs:5584 | ⚠️半通：**旗随 msg7 seedFlags 尾段已同步**（worldgen 域 IIIIII22b 已建 ExtraSpawnsRoyale 全流程）;消费面=队伍出生点选择（有队玩家落 team 岛）未建模——本仓访客落点=世界 spawn（msg12 单点）,原版按 team 播 teamBasedSpawnsSeed 岛位。设计位=server PlayerSpawn 落点按 msg13 team 分派（岛位表 SimHost/host 可算）;与 Renderer.ts 层恒画（单人语义同原版）无关 |
| R10 | EndOngoingTorchGodEvent MP 包 | Player.cs:17834-17844（happyFunTorchTime→RelightTorches 逐火把 SendTileSquare + msg4 重播 bit1）;RelightTorches :17896-17910 | ⚠️登记免接线（大部分已自然覆盖）：RelightTorches 的 tile 写（frameX-=66）在本仓走 TileBatch netReporter 自动收敛=SendTileSquare 等价;happyFunTorchTime 旗（msg4 bitsByte16[1],NetMessage.cs:183/MessageBuffer.cs:344）跨端消费面=零（torch luck 是各端本地结算,TorchAttack 门 `whoAmI != Main.myPlayer` return——Player.cs:17922-17925 原版本就不跑他人）→ 只余 msg4 重播位,无消费者不发。火把神事件本体 1:1 已随 SW-BJ38/RB9a 落 |
| R11 | serverAuth 房任务/箱子公告拓展位 | SimHost（server/src/sim/SimHost.ts）不跑 Game 黎明链/开箱链 | ⚠️登记拓展位：dawnRolls 挂 anglerQuest 重掷+sub0 断言 / 开箱走服务端 case31 复刻 MessageBuffer.cs:1879 直触发（tryOpenChest 内已有同注）——SimHost 侧实现,中继房不受影响。**FX52 收口（2026-09-13）**：①任务半边✅闭合——SimHost.dawnRolls 置顶（日食 early-return 前）挂 anglerQuestSwapInto（自 Game.anglerQuestSwap 收编 data/vanillaFishing.ts 双端单源,防门旗键表/播种式漂移）+ module15 sub0 权威断言经 handleFromSim 管线（simStub isHost 放行→Room 记账+名单清空+进房补发自然携带）;②陷阱箱直触发半边**维持登记**：SimHost 无 wiring 模拟面（无 Wiring 实例/DeviceHandler/UpdateMech tick）,服务端 HitSwitch 直触发无消费端=死码——归属「serverAuth 房 wiring/机器模拟」架构债（非协议面小刀可清,复刻前先建 SimHost 机器模拟基建）;③顺带观察：季节 ForToday 位黎明重算（Game.ts:9695 sendSeasonAssert 同位）同样缺 SimHost 侧生产面,与②同批归属;④Vanilla「serverAuth 协议位」全树 grep 零命中（仅 Rail SDK 二进制误命中）——原版无此机制,登记项语义=本仓 SimHost 侧拓展位,非原版位段移植 |
| R12 | 箱改名 msg69 | NetMessage.cs case 69（ChestName）/ MessageBuffer.cs msg33 改名段 :1966-1971 | ⚠️登记未建模（ Chest.name 本仓未持久化;msg33 本仓载荷无改名段）。**FX52 收口（2026-09-13）协议面✅闭合**：Msg.ChestName=69 编解码 1:1（写 NetMessage.cs:1119-1126/读 MessageBuffer.cs:3053-3074）+ msg33 改名尾段（num24 语义 1:1:0=无/1..20=名/255=清名,施加对象=发送者在用箱 :1962,广播排除改名者 :1969）+ 授予/权威纠正时 msg69 名断言随发（=原版进端箱表名域 CompressTileBlock {idx,x,y,name} NetMessage.cs:2232-2237 的本仓投递位;★不走 msg32 尾段——applyRemoteChest 的 withPrefix remaining 门会被小 n 尾段翻转=条目错位,定谳备案）+ 客户端镜像 netApplyChestName（netChestWatch 索引域+位置 break 面 :3068-3070;不造 CreateWorldChest 桩,名随授予帧序补齐）。**附带定谳修刀（索引域错位）**：开箱公告 msg33 曾携本地 indexOf 域 idx（访客 chests push 增长≠服务器域）→ chestUserBySlot/msg80 按错箱记账（他人误拒+改名落错箱）——修=chestIndexByPos（服务器域）优先,本地 indexOf 回退（房主/单人同存档序同域）。**剩余债=上行生产面**：箱改名文本 UI 未实装（UI.ts:9025 债,ChestUI.RenameChestSubmit 面）——协议面/受理面/镜像面已通,UI 落地即全链活 |

### 8quater.5 兼容矩阵（本批四刀增量通道）

旧 server（未重部署）× 新 client：module15 上行被 default 忽略（quest 断言/交付上行
静默丢=行为同改动前）;msg33 上行被 default 忽略（无占用锁=旧行为）;msg80 下行不存在
（客户端镜像恒空,isChestInUseByOther 恒 false=无门）。新 server × 旧 client：module15
下行被旧端 default 忽略;msg80 下行被旧端 default 忽略（未知号跳过,对齐原版
MessageBuffer.cs:137-139 语义）。无踢出/无断链/无错位（全部走未知号/未知 moduleId
跳过通道,与 SpectateFocus=150/LeashedEntity=13 先例同构）。
