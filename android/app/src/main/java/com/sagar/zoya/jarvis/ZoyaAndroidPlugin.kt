package com.sagar.zoya.jarvis

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.net.Uri
import android.provider.AlarmClock
import android.provider.MediaStore
import android.provider.Settings
import android.app.Activity
import android.graphics.Bitmap
import android.util.Base64
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.ByteArrayOutputStream

@CapacitorPlugin(
    name = "ZoyaAndroid",
    permissions = [
        Permission(
            alias = "microphone",
            strings = [Manifest.permission.RECORD_AUDIO]
        ),
        Permission(
            alias = "camera",
            strings = [Manifest.permission.CAMERA]
        )
    ]
)
class ZoyaAndroidPlugin : Plugin() {

    private val prefsName = "zoya_native_prefs"
    private val consentKey = "accessibility_consent_granted"

    @PluginMethod
    fun launchApp(call: PluginCall) {
        val packageName = call.getString("packageName") ?: ""
        val appName = call.getString("appName") ?: packageName

        if (packageName.isBlank()) {
            call.reject("Package name is required to launch an Android app.")
            return
        }

        try {
            val pm = context.packageManager
            val launchIntent = pm.getLaunchIntentForPackage(packageName)
            if (launchIntent == null) {
                val res = JSObject().apply {
                    put("success", false)
                    put("executedOn", "android_native")
                    put("message", "$appName ($packageName) is not installed on this device.")
                }
                call.resolve(res)
                return
            }

            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(launchIntent)

            val res = JSObject().apply {
                put("success", true)
                put("executedOn", "android_native")
                put("message", "Opened $appName on Android.")
            }
            call.resolve(res)
        } catch (e: Exception) {
            call.reject("Failed to launch $appName: ${e.localizedMessage}")
        }
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        val settingType = (call.getString("settingType") ?: "application").lowercase()

        val action = when (settingType) {
            "wifi" -> Settings.ACTION_WIFI_SETTINGS
            "bluetooth" -> Settings.ACTION_BLUETOOTH_SETTINGS
            "display" -> Settings.ACTION_DISPLAY_SETTINGS
            "location" -> Settings.ACTION_LOCATION_SOURCE_SETTINGS
            "sound" -> Settings.ACTION_SOUND_SETTINGS
            "battery" -> Settings.ACTION_BATTERY_SAVER_SETTINGS
            "application" -> Settings.ACTION_APPLICATION_SETTINGS
            "accessibility" -> Settings.ACTION_ACCESSIBILITY_SETTINGS
            else -> Settings.ACTION_SETTINGS
        }

        try {
            val intent = Intent(action).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)

            val res = JSObject().apply {
                put("success", true)
                put("executedOn", "android_native")
                put("message", "Opened Android $settingType settings.")
            }
            call.resolve(res)
        } catch (e: Exception) {
            // Fallback to general device settings if OEM lacks a specific sub-panel
            try {
                val fallback = Intent(Settings.ACTION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(fallback)
                val res = JSObject().apply {
                    put("success", true)
                    put("executedOn", "android_native")
                    put("message", "Opened main Android settings (OEM fallback for $settingType).")
                }
                call.resolve(res)
            } catch (inner: Exception) {
                call.reject("Unable to open settings: ${inner.localizedMessage}")
            }
        }
    }

    @PluginMethod
    fun executeSystemAction(call: PluginCall) {
        val actionType = (call.getString("actionType") ?: "").lowercase()
        val target = call.getString("target") ?: ""

        try {
            when (actionType) {
                "dial" -> {
                    val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$target")).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                }
                "share" -> {
                    val sendIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, target)
                    }
                    val chooser = Intent.createChooser(sendIntent, "Share via ZOYA").apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(chooser)
                }
                "timer" -> {
                    val seconds = target.toIntOrNull() ?: 60
                    val intent = Intent(AlarmClock.ACTION_SET_TIMER).apply {
                        putExtra(AlarmClock.EXTRA_LENGTH, seconds)
                        putExtra(AlarmClock.EXTRA_SKIP_UI, false)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                }
                "alarm" -> {
                    val timeMatch = Regex("""(\d{1,2}):(\d{2})""").find(target)
                    val intent = if (timeMatch != null) {
                        val hour = timeMatch.groupValues[1].toIntOrNull()?.coerceIn(0, 23) ?: 7
                        val minute = timeMatch.groupValues[2].toIntOrNull()?.coerceIn(0, 59) ?: 0
                        Intent(AlarmClock.ACTION_SET_ALARM).apply {
                            putExtra(AlarmClock.EXTRA_HOUR, hour)
                            putExtra(AlarmClock.EXTRA_MINUTES, minute)
                            putExtra(AlarmClock.EXTRA_SKIP_UI, false)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                    } else {
                        Intent(AlarmClock.ACTION_SHOW_ALARMS).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                    }
                    context.startActivity(intent)
                }
                "camera" -> {
                    val intent = Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                }
                "accessibility_global" -> {
                    val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
                    val consented = prefs.getBoolean(consentKey, false)
                    val service = ZoyaAccessibilityService.instance
                    if (!consented || service == null) {
                        val res = JSObject().apply {
                            put("success", false)
                            put("executedOn", "android_native")
                            put("requiresPermission", "accessibility")
                            put("message", "Explicit accessibility consent and system service activation are required.")
                        }
                        call.resolve(res)
                        return
                    }
                    val performed = service.performRequestedGlobalAction(target)
                    val res = JSObject().apply {
                        put("success", performed)
                        put("executedOn", "android_native")
                        put("message", if (performed) "Executed accessibility action: $target" else "Unsupported global action: $target")
                    }
                    call.resolve(res)
                    return
                }
                else -> {
                    val res = JSObject().apply {
                        put("success", false)
                        put("executedOn", "android_native")
                        put("message", "Action '$actionType' is not supported by ZOYA Android bridge.")
                    }
                    call.resolve(res)
                    return
                }
            }

            val res = JSObject().apply {
                put("success", true)
                put("executedOn", "android_native")
                put("message", "Executed Android intent for $actionType.")
            }
            call.resolve(res)
        } catch (e: Exception) {
            call.reject("Android system action failed: ${e.localizedMessage}")
        }
    }

    @PluginMethod
    fun checkPermissions(call: PluginCall) {
        val micGranted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        val micStatus = if (micGranted) {
            "granted"
        } else if (getPermissionState("microphone") == PermissionState.DENIED) {
            "denied"
        } else {
            "prompt"
        }

        val camGranted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED

        val camStatus = if (camGranted) {
            "granted"
        } else if (getPermissionState("camera") == PermissionState.DENIED) {
            "denied"
        } else {
            "prompt"
        }

        val res = JSObject().apply {
            put("microphone", micStatus)
            put("camera", camStatus)
            put("accessibilityEnabled", ZoyaAccessibilityService.instance != null)
        }
        call.resolve(res)
    }

    @PluginMethod
    fun requestMicrophonePermission(call: PluginCall) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        requestPermissionForAlias("microphone", call, "microphonePermissionCallback")
    }

