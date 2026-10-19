# 双开 GPU 崩溃事故完整报告:根因、原理与根治(2026-08-18)

> 事故:双开浏览器窗口测试联机时,后加入的窗口进入世界后 contextlost 风暴
> (单窗口正常);冷启动 Chrome 带 GPU 内存旗标依然崩溃。
> 结论先行:与显存字节无关——根因是 **GPU 进程的 IOSurface 按"张"计费耗尽**,
> 由游戏侧两个 canvas 分配引擎(chunk 烘焙每帧新建 + cloudTint 每帧每云新建)
> 在双窗叠加下打穿内核配额。旗标是安慰剂(只管合成器 tile 预算)。
> 已根治(atlas 页化 + 染色池化,活画布 446→28、分配 churn 归零),
> 并建常驻哨兵(CanvasWatch)保证下次同类问题 15 秒内带栈报警。

---

## 1. 症状与表面矛盾

| 观察 | 与直觉的冲突 |
|---|---|
| 单窗口长时间游玩稳定(~600MB GPU 占用) | 双窗合计 ~1.2GB,远小于机器 64GB 统一内存 |
| 双开后加入的窗口进世界即 contextlost 风暴(每秒上万次丢失↔恢复) | JS 堆平稳、GC 正常、帧预算正常——主线程无辜 |
| 冷启动 Chrome + `--force-gpu-mem-available-mb=16384` 后**依然爆** | 旗标若生效,16GB 预算不可能被 1.2GB 打穿 |

trace 铁证(此前会话):风暴窗口 `contextlost×17137 + contextrestored×20043`,
LazyPixelRef 仅 63(ImageBitmap 化革新完全生效,与图像解码无关)。
风暴打在**几百个无守卫画布**上,主画布单点熔断器是聋的。

---

## 2. 原理:Chrome 在 macOS 上的渲染资源模型

### 2.1 进程架构:为什么"两个窗口"是资源战争

```
┌─ 浏览器进程(拥有窗口/合成调度)────────────────────┐
│   渲染进程 A(tab1:游戏窗口 1)──┐                  │
│   渲染进程 B(tab2:游戏窗口 2)──┼─→ 共享一个 GPU 进程 │
│                                  │   (所有画布后备、   │
│                                  │    纹理、swapchain  │
│                                  │    都在这里分配)    │
└──────────────────────────────────┴──────────────────┘
```

两个 tab = 两个渲染进程(进程隔离铁律:内容零共享),但**画布后备存储全部
在同一个 GPU 进程里分配**。单窗安全余量 ×2 后超出配额 → 分配失败 → 崩溃链。

### 2.2 一个 canvas 的真实成本:IOSurface

每个加速 2D canvas 的绘制结果要跨进程(渲染进程画 → GPU 进程合成 →
窗口服务器上屏),载体是 **SharedImage**;在 macOS 上 SharedImage 的底层是
**IOSurface**——一个内核对象,本质是"跨进程共享的像素缓冲 + 至少一个
mach port(内核端口)"。

关键性质:**IOSurface 按张数消耗内核资源,不按字节**。
每张 surface 至少占一个端口(创建/销毁走内核,有系统级配额),
16×16 的小面(1KB)和 1920×1080(8MB)占用的"票据"一样多。

### 2.3 分配失败链(本次事故的完整因果)

```
游戏新建 canvas
 → 渲染进程向 GPU 进程请求 SharedImage
   → GPU 进程 IOSurfaceCreate()          ← macOS 内核
     ✗ 端口/内核资源配额耗尽 → 返回 NULL   ← 字节无关!
   → CreateSharedImage: could not create backing
 → 渲染进程命令缓冲上下文死亡
 → canvas fire contextlost
 → (恢复逻辑)重建 → 再分配 → 再失败 → 循环 = 风暴
```

### 2.4 决定性证据(探针 stderr,Chrome 151 实抓)

```
ERROR:ui/gfx/mac/io_surface.cc:273] Failed to allocate IOSurface of size 16x16
ERROR:...iosurface_image_backing_factory.mm:386] CreateSharedImage: Failed...
ERROR:...command_buffer_proxy_impl.cc:488] GPU state invalid → 上下文死
```

**16×16(1KB)都分配失败**——64GB 机器上任何字节预算模型都无法解释;
这是张数/内核票据耗尽。辅助排除:FD(lsof GPU 进程仅 36 个,系统上限
245k/进程)、系统内存(余量巨大)、解码缓存(ImageBitmap 化后无关)。

