# 构建产物防反编译计划(anti-decompile plan)

日期:2026-08-17 · 状态:草案(未实施) · 前置讨论:会话 2026-08-16/17

## 0. 目标与非目标(诚实边界)

**目标**:在"几乎零性能损失"约束下,把构建产物(dist/)的逆向成本抬到"顺手牵羊者放弃、
决心型攻击者付出高额人工"的程度。

**防得住**:
- 日常扒站、直接美化(prettier/js-beautify)后阅读
- 同行快速抄走整套实现去改皮发布

**防不住(技术上限,写明防止自欺)**:
- 决心型逆向:webcrack / synchrony 可**自动**还原 javascript-obfuscator 的大部分
  静态变换(字符串数组/调度器模式是它的招牌目标)。JS 层混淆定位是"提高门槛",
  不是"防止反编译"。
- 动态分析:F12 断点单步永远看得见运行时行为,任何混淆对此无效。
- 数据抓取:`public/`(vanilla.json、l10n 包、图集)随 dist 全量裸奔,
  网络面板直接可下。**代码混淆对数据零保护。**

**已有护城河(免费,勿误当缺口)**:全部提取管线在仓库根 `tools/` 与 `scripts/`,
不进 dist。偷走构建产物的人拿到"编译后的行为",拿不到"如何再生产"。

**投入校准**:项目本身是 Terraria 复刻,对外公开/商用受 Re-Logic IP 约束;
防护投入按实际发布场景(学习/私用为主)校准——**P0+P1 已绰绰有余,P3 仅在确有
单一高价值算法时再做**。

## 1. 硬约束(红线)

| # | 约束 | 原因 |
|---|------|------|
| C1 | 渲染帧率:rAF P95 回归 ≤2%,P99 ≤5% | 60fps 逐 tick 模拟是命根子 |
| C2 | **不动 vite.config.ts**(接线全走 package.json scripts + tools/ 后处理) | CLAUDE.md:编辑它会重启所有并行会话的 vite 实例 |
| C3 | dev / vitest / SW_ORIGIN 探针流程零影响 | 混淆只作用于 dist 产物 |
| C4 | 每步可独立回滚:`npm run build:raw` 一键出未混淆包;每批次独立 commit | 出事 5 分钟内止血 |
| C5 | 体积:dist JS 总量涨幅 ≤10% | web 游戏首屏敏感 |

## 2. 分批清单(每项含代价)

代价五维:**运行时** / **体积** / **构建时长** / **工程量**(人日) / **排障代价**。
工程量为"熟悉本仓库的会话"口径。

### P0 基线与审计(先做,纯赚)

| 项 | 内容 | 运行时 | 体积 | 构建 | 工程量 | 排障 |
|---|------|--------|------|------|--------|------|
| P0-1 | `tools/audit-dist.mjs`:扫 dist 出 `*.map` / `sourceMappingURL` / 源码绝对路径 / 调试工具痕迹(F6 召唤面板键名等),违规即非零退出 | 0 | 0 | +2~5s | 0.25 | 无(纯收益) |
| P0-2 | sourcemap 关闭确认:vite 默认 false(已核 `game/vite.config.ts` 无该项),P0-1 锁死防回归 | 0 | 0 | 0 | 0(含上) | 无 |
| P0-3 | 调试工具 PROD 剥离:F6/F2/F5 入口用 `import.meta.env.PROD` 门 + 死代码消除(禁运行时 if) | 0(反而省) | 微降 | 0 | 0.25~0.5 | dev 不受影响 |
| P0-4 | 资产清单登记:`public/` = 公开数据(见 §0),写入文档定论,不再反复纠结 | 0 | 0 | 0 | 0.1 | 无 |

### P1 后处理混淆管线(核心批次)

