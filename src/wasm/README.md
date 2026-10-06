# WASM 管线(AssemblyScript)——加载器与回退架构

> 2026-10-03 试点第一刀:SM2 字节码解释器 WASM 化(`sm2.as.ts`,消费面
> `src/fx/ForceFieldBubble.ts` 产物路径,旗 `?sm2wasm=1` **缺省关**,审查通过才转正)。
> 2026-10-03 第二刀:光照 blur 核 WASM 化(`light.as.ts`,消费面
> `src/lighting/LightMap.blur()`,旗 `?lightwasm=1` **缺省关**)——见 §7。
> 本文档 = 三刀(SM2 / 光照核 / 水波)通用约定;后续刀按本页模板复制加载器与闸。

## 1. 管线选型与构建

- **AssemblyScript**(asc 0.28,devDep,纯 npm 工具链零原生依赖)。
  取舍:rustc/cargo 与 emcc 均可用,但 AS 与 TS 源树同语言、`asc` 秒级编译、
  runtime='minimal' 无 GC 停顿,三刀都是「数值循环热核」型负载,AS 足够且
  工程摩擦最小。若未来刀需要 C++ 参照源直译(如 FNA/MonoGame 原生位),再评估
  emcc 通道——加载器/回退架构不受选型影响。
- **构建**:`npm run build:wasm`(= `node scripts/build-wasm.mjs`)——★第二刀起
  **多模块**:`MODULES` 登记表(每刀一行:src/abi/版本导出名)逐模块编译
  `src/wasm/<id>.as.ts` → `src/wasm/gen/<id>.wasm`(+`.wat` + `build-stamp.json` v2
  形状 `{version:2, asc, modules:{<id>:{srcHash,abi,wasmSha256,…}}}`)。
  - 幂等:**按模块独立**判定(源未变跳过该模块),防搅动 SW 缓存链;stamp 损坏/
    v1 单模块形状 → 全量重编一次(确定性编译,sm2 字节级不变已验证)。
  - 自检:每模块产物必须**零 import**(`--use abort=` 桩化)+ `<versionExport>()===abi`
    在场,违者 exit 1。第三刀(水波)扩入 MODULES 表即可。
  - **主构建(build/build:release)不依赖 asc**:`gen/` 产物入 git(金标纪律:
    gen/sm2.wasm 与 gen/light.wasm 是位级锁测试与场值闸的输入,禁手改;改源必须
    走本脚本重编 + 全闸复跑)。**禁止**把 gen/ 加进 .gitignore。
- **TS 侧注意**:`.as.ts` 双后缀 + 文件头 `// @ts-nocheck`——asc 只吃 `.ts` 后缀
  入口,而项目 tsc(严格)不认 AS 内建(StaticArray/heap/load/store),ts-nocheck
  使 tsc 整文件跳过(其余 src 不受累)。

## 2. 加载器与回退架构(三刀通用四约定)

载体:`src/wasm/sm2Wasm.ts`(每刀一个同构 loader 文件)。

1. **特性检测 + fail-closed**:`typeof WebAssembly !== 'object'`、字节获取失败、
   实例化失败、ABI 版本不符 → 加载器永久进入 `failed`(本次页面生命不再重试),
   所有产物出口返回 false/拒,**调用方必须实现 JS 原路径**。
2. **每模块独立 flag**:本刀 `?sm2wasm=1`(缺省关)。旗读取=混合式:import 期
   快照(真实游戏 boot 在 gotoApp 洗参前 import,FFGLOFF 判例同款)+ 调用期现读
   (探针带旗重载;BJ95 gotoApp 洗参后现读会漏)。测试钩
   `__setSm2WasmFlagForTest(v|null)`。
3. **调用点模式**:`wasm可用∧旗开 ? wasmPath() : jsPath()`——`wasm可用`=同步
   `sm2WasmReady()`(异步预热 `ensureSm2Wasm()`,幂等);JS 路径零改动逐位保留;
   wasmPath 返回 false/抛错 → 调用方静默落回 jsPath(fail-closed,不落半态)。
4. **加载时机**:消费点首次触达时点火 `ensureSm2Wasm()`(fire-and-forget,幂等);
   就绪前的帧走 JS 原路径,就绪后新产物自动切 WASM。旗关时零网络/零实例化成本。

## 3. ABI(线性内存布局与出入参约定)

