# Mod Loader 批章(P0 2026-10-04 上午 / P1 2026-10-04 下午)

> 基线:docs/mod-loader-design.md(定谳+设计)。方法论:campaign-playbook。
> P0=刀序 1-7 全数落盘;P1=L2 脚本 mod+存档头 mod 清单+真机带 mod 全链验证。

---

# P1 批章(2026-10-04 下午)

## P1.1 落盘清单

| 域 | 文件 | 内容 |
|---|---|---|
| L2 核 | `src/mods/hooks.ts` | 钩子注册表(npcAi/itemUse/systems;空注册零成本短路;fail-fast 重复注册;无 per-frame try/catch=tML 可信代码哲学) |
| L2 核 | `src/mods/api.ts` | ModContext 门面(`sw.npcAi/itemUse/system/log`;键解析经分配表,未注册 fail-fast) |
| L2 核 | `src/mods/loader.ts` | 脚本相位:拓扑序逐 mod 装载 `scripts/main.js`(blob URL 动态 import,求值后 revoke;**opts.entryLoader 可注入**——vite-node 拦截 blob/data URL,vitest 注入 new Function 版) |
| 刀 | `src/entities/Enemy.ts` | aiStyle switch 前插 mod AI 派发(`takeModNpcAi`;vanillaId≥800 且注册才接管;**共享尾段照走**;GameHooks→Game 显式放宽注) |
| 刀 | `src/core/Game.ts` ×6 | ①updateUse 早期门后 `runModItemUse` 预分流(帕鲁钻地龟/无人机专支同位先例;true=已消费,useTime 节奏 handler 自管) ②fixedUpdate 头 preUpdate ③entities.update 后 postEntities ④postUpdate 头 postUpdate ⑤start() 头 onWorldLoad ⑥destroy() 头 onWorldUnload。全部一行+空注册短路 |
| 存档 | `src/save/serialize.ts` | SaveMeta.mods/SaveData.mods 可选键+serializeSave 携行(空=不落键零迁移) |
| 存档 | `src/save/SaveFile.ts` + `src/workers/SaveClient.ts` | **三处 meta 装配防漏喂**(saveGame/saveWorldOnly/doSave;BJ71 同族纪律)经 `mods/bridge.getSaveModEntries()` |
| 存档 | `src/save/SaveFile.ts` loadSaveData | 读侧缺失检测:存档 mods vs 启用集对账→console.warn(占位物语义告警面;worker 态 null=跳过) |
| 句柄 | `src/main.ts` | `window.__swMods` 调试句柄(result/install;__swAtlas 同族先例) |
| 测试 | `tests/mod-l2-hooks.test.ts`(7) | entry 装载→钩注册→npcAi 接管/原版域短路→itemUse 命中/原版 vid 不调→system 计数→重复注册 fail-fast→存档 mods 键 round-trip→缺失检测 console.warn |
| 探针 | `scripts/_mod-e2e-probe.mjs` | 真机全链:装包→reload→装载/entry/图标/NPC/AI/系统钩 |

## P1.2 真机全链验证(5203 私有实例,已撤)

```
INSTALLED  __swMods.install 落库 ✓
BOOT       loaded=[demo] errors=[] ✓ entry.js 浏览器内执行(blob URL import)✓
INGAME     iconOk=true(iconW=1=夹具 PNG 尺寸)✓ modNpcAlive=true ✓
           mod AI 接管=60/s(72→132)✓ 系统钩=60/s(pre/post 1161→1221)✓ onWorldLoad=1 ✓
CADENCE    +1s 差恰 60 ✓(fixedUpdate 每拍派发零漂移)
ERRS       boot/ingame 双页零 console 错 ✓
```

## P1.3 本批判例

- **★node 22 `Uint8Array.from(atob())` 产全零**(2026-10-04 实证,耗三轮探针定位):
  节点侧 base64→bytes 必须 `Buffer.from(b64,'base64')`;`from(atob())` 逐字节 0 但
  长度正确=静默损坏,createImageBitmap "The source image could not be decoded" 是
  唯一显影面。浏览器侧 atob 逐字节循环安全。
- **★vite dev 无扩展名 import=第二模块实例**:`import('/src/mods/loader')`(探针侧
  手写 URL)与源码内 `import('./mods/loader')`(vite 重写为 .ts 全名)是**两个模块
  实例**——page.evaluate 的 import 路径必须与源码解析结果逐字一致(带 .ts),或经
  window 句柄(2026-10-04 判例)。
- **vite-node 拦截 blob:/data: 动态 import**——loader entry 装载器做可注入
  (`opts.entryLoader`),测试注 new Function 版(自己控制入口源形)。
- **探针跨 puppeteer 启动无共享 IDB**(独立临时 profile)——装+验必须在同一浏览器
  实例内完成(install→reload→verify 同 launch)。

## P1.4 边界声明

含:L2 行为钩子全链(npcAi 接管/itemUse 预分流/五点系统生命周期)+entry.js 生产装载
(blob URL)+存档头 mod 清单(三处装配+读侧缺失告警)+真机全链绿。
不含(P2):L3 白名单补丁、mod 内容进商店/图鉴/成就/旅程、mod buff/弹幕自定义、
显式占位物 UI(现=静默降级+warn)、CLI/类型包/模板、Electron mods 目录路由、
存档 mod 清单的 UI 展示面、服务器侧 mod 装载(serverAuth 房间)。

---

# P2 批章(2026-10-04 傍晚)

## P2.1 落盘清单