| 项 | 内容 | 运行时 | 体积 | 构建 | 工程量 | 排障 |
|---|------|--------|------|------|--------|------|
| P1-1 | devDependency 引入 `javascript-obfuscator`;**spike**:拿真实 dist 的 1 个主 chunk + 1 个 worker chunk 跑通,验证 ESM 兼容 | 0 | - | 0 | 0.5 | 无 |
| P1-2 | `tools/obfuscate-dist.mjs`:遍历 `dist/assets/**/*.js` 分级混淆(配置见 §3);worker 池并行处理 | 见 §3 | +3~10% | +30~120s | 0.5~1 | 见 P1-5 |
| P1-3 | package.json 接线:`build` 尾接混淆;新增 `build:raw`(直通无混淆,排障用) | 0 | 0 | 0 | 0.1 | **build:raw 是逃生门** |
| P1-4 | 验证闸门(§5):preview 探针 A/B 帧时长 + 世界生成时长 + e2e:dist | 0 | 0 | 0 | 0.5 | 无 |
| P1-5 | (可选)私有 sourcemap:`vite build --sourcemap`(CLI flag,不动 C2)+ J-O `sourceMap: true`,脚本链式合成后移入 `dist-private/maps/<版本>/`,**删净 dist 内 map 与 sourceMappingURL 注释**,P0-1 兜底 | 0 | dist 不变 | +10~20% | 0.5 | 线上崩溃可回溯源码行(否则混淆后堆栈全废) |

**P1-1 spike 必须回答的三个问题**(不通过则启用 §6 方案 B):
1. ESM `import/export` 语句与跨 chunk 相对路径 `./chunk-xxx.js` 是否原样保留
   (J-O 的 `ignoreImports` 官方文档只管 `require`,**不管 ESM**,不能指望它);
2. `new URL('./worldGen.worker.js', import.meta.url)` / 动态 `import()` 是否完好;
3. 多 MB 级已压缩 chunk 的解析内存/耗时是否可承受(J-O + babel 吃内存是已知问题)。

### P2 调优与强化(仅当 P1 闸门触发)

| 项 | 内容 | 触发条件 | 代价 |
|---|------|----------|------|
| P2-1 | chunk 级豁免:用 `vite build --manifest` 拿 chunk→模块映射,把帧热 chunk(主包/Game 循环所在)降阈或整块跳过 | G2 帧率超标 | 工程量 0.25~0.5;运行时归零;防护面缩小(该 chunk 只剩压缩态) |
| P2-2 | 冷代码升档:世界生成/菜单/UI chunk 加 `numbersToExpressions`/`splitStrings`(均 ≈0 运行时,JIT 常量折叠) | G4 体积富余且想加压 | 体积 +2~5%;工程量 0.1 |
| P2-3 | ~~J-O Pro VM 混淆~~ **明确不做** | — | 付费订阅 + **源码上传第三方云端**(obfuscator.io API)三杀:隐私/可用性/离线构建 |

### P3 皇冠珠宝(远期可选,默认不做)

| 项 | 内容 | 运行时 | 工程量 | 长期税 |
|---|------|--------|--------|--------|
| P3-1 | AssemblyScript(类 TS)把单一关键纯计算模块编译进 WASM(候选:UnifiedRandom/Crc32、spawner 核心)。WASM 无 webcrack 级自动还原工具,防护等级实质跃升 | 0 甚至更快 | 每模块 1~3 人日 | **双语言维护**:该模块每次数值对账都要过 AS 工具链,与"反编译源码是唯一标杆"的工作流有摩擦 |
| P3-2 | 服务端权威/存档校验(联机基建 WS:7777 已有):官方服跑权威模拟,客户端副本无克隆价值 | 客户端更轻 | 3~10 人日 | 服务器运维成本;单机玩法不能强制,只能覆盖联机/排行榜场景 |

**决策建议**:本项目的价值在广度(数据 + 1:1 保真),不在单一秘方算法——P3 默认搁置,
除非未来出现"一个函数泄露=整个项目白干"的模块。

## 3. 混淆配置与逐项代价(P1-2 采纳档)

基准 = J-O "Low obfuscation, High performance" 预设剔除有害项后微调:

