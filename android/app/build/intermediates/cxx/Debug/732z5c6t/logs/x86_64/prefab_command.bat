@echo off
"C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java" ^
  --enable-native-access ^
  ALL-UNNAMED ^
  --class-path ^
  "C:\\Users\\Dep-TI\\.gradle\\caches\\modules-2\\files-2.1\\com.google.prefab\\cli\\2.1.0\\aa32fec809c44fa531f01dcfb739b5b3304d3050\\cli-2.1.0-all.jar" ^
  com.google.prefab.cli.AppKt ^
  --build-system ^
  cmake ^
  --platform ^
  android ^
  --abi ^
  x86_64 ^
  --os-version ^
  24 ^
  --stl ^
  c++_shared ^
  --ndk-version ^
  27 ^
  --output ^
  "C:\\Users\\Dep-TI\\AppData\\Local\\Temp\\agp-prefab-staging14848077982667218360\\staged-cli-output" ^
  "C:\\dev\\mobile\\android\\app\\build\\intermediates\\cxx\\refs\\react-native-reanimated\\3k1f4qi3" ^
  "C:\\dev\\mobile\\android\\app\\build\\intermediates\\cxx\\refs\\react-native-worklets\\4r3gs372" ^
  "C:\\Users\\Dep-TI\\.gradle\\caches\\9.4.1\\transforms\\4f806020ff3de8e2d3c29476b7f1d70b\\transformed\\react-android-0.88.0-debug\\prefab" ^
  "C:\\Users\\Dep-TI\\.gradle\\caches\\9.4.1\\transforms\\c55d5111c767af67d25a42cf7eb7300b\\transformed\\kolibri-android-0.2.4\\prefab" ^
  "C:\\Users\\Dep-TI\\.gradle\\caches\\9.4.1\\transforms\\c27f5db0d1faa9522af8bd3700143c76\\transformed\\hermes-android-260318099.0.4-debug\\prefab" ^
  "C:\\Users\\Dep-TI\\.gradle\\caches\\9.4.1\\transforms\\9a7aaffc445f73bf411ce35589ac8a41\\transformed\\fbjni-0.7.0\\prefab"
