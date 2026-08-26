# صفحهٔ استقرار DESKA

فایل `index.html` یک کنترل‌پنل سبک برای اجرای دستی Workflow استقرار GitHub است.

## استفاده

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
