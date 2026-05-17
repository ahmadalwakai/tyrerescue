# ProGuard rules for admin-alert-android
# Keep Firebase classes
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Keep app entry points
-keep class uk.tyrerescue.adminalert.** { *; }