模块零 import(任意环境可实例化);JS 侧经导出函数取**固定缓冲指针**,以
typed-array 视图直读直写(一次分配、容量固定、视图持稳;无 memory.grow)。

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `sm2Version` | `() -> u32` | ABI era guard(现=1);加载器断言,错代拒载回退 |
| `sm2Init` | `(tokBytes,texBytes,outBytes) -> i32` | 一次性分配固定缓冲(幂等,1=ok) |
| `sm2TokenBuf` | `() -> ptr` | u32 token 上传暂存(上传前 JS 直写) |
| `sm2ConstBuf` | `() -> ptr` | f64×256 常量库(JS `setupConstants` 产物直写) |
| `sm2TexBuf` | `() -> ptr` | u8 源贴图 RGBA(s0 采样源) |
| `sm2OutBuf` | `() -> ptr` | u8 产物 RGBA |
| `sm2Caps` | `() -> u64` | (tok<<40)\|(tex<<20)\|out 容量回读 |
| `sm2UploadProgram` | `(tokLen,modes) -> u32` | 解码 token→指令块;句柄 1-based,0=拒 |
| `sm2RunImage` | `(handle,w,h,v0x,v0y,v0z,v0a) -> i32` | 整图运行;1=ok 0=拒;产物写 outBuf |

程序块内存布局(见 `sm2.as.ts` 头注全图):header(16B:count/modes/r 读集位图/
读数)+ 读集寄存器号表(32B)+ 96B/指令(基址+swizzle+neg 预烘焙)+ 32B/指令 imm 区。

试点容量:token 64KB / tex 1MB / out 1MB(覆盖 ≤512² 贴图;最大现役 pass
ArmorGel=332 token)。超容量 → `sm2RunImage` 拒 0 → JS 回退。

## 4. SM2 刀语义面(与 JS 的对应与差)

- **移植源(唯一真值)**:`src/fx/SM2Effect.ts` 的 `decodeProgram` +
  `execPixelVM`(PR#3 前逐指令 switch VM)+ `sampleImageInto`(双线性
  clamp/wrap)。逐指令 1:1,AS 源内每 case 标注 JS 行号锚。
- **不移植**:`setupConstants`/preshader(JS 侧装配,常量=输入;每桶一次,
  非热路径);texld s1/s2 槽(试点单贴图;声明 s1/s2 的 pass 由
  `SM2Pass.singleSamplerS0Only` 在 JS 侧拒绝 → 原链)。
- **性能定型(语义保持,场值闸背书)**:①解码期指针机(bindFile 预烘焙成
  基址+swizzle+neg);②掩码死分量剪枝(只算将被写入分量,与 codegen 生成体
  同纪律;texkill 恒读 0..2、标量广播族读固定输入);③r 寄存器按解码期读集
  清零(fill(0) 等价);④死指令(全掩/越界 dst)解码期标 op=0。
- **语义差清单(全部不落在 ForceField 指令面;场值闸 maxd≤2/255 覆盖)**:
  1. `nrm`(0x24):JS `Math.hypot` 无 AS 对应 → `sqrt(x²+y²+z²)` + `||1`
     真值复刻(0/NaN→1);
  2. sin/cos/pow/log2:wasm libm(musl fdlibm 系)vs V8 fdlibm 系,末位可差
     1 ulp(实测 ForceField 全网格产物 **逐字节相等**,差未落在 8bit 量化域);
  3. min/max(0x0A/0x0B):wasm f64.min/max 与 JS 在 ±0 记号上可差(NaN 传播
     一致);下游 8bit 量化面无辨;
  4. 寄存器越界:JS=undefined 读(算术面≡NaN)/写丢弃 → NaN_CELL 读/丢弃写,
     全算术面等价。
- **dp2add(0x5A) 判谳**:WASM=真 `x·x'+y·y'+src2.x`,与运行时 codegen
  (px_ForceField.gen.ts inst14)一致;现行 JS VM 0x5A 亦为真形——
  forcefield-gl.test.ts:106 注「VM x²-only 是登记偏差」系陈旧登记(现行源码
  已是真形),JS 回退支按纪律未动,仅立此存照。

## 5. 验收闸(每刀复制的模板)

1. **单测**(`tests/sm2-wasm.test.ts`):①位级锁——真实 Perlin+合成 LCG 贴图 ×
   uTime×uColor 网格,WASM vs JS 引擎(codegen 主路径)与 vs JS VM(oracle)
   逐像素 maxd≤2/255 + WASM 产物纯函数位级可复现;②flag 锁;③回退锁(强置
   不可用 / 无 WebAssembly 环境 / s1 采样器形态拒);④计数面分账。
