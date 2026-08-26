# ابزار استقرار DESKA

فایل `index.html` یک کنترل‌پنل سبک برای اجرای دستی Workflow استقرار GitHub است.

## انتشار خودکار از لوکال

ابتدا فایل `deploy/config.example.json` را با نام `deploy/config.local.json` کپی و مقادیر غیرحساس را در آن تنظیم کنید. این فایل در `.gitignore` قرار دارد و ارسال نمی‌شود.

برای انتشار تغییرات لوکال، فایل زیر را اجرا کنید:

`deploy/publish-local.bat`

این فایل نسخهٔ patch را افزایش می‌دهد، تغییرات را commit و به شاخهٔ `main` در GitHub ارسال می‌کند و سپس صفحهٔ استقرار را باز می‌کند. اگر نمی‌خواهید نسخه افزایش پیدا کند:

`powershell -ExecutionPolicy Bypass -File .\deploy\publish-local.ps1 -NoVersionBump`

فایل `.env` هیچ‌وقت در commit قرار نمی‌گیرد. پس از باز شدن صفحه، Token را فقط برای اجرای Workflow وارد کنید.

رمز GitHub، کلید خصوصی SSH و رمز سرور را داخل این پوشه یا فایل تنظیمات قرار ندهید؛ این موارد باید در GitHub Secrets نگهداری شوند.

## استفاده از صفحه

1. فایل `index.html` را فقط روی کامپیوتر خودتان باز کنید یا روی یک مسیر خصوصی سرو کنید.
2. نام کاربری و Repository را بررسی کنید.
3. Token دارای دسترسی `actions:write` یا Token Classic دارای `repo` را فقط هنگام اجرا وارد کنید.
4. روی «اجرای به‌روزرسانی» بزنید.

صفحه Workflow `deploy.yml` را روی شاخهٔ `main` اجرا می‌کند. اطلاعات سرور در این صفحه صرفاً برای یادآوری است؛ اتصال واقعی با Secretهای GitHub انجام می‌شود:

- `GHCR_USERNAME`
- `GHCR_TOKEN`
- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_SSH_KEY`
- `DEPLOY_PATH`

Token و کلید SSH را در HTML، Repository یا چت ذخیره نکنید.
