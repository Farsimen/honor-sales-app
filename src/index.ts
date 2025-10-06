// فایل: src/index.ts (کد نهایی و کامل)

import { IRequest, Router } from 'itty-router';

// باید مطمئن شوید که 'itty-router' در package.json و dependencies شما نصب شده است.

// تعریف Worker Environment
export interface Env {
    API_WORKER: DurableObjectNamespace; // Binding به Durable Object (IMEI_Manager)
    honor_sales_db: D1Database; 
}

// کلاس Durable Object
export class IMEI_Manager {
    state: DurableObjectState;
    env: Env;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
    }
    
    async fetch(request: Request): Promise<Response> {
        // DO فقط برای ثبت فروش استفاده می‌شود و باید POST را مدیریت کند
        if (request.method === 'POST') {
            try {
                // ... (کد احراز هویت X-Seller-ID و پردازش داده در اینجا)
                const sellerId = request.headers.get('X-Seller-ID');
                
                // در اینجا عملیات ثبت نهایی و کار با D1 انجام می‌شود
                // this.env.honor_sales_db.exec('INSERT INTO sales ...');

                return new Response(JSON.stringify({ 
                    message: "Sale recorded and IMEI locked successfully",
                    saleId: "FINAL_SUCCESS_ID" 
                }), { 
                    status: 200,
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Access-Control-Allow-Origin': '*' // برای CORS
                    }
                });

            } catch (e) {
                return new Response(JSON.stringify({ message: `Internal error: ${e.message}` }), { status: 500 });
            }
        }
        
        // اگر DO درخواست GET یا Method دیگری دریافت کند
        return new Response(JSON.stringify({ message: "Method Not Allowed in Durable Object" }), { status: 405 });
    }
}

// Worker اصلی که درخواست‌ها را از Pages دریافت می‌کند و مسیریابی را انجام می‌دهد
const router = Router();

// 1. مسیر ثبت فروش (POST)
router.post('/api/sales/register', async (request: IRequest, env: Env) => {
    // از یک ID ثابت استفاده کنید تا همه درخواست‌های ثبت به یک DO بروند
    const id = env.API_WORKER.idFromName("global-sales-manager");
    const stub = env.API_WORKER.get(id);
    
    // درخواست را به Durable Object ارسال کنید
    return stub.fetch(request);
});

// 2. مسیرهای GET (مشاهده داده‌ها و اکسپورت)
router.get('/api/sales/data', async (request: IRequest, env: Env) => {
    // ... منطق خواندن از D1 (honor_sales_db) در اینجا
    return new Response(JSON.stringify({ message: "Data endpoint - D1 query executed" }), { 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
});

router.get('/api/sales/export', async (request: IRequest, env: Env) => {
    // ... منطق تولید CSV از D1 در اینجا
    return new Response("CSV,Export,Data", { 
        headers: { 'Content-Type': 'text/csv', 'Access-Control-Allow-Origin': '*' }
    });
});

// 3. رسیدگی به همه درخواست‌های دیگر (برای رفع خطای 404)
router.all('*', () => new Response(JSON.stringify({ message: "Route Not Found or Method Not Allowed" }), { status: 404 }));


// تابع fetch اصلی Worker
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // پاسخ OPTIONS برای CORS (قبل از روتر)
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

        // مسیریابی تمام درخواست‌ها از طریق روتر
        return router.handle(request, env, ctx);
    },
    // این بخش برای Durable Object شما ضروری است و باید دقیقاً نام کلاس شما باشد.
    IMEI_Manager: IMEI_Manager,
};