2. **离线场值闸**(浏览器,`scripts/_sm2wasm-fieldgate.mjs`):k2/c13c 判例同款,
   128² 真 Perlin × 8 uTime × 3 uColor 全网格 maxd≤2/255 + 冷跑耗时三引擎对照
   + 拒绝面。
3. **活机探针**(`scripts/_sm2wasm-pillar.mjs`):四柱强置盾 2 分钟柱战,
   wasmRuns 增量>0、帧面零异常、截图;缺省旗 B 臂 wasmRuns=0 回退零变化。

## 6. 试点实测数字(2026-10-03,私有 vite SW_PORT=5205)

- 场值闸:maxd=0(WASM vs JS 引擎与 vs JS VM,全网格,浏览器与 node 双域)。
- 冷跑(128² ForceField,p50):JS VM(oracle 解释器)81.8~156ms → **WASM
  1.2~3.7ms**(22~130×);JS 引擎(codegen 主路径)3.0~5.1ms(WASM≈0.8~1.25×,
  同量级;codegen 仍为无旗缺省路径)。
- 已知债与后续:①codegen 直线体对「有生成产物的 pass」仍最快,建议后续把
  调用点升级为 `codegen → wasm → JS VM` 优先级链(本刀按任务令实现
  `flag∧ready → WASM`,codegen 面未动);②texld 多贴图槽(s1/s2)ABI 扩展位
  已留(modes 位域/采样器字节),按需开;③sin/cos 等 libm 1 ulp 差若未来落在
  量化边界,以场值闸判谳为准。

## 7. 光照 blur 核刀(2026-10-03 第二刀;`light.as.ts` + `lightWasm.ts`)

- **移植源(唯一真值)**:`src/lighting/LightMap.ts` 的 `blurPass`(L79-93)+
  `blurLine`(L101-167),逐语句 1:1(行号锚注释)。调用点=`LightMap.blur()`
  模式③(wasm∧旗 ? wasm : js);**scan(exportTo)/present 不移植**——scan 重对象
  耦合(FlickerClock/specialTileLight ~60 case/Math.random 态机,位级移植=巨型刀,
  登记债),present 实测占 compute 1% 不值得(定谳数据见 §8)。
- **定谳**(node 域三段拆解,游戏形 181×129=23.3k 格):scan 0.59ms(17%)/
  blur 2.87ms(82%)/present 0.03ms(1%);zoom-out 303×201=60.9k:1.52/6.69/0.08
  ——8ms p50 出处=zoom-out 口径。blur=唯一值得动刀段。
- **★位级策略(为什么不用 SIMD)**:blurLine 的 running 光值 zr/zg/zb 是 **f64
  链式累加器**(Float32Array 只承载存储舍入,链式传递全程 f64)——f32x4 降精度
  =每衰减乘丢尾,×255 量化后在量化边界翻转 1/255(23k 格统计期望 ~10 格/帧),
  位级验收不过。f64x2 双线并行亦因 f32→f64 通道搬运开销(~9 ops/通道)不敌标量
  (~8 ops/通道)而放弃。本核=**纯标量 f64**(load<f32> 后 promote,store 前
  demote=JS 同式舍入;NaN/±0 比较语义 wasm 与 JS 同源)。
- **水 flick LUT 留 JS**:`buildWaterFlick` 依赖 FastRandom 种子链(模块级状态),
  留 JS 保种子链单源;AS 核只读 u8 LUT。
- **ABI**(版本导出 `lightVersion()=1`;零 import;容量 2^18 格):

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `lightVersion` | `() -> u32` | ABI era guard(现=1) |
| `lightInit` | `(cells) -> i32` | 一次性分配固定缓冲(幂等,1=ok) |
| `lightRBuf/GBuf/BBuf` | `() -> ptr` | f32×cap 光图三通道(JS 拷入/拷回) |
| `lightMaskBuf` | `() -> ptr` | u8×cap 遮挡 mask(值域 0-4) |
| `lightLutBuf` | `() -> ptr` | u8×cap 水 flick LUT(JS buildWaterFlick 产物) |
| `lightCaps` | `() -> u64` | 容量回读(格) |
| `lightBlur` | `(w,h,pad, air,solid,cracked, dwr,dwg,dwb, dh0,dh1,dh2) -> i32` | 双 pass 原位运算;1=ok 0=拒(容量/几何) |

  衰减常数=f64 形参(JS 侧读 lightTables live binding 当前值传入)——**不内嵌常量**
  (updateLightDecay 每帧覆盖 DECAY_*,内嵌即漂移源)。
