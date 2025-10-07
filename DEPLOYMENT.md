# راهنمای کامل Deploy - سامانه فروش Honor

## مرحله 1: Deploy Worker

### 1.1 نصب Wrangler CLI
```bash
npm install -g wrangler
```

### 1.2 لاگین به Cloudflare
```bash
wrangler login
```

### 1.3 Deploy Worker
```bash
cd honor-sales-app
npm install
wrangler deploy
```

## مرحله 2: راه‌اندازی D1 Database

### 2.1 اجرای Migration
```bash
wrangler d1 execute honor_sales_db --file=migrations/0001_initial_schema.sql
```

### 2.2 بررسی دیتابیس
```bash
wrangler d1 execute honor_sales_db --command="SELECT name FROM sqlite_master WHERE type='table';"
```

## مرحله 3: تست Worker

### 3.1 تست اصلی Worker
```bash
curl https://honor-sales-worker.m-pazhooohesh.workers.dev/
```

### 3.2 تست API Endpoint
```bash
curl -X POST https://honor-sales-worker.m-pazhooohesh.workers.dev/api/sales/register \
  -H "Content-Type: application/json" \
  -H "X-Seller-ID: seller-001" \
  -d '{
    "imei": "123456789012345",
    "phone_model": "Honor Magic6 Pro",
    "sale_date": "2024-10-08",
    "city": "تهران",
    "phone_number": "09123456789"
  }'
```

## مرحله 4: Deploy Frontend

### 4.1 در Cloudflare Dashboard:
1. برو به **Workers & Pages**
2. کلیک **Create Application**
3. انتخاب **Pages**
4. **Connect to Git** و انتخاب repository `honor-sales-frontend`
5. تنظیمات:
   - **Project name**: `honor-sales-frontend`
   - **Branch**: `main`
   - **Build command**: خالی بگذارید
   - **Build output**: خالی بگذارید

### 4.2 تنظیم Custom Domain (اختیاری)
اگر می‌خواهید domain شخصی استفاده کنید:
1. در Pages settings برو به **Custom domains**
2. کلیک **Set up a custom domain**
3. دامین موردنظر را وارد کنید

## مرحله 5: تنظیم Pages Routes (مهم جهت رفع مشکل)

برای رفع مشکل فعلی باید یکی از دو راه زیر را انجام دهید:

### راه اول: تغییر WORKER_BASE_URL در Frontend (آسان‌تر)
فعلاً کار می‌کند چون Frontend مستقیم با Worker API ارتباط برقرار می‌کند.

### راه دوم: تنظیم Pages Functions (Pages Routes)

1. **در Cloudflare Dashboard:**
   - برو به **Workers & Pages**
   - کلیک روی `honor-sales-frontend`
   - برو به **Settings**
   - برو به **Functions**

2. **Service Bindings:**
   - کلیک **Add binding**
   - **Variable name**: `SALES_WORKER`
   - **Service**: `honor-sales-worker`
   - **Environment**: `production`

3. **Routing:**
   فایل `_routes.json` قبلاً موجود و درست تنظیم شده.

## رفع عیب و بررسی مشکلات

### 1. بررسی Worker Logs
```bash
wrangler tail honor-sales-worker
```

### 2. بررسی D1 Database
```bash
# لیست جداول
wrangler d1 execute honor_sales_db --command=".tables"

# مشاهده رکوردها
wrangler d1 execute honor_sales_db --command="SELECT * FROM sales LIMIT 5;"
```

### 3. خطاهای متداول

#### خطا: "Route Not Found"
- مطمئن شوید Worker deploy شده
- URL را بررسی کنید

#### خطا: "Database error"
- Migration را اجرا کنید
- Binding دیتابیس را بررسی کنید

#### خطا: "CORS"
- CORS headers در Worker تنظیم شده
- بروزررسانی کنید

## لینک‌های مهم

- **Worker URL**: https://honor-sales-worker.m-pazhooohesh.workers.dev/
- **Pages URL**: https://honor-sales-frontend.pages.dev/
- **GitHub Workers Repo**: https://github.com/Farsimen/honor-sales-app
- **GitHub Frontend Repo**: https://github.com/Farsimen/honor-sales-frontend

## آخرین بروزرسانی
تاریخ: 8 اکتبر 2025