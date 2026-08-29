plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.vinlic.sandboxworld"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.vinlic.sandboxworld"
        minSdk = 26           // setRendererPriorityPolicy 恰需 O(API 26)
        targetSdk = 34
        versionCode = 2
        versionName = "1.0.1"
    }

    signingConfigs {
        create("release") {
            storeFile = file("../keystore/sw.jks")
            storePassword = "sandboxworld2026"
            keyAlias = "sw"
            keyPassword = "sandboxworld2026"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false   // 单 Activity 壳无混淆收益
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            // debug 构建默认可 chrome://inspect 远程调试(release 关闭)
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // ★资产面:game/dist 剪枝(sync-dist.sh)平铺进 src/main/assets(即 APK assets 根,
    //   经 WebViewAssetLoader "/" 映射到 https://appassets.androidplatform.net/ ——
    //   dist 为 vite base:'/' 绝对路径产物,/sprites/... 必须落在 origin 根才可达);
    //   已压缩格式(png/ogg…)禁二次 deflate——省构建 CPU 与运行内存峰值(jetsam 敏感项)。
    androidResources {
        noCompress += listOf("png", "jpg", "wav", "ogg", "mp3", "zip", "json", "webp", "sbw", "html", "js", "css", "woff", "woff2", "atlas")
    }
    lint { abortOnError = false }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
