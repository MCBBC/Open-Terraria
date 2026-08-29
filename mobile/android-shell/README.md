# SandboxWorld Android 壳(离线安装包)

> **★2026-08-30 DEPRECATED**:用户定盘切 TWA 路线(Chrome 本体渲染,见
> `game/mobile/twa/README.md`),本壳(System WebView 离线包)退役封存不再维护。
> v1.0.1 包与 releases/ 归档仍在,可继续用作"完全离线兜底";重出包需先在
> game/ 下 vite build 并 sync-dist。历史价值:三件套调参/打包链/构建坑实录。

> 路径约定(学 `game/desktop` 惯例):本工程住 `game/mobile/android-shell`,构建一律
> 在**本目录**执行(`gradle assembleRelease`);shell 会话 cwd 常漂移到 game/ 根导致
> "does not contain a Gradle build"——命令行里显式 cd 到这里。dist 剪枝用
> `./sync-dist.sh`(锚自身路径,免 cwd 依赖)。

**形态 = D-AWebView**:game/dist 剪枝后整体打入 APK(`app/src/main/assets/`),
经 `WebViewAssetLoader "/"` 映射到 `https://appassets.androidplatform.net/`,
装上即玩、零网络依赖(联机模块除外)。这是辩论终审(2026-08-28)中 TWA 之外的
第二 Android 形态——因用户需求「真离线安装包」而转正;TWA(web 托管小壳)
降级为备选,见 `mobile/twa/README.md`。

## 构建

```sh
# 0. 工具链(一次性):brew install openjdk@17 gradle android-commandlinetools
#    SDK 组件:sdkmanager --sdk_root=$HOME/Library/Android/sdk 装
#    platform-tools + platforms;android-34 + build-tools;34.0.0

# 1. 同步 dist(每次前端构建后重跑;剔除 assets-zip,见脚本头注)
./sync-dist.sh                       # 当前 ~477MB

# 2. 构建(debug=可 chrome://inspect;release=自签分发件)
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=$HOME/Library/Android/sdk
gradle assembleRelease               # 产物: app/build/outputs/apk/release/app-release.apk

# 3. 安装
adb install -r app/build/outputs/apk/release/app-release.apk
```

## 壳义务清单(辩论终审裁定继承项)

| 项 | 落点 |
|---|---|
| setRendererPriorityPolicy(IMPORTANT,false) | MainActivity 三件套 #1 |
| largeHeap | AndroidManifest |
| onRenderProcessGone 自愈 recreate | MainActivity 三件套 #3(jetsam 白屏 UX 债务承接位) |
| sensorLandscape 锁横屏 | AndroidManifest |
| sticky immersive 全屏 | MainActivity |
| 存档面 | DOM storage → /data/data/com.vinlic.sandboxworld(app 卸载即清,iOS PWA 双轨互不相通属预期) |
| 探针接线 | debug 包 chrome://inspect → `_cpu-flame-probe.mjs SW_CDP=<ws>` |

## 关键设计注记

1. **?nosw 进包决策**:START_URL 带 `?nosw` → AssetCache/SW 流水线(q.has('nosw')
   条件门既有)整体短路。包内资产 fetch 即时命中 assetloader,zip 解压链跑一遍纯属浪费,
   且被剔除的 assets-zip 若触发 fetch 失败会踩 failed 负缓存→整场合成兜底的历史坑。
2. **dist 必须映射 origin 根**:vite base='/' 绝对路径产物挂任何子路径都会断链,
   故 assets 内容平铺为 APK assets 根(sync-dist.sh 头注)。
3. **noCompress 清单**:png/wav/ogg/json… 禁二次 deflate(aaptOptions),省构建时间
   与运行内存峰值(jetsam ~384MB 软限敏感项)。
4. **签名**:keystore/sw.jks 自签(store/key 密码占位 sandboxworld2026,**首发后换掉**)。
   keystore 一旦用于发布版本,后续升级必须同 key——备份到安全位置。

## 性能回归诊断(v1.0.1 起 release 也开调试口)

已知两条**静默降级门**(game/src/render/Renderer.ts):
- `Renderer.ts:2123` GPU 熔断门:auto 模式下 60s 内第 2 次 WebGL context lost
  → 自动切 **CPU 软渲染**(console.warn `[Renderer] GPU 连续崩溃 → 自动切换`);
- `Renderer.ts:2233` 主画布看门狗:重建后三连死 → willReadFrequently **软件光栅化**。
二者在 Chrome 里同样存在但触发率远低(Chrome GPU 进程预算宽松、无 jetsam 紧压);
它们只留 console.warn,不开调试口就无法真机取证。

**取证三步**(v1.0.1 起 release 常开 `setWebContentsDebuggingEnabled(true)`):

```sh
# 1. 手机开发者模式+USB 调试连电脑后:
adb devices && adb shell pidof com.vinlic.sandboxworld   # 记下 pid

# 2. 电脑 Chrome 开 chrome://inspect → Remote Target 里出现 SandboxWorld 页 → Inspect
#    Console 过滤 [Renderer]:看有无「自动切换 CPU 软渲染」「GPU 压力熔断」;
#    同页 console 跑:location.search 应含 ?nosw;(performance as any).memory 观察
#    usedJSHeapSize 是否逼近上限;UA 中 AppleWebKit 后的 Chrome/x.y.z.w 即 WebView 版本

# 3. CLI flame(可选):adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
#    再按 game/scripts/_cpu-flame-probe.mjs 头注走 SW_CDP 接线跑巡游采样
```

另查一项常见元凶:Google Play 里搜 "Android System WebView" 并更新到最新
(老设备上 WebView 常落后 Chrome App 十几个大版本,性能差距远超架构税本身)。

## 常见坑

- **gradle 版本 × AGP 钉点**:build.gradle.kts 根插件 AGP 8.6.1/Kotlin 2.0.20 与
  brew gradle 9.x 可能不兼容(AGP 每版有 gradle 上限)。报 plugin 不兼容时:
  `gradle wrapper --gradle-version 8.9` 生成 wrapper 后改用 ./gradlew。
- **JAVA_HOME 必须 openjdk@17**(AGP 8.x 要求 JDK17);系统 /usr/bin/java 无 runtime 会炸。
- sdkmanager 直呼 brew 的 cmdline-tools 时必须 `--sdk_root=$(HOME)/Library/Android/sdk`。
- 首次构建 gradle 拉 AGP/Kotlin 插件走 google() mavenCentral,网络慢时耐心或代理。

## 版本记录

- 2026-08-29 v1.0.0(versionCode 1):首版离线壳,dist 剪枝 477MB。
  产物 `releases/2026-08-29-v1.0.0/SandboxWorld-v1.0.0-arm64-release.apk`(450MB,
  sha256 见同目录 SHA256SUMS.txt);aapt 校验:资产 477MB 全量入包(assets-zip=0
  条目)、音频 969 条、minSdk 26/targetSdk 34、锁 sensorLandscape。
  构建链:AGP 8.6.1 + Kotlin 2.0.20 + gradle 8.9(~/tools)+ JDK17 Temurin(~/tools)。
  踩坑记录:androidx.webkit 须 gradle.properties `android.useAndroidX=true`;
  AGP 8.x 不生成 BuildConfig(改读 applicationInfo FLAG_DEBUGGABLE)。
