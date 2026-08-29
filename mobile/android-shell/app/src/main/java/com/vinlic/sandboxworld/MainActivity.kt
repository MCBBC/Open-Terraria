// SandboxWorld Android 壳:最小 WebView 容器(<200 行哲学,见 mobile/ios-shell 对应件)。
// 形态=D-AWebView(离线安装包):game/dist 剪枝后整体打入 APK assets。
//
// 三件套转正(辩论终审 A-E1,随形态切换启用):
//   1. setRendererPriorityPolicy(IMPORTANT,false) —— 低内存拒杀渲染进程
//   2. largeHeap(manifest) —— 世界烘焙/图集驻留预算
//   3. onRenderProcessGone 自愈重建 —— jetsam 白屏的进程级恢复债务归本壳承接
// 加载入口带 ?nosw:包内资产 fetch 即时命中,AssetCache/SW 流水线(q.has('nosw')
// 已有条件门)整体短路,zip 解压链与 404 负缓存坑一并消失。
package com.vinlic.sandboxworld

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

class MainActivity : Activity() {

    companion object {
        // ★vite base='/' 的绝对路径产物必须占据 origin 根(见 build.gradle.kts 资产面注)
        const val HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$HOST/index.html?nosw"
    }

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        webView.setBackgroundColor(0xFF0A0C10.toInt())
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true          // localStorage/settings 存档面
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            textZoom = 100                    // 钉死系统字体缩放,防 UI 几何漂移
            allowFileAccess = false           // 一切经 https assetloader,收缩攻击面
            useWideViewPort = false
            loadWithOverviewMode = false
        }

        // —— 三件套 #1:渲染进程保活(Chromium 承认 WebView 合成路径更慢的第一个官方缓解位)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, /*sacrificeOnLowMemory=*/false)
        }

        // ★自用直装策略:v1.0.1 起 release 也常开 chrome://inspect 远程调试。
        //   理由:壳内有两条静默降级门(GPU 熔断→CPU 软渲染/主画布三连死→
        //   willReadFrequently 软光栅化),触发后仅留 console.warn——不开 debugging
        //   就永远无法真机取证(v1.0.0 卡顿反馈无证据链的直接教训)。
        //   副作用=检查者可连调试口;上架商店前必须收回为 DEBUG-only。
        WebView.setWebContentsDebuggingEnabled(true)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            // 外域链接一律抛给系统浏览器处理(游戏本身无外跳,保守拦截)
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.scheme == "https" && u.host == HOST) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, u)) }
                return true
            }

            // —— 三件套 #3:渲染进程被杀自愈。jetsam 白屏的 UX 债务按终审裁定由壳方承接;
            //    recreate 全新实例替代 webview.reload()(gone 进程 reload 不可靠)。
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                recreate()
                return true
            }
        }

        setContentView(webView)
        enterImmersive()
        webView.loadUrl(START_URL)
    }

    // sticky immersive:一次声明常隐,滑出自动回落
    private fun enterImmersive() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersive()
    }

    // 游戏 SPA 无历史语义:返回键一律退到后台而非销毁 webview 进程栈
    @Deprecated("Deprecated in Java")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        moveTaskToBack(true)
    }

    override fun onDestroy() {
        // 防 webview 泄漏(Activity 销毁期 detached 回调竞态见 embrace.io 案例)
        webView.parent?.let { (it as ViewGroup).removeView(webView) }
        webView.destroy()
        super.onDestroy()
    }
}
