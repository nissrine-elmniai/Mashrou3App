# إرسال البريد (Resend + Edge Function)

البريد الحقيقي يمر عبر الدالة `send-app-email`.

## 1) حساب Resend
1. أنشئ حساباً على https://resend.com
2. أنشئ API Key
3. للاختبار: يمكنك الإرسال من `onboarding@resend.dev` **إلى بريد حسابك في Resend فقط**
4. للإنتاج: أضف وتحقق من نطاقك، ثم غيّر `FROM_EMAIL`

## 2) أسرار Supabase
في الطرفية (من جذر المشروع، بعد `npx supabase login` وربط المشروع):

```bash
npx supabase link --project-ref okqmyayjeiwzjkwlkmia
npx supabase secrets set RESEND_API_KEY=re_xxxxxxxx
npx supabase secrets set FROM_EMAIL="مهندس حامل لكتاب الله <onboarding@resend.dev>"
npx supabase functions deploy send-app-email
```

## 3) التطبيق
- `USE_MOCK_EMAIL=false` في `app/constants/email.js`
- يجب أن يكون المستخدم مسجّل دخول كـ admin عند القبول (الجلسة تُمرَّر للدالة)

## 4) اختبار
اقبل طلباً من لوحة الإدارة → يجب أن يصل البريد مع **رمز الدعوة**.
