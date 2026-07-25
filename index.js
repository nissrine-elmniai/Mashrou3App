import { I18nManager, Alert } from 'react-native';
import * as Updates from 'expo-updates';

if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);

  // forceRTL requires a native restart to take effect at the layout level.
  // A Metro hot-reload is NOT enough — the native window must be recreated.
  if (Updates.reloadAsync) {
    setTimeout(() => {
      Updates.reloadAsync().catch(() => {
        Alert.alert(
          'إعادة التشغيل مطلوبة',
          'يرجى إعادة تشغيل التطبيق يدوياً لتفعيل الواجهة العربية (RTL)',
        );
      });
    }, 100);
  }
}

console.log('isRTL:', I18nManager.isRTL);

// 🔴 Use require() instead of import — ES module imports are hoisted and
// would load App (and its dependency rtl.js) BEFORE this code runs.
// With require(), the I18nManager config executes first, so rtl.js
// reads the correct I18nManager.isRTL value at module init time.
const { registerRootComponent } = require('expo');
const App = require('./App').default;

registerRootComponent(App);
