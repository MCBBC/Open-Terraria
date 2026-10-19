# 探针纪律与统一框架指南(IIIII236)

> 本文把长征沉淀的探针坑史固化为「坑表 + 框架默认行为」两件事。
> 坑表每行:**现象 → 根因 → 解法 → 归入 API 哪个默认行为**。
> 框架入口:`game/tools/probe.mjs`(CLI)+ `game/tools/probe/lib/*`(库);
> 场景脚本仍可按老规矩 `node tools/run-diag.mjs` 跑(读 `SW_ORIGIN`)。
> 证据链:每行标注 memory 判例名(`~/.claude/projects/-Users-vinlic-Project-GLM-SandboxWorld/memory/<名>.md`)。

---

## 0. 一分钟上手

```sh
# 推荐:CLI 全托管(私有 vite + 看门狗 + 杀树)
cd game
node tools/probe.mjs run scripts/_my-probe.mjs --seed=drunk --size=small --vite=auto

# 老规矩(已有私有实例 5201 时)
SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_my-probe.mjs

# 自检(端口/Chrome/puppeteer/资产/桥)
node tools/probe.mjs doctor --browser
```

场景脚本骨架:

```js
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger } from '../tools/probe/lib/index.mjs';
const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await pump(page, 120, { clearEnemies: true });
  // ...断言...
  process.exit(L.exitCode());            // 0=绿 / 2=断言失败
} finally {
  await browser.close();                 // 孤儿防线(见 §J1)
}
```

四模板预设(骨架已代驾,只写钩子):`presets.worldgenScenario / gameplayScenario / uiScenario / audioScenario`。

截图三坑速查(IIIII240 收编;细节见坑表 C11/D11/E12):

```js
import { stage, screenshot, ensureContent } from '../tools/probe/lib/index.mjs';
// ① 布景:清整带+寻地面+铺地板+火把照明+目标物+玩家传送布景中心+相机对框
const sc = await stage(page, { platform: { key: 'stone' }, light: 'torch', tiles: [{ dx: 0, dy: -1, key: 'torch' }] });
// ② 昼夜受控截图:钉钟 night 22:00+光照收敛+夜拍自动补火把(时段保真)+拍完回滚钟面
const night = await screenshot(page, 'scene-night', { time: 'night', wx: sc.wx, wy: sc.wy });
const day   = await screenshot(page, 'scene-day',   { time: 'day',   wx: sc.wx, wy: sc.wy });
L.chk('昼夜两拍都可见', night.ok && day.ok && night.lit.fp.fnv !== day.lit.fp.fnv);
// ③ 欢迎弹窗:createGame 默认自动关(bootstrap 预置 ack 第一层+进世界首轮 dismiss 第二层);
//    UI 测试要看弹窗=presets.uiScenario + bootstrap(…,{welcomeAck:false})
```

---

## A. 进程与 vite 实例

| # | 现象 | 根因 | 解法 | 归入 API 默认行为 | 判例 |
|---|------|------|------|--------------------|------|
| A1 | 探针跑到一半页面 navigation 错误/整页重载 | 多会话共享 5199,任一会话改源码触发 HMR full-reload | 探针一律私有实例(SW_PORT=52xx),5199 只留给人工试玩 | CLI `--vite=auto` 默认扫描 5201+ 起私有实例 | CLAUDE.md 并行会话 vite 约定 |
| A2 | `kill <nohup 的 pid>` 后端口仍被占,第二次跑连的是旧 server("同命令不同结果") | `nohup npx vite &` 的 PID 是 npx 壳,真 server 是子进程 | `lsof -ti :PORT -sTCP:LISTEN \| xargs kill`;杀完以监听者=0 验收 | `vite.killTree()` 三段式:进程组 TERM → lsof 监听者 TERM → KILL,返回 `listenersLeft` 供 CLI 验收 | vite-probe-stale-transform-cache;IIIRS216 lsof-kill 判例 |
| A3 | run-diag 超时 SIGKILL 把 nohup vite 一起带走 | 信号打进同进程组 | 探针自管 vite 生命周期(CLI 起的 CLI 杀);超时后先 `nc -z`/`httpUp` 查端口再续跑 | CLI 由父进程持有 vite 子进程引用,SIGKILL 只打场景子进程 | lavaslope 五坑#5 |
| A4 | 改盘源码不生效,连"杀实例+清 SW_CACHE+重启"都吐旧码 | SW_NO_HMR 实例的模块转换缓存长期不失效(SW_CACHE 未必被消费) | 探针内动态 import 一律带 `?t=Date.now()` 击穿;关键验证前 `curl origin/src/<file>.ts` 验 served。★但 `?t=` 只许用于**无状态表**(TILE_DEFS 等)——**单例模块**(`export const x = new X()` 态,CreditsRoll/Buffs 管理器族)带 `?t=` 会新开一份实例,读不到引擎正消费的那份(IIIII236 迁移实测:creditsRoll `?t=` 后 isEventOngoing 恒 false 而 overlay/music 全真) | `world.importFresh` 注释钉死"单例禁 bust";单例一律裸 import | vite-probe-stale-transform-cache + IIII236 迁移案 |
| A5 | 多实例并发启动 optimizeDeps 竞争/缓存互踩 | 共享 `node_modules/.vite` | 每实例独立 `SW_CACHE=/tmp/sw-probe-<port>` | `startPrivateVite` 固定注入 | vite-probe-stale-transform-cache |
| A6 | 端口"看起来空闲"实际已被别的会话占 | ①扫描-启动之间竞态窗口;②并行会话 vite 常只绑 `[::1]`(IPv6),只探 127.0.0.1 漏判已占 | 双栈探测(127.0.0.1+::1 任一连通=忙);启动前 `httpUp` 复检,撞上即换端口重扫;strictPort 保证 vite 不静默漂移 | `pickFreePort` 双栈+`startPrivateVite` 竞态复检 | vite.config.ts strictPort 注+IIII236 doctor 实测 |
| A7 | 一次性脚本变 4 小时满核孤儿 | import 链带起不可退出活句柄;TERM 对忙循环无效 | 所有 `_` 前缀脚本经 run-diag/probe CLI 跑;子进程导入完成 0.5s 强退;总看门狗 SIGKILL | CLI `--_child` 模式 + `--timeout`(默认 600s) | diag-script-orphan-prevention |
| A8 | 探针自己 spawn 的 server 泄漏 | `server.kill()` 只杀包装进程 | detached+进程组击杀,所有退出路径先杀 server | CLI 拥有 vite;场景脚本不允许再 spawn server | diag-script-orphan-prevention |
| A9 | 素材管线整个 off 却静默全图回退("只有角色贴图完好") | SW fail-open 三道门全放行 | 发布/疑 SW 形态先查资产可达 | `doctor` 检查 `sprites/vanilla.json`/`l10n/zh-Hans.json`(status+字节) | sw-off-failopen-vanilla-total-miss |

## B. 浏览器环境(headless 后台五坑扩展)