| 域 | 文件 | 内容 |
|---|---|---|
| 弹幕 | `src/entities/ModProj.ts`(新) | 轻量弹体:内置缺省(重力/寿命 3600/tile 前缘采样消亡/敌怪命中门 playerCanHitEnemy+iframes+e.hurt/玩家命中 hitPlayer)+spec 钩子覆写;自绘(Entity.draw 通用分派,Renderer 零改);贴图=vanilla/Projectile_<id>.png 覆盖键;GameHooks.entities 缺面→Arrow :9608 同款 cast 习语 |
| 弹幕 | `src/mods/types.ts` | ModProjContent/ModIdAllocation.projs/MOD_PROJ_ID_BASE=2000/MOD_BUFF_VANILLA_BASE=9000/combat.shoot 支持 `proj:<key>` 字符串 |
| 弹幕 | `src/mods/plan.ts` | content/projectiles/*.json 解析+projId 分配(2000+,全局注册序=确定性)+引用校验 |
| 弹幕 | `src/mods/register.ts` | spec→registerModProj;combat.shoot 字符串→allocated projId(**未声明 shoot 不写 0**——首探针翻案修) |
| 弹幕 | `src/mods/hooks.ts` | projSpecs 簿+allocateModProjId+modProjSpecOf+registerProjHooks(entry 挂代码钩,合并进 spec) |
| 弹幕 | `src/core/Game.ts` 刀⑦ | useCombatWeapon case 'shot' 通用出生点前插 mod 分流(projId≥2000 且 spec 在册→ModProj;节奏与原版 shot 支同式;**spawnX/spawnY 声明之后**——首刀点 TDZ 翻案) |
| buff | `src/mods/buffs.ts`(新) | BuffType 运行时追加域(BUFF_DEFS 键最大值+1)+BUFF_DEFS[bt] 直写+伪 vanillaBuff 9000++图标 objectURL 表+modBuffTypeOf 解析 |
| buff | `src/mods/hooks.ts` | modBuffTicks+registerModBuffTick+runModPreUpdate 并入 buff tick 派发(**独立于 systems 门**——首实现被空 systems 短路误杀,测试翻案) |
| buff | `src/mods/assets.ts` | buff 图标 objectURL 登记;mod 弹贴图注入 |
| buff | `src/main.ts` | buff 图标覆盖链组合(modBuffIconUrl 优先,无条件初挂——onApplied 内挂法在零 remaster 包时永不生效,翻案修) |
| 配置 | `src/mods/config.ts`(新) | ModConfigState(缺省合并/类型钳制/kvSet `sw.mods.config.<id>` 持久化) |
| 配置 | `src/mods/manifest.ts` | config 表 schema 校验(type/default 同型/min/max) |
| 配置 | `src/mods/loader.ts` | loadModConfigValues 先于 entry;createModContext 注入 config+decorateUseCtx(applyBuff) |
| 配置 | `src/mods/modsPanel.ts` | 面板内联配置编辑(bool/number/string 控件,变更即持久化) |
| 测试 | `tests/mod-p2.test.ts`(11) | 分配确定性/spec 直落/shoot 换算/ModProj 内置物理与寿命/projectileHook/buff 全链/配置钳制/manifest 校验 |

## P2.2 真机全链验证(5203,已撤)

```
BOOT       loaded counts {items:2, projs:1, npcs:1} ✓ entry 执行 ✓
INGAME     casterShoot=2000(字符串 proj:demo_bolt 换算 ✓)
           projSpawned=true / projDeadAfterFlight=true(飞行+消亡 ✓)
           buffInBar=true / buffTick 90→150 = 60/s(5s 时长内逐 tick ✓)
           boltUpdate=34(弹存续期 update 钩逐 tick ✓)
CADENCE    系统钩 60Hz 恒定 ✓    ERRS  零 console 错 ✓
```

## P2.3 本批判例

- **★运行期内容引用的确定性排序坑**:entry 分配的 id 与 content 引用互相依赖→
  解法=声明式优先(content/projectiles 走 plan 期分配,entry 只挂钩);
  `combat.shoot: "proj:<key>"` 字符串在 register 相期换算。
- **未声明字段不得写缺省**:register 首版给无 shoot 的 combat 写 `shoot:0`——
  0 是原版弹域合法值,污染表;翻案=undefined 不写。
- **钩子派发的门别挂错**:buff tick 并入 runModPreUpdate 时被 systems 空门短路
  ——独立能力域必须独立门(单测翻案)。
- **覆盖链初始化时机**:onApplied 回调内挂 getter 在"零包"时不触发——
  无条件初挂+回调重挂=幂等双保险。
- **(承接 P1)文件震荡**:并行会话编辑器缓冲对 mods/ 三文件发生过一次 P2→P1
  回退,按纪律基于盘上内容重放后加锁验证(tsc 逐刀)。域内文件编辑后必须
  立即 grep 标记复核。

## P2.4 边界声明

含:mod 自定义弹幕(声明式数据 spec+代码钩追加)+mod buff(注册/图标/buff 栏/
onTick/applyBuff)+ModConfig(声明 schema/kv 持久化/面板编辑/sw.config)+真机全链绿
+47 mod 测试+47 守恒链。
不含(P3):mod 弹幕的联机同步(kind 通道扩展)、hostile mod 弹 AI 发射面、mod buff
NPC 侧、L3 白名单补丁、商店/图鉴/成就/旅程内容面、占位物 UI、CLI/类型包/模板、
Electron mods 目录、服务器 mod 装载。

---

# P3 批章(2026-10-04 晚)——平台收完整

## P3.1 落盘清单

| 域 | 文件 | 内容 |
|---|---|---|
| 商店 | `src/mods/shops.ts`(新) | per-NPC 追加货架表;`modShopStockOf(npcId)` 缝(空=零成本) |
| 商店 | `src/mods/types.ts`+`plan.ts`+`register.ts` | content/shops.json(npcId+items+price 缺省=物品 value)→登记 |
| 商店 | `src/core/Game.ts` 刀⑧ | npcShopStock `return out` 前追加 mod 货架(remix 抑制/cond 过滤只作用原版段,mod 货恒上架) |
| 图鉴 | `src/data/Bestiary.ts` | bestiaryEntries 追加 mod NPC 条目(id≥800;城 NPC=chat 解锁/敌怪=击杀解锁;creditId=id 字符串=bestiaryCreditId 回退分支同值) |
| 图鉴 | `src/data/vanillaNpcs.ts`+`src/i18n/Lang.ts` | modNpcName 访问器+Lang.npcName mod 段回退(id≥800;原版域零扰动) |
| toast | `src/world/World.ts`+`src/save/SaveFile.ts` | World.saveMods 投影(data.mods→id/version) |
| toast | `src/mainFlow.ts` | enterGame 后对账 saveMods vs 启用集→ui.toast(SaveMissing l10n 键,占位物语义的用户可见面) |
| CLI | `scripts/mod-cli.mjs`(新,零引擎依赖) | init(模板工程:mod.json+示例物品+entry+README)/build(目录→.swmod,fflate)/validate(工程目录或 .swmod;清单 schema/贴图存在/配方与 shoot 引用闭合) |
| 桌面 | `desktop/main.mjs` | 环回服务挂 `/mods/index.json`(列 userData/mods/*.swmod)+`/mods/<file>.swmod`(文件名白名单防穿越);preload 零升级 |
| 桌面 | `src/main.ts` | 桌面态发现通道:isShell→fetch index→版本比对 install/enable(KvStore 注册表合流;失败静默) |
| 测试 | `tests/mod-p3.test.ts`(3) | 货架追加/price 缺省=value/原版 vid 显式价;图鉴 mod 条目(kind/chat/creditId);Lang.npcName mod 回退 |

## P3.2 验证

- tsc 零错(域外并行红同前);mod 全套 50 测试绿(core17+bridge3+e2e9+l2 7+p2 11+p3 3);
- 守恒链 9 文件 47 测试绿;CLI round-trip(init→validate→build→validate)实跑通;
- l10n-audit:SaveMissing 键过闸(现红 `UI.Dash` 系并行会话新键,域外)。

## P3.3 边界声明(P3 完成 = 内容 mod 平台收完整)

含:mod 内容进商店/图鉴(名称/条目/解锁)+缺失 mod 用户可见 toast+CLI 三件套
(init/build/validate+模板工程)+桌面 mods 目录自动发现(web 版 zip 导入并存)。
**平台完整度自评**:单机内容 mod 的「装/启停/依赖/确定性 id/存档身份/三 worker 桥/
资产注入/自定义 AI/物品行为/自定义弹幕/自定义 buff/配置面板/商店/图鉴/缺失提示/
CLI/桌面目录」全链贯通——对标 tModLoader 的 L1+L2 平台面。
仍不含(登记为后续可选,非内容 mod 必需):L3 白名单补丁(引擎行为替换)、mod 弹幕
联机同步(mod NPC/物品经既有 key/稳定 id 通道已可同步)、mod buff NPC 侧与
mod 弹 statusNPC、旅行商/家具商品/旅程研究面、类型包 npm 化、服务器 mod 装载。

---

# P4 批章(2026-10-04 晚)——联机与边界面收口

## P4.1 落盘清单

| 域 | 文件 | 内容 |
|---|---|---|
| 弹同步 | `src/core/Game.ts` 发送端 | netProjBroadcast 分派加 ModProj 支(kind=12,tag=projId) |
| 弹同步 | `src/core/Game.ts` netMakeProj | case 12:spec 在册→ModProj 傀儡;缺 mod/未注册=null 剥条(未知 kind 降级矩阵) |
| 弹同步 | `src/entities/ModProj.ts` | netPuppet 分支:netPuppetStep 快照跟随+寿命+spec.update 视觉钩;伤害/tile 不结算(host 权威);剔除=netProjPuppets 180t 超时既有面 |
| 弹同步 | `src/net/protocol.ts` | kind 表注册 12=ModProj;`server/room.ts` 白名单 `(kind&0x3f)>12` 剥条线确认(现有代码已放行,补注) |
| NPC debuff | `src/mods/hooks.ts` | npcBuffStore(WeakMap<Enemy,Map<type,秒>>)+applyModNpcBuff(max 合并=原版 AddBuff 语义)+registerModBuffNpcTick+tickNpcBuffs(并入 runModPostEntities,独立门) |
| NPC debuff | `src/entities/ModProj.ts` | 命中后 npcDebuff 声明面:chance 掷→modBuffTypeOf(经 modProjModIdOf 解所属 mod)→applyModNpcBuff |
| NPC debuff | `src/mods/buffs.ts` | ModBuffSpec.onNpcTick(敌怪侧逐 tick 钩) |
| 旅行商 | `src/core/Game.ts` | 368 两支 early-return 追加 modShopStockOf(368)(帕鲁联动甲支+普通支) |
| 研究 | `src/stats/Research.ts` | registerModResearch(need 表运行时追加;非 mod 段/need≤0 忽略=原版面禁写)+ModItemContent.research 字段 |
| 类型包 | `templates/mod-api.d.ts`(新) | ModContext/ModUseCtx/ModProjSpec/ModBuffSpec/ModSystemHooks 手写镜像(引擎侧权威,升级随批章更新) |
| CLI | `scripts/mod-cli.mjs` | init 增发 mod-api.d.ts+tsconfig(TS mod 工程 include 即得全 API 类型) |
| 测试 | `tests/mod-p4.test.ts`(4) | kind12 傀儡语义(快照跟随/寿命/不结算)/onNpcTick 派发+dt 到期/旅行商 368/registerModResearch |

## P4.2 验证

- tsc 零错;mod 全套 54 测试绿;守恒链 47 绿(合计本轮跑面 143/143);
- CLI round-trip 含类型包(init 7 文件→build→validate)实跑通;
- 联机:kind12 过中继白名单(现有 `>12` 线)+双端降级矩阵(缺 mod=不显影零崩溃)
  按既有 msg27 增量通道纪律(kind9/10/11 同谱)机械成立;双人实测另批(需双端环境)。

## P4.3 边界声明(平台收官判语)

**含(单机+合作全链)**:P0 L1 数据 mod/存档身份/worker 桥 → P1 L2 脚本+生命周期+
存档头 → P2 弹幕/buff/配置 → P3 商店/图鉴/toast/CLI/桌面目录 → P4 mod 弹联机同步
+NPC debuff+旅行商/研究+类型包。对标 tModLoader 的内容 mod 平台面(L1+L2)完整
落地;确定性 id 分配使「双端同 mod 集合」的联机一致性由构造保证(物品 key 同步/
NPC fromVanilla 重建/弹 kind12+确定性 projId)。

**不含(设计决策+后续可选)**:
- L3 白名单补丁:引擎行为替换钩子。现有 P1/P2 显式钩面已覆盖内容 mod 需求;
  泛化 L3 与 1:1 复刻纪律的冲突面(钩子中立性举证成本)大于收益,决定不建,
  以「按案扩显式钩子」替代(先例:npcAi/itemUse/tick 均由需求驱动追加)。
- 服务器 mod 装载:serverAuth 房主进程装载 mod(node 侧 entryLoader 已就绪,
  差异步房发现/协议)。纯中继房 kind12 已透传。
- hostile mod 弹的访客本地结算(bit7 面)、mod buff 对玩家的敌对施加面。
- 类型包 npm 化/工坊式分发——CLI 本地工作流已闭环。

---

# P4.5 性能损失评估(2026-10-04,微基准实测)

实测=tests/mod-perf-guard.test.ts(vitest/node,10⁶-2×10⁶ 次取样,JIT 预热);
预算基准=60Hz fixedUpdate 每拍 16.67ms。阈值放宽 10-100×(守数量级不守精确值)。

## 空载实测(零 mod 会话的真实形态)

| 热路径钩子 | 单次实测 | 调用频率 | 每拍合计 |
|---|---|---|---|
| takeModNpcAi(每敌怪每 tick) | **17.1 ns** | ×敌怪数(300 实测场景) | 5.13 µs |
| runModItemUse | 13.7 ns | ×1 | 0.01 µs |
| runModPreUpdate | 13.7 ns | ×1 | 0.01 µs |
| runModPostEntities | 13.8 ns | ×1 | 0.01 µs |
| runModPostUpdate | 13.0 ns | ×1 | 0.01 µs |
| **合计(300 敌怪)** | | | **≈5.2 µs/拍 = 预算 0.031%** |

## 满载实测(64 mod NPC AI + 64 itemUse + 16 system 的框架上限)

| 热路径钩子 | 单次实测 | 300 敌怪每拍 |
|---|---|---|
| takeModNpcAi Map miss(64 项) | 20.6 ns | 6.18 µs |
| runModItemUse Map miss | 20.5 ns | 0.02 µs |
| 16 空系统循环(pre/post) | 35.0/36.2 ns | 0.07 µs |
| **合计(框架开销上限)** | | **≈6.3 µs/拍 = 预算 0.038%** |

## 分环境损失列表

| 环境 | 每拍框架开销 | 占预算 | 一次性成本 | 结论 |
|---|---|---|---|---|
| 零 mod·web 浏览器 | ≈5.2 µs | 0.031% | boot +1 次 IDB 读(~1-3ms) | 无感 |
| 零 mod·桌面 Electron | 同上 | 0.031% | + /mods/index.json 本地 fetch(<1ms) | 无感 |
| 有 mod·内容已注册 | ≈6.3 µs | 0.038% | zip 解压+PNG 解码(每 mod 数 ms;8s 护栏) | 无感 |
| L2 挂满(64+64+16) | ≈6.3 µs+mod 代码自 cost | <0.04%+ | 脚本装载(每 entry 一次 blob import) | 无感 |
| MP 房主 | 发送分派每弹多 1 次 instanceof(≤24 弹/批) | ≈0 | — | 无感 |
| MP 访客 | kind12 傀儡=快照跟随(kind9/10/11 同谱) | ≈0 | — | 无感 |
| save.worker/worldGen.worker | 每 tile/物品零增量 | 0 | 桥推送一次(几 KB postMessage) | 无感 |
| BakeWorker | 每 tile 零增量(mod meta/defs 注入一次) | 0 | ship 首波随包 | 无感 |
| 存档/读档 | RLE/序列化路径零增量 | 0 | 恒等表接长 0.65ms(20754→65536 一次性,实测) | 无感 |

**结论:无任一环境存在严重性能损失。** 最重路径(300 敌怪满载 miss)=0.038% 帧预算,
比一帧渲染误差低两个数量级;唯一非零的一次性成本(恒等表接长 0.65ms)在启动期。
mod 自身代码成本(onTick 里做什么)是 mod 作者责任,框架只收「查表+循环」的固定税。

---

# P4.6 红蓝对抗审查(四路红队+蓝方复核)

四路并行红队(ID 域/存档 worker/钩子实体/装载资产桌面)×蓝方逐条复核。
**已确认并当场修复**(全部带 file:line 证据链,复测 151/151 绿):

| # | 来源 | 级别 | 缺陷 | 修复 |
|---|---|---|---|---|
| 1 | B | **critical** | 缺 mod 读档:tile RLE 流按解码值跳 fx/fy,未知 stable(Uint16Array 读 0)→跳帧→**自首未知 tile 起整流错位=全图损坏**,自动存档覆盖好档 | 读写两侧对齐:写侧未映射→stable 0 不写帧;读侧帧消费门改 tRaw!==0,未知槽落空气流零损 |
| 2 | B | **critical** | packWorld 不携 World.saveMods → 生产 worker 读档路径缺失 mod toast 永不触发 | WorldPacket+packWorld+fromPacket 三点随包 |
| 3 | A | **critical** | SHEET_TO_INTERNAL 载入期快照→mod 站点配方 envOk 恒 false=**永不可合成** | sheetToInternalLive:mod 段(≥1030)live 回退 TILE_INTERNAL_OF_STABLE |
| 4 | A | major | VID_TO_KEY 载入期快照→vanillaCraft 成品键解析 miss=**mod 配方点击静默无效** | vanillaItemKey mod 段 live 回退 |
| 5 | A | major | 掉落 chance:0/NaN→denom=Infinity→rng.int 恒 0→**0% 必掉** | buildDropRules 跳过非有限/≤0 chance;denom 钳 chance≤1 |
| 6 | C | major | pierce 文档矛盾(types 0=无限/hooks -1=无限/代码 0=即亡) | 统一 ≤0=无限;ModProj 命中环重写 |
| 7 | C | major | ModProj tile 3 点采样无子步→大步长穿墙+角部漏检带 | 子步推进(≤14px/步)+4 角中心采样 |
| 8 | C | major | hurt 第 7 参 pierce 传 0=近战档(10t 免疫帧)→霰弹同拍只落 1 发 | 传 1(原版单发弹语义),移除冗余 iframes 预检 |
| 9 | D | major | id 分配按当前集合重算——卸前排位 mod→**后位 mod 全部 id 平移**,存档内容静默错位且无告警 | toast 对账已覆盖缺 mod;**平移形态完整解(存档携带 id 映射表+读档重映射)=登记为头号后续债**(需拍板:改存档头 schema) |
| 10 | D | major | 桌面目录单个坏包中断全部后续同步 | 逐文件 try;index 白名单口径与 GET 对齐 |
| 11 | D | major | 桌面启动强制回勾用户停用的 mod | 版本覆盖重装保留启停态;同版本不触碰 |
| 12 | B/D | major | 全禁 mod 时 enabled provider 返 null→缺失 toast 门恒 false | 装载过即返数组(空数组=全禁,门放行) |
| 13 | A | minor | mod buff 存档写伪 id/读档反查快照 miss→buff 静默消失 | registerBuffVanillaReverse 注册期直写反查 Map,round-trip 闭环 |
| 14 | C | minor | critter mod NPC 的 npcAi 被 critter 前置支静默吞掉 | critter 门加 takeModNpcAi===null 条件 |
| 15 | C | minor | ModProj ownerIsPlayer=dmgKind!=='magic'(frostEligible 语义错位地雷) | 恒 true+注 |
| 16 | C | minor | destroy 无幂等卫→onWorldUnload 二次派发面 | destroyed 卫语句 |
| 17 | D | minor | zip entry 名反斜杠/./ 前缀→内容静默丢失 | readModPack 归一 |
| 18 | D | minor | store.install 无视 putZip 失败→假"已安装" | 失败即抛 |
| 19 | D | minor | id 键序 localeCompare(ICU 版本敏感)威胁跨端确定性 | 全部改代码点序 |
| 20 | C | minor | api 头注误载不存在的 sw.projectile | 改 projectileHook |
| 21 | A/C/D | note | onHit 时序文档/kbSign 死卫/objectURL 重登记泄漏/configStates 死代码/面板注释误导 | 逐一清理 |

**登记不修(边界+理由)**:
- A-m3 族(BUFF_BY_VANILLA/药水 vi_ 门两处载入期快照):声明式消耗品带 mod buffType
  需 L2 itemUse 替代——快照族全量 live 化属独立战役(同 hazard 族已清 4 处,余 2 处
  影响面=声明式药水,登记)。
- A-m4:SmartCursor SHEET_OF 对 mod tile 降级(智能光标平台锁定失效,游玩面无损)。
- B-M2:服务器 mods 清单断供(server mod 装载=独立战役;C2 修复后服务器路径不再
  损毁,仅 mod tile 落空气)。
- D-n1:zip 炸弹无内存护栏(与 ResourcePackZip 先例持平;可信 mod 哲学下登记)。

**红队通过项(无 finding)**:零 mod 中立性逐刀复核成立(全仓普查无恒等表引用捕获)、
kind12 位序/降级矩阵、worker 桥时序(BJ328 懒重建全覆盖)、applyModTileDefs 对齐、
serialize mods 键旧档回环、VANILLA_NPCS/BUFF_DEFS 注入的全部遍历消费面、
CSP/blob import 可行性、桌面路由防穿越。

---

# P5 批章(2026-10-04 深夜)——登记债清偿

## P5.1 头号债:id 平移完整解(D-M1 清偿)

**缺陷回顾**:id 按「当前 mod 集合」确定性分配——卸/停排位前 mod → 后位 mod 全部
id 平移 → 旧存档 stable id 指向错位内容(静默换物)或落空。toast 只覆盖缺 mod 形态。

**修复**:存档头携带分配映射 + 读档重映射:
- `SaveModEntry` += `itemIds/tileIds`(fullKey→stableId,存档期分配快照);
  `SaveMeta.mods`/`SaveData.mods` 同构随档。
- 三处 meta 装配经 `setSaveModsProvider`(loader 持 lastPlan 供数)——BJ71 防漏喂纪律。
- `loadSaveData` 头部构建 savedStable→currentStable 重映射(存档映射 × 当前分配,
  源=mods/bridge `getCurrentAlloc`:主线程 loader 直写/worker applyModIds 携带),
  就地纠偏读档侧全部物品槽(背包/银行/盔甲/染料/垃圾/杂项/配装/箱/挂物)+
  tile RLE 流(stable 域重映射后再查表)。
- 映射缺键=内容已移除 → 落既有 ??0 占位;原版域零键零扰动。
- **worker 同缝**:bridge payload += itemKeys/tileKeys,save/worldGen worker
  setCurrentAlloc 入域(读档重映射在 worker 内闭合)。

测试:`tests/mod-p5.test.ts` 两阶段 vi.resetModules(阶段1 ra+rb 装载存档;阶段2
卸 ra 重载=平移现场 → 旧档重映射,内容不错位)+ 旧档无 mods 键兼容。

## P5.2 快照族收尾(A-m3/A-m4 清偿)

| 点 | 修复 |
|---|---|
| `Game.ts:187` BUFF_BY_VANILLA 载入期 Map 快照 | 改 live 转发 buffTypeByVanilla(反查 Map 已含 mod 注册直写)——13 个调用点全改;quickBuff/药水桥对 mod buff 伪 id 通路 |
| 药水桥 `/^vi_/` 正则门(Game.ts:16718) | mod 物品 vid≥30000 直通 itemFuncOfVid——声明式 mod 消耗品(治疗/回魔/原版 buff)整链贯通;fvid 直通=药水病分档 default 档 |
| `SmartCursor.ts` SHEET_OF 载入期快照 | 越快照长度 live 直读 TILE_DEFS(伪 sheet≡stable 恒等式)——mod 平台连通锁成立 |
| `registerBuffVanillaReverse`(Buffs.ts 新导出) | mod buff 注册期直写反查 Map——**mod buff 存档 round-trip 闭环**(P4.6 A-m2 完整解) |

## P5.3 zip 护栏(D-n1 清偿)

`readModPack` 解压总量护栏 256MB(超限 ModPackError 拒载该包,不崩进程)。

## P5.4 验证

tsc 零错;mod 全套 56 测试绿(+P5 两阶段漂移场景 2);守恒链 47 绿;
l10n 718 键过闸(域外 `UI.Dash` 红系并行会话,不判)。

## P5.5 残余登记(非本轮范围,均已定性)

- 服务器 mod 装载(需 server 架构战役;C2 修复后服务器路径仅 mod tile 落空气不损毁)。
- mod 弹幕联机的 hostile 结算面(bit7)/mod buff 敌对施加。
- 旅行商家具商品/工坊式分发/npm 类型包。
- **并行会话注**:GLM娘实验批同期在 loader 之上扩展 mod 城镇 NPC 链
  (registerModTownNpc/head 贴/i18n merge/F6 召唤/arrivals)——其车道自验,本批未审。

---

# P6 批章(2026-10-05)——残余收齐+灾厄实证评估

## P6.1 落盘清单

| 域 | 文件 | 内容 |
|---|---|---|
| 服务器 | `server/src/serverMods.ts`(新) | mods 目录(=真相源)FsModStorage+node entryLoader+`loadServerMods()`(目录→注册表同步→loadModsPhase1) |
| 服务器 | `server/src/roomHost.ts`+`workers/ioWorker.ts` | 双 worker 上下文顶层 `await loadServerMods()`(各自独立 isolate;缺目录=零 mod 零成本) |
| 服务器 | `server/tsconfig.json`+`src/vite-env-shim.d.ts` | lib+DOM/环境垫片——**server tsc 3804 错→0** |
| hostile | `src/core/Game.ts` 广播支+netMakeProj case 12 | kind12 携 bit7(mod NPC AI 弹 !ownerIsPlayer&&damage>0);收端 `ModProj.hostile=hostile` |
| hostile | `src/entities/ModProj.ts` | `hostile=false` 公开字段(访客 netPuppetProjContact EVP 支 victim-settles 直接消费) |
| 浏览器 | `src/ui/JourneyPowersUI.ts` | sourceVids 追加 mod vid 段(30000+ 恒等域,授予链 identity 成立) |
| npm | `templates/npm/{package.json,README.md}` | @sandboxworld/mod-api 发布形态(api=1 ⇒ 包 1.x) |
| 评估 | `docs/calamity-port-assessment.md`(实证版) | 灾厄真源码实测(836,592 行/7,780 文件)→ 分域工时/缺口/分级结论 |
| 测试 | `tests/mod-p5.test.ts` | 两阶段漂移测试显式 60s 超时(合并跑 CPU 争用下 5s 默认阈值伪红,判例复现) |

## P6.2 验证

- game tsc 零错;**mod+守恒链全组合 153/153 绿**(含 P5 漂移两阶段);
- server tsc **0 错**(3804→0,DOM lib+垫片);tsx 运行面不受影响;
- 服务器 mod 装载路径:目录缺=零 mod 零成本;坏包逐文件跳过;roomHost/ioWorker
  双 isolate 各自装载;不装载=mod tile 落空气(占位,C2 修复后不损毁)。

## P6.3 服务器 mod 边界

- 房间级 mod 协商(RoomPolicy 携清单/客户端自动下载)未做——现状=服务器目录
  是唯一真相源,客户端不带 mod 读档走占位降级+toast(tML 专用服务器同起步形态)。
- SimHost 的 mod NPC AI:serverAuth 房 L2 entry 在 server 进程执行(node
  entryLoader),npcAi 钩消费 game 实例——可跑;联机带宽面(mod 弹/NPC 快照量)
  未压测,登记。

## P6.4 灾厄评估摘要(全文=docs/calamity-port-assessment.md)

实测:灾厄源码 **7,780 文件 / 836,592 行 C#**;Items 2,711/NPCs 396/Projectiles 2,214/
Tiles 1,121;hook 覆写画像 SetDefaults 4,999/AI 2,355/OnHit 族 1,700+/AddRecipes 1,732;
CalPlayer 22k+CalamityGlobalNPC 6k(全局粘合剂);ILEditing 4.4k;资产 PNG 9,205。

**全量移植 ≈4-7 个月**(AI 批量转译吞吐锚:本仓原版移植实证 491,530 行 TS/约 2 个月
≈8,000+ 行/日;初版「1,000-1,500 专注日/手搬锚」经用户纠偏作废)。
**灾厄-lite**(数据全量+8-10 中档 Boss+1 群系)≈4-7 周。
**单 Boss 试点**(荒漠灾虫级)≈1-2 周——已随 P7 落地验证。

---

# P7 批章(2026-10-05)——灾厄实战移植(6 模块并行+集成)

> ★目录归一(P7 后期用户拍板):mod 工程=**`game/mods/<name>/`**(与 GLM娘 glmgirl
> 同目录;`calamity/` 旧位置已清)。.swmod 产物=`game/mods/dist/`;server 自动装载
> 路径=`server/mods/`(启动同步)。测试跑法=模块目录 `../../game/node_modules/.bin/vitest
> run`;引擎相对路径=模块 tests/ 起 `../../../src/`(3 级:tests→module→mods→game)。

## P7.1 六模块移植结果(≤6 子代理并行,各自 .swmod 工程+测试全在 mod 目录)

| 模块 | id | 内容 | 测试(模块目录内) |
|---|---|---|---|
| materials | calamity_materials | 40 材料(10 稀有度档)+4 配方+research | 53 绿(对拍 45/round-trip 3/引擎 5) |
| weapons | calamity_weapons | 18 前期武器(近战 8/远程 8/魔法 2) | 29 绿(对拍 22/round-trip/集成) |
| accessories | calamity_accessories | 25 配饰(9 防御/9 效果占位/7 vanity) | 59 绿(对拍 51/round-trip 4/集成 4) |
| enemies | calamity_enemies | 14 普通怪(6 aiStyle 家族)+9 掉落素材 | 66 绿(对拍 48/round-trip 11/集成 7) |
| desert-scourge | calamity_desert_scourge | **荒漠灾虫 Boss 试点**(三段蠕虫+2 弹+召唤物+AI 钩试点) | 18 绿 |
| potions | calamity_potions | 15 消耗品+商店 10 货架(商人/树妖) | 42 绿(桥真验证 18/对拍 18/round-trip 6) |
| **合计** | 6 mod | **134 物品+39 NPC/弹+4 配方+10 货架** | **267 测试全绿**(各 mod 目录内) |

> **目录归一(P7 收口拍板)**:6 个子目录=并行开发单元,最终交付=合并打包为
> 单 `calamity.swmod`(`game/mods/dist/calamity.swmod`,286KB)。6 目录保留作
> 开发组织(并行 agent 无冲突+独立测试),不是最终分发形态。

## P7.2 集成验证(_integration 自动发现套件,7/7 绿)

- 6 mod 联合装载零错误;跨 mod id 分区无碰撞(items/tiles/npcs/projs 四域唯一性);
- id 段域正确;依赖声明闭合;每 mod 引擎访问器可达;**联合存档 round-trip 不错位**。

## P7.3 移植产出的框架缺口清单(六路 GAPS 汇总,按痛度)

**P0(堵死内容类)**:
- mod 蠕虫链运行时建链原语(M5:自然生成/F6 走 WORM_CHAIN_HEADS 原版白名单,mod 头恒光杆)
- mod NPC 金币价值接线(**P7 已修**:registerModNpcValue+npcValueOf mod 段)
- 掉落引用原版 vid(**P7 已修**:buildDropRules 数字直通)
- ModNpcContent 缺 alpha/behindTiles/dontCountMe/value 接线(P7 已修 value;余项登记)

**P1(表现力)**:
- 命中修正链(OnHit/ModifyHit 族,灾厄画像 1,700+ 处最大 single 缺口)
- mod NPC boss 位(血条/Boss 槽/音乐)/FindFrame 自定义帧序/帧动画声明面
- CalPlayer 级全局钩(玩家字段/命中修正)/UpdateAccessory 效果面(18 配饰效果空缺)
- 自定义稀有度表(灾厄 12-13 档)/mod 音效通道/glowmask

**P2(细节)**:ModProj 帧动画/动态 tileCollide 门/延迟重力;npcSlots/SpawnChance/
AIType 逐型支;配方组与 Graveyard 条件;装备外观(AutoloadEquip)。

**P7 已修引擎面(框架由实战驱动完善的实证)**:types.combat.useAmmo 补列(M2)、
stats.life 透传(M3)、ModNpcContent.drops 支持原版 vid+registerModNpcValue(M4)、
perf 守卫阈值并行争用余量(伪红治理)。

## P7.4 测试卫生注记

- 合并跑 CPU 争用:慢测(双 loadModsPhase1 阶段)显式 60s timeout;perf 阈值
  并行余量 3×(独跑 17ns/守卫 50ns)——两类伪红均已判例化。
- 集成架子自动发现 calamity/ 下实装工程(0 模块=skip;新模块合入自动纳管)。

---

# P7.5 批章(2026-10-05)——单体归一收口(6 子工程清理+测试并口)

> 用户拍板:「并行产生的 mod 清理,保留单体」。6 子工程目录删除,测试全数并口
> `game/mods/calamity/tests/`;mods/ 目录已 .gitignore(历史 8 文件 git rm --cached)。

## P7.5.1 内容面定谳

- **合并完整性机械核对**:items 键面 109 声明去 4 同键=105 唯一键,子工程↔单体
  双向 diff 零缺零多;npcs 17(14 敌怪+3 荒漠灾虫)/projs 2/recipes 4/shops 2;
  纹理 124=124 零缺零多(删目录前最后一验)。
- **★4 同键素材权威翻案**:blighted_gel/plague_cell_canister/pearl_shard/starblight_soot
  在 materials 与 enemies/desert-scourge 双声明——合并时误取 enemies 变体
  (maxStack 999/无 research/中文名);**权威=materials 变体**(maxStack 9999=
  CommonMaxStack 判例+research 25/100+英文名与全 mod 一致),已取回重验。
- **入口钩合并**:desert-scourge 两钩(沙漠徽章召唤 sw.itemUse + customAiPilot
  门控 sw.npcAi 试点)并入单体 scripts/main.js;mod.json 补 config schema。
  其余五模块纯声明式无入口代码。

## P7.5.2 测试并口(14 test 文件+2 helpers,277 测试全绿)

- 文件名前缀域化(mat-/weap-/acc-/ene-/ds-/pot-)+共享件:`alloc.ts`(id 推演镜像)、
  `ene-helpers.ts`、`pot-helpers.ts`。
- **calamity-merged.test.ts 重写(10 条)**:装载计数=合并定谳(105/17/2/4)/id 段域/
  段内唯一/vid≡stable/itemCombat 可达/NPC 贯通/配方 notDecraftable/**entry 执行+
  徽章钩门闭开两相**/customAiPilot 缺省关→无 npcAi 接管/存档 round-trip。

