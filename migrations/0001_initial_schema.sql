-- migrations/0001_initial_schema.sql

-- جدول اصلی برای ثبت هر تراکنش فروش
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL, -- اصلاح نام فیلد برای هماهنگی با کد
    imei TEXT UNIQUE NOT NULL, 
    phone_model TEXT NOT NULL,
    sale_date TEXT NOT NULL,
    city TEXT,
    phone_number TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ایجاد index برای بهبود کارایی
CREATE INDEX IF NOT EXISTS idx_sales_seller_id ON sales(seller_id);
CREATE INDEX IF NOT EXISTS idx_sales_imei ON sales(imei);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at DESC);

-- جدول فروشندگان برای مدیریت نقش‌ها و احراز هویت
CREATE TABLE IF NOT EXISTS sellers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'seller', -- نقش: seller, wholesaler, admin
    api_key TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
);

-- اضافه کردن فروشنده پیش‌فرض
INSERT OR IGNORE INTO sellers (id, name, role) VALUES 
('seller-001', 'فروشنده آزمایشی', 'seller');