### 2.5 为什么每帧"新建-销毁 canvas"比"常驻很多 canvas"更致命

常驻 N 张 = 恒定 N 个票据;而 **churn(每帧新建+销毁)是 N + 每秒数百次的
创建/销毁风暴**,跨进程销毁是异步 IPC,滞后于创建——洪峰期瞬时持有量远超
稳态,双窗叠加直接顶穿配额。本次事故的两个引擎恰好都是 churn 型。

---

## 3. 为什么旗标无效:三层原因(每一层都实证过)

**第一层:Chrome 进程单例(启动层)**
`open -na "Google Chrome" --args …` 在 Chrome 已运行时,URL 被转发给既有
实例开新 tab,`--args` 全部丢失。旗标只对冷启动进程生效。
→ 修复:`scripts/play.mjs`(pgrep 检测 → 优雅退出 → 冷启动)。

**第二层:npm 吞参(脚本层)**
`npm run play --soft` 的 `--soft` 是 npm 自身参数语法,不传给脚本
(须 `npm run play -- --soft`)。
→ 修复:专用脚本 `npm run playsoft`,无坑。

**第三层:旗标本身是安慰剂(语义层)——最重要**
Chromium 源码定位链:二进制 strings 证实开关存在(Chrome 151)→
`render_process_host_impl.cc` 只是把它**转发**给渲染进程 → 真正定义在
`third_party/blink/common/switches.cc:104`,官方注释:

> *"Sets the total amount of memory that may be allocated for GPU
> resources **in cc**"*

`cc` = 合成器,只管 **tile 光栅资源预算**。与画布后备存储(SharedImage/
IOSurface)、WebGL 纹理、ImageBitmap **零关系**——而我们的压力恰恰全是后者。
`--disable-gpu-overlays` 已从 151 移除;`--disable-gpu`(全域软渲染)有效但
帧率减半,只适合当双开测试档。

**教训:开关存在 ≠ 开关管用。必须找到消费点、读它的注释。**

---

## 4. 定位方法论:两台探针把"感觉"变成"测量"

### 4.1 双窗复现台(`scripts/_dualgpu-probe.mjs`)

同一 Chrome 实例、两个 tab、两个大世界、renderMode 钉死 gpu(防 auto 降级
掩盖风暴)、window capture 级 contextlost 计数、GPU 进程 RSS/FD 采样、
Chrome stderr 抓 GPU 服务错误行。三组同负载 A/B:

| 模式 | contextlost | IOSurface 分配失败 | 熔断 |
|---|---|---|---|
| GPU 模式(用户旗标) | 9 | **27** | 3 |
| 游戏内 renderMode=cpu | 7 | **6** | 2 |
| `--disable-gpu` 全域软渲染 | **0** | **0** | **0** |

三个结论:①字节预算类旗标救不了;②CPU 软渲染大幅减少但非零
(willReadFrequently 的 chunk 画布改走共享内存,但主画布合成链仍产
IOSurface);③唯一完全干净的是连合成器都不产 IOSurface 的全域软渲染。

### 4.2 canvas 出生栈普查(`scripts/_canvasborn-probe.mjs`)——破案关键

patch `document.createElement` + `new Error().stack` 按创建点聚栈,
12 秒移动期结果:

```
4091 张  SkyRenderer.cloudTint        ← 真凶:每帧每朵云新建染色画布(~340/秒)
   54 张  VanillaTiler.frameHasContent ← 良性:烘焙首见帧探测(willReadFrequently
                                          = 共享内存后备,不占 IOSurface;有缓存)
   12 张  ChunkCache.mkPage            ← 见 §5.1(atlas 化后)
```

**为什么历次"泄漏大扫除"都漏掉了 cloudTint?** 因为活集被"缓存上限 64 张"
界定住了(有界 = 不算泄漏),但**出生率无界**(每帧 miss → 每帧新建)。
审计看活集不看出生率,这类引擎就隐形。这是本事故最大的方法论教训。

---

## 5. 游戏侧两个分配引擎的解剖与根治

### 5.1 引擎一:chunk 烘焙(结构性成本)

