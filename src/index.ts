// src/index.ts
// این فایل شامل منطق ثبت فروش (POST)، دریافت داده (GET) و مدیریت CORS است.

// ۱. اعلامیه کلاس Durable Object (لازم برای لینک شدن)
export { IMEI_Manager } from './imei_manager'; 

// ۲. تعریف یکتای متغیرهای محیطی
export interface Env {
    DB: D1Database;
    IMEI_MANAGER: DurableObjectNamespace;
}

// ==========================================================
// توابع کمکی (Helper Functions)
// ==========================================================

// آدرس مبدا فرانت‌اند (Cloudflare Pages)
// این آدرس باید دقیقا همان آدرس pages.dev شما باشد
const FRONTEND_ORIGIN = 'https://honor-sales-app-frontend.pages.dev';

// تابع کمکی برای افزودن هدرهای CORS به هر پاسخ
const addCorsHeaders = (response: Response) => {
    // اجازه دسترسی فقط به فرانت‌اند ما
    response.headers.set('Access-Control-Allow-Origin', FRONTEND_ORIGIN); 
    // متدهایی که اجازه می دهیم
    response.headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    // هدرهایی که فرانت‌اند می تواند ارسال کند
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Seller-ID');
    return response;
};

// تابع کمکی برای تبدیل JSON به CSV
const jsonToCsv = (items) => {
    if (!items || items.length === 0) {
        return "";
    }
    
    // ۱. استخراج سرصفحه‌ها
    const header = Object.keys(items[0]).join(',');
    
    // ۲. تبدیل ردیف‌ها
    const rows = items.map(row => 
        Object.values(row).map(value => {
            // برای مقادیر دارای کاراکتر خاص، آن ها را داخل نقل قول می گذاریم
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(',')
    );
    
    // ترکیب سرصفحه و ردیف ها
    return [header, ...rows].join('\n');
};

// ==========================================================
// منطق اصلی Worker
// ==========================================================

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        
        // مدیریت درخواست OPTIONS (CORS Preflight Check)
        if (request.method === 'OPTIONS') {
            return addCorsHeaders(new Response(null, { status: 204 }));
        }

        // --- مسیر ۱: ثبت فروش (POST) ---
        if (request.method === 'POST' && url.pathname === '/api/sales/register') {
            
            // ۱. احراز هویت
            const sellerId = request.headers.get('X-Seller-ID'); 
            if (!sellerId) {
                const errorResponse = new Response(JSON.stringify({ message: 'Authentication Required: X-Seller-ID header missing' }), { status: 401 });
                return addCorsHeaders(errorResponse);
            }

            // ۲. دریافت و پارس کردن داده‌های JSON
            let data;
            try {
                data = await request.json();
            } catch (e) {
                const errorResponse = new Response(JSON.stringify({ message: "Invalid JSON format." }), { status: 400 });
                return addCorsHeaders(errorResponse);
            }
            
            const { imei, phone_model, sale_date, city, phone_number } = data;
            
            if (!imei || !phone_model || !sale_date) {
                 const errorResponse = new Response(JSON.stringify({ message: 'Missing required fields (imei, phone_model, sale_date).' }), { status: 400 });
                 return addCorsHeaders(errorResponse);
            }

            // ۳. جلوگیری از ثبت مکرر IMEI با Durable Object
            const imeiManagerId = env.IMEI_MANAGER.idFromName(sellerId);
            const imeiManagerStub = env.IMEI_MANAGER.get(imeiManagerId);
            
            const doResponse = await imeiManagerStub.fetch('https://do.example.com/check-and-lock', {
                method: 'POST',
                body: JSON.stringify({ imei }),
                headers: { 'Content-Type': 'application/json' },
            });

            if (doResponse.status === 409) {
                return addCorsHeaders(new Response(await doResponse.text(), { status: 409, headers: { 'Content-Type': 'application/json' } }));
            } else if (doResponse.status !== 200) {
                const errorResponse = new Response(JSON.stringify({ message: "Error communicating with IMEI manager." }), { status: 500 });
                return addCorsHeaders(errorResponse);
            }
            
            // ۴. ذخیره رکورد فروش در D1
            const saleId = crypto.randomUUID();
            const stmt = env.DB.prepare(
                `INSERT INTO sales (id, seller_id, imei, phone_model, sale_date, city, phone_number) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            );
            
            try {
                await env.DB.batch([
                    stmt.bind(saleId, sellerId, imei, phone_model, sale_date, city, phone_number)
                ]);
            } catch (d1Error) {
                 // Rollback: آزاد سازی IMEI
                 await imeiManagerStub.fetch('https://do.example.com/unlock', { method: 'POST', body: JSON.stringify({ imei }) });
                 const errorResponse = new Response(JSON.stringify({ message: "Failed to save sale data to D1. Rollback performed." }), { status: 500 });
                 return addCorsHeaders(errorResponse);
            }

            // ۵. پاسخ موفقیت آمیز
            const successResponse = new Response(JSON.stringify({ 
                success: true, 
                saleId, 
                message: "Sale recorded and IMEI locked successfully."
            }), { status: 201, headers: { 'Content-Type': 'application/json' } });
            
            return addCorsHeaders(successResponse);
        } 
        
        // --- مسیر ۲ و ۳: دریافت داده‌ها (GET) ---
        else if (request.method === 'GET' && (url.pathname === '/api/sales/data' || url.pathname === '/api/sales/export')) {
            
            // خواندن تمام داده‌ها
            const { results } = await env.DB.prepare("SELECT * FROM sales").all();
            
            if (url.pathname === '/api/sales/export') {
                // پاسخ CSV
                const csv = jsonToCsv(results); 
                const csvResponse = new Response(csv, {
                    headers: {
                        'Content-Type': 'text/csv',
                        'Content-Disposition': 'attachment; filename="honor_sales_export.csv"',
                    },
                });
                 return addCorsHeaders(csvResponse);
            }
            
            // پاسخ JSON
            const jsonResponse = new Response(JSON.stringify({ sales: results }), {
                headers: { 'Content-Type': 'application/json' },
            });
            return addCorsHeaders(jsonResponse);
        }
        
        // --- پاسخ پیش‌فرض: مسیر نامعتبر ---
        const defaultErrorResponse = new Response(JSON.stringify({ message: 'Not Found or Method Not Allowed' }), { status: 404 });
        return addCorsHeaders(defaultErrorResponse);
    },
};
