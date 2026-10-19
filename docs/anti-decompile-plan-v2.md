# 构建产物防反编译计划 v2(anti-decompile plan v2)

日期:2026-08-23 · 状态:草案(未实施) · 前置:`anti-decompile-plan.md`(v1,2026-08-17)
目标升级:用户定调 **双最优**——反编译成本显著提高 **且** 性能不降反升(不再满足于"≈零损失")。

## 0. v1 → v2 变更总纲

v1 的哲学是"混淆,但把运行时代价压到≈0",防护上限 = J-O 速度带(2026 年 webcrack/
synchrony/restringer 仍可自动还原其大部分静态变换,见 §1)。
v2 不再在"JS 混淆开多少"单点上打转,改为 **分层防护 × 分层性能预算**:

| 层 | 手段 | 防护 | 性能 |
|----|------|------|------|
| 发布面 | 调试页/调试存档剥离 + 调试工具 PROD 死代码消除 | 信息泄漏面归零 | **体积↓、解析↓(反赚)** |
| 热路径(主 chunk 9MB) | 零开销混淆档(字符串数组 none) | 挡美化直读 | ≈0 |
| 冷路径(3 个 worker/2 个面板 chunk) | 火力全开(阈值 1.0/base64/callsTransform/CFF) | 挡自动+人读 | 离帧远,闸门把关 |
| 热内核 | **WASM 化(金标位等价锁死)** | **唯一实质墙(自动工具生态断档)** | **常快于 JS(反赚)** |
| 数据层 | 派生数据表容器化加密 | 挡 wget 扒站 | 加载期一次性,稳态 0 |
| 传输层 | Brotli/Gzip 预压缩 | — | **首屏传输大降(反赚)** |

**核心论点**:能同时满足"反编译成本实质跃升"与"性能不降反升"的技术只有 **WASM**
(wasm2wat 只给无名低级结构,无 webcrack 级逻辑还原工具;LLVM -O2 常快于手写 JS)。
其余手段要么只有防护(JS 混淆/数据加密)要么只有性能(预压缩/死代码消除)。
v2 = JS 混淆(守)+ WASM 热内核(攻)+ 数据容器(守)+ 发布面收敛与预压缩(性能)。

**★WASM 防护为真的前提(v1 未点破的关键)**:dist 内 **不得随包可读的 JS 回退实现**,
否则攻击者直接读回退,防护归零。v2 取 **fail-closed**:内核模块 WASM 加载失败即报错
(2026 年 WASM 支持率≈100%,可接受);JS 参考实现只活在仓库/金标测试,不进 dist。
逃生门走构建期 `SW_WASM_KERNELS=0`(出 JS 版,防护降级但游戏可用)。

## 1. 诚实边界(2026 版,防止自欺)

- **防得住**:美化直读、wget 扒数据、同行整包改皮、顺手牵羊。
- **防不住**:webcrack/synchrony/restringer 对 J-O 静态变换的自动还原(JS 混淆定位
  =提高门槛);F12 断点/内存 dump(数据密钥在内存可见);动态分析永远赢。
- **真墙只有三堵**:WASM(客户端内)、服务端权威(联机场景,单机不适用,搁置)、
  **不发布**(提取管线全在仓库根 `tools/`+`scripts/`,不进 dist——已有免费护城河,
  偷产物者拿到"编译后的行为",拿不到"如何再生产")。
- 投入校准不变:Terraria 复刻,IP 受 Re-Logic 约束,按实际发布场景校准;
  B3 只挑 2~3 个内核,不做"全量 WASM 化"(双语言税不可承受,一等禁物)。

## 2. 硬约束(继承 v1 C1-C7 + 新增)