- **worker 旗通道**:`?lightwasm=1` 经 **Worker options.name** 注入 worker 域
  (LightWorkerLink spawn 双静态分支构造;loader 双域读取:主线程=页面 URL,
  worker=globalThis.name)。★vite:worker-import-meta-url 约束=worker options
  必须静态字面量(动态三元=vite 500 实锤);快照协议零改动。
- **验收闸**:`tests/light-wasm.test.ts`(19 测:位级锁游戏形/全水/全实心/全蜂蜜/
  全裂纹/退化几何 1×N/N×1/1×1/pad 端点/浮点边界 ±0·NaN·Inf·阈值邻域/种子链
  推进等值/纯函数复现/mask 不改写/flag 三态/回退四锁/引擎端到端 A/B 逐位);
  活机探针 `scripts/_lightwasm-probe.mjs`(三臂:worker-WASM/worker-JS/主线程
  loader;page.workers() 直读 worker 域 prof)。

## 8. 第二刀实测数字(2026-10-03,私有 vite SW_PORT=5209,node M 系列)

- **位级**:19/19 全绿(含全场景 f32 比特域 0 差异);引擎端到端 A/B 公共面逐位;
  既有金标族(lighting-scan-blur-golden/light-worker-parity/sm2-wasm/worker-graph)
  98/98 复绿。
- **性能(node 域,min 口径,WASM vs JS blur 核)**:1080p 181×129:4.10→0.61ms
  (**6.7×**);zoom-out 303×201:11.99→2.21ms(**5.4×**)。三段总账(定谳数据推算):
  zoom-out 口径 8.28→~3.9ms;1080p 3.49→~1.3ms(≤2.5ms 目标达成;scan 1.5ms
  JS 底=不可再降,登记 scan 核移植债)。
- **活机(worker 域 prof,探针台架 1280×800≈15.6k 格,开场地表场景)**:
  blurJs 0.33-0.40ms → blurWasm 0.27-0.30ms(~1.3×;场景亮链稀疏=死亡链短路,
  非应力口径);lightGate p50 A1≈2.5 / A0≈2.3ms——**台架口径 p50 由消息调度地板
  主导(≈2.4ms)非 compute,探针规模下不显差异**(诚实边界);falls=0/resyncs=0/
  零页面错误,下坠+zoom-out+四柱柱战三场景截图零伪影。
- **回退**:A0 臂(worker JS 核)零 WASM 触达;M1 臂(?lightworker=0)主线程
  loader runs>0 且发布面正常;node 域强置不可用/无 WebAssembly/超容量拒全绿。

## 9. 水波网格推进核刀(2026-10-03 第三刀;`waves.as.ts` + `wavesWasm.ts`)

- **移植源(唯一真值)**:`src/render/WaterWaves.ts` 的 `WaterWaveSystem._step`——
  泛形路径(「原路径」L1281-1317)+ W3 快路径(dx=dy=0,L1172-1195)逐语句 1:1。
  BJ270 内域路径不另实现:bj78/bj270 测试已锁 W3/内域/泛形三支【逐位同值】,
  WASM 核实现「快+泛形」两支即覆盖全部 dx/dy 域。**_step 以外的注入/读侧/
  delta 编码/worker 协议面全部不动**(非热路径,登记不迁)。
- **定谳**(2026-10-03,M 系本机,1080p 口径 480×270=129,600 格;★双域数字):
  ①推进核成本——**node 域(V8 12.4)JS 2.5-2.9ms/步 vs 浏览器域(Chrome V8 14.x)
  JS 0.70-0.75ms/步**(部署目标=浏览器;node 域数字系旧 V8 JIT 伪影 4×,独立
  复核 scripts/_wavewasm-nodekernel-bench.mjs)——浏览器口径 **<1ms 迁移线**;
  ②场值形态 Float32Array×4 ping-pong,值恒 k/256(量化不变式,C8-D);③**全文件
  零 Math.random**——纯 f64 数值步进,无 RNG 流分叉面(C13c「延迟烘焙不改 RNG
  流」同款备案不适用);④GL 耦合=uploadWave 每帧只读 readGridR()、worker 协议
  读侧快照,均与步进内核解耦。**判谳:浏览器(强 JIT)本机无迁移收益,不转正;
  试点按任务令完整落地,旗留 ?wavewasm=1 弱机备案逃生口**(弱机判据=C8 案
  Windows 实测 ~8ms/110k 格≈73ns/格,JIT 劣化 14×,WASM 恒定 ns/格面可期,
  本机不可验证=诚实边界)。
