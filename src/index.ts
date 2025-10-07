// فایل: src/index.ts (کد نهایی و کامل Worker)

import { IRequest, Router } from 'itty-router';

// تعریف Worker Environment - باید با BINDING های wrangler.toml مطابقت داشته باشد
export interface Env {
    IMEI_MANAGER: DurableObjectNamespace; // Durable Object Binding
    honor_sales_db: D1Database;          // D1 Database Binding
}

// کلاس Durable Object برای مدیریت حالت و قفل IMEI
export class IMEI_Manager {
    state: DurableObjectState;
    env: Env;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
    }
    
    // Durable Object برای POST ثبت فروش
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'POST') {
            try {
                const sellerId = request.headers.get('X-Seller-ID');
                const data: any = await request.json();
                
                if (!sellerId) {
                    return new Response(JSON.stringify({ message: "X-Seller-ID header is missing" }), { status: 401 });
                }
                
                // --- عملیات D1: ثبت فروش ---
                const statement = this.env.honor_sales_db.prepare(
                    "INSERT INTO sales (sellerId, imei, phone_model, sale_date, city, phone_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
                );

                const result = await statement.bind(
                    sellerId,
                    data.imei,
                    data.phone_model,
                    data.sale_date,
                    data.city || null,
                    data.phone_number || null,
                    new Date().toISOString()
                ).run();
                
                // --- پاسخ موفقیت آمیز ---
                return new Response(JSON.stringify({ 
                    message: "ثبت فروش با موفقیت انجام شد.",
                    saleId: result.meta.last_row_id 
                }), { 
                    status: 200,
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Access-Control-Allow-Origin': '*' // برای CORS
                    }
                });

            } catch (e) {
                return new Response(JSON.stringify({ message: `خطای سرور داخلی در ثبت: ${e.message}` }), { status: 500 });
            }
        }
        return new Response(JSON.stringify({ message: "DO: Method Not Allowed" }), { status: 405 });
    }
}

// Worker اصلی
const router = Router();

// 1. مسیر ثبت فروش (POST): هدایت به Durable Object
router.post('/api/sales/register', async (request: IRequest, env: Env) => {
    // ID ثابت برای هدایت تمام درخواست‌های ثبت به یک DO
    const id = env.IMEI_MANAGER.idFromName("global-sales-manager");
    const stub = env.IMEI_MANAGER.get(id);
    return stub.fetch(request);
});

// 2. مسیر مشاهده داده‌ها (JSON)
router.get('/api/sales/data', async (request: IRequest, env: Env) => {
    // --- عملیات D1: بازیابی داده‌ها ---
    const { results } = await env.honor_sales_db.prepare("SELECT * FROM sales ORDER BY created_at DESC LIMIT 100").all();
    
    return new Response(JSON.stringify(results), { 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
});

// 3. مسیر دانلود خروجی Excel (CSV) --- رفع مشکل دانلود ---
router.get('/api/sales/export', async (request: IRequest, env: Env) => {
    // --- عملیات D1: بازیابی داده‌ها ---
    const { results } = await env.honor_sales_db.prepare("SELECT * FROM sales ORDER BY created_at DESC").all();
    
    // تبدیل JSON به CSV
    let csv = "ID,Seller ID,IMEI,Model,Sale Date,City,Phone Number,Registration Date\n";
    results.forEach(row => {
        csv += `${row.id},${row.sellerId},${row.imei},${row.phone_model},${row.sale_date},${row.city || ''},${row.phone_number || ''},${row.created_at}\n`;
    });

    // تنظیم هدرهای مناسب برای دانلود (Content-Disposition)
    return new Response(csv, { 
        headers: { 
            'Content-Type': 'text/csv; charset=utf-8', 
            'Content-Disposition': 'attachment; filename="honor_sales_export.csv"',
            'Access-Control-Allow-Origin': '*'
        }
    });
});

// 4. مدیریت مسیرهای نامشخص
router.all('*', () => new Response(JSON.stringify({ message: "Route Not Found" }), { status: 404 }));


// تابع fetch اصلی Worker
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // پاسخ OPTIONS برای CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, X-Seller-ID',
                    'Access-Control-Max-Age': '86400',
                },
            });
        }
        return router.handle(request, env, ctx);
    },
    // تعریف Durable Object
    IMEI_Manager: IMEI_Manager,
};
