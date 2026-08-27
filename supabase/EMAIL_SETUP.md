# إرسال البريد إلى أي عنوان (SMTP)

Resend في وضع الاختبار لا يرسل إلا إلى بريد حسابك
(`lamyae.hamdaoui.23@ump.ac.ma`). لإرسال دعوات المشرفين لأي Gmail وغيره،
استخدم SMTP (Gmail أو Outlook UMP).

## 1) كلمة مرور التطبيق (Gmail)

1. فعّل التحقق بخطوتين على Google
2. أنشئ [App Password](https://myaccount.google.com/apppasswords)
3. انسخ الرمز من 16 حرفاً

إذا كان بريدك `...@ump.ac.ma` (Outlook):
- `SMTP_HOST=smtp.office365.com`
- `SMTP_PORT=587`
- نفس بريد UMP + كلمة المرور (أو كلمة مرور التطبيق إن طُلبت)

## 2) أسرار Supabase ثم النشر

من جذر المشروع:

```bash
npx supabase link --project-ref okqmyayjeiwzjkwlkmia

npx supabase secrets set SMTP_USER=ton.gmail@gmail.com
npx supabase secrets set SMTP_PASS="xxxx xxxx xxxx xxxx"

# UMP / Outlook فقط :
# npx supabase secrets set SMTP_HOST=smtp.office365.com
# npx supabase secrets set SMTP_PORT=587

npx supabase functions deploy send-app-email
npx supabase functions deploy send-password-reset --no-verify-jwt
```

## 3) التطبيق

- `USE_MOCK_EMAIL=false` في `app/constants/email.js`
- أعد إضافة المشرف: يجب أن يصل البريد لأي عنوان