旧结构:`renderChunkInner` 每个 chunk 新建**两张** 256² 画布(墙层+tile 层,
水渲染在两层之间)。稳态 35 chunk = 70 张;满额 384 chunk = 768 张。
更糟的是**重烘焙即新建**:移动期 flushDirty 以 4 chunk/帧烘焙 =
**每帧 8 张画布诞生** ≈ GPU 进程每秒 480 次 IOSurface 分配/释放,双窗翻倍。

**根治:atlas 页化。** 墙/tile 各一摞 1024² 页,每页 4×4 个 256² cell:
- 重烘焙 = `clip+translate` **原位重画 cell**(画布对象永不弃 → 零 churn)
- 跨格外溢绘制(墙 framing 外扩 1 格、树外扩 6 格,负坐标)被 clip 挡在
  cell 内,与旧"独立画布自动裁剪"完全同语义
- 页只在 dispose(退出世界/切渲染模式)销毁;cell 池 LRU 复用

| 指标 | 旧 | 新 |
|---|---|---|
| 活画布(223 chunk 实测) | 446 张 | **28 张** |
| 移动 6000px 画布出生 | ~6300 张 | 首遍 70(首见)/回头路 **2** |
| 常驻字节 | ~196MB 满额 | ~持平(cell 空隙少) |
| 像素一致性 | — | **8/8 逐字节**(同函数双路径对拍) |

工程要点:`bakeChunkInto(cell<0)` 让**同一条烘焙代码**喂 atlas 页与独立
256² 画布(E2E 对拍靶),像素一致由构造保证而非测试巧合;`ChunkPair` 增
`sx/sy/cell`,Renderer 改 9 参源矩形取 cell。

### 5.2 引擎二:cloudTint 染色(编码缺陷)

云的绘制需要"贴图 × 天色"染色(multiply + destination-in 保形),旧实现:

```ts
const key = `${tex.src}|${r},${g},${b}`;   // 两个坑
```

1. **键含逐帧漂移的 RGB**:天色/大气/云 alpha 随时间连续变化,
   `Math.round(r,g,b)` 每帧不同 → **每帧必 miss → 每帧每云新建画布**
2. **ImageBitmap 无 `.src`**:键恒 `undefined`,不同云纹理还互相碰撞
   (ImageBitmap 迁移时代的老坑在此漏网)

**根治:三层。**
- 色键量化步进 8(通道 3% 内误差,软边低对比云上不可感知)——键只在天色
  跨桶时变
- WeakMap 实例 id 代替 `.src` 作纹理键(bitmap 迁移同款方案)
- LRU 淘汰的画布进 free 池**原位重画**(封顶 8),零画布出生;
  首绘用 `globalCompositeOperation='copy'` 整体替换——池化复用的双坑
  (残留 destination-in 让首绘变擦除 + 旧像素透过透明区串色)一次免疫

效果:4091 张/12s → **0**。

---

## 6. Review 轮:三个差点上线的 bug(全部已修+锁死回归网)

| Bug | 机理 | 为什么第一轮验证没抓到 | 修复与回归网 |
|---|---|---|---|
| **油漆 pass 双重偏移** | 页上下文挂 `translate(ox,oy)`,而 tintRegion 回写用页内绝对坐标 → 落 (ox+px,oy+py),ox>0 的 cell 油漆被 clip **静默吞掉** | 对拍探针的新世界没有油漆(paint 全 0)——逐字节一致 ≠ 全路径一致 | tintRegion 读写坐标分离(read 绝对/write 局部);探针新增"含油漆对拍"(地下涂 202 格漆,cell=5 偏移位 vs 独立目标 diff=0) |
| **cloudTint 池化复用双坑** | 同尺寸复用残留上轮 `destination-in`(首绘变擦除)+ 旧云像素透过透明区串色 | 出生探针只数张数不验像素 | 首绘 `copy` 整体替换;free 池封顶 8 |
| **软收缩效力回退** | 熔断器 shrinkChunks 只还 cell 不放页(每页 2×4MB 背板滞留),旧代码会立即减显存 | 无显存观测断言 | `pageUsed[]` 每页计数 + `trimFreePages()` 尾部空页回收 |
| (附)bakeChunkInto 异常安全 | 异常逃逸 → 共享页上下文残留 clip+translate → 下次烘焙错位到 2× 偏移 | 无异常注入测试 | 拆 `bakeChunkBody` + try/finally restore |

---

## 7. 哨兵:下次如何第一时间抓到(`src/render/CanvasWatch.ts`)