```js
// tools/obfuscate-dist.mjs 内的目标配置(草案)
{
  compact: true,
  // —— 采纳(运行时 ≈0)——
  stringArray: true,               // 字符串入数组:每次访问 +1 次数组索引
  stringArrayThreshold: 0.85,      // 覆盖率;官方提示覆盖过高会变慢,留 15% 直通
  stringArrayEncoding: [],         // 不编码(权衡见下)
  stringArrayRotate: true,         // 构建期偏移,运行时 0
  stringArrayShuffle: true,        // 构建期洗牌,运行时 0
  stringArrayIndexShift: true,     // 运行时 0
  stringArrayWrappersType: 'variable', // 官方注明 fast(function 才是 slower)
  stringArrayWrappersCount: 1,
  stringArrayCallsTransform: false,    // ⚠ master 版默认已翻转为 true,必须显式关;
                                       //   它是唯一"反自动反混淆工具"开关(README 原文:
                                       //   harder to automatically find calls),代价=调用
                                       //   间接化开销 → 只给 worker chunk 试开,见 P2-2
  identifierNamesGenerator: 'hexadecimal', // esbuild 已 mangle 过,双保险,0 开销
  simplify: true,                  // 静态等价变换,0 开销
  numbersToExpressions: false,     // P2-2 再开;开了也 ≈0(JIT 折叠)
  splitStrings: false,             // 同上
  unicodeEscapeSequence: false,
  target: 'browser-no-eval',       // 不用 eval,未来上 CSP 无冲突
  reservedStrings: [],             // spike 后按需登记动态匹配的字符串
  // —— 显式关闭(全部有官方警告级代价,见 §4)——
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  selfDefending: false,
  renameGlobals: false,
  renameProperties: false,
  transformObjectKeys: false,
}
```

**encoding 抉择**:`none`(默认档)vs `base64` vs `rc4`。
- `none`:字符串明文躺在数组里,grep 一下全出来——但 webcrack 同样能解编码档,
  编码的真实收益只是"人眼多花几分钟"。运行时 +0。
- `base64`:每次访问多一次解码。**无缓存**,热循环里反复解码是实打实的开销。
- `rc4`:官方注明比 base64 再慢 30–50%,直接排除。
- **建议**:主包(帧热)`none`;worker/世界生成 chunk 可试 `base64`,G3 闸门把关。

**分级策略**:
- worker chunk(`*.worker.js` 等,离渲染帧):阈值可拉满 1.0、可加 base64,
  以及 `stringArrayCallsTransform: true`(README 原文:harder to automatically
  find calls——唯一专门反"自动反混淆工具"的开关,代价=调用间接化;
  G3 世界生成时长闸门把关,回归超 2% 即回退);
- 配置所有开关一律显式写死、不依赖默认值:master 分支默认值已漂移
  (`stringArrayCallsTransform` 默认变 true)证明这是必要纪律;
- 主包 chunk:阈值 0.85、`none`,G2 闸门超标则降;
- P1-1 spike 通过率不足时按 §6 方案 B 回退。

## 4. 禁用清单(每项的"代价账",防止未来手痒)

| 选项 | 代价(官方口径) | 备注 |
|------|------------------|------|
| `controlFlowFlattening` | **最高 1.5× 运行时变慢**(README 警告原文) | 60fps 模拟绝对禁区;且 webcrack 可自动还原 |
| `deadCodeInjection` | 体积最高 **+200%** | 违反 C5;防自动工具收益≈0 |
| `debugProtection(Interval)` | **可冻结浏览器**(官方警告) | 伤正常用户;F12 一开就卡死的是玩家不是逆向者 |
| `selfDefending` | 产物对任何二次处理(美化/再压缩/字符级 patch)零容忍,直接崩 | 会咬到我们自己的 sourcemap 链/未来任何后处理 |
| `disableConsoleOutput` | 全局吞 console | 线上排障瞎眼;P1-5 的回溯体系直接失效 |
| `domainLock` | 换域/`file://`/离线壳(PWA)即白屏跳转 | 与离线壳方案(已有)冲突 |
| `renameProperties` | 官方"MAY break your code";存档字段/联机协议/l10n 键全是字符串键动态访问 | **必炸**,一等禁物 |
| `renameGlobals` | 官方"can break your code";esbuild 已做模块级 mangle,收益重叠 | 风险>收益 |
| `transformObjectKeys` | 每属性访问变函数调用,数据表(全项目命脉)访问全线变慢 | 表驱动架构最忌 |
| `rc4` 编码 | 比 base64 慢 30–50% | 热循环禁区 |
| `stringArrayWrappersType: 'function'` | 官方注明 slower | 仅性能不敏感场景可用,P2 再议 |
| Obfuscator.io Pro VM | 付费 + 源码上传第三方云 | P2-3 已定案不做 |

