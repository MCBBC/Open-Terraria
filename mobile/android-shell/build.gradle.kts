// 根构建脚本:AGP/Kotlin 版本钉点(与 brew gradle 版本兼容性见 README 常见坑节)
plugins {
    id("com.android.application") version "8.6.1" apply false
    id("org.jetbrains.kotlin.android") version "2.0.20" apply false
}
