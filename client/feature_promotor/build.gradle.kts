plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.coremate.opengui.feature.promotor"
    compileSdk = 35

    defaultConfig {
        minSdk = 24

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        viewBinding = true
    }
}

dependencies {

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)

    implementation(libs.androidx.fragment.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.gson)
    implementation(libs.androidx.recyclerview)

    implementation(libs.androidx.cardview)
    implementation(libs.androidx.constraintlayout)
    implementation(libs.kotlin.reflect)
    implementation(libs.retrofit.core)

    implementation(project(":core_common"))
    implementation(project(":core_network"))
    implementation(project(":core_aop"))
    implementation(project(":core_common_jvm"))
    implementation(project(":core_accessibility"))
    implementation(project(":automation"))
    implementation(libs.androidx.activity)

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)

    ksp(project(":core_aop"))
    ksp("androidx.room:room-compiler:2.6.1")

    implementation("com.bytedance.boringssl.so:boringssl-so:1.3.7-16kb")
    implementation("org.chromium.net:cronet:4.2.210.4-tob") {
        exclude(group = "com.bytedance.common", module = "wschannel")
    }
    implementation("com.bytedance.frameworks.baselib:ttnet:4.2.210.4-tob")
    implementation("com.bytedance.speechengine:speechengine_tob:0.0.8.1-bugfix")

    //lottie
    api("com.airbnb.android:lottie:6.6.7")

    implementation("com.github.Dimezis:BlurView:version-3.1.0")

    implementation("com.github.PhilJay:MPAndroidChart:v3.1.0")

    implementation("me.codeboy.android:align-text-view:2.3.2")

    api("com.tencent:mmkv:2.2.4")

    implementation("com.github.DylanCaiCoding.ViewBindingKTX:viewbinding-ktx:2.0.6")
    implementation("com.github.DylanCaiCoding.ViewBindingKTX:viewbinding-nonreflection-ktx:2.0.6")
    implementation("com.github.DylanCaiCoding.ViewBindingKTX:viewbinding-base:2.0.6")
    implementation("com.github.DylanCaiCoding.ViewBindingKTX:viewbinding-brvah:2.0.6")
    implementation("io.noties.markwon:core:4.6.2")
    implementation("com.google.android.material:material:1.12.0")

// Markwon 核心库
    implementation("io.noties.markwon:core:4.6.2"){
        exclude(group = "org.jetbrains", module = "annotations")
        exclude(group = "org.jetbrains", module = "annotations-java5")
    }

    implementation("io.noties.markwon:syntax-highlight:4.6.2"){
        exclude(group = "org.jetbrains", module = "annotations")
        exclude(group = "org.jetbrains", module = "annotations-java5")
    }

    implementation("io.noties.markwon:html:4.6.2"){
        exclude(group = "org.jetbrains", module = "annotations")
        exclude(group = "org.jetbrains", module = "annotations-java5")
    }

    implementation("io.noties.markwon:ext-latex:4.6.2") // 数学公式支持
    implementation("io.noties.markwon:ext-tables:4.6.2") // 表格的使用
    implementation("io.noties.markwon:inline-parser:4.6.2") // 表格的使用
    implementation("io.noties.markwon:linkify:4.6.2")
    implementation("io.noties.markwon:recycler-table:4.6.2")
    implementation("io.noties.markwon:image:4.6.2")
    implementation("io.noties.markwon:ext-tasklist:4.6.2")
    implementation("io.noties.markwon:ext-strikethrough:4.6.2")
    api("com.github.lihangleo2:ShadowLayout:3.4.5")
// 强制使用一个版本的注解库
    implementation("io.noties:prism4j:2.0.0"){
        exclude(group = "org.jetbrains", module = "annotations")
        exclude(group = "org.jetbrains", module = "annotations-java5")
    }

    annotationProcessor ("io.noties:prism4j-bundler:2.0.0")

    implementation("com.github.gzu-liyujiang.AndroidPicker:WheelPicker:4.1.14")

    // 基础依赖包，必须要依赖
    implementation("com.geyifeng.immersionbar:immersionbar:3.2.2")
// kotlin扩展（可选）
    implementation("com.geyifeng.immersionbar:immersionbar-ktx:3.2.2")
// fragment快速实现（可选）已废弃
    implementation("com.geyifeng.immersionbar:immersionbar-components:3.2.2")
}