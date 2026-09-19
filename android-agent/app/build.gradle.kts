plugins {
    id("com.android.application")
}

val twaHost = (findProperty("twa.host") as String?)?.trim().orEmpty()
    .ifEmpty { "sorappscrm.vercel.app" }
val twaLaunchPath = (findProperty("twa.launchPath") as String?)?.trim().orEmpty()
    .ifEmpty { "/login" }
    .let { path -> if (path.startsWith("/")) path else "/$path" }
val twaDefaultUrl = "https://$twaHost$twaLaunchPath"

android {
    namespace = "com.sorapps.agent"
    compileSdk = 36
    buildToolsVersion = "36.0.0"
    setProperty("archivesBaseName", "Sorappscrm")

    defaultConfig {
        applicationId = "com.sorapps.agent"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        manifestPlaceholders["hostName"] = twaHost
        manifestPlaceholders["defaultUrl"] = twaDefaultUrl
        manifestPlaceholders["launchPath"] = twaLaunchPath
        resValue(
            "string",
            "assetStatements",
            """[{ "relation": ["delegate_permission/common.handle_all_urls"], "target": { "namespace": "web", "site": "https://$twaHost" } }]""",
        )
    }

    signingConfigs {
        create("sideload") {
            storeFile = rootProject.file("keystore/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
            storeType = "pkcs12"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("sideload")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("sideload")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = false
    }

    applicationVariants.configureEach {
        outputs.configureEach {
            (this as com.android.build.gradle.internal.api.ApkVariantOutputImpl)
                .outputFileName = "Sorappscrm.apk"
        }
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.3")
    implementation("com.google.androidbrowserhelper:locationdelegation:1.1.2")
}