- **★位级策略(为什么可逐位)**:内核纯 f64(load<f32> promote,store 前 demote=
  JS Float32Array 同式舍入);AS `Math.round` = ceil−(ceil−0.5>x) ≡ JS 精确语义
  (round-half-up/0.49999999999999994 artifact/±0 区间逐点核对全同);R 通道
  `rq <= 0` 收 −0、G 通道 `gq < 0` 不收 −0 的**不对称守卫逐字照抄**;Math.sign
  ±0 返回原值=JS 同;`10/3` 编译期 f64 除法=JS 同值;**WATER_DAMP 经 ABI f64
  形参传入,禁 AS 侧 Math.pow 内嵌**(libm 1ulp 差=漂移源,lightWasm 衰减常数
  同纪律)。NaN 面传播两侧一致(生产场恒 k/256,防御面非生产行为)。
- **worker 域旗通道**:`?wavewasm=1` 经 Worker options.name 注入
  (WaterWaves._wwSpawnWorker **双静态分支构造**——vite worker-import-meta-url
  约束 worker options 必须静态字面量,动态三元=vite 500 实锤;LightWorkerLink
  判例同款;window.name 同名串不误伤,仅 document 缺席域读 name)。**缺省配置
  (waveworker 转正开)下模拟在 WaveWorker 线程——本刀同时加速 worker 域与
  主线程回退路径(?waveworker=0/看门狗回落帧)。**
- **ABI**(版本导出 `wavesVersion()=1`;零 import;容量 2^20 格=5K css 全屏):

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `wavesVersion` | `() -> u32` | ABI era guard(现=1) |
| `wavesInit` | `(cells) -> i32` | 一次性分配固定缓冲(幂等,1=ok) |
| `wavesRBuf/GBuf` | `() -> ptr` | f32×cap 本步读场(JS _R/_G 拷入) |
| `wavesR2Buf/G2Buf` | `() -> ptr` | f32×cap 本步写场(JS 拷回 _R2/_G2 后自行 swap) |
| `wavesCaps` | `() -> u64` | 容量回读(格) |
| `wavesStep` | `(w,h,dx,dy,damp) -> i32` | 一步推进;1=ok 0=拒(容量/几何/超程) |

  调用点=**`_step` 头部单点**(先于 `swPerf` 三路径;失败/拒/未就绪 → 静默落回
  JS 逐位原路径,fire-and-forget `ensureWavesWasm()` 惰性点火,就绪前帧走 JS)。
  dx/dy=滚动增量 vector3(texel),damp=JS WATER_DAMP。
- **验收闸**:`tests/waves-wasm.test.ts`(14 测:位级锁——7 形状含 1×1/1×N/N×1
  ×10 dx/dy 域(静止/行走/斜向/大跳/超程)×k/256 量化域 Uint32 逐位含 ±0 记号/
  非量化浮点域/极端饱和钳制面/多步演化序列/WASM 双跑确定性;flag/回退四锁+
  形参容量拒;frame() 五帧端到端 A/B 逐位+runs 分账;结构锁——_step WASM 支
  先于 swPerf、spawn 双静态分支、loader 四约定面);活机场值闸
  `scripts/_wavewasm-fieldgate.mjs`(页面域 A/B 逐位+计时+worker 域双 worker
  对拍+回退面+水面截图)。

## 10. 第三刀实测数字(2026-10-03,M 系本机,1080p 480×270=129,600 格)

- **位级**:14/14 单测全绿(Uint32 位域 0 差,含 ±0 记号面;7 形状×10 dx/dy 域×
  三类场值+多步序列+双跑确定性);活机场值闸 14/14(浏览器域 15 步混合序列
  逐位+确定性+回退拒面+worker 域 40 帧含注入批全量快照逐字节+头字段+旗侧
  worker runs=40/无旗侧 0);water/wave 族+三刀 wasm 闸 173/173;tsc 干净;
  活机三场景截图零伪影零 pageerror。
