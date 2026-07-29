package com.warehouseos.operator.di

import com.warehouseos.operator.data.speech.AndroidSttProvider
import com.warehouseos.operator.data.speech.SpeechToTextProvider
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Speech engine wiring (Epic 6). The whole app depends on [SpeechToTextProvider];
 * to move to an offline Vosk engine later, change only this binding.
 */
@Module
@InstallIn(SingletonComponent::class)
object SpeechModule {

    @Provides
    @Singleton
    fun provideSpeechToText(impl: AndroidSttProvider): SpeechToTextProvider = impl
}
