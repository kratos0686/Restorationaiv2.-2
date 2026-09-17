package com.restorationai.di

import com.google.firebase.vertexai.FirebaseVertexAI
import com.google.firebase.vertexai.GenerativeModel
import com.google.firebase.vertexai.type.generationConfig
import com.restorationai.BuildConfig
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Named
import javax.inject.Singleton

/**
 * Hilt Module providing Vertex AI (Generative Model) singleton instances configured
 * with the build-time VERTEX_MODEL_NAME constant.
 */
@Module
@InstallIn(SingletonComponent::class)
object VertexAIModule {

    @Provides
    @Singleton
    @Named("VertexModelName")
    fun provideVertexModelName(): String {
        return BuildConfig.VERTEX_MODEL_NAME
    }

    @Provides
    @Singleton
    fun provideFirebaseVertexAI(): FirebaseVertexAI {
        return FirebaseVertexAI.getInstance()
    }

    @Provides
    @Singleton
    fun provideGenerativeModel(
        vertexAI: FirebaseVertexAI,
        @Named("VertexModelName") modelName: String
    ): GenerativeModel {
        val config = generationConfig {
            temperature = 0.2f
            topK = 40
            topP = 0.95f
        }
        return vertexAI.generativeModel(
            modelName = modelName,
            generationConfig = config
        )
    }
}