- **性能(★诚实口径,批量步均摊 Chrome 0.1ms 计时量化)**:
  | 域 | JS | WASM | 比值 |
  | --- | --- | --- | --- |
  | node(V8 12.4) 1 步 | 2.53-2.93ms | 0.71ms | 4.0×(非部署域,旧 JIT 伪影) |
  | **浏览器(V8 14.x) 1 步** | **0.730ms** | **0.777ms** | **0.94×(无收益)** |
  | 浏览器 2 步补偿 | 1.443ms | 1.550ms | 0.93× |
  | 浏览器 走动帧 | 0.763ms | 0.787ms | 0.97× |
  | 活机 updateWaterWaves p50(480×270) | 0.700ms | 0.800ms | 0.88×(记录面) |
  **判读**:现代浏览器 JIT 已把本核优化到 ~5.4ns/格,与 WASM 同量级——拷入拷出
  (~2MB/步)吃掉核面微弱收益,**本机浏览器无迁移收益**(与 sm2/light 两刀
  「解释器/复杂分支核 WASM 4-22×」对照:本核=直线数值循环,恰是 JIT 最强域)。
  WASM 核价值定位=**弱机备案**(C8 案 73ns/格 JIT 劣化面,unverified=诚实边界)。
- **已知债与后续**:①**不转正**——旗 ?wavewasm=1 缺省关,缺省路径零行为差
  (enabled() 缓存读取面=一次字符串比较,per-step 零构造);若未来弱机实测
  (Windows C8 复现环境)确认 WASM 显著占优,零成本转正(位级闸全绿在库);
  ②delta 编码/apply(JS 双侧,worker↔main 带宽面)未迁——C8-D 实测 ~11-22%
  全量基线带宽,非 CPU 热核,登记;③node 域 JS 数字(2.5-2.9ms)仅作 V8 版本
  差记录,禁作为迁移判据(教训:**性能定谳必须在部署域测**,node 域基准会
  高估 JS 成本 4×)。

## 11. 光照 scan 核刀(2026-10-04 第四刀;light 模块扩入,ABI v1→v2)

- **移植源(唯一真值)**:`src/lighting/TileLightScanner.ts` 的 `exportTo` 主循环
  (L898-1124)+ `surfaceSky`(L811-841)+ `hellSky`(L845-859)——逐语句 1:1
  (行号锚);`lightExport()` 在 `light.as.ts`(与 blur 同模块:scan→blur 共享
  r/g/b/mask 线性内存,省一次全量拷贝;`lightVersion()=2`,旧 v1 模块拒载)。
- **★拆分定谳(本刀核心——exportTo=两段)**:
  - **WASM 主循环**:GetTileMask/①天空·地狱·彩玻璃墙/②发光墙/③静态 tile 光/
    ④液体光——纯算术+查表;产出 r/g/b/mask + **specialList(特例格索引)**。
  - **JS 尾段**(`TileLightScanner.exportWasmTail`):③b `specialTileLight`
    60-case 大 switch + ④特例格补支 + ⑤ perFrame 点光,位级 1:1 留 TS。
  - **等价性论证**:③b/④ 均 max-merge(可交换);唯一例外 case 125
    'gb-override'(G/B 直接覆写,序敏感)——WASM 对特例格【跳过 ④】,尾段按
    JS 原序 ③b→④ 补跑 ⇒ 最终值逐位同。specialCell 密度=生产 <1% 格。
- **三大耦合面定谳**(第二刀登记三问):
  1. **FastRandom**:master 种子每 exportTo 恰推进 1 步(`reseed()`,TS 侧持链);
     循环内所有局部掷=`localRandom(x,y)`≡`modifiedSeedOf((y*2654435761+x)|0,
     masterSeed)` **纯函数**(无跨格链)⇒ 种子 f64 形参上传,AS 复刻
     nextSeed48/modifiedSeedOf/nextBits/next/nextFloat(48 位整值 f64 精确;
     nextBits 用 i64 右移=精确 floor 除 2 的幂,零 libm 依赖)。**RNG 链位级可达,
     无需钉种子历史**。★哈希坐标=绝对世界坐标(worker 切片经 `hashOrigin`
     平移还原,`runSnapshotOnEngine` 每帧注入;与 JS 尾段 localRandom shim 同锚)。
  2. **FlickerClock**:scan 主循环=**纯读**(mouseTextColor/disco/demonTorch)
     ——标量形参上传,无态机迁移;jellyfishCageMode(316-318)/shimmerBaseColor
     (sin)/hslToRgb/timeForVisualEffects/globalTimeWrappedHourly 消费面全在
     JS 尾段;hellV 的 sin 在 JS 侧预折算成 hellR/G/B 形参——**trig 零入 AS**。
  3. **specialTileLight 60-case**:**非纯查表**(~20 case 动态:帧条件/局部 RNG/
     邻格读/世界旗标)——整体留 TS 零移植风险;specialById 门表上传,AS 只路由。
