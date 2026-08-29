# iOS 微壳(flag 门控实验分支)

**状态:占位,W3 数据日之前不落代码。** 首发 iOS 形态 = 主屏 PWA(A-iPWA),
见 game/public/manifest.json + index.html apple-* meta。

## 本分支是什么

Swift 小工程(<300 行):WKWebView + WKURLSchemeHandler(MIME 表 + immutable 头,
直读沙盒内 zip 分片/sprites 平铺),加载同一份 `game/dist` 构建副本。
壳增益三件:私有 preference 实验、编程方向锁、jetsam 白屏进程级恢复。

## 转正判据(BASELINE 判定树之外的本分支专属门槛,二选一)

a. **120Hz 实验成功**:私有 preference `PreferPageRenderingUpdatesNear60FPSEnabled`
   在 iOS 18/26 WKWebView 实测 rAF ≥90Hz 且巡游 p95 无恶化
   (WebKit bug 294338 公开 API 缺失中;审计官已判"CADisplayLink 兜底论"技术不自洽——
   页面呈递由 WebKit 组合器支配,唯一实验位就是这枚 preference,必须 flag 包裹可关);
b. **体验债到期**:方向锁(mainFlow.ts tryFullscreenLandscape 在 iOS 静默失败的面)
   或 jetsam 白屏进程级恢复,任一成为日常痛点且 PWA 形态确认无法偿还。

## 若开闸,先验三点(W2 冒烟清单)

1. `swshell://`(自定义 scheme)下资产 fetch 是否即时命中 WKURLSchemeHandler;
2. CacheStorage/IndexedDB 在 scheme 下的可用性(SW 必死 = bug 206741,AssetCache
   已有条件门会优雅跳过;存档改走 Filesystem/Documents 目录);
3. 五个 WebGL2 层建上下文成功率与 webgl→2D 回退链完整性。

## 壳义务清单(审计裁定继承项)

- 私有 API 一律 flag 包裹,出口随时归零;
- frameCap/present 解耦(fixed-step 1/60 与 present 节奏解耦防重步抖动)属独立改造,
  不塞进首版微壳;
- 白屏恢复 UX、存档落 Documents、scheme handler MIME 表完备性均在壳侧验收件内;
- 移动测试轨独立 origin/端口,防与桌面双轨互踩(sw.js 语义不动,HTML/JS 保持 hash 自足)。
