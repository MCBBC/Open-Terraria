plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.vinlic.sandboxworld.twa"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.vinlic.sandboxworld.twa"
        // TWA 壳不包资产:页面由 Chrome 以 CustomTabs 会话托管(渲染路径=浏览器本体,
        // 这是与 AWebView 的本质差异)。apk 预期 <3MB。
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        create("release") {
            // 相对 app/ 模块目录:app/ → twa/ → mobile/ → android-shell/keystore
            storeFile = file("../../android-shell/keystore/sw.jks")
            storePassword = "sandboxworld2026"
            keyAlias = "sw"
            keyPassword = "sandboxworld2026"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("release")
        }
        debug { isDebuggable = true }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    lint { abortOnError = false }
}

dependencies {
    // TWA 官方宿主库(LauncherActivity = androidx.browser CustomTabs 的 TWA 编排层):
    // Chrome 本体接管页面渲染与进程,壳只提供启动器入口/全屏 chrome/指纹校验接线
    implementation("androidx.browser:browser:1.8.0")
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