- **表上传**(模块一次;`getScanTablesPayload()` 与扫描器构造器逐项同源烘焙,
  进程级缓存):per-type 表按 u16 全域 65536 sizing(blocks/noSun/cracked/
  allowWater/mushroom/flicker/hasLight/special u8 + sheet i16 + lightR/G/B
  **f32**[构造器同式舍入值域])+ wall 表 512(与 JS WN 同域)+ torch/glass/
  paintColor f64 + LIGHT_TOGGLE axis/delta。★OOB type(≥TILE_DEFS.length)
  生产不可达(setTile 只写注册表 id),全域 sizing 免逐格边界守卫;JS undefined
  强制转换怪癖与 0 尾的微差=死路径偏差(登记)。
- **窗口协议**:上传窗=store 内 [max(0,rx-1), min(st.w,rx+mw+1))×y 同式
  (区域±1 邻格读域;13 通道行拷贝 ~17B/格)。InWorld(x,y,1) 折叠在窗口系
  精确复现(证明:LightWorkerProtocol 头注同款数学,world-edge clamp 逐格同集合)。
  主线程全量 store 与 worker 切片 store 走同一条上传路径。
- **worker 旗通道**:沿用 `?lightwasm`(转正缺省开,`?lightwasm=0` 同时关两核);
  快照协议仅增 `world.hashOrigin` 注入(3 行,位等价面——JS 支不经此)。
- **验收闸**:`tests/light-wasm.test.ts`(31 测=blur 19 + scan 12:特征世界
  全 case 类/FlickerClock 活跃三态/特例密集区含 gb-override×液体序敏感面/游戏形/
  世界边缘折叠三态/微光域 dk<1/NaN 参数面[timeOfDay/mouseTextColor NaN——探针
  曾抓出 ③ 合并 Math.max NaN 传播语义差,已修 maxJs]/worker 切片 rebase+hashOrigin
  同锚/RNG 链 3 连拍等值/旗关·强置不可用·超容量三回退锁/性能 bench);
  既有金标族(lighting-scan-blur-golden[旗开=自动锁 scan 位级]/light-worker-parity/
  tile-light-specials/static-golden-1457/c9d 族)121/121 复绿。

## 12. 第四刀实测数字(2026-10-04,M 系本机;node+活机双域)

- **位级**:scan 12 测 + 全族 331/331 全绿(20 套件:light-wasm/scan-blur-golden/
  worker-parity/tile-light-specials/static-golden-1457/fastrandom-golden/c9d 族/
  redblue-r8/coating/tile-domain-sentinel 等);`lighting-scan-blur-golden` 在旗开
  缺省态下自动成为 scan 核位级金标(day/night × scan/blur1/blur2 逐格 ===)。
- **性能(node 域,min-of-40,JS vs WASM scan 全含[窗口上传+核+读回+JS 尾段])**:
  | 口径 | JS | WASM | 比值 |
  | --- | --- | --- | --- |
  | 1080p 181×129(23.3k 格) | 0.81ms | 0.26ms | 3.2× |
  | zoom-out 303×201(60.9k 格) | 2.14ms | 0.51ms | 4.2× |
- **三段总账(node 域,WASM scan+WASM blur+present,min-of-40)**:
  1080p **0.73ms**;zoom-out **1.64ms**——**≤2.5ms 目标达成**(第二刀后 ~3.9ms)。
- **活机(worker 域 prof,探针 scripts/_lightwasm-scan-probe.mjs,私有 vite 5217,
  direct seed 05162020,?lightworker=1 双臂)**:
  | 场景 | exportTo A0(JS) | exportTo A1(WASM) | busy(compute) A0→A1 |
  | --- | --- | --- | --- |
  | 静置 | 0.408ms | 0.187ms | 0.941→0.555ms |
  | 高空下坠 | 0.447ms | 0.195ms | 0.899→0.525ms |
  | zoom-out 0.5 | 0.467ms | 0.185ms | 0.915→0.517ms |
  | 雷雨 | 0.456ms | 0.192ms | 0.893→0.545ms |
  **scanRuns=帧帧递增/scanRefusals=0/worker gate p50 ≈2.2ms 双臂持平(消息调度地板
  非 compute)/零页面错误/下坠+雷雨截图零伪影**。worker busy 目标 ≤0.65 达成
  (0.52-0.55);exportTo 目标 ≤0.1 未达(实测 ~0.19,固定成本[上传+读回+尾段]
  主导,见债①)。
