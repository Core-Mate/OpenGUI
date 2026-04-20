plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.coremate.opengui.network"
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
        buildConfig = true
    }
}

dependencies {

    implementation(platform("com.squareup.okhttp3:okhttp-bom:4.12.0"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)

    api(libs.socketio.client) {
        exclude(group = "com.squareup.okhttp3", module = "okhttp")
    }

    implementation(libs.okhttp)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.retrofit.core) {
        exclude(group = "com.squareup.okhttp3")
    }
    implementation(libs.retrofit.converter.gson) {
        exclude(group = "com.squareup.okhttp3")
    }
    implementation(libs.gson)

//    implementation(libs.cozeApi) {
//        exclude(group = "com.squareup.okhttp3", module = "okhttp")
//    }

    implementation(libs.okhttp)
    implementation(libs.okhttp.sse)

    implementation(project(":core_common"))
    implementation(project(":core_common_jvm"))
    implementation(libs.kotlinx.coroutines.rx2)

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    implementation(libs.mmkv)
}