## P7.5.3 并口判例(「唯我独占」假设在合并单体下全数失效)

1. **★naive 偏移 id 断言**(`800+i`/`30000+i`/连续段锚):只在自家 mod 独占分配域时
   成立——并口一律改 **alloc.ts 推演镜像**(盘上 content/ 全集字典序连续分配的
   机械镜像),确定性断言语义保真。
2. **★目录清单相等断言**(`onDisk == 自家键集`):合并集=105,自家键必为**子集**——
   改「自家 N 键全部 ⊆ 盘面」;it.each 遍历面改自家硬表驱动(非目录驱动)。
3. **★zip 范围决定 counts 口径**:全量打包(content/+textures/)=合并计数;部分打包
   (仅 items 域)=npcs/projs/recipes 恒 0——断言前先核该文件的 buildZip 范围。
4. **★describe 收集期 filter 恒空**:派生数组(如 statItems)在 describe 回调里
   filter beforeAll 填充的数组=收集期求值恒空(首测伪绿/计数测伪红)——改惰性
   函数 `const statItems = () => itemIds.filter(...)`。
5. **防御性 entryLoader throw 必炸**:「纯数据 mod 不应装载脚本」守卫在有脚本 mod
   里=装载全炸;合并单体含 main.js,一律注真装载器(new Function 版)。