| # | 约束 | 说明 |
|---|------|------|
| C1 | rAF P95 ≤2%、P99 ≤5% 回归 | 60fps 命根子 |
| C2 | **不动 vite.config.ts**,接线全走 package.json + tools/ 后处理 | 并行会话红线 |
| C3 | dev / vitest / SW_ORIGIN 探针零影响 | 混淆/容器化只作用于 dist |
| C4 | 每批独立 commit + `build:raw` 逃生门 + 各批 env 闸(`OBFUSCATE=0`/`RELEASE=0`/`SW_WASM_KERNELS=0`/`PRECOMPRESS=0`) | 5 分钟止血 |
| C5 | dist JS 总量涨幅 ≤10%(B0/B4 只降不涨) | 首屏敏感 |
| C6 | **SW 缓存链不破**:sw.js 对 assets/*.js 网络优先(已核,混淆改内容安全);但资产版本 = vanilla.json 内容 hash 运行时计算 → 容器化后 hash 口径必须固定(构建期算好嵌入),防版本漂移炸缓存链 | CLAUDE.md 红线 |
| C7 | `public/` **源文件保持明文**:atlas-append 追加通道、restore-vanilla-json.sh、l10n-audit、探针全部消费明文;容器化只发生在构建末段产物上 | 工具链零感知 |
| C8 | 文件名只读不改:混淆/容器化只改文件内容,不改名(index.html 引用与 SW 路径匹配 `/^\/assets\/.+\.(js|css)$/)依赖现名 | 新增 |

## 3. 分批清单

### B0 发布面收敛 + 审计(纯赚,先做)

现状实测(2026-08-23 dist):7 个顶层调试 HTML(annotator/faeling-frames/hitbox-lab/
remaster/sheet-probe/tree-inspect/water-audit,合计 ≈0.6MB)+ **debug-save.sbw.json
5.1MB(整存档明文转储,字段名裸奔)** + hitbox-names.json 397KB + assets-index.json
367KB。prune-dist.mjs 保留它们是**部署体积**决策,不是安全决策;公开发布必须收敛。

| 项 | 内容 | 性能/体积 | 工程量 |
|----|------|-----------|--------|
| B0-1 | `tools/audit-dist.mjs`:扫 dist 出 `*.map`/`sourceMappingURL`/源码绝对路径/调试键名(F6/F2/F5 面板串)/调试页残留,违规非零退出;顺带输出体积台账 | 0 | 0.25d |
| B0-2 | **release profile**:prune-dist 增 `RELEASE=1` 档,裁调试 HTML+调试 json(运行时引用者白名单豁免,以 B0-1 清单定夺);现 `build` 行为不变(用户部署形态不受扰) | −6MB+ 泄漏面归零 | 0.25d |
| B0-3 | F6/F2/F5 调试工具 `import.meta.env.PROD` 门 + 死代码消除(禁运行时 if) | 微降 | 0.25~0.5d |
| B0-4 | 资产清单登记:`public/` = 公开数据定论(继承 v1 P0-4) | 0 | 0.05d |

### B1 JS 混淆分级管线(守·继承 v1 P1,分级微调)

`tools/obfuscate-dist.mjs`(javascript-obfuscator,worker 池并行),接 `build` 尾;
`build:raw` 直通。**三级配置,所有开关显式写死**(master 默认值漂移教训):

| 级 | 目标(实测) | 配置要点 | 闸门 |
|----|--------------|----------|------|
| H 热 | index-*.js 8.99MB | stringArray 0.85/encoding **none**/rotate+shuffle+indexShift/wrappers variable×1/callsTransform **false**/simplify/hexadecimal | G2 帧率 |
| W 冷 | worldGen.worker 3.26MB、save.worker 1.51MB | 阈值 **1.0** + base64 + **callsTransform true**(唯一反自动工具开关)+ numbersToExpressions + splitStrings | G3 世界生成 ≤2%、存档金标 |
| C 极冷 | HousingPanel/RemasterPanel/asset-warm(≤10KB) | W 级 + **controlFlowFlattening**(仅此级解禁:打开频率低,运行时代价无感;诚实注:webcrack 可部分还原,收益=人读成本) | G1 冒烟 |

- H 级 9MB chunk 解析内存风险(v1 R2):`--max-old-space-size=8192`;OOM 则 H 级整块
  跳过(esbuild mangle 已在,该 chunk 边际防护本就最小)。
- **私有 sourcemap(v1 P1-5)v2 建议默认做**:CLI `--sourcemap` + J-O `sourceMap:true`
  链式合成 → `dist-private/maps/<版本>/`,删净 dist 内 map 与注释(B0-1 兜底)。
  混淆后玩家崩溃堆栈全废,没有它线上排障瞎眼。
- spike 三问不变(ESM import/export 保留、worker `new URL`/动态 import 完好、多 MB
  chunk 内存);不通过则 v1 §6 方案 B(自写 magic-string 轻量后处理)。

### B2 派生数据容器化(守·新增,加载期一次性成本)

**范围(项目真皇冠珠宝=提取的数值表,非美术)**:`sprites/vanilla.json`(矩形+伪装
箱表)、`public/l10n/*.json`、`assets-index.json`、hitbox 数据——以 B0-1 清单终定。
**不加密**美术/音频 zip(加载税+本质是 Re-Logic 素材,防不住也划不来)。

- 机制:构建末段(pack-assets 后、prune 前)pack 成自定义二进制容器;加载期
  WebCrypto AES-GCM 一次性解密 → 内存中原样喂现有加载器,**稳态零开销**。
- 密钥:拆片藏多个 chunk + 公开值(版本号)参与派生,不设单点常量。
  诚实注:只防"直接下数据目录"的扒站者;断点/内存 dump 必破,不吹。
