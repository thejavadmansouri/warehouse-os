# Retrofit + kotlinx.serialization models are referenced reflectively — keep them.
# Full rules are fleshed out in Epic 12; this keeps release builds functional in the meantime.
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response

# Keep @Serializable classes and their generated serializers.
-keepattributes *Annotation*, InnerClasses
-keep,includedescriptorclasses class com.warehouseos.operator.**$$serializer { *; }
-keepclassmembers class com.warehouseos.operator.** {
    *** Companion;
}
-keepclasseswithmembers class com.warehouseos.operator.** {
    kotlinx.serialization.KSerializer serializer(...);
}