6. **合并跑固定 20ms 等待=伪红**(P7 判例复现):动态 import 落桶在 CPU 争用下
   超 20ms——改轮询 `for (i<200 && added.length<N) await 10ms`。
7. **族视图过滤模式**:引擎断言按族语义成立(武器=声明 combat 的件/配饰=声明
   stats.acc 的件/消耗品=func 带 heal/buffType 的件)——合并集内用「声明面谓词」
   圈定自家族,不硬编码键表;acc 旗/s 字段全 mod 普查后计数断言(18/7/0)方可保留。

## P7.5.4 交付形态(最终)

```
game/mods/calamity/          # 单体 mod 工程(253→268 文件)
  mod.json                   # id=calamity api=1 + customAiPilot config
  scripts/main.js            # 合并入口(徽章召唤+AI 试点两钩)
  content/                   # items 105 / npcs 17 / projectiles 2 / recipes 4 / shops 2
  textures/                  # 124 png
  tests/                     # 16 文件 277 测试全绿(含 alloc.ts 推演镜像)
game/mods/dist/calamity.swmod   # 交付包(272 文件,validate ✓;6 子包已清)
game/mods/_integration/         # 联合装载架子(自动发现,现收 calamity 单体)
```

---

## 1. 本批落盘清单(全部 tsc 零错、esbuild 面绿)

