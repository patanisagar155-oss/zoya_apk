package com.sagar.zoya.jarvis

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(ZoyaAndroidPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
