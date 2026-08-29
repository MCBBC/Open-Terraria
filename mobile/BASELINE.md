# 移动性能基线协议(mobile BASELINE)

依据:四派辩论终审(2026-08-28,方案全文见 `~/.claude/plans/glimmering-noodling-tulip.md`)。
铁律:**任何壳的性能断言必须先过本协议;`_conf-guard` 未通过的采集一律作废。**

## 形态矩阵(U1 自用直装 / U2 双端同步 / U3 iOS 18+/26+)

| 编号 | 端 | 形态 | 说明 |
|---|---|---|---|
| A-iPWA | iOS | 主屏 PWA(Safari 引擎) | 首发;iOS 唯一保住 SW 资产链与热修的形态 |
| B-iShell | iOS | C 式微壳(WKWebView+SchemeHandler) | **flag 门控实验分支**,转正判据见 ios-shell/README |
| C-TWA | Android | **TWA 直装 APK**(`game/mobile/twa/`,androidbrowserhelper 手写工程) | ★2026-08-30 用户定盘转正为唯一 Android 形态(Chrome 本体渲染,40817676 架构税整体绕开);离线靠 sw-twa.js(gen-sw-twa.mjs 产出:boot precache+文档 SWR);首启联网预热,更新=次启生效 |
| D-AWebView | Android | ~~离线安装包~~ **退役**(2026-08-30) | game/mobile/android-shell/ 封存(v1.0.1 可作完全离线兜底);System WebView 渲染路径劣势经实测用户反馈坐实(Chrome 明显更流畅) |

## 设备与采集纪律

- 最小充分集:iOS 最新代 ×1 + Android 中端 ×1(审计裁定:iOS 诸壳同属一个 WebContent 引擎,不构成独立样本;独立对比轴唯 Android Chrome↔SystemWebView 一条)。
- 各配置**串行**采集,防同机争抢;每轮前先跑 `_conf-guard` 存指纹。
- 固定条件:`?nosw` 之外不改任何 URL 参数;世界=内置 `debug-save.sbw.json`(seed 12345);巡游=`TOUR_POINTS` 十点;`--force-dpr=2` 交叉组单列一组复查体感结论。
- 口径:p95 rAF dt 与 present-gap(gt25ms)**双口径**必须同时达标;300ms+ 长任务按 **比率限(/min)** 不做清零承诺;冷启动定义=冷缓存首启 ≤15s;30 分钟巡游零 jetsam 白屏重建。

## 探针清单(game/scripts/,一律经 `tools/run-diag.mjs`)

| 探针 | 作用 | 平台面 |
|---|---|---|
| `_conf-guard.mjs` | 配置指纹前置校验(DPR/backing 比/frameCap/GL/OffscreenCanvas/SW 态) | 全平台自动化 |
| `_frame-budget-probe.mjs` | rAF 分桶+present-gap+longtask 比率+堆增长(GC 锯齿留档) | 全平台自动化 |
| `_glx-sync-cost.mjs` | getImageData/readPixels/blit 读回延迟三通道 | 全平台自动化(iOS 数据另人工复核) |
| `_cpu-flame-probe.mjs` | Profiler selfTime top40(`SW_CDP=<ws>` 接 Android 真机壳内页) | Chromium 自动化;iOS 人工 Safari 谱样 |

## 判定树(W3 数据日,审计补丁版)

1. 四配置 CPU 曲线重合 >90% **且 present-gap 同差 <2ms** → 维持系统官道(C-TWA + A-iPWA),壳支(B/D)冻结;
2. GL 同步/合成等待长尾 >3ms(willReadFrequently 开关两侧各测一轮防指标恒假),且属于 renderer priority 类可救因子 → Android 转 D-AWebView(启用三件套);
3. jetsam 高频白屏 → 先反事实:削图层池/合成树驻留(回落 GfxQuality renderScale 阶梯)再测;仍高频 → 微壳承接"白屏恢复 UX"债径入支路三。

## 结果归档

每轮采集落 `mobile/baseline/run-YYYYMMDD-<编号>.json`(原始)+ 本文件下方追加结论行。裁决变更须同步 `memory/mobile-app-packaging-recon.md`。

### 运行记录
(暂无 —— W2 双端真机开跑后追加)