    @PermissionCallback
    private fun microphonePermissionCallback(call: PluginCall) {
        val granted = getPermissionState("microphone") == PermissionState.GRANTED
        call.resolve(JSObject().put("granted", granted))
    }

    @PluginMethod
    fun requestCameraPermission(call: PluginCall) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        requestPermissionForAlias("camera", call, "cameraPermissionCallback")
    }

    @PermissionCallback
    private fun cameraPermissionCallback(call: PluginCall) {
        val granted = getPermissionState("camera") == PermissionState.GRANTED
        call.resolve(JSObject().put("granted", granted))
    }

    @PluginMethod
    fun captureNativeCameraPhoto(call: PluginCall) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "captureCameraPermissionCallback")
            return
        }
        launchNativeCameraIntent(call)
    }

    @PermissionCallback
    private fun captureCameraPermissionCallback(call: PluginCall) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            launchNativeCameraIntent(call)
        } else {
            call.resolve(
                JSObject().apply {
                    put("success", false)
                    put("executedOn", "android_native")
                    put("message", "Camera permission was denied on Android.")
                }
            )
        }
    }

    private fun launchNativeCameraIntent(call: PluginCall) {
        val facing = (call.getString("facing") ?: "back").lowercase()
        try {
            val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                if (facing == "front") {
                    putExtra("android.intent.extras.CAMERA_FACING", 1)
                    putExtra("android.intent.extras.LENS_FACING_FRONT", 1)
                    putExtra("android.intent.extra.USE_FRONT_CAMERA", true)
                } else {
                    putExtra("android.intent.extras.CAMERA_FACING", 0)
                    putExtra("android.intent.extras.LENS_FACING_FRONT", 0)
                    putExtra("android.intent.extra.USE_FRONT_CAMERA", false)
                }
            }
            startActivityForResult(call, intent, "nativeCameraResult")
        } catch (e: Exception) {
            call.reject("Unable to launch Android camera: ${e.localizedMessage}")
        }
    }

    @ActivityCallback
    private fun nativeCameraResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK) {
            call.resolve(
                JSObject().apply {
                    put("success", false)
                    put("executedOn", "android_native")
                    put("message", "Camera capture was cancelled.")
                }
            )
            return
        }

        val bitmap = result.data?.extras?.get("data") as? Bitmap
        if (bitmap == null) {
            call.resolve(
                JSObject().apply {
                    put("success", false)
                    put("executedOn", "android_native")
                    put("message", "Android camera did not return an image frame.")
                }
            )
            return
        }

        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
        val base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        call.resolve(
            JSObject().apply {
                put("success", true)
                put("executedOn", "android_native")
                put("imageBase64", base64)
                put("mimeType", "image/jpeg")
                put("message", "Captured frame via Android camera.")
            }
        )
    }

    @PluginMethod
    fun setAccessibilityConsent(call: PluginCall) {
        val granted = call.getBoolean("granted") ?: false
        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        prefs.edit().putBoolean(consentKey, granted).apply()
        call.resolve(JSObject().put("saved", true))
    }

    @PluginMethod
    fun openAccessibilitySettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve(
                JSObject().apply {
                    put("success", true)
                    put("executedOn", "android_native")
                    put("message", "Opened Android Accessibility settings for Sagar's explicit approval.")
                }
            )
        } catch (e: Exception) {
            call.reject("Could not open Accessibility settings: ${e.localizedMessage}")
        }
    }

    @PluginMethod
    fun toggleTorch(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        try {
            val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = cameraManager.cameraIdList.firstOrNull { id ->
                val chars = cameraManager.getCameraCharacteristics(id)
                chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            }
            if (cameraId == null) {
                call.resolve(
                    JSObject().apply {
                        put("success", false)
                        put("executedOn", "android_native")
                        put("message", "No camera flash hardware found on this Android device.")
                    }
                )
                return
            }
            cameraManager.setTorchMode(cameraId, enabled)
            call.resolve(
                JSObject().apply {
                    put("success", true)
                    put("executedOn", "android_native")
                    put("message", if (enabled) "Flashlight turned ON." else "Flashlight turned OFF.")
                }
            )
        } catch (e: Exception) {
            call.reject("Torch toggle failed: ${e.localizedMessage}")
        }
    }
}
