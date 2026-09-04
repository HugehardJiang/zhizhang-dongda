plugins {
    id("com.android.application")
}

android {
    namespace = "cn.neu.zhizhangdongda"
    compileSdk = 35

    defaultConfig {
        applicationId = "cn.neu.zhizhangdongda"
        minSdk = 24
        targetSdk = 35
        versionCode = 76
        versionName = "0.1.76"
    }

    buildTypes {
        release {
            // 本项目此前发布的可安装包始终沿用 Android 默认 debug 证书；
            // 明确绑定它，避免 assembleRelease 只产出未签名 APK。后续若迁移
            // 到独立发布证书，应在同一次主版本迁移中处理签名升级路径。
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets {
        getByName("main") {
            assets.srcDir(layout.buildDirectory.dir("generated/web-assets"))
        }
    }

    // 微信、文件管理器和用户手动安装时都能直接看到版本，避免多个
    // app-debug.apk 被同名覆盖或误选旧包。
    applicationVariants.all {
        val variantVersionName = versionName ?: "unknown"
        val variantBuildType = buildType.name
        outputs.all {
            val output = this as com.android.build.gradle.internal.api.BaseVariantOutputImpl
            output.outputFileName = "执掌东大-Android-${variantVersionName}-${variantBuildType}.apk"
        }
    }
}

val syncWebAssets = tasks.register<Copy>("syncWebAssets") {
    from(projectDir.resolve("../../dashboard.html"))
    from(projectDir.resolve("../../dashboard.css"))
    from(projectDir.resolve("../../dashboard.js"))
    from(projectDir.resolve("../../vendor")) {
        into("vendor")
    }
    into(layout.buildDirectory.dir("generated/web-assets"))
}

tasks.named("preBuild").configure {
    dependsOn(syncWebAssets)
}