## 5. 验收闸门(全绿才进下一批)

| 门 | 指标 | 手段 |
|---|------|------|
| G1 功能 | preview 手玩 10min 无异常;现有 e2e 全绿 | `vite preview`(4173)+ 探针 `SW_ORIGIN=http://localhost:4173` |
| G2 帧率 | rAF 帧时长 P95 回归 ≤2%,P99 ≤5% | 混淆前后同脚本同 seed 各跑 60s,对比分布(探针脚本新建,带 A/B 报告) |
| G3 世界生成 | 同 seed 生成墙钟时长回归 ≤2% | 现有 worldgen 探针改指 preview origin |
| G4 体积 | dist JS 涨幅 ≤10% | P0-1 审计脚本顺带输出体积对比 |
| G5 构建 | 全链 ≤+2min | 混淆步骤计时日志 |
| G6 回滚 | `npm run build:raw` 产物 = 现状基线(字节级对比 JS 总量) | 脚本内置 |
| G7 零干扰 | dev 探针(5199/52xx)行为不变 | 现有一条探针冒烟即可 |

注意:G2/G3 的探针跑在 **vite preview** 上,不占用 5199 共享实例,也不触
SW_NO_HMR 约定(preview 无 HMR 概念);但仍按惯例给 preview 独立端口(如 4174)。

## 6. 风险与回退

| # | 风险 | 缓解 |
|---|------|------|
| R1 | J-O 对 ESM chunk 处理不完整(import/export 被破坏)→ **方案 B**:自写 ~150 行轻量后处理(magic-string):字符串字面量集中 + 恒假花指令分支 + 保持 import/export 原样;防护低一档但零依赖零兼容险 | spike 先行;方案 B 预算 0.5 人日 |
| R2 | 多 MB 压缩 chunk 解析内存爆炸 | node `--max-old-space-size`;或最大 chunk(通常=帧热主包)整块跳过——与热路径豁免天然一致 |
| R3 | 混淆后线上堆栈不可读 | P1-5 私有 sourcemap 归档;不做则接受"线上问题用 build:raw 复现" |
| R4 | 与 l10n/atlas 审计插件顺序 | 审计在 vite build 的 buildStart,混淆在其后,天然无冲突 |
| R5 | 未来上 CSP | `target: 'browser-no-eval'` 已预留 |
| R6 | 并行会话撞车 | 只新增 tools/ 脚本 + package.json 两行,冲突面极小;不动 vite.config.ts |

## 7. 总代价汇总(一次性看全)

| 批次 | 运行时 | 体积 | 构建 | 工程量 | 排障 | 防护增益 |
|------|--------|------|------|--------|------|----------|
| P0 | 0 | 0/微降 | +秒级 | 0.6~0.85 人日 | ↑(审计+逃生门) | 基线:无 sourcemap、无调试残留 |
| P1 | 冷代码 ≈0;热路径待 G2 实测 | +3~10% | +30~120s | 1.5~2.5 人日 | build:raw 逃生门 + 可选私有 map | 挡住美化直读与顺手牵羊 |
| P2 | 0(仅在闸门触发时做减法) | +0~5% | 微增 | 0.35~0.6 人日 | 不变 | 边际 |
| P3-1 | 0/+ | +wasm 体积 | +AS 工具链 | 1~3 人日/模块 | **双语言长期税** | 挡自动工具(实质跃升) |
| P3-2 | 客户端更轻 | — | — | 3~10 人日 | 服务器运维 | 联机场景接近免疫 |

**建议路径:P0 → P1(带闸门)→ 视结果 P2;P3 搁置待真实发布需求。**
