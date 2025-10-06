// فایل: src/index.ts (یا index.js)

// تعریف Worker Environment - حتماً باید با BINDING شما مطابقت داشته باشد.
export interface Env {
    // API_WORKER: Durable Object Binding
    API_WORKER: DurableObjectNamespace;
    // honor_sales_db: D1 Database Binding
    honor_sales_db: D1Database; 
}

// Durable Object class - برای مدیریت حالت و قفل IMEI
export class IMEI_Manager {
    state: DurableObjectState;
    env: Env;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
    }
    
    // متد اصلی برای مدیریت درخواست‌های Fetch
    async fetch(request: Request) {
        // این Worker/DO منطق API را اجرا می‌کند
        const url = new URL(request.url);

        // -- منطق اصلی API در اینجا قرار می‌گیرد --
        
        if (url.pathname.endsWith('/register') && request.method === 'POST') {
            try {
                const sellerId = request.headers.get('X-Seller-ID');
                const data = await request.json();
                
                if (!sellerId) {
                    return new Response(JSON.stringify({ message: "X-Seller-ID header is missing" }), { status: 401 });
                }
                
                // منطق قفل کردن IMEI توسط Durable Object (مثلاً با state.storage.put)
                // و ثبت در D1 (با استفاده از this.env.honor_sales_db)
                
                // فرض می‌کنیم عملیات موفق بوده است
                return new Response(JSON.stringify({ 
                    message: "Sale recorded and IMEI locked successfully",
                    saleId: "C72055162197" 
                }), { 
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (e) {
                return new Response(JSON.stringify({ message: `Invalid request body or internal error: ${e.message}` }), { status: 400 });
            }
        }
        
        // اگر مسیری پیدا نشد
        return new Response(JSON.stringify({ message: "Not Found or Method Not Allowed" }), { status: 404 });
    }
}

// Worker اصلی که درخواست‌ها را به Durable Object هدایت می‌کند
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        
        // مسیر API را از /api/sales/register به /sales/register (داخل Worker) تغییر دهید
        const imei = url.searchParams.get('imei') || 'default-imei'; // یا از یک هدر استخراج کنید
        
        // --- نکته مهم: فراخوانی Durable Object ---
        // ID را بر اساس یک مشخصه منحصر به فرد (مثلاً IMEI) بگیرید.
        const id = env.API_WORKER.idFromName(imei);
        
        // Durable Object را از ID بگیرید.
        const stub = env.API_WORKER.get(id);
        
        // درخواست را به Durable Object ارسال کنید.
        return stub.fetch(request);
    },
};
