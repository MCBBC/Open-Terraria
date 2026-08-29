# SandboxWorld Android TWA(Chrome 本体渲染的安装包)

**★2026-08-30 转正为唯一 Android 形态**(用户定盘:不考虑 System WebView)。
TWA = Trusted Web Activity:壳只是启动器编排层,页面由**手机 Chrome 本体**
以 CustomTabs 可信会话托管——渲染路径与手机浏览器完全同一条(chromium 40817676
的 WebView 劣势整体绕开),这是它相对已退役 AWebView 壳的性能来源。

## 实现选择:手写 androidbrowserhelper 工程(非 Bubblewrap)

Bubblewrap 向导交互多且要自下 JDK/SDK;本工程直接用官方宿主库
`com.google.androidbrowserhelper:androidbrowserhelper`(LauncherActivity 全权编排),
复用 android-shell 的 gradle 钉点/JDK17/SDK/keystore,构建零交互。
`app/build.gradle.kts` 里依赖钉 browser:1.8.0 + androidbrowserhelper:2.5.0。

## 构建(全程本地,~2MB 产物)

```sh
cd game/mobile/twa
export JAVA_HOME=$HOME/tools/jdk-17.0.20.1+1/Contents/Home   # 或已 export
~/tools/gradle-8.9/bin/gradle assembleRelease --console=plain
# → app/build/outputs/apk/release/app-release.apk
adb install -r app/build/outputs/apk/release/app-release.apk
```

前提清单:
- **manifest.json 必须已上线**(Chrome 启动时拉 `https://sandbox.vinlic.com/manifest.json`)
  ——`npm run build` 后把 dist 推 Cloudflare Pages(链尾自动生成 dist/sw-twa.js 一并上)。
- **`.well-known/assetlinks.json` 已备**(`game/public/.well-known/`,指纹=共用
  keystore sw.jks 的 SHA-256)。部署后 Chrome 校验通过 → 彻底无地址栏;通过前
  首启可能短暂显示 URL 条(仍可正常玩)。

## 离线语义(重要)

壳内不打包任何资产,离线能力全靠 **sw-twa.js**(TWA 专用 Service Worker):

- 入口 URL 带 `?twasw=1`(DEFAULT_URL 已配)→ AssetCache 注册 sw-twa.js 而非 sw.js;
- sw-twa.js = sw.js 打补丁产出(`scripts/gen-sw-twa.mjs`,marker fail-loud,挂在
  `npm run build` 链尾):① install 期 precache 文档/清单/图标进独立 `sw-twa-boot`
  缓存(命名避开 sw-assets-v 前缀防页面 gc 误删);② 文档请求改
  **stale-while-revalidate**:缓存立回保离线冷启动,后台拉新版下次启动生效;
- 资产链(sprites/sounds zip 分片流水线)与桌面 sw.js 完全同构。

**首次启动必须联网**(装完打开一次,资产 warm 跑完);此后离线可玩,在线时每次
启动后台追平最新版(TWA 更新节奏=次启,不同于 AWebView 的整包重装)。

## 与已退役 AWebView 壳的关系

| | TWA(本工程) | android-shell(退役) |
|---|---|---|
| 渲染 | Chrome 本体(最快路径) | System WebView(慢一档) |
| 体积 | ~2MB | 450MB |
| 离线 | 首启联网预热后 | 开箱即玩 |
| 更新 | 网页即发,次启生效 | 重出 APK |

## 验证面

- `aapt dump badging`:包名 com.vinlic.sandboxworld.twa、minSdk 26;
- 启动后 `chrome://inspect` 里该页面应显示为 CustomTab 会话;
- 断网重启 app 能进壳页=sw-twa.js 生效;console 过滤 `[sw]`/`[Renderer]` 取证。