- 集成雷区(C6/C7 落点):
  - 资产版本 hash 口径:构建期对**明文**算好嵌入,运行时不再自算——防版本漂移;
  - atlas-append/restore 脚本、l10n-audit、探针全在明文域,零感知;
  - 专设冒烟:容器化后 SW 缓存版本稳定、二刷不重下。

### B3 WASM 热内核(攻·新增,性能反赚 + 唯一实质墙)

候选按"热度×自含度"排序,**金标位等价先行**(复用项目金标文化,位级对拍锁死):

| # | 内核 | 理由 | 工具链 | 工程量 |
|---|------|------|--------|--------|
| ① | UnifiedRandom + CRC32 | 全项目种子地基,极小极自含,先趟平工具链 | AssemblyScript | 1d |
| ② | 光照引擎热循环(src/lighting/,每帧热) | 最大真热循环,性能收益最实 | AssemblyScript | 2~3d |
| ③ | simplex-noise(worldgen worker) | 冷热适中,G3 把关 | 同上 | 1~2d |

纪律:JS 参考实现留仓库跑金标(双实现位等价闸门 G9),**dist 只带 wasm,fail-closed**;
`SW_WASM_KERNELS=0` 构建期出 JS 版(防护降级逃生门)。液体模拟等大状态模块**不做**
(共享状态搬运复杂度 > 收益)。

### B4 传输预压缩(性能·新增,条件项)

`tools/precompress-dist.mjs`:prune 后对散文件子集(壳 JS/CSS/json,主 chunk 9MB
→ br 约 2~3MB)brotli -11 + gzip -9 双产物;assets-zip 已压缩不重复压。部署端需协商
头,file:// 或裸静态托管则 `PRECOMPRESS=0` 跳过。G8 把关首屏。

## 4. 禁用清单(v1 全表继承 + 新增)

v1 §4 十二项全数继承(CFF 例外:仅 C 级极冷 chunk 解禁,见 B1)。
新增:**全量 WASM 化**(双语言长期税,与"反编译源码是唯一标杆"工作流对撞,只准
2~3 个内核)、**加密美术 zip**(加载税+IP 属性错位)、**运行时 JS 回退与 wasm 并包**
(防护归零,见 §0)、**J-O Pro VM / 任何要求源码上云的商用方案**(隐私+离线构建)。

## 5. 验收闸门

v1 G1-G7 全继承(G2 帧率/G3 世界生成/G4 体积/G5 构建/G6 build:raw 字节基线/G7
dev 零干扰),新增:

| 门 | 指标 | 手段 |
|----|------|------|
| G8 | 首屏一次性成本(容器解密+br 解压)≤ +150ms 中端机 | preview 探针计时 |
| G9 | WASM 内核 × JS 参考实现 **位级等价**,全 seed 金标绿 | 既有金标测试基建 |
| G10 | 容器化后 SW 缓存版本稳定、二刷零重下 | 专设冒烟探针 |
| G11 | release profile 产物过 B0-1 审计零违规 | audit-dist 非零退出即红 |

## 6. 风险与回退(v1 R1-R6 继承 + 新增)

| # | 风险 | 缓解 |
|---|------|------|
| R7 | 容器化破坏 SW 版本链/资源加载 | hash 口径构建期固定(G10);`RELEASE=0`/跳过 B2 即回明文 |
| R8 | WASM 位不等价(浮点/平台差) | 金标先行,不绿不并;AS 定点整数优先(随机数/CRC 本就整域) |
| R9 | fail-closed 在极旧浏览器白屏 | 2026 支持率≈100%,接受;真需要时 `SW_WASM_KERNELS=0` 出兼容包 |
| R10 | 预压缩产物与服务器协商不匹配 | env 门默认关,部署形态确认后再开 |

## 7. 总代价与建议路径

| 批 | 运行时 | 体积 | 构建 | 工程量 | 防护增益 |
|----|--------|------|------|--------|----------|
| B0 | ↓(死代码消除) | −6MB+ | +秒级 | 0.8~1d | 泄漏面归零 |
| B1 | H≈0/W·C 离帧 | +3~10% | +30~120s | 1.5~2.5d | 挡美化+自动工具(门槛) |
| B2 | 首屏 +<50ms | ≈0(容器≈明文) | +秒级 | 1~1.5d | 挡数据扒取 |
| B3 | **↓(热内核反赚)** | +wasm 体积(小) | +AS 工具链 | 4~6d | **实质墙** |
| B4 | — | +.br 副本 | +10~30s | 0.25~0.5d | —(纯性能) |

**建议路径:B0 → B1(带 spike+闸门)→ B2 → B4(条件)→ B3①→②(→③ 视收益)。**
全程 ≈8~11 人日;只做守势(B0-B2)≈3.5~5 人日,B3 是唯一"成本实质跃升"批,
按发布需求决定是否点火。
