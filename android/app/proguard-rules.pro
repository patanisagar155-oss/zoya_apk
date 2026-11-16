# Capacitor & ZoyaAndroidPlugin ProGuard rules
-keep class com.sagar.zoya.jarvis.** { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}
