// فایل: src/index.ts (کد نهایی Worker)

import { IRequest, Router } from 'itty-router';

// تعریف Worker Environment - باید شامل Durable Object و D1 باشد
export interface Env {
    // Durable Object Binding - نام آن در Wrangler.toml شما IMEI_MANAGER است
    IMEI_MANAGER: DurableObjectNamespace; 
    honor_sales_db: D1Database; // D1 Database Binding
}

// کلاس Durable Object (فقط برای مدیریت حالت و قفل IMEI)
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
                // ... (کد پردازش داده و ثبت در D1)
                
                return new Response(JSON.stringify({ 
                    message: "Sale recorded and IMEI locked successfully",
                    saleId: "DO_SUCCESS_ID" 
                }), { 
                    status: 200,
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Access-Control-Allow-Origin': '*' 
                    }
                });

            } catch (e) {
                return new Response(JSON.stringify({ message: `Internal DO Error: ${e.message}` }), { status: 500 });
            }
        }
        return new Response(JSON.stringify({ message: "DO: Method Not Allowed" }), { status: 405 });
    }
}

// Worker اصلی که درخواست‌ها را از Front-end دریافت می‌کند
const router = Router();

// 1. مسیر ثبت فروش (POST)
router.post('/api/sales/register', async (request: IRequest, env: Env) => {
    // DO را فراخوانی کنید. نام binding در اینجا IMEI_MANAGER است (از wrangler.toml)
    const id = env.IMEI_MANAGER.idFromName("global-sales-manager");
    const stub = env.IMEI_MANAGER.get(id);
    
    // درخواست را به Durable Object ارسال کنید
    return stub.fetch(request);
});

// 2. مسیرهای GET (مشاهده داده‌ها و اکسپورت)
router.get('/api/sales/data', async (request: IRequest, env: Env) => {
    // ... منطق D1
    return new Response(JSON.stringify({ message: "Data endpoint - Implement D1 query here" }), { 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
});
// ... (مسیر /api/sales/export)
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