| # | 现象 | 根因 | 解法 | 归入 API 默认行为 | 判例 |
|---|------|------|------|--------------------|------|
| B1 | 后台 tab 里游戏循环停摆→截图黑屏/相机不动 | headless 后台 rAF 节流 | launch args 三件套 + 每步 `bringToFront` + 相机手动 snap + 截图前活像素哨兵 | `launchBrowser` 固定 args;`browser.front()` 于 pump/shot/camera 各入口调用;`shot.litStats` 哨兵 | lavaslope 五坑#1 |
| B2 | 周期/时长断言系统性偏慢(0.44×) | headless Chrome rAF ~27fps=时间膨胀 | 一切周期计量用游戏 tick(`fixedUpdate` 直泵),不看墙钟 | `pump/pumpUntil` 走 fixedUpdate;坑表钉死"tick 计时" | spikeball…探针坑(二) |
| B3 | 音效断言全空(fetch 层零记录) | AudioContext 自动播放策略挂起 → Sfx 播放全 defer | navigator.webdriver 探针直通(main.ts:812);必要时机合成手势(点击+按键) | `launchBrowser` 页面天然 webdriver=true;`presets.audioScenario` 内置手势兜底位 | _iii215b-sfx |
| B4 | puppeteer Chrome 成孤儿占内存 | 被 SIGKILL 时跳过 `b.close()` | try/finally + SIGTERM 处理器 close + 巡检收割 | `browser.activeBrowsers` 注册表;CLI 子进程 SIGTERM→`closeAllBrowsers()`;orphan-reaper 兜底 | diag-script-orphan-prevention |
| B5 | 断言"页面没这个 DOM 按钮"假红 | VUI 是 canvas 绘制,`pointer-events:none`,DOM 无按钮 | 真实鼠标坐标点击;或绕过交互直驱状态 | `boot.ackWelcome` 预置 ack 免交互;坑表钉死"canvas UI 别查 DOM" | _iii218-shots 欢迎弹层注 |
| B6 | 鼠标 Y 映射断言在浏览器环境时好时坏 | 环境过敏(视口/DPR/合成层) | 这类断言交还 vitest 单测,浏览器探针只留行为级 | 坑表纪律(框架不提供鼠标映射断言) | boomerang verify3 F 段 |
| B7 | 录到 `sidebar.*.js` Interval Violation 误判游戏问题 | 浏览器扩展注入计时器 | 忽略;后台节流下必然出现 | 坑表纪律 | canvas-readback-flag-policy |
| B8 | `willReadFrequently` 警告刷屏怀疑游戏代码 | 探针自己反复 getImageData | 探针读回画布一律一次性离屏 scratch(创建→draw→read→丢弃) | `shot.litStats` 每次新建离屏 canvas 且带 flag | canvas-readback-flag-policy |
| B9 | 渲染通道按需预算/降级需要 A/B 而全帧 sha 对拍不稳 | 全帧含粒子/天空等渲染期随机面,跨 pass 不自洽(IIIII249 实测 5/6 站 UNSTABLE) | 对拍下沉到目标通道自身产物层(如 TileShine `shineDebugChunkDigests` 逐 chunk 像素校验和);逐位恒等证明一律**页内同源**(跨页 A/B 会被底图换代时序差污染);A/B flag 走查询参数(惯例 `?glband`/`?invlayout`) | TileShine:`?shinebudget=<ms>` 时间盒(缺省 off 逐位不变;`=0`=逃生门);`shineStats`(bakes/resumes/resumesStalled/catchupMax/hits)+`shineDebugChunkDigests`/`shineDebugResumeIdentity`/`shineDebugPendingState` 经 `import('/src/render/TileShine.ts')` 读;仪器 `scripts/_iii249-{equiv,shine-ab}.mjs` | IIII249(内容对账文档 CCXXI 章) |
| B10 | 坡面/半砖岸格水缘的波纹覆盖 A/B(静态单帧不可判——效果=时域位移) | 原版 obj19 门控足迹=前景水 α,坡面格无前景水恒不位移(IIIII251 定谳);覆盖效果只能时域差分断言 | 冻结时钟+定机位+池心周期涟漪驱动,坡面区域矩形做长基线帧间差分;**矩形映射用 `renderer._waveCss`(渲染系帧态),禁帧外读 camera.x**(跟随缓动差 83 设备px,五区域全错格);坡面区域水平内缩 1 世界 px(邻水边界列原版果冻经 uWater 线性采样溢出,vanilla 亦动);足迹在画判据=门控画布矩形 α 扫描 max(α=0.02→5,肉眼不可见,单点取样落 LiquidSlope 对角线透明侧假阴) | VanillaLiquidRenderer:`?slopewave` 旗(★IIIII257 已转正缺省 true,`?slopewave=0`=逃生门;位移/扭曲交付面=足迹门控+waveBob,亮线常开段不归本旗管);`slopeWaveEnabled` 经 `import('/src/render/VanillaLiquidRenderer.ts')` 读;门控画布取证钩 `waterWarp.endFgPass`+`gateCanvas()`;GL 路仪器 `scripts/_iii251-verify.mjs`(内缩矩形+双臂)+`_iii255-{forensics,alphamap,xform,timeseries}.mjs`,CPU 路(`?wwarp=0&slopewave=1`)`_iii255-cpubob.mjs`,性能闸 `_iii255-perf.mjs` | IIII251+IIII255+IIII257(内容对账文档 CCXXV/CCXXVII 章) |

## C. 启动、世界装载与"进世界"门

| # | 现象 | 根因 | 解法 | 归入 API 默认行为 | 判例 |
|---|------|------|------|--------------------|------|
| C1 | 死等 10.3s 启动幕/音频门 | 全时序 splash 是菜单形态的 | `?play=small` 旁路(bypassBoot)或等桥不睡死 | `createGame(mode:'url')` 走 `?play=`;其余模式等 `__swFlow` 桥而非 sleep | main.ts:815/929 |
| C2 | `waitForFunction` 超时在 splash 前段 | 桥挂载晚于 assetsP/UIFont | 等 `__swFlow.newWorld` 就绪再驱动 | `boot.waitForBridge` | 各探针既有纪律 |
| C3 | 进世界后又等错对象 | `__swGame` 先出现、`world/player` 后挂 | 等三元组 `__swGame.world && player` | `game.waitForGame` 三态轮询+心跳日志 | _iii233-loadcheck |
| C4 | 生成中态采样 0 样本 | `await createWorldProbe()` = 等生成完才开始采样 | 创建流【不 await】,60ms 高频采样 `__swGenUi` | `createGame(mode:'ui')` 同款 fire-not-await;注释钉死 | _iii215b 采样纪律 |
| C5 | 欢迎弹窗进世界后才弹,挡截图/点击 | 首访 ack 未置 | 预置 localStorage ack + 兜底摘 DOM | `boot.cleanStorage(welcomeAck)` + `ackWelcome` | WelcomeAnnounce.ts;_iii218 |
| C6 | "干净状态"没清干净 | 只清了 localStorage | 清 IndexedDB(`sandboxworld` 库)非仅 localStorage;IDB 删除与活连接竞态→删后 reload | `boot.cleanStorage` + bootstrap 内自动 reload | desert-style4 探针坑 |
| C7 | 世界生成完立刻断言,读数半初始化 | afterWorldLoad 尾段(minimap/装备刷新)未跑完 | 建世界后 settle ≥1.5s 或等 `minimapReady` | `createGame` 内置 `settleMs=1500` | _iii219/_iii232 等 2s 惯例 |
| C8 | 存档回环后玩家站出生点,秒被 despawn(伪死/冻结假象) | `loadJson` 后 player 在世界出生点(非存档位),activeRange 外 despawn | 回环后必须把玩家传回存档位再泵 | `game.teleport`;坑表钉死(loadJson 纪律) | slime-water-pocket probe 陷阱① |
| C9 | 大师档掉落断言假红(袋 3328≠钥匙 1141) | 难度域决定掉落 | 掉落断言先核对 difficulty 域 | `createGame(mode:'ui')` 固定 difficulty=0;坑表钉死 | chain-playthrough 坑④ |
| C10 | 世界重建后 id 对不上(直比 id 假差) | 地图导出 tiles=stable id 空间,运行时=内部 id,且 `__swTiles['v_53_…']` 的键≠值 | 两世界同构用直方图指纹;物品/敌怪一律 vid→内部 id 反查 | `world.itemByVid`;`world.findTileBySheet`;坑表钉死 | desert-style4;chain-playthrough 坑④ |
| C11 | 首访欢迎弹窗在「进世界后」才弹(bootstrap 阶段查无此物);ack 预置漏网(隐私模式 localStorage 抛错/探针自清存储)时挡住首轮截图/点击/滚轮 | 欢迎公告挂 mainFlow onWorldReady(mainFlow.ts:391)=世界就绪【之后】才出现——C5 的 ack 预置是第一层,漏网需第二层;原生关法=DOM 按钮click(写 ack+remove) | `boot.dismissWelcome`(按钮 click → 摘根+补写 ack → 本就没弹=absent 不算失败);`createGame` settle 后默认自动关;UI 测试要看弹窗=`presets.uiScenario`(keepDialogs:true)配 `bootstrap(…,{welcomeAck:false})` 不预置 ack | `boot.dismissWelcome`;`game.createGame(keepDialogs)` | WelcomeAnnounce.ts;_iii218-shots;_iii220-visual |

## D. 时间、泵与采样

