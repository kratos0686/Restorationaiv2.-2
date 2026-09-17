package com.restorationai

import android.app.Application
import android.util.Log
import com.google.firebase.FirebaseApp
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Base Application class for Restoration-AI Android project.
 * Annotated with @HiltAndroidApp to trigger Hilt's code generation.
 * Handles initial setup of Firebase and Vertex AI using a thread-safe singleton pattern.
 */
@HiltAndroidApp
class RestorationApplication : Application() {

    companion object {
        private const val TAG = "RestorationApplication"

        @Volatile
        private var instance: RestorationApplication? = null

        /**
         * Singleton accessor for Application instance if needed outside DI container.
         */
        fun getInstance(): RestorationApplication {
            return instance ?: synchronized(this) {
                instance ?: throw IllegalStateException("Application has not been initialized yet.")
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        synchronized(RestorationApplication::class.java) {
            instance = this
        }

        initializeFirebase()
        Log.i(TAG, "RestorationApplication initialized with Vertex AI Model: ${BuildConfig.VERTEX_MODEL_NAME}")
    }

    /**
     * Ensures Firebase is initialized once using a thread-safe singleton pattern.
     */
    private fun initializeFirebase() {
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseApp.initializeApp(this)
                Log.d(TAG, "Firebase initialized successfully.")
            } else {
                Log.d(TAG, "Firebase already initialized.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize Firebase SDK", e)
        }
    }
}
