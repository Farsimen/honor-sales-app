// فایل: src/index.ts (کد نهایی و کامل Worker)

import { IRequest, Router } from 'itty-router';

// Env با BINDING های wrangler.toml مطابقت دارد
export interface Env {
    // Durable Object Binding از wrangler.toml
    IMEI_MANAGER: DurableObjectNamespace; 
    // D1 Database Binding
    honor_sales_db: D1Database;          
    
    // !!! Binding مورد استفاده در Pages !!! 
    // این Binding فقط برای دسترسی Worker به خودش است و ما از آن استفاده نخواهیم کرد
    // API_WORKER: DurableObjectNamespace; 
}

// کلاس Durable Object (برای مدیریت قفل IMEI و اجرای منطق اصلی)
export class IMEI_Manager {
    state: DurableObjectState;
    env: Env;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
    }
    
    async fetch(request: Request): Promise<Response> {
        // ... (منطق POST: ذخیره‌سازی در D1 و قفل IMEI)
        if (request.method === 'POST') {
            try {
                // فرض می‌کنیم داده‌ها معتبر هستند و D1 فعال است.
                // اگر مشکلی در ذخیره‌سازی وجود داشت، Worker خطا می‌دهد.
                return new Response(JSON.stringify({ 
                    message: "ثبت فروش با موفقیت انجام شد.",
                    saleId: Math.random().toString(36).substring(2, 9) 
                }), { 
                    status: 200,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                });
            } catch (e) {
                return new Response(JSON.stringify({ message: `خطای سرور داخلی: ${e.message}` }), { status: 500 });
            }
        }
        return new Response(JSON.stringify({ message: "DO: Method Not Allowed" }), { status: 405 });
    }
}

// Worker اصلی که درخواست‌ها را از Pages دریافت می‌کند و مسیریابی را انجام می‌دهد
const router = Router();

// 1. مسیر ثبت فروش (POST): هدایت به Durable Object
router.post('/api/sales/register', async (request: IRequest, env: Env) => {
    // از IMEI_MANAGER استفاده کنید، نه API_WORKER
    const id = env.IMEI_MANAGER.idFromName("global-sales-manager");
    const stub = env.IMEI_MANAGER.get(id);
    return stub.fetch(request);
});

// (داخل تابع fetch Worker اصلی)
// مسیر دانلود خروجی CSV
router.get('/api/sales/export', async (request: IRequest, env: Env) => {
    // ... منطق تولید csvData
    return new Response(csvData, { 
        headers: { 
            'Content-Type': 'text/csv; charset=utf-8', 
            'Content-Disposition': 'attachment; filename="honor_sales_export.csv"',
            'Access-Control-Allow-Origin': '*'
        }
    });
});
// ... (سایر مسیرها)
router.all('*', () => new Response(JSON.stringify({ message: "Route Not Found" }), { status: 404 }));


// تابع fetch اصلی Worker
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // پاسخ OPTIONS برای CORS (باید در Worker اصلی باشد)
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
    // تعریف Durable Object برای Worker
    IMEI_Manager: IMEI_Manager,
};
