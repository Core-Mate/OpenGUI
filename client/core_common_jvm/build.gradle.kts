plugins {
    id("java-library")
    alias(libs.plugins.jetbrains.kotlin.jvm)
}

java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11
    }
}

dependencies {
    // Add the Gson dependency for @SerializedName annotation
    implementation("com.google.code.gson:gson:2.10.1") // Use the latest stable version if available
    implementation(libs.kotlinx.coroutines.core)
}