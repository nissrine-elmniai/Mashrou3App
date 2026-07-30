// Page HTML publique : après verify Supabase, redirige vers l'app (deep link).
// Deploy: supabase functions deploy auth-redirect --no-verify-jwt
//
// Dans le dashboard Auth → URL Configuration :
// - Site URL = https://okqmyayjeiwzjkwlkmia.supabase.co/functions/v1/auth-redirect
// - Redirect URLs : ajouter la même URL + mashrou3app://reset-password

const APP_DEEP_LINK = "mashrou3app://reset-password";

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>إعادة تعيين كلمة المرور</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      background: #f6f7f4;
      color: #1a3a2a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      text-align: center;
    }
    .box { max-width: 360px; }
    h1 { font-size: 1.25rem; margin: 0 0 12px; }
    p { color: #4a5c52; line-height: 1.6; margin: 0 0 20px; }
    a.btn {
      display: inline-block;
      background: #1a6b4a;
      color: #fff;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 10px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="box">
    <h1>فتح التطبيق</h1>
    <p id="msg">جاري التحويل إلى التطبيق لإعادة تعيين كلمة المرور…</p>
    <a class="btn" id="open" href="${APP_DEEP_LINK}">فتح تطبيق مشروع</a>
  </div>
  <script>
    (function () {
      var search = window.location.search || "";
      var hash = window.location.hash || "";
      var target = "${APP_DEEP_LINK}" + search + hash;
      var link = document.getElementById("open");
      link.href = target;
      // Tentative automatique (mobile avec l'app installée)
      window.location.replace(target);
      setTimeout(function () {
        document.getElementById("msg").textContent =
          "إذا لم يفتح التطبيق، اضغط على الزر أدناه من هاتفك حيث التطبيق مثبت.";
      }, 1200);
    })();
  </script>
</body>
</html>`;

Deno.serve((_req) => {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});