| 域 | 文件 | 内容 |
|---|---|---|
| 核 | `src/mods/types.ts` | manifest/L1 内容 spec/ID 段常量/RegistrationPlan/ModLoadResult |
| 核 | `src/mods/manifest.ts` | 清单解析+schema 门+semver(^x.y.z) |
| 核 | `src/mods/pack.ts` | .swmod zip 展开(fflate 既有依赖)+目录约定发现 |
| 核 | `src/mods/plan.ts` | Kahn 拓扑+确定性 id 分配(拓扑序内字典序)+引用校验 |
| 核 | `src/mods/register.ts` | 计划→注册面翻译(combat/func/stats 三表拆写;drop/recipe 域翻译) |
| 核 | `src/mods/store.ts` | 持久化(kv `sw.mods.installed` + `mod:zip:` blob;PackStorage DI 同构) |
| 核 | `src/mods/loader.ts` | 编排:discover→validate→topo→register→结果单例;worker 桥供数 |
| 核 | `src/mods/bridge.ts` | ModIdBridgePayload 供数(零依赖;Client 握手拉取) |
| 资产 | `src/mods/assets.ts` | vimages 注入(物品=`vanilla/Item_<id>.png` 覆盖键;NPC=模板键;tile=vmeta 运行时注册+伪 sheet≡stable) |
| UI | `src/mods/modsPanel.ts` | 模组面板(列表/启停/导入/卸载;reload 生效) |
| 注册面 | `src/data/items.ts` | `registerModItem`(30000+ 恒等域)+`applyModItemIds`(worker 桥) |
| 注册面 | `src/data/tiles.ts` | `registerModTile`(1030-2047,伪 sheet≡stable)+`applyModTileStableMap`+`applyModTileDefs`;TILE_STABLE_OF_INTERNAL const→let |
| 注册面 | `src/data/vanillaNpcs.ts` | `registerModNpc`(800+)+`vanillaItemKey` mod 段回退(配方管线贯通) |
| 注册面 | `src/data/vanillaRecipes.ts` | `registerModRecipes`(强制 notDecraftable) |
| 注册面 | `src/data/vanillaItemFunc/Combat/Stats.ts` | `registerModItemFunc/registerModCombat/registerModStats`(TABLE/STATS/双 Map 直写) |
| 注册面 | `src/drops/NpcDrops.ts` | `registerModNpcRules`(原版 Rule 形同池追加) |
| worker | `src/workers/save.worker.ts`/`worldGen.worker.ts` | `applyModIds` 消息(物品恒等域接长+tile 对偶表) |
| worker | `src/workers/BakeProtocol/BakeClient/BakeWorker` | ship 通道带 `modTiles`(def 保序直落)+首波 ship 含 `mod/` 贴图 |
| worker | `src/workers/SaveClient.ts`/`WorldGenClient.ts` | ensure 后推桥(BJ328 懒重建范式下每次重建补推) |
| 接线 | `src/main.ts` | boot 链 loadModsPhase1(Lang.init 后)+applyModAssets(loadAssets 内,8s 护栏) |
| 接线 | `src/ui/TitleMenu.ts` | 模组按钮(成就与设置之间)+面板入口 |
| 存储 | `src/save/KvStore.ts` | `modPutZip/modGetZip/modDeleteZip`('mod:zip:' 前缀,零 DB 升级) |
| l10n | `tools/l10n-custom/{zh-Hans,en-US}.json` | 11 键(Menu.Mods/ModsPanel.*);build-l10n 已重建;l10n-audit 全绿 |
| 测试 | `tests/mod-loader-core.test.ts`(17) | manifest/pack/拓扑/确定性分配/注册 API/**中立性金标**(原版段逐引用恒等+稳定表旧段逐值恒等+byKey 采样对账) |
| 测试 | `tests/mod-save-bridge.test.ts`(3) | worker 态纯 id 场景(独立模块态=worker 语义) |
| 测试 | `tests/mod-e2e.test.ts`(9) | demo mod 全链:zip→装载→三表→tile/NPC/配方→**存档 round-trip(物品+tile)** |
| 探针 | `scripts/_mod-boot-probe.mjs` | 真机 boot 中立性(标题菜单/面板/?play 引导;5203 私有实例已验全绿已撤) |

## 2. 关键定谳(本批新产判据)

- **mod 物品 vid≡stable id(30000+)**:`combatWeapon` 的 `def.vid ?? -1` 门是物品
  战斗派发的总闸——mod def 回填 vid 后全链(updateUse/combatWeapon/itemFuncOfVid/
  itemCombat/recipes)零改白嫖。与 plan-A internal≡stable≡vid 恒等域同构。
- **mod tile 伪 sheet≡stable id(1030+)**:站点匹配(craftingGrid filterRemainOpen)
  与渲染 vmeta 都在原版 sheet 域求值——伪 sheet=stable 的恒等式让两条链同时成立。
- **确定性分配=联机一致性根**:Kahn 字典序队列+mod 内键字典序;同 mod 集合恒同分配
  (mod-e2e 断言双入序恒同)。
- **中立性金标**:零 mod 时数据模块注册面零调用=注册表逐字节现状;有 mod 时原版段
  逐引用恒等(mod-loader-core 中立性测试三重锁)。

## 3. 验证账

- tsc --noEmit:本批文件零错(全仓 4 处 Bestiary 红系并行会话 14:34 在改文件,域外不判)。
- 守恒链金标 9 文件 89 测试全绿(fx11 save-parity/save-migration-v4/item-stats-golden/
  npc-stats-golden/npc-frame-golden/atlas-append-golden/fx43-wld-compat/wld-export/item-variants)。
- mod 域 29 测试全绿(17+3+9)。
- 真机探针:零 mod boot 全绿(标题菜单/模组按钮/面板开合/?play=small 进世界零 console 错)。
- **全量 vitest 定谳(两次独立复跑)**:21518 过/70 红(14 真测试文件)+ 8 个 Failed
  Suites(`tools/_*.test.ts` 一次性诊断仪具,项目惯例死探针)。14 文件 23 红逐一归属:
  并行会话当日 05:21/13:53 在改文件的结构锁与夹具(Game.ts tryMine 家族×5/UI.ts
  结构锁/Renderer uploadScratchBake/ScreenShader ×3/AchievementsUI 重试审计)与
  前期遗留数据漂移(10月1日 vanilla-itemrare/value 表变更 vs 9月20 itemstats 现库
  →era-guard 5 红;remaster-catalog 6174≠6176);**零 mod 签名红**(失败全文 grep
  `mod_|30000|registerMod`=空;本批 18 个触面文件无一出现在红因链)。

## 4. 边界声明(P0 完成含义)

含:L1 数据 mod 全链(装/卸/启停/依赖/确定性 id/存档身份/worker 三域桥/资产注入/
面板/boot 接线)+零破坏证明(中立性金标+守恒链+真机零 mod boot)。
不含(P1+):L2 脚本 mod(defineMod/钩子面)、L3 白名单补丁、mod 自定义弹幕/buff 效果/
自定义 AI、mod 内容进商店/图鉴/成就/旅程、存档头 mod 清单(检测缺 mod 提示)、
多语言 i18n 运行时合并(当前 mod 名=内容 JSON 字面)、Electron 桌面 mods 目录路由、
CLI/类型包/模板工具链、真机带 mod 视觉验证。

## 5. 移交件(下一刀任务书)

1. **全量 69 红定谳**:重跑日志 /tmp/vitest-full-modloader.log;判据=失败文件与本批
   触面(items/tiles/vanillaNpcs/vanillaRecipes/itemFunc/Combat/Stats/NpcDrops/KvStore/
   workers/TitleMenu/main)的 import 交集;零交集=域外债登记不判罪。已知并行会话
   14:34 在改 Bestiary.ts(tsc 4 红同源)。
2. **真机带 mod 视觉验证**(P0 残项):node 无 createImageBitmap,assets 注入须真机;
   步骤=面板导入 demo .swmod(buildModModZip 可提为 scripts 工具)→reload→
   DebugSummonPanel 召唤 mod NPC→观察贴图/AI(aiStyle 1)/掉落;mod tile 放置→chunk
   烘焙(桥已通,视觉待验)。
3. **P1 刀序**:L2 defineMod+钩子面(Enemy aiStyle default 前插 mod handler 表→
   updateUse mod 分流→BuffType 追加+onTick)→存档头 mod 清单(SaveMeta.mods 三处
   装配,仿 BJ71 防漏喂)→商店/图鉴/成就面。
