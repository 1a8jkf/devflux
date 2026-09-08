package com.marcos.devflux

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DevFluxModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String {
        return "DevFluxForeground"
    }

    @ReactMethod
    fun startService() {
        try {
            val intent = Intent(reactApplicationContext, DevFluxService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @ReactMethod
    fun stopService() {
        try {
            val intent = Intent(reactApplicationContext, DevFluxService::class.java)
            reactApplicationContext.stopService(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
