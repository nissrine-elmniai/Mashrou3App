import { I18nManager, Alert } from 'react-native';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 🔴 MUST run synchronously before any component/module imports below
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

const RTL_DONE_KEY = '@app_rtl_reload_done';

(async () => {
  if (I18nManager.isRTL) {
    console.log('[RTL] Native RTL already active:', I18nManager.isRTL);
    return;
  }
  try {
    const done = await AsyncStorage.getItem(RTL_DONE_KEY);
    if (done) {
      // Reload already attempted once on this device — forceRTL didn't
      // survive the JS reload because a native EAS build is required.
      Alert.alert(
        'إعادة التشغيل مطلوبة',
        'يلزم إعادة بناء التطبيق (EAS Build) لتفعيل الواجهة العربية (RTL). استخدم الواجهة كما هي أو راجع الدعم الفني.',
      );
      return;
    }
    await AsyncStorage.setItem(RTL_DONE_KEY, 'true');
    console.log('[RTL] forceRTL(true) set — reloading app...');
    await Updates.reloadAsync();
  } catch (e) {
    console.warn('[RTL] bootstrap error:', e);
  }
})();

console.log('isRTL:', I18nManager.isRTL);

const { registerRootComponent } = require('expo');
const App = require('./App').default;
registerRootComponent(App);
