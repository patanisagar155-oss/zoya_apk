package com.sagar.zoya.jarvis

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.view.accessibility.AccessibilityEvent

class ZoyaAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: ZoyaAccessibilityService? = null
            private set
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Passive listener: ZOYA never reads screen text or performs unrequested background automation.
    }

    override fun onInterrupt() {
        // Required override
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance === this) {
            instance = null
        }
    }

    fun performRequestedGlobalAction(actionName: String): Boolean {
        val prefs = getSharedPreferences("zoya_native_prefs", Context.MODE_PRIVATE)
        val explicitConsent = prefs.getBoolean("accessibility_consent_granted", false)
        if (!explicitConsent) {
            return false
        }

        return when (actionName.lowercase()) {
            "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
            "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
            "recents" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
            "notifications" -> performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
            else -> false
        }
    }
}
