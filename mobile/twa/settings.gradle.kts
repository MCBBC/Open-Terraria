pluginManagement {
    repositories {
        // 阿里云镜像前置(dl.google.com TLS 握手间歇被断,2026-08-30 实录);原始仓兜底
        maven("https://maven.aliyun.com/repository/google")
        maven("https://maven.aliyun.com/repository/central")
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven("https://maven.aliyun.com/repository/google")
        maven("https://maven.aliyun.com/repository/central")
        google()
        mavenCentral()
    }
}
rootProject.name = "SandboxWorldTWA"
include(":app")
