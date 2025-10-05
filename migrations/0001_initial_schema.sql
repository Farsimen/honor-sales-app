
-- migrations/0001_initial_schema.sql

CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    imei TEXT UNIQUE NOT NULL, 
    phone_model TEXT NOT NULL,
    sale_date TEXT NOT NULL,
    city TEXT,
    phone_number TEXT,
    invoice_url TEXT, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sellers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'seller',
    api_key TEXT UNIQUE 
);
