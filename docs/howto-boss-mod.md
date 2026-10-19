# 制作 Boss mod 工作流(rivals 实验批沉淀,2026-10-04/05;v2 大体型多段体节版)

> 本篇为实战工作流;API 全表见 [mod-dev-guide.md](mod-dev-guide.md)。

> 首例:`mods/rivals/`——星织圣·Claude(巨蟹 224×144/6800HP+巨螯体节×2)+六织泰坦·GPT
> (苔痕巨石 160×208/8200HP+符石卫队×4),双 Boss 各三阶段多攻击。全链实弹:
> `scripts/_rivals-probe.mjs` 14 断言(移动/体节/弹幕可见性/切相/掉落)。
> 素材管线复用 `imagegen/glm-npc/`(块状网格把戏 + slice-sprites 切割器,支持 WxH)。

## 1. 构成

```
mods/rivals/
  mod.json
  content/npcs/{claude,gpt}.json        # Boss 本体(Enemy 载体)
  content/projectiles/*.json            # 6 种弹幕声明(贴图/重力/寿命/穿透)
  content/items/{claude_core,gpt_core}.json   # 掉落物(需 mod 物品,规则域才可引用)
  textures/npc|proj|items/*.png
  scripts/main.js                       # L2:sw.npcAi 双状态机 + sw.projectileHook 弹幕行为
```

Boss NPC = **Enemy 载体**(非 TownNPC):`aiStyle:0` + `noGravity/noTileCollide:true`
(浮空),`knockBackResist:0`(免击退)。渲染走 `vanilla/NPC_<id>.png` 竖条
(frames=1 即整图单帧;贴图 96² 与碰撞盒 70/78 独立,drawEnemy 中心锚)。

## 2. L2 AI 契约(rivals 批新增 API)

- `sw.npcAi(key, fn(e, game, player))` — 每 fixedUpdate **整支接管**(不走原版
  aiStyle switch),共享尾段(接触伤害/击退/掉落)照走。`game` 运行时=全量 Game。
- `sw.spawnProj(game, key, x, y, vx, vy, damage[, knockback])` — **L2 唯一弹幕生成
  通道**(entry.js 无 import 面;内部动态 import ModProj + entities.add,rivals 批新增)。
- `sw.spawnNpc(game, key, x, y)` — 派生 mod NPC(多段体节/护卫;**必须走
  `Enemy.fromVanilla`**——`new Enemy('v_<id>')` 是占位 ctor 不自载 def,rivals v2 修复)。
- `sw.projIdOf(key)` / `sw.npcIdOf(key)` — 分配 id 计数用(rivals 批新增)。
- `sw.projectileHook(key, {update(p, game), onHit…})` — 弹幕逐 tick 行为覆写
  (追猎/弧线在这层做;`p.ageTicks` 可做修正窗口)。
- 阶段机:血量比阈值 → `e.swPhase`(动态字段挂 Enemy 实体,跨 tick 存活),**切相
  重置时间线与攻击计时器**;攻击计时 = 逐 key 计数器 `atk(k, gap, fn)`。

### ★两条铁律(v1 两事故定谳,新 AI 必守)

1. **位置积分自担**:Enemy 共享尾段**不代做** `x += vx`(各原版 AI 分支各自负责,
   如 slimeAI/eocAI 内联)——mod AI 只设 velocity 不积分 = Boss 定格不移动
   (用户实报"不会移动")。每 tick 末尾 `e.x += e.vx; e.y += e.vy`
   (noTileCollide 原地直移,与 Enemy.ts :843 同式)。
2. **弹幕绘制=世界坐标**:实体循环 ctx 已含相机变换(Arrow.draw 同约定
   `ctx.translate(this.cx, this.cy)` 直绘世界坐标)——ModProj.draw 旧实现做
   `this.x - cam.x` 屏幕换算 = 变换叠加双重偏移,**弹体恒画到屏外**(用户实报
   "隔空伤害无贴图")。已改世界坐标直绘+世界域视口剔除(ModProj.draw)。
   探针采样坑:`ModProj.x` 是左上角语义,采样窗须加半宽到精灵中心。

## 3. 素材管线

```sh
cd imagegen/glm-npc
node ../edit.mjs -i ref.png "<块状 boss 提示词>" --background transparent --out boss-X
node slice-sprites.mjs boss  ../out/boss-X.png rivals/X.png 96     # 单主簇 fill 0.94
node slice-sprites.mjs strip ../out/projs-X.png rivals X-proj 16 4 # 多簇逐个 16²(共享调色板)
```

- strip 模式内置**形态过滤**(bbox>画面 40%/50% 或填充率>0.8 = 背景色块,剔除)——
  生成稿常混入色块带,不过滤会切出纯色矩形。
- Boss 贴图 96² 内容占 94%(视觉≥碰撞盒,原版 boss 同风格)。

## 4. 掉落(两处闸门)

1. content 声明 `drops:[{item:"<本mod物品键>",min,max,chance}]` → `registerModNpcRules`
   (item=stable id 30000+ 段)。**规则域只能引用已注册 mod 物品**——Boss 掉落物随 mod
   声明(content/items)。
2. 物化闭包 `Enemy.hurt → spawn()` 的 `VANILLA_ITEM_KEY_BY_ID[id]` 只认原版映射——
   **已补** `?? ITEM_DEFS[id]?.key` 回退(plan-A 后 internal≡stable≡vid,原版零漂移;
   rivals 批修复:否则 mod 掉落被 unmapped 静默吞)。

## 5. 探针要点(rivals 专用)

- **Enemy 实体住 `entities.enemies` 桶**(TownNPC 在 `npcs`——两桶分离,按 ctor/vanillaId 找)。
- **掉落物住 `entities.drops` 桶**,物品 id 字段 = `d.itemId`(`d.id` 是实体序号!
  曾误读 243=实体 serial 当物品 id)。
- 弹幕计数:`entities.projectiles.filter(p => p.projId >= 2000)`(mod 弹段)。
- 压血切相:直接写 `e.life`,400ms 后读 `e.swPhase`。
- 召唤 = `g.debugSpawnNpc(801)`(TOWN_NPC_IDS 反查失败自动走 Enemy 路径=正确)。

## 6. 边界登记

- Boss 血条(BossBars)/Boss 头像/召唤物/Boss 音乐未接 mod 面(VANILLA_BOSS_IDS 静态表);
  击杀播报/进度旗无——Boss 目前只能 F6/debugSpawnNpc 召唤。
- Boss 消失规则走 Enemy 通用 despawn(玩家远离可能消失,vanilla boss 的 noDespawn 未接)。
- 联机:mod 弹 P2 不进实体同步(kind 枚举外降级),Boss 实体同理(单机优先)。