| # | 现象 | 根因 | 解法 | 归入 API 默认行为 | 判例 |
|---|------|------|------|--------------------|------|
| D1 | 世界不动/生成应用不推进 | headless 下无人泵 | 手动 `g.fixedUpdate(1/60)` 泵 | `pump/pumpInline/pumpUntil` | desert-style4 探针坑 |
| D2 | 长泵单次 evaluate 协议超时 | 一次 evaluate 泵几千 tick | 分段泵(30t/段)段间让路事件循环 | `pump` 默认 step=30 | _iii219 泵纪律 |
| D3 | constant/zenith 黑暗伤害污染饥饿等断言(必死冻结链) | DontStarveDarkness 120t 蓄力 250 伤 | 分段泵每段 `dontStarveDarkness.reset()` + 石盒庇护所 + 手持火把 | `pump(resetDarkness:true)` + `world.buildShelter` | _iii219 泵注释 |
| D4 | 敌怪/弹幕串场污染断言 | 刷怪相位在 entities.update 之后 | 每段清 `enemies/projectiles`;计数用"清桶+单调 max" | `pump(clearEnemies:true)`;`stats.cleanUpToIdle` | spikeball 探针坑(三) |
| D5 | "缓慢漂移"其实是极限环 | 30t 采样对 ~10t 环=相位漂移伪影 | 采样周期与被测环周期互质;逐 tick 仪器;先怀疑采样再定罪引擎 | `pumpUntil(step=17 缺省)`;坑表钉死"互质意识" | guide-elevator |
| D6 | 单次 A/B 差异被当信号 | 敌怪 AI=Math.random 非种子流 | 6× 统计,两臂逐位一致才算数;跳变归因做机制指纹 | `stats.runReplicates` 默认 runs=6 + `allRuns` | slime-water-pocket |
| D7 | 攻击断言整段哑火(v1 全失败、插桩却过) | 多段复用同页面累积 useTime/swing/inventory 脏态 | 每段 cleanUpToIdle(松手+清弹+useTime 归 0)+自然节拍 | `stats.cleanUpToIdle`;`runReplicates` 每跑前自动 | boomerang 探针通用教训 |
| D8 | 双参假红:`fixedUpdate(dt)` 少参 | 引擎签名 `(dt, game)` | 泵统一 `g.fixedUpdate(1/60)` | 框架所有泵内置 | boomerang 四批 |
| D9 | 时间读数口径错(正午/黄昏对不上) | 双时间口径:`world.timeOfDay`(0.5=正午)与 `world.clock.timeOfDay`(0.8125=黄昏跨段)并存 | 按断言域选口径,勿混 | 坑表钉死 | desert-style4;_iii219 P3b |
| D10 | 掷骰/生成窗断言 vacuous | 采样窗按墙钟对齐错位 | 窗口按【槽名/事件】驱动(onProgress 体前回调等) | 坑表钉死(worldgen 面) | uuu-liquid 坑 b |
| D11 | 昼夜敏感截图踩反:白天场景截到全黑/夜行内容截到白昼;同探针两拍时段不一致;夜拍无光源黑帧被当"没截到" | 钟面按真实时间推进(dayLengthMs=24min 全周期),headless 实验一跑几分钟=跨过晨昏线;裸赋 timeOfDay 后又泵=钉了也漂(freezeClock 的动因);夜拍缺光源=真黑帧(§E3 哨兵黑≠功能缺失,但内容断言需要"看得见") | `shot.screenshot(名,{time:'day'|'night'|'dusk'|'dawn'|0..1})` 一条链:钉钟冻结→泵 convergeTicks 等光照收敛(4 态光照周期)→哨兵不过自动补光(**持久火把注入**=IIII220 照明花园;`onDark:'day'/'auto'` 才换昼拍且在返回值如实标注)→拍完 unfreeze 回滚钟面(夹具"像没发生过");时段断言只认返回值 shotTod/shotIsDay | `shot.screenshot`;`staging.TOD/resolveTod` | _iii237-fireblossom(freezeClock 用例);_eoc-dash(夜支 0.9);_iii220-visual(火把花园) |

## E. 相机与画布取证

| # | 现象 | 根因 | 解法 | 归入 API 默认行为 | 判例 |
|---|------|------|------|--------------------|------|
| E1 | 传送后相机还在老地方 | follow 是 0.15/frame 缓动 | 等 ≥2.5s 或直接写 `camera.x/y` | `camera.camSnapTo(Tile)` 直写 | lavaslope 五坑#2 |
| E2 | 全图扫描全程越界(假"0 flagged"假阴性) | `camera.x` 是世界像素,循环变量是 tile 序号 | `floor(cam.x/16)±半视宽/16`;统一从框架取包络 | `camera.viewRectTiles` | lavaslope 五坑#3 |
| E3 | 截到黑/0 像素当"没画" | 后台节流+无活像素门 | 截图前活像素哨兵,全黑=没截到不是"功能缺失" | `shot.litStats` 非零像素哨兵(nonZero/nonBlack) | lavaslope 五坑#1 |
| E4 | 截错画布 | `querySelectorAll('canvas')[0]` 是 80×80 ui-canvas | 用 `g.renderer.canvas`,fallback [1] | `camera.gameCanvasInfo`/`shot.*` | desert-style4 探针坑 |
| E5 | drawImage 指纹断言崩 | 源是 ImageBitmap 无 `.src` | 指纹用 `bmp{width}x{height}`;dx/dy=rest[4]/rest[5] | 坑表钉死(框架不做 drawImage 间谍默认) | lavaslope 五坑#4 |
| E6 | 背景层判定"是哪层的"烧半天 | 钩错对象 | 包 `renderer.biomeBg.img`(贴图加载器)做二分;录绘制参数拦 `biomeBg.draw` 的 target.img;别钩 ctx.drawImage(GL 绕过) | 坑表钉死 | desert-style4 |
| E7 | 暗像素追源误判 | "纯背景模拟帧"vs"含世界格实机帧"=苹果比橘子 | 先做"三层背景全关帧对照"再比 | 坑表钉死 | desert-style4 假阳性② |
| E8 | 模板匹配低分峰当"对齐" | 阈值过低(ncc=0.01 假峰) | 阈值必须够高+多帧 | 坑表钉死 | desert-style4 假阳性① |
| E9 | overlay 文字断言查 DOM 落空 | overlay 是 canvas | 非空像素计数代替文本断言 | `shot.litStats({selector})` | _iii232-credits⑤ |
| E10 | 改了渲染读数没变 | vite 模块缓存 stale(同 A4) | `curl` 验 served;importFresh 击穿;必要时重启实例 | `world.importFresh` | dummy-tile 三板斧 |
| E11 | 猴补计数器不可信 | patch 错原型(vframeAt 在 SpriteAtlas 原型不在 Renderer) | 取证三板斧:猴补调用计数/`getTransform()` 读实况/红框标定 | 坑表钉死 | dummy-tile-overlay |
| E12 | 截到的图不是动作发生区:目标物/玩家在视野外或贴边,或相机还在缓动路上;布景摆位十支探针十种手写 | 相机 follow 0.15/frame 缓动(E1)+光照区随玩家重扫(lighting.ensureRegion 挂 player.cx,Game.ts:10145)——布景=清整带+寻地面+铺地+照明+传送+对框六件套,手工写全的探针少 | `staging.stage({at,platform,light,tiles,npc,player,camera})` 一键布景(自动寻地面/清整带全位归零/火把行照明/目标物落位/玩家传送布景中心/相机直写对框)+截图前 `shot.ensureContent(哨兵窗)` 非零像素+内容指纹断言,不过自动 pump/snapcam/torch 换策略重试(返回值带 mutated 火把落点供记账);★snapcam=玩家+相机一起对到哨兵点——只拽相机会被 follow 朝玩家拖回去(缓动不止) | `staging.stage`;`shot.ensureContent` | IIIIRS233 高尔夫(相机直写);IIIIRS234(清场铺地);IIIIRS220(照明花园) |

## F. 录制通道(F5 音频/尘/UI)

| # | 现象 | 根因 | 解法 | 归入 API 默认行为 | 判例 |
|---|------|------|------|--------------------|------|
| F1 | 音效排查无头绪 | 事件分散在 Sfx/AudioSystem | 用 F5 双通道环:sfx{wav/out/syn/loop/cue} bgm{sel/start/stop/fail/mute},恒开 | `record.audioTail/audioRecordStart/audioRecordStopExport` | audio-recorder-f5 |
| F2 | 满响/衰减失效类 bug 漏判 | sfx 事件无坐标=调用点漏位置 | 断言先看 `d.x/d.y` 有无;固定间隔准点响=自创冷却签名 | 坑表钉死(record 消费纪律) | audio-recorder-f5 定罪①② |
| F3 | "音色不对"无从取证 | 素材缺失/负缓存回退 | 过滤 `syn` 键=合成兜底直接证据 | 坑表钉死 | audio-recorder-f5 |
| F4 | 探针里 BGM 选曲断言读不到 | 选曲门 15t 滞回 | 事件曲即时切(滞回豁免);读位放时间窗后 | 坑表钉死;`record` 注 | _iii232-credits④ |
| F5 | 尘粒子"时有时无"误判 | 池 6000 游标驻留高分位误拒;读 slot/POOL 是伪负载 | 读 `activeCount` 真负载;计数用 spawn 包装 | `record.installDustCounter/dustSummary` | dust-pool-gate-cursor-drift |
| F6 | 环境音淡出漏声类断言误绿 | 状态机逐帧步进,单次 set(0)≠淡出 | 退出静音断言走 stopAmbientCues 等价链 | 坑表钉死 | ambient-cue-audio-alignment |
| F7 | 探针直调引擎音频被拉回 | ensure() 自动 resume 带 `!document.hidden` 守卫 | 探针直调不模拟 hidden;真失焦模拟用 setAudioSuspension | 坑表钉死 | ambient-cue 失焦闸注 |

## G. 世界读写夹具

