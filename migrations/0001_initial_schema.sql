-- migrations/0001_initial_schema.sql

-- جدول اصلی برای ثبت هر تراکنش فروش
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    imei TEXT UNIQUE NOT NULL, 
    phone_model TEXT NOT NULL,
    sale_date TEXT NOT NULL,
    city TEXT,
    phone_number TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- جدول فروشندگان برای مدیریت نقش‌ها و احراز هویت
CREATE TABLE IF NOT EXISTS sellers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'seller', -- نقش: seller, wholesaler, admin
    api_key TEXT UNIQUE 
);
