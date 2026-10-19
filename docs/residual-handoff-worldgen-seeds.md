# 移交：残余清点批 → worldgen 会话（种子位 + 庆典 NPC 列表）

> 移交方：残余标记终波清点（2026-09-03）
> 接收方：worldgen 会话
> 优先级：P2（均为秘密种子/事件生成面，主流程无感）

## ① SecretSeedDoEndsPass 三个未承接种子位

文件：`src/world/gen/vanilla/SecretSeedDoEndsPass.ts`

| 位 | 锚 | 现状 |
|---|---|---|
| `actuallyNoTraps` | 原版 :603（该文件 :1787 注） | 未承接占位——保持原版序 |
| `noSurface` | 原版 :639 | 未承接占位 |
| `portalGunInChests` | DoPortalGunInChests :663-666 | 箱枪臂=车道债未承接（:1816 注） |

注意：`actuallyNoTraps`/`noSurface` 与既有 `noTraps`（no traps 世界链已认证绿）是**不同旗**——承接前先核对该旗在 1457 反编译的完整消费面（含 worldgen 内的门与掷流位次），避免与 [[qqqqqqqq-worldgen-batch]] 的掷流方法论冲突（前缀流判定法对拍）。

## ② CelebratingNPCs 列表位

文件：`src/core/Game.ts` 约 :34555（tenthAnniversary genuineParty 强制段注释）。
原版：十周年世界 party 庆典 NPC 列表（CelebratingNPCs）在 party 系统生成时消费；本仓 genuineParty 已强制但庆祝 NPC 名单位未接。
建议：与 party/事件链批一起收（NPC 选择表+世界旗消费面）。

## 验收口径

- 种子位承接后跑该种子全链生成对拍（七链金标如翻色如实列明归属）。
- 掷流纪律照 [[hm-probe-handoff-worldgen-tileframe]] 同款（段界标记+全窗仪）。
