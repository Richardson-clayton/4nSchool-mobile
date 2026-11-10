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
  "C:\\Users\\Dep-TI\\AppData\\Local\\Temp\\agp-prefab-staging6511775725978039891\\staged-cli-output" ^
  "C:\\dev\\4nSchool\\apps\\mobile\\android\\app\\build\\intermediates\\cxx\\refs\\react-native-reanimated\\5p4g474q" ^
  "C:\\dev\\4nSchool\\apps\\mobile\\android\\app\\build\\intermediates\\cxx\\refs\\react-native-worklets\\416n1652" ^
  "C:\\Users\\Dep-TI\\.gradle\\caches\\9.4.1\\transforms\\02c80dc8478c55241bbb5fcc337068d1\\transformed\\react-android-0.88.0-debug\\prefab" ^
  "C:\\Users\\Dep-TI\\.gradle\\caches\\9.4.1\\transforms\\774ce6cefba37a55995ae7fa1fc810a1\\transformed\\kolibri-android-0.2.4\\prefab" ^
  "C:\\Users\\Dep-TI\\.gradle\\caches\\9.4.1\\transforms\\0cbab063a36c26b564561339905d9b51\\transformed\\hermes-android-260318099.0.4-debug\\prefab" ^
  "C:\\Users\\Dep-TI\\.gradle\\caches\\9.4.1\\transforms\\4241a742a9f29e3b722da69766c6c186\\transformed\\fbjni-0.7.0\\prefab"