| # | 现象 | 根因 | 解法 | 归入 API 默认行为 | 判例 |
|---|------|------|------|--------------------|------|
| G1 | 液体域断言 vacuous(F3 类假绿) | AddWater 尾冲毁链是事件驱动,静默写 tile 不触发 | 夹具【液先置 tile 后置】;多格件用 setTileSilent+显式单点级联 | `world.placeLiquidThenTile` 唯一合法形态 | placement-obstruction 十四批★ |
| G2 | 放置夹具莫名自毁/连坐 | 逐格 setTile 触发 D-1 Check* 整件裁决(原版整件写完才级联) | 多格件夹具 silent 写;CheckPot 落实心底格 | `world.clearArea` 后静默写+注释钉死 | placement-obstruction④ |
| G3 | half 位静默丢失(footInCellPx 假 0) | `store.setSlope` 无条件清 half 位 | 铺场顺序:half 后不要再 setSlope 同格 | 坑表钉死(`clearArea` 全位归零是显式动作) | boomerang 二批 |
| G4 | 召王/祭坛类断言不触发 | st.setTile 不触发监听;灯泡有玩家 50 格曼哈顿距离门 | 先贴位再 breakTile;先贴 50 格内 | 坑表钉死 | chain-playthrough 坑① |
| G5 | 教徒/石碑永不召 | PlayerLOS 拒召门(视口盖住地牢口) | 玩家远离等 437,再回去杀 | 坑表钉死 | chain-playthrough 坑② |
| G6 | 塔盾 hurt 无效 | dontTakeDamage 由塔 AI 帧重算 | 清盾后先 pump 2 tick 再 hurt | 坑表钉死 | chain-playthrough 坑③ |
| G7 | 读格判"有方块"漏幽灵格 | JS 裸读 type≠0 vs 原版 active()=flags bit0(残型格域) | 读格一律 `st.hasTile()`(演化域裸读除外——故意裸读) | 坑表钉死 | ghost-tile-consumer-gate;smart-select |
| G8 | 极饿/黑暗类必死场景断言链被冻结 | 玩家被环境打死 | 上帝模式 `p.debugGod=true` + 石盒庇护所 + 手持火把 | `game.godMode` + `world.buildShelter` | spikeball 探针坑 a;_iii219 |
| G9 | 玩家出生点在带外被地形卡楔=场景污染 | 场景出生点未清整 | 场景点必须在清整带内 | `world.clearArea`+`buildShelter` 默认清场 | spikeball 探针坑 c |
| G10 | 食物/种子类放置被静默拒 | placeStyle 反序/豁免面不全(历史案) | 放置断言双向(成功+被拒)都断言,防 vacuous | 坑表钉死 | placement-obstruction 十二批 |
| G11 | 取证绕 UI 走交互链(摆玩家/朝向/点击/LOS)烧半天还环境过敏,或门谓词只能"猜" | 以为 TS `private` 方法运行时不可达 | `private` 只是编译期——JS 运行时方法都在实例上,`(g as any).m(...)` 直调=最快取证路(interactAt/breakTile/isAlchemyPlantHarvestable 类仪器;字段名先查 §「常用字段真名」) | `game.callGame(page, 'interactAt', x, y)`;CLI `node tools/probe.mjs fields` | iiiii236-unified-probe-framework(IIIII237 实战摩擦#2 收编) |
| G12 | 内容型测试每次全量 `generateWorld`(单文件 ~3-19min,全量 288min 慢文件主因) | 固定种子世界被当作一次性脚手架反复重造 | **档案库优先**:`loadFixtureWorld(name)`(tests/world-fixtures.ts)走游戏读档路径秒级载入同一世界,断言面同世界同断言;仅测试主题=世界生成本身(逐 pass 哈希链/终态哈希/双生成守恒/DRUNK 内容回归)或确需新种子才允许 generateWorld——策略全文 `tests/README.md`「测试世界使用策略」 | `SW_GEN_WORLD_FIXTURES=1 npx vitest run tests/world-fixture-gen.test.ts -t "<档案名>"` 再产 | IIIII259(Top-14 慢文件迁移 57min→秒级) |

## H. 统计、A/B 与断言卫生

| # | 现象 | 根因 | 解法 | 归入 API 默认行为 | 判例 |
|---|------|------|------|--------------------|------|
| H1 | 方差冒充 A/B 信号 | Math.random 实体(同 D6) | 6× 统计+机制指纹(如 lifts/eT/16px 抬升) | `stats.runReplicates/compareAB` | slime-water-pocket |
| H2 | 计数读数被弹寿命稀释成负数 | 末−初差分对短命弹 | 清桶+单调 max 采样 | 坑表钉死 | spikeball 探针坑 c |
| H3 | 负对照缺失 → 断言 vacuous | 只有正触发 | 负对照显式成行(如 OOO_SHINY neg=false 才算门控成立) | `ledger.chk` 双行惯例(文档钉死) | _iii231 OOO_SHINY |
| H4 | 金标陈旧 → 迁移/重放假红 | 夹具随引擎演进未重产 | 金标疑陈旧先 oracle 重产再对拍 | 坑表钉死 | adversarial-batch4 |
| H5 | vitest 负载期超时伪红 | 默认 5s 超时+负载 80+ | 先看 Duration/uptime 再定罪;放宽 testTimeout | 坑表钉死(框架单测已放宽) | vitest-default-timeout-pseudo-red |
| H6 | 世界指纹不一致却采信内部观测 | hook 型探针改写 RNG 世界 | 逐样本 hook 探针必须附「bare 同 env 对照行」 | 坑表钉死(worldgen 面) | content-parity §14764 |

## I. 模型/协议面杂项

| # | 现象 | 根因 | 解法 | 归入 API 默认行为 | 判例 |
|---|------|------|------|--------------------|------|
| I1 | fromVanilla 期望偏 25.5px | (x,y) 当盒左上,实为盒中心(e.x=x−w/2) | 期望按盒中心算 | 坑表钉死 | spikeball 探针锚点三踩 |
| I2 | 出生帧把链画向世界原点 | 刷怪相位在 entities.update 之后,ai 字段类默认 (0,0) | `aiInit` 门防出生帧 | 坑表钉死 | spikeball ① |
| I3 | 内部 id 当原版 vid 反查失败 | `__swItems` 键=`vi_<vid>_` 前缀 | vid→内部 id 走 `__swFlow.itemByVid` | `world.itemByVid` | _iii231 iidFor;chain-playthrough |
| I4 | NPC/物品域键名卫生回归裸键 | 历史键('torch')已被 vi_ 前缀体系替代 | vid 兜底解析 | `world.itemByVid` | mainFlow itemByVid 注 |
| I5 | 多人域断言在单人世界空转 | 联机语义三域分工 | 断言前定域(单人直驱/世界位置事件) | 坑表钉死 | luck-consumers-coverage |

## J. 清理与收尾

| # | 现象 | 根因 | 解法 | 归入 API 默认行为 | 判例 |
|---|------|------|------|--------------------|------|
| J1 | headless Chrome 孤儿 | SIGKILL 跳过 close | try/finally close + SIGTERM 收口 + orphan-reaper | CLI SIGTERM→`closeAllBrowsers`;`browser.activeBrowsers` | diag-script-orphan-prevention |
| J2 | 杀树后端口仍被监听 | 只 TERM 不验收 | 杀完 lsof 计数=0 验收,残留 KILL | `vite.killTree` 返回 `listenersLeft`,CLI 打警告 | IIIRS216 |
| J3 | 删脚本后进程还活着 | 孤儿不因文件删除而死 | 删前 `pgrep -fl <名>` 确认 | 坑表钉死 | diag-script-orphan-prevention |
| J4 | 收尾误伤他人实例 | 端口没核对就 kill | 只杀自己起过的端口;禁止 kill 5199/他人 52xx | CLI 只 kill 自起实例(`vite.child` 引用) | CLAUDE.md |
| J5 | 刃跑全量 vitest 后池 worker+父进程常驻(处决过 18.5h 双 worker);场景里 shell 出去的 vitest/其他池同病 | vitest 父/worker 与发起方无信号联动,TERM 对忙循环无效;收尾 vite 三段式只管【端口面】(lsof),看不见不监听端口的孙代;★进程一死其孙代被内核【即刻】收养到 pid 1——树杀只在中间进程还活着时有效(diag2 实证) | 三层收尾:①场景子进程 `process.exit` 补丁层自树清扫(场景契约是 exit 直退,只能包住 exit 才赶在断链前收)②CLI shutdown 全后代树杀兜底 ③总看门狗先 TERM(2.5s 宽限让子进程自扫)再补 KILL。树杀=ps ppid 递归收集 TERM→宽限→KILL 两段,僵尸不计,只杀自身后代=他人实例结构性免疫 | `proc.killDescendants` + CLI `--_child` exit 补层(IIIII245,`proc.mjs`;`--keep-vite` 时豁免 vite 整树防背刺);★脱链残余(孙代已收养)只有 J6 组杀能救 | diag-script-orphan-prevention 同族;IIIII245 实证 |
| J6 | `python3 - <<EOF` 内联脚本异常/长跑不随刃退出(97% CPU×5h 实证) | 内联脚本与发起 shell 无生命周期联动,刃退出只断 stdin 不发信号;裸挂着的解释器TERM 不到 | 场景脚本里一切 shell 子命令走 `runWithTimeout(cmd, ms)`(detached 独立进程组,硬超时 TERM→KILL 全组=heredoc 再生孙代一并带走;resolve 前等本尊收割防假残留;`timedOut` 供断言)或命令自带超时;禁止裸长跑 | `proc.runWithTimeout`(IIIII245;组杀不依赖发起方存活,脱链也收口) | diag-script-orphan-prevention 同族;IIIII245 实证 |

---

## 框架 API 面(速查)

**CLI(`game/tools/probe.mjs`)**
- `run <script.mjs>`:`--seed`(含别名 zenith/drunk/anniversary/bees)/`--flags`/`--size`(small|medium|large|0|1|2)/`--vite=auto|PORT|off`/`--headed`/`--out`/`--timeout`/`--keep-vite`/`-- <透传>`。
  产出 env:`SW_ORIGIN/SW_PROBE_OUT/SW_SEED/SW_FLAGS/SW_SIZE/SW_HEADED`。退出码 0 绿/1 环境/2 超时/64 用法。场景退出行附带总耗时(③)。
  收尾三层(IIIII245 J5):①场景子进程 `process.exit` 补丁层【自树清扫】(exit 直退前收掉自己 spawn 的孙代,零后代=零开销)②CLI shutdown 全后代树杀 `killDescendants` 兜底 ③总看门狗先 TERM(2.5s 宽限)再 KILL。`--keep-vite` 此前仅文档有、IIIII245 起真实生效=保留 vite 且整树豁免清扫。
- `doctor [--browser]`:Chrome 路径/puppeteer-core/端口面(5199 共享只读+私有空闲复检)/vite 可达/`sprites/vanilla.json`+`l10n`/真页面(bootstrap/桥/画布/IDB)。
- `fields [过滤子串]`(①):常用字段真名速查直读(同下方「常用字段真名」节,真值源锚定 src)。

**lib(`game/tools/probe/lib/`)**
- `env`:SIZE_PRESETS/sizeDims/sizeCode/SEED_PRESETS/resolveSeed/parseArgs/portBusy/httpUp/httpGet/pickFreePort/resolveChromePath/outDirDefault。
- `vite`:startPrivateVite(SW_PORT+SW_NO_HMR=1+SW_CACHE 独立+日志 /tmp/sw-probe-<port>.log)/killTree(三段式+listenersLeft)/lsofListeners。
- `proc`(IIIII245,J 域收尾):`descendantsOf(root, table?)`(ps ppid 树递归收集后代,注入假表=纯函数可测)/`killDescendants({root,exclude,termMs})`(全后代树杀两段式,僵尸不计,只杀自身后代=并行会话免疫)/`runWithTimeout(cmd, ms)`(J6:shell 子命令硬超时,detached 进程组 TERM→KILL 全组,resolve `{ok,timedOut,code,stdout,stderr,ms,pid}`;heredoc/池 worker 类再生孙代由组杀兜住)/`psTable`/`zombiePids`。
- `browser`:launchBrowser(节流三件套 args+protocolTimeout 600s+viewport 1280×800)/openPage(pageerror+console error 环)/front/closeAllBrowsers。
- `boot`:gotoApp(?t= 击穿+重试)/waitForBridge/cleanStorage(IDB `sandboxworld`+localStorage+sessionStorage,ack 预置)/ackWelcome/bootstrap(导航→清→reload→桥→ack)/dismissWelcome(IIIII240 ③欢迎弹窗关法库化:DOM 按钮 click → 摘根+补写 ack → 本就没弹=absent;弹窗挂 onWorldReady=进世界后才出现,createGame settle 后默认代调)。
- `game`:createGame(url `?play=`|direct `newWorld`|ui `createWorldProbe` 三模式,fire-not-await+waitForGame+settle;`keepDialogs` 缺省 false=进世界首轮自动关欢迎弹窗,返回值带 welcome 关法记账)/waitForGame/installPinnedRandom(mulberry32 钉 Math.random)/teleport/godMode/callGame(TS private 方法运行时直调,坑表 G11+IIIII238 ②)。
- `pump`:pump(分段 30t+clearEnemies+resetDarkness)/pumpUntil(谓词步进,step 缺省 17=与常见环周期互质)/pumpInline/nextFrame(IIII242 G8:等一帧真实渲染,页内双 rAF 帧边界;确定性断言走 pump、渲染链路/UI 过渡/动画推进断言走 nextFrame,**与 perf 互斥**——perf.mjs 计量窗内确定性泵与等帧工具皆禁)。
- `camera`:camSnapTo/camSnapToTile(世界像素↔tile 换算收口)/viewRectTiles/worldToScreen/gameCanvasInfo(renderer.canvas 优先)。
- `shot`:litStats(非零像素哨兵+`fp` 内容指纹,世界像素或 DOM overlay)/savePageShot/saveCanvasShot/saveJson/resolveShotPath(裸名→`<SW_PROBE_OUT|/tmp/probe-out>/shots/<名>.png`)/camCenter;
  **screenshot(IIIII240 ①)**:`screenshot(名,{time:'day'|'night'|'dusk'|'dawn'|0..1})` 钉钟(freezeClock,freeze:false 退 clockSet)→泵 convergeTicks(缺省 8)等光照收敛→ensureContent 哨兵→落盘(layer 'canvas'|'page'|'both')→restore 缺省 true=unfreeze 回滚钟面(夹具"像没发生过";只解自己冻的);夜间哨兵不过按 `onDark` 分派:'torch'(缺省)=就近注入持久火把保时段保真(落点记 mutated)/'day'/'auto'=换昼拍(返回值 strategy/finalTod 如实标注)/'off'=只测不救;返回 {ok,path,tod,shotTod,shotIsDay,frozen,lit,applied,mutated,dark,restored};
  **ensureContent(IIIII240 ②)**:截图前内容断言(非零像素+nonBlack 比例+fp 指纹 distinct),不过按 strategies 链换招重试('pump'/'snapcam'/'torch'/'relight'/'day',缺省前三)。
- `record`:installSfxSpy(导航前)/drainSfxSpy/audioTail/audioRecordStart/audioRecordStopExport(__swAudioRec 双通道)/installDustCounter/dustSummary(spawn 包装)/uiTextSnapshot。
- `world`:placeLiquidThenTile(液先置 tile 后置纪律)/clearArea(全位归零)/buildShelter(石盒+火把+居中)/findTileBySheet/importFresh(?t= 击穿)/itemByVid/holdItem/aimAt/mouseHold/fnvStore(IIII242 G9:FNV store 指纹,_worldgen-hash 唯一实现入库金标化——store 全通道 10 域 FNV-1a,世界终态指纹;同 origin 两跑=确定性验证,跨 origin=混淆位级等价;入参通吃 page|game|world|store,指纹值与既有 _worldgen-hash 快照逐位可比;★取样纪律:活世界 type/liquid/liquidType/frameX/frameY 被潮汐/液反应/落沙持续改写(IIIII242 实机实证:跨拍必漂)——全域确定性对拍须 gen 静态快照(生成完即取)或静稳门(活通道连续两次间隔采样一致)后取;wall/half/slope/paint/coat 五静通道天然跨拍稳定)。
- `entities`(IIII242 G4):实体/物品/反查包装组(纯包装,桥/表全在 src,零第二表)——tileIdBySheet(vanilla sheet→内部 tile id 查表版,与 world.findTileBySheet 扫描版并存)/spawnEnemy(vid/盒中心锚/aiInit 出生帧前补 ai 字段,走 __swFlow.spawnVanillaEnemy)/spawnTownNPC(TOWN_NPC_IDS 键先验防 ctor 静默兜底+tile 锚列心+脚底地面行顶+home 站格缺省)/clearEnemies(桶名单先验后清,缺省 enemies/drops/projectiles,臆造桶名不半清)/giveItems([{vid,stack,slot}] vid→slot 批量,自动位扫 0-49 背包,弹药 54-57/钱币 50-53 显式,wipe 净夹具);vid→内部物品 id 反查=world.itemByVid(236 已收编,不重复)。
- `stats`:runReplicates(默认 6×)/cleanUpToIdle/allRuns/compareAB。
- `watchdog`:withTimeout/stepWatchdog(步级预算,先于总看门狗触发留现场)。
- `ledger`:Ledger(chk/say/print/dump/exitCode 0|2/`step(name,fn)` 分步计时——case 起止 `▶/◀` 行+耗时+t+ 全程(③,IIIII238))。
- `clock`(IIIII238 ④):freezeClock(冻结时钟+可选钉 tod)/unfreezeClock(解冻+钟面回滚冻结前值)/clockSet(单钉钟面)/clockInfo(tod/isDay/vanillaMainTime/moonPhase/frozen 全貌)——推进点 Game.ts:7643 实例 tick 动态分派,换 no-op 即全链冻结,零 src 触碰;时辰类断言一律用它。
- `cheatsheet`(IIIII238 ①):CHEATSHEET 分组速查数据+cheatsheetText;每条 {file,token} 锚定 src 真定义,守卫测试逐条核对防臆造/防漂移。
- `staging`(IIIII240):受控布景+光照保证域——`stage({at,platform,light,tiles,npc,player,camera})` 一键布景(自动寻地面/清整带/火把行+手持火把/目标物/玩家传送布景中心/相机直写对框;返回 cx/cy/tx0..ty1/torches/placed/npc)、`injectTorch`(持久火把注入,夜间补光手段)、`relight`(引擎动态点光阵,瞬态=只保同光照周期)、`TOD/resolveTod`(昼夜预设 dawn/day/dusk/night 与 0..1 解析;dawn/dusk 与 src Clock 常量守卫同步);布景后直接读光照读数须自泵 ≥4t(4 态光照周期),走 screenshot 则自动收敛。
- `presets`:worldgenScenario/gameplayScenario/uiScenario(UI 测试要看弹窗:keepDialogs:true,配 bootstrap {welcomeAck:false})/audioScenario。
- `perf`(IIIII239;IIIII246 增 GPU 定谳):性能评估域——`armPerfInstrumentation`(**导航前**装;页内 rAF/longtask/heap 探针)/`installFrameProbe`(游戏就绪后包 g.frame/g.fixedUpdate:渲染帧 fps+逻辑 self ms)/`createPerfRecorder`(CDP 双通道分段:startSegment/endSegment 落 .cpuprofile+.trace+metrics;段记录含 `gpu`/`traceSpanCoveragePct`)/`probeGpuEnablement`(page,{browser}:SystemInfo+renderer 串+fill 基准→GPU 启用定谳;★SystemInfo 只在 browser target)/`perfProbeReady`/`sleep`(真实时间窗)。
- `perf-scenarios`(IIIII239):`BIOME_STOPS`(14 群落锚定表,sig 键守卫测试钉死)/`discoverBiomeStops`(全图扫描锚站位,只读)/`runBiomeTour`(近邻序 route+页内驱动器,段名 dwell:/transit:)/`STRESS_FACTORS`(rain/sand/blood/proj/liquid/dust)/`runStress`(逐因子+combo)/`setWeather`(天气/时辰注入)/`buildLiquidRig`(水岩台,液先置 tile 后置变体)。
- `perf-analyze`(IIIII239;IIIII246 增 GPU 解析,纯 Node):`summarizeProfile`(cpuprofile self-time Top-N+调用路径+框架开销单列)/`parseTrace`(长任务/GC/渲染分段,主线程过滤;**`gpu` GPU 进程账**:GPUTask 时长/ busy%/Commit 跨进程+commitDomain/GPU breakdown)/`classifyGpuRenderer`(SwiftShader/Apple 指纹→verdict)/`fpsStats`(1% low 口径)/`aggregateSegments`(场景聚合+分段关联+GPU 账加权)/`buildSelfCheck`(fw<2%+top10 src 命中+渲染活性+gpu-evidence+trace-span≥50%)/`compareWithBaseline`(回归检测)/`renderReportMd`(md 报告,含 GPU 定谳行/分段 GPU 列)。


★trace 分析必须用可读构建:`npm run start:analyze`(4173 供 dist-analyze,--minify false+--sourcemap+6144 堆;IIIRS249 后含 shinebudget 等全部旗)——压缩产物的 trace 热点名是 Dt/RN 类乱名,归因链路不可用;dist-analyze 与发布 dist/dist-release 隔离,严禁部署 analyze 产物;未压缩绝对数值与压缩版略偏(热点排序有效)。
## K. 性能评估(perf,IIIII239;IIIII246 增有头+GPU 面)

> 入口:`node tools/probe/perf.mjs run --scenario=<biome-tour|stress|all>`(平行 CLI,
> 不改 probe.mjs 参数面)。通道:.cpuprofile(Profiler CDP,函数级 self-time=找卡点
> **主通道**)+ .trace(tracing CDP:长任务/渲染分段/GC/**GPU 进程账 GPUTask/Commit**,
> `parseTrace.gpu` 解析)+ 页内探针(渲染帧 fps/1% low/帧分布,常开)+
> Performance.getMetrics(JSHeap/Frames 快照)。启动时自动做 **GPU 启用定谳**
> (`probeGpuEnablement`:CDP SystemInfo+页内 renderer 串+片元 fill 基准 →
> `meta.gpuCheck.verdict`,报告头有定谳行)。

**用法**

```sh
cd game
# 全场景(推荐首跑):巡游 14 群落 + 六因子压力
node tools/probe/perf.mjs run --scenario=all --seed=drunk --vite=auto --out=/tmp/probe-out/perf
# 只巡游/只压力;窗口/速度/注入量可调
node tools/probe/perf.mjs run --scenario=biome-tour --dwell=6000 --speed=40
node tools/probe/perf.mjs run --scenario=stress --stress=rain,proj,dust --stress-dwell=8000
# 有头 + GPU 证据加厚(GPU 账在基础类目即有;--trace-gpu 是加厚,须配 --no-trace-stacks)
node tools/probe/perf.mjs run --scenario=all --headed --trace-gpu --no-trace-stacks
# 显式钉软渲染(两象限对拍;macOS headless=new 缺省已是真 GPU,见 K14)
node tools/probe/perf.mjs run --scenario=all --use-angle=swiftshader
# 基线对比(回归检测;有回归且开了 --fail-on-regression → exit 2)
node tools/probe/perf.mjs run --scenario=biome-tour --baseline=/tmp/probe-out/perf/report.json
```

产物:`<out>/report.md`(人读)+ `report.json`(机读,= 基线文件)+ `<out>/run/` 下
每段 `<段名>.cpuprofile` / `<段名>.trace`(DevTools Performance 面板可直接开)。

**判读流程**(先环境后引擎,别急着定罪游戏代码)

1. `meta.loadavg` 与 `meta.gpuCheck.verdict`:并行会话负载会把 fps 整体压低(负载期
   跑出的绝对值不可当基线);verdict=`gpu-metal` 是硬件路径,`software`(SwiftShader)
   数值只能自比——**别再拿「headless=软渲染」当先验,定谳看 renderer 串+fill 基准**
   (macOS headless=new 缺省即真 GPU,K14)。
2. `fps.rafMean` vs `fps.mean`:rAF 节拍≈渲染帧率=健康;rAF 高而渲染帧低=frameCap
   跳帧或渲染侧瓶颈;两者都低=主线程饱和(看 Top 卡点)。
3. Top 卡点函数表(.cpuprofile self-time):先看 `/src/` 命中(游戏热路径),再看
   「⚠框架」行——**框架自身开销(swperf 前缀注入函数)必须 <2%**(buildSelfCheck
   自动闸,超标=注入太重/机器抖,数据不可信)。
4. GC 行:`gc.totalMs/maxMs` 是**渲染主线程**账(V8 并发后台标记线程已滤除,
   `gc.allTotalMs` 是含后台的参考面);长任务清单(>50ms)配 .trace 的 breakdown
   (RunTask/Paint/Layout 分段)归因。
5. **GPU 账(IIIII246 起入报告)**:CPU profiler 永远看不到 GPU 面(「GPU 页绝不挂」)
   ——但 .trace 的 GPU 进程事件已由 `parseTrace.gpu` 解析:分段表 GPU 列=GPUTask
   时长(busy%=占墙钟比),commit 列=合成提交时长(实测落 renderer 主线程,
   cc::Scheduler 域);「fps 低+Top 全轻函数+GPU busy 高」=GPU 撑满的真指纹。
   GPU 账为 null/段自检 `gpu-evidence` FAIL=trace 缓冲被灌(看 K15)。
6. `traceSpanCoveragePct`(段级):trace 环形覆盖 <50% 由自检 `trace-span>=50%` 旗标
   ——该段所有 trace 域账(长任务/GC/GPU)都是尾部采样面,绝对值只代表窗内。

**坑表**

| # | 现象 | 根因 | 解法 | 归入 API 默认行为 | 判例 |
|---|------|------|------|--------------------|------|
| K1 | perf 数据整体失真/帧率虚高(或"半路卡死") | 混用了确定性 pump(fixedUpdate 直泵绕开 rAF 节拍)——pump 是确定性工具与 perf 互斥 | perf 窗内只允许真实 rAF;要确定性请另开探针 | `perf.mjs` CLI 全程不泵;窗内禁 pump/pumpUntil/pumpInline(文件头钉死) | spikeball…探针坑(二) |
| K2 | 页内探针全空(__swPerf 不存在) | armPerfInstrumentation 装在导航之后(evaluateOnNewDocument 只对后续导航生效) | 装探针必须先于 bootstrap/goto | `perf` 库文件头用法序钉死 | diag-script-orphan-prevention |
| K3 | .trace 解析出 0 事件 | puppeteer `tracing.stop()` 回 **Uint8Array** 非 Buffer(JSON.parse 分支漏判) | 解析侧收 ArrayBuffer.isView;记录器侧归一 Buffer | `parseTrace` 四分支+`createPerfRecorder` 归一 | IIII239 smoke 实测 |
| K4 | "GC 停顿"虚高数十 ms | V8 并发后台标记线程(MC_BACKGROUND_MARKING)被算进主线程账 | trace 先认 CrRendererMain 的 pid/tid,GC/长任务/分段只统计主线程 | `parseTrace` 主线程过滤(找不到线程元数据回退全量) | playsoft-trace-hotspots-lightfast |
| K5 | 卡点表全是框架函数(或空) | 注入函数没带 swPerf 前缀→无法单列;或采样窗太短(样本<几百) | 注入函数命名纪律 swPerf*;段长 ≥3s;buildSelfCheck 的 fw<2%+top10 src 命中双闸 | `armPerfInstrumentation`/场景驱动器全部 swPerf 前缀;`buildSelfCheck` | IIII239 自检闸 |
| K6 | 首段 fps 崩(单帧 850ms 级) | 首站区块烘焙/GL 编译/minimap 首扫=一次性成本 | 场景前 warmup(不进计量段);首段 fps.max 仍会看到,属真实数据 | CLI `--warmup`(缺省 3000ms)+meta.notes 声明 | IIII239 smoke 实测 |
| K7 | 基线对比全是假回归 | 两次跑环境不同(负载/GPU 路径/视口/注入量)或段名不稳定 | 同机同参对拍;先看 meta(loadavg/gpu/params)再下结论;段名=场景键(dwell:<key>/stress:<factor>)恒定 | `compareWithBaseline` 按段名+阈值(fps 均值 10%/1%low 20%/热点 2pp) | vitest-default-timeout-pseudo-red |
| K8 | 巡游漏了某群落(ocean/hallow) | 签名键被别的群落共用(单值映射饿死后者);圣域世界前无 hallow=正常缺 | id→stop 下标【列表】;minCount 闸+skip 清单进报告 | `discoverBiomeStops` 列表映射;`runBiomeTour` 返回 skipped | IIII239 smoke 实测 |
| K9 | 沙暴段没有视觉/读数不动 | 原版沙暴有 HasSufficientWind 门(\|wind\|≥0.6),风停沙暴即停 | 注入时钉 windSpeedCurrent=0.8+severity/timeLeft | `setWeather({sandstorm:true})` | Sandstorm.cs:22 对账注 |
| K10 | 尘喷洒量上不去 | 原版 NewDust 密度门(池负载>50% 概率拒)——不是注入坏了 | 读 `g.vanillaDust.activeCount` 真负载判读 | `installStressDriver` 走原版语义(自节流=真实负载) | dust-pool-gate-cursor-drift |
| K11 | .trace 整段 0 事件(或成批段缺 trace 文件) | ①CDP Profiler 与 Tracing 同会话 → trace 事件整段被吞;②复用会话逐段 start/end → Tracing.end 残留僵尸态,下一段报 already started | 会话生命周期=通道生命周期:trace/profiler 每段新建 CDP 会话,用完即 detach | `createPerfRecorder` 文件头铁律;`_iii239-trace-probe.mjs` 隔离实验 | IIII239 smoke2/smoke3 实测 |
| K12 | trace 只录到段窗开头一截(段 wall>>trace span),无溢出标记 | Chrome 默认 record-until-full:GPU 进程事件量 ~60% 灌满共享缓冲即断流;且 puppeteer page.tracing 的 traceConfig 不透出 recordMode | 手写 CDP Tracing.start 用 record-continuously(环形);'gpu' 类目默认关(--trace-gpu 要时再开) | `perf.traceStart` 直发 traceConfig;`TRACE_CATEGORY_GPU` | IIII239 smoke 实测 |
| K13 | 有头(headed)跑分前怕窗口焦点/遮挡把 rAF 节流掉 | Chromium 遮挡检测会把被盖/后台窗降级——launchBrowser 三件套(--disable-background-timer-throttling/-renderer-backgrounding/-backgrounding-occluded-windows)已禁遮挡节流;每段前后 `front(page)`(bringToFront)照旧 | 有头跑分三纪律:①别最小化窗口(最小化未实测,风险自负)②跑分期间别在这台机器上压别的重活(loadavg 哨)③窗口弹出后别手动点别的 app 抢 GPU/IO——实测有头与 headless=new 的 fps 同量级(IIIII246 定谳),三件套+front() 够用 | `launchBrowser` 三件套+`front()`;CLI `--headed` | IIII246 有头全场景实测(fps 与 239 headless 同量级) |
| K14 | 「headless=软渲染」的先验误判(239 基线被当软渲染象限) | macOS Chrome ≥112 的 headless=new 缺省就是真 GPU(ANGLE Metal)——239 只带了 --use-angle=metal,renderer 串也写着 Apple Metal,当时没做定谳步 | 定谳三证据:`probeGpuEnablement`(① SystemInfo.getInfo 的 gpu.devices——★只在 browser target 可用,页 session 报 only supported on the browser target;② WEBGL_debug_renderer_info 串:Apple Metal=硬件,SwtiftShader Device=软;③ 片元 fill 基准:Apple GPU 实测 0.5~0.8ms/帧,SwiftShader ~28ms/帧,>10ms 判软)→ `meta.gpuCheck.verdict` 入报告;显式软渲染唯一正门=`--use-angle=swiftshader`,`--no-gpu-args` 是回 Chrome 缺省(≠软渲染) | CLI 缺省跑定谳(--gpu-probe=0 跳);`--use-angle=<backend>`;meta.gpuCheck | IIII246 五模式矩阵(/tmp/iii246-out/gpu-verdict.json:headless/headed×缺省/metal 全 gpu-metal,swiftshader 才 software) |
| K15 | GPU 账缺失/只有段尾(--trace-gpu 段覆盖掉到 10%) | GPU 事件(GPUTask/Commit)本就随基础类目落 trace(239「GPU 贡献不可见」的真相=解析缺位,不是类目缺位);--trace-gpu 加厚证据面后事件量 ×3,游戏速率下环形缓冲只剩段尾(栈类目叠加时更糟,实测 321ms/3.3s) | ① GPU 采集配 `--no-trace-stacks`(栈只在 trace 面,cpuprofile 调用路径不受影响);② 覆盖率=`traceSpanCoveragePct`,<50% 自检 `trace-span>=50%` 旗标(尾部采样面,绝对值只代表窗内);③ 病灶段(transit:desert~dungeon 的 TileShine 同步烘焙)即便 --no-trace-stacks 仍可塌到 2.5%——该段本就是分钟级单帧制造机,旗标保留,别删 | `parseTrace.gpu`(GPUTask/Commit 跨进程,commitDomain 记账域);段记录 `gpu`/`traceSpanCoveragePct` | IIII246 smoke/smoke2/main 实测(busy 10~30%,commit 落 renderer-main) |

**基线流程**

1. 安静时机(无量会话/无 vitest 并发)跑一次 `--scenario=all`,把
   `<out>/report.json` 存为基线(命名带日期+机器+GPU,如
   `perf-baseline-20260910-m5pro.json`)。
2. 改动渲染/实体/AI 热路径后,同参数重跑 `--baseline=<基线>`:报告自动附
   「基线对比」节(段级 fps/1%low 降幅、热点 selfPct 增长、新热点);CI 意图加
   `--fail-on-regression`。
3. 引擎侧有意变更(如新渲染特性)造成的热点迁移不是回归——重产基线(金标陈旧
   同款纪律:先 oracle 重产再对拍)。

**只读纪律**:biome-tour 对世界数据只读(tile/liquid/entities 零写;玩家位置与
`debugGod` 不是世界数据);stress 的合成注入(液体台/弹幕/尘)是场景语义且用后
即拆——**勿把 stress 跑过的世界会话再用于 parity 断言**(两类车道分离)。

## 常用字段真名(速查)(IIIII238 ①)

> 背景:IIIII237 无上下文代理首写探针猜错三处(ItemDrop.stack 误猜 count / 全局
> tiles 表真名 `__swTiles`≡TILE_BY_KEY / 灰烬键真名 `'ash'` 非 `'v_57_ash'`)。
> 本节是高频字段真名的速查;**真值源=src 真定义**——机器可读版在
> `tools/probe/lib/cheatsheet.mjs`(CLI:`node tools/probe.mjs fields [过滤]`),
> 每条 {file,token} 由 tests/probe-framework.test.ts「速查表源同步守卫」逐条核对:
> src 改名 → 测试爆红 → 速查表跟着改,禁止脱离 src 臆造。

**window.__sw\* 全局哨兵**(挂载点 main.ts enterGameHooks / mainFlow.ts)
- `__swGame` — Game 活单例(引擎正消费的那份;禁用 `?t=` 击穿另造实例,坑 A4)。
- `__swFlow` — 探针桥:newWorld/quickLoad/loadJson/createWorldProbe/itemByVid/itemByKey/spawnVanillaEnemy/spawnHostileProj/joinRoom/createRoom/doSave/…
- `__swTiles` — ≡ `TILE_BY_KEY`(src/data/tiles.ts 注册):**tile 定义键 → 内部 id**。
- `__swItems` — ≡ `ITEM_BY_KEY`:物品定义键 → 内部 id。
- `__swITEM_DEFS` / `__swVANILLA_ITEM_KEY_BY_ID` / `__swGore` / `__swGenUi` / `__swAudio` — 物品定义表 / vid→键 / gore 池只读视图 / 生成中态 / 音频桥。

**TileStore**(`st = g.world.store`,src/world/TileStore.ts,SoA 平面数组)
- 尺寸/索引:`w`/`h`/`idx(x,y)`;通道:`type`/`flags`(**bit0=原版 active()**,判"有方块"用 `hasTile`,裸读 type≠0=幽灵格漏洞,G7)/`frameX`/`frameY`/`wall`/`liquid`(0-255)/`liquidType`(**+1 编码** WATER=1/LAVA=2/HONEY=3/SHIMMER=4)/`half`/`slope`/`wire`/`paint`/`coat`。
- 写:`setTile(x,y,type,frameX=0,frameY=0)`(唯一非静默入口,触发级联);读:`get(x,y)`/`hasTile(x,y)`/`inBounds(x,y)`。

**实体**
- `Entity`:`x`/`y`=**左上角 px**、`cx`/`cy`=中心 getter、`vx`/`vy`、`dead`、`w`/`h` 缺省 16。
- `ItemDrop`:`itemId`(内部 id,vid 反查走 `__swFlow.itemByVid`,I3)、**`stack`(堆叠数,不是 count)**、`pickup`('heart'|'star'|'manastar' 碰触即消)。
- `g.entities` 桶:`enemies/drops/npcs/projectiles/props/critters`(数组,`length=0` 清桶)。

**玩家**(`player`,`src/entities/Player.ts:579`)
- `x`/`y`/`cx`/`cy`、`vx`/`vy`、`hp`、`debugGod`(上帝模式)、`useTime`(使用节拍)。
- `player.inv`:`slots[0-49]` 背包(0-9 快捷栏)/`50-53` 钱币/`54-57` 弹药,格形 `{id, stack}`;`armor[20]`/`dye[10]`/`miscEquips[5]`;`selected`=快捷栏下标。

**时钟与世界标量**(`src/world/World.ts:46` Clock;推进点 Game.ts:7643)
- `world.clock.timeOfDay`:0..1 线性 24h(0=午夜,0.5=正午;DAWN=4.5/24,DUSK=19.5/24)——时辰门断言唯一钟面口径;`clock.isDay`/`dayCount`/`moonPhase`(0-7)/`bloodMoon`。
- `Clock.vanillaMainTime(tod)`:→ 分段 Main.time ticks(昼 0..54000/夜 0..32400);**时辰门阈值(如药草 40500)必须用它换算,勿 tod×86400 直比**(IIIII237 病灶)。
- `world.groundLevel`/`rockLevel`(tile 坐标)、`world.w`/`world.h`、`world.dayRate()`(时间倍率;freezeClock 冻结不依赖它)。

**Game 高频方法**(`src/core/Game.ts`;TS private 运行时可直调,G11)
- `fixedUpdate(dt)`(泵;签名 (dt,game) 少参必炸 D8)/`interactAt(tx,ty)`(右键全格交互门)/`breakTile(x,y,byPlayer=false,noItem=false,pickHit=false)`(破坏原语)/`isAlchemyPlantHarvestable(style,y)`(药草时辰门,style=frameX/18)。
- `camera.x/y`(世界像素)、`camera.worldToScreen(wx,wy)→[sx,sy]`、`input.mouseX/mouseY/mouseDown(边沿消费)/mouseHeld/rightDown`。

**键名惯例**
- tile:src/data/tiles.ts 的 def key 直用——原版映射族 `v_<vanillaSheet>_<snake_name>`(如 `v_83_herbs_mature`),常见土石块用**素名**(`dirt/stone/ash/torch`;**灰烬='ash' 不是 'v_57_ash'**);不确定用框架 `world.findTileBySheet(page, vanillaSheet)` 反查。
- item:`vi_<vid>_<VanillaName>`;legacy 素键已退役——vid 一律走 `__swFlow.itemByVid(vid)`(I3/I4)。

## 迁移验收(IIIII236)

三支既有探针迁到框架,断言集与判定语义逐条保持(原文备份 `/tmp/iii236-out/originals/`):

| 探针 | 迁移后用到的框架面 | 行为等价点 |
|------|--------------------|-----------|
| `scripts/_iii231-ach-alignment.mjs` | bootstrap/cleanStorage/createGame(url)/pump/ledger | 7 通道成就断言+OOO_SHINY 负对照门控 |
| `scripts/_iii232-credits-roll.mjs` | bootstrap/createGame(url)/pump/litStats(selector)/audioTail | 月总击杀链+creditsRoll 触发/时长/选曲 89/overlay 非空像素 |
| `scripts/_iii219-zenith.mjs` | bootstrap/createGame(direct getfixedboi)/buildShelter/pump(resetDarkness)/holdItem/ledger | P1 武装位/P2 起始镇民/H1 饥饿链 12 段/P3 毁灭清算 |

迁移纪律:①不动 src 生产面;②场景仍兼容 run-diag(读 SW_ORIGIN);③并行刃(IIIRS232/233/235)探针只读不改。

## 采用策略(IIIRS241 快赢收编后,IIIII242)

- **新探针必须走框架**:新写探针一律 CLI(`node tools/probe.mjs run`)+lib import 起步;坑表 A-J 的默认行为(vite 生命周期/等桥/泵/截图/台账/清场)全部已在 lib 里,再手写=重复造且无守卫。
- **存量 1344 支按需渐进迁移(不强制)**:一次性脚本(≤50 行,374 支)不迁;只对**常青探针**(金标/回归/全链——判据=会不会被第二次运行)按需渐进迁移;自起 vite 17 支为 CLI 化前遗产,会被自然淘汰,不迁。快赢三件 G8(nextFrame)/G9(fnvStore)/G4(entities 组)收编后,手写重复最高的实体/反查/等帧面已有标准件。
- **迁移样例对照**(_paladin-ai-probe 手写形态 → G4 包装;实体句柄长持场景见末注):

  手写(迁移前;_paladin-ai-probe.mjs 同款形态):

  ```js
  // 页内大 evaluate 里:动态 import + 手写生成/移除/清场三件套
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const spawnPaladin = (px) => {
    const e = Enemy.fromVanilla(290, px, groundYpx - 62);   // (x,y)=盒中心锚(坑表 I1)
    g.entities.add(e, 'enemies');
    return e;                                               // 活体句柄,跨段采样
  };
  const removeEnemy = (e) => { const arr = g.entities.enemies; const i = arr.indexOf(e); if (i >= 0) arr.splice(i, 1); };
  const clearHammer = () => { g.entities.projectiles = g.entities.projectiles.filter((pr) => pr.projId !== 300); };
  ```

  框架(迁移后):

  ```js
  import { spawnEnemy, clearEnemies } from '../tools/probe/lib/index.mjs';
  const pal = await spawnEnemy(page, 290, px, groundYpx - 62);              // 桥 spawnVanillaEnemy(同走 Enemy.fromVanilla);返回 {ok,id,x,y,hp,refFound}
  await spawnEnemy(page, 290, px, groundYpx - 62, (e) => { e.ai1 = 1; });   // aiInit:出生帧前补 ai 字段(坑表 I2 链族必带)
  await clearEnemies(page, { kinds: ['enemies', 'projectiles'] });          // 桶名单先验后清;返回 {ok, cleared:{桶:个数}}
  ```

  行为等价点:①生成同走 Enemy.fromVanilla(桥内 entities.add('enemies'));②(x,y) 中心锚语义不变(坑表 I1);③清场从逐案 filter/splice 收敛为「桶名单+计数回吐」,cleared 计数可兼作"场上有怪"预断言。**末注**:跨段长持活体句柄的探针(单次 evaluate 内采样 e)保留手写亦合法——包装返回的是可序列化投影,活实体经 `g.entities.enemies.find((en) => en.id === pal.id)` 找回即可。

## 备案(未收进框架的坑)

- 世界生成对拍面(rig/掷流/金标)有独立方法论族,不在本框架域:`qqqqqqqq-worldgen-batch` 等 memory 条目;本框架 worldgen 预设只覆盖"建世界→普查/截图"段。
- `desert-style4` 的背景层二分/drawImage 拦截需要按案定制(钩点因渲染路径而异),保持手写。
- 液体域 FNV/k7/R30 仪器(uuu 批)是对拍取证域,非运行时探针。
