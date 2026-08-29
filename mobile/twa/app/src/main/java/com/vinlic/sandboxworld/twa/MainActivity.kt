// TWA 壳入口:androidbrowserhelper 的 LauncherActivity 全权编排 CustomTabs 可信
// Web Activity(启动/全屏 chrome/身份校验/回退 Custom Tab)。壳自身零逻辑——
// 渲染与进程全归 Chrome 本体,这正是本形态相对 System WebView 的性能来源。
package com.vinlic.sandboxworld.twa

import com.google.androidbrowserhelper.trusted.LauncherActivity

class MainActivity : LauncherActivity()