- **已知债与后续**:①**scan→blur 非驻留**(读回 r/g/b/mask 后 blur 再拷入+JS 尾段
  读写,exportTo 残 ~0.19ms 中固定成本主导)——若未来要压到 ≤0.1,二期做驻留
  管线(blur 免拷入+尾段特例格读 WASM 内存);②OOB type 死路径偏差(见上);
  ③RainbowCloud 719 对 hourly NaN 的 JS 侧 undefined 索引=既有不可入参面
  (两臂同崩,与本次无关);④探针台架 bootstrap 冷桥 flake(预热臂模式保留)。

## 13. 光照二期·驻留管线定谳+上传布局刀(2026-10-06;零 ABI 变更,lightVersion()=2 不动)

- **定谳(段账分解;node 微账+活机段账台架 `scripts/_lw-resident-verdict-probe.mjs` 双域)**:
  exportTo-WASM 并非「拷贝主导」——**内核主导**(1080p 活机段账:kernelWin
  0.207ms vs 上传 0.075/读回 0.004/壳+尾段 ~0.02)。已登记二期处方三刀的
  **实测收益全部低于停刀线 0.05ms/帧**:免读回(CutA)0.004ms、blur 免拷入
  (CutB)0.004ms、blur 免拷出(CutC)0.003ms(合计 ~0.011ms)——**诚实停刀,
  不落地**(读回/拷出同时是金标链的观察点,杀之需引入「JS 数组陈旧窗」戳记
  纪律,复杂度>收益)。blurKernel 0.43ms=blur 段 98%(位级 f64 链禁 SIMD,
  不可再压)。
- **真凶=窗口上传的 1703 段行拷贝**(每调 subarray 分配+set 调用开销,非字节
  量:407KB 行拷 0.075-0.095ms vs 572KB 整片 13 段 0.011-0.014ms)。**落地刀=
  上传布局双态**:`lightWasmExportScan` 在 st.w×st.h ≤ 容量时(worker 切片恒真)
  走 **bulk 整片上传**(13 通道各一次 set,内核 ww=st.wh=st.h 原点=(rx,ry) 直读
  切片布局);切片超容量(主线程全量世界 store)保留窗口行拷贝旧行为逐位。
  折叠公式与 JS 路径逐式同源(stW/stH 形态),邻格读域=全切片⊆上传域,hash/gl/
  lava rebase=减 store 原点(0,0)——worker 切片已 rebase/主线程原点即 0,0 两
  调用方语义恒同。**零跨帧状态**(无驻留失效面:region 跳行/enc 三态全无关,
  每帧从 store 全量重传)。
- **位级**:bulk vs window 布局产物逐位全等(同内容双 store×世界边缘/内部区域
  三臂对拍 tests/light-wasm「二期上传布局对拍」;浏览器 A/B bulkVsWinBitDiff=-1
  同证)。既有 12 scan 位级测试自动转锁 bulk 支。
- **实测(M 系,同日同机,活机 worker 域 direct seed 05162020)**:
  | 场景 | exportTo 前(行拷) | 后(bulk) | busy(compute) 前→后 |
  | --- | --- | --- | --- |
  | 静置 | 0.220ms | **0.131ms** | 0.653→0.433ms |
  | 高空下坠 | 0.248ms | **0.179ms** | 0.674→0.568ms |
  | zoom-out 0.5 | 0.248ms | **0.222ms** | 0.673→0.695ms(噪声域) |
  产线时序账(上传→内核紧邻,同批):flowWin 0.256 vs flowBulk 0.155(净
  −0.101ms);node 域同法 −0.039/zoom −0.026。A0 臂(?lightwasm=0)全 JS 恒
  零变化;scanRefusals=0;零页面错误。
- **≤0.1 目标定谳**:静置 0.131 仍高于 0.1——残段=scan 内核(~0.09-0.1 活机)
  +读回+尾段,均为位级锚定面(内核 f64 链禁 SIMD/免读回需陈旧窗戳记),
  **拷贝侧已无 ≥0.05ms/帧的可合规收益,登记终态**。
- **验收集**:tests/light-wasm 33/33(含新布局对拍);金标族 8 套件 50/50;
  邻域 14 套件 104/104;sm2/waves/worker-graph 49/49;tsc 干净(shine-debt
  报错系并行会话 TileShine 在途面,与本刀无关)。
