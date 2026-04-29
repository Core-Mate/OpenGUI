package com.coremate.opengui.feature.promotor.sdk

import com.google.gson.Gson
import com.coremate.opengui.common.utils.AndroidLogger
import com.coremate.opengui.common_jvm.utils.Logger
import okhttp3.OkHttpClient
import okhttp3.Request
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object VolcanoTokenManager {

    private val logger: Logger = AndroidLogger()
    private val client = OkHttpClient()
    private val gson = Gson()

    private const val SERVICE = "iam"
    private const val REGION = "cn-north-1"
    private const val HOST = "open.volcengine.com"
    private const val ALGORITHM = "HMAC-SHA256"

    private data class TokenResponse(val result: Result?)
    private data class Result(val accessToken: String, val expiredTime: Long)

    suspend fun generateToken(accessKey: String, secretKey: String): String? {
        val sdf = SimpleDateFormat("yyyyMMdd'T'HHmmss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        val amzDate = sdf.format(Date())
        val dateStamp = amzDate.substring(0, 8)

        val canonicalQueryString = "Action=GetToken&Version=2021-01-01"
        val canonicalHeaders = "host:$HOST\nx-amz-date:$amzDate\n"
        val signedHeaders = "host;x-amz-date"
        val hashedPayload = sha256Hex("") // GET requests use an empty payload string.

        val canonicalRequest = "GET\n/\n$canonicalQueryString\n$canonicalHeaders\n$signedHeaders\n$hashedPayload"
        val hashedCanonicalRequest = sha256Hex(canonicalRequest)

        val credentialScope = "$dateStamp/$REGION/$SERVICE/request"
        val stringToSign = "$ALGORITHM\n$amzDate\n$credentialScope\n$hashedCanonicalRequest"

        val signingKey = getSignatureKey(secretKey, dateStamp, REGION, SERVICE)
        val signature = hmacSha256Hex(signingKey, stringToSign)

        val authorizationHeader = "$ALGORITHM Credential=$accessKey/$credentialScope, SignedHeaders=$signedHeaders, Signature=$signature"
        val requestUrl = "https://$HOST/?$canonicalQueryString"

        val request = Request.Builder()
            .url(requestUrl)
            .header("Authorization", authorizationHeader)
            .header("X-Amz-Date", amzDate)
            .build()

        return try {
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) {
                logger.error("TokenManager", "Get token failed with code: ${response.code} and body: ${response.body?.string()}")
                return null
            }
            val responseBody = response.body?.string()
            logger.info("TokenManager", "Get token response: $responseBody")
            val tokenResponse = gson.fromJson(responseBody, TokenResponse::class.java)
            tokenResponse.result?.accessToken
        } catch (e: Exception) {
            logger.error("TokenManager", "Exception while getting token", e)
            null
        }
    }

    private fun sha256Hex(text: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(text.toByteArray(StandardCharsets.UTF_8))
        return hash.joinToString("") { "%02x".format(it) }
    }

    private fun hmacSha256(key: ByteArray, msg: String): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(msg.toByteArray(StandardCharsets.UTF_8))
    }

    private fun hmacSha256Hex(key: ByteArray, msg: String): String {
        return hmacSha256(key, msg).joinToString("") { "%02x".format(it) }
    }

    private fun getSignatureKey(key: String, dateStamp: String, regionName: String, serviceName: String): ByteArray {
        val kSecret = ("VOLC" + key).toByteArray(StandardCharsets.UTF_8)
        val kDate = hmacSha256(kSecret, dateStamp)
        val kRegion = hmacSha256(kDate, regionName)
        val kService = hmacSha256(kRegion, serviceName)
        return hmacSha256(kService, "request")
    }
}