事故能潜伏数周,是因为**没有任何系统在量 canvas 出生率**。哨兵常驻:

- patch `document.createElement` 计数 canvas 出生(一次字符串比较,零热路径
  成本),`new Error().stack` 聚出生栈样例
- 每 5s 一窗;**连续窗双档判据**:≥300 张/窗连 3 窗(急性)/≥100 张/窗连
  6 窗(慢性)→ `console.warn` 带栈(自动进 `__swWarns` 警告环 = F5 可见),
  60s 冷却防刷屏
- F5/renderLog 快照新增 `canvasWatch` 段;`window.__swCanvasWatch()` 控制台
  句柄;`?cwatch=0` 静默

**判据为什么长这样(三轮真机标定的教训):**

| 版本 | 判据 | 真机翻车现场 |
|---|---|---|
| v1 | 速率 20/s×2 窗 | 误伤跑图首见瞬态(帧探测集中头几秒,单窗 30/s) |
| v2 | 60s 滚动总量 2000 | 误伤**进世界洪峰**:`SpriteAtlas.hardAlpha` 一次性单窗 **1621 张**(几百张表的硬 alpha 处理,合法常驻资产),与事故 1700/窗在总量上不可区分 |
| v3 | 连续窗双档 | **零误报** |

原理:一次性构建(洪峰)1-2 窗即衰减,事故(泄漏/不合理分配)**逐窗持续
不衰减**——持续性是唯一可靠的区分度,速率和总量都不是。哨兵自身初版还有
`lastWarnAt=0` 把首报挡进冷却的 bug,被纯逻辑单测当场抓住(6 条,含洪峰/瞬态
误报回归网)——**哨兵也要被测**。

---

## 8. 剩余边界与出路

- 双窗 GPU 模式残余 8 次分配失败,尺寸全是 1280×800(视口级)= **Chrome
  合成器自己的 swapchain**,游戏侧无法再省
- **今天就能用的双开姿势**:`npm run playsoft`(冷启动 + `--disable-gpu`
  全域软渲染,实测 0 失败 0 熔断;代价帧率降,单窗高质量游玩勿用)
- 长期根治:渲染器 v2(WebGL2 全化,数百张画布 → 几十张纹理,张数降一个
  量级)——维持立项
- 联机测试的正解仍是"单窗口双世界"(iframe 无头第二客户端,GPU 开销恒等
  单窗,方案已备,待拍板)

---

## 9. 资产清单

**代码改动**
- `src/render/ChunkCache.ts` — atlas 页池(4×4 cell/1024² 页,cellFree 池,
  pageUsed 计数,trimFreePages,bakeChunkInto/Body 异常安全,tintRegion 读写分离)
- `src/render/SkyRenderer.ts` — cloudTint 量化色键 + WeakMap 纹理 id +
  free 池复用 + copy 首绘
- `src/render/CanvasWatch.ts` — 新增:canvas 出生率哨兵(连续窗双档)
- `src/render/Renderer.ts` — drawChunkGrid 9 参源矩形
- `src/core/Game.ts` — shrinkChunks 页回收接线;F5/renderLog 增 chunkPages/
  canvasWatch 段
- `src/main.ts` — 哨兵装载
- `scripts/play.mjs` + `package.json` — 冷启动检测/优雅退出;`playsoft`
  全域软渲染档;移除安慰剂旗标

**测试与探针**
- `tests/chunk-canvas-release.test.ts`(cell 归还语义重写)
- `tests/chunk-cache-precise-invalidate.test.ts`(断言更新)
- `tests/canvas-watch.test.ts`(哨兵纯逻辑 6 条)
- `scripts/_chunkatlas-probe.mjs` — 五项:像素对拍/含油漆对拍/churn 回头路/
  页数界/渲染存活(渲染改动常规验收工具)
- `scripts/_canvasborn-probe.mjs` — 出生栈普查 + 哨兵静默验证(同类工具)
- `scripts/_dualgpu-probe.mjs` — 双窗 A/B 复现台(DGP_MODE/DGP_FLAGS)
- `scripts/_disgpu-check.mjs` — 有头 disable-gpu 生效性验证

**复跑方式**(私有静默实例,遵守并行会话约定)
```sh
SW_PORT=5201 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5201 npx vite &
SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_chunkatlas-probe.mjs
SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_canvasborn-probe.mjs
```
