# ابزار استقرار DESKA

## انتشار خودکار از لوکال

برای انتشار یک‌کلیکی، فایل `deploy/deploy.bat` را اجرا کنید. این فایل commit، push و اجرای Workflow را پشت‌سرهم انجام می‌دهد و Token را فقط به‌صورت مخفی در همان لحظه می‌گیرد.

ابتدا فایل `deploy/config.example.json` را با نام `deploy/config.local.json` کپی و مقادیر غیرحساس را در آن تنظیم کنید. این فایل در `.gitignore` قرار دارد و ارسال نمی‌شود.

اگر نمی‌خواهید نسخه افزایش پیدا کند، اجرای مستقیم اسکریپت با گزینهٔ زیر ممکن است:

`powershell -ExecutionPolicy Bypass -File .\deploy\publish-local.ps1 -NoVersionBump`

فایل `.env` هیچ‌وقت در commit قرار نمی‌گیرد. Token فقط هنگام اجرای `deploy.bat` به‌صورت مخفی دریافت می‌شود.

در ابتدای انتشار، مناسبت‌های سیستمی از پایگاه‌داده محلی export می‌شوند. اگر PostgreSQL محلی خاموش باشد ولی فایل معتبر `apps/api/prisma/system-observances.json` از اجرای قبلی موجود باشد، انتشار با همان snapshot ادامه پیدا می‌کند و یک هشدار نمایش داده می‌شود. برای ردکردن عمدی این مرحله نیز می‌توان `-SkipSystemExport` را به دستور PowerShell اضافه کرد.

رمز GitHub، کلید خصوصی SSH و رمز سرور را داخل این پوشه یا فایل تنظیمات قرار ندهید؛ این موارد باید در GitHub Secrets نگهداری شوند.

## پیکربندی یک‌باره

Workflow `deploy.yml` روی شاخهٔ `main` اجرا می‌شود. اتصال واقعی با Secretهای GitHub انجام می‌شود:

- `GHCR_USERNAME`
- `GHCR_TOKEN`
- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_SSH_KEY`
- `DEPLOY_PATH`

Token و کلید SSH را در Repository یا چت ذخیره نکنید.
